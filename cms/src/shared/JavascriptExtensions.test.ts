import { expect, test, vi } from "vitest";
import {
  chunked,
  clamp,
  compareCodeUnits,
  foldedForSearch,
  getOrCreate,
  groupedBy,
  hashOfText,
  isoDatePlusDays,
  mean,
  meanOfPresent,
  median,
  memoisedByObject,
  nullIfEmpty,
  rangeInclusive,
  seededRandom,
  snakeCaseToHeadingCase,
  sum,
} from "./JavascriptExtensions.ts";

test("chunked splits into full chunks followed by a shorter remainder", () =>
  expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]));

test("chunked keeps a list that exactly fills its chunks free of an empty trailing chunk", () =>
  expect(chunked([1, 2, 3, 4], 2)).toEqual([
    [1, 2],
    [3, 4],
  ]));

test("chunked of an empty list has no chunks", () => expect(chunked([], 3)).toEqual([]));

test("groupedBy keeps first-seen order of keys and of items within a key", () =>
  expect(groupedBy(["bb", "a", "cc", "d", "ee"], (word) => word.length)).toEqual(
    new Map([
      [2, ["bb", "cc", "ee"]],
      [1, ["a", "d"]],
    ]),
  ));

test("groupedBy of an empty list has no groups", () => expect(groupedBy([], (item) => item)).toEqual(new Map()));

test("getOrCreate creates and stores a missing value", () => {
  const map = new Map<string, number[]>();

  expect(getOrCreate(map, "a", () => [1])).toEqual([1]);
  expect(map.get("a")).toEqual([1]);
});

test("getOrCreate returns the stored value without creating another", () => {
  const stored = [1];
  const map = new Map([["a", stored]]);

  expect(getOrCreate(map, "a", () => [2])).toBe(stored);
});

test("sum adds the values", () => expect(sum([1, 2.5, 3])).toBe(6.5));

test("sum of no values is zero", () => expect(sum([])).toBe(0));

test("mean is the sum divided by the count", () => expect(mean([1, 2, 6])).toBe(3));

test("mean of no values is not a number", () => expect(mean([])).toBeNaN());

test("clamp keeps a value inside the range", () => expect(clamp(0.4, 0, 1)).toBe(0.4));

test("clamp moves a value outside the range to the nearest end", () => {
  expect(clamp(-0.2, 0, 1)).toBe(0);
  expect(clamp(1.3, 0, 1)).toBe(1);
});

test("snakeCaseToHeadingCase capitalises every word and separates them with spaces", () =>
  expect(snakeCaseToHeadingCase("fast_food")).toBe("Fast Food"));

test("snakeCaseToHeadingCase capitalises a single word", () =>
  expect(snakeCaseToHeadingCase("chemist")).toBe("Chemist"));

test("nullIfEmpty turns an empty string into null", () => expect(nullIfEmpty("")).toBeNull());

test("nullIfEmpty keeps any other string, even a blank one", () => {
  expect(nullIfEmpty("2026-10-31")).toBe("2026-10-31");
  expect(nullIfEmpty(" ")).toBe(" ");
});

test("foldedForSearch ignores case", () => expect(foldedForSearch("Rossmann")).toBe("rossmann"));

test("foldedForSearch strips accents and umlauts", () => {
  expect(foldedForSearch("Café")).toBe("cafe");
  expect(foldedForSearch("Brüderstraße")).toBe("bruderstraße");
});

test("foldedForSearch treats a letter and its separate accent mark like the precomposed letter", () =>
  expect(foldedForSearch("Cafe\u0301")).toBe(foldedForSearch("Caf\u00e9")));

test("foldedForSearch leaves other characters alone", () =>
  expect(foldedForSearch("Hammer Str. 4-6")).toBe("hammer str. 4-6"));

