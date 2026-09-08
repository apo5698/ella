import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const DEFAULT_LOCALE = "zh-CN";
export const LOCALES = [DEFAULT_LOCALE] as const;
export type AppLocale = (typeof LOCALES)[number];

export default getRequestConfig(async () => {
  const store = await cookies();
  const requested = store.get("locale")?.value;
  const locale: AppLocale =
    requested === DEFAULT_LOCALE ? requested : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
