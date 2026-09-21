// Presets: named nutrition plans that turn a person's stats into daily targets.
//
// A preset is a RULE, not a row of fixed numbers. Pure functions, no I/O, so
// the API and every client compute exactly the same thing, and so the rules
// can be unit-tested with worked examples.
//
// NOT MEDICAL ADVICE. These are conventional starting points from published
// formulas. Every number is shown to the user before it is saved and every
// number is editable. See DISCLAIMER and each preset's `notFor`.

import { z } from "zod";

// ── What we need to know about a person ──────────────────────────────────────

export const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "active", "very_active"] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

/** Multipliers applied to resting energy (the standard Harris-Benedict activity factors). */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,     // desk job, little deliberate exercise
  light: 1.375,       // light exercise 1–3 days a week
  moderate: 1.55,     // moderate exercise 3–5 days a week
  active: 1.725,      // hard exercise 6–7 days a week
  very_active: 1.9,   // physical job, or training twice a day
};

export const GOALS = ["lose", "maintain", "gain"] as const;
export type Goal = (typeof GOALS)[number];

/** Metric throughout. Clients convert from lbs and ft/in (see units helpers below). */
export const presetProfileSchema = z.object({
  // The energy formula and the calorie floor both depend on sex. It may be
  // withheld: the formula then uses the midpoint and the HIGHER floor applies.
  sex: z.enum(["female", "male"], { errorMap: () => ({ message: "must be female, male, or null" }) }).nullable().default(null),
  age: z
    .number({ required_error: "is required", invalid_type_error: "must be a number" })
    .int("must be a whole number")
    .min(18, "this app is for adults: must be at least 18")
    .max(100, "cannot be more than 100"),
  height_cm: z
    .number({ required_error: "is required", invalid_type_error: "must be a number" })
    .min(120, "must be at least 120 cm")
    .max(230, "cannot be more than 230 cm"),
  weight_kg: z
    .number({ required_error: "is required", invalid_type_error: "must be a number" })
    .min(30, "must be at least 30 kg")
    .max(300, "cannot be more than 300 kg"),
  activity: z.enum(ACTIVITY_LEVELS, { errorMap: () => ({ message: `must be one of: ${ACTIVITY_LEVELS.join(", ")}` }) }).default("sedentary"),
  goal: z.enum(GOALS, { errorMap: () => ({ message: `must be one of: ${GOALS.join(", ")}` }) }).default("maintain"),
  /** How fast to lose or gain, in kg per week. Ignored when the goal is "maintain". */
  weekly_rate_kg: z
    .number({ invalid_type_error: "must be a number" })
    .min(0, "cannot be negative")
    .max(1, "cannot be more than 1 kg per week")
    .default(0.45), // about 1 lb
});
export type PresetProfile = z.infer<typeof presetProfileSchema>;
export type PresetProfileInput = z.input<typeof presetProfileSchema>;

// ── What a preset produces ───────────────────────────────────────────────────

export interface Targets {
  /** NET calories: exercise is earned back on top of this (see remainingCalories). */
  calories: number;
  protein_g: number;
  /** Interpreted according to carbs_mode. */
  carbs_g: number;
  /** "net" = carbohydrate minus fibre (low-carb protocols); "total" = as on the label. */
  carbs_mode: "net" | "total";
  fat_g: number;
  fiber_g: number;
}

/** Bounds for targets a user types in or edits by hand. Wide on purpose: a guard against typos, not advice. */
export const targetsSchema = z.object({
  calories: z.number({ required_error: "is required", invalid_type_error: "must be a number" }).int("must be a whole number").min(800, "must be at least 800").max(6000, "cannot be more than 6000"),
  protein_g: z.number({ required_error: "is required", invalid_type_error: "must be a number" }).min(0, "cannot be negative").max(500, "cannot be more than 500"),
  carbs_g: z.number({ required_error: "is required", invalid_type_error: "must be a number" }).min(0, "cannot be negative").max(1000, "cannot be more than 1000"),
  carbs_mode: z.enum(["net", "total"], { errorMap: () => ({ message: "must be net or total" }) }),
  fat_g: z.number({ required_error: "is required", invalid_type_error: "must be a number" }).min(0, "cannot be negative").max(500, "cannot be more than 500"),
  fiber_g: z.number({ required_error: "is required", invalid_type_error: "must be a number" }).min(0, "cannot be negative").max(150, "cannot be more than 150"),
});

