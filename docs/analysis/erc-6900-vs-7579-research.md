# ERC-6900 vs ERC-7579 Research Note — 모듈러 스마트 계정 표준 선택

> **출처**: Claude 대화 정리, 2026-07-07.
> **연결**: [README §11.4 B8](../features/README.md) (트래킹), [README §2.2.8](../features/README.md) (Account Abstraction), [features/account-abstraction.md](../features/account-abstraction.md) (feature spec).
> **상태**: S7 진입 전 결정 입력. 본 문서는 reference이고 결정/액션은 §11.4 B8에서 추적. B2 (4337/7702/hybrid)의 하위 결정 — 4337 스마트 계정을 쓴다면 어느 모듈 표준의 계정인가.

---

## 한 줄 요약

둘 다 "ERC-4337 스마트계정에 모듈(플러그인)을 꽂는 방법"의 표준인데, 설계 철학이 정반대 방향이다. 표준 전쟁은 미니멀 진영(7579)의 승리로 기울었고, Verex의 요구(검증 모듈 교체 + 세션키)에는 7579 계열 계정 + Alchemy 인프라 조합이 기본값.

## 비교표

| | **ERC-6900** (Alchemy 주도) | **ERC-7579** (Rhinestone·Biconomy·ZeroDev·OKX) |
|---|---|---|
| 철학 | **포괄·규범적** — 안전장치를 표준 안에 다 넣자 | **미니멀** — 상호운용에 필요한 최소만 정하자 |
| 스펙 분량 | 약 3배 김. 모듈별 스토리지 네임스페이스 강제, 검증을 세부 타입으로 분리 | 표면 최소화, 스토리지 등은 구현자 자유 |
| 모듈 모델 | 플러그인 매니페스트(권한·의존성 선언) + 풍부한 라이프사이클 훅(pre/post-execution, runtime validation) — **권한 그래프** 중심 | 4가지 모듈 타입만: **Validator / Executor / Fallback / Hook** — 단순 조합 중심 |
| 대표 구현 | Alchemy **Modular Account v2** | Biconomy **Nexus**, ZeroDev **Kernel v3**, **Safe**(어댑터), Trust Wallet, OpenZeppelin 모듈러 프리셋 |
| 2026 채택 | Alchemy 스택 중심의 소수 진영 | **사실상 신규 프로젝트의 표준** — 월 수천만 UserOp이 7579 계열 계정 경유 |

## 왜 이렇게 갈렸나

6900이 먼저 나와서 "모듈이 계정을 망가뜨리지 못하게" 표준 차원의 안전장치(매니페스트, 스토리지 격리, 세분화된 검증)를 다 넣었는데, 그 무게 때문에 구현 진입장벽이 높았다. 7579는 그에 대한 반작용 — "표준은 인터페이스만, 안전은 구현·감사·레지스트리가" 라는 입장으로 최소화했고, 가벼우니까 Safe·Kernel·Nexus 같은 기존/신규 계정들이 전부 올라탈 수 있었다. 결과는 전형적인 표준 전쟁 패턴: **더 엄격한 쪽이 아니라 더 올라타기 쉬운 쪽이 이긴다.**

## 선택 기준

- "하나의 모듈을 만들어 **여러 계정에서 돌게** 하고 싶다" → 7579 (호환 폭).
- "복잡한 **권한 체계**(누가 무엇을 언제 할 수 있나의 그래프)를 계정 안에 정교하게 짜고 싶다" → 6900 (라이프사이클 훅).
- Alchemy 인프라(번들러·Gas Manager)는 **어느 쪽 계정과도 함께 쓸 수 있다** — 4337 파이프라인(번들러·페이마스터)과 계정 표준은 독립적인 층이라서. 진짜 결정 포인트는 계정 컨트랙트.

## Verex 관점

세션키("이 마켓에서 1시간 소액 베팅은 서명 생략")나 지출 한도 같은 모듈은 7579 생태계에 기성품이 가장 많다. 반면 Verex가 필요로 하는 건 복잡한 권한 그래프가 아니라 "검증 모듈 교체 + 세션키" 수준이라, **계정은 7579 계열(Nexus/Kernel), 인프라는 Alchemy(Rundler+Gas Manager)** 조합이 호환성·비용 양쪽에서 무난한 기본값이다.

**원칙**: 락인이 생기는 층(계정)은 승자 표준에, 갈아끼우기 쉬운 층(번들러·페이마스터)은 이미 쓰는 벤더에.

**연결되는 기존 결정 항목**:
- §11.4 B2 (AA 전략: 4337/7702/hybrid) — B2가 4337 또는 hybrid로 결정되면 본 노트의 7579 권고가 계정 컨트랙트 선택으로 이어짐
- §11.1 미결 1번 (session key 권한 모델) — 7579 Validator 모듈(session key validator 기성품)로 구현 후보
- §11.4 B4/B7 (Paymaster) — 계정 표준과 독립적인 층이므로 본 결정의 영향 없음

## Sources

- [EIP-7579 spec](https://eips.ethereum.org/EIPS/eip-7579)
- [ERC-7579 guide](https://eco.com/support/en/articles/11890018-erc-7579-the-modular-smart-account-standard-explained)
- [erc4337.io — Modular Accounts](https://docs.erc4337.io/smart-accounts/modular-accounts.html)
- [AA Stack 2026](https://eco.com/support/en/articles/15254046-account-abstraction-stack-2026-bundlers-paymasters-factories)
