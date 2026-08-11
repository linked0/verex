import type { Doc } from "@/lib/docs-types";

// Contract addresses below mirror packages/contracts/deployments.json — the
// manifest the seed and deploy scripts actually read. They are inlined here
// because the web image builds from packages/web alone (deploy.sh uses
// `--source packages/web`), so the manifest is not in the build context.
// If an environment is ever re-deployed, update both places.
const SCAN = "https://sepolia.etherscan.io/address";

export const chain: Doc = {
  slug: "chain",
  group: "technical",
  icon: "tree",
  content: {
    en: {
      title: "Architecture: web, API & Sepolia",
      summary: "The four layers between a click and a Sepolia transaction, the specific contracts deployed, and who holds the keys.",
      lead: "Everything the other technical documents describe — splits, order matching, resolution — ultimately lands on a handful of contracts on the Sepolia testnet. This document maps the path: which layer talks to which, exactly which contracts are deployed where, and why the browser never signs anything.",
      sections: [
        {
          id: "stack",
          heading: "Four layers, one direction",
          blocks: [
            {
              p: "Verex is a monorepo of four runtime layers. A request only ever flows one way — browser to web server to API to chain — and only one layer holds keys or an RPC connection:",
            },
            {
              table: {
                head: ["Layer", "Package", "Role"],
                rows: [
                  [
                    "**Web**",
                    "`packages/web`",
                    "Next.js app. Renders markets, books, and the portfolio from the API's REST endpoints. Holds no keys, opens no RPC connection — it cannot touch the chain even by accident.",
                  ],
                  [
                    "**API**",
                    "`packages/api`",
                    "Fastify server. Owns the Postgres mirror (markets, orders, fills), runs the matching engine and the market-maker, and is the **only** process that signs and sends transactions.",
                  ],
                  [
                    "**SDK**",
                    "`packages/sdk`",
                    "Typed viem clients — one per contract (`CTClient`, `ExchangeClient`, `UsdcClient`, `UmaAdapterClient`). The API never handles raw ABIs; every chain call goes through these.",
                  ],
                  [
                    "**Contracts**",
                    "`packages/contracts`",
                    "Foundry project holding the Solidity sources and the deployment scripts, plus `deployments.json` — the manifest of what is live on Sepolia.",
                  ],
                ],
              },
            },
            {
              p: "The database is a *mirror*, not the source of truth. Balances and positions are read from the chain (`balanceOf`, batched over every outcome token in one `balanceOfBatch` call); the database holds what the chain cannot: order books, price history, copy, and categories.",
            },
          ],
        },
        {
          id: "contracts",
          heading: "The specific contracts",
          blocks: [
            {
              p: "Five contracts make up an environment. Two are third-party primitives used unmodified — the same ones Polymarket runs on mainnet — and three are written for Verex:",
            },
            {
              table: {
                head: ["Contract", "Origin", "What it does"],
                rows: [
                  [
                    "**ConditionalTokens** (CTF)",
                    "Gnosis, unmodified",
                    "The custody core. Registers conditions (`prepareCondition`), splits $1 of collateral into a full outcome set (`splitPosition`), merges it back, records the result (`reportPayouts`), and pays winners (`redeemPositions`). Positions are ERC-1155 tokens.",
                  ],
                  [
                    "**CTFExchange**",
                    "Polymarket, unmodified",
                    "Atomic settlement. Takes two signed EIP-712 orders that the off-chain book matched and swaps outcome tokens against collateral in one transaction (`matchOrders`).",
                  ],
                  [
                    "**MockUSDC**",
                    "Verex",
                    "The demo dollar — a mintable ERC-20 with 6 decimals standing in for USDC, so wallets can be funded without a faucet queue.",
                  ],
                  [
                    "**UmaCtfAdapter**",
                    "Verex (UMA's design)",
                    "Bridges UMA's Optimistic Oracle to the CTF: registers the question (`initialize`), and once the oracle settles, translates the answer into the payout vector (`resolve`). It — not the operator — is the oracle address of UMA markets.",
                  ],
                  [
                    "**MockOptimisticOracleV2**",
                    "Verex",
                    "A faithful mock of UMA's propose/dispute/vote lifecycle where the demo wallets sit as the jury — so the full dispute flow is walkable without real UMA tokens. Local and staging only.",
                  ],
                ],
              },
            },
            {
              note: "The split matters for trust: the contracts that hold money (CTF, exchange) are unmodified, audited primitives. The contracts written for Verex are the demo scaffolding around them.",
            },
          ],
        },
        {
          id: "addresses",
          heading: "Deployed addresses on Sepolia",
          blocks: [
            {
              p: "Staging and production each run their own full backbone on Sepolia (chain id `11155111`) — separate instances so the two environments cannot interfere. Every address is verifiable on Etherscan:",
            },
            {
              p: "**Production** (verex.jaylabs.xyz):",
            },
            {
              table: {
                head: ["Contract", "Address"],
                rows: [
                  ["MockUSDC", `[0xAc03…b6B6](${SCAN}/0xAc0328f49c4ED8ea1B1C1AaBb86441dD9682b6B6)`],
                  ["ConditionalTokens", `[0xEB10…Fb04](${SCAN}/0xEB100D76E2F3E3B5176593b5aAfbEB5a1d90Fb04)`],
                  ["CTFExchange", `[0xcB22…99Cf](${SCAN}/0xcB2271f5Eb6337a1938ab8a9190e12A9773599Cf)`],
                ],
              },
            },
            {
              p: "**Staging**:",
            },
            {
              table: {
                head: ["Contract", "Address"],
                rows: [
                  ["MockUSDC", `[0xF0AB…3edD](${SCAN}/0xF0AB63E3E34c86978F049c1eFc04C144E9c13edD)`],
                  ["ConditionalTokens", `[0xCa4d…aCBB](${SCAN}/0xCa4d32755Fa9a6A04bECF42D6FE501AFF0dcaCBB)`],
                  ["CTFExchange", `[0x19f3…DD22](${SCAN}/0x19f303463CFC1181D9111B1AEf6EE3115a89DD22)`],
                  ["UmaCtfAdapter", `[0x1B45…00AC](${SCAN}/0x1B45F820FBcc38e477F30d78e207622F24ab00AC)`],
                  ["MockOptimisticOracleV2", `[0x9f12…e88C](${SCAN}/0x9f1263B8f0355673619168b5B8c0248f1d03e88C)`],
                ],
              },
            },
            {
              p: "Local development deploys a fresh backbone (plus the mock oracle stack) onto an `anvil` chain on every seed run, so local addresses are new each time by design. The canonical record of the Sepolia addresses is `packages/contracts/deployments.json`.",
            },
          ],
        },
        {
          id: "who-signs",
          heading: "Who holds the keys",
          blocks: [
            {
              p: "This is where Verex deliberately differs from a production exchange. There is no wallet-connect: the demo wallets (#1–9) and the operator (#0) are derived from a publicly known development mnemonic, and their keys live **server-side, in the API**. When you trade as wallet #3, the API signs as wallet #3.",
            },
            {
              p: "Every write to the chain goes through one queue. The API answers from the database immediately, enqueues a `ChainJob`, and a single worker executes jobs strictly one at a time — which doubles as nonce management, since every transaction comes from server-held accounts. Jobs are claimed atomically, retried with backoff, and idempotent, so a crash mid-settlement re-runs safely.",
            },
            {
              note: "A production build would invert this: signing moves to the user's own wallet in the browser (wagmi/viem), the operator keeps only its market-maker key, and the queue keeps only the operator's jobs. The one-way layering above is what makes that swap possible without redesign — the browser already never talks to the chain.",
            },
          ],
        },
        {
          id: "flows",
          heading: "Which layer makes which call",
          blocks: [
            {
              p: "The three chain-touching flows, end to end — the mechanisms are covered in their own documents; this is the map of who calls what:",
            },
            {
              ol: [
                "**Create** — web posts the form to the API; the API derives the question id and calls `prepareCondition` (operator markets) or the adapter's `initialize` (UMA markets) through the SDK. The condition id comes back derived, not assigned — see *Custody & on-chain settlement*.",
                "**Trade** — web posts the order; the API matches it in the database book instantly, then a `SETTLE_MATCH` job submits both signed orders to the exchange's `matchOrders`. The UI's *settling on-chain…* chip is that job in flight.",
                "**Resolve & redeem** — the operator path calls `reportPayouts` directly; the UMA path runs propose → dispute → vote on the oracle and the adapter copies the settled answer in. Either way, redemption is the holder's own `redeemPositions` call — see *Resolution & the UMA oracle*.",
              ],
            },
            {
              p: "Reads follow the same discipline: the portfolio page asks the API, the API asks the chain — one `balanceOfBatch` across every outcome token, netted against fills that are still settling, so what you see immediately after a trade equals what the chain confirms a block later.",
            },
          ],
        },
      ],
    },
    ko: {
      title: "아키텍처: 웹, API, Sepolia",
      summary: "클릭 한 번이 Sepolia 트랜잭션이 되기까지의 네 계층, 실제 배포된 컨트랙트, 그리고 키는 누가 쥐고 있는가.",
      lead: "다른 기술 문서들이 설명하는 모든 것 — 분할, 주문 매칭, 결과 확정 — 은 결국 Sepolia 테스트넷 위의 몇 개 컨트랙트에 도달합니다. 이 문서는 그 경로를 지도로 그립니다. 어느 계층이 어느 계층과 통신하는지, 정확히 어떤 컨트랙트가 어디에 배포되어 있는지, 그리고 왜 브라우저는 아무것도 서명하지 않는지.",
      sections: [
        {
          id: "stack",
          heading: "네 계층, 한 방향",
          blocks: [
            {
              p: "Verex는 네 개의 런타임 계층으로 이루어진 모노레포입니다. 요청은 언제나 한 방향으로만 흐르고 — 브라우저에서 웹 서버로, API로, 체인으로 — 키와 RPC 연결을 가진 계층은 단 하나뿐입니다.",
            },
            {
              table: {
                head: ["계층", "패키지", "역할"],
                rows: [
                  [
                    "**웹**",
                    "`packages/web`",
                    "Next.js 앱. API의 REST 엔드포인트로부터 마켓, 호가창, 포트폴리오를 렌더링합니다. 키도 RPC 연결도 없어서 실수로라도 체인을 건드릴 수 없습니다.",
                  ],
                  [
                    "**API**",
                    "`packages/api`",
                    "Fastify 서버. Postgres 미러(마켓, 주문, 체결)를 소유하고, 매칭 엔진과 마켓메이커를 구동하며, 트랜잭션을 서명하고 전송하는 **유일한** 프로세스입니다.",
                  ],
                  [
                    "**SDK**",
                    "`packages/sdk`",
                    "타입이 있는 viem 클라이언트 — 컨트랙트마다 하나씩(`CTClient`, `ExchangeClient`, `UsdcClient`, `UmaAdapterClient`). API는 raw ABI를 직접 다루지 않고 모든 체인 호출을 이들을 통해 보냅니다.",
                  ],
                  [
                    "**컨트랙트**",
                    "`packages/contracts`",
                    "Solidity 소스와 배포 스크립트, 그리고 Sepolia에 무엇이 살아 있는지의 명부인 `deployments.json`을 담은 Foundry 프로젝트입니다.",
                  ],
                ],
              },
            },
            {
              p: "데이터베이스는 진실의 원천이 아니라 *미러*입니다. 잔고와 포지션은 체인에서 읽고(`balanceOf` — 모든 결과 토큰을 `balanceOfBatch` 한 번으로 묶어서), 데이터베이스는 체인이 담을 수 없는 것들 — 호가창, 가격 히스토리, 문구, 카테고리 — 을 담습니다.",
            },
          ],
        },
        {
          id: "contracts",
          heading: "실제 컨트랙트들",
          blocks: [
            {
              p: "하나의 환경은 다섯 개의 컨트랙트로 구성됩니다. 둘은 수정 없이 쓰는 서드파티 원시 요소 — Polymarket이 메인넷에서 돌리는 것과 동일 — 이고, 셋은 Verex를 위해 작성되었습니다.",
            },
            {
              table: {
                head: ["컨트랙트", "출처", "하는 일"],
                rows: [
                  [
                    "**ConditionalTokens** (CTF)",
                    "Gnosis, 무수정",
                    "보관의 핵심. 조건을 등록하고(`prepareCondition`), 담보 $1을 결과 한 세트로 분할하고(`splitPosition`), 다시 병합하고, 결과를 기록하고(`reportPayouts`), 승자에게 지급합니다(`redeemPositions`). 포지션은 ERC-1155 토큰입니다.",
                  ],
                  [
                    "**CTFExchange**",
                    "Polymarket, 무수정",
                    "원자적 정산. 오프체인 호가창이 매칭한 서명된 EIP-712 주문 두 건을 받아 결과 토큰과 담보를 한 트랜잭션에서 교환합니다(`matchOrders`).",
                  ],
                  [
                    "**MockUSDC**",
                    "Verex",
                    "데모 달러 — USDC를 대신하는 6자리 소수점의 민트 가능한 ERC-20으로, 포싯 대기열 없이 지갑에 자금을 넣을 수 있게 합니다.",
                  ],
                  [
                    "**UmaCtfAdapter**",
                    "Verex (UMA의 설계)",
                    "UMA의 낙관적 오라클을 CTF에 잇는 다리. 질문을 등록하고(`initialize`), 오라클이 확정되면 답을 지급 벡터로 번역합니다(`resolve`). UMA 마켓의 오라클 주소는 운영자가 아니라 이 어댑터입니다.",
                  ],
                  [
                    "**MockOptimisticOracleV2**",
                    "Verex",
                    "UMA의 제안/분쟁/투표 수명주기를 충실히 본뜬 목(mock)으로, 데모 지갑들이 배심원이 됩니다 — 실제 UMA 토큰 없이 분쟁 흐름 전체를 걸어볼 수 있습니다. 로컬과 스테이징 전용입니다.",
                  ],
                ],
              },
            },
            {
              note: "이 구분이 신뢰에서 중요합니다. 돈을 보관하는 컨트랙트(CTF, 거래소)는 무수정의 감사받은 원시 요소이고, Verex가 작성한 컨트랙트는 그 주변의 데모 골조입니다.",
            },
          ],
        },
        {
          id: "addresses",
          heading: "Sepolia 배포 주소",
          blocks: [
            {
              p: "스테이징과 프로덕션은 각각 Sepolia(체인 id `11155111`) 위에 자기만의 백본 전체를 돌립니다 — 두 환경이 서로 간섭할 수 없도록 분리된 인스턴스입니다. 모든 주소는 Etherscan에서 검증할 수 있습니다.",
            },
            {
              p: "**프로덕션** (verex.jaylabs.xyz):",
            },
            {
              table: {
                head: ["컨트랙트", "주소"],
                rows: [
                  ["MockUSDC", `[0xAc03…b6B6](${SCAN}/0xAc0328f49c4ED8ea1B1C1AaBb86441dD9682b6B6)`],
                  ["ConditionalTokens", `[0xEB10…Fb04](${SCAN}/0xEB100D76E2F3E3B5176593b5aAfbEB5a1d90Fb04)`],
                  ["CTFExchange", `[0xcB22…99Cf](${SCAN}/0xcB2271f5Eb6337a1938ab8a9190e12A9773599Cf)`],
                ],
              },
            },
            {
              p: "**스테이징**:",
            },
            {
              table: {
                head: ["컨트랙트", "주소"],
                rows: [
                  ["MockUSDC", `[0xF0AB…3edD](${SCAN}/0xF0AB63E3E34c86978F049c1eFc04C144E9c13edD)`],
                  ["ConditionalTokens", `[0xCa4d…aCBB](${SCAN}/0xCa4d32755Fa9a6A04bECF42D6FE501AFF0dcaCBB)`],
                  ["CTFExchange", `[0x19f3…DD22](${SCAN}/0x19f303463CFC1181D9111B1AEf6EE3115a89DD22)`],
                  ["UmaCtfAdapter", `[0x1B45…00AC](${SCAN}/0x1B45F820FBcc38e477F30d78e207622F24ab00AC)`],
                  ["MockOptimisticOracleV2", `[0x9f12…e88C](${SCAN}/0x9f1263B8f0355673619168b5B8c0248f1d03e88C)`],
                ],
              },
            },
            {
              p: "로컬 개발은 시드를 돌릴 때마다 `anvil` 체인 위에 백본(그리고 목 오라클 스택)을 새로 배포하므로, 로컬 주소는 의도적으로 매번 새롭습니다. Sepolia 주소의 정본 기록은 `packages/contracts/deployments.json`입니다.",
            },
          ],
        },
        {
          id: "who-signs",
          heading: "키는 누가 쥐고 있는가",
          blocks: [
            {
              p: "여기가 Verex가 실제 거래소와 의도적으로 다른 지점입니다. 지갑 연결이 없습니다. 데모 지갑(#1–9)과 운영자(#0)는 공개된 개발용 니모닉에서 유도되고, 그 키는 **서버 측, API 안에** 있습니다. 지갑 #3으로 거래하면 API가 지갑 #3으로서 서명합니다.",
            },
            {
              p: "체인에 대한 모든 쓰기는 하나의 큐를 통과합니다. API는 데이터베이스에서 즉시 응답하고 `ChainJob`을 큐에 넣으며, 단일 워커가 작업을 엄격히 하나씩 실행합니다 — 모든 트랜잭션이 서버가 쥔 계정에서 나가므로 이것이 논스 관리를 겸합니다. 작업은 원자적으로 점유되고, 백오프로 재시도되며, 멱등이라 정산 도중 죽어도 안전하게 재실행됩니다.",
            },
            {
              note: "프로덕션 빌드라면 이것이 뒤집힙니다. 서명은 브라우저 속 사용자 자신의 지갑(wagmi/viem)으로 옮겨가고, 운영자는 마켓메이커 키만 남기며, 큐에는 운영자의 작업만 남습니다. 위의 단방향 계층 구조가 바로 그 전환을 재설계 없이 가능하게 하는 것입니다 — 브라우저는 애초에 체인과 통신한 적이 없으니까요.",
            },
          ],
        },
        {
          id: "flows",
          heading: "어느 계층이 어떤 호출을 하는가",
          blocks: [
            {
              p: "체인을 건드리는 세 가지 흐름의 처음부터 끝 — 메커니즘은 각자의 문서에서 다루므로, 여기는 누가 무엇을 호출하는지의 지도입니다.",
            },
            {
              ol: [
                "**생성** — 웹이 폼을 API로 보내면, API가 질문 id를 유도하고 SDK를 통해 `prepareCondition`(운영자 마켓) 또는 어댑터의 `initialize`(UMA 마켓)를 호출합니다. 조건 id는 부여되는 게 아니라 유도되어 돌아옵니다 — *보관과 온체인 정산* 참고.",
                "**거래** — 웹이 주문을 보내면, API가 데이터베이스 호가창에서 즉시 매칭하고, `SETTLE_MATCH` 작업이 서명된 주문 두 건을 거래소의 `matchOrders`에 제출합니다. UI의 *온체인 정산 중…* 칩이 바로 진행 중인 그 작업입니다.",
                "**확정과 상환** — 운영자 경로는 `reportPayouts`를 직접 호출하고, UMA 경로는 오라클 위에서 제안 → 분쟁 → 투표를 거친 뒤 어댑터가 확정된 답을 복사해 옵니다. 어느 쪽이든 상환은 보유자 자신의 `redeemPositions` 호출입니다 — *결과 확정과 UMA 오라클* 참고.",
              ],
            },
            {
              p: "읽기도 같은 규율을 따릅니다. 포트폴리오 페이지는 API에 묻고, API는 체인에 묻습니다 — 모든 결과 토큰에 걸친 `balanceOfBatch` 한 번을, 아직 정산 중인 체결과 상계해서요. 그래서 거래 직후 보이는 숫자와 한 블록 뒤 체인이 확정하는 숫자가 같습니다.",
            },
          ],
        },
      ],
    },
  },
};
