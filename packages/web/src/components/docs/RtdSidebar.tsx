import Link from "next/link";
import type { Section } from "@/lib/docs-types";
import type { Locale } from "@/lib/i18n";
import { translator } from "@/lib/i18n";
import { DOCS } from "@/lib/docs";
import { RtdNav, type NavItem } from "@/components/docs/RtdNav";

/**
 * Read-the-Docs sidebar: a dark, full-height rail on the LEFT, with the project
 * name, a filter box, and the whole table of contents.
 *
 * The dark palette is deliberately fixed rather than theme-driven. It is the
 * single most recognisable thing about the RTD look — a light-mode version reads
 * as "some sidebar", not as documentation — and it stays legible under both
 * themes because the content column, which does follow the theme, sits beside it
 * rather than behind it.
 */
export function RtdSidebar({
  locale,
  activeSlug,
  sections,
}: {
  locale: Locale;
  activeSlug?: string;
  sections?: Section[];
}) {
  const t = translator(locale);

  // Only these three fields cross into the client bundle.
  const items: NavItem[] = DOCS.map((d) => ({
    slug: d.slug,
    title: d.content[locale].title,
    group: d.group,
  }));

  return (
    <aside className="hidden shrink-0 lg:block lg:w-[300px]">
      <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto bg-[#343131]">
        <div className="bg-[#2980b9] px-4 py-4">
          <Link href="/docs" className="block">
            <span className="block text-lg font-bold leading-none text-white">Verex</span>
            <span className="mt-1 block text-xs text-white/70">{t("docs.title")}</span>
          </Link>
        </div>

        <RtdNav
          items={items}
          activeSlug={activeSlug}
          sections={sections}
          groupLabels={{
            guide: t("docs.group.guide"),
            technical: t("docs.group.technical"),
          }}
          searchPlaceholder={t("docs.searchPlaceholder")}
          noResults={t("docs.noResults")}
        />
      </div>
    </aside>
  );
}
