import { makeTestContext, TestContext, createUser } from "./helpers";
import { isValidGtin, canonicalBarcode } from "../barcode/gtin";
import { normaliseProduct, createOffLookup, OffProduct } from "../barcode/openFoodFacts";
import nutella from "./fixtures/off/nutella-fr.json";
import cheerios from "./fixtures/off/cheerios-us.json";

const NUTELLA = "3017620422003";      // EAN-13, France
const CHEERIOS_UPC = "016000275287";  // UPC-A, 12 digits, USA
const CHEERIOS = "0016000275287";     // the same product as an EAN-13

describe("barcodes", () => {
  it.each([NUTELLA, CHEERIOS_UPC, CHEERIOS, "96385074", "10614141000415"])("%s is a valid GTIN", (code) => {
    expect(isValidGtin(code)).toBe(true);
  });

  it.each([
    ["3017620422004", "wrong check digit"], ["301762042200", "a digit dropped by the scanner"], ["12345", "too short"],
    ["30176204220031234", "too long"], ["30176204 2003", "a space"], ["abcdefghijklm", "letters"], ["", "empty"],
  ])("%s is rejected (%s)", (code) => {
    expect(isValidGtin(code)).toBe(false);
  });

  it("a UPC-A and the same number as an EAN-13 are one barcode", () => {
    expect(canonicalBarcode(CHEERIOS_UPC)).toBe(CHEERIOS);
    expect(canonicalBarcode(CHEERIOS)).toBe(CHEERIOS);
    expect(canonicalBarcode("96385074")).toBe("96385074");
  });
});

describe("normaliseProduct, on real Open Food Facts data", () => {
  it("a US label: carbohydrate already includes fibre, so it is used as-is", () => {
    const p = normaliseProduct(cheerios.product as OffProduct)!;
    expect(p).toMatchObject({
      name: "Cheerios", brand: "Cheerios", unit: "g", default_serving: 100,
      cal: 359, protein: 12.8, carbs: 74.4, fat: 6.4, fiber: 10.3,
      suggested_serving: 39, missing: [], carbs_basis: "label_total", plausible: true,
    });
    expect(Math.round((p.carbs - p.fiber) * 10) / 10).toBe(64.1); // net carbs, fibre subtracted once
  });

  it("a European label: carbohydrate excludes fibre, so fibre is added back to make a total", () => {
    const p = normaliseProduct(nutella.product as OffProduct)!;
    expect(p).toMatchObject({ name: "Nutella", brand: "Nutella", cal: 539, protein: 6.3, carbs: 57.5, fat: 30.9, fiber: 0, carbs_basis: "label_net_plus_fibre", suggested_serving: null });
  });

  it("without the fix a high-fibre European product would have its fibre subtracted twice", () => {
    const ryeCrispbread: OffProduct = { product_name: "Rye crispbread", countries_tags: ["en:sweden"], nutriments: { "energy-kcal_100g": 334, proteins_100g: 9, carbohydrates_100g: 64, fat_100g: 1.5, fiber_100g: 16 } };
    const p = normaliseProduct(ryeCrispbread)!;
    expect(p.carbs).toBe(80);                 // 64 available + 16 fibre
    expect(p.carbs - p.fiber).toBe(64);       // net carbs equals what the label calls carbohydrate
  });

  it("fibre larger than 'carbs' proves the label is net, whatever country it claims", () => {
    const p = normaliseProduct({ product_name: "Psyllium husk", countries_tags: ["en:canada"], nutriments: { "energy-kcal_100g": 200, proteins_100g: 2, carbohydrates_100g: 5, fat_100g: 1, fiber_100g: 80 } })!;
    expect(p).toMatchObject({ carbs: 85, fiber: 80, carbs_basis: "label_net_plus_fibre" });
  });

  it("converts kilojoules when kilocalories are absent", () => {
    expect(normaliseProduct({ product_name: "X", nutriments: { energy_100g: 2252, proteins_100g: 6 } })!.cal).toBe(538.2);
  });

  it("reports what the database did not have instead of pretending it is zero", () => {
    const p = normaliseProduct({ product_name: "  ", nutriments: { "energy-kcal_100g": 120, fat_100g: 3 } })!;
    expect(p.missing.sort()).toEqual(["carbs", "fiber", "name", "protein"]);
    expect(p).toMatchObject({ cal: 120, fat: 3, protein: 0, carbs: 0, fiber: 0 });
  });

  it("treats absurd values as missing, so whatever it returns can be saved", () => {
    const p = normaliseProduct({ product_name: "Typo bar", nutriments: { "energy-kcal_100g": 450, proteins_100g: 5000, carbohydrates_100g: -3, fat_100g: "12.5" } })!;
    expect(p).toMatchObject({ protein: 0, carbs: 0, fat: 12.5 });
    expect(p.missing).toEqual(expect.arrayContaining(["protein", "carbs"]));
  });

  it("flags numbers that cannot be right", () => {
    expect(normaliseProduct({ product_name: "Impossible", nutriments: { "energy-kcal_100g": 400, proteins_100g: 60, carbohydrates_100g: 60, fat_100g: 30 } })!.plausible).toBe(false);
  });

  it("uses millilitres for drinks", () => {
    expect(normaliseProduct({ product_name: "Oat drink", serving_quantity: "250", serving_quantity_unit: "ml", nutriments: { "energy-kcal_100g": 46 } })).toMatchObject({ unit: "ml", suggested_serving: 250 });
  });

  it("an entry with no nutrition data at all is useless, and says so", () => {
    expect(normaliseProduct({ product_name: "Just a name" })).toBeNull();
    expect(normaliseProduct({ product_name: "Just a name", nutriments: { sugars_100g: 5 } })).toBeNull();
  });
});

