# Fix-all round 2: changes the gate and the golden diff should expect

Round 2 is `claude/fixall2-a84a72`, cut from `1df591f0`, with `e8dfa08f` merged in. This list groups what a request or a test can now see
differently, so a golden diff against `p6-gate` can be explained by group. Round 1 (`bb50d5f6`) and the p7 lanes are already in `1df591f0`;
their changes are in `docs/qa/pass7/P0_FIXES.md`. Each line names its rows; the commits are in `git log 1df591f0..<tip>`.

## Collector console (`/api/collector/*`)
- **Open figures**: every open count now reads one definition, `OPEN_NOW`, the glossary's open rule. News complaints handed to a department
  are no longer open in some figures and not in others, so open totals and zone or department counts can drop by the routed ones.
  Rows: console-sync-10, reviewerE-02, reviewerG-01. Ask District IQ, the Briefing, its AI write-ups and the briefbook follow the same rule.
- **Effective status follows officer steps** (hunt2-ops-09). On an open case, the department's latest step after the latest decision gives
  approve → Assigned, action → In progress, send → Awaiting verification; a decision in the same second wins. The pinned snapshot's 5 officer
  steps are on incidents it does not hold, so pinned figures should not move.
- **Case page** (`/api/collector/incidents/<id>`): a new `officerStep` key (null with no step).
- **Filters**: an unknown `sev`, `status`, `scope`, `place` or `flag` is a 400, no longer dropped (hunt2-ops-04). A value with a stray space
  is read the same way by the check and the parser (reviewerB-06, already in `e8dfa08f`).
- **Bell** follows the zone, taluk and category filters, and groups by IST day (console-sync-11).
- **PDF and CSV**: one action list feeds both (console-sync-14); the cover and the list titles name the real scope, taluk and category
  included (console-sync-02, console-sync-12, reviewerE-03); the severe and high figures come from the tile's own breakdown (console-sync-09).
- **Labels**: "Resolved, last 24 hours / 7, 30, 90 days" instead of "today / this week" (console-sync-01, hunt2-ops-10); Ask's
  `overview_kpis` uses the same wording (reviewerE-04). My Tasks says "High severity" for High (pass4-open-03).
- **Decisions**: an escalate naming another department is a 409 (hunt2-ops-03).
- **Search** on the AWS store: `LIKE ?` now carries `ESCAPE char(92)`, so `_` and `%` match literally (officer-day-22).

## Officer console (`/api/officer/*`)
- **Tabs**: a non-severe case the pipeline marks Awaiting verification is under In action, not Sent to Collector (officer-day-29).
- **Next step**: `next` is "close" for a non-severe case in action (officer-day-26).
- **Detail**: the grievance's deadline (officer-day-10) and the citizen's full complaint text up to 400 characters (officer-day-17).
- **Feedback**: rejects and resolves are named as such, from every decision, not the newest 8 (hunt2-ops-08, officer-day-05).
- **Order**: steps by step_id, decisions by decision_id, the decision first in the same second, in the overlay, the drawer and the citizen's
  tracker (officer-day-15, officer-day-24, reviewerD-01). `closedByDept` is false after a later send-back (reviewerD-02).
- **Board**: the Resolved tile and its list use one definition, and it is labelled "Resolved, reported in last N days" (officer-day-13,
  fixall-board-resolved-01).
- **Search** finds a case by a complaint number filed into it, grievance events only (pass4-open-07, reviewerD-03).
- **Batch instructions** show only to their own department (reviewer4-03).

## Ask District IQ and Jarvis
- **Officer lock**: closed for `developing_stories`, `search_records`, `incident_story`'s other matches, `hotspots` (now the department's
  place breakdown), the "show" path, news answers and zones, cluster groups, and incidents with no lead department, and incident ids on department-held tables (fixall-lock-01..06, p7-askiq-writer-lock-03,
  reviewerF-06, reviewerF-07, reviewer2-02). An officer's answer can hold fewer rows than before. Market price tables are shared with
  officers (reviewer4-05).
