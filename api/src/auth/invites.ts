import crypto from "crypto";
import { Db } from "../db";
import { nowSeconds } from "./tokens";

// Unambiguous when read aloud or typed on a phone: no 0/O, 1/I/L.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** e.g. "K7QM-2XRD-9HTW". 12 symbols of 31 is about 59 bits: not guessable. */
export function newInviteCode(): string {
  const chars = Array.from(crypto.randomBytes(12), (b) => ALPHABET[b % ALPHABET.length]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)].map((g) => g.join("")).join("-");
}

export function createInvite(db: Db, opts: { note?: string; expiresInDays?: number } = {}): string {
  const code = newInviteCode();
  db.prepare("INSERT INTO invite_codes (code, note, expires_at) VALUES (?, ?, ?)").run(
    code,
    opts.note ?? null,
    opts.expiresInDays ? nowSeconds() + opts.expiresInDays * 86_400 : null
  );
  return code;
}
