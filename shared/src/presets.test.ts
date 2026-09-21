import { describe, expect, it } from "vitest";
import {
  computeTargets, restingEnergy, calorieFloor, maxWeeklyLossKg, presetProfileSchema, targetsSchema,
  PRESETS, PRESET_KEYS, ACTIVITY_LEVELS, DISCLAIMER, feetInchesToCm, cmToFeetInches, PresetProfileInput, PresetKey,
} from "./presets";
import { lbsToKg } from "./nutrition";

// The person the original app was built for (docs/APP_OVERVIEW.md):
// 50, 134 lbs, 5'3", menopausal, sedentary desk job, losing 1 lb a week.
const REFERENCE: PresetProfileInput = {
  sex: "female", age: 50, height_cm: feetInchesToCm(5, 3), weight_kg: lbsToKg(134),
  activity: "sedentary", goal: "lose", weekly_rate_kg: lbsToKg(1),
};
const COMPUTED = PRESET_KEYS.filter((k) => k !== "custom") as Exclude<PresetKey, "custom">[];

describe("the Galveston-style preset", () => {
  it("reproduces the original app's five numbers exactly for the person it was built for", () => {
    expect(computeTargets("galveston_style", REFERENCE).targets).toEqual({
      calories: 1200, protein_g: 80, carbs_g: 25, carbs_mode: "net", fat_g: 80, fiber_g: 30,
    });
  });

  it("shows its working, including that the safety floor is what set her calories", () => {
    expect(computeTargets("galveston_style", REFERENCE).explanation).toEqual({
      bmr: 1197,            // 10×60.8 + 6.25×160 − 5×50 − 161
      maintenance: 1436,    // × 1.2 sedentary
      goal_adjustment: -499, // 1 lb a week
      rate_capped: false,
      calorie_floor: 1200,
      floor_applied: true,  // 1436 − 499 = 937, below the floor
      ceiling_applied: false,
      protein_capped: false,
    });
  });

  it("scales up for a bigger, more active person while keeping its character: low net carbs, 30 g fibre, fat-forward", () => {
    const { targets } = computeTargets("galveston_style", { sex: "female", age: 45, height_cm: 172, weight_kg: 85, activity: "active", goal: "maintain" });
    expect(targets).toMatchObject({ calories: 2650, protein_g: 110, carbs_g: 55, carbs_mode: "net", fiber_g: 30 });
    expect((targets.fat_g * 9) / targets.calories).toBeGreaterThan(0.6);
  });

  it("is never called the Galveston Diet, and says it is not affiliated", () => {
    const text = JSON.stringify(PRESETS.galveston_style);
    expect(PRESETS.galveston_style.name).toBe("Galveston-style, muscle-preserving");
    expect(PRESETS.galveston_style.name + PRESETS.galveston_style.summary + PRESETS.galveston_style.whoFor).not.toMatch(/Galveston Diet/i);
    expect(text).toMatch(/Not affiliated with or endorsed by/);
  });
});

describe("the other presets, for the same person", () => {
  it("Balanced: moderate protein, 30% fat, the rest carbohydrate, counted as total", () => {
    expect(computeTargets("balanced", REFERENCE).targets).toEqual({ calories: 1200, protein_g: 60, carbs_g: 150, carbs_mode: "total", fat_g: 40, fiber_g: 25 });
  });
  it("High protein: 1.8 g/kg, held to 35% of calories when calories are low", () => {
    const r = computeTargets("high_protein", REFERENCE);
    expect(r.targets).toEqual({ calories: 1200, protein_g: 105, carbs_g: 115, carbs_mode: "total", fat_g: 35, fiber_g: 25 });
    expect(r.explanation.protein_capped).toBe(true); // 1.8 × 60.8 = 109 g > 35% of 1200
  });
  it("Low carb: 50 g net, fat takes the remainder", () => {
    expect(computeTargets("low_carb", REFERENCE).targets).toEqual({ calories: 1200, protein_g: 85, carbs_g: 50, carbs_mode: "net", fat_g: 65, fiber_g: 30 });
  });
  it("Custom has no formula", () => {
    expect(() => computeTargets("custom", REFERENCE)).toThrow(/no formula/);
    expect(PRESETS.custom.computed).toBe(false);
  });
});

