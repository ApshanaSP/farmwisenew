#!/usr/bin/env bash
# QA pass 7: the same gate as gate.sh in two lanes, for when the owner asks for it fast (round 4, 14 Nov 2026). Run from
# chennai-grievance-portal-main:   bash tests/qa/pass7/gate-fast.sh
# Type check and lint, then the production build, run first. Then two lanes run side by side:
#   lane A: pass 4's whole real-path suite, one file at a time. It also runs every pass 4 guard file of gate.sh's guard loop and
#           redteam-final (on its own server, 3230) with the same tests, so those two steps of gate.sh are read from its JSON report;
#   lane B: the 4 shuffled unit runs, the pass 7 tests and the src guards (holding the machine-wide 4599 lock: the unit config and
#           studio-egress use the Studio fixture), then the golden master on 3106, then a server on 3106 for the access matrix, the
#           browser drive and j1.
# The lanes share only the pinned API (started once before they split) and the read-only .next-qa build: lane A's servers are on
# 3107-3109 and pass 4's own fixed ports, lane B's on 3106. Servers are stopped by port; stop-all runs once, after both lanes.
set -u
EV=../docs/qa/pass7/evidence
mkdir -p "$EV"
stamp() { echo "[gate] $(date '+%H:%M:%S') $*"; }
restore_evidence() {
  git diff --name-only -- ../docs/qa/pass4 ../docs/qa/pass6 ':(exclude)../docs/qa/pass4/golden/p7-gate.manifest.json' \
    ':(exclude)../docs/qa/pass4/golden/diffs/p6-gate__p7-gate.*' ':(exclude)../docs/qa/pass4/golden/diffs/p7-gate-r3__p7-gate.*' \
    ':(exclude)../docs/qa/pass6/results/suite-p7-gate-*' | xargs -r -I{} git -C .. checkout -- {} 2>/dev/null
}
LOCK="C:/Users/arjun/AppData/Local/Claude-Data/claude_pzs8sxrjxfjjc/side-session-notes/local_3d5cffa2-303f-46bb-8215-bf3029705939/vitest-4599.lock"
trap 'node tests/qa/pass4/server.mjs stop --port 3106 >/dev/null 2>&1' EXIT
export QA_PIN_PORT=3197 QA_MODEL_PORT=3107 QA_UI_HONESTY_PORT=3108 QA_SAME_NUMBER_PORT=3109
stamp "commit $(git rev-parse --short HEAD) (two lanes)"
node tests/qa/pass4/server.mjs stop --port 3106 >/dev/null 2>&1 || true

stamp "type check"
{ timeout 600 npx tsc --noEmit --incremental false; echo "EXIT=$?"; } > "$EV/tsc-gate.log" 2>&1
stamp "lint"
{ timeout 600 npx next lint; echo "EXIT=$?"; } > "$EV/lint-gate.log" 2>&1
git checkout -- tsconfig.json next-env.d.ts 2>/dev/null
stamp "production build"
{ NEXT_DIST_DIR=.next-qa NEXT_TELEMETRY_DISABLED=1 timeout 1200 npx next build; echo "EXIT=$?"; } > "$EV/build-gate.log" 2>&1
git checkout -- tsconfig.json next-env.d.ts 2>/dev/null

stamp "pinned API $QA_PIN_PORT, once for both lanes"
node --input-type=module -e "import setup from './tests/qa/pass4/lib/global-setup.mjs'; await setup(); console.log('pinned API up');"

lane_a() {
  stamp "lane A: pass 4 whole real-path suite (with its guard files and redteam-final), one file at a time"
  { timeout 5400 npx vitest run --config vitest.qa4.config.ts --maxWorkers=1 --reporter=dot --reporter=json --outputFile.json="$EV/pass4-suite-gate.json" < /dev/null 2>&1 | sed 's/\x1b\[[0-9;]*m//g'; echo "EXIT=${PIPESTATUS[0]}"; } > "$EV/pass4-suite-gate.log" 2>&1
  stamp "lane A done"
}

