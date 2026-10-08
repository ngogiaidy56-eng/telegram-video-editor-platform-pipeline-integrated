#!/usr/bin/env bash
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID}"
: "${KTOR_BACKEND_ORIGIN:?Set KTOR_BACKEND_ORIGIN}"

CF_WORKER_NAME="${CF_WORKER_NAME:-video-subtitle-api}"
CF_PAGES_PROJECT="${CF_PAGES_PROJECT:-video-subtitle-tma}"

if ! command -v gradle >/dev/null 2>&1; then
  echo "gradle is required for the Kotlin/JS build." >&2
  exit 1
fi

export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

echo "==> Build TMA"
gradle :webApp:jsBrowserDistribution

TMP_SECRETS="$(mktemp)"
trap 'rm -f "$TMP_SECRETS"' EXIT
node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({BACKEND_ORIGIN: process.env.KTOR_BACKEND_ORIGIN}))' "$TMP_SECRETS"

echo "==> Deploy Worker: $CF_WORKER_NAME"
npx wrangler@4.148.0 deploy \
  --config cloudflare/worker/wrangler.jsonc \
  --name "$CF_WORKER_NAME" \
  --secrets-file "$TMP_SECRETS"

echo "==> Deploy Pages: $CF_PAGES_PROJECT"
(cd webApp && npx wrangler@4.148.0 pages deploy --project-name "$CF_PAGES_PROJECT")

echo "Deployment complete."
