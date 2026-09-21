import { computeTargets, feetInchesToCm, lbsToKg } from "@nutrition/shared";
import { makeTestContext, TestContext } from "./helpers";

let t: TestContext;
beforeEach(async () => { t = await makeTestContext(); });
afterEach(() => { t.db.close(); });

const REFERENCE = { sex: "female", age: 50, height_cm: feetInchesToCm(5, 3), weight_kg: lbsToKg(134), activity: "sedentary", goal: "lose", weekly_rate_kg: lbsToKg(1) } as const;

describe("GET /api/presets", () => {
  it("lists the five presets in order, with everything an onboarding screen needs", async () => {
    const res = await t.api.get("/api/presets");
    expect(res.status).toBe(200);
    expect(res.body.data.presets.map((p: any) => p.key)).toEqual(["galveston_style", "balanced", "high_protein", "low_carb", "custom"]);
    expect(res.body.data.presets[0]).toMatchObject({ name: "Galveston-style, muscle-preserving", carbs_mode: "net", computed: true });
    expect(res.body.data.presets[0].notFor.length).toBeGreaterThan(0);
    expect(res.body.data.presets[0].sources.length).toBeGreaterThan(0);
    expect(res.body.data.presets[4]).toMatchObject({ key: "custom", computed: false });
    expect(res.body.data.limits).toEqual({ calorie_floor: { female: 1200, male: 1500 }, calorie_ceiling: 5000 });
    expect(res.body.data.disclaimer).toMatch(/not medical advice/);
    expect(res.body.data.activity_levels).toEqual(["sedentary", "light", "moderate", "active", "very_active"]);
  });

  it("never says 'Galveston Diet' in anything a user is shown as a name", async () => {
    const { presets } = (await t.api.get("/api/presets")).body.data;
    for (const p of presets) expect(`${p.name} ${p.summary} ${p.whoFor}`).not.toMatch(/Galveston Diet/i);
  });
});

describe("POST /api/presets/:key/preview", () => {
  it("returns the original app's numbers for the person it was built for, with the working and the disclaimer", async () => {
    const res = await t.api.post("/api/presets/galveston_style/preview").send(REFERENCE);
    expect(res.status).toBe(200);
    expect(res.body.data.targets).toEqual({ calories: 1200, protein_g: 80, carbs_g: 25, carbs_mode: "net", fat_g: 80, fiber_g: 30 });
    expect(res.body.data.explanation).toMatchObject({ bmr: 1197, maintenance: 1436, floor_applied: true, calorie_floor: 1200 });
    expect(res.body.data.disclaimer).toMatch(/not medical advice/);
  });

  it("gives exactly what a client computing locally with the shared package would get", async () => {
    for (const key of ["galveston_style", "balanced", "high_protein", "low_carb"] as const) {
      const profile = { sex: "male", age: 33, height_cm: 181, weight_kg: 92.5, activity: "moderate", goal: "lose", weekly_rate_kg: 0.5 } as const;
      const { targets, explanation } = (await t.api.post(`/api/presets/${key}/preview`).send(profile)).body.data;
      expect({ preset: key, targets, explanation }).toEqual(computeTargets(key, profile));
    }
  });

  it("stores nothing", async () => {
    const before = t.db.prepare("SELECT (SELECT COUNT(*) FROM users) || '/' || (SELECT COUNT(*) FROM weight_logs) || '/' || (SELECT COUNT(*) FROM food_logs) AS n").get();
    await t.api.post("/api/presets/balanced/preview").send(REFERENCE);
    expect(t.db.prepare("SELECT (SELECT COUNT(*) FROM users) || '/' || (SELECT COUNT(*) FROM weight_logs) || '/' || (SELECT COUNT(*) FROM food_logs) AS n").get()).toEqual(before);
  });

  it("works with the minimum: age, height and weight", async () => {
    const res = await t.api.post("/api/presets/balanced/preview").send({ age: 40, height_cm: 170, weight_kg: 70 });
    expect(res.status).toBe(200);
    expect(res.body.data.explanation.calorie_floor).toBe(1500); // sex withheld: the higher floor
  });

  it.each([
    [{ age: 16 }, "age", "this app is for adults: must be at least 18"],
    [{ weight_kg: 670 }, "weight_kg", "cannot be more than 300 kg"],
    [{ height_cm: "160" }, "height_cm", "must be a number"],
    [{ weekly_rate_kg: 2 }, "weekly_rate_kg", "cannot be more than 1 kg per week"],
  ])("rejects %j with a 400 naming the field", async (bad, field, message) => {
    const res = await t.api.post("/api/presets/balanced/preview").send({ ...REFERENCE, ...bad });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ path: field, message }]);
  });

  it("Custom cannot be previewed, and an unknown preset is a 400 that lists the real ones", async () => {
    const custom = await t.api.post("/api/presets/custom/preview").send(REFERENCE);
    expect(custom.status).toBe(400);
    expect(custom.body.error).toMatch(/no formula/);

    const unknown = await t.api.post("/api/presets/carnivore/preview").send(REFERENCE);
    expect(unknown.status).toBe(400);
    expect(unknown.body.details[0]).toEqual({ path: "key", message: "must be one of: galveston_style, balanced, high_protein, low_carb, custom" });
  });

  it("is behind the login", async () => {
    expect((await t.anonymous.get("/api/presets")).status).toBe(401);
    expect((await t.anonymous.post("/api/presets/balanced/preview").send(REFERENCE)).status).toBe(401);
  });
});
