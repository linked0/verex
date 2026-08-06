import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { translator } from "@/lib/i18n";
import { DOCS } from "@/lib/docs";

/**
 * Prev / next footer, the other half of the RTD reading model: the sidebar is
 * for jumping, this is for reading straight through. Order comes from `DOCS`,
 * which is already maintained as the intended reading order.
 */
export function DocsPager({ locale, slug }: { locale: Locale; slug: string }) {
  const t = translator(locale);
  const i = DOCS.findIndex((d) => d.slug === slug);
  const prev = i > 0 ? DOCS[i - 1] : undefined;
  const next = i >= 0 && i < DOCS.length - 1 ? DOCS[i + 1] : undefined;

  if (!prev && !next) return null;

  return (
    <nav className="mt-12 flex items-stretch justify-between gap-4 border-t pt-6">
      {prev ? (
        <Link
          href={`/docs/${prev.slug}`}
          className="group flex max-w-[48%] flex-col gap-0.5 text-left"
        >
          <span className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
            <ArrowLeft className="h-3 w-3" />
            {t("docs.previous")}
          </span>
          <span className="text-sm font-medium group-hover:text-primary">
            {prev.content[locale].title}
          </span>
        </Link>
      ) : (
        <span />
      )}

      {next && (
        <Link
          href={`/docs/${next.slug}`}
          className="group flex max-w-[48%] flex-col items-end gap-0.5 text-right"
        >
          <span className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
            {t("docs.next")}
            <ArrowRight className="h-3 w-3" />
          </span>
          <span className="text-sm font-medium group-hover:text-primary">
            {next.content[locale].title}
          </span>
        </Link>
      )}
    </nav>
  );
}
