import { expect, test } from "vitest";
import type { DateRange } from "../shared/api.ts";
import { formatDateRange } from "./formatDateRange.ts";

const today = "2026-10-21";

test.each<[DateRange, string]>([
  [{ validFrom: "2026-10-20", validTo: "2026-10-31" }, "20.10.–31.10."],
  [{ validFrom: "2026-10-24", validTo: "2026-10-24" }, "24.10."],
  [{ validFrom: null, validTo: "2026-10-31" }, "bis 31.10."],
  [{ validFrom: "2026-11-05", validTo: null }, "ab 05.11."],
  [{ validFrom: null, validTo: null }, "unbegrenzt"],
  [{ validFrom: null, validTo: "2027-01-31" }, "bis 31.01.2027"],
  [{ validFrom: "2025-12-20", validTo: null }, "ab 20.12.2025"],
  [{ validFrom: "2026-12-20", validTo: "2027-01-10" }, "20.12.–10.01.2027"],
])("%j is written %s", (range, expected) => expect(formatDateRange(range, today)).toBe(expected));
