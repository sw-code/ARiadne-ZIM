import {
  AnnotatedPoiResponse,
  fetchAnnotatedPointsOfInterest,
  mapAnnotatedPoiToPointOfInterest,
} from "@/src/shared/AnnotatedPoiService";
import { en } from "@/src/i18n/en";
import { de } from "@/src/i18n/de";

// The HTTP-500 test would otherwise print the logged error.
jest.mock("@/src/shared/Logger", () => ({
  log: { error: jest.fn() },
}));

const cmsBaseUrl = "https://cms.example";

const poiWithTwoAnnotations: AnnotatedPoiResponse = {
  id: "node-42",
  category: "shop",
  subtype: "chemist",
  name: "Drogerie Müller",
  latitude: 51.5717,
  longitude: 8.1054,
  annotations: [
    { title: "3 für 2 auf Sonnencreme", text: "Nur diese Woche", validFrom: null, validTo: "2026-10-31" },
    { title: "Late-Night-Shopping", text: "Bis 22 Uhr geöffnet", validFrom: "2026-10-01", validTo: null },
  ],
};

const unnamedPoi: AnnotatedPoiResponse = {
  id: "node-7",
  category: "amenity",
  subtype: "fast_food",
  name: null,
  latitude: 51.57,
  longitude: 8.11,
  annotations: [{ title: "Menü-Angebot", text: "Burger und Pommes", validFrom: null, validTo: null }],
};

describe("mapAnnotatedPoiToPointOfInterest", () => {
  test("maps id, name, coordinates and joined annotations", () => {
    const poi = mapAnnotatedPoiToPointOfInterest(poiWithTwoAnnotations, en.poiSubtypes);

    expect(poi.id).toBe("node-42");
    expect(poi.category).toBe("shop");
    expect(poi.subtype).toBe("chemist");
    expect(poi.location.coordinate).toMatchObject({ latitudeDegrees: 51.5717, longitudeDegrees: 8.1054 });
    expect(poi.info?.name).toBe("Drogerie Müller");
    expect(poi.info?.description).toBe(
      "3 für 2 auf Sonnencreme\nNur diese Woche\n\nLate-Night-Shopping\nBis 22 Uhr geöffnet",
    );
  });

  test("shows only the first two annotations, in served order, when a place has more", () => {
    const poi = mapAnnotatedPoiToPointOfInterest(
      {
        ...poiWithTwoAnnotations,
        annotations: [
          { title: "Erste", text: "Eins", validFrom: null, validTo: null },
          { title: "Zweite", text: "Zwei", validFrom: null, validTo: null },
          { title: "Dritte", text: "Drei", validFrom: null, validTo: null },
        ],
      },
      en.poiSubtypes,
    );

    expect(poi.info?.description).toBe("Erste\nEins\n\nZweite\nZwei");
  });

  test("falls back to the subtype in the language of the user for an unnamed place", () => {
    expect(mapAnnotatedPoiToPointOfInterest(unnamedPoi, en.poiSubtypes).info?.name).toBe("Fast Food");
    expect(mapAnnotatedPoiToPointOfInterest(unnamedPoi, de.poiSubtypes).info?.name).toBe("Imbiss");
  });

  test("falls back to the heading-cased subtype for an unnamed place of an uncommon subtype", () => {
    const poi = mapAnnotatedPoiToPointOfInterest({ ...unnamedPoi, subtype: "hearing_aids" }, de.poiSubtypes);
    expect(poi.info?.name).toBe("Hearing Aids");
  });
});

describe("fetchAnnotatedPointsOfInterest", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env["EXPO_PUBLIC_CMS_BASE_URL"] = cmsBaseUrl;
  });

  afterEach(() => {
    delete process.env["EXPO_PUBLIC_CMS_BASE_URL"];
    global.fetch = originalFetch;
  });

  test("requests the CMS feed and maps every place", async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify([poiWithTwoAnnotations])));
    global.fetch = fetchMock;

    const pois = await fetchAnnotatedPointsOfInterest(en.poiSubtypes);

    expect(fetchMock).toHaveBeenCalledWith(`${cmsBaseUrl}/api/annotated-pois`);
    expect(pois.map((poi) => poi.id)).toEqual(["node-42"]);
  });

  test("rejects when the CMS answers with an error status", async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response("boom", { status: 500 }));

    await expect(fetchAnnotatedPointsOfInterest(en.poiSubtypes)).rejects.toThrow("HTTP 500");
  });
});