describe("energy", () => {
  it("Mifflin-St Jeor, worked by hand", () => {
    expect(restingEnergy({ sex: "male", age: 30, height_cm: 180, weight_kg: 80 })).toBe(1780);   // 800 + 1125 − 150 + 5
    expect(restingEnergy({ sex: "female", age: 30, height_cm: 165, weight_kg: 65 })).toBe(1370.25); // 650 + 1031.25 − 150 − 161
  });
  it("uses the midpoint when sex is withheld", () => {
    const base = { age: 40, height_cm: 170, weight_kg: 70 };
    const [f, n, m] = (["female", null, "male"] as const).map((sex) => restingEnergy({ sex, ...base }));
    expect(n).toBe((f + m) / 2);
  });
  it("maintaining ignores any rate that was sent", () => {
    const a = computeTargets("balanced", { ...REFERENCE, goal: "maintain", weekly_rate_kg: 1 });
    expect(a.explanation.goal_adjustment).toBe(0);
    expect(a.targets.calories).toBe(1440);
  });
  it("gaining adds calories, at no more than half a kilo a week", () => {
    const r = computeTargets("high_protein", { sex: "male", age: 25, height_cm: 180, weight_kg: 70, activity: "moderate", goal: "gain", weekly_rate_kg: 1 });
    expect(r.explanation).toMatchObject({ goal_adjustment: 550, rate_capped: true });
  });
});

