# API Specification
## Katarina's Nutrition Tracker — REST API v1

**Base URL (production):** `https://api.yourdomain.com`
**Base URL (local dev):** `http://localhost:3001`

All requests and responses use JSON. All dates are `YYYY-MM-DD` strings. All macro values are in grams (or calories for calorie fields).

---

## Global Response Shape

Every endpoint returns the same wrapper:

```json
// Success
{ "success": true, "data": <payload> }

// Error
{ "success": false, "error": "Human-readable error message" }

// Validation error (400) — same envelope, plus one entry per problem
{
  "success": false,
  "error": "meal: must be one of: Breakfast, Lunch, Dinner, Snacks; cal: cannot be negative",
  "details": [
    { "path": "meal", "message": "must be one of: Breakfast, Lunch, Dinner, Snacks" },
    { "path": "cal",  "message": "cannot be negative" }
  ]
}
```

---

## Authentication

This is a multi-user API. Everything except `/health` and the public auth endpoints below requires

```
Authorization: Bearer <access_token>
```

and answers **401** `{ "success": false, "error": "Authentication required" }` without it. Every row belongs to the authenticated user; there is no way to address another user's data, and a client-supplied `user_id` is ignored.

**Two tokens**

| | Access token | Refresh token |
|---|---|---|
| What | JWT (HS256) | 256 random bits, opaque |
| Lifetime | 15 minutes | 60 days |
| Sent | on every request, in the header | only to `/api/auth/refresh` and `/api/auth/logout` |
| Server stores | nothing | a SHA-256 hash, never the token |
| Store on device | memory | secure storage (`expo-secure-store`) |

**Client loop:** on a 401 from a data endpoint, call `refresh` once, retry the request, and send the user to the login screen if the refresh also fails. Each refresh returns a **new** refresh token and retires the old one; always save the new one.

**When sessions end early.** Password reset, logout-all, and account deletion take effect at once on every device, including access tokens already issued. If a refresh token that was already rotated is presented again, it has been copied, so every session for that user is ended. A logged-out token being retried is just refused.

### POST /api/auth/register
By invitation. Codes are minted on the server with `npm run invite` (see the Implementation Guide).

```json
{ "email": "sam@example.com", "password": "at least ten characters", "name": "Sam", "invite_code": "K7QM-2XRD-9HTW" }
```
**201:**
```json
{
  "success": true,
  "data": {
    "user": { "id": 3, "email": "sam@example.com", "name": "Sam", "created_at": "2026-09-20 18:04:11" },
    "access_token": "eyJ…", "refresh_token": "p1X…", "token_type": "Bearer", "expires_in": 900
  }
}
```
**403** invite code unknown, used, or expired · **409** email already registered (the invite is not spent) · **400** validation. Email is trimmed and lower-cased. Password: 10–200 characters, no composition rules.

### POST /api/auth/login
`{ "email", "password" }` → **200** with the same shape as register. **401** `"Email or password is incorrect"` for both a wrong password and an unknown email, with the same response time.

### POST /api/auth/refresh
`{ "refresh_token" }` → **200** `{ access_token, refresh_token, token_type, expires_in }`. **401** `"Session expired. Please log in again."`

### POST /api/auth/logout
`{ "refresh_token" }` → **200** always. Ends that device's session only.

### POST /api/auth/logout-all 🔒
Ends every session on every device immediately. → `{ "sessions_ended": 2 }`

### GET /api/auth/me 🔒
→ `{ id, email, name, created_at }`

### DELETE /api/auth/me 🔒
`{ "password" }` → **200** `{ "deleted": true }`. Permanently deletes the account and all of its data. **403** if the password is wrong. Required by both app stores to be reachable in-app.

### POST /api/auth/forgot-password
`{ "email" }` → **200** always, with the same message whether or not the email has an account (and even if the mail provider is down). Sends a link valid for 30 minutes. Asking again cancels the earlier link.

### POST /api/auth/reset-password
`{ "token", "password" }` → **200**. The link works once. Ends every session. **400** if the token is unknown, used, or expired.

