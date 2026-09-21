import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { seedCatalog } from "./seed";

export type Db = Database.Database;

// The migrations folder sits next to this file in src/ (ts-node-dev, ts-jest)
// and is copied next to the compiled output by `npm run build`, so __dirname
// works in every mode.
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

export const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "nutrition.db");

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** Every NNNN_name.sql file in the migrations folder, in order. */
export function loadMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({
      version: Number(f.slice(0, 4)),
      name: f.replace(/\.sql$/, ""),
      sql: fs.readFileSync(path.join(dir, f), "utf8"),
    }));
}

/**
 * Apply every migration that the ledger says has not run yet.
 *
 * Each migration runs in its own transaction together with its ledger row, so
 * a failure leaves the database exactly as it was. Foreign key enforcement is
 * switched off while a migration runs (SQLite's documented procedure for
 * rebuilding tables; the pragma is a no-op inside a transaction, so it is set
 * outside), and foreign_key_check must come back clean before commit.
 *
 * Returns the versions applied by this call.
 */
export function migrate(db: Db, migrations: Migration[] = loadMigrations()): number[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map((r) => r.version)
  );
  const pending = migrations.filter((m) => !applied.has(m.version));
  const ran: number[] = [];

  for (const m of pending) {
    db.pragma("foreign_keys = OFF");
    try {
      db.transaction(() => {
        db.exec(m.sql);
        const violations = db.pragma("foreign_key_check") as unknown[];
        if (violations.length > 0) {
          throw new Error(`Migration ${m.name} left ${violations.length} foreign key violation(s)`);
        }
        db.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)").run(m.version, m.name);
      })();
    } finally {
      db.pragma("foreign_keys = ON");
    }
    ran.push(m.version);
  }

  return ran;
}

/**
 * Open a database, bring its schema up to date, and sync the built-in catalog.
 *
 * Pass ":memory:" for a throwaway database (tests). Nothing in this module
 * opens a connection at import time, so importing it has no side effects.
 */
export function openDatabase(filename: string = DEFAULT_DB_PATH): Db {
  const inMemory = filename === ":memory:";

  if (!inMemory) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }

  const db = new Database(filename);

  // WAL is a property of an on-disk file; an in-memory database ignores it.
  if (!inMemory) db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  migrate(db);
  seedCatalog(db);

  return db;
}
