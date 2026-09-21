-- Migration 0002: multi-user accounts (#3).
--
--  * users gain a required unique email and a password hash
--  * user_id loses its DEFAULT 1 everywhere, so a query that forgets to set an
--    owner fails loudly instead of quietly filing the row under user 1
--  * the seeded single user is removed
--  * new tables: invite_codes, refresh_tokens, password_reset_tokens
--
-- SQLite cannot drop a column default or add a NOT NULL column in place, so
-- each affected table is rebuilt (create new, copy, drop old, rename), which
-- is the procedure SQLite documents. The migration runner disables foreign
-- key enforcement for the duration and runs foreign_key_check before commit.

DROP VIEW IF EXISTS v_full_day_summary;
DROP VIEW IF EXISTS v_daily_exercise_summary;
DROP VIEW IF EXISTS v_daily_food_summary;

-- ── users ────────────────────────────────────────────────────────────────────

-- The seeded placeholder user is dropped if it never logged anything. If it
-- DID (someone used the single-user app), its data is kept under an account
-- with an unusable password and a placeholder address, so nothing is lost.
DELETE FROM users
 WHERE email IS NULL
   AND id NOT IN (SELECT user_id FROM food_logs
                  UNION SELECT user_id FROM exercise_logs
                  UNION SELECT user_id FROM weight_logs
                  UNION SELECT user_id FROM custom_foods);

CREATE TABLE users_new (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    email               TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash       TEXT    NOT NULL,
    -- Embedded in every access token. Bumping it (password reset) makes every
    -- token already issued for this user invalid at once, exactly, with no
    -- clock comparison involved.
    token_version       INTEGER NOT NULL DEFAULT 0,
    name                TEXT    NOT NULL DEFAULT '',
    created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users_new (id, email, password_hash, name, created_at)
SELECT id, COALESCE(email, 'legacy-user-' || id || '@invalid'), '!', name, created_at
  FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- ── food_logs ────────────────────────────────────────────────────────────────

CREATE TABLE food_logs_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    date        TEXT    NOT NULL,           -- Format: YYYY-MM-DD
    meal        TEXT    NOT NULL
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
INSERT INTO food_logs_new SELECT id, user_id, date, meal, food_name, amount, cal, protein, carbs, fat, fiber, created_at FROM food_logs;
DROP TABLE food_logs;
ALTER TABLE food_logs_new RENAME TO food_logs;
CREATE INDEX idx_food_logs_user_date ON food_logs(user_id, date);

-- ── exercise_logs ────────────────────────────────────────────────────────────

CREATE TABLE exercise_logs_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    date        TEXT    NOT NULL,           -- Format: YYYY-MM-DD
    name        TEXT    NOT NULL,
    duration    TEXT    NOT NULL,           -- Human-readable e.g. "45 min"
    cal         REAL    NOT NULL DEFAULT 0, -- Estimated calories burned
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO exercise_logs_new SELECT id, user_id, date, name, duration, cal, created_at FROM exercise_logs;
DROP TABLE exercise_logs;
ALTER TABLE exercise_logs_new RENAME TO exercise_logs;
CREATE INDEX idx_exercise_logs_user_date ON exercise_logs(user_id, date);

-- ── weight_logs ──────────────────────────────────────────────────────────────

CREATE TABLE weight_logs_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    date        TEXT    NOT NULL,           -- Format: YYYY-MM-DD
    weight_lbs  REAL    NOT NULL,
    notes       TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, date)                  -- One entry per user per day
);
INSERT INTO weight_logs_new SELECT id, user_id, date, weight_lbs, notes, created_at FROM weight_logs;
DROP TABLE weight_logs;
ALTER TABLE weight_logs_new RENAME TO weight_logs;

-- ── custom_foods ─────────────────────────────────────────────────────────────

CREATE TABLE custom_foods_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    name            TEXT    NOT NULL,
    cal_per_serving REAL    NOT NULL DEFAULT 0,
    protein         REAL    NOT NULL DEFAULT 0,
    carbs           REAL    NOT NULL DEFAULT 0,
    fat             REAL    NOT NULL DEFAULT 0,
    fiber           REAL    NOT NULL DEFAULT 0,
    serving_size    REAL    NOT NULL DEFAULT 100,
    serving_unit    TEXT    NOT NULL DEFAULT 'g',
    category        TEXT,
    barcode         TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO custom_foods_new SELECT id, user_id, name, cal_per_serving, protein, carbs, fat, fiber, serving_size, serving_unit, category, barcode, created_at FROM custom_foods;
DROP TABLE custom_foods;
ALTER TABLE custom_foods_new RENAME TO custom_foods;
CREATE INDEX idx_custom_foods_user ON custom_foods(user_id);
CREATE INDEX idx_custom_foods_barcode ON custom_foods(barcode);

-- ── auth tables ──────────────────────────────────────────────────────────────

-- Registration is by invitation. Codes are minted with `npm run invite`.
CREATE TABLE invite_codes (
    code        TEXT    PRIMARY KEY,
    note        TEXT,                       -- who it was made for
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at  INTEGER,                    -- unix seconds; NULL = never
    used_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    used_at     TEXT
);

-- Long-lived, revocable, rotated on every use. Only a SHA-256 of the token is
-- stored, so a copy of the database cannot be used to log in as anyone.
CREATE TABLE refresh_tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT    NOT NULL UNIQUE,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at  INTEGER NOT NULL,
    revoked_at  INTEGER,
    -- Why it was revoked. Only 'rotated' matters to the code: a rotated token
    -- turning up again means it was copied. A token retired by an ordinary
    -- logout turning up again is just a stale client, and must not be treated
    -- as theft.
    revoked_reason TEXT CHECK (revoked_reason IN ('rotated', 'logout', 'logout_all', 'password_reset', 'reuse_detected'))
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Single use, short lived, stored hashed for the same reason.
CREATE TABLE password_reset_tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT    NOT NULL UNIQUE,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at  INTEGER NOT NULL,
    used_at     INTEGER
);
CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);

-- ── views (unchanged, recreated because their tables were rebuilt) ───────────

CREATE VIEW v_daily_food_summary AS
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

CREATE VIEW v_daily_exercise_summary AS
SELECT
    user_id,
    date,
    COUNT(*)            AS session_count,
    ROUND(SUM(cal), 1)  AS total_exercise_cal
FROM exercise_logs
GROUP BY user_id, date;

CREATE VIEW v_full_day_summary AS
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
