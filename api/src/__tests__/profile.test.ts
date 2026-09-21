import { caloriesPerMinute, computeTargets, feetInchesToCm, kgToLbs, lbsToKg, ProfileInput } from "@nutrition/shared";
import { makeTestContext, TestContext, createUser } from "./helpers";

let t: TestContext;
beforeEach(async () => { t = await makeTestContext(); });
afterEach(() => { t.db.close(); });

const THIS_YEAR = new Date().getFullYear();

/** The person the original app was built for. */
const KATARINA: ProfileInput = {
  units: "imperial", sex: "female", birth_year: THIS_YEAR - 50, height_cm: feetInchesToCm(5, 3),
  weight_kg: lbsToKg(134), activity: "sedentary", goal: "lose", weekly_rate_kg: lbsToKg(1),
  preset_key: "galveston_style",
};
const CUSTOM_TARGETS = { calories: 2000, protein_g: 150, carbs_g: 200, carbs_mode: "total" as const, fat_g: 67, fiber_g: 28 };

describe("GET /api/profile", () => {
  it("is null for a new account: not onboarded is a normal state, not an error", async () => {
    const res = await t.api.get("/api/profile");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { profile: null } });
  });

  it("GET /api/auth/me says whether onboarding is done, so a client knows where to send them", async () => {
    expect((await t.api.get("/api/auth/me")).body.data.onboarded).toBe(false);
    await t.api.put("/api/profile").send(KATARINA);
    expect((await t.api.get("/api/auth/me")).body.data.onboarded).toBe(true);
  });
});

describe("PUT /api/profile — first time", () => {
  it("computes and stores the targets, and returns the whole profile", async () => {
    const res = await t.api.put("/api/profile").send(KATARINA);
    expect(res.status).toBe(201);
    expect(res.body.data.profile).toMatchObject({
      units: "imperial", sex: "female", preset_key: "galveston_style", targets_customised: false,
      targets: { calories: 1200, protein_g: 80, carbs_g: 25, carbs_mode: "net", fat_g: 80, fiber_g: 30 },
    });
    expect(res.body.data.profile.onboarded_at).toEqual(expect.any(String));
  });

  it("the server computes the targets: a client cannot smuggle in numbers a preset would not give", async () => {
    const res = await t.api.put("/api/profile").send({ ...KATARINA, targets: { ...CUSTOM_TARGETS, calories: 4000 } });
    // Sending targets for a computed preset means "I edited them", which is
    // allowed and flagged. What is NOT possible is passing them off as the preset's.
    expect(res.body.data.profile.targets_customised).toBe(true);
    expect(res.body.data.profile.targets.calories).toBe(4000);

    const asComputed = await t.as((await createUser(t.db, t.config, "b@example.com")).id).put("/api/profile").send(KATARINA);
    expect(asComputed.body.data.profile.targets_customised).toBe(false);
    expect(asComputed.body.data.profile.targets).toEqual(computeTargets("galveston_style", { sex: "female", age: 50, height_cm: feetInchesToCm(5, 3), weight_kg: lbsToKg(134), activity: "sedentary", goal: "lose", weekly_rate_kg: lbsToKg(1) }).targets);
  });

  it("starts the weight chart from the onboarding weight when the client says what day it is", async () => {
    await t.api.put("/api/profile").send({ ...KATARINA, local_date: "2026-09-21" });
    const { body } = await t.api.get("/api/summary/weight");
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ date: "2026-09-21", weight_lbs: 134, notes: "Starting weight" });
  });

  it("does not invent a weight entry when the client did not say what day it is", async () => {
    await t.api.put("/api/profile").send(KATARINA);
    expect((await t.api.get("/api/summary/weight")).body.data).toEqual([]);
  });

  it("never overwrites a weigh-in the user already logged today", async () => {
    await t.api.post("/api/summary/weight").send({ date: "2026-09-21", weight_lbs: 133.2, notes: "mine" });
    await t.api.put("/api/profile").send({ ...KATARINA, local_date: "2026-09-21" });
    const { body } = await t.api.get("/api/summary/weight");
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ weight_lbs: 133.2, notes: "mine" });
  });

  it("Custom takes the user's own numbers and needs no height or age", async () => {
    const res = await t.api.put("/api/profile").send({ weight_kg: 70, preset_key: "custom", targets: CUSTOM_TARGETS });
    expect(res.status).toBe(201);
    expect(res.body.data.profile).toMatchObject({ preset_key: "custom", targets: CUSTOM_TARGETS, birth_year: null, height_cm: null });
  });
});

describe("PUT /api/profile — changing things later", () => {
  beforeEach(async () => { await t.api.put("/api/profile").send({ ...KATARINA, local_date: "2026-09-21" }); });

  it("is 200, not 201, and does not add a second starting weight", async () => {
    const res = await t.api.put("/api/profile").send({ ...KATARINA, activity: "moderate", local_date: "2026-09-22" });
    expect(res.status).toBe(200);
    expect(res.body.data.profile.activity).toBe("moderate");
    expect((await t.api.get("/api/summary/weight")).body.data).toHaveLength(1);
  });

  it("switching preset recomputes the targets", async () => {
    const res = await t.api.put("/api/profile").send({ ...KATARINA, preset_key: "high_protein" });
    expect(res.body.data.profile.targets).toMatchObject({ carbs_mode: "total", protein_g: 105 });
    expect(res.body.data.profile.targets_customised).toBe(false);
  });

  it("there is still only one profile row per user", async () => {
    await t.api.put("/api/profile").send({ ...KATARINA, goal: "maintain" });
    expect((t.db.prepare("SELECT COUNT(*) AS n FROM user_profiles WHERE user_id = ?").get(t.userId) as any).n).toBe(1);
  });

  it("editing the numbers back to what the preset says clears the customised flag", async () => {
    const preset = computeTargets("galveston_style", { sex: "female", age: 50, height_cm: feetInchesToCm(5, 3), weight_kg: lbsToKg(134), activity: "sedentary", goal: "lose", weekly_rate_kg: lbsToKg(1) }).targets;
    const edited = await t.api.put("/api/profile").send({ ...KATARINA, targets: { ...preset, protein_g: 95 } });
    expect(edited.body.data.profile.targets_customised).toBe(true);
    const back = await t.api.put("/api/profile").send({ ...KATARINA, targets: preset });
    expect(back.body.data.profile.targets_customised).toBe(false);
  });
});

