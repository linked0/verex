# 2026-08-12 — verex 작업 이력

> 소스 문서: 없음 — jay와의 대화(Cloud Run 스케일링 상한 논의)에서 직접 나온 작업.

### Cloud Run max-instances 고정 (api=1, web=2) — 라이브 + deploy.sh

- **Cause:** rabbit 쿼터 논의 중 jay가 verex의 max-instances를 물었고, 확인해 보니
  네 서비스 모두 gcloud 기본값(max 20)으로 돌고 있었다 — 데모 사이트엔 과함.
- **Reasoning:** api는 인스턴스마다 ChainJob 워처가 하나씩 돌아서 2개 이상이면 같은
  체인 이벤트를 중복 처리한다 — max 1은 비용 절감을 넘어 정합성 문제. web은 무상태라
  2로(하나가 재시작/배포 중일 때 여유분; 유휴 시 어차피 0으로 스케일다운).
- **Change:** 라이브 4개 서비스(`verex-api`/`-prod`=1, `verex-web`/`-prod`=2)에
  `gcloud run services update --max-instances` 적용 + `scripts/deploy.sh`의 api/web
  배포 커맨드에 플래그 추가(재배포에도 유지; deploy-prod.sh는 deploy.sh 래퍼라 자동 적용).
- **Result:** 네 서비스 리비전 maxScale 1/1/2/2 확인. staging-up.sh의
  `--min-instances 1`(워처 상시 가동)은 그대로 — min 1 / max 1로 공존.

### packages/web: .env.local → .env 통일

- **Cause:** jay — 로컬 머신에서 .env / .env.local 두 파일 체제가 헷갈려 .env 하나로 통일 결정
  (rabbit 과 동시 진행).
- **Reasoning:** web 의 `.env.local` 은 빈 플레이스홀더(AUTH_*)뿐이라 병합 비용 제로.
  루트 `.gitignore` 가 `.env`/`.env.*` 를 전부 차단하고 `!.env.example` 만 커밋 허용 — rename 후에도 안전.
- **Change:** `packages/web/.env.local` 내용을 `packages/web/.env` 로 병합 후 삭제,
  `scripts/dev-local.sh` 의 자동 생성 대상도 `.env` 로, `.env.example` 헤더 문구 수정.
- **Result:** `git check-ignore` 확인 완료, `env.local` 참조 잔존 0건 (벤더 lib·역사 문서 제외).
