# 2026-08-18 — verex 작업 이력

> 소스 문서: 없음 — jay가 rabbit 워크스페이스 인덱스에서 "Rabbit/Verex Feature Designs 상태를 갱신해달라"고 요청한 데서 나온 작업. 갱신 대상은 [docs/tasks/current-plan.md → Roadmap status](../tasks/current-plan.md)와 [docs/features/README.md](../features/README.md). 전날 항목은 [2026-08-17-verex-history.md](2026-08-17-verex-history.md).

### 로드맵 상태 재감사: S9 CI/CD는 이미 존재했고, S6는 과소 기재였다

**Cause:** jay가 Feature Designs 문서의 상태 갱신을 요청. 두 문서 모두 마지막 감사가 2026-08-03이었고 그 사이 2주가 지났다.

**Reasoning:** 전체 재감사는 하지 않고 **표에 명시된 gap 문구를 코드에 대고 하나씩 확인**하는 방식을 택했다 — 문서가 "없다"고 단정한 것만 확인하면 드리프트는 거의 잡히고, 근거 없는 상태 변경을 지어낼 위험이 없기 때문이다(기존 표의 원칙도 "커밋 로그가 아니라 `main`의 코드에 대고 감사"였다). 확인 결과 **두 건이 실제로 어긋나 있었다.**

**S9 — CI/CD ❌ 는 틀렸다.** `.github/workflows/deploy-staging.yml`이 존재하고 마지막 수정이 2026-08-07(`ec3f853`)이다. 문서가 근거로 든 "no `.github/workflows`"가 그 뒤에 해소된 것이다. Stripe는 여전히 없어(`packages/*/src` 전체에 stripe 참조 0건) S9는 partial 유지.

**S6 — ❌ not started 는 과소 기재였다.** 기본 resolve 경로가 여전히 operator 전용인 것은 맞고(`resolve.ts`가 `accountIndex !== 0`을 거부) A5 SPOF도 그대로지만, **UMA 경로가 더는 부재가 아니다** — `resolve.ts`가 `market.oracleType === "UMA"`로 분기해 condition을 소유한 어댑터에 위임하고, `uma-demo.ts`가 propose/dispute/vote/finalize를 런북과 함께 걷게 해준다. 다만 **MOCK 오라클 기준**이라 Sepolia 실오라클 어댑터는 여기서 검증하지 않았고, 그 한계를 표에 그대로 적었다. 확인만 하고 **바꾸지 않은 것**도 남긴다: S5는 여전히 not started가 맞다 — `packages/api/src/worker.ts`는 API→체인 방향의 ChainJob 워커이지 체인→DB 인덱서가 아니다. `packages/mcp-server`도 여전히 없어 S3의 gap은 유효하다.

**Change:** `docs/tasks/current-plan.md`의 Roadmap status 제목에 재감사 날짜를 붙이고 S6·S9 행을 근거와 함께 교체. `docs/features/README.md` 상단 요약 줄을 표와 일치시켰다(`S6 partial*` 추가, `S5–S8` → `S5, S7–S8`, 재감사 날짜 명시). 요약 줄은 원래도 current-plan 표를 authoritative로 지목하고 있어 그 관계는 그대로 두었다.

**Result:** 두 문서가 코드 상태와 일치. 표의 authoritative 관계(features README → current-plan) 유지. 코드 변경 없음. **남은 것:** S6의 Sepolia 실 UMA 어댑터 동작 여부는 미검증이라 표에 그렇게 적어 두었다 — 다음에 확인할 항목.

### §1.4 10-step 일정표에서 "예상 시간" 열 제거

**Cause:** jay가 Feature Designs 문서 §1.4 단계별 일정(10 steps) 표에서 **예상 시간 (AI 포함)** 열을 빼달라고 지시.

**Reasoning:** 열만 지우면 바로 위 문장(*"각 step은 핵심 산출물 + 마일스톤 + 예상 시간 셋을 가진다"*)이 표와 어긋나 문서가 자기모순이 되므로, **표의 열 구성을 직접 서술하는 그 문장까지만 함께 고쳤다**("셋" → "둘", 제거 사실과 날짜 명기). 반면 아래쪽의 **해석 가이드 불릿("예상 시간"의 정의, 상한선 규칙)과 "총 예상 ~25–35일"** 줄은 손대지 않았다 — 이것들은 열 자체가 아니라 **타임박스 정책**에 가까워, 열을 지웠다고 정책까지 폐기하는 것은 별개의 편집 판단이기 때문이다. 지금은 제거된 열을 참조하는 상태로 남아 있으니 jay의 결정이 필요하다.

**Change:** `docs/features/README.md` §1.4 표에서 마지막 열 제거 — 헤더·구분선 포함 12행. 제거된 값은 S1 `~1일 (실제: 1일 ✅)`, S2 `4–6일`, S3 `2–3일`, S4 `1–2일`, S5 `2–3일`, S6 `3–5일`, S7 `3–5일`, S8 `3–5일`, S9 `2–3일`, S10 `2–3일`(이력에 남겨 복원 가능하게 함). 표 본문 셀은 건드리지 않았다.

**Result:** 표가 **핵심 산출물 + 마일스톤** 2열로 정리됨. **남은 것:** 해석 가이드의 `"예상 시간"은 AI 도움을 받는 집중 작업 일수` 불릿, 상한선 규칙 불릿, `총 예상: ~25–35일` 줄이 이제 존재하지 않는 열을 가리킨다 — 함께 지울지 정책으로 남길지 jay 판단 대기.

### 로드맵 10단계 전수 재감사 (앞 항목의 부분 감사를 완결)

**Cause:** jay가 Feature Designs 상태 갱신을 **다시** 요청. 앞서 한 것은 "문서가 없다고 단정한 항목만" 확인한 **부분 감사**였고, 나머지 8개 step은 2026-08-03 상태 그대로 두고 범위만 명시해 둔 상태였다.

**Reasoning:** 범위를 명시하는 것과 실제로 갱신하는 것은 다르다 — 재요청은 **표 전체가 현재 상태여야 한다**는 뜻으로 읽는 것이 맞다. 그래서 남은 8개 step을 전부 코드에 대고 확인했다. 결과는 **전부 기존 표대로 유효**했다: S2는 `packages/contracts/deployments.json` 존재, S3의 두 gap은 그대로(`packages/mcp-server` 없음, ADR 0001 없음), S4는 `packages/api/src/db.ts` 존재, S5는 체인→DB 인덱서 부재 — `worker.ts`는 API→체인 방향의 ChainJob 워커라 **방향이 반대**다 — S7·S8·S10은 코드 자체가 없음(`packages/*/src` 전체에 4337/7702/session-key, CCIP/LayerZero 참조 0건). 즉 드리프트는 앞서 잡은 S6·S9 두 건뿐이었다.

**Change:** `docs/tasks/current-plan.md`의 Roadmap status 제목을 "all 10 steps re-audited 2026-08-18"로 바꾸고, 표 위에 **8개 step을 무엇으로 확인했는지** 근거 문단을 추가. `docs/features/README.md`의 요약 줄도 같은 문구로 맞춤.

**Result:** 10개 step 전부가 코드 확인을 거친 상태. 이제 표에 "확인 안 한 행"이 없다.
