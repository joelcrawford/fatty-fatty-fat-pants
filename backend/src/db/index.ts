import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "nutrition.db");

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL DEFAULT 'Katarina',
    email       TEXT    UNIQUE,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- Insert default user if not exists
  INSERT OR IGNORE INTO users (id, name, email) VALUES (1, 'Katarina', NULL);

  CREATE TABLE IF NOT EXISTS food_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL DEFAULT 1,
    date        TEXT    NOT NULL,           -- YYYY-MM-DD
    meal        TEXT    NOT NULL,           -- Breakfast | Lunch | Dinner | Snacks
    food_name   TEXT    NOT NULL,
    amount      TEXT    NOT NULL,           -- "100 g", "1 egg" etc.
    cal         REAL    NOT NULL DEFAULT 0,
    protein     REAL    NOT NULL DEFAULT 0,
    carbs       REAL    NOT NULL DEFAULT 0,
    fat         REAL    NOT NULL DEFAULT 0,
    fiber       REAL    NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS exercise_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL DEFAULT 1,
    date        TEXT    NOT NULL,           -- YYYY-MM-DD
    name        TEXT    NOT NULL,
    duration    TEXT    NOT NULL,           -- "30 min"
    cal         REAL    NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS weight_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL DEFAULT 1,
    date        TEXT    NOT NULL,
    weight_lbs  REAL    NOT NULL,
    notes       TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Indexes for fast date-based queries
  CREATE INDEX IF NOT EXISTS idx_food_logs_date    ON food_logs(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_exercise_logs_date ON exercise_logs(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_weight_logs_date  ON weight_logs(user_id, date);
`);

console.log(`✅ Database ready at ${DB_PATH}`);

export default db;
