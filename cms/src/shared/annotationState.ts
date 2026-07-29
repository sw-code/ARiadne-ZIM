import type { DateRange, IsoDate } from "./api.ts";

export type AnnotationState = "active" | "scheduled" | "expired";

// Zero-padded ISO dates sort lexically in calendar order, so no Date parsing is needed.
export function annotationStateOn({ validFrom, validTo }: DateRange, today: IsoDate): AnnotationState {
  if (validFrom !== null && today < validFrom) return "scheduled";
  if (validTo !== null && today > validTo) return "expired";
  return "active";
}

// The en-CA locale formats dates as YYYY-MM-DD. Editors think in Soest's calendar, so an offer ending on
// the 31st must expire at Soest's midnight, not at UTC midnight.
const soestDateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" });

export function todayInSoest(now: Date): IsoDate {
  return soestDateFormat.format(now);
}
