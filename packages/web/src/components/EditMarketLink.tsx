"use client";

// Pencil "Edit" link on the market detail page. Editing is operator-only,
// and the active wallet lives in client state — so the link is a client
// component that hides itself for everyone else.
import Link from "next/link";
import { Pencil } from "lucide-react";
import { useWallet } from "@/components/WalletProvider";

export function EditMarketLink({ slug, group = false }: { slug: string; group?: boolean }) {
  const { isAdmin } = useWallet();
  if (!isAdmin) return null;
  return (
    <Link
      href={group ? `/create?editGroup=${slug}` : `/create?edit=${slug}`}
      className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <Pencil className="h-3.5 w-3.5" /> Edit
    </Link>
  );
}
