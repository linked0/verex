# Phase 1: Core (Week 1~3) — 실행 계획

`docs/principles/first-scope.md`의 Phase 1을 실제 작업 단위로 풀어낸 문서.
원칙: **단순하게 시작 / 작게 만들기 / 빠르게 검증**.

## 목표

로컬 anvil 위에서 다음 end-to-end 동선이 web UI로 완주되는 것:

> market 생성 → YES/NO 베팅 → 수동 resolve → claim

이게 끝나야 Phase 2(API/인덱서/오라클)의 의미가 생긴다.

## 범위

### 포함 (in)
- `Market`, `MarketFactory` 컨트랙트 (binary outcome, 수동 resolve)
- **Fixed-price 1:1 escrow** 방식 (LMSR/AMM 등 pricing 정교화는 보류)
- SDK: factory/market wrapper, 타입 export
- Web MVP: wallet connect, market list, buy YES/NO, my positions, claim
- **(Week 2 spike)** OpenClaw skill 스켈레톤 — read-only tool 2개로 통합 경로 검증

### 의도적으로 제외 (out)
- API 서버, DB, indexer → Phase 2
- Oracle 자동 resolve → Phase 1은 owner 수동 resolve, Chainlink는 Phase 2
- AA, cross-chain, Stripe → Phase 3
- ERC-20(USDC) 결제 → Phase 1은 native ETH escrow
- **OpenClaw skill의 서명 필요 tool** (`buy_yes/no`, `claim`) → Phase 3 (AA + session key 위임 후)

## 작업 항목

### `packages/contracts`
- `Market.sol`
  - `buyYes() payable`, `buyNo() payable`
  - `resolve(bool outcome)` — onlyOwner
  - `claim()` — winner pro-rata 분배
- `MarketFactory.sol`
  - `createMarket(question, endTime)` → `Market` 배포
  - `markets()` 조회
- 이벤트: `MarketCreated`, `Bought`, `Resolved`, `Claimed`
- Foundry 테스트
  - 양쪽 베팅 후 resolve → winner만 분배
  - endTime 이후 베팅 실패
  - 같은 market 중복 resolve 실패
  - loser claim 시 0 반환 (revert 아님)
  - invariant: 총 escrow == YES pool + NO pool (resolve 전)
- `script/Deploy.s.sol`: anvil에 factory 배포

### `packages/sdk`
- `createFactoryClient(address, publicClient, walletClient)`
- `getMarkets()`, `getMarket(address)`
- `buyYes`, `buyNo`, `resolve`, `claim`
- ABI는 `forge build` 산출물에서 import (수동 복사 금지)

### `packages/web`
- wagmi config — anvil chain (31337)
- `/` markets list (factory.markets() 호출)
- `/markets/[addr]` — 베팅 UI + 내 포지션 + claim 버튼
- factory 주소는 `.env.local` (multi-chain은 Phase 2)

### ~~`packages/openclaw-skill`~~ *(superseded — see "MCP Server v0" section below)*

The Week 2 OpenClaw-specific skill spike has been replaced by a single MCP server (`@verex/mcp-server`) that any harness — OpenClaw, Claude Dispatch, Claude Desktop, Cursor — connects to. OpenClaw skill / Dispatch connector become thin wrappers on top of MCP in a later phase. The Week 2 work item is now: scaffold the MCP server. Full spec: see "MCP Server v0 — Phase 1 Task Spec" at the bottom of this file.

## 마일스톤

| M | 시점 | 산출물 |
|---|------|--------|
| M1 | Day 3 | 컨트랙트 + 테스트 통과, anvil 배포 스크립트 동작 |
| M2 | Day 7 | SDK로 anvil 위에서 create/bet/claim CLI 시연 |
| **M2.5** | **Day 11** | **MCP server v0 scaffold + `list_markets` works from Claude Desktop on local anvil** |
| M3 | Day 14 | Web에서 메타마스크로 동일 플로우 완주 |
| M4 | Day 21 | Demo recording — 두 지갑 베팅, owner resolve, winner claim |

### Week 2 todo (Day 8~14)

Runs in parallel with Web MVP. MCP server work is time-boxed — if it slips, Web MVP takes priority and MCP rolls into Week 3.

- [ ] Scaffold `packages/mcp-server/` (folder structure, `package.json`, `tsconfig.json`, README)
- [ ] Update `pnpm-workspace.yaml` and `turbo.json` to include the new package
- [ ] Declare 4 read-only tools as stubs: `list_markets`, `get_market`, `get_position`, `get_market_stats`
- [ ] Implement `list_markets` and `get_market` against `@verex/sdk` (do not import `viem` directly)
- [ ] Smoke test: connect from Claude Desktop locally and call `list_markets` against anvil
- [ ] ADR `docs/history/0001-mcp-server-as-canonical-agent-interface.md`
- [ ] Update `docs/principles/` design doc §11.1 to MCP-first language
- [ ] (parallel track) Web MVP — markets list page, market detail page, buy UI

## 검증 기준 (acceptance)

