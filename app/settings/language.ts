"use server";

import { cookies } from "next/headers";
import { isAppLocale, LOCALE_COOKIE } from "@/i18n/config";

export async function setLanguage(locale: string): Promise<boolean> {
  if (!isAppLocale(locale)) return false;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
  return true;
}
