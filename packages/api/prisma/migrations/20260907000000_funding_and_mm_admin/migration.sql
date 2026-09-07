-- Funding leg (Stripe test mode → internal USDCX ledger) + /admin/mm controls.
-- Design: rabbit docs/features/jayverse-onboarding-mm.md §6.

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('DEPOSIT', 'TRADE', 'REDEEM');

-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "mmPaused" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Balance" (
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDCX',
    "amount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Balance_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "delta" DECIMAL(20,6) NOT NULL,
    "ref" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MmConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "spreadBps" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MmConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MmAuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MmAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerEntry_userId_createdAt_idx" ON "LedgerEntry"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StripeEvent_sessionId_key" ON "StripeEvent"("sessionId");
