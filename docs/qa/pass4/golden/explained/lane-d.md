# Golden diff explained: baseline-abef9da to lane-d

Compared 3272 requests with 3272: 244 changed, 0 added, 0 removed, no status changes, 0 problems in the recording (2 answers with a 5xx are the same two as in the baseline; see the baseline manifest). The raw comparison is `docs/qa/pass4/golden/diffs/baseline-abef9da__lane-d.md`. The build id differs, as it must. Every changed route is explained below, by cluster. Nothing is unexplained.

| Route (requests changed) | What changed | Cluster |
|---|---|---|
| /api/collector/list (70) | every row gains `sla_due` (the due time the case page already used, so the explain text and the CSV date the deadline the same way); `status=overdue` lists now hold every open incident whose due time has gone (not only the pipeline's flag), so the first rows differ; `status=Resolved` lists incidents closed in the period, as the tile counts them | RC-34, RC-29 |
| /api/collector/overview (32), /api/collector/report (18) | `kpi.cur/prev/series.resolved` is what was closed in the window (weekly district 182 became 1,166, the count Ask District IQ already gave); `snapshot.overdue` and the severity rows use the one past-deadline rule (weekly district 339 became 505); rows gain `sla_due`; "most urgent" ordering and the reasons follow the date rule | RC-29, RC-34 |
| /api/collector/insights (21) | Trends: the 12 weeks and 6 months are whole buckets (the oldest week 315 became 1,083); `briefing.stats.overdue`, headline and `taluks.*.overdue` use the one rule; `briefing.stats.newsOnly` is the length of the list shown (77 became 73: headlines about another district are hidden once, up front); `handledByDepts` is open minus all that need the Collector | RC-29, RC-34 |
| /api/collector/export (4), /api/collector/assistant/export (3) | the action list has every open incident that meets the attention rules (weekly 293 became 392): the 400-row cap on the rows read is gone; `past_deadline` follows the due time | RC-29, RC-34 |
| /api/collector/audit (1) | the three audited export row counts (52, 293, 47 became 66, 392, 50) are the same change | RC-29 |
| /api/collector/search (4) | rows gain `sla_due` | RC-34 |
| /api/collector/incidents/[id] (19) | the key order changes because `sla_due` moved into the shared row; the two incidents the golden session resolves now show Resolved, `open` 0, a `closed_at` (the decision's time) and no "needs you" reasons, because the case page reads the decision overlay like every list | RC-34, RC-26, RC-27 |
| /api/collector/assistant/chat (7), /api/collector/thunai/agent (1), /api/collector/thunai/agent/round (10) | Ask District IQ and Jarvis say the new figures: past-deadline counts (one rule), the first line of a list is its most severe case (the sort default), "Incidents matching" is the incident count, resolved is closed in the period, and a list headed "most serious first" now has a takeaway because its first row is severe | RC-34, RC-29 |
| /api/map/ask (21) | Ask the Map's `overdue` flags and counts use the one rule (weekly 339 became 505 in the glance), and its decisions overlay uses the decisions with an effect | RC-34, RC-26 |
| /api/officer/overview (30), /api/officer/insights (1) | every feed carries its `kind` (so the officer's chip and list do not count generated feeds live); the department's own close no longer appears as "Collector verified" in `feedback` and `lastDecision`; the map legend counts every open grievance, not the capped pins; `board.kpi.*.resolved` as above; the officer's "Closed on time" is closing by the due time (14% became 13%) | RC-28, RC-32, RC-34, RC-29 |
| /api/collector/sources (1) | each feed has `generated`, and the three generated feeds have status `test` instead of `ok` | RC-32 |
| /api/rehearsal/impacts (1) | Rain's Traffic source line for the generated police and complaint records has kind `generated` and says so | RC-32 |

Nothing else changed: no route gained or lost a status, no body grew an unexpected field, and the 3,028 other requests are byte for byte the same after normalising.

## After the review fixes (lane-d to lane-d2)

A second recording, `lane-d2`, was made on a rebuilt server after the skeptic's breaks were fixed (commit caca8d5). Compared with `lane-d`: 3272 requests with 3272, **82 changed**, 0 added, 0 removed, no status changes, 0 problems (the same 2 answers with a 5xx as before). The raw comparison is `diffs/lane-d__lane-d2.md`. Every change is one cause: the one past-deadline rule (RC-34) now reaches rows that read the raw flag in code.

| Route (requests changed) | What changed |
|---|---|
| /api/collector/list (70) | every row gains `overdue` (open and past its due time, or flagged); nothing else moves. The Jarvis case cards read it |
| /api/collector/insights (8) | follow-up rows and attention rows say `overdue: true` for open incidents whose due time has gone (11 follow-ups, 2 attention rows in the recording); the count lines did not change, they already used the one rule |
| /api/collector/thunai/agent/round (3) | one list card row turns `overdue: true`, so its takeaway, spoken line and "Draft for the N past deadline" button say 2 where they said 1 (same case the list already calls overdue) |
| /api/map/send (1) | the drafted mail's text lists the case as "past its deadline" where it did not (3215 to 3500 characters) |

Nothing else changed: the other 3,190 requests are byte for byte the same after normalising. The voice, Tamil AM and yes-word fixes are in the browser bundle and the voice machine, which the recording does not run.