test("memoisedByObject computes once per object, however often it is asked", () => {
  const compute = vi.fn((object: { value: number }) => object.value * 2);
  const memoised = memoisedByObject(compute);
  const object = { value: 21 };

  expect(memoised(object)).toBe(42);
  expect(memoised(object)).toBe(42);
  expect(compute).toHaveBeenCalledTimes(1);
});

test("memoisedByObject tells objects apart by identity, not by content", () => {
  const compute = vi.fn((object: { value: number }) => object.value);
  const memoised = memoisedByObject(compute);

  memoised({ value: 1 });
  memoised({ value: 1 });

  expect(compute).toHaveBeenCalledTimes(2);
});

const drawn = (random: () => number, count: number) => Array.from({ length: count }, random);

test("seededRandom repeats its sequence for the same seed", () =>
  expect(drawn(seededRandom(42), 5)).toEqual(drawn(seededRandom(42), 5)));

test("seededRandom gives other sequences for other seeds", () =>
  expect(drawn(seededRandom(42), 5)).not.toEqual(drawn(seededRandom(43), 5)));

test("seededRandom draws numbers from 0 up to but excluding 1, spread over that range", () => {
  const numbers = drawn(seededRandom(7), 1_000);

  expect(numbers.every((number) => number >= 0 && number < 1)).toBe(true);
  expect(mean(numbers)).toBeCloseTo(0.5, 1);
});

test("median is the middle value of an odd number of values, however they are ordered", () =>
  expect(median([9, 1, 5])).toBe(5));

test("median is the mean of the two middle values of an even number of values", () =>
  expect(median([4, 1, 3, 10])).toBe(3.5));

test("median leaves the order of its input alone", () => {
  const values = [3, 1, 2];

  median(values);

  expect(values).toEqual([3, 1, 2]);
});

test("median of no values is not a number, like mean", () => expect(median([])).toBeNaN());

test("median treats infinity as larger than any other value", () => {
  expect(median([Infinity, 1, 2])).toBe(2);
  expect(median([Infinity, Infinity, 1])).toBe(Infinity);
});

test("hashOfText gives the 32-bit FNV-1a hash of the characters", () => {
  expect(hashOfText("")).toBe(0x811c9dc5);
  expect(hashOfText("a")).toBe(0xe40c292c);
  expect(hashOfText("foobar")).toBe(0xbf9cf968);
});

test("hashOfText tells apart texts that only differ in order", () =>
  expect(hashOfText("ab")).not.toBe(hashOfText("ba")));

test("meanOfPresent is the mean of the values that are not null", () =>
  expect(meanOfPresent([1, null, 2, 6, null])).toBe(3));

test("meanOfPresent is null when no value is present, not a number like mean", () => {
  expect(meanOfPresent([null, null])).toBeNull();
  expect(meanOfPresent([])).toBeNull();
});

test("isoDatePlusDays counts whole calendar days, across months and years", () => {
  expect(isoDatePlusDays("2026-01-01", 0)).toBe("2026-01-01");
  expect(isoDatePlusDays("2026-01-30", 3)).toBe("2026-02-02");
  expect(isoDatePlusDays("2026-12-31", 1)).toBe("2027-01-01");
});

test("isoDatePlusDays is not shifted by a daylight saving change", () =>
  expect(isoDatePlusDays("2026-03-28", 2)).toBe("2026-03-30"));

test("compareCodeUnits sorts texts by their UTF-16 code units, whatever the locale", () => {
  expect(["node-2", "Way-1", "node-10", "äpfel", "zebra"].sort(compareCodeUnits)).toEqual([
    "Way-1",
    "node-10",
    "node-2",
    "zebra",
    "äpfel",
  ]);
  expect(compareCodeUnits("same", "same")).toBe(0);
});

test("rangeInclusive counts up from the first to the last whole number", () => {
  expect(rangeInclusive(2, 6)).toEqual([2, 3, 4, 5, 6]);
  expect(rangeInclusive(0, 0)).toEqual([0]);
});

test("rangeInclusive is empty when the last number comes before the first", () =>
  expect(rangeInclusive(3, 2)).toEqual([]));
