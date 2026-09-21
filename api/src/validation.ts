import { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodTypeAny } from "zod";

// The schemas themselves live in the shared package so the clients use the
// very same definitions. Re-exported here so routes import from one place.
export * from "@nutrition/shared";
import type { ValidationDetail } from "@nutrition/shared";

// ── Middleware ───────────────────────────────────────────────────────────────

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
