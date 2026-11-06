# Decision matrix (QA pass 4)

Run on the production build, on a throwaway copy of the pinned snapshot (build `2026-11-06 18:21:19|76734f481810`), through the real routes as the right role. Period read: last 7 days. The console's now: 2026-11-06 18:08:00. Each action went to a fresh real incident. Every surface was read before, right after, and again 65 seconds after, so a cache is not mistaken for a gap.

No model was called. The server has no model key, so Ask District IQ and Jarvis answered from their code lanes. The model-written query and the search index were tested in the permanent test with a fake model and a fake embedding at the boundary, and it says so below.

Raw data: `decision-matrix.json`. Script: `chennai-grievance-portal-main/tests/qa/pass4/decision-matrix.mjs`. Permanent test: `chennai-grievance-portal-main/tests/qa/pass4/decision-matrix.test.ts`. Findings: `../findings/decisions.json`.

## What "as designed" means

Each expected move comes from these lines of the code. Where two of them disagree, the cell follows the status rule and the conflict is a finding.

| What | The code says | Where |
|---|---|---|
| The rule for status | "The latest decision other than a note decides: resolve and reject close the incident, reopen opens it; verify and escalate leave the status as it is (a verify after a resolve therefore shows the pipeline's status, as the list does)." | `src/lib/collector/effective.ts` |
| One rule, at once | "One rule for the row lists (overlay in intel.ts) and the SQL behind the KPI tiles and list filters, so a resolved incident leaves 'Ongoing' on the tile at the same moment it shows Resolved in the list." | `src/lib/collector/effective.ts` |
| Every number | "'Open' is the Collector-adjusted flag (EFF), as on the tiles and lists, so a resolved incident drops out of every number at once." | `src/lib/collector/intel.ts, snapCommon` |
| The route | "The console shows them at once; the pipeline applies them on its next build." | `src/app/api/collector/decisions/route.ts` |
| Citizens | "verify / resolve / return / reject reach the residents' trackers (complaint-progress.ts); notes and escalations do not" | `src/app/api/collector/decisions/route.ts` |
| The citizen's words | verify and resolve: "Verified by Collector", "The Collector's office checked the work and closed the complaint." reopen: "In Progress". reject: "Rejected". The officer's close: "Resolved by Department". The officer's send: "Completed - Pending Collector Verification". | `src/lib/complaint-progress.ts` |
| The officer's stages | "The latest of those wins"; the stage is 'verified' after verify and resolve, 'action' after reopen, 'closed' after reject; escalate and note are not read. | `src/lib/officer/data.ts, STAGE_SQL` |
| The officer's close | "close is the department's own verification, recorded as a resolve decision by the officer so every console shows it closed." | `src/lib/officer/data.ts, recordStep` |
| The officer's feedback | "The Collector's verify / return decisions on this department's grievances"; the bell says "Collector verified" or "Collector returned for rework". | `src/lib/officer/data.ts, OfficerApp.tsx` |
| Ask District IQ | "so every number the assistant states is a number the console shows" | `src/lib/assistant/tools.ts` |
| The words the Collector sees | verify: "Verify and close"; reject: "Return to the department"; the toast after a verify: "The citizen will see it closed." | `decisions/route.ts, CollectorApp.tsx` |
| A double click | "a double click sends the same decision twice: the one just made by the same person on the same incident is kept, not recorded (and audited) a second time" | `src/app/api/collector/decisions/route.ts` |
| The map | "the Collector's decisions (which close or reopen incidents) are laid on top at every question, with the same rule as the console (effective.ts), so a resolved incident leaves the map at once" | `src/lib/map/world.ts` |
| My Tasks | "Such a report always comes to My Tasks (the officer asked for the Collector's check), whatever the period" | `src/lib/collector/intel.ts` |

## The matrix

**moved**: moved as designed, at once. **moved, late**: moved as designed, but only after a cache ran out. **still**: did not move, and it should not. **DID NOT MOVE**: should have moved, and did not. **WRONG**: moved in a way design does not say, or shows something design does not say. **n/a**: the surface has nothing to read for this incident (no complaint on it, no officer). A cell shows the worst of the figures read on that surface; the list under the table names each one. The verify row says "still" on the console because that is what the status rule says: the words shown to the Collector, the officer and the citizen say closed, and that conflict is finding DECISIONS-2.

