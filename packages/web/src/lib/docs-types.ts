// Docs are stored as **data**, not JSX, for one reason: every document exists in
// both English and Korean, and duplicating JSX trees would double the markup as
// well as the prose. With a block model only the text is duplicated, and the
// renderer (components/docs/DocBody.tsx) stays the single place that decides how
// a paragraph or a table looks.
import type { Locale } from "@/lib/i18n";

/** Inline markup allowed in `p`/`li`/cell text: `**bold**` and `` `code` ``. */
export type Block =
  | { p: string }
  | { ul: string[] }
  | { ol: string[] }
  | { code: string }
  /** Callout — used for caveats and "this is not built yet" notes. */
  | { note: string }
  | { table: { head: string[]; rows: string[][] } }
  | { img: { src: string; alt: string } };

export type Section = {
  /** Anchor id — shared across locales so a link survives a language switch. */
  id: string;
  heading: string;
  blocks: Block[];
};

export type DocContent = {
  title: string;
  /** One line, shown on the docs index card and in the right-hand list. */
  summary: string;
  /** Intro paragraph under the H1. */
  lead: string;
  sections: Section[];
};

export type DocGroup = "guide" | "technical" | "about";

export type IconName = "book" | "droplets" | "chart" | "tree" | "shield" | "wallet" | "plus" | "coins" | "scale";

export type Doc = {
  slug: string;
  group: DocGroup;
  icon: IconName;
  /** Opt-in page header. `"mark"` renders the Verex logo above the title. */
  hero?: "mark";
  content: Record<Locale, DocContent>;
};
