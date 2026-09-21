import { Router, Request, Response } from "express";
import { Db } from "../db";
import { DaySummary, WeightEntry } from "../types";
import { currentUserId } from "../auth/middleware";
import { validate, dateParams, rangeQuery, weightQuery, weightEntrySchema, WeightInput } from "../validation";

export function createSummaryRouter(db: Db): Router {
  const router = Router();

  // GET /api/summary/:date — full day nutrition summary
  router.get("/day/:date", validate({ params: dateParams }), (req: Request, res: Response) => {
    try {
      const { date } = req.params;

      const food = db.prepare(`
        SELECT
          COALESCE(SUM(cal), 0)     as total_cal,
          COALESCE(SUM(protein), 0) as total_protein,
          COALESCE(SUM(carbs), 0)   as total_carbs,
          COALESCE(SUM(fat), 0)     as total_fat,
          COALESCE(SUM(fiber), 0)   as total_fiber
        FROM food_logs WHERE user_id = ? AND date = ?
      `).get(currentUserId(req), date) as any;

      const exercise = db.prepare(`
        SELECT COALESCE(SUM(cal), 0) as exercise_cal
        FROM exercise_logs WHERE user_id = ? AND date = ?
      `).get(currentUserId(req), date) as any;

      const net_carbs = Math.max(0, food.total_carbs - food.total_fiber);
      const net_cal = food.total_cal - exercise.exercise_cal;

      const summary: DaySummary = {
        date,
        total_cal: Math.round(food.total_cal),
        total_protein: Math.round(food.total_protein * 10) / 10,
        total_carbs: Math.round(food.total_carbs * 10) / 10,
        total_fat: Math.round(food.total_fat * 10) / 10,
        total_fiber: Math.round(food.total_fiber * 10) / 10,
        net_carbs: Math.round(net_carbs * 10) / 10,
        exercise_cal: Math.round(exercise.exercise_cal),
        net_cal: Math.round(net_cal),
      };

      res.json({ success: true, data: summary });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to fetch summary" });
    }
  });

  // GET /api/summary/range?start=YYYY-MM-DD&end=YYYY-MM-DD — history range
  router.get("/range", validate({ query: rangeQuery }), (req: Request, res: Response) => {
    try {
      const { start, end } = req.query as { start: string; end: string };

      const rows = db.prepare(`
        SELECT
          f.date,
          COALESCE(SUM(f.cal), 0)     as total_cal,
          COALESCE(SUM(f.protein), 0) as total_protein,
          COALESCE(SUM(f.carbs), 0)   as total_carbs,
          COALESCE(SUM(f.fat), 0)     as total_fat,
          COALESCE(SUM(f.fiber), 0)   as total_fiber
        FROM food_logs f
        WHERE f.user_id = ? AND f.date BETWEEN ? AND ?
        GROUP BY f.date
        ORDER BY f.date DESC
      `).all(currentUserId(req), start, end) as any[];

      const exRows = db.prepare(`
        SELECT date, COALESCE(SUM(cal), 0) as exercise_cal
        FROM exercise_logs
        WHERE user_id = ? AND date BETWEEN ? AND ?
        GROUP BY date
      `).all(currentUserId(req), start, end) as any[];

      const exMap: Record<string, number> = {};
      exRows.forEach(r => { exMap[r.date] = r.exercise_cal; });

      const summaries: DaySummary[] = rows.map(r => ({
        date: r.date,
        total_cal: Math.round(r.total_cal),
        total_protein: Math.round(r.total_protein * 10) / 10,
        total_carbs: Math.round(r.total_carbs * 10) / 10,
        total_fat: Math.round(r.total_fat * 10) / 10,
        total_fiber: Math.round(r.total_fiber * 10) / 10,
        net_carbs: Math.round(Math.max(0, r.total_carbs - r.total_fiber) * 10) / 10,
        exercise_cal: Math.round(exMap[r.date] || 0),
        net_cal: Math.round(r.total_cal - (exMap[r.date] || 0)),
      }));

      res.json({ success: true, data: summaries });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to fetch range summary" });
    }
  });

  // POST /api/summary/weight — log weight. One entry per user per day:
  // weighing in again on the same date replaces that day's entry.
  // 201 when a new entry was created, 200 when an existing one was replaced.
  // Either way the response is the row as stored.
  router.post("/weight", validate({ body: weightEntrySchema }), (req: Request, res: Response) => {
    try {
      const entry = req.body as WeightInput;

      const existed = db
        .prepare("SELECT 1 FROM weight_logs WHERE user_id = ? AND date = ?")
        .get(currentUserId(req), entry.date) !== undefined;

      db.prepare(`
        INSERT INTO weight_logs (user_id, date, weight_lbs, notes)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (user_id, date) DO UPDATE SET weight_lbs = excluded.weight_lbs, notes = excluded.notes
      `).run(currentUserId(req), entry.date, entry.weight_lbs, entry.notes ?? null);

      const stored = db
        .prepare("SELECT * FROM weight_logs WHERE user_id = ? AND date = ?")
        .get(currentUserId(req), entry.date) as WeightEntry;

      res.status(existed ? 200 : 201).json({ success: true, data: stored });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to save weight" });
    }
  });

  // GET /api/summary/weight?days=30
  router.get("/weight", validate({ query: weightQuery }), (req: Request, res: Response) => {
    try {
      const { days } = req.query as unknown as { days: number };
      const entries = db.prepare(`
        SELECT * FROM weight_logs
        WHERE user_id = ?
        ORDER BY date DESC
        LIMIT ?
      `).all(currentUserId(req), days) as WeightEntry[];

      res.json({ success: true, data: entries });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to fetch weight log" });
    }
  });

  return router;
}
