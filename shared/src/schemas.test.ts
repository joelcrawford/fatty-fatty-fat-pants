import { describe, expect, it } from "vitest";
import { foodEntrySchema, registerSchema, customFoodSchema, barcodeParams, dateString, MEALS } from "./index";

// The API's own suite tests these schemas exhaustively through HTTP. These
// cases cover what is new: that a CLIENT can run the same schema before
// sending, and gets the same verdict and the same messages the server would give.
describe("schemas, used client-side", () => {
  it("a form can validate before sending and show the server's exact wording", () => {
    const result = registerSchema.safeParse({ email: "not-an-email", password: "short", invite_code: "K7QM-2XRD-9HTW" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => [i.path.join("."), i.message])).toEqual([
        ["email", "must be a valid email address"],
        ["password", "must be at least 10 characters"],
      ]);
    }
  });

  it("parsing applies the same tidying the server will: trimmed, lower-cased, defaults filled", () => {
    expect(registerSchema.parse({ email: "  Sam@Example.COM ", password: "a long enough password", invite_code: "X" }))
      .toEqual({ email: "sam@example.com", password: "a long enough password", name: "", invite_code: "X" });
    expect(foodEntrySchema.parse({ date: "2026-04-26", meal: "Lunch", food_name: " Avocado " }))
      .toEqual({ date: "2026-04-26", meal: "Lunch", food_name: "Avocado", amount: "", cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  });

  it("a custom food needs all five macros; a log entry does not", () => {
    expect(customFoodSchema.safeParse({ name: "Granola" }).success).toBe(false);
    expect(foodEntrySchema.safeParse({ date: "2026-04-26", meal: "Snacks", food_name: "Mystery" }).success).toBe(true);
  });

  it("a scanner can reject a misread before spending a request on it", () => {
    expect(barcodeParams.safeParse({ barcode: "3017620422003" }).success).toBe(true);
    expect(barcodeParams.safeParse({ barcode: "3017620422004" }).success).toBe(false);
  });

  it("dates must be real", () => {
    expect(dateString.safeParse("2024-02-29").success).toBe(true);
    expect(dateString.safeParse("2025-02-29").success).toBe(false);
  });

  it("exports the meal names the schema accepts", () => {
    for (const meal of MEALS) expect(foodEntrySchema.shape.meal.safeParse(meal).success).toBe(true);
  });
});
