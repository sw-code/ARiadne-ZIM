import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist"]),
  tseslint.configs.recommended,
  { ...reactHooks.configs.flat.recommended, files: ["src/ui/**/*.{ts,tsx}"] },
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
]);
