# Golden master: p7-gate (combined branch) against p6-gate (pass 6's last green recording)

**Final recording, on `7e815c53`** (round 3 merged): recorded on the final gate's production build, right after the gate (the gate's
clean-up step had put back the previous manifest). The same 332 requests changed, the same 7 added and 11 removed, with the same
differences as on `65f36ea1` below, except the map position of the complaint the recorder files itself (the noise floor). Round 3 changed
nothing this recording sees; the explanations below hold for it unchanged.

**First recording, on `65f36ea1`.** Recorded by `tests/qa/pass7/gate.sh` on the production build (serial, pinned snapshot, frozen clock): 3,273 requests, no 5xx,
no problems, 4 gaps (routes with an id in the path the plan has no ids for: `/api/manu/case/[incident]`, `/api/manu/petitions/[id]`,
`/api/manu/photos/[name]`, `/api/profile/photo/[name]`; pass 6 reported the first three the same way). The recordings' bodies stay in the
gitignored `data/aws-cache/qa/golden/`; the diff is `docs/qa/pass4/golden/diffs/p6-gate__p7-gate.{json,md}`.

Noise floor (`p6-base` against `p6-base2`, nothing changed between them): 3 requests differ (the complaint the recorder files itself).
Against `p6-gate`: 332 requests changed in 24 routes, 7 requests added and 11 removed (all `POST /api/collector/thunai/agent/round`: the
plan's follow-up rounds are built from the previous answers, which changed). Every change below is explained by a fix; none is unexplained.

## Status changes (10 requests)
| Route | Change | Why |
|---|---|---|
| `GET /api/collector/list?sev=bogus`, `?status=bogus`; `GET /api/officer/grievances?sev=bogus` (both officers) | 200 -> 400 | an unknown filter value is refused and named (pass 6 fixall; one reader per filter, reviewerB-06) |
| `POST /api/collector/decisions` (reopen) | 201 -> 428 | a reopen asks "Confirm it's you" like verify and reject (hunt2-ops-01, option A) |
| `POST /api/officer/grievances/INC-20261106-0B725B/report` | 428 -> 409 | a Medium case of the officer's own department: "Only severe grievances go to the Collector" is now said before the password is asked (officer-day-16, pass 6 fixall) |
| `POST /api/officer/grievances/INC-20261106-31532C/report` (officerA, GCC-SWM) | 428 -> 404 | the case is GCC-ELE's: another department's case is refused before the password is asked (officer-day-16) |
| `GET /api/collector/studio/[id]?export=...` (3) | 200 -> 428 | exporting a Studio dataset asks "Confirm it's you" like every other export (pass 4 redteam-final-5) |

## Body changes, by group
| Group (routes, requests) | What changed | Why |
|---|---|---|
| Case pages: `incidents/[id]` (19) | new `officerStep` / `incident.officer_step` (null with no step), 2 statuses | the effective status follows officer steps (hunt2-ops-09, pass 6 fixall); its EXPECTED_CHANGES names this |
| Open figures: `insights` (21), `pattern` (7), `map/ask` layer counts (41) | `open_now` fields, layer counts | OPEN_NOW everywhere: routed news complaints no longer count as open (pass 6 fixall) |
| Collector overview, report, stories (31, 18, 18) | `stories.threads[*].records` and `.placed` added; map pins; `deptNav[*].unverified`; bell ids | news threads now carry their records and placement (pass 6 fixall); pins and legend from one query (hunt2-ops-11); Departments' unverified is My Tasks' rule (console-sync-07); OPEN_NOW |
| Officer lists and pages: `officer/grievances` (73 more), `officer/grievances/[id]` (11), `officer/overview` (29), `officer/search` (6) | `breached` on every row, `stage`, `rejected`, `next`, map pins' stage, bell | officer rows show the deadline flag; stages follow the officer's own steps and send-backs (officer-day fixes, reviewerD-01/02, pass 6 fixall); the officer's window (hunt2-ops-05) |
| Jarvis: `thunai/agent/round` (24), `thunai/agent` (4) | spoken and shown text, stage blocks, next-step ids | the one period reader ("the last 24 hours", calendar spans, day ranges), Tanglish rankings, the afterplan rule (P6-024), privacy of spoken lines (audit-privacy_injection-4) |
| Ask District IQ: `assistant/chat` (11), `assistant/sessions/[id]` (2) | answer, voice summary, headline, scope line | the writer's figures from typed values only (reviewer5-06), the shared period reader and named spans (P6-022/23, p7-rules-periods-01/02), the tighter officer lock |
| `collector/audit` (3) | fewer and other rows | citizens' rows are not shown to the Collector (pass 4 redteam-final-1, pass 7 `9023349`) |
| `auth/security` (1) | the account's events | sign-out of other devices now asks "Confirm it's you" and is logged (hunt2-sec-10, pass 6 fixall) |
| `POST /api/complaints` (1) | `queueNote` | the "already in the officer's queue" note only when the case reached the queue (reviewerB-04) |
| `GET /api/complaints/[code]` (1) | new `checker: "department"` | the tracker says who checks the case (pass 6 fixall) |
| `GET /api/collector/search?q=<the recorder's own complaint>` (1) | position, severity Medium -> Low with a reason, deadline | the complaint the recorder files itself (the noise floor), graded the way the pipeline reads text (officer-day-02) |
