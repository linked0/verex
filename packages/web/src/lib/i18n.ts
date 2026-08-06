// Minimal i18n — a flat dictionary and a lookup function, no library.
//
// The locale lives in a **cookie**, not just localStorage, because half this app
// renders on the server (the home page, market pages and the docs shell are all
// server components). A cookie is the only store both sides can read, so the
// server can render Korean on the first paint instead of flashing English.
// LocaleProvider mirrors it into localStorage as well, purely so a cookie wipe
// doesn't lose the preference.

export type Locale = "en" | "ko";

export const LOCALES: Locale[] = ["en", "ko"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "verex-locale";

export const LOCALE_LABEL: Record<Locale, string> = { en: "EN", ko: "한국어" };

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "ko";
}

// Keys are dotted by surface (nav.*, home.*, docs.*) so a missing one is easy to
// place. Values may contain {name}-style placeholders — see `t()`.
const en = {
  "nav.search": "Search markets",
  "nav.docs": "Docs",
  "nav.create": "Create",
  "nav.portfolio": "Portfolio",
  "nav.faucet": "Faucet",
  "nav.faucetMinting": "Minting…",
  "nav.faucetTitle": "Mint 1,000 test USDC to the active demo wallet",
  "nav.demoWallet": "Demo Wallet {n}",
  "nav.operatorWallet": "Operator Wallet",
  "nav.walletLabel": "Demo wallet",
  "nav.admin": "admin",
  "nav.theme": "Toggle light / dark theme",
  "nav.themeToLight": "Switch to light theme",
  "nav.themeToDark": "Switch to dark theme",
  "nav.language": "Change language",

  "welcome.title": "Welcome to Verex",
  "welcome.bodyPre": "This is a live demo — ",
  "welcome.bodyTrade": "trade freely with the Demo Wallets",
  "welcome.bodyAnd": " and ",
  "welcome.bodyResolve": "resolve markets with the Operator Wallet",
  "welcome.bodyPost":
    " (wallet selector, top right). Test USDC comes from the faucet; no real funds are involved.",
  "welcome.cta": "Got it — start trading",

  "footer.poweredBy": "powered by JayLabs",

  "home.featured": "Featured",
  "home.yesChance": "Yes chance",
  "home.volume": "Vol",
  "home.closes": "Closes {date}",
  "home.hotMarkets": "Hot markets",
  "home.noMarkets": "No markets found.",
  "home.resultsFor": "{count} results for “{q}”",
  "home.resultFor": "{count} result for “{q}”",

  "docs.title": "Docs",
  "docs.subtitle":
    "How to use Verex, and the mechanism design underneath it — liquidity, resolution and on-chain settlement.",
  "docs.onThisPage": "On this page",
  "docs.allDocs": "All docs",
  "docs.group.guide": "Guide",
  "docs.group.technical": "Technical background",
  "docs.readMore": "Read",
  "docs.notFound": "That document does not exist.",
  "docs.backToDocs": "Back to Docs",
  "docs.searchPlaceholder": "Search docs",
  "docs.noResults": "No matching document.",
  "docs.previous": "Previous",
  "docs.next": "Next",
} as const;

export type MessageKey = keyof typeof en;

const ko: Record<MessageKey, string> = {
  "nav.search": "마켓 검색",
  "nav.docs": "문서",
  "nav.create": "마켓 생성",
  "nav.portfolio": "포트폴리오",
  "nav.faucet": "Faucet", // 국내 크립토 UI에서 그대로 쓰는 용어 — 억지 번역보다 통용어가 낫다

  "nav.faucetMinting": "발행 중…",
  "nav.faucetTitle": "현재 데모 지갑에 테스트 USDC 1,000개를 발행합니다",
  "nav.demoWallet": "데모 지갑 {n}",
  "nav.operatorWallet": "운영자 지갑",
  "nav.walletLabel": "데모 지갑",
  "nav.admin": "관리자",
  "nav.theme": "라이트 / 다크 테마 전환",
  "nav.themeToLight": "라이트 테마로 전환",
  "nav.themeToDark": "다크 테마로 전환",
  "nav.language": "언어 변경",

  "welcome.title": "Verex에 오신 것을 환영합니다",
  "welcome.bodyPre": "이 사이트는 라이브 데모입니다 — ",
  "welcome.bodyTrade": "데모 지갑으로 자유롭게 거래하고",
  "welcome.bodyAnd": " ",
  "welcome.bodyResolve": "운영자 지갑으로 마켓을 정산하세요",
  "welcome.bodyPost":
    " (지갑 선택기는 오른쪽 위에 있습니다). 테스트 USDC는 Faucet에서 받으며, 실제 자금은 사용되지 않습니다.",
  "welcome.cta": "확인 — 거래 시작하기",

  "footer.poweredBy": "powered by JayLabs",

  "home.featured": "추천",
  "home.yesChance": "Yes 확률",
  "home.volume": "거래량",
  "home.closes": "마감 {date}",
  "home.hotMarkets": "인기 마켓",
  "home.noMarkets": "마켓이 없습니다.",
  "home.resultsFor": "“{q}” 검색 결과 {count}건",
  "home.resultFor": "“{q}” 검색 결과 {count}건",

  "docs.title": "문서",
  "docs.subtitle":
    "Verex 사용법과 그 밑에 깔린 메커니즘 설계 — 유동성, 결과 확정, 온체인 정산까지.",
  "docs.onThisPage": "이 문서의 목차",
  "docs.allDocs": "전체 문서",
  "docs.group.guide": "사용 가이드",
  "docs.group.technical": "기술 배경",
  "docs.readMore": "읽기",
  "docs.notFound": "해당 문서가 존재하지 않습니다.",
  "docs.backToDocs": "문서 목록으로",
  "docs.searchPlaceholder": "문서 검색",
  "docs.noResults": "일치하는 문서가 없습니다.",
  "docs.previous": "이전",
  "docs.next": "다음",
};

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en, ko };

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Build a `t()` bound to one locale. Falls back to English for a missing key. */
export function translator(locale: Locale): Translate {
  const table = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  return (key, vars) => {
    const raw = table[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (m, name) => String(vars[name] ?? m));
  };
}

/** Locale tag for `Intl` / `toLocaleDateString`. */
export function intlLocale(locale: Locale): string {
  return locale === "ko" ? "ko-KR" : "en-US";
}