- **Figures**: an answer after a data round must cite one of the round's figures. A chat, do or refusal reply that cites none falls back to
  the plain wording (redsec2-07, reviewerF-01). The writer's fence turns `<` and `>` into ‹ › (reviewer5-11). The open-to-closed answer adds
  up, with the routed count named (reviewerG-05).
- **Places** are said only as the gazetteer's name, or else the zone. A free-text place is no longer read out (redsec2-08, reviewerF-02).
- **Tamil**: the body names, singular and plural, and the colon spacing in case lists and briefs (pass4-open-12, pass4-open-13, reviewerF-05).
- **Read-only MySQL account** (`scripts/create-assistant-ro-user.sql`) now grants `officer_steps` when the table exists (reviewerG-04).
  Re-run it after `setup:officer`.

## Citizens and the public
- **Filing** (`POST /api/complaints`): 10 per account per hour and 30 a day, counted before the body is read. With a trusted proxy there is
  also 30 per address per hour; with none, a district-wide 1,000 per hour. The 429 names the limit hit. The body cap is 32 KB (hunt2-sec-12,
  reviewerE-01, reviewerG-06).
- **Mobile code request** answers 503, not "We have e-mailed you a code", when no mail went (hunt2-sec-05).
- **/track** is in Tamil for a Tamil petitioner, with a language switch, `ta-IN` dates and Tamil department names; an online complaint gets
  its own note and due date (hunt2-desk-15, hunt2-desk-06, P5-025, reviewerC-08). A citizen's video is served with byte ranges: `Accept-Ranges`, 206 for one range, 416 for a bad one, and 200 for several or `If-Range` (p7-desk-and-accounts-10).
- **The citizen's tracker** shows IST times on any server clock (officer-day-12) and promises Collector verification only for severe cases
  (officer-day-06).
- **Aadhaar mask**: 12-digit runs in any grouping or separator that pass Aadhaar's rules (first digit 2–9 and a valid Verhoeff check digit)
  are masked. Unbroken and 4-4-4 runs are masked as before, whatever the first digit. "91" plus a mobile number is left whole. Only text
  stored from now on changes (redteam-gate-03, reviewerC-02, reviewerC-03, and the lead's follow-up 5f439230).

## Petition desk (Manu)
- **Repeat check**: people are told apart by mobile and address (the street rule); a person's own petitions get their own limit; a pair
  written in two scripts says "could not be told" and offers the case (hunt2-desk-03, -10, -14, reviewerC-05, -06).
- **SMS states**: an approval that fails after commit still sends "registered"; the orphan sweep skips petitions with no valid mobile; a
  plain failure after the 20 s limit is retried; a live connect timeout is retried; a late success in test mode stays 'unsure'
  (reviewer1-03, -06, -09, reviewerC-01, -04). The mailer's transport has 8 s connect and greeting timeouts.
- **Desk fields**: an invisible name is refused; Tamil digits are accepted in pincode and ward (hunt2-desk-02, hunt2-desk-07).
- **Cases rebuild** follows `attached` and upload order (reviewer1-07). Two pass 7 SQLite test schemas got the column (d2e68478).

## Data Studio
- **Uploads**: `readFormCapped` accepts only the content types a route expects; anything else is a 415 or 400 before parsing, and
  urlencoded parsing is linear (p7-studio-egress-20).
- **Parsing** (in the reader process; bundle rebuilt): `.xls` of plain text is unreadable, old Excel 2–4 is read again, zip64 workbooks are
  read, and KML, HTML, XML, Word tables and CDATA are linear. OCR: ICC pages are included, palette and Separation pages are skipped, a soft
  mask is not a page, and big pages are downscaled (pass4-open-05, reviewer5-05, -10, reviewerF-03, -04, -08, reviewer2-13, -15, reviewer4-04,
  fixall-studio-lazy-01, -02).

## Tests and tooling
- Pass 7 reader-limit tests use a test-only seam (`tests/qa/pass7/studio-parse/reader-seam.cjs`), loaded only through `NODE_OPTIONS`.
- `freeze-clock.cjs`: deterministic date functions; `unixepoch()` stays INTEGER (round 1, reviewerB-07).
- The QA oracle and grader (`grade.mjs`) apply officer steps by the same rule as the effective status (reviewerG-07).
- `lane-a.pass4.test.ts`'s every-locality test has its own 60 s limit (P5-035).
- Existing test expectations changed, each with its reason in the commit: `sms.pass6.test.ts`, `manu.sqlite.test.ts` (2),
  `clean.aadhaar.fixall.test.ts`, `round.test.ts`, `compile.pass7.test.ts`, `lock.break.test.ts`, `paddle.test.ts`, `decisions.sqlite.test.ts`,
  `map/safety.test.ts`, pass 7's `lock.break.test.ts` (a skipped test now asserts the id join), four Jarvis place expectations, and `online.sqlite.test.ts`'s filing limit.

## Needs a live check (not provable in the gate)
- **Browser**: the drawer's Deadline fact and the red footer, the Board tile, `/track` in Tamil at 360 px, the bell in Tamil, the PDF
  export, the case-page step tag, the E-03 captions, Jarvis's question list on a phone, and axe on the Manu Desk.
- **Live services**: a real model (the "show" decision, figure citing), a mail server that is down, an MSG91 connect timeout, PaddleOCR, the
  read-only grant on real MySQL, and the AWS start-up path of the step-table check.

## Round 3 (`claude/fixall3-a84a72`, from `43c1698a`): pass 4's real-path suite
- **App**: Ask District IQ says an order to close, reopen or export cases is not done (the `not_done` card) before the warnings, map and
  Data Studio lanes read anything (SKG1-30, `fixall3-skg1-30`). Before, a Studio upload whose name shared a word with the order ("Rtf Export")
  answered "export all complaints to excel" with its row count, and an order with a distance or a warning word could reach those lanes.
- **Test servers and runs**: a pass 4 test server (`qaEnv`) and a `vitest.qa4.config.ts` run keep Data Studio uploads in their own
  `data/aws-cache/qa/srv/<instance>/studio`, no longer the worktree's `data/studio` (redteam-final-5's upload stayed there after each gate).
