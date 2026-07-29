import { hexColorToRgba } from "@/src/shared/ColorExtensions";

describe("hexColorToRgba", () => {
  test("converts #RRGGBBAA, with the alpha byte as a fraction of 255", () => {
    expect(hexColorToRgba("#000000FF")).toBe("rgba(0, 0, 0, 1)");
    expect(hexColorToRgba("#7A7A85FF")).toBe("rgba(122, 122, 133, 1)");
    expect(hexColorToRgba("#28234273")).toBe("rgba(40, 35, 66, 0.451)");
  });

  test("converts #RRGGBB as opaque, in either case", () => {
    expect(hexColorToRgba("#B80000")).toBe("rgba(184, 0, 0, 1)");
    expect(hexColorToRgba("#e30000")).toBe("rgba(227, 0, 0, 1)");
  });

  test("rejects anything that is not a 6 or 8 digit hex colour", () => {
    expect(() => hexColorToRgba("rgb(96,0,0)")).toThrow();
    expect(() => hexColorToRgba("#FFF")).toThrow();
  });
});
