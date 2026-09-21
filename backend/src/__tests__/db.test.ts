import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { openDatabase, migrate, loadMigrations, Migration } from "../db";

const tables = (db: Database.Database) =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')").all() as { name: string }[]).map((r) => r.name);

const ledger = (db: Database.Database) =>
  (db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as { version: number }[]).map((r) => r.version);

describe("openDatabase", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "nutrition-db-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("creates missing parent directories and the database file", () => {
    const file = path.join(dir, "nested", "data", "nutrition.db");
    openDatabase(file).close();
    expect(fs.existsSync(file)).toBe(true);
  });

  it("creates every table and view, and records every migration in the ledger", () => {
    const db = openDatabase(":memory:");
    expect(tables(db)).toEqual(expect.arrayContaining([
      "users", "food_logs", "exercise_logs", "weight_logs",
      "foods", "exercises", "meal_plans", "meal_plan_items",
      "invite_codes", "refresh_tokens", "password_reset_tokens", "schema_migrations",
      "v_daily_food_summary", "v_daily_exercise_summary", "v_full_day_summary",
    ]));
    expect(ledger(db)).toEqual(loadMigrations().map((m) => m.version));
    expect(tables(db)).not.toContain("custom_foods"); // folded into foods by 0003
    db.close();
  });

  it("a restart applies nothing new and keeps the data", () => {
    const file = path.join(dir, "nutrition.db");

    const first = openDatabase(file);
    first.prepare("INSERT INTO users (email, password_hash) VALUES ('a@example.com', 'x')").run();
    first.close();

    const second = openDatabase(file);
    expect(migrate(second)).toEqual([]);
    expect((second.prepare("SELECT COUNT(*) AS n FROM users").get() as any).n).toBe(1);
    second.close();
  });

  it("starts with no users at all: the single-user placeholder is gone", () => {
    const db = openDatabase(":memory:");
    expect((db.prepare("SELECT COUNT(*) AS n FROM users").get() as any).n).toBe(0);
    db.close();
  });
});

describe("multi-user guarantees in the schema", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = openDatabase(":memory:");
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES (7, 'a@example.com', 'x')").run();
  });
  afterEach(() => db.close());

  it.each([
    ["food_logs", "(date, meal, food_name, amount) VALUES ('2026-04-26', 'Lunch', 'X', '')"],
    ["exercise_logs", "(date, name, duration) VALUES ('2026-04-26', 'X', '')"],
    ["weight_logs", "(date, weight_lbs) VALUES ('2026-04-26', 130)"],
  ])("%s has no default owner: a row without user_id is refused", (table, rest) => {
    expect(() => db.prepare(`INSERT INTO ${table} ${rest}`).run()).toThrow(/NOT NULL constraint failed: .*user_id/);
  });

  it("a log cannot point at a user that does not exist", () => {
    expect(() =>
      db.prepare("INSERT INTO food_logs (user_id, date, meal, food_name, amount) VALUES (999, '2026-04-26', 'Lunch', 'X', '')").run()
    ).toThrow(/FOREIGN KEY/);
  });

  it("emails are unique regardless of case", () => {
    expect(() => db.prepare("INSERT INTO users (email, password_hash) VALUES ('A@Example.COM', 'x')").run()).toThrow(/UNIQUE/);
  });

  it("deleting a user removes everything they own", () => {
    db.prepare("INSERT INTO food_logs (user_id, date, meal, food_name, amount) VALUES (7, '2026-04-26', 'Lunch', 'X', '')").run();
    db.prepare("INSERT INTO exercise_logs (user_id, date, name, duration) VALUES (7, '2026-04-26', 'X', '')").run();
    db.prepare("INSERT INTO weight_logs (user_id, date, weight_lbs) VALUES (7, '2026-04-26', 130)").run();
    db.prepare("INSERT INTO foods (user_id, name) VALUES (7, 'My custom food')").run();
    db.prepare("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (7, 'h', 0)").run();
    db.prepare("INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (7, 'h', 0)").run();

    db.prepare("DELETE FROM users WHERE id = 7").run();

    for (const t of ["food_logs", "exercise_logs", "weight_logs", "refresh_tokens", "password_reset_tokens"]) {
      expect([t, (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as any).n]).toEqual([t, 0]);
    }
    // Their custom food goes; the built-in catalog is untouched.
    expect((db.prepare("SELECT COUNT(*) AS n FROM foods WHERE user_id IS NOT NULL").get() as any).n).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS n FROM foods WHERE user_id IS NULL").get() as any).n).toBeGreaterThan(100);
  });
});

