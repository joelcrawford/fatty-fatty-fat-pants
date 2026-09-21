import fs from "fs";
import os from "os";
import path from "path";
import { openDatabase } from "../db";

describe("openDatabase", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "nutrition-db-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("creates missing parent directories and the database file", () => {
    const file = path.join(dir, "nested", "data", "nutrition.db");
    openDatabase(file).close();
    expect(fs.existsSync(file)).toBe(true);
  });

  it("is safe to run against an existing database: data survives and nothing is duplicated", () => {
    const file = path.join(dir, "nutrition.db");

    const first = openDatabase(file);
    first.prepare("INSERT INTO food_logs (date, meal, food_name, amount) VALUES ('2026-04-26', 'Lunch', 'Avocado', '')").run();
    first.close();

    const second = openDatabase(file); // server restart
    expect((second.prepare("SELECT COUNT(*) AS n FROM food_logs").get() as any).n).toBe(1);
    expect((second.prepare("SELECT COUNT(*) AS n FROM users").get() as any).n).toBe(1);
    second.close();
  });

  it("creates every table and view the schema promises", () => {
    const db = openDatabase(":memory:");
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')").all() as { name: string }[])
      .map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining([
      "users", "food_logs", "exercise_logs", "weight_logs", "custom_foods",
      "v_daily_food_summary", "v_daily_exercise_summary", "v_full_day_summary",
    ]));
    db.close();
  });

  it("enforces foreign keys, so a log cannot point at a user that does not exist", () => {
    const db = openDatabase(":memory:");
    expect(() =>
      db.prepare("INSERT INTO food_logs (user_id, date, meal, food_name, amount) VALUES (999, '2026-04-26', 'Lunch', 'X', '')").run()
    ).toThrow(/FOREIGN KEY/);
    db.close();
  });
});