/** How the numbers were arrived at, for the review screen. Nothing here is hidden from the user. */
export interface TargetsExplanation {
  /** Resting energy (Mifflin-St Jeor), kcal/day. */
  bmr: number;
  /** bmr × activity factor: estimated calories burned on an ordinary day. */
  maintenance: number;
  /** Daily kcal removed (negative) or added (positive) for the goal, AFTER any cap. */
  goal_adjustment: number;
  /** The requested rate was reduced to the safe maximum. */
  rate_capped: boolean;
  /** The safe-minimum calorie floor, and whether it is what set the calorie target. */
  calorie_floor: number;
  floor_applied: boolean;
  /** The estimate exceeded CALORIE_CEILING and was held there. */
  ceiling_applied: boolean;
  /** Protein was limited to 35% of calories (the accepted upper range). */
  protein_capped: boolean;
}

export interface PresetResult {
  preset: PresetKey;
  targets: Targets;
  explanation: TargetsExplanation;
}

// ── The presets ──────────────────────────────────────────────────────────────

export const PRESET_KEYS = ["galveston_style", "balanced", "high_protein", "low_carb", "custom"] as const;
export type PresetKey = (typeof PRESET_KEYS)[number];

export interface PresetInfo {
  key: PresetKey;
  name: string;
  summary: string;
  whoFor: string;
  /** Shown before the preset can be chosen. */
  notFor: string[];
  carbs_mode: "net" | "total";
  /** Which numbers lead the dashboard for someone on this plan. */
  emphasis: ("calories" | "protein" | "carbs" | "fat" | "fiber")[];
  /** Where the numbers come from. Health claims need sources. */
  sources: string[];
  /** False only for "custom", which has no formula. */
  computed: boolean;
}

const ENERGY_SOURCE = "Energy needs: Mifflin MD, St Jeor ST, et al. Am J Clin Nutr 1990;51:241–7, with standard activity factors.";
const AMDR_SOURCE = "Macronutrient ranges: Institute of Medicine, Dietary Reference Intakes (2005), Acceptable Macronutrient Distribution Ranges.";
const FIBRE_SOURCE = "Fibre: 14 g per 1,000 kcal, Dietary Guidelines for Americans.";
const COMMON_NOT_FOR = ["Anyone under 18", "Pregnancy or breastfeeding", "Anyone with, or recovering from, an eating disorder"];

export const PRESETS: Record<PresetKey, PresetInfo> = {
  galveston_style: {
    key: "galveston_style",
    // "Galveston-style", never "Galveston Diet": the latter is someone else's
    // brand and this app is not affiliated with or endorsed by it.
    name: "Galveston-style, muscle-preserving",
    summary: "Anti-inflammatory and fat-forward, with low net carbs, 30 g of fibre, and protein raised to protect muscle.",
    whoFor: "Women in perimenopause or menopause who strength train and want to lose fat without losing muscle.",
    notFor: [...COMMON_NOT_FOR, "Diabetes treated with insulin or sulfonylureas, unless your doctor agrees: low-carb eating changes medication needs", "Kidney disease, unless your doctor agrees to the protein level"],
    carbs_mode: "net",
    emphasis: ["carbs", "fiber", "protein", "calories"],
    sources: [
      ENERGY_SOURCE,
      "Approach inspired by the anti-inflammatory, low-net-carb eating pattern popularised for menopause by Dr Mary Claire Haver. Not affiliated with or endorsed by The Galveston Diet.",
      "Protein 1.3 g/kg: within the 1.2–1.6 g/kg range studied for preserving muscle in postmenopausal women doing resistance training.",
    ],
    computed: true,
  },
  balanced: {
    key: "balanced",
    name: "Balanced",
    summary: "A conventional split: moderate protein, 30% of calories from fat, the rest from carbohydrate.",
    whoFor: "General healthy eating, or anyone who wants to track without following a particular protocol.",
    notFor: COMMON_NOT_FOR,
    carbs_mode: "total",
    emphasis: ["calories", "protein", "fiber"],
    sources: [ENERGY_SOURCE, AMDR_SOURCE, FIBRE_SOURCE],
    computed: true,
  },
  high_protein: {
    key: "high_protein",
    name: "High protein",
    summary: "Protein at 1.8 g per kg of body weight, moderate fat, the rest from carbohydrate.",
    whoFor: "Strength training, or keeping muscle while losing weight.",
    notFor: [...COMMON_NOT_FOR, "Kidney disease, unless your doctor agrees to the protein level"],
    carbs_mode: "total",
    emphasis: ["protein", "calories", "fiber"],
    sources: [
      ENERGY_SOURCE,
      "Protein 1.4–2.0 g/kg for people who train: Jäger R, et al. ISSN Position Stand: protein and exercise. J Int Soc Sports Nutr 2017;14:20.",
      AMDR_SOURCE,
      FIBRE_SOURCE,
    ],
    computed: true,
  },
  low_carb: {
    key: "low_carb",
    name: "Low carb",
    summary: "Net carbs held to 50 g a day, moderate protein, the rest from fat.",
    whoFor: "People who feel and eat better with fewer carbohydrates, without following a named protocol.",
    notFor: [...COMMON_NOT_FOR, "Diabetes treated with insulin or sulfonylureas, unless your doctor agrees: low-carb eating changes medication needs"],
    carbs_mode: "net",
    emphasis: ["carbs", "protein", "calories", "fiber"],
    sources: [ENERGY_SOURCE, "50 g of net carbohydrate a day is a common working definition of a low-carbohydrate (not ketogenic) diet."],
    computed: true,
  },
  custom: {
    key: "custom",
    name: "Custom",
    summary: "Enter your own numbers, from a dietitian, a doctor, or your own experience.",
    whoFor: "Anyone who already knows their targets.",
    notFor: [],
    carbs_mode: "net",
    emphasis: ["calories", "protein", "carbs", "fat", "fiber"],
    sources: [],
    computed: false,
  },
};

