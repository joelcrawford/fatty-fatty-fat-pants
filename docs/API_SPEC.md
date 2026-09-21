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

## Validation

Every request is validated before it reaches the database (`backend/src/validation.ts`). A request that fails is rejected with **400** and stores nothing. All problems are reported at once. `error` is a single sentence suitable for showing to a person; `details[].path` names the field so a form can highlight it (for batch requests the path includes the index, e.g. `1.meal`).

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
| 403 | Request came from a browser origin that is not on the CORS allow-list |
| 404 | Resource not found |
| 413 | Request body too large (limit 100 KB) |
| 500 | Internal server error — check PM2 logs |

All 4xx and 5xx responses include `{ "success": false, "error": "..." }`.

---

## Future Endpoints (Planned)

These endpoints do not exist yet but are planned as part of future feature development. The database schema already supports them.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/custom-foods` | List user's custom food entries |
| POST | `/api/custom-foods` | Add a custom food |
| DELETE | `/api/custom-foods/:id` | Remove a custom food |
| GET | `/api/foods/barcode/:barcode` | Look up food by barcode (Open Food Facts proxy) |
| GET | `/api/summary/weekly` | 7-day rolling averages |
| GET | `/api/summary/export?start=&end=` | CSV export for dietitian |
| POST | `/api/auth/login` | JWT authentication (for multi-user) |
| POST | `/api/auth/register` | User registration |
