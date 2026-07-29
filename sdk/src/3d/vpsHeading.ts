// AR tracking keeps a heading measured by VPS valid long after VPS dropped out,
// while compass headings are often tens of degrees off near buildings and cars.
const vpsHeadingValidSeconds = 60;

export type VpsHeading = {
  worldNorthDegrees: number;
  yawAccuracyDegrees: number | null;
  measuredAtSeconds: number;
};

export function validVpsHeadingOrNull(heading: VpsHeading | null, nowSeconds: number): VpsHeading | null {
  if (heading === null || nowSeconds - heading.measuredAtSeconds > vpsHeadingValidSeconds) return null;
  return heading;
}