export const DISCLAIMER =
  "These targets are general estimates from published formulas, not medical advice. " +
  "Talk to your doctor or a registered dietitian before changing how you eat, especially if you are " +
  "pregnant, take medication for diabetes or blood pressure, or have a medical condition. You can change any number.";

// ── Safety limits ────────────────────────────────────────────────────────────

/** Computed targets never go below these, whatever the goal. Decided 2026-09-21. */
export const CALORIE_FLOOR = { female: 1200, male: 1500 } as const;

/** When sex is withheld the HIGHER floor applies: the cautious choice when we cannot tell. */
export function calorieFloor(sex: PresetProfile["sex"]): number {
  return sex === "female" ? CALORIE_FLOOR.female : CALORIE_FLOOR.male;
}

/**
 * Computed targets never go above this either. The formulas are estimates, and
 * at the extremes (very heavy AND very active AND gaining) they extrapolate
 * past anything they were validated on. Someone who really needs more can
 * enter their own numbers with the Custom preset.
 */
export const CALORIE_CEILING = 5000;

/** Fastest loss we will plan for: 1% of body weight a week, and never more than 1 kg. */
export function maxWeeklyLossKg(weightKg: number): number {
  return Math.min(1, weightKg * 0.01);
}
const MAX_WEEKLY_GAIN_KG = 0.5;

/** Energy in a kilogram of body-weight change (the conventional 3,500 kcal per lb). */
const KCAL_PER_KG = 7700;

// ── The maths ────────────────────────────────────────────────────────────────

/**
 * Resting energy, kcal/day (Mifflin-St Jeor, the most accurate of the simple
 * equations for the general population). The sex constant is +5 for men and
 * −161 for women; when sex is withheld the midpoint is used.
 */
