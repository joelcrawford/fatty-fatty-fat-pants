import { makeTestContext, TestContext, food, DAY } from "./helpers";

let t: TestContext;
beforeEach(() => { t = makeTestContext(); });
afterEach(() => { t.db.close(); });

const rowCount = () => (t.db.prepare("SELECT COUNT(*) AS n FROM food_logs").get() as { n: number }).n;

describe("GET /api/food/:date", () => {
  it("returns an empty array, not a 404, for a day with nothing logged", async () => {
    const res = await t.api.get(`/api/food/${DAY}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [] });
  });

  it("returns only that date's entries, oldest first", async () => {
    await t.api.post("/api/food").send(food({ food_name: "First" }));
    await t.api.post("/api/food").send(food({ food_name: "Second" }));
    await t.api.post("/api/food").send(food({ food_name: "Other day", date: "2026-04-25" }));

    const res = await t.api.get(`/api/food/${DAY}`);
    expect(res.body.data.map((e: any) => e.food_name)).toEqual(["First", "Second"]);
  });
});

describe("POST /api/food", () => {
  it("creates an entry and returns the stored row", async () => {
    const res = await t.api.post("/api/food").send(food());
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ ...food(), user_id: t.userId });
    expect(res.body.data.id).toEqual(expect.any(Number));
    expect(res.body.data.created_at).toEqual(expect.any(String));
  });

  it("defaults omitted macros to 0 and amount to an empty string", async () => {
    const res = await t.api.post("/api/food").send({ date: DAY, meal: "Snacks", food_name: "Mystery" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ amount: "", cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  });

  it.each(["date", "meal", "food_name"])("rejects a body missing %s with 400", async (field) => {
    const body: Record<string, unknown> = food();
    delete body[field];
    const res = await t.api.post("/api/food").send(body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.details.map((d: any) => d.path)).toEqual([field]);
    expect(rowCount()).toBe(0);
  });

  it("refuses a meal outside Breakfast/Lunch/Dinner/Snacks with 400 and stores nothing", async () => {
    const res = await t.api.post("/api/food").send(food({ meal: "Brunch" }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("meal: must be one of: Breakfast, Lunch, Dinner, Snacks");
    expect(rowCount()).toBe(0);
  });
});

describe("POST /api/food/batch", () => {
  it("inserts every entry and returns them all", async () => {
    const res = await t.api.post("/api/food/batch").send([
      food({ food_name: "Salmon (cooked)" }),
      food({ food_name: "Spinach (raw)" }),
      food({ food_name: "Olive Oil" }),
    ]);
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(3);
    expect(new Set(res.body.data.map((e: any) => e.id)).size).toBe(3);
    expect(rowCount()).toBe(3);
  });

  it.each([
    [[], "Expected at least one food entry"],
    [{ not: "an array" }, "Expected an array of food entries"],
  ])("rejects %j with 400", async (body, message) => {
    const res = await t.api.post("/api/food/batch").send(body as object);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(message);
  });

  it("rejects more than 50 entries", async () => {
    const res = await t.api.post("/api/food/batch").send(Array.from({ length: 51 }, () => food()));
    expect(res.status).toBe(400);
    expect(rowCount()).toBe(0);
  });

  it("is atomic: one bad entry means none are stored", async () => {
    const res = await t.api.post("/api/food/batch").send([
      food({ food_name: "Good one" }),
      food({ food_name: "Bad one", meal: "Brunch" }),
    ]);
    expect(res.status).toBe(400);
    // The path names the offending entry by index so a client can point at it.
    expect(res.body.details).toEqual([{ path: "1.meal", message: "must be one of: Breakfast, Lunch, Dinner, Snacks" }]);
    expect(rowCount()).toBe(0);
  });
});

describe("DELETE /api/food/:id", () => {
  it("deletes the entry and reports its id", async () => {
    const { body } = await t.api.post("/api/food").send(food());
    const res = await t.api.delete(`/api/food/${body.data.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { deleted_id: body.data.id } });
    expect(rowCount()).toBe(0);
  });

  it("returns 404 for an id that does not exist", async () => {
    const res = await t.api.delete("/api/food/9999");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Entry not found" });
  });
});
