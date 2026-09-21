import { Router, Request, Response } from "express";
import { Db } from "../db";
import { loadCatalogSeed } from "../db/seed";
import { currentUserId } from "../auth/middleware";
import { canonicalBarcode, caloriesPerMinute } from "@nutrition/shared";
import { currentWeightKg } from "./profile";
import { validate, idParams, customFoodSchema, foodSearchQuery, CustomFoodInput } from "../validation";

interface FoodRow {
  id: number; user_id: number | null; name: string; category: string; unit: string; default_serving: number;
  cal: number; protein: number; carbs: number; fat: number; fiber: number; barcode: string | null;
}

/** What clients see. `custom` replaces user_id: nobody needs to know ids, only whether they may edit it. */
const publicFood = (f: FoodRow) => ({
  id: f.id, name: f.name, category: f.category, unit: f.unit, default_serving: f.default_serving,
  cal: f.cal, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber,
  barcode: f.barcode, custom: f.user_id !== null,
});

/** Escape LIKE wildcards so searching for "100%" means a literal percent sign. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Foods, exercises and meal plans.
 *
 * The rule for foods: you see every built-in food plus your own custom foods,
 * and nothing of anyone else's. Every food query in this file goes through
 * VISIBLE so that rule lives in one place.
 */
export function createCatalogRouter(db: Db): Router {
  const router = Router();
  const VISIBLE = "(user_id IS NULL OR user_id = @userId)";

  // Calories depend on who is exercising. Used only for someone who has not
  // onboarded yet, so has no weight on record.
  const referenceKg = loadCatalogSeed().reference_weight_kg;

  // GET /api/foods?q=&category=&scope=all|mine|builtin
  // The whole catalog is a few hundred small rows, so with no query it is
  // returned in full and clients filter as the user types, with no round trip.
  router.get("/foods", validate({ query: foodSearchQuery }), (req: Request, res: Response) => {
    try {
      const { q, category, scope } = req.query as { q?: string; category?: string; scope: "all" | "mine" | "builtin" };
      const where = [VISIBLE];
      if (scope === "mine") where.push("user_id = @userId");
      if (scope === "builtin") where.push("user_id IS NULL");
      if (q) where.push("name LIKE @q ESCAPE '\\'");
      if (category) where.push("category = @category COLLATE NOCASE");

      const rows = db
        .prepare(`SELECT * FROM foods WHERE ${where.join(" AND ")} ORDER BY (user_id IS NULL) DESC, id ASC`)
        .all({ userId: currentUserId(req), q: q ? likePattern(q) : null, category: category ?? null }) as FoodRow[];

      res.json({ success: true, data: rows.map(publicFood) });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to fetch foods" });
    }
  });

  // POST /api/foods — add a custom food, visible only to its owner
  router.post("/foods", validate({ body: customFoodSchema }), (req: Request, res: Response) => {
    try {
      const f = req.body as CustomFoodInput;
      const { lastInsertRowid } = db.prepare(`
        INSERT INTO foods (user_id, name, category, unit, default_serving, cal, protein, carbs, fat, fiber, barcode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(currentUserId(req), f.name, f.category, f.unit, f.default_serving, f.cal, f.protein, f.carbs, f.fat, f.fiber, f.barcode ? canonicalBarcode(f.barcode) : null);

      res.status(201).json({ success: true, data: publicFood(db.prepare("SELECT * FROM foods WHERE id = ?").get(lastInsertRowid) as FoodRow) });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to save food" });
    }
  });

  // DELETE /api/foods/:id — custom foods only. Past log entries are unaffected:
  // the log keeps its own copy of the name and macros.
  router.delete("/foods/:id", validate({ params: idParams }), (req: Request, res: Response) => {
    try {
      const id = req.params.id as unknown as number;
      const food = db.prepare(`SELECT * FROM foods WHERE id = @id AND ${VISIBLE}`).get({ id, userId: currentUserId(req) }) as FoodRow | undefined;

      // Someone else's custom food is indistinguishable from one that does not exist.
      if (!food) return res.status(404).json({ success: false, error: "Food not found" });
      // Built-in foods are public knowledge, so saying so reveals nothing.
      if (food.user_id === null) return res.status(403).json({ success: false, error: "Built-in foods cannot be deleted" });

      db.prepare("DELETE FROM foods WHERE id = ? AND user_id = ?").run(id, currentUserId(req));
      res.json({ success: true, data: { deleted_id: id } });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to delete food" });
    }
  });

  // GET /api/exercises
  router.get("/exercises", (req: Request, res: Response) => {
    try {
      // Latest weigh-in, else onboarding weight, else the reference weight.
      const kg = currentWeightKg(db, currentUserId(req)) ?? referenceKg;
      const rows = db.prepare("SELECT id, name, met FROM exercises ORDER BY sort_order, id").all() as { id: number; name: string; met: number }[];
      res.json({
        success: true,
        data: rows.map((e) => ({ ...e, cal_per_min: caloriesPerMinute(e.met, kg), cal_per_min_weight_kg: kg })),
      });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to fetch exercises" });
    }
  });

  // GET /api/meal-plans — each plan with its items and the food for each item,
  // so a client can show and log a recipe without a second request.
  router.get("/meal-plans", (_req: Request, res: Response) => {
    try {
      const plans = db.prepare("SELECT id, name, meal_type, badge, description FROM meal_plans ORDER BY sort_order, id").all() as { id: number }[];
      const items = db.prepare(`
        SELECT i.meal_plan_id, i.serving_amount, f.*
          FROM meal_plan_items i JOIN foods f ON f.id = i.food_id
         ORDER BY i.meal_plan_id, i.position
      `).all() as (FoodRow & { meal_plan_id: number; serving_amount: number })[];

      res.json({
        success: true,
        data: plans.map((p) => ({
          ...p,
          items: items.filter((i) => i.meal_plan_id === p.id).map((i) => ({ serving_amount: i.serving_amount, food: publicFood(i) })),
        })),
      });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to fetch meal plans" });
    }
  });

  return router;
}
