import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DocBody } from "@/components/docs/DocBody";
import { DocIcon, DocsSidebar } from "@/components/docs/DocsSidebar";
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
    <main className="container py-8">
      <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
        <article className="min-w-0 max-w-3xl space-y-8">
          <div>
            <Link
              href="/docs"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("docs.backToDocs")}
            </Link>
            <h1 className="mt-3 flex items-start gap-2.5 text-3xl font-bold">
              <DocIcon name={doc.icon} className="mt-1.5 h-6 w-6 shrink-0 text-primary" />
              {c.title}
            </h1>
            <p className="mt-3 leading-relaxed text-muted-foreground">{c.lead}</p>
          </div>

          <DocBody sections={c.sections} />
        </article>

        <DocsSidebar locale={locale} activeSlug={doc.slug} sections={c.sections} />
      </div>
    </main>
  );
}