describe("the Open Food Facts client", () => {
  const respond = (status: number, body: unknown) => jest.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it("identifies itself and asks only for the fields it uses", async () => {
    const f = respond(200, cheerios);
    const product = await createOffLookup("TestAgent/1.0 (test)", f as unknown as typeof fetch)(CHEERIOS);
    expect(product!.product_name).toBe("Cheerios");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`https://world.openfoodfacts.org/api/v2/product/${CHEERIOS}.json?fields=product_name,brands,serving_quantity,serving_quantity_unit,countries_tags,nutriments`);
    expect(init.headers["User-Agent"]).toBe("TestAgent/1.0 (test)");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("unknown barcode: null, whether they say so with status 0 or with a 404", async () => {
    expect(await createOffLookup("a", respond(200, { status: 0, status_verbose: "product not found" }) as any)("1")).toBeNull();
    expect(await createOffLookup("a", respond(404, {}) as any)("1")).toBeNull();
  });

  it("throws when the service is in trouble, so that is never mistaken for 'no such product'", async () => {
    await expect(createOffLookup("a", respond(503, {}) as any)("1")).rejects.toThrow(/503/);
    await expect(createOffLookup("a", jest.fn().mockRejectedValue(new Error("timeout")) as any)("1")).rejects.toThrow("timeout");
  });
});

describe("GET /api/foods/barcode/:barcode", () => {
  let t: TestContext;
  beforeEach(async () => {
    t = await makeTestContext();
    t.off.set(CHEERIOS, cheerios.product as OffProduct);
    t.off.set(NUTELLA, nutella.product as OffProduct);
  });
  afterEach(() => t.db.close());

  it("returns a product in the same shape as any other food, ready to log or save", async () => {
    const res = await t.api.get(`/api/foods/barcode/${CHEERIOS}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      source: "openfoodfacts", barcode: CHEERIOS, brand: "Cheerios", suggested_serving: 39, missing: [], carbs_basis: "label_total", plausible: true,
      food: { id: null, name: "Cheerios", category: "Packaged", unit: "g", default_serving: 100, cal: 359, protein: 12.8, carbs: 74.4, fat: 6.4, fiber: 10.3, barcode: CHEERIOS, custom: false },
    });
  });

  it("what it returns can be saved as a custom food without editing", async () => {
    const { food } = (await t.api.get(`/api/foods/barcode/${CHEERIOS}`)).body.data;
    const { id, custom, ...saveable } = food;
    expect((await t.api.post("/api/foods").send(saveable)).status).toBe(201);
  });

  it("a 12-digit UPC and its 13-digit form are the same lookup and share one cache entry", async () => {
    await t.api.get(`/api/foods/barcode/${CHEERIOS_UPC}`);
    await t.api.get(`/api/foods/barcode/${CHEERIOS}`);
    expect(t.offCalls).toEqual([CHEERIOS]);
  });

  it("asks Open Food Facts once, then serves everyone from the cache", async () => {
    const other = await createUser(t.db, t.config, "other@example.com");
    await t.api.get(`/api/foods/barcode/${NUTELLA}`);
    await t.api.get(`/api/foods/barcode/${NUTELLA}`);
    const theirs = await t.as(other.id).get(`/api/foods/barcode/${NUTELLA}`);
    expect(theirs.body.data.food.name).toBe("Nutella");
    expect(t.offCalls).toEqual([NUTELLA]);
  });

  it("improvements to normalisation reach products already cached (the raw product is what is stored)", async () => {
    await t.api.get(`/api/foods/barcode/${NUTELLA}`);
    const { product } = t.db.prepare("SELECT product FROM barcode_cache WHERE barcode = ?").get(NUTELLA) as { product: string };
    expect(JSON.parse(product).nutriments["carbohydrates_100g"]).toBe(57.5);
    expect(JSON.parse(product)).not.toHaveProperty("carbs_basis");
  });

  it("refreshes a cached product after 30 days", async () => {
    await t.api.get(`/api/foods/barcode/${NUTELLA}`);
    t.db.prepare("UPDATE barcode_cache SET fetched_at = fetched_at - 31 * 86400").run();
    await t.api.get(`/api/foods/barcode/${NUTELLA}`);
    expect(t.offCalls).toEqual([NUTELLA, NUTELLA]);
  });

  describe("an unknown barcode", () => {
    const UNKNOWN = "4006381333931";

    it("is a 404 that tells the user what to do next", async () => {
      const res = await t.api.get(`/api/foods/barcode/${UNKNOWN}`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: "No product found for that barcode. You can add it by hand." });
    });

    it("is remembered for a day, not forever: products get added", async () => {
      await t.api.get(`/api/foods/barcode/${UNKNOWN}`);
      await t.api.get(`/api/foods/barcode/${UNKNOWN}`);
      expect(t.offCalls).toEqual([UNKNOWN]);

      t.db.prepare("UPDATE barcode_cache SET fetched_at = fetched_at - 2 * 86400").run();
      t.off.set(UNKNOWN, { product_name: "Newly added", nutriments: { "energy-kcal_100g": 100 } });
      expect((await t.api.get(`/api/foods/barcode/${UNKNOWN}`)).body.data.food.name).toBe("Newly added");
    });

    it("a listing with no nutrition data gets its own message", async () => {
      t.off.set(UNKNOWN, { product_name: "Mystery jar" });
      const res = await t.api.get(`/api/foods/barcode/${UNKNOWN}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/listed but has no nutrition information/);
    });
  });

  describe("when Open Food Facts is down", () => {
    it("is a 502, and the failure is NOT cached as 'no such product'", async () => {
      t.off.set(NUTELLA, new Error("ETIMEDOUT"));
      const res = await t.api.get(`/api/foods/barcode/${NUTELLA}`);
      expect(res.status).toBe(502);
      expect(res.body.error).toBe("Could not reach the product database. Try again, or add the food by hand.");

      t.off.set(NUTELLA, nutella.product as OffProduct);
      expect((await t.api.get(`/api/foods/barcode/${NUTELLA}`)).status).toBe(200);
    });

    it("an expired cache entry is served rather than failing", async () => {
      await t.api.get(`/api/foods/barcode/${NUTELLA}`);
      t.db.prepare("UPDATE barcode_cache SET fetched_at = fetched_at - 31 * 86400").run();
      t.off.set(NUTELLA, new Error("ETIMEDOUT"));
      const res = await t.api.get(`/api/foods/barcode/${NUTELLA}`);
      expect(res.status).toBe(200);
      expect(res.body.data.food.name).toBe("Nutella");
    });
  });

  describe("my own version of a product wins", () => {
    it("once I have saved a barcode, scanning it returns MY food and asks nobody", async () => {
      const saved = await t.api.post("/api/foods").send({ name: "Cheerios (my numbers)", cal: 370, protein: 13, carbs: 73, fat: 6.7, fiber: 10, barcode: CHEERIOS_UPC });
      const res = await t.api.get(`/api/foods/barcode/${CHEERIOS}`);

      expect(res.body.data).toMatchObject({ source: "custom", food: { id: saved.body.data.id, name: "Cheerios (my numbers)", cal: 370, custom: true } });
      expect(res.body.data.food).not.toHaveProperty("user_id");
      expect(t.offCalls).toEqual([]);
    });

    it("someone else's saved version is never returned to me", async () => {
      const other = await createUser(t.db, t.config, "other@example.com");
      await t.as(other.id).post("/api/foods").send({ name: "Their private Cheerios", cal: 1, protein: 1, carbs: 1, fat: 1, fiber: 1, barcode: CHEERIOS });

      const res = await t.api.get(`/api/foods/barcode/${CHEERIOS}`);
      expect(res.body.data).toMatchObject({ source: "openfoodfacts", food: { name: "Cheerios" } });
    });
  });

  it.each(["3017620422004", "12345", "abc"])("rejects %s before asking anyone", async (bad) => {
    const res = await t.api.get(`/api/foods/barcode/${bad}`);
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe("barcode");
    expect(t.offCalls).toEqual([]);
  });

  it("requires login", async () => {
    expect((await t.anonymous.get(`/api/foods/barcode/${NUTELLA}`)).status).toBe(401);
    expect(t.offCalls).toEqual([]);
  });

  it("limits lookups per user, not per address, and only after validation", async () => {
    const limited = await makeTestContext({ barcodeRateLimit: { windowMinutes: 10, max: 2 } });
    const other = await createUser(limited.db, limited.config, "other@example.com");
    limited.off.set(NUTELLA, nutella.product as OffProduct);

    await limited.api.get("/api/foods/barcode/abc"); // invalid: must not use up the budget
    expect([(await limited.api.get(`/api/foods/barcode/${NUTELLA}`)).status, (await limited.api.get(`/api/foods/barcode/${NUTELLA}`)).status]).toEqual([200, 200]);
    const blocked = await limited.api.get(`/api/foods/barcode/${NUTELLA}`);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("Too many barcode lookups. Please wait a few minutes.");

    expect((await limited.as(other.id).get(`/api/foods/barcode/${NUTELLA}`)).status).toBe(200); // same address, different user
    limited.db.close();
  });
});
