import { Locale, useLocales } from "expo-localization";
import { en } from "@/src/i18n/en";
import { de } from "@/src/i18n/de";

export type Translations = typeof en;

const translationsOf = { en, de } satisfies Record<string, Translations>;

export type Language = keyof typeof translationsOf;

const fallbackLanguage: Language = "en";

function isSupportedLanguage(languageCode: string | null): languageCode is Language {
  return languageCode !== null && Object.hasOwn(translationsOf, languageCode);
}

/// The device lists all languages the user speaks by preference, so someone who prefers an unsupported language
/// still gets the next one they understand instead of the fallback.
export function preferredLanguageOf(locales: Pick<Locale, "languageCode">[]): Language {
  return locales.map((locale) => locale.languageCode).find(isSupportedLanguage) ?? fallbackLanguage;
}

/// Follows the device language, and on Android 13+ and iOS also the language chosen for this app in the system
/// settings. Rerenders when the user switches it while the app is running.
export function useLanguage(): Language {
  return preferredLanguageOf(useLocales());
}

export function useTranslations(): Translations {
  return translationsOf[useLanguage()];
}