- `forge test` 100% 통과, 핵심 invariant 포함
- Web에서 두 지갑으로 양쪽 베팅 후 winner만 비례 분배 받는 것 수동 확인
- README의 "Run locally" 절차가 실제로 작동하도록 갱신

## 리스크 & 주의

- **AMM/CLOB 욕심 금지.** Phase 1 = **v1 백본** (fixed-price escrow). [Polymarket CTF Exchange](https://github.com/Polymarket/ctf-exchange) 기반 CLOB는 **v2 백본** (Phase 2 W6~) — 확정 플랜이며 결정 사항이 아님. v1을 거치는 이유와 v1/v2 비교는 `docs/plan/README.md` §11.2 참고.
- Owner resolve 모델임을 README에 명시 (보안 가정 명확화).
- Contracts ABI를 web/sdk에 수동 복사하지 말 것 → workspace import.
- Phase 2를 미리 끌어오지 말 것 (DB, indexer, oracle 전부 후순위).
- **SDK API 설계 시 v2 (CLOB) 전환 고려**: v1의 `buyYes/buyNo` escrow API가 v2에서 `fillOrder` 류로 교체됨. 강제 결합은 아니되 인터페이스 명명/위치가 어색해지지 않게 둘 것.
- **Web 컴포넌트 v1/v2 모드 분리**: Polymarket-style UI를 v1부터 적용하되 (§2.2.6), v1엔 backend가 못 채우는 데이터는 placeholder로 (예: 실거래량 → 누적 escrow, 호가창 → 풀 비율). v2 전환 시 layout 그대로, 데이터 소스만 교체되도록 컴포넌트 분리.

---

## 후속 Phase (요약)

각 phase는 별도 `02-*.md`, `03-*.md`로 확장 예정.

- **Phase 2 (Week 4~6):** API + Postgres + indexer(Pub/Sub), Chainlink price feed 자동 resolve, USDC escrow 전환, **W6에 v2 백본 시작 — [Polymarket CTF Exchange](https://github.com/Polymarket/ctf-exchange) 통합** (§11.2 — 확정 플랜)
- **Phase 3 (Week 7~9):** ERC-4337 AA wallet, CCIP/LayerZero cross-chain 참여, Stripe → test USDC mock UX, GCP 배포 (Cloud Run → GKE). MM Agent v1이 v2 위에서 EIP-712 order signing 기반 maker로 동작
- **Phase 4 (Week 10):** ZK 검증 (optional), UI polish, demo

---

## MCP Server v0 — Phase 1 Task Spec

### Context

You are working in the Verex monorepo (`/Users/jay/work/verex`).
Verex is a Web3 prediction market dApp. The full design is in `docs/principles/` (see the v1.1 design doc).

Currently the design doc has §11.1 (TODO) which proposes integrating Verex with personal AI assistants (OpenClaw skill, Dispatch, etc.) in **Phase 3**.

We are changing this decision: instead of writing one integration per harness (OpenClaw skill, Dispatch connector, etc.), we will publish a **single MCP (Model Context Protocol) server** as the canonical machine interface to Verex. Any harness — OpenClaw, Claude Dispatch, Cursor, Claude Desktop, etc. — connects to this MCP server. The MCP server becomes the **single source of truth** for programmatic access; OpenClaw skills or Dispatch connectors (if we publish them later) become thin wrappers around it.

We are also **moving this work into Phase 1** because:
- It forces the SDK surface to be agent-friendly from day one.
- It is read-only at first (no signing required), so it does not block on AA/session keys.
- It becomes the demo entry point for the rest of the system.

### Goal of This Task

Update planning documents and scaffold the new package so that Phase 1 includes a working **read-only Verex MCP server**.

### Scope

#### In scope (this task)
1. Update `docs/principles/` design doc to reflect the new decision.
2. Update `docs/plans/01-phase-1-core.md` to add the MCP server work.
3. Add a new ADR (or equivalent) under `docs/history/` documenting the decision.
4. Scaffold `packages/mcp-server/` with package.json, tsconfig, README, and stub source files.
5. Update root `pnpm-workspace.yaml` and `turbo.json` so the new package is part of the monorepo.

#### Out of scope (do NOT do in this task)
- Writing the actual MCP tool implementations (only stubs + README of intended tools).
- Any signing / write-path tools (`buy_yes`, `claim`, etc.) — those wait for AA + session keys in Phase 3.
- Publishing to any registry.
- OpenClaw skill or Dispatch connector wrappers.

### Design Constraints

- **Stack**: TypeScript, official `@modelcontextprotocol/sdk`. Node.js worker.
- **SDK rule**: The MCP server MUST go through `@verex/sdk` for all chain reads. Do not import `viem` directly in `packages/mcp-server/`. This matches the existing rule for `mm-agent`.
- **Transport**: stdio for v0 (so it works locally with any MCP client, including Claude Desktop and Claude Code).
- **No secrets in code**: RPC URL via env var (`VEREX_RPC_URL`), chain id via env var (`VEREX_CHAIN_ID`).
- **Package name**: `@verex/mcp-server`.

### Tools to Expose (read-only, v0)

These are the tools the MCP server should advertise. For this task only declare them in the README + as stubs that throw `NotImplementedError`. Implementation comes in a follow-up task.

| Tool | Input | Output | Notes |
|------|-------|--------|-------|
| `list_markets` | `{ status?: "open" \| "resolved" \| "all" }` | `Market[]` | Calls `sdk.markets.list()` |
| `get_market` | `{ id: string }` | `Market` | Calls `sdk.markets.get(id)` |
| `get_position` | `{ user: string, marketId: string }` | `Position` | Calls `sdk.positions.get(...)` |
| `get_market_stats` | `{ id: string }` | `{ yesPool, noPool, impliedYesProb }` | Derived in SDK |

Write tools (`buy_yes`, `buy_no`, `claim`, `subscribe_market`) are **deferred to Phase 3** — list them in the README under a "Future tools (post-AA)" section but do not stub them.

### Concrete Deliverables

1. **`docs/history/0001-mcp-server-as-canonical-agent-interface.md`** — short ADR (Context / Decision / Consequences) explaining why MCP is now the single agent interface and why it moved to Phase 1.

2. **`docs/principles/` design doc edit** — modify §11.1:
   - Change "1차 후보 하네스: OpenClaw" to "1차 인터페이스: MCP 서버 (`@verex/mcp-server`). 하네스(OpenClaw / Dispatch / Claude Desktop / Cursor 등)는 모두 이 MCP 서버를 경유한다."
   - Move "사용자 측 = OpenClaw skill, 시스템 측 = Claude Agent SDK" framing to: "공통 인터페이스 = MCP. OpenClaw skill / Dispatch connector는 후속 단계에서 MCP 위의 thin wrapper로 발행."
   - Mark questions 2 (skill 배포 경로) as "MCP가 정답이므로 해소".
   - Question 1 (AA + session key)은 그대로 — write tools 시점에 다시 등장.

3. **`docs/plans/01-phase-1-core.md` edit** — add a new section (suggest: §4 or appended) titled "MCP Server v0 (read-only)" containing:
   - Subtask: scaffold `packages/mcp-server/`
   - Subtask: declare 4 read tools as stubs
   - Subtask: implement `list_markets` + `get_market` against `@verex/sdk`
   - Subtask: smoke test by connecting from Claude Desktop locally and listing markets on a local anvil/foundry node
   - Acceptance: from Claude Desktop, the user can ask "list current Verex markets" and see results that match `cast` queries against the deployed Market contract.

4. **`packages/mcp-server/`** — scaffold:
   ```
   packages/mcp-server/
   ├── src/
   │   ├── index.ts           # entry: starts MCP stdio server
   │   ├── server.ts          # registers tools
   │   ├── tools/
   │   │   ├── list-markets.ts
   │   │   ├── get-market.ts
   │   │   ├── get-position.ts
   │   │   └── get-market-stats.ts
   │   └── config.ts          # env loading
   ├── test/
   │   └── server.test.ts     # one trivial test that the server boots
   ├── package.json
   ├── tsconfig.json
   └── README.md
   ```
   - `package.json`: name `@verex/mcp-server`, `private: true`, depends on `@verex/sdk` (workspace:*) and `@modelcontextprotocol/sdk`.
   - `README.md`: how to run locally (`pnpm --filter @verex/mcp-server dev`), how to add to Claude Desktop's `claude_desktop_config.json`, list of v0 tools, list of future tools (write path), and the SDK-only rule.
   - Each tool stub returns `throw new Error("NotImplemented: <tool> ships in a follow-up task")` except `list_markets` and `get_market`, which call the SDK if it exposes those methods, otherwise also throw NotImplemented.

5. **Root config edits** — ensure `pnpm-workspace.yaml` includes `packages/mcp-server` and `turbo.json` pipelines (`build`, `dev`, `test`, `lint`) cover it the same way as other packages.

### Verification

After your changes, the following should all pass:

```bash
pnpm install
pnpm --filter @verex/mcp-server build
pnpm --filter @verex/mcp-server test
pnpm --filter @verex/mcp-server dev   # should start and wait on stdio
```

And manually:
- `docs/history/0001-*.md` exists and is non-empty.
- `docs/principles/` design doc reflects MCP-first language in §11.1.
- `docs/plans/01-phase-1-core.md` has the new MCP section with subtasks and acceptance criteria.
- `packages/mcp-server/README.md` lists the 4 v0 tools and the deferred write tools.

### What to Do If You Hit Ambiguity

- If `@verex/sdk` does not yet export `markets.list()` / `markets.get()`, leave the tool stubs throwing NotImplemented and add a note in `docs/plans/01-phase-1-core.md` listing the SDK methods that need to be added (do not modify the SDK in this task).
- If you find that §11.1 has already been edited toward MCP language by a previous run, reconcile rather than duplicate.
- Do not invent new tools beyond the four listed.
- If unsure about a structural decision, leave a `// TODO(verex):` comment and continue — do not block.

### Final Output

When done, summarize in chat:
1. Files created (paths).
2. Files modified (paths).
3. Any decisions you had to make that weren't specified.
4. The exact commands the user should run to verify.
