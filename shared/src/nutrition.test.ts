import { describe, expect, it } from "vitest";
import {
  round, netCarbs, scaleMacros, sumMacros, dayTotals, remainingCalories,
  caloriesPerMinute, exerciseCalories, lbsToKg, kgToLbs,
} from "./nutrition";

const avocado = { cal: 160, protein: 2, carbs: 9, fat: 15, fiber: 6.7 };   // per 100 g
const salmon = { cal: 208, protein: 20, carbs: 0, fat: 13, fiber: 0 };     // per 100 g
const naturaFibre = { cal: 120, protein: 4, carbs: 14, fat: 9, fiber: 14 }; // per 30 g

describe("round", () => {
  it("rounds to one decimal by default, and to any precision asked", () => {
    expect(round(2.349)).toBe(2.3);
    expect(round(2.35)).toBe(2.4);
    expect(round(7.2000000001)).toBe(7.2);
    expect(round(1234.5678, 2)).toBe(1234.57);
    expect(round(12.5, 0)).toBe(13);
  });
});

describe("netCarbs", () => {
  it("is total carbohydrate minus fibre", () => {
    expect(round(netCarbs(9, 6.7))).toBe(2.3);
  });
  it("is never negative, even when a supplement has more fibre than carbohydrate", () => {
    expect(netCarbs(3, 10)).toBe(0);
  });
  it("the Natura Fibre scoop nets to zero, the case the original docs single out", () => {
    expect(netCarbs(naturaFibre.carbs, naturaFibre.fiber)).toBe(0);
  });
});

describe("scaleMacros", () => {
  it("scales from the food's own serving size: whole calories, one-decimal grams", () => {
    expect(scaleMacros(avocado, 80, 100)).toEqual({ cal: 128, protein: 1.6, carbs: 7.2, fat: 12, fiber: 5.4 });
    expect(scaleMacros(salmon, 120, 100)).toEqual({ cal: 250, protein: 24, carbs: 0, fat: 15.6, fiber: 0 });
  });
  it("works for foods measured in pieces or scoops, not just 100 g", () => {
    expect(scaleMacros(naturaFibre, 15, 30)).toEqual({ cal: 60, protein: 2, carbs: 7, fat: 4.5, fiber: 7 });
    expect(scaleMacros({ cal: 78, protein: 6, carbs: 0.6, fat: 5, fiber: 0 }, 2, 1)).toEqual({ cal: 156, protein: 12, carbs: 1.2, fat: 10, fiber: 0 });
  });
  it("the default serving scales to itself", () => {
    expect(scaleMacros(avocado, 100, 100)).toEqual(avocado);
  });
  it("produces values the API's validation accepts (no NaN, no negatives) for ordinary input", () => {
    for (const v of Object.values(scaleMacros(avocado, 0.5, 100))) { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); }
  });
});

describe("sumMacros and dayTotals", () => {
  const bowl = [scaleMacros(salmon, 120, 100), scaleMacros(avocado, 80, 100)];

  it("an empty day is all zeros", () => {
    expect(dayTotals([], [])).toEqual({ cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, netCarbs: 0, exerciseCal: 0, netCal: 0 });
  });
  it("adds food, nets carbs against fibre, and subtracts exercise", () => {
    const t = dayTotals(bowl, [{ cal: 293 }]);
    expect(t.cal).toBe(378);
    expect(round(t.protein)).toBe(25.6);
    expect(round(t.netCarbs)).toBe(1.8);
    expect(t.exerciseCal).toBe(293);
    expect(t.netCal).toBe(85);
  });
  it("net calories may go negative; net carbs may not", () => {
    const t = dayTotals([{ cal: 100, carbs: 3, fiber: 10 }], [{ cal: 293 }]);
    expect(t.netCal).toBe(-193);
    expect(t.netCarbs).toBe(0);
  });
  it("tolerates entries with a macro missing (older rows had no fibre)", () => {
    expect(sumMacros([{ cal: 100 }, { cal: 50, fiber: 2 }])).toMatchObject({ cal: 150, fiber: 2, protein: 0 });
  });
  it("does not mutate its inputs or the shared zero", () => {
    const entries = [{ ...avocado }];
    sumMacros(entries); sumMacros(entries);
    expect(entries[0]).toEqual(avocado);
    expect(sumMacros([])).toEqual({ cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  });
  it("agrees with the API's day summary for the same entries (same fixture as api/summary.test.ts)", () => {
    const t = dayTotals([{ cal: 250, protein: 24, carbs: 0, fat: 15.6, fiber: 0 }, { cal: 128, protein: 1.6, carbs: 7.2, fat: 12, fiber: 5.4 }], [{ cal: 293 }]);
    expect({ total_cal: Math.round(t.cal), total_protein: round(t.protein), total_fat: round(t.fat), net_carbs: round(t.netCarbs), net_cal: Math.round(t.netCal) })
      .toEqual({ total_cal: 378, total_protein: 25.6, total_fat: 27.6, net_carbs: 1.8, net_cal: 85 });
  });
});

describe("remainingCalories", () => {
  it("exercise is earned back: 1200 target, 1493 eaten, 293 burned is exactly on target", () => {
    expect(remainingCalories(1200, dayTotals([{ cal: 1493 }], [{ cal: 293 }]).netCal)).toBe(0);
  });
  it("is negative when over", () => {
    expect(remainingCalories(1200, 1350)).toBe(-150);
  });
});

describe("exercise calories", () => {
  it("reproduces the original app's figures at its reference weight (60.8 kg)", () => {
    expect(caloriesPerMinute(6.109, 60.8)).toBe(6.5);              // Lagree
    expect(exerciseCalories(6.109, 60.8, 45)).toBe(293);          // "~293 cal for a 45-min session"
  });
  it("a heavier person burns proportionally more doing the same thing", () => {
    expect(exerciseCalories(6.109, 121.6, 45)).toBe(585);
  });
});

describe("weight units", () => {
  it("converts both ways and round-trips", () => {
    expect(round(lbsToKg(134))).toBe(60.8);
    expect(round(kgToLbs(60.8))).toBe(134);
    expect(kgToLbs(lbsToKg(150))).toBeCloseTo(150, 10);
  });
});
