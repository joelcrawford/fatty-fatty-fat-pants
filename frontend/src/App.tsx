import { useState, useEffect, useCallback } from "react";
import { api, FoodEntry, ExerciseEntry } from "./api";

// ── Targets (Galveston-modified for Katarina) ─────────────────────────────────
const DAILY_CAL = 1200;
const PROTEIN_TARGET = 80;
const CARBS_TARGET = 25;
const FAT_TARGET = 80;
const FIBER_TARGET = 30;
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snacks"] as const;
type Meal = typeof MEALS[number];

const C = {
  bg: "#F8F5F0", card: "#FFFFFF", primary: "#3D5A4C", accent: "#C4714A",
  gold: "#C9963A", text: "#2C2C2C", muted: "#8A8A8A", border: "#E8E4DC",
  protein: "#C4714A", carbs: "#C9963A", fat: "#5E9478", fiber: "#7B6BB0",
};

// ── Food Library ──────────────────────────────────────────────────────────────
interface Food {
  id: number; name: string; cal: number; protein: number; carbs: number;
  fat: number; fiber: number; unit: string; defaultServing: number; category: string;
}

const FOOD_LIBRARY: Food[] = [
  { id: 1, name: "Chicken Breast (cooked)", cal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 2, name: "Salmon (cooked)", cal: 208, protein: 20, carbs: 0, fat: 13, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 3, name: "Egg (large)", cal: 78, protein: 6, carbs: 0.6, fat: 5, fiber: 0, unit: "egg", defaultServing: 1, category: "Protein" },
  { id: 4, name: "Greek Yogurt (plain, 0% fat)", cal: 100, protein: 17, carbs: 6, fat: 0.7, fiber: 0, unit: "g", defaultServing: 170, category: "Dairy" },
  { id: 5, name: "Cottage Cheese (1%)", cal: 81, protein: 14, carbs: 3, fat: 1.2, fiber: 0, unit: "g", defaultServing: 113, category: "Dairy" },
  { id: 6, name: "Tofu (firm)", cal: 76, protein: 8, carbs: 2, fat: 4.3, fiber: 0.4, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 7, name: "Tuna (canned in water)", cal: 109, protein: 25, carbs: 0, fat: 0.8, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 8, name: "Turkey Breast (cooked)", cal: 135, protein: 30, carbs: 0, fat: 1, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 9, name: "Shrimp (cooked)", cal: 99, protein: 24, carbs: 0.3, fat: 0.3, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 10, name: "Ground Beef (90% lean)", cal: 218, protein: 26, carbs: 0, fat: 12, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 11, name: "Milk (2%)", cal: 122, protein: 8, carbs: 12, fat: 5, fiber: 0, unit: "ml", defaultServing: 240, category: "Dairy" },
  { id: 12, name: "Cheddar Cheese", cal: 113, protein: 7, carbs: 0.4, fat: 9.3, fiber: 0, unit: "g", defaultServing: 28, category: "Dairy" },
  { id: 13, name: "Mozzarella (part skim)", cal: 71, protein: 7, carbs: 0.8, fat: 4.5, fiber: 0, unit: "g", defaultServing: 28, category: "Dairy" },
  { id: 14, name: "Oatmeal (cooked)", cal: 166, protein: 5.9, carbs: 28, fat: 3.6, fiber: 4, unit: "g", defaultServing: 234, category: "Grains" },
  { id: 15, name: "Brown Rice (cooked)", cal: 216, protein: 5, carbs: 45, fat: 1.8, fiber: 3.5, unit: "g", defaultServing: 195, category: "Grains" },
  { id: 16, name: "Quinoa (cooked)", cal: 222, protein: 8, carbs: 39, fat: 3.5, fiber: 5.2, unit: "g", defaultServing: 185, category: "Grains" },
  { id: 17, name: "Whole Wheat Bread", cal: 69, protein: 3.6, carbs: 12, fat: 1, fiber: 1.9, unit: "slice", defaultServing: 1, category: "Grains" },
  { id: 18, name: "Pasta (cooked)", cal: 220, protein: 8, carbs: 43, fat: 1.3, fiber: 2.5, unit: "g", defaultServing: 140, category: "Grains" },
  { id: 19, name: "White Rice (cooked)", cal: 206, protein: 4, carbs: 45, fat: 0.4, fiber: 0.6, unit: "g", defaultServing: 186, category: "Grains" },
  { id: 20, name: "Broccoli", cal: 31, protein: 2.6, carbs: 6, fat: 0.3, fiber: 2.6, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 21, name: "Spinach (raw)", cal: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 22, name: "Kale", cal: 49, protein: 4.3, carbs: 9, fat: 0.9, fiber: 3.6, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 23, name: "Carrots", cal: 41, protein: 0.9, carbs: 10, fat: 0.2, fiber: 2.8, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 24, name: "Sweet Potato", cal: 86, protein: 1.6, carbs: 20, fat: 0.1, fiber: 3, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 25, name: "Tomato", cal: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 26, name: "Cucumber", cal: 15, protein: 0.7, carbs: 3.6, fat: 0.1, fiber: 0.5, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 27, name: "Bell Pepper", cal: 31, protein: 1, carbs: 6, fat: 0.3, fiber: 2.1, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 28, name: "Avocado", cal: 160, protein: 2, carbs: 9, fat: 15, fiber: 6.7, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 29, name: "Zucchini", cal: 17, protein: 1.2, carbs: 3.1, fat: 0.3, fiber: 1, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 30, name: "Apple (medium)", cal: 95, protein: 0.5, carbs: 25, fat: 0.3, fiber: 4.4, unit: "apple", defaultServing: 1, category: "Fruit" },
  { id: 31, name: "Banana (medium)", cal: 105, protein: 1.3, carbs: 27, fat: 0.4, fiber: 3.1, unit: "banana", defaultServing: 1, category: "Fruit" },
  { id: 32, name: "Blueberries", cal: 84, protein: 1.1, carbs: 21, fat: 0.5, fiber: 3.6, unit: "g", defaultServing: 148, category: "Fruit" },
  { id: 33, name: "Strawberries", cal: 49, protein: 1, carbs: 12, fat: 0.5, fiber: 3, unit: "g", defaultServing: 152, category: "Fruit" },
  { id: 34, name: "Orange (medium)", cal: 62, protein: 1.2, carbs: 15, fat: 0.2, fiber: 3.1, unit: "orange", defaultServing: 1, category: "Fruit" },
  { id: 35, name: "Grapes", cal: 104, protein: 1.1, carbs: 27, fat: 0.2, fiber: 1.4, unit: "g", defaultServing: 151, category: "Fruit" },
  { id: 36, name: "Olive Oil", cal: 119, protein: 0, carbs: 0, fat: 13.5, fiber: 0, unit: "tbsp", defaultServing: 1, category: "Fats" },
  { id: 37, name: "Almonds", cal: 164, protein: 6, carbs: 6, fat: 14, fiber: 3.5, unit: "g", defaultServing: 28, category: "Fats" },
  { id: 38, name: "Walnuts", cal: 185, protein: 4.3, carbs: 3.9, fat: 18.5, fiber: 2, unit: "g", defaultServing: 28, category: "Fats" },
  { id: 39, name: "Peanut Butter (natural)", cal: 188, protein: 8, carbs: 6, fat: 16, fiber: 1.9, unit: "tbsp", defaultServing: 2, category: "Fats" },
  { id: 40, name: "Butter", cal: 102, protein: 0.1, carbs: 0, fat: 11.5, fiber: 0, unit: "tbsp", defaultServing: 1, category: "Fats" },
  { id: 41, name: "Black Beans (cooked)", cal: 227, protein: 15, carbs: 41, fat: 0.9, fiber: 15, unit: "g", defaultServing: 172, category: "Legumes" },
  { id: 42, name: "Lentils (cooked)", cal: 230, protein: 18, carbs: 40, fat: 0.8, fiber: 15.6, unit: "g", defaultServing: 198, category: "Legumes" },
  { id: 43, name: "Hummus", cal: 70, protein: 2, carbs: 8, fat: 3, fiber: 2, unit: "tbsp", defaultServing: 2, category: "Legumes" },
  { id: 44, name: "Whey Protein Powder", cal: 120, protein: 24, carbs: 3, fat: 1.5, fiber: 0, unit: "scoop", defaultServing: 1, category: "Protein" },
  { id: 45, name: "Coffee (black)", cal: 2, protein: 0.3, carbs: 0, fat: 0, fiber: 0, unit: "cup", defaultServing: 1, category: "Other" },
  { id: 46, name: "Edamame (shelled)", cal: 188, protein: 18.5, carbs: 14, fat: 8, fiber: 8, unit: "g", defaultServing: 155, category: "Legumes" },
  { id: 47, name: "Sardines (in water)", cal: 149, protein: 21, carbs: 0, fat: 7, fiber: 0, unit: "g", defaultServing: 85, category: "Protein" },
  { id: 48, name: "Tempeh", cal: 193, protein: 20, carbs: 9, fat: 11, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 49, name: "Chia Seeds", cal: 138, protein: 4.7, carbs: 12, fat: 8.7, fiber: 11, unit: "tbsp", defaultServing: 2, category: "Fats" },
  { id: 50, name: "Dark Chocolate (85%)", cal: 170, protein: 2, carbs: 13, fat: 12, fiber: 3, unit: "g", defaultServing: 30, category: "Other" },
  { id: 51, name: "Cod (cooked)", cal: 90, protein: 19, carbs: 0, fat: 0.8, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 52, name: "Halibut (cooked)", cal: 111, protein: 23, carbs: 0, fat: 2.3, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 53, name: "Tilapia (cooked)", cal: 111, protein: 23, carbs: 0, fat: 2.3, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 54, name: "Trout (cooked)", cal: 150, protein: 23, carbs: 0, fat: 6, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 55, name: "Mackerel (cooked)", cal: 205, protein: 19, carbs: 0, fat: 14, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 56, name: "Crab (cooked)", cal: 97, protein: 20, carbs: 0, fat: 1.5, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 57, name: "Scallops (cooked)", cal: 111, protein: 21, carbs: 5, fat: 0.8, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 58, name: "Mussels (cooked)", cal: 172, protein: 24, carbs: 7, fat: 4.5, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 59, name: "Duck Breast (cooked)", cal: 201, protein: 28, carbs: 0, fat: 10, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 60, name: "Pork Tenderloin (cooked)", cal: 136, protein: 24, carbs: 0, fat: 3.9, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 61, name: "Lamb (lean, cooked)", cal: 218, protein: 25, carbs: 0, fat: 13, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 62, name: "Beef Sirloin (cooked)", cal: 207, protein: 30, carbs: 0, fat: 9, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 63, name: "Egg White", cal: 17, protein: 3.6, carbs: 0.2, fat: 0.1, fiber: 0, unit: "egg white", defaultServing: 1, category: "Protein" },
  { id: 64, name: "Smoked Salmon", cal: 117, protein: 18, carbs: 0, fat: 4.3, fiber: 0, unit: "g", defaultServing: 100, category: "Protein" },
  { id: 65, name: "Oysters (cooked)", cal: 79, protein: 9, carbs: 4.7, fat: 2.5, fiber: 0, unit: "g", defaultServing: 85, category: "Protein" },
  { id: 66, name: "Asparagus", cal: 20, protein: 2.2, carbs: 3.7, fat: 0.2, fiber: 2.1, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 67, name: "Brussels Sprouts", cal: 43, protein: 3.4, carbs: 9, fat: 0.3, fiber: 3.8, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 68, name: "Cauliflower", cal: 25, protein: 1.9, carbs: 5, fat: 0.3, fiber: 2, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 69, name: "Green Beans", cal: 31, protein: 1.8, carbs: 7, fat: 0.1, fiber: 3.4, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 70, name: "Mushrooms (white)", cal: 22, protein: 3.1, carbs: 3.3, fat: 0.3, fiber: 1, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 71, name: "Eggplant", cal: 25, protein: 1, carbs: 6, fat: 0.2, fiber: 3, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 72, name: "Cabbage", cal: 25, protein: 1.3, carbs: 5.8, fat: 0.1, fiber: 2.5, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 73, name: "Beets", cal: 43, protein: 1.6, carbs: 9.6, fat: 0.2, fiber: 2.8, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 74, name: "Artichoke (cooked)", cal: 64, protein: 3.5, carbs: 14, fat: 0.4, fiber: 7, unit: "g", defaultServing: 120, category: "Vegetables" },
  { id: 75, name: "Bok Choy", cal: 13, protein: 1.5, carbs: 2.2, fat: 0.2, fiber: 1, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 76, name: "Celery", cal: 16, protein: 0.7, carbs: 3, fat: 0.2, fiber: 1.6, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 77, name: "Leeks", cal: 61, protein: 1.5, carbs: 14, fat: 0.3, fiber: 1.8, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 78, name: "Romaine Lettuce", cal: 17, protein: 1.2, carbs: 3.3, fat: 0.3, fiber: 2.1, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 79, name: "Arugula", cal: 25, protein: 2.6, carbs: 3.7, fat: 0.7, fiber: 1.6, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 80, name: "Snow Peas", cal: 42, protein: 2.8, carbs: 7.5, fat: 0.2, fiber: 2.6, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 81, name: "Corn (kernels)", cal: 86, protein: 3.2, carbs: 19, fat: 1.2, fiber: 2.4, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 82, name: "Onion", cal: 40, protein: 1.1, carbs: 9.3, fat: 0.1, fiber: 1.7, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 83, name: "Butternut Squash", cal: 45, protein: 1, carbs: 12, fat: 0.1, fiber: 2, unit: "g", defaultServing: 100, category: "Vegetables" },
  { id: 84, name: "Rice Cakes (plain)", cal: 35, protein: 0.7, carbs: 7.3, fat: 0.3, fiber: 0.3, unit: "cake", defaultServing: 1, category: "Snacks" },
  { id: 85, name: "Popcorn (air-popped)", cal: 31, protein: 1, carbs: 6.2, fat: 0.4, fiber: 3.6, unit: "g", defaultServing: 28, category: "Snacks" },
  { id: 86, name: "Mixed Nuts", cal: 173, protein: 5, carbs: 6, fat: 16, fiber: 2.5, unit: "g", defaultServing: 28, category: "Snacks" },
  { id: 87, name: "Cashews", cal: 157, protein: 5.2, carbs: 9, fat: 12, fiber: 0.9, unit: "g", defaultServing: 28, category: "Snacks" },
  { id: 88, name: "Pumpkin Seeds", cal: 151, protein: 8.6, carbs: 5, fat: 13, fiber: 1.7, unit: "g", defaultServing: 28, category: "Snacks" },
  { id: 89, name: "Sunflower Seeds", cal: 166, protein: 5.5, carbs: 6.5, fat: 14, fiber: 2.4, unit: "g", defaultServing: 28, category: "Snacks" },
  { id: 90, name: "String Cheese (1 stick)", cal: 80, protein: 7, carbs: 1, fat: 5, fiber: 0, unit: "stick", defaultServing: 1, category: "Snacks" },
  { id: 91, name: "Babybel Cheese (1 wheel)", cal: 70, protein: 5, carbs: 0, fat: 6, fiber: 0, unit: "wheel", defaultServing: 1, category: "Snacks" },
  { id: 92, name: "Celery with Peanut Butter", cal: 110, protein: 4, carbs: 6, fat: 8.5, fiber: 2, unit: "serving", defaultServing: 1, category: "Snacks" },
  { id: 93, name: "Apple with Almond Butter", cal: 190, protein: 3.5, carbs: 27, fat: 8.5, fiber: 6, unit: "serving", defaultServing: 1, category: "Snacks" },
  { id: 94, name: "Hard Boiled Egg", cal: 78, protein: 6.3, carbs: 0.6, fat: 5.3, fiber: 0, unit: "egg", defaultServing: 1, category: "Snacks" },
  { id: 95, name: "Protein Bar (~200 cal)", cal: 200, protein: 20, carbs: 22, fat: 7, fiber: 5, unit: "bar", defaultServing: 1, category: "Snacks" },
  { id: 96, name: "Crackers (whole grain, 5 pcs)", cal: 80, protein: 2, carbs: 14, fat: 2, fiber: 2, unit: "serving", defaultServing: 1, category: "Snacks" },
  { id: 97, name: "Mango (sliced)", cal: 99, protein: 1.4, carbs: 25, fat: 0.6, fiber: 2.6, unit: "g", defaultServing: 165, category: "Snacks" },
  { id: 98, name: "Medjool Dates (1)", cal: 66, protein: 0.4, carbs: 18, fat: 0, fiber: 1.6, unit: "date", defaultServing: 1, category: "Snacks" },
  { id: 99, name: "Scrambled Eggs (2 eggs)", cal: 148, protein: 10, carbs: 1.6, fat: 10, fiber: 0, unit: "serving", defaultServing: 1, category: "Breakfast" },
  { id: 100, name: "Overnight Oats (basic)", cal: 215, protein: 8, carbs: 34, fat: 5, fiber: 5, unit: "serving", defaultServing: 1, category: "Breakfast" },
  { id: 101, name: "Smoothie (protein, basic)", cal: 230, protein: 24, carbs: 22, fat: 4, fiber: 3, unit: "serving", defaultServing: 1, category: "Breakfast" },
  { id: 102, name: "Granola (low sugar)", cal: 200, protein: 5, carbs: 32, fat: 7, fiber: 4, unit: "g", defaultServing: 50, category: "Breakfast" },
  { id: 103, name: "Whole Grain Pancake", cal: 92, protein: 3, carbs: 15, fat: 2.5, fiber: 1.5, unit: "pancake", defaultServing: 1, category: "Breakfast" },
  { id: 104, name: "Bagel (whole wheat)", cal: 245, protein: 10, carbs: 48, fat: 1.5, fiber: 4, unit: "bagel", defaultServing: 1, category: "Breakfast" },
  { id: 105, name: "Cream Cheese (light, 2 tbsp)", cal: 60, protein: 2.5, carbs: 2, fat: 5, fiber: 0, unit: "serving", defaultServing: 1, category: "Breakfast" },
  { id: 106, name: "English Muffin (whole wheat)", cal: 134, protein: 5.5, carbs: 26, fat: 1.5, fiber: 3, unit: "muffin", defaultServing: 1, category: "Breakfast" },
  { id: 107, name: "Acai Bowl (base)", cal: 200, protein: 3, carbs: 38, fat: 6, fiber: 5, unit: "serving", defaultServing: 1, category: "Breakfast" },
  { id: 108, name: "Bran Cereal (1/2 cup)", cal: 83, protein: 2.7, carbs: 23, fat: 0.5, fiber: 6, unit: "serving", defaultServing: 1, category: "Breakfast" },
  { id: 109, name: "Almond Milk (unsweetened)", cal: 30, protein: 1, carbs: 1, fat: 2.5, fiber: 0.5, unit: "ml", defaultServing: 240, category: "Breakfast" },
  { id: 110, name: "Smoked Salmon & Cream Cheese on Toast", cal: 280, protein: 18, carbs: 26, fat: 10, fiber: 2, unit: "serving", defaultServing: 1, category: "Breakfast" },
  { id: 111, name: "Avocado Roll (6 pieces)", cal: 170, protein: 3, carbs: 32, fat: 4, fiber: 5, unit: "roll", defaultServing: 1, category: "Sushi" },
  { id: 112, name: "Tuna Nigiri", cal: 60, protein: 7, carbs: 8, fat: 0.5, fiber: 0.2, unit: "piece", defaultServing: 1, category: "Sushi" },
  { id: 113, name: "Sockeye Salmon Nigiri", cal: 65, protein: 6, carbs: 8, fat: 1.5, fiber: 0.2, unit: "piece", defaultServing: 1, category: "Sushi" },
  { id: 114, name: "Tuna Sashimi", cal: 40, protein: 8, carbs: 0, fat: 0.5, fiber: 0, unit: "piece", defaultServing: 1, category: "Sushi" },
  { id: 115, name: "Sockeye Salmon Sashimi", cal: 45, protein: 7, carbs: 0, fat: 1.5, fiber: 0, unit: "piece", defaultServing: 1, category: "Sushi" },
  { id: 116, name: "Miso Soup", cal: 40, protein: 3, carbs: 5, fat: 1, fiber: 1, unit: "bowl", defaultServing: 1, category: "Sushi" },
  { id: 117, name: "Ponzu Sauce", cal: 15, protein: 0.5, carbs: 3, fat: 0, fiber: 0, unit: "tbsp", defaultServing: 1, category: "Sushi" },
  { id: 118, name: "Premier Protein Shake – Chocolate", cal: 160, protein: 30, carbs: 5, fat: 3, fiber: 3, unit: "bottle", defaultServing: 1, category: "Protein" },
  { id: 119, name: "Canadian Bacon (1 slice)", cal: 30, protein: 5, carbs: 0.3, fat: 1, fiber: 0, unit: "slice", defaultServing: 1, category: "Protein" },
  { id: 120, name: "Hollandaise Sauce", cal: 80, protein: 0.5, carbs: 0.5, fat: 8.5, fiber: 0, unit: "tbsp", defaultServing: 2, category: "Other" },
  { id: 121, name: "Natura Fibre (Brightside Organics)", cal: 120, protein: 4, carbs: 14, fat: 9, fiber: 14, unit: "g", defaultServing: 30, category: "Other" },
];

