#!/usr/bin/env bash
# v6: the production server for the real-provider latency runs (tests/e2e/real6.spec.ts), as HANDOVER's owed run 6 describes:
# a bundle built with NEXT_PUBLIC_JARVIS_SPEC=1 (the dev console and its routes kept), Claude never called, Groq leading, the console's
# own AI providers off (its translator would spend Groq), the dry-run store with its real cached data, the main quota ledger.
#   NEXT_DIST_DIR=.next-v6base NEXT_PUBLIC_JARVIS_SPEC=1 npx next build        (once per code version)
#   bash scripts/jarvis6/serve-real.sh .next-v6base [port] [extra VAR=value ...]
# Extra VAR=value pairs set a v6 flag for this server only (the on/off runs).
set -euo pipefail
DIST="${1:?dist dir}"; PORT="${2:-3012}"; shift; shift || true
cd "$(dirname "$0")/../.."
exec env NEXT_DIST_DIR="$DIST" NEXT_PUBLIC_JARVIS_SPEC=1 JARVIS_CLAUDE_OFF=1 JARVIS_PLANNER_LEAD=groq \
  AI_PROVIDER=none AI_FORCE_PROVIDER=none AI_FALLBACK_PROVIDER=none AI_CHAT_PROVIDER=none \
  DATA_BACKEND=aws AWS_STORE_DRY_RUN=1 AWS_STORE_RELOAD_MINUTES=100000 AWS_DURABLE_FILE=data/aws-cache/dryrun-spec/durable.sqlite \
  SMTP_HOST=127.0.0.1 SMTP_PORT=1 THUNAI_DIR=data/thunai "$@" \
  npx next start -H 127.0.0.1 -p "$PORT"
