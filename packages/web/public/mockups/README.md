# UI Reference Mockups

이 폴더는 **참조용 디자인 캡처** 보관소입니다. Verex가 실제로 이 UI를 베끼지는 않지만, 시점별로 "어느 정도 밀도의 UX를 노릴지" 시각적 north star로 둡니다.

## Phase 2 W6 이후 — `polymarket-reference.png`

[Polymarket](https://polymarket.com) 메인 피드 캡처 (한국어 로컬라이즈, 2026-05-07).

![Polymarket reference UI](./polymarket-reference.png)

이 화면이 가능하려면 다음이 모두 갖춰져야 합니다 — 즉 Phase 2 W6의 [CTF Exchange 통합 결정](../../../../docs/plan/README.md#112-ctf-exchange-통합-신규-phase-2-w6-결정) (§11.2) 이후의 시각적 목표:

- CTF Exchange + Conditional Tokens (ERC-1155) — 양방향 호가
- MM Agent v0+ 가 안정적으로 maker quote 유지 (W6 이후)
- 인덱서 + DB로 거래량 / 가격 시계열 / 다해상도 확률(5월 15일 / 5월 31일 / 6월 30일 / 12월 31일 종료) 집계 (Phase 2 W4~5)
- Multi-resolution 마켓 그룹화 (같은 질문, 다른 종료일)
- 트렌딩 피드, 카테고리 네비게이션, 속보 사이드바

**Phase 1에서 이걸 메인으로 쓰지 않는 이유**: fixed-price escrow + 단일 market UI는 위 데이터의 95%를 채울 수 없음. 빈 차트/호가창만 띄우면 plan의 "단순하게 시작" 원칙이 깨짐.

## 추가 mockup 가이드

- 파일명: `<source>-<context>.png` (예: `polymarket-mobile.png`, `kalshi-event-detail.png`)
- 같은 폴더 README에 한 줄 설명 + 어느 phase의 타겟인지 명시
- 직접 베끼지 말 것 — 패턴 참고용
