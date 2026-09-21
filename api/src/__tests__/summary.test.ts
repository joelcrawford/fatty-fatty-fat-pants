import { makeTestContext, TestContext, food, exercise, DAY } from "./helpers";

let t: TestContext;
beforeEach(async () => { t = await makeTestContext(); });
afterEach(() => { t.db.close(); });

describe("GET /api/summary/day/:date", () => {
  it("returns all zeros for an empty day", async () => {
    const res = await t.api.get(`/api/summary/day/${DAY}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      date: DAY, total_cal: 0, total_protein: 0, total_carbs: 0, total_fat: 0,
      total_fiber: 0, net_carbs: 0, exercise_cal: 0, net_cal: 0,
    });
  });

  it("sums food, subtracts fibre for net carbs, and subtracts exercise for net calories", async () => {
    await t.api.post("/api/food").send(food({ cal: 250, protein: 24, carbs: 0, fat: 15.6, fiber: 0 }));
    await t.api.post("/api/food").send(food({ cal: 128, protein: 1.6, carbs: 7.2, fat: 12, fiber: 5.4 }));
    await t.api.post("/api/exercise").send(exercise({ cal: 293 }));

    const { body } = await t.api.get(`/api/summary/day/${DAY}`);
    expect(body.data).toEqual({
      date: DAY,
      total_cal: 378,
      total_protein: 25.6,
      total_carbs: 7.2,
      total_fat: 27.6,
      total_fiber: 5.4,
      net_carbs: 1.8,      // 7.2 − 5.4
      exercise_cal: 293,
      net_cal: 85,         // 378 − 293
    });
  });

  it("never reports negative net carbs when fibre exceeds carbs", async () => {
    await t.api.post("/api/food").send(food({ carbs: 3, fiber: 10 }));
    const { body } = await t.api.get(`/api/summary/day/${DAY}`);
    expect(body.data.net_carbs).toBe(0);
  });

  it("lets net calories go negative when exercise exceeds food", async () => {
    await t.api.post("/api/food").send(food({ cal: 100 }));
    await t.api.post("/api/exercise").send(exercise({ cal: 293 }));
    const { body } = await t.api.get(`/api/summary/day/${DAY}`);
    expect(body.data.net_cal).toBe(-193);
  });

  it("rounds macros to one decimal and calories to whole numbers", async () => {
    await t.api.post("/api/food").send(food({ cal: 100.4, protein: 1.04, carbs: 0, fat: 0, fiber: 0 }));
    await t.api.post("/api/food").send(food({ cal: 100.4, protein: 1.04, carbs: 0, fat: 0, fiber: 0 }));
    const { body } = await t.api.get(`/api/summary/day/${DAY}`);
    expect(body.data.total_cal).toBe(201);
    expect(body.data.total_protein).toBe(2.1);
  });

  it("agrees with the v_full_day_summary view", async () => {
    await t.api.post("/api/food").send(food());
    await t.api.post("/api/food").send(food({ food_name: "Salmon (cooked)", cal: 208, protein: 20, carbs: 0, fat: 13, fiber: 0 }));
    await t.api.post("/api/exercise").send(exercise());

    const { body } = await t.api.get(`/api/summary/day/${DAY}`);
    const view = t.db.prepare("SELECT * FROM v_full_day_summary WHERE user_id = ? AND date = ?").get(t.userId, DAY) as any;

    expect(view.total_cal).toBe(body.data.total_cal);
    expect(view.total_protein).toBe(body.data.total_protein);
    expect(view.net_carbs).toBe(body.data.net_carbs);
    expect(view.exercise_cal).toBe(body.data.exercise_cal);
    expect(view.net_cal).toBe(body.data.net_cal);
  });
});

describe("GET /api/summary/range", () => {
  it.each([
    ["", ["start", "end"]],
    ["?start=2026-04-01", ["end"]],
    ["?end=2026-04-30", ["start"]],
  ])("rejects '%s' with 400, naming what is missing", async (qs, missing) => {
    const res = await t.api.get(`/api/summary/range${qs}`);
    expect(res.status).toBe(400);
    expect(res.body.details.map((d: any) => d.path)).toEqual(missing);
  });

  it("rejects a range that runs backwards", async () => {
    const res = await t.api.get("/api/summary/range?start=2026-04-30&end=2026-04-01");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("start: must not be after end");
  });

  it("allows a full leap year but nothing longer", async () => {
    const ok = await t.api.get("/api/summary/range?start=2024-01-01&end=2024-12-31");
    expect(ok.status).toBe(200);
    const tooLong = await t.api.get("/api/summary/range?start=2024-01-01&end=2025-01-01");
    expect(tooLong.status).toBe(400);
  });

  it("returns one summary per day with food, newest first, inside the range only", async () => {
    await t.api.post("/api/food").send(food({ date: "2026-04-24", cal: 100 }));
    await t.api.post("/api/food").send(food({ date: "2026-04-26", cal: 300 }));
    await t.api.post("/api/food").send(food({ date: "2026-04-25", cal: 200 }));
    await t.api.post("/api/food").send(food({ date: "2026-03-01", cal: 999 })); // outside
    await t.api.post("/api/exercise").send(exercise({ date: "2026-04-25", cal: 50 }));

    const { body } = await t.api.get("/api/summary/range?start=2026-04-01&end=2026-04-30");
    expect(body.data.map((d: any) => [d.date, d.total_cal, d.exercise_cal, d.net_cal])).toEqual([
      ["2026-04-26", 300, 0, 300],
      ["2026-04-25", 200, 50, 150],
      ["2026-04-24", 100, 0, 100],
    ]);
  });

  it("includes both boundary dates", async () => {
    await t.api.post("/api/food").send(food({ date: "2026-04-01" }));
    await t.api.post("/api/food").send(food({ date: "2026-04-30" }));
    const { body } = await t.api.get("/api/summary/range?start=2026-04-01&end=2026-04-30");
    expect(body.data).toHaveLength(2);
  });

  it("omits days that have exercise but no food (documented behaviour)", async () => {
    await t.api.post("/api/exercise").send(exercise());
    const { body } = await t.api.get(`/api/summary/range?start=${DAY}&end=${DAY}`);
    expect(body.data).toEqual([]);
  });
});

describe("weight log", () => {
  it("stores an entry with optional notes and lists it back", async () => {
    const created = await t.api.post("/api/summary/weight").send({ date: DAY, weight_lbs: 133.2, notes: "After Lagree" });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ date: DAY, weight_lbs: 133.2, notes: "After Lagree" });

    const { body } = await t.api.get("/api/summary/weight");
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ user_id: t.userId, date: DAY, weight_lbs: 133.2, notes: "After Lagree" });
  });

  it.each([
    [{ weight_lbs: 133 }, "date"],
    [{ date: DAY }, "weight_lbs"],
  ])("rejects %j with 400", async (bodyIn, missing) => {
    const res = await t.api.post("/api/summary/weight").send(bodyIn);
    expect(res.status).toBe(400);
    expect(res.body.details.map((d: any) => d.path)).toEqual([missing]);
  });

  it("weighing in again on the same day replaces that day's entry, and says so", async () => {
    const first = await t.api.post("/api/summary/weight").send({ date: DAY, weight_lbs: 133.2, notes: "morning" });
    expect(first.status).toBe(201);

    const second = await t.api.post("/api/summary/weight").send({ date: DAY, weight_lbs: 132.8 });
    expect(second.status).toBe(200); // replaced, not created
    expect(second.body.data).toMatchObject({ id: first.body.data.id, weight_lbs: 132.8, notes: null });

    const { body } = await t.api.get("/api/summary/weight");
    expect(body.data).toHaveLength(1);
    expect(body.data[0].weight_lbs).toBe(132.8);
  });

  it("returns the row as stored, never an echo of the request", async () => {
    const res = await t.api.post("/api/summary/weight").send({ date: DAY, weight_lbs: 133.2, notes: "  padded  ", junk: true });
    expect(res.body.data).toMatchObject({ user_id: t.userId, notes: "padded" });
    expect(res.body.data).not.toHaveProperty("junk");
    expect(res.body.data.created_at).toEqual(expect.any(String));
  });

  it.each(["0", "366", "abc", "1.5"])("rejects ?days=%s with 400", async (days) => {
    const res = await t.api.get(`/api/summary/weight?days=${days}`);
    expect(res.status).toBe(400);
  });

  it("returns newest first and honours ?days as a row limit, defaulting to 30", async () => {
    for (let d = 1; d <= 31; d++) {
      await t.api.post("/api/summary/weight").send({ date: `2026-03-${String(d).padStart(2, "0")}`, weight_lbs: 130 + d / 10 });
    }
    const limited = await t.api.get("/api/summary/weight?days=2");
    expect(limited.body.data.map((w: any) => w.date)).toEqual(["2026-03-31", "2026-03-30"]);

    const defaulted = await t.api.get("/api/summary/weight");
    expect(defaulted.body.data).toHaveLength(30);
  });
});
