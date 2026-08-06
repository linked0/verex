import type { Doc } from "@/lib/docs-types";

export const name: Doc = {
  slug: "name",
  group: "about",
  icon: "scale",
  hero: "mark",
  content: {
    en: {
      title: "The name",
      summary: "Where “Verex” comes from, and what it commits the system to.",
      lead: "Verex is ver- — Latin verus / veritas, “true” — joined to -ex, from exchange. Truth through exchange.",
      sections: [
        {
          id: "method",
          heading: "A claim about method, not a slogan",
          blocks: [
            {
              p: "Most systems that need to know what happened **appoint someone to say so**. A regulator, an editor, an admin with a database. The answer is correct because of who gave it.",
            },
            {
              p: "A prediction market works the other way around. It makes being right pay and being wrong cost, then lets a price emerge from people spending their own money on the answer. Nobody is asked to be impartial; they are asked to be **exposed**. The truth is not announced at the top — it is settled in the trading.",
            },
            {
              p: "That is the whole of it. *ver-* is what the system is for; *-ex* is how it gets there. The second half is not decoration — it is the method that makes the first half more than a wish.",
            },
          ],
        },
        {
          id: "price",
          heading: "Why the price is the claim",
          blocks: [
            {
              p: "Each outcome is a token that pays **$1 if it happens and $0 if it does not**. So a price is not an opinion about the event — it is the amount someone was willing to risk on it. $0.63 means the market collectively puts the event at 63%, and anyone who thinks that is wrong can take the other side and be paid for it if they are right.",
            },
            {
              p: "A forecast that costs nothing to publish is worth roughly what it cost. Requiring the forecaster to hold a position is what converts an opinion into evidence.",
            },
          ],
        },
        {
          id: "half-earned",
          heading: "The name is currently half earned",
          blocks: [
            {
              p: "Today the Verex operator reports every market's result. The trading is genuinely open, but the **last word still belongs to an authority** — which is exactly the arrangement the name is arguing against.",
            },
            {
              p: "That is why the oracle work matters more than its size suggests. Under UMA's Optimistic Oracle, anyone may propose the answer, anyone may dispute it by posting a bond, and a disputed question goes to a vote of token holders. No appointment, no privileged account.",
            },
            {
              note: "Resolution source is a **per-market choice made at creation**, not a global switch — a market's on-chain identity hashes its oracle's address, so it can never be moved to a different one afterwards. See [Resolution & the UMA oracle](/docs/oracle).",
            },
            {
              p: "Until UMA-resolved markets are the default rather than the option, *ver-* is a statement of intent and *-ex* is the part already delivered.",
            },
          ],
        },
        {
          id: "mark",
          heading: "The mark",
          blocks: [
            {
              p: "A ring quartered into two opposing pairs: **Yes** and **No**, facing each other, held inside a single circle. Two sides of one question — a market is not a fight to be won but a disagreement priced. The ring is what keeps them one market: the prices of a question's outcomes always sum to $1.",
            },
          ],
        },
      ],
    },
    ko: {
      title: "이름에 대하여",
      summary: "“Verex”라는 이름의 유래, 그리고 그 이름이 시스템에 부과하는 약속.",
      lead: "Verex는 라틴어 verus / veritas(“참된”)에서 온 ver- 와, exchange(교환)에서 온 -ex 를 합친 이름입니다. 교환을 통해 도달하는 진실.",
      sections: [
        {
          id: "method",
          heading: "구호가 아니라 방법에 대한 주장",
          blocks: [
            {
              p: "무슨 일이 일어났는지 알아야 하는 대부분의 시스템은 **그것을 말해줄 누군가를 임명합니다.** 규제 기관, 편집자, 데이터베이스를 쥔 관리자. 답이 옳은 이유는 그것을 말한 사람이 누구인가에 있습니다.",
            },
            {
              p: "예측 시장은 반대로 작동합니다. 맞히면 이득이 되고 틀리면 손실이 되게 만든 뒤, 자기 돈을 걸고 답을 말하는 사람들로부터 가격이 떠오르게 합니다. 아무에게도 공정하라고 요구하지 않습니다. 대신 **위험을 지라고** 요구합니다. 진실은 위에서 선포되는 것이 아니라 거래 안에서 정해집니다.",
            },
            {
              p: "그게 전부입니다. *ver-* 는 시스템이 무엇을 위한 것인지이고, *-ex* 는 거기에 어떻게 도달하는지입니다. 뒤쪽 절반은 장식이 아니라, 앞쪽 절반을 바람 이상으로 만들어주는 방법입니다.",
            },
          ],
        },
        {
          id: "price",
          heading: "가격이 곧 주장인 이유",
          blocks: [
            {
              p: "각 결과는 **일어나면 $1, 일어나지 않으면 $0**을 지급하는 토큰입니다. 따라서 가격은 사건에 대한 의견이 아니라, 누군가가 그 사건에 걸 의향이 있었던 금액입니다. $0.63은 시장이 그 사건의 확률을 63%로 본다는 뜻이고, 그것이 틀렸다고 보는 사람은 반대편을 잡아 맞으면 대가를 받을 수 있습니다.",
            },
            {
              p: "공표하는 데 아무 비용도 들지 않는 예측은 대체로 그 비용만큼의 가치를 갖습니다. 예측하는 사람에게 포지션을 들라고 요구하는 것이 의견을 증거로 바꿉니다.",
            },
          ],
        },
        {
          id: "half-earned",
          heading: "지금 이 이름은 절반만 지켜졌습니다",
          blocks: [
            {
              p: "현재는 Verex 운영자가 모든 마켓의 결과를 보고합니다. 거래는 실제로 열려 있지만 **마지막 말은 여전히 권위자의 것**이며, 이는 이 이름이 반대하는 바로 그 구조입니다.",
            },
            {
              p: "오라클 작업이 그 분량에 비해 더 중요한 이유입니다. UMA Optimistic Oracle에서는 누구나 답을 제안할 수 있고, 누구나 보증금을 걸고 이의를 제기할 수 있으며, 다툼이 생긴 질문은 토큰 보유자 투표로 갑니다. 임명도, 특권 계정도 없습니다.",
            },
            {
              note: "결과 확정 방식은 전역 스위치가 아니라 **마켓을 만들 때 하는 마켓별 선택**입니다 — 마켓의 온체인 정체성이 오라클 주소를 해시로 품기 때문에, 만든 뒤에는 결코 다른 오라클로 옮길 수 없습니다. [결과 확정과 UMA 오라클](/docs/oracle) 참고.",
            },
            {
              p: "UMA로 확정되는 마켓이 선택지가 아니라 기본값이 되기 전까지, *ver-* 는 의도의 선언이고 *-ex* 는 이미 지켜진 부분입니다.",
            },
          ],
        },
        {
          id: "mark",
          heading: "심볼에 대하여",
          blocks: [
            {
              p: "마주 보는 두 쌍으로 사등분된 원: **Yes**와 **No**가 하나의 원 안에 함께 담겨 있습니다. 한 질문의 두 면 — 시장은 이겨야 할 싸움이 아니라 가격이 매겨진 의견 차이입니다. 그 둘을 하나의 마켓으로 묶어주는 것이 바깥 링입니다. 한 질문에 속한 결과들의 가격 합은 언제나 $1이니까요.",
            },
          ],
        },
      ],
    },
  },
};
