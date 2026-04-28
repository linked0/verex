# History

This file records each day's work in KST.

## 2026-04-28 (KST)

### Todo
- [x] Phase 1 시작점으로 Polymarket CTF Exchange를 채택할지 검토
- [x] CTF 통합 시점/조건을 plan 문서에 반영
- [x] 주간 일정 표 가독성 개선

### Achievement
- **CTF Exchange 통합 시점 결정**: Phase 1은 fixed-price 1:1 escrow(parimutuel)로 가고, Polymarket CTF Exchange (https://github.com/Polymarket/ctf-exchange) 통합은 **Phase 2 W6 go/no-go 결정 지점**으로 미룸. 근거: ① CLOB는 maker 없이는 UX가 0이라 MM Agent v0가 paper-trading에서 안정화된 후가 적기, ② Phase 1 가치는 "3주 안에 풀스택 한 바퀴 돌려 어디서 막히는지 보는 것"인데 CTF + maker + USDC + order signing UI 동시 도입은 그 신호를 죽임, ③ CTF는 ERC-20 콜래터럴 전제이므로 W6 USDC 전환과 한 묶음으로 가야 일관됨.
- **`docs/plan/README.md` 갱신**:
  - §1.3 "고급 트레이딩 기능 제외" → "Phase 1~2 초기 제외, Phase 2 W6 통합 결정 지점"으로 완화
  - §1.4 주간 일정에 W6 CTF 결정 마일스톤 추가
  - §4 Phase 2/3에 CTF 통합 흐름 한 줄씩 추가
  - **§11.2 신설** — CTF Exchange 통합 결정 (의도 / 왜 upstream Polymarket / 안 하는 이유 / Go-No-go 기준 / 미해결 질문 / 다음 액션)
  - §1.4 표에서 Week + Phase 컬럼 병합 ("Phase X — Name · Wn" 형식), 산출물/마일스톤 셀을 `<br>` + 불릿으로 쪼개 컬럼 폭 균형 조정
- **`docs/plan/01-phase-1-core.md` 갱신**: "AMM 욕심 금지" → "AMM/CLOB 욕심 금지" + W6 결정 지점 참조, SDK 인터페이스가 미래 CLOB 전환에 어색해지지 않게 두라는 주의 추가, 후속 Phase 요약에 CTF 결정 명시.

### Post Mortem
- **잘된 점**: 처음 "CTF로 시작이 맞나?" 질문에 plan 원칙(단순하게/작게/빠르게) 기준으로 명확히 No 답변 → 사용자가 prior art(nostra-contracts) 카드를 꺼냈고, 그것도 다시 분석해 "재사용은 좋지만 Phase 1 목표와 미스매치"로 정리. 마지막에 사용자의 진짜 목표("Web3 풀스택 한 바퀴")를 확인하고 그 방향으로 plan 정리. 결정 → 문서화 → 시점/조건 명문화 흐름이 깔끔했음.
- **개선점**: 처음 nostra-contracts 분석 때 리포 구조만 훑고 "CTF가 들어오면 MM 봇이 W1로 당겨와야 한다" 같은 결론을 빨리 냈는데, 실제로 nostra가 production-ready인지(최근 12/31 commit이 USDC precision fix였음)는 더 깊이 안 봄. CTF go-decision 시점에는 upstream Polymarket repo의 안정성/감사 여부도 같은 기준으로 확인 필요.

### Next Task
- Phase 1 W1 착수: `packages/contracts`에 `Market.sol` + `MarketFactory.sol` (fixed-price escrow, 수동 resolve) + Foundry 테스트. Day 3까지 `forge test` 통과가 M1.
- Phase 2 진입 전 준비 작업으로 §11.2 "다음 액션" 3개 (Polymarket CTF reading note, SDK 표면 design doc, MM v0 인터페이스에 CTF order signing 가능성 염두) 일정 잡기.
