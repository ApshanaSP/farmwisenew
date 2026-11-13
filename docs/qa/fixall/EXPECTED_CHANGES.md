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
