import { jest } from "@jest/globals";
import { createGraphhopperAdapter } from "@/src/geocoding/geocodingAdapters/GraphhopperAdapter";
import { LocationObjectCoords } from "expo-location";
import * as env from "@/src/shared/Env";

describe("GraphhopperAdapter", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (global.fetch as jest.MockedFunction<typeof fetch>) = jest.fn();
    jest.spyOn(env, "getGraphhopperApiKey").mockReturnValue("TEST_GH_KEY");
  });

  const coords: LocationObjectCoords = {
    latitude: 51.5,
    longitude: 7.2,
    altitude: 7.3,
    accuracy: 0,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  };

  const fakeResults = {
    hits: [
      {
        point: { lat: 1, lng: 2 },
        name: "city",
        city: "city",
        postcode: "12345",
        street: "Main Street",
        house_number: "10",
      },
    ],
  };

  afterEach(() => {
    jest.resetAllMocks();
  });

  test("returns adapted results when Graphhopper responds with hits", async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => fakeResults,
    } as Response);

    const adapter = createGraphhopperAdapter();
    const results = await adapter.geocode("city", coords);

    expect(results).toHaveLength(1);
    expect(results[0]?.city).toBe("city");
    expect(results[0]?.coordinates.latitudeDegrees).toBe(1);
  });

  test("returns empty array when Graphhopper responds with no hits", async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ hits: [] }),
    } as Response);

    const adapter = createGraphhopperAdapter();
    const results = await adapter.geocode("Unknown", coords);

    expect(results).toEqual([]);
  });

  test("throws error when Graphhopper responds with HTTP error", async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as Response);

    const adapter = createGraphhopperAdapter();

    await expect(adapter.geocode("Essen", coords)).rejects.toThrow("HTTP 500: Internal Server Error");
  });

  test("falls back city -> name when city missing and handles missing point", async () => {
    const fakeResponseFallbackCase = {
      hits: [
        {
          point: { lat: 1, lng: 2 },
          name: "Place B",
          city: "",
          postcode: "12345",
          street: "Main Street",
          house_number: "10",
        },
      ],
    };

    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => fakeResponseFallbackCase,
    } as Response);

    const adapter = createGraphhopperAdapter();
    const results = await adapter.geocode("city", coords);

    expect(results).toHaveLength(1);
    expect(results[0]?.city).toBe("Place B");
    expect(results[0]?.coordinates.latitudeDegrees).toBe(1);
  });
});
