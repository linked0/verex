-- CreateEnum
CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "makerOrderId" TEXT,
ADD COLUMN     "takerOrderId" TEXT;

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "outcomeId" TEXT NOT NULL,
    "maker" TEXT NOT NULL,
    "makerIndex" INTEGER NOT NULL,
    "side" "OrderSide" NOT NULL,
    "price" DECIMAL(10,6) NOT NULL,
    "size" DECIMAL(20,6) NOT NULL,
    "sizeFilled" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "isMM" BOOLEAN NOT NULL DEFAULT false,
    "signedOrder" JSONB,
    "orderHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderHash_key" ON "Order"("orderHash");

-- CreateIndex
CREATE INDEX "Order_outcomeId_status_side_price_createdAt_idx" ON "Order"("outcomeId", "status", "side", "price", "createdAt");

-- CreateIndex
CREATE INDEX "Order_maker_status_idx" ON "Order"("maker", "status");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "Outcome"("id") ON DELETE CASCADE ON UPDATE CASCADE;
