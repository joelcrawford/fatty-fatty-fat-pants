// What the API sends back. Field names are the API's own (snake_case).

import type { Meal } from "./constants";

/** Every response is one of these two envelopes. */
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: ValidationDetail[] };

export interface ValidationDetail {
  /** Where the problem is, e.g. "meal", "1.cal" (second batch entry), "start". */
  path: string;
  message: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
}
export type AuthSession = TokenPair & { user: User };

export interface Macros {
  cal: number;
  protein: number;
  /** TOTAL carbohydrate, fibre included. Net carbs is derived: see netCarbs(). */
  carbs: number;
  fat: number;
  fiber: number;
}

export interface FoodEntry extends Macros {
  id: number;
  user_id: number;
  date: string; // YYYY-MM-DD, the user's local calendar day
  meal: Meal;
  food_name: string;
  amount: string; // human-readable, e.g. "100 g"
  created_at: string;
}

export interface ExerciseEntry {
  id: number;
  user_id: number;
  date: string;
  name: string;
  duration: string; // human-readable, e.g. "45 min"
  cal: number;
  created_at: string;
}

export interface WeightEntry {
  id: number;
  user_id: number;
  date: string;
  weight_lbs: number;
  notes: string | null;
  created_at: string;
}

export interface DaySummary {
  date: string;
  total_cal: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  total_fiber: number;
  net_carbs: number;
  exercise_cal: number;
  net_cal: number;
}

/** A food in the catalog. Macros are per `default_serving` of `unit`. */
export interface CatalogFood extends Macros {
  /** Null only for a barcode result that has not been saved. */
  id: number | null;
  name: string;
  category: string;
  unit: string;
  default_serving: number;
  barcode: string | null;
  /** True for a food this user added; only those can be deleted. */
  custom: boolean;
}

export interface CatalogExercise {
  id: number;
  name: string;
  /** cal/min = met × 3.5 × body weight (kg) / 200. See caloriesPerMinute(). */
  met: number;
  cal_per_min: number;
  cal_per_min_weight_kg: number;
}

export interface CatalogMealPlan {
  id: number;
  name: string;
  meal_type: Meal;
  badge: string;
  description: string;
  items: { serving_amount: number; food: CatalogFood }[];
}

export type BarcodeResult =
  | { source: "custom"; barcode: string; food: CatalogFood }
  | {
      source: "openfoodfacts";
      barcode: string;
      food: CatalogFood;
      brand: string;
      suggested_serving: number | null;
      missing: ("name" | "cal" | "protein" | "carbs" | "fat" | "fiber")[];
      carbs_basis: "label_total" | "label_net_plus_fibre";
      plausible: boolean;
    };
