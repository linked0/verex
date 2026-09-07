// The funding leg: Stripe Checkout (TEST mode) → internal USDCX ledger.
//
// A newcomer with no wallet pays with a test card and gets a spendable
// internal balance ("USDCX") — a ledger row, NOT redeemable crypto and NOT
// an on-chain USDC transfer. The chain leg keeps settling in MockUSDC
// exactly as before; this ledger sits in front of it as the user-facing
// spendable balance. Design: rabbit docs/features/jayverse-onboarding-mm.md.
//
// The WEBHOOK is the source of truth for crediting, never the browser
// redirect — the user can close the tab between paying and returning. Each
// credit is idempotent on the Stripe event/session id (StripeEvent table),
// so a retried webhook can't double-credit.
//
// No stripe SDK on purpose: v1 needs one REST call (create a Checkout
// Session) and one HMAC check (webhook signature). Two fetches and
// node:crypto keep the dependency tree exactly where it was.

import { createHmac, timingSafeEqual } from "node:crypto";
import { getAddress, isAddress } from "viem";
import type { Prisma } from "@prisma/client";
import type { Address } from "@verex/sdk";
import { prisma } from "./db";
import { account } from "./chain";

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
      "Verex USDCX credit (test mode — play money, not redeemable crypto)",
    success_url: `${webUrl}/funding?funded=success`,
    cancel_url: `${webUrl}/funding?funded=cancel`,
    // The webhook credits from THESE, not from anything the browser says.
    "metadata[userId]": userId,
    "metadata[usdcx]": (cents / 100).toFixed(2),
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
  /// Set when this delivery actually credited a balance (idempotent replays
  /// come back handled but not credited).
  credited?: { userId: string; amount: number; sessionId: string };
}

/// POST /webhooks/stripe — verify, then credit on checkout.session.completed.
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
        metadata?: { userId?: string; usdcx?: string };
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
    Number(session?.metadata?.usdcx) ||
    (session?.amount_total != null ? session.amount_total / 100 : NaN);
  if (!event.id || !sessionId || !userId || !isAddress(userId) || !(amount > 0)) {
    throw httpError("checkout.session.completed is missing id/metadata — nothing to credit", 400);
  }
  // Cards are paid synchronously; anything async (payment_status "unpaid")
  // must wait for its own completed-and-paid event.
  if (session?.payment_status && session.payment_status !== "paid") {
    return { received: true, handled: false };
  }

  const user = getAddress(userId);
  try {
    await prisma.$transaction(async (tx) => {
      // Unique on both event id and session id — the insert IS the
      // idempotency check, and it commits atomically with the credit.
      await tx.stripeEvent.create({ data: { id: event.id!, sessionId } });
      await tx.balance.upsert({
        where: { userId: user },
        create: { userId: user, amount },
        update: { amount: { increment: amount } },
      });
      await tx.ledgerEntry.create({
        data: { userId: user, kind: "DEPOSIT", delta: amount, ref: sessionId },
      });
    });
  } catch (e) {
    // P2002 = this event/session was already credited. Answer 200 so Stripe
    // stops retrying — the retry did its job, which was nothing.
    if ((e as { code?: string })?.code === "P2002") return { received: true, handled: true };
    throw e;
  }
  return { received: true, handled: true, credited: { userId: user, amount, sessionId } };
}

// ── Reads (balance chip + mini ledger) ─────────────────────────────────────

export interface FundingSummary {
  userId: string;
  currency: string;
  amount: number;
  /// False = this wallet never onboarded through Stripe; the order path
  /// skips the USDCX guard for it entirely.
  funded: boolean;
}

export async function fundingSummary(userId: string): Promise<FundingSummary> {
  const row = await prisma.balance.findUnique({ where: { userId } });
  return {
    userId,
    currency: row?.currency ?? "USDCX",
    amount: row ? Number(row.amount) : 0,
    funded: Boolean(row),
  };
}

export async function fundingLedger(userId: string) {
  const rows = await prisma.ledgerEntry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    delta: Number(r.delta),
    ref: r.ref,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ── Order-path hooks (book.ts / resolve.ts) ────────────────────────────────

/// The USDCX mirror of `checkExternalFunds`: read and refuse, never top up.
/// No balance row means the wallet never onboarded through Stripe — the
/// pre-existing chain-USDC path applies unchanged and this guard stands down.
export async function checkFundingBalance(userId: string, usdcNeeded: number): Promise<void> {
  const row = await prisma.balance.findUnique({ where: { userId } });
  if (!row) return;
  const have = Number(row.amount);
  if (have < usdcNeeded) {
    throw httpError(
      `insufficient USDCX balance: have ${have.toFixed(2)}, need ${usdcNeeded.toFixed(2)}. ` +
        `Add funds first (POST /funding/checkout).`,
      400,
    );
  }
}

/// Apply one signed movement inside the caller's transaction (a fill debit/
/// credit, or a redemption payout). No-op for wallets without a funding
/// account — updateMany matching zero rows is the cheap way to know.
export async function applyFundingDelta(
  tx: Prisma.TransactionClient,
  userId: string,
  kind: "TRADE" | "REDEEM",
  delta: number,
  ref: string,
): Promise<void> {
  if (delta === 0) return;
  const updated = await tx.balance.updateMany({
    where: { userId },
    data: { amount: { increment: delta } },
  });
  if (updated.count === 0) return;
  await tx.ledgerEntry.create({ data: { userId, kind, delta, ref } });
}
