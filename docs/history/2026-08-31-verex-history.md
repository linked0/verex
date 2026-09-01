# 2026-08-31 — verex 작업 이력

> 소스 문서: rabbit 쪽 J2 / R-A 작업이 원인이다 — 상세는
> [rabbit docs/history/2026-08-31-rabbit-history.md](../../../rabbit/docs/history/2026-08-31-rabbit-history.md).
> 요지: J2 mandate를 MetaMask의 ERC-7715 권한 팝업으로 올리려면 체인이 11155111이어야 하고, mandate가
> 상한을 거는 토큰과 에이전트가 거래하는 토큰이 **같은 체인에 있어야** 한다. 그래서 verex를 Sepolia 포크로
> 옮기는 작업이 필요해졌다. 직전 항목은 [2026-08-25-verex-history.md](2026-08-25-verex-history.md).
> 브랜치: `claude/sepolia-fork-setup`.

### 체인 정체를 저장소 루트 `.env` 한 곳으로 — 그리고 값마다 **출처**를 찍는다

**Cause:** 포크로 옮기려고 `VEREX_RPC_URL`을 바꾸는데, 그 키가 셸·`packages/api/.env`·
`packages/contracts/.env` 세 곳에 있을 수 있고 우선순위는 `seed.ts` 주석에만 적혀 있었다. jay가 "폴더마다
env 파일이 있는 게 불편하다"고 지적했고, 실제로 `VEREX_CHAIN_ID`가 한 파일에만 갱신됐다면 ChainConfig는
31337, RPC는 11155111이 되어 조용히 어긋났을 상황이었다.

**Reasoning:** 비밀값과 공유값을 같은 기준으로 다루면 안 된다. 체인 정체는 **배포 환경의 속성**이라 한 곳에
있어야 하고, `VEREX_OPERATOR_KEY` 같은 개인키는 패키지에 남아야 한다 — 루트로 올리면 모노레포의 모든
프로세스가 읽는다. 그리고 값이 틀렸을 때 진짜 질문은 "무엇이 설정됐나"가 아니라 "**누가** 설정했나"다.

**Change:** `packages/api/src/env.ts` 신설 — 레이어를 순서대로 얹으면서 각 레이어에서 **새로 생긴 키**를
기록하고(`envOrigin`), `logEnv()`가 `이름 · 값 · ← 출처` 표를 찍는다. 비밀값은
`KEY|SECRET|TOKEN|PASSWORD|MNEMONIC|DATABASE_URL|PRIVATE` 패턴으로 `(set, N chars, …last4)`만 보여 준다.
`index.ts`는 `import "dotenv/config"` 대신 이 모듈을 쓰고 부팅 시 표를 찍는다. `seed.ts`도 같은 로더를
쓰고(`loadLayer`) 배포 직전에 표를 찍는다. 루트 `.env`/`.env.example` 추가, `packages/contracts/.env`의
두 키는 주석 처리하고 포인터를 남겼다. 우선순위: **셸 → `<repo>/.env` → `packages/api/.env`**.

**Result:** 체인을 바꾸려면 파일 하나만 고치면 된다. 작성 중 자체 버그도 잡혔다 — 두 번째 레이어를
`packages/api/.env`라고 **표기**하면서 dotenv 기본값(`process.cwd()/.env`)을 쓰고 있었다. 저장소 루트에서
실행하면 루트 파일을 두 번 읽고 `DATABASE_URL`이 비었다. 표에 `(unset)`으로 찍혀 드러났고, 두 레이어 모두
파일 위치 기준으로 고쳤다.

### `reset.sh`가 루트 `.env`를 읽고, 설정을 **현실과 대조**하고, 실패 시 상태를 말한다

**Cause:** `reset.sh`는 bash라 루트 `.env`를 읽지 않았다. 셸에 `VEREX_RPC_URL`이 없으면 8545를 검사하고,
정작 배포는 `seed.ts`가 루트 `.env`를 읽어 8546으로 한다 — "8545를 확인하고 8546에 배포"하는 조용한 거짓.
체인 혼동을 막으려고 넣은 배너가 자신 있게 틀린 답을 낼 뻔했다. jay가 `(unset → default …)` 문구를 보고
"이게 지금 unset이라는 뜻이냐, 메커니즘 설명이냐"고 물어 드러났다.

**Reasoning:** 파일 배치를 아무리 정리해도 **조용한 실패**는 남는다. 이 저장소를 실제로 지켜 온 것은
`chain.ts:157-163`의 "RPC가 보고하는 chainId와 ChainConfig가 다르면 던진다"였고, 그 발상을 스크립트 입구로
옮기는 것이 파일 정리보다 값어치가 크다.

**Change:** `reset.sh`가 dotenv와 같은 규칙으로 루트 `.env`를 얹는다(**이미 설정된 키는 덮어쓰지 않음**).
배너는 조건부 산문 대신 `이름 · 값 · ← 출처`(shell / `<repo>/.env` / built-in default)로 통일했고,
`eth_chainId`를 직접 물어 **노드가 보고하는 값**을 함께 찍는다. `VEREX_CHAIN_ID`와 다르면 배포 전에
종료한다. 그리고 `db:reset` 실패를 잡아 pnpm의 `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` 대신 **지금 어떤
상태인가**를 적는다 — DB는 이미 지워졌고, 실패 전에 올라간 컨트랙트는 고아이며 무해하고, 재실행으로
대체되지 않는 것은 없다.

**Result:** 세 가지 셸 상태(깨끗 / 셸 override / 위험한 불일치)로 확인했다. 불일치 케이스는
"contracts would land on 11155111 while ChainConfig claims 31337"과 함께 배포 전에 멈춘다.

