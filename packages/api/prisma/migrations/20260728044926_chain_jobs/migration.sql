-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "ChainJobType" AS ENUM ('SETTLE_MATCH', 'RESOLVE', 'REDEEM', 'CREATE_GROUP');

-- CreateEnum
CREATE TYPE "ChainJobStatus" AS ENUM ('PENDING', 'RUNNING', 'CONFIRMED', 'FAILED');

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "settlement" "SettlementStatus" NOT NULL DEFAULT 'CONFIRMED',
ALTER COLUMN "txHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ChainJob" (
    "id" TEXT NOT NULL,
    "type" "ChainJobType" NOT NULL,
    "status" "ChainJobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChainJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChainJob_status_runAfter_idx" ON "ChainJob"("status", "runAfter");