describe("safety limits", () => {
  it("floors: 1200 for women, 1500 for men, and the HIGHER one when sex is withheld", () => {
    expect([calorieFloor("female"), calorieFloor("male"), calorieFloor(null)]).toEqual([1200, 1500, 1500]);
  });

  it("never plans a faster loss than 1% of body weight a week, or 1 kg", () => {
    expect(maxWeeklyLossKg(60)).toBeCloseTo(0.6);
    expect(maxWeeklyLossKg(150)).toBe(1);
    const r = computeTargets("balanced", { sex: "male", age: 35, height_cm: 185, weight_kg: 60, activity: "very_active", goal: "lose", weekly_rate_kg: 1 });
    expect(r.explanation.rate_capped).toBe(true);
    expect(r.explanation.goal_adjustment).toBe(-660); // 0.6 kg a week, not the 1 kg asked for
  });

  it("a small sedentary man asking for fast loss gets the floor, and is told so", () => {
    const r = computeTargets("low_carb", { sex: "male", age: 60, height_cm: 165, weight_kg: 62, activity: "sedentary", goal: "lose", weekly_rate_kg: 1 });
    expect(r.targets.calories).toBe(1500);
    expect(r.explanation).toMatchObject({ floor_applied: true, calorie_floor: 1500 });
  });

  it("holds estimates to a ceiling at the far extreme, says so, and the result is still saveable", () => {
    const r = computeTargets("galveston_style", { sex: "female", age: 18, height_cm: 190, weight_kg: 200, activity: "very_active", goal: "gain", weekly_rate_kg: 0.5 });
    expect(r.targets.calories).toBe(5000);
    expect(r.explanation.ceiling_applied).toBe(true);
    expect(targetsSchema.safeParse(r.targets).success).toBe(true);
    // An ordinary large, very active man is NOT affected.
    expect(computeTargets("balanced", { sex: "male", age: 25, height_cm: 195, weight_kg: 120, activity: "very_active", goal: "maintain" }).explanation.ceiling_applied).toBe(false);
  });

  it("refuses under-18s, with a message that says why", () => {
    const r = presetProfileSchema.safeParse({ ...REFERENCE, age: 16 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("this app is for adults: must be at least 18");
  });

  it("every computed preset says who it is not for, and cites its sources; the low-carb ones warn about diabetes medication", () => {
    for (const key of COMPUTED) {
      expect([key, PRESETS[key].notFor.length >= 3, PRESETS[key].sources.length >= 2]).toEqual([key, true, true]);
      expect(PRESETS[key].notFor.join(" ")).toMatch(/under 18/i);
      expect(PRESETS[key].notFor.join(" ")).toMatch(/eating disorder/i);
    }
    for (const key of ["galveston_style", "low_carb"] as const) expect(PRESETS[key].notFor.join(" ")).toMatch(/insulin/i);
    expect(DISCLAIMER).toMatch(/not medical advice/);
  });
});

describe("properties that must hold for everyone", () => {
  const people: PresetProfileInput[] = [];
  for (const sex of ["female", "male", null] as const)
    for (const weight_kg of [30, 45, 60.8, 80, 120, 200, 300])
      for (const height_cm of [120, 160, 190, 230])
        for (const age of [18, 50, 100])
          for (const activity of ACTIVITY_LEVELS)
            for (const [goal, weekly_rate_kg] of [["lose", 1], ["lose", 0.25], ["maintain", 0], ["gain", 0.5]] as const)
              people.push({ sex, weight_kg, height_cm, age, activity, goal, weekly_rate_kg });

  it(`holds across ${3 * 7 * 4 * 3 * 5 * 4} people × 4 presets`, () => {
    for (const p of people) {
      for (const key of COMPUTED) {
        const { targets: t, explanation: e } = computeTargets(key, p);
        const where = `${key} ${JSON.stringify(p)} → ${JSON.stringify(t)}`;

        // The floor always holds.
        expect(t.calories, where).toBeGreaterThanOrEqual(calorieFloor(p.sex ?? null));
        expect(t.calories, where).toBeLessThanOrEqual(5000);
        // Nothing negative, nothing NaN, everything within what targetsSchema accepts.
        expect(targetsSchema.safeParse(t).success, where).toBe(true);
        // Protein within the accepted upper range.
        expect((t.protein_g * 4) / t.calories, where).toBeLessThanOrEqual(0.36);
        // Enough fat for essential fatty acids: at least 20% of calories.
        expect((t.fat_g * 9) / t.calories, where).toBeGreaterThanOrEqual(0.19);
        // The macros add up to the calorie target, to within rounding (5 g steps).
        const fromMacros = t.carbs_mode === "net"
          ? t.protein_g * 4 + t.carbs_g * 4 + t.fiber_g * 2 + t.fat_g * 9
          : t.protein_g * 4 + t.carbs_g * 4 + t.fat_g * 9;
        expect(Math.abs(fromMacros - t.calories), where).toBeLessThanOrEqual(50);
        // A total-carb target can at least hold the fibre target.
        if (t.carbs_mode === "total") expect(t.carbs_g, where).toBeGreaterThanOrEqual(t.fiber_g);
        expect(e.goal_adjustment === 0 || Math.sign(e.goal_adjustment) === (p.goal === "lose" ? -1 : 1), where).toBe(true);
      }
    }
  });

  it("heavier never means fewer calories, and more active never means fewer calories", () => {
    for (const key of COMPUTED) {
      const base = { sex: "female" as const, age: 40, height_cm: 165, goal: "maintain" as const };
      const byWeight = [50, 70, 90, 110].map((weight_kg) => computeTargets(key, { ...base, weight_kg, activity: "light" }).targets.calories);
      const byActivity = ACTIVITY_LEVELS.map((activity) => computeTargets(key, { ...base, weight_kg: 70, activity }).targets.calories);
      expect(byWeight).toEqual([...byWeight].sort((a, b) => a - b));
      expect(byActivity).toEqual([...byActivity].sort((a, b) => a - b));
    }
  });

  it("is a pure function: same input, same output, input untouched", () => {
    const input = { ...REFERENCE };
    expect(computeTargets("balanced", input)).toEqual(computeTargets("balanced", input));
    expect(input).toEqual(REFERENCE);
  });
});

describe("inputs", () => {
  it("fills in defaults: sedentary, maintain, sex unknown", () => {
    expect(presetProfileSchema.parse({ age: 40, height_cm: 170, weight_kg: 70 })).toEqual({
      sex: null, age: 40, height_cm: 170, weight_kg: 70, activity: "sedentary", goal: "maintain", weekly_rate_kg: 0.45,
    });
  });
  it.each([
    [{ weight_kg: 134 * 5 }, "weight_kg", "cannot be more than 300 kg"],   // lbs typed into a kg field, ×5
    [{ height_cm: 5.25 }, "height_cm", "must be at least 120 cm"],         // feet typed into a cm field
    [{ activity: "couch" }, "activity", "must be one of: sedentary, light, moderate, active, very_active"],
    [{ weekly_rate_kg: 2 }, "weekly_rate_kg", "cannot be more than 1 kg per week"],
    [{ sex: "other" }, "sex", "must be female, male, or null"],
  ])("rejects %j, naming the field", (bad, field, message) => {
    const r = presetProfileSchema.safeParse({ ...REFERENCE, ...bad });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => [i.path.join("."), i.message])).toEqual([[field, message]]);
  });
  it("hand-entered targets are bounded against typos, not against choices", () => {
    expect(targetsSchema.safeParse({ calories: 1200, protein_g: 80, carbs_g: 25, carbs_mode: "net", fat_g: 80, fiber_g: 30 }).success).toBe(true);
    expect(targetsSchema.safeParse({ calories: 12000, protein_g: 80, carbs_g: 25, carbs_mode: "net", fat_g: 80, fiber_g: 30 }).success).toBe(false);
    expect(targetsSchema.safeParse({ calories: 500, protein_g: 80, carbs_g: 25, carbs_mode: "net", fat_g: 80, fiber_g: 30 }).success).toBe(false);
  });
});

describe("units", () => {
  it("feet and inches to centimetres and back", () => {
    expect(feetInchesToCm(5, 3)).toBeCloseTo(160.02);
    expect(cmToFeetInches(160)).toEqual({ feet: 5, inches: 3 });
    expect(cmToFeetInches(182.88)).toEqual({ feet: 6, inches: 0 });
    expect(cmToFeetInches(feetInchesToCm(5, 11.6))).toEqual({ feet: 6, inches: 0 }); // rounds up across the foot, never "5 ft 12 in"
  });
});
