import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { Db } from "./db";
import { Config, loadConfig } from "./config";
import { Mailer, createMailer } from "./auth/mailer";
import { requireAuth } from "./auth/middleware";
import { createAuthRouter } from "./routes/auth";
import { createFoodRouter } from "./routes/food";
import { createExerciseRouter } from "./routes/exercise";
import { createSummaryRouter } from "./routes/summary";
import { createCatalogRouter } from "./routes/catalog";

/**
 * Build the Express app around a database connection.
 *
 * Kept separate from index.ts (which opens the real database and listens on a
 * port) so tests can mount the app on an in-memory database without binding a
 * socket.
 */
export interface AppDeps {
  config?: Config;
  mailer?: Mailer;
}

export function createApp(db: Db, deps: AppDeps = {}): express.Express {
  const config = deps.config ?? loadConfig();
  const mailer = deps.mailer ?? createMailer(config.mail);

  const app = express();

  // Behind Nginx the socket address is the proxy; this makes req.ip (which the
  // rate limiter keys on) the real client.
  if (config.trustProxy > 0) app.set("trust proxy", config.trustProxy);

  // ── Middleware ─────────────────────────────────────────────────────────────

  app.use(helmet());
  if (config.env !== "test") app.use(morgan("dev"));
  app.use(express.json());

  // CORS governs browsers only. Native apps send no Origin header.
  const allowedOrigins = config.corsOrigins;

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(Object.assign(new Error(`Origin not allowed: ${origin}`), { status: 403, expose: true }));
      }
    },
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));

  // ── Routes ─────────────────────────────────────────────────────────────────

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Public: /health above and the auth routes (which guard their own
  // account-management endpoints). Everything mounted after this line
  // requires a valid access token.
  app.use("/api/auth", createAuthRouter(db, config, mailer));
  app.use("/api", requireAuth(db, config.jwtSecret));

  app.use("/api/food", createFoodRouter(db));
  app.use("/api/exercise", createExerciseRouter(db));
  app.use("/api/summary", createSummaryRouter(db));
  app.use("/api", createCatalogRouter(db)); // /api/foods, /api/exercises, /api/meal-plans

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: "Route not found" });
  });

  // Global error handler. Errors raised by middleware before a route runs
  // (malformed JSON, body too large, blocked origin) carry a 4xx status and
  // are the client's fault; report them as such instead of a blanket 500.
  app.use((err: Error & { status?: number; type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500;

    if (status === 500) {
      if (config.env !== "test") console.error(err.stack);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }

    const error =
      err.type === "entity.parse.failed" ? "Request body is not valid JSON" :
      err.type === "entity.too.large" ? "Request body is too large" :
      status === 403 ? "Origin not allowed" :
      "Bad request";
    res.status(status).json({ success: false, error });
  });

  return app;
}
