import { Router, Request, Response, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { Db } from "../db";
import { Config } from "../config";
import { Mailer } from "../auth/mailer";
import { hashPassword, verifyPassword, burnPasswordTime } from "../auth/passwords";
import { signAccessToken, newOpaqueToken, hashOpaqueToken, nowSeconds } from "../auth/tokens";
import { requireAuth, currentUserId } from "../auth/middleware";
import { isOnboarded } from "./profile";
import {
  validate, registerSchema, loginSchema, refreshSchema,
  forgotPasswordSchema, resetPasswordSchema, deleteAccountSchema,
} from "../validation";

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  token_version: number;
  created_at: string;
}

const publicUser = (u: UserRow) => ({ id: u.id, email: u.email, name: u.name, created_at: u.created_at });

export function createAuthRouter(db: Db, config: Config, mailer: Mailer): Router {
  const router = Router();
  const authed = requireAuth(db, config.jwtSecret);

  // Unauthenticated endpoints are where guessing happens, so they share a
  // per-IP budget. Authenticated ones are not limited here.
  const limited: RequestHandler = config.authRateLimit
    ? rateLimit({
        windowMs: config.authRateLimit.windowMinutes * 60_000,
        limit: config.authRateLimit.max,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (_req, res) =>
          res.status(429).json({ success: false, error: "Too many attempts. Please wait a few minutes and try again." }),
      })
    : (_req, _res, next) => next();

  const findByEmail = db.prepare("SELECT * FROM users WHERE email = ?");
  const findById = db.prepare("SELECT * FROM users WHERE id = ?");

  /** A fresh access + refresh pair for a user. */
  function issueSession(userId: number) {
    const { token_version } = findById.get(userId) as UserRow;
    const refreshToken = newOpaqueToken();
    db.prepare("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)").run(
      userId,
      hashOpaqueToken(refreshToken),
      nowSeconds() + config.refreshTokenTtlDays * 86_400
    );
    return {
      access_token: signAccessToken(userId, token_version, config.jwtSecret, config.accessTokenTtlSeconds),
      refresh_token: refreshToken,
      token_type: "Bearer" as const,
      expires_in: config.accessTokenTtlSeconds,
    };
  }

  type RevokeReason = "rotated" | "logout" | "logout_all" | "password_reset" | "reuse_detected";

  const revokeAllSessions = (userId: number, reason: RevokeReason) =>
    db.prepare("UPDATE refresh_tokens SET revoked_at = ?, revoked_reason = ? WHERE user_id = ? AND revoked_at IS NULL")
      .run(nowSeconds(), reason, userId);

  // POST /api/auth/register — by invitation only
  router.post("/register", limited, validate({ body: registerSchema }), async (req: Request, res: Response) => {
    try {
      const { email, password, name, invite_code } = req.body;

      const invite = db.prepare("SELECT * FROM invite_codes WHERE code = ?").get(invite_code) as
        | { used_at: string | null; expires_at: number | null }
        | undefined;
      if (!invite || invite.used_at || (invite.expires_at !== null && invite.expires_at < nowSeconds())) {
        return res.status(403).json({ success: false, error: "That invite code is not valid" });
      }

      if (findByEmail.get(email)) {
        // Only reachable with a valid invite code, so this does not let a
        // stranger probe for accounts. The invite is not consumed.
        return res.status(409).json({ success: false, error: "An account with that email already exists" });
      }

      const passwordHash = await hashPassword(password, config.scrypt);

      // Create the user and spend the invite together. The UPDATE re-checks
      // used_at so two simultaneous registrations cannot share one code.
      const userId = db.transaction(() => {
        const id = Number(
          db.prepare("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)").run(email, passwordHash, name).lastInsertRowid
        );
        const spent = db
          .prepare("UPDATE invite_codes SET used_by = ?, used_at = datetime('now') WHERE code = ? AND used_at IS NULL")
          .run(id, invite_code);
        if (spent.changes !== 1) throw new Error("invite already used");
        return id;
      })();

      const user = findById.get(userId) as UserRow;
      res.status(201).json({ success: true, data: { user: publicUser(user), ...issueSession(userId) } });
    } catch (err) {
      if (err instanceof Error && err.message === "invite already used") {
        return res.status(403).json({ success: false, error: "That invite code is not valid" });
      }
      res.status(500).json({ success: false, error: "Failed to create account" });
    }
  });

  // POST /api/auth/login
  router.post("/login", limited, validate({ body: loginSchema }), async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      const user = findByEmail.get(email) as UserRow | undefined;

      // Same work and same answer whether the email is unknown or the
      // password is wrong, so neither timing nor wording leaks who has an account.
      const ok = user ? await verifyPassword(password, user.password_hash) : (await burnPasswordTime(config.scrypt), false);
      if (!user || !ok) {
        return res.status(401).json({ success: false, error: "Email or password is incorrect" });
      }

      res.json({ success: true, data: { user: publicUser(user), ...issueSession(user.id) } });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to log in" });
    }
  });

  // POST /api/auth/refresh — trade a refresh token for a new pair. The old
  // token is retired (rotation). A ROTATED token turning up again means it was
  // copied: someone else used it first, or is using it now. Every session for
  // that user is ended so the thief is logged out along with the owner. A
  // token retired by logout turning up again is only a stale client; it is
  // refused and nothing else happens.
  router.post("/refresh", limited, validate({ body: refreshSchema }), (req: Request, res: Response) => {
    try {
      const row = db.prepare("SELECT * FROM refresh_tokens WHERE token_hash = ?").get(hashOpaqueToken(req.body.refresh_token)) as
        | { id: number; user_id: number; expires_at: number; revoked_at: number | null; revoked_reason: string | null }
        | undefined;

      if (row?.revoked_reason === "rotated") {
        db.transaction(() => {
          db.prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?").run(row.user_id);
          revokeAllSessions(row.user_id, "reuse_detected");
        })();
      }

      if (!row || row.revoked_at || row.expires_at < nowSeconds()) {
        return res.status(401).json({ success: false, error: "Session expired. Please log in again." });
      }

      const session = db.transaction(() => {
        db.prepare("UPDATE refresh_tokens SET revoked_at = ?, revoked_reason = 'rotated' WHERE id = ?").run(nowSeconds(), row.id);
        return issueSession(row.user_id);
      })();

      res.json({ success: true, data: session });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to refresh session" });
    }
  });

  // POST /api/auth/logout — end this device's session. Always succeeds, so a
  // client can call it without caring whether the token was still good.
  router.post("/logout", validate({ body: refreshSchema }), (req: Request, res: Response) => {
    try {
      db.prepare("UPDATE refresh_tokens SET revoked_at = ?, revoked_reason = 'logout' WHERE token_hash = ? AND revoked_at IS NULL").run(
        nowSeconds(),
        hashOpaqueToken(req.body.refresh_token)
      );
      res.json({ success: true, data: { logged_out: true } });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to log out" });
    }
  });

  // POST /api/auth/logout-all — end every session, e.g. after losing a phone.
  // Takes effect at once everywhere: refresh tokens are revoked and the
  // version bump kills access tokens already issued, this device's included.
  router.post("/logout-all", authed, (req: Request, res: Response) => {
    try {
      const userId = currentUserId(req);
      const { changes } = db.transaction(() => {
        db.prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?").run(userId);
        return revokeAllSessions(userId, "logout_all");
      })();
      res.json({ success: true, data: { sessions_ended: changes } });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to log out" });
    }
  });

  // GET /api/auth/me
  router.get("/me", authed, (req: Request, res: Response) => {
    try {
      const userId = currentUserId(req);
      res.json({ success: true, data: { ...publicUser(findById.get(userId) as UserRow), onboarded: isOnboarded(db, userId) } });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to load account" });
    }
  });

  // DELETE /api/auth/me — permanently delete the account and everything in it.
  // Both app stores require this to be possible from inside the app. The
  // password is asked for again so an unlocked phone is not enough.
  router.delete("/me", authed, validate({ body: deleteAccountSchema }), async (req: Request, res: Response) => {
    try {
      const user = findById.get(currentUserId(req)) as UserRow;
      if (!(await verifyPassword(req.body.password, user.password_hash))) {
        return res.status(403).json({ success: false, error: "Password is incorrect" });
      }
      // Logs, weights, custom foods, sessions and reset tokens all go with the
      // user through ON DELETE CASCADE.
      db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to delete account" });
    }
  });

  // POST /api/auth/forgot-password — always the same answer, whether or not
  // the email has an account, so this cannot be used to find out who does.
  router.post("/forgot-password", limited, validate({ body: forgotPasswordSchema }), async (req: Request, res: Response) => {
    const answer = { success: true, data: { message: "If that email has an account, a reset link is on its way." } };
    try {
      const user = findByEmail.get(req.body.email) as UserRow | undefined;
      if (user) {
        const token = newOpaqueToken();
        db.transaction(() => {
          // Only the newest link works.
          db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL").run(nowSeconds(), user.id);
          db.prepare("INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)").run(
            user.id,
            hashOpaqueToken(token),
            nowSeconds() + config.passwordResetTtlMinutes * 60
          );
        })();

        const link = config.passwordResetUrlTemplate.replace("{token}", encodeURIComponent(token));
        await mailer.send({
          to: user.email,
          subject: "Reset your password",
          text:
            `Someone asked to reset the password for this account.\n\n` +
            `To choose a new password, open this link within ${config.passwordResetTtlMinutes} minutes:\n\n${link}\n\n` +
            `If that was not you, ignore this email and nothing will change.`,
        });
      }
      res.json(answer);
    } catch (err) {
      // A mail outage must not turn into "this email exists" vs "it does not".
      if (config.env !== "test") console.error("forgot-password failed:", err);
      res.json(answer);
    }
  });

  // POST /api/auth/reset-password — single use. Ends every session, because a
  // reset usually means the old password may be in someone else's hands.
  router.post("/reset-password", limited, validate({ body: resetPasswordSchema }), async (req: Request, res: Response) => {
    try {
      const row = db.prepare("SELECT * FROM password_reset_tokens WHERE token_hash = ?").get(hashOpaqueToken(req.body.token)) as
        | { id: number; user_id: number; expires_at: number; used_at: number | null }
        | undefined;

      if (!row || row.used_at || row.expires_at < nowSeconds()) {
        return res.status(400).json({ success: false, error: "That reset link is invalid or has expired. Please request a new one." });
      }

      const passwordHash = await hashPassword(req.body.password, config.scrypt);

      const claimed = db.transaction(() => {
        // Re-check used_at inside the transaction: the hash above took time.
        const spent = db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL").run(nowSeconds(), row.id);
        if (spent.changes !== 1) return false;
        db.prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?").run(passwordHash, row.user_id);
        revokeAllSessions(row.user_id, "password_reset");
        return true;
      })();

      if (!claimed) {
        return res.status(400).json({ success: false, error: "That reset link is invalid or has expired. Please request a new one." });
      }

      res.json({ success: true, data: { message: "Password updated. Please log in with your new password." } });
    } catch (err) {
      res.status(500).json({ success: false, error: "Failed to reset password" });
    }
  });

  return router;
}
