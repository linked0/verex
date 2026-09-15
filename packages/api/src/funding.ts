// The funding leg: Stripe Checkout (TEST mode) → a jUSD mint.
//
// A newcomer with no crypto pays with a test card and receives jUSD, the
// token the chain actually settles in. There is one balance in the system
// and it is on-chain. Design: rabbit docs/features/jayverse-onboarding-mm.md.
//
// This replaced an internal "USDCX" credit — a Postgres number the user spent
// from while the chain leg was funded by an unrelated open mint. One user, two
// balances, and the one the UI showed was the one that was not real.
//
// The WEBHOOK is the source of truth, never the browser redirect — the user
// can close the tab between paying and returning. Each deposit is idempotent
// on the Stripe event/session id (StripeEvent + Deposit.sessionId), so a
// retried webhook cannot pay twice.
//
// A card charge and an on-chain mint cannot share a transaction. So the
// webhook commits the Deposit row (what we owe) atomically with the Stripe
// event, and SETTLES it — mints, stamps txHash — afterwards. If the mint
// fails, the row stays unsettled and `settlePendingDeposits` retries it; the
// money is never lost, only late. Settling twice is prevented by the same
// row: only `settledAt IS NULL` rows are picked up, and the update is
// conditional on it still being null.
//
// No stripe SDK on purpose: v1 needs one REST call (create a Checkout
// Session) and one HMAC check (webhook signature). Two fetches and
// node:crypto keep the dependency tree exactly where it was.

import { createHmac, timingSafeEqual } from "node:crypto";
import { getAddress, isAddress, parseUnits, formatUnits } from "viem";
import type { Address } from "@verex/sdk";
import { prisma } from "./db";
import { account, loadChain } from "./chain";

const STRIPE_API = "https://api.stripe.com/v1";
export const MIN_DEPOSIT_USD = 1;
export const MAX_DEPOSIT_USD = 1_000;
/// Webhook signatures older than this are refused — Stripe's own replay guard.
const SIGNATURE_TOLERANCE_S = 5 * 60;

function httpError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode });
}

/// TEST keys only, enforced by prefix. This feature is a demo of the flow,
/// not a payments product — a live key here would move real money into a
/// play-money ledger, so the API refuses to even try.
function stripeKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw httpError("STRIPE_SECRET_KEY is not set — funding is disabled in this environment", 503);
  }
  if (!key.startsWith("sk_test_")) {
    throw httpError("STRIPE_SECRET_KEY must be a TEST key (sk_test_…) — Verex funding is test mode only", 503);
  }
  return key;
}

/// Same dual identity as /wallet/:index — a demo-wallet index verex holds
/// the key for, or a bare 0x address it doesn't. The operator (#0) is
/// refused: MM inventory is not a customer balance.
export function resolveFundingUser(req: { accountIndex?: number; address?: string }): string {
  if (req.address !== undefined) {
    if (!isAddress(req.address)) throw httpError("address is not a valid 0x address", 400);
    return getAddress(req.address);
  }
  const index = Number(req.accountIndex);
  if (!Number.isInteger(index) || index < 1 || index > 9) {
    throw httpError("accountIndex must be 1..9 (the operator does not fund via Stripe), or send an address", 400);
  }
  return account(index).address as Address;
}

export interface CheckoutResult {
  url: string;
  sessionId: string;
  userId: string;
}

/// POST /funding/checkout — create a hosted Checkout Session and hand the
/// browser its URL. The credit happens later, in the webhook.
export async function createCheckout(req: {
  accountIndex?: number;
  address?: string;
  amount: number;
}): Promise<CheckoutResult> {
  const userId = resolveFundingUser(req);
  const amount = Number(req.amount);
  if (!Number.isFinite(amount) || amount < MIN_DEPOSIT_USD || amount > MAX_DEPOSIT_USD) {
    throw httpError(`amount must be ${MIN_DEPOSIT_USD}..${MAX_DEPOSIT_USD} USD`, 400);
  }
  const cents = Math.round(amount * 100);
  const key = stripeKey();
  const webUrl = process.env.VEREX_WEB_URL ?? "http://localhost:3000";

  // Stripe's REST API takes form-encoded bodies with bracketed nesting.
  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(cents),
    "line_items[0][price_data][product_data][name]":
      "Verex jUSD (test mode — a demo chain token, no real value)",
    success_url: `${webUrl}/funding?funded=success`,
    cancel_url: `${webUrl}/funding?funded=cancel`,
    // The webhook credits from THESE, not from anything the browser says.
    "metadata[userId]": userId,
    "metadata[jusd]": (cents / 100).toFixed(2),
  });

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const body = (await res.json().catch(() => null)) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  } | null;
  if (!res.ok || !body?.url || !body.id) {
    throw httpError(
      `Stripe refused the Checkout Session: ${body?.error?.message ?? `HTTP ${res.status}`}`,
      502,
    );
  }
  return { url: body.url, sessionId: body.id, userId };
}

