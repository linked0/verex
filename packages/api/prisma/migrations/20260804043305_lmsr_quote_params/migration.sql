-- LMSR quote parameters (plan wave 1, Phase A).
--
-- `openingCenter` is LMSR's p⁰ for the Yes side. It must be the market's
-- ORIGINAL opening probability, not its current price: the quote is derived
-- from p⁰ plus the operator's net sold inventory, and that inventory is
-- summed over the market's whole trade history. Backfilling from the current
-- `quoteCenter` would count the same trading twice — once in the seeded
-- centre and again in q — and skew every already-traded market.
--
-- The earliest PricePoint is the market's opening probability, so use that and
-- fall back to `quoteCenter` for markets that never charted one.
ALTER TABLE "Market" ADD COLUMN     "lmsrB" DECIMAL(20,6) NOT NULL DEFAULT 250,
ADD COLUMN     "openingCenter" DECIMAL(10,6) NOT NULL DEFAULT 0.5;

UPDATE "Market" m
SET "openingCenter" = COALESCE(
  (
    SELECT p."price"
    FROM "PricePoint" p
    WHERE p."marketId" = m."id"
    ORDER BY p."at" ASC, p."id" ASC
    LIMIT 1
  ),
  m."quoteCenter"
);