describe("what a profile is required to contain", () => {
  it.each([
    [{ preset_key: undefined }, "preset_key", "is required"],
    [{ weight_kg: undefined }, "weight_kg", "is required"],
    [{ birth_year: undefined }, "birth_year", "is required to calculate targets"],
    [{ height_cm: undefined }, "height_cm", "is required to calculate targets"],
    [{ birth_year: THIS_YEAR - 16 }, "birth_year", "this app is for adults: you must be at least 18"],
    [{ weight_kg: 670 }, "weight_kg", "cannot be more than 300 kg"],
    [{ units: "stones" }, "units", "must be imperial or metric"],
    [{ preset_key: "carnivore" }, "preset_key", "must be one of: galveston_style, balanced, high_protein, low_carb, custom"],
    [{ local_date: "21-09-2026" }, "local_date", "must be a date in YYYY-MM-DD format"],
  ])("rejects %j with a 400 naming the field", async (bad, field, message) => {
    const res = await t.api.put("/api/profile").send({ ...KATARINA, ...bad });
    expect(res.status).toBe(400);
    expect(res.body.details).toContainEqual({ path: field, message });
    expect((t.db.prepare("SELECT COUNT(*) AS n FROM user_profiles").get() as any).n).toBe(0);
  });

  it("Custom without targets is refused", async () => {
    const res = await t.api.put("/api/profile").send({ weight_kg: 70, preset_key: "custom" });
    expect(res.status).toBe(400);
    expect(res.body.details).toContainEqual({ path: "targets", message: "is required for the Custom preset" });
  });

  it("a computed preset needs only weight, age and height: sex, activity and goal have defaults", async () => {
    const res = await t.api.put("/api/profile").send({ weight_kg: 70, birth_year: THIS_YEAR - 40, height_cm: 170, preset_key: "balanced" });
    expect(res.status).toBe(201);
    expect(res.body.data.profile).toMatchObject({ sex: null, activity: "sedentary", goal: "maintain", units: "imperial" });
    // Sex withheld, so the energy formula uses the midpoint constant:
    // (10x70 + 6.25x170 - 5x40 - 78) x 1.2 = 1781, rounded to 1780.
    expect(res.body.data.profile.targets.calories).toBe(1780);
  });
});

describe("exercise calories follow the user's own weight", () => {
  it("uses the reference weight before onboarding, then the profile weight, then the latest weigh-in", async () => {
    const lagree = async () => (await t.api.get("/api/exercises")).body.data.find((e: any) => e.name === "Lagree (Megaformer)");

    expect(await lagree()).toMatchObject({ cal_per_min: 6.5, cal_per_min_weight_kg: 60.8 });

    await t.api.put("/api/profile").send({ ...KATARINA, weight_kg: 90 });
    expect(await lagree()).toMatchObject({ cal_per_min: 9.6, cal_per_min_weight_kg: 90 });

    await t.api.post("/api/summary/weight").send({ date: "2026-09-21", weight_lbs: kgToLbs(80) });
    expect((await lagree()).cal_per_min_weight_kg).toBeCloseTo(80, 1);
  });

  it("two users of different weight get different numbers for the same exercise", async () => {
    const other = await createUser(t.db, t.config, "heavier@example.com");
    await t.api.put("/api/profile").send({ ...KATARINA, weight_kg: 60 });
    await t.as(other.id).put("/api/profile").send({ ...KATARINA, weight_kg: 120 });

    const [mine] = (await t.api.get("/api/exercises")).body.data;
    const [theirs] = (await t.as(other.id).get("/api/exercises")).body.data;

    expect(mine.cal_per_min).toBe(caloriesPerMinute(mine.met, 60));
    expect(theirs.cal_per_min).toBe(caloriesPerMinute(theirs.met, 120));
    // Roughly double, but not exactly: cal_per_min is rounded to 0.1 for display.
    expect(theirs.cal_per_min / mine.cal_per_min).toBeCloseTo(2, 1);
  });
});

describe("profiles are private", () => {
  it("I never see, and cannot change, anyone else's", async () => {
    const other = await createUser(t.db, t.config, "other@example.com");
    await t.as(other.id).put("/api/profile").send({ ...KATARINA, weight_kg: 95, preset_key: "low_carb" });

    expect((await t.api.get("/api/profile")).body.data.profile).toBeNull();

    await t.api.put("/api/profile").send({ ...KATARINA, weight_kg: 62 });
    expect((await t.as(other.id).get("/api/profile")).body.data.profile).toMatchObject({ weight_kg: 95, preset_key: "low_carb" });
  });

  it("goes when the account goes", async () => {
    await t.api.put("/api/profile").send(KATARINA);
    await t.api.delete("/api/auth/me").send({ password: t.password });
    expect((t.db.prepare("SELECT COUNT(*) AS n FROM user_profiles").get() as any).n).toBe(0);
  });

  it("needs a login", async () => {
    expect((await t.anonymous.get("/api/profile")).status).toBe(401);
    expect((await t.anonymous.put("/api/profile").send(KATARINA)).status).toBe(401);
  });
});
