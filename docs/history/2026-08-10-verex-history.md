# 2026-08-10 — verex

Source docs: [docs/runbooks/uma-adapter.md](../runbooks/uma-adapter.md),
[docs/runbooks/uma-local-demo.md](../runbooks/uma-local-demo.md),
[docs/runbooks/local-testing.md](../runbooks/local-testing.md) — this day restructures
the UMA runbooks by environment.

### Split the UMA runbook by environment: uma-local-demo.md extracted

- **Cause:** jay, testing UMA locally, found uma-adapter.md confusing — staging/prod
  content and local-server content interleaved in one file. On inspection it was worse:
  the file mixed **three** environments (real Sepolia §1–4b, local mock §4c, Sepolia
  *fork* §5), and §5 was titled "Testing locally" while actually being the fork harness —
  so the reader looking for "test on my local server" landed on the wrong section.
- **Reasoning:** the earlier "no new file needed, §4c covers it" call answered coverage,
  not findability. Two distinct audiences (staging operator vs. someone walking the demo
  locally) shared one scroll. Splitting by audience beats a labeling pass because the
  local demo is fully self-contained (own prerequisites, URLs, bond arithmetic).
- **Change:** §4c moved to a new `docs/runbooks/uma-local-demo.md` (with an added
  local-vs-staging comparison table and "why a mock exists" framing); uma-adapter.md
  keeps a one-paragraph §4c pointer, gains a "which document do you need?" note up top,
  and §5 was renamed to "Testing against a Sepolia fork" with its false premise ("there
  is no mock deployment to point at") rewritten — the mock exists now; the fork's job is
  UMA *conformance*, not adapter mechanics. Code comments in `UmaOraclePanel.tsx` and
  `uma-demo.ts` repointed. Stale test count fixed (53 → 63, verified via `forge test`).
- **Result:** each runbook now serves one environment; cross-links both ways. Branch
  `claude/uma-docs-split`, uncommitted.

### local-testing.md §5 had gone stale — the mock oracle inverted its claims

- **Cause:** while answering "do we need a separate file?", discovered that
  local-testing.md §5 still described the pre-mock world: UMA card "greyed out — no
  adapter exists on this chain", `/config` expected `umaAvailable: false`, and §5.4's
  API test expected a 400 that now returns success.
- **Reasoning:** the mock-oracle work (2026-08-07) made local seeds deploy a real
  adapter, flipping every one of those assertions; a runbook asserting the opposite of
  reality actively misleads. The binary-only rejection, previously masked by the
  missing-adapter check, is now the *observable* disabled state — so the section's
  test value survives, just inverted.
- **Change:** §5.1–5.2 rewritten around the enabled card and the new chain of state
  (`DeployMockOracle` → `ChainConfig` → `umaAvailable: true, umaOracleMock: true`),
  with a re-seed note for DBs predating the mock; §5.3 binary-only is now a visual
  check; §5.4 fires the two remaining 400s on anvil and expects valid UMA creation to
  *succeed*; §5.6 positive case points at uma-local-demo.md (mock) vs. uma-adapter.md §5
  (real-oracle conformance); §8's "not testable on anvil" row narrowed to real-oracle
  behaviour only.
- **Result:** the runbook's expectations match what a freshly seeded anvil actually
  does (verified against today's live `/config`: `umaAvailable: true`,
  `umaOracleMock: true`). Same branch, uncommitted.

### /create: "Binary market" checkbox auto-fills Yes/No

- **Cause:** jay, creating a UMA test market, hit the greyed-out UMA card because the
  outcome labels weren't literally "Yes"/"No" — typing them by hand is both tedious and
  easy to get wrong, and UMA requires the labels verbatim.
- **Reasoning:** the failure mode isn't ignorance (the card's message explains itself)
  but friction: `isBinary` string-matches lowercased sorted labels, so any typo or
  synonym silently disables UMA. A checkbox that *sets* the canonical labels removes
  the typing instead of validating it. Unchecking restores whatever was typed before
  (stashed in a ref) so exploration isn't punished. No Checkbox component exists in
  the UI kit — a styled native `<input type="checkbox">` avoids adding one for a
  single use.
- **Change:** `CreateClient.tsx` — `binaryChecked` state + `toggleBinary`; checked
  fixes `outcomes` to `["Yes","No"]` and swaps the input list for a one-line note
  ("the labels the UMA oracle option requires"); unchecked restores the stashed list.
  Existing `isBinary`/UMA-card logic untouched — the checkbox only feeds it the right
  labels.
