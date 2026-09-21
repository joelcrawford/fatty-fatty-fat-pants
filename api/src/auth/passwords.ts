import crypto from "crypto";
import { ScryptParams } from "../config";

// Passwords are hashed with scrypt from Node's standard library: memory-hard,
// no native add-on to compile on Alpine, nothing to keep patched.
//
// Stored format:  scrypt$N$r$p$<salt b64>$<hash b64>
// The parameters travel with the hash, so the cost can be raised later and
// old hashes still verify.

const KEY_LENGTH = 64;
const MAX_MEMORY = 256 * 1024 * 1024;

function scrypt(password: string, salt: Buffer, { N, r, p }: ScryptParams): Promise<Buffer> {
  // The callback form runs on the libuv thread pool, so a login does not
  // block every other request for the ~100ms a hash takes.
  return new Promise((resolve, reject) => {
    crypto.scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { N, r, p, maxmem: MAX_MEMORY }, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

export async function hashPassword(password: string, params: ScryptParams): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, params);
  return ["scrypt", params.N, params.r, params.p, salt.toString("base64"), key.toString("base64")].join("$");
}

/** False for a wrong password AND for anything that is not a hash we made (e.g. the "!" on a legacy account). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return false;

  const expected = Buffer.from(parts[5], "base64");
  const actual = await scrypt(password, Buffer.from(parts[4], "base64"), { N, r, p });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/**
 * Spend the same time a real verification would. Login calls this when the
 * email is unknown, so response time does not reveal which emails have accounts.
 */
export async function burnPasswordTime(params: ScryptParams): Promise<void> {
  await scrypt("not a real password", Buffer.alloc(16), params);
}
