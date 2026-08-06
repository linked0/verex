/**
 * The Verex mark: a circle quartered into two opposing pairs — the two sides of
 * a binary market, held inside one ring.
 *
 * Fills come from the design tokens rather than fixed hex, so the mark tracks
 * the theme and stays in step with the Yes/No colours used on every trade panel.
 * (`app/icon.svg` is the same shape with literal colours, because a favicon has
 * no access to CSS variables.)
 */
export function VerexMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <circle
        cx="20"
        cy="20"
        r="17"
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="3.5"
      />
      <path d="M20 5 A15 15 0 0 1 35 20 L20 20 Z" fill="hsl(var(--yes))" />
      <path d="M20 35 A15 15 0 0 1 5 20 L20 20 Z" fill="hsl(var(--yes))" />
      <path d="M5 20 A15 15 0 0 1 20 5 L20 20 Z" fill="hsl(var(--no))" />
      <path d="M35 20 A15 15 0 0 1 20 35 L20 20 Z" fill="hsl(var(--no))" />
    </svg>
  );
}
