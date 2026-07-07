import Link from "next/link";
import { cn } from "@/lib/utils";

// Horizontal category nav (link-based so the home page stays a server
// component; active state comes from the URL).
export function CategoryTabs({
  categories,
  active,
}: {
  categories: string[];
  active: string;
}) {
  return (
    <nav className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto py-1">
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
            {c}
          </Link>
        );
      })}
    </nav>
  );
}
