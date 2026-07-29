import { Geocoder } from "@/src/geocoding/TargetInterface";
import { GeocodeResult } from "@/src/geocoding/GeocodingTypes";
import { jest } from "@jest/globals";

import { createGoogleAdapter } from "@/src/geocoding/geocodingAdapters/GoogleAdapter";

jest.mock("@/src/shared/Env", () => ({
  getGoogleApiKey: jest.fn(() => "TEST_API_KEY"),
}));

jest.mock("@/src/shared/Logger", () => ({
  log: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

const coords = { latitude: 51.5, longitude: 7.4 } as any;

describe("createGoogleAdapter", () => {
  beforeEach(() => {
    (global.fetch as jest.MockedFunction<typeof fetch>) = jest.fn();
    jest.clearAllMocks();
  });

  test("returns adapted results when Google responds with suggestions and place details", async () => {
    (fetch as jest.MockedFunction<typeof fetch>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          suggestions: [{ placePrediction: { placeId: "place123" } }],
        }),
      } as Partial<Response> as Response)

      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          addressComponents: [
            { types: ["locality"], longText: "Essen" },
            { types: ["route"], longText: "Kettwiger Straße" },
            { types: ["street_number"], longText: "10" },
            { types: ["postal_code"], longText: "45127" },
          ],
          location: { latitude: 51.5, longitude: 7.4 },
        }),
      } as Partial<Response> as Response);

    const adapter: Geocoder = createGoogleAdapter();
    const results: GeocodeResult[] = await adapter.geocode("Essen", coords);

    expect(results).toHaveLength(1);
    expect(results[0]?.city).toBe("Essen");
    expect(results[0]?.street).toBe("Kettwiger Straße");
    expect(results[0]?.housenumber).toBe("10");
    expect(results[0]?.postcode).toBe("45127");
    expect(results[0]?.coordinates.latitudeDegrees).toBe(51.5);
    expect(results[0]?.coordinates.longitudeDegrees).toBe(7.4);
  });

  test("returns empty array when autocomplete has no suggestions", async () => {
    (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ suggestions: [] }),
    } as Partial<Response> as Response);

    const adapter: Geocoder = createGoogleAdapter();
    const results = await adapter.geocode("Unknown", coords);

    expect(results).toEqual([]);
  });

  test("throws error when autocomplete request fails", async () => {
    (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as Partial<Response> as Response);

    const adapter: Geocoder = createGoogleAdapter();

    await expect(adapter.geocode("Essen", coords)).rejects.toThrow("HTTP 500: Internal Server Error");
  });

  test("throws error when place details request fails", async () => {
    (fetch as jest.MockedFunction<typeof fetch>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          suggestions: [{ placePrediction: { placeId: "place123" } }],
        }),
      } as Partial<Response> as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      } as Partial<Response> as Response);

    const adapter: Geocoder = createGoogleAdapter();

    await expect(adapter.geocode("Essen", coords)).rejects.toThrow("HTTP 404: Not Found");
  });
});
