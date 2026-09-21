import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./apiClient";

function recorder() {
  const calls: { path: string; method: string; body?: unknown }[] = [];
  const request = vi.fn(async (path: string, init: RequestInit = {}) => {
    calls.push({ path, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body as string) : undefined });
    return undefined as never;
  });
  return { calls, client: createApiClient(request) };
}

describe("createApiClient", () => {
  it("maps every method to the documented endpoint", async () => {
    const { calls, client } = recorder();
    const entry = { date: "2026-04-26", meal: "Lunch" as const, food_name: "Avocado" };

    await client.me();
    await client.foodLog.forDate("2026-04-26");
    await client.foodLog.add(entry);
    await client.foodLog.addBatch([entry]);
    await client.foodLog.remove(7);
    await client.exerciseLog.forDate("2026-04-26");
    await client.exerciseLog.add({ date: "2026-04-26", name: "Yoga" });
    await client.exerciseLog.remove(3);
    await client.summary.day("2026-04-26");
    await client.summary.range("2026-04-01", "2026-04-30");
    await client.weight.log({ date: "2026-04-26", weight_lbs: 133.2 });
    await client.weight.recent();
    await client.weight.recent(7);
    await client.catalog.foods();
    await client.catalog.addFood({ name: "Granola", cal: 210, protein: 6, carbs: 28, fat: 9, fiber: 4 });
    await client.catalog.removeFood(500);
    await client.catalog.barcode("0016000275287");
    await client.catalog.exercises();
    await client.catalog.mealPlans();

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /api/auth/me",
      "GET /api/food/2026-04-26", "POST /api/food", "POST /api/food/batch", "DELETE /api/food/7",
      "GET /api/exercise/2026-04-26", "POST /api/exercise", "DELETE /api/exercise/3",
      "GET /api/summary/day/2026-04-26", "GET /api/summary/range?start=2026-04-01&end=2026-04-30",
      "POST /api/summary/weight", "GET /api/summary/weight?days=30", "GET /api/summary/weight?days=7",
      "GET /api/foods", "POST /api/foods", "DELETE /api/foods/500", "GET /api/foods/barcode/0016000275287",
      "GET /api/exercises", "GET /api/meal-plans",
    ]);
    expect(calls[2].body).toEqual(entry);
    expect(calls[3].body).toEqual([entry]);
  });

  it("encodes search text, and leaves out filters that were not given", async () => {
    const { calls, client } = recorder();
    await client.catalog.foods({ q: "milk 2% & cream", scope: "mine" });
    await client.catalog.foods({ q: "", category: undefined });
    expect(calls.map((c) => c.path)).toEqual(["/api/foods?q=milk%202%25%20%26%20cream&scope=mine", "/api/foods"]);
  });

  it("passes the request function's result and errors straight through", async () => {
    const ok = createApiClient((async () => [{ id: 1 }]) as never);
    expect(await ok.foodLog.forDate("2026-04-26")).toEqual([{ id: 1 }]);

    const failing = createApiClient((async () => { throw new Error("Your session has ended."); }) as never);
    await expect(failing.catalog.exercises()).rejects.toThrow("Your session has ended.");
  });
});
