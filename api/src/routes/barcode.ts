import { Router, Request, Response, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { Db } from "../db";
import { Config } from "../config";
import { currentUserId } from "../auth/middleware";
import { nowSeconds } from "../auth/tokens";
import { canonicalBarcode } from "@nutrition/shared";
import { validate, barcodeParams } from "../validation";
import { ProductLookup, OffProduct, normaliseProduct } from "../barcode/openFoodFacts";

const DAY = 86_400;

/**
 * GET /api/foods/barcode/:barcode
 *
 * Looks in three places, in this order:
 *   1. the user's OWN custom foods: if they have saved this barcode (perhaps
 *      after correcting the numbers) their version always wins
 *   2. the shared cache of earlier lookups
 *   3. Open Food Facts
 *
 * The result is NOT saved as a food. The client shows it for confirmation and
 * then either logs it or saves it with POST /api/foods.
 */
export function createBarcodeRouter(db: Db, config: Config, lookup: ProductLookup): Router {
  const router = Router();

  // Keyed by user, not IP: this runs after requireAuth, and several phones can share one address.
  const limited: RequestHandler = config.barcodeRateLimit
    ? rateLimit({
        windowMs: config.barcodeRateLimit.windowMinutes * 60_000,
        limit: config.barcodeRateLimit.max,
        keyGenerator: (req) => `user:${currentUserId(req)}`,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (_req, res) => res.status(429).json({ success: false, error: "Too many barcode lookups. Please wait a few minutes." }),
      })
    : (_req, _res, next) => next();

  router.get("/foods/barcode/:barcode", validate({ params: barcodeParams }), limited, async (req: Request, res: Response) => {
    try {
      const scanned = req.params.barcode;
      const barcode = canonicalBarcode(scanned);

      // 1. The user's own food with this barcode, in either spelling.
      const own = db
        .prepare("SELECT * FROM foods WHERE user_id = ? AND barcode IN (?, ?) ORDER BY id DESC LIMIT 1")
        .get(currentUserId(req), barcode, scanned) as Record<string, unknown> | undefined;
      if (own) {
        const { user_id, seed_key, created_at, ...food } = own;
        return res.json({ success: true, data: { source: "custom", barcode, food: { ...food, custom: true } } });
      }

      // 2. The cache.
      const cached = db.prepare("SELECT found, product, fetched_at FROM barcode_cache WHERE barcode = ?").get(barcode) as
        | { found: 0 | 1; product: string | null; fetched_at: number }
        | undefined;
      const ttl = cached?.found ? config.barcodeCache.foundDays : config.barcodeCache.notFoundDays;
      let product: OffProduct | null | undefined =
        cached && nowSeconds() - cached.fetched_at < ttl * DAY ? (cached.found ? JSON.parse(cached.product!) : null) : undefined;

      // 3. Open Food Facts.
      if (product === undefined) {
        try {
          product = await lookup(barcode);
        } catch (err) {
          // A stale answer beats no answer when the upstream is down.
          if (cached?.found) {
            product = JSON.parse(cached.product!);
          } else {
            if (config.env !== "test") console.error("Open Food Facts lookup failed:", err);
            return res.status(502).json({ success: false, error: "Could not reach the product database. Try again, or add the food by hand." });
          }
        }
        if (product !== undefined) {
          db.prepare(`
            INSERT INTO barcode_cache (barcode, found, product, fetched_at) VALUES (?, ?, ?, ?)
            ON CONFLICT (barcode) DO UPDATE SET found = excluded.found, product = excluded.product, fetched_at = excluded.fetched_at
          `).run(barcode, product ? 1 : 0, product ? JSON.stringify(product) : null, nowSeconds());
        }
      }

      const normalised = product ? normaliseProduct(product) : null;
      if (!normalised) {
        return res.status(404).json({
          success: false,
          error: product ? "That product is listed but has no nutrition information. You can add it by hand." : "No product found for that barcode. You can add it by hand.",
        });
      }

      const { suggested_serving, missing, carbs_basis, plausible, brand, ...food } = normalised;
      res.json({
        success: true,
        data: {
          source: "openfoodfacts",
          barcode,
          food: { id: null, ...food, category: "Packaged", barcode, custom: false },
          brand, suggested_serving, missing, carbs_basis, plausible,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to look up barcode" });
    }
  });

  return router;
}
