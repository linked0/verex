-- Per-market choice of resolution source (runbook §2b, plan wave 2).
--
-- Purely additive, and deliberately no backfill: every market that exists
-- today had its condition prepared with the operator as oracle, which is
-- exactly what the DEFAULT 'OPERATOR' records. Any other backfill would be a
-- lie — the oracle is baked into each market's conditionId and cannot be
-- changed by a database write.

-- CreateEnum
CREATE TYPE "OracleType" AS ENUM ('OPERATOR', 'UMA');

-- AlterTable
ALTER TABLE "ChainConfig" ADD COLUMN     "umaAdapterAddr" TEXT;

-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "oracleType" "OracleType" NOT NULL DEFAULT 'OPERATOR',
ADD COLUMN     "resolutionCriteria" TEXT,
ADD COLUMN     "umaAdapter" TEXT,
ADD COLUMN     "umaAncillaryData" TEXT;
