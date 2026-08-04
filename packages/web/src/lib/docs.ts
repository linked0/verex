import type { Doc, DocGroup } from "@/lib/docs-types";
import { howTo } from "@/content/docs/how-to";
import { liquidity } from "@/content/docs/liquidity";
import { oracle } from "@/content/docs/oracle";
import { overview } from "@/content/docs/overview";
import { settlement } from "@/content/docs/settlement";

/** Display order — this is the reading order the right-hand panel presents. */
export const DOCS: Doc[] = [howTo, overview, liquidity, oracle, settlement];

export const DOC_GROUPS: DocGroup[] = ["guide", "technical"];

export function getDoc(slug: string): Doc | undefined {
  return DOCS.find((d) => d.slug === slug);
}

export function docsInGroup(group: DocGroup): Doc[] {
  return DOCS.filter((d) => d.group === group);
}
