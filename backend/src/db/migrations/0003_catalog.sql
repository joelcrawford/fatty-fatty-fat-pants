-- Migration 0003: the catalog moves from the web app's source code into the
-- database (#5).
--
-- foods holds BOTH kinds of food in one table so search, logging and barcode
-- lookup treat them alike:
--   user_id IS NULL      built-in, visible to everyone, written only by the seeder
--   user_id = <a user>   that user's custom food, visible only to them
--
-- The food LOG stays denormalised (food_logs copies the name and macros), so
-- editing or deleting a food never rewrites anyone's history.

CREATE TABLE foods (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    -- Stable identity for built-in rows, so the seeder can correct a value in
    -- place. NULL for custom foods. Ids are NOT used for this: a custom food
    -- may already hold the next id by the time a new built-in food is added.
    seed_key        TEXT    UNIQUE,
    name            TEXT    NOT NULL,
    category        TEXT    NOT NULL DEFAULT 'Other',
    unit            TEXT    NOT NULL DEFAULT 'g',     -- "g", "ml", "piece", "tbsp" ...
    default_serving REAL    NOT NULL DEFAULT 100 CHECK (default_serving > 0),
    -- Macros are per default_serving of unit.
    cal             REAL    NOT NULL DEFAULT 0,
    protein         REAL    NOT NULL DEFAULT 0,
    carbs           REAL    NOT NULL DEFAULT 0,       -- total, not net
    fat             REAL    NOT NULL DEFAULT 0,
    fiber           REAL    NOT NULL DEFAULT 0,
    barcode         TEXT,                             -- for the scanner (#10)
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    -- A row is built-in exactly when it has a seed_key and no owner.
    CHECK ((user_id IS NULL) = (seed_key IS NOT NULL))
);
CREATE INDEX idx_foods_user ON foods(user_id);
CREATE INDEX idx_foods_barcode ON foods(barcode) WHERE barcode IS NOT NULL;

-- custom_foods was created by the original schema but never had an API, so it
-- is expected to be empty. Anything in it is carried over rather than dropped.
INSERT INTO foods (user_id, name, category, unit, default_serving, cal, protein, carbs, fat, fiber, barcode, created_at)
SELECT user_id, name, COALESCE(category, 'Other'), serving_unit, serving_size, cal_per_serving, protein, carbs, fat, fiber, barcode, created_at
  FROM custom_foods;
DROP TABLE custom_foods;

-- Exercises store a MET value, not calories per minute, because calories
-- depend on who is exercising:  cal/min = MET x 3.5 x body weight (kg) / 200
CREATE TABLE exercises (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    seed_key    TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL,
    met         REAL    NOT NULL CHECK (met > 0),
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE meal_plans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    seed_key    TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL,
    meal_type   TEXT    NOT NULL CHECK (meal_type IN ('Breakfast', 'Lunch', 'Dinner', 'Snacks')),
    badge       TEXT    NOT NULL DEFAULT '',
    description TEXT    NOT NULL DEFAULT '',
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE meal_plan_items (
    meal_plan_id   INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
    position       INTEGER NOT NULL,
    food_id        INTEGER NOT NULL REFERENCES foods(id),
    serving_amount REAL    NOT NULL CHECK (serving_amount > 0),
    PRIMARY KEY (meal_plan_id, position)
);
