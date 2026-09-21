// api.ts — all communication with the Node.js backend.
// Every call goes through the session, which attaches the access token and
// transparently refreshes it once when it expires (see session.ts).

import { session } from "./session";

const request = <T>(path: string, options?: RequestInit): Promise<T> => session.request<T>(path, options);

// ── Types ────────────────────────────────────────────────────────────────────

export interface FoodEntry {
  id?: number;
  date: string;
  meal: string;
  food_name: string;
  amount: string;
  cal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface ExerciseEntry {
  id?: number;
  date: string;
  name: string;
  duration: string;
  cal: number;
}

export interface WeightEntry {
  id?: number;
  date: string;
  weight_lbs: number;
  notes?: string;
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

// ── Catalog ──────────────────────────────────────────────────────────────────

export interface Food {
  id: number; name: string; cal: number; protein: number; carbs: number; fat: number; fiber: number;
  unit: string; defaultServing: number; category: string;
  /** True for a food this user added; only those can be deleted. */
  custom: boolean;
}
export interface Exercise { name: string; calPerMin: number }
export interface MealPlan {
  id: number; name: string; mealType: "Breakfast" | "Lunch" | "Dinner" | "Snacks"; badge: string; description: string;
  items: { foodId: number; servingAmount: number }[];
}

interface ApiFood {
  id: number; name: string; category: string; unit: string; default_serving: number;
  cal: number; protein: number; carbs: number; fat: number; fiber: number; custom: boolean;
}
const toFood = (f: ApiFood): Food => ({
  id: f.id, name: f.name, category: f.category, unit: f.unit, defaultServing: f.default_serving,
  cal: f.cal, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber, custom: f.custom,
});

const catalog = {
  /** Everything the app needs to offer foods, exercises and recipes, in one go. */
  load: async (): Promise<{ foods: Food[]; exercises: Exercise[]; mealPlans: MealPlan[] }> => {
    const [foods, exercises, plans] = await Promise.all([
      request<ApiFood[]>("/api/foods"),
      request<{ name: string; cal_per_min: number }[]>("/api/exercises"),
      request<{ id: number; name: string; meal_type: MealPlan["mealType"]; badge: string; description: string; items: { serving_amount: number; food: ApiFood }[] }[]>("/api/meal-plans"),
    ]);
    return {
      foods: foods.map(toFood),
      exercises: exercises.map(e => ({ name: e.name, calPerMin: e.cal_per_min })),
      mealPlans: plans.map(p => ({
        id: p.id, name: p.name, mealType: p.meal_type, badge: p.badge, description: p.description,
        items: p.items.map(i => ({ foodId: i.food.id, servingAmount: i.serving_amount })),
      })),
    };
  },

  addFood: async (f: Omit<Food, "id" | "custom">): Promise<Food> =>
    toFood(await request<ApiFood>("/api/foods", {
      method: "POST",
      body: JSON.stringify({ name: f.name, category: f.category, unit: f.unit, default_serving: f.defaultServing, cal: f.cal, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber }),
    })),

  deleteFood: (id: number) => request<{ deleted_id: number }>(`/api/foods/${id}`, { method: "DELETE" }),
};

// ── Food ─────────────────────────────────────────────────────────────────────

export const api = {
  catalog,
  food: {
    getByDate: (date: string) =>
      request<FoodEntry[]>(`/api/food/${date}`),

    add: (entry: Omit<FoodEntry, "id">) =>
      request<FoodEntry>("/api/food", {
        method: "POST",
        body: JSON.stringify(entry),
      }),

    addBatch: (entries: Omit<FoodEntry, "id">[]) =>
      request<FoodEntry[]>("/api/food/batch", {
        method: "POST",
        body: JSON.stringify(entries),
      }),

    delete: (id: number) =>
      request<{ deleted_id: number }>(`/api/food/${id}`, { method: "DELETE" }),
  },

  exercise: {
    getByDate: (date: string) =>
      request<ExerciseEntry[]>(`/api/exercise/${date}`),

    add: (entry: Omit<ExerciseEntry, "id">) =>
      request<ExerciseEntry>("/api/exercise", {
        method: "POST",
        body: JSON.stringify(entry),
      }),

    delete: (id: number) =>
      request<{ deleted_id: number }>(`/api/exercise/${id}`, { method: "DELETE" }),
  },

  summary: {
    getDay: (date: string) =>
      request<DaySummary>(`/api/summary/day/${date}`),

    getRange: (start: string, end: string) =>
      request<DaySummary[]>(`/api/summary/range?start=${start}&end=${end}`),

    logWeight: (entry: WeightEntry) =>
      request<WeightEntry>("/api/summary/weight", {
        method: "POST",
        body: JSON.stringify(entry),
      }),

    getWeight: (days = 30) =>
      request<WeightEntry[]>(`/api/summary/weight?days=${days}`),
  },
};
