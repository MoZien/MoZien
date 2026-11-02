import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// The FastAPI app serves the built files and the API on one origin; in development
// Vite forwards /api to it (cardeal-web on port 8000).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The app knows its own version: when the server runs a newer one, it reloads itself.
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { proxy: { "/api": "http://localhost:8000", "/health": "http://localhost:8000" } },
  build: { outDir: "dist", assetsDir: "assets", sourcemap: false, chunkSizeWarningLimit: 900 },
});
