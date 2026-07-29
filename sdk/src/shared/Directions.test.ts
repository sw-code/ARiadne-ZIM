import { getRoute } from "@/src/shared/Directions";
import { GeoCoordinate, geoCoordsFromLatLongDegrees } from "@/src/shared/GeoLocation";

jest.mock("@/src/shared/Env", () => ({ getGraphhopperApiKey: () => "test-key" }));

const fetchMock = jest.fn();
global.fetch = fetchMock;

describe("getRoute", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ paths: [] }) });
  });

  async function requestedPoints(via?: GeoCoordinate[]): Promise<string[]> {
    const start = geoCoordsFromLatLongDegrees(51.1, 8.1);
    const destination = geoCoordsFromLatLongDegrees(51.4, 8.4);

    await getRoute(start, destination, via);

    const [requestedUrl] = fetchMock.mock.calls[0]!;
    return new URL(String(requestedUrl)).searchParams.getAll("point");
  }

  test("asks for start and destination when there is no via point", async () => {
    expect(await requestedPoints()).toEqual(["51.1,8.1", "51.4,8.4"]);
  });

  test("puts the via points between start and destination, as GraphHopper expects", async () => {
    const via = [geoCoordsFromLatLongDegrees(51.2, 8.2), geoCoordsFromLatLongDegrees(51.3, 8.3)];

    expect(await requestedPoints(via)).toEqual(["51.1,8.1", "51.2,8.2", "51.3,8.3", "51.4,8.4"]);
  });
});
