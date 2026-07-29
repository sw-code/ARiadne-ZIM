import { deleteWalkReports, sendWalkReport, WalkReportRequest } from "@/src/shared/WalkReportService";
import { log } from "@/src/shared/Logger";

jest.mock("@/src/shared/Logger", () => ({
  log: { warn: jest.fn() },
}));

const cmsBaseUrl = "https://cms.example";
const installId = "0b8e2c1a-3f4d-4e5f-9a6b-7c8d9e0f1a2b";

const report: WalkReportRequest = {
  installId,
  consentVersion: 1,
  appVersion: "1.4.0",
  walkedOn: "2026-10-22",
  mode: "explore",
  durationMinutes: 23.5,
  medianSpeedMetresPerSecond: 1.25,
  pauseCount: 3,
  arTrackingShare: 0.6,
  language: "de",
  counts: { cafe: { shown: 4, engaged: 1 }, bakery: { shown: 2, engaged: 0 } },
};

describe("WalkReportService", () => {
  const originalFetch = global.fetch;

  function answerWith(status: number) {
    const fetchMock = jest.fn().mockResolvedValue(new Response(null, { status }));
    global.fetch = fetchMock;
    return fetchMock;
  }

  function sentBody(fetchMock: jest.Mock): WalkReportRequest {
    return JSON.parse(fetchMock.mock.calls[0][1].body);
  }

  beforeEach(() => {
    process.env["EXPO_PUBLIC_CMS_BASE_URL"] = cmsBaseUrl;
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env["EXPO_PUBLIC_CMS_BASE_URL"];
    global.fetch = originalFetch;
  });

  test("posts the report as JSON", async () => {
    const fetchMock = answerWith(201);

    await sendWalkReport(report);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${cmsBaseUrl}/api/walk-reports`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(sentBody(fetchMock)).toEqual(report);
  });

  test("clamps values the CMS would reject into its range", async () => {
    const fetchMock = answerWith(201);

    await sendWalkReport({
      ...report,
      durationMinutes: 2000,
      medianSpeedMetresPerSecond: 14,
      pauseCount: 1500,
      arTrackingShare: 1.0000000000000002,
    });

    expect(sentBody(fetchMock)).toMatchObject({
      durationMinutes: 1440,
      medianSpeedMetresPerSecond: 10,
      pauseCount: 1000,
      arTrackingShare: 1,
    });
  });

  test("deletes an install's reports", async () => {
    const fetchMock = answerWith(204);

    await deleteWalkReports(installId);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${cmsBaseUrl}/api/walk-reports/${installId}`);
    expect(init.method).toBe("DELETE");
  });

  test("a failure is logged with its HTTP status only and never thrown", async () => {
    answerWith(400);
    await sendWalkReport(report);
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Network request failed"));
    await deleteWalkReports(installId);

    expect(log.warn).toHaveBeenCalledTimes(2);
    const logged = JSON.stringify(jest.mocked(log.warn).mock.calls);
    expect(logged).toContain("400");
    expect(logged).not.toContain(installId);
    expect(logged).not.toContain("cafe");
  });
});