| Action | Console figures | Console list | Incident page | Map pins | Alerts and bell | Briefing | Trends | Officer overview | Officer grievances | Officer insights | Citizen tracker | Ask District IQ | Jarvis | Search | Exports |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| resolve | moved | moved | moved | moved, late | moved | **DID NOT MOVE** | **DID NOT MOVE** | moved | moved | moved | moved | **DID NOT MOVE** | **DID NOT MOVE** | **DID NOT MOVE** | moved |
| resolve (severe) | moved | moved | moved | moved, late | still | **DID NOT MOVE** | moved | moved | moved | moved | moved | **DID NOT MOVE** | moved, late | **DID NOT MOVE** | moved |
| reject | moved | moved | moved | moved, late | still | **DID NOT MOVE** | moved | **DID NOT MOVE** | moved | moved | moved | **DID NOT MOVE** | moved | **DID NOT MOVE** | moved |
| reopen | moved | moved | moved | moved, late | still | **DID NOT MOVE** | moved | moved | moved | moved | moved | **DID NOT MOVE** | moved, late | **DID NOT MOVE** | moved |
| reopen (severe) | moved | moved | moved | moved, late | still | **WRONG** | moved | moved | moved | moved | n/a | **DID NOT MOVE** | moved, late | **DID NOT MOVE** | **WRONG** |
| verify | still | moved | moved | moved | still | still | still | moved | moved | moved | moved | still | still | moved | still |
| escalate | still | moved | moved | still | still | still | still | still | moved | still | still | still | still | still | still |
| note | still | still | moved | still | still | still | still | still | still | still | still | still | still | still | still |
| officer close | moved | moved | moved | moved, late | still | **DID NOT MOVE** | **DID NOT MOVE** | **WRONG** | moved | **WRONG** | moved | **DID NOT MOVE** | moved, late | **DID NOT MOVE** | moved |
| officer send | moved | moved | moved | still | still | moved | still | moved | moved | still | moved | moved, late | still | moved | **WRONG** |

### The incidents

| Action | Incident | Department | Severity | Pipeline status | Complaints | Why this one |
|---|---|---|---|---|---|---|
| resolve | `INC-20261103-1D9CB6` | GCC-ELE | High | In progress | 1 | open, high, past its deadline, on the action list, in a hotspot |
| resolve (severe) | `INC-20261102-3B27A7` | PWD-WRD | Severe | In progress | 1 | open and severe: moves the severe figures |
| reject | `INC-20261105-45E2DD` | GCC-ELE | High | Under review | 1 | open, high, new at the department |
| reopen | `INC-20261103-0559E9` | GCC-ELE | Medium | Resolved | 1 | the pipeline closed it as resolved; has a citizen's complaint |
| reopen (severe) | `INC-20261103-FB02F4` | PWD-WRD | Severe | Resolved | 0 | the pipeline closed it; severe, so the action list should bring it back |
| verify | `INC-20261105-0476D7` | PWD-WRD | Severe | In progress | 3 | severe (the route refuses others), three complaints |
| escalate | `INC-20261104-EA19E3` | GCC-SWM | High | In progress | 1 | open, high, past its deadline |
| note | `INC-20261103-8989A6` | GCC-SWM | High | Awaiting verification | 1 | open, high, awaiting verification |
| officer close | `INC-20261102-8EC358` | GCC-SWM | Medium | In progress | 2 | not severe, in action, two complaints, in a hotspot |
| officer send | `INC-20261103-53934E-1` | PWD-WRD | Severe | In progress | 4 | severe: goes to the Collector's My Tasks |

### What each gap and each late move is

**resolve** (`INC-20261103-1D9CB6`)

- Map pins: ask.total: 110 to 109, wanted -1 (moved_late, right after: 110)
- Briefing: book.item.status: "In progress" to "In progress", wanted "Resolved" (did_not_move)
- Briefing: book.resolved: 1166 to 1166, wanted +1 (did_not_move)
- Trends: hotspot.open: 6 to 6, wanted -1 (did_not_move)
- Trends: pattern.row.status: "In progress" to "In progress", wanted "Resolved" (did_not_move)
- Ask District IQ: briefing.open: 1167 to 1166, wanted -1 (moved_late, right after: 1167)
- Ask District IQ: chat.resolved: 1166 to 1166, wanted +1 (did_not_move)
- Ask District IQ: departments.open: 84 to 83, wanted -1 (moved_late, right after: 84)
- Ask District IQ: followups.open: 84 to 83, wanted -1 (moved_late, right after: 84)
- Ask District IQ: kpis.complaints: 692 to 691, wanted -1 (moved_late, right after: 692)
- Ask District IQ: kpis.ongoing: 1167 to 1166, wanted -1 (moved_late, right after: 1167)
- Ask District IQ: kpis.resolved: 182 to 183, wanted +1 (moved_late, right after: 182)
- Ask District IQ: search.open: true to true, wanted false (did_not_move)
- Ask District IQ: search.status: "In progress" to "In progress", wanted "Resolved" (did_not_move)
- Ask District IQ: severity.mixopen: 253 to 252, wanted -1 (moved_late, right after: 253)
- Ask District IQ: taluks.open: 196 to 195, wanted -1 (moved_late, right after: 196)
- Jarvis: brief.overdue: 339 to 338, wanted -1 (moved_late, right after: 339)
- Jarvis: cases.spoken: 11 to 11, wanted -1 (did_not_move)
- Jarvis: cases.total: 11 to 11, wanted -1 (did_not_move)
- Search: console.open: 1 to 1, wanted 0 (did_not_move)
- Search: console.status: "In progress" to "In progress", wanted "Resolved" (did_not_move)

