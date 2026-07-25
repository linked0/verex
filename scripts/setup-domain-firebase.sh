#!/usr/bin/env bash
# verex.jaylabs.xyz → Firebase Hosting rewrite → Cloud Run (verex-web). Idempotent.
#
# WHY Firebase Hosting (not Cloud Run domain mapping): built-in domain mapping does
# NOT support asia-northeast3 (Seoul) — verified against the official region list
# (docs.cloud.google.com/run/docs/mapping-custom-domains, 2026-07-25). setup-dns.sh
# (the old approach) fails at `domain-mappings create` in this region. Firebase
# Hosting proxies any region, TLS is Google-managed, and cost is ~free at our volume.
# Same route rabbit's jun-30 design §11 chose for staging.rabbit.jaylabs.xyz.
#
# What this does (all REST — no firebase CLI needed):
#   1) Enable firebase.googleapis.com + firebasehosting.googleapis.com; add Firebase
#      to the project (creates the default Hosting site = PROJECT_ID).
#   2) Release a Hosting version whose ONLY content is the rewrite:
#      ** → Cloud Run service verex-web (asia-northeast3). firebase.json mirrors this
#      for anyone using the CLI later.
#   3) Register the custom domain and read back the DNS records it requires.
#   4) Upsert those records into the Cloud DNS zone (jaylabs.xyz lives in the
#      DNS_PROJECT — a DIFFERENT project than the app; cross-project is fine).
#   5) Poll until ownership is ACTIVE and the cert is issued.
#
# Prereqs: gcloud auth login (owner on both projects). Re-run safe.
#
# Usage: ./scripts/setup-domain-firebase.sh [DOMAIN]
#   e.g. ./scripts/setup-domain-firebase.sh verex.jaylabs.xyz
set -euo pipefail

PROJECT_ID=${PROJECT_ID:-verex-499205}     # app + hosting project
DNS_PROJECT=${DNS_PROJECT:-doubletree-498007} # project holding the jaylabs.xyz Cloud DNS zone
DNS_ZONE=${DNS_ZONE:-jaylabs-xyz}
SERVICE=${SERVICE:-verex-web}
REGION=${REGION:-asia-northeast3}
DOMAIN=${1:-verex.jaylabs.xyz}
SITE="$PROJECT_ID" # default Hosting site id == project id

TOKEN=$(gcloud auth print-access-token)
H=(-H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT_ID" -H "Content-Type: application/json")
FBH="https://firebasehosting.googleapis.com/v1beta1"

echo "▶ APIs + Firebase on $PROJECT_ID"
gcloud services enable firebase.googleapis.com firebasehosting.googleapis.com --project "$PROJECT_ID" >/dev/null
if ! curl -sf "${H[@]}" "https://firebase.googleapis.com/v1beta1/projects/$PROJECT_ID" >/dev/null; then
  curl -s -X POST "${H[@]}" "https://firebase.googleapis.com/v1beta1/projects/$PROJECT_ID:addFirebase" -d '{}' >/dev/null
  for _ in $(seq 1 12); do
    curl -sf "${H[@]}" "https://firebase.googleapis.com/v1beta1/projects/$PROJECT_ID" >/dev/null && break
    sleep 5
  done
fi
# Default site exists after addFirebase; create explicitly if somehow missing (409 = fine).
curl -s -X POST "${H[@]}" "$FBH/projects/$PROJECT_ID/sites?siteId=$SITE" -d '{}' >/dev/null || true

echo "▶ Release rewrite: ** → $SERVICE ($REGION)"
VNAME=$(curl -s -X POST "${H[@]}" "$FBH/sites/$SITE/versions" \
  -d "{\"config\":{\"rewrites\":[{\"glob\":\"**\",\"run\":{\"serviceId\":\"$SERVICE\",\"region\":\"$REGION\"}}]}}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
curl -s -X POST "${H[@]}" "$FBH/$VNAME:populateFiles" -d '{}' >/dev/null
curl -s -X PATCH "${H[@]}" "$FBH/$VNAME?updateMask=status" -d '{"status":"FINALIZED"}' >/dev/null
curl -s -X POST "${H[@]}" "$FBH/sites/$SITE/releases?versionName=$VNAME" -d '{}' >/dev/null
echo "  ✓ live at https://$SITE.web.app (sanity-check this first)"

echo "▶ Custom domain: $DOMAIN"
# 409 on re-run = already registered; fine.
curl -s -X POST "${H[@]}" "$FBH/projects/$PROJECT_ID/sites/$SITE/customDomains?customDomainId=$DOMAIN" -d '{}' >/dev/null || true

# Read required DNS records (hosting CNAME/A + ACME TXT) and upsert into Cloud DNS.
upsert() { # name type rdata
  local name=$1 type=$2 rdata=$3
  if gcloud dns record-sets describe "$name." --zone="$DNS_ZONE" --project="$DNS_PROJECT" --type="$type" >/dev/null 2>&1; then
    gcloud dns record-sets update "$name." --zone="$DNS_ZONE" --project="$DNS_PROJECT" --type="$type" --ttl=300 --rrdatas="$rdata"
  else
    gcloud dns record-sets create "$name." --zone="$DNS_ZONE" --project="$DNS_PROJECT" --type="$type" --ttl=300 --rrdatas="$rdata"
  fi
}

echo "▶ DNS records → zone $DNS_ZONE (project $DNS_PROJECT)"
sleep 5
CD_JSON=$(curl -s "${H[@]}" "$FBH/projects/$PROJECT_ID/sites/$SITE/customDomains/$DOMAIN")
echo "$CD_JSON" | python3 -c '
import sys, json
d = json.load(sys.stdin)
recs = []
for grp in (d.get("requiredDnsUpdates") or {}).get("desired", []):
    for r in grp.get("records", []):
        if r.get("requiredAction") == "ADD":
            recs.append((r["domainName"], r["type"], r["rdata"]))
for grp in (((d.get("cert") or {}).get("verification") or {}).get("dns") or {}).get("desired", []):
    for r in grp.get("records", []):
        if r.get("requiredAction") == "ADD":
            rdata = r["rdata"] if r["type"] != "TXT" else "\"%s\"" % r["rdata"]
            recs.append((r["domainName"], r["type"], rdata))
for name, typ, rdata in recs:
    print(f"{name} {typ} {rdata}")
' | while read -r name type rdata; do
  # CNAME rdata needs a trailing dot in Cloud DNS
  [ "$type" = "CNAME" ] && rdata="${rdata%.}."
  echo "  - $name $type $rdata"
  upsert "$name" "$type" "$rdata"
done

echo "▶ Waiting for ownership + certificate (can take ~15 min)..."
for _ in $(seq 1 60); do
  S=$(curl -s "${H[@]}" "$FBH/projects/$PROJECT_ID/sites/$SITE/customDomains/$DOMAIN" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ownershipState'), d.get('hostState'), (d.get('cert') or {}).get('state'))")
  echo "  $S"
  case "$S" in *ACTIVE*CERT_ACTIVE*) break;; esac
  sleep 30
done

echo
echo "확인:  dig $DOMAIN +short   /   curl -I https://$DOMAIN"
