import Database from "better-sqlite3";
import { migrate, openDatabase } from "../db";
import { seedCatalog, loadCatalogSeed, CatalogSeed } from "../db/seed";

const n = (db: Database.Database, sql: string) => (db.prepare(sql).get() as { n: number }).n;

function emptyMigrated(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

const tiny = (overrides: Partial<CatalogSeed> = {}): CatalogSeed => ({
  reference_weight_kg: 60.8,
  foods: [
    { seed_key: "food-001", name: "Avocado", category: "Vegetables", unit: "g", default_serving: 100, cal: 160, protein: 2, carbs: 9, fat: 15, fiber: 6.7 },
    { seed_key: "food-002", name: "Olive Oil", category: "Fats", unit: "tbsp", default_serving: 1, cal: 119, protein: 0, carbs: 0, fat: 13.5, fiber: 0 },
  ],
  exercises: [{ seed_key: "exercise-yoga", name: "Yoga", met: 2.632 }],
  meal_plans: [{ seed_key: "plan-001", name: "Avocado Toastless", meal_type: "Lunch", badge: "Quick", description: "", items: [{ food: "food-001", serving_amount: 80 }, { food: "food-002", serving_amount: 1 }] }],
  ...overrides,
});

describe("the shipped catalog", () => {
  const seed = loadCatalogSeed();

  it("has the full library that used to live in App.tsx", () => {
    const db = openDatabase(":memory:");
    expect(n(db, "SELECT COUNT(*) AS n FROM foods WHERE user_id IS NULL")).toBe(121);
    expect(n(db, "SELECT COUNT(*) AS n FROM exercises")).toBe(20);
    expect(n(db, "SELECT COUNT(*) AS n FROM meal_plans")).toBe(12);
    expect(n(db, "SELECT COUNT(*) AS n FROM meal_plan_items")).toBe(seed.meal_plans.reduce((s, p) => s + p.items.length, 0));
    db.close();
  });

  it("seed keys are unique, and every meal plan item names a food that exists", () => {
    for (const list of [seed.foods, seed.exercises, seed.meal_plans]) {
      const keys = list.map((x) => x.seed_key);
      expect(new Set(keys).size).toBe(keys.length);
    }
    const foods = new Set(seed.foods.map((f) => f.seed_key));
    for (const p of seed.meal_plans) for (const item of p.items) expect([p.name, foods.has(item.food)]).toEqual([p.name, true]);
  });

  it("every food has sane numbers: nothing negative, fibre within carbs, calories roughly match the macros", () => {
    for (const f of seed.foods) {
      for (const k of ["cal", "protein", "carbs", "fat", "fiber"] as const) expect([f.name, k, f[k] >= 0]).toEqual([f.name, k, true]);
      expect([f.name, f.default_serving > 0]).toEqual([f.name, true]);
      expect([f.name, "fibre <= carbs", f.fiber <= f.carbs + 0.01]).toEqual([f.name, "fibre <= carbs", true]);
    }
  });

  it("MET values reproduce the original calories-per-minute at the original body weight", () => {
    const original: Record<string, number> = { "Lagree (Megaformer)": 6.5, "Yoga": 2.8, "Running (6+ mph)": 10, "Walking (brisk, 4 mph)": 4.5, "Stretching": 2 };
    for (const [name, calPerMin] of Object.entries(original)) {
      const { met } = seed.exercises.find((e) => e.name === name)!;
      expect([name, Math.round((met * 3.5 * seed.reference_weight_kg) / 200 * 10) / 10]).toEqual([name, calPerMin]);
    }
  });

  it("the Natura Fibre scoop still nets to zero carbs (the case the original docs single out)", () => {
    const f = seed.foods.find((x) => x.name.startsWith("Natura Fibre"))!;
    expect(Math.max(0, f.carbs - f.fiber)).toBe(0);
  });
});

describe("seedCatalog", () => {
  it("is idempotent: a restart adds nothing and changes no ids", () => {
    const db = emptyMigrated();
    seedCatalog(db, tiny());
    const before = db.prepare("SELECT id, seed_key FROM foods ORDER BY id").all();
    seedCatalog(db, tiny());
    seedCatalog(db, tiny());
    expect(db.prepare("SELECT id, seed_key FROM foods ORDER BY id").all()).toEqual(before);
    expect(n(db, "SELECT COUNT(*) AS n FROM meal_plan_items")).toBe(2);
    expect(n(db, "SELECT COUNT(*) AS n FROM exercises")).toBe(1);
    db.close();
  });

  it("re-seeding consumes no ids: a custom food added after many restarts gets the very next id", () => {
    const db = emptyMigrated();
    for (let restart = 0; restart < 25; restart++) seedCatalog(db, tiny());
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES (7, 'a@example.com', 'x')").run();
    const { lastInsertRowid } = db.prepare("INSERT INTO foods (user_id, name) VALUES (7, 'Mine')").run();
    expect(Number(lastInsertRowid)).toBe(3); // two built-ins, then this
    db.close();
  });

  it("a correction in the JSON reaches an existing database, keeping the row's id", () => {
    const db = emptyMigrated();
    seedCatalog(db, tiny());
    const { id } = db.prepare("SELECT id FROM foods WHERE seed_key = 'food-001'").get() as { id: number };

    const corrected = tiny();
    corrected.foods[0] = { ...corrected.foods[0], cal: 167, name: "Avocado (Hass)" };
    seedCatalog(db, corrected);

    expect(db.prepare("SELECT id, name, cal FROM foods WHERE seed_key = 'food-001'").get()).toEqual({ id, name: "Avocado (Hass)", cal: 167 });
    db.close();
  });

  it("never touches a user's custom foods, even one with the same name as a built-in", () => {
    const db = emptyMigrated();
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES (7, 'a@example.com', 'x')").run();
    db.prepare("INSERT INTO foods (user_id, name, cal) VALUES (7, 'Avocado', 999)").run();

    seedCatalog(db, tiny());
    seedCatalog(db, tiny());

    expect(db.prepare("SELECT cal FROM foods WHERE user_id = 7").all()).toEqual([{ cal: 999 }]);
    expect(n(db, "SELECT COUNT(*) AS n FROM foods WHERE name = 'Avocado'")).toBe(2);
    db.close();
  });

  it("a new built-in food added later does not collide with custom foods that took the next ids", () => {
    const db = emptyMigrated();
    seedCatalog(db, tiny());
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES (7, 'a@example.com', 'x')").run();
    db.prepare("INSERT INTO foods (user_id, name) VALUES (7, 'Mine')").run(); // takes id 3

    const grown = tiny();
    grown.foods.push({ seed_key: "food-003", name: "Walnuts", category: "Fats", unit: "g", default_serving: 28, cal: 185, protein: 4.3, carbs: 3.9, fat: 18.5, fiber: 2 });
    seedCatalog(db, grown);

    expect(db.prepare("SELECT name FROM foods ORDER BY id").all().map((r: any) => r.name)).toEqual(["Avocado", "Olive Oil", "Mine", "Walnuts"]);
    db.close();
  });

  it("rewrites a plan's items when the recipe changes", () => {
    const db = emptyMigrated();
    seedCatalog(db, tiny());
    const changed = tiny();
    changed.meal_plans[0].items = [{ food: "food-002", serving_amount: 2 }];
    seedCatalog(db, changed);
    expect(db.prepare("SELECT position, serving_amount FROM meal_plan_items").all()).toEqual([{ position: 0, serving_amount: 2 }]);
    db.close();
  });

  it("a plan naming a food that does not exist changes nothing at all", () => {
    const db = emptyMigrated();
    const broken = tiny();
    broken.meal_plans[0].items.push({ food: "food-999", serving_amount: 1 });

    expect(() => seedCatalog(db, broken)).toThrow(/Avocado Toastless.*food-999/);
    expect(n(db, "SELECT COUNT(*) AS n FROM foods")).toBe(0);
    expect(n(db, "SELECT COUNT(*) AS n FROM meal_plans")).toBe(0);
    db.close();
  });

  it("the schema refuses a row that is half built-in, half custom", () => {
    const db = emptyMigrated();
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES (7, 'a@example.com', 'x')").run();
    expect(() => db.prepare("INSERT INTO foods (user_id, seed_key, name) VALUES (7, 'food-x', 'X')").run()).toThrow(/CHECK/);
    expect(() => db.prepare("INSERT INTO foods (user_id, seed_key, name) VALUES (NULL, NULL, 'X')").run()).toThrow(/CHECK/);
    db.close();
  });
});
