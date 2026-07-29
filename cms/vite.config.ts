import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/ui",
  plugins: [react()],
  build: {
    outDir: "../../dist/ui",
    emptyOutDir: true,
    // MapLibre alone is about 800 kB. For a tool used by a handful of editors that is not worth splitting the bundle.
    chunkSizeWarningLimit: 1_500,
  },
  // The trailing slash matters: a bare "/api" would also forward the request for the source file /api.ts.
  server: { proxy: { "/api/": "http://localhost:8080" } },
});