- **Result:** `tsc --noEmit` clean on `@verex/web`. One check now yields a
  UMA-eligible binary market; multi-outcome flow unchanged. Branch
  `claude/uma-docs-split`, uncommitted (separable from the docs changes at commit
  time — different files).

### Finding: `closesAt` is never enforced — markets stay tradable past their end time

- **Cause:** jay asked what the creation-form end time *means* if a proposal opens the
  dispute window whenever it happens. Tracing the field to answer precisely turned up
  a gap.
- **Reasoning:** order placement gates only on `market.status !== "OPEN"`
  (book.ts:255), and nothing ever flips status by clock: no scheduled job reads
  `closesAt`, no order-time comparison against it exists. After creation-time
  validation ("must be in the future"), the API never reads the field again; the web
  only renders "Closes <date>" labels.
- **Change:** none — assessment only, flagged to jay. Candidate fix if wanted: check
  `closesAt` at order placement (cheapest, no job needed) and have the UI show
  "closed" past the date.
- **Result:** documented that today trading genuinely ends only at resolution;
  `closesAt` is informational. Real platforms halt trading at the event time, so this
  is a divergence worth a deliberate decision rather than an accident. Closed the
  same day — next entry.

### closesAt enforced + the oracle panel explains premature proposals

- **Cause:** jay confirmed both halves of the confusion: the dispute-window countdown
  renders with no reference to the end time ("unintuitive"), and the page doesn't
  block trading after the deadline. Chose enforcement over his first instinct
  (removing the date): a displayed-but-unenforced value should be made true, not
  hidden — the date is also the question's reference point.
- **Reasoning:** one check at order placement covers every entry path (`/orders` and
  `/trade` both funnel through `placeOrder`), needing no scheduled job; markets
  become closed-but-unresolved until resolution, which is the correct intermediate
  state. The oracle panel note turns the two-independent-clocks surprise into an
  explanation shown exactly where the confusion arises, and only while it can arise
  (pre-cutoff, Requested/Proposed states). Demo walkability kept: propose stays
  enabled early — the note frames it as the premature-proposal setup for the dispute
  scenarios.
