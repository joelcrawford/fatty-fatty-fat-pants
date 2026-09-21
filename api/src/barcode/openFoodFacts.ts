// Open Food Facts: a free, open database of packaged foods.
// https://openfoodfacts.github.io/openfoodfacts-server/api/
// Their terms ask for a descriptive User-Agent and no more than 100 product
// reads a minute; the route rate-limits per user and caches to stay far below.

export interface OffProduct {
  product_name?: string;
  brands?: string;
  serving_quantity?: number | string | null;
  serving_quantity_unit?: string | null;
  countries_tags?: string[];
  nutriments?: Record<string, number | string | undefined>;
}

export type ProductLookup = (barcode: string) => Promise<OffProduct | null>;

const FIELDS = "product_name,brands,serving_quantity,serving_quantity_unit,countries_tags,nutriments";

/** Resolves to the product, or null if the database has no such barcode. Throws if it could not be asked. */
export function createOffLookup(userAgent: string, fetchImpl: typeof fetch = fetch, timeoutMs = 6_000): ProductLookup {
  return async (barcode) => {
    const res = await fetchImpl(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${FIELDS}`, {
      headers: { "User-Agent": userAgent, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    // They answer 404 for unknown codes on some paths and 200 + status 0 on others.
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}`);
    const body = (await res.json()) as { status?: number; product?: OffProduct };
    return body.status === 1 && body.product ? body.product : null;
  };
}

// ── Normalisation ────────────────────────────────────────────────────────────

export interface NormalisedProduct {
  name: string;
  brand: string;
  unit: "g" | "ml";
  /** Always 100: macros are per 100 g or 100 ml, the one basis every product has. */
  default_serving: 100;
  cal: number;
  protein: number;
  carbs: number; // TOTAL carbohydrate, fibre included, like every other food in this app
  fat: number;
  fiber: number;
  /** The pack's own serving, in `unit`, to pre-fill the amount field. Null if unknown. */
  suggested_serving: number | null;
  /** Values the database did not have (reported as 0). Show these to the user to fill in. */
  missing: ("name" | "cal" | "protein" | "carbs" | "fat" | "fiber")[];
  /**
   * How `carbs` was obtained. Labels differ by region: in the US and Canada
   * "carbohydrate" INCLUDES fibre; in the EU, UK, Australia and most other
   * places it EXCLUDES it. This app subtracts fibre to get net carbs, so a
   * European figure used as-is would have its fibre subtracted twice.
   *   "label_total"            North American label, used as-is
   *   "label_net_plus_fibre"   other regions: fibre added back to make a total
   */
  carbs_basis: "label_total" | "label_net_plus_fibre";
  /** False when the numbers cannot be right (macros summing to far more than 100 g per 100 g). */
  plausible: boolean;
}

const NORTH_AMERICA = new Set(["en:united-states", "en:canada"]);

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Null when the entry has no usable nutrition data at all. */
export function normaliseProduct(p: OffProduct): NormalisedProduct | null {
  const n = p.nutriments ?? {};
  const missing: NormalisedProduct["missing"] = [];

  // Bounds match what POST /api/foods accepts, so anything returned here can be saved.
  const take = (key: NormalisedProduct["missing"][number], value: number | null, max: number): number => {
    if (value === null || value > max) { missing.push(key); return 0; }
    return round1(value);
  };

  const kcal = num(n["energy-kcal_100g"]) ?? (num(n["energy_100g"]) !== null ? num(n["energy_100g"])! / 4.184 : null);
  const labelCarbs = num(n["carbohydrates_100g"]);
  const labelFibre = num(n["fiber_100g"]);

  if ([kcal, num(n["proteins_100g"]), labelCarbs, num(n["fat_100g"])].every((v) => v === null)) return null;

  // A label's carbohydrate is a total when it is North American, or when it
  // could not be anything else (fibre larger than "carbs" is impossible for a total).
  const northAmerican = (p.countries_tags ?? []).some((c) => NORTH_AMERICA.has(c));
  const mustBeNet = labelCarbs !== null && labelFibre !== null && labelFibre > labelCarbs;
  const carbsBasis: NormalisedProduct["carbs_basis"] = northAmerican && !mustBeNet ? "label_total" : "label_net_plus_fibre";
  const totalCarbs = labelCarbs === null ? null : carbsBasis === "label_total" ? labelCarbs : labelCarbs + (labelFibre ?? 0);

  const name = (p.product_name ?? "").trim().slice(0, 200);
  if (!name) missing.push("name");

  const cal = take("cal", kcal, 10_000);
  const protein = take("protein", num(n["proteins_100g"]), 2_000);
  const carbs = take("carbs", totalCarbs, 2_000);
  const fat = take("fat", num(n["fat_100g"]), 2_000);
  const fiber = take("fiber", labelFibre, 2_000);

  const serving = num(p.serving_quantity);
  const unit = (p.serving_quantity_unit ?? "").toLowerCase() === "ml" ? "ml" : "g";

  return {
    name,
    brand: (p.brands ?? "").split(",")[0].trim().slice(0, 100),
    unit,
    default_serving: 100,
    cal, protein, carbs, fat, fiber,
    suggested_serving: serving !== null && serving > 0 && serving <= 10_000 ? round1(serving) : null,
    missing,
    carbs_basis: carbsBasis,
    // Per 100 g, protein + total carbs + fat cannot exceed 100 g. Allow for rounding and label slack.
    plausible: protein + carbs + fat <= 105,
  };
}
