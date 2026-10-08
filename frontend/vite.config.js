// Builds directly into backend/public, which Express serves statically.
// No server.js or docker-compose changes needed: the dashboard stays at
// the same URL and hits the same /api routes on the same origin.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, "../backend/public"),
    emptyOutDir: true,
  },
});
