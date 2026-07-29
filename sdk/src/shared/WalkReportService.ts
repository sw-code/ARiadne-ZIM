import type { WalkCounts } from "@/src/3d/walkEncounters";
import { getCmsBaseUrl } from "@/src/shared/Env";
import { log } from "@/src/shared/Logger";
import { clamp } from "@/src/shared/math";

// The version of the privacy notice the user agreed to by switching sharing on. Raise it with every change to that
// notice, so the CMS knows under which wording each report was shared.
export const walkReportConsentVersion = 1;

// Mirrors `WalkReport` in cms/src/shared/api.ts. The packages cannot share code because Metro does not resolve files
// outside of sdk/.
export type WalkReportRequest = {
  installId: string;
  consentVersion: number;
  appVersion: string;
  walkedOn: string; // "YYYY-MM-DD"
  mode: "explore" | "straight";
  durationMinutes: number;
  medianSpeedMetresPerSecond: number | null;
  pauseCount: number;
  // Share of the walk during which AR tracked, i.e. the phone was held up.
  arTrackingShare: number;
  language: string;
  counts: WalkCounts;
};

// Mirror the limits in cms/src/server/walkReports/walkReportSchema.ts.
const maxWalkDurationMinutes = 24 * 60;
const maxWalkingSpeedMetresPerSecond = 10;
const maxPauseCount = 1000;

export async function sendWalkReport(report: WalkReportRequest): Promise<void> {
  await requestCms("send the walk report", "/api/walk-reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withinCmsLimits(report)),
  });
}

export async function deleteWalkReports(installId: string): Promise<void> {
  await requestCms("delete the walk reports", `/api/walk-reports/${encodeURIComponent(installId)}`, {
    method: "DELETE",
  });
}

// The CMS turns a report with any value outside its limits away as a whole. A phone left in AR overnight, a GPS speed
// glitch or a share rounded to just above 1 still describe a real walk, so the values are clamped rather than the walk
// being lost.
function withinCmsLimits(report: WalkReportRequest): WalkReportRequest {
  const { durationMinutes, medianSpeedMetresPerSecond, pauseCount, arTrackingShare } = report;
  return {
    ...report,
    durationMinutes: clamp(durationMinutes, 0, maxWalkDurationMinutes),
    medianSpeedMetresPerSecond:
      medianSpeedMetresPerSecond === null ? null : clamp(medianSpeedMetresPerSecond, 0, maxWalkingSpeedMetresPerSecond),
    pauseCount: clamp(pauseCount, 0, maxPauseCount),
    arTrackingShare: clamp(arTrackingShare, 0, 1),
  };
}

// Failures are logged and not retried: losing one report costs the statistics little, while retries would need a
// queue on the phone. The log names only what failed and the HTTP status, never the request or the error, which could
// carry the report or the install ID.
async function requestCms(purpose: string, path: string, init: RequestInit): Promise<void> {
  try {
    const response = await fetch(`${getCmsBaseUrl()}${path}`, init);
    if (!response.ok) log.warn(`Could not ${purpose}: HTTP ${response.status}`);
  } catch {
    log.warn(`Could not ${purpose}: the request failed`);
  }
}
