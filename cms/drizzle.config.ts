import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/database/schema.ts",
  out: "./drizzle",
});
