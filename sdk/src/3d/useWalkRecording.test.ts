import { renderHook } from "@testing-library/react-native";
import { LocationObjectCoords } from "expo-location";
import type { NavigationMode } from "@/App";
import { useWalkRecording } from "@/src/3d/useWalkRecording";
import { createWalkEncounters, WalkEncounters } from "@/src/3d/walkEncounters";
import { GeoCoordinate, geoCoordsFromLatLongDegrees } from "@/src/shared/GeoLocation";
import { secondsToMillis } from "@/src/shared/math";
import { PointOfInterest } from "@/src/shared/poi";

const mockProfile = {
  recordWalkSpeed: jest.fn(),
  isWalkReportSharingEnabled: false,
  installId: "0b8e2c1a-3f4d-4e5f-9a6b-7c8d9e0f1a2b",
};
jest.mock("@/src/shared/UserProfileProvider", () => ({ useUserProfile: () => mockProfile }));
jest.mock("expo-constants", () => ({ expoConfig: { version: "1.4.0" } }));

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const cmsBaseUrl = "https://cms.example";

// Local time, so the walk is on 22 October in every time zone the tests run in.
const walkStart = new Date("2026-10-22T10:00:00");

// On the 6371 km sphere distanceMetres assumes, one degree of latitude is this long everywhere.
const metresPerDegreeOfLatitude = 111_195;
const origin = geoCoordsFromLatLongDegrees(51.5715, 8.1055);

function northOfOrigin(metres: number): GeoCoordinate {
  return geoCoordsFromLatLongDegrees(
    origin.latitudeDegrees + metres / metresPerDegreeOfLatitude,
    origin.longitudeDegrees,
  );
}

const gpsUpdateIntervalSeconds = 5;

type GpsUpdate = { atSeconds: number; metresNorth: number; speed: number | null; isArTracking: boolean };

// One GPS update every 5 s while walking north at the given speed until the next update, which the device reports.
function gpsUpdatesOf(speeds: number[], isArTrackingAt = (_atSeconds: number) => true): GpsUpdate[] {
  let metresNorth = 0;
  return speeds.map((speed, index) => {
    const atSeconds = index * gpsUpdateIntervalSeconds;
    const update = { atSeconds, metresNorth, speed, isArTracking: isArTrackingAt(atSeconds) };
    metresNorth += speed * gpsUpdateIntervalSeconds;
    return update;
  });
}

function locationAt(coordinate: GeoCoordinate, speed: number | null): LocationObjectCoords {
  return {
    latitude: coordinate.latitudeDegrees,
    longitude: coordinate.longitudeDegrees,
    altitude: 0,
    accuracy: 4,
    altitudeAccuracy: null,
    heading: null,
    speed,
  };
}

function placeAt(id: string, subtype: string, metresNorth: number): PointOfInterest {
  return { id, category: "amenity", subtype, location: { coordinate: northOfOrigin(metresNorth), headingDegrees: 0 } };
}

type WalkOptions = { pois?: PointOfInterest[]; navigationMode?: NavigationMode; leftArAtSeconds?: number };

// Renders the walk in AR, one render per GPS update, then leaves AR, by default right at the last update.
function walk(
  updates: GpsUpdate[],
  { pois = [], navigationMode = "explore", leftArAtSeconds = updates.at(-1)?.atSeconds ?? 0 }: WalkOptions = {},
) {
  const encounters: WalkEncounters = createWalkEncounters({ recordShown: jest.fn(), recordEngaged: jest.fn() });
  jest.setSystemTime(walkStart);
  const { rerender, unmount } = renderHook((props: Parameters<typeof useWalkRecording>[0]) => useWalkRecording(props), {
    initialProps: { location: null, isArTracking: false, pois, encounters, navigationMode },
  });
  for (const { atSeconds, metresNorth, speed, isArTracking } of updates) {
    jest.setSystemTime(walkStart.getTime() + secondsToMillis(atSeconds));
    rerender({
      location: locationAt(northOfOrigin(metresNorth), speed),
      isArTracking,
      pois,
      encounters,
      navigationMode,
    });
  }
  jest.setSystemTime(walkStart.getTime() + secondsToMillis(leftArAtSeconds));
  unmount();
  return encounters;
}

function keysAtAnyDepth(value: Json): string[] {
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...keysAtAnyDepth(child)]);
}

