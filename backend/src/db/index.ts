import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export type Db = Database.Database;

// schema.sql sits next to this file in src/ (ts-node-dev, ts-jest) and is
// copied next to the compiled output by `npm run build`, so __dirname works
// in every mode.
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

export const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "nutrition.db");

/**
 * Open a database and bring its schema up to date.
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

  // schema.sql is the single source of truth. Every statement in it is
  // idempotent (IF NOT EXISTS / INSERT OR IGNORE), so running it on each open
  // is safe.
  db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));

  return db;
}
