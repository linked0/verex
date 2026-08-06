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
 * The RTD *structure* is what we borrow — dark left rail, the current page's
 * headings nested inside its own entry. The RTD *palette* is not: its warm grey
 * (#343131) and cyan-blue (#2980b9) both fight this app, whose greys are all on
 * hue 240 and whose primary is indigo. So the rail is a cool dark from the same
 * family and the header block is `--primary`.
 *
 * Kept dark under both themes on purpose. A light-mode version of this rail
 * reads as "some sidebar" rather than as documentation, and it stays legible
 * either way because the content column — which does follow the theme — sits
 * beside it rather than behind it.
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
      {/* Fixed height, not max-height: the rail has to reach the bottom of the
          viewport even on a short document, or the dark block stops mid-page. */}
      <div className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto bg-[hsl(240_10%_13%)]">
        <div className="bg-primary px-4 py-4">
          <Link href="/docs" className="block">
            <span className="block text-lg font-bold leading-none text-primary-foreground">
              Verex
            </span>
            <span className="mt-1 block text-xs text-primary-foreground/75">{t("docs.title")}</span>
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
