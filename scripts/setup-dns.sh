#!/usr/bin/env bash
# ⛔ SUPERSEDED (2026-07-25) — DO NOT USE for asia-northeast3.
# Cloud Run built-in domain mapping does NOT support asia-northeast3 (Seoul) — the
# `domain-mappings create` step below fails there (official region list:
# docs.cloud.google.com/run/docs/mapping-custom-domains). Also note the jaylabs.xyz
# Cloud DNS zone lives in doubletree-498007, not this project, which this script
# didn't account for. Use ./scripts/setup-domain-firebase.sh instead (Firebase
# Hosting rewrite — region-independent, ~free, Google-managed TLS). Kept for
# reference in case verex ever moves to a mapping-supported region.
#
# verex.jaylabs.xyz → Cloud Run 도메인 매핑 + Cloud DNS 레코드 등록. 재실행 안전(idempotent).
#
# 전제:
#   - Cloud Run 서비스(기본: verex-web)가 이미 배포되어 있어야 함 (deploy.sh 먼저)
#   - jaylabs.xyz DNS 존이 이 프로젝트의 Cloud DNS에 있음 (ns-cloud-e*.googledomains.com 확인됨)
#   - jay의 gcloud 로그인으로 실행 (gcloud auth login)
#
# 사용법:
#   ./scripts/setup-dns.sh <PROJECT_ID> [REGION] [SERVICE] [DOMAIN]
#   예) ./scripts/setup-dns.sh doubletree-498007
set -euo pipefail

PROJECT_ID=${1:-$(gcloud config get-value project 2>/dev/null)}
REGION=${2:-asia-northeast3}
SERVICE=${3:-verex-web}
DOMAIN=${4:-verex.jaylabs.xyz}
PARENT_DOMAIN=${DOMAIN#*.} # jaylabs.xyz

: "${PROJECT_ID:?사용법: ./scripts/setup-dns.sh <PROJECT_ID> [REGION] [SERVICE] [DOMAIN]}"

echo "▶ 프로젝트: $PROJECT_ID / 리전: $REGION / 서비스: $SERVICE / 도메인: $DOMAIN"
gcloud config set project "$PROJECT_ID" >/dev/null

# 0) 대상 Cloud Run 서비스 존재 확인 — 없으면 배포부터
if ! gcloud run services describe "$SERVICE" --region "$REGION" >/dev/null 2>&1; then
  echo "❌ Cloud Run 서비스 '$SERVICE'($REGION) 가 없습니다. scripts/deploy.sh 로 먼저 배포하세요."
  exit 1
fi

# 1) 도메인 매핑 — 이미 있으면 건너뜀
if gcloud beta run domain-mappings describe --domain "$DOMAIN" --region "$REGION" >/dev/null 2>&1; then
  echo "✓ 도메인 매핑이 이미 존재합니다 ($DOMAIN)"
else
  echo "▶ 도메인 매핑 생성: $DOMAIN → $SERVICE"
  # 소유권 미검증 도메인이면 여기서 실패함 — 아래 안내 출력
  if ! gcloud beta run domain-mappings create --service "$SERVICE" --domain "$DOMAIN" --region "$REGION"; then
    cat <<EOF
❌ 매핑 생성 실패 — 도메인 소유권 검증이 필요할 수 있습니다.
   1) https://search.google.com/search-console 에서 '$PARENT_DOMAIN' 도메인 속성 추가
   2) 제시되는 TXT 레코드를 Cloud DNS 존에 추가:
      gcloud dns record-sets create "$PARENT_DOMAIN." --zone=<ZONE_NAME> --type=TXT --ttl=300 --rrdatas='"google-site-verification=..."'
   3) Search Console에서 Verify 클릭 후 이 스크립트 재실행
EOF
    exit 1
  fi
fi

# 2) 매핑이 요구하는 DNS 레코드 조회 (서브도메인이면 CNAME ghs.googlehosted.com)
echo "▶ 필요한 DNS 레코드 조회..."
RECORD_TYPE=$(gcloud beta run domain-mappings describe --domain "$DOMAIN" --region "$REGION" \
  --format='value(status.resourceRecords[0].type)')
RECORD_DATA=$(gcloud beta run domain-mappings describe --domain "$DOMAIN" --region "$REGION" \
  --format='value(status.resourceRecords[0].rrdata)')
echo "  → $DOMAIN $RECORD_TYPE $RECORD_DATA"

# 3) Cloud DNS 존 찾기 (dnsName = jaylabs.xyz.)
ZONE=$(gcloud dns managed-zones list --filter="dnsName=$PARENT_DOMAIN." --format='value(name)')
if [ -z "$ZONE" ]; then
  echo "❌ 이 프로젝트에 '$PARENT_DOMAIN.' Cloud DNS 존이 없습니다. 존이 있는 프로젝트로 재실행하세요."
  exit 1
fi
echo "✓ Cloud DNS 존: $ZONE"

# 4) 레코드 upsert — 있으면 갱신, 없으면 생성
if gcloud dns record-sets describe "$DOMAIN." --zone="$ZONE" --type="$RECORD_TYPE" >/dev/null 2>&1; then
  echo "✓ 레코드가 이미 존재합니다 — 값 갱신"
  gcloud dns record-sets update "$DOMAIN." --zone="$ZONE" --type="$RECORD_TYPE" --ttl=300 --rrdatas="$RECORD_DATA"
else
  gcloud dns record-sets create "$DOMAIN." --zone="$ZONE" --type="$RECORD_TYPE" --ttl=300 --rrdatas="$RECORD_DATA"
fi

cat <<EOF

✓ 완료. 이후 자동 진행되는 것:
  - DNS 전파: 보통 수 분 (TTL 300)
  - HTTPS 인증서 발급: Cloud Run이 자동, ~15분 소요 가능
확인:
  dig $DOMAIN +short          # → $RECORD_DATA
  curl -I https://$DOMAIN     # 인증서 발급 후 200
EOF
