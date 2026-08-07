-- ChainConfig learns which oracle the adapter is bound to, and whether it is
-- the demo mock (jury-voted) rather than the real OptimisticOracleV2.
ALTER TABLE "ChainConfig" ADD COLUMN "umaOracleAddr" TEXT;
ALTER TABLE "ChainConfig" ADD COLUMN "umaOracleMock" BOOLEAN NOT NULL DEFAULT false;