- **Harness and oracle**: `same-number.mjs` asks the rules lanes for the console's Daily as "in the last 24 hours" and checks "today" against
  the calendar day; the departments' "to check" figures are read against My Tasks; `pinned.mjs` counts open by OPEN_NOW and the officer's stages
  by `STAGE_SQL`. Reasons in `docs/qa/pass4/evidence/same-number.md` ("Since this was recorded").
- **Other test fixes**: skeptic-b freezes the clock; scan-findings reads the dev-code helper's new call and its gate; audit-ui_honesty waits for
  the tab's own slot; the grader's three tools lost their shebang line (vitest could not load them).
- **Port defaults**: model-lifecycle (3142), audit-ui_honesty (3134) and same-number (3120) start their own server on a fixed default port;
  `QA_MODEL_PORT`, `QA_UI_HONESTY_PORT` and `QA_SAME_NUMBER_PORT` move them. Round 3 ran them on 3111, 3112 and 3110.

## Round 4 (`claude/fixall4-a84a72`, from `fe7c15d7`): Ask the Map's time words (fixall3-map-today)
Ask the Map now reads time words with `src/lib/period/read.ts`, the reader Jarvis and Ask District IQ use. Commits 9aecf063 and 42a22525, then
6f4efc6e for the 19 bugs two reviews found in those two commits, 90a11f0b for the 12 a second review found in 6f4efc6e, and 5b8c5d76 for
the 12 a third review found in 90a11f0b (when the map is not sure of a time, it does what `fe7c15d7` did). Frozen at `5b8c5d76`.
- **Calendar words**: "today" is the calendar day since midnight IST, "yesterday" the day before, and "last week / last month / last quarter"
  the calendar week (Monday to Sunday), month or quarter before. Before, the map read them as the last 24 hours and the last 7, 30 and 90 days.
  A map answer for "today" is labelled "today, since midnight", and its count can drop by the incidents from yesterday evening.
