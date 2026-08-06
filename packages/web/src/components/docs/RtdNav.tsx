"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { Section } from "@/lib/docs-types";
import { cn } from "@/lib/utils";

export type NavItem = {
  slug: string;
  title: string;
  group: "guide" | "technical";
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
  groupLabels,
  searchPlaceholder,
  noResults,
}: {
  items: NavItem[];
  activeSlug?: string;
  sections?: Section[];
  groupLabels: Record<"guide" | "technical", string>;
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
  const groups = (["guide", "technical"] as const).filter((g) =>
    matches.some((i) => i.group === g),
  );

  return (
    <>
      <div className="relative px-4 pb-4">
        <Search className="pointer-events-none absolute left-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/50" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="w-full rounded border border-white/15 bg-white/10 py-1.5 pl-8 pr-2 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
        />
      </div>

      <nav className="pb-10">
        {groups.length === 0 && <p className="px-4 py-2 text-sm text-white/50">{noResults}</p>}

        {groups.map((group) => (
          <div key={group} className="mb-2">
            <p className="px-4 py-2 text-[0.7rem] font-bold uppercase tracking-wider text-white/45">
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
                          "block border-l-4 py-1.5 pl-4 pr-3 text-sm leading-snug transition-colors",
                          active
                            ? "border-l-primary bg-[hsl(240_9%_21%)] font-semibold text-white"
                            : "border-l-transparent text-white/70 hover:bg-white/5 hover:text-white",
                        )}
                      >
                        {item.title}
                      </Link>

                      {/* The current document expands in place, the way RTD
                          nests a page's contents under its own entry. */}
                      {active && sections && sections.length > 0 && (
                        <ul className="bg-[hsl(240_11%_9%)] py-1">
                          {sections.map((s) => (
                            <li key={s.id}>
                              <a
                                href={`#${s.id}`}
                                className={cn(
                                  "block border-l-4 py-1 pl-8 pr-3 text-[0.8rem] leading-snug transition-colors",
                                  currentId === s.id
                                    ? "border-l-primary bg-[hsl(240_9%_18%)] text-white"
                                    : "border-l-transparent text-white/55 hover:text-white",
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
