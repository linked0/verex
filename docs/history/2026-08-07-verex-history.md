
### Walkable dispute scenarios: mock oracle with a demo-wallet jury

- **Cause:** jay reframed the site as educational/portfolio, which flipped the earlier
  "no dispute page" call, and asked for three walkable scenarios: dispute defeated (jury
  backs the proposer), dispute upheld (jury overturns), and the dead end.
- **Reasoning:** the un-simulatable half of a dispute is only the DVM verdict — so replace
  exactly that half. MockOptimisticOracleV2 implements the oracle surface the adapter uses
  plus a jury: one vote per address, majority wins, tie = Unresolvable, winner takes the
  loser's bond. The UmaCtfAdapter is deliberately UNCHANGED — same contract, different
  constructor argument — so the demo exercises the production resolution path. Writes are
  mock-only by guard; a demo jury on the real oracle would be theatre.
- **Change:** contract + 10 foundry tests (three scenarios end-to-end through the adapter);
  DeployMockOracle.s.sol run by local seeds; ChainConfig grows umaOracleAddr/umaOracleMock
  (migration); SDK uma-oracle client; API GET /markets/:slug/uma + mock-only propose/
  dispute/vote/finalize; UmaOraclePanel on UMA market pages (countdown, per-wallet vote
  buttons, verdict copy); runbook §4c. Two latent bugs fixed en route: the seed's CTF
  allowance budgeted 10 markets but the UMA market is an 11th; app-created UMA markets
  hardcoded WETH bonds (now 10 USDC + 5-min liveness on mock). Also mirrored
  VEREX_OPERATOR_KEY into packages/api/.env — the dev server had been signing as anvil
  account 0, not the seeded operator.
- **Result:** all three scenarios verified over the API on local anvil: scenario 1 verdict
  Yes [1,0] with disputer −10 USDC; scenario 2 verdict No [0,1] with disputer +10 (990 →
  980 bonded → 1000); scenario 3 frozen at Disputed with 409s even 600s past liveness.
  63/63 contract tests green. Panel renders on the market page; branch claude/uma-dispute-demo.
