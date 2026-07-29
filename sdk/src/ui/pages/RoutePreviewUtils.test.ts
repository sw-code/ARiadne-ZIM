import { formatDistance } from "@/src/ui/pages/RoutePreviewUtils";

describe("formatDistance", () => {
  test("rounds short distances to whole metres", () => {
    expect(formatDistance(523.6, "en")).toBe("524 m");
  });

  test("uses the decimal separator of the language for kilometres", () => {
    expect(formatDistance(1520, "en")).toBe("1.5 km");
    expect(formatDistance(1520, "de")).toBe("1,5 km");
  });
});
