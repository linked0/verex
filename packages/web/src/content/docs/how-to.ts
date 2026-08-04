import type { Doc } from "@/lib/docs-types";

// Ported from the old /how-to page, which this replaces. Screenshots keep their
// original /how-to/*.png paths in public/.
export const howTo: Doc = {
  slug: "how-to",
  group: "guide",
  icon: "book",
  content: {
    en: {
      title: "How to use Verex",
      summary: "The whole demo lifecycle — faucet, trade, resolve, redeem — with the actual screens.",
      lead: "Verex is a demo prediction market: every trade is a real order matched in a central limit order book and settled on-chain (Gnosis Conditional Tokens + a CTF exchange). This page walks through the whole lifecycle with the actual screens.",
      sections: [
        {
          id: "wallets",
          heading: "1 · Demo wallets & the faucet",
          blocks: [
            {
              p: "The wallet selector in the top-right corner switches between **Demo Wallets #1–5** (regular traders, seeded with 1,000 test USDC each) and the **Operator Wallet** (the admin that provides liquidity and resolves markets). Everything you do — trades, positions, history — belongs to the wallet that is active.",
            },
            { img: { src: "/how-to/faucet.png", alt: "The nav controls: Create, Portfolio, Faucet, wallet selector" } },
            {
              p: "Need more play money? Press **Faucet** — it mints 1,000 test USDC to the active demo wallet. **Check the result** right next to the wallet selector: the balance there updates immediately (it also appears at the top of your Portfolio). Buying with an empty balance also auto-faucets as a safety net, so you can never get stuck.",
            },
          ],
        },
        {
          id: "trade",
          heading: "2 · Trade",
          blocks: [
            {
              p: "Open any market and use the **Trade** panel: pick Yes or No, enter a USDC amount (BUY) or a token amount (SELL), and submit. Your order fills instantly against the order book — the operator's market-making ladder keeps both sides quoted — and the matched pair settles on-chain a moment later. Watch the small *settling on-chain… → settled* chip under the fill for the transaction hash; your position appears in the Portfolio as soon as it confirms.",
            },
            { img: { src: "/how-to/trade.png", alt: "Market page with trade panel and order book" } },
            {
              p: "The **Order book** card shows the live depth around the mid price. Big orders walk through several price levels — the fill result shows your average price.",
            },
          ],
        },
        {
          id: "groups",
          heading: "3 · Multi-outcome markets",
          blocks: [
            {
              p: "Questions like *“Who will win the 2026 World Series?”* have many candidates. Each candidate is its own Yes/No market under the hood, and the group keeps their probabilities **summing to 100%**: buying one candidate automatically re-prices the others. Click an outcome row to trade it; the chart tracks the top candidates over time.",
            },
            { img: { src: "/how-to/group.png", alt: "A multi-outcome group page with outcome rows and chart" } },
          ],
        },
        {
          id: "resolve",
          heading: "4 · Resolve (operator)",
          blocks: [
            {
              p: "Switch the wallet selector to **Operator Wallet** and open a market: the trade panel becomes the **Resolve** panel. Report the final outcome (Yes/No — or pick the winner on a group page) and confirm. The market flips to RESOLVED immediately; the payout reports settle on-chain behind the status chip. Resolution is irreversible: winning tokens are now worth $1, losing tokens $0.",
            },
            { img: { src: "/how-to/resolve.png", alt: "The operator's resolve panel on a market page" } },
          ],
        },
        {
          id: "portfolio",
          heading: "5 · Portfolio & redeem",
          blocks: [
            {
              p: "**Portfolio** shows the active wallet's USDC balance, every position with cost basis and P&L, and the full activity feed. After a market you hold resolves, the position shows **WON** or **LOST** and a **Redeem** button appears — press it to burn the tokens and collect $1 per winning token. The payout lands when the settlement chip confirms, and the redemption appears in the activity feed with its realized P&L (click the REDEEM tag for the breakdown).",
            },
            { img: { src: "/how-to/portfolio.png", alt: "Portfolio with balances, positions and activity" } },
          ],
        },
        {
          id: "create",
          heading: "6 · Create a market",
          blocks: [
            {
              p: "Anyone can create a market from **Create** in the top menu: write the question, pick a category, list at least two outcomes (exactly “Yes” and “No” makes a simple binary market), set the resolution time, and submit. The server creates every outcome on-chain and the **operator funds the opening order books** with the liquidity you chose (up to 1,000 USDC per outcome) — no gas needed from you. A progress bar tracks the batch; when it finishes you land on your new market.",
            },
            { img: { src: "/how-to/create.png", alt: "The create-market form" } },
          ],
        },
        {
          id: "loop",
          heading: "The full demo loop",
          blocks: [
            {
              ol: [
                "Pick Demo Wallet #1 and hit Faucet — check the balance next to the selector.",
                "Buy Yes on any market (or a candidate in a group) and watch the chip settle.",
                "See the position and cost basis in Portfolio.",
                "Switch to the Operator Wallet and resolve the market your way.",
                "Switch back, Redeem from Portfolio, and check the realized P&L.",
                "Create your own market and trade it — the operator quotes it automatically.",
              ],
            },
          ],
        },
      ],
    },
    ko: {
      title: "Verex 사용법",
      summary: "Faucet부터 거래·정산·상환까지 데모 전체 흐름을 실제 화면과 함께 설명합니다.",
      lead: "Verex는 데모 예측 시장입니다. 모든 거래는 중앙 지정가 호가창(CLOB)에서 실제로 체결되고 온체인으로 정산됩니다(Gnosis Conditional Tokens + CTF 거래소). 이 문서는 전체 생애주기를 실제 화면과 함께 따라갑니다.",
      sections: [
        {
          id: "wallets",
          heading: "1 · 데모 지갑과 Faucet",
          blocks: [
            {
              p: "오른쪽 위 지갑 선택기로 **데모 지갑 #1–5**(각각 테스트 USDC 1,000개를 가진 일반 트레이더)와 **운영자 지갑**(유동성을 공급하고 마켓을 정산하는 관리자)을 전환합니다. 거래·포지션·기록 등 모든 활동은 현재 선택된 지갑에 귀속됩니다.",
            },
            { img: { src: "/how-to/faucet.png", alt: "상단 내비게이션: 마켓 생성, 포트폴리오, Faucet, 지갑 선택기" } },
            {
              p: "자금이 더 필요하면 **Faucet**을 누르세요. 현재 데모 지갑에 테스트 USDC 1,000개가 발행됩니다. **결과는 지갑 선택기 바로 옆에서 확인**하세요 — 잔액이 즉시 갱신되며 포트폴리오 상단에도 표시됩니다. 잔액이 0인 상태로 매수해도 자동으로 발행되므로 막히는 일은 없습니다.",
            },
          ],
        },
        {
          id: "trade",
          heading: "2 · 거래",
          blocks: [
            {
              p: "아무 마켓이나 열고 **거래(Trade)** 패널을 사용하세요. Yes 또는 No를 고르고 USDC 금액(매수) 또는 토큰 수량(매도)을 입력한 뒤 제출합니다. 주문은 호가창에서 즉시 체결되고(운영자의 마켓메이킹 사다리가 양쪽 호가를 항상 유지합니다) 잠시 후 체결된 쌍이 온체인에 정산됩니다. 체결 아래 작은 *온체인 정산 중… → 정산 완료* 칩에서 트랜잭션 해시를 확인할 수 있고, 확정되는 즉시 포트폴리오에 포지션이 나타납니다.",
            },
            { img: { src: "/how-to/trade.png", alt: "거래 패널과 호가창이 있는 마켓 페이지" } },
            {
              p: "**호가창(Order book)** 카드는 중간가 주변의 실시간 잔량을 보여줍니다. 큰 주문은 여러 가격대를 훑고 지나가며, 체결 결과에 평균 체결가가 표시됩니다.",
            },
          ],
        },
        {
          id: "groups",
          heading: "3 · 다중 결과 마켓",
          blocks: [
            {
              p: "*“2026 월드시리즈 우승팀은?”* 같은 질문에는 후보가 여럿입니다. 내부적으로 각 후보는 독립된 Yes/No 마켓이며, 그룹은 확률의 **합을 100%로** 유지합니다. 한 후보를 매수하면 나머지 가격이 자동으로 재조정됩니다. 결과 행을 클릭하면 해당 후보를 거래할 수 있고, 차트는 상위 후보들의 시간 변화를 추적합니다.",
            },
            { img: { src: "/how-to/group.png", alt: "결과 목록과 차트가 있는 다중 결과 그룹 페이지" } },
          ],
        },
        {
          id: "resolve",
          heading: "4 · 정산 (운영자)",
          blocks: [
            {
              p: "지갑 선택기를 **운영자 지갑**으로 바꾸고 마켓을 열면 거래 패널이 **정산(Resolve)** 패널로 바뀝니다. 최종 결과를 보고하고(Yes/No, 그룹 페이지에서는 승자 선택) 확인하면 마켓이 즉시 RESOLVED로 전환되고, 지급 보고가 상태 칩 뒤에서 온체인 정산됩니다. 정산은 되돌릴 수 없습니다 — 승리 토큰은 $1, 패배 토큰은 $0의 가치를 갖습니다.",
            },
            { img: { src: "/how-to/resolve.png", alt: "마켓 페이지의 운영자 정산 패널" } },
          ],
        },
        {
          id: "portfolio",
          heading: "5 · 포트폴리오와 상환",
          blocks: [
            {
              p: "**포트폴리오**는 현재 지갑의 USDC 잔액, 매입 단가와 손익이 포함된 모든 포지션, 전체 활동 내역을 보여줍니다. 보유 중인 마켓이 정산되면 포지션에 **WON** 또는 **LOST**가 표시되고 **상환(Redeem)** 버튼이 나타납니다. 누르면 토큰이 소각되고 승리 토큰 1개당 $1을 받습니다. 정산 칩이 확정되면 지급이 완료되며, 상환 내역은 실현 손익과 함께 활동 피드에 표시됩니다(REDEEM 태그를 클릭하면 상세 내역).",
            },
            { img: { src: "/how-to/portfolio.png", alt: "잔액·포지션·활동이 있는 포트폴리오" } },
          ],
        },
        {
          id: "create",
          heading: "6 · 마켓 생성",
          blocks: [
            {
              p: "누구나 상단 메뉴의 **마켓 생성**에서 마켓을 만들 수 있습니다. 질문을 쓰고, 카테고리를 고르고, 결과를 최소 두 개 나열하고(정확히 “Yes”와 “No”면 단순 이진 마켓), 정산 시각을 정한 뒤 제출하세요. 서버가 모든 결과를 온체인에 생성하고 **운영자가 초기 호가창에 유동성을 채웁니다**(결과당 최대 1,000 USDC). 사용자가 가스를 낼 필요는 없습니다. 진행 바가 배치를 추적하고, 끝나면 새로 만든 마켓으로 이동합니다.",
            },
            { img: { src: "/how-to/create.png", alt: "마켓 생성 폼" } },
          ],
        },
        {
          id: "loop",
          heading: "데모 전체 흐름",
          blocks: [
            {
              ol: [
                "데모 지갑 #1을 고르고 Faucet을 누른 뒤 선택기 옆 잔액을 확인합니다.",
                "아무 마켓(또는 그룹의 후보)에서 Yes를 매수하고 정산 칩을 지켜봅니다.",
                "포트폴리오에서 포지션과 매입 단가를 확인합니다.",
                "운영자 지갑으로 전환해 원하는 대로 마켓을 정산합니다.",
                "다시 데모 지갑으로 돌아와 포트폴리오에서 상환하고 실현 손익을 확인합니다.",
                "직접 마켓을 만들어 거래해 봅니다 — 운영자가 자동으로 호가를 제공합니다.",
              ],
            },
          ],
        },
      ],
    },
  },
};
