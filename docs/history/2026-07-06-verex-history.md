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

### Task 1 대개편: shadcn UI + 실컨트랙트 거래 (jun-19 design Task 1 + "real contract" 지시)

jay 지시 "완결된 기능의 working version": (1) **shadcn/Tailwind UI 전면 재구축** — Kalshi 레퍼런스
레이아웃(카테고리 탭, featured 차트 카드, 마켓 그리드, hot 사이드바, 상세 페이지 + 트레이드 패널),
Verex 고유 identity(indigo primary, emerald/rose Yes/No). (2) **DB-only → 실 CTF 컨트랙트**: 시드가
anvil에 backbone 배포 + 마켓별 prepareCondition/registerToken/유동성 split, 주소는 DB(ChainConfig)에
저장. (3) **실거래**: Buy/Sell마다 진짜 CTFExchange.fillOrder tx — 유저(데모 anvil 계정, 키는 서버)가
maker 서명, operator(계정 0)가 인벤토리로 체결. 선형 가격 임팩트(L=2000 USDC) + Trade/PricePoint
미러. 검증: UI에서 $10 BUY → tx receipt status 1 확인 (block 51). MetaMask/wagmi 실지갑 경로는 S7 AA
트랙으로 유보. Source: [jun-19-verex-design.md](../tasks/jun-19-verex-design.md) Task 1 + 채팅 지시.

### Task 2 준비: GCP 셋업 요약 + 클라우드 체인 결정 항목 신설

design 파일에 Task 2 addendum 추가 — jay가 할 일(체인 옵션 결정, GCP 프로젝트/빌링, DNS 레코드,
testnet ETH, OAuth URI, 비용 승인) vs Claude가 할 일(Cloud SQL, verex-api/web 2개 Cloud Run 서비스,
deploy.sh, 도메인 매핑, testnet 배포) 분리. **신규 blocker**: 실컨트랙트 도입으로 클라우드의 체인
위치 결정 필요 — (a) Base Sepolia testnet(권장) / (b) hosted anvil / (c) DB-only fallback.
Source: [jun-19-verex-design.md](../tasks/jun-19-verex-design.md) Task 2 addendum.

### Staging 배포 준비 완료 — deploy.sh 갱신 + DB-only 모드 + /backend 프록시 (jay 실행 예정)

기존 v1 deploy.sh를 현 구현에 맞게 확장: (1) **API 이미지** — api가 workspace 패키지 @verex/sdk에
의존하게 되어 `--source packages/api` 불가 → repo-root 컨텍스트 빌드(`packages/api/Dockerfile.cloud`
+ `cloudbuild-api.yaml` + Artifact Registry), sync-abis 선행, root `.dockerignore`/`.gcloudignore`
추가 (gcloud는 .gitignore를 상속해 generated abis가 누락되는 함정 회피). (2) **DB-only 시드** —
클라우드엔 체인이 없으므로 `SEED_DB_ONLY=1`: 의사(pseudo) 식별자 + ChainConfig.chainId=0, API는
chainId 0이면 거래/faucet 비활성 (마켓 브라우징은 정상). 스크래치 DB로 검증. (3) **/backend
프록시** — 브라우저 API 호출을 NEXT_PUBLIC_ 빌드타임 URL 대신 next.config.js rewrite(런타임
API_URL)로 전환, 같은 이미지가 모든 환경에서 동작. localhost:3000/backend 경유 실거래로 검증.
(4) deploy.env를 staging 값으로 설정 (verex-499205, *-staging 서비스, verex_staging DB,
staging.verex.jaylabs.xyz). 시크릿 이름 per-DB로 분리 (staging/prod 충돌 방지). 실행은 jay가
`./scripts/deploy.sh` → `./scripts/setup-dns.sh`로 직접. Source: 채팅 지시 ("staging 배포 스크립트, 내가 실행").

### Task 2: jaylabs.xyz DNS는 외부 등록기관이 아니라 Cloud DNS — jay의 DNS 작업 거의 소멸

