import { afterEach, expect, test, vi } from "vitest";
import { fetchSoestPlaces, mapOverpassResponseToPlaces, soestPlacesOverpassQuery } from "./overpass.ts";
import type { OverpassResponse } from "./overpass.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const nodeAt = (id: number, tags?: Record<string, string>): OverpassResponse["elements"][number] => ({
  type: "node",
  id,
  lat: 51.5711,
  lon: 8.106,
  ...(tags !== undefined ? { tags } : {}),
});

test("a node becomes a place with its category, subtype and name", () => {
  const response: OverpassResponse = { elements: [nodeAt(42, { shop: "chemist", name: "Rossmann" })] };

  expect(mapOverpassResponseToPlaces(response)).toEqual([
    {
      id: "node-42",
      category: "shop",
      subtype: "chemist",
      name: "Rossmann",
      latitude: 51.5711,
      longitude: 8.106,
      tags: { shop: "chemist", name: "Rossmann" },
    },
  ]);
});

test("the first category key in the app's key order wins", () => {
  const response: OverpassResponse = { elements: [nodeAt(1, { shop: "bakery", amenity: "cafe" })] };

  expect(mapOverpassResponseToPlaces(response)).toEqual([
    expect.objectContaining({ category: "amenity", subtype: "cafe" }),
  ]);
});

test("nodes without tags or without a category key are dropped", () => {
  const response: OverpassResponse = { elements: [nodeAt(1), nodeAt(2, { name: "x" })] };

  expect(mapOverpassResponseToPlaces(response)).toEqual([]);
});

test("an Overpass response with a Stolperstein node imports without it", () => {
  const stolperstein = nodeAt(1, { historic: "memorial", memorial: "stolperstein", name: "Hier wohnte …" });
  const warMemorial = nodeAt(2, { historic: "memorial", memorial: "war_memorial" });

  expect(mapOverpassResponseToPlaces({ elements: [stolperstein, warMemorial] })).toEqual([
    expect.objectContaining({ id: "node-2" }),
  ]);
});

test("a node without a name gets a null name", () => {
  const response: OverpassResponse = { elements: [nodeAt(1, { amenity: "bench" })] };

  expect(mapOverpassResponseToPlaces(response)).toEqual([expect.objectContaining({ name: null })]);
});

test("the query allows the server 90 seconds", () => {
  expect(soestPlacesOverpassQuery).toMatch(/^\[out:json\]\[timeout:90\];/);
});

test("the query selects the municipality by its key and unions every category key", () => {
  expect(soestPlacesOverpassQuery).toContain('"de:amtlicher_gemeindeschluessel"="05974040"');
  for (const categoryKey of ["amenity", "tourism", "shop", "leisure", "historic", "craft", "office", "healthcare"]) {
    expect(soestPlacesOverpassQuery).toContain(`node(area.soest)["${categoryKey}"];`);
  }
});

test("fetching posts the query form-encoded and maps the response", async () => {
  const fetchStub = vi.fn(async () => Response.json({ elements: [nodeAt(7, { amenity: "cafe" })] }));
  vi.stubGlobal("fetch", fetchStub);

  const places = await fetchSoestPlaces("https://overpass.example/api/interpreter");

  expect(places).toEqual([expect.objectContaining({ id: "node-7" })]);
  expect(fetchStub).toHaveBeenCalledWith(
    "https://overpass.example/api/interpreter",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "User-Agent": "ARiadne-CMS/1.0" }),
      body: new URLSearchParams({ data: soestPlacesOverpassQuery }).toString(),
    }),
  );
});

test("a non-2xx reply throws with the status in the message", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("too busy", { status: 429 })),
  );

  await expect(fetchSoestPlaces("https://overpass.example/api/interpreter")).rejects.toThrow(/429/);
});

test("a hung request is aborted after 100 seconds", async () => {
  const timeoutSignal = new AbortController();
  const abortSignalTimeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutSignal.signal);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    ),
  );

  const hungFetch = fetchSoestPlaces("https://overpass.example/api/interpreter");
  timeoutSignal.abort(new DOMException("The operation timed out", "TimeoutError"));

  await expect(hungFetch).rejects.toThrow("timed out");
  expect(abortSignalTimeout).toHaveBeenCalledWith(100_000);
});

test("a 200 reply carrying a remark is a failed run and throws with the remark", async () => {
  const remark = 'runtime error: Query timed out in "query" at line 3 after 91 seconds.';
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ remark, elements: [nodeAt(7, { amenity: "cafe" })] })),
  );

  await expect(fetchSoestPlaces("https://overpass.example/api/interpreter")).rejects.toThrow(remark);
});
