import {
  consecutivePairs,
  exponentialBackoffSeconds,
  jsonWithRoundedNumbers,
  languageOfLocale,
  localIsoDate,
  parseCsv,
  startingAtFirst,
  toCsv,
  withTimeout,
} from "@/src/shared/JavascriptExtensions";

describe("jsonWithRoundedNumbers", () => {
  test("rounds nested numbers and keeps everything else", () => {
    const value = { speed: 1.23456, accuracy: null, source: "VPS", nested: { degrees: 89.996 } };

    expect(jsonWithRoundedNumbers(value, 2)).toBe(
      '{"speed":1.23,"accuracy":null,"source":"VPS","nested":{"degrees":90}}',
    );
  });
});

describe("exponentialBackoffSeconds", () => {
  test("doubles from the first delay with each failure, up to the maximum", () => {
    const delaysSeconds = [1, 2, 3, 4, 5, 6].map((failureCount) => exponentialBackoffSeconds(failureCount, 2, 30));

    expect(delaysSeconds).toEqual([2, 4, 8, 16, 30, 30]);
  });
});

describe("consecutivePairs", () => {
  test("pairs every element with its successor", () => {
    expect(consecutivePairs([1, 2, 3, 4])).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
  });

  test("has no pairs for fewer than two elements", () => {
    expect(consecutivePairs([1])).toEqual([]);
    expect(consecutivePairs([])).toEqual([]);
  });
});

describe("startingAtFirst", () => {
  test("keeps the elements from the first match on, including later ones that do not match", () => {
    expect(startingAtFirst([1, 2, 5, 3, 6], (value) => value > 4)).toEqual([5, 3, 6]);
  });

  test("is empty when nothing matches", () => {
    expect(startingAtFirst([1, 2, 3], (value) => value > 4)).toEqual([]);
  });
});

describe("withTimeout", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("settles like the promise when it settles in time", async () => {
    const answer = withTimeout(new Promise((resolve) => setTimeout(() => resolve("route"), 9_000)), 10);
    jest.advanceTimersByTime(9_000);

    await expect(answer).resolves.toBe("route");
  });

  test("rejects when the promise takes longer than the timeout", async () => {
    const answer = withTimeout(new Promise(() => {}), 10);
    jest.advanceTimersByTime(10_000);

    await expect(answer).rejects.toThrow("Timed out after 10 s");
  });
});

describe("languageOfLocale", () => {
  test("is the lower-cased first subtag of the locale", () => {
    expect(languageOfLocale("de-DE")).toBe("de");
    expect(languageOfLocale("EN-us")).toBe("en");
    expect(languageOfLocale("gsw-CH")).toBe("gsw");
    expect(languageOfLocale("zh-Hant-TW")).toBe("zh");
    expect(languageOfLocale("fr")).toBe("fr");
  });

  test("is undetermined when the locale does not start with a language", () => {
    expect(languageOfLocale("")).toBe("und");
    expect(languageOfLocale("x-private")).toBe("und");
    expect(languageOfLocale("de_DE")).toBe("und");
    expect(languageOfLocale("1234")).toBe("und");
  });
});

describe("localIsoDate", () => {
  test("is the calendar date in the device's time zone", () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(localIsoDate(new Date(2026, 10, 22, 0, 1))).toBe("2026-11-22");
  });
});

describe("csv", () => {
  test("parses quoted fields with commas and quotes", () => {
    const text = 'id,description\n1,"corner, east side"\n2,"the ""big"" house"\n';

    expect(parseCsv(text)).toEqual([
      { id: "1", description: "corner, east side" },
      { id: "2", description: 'the "big" house' },
    ]);
  });

  test("ignores a byte order mark before the header", () => {
    expect(parseCsv("\uFEFFid,note\n1,a\n")).toEqual([{ id: "1", note: "a" }]);
  });

  test("writes rows that it reads back, with empty cells for null", () => {
    const csv = toCsv([
      { strategy: "GPS + compass", errorMeters: 1.5, note: 'a, "b"' },
      { strategy: "Fusion", errorMeters: null, note: "" },
    ]);

    expect(csv.split("\n")[0]).toBe("strategy,errorMeters,note");
    expect(parseCsv(csv)).toEqual([
      { strategy: "GPS + compass", errorMeters: "1.5", note: 'a, "b"' },
      { strategy: "Fusion", errorMeters: "", note: "" },
    ]);
  });
});
