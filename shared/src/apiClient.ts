// Every endpoint, typed. Bring your own `request`: normally Session.request,
// which attaches the access token and refreshes it when it expires.

import type {
  FoodEntry, ExerciseEntry, WeightEntry, DaySummary, User,
  CatalogFood, CatalogExercise, CatalogMealPlan, BarcodeResult,
} from "./types";
import type { NewFoodEntry, NewExerciseEntry, NewWeightEntry, NewCustomFood } from "./schemas";
import type { PresetInfo, PresetKey, PresetProfileInput, PresetResult, ActivityLevel, Goal, Profile, ProfileInput } from "./presets";

/** Resolves to the `data` of the response envelope, or throws (Session throws ApiError). */
export type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>;

const query = (params: Record<string, string | number | undefined>) => {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return q ? `?${q}` : "";
};
const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const del: RequestInit = { method: "DELETE" };

export function createApiClient(request: RequestFn) {
  return {
    me: () => request<User>("/api/auth/me"),

    foodLog: {
      forDate: (date: string) => request<FoodEntry[]>(`/api/food/${date}`),
      add: (entry: NewFoodEntry) => request<FoodEntry>("/api/food", post(entry)),
      /** All-or-nothing. Used to log a whole recipe. */
      addBatch: (entries: NewFoodEntry[]) => request<FoodEntry[]>("/api/food/batch", post(entries)),
      remove: (id: number) => request<{ deleted_id: number }>(`/api/food/${id}`, del),
    },

    exerciseLog: {
      forDate: (date: string) => request<ExerciseEntry[]>(`/api/exercise/${date}`),
      add: (entry: NewExerciseEntry) => request<ExerciseEntry>("/api/exercise", post(entry)),
      remove: (id: number) => request<{ deleted_id: number }>(`/api/exercise/${id}`, del),
    },

    summary: {
      day: (date: string) => request<DaySummary>(`/api/summary/day/${date}`),
      /** One entry per day that has food logged, newest first. At most 366 days. */
      range: (start: string, end: string) => request<DaySummary[]>(`/api/summary/range${query({ start, end })}`),
    },

    weight: {
      /** Weighing in again on the same date replaces that day's entry. */
      log: (entry: NewWeightEntry) => request<WeightEntry>("/api/summary/weight", post(entry)),
      recent: (days = 30) => request<WeightEntry[]>(`/api/summary/weight${query({ days })}`),
    },

    catalog: {
      foods: (opts: { q?: string; category?: string; scope?: "all" | "mine" | "builtin" } = {}) =>
        request<CatalogFood[]>(`/api/foods${query(opts)}`),
      addFood: (food: NewCustomFood) => request<CatalogFood>("/api/foods", post(food)),
      removeFood: (id: number) => request<{ deleted_id: number }>(`/api/foods/${id}`, del),
      /** Throws ApiError 404 when the product is unknown, 400 when the barcode is malformed. */
      barcode: (barcode: string) => request<BarcodeResult>(`/api/foods/barcode/${encodeURIComponent(barcode)}`),
      exercises: () => request<CatalogExercise[]>("/api/exercises"),
      mealPlans: () => request<CatalogMealPlan[]>("/api/meal-plans"),
    },

    profile: {
      /** `profile` is null until the user has onboarded. */
      get: () => request<{ profile: Profile | null }>("/api/profile"),
      /** Completes onboarding the first time; updates afterwards. Send the whole profile. */
      save: (profile: ProfileInput) => request<{ profile: Profile }>("/api/profile", { method: "PUT", body: JSON.stringify(profile) }),
    },

    presets: {
      list: () =>
        request<{
          presets: PresetInfo[];
          disclaimer: string;
          limits: { calorie_floor: { female: number; male: number }; calorie_ceiling: number };
          activity_levels: ActivityLevel[];
          goals: Goal[];
        }>("/api/presets"),
      /** Targets for a draft profile. Saves nothing. */
      preview: (key: PresetKey, profile: PresetProfileInput) =>
        request<PresetResult & { disclaimer: string }>(`/api/presets/${key}/preview`, post(profile)),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
