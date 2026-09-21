import { NextFunction, Request, RequestHandler, Response } from "express";
import { z, ZodTypeAny } from "zod";

// ── Building blocks ──────────────────────────────────────────────────────────

export const MEALS = ["Breakfast", "Lunch", "Dinner", "Snacks"] as const;

/** YYYY-MM-DD that is also a real calendar date (rejects 2026-02-30). */
export const dateString = z
  .string({ required_error: "is required", invalid_type_error: "must be a string" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date in YYYY-MM-DD format")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, "is not a real calendar date");

/**
 * A quantity that cannot be negative. The upper bounds are sanity limits to
 * catch unit mistakes and garbage, not nutritional advice.
 */
const amount = (max: number) =>
  z
    .number({ invalid_type_error: "must be a number" })
    .finite("must be a finite number")
    .min(0, "cannot be negative")
    .max(max, `cannot be more than ${max}`)
    .default(0);

const text = (max: number) =>
  z
    .string({ required_error: "is required", invalid_type_error: "must be a string" })
    .trim()
    .min(1, "cannot be empty")
    .max(max, `cannot be longer than ${max} characters`);

const shortLabel = z.string({ invalid_type_error: "must be a string" }).trim().max(50, "cannot be longer than 50 characters").default("");

// ── Request schemas ──────────────────────────────────────────────────────────
// Unknown keys are stripped, not rejected. In particular a client-supplied
// user_id is discarded: ownership always comes from the authenticated user.

export const foodEntrySchema = z.object({
  date: dateString,
  meal: z.enum(MEALS, {
    errorMap: () => ({ message: `must be one of: ${MEALS.join(", ")}` }),
  }),
  food_name: text(200),
  amount: shortLabel,
  cal: amount(10_000),
  protein: amount(2_000),
  carbs: amount(2_000),
  fat: amount(2_000),
  fiber: amount(2_000),
});
export type FoodInput = z.infer<typeof foodEntrySchema>;

export const foodBatchSchema = z
  .array(foodEntrySchema, { invalid_type_error: "Expected an array of food entries" })
  .min(1, "Expected at least one food entry")
  .max(50, "Cannot log more than 50 entries at once");

export const exerciseEntrySchema = z.object({
  date: dateString,
  name: text(200),
  duration: shortLabel,
  cal: amount(10_000),
});
export type ExerciseInput = z.infer<typeof exerciseEntrySchema>;

export const weightEntrySchema = z.object({
  date: dateString,
  weight_lbs: z
    .number({ required_error: "is required", invalid_type_error: "must be a number" })
    .finite("must be a finite number")
    .positive("must be greater than 0")
    .max(1_500, "cannot be more than 1500"),
  notes: z.string({ invalid_type_error: "must be a string" }).trim().max(500, "cannot be longer than 500 characters").optional(),
});
export type WeightInput = z.infer<typeof weightEntrySchema>;

export const dateParams = z.object({ date: dateString });

export const idParams = z.object({
  id: z.coerce
    .number({ invalid_type_error: "must be a positive whole number" })
    .int("must be a positive whole number")
    .positive("must be a positive whole number"),
});

const MAX_RANGE_DAYS = 366;
const dayNumber = (s: string) => Date.parse(`${s}T00:00:00Z`) / 86_400_000;

export const rangeQuery = z
  .object({ start: dateString, end: dateString })
  .refine((q) => q.start <= q.end, { message: "must not be after end", path: ["start"] })
  .refine((q) => dayNumber(q.end) - dayNumber(q.start) < MAX_RANGE_DAYS, {
    message: `range cannot be longer than ${MAX_RANGE_DAYS} days`,
    path: ["end"],
  });

export const weightQuery = z.object({
  days: z.coerce
    .number({ invalid_type_error: "must be a whole number from 1 to 365" })
    .int("must be a whole number from 1 to 365")
    .min(1, "must be a whole number from 1 to 365")
    .max(365, "must be a whole number from 1 to 365")
    .default(30),
});

// ── Catalog ──────────────────────────────────────────────────────────────────

// Same shape as a built-in food. Macros are per `default_serving` of `unit`.
// Unlike a log entry's macros these do not default: a custom food with its
// calories forgotten would silently log zeros forever.
const macro = (max: number) =>
  z
    .number({ required_error: "is required", invalid_type_error: "must be a number" })
    .finite("must be a finite number")
    .min(0, "cannot be negative")
    .max(max, `cannot be more than ${max}`);

export const customFoodSchema = z.object({
  name: text(200),
  category: z.string({ invalid_type_error: "must be a string" }).trim().min(1, "cannot be empty").max(50, "cannot be longer than 50 characters").default("Other"),
  unit: z.string({ invalid_type_error: "must be a string" }).trim().min(1, "cannot be empty").max(20, "cannot be longer than 20 characters").default("g"),
  default_serving: z
    .number({ invalid_type_error: "must be a number" })
    .finite("must be a finite number")
    .positive("must be greater than 0")
    .max(10_000, "cannot be more than 10000")
    .default(100),
  cal: macro(10_000),
  protein: macro(2_000),
  carbs: macro(2_000),
  fat: macro(2_000),
  fiber: macro(2_000),
  barcode: z.string({ invalid_type_error: "must be a string" }).trim().regex(/^\d{6,14}$/, "must be 6 to 14 digits").optional(),
});
export type CustomFoodInput = z.infer<typeof customFoodSchema>;

export const foodSearchQuery = z.object({
  q: z.string().trim().max(100, "cannot be longer than 100 characters").optional(),
  category: z.string().trim().max(50, "cannot be longer than 50 characters").optional(),
  scope: z.enum(["all", "mine", "builtin"], { errorMap: () => ({ message: "must be one of: all, mine, builtin" }) }).default("all"),
});

// ── Auth ─────────────────────────────────────────────────────────────────────

const email = z
  .string({ required_error: "is required", invalid_type_error: "must be a string" })
  .trim()
  .toLowerCase()
  .max(254, "cannot be longer than 254 characters")
  .email("must be a valid email address");

// Length is the only rule (NIST 800-63B): composition rules make passwords
// worse. The cap stops someone making the server hash a megabyte.
const newPassword = z
  .string({ required_error: "is required", invalid_type_error: "must be a string" })
  .min(10, "must be at least 10 characters")
  .max(200, "cannot be longer than 200 characters");

// For checking an existing password: never reveal the rules, just require one.
const existingPassword = z
  .string({ required_error: "is required", invalid_type_error: "must be a string" })
  .min(1, "is required")
  .max(200, "cannot be longer than 200 characters");

const opaqueToken = z
  .string({ required_error: "is required", invalid_type_error: "must be a string" })
  .min(1, "is required")
  .max(200, "is not valid");

export const registerSchema = z.object({
  email,
  password: newPassword,
  name: z.string({ invalid_type_error: "must be a string" }).trim().max(100, "cannot be longer than 100 characters").default(""),
  invite_code: opaqueToken,
});
export const loginSchema = z.object({ email, password: existingPassword });
export const refreshSchema = z.object({ refresh_token: opaqueToken });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token: opaqueToken, password: newPassword });
export const deleteAccountSchema = z.object({ password: existingPassword });

// ── Middleware ───────────────────────────────────────────────────────────────

export interface ValidationDetail {
  /** Where the problem is, e.g. "meal", "1.cal" (second batch entry), "start". */
  path: string;
  message: string;
}

type Part = "body" | "params" | "query";

/**
 * Validate parts of the request before the handler runs.
 *
 * On success each part is REPLACED by the parsed value, so handlers see
 * trimmed strings, applied defaults, coerced numbers, and no unknown keys.
 * On failure the request never reaches the handler or the database:
 *
 *   400 { success: false, error: "meal: must be one of: …", details: [...] }
 *
 * `error` is one human-readable sentence (what the web app shows today);
 * `details` lets a form highlight individual fields.
 */
export function validate(schemas: Partial<Record<Part, ZodTypeAny>>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const details: ValidationDetail[] = [];

    for (const part of ["params", "query", "body"] as const) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part]);
      if (result.success) {
        (req as Record<Part, unknown>)[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ path: issue.path.join("."), message: issue.message });
        }
      }
    }

    if (details.length > 0) {
      const error = details.map((d) => (d.path ? `${d.path}: ${d.message}` : d.message)).join("; ");
      res.status(400).json({ success: false, error, details });
      return;
    }

    next();
  };
}
