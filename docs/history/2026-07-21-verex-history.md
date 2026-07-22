# 2026-07-21 — verex history

Source: jay's direct request in chat (voice transcript, garbled). No task/design doc — a new
ad-hoc UI feature, built directly on top of the Jul-20 portfolio/activity work
([jul-20-portfolio-resolution-design.md](../tasks/details/jul-20-portfolio-resolution-design.md)).

### Portfolio: click-to-view P&L breakdown popup on Activity REDEEM rows

jay asked for a way to check the profit/loss calculation from the Activity section of the
Portfolio page — clicking a redeem entry should pop up the breakdown and the balance. There
was no existing modal/popover pattern anywhere in `packages/web` and no Radix
dialog/popover dependency installed, so built a small dependency-free popup directly in
`portfolio/page.tsx`: clicking a REDEEM row's "won/lost ±$X" text opens a centered
card (fixed backdrop, closes on backdrop click or Escape) showing outcome/tokens, cost
basis (derived client-side as `usdcAmount − realizedPnl`, no backend change needed since
`HistoryRow` already carries both), redeemed proceeds, the realized P&L with its formula
spelled out, and the wallet's current balance (from the existing `useWallet()` summary).
Scoped to one file, no new dependencies. Verified with `tsc --noEmit` (clean); `next lint`
prompted for first-time ESLint config interactively and wasn't completable non-interactively,
so lint itself is unverified — worth a manual check in the browser. Branch:
`claude/redeem-pnl-details-popup`, not yet committed (holding for jay's review per policy).

### Portfolio: move the popup's click target to the REDEEM chip itself

Per jay's screenshot + follow-up: the click target was on the "won/lost ±$X" text, but he
wanted the "REDEEM" chip/label itself to be the link. Swapped it — the REDEEM badge is now
a button that opens the same popup (styled with a hover underline so it reads as
clickable), and the pnl amount span reverted to plain (non-interactive) text so there's one
clear entry point instead of two redundant ones. Still same branch, still uncommitted.

### New logo: probability-coin mark replaces the plain "V" badge

Per jay: the existing logo (a plain indigo square with a "V") felt "timid and dull." Mocked
up 4 SVG concepts using the app's real brand tokens (`--primary`/`--yes`/`--no` from
globals.css) in a scratch HTML preview, then a round 2 refining jay's two favorites
(probability coin, candlestick-V) plus a hybrid. jay picked the probability coin outright —
the candlestick one and the hybrid both "looked like a chart used in stock exchange," not
what a prediction-market brand mark should evoke. Wired the final mark in: static
`src/app/icon.svg` (Next.js App Router auto-favicon convention, hex-converted from the HSL
tokens since a standalone favicon can't reference CSS custom properties) and replaced the
"V" badge in `SiteNav.tsx` with the same ring+split-circle SVG (using `hsl(var(--...))`
there since it renders inside the app's CSS context). Verified: `tsc --noEmit` clean, dev
server serves `/icon.svg` at 200. Same branch, still uncommitted.

### Market cards: per-market thumbnail image

jay: market cards had no images and felt bare. Verified in `MarketCard.tsx` — confirmed,
text-only. First pass added a full-width banner photo (picsum.photos, seeded by
`market.slug` — free, no API key, deterministic per market, no backend/storage work
needed). jay then shared a Polymarket screenshot and said that format (a small ~40px
rounded-square icon next to the category label, not a full banner) was better — reworked
`MarketCard.tsx` to match: icon inline in the header row, badge/price to its right, title
below. Same picsum source, just 96×96 square crop instead of 400×200 banner. `tsc --noEmit`
clean both passes. Kept scoped to the single-outcome card layout verex already has —
didn't pull in Polymarket's grouped multi-outcome-per-card structure from the screenshot,
that's a data-model change nobody asked for.

### Yes/No color refresh — queued, not yet applied

jay confirmed (via AskUserQuestion) the Yes/No colors feel generic/old-fashioned and want a
refresh. Built a comparison preview (`verex-yesno-palettes.html`, scratch dir) with 4
options — vivid green/crimson, teal/coral, deep forest/burgundy, and a bolder lime/magenta
that breaks the green=Yes/red=No convention (flagged explicitly as a UX-recognition
tradeoff). Noted the dependency: whichever palette wins, the just-finalized probability-coin
logo (`icon.svg` + `SiteNav.tsx`) embeds `--yes`/`--no` directly and will need re-coloring
to match. Awaiting jay's pick before touching `globals.css`.

### Yes/No color refresh applied: lime / magenta (Option D)

jay picked Option D from the preview — the boldest option, explicitly breaking the
green=Yes/red=No convention (flagged this tradeoff before he chose; he chose it anyway,
proceeding as an informed call). Updated `globals.css`: `--yes: 85 85% 35%` (lime, was
emerald 158/64/38), `--no: 293 69% 49%` (magenta, was rose 350/78/50) — single source of
truth, no dark-mode override existed to duplicate. Also re-colored `app/icon.svg` to match
(hardcoded hex there since a standalone favicon can't read CSS vars); `SiteNav.tsx`'s header
mark updates automatically since it reads `hsl(var(--yes))`/`hsl(var(--no))`. Grepped for
any other hardcoded old hex (`239F71`/`E31C3D`) — none found. Same branch, still
uncommitted.

### Market cards: category badge moved to the footer row

Per jay: category badge belongs on the bottom line with volume, not up top next to the
icon/price. Moved it into `CardFooter` alongside `{volume} Vol`; header row is now just the
icon and the Yes-probability percentage (right-aligned via `ml-auto`). `tsc --noEmit` clean.

### Market cards: dropped picsum photos for category-emoji glyphs, icon+title same line

jay: the picsum thumbnails "weren't identifiable" (random unrelated stock photos convey
nothing about the market) and wanted a simpler thumbnail, plus the image and title on the
same line. Replaced the external `<img>` entirely with a small `CATEGORY_EMOJI` lookup
(Politics 🗳️, Sports ⚽, Crypto 🪙, Economics 📈, Tech & Science 🔬, Climate 🌎, Culture 🎭,
`❔` fallback for anything unmapped — `category` is a free string on the Market model, not
an enum) rendered in a primary/10-tinted rounded square. Header row is now icon + title +
Yes% all on one line (`items-start` so it holds up if a title wraps to two lines). Zero
network calls for the thumbnail now, vs. one external picsum request per card before.
`tsc --noEmit` clean.

### Yes color revised again: soft emerald, per a reference screenshot

jay shared a screenshot of a soft mint-green "Up" pill from another app and said it's
better for Yes than the lime from Option D. Eyeballed the closest match —
`--yes: 160 84% 39%` (~Tailwind emerald-500, `#10B981`) — and re-colored `icon.svg` to
match. `--no` (magenta) untouched since jay only commented on Yes. Noted for jay: this
lands close in family to the original pre-refresh emerald (158/64/38) that was called
"generic" — different enough in saturation/lightness to be a distinct shade, but worth
knowing it's not a hard break from where this started. Flagged as an eyeballed match from a
screenshot, open to a hex tweak once seen live if it's off.

### Category-emoji glyph extended to the Featured section; deduped the lookup

jay: the Featured section (highest-volume market, top of the homepage) should have the
thumbnail too — it didn't get the emoji treatment when `MarketCard.tsx` was redone earlier.
Rather than copy-pasting the `CATEGORY_EMOJI` map a second time, moved it into
`lib/api.ts` as `categoryEmoji(category)` (next to the existing `pct`/`usd`/`cents`
formatters) and had both `MarketCard.tsx` and `app/page.tsx`'s `Featured` component import
the shared helper. Featured header is now icon + (category/Featured badges + title) side by
side. `tsc --noEmit` clean.

### Reverted emoji glyphs back to picsum photos — jay called the emoji "dull"

Full circle: jay found the category-emoji thumbnails dull and asked to go back to the free
real photos. Swapped `categoryEmoji()` out for a `marketThumbnail(slug)` helper in
`lib/api.ts` (same picsum.photos seeded-URL approach as the first pass), used in both
`MarketCard.tsx` and the `Featured` component in `page.tsx` — same small square sizing
(36px, rounded, inline with the title) kept from the layout work in between. Deleted the
now-unused `CATEGORY_EMOJI` map/`categoryEmoji` export entirely rather than leaving it
dead — grepped to confirm no references remain. `tsc --noEmit` clean. Net effect of today's
thumbnail back-and-forth: photo → "not identifiable" → emoji → "dull" → photo again,
landing back where it started but keeping the icon+title same-line layout and
footer-category placement from the iterations in between.

### Base Sepolia testnet support — chain.ts, deploy.sh, runbook

Per jay: run verex on a real Ethereum testnet instead of local anvil, as a prerequisite
for eventually hosting the app itself in the cloud. This resolves the "Task 2 chain
decision" that's been explicitly deferred since the June 19 design doc — `deploy.sh`'s
cloud deploy has been running `SEED_DB_ONLY=1` this whole time specifically because this
was never decided.

Researched the full anvil-coupling surface first (chain.ts, seed.ts, contracts deploy
scripts, deploy.sh, Dockerfile.cloud) before touching anything — key finding surfaced to
jay before proceeding: the demo-wallet model derives ALL accounts (operator + wallets 1-9)
from viem/foundry's famous **public** default mnemonic. Harmless on ephemeral local anvil,
a real problem on a public chain (anyone can derive the same keys). Asked jay to decide
target chain / RPC provider / operator-key handling via AskUserQuestion — Base Sepolia,
Alchemy or Infura (jay provides the RPC URL), jay already holds a dedicated operator
testnet key. Entered plan mode given the architectural scope (multi-file, real secrets,
cloud deploy pipeline); a Plan-agent validation pass caught several real gaps I'd have
otherwise missed — deploy key must match the runtime operator key exactly (or every
operator-signed call reverts forever), `DeployCTF.s.sol`'s silent fallback to anvil's
public key if `PRIVATE_KEY` isn't exported, and — the big one — `deploy.sh`'s seed step
was the actual gap, not just the `gcloud run deploy` call (it unconditionally wrote
`chainId: 0` regardless of any Cloud Run env/secret wiring). Plan approved, then
implemented:

- **`packages/api/src/chain.ts`**: chain now resolved from `VEREX_CHAIN_ID` (31337→foundry,
  84532→baseSepolia, default unchanged). Operator (index 0) uses `VEREX_OPERATOR_PRIVATE_KEY`
  when set (trimmed — Secret Manager values pick up trailing newlines, which
  `privateKeyToAccount` rejects), else unchanged mnemonic fallback. Demo wallets (index 1+)
  require `VEREX_DEMO_MNEMONIC` on any non-local chain — guard is lazy (throws on first
  actual `account(1+)` call, not at module import) so browse-only/DB-only mode still boots
  even with `VEREX_CHAIN_ID` set. Added a `loadChain()` sanity check comparing
  `publicClient.getChainId()` against the DB row, so a mispointed RPC URL fails with a clear
  message instead of a confusing EIP-712-mismatch revert on `fillOrder`. Hit one real viem
  typing bug — `Record<number, typeof foundry | typeof baseSepolia>` doesn't type-check
  (differing `formatters`/`serializers` make them structurally incompatible types with the
  same name); fixed by typing the map as `Record<number, Chain>` instead.
- **`scripts/deploy.sh`**: the actual fix — the "migrate + seed" step now branches on
  `VEREX_CHAIN_ID`: unset keeps today's exact `SEED_DB_ONLY=1` behavior, set threads real
  RPC/chain-id/operator-key/demo-mnemonic (read from 3 new Secret Manager secrets,
  `verex-rpc-url-<db>`/`verex-operator-key-<db>`/`verex-demo-mnemonic-<db>` — script only
  reads them, never creates or prints them) into the seed invocation and the API Cloud Run
  service's `--set-secrets`/`--set-env-vars`. Caught and fixed a real regression while
  testing: macOS's default `/bin/bash` (3.2.57, pre-4.4) throws "unbound variable" expanding
  an *empty* array under `set -u` — `"${API_ENV_ARGS[@]}"` would have broken the script's
  existing default (no-testnet) path, not just the new one. Fixed with the
  `"${arr[@]+"${arr[@]}"}"` idiom, verified against the actual `/bin/bash --version` on this
  machine (3.2.57) with both branches simulated.
- **`packages/api/scripts/gen-demo-mnemonic.ts`**: new one-off helper (uses viem's own
  `generateMnemonic`/`mnemonicToAccount` — same derivation chain.ts uses) that prints a
  fresh private mnemonic and the 5 demo-wallet addresses it derives. Ran it live to confirm
  it actually works before writing it into the runbook, not just typechecked.
- **`docs/runbooks/base-sepolia-deploy.md`**: new step-by-step runbook for jay to run
  himself (verify operator key → fund it → forge deploy → generate+fund demo mnemonic →
  seed → create the 3 Secret Manager secrets → flip `VEREX_CHAIN_ID` in `deploy.env`).
  Claude prepares code/config and instructions; jay broadcasts every real transaction.
- `.env.example` files (api + deploy) updated to document the new vars.

Verified: `tsc --noEmit` clean; local anvil flow re-tested live (`GET /wallet/1` still
resolves the correct anvil-derived address/balance with zero env vars set — confirms the
default path is byte-for-byte unchanged); `bash -n` + manual branch simulation on
`deploy.sh`. Nothing broadcast to Base Sepolia yet — that's jay's step, following the
runbook. Same branch, still uncommitted.

### Unified `PRIVATE_KEY` → `VEREX_OPERATOR_PRIVATE_KEY` everywhere; regression caught and fixed

jay asked why the runbook used the bare name `PRIVATE_KEY` in some spots instead of
`VEREX_OPERATOR_PRIVATE_KEY` everywhere. First answer was wrong — claimed the name was
essentially fixed by "Foundry convention." It isn't: `vm.envOr`/`vm.envUint("PRIVATE_KEY")`
is just a string literal this repo's own scripts happen to use, not a Foundry-reserved
name. jay caught this and redirected (interrupting a tangent where, while investigating,
Claude had also applied a real but separate fix — removing `DeployCTF.s.sol`'s silent
fallback to anvil's public key per a pre-existing tracked audit item,
`docs/analysis/2026-05-08-v1-security-audit.md` §2.5 action A1 — without confirming that
was in scope). Corrected course: renamed to `VEREX_OPERATOR_PRIVATE_KEY` consistently
across `Deploy.s.sol`, `DeployCTF.s.sol`, `DemoMarket.s.sol` (all three share
`packages/contracts/.env.example`, so partial renaming would've split them), the shared
`.env.example`, and the runbook — one name everywhere, Solidity and Node both. Also fixed
a pre-existing doc inaccuracy while touching these files: the `--private-key` CLI flag in
example commands was already silently ignored (each script explicitly passes its own key
to `vm.startBroadcast()`), removed from the examples.

Caught a real regression from the earlier fallback-removal before it shipped: today's
*documented* local-dev flow (`dev-local.sh`, `reset.sh`) never exports any key — the
removed fallback was the only thing making a fresh local seed work with zero setup. Fixed
by exporting the well-known anvil key as a default in both scripts (only if not already
set) — a better home for that convenience default than inside the Solidity script, since
both scripts are already explicitly local-anvil-only and the key can't leak onto a real
chain from there. Verified for real, not just typechecked: `forge build` clean after every
rename, `bash -n` on both scripts, then an actual live `./scripts/reset.sh` run against
the running local stack — fresh contracts deployed, 10 markets seeded, wallets funded,
zero manual key export, confirmed via `GET /wallet/1`. Final grep sweep for stray bare
`PRIVATE_KEY` references caught one more miss (`DeployCTF.s.sol` itself, from the earlier
pass) before calling this done.

### Dropped "PRIVATE" from the key's name too: `VEREX_OPERATOR_PRIVATE_KEY` → `VEREX_OPERATOR_KEY`

jay: personal coding-style convention is to not put "private" in a secret's variable name.
Renamed the just-unified name one more time, everywhere it lives — `chain.ts`, all three
Foundry deploy scripts (`DeployCTF.s.sol`, `Deploy.s.sol`, `DemoMarket.s.sol`), both shared
`.env.example` files, `dev-local.sh`/`reset.sh`'s default-export lines, `deploy.sh`'s
Secret Manager wiring (the *secret name* `verex-operator-key-<db>` was already fine,
untouched — only the env var it maps to changed), and the runbook. Left the historical log
entries describing the old name alone (a log is a record of what was true at the time, not
something to retroactively rewrite). Verified for real, not just diffed: `forge build`
clean, `tsc --noEmit` clean, `bash -n` on all three shell scripts, a grep sweep confirming
zero remaining `VEREX_OPERATOR_PRIVATE_KEY` outside the history log, and a full live
`./scripts/reset.sh` run — fresh contracts, 10 markets, funded wallets, confirmed via
`GET /wallet/1` — all with zero manual key export, same as every prior pass today.

### Consolidated chain/account logic into @verex/sdk

jay proposed the cleanup directly: only `packages/contracts` reads `.env` (Foundry's own
convention, unavoidable); every other package should go through `@verex/sdk` instead of
touching `process.env` itself. Targets a real duplication already flagged earlier today —
`packages/cli/src/clients.ts` independently re-implemented the same account-derivation/
viem-client-construction logic `packages/api/src/chain.ts` has, hardcoding its own 10
anvil private keys instead of sharing anything.

Went through full plan-mode research + a Plan-agent validation pass before writing code —
worth it, since the first draft had a real bug the validation caught: my SDK functions
were going to read `process.env` directly, which would have made `packages/cli`
accidentally sensitive to `VEREX_CHAIN_ID`/`VEREX_OPERATOR_KEY`/`VEREX_DEMO_MNEMONIC` —
API-only env vars — if a developer had them exported in the same shell from API work. The
CLI's hardcoded EIP-712 `CHAIN_ID = 31337` order domain wouldn't have moved with it,
so trades would silently target the wrong chain/key while signing for chain 31337 — a
mismatch that's hard to diagnose. Fixed by making the SDK layer take an explicit
`AccountConfig` (rpcUrl/chain/operatorKey/mnemonic) instead of reading env — each
consumer builds its own config from whatever env it actually trusts. Caught one more
subtlety while writing it: `mnemonic` had to be a *thunk* (`() => string`), not a plain
string — `chain.ts`'s existing lazy-throw-if-no-demo-mnemonic-on-a-real-chain guard would
otherwise fire even for operator-key-only calls that never touch the mnemonic at all,
since building the config object would force-evaluate it regardless.

- **`packages/sdk/src/chain.ts`** (new): `ANVIL_MNEMONIC`, `CHAINS` map, `AccountConfig`,
  `account`/`accountAddress`/`makePublicClient`/`makeWalletClient` — all parameterized,
  zero env reads. Exported via `index.ts`.
- **`packages/api/src/chain.ts`**: shrunk to env-reading + building an `AccountConfig` +
  the API-specific `ChainCtx`/`loadChain()` (Prisma-backed, correctly did NOT move to the
  SDK). Every external export name preserved — confirmed via Explore that `seed.ts`,
  `trade.ts`, `resolve.ts` all import from `./chain` unchanged, so none of them needed
  touching.
- **`packages/cli/src/clients.ts`**: 55 lines of duplicated logic → a ~35-line adapter
  that builds a config deliberately hardcoded to local anvil (`CHAINS[31337]`,
  `ANVIL_MNEMONIC`) — explicitly immune to the API's env vars — reusing the same SDK
  functions api uses. Kept the old `MAX_INDEX` bounds check locally (cli's index.ts
  accepts an unvalidated `--account <n>`, the SDK's mnemonic derivation has no inherent
  bound). `demo.ts`/`index.ts` needed zero changes.
- **Real pre-existing bug found and fixed along the way**: `packages/sdk/tsconfig.json`
  was pinned to `target/lib: ES2020` while `api` and `cli` were already on `ES2022` — a
  latent gap that only surfaced once something in the SDK imported `viem/chains` for the
  first time (my new file), which pulls in `ox` (a viem dependency) code needing
  `String.replaceAll` (ES2021+). Confirmed by temporarily removing the new file — build
  passed without it, failed with it, isolating the cause precisely. Fixed by bumping the
  SDK to `ES2022` to match its siblings.
- **Second pre-existing bug found via live smoke-testing**: `packages/cli/src/demo.ts`'s
  own direct `forge script --broadcast` call (independent of `dev-local.sh`/`reset.sh`,
  which I'd already patched earlier today) had the exact same "no `VEREX_OPERATOR_KEY`
  default" gap from the earlier fallback-removal — `pnpm --filter @verex/cli demo` failed
  outright on the first live test. Fixed with the same pattern (default to anvil's
  well-known key only if unset).

Verified for real, every step: `pnpm --filter @verex/sdk build` clean (after the tsconfig
fix), `tsc --noEmit` clean on api, `pnpm --filter @verex/cli build` clean, a full live
`pnpm --filter @verex/cli demo` run (deploy → trade → resolve → redeem, end to end) after
fixing the env-default gap, `pnpm verex balance` against the demo's live backbone
(confirmed alice's address and exact expected USDC balance), and `./scripts/reset.sh`
+ `GET /wallet/1` for the API side. Same branch, still uncommitted.

### Added Ethereum Sepolia support alongside Base Sepolia

jay: currently only has a wallet funded on Ethereum Sepolia (not Base Sepolia), and wants
the chain choice to just be a config switch — which is exactly how today's SDK
consolidation was designed. The actual code change was one line: added `sepolia`
(chain id `11155111`, confirmed exported by `viem/chains`) to the `CHAINS` map in
`packages/sdk/src/chain.ts`, alongside `foundry`/`baseSepolia`. Everything else — `chain.ts`'s
`CHAIN_ID`/`CHAIN` resolution, `deploy.sh`'s Secret Manager wiring, `seed.ts` — already
worked generically for any chain id in the map, by construction; that's the whole point
of having built it as a lookup table instead of hardcoding Base Sepolia specifically.

Since the runbook (`docs/runbooks/base-sepolia-deploy.md`) was written Base-Sepolia-
specific in its title/prose (even though most of its actual commands already used env-var
references generically), generalized and renamed it to
`docs/runbooks/testnet-deploy.md` — added a "pick your chain" table up front, replaced
the hardcoded `VEREX_CHAIN_ID=84532` in steps 5/6 with a reference to whichever chain id
was exported in step 1. Updated every live reference to the old filename (`deploy.sh`,
`README.md`, `packages/api/scripts/gen-demo-mnemonic.ts`'s header comment) — left the
history log entries describing the old filename alone, since they're a record of what was
true at the time. Also generalized the `84532`-specific comments in
`packages/api/.env.example` and `scripts/deploy.env.example` to mention both chain ids.

Verified: `pnpm --filter @verex/sdk build` clean, `tsc --noEmit` clean on api, `bash -n`
clean on `deploy.sh`, grepped for zero remaining live references to the old runbook
filename, and loaded the built SDK directly to confirm `CHAINS` now has all three entries
(`31337`, `84532`, `11155111`). Same branch, still uncommitted.

### Runbook: actually use `.env` (not raw `export`), per jay's two follow-ups

jay caught the runbook (`docs/runbooks/testnet-deploy.md`) contradicting the "use `.env`
locally" answer from two turns earlier — step 1 had raw `export VEREX_...=...` commands
instead. Real nuance, not just moving text into a file: `VEREX_OPERATOR_KEY` genuinely
just needed to move (Foundry auto-loads `.env` from the script's directory, and
`vm.envUint` reads it internally) — but `VEREX_RPC_URL` is used as `--rpc-url
$VEREX_RPC_URL` on the command line, a shell-level substitution that happens *before*
forge runs; `.env` alone doesn't reach that. Fix: keep it in `.env` (right place for
the value) but load it into the shell once with `set -a; source .env; set +a` instead of
typing `export` by hand — same file, properly loaded, matches the "share one file across
tools" pattern from two turns ago. Added a `VEREX_RPC_URL` entry to
`packages/contracts/.env.example` for this (didn't have one before).

jay's immediate follow-up: also add `VEREX_CHAIN_ID` to the same file, for the same
reason — even though no contracts script actually reads it (RPC URL alone determines the
chain), keeping it alongside `VEREX_RPC_URL`/`VEREX_OPERATOR_KEY` means one `source`
loads everything the deploy + Secret Manager steps need, rather than mixing "some via
`.env`, one via manual export" in the same runbook section. Added it, defaulted to
`31337` (matches `VEREX_RPC_URL`'s local-anvil default — an inconsistent default pairing,
localhost RPC with a testnet chain id, would have been worse than no default), removed
the now-redundant inline `export VEREX_CHAIN_ID=...` from runbook step 1.

For the API-side seed step (step 5), turned out simpler than the contracts step —
`seed.ts` uses `dotenv`, which reads `packages/api/.env` directly with zero shell
involvement, so those values just go in the file, no sourcing needed. Kept
`USDC_ADDR`/`CTF_ADDR`/`EXCHANGE_ADDR` as inline one-time values rather than adding them
to `.env` too, since they're only needed for this single seed invocation — the API reads
deployed addresses from the DB afterwards, not from env, so putting them in a persistent
file would be misleading (implies they're live config, when they're really a one-shot
input consumed once).

### DeployCTF.s.sol: interleaved per-step deploy labels

jay's actual Sepolia deploy (real broadcast, first live use of the runbook) hit exactly
the ambiguity flagged two turns ago — the `ConditionalTokens` deployment printed with no
`Contract:` name in forge's `--broadcast` summary, since it's a raw `create()` from
externally-sourced bytecode (not a `new ContractName()` call forge can match to a
compiled artifact it knows). That specific summary line isn't something a script can
control — it's forge's own artifact-matching, not `vm.label` or anything else callable
from Solidity. So instead of trying to fix the unfixable, made the *script's own* output
unambiguous: added a `console2.log` right after each of the three deploys
(`[1/3] MockUSDC deployed: ...`, `[2/3] ConditionalTokens deployed: ... <- unlabeled in
the broadcast summary, see comment above`, `[3/3] CTFExchange deployed: ...`), printed in
the same order the three broadcasts happen, so they can be matched up positionally
against the (still-ambiguous) forge summary. Also added `vm.label()` for all three
addresses — doesn't touch the broadcast summary either, but does make trace output
(`-vvvv`) show names instead of raw addresses. Kept the existing end-of-run summary block
(`=== v2 (CTF) backbone deployed ===` + the ready-to-copy `export USDC_ADDR=...` line)
unchanged — this is additive, not a replacement.

Checked `packages/api/prisma/seed.ts`'s output-parsing regex (`` `${label}:\s*(0x...)` ``,
requires the label immediately followed by `:`) before touching anything — the new lines
say "MockUSDC **deployed**:" not "MockUSDC:", so no collision; confirmed by actually
running `./scripts/reset.sh` end-to-end afterward, not just reasoning about it. Verified:
`forge build` clean, a direct `forge script ... --broadcast` run against local anvil
showing the new `[1/3]`/`[2/3]`/`[3/3]` lines print correctly and in order, a full
`reset.sh` run (parses the new output correctly, seeds 10 markets), and `GET /wallet/1`
against the running API. Same branch, still uncommitted.

### gen-demo-mnemonic.ts now funds the 5 demo addresses itself

jay: automate the manual `for addr in ...; do cast send ...; done` loop from runbook step
4 — have `packages/api/scripts/gen-demo-mnemonic.ts` send the 0.01 ETH itself instead of
jay copy-pasting 5 addresses into a shell loop. Built on the SDK work from earlier today:
uses `@verex/sdk`'s `makeWalletClient`/`makePublicClient` with an explicit `AccountConfig`
(operator key + whichever chain `VEREX_CHAIN_ID` resolves to) — same pattern `chain.ts`
and `cli/clients.ts` already use, no new plumbing needed. Sends sequentially and awaits
each `waitForTransactionReceipt` before the next send (no shared nonce manager on a
wallet client — sequential + confirmed avoids the exact nonce-race class flagged as a
known risk earlier in this session, rather than reintroducing it here). Backward
compatible: if `VEREX_OPERATOR_KEY`/`VEREX_RPC_URL` aren't set, it still prints the
mnemonic and addresses and just skips funding with a clear message, instead of crashing.
Updated the runbook's step 4 to match — the manual `cast send` loop is gone.

Verified live, not just typechecked: ran it against local anvil with
`VEREX_OPERATOR_KEY`/`VEREX_RPC_URL`/`VEREX_CHAIN_ID` set — funded all 5 addresses,
confirmed one balance directly via `cast balance` (exactly 0.01 ETH landed) — then ran it
again with those env vars unset to confirm the skip-funding path still works cleanly.
`tsc --noEmit` clean. Same branch, still uncommitted.

### gen-demo-mnemonic.ts: added missing `dotenv/config` import

jay asked whether running `pnpm exec tsx scripts/gen-demo-mnemonic.ts` (runbook step 4)
automatically loads `.env` — checked, and it didn't: `seed.ts` has `import
"dotenv/config"` at the top, but that line was never added to `gen-demo-mnemonic.ts` when
the funding feature was built earlier, so the script only ever saw values already
exported in the current shell. Fixed with the identical import `seed.ts` already uses.
Didn't live-test this specific run against `packages/api/.env`, since jay's real file
already has a real funded Sepolia operator key in it, and the script generates a brand
new random mnemonic every run — executing it would send 5 real transactions funding
throwaway addresses, not something to trigger just to prove a one-line import works.
Relied instead on `tsc --noEmit` (clean) plus the fact this is the exact same
`dotenv/config` pattern already proven working in `seed.ts` all day.

### testnet-deploy.md: added a balance-check command after step 4's funding

jay: add a check command after the funding step so the 5 demo-wallet balances can be
verified independently, not just trusted because the script didn't error. Added a `cast
balance` loop (same shape as the `cast send` loop step 4 replaced) right after the
funding explanation — pointed out that the script already waits for each transfer's
receipt before printing its hash (so a silent failure isn't actually possible), but the
independent check is worth having anyway.

### README: link the new Base Sepolia runbook from the Deploy section

Per jay: reference the new runbook from the root README so it's discoverable. Added a line
right after the existing `### Deploy (GCP Cloud Run + Cloud SQL)` section pointing at
[docs/runbooks/base-sepolia-deploy.md](../runbooks/base-sepolia-deploy.md), noting the
default (no `VEREX_CHAIN_ID`) still deploys with trading disabled.
