import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { OnPressEvent } from "@maplibre/maplibre-react-native";
import { RoutePreview } from "@/src/ui/pages/RoutePreview";
import { fetchRankedPointsOfInterest, RankedPointOfInterest } from "@/src/shared/RankedPoiService";
import type { GeoCoordinate } from "@/src/shared/GeoLocation";

type RoutePreviewProps = React.ComponentProps<typeof RoutePreview>;
type ShapeSourceProps = { id: string; onPress?: (event: OnPressEvent) => void };

// Only the places' source is pressable, so the test can press it without a native map.
const mockPressablePlaceSources: ShapeSourceProps[] = [];
jest.mock("@maplibre/maplibre-react-native", () => {
  const passThrough = ({ children }: { children?: React.ReactNode }) => children ?? null;
  const nothing = () => null;
  return {
    MapView: passThrough,
    ShapeSource: (props: ShapeSourceProps) => {
      if (props.id === "pointOfInterestSource") mockPressablePlaceSources.push(props);
      return null;
    },
    Camera: nothing,
    UserLocation: nothing,
    LineLayer: nothing,
    CircleLayer: nothing,
    PointAnnotation: nothing,
  };
});

const mockRecordEngaged = jest.fn();
const mockProfileForRanking = () => null;
const mockWalkingSpeedMetresPerSecond = () => 1.3;
jest.mock("@/src/shared/UserProfileProvider", () => ({
  useUserProfile: () => ({
    recordEngaged: mockRecordEngaged,
    profileForRanking: mockProfileForRanking,
    walkingSpeedMetresPerSecond: mockWalkingSpeedMetresPerSecond,
  }),
}));

// Without a direct route the preview settles at once, which leaves no timeout pending after the test.
jest.mock("@/src/shared/Directions", () => ({ getRoute: jest.fn().mockResolvedValue({ paths: [] }) }));
jest.mock("@/src/shared/RankedPoiService", () => ({ fetchRankedPointsOfInterest: jest.fn() }));
jest.mock("@/src/ui/pages/OverpassService", () => ({ getIntersectionCoords: jest.fn().mockResolvedValue([]) }));
jest.mock("@/src/shared/Logger", () => ({ log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const cafe: RankedPointOfInterest = {
  id: "node-1",
  category: "amenity",
  subtype: "cafe",
  score: 1,
  isAnnotated: false,
  location: { coordinate: { latitudeDegrees: 51.51, longitudeDegrees: 7.41 }, headingDegrees: 0 },
  info: { name: "Corner Cafe", description: "", position: [0, 0, 0] },
};

const userCoordinates = {
  latitude: 51.5,
  longitude: 7.4,
  altitude: null,
  accuracy: null,
  altitudeAccuracy: null,
  heading: null,
  speed: null,
};
const targetCoordinate: GeoCoordinate = { latitudeDegrees: 51.52, longitudeDegrees: 7.42 };
const metresPerDegreeOfLatitude = 111_195;
const tenMetresNorthOfCafe: GeoCoordinate = {
  latitudeDegrees: cafe.location.coordinate.latitudeDegrees + 10 / metresPerDegreeOfLatitude,
  longitudeDegrees: cafe.location.coordinate.longitudeDegrees,
};

const screenMetrics = {
  frame: { x: 0, y: 0, width: 400, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderPreview(target: GeoCoordinate = targetCoordinate) {
  jest.mocked(fetchRankedPointsOfInterest).mockResolvedValue([cafe]);
  const navigation = { replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn() };
  const props = {
    navigation,
    route: { key: "preview", name: "RoutePreview", params: { userCoordinates, targetCoordinate: target } },
  } as unknown as RoutePreviewProps;
  render(
    <SafeAreaProvider initialMetrics={screenMetrics}>
      <RoutePreview {...props} />
    </SafeAreaProvider>,
  );
  await act(async () => {});
  return navigation;
}

const pressMarkerOf = (placeId: string) => {
  const placeSource = mockPressablePlaceSources.at(-1)!;
  const event: OnPressEvent = {
    features: [{ type: "Feature", id: placeId, properties: {}, geometry: { type: "Point", coordinates: [0, 0] } }],
    coordinates: { latitude: 0, longitude: 0 },
    point: { x: 0, y: 0 },
  };
  act(() => placeSource.onPress?.(event));
};

describe("RoutePreview place markers", () => {
  beforeEach(() => {
    mockPressablePlaceSources.length = 0;
    mockRecordEngaged.mockClear();
  });

  it("pressing a marker opens the place's card and engages it once, however often it is pressed", async () => {
    await renderPreview();

    pressMarkerOf("node-1");
    pressMarkerOf("node-1");

    expect(screen.getByText("Corner Cafe")).toBeTruthy();
    expect(mockRecordEngaged).toHaveBeenCalledTimes(1);
    expect(mockRecordEngaged).toHaveBeenCalledWith(cafe);
  });

  it("Navigate here replaces the preview with one for the place", async () => {
    const navigation = await renderPreview();
    pressMarkerOf("node-1");

    fireEvent.press(screen.getByText("Navigate here"));

    expect(navigation.replace).toHaveBeenCalledWith("RoutePreview", {
      userCoordinates,
      targetCoordinate: cafe.location.coordinate,
    });
  });

  it("Close dismisses the card", async () => {
    await renderPreview();
    pressMarkerOf("node-1");

    fireEvent.press(screen.getByText("Close"));

    expect(screen.queryByText("Corner Cafe")).toBeNull();
  });
});

describe("RoutePreview destination", () => {
  beforeEach(() => {
    mockPressablePlaceSources.length = 0;
    mockRecordEngaged.mockClear();
  });

  it("a destination at a place engages it once, even when the place is also pressed", async () => {
    await renderPreview(tenMetresNorthOfCafe);
    expect(mockRecordEngaged).toHaveBeenCalledTimes(1);
    expect(mockRecordEngaged).toHaveBeenCalledWith(cafe);

    pressMarkerOf("node-1");

    expect(mockRecordEngaged).toHaveBeenCalledTimes(1);
  });

  it("Navigate here is not offered for the place that already is the destination", async () => {
    const navigation = await renderPreview(tenMetresNorthOfCafe);
    pressMarkerOf("node-1");

    fireEvent.press(screen.getByText("Navigate here"));

    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("a destination away from every place engages nothing", async () => {
    await renderPreview();

    expect(mockRecordEngaged).not.toHaveBeenCalled();
  });
});
