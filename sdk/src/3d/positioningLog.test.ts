import { parsePositioningLogLine, PositioningLogEntry, positioningLogLine } from "@/src/3d/positioningLog";

const logcatPrefix = "10-22 14:44:21.078 I/ReactNativeJS(27065): 14:44:21 | INFO : ";

const oneEntryOfEveryKind: PositioningLogEntry[] = [
  { kind: "Origin", latitudeDegrees: 51.5705449, longitudeDegrees: 8.1053507, altitudeMeters: 98.4 },
  {
    kind: "Gps",
    atSeconds: 1792586658.123,
    latitudeDegrees: 51.5705449,
    longitudeDegrees: 8.1053507,
    altitudeMeters: null,
    accuracyMeters: 4.5,
    cameraInWorld: [1.25, -0.5, -3.75],
  },
  {
    kind: "Arcore",
    atSeconds: 1792586659.5,
    latitudeDegrees: 51.5705512,
    longitudeDegrees: 8.1053601,
    altitudeMeters: 145.2,
    headingDegrees: 271.5,
    worldNorthDegrees: 33.25,
    horizontalAccuracyMeters: 1.12,
    verticalAccuracyMeters: null,
    yawAccuracyDegrees: 3.31,
    cameraInWorld: [1.5, -0.5, -4],
  },
  { kind: "Compass", atSeconds: 1792586660, worldNorthDegrees: 41.5 },
  {
    kind: "Estimate",
    atSeconds: 1792586661,
    cameraInWorld: [2, -0.5, -5],
    northSpacePositionInWorld: [10.5, -1.5, 20.25],
    worldNorthDegrees: 33.5,
    geoTracking: "VPS",
  },
  { kind: "Checkpoint", atSeconds: 1792586662.25, checkpointNumber: 3 },
];

describe("positioning log", () => {
  it("writes one line with the kind after the POSITIONING marker", () => {
    const line = positioningLogLine({ kind: "Compass", atSeconds: 1792586658.123, worldNorthDegrees: 12.3456789 });

    expect(line).toBe('POSITIONING | Compass {"atSeconds":1792586658.123,"worldNorthDegrees":12.3456789}');
    expect(line).not.toContain("\n");
  });

  it("keeps 7 decimals of coordinates", () => {
    const line = positioningLogLine({
      kind: "Gps",
      atSeconds: 1,
      latitudeDegrees: 51.57054491234,
      longitudeDegrees: 8.10535071234,
      altitudeMeters: null,
      accuracyMeters: 3,
      cameraInWorld: [0, 0, 0],
    });

    expect(line).toContain('"latitudeDegrees":51.5705449,');
    expect(line).toContain('"longitudeDegrees":8.1053507,');
  });

  it("reads back what it wrote, from inside a logcat line", () => {
    for (const entry of oneEntryOfEveryKind) {
      expect(parsePositioningLogLine(logcatPrefix + positioningLogLine(entry))).toEqual(entry);
    }
  });

  it("ignores other log lines", () => {
    const paceLine = logcatPrefix + 'NAVIGATION GUIDE | Pace {"navigator":"dog","viewerMetersPerSecond":1.2}';

    expect(parsePositioningLogLine(paceLine)).toBeNull();
  });
});
