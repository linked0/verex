import Link from "next/link";
import { cn } from "@/lib/utils";
import type { MessageKey, Translate } from "@/lib/i18n";

// A category string is both the API filter value and the label on screen. Only
// the label is translated — the value in the URL (and therefore the API query)
// stays the canonical English string, so links keep working in either locale.
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
    <nav aria-label={t("home.categoriesLabel")} className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto py-1">
      {categories.map((c) => {
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
