// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { api } from "./api";
import { session } from "./session";
import type { Profile } from "@nutrition/shared";

// The real api.ts runs; only the network underneath it is faked. So these
// tests cover the snake_case → camelCase mapping as well as the screens.
const apiFood = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, category: "Protein", unit: "g", default_serving: 100, cal: 200, protein: 20, carbs: 10, fat: 8, fiber: 4, barcode: null, custom: false, ...extra,
});
const FOODS = [apiFood(1, "Salmon (cooked)", { cal: 208, protein: 20, carbs: 0, fat: 13, fiber: 0 }), apiFood(2, "Avocado", { category: "Vegetables", cal: 160, protein: 2, carbs: 9, fat: 15, fiber: 6.7 })];
const EXERCISES = [{ id: 1, name: "Lagree (Megaformer)", met: 6.109, cal_per_min: 6.5, cal_per_min_weight_kg: 60.8 }];
const PLANS = [{ id: 1, name: "Salmon Avocado Bowl", meal_type: "Lunch", badge: "Galveston", description: "Omega-3 rich.", items: [{ serving_amount: 120, food: FOODS[0] }, { serving_amount: 80, food: FOODS[1] }] }];

let requests: { path: string; method: string; body?: any }[];

beforeEach(() => {
  requests = [];
  vi.spyOn(session, "request").mockImplementation(async (path: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    requests.push({ path, method, body });
    if (path === "/api/foods" && method === "GET") return FOODS as any;
    if (path === "/api/foods" && method === "POST") return { ...apiFood(500, body.name), ...body, custom: true } as any;
    if (path === "/api/exercises") return EXERCISES as any;
    if (path === "/api/meal-plans") return PLANS as any;
    if (path === "/api/food/batch") return body.map((e: any, i: number) => ({ id: 900 + i, ...e })) as any;
    if (path === "/api/exercise" && method === "POST") return { id: 700, ...body } as any;
    if (path.startsWith("/api/foods/") && method === "DELETE") return { deleted_id: 500 } as any;
    return [] as any; // today's food and exercise logs: empty
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const USER = { id: 7, email: "sam@example.com", name: "Sam", created_at: "" };

// Sam's own plan: deliberately NOT the old hardcoded numbers, so a test that
// passes only because 1200/80/25/80/30 are still baked in would fail.
const PROFILE: Profile = {
  units: "imperial", sex: "female", birth_year: 1990, height_cm: 168, weight_kg: 70, current_weight_kg: 70,
  activity: "moderate", goal: "maintain", weekly_rate_kg: 0, preset_key: "balanced",
  targets: { calories: 2100, protein_g: 105, carbs_g: 236, carbs_mode: "total", fat_g: 70, fiber_g: 29 },
  targets_customised: false, onboarded_at: "", updated_at: "",
};
const openTab = (label: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));

describe("api.catalog", () => {
  it("maps the API's shapes onto the ones the app uses", async () => {
    const c = await api.catalog.load();
    expect(c.foods[1]).toEqual({ id: 2, name: "Avocado", category: "Vegetables", unit: "g", defaultServing: 100, cal: 160, protein: 2, carbs: 9, fat: 15, fiber: 6.7, custom: false });
    expect(c.exercises).toEqual([{ name: "Lagree (Megaformer)", calPerMin: 6.5 }]);
    expect(c.mealPlans[0]).toMatchObject({ mealType: "Lunch", items: [{ foodId: 1, servingAmount: 120 }, { foodId: 2, servingAmount: 80 }] });
  });

  it("sends a custom food in the API's shape", async () => {
    await api.catalog.addFood({ name: "Granola", category: "My Foods", unit: "g", defaultServing: 50, cal: 210, protein: 6, carbs: 28, fat: 9, fiber: 4 });
    expect(requests[0]).toEqual({ path: "/api/foods", method: "POST", body: { name: "Granola", category: "My Foods", unit: "g", default_serving: 50, cal: 210, protein: 6, carbs: 28, fat: 9, fiber: 4 } });
  });
});

describe("the app, with its catalog coming from the API", () => {
  it("shows the user's OWN targets, not the numbers the app was first built with", async () => {
    render(<App user={USER} profile={PROFILE} />);
    await screen.findByText(/2100 cal/);
    expect(screen.getByText(/2100 cal · 105g protein · 236g carbs · 70g fat · 29g fibre/)).toBeTruthy();
    expect(screen.getByText(/2100 cal/).textContent).toContain("Balanced");
    expect(screen.queryByText(/1,?200 cal/)).toBeNull();
  });

  it("labels carbs the way the plan counts them", async () => {
    const { unmount } = render(<App user={USER} profile={PROFILE} />);
    expect(await screen.findByText("Carbs")).toBeTruthy();  // this plan counts total
    unmount();

    render(<App user={USER} profile={{ ...PROFILE, preset_key: "low_carb", targets: { ...PROFILE.targets, carbs_g: 50, carbs_mode: "net" } }} />);
    expect(await screen.findByText("Net Carbs")).toBeTruthy();
  });

  it("greets the signed-in user and loads the catalog once", async () => {
    render(<App user={USER} profile={PROFILE} />);
    expect(screen.getByText("Sam's Nutrition")).toBeTruthy();
    await waitFor(() => expect(requests.filter((r) => r.path === "/api/foods")).toHaveLength(1));
    expect(requests.map((r) => r.path)).toEqual(expect.arrayContaining(["/api/exercises", "/api/meal-plans"]));
  });

  it("Library lists the loaded foods with net carbs worked out", async () => {
    render(<App user={USER} profile={PROFILE} />);
    openTab("Library");
    await screen.findByText("Avocado");
    expect(screen.getByText("2.3g")).toBeTruthy(); // Avocado: 9 carbs − 6.7 fibre
    expect(screen.getByText("Vegetables · per 100 g")).toBeTruthy();
  });

  it("Food tab searches the loaded foods", async () => {
    render(<App user={USER} profile={PROFILE} />);
    await waitFor(() => expect(requests.some((r) => r.path === "/api/foods")).toBe(true));
    openTab("Food");
    fireEvent.change(screen.getByPlaceholderText(/Search foods/), { target: { value: "salm" } }); // results appear once you type
    expect(await screen.findByText("Salmon (cooked)")).toBeTruthy();
    expect(screen.queryByText("Avocado")).toBeNull();
  });

  it("Exercise tab offers the loaded exercises and logs calories from duration", async () => {
    render(<App user={USER} profile={PROFILE} />);
    openTab("Exercise");
    const select = await screen.findByRole("combobox");
    await within(select).findByText("Lagree (Megaformer)");
    fireEvent.change(select, { target: { value: "Lagree (Megaformer)" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 30"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: /Log Exercise/i }));

    await waitFor(() => expect(requests.find((r) => r.path === "/api/exercise")?.body).toMatchObject({ name: "Lagree (Megaformer)", duration: "45 min", cal: 293 }));
  });

  it("Meals tab logs a recipe as one batch, scaled from each food's serving size", async () => {
    render(<App user={USER} profile={PROFILE} />);
    openTab("Meals");
    await screen.findByText("Salmon Avocado Bowl");
    fireEvent.click(screen.getByRole("button", { name: /Log/ }));

    await waitFor(() => expect(requests.find((r) => r.path === "/api/food/batch")).toBeTruthy());
    expect(requests.find((r) => r.path === "/api/food/batch")!.body).toEqual([
      expect.objectContaining({ meal: "Lunch", food_name: "Salmon (cooked)", amount: "120 g", cal: 250, protein: 24, fat: 15.6 }),
      expect.objectContaining({ meal: "Lunch", food_name: "Avocado", amount: "80 g", cal: 128, carbs: 7.2, fiber: 5.4 }),
    ]);
  });

  it("adding my own food saves it, shows it, and only custom foods can be deleted", async () => {
    render(<App user={USER} profile={PROFILE} />);
    openTab("Library");
    await screen.findByText("Avocado");
    expect(screen.queryByRole("button", { name: "delete" })).toBeNull(); // built-ins have no delete

    fireEvent.click(screen.getByRole("button", { name: "+ Add my own food" }));
    fireEvent.change(screen.getByLabelText("Food name"), { target: { value: "Homemade granola" } });
    fireEvent.change(screen.getByLabelText("Serving size"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Calories"), { target: { value: "210" } });
    fireEvent.change(screen.getByLabelText("Fibre (g)"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save food" }));

    expect(await screen.findByText("Homemade granola")).toBeTruthy();
    expect(requests.find((r) => r.path === "/api/foods" && r.method === "POST")!.body).toMatchObject({ name: "Homemade granola", default_serving: 50, cal: 210, fiber: 4, protein: 0 });

    fireEvent.click(screen.getByRole("button", { name: "delete" }));
    await waitFor(() => expect(screen.queryByText("Homemade granola")).toBeNull());
    expect(requests.some((r) => r.path === "/api/foods/500" && r.method === "DELETE")).toBe(true);
  });

  it("shows the connection banner if the catalog cannot be loaded", async () => {
    vi.spyOn(session, "request").mockRejectedValue(new Error("down"));
    render(<App user={USER} profile={PROFILE} />);
    expect(await screen.findByText(/Cannot reach API/)).toBeTruthy();
  });
});
