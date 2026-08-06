import Link from "next/link";
import type { Section } from "@/lib/docs-types";
import type { Locale } from "@/lib/i18n";
import { translator } from "@/lib/i18n";
import { DOCS, DOC_GROUPS } from "@/lib/docs";
import { RtdNav, type NavItem } from "@/components/docs/RtdNav";

/**
 * Docs sidebar: a full-height rail on the LEFT with the project name, a filter
 * box, and the whole table of contents.
 *
 * What is borrowed from Read the Docs is the *structure* only — the contents
 * live on the left and stay put, and the current page's headings nest inside its
 * own entry rather than in a second panel. Every colour here is one of the app's
 * own tokens (`--card`, `--muted`, `--accent`, `--primary`), so the rail follows
 * the theme toggle like the rest of the site. No fixed hex values: a hard-coded
 * dark rail would be legible in one theme and wrong in the other, and it would
 * quietly become a second palette to maintain.
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
    <aside className="hidden shrink-0 border-r lg:block lg:w-[300px]">
      {/* Fixed height, not max-height: the rail has to reach the bottom of the
          viewport even on a short document, or the tinted block stops mid-page. */}
      <div className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto bg-muted/40">
        <div className="border-b px-4 py-4">
          <Link href="/docs" className="block">
            <span className="block text-lg font-bold leading-none text-foreground">Verex</span>
            <span className="mt-1 block text-xs text-muted-foreground">{t("docs.title")}</span>
          </Link>
        </div>

        <RtdNav
          items={items}
          activeSlug={activeSlug}
          sections={sections}
          groups={DOC_GROUPS}
          groupLabels={{
            guide: t("docs.group.guide"),
            technical: t("docs.group.technical"),
            about: t("docs.group.about"),
          }}
          searchPlaceholder={t("docs.searchPlaceholder")}
          noResults={t("docs.noResults")}
        />
      </div>
    </aside>
  );
}
