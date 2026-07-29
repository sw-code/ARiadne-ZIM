import { validVpsHeadingOrNull, VpsHeading } from "@/src/3d/vpsHeading";

const headingMeasuredAt100: VpsHeading = { worldNorthDegrees: 30, yawAccuracyDegrees: 2, measuredAtSeconds: 100 };

describe("validVpsHeadingOrNull", () => {
  test("keeps a VPS heading for a minute after it was measured", () => {
    expect(validVpsHeadingOrNull(headingMeasuredAt100, 159)).toBe(headingMeasuredAt100);
  });

  test("drops a VPS heading older than a minute, so the compass takes over", () => {
    expect(validVpsHeadingOrNull(headingMeasuredAt100, 161)).toBeNull();
  });
});