/// Verify Stripe's `stripe-signature` header against the RAW body — the
/// signed payload is `${t}.${raw}`, so any re-serialization breaks it (which
/// is why the route keeps the body as a buffer).
function verifySignature(raw: Buffer, header: string | undefined, secret: string): void {
  if (!header) throw httpError("missing stripe-signature header", 400);
  const parts = new Map<string, string[]>();
  for (const kv of header.split(",")) {
    const [k, v] = kv.split("=", 2);
    if (!k || v === undefined) continue;
    const key = k.trim();
    parts.set(key, [...(parts.get(key) ?? []), v.trim()]);
  }
  const t = Number(parts.get("t")?.[0]);
  const v1s = parts.get("v1") ?? [];
  if (!Number.isFinite(t) || v1s.length === 0) throw httpError("malformed stripe-signature header", 400);
  if (Math.abs(Date.now() / 1000 - t) > SIGNATURE_TOLERANCE_S) {
    throw httpError("stripe-signature timestamp outside tolerance", 400);
  }
  const expected = createHmac("sha256", secret)
    .update(`${t}.`)
    .update(raw)
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const ok = v1s.some((v1) => {
    const got = Buffer.from(v1, "utf8");
    return got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf);
  });
  if (!ok) throw httpError("stripe-signature verification failed", 400);
}

export interface WebhookResult {
  received: true;
  handled: boolean;
  /// Set when this delivery actually recorded a deposit (idempotent replays
  /// come back handled but not credited).
  credited?: { userId: string; amount: number; sessionId: string };
  /// The mint, when it landed during this same delivery. Absent means the
  /// deposit is recorded but still pending — `settlePendingDeposits` owns it.
  txHash?: string;
}

/// POST /webhooks/stripe — verify, record the deposit, then mint.
export async function handleStripeWebhook(
  raw: Buffer,
  signatureHeader: string | undefined,
): Promise<WebhookResult> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw httpError("STRIPE_WEBHOOK_SECRET is not set — funding is disabled in this environment", 503);
  }
  verifySignature(raw, signatureHeader, secret);

  const event = JSON.parse(raw.toString("utf8")) as {
    id?: string;
    type?: string;
    data?: {
      object?: {
        id?: string;
        payment_status?: string;
        amount_total?: number;
        metadata?: { userId?: string; jusd?: string };
      };
    };
  };
  if (event.type !== "checkout.session.completed") return { received: true, handled: false };

  const session = event.data?.object;
  const sessionId = session?.id;
  const userId = session?.metadata?.userId;
  // Prefer our own metadata (what /funding/checkout promised); fall back to
  // Stripe's amount_total for sessions created outside this API.
  const amount =
    Number(session?.metadata?.jusd) ||
    (session?.amount_total != null ? session.amount_total / 100 : NaN);
  if (!event.id || !sessionId || !userId || !isAddress(userId) || !(amount > 0)) {
    throw httpError("checkout.session.completed is missing id/metadata — nothing to deposit", 400);
  }
  // Cards are paid synchronously; anything async (payment_status "unpaid")
  // must wait for its own completed-and-paid event.
  if (session?.payment_status && session.payment_status !== "paid") {
    return { received: true, handled: false };
  }

  const user = getAddress(userId);
  let depositId: string;
  try {
    depositId = await prisma.$transaction(async (tx) => {
      // Unique on both event id and session id — the insert IS the
      // idempotency check, and it commits atomically with the record of
      // what we now owe this user.
      await tx.stripeEvent.create({ data: { id: event.id!, sessionId } });
      const row = await tx.deposit.create({ data: { userId: user, amount, sessionId } });
      return row.id;
    });
  } catch (e) {
    // P2002 = this event/session was already recorded. Answer 200 so Stripe
    // stops retrying, but still sweep: the first delivery may have committed
    // the row and then failed to mint.
    if ((e as { code?: string })?.code === "P2002") {
      await settlePendingDeposits().catch(() => {});
      return { received: true, handled: true };
    }
    throw e;
  }

  // Mint outside the transaction. A failure here is recoverable by design:
  // the Deposit row is committed, so the user is owed the tokens whatever
  // happens next, and the sweeper will mint them.
  const settled = await settleDeposit(depositId).catch(() => null);
  return {
    received: true,
    handled: true,
    credited: { userId: user, amount, sessionId },
    txHash: settled ?? undefined,
  };
}