### Rate limiting
The unauthenticated endpoints share a budget of 20 requests per 15 minutes per IP address. Over that: **429** `"Too many attempts. Please wait a few minutes and try again."` Authenticated requests are not limited.

---

## Validation

Every request is validated before it reaches the database (`api/src/validation.ts`). A request that fails is rejected with **400** and stores nothing. All problems are reported at once. `error` is a single sentence suitable for showing to a person; `details[].path` names the field so a form can highlight it (for batch requests the path includes the index, e.g. `1.meal`).

| Rule | Applies to |
|---|---|
| `YYYY-MM-DD` **and** a real calendar date (`2026-02-30` is rejected) | every `date`, in paths, queries and bodies |
| One of `Breakfast`, `Lunch`, `Dinner`, `Snacks` (case-sensitive) | `meal` |
| Number, finite, `0`–`10000`; defaults to `0` | `cal` (food and exercise) |
| Number, finite, `0`–`2000`; defaults to `0` | `protein`, `carbs`, `fat`, `fiber` |
| String, trimmed, 1–200 characters | `food_name`, exercise `name` |
| String, trimmed, up to 50 characters; defaults to `""` | `amount`, `duration` |
| Number, greater than `0`, at most `1500` | `weight_lbs` |
| String, trimmed, up to 500 characters; optional | weight `notes` |
| Positive whole number | `:id` |
| 1–50 entries | `POST /api/food/batch` |
| `start` ≤ `end`, span of at most 366 days | `GET /api/summary/range` |
| Whole number 1–365; defaults to `30` | `?days` on `GET /api/summary/weight` |

Numbers must be JSON numbers; `"30"` is rejected. Strings are trimmed before storing. Unknown keys are **stripped, not rejected**; in particular a client-supplied `user_id`, `id` or `created_at` is ignored.

The upper bounds are sanity limits that catch unit mistakes and garbage. They are not nutritional guidance.

---

## Health Check

### GET /health

Returns server status. Use this to verify the API is reachable before making data calls.

**Response 200:**
```json
{
  "status": "ok",
  "timestamp": "2026-04-26T14:32:00.000Z"
}
```

---

## Catalog

Foods, exercises and meal plans live in the database. Built-in rows come from `api/src/db/seed/catalog.json` and are the same for everyone; custom foods belong to the user who added them and are invisible to everyone else. All catalog endpoints require authentication.

> **Naming:** `/api/food` (singular) is the **log** of what was eaten. `/api/foods` (plural) is the **catalog** of things that can be eaten.

### GET /api/foods
Every built-in food, then the caller's own custom foods. The catalog is a few hundred small rows, so with no query it is returned whole and clients filter as the user types.

| Query | Description |
|---|---|
| `q` | Case-insensitive match anywhere in the name. `%` and `_` are ordinary characters |
| `category` | Exact category, case-insensitive (`Protein`, `Sushi`, …) |
| `scope` | `all` (default), `mine` (custom only), `builtin` |

```json
{ "id": 28, "name": "Avocado", "category": "Vegetables", "unit": "g", "default_serving": 100,
  "cal": 160, "protein": 2, "carbs": 9, "fat": 15, "fiber": 6.7, "barcode": null, "custom": false }
```
Macros are per `default_serving` of `unit`. To log 80 g of avocado, scale by `80 / 100`. `carbs` is total; net carbs is `max(0, carbs - fiber)`. `custom` is `true` for a food the caller added, and only those can be deleted.

### POST /api/foods
Adds a custom food. `name` and all five macros are **required** (a food saved with its calories forgotten would log zeros forever). `category` defaults to `Other`, `unit` to `g`, `default_serving` to `100`. Optional `barcode` of 6–14 digits. → **201** with the food in the shape above, `custom: true`.

### DELETE /api/foods/:id
Custom foods only. **403** for a built-in food. **404** for an unknown id *and* for another user's food, which are deliberately indistinguishable. Entries already logged from the food are unaffected: the log keeps its own copy of the name and macros.

### GET /api/foods/barcode/:barcode
Looks a packaged food up by its barcode. Accepts GTIN-8, UPC-A (12), EAN-13 and GTIN-14; the check digit is verified, so most misreads are a **400** before anything is looked up. A 12-digit UPC and the same number with a leading zero are treated as one barcode.

