import { serveStatic } from "@hono/node-server/serve-static";
import { zValidator } from "@hono/zod-validator";
import { Hono, type MiddlewareHandler } from "hono";
import { basicAuth } from "hono/basic-auth";
import type { ApiErrorBody, ImportResult } from "../shared/api.ts";
import { todayInSoest } from "../shared/annotationState.ts";
import { annotationInputSchema, isAnnotationId } from "./annotations/annotationInputSchema.ts";
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotatedPois,
  listAnnotations,
  placeExists,
  updateAnnotation,
} from "./annotations/annotationRepository.ts";
import type { Database } from "./database/connection.ts";
import { listPlaces } from "./places/placeRepository.ts";

export type AppDependencies = {
  db: Database;
  editorPassword: string;
  importPlaces: () => Promise<ImportResult>;
  now: () => Date;
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

const annotationBody = zValidator("json", annotationInputSchema, (result, c) => {
  if (!result.success) return c.json(errorBody(...result.error.issues.map((issue) => issue.message)), 400);
});

export function createApp({ db, editorPassword, importPlaces, now, uiDistPath }: AppDependencies): Hono {
  const app = new Hono();

  app.get("/healthz", (c) => c.text("ok"));
  app.get("/api/annotated-pois", async (c) => c.json(await listAnnotatedPois(db, todayInSoest(now()))));

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
