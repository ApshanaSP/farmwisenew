# STORE-1 (P2): a fresh store whose first query is a write waits on itself

Found by the final qa4 run on 12 Nov, on the code of 6bb5423 (no src change since). Not a flaky test: it repeated in 2 of 2 full runs and in 2 of 2 forced orders.

## What happened
`tests/qa/pass4/decision-matrix.test.ts` (beforeAll, first statement that touches the store: `UPDATE users ...`) hung for the whole 280 s hook time, and all 50 tests were skipped. It passes alone (50 s) and passes when it runs before `audit-narrate_and_figures.test.ts`. It hangs whenever it runs after that file in the same run (`--no-file-parallelism`, or the same worker).

## Why (shown with probes, not guessed)
- Before the hang, the shared durable file (`AWS_DURABLE_FILE`) held 152 unsent rows in `_changes`, left by the first file (probe: `SELECT COUNT(*) FROM _changes` = 152).
- A write outside a transaction takes the store lock first, then loads the build: `src/lib/aws/store.ts` `exec()` takes `g.lock.acquire()`, then `await db()`.
- `db()` -> `current()` -> `durable()`: with a durable file on disk it calls `send({ conn: old, keys })` to send the previous run's unsent changes, and `send()` takes `g.lock.acquire()` again (line about 380, `DELETE FROM _changes`). The lock is not re-entrant, so the load waits for the write that waits for the load.
- Probe every 5 s during the hang: `state=false loading=true durable=false durableLoading=true`, and the UPDATE never returned (raced with a 40 s timer: TIMEOUT). One `SELECT 1` first loads the store and the same UPDATE then returns at once.

## Who can meet it outside the test
A server (or script) that starts with unsent changes in its durable file, where the first thing that touches the store is a write. The server's own start-up read (instrumentation.ts) normally goes first, so the window is small; any entry point that does not run it (a script, a worker, a dev reload) is open. It would stop every write on that process until a restart.

## Repro
`npx vitest run --config vitest.qa4.config.ts --no-file-parallelism tests/qa/pass4/audit-narrate_and_figures.test.ts tests/qa/pass4/decision-matrix.test.ts` with the warm-up read in decision-matrix.test.ts taken out (and `--sequence.shuffle.files --sequence.seed=1` to put the narrate file first).

## What was done
Nothing in src (this job may not change it). The test's beforeAll now reads once before its first write, with a comment pointing here, so the 50 tests run. Suggested fix: in `durable()`, send the old changes without taking the lock (nothing else can hold a transaction before the store exists), or take the write lock after `db()` resolves in `exec()`.
