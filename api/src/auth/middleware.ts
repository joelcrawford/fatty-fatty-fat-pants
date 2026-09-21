import { NextFunction, Request, RequestHandler, Response } from "express";
import { Db } from "../db";
import { verifyAccessToken } from "./tokens";

declare module "express-serve-static-core" {
  interface Request {
    /** Set by requireAuth. Read it through currentUserId(). */
    userId?: number;
  }
}

/**
 * Require a valid access token, and set req.userId.
 *
 * Beyond the signature and expiry, the user must still exist and the token
 * must carry their current token_version. That costs one primary-key lookup
 * and means deleting an account or resetting a password takes effect
 * immediately, not when the 15-minute token happens to expire.
 */
export function requireAuth(db: Db, jwtSecret: string): RequestHandler {
  const findUser = db.prepare("SELECT token_version FROM users WHERE id = ?");

  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const claims = token ? verifyAccessToken(token, jwtSecret) : null;

    const user = claims ? (findUser.get(claims.userId) as { token_version: number } | undefined) : undefined;

    if (!claims || !user || claims.tokenVersion !== user.token_version) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    req.userId = claims.userId;
    next();
  };
}

/**
 * The authenticated user's id. Throws if requireAuth did not run, so a route
 * mounted in the wrong place fails as a 500 instead of touching someone's data.
 */
export function currentUserId(req: Request): number {
  if (req.userId === undefined) throw new Error("currentUserId() used on a route without requireAuth");
  return req.userId;
}