describe("useWalkRecording", () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    process.env["EXPO_PUBLIC_CMS_BASE_URL"] = cmsBaseUrl;
    fetchMock = jest.fn().mockResolvedValue(new Response(null, { status: 201 }));
    global.fetch = fetchMock;
    mockProfile.isWalkReportSharingEnabled = false;
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env["EXPO_PUBLIC_CMS_BASE_URL"];
    global.fetch = originalFetch;
  });

  test("a walk shorter than a minute sends nothing", () => {
    mockProfile.isWalkReportSharingEnabled = true;
    const cafe = placeAt("cafe-1", "cafe", 18);
    const walkingThenStoppingAtTheCafe = [1.2, 1.2, 1.2, 0, 0, 0, 0, 0, 0, 1.2, 1.2, 1.2]; // 55 s

    const encounters = walk(gpsUpdatesOf(walkingThenStoppingAtTheCafe), { pois: [cafe] });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockProfile.recordWalkSpeed).not.toHaveBeenCalled();
    expect(encounters.tally()).toEqual({});
  });

  test("with sharing on, one report without coordinates is sent on leaving AR", () => {
    mockProfile.isWalkReportSharingEnabled = true;
    // 60 s walking (78 m), 25 s stopped 7 m from the cafe, 30 s walking; the phone is lowered from 30 s to 60 s.
    const speeds = [...Array(13).fill(1.2), ...Array(5).fill(0), ...Array(7).fill(1.2)];
    const isArTrackingAt = (atSeconds: number) => atSeconds < 30 || atSeconds >= 60;
    const cafe = placeAt("cafe-1", "cafe", 85);
    const bakery = placeAt("bakery-1", "bakery", 150);

    walk(gpsUpdatesOf(speeds, isArTrackingAt), { pois: [cafe, bakery], navigationMode: "explore" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${cmsBaseUrl}/api/walk-reports`);
    const body: Json = JSON.parse(init.body);
    expect(keysAtAnyDepth(body)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^(latitude|longitude|coordinate)$/)]),
    );
    expect(body).toEqual({
      installId: mockProfile.installId,
      consentVersion: 1,
      appVersion: "1.4.0",
      walkedOn: "2026-10-22",
      mode: "explore",
      durationMinutes: 2,
      medianSpeedMetresPerSecond: 1.2,
      pauseCount: 1,
      arTrackingShare: 0.75,
      language: expect.stringMatching(/^[a-z]{2,3}$/),
      counts: { cafe: { shown: 1, engaged: 1 } },
    });
  });

  test("with sharing off, nothing is sent but the walk speed is still recorded", () => {
    walk(gpsUpdatesOf(Array(19).fill(1.4)), { navigationMode: "straight" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockProfile.recordWalkSpeed).toHaveBeenCalledTimes(1);
    expect(mockProfile.recordWalkSpeed).toHaveBeenCalledWith(1.4);
  });

  test("a negative GPS speed is unknown, not a stop", () => {
    // Walking past the cafe for 30 s while iOS reports -1 because it does not know the speed.
    const updates = gpsUpdatesOf(Array(18).fill(1.2)).map((update, index) =>
      index >= 6 && index < 12 ? { ...update, speed: -1 } : update,
    );
    const cafe = placeAt("cafe-1", "cafe", 38);

    const encounters = walk(updates, { pois: [cafe] });

    expect(encounters.tally()).toEqual({});
    expect(mockProfile.recordWalkSpeed).toHaveBeenCalledWith(1.2);
  });

  test("standing fix, then 25 s of silence until leaving AR, is a pause", () => {
    // 60 s walking (78 m), then one standing fix 2 m from the cafe at 65 s and none after it.
    const updates = gpsUpdatesOf([...Array(13).fill(1.2), 0]);
    const cafe = placeAt("cafe-1", "cafe", 80);

    const encounters = walk(updates, { pois: [cafe], leftArAtSeconds: 90 });

    expect(encounters.tally()).toEqual({ cafe: { shown: 1, engaged: 1 } });
  });

  test("standing at a place while AR initialises does not engage it", () => {
    // 30 s standing at the cafe until AR tracks, then 60 s walking on.
    const speeds = [...Array(7).fill(0), ...Array(12).fill(1.2)];
    const cafe = placeAt("cafe-1", "cafe", 2);

    const encounters = walk(
      gpsUpdatesOf(speeds, (atSeconds) => atSeconds >= 30),
      { pois: [cafe] },
    );

    expect(encounters.tally()).toEqual({});
  });

  test("a single walking fix, then silence until leaving AR, is no pause", () => {
    const cafe = placeAt("cafe-1", "cafe", 2);

    const encounters = walk(gpsUpdatesOf([1.2]), { pois: [cafe], leftArAtSeconds: 90 });

    expect(encounters.tally()).toEqual({});
    expect(mockProfile.recordWalkSpeed).toHaveBeenCalledWith(1.2);
  });

  test("fixes that stop arriving at the end of a walk are no pause", () => {
    // 60 s walking (72 m to the last fix), then no fix for 40 s until leaving AR, e.g. in a GPS dropout.
    const cafe = placeAt("cafe-1", "cafe", 75);

    const encounters = walk(gpsUpdatesOf(Array(13).fill(1.2)), { pois: [cafe], leftArAtSeconds: 100 });

    expect(encounters.tally()).toEqual({});
  });

  test("the time from the last fix until leaving AR counts toward the minute", () => {
    walk(gpsUpdatesOf(Array(10).fill(1.2)), { leftArAtSeconds: 65 }); // fixes for 45 s

    expect(mockProfile.recordWalkSpeed).toHaveBeenCalledWith(1.2);
  });
});