**resolve (severe)** (`INC-20261102-3B27A7`)

- Map pins: ask.total: 54 to 53, wanted -1 (moved_late, right after: 54)
- Briefing: book.resolved: 1166 to 1166, wanted +1 (did_not_move)
- Ask District IQ: briefing.open: 1166 to 1165, wanted -1 (moved_late, right after: 1166)
- Ask District IQ: chat.resolved: 1166 to 1166, wanted +1 (did_not_move)
- Ask District IQ: departments.open: 105 to 104, wanted -1 (moved_late, right after: 105)
- Ask District IQ: followups.open: 105 to 104, wanted -1 (moved_late, right after: 105)
- Ask District IQ: kpis.complaints: 691 to 690, wanted -1 (moved_late, right after: 691)
- Ask District IQ: kpis.ongoing: 1166 to 1165, wanted -1 (moved_late, right after: 1166)
- Ask District IQ: kpis.resolved: 183 to 184, wanted +1 (moved_late, right after: 183)
- Ask District IQ: search.open: true to true, wanted false (did_not_move)
- Ask District IQ: search.status: "In progress" to "In progress", wanted "Resolved" (did_not_move)
- Ask District IQ: severity.mixopen: 54 to 53, wanted -1 (moved_late, right after: 54)
- Ask District IQ: taluks.open: 133 to 132, wanted -1 (moved_late, right after: 133)
- Jarvis: brief.overdue: 338 to 337, wanted -1 (moved_late, right after: 338)
- Jarvis: cases.spoken: 8 to 7, wanted -1 (moved_late, right after: 8)
- Jarvis: cases.total: 8 to 7, wanted -1 (moved_late, right after: 8)
- Jarvis: severe.spoken: 52 to 51, wanted -1 (moved_late, right after: 52)
- Jarvis: severe.total: 52 to 51, wanted -1 (moved_late, right after: 52)
- Search: console.open: 1 to 1, wanted 0 (did_not_move)
- Search: console.status: "In progress" to "In progress", wanted "Resolved" (did_not_move)

**reject** (`INC-20261105-45E2DD`)

- Map pins: ask.total: 42 to 41, wanted -1 (moved_late, right after: 42)
- Briefing: book.item.status: "Under review" to "Under review", wanted "Rejected" (did_not_move)
- Officer overview: feedback.has: false to false, wanted true (did_not_move)
- Ask District IQ: search.open: true to true, wanted false (did_not_move)
- Ask District IQ: search.status: "Under review" to "Under review", wanted "Rejected" (did_not_move)
- Search: console.open: 1 to 1, wanted 0 (did_not_move)
- Search: console.status: "Under review" to "Under review", wanted "Rejected" (did_not_move)

**reopen** (`INC-20261103-0559E9`)

- Map pins: ask.total: 97 to 98, wanted +1 (moved_late, right after: 97)
- Briefing: book.item.status: "Resolved" to "Resolved", wanted "Open" (did_not_move)
- Briefing: book.resolved: 1166 to 1166, wanted -1 (did_not_move)
- Ask District IQ: briefing.open: 1164 to 1165, wanted +1 (moved_late, right after: 1164)
- Ask District IQ: departments.open: 82 to 83, wanted +1 (moved_late, right after: 82)
- Ask District IQ: followups.open: 82 to 83, wanted +1 (moved_late, right after: 82)
- Ask District IQ: kpis.complaints: 689 to 690, wanted +1 (moved_late, right after: 689)
- Ask District IQ: kpis.ongoing: 1164 to 1165, wanted +1 (moved_late, right after: 1164)
- Ask District IQ: kpis.resolved: 184 to 183, wanted -1 (moved_late, right after: 184)
- Ask District IQ: search.open: false to false, wanted true (did_not_move)
- Ask District IQ: search.status: "Resolved" to "Resolved", wanted "Open" (did_not_move)
- Ask District IQ: severity.mixopen: 418 to 419, wanted +1 (moved_late, right after: 418)
- Ask District IQ: taluks.open: 96 to 97, wanted +1 (moved_late, right after: 96)
- Jarvis: brief.overdue: 337 to 338, wanted +1 (moved_late, right after: 337)
- Jarvis: cases.spoken: 5 to 6, wanted +1 (moved_late, right after: 5)
- Jarvis: cases.total: 5 to 6, wanted +1 (moved_late, right after: 5)
- Search: console.open: 0 to 0, wanted 1 (did_not_move)
- Search: console.status: "Resolved" to "Resolved", wanted "Open" (did_not_move)

**reopen (severe)** (`INC-20261103-FB02F4`)

