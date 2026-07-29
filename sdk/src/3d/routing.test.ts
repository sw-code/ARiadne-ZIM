import { act, renderHook } from "@testing-library/react-native";
import { getRoute, Path } from "@/src/shared/Directions";
import { GeoCoordinate, geoCoordsFromLatLongDegrees } from "@/src/shared/GeoLocation";
import { useRouting } from "@/src/3d/routing";
import { secondsToMillis } from "@/src/shared/math";

jest.mock("@/src/shared/Directions", () => ({ getRoute: jest.fn() }));

const getRouteMock = jest.mocked(getRoute);

const routeCheckIntervalMillis = 1000;
const metresPerDegreeOfLatitude = 111_195;

const start = geoCoordsFromLatLongDegrees(51.57, 8.1);
const via = metresNorthOf(start, 300);
const destination = metresNorthOf(start, 1000);

const anyPath: Path = {
  distance: 1000,
  weight: 0,
  time: 0,
  transfers: 0,
  points_encoded: false,
  bbox: [],
  points: { type: "LineString", coordinates: [] },
  instructions: [],
  details: {},
  ascend: 0,
  descend: 0,
};

function metresNorthOf(origin: GeoCoordinate, metres: number): GeoCoordinate {
  return geoCoordsFromLatLongDegrees(
    origin.latitudeDegrees + metres / metresPerDegreeOfLatitude,
    origin.longitudeDegrees,
  );
}

function renderRouting() {
  return renderHook(({ userLocation }: { userLocation: GeoCoordinate }) => useRouting(userLocation, destination, via), {
    initialProps: { userLocation: start },
  });
}

type RenderedRouting = ReturnType<typeof renderRouting>;

async function moveTo(routing: RenderedRouting, userLocation: GeoCoordinate, { isOffTrack }: { isOffTrack: boolean }) {
  routing.rerender({ userLocation });
  act(() => routing.result.current.setIsOffTrack(isOffTrack));
  await act(async () => {
    jest.advanceTimersByTime(routeCheckIntervalMillis);
  });
}

const lastRequestedVia = () => getRouteMock.mock.lastCall?.[2];

async function waitSeconds(seconds: number) {
  await act(async () => {
    jest.advanceTimersByTime(secondsToMillis(seconds));
  });
}

describe("useRouting", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    getRouteMock.mockReset();
    getRouteMock.mockResolvedValue({ paths: [anyPath] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("routes through the via place until the user is within 20 m of it, then straight to the destination", async () => {
    const routing = renderRouting();
    await act(async () => {});
    expect(lastRequestedVia()).toEqual([via]);

    await moveTo(routing, metresNorthOf(via, -30), { isOffTrack: true });
    expect(lastRequestedVia()).toEqual([via]);

    await moveTo(routing, metresNorthOf(via, -15), { isOffTrack: true });
    expect(lastRequestedVia()).toEqual([]);
  });

  test("walking away again does not bring the via place back", async () => {
    const routing = renderRouting();
    await act(async () => {});

    await moveTo(routing, metresNorthOf(via, -15), { isOffTrack: false });
    await moveTo(routing, metresNorthOf(via, 100), { isOffTrack: true });

    expect(lastRequestedVia()).toEqual([]);
  });

  test("after a failure the next request waits 2 s, then 4 s; a success resets it", async () => {
    const rateLimited = new Error("Minutely API limit heavily violated");
    getRouteMock
      .mockRejectedValueOnce(rateLimited)
      .mockRejectedValueOnce(rateLimited)
      .mockResolvedValueOnce({ paths: [anyPath] })
      .mockRejectedValueOnce(rateLimited);
    // The walk starts off track, so every check that is allowed to request a route does.
    renderRouting();
    await act(async () => {});
    expect(getRouteMock).toHaveBeenCalledTimes(1);

    await waitSeconds(1);
    expect(getRouteMock).toHaveBeenCalledTimes(1);
    await waitSeconds(1);
    expect(getRouteMock).toHaveBeenCalledTimes(2);

    await waitSeconds(3);
    expect(getRouteMock).toHaveBeenCalledTimes(2);
    await waitSeconds(1);
    expect(getRouteMock).toHaveBeenCalledTimes(3);

    await waitSeconds(1);
    expect(getRouteMock).toHaveBeenCalledTimes(4);
    await waitSeconds(1);
    expect(getRouteMock).toHaveBeenCalledTimes(4);
    await waitSeconds(1);
    expect(getRouteMock).toHaveBeenCalledTimes(5);
  });
});
