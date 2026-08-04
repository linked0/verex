import Image from "next/image";
import * as React from "react";
import type { Block, Section } from "@/lib/docs-types";

// Inline markup, deliberately tiny: **bold**, `code`, *emphasis*. A full
// markdown parser would be a dependency and a sanitisation surface for text
// that only ever comes from this repo.
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;

function inline(text: string): React.ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function BlockView({ block }: { block: Block }) {
  if ("p" in block) return <p className="leading-relaxed">{inline(block.p)}</p>;

  if ("ul" in block) {
    return (
      <ul className="list-disc space-y-1.5 pl-5 leading-relaxed">
        {block.ul.map((li, i) => (
          <li key={i}>{inline(li)}</li>
        ))}
      </ul>
    );
  }

  if ("ol" in block) {
    return (
      <ol className="list-decimal space-y-1.5 pl-5 leading-relaxed">
        {block.ol.map((li, i) => (
          <li key={i}>{inline(li)}</li>
        ))}
      </ol>
    );
  }

  if ("code" in block) {
    return (
      <pre className="overflow-x-auto rounded-lg border bg-muted/60 p-3 font-mono text-xs text-foreground">
        <code>{block.code}</code>
      </pre>
    );
  }

  if ("note" in block) {
    return (
      <div className="rounded-lg border border-primary/25 bg-accent/60 p-3 text-sm text-accent-foreground">
        {inline(block.note)}
      </div>
    );
  }

  if ("img" in block) {
    return (
      <div className="overflow-hidden rounded-lg border">
        <Image
          src={block.img.src}
          alt={block.img.alt}
          width={1280}
          height={800}
          className="h-auto w-full"
          unoptimized
        />
      </div>
    );
  }

  // Tables carry their own scroll container — the page body must never scroll
  // sideways on a narrow screen.
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            {block.table.head.map((h, i) => (
              <th key={i} className="px-3 py-2 font-semibold text-foreground">
                {inline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.table.rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0 align-top">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2">
                  {inline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DocBody({ sections }: { sections: Section[] }) {
  return (
    <div className="space-y-10">
      {sections.map((s) => (
        // scroll-mt keeps the heading clear of the sticky header when jumped to.
        <section key={s.id} id={s.id} className="scroll-mt-20 space-y-3">
          <h2 className="text-xl font-bold text-foreground">{s.heading}</h2>
          <div className="space-y-3 text-sm text-muted-foreground">
            {s.blocks.map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
