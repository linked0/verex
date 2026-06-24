import Link from "next/link";

export function CategoryTabs({ categories, active }: { categories: string[]; active: string }) {
  return (
    <nav className="tabs">
      {categories.map((c) => {
        const href = c === "All" ? "/" : `/?category=${encodeURIComponent(c)}`;
        return (
          <Link key={c} href={href} className={`tab${c === active ? " active" : ""}`}>
            {c}
          </Link>
        );
      })}
    </nav>
  );
}
