// verex — env 로딩 순서를 한 곳에 모으고, **어느 파일에서 왔는지**까지 남긴다
// (jay, 2026-08-31).
//
// **왜 이 파일이 있나.** 체인 정체(`VEREX_RPC_URL`, `VEREX_CHAIN_ID`)는 패키지의
// 속성이 아니라 **배포 환경의 속성**이다 — API 와 시드와 forge 스크립트가 같은 값을
// 봐야 하고, 어긋나면 "상한은 A 체인의 토큰을 지키는데 거래는 B 체인에서 일어난다"
// 같은 조용한 거짓이 만들어진다. 그래서 저장소 루트의 `.env` 를 **먼저** 읽는다.
//
// **왜 출처까지 기록하나.** 값이 틀렸을 때 진짜 질문은 "무엇이 설정됐나"가 아니라
// "**누가** 설정했나"다. 셸에 남은 Sepolia 세션 하나가 로컬 리셋을 실 네트워크로
// 보내는 사고가 이 저장소의 runbook 0 번 경고다. 레이어마다 새로 생긴 키를 기록해
// 두면 `logEnv()` 가 그 답을 한 줄로 보여 준다.
//
// **우선순위(위가 이긴다).** dotenv 는 이미 설정된 키를 덮어쓰지 않는다:
//
//   1. shell             — `VEREX_RPC_URL=… pnpm dev` 같은 일회성 override
//   2. <repo>/.env       — 패키지들이 공유하는 체인 정체. **여기를 고친다**
//   3. packages/api/.env — 이 패키지 전용(DATABASE_URL 등)
//
// `packages/contracts/.env` 는 여기서 읽지 않는다 — 시드만 배포 주소를 주우려고 따로 한 겹
// 더 얹는다. VEREX_OPERATOR_KEY 는 2026-09-01 부터 루트 `.env` 에 있다(jay: 파일이 갈라져
// 있는 게 더 불편했다). 그래서 API 도 그 키로 서명한다 — 테스트넷 키만 둔다.
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

/// `src/`(tsx) 에서도 `dist/`(빌드) 에서도 저장소 루트를 가리킨다.
export const REPO_ROOT = resolve(__dirname, "../../..");

/// 키 → 그 값을 처음 넣은 레이어. 프로세스 시작 시 이미 있던 것은 "shell".
export const envOrigin: Record<string, string> = {};
for (const k of Object.keys(process.env)) envOrigin[k] = "shell";

/// 한 겹 얹고, 그 겹에서 **새로** 생긴 키만 기록한다. dotenv 가 덮어쓰지 않으므로
/// "새로 생겼다"가 곧 "이 레이어가 이겼다"와 같다.
export function loadLayer(label: string, path?: string) {
  loadEnv(path ? { path } : undefined);
  for (const k of Object.keys(process.env)) if (!envOrigin[k]) envOrigin[k] = label;
}

/// 값을 그대로 찍으면 안 되는 키. 비밀값은 **설정 여부와 길이**만 보여 준다 —
/// 그것만으로도 "안 넣었다 / 잘못 붙여넣어 잘렸다"는 거의 다 잡힌다.
const SECRET = /KEY|SECRET|TOKEN|PASSWORD|MNEMONIC|DATABASE_URL|PRIVATE/i;

function show(k: string): string {
  const v = process.env[k];
  if (v === undefined || v === "") return "(unset)";
  if (SECRET.test(k)) return `(set, ${v.length} chars, …${v.slice(-4)})`;
  return v;
}

/// 부팅 시 한 번 찍는 표. **무엇이** 설정됐는지가 아니라 **어디서** 왔는지가 요점이다.
export function logEnv(title: string, keys: string[]) {
  const w = Math.max(...keys.map((k) => k.length));
  console.log(`\n▶ ${title}  (root: ${REPO_ROOT})`);
  for (const k of keys) {
    console.log(`   ${k.padEnd(w)}  ${show(k).padEnd(46)} ← ${envOrigin[k] ?? "(unset)"}`);
  }
  console.log("");
}

loadLayer("<repo>/.env", resolve(REPO_ROOT, ".env"));
// CWD 가 아니라 **파일 위치**로 찾는다. dotenv 의 기본값은 `process.cwd()/.env` 라,
// 저장소 루트에서 실행하면 루트 .env 를 두 번 읽고 이 파일은 영영 안 읽는다 —
// DATABASE_URL 이 조용히 비는 그 버그다. 경로를 박아 두면 어디서 실행하든 같다.
loadLayer("packages/api/.env", resolve(__dirname, "..", ".env"));
