# 2026-08-21 — verex 작업 이력

> 소스 문서: 없음 — jay가 스크린샷 [`docs/images/kalshi/kalshi-100percent.png`](../images/kalshi/kalshi-100percent.png) 한 장을 근거로 "각 outcome YES 확률의 합이 100%가 아니어도 되는 개념"을 feature 문서에 추가해달라고 요청한 데서 나온 설계 작업. 갱신 대상은 [docs/features/README.md](../features/README.md) 및 신규 [docs/features/market-groups.md](../features/market-groups.md). 전날 항목은 [2026-08-18-verex-history.md](2026-08-18-verex-history.md).

### 확률 합 100%는 "event 안 마켓들의 관계"에 달려 있다 — market group 타입을 1급 필드로

**Cause:** jay가 Kalshi *"Will the Clarity Act become law?"* 스크린샷(Before Jul 1 2027 41% / Oct 1 2027 46% / Jan 1 2028 50% = **137%**)을 보고 "합이 100%가 아니어도 되는 것 같은데 뭐가 맞는지 모르겠다, 월드컵은 어떻게 처리하나"라고 질문. 코드가 아니라 `docs/` 설계 문서만 손대는 조건.

**Reasoning:** 스크린샷의 세 마켓은 **경쟁 outcome이 아니라 중첩된 날짜 임계값**(before Jul ⊂ before Oct ⊂ before Jan)이다. 셋이 동시에 YES가 될 수 있으므로 합을 100%로 묶는 제약 자체가 없고, 실제로 성립하는 불변식은 **단조성(41 ≤ 46 ≤ 50)**이다. 즉 "한 event 아래 있으면 확률이 100%를 분할한다"는 가정이 틀렸고, 이는 **그룹 타입별로 다른 문제**다. Kalshi도 이를 두 종류로 선언한다 — **mutually exclusive group**(월드컵 우승 등)과 **directional group**(중첩; TSA 1M+/2M+/3M+) — 그리고 그룹 구조를 담보 netting(`netting_enabled`, collateral return)에 그대로 활용한다. 월드컵 우승은 배타적 그룹 + **"Other" 버킷**으로 exhaustive를 만들지만, 호가로 합을 내면 **105–112%**가 나온다 — 이건 확률 주장이 아니라 **스프레드·수수료**다. 기존 [negative-risk-markets.md](../features/negative-risk-markets.md)는 배타적 그룹 **한 종류만** 다루고 있어, 이를 확장하기보다 **상위 분류 문서를 새로 만들고 서로 링크**하는 쪽을 택했다(neg risk 문서의 범위를 흐리지 않기 위해).

**Change:** 신규 [`docs/features/market-groups.md`](../features/market-groups.md) 작성 — (1) 스크린샷을 근거 이미지로 삽입한 문제 제기, (2) 5종 그룹 분류표(binary / exclusive+exhaustive / exclusive 비exhaustive / directional 중첩 / independent 다중승자)와 각각의 Σ YES 성질, (3) Kalshi의 실제 처리(두 그룹 종류 + collateral return 수치 예시 + 월드컵 "Other" 버킷 + over-round 105–112%), (4) "무엇이 진짜 확률인가"에 대한 답 — 표시값은 스프레드 한쪽의 값일 뿐이고 강제되는 건 `Σ bid ≤ 1 ≤ Σ ask` **밴드**뿐, (5) neg-risk 변환식(`k`개 NO → 나머지 YES + (k−1) USDC)으로 배타적 그룹의 Σ=1이 **차익거래로 강제되는 사실**임을 양방향으로 증명, (6) Verex 설계안 — `group_type` enum + 타입별 불변식/UI/MM-agent/API 규칙, (7) open questions·Features 체크박스·Resources. [`README.md`](../features/README.md) Categories 표에 카테고리 행 1줄 추가, [`negative-risk-markets.md`](../features/negative-risk-markets.md) 상단에 범위 주석(neg risk는 배타적 그룹 전용) + 상호 링크 추가. **코드 변경 없음.**

**Result:** "합이 100%인가"가 그룹 타입에 종속된 질문임이 문서화됐고, 특히 **directional 그룹에 정규화를 적용하면 안 된다**는 규칙이 명시됐다(41/137 = 30%라는 없는 숫자가 만들어짐). **남은 결정(jay):** ① Σ=1을 온체인(neg-risk)으로 강제할지 표시만 할지, ② directional을 N개 바이너리 + 오프체인 불변식으로 갈지 scalar/range 마켓 한 개로 갈지, ③ `exclusive` event에 "Other" 버킷을 필수로 할지(augmented neg risk와 직결), ④ MM agent에 그룹 인지 quoting 모드를 줄지.

### docs 이미지를 루트 `docs/images/` 한 곳으로 통합 (주제별 하위 폴더)

**Cause:** jay가 "docs 하위 폴더마다 `images/`를 두는 게 나은가, `docs/images/` 하나로 두는 게 나은가"를 물었고, 권고안을 verex·rabbit·nostra-server 세 저장소에 모두 적용하라고 지시. 코드 무관 작업이라 커밋·머지까지 위임받음. 이미지 링크가 깨져도 중요하지 않다는 단서가 있었으나 전부 갱신함.

**Reasoning:** verex는 이미 `docs/images/`와 `docs/tasks/images/`로 **쪼개져 있었다**. 루트 한 곳을 택한 근거 세 가지 — ① **폴더를 넘나드는 재사용이 이미 발생**: Kalshi 스크린샷은 `tasks/images/`에 있는데 이를 논하는 [market-groups.md](../features/market-groups.md)는 `features/`에 있어, 폴더별 방식이면 파일을 복사하거나(사본 드리프트) `../tasks/images/...`를 쓰거나(지역성 포기) 둘 중 하나로 몰린다. ② **문서가 폴더 사이를 이동한다**(task → feature, task → archive): 이동할 때마다 상대 경로가 깨지지만, 루트 방식이면 1단계 하위 폴더 어디서든 `../images/`로 깊이가 일정하다. ③ **고아 파일 탐지**가 `ls` 한 번으로 끝난다. 평평한 폴더가 잡동사니가 되는 문제는 주제별 하위 폴더로 상쇄. 단, **통째로 아카이브되는 폴더는 예외**로 유지(자기완결성이 링크 편의보다 우선).

**Change:** 이미지 6장을 `docs/tasks/images/` + `docs/images/` → `docs/images/{kalshi,polymarket,verex-ui}/`로 이동(`git mv`). 참조 갱신 11건 — `![...]()` 이미지 문법뿐 아니라 **일반 링크와 인라인 코드로 적힌 경로까지** 포함(`jun-19-verex-design.md`의 본문 링크, `jul-28-plan.md`의 헤더 인용, `market-groups.md` Resources 줄, 전날 history 항목의 소스 링크). 링크 텍스트는 저장소 기준 경로(`docs/images/...`)로, href는 상대 경로로 분리 표기. 빈 `docs/tasks/images/` 제거. **코드 변경 없음.**

**Result:** 저장소 내 마크다운의 이미지 링크 11개 전부 실제 파일로 해석됨(스크립트 검증, MISS 0). `docs/features/README.md`가 참조하는 `packages/web/public/mockups/polymarket-reference.png`는 docs 밖 자산이라 대상에서 제외. 같은 규칙을 rabbit·nostra-server에도 적용(각 저장소 history 참조).
