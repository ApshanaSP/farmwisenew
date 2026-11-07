# Lane d: fixer notes (Console, officer, citizen and honesty labels)

Written as each cluster is committed. Branch claude/p4-lane-d. Plain words.

## RC-26: decisions dropped, rules differ across roles, reject reason kept after reopen
- Root cause: three separate rules for "what does the latest decision do". The same-decision guard in the decisions route looked
  at the last two minutes only and asked "did this person already make this decision", so resolve, reopen, resolve (three real
  decisions) lost the third, and a second Send back on a new report was lost too. effective.ts treated verify and escalate as
  "no effect" while the officer page and the citizen tracker treated Verify and close as closing, so one incident was open on
  the console and closed for the officer. The citizen's complaint kept the stored reject reason after the Collector reopened it.
- Why tests missed it: the dedupe test only sent the same decision twice in a row; no test did a sequence across the three
  readers (console, officer, citizen) on one incident.
- Fix (mechanism): effective.ts is the one table of what each decision does (resolve, verify, reject close; reopen opens; note
  and escalate have no effect) and the latest decision WITH an effect decides, in JS and in SQL. The route's guard now treats a
  decision as a double click only while nothing came after it (no later decision, no later officer step), and an escalate to
  another department is always new. complaint-progress.remarksFor drops a rejection's reason once the complaint has moved on.
- Class guard: decision-matrix tests (DECISIONS-1,2,3,18), effective.test.ts and the property test in misc.props.pass4.test.ts
  compare SQL and JS from the same table; model-lifecycle TIMECONC-1 runs the sequence over HTTP.

## RC-27: readers use the pipeline flag instead of the decisions overlay
- Root cause: the overlay existed in only some readers (tiles, lists). Hotspots, the Briefing Book, the resolved counts, My
  Tasks, the CSV and report, the search index and model-written queries each read is_open / status_std / verified / closed_at
  raw, so a Collector's resolve moved the tile and not the other 11 places.
- Why tests missed it: each reader was tested against its own SQL, never against "make a decision, then ask every reader".
- Fix: effectiveSql now also gives closedAt and verified and takes the table alias; every figure reader uses it. The compile
  step maps incidents.is_open, status_std, verified and closed_at in a model-written query to the effective expressions. The
  search index records carry the decided state and the open-only filter is applied after the live state is laid on.
  scripts/create-assistant-ro-user.sql grants the read-only assistant user only the four decision columns it needs.
- Class guard: src/lib/collector/effective.guard.pass4.test.ts fails on any raw pipeline flag in a figure file, outside a short
  listed set with a reason each. Sweep: docs/qa/pass4/sweeps/RC-27.txt.

## RC-34: two definitions of overdue and on time
- Root cause: "past deadline" was the pipeline's sla_breached flag on the tiles and lists, but a date comparison (due time before now) on
  the case page and in the explain text, so 914 open incidents were "missed" on the case and absent from the tile and list. "Closed on
  time" was the same flag negated, and the flag is not about closing: an incident closed months late still counted as on time (app 6,585
  of a true 2,923 in 90 days; police 77% on the tile against 8% by dates).
- Why tests missed it: no test compared closed_at with sla_due_at, or the case page with the list.
- Fix: metrics.ts pastDueSql(now, alias) (flag OR due time gone by the console's time) and closedOnTimeSql(closedAt) (closed by the due
  time, using the effective closed time) are the only rules; every tile, list, snapshot, brief, officer tile and Ask District IQ count uses
  them. OPEN-7 (the pipeline's flag) is not patched in the data; the console just no longer depends on it.
- Guard: effective.guard.pass4.test.ts "RC-34 class guard" fails on any raw sla_breached in a figure file; metrics.test.ts tests both
  functions, including that a bad time is never put in SQL. Sweep: docs/qa/pass4/sweeps/RC-34.txt.