lane_b() {
  until mkdir "$LOCK" 2>/dev/null; do stamp "lane B: 4599 lock held by another session; waiting"; sleep 30; done
  trap 'rmdir "$LOCK" 2>/dev/null' EXIT   # this lane holds the lock: give it back if the lane dies
  : > "$EV/suite-gate.log"
  for t in "Asia/Kolkata 7201 p7-gate-1" "Asia/Kolkata 7202 p7-gate-2" "Asia/Kolkata 7203 p7-gate-3" "UTC 7204 p7-gate-utc"; do
    set -- $t; stamp "lane B: unit suite $3"; timeout 1200 node tests/qa/pass6/suite.mjs --tz "$1" --seed "$2" --tag "$3" < /dev/null | head -1 | tee -a "$EV/suite-gate.log"
  done
  stamp "lane B: pass 7 lanes' tests and collector-ops real-path"
  { timeout 1200 npx vitest run --config vitest.p7.config.ts --maxWorkers=2 tests/qa/pass7 < /dev/null 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests |FAIL|×"; echo "EXIT=${PIPESTATUS[0]}"; } > "$EV/pass7-tests-gate.log"
  { echo "== collector-ops real-path"; timeout 900 npx vitest run --config tests/qa/pass7/collector-ops/vitest.real.config.ts < /dev/null 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests |FAIL|×"; echo "EXIT=${PIPESTATUS[0]}"; } >> "$EV/pass7-tests-gate.log"
  stamp "lane B: src guards"
  { echo "== src guards"; timeout 300 npx vitest run --config vitest.p7.config.ts src/lib/thunai/numbergate.pass4.test.ts src/app/pass5.seam.test.ts src/lib/manu/sms.pass5.test.ts src/gate-class-guards.pass4.test.ts < /dev/null 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |Test Files|FAIL|×"; echo "EXIT=${PIPESTATUS[0]}"; } > "$EV/guards-gate.log"
  rmdir "$LOCK" 2>/dev/null; trap - EXIT   # given back: never remove a lock another session takes after this
  stamp "lane B: golden master p7-gate on 3106 (serial), diffs against p6-gate, the previous gate's recording p7-gate-r3, and the noise floor"
  { timeout 2400 node tests/qa/pass4/golden.mjs --label p7-gate --port 3106 --dist .next-qa --serial < /dev/null; echo "EXIT=$?"; node tests/qa/pass4/golden-diff.mjs p6-gate p7-gate > /dev/null; echo "DIFF_EXIT=$?"; node tests/qa/pass4/golden-diff.mjs p7-gate-r3 p7-gate > /dev/null; echo "R3_DIFF_EXIT=$?"; node tests/qa/pass4/golden-diff.mjs p6-base p6-base2 > /dev/null; echo "NOISE_EXIT=$?"; } > "$EV/golden-gate.log" 2>&1
  node tests/qa/pass4/server.mjs stop --port 3106 >/dev/null 2>&1
  stamp "lane B: server 3106 on the build, access matrix with valid bodies, browser drive"
  node tests/qa/pass4/server.mjs start --port 3106 --dist .next-qa | tail -1
  node tests/qa/seed-local-users.mjs --file data/aws-cache/qa/srv/3106/durable.sqlite | tail -1
  rm -f data/aws-cache/qa/run/cookies-3106.json
  { QA_ACCESS_OUT=../docs/qa/pass7/evidence/access-matrix-gate.json QA_ACCESS_BODIES=tests/qa/pass6/matrix-bodies.mjs timeout 1500 node tests/qa/pass4/access-matrix.mjs --port 3106 < /dev/null; echo "EXIT=$?"; } > "$EV/matrix-gate.log" 2>&1
  { timeout 1200 node tests/qa/pass6/drive.mjs --port 3106 < /dev/null; echo "EXIT=$?"; } > "$EV/drive-gate.log" 2>&1
  stamp "lane B: pass 6's Collector journey j1, Jarvis steps"
  mkdir -p "$EV/journeys"
  { JOURNEYS_OUT="$EV/journeys" timeout 900 node tests/qa/pass6/known-failures/journeys/j1.mjs en jarvis < /dev/null; echo "EXIT=$?"; } > "$EV/j1-jarvis-gate.log" 2>&1
  git -C .. status --porcelain -- docs/qa/pass6/evidence/journeys | grep '^??' | cut -c4- | sed 's#/$##' | xargs -r -I{} rm -rf "../{}"
  node tests/qa/pass4/server.mjs stop --port 3106 >/dev/null 2>&1
  stamp "lane B done"
}

lane_a & A=$!
sleep 30   # lane A's first files start their servers before lane B's unit runs take the CPU
lane_b & B=$!
wait "$A"; wait "$B"
node tests/qa/pass4/server.mjs stop-all >/dev/null 2>&1   # only the servers whose pid files are in this worktree, and the pinned API
restore_evidence
stamp "done"
