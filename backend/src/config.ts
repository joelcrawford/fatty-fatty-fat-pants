import crypto from "crypto";

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

export interface Config {
  env: "production" | "development" | "test";
  /** HS256 signing key for access tokens. */
  jwtSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  passwordResetTtlMinutes: number;
  /** Cost of NEW password hashes. Stored hashes carry their own parameters. */
  scrypt: ScryptParams;
  /** Browser origins allowed by CORS. Native apps send no Origin and are unaffected. */
  corsOrigins: string[];
  /** Per-IP limit on the unauthenticated auth endpoints. */
  authRateLimit: { windowMinutes: number; max: number } | null;
  /** Hops of reverse proxy to trust for the client IP (1 behind Nginx). */
  trustProxy: number;
  /** Link put in reset emails; "{token}" is replaced. Web URL or app deep link. */
  passwordResetUrlTemplate: string;
  mail: { resendApiKey: string | null; from: string };
  /** Per-USER limit on barcode lookups, which can each cause an upstream request. */
  barcodeRateLimit: { windowMinutes: number; max: number } | null;
  /** How long a barcode lookup is trusted. Misses expire fast: products get added. */
  barcodeCache: { foundDays: number; notFoundDays: number };
  /** Open Food Facts asks every client to identify itself. */
  offUserAgent: string;
}

/**
 * Read configuration from the environment once, at startup.
 *
 * Fails fast in production when a secret is missing, rather than starting with
 * a guessable default.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = env.NODE_ENV === "production" ? "production" : env.NODE_ENV === "test" ? "test" : "development";

  let jwtSecret = env.JWT_SECRET ?? "";
  if (mode === "production" && jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 characters in production (try: openssl rand -hex 32)");
  }
  if (!jwtSecret) {
    // Development convenience: a random key per process. Access tokens stop
    // working on restart; refresh tokens live in the database and still work.
    jwtSecret = crypto.randomBytes(32).toString("hex");
  }

  return {
    env: mode,
    jwtSecret,
    accessTokenTtlSeconds: 15 * 60,
    refreshTokenTtlDays: 60,
    passwordResetTtlMinutes: 30,
    // OWASP's scrypt recommendation with a 32 MB memory cost, which a small
    // droplet can afford several of at once.
    scrypt: { N: 2 ** 15, r: 8, p: 3 },
    corsOrigins: ["http://localhost:5173", "http://localhost:3000", env.FRONTEND_URL].filter(Boolean) as string[],
    authRateLimit: { windowMinutes: 15, max: 20 },
    trustProxy: Number(env.TRUST_PROXY ?? 0) || 0,
    passwordResetUrlTemplate:
      env.PASSWORD_RESET_URL ?? `${env.FRONTEND_URL ?? "http://localhost:5173"}/reset-password?token={token}`,
    mail: {
      resendApiKey: env.RESEND_API_KEY || null,
      from: env.MAIL_FROM ?? "Nutrition Tracker <no-reply@localhost>",
    },
    barcodeRateLimit: { windowMinutes: 10, max: 60 },
    barcodeCache: { foundDays: 30, notFoundDays: 1 },
    offUserAgent: env.OFF_USER_AGENT ?? "NutritionTracker/1.0 (https://github.com/joelcrawford/fatty-fatty-fat-pants)",
  };
}
