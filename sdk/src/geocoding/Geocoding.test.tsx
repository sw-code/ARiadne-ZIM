import * as geoCoding from "./GeocodingClient";
import { renderHook } from "@testing-library/react-native";
import React, { act } from "react";
import { LocationObjectCoords } from "expo-location";
import { GeocodeResult } from "@/src/geocoding/GeocodingTypes";
import { Geocoder } from "@/src/geocoding/TargetInterface";
import { GeocoderProvider } from "@/src/geocoding/GeocodingProvider";

describe("Geocoding", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn();
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

  const fakeResults: GeocodeResult[] = [
    {
      coordinates: { latitudeDegrees: 1, longitudeDegrees: 2 },
      street: "street",
      housenumber: "housenumber",
      city: "city",
      postcode: "postcode",
    },
  ];

  const mockGeocoder: Geocoder = {
    geocode: jest.fn().mockResolvedValue([]),
  };
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <GeocoderProvider geocoder={mockGeocoder}>{children}</GeocoderProvider>
  );

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("useGeoCoding hook", () => {
    it("initializes with correct default state", () => {
      const { result } = renderHook(() => geoCoding.useGeoCoding(coords), { wrapper });
      expect(result.current.geocodingResults).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.hasGeocodingStatusError).toBe(false);
      expect(result.current.hasGeocodingResult).toBe(false);
    });

    test("does nothing if input length < MIN_QUERY_LENGTH", async () => {
      const { result } = renderHook(() => geoCoding.useGeoCoding(coords), { wrapper });
      await act(async () => {
        await result.current.geocodeAddressToCoordinate("a"); // length 1
      });
      expect(result.current.isLoading).toBe(false);
      expect(result.current.hasGeocodingResult).toBe(false);
      expect(result.current.geocodingResults).toEqual([]);
    });

    test("clearGeocodingResults clears results and  hasGeocodingResult flag", async () => {
      const { result } = renderHook(() => geoCoding.useGeoCoding(coords), { wrapper });
      await act(async () => {
        await result.current.geocodeAddressToCoordinate("Berlin");
      });

      act(() => {
        result.current.clearGeocodingResults();
      });
      expect(result.current.geocodingResults).toEqual([]);
      expect(result.current.hasGeocodingResult).toBe(false);
    });

    test("geocode sets results when adapter returns hits", async () => {
      const mockGeocoder: Geocoder = {
        geocode: jest.fn().mockResolvedValue(fakeResults),
      };

      const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
        <GeocoderProvider geocoder={mockGeocoder}>{children}</GeocoderProvider>
      );

      const { result } = renderHook(() => geoCoding.useGeoCoding(coords), { wrapper });

      await act(async () => {
        await result.current.geocodeAddressToCoordinate("city");
      });
      expect(result.current.geocodingResults).toEqual(fakeResults);
      expect(result.current.hasGeocodingResult).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });

    test("geocode sets empty results when adapter returns []", async () => {
      const mockGeocoder: Geocoder = {
        geocode: jest.fn().mockResolvedValue([]),
      };

      const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
        <GeocoderProvider geocoder={mockGeocoder}>{children}</GeocoderProvider>
      );

      const { result } = renderHook(() => geoCoding.useGeoCoding(coords), { wrapper });

      await act(async () => {
        await result.current.geocodeAddressToCoordinate("Berlin");
      });

      expect(result.current.geocodingResults).toEqual([]);
      expect(result.current.hasGeocodingResult).toBe(false);
    });
  });
});
