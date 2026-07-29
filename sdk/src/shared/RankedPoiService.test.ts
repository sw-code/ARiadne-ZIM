import {
  fetchRankedPointsOfInterest,
  mapRankedPoiToPointOfInterest,
  RankedPoiResponse,
} from "@/src/shared/RankedPoiService";
import { en } from "@/src/i18n/en";
import { de } from "@/src/i18n/de";
import { geoCoordsFromLatLongDegrees } from "@/src/shared/GeoLocation";
import type { InterestProfile } from "@/src/shared/UserProfileProvider";

// The HTTP-500 test would otherwise print the logged error.
jest.mock("@/src/shared/Logger", () => ({
  log: { error: jest.fn() },
}));

const cmsBaseUrl = "https://cms.example";

const poiWithTwoAnnotations: RankedPoiResponse = {
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
  score: 0.8,
};

const unnamedPoi: RankedPoiResponse = {
  id: "node-7",
  category: "amenity",
  subtype: "fast_food",
  name: null,
  latitude: 51.57,
  longitude: 8.11,
  annotations: [{ title: "Menü-Angebot", text: "Burger und Pommes", validFrom: null, validTo: null }],
  score: 0.3,
};

const profiledPoiWithoutAnnotations: RankedPoiResponse = {
  id: "node-9",
  category: "amenity",
  subtype: "cafe",
  name: "Café Mitte",
  latitude: 51.571,
  longitude: 8.108,
  annotations: [],
  score: 0.6,
};

describe("mapRankedPoiToPointOfInterest", () => {
  test("maps id, name, coordinates, score and joined annotations", () => {
    const poi = mapRankedPoiToPointOfInterest(poiWithTwoAnnotations, en.poiSubtypes);

    expect(poi.id).toBe("node-42");
    expect(poi.category).toBe("shop");
    expect(poi.subtype).toBe("chemist");
    expect(poi.score).toBe(0.8);
    expect(poi.isAnnotated).toBe(true);
    expect(poi.location.coordinate).toMatchObject({ latitudeDegrees: 51.5717, longitudeDegrees: 8.1054 });
    expect(poi.info?.name).toBe("Drogerie Müller");
    expect(poi.info?.description).toBe(
      "3 für 2 auf Sonnencreme\nNur diese Woche\n\nLate-Night-Shopping\nBis 22 Uhr geöffnet",
    );
  });

  test("shows only the first two annotations, in served order, when a place has more", () => {
    const poi = mapRankedPoiToPointOfInterest(
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
    expect(mapRankedPoiToPointOfInterest(unnamedPoi, en.poiSubtypes).info?.name).toBe("Fast Food");
    expect(mapRankedPoiToPointOfInterest(unnamedPoi, de.poiSubtypes).info?.name).toBe("Imbiss");
  });

  test("falls back to the heading-cased subtype for an unnamed place of an uncommon subtype", () => {
    const poi = mapRankedPoiToPointOfInterest({ ...unnamedPoi, subtype: "hearing_aids" }, de.poiSubtypes);
    expect(poi.info?.name).toBe("Hearing Aids");
  });

  test("a place without annotations shows its name and no description", () => {
    const poi = mapRankedPoiToPointOfInterest(profiledPoiWithoutAnnotations, en.poiSubtypes);

    expect(poi.isAnnotated).toBe(false);
    expect(poi.info?.name).toBe("Café Mitte");
    expect(poi.info?.description).toBe("");
  });
});

describe("fetchRankedPointsOfInterest", () => {
  const originalFetch = global.fetch;
  const start = geoCoordsFromLatLongDegrees(51.57149, 8.10549);
  const destination = geoCoordsFromLatLongDegrees(51.58251, 8.11351);
  const profile: InterestProfile = { cafe: { shown: 4, engaged: 2, choice: "more" } };

  function answerWith(pois: RankedPoiResponse[]) {
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify(pois)));
    global.fetch = fetchMock;
    return fetchMock;
  }

  function sentBody(fetchMock: jest.Mock): Record<string, unknown> {
    return JSON.parse(fetchMock.mock.calls[0][1].body);
  }

  beforeEach(() => {
    process.env["EXPO_PUBLIC_CMS_BASE_URL"] = cmsBaseUrl;
  });

  afterEach(() => {
    delete process.env["EXPO_PUBLIC_CMS_BASE_URL"];
    global.fetch = originalFetch;
  });

  test("posts JSON to the ranked feed and maps every place in served order", async () => {
    const fetchMock = answerWith([poiWithTwoAnnotations, profiledPoiWithoutAnnotations]);

    const pois = await fetchRankedPointsOfInterest(start, destination, profile, en.poiSubtypes);

    expect(fetchMock).toHaveBeenCalledWith(
      `${cmsBaseUrl}/api/pois/ranked`,
      expect.objectContaining({ method: "POST", headers: { "Content-Type": "application/json" } }),
    );
    expect(pois.map((poi) => poi.id)).toEqual(["node-42", "node-9"]);
  });

  test("sends start and destination rounded to three decimals together with the profile", async () => {
    const fetchMock = answerWith([]);

    await fetchRankedPointsOfInterest(start, destination, profile, en.poiSubtypes);

    expect(sentBody(fetchMock)).toEqual({
      start: { latitude: 51.571, longitude: 8.105 },
      destination: { latitude: 51.583, longitude: 8.114 },
      profile,
    });
  });

  test("omits the profile while personalisation is off", async () => {
    const fetchMock = answerWith([]);

    await fetchRankedPointsOfInterest(start, destination, null, en.poiSubtypes);

    expect(sentBody(fetchMock)).not.toHaveProperty("profile");
  });

  test("rejects when the CMS answers with an error status", async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response("boom", { status: 500 }));

    await expect(fetchRankedPointsOfInterest(start, destination, null, en.poiSubtypes)).rejects.toThrow("HTTP 500");
  });
});
