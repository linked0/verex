import Link from "next/link";
import {
  BookText,
  Coins,
  Droplets,
  LineChart,
  ListTree,
  PlusCircle,
  Scale,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import type { IconName, Section } from "@/lib/docs-types";
import type { Locale } from "@/lib/i18n";
import { translator } from "@/lib/i18n";
import { DOC_GROUPS, docsInGroup } from "@/lib/docs";
import { cn } from "@/lib/utils";

const ICONS: Record<IconName, typeof BookText> = {
  book: BookText,
  droplets: Droplets,
  chart: LineChart,
  tree: ListTree,
  shield: ShieldCheck,
  wallet: Wallet,
  plus: PlusCircle,
  coins: Coins,
  scale: Scale,
};

export function DocIcon({ name, className }: { name: IconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} />;
}

/**
 * Right-hand panel: the full list of documents, so any doc is one click from any
 * other, plus the current doc's section anchors. Sticky, and hidden below `lg`
 * where there is no room for a second column.
 */
export function DocsSidebar({
  locale,
  activeSlug,
  sections,
}: {
  locale: Locale;
  activeSlug?: string;
  sections?: Section[];
}) {
  const t = translator(locale);

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-20 space-y-6">
        <nav className="rounded-lg border bg-card p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("docs.allDocs")}
          </p>
          <div className="space-y-4">
            {DOC_GROUPS.map((group) => (
              <div key={group}>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {t(group === "guide" ? "docs.group.guide" : "docs.group.technical")}
                </p>
                <ul className="space-y-0.5">
                  {docsInGroup(group).map((doc) => {
                    const active = doc.slug === activeSlug;
                    return (
                      <li key={doc.slug}>
                        <Link
                          href={`/docs/${doc.slug}`}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm leading-snug transition-colors",
                            active
                              ? "bg-accent font-medium text-accent-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <DocIcon
                            name={doc.icon}
                            className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", active && "text-primary")}
                          />
                          {doc.content[locale].title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {sections && sections.length > 0 && (
          <nav className="rounded-lg border bg-card p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("docs.onThisPage")}
            </p>
            <ul className="space-y-1">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="block text-sm leading-snug text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                  >
                    {s.heading}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </aside>
  );
}