- **Unchanged rolling windows**: "this week", "last 7 days", "this month", "last 30 days", "in the last 24 hours" and "since yesterday".
- **New readings**:
  - "last 36 hours" is 36 hours back.
  - "in September", "on 20 Oct", "since 1 October" and "the last week of September" are those days, labelled in the reader's words.
  - "open for more than 30 days" means the incidents reported before then.
  - Counts past the records ("last 12 months") are that many days, at most a year.
- **Refusals**: only a time the records cannot reach gets a "say" answer: "last year", "next week", "tomorrow", "அடுத்த வாரம்". Before, these got
  the 7-day default. Times the reader does not model but the records hold ("since Monday", "a few days", "fortnight", "two weeks ago") keep the old
  behaviour: the 7-day default, flagged, with the words left for the AI.
- **Right now**: "right now", "currently", "at present", "as of now", "at the moment" and தற்போது mean open, with no reporting window, on every path. A
  hotspot or a news question then holds open incidents only. A plain "now" ("by ward now") is not a time.
- **Comparisons**: "up or down", "than yesterday", "compared with last week", "pona maasatha vida" and "நேற்றை விட" are a change between two
  equal rolling windows, as a new question or as a follow-up ("up or down?" compares the answer's own window). "up from last month" compares
  the last 30 days with the 30 before. A whole calendar period said as the window ("did flooding go up last month") is compared with the one before.
- **Bounds**: a bound and its time ("before yesterday", "older than yesterday", "excluding today") are taken out, and the rest is read, so "the last
  30 days excluding today" is the last 30 days. A bound alone leaves no window, and its words stay unread for the AI or the "not used" note.
- **Comparisons kept apart**: two areas compared ("Adyar vs Velachery, higher or lower?") stay an area comparison. A follow-up comparing with a month
  or date ("compared to August", "vs 20 Oct") goes to the AI, never a plain period edit. The comparison follow-up respects the 8-step limit.
- **Unread words**: the words of a time the map read no longer count as unread. "in the last 24 hours" and "since yesterday" no longer go to the
  AI, and the "Not used from your question" notes lose their time words.
- **Model plans** (fitModelPlan):
  - Any time the question names wins over the model's period.
  - A model's change gets the same two equal windows.
  - A follow-up keeps a date range the model's flat form cannot carry.
  - The flat form gains `period_calendar`, and the prompt has three new lines.
- **Plans**: new period kinds `day`, `week` and `quarter` with an offset, beside `month`. `range` gains an optional `label`, `said` (the reader's
  spec) and `age_hours`, and a range with them is put on each run's own now: a saved "last 36 hours" or "since 1 October" view counts from the
  time it is run. `RouteEnv` gains `now`.
- **Words**: change headlines and trace notes read "yesterday", "in the last calendar month" and "in September". A tie reads "the same as in the 7 days
  before", where it used to read "the same as the the 7 days before". The week label is "last calendar week, Monday to Sunday", and the panel's
  headline split handles a period with brackets of its own.
- **Exports**: the CSV has a `# Window:` line and the GeoJSON a `window` property, giving the dates the rows were counted on.
- **Tests and harness**:
  - `route.test.ts`: five plans are now the calendar day.
  - `map.golden.ts` asks the console's Daily as "in the last 24 hours".
  - `same-number.mjs` asks the map in the rules lanes' words and checks the map's "today" against the oracle's rows since midnight.
  - New tests: `periods.fixall.test.ts`, `periods2.fixall.test.ts`, `periods3.fixall.test.ts` and `periods4.fixall.test.ts`.
- **Golden master** (from the round 4 gate-impact reviews):
  - S0 "today" (collector and officer A): the plan, label and count change, and so do the 10 requests built from S0's plan.
  - S17, Tamil "today": the calendar day, a Tamil label, and a shorter unread note.
  - S15 "from last month": a change of the last 30 days against the 30 before, as before.
  - S36 "Nethu irundhu": the last 24 hours instead of the 7-day default.
  - S7, S18 and S30: only the "Not used" note changes.
  - The golden map exports of sentences 1 and 2 gain the `# Window:` line (and the GeoJSON `window` property).
  - A change between two 24-hour windows says "the 24 hours before", where it said "the 1 days before".
