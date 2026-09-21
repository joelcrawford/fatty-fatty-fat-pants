import { makeTestContext, TestContext, createUser } from "./helpers";

let t: TestContext;
beforeEach(async () => { t = await makeTestContext(); });
afterEach(() => { t.db.close(); });

const granola = (overrides: Record<string, unknown> = {}) => ({
  name: "Homemade granola", category: "Breakfast", unit: "g", default_serving: 50,
  cal: 210, protein: 6, carbs: 28, fat: 9, fiber: 4, ...overrides,
});

describe("GET /api/foods", () => {
  it("returns the whole built-in library, in its original order, in the documented shape", async () => {
    const res = await t.api.get("/api/foods");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(121);
    expect(res.body.data[0]).toEqual({
      id: expect.any(Number), name: "Chicken Breast (cooked)", category: "Protein", unit: "g", default_serving: 100,
      cal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, barcode: null, custom: false,
    });
    expect(res.body.data[120].name).toBe("Natura Fibre (Brightside Organics)");
    expect(res.body.data[0]).not.toHaveProperty("user_id");
    expect(res.body.data[0]).not.toHaveProperty("seed_key");
  });

  it("searches by name, case-insensitively, anywhere in the name", async () => {
    const res = await t.api.get("/api/foods?q=SALMON");
    expect(res.body.data.map((f: any) => f.name)).toEqual([
      "Salmon (cooked)", "Smoked Salmon", "Smoked Salmon & Cream Cheese on Toast", "Sockeye Salmon Nigiri", "Sockeye Salmon Sashimi",
    ]);
  });

  it("treats % and _ as ordinary characters, not wildcards", async () => {
    expect((await t.api.get("/api/foods?q=%25")).body.data.map((f: any) => f.name)).toEqual([
      "Greek Yogurt (plain, 0% fat)", "Cottage Cheese (1%)", "Ground Beef (90% lean)", "Milk (2%)", "Dark Chocolate (85%)",
    ]);
    expect((await t.api.get("/api/foods?q=_")).body.data).toEqual([]);
  });

  it("is not injectable through the search box", async () => {
    const res = await t.api.get(`/api/foods?q=${encodeURIComponent("' OR 1=1 --")}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("filters by category", async () => {
    const res = await t.api.get("/api/foods?category=sushi");
    expect(res.body.data).toHaveLength(7);
    expect(new Set(res.body.data.map((f: any) => f.category))).toEqual(new Set(["Sushi"]));
  });

  it("lists my custom foods after the built-ins, and scope narrows to either", async () => {
    await t.api.post("/api/foods").send(granola());
    const all = (await t.api.get("/api/foods")).body.data;
    expect(all).toHaveLength(122);
    expect(all[121]).toMatchObject({ name: "Homemade granola", custom: true });

    expect((await t.api.get("/api/foods?scope=mine")).body.data.map((f: any) => f.name)).toEqual(["Homemade granola"]);
    expect((await t.api.get("/api/foods?scope=builtin")).body.data).toHaveLength(121);
    expect((await t.api.get("/api/foods?scope=theirs")).status).toBe(400);
  });
});

describe("POST /api/foods", () => {
  it("creates a custom food and returns it in the same shape as a built-in", async () => {
    const res = await t.api.post("/api/foods").send(granola({ barcode: "0123456789012" }));
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: expect.any(Number), ...granola(), barcode: "0123456789012", custom: true });
  });

  it("defaults category, unit and serving, but never the macros", async () => {
    const ok = await t.api.post("/api/foods").send({ name: "Mystery bar", cal: 200, protein: 10, carbs: 20, fat: 8, fiber: 3 });
    expect(ok.body.data).toMatchObject({ category: "Other", unit: "g", default_serving: 100 });

    const missing = await t.api.post("/api/foods").send({ name: "Forgot the numbers" });
    expect(missing.status).toBe(400);
    expect(missing.body.details.map((d: any) => d.path).sort()).toEqual(["cal", "carbs", "fat", "fiber", "protein"]);
  });

  it.each([
    ["name", "", "cannot be empty"],
    ["default_serving", 0, "must be greater than 0"],
    ["cal", -1, "cannot be negative"],
    ["barcode", "12ab", "must be 6 to 14 digits"],
  ])("rejects %s = %j", async (field, value, message) => {
    const res = await t.api.post("/api/foods").send(granola({ [field]: value }));
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ path: field, message }]);
  });

  it("a client cannot make a food built-in, or give it to someone else", async () => {
    const other = await createUser(t.db, t.config, "other@example.com");
    const res = await t.api.post("/api/foods").send(granola({ user_id: other.id, seed_key: "food-001", custom: false }));
    expect(res.status).toBe(201);
    expect(t.db.prepare("SELECT user_id, seed_key FROM foods WHERE id = ?").get(res.body.data.id)).toEqual({ user_id: t.userId, seed_key: null });
  });

  it("two of my foods may share a name (this week's granola and last week's)", async () => {
    await t.api.post("/api/foods").send(granola());
    expect((await t.api.post("/api/foods").send(granola({ cal: 230 }))).status).toBe(201);
  });
});

describe("DELETE /api/foods/:id", () => {
  it("deletes my custom food", async () => {
    const { body } = await t.api.post("/api/foods").send(granola());
    const res = await t.api.delete(`/api/foods/${body.data.id}`);
    expect(res.body).toEqual({ success: true, data: { deleted_id: body.data.id } });
    expect((await t.api.get("/api/foods?scope=mine")).body.data).toEqual([]);
  });

  it("refuses to delete a built-in food", async () => {
    const [chicken] = (await t.api.get("/api/foods")).body.data;
    const res = await t.api.delete(`/api/foods/${chicken.id}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Built-in foods cannot be deleted");
    expect((await t.api.get("/api/foods")).body.data).toHaveLength(121);
  });

  it("deleting a food leaves what was already logged from it exactly as it was", async () => {
    const { body } = await t.api.post("/api/foods").send(granola());
    await t.api.post("/api/food").send({ date: "2026-04-26", meal: "Breakfast", food_name: "Homemade granola", amount: "50 g", cal: 210, protein: 6, carbs: 28, fat: 9, fiber: 4 });
    await t.api.delete(`/api/foods/${body.data.id}`);

    const log = (await t.api.get("/api/food/2026-04-26")).body.data;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ food_name: "Homemade granola", cal: 210 });
  });

  it("404s for an id that does not exist", async () => {
    expect((await t.api.delete("/api/foods/99999")).status).toBe(404);
  });
});

