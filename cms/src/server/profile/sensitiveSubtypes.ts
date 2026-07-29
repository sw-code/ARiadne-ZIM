export const sensitiveCategory = "healthcare";

// Health and religion are special categories of personal data (GDPR Art. 9): interest in these places reveals
// more about a person than the app may collect, so they are never counted, reported or profiled.
const sensitiveSubtypes: ReadonlySet<string> = new Set([
  "hospital",
  "clinic",
  "doctors",
  "dentist",
  "pharmacy",
  "physiotherapist",
  "psychotherapist",
  "rehabilitation",
  "alternative",
  "laboratory",
  "place_of_worship",
]);

export function isSensitiveSubtype(subtype: string): boolean {
  return sensitiveSubtypes.has(subtype);
}

export function isSensitive({ category, subtype }: { category: string; subtype: string }): boolean {
  return category === sensitiveCategory || isSensitiveSubtype(subtype);
}