// ── Exercise Library ──────────────────────────────────────────────────────────
const EXERCISE_LIBRARY = [
  { name: "Walking (moderate, 3 mph)", calPerMin: 3.5 },
  { name: "Walking (brisk, 4 mph)", calPerMin: 4.5 },
  { name: "Running (5 mph)", calPerMin: 7.5 },
  { name: "Running (6+ mph)", calPerMin: 10 },
  { name: "Cycling (moderate)", calPerMin: 6 },
  { name: "Cycling (vigorous)", calPerMin: 10 },
  { name: "Swimming (laps)", calPerMin: 7 },
  { name: "Yoga", calPerMin: 2.8 },
  { name: "Pilates", calPerMin: 3.5 },
  { name: "Lagree (Megaformer)", calPerMin: 6.5 },
  { name: "Strength: Upper Push – Shoulders, Chest, Triceps (Tue)", calPerMin: 3.8 },
  { name: "Strength: Legs – Press, Squats, RDLs, Curls (Wed)", calPerMin: 4.5 },
  { name: "Strength: Upper Pull – Back, Biceps (Thu)", calPerMin: 3.8 },
  { name: "HIIT", calPerMin: 9 },
  { name: "Elliptical (moderate)", calPerMin: 5.5 },
  { name: "Rowing Machine", calPerMin: 7.5 },
  { name: "Dance / Zumba", calPerMin: 5.5 },
  { name: "Hiking", calPerMin: 5.5 },
  { name: "Barre", calPerMin: 4 },
  { name: "Stretching", calPerMin: 2 },
];

