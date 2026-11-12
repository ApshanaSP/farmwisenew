# Skipped tests in the default suite

From the baseline hunt (`baseline.json`): the same 13 tests in 2 files were skipped in all 20 runs. No test was skipped in only some runs. None of the 13 was run in this phase: 12 need MySQL, the AWS store or the public internet, and the Loopback check sits behind the same switch.

| File | Tests | Runs only when |
|---|---|---|
| `src/lib/aws/parity.test.ts` | 1 | `PARITY_OUT` is set |
| `src/lib/studio/morning.live.test.ts` | 12 | `STUDIO_LIVE=1` |

## `src/lib/aws/parity.test.ts` (1 test)

- `store parity runs the dashboard data functions`

**Why it is skipped.** It runs the dashboard's data functions against MySQL or the AWS store and writes the results to a file. `scripts/compare-parity.js` then compares two such files by hand. It needs a database or the API key.

**Is that honest?** The skip is honest: the top of the file says why, and it cannot run safely by default. Calling it a test is not fully honest:

- It has no `expect`, and it catches each case's error and writes it down. Run for real, it cannot fail because the stores differ. The real check is the separate compare script.
- No test in the default suite does this comparison, and it is not automated. `docs/audits/FINDINGS.md:136` asked for it to run in CI, but the repo has no CI workflow files.
- The stored outputs, `tmp/parity-mysql.json` and `tmp/parity-aws.json`, date from 2 Oct 2026. Comparing them today prints "4/16 cases identical". Their age alone may explain this, so it does not show the stores differ now. It also does not show they match.
- The file loads the real `.env` at its top (line 15), even when skipped. This does nothing today: no other test shares that file's process, and `.env` has no `PARITY_OUT` (checked by name only). But a `PARITY_OUT` line in `.env` would turn this skip into a live run.

## `src/lib/studio/morning.live.test.ts` (12 tests)

- data.opencity.in CKAN dataset (public toilets)
- data.opencity.in dataset (fire stations)
- tn.data.gov.in resource page (no key)
- Wikipedia: list of neighbourhoods of Chennai
- Chennai news section (The Hindu)
- A random Wikipedia article
- YouTube
- GitHub CSV (world GDP)
- chennai.nic.in home page
- A missing page on chennai.nic.in
- Tableau Public
- Loopback (SSRF)

**Why they are skipped.** Eleven read real public sites, so the result would depend on the internet and on those sites. The file says so at the top. The twelfth, Loopback, needs no internet but sits in the same block.

**Is that honest?** Skipping them by default is right, with three limits:

- **Two rows were already red by the project's own report.** `docs/audits/STUDIO/REPORT.md` (28 Oct 2026, the last live check on record) gives "fire stations" as ERROR 404, "the URL was wrong", and Wikipedia neighbourhoods as NO DATA, marked "no". The test still expects `data` or `choose` for both, and the file has not changed since. So a live run may well fail on those two rows. That is a claim from the report: it was not checked in this phase. "Skipped" hides it.
- **Some rows are weak.** `chennai.nic.in home page` accepts 4 of the 6 outcomes, so few results can fail it.
- **Nothing is lost by skipping Loopback.** The default suite already covers it: `src/lib/studio/ssrf.test.ts` tests the host check, and the link fixtures `e-127`, `e-meta`, `e-v6` and `e-tolocal` are run by `outcomes.test.ts`.

## Not counted as skipped, but could be

These ran and passed in all 20 runs here. Each has a condition that could make it skip.

| Tests | Condition | Risk |
|---|---|---|
| `src/lib/studio/connect.test.ts`, 3 browser sign-in tests | Edge, Chrome or Chromium starts when the file loads | On a machine with no browser these 3 stop running, and the only sign is the skip count. A browser that fails to start under load would do the same; that did not happen in these 20 runs. |
| `src/lib/studio/studio.test.ts`, 6 tests | The files in `data/studio-samples` exist | Low. The 4 sample files are in git. |
| `src/lib/studio/outcomes.test.ts`, one test per fixture | A fixture marked `todo:` becomes `it.todo` | None today: no fixture is marked, and the todo count was 0 in every run. |

I also searched for tests that pass without checking anything, by returning early on their first line. The search found none. It was a text search for that one shape, so it would not catch every form.

Files named `*.live.ts` and `*.golden.ts` (20 of them under `src/`) are not in the default suite at all, because `vitest.config.ts` includes only `src/**/*.test.ts`. They do not count in the 13.
