import { Router, Request, Response } from "express";
import db from "../db";
import { FoodEntry, ApiResponse } from "../types";

const router = Router();
const USER_ID = 1; // Single user for now — easy to extend later

// GET /api/food/:date — fetch all food entries for a date
router.get("/:date", (req: Request, res: Response) => {
  try {
    const { date } = req.params;
    const entries = db
      .prepare("SELECT * FROM food_logs WHERE user_id = ? AND date = ? ORDER BY created_at ASC")
      .all(USER_ID, date) as FoodEntry[];

    const response: ApiResponse<FoodEntry[]> = { success: true, data: entries };
    res.json(response);
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch food log" });
  }
});

// POST /api/food — add a single food entry
router.post("/", (req: Request, res: Response) => {
  try {
    const entry: FoodEntry = req.body;

    if (!entry.date || !entry.meal || !entry.food_name) {
      return res.status(400).json({ success: false, error: "Missing required fields: date, meal, food_name" });
    }

    const stmt = db.prepare(`
      INSERT INTO food_logs (user_id, date, meal, food_name, amount, cal, protein, carbs, fat, fiber)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      USER_ID,
      entry.date,
      entry.meal,
      entry.food_name,
      entry.amount || "",
      entry.cal || 0,
      entry.protein || 0,
      entry.carbs || 0,
      entry.fat || 0,
      entry.fiber || 0
    );

    const newEntry = db
      .prepare("SELECT * FROM food_logs WHERE id = ?")
      .get(result.lastInsertRowid) as FoodEntry;

    res.status(201).json({ success: true, data: newEntry });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to save food entry" });
  }
});

// POST /api/food/batch — add multiple entries at once (for recipe logging)
router.post("/batch", (req: Request, res: Response) => {
  try {
    const entries: FoodEntry[] = req.body;

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ success: false, error: "Expected an array of food entries" });
    }

    const stmt = db.prepare(`
      INSERT INTO food_logs (user_id, date, meal, food_name, amount, cal, protein, carbs, fat, fiber)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((items: FoodEntry[]) => {
      const ids: number[] = [];
      for (const entry of items) {
        const result = stmt.run(
          USER_ID, entry.date, entry.meal, entry.food_name,
          entry.amount || "", entry.cal || 0, entry.protein || 0,
          entry.carbs || 0, entry.fat || 0, entry.fiber || 0
        );
        ids.push(result.lastInsertRowid as number);
      }
      return ids;
    });

    const ids = insertMany(entries);
    const inserted = db
      .prepare(`SELECT * FROM food_logs WHERE id IN (${ids.map(() => "?").join(",")})`)
      .all(...ids) as FoodEntry[];

    res.status(201).json({ success: true, data: inserted });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to save food entries" });
  }
});

// DELETE /api/food/:id — remove a single entry
router.delete("/:id", (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = db
      .prepare("DELETE FROM food_logs WHERE id = ? AND user_id = ?")
      .run(id, USER_ID);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: "Entry not found" });
    }

    res.json({ success: true, data: { deleted_id: Number(id) } });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to delete entry" });
  }
});

export default router;