Looks in three places, in order: **the caller's own custom foods** (if you saved this barcode, perhaps after fixing the numbers, your version always wins), a shared cache, then [Open Food Facts](https://world.openfoodfacts.org). The result is **not saved**: show it for confirmation, then log it, or save it with `POST /api/foods` (the `food` object minus `id` and `custom` is a valid body).

```json
{
  "source": "openfoodfacts",
  "barcode": "0016000275287",
  "food": { "id": null, "name": "Cheerios", "category": "Packaged", "unit": "g", "default_serving": 100,
            "cal": 359, "protein": 12.8, "carbs": 74.4, "fat": 6.4, "fiber": 10.3, "barcode": "0016000275287", "custom": false },
  "brand": "Cheerios",
  "suggested_serving": 39,
  "missing": [],
  "carbs_basis": "label_total",
  "plausible": true
}
```
| Field | Meaning |
|---|---|
| `source` | `openfoodfacts`, or `custom` when it is the caller's own food (then `food.id` is set and the extra fields below are absent) |
| `food` | Per **100 g or 100 ml**, the one basis every product has |
| `suggested_serving` | The pack's own serving in `food.unit`, to pre-fill the amount. `null` if unknown |
| `missing` | Values the database lacked, reported as `0`. Ask the user to fill these in. May include `name` |
| `carbs_basis` | `label_total` or `label_net_plus_fibre`. See below |
| `plausible` | `false` when the numbers cannot be right (macros far over 100 g per 100 g). Warn the user |

**Why `carbs_basis` exists.** "Carbohydrate" on a US or Canadian label **includes** fibre. In the EU, UK, Australia and most other places it **excludes** it. This app computes net carbs as `carbs − fiber`, so a European figure used as-is would have its fibre subtracted twice. `food.carbs` is therefore always a **total**: for non-North-American products the fibre is added back. The region comes from the product's listed countries, which is a heuristic, so a client may want to show "check the carbs" when it is `label_net_plus_fibre` and fibre is high.

**404** no such product, or it is listed with no nutrition data (the message says which, and suggests adding it by hand) · **502** Open Food Facts could not be reached and there is no cached copy · **429** more than 60 lookups in 10 minutes for one user. Found products are cached for 30 days and misses for 1 day; if the upstream is down, an expired cached product is served rather than failing.

