"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/LocaleProvider";
import { useTheme } from "@/components/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { t } = useLocale();
  const dark = theme === "dark";
  const label = dark ? t("nav.themeToLight") : t("nav.themeToDark");

  return (
    <Button variant="ghost" size="icon" onClick={toggle} title={label} aria-label={label}>
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