describe("GET /api/exercises", () => {
  it("returns all 20 in their original order, with MET and a calories-per-minute figure that says what weight it is for", async () => {
    const res = await t.api.get("/api/exercises");
    expect(res.body.data).toHaveLength(20);
    expect(res.body.data[0]).toEqual({ id: expect.any(Number), name: "Walking (moderate, 3 mph)", met: 3.289, cal_per_min: 3.5, cal_per_min_weight_kg: 60.8 });
    expect(res.body.data.find((e: any) => e.name === "Lagree (Megaformer)").cal_per_min).toBe(6.5);
  });
});

describe("GET /api/meal-plans", () => {
  it("returns all 12 with their items and each item's food, ready to display and log", async () => {
    const res = await t.api.get("/api/meal-plans");
    expect(res.body.data).toHaveLength(12);

    const lagree = res.body.data[0];
    expect(lagree).toMatchObject({ name: "Lagree Morning", meal_type: "Breakfast", badge: "Workout Day" });
    expect(lagree.items.map((i: any) => [i.food.name, i.serving_amount])).toEqual([
      ["Premier Protein Shake – Chocolate", 1], ["Hard Boiled Egg", 1], ["Coffee (black)", 1],
    ]);
    expect(lagree.items[0].food).toMatchObject({ cal: 160, protein: 30, default_serving: 1, unit: "bottle", custom: false });
  });

  it("the Salmon Avocado Bowl adds up to what the original app showed", async () => {
    const bowl = (await t.api.get("/api/meal-plans")).body.data.find((p: any) => p.name === "Salmon Avocado Bowl");
    const cal = bowl.items.reduce((s: number, i: any) => s + Math.round(i.food.cal * (i.serving_amount / i.food.default_serving)), 0);
    // 120g salmon 250 + 100g spinach 23 + 80g avocado 128 + 100g cucumber 15 + 1 tbsp olive oil 119
    expect(cal).toBe(535);
  });
});

describe("the catalog is behind the login", () => {
  it.each(["/api/foods", "/api/exercises", "/api/meal-plans"])("GET %s without a token is 401", async (url) => {
    expect((await t.anonymous.get(url)).status).toBe(401);
  });
});
