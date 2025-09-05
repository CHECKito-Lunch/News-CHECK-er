#!/usr/bin/env bash
set -euo pipefail

# === Konfig: trage hier deine Werte ein ===
BASE_URL="${BASE_URL:-https://news-check-puce.vercel.app}"
CRON_SECRET="${NEWS_AGENT_CRON_SECRET_FROM_VERCEL:-}"

# === Prüfen, ob Variablen gesetzt sind ===
if [[ -z "$BASE_URL" ]]; then
  echo "❌ BASE_URL ist leer. Exportiere es vorher oder trage direkt im Script ein."
  exit 1
fi

if [[ -z "$CRON_SECRET" ]]; then
  echo "❌ CRON_SECRET ist leer. Exportiere NEWS_AGENT_CRON_SECRET_FROM_VERCEL vorher oder trage es direkt im Script ein."
  exit 1
fi

# === URL bauen ===
URL="${BASE_URL%/}/api/admin/news-agent/run?dry=1&force=1&key=${CRON_SECRET}"

echo "👉 BASE_URL  : $BASE_URL"
echo "👉 CRON_SECRET (gekürzt): ${CRON_SECRET:0:4}...${CRON_SECRET: -4}"
echo "👉 Final URL : $URL"
echo

# === Request ausführen ===
RESP_FILE="$(mktemp)"
HTTP_CODE=$(curl -sS -o "$RESP_FILE" -w "%{http_code}" -X POST \
  -H "X-Cron-Auth: ${CRON_SECRET}" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Accept: application/json" \
  "$URL" || true)

echo "📡 HTTP-Code: $HTTP_CODE"
echo "---- Response ----"
cat "$RESP_FILE" || true
echo "------------------"
rm -f "$RESP_FILE"
