// api.ts — the web app's view of the API.
//
// The typed client and all entity types come from the shared package (the
// mobile app uses the same ones). What remains here is an adapter: App.tsx
// predates the API and uses camelCase shapes for catalog data, so the catalog
// is translated on the way in and out. New code should use `client` directly.

import { createApiClient, CatalogFood as ApiFood, Meal } from "@nutrition/shared";
import { session } from "./session";

export type { FoodEntry, ExerciseEntry, WeightEntry, DaySummary, NewFoodEntry, NewExerciseEntry } from "@nutrition/shared";

export const client = createApiClient((path, init) => session.request(path, init));

// ── Catalog (legacy shapes) ──────────────────────────────────────────────────

export interface Food {
  id: number; name: string; cal: number; protein: number; carbs: number; fat: number; fiber: number;
  unit: string; defaultServing: number; category: string;
  /** True for a food this user added; only those can be deleted. */
  custom: boolean;
}
export interface Exercise { name: string; calPerMin: number }
export interface MealPlan {
  id: number; name: string; mealType: Meal; badge: string; description: string;
  items: { foodId: number; servingAmount: number }[];
}

const toFood = (f: ApiFood): Food => ({
  id: f.id!, name: f.name, category: f.category, unit: f.unit, defaultServing: f.default_serving,
  cal: f.cal, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber, custom: f.custom,
});

const catalog = {
  /** Everything the app needs to offer foods, exercises and recipes, in one go. */
  load: async (): Promise<{ foods: Food[]; exercises: Exercise[]; mealPlans: MealPlan[] }> => {
    const [foods, exercises, plans] = await Promise.all([client.catalog.foods(), client.catalog.exercises(), client.catalog.mealPlans()]);
    return {
      foods: foods.map(toFood),
      exercises: exercises.map(e => ({ name: e.name, calPerMin: e.cal_per_min })),
      mealPlans: plans.map(p => ({
        id: p.id, name: p.name, mealType: p.meal_type, badge: p.badge, description: p.description,
        items: p.items.map(i => ({ foodId: i.food.id!, servingAmount: i.serving_amount })),
      })),
    };
  },

  addFood: async (f: Omit<Food, "id" | "custom">): Promise<Food> =>
    toFood(await client.catalog.addFood({
      name: f.name, category: f.category, unit: f.unit, default_serving: f.defaultServing,
      cal: f.cal, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber,
    })),

  deleteFood: (id: number) => client.catalog.removeFood(id),
};

export const api = {
  catalog,
  food: { getByDate: client.foodLog.forDate, add: client.foodLog.add, addBatch: client.foodLog.addBatch, delete: client.foodLog.remove },
  exercise: { getByDate: client.exerciseLog.forDate, add: client.exerciseLog.add, delete: client.exerciseLog.remove },
  summary: { getDay: client.summary.day, getRange: client.summary.range, logWeight: client.weight.log, getWeight: client.weight.recent },
};
