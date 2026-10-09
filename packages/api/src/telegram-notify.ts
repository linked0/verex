// Fire-and-forget Telegram notification — trades and Stripe funding only.
//
// Policy (jay, 2026-10-09): Verex pings only about the home page and trading.
// Resolve / propose / dispute / jury / faucet / MM-config pings were removed:
// they are our own demo clicks far more often than a visitor's, and they
// buried the two signals that matter. Stripe funding stays as part of trading
// — it is real money into a trading account and the only alert for a mint
// left PENDING. Add a new call here only if it is one of those two kinds.
// Missing config means notifications are simply off — never blocks or throws
// into the caller, since a Telegram hiccup must never affect a real request.
import { CHAIN_ID } from "./chain";

export function notifyTelegram(text: string): void {
  // Local anvil is a sandbox — demo clicks shouldn't ping anyone's phone.
  // TELEGRAM_NOTIFY_LOCAL=1 re-enables locally for testing the hook itself.
  if (CHAIN_ID === 31337 && process.env.TELEGRAM_NOTIFY_LOCAL !== "1") return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
    .then(async (res) => {
      if (!res.ok) console.error("telegram notify failed:", res.status, await res.text());
    })
    .catch((e) => console.error("telegram notify error:", e));
}
