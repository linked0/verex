import type { Doc } from "@/lib/docs-types";

export const overview: Doc = {
  slug: "overview",
  group: "technical",
  icon: "scale",
  content: {
    en: {
      title: "Verex in one page",
      summary: "What the system is, the three problems every prediction market must solve, and how the pieces fit.",
      lead: "A prediction market turns a question about the world into a tradable asset. Verex implements that with three independent mechanisms — an order book for price discovery, conditional tokens for custody, and an oracle for truth. This page is the map; the other technical documents zoom into each piece.",
      sections: [
        {
          id: "premise",
          heading: "The premise: a share that pays $1 if it happens",
          blocks: [
            {
              p: "Every market on Verex resolves to exactly one outcome. Each outcome is a token that pays **$1 if it happens and $0 if it does not**. That single rule is what makes the price meaningful: if a token trades at $0.63, the market is collectively saying the event is 63% likely.",
            },
            {
              p: "Because the outcomes of one question are mutually exclusive and exhaustive, their prices must **sum to $1**. A multi-outcome market — *“who wins the election?”* with five candidates — is five such tokens whose prices are held to a total of 100%. Verex enforces this by renormalising sibling outcomes whenever one of them trades.",
            },
          ],
        },
        {
          id: "three-problems",
          heading: "The three problems",
          blocks: [
            {
              p: "Every prediction market, however it is built, has to answer three separate questions. Confusing them is the most common source of muddled design:",
            },
            {
              table: {
                head: ["Problem", "Question it answers", "Verex's mechanism"],
                rows: [
                  ["Price discovery", "What is this outcome worth right now?", "Central limit order book + an operator market maker (moving to LMSR)"],
                  ["Custody & settlement", "Who holds what, and how does $1 actually get paid?", "Gnosis Conditional Tokens Framework (CTF) on Sepolia"],
                  ["Truth", "What actually happened?", "Operator resolution today; UMA Optimistic Oracle next"],
                ],
              },
            },
            {
              p: "They are genuinely independent. You can change the pricing engine without touching settlement, and swap the oracle without touching either — with one important exception noted below.",
            },
          ],
        },
        {
          id: "lifecycle",
          heading: "Lifecycle of a market",
          blocks: [
            {
              ol: [
                "**Create.** The question, its outcomes and a resolution time are registered. On-chain, `prepareCondition` creates the condition; the operator splits collateral into a full set of outcome tokens to have inventory to sell.",
                "**Quote.** The operator posts a ladder of buy and sell orders around its current probability estimate, so the book is never empty on day one.",
                "**Trade.** Orders match in the book by price-time priority. Each match is settled on-chain as a pair of signed orders through the CTF exchange.",
                "**Close.** At the resolution time the market stops accepting orders.",
                "**Resolve.** The winning outcome is reported on-chain via `reportPayouts`. This is irreversible.",
                "**Redeem.** Holders burn winning tokens through `redeemPositions` and collect $1 each. Losing tokens are worth nothing.",
              ],
            },
          ],
        },
        {
          id: "coupling",
          heading: "The one place the layers are coupled",
          blocks: [
            {
              p: "Settlement and truth are *not* fully independent, and it is worth knowing why. A condition's on-chain identity is derived by hashing the oracle's address into it:",
            },
            { code: "conditionId = keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount))" },
            {
              p: "The oracle address is **part of the market's identity**. Pointing an existing market at a different oracle does not reconfigure it — it computes a different `conditionId`, which is a different market holding none of the original tokens. Migrating a live market between oracles is therefore not a matter of changing a setting; it is arithmetically impossible.",
            },
            {
              note: "Practical consequence: the oracle for a market must be chosen **before** it is created. Verex plans to expose this as a per-market choice at creation time — operator resolution for demo markets, UMA for markets that need to be trustless — rather than as a global switch.",
            },
          ],
        },
        {
          id: "state",
          heading: "Where the system stands",
          blocks: [
            {
              table: {
                head: ["Layer", "Today", "Planned"],
                rows: [
                  ["Price discovery", "CLOB + constant-probability operator ladder", "LMSR quote centres, then an on-chain pool"],
                  ["Custody", "CTF on Sepolia, live", "unchanged"],
                  ["Truth", "Operator reports the outcome", "UMA Optimistic Oracle as a per-market option"],
                  ["Deploys", "Manual script", "GitHub Actions with Workload Identity Federation"],
                ],
              },
            },
            {
              note: "Verex runs on the **Sepolia** testnet with test USDC. No real funds are at risk anywhere in the system.",
            },
          ],
        },
      ],
    },
    ko: {
      title: "한 장으로 보는 Verex",
      summary: "시스템의 정체, 모든 예측 시장이 풀어야 하는 세 가지 문제, 그리고 구성 요소가 맞물리는 방식.",
      lead: "예측 시장은 세상에 대한 질문을 거래 가능한 자산으로 바꿉니다. Verex는 이를 세 개의 독립적인 메커니즘으로 구현합니다 — 가격 발견을 위한 호가창, 보관을 위한 조건부 토큰, 진실을 위한 오라클. 이 문서는 전체 지도이고, 다른 기술 문서들이 각 조각을 확대해서 다룹니다.",
      sections: [
        {
          id: "premise",
          heading: "전제: 일어나면 $1을 주는 증서",
          blocks: [
            {
              p: "Verex의 모든 마켓은 정확히 하나의 결과로 확정됩니다. 각 결과는 **일어나면 $1, 일어나지 않으면 $0**을 지급하는 토큰입니다. 이 단순한 규칙이 가격에 의미를 부여합니다. 토큰이 $0.63에 거래된다면, 시장은 그 사건의 확률을 63%로 보고 있다는 뜻입니다.",
            },
            {
              p: "한 질문의 결과들은 상호 배타적이면서 전체를 덮기 때문에 가격의 **합은 반드시 $1**이 됩니다. 후보가 다섯 명인 *“누가 당선될까?”* 같은 다중 결과 마켓은 가격 합이 100%로 유지되는 다섯 개의 토큰입니다. Verex는 형제 결과 중 하나가 거래될 때마다 나머지를 재정규화(renormalise)해 이를 강제합니다.",
            },
          ],
        },
        {
          id: "three-problems",
          heading: "세 가지 문제",
          blocks: [
            {
              p: "어떻게 만들든 모든 예측 시장은 서로 다른 세 가지 질문에 답해야 합니다. 이 셋을 뒤섞는 것이 설계가 흐려지는 가장 흔한 원인입니다.",
            },
            {
              table: {
                head: ["문제", "답하는 질문", "Verex의 메커니즘"],
                rows: [
                  ["가격 발견", "지금 이 결과의 가치는 얼마인가?", "중앙 지정가 호가창 + 운영자 마켓메이커 (LMSR로 전환 중)"],
                  ["보관과 정산", "누가 무엇을 갖고 있고, $1은 실제로 어떻게 지급되는가?", "Sepolia 위의 Gnosis Conditional Tokens Framework (CTF)"],
                  ["진실", "실제로 무슨 일이 있었는가?", "현재는 운영자 정산, 다음은 UMA Optimistic Oracle"],
                ],
              },
            },
            {
              p: "이 셋은 실제로 독립적입니다. 정산을 건드리지 않고 가격 엔진을 바꿀 수 있고, 둘 다 건드리지 않고 오라클을 교체할 수 있습니다 — 아래에 적은 한 가지 중요한 예외만 빼면요.",
            },
          ],
        },
        {
          id: "lifecycle",
          heading: "마켓의 생애주기",
          blocks: [
            {
              ol: [
                "**생성.** 질문, 결과들, 정산 시각이 등록됩니다. 온체인에서는 `prepareCondition`이 조건을 만들고, 운영자가 담보를 분할(split)해 판매할 재고가 될 결과 토큰 한 세트를 확보합니다.",
                "**호가 제공.** 운영자가 현재 확률 추정치를 중심으로 매수·매도 사다리를 걸어 첫날부터 호가창이 비지 않게 합니다.",
                "**거래.** 주문은 가격-시간 우선순위로 호가창에서 체결됩니다. 각 체결은 서명된 주문 한 쌍으로 CTF 거래소를 통해 온체인 정산됩니다.",
                "**마감.** 정산 시각이 되면 마켓은 주문을 더 받지 않습니다.",
                "**정산.** 승리 결과가 `reportPayouts`로 온체인에 보고됩니다. 되돌릴 수 없습니다.",
                "**상환.** 보유자가 `redeemPositions`로 승리 토큰을 소각하고 개당 $1을 받습니다. 패배 토큰의 가치는 0입니다.",
              ],
            },
          ],
        },
        {
          id: "coupling",
          heading: "계층이 유일하게 결합되는 지점",
          blocks: [
            {
              p: "정산과 진실은 *완전히* 독립적이지는 않으며, 그 이유를 아는 것이 중요합니다. 조건의 온체인 정체성은 오라클 주소를 해시에 포함해서 만들어집니다.",
            },
            { code: "conditionId = keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount))" },
            {
              p: "즉 오라클 주소는 **마켓 정체성의 일부**입니다. 기존 마켓이 다른 오라클을 바라보게 하는 것은 설정 변경이 아니라 다른 `conditionId`를 계산하는 일이고, 그것은 원래 토큰을 하나도 갖고 있지 않은 완전히 다른 마켓입니다. 따라서 운영 중인 마켓을 오라클 간에 이전하는 것은 설정 문제가 아니라 산술적으로 불가능합니다.",
            },
            {
              note: "실무적 결론: 마켓의 오라클은 **생성 전에** 정해져야 합니다. Verex는 이를 전역 스위치가 아니라 생성 시점의 마켓별 선택지로 노출할 계획입니다 — 데모 마켓은 운영자 정산, 신뢰가 필요 없어야 하는 마켓은 UMA.",
            },
          ],
        },
        {
          id: "state",
          heading: "현재 상태",
          blocks: [
            {
              table: {
                head: ["계층", "현재", "계획"],
                rows: [
                  ["가격 발견", "CLOB + 고정 확률 운영자 사다리", "LMSR 기준가, 이후 온체인 풀"],
                  ["보관", "Sepolia CTF, 운영 중", "변경 없음"],
                  ["진실", "운영자가 결과 보고", "마켓별 선택지로서의 UMA Optimistic Oracle"],
                  ["배포", "수동 스크립트", "Workload Identity Federation 기반 GitHub Actions"],
                ],
              },
            },
            {
              note: "Verex는 **Sepolia** 테스트넷에서 테스트 USDC로 동작합니다. 시스템 어디에도 실제 자금은 걸려 있지 않습니다.",
            },
          ],
        },
      ],
    },
  },
};
