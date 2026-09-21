import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { Db } from "./db";
import { createFoodRouter } from "./routes/food";
import { createExerciseRouter } from "./routes/exercise";
import { createSummaryRouter } from "./routes/summary";

/**
 * Build the Express app around a database connection.
 *
 * Kept separate from index.ts (which opens the real database and listens on a
 * port) so tests can mount the app on an in-memory database without binding a
 * socket.
 */
export function createApp(db: Db): express.Express {
  const app = express();

  // ── Middleware ─────────────────────────────────────────────────────────────

  app.use(helmet());
  if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));
  app.use(express.json());

  // CORS — update FRONTEND_URL in production to your actual domain
  const allowedOrigins = [
    "http://localhost:5173", // Vite dev server
    "http://localhost:3000", // CRA dev server
    process.env.FRONTEND_URL, // Production frontend URL
  ].filter(Boolean) as string[];

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));

  // ── Routes ─────────────────────────────────────────────────────────────────

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/food", createFoodRouter(db));
  app.use("/api/exercise", createExerciseRouter(db));
  app.use("/api/summary", createSummaryRouter(db));

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: "Route not found" });
  });

  // Global error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (process.env.NODE_ENV !== "test") console.error(err.stack);
    res.status(500).json({ success: false, error: "Internal server error" });
  });

  return app;
}
