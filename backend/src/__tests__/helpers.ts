import request from "supertest";
import { createApp } from "../app";
import { openDatabase, Db } from "../db";

/**
 * This is a multi-user app. Tests never talk to the API as "nobody" by
 * accident: `api` is a client acting as `userId`. Today there is no auth, so
 * that is simply the seeded user the routes are hardcoded to. When auth lands
 * (#3), makeTestContext() creates a user, mints a token, and sets it as a
 * default header on this agent — and no test file has to change.
 *
 * Rules for tests:
 *  - assert against `t.userId`, never a literal id
 *  - use seedOtherUser() to prove one user's data is invisible to another
 */
export interface TestContext {
  db: Db;
  /** Client acting as the current user. */
  api: ReturnType<typeof request.agent>;
  /** The user `api` acts as. */
  userId: number;
}

/**
 * A fresh app on a fresh in-memory database. Call it in beforeEach so no test
 * can see another test's rows.
 */
export function makeTestContext(): TestContext {
  const db = openDatabase(":memory:");
  const api = request.agent(createApp(db));
  // #3: create a user here, then api.set("Authorization", `Bearer ${token}`)
  return { db, api, userId: 1 };
}

export const DAY = "2026-04-26";

export function food(overrides: Record<string, unknown> = {}) {
  return {
    date: DAY,
    meal: "Lunch",
    food_name: "Avocado",
    amount: "100 g",
    cal: 160,
    protein: 2,
    carbs: 9,
    fat: 15,
    fiber: 6.7,
    ...overrides,
  };
}

export function exercise(overrides: Record<string, unknown> = {}) {
  return { date: DAY, name: "Lagree (Megaformer)", duration: "45 min", cal: 293, ...overrides };
}

export interface OtherUser {
  userId: number;
  foodId: number;
  exerciseId: number;
  weightId: number;
}

/**
 * A second user with one food, one exercise, and one weight entry on DAY,
 * written straight to the database. The numbers are deliberately huge so that
 * any leak into the current user's totals is unmissable.
 */
export function seedOtherUser(db: Db): OtherUser {
  const userId = Number(
    db.prepare("INSERT INTO users (name, email) VALUES ('Other User', 'other@example.com')").run().lastInsertRowid
  );
  const foodId = Number(
    db.prepare(
      `INSERT INTO food_logs (user_id, date, meal, food_name, amount, cal, protein, carbs, fat, fiber)
       VALUES (?, ?, 'Dinner', 'Not yours', '1', 9000, 900, 900, 900, 90)`
    ).run(userId, DAY).lastInsertRowid
  );
  const exerciseId = Number(
    db.prepare("INSERT INTO exercise_logs (user_id, date, name, duration, cal) VALUES (?, ?, 'Not yours', '1 min', 5000)")
      .run(userId, DAY).lastInsertRowid
  );
  const weightId = Number(
    db.prepare("INSERT INTO weight_logs (user_id, date, weight_lbs) VALUES (?, ?, 250)").run(userId, DAY).lastInsertRowid
  );
  return { userId, foodId, exerciseId, weightId };
}
