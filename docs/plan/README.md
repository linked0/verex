# Verex 프로젝트 설계 문서 (v1.1)

> "사용자는 단순히 질문에 베팅하고, 시스템은 자동으로 결과를 정산한다."

---

## 1. 프로젝트 개요

### 1.1 목표

Verex는 다음을 목표로 하는 Web3 애플리케이션이다:

- 예측 시장(Prediction Market) 기반의 탈중앙화 애플리케이션 구축
- Account Abstraction을 통한 UX 개선
- Cross-chain 상호운용성 구현
- Oracle 기반 자동 정산
- Web2 사용자를 위한 결제 경험 (Stripe)
- **자동 마켓 메이커 에이전트(MM Agent)를 통한 초기 유동성 공급**
- 확장 가능한 인프라 (GCP + Event-driven)

### 1.2 핵심 컨셉

사용자는 질문에 베팅만 하면 되고, 결과 정산·유동성·결제 경험은 시스템이 자동화한다.

### 1.3 프로젝트 범위

**포함**

- 스마트컨트랙트 (Prediction Market)
- 프론트엔드 dApp
- 백엔드 API 및 인덱서
- Oracle (Chainlink)
- Account Abstraction
- Cross-chain 기능
- Stripe 기반 결제 UX (Mock)
- **MM Agent (자동 마켓 메이커, 별도 subproject)**
- GCP 기반 인프라

**제외 (초기 단계)**

