import { serveStatic } from "@hono/node-server/serve-static";
import { zValidator } from "@hono/zod-validator";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { basicAuth } from "hono/basic-auth";
import { bodyLimit } from "hono/body-limit";
import { DatabaseError } from "pg";
import type { ZodType } from "zod";
import type { ApiErrorBody, ImportResult } from "../shared/api.ts";
import { todayInSoest } from "../shared/annotationState.ts";
import { annotationInputSchema, isAnnotationId } from "./annotations/annotationInputSchema.ts";
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotations,
  listPoisWithActiveAnnotations,
  placeExists,
  updateAnnotation,
} from "./annotations/annotationRepository.ts";
import type { Database } from "./database/connection.ts";
import { listPlaces } from "./places/placeRepository.ts";
import type { PriorModel } from "./profile/interest.ts";
import { rankPois } from "./profile/ranking.ts";
import { rankingRequestSchema } from "./profile/rankingRequestSchema.ts";
import {
  countWalkReportsReceivedToday,
  deleteWalkReportsOf,
  insertWalkReport,
} from "./walkReports/walkReportRepository.ts";
import { isInstallId, walkReportSchema } from "./walkReports/walkReportSchema.ts";

export type AppDependencies = {
  db: Database;
  editorPassword: string;
  importPlaces: () => Promise<ImportResult>;
  now: () => Date;
  priorModel: () => PriorModel;
  uiDistPath: string;
};

const errorBody = (...errors: string[]): ApiErrorBody => ({ errors });
const notFoundBody = errorBody("Nicht gefunden");
const placeNotFoundBody = errorBody("Ort nicht gefunden");

// index.html names the hashed files of one build. A browser that reuses an old copy after a deploy asks for files
// that no longer exist, so it has to ask again every time. The hashed files themselves never change.
const revalidateEntryPage: MiddlewareHandler = async (c, next) => {
  await next();
  if (c.res.headers.get("Content-Type")?.startsWith("text/html")) c.header("Cache-Control", "no-cache");
};

const validJsonBody = <Schema extends ZodType>(schema: Schema) =>
  zValidator("json", schema, (result, c) => {
    if (!result.success) return c.json(errorBody(...result.error.issues.map((issue) => issue.message)), 400);
  });

const annotationBody = validJsonBody(annotationInputSchema);

function postgresErrorCodeOf(error: unknown): string | null {
  const databaseError = error instanceof Error ? error.cause : null;
  return databaseError instanceof DatabaseError ? (databaseError.code ?? null) : null;
}

// The public routes carry the user's interests. Hono's default error handler prints the whole error, and drizzle's
// query errors hold the query's parameters in their message, so a failing query would write the request into the log.
// The marker names the route and Postgres' error code only.
async function answeringFailuresWithoutLoggingContent(
  c: Context,
  route: string,
  respond: () => Promise<Response>,
): Promise<Response> {
  try {
    return await respond();
  } catch (error) {
    console.error(`[${route}] request failed`, { postgresErrorCode: postgresErrorCodeOf(error) });
    return c.json(errorBody("Internal server error"), 500);
  }
}

// Public POST routes are open to anyone, so their bodies are capped well above what the app sends (a profile of
// 500 subtypes is about 30 KiB).
const maxPublicRequestBodyBytes = 64 * 1024;
const limitedPublicBody = bodyLimit({
  maxSize: maxPublicRequestBodyBytes,
  onError: (c) => c.json(errorBody("Request body too large"), 413),
});

// The walk-report route is anonymous. The cap bounds how fast a scripted flood can fill the database, far above the
// few dozen walks a day of real use. The count and the insert are separate statements, so concurrent requests can
// overshoot the cap by a few, which does not matter for a bound.
const maxWalkReportsPerDay = 1_000;

export function createApp({ db, editorPassword, importPlaces, now, priorModel, uiDistPath }: AppDependencies): Hono {
  const app = new Hono();

  app.get("/healthz", (c) => c.text("ok"));

  // The demo APKs installed before the ranked feed ask for this. Remove it once the new APK is rolled out.
  app.get("/api/annotated-pois", async (c) => {
    const pois = await listPoisWithActiveAnnotations(db, todayInSoest(now()));
    return c.json(pois.filter(({ annotations }) => annotations.length > 0));
  });

  app.post("/api/pois/ranked", limitedPublicBody, validJsonBody(rankingRequestSchema), (c) =>
    answeringFailuresWithoutLoggingContent(c, "POST /api/pois/ranked", async () => {
      const pois = await listPoisWithActiveAnnotations(db, todayInSoest(now()));
      return c.json(rankPois(pois, c.req.valid("json"), priorModel()));
    }),
  );

  app.post("/api/walk-reports", limitedPublicBody, validJsonBody(walkReportSchema), (c) =>
    answeringFailuresWithoutLoggingContent(c, "POST /api/walk-reports", async () => {
      if ((await countWalkReportsReceivedToday(db)) >= maxWalkReportsPerDay) {
        console.warn("[POST /api/walk-reports] daily cap reached, report refused");
        return c.json(errorBody("Too many requests"), 429);
      }
      await insertWalkReport(db, c.req.valid("json"));
      return c.body(null, 201);
    }),
  );

  // Erasure answers 204 whether or not reports existed: afterwards none remain, which is all the caller asked for.
  // That includes an id that is no UUID, because no report can carry one.
  app.delete("/api/walk-reports/:installId", (c) =>
    answeringFailuresWithoutLoggingContent(c, "DELETE /api/walk-reports/:installId", async () => {
      const installId = c.req.param("installId");
      if (isInstallId(installId)) await deleteWalkReportsOf(db, installId);
      return c.body(null, 204);
    }),
  );

  // Registration order is the access rule: every route registered below requires the editor password.
  app.use(basicAuth({ username: "redaktion", password: editorPassword, realm: "ARiadne CMS" }));

  app.get("/api/places", async (c) => c.json(await listPlaces(db)));

  app.post("/api/places/import", async (c) => {
    try {
      return c.json(await importPlaces());
    } catch (error) {
      console.error("[import] import requested by an editor failed", error);
      return c.json(errorBody("Aktualisierung fehlgeschlagen – bestehende Orte bleiben erhalten."), 502);
    }
  });

  app.get("/api/annotations", async (c) => c.json(await listAnnotations(db)));

  app.post("/api/annotations", annotationBody, async (c) => {
    const input = c.req.valid("json");
    if (!(await placeExists(db, input.placeId))) return c.json(placeNotFoundBody, 400);
    return c.json(await createAnnotation(db, input), 201);
  });

  app.put("/api/annotations/:id", annotationBody, async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    if (!isAnnotationId(id)) return c.json(notFoundBody, 404);
    if (!(await placeExists(db, input.placeId))) return c.json(placeNotFoundBody, 400);
    const updated = await updateAnnotation(db, id, input);
    return updated === null ? c.json(notFoundBody, 404) : c.json(updated);
  });

  app.delete("/api/annotations/:id", async (c) => {
    const id = c.req.param("id");
    const wasDeleted = isAnnotationId(id) && (await deleteAnnotation(db, id));
    return wasDeleted ? c.body(null, 204) : c.json(notFoundBody, 404);
  });

  // The editor UI is a single-page app, so a path without a file behind it is one of its client-side routes. API
  // paths are excluded: a mistyped one must not answer with HTML.
  app.all("/api/*", (c) => c.json(notFoundBody, 404));
  app.use("/*", revalidateEntryPage);
  app.get("/*", serveStatic({ root: uiDistPath }));
  app.get("/*", serveStatic({ root: uiDistPath, path: "index.html" }));

  return app;
}
