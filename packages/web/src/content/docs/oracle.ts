import type { Doc } from "@/lib/docs-types";

export const oracle: Doc = {
  slug: "resolution-uma",
  group: "technical",
  icon: "shield",
  content: {
    en: {
      title: "Resolution & the UMA oracle",
      summary: "How a market learns what happened — operator reporting today, and UMA's optimistic oracle as the trustless path.",
      lead: "A prediction market is only as good as its answer to “what actually happened?”. A blockchain cannot see the world, so some outside process must supply the truth. This document covers what Verex does today, and how UMA's Optimistic Oracle replaces the operator as the source of that truth.",
      sections: [
        {
          id: "today",
          heading: "Today: the operator reports",
          blocks: [
            {
              p: "At resolution time the operator opens the market, selects the winning outcome, and confirms. The API calls `reportPayouts` on the Conditional Tokens contract, which fixes the payout vector permanently. Winning tokens become redeemable for $1; losing tokens become worthless.",
            },
            {
              p: "This is simple, instant, and free. It is also **completely trusted** — every holder is relying on the operator being both honest and correct. That is acceptable for a demo with test funds and unacceptable for anything else, which is why the oracle work exists.",
            },
          ],
        },
        {
          id: "optimistic",
          heading: "What “optimistic” means",
          blocks: [
            {
              p: "An optimistic oracle inverts the usual design. Instead of asking a committee to vote on every question, it **assumes the first answer is correct** and only escalates when someone objects. Voting is expensive and slow, so you spend it only on the rare disputed case.",
            },
            {
              p: "The security comes from bonds, not from trust. Proposing an answer costs a deposit; disputing one costs a deposit. Whoever turns out to be wrong loses theirs to the other. As long as the bond is larger than the profit available from lying, honesty is the rational strategy — and nothing needs to happen at all when the answer is obvious.",
            },
          ],
        },
        {
          id: "flow",
          heading: "The flow, step by step",
          blocks: [
            {
              ol: [
                "**Request.** The market asks the oracle a question, encoded with UMA's `YES_OR_NO_QUERY` identifier — plain English text plus resolution criteria.",
                "**Propose.** Anyone posts an answer with a bond. In practice a bot proposes within minutes, because the reward is free money for an obvious answer.",
                "**Liveness.** A challenge window opens — the UMA default is 7,200 seconds (two hours). Nothing happens unless somebody objects.",
                "**Settle** — *the normal path.* Liveness expires with no dispute, the answer is final, and the proposer gets its bond back plus the reward.",
                "**Dispute** — *the rare path.* A challenger posts a matching bond. The question escalates to UMA's DVM, where UMA token holders vote over roughly 48–96 hours. The loser's bond goes to the winner.",
              ],
            },
            {
              p: "The answer is encoded as a fixed-point number: **1e18 means YES**, **0 means NO**, and **0.5e18 means unresolvable** — used when the question was ambiguous or the event genuinely cannot be settled. Verex maps that back onto the CTF payout vector.",
            },
          ],
        },
        {
          id: "bonds",
          heading: "Bonds and the whitelist",
          blocks: [
            {
              p: "Bonds must be posted in a currency on UMA's `AddressWhitelist`. Verex's own test USDC is not on it — that was the first real constraint discovered when wiring this up on Sepolia.",
            },
            {
              p: "The chosen bond currency is **Sepolia WETH**, for a practical reason: it is self-service. Anyone can obtain it by sending ETH to the WETH contract's `deposit()` function, whereas UMA's own whitelisted test USDC has no public mint. WETH carries a small final fee (0.001) where UMA's USDC has none, which is a cost worth paying for not depending on someone else to hand out tokens.",
            },
          ],
        },
        {
          id: "attacks",
          heading: "What if a voter is malicious?",
          blocks: [
            {
              p: "The honest answer is that this is a real risk class, not a solved problem. An optimistic oracle's guarantees rest on economics, and economics can be attacked.",
            },
            {
              ul: [
                "**A bad proposal** is the cheap case. Anyone watching can dispute it and take the proposer's bond — the attack loses money as long as at least one honest watcher exists.",
                "**A malicious *unresolvable* vote** is more corrosive. It does not steal a payout; it strands one, and it is easier to argue for than an outright wrong answer.",
                "**Governance capture** is the systemic case. Because the DVM is token-weighted, an attacker holding enough voting power can ratify a false answer. The defence is that doing so destroys the value of the tokens they used to do it — a deterrent, not a guarantee.",
              ],
            },
            {
              note: "On a testnet the shape of the risk is different: the disputes that matter are not adversarial, they are **indifferent**. Nobody has money riding on a Sepolia market, so nobody watches it. A dispute raised by a stranger would still be settled by real voters, but the outcome is outside the operator's control — which is why the demo path shortens liveness via `setCustomLiveness` and exercises the undisputed happy path.",
            },
          ],
        },
        {
          id: "per-market",
          heading: "Can the operator choose per market?",
          blocks: [
            {
              p: "Yes — but only at creation time, never afterwards. The reason is structural rather than a matter of policy:",
            },
            { code: "conditionId = keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount))" },
            {
              p: "The oracle's address is hashed into the market's identity. Switching a live market to a different oracle would compute a different `conditionId` — a different market entirely, holding none of the original positions. So the choice between operator resolution and UMA is made when the market is created and is fixed for its lifetime.",
            },
          ],
        },
      ],
    },
    ko: {
      title: "결과 확정과 UMA 오라클",
      summary: "마켓이 무슨 일이 있었는지 알아내는 방법 — 현재의 운영자 보고, 그리고 신뢰가 필요 없는 경로로서의 UMA 낙관적 오라클.",
      lead: "예측 시장의 품질은 “실제로 무슨 일이 있었는가?”에 대한 답의 품질을 넘지 못합니다. 블록체인은 바깥 세상을 볼 수 없으므로 외부의 어떤 절차가 진실을 공급해야 합니다. 이 문서는 Verex의 현재 방식과, UMA Optimistic Oracle이 운영자를 대체하는 방식을 다룹니다.",
      sections: [
        {
          id: "today",
          heading: "현재: 운영자가 보고한다",
          blocks: [
            {
              p: "정산 시각이 되면 운영자가 마켓을 열어 승리 결과를 선택하고 확인합니다. API가 Conditional Tokens 컨트랙트의 `reportPayouts`를 호출하면 지급 벡터가 영구히 고정됩니다. 승리 토큰은 $1로 상환 가능해지고 패배 토큰은 가치를 잃습니다.",
            },
            {
              p: "단순하고 즉각적이며 비용이 들지 않습니다. 동시에 **전적으로 신뢰에 의존**합니다 — 모든 보유자가 운영자가 정직하고 동시에 정확하다는 데 기대고 있는 셈이죠. 테스트 자금으로 도는 데모에서는 허용되지만 그 외에는 허용될 수 없고, 그래서 오라클 작업이 존재합니다.",
            },
          ],
        },
        {
          id: "optimistic",
          heading: "“낙관적(optimistic)”이란 무슨 뜻인가",
          blocks: [
            {
              p: "낙관적 오라클은 통상적인 설계를 뒤집습니다. 모든 질문에 위원회 투표를 붙이는 대신, **첫 번째 답이 옳다고 가정하고** 누군가 이의를 제기할 때만 절차를 확대합니다. 투표는 비싸고 느리므로, 드물게 발생하는 분쟁 건에만 그 비용을 씁니다.",
            },
            {
              p: "보안은 신뢰가 아니라 보증금에서 나옵니다. 답을 제안하려면 보증금이 필요하고, 이의를 제기하는 데도 보증금이 필요합니다. 틀린 쪽이 상대에게 보증금을 잃습니다. 거짓말로 얻을 수 있는 이익보다 보증금이 크기만 하면 정직이 합리적 전략이 되고 — 답이 명백할 때는 아무 일도 일어나지 않아도 됩니다.",
            },
          ],
        },
        {
          id: "flow",
          heading: "단계별 흐름",
          blocks: [
            {
              ol: [
                "**요청(Request).** 마켓이 UMA의 `YES_OR_NO_QUERY` 식별자로 인코딩한 질문을 오라클에 던집니다 — 평문 질문과 판정 기준이 함께 들어갑니다.",
                "**제안(Propose).** 누구나 보증금을 걸고 답을 올립니다. 실제로는 봇이 몇 분 안에 제안합니다. 명백한 답에 대해서는 보상이 공짜 돈이기 때문입니다.",
                "**이의 기간(Liveness).** 도전 창이 열립니다 — UMA 기본값은 7,200초(2시간)입니다. 아무도 이의를 제기하지 않으면 아무 일도 일어나지 않습니다.",
                "**확정(Settle)** — *정상 경로.* 이의 없이 기간이 만료되면 답이 최종 확정되고, 제안자는 보증금과 보상을 돌려받습니다.",
                "**분쟁(Dispute)** — *드문 경로.* 도전자가 같은 액수의 보증금을 겁니다. 질문은 UMA의 DVM으로 올라가 UMA 토큰 보유자들이 약 48–96시간 동안 투표합니다. 패자의 보증금은 승자에게 갑니다.",
              ],
            },
            {
              p: "답은 고정소수점 숫자로 인코딩됩니다. **1e18은 YES**, **0은 NO**, **0.5e18은 판정 불가(unresolvable)** — 질문이 모호했거나 사건을 실제로 확정할 수 없을 때 쓰입니다. Verex는 이를 다시 CTF 지급 벡터로 매핑합니다.",
            },
          ],
        },
        {
          id: "bonds",
          heading: "보증금과 화이트리스트",
          blocks: [
            {
              p: "보증금은 UMA의 `AddressWhitelist`에 등록된 통화로만 걸 수 있습니다. Verex의 자체 테스트 USDC는 등록되어 있지 않으며, 이것이 Sepolia에서 연동을 시작하며 처음 마주한 실제 제약이었습니다.",
            },
            {
              p: "선택한 보증금 통화는 **Sepolia WETH**이고 이유는 실용적입니다 — 셀프서비스이기 때문입니다. WETH 컨트랙트의 `deposit()`에 ETH를 보내면 누구나 얻을 수 있는 반면, UMA가 화이트리스트에 올린 자체 테스트 USDC는 공개 발행 창구가 없습니다. WETH에는 소액의 최종 수수료(0.001)가 붙지만, 토큰을 나눠줄 누군가에게 의존하지 않는 대가로는 치를 만한 비용입니다.",
            },
          ],
        },
        {
          id: "attacks",
          heading: "투표자가 악의적이면 어떻게 되나?",
          blocks: [
            {
              p: "솔직히 답하면, 이것은 해결된 문제가 아니라 실재하는 위험 범주입니다. 낙관적 오라클의 보장은 경제학에 기대고 있고, 경제학은 공격당할 수 있습니다.",
            },
            {
              ul: [
                "**잘못된 제안**은 값싼 경우입니다. 지켜보는 누구든 이의를 제기하고 제안자의 보증금을 가져갈 수 있습니다 — 정직한 관찰자가 최소 한 명만 있어도 공격은 손해를 봅니다.",
                "**악의적인 *판정 불가* 투표**가 더 해롭습니다. 지급을 훔치는 것이 아니라 묶어버리는 것이고, 명백히 틀린 답보다 변호하기 쉽습니다.",
                "**거버넌스 장악**은 시스템 차원의 경우입니다. DVM이 토큰 가중 투표이므로, 충분한 의결권을 쥔 공격자는 거짓 답을 승인시킬 수 있습니다. 방어책은 그렇게 하는 순간 그 행위에 사용한 토큰의 가치가 무너진다는 점인데, 이는 억지력이지 보장은 아닙니다.",
              ],
            },
            {
              note: "테스트넷에서는 위험의 모양이 다릅니다. 문제되는 것은 적대적인 분쟁이 아니라 **무관심**입니다. Sepolia 마켓에 돈을 건 사람이 없으니 아무도 지켜보지 않습니다. 낯선 사람이 제기한 분쟁도 실제 투표자들이 처리하겠지만 그 결과는 운영자의 통제 밖입니다 — 그래서 데모 경로는 `setCustomLiveness`로 이의 기간을 줄이고 분쟁 없는 정상 경로를 시연합니다.",
            },
          ],
        },
        {
          id: "per-market",
          heading: "운영자가 마켓별로 방식을 고를 수 있나?",
          blocks: [
            {
              p: "가능합니다 — 단, 생성 시점에만 가능하고 이후에는 불가능합니다. 이유는 정책이 아니라 구조에 있습니다.",
            },
            { code: "conditionId = keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount))" },
            {
              p: "오라클 주소가 마켓 정체성의 해시에 포함됩니다. 운영 중인 마켓을 다른 오라클로 바꾸면 다른 `conditionId`가 계산되는데, 그것은 원래 포지션을 하나도 담고 있지 않은 완전히 다른 마켓입니다. 따라서 운영자 정산과 UMA 사이의 선택은 마켓 생성 시에 이뤄지고 그 마켓의 일생 동안 고정됩니다.",
            },
          ],
        },
      ],
    },
  },
};
