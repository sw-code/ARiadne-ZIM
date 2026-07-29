import { snakeCaseToHeadingCase } from "../shared/JavascriptExtensions.ts";

// About half of the OSM places have no name, and the editors still have to be able to tell them apart from the rest.
export function placeLabel({ name, subtype }: { name: string | null; subtype: string }): string {
  return name ?? snakeCaseToHeadingCase(subtype);
}
