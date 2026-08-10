"use client";

// Two locales only, so this is a straight toggle rather than a dropdown — one
// click, and the button shows the language you'd switch *to*.
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/LocaleProvider";
import { LOCALE_LABEL } from "@/lib/i18n";

export function LocaleToggle() {
  const { locale, setLocale, t } = useLocale();
  const next = locale === "en" ? "ko" : "en";

  return (
    <Button
      variant="ghost"
      size="sm"
      className="px-2"
      onClick={() => setLocale(next)}
      title={t("nav.language")}
      aria-label={`${t("nav.language")} — ${LOCALE_LABEL[next]}`}
    >
      <Languages className="h-4 w-4 shrink-0" />
      <span className="hidden text-xs font-semibold sm:inline">{LOCALE_LABEL[next]}</span>
    </Button>
  );
}
