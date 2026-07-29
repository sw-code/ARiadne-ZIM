import { afterEach, expect, test, vi } from "vitest";
import type { AnnotationInput } from "../shared/api.ts";
import { ApiError, deleteAnnotation, fetchAnnotations, saveAnnotation } from "./api.ts";

const fetchStub = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchStub);

afterEach(() => fetchStub.mockReset());

const input: AnnotationInput = {
  placeId: "node-1",
  title: "3 für 2",
  text: "Nur diese Woche",
  validFrom: null,
  validTo: "2026-10-31",
};

test("a failed request throws an ApiError with the messages of the server", async () => {
  fetchStub.mockResolvedValue(Response.json({ errors: ["Titel fehlt", "Text fehlt"] }, { status: 400 }));

  const error = await fetchAnnotations().catch((reason) => reason);

  expect(error).toBeInstanceOf(ApiError);
  expect(error.messages).toEqual(["Titel fehlt", "Text fehlt"]);
});

test("a failed request without an error body still throws an ApiError", async () => {
  fetchStub.mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }));

  await expect(fetchAnnotations()).rejects.toMatchObject({ messages: ["Unerwarteter Fehler"] });
});

test("a new annotation is posted as JSON", async () => {
  fetchStub.mockResolvedValue(Response.json({ ...input, id: "annotation-1" }, { status: 201 }));

  await expect(saveAnnotation(input, null)).resolves.toEqual({ ...input, id: "annotation-1" });

  expect(fetchStub).toHaveBeenCalledWith(
    "/api/annotations",
    expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
  );
});

test("an existing annotation is put to its own address", async () => {
  fetchStub.mockResolvedValue(Response.json({ ...input, id: "annotation-1" }));

  await saveAnnotation(input, "annotation-1");

  expect(fetchStub).toHaveBeenCalledWith("/api/annotations/annotation-1", expect.objectContaining({ method: "PUT" }));
});

test("deleting succeeds on the empty 204 reply", async () => {
  fetchStub.mockResolvedValue(new Response(null, { status: 204 }));

  await expect(deleteAnnotation("annotation-1")).resolves.toBeUndefined();
});
