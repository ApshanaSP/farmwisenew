#!/usr/bin/env bash
# v7: the production server for the real-provider latency runs (tests/e2e/real6.spec.ts), as v6's scripts/jarvis6/serve-real.sh, plus:
#   CLAUDE=1   leaves Claude on (the owner's test: Haiku 5.5 leads the planner and the answer writer, under the US$5 ceiling); default off
# v7's answer layer is on by default; JARVIS_ANSWER=v6 as an extra VAR=value serves v6's answers from the same bundle.
#   NEXT_DIST_DIR=.next-v7 NEXT_PUBLIC_JARVIS_SPEC=1 npx next build        (once per code version)
#   bash scripts/jarvis7/serve-real.sh .next-v7 [port] [extra VAR=value ...]
set -euo pipefail
DIST="${1:?dist dir}"; PORT="${2:-3012}"; shift; shift || true
cd "$(dirname "$0")/../.."
if [ "${CLAUDE:-0}" = "1" ]; then
  CL="JARVIS_CLAUDE_BUDGET_USD=${JARVIS_CLAUDE_BUDGET_USD:-5}"; LEAD="JARVIS_PLANNER_LEAD=${JARVIS_PLANNER_LEAD:-haiku}"
else
  CL="JARVIS_CLAUDE_OFF=1"; LEAD="JARVIS_PLANNER_LEAD=groq"
fi
exec env NEXT_DIST_DIR="$DIST" NEXT_PUBLIC_JARVIS_SPEC=1 "$CL" "$LEAD" \
  AI_PROVIDER=none AI_FORCE_PROVIDER=none AI_FALLBACK_PROVIDER=none AI_CHAT_PROVIDER=none \
  DATA_BACKEND=aws AWS_STORE_DRY_RUN=1 AWS_STORE_RELOAD_MINUTES=100000 AWS_DURABLE_FILE=data/aws-cache/dryrun-spec/durable.sqlite \
  SMTP_HOST=127.0.0.1 SMTP_PORT=1 THUNAI_DIR=data/thunai "$@" \
  npx next start -H 127.0.0.1 -p "$PORT"
