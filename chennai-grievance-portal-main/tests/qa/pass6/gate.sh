#!/usr/bin/env bash
# QA pass 6: the final gate, one heavy job at a time, on the commit checked out. Run from chennai-grievance-portal-main:
#   bash tests/qa/pass6/gate.sh
# Writes docs/qa/pass6/evidence/{tsc,lint,guards,build,golden,matrix,drive}-gate.log and results/suite-gate-*.json, access-matrix-gate.json,
# drive-gate.json. Stops the test server on 3106 first and at the end. Never prints a .env value.
set -u
EV=../docs/qa/pass6/evidence
mkdir -p "$EV" ../docs/qa/pass6/results
stamp() { echo "[gate] $(date '+%H:%M:%S') $*"; }
export QA_PIN_PORT=3197
stamp "commit $(git rev-parse --short HEAD)"
node tests/qa/pass4/server.mjs stop --port 3106 >/dev/null 2>&1 || true

stamp "type check"
{ timeout 300 npx tsc --noEmit --incremental false; echo "EXIT=$?"; } > "$EV/tsc-gate.log" 2>&1
stamp "lint"
{ timeout 300 npx next lint; echo "EXIT=$?"; } > "$EV/lint-gate.log" 2>&1

for t in "Asia/Kolkata 6201 gate-1" "Asia/Kolkata 6202 gate-2" "Asia/Kolkata 6203 gate-3" "UTC 6204 gate-utc"; do
  set -- $t; stamp "unit suite $3"; timeout 900 node tests/qa/pass6/suite.mjs --tz "$1" --seed "$2" --tag "$3" < /dev/null | head -1
done

stamp "guards and pass 6 real-path tests (one file at a time)"
: > "$EV/guards-gate.log"
for f in tests/qa/pass4/lane-c.guards.test.ts tests/qa/pass4/g2-cache.test.ts tests/qa/pass4/p6-askiq-dept-lock.guard.test.ts tests/qa/pass4/p6-batch-mail.test.ts tests/qa/pass4/p6-studio-browser-ws.test.ts; do
  { echo "== $f"; timeout 600 npx vitest run --config vitest.qa4.config.ts "$f" < /dev/null 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |Test Files|FAIL|×"; echo "EXIT=${PIPESTATUS[0]}"; } >> "$EV/guards-gate.log"
done
{ echo "== src guards"; timeout 300 npx vitest run src/lib/thunai/numbergate.pass4.test.ts src/app/pass5.seam.test.ts src/lib/manu/sms.pass5.test.ts < /dev/null 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |Test Files|FAIL|×"; echo "EXIT=${PIPESTATUS[0]}"; } >> "$EV/guards-gate.log"

stamp "production build"
{ NEXT_DIST_DIR=.next-qa6 NEXT_TELEMETRY_DISABLED=1 timeout 900 npx next build; echo "EXIT=$?"; } > "$EV/build-gate.log" 2>&1
git checkout -- tsconfig.json next-env.d.ts

stamp "golden master p6-gate (serial)"
{ timeout 1200 node tests/qa/pass4/golden.mjs --label p6-gate --port 3107 --dist .next-qa6 --serial < /dev/null; echo "EXIT=$?"; node tests/qa/pass4/golden-diff.mjs p6-base p6-gate; echo "DIFF_EXIT=$?"; } > "$EV/golden-gate.log" 2>&1

stamp "server 3106, access matrix with valid bodies, browser drive"
node tests/qa/pass4/server.mjs start --port 3106 --dist .next-qa6 | tail -1
node tests/qa/seed-local-users.mjs --file data/aws-cache/qa/srv/3106/durable.sqlite | tail -1
rm -f data/aws-cache/qa/run/cookies-3106.json
{ QA_ACCESS_OUT=../docs/qa/pass6/results/access-matrix-gate.json QA_ACCESS_BODIES=tests/qa/pass6/matrix-bodies.mjs timeout 1200 node tests/qa/pass4/access-matrix.mjs --port 3106 < /dev/null; echo "EXIT=$?"; } > "$EV/matrix-gate.log" 2>&1
{ timeout 900 node tests/qa/pass6/drive.mjs --port 3106 < /dev/null; echo "EXIT=$?"; } > "$EV/drive-gate.log" 2>&1
stamp "done (server 3106 left running for the red team; stop it with server.mjs stop --port 3106)"
