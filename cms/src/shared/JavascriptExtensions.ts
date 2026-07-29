export function chunked<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += chunkSize) {
    chunks.push(items.slice(start, start + chunkSize));
  }
  return chunks;
}

// Groups and the items within them keep the order in which they were first seen. The type promises every group at
// least one item, so callers can destructure the first one without an undefined check.
export function groupedBy<Item, Key>(items: Item[], keyOf: (item: Item) => Key): Map<Key, [Item, ...Item[]]> {
  const groups = new Map<Key, [Item, ...Item[]]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [item]);
    else group.push(item);
  }
  return groups;
}

export function getOrCreate<Key, Value>(map: Map<Key, Value>, key: Key, create: () => Value): Value {
  const existing = map.get(key);
  if (existing !== undefined) return existing;
  const created = create();
  map.set(key, created);
  return created;
}

// Remembers results by object identity: an equal object that is not the same one is computed again. The weak keys let
// results go together with their objects. Only for objects that are never changed after the first call.
export function memoisedByObject<Key extends object, Value>(compute: (key: Key) => Value): (key: Key) => Value {
  const remembered = new WeakMap<Key, { result: Value }>();
  return (key) => {
    const earlier = remembered.get(key);
    if (earlier !== undefined) return earlier.result;
    const result = compute(key);
    remembered.set(key, { result });
    return result;
  };
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

// Not a number for no values, like every division of zero by zero.
export function mean(values: number[]): number {
  return sum(values) / values.length;
}

// Null rather than not a number when no value is present: a mean of nothing is missing data, and null says so in JSON
// as well, where not a number would silently turn into null.
export function meanOfPresent(values: (number | null)[]): number | null {
  const presentValues = values.filter((value) => value !== null);
  return presentValues.length === 0 ? null : mean(presentValues);
}

// Not a number for no values, like mean. Infinity counts as larger than any other value, which lets a median state
// that the middle of the values is "never".
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return mean(sorted.slice(Math.floor((sorted.length - 1) / 2), Math.floor(sorted.length / 2) + 1));
}

// Empty when the last number comes before the first.
export function rangeInclusive(first: number, last: number): number[] {
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function snakeCaseToHeadingCase(snakeCase: string): string {
  return snakeCase
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// The order of the UTF-16 code units, the default of Array.prototype.sort, as a comparator: unlike localeCompare it does
// not depend on the locale of the machine, so a sort gives the same order everywhere.
export function compareCodeUnits(first: string, second: string): number {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}

// Counts in UTC, where every day has 24 hours, so that a daylight saving change cannot move the date. Takes and gives
// dates as "YYYY-MM-DD".
export function isoDatePlusDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, "YYYY-MM-DD".length);
}

export function nullIfEmpty(text: string): string | null {
  return text === "" ? null : text;
}

// Lets "cafe" find "Café": editors rarely type accents when they search. Decomposing first (NFD) turns every accented
// letter into its base letter plus a combining mark, and the marks are what gets stripped.
export function foldedForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();
}

// Mulberry32: Math.random cannot be seeded, and a simulation must give the same numbers again for the same seed. The
// generator is a few lines long and its quality is plenty for simulating behaviour. Not for anything secret.
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}

// FNV-1a over the UTF-16 code units: lets a simulation derive a value from a name that stays the same whatever else was
// asked before, which drawing from a shared random stream cannot promise. Not for anything secret.
export function hashOfText(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}
