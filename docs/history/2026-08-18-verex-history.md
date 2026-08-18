# 2026-08-18 — verex 작업 이력

> 소스 문서: 없음 — jay가 rabbit 워크스페이스 인덱스에서 "Rabbit/Verex Feature Designs 상태를 갱신해달라"고 요청한 데서 나온 작업. 갱신 대상은 [docs/tasks/current-plan.md → Roadmap status](../tasks/current-plan.md)와 [docs/features/README.md](../features/README.md). 전날 항목은 [2026-08-17-verex-history.md](2026-08-17-verex-history.md).

### 로드맵 상태 재감사: S9 CI/CD는 이미 존재했고, S6는 과소 기재였다

**Cause:** jay가 Feature Designs 문서의 상태 갱신을 요청. 두 문서 모두 마지막 감사가 2026-08-03이었고 그 사이 2주가 지났다.

**Reasoning:** 전체 재감사는 하지 않고 **표에 명시된 gap 문구를 코드에 대고 하나씩 확인**하는 방식을 택했다 — 문서가 "없다"고 단정한 것만 확인하면 드리프트는 거의 잡히고, 근거 없는 상태 변경을 지어낼 위험이 없기 때문이다(기존 표의 원칙도 "커밋 로그가 아니라 `main`의 코드에 대고 감사"였다). 확인 결과 **두 건이 실제로 어긋나 있었다.**

**S9 — CI/CD ❌ 는 틀렸다.** `.github/workflows/deploy-staging.yml`이 존재하고 마지막 수정이 2026-08-07(`ec3f853`)이다. 문서가 근거로 든 "no `.github/workflows`"가 그 뒤에 해소된 것이다. Stripe는 여전히 없어(`packages/*/src` 전체에 stripe 참조 0건) S9는 partial 유지.

**S6 — ❌ not started 는 과소 기재였다.** 기본 resolve 경로가 여전히 operator 전용인 것은 맞고(`resolve.ts`가 `accountIndex !== 0`을 거부) A5 SPOF도 그대로지만, **UMA 경로가 더는 부재가 아니다** — `resolve.ts`가 `market.oracleType === "UMA"`로 분기해 condition을 소유한 어댑터에 위임하고, `uma-demo.ts`가 propose/dispute/vote/finalize를 런북과 함께 걷게 해준다. 다만 **MOCK 오라클 기준**이라 Sepolia 실오라클 어댑터는 여기서 검증하지 않았고, 그 한계를 표에 그대로 적었다. 확인만 하고 **바꾸지 않은 것**도 남긴다: S5는 여전히 not started가 맞다 — `packages/api/src/worker.ts`는 API→체인 방향의 ChainJob 워커이지 체인→DB 인덱서가 아니다. `packages/mcp-server`도 여전히 없어 S3의 gap은 유효하다.

**Change:** `docs/tasks/current-plan.md`의 Roadmap status 제목에 재감사 날짜를 붙이고 S6·S9 행을 근거와 함께 교체. `docs/features/README.md` 상단 요약 줄을 표와 일치시켰다(`S6 partial*` 추가, `S5–S8` → `S5, S7–S8`, 재감사 날짜 명시). 요약 줄은 원래도 current-plan 표를 authoritative로 지목하고 있어 그 관계는 그대로 두었다.

**Result:** 두 문서가 코드 상태와 일치. 표의 authoritative 관계(features README → current-plan) 유지. 코드 변경 없음. **남은 것:** S6의 Sepolia 실 UMA 어댑터 동작 여부는 미검증이라 표에 그렇게 적어 두었다 — 다음에 확인할 항목.
