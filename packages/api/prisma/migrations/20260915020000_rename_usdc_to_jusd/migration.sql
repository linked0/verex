-- jUSD replaces MockUSDC as the ecosystem stablecoin (jay, 2026-09-15).
-- Column rename only: the data is unchanged, and the on-chain token these
-- columns describe is the same shape (6 decimals). RENAME COLUMN keeps the
-- existing rows in place — the earlier migrations that created these columns
-- are left exactly as applied, since editing them would desync the live DB
-- from its own migration history.
ALTER TABLE "ChainConfig" RENAME COLUMN "usdcAddr" TO "jusdAddr";
ALTER TABLE "Trade" RENAME COLUMN "usdcAmount" TO "jusdAmount";
