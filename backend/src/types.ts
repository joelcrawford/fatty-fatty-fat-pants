export interface FoodEntry {
  id?: number;
  user_id?: number;
  date: string;
  meal: "Breakfast" | "Lunch" | "Dinner" | "Snacks";
  food_name: string;
  amount: string;
  cal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  created_at?: string;
}

export interface ExerciseEntry {
  id?: number;
  user_id?: number;
  date: string;
  name: string;
  duration: string;
  cal: number;
  created_at?: string;
}

export interface WeightEntry {
  id?: number;
  user_id?: number;
  date: string;
  weight_lbs: number;
  notes?: string;
  created_at?: string;
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

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