/// Mint one recorded deposit and stamp it settled. Returns the tx hash, or
/// null if the row was already settled (or vanished) — never throws for that.
/// Safe to call twice: the final update is conditional on settledAt still
/// being null, so a duplicate caller loses the race and mints nothing.
export async function settleDeposit(id: string): Promise<`0x${string}` | null> {
  const row = await prisma.deposit.findUnique({ where: { id } });
  if (!row || row.settledAt) return null;

  // Claim the row BEFORE minting. Two concurrent sweepers would otherwise
  // both see settledAt = null and both mint; this makes the second one a
  // no-op. The cost is that a crash between claim and mint leaves a row
  // marked settled with no txHash — which `unsettledDeposits` reports, and
  // which is far better than minting twice.
  const claim = await prisma.deposit.updateMany({
    where: { id, settledAt: null },
    data: { settledAt: new Date() },
  });
  if (claim.count === 0) return null;

  try {
    const chain = await loadChain();
    const hash = await chain.jusdAs(0).mint(getAddress(row.userId) as Address, parseUnits(String(row.amount), 6));
    await prisma.deposit.update({ where: { id }, data: { txHash: hash } });
    return hash as `0x${string}`;
  } catch (e) {
    // Hand the row back so the sweeper can try again.
    await prisma.deposit.updateMany({ where: { id, txHash: null }, data: { settledAt: null } });
    throw e;
  }
}

/// Mint everything that is paid for but not yet on-chain. Called after each
/// webhook and exposed as POST /funding/settle so a stuck deposit can be
/// retried without waiting for Stripe to redeliver anything.
export async function settlePendingDeposits(): Promise<{ settled: number; failed: number }> {
  const pending = await prisma.deposit.findMany({
    where: { settledAt: null },
    orderBy: { createdAt: "asc" },
    take: 25,
  });
  let settled = 0;
  let failed = 0;
  for (const row of pending) {
    try {
      if (await settleDeposit(row.id)) settled += 1;
    } catch {
      failed += 1;
    }
  }
  return { settled, failed };
}

// ── Reads (balance chip + deposit history) ────────────────────────────────

export interface FundingSummary {
  userId: string;
  currency: string;
  /// The wallet's on-chain jUSD. This is the balance — there is no other.
  amount: number;
  /// Paid for but not yet minted. Non-zero means a settle is outstanding,
  /// and the UI should say so rather than let the number look wrong.
  pending: number;
  /// True once this wallet has ever paid through Stripe. Nothing depends on
  /// it any more; it is kept so the UI can tell "new here" from "spent it".
  funded: boolean;
}

export async function fundingSummary(userId: string): Promise<FundingSummary> {
  const user = getAddress(userId) as Address;
  const [onChain, deposits] = await Promise.all([
    loadChain().then((chain) => chain.jusdAs(0).balanceOf(user)),
    prisma.deposit.findMany({ where: { userId: user }, select: { amount: true, settledAt: true } }),
  ]);
  const pending = deposits
    .filter((d) => !d.settledAt)
    .reduce((sum, d) => sum + Number(d.amount), 0);
  return {
    userId: user,
    currency: "jUSD",
    amount: Number(formatUnits(onChain, 6)),
    pending,
    funded: deposits.length > 0,
  };
}

export async function fundingLedger(userId: string) {
  const rows = await prisma.deposit.findMany({
    where: { userId: getAddress(userId) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    sessionId: r.sessionId,
    txHash: r.txHash,
    settledAt: r.settledAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}
