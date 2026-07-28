-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('CREATING', 'OPEN', 'RESOLVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "creator" TEXT,
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "groupLabel" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MarketGroup" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "imageUrl" TEXT,
    "status" "GroupStatus" NOT NULL DEFAULT 'OPEN',
    "closesAt" TIMESTAMP(3),
    "resolvedMarketId" TEXT,
    "creator" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketGroup_slug_key" ON "MarketGroup"("slug");

-- CreateIndex
CREATE INDEX "MarketGroup_category_status_idx" ON "MarketGroup"("category", "status");

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MarketGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
