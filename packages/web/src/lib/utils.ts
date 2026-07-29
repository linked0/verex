import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/// Group-outcome palette — starts at the Verex indigo, then diverges.
/// Shared by the group chart and the group card's stacked bar so an
/// outcome keeps one color everywhere.
export const GROUP_COLORS = [
  "hsl(243 75% 55%)",
  "hsl(160 84% 35%)",
  "hsl(350 80% 55%)",
  "hsl(38 92% 50%)",
  "hsl(200 90% 45%)",
];
