import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "nutrition.db");

// schema.sql sits next to this file in src/ (ts-node-dev) and is copied next
// to the compiled output by `npm run build`, so __dirname works in both.
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// schema.sql is the single source of truth. Every statement in it is
// idempotent (IF NOT EXISTS / INSERT OR IGNORE), so running it on each start
// is safe.
db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));

console.log(`✅ Database ready at ${DB_PATH}`);

export default db;
