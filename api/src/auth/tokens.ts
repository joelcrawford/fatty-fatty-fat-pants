import crypto from "crypto";
import jwt from "jsonwebtoken";

// Two kinds of token:
//
//  access   A short-lived JWT. Stateless: verified by signature alone plus one
//           cheap user lookup. Sent as "Authorization: Bearer <jwt>".
//  opaque   256 random bits, for refresh and password-reset tokens. The client
//           holds the token; the database holds only its SHA-256, so a stolen
//           database backup cannot be replayed. (A fast hash is correct here:
//           the input is already high-entropy, unlike a password.)

export interface AccessClaims {
  userId: number;
  /** users.token_version at the time of issue. */
  tokenVersion: number;
}

export function signAccessToken(userId: number, tokenVersion: number, secret: string, ttlSeconds: number): string {
  return jwt.sign({ ver: tokenVersion }, secret, { algorithm: "HS256", subject: String(userId), expiresIn: ttlSeconds });
}

/** Null for anything that is not a currently valid token signed by us. */
export function verifyAccessToken(token: string, secret: string): AccessClaims | null {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (typeof payload === "string") return null;
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(payload.ver)) return null;
    return { userId, tokenVersion: payload.ver };
  } catch {
    return null;
  }
}

export function newOpaqueToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);
