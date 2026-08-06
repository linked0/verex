import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { DocBody } from "@/components/docs/DocBody";
import { DocIcon } from "@/components/docs/DocIcon";
import { DocsPager } from "@/components/docs/DocsPager";
import { RtdSidebar } from "@/components/docs/RtdSidebar";
import { VerexMark } from "@/components/VerexMark";
import { getDoc } from "@/lib/docs";
import { getLocale, getT } from "@/lib/i18n-server";

// The locale comes from a cookie, so every docs page is request-rendered;
// prerendering slugs here would only produce output that is thrown away.
export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { slug: string } }) {
  const doc = getDoc(params.slug);
  // Metadata is rendered per-request anyway, so use the reader's locale.
  return { title: doc ? `${doc.content[getLocale()].title} — Verex` : "Docs — Verex" };
}

export default function DocPage({ params }: { params: { slug: string } }) {
  const doc = getDoc(params.slug);
  if (!doc) notFound();

  const locale = getLocale();
  const t = getT();
  const c = doc.content[locale];

  return (
    <div className="flex">
      <RtdSidebar locale={locale} activeSlug={doc.slug} sections={c.sections} />

      <main className="min-w-0 flex-1">
        {/* Breadcrumb rail — RTD puts the trail above a hairline, separate from
            the article, so the H1 still reads as the page's first element. */}
        <div className="border-b px-6 py-3 lg:px-10">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/docs" className="hover:text-foreground">
              {t("docs.title")}
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground">{c.title}</span>
          </nav>
        </div>

        <article className="max-w-3xl px-6 py-8 lg:px-10">
          {doc.hero === "mark" ? (
            // A document *about* the identity leads with the mark itself rather
            // than a generic section icon.
            <div className="mb-6">
              <VerexMark className="h-16 w-16" />
            </div>
          ) : null}

          <h1 className="flex items-start gap-2.5 text-3xl font-bold">
            {doc.hero === "mark" ? null : (
              <DocIcon name={doc.icon} className="mt-1.5 h-6 w-6 shrink-0 text-primary" />
            )}
            {c.title}
          </h1>
          <p className="mt-3 leading-relaxed text-muted-foreground">{c.lead}</p>

          <div className="mt-8">
            <DocBody sections={c.sections} />
          </div>

          <DocsPager locale={locale} slug={doc.slug} />
        </article>
      </main>
    </div>
  );
}