- Map pins: ask.total: 108 to 109, wanted +1 (moved_late, right after: 108)
- Briefing: attention.status: null to "Resolved", wanted "Open" (moved_wrongly)
- Briefing: book.item.status: "Resolved" to "Resolved", wanted "Open" (did_not_move)
- Briefing: book.resolved: 1166 to 1166, wanted -1 (did_not_move)
- Ask District IQ: briefing.open: 1165 to 1166, wanted +1 (moved_late, right after: 1165)
- Ask District IQ: departments.open: 104 to 105, wanted +1 (moved_late, right after: 104)
- Ask District IQ: followups.open: 104 to 105, wanted +1 (moved_late, right after: 104)
- Ask District IQ: kpis.ongoing: 1165 to 1166, wanted +1 (moved_late, right after: 1165)
- Ask District IQ: kpis.resolved: 183 to 182, wanted -1 (moved_late, right after: 183)
- Ask District IQ: search.open: false to false, wanted true (did_not_move)
- Ask District IQ: search.status: "Resolved" to "Resolved", wanted "Open" (did_not_move)
- Ask District IQ: severity.mixopen: 53 to 54, wanted +1 (moved_late, right after: 53)
- Ask District IQ: taluks.open: 162 to 163, wanted +1 (moved_late, right after: 162)
- Jarvis: brief.overdue: 338 to 339, wanted +1 (moved_late, right after: 338)
- Jarvis: cases.spoken: 5 to 6, wanted +1 (moved_late, right after: 5)
- Jarvis: cases.total: 5 to 6, wanted +1 (moved_late, right after: 5)
- Jarvis: severe.spoken: 51 to 52, wanted +1 (moved_late, right after: 51)
- Jarvis: severe.total: 51 to 52, wanted +1 (moved_late, right after: 51)
- Search: console.open: 0 to 0, wanted 1 (did_not_move)
- Search: console.status: "Resolved" to "Resolved", wanted "Open" (did_not_move)
- Exports: csv.count: 72 to 72, wanted +1 (did_not_move)
- Exports: csv.has: false to false, wanted true (did_not_move)
- Exports: report.attention: 72 to 72, wanted +1 (did_not_move)
- Exports: report.routine: 32 to 33, wanted +0 (moved_wrongly)

**officer close** (`INC-20261102-8EC358`)

- Map pins: ask.total: 109 to 108, wanted -1 (moved_late, right after: 109)
- Briefing: book.item.status: "In progress" to "In progress", wanted "Resolved" (did_not_move)
- Briefing: book.resolved: 1166 to 1166, wanted +1 (did_not_move)
- Trends: pattern.row.status: "In progress" to "In progress", wanted "Resolved" (did_not_move)
- Officer overview: feedback.has: false to true, wanted false (moved_wrongly)
- Officer insights: work.checks.verified: 0 to 1, wanted +0 (moved_wrongly)
- Ask District IQ: briefing.open: 1166 to 1165, wanted -1 (moved_late, right after: 1166)
- Ask District IQ: chat.resolved: 1164 to 1164, wanted +1 (did_not_move)
- Ask District IQ: departments.open: 67 to 66, wanted -1 (moved_late, right after: 67)
- Ask District IQ: followups.open: 67 to 66, wanted -1 (moved_late, right after: 67)
- Ask District IQ: kpis.complaints: 690 to 688, wanted -2 (moved_late, right after: 690)
- Ask District IQ: kpis.ongoing: 1166 to 1165, wanted -1 (moved_late, right after: 1166)
- Ask District IQ: kpis.resolved: 182 to 183, wanted +1 (moved_late, right after: 182)
- Ask District IQ: search.open: true to true, wanted false (did_not_move)
- Ask District IQ: search.status: "In progress" to "In progress", wanted "Resolved" (did_not_move)
- Ask District IQ: severity.mixopen: 419 to 418, wanted -1 (moved_late, right after: 419)
- Ask District IQ: taluks.open: 163 to 162, wanted -1 (moved_late, right after: 163)
- Jarvis: brief.overdue: 339 to 338, wanted -1 (moved_late, right after: 339)
- Jarvis: cases.spoken: 6 to 5, wanted -1 (moved_late, right after: 6)
- Jarvis: cases.total: 6 to 5, wanted -1 (moved_late, right after: 6)
- Search: console.open: 1 to 1, wanted 0 (did_not_move)
- Search: console.status: "In progress" to "In progress", wanted "Resolved" (did_not_move)

**officer send** (`INC-20261103-53934E-1`)

- Ask District IQ: queue.count: 0 to 1, wanted +1 (moved_late, right after: 0)
- Exports: csv.count: 72 to 73, wanted +0 (moved_wrongly)

## Sequences: one incident, several actions

