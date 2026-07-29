import { z } from "zod";
import { countsPerSubtypeSchema, engagementCountsSchema } from "../profile/subtypeCountsSchema.ts";
import { stringWithoutControlCharacters } from "../ZodExtensions.ts";

const maxWalkDurationMinutes = 24 * 60;
const maxWalkingSpeedMetresPerSecond = 10;
const maxPauseCount = 1000;
const maxAppVersionCharacters = 32;
// The app did not exist before 2026. Years outside this range are no walk dates, and Postgres rejects year 0.
const firstWalkedOn = "2026-01-01";
const lastWalkedOn = "2099-12-31";

const installIdSchema = z.uuid();

export const walkReportSchema = z.object({
  installId: installIdSchema,
  // A 32-bit integer because that is what the Postgres column holds.
  consentVersion: z.int32().min(1),
  appVersion: stringWithoutControlCharacters.min(1).max(maxAppVersionCharacters),
  // A date that is well-formed but not on the calendar (2026-02-31) would reach Postgres and fail there as a 500.
  // Zero-padded ISO dates compare correctly as strings.
  walkedOn: z.iso.date().refine((date) => date >= firstWalkedOn && date <= lastWalkedOn, {
    message: `must be between ${firstWalkedOn} and ${lastWalkedOn}`,
  }),
  mode: z.enum(["explore", "straight"]),
  durationMinutes: z.number().min(0).max(maxWalkDurationMinutes),
  medianSpeedMetresPerSecond: z.number().min(0).max(maxWalkingSpeedMetresPerSecond).nullable(),
  pauseCount: z.number().int().min(0).max(maxPauseCount),
  arTrackingShare: z.number().min(0).max(1),
  language: z.string().regex(/^[a-z]{2,3}$/),
  counts: countsPerSubtypeSchema(engagementCountsSchema),
});

// Postgres throws on a malformed uuid, so an id that is not one is turned away before it reaches the database.
export function isInstallId(id: string): boolean {
  return installIdSchema.safeParse(id).success;
}
