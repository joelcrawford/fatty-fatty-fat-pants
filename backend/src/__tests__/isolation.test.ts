/**
 * Multi-user isolation.
 *
 * Every endpoint is exercised as the current user while a second user has
 * data on the same date. Nothing of theirs may be readable, countable, or
 * deletable. These tests must stay green, unchanged, when auth lands (#3):
 * the only difference then is how `t.api` proves who it is.
 */
import { makeTestContext, TestContext, seedOtherUser, OtherUser, food, exercise, DAY } from "./helpers";

let t: TestContext;
let other: OtherUser;
beforeEach(() => {
  t = makeTestContext();
  other = seedOtherUser(t.db);
});
afterEach(() => { t.db.close(); });

const count = (table: string, userId: number) =>
  (t.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(userId) as { n: number }).n;

describe("reads never include another user's rows", () => {
  it("food log", async () => {
    const { body } = await t.api.get(`/api/food/${DAY}`);
    expect(body.data).toEqual([]);
  });

  it("exercise log", async () => {
    const { body } = await t.api.get(`/api/exercise/${DAY}`);
    expect(body.data).toEqual([]);
  });

  it("weight log", async () => {
    const { body } = await t.api.get("/api/summary/weight");
    expect(body.data).toEqual([]);
  });

  it("day summary totals", async () => {
    await t.api.post("/api/food").send(food({ cal: 160 }));
    await t.api.post("/api/exercise").send(exercise({ cal: 60 }));
    const { body } = await t.api.get(`/api/summary/day/${DAY}`);
    expect(body.data).toMatchObject({ total_cal: 160, exercise_cal: 60, net_cal: 100 });
  });

  it("range summary: their day does not appear, and their exercise is not netted against my food", async () => {
    const empty = await t.api.get(`/api/summary/range?start=${DAY}&end=${DAY}`);
    expect(empty.body.data).toEqual([]);

    await t.api.post("/api/food").send(food({ cal: 160 }));
    const mine = await t.api.get(`/api/summary/range?start=${DAY}&end=${DAY}`);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0]).toMatchObject({ total_cal: 160, exercise_cal: 0, net_cal: 160 });
  });
});

describe("writes never touch another user's rows", () => {
  it("deleting their food entry by id is a 404 and leaves it in place", async () => {
    const res = await t.api.delete(`/api/food/${other.foodId}`);
    expect(res.status).toBe(404); // 404 rather than 403, so ids cannot be probed
    expect(count("food_logs", other.userId)).toBe(1);
  });

  it("deleting their exercise entry by id is a 404 and leaves it in place", async () => {
    const res = await t.api.delete(`/api/exercise/${other.exerciseId}`);
    expect(res.status).toBe(404);
    expect(count("exercise_logs", other.userId)).toBe(1);
  });

  it("new entries are owned by the current user", async () => {
    await t.api.post("/api/food").send(food());
    await t.api.post("/api/food/batch").send([food(), food()]);
    await t.api.post("/api/exercise").send(exercise());
    expect(count("food_logs", t.userId)).toBe(3);
    expect(count("exercise_logs", t.userId)).toBe(1);
    expect(count("food_logs", other.userId)).toBe(1);
    expect(count("exercise_logs", other.userId)).toBe(1);
  });

  it("a client cannot choose the owner by sending user_id in the body", async () => {
    const res = await t.api.post("/api/food").send(food({ user_id: other.userId }));
    expect(res.body.data.user_id).toBe(t.userId);
    expect(count("food_logs", other.userId)).toBe(1);
  });

  it("two users can each log a weight on the same date", async () => {
    // other already has a weight on DAY; uniqueness is per (user, date)
    const res = await t.api.post("/api/summary/weight").send({ date: DAY, weight_lbs: 133.2 });
    expect(res.status).toBe(201);
    expect(count("weight_logs", t.userId)).toBe(1);
    expect(count("weight_logs", other.userId)).toBe(1);

    const { body } = await t.api.get("/api/summary/weight");
    expect(body.data.map((w: any) => w.weight_lbs)).toEqual([133.2]);
  });
});
