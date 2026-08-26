# 2026-08-25 — verex 작업 이력

> 소스 문서: rabbit 저장소의 `docs/tasks/current-plan.md`(J2 크로스레포 계획)의 W1 재배치 결정이 이 저장소 쪽에 반영된 것. 대상은 [docs/tasks/current-plan.md](../tasks/current-plan.md)의 [W1](../tasks/current-plan.md#w1). 전날 항목은 [2026-08-21-verex-history.md](2026-08-21-verex-history.md).

### W1을 "W6보다 먼저"에서 "첫 스테이징 실행보다 먼저"로 — 그리고 mock이 라이브보다 관대한 네 지점

**Cause:** jay가 로컬 Foundry(anvil) 체인에서 J2 구현을 시작하기로 하면서 물었다 — W1을 지금 해야 하는가, mock UMA로 테스트해도 문제없는가. 두 질문 모두 W1 항목의 서술이 실제보다 강하게 적혀 있음을 드러냈다.

**Reasoning:** 08-21에 적은 "W1은 W6보다 먼저"의 근거는 **fresh seed가 스테이징 거래 행을 지운다**는 것 하나였다. 그 제약이 실제로 말하는 것은 *첫 스테이징 실행 이전*이지 *W6 구현 이전*이 아니다. W6과 J2의 rabbit 쪽 단계 전부가 anvil + `MockOptimisticOracleV2`에서 도는데, 이 mock은 즉시 정산되고 `reset.sh`로 언제든 지울 수 있어 **보호할 스테이징 이력이 애초에 없다**. 게다가 테스트넷 테스트는 끝에 어차피 다시 하므로 일찍 하면 두 번 하는 셈 — jay의 지적이 맞다. 그래서 W1은 J2 phase 6으로 내려갔다.

다만 W1은 이 로드맵에서 **한 번도 동작한 적 없는 유일한 항목**이고, 의존 대상(담보 화이트리스트, final fee, 실제 liveness)이 전부 verex가 쓰지 않은 컨트랙트의 동작이다. 가장 위험한 미지수를 맨 끝에 두면 그 위에 다 쌓은 **뒤에** 알게 된다. 그래서 W1 전체가 아니라 **스모크 프로브 한 번**(스테이징 어댑터에 Sepolia WETH로 `initialize`, 몇 분)만 앞으로 당겼다 — "라이브 오라클이 이 어댑터의 요청을 받아주기는 하는가"만 답하면 나머지는 기다림과 설정이다.

그리고 mock 사용 자체는 정답이다. `MockOptimisticOracleV2`의 docblock이 밝히듯 `UmaCtfAdapter`는 **의도적으로 변경되지 않은 채** mock 주소로 생성될 뿐이라, 로컬에서 밟는 어댑터 경로가 곧 Sepolia 경로다. 문제는 **mock이 더 관대한 네 지점**이 계획서 어디에도 없었다는 것이다. 특히 **MockUSDC는 UMA `AddressWhitelist`에 없다** — 어댑터 docblock에는 적혀 있는데(`@param rewardToken`) 계획서에는 없어서, 로컬에서 통과하고 Sepolia에서 revert 하는 전형적 함정이 되어 있었다.

**Change:** [current-plan.md](../tasks/current-plan.md)의 W1 항목 — 헤더를 `ACTIVE, J2 phase 0` → `J2 phase 6`으로, "왜 W6보다 먼저"를 "왜 첫 스테이징 실행보다 먼저"로 정정하고 로컬은 해당 없음을 명시, 앞당긴 스모크 프로브 문단 추가, **mock 대 라이브 4행 비교표**(담보 화이트리스트 / final fee / liveness / 분쟁) 추가, **"분쟁 없는 경로를 택하라"** 지침 추가 — 실제 분쟁은 UMA DVM의 약 2일 스테이킹 commit/reveal 라운드로 넘어가고 테스트넷이 안정적으로 제공하지 못하므로, mock의 배심이 존재하는 이유가 바로 그 절반이다. **코드 변경 없음.**

**Result:** 문서 diff +28/−6. W1의 done-when과 gate(운영 가스 0.1788 ETH, WETH 0.001 final fee + ~0.01 proposer bond)는 그대로 유지 — 바뀐 것은 **언제 하는가**와 **무엇을 조심하는가**이지 무엇을 증명하는가가 아니다. rabbit 쪽 대응 항목은 그 저장소의 `docs/history/2026-08-25-rabbit-history.md`에 있다. **남은 것:** 스모크 프로브 실행(언제든), 그리고 `reward: 0`이 화이트리스트 요구를 우회하는지 여부는 **미확인**이라 프로브 때 함께 확인할 것.

### W6 구현 확인 + 계획서의 틀린 문장 하나 정정 (2026-08-26 추가)

> 소스 문서: [current-plan.md](../tasks/current-plan.md)의 W6. 소비자 쪽 서술은 rabbit 저장소의 `docs/tasks/current-plan.md`.

**Cause:** rabbit 쪽 Phase 2 UI 를 구현하면서 W6.1–W6.4 가 실제로 외부 소비자에게 쓰였다 — 에이전트가 `@verex/sdk` 로 CTF 주문에 서명하고, 주소 기반으로 자기 지갑을 읽고, V-B 의 faucet 으로 자금을 받는다.

**Reasoning:** 그 과정에서 W6 도입부의 **"외부 주문 수용은 대체로 그 단계를 삭제하는 것"**이 틀렸다는 게 확정됐다. 서명 시점이 둘이다: 대기 지정가 주문은 정말 삭제로 끝나지만, **정산 시점의 taker 다리**는 체결마다 그 체결 수량으로 서명되는데 그 수량은 매칭 이후에야 존재한다. 해법은 컨트랙트에 이미 있었다 — `matchOrders` 가 `takerFillAmount` 를 주문과 별도로 받는다. 체결별 서명은 서버가 키를 쥐어서 가능했던 것이지 거래소가 요구한 게 아니다. 틀린 문장을 지우지 않고 인용문으로 남긴 이유: 왜 틀렸는지가 설계상 유용한 정보다.

부수 관찰 하나 — **V-B 의 주소 지정 faucet 에 예상 못 한 두 번째 소비자가 생겼다.** rabbit 은 그것으로 *소유자의 스마트 계정*을 충전한다(에이전트가 위임을 행사해 거기서 뽑아 간다). 즉 faucet 이 자금을 넣는 주소가 트레이더가 아닌 경우가 흔하다.

**Change:** W6 절에 구현 상태 인용 블록 추가, "삭제하는 것" 문장 아래에 정정 인용문 추가, W6.2 에 두 번째 소비자 주석, W6.5 제목을 "still open"으로.

**Result:** 문서만 변경. W6.5(배치 시점에만 자금 확인)는 여전히 열려 있고 rabbit 쪽 틱이 **주문보다 인출을 먼저** 하도록 만든 근거가 됐다 — 같은 실패 모양을 소비자 쪽에서 피한 것이지 W6.5 를 고친 것이 아니다.
