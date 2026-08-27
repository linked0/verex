"use client";

import * as React from "react";
import { Check, ChevronDown, Copy, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/components/LocaleProvider";
import { useWallet } from "@/components/WalletProvider";
import { getConfig, postFaucet, type FaucetTarget } from "@/lib/api";

// The demo faucet. Two targets, deliberately kept at different depths:
//
//  · the button itself mints to the active demo wallet — one click, unchanged,
//    because that is what it is used for ninety-nine times out of a hundred;
//  · the caret opens a panel that mints to any address (2026-08-27, jay). That
//    is how the J2 agent EOA — a wallet Verex holds no key for, so it can never
//    be the "active wallet" — gets its starting balance.
//
// The panel is also where failures surface. Before this the click swallowed
// every error and simply did nothing, which is the worst possible behaviour for
// a button whose failures are all environmental (wrong operator key, no gas, no
// chain). Any error now forces the panel open carrying the server's sentence.

const IS_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export function FaucetButton() {
  const { accountIndex, refresh, isAdmin } = useWallet();
  const { t } = useLocale();
  const [minting, setMinting] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [address, setAddress] = React.useState("");
  const [note, setNote] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [usdc, setUsdc] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);

  // Fetched when the panel first opens, not on every page load: the token
  // address is only ever read here, and the nav renders on every route.
  React.useEffect(() => {
    if (!open || usdc !== null) return;
    let live = true;
    void getConfig().then((c) => {
      if (live) setUsdc(c.usdc ?? "");
    });
    return () => {
      live = false;
    };
  }, [open, usdc]);

  const copyUsdc = async () => {
    if (!usdc) return;
    try {
      await navigator.clipboard.writeText(usdc);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard is permission-gated and absent over plain http on some
      // browsers. The address is selectable text either way, so failing here
      // costs nothing worth reporting.
    }
  };

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const mint = async (target: FaucetTarget) => {
    setMinting(true);
    setNote(null);
    const r = await postFaucet(target);
    setMinting(false);
    if ("error" in r) {
      setNote({ ok: false, text: r.error });
      setOpen(true); // an invisible failure is what sent us here in the first place
      return;
    }
    setNote({
      ok: true,
      text: t("nav.faucetMinted", { address: short(r.address), usdc: r.usdc.toFixed(2) }),
    });
    // Only the demo wallets are what the header shows a balance for; minting to
    // an outside address changes nothing this session is looking at.
    if ("accountIndex" in target) await refresh();
  };

  const onMintToAddress = () => {
    const value = address.trim();
    if (!IS_ADDRESS.test(value)) {
      setNote({ ok: false, text: t("nav.faucetBadAddress") });
      return;
    }
    void mint({ address: value });
  };

  return (
    <div ref={root} className="relative flex shrink-0 items-center">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void mint({ accountIndex })}
        disabled={minting || isAdmin}
        title={t("nav.faucetTitle")}
        aria-label={t("nav.faucet")}
        className="rounded-r-none border-r-0"
      >
        <Droplets className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden lg:inline">{minting ? t("nav.faucetMinting") : t("nav.faucet")}</span>
      </Button>
      {/* Not gated on isAdmin: minting to an outside address has nothing to do
          with which demo wallet is selected, and the operator wallet is a
          perfectly normal thing to be on while funding the agent. */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        disabled={minting}
        title={t("nav.faucetOptions")}
        aria-label={t("nav.faucetOptions")}
        aria-expanded={open}
        className="rounded-l-none px-1.5"
      >
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-md border bg-card p-3 shadow-lg">
          <div className="text-sm font-medium">{t("nav.faucetToAddress")}</div>
          <p className="mt-1 text-xs text-muted-foreground">{t("nav.faucetAddressHint")}</p>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onMintToAddress();
            }}
            placeholder={t("nav.faucetAddressPlaceholder")}
            spellCheck={false}
            autoComplete="off"
            className="mt-2 font-mono text-xs"
          />
          <Button
            size="sm"
            onClick={onMintToAddress}
            disabled={minting}
            className="mt-2 w-full"
          >
            {minting ? t("nav.faucetMinting") : t("nav.faucetSend")}
          </Button>
          {note && (
            <p
              className={`mt-2 break-words text-xs ${note.ok ? "text-muted-foreground" : "text-destructive"}`}
            >
              {note.text}
            </p>
          )}

          {/* Which token the 1,000 actually lands in. Worth the space because
              MockUSDC is re-deployed on every local reset, so the address is
              never the same twice and a wallet pointed at yesterday's one shows
              a balance of zero with nothing to explain it. */}
          <div className="mt-3 border-t pt-2">
            <div className="text-xs font-medium">{t("nav.faucetToken")}</div>
            {usdc === null ? (
              <div className="mt-1 h-4 w-full animate-pulse rounded bg-muted" />
            ) : usdc === "" ? (
              <p className="mt-1 text-xs text-muted-foreground">—</p>
            ) : (
              <div className="mt-1 flex items-center gap-1">
                <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                  {usdc}
                </code>
                <button
                  type="button"
                  onClick={() => void copyUsdc()}
                  title={copied ? t("nav.faucetCopied") : t("nav.faucetCopy")}
                  aria-label={copied ? t("nav.faucetCopied") : t("nav.faucetCopy")}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">{t("nav.faucetTokenHint")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