- **Change:** `book.ts` `placeOrder` rejects with 400 `market closed for trading at
  <iso>` when `closesAt` has passed; `TradePanel.tsx` disables the button ("Trading
  closed") with a positions-locked note; `UmaOraclePanel.tsx` gains a `closesAt` prop
  (passed from the market page) and a pre-cutoff note naming the date and the word
  "premature". Verified live: backdating a seeded market's `closesAt` → trade 400s;
  restoring → trades again. First test run silently passed stale code — `tsx watch`
  hadn't restarted (same gotcha as 2026-08-07); `touch index.ts` before trusting a
  negative result.
- **Result:** `tsc --noEmit` clean on both packages; the displayed close date now
  means what it says. Branch `claude/uma-docs-split`, uncommitted.

### Telegram notifications muted on local anvil

- **Cause:** jay: local demo clicks (propose/dispute/finalize/trades) were pinging
  Telegram — the notify hook only checked for token/chat-id presence, and the local
  `packages/api/.env` carries both.
- **Reasoning:** the sandbox chain id is the reliable "this is local" signal (31337
  is already the code's local default everywhere); an env kill-switch would be one
  more thing to remember per machine. Kept an explicit opt-in
  (`TELEGRAM_NOTIFY_LOCAL=1`) for testing the hook itself locally.
- **Change:** `telegram-notify.ts` returns early when `CHAIN_ID === 31337` unless
  the opt-in is set.
- **Result:** `tsc` clean; staging/prod behaviour unchanged (their chain id is
  11155111). Branch `claude/uma-docs-split`, uncommitted.

### .gitignore missed `.env.staging` — real keys were one `git add -A` away

- **Cause:** staging the session's work surfaced `packages/contracts/.env.staging` as
  **untracked, not ignored** — a 3.4 KB twin of `.env` holding the operator private
  key and the Alchemy URL.
- **Reasoning:** the ignore list enumerated variants (`.env`, `.env.local`,
  `.env.prod`, …), so every new suffix silently defaults to *committable* —
  deny-by-default with explicit allows is the only version of this rule that can't
  rot. Templates must stay tracked, hence the `!` re-allows.
- **Change:** `.gitignore` — `.env` + `.env.*` (and the same for
  `scripts/deploy.env*`), with `!.env.example` / `!.env.*.example` /
  `!scripts/deploy.env.example`.
- **Result:** verified `check-ignore`: `.env.staging`, `.env`, `.env.prod` ignored;
  the four committed `*.example` files still tracked. Nothing secret was ever
  committed — the file was untracked the whole time.

### The closesAt cutoff broke the seed — and exposed that the seed's dates rot

- **Cause:** the first staging deploy after merging failed at `[6] posting MM ladders`:
  `seed failed: market closed for trading at 2026-07-10T00:00:00.000Z`. The new
  `placeOrder` cutoff rejected the operator's own opening quotes on markets whose
  hardcoded seed dates are now in the past. Staging was left half-seeded (markets, no
  books) on the previous revision — the deploy aborted before building the image.
- **Reasoning:** two distinct problems. (1) `postLadders` guarded `status !== "OPEN"`
  but not the cutoff, so it quoted a market that cannot accept orders — a closed
  market having no book is a *state*, not an error, so the guard belongs next to the
  status check rather than as a try/catch at the call site. (2) The seed's dates are
  absolute literals written months ago, so real time walks past them: today **9 of 32**
  markets are closed (`kr-world-cup-quarterfinals-2026`, `ai-imo-gold-2026`, and all
  7 members of `mlb-home-run-derby-2026`). Left as-is that ships a demo where a
  quarter of the markets are inert. Not silently "fixed" by rewriting the questions'
  dates — a World Cup market closing in December is nonsense, so the real fix is
  relative-to-run-time dates, which is jay's call.
- **Change:** `mm.ts` `postLadders` returns early past `closesAt`; `seed.ts` step 6
  skips those markets and **prints which ones**, so an inert market is never a silent
  omission.
- **Result:** local `db:reset` green again, listing the 9 skipped slugs. My process
  failure worth naming: I enforced the cutoff and deployed without re-running the seed
  — the one command that exercises order placement across every seeded market.

### Oracle panel acts as the selected wallet — one screen stops being five jurors

- **Cause:** jay: "voting should be done only by the selected wallet; the summary
  information is good." The panel let one screen propose, dispute, and cast all five
  jury votes — convenient, but it broke the app's own identity model (every other
  surface acts as the header's selected wallet) and demoed a verdict as one person
  clicking five buttons.
- **Reasoning:** UMA's whole point is that proposer, disputer, and each juror are
  separate parties with separate stakes; a god-mode panel teaches the opposite of
  what it demonstrates. Split read from write: everyone SEES the full tally
  (jay's "summary is good"), everyone ACTS only as themselves. The wallet-switching
  friction is the lesson, so no auto-cast shortcut was added. Kept self-dispute
  allowed — on real UMA it is the only way to retract your own wrong proposal — with
  a note instead of a guard. Blocked one thing on purpose: the operator may propose
  and dispute (claims anyone can make) but **cannot vote**, since the venue judging
  its own markets is the conflict of interest UMA removes.
- **Change:** API — `umaPropose`/`umaFinalize` now take `accountIndex` (propose was
  hardcoded to the operator), shared `requireAccount` validates 0..9 with a
  `juryOnly` flag rejecting index 0 for votes; routes pass it through. Web —
  `UmaOraclePanel` reads `useWallet()`: propose/dispute/finalize act as the selected
  wallet with the wallet named on the button, the five dispute buttons collapse to
  one, jury rows become a read-only tally where only your own row offers Vote
  buttons (highlighted "(you)"), plus a line explaining one-vote-per-address and the
  operator's exclusion. `api.ts` helpers gained the parameter. Runbook
  `uma-local-demo.md` rewrote scenario 1 as a be-this-wallet/do-this table and added
  the curl equivalents.
- **Result:** verified end to end on local anvil with a fresh throwaway market:
  proposed as **wallet #2** (previously impossible — propose was operator-only),
  disputed as #1, operator vote correctly refused 400 "the operator does not sit on
  the jury", jury 4–1, finalized as **#3** (permissionless), resolved 200; bonds
  moved exactly −10 (disputer #1) / +10 (proposer #2). `tsc --noEmit` clean on both
  packages.

### i18n reaches the app's four main pages (home, market, portfolio, create)

- **Cause:** jay asked for the language toggle to actually work on Main, Detail,
  Portfolio and Creation. Until now only the nav, welcome overlay, home cards and
  docs were translated — every other surface was English regardless of the toggle,
  so switching to Korean produced a half-Korean site.
- **Reasoning:** the existing i18n needed no redesign — flat dotted keys, `getT()` on
  the server, `useLocale()` on the client, and `ko: Record<MessageKey, string>` making
  a missing Korean value a *compile* error. The work was inventory-and-convert across
  ~2,500 lines, so it went to five parallel agents on disjoint files, each with its
  own key namespace (`home.` `market.` `portfolio.` `create.` `uma.`/`group.`) and
  forbidden from editing `lib/i18n.ts` — one owner for the dictionary meant no write
  conflicts, and the type system caught anything they got wrong on merge. Two rules
  they were held to: never translate values that cross the wire (category filter
  values, the literal `Yes`/`No` outcome labels the `isBinary` check string-matches,
  oracle state enums), and route displayed enums through a lookup instead.
- **Change:** ~200 key pairs added to `lib/i18n.ts`; 14 components/pages converted,
  including hardcoded `toLocaleDateString("en-US")` calls now taking the locale-aware
  `intl`. `GroupView` was included though not requested — the group page is one click
  from home and a half-translated path is worse than either extreme. Also fixed a
  pre-existing inconsistency the audit exposed: the market page rendered
  `market.category` raw while the home page ran it through `categoryLabel()`.
- **Result:** `tsc --noEmit` and `next build` clean; verified against the production
  build on a spare port — 13 Korean and 6 English assertions across all four pages
  plus the group page. A leftover-English sweep found only what should stay English:
  market titles, seeded rules copy ("Settled by UMA's Optimistic Oracle…"), and
  `Condition` (CTF protocol term, deliberate).
- **Self-inflicted damage worth recording:** running `pnpm run build` inside
  `packages/web` overwrites the same `.next` the dev server is using, which 500s the
  running dev server; clearing `.next` then left it 404ing until restart. Verify
  against `next start` on a spare port only when no dev server is running against the
  same directory — or accept that the dev server needs a restart afterwards.

### Portfolio was slow for a backend reason, and confusing for a frontend one

- **Cause:** jay: "the Positions part is so late and confusing when changing the Demo
  Wallet or going from the trade page" — and asked for a loading indicator. Measuring
  first showed the complaint was two separate defects, only one of them cosmetic:
  `/wallet/N` took **5.0s** on staging, and during those 5s the page displayed the
  *previous* wallet's balance and positions.
- **Reasoning:** the latency was `walletSummary` calling `balanceOf` once per outcome
  per market — ~64 sequential RPC round-trips before the page could render anything.
  The CT is ERC-1155, which has `balanceOfBatch`, but the SDK's hand-rolled ERC-1155
  ABI only declared the single-item call, so nobody could batch. Adding it makes the
  whole portfolio one round-trip. The confusion was separate and worse than staleness:
  the provider kept the old summary while fetching, so a wallet switch showed another
  account's money **attributed to the account you just selected**. Storing the summary
  *with* the wallet it describes makes that structurally impossible; a rising request
  id stops a slow response for an abandoned wallet from overwriting a newer one.
  Chose skeletons over jay's suggested hourglass — same signal, no layout jump, and
  unlike a spinner they never imply the number underneath is still valid.
- **Change:** SDK `ct.balanceOfBatch1155` + `CTClient.balanceOfBatch`; `walletSummary`
  flattens market×outcome into one batched read; `WalletProvider` gains
  `{index, summary}` pairing, a request id, and a `loading` flag; new
  `ui/skeleton.tsx`; portfolio stat cards, position rows and activity rows render
  skeletons while busy, with a spinner beside the section titles for refresh-in-place;
  the nav balance too.
- **Result:** local `/wallet/1` **5.0s → 0.09s**, verified correct after a real trade
  (111.11 tokens, cost $50, P&L +$17.70). Build renders 22 skeleton blocks and 2
  spinners; the "no positions yet" empty state no longer flashes before positions
  arrive — the most alarming part of the old behaviour. `tsc` clean on api/sdk/web,
  SDK tests pass. Does **not** fix the settlement-lag inconsistency reported earlier
  (chain balance vs DB cost basis); that one is still awaiting a decision.
