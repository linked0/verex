# 2026-07-06 — verex history

> 관련 문서: [features/account-abstraction.md](../features/account-abstraction.md) ·
> [features/README.md §11.4](../features/README.md) ·
> [analysis/erc-6900-vs-7579-research.md](../analysis/erc-6900-vs-7579-research.md)

### AA: 모듈러 계정 표준 feature spec 추가 (ERC-6900 vs ERC-7579 → 7579 권고)

ERC-6900 vs ERC-7579 비교 리서치를 `docs/analysis/erc-6900-vs-7579-research.md`로 정리하고,
B2의 하위 결정으로 **B8 (모듈러 계정 표준 선택)**을 §11.4와 `features/account-abstraction.md`에
feature spec으로 추가. 방향: 계정은 7579 계열 (Nexus/Kernel v3) — 세션키·지출한도 기성 모듈이
가장 많고 Verex는 권한 그래프가 아닌 "검증 모듈 교체 + 세션키" 수준만 필요; 번들러·페이마스터는
독립 층이라 Alchemy 유지. 락인 층은 승자 표준에, 교체 쉬운 층은 기존 벤더에. (출처: Claude 대화 리서치, 2026-07-06)