| Sequence | Incident | Ends as designed | Trail (step: status, open, stage, tracker) | Why it matters |
|---|---|---|---|---|
| resolve, reopen, resolve within two minutes | `INC-20261104-FC41F8` | **NO**: open: 1, wanted 0; status: "Open", wanted "Resolved"; decision: "reopen", wanted "resolve" | start, In progress, 1, action, Complaint Filed / resolve, Resolved, 0, verified, Verified by Collector / reopen, Open, 1, action, In Progress / resolve again, Open, 1, action, In Progress | decisions route: "a double click sends the same decision twice: the one just made ... is kept, not recorded". The third call is not a double click: the latest decision is reopen. |
| reopen, resolve, reopen within two minutes | `INC-20261103-6E8CD6` | **NO**: open: 0, wanted 1; status: "Resolved", wanted "Open"; decision: "resolve", wanted "reopen" | start, In progress, 1, action, Complaint Filed / reopen, Open, 1, action, In Progress / resolve, Resolved, 0, verified, Verified by Collector / reopen again, Resolved, 0, verified, Verified by Collector | the same rule, the other way round |
| resolve, then a note | `INC-20261030-CB8991` | yes | start, Assigned, 1, approved, Complaint Filed / resolve, Resolved, 0, verified, Verified by Collector / note, Resolved, 0, verified, Verified by Collector | effective.ts: "The latest decision other than a note decides" |
| resolve, then escalate | `INC-20261103-B74560` | yes | start, Assigned, 1, approved, Complaint Filed / resolve, Resolved, 0, verified, Verified by Collector / escalate, Assigned, 1, verified, Verified by Collector | effective.ts: "verify and escalate leave the status as it is (a verify after a resolve therefore shows the pipeline's status, as the list does)". So the console reopens it; the officer's stage ignores escalate, so the officer still sees it verified. |
| severe: resolve, then verify | `INC-20261105-BB4429` | yes | start, In progress, 1, action / resolve, Resolved, 0, verified / verify, In progress, 1, verified | effective.ts names this case: a verify after a resolve shows the pipeline's status |
| officer close, then the Collector reopens | `INC-20261101-5C6119` | yes | start, In progress, 1, action, Complaint Filed / officer close, Resolved, 0, verified, Resolved by Department / reopen, Open, 1, action, In Progress | officer/data.ts: "The latest of those wins"; the Collector's Send back is a reopen |
| reject, then reopen | `INC-20261102-A7CC18` | yes | start, In progress, 1, action, Complaint Filed / reject, Rejected, 0, closed, Rejected / reopen, Open, 1, action, In Progress | reopen opens what reject closed |
| verify a severe incident the pipeline has not verified | `INC-20261105-D0CC25` | yes | start, In progress, 1 / verify, In progress, 1 | verify leaves the status; the list's verified filter should hold it (next check) |
| officer send, then the Collector verifies: My Tasks | `INC-20261103-53934E-1` | yes | before verify, tasks 1 / verify, tasks 0 | intel.ts: a report sent "always comes to My Tasks ... until the Collector decides" |
| officer send, send back, officer send, send back, within two minutes | `INC-20261104-22A6D5` | **NO**: stage: sent, wanted action; My Tasks: 1, wanted 0; the second Send back answered 201 and was not recorded | start, In progress, 1, action, tasks 0 / officer send, In progress, 1, sent, tasks 1 / send back, Open, 1, action, tasks 0 / officer send again, Open, 1, sent, tasks 1 / send back again, Open, 1, sent, tasks 1 | the same double-click rule, reached with the screens' own buttons: the second Send back is a new decision on a new report, not a double click |
| reopen an incident the pipeline closed, then the officer sends a report: My Tasks | `INC-20261101-738431` | **NO**: My Tasks: 1, wanted 2; awaiting list: 0, wanted 1 | reopen, Open, 1, action, tasks 1 / officer send, Open, 1, sent, tasks 1 | intel.ts: "Such a report always comes to My Tasks (the officer asked for the Collector's check), whatever the period". sentByOfficer() reads the pipeline's i.is_open |
| verify, then the list's verified filter | `INC-20261105-D0CC25` | **NO**: verified_filter: 0, wanted 1 (the row says verified 1) | after verify, verified filter 0, row 1 | intel.ts overlay sets verified on the row; the list's filter reads the pipeline's i.verified only |

### Real complaints

Four complaints in the snapshot are linked to an incident. Two of them were moved to citizenB in the throwaway file, so the tracker could be read:

| Incident | Step | HTTP | Tracker after |
|---|---|---|---|
| `INC-20261006-9D13D8` | resolve | 201 | Verified by Collector |
| `INC-20261006-9FB89A` | approve | 201 | Approved by Department Officer |
| `INC-20261006-9FB89A` | officer_close | 201 | Resolved by Department |

## Who may act

55 of 55 checks as designed. An officer of another department, a citizen and no session were each refused every action, and the refused calls wrote no decision.

