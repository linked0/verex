-- Funding now mints jUSD instead of crediting an internal USDCX balance
-- (jay, 2026-09-15). See schema.prisma above `model Deposit` for why.
--
-- Balance and LedgerEntry are dropped rather than migrated. They are provably
-- empty everywhere this migration will run: crediting requires a Stripe
-- webhook, STRIPE_SECRET_KEY has never been set in any deployed environment,
-- and LedgerEntry rows were only ever written for users who already had a
-- Balance row. If that is somehow not true where you are running this, take a
-- dump of both tables first — there is no undo.
DROP TABLE IF EXISTS "LedgerEntry";
DROP TABLE IF EXISTS "Balance";
DROP TYPE IF EXISTS "LedgerKind";

CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "sessionId" TEXT NOT NULL,
    "txHash" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Deposit_sessionId_key" ON "Deposit"("sessionId");
CREATE INDEX "Deposit_userId_createdAt_idx" ON "Deposit"("userId", "createdAt");
CREATE INDEX "Deposit_settledAt_idx" ON "Deposit"("settledAt");
