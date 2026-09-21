import request from "supertest";
import { createApp } from "../app";
import { Config, loadConfig } from "../config";
import { openDatabase, Db } from "../db";
import { Mail, Mailer } from "../auth/mailer";
import { hashPassword } from "../auth/passwords";
import { signAccessToken } from "../auth/tokens";
import { createInvite } from "../auth/invites";
import { OffProduct } from "../barcode/openFoodFacts";

/**
 * This is a multi-user app. Tests never talk to the API as "nobody" by
 * accident:
 *
 *   t.api        a client logged in as t.userId
 *   t.anonymous  a client with no credentials, for proving routes are locked
 *   t.as(id)     a client logged in as someone else
 *
 * Rules for tests:
 *  - assert against `t.userId`, never a literal id
 *  - use seedOtherUser() to prove one user's data is invisible to another
 */
export type Client = ReturnType<typeof request.agent>;

export interface TestContext {
  db: Db;
  config: Config;
  api: Client;
  anonymous: Client;
  as(userId: number): Client;
  userId: number;
  email: string;
  password: string;
  /** Every email the app tried to send, oldest first. */
  outbox: Mail[];
  invite(opts?: { note?: string; expiresInDays?: number }): string;
  /** The fake product database: barcode → product, null (unknown), or an Error to throw. Every call is recorded in offCalls. */
  off: Map<string, OffProduct | null | Error>;
  offCalls: string[];
}

export const PASSWORD = "correct horse battery";

// Real scrypt, toy cost: the code path is the production one, at ~1ms a hash.
export const testConfig = (overrides: Partial<Config> = {}): Config => ({
  ...loadConfig({ NODE_ENV: "test", JWT_SECRET: "test-secret-test-secret-test-secret-1234" }),
  scrypt: { N: 2 ** 4, r: 8, p: 1 },
  authRateLimit: null,
  barcodeRateLimit: null,
  passwordResetUrlTemplate: "app://reset?token={token}",
  ...overrides,
});

let userCounter = 0;

/** Insert a user directly. Fast, and independent of the register endpoint. */
export async function createUser(db: Db, config: Config, email?: string, password: string = PASSWORD) {
  const address = email ?? `user${++userCounter}@example.com`;
  const id = Number(
    db.prepare("INSERT INTO users (email, password_hash, name) VALUES (?, ?, 'Test User')")
      .run(address, await hashPassword(password, config.scrypt)).lastInsertRowid
  );
  return { id, email: address, password };
}

/**
 * A fresh app on a fresh in-memory database, with one user already logged in.
 * Call it in beforeEach so no test can see another test's rows.
 */
export async function makeTestContext(overrides: Partial<Config> = {}): Promise<TestContext> {
  const db = openDatabase(":memory:");
  const config = testConfig(overrides);
  const outbox: Mail[] = [];
  const mailer: Mailer = { send: async (mail) => { outbox.push(mail); } };
  const off = new Map<string, OffProduct | null | Error>();
  const offCalls: string[] = [];
  const lookupProduct = async (barcode: string) => {
    offCalls.push(barcode);
    const answer = off.get(barcode) ?? null;
    if (answer instanceof Error) throw answer;
    return answer;
  };
  const app = createApp(db, { config, mailer, lookupProduct });

  const user = await createUser(db, config);

  const as = (userId: number): Client => {
    const { token_version } = db.prepare("SELECT token_version FROM users WHERE id = ?").get(userId) as { token_version: number };
    const token = signAccessToken(userId, token_version, config.jwtSecret, config.accessTokenTtlSeconds);
    return request.agent(app).set("Authorization", `Bearer ${token}`);
  };

  return {
    db, config, outbox, as, off, offCalls,
    api: as(user.id),
    anonymous: request.agent(app),
    userId: user.id,
    email: user.email,
    password: user.password,
    invite: (opts) => createInvite(db, opts),
  };
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
export async function seedOtherUser(t: Pick<TestContext, "db" | "config">): Promise<OtherUser> {
  const { db } = t;
  const { id: userId } = await createUser(db, t.config, "other@example.com");
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
