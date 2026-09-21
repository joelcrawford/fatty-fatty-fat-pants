// Mint invite codes.
//
// From the repo root:
//   npm run invite                               one code, never expires
//   npm run invite -- --note "for Sam" --days 14  labelled, expires in 14 days
//   npm run invite -- --count 5
//
// In production:  docker exec <api container> npm run invite -w @nutrition/api -- --note "for Sam"

import { openDatabase, DEFAULT_DB_PATH } from "../db";
import { createInvite } from "../auth/invites";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const count = Math.max(1, Math.min(100, Number(arg("count") ?? 1) || 1));
const days = Number(arg("days")) || undefined;
const note = arg("note");

const db = openDatabase(DEFAULT_DB_PATH); // honours DB_PATH
for (let i = 0; i < count; i++) {
  console.log(createInvite(db, { note, expiresInDays: days }));
}
db.close();