`dig ns jaylabs.xyz` → `ns-cloud-e*.googledomains.com` 확인. DNS 존이 GCP Cloud DNS에 있으므로
`verex` CNAME 추가를 `gcloud dns`로 Claude가 자동화 가능. jay에게 남는 것은 Cloud Run 도메인
매핑이 소유권 검증을 요구할 때 Search Console에서 Verify 클릭뿐. design 파일 Task 2 갱신.
Source: 채팅 질문 중 dig로 확인 (별도 spec 문서 없음).

### scripts/setup-dns.sh 작성 — jay가 직접 실행하는 도메인 매핑 + Cloud DNS 등록 스크립트

rabbit deploy.sh 컨벤션(bash, set -euo pipefail, idempotent, 한국어 주석)으로 작성. 흐름: Cloud Run
서비스 존재 확인 → 도메인 매핑 생성(소유권 미검증 시 Search Console 안내 출력) → 매핑이 요구하는
레코드 조회 → Cloud DNS 존 탐색 → 레코드 upsert. jay의 gcloud 인증으로 실행하므로 자격증명 공유
불필요. 전제: verex-web 서비스가 먼저 배포돼 있어야 함 (Task 2 deploy.sh 이후 실행).
Source: [jun-19-verex-design.md](../tasks/jun-19-verex-design.md) Task 2 addendum.

### DeployCTF.s.sol: 배포 후 CLI용 export 명령 로그 추가

배포 끝에 `export USDC_ADDR=... CTF_ADDR=... EXCHANGE_ADDR=...` 한 줄을 복사-붙여넣기 가능한
형태로 출력하게 함 — packages/cli가 이 env 3개를 읽으므로 수동 복사 단계 제거. anvil dry-run으로
출력 확인. CLI에 dotenv/.env 추가는 과설계로 보고 보류 (demo.ts가 self-deploy하고 anvil 주소는
결정적이라 필요 없음; testnet 진입 시 broadcast JSON 읽기로 재검토). Source: 채팅 요청 (별도 spec 문서 없음).

### README: quickstart의 stale deploy 명령 수정 (Deploy.s.sol → DeployCTF.s.sol)

루트 README quickstart가 v1 학습 패스 스크립트(`Deploy.s.sol`, S1 parimutuel MarketFactory)를
가리키고 있었음 — jay가 그대로 실행해서 export 로그가 안 보인 근본 원인. S2 백본을 배포하는
`DeployCTF.s.sol`로 교체하고 v1 스크립트는 사용하지 말라는 주석 추가. Source: 채팅에서 발견된 stale doc (별도 spec 문서 없음).

### 환경: esbuild darwin-x64/arm64 불일치로 API dev 서버 기동 실패 → pnpm install --force로 해소

`pnpm --filter @verex/api dev`가 esbuild TransformError로 실패 — node_modules에
`@esbuild/darwin-x64`만 있었음 (과거 Rosetta/x64 node로 install한 잔재; 현재 node는 nvm arm64
v24.18.0). `pnpm install --force`로 재설치 후 darwin-arm64 바이너리 확보, API 기동 + `/health` OK
확인. 재발 시 같은 처방. Source: 채팅 트러블슈팅 (별도 spec 문서 없음).

### Task 1 (Web UI): UI 스택 = shadcn/ui + Tailwind 결정 + 디자인 유사성 법적 리스크 정리

`packages/web`이 bare Next.js(스타일 시스템 없음)라 UI가 어색한 상태 — 2026 컴포넌트 라이브러리
리서치 후 shadcn/ui + Tailwind로 제안 (copy-in 소유권 → 자체 identity 분기 용이, jay 기존 경험).
이전 회사에서 shadcn으로 Polymarket류 UI를 만든 이력 관련 리스크는 "레이아웃 유사"가 아니라
"코드/에셋 재사용 + 고용계약 조항"이 실제 노출점 — clean-room 재구축, identity 차별화, provenance
기록, 계약서 확인 체크리스트로 정리. Source: [jun-19-verex-design.md Task 1 addendum](../tasks/jun-19-verex-design.md).
