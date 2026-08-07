"use client";

// Compact order-book depth widget: top bid/ask levels for one outcome,
// size bars scaled to the deepest visible level. Polls every 5s.

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cents, getBookSnapshot, type BookSnapshot } from "@/lib/api";

const LEVELS = 5;

export function BookPanel({ slug, outcome }: { slug: string; outcome: string }) {
  const [book, setBook] = React.useState<BookSnapshot | null>(null);

  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      const b = await getBookSnapshot(slug, outcome);
      if (alive) setBook(b);
    };
    load();
    const t = setInterval(load, 5_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [slug, outcome]);

  const bids = book?.bids.slice(0, LEVELS) ?? [];
  const asks = book?.asks.slice(0, LEVELS) ?? [];
  const maxSize = Math.max(1, ...bids.map((l) => l.size), ...asks.map((l) => l.size));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between">
          <CardTitle className="text-base">Order book · {outcome}</CardTitle>
          {book?.mid != null && (
            <span className="text-xs text-muted-foreground">mid {cents(book.mid)}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-0.5 text-xs">
        {asks.length === 0 && bids.length === 0 && (
          <p className="py-2 text-center text-muted-foreground">No open orders.</p>
        )}
        {[...asks].reverse().map((l) => (
          <div key={`a${l.price}`} className="relative flex items-center justify-between px-1 py-0.5">
            <div
              className="absolute inset-y-0 right-0 rounded-sm bg-no/10"
              style={{ width: `${(l.size / maxSize) * 100}%` }}
            />
            <span className="relative font-medium text-no">{cents(l.price)}</span>
            <span className="relative tabular-nums text-muted-foreground">{l.size.toLocaleString()}</span>
          </div>
        ))}
        {book?.mid != null && (asks.length > 0 || bids.length > 0) && (
          <div className="border-y py-0.5 text-center font-semibold tabular-nums text-foreground">
            {cents(book.mid)}
          </div>
        )}
        {bids.map((l) => (
          <div key={`b${l.price}`} className="relative flex items-center justify-between px-1 py-0.5">
            <div
              className="absolute inset-y-0 right-0 rounded-sm bg-yes/10"
              style={{ width: `${(l.size / maxSize) * 100}%` }}
            />
            <span className="relative font-medium text-yes">{cents(l.price)}</span>
            <span className="relative tabular-nums text-muted-foreground">{l.size.toLocaleString()}</span>
          </div>
        ))}

        {/* The levels vanishing after a trade is the single most misread thing
            about this book: it looks like a plain CLOB, where an unfilled order
            persists until its owner cancels it. The operator's rungs are quotes,
            not orders — replaced wholesale on every fill. Say so here rather than
            leaving people to infer it from a book that keeps changing shape. */}
        <p className="mt-2 border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">
          Prices here come from{" "}
          <Link
            href="/docs/hybrid-amm-clob#does-the-book-change"
            className="underline underline-offset-2 hover:text-foreground"
          >
            LMSR
          </Link>
          : after each trade the operator cancels its entire ladder and re-posts it
          around a new centre, so its levels move rather than persist. Your own
          resting orders are never cancelled.
        </p>
      </CardContent>
    </Card>
  );
}
