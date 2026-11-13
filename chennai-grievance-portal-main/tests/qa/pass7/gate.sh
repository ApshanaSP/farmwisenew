#!/usr/bin/env bash
# QA pass 7: the one gate on the combined branch (the six pass 7 lanes, the pass 6 session's fixall, pass 4's eec8c840), one heavy job at a time.
# Run from chennai-grievance-portal-main:   bash tests/qa/pass7/gate.sh
# Holds the machine-wide Studio fixture lock (pass7-common-rules.md) for its whole run. Writes docs/qa/pass7/evidence/*-gate.log and
# docs/qa/pass6/results/suite-p7-gate-*.json. Never prints a .env value. The golden master is not run: pass 6's baseline recording
# (data/aws-cache/qa/golden) is not in this worktree.
set -u
EV=../docs/qa/pass7/evidence
mkdir -p "$EV"
stamp() { echo "[gate] $(date '+%H:%M:%S') $*"; }
LOCK="C:/Users/arjun/AppData/Local/Claude-Data/claude_pzs8sxrjxfjjc/side-session-notes/local_3d5cffa2-303f-46bb-8215-bf3029705939/vitest-4599.lock"
until mkdir "$LOCK" 2>/dev/null; do stamp "4599 lock held by another session; waiting"; sleep 60; done
trap 'rmdir "$LOCK" 2>/dev/null; node tests/qa/pass4/server.mjs stop --port 3106 >/dev/null 2>&1' EXIT
export QA_PIN_PORT=3197
stamp "commit $(git rev-parse --short HEAD)"
node tests/qa/pass4/server.mjs stop --port 3106 >/dev/null 2>&1 || true

stamp "type check"
{ timeout 600 npx tsc --noEmit --incremental false; echo "EXIT=$?"; } > "$EV/tsc-gate.log" 2>&1
stamp "lint"
{ timeout 600 npx next lint; echo "EXIT=$?"; } > "$EV/lint-gate.log" 2>&1
git checkout -- tsconfig.json next-env.d.ts 2>/dev/null

for t in "Asia/Kolkata 7201 p7-gate-1" "Asia/Kolkata 7202 p7-gate-2" "Asia/Kolkata 7203 p7-gate-3" "UTC 7204 p7-gate-utc"; do
  set -- $t; stamp "unit suite $3"; timeout 1200 node tests/qa/pass6/suite.mjs --tz "$1" --seed "$2" --tag "$3" < /dev/null | head -1 | tee -a "$EV/suite-gate.log"
done

stamp "pass 7 lanes' tests (tests/qa/pass7, outside the default config)"
{ timeout 1200 npx vitest run --config vitest.p7.config.ts --maxWorkers=2 tests/qa/pass7 < /dev/null 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests |FAIL|×"; echo "EXIT=${PIPESTATUS[0]}"; } > "$EV/pass7-tests-gate.log"
if [ -f tests/qa/pass7/collector-ops/vitest.real.config.ts ]; then
  { echo "== collector-ops real-path"; timeout 900 npx vitest run --config tests/qa/pass7/collector-ops/vitest.real.config.ts < /dev/null 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests |FAIL|×"; echo "EXIT=${PIPESTATUS[0]}"; } >> "$EV/pass7-tests-gate.log"
fi

stamp "guards and real-path tests on the pinned snapshot (one file at a time)"
: > "$EV/guards-gate.log"
for f in tests/qa/pass4/lane-c.guards.test.ts tests/qa/pass4/g2-cache.test.ts tests/qa/pass4/p6-askiq-dept-lock.guard.test.ts tests/qa/pass4/p7-askiq-join-lock.guard.test.ts \
         tests/qa/pass4/p6-batch-mail.test.ts tests/qa/pass4/p6-critical-tile.test.ts tests/qa/pass4/p6-studio-browser-ws.test.ts tests/qa/pass4/p6-studio-browser-bypass.test.ts \
         tests/qa/pass4/p6-studio-browser-more.test.ts tests/qa/pass4/metamorphic.test.ts tests/qa/pass4/grader/open-baseline.findings.test.ts; do
  [ -f "$f" ] || { echo "== $f (missing)" >> "$EV/guards-gate.log"; continue; }
  { echo "== $f"; timeout 900 npx vitest run --config vitest.qa4.config.ts "$f" < /dev/null 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |Test Files|FAIL|×"; echo "EXIT=${PIPESTATUS[0]}"; } >> "$EV/guards-gate.log"
done
{ echo "== src guards"; timeout 300 npx vitest run --config vitest.p7.config.ts src/lib/thunai/numbergate.pass4.test.ts src/app/pass5.seam.test.ts src/lib/manu/sms.pass5.test.ts src/gate-class-guards.pass4.test.ts < /dev/null 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |Test Files|FAIL|×"; echo "EXIT=${PIPESTATUS[0]}"; } >> "$EV/guards-gate.log"

stamp "production build"
{ NEXT_DIST_DIR=.next-p7 NEXT_TELEMETRY_DISABLED=1 timeout 1200 npx next build; echo "EXIT=$?"; } > "$EV/build-gate.log" 2>&1
git checkout -- tsconfig.json next-env.d.ts 2>/dev/null

stamp "server 3106 on the build, access matrix with valid bodies, browser drive"
node tests/qa/pass4/server.mjs start --port 3106 --dist .next-p7 | tail -1
node tests/qa/seed-local-users.mjs --file data/aws-cache/qa/srv/3106/durable.sqlite | tail -1
rm -f data/aws-cache/qa/run/cookies-3106.json
{ QA_ACCESS_OUT=../docs/qa/pass7/evidence/access-matrix-gate.json QA_ACCESS_BODIES=tests/qa/pass6/matrix-bodies.mjs timeout 1500 node tests/qa/pass4/access-matrix.mjs --port 3106 < /dev/null; echo "EXIT=$?"; } > "$EV/matrix-gate.log" 2>&1
{ timeout 1200 node tests/qa/pass6/drive.mjs --port 3106 < /dev/null; echo "EXIT=$?"; } > "$EV/drive-gate.log" 2>&1
stamp "pass 4's final red team against this build (its it.fails rows are its open findings)"
{ RT_PORT=3106 timeout 900 npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/redteam-final.test.ts < /dev/null 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "✓|×|↓|Tests |Test Files|FAIL"; echo "EXIT=${PIPESTATUS[0]}"; } > "$EV/redteam-final-gate.log" 2>&1
git diff --name-only -- ../docs/qa/pass4 ../docs/qa/pass6 | sed 's#^chennai-grievance-portal-main/##' | xargs -r -I{} git -C .. checkout -- {} 2>/dev/null
stamp "done"