export function restingEnergy(p: Pick<PresetProfile, "sex" | "age" | "height_cm" | "weight_kg">): number {
  const sexConstant = p.sex === "male" ? 5 : p.sex === "female" ? -161 : -78;
  return 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age + sexConstant;
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

// Energy per gram. Fibre is counted at 2 kcal/g (it is partly fermented, not
// absorbed as glucose), which matters when carbohydrate is tracked net of it.
const KCAL = { protein: 4, carbs: 4, fat: 9, fiber: 2 };

interface Recipe {
  proteinPerKg: number;
  /** Net-carb plans fix carbohydrate and let fat take the remainder; total-carb plans fix fat and let carbohydrate take it. */
  plan: { mode: "net"; netCarbs: (calories: number) => number; fiber: (calories: number) => number }
      | { mode: "total"; fatShare: number; fiber: (calories: number) => number };
}

const fibrePer1000 = (calories: number) => Math.max(25, (calories / 1000) * 14);

const RECIPES: Record<Exclude<PresetKey, "custom">, Recipe> = {
  // About 8% of calories from net carbohydrate and never less than 25 g, which
  // is 25 g at 1,200 kcal: the original plan's figure.
  galveston_style: { proteinPerKg: 1.3, plan: { mode: "net", netCarbs: (c) => Math.max(25, (c * (1 / 12)) / KCAL.carbs), fiber: () => 30 } },
  low_carb: { proteinPerKg: 1.4, plan: { mode: "net", netCarbs: () => 50, fiber: () => 30 } },
  balanced: { proteinPerKg: 1.0, plan: { mode: "total", fatShare: 0.3, fiber: fibrePer1000 } },
  high_protein: { proteinPerKg: 1.8, plan: { mode: "total", fatShare: 0.25, fiber: fibrePer1000 } },
};

/**
 * Daily targets for a preset and a person.
 *
 * Throws for "custom", which has no formula: the user supplies those numbers
 * (validate them with targetsSchema).
 */
export function computeTargets(preset: PresetKey, profileInput: PresetProfileInput): PresetResult {
  if (preset === "custom") throw new Error('The "custom" preset has no formula; its targets are entered by the user');
  const p = presetProfileSchema.parse(profileInput);
  const recipe = RECIPES[preset];

  // 1. Calories.
  const bmr = restingEnergy(p);
  const maintenance = bmr * ACTIVITY_FACTORS[p.activity];

  const requested = p.goal === "maintain" ? 0 : p.weekly_rate_kg;
  const allowed = p.goal === "lose" ? Math.min(requested, maxWeeklyLossKg(p.weight_kg)) : p.goal === "gain" ? Math.min(requested, MAX_WEEKLY_GAIN_KG) : 0;
  const dailyAdjustment = ((allowed * KCAL_PER_KG) / 7) * (p.goal === "lose" ? -1 : 1);

  const floor = calorieFloor(p.sex);
  const unfloored = maintenance + dailyAdjustment;
  const calories = roundTo(Math.min(CALORIE_CEILING, Math.max(floor, unfloored)), 10);

  // 2. Protein, by body weight, within the accepted upper range of 35% of calories.
  const proteinByWeight = recipe.proteinPerKg * p.weight_kg;
  const proteinCeiling = (calories * 0.35) / KCAL.protein;
  const protein_g = roundTo(Math.min(proteinByWeight, proteinCeiling), 5);

  // 3. Fibre, then the two remaining macros.
  const fiber_g = Math.round(recipe.plan.fiber(calories));
  let carbs_g: number;
  let fat_g: number;

  if (recipe.plan.mode === "net") {
    carbs_g = roundTo(recipe.plan.netCarbs(calories), 5);
    // Fat is what is left once protein, net carbohydrate and fibre are paid for.
    fat_g = roundTo((calories - protein_g * KCAL.protein - carbs_g * KCAL.carbs - fiber_g * KCAL.fiber) / KCAL.fat, 5);
  } else {
    fat_g = roundTo((calories * recipe.plan.fatShare) / KCAL.fat, 5);
    // Total carbohydrate (fibre included, as on a label) is what is left.
    carbs_g = roundTo((calories - protein_g * KCAL.protein - fat_g * KCAL.fat) / KCAL.carbs, 5);
  }

  return {
    preset,
    targets: { calories, protein_g, carbs_g, carbs_mode: recipe.plan.mode, fat_g, fiber_g },
    explanation: {
      bmr: Math.round(bmr),
      maintenance: Math.round(maintenance),
      goal_adjustment: Math.round(dailyAdjustment),
      rate_capped: allowed < requested,
      calorie_floor: floor,
      floor_applied: unfloored < floor,
      ceiling_applied: unfloored > CALORIE_CEILING,
      protein_capped: proteinByWeight > proteinCeiling,
    },
  };
}

// ── Units ────────────────────────────────────────────────────────────────────
// People think in lbs and feet; the formulas are metric. (lbs ↔ kg is in nutrition.ts.)

export const CM_PER_INCH = 2.54;
export const feetInchesToCm = (feet: number, inches = 0) => (feet * 12 + inches) * CM_PER_INCH;
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}
