import type { Doc } from "@/lib/docs-types";

export const settlement: Doc = {
  slug: "settlement",
  group: "technical",
  icon: "coins",
  content: {
    en: {
      title: "Custody & on-chain settlement",
      summary: "Conditional tokens, how $1 of collateral becomes a full set of outcomes, and what actually happens on-chain when you trade.",
      lead: "Verex does not keep a ledger of who owns what and promise to honour it. Positions are ERC-1155 tokens on Sepolia, and payouts come from collateral locked in a contract. This document explains the mechanism that makes that work.",
      sections: [
        {
          id: "ctf",
          heading: "Conditional tokens",
          blocks: [
            {
              p: "Verex uses Gnosis's **Conditional Tokens Framework** — the same primitive Polymarket is built on. Its core idea is a *split*: deposit $1 of collateral and receive one token of **every** outcome. Since exactly one outcome will eventually be worth $1 and the rest worth $0, the full set is always worth exactly the $1 you put in.",
            },
            {
              p: "This is what makes the market fundable without anyone taking a directional bet. The operator splits collateral into a complete set, then sells the outcomes it wants to be short of and keeps the rest. It is not betting; it is warehousing inventory.",
            },
            {
              p: "The operation is reversible in both directions. Holding a complete set, you can **merge** it back into $1 of collateral at any time, before resolution and without anyone's permission.",
            },
          ],
        },
        {
          id: "identity",
          heading: "How a market is identified",
          blocks: [
            {
              p: "A market's on-chain identity is derived, not assigned. `prepareCondition` registers a condition, and its id is a hash of three things:",
            },
            { code: "conditionId = keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount))" },
            {
              ul: [
                "**`oracle`** — the address permitted to report the result.",
                "**`questionId`** — the hash of the question key, binding the id to the specific question.",
                "**`outcomeSlotCount`** — how many outcomes exist (2 for a binary market).",
              ],
            },
            {
              p: "Deriving rather than assigning has a useful property: the same inputs always produce the same id, so anyone can verify that a market refers to the question it claims to. It also has the consequence covered in the resolution document — the oracle cannot be changed later, because changing it produces a different market.",
            },
          ],
        },
        {
          id: "trade",
          heading: "What happens when you trade",
          blocks: [
            {
              p: "Matching happens off-chain for speed; settlement happens on-chain for finality. A single trade goes through these stages:",
            },
            {
              ol: [
                "Your order enters the book and matches against resting orders by **price-time priority**. Large orders walk several levels and receive an average fill price.",
                "The matched pair is written to the database and queued as a settlement job.",
                "A worker submits both signed EIP-712 orders to the CTF exchange's `matchOrders`, which moves the ERC-1155 outcome tokens and the collateral atomically.",
                "The settlement chip under your fill flips from *settling on-chain…* to *settled* with a transaction hash.",
              ],
            },
            {
              note: "The queue is built to survive crashes. Settlement jobs are claimed atomically, retried with exponential backoff, and guarded by an idempotency check that skips any fill whose trade is already confirmed — so a worker dying mid-settlement re-runs safely instead of double-settling. A failed job runs a compensating reversal of the database fill.",
            },
          ],
        },
        {
          id: "redeem",
          heading: "Resolution and redemption",
          blocks: [
            {
              p: "Resolution writes a **payout vector** on-chain via `reportPayouts` — for a binary market, `[1, 0]` for Yes or `[0, 1]` for No. This is a one-time, irreversible write.",
            },
            {
              p: "After that, holders call `redeemPositions` to burn their tokens and withdraw the collateral they are owed: $1 per winning token, nothing for losing tokens. The collateral was locked at split time, so redemption is not a promise being honoured — it is a withdrawal of funds that were always there.",
            },
            {
              p: "In the interface this is the **Redeem** button that appears on a resolved position in the Portfolio, along with the realised profit and loss against your cost basis.",
            },
          ],
        },
        {
          id: "groups",
          heading: "Multi-outcome markets",
          blocks: [
            {
              p: "A question with five candidates is not one five-slot condition. It is **five separate binary markets** — one Yes/No pair per candidate — grouped in the application layer.",
            },
            {
              p: "The group is what keeps the arithmetic honest: whenever one candidate trades, the others are renormalised so the implied probabilities still total 100%. Structuring it this way means every candidate has its own independent order book and can be traded in isolation, which a single multi-slot condition would not allow.",
            },
          ],
        },
      ],
    },
    ko: {
      title: "보관과 온체인 정산",
      summary: "조건부 토큰, 담보 $1이 결과 한 세트가 되는 방식, 그리고 거래할 때 온체인에서 실제로 벌어지는 일.",
      lead: "Verex는 누가 무엇을 가졌는지 장부에 적어두고 지키겠다고 약속하는 방식이 아닙니다. 포지션은 Sepolia 위의 ERC-1155 토큰이고, 지급은 컨트랙트에 잠긴 담보에서 나옵니다. 이 문서는 그것을 가능하게 하는 메커니즘을 설명합니다.",
      sections: [
        {
          id: "ctf",
          heading: "조건부 토큰 (Conditional Tokens)",
          blocks: [
            {
              p: "Verex는 Gnosis의 **Conditional Tokens Framework**를 사용합니다 — Polymarket이 올라타 있는 것과 같은 원시 요소입니다. 핵심 아이디어는 *분할(split)*입니다. 담보 $1을 예치하면 **모든** 결과의 토큰을 하나씩 받습니다. 결국 정확히 하나의 결과만 $1이 되고 나머지는 $0이 되므로, 한 세트 전체의 가치는 언제나 넣은 $1과 정확히 같습니다.",
            },
            {
              p: "이것이 아무도 방향성 베팅을 하지 않고도 마켓에 자금을 댈 수 있게 해줍니다. 운영자는 담보를 한 세트로 분할한 뒤 숏을 잡고 싶은 결과를 팔고 나머지를 보유합니다. 베팅이 아니라 재고 보관입니다.",
            },
            {
              p: "이 연산은 양방향으로 되돌릴 수 있습니다. 한 세트를 온전히 들고 있으면 정산 전 언제든, 누구의 허락도 없이 **병합(merge)**해서 담보 $1로 되돌릴 수 있습니다.",
            },
          ],
        },
        {
          id: "identity",
          heading: "마켓은 어떻게 식별되는가",
          blocks: [
            {
              p: "마켓의 온체인 정체성은 부여되는 것이 아니라 유도됩니다. `prepareCondition`이 조건을 등록하고, 그 id는 세 가지를 해시한 값입니다.",
            },
            { code: "conditionId = keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount))" },
            {
              ul: [
                "**`oracle`** — 결과를 보고할 권한이 있는 주소.",
                "**`questionId`** — 질문 키의 해시로, id를 특정 질문에 묶는 값.",
                "**`outcomeSlotCount`** — 결과의 개수 (이진 마켓이면 2).",
              ],
            },
            {
              p: "부여가 아니라 유도이기 때문에 유용한 성질이 생깁니다. 같은 입력은 항상 같은 id를 내므로, 누구나 그 마켓이 자신이 주장하는 질문을 가리키는지 검증할 수 있습니다. 동시에 결과 확정 문서에서 다룬 귀결도 따라옵니다 — 오라클을 나중에 바꿀 수 없습니다. 바꾸면 다른 마켓이 되기 때문입니다.",
            },
          ],
        },
        {
          id: "trade",
          heading: "거래할 때 벌어지는 일",
          blocks: [
            {
              p: "매칭은 속도를 위해 오프체인에서, 정산은 최종성을 위해 온체인에서 이뤄집니다. 거래 한 건은 다음 단계를 거칩니다.",
            },
            {
              ol: [
                "주문이 호가창에 들어가 **가격-시간 우선순위**로 대기 주문과 체결됩니다. 큰 주문은 여러 가격대를 훑고 평균 체결가를 받습니다.",
                "체결된 쌍이 데이터베이스에 기록되고 정산 작업으로 큐에 들어갑니다.",
                "워커가 서명된 EIP-712 주문 두 건을 CTF 거래소의 `matchOrders`에 제출하고, ERC-1155 결과 토큰과 담보가 원자적으로 이동합니다.",
                "체결 아래 정산 칩이 *온체인 정산 중…*에서 트랜잭션 해시와 함께 *정산 완료*로 바뀝니다.",
              ],
            },
            {
              note: "이 큐는 장애를 견디도록 만들어져 있습니다. 정산 작업은 원자적으로 점유되고, 지수 백오프로 재시도되며, 이미 확정된 거래의 체결은 건너뛰는 멱등성 검사가 걸려 있습니다 — 워커가 정산 도중 죽어도 이중 정산 없이 안전하게 재실행됩니다. 최종 실패한 작업은 데이터베이스 체결을 되돌리는 보상 처리를 수행합니다.",
            },
          ],
        },
        {
          id: "redeem",
          heading: "정산과 상환",
          blocks: [
            {
              p: "정산은 `reportPayouts`로 **지급 벡터**를 온체인에 기록합니다 — 이진 마켓이면 Yes는 `[1, 0]`, No는 `[0, 1]`입니다. 단 한 번만 가능하고 되돌릴 수 없는 기록입니다.",
            },
            {
              p: "이후 보유자는 `redeemPositions`를 호출해 토큰을 소각하고 받을 담보를 인출합니다. 승리 토큰 1개당 $1, 패배 토큰은 0입니다. 담보는 분할 시점에 이미 잠겨 있었으므로 상환은 약속을 지키는 행위가 아니라 처음부터 거기 있던 자금을 찾아가는 일입니다.",
            },
            {
              p: "화면상으로는 포트폴리오의 정산된 포지션에 나타나는 **상환(Redeem)** 버튼이며, 매입 단가 대비 실현 손익이 함께 표시됩니다.",
            },
          ],
        },
        {
          id: "groups",
          heading: "다중 결과 마켓",
          blocks: [
            {
              p: "후보가 다섯인 질문은 슬롯이 다섯 개인 조건 하나가 아닙니다. 애플리케이션 계층에서 묶인 **다섯 개의 독립적인 이진 마켓** — 후보마다 하나씩의 Yes/No 쌍입니다.",
            },
            {
              p: "산술을 정직하게 유지하는 것이 이 그룹입니다. 한 후보가 거래될 때마다 나머지가 재정규화되어 내포 확률의 합이 100%로 유지됩니다. 이렇게 구성하면 각 후보가 자기만의 독립된 호가창을 갖고 따로 거래될 수 있는데, 슬롯이 여러 개인 단일 조건으로는 불가능한 일입니다.",
            },
          ],
        },
      ],
    },
  },
};
