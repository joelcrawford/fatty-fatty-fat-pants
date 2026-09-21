// The arithmetic of the app, in one place, so the API, the web app and the
// mobile app cannot disagree about what a number means.

import type { Macros } from "./types";

/** Round to `places` decimals (default 1), the precision macros are shown and stored at. */
export function round(n: number, places = 1): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/**
 * Net carbs = total carbohydrate minus fibre, never below zero.
 * Fibre is not digested into glucose, so low-carb protocols do not count it.
 * (A fibre supplement can carry more fibre than carbohydrate; that is 0, not negative.)
 */
export function netCarbs(carbs: number, fiber: number): number {
  return Math.max(0, carbs - fiber);
}

/**
 * Macros for `amount` of a food whose figures are per `defaultServing`.
 * Calories are whole numbers; grams keep one decimal. This is exactly what
 * gets written to the log, so every client must round the same way.
 */
export function scaleMacros(per: Macros, amount: number, defaultServing: number): Macros {
  const m = amount / defaultServing;
  return {
    cal: Math.round(per.cal * m),
    protein: round(per.protein * m),
    carbs: round(per.carbs * m),
    fat: round(per.fat * m),
    fiber: round(per.fiber * m),
  };
}

export const ZERO_MACROS: Macros = { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

/** Unrounded sums. Round for display, not before adding, or errors accumulate. */
export function sumMacros(entries: readonly Partial<Macros>[]): Macros {
  return entries.reduce<Macros>(
    (t, e) => ({
      cal: t.cal + (e.cal ?? 0),
      protein: t.protein + (e.protein ?? 0),
      carbs: t.carbs + (e.carbs ?? 0),
      fat: t.fat + (e.fat ?? 0),
      fiber: t.fiber + (e.fiber ?? 0),
    }),
    ZERO_MACROS
  );
}

export interface DayTotals extends Macros {
  netCarbs: number;
  exerciseCal: number;
  /** Food minus exercise. May be negative on a day with more exercise than food. */
  netCal: number;
}

/** A day's totals from its food and exercise entries. Unrounded. */
export function dayTotals(food: readonly Partial<Macros>[], exercise: readonly { cal: number }[]): DayTotals {
  const totals = sumMacros(food);
  const exerciseCal = exercise.reduce((s, e) => s + e.cal, 0);
  return { ...totals, netCarbs: netCarbs(totals.carbs, totals.fiber), exerciseCal, netCal: totals.cal - exerciseCal };
}

/**
 * Calories left against a NET target: exercise calories are earned back, so a
 * 1200 target with 293 burned allows 1493 of food. Negative means over.
 */
export function remainingCalories(targetNetCal: number, netCal: number): number {
  return targetNetCal - netCal;
}

/**
 * Calories burned per minute from a MET value and body weight.
 * The standard formula: MET × 3.5 × kg / 200.
 */
export function caloriesPerMinute(met: number, weightKg: number): number {
  return round((met * 3.5 * weightKg) / 200);
}

/**
 * Calories for a session. Deliberately computed from the ROUNDED per-minute
 * figure, the one the user is shown: "6.5 cal/min × 45 min" must come to the
 * 293 that arithmetic gives, not the 292 that full precision would.
 */
export function exerciseCalories(met: number, weightKg: number, minutes: number): number {
  return Math.round(caloriesPerMinute(met, weightKg) * minutes);
}

export const LBS_PER_KG = 2.2046226218;
export const lbsToKg = (lbs: number) => lbs / LBS_PER_KG;
export const kgToLbs = (kg: number) => kg * LBS_PER_KG;