### GET /api/exercises
```json
{ "id": 10, "name": "Lagree (Megaformer)", "met": 6.109, "cal_per_min": 6.5, "cal_per_min_weight_kg": 60.8 }
```
`met` is the real datum: `cal/min = met × 3.5 × body weight (kg) / 200`. Until user profiles exist (#15), `cal_per_min` is computed for the reference weight stated in `cal_per_min_weight_kg`, which reproduces the original app's numbers.

### GET /api/meal-plans
Each plan with its items, and each item with its full food, so a client can display and log a recipe without a second request. Log it with `POST /api/food/batch`.
```json
{ "id": 5, "name": "Salmon Avocado Bowl", "meal_type": "Lunch", "badge": "Galveston", "description": "…",
  "items": [ { "serving_amount": 120, "food": { "id": 2, "name": "Salmon (cooked)", "default_serving": 100, "cal": 208, "…": "…" } } ] }
```

---

## Presets

A preset is a named nutrition plan that turns a person's stats into starting daily targets. The rules are **code in the shared package** (`shared/src/presets.ts`), so a client can call `computeTargets()` locally for instant feedback while the user types, and gets exactly what the server would say. These endpoints mean a client never hard-codes the list.

> Not medical advice. Every response carries a `disclaimer` that the review screen must show, and each preset lists who it is `notFor`. Every number is editable by the user.

### GET /api/presets
```json
{
  "presets": [
    { "key": "galveston_style", "name": "Galveston-style, muscle-preserving", "summary": "…", "whoFor": "…",
      "notFor": ["Anyone under 18", "…"], "carbs_mode": "net", "emphasis": ["carbs", "fiber", "protein", "calories"],
      "sources": ["…"], "computed": true }
  ],
  "disclaimer": "These targets are general estimates …",
  "limits": { "calorie_floor": { "female": 1200, "male": 1500 }, "calorie_ceiling": 5000 },
  "activity_levels": ["sedentary", "light", "moderate", "active", "very_active"],
  "goals": ["lose", "maintain", "gain"]
}
```
Five presets: `galveston_style`, `balanced`, `high_protein`, `low_carb`, and `custom` (`computed: false`: the user types their own numbers). `emphasis` is the order in which to feature metrics on the dashboard. **User-facing text says "Galveston-style", never "Galveston Diet"**, which is someone else's brand.

### POST /api/presets/:key/preview
Targets for a draft profile. **Stores nothing**: this is what the review screen shows before the user commits. Metric units; convert from lbs and ft/in with the shared helpers.

| Field | Required | Notes |
|---|---|---|
| `age` | yes | 18–100. Under 18 is refused |
| `height_cm` | yes | 120–230 |
| `weight_kg` | yes | 30–300 |
| `sex` | no | `female`, `male` or `null`. When withheld the energy formula uses the midpoint and the **higher** calorie floor applies |
| `activity` | no | default `sedentary` |
| `goal` | no | `lose`, `maintain` (default), `gain` |
| `weekly_rate_kg` | no | 0–1, default 0.45 (about 1 lb). Ignored when maintaining |

```json
{
  "preset": "galveston_style",
  "targets": { "calories": 1200, "protein_g": 80, "carbs_g": 25, "carbs_mode": "net", "fat_g": 80, "fiber_g": 30 },
  "explanation": { "bmr": 1197, "maintenance": 1436, "goal_adjustment": -499, "rate_capped": false,
                   "calorie_floor": 1200, "floor_applied": true, "ceiling_applied": false, "protein_capped": false },
  "disclaimer": "…"
}
```
`carbs_mode` says how to read `carbs_g`: `net` (carbohydrate minus fibre) for the low-carb plans, `total` for the others. `calories` is a **net** target: exercise is earned back on top of it.

`explanation` is for the review screen and hides nothing. In particular show it when `floor_applied` (the safety minimum set the calories, not the goal), `rate_capped` (the requested pace was reduced to 1% of body weight a week, at most 1 kg), `ceiling_applied`, or `protein_capped` (held to 35% of calories).

**400** for invalid input, an unknown preset key, or `custom` (which has no formula).

---

## Food Log

### GET /api/food/:date

Returns all food entries logged for a specific date, ordered by creation time.

**Parameters:**
| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `date` | path | string | Yes | Date in YYYY-MM-DD format |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 42,
      "user_id": 1,
      "date": "2026-04-26",
      "meal": "Breakfast",
      "food_name": "Premier Protein Shake – Chocolate",
      "amount": "1 bottle",
      "cal": 160,
      "protein": 30,
      "carbs": 5,
      "fat": 3,
      "fiber": 3,
      "created_at": "2026-04-26T08:14:22"
    }
  ]
}
```

**Notes:**
- Returns empty array `[]` if no entries exist for the date — not a 404
- `meal` is always one of: `Breakfast`, `Lunch`, `Dinner`, `Snacks`
- Net carbs is not stored — calculate as `max(0, carbs - fiber)` in the frontend

---

### POST /api/food

Adds a single food entry to the log.

**Request body:**
```json
{
  "date": "2026-04-26",
  "meal": "Breakfast",
  "food_name": "Premier Protein Shake – Chocolate",
  "amount": "1 bottle",
  "cal": 160,
  "protein": 30,
  "carbs": 5,
  "fat": 3,
  "fiber": 3
}
```

**Required fields:** `date`, `meal`, `food_name`
**Optional fields:** `amount`, `cal`, `protein`, `carbs`, `fat`, `fiber` (all default to 0 if omitted)

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": 43,
    "user_id": 1,
    "date": "2026-04-26",
    "meal": "Breakfast",
    "food_name": "Premier Protein Shake – Chocolate",
    "amount": "1 bottle",
    "cal": 160,
    "protein": 30,
    "carbs": 5,
    "fat": 3,
    "fiber": 3,
    "created_at": "2026-04-26T08:15:00"
  }
}
```

