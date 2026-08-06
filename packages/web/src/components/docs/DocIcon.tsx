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
import type { IconName } from "@/lib/docs-types";

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

/** Resolves a doc's `icon` name to a component, so content files stay data-only. */
export function DocIcon({ name, className }: { name: IconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} />;
}
