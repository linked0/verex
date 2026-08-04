// Server-component half of i18n. Kept in its own module because it imports
// next/headers, which would poison any client component that pulled it in.
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, translator, type Locale, type Translate } from "@/lib/i18n";

export function getLocale(): Locale {
  const v = cookies().get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

export function getT(): Translate {
  return translator(getLocale());
}
