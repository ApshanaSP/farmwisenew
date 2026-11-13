# Skeptic 2 (screens and safety): review of the commits after 7f7d537

Build under test: production build of HEAD 7279522 in `.next-sk2`, port 3216, frozen ticking clock, no model key, own data folder (instance skeptic2b).
Tests: `tests/qa/pass4/skeptic-g2.test.ts` (15 tests) and `tests/qa/pass4/skeptic-g2.otp.test.ts` (1). Every bug that is still open is an `it.fails` whose name starts with its id, so the suite is green while the bug stays visible.
The live parts need the server and are skipped when it is not up:

    node tests/qa/pass4/server.mjs start --port 3216 --frozen --ticking --instance skeptic2b --dist .next-sk2
    npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/skeptic-g2.test.ts tests/qa/pass4/skeptic-g2.otp.test.ts

The real-run logs are in `docs/qa/pass4/evidence/skeptic-g2-*` (the scripts `tests/qa/pass4/skeptic-g2.*.mjs` write into the app folder's `docs/qa/pass4/evidence`; copies are kept here at the repo root). All 16 tests pass as they stand, which means all 16 bugs reproduced.

## Redsec2 verdicts

`hunt-redsec2.json` holds one finding.

- **hunt-redsec2-1: CONFIRMED, still open, P1.** No commit after 7f7d537 touches `src/lib/security/factors.ts` or `rate-limit.ts`. Re-run on a fresh account: 20 parallel wrong passwords to `/api/auth/confirm` gave 20 x 401 (every one checked by bcrypt), and the next single wrong guess gave 429 (`evidence/skeptic-g2-burst.txt`, test SK2-4). The lockout only starts after a burst has been checked.
  Ready patch: count the try before the await. In `verifyFactor`, call `addFailure(key, 15 * 60)` first, then check `failuresOver(key, 5)` with the count that includes this try, and on success call `clearFailures(key)`. This also makes the check atomic in one process (no await between the read and the write).
- Second door of the same bug, new, P2 (SK2-5): the emailed code. `verifyAndConsumeOtp` (`src/lib/otp.ts`) reads `attempts`, awaits bcrypt, and adds the failure after. In a burst of 20 guesses, the right code sent as the 20th is accepted although 5 tries are allowed. Fix: claim an attempt first with `UPDATE ... SET attempts = attempts + 1 WHERE id = ? AND attempts < ?`, refuse when `affectedRows` is 0, and only then compare. The test uses a fake table and the real bcrypt.
- The old file's other sentences (CSRF, path traversal, SSRF, SQL injection, IDOR clean) are not findings, so there is nothing to re-run. I did not re-test them.

## Breaks (each has a failing-when-fixed test)

| id | sev | cluster | what | proof |
|---|---|---|---|---|
| SK2-14 | P2 | RC-49 | axe `color-contrast`, serious, on the officer console views after the first one (Work, Daily, Weekly, Monthly, Quarterly, By severity, My work), all three departments, English and Tamil, light and dark: orange `#e5720f` on `#fff3e6` is 2.84:1 (severity chip, `.daily small`, `.old`), gold `#b98b00` on `#fdf6dd` 2.87:1, green `#0e9f6e` on `#e3f6ee` 3.01:1, in dark white on `#1a8f4e` 4.13:1 (`.btn`, `.lb`). The first view is clean, which is all the fixer walked. About 1,000 nodes in 280 runs. The rows must be drawn before the scan (a scan at 1.5 s sees nothing). | `evidence/skeptic-g2-axe.json`, `skeptic-g2-contrast.json`, test SK2-14 |
| SK2-16 | P2 | RC-49 / RC-46 | at 360 px the officer's case drawer body `.odrawer-b` scrolls but cannot be reached by keyboard (axe `scrollable-region-focusable`, serious), every department, language, theme. | `skeptic-g2-axe.json`, SK2-16 |
| SK2-15 | P3 | RC-49 | the 404 page has no `main` landmark (axe `landmark-one-main` and `region`, moderate). The fixer's "no violation of any impact" was for listed pages only. | SK2-15 (fetch of `/this-page-does-not-exist-xyz`) |
| SK2-13 | P2 | RC-49 | commit b03acd7 rewrote `src/components/a11y.pass4.test.ts` and removed four class guards (PB-320 tablist buttons are tabs, PB-321 no foreign stylesheet or font, PB-322 text colours reach 4.5:1, PB-323 a language switch names itself) and its message does not say so. The four old guards still pass on HEAD (run from `git show b03acd7^:...`), so this is lost cover. Put them back. | SK2-13 |
| SK2-10 | P2 | RC-48 | the "Confirm it's you" box is `role=dialog aria-modal=true` but Tab leaves it: 12 Tab presses reach "Overview", "Briefing", "Trends" behind it, at 1280 and 360 px, English and Tamil. Escape works and the box opens with the password field focused. The Ask District IQ dialog does trap focus, so this one is the odd one out. Fix: trap Tab in `ConfirmBox` (or set `inert` on the console behind it). | `skeptic-g2-keys.json`, SK2-10 |
| SK2-11 | P2 | RC-48 | on a Tamil page the box is English: title, label, "Confirm", "Email me a code", the "why" line and the error texts (only "Cancel" is Tamil, by the page's own translator). | `skeptic-g2-keys.json`, SK2-11 |
| SK2-12 / SK2-9 | P3 | RC-47 | `queue-note.ts` writes Tamil text for the citizen and the officer, but `Cards.tsx` and `file-complaint/page.tsx` print only `.en`. On a Tamil officer page the note stays English. | `skeptic-g2-queue.json`, SK2-9, SK2-12 |
| SK2-2 | P2 | RC-51 | a memory file that is an object with a field of the wrong type is read as fine. Real run: `{"notes":null,"reminders":"x"}` is served by GET as is, and POST gives 500 (`d.notes is not iterable` in the server log); `{"notes":{"a":1}}` the same. Nothing is kept aside. | `skeptic-g2-memory.txt`, SK2-2 |
| SK2-3 | P2 | RC-51 | `{"notes":"abc"}`: the next note turns the text into one note per letter (`["a","b","c",{...}]`), and the file is overwritten with no copy kept. Fix: in `load`, treat a wrong-typed field as damaged (arrays for notes, reminders, recent, pins; objects for habits, pending, prefs). | `skeptic-g2-memory.txt`, SK2-3 |
| SK2-1 | P3 | RC-45 | `datasetWriteAllowed` compares the resolved path with a plain string, so `DATASET_DIR=DATA\Datasets` (the same folder on Windows or macOS) counts as "a folder of its own" and a dry-run server writes into the tracked `data/datasets`. Fix: compare `fs.realpathSync.native` of both, case-folded. | SK2-1 (Windows only) |
| SK2-6, SK2-7 | P2 | RC-16 | `parseWhen("02-Oct-2026")` and `("Oct-02-2026")` are read in the server's own zone: the trailing `-2026` matches the "named zone" pattern `[+-]dddd`. Asia/Kolkata gives 2026-10-01T18:30Z, UTC 2026-10-02T00:00Z, Los Angeles 07:00Z. This is the exact thing RC-16 was to stop, and the day-month-year with a month name is the usual Indian government form. Fix: require a zone offset to follow a time (`\d:\d\d(:\d\d)?\s*[+-]\d{2}:?\d{2}$`). | SK2-6, SK2-7 |
| SK2-8 | P3 | RC-16 | a source date that ends in `IST` ("Oct 2, 2026 10:00 AM IST", "2026-10-02 23:30 IST") is dropped (null): `IST` is in the list of named zones but `Date` cannot read it. Fix: strip a trailing `IST` and read the text as Chennai time. | SK2-8 |

## What I tried and could not break

- Step-up and the soft header (PB-316): with `x-diq-confirm: json` a guarded route answers 200 with `x-diq-confirm: required` and `cache-control: no-store`, with a forged grant the same, with a wrong-case value 428, without it 428; no action is done in any case (`tests/qa/pass4/skeptic-g2.stepup.mjs`, four guarded routes). The box fits a 360 px screen (buttons in view) and logs no console error in either language.
- axe critical and serious are 0 on `/`, the 404 page, the collector console, the Ask District IQ dialog and the Confirm box, in English and Tamil, light and dark, 1280 and 360 px (8 runs each); no page was wider than the screen in any of 280 runs.
- RC-16 in a browser: `/citizen`, the track page, `/officer` and `/collector` read word for word the same in Asia/Kolkata, America/Los_Angeles and Pacific/Auckland, no hydration error. The greeting follows Chennai time.
- `/dev/*` and `/api/dev/*` are 404 in the production build.
- Number gate (`figuresIn`): plain, comma, lakh, crore, Tamil, Arabic-Indic and full-width digits, spelled numbers, "dozen", "half" are seen. Not tried through the real answer path, so only noted, not counted as breaks: "3 mn", "5 bn" and "1'000" are read as the leading digit; Tamil "ஒரு டஜன்" / "அரை டஜன்" and Tanglish "irupathu", "mupathu" (spellings not in the table) give no figure; "nine thousand" and "eight hundred and one" are read as parts (9 and 1000; 8, 100 and 1), which can only block a true line, not pass a wrong one.

## Not checked, and why

- The claim in the citizen note that the update "runs every hour" (RC-47): I could not find the schedule in code, and the pinned snapshot does not refresh. Unverified.
- The citizen-side note after a real filing: filing needs the whole location form and I did not drive it; the source and the officer side are what is tested.
- PB-314 (u1 ledger: not fixed) is still open by the ledger's own word; not re-tested.
- Focus returning to the opener after the Confirm box closes: my run moved focus out of the box first, so the result is not usable.
- The lane f unit tests (ordinal, digits, number gate) and the G1 and G2 language changes belong mostly to skeptic 1; I looked at the number gate and `parseWhen` only.

## Process notes

- Nobody listed the officer console's second and later views, the 404 page, or the case drawer at phone width; all three had axe findings. Ask the fixer to extend `axe.mjs` to every tab and to the drawer.
- Test files only added; no source or existing test was changed. No push.
