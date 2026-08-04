import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocIcon, DocsSidebar } from "@/components/docs/DocsSidebar";
import { DOC_GROUPS, docsInGroup } from "@/lib/docs";
import { getLocale, getT } from "@/lib/i18n-server";

export const metadata = { title: "Docs — Verex" };

export default function DocsIndexPage() {
  const locale = getLocale();
  const t = getT();

  return (
    <main className="container py-8">
      <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
        <div className="min-w-0 space-y-8">
          <div>
            <h1 className="text-3xl font-bold">{t("docs.title")}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("docs.subtitle")}</p>
          </div>

          {DOC_GROUPS.map((group) => (
            <section key={group} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t(group === "guide" ? "docs.group.guide" : "docs.group.technical")}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {docsInGroup(group).map((doc) => {
                  const c = doc.content[locale];
                  return (
                    <Link key={doc.slug} href={`/docs/${doc.slug}`} className="group">
                      <Card className="h-full transition-colors hover:border-primary/40">
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-start gap-2 text-base group-hover:text-primary">
                            <DocIcon name={doc.icon} className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            {c.title}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-muted-foreground">
                          <p className="leading-relaxed">{c.summary}</p>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                            {t("docs.readMore")}
                            <ArrowRight className="h-3 w-3" />
                          </span>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <DocsSidebar locale={locale} />
      </div>
    </main>
  );
}
