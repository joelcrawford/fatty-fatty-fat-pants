-- Migration 0005: per-user profile and daily targets (#15).
--
-- One row per user, created when they finish onboarding. Until it exists the
-- user is "not onboarded" and clients route them into the onboarding flow.
--
-- The chosen preset AND the resulting numbers are both stored. If a preset's
-- formula changes in a later release, nobody's targets move silently: they
-- move only when the user asks for a recalculation.
CREATE TABLE user_profiles (
    user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- How the user wants to SEE weights and heights. Storage is always metric.
    units              TEXT    NOT NULL DEFAULT 'imperial' CHECK (units IN ('imperial', 'metric')),

    -- About the person. Only weight is always required (exercise calories need
    -- it); the rest is required only by presets that compute targets.
    sex                TEXT    CHECK (sex IN ('female', 'male')),   -- NULL = prefer not to say
    birth_year         INTEGER,                                     -- a year, not an age, so it never goes stale
    height_cm          REAL,
    weight_kg          REAL    NOT NULL,                            -- as entered at onboarding; see weight_logs for history
    activity           TEXT    NOT NULL DEFAULT 'sedentary' CHECK (activity IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
    goal               TEXT    NOT NULL DEFAULT 'maintain'  CHECK (goal IN ('lose', 'maintain', 'gain')),
    weekly_rate_kg     REAL    NOT NULL DEFAULT 0.45,

    -- The plan and its numbers.
    preset_key         TEXT    NOT NULL CHECK (preset_key IN ('galveston_style', 'balanced', 'high_protein', 'low_carb', 'custom')),
    calories           INTEGER NOT NULL,
    protein_g          REAL    NOT NULL,
    carbs_g            REAL    NOT NULL,
    carbs_mode         TEXT    NOT NULL CHECK (carbs_mode IN ('net', 'total')),
    fat_g              REAL    NOT NULL,
    fiber_g            REAL    NOT NULL,
    -- 1 when the user edited the numbers the preset computed. A recalculation
    -- never overwrites edited numbers without being asked to.
    targets_customised INTEGER NOT NULL DEFAULT 0 CHECK (targets_customised IN (0, 1)),

    onboarded_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);
