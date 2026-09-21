import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  PRESETS, PRESET_KEYS, PresetKey, DISCLAIMER, CALORIE_FLOOR, CALORIE_CEILING, ACTIVITY_LEVELS, GOALS,
  computeTargets, presetProfileSchema,
} from "@nutrition/shared";
import { validate } from "../validation";

const presetParams = z.object({
  key: z.enum(PRESET_KEYS, { errorMap: () => ({ message: `must be one of: ${PRESET_KEYS.join(", ")}` }) }),
});

/**
 * Presets are code, not data: they change with releases, not at runtime, and
 * the maths lives in the shared package so clients can compute the same
 * numbers offline while the user is still typing. These endpoints exist so a
 * client never has to hard-code the list, and so the server's answer is the
 * one that gets saved.
 */
export function createPresetsRouter(): Router {
  const router = Router();

  // GET /api/presets — everything the onboarding screens need to offer a choice
  router.get("/presets", (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        presets: PRESET_KEYS.map((k) => PRESETS[k]),
        disclaimer: DISCLAIMER,
        limits: { calorie_floor: CALORIE_FLOOR, calorie_ceiling: CALORIE_CEILING },
        activity_levels: ACTIVITY_LEVELS,
        goals: GOALS,
      },
    });
  });

  // POST /api/presets/:key/preview — targets for a draft profile. Stores
  // nothing: this is what the review screen shows BEFORE the user commits.
  router.post("/presets/:key/preview", validate({ params: presetParams, body: presetProfileSchema }), (req: Request, res: Response) => {
    const key = req.params.key as PresetKey;
    if (!PRESETS[key].computed) {
      return res.status(400).json({ success: false, error: "The Custom preset has no formula: its targets are entered by the user" });
    }
    try {
      res.json({ success: true, data: { ...computeTargets(key, req.body), disclaimer: DISCLAIMER } });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to compute targets" });
    }
  });

  return router;
}
