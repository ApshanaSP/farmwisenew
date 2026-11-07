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

## RC-29: counts from capped or grouped queries, partial buckets, reversed sort
- Root cause: five separate habits that make a figure depend on how it was read. The attention rules ran over the top 400 open
  rows (and "routine" was open minus the six shown); the news-only line counted a list cut at 60 while the page and the figure used
  other sets (77, 60, 56); "Incidents matching" took the number of groups; the Resolved tile counted incidents reported in the week and
  closed now (182) where Ask District IQ counted incidents closed in the week (1,166); the Trends window was a rolling 84 days that cut
  the oldest Monday-to-Monday week; Ask District IQ's list tool defaulted to descending, which is the least severe first for a rank where
  Severe is 1. Also `v in PERIODS` is true for "constructor" and "__proto__" (500 on the routes).
- Why tests missed it: tests compared a shown list to itself; there was no district-level oracle on the same build.
- Fix: intel.attentionRows is the one read behind the PDF, the CSV and the Briefing (no cap). scopeWhere can take a closed-time window
  and the Resolved tile and the Resolved list filter use it. The news-only set is one array (headlines about another district dropped
  once, up front). Trends use whole buckets. NATURAL_DIR gives each list sort its own natural direction. zone_profile with a
  department asks for the zone's own snapshot. A department's emerging patterns need a report of its own behind them and show its own
  count. parsePeriod and officer stages use hasOwnProperty.
- Class guard: effective.guard.pass4.test.ts "RC-29 class guard"; parse-period.pass4.test.ts fails on `x in CONSTANT_MAP`; a new
  RC-29 block in audit-narrate_and_figures.test.ts compares the Briefing, PDF, CSV, Resolved tile and Trends with the store.
- Not fixed: PB-209 (the AI brief's facts end at the top of the hour, the tile at now). The hour is deliberate: the brief is cached on
  its facts text, and a daily window that slides every minute would ask the model again each minute. Needs the owner to choose
  (cost against one-page consistency). The Jarvis "All cases" total (PB-065, second half) reads data.total in thunai/screens.ts (lane c);
  the tool now also returns data.incidents.

## RC-32: honesty labels
- Root cause: a feed's honesty was a property of the Collector's feed overlay only (it knew `source_health.kind = synthetic`); every other
  screen that lists or counts feeds read the status alone. Data sources (the only list the console has) said Healthy for the three
  generated feeds and "8 of 12 sources healthy ... collected every hour"; Rain's Traffic tagged generated police and complaint records
  REAL; the sign-in chip had a pulsing dot on a static sentence; the Tamil PM clock phrase said மதியம் (noon) for 6 PM.
- Why tests missed it: the fix for BUG-006 went into FeedsBody, which no screen renders; tests read the component, not the screens.
- Fix: listSources carries `generated` and a `test` status from the feed's kind; the Data sources list says Test data, counts only live
  sources and says generated feeds are not collected. Rain Traffic's source line is tagged generated. The sign-in chip has a still dot.
  Tamil PM is பிற்பகல் (the formal PM). The Officer chip and tooltip use each feed's kind (the previous agent's data.ts change) and the
  tooltip no longer says every source is collected hourly.
- Class guard: ta.pass4.test.ts (no part-of-day word that fits only some hours); the audit-ui_honesty walk tests (browser, not run here).
- Not fixed: audit-ui_honesty-4, -5, -7 are the owner's decisions (how test data is described). audit-ui_honesty-12 (a localhost link
  as a source) and the walk itself could not be run here.

## RC-33: Jarvis client
- Root cause: the guards tested a string the code never builds. The click guard tests `name + " " + text`, so a bare Yes button reads
  "Yes Yes" and no pattern for "Yes" matched; the Data card's Yes had no data-jarvis-never; Add to dashboard was not in the keep list;
  the yes list was exact (no ஆமாம், no "yes please"); a spoken stop was the same as "wait" (it never cancelled a turn the machine did not
  know, e.g. a typed question), and a bare stop did not pass the address gate outside the 20 s window; the captions path skipped the
  self-hearing check Whisper's words get; the tray told the Collector to say "confirm N", which Jarvis refuses; the Approve on live drafts
  opened one panel and dropped the rest.
- Why tests missed it: the guard's own unit test used "Yes" alone, not "Yes Yes".
- Fix: guards.ts keepsSomething tests the name, the text and both; KEEP_BUTTON accepts the repeated word and the dashboard pin; the yes
  list accepts ஆமாம் and a polite tail; addressed.ts isStopWord (a bare stop needs no name) and turn.ts adds cancelTurn on a stop word;
  fromCaptions checks selfHeard; cancelTurn clears the reply; the tray hint says to tap; live drafts open one panel and the rest wait;
  isReflex treats "show numbers" like "hide numbers"; accessibleName adds the word on the control to its title; quickScreen leaves a
  sentence with "click" to the agent; each Confirm box has its own key and stands above Jarvis's screen.
- Class guard: guards.pass4.test.ts (the guard on name, text and both, and no joined-string call), the 29 audit-client_browser tests
  (they read the real source). The browser walk (tests/e2e/pass4-client-fixes.spec.ts) was not run here.
