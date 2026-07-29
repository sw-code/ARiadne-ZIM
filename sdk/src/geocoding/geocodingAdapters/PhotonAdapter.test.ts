import { createPhotonAdapter } from "@/src/geocoding/geocodingAdapters/PhotonAdapter";
import { Geocoder } from "@/src/geocoding/TargetInterface";
import { GeocodeResult } from "@/src/geocoding/GeocodingTypes";
import { LocationObjectCoords } from "expo-location";
import { jest } from "@jest/globals";

describe("createPhotonAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.MockedFunction<typeof fetch>) = jest.fn();
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

  const fakeResponse = {
    features: [
      {
        geometry: { coordinates: [7.4, 51.5] },
        properties: {
          name: "Essen",
          city: "Essen",
          postcode: "45127",
          street: "Kettwiger Straße",
          housenumber: "10",
        },
      },
    ],
  };
  afterEach(() => {
    jest.resetAllMocks();
  });
  test("returns adapted results when Photon responds with features", async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => fakeResponse,
    } as Response);

    const adapter: Geocoder = createPhotonAdapter();
    const results: GeocodeResult[] = await adapter.geocode("Essen", coords);

    expect(results).toHaveLength(1);
    expect(results[0]?.city).toBe("Essen");
    expect(results[0]?.coordinates.latitudeDegrees).toBe(51.5);
    expect(results[0]?.coordinates.longitudeDegrees).toBe(7.4);
  });

  test("returns empty array when Photon responds with no features", async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ features: [] }),
    } as Response);

    const adapter: Geocoder = createPhotonAdapter();
    const results = await adapter.geocode("Unknown", coords);

    expect(results).toEqual([]);
  });

  test("throws error when Photon responds with HTTP error", async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as Response);

    const adapter: Geocoder = createPhotonAdapter();

    await expect(adapter.geocode("Essen", coords)).rejects.toThrow("HTTP 500: Internal Server Error");
  });

  test("falls back city -> name when city missing and handles missing point", async () => {
    const fakeResponseFallbackCase = {
      features: [
        {
          geometry: { coordinates: [7.4, 51.5] },
          properties: {
            name: "Essen",
            city: "",
            postcode: "45127",
            street: "Kettwiger Straße",
            housenumber: "10",
          },
        },
      ],
    };

    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => fakeResponseFallbackCase,
    } as Response);

    const adapter = createPhotonAdapter();
    const results = await adapter.geocode("Essen", coords);

    expect(results).toHaveLength(1);
    expect(results[0]?.city).toBe("Essen");
    expect(results[0]?.coordinates.latitudeDegrees).toBe(51.5);
  });
});
