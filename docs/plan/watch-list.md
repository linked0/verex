# Watch List — 외부 이벤트에 따라 결정할 항목

> Verex 구현 외부에서 발생하는 사건(EIP 채택, 표준 확정, 의존 라이브러리 메이저 릴리스 등)에 따라 트리거되는 설계 결정 사항. 트리거 발생 시 해당 항목을 검토하고, 결정과 후속 작업은 `docs/history/<date>-*.md` 또는 신규 plan 슬라이스에 반영한다.
>
> "지금 결정할 일이 아니지만 외부에서 신호가 오면 반드시 다뤄야 하는 일"을 잊지 않기 위한 인박스.

---

## 1. Glamsterdam — BAL(Block-level Access Lists) 친화 설계

- **트리거**: Ethereum Glamsterdam 하드포크의 EIP scope 확정 발표 — 특히 BAL 계열(EIP-7928 후보) 포함 여부.
- **결정 항목**: BAL이 채택되면, Verex CTF 컨트랙트의 hot path(`fillOrder`, `splitPosition`, `mergePositions`, `redeemPositions`)와 그 호출 시퀀스를 BAL-friendly한 storage 접근 패턴으로 재검토할지 — 그리고 한다면 어느 슬라이스(S6 production-grade infra 즈음?)에서 수행할지.
- **왜 중요**:
  - BAL은 트랜잭션이 건드릴 storage slot을 사전 선언해 검증자가 병렬 실행 가능하게 함. 정확한 access list가 throughput과 inclusion 우선순위에 영향.
  - Verex 한 거래는 CTFExchange + ConditionalTokens + USDC(Polygon 기준) 슬롯을 다수 접근. 슬롯 접근이 동적·분기 의존적일수록 BAL 힌트 정확도 하락.
  - Polymarket의 CTFExchange는 BAL 이전 설계 — 그대로 쓸지, fork해서 storage 평탄화/순서 고정할지 판단 필요.
- **확인할 자료**:
  - EIP-7928 최종 스펙 (또는 Glamsterdam에 포함된 BAL 변형의 최종 EIP 번호)
  - Ethereum All Core Devs Glamsterdam 회의록
  - CTFExchange + ConditionalTokens의 storage layout — fork 여지 평가
- **결정 후 산출물**:
  - `docs/history/<date>-glamsterdam-bal-design.md`에 결정 + 영향 분석 기록
  - 채택 시: `docs/plan/`에 신규 슬라이스 (BAL 친화 리팩토링) 진입
  - 미채택 또는 무시 시: 본 항목을 closed로 표시하고 사유 명시
