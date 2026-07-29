export type Config = {
  databaseUrl: string;
  caCertificatePath: string | null;
  editorPassword: string;
  portNumber: number;
  overpassUrl: string;
  uiDistPath: string;
};

export function readConfig(env: Record<string, string | undefined>): Config {
  const databaseUrl = env["DATABASE_URL"];
  const editorPassword = env["EDITOR_PASSWORD"];
  // An empty value, such as an empty Secret key, counts as unset throughout.
  if (!databaseUrl || !editorPassword) {
    const missingNames = [...(databaseUrl ? [] : ["DATABASE_URL"]), ...(editorPassword ? [] : ["EDITOR_PASSWORD"])];
    throw new Error(`Missing environment variables: ${missingNames.join(", ")}`);
  }
  return {
    databaseUrl,
    caCertificatePath: env["DATABASE_CA_PATH"] || null,
    editorPassword,
    portNumber: Number(env["PORT"] || "8080"),
    overpassUrl: env["OVERPASS_URL"] || "https://overpass-api.de/api/interpreter",
    uiDistPath: env["UI_DIST_PATH"] || "dist/ui",
  };
}
