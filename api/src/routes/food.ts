import { Router, Request, Response } from "express";
import { Db } from "../db";
import { FoodEntry, ApiResponse } from "../types";
import { currentUserId } from "../auth/middleware";
import { validate, dateParams, idParams, foodEntrySchema, foodBatchSchema, FoodInput } from "../validation";

export function createFoodRouter(db: Db): Router {
  const router = Router();

  const insert = db.prepare(`
    INSERT INTO food_logs (user_id, date, meal, food_name, amount, cal, protein, carbs, fat, fiber)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEntry = (userId: number, e: FoodInput) =>
    insert.run(userId, e.date, e.meal, e.food_name, e.amount, e.cal, e.protein, e.carbs, e.fat, e.fiber)
      .lastInsertRowid as number;

  // GET /api/food/:date — fetch all food entries for a date
  router.get("/:date", validate({ params: dateParams }), (req: Request, res: Response) => {
    try {
      const entries = db
        .prepare("SELECT * FROM food_logs WHERE user_id = ? AND date = ? ORDER BY created_at ASC, id ASC")
        .all(currentUserId(req), req.params.date) as FoodEntry[];

      const response: ApiResponse<FoodEntry[]> = { success: true, data: entries };
      res.json(response);
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to fetch food log" });
    }
  });

  // POST /api/food — add a single food entry
  router.post("/", validate({ body: foodEntrySchema }), (req: Request, res: Response) => {
    try {
      const id = insertEntry(currentUserId(req), req.body as FoodInput);
      const newEntry = db.prepare("SELECT * FROM food_logs WHERE id = ?").get(id) as FoodEntry;
      res.status(201).json({ success: true, data: newEntry });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to save food entry" });
    }
  });

  // POST /api/food/batch — add multiple entries at once (for recipe logging).
  // The whole array is validated first, then inserted in one transaction, so
  // it is all-or-nothing on both counts.
  router.post("/batch", validate({ body: foodBatchSchema }), (req: Request, res: Response) => {
    try {
      const userId = currentUserId(req);
      const insertMany = db.transaction((items: FoodInput[]) => items.map((e) => insertEntry(userId, e)));
      const ids = insertMany(req.body as FoodInput[]);

      const inserted = db
        .prepare(`SELECT * FROM food_logs WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY id ASC`)
        .all(...ids) as FoodEntry[];

      res.status(201).json({ success: true, data: inserted });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to save food entries" });
    }
  });

  // DELETE /api/food/:id — remove a single entry
  router.delete("/:id", validate({ params: idParams }), (req: Request, res: Response) => {
    try {
      const id = req.params.id as unknown as number;
      const result = db.prepare("DELETE FROM food_logs WHERE id = ? AND user_id = ?").run(id, currentUserId(req));

      if (result.changes === 0) {
        return res.status(404).json({ success: false, error: "Entry not found" });
      }

      res.json({ success: true, data: { deleted_id: id } });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to delete entry" });
    }
  });

  return router;
}
