-- V-A: an external maker signs its own order, so verex has no demo-wallet
-- index for it. Nullable rather than removed — the demo wallets (1..9) and
-- the operator MM (0) keep writing an index exactly as before.
ALTER TABLE "Order" ALTER COLUMN "makerIndex" DROP NOT NULL;
