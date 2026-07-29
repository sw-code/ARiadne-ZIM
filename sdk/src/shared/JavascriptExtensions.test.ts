import { jsonWithRoundedNumbers, parseCsv, toCsv } from "@/src/shared/JavascriptExtensions";

describe("jsonWithRoundedNumbers", () => {
  test("rounds nested numbers and keeps everything else", () => {
    const value = { speed: 1.23456, accuracy: null, source: "VPS", nested: { degrees: 89.996 } };

    expect(jsonWithRoundedNumbers(value, 2)).toBe(
      '{"speed":1.23,"accuracy":null,"source":"VPS","nested":{"degrees":90}}',
    );
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