### chainId로 "실 네트워크인가"를 묻던 가드 셋을 loopback 기준으로 좁혔다

**Cause:** 포크로 리셋을 돌리자 가드가 하나씩 걸렸다. ① `DeployMockOracle.s.sol`이
`block.chainid == 31337`이 아니라며 거부(mock oracle is local-only). ② `chain.ts:demoMnemonic()`이
`VEREX_CHAIN_ID != 31337`이므로 `VEREX_DEMO_MNEMONIC`을 요구. 둘 다 **막으려는 상황이 아닌데** 걸렸다.

**Reasoning:** 세 가드가 모두 같은 질문을 하고 있었다 — "여기가 실 네트워크인가?" 그리고 셋 다 chainId로
답하고 있었다. 포크는 남의 chainId를 그대로 보고하는 것이 **존재 이유**(지갑과 표준 주소를 쓰기 위해)라
그 대용이 깨진다. 그러나 가드가 진짜로 지키려는 것은 체인 이름이 아니라 **적대자가 존재하는가**이고, 그 답은
RPC 주소에 있다: 127.0.0.1 뒤에 있는 것은 무엇을 주장하든 이 컴퓨터다. 파싱 실패는 remote로 본다 —
애매하면 닫는 쪽.

또 하나: `VEREX_DEMO_MNEMONIC`을 로컬에서 **설정하면 안 된다**는 것도 확인했다. `[2b]`는 데모 지갑이
**자기 트랜잭션을 보낸다**(approve/setApprovalForAll). 가스를 가진 주소는 anvil 니모닉에서 나온 것들이라,
사설 니모닉을 넣으면 잔고 0인 다섯 주소가 생기고 전부 실패한다. 운영에서는 파일이 아니라 Secret Manager가
공급한다(`deploy.sh:110-112`).

**Change:** `chain.ts`에 `isLoopbackRpc()` / `IS_LOCAL_NODE` 추가(한 곳에 정의하고 seed가 import).
`demoMnemonic()`은 loopback이면 **경고 한 줄을 찍고** anvil 니모닉을 쓰고, remote면 기존대로 던진다.
`seed.ts`는 loopback일 때만 forge에 `ALLOW_REAL_CHAIN=1`을 넘기고, 넘긴다는 사실을 출력한다 — jay의
지적("안전하면 경고로 바꾸는 게 낫지 않나")대로 조용한 우회를 없앴다. remote RPC에서는 세 가드 모두 그대로
발화한다.

**Result:** 가드가 비활성화된 것이 아니라 **좁아졌다**. `local ⟺ chainId == 31337` 이 `local ⟺ RPC가
loopback`으로 바뀌었고, 후자가 엄밀히 더 정확하다 — 평범한 anvil에서도, 포크에서도 참이고, 원격에서는 거짓.

### `splitPosition`이 이유 없이 revert한 진짜 원인: 포크가 물려받은 EIP-7702 코드

**Cause:** 가드 둘을 넘기자 `[4]`에서 `splitPosition`이 revert했다. 잔고(252,000 mUSDC)도 CTF allowance
(152,000)도 충분했고 condition도 준비돼 있었다(`getOutcomeSlotCount = 2`). 에러는 "reverted" 한 줄뿐이었다.

**Reasoning:** 먼저 에러를 넓혔다 — `seed.ts`의 catch가 viem의 `shortMessage`만 찍고 `metaMessages`와
cause 사슬을 버리고 있었다. 그것을 살리자 인자가 드러났고, `cast call --trace`로 실행 흐름을 보니
`transferFrom` 성공 → `TransferBatch` 발행 → **`operator::onERC1155BatchReceived` revert**였다.
ERC-1155는 수취인에 **코드가 있을 때만** 그 훅을 부른다. anvil 계정 #0은 공개 니모닉에서 나오고 실 Sepolia
에서 약 48,000번 쓰인 주소라, 누군가 7702로 스마트 계정 구현체를 붙여 놓았다 — 포크가 그것을 그대로
물려받았다(`cast code` = `0xef0100ff0bdcd0…`). 데모 지갑 #1–5도 전부 마찬가지였다(구현체 두 종류).

**Change:** `seed.ts`가 loopback + non-anvil chainId일 때 operator와 데모 지갑 #1–5의 코드를
`anvil_setCode … 0x`로 벗기고, 벗긴 주소를 출력한다. 평범한 anvil에서는 벗길 것이 없어 아무것도 찍지 않고,
원격에서는 아예 실행되지 않는다. `seed.ts`의 에러 출력은 `metaMessages` + cause 사슬(깊이 5) + 스택까지
찍도록 유지한다.

**Result:** 원인이 확정됐다. `to.code.length > 0`은 "컨트랙트인가"의 완벽한 대용이었지만 **EIP-7702가 그
전제를 깼다** — 오늘 chainId 대용이 포크에 깨진 것과 같은 모양의, 네 번째 사례다. 포크를 재시작해도 코드가
다시 붙으므로 시드가 매번 스스로 처리한다.

### 남아 있는 것

- **`reset.sh` 완주 확인됨.** 세 번의 실패(mock oracle / mnemonic / splitPosition)를 고친 뒤 끝까지 돌았고,
  API가 포크를 보고 있다:
  `{"chainId":11155111,"usdc":"0xdE8afA2C…","ctf":"0xeF89D713…","exchange":"0x52E2d30c…","tradingEnabled":true}`.
  **다만 거래를 한 건도 태워 보지는 않았다** — 백본이 올라갔다는 것과 tick이 돈다는 것은 다른 주장이다.
- **`.env.prod` / `.env.staging`은 손대지 않았다.** 배포 runbook이 그 파일들을 명시적으로 source하고 루트
  경로를 타지 않는다. 같은 정리를 하려면 별도 작업이다.