describe("upgrading a database from the single-user app", () => {
  const [initial, ...rest] = loadMigrations();

  /** A database exactly as the original bundle created it: tables, no ledger. */
  function legacyDatabase(): Database.Database {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(initial.sql);
    return db;
  }

  it("keeps a used database's data, under an account nobody can log in to", () => {
    const db = legacyDatabase();
    db.prepare("INSERT INTO food_logs (date, meal, food_name, amount, cal) VALUES ('2026-04-26', 'Lunch', 'Avocado', '100 g', 160)").run();
    db.prepare("INSERT INTO exercise_logs (date, name, duration, cal) VALUES ('2026-04-26', 'Lagree', '45 min', 293)").run();
    db.prepare("INSERT INTO weight_logs (date, weight_lbs) VALUES ('2026-04-26', 133.2)").run();

    expect(migrate(db)).toEqual([initial.version, ...rest.map((m) => m.version)]);

    expect(db.prepare("SELECT id, email, password_hash FROM users").all()).toEqual([
      { id: 1, email: "legacy-user-1@invalid", password_hash: "!" },
    ]);
    expect(db.prepare("SELECT user_id, food_name, cal FROM food_logs").all()).toEqual([{ user_id: 1, food_name: "Avocado", cal: 160 }]);
    expect(db.prepare("SELECT net_cal FROM v_full_day_summary WHERE user_id = 1").get()).toEqual({ net_cal: -133 });
    expect((db.prepare("SELECT weight_lbs FROM weight_logs").get() as any).weight_lbs).toBe(133.2);
    expect(db.pragma("foreign_key_check")).toEqual([]);
    db.close();
  });

  it("drops the placeholder user from a database that was never used", () => {
    const db = legacyDatabase();
    migrate(db);
    expect((db.prepare("SELECT COUNT(*) AS n FROM users").get() as any).n).toBe(0);
    db.close();
  });

  it("carries over anything that was in the old custom_foods table", () => {
    const db = legacyDatabase();
    db.prepare("INSERT INTO custom_foods (name, cal_per_serving, protein, serving_size, serving_unit, barcode) VALUES ('Homemade granola', 210, 6, 50, 'g', '0123456789012')").run();
    migrate(db);
    expect(db.prepare("SELECT user_id, seed_key, name, cal, protein, default_serving, unit, category, barcode FROM foods WHERE user_id IS NOT NULL").all()).toEqual([
      { user_id: 1, seed_key: null, name: "Homemade granola", cal: 210, protein: 6, default_serving: 50, unit: "g", category: "Other", barcode: "0123456789012" },
    ]);
    db.close();
  });

  it("new ids continue after the old ones rather than reusing them", () => {
    const db = legacyDatabase();
    db.prepare("INSERT INTO food_logs (date, meal, food_name, amount) VALUES ('2026-04-26', 'Lunch', 'Old', '')").run();
    migrate(db);
    const { lastInsertRowid } = db.prepare("INSERT INTO food_logs (user_id, date, meal, food_name, amount) VALUES (1, '2026-04-26', 'Lunch', 'New', '')").run();
    expect(Number(lastInsertRowid)).toBe(2);
    db.close();
  });
});

describe("migrate", () => {
  const good: Migration = { version: 1, name: "0001_good", sql: "CREATE TABLE a (id INTEGER PRIMARY KEY);" };

  it("a failing migration changes nothing and is not recorded, and earlier ones stay applied", () => {
    const db = new Database(":memory:");
    const bad: Migration = { version: 2, name: "0002_bad", sql: "CREATE TABLE b (id INTEGER); INSERT INTO nowhere VALUES (1);" };

    expect(() => migrate(db, [good, bad])).toThrow(/nowhere/);

    expect(tables(db)).toContain("a");
    expect(tables(db)).not.toContain("b");
    expect(ledger(db)).toEqual([1]);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1); // switched back on after the failure
    db.close();
  });

  it("refuses a migration that leaves a dangling foreign key", () => {
    const db = new Database(":memory:");
    const dangling: Migration = {
      version: 2, name: "0002_dangling",
      sql: "CREATE TABLE p (id INTEGER PRIMARY KEY); CREATE TABLE c (p_id INTEGER REFERENCES p(id)); INSERT INTO c VALUES (42);",
    };
    expect(() => migrate(db, [good, dangling])).toThrow(/foreign key violation/);
    expect(tables(db)).not.toContain("c");
    db.close();
  });

  it("applies only what is pending, in version order", () => {
    const db = new Database(":memory:");
    const second: Migration = { version: 2, name: "0002_second", sql: "ALTER TABLE a ADD COLUMN note TEXT;" };
    expect(migrate(db, [good])).toEqual([1]);
    expect(migrate(db, [good, second])).toEqual([2]);
    expect(migrate(db, [good, second])).toEqual([]);
    db.close();
  });

  it("migration files are numbered without gaps or duplicates", () => {
    const versions = loadMigrations().map((m) => m.version);
    expect(versions).toEqual(versions.map((_, i) => i + 1));
  });
});