- 완전한 탈중앙화 오라클 설계
- 실제 법정 화폐 → 암호화폐 온램프
- 고급 트레이딩 기능 (CLOB 등) — **v1 (Phase 1)** fixed-price 1:1 escrow / **v2 (Phase 2 W6~)** [Polymarket CTF Exchange](https://github.com/Polymarket/ctf-exchange) 기반 CLOB로 백본 교체 (§11.2 — 확정 플랜). UI는 v1부터 Polymarket-style (§2.2.6)

### 1.4 주간 일정 (10주)

§4의 phase 단위 로드맵을 주차 단위로 분해한 일정. 각 주차는 **핵심 산출물 + 마일스톤** 한 쌍을 가진다. 일정이 밀리면 다음 주차로 미루지 말고 범위를 줄인다 (원칙 §9.1).

| Phase · Week | 핵심 산출물 | 마일스톤 |
|------|------------|----------|
| **Phase 1 — Core** · **W1** | • `Market`, `MarketFactory` Solidity<br>• Foundry 테스트<br>• anvil 배포 스크립트<br>• `@verex/sdk` wrapper (create/bet/claim) | • M1 (Day 3): forge test 통과<br>• M2 (Day 7): SDK CLI로 anvil 위 end-to-end 시연 |
| **Phase 1 — Core** · **W2** | • `packages/mcp-server` 스캐폴딩<br>• read tool 4개 선언 (2개 구현: `list_markets`, `get_market`)<br>• ADR `0001`, §11.1 MCP-first 갱신<br>• Web MVP 페이지 골격 | • M2.5 (Day 11): Claude Desktop에서 anvil markets 조회 |
| **Phase 1 — Core** · **W3** | • Web `/markets`, `/markets/[addr]`<br>• 베팅·claim UI<br>• 두 지갑 수동 테스트<br>• README 'Run locally' 갱신 | • M3 (Day 14): 메타마스크 플로우 완주<br>• M4 (Day 21): demo 영상 |
| **Phase 2 — Infra+Data** · **W4** | • `packages/api` Fastify (`/markets`, `/markets/:id`, `/positions/:user`)<br>• Postgres 스키마 (Markets/Trades/Positions)<br>• 로컬 docker-compose | • API 스모크 테스트 통과 |
| **Phase 2 — Infra+Data** · **W5** | • Indexer 워커 (`MarketCreated/Bought/Resolved/Claimed` → Postgres)<br>• Pub/Sub 로컬 에뮬레이터<br>• genesis 백필 | • 체인 ↔ DB 동기화 검증 |
| **Phase 2 — Infra+Data** · **W6** | • Chainlink price feed 자동 resolve<br>• USDC(ERC-20) escrow 전환<br>• `packages/mm-agent` v0 (paper-trading, constant-probability quote)<br>• **v2 백본 시작 — CTF Exchange 통합 (§11.2)** | • MM Agent paper 모드 양방향 호가 유지<br>• v2 컨트랙트 anvil 배포 |
| **Phase 3 — Advanced** · **W7** | • ERC-4337 AA wallet (smart wallet, paymaster sandbox)<br>• Web AA 통합<br>• **session key 권한 모델 확정** (§11.1 미결 1번) | • 사용자가 AA wallet으로 베팅 |
| **Phase 3 — Advanced** · **W8** | • CCIP/LayerZero 크로스체인 참여<br>• MM Agent v1 (실거래 + 리스크 한도 + 서킷 브레이커)<br>• MCP write-path tool 활성화 (`buy_yes/no`, `claim` — session key 경유) | • 다른 체인에서 베팅<br>• MCP로 베팅 시연 |
| **Phase 3 — Advanced** · **W9** | • Stripe checkout → backend → mock USDC 지급<br>• GCP Cloud Run 배포 (API + MM Agent)<br>• GitHub Actions CI/CD | • Stripe 결제 → 베팅 가능<br>• staging 환경 가동 |
| **Phase 4 — Final** · **W10** | • ZK 탐색 (optional, 타임박스)<br>• UI polish<br>• 공개 demo 영상<br>• README 최종<br>• 회고 문서 (`docs/history/`) | • Demo Day |

**해석 가이드**

- "주" = 7일 단위, 영업일 기준이 아님 (실제 가동 시간은 본인 페이스에 맞춰 조정).
- 각 주차의 마일스톤이 통과되지 않으면 **다음 주차의 범위를 줄여서** 일정을 맞춘다. 페이즈를 통째로 미루지 않는다.
- W7의 session key 모델 확정은 W8의 MCP write-path를 풀기 위한 선결 조건 — W7에서 막히면 W8 write-path는 W9로 미루고 cross-chain만 진행.

---

## 2. 시스템 아키텍처

### 2.1 전체 구조

```
[Frontend]
   ↓
[API Server]
   ↓
[Event System (Pub/Sub or Kafka)]
   ↓
[Indexer Workers]
   ↓
[PostgreSQL]
        ↘ Blockchain (EVM)
                  ↑
            [MM Agent]   ← 별도 워커 프로세스
```

### 2.2 주요 구성 요소

#### 2.2.1 Smart Contracts

- `MarketFactory`
- `Market`
- `Resolver`
- `Vault`

**Market Contract 기능**

- `buyYes()`
- `buyNo()`
- `resolve()`
- `claim()`

**Factory 기능**

- `createMarket()`
- market registry 관리

#### 2.2.2 Backend

역할:

- 이벤트 수집 (logs)
- 데이터 저장
- API 제공

주요 엔드포인트:

```
GET /markets
GET /markets/:id
GET /positions/:user
```

#### 2.2.3 Indexer

Blockchain event → DB 저장.

#### 2.2.4 Event System

- 초기: GCP Pub/Sub
- 후기: Kafka (optional)

#### 2.2.5 Database

PostgreSQL (Cloud SQL).

#### 2.2.6 Frontend

- Next.js
- wagmi + viem

**디자인 방향: Polymarket-style CLOB UI (v1부터 적용)**

UI 레이아웃과 시각적 밀도는 v1 backend가 fixed-price escrow임에도 [Polymarket](https://polymarket.com) 메인 피드 스타일을 처음부터 노린다 — 카드 그리드 피드, 카테고리/검색 네비게이션, 멀티해상도 마켓 그룹화, 트렌딩 사이드바, 추천 마켓 hero 카드.

v1 단계에 백엔드가 채울 수 없는 요소(실거래량 시계열, 양방향 호가창, 다해상도 확률 차트)는 **placeholder 또는 단순화된 표현**으로 둔다 — 예: 실거래량 → 누적 escrow, 다해상도 차트 → 단일 확률 막대, 호가창 → "현재 풀 비율" 표시. v2 (CTF Exchange) 전환 시 같은 layout이 자연스럽게 fully-functional해지도록 컴포넌트를 처음부터 분리해 둔다 (§4.5).

**차용 범위**: layout/density/카드 구조에 대한 영감만. 브랜드 컬러, 타이포, 카피, 아이콘 세트는 자체 결정 (Polymarket의 시각 identity를 그대로 복사하지 않음).

UI 레퍼런스 (한국어 로컬라이즈, 2026-05-07):

![Polymarket reference](../../packages/web/public/mockups/polymarket-reference.png)

원본 파일: [`packages/web/public/mockups/polymarket-reference.png`](../../packages/web/public/mockups/)

기능:

- wallet connect
- market list (피드)
- buy/sell
- position 확인

#### 2.2.7 Oracle

- Chainlink Price Feed
- 사용 예: ETH 가격 기준 이벤트

#### 2.2.8 Account Abstraction

- ERC-4337 or ERC-6900

기능:

- gas abstraction
- batch tx
- smart wallet

#### 2.2.9 Cross-chain

- Chainlink CCIP or LayerZero
- 기능: 다른 체인에서 market 참여

#### 2.2.10 Payment (Stripe)

- Stripe → Backend → Test USDC 지급
- 목적: Web2 UX 제공

#### 2.2.11 MM Agent (Market Maker, **신규 subproject**)

자동화된 마켓 메이커 봇. 별도 워커 프로세스로 실행되며 SDK를 통해 컨트랙트와 상호작용한다.

**목적**

- 신규 market의 초기 유동성 공급
- YES/NO 양방향 호가 유지로 거래 경험 개선
- Web2 사용자(Stripe 경유)가 즉시 체결 받을 수 있는 카운터파티 제공

**핵심 기능**

- 단순 가격 모델 (초기: constant-probability quote, 후기: LMSR/Bayesian update)
- 인벤토리 관리 (한쪽으로 너무 치우치지 않게 한도 관리)
- market별 설정 (스프레드, 최대 노출, on/off)
- 리스크 한도 및 서킷 브레이커 (가격 급변/잔고 부족 시 호가 중단)
- 운영 관측성 (PnL, 인벤토리, 체결 로그)

**범위 (초기)**

- 단일 봇 인스턴스, 단일 체인
- Owner-controlled (탈중앙 MM은 후속 단계)
- Read-only 모드 (paper-trading)로 먼저 검증 후 실거래 전환

**범위 (제외, 후속)**

- 다중 봇 경쟁/오더북
- 크로스마켓 헷징
- ZK 기반 비공개 인벤토리

**기술 스택**

- TypeScript
- `@verex/sdk` 사용 (직접 컨트랙트 호출 금지 — SDK 경유로 일관)
- viem
- 실행: Node.js worker, 향후 Cloud Run jobs / GKE CronJob

---

## 3. 인프라 (GCP)

### 3.1 구성

- GKE (Kubernetes)
- Cloud SQL (Postgres)
- Cloud Run (초기 API + MM Agent)
- Pub/Sub (event system)
- Cloud Logging

### 3.2 배포 전략

- 초기: Local + Cloud Run
- 중기: GKE migration

### 3.3 CI/CD

GitHub Actions.

---

## 4. 개발 로드맵 (10주)

### Phase 1: Core (Week 1~3)

- Market contract
- Factory
- Frontend MVP

### Phase 2: Infra + Data (Week 4~6)

- Backend
- DB
- Indexer
- Oracle
- **MM Agent v0** (paper-trading, 단일 market)
- **v2 백본 시작 (W6, §11.2)** — fixed-price escrow를 [Polymarket CTF Exchange](https://github.com/Polymarket/ctf-exchange) 기반 CLOB로 교체. 운영자 prior experience 있음 → 일정 신뢰도 높음

### Phase 3: Advanced (Week 7~9)

- AA wallet
- Cross-chain
- Stripe UX
- **MM Agent v1** (실거래 + 리스크 한도) — v2 위에서 EIP-712 order signing 기반 maker로 동작
- GCP infra

### Phase 4: Final (Week 10)

- ZK (optional)
- UI polish
- Demo

### 4.5 백엔드 버전 분리 (v1 / v2)

위 phase들을 가로지르는 **백본 버전 축**. Phase 1은 v1 백본을 만들고, Phase 2 W6에 v2 백본으로 교체. 두 백본 모두 같은 Polymarket-style UI를 띄운다 (§2.2.6).

| 구분 | v1 (Phase 1) | v2 (Phase 2 W6~) |
|------|--------------|-------------------|
| Backend | fixed-price 1:1 escrow (parimutuel) | [Polymarket CTF Exchange](https://github.com/Polymarket/ctf-exchange) + [Gnosis CTF](https://docs.gnosis.io/conditionaltokens/) (ERC-1155) |
| Collateral | native ETH | USDC (ERC-20) |
| Pricing | 풀 비율 (가격 발견 없음) | EIP-712 signed order, off-chain match · on-chain settle |
| Resolve | owner manual | Chainlink/UMA (단계적) |
| Maker | 불필요 | MM Agent v0 → v1 (필수) |
| SDK 표면 | `buyYes/buyNo` (escrow) | `fillOrder/fillOrders` (CLOB) |
| **UI 레이아웃** | **Polymarket-style (placeholder data 일부)** | **Polymarket-style (full data)** |

**왜 v1을 거치는가**

- Phase 1 가치 = "3주 안에 풀스택 한 바퀴 돌려 어디서 막히는지 본다". CTF + maker + USDC + order signing UI 동시 도입은 그 신호를 죽임
- v1 fixed-price의 backend 단순함이 web/sdk/MCP 인터페이스를 빠르게 안정화 → v2 교체 시 그 레이어들은 변경 최소화
- v1을 production에 띄우는 단계가 없으므로 "롤백" 부담 없음 — 학습용 단계

운영자(jay)가 [Polymarket CTF Exchange](https://github.com/Polymarket/ctf-exchange)로 prediction market을 구축한 prior experience가 있어 통합 일정 신뢰도 높음. 이론상 v1을 건너뛰고 처음부터 CTF로 갈 수 있으나 위 이유로 plan은 v1→v2 분리 유지.

**v1 → v2 전환 시점**

기본 W6. 단 Phase 2 W4~5 인프라(API, 인덱서, USDC 전환)가 밀리면 W7~8로 자연스럽게 후행 가능. v1 production 단계가 없으므로 시점 유연성 있음.

전환 시점에 결정할 구체 항목과 다음 액션은 §11.2 참고.

---

## 5. 데이터 모델

### Markets

- `id`
- `question`
- `endTime`
- `resolved`
- `result`

### Trades

- `user`
- `marketId`
- `side` (YES/NO)
- `amount`

### Positions

- `user`
- `marketId`
- `yesAmount`
- `noAmount`

### MMQuotes (MM Agent 전용)

- `marketId`
- `side` (YES/NO)
- `price`
- `size`
- `ts`

### MMInventory

- `marketId`
- `yesExposure`
- `noExposure`
- `realizedPnl`
- `unrealizedPnl`

---

## 6. 핵심 기능 정의

### 6.1 Market Flow

1. `createMarket`
2. MM Agent가 초기 호가 제공
3. 사용자가 YES/NO 매수
4. market 종료
5. `resolve`
6. `claim`

### 6.2 UX 목표

- 버튼 하나로 베팅
- gas 신경 안 씀
- 직관적인 UI
- **유동성 부족으로 체결 못 하는 경우 없음 (MM Agent 보장)**

---

## 7. 폴더 구조

monorepo는 pnpm workspaces + Turborepo 기반.

```
verex/
├── packages/
│   ├── contracts/        # Foundry, Solidity 0.8.24
│   ├── sdk/              # TypeScript, viem — 컨트랙트 wrapper
│   ├── api/              # Fastify REST API
│   ├── web/              # Next.js 14 dApp
│   └── mm-agent/         # 신규: 자동 마켓 메이커 워커
│       ├── src/
│       │   ├── index.ts        # CLI 엔트리
│       │   ├── runner.ts       # 메인 루프 (poll → quote → submit)
│       │   ├── strategy.ts     # 가격/사이즈 결정
│       │   ├── inventory.ts    # 포지션 추적
│       │   ├── risk.ts         # 한도 및 서킷 브레이커
│       │   └── config.ts       # market별 설정 로더
│       ├── test/
│       ├── package.json
│       └── README.md
├── docs/
│   ├── principles/       # 설계 원칙, 요구사항 (이 문서)
│   ├── plans/            # phase별 실행 계획
│   └── history/          # 의사결정 로그
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

**원칙**

- mm-agent는 컨트랙트를 **직접** 호출하지 않고 반드시 `@verex/sdk` 경유.
- 공용 타입(예: `Market`, `Side`)은 sdk에서 export하여 web/api/mm-agent가 함께 사용.
- 각 package는 자체 README 보유 — 실행 방법은 README가 단일 진실원.

---

## 8. 확장 계획

### ZK

- 결과 검증
- private betting

### XR (Vision Pro)

- 3D market visualization
- spatial UI

### MM Agent 진화

- 다중 전략 (constant → LMSR → Bayesian)
- 탈중앙 MM (여러 운영자가 동일 인터페이스로 참여)

---

## 9. 개발 원칙

### 9.1 핵심 원칙

- 단순하게 시작
- 작게 만들기
- 빠르게 검증

### 9.2 금지

- 초기 과설계
- 완벽주의
- 기술 과잉

---

## 10. 성공 기준

- market 생성 가능
- 베팅 가능
- 자동 정산
- AA wallet 사용
- cross-chain demo
- **MM Agent가 paper-trading 환경에서 양방향 호가 유지**

---

## 11. TODO / 오픈 이슈

확정되지 않았지만 추적해야 할 요구사항. 설계가 무르익으면 본문 섹션으로 승격한다.

### 11.1 Harness 기반 + 개인 AI 에이전트 (신규, **미확정**)

**의도**

- Verex는 단일 dApp UI에 갇히지 않고 **에이전트 하네스(harness) 위에서 동작**한다.
- 각 사용자는 자신의 머신/계정에서 돌아가는 **개인 AI 에이전트**를 통해 Verex를 사용한다 — 시장 탐색, 베팅 제안, 정산 알림, 포지션 관리, MM 운영자라면 봇 운영까지.
- 인터페이스는 채팅(Telegram/WhatsApp/Discord/Signal/iMessage 등)이 1차 진입점이고, 웹 UI는 보조.

**1차 후보 하네스: [OpenClaw](https://openclaw.ai)**

- 오픈소스 개인 AI 어시스턴트, 사용자 머신에서 실행 (Mac/Windows/Linux)
- Anthropic / OpenAI / 로컬 모델 모두 지원, 데이터는 사용자 소유
- 다중 채널 (WhatsApp, Telegram, Discord, Slack, Signal, iMessage) — DM/그룹 모두
- Persistent memory, 시스템 + 브라우저 접근, skills/plugins로 확장
- Verex는 OpenClaw용 **skill 패키지**를 발행하는 형태로 통합 가능 (사용자가 자기 OpenClaw에 설치)

**보조 옵션 (병행 검토)**

- Claude Agent SDK / Claude Code subagent dispatch — Verex 내부 에이전트(MM 등)에 한정해 사용
- 즉, **사용자 측 = OpenClaw skill, 시스템 측 = Claude Agent SDK** 로 책임 분리하는 방안

**Verex × OpenClaw skill (초안)**

사용자의 OpenClaw에 설치되는 skill이 노출할 도구:

- `list_markets`, `get_market(id)` — 읽기, 키 불필요
- `buy_yes / buy_no(market, amount)` — 서명 필요
- `claim(market)` — 서명 필요
- `subscribe_market(id)` — 종료/정산 시 OpenClaw 채널로 알림 push

읽기는 `@verex/sdk`로 RPC만 치면 되고, 쓰기는 §2.2.8 AA + session key 위임이 전제.

**해결해야 할 질문**

1. **(가장 큰 미결)** 지갑 서명 권한 — AA(§2.2.8)에서 사용자가 자기 OpenClaw에 어떤 범위의 session key를 위임할 것인가? 한도/만료/허용 함수 화이트리스트 설계 필요.
2. Skill 배포 경로 — Verex가 ClawHub에 공식 publish할지, repo에 자체 skill 폴더 두고 사용자가 가져가게 할지.
3. 시스템 측(MM Agent §2.2.11, indexer 등)에 Claude Agent SDK를 쓸 것인가, 아니면 단순 워커로 둘 것인가 — **현 단계는 후자(단순 워커) 권장**, AI가 필요한 영역만 후속 도입.
4. Phase 진입 시점 — Phase 2 후반 ~ Phase 3 (AA가 자리잡은 뒤). 현재 로드맵엔 별도 트랙으로 추가 예정.

**다음 액션**

1. AA(ERC-4337) + session key로 OpenClaw가 위임받을 수 있는 권한 모델 PoC 스펙 작성
2. `packages/openclaw-skill/` 폴더 추가 검토 (skill 매니페스트 + tool 정의)
3. Phase 3 로드맵에 "Personal agent 통합" 항목 추가 후 본문 §2.2.x로 승격

### 11.2 CTF Exchange (v2) 통합 — 결정할 항목 추적

> v1/v2 백본 분리 자체는 확정 플랜. 비교 표·왜-v1-거치는가·전환 시점은 **§4.5**에 정의. 본 절은 v2 통합 시 결정할 구체 항목과 사전 준비 작업만 추적.

**v2 통합 시 결정할 항목** (전환 시점에 정함)

1. CTF Exchange를 그대로 import할 것인가, 일부 fork해서 fee/admin 모델만 조정할 것인가
2. ResolutionOracle 단계 — owner manual → Chainlink → UMA 중 어디까지 v2 첫 출시에 포함
3. v1 fixed-price market의 처리 방식 (단순 read-only deprecate가 가장 현실적)
4. SDK 표면 — `buyYes/buyNo` → `fillOrder/fillOrders` 전환 시 MCP write tool 스펙도 함께 갱신 (§11.1 question 1과 연결)

**다음 액션 (Phase 2 진입 전 미리 준비)**

1. Polymarket CTF Exchange 컨트랙트 구조 + 의존성(Gnosis CTF) 정리한 reading note (운영자 prior experience 기반으로 압축 가능)
2. SDK API 표면이 escrow → CLOB 전환에 어떻게 영향받는지 짧은 design doc — v1 인터페이스를 v2 전환 시 변경 최소화되도록 설계
3. v1 web 컴포넌트를 placeholder/full 모드 토글 가능하게 분리 — v2 전환 시 layout 그대로, 데이터 소스만 교체

---

## 🎯 최종 한 줄

> "Verex는 Web3 기술을 통합한 실전형 예측시장 플랫폼이다."