**Response 400** (validation, see [Validation](#validation)):
```json
{
  "success": false,
  "error": "meal: must be one of: Breakfast, Lunch, Dinner, Snacks",
  "details": [{ "path": "meal", "message": "must be one of: Breakfast, Lunch, Dinner, Snacks" }]
}
```

---

### POST /api/food/batch

Adds 1–50 food entries at once. Used when logging a full recipe from the Meals tab. It is all-or-nothing twice over: the whole array is validated before anything is written, and the inserts run in one transaction.

**Request body:**
```json
[
  {
    "date": "2026-04-26",
    "meal": "Lunch",
    "food_name": "Salmon (cooked)",
    "amount": "120 g",
    "cal": 250,
    "protein": 24,
    "carbs": 0,
    "fat": 15.6,
    "fiber": 0
  },
  {
    "date": "2026-04-26",
    "meal": "Lunch",
    "food_name": "Avocado",
    "amount": "80 g",
    "cal": 128,
    "protein": 1.6,
    "carbs": 7.2,
    "fat": 12,
    "fiber": 5.4
  }
]
```

**Response 201:**
```json
{
  "success": true,
  "data": [
    { "id": 44, ...entry1 },
    { "id": 45, ...entry2 }
  ]
}
```

**Response 400** (not an array, empty, more than 50, or any entry invalid). The path names the offending entry by index:
```json
{
  "success": false,
  "error": "1.meal: must be one of: Breakfast, Lunch, Dinner, Snacks",
  "details": [{ "path": "1.meal", "message": "must be one of: Breakfast, Lunch, Dinner, Snacks" }]
}
```

---

### DELETE /api/food/:id

Removes a single food log entry by ID.

**Parameters:**
| Name | In | Type | Required |
|---|---|---|---|
| `id` | path | integer | Yes |

**Response 200:**
```json
{ "success": true, "data": { "deleted_id": 42 } }
```

**Response 404:**
```json
{ "success": false, "error": "Entry not found" }
```

---

## Exercise Log

### GET /api/exercise/:date

Returns all exercise entries for a date.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 12,
      "user_id": 1,
      "date": "2026-04-26",
      "name": "Lagree (Megaformer)",
      "duration": "45 min",
      "cal": 293,
      "created_at": "2026-04-26T09:30:00"
    }
  ]
}
```

---

### POST /api/exercise

Logs an exercise session.

**Request body:**
```json
{
  "date": "2026-04-26",
  "name": "Lagree (Megaformer)",
  "duration": "45 min",
  "cal": 293
}
```

**Required fields:** `date`, `name`
**Optional:** `duration` (defaults to `""`), `cal` (defaults to 0)

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": 13,
    "user_id": 1,
    "date": "2026-04-26",
    "name": "Lagree (Megaformer)",
    "duration": "45 min",
    "cal": 293,
    "created_at": "2026-04-26T09:31:00"
  }
}
```

---

### DELETE /api/exercise/:id

Removes an exercise entry.

**Response 200:**
```json
{ "success": true, "data": { "deleted_id": 12 } }
```

---

## Summary

### GET /api/summary/day/:date

