import { expect, test } from "vitest";
import { chunked, foldedForSearch, groupedBy, nullIfEmpty, snakeCaseToHeadingCase } from "./JavascriptExtensions.ts";

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
