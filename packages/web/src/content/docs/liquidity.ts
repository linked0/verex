import type { Doc } from "@/lib/docs-types";

export const liquidity: Doc = {
  slug: "hybrid-amm-clob",
  group: "technical",
  icon: "chart",
  content: {
    en: {
      title: "Liquidity: Hybrid AMM + CLOB",
      summary: "Why an empty order book is the hard problem, why LMSR beats a constant-product curve here, and how the two venues merge.",
      lead: "A market with no resting orders cannot be traded. This document explains the cold-start problem, the market-structure vocabulary around it, and why Verex prices its automated liquidity with LMSR rather than a constant-product curve.",
      sections: [
        {
          id: "cold-start",
          heading: "The cold-start problem",
          blocks: [
            {
              p: "A pure order book only works when somebody is already quoting. A brand-new market has nobody: the first trader sees an empty book, the spread is effectively infinite, and there is no price at all. This is the **cold-start** problem, and it is the reason almost no prediction market is a pure order book.",
            },
            {
              p: "The standard answer is an automated market maker — a formula that will always quote a price, funded once, requiring no counterparty. Verex today approximates this with an operator-run **ladder**: five price levels either side of the current estimate, weighted `[5,4,3,2,1]` so depth thins as you move away from the middle, repriced after each fill from the operator's own inventory.",
            },
          ],
        },
        {
          id: "vocabulary",
          heading: "The vocabulary, in order",
          blocks: [
            {
              p: "It helps to name the three structures precisely, because “hybrid” only means something relative to them:",
            },
            {
              table: {
                head: ["Structure", "How a price appears", "Who takes the other side"],
                rows: [
                  ["**Quote-driven** (dealer)", "A dealer names bid and ask", "The dealer, always — it holds inventory and risk"],
                  ["**Order-driven** (pure CLOB)", "Emerges from users' limit orders", "Another user; the venue only matches"],
                  ["**Hybrid AMM + CLOB**", "Both: real orders *and* a curve", "Whichever is cheaper at that size"],
                ],
              },
            },
            {
              p: "The third is the target design. Today Verex sits between the second and third: a real order book whose operator quotes are priced by the formula, but with the curve still off-chain (Phase A). The formula behaves like a tireless dealer that never withdraws its quote, while real users can still post better prices and be matched first.",
            },
          ],
        },
        {
          id: "why-not-cpmm",
          heading: "Why not constant product",
          blocks: [
            {
              p: "The obvious curve is Uniswap's constant product, `x · y = k`. It was the original plan here, and simulation is what ruled it out.",
            },
            {
              p: "CPMM was designed for two assets whose relative price can go anywhere from 0 to infinity. Prediction-market outcomes are not like that — they are **bounded in [0, 1]** and must sum to 1. Near the tails the curve fights that constraint: at extreme probabilities a constant-product pool will happily quote a Yes token above **$1.00**, which is a price no rational buyer should ever pay, since $1 is the absolute maximum the token can ever pay out.",
            },
            {
              note: "This is not a tuning problem. The curve's shape is wrong for a bounded asset; no choice of reserves fixes the tail behaviour.",
            },
          ],
        },
        {
          id: "lmsr",
          heading: "LMSR — a curve built for probabilities",
          blocks: [
            {
              p: "Hanson's **Logarithmic Market Scoring Rule** is the standard prediction-market maker, and it is built around the constraint CPMM violates. Prices come straight from a softmax over the quantity sold of each outcome:",
            },
            { code: "price_i = e^(q_i / b) / Σⱼ e^(q_j / b)" },
            {
              p: "Three properties fall out of that formula for free, and they are exactly the ones a prediction market needs:",
            },
            {
              ul: [
                "**Prices always sum to 1.** It is a softmax — normalisation is structural, not enforced afterwards.",
                "**Prices stay inside (0, 1).** The $1.00-quote failure mode cannot occur.",
                "**Loss is bounded.** The maximum the maker can lose is `b · ln(n)` — for a binary market, `b · ln 2`. The liquidity parameter `b` is a direct dial: larger `b` means tighter spreads and deeper quotes, paid for with a larger worst-case subsidy.",
              ],
            },
            {
              p: "That last property is what makes LMSR fundable. The operator can decide in advance exactly how much it is willing to spend to make a market liquid, and the formula guarantees it cannot exceed that.",
            },
          ],
        },
        {
          id: "does-the-book-change",
          heading: "Does the order book change?",
          blocks: [
            {
              p: "No — and this is the point most easily misread. LMSR replaces **how the operator decides its quotes**, not how orders match. The matching engine keeps price-time priority; user limit orders still rest in the book and still fill first when they are better.",
            },
            {
              p: "Concretely, the change is to the ladder's centre. Today the centre is a stored probability that gets nudged to the last traded price. Under LMSR the centre is computed from the outcome quantities the operator has sold, so it moves *because inventory moved* — the quote responds to actual exposure rather than to the last print.",
            },
            {
              p: "One consequence surprises almost everyone the first time: **after a trade, the operator's previous levels are gone entirely.** Buy at 51¢ on a book centred at 50¢ and the 45–49¢ bids you were just looking at no longer exist. They were not filled — they were cancelled. Every re-quote tears down the whole ladder and posts a fresh one around the new centre.",
            },
            {
              p: "This is the difference between an *order* and a *quote*. An order is a standing instruction that persists until its owner cancels it; a quote is a statement of what the venue will do right now, and it is only valid until the next fill. The operator's rungs are quotes. They are cancelled DB-side only — nothing was escrowed on-chain when they were posted, so withdrawing them costs one update and no transaction.",
            },
            {
              p: "Two things this does *not* touch. Your own resting orders are never cancelled — the sweep is scoped to the market maker's own orders, so a user bid inside the spread survives every re-quote and still gets hit first. And depth is not additive across time: the book you see is always exactly one ladder, the most recent one, never an accumulation of every price the market has passed through.",
            },
            {
              p: "This was planned in two phases. **Phase A** — LMSR computing the quote centres inside the market maker, with everything else unchanged — is what Verex runs today. **Phase B** would put an actual pool on-chain so traders could transact directly against the curve even if the off-chain matcher were unavailable.",
            },
          ],
        },
        {
          id: "routing",
          heading: "How the two venues merge",
          blocks: [
            {
              note: "**Phase B is deliberately deferred, so this section describes the design rather than the running system.** Every benefit an on-chain pool provides — surviving operator downtime, resisting censorship, letting anyone verify the quote — is a benefit of *not having to trust the operator*. On a testnet with test USDC there is no adversary to resist and nobody who can lose money, so those guarantees buy nothing yet. They start mattering on mainnet, and that is when this gets built.",
            },
            {
              p: "Once a curve exists on-chain alongside the book, an incoming order is matched against **combined depth**. The curve is read as a set of virtual resting orders — one at each price tick — and merged into the real book. A large order is then split across whichever side is cheaper at each level.",
            },
            {
              p: "The result is strictly better than either venue alone: real orders provide tight prices at small size, the curve provides unlimited depth at a predictable cost, and the trader simply sees one book with an average fill price.",
            },
            {
              note: "**Not the same as negative risk.** Negative risk is a *capital-efficiency* mechanism — holding No on every candidate but one is equivalent to holding Yes on that one, so the collateral can be reused. It reduces the capital needed to quote; it does not create liquidity where none exists. The two solve different problems and compose fine.",
            },
          ],
        },
      ],
    },
    ko: {
      title: "유동성: Hybrid AMM + CLOB",
      summary: "빈 호가창이 왜 진짜 어려운 문제인지, 여기서 왜 LMSR이 상수곱 곡선보다 나은지, 두 장(場)이 어떻게 합쳐지는지.",
      lead: "걸려 있는 주문이 없는 마켓은 거래할 수 없습니다. 이 문서는 콜드 스타트 문제, 그 주변의 시장 구조 용어, 그리고 Verex가 자동 유동성의 가격을 상수곱 곡선이 아니라 LMSR로 매기는 이유를 설명합니다.",
      sections: [
        {
          id: "cold-start",
          heading: "콜드 스타트 문제",
          blocks: [
            {
              p: "순수 호가창은 누군가 이미 호가를 대고 있을 때만 작동합니다. 갓 만들어진 마켓에는 아무도 없습니다. 첫 트레이더는 빈 호가창을 보고, 스프레드는 사실상 무한대이며, 가격이라는 것이 아예 존재하지 않습니다. 이것이 **콜드 스타트** 문제이고, 순수 호가창 방식의 예측 시장이 거의 없는 이유입니다.",
            },
            {
              p: "표준 해법은 자동 마켓메이커입니다 — 한 번 자금을 넣으면 상대방 없이도 항상 가격을 제시하는 수식이죠. Verex는 현재 이를 운영자가 운용하는 **사다리(ladder)**로 근사합니다. 현재 추정치 양쪽으로 다섯 개 가격대를 두고 `[5,4,3,2,1]` 가중치로 중앙에서 멀어질수록 잔량을 얇게 하며, 체결이 일어날 때마다 운영자 자신의 재고를 기준으로 호가를 다시 겁니다.",
            },
          ],
        },
        {
          id: "vocabulary",
          heading: "용어 정리 (순서대로)",
          blocks: [
            {
              p: "세 가지 구조의 이름을 정확히 아는 것이 도움이 됩니다. “하이브리드”라는 말은 이들과의 관계에서만 의미가 있기 때문입니다.",
            },
            {
              table: {
                head: ["구조", "가격이 생기는 방식", "반대편을 받는 주체"],
                rows: [
                  ["**호가 주도형** (딜러)", "딜러가 매수·매도 호가를 제시", "언제나 딜러 — 재고와 리스크를 떠안음"],
                  ["**주문 주도형** (순수 CLOB)", "사용자들의 지정가 주문에서 자연히 형성", "다른 사용자. 거래소는 매칭만 함"],
                  ["**Hybrid AMM + CLOB**", "둘 다 — 실제 주문 *그리고* 곡선", "그 수량에서 더 싼 쪽"],
                ],
              },
            },
            {
              p: "세 번째가 목표 설계입니다. 현재 Verex는 두 번째와 세 번째 사이에 있습니다 — 실제 호가창을 두고 운영자 호가를 수식으로 매기되, 곡선은 아직 오프체인입니다(A단계). 수식이 호가를 절대 거두지 않는 지치지 않는 딜러처럼 작동하는 동시에, 실제 사용자는 더 좋은 가격을 걸고 먼저 체결될 수 있습니다.",
            },
          ],
        },
        {
          id: "why-not-cpmm",
          heading: "왜 상수곱(CPMM)이 아닌가",
          blocks: [
            {
              p: "가장 먼저 떠오르는 곡선은 Uniswap의 상수곱 `x · y = k`입니다. 원래 계획도 그것이었고, 이를 배제하게 만든 것은 시뮬레이션이었습니다.",
            },
            {
              p: "CPMM은 상대 가격이 0에서 무한대까지 갈 수 있는 두 자산을 위해 설계되었습니다. 예측 시장의 결과는 그렇지 않습니다 — **[0, 1] 범위에 갇혀 있고** 합이 1이어야 합니다. 꼬리 구간에서 곡선은 이 제약과 충돌합니다. 극단적인 확률에서 상수곱 풀은 Yes 토큰을 아무렇지 않게 **$1.00 위로** 호가합니다. 토큰이 지급할 수 있는 최대치가 $1이므로, 합리적인 매수자라면 결코 지불해서는 안 되는 가격입니다.",
            },
            {
              note: "이것은 튜닝 문제가 아닙니다. 곡선의 형태 자체가 유계 자산에 맞지 않으며, 준비금을 어떻게 잡아도 꼬리 구간의 동작은 고쳐지지 않습니다.",
            },
          ],
        },
        {
          id: "lmsr",
          heading: "LMSR — 확률을 위해 만들어진 곡선",
          blocks: [
            {
              p: "Hanson의 **로그 시장 스코어링 규칙(LMSR)**은 예측 시장의 표준 마켓메이커이며, CPMM이 위반하는 바로 그 제약을 중심으로 설계되었습니다. 가격은 각 결과의 판매 수량에 대한 소프트맥스에서 곧바로 나옵니다.",
            },
            { code: "price_i = e^(q_i / b) / Σⱼ e^(q_j / b)" },
            {
              p: "이 수식에서 세 가지 성질이 공짜로 따라 나오는데, 정확히 예측 시장에 필요한 것들입니다.",
            },
            {
              ul: [
                "**가격 합이 항상 1.** 소프트맥스이므로 정규화는 사후에 강제하는 것이 아니라 구조적으로 보장됩니다.",
                "**가격이 (0, 1) 안에 머묾.** $1.00 초과 호가라는 실패 양상이 발생할 수 없습니다.",
                "**손실이 유계.** 마켓메이커의 최대 손실은 `b · ln(n)`, 이진 마켓이면 `b · ln 2`입니다. 유동성 파라미터 `b`가 그대로 조절 손잡이입니다 — `b`가 클수록 스프레드가 좁고 호가가 두꺼워지며, 그 대가로 최악의 경우 보조금이 커집니다.",
              ],
            },
            {
              p: "마지막 성질이 LMSR을 예산 편성 가능한 방식으로 만듭니다. 운영자는 마켓을 유동적으로 만들기 위해 얼마를 쓸 의향이 있는지 사전에 정할 수 있고, 수식이 그 한도를 넘지 않음을 보장합니다.",
            },
          ],
        },
        {
          id: "does-the-book-change",
          heading: "호가창 자체가 바뀌나요?",
          blocks: [
            {
              p: "아닙니다 — 그리고 이 부분이 가장 오해하기 쉽습니다. LMSR이 바꾸는 것은 **운영자가 호가를 정하는 방식**이지, 주문이 체결되는 방식이 아닙니다. 매칭 엔진은 가격-시간 우선순위를 그대로 유지하고, 사용자 지정가 주문은 여전히 호가창에 남아 더 좋은 가격이면 먼저 체결됩니다.",
            },
            {
              p: "구체적으로 바뀌는 것은 사다리의 중심입니다. 지금은 중심이 저장된 확률값이고 마지막 체결가 쪽으로 조금씩 밀립니다. LMSR에서는 중심이 운영자가 판매한 결과 수량으로부터 계산되므로, *재고가 움직였기 때문에* 중심이 움직입니다 — 마지막 체결가가 아니라 실제 익스포저에 호가가 반응하는 것입니다.",
            },
            {
              p: "여기서 파생되는 결과 하나가 처음 보는 사람을 거의 예외 없이 놀라게 합니다: **거래가 끝나면 운영자의 기존 호가 단계는 통째로 사라집니다.** 중심이 50¢인 호가창에서 51¢에 매수하면, 방금까지 보고 있던 45–49¢ 매수 호가들이 더는 존재하지 않습니다. 체결된 것이 아니라 **취소된** 것입니다. 재호가 때마다 사다리 전체를 철거하고 새 중심 주위에 다시 깝니다.",
            },
            {
              p: "이것이 *주문(order)* 과 *호가(quote)* 의 차이입니다. 주문은 주인이 취소할 때까지 남아 있는 상시 지시이고, 호가는 “지금 이 순간 이 거래소가 무엇을 하겠다”는 표명이라 다음 체결까지만 유효합니다. 운영자의 사다리 단계는 호가입니다. 취소는 DB에서만 이루어집니다 — 게시할 때 온체인에 에스크로된 것이 없으므로, 거둬들이는 비용은 업데이트 한 번이고 트랜잭션은 발생하지 않습니다.",
            },
            {
              p: "이 동작이 건드리지 *않는* 것 두 가지. 사용자 본인의 대기 주문은 절대 취소되지 않습니다 — 정리 대상이 마켓메이커 자신의 주문으로 한정되어 있어, 스프레드 안쪽의 사용자 호가는 모든 재호가를 살아남고 여전히 먼저 체결됩니다. 그리고 깊이는 시간에 걸쳐 누적되지 않습니다. 보이는 호가창은 언제나 정확히 사다리 하나, 가장 최근 것뿐이며, 마켓이 지나온 모든 가격이 쌓인 것이 아닙니다.",
            },
            {
              p: "원래 두 단계로 계획되었습니다. **A단계** — LMSR이 마켓메이커 안에서 호가 중심을 계산하고 나머지는 그대로 두는 방식 — 가 현재 Verex가 돌리고 있는 것입니다. **B단계**는 실제 풀을 온체인에 올려, 오프체인 매처가 죽어 있어도 트레이더가 곡선과 직접 거래할 수 있게 하는 단계입니다.",
            },
          ],
        },
        {
          id: "routing",
          heading: "두 장(場)이 합쳐지는 방식",
          blocks: [
            {
              note: "**B단계는 의도적으로 미뤄 두었으므로, 이 절은 현재 돌아가는 시스템이 아니라 설계를 설명합니다.** 온체인 풀이 주는 이점 — 운영자 다운타임을 견디고, 검열에 저항하고, 누구나 호가를 검증할 수 있게 하는 것 — 은 모두 *운영자를 신뢰하지 않아도 되게 하는* 이점입니다. 테스트 USDC로 도는 테스트넷에는 저항할 적대자도, 돈을 잃을 사람도 없으므로 아직 그 보장이 사주는 것이 없습니다. 메인넷에서 의미가 생기고, 그때 만들게 됩니다.",
            },
            {
              p: "호가창 옆에 온체인 곡선이 생기면, 들어온 주문은 **합산된 잔량**에 대해 체결됩니다. 곡선은 가격 눈금마다 하나씩 걸린 가상의 지정가 주문 집합으로 읽혀 실제 호가창에 병합됩니다. 큰 주문은 각 가격대에서 더 싼 쪽으로 쪼개져 나갑니다.",
            },
            {
              p: "결과는 두 방식 각각보다 엄밀히 낫습니다. 실제 주문이 작은 수량에서 좁은 가격을 제공하고, 곡선이 예측 가능한 비용으로 무제한 깊이를 제공하며, 트레이더에게는 그냥 하나의 호가창과 평균 체결가로 보입니다.",
            },
            {
              note: "**네거티브 리스크와는 다릅니다.** 네거티브 리스크는 *자본 효율* 메커니즘입니다 — 한 후보만 빼고 전부 No를 보유하는 것은 그 한 후보에 Yes를 보유하는 것과 같으므로 담보를 재사용할 수 있습니다. 호가를 대는 데 필요한 자본을 줄여줄 뿐, 없던 유동성을 만들어내지는 않습니다. 둘은 서로 다른 문제를 풀며 함께 쓰는 데 문제가 없습니다.",
            },
          ],
        },
      ],
    },
  },
};
