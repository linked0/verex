# Verex — What to Check / Analyze (review of work to date)

> Generated 2026-06-17. A prioritized review list for the work completed through
> **S2.4** (SDK + CLI migrated to the Polymarket CTF stack). This is *what to verify
> and decide next*, not a status report — see `docs/features/README.md §1.4` for the roadmap
> and `docs/history/README.md` for the milestone log.

## TL;DR — current state
- Main line is the **v2 CTF backbone** (Polymarket CTFExchange + Gnosis ConditionalTokens + MockUSDC). v1 parimutuel lives in the `planning` branch only.
- **34/34** Foundry tests pass; SDK vitest 3/3 pass; E2E demo works on anvil (BUY @ $0.60 → resolve → redeem → +40 USDC).
- Next milestone is **S2.5 (MM Agent v0)**, currently blocked on two decisions + one test gap.

## 1. Blockers — fix/verify before S2.5
- [ ] **`@verex/api` broken build.** `packages/api/src/index.ts` still imports the v1 `VerexClient` that no longer exists → breaks a full monorepo build/CI. Replace with the CTF client or a stub (~10 min). *Check: does `pnpm -r build` pass after the fix?*
- [ ] **`matchOrders` has zero test coverage.** Only `fillOrder` is tested (`packages/contracts/test/CTFFillOrder.t.sol`). S2.5 needs `matchOrders` paths (MINT = two BUYs, MERGE = two SELLs, COMPLEMENTARY = BUY vs SELL). Add these tests *before* picking the MM model.
- [ ] **`DemoMarket.s.sol` never broadcast-tested.** Script compiles but the author deferred the live anvil run. Do the 7-step manual verification in `docs/history/2026-05-26-s2-fillorder-e2e.md §4.2`.

## 2. Decisions needed (your input) — analyze trade-offs
- [ ] **Q-S2.3.2 — MM model: `matchOrders` vs `fillOrder`** (HIGH). Paper recommends `matchOrders` (less operator capital locked, better audit precedent). Decide before building the MM agent. Source: `docs/history/2026-05-26-s2-fillorder-e2e.md §6`.
- [ ] **Q-S2.3.3 — fee policy: `feeRateBps` 0 vs nonzero** (HIGH). Runtime default is 0 but unenforced; affects business model + SDK slippage guard. Source: `docs/history/2026-05-27-s2.4-sdk-cli-migration.md §6`.
- [ ] **Q-S2.3.4 — operator role: EOA vs multisig** (MEDIUM). All Stage-1 scripts use a single `DEPLOYER` EOA. Design the operator runbook before testnet.
- [ ] **B2 — AA strategy: ERC-4337 vs EIP-7702 vs hybrid** (HIGH, S7). Blocks one-click betting, auto-claim delegate, gasless onboarding. Owed an ADR: `docs/architecture/0002-aa-strategy.md` (not yet written). Input: `docs/analysis/eip-7702-research.md`.

## 3. Security / contract areas to analyze
- [ ] **EIP-712 off-chain parity.** vitest golden digest matches the on-chain `hashOrder`, but visually verify the domain + `Order` type encoding in `packages/sdk/src/orders.ts` against `CTFFillOrder.t.sol`.
- [ ] **Upstream contracts assumed audited.** CTFExchange + Gnosis CTF are not custom-audited here (relied on Polymarket/Gnosis). Confirm the **submodule pins** point at the audited commits.
- [ ] **`AutoClaimDelegate.sol` (B6, S7) must be audit-grade** — only `redeemPositions` allowed; revoke/authority boundaries need formal review before any session-key/AA work.
- [ ] **Dev-key footgun.** Anvil default private keys are hardcoded in `packages/cli/src/clients.ts`. Public keys, but add a chainId guard (A2) so they can't be used against a funded testnet/mainnet.
- [ ] **v1 audit mostly obsolete.** `docs/analysis/2026-05-08-v1-security-audit.md`: ~70% of findings auto-resolve under v2 (A3/A4 obsolete, A5 SPOF resolved by UMA at S6). Don't spend time hardening v1.

## 4. Plan ↔ code gaps to reconcile
- [ ] **Branch state.** Confirm whether `ctf-exchange` is merged into `main` or still pending (S2.4 milestone says "merge pending"; git shows `main` @ e388ef6).
- [ ] **`packages/web` still on v1 SDK.** Scaffold likely has stale imports; will need the new `orders`/`conditions`/`exchange` surface before S3.
- [ ] **MCP-server scope.** Commit e388ef6 hints "MCP server as canonical interface" should move earlier; plan still lists it in Phase 3 (§11.1). Decide if a `packages/mcp-server/` scaffold belongs in Phase 1.
- [ ] **`questionId` convention undecided** (keccak of text vs UMA format) — affects the S6 oracle migration path.

