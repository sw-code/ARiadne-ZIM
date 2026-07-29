import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { connectDatabase, migrateDatabase } from "./database/connection.ts";
import { fetchSoestPlaces } from "./places/overpass.ts";
import { createPlaceImporter } from "./places/placeImport.ts";

const config = readConfig(process.env);
const { db, close: closeDatabase } = connectDatabase(config);
await migrateDatabase(db);

const importPlaces = createPlaceImporter(
  db,
  () => fetchSoestPlaces(config.overpassUrl),
  () => new Date(),
);
const app = createApp({
  db,
  editorPassword: config.editorPassword,
  importPlaces,
  now: () => new Date(),
  uiDistPath: config.uiDistPath,
});

const server = serve({ fetch: app.fetch, port: config.portNumber }, ({ port }) =>
  console.info(`[server] listening on port ${port}`),
);

// As PID 1 in the container Node has no default signal handling. Without this, every deploy would wait out
// Kubernetes' whole grace period before the old pod is killed.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    console.info(`[server] ${signal} received, shutting down`);
    server.close(() => closeDatabase().then(() => process.exit(0)));
  });
}

// Not awaited: Overpass takes up to 100 s, and the server is useful with the places it already has.
importPlaces().then(
  (result) => console.info("[import] startup import finished", result),
  (error) => console.error("[import] startup import failed, keeping the stored places", error),
);