| Who | What | Got | Wanted | |
|---|---|---|---|---|
| no session | POST decisions resolve | 401 | 401 | ok |
| citizen | POST decisions resolve | 401 | 401 | ok |
| officer of the incident's department | POST decisions resolve | 401 | 401 | ok |
| officer of another department | POST decisions resolve | 401 | 401 | ok |
| no session | POST decisions reject | 401 | 401 | ok |
| citizen | POST decisions reject | 401 | 401 | ok |
| officer of the incident's department | POST decisions reject | 401 | 401 | ok |
| officer of another department | POST decisions reject | 401 | 401 | ok |
| no session | POST decisions reopen | 401 | 401 | ok |
| citizen | POST decisions reopen | 401 | 401 | ok |
| officer of the incident's department | POST decisions reopen | 401 | 401 | ok |
| officer of another department | POST decisions reopen | 401 | 401 | ok |
| no session | POST decisions verify | 401 | 401 | ok |
| citizen | POST decisions verify | 401 | 401 | ok |
| officer of the incident's department | POST decisions verify | 401 | 401 | ok |
| officer of another department | POST decisions verify | 401 | 401 | ok |
| no session | POST decisions escalate | 401 | 401 | ok |
| citizen | POST decisions escalate | 401 | 401 | ok |
| officer of the incident's department | POST decisions escalate | 401 | 401 | ok |
| officer of another department | POST decisions escalate | 401 | 401 | ok |
| no session | POST decisions note | 401 | 401 | ok |
| citizen | POST decisions note | 401 | 401 | ok |
| officer of the incident's department | POST decisions note | 401 | 401 | ok |
| officer of another department | POST decisions note | 401 | 401 | ok |
| collector, no grant | POST decisions resolve | 428 | 428 | ok |
| collector | verify on a non-severe incident | 409 | 409 | ok |
| collector | reject with no note | 400 | 400 | ok |
| collector | note with no note | 400 | 400 | ok |
| collector | escalate to an unknown department | 400 | 400 | ok |
| collector, a grant for another incident | POST decisions resolve | 428 | 428 | ok |
| collector, a grant for another decision | POST decisions escalate | 428 | 428 | ok |
| officer, the Collector's grant | POST decisions resolve | 401 | 401 | ok |
| no session | GET a grievance | 401 | 401 | ok |
| no session | approve a grievance | 401 | 401 | ok |
| no session | officer's report (close) | 401 | 401 | ok |
| citizen | GET a grievance | 401 | 401 | ok |
| citizen | approve a grievance | 401 | 401 | ok |
| citizen | officer's report (close) | 401 | 401 | ok |
| collector | GET a grievance | 401 | 401 | ok |
| collector | approve a grievance | 401 | 401 | ok |
| collector | officer's report (close) | 401 | 401 | ok |
| officer of another department | GET a grievance | 404 | 404 | ok |
| officer of another department | approve a grievance | 404 | 404 | ok |
| officer of another department | officer's report (close), with a grant | 404 | 404 | ok |
| officer of another department | search finds another department's grievance | 0 | 0 | ok |
| officer, wrong order | close a new grievance (not yet approved) | 409 | 409 | ok |
| officer | send a non-severe grievance to the Collector | 409 | 409 | ok |
| officer | close a severe grievance | 409 | 409 | ok |
| officer, the other officer's grant | officer's report | 428 | 428 | ok |
| citizen, not the owner | GET another's complaint | 404 | 404 | ok |
| collector | GET a complaint on the citizen's route | 401 | 401 | ok |
| citizen | confirm box | 401 | 401 | ok |
| officer | assistant tools route (Collector only) | 401 | 401 | ok |
| citizen | assistant tools route | 401 | 401 | ok |
| the store | decision rows written by all the refused calls | 0 | 0 | ok |

## The sum across surfaces, after all the actions

The oracle is the console's figure before any decision plus what the raw rows and the decision table say changed. The raw rows differ from the console by a fixed number before any decision (21 reported, 21 open): open news-only incidents the server leaves out when it loads a build (derive.ts: news media, report kinds, news sanity).

| Figure | Oracle | Surfaces | Agree |
|---|---|---|---|
| Ongoing incidents, last 7 days (open, not routed) | 1164 | console: Ongoing tile: 1164; console: open list: 1164; Ask District IQ: overview_kpis: 1164; Ask the Map: open incidents: 1164 | yes |
| Open incidents, last 7 days (routed ones too) | 1164 | console: zone table plus the no-zone row: 1164; console: department list: 1164; console: severity mix: 1164; briefing: still open: 1164; Ask District IQ: chat count: 1164; Ask District IQ: departments tool: 1164; Jarvis: performance screen: 1164 | yes |
| Resolved, last 7 days | 184 | console: Resolved tile: 184; Ask District IQ: overview_kpis: 184 | yes |
| Open complaints, last 7 days | 686 | console: tile: 686; console: zone table plus the no-zone row: 686; Ask District IQ: overview_kpis: 686 | yes |
| Severe and open, last 7 days | 55 | console: tile's breakdown: 55; console: severity mix: 55 | yes |
| Open by zone: console, the zones tool and the raw rows, zone by zone |  | zones that differ: 0 | yes |
| GCC-SWM: the Collector's Ongoing and the board on the officer's page | 64 | officer's board: 64 | yes |
| GCC-SWM: open on the board against New + In action + Sent on the same officer page | 64 | New + In action + Sent: 63 | **NO**: A verify counts as closed in the stages and as open on the board. |
| GCC-ELE: the Collector's Ongoing and the board on the officer's page | 83 | officer's board: 83 | yes |
| GCC-ELE: open on the board against New + In action + Sent on the same officer page | 83 | New + In action + Sent: 83 | yes |
| PWD-WRD: the Collector's Ongoing and the board on the officer's page | 106 | officer's board: 106 | yes |
| PWD-WRD: open on the board against New + In action + Sent on the same officer page | 106 | New + In action + Sent: 103 | **NO**: A verify counts as closed in the stages and as open on the board. |

