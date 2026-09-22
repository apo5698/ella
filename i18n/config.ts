export const DEFAULT_LOCALE = "en";
export const LOCALES = ["en", "zh-CN"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "locale";

export function isAppLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" && LOCALES.some((locale) => locale === value)
  );
}
