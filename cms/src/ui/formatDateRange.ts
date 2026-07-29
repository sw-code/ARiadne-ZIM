import type { DateRange, IsoDate } from "../shared/api.ts";

// The year is only written when it is not the current one, because editors mostly deal with offers of the next weeks.
function formatDate(date: IsoDate, today: IsoDate): string {
  const [year, month, day] = date.split("-");
  const dayAndMonth = `${day}.${month}.`;
  return year === today.slice(0, 4) ? dayAndMonth : `${dayAndMonth}${year}`;
}

export function formatDateRange({ validFrom, validTo }: DateRange, today: IsoDate): string {
  if (validFrom !== null && validTo !== null) {
    const from = formatDate(validFrom, today);
    return validFrom === validTo ? from : `${from}–${formatDate(validTo, today)}`;
  }
  if (validTo !== null) return `bis ${formatDate(validTo, today)}`;
  if (validFrom !== null) return `ab ${formatDate(validFrom, today)}`;
  return "unbegrenzt";
}