Returns a complete nutrition summary for a single day — totals across all food entries, exercise burn, and derived values. Useful for the dashboard ring and macro bars.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "date": "2026-04-26",
    "total_cal": 980,
    "total_protein": 72.4,
    "total_carbs": 38.6,
    "total_fat": 71.2,
    "total_fiber": 18.3,
    "net_carbs": 20.3,
    "exercise_cal": 293,
    "net_cal": 687
  }
}
```

**Field descriptions:**

| Field | Description |
|---|---|
| `total_cal` | Sum of all food calories |
| `total_protein` | Sum of all protein in grams |
| `total_carbs` | Sum of all carbohydrates in grams (total, not net) |
| `total_fat` | Sum of all fat in grams |
| `total_fiber` | Sum of all fibre in grams |
| `net_carbs` | `max(0, total_carbs - total_fiber)` |
| `exercise_cal` | Sum of all exercise calories burned |
| `net_cal` | `total_cal - exercise_cal` |

---

### GET /api/summary/range?start=YYYY-MM-DD&end=YYYY-MM-DD

Returns daily summaries for all days with food logged within a date range. Used by the History tab to populate the date chips and bar charts.

**Query parameters:**
| Name | Required | Example |
|---|---|---|
| `start` | Yes | `2026-03-27` |
| `end` | Yes | `2026-04-26` |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2026-04-26",
      "total_cal": 980,
      "total_protein": 72.4,
      "total_carbs": 38.6,
      "total_fat": 71.2,
      "total_fiber": 18.3,
      "net_carbs": 20.3,
      "exercise_cal": 293,
      "net_cal": 687
    },
    {
      "date": "2026-04-25",
      ...
    }
  ]
}
```

**Notes:**
- Results are ordered by date descending (most recent first)
- Days with no food logged are not included (no empty days)
- `start` must not be after `end`, and the span may not exceed 366 days

**Response 400** (missing, malformed, backwards, or too long):
```json
{
  "success": false,
  "error": "end: is required",
  "details": [{ "path": "end", "message": "is required" }]
}
```

---

### POST /api/summary/weight

Logs a weight entry for a given date. There is one entry per user per date: weighing in again on the same date **replaces** that day's weight and notes. The status code says which happened, and the response is always the row as stored.

**Request body:**
```json
{
  "date": "2026-04-26",
  "weight_lbs": 133.2,
  "notes": "After Lagree, felt good"
}
```

**Required:** `date`, `weight_lbs`
**Optional:** `notes`

**Response 201** (new entry) or **200** (existing entry for that date replaced):
```json
{
  "success": true,
  "data": {
    "id": 8,
    "user_id": 1,
    "date": "2026-04-26",
    "weight_lbs": 133.2,
    "notes": "After Lagree, felt good",
    "created_at": "2026-04-26T08:15:00"
  }
}
```

---

### GET /api/summary/weight?days=30

Returns recent weight log entries, ordered by date descending.

**Query parameters:**
| Name | Required | Default | Description |
|---|---|---|---|
| `days` | No | `30` | Maximum number of entries to return |

**Response 200:**
```json
{
  "success": true,
  "data": [
    { "id": 8, "date": "2026-04-26", "weight_lbs": 133.2, "notes": "..." },
    { "id": 7, "date": "2026-04-24", "weight_lbs": 133.6, "notes": null }
  ]
}
```

---

## Daily Targets Reference

These are enforced in the frontend only (not the API). Included here for reference when building analysis features.

| Metric | Target | Unit |
|---|---|---|
| Calories (net) | 1,200 | cal |
| Protein | 80 | g |
| Net Carbs | 25 | g |
| Fat | 80 | g |
| Fibre | 30 | g |

**Net calories note:** the 1,200 target is the net goal after subtracting exercise calories. A day with 1,493 food calories and 293 exercise calories has a net of 1,200 — on target.

---

## Error Reference

| HTTP Status | Meaning |
|---|---|
| 200 | Success (GET, DELETE) |
| 201 | Created successfully (POST) |
| 400 | Bad request — validation failed (see `details`), or the body is not valid JSON |
| 401 | Missing, expired, or revoked access token; or wrong login credentials |
| 403 | Invalid invite code, wrong password on account deletion, or a browser origin not on the CORS allow-list |
| 409 | Email already registered |
| 404 | Resource not found |
| 413 | Request body too large (limit 100 KB) |
| 429 | Too many attempts on the public auth endpoints, or too many barcode lookups |
| 502 | The product database could not be reached |
| 500 | Internal server error — check PM2 logs |

All 4xx and 5xx responses include `{ "success": false, "error": "..." }`.

---

## Future Endpoints (Planned)

These endpoints do not exist yet but are planned as part of future feature development. The database schema already supports them.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/summary/weekly` | 7-day rolling averages |
| GET | `/api/summary/export?start=&end=` | CSV export for dietitian |
