// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { computeTargets, feetInchesToCm, lbsToKg, Profile } from "@nutrition/shared";
import { Onboarding } from "./Onboarding";
import { session, ApiError } from "./session";

const THIS_YEAR = new Date().getFullYear();
let saved: any;

const savedProfile = (over: Partial<Profile> = {}): Profile => ({
  units: "imperial", sex: "female", birth_year: 1976, height_cm: 160, weight_kg: 60.8, current_weight_kg: 60.8,
  activity: "sedentary", goal: "lose", weekly_rate_kg: 0.45, preset_key: "galveston_style",
  targets: { calories: 1200, protein_g: 80, carbs_g: 25, carbs_mode: "net", fat_g: 80, fiber_g: 30 },
  targets_customised: false, onboarded_at: "", updated_at: "", ...over,
});

beforeEach(() => {
  saved = undefined;
  vi.spyOn(session, "request").mockImplementation(async (path: string, init: RequestInit = {}) => {
    if (path === "/api/profile" && init.method === "PUT") {
      saved = JSON.parse(init.body as string);
      return { profile: savedProfile() } as never;
    }
    return {} as never;
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const set = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

/** Fill in the first step as the person the app was originally built for. */
const fillAboutAsKatarina = () => {
  set(/Current weight/, "134");
  set("Height, feet", "5");
  set("Height, inches", "3");
  set("Year of birth", String(THIS_YEAR - 50));
  set("Sex", "female");
  set("Goal", "lose");
  set(/per week/, "1");
};

describe("onboarding", () => {
  it("cannot be skipped past without a weight", async () => {
    render(<Onboarding name="Sam" onDone={() => {}} />);
    expect(screen.getByRole("button", { name: /Next: choose a plan/ })).toHaveProperty("disabled", true);
    set(/Current weight/, "134");
    expect(screen.getByRole("button", { name: /Next: choose a plan/ })).toHaveProperty("disabled", false);
  });

  it("computes the original app's targets, in the browser, from imperial input", async () => {
    render(<Onboarding name="Katarina" onDone={() => {}} />);
    fillAboutAsKatarina();
    click(/Next: choose a plan/);
    click(/Galveston-style/);
    click(/Next: your targets/);

    // No network call was needed to get here.
    expect(session.request).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Calories") as HTMLInputElement).value).toBe("1200");
    expect((screen.getByLabelText("Protein") as HTMLInputElement).value).toBe("80");
    expect((screen.getByLabelText("Net carbs") as HTMLInputElement).value).toBe("25");
    expect((screen.getByLabelText("Fat") as HTMLInputElement).value).toBe("80");
    expect((screen.getByLabelText("Fibre") as HTMLInputElement).value).toBe("30");
  });

  it("explains when the safety floor is what set the calories, rather than showing a number with no reason", async () => {
    render(<Onboarding name="K" onDone={() => {}} />);
    fillAboutAsKatarina();
    click(/Next: choose a plan/);
    click(/Galveston-style/);
    click(/Next: your targets/);
    expect(screen.getByText(/set by the safe minimum of 1200 a day/)).toBeTruthy();
    expect(screen.getByText(/not medical advice/i)).toBeTruthy();
  });

  it("sends metric to the server, with the local date so the weight chart starts today", async () => {
    const onDone = vi.fn();
    render(<Onboarding name="K" onDone={onDone} />);
    fillAboutAsKatarina();
    click(/Next: choose a plan/);
    click(/Galveston-style/);
    click(/Next: your targets/);
    click(/Start tracking/);

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(saved.units).toBe("imperial");            // how they want to SEE it
    expect(saved.weight_kg).toBeCloseTo(lbsToKg(134), 2);   // what is STORED
    expect(saved.height_cm).toBeCloseTo(feetInchesToCm(5, 3), 1);
    expect(saved.birth_year).toBe(THIS_YEAR - 50);
    expect(saved.preset_key).toBe("galveston_style");
    expect(saved.local_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Unedited: no targets sent, so the server's own calculation is what is stored.
    expect(saved.targets).toBeUndefined();
  });

  it("accepts metric input too", async () => {
    render(<Onboarding name="K" onDone={() => {}} />);
    click(/kg \/ cm/);
    set(/Current weight/, "70");
    set(/Height in centimetres/, "175");
    set("Year of birth", String(THIS_YEAR - 35));
    click(/Next: choose a plan/);
    click(/Next: your targets/); // Balanced is preselected
    click(/Start tracking/);

    await waitFor(() => expect(saved).toBeDefined());
    expect(saved.weight_kg).toBe(70);
    expect(saved.height_cm).toBe(175);
    expect(saved.units).toBe("metric");
  });

  it("an edited number is sent, and can be put back", async () => {
    render(<Onboarding name="K" onDone={() => {}} />);
    fillAboutAsKatarina();
    click(/Next: choose a plan/);
    click(/Galveston-style/);
    click(/Next: your targets/);

    set("Protein", "95");
    click(/Reset to the plan's numbers/);
    expect((screen.getByLabelText("Protein") as HTMLInputElement).value).toBe("80");

    set("Protein", "95");
    click(/Start tracking/);
    await waitFor(() => expect(saved).toBeDefined());
    expect(saved.targets).toMatchObject({ protein_g: 95, calories: 1200 });
  });

  it("shows each plan's warnings before it can be chosen", async () => {
    render(<Onboarding name="K" onDone={() => {}} />);
    fillAboutAsKatarina();
    click(/Next: choose a plan/);
    click(/Low carb/);
    expect(screen.getByText(/Not for:/)).toBeTruthy();
    expect(screen.getByText(/insulin/i)).toBeTruthy();
  });

  it("Custom needs no height or birth year, and sends the numbers the user typed", async () => {
    render(<Onboarding name="K" onDone={() => {}} />);
    set(/Current weight/, "150");
    click(/Next: choose a plan/);
    click(/^Custom/);
    click(/Next: your targets/);

    set("Calories", "2400");
    set("Protein", "180");
    click(/Start tracking/);

    await waitFor(() => expect(saved).toBeDefined());
    expect(saved.preset_key).toBe("custom");
    expect(saved.birth_year).toBeUndefined();
    expect(saved.height_cm).toBeUndefined();
    expect(saved.targets).toMatchObject({ calories: 2400, protein_g: 180 });
  });

  it("a computed plan cannot be carried forward without the details it needs", async () => {
    render(<Onboarding name="K" onDone={() => {}} />);
    set(/Current weight/, "150"); // no height, no birth year
    click(/Next: choose a plan/);
    expect(screen.getByRole("alert").textContent).toMatch(/needs your height and year of birth/);
    expect(screen.getByRole("button", { name: /Next: your targets/ })).toHaveProperty("disabled", true);

    click(/^Custom/); // Custom asks for none of it
    expect(screen.getByRole("button", { name: /Next: your targets/ })).toHaveProperty("disabled", false);
  });

  it("shows the server's message if saving fails, and stays put so nothing is lost", async () => {
    vi.spyOn(session, "request").mockRejectedValue(new ApiError("birth_year: this app is for adults: you must be at least 18", 400));
    render(<Onboarding name="K" onDone={() => {}} />);
    fillAboutAsKatarina();
    click(/Next: choose a plan/);
    click(/Next: your targets/);
    click(/Start tracking/);

    expect((await screen.findByRole("alert")).textContent).toMatch(/at least 18/);
    expect(screen.getByRole("button", { name: /Start tracking/ })).toBeTruthy();
  });

  it("agrees with the server: what the browser computes is what computeTargets gives", () => {
    const profile = { sex: "female" as const, age: 50, height_cm: feetInchesToCm(5, 3), weight_kg: lbsToKg(134), activity: "sedentary" as const, goal: "lose" as const, weekly_rate_kg: lbsToKg(1) };
    render(<Onboarding name="K" onDone={() => {}} />);
    fillAboutAsKatarina();
    click(/Next: choose a plan/);
    click(/Galveston-style/);
    click(/Next: your targets/);

    const shown = computeTargets("galveston_style", profile).targets;
    expect((screen.getByLabelText("Calories") as HTMLInputElement).value).toBe(String(shown.calories));
    expect((screen.getByLabelText("Fat") as HTMLInputElement).value).toBe(String(shown.fat_g));
  });
});
