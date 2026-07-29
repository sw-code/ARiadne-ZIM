import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { connectDatabase, migrateDatabase } from "./database/connection.ts";
import { fetchSoestPlaces } from "./places/overpass.ts";
import { createPlaceImporter } from "./places/placeImport.ts";
import {
  buildPriorModel,
  hasEnoughReportsForAssociationRules,
  hasEnoughReportsForCollaborativeFiltering,
} from "./learning/priorModel.ts";
import { curatedPriorModel, type PriorModel } from "./profile/interest.ts";
import { deleteWalkReportsOlderThan, listWalkReportsToLearnFrom } from "./walkReports/walkReportRepository.ts";

const config = readConfig(process.env);
const { db, close: closeDatabase } = connectDatabase(config);
await migrateDatabase(db);

const importPlaces = createPlaceImporter(
  db,
  () => fetchSoestPlaces(config.overpassUrl),
  () => new Date(),
);
// Replaced by the daily job once enough walk reports came in to learn from.
let currentPriorModel: PriorModel = curatedPriorModel;

const app = createApp({
  db,
  editorPassword: config.editorPassword,
  importPlaces,
  now: () => new Date(),
  priorModel: () => currentPriorModel,
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

const walkReportRetentionDays = 365;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

async function deleteExpiredWalkReports(): Promise<void> {
  try {
    const deletedReportCount = await deleteWalkReportsOlderThan(db, walkReportRetentionDays);
    console.info("[retention] deleted expired walk reports", { deletedReportCount });
  } catch (error) {
    console.error("[retention] deleting expired walk reports failed", error);
  }
}

// A failed rebuild keeps the previous model, so ranking carries on with what was learned before.
async function rebuildPriorModel(): Promise<void> {
  try {
    const reports = await listWalkReportsToLearnFrom(db);
    currentPriorModel = buildPriorModel(reports);
    console.info("[learning] rebuilt the prior model", {
      reportCount: reports.length,
      collaborativeFilteringActive: hasEnoughReportsForCollaborativeFiltering(reports),
      associationRulesActive: hasEnoughReportsForAssociationRules(reports),
    });
  } catch (error) {
    console.error("[learning] rebuilding the prior model failed, keeping the previous one", error);
  }
}

// Logs counts only: a walk report must never reach the log. Expired reports go first so that the model is not
// learned from them.
async function runDailyJobs(): Promise<void> {
  await deleteExpiredWalkReports();
  await rebuildPriorModel();
}

void runDailyJobs();
setInterval(() => void runDailyJobs(), millisecondsPerDay);
