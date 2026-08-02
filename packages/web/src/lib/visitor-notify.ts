// Home-page visit notifications — Telegram. Messages are prefixed 🔮 (this prediction
// market); the rabbit portfolio site uses 🐰, so the two are distinguishable at a glance.
// Same fire-and-forget shape as the API's
// trade/faucet/resolve notifications (packages/api/src/telegram-notify.ts). A Telegram
// hiccup must never affect a page render, so errors are logged and swallowed.
//
// Runs in the WEB service, so that service needs TELEGRAM_BOT_TOKEN (Secret Manager) and
// TELEGRAM_CHAT_ID — see scripts/deploy.sh. Unset = notifications simply off.

// Per-visitor debounce so a refresh or a quick back-and-forth doesn't fire repeatedly.
// In-memory and therefore per Cloud Run instance — with several instances the same visitor
// could notify more than once per window. Acceptable for a low-traffic "someone looked at
// the site" ping; not worth a shared store.
const DEBOUNCE_MS = 5 * 60 * 1000;
const lastSeen = new Map<string, number>();

export function notifyHomeVisit(ip: string): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const now = Date.now();
  const prev = lastSeen.get(ip);
  if (prev !== undefined && now - prev < DEBOUNCE_MS) return;
  lastSeen.set(ip, now);

  // Keep the map from growing without bound on a long-lived instance.
  if (lastSeen.size > 1000) {
    for (const [k, t] of lastSeen) {
      if (now - t >= DEBOUNCE_MS) lastSeen.delete(k);
    }
  }

  fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: `🔮 👀 Verex — home page visit (${ip})` }),
  })
    .then(async (res) => {
      if (!res.ok) console.error("visitor-notify failed:", res.status, await res.text());
    })
    .catch((e) => console.error("visitor-notify error:", e));
}
