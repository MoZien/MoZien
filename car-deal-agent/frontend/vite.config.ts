import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The FastAPI app serves the built files and the API on one origin; in development
// Vite forwards /api to it (cardeal-web on port 8000).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": "http://localhost:8000", "/health": "http://localhost:8000" } },
  build: { outDir: "dist", assetsDir: "assets", sourcemap: false, chunkSizeWarningLimit: 900 },
});
