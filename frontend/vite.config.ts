import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxies /api calls to the backend during local development
      // so you don't need to worry about CORS when running locally.
      // Under docker compose the backend is another container, not
      // localhost, so compose sets API_PROXY_TARGET=http://backend:3001.
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
