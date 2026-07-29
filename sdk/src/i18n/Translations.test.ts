import { preferredLanguageOf } from "@/src/i18n/Translations";

const localesOf = (...languageCodes: (string | null)[]) => languageCodes.map((languageCode) => ({ languageCode }));

describe("preferredLanguageOf", () => {
  test("picks German on a German device", () => {
    expect(preferredLanguageOf(localesOf("de"))).toBe("de");
  });

  test("skips unsupported languages in favour of the next preferred one", () => {
    expect(preferredLanguageOf(localesOf("fr", "de", "en"))).toBe("de");
  });

  test("falls back to English when no preferred language is supported", () => {
    expect(preferredLanguageOf(localesOf("fr", null))).toBe("en");
  });
});
