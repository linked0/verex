import Link from "next/link";
import { cn } from "@/lib/utils";
import type { MessageKey, Translate } from "@/lib/i18n";

// A category string is both the API filter value and the label on screen. Only
// the label is translated — the value in the URL (and therefore the API query)
// stays the canonical English string, so links keep working in either locale.
//
// Key order doubles as the tabs' display order (the API returns categories
// alphabetically — "Economics" before "Politics" — which is not the priority
// a prediction market wants). Matches the create-page dropdown.
const CATEGORY_KEYS: Record<string, MessageKey> = {
  All: "home.category.all",
  Politics: "home.category.politics",
  Sports: "home.category.sports",
  Crypto: "home.category.crypto",
  Economics: "home.category.economics",
  "Tech & Science": "home.category.techScience",
  Climate: "home.category.climate",
  Culture: "home.category.culture",
};

const CATEGORY_ORDER = Object.keys(CATEGORY_KEYS);

/** Curated order first; categories we don't know go last, alphabetically. */
export function sortCategories(categories: string[]): string[] {
  return [...categories].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

/** Display label for a category. An unknown category renders as-is. */
export function categoryLabel(category: string, t: Translate): string {
  const key = CATEGORY_KEYS[category];
  return key ? t(key) : category;
}

// Horizontal category nav (link-based so the home page stays a server
// component; active state comes from the URL).
export function CategoryTabs({
  categories,
  active,
  t,
}: {
  categories: string[];
  active: string;
  t: Translate;
}) {
  return (
    // flex-wrap, not overflow-x-auto: with the scrollbar hidden, a scrolling
    // row just looks cut off on phones ("스포…") — wrapping shows every
    // category. Desktop fits one line either way.
    <nav aria-label={t("home.categoriesLabel")} className="-mx-1 flex flex-wrap gap-1 py-1">
      {sortCategories(categories).map((c) => {
        const isActive = c === active;
        return (
          <Link
            key={c}
            href={c === "All" ? "/" : `/?category=${encodeURIComponent(c)}`}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {categoryLabel(c, t)}
          </Link>
        );
      })}
    </nav>
  );
}
