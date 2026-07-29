import { secondsToMillis } from "@/src/shared/math";
import { log } from "@/src/shared/Logger";

export function enumerate(count: number): number[] {
  return Array.from(Array(count).keys());
}

export function nullToUndefined<T>(valOrNull: T | null): T | undefined {
  if (valOrNull === null) return undefined;
  else return valOrNull;
}

export function waitSecondsAsync(seconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, secondsToMillis(seconds));

    return () => {
      clearTimeout(timeoutId);
      reject(new Error("Timer cancelled"));
    };
  });
}

/// Rejects when the promise has not settled in time. The promise itself keeps running, as promises cannot be
/// cancelled; this only stops waiting for it.
export function withTimeout<T>(promise: Promise<T>, timeoutSeconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new Error(`Timed out after ${timeoutSeconds} s`)),
      secondsToMillis(timeoutSeconds),
    );

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export async function getJsonOrThrow(response: Response): Promise<any> {
  if (!response.ok) {
    const message = await response.text();
    log.error(`HTTP ${response.status}: ${message}`);
    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  return await response.json();
}

/// Creates a URL with the given base and query parameters.
/// If a query parameter has multiple values, it will be added multiple times.
export function createUrl(base: string, queryParams: QueryParams) {
  const url = new URL(base);

  Object.keys(queryParams).forEach((key) => {
    const value = queryParams[key]!;

    if (Array.isArray(value)) {
      value.forEach((value) => url.searchParams.append(key, value.toString()));
    } else {
      url.searchParams.append(key, value.toString());
    }
  });

  return url;
}

export function findMinimumBy<T>(array: T[], getProp: (elem: T) => number): T | undefined {
  let minElem: T | undefined = undefined;
  let minProp = Number.POSITIVE_INFINITY;

  for (const elem of array) {
    const prop = getProp(elem);
    if (prop < minProp) {
      minProp = prop;
      minElem = elem;
    }
  }

  return minElem;
}

/// Pairs every element with the one after it, e.g. the points of a polyline with the segments between them.
export function consecutivePairs<T>(array: T[]): [T, T][] {
  return array.slice(0, -1).map((element, index) => [element, array[index + 1]!]);
}

/// The elements from the first one that satisfies the predicate on, or none if no element does.
export function startingAtFirst<T>(array: T[], predicate: (element: T) => boolean): T[] {
  const firstIndex = array.findIndex(predicate);
  return firstIndex === -1 ? [] : array.slice(firstIndex);
}

type QueryParams = { [param: string]: OneOrManyStrings };
type OneOrManyStrings = string | string[];

export function recordWithoutProperty<K extends string | number | symbol, V>(
  record: Record<K, V>,
  property: K,
): Record<K, V> {
  const clone = { ...record };
  delete clone[property];
  return clone;
}

export function objectWithoutProperty<T, K extends keyof T>(record: T, property: K): Omit<T, K> {
  const clone = { ...record };
  delete clone[property];
  return clone;
}

/// Turns a snake_case identifier into a human-readable "Heading Case" label,
/// e.g. "fast_food" → "Fast Food".
export function snakeCaseToHeadingCase(snakeCase: string): string {
  return snakeCase
    .split("_")
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/// Formats with exactly the given number of fraction digits, using the separators of the language,
/// e.g. 1.5 → "1,5" in German.
export function formatDecimal(value: number, fractionDigits: number, language: string): string {
  return value.toLocaleString(language, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function lowerCaseToHeadingCase(lowerCase: string): string {
  return lowerCase
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function launchAsync(startTask: () => Promise<void>) {
  void startTask();
}

export function parseNumberOrNull(str: string | null | undefined): number | null {
  if (str === null || str === undefined) return null;
  const num = parseFloat(str);
  if (Number.isNaN(num)) return null;
  return num;
}

export function randomIndex(len: number): number {
  return Math.floor(Math.random() * len);
}

export function sum(array: number[]): number {
  return array.reduce((a, b) => a + b, 0);
}

/// The wait before the next attempt after `consecutiveFailureCount` (1 or more) failures in a row: the first delay,
/// doubled with each further failure, up to the maximum.
export function exponentialBackoffSeconds(
  consecutiveFailureCount: number,
  firstDelaySeconds: number,
  maxDelaySeconds: number,
): number {
  return Math.min(firstDelaySeconds * 2 ** (consecutiveFailureCount - 1), maxDelaySeconds);
}

export function jsonWithRoundedNumbers(value: object, fractionDigits: number): string {
  return JSON.stringify(value, (_key, property) =>
    typeof property === "number" ? Number(property.toFixed(fractionDigits)) : property,
  );
}

/// The ISO 639 language a BCP 47 locale starts with ("de-DE" → "de"), or "und", BCP 47's code for an undetermined
/// language, when the locale starts with none.
export function languageOfLocale(locale: string): string {
  const language = (locale.split("-")[0] ?? "").toLowerCase();
  return /^[a-z]{2,3}$/.test(language) ? language : "und";
}

/// "YYYY-MM-DD" in the device's time zone. toISOString() gives the UTC date, which around midnight is another day.
export function localIsoDate(date: Date): string {
  const twoDigits = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

export function promiseWithResolvers<T>() {
  let resolve: (v: T) => void = () => {};
  let reject: () => void = () => {};
  let resolved = false;

  const promise = new Promise<T>((internalResolve, internalReject) => {
    resolve = (value) => {
      if (!resolved) {
        resolved = true;
        internalResolve(value);
      }
    };

    reject = internalReject;
  });

  return { promise, resolve, reject };
}

export type CsvRow = Record<string, string>;

/// Parses comma-separated values with a header line; quoted fields may contain commas, quotes ("") and line breaks.
export function parseCsv(text: string): CsvRow[] {
  const [header, ...records] = csvRecords(text.replace(/^\uFEFF/, ""));
  if (!header) return [];
  return records.map((fields) => Object.fromEntries(header.map((name, index) => [name, fields[index] ?? ""])));
}

export function toCsv(rows: Record<string, string | number | null>[]): string {
  const [first] = rows;
  if (!first) return "";
  const names = Object.keys(first);
  const field = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [names.map(field), ...rows.map((row) => names.map((name) => field(row[name])))]
    .map((fields) => fields.join(","))
    .join("\n");
}

function csvRecords(text: string): string[][] {
  const records: string[][] = [];
  let fields: string[] = [];
  let current = "";
  let isQuoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (isQuoted) {
      if (char === '"' && text[index + 1] === '"') {
        current += '"';
        index++;
      } else if (char === '"') {
        isQuoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      isQuoted = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      records.push([...fields, current]);
      fields = [];
      current = "";
    } else {
      current += char;
    }
  }

  if (current !== "" || fields.length > 0) records.push([...fields, current]);
  return records;
}
