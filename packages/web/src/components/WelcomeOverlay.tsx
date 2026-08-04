"use client";

// First-visit onboarding overlay: explains the demo-wallet / operator-wallet
// split once, then never again (localStorage flag). Rendered in the root
// layout so deep links get it too, not just the homepage.
import * as React from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/LocaleProvider";

const SEEN_KEY = "verex-welcome-seen";

export function WelcomeOverlay() {
  const { t } = useLocale();
  const [show, setShow] = React.useState(false);

  // localStorage is browser-only — decide visibility after mount.
  React.useEffect(() => {
    if (!localStorage.getItem(SEEN_KEY)) setShow(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem(SEEN_KEY, "1");
    setShow(false);
  };

  if (!show) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={dismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("welcome.title")}
        className="w-full max-w-md rounded-lg border bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Info className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">{t("welcome.title")}</h2>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {t("welcome.bodyPre")}
          <span className="font-medium text-foreground">{t("welcome.bodyTrade")}</span>
          {t("welcome.bodyAnd")}
          <span className="font-medium text-foreground">{t("welcome.bodyResolve")}</span>
          {t("welcome.bodyPost")}
        </p>
        <Button className="mt-5 w-full" onClick={dismiss}>
          {t("welcome.cta")}
        </Button>
      </div>
    </div>
  );
}
