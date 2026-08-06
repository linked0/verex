"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { DocGroup, Section } from "@/lib/docs-types";
import { cn } from "@/lib/utils";

export type NavItem = {
  slug: string;
  title: string;
  group: DocGroup;
};

/**
 * The nav tree inside the Read-the-Docs sidebar.
 *
 * Client-side for two reasons that both need browser state: the filter box, and
 * the scroll-spy that moves the highlight down the current document's anchors as
 * you read. Only {slug, title, group} crosses the boundary — the documents
 * themselves stay on the server rather than shipping every locale's prose in the
 * client bundle.
 */
export function RtdNav({
  items,
  activeSlug,
  sections,
  groups: allGroups,
  groupLabels,
  searchPlaceholder,
  noResults,
}: {
  items: NavItem[];
  activeSlug?: string;
  sections?: Section[];
  groups: DocGroup[];
  groupLabels: Record<DocGroup, string>;
  searchPlaceholder: string;
  noResults: string;
}) {
  const [query, setQuery] = React.useState("");
  const [currentId, setCurrentId] = React.useState<string>();

  // Scroll-spy. `rootMargin` pins the trigger line near the top of the viewport
  // so a heading counts as "current" once it reaches the header, not when it
  // first peeks in at the bottom.
  React.useEffect(() => {
    if (!sections?.length) return;
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = sections.find((s) => seen.get(s.id));
        if (first) setCurrentId(first.id);
      },
      { rootMargin: "-72px 0px -70% 0px", threshold: 0 },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  const q = query.trim().toLowerCase();
  const matches = q ? items.filter((i) => i.title.toLowerCase().includes(q)) : items;
  // Groups come from the caller in display order; a group with nothing left
  // after filtering disappears rather than showing an empty caption.
  const groups = allGroups.filter((g) => matches.some((i) => i.group === g));

  return (
    <>
      <div className="relative px-4 py-4">
        <Search className="pointer-events-none absolute left-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="w-full rounded-md border bg-background py-1.5 pl-8 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </div>

      <nav className="pb-10">
        {groups.length === 0 && (
          <p className="px-4 py-2 text-sm text-muted-foreground">{noResults}</p>
        )}

        {groups.map((group) => (
          <div key={group} className="mb-2">
            {/* Deliberately the largest type in the rail. A group caption sits
                above the documents it contains, so it has to out-weigh even the
                active document's entry — otherwise the highlight reads as the
                top of the hierarchy and the caption as a label under it. */}
            <p className="px-4 pb-1.5 pt-4 text-sm font-bold uppercase tracking-wide text-foreground">
              {groupLabels[group]}
            </p>
            <ul>
              {matches
                .filter((i) => i.group === group)
                .map((item) => {
                  const active = item.slug === activeSlug;
                  return (
                    <li key={item.slug}>
                      <Link
                        href={`/docs/${item.slug}`}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "block border-l-2 py-1.5 pl-4 pr-3 text-[0.8125rem] leading-snug transition-colors",
                          active
                            ? "border-l-primary bg-accent font-semibold text-accent-foreground"
                            : "border-l-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                        )}
                      >
                        {item.title}
                      </Link>

                      {/* The current document expands in place, the way RTD
                          nests a page's contents under its own entry. */}
                      {active && sections && sections.length > 0 && (
                        <ul className="border-y bg-background/60 py-1">
                          {sections.map((s) => (
                            <li key={s.id}>
                              <a
                                href={`#${s.id}`}
                                className={cn(
                                  "block border-l-2 py-1 pl-8 pr-3 text-xs leading-snug transition-colors",
                                  currentId === s.id
                                    ? "border-l-primary font-medium text-primary"
                                    : "border-l-transparent text-muted-foreground hover:text-foreground",
                                )}
                              >
                                {s.heading}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
