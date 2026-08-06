import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { Section } from "@/lib/docs-types";
import type { Locale } from "@/lib/i18n";
import { translator } from "@/lib/i18n";
import { DOCS, DOC_GROUPS } from "@/lib/docs";
import { RtdNav, type NavItem } from "@/components/docs/RtdNav";

/** Where the source lives. Not in an env var — it is a public constant, and a
 *  docs link that can be misconfigured per-environment is worse than a literal. */
const REPO_URL = "https://github.com/linked0/verex";

/** lucide-react dropped its brand icons, so the GitHub glyph is inlined. */
function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

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
      {/* Fixed height + a flex column, so the nav scrolls on its own and the
          source link stays pinned to the bottom of the viewport rather than
          floating wherever the list happens to end. */}
      <div className="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col bg-muted/40">
        <div className="border-b px-4 py-4">
          <Link href="/docs" className="block">
            <span className="block text-lg font-bold leading-none text-foreground">Verex</span>
            <span className="mt-1 block text-xs text-muted-foreground">{t("docs.title")}</span>
          </Link>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
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

        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-2 border-t px-4 py-3 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <GithubMark className="h-4 w-4 shrink-0" />
          <span className="truncate">{t("docs.source")}</span>
          <ExternalLink className="ml-auto h-3 w-3 shrink-0 opacity-60" />
        </a>
      </div>
    </aside>
  );
}
