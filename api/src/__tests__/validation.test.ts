/**
 * Request validation. The rule under test everywhere: a bad request gets a 400
 * in the standard envelope, names the offending field, and NEVER reaches the
 * database.
 */
import { makeTestContext, TestContext, food, exercise, DAY } from "./helpers";

let t: TestContext;
beforeEach(async () => { t = await makeTestContext(); });
afterEach(() => { t.db.close(); });

const rows = (table: string) => (t.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe("error shape", () => {
  it("is the standard envelope plus per-field details", async () => {
    const res = await t.api.post("/api/food").send(food({ meal: "Brunch", cal: -5 }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "meal: must be one of: Breakfast, Lunch, Dinner, Snacks; cal: cannot be negative",
      details: [
        { path: "meal", message: "must be one of: Breakfast, Lunch, Dinner, Snacks" },
        { path: "cal", message: "cannot be negative" },
      ],
    });
  });

  it("reports every problem at once, not just the first", async () => {
    const res = await t.api.post("/api/food").send({});
    expect(res.body.details.map((d: any) => d.path).sort()).toEqual(["date", "food_name", "meal"]);
  });
});

describe("dates", () => {
  it.each([
    ["26-04-2026", "wrong order"],
    ["2026-4-6", "not zero padded"],
    ["2026-02-30", "not a real day"],
    ["2026-13-01", "month 13"],
    ["2025-02-29", "not a leap year"],
    ["today", "a word"],
    ["2026-04-26T10:00:00Z", "a timestamp"],
  ])("rejects %s (%s) in a path", async (bad) => {
    for (const url of [`/api/food/${bad}`, `/api/exercise/${bad}`, `/api/summary/day/${bad}`]) {
      const res = await t.api.get(url);
      expect([url, res.status]).toEqual([url, 400]);
      expect(res.body.details[0].path).toBe("date");
    }
  });

  it("rejects a bad date in a body", async () => {
    const res = await t.api.post("/api/food").send(food({ date: "2026-02-30" }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("date: is not a real calendar date");
  });

  it("accepts a leap day in a leap year", async () => {
    const res = await t.api.post("/api/food").send(food({ date: "2024-02-29" }));
    expect(res.status).toBe(201);
  });
});

describe("food entries", () => {
  it.each([
    ["cal", -1, "cannot be negative"],
    ["cal", 10_001, "cannot be more than 10000"],
    ["protein", "30", "must be a number"],
    ["carbs", null, "must be a number"],
    ["fat", 2_001, "cannot be more than 2000"],
    ["fiber", -0.1, "cannot be negative"],
    ["food_name", "", "cannot be empty"],
    ["food_name", "   ", "cannot be empty"],
    ["food_name", "x".repeat(201), "cannot be longer than 200 characters"],
    ["food_name", 42, "must be a string"],
    ["amount", "x".repeat(51), "cannot be longer than 50 characters"],
    ["meal", "lunch", "must be one of: Breakfast, Lunch, Dinner, Snacks"],
  ])("rejects %s = %j", async (field, value, message) => {
    const res = await t.api.post("/api/food").send(food({ [field]: value }));
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ path: field, message }]);
    expect(rows("food_logs")).toBe(0);
  });

  it("rejects NaN and Infinity, which JSON turns into null", async () => {
    const res = await t.api.post("/api/food").set("Content-Type", "application/json").send('{"date":"2026-04-26","meal":"Lunch","food_name":"X","cal":1e999}');
    expect(res.status).toBe(400);
    expect(rows("food_logs")).toBe(0);
  });

  it("trims names and strips unknown keys before storing", async () => {
    const res = await t.api.post("/api/food").send(food({ food_name: "  Avocado  ", hacker: "<script>", id: 999, created_at: "1999-01-01" }));
    expect(res.status).toBe(201);
    expect(res.body.data.food_name).toBe("Avocado");
    expect(res.body.data.id).not.toBe(999);
    expect(res.body.data.created_at).not.toBe("1999-01-01");
    expect(res.body.data).not.toHaveProperty("hacker");
  });

  it("rejects a non-object body", async () => {
    const res = await t.api.post("/api/food").send([food()]);
    expect(res.status).toBe(400);
    expect(rows("food_logs")).toBe(0);
  });
});

describe("exercise entries", () => {
  it.each([
    ["cal", -1, "cannot be negative"],
    ["cal", "293", "must be a number"],
    ["name", "", "cannot be empty"],
    ["duration", 45, "must be a string"],
  ])("rejects %s = %j", async (field, value, message) => {
    const res = await t.api.post("/api/exercise").send(exercise({ [field]: value }));
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ path: field, message }]);
    expect(rows("exercise_logs")).toBe(0);
  });
});

describe("weight entries", () => {
  it.each([
    [0, "must be greater than 0"],
    [-130, "must be greater than 0"],
    [1_501, "cannot be more than 1500"],
    ["133", "must be a number"],
  ])("rejects weight_lbs = %j", async (value, message) => {
    const res = await t.api.post("/api/summary/weight").send({ date: DAY, weight_lbs: value });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ path: "weight_lbs", message }]);
    expect(rows("weight_logs")).toBe(0);
  });

  it("rejects notes longer than 500 characters", async () => {
    const res = await t.api.post("/api/summary/weight").send({ date: DAY, weight_lbs: 133, notes: "x".repeat(501) });
    expect(res.status).toBe(400);
  });
});

describe("ids", () => {
  it.each(["abc", "0", "-1", "1.5", "1e3x"])("DELETE with id '%s' is a 400, not a 404 or a 500", async (id) => {
    for (const url of [`/api/food/${id}`, `/api/exercise/${id}`]) {
      const res = await t.api.delete(url);
      expect([url, res.status]).toEqual([url, 400]);
      expect(res.body.details[0].path).toBe("id");
    }
  });

  it("a well-formed id that does not exist is still a 404", async () => {
    expect((await t.api.delete("/api/food/12345")).status).toBe(404);
  });
});
