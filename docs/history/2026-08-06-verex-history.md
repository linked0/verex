# 2026-08-06 — verex

Source docs: [docs/tasks/current-plan.md](../tasks/current-plan.md) (wave 2 — UMA oracle
adapter). Continues the adapter deploy prep logged in
[2026-08-05](2026-08-05-verex-history.md).

### Fund operator with WETH for UMA bonds

**Cause:** the UMA readiness check found one real gap — the operator held 0.1765 ETH but
0 WETH, and UMA will not take MockUSDC as bond currency (`isOnWhitelist` → true only for
WETH on Sepolia). jay: "you can deposit now."
**Reasoning:** wrapping ETH via `WETH9.deposit()` is the direct path — no faucet, no
bridge, and the operator already held enough ETH. Verified preconditions before sending
rather than trusting the env: RPC chain id 11155111 matches `VEREX_CHAIN_ID`, and
`symbol()` on `0x7b79995e…E7f9` returns `WETH` (confirming the address is the real WETH9,
not a typo'd contract).
**Change:** sent `deposit()` with 0.05 ETH from the operator EOA
`0xABDB93C5642f3342D5195fcf8c1A735e32266d8B` on Sepolia. No code changed.
**Result:** operator WETH 0 → 0.05, ETH 0.2765 → 0.2264 (0.05 wrapped + ~0.000075 gas).
Both remaining UMA prerequisites (ETH for gas, WETH for bonds) are now satisfied; adapter
deploy is unblocked.

> Note: a malformed shell pipeline also fired a second, 0-value `deposit()` in the same
> step. Harmless — `deposit()` with zero value mints nothing — but it burned a little gas
> and suppressed the real tx hashes from the output, so the deposit had to be confirmed by
> reading `balanceOf` afterwards instead of from the receipt.

### Seed had no UMA market at all

**Cause:** jay asked whether a seed already existed for UMA resolution. It did not — the
seed recorded `umaAdapterAddr` into `ChainConfig` but every market it created was
operator-resolved, so a freshly seeded environment had no way to exercise the propose →
resolve path.
**Reasoning:** made it one market, not a flag on the existing ten. The UMA lifecycle needs
a bond, a proposal, and a liveness wait per market; converting the whole seed would turn
every environment reset into a multi-market UMA chore. It is also skipped silently when
the manifest has no `umaAdapter` rather than failing — the adapter must not become a hard
dependency of seeding, since most environments won't have one.
**Change:** `seedOneMarket` gained an optional `uma` argument threading through to
`createBinaryMarketOnChain`; added `UMA_SEED` (`uma-eth-above-6k-2026`) with deliberately
over-specified resolution criteria, plus `UMA_SEED_BOND`/`UMA_SEED_LIVENESS` mirroring
`group-create.ts`.
**Result:** verified on a Sepolia fork — `[4b] uma-eth-above-6k-2026 (UMA-resolved)`, with
`oracleType=UMA`, criteria stored (336 chars), `questionId == keccak256(ancillaryData)`,
the adapter holding the question at 0.01 WETH bond, and the other 31 markets untouched as
`OPERATOR`. Without an adapter the seed logs `[4b] no UMA adapter … skipping` and proceeds.

### One-command adapter deploy, and the UMA runbook split out

**Cause:** jay — "create a script to deploy the UMA adapter … show me step in deploy
markdown file and step to test in local mode." The forge script existed but the two steps
that must not be separated (deploy, then record) were still manual.
**Reasoning:** paired them in one wrapper because forge's `broadcast/run-latest.json` is
per chain id and staging/prod share Sepolia — a gap between the steps lets the next deploy
on that chain overwrite the artifact the recorder reads. Preflight refuses rather than
warns on an existing adapter (a new one cannot inherit the old one's markets) and warns
without blocking on zero WETH (deployable, but no answer can be proposed).
**Change:** `scripts/deploy-uma-adapter.sh` (`DRY_RUN`, `FORCE`, `RPC_URL` override for
forks); new `docs/runbooks/uma-adapter.md` carrying the whole procedure — prerequisites,
deploy, seed, per-market lifecycle, three local-test modes, troubleshooting table; and
`deploy.md` §2b reduced to a pointer so the procedure lives in exactly one place.
**Result:** the wrapper was exercised against a Sepolia fork end to end — preflight,
deploy, `save-uma-adapter`'s seven checks, then the seed picking the adapter up. Local
testing is documented as a Sepolia **fork** rather than plain anvil, because UMA has no
anvil deployment and a fork tests the real oracle instead of our understanding of it.

### Staging UMA adapter is live — and the manifest alone could not prove it

**Cause:** jay deployed the adapter to staging himself and asked whether the recorded
address was all that was needed, or whether it had to be written down somewhere else.
**Reasoning:** the manifest diff was not sufficient evidence. `CREATE` derives an address
from (deployer, nonce), and the earlier fork verification branched from the same operator
nonce — so the fork run and the real run produced the *identical* address
`0x1B45F820…ab00AC`. Reading `deployments.json` could not distinguish "jay's real deploy"
from "leftover fork address I failed to revert"; only the chain could.
**Change:** none to code — verification only, against the real Sepolia RPC.
**Result:** confirmed live: 8977 bytes of code at the address, `ctf()` matches staging's
recorded CTF, `oo()` is UMA's Sepolia OptimisticOracleV2, `admin()` is the operator. So the
answer is yes — nothing to hand-record — with two caveats that are mechanism, not
paperwork: the manifest edit is still **uncommitted** (it is the seed's and CD's source of
truth, so it only travels once committed), and `ChainConfig.umaAdapterAddr` is written
*only* by `seed.ts`, so staging's API keeps reporting `umaAvailable: false` and the create
page keeps hiding the UMA option until the staging seed runs.

### Docs restyled to the Read-the-Docs layout

**Cause:** jay — "I want the Docs should readthedocs style." The docs shipped with a
right-hand card panel, which reads as a sidebar bolted onto an app rather than as
documentation.
**Reasoning:** the RTD look is three structural choices, not a colour scheme: the table of
contents moves to a dark rail on the **left** and stays put; the current page's own
headings nest *inside* its entry rather than living in a second box; and reading order gets
a prev/next footer, because a sidebar serves jumping while a pager serves reading straight
through. Kept the dark palette fixed (`#343131` / `#2980b9`) instead of theme-driven — a
light-mode sidebar reads as "some sidebar", not as docs — while the content column still
follows the theme toggle, which works because the two sit side by side rather than
overlapping. The filter box is a real client-side filter rather than a decorative input;
only `{slug, title, group}` crosses to the client, so no locale's prose ships in the
bundle.
**Change:** new `RtdSidebar` (server shell) + `RtdNav` (client: filter, and an
IntersectionObserver scroll-spy that walks the highlight down the current doc's anchors) +
`DocsPager`; both docs pages restructured to a `[300px_1fr]` flex with a breadcrumb rail;
`DocsSidebar.tsx` renamed to `DocIcon.tsx` since only the icon resolver survived; four new
i18n keys in both locales.
**Result:** typecheck and build clean; `/docs/[slug]` 6.69 kB, 112 kB first load. Not yet
looked at in a browser — jay is mid-reset and will click through.

### A local-testing runbook, and where it belongs

**Cause:** jay — "add test docs for how I can test for this new features? I can't decide
which folder it should belong to."
**Reasoning:** put it in `docs/runbooks/` rather than a new folder. Runbooks are already the
"how to actually do a thing, step by step" genre, and `uma-adapter.md` §5 is literally the
same kind of content — a new `docs/testing/` would split one genre across two directories
for no gain. Left the UMA section where it is (it needs a Sepolia fork and belongs with its
feature) and cross-linked instead. Wrote each check as *what to expect*, not what to click:
a step you cannot fail is not a test.
**Change:** `docs/runbooks/local-testing.md` — the clean-shell guard (a stale
`VEREX_RPC_URL` turns `reset.sh` into a real-Sepolia deploy), reset, the RTD docs layout,
locale and theme, the `/create` oracle probe as a **negative** test, the hybrid-AMM
behaviours, trading, and an explicit "not testable on plain anvil" table.
**Result:** the `/create` check is the only one that can catch a costly bug — if the UMA
option appears with `umaAvailable: false`, a user could create a market bound to a
non-existent adapter, which is unresolvable forever rather than repairable.

### Hybrid AMM Phase A has no UI surface, deliberately

**Cause:** jay asked where the UI/UX differs for the hybrid AMM feature.
**Reasoning:** it doesn't, and that is worth recording rather than treating as an oversight.
Phase A is off-chain quoting only — LMSR decides where the operator's ladder centers
(`lmsr.ts`, `mm.ts`); no component was added, nothing is labelled "AMM", and
`packages/contracts/src/` has no pool contract. The feature is visible as *behaviour*:
a populated book on an untraded market, quotes that track the operator's exposure rather
than the last print, group prices that sum to 1 by construction, and prices that stay
inside (0, 1) at the tails where a CPMM would quote a Yes token above $1.00.
**Change:** documented as §6 of the new runbook, including a "what Phase A is not" note so
the absent pool/routing UI reads as scope, not as a missing feature.
**Result:** answers the question without inventing a UI element to justify the feature.

### Docs: drop the card index, and stop borrowing RTD's palette

**Cause:** jay, after clicking through the new layout — "I want the default page to be shown
and cards is needed anymore. And the color of the left panel is weird."
**Reasoning:** the card index was a second copy of the sidebar's navigation with an extra
click in front of it, so `/docs` now redirects to the first doc in reading order — what RTD
itself does when you open a project. On colour: borrowing RTD's *structure* was right,
borrowing its *palette* was not. Its warm grey (#343131) and cyan-blue (#2980b9) both fight
this app, whose greys sit on hue 240 and whose primary is indigo — two different colour
systems on one screen is exactly what reads as "weird". Kept the rail dark under both themes
(a light version reads as "some sidebar", not as docs) but moved it into the app's own hue
family.
**Change:** `/docs` → `redirect()` to `DOCS[0]`, card grid deleted; rail recoloured to
`hsl(240 10% 13%)` with the header block on `--primary`, active/nested states on matching
cool greys with an indigo left border; the sticky container switched from `max-h` to a fixed
`h-[calc(100vh-3.5rem)]` so the dark block reaches the bottom of the viewport instead of
stopping mid-page on a short document.
**Result:** build clean; `/docs` is now 142 B (a redirect), `/docs/[slug]` unchanged at
6.7 kB. The `max-h` → `h` fix was a real bug, not a preference — visible in jay's screenshot
as the rail ending partway down the page.

### Docs rail moved fully onto the app's own tokens

**Cause:** jay — "Can you not borrow the palette from RTD but use our palette?" The previous
pass had only *translated* RTD's palette into this app's hue family; the rail was still a
hard-coded dark that ignored the theme.
**Reasoning:** the tell was that it stayed dark in light mode. That is RTD's decision, not
ours, and a fixed hex is a second palette to maintain — right in one theme, wrong in the
other, and invisible to any future change to the design tokens. Borrowing RTD's *structure*
(contents on the left, the current page's headings nested inside its own entry) costs
nothing and is what jay actually asked for originally; borrowing its colours was the part
that read as foreign.
**Change:** every colour in `RtdSidebar`/`RtdNav` replaced with semantic tokens — rail
`bg-muted/40` behind a `border-r`, header and section rules on `border`, links
`text-muted-foreground` → `hover:bg-accent/50`, active item `bg-accent` with a
`border-l-primary` marker, nested anchors on `bg-background/60` with the current one in
`text-primary`. No hex, no `hsl(...)`, no `text-white`.
**Result:** build clean, and the rail now follows the theme toggle like every other surface.
Grep for hard-coded colour under `components/docs/` returns nothing, which is the property
worth keeping.

### Sidebar hierarchy inverted, and the origin of the name recorded

**Cause:** two from jay while reading the rebuilt docs — the group captions read as smaller
than the documents under them, and the origin of the name "Verex" was nowhere in the repo.
**Reasoning (typography):** the active document was `text-sm` semibold in the primary colour
while its own group caption was `0.7rem` muted, so the highlight looked like the top of the
hierarchy and the caption like a label hanging off it. A caption that contains things has to
out-weigh even the selected item inside it. Went to a strict descending scale rather than
just nudging one value — caption 14px / document 13px / section anchor 12px — so the rule is
visible in the code and survives the next edit.
**Reasoning (the name):** confirmed with jay rather than inferred. *ver-* (Latin *verus* /
*veritas*, "true") + *-ex* (exchange) — the same claim the README tagline "truth through
exchange" has been making all along, but stated nowhere a reader would find it. Wrote it as
a claim about method: most systems that need to know what happened appoint someone to say
so, while a market makes being right pay and lets the answer settle in the trading. That
framing also explains why the oracle work carries more weight than its size suggests — while
the operator reports every outcome the last word still belongs to an authority, so the name
is only half earned until resolution moves to UMA.
**Change:** `RtdNav` caption `text-sm font-bold uppercase text-foreground`, document
entries `0.8125rem`, nested anchors `text-xs`; new `name` section at the end of
`content/docs/overview.ts` in both locales.
**Result:** build clean. The etymology now lives in the doc a reader actually opens first
from the Technical Background group, not only in the README's one-line tagline.

### The name gets its own page, under a new "About" group

**Cause:** jay — "Think should be in one separate page with logo." The etymology had been
appended as a closing section of *Verex in one page*.
**Reasoning:** it was the wrong home. That doc is a technical map whose sections all answer
"how does this work"; an etymology at the end reads as a footnote to the architecture rather
than as the thing the architecture is trying to earn. On its own page it can make the actual
argument — that most systems appoint someone to say what happened, while a market makes
being right pay and lets the answer settle in the trading — and can state plainly that the
name is currently **half earned**, since the operator still has the last word until
resolution moves to UMA. Gave it a third group rather than filing it under Guide or
Technical, because it is neither.
**Change:** new `content/docs/name.ts` (both locales: method · why the price is the claim ·
half-earned · the mark) and the section removed from `overview.ts`; `DocGroup` gains
`"about"`, `RtdNav` takes its groups as a prop instead of hard-coding the pair; the logo
extracted from `SiteNav` into a shared `VerexMark` and rendered via a new opt-in
`Doc.hero = "mark"` rather than a slug special-case.
**Result:** build clean. The mark's meaning is written down for the first time — a ring
quartered into two opposing pairs, Yes and No inside one circle, the ring being the
constraint that a question's outcome prices always sum to $1.

### Scroll-spy froze near the end of a document

**Cause:** jay, with a screenshot — the sidebar highlighted "5 · 포트폴리오와 상환" while
reading further down the page.
**Reasoning:** the IntersectionObserver watched a band across the **top 30%** of the
viewport (`rootMargin: "-72px 0px -70% 0px"`). The last sections of a document can never
scroll into a band that high — the page runs out of room first — so nothing new ever
intersects and the highlight stays on whichever section last occupied the band. The
`if (first)` guard made it worse by never clearing. It looked correct in testing because
the failure only shows in the final screenful, which is exactly where you stop scrolling
and stop watching the sidebar.
**Change:** replaced with a deterministic rule — the current section is the **last** one
whose top has crossed a line 96px down (sticky header + margin), recomputed on scroll
through `requestAnimationFrame`, plus an explicit bottom clamp: once the page cannot scroll
further, the last section is by definition the one being read.
**Result:** build clean. The general lesson worth keeping: a viewport-band scroll-spy has a
dead zone at the end of every document, and the fix is not a wider band but a rule that does
not depend on the content reaching a position it cannot reach.

### The /create oracle check was documented wrong — and expanded

**Cause:** jay asked for more detail on §5 of the local-testing runbook. Reading the actual
component to write it turned up an error in my own doc: it said "expect no UMA option", but
`CreateClient.tsx` **renders the card and disables it**, with the reason printed on it.
**Reasoning:** disabled-with-a-reason is the better behaviour and worth stating as such — a
hidden control teaches the reader nothing and cannot be told apart from a component that
failed to render. More importantly, the original text pointed the tester at the wrong
failure. "Is the card there?" always passes; the real signals are whether it is *clickable*
and whether the reason text is right. And a disabled button is a courtesy, not a defence:
the check that actually matters is a direct `POST /market-groups` with `oracleType: "UMA"`,
because the UI is the only thing a curl request skips.
**Change:** §5 rewritten into six parts — what you should see, the chain of state from
"no adapter on chain" through `ChainConfig` → `/config` → the disabled card, the second
(binary-only) condition and why it is not visually testable on anvil, the direct-POST test
with its expected 400, why this is the one check worth stopping for, and a pointer to the
fork for the positive case.
**Result:** the failure mode is now spelled out end to end — creation does not revert
against a non-existent adapter, the market looks normal and trades normally, and at
resolution there is no contract to call and no way to repoint it, because a different
resolver hashes to a different `conditionId`. That is why validation sits in
`createMarketGroup` before any transaction, not in the job that executes it.

### §6 rewritten so the hybrid-AMM check has something to fail on

**Cause:** jay asked for the hybrid-AMM section of the local-testing runbook in more detail.
**Reasoning:** the original said "expect 5 bids and 5 asks" and counted array lengths, which
is a step that cannot really fail — a ladder of the wrong shape, in the wrong place, built
from the wrong `q` all still return 5. Detail here means *predicted numbers*: the ladder is
`center ± 0.01·i` with sizes `total · [5,4,3,2,1]/15`, and the centre is
`e^(q/b)/(e^(q/b)+1)`, so selling 50 Yes at `b = 250` must land the centre on **0.5498**, not
merely "higher". A check with an arithmetic answer catches a wrong implementation; a check
with a length does not.
**Change:** §6 expanded to six parts — the formula and `b`; the ladder's exact construction
with a worked table and three edge cases that look like bugs (both outcomes laddered, fewer
levels near `PRICE_FLOOR`/`CEIL`, no quotes under 1 token of inventory); the predicted centre
after a known fill; **the distinguishing test**; group sum-to-1 including the one place
`renormalize()` restores it by hand; why LMSR over CPMM with the `b·ln(n)` = 173-token bound;
and what Phase A is not.
**Result:** the distinguishing test is the one that earns its place. `operatorNetSold()`
counts only fills whose maker is account #0, so a user-to-user trade must leave the quote
untouched — constructed by resting a bid *inside* the operator's spread and market-selling
into it. Every other check in the section would also pass under the old "centre follows the
last print" rule; only this one fails.
