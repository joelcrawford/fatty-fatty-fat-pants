-- =============================================================================
-- Katarina's Nutrition Tracker — Database Schema
-- Database: SQLite (production) / PostgreSQL-compatible (future migration)
-- =============================================================================

-- This file is the single source of truth for the schema. It is executed by
-- src/db/index.ts on every server start, so every statement must be idempotent.
-- WAL mode and foreign_keys are set by the connection code, not here.

-- -----------------------------------------------------------------------------
-- USERS
-- Single user for v1. Schema is multi-user ready for future expansion.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL DEFAULT 'Katarina',
    email       TEXT    UNIQUE,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Seed default user
INSERT OR IGNORE INTO users (id, name, email) VALUES (1, 'Katarina', NULL);

-- -----------------------------------------------------------------------------
-- FOOD LOGS
-- One row per food item logged per meal per day.
-- Net carbs = carbs - fiber (calculated at query time, not stored)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS food_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL DEFAULT 1,
    date        TEXT    NOT NULL,           -- Format: YYYY-MM-DD
    meal        TEXT    NOT NULL            -- Enum: Breakfast | Lunch | Dinner | Snacks
                CHECK (meal IN ('Breakfast', 'Lunch', 'Dinner', 'Snacks')),
    food_name   TEXT    NOT NULL,
    amount      TEXT    NOT NULL,           -- Human-readable e.g. "100 g", "1 egg"
    cal         REAL    NOT NULL DEFAULT 0,
    protein     REAL    NOT NULL DEFAULT 0, -- grams
    carbs       REAL    NOT NULL DEFAULT 0, -- grams (total, not net)
    fat         REAL    NOT NULL DEFAULT 0, -- grams
    fiber       REAL    NOT NULL DEFAULT 0, -- grams (used to calculate net carbs)
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_food_logs_user_date ON food_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_food_logs_date ON food_logs(date);

-- -----------------------------------------------------------------------------
-- EXERCISE LOGS
-- One row per exercise session per day.
-- Calorie burn is estimated from activity type × duration × body weight factor.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercise_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL DEFAULT 1,
    date        TEXT    NOT NULL,           -- Format: YYYY-MM-DD
    name        TEXT    NOT NULL,           -- Activity name e.g. "Lagree (Megaformer)"
    duration    TEXT    NOT NULL,           -- Human-readable e.g. "45 min"
    cal         REAL    NOT NULL DEFAULT 0, -- Estimated calories burned
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exercise_logs_user_date ON exercise_logs(user_id, date);

-- -----------------------------------------------------------------------------
-- WEIGHT LOGS
-- One entry per day. Used for progress tracking toward 10 lb goal.
-- Starting weight: 134 lbs. Target: 124 lbs. Rate: ~1 lb/week.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weight_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL DEFAULT 1,
    date        TEXT    NOT NULL,           -- Format: YYYY-MM-DD
    weight_lbs  REAL    NOT NULL,
    notes       TEXT,                       -- Optional: mood, symptoms, context
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, date)                  -- One entry per user per day
);

CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date ON weight_logs(user_id, date);

-- -----------------------------------------------------------------------------
-- CUSTOM FOODS (Future feature — not yet active in v1 UI)
-- Allows user to add foods not in the built-in library.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS custom_foods (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL DEFAULT 1,
    name            TEXT    NOT NULL,
    cal_per_serving REAL    NOT NULL DEFAULT 0,
    protein         REAL    NOT NULL DEFAULT 0,
    carbs           REAL    NOT NULL DEFAULT 0,
    fat             REAL    NOT NULL DEFAULT 0,
    fiber           REAL    NOT NULL DEFAULT 0,
    serving_size    REAL    NOT NULL DEFAULT 100,
    serving_unit    TEXT    NOT NULL DEFAULT 'g',
    category        TEXT,
    barcode         TEXT,                   -- For future barcode scanner feature
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_custom_foods_user ON custom_foods(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_foods_barcode ON custom_foods(barcode);

-- -----------------------------------------------------------------------------
-- USEFUL VIEWS
-- Pre-built queries for common summary operations
-- -----------------------------------------------------------------------------

-- Daily nutrition summary with net carbs calculated
CREATE VIEW IF NOT EXISTS v_daily_food_summary AS
SELECT
    user_id,
    date,
    COUNT(*)                            AS entry_count,
    ROUND(SUM(cal), 1)                  AS total_cal,
    ROUND(SUM(protein), 1)              AS total_protein,
    ROUND(SUM(carbs), 1)                AS total_carbs,
    ROUND(SUM(fat), 1)                  AS total_fat,
    ROUND(SUM(fiber), 1)                AS total_fiber,
    ROUND(MAX(0, SUM(carbs) - SUM(fiber)), 1) AS net_carbs
FROM food_logs
GROUP BY user_id, date;

-- Daily exercise summary
CREATE VIEW IF NOT EXISTS v_daily_exercise_summary AS
SELECT
    user_id,
    date,
    COUNT(*)            AS session_count,
    ROUND(SUM(cal), 1)  AS total_exercise_cal
FROM exercise_logs
GROUP BY user_id, date;

-- Full day summary joining food and exercise
CREATE VIEW IF NOT EXISTS v_full_day_summary AS
SELECT
    f.user_id,
    f.date,
    f.total_cal,
    f.total_protein,
    f.total_carbs,
    f.total_fat,
    f.total_fiber,
    f.net_carbs,
    COALESCE(e.total_exercise_cal, 0)           AS exercise_cal,
    ROUND(f.total_cal - COALESCE(e.total_exercise_cal, 0), 1) AS net_cal
FROM v_daily_food_summary f
LEFT JOIN v_daily_exercise_summary e
    ON f.user_id = e.user_id AND f.date = e.date;

-- =============================================================================
-- DAILY TARGETS (for reference — enforced in application layer, not DB)
-- Calories:  1,200 net (exercise calories added back)
-- Protein:   80g   (1.3g/kg body weight for muscle preservation)
-- Net Carbs: 25g   (Galveston anti-inflammatory protocol)
-- Fat:       80g   (Galveston fat-fuelled approach)
-- Fibre:     30g   (gut health + hormone metabolism)
-- =============================================================================
