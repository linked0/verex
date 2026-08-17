# 2026-08-17 — verex 작업 이력

> 소스 문서: 없음 — jay와의 대화(Datadog 에이전트가 실제로 수집하는 것, OpenTelemetry의 실체)에서 직접 나온 작업. 결과물은 [docs/features/observability.md](../features/observability.md).

### 피처 문서 신설: Observability — OTel 우선 계측, 백엔드는 교체 가능하게

**Cause:** Datadog 설명 중 jay가 "에이전트는 어떤 데이터를 수집하느냐, 기존 서버가 출력하는 덤프를 수집하는 것이냐"를 물었고, 이어 OpenTelemetry의 실체를 물은 뒤 "나중에 할 만하다"며 feature 항목으로 추가를 지시.

**Reasoning:** 대화에서 나온 핵심 정정이 그대로 문서의 논지가 됐다 — **에이전트가 공짜로 주는 것은 "느리다"까지이고 "어느 단계가 느린가"는 프로세스 안에서 도는 라이브러리만 답할 수 있다.** 즉 계측은 인프라 결정이 아니라 코드 결정이고, 그래서 벤더 SDK를 고르는 순간 호출부 수만큼의 전환비용이 생긴다. OTel을 택한 근거는 "더 좋아서"가 아니라 **비용이 0이어서**다 — Datadog이 OTLP를 네이티브로 받고 GCP Cloud Trace도 받으므로, 어느 제품도 포기하지 않으면서 비상구만 하나 더 다는 셈이다. 단점(자동 계측 깊이는 벤더 SDK가 아직 낫고, logs 시그널이 셋 중 가장 덜 성숙하며, Collector는 부품 하나 추가)도 숨기지 않고 §2에 적었다. 접점 우선순위는 "메트릭으로 답이 안 나오는 곳"을 기준으로 정렬 — **ChainJob 워커가 1순위**이고(enqueue → build → submit → confirm이 한 트레이스여야 함), api → indexer는 같이 해야 한다(트레이스 컨텍스트가 경계에서 끊기면 그림이 깨짐). mm-agent는 워커 경로 검증 후, web-ui RUM은 실사용자 이후로 미뤘다.

**Change:** `docs/features/observability.md` 신규 작성(기존 `thirdweb.md` 구조를 따름 — One-liner → Verex touchpoints 표 → Features 체크박스, 결정 필요 항목은 `(you)` 표기). `docs/features/README.md`의 Categories 표에 `Observability | S4-adjacent (exploratory)` 행 추가. **§4에 상시 규칙을 못박았다**: 메트릭에 무한한 값을 태그로 달지 말 것 — verex에서 가장 달고 싶어지는 `market_id`·`user_id`·`tx_hash`·`order_id`가 정확히 가장 위험한 것들이고, 태그 조합마다 별개 커스텀 메트릭으로 과금되므로 코드 한 줄이 청구서를 터뜨린다. 이것들은 고카디널리티가 목적인 span·로그에 넣는다. 결정 항목 둘(`(you)`)은 지금의 내보낼 곳(Cloud Trace vs Datadog)과 SDK 직접 export vs Collector 운영이며, 둘 다 OTel의 요점이 가역성이므로 싼 쪽을 고르고 넘어가라고 문서에 명시.

**Result:** README와 신규 문서의 로컬 링크 전수 확인 — 깨진 것 0건. 구현 코드 변경은 없으며 설계 문서만 추가된 상태. 다음 행동은 `(you)` 항목 둘에 대한 jay의 결정.