## How long the figures really lag, on a clock that runs as on production

On the matrix's server the pipeline's as_of (18:08) is later than the clock (12:00), so `asOf()` stands still and each memo lives its full time. So these checks ran on a second, clean server whose clock is later than as_of, so `asOf()` moves every 30 seconds as on production. Each row is one resolve, with the figure polled every few seconds up to 95. The console's own tile and list are the control.

| Incident | Figure | Before | Seconds until it moved | Change |
|---|---|---|---|---|
| `INC-20261103-1D9CB6` | console Ongoing tile | 1165 | 1 | -1 |
| `INC-20261103-1D9CB6` | console open list | 1165 | 2 | -1 |
| `INC-20261103-1D9CB6` | Ask District IQ: overview_kpis tool | 1165 | 14 | -1 |
| `INC-20261103-1D9CB6` | Ask District IQ: chat | 1165 | 2 | -1 |
| `INC-20261103-1D9CB6` | Jarvis: compare screen | 110 | 26 | -1 |
| `INC-20261103-1D9CB6` | Ask the Map | 110 | 14 | -1 |
| `INC-20261103-1D9CB6` | console list, this department and zone | 12 | 2 | -1 |
| `INC-20261103-1D9CB6` | console list's groups, this department and zone | 11 | **did not move** |  |
| `INC-20261103-1D9CB6` | Jarvis: case list (counts groups), this department and zone | 11 | **did not move** |  |
| `INC-20261104-EA19E3` | console Ongoing tile | 1164 | 1 | -1 |
| `INC-20261104-EA19E3` | console open list | 1164 | 1 | -1 |
| `INC-20261104-EA19E3` | Ask District IQ: overview_kpis tool | 1164 | 3 | -1 |
| `INC-20261104-EA19E3` | Ask District IQ: chat | 1164 | 3 | -1 |
| `INC-20261104-EA19E3` | Jarvis: compare screen | 109 | 29 | -1 |
| `INC-20261104-EA19E3` | Ask the Map | 109 | 29 | -1 |
| `INC-20261104-EA19E3` | console list, this department and zone | 4 | 3 | -1 |
| `INC-20261104-EA19E3` | console list's groups, this department and zone | 4 | 3 | -1 |
| `INC-20261104-EA19E3` | Jarvis: case list (counts groups), this department and zone | 4 | 29 | -1 |
| `INC-20261103-8989A6` | console Ongoing tile | 1163 | 1 | -1 |
| `INC-20261103-8989A6` | console open list | 1163 | 1 | -1 |
| `INC-20261103-8989A6` | Ask District IQ: overview_kpis tool | 1163 | 26 | -1 |
| `INC-20261103-8989A6` | Ask District IQ: chat | 1163 | 1 | -1 |
| `INC-20261103-8989A6` | Jarvis: compare screen | 57 | 26 | -1 |
| `INC-20261103-8989A6` | Ask the Map | 57 | 53 | -1 |
| `INC-20261103-8989A6` | console list, this department and zone | 4 | 1 | -1 |
| `INC-20261103-8989A6` | console list's groups, this department and zone | 4 | 1 | -1 |
| `INC-20261103-8989A6` | Jarvis: case list (counts groups), this department and zone | 4 | 32 | -1 |

**An officer's send on the action list (CSV).** The rows for `INC-20261103-53934E-1` before the send: "Needs your attention". After it: "Needs your attention", "Closed work to check".

