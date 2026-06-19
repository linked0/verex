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
  - 채택 시: `docs/features/`에 신규 슬라이스 (BAL 친화 리팩토링) 진입
  - 미채택 또는 무시 시: 본 항목을 closed로 표시하고 사유 명시

---

## 2. Phase 2 컨트랙트 인터페이스 — Native AA(EIP-7702 등) 가정

- **트리거**: Native AA가 메인넷 활성화된 시점 (현재 EIP-7702 후보 — Pectra에서 활성, Glamsterdam 이후 확산 예상). 또는 Polygon/L2 측에서 native AA 동등 기능 활성.
- **현재 가정 (Phase 2 / S2.x)**:
  - `Order.signatureType` 필드는 `EOA = 0`만 지원 (`POLY_PROXY = 1`, `POLY_GNOSIS_SAFE = 2`는 enum에 정의되어 있으나 SDK·MM이 안 씀).
  - 사용자는 EOA → CTFExchange `fillOrder`로 직접 진입. 거래소가 maker EOA에서 USDC를 pull하므로 `approve(exchange, USDC)`가 사전 조건.
  - 별도 smart-account wallet (Polymarket Proxy / Gnosis Safe 변형 등) 가정 없음. 즉 "1 user = 1 EOA" 모델.
- **결정 항목**:
  - Native AA가 들어왔을 때 Verex SDK·CLI·MM이 *기존 EOA path를 그대로 두면서* native AA를 추가로 지원할지 (additive), 아니면 한 시점에 native AA로 *교체*할지 (migration).
  - `Order.signatureType`을 그대로 두고 `NATIVE_AA = 3` 같은 신규 enum 값으로 진입할지, 또는 Polymarket upstream이 자체 enum을 확장하길 기다릴지.
  - `approve` 의존성 — native AA의 sponsored-tx + 일회성 권한 패턴으로 풀 수 있는지, 풀면 UX와 audit 표면이 어떻게 바뀌는지.
  - S7 AA work(plan §1.4 S7 / §2.2.8 EIP-7702 features)과 어떻게 정합 맞출지 — one-click betting / auto-claim / gasless onboarding이 이미 EIP-7702 delegation primitive에 묶여 있음.
- **왜 중요**:
  - Phase 2 SDK·CLI·MM이 EOA path만 가정하고 build됨. native AA가 main path가 되면 hot path API (`signOrder` / `fillOrder`) 전반 재설계 필요할 수 있음.
  - 반대로 Phase 2 인터페이스가 "EOA only가 영구 default"라고 굳어버리면 native AA 활용을 Phase 3 이후로 미루게 됨 — S7 product story (one-click / auto-claim)와 충돌.
  - Polymarket upstream의 `SignatureType` enum이 어디까지 확장될지 모름. 우리가 fork·patch 할지, upstream 결정에 묶일지 사전에 정해야 빠른 대응 가능.
- **확인할 자료**:
  - EIP-7702 최종 스펙 + Pectra 활성 시점
  - Polymarket의 PR/issue 트래커 — native AA 대응 계획
  - 우리 `packages/sdk/src/types.ts` `SignatureType` enum + `packages/sdk/src/orders.ts` `signOrder` 흐름 — additive 진입 시 어디를 건드려야 하는지 (현재 한 곳)
  - `docs/features/01-phase-1-core.md` §2.2.8 EIP-7702 features sub-section + §11.4 B6/B7 액션 항목
- **결정 후 산출물**:
  - `docs/history/<date>-native-aa-phase2-interface.md`에 결정 + 영향 분석 기록
  - 채택 시: `Order.signatureType` enum 확장 + `signOrder` 분기 추가 + SDK 통합 테스트 갱신 (S7 진입 전 prerequisite)
  - 보류 시: 본 항목을 closed로 표시하되 S7 진입 시 재오픈 트리거 등록

---

## 3. Verex Phase 1 컨트랙트 — BundlerProvider 인터페이스 분리 (later phase)

- **트리거**: 내부 — 후속 phase 진입 시점 또는 별도 슬라이스 분리 결정 시. 외부 EIP 의존성 없음.
- **작업 항목**: Verex Phase 1 컨트랙트에 `BundlerProvider` 인터페이스를 분리하는 미니 PR을 검토. 어제 Deep Dive 후속과 연결.
- **왜 별도 트랙**: 큰 리팩토링과 같이 묶지 않고 작은 PR 한 개로 처리. 검토 표면을 좁게 유지하고 회귀 위험 격리.
- **결정·산출물**:
  - 분리 시점에 검토 항목(인터페이스 시그니처 / 의존 컨트랙트 / 테스트 영향)을 본 항목 또는 별도 design note에서 enumerate
  - 적용 시: `docs/history/<date>-bundler-provider-split.md` 기록 + PR link

---

## 4. 싱글톤 settlement vs Factory 패턴 — Storage 충돌·BAL 친화 결정

- **트리거**: 본 watch-list §1 (Glamsterdam BAL) 발화 시점 또는 Phase 2 백본 fork/replace 검토 시점 — 둘 중 먼저 오는 것.
- **결정 항목**: Verex 백본을 Polymarket 류 **싱글톤(monolithic) settlement** 그대로 갈지, **마켓별 독립 컨트랙트 Factory** 패턴으로 갈지. 두 구조의 BAL 친화도 비교는 별도 분석 doc에 정리됨.
- **왜 중요**:
  - 싱글톤은 같은 마켓의 동시 베팅이 sequential 강제 — 한 hot 마켓이 throughput bottleneck
  - Factory는 마켓 간 storage가 정의상 disjoint → BAL에서 충돌 0 → 병렬 100%
  - 단, Factory는 배포 가스, EIP-170 size, upgrade 표면, MEV/매칭 레이어와의 관계가 모두 바뀜 — 단일 축(BAL)만으로 결정할 수 없음
- **확인할 자료**:
  - 본 항목의 핵심 입력 — [`docs/architecture/2026-05-27-singleton-vs-factory-bal.md`](../architecture/2026-05-27-singleton-vs-factory-bal.md) (싱글톤·Factory 비교 + 추가 평가 축 6개 + 트리거 정의)
  - watch-list §1 (Glamsterdam BAL) — 본 항목의 외부 트리거
  - Polymarket CTFExchange의 storage layout (fork·patch 여부 판단)
- **결정·산출물**:
  - 결정 시 `docs/history/<date>-bal-pattern-choice.md`에 결정 + 이유 + 마이그레이션 경로 기록
  - 채택 시: `docs/features/`에 신규 슬라이스 (Factory 재설계) 진입
  - 싱글톤 유지 시: 본 항목 closed, 이유 명시
