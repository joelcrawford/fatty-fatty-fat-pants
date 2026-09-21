import { Router, Request, Response } from "express";
import { Db } from "../db";
import { ExerciseEntry } from "../types";
import { currentUserId } from "../auth/middleware";
import { validate, dateParams, idParams, exerciseEntrySchema, ExerciseInput } from "../validation";

export function createExerciseRouter(db: Db): Router {
  const router = Router();

  // GET /api/exercise/:date
  router.get("/:date", validate({ params: dateParams }), (req: Request, res: Response) => {
    try {
      const entries = db
        .prepare("SELECT * FROM exercise_logs WHERE user_id = ? AND date = ? ORDER BY created_at ASC, id ASC")
        .all(currentUserId(req), req.params.date) as ExerciseEntry[];

      res.json({ success: true, data: entries });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to fetch exercise log" });
    }
  });

  // POST /api/exercise
  router.post("/", validate({ body: exerciseEntrySchema }), (req: Request, res: Response) => {
    try {
      const entry = req.body as ExerciseInput;

      const result = db.prepare(`
        INSERT INTO exercise_logs (user_id, date, name, duration, cal)
        VALUES (?, ?, ?, ?, ?)
      `).run(currentUserId(req), entry.date, entry.name, entry.duration, entry.cal);

      const newEntry = db
        .prepare("SELECT * FROM exercise_logs WHERE id = ?")
        .get(result.lastInsertRowid) as ExerciseEntry;

      res.status(201).json({ success: true, data: newEntry });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to save exercise entry" });
    }
  });

  // DELETE /api/exercise/:id
  router.delete("/:id", validate({ params: idParams }), (req: Request, res: Response) => {
    try {
      const id = req.params.id as unknown as number;
      const result = db.prepare("DELETE FROM exercise_logs WHERE id = ? AND user_id = ?").run(id, currentUserId(req));

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
