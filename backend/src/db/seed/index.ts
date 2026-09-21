import fs from "fs";
import path from "path";
import type { Db } from "../index";

export interface CatalogSeed {
  reference_weight_kg: number;
  foods: {
    seed_key: string; name: string; category: string; unit: string; default_serving: number;
    cal: number; protein: number; carbs: number; fat: number; fiber: number;
  }[];
  exercises: { seed_key: string; name: string; met: number }[];
  meal_plans: {
    seed_key: string; name: string; meal_type: string; badge: string; description: string;
    items: { food: string; serving_amount: number }[];
  }[];
}

export function loadCatalogSeed(file: string = path.join(__dirname, "catalog.json")): CatalogSeed {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Bring the built-in catalog in line with catalog.json.
 *
 * Runs on every start and is idempotent. Rows are matched by seed_key and
 * upserted, so correcting a macro in the JSON reaches databases that already
 * exist, and ids never change (log entries and meal plans can rely on them).
 * Re-seeding consumes no ids.
 * It only ever touches built-in rows: a user's custom foods are never read,
 * changed or removed. A built-in row that disappears from the JSON is left in
 * place, because something may reference it.
 *
 * All or nothing: a bad seed file (say, a meal plan naming a food that does
 * not exist) changes nothing and stops the server from starting.
 */
export function seedCatalog(db: Db, seed: CatalogSeed = loadCatalogSeed()): void {
  // Update first, insert only when the key is new. A plain
  // INSERT ... ON CONFLICT DO UPDATE would work, but with AUTOINCREMENT every
  // conflicting insert still consumes an id, so each restart would burn one id
  // per built-in row and push users' custom food ids up by hundreds per deploy.
  const upsert = (table: string, columns: string[]) => {
    const update = db.prepare(`UPDATE ${table} SET ${columns.map((c) => `${c} = @${c}`).join(", ")} WHERE seed_key = @seed_key`);
    const insert = db.prepare(`INSERT INTO ${table} (seed_key, ${columns.join(", ")}) VALUES (@seed_key, ${columns.map((c) => `@${c}`).join(", ")})`);
    return (row: Record<string, unknown>) => { if (update.run(row).changes === 0) insert.run(row); };
  };
  const upsertFood = upsert("foods", ["name", "category", "unit", "default_serving", "cal", "protein", "carbs", "fat", "fiber"]);
  const upsertExercise = upsert("exercises", ["name", "met", "sort_order"]);
  const upsertPlan = upsert("meal_plans", ["name", "meal_type", "badge", "description", "sort_order"]);
  const planId = db.prepare("SELECT id FROM meal_plans WHERE seed_key = ?");
  const foodId = db.prepare("SELECT id FROM foods WHERE seed_key = ?");
  const clearItems = db.prepare("DELETE FROM meal_plan_items WHERE meal_plan_id = ?");
  const addItem = db.prepare("INSERT INTO meal_plan_items (meal_plan_id, position, food_id, serving_amount) VALUES (?, ?, ?, ?)");

  db.transaction(() => {
    for (const f of seed.foods) upsertFood({ ...f });
    seed.exercises.forEach((e, i) => upsertExercise({ ...e, sort_order: i }));

    seed.meal_plans.forEach((p, i) => {
      upsertPlan({ seed_key: p.seed_key, name: p.name, meal_type: p.meal_type, badge: p.badge, description: p.description, sort_order: i });
      const { id } = planId.get(p.seed_key) as { id: number };
      clearItems.run(id);
      p.items.forEach((item, position) => {
        const food = foodId.get(item.food) as { id: number } | undefined;
        if (!food) throw new Error(`Meal plan "${p.name}" refers to a food that is not in the seed: ${item.food}`);
        addItem.run(id, position, food.id, item.serving_amount);
      });
    });
  })();
}