## 5. Watch-list (external triggers — no action until fired)
From `docs/features/watch-list.md`:
- **#1 Glamsterdam BAL** → singleton-vs-factory settlement (`docs/architecture/2026-05-27-singleton-vs-factory-bal.md`).
- **#2 Native AA (EIP-7702 mainnet)** → additive vs migration; reconcile with S7.
- **#3 BundlerProvider interface split** — queued mini-PR, off critical path.

## Quick verify commands

Root uses **Turbo** — `pnpm build` / `pnpm test` / `pnpm lint` run across every package
at once. To exercise just one, `cd` into it:

| Package | Build / test command | Notes |
|---------|----------------------|-------|
| **contracts** (Solidity · Foundry) | `cd packages/contracts && forge test` | expect **34/34**. `forge test -vvv` for traces, `forge snapshot` for gas, `forge build` to compile. |
| **sdk** (TypeScript · viem) | `cd packages/sdk && pnpm build && pnpm test` | vitest, expect **3/3** (EIP-712 parity, sign roundtrip, raw-pk signer). |
| **cli** | `cd packages/cli && pnpm build && pnpm demo` — or root `pnpm verex <cmd>` | no unit tests; smoke-test the 10 commands on anvil. |
| **api** (Web API · Fastify) | `cd packages/api && pnpm build` then `pnpm dev` (tsx watch) | ⚠️ **build currently FAILS** — broken `VerexClient` import (item #1 above). Fix first, then `pnpm dev` and curl the endpoints. |
| **web** (Next.js frontend) | `cd packages/web && pnpm build` / `pnpm dev` / `pnpm lint` | may have stale v1-SDK imports (see "Plan ↔ code gaps"). |

### Whole monorepo (Turbo)
```bash
pnpm build    # turbo run build — all packages
pnpm test     # turbo run test  — contracts (forge) + sdk (vitest)
pnpm lint     # turbo run lint
```

### Local end-to-end (anvil)
Bring up a local chain, deploy the CTF stack, then drive it via CLI/SDK. The exact
7-step flow + flags are in `docs/history/2026-05-26-s2-fillorder-e2e.md §4.2` and the
S2.4 demo in `docs/history/2026-05-27-s2.4-sdk-cli-migration.md`:
```bash
anvil &                                  # local chain on :8545 (prints test private keys)
cd packages/contracts
forge script script/DeployCTF.s.sol --rpc-url http://localhost:8545 --broadcast --private-key <anvil-key>
# then DemoMarket.s.sol setup / resolve, and CLI: split | merge | redeem | order sign|fill
```

---

## How to grant Claude permissions (stop repeat prompts)

When a Claude Code tool call keeps prompting for approval, add an **allow rule** to a
settings file so it auto-approves next time. This is useful for the safe, read-only
commands a reviewer runs over and over (`git log`, `forge test`, `pnpm build`).

### Where the rules live (scope — later overrides earlier)
| File | Scope | Git | Use for |
|------|-------|-----|---------|
| `~/.claude/settings.json` | global, all projects | n/a | personal, broadly-useful rules |
| `.claude/settings.json` | this project, committed | commit | team-wide rules |
| `.claude/settings.local.json` | this project, gitignored | ignore | personal / experimental rules for verex only |

Verex already has a `.claude/settings.local.json` for repo-specific rules.

### Rule syntax (`permissions.allow` array)
```jsonc
{
  "permissions": {
    "allow": [
      "Bash(forge test:*)",   // prefix match: "forge test" + anything after it
      "Bash(pnpm build)",      // exact match
      "Read"                    // whole tool: allow all reads
    ]
  }
}
```
- `Bash(<prefix>:*)` — matches a command starting with `<prefix>`.
- `"Bash(exact command)"` — only that exact command.
- `"Read"` / `"Edit(<glob>)"` — allow a whole tool, or edits under a path.
- There are also `deny` and `ask` arrays with the same syntax (deny wins).

### Safety rule: allow read-only only
Safe to auto-allow: `git log/status/diff/show/branch`, `forge test`, `forge snapshot`,
`pnpm build/test`. **Do not** broadly allow writes — `git commit/push/reset --hard`,
`rm`, `forge script --broadcast` — keep those prompting so a human stays in the loop
(matches the after-hours workflow in `.claude/CLAUDE.md`).

### Gotcha: `cd … && git` still prompts
A compound command like `cd packages/contracts && forge test` does **not** match a
`Bash(forge test:*)` rule (it starts with `cd`, not `forge`). Either run the tool from
the directory so the command starts with the allowed prefix, or use a path flag
(`forge test --root packages/contracts`, `git -C <dir> log`). Avoid a blanket rule like
`Bash(git -C:*)` — it would also wave through `git commit`/`reset`.

### Easiest way to edit
- Run the `/permissions` panel in an interactive terminal, **or**
- ask Claude to use the `update-config` skill.

Both merge into the existing `allow` array safely — never hand-replace the whole array,
and remember invalid JSON silently disables *every* setting in that file.
