export const MEALS = ["Breakfast", "Lunch", "Dinner", "Snacks"] as const;
export type Meal = (typeof MEALS)[number];
