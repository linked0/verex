import { cn } from "@/lib/utils";

/// Placeholder for content that is still loading. Shaped like the thing it
/// replaces, so the layout doesn't jump when real data arrives — and, unlike a
/// spinner, it never implies the previous value is still valid.
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} aria-hidden />;
}
