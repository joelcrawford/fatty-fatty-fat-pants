import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import foodRoutes from "./routes/food";
import exerciseRoutes from "./routes/exercise";
import summaryRoutes from "./routes/summary";

// Initialize DB (runs migration on first start)
import "./db";

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());

// CORS — update FRONTEND_URL in production to your actual domain
const ALLOWED_ORIGINS = [
  "http://localhost:5173",   // Vite dev server
  "http://localhost:3000",   // CRA dev server
  process.env.FRONTEND_URL, // Production frontend URL
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ── Routes ───────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/food", foodRoutes);
app.use("/api/exercise", exerciseRoutes);
app.use("/api/summary", summaryRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🥗 Nutrition API running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
});

export default app;