**Search rows after a resolve** (`INC-20261103-1D9CB6`). The page says Resolved, open 0. The search_records tool, on its keyword lane (the live server's only lane here): {"status":"In progress","match":"keywords"}. The search tool: {"status":"In progress","open":true}.

**Server log of the second server.** 0 lines about the search index; 3 error lines.

## OPEN-16: the two readers on the pipeline's flag

Both still do not move. These two are tested in `tests/qa/pass4/decision-matrix.test.ts`, on the real store, with a fake model and a fake embedding at the boundary, because the server has no model key and the embedding model file in this worktree is a 134-byte pointer. The index in that test lives in a scratch folder under `data/aws-cache/qa/srv/`.

- **Model-written queries** (`src/lib/assistant/compile.ts`). A plan with `is_open = 1` on one incident gives 1 before and 1 after a resolve, while the console says 0. A plan with `status_std = 'Resolved'` gives 0 after it. The whole path gives the same: a question, a fake agent step, a fake plan, the real compile, the real store and the real card, whose headline says 1. The catalog offers `is_open` as "still open" and marks `ops.collector_decisions` "not for answers", so a model has no right way to ask.
- **The search index** (`src/lib/assistant/lance.ts`). No index is built on this machine (`data/lancedb` is missing in this worktree), so the live server falls back to keywords. In a scratch folder, an index built from the real store by `syncLance`: after a resolve and a sync, an open-only search still returns the incident, with `open = 1` and its old status; after a reopen and a sync, an open-only search still misses it. `rows()` reads `is_open` and `status_std` and never the decisions, so a sync sees no change.

## Other claims checked

- "The pipeline applies them on its next build" (decisions route): in `district_intel` the decisions table is read only by `dintel/priority.py` (to learn the priority weights) and created by `dintel/mysql_export.py`. No code there changes an incident's status from a decision, so nothing later closes what a verify leaves open.

## Findings

| Id | Severity | Title |
|---|---|---|
| DECISIONS-1 | P0 | A real decision within two minutes of an earlier same decision answers 201 and is not recorded |
| DECISIONS-2 | P1 | "Verify and close" does not close the incident on the console, while the officer and the citizen are told it is closed |
| DECISIONS-3 | P2 | An escalate after a resolve reopens the incident on the console while the officer and the citizen still see it closed |
| DECISIONS-4 | P1 | Search rows ignore decisions: a resolved incident still shows its old status and open |
| DECISIONS-5 | P0 | An officer's own close is shown as "Collector verified" and counted in "Collector's checks" |
| DECISIONS-6 | P2 | A case the Collector "Returned to the department" with reject never reaches the officer |
| DECISIONS-7 | P0 | A reopened severe incident is not on the action list (CSV) or in the report's attention figure, though its own page says it needs the Collector |
| DECISIONS-8 | P0 | "How many resolved" and the Briefing's resolved figure do not count a Collector's resolve or an officer's close |
| DECISIONS-9 | P0 | A hotspot's "N open" on Trends does not follow a decision |
| DECISIONS-10 | P1 | Rows under Needs your attention, the Briefing book and a pattern show the pipeline's status beside the decided open flag |
| DECISIONS-11 | P2 | An incident the Collector verified is not in the list's verified filter, though its row says verified |
| DECISIONS-12 | P2 | Figures on Ask District IQ, Jarvis and Ask the Map lag a decision, though the code says at once |
| DECISIONS-13 | P0 | A model-written query's "still open" and status do not follow a decision |
| DECISIONS-14 | P1 | The search index's open-only filter and its status do not follow a decision, even after a sync |
| DECISIONS-15 | P1 | An officer's report on an incident the Collector reopened never reaches My Tasks |
| DECISIONS-16 | P3 | An officer's send puts the same incident on the CSV twice, once under "Closed work to check" while it is still open |
| DECISIONS-17 | P3 | With no search index, search_records misses incidents in two cases (found while testing OPEN-16, not caused by a decision) |
| DECISIONS-18 | P2 | After a reject and a reopen the citizen still reads the reason it was rejected |

## Limits

- The frozen clock starts at 2026-11-06 12:00 IST, but the pipeline's as_of (18:08) is later, so asOf() stays at 18:08 for the whole run. On production asOf() moves every 30 s, so a cache keyed on it rolls over within 30 s; here the same keys live for their full 60 s. The lag figures below are therefore upper bounds for production.
- officerC is moved to PWD-WRD in the throwaway durable file only: no test officer's department has a severe open incident.
- Only four grievance events in the snapshot link to a complaint in the complaints table. For the other incidents a complaint row owned by citizenA is added to the throwaway durable file, with the number the pipeline's grievance event holds, so the tracker reads it the real way. The real links are checked as well (realComplaints below).
- ASSISTANT_TOOLS_API=1 turns on the developer route that runs one assistant tool; it is off by default in production.
- The Collector's AI brief (`/api/collector/brief`) needs a model: not read here. Its status field reads `i.status_std` beside the effective open flag (`src/lib/collector/aibrief.ts`), the same pattern as finding DECISIONS-10.
- The assistant export is capped at 10 a day, so it was read for the first three actions that close or reopen; the other actions rely on the console export, which runs the same `exportRows`.
- The Rain tabs read the pipeline's flag (`src/lib/rehearsal/source.ts`): they replay past rain, were not in this brief, and were not tested.
- The server log held 29 lines about the embedding model not loading (the model file in this worktree is a 134-byte pointer, not the model, so the meaning search stays off here and keyword search answers); lines about the search index: 0; other error lines: 0. Reads the machine reset and that were asked again: 0 (other test servers were running on this machine; the server logged no error for them).
