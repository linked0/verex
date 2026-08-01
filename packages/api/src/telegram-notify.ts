// Fire-and-forget Telegram notification for trade/faucet/resolve events.
// Missing config means notifications are simply off — never blocks or throws
// into the caller, since a Telegram hiccup must never affect a real request.
export function notifyTelegram(text: string): void {
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
