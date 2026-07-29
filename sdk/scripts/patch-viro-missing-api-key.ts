// Idempotent patcher for AndroidManifest.xml:
// Inserts ARCore Api key into Android Manifest if it is missing.
/* eslint-disable no-console */

import files from "node:fs";
import path from "node:path";
import * as loadEnvVars from "dotenv";

const missingManifestEntry = () =>
  `<meta-data android:name="com.google.android.ar.API_KEY" android:value="${getGeospatialARCoreApiKey()}"/>`;

(function main() {
  loadEnvVars.config({ override: true });
  const filePath = path.join(path.resolve(process.cwd()), "android", "app", "src", "main", "AndroidManifest.xml");

  const src = files.readFileSync(filePath, "utf8");
  let fixedSrc: string = patchArcoreApiKey(src);

  if (src !== fixedSrc) {
    files.writeFileSync(filePath, fixedSrc, "utf8");
    console.info(`Patch Viro | Patched ${filePath}`);
  } else {
    console.info(`Patch Viro | No changes needed for ${filePath}`);
  }
})();

function patchArcoreApiKey(src: string) {
  if (src.includes("com.google.android.ar.API_KEY")) return src;

  const insertAt = src.indexOf("<activity");
  if (insertAt === -1) return src;

  return src.slice(0, insertAt) + missingManifestEntry() + "\n    " + src.slice(insertAt);
}

// must be copy-pasted because this file cannot use imports :(
export function getGeospatialARCoreApiKey() {
  // Note: This loadEnvVars variable does not use the EXPO prefix, as it is only used at build time by custom scripts, never used at runtime.
  return validateEnvVar(process.env["GEOSPATIAL_ARCORE_KEY"], "Google Geospatial ARCore API Key");
}

function validateEnvVar(value: string | undefined, name: string): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required environment variable: '${name}'. Add it to your .env file. Check company Bitwarden or use your own.`,
    );
  }

  return value;
}
