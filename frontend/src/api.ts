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

// ── Food ─────────────────────────────────────────────────────────────────────

export const api = {
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
