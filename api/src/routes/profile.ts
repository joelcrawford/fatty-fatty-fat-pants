import { Router, Request, Response } from "express";
import {
  PRESETS, Profile, Targets, profileSchema, computeTargets, ageFromBirthYear, kgToLbs, lbsToKg, round,
} from "@nutrition/shared";
import { z } from "zod";
import { Db } from "../db";
import { currentUserId } from "../auth/middleware";
import { validate } from "../validation";

interface ProfileRow {
  user_id: number; units: "imperial" | "metric"; sex: "female" | "male" | null; birth_year: number | null;
  height_cm: number | null; weight_kg: number; activity: Profile["activity"]; goal: Profile["goal"]; weekly_rate_kg: number;
  preset_key: Profile["preset_key"]; calories: number; protein_g: number; carbs_g: number; carbs_mode: "net" | "total";
  fat_g: number; fiber_g: number; targets_customised: 0 | 1; onboarded_at: string; updated_at: string;
}

/**
 * The weight to use for anything that depends on body weight today: the
 * user's most recent weigh-in if they have logged one, otherwise the weight
 * they gave at onboarding. Null if they have not onboarded.
 */
export function currentWeightKg(db: Db, userId: number): number | null {
  const latest = db.prepare("SELECT weight_lbs FROM weight_logs WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 1").get(userId) as { weight_lbs: number } | undefined;
  if (latest) return round(lbsToKg(latest.weight_lbs), 2);
  const profile = db.prepare("SELECT weight_kg FROM user_profiles WHERE user_id = ?").get(userId) as { weight_kg: number } | undefined;
  return profile?.weight_kg ?? null;
}

export function isOnboarded(db: Db, userId: number): boolean {
  return db.prepare("SELECT 1 FROM user_profiles WHERE user_id = ?").get(userId) !== undefined;
}

export function createProfileRouter(db: Db): Router {
  const router = Router();

  const load = (userId: number): Profile | null => {
    const r = db.prepare("SELECT * FROM user_profiles WHERE user_id = ?").get(userId) as ProfileRow | undefined;
    if (!r) return null;
    return {
      units: r.units, sex: r.sex, birth_year: r.birth_year, height_cm: r.height_cm, weight_kg: r.weight_kg,
      current_weight_kg: currentWeightKg(db, userId) ?? r.weight_kg,
      activity: r.activity, goal: r.goal, weekly_rate_kg: r.weekly_rate_kg, preset_key: r.preset_key,
      targets: { calories: r.calories, protein_g: r.protein_g, carbs_g: r.carbs_g, carbs_mode: r.carbs_mode, fat_g: r.fat_g, fiber_g: r.fiber_g },
      targets_customised: r.targets_customised === 1, onboarded_at: r.onboarded_at, updated_at: r.updated_at,
    };
  };

  // GET /api/profile — { profile: null } until the user has onboarded. Not a
  // 404: "not onboarded yet" is a normal state every new account is in.
  router.get("/profile", (req: Request, res: Response) => {
    try {
      res.json({ success: true, data: { profile: load(currentUserId(req)) } });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to load profile" });
    }
  });

  // PUT /api/profile — complete onboarding, or change anything afterwards.
  // The whole profile is sent each time; it is small, and that keeps the
  // rules (which fields a preset needs) in one schema.
  router.put("/profile", validate({ body: profileSchema }), (req: Request, res: Response) => {
    try {
      const userId = currentUserId(req);
      const p = req.body as z.infer<typeof profileSchema>;

      // Where the numbers come from:
      //   sent by the client  → stored as given. For a computed preset that
      //                         means the user edited them: flag it.
      //   not sent            → the server computes them. The server's answer,
      //                         not the client's, is what gets saved.
      let targets: Targets;
      let customised = false;
      if (PRESETS[p.preset_key].computed) {
        const computed = computeTargets(p.preset_key, {
          sex: p.sex, age: ageFromBirthYear(p.birth_year!), height_cm: p.height_cm!, weight_kg: p.weight_kg,
          activity: p.activity, goal: p.goal, weekly_rate_kg: p.weekly_rate_kg,
        }).targets;
        targets = p.targets ?? computed;
        customised = p.targets !== undefined && JSON.stringify(p.targets) !== JSON.stringify(computed);
      } else {
        targets = p.targets!; // the schema guarantees this for "custom"
      }

      const firstTime = !isOnboarded(db, userId);

      db.transaction(() => {
        db.prepare(`
          INSERT INTO user_profiles (user_id, units, sex, birth_year, height_cm, weight_kg, activity, goal, weekly_rate_kg,
                                     preset_key, calories, protein_g, carbs_g, carbs_mode, fat_g, fiber_g, targets_customised)
          VALUES (@user_id, @units, @sex, @birth_year, @height_cm, @weight_kg, @activity, @goal, @weekly_rate_kg,
                  @preset_key, @calories, @protein_g, @carbs_g, @carbs_mode, @fat_g, @fiber_g, @targets_customised)
          ON CONFLICT (user_id) DO UPDATE SET
            units = excluded.units, sex = excluded.sex, birth_year = excluded.birth_year, height_cm = excluded.height_cm,
            weight_kg = excluded.weight_kg, activity = excluded.activity, goal = excluded.goal, weekly_rate_kg = excluded.weekly_rate_kg,
            preset_key = excluded.preset_key, calories = excluded.calories, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g,
            carbs_mode = excluded.carbs_mode, fat_g = excluded.fat_g, fiber_g = excluded.fiber_g,
            targets_customised = excluded.targets_customised, updated_at = datetime('now')
        `).run({
          user_id: userId, units: p.units, sex: p.sex, birth_year: p.birth_year ?? null, height_cm: p.height_cm ?? null,
          weight_kg: p.weight_kg, activity: p.activity, goal: p.goal, weekly_rate_kg: p.weekly_rate_kg, preset_key: p.preset_key,
          ...targets, targets_customised: customised ? 1 : 0,
        });

        // The onboarding weight is the first point on the progress chart. Only
        // on first onboarding, only if the client said what day it is for the
        // user, and never over an entry that is already there.
        if (firstTime && p.local_date) {
          db.prepare("INSERT INTO weight_logs (user_id, date, weight_lbs, notes) VALUES (?, ?, ?, 'Starting weight') ON CONFLICT (user_id, date) DO NOTHING")
            .run(userId, p.local_date, round(kgToLbs(p.weight_kg)));
        }
      })();

      res.status(firstTime ? 201 : 200).json({ success: true, data: { profile: load(userId) } });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to save profile" });
    }
  });

  return router;
}
