# Fix-all run: rules for every fixer and reviewer agent

The owner said "fix all" after QA pass 6. This run works through pass 6's open P1, P2 and P3 rows in `docs/qa/pass6/BUGS.json`. A
separate session ("Fix pass 6's 14 open P0 bugs") and the six sessions it started fix the P0 and P1 rows in their own worktrees at the same time.

- Worktree: `E:\farm\.claude\worktrees\qa-pass6-a84a72`. Branch: see "Round 2" below (round 1 was `claude/fixall-a84a72`). The app is
  in `chennai-grievance-portal-main/`.
- Only one fixer works at a time, in this worktree. The machine has 15 GB of memory and seven other sessions run alongside, so keep test runs targeted.

## Every row ends in exactly one of these states

- **fixed**:
  1. Write a test that fails on the current code (the reproduction).
  2. Fix at the root cause, not the symptom.
  3. Commit the fix.
  4. Revert check: undo the fix's source change, see the test fail, then restore it. After committing:
     `git diff HEAD~1 HEAD -- <source files only> | git apply -R`, run the test, then `git checkout HEAD -- <those files>`.
     Never use `git stash`.
  5. The test passes with the fix.
- **not-reproduced**: the code already does the right thing. Show it with a test that passes, or a file:line explanation, and say
  why the report was wrong. Most rows are agents' reports that nobody re-ran, so expect some.
- **duplicate**: the same root cause as another row. Set `dup_of`; one test may cover both.
- **owner**: only when the fix would change a product decision. That means:
  - Apshana's design (`a999d42`, final; for example per-tab sessions, password-only sign-in);
  - the Manu Desk's design or workflow (fix its bugs, don't redesign it);
  - pass 5's owner rows P5-006, P5-020 and P5-021;
  - a choice the summary already lists as the owner's.

  Say what the decision is in one line.
- **open**: you ran out of time, or it needs a running server or a live model. Say exactly what is left.

## Round 2 (after the combined merge)

- Branch: `claude/fixall2-a84a72`, cut from the combined branch's tip `1df591f0`. The final gate passed on `ae65fe84`.
  The combined branch holds the six p7 lanes, round 1 (`claude/fixall-a84a72`) and pass 4's last commit.
- The p7 sessions are finished, so their files are open to round 2, with one exception. Until the fix coordinator says otherwise, do
  not change `src/lib/thunai/**`, `src/lib/studio/**` or the assistant rules lane: the open P0/P1 rows there may still be its.
  If a row needs one of those files, leave it `open` with the note "needs <file>, held for the coordinator's open P0/P1 rows".
- Never take a P0 or P1 row unless the lead gives it to you.
- Ports: Next 3110–3113, pinned API 3190.
- The gate runs vitest shuffled. A test that passes only in file order is a bug in the test: make it order-independent (reset
  module state in beforeEach, or use unique keys) instead of turning shuffle off.

## Commands

- Targeted tests: `cd chennai-grievance-portal-main && npx vitest run --config vitest.fixall.config.ts <test files>`. This config
  has no Studio fixture server.
  - Never run the default config. Never run the whole suite. Never run `vitest.qa4.config.ts`.
  - Never start a dev or production server.
  - The lead runs the default suite, the guards and the gate.
- Type check: `npx tsc --noEmit --incremental false`, about once every 4 fixes and before you finish. It is heavy, so only once at a
  time.
- Lint: `npx eslint <changed files>`.
- Put new tests in `src/**`, next to the code, named `*.fixall.test.ts`: the test config only picks up `src/**/*.test.ts`. Change an
  existing test only when the fix makes its old expectation wrong, and say why in the commit.
- Commits:
  - One per fix, or one per root cause shared by several rows.
  - Subject: `fix(<row id>[, <row id>]): <what was wrong>`.
  - Body: the root cause, the test, and the revert check result.
  - End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Ledger: after each commit, run from `chennai-grievance-portal-main`:
  `node tests/qa/pass6/bug.mjs '{"id":"<row>","status":"fixed","fix_commit":"<short sha>","failing_test":"<file>::<test name>","revert_check":"<fails without / passes with>","root_cause":"<one line>","closed_in":"fixall"}'`
  - Other states: `status` "not-reproduced" with `"note"`, "duplicate" with `"dup_of"`, "owner" with `"note"`, or "open" with `"note"`.
  - Commit the ledger with the fix, or in a `qa(fixall): ledger` commit right after.
  - Keep each row's `id`, `severity` and `title` as they are.

## Hard rules

- Never push, merge, open a PR, or switch or move a branch.
- Never write outside this worktree, except the session scratchpad. Never write to `E:\farm` or to another worktree.
- `AWS_STORE_DRY_RUN=1` always. No real SMS or email. No live model calls.
- Never print `.env` values. List key names only: `grep -oE '^[A-Z_][A-Z0-9_]*=' .env`.
- Never open `docs/qa/pass4/testsets/sealed.jsonl.gz`, `authoring-trail.json.gz`, or the Task_6 PDF.
- Don't wait in background loops or monitors for anything. Nothing you need runs in the background.

## What to report at the end

A table of every row you were given: id, severity, final state, commit, test file. Then rows that need a live check, and anything
you found that is not in your rows. Keep it short: the ledger and the commits hold the detail.
