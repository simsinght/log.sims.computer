#!/usr/bin/env bash
# Preview contract: build + start the app on port 3000, backgrounded, exit 0 when ready.
# Env provided by Aviator: PREVIEW_URL (public https base URL) + configured secrets (TMDB_API_KEY).
set -euo pipefail

export NEXT_PUBLIC_BASE_URL="${PREVIEW_URL:-http://localhost:3000}"
export BASE_URL="$NEXT_PUBLIC_BASE_URL"

npm ci
npm run build
nohup npm run start >/tmp/app.log 2>&1 &

for _ in $(seq 1 90); do
  if curl -fsS -o /dev/null http://localhost:3000; then
    exit 0
  fi
  sleep 2
done

echo "app failed to become ready on :3000" >&2
tail -n 100 /tmp/app.log >&2
exit 1
