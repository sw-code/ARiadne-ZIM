import { expect, test } from "vitest";
import type { DateRange, IsoDate } from "./api.ts";
import { annotationStateOn, todayInSoest } from "./annotationState.ts";

const range = (validFrom: IsoDate | null, validTo: IsoDate | null): DateRange => ({ validFrom, validTo });

test("open range is always active", () => expect(annotationStateOn(range(null, null), "2026-10-21")).toBe("active"));

test("bounds are inclusive", () => {
  expect(annotationStateOn(range("2026-10-21", "2026-10-31"), "2026-10-21")).toBe("active");
  expect(annotationStateOn(range("2026-10-21", "2026-10-31"), "2026-10-31")).toBe("active");
});

test("before start is scheduled", () =>
  expect(annotationStateOn(range("2026-11-05", null), "2026-11-04")).toBe("scheduled"));

test("after end is expired", () => expect(annotationStateOn(range(null, "2026-10-31"), "2026-11-01")).toBe("expired"));

test("today follows Soest, not UTC", () => {
  expect(todayInSoest(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11-01"); // CET, UTC+1
  expect(todayInSoest(new Date("2026-07-31T22:30:00Z"))).toBe("2026-08-01"); // CEST, UTC+2
  expect(todayInSoest(new Date("2026-10-31T22:59:00Z"))).toBe("2026-10-31");
});
