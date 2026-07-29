import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Vitest lets VITEST_MAX_WORKERS from the environment override `fileParallelism: false`, so it is pinned here as well.
process.env["VITEST_MAX_WORKERS"] = "1";

export default defineConfig({
  plugins: [react()],
  test: {
    // The integration tests share one database, so test files must not run concurrently.
    fileParallelism: false,
    setupFiles: ["./src/ui/testSetup.ts"],
  },
});