// ── Meal Plans ────────────────────────────────────────────────────────────────
const MEAL_PLANS = [
  { id: 1, name: "Lagree Morning", mealType: "Breakfast" as Meal, badge: "Workout Day", description: "Quick, no-cook high-protein start for training days.", items: [{ foodId: 118, servingAmount: 1 }, { foodId: 94, servingAmount: 1 }, { foodId: 45, servingAmount: 1 }] },
  { id: 2, name: "Smoked Salmon Plate", mealType: "Breakfast" as Meal, badge: "Galveston", description: "Anti-inflammatory omega-3 rich breakfast. High protein, near-zero net carbs.", items: [{ foodId: 64, servingAmount: 80 }, { foodId: 63, servingAmount: 3 }, { foodId: 26, servingAmount: 100 }, { foodId: 105, servingAmount: 1 }] },
  { id: 3, name: "Greek Protein Bowl", mealType: "Breakfast" as Meal, badge: "High Fibre", description: "Probiotic-rich with excellent fibre for gut health during menopause.", items: [{ foodId: 4, servingAmount: 170 }, { foodId: 32, servingAmount: 75 }, { foodId: 49, servingAmount: 2 }, { foodId: 121, servingAmount: 15 }] },
  { id: 4, name: "Weekend Eggs Benedict", mealType: "Breakfast" as Meal, badge: "Weekend Treat", description: "Your Eggs Benny with cheese. Higher-carb day — pair with low-carb meals.", items: [{ foodId: 106, servingAmount: 1 }, { foodId: 3, servingAmount: 2 }, { foodId: 12, servingAmount: 28 }, { foodId: 120, servingAmount: 2 }] },
  { id: 5, name: "Salmon Avocado Bowl", mealType: "Lunch" as Meal, badge: "Galveston", description: "Omega-3 rich anti-inflammatory powerhouse. The ideal Galveston lunch.", items: [{ foodId: 2, servingAmount: 120 }, { foodId: 21, servingAmount: 100 }, { foodId: 28, servingAmount: 80 }, { foodId: 26, servingAmount: 100 }, { foodId: 36, servingAmount: 1 }] },
  { id: 6, name: "Tuna Avocado Bowl", mealType: "Lunch" as Meal, badge: "Low Carb", description: "Very low net carbs — great for days after a higher-carb breakfast.", items: [{ foodId: 7, servingAmount: 100 }, { foodId: 28, servingAmount: 100 }, { foodId: 78, servingAmount: 100 }, { foodId: 76, servingAmount: 100 }, { foodId: 36, servingAmount: 1 }] },
  { id: 7, name: "Sushi Favourite", mealType: "Lunch" as Meal, badge: "Sushi Day", description: "Your go-to order. Higher-carb — best with low-carb breakfast and dinner.", items: [{ foodId: 112, servingAmount: 2 }, { foodId: 113, servingAmount: 2 }, { foodId: 114, servingAmount: 4 }, { foodId: 116, servingAmount: 1 }, { foodId: 117, servingAmount: 2 }] },
  { id: 8, name: "Chicken & Greens", mealType: "Dinner" as Meal, badge: "Galveston", description: "Classic Galveston dinner. High protein, anti-inflammatory, simple.", items: [{ foodId: 1, servingAmount: 150 }, { foodId: 20, servingAmount: 150 }, { foodId: 66, servingAmount: 100 }, { foodId: 36, servingAmount: 1 }] },
  { id: 9, name: "Salmon & Roasted Veg", mealType: "Dinner" as Meal, badge: "Anti-Inflammatory", description: "Fatty fish + cruciferous veg — ideal for menopausal hormonal balance.", items: [{ foodId: 2, servingAmount: 150 }, { foodId: 68, servingAmount: 150 }, { foodId: 69, servingAmount: 100 }, { foodId: 40, servingAmount: 1 }] },
  { id: 10, name: "Sirloin & Brussels", mealType: "Dinner" as Meal, badge: "Strength Day", description: "Higher protein for post-lifting recovery. Iron-rich for energy.", items: [{ foodId: 62, servingAmount: 120 }, { foodId: 67, servingAmount: 150 }, { foodId: 70, servingAmount: 100 }, { foodId: 36, servingAmount: 1 }] },
  { id: 11, name: "Afternoon Snack", mealType: "Snacks" as Meal, badge: "Quick", description: "Balanced fat and protein to hold you to dinner without spiking blood sugar.", items: [{ foodId: 37, servingAmount: 28 }, { foodId: 90, servingAmount: 1 }] },
  { id: 12, name: "Fibre Boost Bowl", mealType: "Snacks" as Meal, badge: "High Fibre", description: "Natura Fibre in yogurt with berries. Hits fibre target without blowing net carbs.", items: [{ foodId: 121, servingAmount: 15 }, { foodId: 4, servingAmount: 170 }, { foodId: 33, servingAmount: 75 }] },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split("T")[0];
const r = (n: number, d = 1) => Math.round(n * Math.pow(10, d)) / Math.pow(10, d);

// ── Component ─────────────────────────────────────────────────────────────────
export default function NutriTracker() {
  const date = today();
  const [tab, setTab] = useState("dashboard");
  const [foodLog, setFoodLog] = useState<FoodEntry[]>([]);
  const [exerciseLog, setExerciseLog] = useState<ExerciseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [libSearch, setLibSearch] = useState("");
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [servingAmount, setServingAmount] = useState("");
  const [selectedMeal, setSelectedMeal] = useState<Meal>("Breakfast");
  const [exerciseName, setExerciseName] = useState("");
  const [exerciseDuration, setExerciseDuration] = useState("");
  const [customCal, setCustomCal] = useState("");
  const [toast, setToast] = useState("");
  const [mealFilter, setMealFilter] = useState("All");
  const [historyDate, setHistoryDate] = useState(date);
  const [historyFood, setHistoryFood] = useState<FoodEntry[]>([]);
  const [historyEx, setHistoryEx] = useState<ExerciseEntry[]>([]);
  const [historyDates, setHistoryDates] = useState<string[]>([]);
  const [apiError, setApiError] = useState(false);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  // Load today's data
  const loadToday = useCallback(async () => {
    setLoading(true);
    try {
      const [food, ex] = await Promise.all([api.food.getByDate(date), api.exercise.getByDate(date)]);
      setFoodLog(food);
      setExerciseLog(ex);
      setApiError(false);
    } catch {
      setApiError(true);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { loadToday(); }, [loadToday]);

  // Load history
  useEffect(() => {
    if (tab !== "history") return;
    const load = async () => {
      try {
        const end = date;
        const startDate = new Date(); startDate.setDate(startDate.getDate() - 30);
        const start = startDate.toISOString().split("T")[0];
        const summaries = await api.summary.getRange(start, end);
        setHistoryDates([date, ...summaries.map(s => s.date).filter(d => d !== date)]);
      } catch {}
    };
    load();
  }, [tab, date]);

  useEffect(() => {
    if (tab !== "history") return;
    const load = async () => {
      try {
        if (historyDate === date) { setHistoryFood(foodLog); setHistoryEx(exerciseLog); return; }
        const [food, ex] = await Promise.all([api.food.getByDate(historyDate), api.exercise.getByDate(historyDate)]);
        setHistoryFood(food); setHistoryEx(ex);
      } catch {}
    };
    load();
  }, [historyDate, tab, date, foodLog, exerciseLog]);

  // Totals
  const totalCal = foodLog.reduce((s, e) => s + e.cal, 0);
  const totalProtein = foodLog.reduce((s, e) => s + e.protein, 0);
  const totalCarbs = foodLog.reduce((s, e) => s + e.carbs, 0);
  const totalFat = foodLog.reduce((s, e) => s + e.fat, 0);
  const totalFiber = foodLog.reduce((s, e) => s + (e.fiber || 0), 0);
  const netCarbs = Math.max(0, totalCarbs - totalFiber);
  const exCal = exerciseLog.reduce((s, e) => s + e.cal, 0);
  const netCal = totalCal - exCal;
  const remaining = DAILY_CAL - netCal;
  const isOver = netCal > DAILY_CAL;

  const addFood = async () => {
    if (!selectedFood || !servingAmount) return;
    const m = parseFloat(servingAmount) / selectedFood.defaultServing;
    const entry: Omit<FoodEntry, "id"> = {
      date, meal: selectedMeal, food_name: selectedFood.name,
      amount: `${servingAmount} ${selectedFood.unit}`,
      cal: Math.round(selectedFood.cal * m),
      protein: r(selectedFood.protein * m),
      carbs: r(selectedFood.carbs * m),
      fat: r(selectedFood.fat * m),
      fiber: r((selectedFood.fiber || 0) * m),
    };
    try {
      const saved = await api.food.add(entry);
      setFoodLog(p => [...p, saved]);
      flash("Added to " + selectedMeal);
      setSelectedFood(null); setServingAmount(""); setSearch(""); setTab("dashboard");
    } catch { flash("Error saving — check connection"); }
  };

  const deleteFood = async (id: number) => {
    try { await api.food.delete(id); setFoodLog(p => p.filter(e => e.id !== id)); } catch { flash("Error deleting entry"); }
  };

  const addExercise = async () => {
    if (!exerciseName || !exerciseDuration) return;
    const lib = EXERCISE_LIBRARY.find(e => e.name === exerciseName);
    const cal = lib ? Math.round(lib.calPerMin * parseFloat(exerciseDuration)) : parseInt(customCal) || 0;
    const entry: Omit<ExerciseEntry, "id"> = { date, name: exerciseName, duration: `${exerciseDuration} min`, cal };
    try {
      const saved = await api.exercise.add(entry);
      setExerciseLog(p => [...p, saved]);
      flash("Exercise logged");
      setExerciseName(""); setExerciseDuration(""); setCustomCal(""); setTab("dashboard");
    } catch { flash("Error saving exercise"); }
  };

  const deleteExercise = async (id: number) => {
    try { await api.exercise.delete(id); setExerciseLog(p => p.filter(e => e.id !== id)); } catch { flash("Error deleting entry"); }
  };

  const logRecipe = async (recipe: typeof MEAL_PLANS[0]) => {
    const entries: Omit<FoodEntry, "id">[] = recipe.items.map(item => {
      const food = FOOD_LIBRARY.find(f => f.id === item.foodId)!;
      const m = item.servingAmount / food.defaultServing;
      return { date, meal: recipe.mealType, food_name: food.name, amount: `${item.servingAmount} ${food.unit}`, cal: Math.round(food.cal * m), protein: r(food.protein * m), carbs: r(food.carbs * m), fat: r(food.fat * m), fiber: r((food.fiber || 0) * m) };
    });
    try {
      const saved = await api.food.addBatch(entries);
      setFoodLog(p => [...p, ...saved]);
      flash(`${recipe.name} logged`);
      setTab("dashboard");
    } catch { flash("Error logging recipe"); }
  };

  const filteredFoods = FOOD_LIBRARY.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
  const filteredLib = FOOD_LIBRARY.filter(f => f.name.toLowerCase().includes(libSearch.toLowerCase()));
  const filteredRecipes = mealFilter === "All" ? MEAL_PLANS : MEAL_PLANS.filter(r => r.mealType === mealFilter);

  // Sub-components
  const MacroBar = ({ label, current, target, color }: { label: string; current: number; target: number; color: string }) => {
    const pct = Math.min(100, (current / target) * 100);
    const over = current > target;
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 13 }}>
          <span style={{ fontWeight: 600 }}>{label}</span>
          <span style={{ color: over ? "#D64545" : C.muted }}>{r(current)}g <span style={{ color: C.border }}>/ {target}g</span></span>
        </div>
        <div style={{ height: 9, background: C.border, borderRadius: 5, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: over ? "#D64545" : color, borderRadius: 5, transition: "width 0.4s" }} />
        </div>
      </div>
    );
  };

  const BarAnalysis = ({ label, actual, target, color, unit = "g" }: { label: string; actual: number; target: number; color: string; unit?: string }) => {
    const pct = target > 0 ? (actual / target) * 100 : 0;
    const displayPct = Math.min(100, Math.max(0, pct));
    const status = pct > 110 ? "over" : pct < 75 ? "under" : "on target";
    const statusColor = pct > 110 ? "#D64545" : pct < 75 ? C.gold : "#5E9478";
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, textTransform: "uppercase", letterSpacing: "0.07em" }}>{Math.round(pct)}% · {status}</span>
        </div>
        <div style={{ position: "relative", height: 26, background: C.border, borderRadius: 7, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${displayPct}%`, background: pct > 110 ? "#D64545" : color }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px", fontSize: 11, fontWeight: 700, color: displayPct > 40 ? "white" : C.text }}>
            <span>{Math.round(actual)}{unit}</span>
            <span style={{ opacity: 0.8 }}>/ {target}{unit}</span>
          </div>
        </div>
      </div>
    );
  };

  const circ = 2 * Math.PI * 68;
  const ringOffset = circ * (1 - Math.min(1, netCal / DAILY_CAL));

  return (
    <div style={{ background: C.bg, height: "100vh", fontFamily: "'DM Sans', sans-serif", color: C.text, maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, select, button { font-family: 'DM Sans', sans-serif; }
        @keyframes slideIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .flash { animation: slideIn 0.2s ease; }
      `}</style>

      {toast && <div className="flash" style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: C.primary, color: "white", padding: "10px 20px", borderRadius: 20, fontSize: 13, fontWeight: 600, zIndex: 999, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>✓ {toast}</div>}

      {apiError && <div style={{ background: "#D64545", color: "white", padding: "10px 16px", fontSize: 12, textAlign: "center" }}>⚠ Cannot reach API — check your connection or server status</div>}

      {/* Header */}
      <div style={{ background: C.primary, padding: "22px 20px 0", color: "white", flexShrink: 0 }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 21, marginBottom: 2 }}>Katarina's Nutrition</div>
        <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 18 }}>{new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}</div>
        <div style={{ display: "flex", gap: 0, background: "rgba(0,0,0,0.15)", borderRadius: 12, padding: "12px 8px", marginBottom: 16 }}>
          {[{ label: "Goal", val: DAILY_CAL, color: "white" }, { label: "Food", val: Math.round(totalCal), color: "white" }, { label: "Exercise", val: Math.round(exCal), color: "#FBCFA8" }, { label: "Remaining", val: Math.abs(Math.round(remaining)), color: isOver ? "#FF9B9B" : "#A8FBCA" }].map(({ label, val, color }, i) => (
            <div key={label} style={{ flex: 1, textAlign: "center", borderRight: i < 3 ? "1px solid rgba(255,255,255,0.15)" : "none" }}>
              <div style={{ fontSize: 19, fontWeight: 700, color }}>{val}</div>
              <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 1 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: "white", borderBottom: `1px solid ${C.border}`, flexShrink: 0, overflowX: "auto" }}>
        {[{ id: "dashboard", icon: "◈", label: "Today" }, { id: "food", icon: "+", label: "Food" }, { id: "exercise", icon: "♦", label: "Exercise" }, { id: "meals", icon: "✦", label: "Meals" }, { id: "history", icon: "⟲", label: "History" }, { id: "library", icon: "☰", label: "Library" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, minWidth: 56, padding: "12px 4px 10px", border: "none", background: "none", fontSize: 11, fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? C.primary : C.muted, borderBottom: `2.5px solid ${tab === t.id ? C.primary : "transparent"}`, cursor: "pointer" }}>
            <div style={{ fontSize: 14, marginBottom: 2 }}>{t.icon}</div>{t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" as any, padding: "18px 16px 200px" }}>

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div>
            {loading && <div style={{ textAlign: "center", color: C.muted, padding: 32, fontSize: 14 }}>Loading...</div>}
            {!loading && (
              <>
                <div style={{ background: "white", borderRadius: 18, padding: "24px 20px 20px", marginBottom: 14, boxShadow: "0 1px 10px rgba(0,0,0,0.06)", textAlign: "center" }}>
                  <div style={{ position: "relative", width: 176, height: 176, margin: "0 auto 8px" }}>
                    <svg width="176" height="176" style={{ transform: "rotate(-90deg)" }}>
                      <circle cx="88" cy="88" r="68" fill="none" stroke={C.border} strokeWidth="13" />
                      <circle cx="88" cy="88" r="68" fill="none" stroke={isOver ? "#D64545" : C.primary} strokeWidth="13" strokeDasharray={circ} strokeDashoffset={ringOffset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.5s ease" }} />
                    </svg>
                    <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
                      <div style={{ fontSize: 34, fontWeight: 700, color: isOver ? "#D64545" : C.primary, fontFamily: "'DM Serif Display', serif", lineHeight: 1 }}>{Math.abs(Math.round(remaining))}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{isOver ? "over goal" : "remaining"}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: C.muted }}>{Math.round(totalCal)} eaten · {Math.round(exCal)} burned · {Math.round(netCal)} net</div>
                </div>

                <div style={{ background: "white", borderRadius: 18, padding: 20, marginBottom: 14, boxShadow: "0 1px 10px rgba(0,0,0,0.06)" }}>
                  <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 17, marginBottom: 16 }}>Macronutrients</div>
                  <MacroBar label="Protein" current={totalProtein} target={PROTEIN_TARGET} color={C.protein} />
                  <MacroBar label="Net Carbs" current={netCarbs} target={CARBS_TARGET} color={C.gold} />
                  <MacroBar label="Fat" current={totalFat} target={FAT_TARGET} color={C.fat} />
                  <MacroBar label="Fibre" current={totalFiber} target={FIBER_TARGET} color={C.fiber} />
                  <div style={{ fontSize: 10.5, color: C.muted, marginTop: 10, textAlign: "center" }}>Total carbs: {r(totalCarbs)}g − {r(totalFiber)}g fibre = {r(netCarbs)}g net</div>
                </div>

                {MEALS.map(meal => {
                  const entries = foodLog.filter(e => e.meal === meal);
                  if (!entries.length) return null;
                  const mealCal = entries.reduce((s, e) => s + e.cal, 0);
                  return (
                    <div key={meal} style={{ background: "white", borderRadius: 18, padding: 16, marginBottom: 12, boxShadow: "0 1px 10px rgba(0,0,0,0.06)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 15, color: C.primary }}>{meal}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{mealCal} cal</span>
                      </div>
                      {entries.map(e => (
                        <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 6px", borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{e.food_name}</div>
                            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>{e.amount} · P:{e.protein}g · NC:{r(Math.max(0, e.carbs - (e.fiber || 0)))}g · F:{e.fat}g</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 700 }}>{e.cal}</span>
                            <button onClick={() => e.id && deleteFood(e.id)} style={{ background: "none", border: "none", color: C.muted, fontSize: 18, cursor: "pointer" }}>×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}

                {exerciseLog.length > 0 && (
                  <div style={{ background: "white", borderRadius: 18, padding: 16, marginBottom: 12, boxShadow: "0 1px 10px rgba(0,0,0,0.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 15, color: C.accent }}>Exercise</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>-{exCal} cal</span>
                    </div>
                    {exerciseLog.map(e => (
                      <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 6px", borderBottom: `1px solid ${C.border}` }}>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{e.name}</div>
                          <div style={{ fontSize: 11.5, color: C.muted }}>{e.duration}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontWeight: 700, color: C.accent }}>−{e.cal}</span>
                          <button onClick={() => e.id && deleteExercise(e.id)} style={{ background: "none", border: "none", color: C.muted, fontSize: 18, cursor: "pointer" }}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {foodLog.length === 0 && exerciseLog.length === 0 && (
                  <div style={{ textAlign: "center", padding: "48px 20px", color: C.muted }}>
                    <div style={{ fontSize: 44, marginBottom: 12 }}>🥗</div>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>Nothing logged yet today</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Tap Food or Exercise to get started</div>
                  </div>
                )}
                <div style={{ textAlign: "center", padding: "16px 0 0", fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
                  1,200 cal · 80g protein · 25g net carbs · 80g fat · 30g fibre<br />Galveston-aligned · optimized for muscle preservation
                </div>
              </>
            )}
          </div>
        )}

        {/* FOOD */}
        {tab === "food" && (
          <div>
            <div style={{ background: "white", borderRadius: 18, padding: 16, marginBottom: 14, boxShadow: "0 1px 10px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 10 }}>Add to</div>
              <div style={{ display: "flex", gap: 7 }}>
                {MEALS.map(m => (
                  <button key={m} onClick={() => setSelectedMeal(m)} style={{ flex: 1, padding: "9px 2px", borderRadius: 9, border: `1.5px solid ${selectedMeal === m ? C.primary : C.border}`, background: selectedMeal === m ? C.primary : "white", color: selectedMeal === m ? "white" : C.text, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>{m}</button>
                ))}
              </div>
            </div>
            <div style={{ background: "white", borderRadius: 18, padding: 16, marginBottom: 14, boxShadow: "0 1px 10px rgba(0,0,0,0.06)" }}>
              <input type="text" placeholder="🔍  Search foods..." value={search} onChange={e => { setSearch(e.target.value); setSelectedFood(null); }} style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, background: C.bg }} />
              {search && !selectedFood && (
                <div style={{ marginTop: 10, maxHeight: 260, overflowY: "auto" }}>
                  {filteredFoods.length === 0 && <div style={{ color: C.muted, fontSize: 13, padding: 8 }}>No foods found</div>}
                  {filteredFoods.map(f => (
                    <div key={f.id} onClick={() => { setSelectedFood(f); setServingAmount(String(f.defaultServing)); }} style={{ padding: "11px 6px", borderRadius: 8, cursor: "pointer", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{f.name}</div>
                      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{f.cal} cal · P:{f.protein}g NC:{Math.max(0, f.carbs - f.fiber)}g F:{f.fat}g Fib:{f.fiber}g</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {selectedFood && (
              <div style={{ background: "white", borderRadius: 18, padding: 18, boxShadow: "0 1px 10px rgba(0,0,0,0.06)" }}>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, marginBottom: 4 }}>{selectedFood.name}</div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Per {selectedFood.defaultServing} {selectedFood.unit}: {selectedFood.cal} cal · P:{selectedFood.protein}g · NC:{Math.max(0, selectedFood.carbs - selectedFood.fiber)}g · F:{selectedFood.fat}g · Fib:{selectedFood.fiber}g</div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.07em" }}>Amount ({selectedFood.unit})</label>
                <input type="number" value={servingAmount} onChange={e => setServingAmount(e.target.value)} style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 15, marginBottom: 12 }} />
                {servingAmount && !isNaN(parseFloat(servingAmount)) && (() => {
                  const m = parseFloat(servingAmount) / selectedFood.defaultServing;
                  return <div style={{ background: C.bg, borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}><span style={{ fontSize: 22, fontWeight: 700, color: C.primary, fontFamily: "'DM Serif Display', serif" }}>{Math.round(selectedFood.cal * m)} cal</span><span style={{ fontSize: 12, color: C.muted, marginLeft: 10 }}>P:{r(selectedFood.protein * m)}g · NC:{r(Math.max(0, (selectedFood.carbs - selectedFood.fiber) * m))}g · F:{r(selectedFood.fat * m)}g · Fib:{r(selectedFood.fiber * m)}g</span></div>;
                })()}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => { setSelectedFood(null); setServingAmount(""); setSearch(""); }} style={{ flex: 1, padding: 13, borderRadius: 10, border: `1.5px solid ${C.border}`, background: "white", fontSize: 14, fontWeight: 600, color: C.muted, cursor: "pointer" }}>Cancel</button>
                  <button onClick={addFood} style={{ flex: 2, padding: 13, borderRadius: 10, border: "none", background: C.primary, color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Add to {selectedMeal}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* EXERCISE */}
        {tab === "exercise" && (
          <div>
            <div style={{ background: "white", borderRadius: 18, padding: 20, marginBottom: 14, boxShadow: "0 1px 10px rgba(0,0,0,0.06)" }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, marginBottom: 18 }}>Log Exercise</div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Activity</label>
              <select value={exerciseName} onChange={e => setExerciseName(e.target.value)} style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, background: "white", marginBottom: 14 }}>
                <option value="">Select activity...</option>
                {EXERCISE_LIBRARY.map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
                <option value="Other">Other (enter calories manually)</option>
              </select>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Duration (minutes)</label>
              <input type="number" value={exerciseDuration} onChange={e => setExerciseDuration(e.target.value)} placeholder="e.g. 30" style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, marginBottom: 14 }} />
              {exerciseName === "Other" && <>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase" }}>Calories Burned</label>
                <input type="number" value={customCal} onChange={e => setCustomCal(e.target.value)} placeholder="e.g. 200" style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, marginBottom: 14 }} />
              </>}
              {exerciseName && exerciseDuration && exerciseName !== "Other" && (() => {
                const lib = EXERCISE_LIBRARY.find(e => e.name === exerciseName);
                const est = lib ? Math.round(lib.calPerMin * parseFloat(exerciseDuration)) : 0;
                return <div style={{ background: "#FFF5EF", borderRadius: 10, padding: "11px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 13, color: C.muted }}>Estimated burn</span><span style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>−{est} cal</span></div>;
              })()}
              <button onClick={addExercise} style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", background: C.accent, color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Log Exercise</button>
            </div>
          </div>
        )}

        {/* MEALS */}
        {tab === "meals" && (
          <div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, marginBottom: 4 }}>Meal Plans & Recipes</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Galveston-aligned · tap to log all items at once</div>
            <div style={{ display: "flex", gap: 7, marginBottom: 18, overflowX: "auto", paddingBottom: 4 }}>
              {["All", "Breakfast", "Lunch", "Dinner", "Snacks"].map(f => (
                <button key={f} onClick={() => setMealFilter(f)} style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: mealFilter === f ? C.primary : "white", color: mealFilter === f ? "white" : C.text, border: `1.5px solid ${mealFilter === f ? C.primary : C.border}`, cursor: "pointer" }}>{f}</button>
              ))}
            </div>
            {filteredRecipes.map(recipe => {
              const t = recipe.items.reduce((acc, item) => {
                const food = FOOD_LIBRARY.find(f => f.id === item.foodId);
                if (!food) return acc;
                const m = item.servingAmount / food.defaultServing;
                return { cal: acc.cal + food.cal * m, protein: acc.protein + food.protein * m, carbs: acc.carbs + food.carbs * m, fat: acc.fat + food.fat * m, fiber: acc.fiber + (food.fiber || 0) * m };
              }, { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
              const nc = Math.max(0, t.carbs - t.fiber);
              return (
                <div key={recipe.id} style={{ background: "white", borderRadius: 18, padding: 18, marginBottom: 14, boxShadow: "0 1px 10px rgba(0,0,0,0.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 16, flex: 1 }}>{recipe.name}</div>
                    <span style={{ background: C.bg, color: C.primary, fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 10, marginLeft: 8, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{recipe.badge}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>{recipe.description}</div>
                  <div style={{ display: "flex", gap: 5, marginBottom: 14, flexWrap: "wrap" as const }}>
                    {[{ label: "cal", val: Math.round(t.cal), bg: "#EEF4F0", color: C.primary }, { label: "P", val: r(t.protein) + "g", bg: "#FFF1EC", color: C.protein }, { label: "NC", val: r(nc) + "g", bg: "#FFF8EC", color: C.gold }, { label: "Fat", val: r(t.fat) + "g", bg: "#F0FAF4", color: C.fat }, { label: "Fib", val: r(t.fiber) + "g", bg: "#F5F2FD", color: C.fiber }].map(p => (
                      <div key={p.label} style={{ background: p.bg, color: p.color, fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 8 }}>{p.val} <span style={{ fontWeight: 400, opacity: 0.75, fontSize: 10 }}>{p.label}</span></div>
                    ))}
                  </div>
                  {recipe.items.map(item => {
                    const food = FOOD_LIBRARY.find(f => f.id === item.foodId);
                    if (!food) return null;
                    return <div key={item.foodId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.muted, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}><span>{food.name}</span><span style={{ color: C.text, fontWeight: 500 }}>{item.servingAmount} {food.unit}</span></div>;
                  })}
                  <button onClick={() => logRecipe(recipe)} style={{ width: "100%", marginTop: 14, padding: 12, borderRadius: 10, border: "none", background: C.primary, color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>+ Log to {recipe.mealType}</button>
                </div>
              );
            })}
          </div>
        )}

        {/* HISTORY */}
        {tab === "history" && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 10, paddingLeft: 4 }}>Select Day</div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
                {(historyDates.length ? historyDates : [date]).map(d => {
                  const sel = d === historyDate;
                  const isT = d === date;
                  const dObj = new Date(d + "T12:00");
                  return (
                    <button key={d} onClick={() => setHistoryDate(d)} style={{ flexShrink: 0, minWidth: 78, padding: "10px 8px", borderRadius: 12, border: `1.5px solid ${sel ? C.primary : C.border}`, background: sel ? C.primary : "white", color: sel ? "white" : C.text, cursor: "pointer", textAlign: "center" }}>
                      <div style={{ fontSize: 10.5, opacity: 0.75, fontWeight: 600 }}>{isT ? "Today" : dObj.toLocaleDateString("en", { weekday: "short" })}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, margin: "3px 0" }}>{dObj.toLocaleDateString("en", { month: "short", day: "numeric" })}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ background: "white", borderRadius: 18, padding: 20, marginBottom: 14, boxShadow: "0 1px 10px rgba(0,0,0,0.06)" }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 17, marginBottom: 16 }}>Macro Analysis</div>
              {(() => {
                const hCal = historyFood.reduce((s, e) => s + e.cal, 0);
                const hP = historyFood.reduce((s, e) => s + e.protein, 0);
                const hC = historyFood.reduce((s, e) => s + e.carbs, 0);
                const hF = historyFood.reduce((s, e) => s + e.fat, 0);
                const hFib = historyFood.reduce((s, e) => s + (e.fiber || 0), 0);
                const hEx = historyEx.reduce((s, e) => s + e.cal, 0);
                const hNet = hCal - hEx;
                const hNC = Math.max(0, hC - hFib);
                return <>
                  <BarAnalysis label="Calories (net)" actual={hNet} target={DAILY_CAL} color={C.primary} unit=" cal" />
                  <BarAnalysis label="Protein" actual={hP} target={PROTEIN_TARGET} color={C.protein} />
                  <BarAnalysis label="Net Carbs" actual={hNC} target={CARBS_TARGET} color={C.gold} />
                  <BarAnalysis label="Fat" actual={hF} target={FAT_TARGET} color={C.fat} />
                  <BarAnalysis label="Fibre" actual={hFib} target={FIBER_TARGET} color={C.fiber} />
                </>;
              })()}
            </div>
          </div>
        )}

        {/* LIBRARY */}
        {tab === "library" && (
          <div>
            <input type="text" placeholder="🔍  Search library..." value={libSearch} onChange={e => setLibSearch(e.target.value)} style={{ width: "100%", padding: "12px 16px", borderRadius: 14, border: `1.5px solid ${C.border}`, fontSize: 14, background: "white", marginBottom: 14, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }} />
            {filteredLib.map(f => (
              <div key={f.id} style={{ background: "white", borderRadius: 14, padding: "14px 16px", marginBottom: 10, boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{f.name}</div>
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{f.category} · per {f.defaultServing} {f.unit}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: C.primary, fontFamily: "'DM Serif Display', serif" }}>{f.cal}</div>
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {[{ label: "Protein", val: f.protein, color: C.protein, bg: "#FFF1EC" }, { label: "Net C", val: Math.max(0, f.carbs - f.fiber), color: C.gold, bg: "#FFF8EC" }, { label: "Fat", val: f.fat, color: C.fat, bg: "#F0FAF4" }, { label: "Fibre", val: f.fiber, color: C.fiber, bg: "#F5F2FD" }].map(m => (
                    <div key={m.label} style={{ flex: 1, textAlign: "center", background: m.bg, borderRadius: 8, padding: "6px 0" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: m.color }}>{m.val}g</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{m.label}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => { setTab("food"); setSearch(f.name); setSelectedFood(f); setServingAmount(String(f.defaultServing)); }} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1.5px solid ${C.primary}`, background: "white", color: C.primary, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>+ Add to Log</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
