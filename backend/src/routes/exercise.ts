import { Router, Request, Response } from "express";
import db from "../db";
import { ExerciseEntry, ApiResponse } from "../types";

const router = Router();
const USER_ID = 1;

// GET /api/exercise/:date
router.get("/:date", (req: Request, res: Response) => {
  try {
    const { date } = req.params;
    const entries = db
      .prepare("SELECT * FROM exercise_logs WHERE user_id = ? AND date = ? ORDER BY created_at ASC")
      .all(USER_ID, date) as ExerciseEntry[];

    res.json({ success: true, data: entries });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch exercise log" });
  }
});

// POST /api/exercise
router.post("/", (req: Request, res: Response) => {
  try {
    const entry: ExerciseEntry = req.body;

    if (!entry.date || !entry.name) {
      return res.status(400).json({ success: false, error: "Missing required fields: date, name" });
    }

    const result = db.prepare(`
      INSERT INTO exercise_logs (user_id, date, name, duration, cal)
      VALUES (?, ?, ?, ?, ?)
    `).run(USER_ID, entry.date, entry.name, entry.duration || "", entry.cal || 0);

    const newEntry = db
      .prepare("SELECT * FROM exercise_logs WHERE id = ?")
      .get(result.lastInsertRowid) as ExerciseEntry;

    res.status(201).json({ success: true, data: newEntry });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to save exercise entry" });
  }
});

// DELETE /api/exercise/:id
router.delete("/:id", (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = db
      .prepare("DELETE FROM exercise_logs WHERE id = ? AND user_id = ?")
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
