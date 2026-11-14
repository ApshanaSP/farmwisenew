# Golden-master diff: p6-gate to p7-gate

Compared 3277 requests with 3273. **342 changed, 17 added, 21 removed.**

## What differs around the requests

- next_build_id: 7W1366w-32VU0Pwhed8Oy to SWKEUJgzHqBCQjD1NS_2D

## By route

| Route | Requests changed | Roles | Status changes | Most changed paths |
|---|---|---|---|---|
| /api/officer/grievances | 75 | officerA, officerB | 200 -> 400 | $.rows[*].breached (404), $.rows[*] (24), $.rows[*].id (14), $.rows[*].title (14), $.rows[*].zone (14) |
| /api/map/ask | 47 | collector, officerA, officerB | none | $.trace[*].ids[*] (867), $.rows[*] (65), $.rows[*].id (45), $.rows[*].title (45), $.rows[*].first (45) |
| /api/collector/overview | 31 | collector | none | $.stories.threads[*].records (261), $.stories.threads[*].placed (261), $.map.pins[*].id (120), $.map.pins[*].lat (120), $.map.pins[*].lon (120) |
| /api/officer/overview | 29 | officerA, officerB | none | $.map.pins[*].stage (152), $.queue.new[*].breached (150), $.queue.action[*].breached (140), $.board.bell[*] (64), $.queue.action[*].id (59) |
| /api/collector/thunai/agent/round | 24 | collector | none | $.result.stage.say.ta (21), $.result.say (20), $.result.stage.blocks[*].points[*] (17), $.result.stage.say.en (14), $.result.stage.blocks[*].rows[*].id (12) |
| /api/collector/insights | 21 | collector | none | $.gaps[*].open_now (273), $.review.unplaced[*].open_now (91), $.deptActions[*].awaiting (50), $.book.departments[*].ai.asOf (24), $.book.health.ai.asOf (20) |
| /api/collector/incidents/[id] | 19 | collector | none | $.incident.officer_step (19), $.officerStep (19), $.incident.status (2), $.incident.why.attention[*] (2), $.incident.why.why[*] (2) |
| /api/collector/stories | 18 | collector | none | $.threads[*].records (249), $.threads[*].placed (249) |
| /api/collector/report | 18 | collector | none | $.stories.threads[*].records (237), $.stories.threads[*].placed (237), $.deptNav[*].unverified (57), $.bell[*].id (37), $.bell[*].title (37) |
| /api/collector/assistant/chat | 11 | collector, officerA | none | $[*].data.answerMarkdown (8), $[*].data.voiceSummary (8), $[*].data.headline (7), $[*].data.scopeLine (7), $[*].data.sources.tools[*].args.hours (5) |
| /api/officer/grievances/[id] | 11 | officerA, officerB | none | $.grievance.breached (11), $.rejected (11), $.next (6), $.grievance.stage (3), $.sources[*].note (3) |
| /api/collector/pattern | 7 | collector | none | $.incidents[*].open_now (195) |
| /api/officer/search | 6 | officerA, officerB | none | $.rows[*].breached (41), $.rows[*].stage (10) |
| /api/collector/thunai/agent | 4 | collector | none | $.result.stage.blocks[*].points[*] (12), $.result.stage.next[*].ids[*] (5), $.result.say (4), $.result.steps.length (3), $.result.steps[*] (3) |
| /api/map/export | 4 | collector | none | $.line[*] (67), $.lines (2), $.properties.window (2) |
| /api/collector/audit | 3 | collector | none | $.log[*].id (481), $.log[*].record_id (335), $.log[*].at (272), $.log[*].after_value (221), $.log[*].action (98) |
| /api/collector/studio/[id] | 3 | collector | 200 -> 428 | $.line[*] (834), $.lines (3) |
| /api/collector/list | 2 | collector | 200 -> 400 | $.rows (2), $.total (2), $.incidents (2), $.complaints (2), $.error (2) |
| /api/collector/assistant/sessions/[id] | 2 | collector, officerA | none | $.messages[*].text (1), $.messages[*].card.headline (1), $.messages[*].card.answerMarkdown (1), $.messages[*].card.voiceSummary (1), $.messages[*].card.scopeLine (1) |
| /api/officer/grievances/[id]/report | 2 | officerA | 428 -> 409, 428 -> 404 | $.error (2), $.confirm (2) |
| /api/complaints | 1 | citizenA | none | $.queueNote.en (1), $.queueNote.ta (1) |
| /api/complaints/[code] | 1 | citizenA | none | $.checker (1) |
| /api/collector/search | 1 | collector | none | $.incidents[*].lat (1), $.incidents[*].lon (1), $.incidents[*].sev (1), $.incidents[*].sla_due (1), $.incidents[*].severity_reasons (1) |
| /api/collector/decisions | 1 | collector | 201 -> 428 | $.saved (1), $.error (1), $.confirm (1) |
| /api/auth/security | 1 | officerA | none | $.events[*].detail.summary (2), $.events[*] (2), $.events.length (1), $.events[*].action (1), $.events[*].detail.action (1) |

## Added requests

- collector POST /api/map/insight: 200
- officerA POST /api/map/insight: 200
- citizenA POST /api/map/insight: 401
- collector POST /api/map/export: 428
- collector POST /api/map/export: 200
- collector POST /api/map/export: 428
- collector POST /api/map/export: 200
- officerA POST /api/map/export: 428
- officerA POST /api/map/export: 200
- collector POST /api/map/send: 200
- collector POST /api/collector/thunai/agent/round: 200
- collector POST /api/collector/thunai/agent/round: 200
- collector POST /api/collector/thunai/agent/round: 200
- collector POST /api/collector/thunai/agent/round: 200
- collector POST /api/collector/thunai/agent/round: 200
- collector POST /api/collector/thunai/agent/round: 200
- collector POST /api/collector/thunai/agent/round: 200

## Removed requests

- collector POST /api/map/insight: 200
- officerA POST /api/map/insight: 200
- citizenA POST /api/map/insight: 401
- collector POST /api/map/export: 428
- collector POST /api/map/export: 200
- collector POST /api/map/export: 428
- collector POST /api/map/export: 200
- officerA POST /api/map/export: 428
- officerA POST /api/map/export: 200
- collector POST /api/map/send: 200
- collector POST /api/collector/thunai/agent/round: 200
- collector POST /api/collector/thunai/agent/round: 200
- collector POST /api/collector/thunai/agent/round: 200
- collector POST /api/collector/thunai/agent/round: 200
- collector POST /api/collector/thunai/agent/round: 200
- collector POST /api/collector/thunai/agent/round: 200
- collector POST /api/collector/thunai/agent/round: 200
- officerA POST /api/auth/confirm: 200
- officerA POST /api/officer/grievances/INC-20261106-0B725B/report: 409
- officerA POST /api/auth/confirm: 200
- officerA POST /api/officer/grievances/INC-20261106-31532C/report: 404

## Each changed request

### collector GET /api/collector/incidents/INC-20260926-EB3B79

Session reads, id 4df02c3725c60daa, 6908 bytes to 6947 bytes.

| Path | A | B |
|---|---|---|
| $.incident.officer_step | (absent) | null |
| $.officerStep | (absent) | null |

### collector GET /api/collector/incidents/INC-20261106-2AB4CB

Session reads, id 21c8033003bcfa9e, 3458 bytes to 3497 bytes.

| Path | A | B |
|---|---|---|
| $.incident.officer_step | (absent) | null |
| $.officerStep | (absent) | null |

### collector GET /api/collector/incidents/INC-20261104-CBCE27

Session reads, id 5ea0f2cbdeb4cfb3, 3813 bytes to 3852 bytes.

| Path | A | B |
|---|---|---|
| $.incident.officer_step | (absent) | null |
| $.officerStep | (absent) | null |

### collector GET /api/collector/incidents/INC-20260613-D7B58D

Session reads, id 5d6f915b4c414fe6, 3825 bytes to 3864 bytes.

| Path | A | B |
|---|---|---|
| $.incident.officer_step | (absent) | null |
| $.officerStep | (absent) | null |

### collector GET /api/collector/incidents/INC-20261106-31532C

Session reads, id 7f0c4e1982b09f59, 3836 bytes to 3875 bytes.

| Path | A | B |
|---|---|---|
| $.incident.officer_step | (absent) | null |
| $.officerStep | (absent) | null |

### collector GET /api/collector/incidents/INC-20261102-02C5CC

Session reads, id 388aa12e7a54e354, 4183 bytes to 4222 bytes.

| Path | A | B |
|---|---|---|
| $.incident.officer_step | (absent) | null |
| $.officerStep | (absent) | null |

### collector GET /api/collector/incidents/INC-20260729-DD5997

Session reads, id 0805ff5855183d1f, 3747 bytes to 3786 bytes.

| Path | A | B |
|---|---|---|
| $.incident.officer_step | (absent) | null |
| $.officerStep | (absent) | null |

### collector GET /api/collector/incidents/INC-20260731-09AF14

Session reads, id 8d26e1a7cdf9f943, 2828 bytes to 2867 bytes.

| Path | A | B |
|---|---|---|
| $.incident.officer_step | (absent) | null |
| $.officerStep | (absent) | null |

### collector GET /api/collector/incidents/INC-20261030-2B40AF

Session reads, id a4fd04cd7eaede36, 3411 bytes to 3450 bytes.

| Path | A | B |
|---|---|---|
| $.incident.officer_step | (absent) | null |
| $.officerStep | (absent) | null |

### collector GET /api/collector/incidents/INC-20261004-752FF2

Session reads, id 2c0abde36482cb1b, 3318 bytes to 3357 bytes.

| Path | A | B |
|---|---|---|
| $.incident.officer_step | (absent) | null |
| $.officerStep | (absent) | null |

### collector GET /api/collector/incidents/INC-20261103-17A0B9

Session reads, id 84eb0552a2101135, 3762 bytes to 3801 bytes.

| Path | A | B |
|---|---|---|
| $.incident.officer_step | (absent) | null |
| $.officerStep | (absent) | null |

### collector GET /api/collector/incidents/INC-20261026-384CFF

Session reads, id bc3e9db0ffc3788f, 4635 bytes to 4674 bytes.

| Path | A | B |
|---|---|---|
| $.incident.officer_step | (absent) | null |
| $.officerStep | (absent) | null |

### collector GET /api/collector/list?sev=bogus

Session reads, id 13093d57a1113c1f, 16484 bytes to 71 bytes.
- status: 200 to 400

| Path | A | B |
|---|---|---|
| $.rows | [array of 12] | (absent) |
| $.total | 228 | (absent) |
| $.incidents | 239 | (absent) |
| $.complaints | 147 | (absent) |
| $.error | (absent) | Severity "bogus" is not one of Severe, High, Medium, Low. |

### collector GET /api/collector/list?status=bogus

Session reads, id 064e0fa86266673a, 16484 bytes to 193 bytes.
- status: 200 to 400

| Path | A | B |
|---|---|---|
| $.rows | [array of 12] | (absent) |
| $.total | 228 | (absent) |
| $.incidents | 239 | (absent) |
| $.complaints | 147 | (absent) |
| $.error | (absent) | Status "bogus" is not one of open, awaiting, unverified, verified, critical, overdue, Open, Under review, Assigned, In progress, Awaiting ve... (179 chars) |

### collector GET /api/collector/overview

Session reads, id 39b0e214fde3d0b5, 232552 bytes to 235364 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 1] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 0] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.stories.threads[3].records | (absent) | [array of 0] |
| $.stories.threads[3].placed | (absent) | {object with 2 keys} |
| $.stories.threads[4].records | (absent) | [array of 2] |
| $.stories.threads[4].placed | (absent) | {object with 2 keys} |
| $.stories.threads[5].records | (absent) | [array of 0] |
| $.stories.threads[5].placed | (absent) | {object with 2 keys} |
| $.stories.threads[6].records | (absent) | [array of 1] |
| $.stories.threads[6].placed | (absent) | {object with 2 keys} |
| $.stories.threads[7].records | (absent) | [array of 0] |
| $.stories.threads[7].placed | (absent) | {object with 2 keys} |
| $.stories.threads[8].records | (absent) | [array of 0] |
| $.stories.threads[8].placed | (absent) | {object with 2 keys} |
| $.stories.threads[9].records | (absent) | [array of 1] |
| $.stories.threads[9].placed | (absent) | {object with 2 keys} |
| $.stories.threads[10].records | (absent) | [array of 0] |
| $.stories.threads[10].placed | (absent) | {object with 2 keys} |
| $.stories.threads[11].records | (absent) | [array of 1] |

...and 52 more paths (see the JSON file).

### collector GET /api/collector/overview?cat=SOLID_WASTE

Session reads, id bea1527b406da7fb, 65516 bytes to 56856 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.bell.length | 6 | 0 |
| $.bell[0] | {object with 40 keys} | (absent) |
| $.bell[1] | {object with 40 keys} | (absent) |
| $.bell[2] | {object with 40 keys} | (absent) |
| $.bell[3] | {object with 40 keys} | (absent) |
| $.bell[4] | {object with 40 keys} | (absent) |
| $.bell[5] | {object with 40 keys} | (absent) |
| $.periodInfo.resolved | (absent) | Resolved, last 24 hours |

### collector GET /api/collector/overview?cat=DARK_SPOT_SAFETY

Session reads, id a6c1f11197ff2d7d, 29928 bytes to 21267 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.bell.length | 6 | 0 |
| $.bell[0] | {object with 40 keys} | (absent) |
| $.bell[1] | {object with 40 keys} | (absent) |
| $.bell[2] | {object with 40 keys} | (absent) |
| $.bell[3] | {object with 40 keys} | (absent) |
| $.bell[4] | {object with 40 keys} | (absent) |
| $.bell[5] | {object with 40 keys} | (absent) |
| $.periodInfo.resolved | (absent) | Resolved, last 24 hours |

### collector GET /api/collector/overview?cat=FOOD_SAFETY

Session reads, id 2da516963c159fa5, 29715 bytes to 21054 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.bell.length | 6 | 0 |
| $.bell[0] | {object with 40 keys} | (absent) |
| $.bell[1] | {object with 40 keys} | (absent) |
| $.bell[2] | {object with 40 keys} | (absent) |
| $.bell[3] | {object with 40 keys} | (absent) |
| $.bell[4] | {object with 40 keys} | (absent) |
| $.bell[5] | {object with 40 keys} | (absent) |
| $.periodInfo.resolved | (absent) | Resolved, last 24 hours |

### collector GET /api/collector/overview?cat=PUBLIC_ORDER

Session reads, id f98e87062fb9c07c, 36884 bytes to 29476 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 0] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.bell.length | 6 | 1 |
| $.bell[0].id | INC-20260515-B939EB | INC-20261106-1FB1D7 |
| $.bell[0].title | Ice House: uprooted tree blocks road | Demonstration near Pondy Bazaar |
| $.bell[0].type | Flooding & waterlogging | Protests & public nuisance |
| $.bell[0].cat_code | FLOOD_WATERLOGGING | PUBLIC_ORDER |
| $.bell[0].family | FLOOD | PUBLIC_ORDER |
| $.bell[0].dept | PWD-WRD | POL-GCP |
| $.bell[0].dept_name | PWD Water Resources | Greater Chennai Police |
| $.bell[0].zone | 9 | 10 |
| $.bell[0].zone_name | Teynampet | Kodambakkam |
| $.bell[0].ward | 115 | 136 |
| $.bell[0].loc | Ice House | T. Nagar |
| $.bell[0].lat | 13.05345339618489 | 13.039793 |
| $.bell[0].lon | 80.2708643260533 | 80.232535 |
| $.bell[0].sev | Severe | High |
| $.bell[0].status | In progress | Open |
| $.bell[0].complaints | 3 | 0 |
| $.bell[0].sources | grievance\|police\|pwd | police |
| $.bell[0].source_count | 3 | 1 |
| $.bell[0].channels | citizen_app\|control_room_112\|field_staff | control_room_112 |
| $.bell[0].t | 2026-11-06 05:59:00 | 2026-11-06 17:34:59 |

...and 21 more paths (see the JSON file).

### collector GET /api/collector/overview?dept=GCC-SWM

Session reads, id 528e783e33393de3, 55225 bytes to 55323 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.periodInfo.resolved | (absent) | Resolved, last 24 hours |

### collector GET /api/collector/overview?dept=GCC-ELE

Session reads, id f990ca8e7fa66599, 68037 bytes to 68135 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.periodInfo.resolved | (absent) | Resolved, last 24 hours |

### collector GET /api/collector/overview?dept=CMWSSB

Session reads, id a4c12d9d5bbc192b, 18418 bytes to 18515 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.periodInfo.resolved | (absent) | Resolved, last 24 hours |

### collector GET /api/collector/overview?dept=POL-GCP

Session reads, id bf56cac30316263f, 123215 bytes to 124334 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 1] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 2] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.stories.threads[3].records | (absent) | [array of 1] |
| $.stories.threads[3].placed | (absent) | {object with 2 keys} |
| $.stories.threads[4].records | (absent) | [array of 1] |
| $.stories.threads[4].placed | (absent) | {object with 2 keys} |
| $.stories.threads[5].records | (absent) | [array of 1] |
| $.stories.threads[5].placed | (absent) | {object with 2 keys} |
| $.periodInfo.resolved | (absent) | Resolved, last 24 hours |

### collector GET /api/collector/overview?period=daily

Session reads, id b98902a6131e2d60, 232552 bytes to 235364 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 1] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 0] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.stories.threads[3].records | (absent) | [array of 0] |
| $.stories.threads[3].placed | (absent) | {object with 2 keys} |
| $.stories.threads[4].records | (absent) | [array of 2] |
| $.stories.threads[4].placed | (absent) | {object with 2 keys} |
| $.stories.threads[5].records | (absent) | [array of 0] |
| $.stories.threads[5].placed | (absent) | {object with 2 keys} |
| $.stories.threads[6].records | (absent) | [array of 1] |
| $.stories.threads[6].placed | (absent) | {object with 2 keys} |
| $.stories.threads[7].records | (absent) | [array of 0] |
| $.stories.threads[7].placed | (absent) | {object with 2 keys} |
| $.stories.threads[8].records | (absent) | [array of 0] |
| $.stories.threads[8].placed | (absent) | {object with 2 keys} |
| $.stories.threads[9].records | (absent) | [array of 1] |
| $.stories.threads[9].placed | (absent) | {object with 2 keys} |
| $.stories.threads[10].records | (absent) | [array of 0] |
| $.stories.threads[10].placed | (absent) | {object with 2 keys} |
| $.stories.threads[11].records | (absent) | [array of 1] |

...and 52 more paths (see the JSON file).

### collector GET /api/collector/overview?period=weekly

Session reads, id 754287b66e1e2e10, 410853 bytes to 414118 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 1] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 0] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.stories.threads[3].records | (absent) | [array of 0] |
| $.stories.threads[3].placed | (absent) | {object with 2 keys} |
| $.stories.threads[4].records | (absent) | [array of 2] |
| $.stories.threads[4].placed | (absent) | {object with 2 keys} |
| $.stories.threads[5].records | (absent) | [array of 0] |
| $.stories.threads[5].placed | (absent) | {object with 2 keys} |
| $.stories.threads[6].records | (absent) | [array of 1] |
| $.stories.threads[6].placed | (absent) | {object with 2 keys} |
| $.stories.threads[7].records | (absent) | [array of 0] |
| $.stories.threads[7].placed | (absent) | {object with 2 keys} |
| $.stories.threads[8].records | (absent) | [array of 0] |
| $.stories.threads[8].placed | (absent) | {object with 2 keys} |
| $.stories.threads[9].records | (absent) | [array of 1] |
| $.stories.threads[9].placed | (absent) | {object with 2 keys} |
| $.stories.threads[10].records | (absent) | [array of 0] |
| $.stories.threads[10].placed | (absent) | {object with 2 keys} |
| $.stories.threads[11].records | (absent) | [array of 1] |

...and 66 more paths (see the JSON file).

### collector GET /api/collector/overview?period=monthly

Session reads, id b2be60661f0640d7, 553513 bytes to 556971 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 1] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 0] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.stories.threads[3].records | (absent) | [array of 2] |
| $.stories.threads[3].placed | (absent) | {object with 2 keys} |
| $.stories.threads[4].records | (absent) | [array of 0] |
| $.stories.threads[4].placed | (absent) | {object with 2 keys} |
| $.stories.threads[5].records | (absent) | [array of 1] |
| $.stories.threads[5].placed | (absent) | {object with 2 keys} |
| $.stories.threads[6].records | (absent) | [array of 0] |
| $.stories.threads[6].placed | (absent) | {object with 2 keys} |
| $.stories.threads[7].records | (absent) | [array of 0] |
| $.stories.threads[7].placed | (absent) | {object with 2 keys} |
| $.stories.threads[8].records | (absent) | [array of 1] |
| $.stories.threads[8].placed | (absent) | {object with 2 keys} |
| $.stories.threads[9].records | (absent) | [array of 0] |
| $.stories.threads[9].placed | (absent) | {object with 2 keys} |
| $.stories.threads[10].records | (absent) | [array of 1] |
| $.stories.threads[10].placed | (absent) | {object with 2 keys} |
| $.stories.threads[11].records | (absent) | [array of 0] |

...and 72 more paths (see the JSON file).

### collector GET /api/collector/overview?period=quarterly

Session reads, id b421657684ecf5d9, 592448 bytes to 595906 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 1] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 0] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.stories.threads[3].records | (absent) | [array of 2] |
| $.stories.threads[3].placed | (absent) | {object with 2 keys} |
| $.stories.threads[4].records | (absent) | [array of 0] |
| $.stories.threads[4].placed | (absent) | {object with 2 keys} |
| $.stories.threads[5].records | (absent) | [array of 1] |
| $.stories.threads[5].placed | (absent) | {object with 2 keys} |
| $.stories.threads[6].records | (absent) | [array of 0] |
| $.stories.threads[6].placed | (absent) | {object with 2 keys} |
| $.stories.threads[7].records | (absent) | [array of 0] |
| $.stories.threads[7].placed | (absent) | {object with 2 keys} |
| $.stories.threads[8].records | (absent) | [array of 1] |
| $.stories.threads[8].placed | (absent) | {object with 2 keys} |
| $.stories.threads[9].records | (absent) | [array of 0] |
| $.stories.threads[9].placed | (absent) | {object with 2 keys} |
| $.stories.threads[10].records | (absent) | [array of 1] |
| $.stories.threads[10].placed | (absent) | {object with 2 keys} |
| $.stories.threads[11].records | (absent) | [array of 0] |

...and 72 more paths (see the JSON file).

### collector GET /api/collector/overview?taluk=TLK-MYL

Session reads, id ee66b8bc8550bfdb, 75615 bytes to 75050 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.bell[1].id | INC-20261105-6B3555 | INC-20260515-ACC375 |
| $.bell[1].title | Cooum River - Chetpet stretch spilling over bank at Chetpet (MGR St) | Field staff report water stagnation on Easwar Nagar 2nd Street, Kodambakkam; pumping needed |
| $.bell[1].dept | PWD-WRD | GCC-SWD |
| $.bell[1].dept_name | PWD Water Resources | Storm Water Drain |
| $.bell[1].zone | 5 | 9 |
| $.bell[1].zone_name | Royapuram | Teynampet |
| $.bell[1].ward | 61 | 117 |
| $.bell[1].loc | Chetpet (Cooum River - Chetpet stretch) | Easwar Nagar 2Nd Street, Kodambakkam |
| $.bell[1].lat | 13.077519 | 13.04700595469118 |
| $.bell[1].lon | 80.262494 | 80.24764685563461 |
| $.bell[1].sev | Severe | High |
| $.bell[1].verified | 0 | 1 |
| $.bell[1].complaints | 0 | 3 |
| $.bell[1].sources | pwd | grievance\|pwd |
| $.bell[1].source_count | 1 | 2 |
| $.bell[1].channels | media | citizen_app\|field_staff |
| $.bell[1].t | 2026-11-05 20:48:55 | 2026-11-06 08:41:55 |
| $.bell[1].summary | 1 report (News) about flooding & waterlogging at Chetpet (Cooum River - Chetpet stretch), Ward 61 (Royapuram). First reported 05 Nov 20:48. ... (160 chars) | 4 reports (Grievance portal, PWD field staff) about flooding & waterlogging at Easwar Nagar 2Nd Street, Kodambakkam, Ward 117 (Teynampet). F... (188 chars) |
| $.bell[1].priority | 113 | 93 |
| $.bell[1].breached | 1 | 0 |
| $.bell[1].sla_due | 2026-11-06 02:48:55 | 2026-11-07 08:41:55 |
| $.bell[1].hours_open | 21.3 | 9.4 |
| $.bell[1].severity_reasons | canal overflow (+45); Partial service disruption (+5); Access blocked (+10); About 600 people affected (+15) | High-risk issue: Water entering Home/Shop (+35); Affects bus_stop, children, elderly (+24) |

...and 114 more paths (see the JSON file).

### collector GET /api/collector/overview?taluk=TLK-SHN

Session reads, id 8d15afb2d6fc9841, 50101 bytes to 48282 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.bell.length | 6 | 5 |
| $.bell[0].id | INC-20260515-B939EB | INC-20261105-6D03C9 |
| $.bell[0].title | Ice House: uprooted tree blocks road | Pls send pumpset to Bajanai Koil St, Pallikaranai |
| $.bell[0].zone | 9 | 15 |
| $.bell[0].zone_name | Teynampet | Sholinganallur |
| $.bell[0].ward | 115 | 197 |
| $.bell[0].loc | Ice House | Pallikaranai (Pallikaranai Marsh Outlet Drain) |
| $.bell[0].lat | 13.05345339618489 | 12.902577 |
| $.bell[0].lon | 80.2708643260533 | 80.224033 |
| $.bell[0].verified | 1 | 0 |
| $.bell[0].complaints | 3 | 0 |
| $.bell[0].sources | grievance\|police\|pwd | pwd |
| $.bell[0].source_count | 3 | 1 |
| $.bell[0].channels | citizen_app\|control_room_112\|field_staff | control_room |
| $.bell[0].t | 2026-11-06 05:59:00 | 2026-11-05 21:13:47 |
| $.bell[0].summary | 7 reports (Grievance portal, PWD field staff, Police 112) about flooding & waterlogging at Ice House, Ward 115 (Teynampet). First reported 0... (173 chars) | 1 report (PWD control room) about flooding & waterlogging at Pallikaranai (Pallikaranai Marsh Outlet Drain), Ward 197 (Sholinganallur). Firs... (185 chars) |
| $.bell[0].priority | 136.9 | 116 |
| $.bell[0].sla_due | 2026-11-06 11:59:00 | 2026-11-06 03:13:47 |
| $.bell[0].hours_open | 12.2 | 20.9 |
| $.bell[0].severity_reasons | canal overflow (+45); Full service disruption (+15); Access blocked (+10); About 339 people affected (+10) | waterlogging (+35); Partial service disruption (+5); Access blocked (+10); About 750 people affected (+15); Affects worship (+8) |
| $.bell[0].priority_reasons | Severe flooding & waterlogging (80); reported by 3 sources; 3 citizen complaints; resolution over twice the 6 h target; 7 new reports in 24 ... (248 chars) | Severe flooding & waterlogging (73); resolution over twice the 6 h target; not yet verified by an officer; affects worship; linked to a rain... (184 chars) |

...and 117 more paths (see the JSON file).

### collector GET /api/collector/overview?taluk=TLK-MDR

Session reads, id 13cfa0f8f9a75092, 61654 bytes to 55837 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 0] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 0] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.bell.length | 6 | 2 |
| $.bell[0].id | INC-20260515-B939EB | INC-20261105-F6BC59 |
| $.bell[0].title | Ice House: uprooted tree blocks road | Low lying area Anna St, Porur inundated. Water level nearly 2 ft |
| $.bell[0].zone | 9 | 11 |
| $.bell[0].zone_name | Teynampet | Valasaravakkam |
| $.bell[0].ward | 115 | 147 |
| $.bell[0].loc | Ice House | Porur |
| $.bell[0].lat | 13.05345339618489 | 13.058552 |
| $.bell[0].lon | 80.2708643260533 | 80.172248 |
| $.bell[0].sev | Severe | High |
| $.bell[0].verified | 1 | 0 |
| $.bell[0].complaints | 3 | 0 |
| $.bell[0].sources | grievance\|police\|pwd | pwd |
| $.bell[0].source_count | 3 | 1 |
| $.bell[0].channels | citizen_app\|control_room_112\|field_staff | citizen_grievance |
| $.bell[0].t | 2026-11-06 05:59:00 | 2026-11-05 21:28:32 |
| $.bell[0].summary | 7 reports (Grievance portal, PWD field staff, Police 112) about flooding & waterlogging at Ice House, Ward 115 (Teynampet). First reported 0... (173 chars) | 1 report (Citizen grievance) about flooding & waterlogging at Porur, Ward 147 (Valasaravakkam). First reported 05 Nov 21:28. Status: in prog... (145 chars) |

...and 51 more paths (see the JSON file).

### collector GET /api/collector/overview?zone=5

Session reads, id 26c06b6bcb04c5cd, 73560 bytes to 71696 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.bell.length | 6 | 5 |
| $.bell[0].id | INC-20260515-B939EB | INC-20261105-6B3555 |
| $.bell[0].title | Ice House: uprooted tree blocks road | Cooum River - Chetpet stretch spilling over bank at Chetpet (MGR St) |
| $.bell[0].zone | 9 | 5 |
| $.bell[0].zone_name | Teynampet | Royapuram |
| $.bell[0].ward | 115 | 61 |
| $.bell[0].loc | Ice House | Chetpet (Cooum River - Chetpet stretch) |
| $.bell[0].lat | 13.05345339618489 | 13.077519 |
| $.bell[0].lon | 80.2708643260533 | 80.262494 |
| $.bell[0].verified | 1 | 0 |
| $.bell[0].complaints | 3 | 0 |
| $.bell[0].sources | grievance\|police\|pwd | pwd |
| $.bell[0].source_count | 3 | 1 |
| $.bell[0].channels | citizen_app\|control_room_112\|field_staff | media |
| $.bell[0].t | 2026-11-06 05:59:00 | 2026-11-05 20:48:55 |
| $.bell[0].summary | 7 reports (Grievance portal, PWD field staff, Police 112) about flooding & waterlogging at Ice House, Ward 115 (Teynampet). First reported 0... (173 chars) | 1 report (News) about flooding & waterlogging at Chetpet (Cooum River - Chetpet stretch), Ward 61 (Royapuram). First reported 05 Nov 20:48. ... (160 chars) |
| $.bell[0].priority | 136.9 | 113 |
| $.bell[0].sla_due | 2026-11-06 11:59:00 | 2026-11-06 02:48:55 |
| $.bell[0].hours_open | 12.2 | 21.3 |
| $.bell[0].severity_reasons | canal overflow (+45); Full service disruption (+15); Access blocked (+10); About 339 people affected (+10) | canal overflow (+45); Partial service disruption (+5); Access blocked (+10); About 600 people affected (+15) |
| $.bell[0].priority_reasons | Severe flooding & waterlogging (80); reported by 3 sources; 3 citizen complaints; resolution over twice the 6 h target; 7 new reports in 24 ... (248 chars) | Severe flooding & waterlogging (75); resolution over twice the 6 h target; not yet verified by an officer; linked to a rain event; 21 simila... (167 chars) |
| $.bell[0].attention_reason | Well past its deadline, Needs several departments, Spreading: several new reports in 24 h | Severe and not verified, Well past its deadline |
| $.bell[0].officer | Superintending Engineer, WRD Chennai Circle (J. Murugesan) | null |

...and 104 more paths (see the JSON file).

### collector GET /api/collector/overview?zone=13

Session reads, id d04519dc5d7628c2, 75749 bytes to 71121 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 0] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.bell.length | 6 | 3 |
| $.bell[0].id | INC-20260515-B939EB | INC-20261105-5C94BB |
| $.bell[0].title | Ice House: uprooted tree blocks road | Call recd: canal water flowing into Srinivasa Nagar 6th St, Saidapet from Adyar River |
| $.bell[0].zone | 9 | 13 |
| $.bell[0].zone_name | Teynampet | Adyar |
| $.bell[0].ward | 115 | 170 |
| $.bell[0].loc | Ice House | Saidapet (Adyar River - Saidapet stretch) |
| $.bell[0].lat | 13.05345339618489 | 13.010337 |
| $.bell[0].lon | 80.2708643260533 | 80.206788 |
| $.bell[0].verified | 1 | 0 |
| $.bell[0].complaints | 3 | 0 |
| $.bell[0].sources | grievance\|police\|pwd | pwd |
| $.bell[0].source_count | 3 | 1 |
| $.bell[0].channels | citizen_app\|control_room_112\|field_staff | control_room |
| $.bell[0].t | 2026-11-06 05:59:00 | 2026-11-05 23:41:50 |
| $.bell[0].summary | 7 reports (Grievance portal, PWD field staff, Police 112) about flooding & waterlogging at Ice House, Ward 115 (Teynampet). First reported 0... (173 chars) | 1 report (PWD control room) about flooding & waterlogging at Saidapet (Adyar River - Saidapet stretch), Ward 170 (Adyar). First reported 05 ... (171 chars) |
| $.bell[0].priority | 136.9 | 113 |
| $.bell[0].sla_due | 2026-11-06 11:59:00 | 2026-11-06 05:41:50 |
| $.bell[0].hours_open | 12.2 | 18.4 |
| $.bell[0].severity_reasons | canal overflow (+45); Full service disruption (+15); Access blocked (+10); About 339 people affected (+10) | canal overflow (+45); Full service disruption (+15); About 500 people affected (+15) |
| $.bell[0].priority_reasons | Severe flooding & waterlogging (80); reported by 3 sources; 3 citizen complaints; resolution over twice the 6 h target; 7 new reports in 24 ... (248 chars) | Severe flooding & waterlogging (75); resolution over twice the 6 h target; not yet verified by an officer; linked to a rain event; 15 simila... (167 chars) |

...and 62 more paths (see the JSON file).

### collector GET /api/collector/overview?zone=1

Session reads, id cddb8f25b6b9a109, 38687 bytes to 31182 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.bell.length | 6 | 1 |
| $.bell[0].id | INC-20260515-B939EB | INC-20261106-C854D7 |
| $.bell[0].title | Ice House: uprooted tree blocks road | Fatal crash near Ennore Creek Bridge |
| $.bell[0].type | Flooding & waterlogging | Road accident |
| $.bell[0].cat_code | FLOOD_WATERLOGGING | ROAD_ACCIDENT |
| $.bell[0].family | FLOOD | ROADS_TRAFFIC |
| $.bell[0].dept | PWD-WRD | POL-GCP |
| $.bell[0].dept_name | PWD Water Resources | Greater Chennai Police |
| $.bell[0].zone | 9 | 1 |
| $.bell[0].zone_name | Teynampet | Thiruvottiyur |
| $.bell[0].ward | 115 | 2 |
| $.bell[0].loc | Ice House | Ennore |
| $.bell[0].lat | 13.05345339618489 | 13.215571 |
| $.bell[0].lon | 80.2708643260533 | 80.327012 |
| $.bell[0].complaints | 3 | 0 |
| $.bell[0].sources | grievance\|police\|pwd | police |
| $.bell[0].source_count | 3 | 1 |
| $.bell[0].channels | citizen_app\|control_room_112\|field_staff | citizen_grievance |
| $.bell[0].t | 2026-11-06 05:59:00 | 2026-11-06 04:56:22 |
| $.bell[0].summary | 7 reports (Grievance portal, PWD field staff, Police 112) about flooding & waterlogging at Ice House, Ward 115 (Teynampet). First reported 0... (173 chars) | 1 report (Citizen grievance) about road accident at Ennore, Ward 2 (Thiruvottiyur). First reported 06 Nov 04:56. Status: in progress. |
| $.bell[0].priority | 136.9 | 96 |
| $.bell[0].breached | 1 | 0 |
| $.bell[0].sla_due | 2026-11-06 11:59:00 | 2026-11-06 06:56:22 |

...and 17 more paths (see the JSON file).

### collector GET /api/collector/overview?zone=8

Session reads, id 3f3ddc093af4ab49, 55567 bytes to 51530 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 0] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.bell.length | 6 | 4 |
| $.bell[0].id | INC-20260515-B939EB | INC-20261105-DB3F54 |
| $.bell[0].title | Ice House: uprooted tree blocks road | Car accident reported at Anna Nagar |
| $.bell[0].type | Flooding & waterlogging | Road accident |
| $.bell[0].cat_code | FLOOD_WATERLOGGING | ROAD_ACCIDENT |
| $.bell[0].family | FLOOD | ROADS_TRAFFIC |
| $.bell[0].dept | PWD-WRD | POL-GCP |
| $.bell[0].dept_name | PWD Water Resources | Greater Chennai Police |
| $.bell[0].zone | 9 | 8 |
| $.bell[0].zone_name | Teynampet | Anna Nagar |
| $.bell[0].ward | 115 | 100 |
| $.bell[0].loc | Ice House | Anna Nagar |
| $.bell[0].lat | 13.05345339618489 | 13.088555 |
| $.bell[0].lon | 80.2708643260533 | 80.210866 |
| $.bell[0].sev | Severe | High |
| $.bell[0].complaints | 3 | 0 |
| $.bell[0].sources | grievance\|police\|pwd | police |
| $.bell[0].source_count | 3 | 1 |
| $.bell[0].channels | citizen_app\|control_room_112\|field_staff | citizen_grievance\|control_room_112\|fir_walk_in |
| $.bell[0].t | 2026-11-06 05:59:00 | 2026-11-05 21:33:26 |
| $.bell[0].summary | 7 reports (Grievance portal, PWD field staff, Police 112) about flooding & waterlogging at Ice House, Ward 115 (Teynampet). First reported 0... (173 chars) | 3 reports (Citizen grievance, Police 112, Police FIR) about road accident at Anna Nagar, Ward 100 (Anna Nagar). First reported 05 Nov 21:33.... (161 chars) |

...and 112 more paths (see the JSON file).

### collector GET /api/collector/overview?zone=15

Session reads, id e90fdb13f88d1157, 46893 bytes to 45074 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.bell.length | 6 | 5 |
| $.bell[0].id | INC-20260515-B939EB | INC-20261105-6D03C9 |
| $.bell[0].title | Ice House: uprooted tree blocks road | Pls send pumpset to Bajanai Koil St, Pallikaranai |
| $.bell[0].zone | 9 | 15 |
| $.bell[0].zone_name | Teynampet | Sholinganallur |
| $.bell[0].ward | 115 | 197 |
| $.bell[0].loc | Ice House | Pallikaranai (Pallikaranai Marsh Outlet Drain) |
| $.bell[0].lat | 13.05345339618489 | 12.902577 |
| $.bell[0].lon | 80.2708643260533 | 80.224033 |
| $.bell[0].verified | 1 | 0 |
| $.bell[0].complaints | 3 | 0 |
| $.bell[0].sources | grievance\|police\|pwd | pwd |
| $.bell[0].source_count | 3 | 1 |
| $.bell[0].channels | citizen_app\|control_room_112\|field_staff | control_room |
| $.bell[0].t | 2026-11-06 05:59:00 | 2026-11-05 21:13:47 |
| $.bell[0].summary | 7 reports (Grievance portal, PWD field staff, Police 112) about flooding & waterlogging at Ice House, Ward 115 (Teynampet). First reported 0... (173 chars) | 1 report (PWD control room) about flooding & waterlogging at Pallikaranai (Pallikaranai Marsh Outlet Drain), Ward 197 (Sholinganallur). Firs... (185 chars) |
| $.bell[0].priority | 136.9 | 116 |
| $.bell[0].sla_due | 2026-11-06 11:59:00 | 2026-11-06 03:13:47 |
| $.bell[0].hours_open | 12.2 | 20.9 |
| $.bell[0].severity_reasons | canal overflow (+45); Full service disruption (+15); Access blocked (+10); About 339 people affected (+10) | waterlogging (+35); Partial service disruption (+5); Access blocked (+10); About 750 people affected (+15); Affects worship (+8) |
| $.bell[0].priority_reasons | Severe flooding & waterlogging (80); reported by 3 sources; 3 citizen complaints; resolution over twice the 6 h target; 7 new reports in 24 ... (248 chars) | Severe flooding & waterlogging (73); resolution over twice the 6 h target; not yet verified by an officer; affects worship; linked to a rain... (184 chars) |

...and 117 more paths (see the JSON file).

### collector GET /api/collector/overview?period=weekly&zone=5

Session reads, id 0498feb041980d20, 179713 bytes to 178242 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 1] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 1] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.stories.threads[3].records | (absent) | [array of 0] |
| $.stories.threads[3].placed | (absent) | {object with 2 keys} |
| $.stories.threads[4].records | (absent) | [array of 0] |
| $.stories.threads[4].placed | (absent) | {object with 2 keys} |
| $.stories.threads[5].records | (absent) | [array of 0] |
| $.stories.threads[5].placed | (absent) | {object with 2 keys} |
| $.bell[0].id | INC-20260516-4D00AC | INC-20261022-73B9C3 |
| $.bell[0].title | Floodwater traps residents near Temple St | Seven Wells: inundation strands residents |
| $.bell[0].zone | 8 | 5 |
| $.bell[0].zone_name | Anna Nagar | Royapuram |
| $.bell[0].ward | 104 | 56 |
| $.bell[0].loc | Kilpauk | Seven Wells |
| $.bell[0].lat | 13.07901216088879 | 13.09691483485246 |
| $.bell[0].lon | 80.25235564528812 | 80.28547780805405 |
| $.bell[0].complaints | 5 | 1 |
| $.bell[0].channels | citizen_app\|control_room_112\|field_staff | citizen_app\|control_room\|control_room_112\|field_staff |
| $.bell[0].t | 2026-11-03 09:26:14 | 2026-11-02 20:06:53 |

...and 175 more paths (see the JSON file).

### collector GET /api/collector/overview?period=monthly&zone=13

Session reads, id 31959f5180fff1e5, 233672 bytes to 234052 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 0] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 0] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 0] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.stories.threads[3].records | (absent) | [array of 1] |
| $.stories.threads[3].placed | (absent) | {object with 2 keys} |
| $.stories.threads[4].records | (absent) | [array of 0] |
| $.stories.threads[4].placed | (absent) | {object with 2 keys} |
| $.stories.threads[5].records | (absent) | [array of 1] |
| $.stories.threads[5].placed | (absent) | {object with 2 keys} |
| $.stories.threads[6].records | (absent) | [array of 1] |
| $.stories.threads[6].placed | (absent) | {object with 2 keys} |
| $.stories.threads[7].records | (absent) | [array of 1] |
| $.stories.threads[7].placed | (absent) | {object with 2 keys} |
| $.stories.threads[8].records | (absent) | [array of 0] |
| $.stories.threads[8].placed | (absent) | {object with 2 keys} |
| $.stories.threads[9].records | (absent) | [array of 0] |
| $.stories.threads[9].placed | (absent) | {object with 2 keys} |
| $.stories.threads[10].records | (absent) | [array of 0] |
| $.stories.threads[10].placed | (absent) | {object with 2 keys} |
| $.stories.threads[11].records | (absent) | [array of 1] |

...and 226 more paths (see the JSON file).

### collector GET /api/collector/overview?period=quarterly&zone=1

Session reads, id 75351ec64df2030f, 209634 bytes to 210246 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 0] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 0] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.stories.threads[3].records | (absent) | [array of 1] |
| $.stories.threads[3].placed | (absent) | {object with 2 keys} |
| $.stories.threads[4].records | (absent) | [array of 1] |
| $.stories.threads[4].placed | (absent) | {object with 2 keys} |
| $.stories.threads[5].records | (absent) | [array of 0] |
| $.stories.threads[5].placed | (absent) | {object with 2 keys} |
| $.stories.threads[6].records | (absent) | [array of 1] |
| $.stories.threads[6].placed | (absent) | {object with 2 keys} |
| $.stories.threads[7].records | (absent) | [array of 1] |
| $.stories.threads[7].placed | (absent) | {object with 2 keys} |
| $.stories.threads[8].records | (absent) | [array of 1] |
| $.stories.threads[8].placed | (absent) | {object with 2 keys} |
| $.bell[0].id | INC-20260516-4D00AC | INC-20261025-09E045 |
| $.bell[0].title | Floodwater traps residents near Temple St | Floodwater traps residents near Periya Mettu Palayam 1st Road |
| $.bell[0].zone | 8 | 1 |
| $.bell[0].zone_name | Anna Nagar | Thiruvottiyur |
| $.bell[0].ward | 104 | 10 |

...and 173 more paths (see the JSON file).

### collector GET /api/collector/overview?period=weekly&dept=GCC-SWM

Session reads, id 21e6f5dd86122d0f, 108211 bytes to 108662 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 0] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 1] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 1] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.deptNav[1].unverified | 9 | 0 |
| $.deptNav[2].unverified | 2 | 0 |
| $.deptNav[3].unverified | 2 | 0 |
| $.deptNav[4].unverified | 11 | 0 |
| $.deptNav[5].unverified | 14 | 0 |
| $.deptNav[6].unverified | 15 | 0 |
| $.deptNav[9].unverified | 1 | 0 |
| $.deptNav[10].unverified | 2 | 0 |
| $.periodInfo.resolved | (absent) | Resolved, last 7 days |

### collector GET /api/collector/overview?period=monthly&dept=CMWSSB

Session reads, id 18116763af0cce8f, 54673 bytes to 55390 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 1] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 0] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.stories.threads[3].records | (absent) | [array of 2] |
| $.stories.threads[3].placed | (absent) | {object with 2 keys} |
| $.deptNav[1].unverified | 18 | 0 |
| $.deptNav[2].unverified | 13 | 0 |
| $.deptNav[3].unverified | 5 | 0 |
| $.deptNav[4].unverified | 22 | 0 |
| $.deptNav[5].unverified | 12 | 0 |
| $.deptNav[6].unverified | 17 | 0 |
| $.deptNav[7].unverified | 3 | 0 |
| $.deptNav[10].unverified | 3 | 0 |
| $.deptNav[11].unverified | 3 | 0 |
| $.deptNav[12].unverified | 1 | 0 |
| $.deptNav[15].unverified | 1 | 0 |
| $.deptNav[17].unverified | 1 | 0 |
| $.deptNav[18].unverified | 1 | 0 |
| $.deptNav[20].unverified | 1 | 0 |
| $.periodInfo.resolved | (absent) | Resolved, last 30 days |

### collector GET /api/collector/overview?zone=8&dept=GCC-ELE

Session reads, id 1f1702587c9a7fb7, 21676 bytes to 18828 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.bell.length | 2 | 0 |
| $.bell[0] | {object with 40 keys} | (absent) |
| $.bell[1] | {object with 40 keys} | (absent) |
| $.periodInfo.resolved | (absent) | Resolved, last 24 hours |

### collector GET /api/collector/overview?period=monthly&zone=13&cat=SOLID_WASTE

Session reads, id 90e5dddcfac3a41d, 61101 bytes to 51278 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.bell.length | 6 | 0 |
| $.bell[0] | {object with 40 keys} | (absent) |
| $.bell[1] | {object with 40 keys} | (absent) |
| $.bell[2] | {object with 40 keys} | (absent) |
| $.bell[3] | {object with 40 keys} | (absent) |
| $.bell[4] | {object with 40 keys} | (absent) |
| $.bell[5] | {object with 40 keys} | (absent) |
| $.deptNav[0].unverified | 5 | 0 |
| $.periodInfo.resolved | (absent) | Resolved, last 30 days |

### collector GET /api/collector/overview?period=weekly&taluk=TLK-MYL

Session reads, id e120e15ec8222ac8, 140771 bytes to 140748 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 0] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 0] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 0] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.stories.threads[3].records | (absent) | [array of 0] |
| $.stories.threads[3].placed | (absent) | {object with 2 keys} |
| $.stories.threads[4].records | (absent) | [array of 0] |
| $.stories.threads[4].placed | (absent) | {object with 2 keys} |
| $.stories.threads[5].records | (absent) | [array of 0] |
| $.stories.threads[5].placed | (absent) | {object with 2 keys} |
| $.stories.threads[6].records | (absent) | [array of 0] |
| $.stories.threads[6].placed | (absent) | {object with 2 keys} |
| $.stories.threads[7].records | (absent) | [array of 1] |
| $.stories.threads[7].placed | (absent) | {object with 2 keys} |
| $.bell[0].id | INC-20260516-4D00AC | INC-20260515-B939EB |
| $.bell[0].title | Floodwater traps residents near Temple St | Ice House: uprooted tree blocks road |
| $.bell[0].zone | 8 | 9 |
| $.bell[0].zone_name | Anna Nagar | Teynampet |
| $.bell[0].ward | 104 | 115 |
| $.bell[0].loc | Kilpauk | Ice House |
| $.bell[0].lat | 13.07901216088879 | 13.05345339618489 |

...and 155 more paths (see the JSON file).

### collector GET /api/collector/pattern?kind=spike&cat=FLOOD_WATERLOGGING&zone=4&date=2026-11-04

Session reads, id 276fda7fdf731ca0, 16994 bytes to 17124 bytes.

| Path | A | B |
|---|---|---|
| $.incidents[0].open_now | (absent) | 0 |
| $.incidents[1].open_now | (absent) | 1 |
| $.incidents[2].open_now | (absent) | 1 |
| $.incidents[3].open_now | (absent) | 1 |
| $.incidents[4].open_now | (absent) | 1 |
| $.incidents[5].open_now | (absent) | 1 |
| $.incidents[6].open_now | (absent) | 1 |
| $.incidents[7].open_now | (absent) | 1 |
| $.incidents[8].open_now | (absent) | 1 |
| $.incidents[9].open_now | (absent) | 1 |

### collector GET /api/collector/pattern?kind=spike&cat=AIR_POLLUTION&zone=2&date=2026-11-03

Session reads, id bc71a187fe97be77, 10850 bytes to 10954 bytes.

| Path | A | B |
|---|---|---|
| $.incidents[0].open_now | (absent) | 1 |
| $.incidents[1].open_now | (absent) | 1 |
| $.incidents[2].open_now | (absent) | 1 |
| $.incidents[3].open_now | (absent) | 1 |
| $.incidents[4].open_now | (absent) | 0 |
| $.incidents[5].open_now | (absent) | 0 |
| $.incidents[6].open_now | (absent) | 0 |
| $.incidents[7].open_now | (absent) | 0 |

### collector GET /api/collector/pattern?kind=hotspot&id=HOT-SOLID_WASTE-051

Session reads, id 46a33d0d3fc32bc0, 4670 bytes to 4709 bytes.

| Path | A | B |
|---|---|---|
| $.incidents[0].open_now | (absent) | 0 |
| $.incidents[1].open_now | (absent) | 0 |
| $.incidents[2].open_now | (absent) | 0 |

### collector GET /api/collector/pattern?kind=hotspot&id=HOT-TRAFFIC_OBSTRUCTION-015

Session reads, id 10821fe719c088e0, 6921 bytes to 6986 bytes.

| Path | A | B |
|---|---|---|
| $.incidents[0].open_now | (absent) | 1 |
| $.incidents[1].open_now | (absent) | 0 |
| $.incidents[2].open_now | (absent) | 0 |
| $.incidents[3].open_now | (absent) | 0 |
| $.incidents[4].open_now | (absent) | 0 |

### collector GET /api/collector/pattern?kind=category&cat=SOLID_WASTE

Session reads, id 2a134a069df47837, 76708 bytes to 77488 bytes.

| Path | A | B |
|---|---|---|
| $.incidents[0].open_now | (absent) | 1 |
| $.incidents[1].open_now | (absent) | 0 |
| $.incidents[2].open_now | (absent) | 1 |
| $.incidents[3].open_now | (absent) | 0 |
| $.incidents[4].open_now | (absent) | 1 |
| $.incidents[5].open_now | (absent) | 0 |
| $.incidents[6].open_now | (absent) | 0 |
| $.incidents[7].open_now | (absent) | 0 |
| $.incidents[8].open_now | (absent) | 0 |
| $.incidents[9].open_now | (absent) | 1 |
| $.incidents[10].open_now | (absent) | 0 |
| $.incidents[11].open_now | (absent) | 1 |
| $.incidents[12].open_now | (absent) | 1 |
| $.incidents[13].open_now | (absent) | 0 |
| $.incidents[14].open_now | (absent) | 0 |
| $.incidents[15].open_now | (absent) | 0 |
| $.incidents[16].open_now | (absent) | 0 |
| $.incidents[17].open_now | (absent) | 0 |
| $.incidents[18].open_now | (absent) | 0 |
| $.incidents[19].open_now | (absent) | 0 |
| $.incidents[20].open_now | (absent) | 1 |
| $.incidents[21].open_now | (absent) | 0 |
| $.incidents[22].open_now | (absent) | 0 |
| $.incidents[23].open_now | (absent) | 0 |
| $.incidents[24].open_now | (absent) | 0 |

...and 35 more paths (see the JSON file).

### collector GET /api/collector/pattern?kind=category&cat=DARK_SPOT_SAFETY

Session reads, id 1c871c4841490e97, 78153 bytes to 78933 bytes.

| Path | A | B |
|---|---|---|
| $.incidents[0].open_now | (absent) | 0 |
| $.incidents[1].open_now | (absent) | 1 |
| $.incidents[2].open_now | (absent) | 1 |
| $.incidents[3].open_now | (absent) | 1 |
| $.incidents[4].open_now | (absent) | 1 |
| $.incidents[5].open_now | (absent) | 1 |
| $.incidents[6].open_now | (absent) | 0 |
| $.incidents[7].open_now | (absent) | 0 |
| $.incidents[8].open_now | (absent) | 0 |
| $.incidents[9].open_now | (absent) | 0 |
| $.incidents[10].open_now | (absent) | 0 |
| $.incidents[11].open_now | (absent) | 0 |
| $.incidents[12].open_now | (absent) | 1 |
| $.incidents[13].open_now | (absent) | 0 |
| $.incidents[14].open_now | (absent) | 1 |
| $.incidents[15].open_now | (absent) | 0 |
| $.incidents[16].open_now | (absent) | 1 |
| $.incidents[17].open_now | (absent) | 1 |
| $.incidents[18].open_now | (absent) | 0 |
| $.incidents[19].open_now | (absent) | 0 |
| $.incidents[20].open_now | (absent) | 1 |
| $.incidents[21].open_now | (absent) | 0 |
| $.incidents[22].open_now | (absent) | 0 |
| $.incidents[23].open_now | (absent) | 0 |
| $.incidents[24].open_now | (absent) | 1 |

...and 35 more paths (see the JSON file).

### collector GET /api/collector/pattern?kind=category&cat=FOOD_SAFETY

Session reads, id 72f4b341f2837710, 61994 bytes to 62631 bytes.

| Path | A | B |
|---|---|---|
| $.incidents[0].open_now | (absent) | 1 |
| $.incidents[1].open_now | (absent) | 1 |
| $.incidents[2].open_now | (absent) | 1 |
| $.incidents[3].open_now | (absent) | 0 |
| $.incidents[4].open_now | (absent) | 1 |
| $.incidents[5].open_now | (absent) | 0 |
| $.incidents[6].open_now | (absent) | 0 |
| $.incidents[7].open_now | (absent) | 0 |
| $.incidents[8].open_now | (absent) | 0 |
| $.incidents[9].open_now | (absent) | 1 |
| $.incidents[10].open_now | (absent) | 0 |
| $.incidents[11].open_now | (absent) | 0 |
| $.incidents[12].open_now | (absent) | 0 |
| $.incidents[13].open_now | (absent) | 0 |
| $.incidents[14].open_now | (absent) | 0 |
| $.incidents[15].open_now | (absent) | 0 |
| $.incidents[16].open_now | (absent) | 0 |
| $.incidents[17].open_now | (absent) | 0 |
| $.incidents[18].open_now | (absent) | 0 |
| $.incidents[19].open_now | (absent) | 0 |
| $.incidents[20].open_now | (absent) | 0 |
| $.incidents[21].open_now | (absent) | 0 |
| $.incidents[22].open_now | (absent) | 0 |
| $.incidents[23].open_now | (absent) | 0 |
| $.incidents[24].open_now | (absent) | 0 |

...and 24 more paths (see the JSON file).

### collector GET /api/collector/stories

Session reads, id e99a74413b658528, 197219 bytes to 199838 bytes.

| Path | A | B |
|---|---|---|
| $.threads[0].records | (absent) | [array of 1] |
| $.threads[0].placed | (absent) | {object with 2 keys} |
| $.threads[1].records | (absent) | [array of 1] |
| $.threads[1].placed | (absent) | {object with 2 keys} |
| $.threads[2].records | (absent) | [array of 0] |
| $.threads[2].placed | (absent) | {object with 2 keys} |
| $.threads[3].records | (absent) | [array of 0] |
| $.threads[3].placed | (absent) | {object with 2 keys} |
| $.threads[4].records | (absent) | [array of 2] |
| $.threads[4].placed | (absent) | {object with 2 keys} |
| $.threads[5].records | (absent) | [array of 1] |
| $.threads[5].placed | (absent) | {object with 2 keys} |
| $.threads[6].records | (absent) | [array of 0] |
| $.threads[6].placed | (absent) | {object with 2 keys} |
| $.threads[7].records | (absent) | [array of 0] |
| $.threads[7].placed | (absent) | {object with 2 keys} |
| $.threads[8].records | (absent) | [array of 1] |
| $.threads[8].placed | (absent) | {object with 2 keys} |
| $.threads[9].records | (absent) | [array of 1] |
| $.threads[9].placed | (absent) | {object with 2 keys} |
| $.threads[10].records | (absent) | [array of 0] |
| $.threads[10].placed | (absent) | {object with 2 keys} |
| $.threads[11].records | (absent) | [array of 1] |
| $.threads[11].placed | (absent) | {object with 2 keys} |
| $.threads[12].records | (absent) | [array of 0] |

...and 45 more paths (see the JSON file).

### collector GET /api/collector/stories?cat=PUBLIC_ORDER

Session reads, id 1b41f399335227fa, 2174 bytes to 2221 bytes.

| Path | A | B |
|---|---|---|
| $.threads[0].records | (absent) | [array of 0] |
| $.threads[0].placed | (absent) | {object with 2 keys} |

### collector GET /api/collector/stories?dept=POL-GCP

Session reads, id bea1e7f0bd88891d, 40109 bytes to 41130 bytes.

| Path | A | B |
|---|---|---|
| $.threads[0].records | (absent) | [array of 1] |
| $.threads[0].placed | (absent) | {object with 2 keys} |
| $.threads[1].records | (absent) | [array of 1] |
| $.threads[1].placed | (absent) | {object with 2 keys} |
| $.threads[2].records | (absent) | [array of 2] |
| $.threads[2].placed | (absent) | {object with 2 keys} |
| $.threads[3].records | (absent) | [array of 1] |
| $.threads[3].placed | (absent) | {object with 2 keys} |
| $.threads[4].records | (absent) | [array of 1] |
| $.threads[4].placed | (absent) | {object with 2 keys} |
| $.threads[5].records | (absent) | [array of 1] |
| $.threads[5].placed | (absent) | {object with 2 keys} |

### collector GET /api/collector/stories?period=daily

Session reads, id 3661d54ba19f6e08, 197219 bytes to 199838 bytes.

| Path | A | B |
|---|---|---|
| $.threads[0].records | (absent) | [array of 1] |
| $.threads[0].placed | (absent) | {object with 2 keys} |
| $.threads[1].records | (absent) | [array of 1] |
| $.threads[1].placed | (absent) | {object with 2 keys} |
| $.threads[2].records | (absent) | [array of 0] |
| $.threads[2].placed | (absent) | {object with 2 keys} |
| $.threads[3].records | (absent) | [array of 0] |
| $.threads[3].placed | (absent) | {object with 2 keys} |
| $.threads[4].records | (absent) | [array of 2] |
| $.threads[4].placed | (absent) | {object with 2 keys} |
| $.threads[5].records | (absent) | [array of 1] |
| $.threads[5].placed | (absent) | {object with 2 keys} |
| $.threads[6].records | (absent) | [array of 0] |
| $.threads[6].placed | (absent) | {object with 2 keys} |
| $.threads[7].records | (absent) | [array of 0] |
| $.threads[7].placed | (absent) | {object with 2 keys} |
| $.threads[8].records | (absent) | [array of 1] |
| $.threads[8].placed | (absent) | {object with 2 keys} |
| $.threads[9].records | (absent) | [array of 1] |
| $.threads[9].placed | (absent) | {object with 2 keys} |
| $.threads[10].records | (absent) | [array of 0] |
| $.threads[10].placed | (absent) | {object with 2 keys} |
| $.threads[11].records | (absent) | [array of 1] |
| $.threads[11].placed | (absent) | {object with 2 keys} |
| $.threads[12].records | (absent) | [array of 0] |

...and 45 more paths (see the JSON file).

### collector GET /api/collector/stories?period=weekly

Session reads, id 82e36b50644de8a5, 214790 bytes to 217866 bytes.

| Path | A | B |
|---|---|---|
| $.threads[0].records | (absent) | [array of 1] |
| $.threads[0].placed | (absent) | {object with 2 keys} |
| $.threads[1].records | (absent) | [array of 1] |
| $.threads[1].placed | (absent) | {object with 2 keys} |
| $.threads[2].records | (absent) | [array of 0] |
| $.threads[2].placed | (absent) | {object with 2 keys} |
| $.threads[3].records | (absent) | [array of 0] |
| $.threads[3].placed | (absent) | {object with 2 keys} |
| $.threads[4].records | (absent) | [array of 2] |
| $.threads[4].placed | (absent) | {object with 2 keys} |
| $.threads[5].records | (absent) | [array of 1] |
| $.threads[5].placed | (absent) | {object with 2 keys} |
| $.threads[6].records | (absent) | [array of 0] |
| $.threads[6].placed | (absent) | {object with 2 keys} |
| $.threads[7].records | (absent) | [array of 0] |
| $.threads[7].placed | (absent) | {object with 2 keys} |
| $.threads[8].records | (absent) | [array of 1] |
| $.threads[8].placed | (absent) | {object with 2 keys} |
| $.threads[9].records | (absent) | [array of 1] |
| $.threads[9].placed | (absent) | {object with 2 keys} |
| $.threads[10].records | (absent) | [array of 0] |
| $.threads[10].placed | (absent) | {object with 2 keys} |
| $.threads[11].records | (absent) | [array of 1] |
| $.threads[11].placed | (absent) | {object with 2 keys} |
| $.threads[12].records | (absent) | [array of 0] |

...and 51 more paths (see the JSON file).

### collector GET /api/collector/stories?period=monthly

Session reads, id 183ee1aad782f174, 207478 bytes to 210701 bytes.

| Path | A | B |
|---|---|---|
| $.threads[0].records | (absent) | [array of 1] |
| $.threads[0].placed | (absent) | {object with 2 keys} |
| $.threads[1].records | (absent) | [array of 1] |
| $.threads[1].placed | (absent) | {object with 2 keys} |
| $.threads[2].records | (absent) | [array of 0] |
| $.threads[2].placed | (absent) | {object with 2 keys} |
| $.threads[3].records | (absent) | [array of 0] |
| $.threads[3].placed | (absent) | {object with 2 keys} |
| $.threads[4].records | (absent) | [array of 2] |
| $.threads[4].placed | (absent) | {object with 2 keys} |
| $.threads[5].records | (absent) | [array of 1] |
| $.threads[5].placed | (absent) | {object with 2 keys} |
| $.threads[6].records | (absent) | [array of 0] |
| $.threads[6].placed | (absent) | {object with 2 keys} |
| $.threads[7].records | (absent) | [array of 0] |
| $.threads[7].placed | (absent) | {object with 2 keys} |
| $.threads[8].records | (absent) | [array of 1] |
| $.threads[8].placed | (absent) | {object with 2 keys} |
| $.threads[9].records | (absent) | [array of 1] |
| $.threads[9].placed | (absent) | {object with 2 keys} |
| $.threads[10].records | (absent) | [array of 0] |
| $.threads[10].placed | (absent) | {object with 2 keys} |
| $.threads[11].records | (absent) | [array of 1] |
| $.threads[11].placed | (absent) | {object with 2 keys} |
| $.threads[12].records | (absent) | [array of 0] |

...and 49 more paths (see the JSON file).

### collector GET /api/collector/stories?period=quarterly

Session reads, id 555e8879b7fe7a08, 207478 bytes to 210701 bytes.

| Path | A | B |
|---|---|---|
| $.threads[0].records | (absent) | [array of 1] |
| $.threads[0].placed | (absent) | {object with 2 keys} |
| $.threads[1].records | (absent) | [array of 1] |
| $.threads[1].placed | (absent) | {object with 2 keys} |
| $.threads[2].records | (absent) | [array of 0] |
| $.threads[2].placed | (absent) | {object with 2 keys} |
| $.threads[3].records | (absent) | [array of 0] |
| $.threads[3].placed | (absent) | {object with 2 keys} |
| $.threads[4].records | (absent) | [array of 2] |
| $.threads[4].placed | (absent) | {object with 2 keys} |
| $.threads[5].records | (absent) | [array of 1] |
| $.threads[5].placed | (absent) | {object with 2 keys} |
| $.threads[6].records | (absent) | [array of 0] |
| $.threads[6].placed | (absent) | {object with 2 keys} |
| $.threads[7].records | (absent) | [array of 0] |
| $.threads[7].placed | (absent) | {object with 2 keys} |
| $.threads[8].records | (absent) | [array of 1] |
| $.threads[8].placed | (absent) | {object with 2 keys} |
| $.threads[9].records | (absent) | [array of 1] |
| $.threads[9].placed | (absent) | {object with 2 keys} |
| $.threads[10].records | (absent) | [array of 0] |
| $.threads[10].placed | (absent) | {object with 2 keys} |
| $.threads[11].records | (absent) | [array of 1] |
| $.threads[11].placed | (absent) | {object with 2 keys} |
| $.threads[12].records | (absent) | [array of 0] |

...and 49 more paths (see the JSON file).

### collector GET /api/collector/stories?taluk=TLK-SHN

Session reads, id 1cb1b89e0d430263, 3816 bytes to 3972 bytes.

| Path | A | B |
|---|---|---|
| $.threads[0].records | (absent) | [array of 1] |
| $.threads[0].placed | (absent) | {object with 2 keys} |

### collector GET /api/collector/stories?taluk=TLK-MDR

Session reads, id 45af56f08bb06eda, 20434 bytes to 20716 bytes.

| Path | A | B |
|---|---|---|
| $.threads[0].records | (absent) | [array of 0] |
| $.threads[0].placed | (absent) | {object with 2 keys} |
| $.threads[1].records | (absent) | [array of 1] |
| $.threads[1].placed | (absent) | {object with 2 keys} |
| $.threads[2].records | (absent) | [array of 0] |
| $.threads[2].placed | (absent) | {object with 2 keys} |

### collector GET /api/collector/stories?zone=13

Session reads, id ce130eaff1fcbdac, 3436 bytes to 3494 bytes.

| Path | A | B |
|---|---|---|
| $.threads[0].records | (absent) | [array of 0] |
| $.threads[0].placed | (absent) | {object with 2 keys} |

### collector GET /api/collector/stories?zone=8

Session reads, id 6e2cda15e07b5065, 3216 bytes to 3273 bytes.

| Path | A | B |
|---|---|---|
| $.threads[0].records | (absent) | [array of 0] |
| $.threads[0].placed | (absent) | {object with 2 keys} |

### collector GET /api/collector/stories?zone=15

Session reads, id f738f8d9e91018e4, 3816 bytes to 3972 bytes.

| Path | A | B |
|---|---|---|
| $.threads[0].records | (absent) | [array of 1] |
| $.threads[0].placed | (absent) | {object with 2 keys} |

### collector GET /api/collector/stories?period=weekly&zone=5

Session reads, id 24838e4c01ccd501, 33728 bytes to 34353 bytes.

| Path | A | B |
|---|---|---|
| $.threads[0].records | (absent) | [array of 1] |
| $.threads[0].placed | (absent) | {object with 2 keys} |
| $.threads[1].records | (absent) | [array of 1] |
| $.threads[1].placed | (absent) | {object with 2 keys} |
| $.threads[2].records | (absent) | [array of 0] |
| $.threads[2].placed | (absent) | {object with 2 keys} |
| $.threads[3].records | (absent) | [array of 0] |
| $.threads[3].placed | (absent) | {object with 2 keys} |
| $.threads[4].records | (absent) | [array of 1] |
| $.threads[4].placed | (absent) | {object with 2 keys} |
| $.threads[5].records | (absent) | [array of 0] |
| $.threads[5].placed | (absent) | {object with 2 keys} |

### collector GET /api/collector/stories?period=monthly&zone=13

Session reads, id 7e20b8e17490cdb4, 220196 bytes to 222666 bytes.

| Path | A | B |
|---|---|---|
| $.threads[0].records | (absent) | [array of 0] |
| $.threads[0].placed | (absent) | {object with 2 keys} |
| $.threads[1].records | (absent) | [array of 0] |
| $.threads[1].placed | (absent) | {object with 2 keys} |
| $.threads[2].records | (absent) | [array of 0] |
| $.threads[2].placed | (absent) | {object with 2 keys} |
| $.threads[3].records | (absent) | [array of 1] |
| $.threads[3].placed | (absent) | {object with 2 keys} |
| $.threads[4].records | (absent) | [array of 0] |
| $.threads[4].placed | (absent) | {object with 2 keys} |
| $.threads[5].records | (absent) | [array of 1] |
| $.threads[5].placed | (absent) | {object with 2 keys} |
| $.threads[6].records | (absent) | [array of 1] |
| $.threads[6].placed | (absent) | {object with 2 keys} |
| $.threads[7].records | (absent) | [array of 1] |
| $.threads[7].placed | (absent) | {object with 2 keys} |
| $.threads[8].records | (absent) | [array of 0] |
| $.threads[8].placed | (absent) | {object with 2 keys} |
| $.threads[9].records | (absent) | [array of 0] |
| $.threads[9].placed | (absent) | {object with 2 keys} |
| $.threads[10].records | (absent) | [array of 0] |
| $.threads[10].placed | (absent) | {object with 2 keys} |
| $.threads[11].records | (absent) | [array of 1] |
| $.threads[11].placed | (absent) | {object with 2 keys} |
| $.threads[12].records | (absent) | [array of 0] |

...and 21 more paths (see the JSON file).

### collector GET /api/collector/stories?period=quarterly&zone=1

Session reads, id bc42aaf91706f16e, 123696 bytes to 124828 bytes.

| Path | A | B |
|---|---|---|
| $.threads[0].records | (absent) | [array of 0] |
| $.threads[0].placed | (absent) | {object with 2 keys} |
| $.threads[1].records | (absent) | [array of 0] |
| $.threads[1].placed | (absent) | {object with 2 keys} |
| $.threads[2].records | (absent) | [array of 1] |
| $.threads[2].placed | (absent) | {object with 2 keys} |
| $.threads[3].records | (absent) | [array of 1] |
| $.threads[3].placed | (absent) | {object with 2 keys} |
| $.threads[4].records | (absent) | [array of 1] |
| $.threads[4].placed | (absent) | {object with 2 keys} |
| $.threads[5].records | (absent) | [array of 0] |
| $.threads[5].placed | (absent) | {object with 2 keys} |
| $.threads[6].records | (absent) | [array of 1] |
| $.threads[6].placed | (absent) | {object with 2 keys} |
| $.threads[7].records | (absent) | [array of 1] |
| $.threads[7].placed | (absent) | {object with 2 keys} |
| $.threads[8].records | (absent) | [array of 1] |
| $.threads[8].placed | (absent) | {object with 2 keys} |

### collector GET /api/collector/stories?period=weekly&dept=GCC-SWM

Session reads, id 3ef8820df65540b7, 11605 bytes to 11962 bytes.

| Path | A | B |
|---|---|---|
| $.threads[0].records | (absent) | [array of 0] |
| $.threads[0].placed | (absent) | {object with 2 keys} |
| $.threads[1].records | (absent) | [array of 1] |
| $.threads[1].placed | (absent) | {object with 2 keys} |
| $.threads[2].records | (absent) | [array of 1] |
| $.threads[2].placed | (absent) | {object with 2 keys} |

### collector GET /api/collector/stories?period=monthly&dept=CMWSSB

Session reads, id 6d0233d6eb85c679, 33540 bytes to 34166 bytes.

| Path | A | B |
|---|---|---|
| $.threads[0].records | (absent) | [array of 1] |
| $.threads[0].placed | (absent) | {object with 2 keys} |
| $.threads[1].records | (absent) | [array of 1] |
| $.threads[1].placed | (absent) | {object with 2 keys} |
| $.threads[2].records | (absent) | [array of 0] |
| $.threads[2].placed | (absent) | {object with 2 keys} |
| $.threads[3].records | (absent) | [array of 2] |
| $.threads[3].placed | (absent) | {object with 2 keys} |

### collector GET /api/collector/stories?period=weekly&taluk=TLK-MYL

Session reads, id a807cb02b4167981, 36960 bytes to 37513 bytes.

| Path | A | B |
|---|---|---|
| $.threads[0].records | (absent) | [array of 0] |
| $.threads[0].placed | (absent) | {object with 2 keys} |
| $.threads[1].records | (absent) | [array of 0] |
| $.threads[1].placed | (absent) | {object with 2 keys} |
| $.threads[2].records | (absent) | [array of 0] |
| $.threads[2].placed | (absent) | {object with 2 keys} |
| $.threads[3].records | (absent) | [array of 0] |
| $.threads[3].placed | (absent) | {object with 2 keys} |
| $.threads[4].records | (absent) | [array of 0] |
| $.threads[4].placed | (absent) | {object with 2 keys} |
| $.threads[5].records | (absent) | [array of 0] |
| $.threads[5].placed | (absent) | {object with 2 keys} |
| $.threads[6].records | (absent) | [array of 0] |
| $.threads[6].placed | (absent) | {object with 2 keys} |
| $.threads[7].records | (absent) | [array of 1] |
| $.threads[7].placed | (absent) | {object with 2 keys} |

### officerA POST /api/map/ask

Session reads, id 36b485b905d0afcd, 21629 bytes to 21628 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 3291 |

### officerA POST /api/map/ask

Session reads, id aecf834c788e44d9, 73119 bytes to 73118 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 3291 |

### officerA POST /api/map/ask

Session reads, id b193d322407371dd, 73119 bytes to 73118 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 3291 |

### officerA POST /api/map/ask

Session reads, id 15802ee9d940fabe, 73119 bytes to 73118 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 3291 |

### officerA POST /api/map/ask

Session reads, id 6d778cca2a5d2397, 73119 bytes to 73118 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 3291 |

### officerA POST /api/map/ask

Session reads, id 73d03742afa4295d, 73119 bytes to 73118 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 3291 |

### collector POST /api/collector/thunai/agent

Session reads, id 8cf390975fbb8b52, 171 bytes to 14872 bytes.

| Path | A | B |
|---|---|---|
| $.result.kind | none | do |
| $.result.steps.length | 0 | 1 |
| $.result.steps[0] | (absent) | {object with 2 keys} |
| $.result.stage | null | {object with 13 keys} |
| $.result.say | null | 17 cases still open today (6 Nov, since midnight). One is past its deadline and needs you first: Road accident at Ekkattuthangal in Adyar. S... (214 chars) |
| $.result.note | model | quick |

### collector POST /api/collector/thunai/agent

Session reads, id b709a6b7afee2afd, 11927 bytes to 11548 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.en | 122 cases this week; here are the 12 that matter most. 35 are past their deadline and need you first: uncleared garbage at Durgadevi Nagar 5... (339 chars) | 122 cases this week; here are the 12 that matter most. 35 are past their deadline and need you first: uncleared garbage at Tondiarpet, and u... (216 chars) |
| $.result.stage.say.ta | இந்த வாரம் 122 சம்பவங்கள். 35 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: அகற்றப்படாத குப்பை, Durgadevi Nagar 5Th Cross St 2Nd Lane, Dur... (327 chars) | இந்த வாரம் 122 சம்பவங்கள். 35 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: அகற்றப்படாத குப்பை, தண்டையார்பேட்டை; அகற்றப்படாத குப்பை, வளசரவ... (194 chars) |
| $.result.say | 122 cases this week; here are the 12 that matter most. 35 are past their deadline and need you first: uncleared garbage at Durgadevi Nagar 5... (339 chars) | 122 cases this week; here are the 12 that matter most. 35 are past their deadline and need you first: uncleared garbage at Tondiarpet, and u... (216 chars) |

### collector POST /api/collector/thunai/agent

Session reads, id ea25e31de4431e9c, 12118 bytes to 3470 bytes.

| Path | A | B |
|---|---|---|
| $.result.steps.length | 2 | 1 |
| $.result.steps[0].a | view | period |
| $.result.steps[0].view | {object with 1 keys} | (absent) |
| $.result.steps[0].period | (absent) | weekly |
| $.result.steps[1] | {object with 2 keys} | (absent) |
| $.result.stage.recipe | cases | ranking |
| $.result.stage.title | கடுமையான சம்பவங்கள் · இந்த வாரம் | Top 5 · Severe incidents · this week |
| $.result.stage.takeaway.en | 54 are past their deadline. | Royapuram is 4× the median of all 15. |
| $.result.stage.takeaway.ta | 54 காலக்கெடுவைத் தாண்டியவை. | ராயபுரம், அனைத்து 15-இன் இடைநிலையை விட 4 மடங்கு. |
| $.result.stage.say.en | 52 severe cases this week; here are the 12 that matter most. 54 are past their deadline and need you first: standing water at Pulianthope (B... (281 chars) | Highest: Royapuram, 16 incidents. Then Thiruvottiyur 9, Anna Nagar 7. |
| $.result.stage.say.ta | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 54 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: தண்ணீர் தேக்கம், Pulianthope (Buckingham Canal - Basin... (258 chars) | அதிகம்: ராயபுரம், 16 சம்பவங்கள். அடுத்து திருவொற்றியூர் 9, அண்ணா நகர் 7. |
| $.result.stage.blocks[0].items.length | 2 | 3 |
| $.result.stage.blocks[0].items[0].key | total | top |
| $.result.stage.blocks[0].items[0].label | கடுமையான சம்பவங்கள், இந்த வாரம் | Royapuram |
| $.result.stage.blocks[0].items[0].value | 52 | 16 |
| $.result.stage.blocks[0].items[0].unit | null | incidents |
| $.result.stage.blocks[0].items[1].key | late | total |
| $.result.stage.blocks[0].items[1].label | காலக்கெடு தாண்டியவை | All areas together |
| $.result.stage.blocks[0].items[1].value | 54 | 65 |
| $.result.stage.blocks[0].items[1].unit | null | incidents |
| $.result.stage.blocks[0].items[1].tone | bad | neutral |
| $.result.stage.blocks[0].items[2] | (absent) | {object with 8 keys} |
| $.result.stage.blocks[1].kind | CaseList | Ranking |
| $.result.stage.blocks[1].id | cases | rank |
| $.result.stage.blocks[1].title | கடுமையான சம்பவங்கள் · இந்த வாரம் | Severe incidents |

...and 75 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent

Session reads, id 8207e2765a8903b7, 171 bytes to 3359 bytes.

| Path | A | B |
|---|---|---|
| $.result.kind | none | do |
| $.result.lang | ta | en |
| $.result.steps.length | 0 | 1 |
| $.result.steps[0] | (absent) | {object with 2 keys} |
| $.result.stage | null | {object with 13 keys} |
| $.result.say | null | Highest: Royapuram, 16 incidents. Then Thiruvottiyur 9, Anna Nagar 7. |
| $.result.note | model | quick |

### collector POST /api/collector/assistant/chat

Session reads, id b037d3f604c1cd8d, 1956 bytes to 2057 bytes.

| Path | A | B |
|---|---|---|
| $[3].data.headline | 13 open citizen complaints · last 24 hours | 11 open citizen complaints · today (6 Nov, since midnight) |
| $[3].data.answerMarkdown | **13** open citizen complaints in the last 24 hours in Adyar zone.  - They are about 13 incidents, 13 of them still open | **11** open citizen complaints today (6 Nov, since midnight) in Adyar zone.  - They are about 11 incidents, 11 of them still open |
| $[3].data.voiceSummary | 13 open citizen complaints in the last 24 hours in Adyar zone. | 11 open citizen complaints today (6 Nov, since midnight) in Adyar zone. |
| $[3].data.kpis[0].value | 13 | 11 |
| $[3].data.kpis[1].value | 13 | 11 |
| $[3].data.scopeLine | Last 24 hours · Adyar (Zone 13) · all departments · as of 6 Nov, 6:08 PM | Today (6 Nov, since midnight) · Adyar (Zone 13) · all departments · as of 6 Nov, 6:08 PM |
| $[3].data.sources.tools[0].args.hours | null | 18 |
| $[3].data.sources.tools[0].args.range | null | {object with 2 keys} |

### collector POST /api/collector/assistant/chat

Session reads, id 0338cf8e522574d7, 3381 bytes to 3378 bytes.

| Path | A | B |
|---|---|---|
| $[5].data.datasets[0].rows[1].unverified | 19 | 0 |
| $[5].data.datasets[0].rows[2].unverified | 15 | 0 |
| $[5].data.datasets[0].rows[3].unverified | 9 | 0 |
| $[5].data.datasets[0].rows[4].unverified | 22 | 0 |

### collector POST /api/collector/assistant/chat

Session reads, id 357357b026b4d8eb, 2658 bytes to 2571 bytes.

| Path | A | B |
|---|---|---|
| $[3].data.headline | 13 நிலுவையிலுள்ள புகார்கள் · கடந்த 24 மணி நேரத்தில் | 11 நிலுவையிலுள்ள புகார்கள் · இன்று |
| $[3].data.answerMarkdown | கடந்த 24 மணி நேரத்தில் அடையாறு மண்டல பகுதியில் 13 நிலுவையிலுள்ள குடிமக்கள் புகார்கள் உள்ளன (13 சம்பவங்கள்; 13 இன்னும் நிலுவையில்). | இன்று அடையாறு மண்டல பகுதியில் 11 நிலுவையிலுள்ள குடிமக்கள் புகார்கள் உள்ளன (11 சம்பவங்கள்; 11 இன்னும் நிலுவையில்). |
| $[3].data.voiceSummary | கடந்த 24 மணி நேரத்தில் அடையாறு மண்டல பகுதியில் 13 நிலுவையிலுள்ள குடிமக்கள் புகார்கள் உள்ளன (13 சம்பவங்கள்; 13 இன்னும் நிலுவையில்). | இன்று அடையாறு மண்டல பகுதியில் 11 நிலுவையிலுள்ள குடிமக்கள் புகார்கள் உள்ளன (11 சம்பவங்கள்; 11 இன்னும் நிலுவையில்). |
| $[3].data.kpis[0].value | 13 | 11 |
| $[3].data.kpis[1].value | 13 | 11 |
| $[3].data.scopeLine | கடந்த 24 மணி நேரம் · அடையாறு (மண்டலம் 13) · அனைத்துத் துறைகளும் · தரவு நேரம் நவ. 6, 6:08 PM | Today (6 Nov, since midnight) · அடையாறு (மண்டலம் 13) · அனைத்துத் துறைகளும் · தரவு நேரம் நவ. 6, 6:08 PM |
| $[3].data.sources.tools[0].args.hours | null | 18 |
| $[3].data.sources.tools[0].args.range | null | {object with 2 keys} |

### collector POST /api/collector/assistant/chat

Session reads, id c89f446d471e91c0, 4892 bytes to 15832 bytes.

| Path | A | B |
|---|---|---|
| $.length | 7 | 5 |
| $[3].event | status | answer |
| $[3].data.stage | fetching | (absent) |
| $[3].data.id | (absent) | <uuid-2> |
| $[3].data.kind | (absent) | answer |
| $[3].data.language | (absent) | ta |
| $[3].data.display | (absent) | text |
| $[3].data.headline | (absent) | 8 சம்பவங்கள் · கடந்த 7 நாட்களில் |
| $[3].data.answerMarkdown | (absent) | கடந்த 7 நாட்களில் பதிவான புதிய 8 சம்பவங்கள் (மொத்தம் 65):  1. **School van driver arrested for sexually assaulting five-year-old girl in Che... (943 chars) |
| $[3].data.voiceSummary | (absent) | கடந்த 7 நாட்களில் பதிவான புதிய 8 சம்பவங்கள் (மொத்தம் 65): |
| $[3].data.voiceLang | (absent) | ta-IN |
| $[3].data.chart | (absent) | null |
| $[3].data.datasets | (absent) | [array of 1] |
| $[3].data.kpis | (absent) | [array of 0] |
| $[3].data.table | (absent) | null |
| $[3].data.followUps | (absent) | [array of 0] |
| $[3].data.chips | (absent) | [array of 0] |
| $[3].data.consoleActions | (absent) | [array of 0] |
| $[3].data.autoActions | (absent) | [array of 0] |
| $[3].data.caveats | (absent) | [array of 0] |
| $[3].data.scope | (absent) | {object with 5 keys} |
| $[3].data.scopeLine | (absent) | கடந்த 7 நாட்கள் · மாவட்டம் முழுவதும் · அனைத்துத் துறைகளும் · தரவு நேரம் நவ. 6, 6:08 PM |
| $[3].data.asOf | (absent) | 2026-11-06 18:08:00 |
| $[3].data.testData | (absent) | true |
| $[3].data.sources | (absent) | {object with 10 keys} |

...and 13 more paths (see the JSON file).

### officerA POST /api/collector/assistant/chat

Session reads, id 3545a42eabc5e796, 2021 bytes to 2122 bytes.

| Path | A | B |
|---|---|---|
| $[3].data.headline | 1 open citizen complaint · last 24 hours | 1 open citizen complaint · today (6 Nov, since midnight) |
| $[3].data.answerMarkdown | **1** open citizen complaint in the last 24 hours in Adyar zone for Solid Waste Management.  - They are about 1 incident, 1 of them still op... (142 chars) | **1** open citizen complaint today (6 Nov, since midnight) in Adyar zone for Solid Waste Management.  - They are about 1 incident, 1 of them... (151 chars) |
| $[3].data.voiceSummary | 1 open citizen complaint in the last 24 hours in Adyar zone for Solid Waste Management. | 1 open citizen complaint today (6 Nov, since midnight) in Adyar zone for Solid Waste Management. |
| $[3].data.scopeLine | Last 24 hours · Adyar (Zone 13) · Solid Waste Management · as of 6 Nov, 6:08 PM | Today (6 Nov, since midnight) · Adyar (Zone 13) · Solid Waste Management · as of 6 Nov, 6:08 PM |
| $[3].data.sources.tools[0].args.hours | null | 18 |
| $[3].data.sources.tools[0].args.range | null | {object with 2 keys} |

### officerA POST /api/collector/assistant/chat

Session reads, id 875d1dd5adf41fe6, 3686 bytes to 3690 bytes.

| Path | A | B |
|---|---|---|
| $[5].data.answerMarkdown | In the last 90 days: **0** severe events, **100** open citizen complaints, **96** ongoing incidents, **1,609** resolved this quarter. | In the last 90 days: **0** severe events, **100** open citizen complaints, **96** ongoing incidents, **1,609** resolved, last 90 days. |
| $[5].data.voiceSummary | In the last 90 days: 0 severe events, 100 open citizen complaints, 96 ongoing incidents, 1,609 resolved this quarter. | In the last 90 days: 0 severe events, 100 open citizen complaints, 96 ongoing incidents, 1,609 resolved, last 90 days. |
| $[5].data.datasets[0].fields[4].label | Resolved this quarter | Resolved, last 90 days |
| $[5].data.kpis[3].label | Resolved this quarter | Resolved, last 90 days |

### officerA POST /api/collector/assistant/chat

Session reads, id 89b6467a8ed65684, 2133 bytes to 2154 bytes.

| Path | A | B |
|---|---|---|
| $[5].data.sources.tools[0].args.lockDept | (absent) | GCC-SWM |

### officerA POST /api/collector/assistant/chat

Session reads, id 11da30111e280384, 2631 bytes to 2544 bytes.

| Path | A | B |
|---|---|---|
| $[3].data.headline | 1 நிலுவையிலுள்ள புகார்கள் · கடந்த 24 மணி நேரத்தில் | 1 நிலுவையிலுள்ள புகார்கள் · இன்று |
| $[3].data.answerMarkdown | கடந்த 24 மணி நேரத்தில் Adyar zone for Solid Waste Management பகுதியில் 1 நிலுவையிலுள்ள குடிமக்கள் புகார்கள் உள்ளன (1 சம்பவங்கள்; 1 இன்னும் ந... (151 chars) | இன்று Adyar zone for Solid Waste Management பகுதியில் 1 நிலுவையிலுள்ள குடிமக்கள் புகார்கள் உள்ளன (1 சம்பவங்கள்; 1 இன்னும் நிலுவையில்). |
| $[3].data.voiceSummary | கடந்த 24 மணி நேரத்தில் Adyar zone for Solid Waste Management பகுதியில் 1 நிலுவையிலுள்ள குடிமக்கள் புகார்கள் உள்ளன (1 சம்பவங்கள்; 1 இன்னும் ந... (151 chars) | இன்று Adyar zone for Solid Waste Management பகுதியில் 1 நிலுவையிலுள்ள குடிமக்கள் புகார்கள் உள்ளன (1 சம்பவங்கள்; 1 இன்னும் நிலுவையில்). |
| $[3].data.scopeLine | கடந்த 24 மணி நேரம் · அடையாறு (மண்டலம் 13) · Solid Waste Management · தரவு நேரம் நவ. 6, 6:08 PM | Today (6 Nov, since midnight) · அடையாறு (மண்டலம் 13) · Solid Waste Management · தரவு நேரம் நவ. 6, 6:08 PM |
| $[3].data.sources.tools[0].args.hours | null | 18 |
| $[3].data.sources.tools[0].args.range | null | {object with 2 keys} |

### officerA POST /api/collector/assistant/chat

Session reads, id 6f706dee04f7d413, 4848 bytes to 2733 bytes.

| Path | A | B |
|---|---|---|
| $.length | 7 | 5 |
| $[3].event | status | answer |
| $[3].data.stage | fetching | (absent) |
| $[3].data.id | (absent) | <uuid-2> |
| $[3].data.kind | (absent) | answer |
| $[3].data.language | (absent) | ta |
| $[3].data.display | (absent) | text |
| $[3].data.headline | (absent) | 0 சம்பவங்கள் · கடந்த 7 நாட்களில் |
| $[3].data.answerMarkdown | (absent) | கடந்த 7 நாட்களில் சம்பவங்கள் எதுவும் பதிவாகவில்லை. |
| $[3].data.voiceSummary | (absent) | கடந்த 7 நாட்களில் சம்பவங்கள் எதுவும் பதிவாகவில்லை. |
| $[3].data.voiceLang | (absent) | ta-IN |
| $[3].data.chart | (absent) | null |
| $[3].data.datasets | (absent) | [array of 1] |
| $[3].data.kpis | (absent) | [array of 0] |
| $[3].data.table | (absent) | null |
| $[3].data.followUps | (absent) | [array of 0] |
| $[3].data.chips | (absent) | [array of 0] |
| $[3].data.consoleActions | (absent) | [array of 0] |
| $[3].data.autoActions | (absent) | [array of 0] |
| $[3].data.caveats | (absent) | [array of 0] |
| $[3].data.scope | (absent) | {object with 5 keys} |
| $[3].data.scopeLine | (absent) | கடந்த 7 நாட்கள் · மாவட்டம் முழுவதும் · Solid Waste Management · தரவு நேரம் நவ. 6, 6:08 PM |
| $[3].data.asOf | (absent) | 2026-11-06 18:08:00 |
| $[3].data.testData | (absent) | false |
| $[3].data.sources | (absent) | {object with 10 keys} |

...and 13 more paths (see the JSON file).

### collector GET /api/collector/audit

Session reads, id 177239dc8a77b194, 70856 bytes to 70865 bytes.

| Path | A | B |
|---|---|---|
| $.log[0].id | 1000000071 | 1000000070 |
| $.log[1].id | 1000000070 | 1000000069 |
| $.log[2].id | 1000000069 | 1000000068 |
| $.log[3].id | 1000000068 | 1000000067 |
| $.log[4].id | 1000000067 | 1000000066 |
| $.log[5].id | 1000000066 | 1000000065 |
| $.log[6].id | 1000000065 | 1000000064 |
| $.log[7].id | 1000000064 | 1000000063 |
| $.log[8].id | 1000000063 | 1000000062 |
| $.log[9].id | 1000000062 | 1000000061 |
| $.log[10].id | 1000000061 | 1000000060 |
| $.log[11].id | 1000000060 | 1000000059 |
| $.log[12].id | 1000000059 | 1000000058 |
| $.log[13].id | 1000000058 | 1000000057 |
| $.log[14].id | 1000000057 | 1000000056 |
| $.log[15].id | 1000000056 | 1000000055 |
| $.log[16].id | 1000000055 | 1000000054 |
| $.log[17].id | 1000000054 | 1000000053 |
| $.log[18].id | 1000000053 | 1000000052 |
| $.log[19].id | 1000000052 | 1000000051 |
| $.log[20].id | 1000000051 | 1000000050 |
| $.log[21].id | 1000000050 | 1000000049 |
| $.log[21].after_value | {"kind":"answer","intent":"tool_question","tools":["zones"],"sql":0,"verifier":{"checked":0,"unmatched":[],"regenerated":false,"template":tr... (191 chars) | {"kind":"answer","intent":null,"tools":["recent_incidents"],"sql":0,"verifier":{"checked":0,"unmatched":[],"regenerated":false,"template":tr... (191 chars) |
| $.log[22].id | 1000000049 | 1000000048 |
| $.log[23].id | 1000000048 | 1000000047 |

...and 516 more paths (see the JSON file).

### officerA GET /api/officer/grievances

Session reads2, id 7eeb6552758ef083, 5146 bytes to 5250 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?cat=SOLID_WASTE

Session reads2, id c764414b7e96d666, 5146 bytes to 5250 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?flag=open

Session reads2, id df59ac0a25b39e7d, 5146 bytes to 5250 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?flag=overdue

Session reads2, id 202312348c8e31e5, 5119 bytes to 5223 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 1 |
| $.rows[1].breached | (absent) | 1 |
| $.rows[2].breached | (absent) | 1 |
| $.rows[3].breached | (absent) | 1 |
| $.rows[4].breached | (absent) | 1 |
| $.rows[5].breached | (absent) | 1 |
| $.rows[6].breached | (absent) | 1 |
| $.rows[7].breached | (absent) | 1 |

### officerA GET /api/officer/grievances?flag=due

Session reads2, id 6aa43fc1251ad051, 3692 bytes to 3770 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?period=daily

Session reads2, id b80e2526078f9fa6, 5146 bytes to 5250 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?period=weekly

Session reads2, id dab66449b74ca1b2, 5146 bytes to 5250 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?period=monthly

Session reads2, id 2abe95cf40e961d9, 5146 bytes to 5250 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?period=quarterly

Session reads2, id 4d6d5cc1491e305b, 5146 bytes to 5250 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?q=Adyar

Session reads2, id 9ae477fed53ec365, 1306 bytes to 1332 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 1 |

### officerA GET /api/officer/grievances?q=garbage

Session reads2, id 6f5ea0cf05916bbc, 5146 bytes to 5250 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?q=kuppai

Session reads2, id 38d045617ce77adf, 1321 bytes to 1347 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?q=குப்பை

Session reads2, id 8e2e091c146aab59, 2825 bytes to 2877 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 1 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 1 |

### officerA GET /api/officer/grievances?q=x

Session reads2, id 47382d59efd2454d, 5146 bytes to 5250 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?sev=Medium

Session reads2, id 589c5c009ff87a06, 5146 bytes to 5250 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?sev=Low

Session reads2, id 2fb26e6988b89b68, 4895 bytes to 4999 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?sev=bogus

Session reads2, id 62b2ac71300e6edd, 5146 bytes to 71 bytes.
- status: 200 to 400
- cache: no-store, max-age=0 to null

| Path | A | B |
|---|---|---|
| $.now | 2026-11-06 18:08:00 | (absent) |
| $.rows | [array of 8] | (absent) |
| $.total | 38 | (absent) |
| $.page | 0 | (absent) |
| $.per | 8 | (absent) |
| $.awaiting | 0 | (absent) |
| $.awaitingNote | null | (absent) |
| $.error | (absent) | Severity "bogus" is not one of Severe, High, Medium, Low. |

### officerA GET /api/officer/grievances?tab=all

Session reads2, id 202f59f4d5b7398e, 4931 bytes to 5035 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?tab=new

Session reads2, id fc99fd364787f994, 5146 bytes to 5250 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?tab=action

Session reads2, id cd335786bb4b1f26, 5114 bytes to 5280 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 1 |
| $.rows[1].id | INC-20261102-8EC358 | INC-20261103-8989A6 |
| $.rows[1].title | Garbage at the dumping ground is burning since last Monday | Huge garbage dump near Murugan Temple bus stop, not cleared for two weeks now |
| $.rows[1].zone | 9 | 11 |
| $.rows[1].zone_name | Teynampet | Valasaravakkam |
| $.rows[1].ward | 125 | 148 |
| $.rows[1].taluk | TLK-MYL | TLK-MBM |
| $.rows[1].loc | Vedantha Desigar Street, R.K.Mutt Road, Mylapore | Thirumalai Street Meenashi Nagar, Thirumalai Nagar, Nerkundram |
| $.rows[1].lat | 13.033772 | 13.0552512 |
| $.rows[1].lon | 80.2715343 | 80.1812026 |
| $.rows[1].sev | Medium | High |
| $.rows[1].status | In progress | Awaiting verification |
| $.rows[1].complaints | 2 | 1 |
| $.rows[1].officer | null | Zonal Officer, Valasaravakkam |
| $.rows[1].t | 2026-11-02 10:29:00 | 2026-11-03 08:45:00 |
| $.rows[1].updated | 2026-11-05 11:05:00 | 2026-11-06 12:25:00 |
| $.rows[1].due_at | 2026-11-04 10:29:00 | 2026-11-04 08:45:00 |
| $.rows[1].breached | (absent) | 1 |
| $.rows[2].id | INC-20261030-158A1B | INC-20261102-8EC358 |
| $.rows[2].title | Improper Sweeping: the problem on Krishna Nagar Vinayagar Nagar has continued for the last 8 days | Garbage at the dumping ground is burning since last Monday |
| $.rows[2].zone | 7 | 9 |
| $.rows[2].zone_name | Ambattur | Teynampet |
| $.rows[2].ward | 84 | 125 |
| $.rows[2].taluk | TLK-AMB | TLK-MYL |
| $.rows[2].loc | Krishna Nagar Vinayagar Nagar, Gurusami Nagar, Pattaravakkam | Vedantha Desigar Street, R.K.Mutt Road, Mylapore |

...and 81 more paths (see the JSON file).

### officerA GET /api/officer/grievances?tab=sent

Session reads2, id fcccf7473110520d, 5237 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.rows.length | 8 | 0 |
| $.rows[0] | {object with 25 keys} | (absent) |
| $.rows[1] | {object with 25 keys} | (absent) |
| $.rows[2] | {object with 25 keys} | (absent) |
| $.rows[3] | {object with 25 keys} | (absent) |
| $.rows[4] | {object with 25 keys} | (absent) |
| $.rows[5] | {object with 25 keys} | (absent) |
| $.rows[6] | {object with 25 keys} | (absent) |
| $.rows[7] | {object with 25 keys} | (absent) |
| $.total | 17 | 0 |

### officerA GET /api/officer/grievances?tab=verified

Session reads2, id 8cca66dfe5c75d49, 5025 bytes to 5129 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 1 |
| $.rows[1].breached | (absent) | 1 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 1 |
| $.rows[5].breached | (absent) | 1 |
| $.rows[6].breached | (absent) | 1 |
| $.rows[7].breached | (absent) | 1 |

### officerA GET /api/officer/grievances?taluk=TLK-MYL

Session reads2, id 998b40d6b77c7989, 3851 bytes to 3929 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 1 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 1 |

### officerA GET /api/officer/grievances?taluk=TLK-SHN

Session reads2, id 2b4b43f247ef813b, 708 bytes to 721 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 1 |

### officerA GET /api/officer/grievances?taluk=TLK-MDR

Session reads2, id 7446ab14b6b529d2, 1341 bytes to 1367 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 1 |

### officerA GET /api/officer/grievances?taluk=TLK-AYN

Session reads2, id 8ead7f5458d73f91, 759 bytes to 772 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 1 |

### officerA GET /api/officer/grievances?zone=5

Session reads2, id 6a08aaa61e8c6db2, 4389 bytes to 4480 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 1 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?zone=13

Session reads2, id 45f99be531bae84e, 1306 bytes to 1332 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 1 |

### officerA GET /api/officer/grievances?zone=1

Session reads2, id c5b8a20287f5a417, 2466 bytes to 2518 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 1 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?zone=8

Session reads2, id 976db2ef4409ac97, 700 bytes to 713 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?period=weekly&zone=5

Session reads2, id bd9bcf98ca294531, 3801 bytes to 3879 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?period=monthly&zone=13

Session reads2, id 04c300829a48b564, 1306 bytes to 1332 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 1 |

### officerA GET /api/officer/grievances?period=quarterly&zone=1

Session reads2, id 5801bd75500dcc15, 2466 bytes to 2518 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 1 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?period=monthly&zone=13&cat=SOLID_WASTE

Session reads2, id 9d4f6c40252fe6aa, 1306 bytes to 1332 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 1 |

### officerA GET /api/officer/grievances?period=weekly&taluk=TLK-MYL

Session reads2, id 74b033f69cbfe84a, 3229 bytes to 3294 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 1 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?period=monthly&tab=all&sev=High

Session reads2, id e8266a0daa48aade, 3235 bytes to 3302 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 1 |
| $.rows[1].stage | sent | action |
| $.rows[1].breached | (absent) | 1 |
| $.rows[2].breached | (absent) | 1 |
| $.rows[3].breached | (absent) | 1 |
| $.rows[4].breached | (absent) | 1 |

### officerA GET /api/officer/grievances?period=monthly&tab=all&cat=SOLID_WASTE

Session reads2, id 43ae454eea29528b, 4931 bytes to 5035 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerA GET /api/officer/grievances/INC-20260926-EB3B79

Session reads2, id 696f782b7488397b, 1819 bytes to 1853 bytes.

| Path | A | B |
|---|---|---|
| $.grievance.stage | sent | action |
| $.grievance.breached | (absent) | 1 |
| $.next | null | close |
| $.rejected | (absent) | null |

### officerA GET /api/officer/grievances/INC-20261106-2AB4CB

Session reads2, id e84d7c545c4d34f8, 1499 bytes to 1528 bytes.

| Path | A | B |
|---|---|---|
| $.grievance.breached | (absent) | 0 |
| $.rejected | (absent) | null |

### officerA GET /api/officer/grievances/INC-20261104-CBCE27

Session reads2, id da5b3de9fa8a4ac1, 2039 bytes to 2105 bytes.

| Path | A | B |
|---|---|---|
| $.grievance.stage | sent | action |
| $.grievance.breached | (absent) | 0 |
| $.next | null | close |
| $.sources[0].note | Complaint from the residents of Village Street 1st Lane. Issue regarding absenteeism of sweepers in our area. Please send the conservancy te... (280 chars) | Complaint from the residents of Village Street 1st Lane. Issue regarding absenteeism of sweepers in our area. Please send the conservancy te... (312 chars) |
| $.rejected | (absent) | null |

### officerA GET /api/officer/grievances/INC-20260613-D7B58D

Session reads2, id 22d6c798d2f01121, 2285 bytes to 2314 bytes.

| Path | A | B |
|---|---|---|
| $.grievance.breached | (absent) | 1 |
| $.rejected | (absent) | null |

### officerA GET /api/officer/overview

Session reads2, id d5fe93253323aca0, 156911 bytes to 157607 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 30 days |
| $.counts.action | 37 | 54 |
| $.counts.sent | 17 | 0 |
| $.oldest.breached | (absent) | 1 |
| $.map.pins[1].stage | sent | action |
| $.map.pins[15].stage | sent | action |
| $.map.pins[17].stage | sent | action |
| $.map.pins[18].stage | sent | action |
| $.map.pins[19].stage | sent | action |
| $.map.pins[20].stage | sent | action |
| $.map.pins[21].stage | sent | action |
| $.map.pins[24].stage | sent | action |
| $.map.pins[25].stage | sent | action |
| $.map.pins[29].stage | sent | action |
| $.map.pins[50].stage | sent | action |
| $.map.pins[53].stage | sent | action |
| $.map.pins[66].stage | sent | action |
| $.map.pins[67].stage | sent | action |
| $.map.pins[68].stage | sent | action |
| $.map.pins[73].stage | sent | action |
| $.map.pins[83].stage | sent | action |
| $.news[0].breached | (absent) | 0 |
| $.news[1].breached | (absent) | 0 |
| $.news[2].stage | sent | action |
| $.news[2].breached | (absent) | 1 |

...and 120 more paths (see the JSON file).

### officerA GET /api/officer/overview?period=daily

Session reads2, id 441a25b61259b8f3, 54210 bytes to 54587 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 24 hours |
| $.oldest.breached | (absent) | 0 |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.queue.new[0].breached | (absent) | 0 |
| $.queue.new[1].breached | (absent) | 0 |
| $.queue.new[2].breached | (absent) | 0 |
| $.queue.new[3].breached | (absent) | 0 |
| $.queue.new[4].breached | (absent) | 0 |
| $.queue.new[5].breached | (absent) | 0 |
| $.queue.new[6].breached | (absent) | 0 |
| $.queue.new[7].breached | (absent) | 0 |
| $.queue.action[0].breached | (absent) | 0 |
| $.queue.action[1].breached | (absent) | 0 |
| $.resolved | (absent) | {object with 3 keys} |
| $.feedbackCounts | (absent) | {object with 4 keys} |

### officerA GET /api/officer/overview?period=weekly

Session reads2, id 07fe15dfe199c3e8, 119274 bytes to 119894 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 7 days |
| $.counts.action | 21 | 36 |
| $.counts.sent | 15 | 0 |
| $.oldest.breached | (absent) | 1 |
| $.map.pins[1].stage | sent | action |
| $.map.pins[15].stage | sent | action |
| $.map.pins[17].stage | sent | action |
| $.map.pins[18].stage | sent | action |
| $.map.pins[19].stage | sent | action |
| $.map.pins[20].stage | sent | action |
| $.map.pins[21].stage | sent | action |
| $.map.pins[24].stage | sent | action |
| $.map.pins[25].stage | sent | action |
| $.map.pins[43].stage | sent | action |
| $.map.pins[46].stage | sent | action |
| $.map.pins[59].stage | sent | action |
| $.map.pins[60].stage | sent | action |
| $.map.pins[61].stage | sent | action |
| $.map.pins[66].stage | sent | action |
| $.news[0].breached | (absent) | 0 |
| $.news[1].breached | (absent) | 0 |
| $.news[2].stage | sent | action |
| $.news[2].breached | (absent) | 1 |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |

...and 127 more paths (see the JSON file).

### officerA GET /api/officer/overview?period=monthly

Session reads2, id db785c40238d8cf7, 156911 bytes to 157607 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 30 days |
| $.counts.action | 37 | 54 |
| $.counts.sent | 17 | 0 |
| $.oldest.breached | (absent) | 1 |
| $.map.pins[1].stage | sent | action |
| $.map.pins[15].stage | sent | action |
| $.map.pins[17].stage | sent | action |
| $.map.pins[18].stage | sent | action |
| $.map.pins[19].stage | sent | action |
| $.map.pins[20].stage | sent | action |
| $.map.pins[21].stage | sent | action |
| $.map.pins[24].stage | sent | action |
| $.map.pins[25].stage | sent | action |
| $.map.pins[29].stage | sent | action |
| $.map.pins[50].stage | sent | action |
| $.map.pins[53].stage | sent | action |
| $.map.pins[66].stage | sent | action |
| $.map.pins[67].stage | sent | action |
| $.map.pins[68].stage | sent | action |
| $.map.pins[73].stage | sent | action |
| $.map.pins[83].stage | sent | action |
| $.news[0].breached | (absent) | 0 |
| $.news[1].breached | (absent) | 0 |
| $.news[2].stage | sent | action |
| $.news[2].breached | (absent) | 1 |

...and 120 more paths (see the JSON file).

### officerA GET /api/officer/overview?period=quarterly

Session reads2, id 85b96b4893843e0f, 165153 bytes to 165818 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 90 days |
| $.counts.action | 40 | 58 |
| $.counts.sent | 18 | 0 |
| $.oldest.breached | (absent) | 1 |
| $.map.pins[1].stage | sent | action |
| $.map.pins[15].stage | sent | action |
| $.map.pins[17].stage | sent | action |
| $.map.pins[18].stage | sent | action |
| $.map.pins[19].stage | sent | action |
| $.map.pins[20].stage | sent | action |
| $.map.pins[21].stage | sent | action |
| $.map.pins[24].stage | sent | action |
| $.map.pins[25].stage | sent | action |
| $.map.pins[29].stage | sent | action |
| $.map.pins[35].stage | sent | action |
| $.map.pins[52].stage | sent | action |
| $.map.pins[55].stage | sent | action |
| $.map.pins[68].stage | sent | action |
| $.map.pins[69].stage | sent | action |
| $.map.pins[70].stage | sent | action |
| $.map.pins[75].stage | sent | action |
| $.map.pins[85].stage | sent | action |
| $.news[0].breached | (absent) | 0 |
| $.news[1].breached | (absent) | 0 |
| $.news[2].stage | sent | action |

...and 121 more paths (see the JSON file).

### officerA GET /api/officer/overview?taluk=TLK-MYL

Session reads2, id 92c67f518d59d3c0, 54214 bytes to 51613 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 30 days |
| $.oldest.breached | (absent) | 1 |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.board.bell.length | 2 | 0 |
| $.board.bell[0] | {object with 40 keys} | (absent) |
| $.board.bell[1] | {object with 40 keys} | (absent) |
| $.queue.new[0].breached | (absent) | 0 |
| $.queue.new[1].breached | (absent) | 1 |
| $.queue.new[2].breached | (absent) | 0 |
| $.queue.new[3].breached | (absent) | 0 |
| $.queue.new[4].breached | (absent) | 0 |
| $.queue.new[5].breached | (absent) | 1 |
| $.queue.action[0].breached | (absent) | 1 |
| $.queue.action[1].breached | (absent) | 1 |
| $.queue.action[2].breached | (absent) | 1 |
| $.queue.action[3].breached | (absent) | 1 |
| $.queue.action[4].breached | (absent) | 1 |
| $.resolved | (absent) | {object with 3 keys} |
| $.feedbackCounts | (absent) | {object with 4 keys} |

### officerA GET /api/officer/overview?taluk=TLK-SHN

Session reads2, id 500e575fb6ecca05, 37740 bytes to 35087 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 30 days |
| $.oldest.breached | (absent) | 1 |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.board.bell.length | 2 | 0 |
| $.board.bell[0] | {object with 40 keys} | (absent) |
| $.board.bell[1] | {object with 40 keys} | (absent) |
| $.queue.new[0].breached | (absent) | 1 |
| $.queue.action[0].breached | (absent) | 1 |
| $.queue.action[1].breached | (absent) | 1 |
| $.queue.action[2].breached | (absent) | 0 |
| $.queue.action[3].breached | (absent) | 0 |
| $.queue.action[4].breached | (absent) | 1 |
| $.queue.action[5].breached | (absent) | 1 |
| $.resolved | (absent) | {object with 3 keys} |
| $.feedbackCounts | (absent) | {object with 4 keys} |

### officerA GET /api/officer/overview?zone=5

Session reads2, id 38e2edb8a6c030de, 59658 bytes to 58362 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 30 days |
| $.counts.action | 5 | 7 |
| $.counts.sent | 2 | 0 |
| $.oldest.breached | (absent) | 1 |
| $.map.pins[1].stage | sent | action |
| $.map.pins[2].stage | sent | action |
| $.news[0].breached | (absent) | 0 |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.board.bell.length | 2 | 0 |
| $.board.bell[0] | {object with 40 keys} | (absent) |
| $.board.bell[1] | {object with 40 keys} | (absent) |
| $.queue.new[0].breached | (absent) | 0 |
| $.queue.new[1].breached | (absent) | 1 |
| $.queue.new[2].breached | (absent) | 0 |
| $.queue.new[3].breached | (absent) | 0 |
| $.queue.new[4].breached | (absent) | 0 |
| $.queue.new[5].breached | (absent) | 0 |
| $.queue.new[6].breached | (absent) | 0 |
| $.queue.action.length | 5 | 7 |
| $.queue.action[0].breached | (absent) | 1 |
| $.queue.action[1].id | INC-20261104-EE6DFD | INC-20261103-85057B |
| $.queue.action[1].title | Erran Street-ல் கடை வைத்திருக்கிறேன். குப்பை பிரச்சினை: Removal of Debris | Garbage at the dumping ground is burning for the last 7 days |
| $.queue.action[1].ward | 58 | 57 |
| $.queue.action[1].taluk | TLK-EGM | TLK-TDP |

...and 49 more paths (see the JSON file).

### officerA GET /api/officer/overview?zone=13

Session reads2, id 57cfe5cd1d9db7a3, 43337 bytes to 44093 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 30 days |
| $.counts.action | 2 | 7 |
| $.counts.sent | 5 | 0 |
| $.oldest.breached | (absent) | 1 |
| $.map.pins[0].stage | sent | action |
| $.map.pins[1].stage | sent | action |
| $.map.pins[2].stage | sent | action |
| $.map.pins[3].stage | sent | action |
| $.map.pins[5].stage | sent | action |
| $.news[0].stage | sent | action |
| $.news[0].breached | (absent) | 1 |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.board.bell.length | 2 | 0 |
| $.board.bell[0] | {object with 40 keys} | (absent) |
| $.board.bell[1] | {object with 40 keys} | (absent) |
| $.queue.new[0].breached | (absent) | 0 |
| $.queue.new[1].breached | (absent) | 1 |
| $.queue.action.length | 2 | 7 |
| $.queue.action[0].id | INC-20261026-4A8649 | INC-20261013-2F511C |
| $.queue.action[0].title | Shifting of Garbage Bin: the problem opp. Kalyana Mandapam has continued for the past 10 days | Severe stench emanating due to accumulation of plastic garbage and waste in the Peeliamman temple pond in Taramani, Chennai |
| $.queue.action[0].ward | 171 | 180 |
| $.queue.action[0].taluk | TLK-GND | TLK-VLC |
| $.queue.action[0].loc | Sastri Nagar 8Th Lane, Adayar, Adayar | Pillayar Koil Street, Taramani |
| $.queue.action[0].lat | 13.0276525 | 12.988164620580084 |

...and 35 more paths (see the JSON file).

### officerA GET /api/officer/overview?zone=1

Session reads2, id a26ac44e418874dc, 32029 bytes to 29350 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 30 days |
| $.oldest.breached | (absent) | 1 |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.board.bell.length | 2 | 0 |
| $.board.bell[0] | {object with 40 keys} | (absent) |
| $.board.bell[1] | {object with 40 keys} | (absent) |
| $.queue.new[0].breached | (absent) | 1 |
| $.queue.new[1].breached | (absent) | 0 |
| $.queue.new[2].breached | (absent) | 0 |
| $.queue.new[3].breached | (absent) | 0 |
| $.queue.action[0].breached | (absent) | 0 |
| $.resolved | (absent) | {object with 3 keys} |
| $.feedbackCounts | (absent) | {object with 4 keys} |

### officerA GET /api/officer/overview?period=weekly&zone=5

Session reads2, id 98b30c85358edf73, 36519 bytes to 35125 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 7 days |
| $.counts.action | 2 | 4 |
| $.counts.sent | 2 | 0 |
| $.oldest.stage | sent | action |
| $.oldest.breached | (absent) | 1 |
| $.map.pins[1].stage | sent | action |
| $.map.pins[2].stage | sent | action |
| $.news[0].breached | (absent) | 0 |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.board.bell.length | 2 | 0 |
| $.board.bell[0] | {object with 40 keys} | (absent) |
| $.board.bell[1] | {object with 40 keys} | (absent) |
| $.queue.new[0].breached | (absent) | 0 |
| $.queue.new[1].breached | (absent) | 0 |
| $.queue.new[2].breached | (absent) | 0 |
| $.queue.new[3].breached | (absent) | 0 |
| $.queue.new[4].breached | (absent) | 0 |
| $.queue.new[5].breached | (absent) | 0 |
| $.queue.action.length | 2 | 4 |
| $.queue.action[0].id | INC-20261104-EE6DFD | INC-20261103-85057B |
| $.queue.action[0].title | Erran Street-ல் கடை வைத்திருக்கிறேன். குப்பை பிரச்சினை: Removal of Debris | Garbage at the dumping ground is burning for the last 7 days |
| $.queue.action[0].ward | 58 | 57 |
| $.queue.action[0].taluk | TLK-EGM | TLK-TDP |
| $.queue.action[0].loc | Erran Street, Perumalpet, Perumalpet | Dhakshina Murthy Koil Street, Old Washermenpet, Mint |

...and 25 more paths (see the JSON file).

### officerA GET /api/officer/overview?period=monthly&zone=13

Session reads2, id 3721d050a2e51302, 43337 bytes to 44093 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 30 days |
| $.counts.action | 2 | 7 |
| $.counts.sent | 5 | 0 |
| $.oldest.breached | (absent) | 1 |
| $.map.pins[0].stage | sent | action |
| $.map.pins[1].stage | sent | action |
| $.map.pins[2].stage | sent | action |
| $.map.pins[3].stage | sent | action |
| $.map.pins[5].stage | sent | action |
| $.news[0].stage | sent | action |
| $.news[0].breached | (absent) | 1 |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.board.bell.length | 2 | 0 |
| $.board.bell[0] | {object with 40 keys} | (absent) |
| $.board.bell[1] | {object with 40 keys} | (absent) |
| $.queue.new[0].breached | (absent) | 0 |
| $.queue.new[1].breached | (absent) | 1 |
| $.queue.action.length | 2 | 7 |
| $.queue.action[0].id | INC-20261026-4A8649 | INC-20261013-2F511C |
| $.queue.action[0].title | Shifting of Garbage Bin: the problem opp. Kalyana Mandapam has continued for the past 10 days | Severe stench emanating due to accumulation of plastic garbage and waste in the Peeliamman temple pond in Taramani, Chennai |
| $.queue.action[0].ward | 171 | 180 |
| $.queue.action[0].taluk | TLK-GND | TLK-VLC |
| $.queue.action[0].loc | Sastri Nagar 8Th Lane, Adayar, Adayar | Pillayar Koil Street, Taramani |
| $.queue.action[0].lat | 13.0276525 | 12.988164620580084 |

...and 35 more paths (see the JSON file).

### officerA GET /api/officer/overview?period=quarterly&zone=1

Session reads2, id be5f27a89fd0abd9, 53687 bytes to 50981 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 90 days |
| $.oldest.breached | (absent) | 1 |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.board.bell.length | 2 | 0 |
| $.board.bell[0] | {object with 40 keys} | (absent) |
| $.board.bell[1] | {object with 40 keys} | (absent) |
| $.queue.new[0].breached | (absent) | 1 |
| $.queue.new[1].breached | (absent) | 0 |
| $.queue.new[2].breached | (absent) | 0 |
| $.queue.new[3].breached | (absent) | 0 |
| $.queue.action[0].breached | (absent) | 0 |
| $.resolved | (absent) | {object with 3 keys} |
| $.feedbackCounts | (absent) | {object with 4 keys} |

### officerA GET /api/officer/overview?period=weekly&taluk=TLK-MYL

Session reads2, id e02128e36e5b6561, 33390 bytes to 30702 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 7 days |
| $.oldest.breached | (absent) | 1 |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.board.bell.length | 2 | 0 |
| $.board.bell[0] | {object with 40 keys} | (absent) |
| $.board.bell[1] | {object with 40 keys} | (absent) |
| $.queue.new[0].breached | (absent) | 0 |
| $.queue.new[1].breached | (absent) | 1 |
| $.queue.new[2].breached | (absent) | 0 |
| $.queue.new[3].breached | (absent) | 0 |
| $.queue.new[4].breached | (absent) | 0 |
| $.queue.action[0].breached | (absent) | 1 |
| $.queue.action[1].breached | (absent) | 1 |
| $.queue.action[2].breached | (absent) | 1 |
| $.resolved | (absent) | {object with 3 keys} |
| $.feedbackCounts | (absent) | {object with 4 keys} |

### officerA GET /api/officer/search?q=Adyar

Session reads2, id 314ca0f9c54feee0, 5128 bytes to 5242 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].stage | sent | action |
| $.rows[1].breached | (absent) | 1 |
| $.rows[2].stage | sent | action |
| $.rows[2].breached | (absent) | 1 |
| $.rows[3].stage | sent | action |
| $.rows[3].breached | (absent) | 1 |
| $.rows[4].stage | sent | action |
| $.rows[4].breached | (absent) | 1 |
| $.rows[5].breached | (absent) | 1 |
| $.rows[6].breached | (absent) | 1 |
| $.rows[7].stage | sent | action |
| $.rows[7].breached | (absent) | 1 |

### officerA GET /api/officer/search?q=garbage

Session reads2, id 641461f3064dfce4, 4841 bytes to 4945 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerA GET /api/officer/search?q=kuppai

Session reads2, id 96f40a1d207fb55b, 4845 bytes to 4951 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 1 |
| $.rows[5].stage | sent | action |
| $.rows[5].breached | (absent) | 1 |
| $.rows[6].breached | (absent) | 1 |
| $.rows[7].breached | (absent) | 1 |

### officerA GET /api/officer/search?q=குப்பை

Session reads2, id 08be3e80b94a75a1, 5487 bytes to 5595 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 1 |
| $.rows[5].stage | sent | action |
| $.rows[5].breached | (absent) | 1 |
| $.rows[6].stage | sent | action |
| $.rows[6].breached | (absent) | 1 |
| $.rows[7].breached | (absent) | 1 |

### officerA GET /api/officer/search?q=INC-20260926-EB3B79

Session reads2, id d05dc56f98972818, 631 bytes to 646 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].stage | sent | action |
| $.rows[0].breached | (absent) | 1 |

### officerB GET /api/officer/grievances

Session reads2, id ff217ca4330d478b, 4985 bytes to 5089 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 1 |
| $.rows[3].breached | (absent) | 1 |
| $.rows[4].breached | (absent) | 1 |
| $.rows[5].breached | (absent) | 1 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?flag=open

Session reads2, id 20c68b0a09c6ea5c, 4985 bytes to 5089 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 1 |
| $.rows[3].breached | (absent) | 1 |
| $.rows[4].breached | (absent) | 1 |
| $.rows[5].breached | (absent) | 1 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?flag=serious

Session reads2, id 2f51489803aae58b, 3783 bytes to 3861 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 1 |
| $.rows[3].breached | (absent) | 1 |
| $.rows[4].breached | (absent) | 1 |
| $.rows[5].breached | (absent) | 1 |

### officerB GET /api/officer/grievances?flag=overdue

Session reads2, id a8edc13a1f4c7381, 4998 bytes to 5102 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 1 |
| $.rows[1].breached | (absent) | 1 |
| $.rows[2].breached | (absent) | 1 |
| $.rows[3].breached | (absent) | 1 |
| $.rows[4].breached | (absent) | 1 |
| $.rows[5].breached | (absent) | 1 |
| $.rows[6].breached | (absent) | 1 |
| $.rows[7].breached | (absent) | 1 |

### officerB GET /api/officer/grievances?flag=due

Session reads2, id a3616728f164c30f, 1371 bytes to 1397 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?period=daily

Session reads2, id f04ceb455a7cc711, 5319 bytes to 5423 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?period=weekly

Session reads2, id 5b8108cc84314973, 4985 bytes to 5089 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 1 |
| $.rows[3].breached | (absent) | 1 |
| $.rows[4].breached | (absent) | 1 |
| $.rows[5].breached | (absent) | 1 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?period=monthly

Session reads2, id 374b4b739aa85e48, 4985 bytes to 5089 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 1 |
| $.rows[3].breached | (absent) | 1 |
| $.rows[4].breached | (absent) | 1 |
| $.rows[5].breached | (absent) | 1 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?period=quarterly

Session reads2, id 64a283f7200da639, 4985 bytes to 5089 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 1 |
| $.rows[3].breached | (absent) | 1 |
| $.rows[4].breached | (absent) | 1 |
| $.rows[5].breached | (absent) | 1 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?q=Adyar

Session reads2, id 6b0361534e367c8f, 1551 bytes to 1577 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?q=x

Session reads2, id 8690f640573a389b, 4985 bytes to 5089 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 1 |
| $.rows[3].breached | (absent) | 1 |
| $.rows[4].breached | (absent) | 1 |
| $.rows[5].breached | (absent) | 1 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?sev=High

Session reads2, id fe1c82627b30362d, 3783 bytes to 3861 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 1 |
| $.rows[3].breached | (absent) | 1 |
| $.rows[4].breached | (absent) | 1 |
| $.rows[5].breached | (absent) | 1 |

### officerB GET /api/officer/grievances?sev=Medium

Session reads2, id 7b4dc751bbe80260, 5399 bytes to 5503 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?sev=Low

Session reads2, id 854d624445c3e8b4, 5046 bytes to 5150 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?sev=bogus

Session reads2, id aa8f1cbe84cc99d8, 4985 bytes to 71 bytes.
- status: 200 to 400
- cache: no-store, max-age=0 to null

| Path | A | B |
|---|---|---|
| $.now | 2026-11-06 18:08:00 | (absent) |
| $.rows | [array of 8] | (absent) |
| $.total | 38 | (absent) |
| $.page | 0 | (absent) |
| $.per | 8 | (absent) |
| $.awaiting | 0 | (absent) |
| $.awaitingNote | null | (absent) |
| $.error | (absent) | Severity "bogus" is not one of Severe, High, Medium, Low. |

### officerB GET /api/officer/grievances?tab=all

Session reads2, id df11867e7ee6961a, 5178 bytes to 5282 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?tab=new

Session reads2, id f05d989a02bb1710, 4985 bytes to 5089 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 1 |
| $.rows[3].breached | (absent) | 1 |
| $.rows[4].breached | (absent) | 1 |
| $.rows[5].breached | (absent) | 1 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?tab=action

Session reads2, id 76e6562a23d4d60a, 5310 bytes to 5414 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 1 |
| $.rows[1].breached | (absent) | 1 |
| $.rows[2].breached | (absent) | 1 |
| $.rows[3].breached | (absent) | 1 |
| $.rows[4].breached | (absent) | 1 |
| $.rows[5].breached | (absent) | 1 |
| $.rows[6].breached | (absent) | 1 |
| $.rows[7].breached | (absent) | 1 |
| $.total | 49 | 61 |

### officerB GET /api/officer/grievances?tab=sent

Session reads2, id b2b83600db1de703, 5578 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.rows.length | 8 | 0 |
| $.rows[0] | {object with 25 keys} | (absent) |
| $.rows[1] | {object with 25 keys} | (absent) |
| $.rows[2] | {object with 25 keys} | (absent) |
| $.rows[3] | {object with 25 keys} | (absent) |
| $.rows[4] | {object with 25 keys} | (absent) |
| $.rows[5] | {object with 25 keys} | (absent) |
| $.rows[6] | {object with 25 keys} | (absent) |
| $.rows[7] | {object with 25 keys} | (absent) |
| $.total | 12 | 0 |

### officerB GET /api/officer/grievances?tab=verified

Session reads2, id 3debde103903e062, 5332 bytes to 5436 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 1 |
| $.rows[1].breached | (absent) | 1 |
| $.rows[2].breached | (absent) | 1 |
| $.rows[3].breached | (absent) | 1 |
| $.rows[4].breached | (absent) | 1 |
| $.rows[5].breached | (absent) | 1 |
| $.rows[6].breached | (absent) | 1 |
| $.rows[7].breached | (absent) | 1 |

### officerB GET /api/officer/grievances?taluk=TLK-MYL

Session reads2, id 04d4a5d3b49b34fe, 1458 bytes to 1484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?taluk=TLK-MDR

Session reads2, id 50acb3e00dd5d506, 3163 bytes to 3228 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 1 |
| $.rows[2].breached | (absent) | 1 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?taluk=TLK-AYN

Session reads2, id 0bd41e756d7a5b58, 1431 bytes to 1457 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?zone=5

Session reads2, id c1d092275969691f, 4442 bytes to 4533 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 1 |
| $.rows[1].breached | (absent) | 1 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 1 |

### officerB GET /api/officer/grievances?zone=13

Session reads2, id 420c2ac1d1a7cb29, 1551 bytes to 1577 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?zone=1

Session reads2, id 38586f1f11e2b7b5, 1350 bytes to 1376 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?zone=8

Session reads2, id a036548660f9f1a6, 1391 bytes to 1417 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 1 |
| $.rows[1].breached | (absent) | 1 |

### officerB GET /api/officer/grievances?period=weekly&zone=5

Session reads2, id b92acb53c8e1a9a6, 3778 bytes to 3856 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 1 |
| $.rows[1].breached | (absent) | 1 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?period=monthly&zone=13

Session reads2, id af950460851c6def, 1551 bytes to 1577 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?period=quarterly&zone=1

Session reads2, id 849d784629a50a4d, 1350 bytes to 1376 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?period=weekly&taluk=TLK-MYL

Session reads2, id 996ded8e43e1e0ed, 1458 bytes to 1484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |

### officerB GET /api/officer/grievances?period=monthly&tab=all&sev=High

Session reads2, id 6fba68681c70e54c, 5193 bytes to 5297 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 1 |
| $.rows[3].breached | (absent) | 1 |
| $.rows[4].breached | (absent) | 1 |
| $.rows[5].breached | (absent) | 1 |
| $.rows[6].breached | (absent) | 1 |
| $.rows[7].breached | (absent) | 1 |

### officerB GET /api/officer/grievances/INC-20261106-31532C

Session reads2, id 9aeca5cdd22b4263, 1544 bytes to 1573 bytes.

| Path | A | B |
|---|---|---|
| $.grievance.breached | (absent) | 0 |
| $.rejected | (absent) | null |

### officerB GET /api/officer/grievances/INC-20261102-02C5CC

Session reads2, id 7979355e6c9ac141, 2052 bytes to 2082 bytes.

| Path | A | B |
|---|---|---|
| $.grievance.breached | (absent) | 1 |
| $.next | send | close |
| $.rejected | (absent) | null |

### officerB GET /api/officer/grievances/INC-20260729-DD5997

Session reads2, id dd143564e2794fe6, 2091 bytes to 2120 bytes.

| Path | A | B |
|---|---|---|
| $.grievance.breached | (absent) | 1 |
| $.rejected | (absent) | null |

### officerB GET /api/officer/overview

Session reads2, id 3c441be835c7ba16, 173961 bytes to 174521 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 30 days |
| $.counts.action | 49 | 61 |
| $.counts.sent | 12 | 0 |
| $.oldest.breached | (absent) | 1 |
| $.map.pins[28].stage | sent | action |
| $.map.pins[31].stage | sent | action |
| $.map.pins[32].stage | sent | action |
| $.map.pins[38].stage | sent | action |
| $.map.pins[40].stage | sent | action |
| $.map.pins[43].stage | sent | action |
| $.map.pins[45].stage | sent | action |
| $.map.pins[76].stage | sent | action |
| $.map.pins[85].stage | sent | action |
| $.map.pins[89].stage | sent | action |
| $.map.pins[90].stage | sent | action |
| $.map.pins[91].stage | sent | action |
| $.news[0].breached | (absent) | 1 |
| $.news[1].breached | (absent) | 1 |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.queue.new[0].breached | (absent) | 0 |
| $.queue.new[1].breached | (absent) | 0 |
| $.queue.new[2].breached | (absent) | 1 |
| $.queue.new[3].breached | (absent) | 1 |
| $.queue.new[4].breached | (absent) | 1 |

...and 13 more paths (see the JSON file).

### officerB GET /api/officer/overview?period=daily

Session reads2, id 4e7f746f9dee669b, 69683 bytes to 70086 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 24 hours |
| $.oldest.breached | (absent) | 0 |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.queue.new[0].breached | (absent) | 0 |
| $.queue.new[1].breached | (absent) | 0 |
| $.queue.new[2].breached | (absent) | 0 |
| $.queue.new[3].breached | (absent) | 0 |
| $.queue.new[4].breached | (absent) | 0 |
| $.queue.new[5].breached | (absent) | 0 |
| $.queue.new[6].breached | (absent) | 0 |
| $.queue.new[7].breached | (absent) | 0 |
| $.queue.action[0].breached | (absent) | 0 |
| $.queue.action[1].breached | (absent) | 0 |
| $.queue.action[2].breached | (absent) | 0 |
| $.queue.action[3].breached | (absent) | 0 |
| $.resolved | (absent) | {object with 3 keys} |
| $.feedbackCounts | (absent) | {object with 4 keys} |

### officerB GET /api/officer/overview?period=weekly

Session reads2, id 8a0733085b00209d, 149138 bytes to 149633 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 7 days |
| $.counts.action | 38 | 49 |
| $.counts.sent | 11 | 0 |
| $.oldest.stage | sent | action |
| $.oldest.breached | (absent) | 1 |
| $.map.pins[26].stage | sent | action |
| $.map.pins[29].stage | sent | action |
| $.map.pins[30].stage | sent | action |
| $.map.pins[36].stage | sent | action |
| $.map.pins[38].stage | sent | action |
| $.map.pins[41].stage | sent | action |
| $.map.pins[43].stage | sent | action |
| $.map.pins[69].stage | sent | action |
| $.map.pins[78].stage | sent | action |
| $.map.pins[82].stage | sent | action |
| $.map.pins[83].stage | sent | action |
| $.news[0].breached | (absent) | 1 |
| $.news[1].breached | (absent) | 1 |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.queue.new[0].breached | (absent) | 0 |
| $.queue.new[1].breached | (absent) | 0 |
| $.queue.new[2].breached | (absent) | 1 |
| $.queue.new[3].breached | (absent) | 1 |
| $.queue.new[4].breached | (absent) | 1 |

...and 13 more paths (see the JSON file).

### officerB GET /api/officer/overview?period=monthly

Session reads2, id b82fcdbaaf06d94e, 173961 bytes to 174521 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 30 days |
| $.counts.action | 49 | 61 |
| $.counts.sent | 12 | 0 |
| $.oldest.breached | (absent) | 1 |
| $.map.pins[28].stage | sent | action |
| $.map.pins[31].stage | sent | action |
| $.map.pins[32].stage | sent | action |
| $.map.pins[38].stage | sent | action |
| $.map.pins[40].stage | sent | action |
| $.map.pins[43].stage | sent | action |
| $.map.pins[45].stage | sent | action |
| $.map.pins[76].stage | sent | action |
| $.map.pins[85].stage | sent | action |
| $.map.pins[89].stage | sent | action |
| $.map.pins[90].stage | sent | action |
| $.map.pins[91].stage | sent | action |
| $.news[0].breached | (absent) | 1 |
| $.news[1].breached | (absent) | 1 |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.queue.new[0].breached | (absent) | 0 |
| $.queue.new[1].breached | (absent) | 0 |
| $.queue.new[2].breached | (absent) | 1 |
| $.queue.new[3].breached | (absent) | 1 |
| $.queue.new[4].breached | (absent) | 1 |

...and 13 more paths (see the JSON file).

### officerB GET /api/officer/overview?period=quarterly

Session reads2, id 14cf00a60884dd89, 198992 bytes to 199529 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 90 days |
| $.counts.action | 50 | 62 |
| $.counts.sent | 12 | 0 |
| $.oldest.breached | (absent) | 1 |
| $.map.pins[28].stage | sent | action |
| $.map.pins[31].stage | sent | action |
| $.map.pins[32].stage | sent | action |
| $.map.pins[38].stage | sent | action |
| $.map.pins[40].stage | sent | action |
| $.map.pins[43].stage | sent | action |
| $.map.pins[45].stage | sent | action |
| $.map.pins[76].stage | sent | action |
| $.map.pins[85].stage | sent | action |
| $.map.pins[89].stage | sent | action |
| $.map.pins[90].stage | sent | action |
| $.map.pins[91].stage | sent | action |
| $.news[0].breached | (absent) | 1 |
| $.news[1].breached | (absent) | 1 |
| $.news[2].breached | (absent) | 1 |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.queue.new[0].breached | (absent) | 0 |
| $.queue.new[1].breached | (absent) | 0 |
| $.queue.new[2].breached | (absent) | 1 |
| $.queue.new[3].breached | (absent) | 1 |

...and 14 more paths (see the JSON file).

### officerB GET /api/officer/overview?taluk=TLK-MYL

Session reads2, id 1f4b7883e5657b0c, 39692 bytes to 31552 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 30 days |
| $.counts.action | 2 | 3 |
| $.counts.sent | 1 | 0 |
| $.oldest.breached | (absent) | 1 |
| $.map.pins[2].stage | sent | action |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.board.bell.length | 6 | 0 |
| $.board.bell[0] | {object with 40 keys} | (absent) |
| $.board.bell[1] | {object with 40 keys} | (absent) |
| $.board.bell[2] | {object with 40 keys} | (absent) |
| $.board.bell[3] | {object with 40 keys} | (absent) |
| $.board.bell[4] | {object with 40 keys} | (absent) |
| $.board.bell[5] | {object with 40 keys} | (absent) |
| $.queue.new[0].breached | (absent) | 0 |
| $.queue.new[1].breached | (absent) | 0 |
| $.queue.action.length | 2 | 3 |
| $.queue.action[0].breached | (absent) | 1 |
| $.queue.action[1].id | INC-20261031-9004FA | INC-20261031-1EA35B |
| $.queue.action[1].title | Street light rendu vaaram ah eriyala, night la nadandhu poga bayama irukku | Street light one week ah eriyala, night la nadandhu poga bayama irukku |
| $.queue.action[1].zone | 9 | 13 |
| $.queue.action[1].zone_name | Teynampet | Adyar |
| $.queue.action[1].ward | 124 | 173 |
| $.queue.action[1].loc | Luz Church Road 2Nd Street, Mylapore, Mylapore | Apranji Avenue (Ellaiamman Koil St), Sastri Nagar, Urur |
| $.queue.action[1].lat | 13.0421746 | 13.0157372 |

...and 10 more paths (see the JSON file).

### officerB GET /api/officer/overview?taluk=TLK-SHN

Session reads2, id d5b65ebbc00a62de, 30394 bytes to 25132 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 30 days |
| $.counts.action | 2 | 3 |
| $.counts.sent | 1 | 0 |
| $.oldest.stage | sent | action |
| $.oldest.breached | (absent) | 1 |
| $.map.pins[2].stage | sent | action |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.board.bell.length | 6 | 2 |
| $.board.bell[0].id | INC-20261024-C62618 | INC-20261104-FDA42B |
| $.board.bell[0].title | Street light problem near Post Office: damage to the electric pole | People are getting electric shock from the street light pole near Corporation School |
| $.board.bell[0].ward | 189 | 186 |
| $.board.bell[0].loc | Sainadan Street, Sainadan Street, Madipakkam | Nethaji Street, M.G.R.Nagar, Tharamani |
| $.board.bell[0].lat | 12.9567178 | 12.9645393 |
| $.board.bell[0].lon | 80.2233284 | 80.2361295 |
| $.board.bell[0].complaints | 4 | 2 |
| $.board.bell[0].t | 2026-10-24 21:35:00 | 2026-11-04 17:24:00 |
| $.board.bell[0].summary | 4 reports (Grievance portal) about street lights & electrical hazards at Sainadan Street, Sainadan Street, Madipakkam, Ward 189 (Perungudi).... (190 chars) | 2 reports (Grievance portal) about street lights & electrical hazards at Nethaji Street, M.G.R.Nagar, Tharamani, Ward 186 (Perungudi). First... (184 chars) |
| $.board.bell[0].priority | 88 | 102.8 |
| $.board.bell[0].sla_due | 2026-10-25 21:35:00 | 2026-11-05 17:24:00 |
| $.board.bell[0].hours_open | 308.6 | 48.7 |
| $.board.bell[0].severity_reasons | High-risk issue: Damage to the Electric pole (+35); Affects school, hospital (+16) | High-risk issue: Electric shock due to street light (+35); Describes an immediate hazard (+15); Affects school (+8); Citizen reports complai... (157 chars) |
| $.board.bell[0].priority_reasons | High street lights & electrical hazards (51); 4 citizen complaints; resolution over twice the 24 h target; affects hospital, school; linked ... (155 chars) | High street lights & electrical hazards (68); 2 citizen complaints; resolution over twice the 24 h target; affects school, worship; linked t... (154 chars) |
| $.board.bell[0].officer | null | AE, Zone 14 |
| $.board.bell[0].updated | 2026-10-31 15:31:00 | 2026-11-06 14:37:00 |

...and 34 more paths (see the JSON file).

### officerB GET /api/officer/overview?zone=5

Session reads2, id 85538e299bdddf90, 73583 bytes to 67789 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 30 days |
| $.counts.action | 10 | 11 |
| $.counts.sent | 1 | 0 |
| $.oldest.breached | (absent) | 1 |
| $.map.pins[6].stage | sent | action |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.board.bell.length | 6 | 2 |
| $.board.bell[0].id | INC-20261024-C62618 | INC-20261104-DE5CBD |
| $.board.bell[0].title | Street light problem near Post Office: damage to the electric pole | Damage to the Electric pole in our area. Please send the electrical team |
| $.board.bell[0].zone | 14 | 5 |
| $.board.bell[0].zone_name | Perungudi | Royapuram |
| $.board.bell[0].ward | 189 | 52 |
| $.board.bell[0].loc | Sainadan Street, Sainadan Street, Madipakkam | Rama (Naiken) 3Rd Lane, Meenatchiamman Pettai, Royapuram |
| $.board.bell[0].lat | 12.9567178 | 13.1062033 |
| $.board.bell[0].lon | 80.2233284 | 80.2892343 |
| $.board.bell[0].status | In progress | Under review |
| $.board.bell[0].verified | 1 | 0 |
| $.board.bell[0].complaints | 4 | 1 |
| $.board.bell[0].t | 2026-10-24 21:35:00 | 2026-11-04 14:38:00 |
| $.board.bell[0].summary | 4 reports (Grievance portal) about street lights & electrical hazards at Sainadan Street, Sainadan Street, Madipakkam, Ward 189 (Perungudi).... (190 chars) | 1 report (Grievance portal) about street lights & electrical hazards at Rama (Naiken) 3Rd Lane, Meenatchiamman Pettai, Royapuram, Ward 52 (R... (201 chars) |
| $.board.bell[0].priority | 88 | 89 |
| $.board.bell[0].sla_due | 2026-10-25 21:35:00 | 2026-11-05 14:38:00 |
| $.board.bell[0].hours_open | 308.6 | 51.5 |
| $.board.bell[0].severity_reasons | High-risk issue: Damage to the Electric pole (+35); Affects school, hospital (+16) | High-risk issue: Damage to the Electric pole (+35); Affects school, worship (+16) |

...and 104 more paths (see the JSON file).

### officerB GET /api/officer/overview?zone=13

Session reads2, id 7ff683d1103a192d, 37484 bytes to 29346 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 30 days |
| $.counts.action | 2 | 3 |
| $.counts.sent | 1 | 0 |
| $.oldest.stage | sent | action |
| $.oldest.breached | (absent) | 1 |
| $.map.pins[2].stage | sent | action |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.board.bell.length | 6 | 0 |
| $.board.bell[0] | {object with 40 keys} | (absent) |
| $.board.bell[1] | {object with 40 keys} | (absent) |
| $.board.bell[2] | {object with 40 keys} | (absent) |
| $.board.bell[3] | {object with 40 keys} | (absent) |
| $.board.bell[4] | {object with 40 keys} | (absent) |
| $.board.bell[5] | {object with 40 keys} | (absent) |
| $.queue.new[0].breached | (absent) | 0 |
| $.queue.new[1].breached | (absent) | 0 |
| $.queue.action.length | 2 | 3 |
| $.queue.action[0].breached | (absent) | 1 |
| $.queue.action[1].id | INC-20261106-6D186D | INC-20261031-1EA35B |
| $.queue.action[1].title | Street light problem: Non burning of Street lights | Street light one week ah eriyala, night la nadandhu poga bayama irukku |
| $.queue.action[1].ward | 182 | 173 |
| $.queue.action[1].taluk | TLK-VLC | TLK-MYL |
| $.queue.action[1].loc | Ist Street, Malaviya Avenue, Thiruvanmiyur | Apranji Avenue (Ellaiamman Koil St), Sastri Nagar, Urur |
| $.queue.action[1].lat | 12.9858182 | 13.0157372 |

...and 12 more paths (see the JSON file).

### officerB GET /api/officer/overview?zone=1

Session reads2, id 9ce2073ec9195752, 42950 bytes to 35847 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 30 days |
| $.oldest.breached | (absent) | 1 |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.board.bell.length | 6 | 1 |
| $.board.bell[0].id | INC-20261024-C62618 | INC-20260616-77B20A |
| $.board.bell[0].title | Street light problem near Post Office: damage to the electric pole | Person received an electric shock from a snapped wire reported on West Mada Street Extension, Kaladipet |
| $.board.bell[0].zone | 14 | 1 |
| $.board.bell[0].zone_name | Perungudi | Thiruvottiyur |
| $.board.bell[0].ward | 189 | 10 |
| $.board.bell[0].loc | Sainadan Street, Sainadan Street, Madipakkam | West Mada Street Extension, Kaladipet |
| $.board.bell[0].lat | 12.9567178 | 13.161374432955588 |
| $.board.bell[0].lon | 80.2233284 | 80.30086870788655 |
| $.board.bell[0].complaints | 4 | 2 |
| $.board.bell[0].sources | grievance | grievance\|police |
| $.board.bell[0].source_count | 1 | 2 |
| $.board.bell[0].channels | citizen_app | citizen_app\|control_room_112 |
| $.board.bell[0].t | 2026-10-24 21:35:00 | 2026-11-01 08:59:21 |
| $.board.bell[0].summary | 4 reports (Grievance portal) about street lights & electrical hazards at Sainadan Street, Sainadan Street, Madipakkam, Ward 189 (Perungudi).... (190 chars) | 3 reports (Grievance portal, Police 112) about street lights & electrical hazards at West Mada Street Extension, Kaladipet, Ward 10 (Thiruvo... (198 chars) |
| $.board.bell[0].priority | 88 | 110.8 |
| $.board.bell[0].sla_due | 2026-10-25 21:35:00 | 2026-11-02 08:59:21 |
| $.board.bell[0].hours_open | 308.6 | 129.1 |
| $.board.bell[0].severity_reasons | High-risk issue: Damage to the Electric pole (+35); Affects school, hospital (+16) | High-risk issue: Electric shock due to street light (+35); Describes an immediate hazard (+15); Affects worship, children (+16) |
| $.board.bell[0].priority_reasons | High street lights & electrical hazards (51); 4 citizen complaints; resolution over twice the 24 h target; affects hospital, school; linked ... (155 chars) | High street lights & electrical hazards (66); reported by 2 sources; 2 citizen complaints; resolution over twice the 24 h target; affects ch... (216 chars) |
| $.board.bell[0].attention_reason | Well past its deadline | Well past its deadline, Needs several departments |

...and 20 more paths (see the JSON file).

### officerB GET /api/officer/overview?period=weekly&zone=5

Session reads2, id fb11e838dddc8e74, 53647 bytes to 48309 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 7 days |
| $.counts.action | 7 | 8 |
| $.counts.sent | 1 | 0 |
| $.oldest.breached | (absent) | 0 |
| $.map.pins[6].stage | sent | action |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.board.bell.length | 6 | 2 |
| $.board.bell[0].id | INC-20260712-9475F7 | INC-20261104-DE5CBD |
| $.board.bell[0].title | Temporary EB cable causes inconvenience to MKB Nagar residents | Damage to the Electric pole in our area. Please send the electrical team |
| $.board.bell[0].zone | 4 | 5 |
| $.board.bell[0].zone_name | Tondiarpet | Royapuram |
| $.board.bell[0].ward | 36 | 52 |
| $.board.bell[0].loc | Goyyathoppu Gandhi Nagar 5Th Street, Kodungaiyur | Rama (Naiken) 3Rd Lane, Meenatchiamman Pettai, Royapuram |
| $.board.bell[0].lat | 13.129838418051587 | 13.1062033 |
| $.board.bell[0].lon | 80.25976237430874 | 80.2892343 |
| $.board.bell[0].status | In progress | Under review |
| $.board.bell[0].verified | 1 | 0 |
| $.board.bell[0].complaints | 2 | 1 |
| $.board.bell[0].outlets | 1 | 0 |
| $.board.bell[0].sources | grievance\|news | grievance |
| $.board.bell[0].source_count | 2 | 1 |
| $.board.bell[0].channels | citizen_app\|media | citizen_app |
| $.board.bell[0].t | 2026-10-30 23:57:08 | 2026-11-04 14:38:00 |
| $.board.bell[0].summary | 3 reports (Grievance portal, News) about street lights & electrical hazards at Goyyathoppu Gandhi Nagar 5Th Street, Kodungaiyur, Ward 36 (To... (200 chars) | 1 report (Grievance portal) about street lights & electrical hazards at Rama (Naiken) 3Rd Lane, Meenatchiamman Pettai, Royapuram, Ward 52 (R... (201 chars) |

...and 120 more paths (see the JSON file).

### officerB GET /api/officer/overview?period=monthly&zone=13

Session reads2, id f6885d5a3b61558d, 37484 bytes to 29346 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 30 days |
| $.counts.action | 2 | 3 |
| $.counts.sent | 1 | 0 |
| $.oldest.stage | sent | action |
| $.oldest.breached | (absent) | 1 |
| $.map.pins[2].stage | sent | action |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.board.bell.length | 6 | 0 |
| $.board.bell[0] | {object with 40 keys} | (absent) |
| $.board.bell[1] | {object with 40 keys} | (absent) |
| $.board.bell[2] | {object with 40 keys} | (absent) |
| $.board.bell[3] | {object with 40 keys} | (absent) |
| $.board.bell[4] | {object with 40 keys} | (absent) |
| $.board.bell[5] | {object with 40 keys} | (absent) |
| $.queue.new[0].breached | (absent) | 0 |
| $.queue.new[1].breached | (absent) | 0 |
| $.queue.action.length | 2 | 3 |
| $.queue.action[0].breached | (absent) | 1 |
| $.queue.action[1].id | INC-20261106-6D186D | INC-20261031-1EA35B |
| $.queue.action[1].title | Street light problem: Non burning of Street lights | Street light one week ah eriyala, night la nadandhu poga bayama irukku |
| $.queue.action[1].ward | 182 | 173 |
| $.queue.action[1].taluk | TLK-VLC | TLK-MYL |
| $.queue.action[1].loc | Ist Street, Malaviya Avenue, Thiruvanmiyur | Apranji Avenue (Ellaiamman Koil St), Sastri Nagar, Urur |
| $.queue.action[1].lat | 12.9858182 | 13.0157372 |

...and 12 more paths (see the JSON file).

### officerB GET /api/officer/overview?period=quarterly&zone=1

Session reads2, id 2116def41c9ee8cd, 50384 bytes to 43247 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 90 days |
| $.oldest.breached | (absent) | 1 |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.board.bell.length | 6 | 1 |
| $.board.bell[0].id | INC-20261024-C62618 | INC-20260616-77B20A |
| $.board.bell[0].title | Street light problem near Post Office: damage to the electric pole | Person received an electric shock from a snapped wire reported on West Mada Street Extension, Kaladipet |
| $.board.bell[0].zone | 14 | 1 |
| $.board.bell[0].zone_name | Perungudi | Thiruvottiyur |
| $.board.bell[0].ward | 189 | 10 |
| $.board.bell[0].loc | Sainadan Street, Sainadan Street, Madipakkam | West Mada Street Extension, Kaladipet |
| $.board.bell[0].lat | 12.9567178 | 13.161374432955588 |
| $.board.bell[0].lon | 80.2233284 | 80.30086870788655 |
| $.board.bell[0].complaints | 4 | 2 |
| $.board.bell[0].sources | grievance | grievance\|police |
| $.board.bell[0].source_count | 1 | 2 |
| $.board.bell[0].channels | citizen_app | citizen_app\|control_room_112 |
| $.board.bell[0].t | 2026-10-24 21:35:00 | 2026-11-01 08:59:21 |
| $.board.bell[0].summary | 4 reports (Grievance portal) about street lights & electrical hazards at Sainadan Street, Sainadan Street, Madipakkam, Ward 189 (Perungudi).... (190 chars) | 3 reports (Grievance portal, Police 112) about street lights & electrical hazards at West Mada Street Extension, Kaladipet, Ward 10 (Thiruvo... (198 chars) |
| $.board.bell[0].priority | 88 | 110.8 |
| $.board.bell[0].sla_due | 2026-10-25 21:35:00 | 2026-11-02 08:59:21 |
| $.board.bell[0].hours_open | 308.6 | 129.1 |
| $.board.bell[0].severity_reasons | High-risk issue: Damage to the Electric pole (+35); Affects school, hospital (+16) | High-risk issue: Electric shock due to street light (+35); Describes an immediate hazard (+15); Affects worship, children (+16) |
| $.board.bell[0].priority_reasons | High street lights & electrical hazards (51); 4 citizen complaints; resolution over twice the 24 h target; affects hospital, school; linked ... (155 chars) | High street lights & electrical hazards (66); reported by 2 sources; 2 citizen complaints; resolution over twice the 24 h target; affects ch... (216 chars) |
| $.board.bell[0].attention_reason | Well past its deadline | Well past its deadline, Needs several departments |

...and 20 more paths (see the JSON file).

### officerB GET /api/officer/overview?period=weekly&taluk=TLK-MYL

Session reads2, id cad69d6004a0c19f, 32259 bytes to 23970 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 7 days |
| $.counts.action | 2 | 3 |
| $.counts.sent | 1 | 0 |
| $.oldest.breached | (absent) | 1 |
| $.map.pins[2].stage | sent | action |
| $.board.map.drawn | (absent) | {object with 3 keys} |
| $.board.map.pinLimit | (absent) | 150 |
| $.board.bell.length | 6 | 0 |
| $.board.bell[0] | {object with 40 keys} | (absent) |
| $.board.bell[1] | {object with 40 keys} | (absent) |
| $.board.bell[2] | {object with 40 keys} | (absent) |
| $.board.bell[3] | {object with 40 keys} | (absent) |
| $.board.bell[4] | {object with 40 keys} | (absent) |
| $.board.bell[5] | {object with 40 keys} | (absent) |
| $.queue.new[0].breached | (absent) | 0 |
| $.queue.new[1].breached | (absent) | 0 |
| $.queue.action.length | 2 | 3 |
| $.queue.action[0].breached | (absent) | 1 |
| $.queue.action[1].id | INC-20261031-9004FA | INC-20261031-1EA35B |
| $.queue.action[1].title | Street light rendu vaaram ah eriyala, night la nadandhu poga bayama irukku | Street light one week ah eriyala, night la nadandhu poga bayama irukku |
| $.queue.action[1].zone | 9 | 13 |
| $.queue.action[1].zone_name | Teynampet | Adyar |
| $.queue.action[1].ward | 124 | 173 |
| $.queue.action[1].loc | Luz Church Road 2Nd Street, Mylapore, Mylapore | Apranji Avenue (Ellaiamman Koil St), Sastri Nagar, Urur |
| $.queue.action[1].lat | 13.0421746 | 13.0157372 |

...and 10 more paths (see the JSON file).

### officerB GET /api/officer/search?q=Adyar

Session reads2, id 556d54836d4f7433, 5369 bytes to 5475 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 1 |
| $.rows[4].breached | (absent) | 1 |
| $.rows[5].stage | sent | action |
| $.rows[5].breached | (absent) | 1 |
| $.rows[6].breached | (absent) | 1 |
| $.rows[7].breached | (absent) | 1 |

### collector GET /api/collector/insights

Session reads2, id efa12c9a2336cbb1, 184966 bytes to 185419 bytes.

| Path | A | B |
|---|---|---|
| $.book.departments[1].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[4].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[5].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[7].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[11].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[12].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.gaps[0].open_now | (absent) | 1 |
| $.gaps[1].open_now | (absent) | 1 |
| $.gaps[2].open_now | (absent) | 1 |
| $.gaps[3].open_now | (absent) | 1 |
| $.gaps[4].open_now | (absent) | 1 |
| $.gaps[5].open_now | (absent) | 1 |
| $.gaps[6].open_now | (absent) | 1 |
| $.gaps[7].open_now | (absent) | 1 |
| $.gaps[8].open_now | (absent) | 1 |
| $.gaps[9].open_now | (absent) | 1 |
| $.review.unplaced[0].open_now | (absent) | 1 |
| $.review.unplaced[1].open_now | (absent) | 1 |
| $.review.unplaced[2].open_now | (absent) | 1 |
| $.review.unplaced[3].open_now | (absent) | 1 |
| $.review.unplaced[4].open_now | (absent) | 1 |
| $.review.unplaced[5].open_now | (absent) | 1 |
| $.review.unplaced[6].open_now | (absent) | 1 |

### collector GET /api/collector/insights?cat=SOLID_WASTE

Session reads2, id b1b96ca9bb77da74, 113869 bytes to 113927 bytes.

| Path | A | B |
|---|---|---|
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |

### collector GET /api/collector/insights?cat=DARK_SPOT_SAFETY

Session reads2, id 1939b2944d12edba, 108846 bytes to 108904 bytes.

| Path | A | B |
|---|---|---|
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |

### collector GET /api/collector/insights?dept=GCC-SWM

Session reads2, id bf1b134ca0b825d1, 106200 bytes to 106258 bytes.

| Path | A | B |
|---|---|---|
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |

### collector GET /api/collector/insights?dept=GCC-ELE

Session reads2, id 42fa0ecc71812082, 109327 bytes to 109385 bytes.

| Path | A | B |
|---|---|---|
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |

### collector GET /api/collector/insights?part=briefing

Session reads2, id 23c9e93c54bea3e0, 164518 bytes to 164880 bytes.

| Path | A | B |
|---|---|---|
| $.book.departments[1].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[4].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[5].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[7].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[11].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[12].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.gaps[0].open_now | (absent) | 1 |
| $.gaps[1].open_now | (absent) | 1 |
| $.gaps[2].open_now | (absent) | 1 |
| $.gaps[3].open_now | (absent) | 1 |
| $.gaps[4].open_now | (absent) | 1 |
| $.gaps[5].open_now | (absent) | 1 |
| $.gaps[6].open_now | (absent) | 1 |
| $.gaps[7].open_now | (absent) | 1 |
| $.gaps[8].open_now | (absent) | 1 |
| $.gaps[9].open_now | (absent) | 1 |

### collector GET /api/collector/insights?part=trends

Session reads2, id e8a802a76a5c7c66, 26032 bytes to 26123 bytes.

| Path | A | B |
|---|---|---|
| $.review.unplaced[0].open_now | (absent) | 1 |
| $.review.unplaced[1].open_now | (absent) | 1 |
| $.review.unplaced[2].open_now | (absent) | 1 |
| $.review.unplaced[3].open_now | (absent) | 1 |
| $.review.unplaced[4].open_now | (absent) | 1 |
| $.review.unplaced[5].open_now | (absent) | 1 |
| $.review.unplaced[6].open_now | (absent) | 1 |

### collector GET /api/collector/insights?part=bogus

Session reads2, id e68c97b03cf9aeda, 184966 bytes to 185419 bytes.

| Path | A | B |
|---|---|---|
| $.book.departments[1].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[4].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[5].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[7].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[11].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[12].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.gaps[0].open_now | (absent) | 1 |
| $.gaps[1].open_now | (absent) | 1 |
| $.gaps[2].open_now | (absent) | 1 |
| $.gaps[3].open_now | (absent) | 1 |
| $.gaps[4].open_now | (absent) | 1 |
| $.gaps[5].open_now | (absent) | 1 |
| $.gaps[6].open_now | (absent) | 1 |
| $.gaps[7].open_now | (absent) | 1 |
| $.gaps[8].open_now | (absent) | 1 |
| $.gaps[9].open_now | (absent) | 1 |
| $.review.unplaced[0].open_now | (absent) | 1 |
| $.review.unplaced[1].open_now | (absent) | 1 |
| $.review.unplaced[2].open_now | (absent) | 1 |
| $.review.unplaced[3].open_now | (absent) | 1 |
| $.review.unplaced[4].open_now | (absent) | 1 |
| $.review.unplaced[5].open_now | (absent) | 1 |
| $.review.unplaced[6].open_now | (absent) | 1 |

### collector GET /api/collector/insights?period=daily

Session reads2, id 3918cee750c27772, 184966 bytes to 185419 bytes.

| Path | A | B |
|---|---|---|
| $.book.departments[1].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[4].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[5].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[7].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[11].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.departments[12].ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.gaps[0].open_now | (absent) | 1 |
| $.gaps[1].open_now | (absent) | 1 |
| $.gaps[2].open_now | (absent) | 1 |
| $.gaps[3].open_now | (absent) | 1 |
| $.gaps[4].open_now | (absent) | 1 |
| $.gaps[5].open_now | (absent) | 1 |
| $.gaps[6].open_now | (absent) | 1 |
| $.gaps[7].open_now | (absent) | 1 |
| $.gaps[8].open_now | (absent) | 1 |
| $.gaps[9].open_now | (absent) | 1 |
| $.review.unplaced[0].open_now | (absent) | 1 |
| $.review.unplaced[1].open_now | (absent) | 1 |
| $.review.unplaced[2].open_now | (absent) | 1 |
| $.review.unplaced[3].open_now | (absent) | 1 |
| $.review.unplaced[4].open_now | (absent) | 1 |
| $.review.unplaced[5].open_now | (absent) | 1 |
| $.review.unplaced[6].open_now | (absent) | 1 |

### collector GET /api/collector/insights?period=weekly

Session reads2, id 796e17e17fc905da, 297136 bytes to 295835 bytes.

| Path | A | B |
|---|---|---|
| $.book.glance.opening | {object with 2 keys} | null |
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.briefing.opening | {object with 2 keys} | null |
| $.deptActions[1].awaiting | 2 | 0 |
| $.deptActions[2].awaiting | 9 | 0 |
| $.deptActions[3].awaiting | 11 | 0 |
| $.deptActions[6].awaiting | 14 | 0 |
| $.deptActions[9].awaiting | 15 | 0 |
| $.deptActions[10].awaiting | 2 | 0 |
| $.deptActions[11].awaiting | 1 | 0 |
| $.deptActions[14].awaiting | 2 | 0 |
| $.gaps[0].open_now | (absent) | 1 |
| $.gaps[1].open_now | (absent) | 1 |
| $.gaps[2].open_now | (absent) | 1 |
| $.gaps[3].open_now | (absent) | 1 |
| $.gaps[4].open_now | (absent) | 1 |
| $.gaps[5].open_now | (absent) | 1 |
| $.gaps[6].open_now | (absent) | 1 |
| $.gaps[7].open_now | (absent) | 1 |
| $.gaps[8].open_now | (absent) | 1 |
| $.gaps[9].open_now | (absent) | 1 |
| $.gaps[10].open_now | (absent) | 1 |
| $.gaps[11].open_now | (absent) | 1 |
| $.gaps[12].open_now | (absent) | 1 |

...and 67 more paths (see the JSON file).

### collector GET /api/collector/insights?period=monthly

Session reads2, id 7a95ffe2d0b9c260, 312794 bytes to 313900 bytes.

| Path | A | B |
|---|---|---|
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.deptActions[1].awaiting | 5 | 0 |
| $.deptActions[2].awaiting | 18 | 0 |
| $.deptActions[3].awaiting | 12 | 0 |
| $.deptActions[6].awaiting | 22 | 0 |
| $.deptActions[9].awaiting | 17 | 0 |
| $.deptActions[10].awaiting | 13 | 0 |
| $.deptActions[11].awaiting | 3 | 0 |
| $.deptActions[12].awaiting | 3 | 0 |
| $.deptActions[15].awaiting | 1 | 0 |
| $.deptActions[16].awaiting | 1 | 0 |
| $.deptActions[17].awaiting | 3 | 0 |
| $.deptActions[18].awaiting | 1 | 0 |
| $.deptActions[19].awaiting | 1 | 0 |
| $.deptActions[20].awaiting | 1 | 0 |
| $.gaps[0].open_now | (absent) | 1 |
| $.gaps[1].open_now | (absent) | 1 |
| $.gaps[2].open_now | (absent) | 1 |
| $.gaps[3].open_now | (absent) | 1 |
| $.gaps[4].open_now | (absent) | 1 |
| $.gaps[5].open_now | (absent) | 1 |
| $.gaps[6].open_now | (absent) | 1 |
| $.gaps[7].open_now | (absent) | 1 |
| $.gaps[8].open_now | (absent) | 1 |

...and 72 more paths (see the JSON file).

### collector GET /api/collector/insights?period=quarterly

Session reads2, id 9cd1b8b8c44eea28, 313399 bytes to 314505 bytes.

| Path | A | B |
|---|---|---|
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.deptActions[1].awaiting | 9 | 0 |
| $.deptActions[2].awaiting | 19 | 0 |
| $.deptActions[3].awaiting | 12 | 0 |
| $.deptActions[6].awaiting | 22 | 0 |
| $.deptActions[9].awaiting | 18 | 0 |
| $.deptActions[10].awaiting | 15 | 0 |
| $.deptActions[11].awaiting | 4 | 0 |
| $.deptActions[12].awaiting | 3 | 0 |
| $.deptActions[15].awaiting | 3 | 0 |
| $.deptActions[16].awaiting | 1 | 0 |
| $.deptActions[17].awaiting | 1 | 0 |
| $.deptActions[18].awaiting | 1 | 0 |
| $.deptActions[19].awaiting | 1 | 0 |
| $.deptActions[20].awaiting | 1 | 0 |
| $.gaps[0].open_now | (absent) | 1 |
| $.gaps[1].open_now | (absent) | 1 |
| $.gaps[2].open_now | (absent) | 1 |
| $.gaps[3].open_now | (absent) | 1 |
| $.gaps[4].open_now | (absent) | 1 |
| $.gaps[5].open_now | (absent) | 1 |
| $.gaps[6].open_now | (absent) | 1 |
| $.gaps[7].open_now | (absent) | 1 |
| $.gaps[8].open_now | (absent) | 1 |

...and 72 more paths (see the JSON file).

### collector GET /api/collector/insights?taluk=TLK-MYL

Session reads2, id a69318590c466904, 136276 bytes to 136334 bytes.

| Path | A | B |
|---|---|---|
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |

### collector GET /api/collector/insights?taluk=TLK-SHN

Session reads2, id d2b72bc6ef67f566, 133807 bytes to 133878 bytes.

| Path | A | B |
|---|---|---|
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.gaps[0].open_now | (absent) | 1 |

### collector GET /api/collector/insights?zone=5

Session reads2, id 0f3379dd383730a2, 143140 bytes to 143302 bytes.

| Path | A | B |
|---|---|---|
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.gaps[0].open_now | (absent) | 1 |
| $.review.unplaced[0].open_now | (absent) | 1 |
| $.review.unplaced[1].open_now | (absent) | 1 |
| $.review.unplaced[2].open_now | (absent) | 1 |
| $.review.unplaced[3].open_now | (absent) | 1 |
| $.review.unplaced[4].open_now | (absent) | 1 |
| $.review.unplaced[5].open_now | (absent) | 1 |
| $.review.unplaced[6].open_now | (absent) | 1 |

### collector GET /api/collector/insights?zone=13

Session reads2, id c97a3f9d553bab49, 135906 bytes to 136055 bytes.

| Path | A | B |
|---|---|---|
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.review.unplaced[0].open_now | (absent) | 1 |
| $.review.unplaced[1].open_now | (absent) | 1 |
| $.review.unplaced[2].open_now | (absent) | 1 |
| $.review.unplaced[3].open_now | (absent) | 1 |
| $.review.unplaced[4].open_now | (absent) | 1 |
| $.review.unplaced[5].open_now | (absent) | 1 |
| $.review.unplaced[6].open_now | (absent) | 1 |

### collector GET /api/collector/insights?zone=1

Session reads2, id f8b54a16fd2ba1e7, 126019 bytes to 126168 bytes.

| Path | A | B |
|---|---|---|
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.review.unplaced[0].open_now | (absent) | 1 |
| $.review.unplaced[1].open_now | (absent) | 1 |
| $.review.unplaced[2].open_now | (absent) | 1 |
| $.review.unplaced[3].open_now | (absent) | 1 |
| $.review.unplaced[4].open_now | (absent) | 1 |
| $.review.unplaced[5].open_now | (absent) | 1 |
| $.review.unplaced[6].open_now | (absent) | 1 |

### collector GET /api/collector/insights?period=weekly&zone=5

Session reads2, id 94a217266ba2fa0b, 171685 bytes to 171925 bytes.

| Path | A | B |
|---|---|---|
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.deptActions[2].awaiting | 1 | 0 |
| $.deptActions[4].awaiting | 1 | 0 |
| $.deptActions[6].awaiting | 2 | 0 |
| $.gaps[0].open_now | (absent) | 1 |
| $.gaps[1].open_now | (absent) | 1 |
| $.gaps[2].open_now | (absent) | 1 |
| $.gaps[3].open_now | (absent) | 1 |
| $.gaps[4].open_now | (absent) | 1 |
| $.gaps[5].open_now | (absent) | 1 |
| $.gaps[6].open_now | (absent) | 1 |
| $.review.unplaced[0].open_now | (absent) | 1 |
| $.review.unplaced[1].open_now | (absent) | 1 |
| $.review.unplaced[2].open_now | (absent) | 1 |
| $.review.unplaced[3].open_now | (absent) | 1 |
| $.review.unplaced[4].open_now | (absent) | 1 |
| $.review.unplaced[5].open_now | (absent) | 1 |
| $.review.unplaced[6].open_now | (absent) | 1 |

### collector GET /api/collector/insights?period=monthly&zone=13

Session reads2, id 429ce1a0f9c185fe, 164489 bytes to 164638 bytes.

| Path | A | B |
|---|---|---|
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.deptActions[2].awaiting | 2 | 0 |
| $.deptActions[3].awaiting | 1 | 0 |
| $.deptActions[4].awaiting | 5 | 0 |
| $.deptActions[6].awaiting | 1 | 0 |
| $.deptActions[7].awaiting | 2 | 0 |
| $.deptActions[10].awaiting | 1 | 0 |
| $.deptActions[12].awaiting | 1 | 0 |
| $.review.unplaced[0].open_now | (absent) | 1 |
| $.review.unplaced[1].open_now | (absent) | 1 |
| $.review.unplaced[2].open_now | (absent) | 1 |
| $.review.unplaced[3].open_now | (absent) | 1 |
| $.review.unplaced[4].open_now | (absent) | 1 |
| $.review.unplaced[5].open_now | (absent) | 1 |
| $.review.unplaced[6].open_now | (absent) | 1 |

### collector GET /api/collector/insights?period=quarterly&zone=1

Session reads2, id ef53ddd2fe4a4b2f, 169939 bytes to 170101 bytes.

| Path | A | B |
|---|---|---|
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.deptActions[5].awaiting | 1 | 0 |
| $.deptActions[7].awaiting | 1 | 0 |
| $.deptActions[11].awaiting | 1 | 0 |
| $.gaps[0].open_now | (absent) | 1 |
| $.review.unplaced[0].open_now | (absent) | 1 |
| $.review.unplaced[1].open_now | (absent) | 1 |
| $.review.unplaced[2].open_now | (absent) | 1 |
| $.review.unplaced[3].open_now | (absent) | 1 |
| $.review.unplaced[4].open_now | (absent) | 1 |
| $.review.unplaced[5].open_now | (absent) | 1 |
| $.review.unplaced[6].open_now | (absent) | 1 |

### collector GET /api/collector/insights?period=weekly&dept=GCC-SWM

Session reads2, id e0187821d5d38a13, 117794 bytes to 117877 bytes.

| Path | A | B |
|---|---|---|
| $.book.health.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.book.law.ai.asOf | (absent) | 2026-11-06 18:08:00 |
| $.deptActions[0].awaiting | 15 | 0 |
| $.gaps[0].open_now | (absent) | 1 |
| $.gaps[1].open_now | (absent) | 1 |

### collector GET /api/collector/report

Session reads2, id 095b16e7efdf775f, 262289 bytes to 265101 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 1] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 0] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.stories.threads[3].records | (absent) | [array of 0] |
| $.stories.threads[3].placed | (absent) | {object with 2 keys} |
| $.stories.threads[4].records | (absent) | [array of 2] |
| $.stories.threads[4].placed | (absent) | {object with 2 keys} |
| $.stories.threads[5].records | (absent) | [array of 0] |
| $.stories.threads[5].placed | (absent) | {object with 2 keys} |
| $.stories.threads[6].records | (absent) | [array of 1] |
| $.stories.threads[6].placed | (absent) | {object with 2 keys} |
| $.stories.threads[7].records | (absent) | [array of 0] |
| $.stories.threads[7].placed | (absent) | {object with 2 keys} |
| $.stories.threads[8].records | (absent) | [array of 0] |
| $.stories.threads[8].placed | (absent) | {object with 2 keys} |
| $.stories.threads[9].records | (absent) | [array of 1] |
| $.stories.threads[9].placed | (absent) | {object with 2 keys} |
| $.stories.threads[10].records | (absent) | [array of 0] |
| $.stories.threads[10].placed | (absent) | {object with 2 keys} |
| $.stories.threads[11].records | (absent) | [array of 1] |

...and 52 more paths (see the JSON file).

### collector GET /api/collector/report?cat=SOLID_WASTE

Session reads2, id 7847baa6b52a9469, 65588 bytes to 56928 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.bell.length | 6 | 0 |
| $.bell[0] | {object with 40 keys} | (absent) |
| $.bell[1] | {object with 40 keys} | (absent) |
| $.bell[2] | {object with 40 keys} | (absent) |
| $.bell[3] | {object with 40 keys} | (absent) |
| $.bell[4] | {object with 40 keys} | (absent) |
| $.bell[5] | {object with 40 keys} | (absent) |
| $.periodInfo.resolved | (absent) | Resolved, last 24 hours |

### collector GET /api/collector/report?cat=DARK_SPOT_SAFETY

Session reads2, id 8843cab6fdba8ab6, 29999 bytes to 21338 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.bell.length | 6 | 0 |
| $.bell[0] | {object with 40 keys} | (absent) |
| $.bell[1] | {object with 40 keys} | (absent) |
| $.bell[2] | {object with 40 keys} | (absent) |
| $.bell[3] | {object with 40 keys} | (absent) |
| $.bell[4] | {object with 40 keys} | (absent) |
| $.bell[5] | {object with 40 keys} | (absent) |
| $.periodInfo.resolved | (absent) | Resolved, last 24 hours |

### collector GET /api/collector/report?dept=GCC-SWM

Session reads2, id c64879bd7d0d5da1, 55297 bytes to 55395 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.periodInfo.resolved | (absent) | Resolved, last 24 hours |

### collector GET /api/collector/report?dept=GCC-ELE

Session reads2, id d9bddd1be4ba72de, 72224 bytes to 72322 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.periodInfo.resolved | (absent) | Resolved, last 24 hours |

### collector GET /api/collector/report?period=daily

Session reads2, id 2546b13c9615b885, 262289 bytes to 265101 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 1] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 0] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.stories.threads[3].records | (absent) | [array of 0] |
| $.stories.threads[3].placed | (absent) | {object with 2 keys} |
| $.stories.threads[4].records | (absent) | [array of 2] |
| $.stories.threads[4].placed | (absent) | {object with 2 keys} |
| $.stories.threads[5].records | (absent) | [array of 0] |
| $.stories.threads[5].placed | (absent) | {object with 2 keys} |
| $.stories.threads[6].records | (absent) | [array of 1] |
| $.stories.threads[6].placed | (absent) | {object with 2 keys} |
| $.stories.threads[7].records | (absent) | [array of 0] |
| $.stories.threads[7].placed | (absent) | {object with 2 keys} |
| $.stories.threads[8].records | (absent) | [array of 0] |
| $.stories.threads[8].placed | (absent) | {object with 2 keys} |
| $.stories.threads[9].records | (absent) | [array of 1] |
| $.stories.threads[9].placed | (absent) | {object with 2 keys} |
| $.stories.threads[10].records | (absent) | [array of 0] |
| $.stories.threads[10].placed | (absent) | {object with 2 keys} |
| $.stories.threads[11].records | (absent) | [array of 1] |

...and 52 more paths (see the JSON file).

### collector GET /api/collector/report?period=weekly

Session reads2, id 3216cc33d4b7fe6e, 443781 bytes to 447046 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 1] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 0] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.stories.threads[3].records | (absent) | [array of 0] |
| $.stories.threads[3].placed | (absent) | {object with 2 keys} |
| $.stories.threads[4].records | (absent) | [array of 2] |
| $.stories.threads[4].placed | (absent) | {object with 2 keys} |
| $.stories.threads[5].records | (absent) | [array of 0] |
| $.stories.threads[5].placed | (absent) | {object with 2 keys} |
| $.stories.threads[6].records | (absent) | [array of 1] |
| $.stories.threads[6].placed | (absent) | {object with 2 keys} |
| $.stories.threads[7].records | (absent) | [array of 0] |
| $.stories.threads[7].placed | (absent) | {object with 2 keys} |
| $.stories.threads[8].records | (absent) | [array of 0] |
| $.stories.threads[8].placed | (absent) | {object with 2 keys} |
| $.stories.threads[9].records | (absent) | [array of 1] |
| $.stories.threads[9].placed | (absent) | {object with 2 keys} |
| $.stories.threads[10].records | (absent) | [array of 0] |
| $.stories.threads[10].placed | (absent) | {object with 2 keys} |
| $.stories.threads[11].records | (absent) | [array of 1] |

...and 66 more paths (see the JSON file).

### collector GET /api/collector/report?period=monthly

Session reads2, id fda381e1a888253e, 588453 bytes to 591911 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 1] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 0] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.stories.threads[3].records | (absent) | [array of 2] |
| $.stories.threads[3].placed | (absent) | {object with 2 keys} |
| $.stories.threads[4].records | (absent) | [array of 0] |
| $.stories.threads[4].placed | (absent) | {object with 2 keys} |
| $.stories.threads[5].records | (absent) | [array of 1] |
| $.stories.threads[5].placed | (absent) | {object with 2 keys} |
| $.stories.threads[6].records | (absent) | [array of 0] |
| $.stories.threads[6].placed | (absent) | {object with 2 keys} |
| $.stories.threads[7].records | (absent) | [array of 0] |
| $.stories.threads[7].placed | (absent) | {object with 2 keys} |
| $.stories.threads[8].records | (absent) | [array of 1] |
| $.stories.threads[8].placed | (absent) | {object with 2 keys} |
| $.stories.threads[9].records | (absent) | [array of 0] |
| $.stories.threads[9].placed | (absent) | {object with 2 keys} |
| $.stories.threads[10].records | (absent) | [array of 1] |
| $.stories.threads[10].placed | (absent) | {object with 2 keys} |
| $.stories.threads[11].records | (absent) | [array of 0] |

...and 72 more paths (see the JSON file).

### collector GET /api/collector/report?period=quarterly

Session reads2, id 299c47228fd7dd1a, 626607 bytes to 630065 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 1] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 0] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.stories.threads[3].records | (absent) | [array of 2] |
| $.stories.threads[3].placed | (absent) | {object with 2 keys} |
| $.stories.threads[4].records | (absent) | [array of 0] |
| $.stories.threads[4].placed | (absent) | {object with 2 keys} |
| $.stories.threads[5].records | (absent) | [array of 1] |
| $.stories.threads[5].placed | (absent) | {object with 2 keys} |
| $.stories.threads[6].records | (absent) | [array of 0] |
| $.stories.threads[6].placed | (absent) | {object with 2 keys} |
| $.stories.threads[7].records | (absent) | [array of 0] |
| $.stories.threads[7].placed | (absent) | {object with 2 keys} |
| $.stories.threads[8].records | (absent) | [array of 1] |
| $.stories.threads[8].placed | (absent) | {object with 2 keys} |
| $.stories.threads[9].records | (absent) | [array of 0] |
| $.stories.threads[9].placed | (absent) | {object with 2 keys} |
| $.stories.threads[10].records | (absent) | [array of 1] |
| $.stories.threads[10].placed | (absent) | {object with 2 keys} |
| $.stories.threads[11].records | (absent) | [array of 0] |

...and 72 more paths (see the JSON file).

### collector GET /api/collector/report?taluk=TLK-MYL

Session reads2, id 2af87a096780b60d, 86578 bytes to 86013 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.bell[1].id | INC-20261105-6B3555 | INC-20260515-ACC375 |
| $.bell[1].title | Cooum River - Chetpet stretch spilling over bank at Chetpet (MGR St) | Field staff report water stagnation on Easwar Nagar 2nd Street, Kodambakkam; pumping needed |
| $.bell[1].dept | PWD-WRD | GCC-SWD |
| $.bell[1].dept_name | PWD Water Resources | Storm Water Drain |
| $.bell[1].zone | 5 | 9 |
| $.bell[1].zone_name | Royapuram | Teynampet |
| $.bell[1].ward | 61 | 117 |
| $.bell[1].loc | Chetpet (Cooum River - Chetpet stretch) | Easwar Nagar 2Nd Street, Kodambakkam |
| $.bell[1].lat | 13.077519 | 13.04700595469118 |
| $.bell[1].lon | 80.262494 | 80.24764685563461 |
| $.bell[1].sev | Severe | High |
| $.bell[1].verified | 0 | 1 |
| $.bell[1].complaints | 0 | 3 |
| $.bell[1].sources | pwd | grievance\|pwd |
| $.bell[1].source_count | 1 | 2 |
| $.bell[1].channels | media | citizen_app\|field_staff |
| $.bell[1].t | 2026-11-05 20:48:55 | 2026-11-06 08:41:55 |
| $.bell[1].summary | 1 report (News) about flooding & waterlogging at Chetpet (Cooum River - Chetpet stretch), Ward 61 (Royapuram). First reported 05 Nov 20:48. ... (160 chars) | 4 reports (Grievance portal, PWD field staff) about flooding & waterlogging at Easwar Nagar 2Nd Street, Kodambakkam, Ward 117 (Teynampet). F... (188 chars) |
| $.bell[1].priority | 113 | 93 |
| $.bell[1].breached | 1 | 0 |
| $.bell[1].sla_due | 2026-11-06 02:48:55 | 2026-11-07 08:41:55 |
| $.bell[1].hours_open | 21.3 | 9.4 |
| $.bell[1].severity_reasons | canal overflow (+45); Partial service disruption (+5); Access blocked (+10); About 600 people affected (+15) | High-risk issue: Water entering Home/Shop (+35); Affects bus_stop, children, elderly (+24) |

...and 114 more paths (see the JSON file).

### collector GET /api/collector/report?taluk=TLK-SHN

Session reads2, id 53ac579dbb8ea3e1, 61521 bytes to 59702 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.bell.length | 6 | 5 |
| $.bell[0].id | INC-20260515-B939EB | INC-20261105-6D03C9 |
| $.bell[0].title | Ice House: uprooted tree blocks road | Pls send pumpset to Bajanai Koil St, Pallikaranai |
| $.bell[0].zone | 9 | 15 |
| $.bell[0].zone_name | Teynampet | Sholinganallur |
| $.bell[0].ward | 115 | 197 |
| $.bell[0].loc | Ice House | Pallikaranai (Pallikaranai Marsh Outlet Drain) |
| $.bell[0].lat | 13.05345339618489 | 12.902577 |
| $.bell[0].lon | 80.2708643260533 | 80.224033 |
| $.bell[0].verified | 1 | 0 |
| $.bell[0].complaints | 3 | 0 |
| $.bell[0].sources | grievance\|police\|pwd | pwd |
| $.bell[0].source_count | 3 | 1 |
| $.bell[0].channels | citizen_app\|control_room_112\|field_staff | control_room |
| $.bell[0].t | 2026-11-06 05:59:00 | 2026-11-05 21:13:47 |
| $.bell[0].summary | 7 reports (Grievance portal, PWD field staff, Police 112) about flooding & waterlogging at Ice House, Ward 115 (Teynampet). First reported 0... (173 chars) | 1 report (PWD control room) about flooding & waterlogging at Pallikaranai (Pallikaranai Marsh Outlet Drain), Ward 197 (Sholinganallur). Firs... (185 chars) |
| $.bell[0].priority | 136.9 | 116 |
| $.bell[0].sla_due | 2026-11-06 11:59:00 | 2026-11-06 03:13:47 |
| $.bell[0].hours_open | 12.2 | 20.9 |
| $.bell[0].severity_reasons | canal overflow (+45); Full service disruption (+15); Access blocked (+10); About 339 people affected (+10) | waterlogging (+35); Partial service disruption (+5); Access blocked (+10); About 750 people affected (+15); Affects worship (+8) |
| $.bell[0].priority_reasons | Severe flooding & waterlogging (80); reported by 3 sources; 3 citizen complaints; resolution over twice the 6 h target; 7 new reports in 24 ... (248 chars) | Severe flooding & waterlogging (73); resolution over twice the 6 h target; not yet verified by an officer; affects worship; linked to a rain... (184 chars) |

...and 117 more paths (see the JSON file).

### collector GET /api/collector/report?zone=5

Session reads2, id de0c525ec1bc592a, 84965 bytes to 83101 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.bell.length | 6 | 5 |
| $.bell[0].id | INC-20260515-B939EB | INC-20261105-6B3555 |
| $.bell[0].title | Ice House: uprooted tree blocks road | Cooum River - Chetpet stretch spilling over bank at Chetpet (MGR St) |
| $.bell[0].zone | 9 | 5 |
| $.bell[0].zone_name | Teynampet | Royapuram |
| $.bell[0].ward | 115 | 61 |
| $.bell[0].loc | Ice House | Chetpet (Cooum River - Chetpet stretch) |
| $.bell[0].lat | 13.05345339618489 | 13.077519 |
| $.bell[0].lon | 80.2708643260533 | 80.262494 |
| $.bell[0].verified | 1 | 0 |
| $.bell[0].complaints | 3 | 0 |
| $.bell[0].sources | grievance\|police\|pwd | pwd |
| $.bell[0].source_count | 3 | 1 |
| $.bell[0].channels | citizen_app\|control_room_112\|field_staff | media |
| $.bell[0].t | 2026-11-06 05:59:00 | 2026-11-05 20:48:55 |
| $.bell[0].summary | 7 reports (Grievance portal, PWD field staff, Police 112) about flooding & waterlogging at Ice House, Ward 115 (Teynampet). First reported 0... (173 chars) | 1 report (News) about flooding & waterlogging at Chetpet (Cooum River - Chetpet stretch), Ward 61 (Royapuram). First reported 05 Nov 20:48. ... (160 chars) |
| $.bell[0].priority | 136.9 | 113 |
| $.bell[0].sla_due | 2026-11-06 11:59:00 | 2026-11-06 02:48:55 |
| $.bell[0].hours_open | 12.2 | 21.3 |
| $.bell[0].severity_reasons | canal overflow (+45); Full service disruption (+15); Access blocked (+10); About 339 people affected (+10) | canal overflow (+45); Partial service disruption (+5); Access blocked (+10); About 600 people affected (+15) |
| $.bell[0].priority_reasons | Severe flooding & waterlogging (80); reported by 3 sources; 3 citizen complaints; resolution over twice the 6 h target; 7 new reports in 24 ... (248 chars) | Severe flooding & waterlogging (75); resolution over twice the 6 h target; not yet verified by an officer; linked to a rain event; 21 simila... (167 chars) |
| $.bell[0].attention_reason | Well past its deadline, Needs several departments, Spreading: several new reports in 24 h | Severe and not verified, Well past its deadline |
| $.bell[0].officer | Superintending Engineer, WRD Chennai Circle (J. Murugesan) | null |

...and 104 more paths (see the JSON file).

### collector GET /api/collector/report?zone=13

Session reads2, id 14db42c25403c319, 81412 bytes to 76784 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 0] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.bell.length | 6 | 3 |
| $.bell[0].id | INC-20260515-B939EB | INC-20261105-5C94BB |
| $.bell[0].title | Ice House: uprooted tree blocks road | Call recd: canal water flowing into Srinivasa Nagar 6th St, Saidapet from Adyar River |
| $.bell[0].zone | 9 | 13 |
| $.bell[0].zone_name | Teynampet | Adyar |
| $.bell[0].ward | 115 | 170 |
| $.bell[0].loc | Ice House | Saidapet (Adyar River - Saidapet stretch) |
| $.bell[0].lat | 13.05345339618489 | 13.010337 |
| $.bell[0].lon | 80.2708643260533 | 80.206788 |
| $.bell[0].verified | 1 | 0 |
| $.bell[0].complaints | 3 | 0 |
| $.bell[0].sources | grievance\|police\|pwd | pwd |
| $.bell[0].source_count | 3 | 1 |
| $.bell[0].channels | citizen_app\|control_room_112\|field_staff | control_room |
| $.bell[0].t | 2026-11-06 05:59:00 | 2026-11-05 23:41:50 |
| $.bell[0].summary | 7 reports (Grievance portal, PWD field staff, Police 112) about flooding & waterlogging at Ice House, Ward 115 (Teynampet). First reported 0... (173 chars) | 1 report (PWD control room) about flooding & waterlogging at Saidapet (Adyar River - Saidapet stretch), Ward 170 (Adyar). First reported 05 ... (171 chars) |
| $.bell[0].priority | 136.9 | 113 |
| $.bell[0].sla_due | 2026-11-06 11:59:00 | 2026-11-06 05:41:50 |
| $.bell[0].hours_open | 12.2 | 18.4 |
| $.bell[0].severity_reasons | canal overflow (+45); Full service disruption (+15); Access blocked (+10); About 339 people affected (+10) | canal overflow (+45); Full service disruption (+15); About 500 people affected (+15) |
| $.bell[0].priority_reasons | Severe flooding & waterlogging (80); reported by 3 sources; 3 citizen complaints; resolution over twice the 6 h target; 7 new reports in 24 ... (248 chars) | Severe flooding & waterlogging (75); resolution over twice the 6 h target; not yet verified by an officer; linked to a rain event; 15 simila... (167 chars) |

...and 62 more paths (see the JSON file).

### collector GET /api/collector/report?zone=1

Session reads2, id 522492d4d5a05ccb, 40296 bytes to 32791 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.bell.length | 6 | 1 |
| $.bell[0].id | INC-20260515-B939EB | INC-20261106-C854D7 |
| $.bell[0].title | Ice House: uprooted tree blocks road | Fatal crash near Ennore Creek Bridge |
| $.bell[0].type | Flooding & waterlogging | Road accident |
| $.bell[0].cat_code | FLOOD_WATERLOGGING | ROAD_ACCIDENT |
| $.bell[0].family | FLOOD | ROADS_TRAFFIC |
| $.bell[0].dept | PWD-WRD | POL-GCP |
| $.bell[0].dept_name | PWD Water Resources | Greater Chennai Police |
| $.bell[0].zone | 9 | 1 |
| $.bell[0].zone_name | Teynampet | Thiruvottiyur |
| $.bell[0].ward | 115 | 2 |
| $.bell[0].loc | Ice House | Ennore |
| $.bell[0].lat | 13.05345339618489 | 13.215571 |
| $.bell[0].lon | 80.2708643260533 | 80.327012 |
| $.bell[0].complaints | 3 | 0 |
| $.bell[0].sources | grievance\|police\|pwd | police |
| $.bell[0].source_count | 3 | 1 |
| $.bell[0].channels | citizen_app\|control_room_112\|field_staff | citizen_grievance |
| $.bell[0].t | 2026-11-06 05:59:00 | 2026-11-06 04:56:22 |
| $.bell[0].summary | 7 reports (Grievance portal, PWD field staff, Police 112) about flooding & waterlogging at Ice House, Ward 115 (Teynampet). First reported 0... (173 chars) | 1 report (Citizen grievance) about road accident at Ennore, Ward 2 (Thiruvottiyur). First reported 06 Nov 04:56. Status: in progress. |
| $.bell[0].priority | 136.9 | 96 |
| $.bell[0].breached | 1 | 0 |
| $.bell[0].sla_due | 2026-11-06 11:59:00 | 2026-11-06 06:56:22 |

...and 17 more paths (see the JSON file).

### collector GET /api/collector/report?period=weekly&zone=5

Session reads2, id 85c714c0a3849702, 209411 bytes to 207940 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 1] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 1] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.stories.threads[3].records | (absent) | [array of 0] |
| $.stories.threads[3].placed | (absent) | {object with 2 keys} |
| $.stories.threads[4].records | (absent) | [array of 0] |
| $.stories.threads[4].placed | (absent) | {object with 2 keys} |
| $.stories.threads[5].records | (absent) | [array of 0] |
| $.stories.threads[5].placed | (absent) | {object with 2 keys} |
| $.bell[0].id | INC-20260516-4D00AC | INC-20261022-73B9C3 |
| $.bell[0].title | Floodwater traps residents near Temple St | Seven Wells: inundation strands residents |
| $.bell[0].zone | 8 | 5 |
| $.bell[0].zone_name | Anna Nagar | Royapuram |
| $.bell[0].ward | 104 | 56 |
| $.bell[0].loc | Kilpauk | Seven Wells |
| $.bell[0].lat | 13.07901216088879 | 13.09691483485246 |
| $.bell[0].lon | 80.25235564528812 | 80.28547780805405 |
| $.bell[0].complaints | 5 | 1 |
| $.bell[0].channels | citizen_app\|control_room_112\|field_staff | citizen_app\|control_room\|control_room_112\|field_staff |
| $.bell[0].t | 2026-11-03 09:26:14 | 2026-11-02 20:06:53 |

...and 175 more paths (see the JSON file).

### collector GET /api/collector/report?period=monthly&zone=13

Session reads2, id e56633d976349cd6, 253953 bytes to 254333 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 0] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 0] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 0] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.stories.threads[3].records | (absent) | [array of 1] |
| $.stories.threads[3].placed | (absent) | {object with 2 keys} |
| $.stories.threads[4].records | (absent) | [array of 0] |
| $.stories.threads[4].placed | (absent) | {object with 2 keys} |
| $.stories.threads[5].records | (absent) | [array of 1] |
| $.stories.threads[5].placed | (absent) | {object with 2 keys} |
| $.stories.threads[6].records | (absent) | [array of 1] |
| $.stories.threads[6].placed | (absent) | {object with 2 keys} |
| $.stories.threads[7].records | (absent) | [array of 1] |
| $.stories.threads[7].placed | (absent) | {object with 2 keys} |
| $.stories.threads[8].records | (absent) | [array of 0] |
| $.stories.threads[8].placed | (absent) | {object with 2 keys} |
| $.stories.threads[9].records | (absent) | [array of 0] |
| $.stories.threads[9].placed | (absent) | {object with 2 keys} |
| $.stories.threads[10].records | (absent) | [array of 0] |
| $.stories.threads[10].placed | (absent) | {object with 2 keys} |
| $.stories.threads[11].records | (absent) | [array of 1] |

...and 226 more paths (see the JSON file).

### collector GET /api/collector/report?period=quarterly&zone=1

Session reads2, id 9c6d19d842191ae4, 234209 bytes to 234821 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 1] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 0] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 0] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.stories.threads[3].records | (absent) | [array of 1] |
| $.stories.threads[3].placed | (absent) | {object with 2 keys} |
| $.stories.threads[4].records | (absent) | [array of 1] |
| $.stories.threads[4].placed | (absent) | {object with 2 keys} |
| $.stories.threads[5].records | (absent) | [array of 0] |
| $.stories.threads[5].placed | (absent) | {object with 2 keys} |
| $.stories.threads[6].records | (absent) | [array of 1] |
| $.stories.threads[6].placed | (absent) | {object with 2 keys} |
| $.stories.threads[7].records | (absent) | [array of 1] |
| $.stories.threads[7].placed | (absent) | {object with 2 keys} |
| $.stories.threads[8].records | (absent) | [array of 1] |
| $.stories.threads[8].placed | (absent) | {object with 2 keys} |
| $.bell[0].id | INC-20260516-4D00AC | INC-20261025-09E045 |
| $.bell[0].title | Floodwater traps residents near Temple St | Floodwater traps residents near Periya Mettu Palayam 1st Road |
| $.bell[0].zone | 8 | 1 |
| $.bell[0].zone_name | Anna Nagar | Thiruvottiyur |
| $.bell[0].ward | 104 | 10 |

...and 173 more paths (see the JSON file).

### collector GET /api/collector/report?period=weekly&dept=GCC-SWM

Session reads2, id c075757d7bf2eabb, 129781 bytes to 130232 bytes.

| Path | A | B |
|---|---|---|
| $.map.drawn | (absent) | {object with 3 keys} |
| $.map.pinLimit | (absent) | 150 |
| $.stories.threads[0].records | (absent) | [array of 0] |
| $.stories.threads[0].placed | (absent) | {object with 2 keys} |
| $.stories.threads[1].records | (absent) | [array of 1] |
| $.stories.threads[1].placed | (absent) | {object with 2 keys} |
| $.stories.threads[2].records | (absent) | [array of 1] |
| $.stories.threads[2].placed | (absent) | {object with 2 keys} |
| $.deptNav[1].unverified | 9 | 0 |
| $.deptNav[2].unverified | 2 | 0 |
| $.deptNav[3].unverified | 2 | 0 |
| $.deptNav[4].unverified | 11 | 0 |
| $.deptNav[5].unverified | 14 | 0 |
| $.deptNav[6].unverified | 15 | 0 |
| $.deptNav[9].unverified | 1 | 0 |
| $.deptNav[10].unverified | 2 | 0 |
| $.periodInfo.resolved | (absent) | Resolved, last 7 days |

### collector POST /api/map/ask

Session ask, id bc19a69485d976bf, 24167 bytes to 20811 bytes.

| Path | A | B |
|---|---|---|
| $.plan.steps[0].filter.period.kind | last_days | day |
| $.plan.steps[0].filter.period.days | 1 | (absent) |
| $.chips[2].en | Last 24 hours | Today, since midnight |
| $.chips[2].ta | கடந்த 24 மணி நேரம் | இன்று, நள்ளிரவு முதல் |
| $.chips[2].options[0].on | true | false |
| $.answer.count | 13 | 11 |
| $.answer.headline | 13 open complaints in Adyar (Zone 13) (last 24 hours) · map layer ready. | 11 open complaints in Adyar (Zone 13) (today, since midnight) · map layer ready. |
| $.answer.depts[2].code | GCC-HLT | GCC-ENG |
| $.answer.depts[2].name | Public Health (GCC) | Roads & Building Permissions |
| $.answer.depts[2].n | 3 | 1 |
| $.answer.depts[3].code | GCC-ENG | GCC-HLT |
| $.answer.depts[3].name | Roads & Building Permissions | Public Health (GCC) |
| $.answer.facts[0].value | 13 | 11 |
| $.trace[0].count | 143 | 93 |
| $.trace[0].note_en | Took open citizen complaints, last 24 hours (143). | Took open citizen complaints, today, since midnight (93). |
| $.trace[0].note_ta | திறந்த குடிமக்கள் புகார்கள், கடந்த 24 மணி நேரம் எடுக்கப்பட்டன (143). | திறந்த குடிமக்கள் புகார்கள், இன்று, நள்ளிரவு முதல் எடுக்கப்பட்டன (93). |
| $.trace[0].ids.length | 143 | 93 |
| $.trace[0].ids[4] | INC-20261105-45E2DD | INC-20261106-8D7031 |
| $.trace[0].ids[5] | INC-20261106-8D7031 | INC-20261106-EB2509 |
| $.trace[0].ids[6] | INC-20261105-4B16C2 | INC-20261106-FE8066 |
| $.trace[0].ids[7] | INC-20261106-EB2509 | INC-20261106-AD9834 |
| $.trace[0].ids[8] | INC-20261106-FE8066 | INC-20261106-F1B5D5 |
| $.trace[0].ids[9] | INC-20261105-6C5FD7 | INC-20261106-FD167D |
| $.trace[0].ids[10] | INC-20261106-AD9834 | INC-20261106-7CC00D |
| $.trace[0].ids[11] | INC-20261106-F1B5D5 | INC-20261106-9CA57F |

...and 376 more paths (see the JSON file).

### collector POST /api/map/ask

Session ask, id 39b775090318e8e0, 219861 bytes to 219847 bytes.

| Path | A | B |
|---|---|---|
| $.trace[1].note_en | Not used from your question: deaths, hours. The map answered the rest; rephrase to include them. | Not used from your question: deaths. The map answered the rest; rephrase to include them. |
| $.trace[1].note_ta | கேள்வியில் பயன்படுத்தப்படாதவை: deaths, hours. மீதியைக் கொண்டு பதில் தரப்பட்டது. | கேள்வியில் பயன்படுத்தப்படாதவை: deaths. மீதியைக் கொண்டு பதில் தரப்பட்டது. |

### collector POST /api/map/ask

Session ask, id 1e635e562e92da34, 24840 bytes to 21413 bytes.

| Path | A | B |
|---|---|---|
| $.plan.steps[0].filter.period.kind | last_days | day |
| $.plan.steps[0].filter.period.days | 1 | (absent) |
| $.chips[2].en | Last 24 hours | Today, since midnight |
| $.chips[2].ta | கடந்த 24 மணி நேரம் | இன்று, நள்ளிரவு முதல் |
| $.chips[2].options[0].on | true | false |
| $.answer.count | 13 | 11 |
| $.answer.headline | Adyar (மண்டலம் 13) 13 திறந்த புகார்கள் (கடந்த 24 மணி நேரம்) · வரைபட அடுக்கு தயார். | Adyar (மண்டலம் 13) 11 திறந்த புகார்கள் (இன்று, நள்ளிரவு முதல்) · வரைபட அடுக்கு தயார். |
| $.answer.depts[2].code | GCC-HLT | GCC-ENG |
| $.answer.depts[2].name | Public Health (GCC) | Roads & Building Permissions |
| $.answer.depts[2].n | 3 | 1 |
| $.answer.depts[3].code | GCC-ENG | GCC-HLT |
| $.answer.depts[3].name | Roads & Building Permissions | Public Health (GCC) |
| $.answer.facts[0].value | 13 | 11 |
| $.trace[0].count | 143 | 93 |
| $.trace[0].note_en | Took open citizen complaints, last 24 hours (143). | Took open citizen complaints, today, since midnight (93). |
| $.trace[0].note_ta | திறந்த குடிமக்கள் புகார்கள், கடந்த 24 மணி நேரம் எடுக்கப்பட்டன (143). | திறந்த குடிமக்கள் புகார்கள், இன்று, நள்ளிரவு முதல் எடுக்கப்பட்டன (93). |
| $.trace[0].ids.length | 143 | 93 |
| $.trace[0].ids[4] | INC-20261105-45E2DD | INC-20261106-8D7031 |
| $.trace[0].ids[5] | INC-20261106-8D7031 | INC-20261106-EB2509 |
| $.trace[0].ids[6] | INC-20261105-4B16C2 | INC-20261106-FE8066 |
| $.trace[0].ids[7] | INC-20261106-EB2509 | INC-20261106-AD9834 |
| $.trace[0].ids[8] | INC-20261106-FE8066 | INC-20261106-F1B5D5 |
| $.trace[0].ids[9] | INC-20261105-6C5FD7 | INC-20261106-FD167D |
| $.trace[0].ids[10] | INC-20261106-AD9834 | INC-20261106-7CC00D |
| $.trace[0].ids[11] | INC-20261106-F1B5D5 | INC-20261106-9CA57F |

...and 380 more paths (see the JSON file).

### collector POST /api/map/ask

Session ask, id f0398307a4621bf6, 63629 bytes to 63595 bytes.

| Path | A | B |
|---|---|---|
| $.trace[1].note_en | Not used from your question: வாரம், எந்த, மண்டலத்தில், சம்பவங்கள், அதிகம். The map answered the rest; rephrase to include them. | Not used from your question: எந்த, மண்டலத்தில், சம்பவங்கள், அதிகம். The map answered the rest; rephrase to include them. |
| $.trace[1].note_ta | கேள்வியில் பயன்படுத்தப்படாதவை: வாரம், எந்த, மண்டலத்தில், சம்பவங்கள், அதிகம். மீதியைக் கொண்டு பதில் தரப்பட்டது. | கேள்வியில் பயன்படுத்தப்படாதவை: எந்த, மண்டலத்தில், சம்பவங்கள், அதிகம். மீதியைக் கொண்டு பதில் தரப்பட்டது. |

### collector POST /api/map/ask

Session ask, id d2294a1c2f5a1476, 63127 bytes to 63113 bytes.

| Path | A | B |
|---|---|---|
| $.trace[1].note_en | Not used from your question: indha, entha, jaasthi. The map answered the rest; rephrase to include them. | Not used from your question: entha, jaasthi. The map answered the rest; rephrase to include them. |
| $.trace[1].note_ta | கேள்வியில் பயன்படுத்தப்படாதவை: indha, entha, jaasthi. மீதியைக் கொண்டு பதில் தரப்பட்டது. | கேள்வியில் பயன்படுத்தப்படாதவை: entha, jaasthi. மீதியைக் கொண்டு பதில் தரப்பட்டது. |

### collector POST /api/map/ask

Session ask, id 8776cda3e9c5a398, 568173 bytes to 219906 bytes.

| Path | A | B |
|---|---|---|
| $.plan.steps[0].filter.period.days | 7 | 1 |
| $.chips[2].en | Last 7 days | Last 24 hours |
| $.chips[2].ta | கடந்த 7 நாட்கள் | கடந்த 24 மணி நேரம் |
| $.chips[2].isDefault | true | false |
| $.chips[2].options[0].on | false | true |
| $.chips[2].options[1].on | true | false |
| $.answer.count | 1167 | 236 |
| $.answer.headline | 1,167 open incidents irukku (last 7 days) · map layer ready. | 236 open incidents irukku (last 24 hours) · map layer ready. |
| $.answer.meaning | Neraya Royapuram (135), Tondiarpet (110) zone-la; Greater Chennai Police kitta 405. | Neraya Tondiarpet (33), Teynampet (28) zone-la; Greater Chennai Police kitta 61. |
| $.answer.depts.length | 22 | 13 |
| $.answer.depts[0].n | 405 | 61 |
| $.answer.depts[1].n | 174 | 50 |
| $.answer.depts[2].n | 105 | 26 |
| $.answer.depts[3].code | GCC-ENG | GCC-ELE |
| $.answer.depts[3].name | Roads & Building Permissions | Street Lighting & Electrical |
| $.answer.depts[3].n | 100 | 23 |
| $.answer.depts[4].code | GCC-ELE | GCC-ENG |
| $.answer.depts[4].name | Street Lighting & Electrical | Roads & Building Permissions |
| $.answer.depts[4].n | 84 | 18 |
| $.answer.depts[5].code | GCC-HLT | GCC-SWM |
| $.answer.depts[5].name | Public Health (GCC) | Solid Waste Management |
| $.answer.depts[5].n | 80 | 18 |
| $.answer.depts[6].code | GCC-SWM | GCC-HLT |
| $.answer.depts[6].name | Solid Waste Management | Public Health (GCC) |
| $.answer.depts[6].n | 67 | 17 |

...and 10729 more paths (see the JSON file).

### officerA POST /api/map/ask

Session ask, id dece30afa8390c28, 6821 bytes to 6768 bytes.

| Path | A | B |
|---|---|---|
| $.plan.steps[0].filter.period.kind | last_days | day |
| $.plan.steps[0].filter.period.days | 1 | (absent) |
| $.chips[2].en | Last 24 hours | Today, since midnight |
| $.chips[2].ta | கடந்த 24 மணி நேரம் | இன்று, நள்ளிரவு முதல் |
| $.chips[2].options[0].on | true | false |
| $.answer.headline | 1 open complaint in Adyar (Zone 13) (last 24 hours) · map layer ready. | 1 open complaint in Adyar (Zone 13) (today, since midnight) · map layer ready. |
| $.trace[0].count | 18 | 14 |
| $.trace[0].note_en | Took open citizen complaints, Solid Waste Management only, last 24 hours (18). | Took open citizen complaints, Solid Waste Management only, today, since midnight (14). |
| $.trace[0].note_ta | திறந்த குடிமக்கள் புகார்கள், Solid Waste Management மட்டும், கடந்த 24 மணி நேரம் எடுக்கப்பட்டன (18). | திறந்த குடிமக்கள் புகார்கள், Solid Waste Management மட்டும், இன்று, நள்ளிரவு முதல் எடுக்கப்பட்டன (14). |
| $.trace[0].ids.length | 18 | 14 |
| $.trace[0].ids[3] | INC-20261105-063807 | INC-20261106-0B725B |
| $.trace[0].ids[4] | INC-20261106-0B725B | INC-20261106-A1916E |
| $.trace[0].ids[5] | INC-20261106-A1916E | INC-20261106-707839 |
| $.trace[0].ids[6] | INC-20261106-707839 | INC-20261106-8134C4 |
| $.trace[0].ids[7] | INC-20261106-8134C4 | INC-20261106-896A64 |
| $.trace[0].ids[8] | INC-20261106-896A64 | INC-20261106-2BA8BF |
| $.trace[0].ids[9] | INC-20261106-2BA8BF | INC-20261106-7AB184 |
| $.trace[0].ids[10] | INC-20261106-7AB184 | INC-20261106-2AB4CB |
| $.trace[0].ids[11] | INC-20261105-4745E0 | INC-20261106-DF91D4 |
| $.trace[0].ids[12] | INC-20261106-2AB4CB | INC-20261106-2E1851 |
| $.trace[0].ids[13] | INC-20261106-DF91D4 | INC-20261106-0E2C3D |
| $.trace[0].ids[14] | INC-20261105-097D1B | (absent) |
| $.trace[0].ids[15] | INC-20261105-7F006B | (absent) |
| $.trace[0].ids[16] | INC-20261106-2E1851 | (absent) |
| $.trace[0].ids[17] | INC-20261106-0E2C3D | (absent) |

...and 1 more paths (see the JSON file).

### officerA POST /api/map/ask

Session ask, id 227f73adbf9fba80, 6654 bytes to 6653 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 3291 |

### officerA POST /api/map/ask

Session ask, id 7c3a7a1b8dc6c39e, 10973 bytes to 10972 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 3291 |

### officerA POST /api/map/ask

Session ask, id a77299fb6c4f242d, 5900 bytes to 5899 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 3291 |

### officerA POST /api/map/ask

Session ask, id 0dfd5c74f3183670, 7525 bytes to 7524 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 3291 |

### officerA POST /api/map/ask

Session ask, id d3f5114f8844d0b0, 73512 bytes to 73511 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 3291 |

### officerA POST /api/map/ask

Session ask, id 8edbef1a2b75e810, 6942 bytes to 6941 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 3291 |

### officerA POST /api/map/ask

Session ask, id 8d5fa1baf7ab7cca, 24074 bytes to 24059 bytes.

| Path | A | B |
|---|---|---|
| $.trace[1].note_en | Not used from your question: deaths, hours. The map answered the rest; rephrase to include them. | Not used from your question: deaths. The map answered the rest; rephrase to include them. |
| $.trace[1].note_ta | கேள்வியில் பயன்படுத்தப்படாதவை: deaths, hours. மீதியைக் கொண்டு பதில் தரப்பட்டது. | கேள்வியில் பயன்படுத்தப்படாதவை: deaths. மீதியைக் கொண்டு பதில் தரப்பட்டது. |
| $.asOf.layers[0].count | 27923 | 3291 |

### officerA POST /api/map/ask

Session ask, id 654a4bcf9aa38780, 22747 bytes to 22746 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 3291 |

### officerA POST /api/map/ask

Session ask, id 27de3343cb6fa08b, 5048 bytes to 5047 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 3291 |

### officerA POST /api/map/ask

Session ask, id 8bfdbae6993170e8, 71368 bytes to 71367 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 3291 |

### officerA POST /api/map/ask

Session ask, id eb442c0dd81b34ed, 73511 bytes to 73510 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 3291 |

### officerA POST /api/map/ask

Session ask, id 8a74e8781954e541, 7849 bytes to 7848 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 3291 |

### officerA POST /api/map/ask

Session ask, id 1364668cb9393fd1, 482156 bytes to 482155 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 3291 |

### officerA POST /api/map/ask

Session ask, id 697554ff489e03de, 7458 bytes to 7335 bytes.

| Path | A | B |
|---|---|---|
| $.plan.steps[0].filter.period.kind | last_days | day |
| $.plan.steps[0].filter.period.days | 1 | (absent) |
| $.chips[2].en | Last 24 hours | Today, since midnight |
| $.chips[2].ta | கடந்த 24 மணி நேரம் | இன்று, நள்ளிரவு முதல் |
| $.chips[2].options[0].on | true | false |
| $.answer.headline | Adyar (மண்டலம் 13) 1 திறந்த புகார்கள் (கடந்த 24 மணி நேரம்) · வரைபட அடுக்கு தயார். | Adyar (மண்டலம் 13) 1 திறந்த புகார்கள் (இன்று, நள்ளிரவு முதல்) · வரைபட அடுக்கு தயார். |
| $.trace[0].count | 18 | 14 |
| $.trace[0].note_en | Took open citizen complaints, Solid Waste Management only, last 24 hours (18). | Took open citizen complaints, Solid Waste Management only, today, since midnight (14). |
| $.trace[0].note_ta | திறந்த குடிமக்கள் புகார்கள், Solid Waste Management மட்டும், கடந்த 24 மணி நேரம் எடுக்கப்பட்டன (18). | திறந்த குடிமக்கள் புகார்கள், Solid Waste Management மட்டும், இன்று, நள்ளிரவு முதல் எடுக்கப்பட்டன (14). |
| $.trace[0].ids.length | 18 | 14 |
| $.trace[0].ids[3] | INC-20261105-063807 | INC-20261106-0B725B |
| $.trace[0].ids[4] | INC-20261106-0B725B | INC-20261106-A1916E |
| $.trace[0].ids[5] | INC-20261106-A1916E | INC-20261106-707839 |
| $.trace[0].ids[6] | INC-20261106-707839 | INC-20261106-8134C4 |
| $.trace[0].ids[7] | INC-20261106-8134C4 | INC-20261106-896A64 |
| $.trace[0].ids[8] | INC-20261106-896A64 | INC-20261106-2BA8BF |
| $.trace[0].ids[9] | INC-20261106-2BA8BF | INC-20261106-7AB184 |
| $.trace[0].ids[10] | INC-20261106-7AB184 | INC-20261106-2AB4CB |
| $.trace[0].ids[11] | INC-20261105-4745E0 | INC-20261106-DF91D4 |
| $.trace[0].ids[12] | INC-20261106-2AB4CB | INC-20261106-2E1851 |
| $.trace[0].ids[13] | INC-20261106-DF91D4 | INC-20261106-0E2C3D |
| $.trace[0].ids[14] | INC-20261105-097D1B | (absent) |
| $.trace[0].ids[15] | INC-20261105-7F006B | (absent) |
| $.trace[0].ids[16] | INC-20261106-2E1851 | (absent) |
| $.trace[0].ids[17] | INC-20261106-0E2C3D | (absent) |

...and 5 more paths (see the JSON file).

### officerA POST /api/map/ask

Session ask, id cc6505c5c1a07af9, 6975 bytes to 6940 bytes.

| Path | A | B |
|---|---|---|
| $.trace[1].note_en | Not used from your question: வாரம், எந்த, மண்டலத்தில், சம்பவங்கள், அதிகம். The map answered the rest; rephrase to include them. | Not used from your question: எந்த, மண்டலத்தில், சம்பவங்கள், அதிகம். The map answered the rest; rephrase to include them. |
| $.trace[1].note_ta | கேள்வியில் பயன்படுத்தப்படாதவை: வாரம், எந்த, மண்டலத்தில், சம்பவங்கள், அதிகம். மீதியைக் கொண்டு பதில் தரப்பட்டது. | கேள்வியில் பயன்படுத்தப்படாதவை: எந்த, மண்டலத்தில், சம்பவங்கள், அதிகம். மீதியைக் கொண்டு பதில் தரப்பட்டது. |
| $.asOf.layers[0].count | 27923 | 3291 |

### officerA POST /api/map/ask

Session ask, id b7c21800398ce876, 8478 bytes to 8477 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 3291 |

### officerB POST /api/map/ask

Session ask, id 817966050489b283, 9140 bytes to 9139 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 2086 |

### officerB POST /api/map/ask

Session ask, id 04f3e4389f43c0a4, 7152 bytes to 7151 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 2086 |

### officerB POST /api/map/ask

Session ask, id de6b2e0bc1661177, 49032 bytes to 49031 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 2086 |

### officerB POST /api/map/ask

Session ask, id e029d7fd60e29080, 94769 bytes to 94768 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 2086 |

### officerB POST /api/map/ask

Session ask, id 1d365a54ad6a8b45, 20915 bytes to 20914 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 2086 |

### officerB POST /api/map/ask

Session ask, id 0a20ae0a50530c55, 6930 bytes to 6929 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 2086 |

### officerB POST /api/map/ask

Session ask, id 240db9d510877f4f, 94937 bytes to 94936 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 2086 |

### officerB POST /api/map/ask

Session ask, id d5555f8df8a2029e, 9809 bytes to 9808 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 2086 |

### officerB POST /api/map/ask

Session ask, id e7da02bc74406071, 6730 bytes to 6715 bytes.

| Path | A | B |
|---|---|---|
| $.trace[1].note_en | Not used from your question: indha, entha, jaasthi. The map answered the rest; rephrase to include them. | Not used from your question: entha, jaasthi. The map answered the rest; rephrase to include them. |
| $.trace[1].note_ta | கேள்வியில் பயன்படுத்தப்படாதவை: indha, entha, jaasthi. மீதியைக் கொண்டு பதில் தரப்பட்டது. | கேள்வியில் பயன்படுத்தப்படாதவை: entha, jaasthi. மீதியைக் கொண்டு பதில் தரப்பட்டது. |
| $.asOf.layers[0].count | 27923 | 2086 |

### officerB POST /api/map/ask

Session ask, id 214009f03090477d, 6803 bytes to 6802 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 2086 |

### officerB POST /api/map/ask

Session ask, id 01e0dad070526946, 8053 bytes to 8052 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 2086 |

### officerB POST /api/map/ask

Session ask, id b68b7fbd50232aaf, 94463 bytes to 94462 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 2086 |

### officerB POST /api/map/ask

Session ask, id 3a40c4685dc3e541, 48543 bytes to 48542 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 2086 |

### officerB POST /api/map/ask

Session ask, id 6bd576468c267fae, 95808 bytes to 95807 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 2086 |

### officerB POST /api/map/ask

Session ask, id 8073f84112e61801, 95847 bytes to 30966 bytes.

| Path | A | B |
|---|---|---|
| $.plan.steps[0].filter.period.days | 7 | 1 |
| $.chips[2].en | Last 7 days | Last 24 hours |
| $.chips[2].ta | கடந்த 7 நாட்கள் | கடந்த 24 மணி நேரம் |
| $.chips[2].isDefault | true | false |
| $.chips[2].options[0].on | false | true |
| $.chips[2].options[1].on | true | false |
| $.answer.count | 84 | 23 |
| $.answer.headline | 84 open incidents irukku (last 7 days) · map layer ready. | 23 open incidents irukku (last 24 hours) · map layer ready. |
| $.answer.meaning | Neraya Royapuram (14), Tondiarpet (12) zone-la; Ellaam Street Lighting & Electrical kitta. | Neraya Tondiarpet (4), Royapuram (4) zone-la; Ellaam Street Lighting & Electrical kitta. |
| $.answer.depts[0].n | 84 | 23 |
| $.answer.facts[0].value | 84 | 23 |
| $.trace[0].count | 84 | 23 |
| $.trace[0].note_en | Took open incidents, Street Lighting & Electrical only, last 7 days (84). | Took open incidents, Street Lighting & Electrical only, last 24 hours (23). |
| $.trace[0].note_ta | திறந்த சம்பவங்கள், Street Lighting & Electrical மட்டும், கடந்த 7 நாட்கள் எடுக்கப்பட்டன (84). | திறந்த சம்பவங்கள், Street Lighting & Electrical மட்டும், கடந்த 24 மணி நேரம் எடுக்கப்பட்டன (23). |
| $.trace[0].ids.length | 84 | 23 |
| $.trace[0].ids[0] | INC-20261101-3200FD | INC-20261106-DDB161 |
| $.trace[0].ids[1] | INC-20260616-77B20A | INC-20261105-45E2DD |
| $.trace[0].ids[2] | INC-20261104-83D2C2 | INC-20261106-F1B5D5 |
| $.trace[0].ids[3] | INC-20261104-FDA42B | INC-20261106-9CA57F |
| $.trace[0].ids[4] | INC-20260712-9475F7 | INC-20261106-A90262 |
| $.trace[0].ids[5] | INC-20261106-DDB161 | INC-20261105-A114D1 |
| $.trace[0].ids[6] | INC-20261104-DE5CBD | INC-20261106-A67D6A |
| $.trace[0].ids[7] | INC-20261105-D65198 | INC-20261106-F27E38 |
| $.trace[0].ids[8] | INC-20261105-45E2DD | INC-20261106-204F2B |
| $.trace[0].ids[9] | INC-20261103-2EAF09 | INC-20261106-B715B6 |

...and 860 more paths (see the JSON file).

### officerB POST /api/map/ask

Session ask, id eabcf4cee44ad6c5, 23132 bytes to 23131 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 2086 |

### officerB POST /api/map/ask

Session ask, id 4220e2a25948bb47, 7583 bytes to 7582 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 2086 |

### officerB POST /api/map/ask

Session ask, id 97422f0fcd235944, 95835 bytes to 95834 bytes.

| Path | A | B |
|---|---|---|
| $.asOf.layers[0].count | 27923 | 2086 |

### collector POST /api/map/export (plan of sentence 1 with grant)

Session ask, id 42dc9571a98ffbb0, 13197 bytes to 13282 bytes.

| Path | A | B |
|---|---|---|
| $.lines | 60 | 61 |
| $.line[4] | # Plan: {"steps":[{"op":"take","as":"a","layer":"incidents","filter":{"category":null,"family":null,"severity":["Severe"],"status":"open","d... (285 chars) | # Window: last 7 days: reported after 2026-10-30 18:08:00 to 2026-11-06 18:08:00 IST |
| $.line[5] | id,title,category,severity,status,open,ward,zone,department,first_reported,place,nearest,nearest_m,lat,lon,location_known_to_m | # Plan: {"steps":[{"op":"take","as":"a","layer":"incidents","filter":{"category":null,"family":null,"severity":["Severe"],"status":"open","d... (285 chars) |
| $.line[6] | INC-20261105-0476D7,Families stranded by flooding at Kellys,Flooding & waterlogging,Severe,In progress,yes,104,Anna Nagar,PWD Water Resource... (256 chars) | id,title,category,severity,status,open,ward,zone,department,first_reported,place,nearest,nearest_m,lat,lon,location_known_to_m |
| $.line[7] | INC-20260515-B939EB,Ice House: uprooted tree blocks road,Flooding & waterlogging,Severe,In progress,yes,115,Teynampet,PWD Water Resources,20... (207 chars) | INC-20261105-0476D7,Families stranded by flooding at Kellys,Flooding & waterlogging,Severe,In progress,yes,104,Anna Nagar,PWD Water Resource... (256 chars) |
| $.line[8] | INC-20260516-4D00AC,Floodwater traps residents near Temple St,Flooding & waterlogging,Severe,In progress,yes,104,Anna Nagar,PWD Water Resour... (212 chars) | INC-20260515-B939EB,Ice House: uprooted tree blocks road,Flooding & waterlogging,Severe,In progress,yes,115,Teynampet,PWD Water Resources,20... (207 chars) |
| $.line[9] | INC-20261103-53934E-1,Canal overflowing near Gangai Nagar; water entering nearby streets including Poongodiammal Street,Flooding & waterlogg... (273 chars) | INC-20260516-4D00AC,Floodwater traps residents near Temple St,Flooding & waterlogging,Severe,In progress,yes,104,Anna Nagar,PWD Water Resour... (212 chars) |
| $.line[10] | INC-20261105-D0CC25,"Wall along Govt Kilpauk Medical College Hospital gave way near Main Rd, Kilpauk",Unsafe buildings & walls,Severe,In pro... (277 chars) | INC-20261103-53934E-1,Canal overflowing near Gangai Nagar; water entering nearby streets including Poongodiammal Street,Flooding & waterlogg... (273 chars) |
| $.line[11] | INC-20261105-BB4429,"Mogappair: Karpagam Ave fully flooded near OHT water tank, knee-deep",Flooding & waterlogging,Severe,In progress,yes,85... (226 chars) | INC-20261105-D0CC25,"Wall along Govt Kilpauk Medical College Hospital gave way near Main Rd, Kilpauk",Unsafe buildings & walls,Severe,In pro... (277 chars) |
| $.line[12] | INC-20261022-73B9C3,Seven Wells: inundation strands residents,Flooding & waterlogging,Severe,In progress,yes,56,Royapuram,PWD Water Resource... (214 chars) | INC-20261105-BB4429,"Mogappair: Karpagam Ave fully flooded near OHT water tank, knee-deep",Flooding & waterlogging,Severe,In progress,yes,85... (226 chars) |
| $.line[13] | INC-20261104-22A6D5,Patrol team: Overflow from the canal near bus stop - Chetpet residents alarmed,Flooding & waterlogging,Severe,In progres... (231 chars) | INC-20261022-73B9C3,Seven Wells: inundation strands residents,Flooding & waterlogging,Severe,In progress,yes,56,Royapuram,PWD Water Resource... (214 chars) |
| $.line[14] | INC-20261025-09E045,Floodwater traps residents near Periya Mettu Palayam 1st Road,Flooding & waterlogging,Severe,In progress,yes,10,Thiruvot... (237 chars) | INC-20261104-22A6D5,Patrol team: Overflow from the canal near bus stop - Chetpet residents alarmed,Flooding & waterlogging,Severe,In progres... (231 chars) |
| $.line[15] | INC-20261105-6D03C9,"Pls send pumpset to Bajanai Koil St, Pallikaranai",Flooding & waterlogging,Severe,In progress,yes,197,Sholinganallur,PW... (249 chars) | INC-20261025-09E045,Floodwater traps residents near Periya Mettu Palayam 1st Road,Flooding & waterlogging,Severe,In progress,yes,10,Thiruvot... (237 chars) |
| $.line[16] | INC-20260529-9C273D,"Field staff report water stagnation on Jeeva Nagar 17th St, Korukkupet; pumping needed",Flooding & waterlogging,Severe,... (262 chars) | INC-20261105-6D03C9,"Pls send pumpset to Bajanai Koil St, Pallikaranai",Flooding & waterlogging,Severe,In progress,yes,197,Sholinganallur,PW... (249 chars) |
| $.line[17] | INC-20261102-3B27A7,Canal overflowing near Ernavoor; water entering nearby streets including Manali Express Road,Flooding & waterlogging,Sev... (266 chars) | INC-20260529-9C273D,"Field staff report water stagnation on Jeeva Nagar 17th St, Korukkupet; pumping needed",Flooding & waterlogging,Severe,... (262 chars) |
| $.line[18] | INC-20261104-5B3F36,"T. Nagar மார்க்கெட் அருகில் முழங்கால் அளவு தண்ணீர், பள்ளி குழந்தைகள் செல்ல சிரமம்",Flooding & waterlogging,Severe,In pr... (268 chars) | INC-20261102-3B27A7,Canal overflowing near Ernavoor; water entering nearby streets including Manali Express Road,Flooding & waterlogging,Sev... (266 chars) |
| $.line[19] | INC-20261104-3F4AC4-1,"CR: mogappair Eri reached FTL, surplus course opp","Lakes, bunds & sluices",Severe,In progress,yes,85,Ambattur,PWD Wa... (224 chars) | INC-20261104-5B3F36,"T. Nagar மார்க்கெட் அருகில் முழங்கால் அளவு தண்ணீர், பள்ளி குழந்தைகள் செல்ல சிரமம்",Flooding & waterlogging,Severe,In pr... (268 chars) |
| $.line[20] | INC-20261105-5C94BB,"Call recd: canal water flowing into Srinivasa Nagar 6th St, Saidapet from Adyar River",Flooding & waterlogging,Severe,I... (271 chars) | INC-20261104-3F4AC4-1,"CR: mogappair Eri reached FTL, surplus course opp","Lakes, bunds & sluices",Severe,In progress,yes,85,Ambattur,PWD Wa... (224 chars) |
| $.line[21] | INC-20261105-6B3555,Cooum River - Chetpet stretch spilling over bank at Chetpet (MGR St),Flooding & waterlogging,Severe,In progress,yes,61,R... (253 chars) | INC-20261105-5C94BB,"Call recd: canal water flowing into Srinivasa Nagar 6th St, Saidapet from Adyar River",Flooding & waterlogging,Severe,I... (271 chars) |
| $.line[22] | INC-20261105-0E6577,"Cooum River full ah overflow aagudhu, Chetpet School St kulla thanni varudhu",Flooding & waterlogging,Severe,In progres... (263 chars) | INC-20261105-6B3555,Cooum River - Chetpet stretch spilling over bank at Chetpet (MGR St),Flooding & waterlogging,Severe,In progress,yes,61,R... (253 chars) |
| $.line[23] | INC-20261105-E9CD2E,Dengue Surge; Bed Capacity Critical at Rajiv Gandhi Government General Hospital,Vector- & water-borne disease,Severe,Ope... (261 chars) | INC-20261105-0E6577,"Cooum River full ah overflow aagudhu, Chetpet School St kulla thanni varudhu",Flooding & waterlogging,Severe,In progres... (263 chars) |
| $.line[24] | INC-20261022-D1B3AB,Tree falls across road at Royapettah,Flooding & waterlogging,Severe,In progress,yes,115,Teynampet,PWD Water Resources,20... (210 chars) | INC-20261105-E9CD2E,Dengue Surge; Bed Capacity Critical at Rajiv Gandhi Government General Hospital,Vector- & water-borne disease,Severe,Ope... (261 chars) |
| $.line[25] | INC-20261105-3FF6DA,Jafferkhanpet: portion of old structure gives way,Flooding & waterlogging,Severe,In progress,yes,138,Kodambakkam,Greater... (216 chars) | INC-20261022-D1B3AB,Tree falls across road at Royapettah,Flooding & waterlogging,Severe,In progress,yes,115,Teynampet,PWD Water Resources,20... (210 chars) |
| $.line[26] | INC-20261101-811851,Tree crashes near Pantheon Road,Flooding & waterlogging,Severe,In progress,yes,61,Royapuram,Greater Chennai Police,2026-... (186 chars) | INC-20261105-3FF6DA,Jafferkhanpet: portion of old structure gives way,Flooding & waterlogging,Severe,In progress,yes,138,Kodambakkam,Greater... (216 chars) |
| $.line[27] | INC-20261105-61CDCB,chetpt lake full capacity reach aayiduhu chetpet,"Lakes, bunds & sluices",Severe,In progress,yes,58,Royapuram,PWD Water ... (215 chars) | INC-20261101-811851,Tree crashes near Pantheon Road,Flooding & waterlogging,Severe,In progress,yes,61,Royapuram,Greater Chennai Police,2026-... (186 chars) |

...and 34 more paths (see the JSON file).

### collector POST /api/map/export (plan of sentence 1 with grant)

Session ask, id dfc10f23cddc06bb, 26749 bytes to 26835 bytes.

| Path | A | B |
|---|---|---|
| $.properties.window | (absent) | last 7 days: reported after 2026-10-30 18:08:00 to 2026-11-06 18:08:00 IST |

### collector POST /api/map/export (plan of sentence 2 with grant)

Session ask, id 1c8debebc8b14503, 2120 bytes to 2205 bytes.

| Path | A | B |
|---|---|---|
| $.lines | 11 | 12 |
| $.line[4] | # Plan: {"steps":[{"op":"take","as":"a","layer":"incidents","filter":{"category":["SOLID_WASTE"],"family":null,"severity":null,"status":"ope... (356 chars) | # Window: last 7 days: reported after 2026-10-30 18:08:00 to 2026-11-06 18:08:00 IST |
| $.line[5] | id,title,category,severity,status,open,ward,zone,department,first_reported,place,nearest,nearest_m,lat,lon,location_known_to_m | # Plan: {"steps":[{"op":"take","as":"a","layer":"incidents","filter":{"category":["SOLID_WASTE"],"family":null,"severity":null,"status":"ope... (356 chars) |
| $.line[6] | INC-20261102-8EC358,Garbage at the dumping ground is burning since last Monday,Garbage & solid waste,Medium,In progress,yes,125,Teynampet,So... (257 chars) | id,title,category,severity,status,open,ward,zone,department,first_reported,place,nearest,nearest_m,lat,lon,location_known_to_m |
| $.line[7] | INC-20261103-22C9F8,எங்கள் குடியிருப்போர் நலச் சங்கம் (47 குடும்பங்கள்) சார்பாக எழுதுகிறேன்,Garbage & solid waste,Medium,Under review,yes,11... (274 chars) | INC-20261102-8EC358,Garbage at the dumping ground is burning since last Monday,Garbage & solid waste,Medium,In progress,yes,125,Teynampet,So... (257 chars) |
| $.line[8] | INC-20261030-CB8991,Burning of Garbage: the problem near Pillaiyar Kovil has continued for the past 4 days,Garbage & solid waste,Medium,Assi... (293 chars) | INC-20261103-22C9F8,எங்கள் குடியிருப்போர் நலச் சங்கம் (47 குடும்பங்கள்) சார்பாக எழுதுகிறேன்,Garbage & solid waste,Medium,Under review,yes,11... (274 chars) |
| $.line[9] | INC-20261101-774B5E,Complaint about cleanliness in footpath opp. St. Mary's Church,Garbage & solid waste,Low,Assigned,yes,124,Teynampet,Road... (225 chars) | INC-20261030-CB8991,Burning of Garbage: the problem near Pillaiyar Kovil has continued for the past 4 days,Garbage & solid waste,Medium,Assi... (293 chars) |
| $.line[10] | INC-20261102-132638,Removal of Debris: the problem on Rotary Nagar Ixth Street has continued for two weeks now,Garbage & solid waste,Low,In ... (302 chars) | INC-20261101-774B5E,Complaint about cleanliness in footpath opp. St. Mary's Church,Garbage & solid waste,Low,Assigned,yes,124,Teynampet,Road... (225 chars) |
| $.line[11] |  | INC-20261102-132638,Removal of Debris: the problem on Rotary Nagar Ixth Street has continued for two weeks now,Garbage & solid waste,Low,In ... (302 chars) |
| $.line[12] | (absent) |  |

### collector POST /api/map/export (plan of sentence 2 with grant)

Session ask, id c0fbdcc5b3a3252d, 3358 bytes to 3444 bytes.

| Path | A | B |
|---|---|---|
| $.properties.window | (absent) | last 7 days: reported after 2026-10-30 18:08:00 to 2026-11-06 18:08:00 IST |

### collector POST /api/collector/thunai/agent/round

Session ask, id 8213db3c1be53f5d, 309 bytes to 15055 bytes.

| Path | A | B |
|---|---|---|
| $.result.kind | none | do |
| $.result.steps.length | 0 | 1 |
| $.result.steps[0] | (absent) | {object with 2 keys} |
| $.result.stage | null | {object with 13 keys} |
| $.result.say | null | 17 cases still open today (6 Nov, since midnight). One is past its deadline and needs you first: Road accident at Ekkattuthangal in Adyar. S... (214 chars) |
| $.result.note | no-model | quick |
| $.trace.length | 1 | 2 |
| $.trace[0].label | Thinking | Reading the data |
| $.trace[1] | (absent) | {object with 3 keys} |
| $.lane | no-model | quick |

### collector POST /api/collector/thunai/agent/round

Session ask, id bc94a14cdfe5ac48, 7475 bytes to 7308 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.en | 5 cases this week. 5 are past their deadline and need you first: uncleared garbage at Rasha Hydhar Street, Anna Salai, Chepauk in Teynampet,... (309 chars) | 5 cases this week. 5 are past their deadline and need you first: uncleared garbage at Chepauk in Teynampet, and uncleared garbage at Mylapor... (236 chars) |
| $.result.stage.say.ta | இந்த வாரம் 5 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: அகற்றப்படாத குப்பை, Rasha Hydhar Street, Anna Salai, Chepauk, தேன... (312 chars) | இந்த வாரம் 5 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: அகற்றப்படாத குப்பை, Chepauk, தேனாம்பேட்டை; அகற்றப்படாத குப்பை, My... (243 chars) |
| $.result.say | 5 cases this week. 5 are past their deadline and need you first: uncleared garbage at Rasha Hydhar Street, Anna Salai, Chepauk in Teynampet,... (309 chars) | 5 cases this week. 5 are past their deadline and need you first: uncleared garbage at Chepauk in Teynampet, and uncleared garbage at Mylapor... (236 chars) |

### collector POST /api/collector/thunai/agent/round

Session ask, id a00a263949adc0de, 3551 bytes to 3577 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.ta | 6 அளவீடுகள். அதிகம்: Veeranam, 72%, 6 Nov, 6:00 AM நிலவரப்படி. | 6 அளவீடுகள். அதிகம்: Veeranam, 72%, 6 நவ., முற்பகல் 6:00 நிலவரப்படி. |

### collector POST /api/collector/thunai/agent/round

Session ask, id 157508256127d2ef, 3924 bytes to 3950 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.ta | Manali, Chennai - CPCB: 121 AQI, 4 Nov, 5:00 PM நிலவரப்படி. | Manali, Chennai - CPCB: 121 AQI, 4 நவ., பிற்பகல் 5:00 நிலவரப்படி. |

### collector POST /api/collector/thunai/agent/round

Session ask, id 091763a4e6e28326, 2558 bytes to 309 bytes.

| Path | A | B |
|---|---|---|
| $.result.kind | do | none |
| $.result.steps.length | 1 | 0 |
| $.result.steps[0] | {object with 2 keys} | (absent) |
| $.result.stage | {object with 13 keys} | null |
| $.result.say | 4 readings. Highest: Chennai-Madhavaram at 14 mm, as of 6 Nov, 8:30 AM. | null |
| $.result.note | quick | no-model |
| $.trace.length | 2 | 1 |
| $.trace[0].label | Reading the data | Thinking |
| $.trace[1] | {object with 3 keys} | (absent) |
| $.lane | quick | no-model |

### collector POST /api/collector/thunai/agent/round

Session ask, id 1959186f8ccc0a1e, 3691 bytes to 3874 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.title | Solid Waste Management · brief, today | Solid Waste Management · brief, the last 24 hours |
| $.result.stage.takeaway.en | 18 new incidents came in today; 18 cases are still open, and none is past the deadline. | 18 new incidents came in the last 24 hours; 18 cases are still open, and none is past the deadline. |
| $.result.stage.takeaway.ta | இன்று 18 புதிய சம்பவங்கள் வந்தன; 18 இன்னும் நிலுவையில்; கெடு தாண்டியது எதுவும் இல்லை. | கடந்த 24 மணி நேரத்தில் 18 புதிய சம்பவங்கள் வந்தன; 18 இன்னும் நிலுவையில்; கெடு தாண்டியது எதுவும் இல்லை. |
| $.result.stage.say.en | Solid Waste Management: 18 new incidents came in today; 18 cases are still open, and none is past the deadline. Most complaint records here ... (187 chars) | Solid Waste Management: 18 new incidents came in the last 24 hours; 18 cases are still open, and none is past the deadline. Most complaint r... (199 chars) |
| $.result.stage.say.ta | திடக்கழிவு மேலாண்மைத் துறை: இன்று 18 புதிய சம்பவங்கள் வந்தன; 18 இன்னும் நிலுவையில்; கெடு தாண்டியது எதுவும் இல்லை. இங்குள்ள பெரும்பாலான புகார... (188 chars) | திடக்கழிவு மேலாண்மைத் துறை: கடந்த 24 மணி நேரத்தில் 18 புதிய சம்பவங்கள் வந்தன; 18 இன்னும் நிலுவையில்; கெடு தாண்டியது எதுவும் இல்லை. இங்குள்ள ... (205 chars) |
| $.result.stage.blocks[1].points[0].text | 18 new incidents came in today; 18 cases are still open, and none is past the deadline. | 18 new incidents came in the last 24 hours; 18 cases are still open, and none is past the deadline. |
| $.result.stage.blocks[1].points[0].ta | இன்று 18 புதிய சம்பவங்கள் வந்தன; 18 இன்னும் நிலுவையில்; கெடு தாண்டியது எதுவும் இல்லை. | கடந்த 24 மணி நேரத்தில் 18 புதிய சம்பவங்கள் வந்தன; 18 இன்னும் நிலுவையில்; கெடு தாண்டியது எதுவும் இல்லை. |
| $.result.say | Solid Waste Management: 18 new incidents came in today; 18 cases are still open, and none is past the deadline. Most complaint records here ... (187 chars) | Solid Waste Management: 18 new incidents came in the last 24 hours; 18 cases are still open, and none is past the deadline. Most complaint r... (199 chars) |

### collector POST /api/collector/thunai/agent/round

Session ask, id ac136777a4aee429, 12469 bytes to 15939 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.title | சம்பவங்கள் · அடையாறு · இன்று | சம்பவங்கள் · அடையாறு · இன்று (6 நவம்பர், நள்ளிரவு முதல்) |
| $.result.stage.takeaway.en | 2 of the 23 are past their deadline. | 1 of the 17 is past its deadline. |
| $.result.stage.takeaway.ta | 23-இல் 2 காலக்கெடுவைத் தாண்டியவை. | 17-இல் 1 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 23 cases today; here are the 12 that matter most. 2 are past their deadline and need you first: standing water at Saidapet (Adyar River - Sa... (243 chars) | 17 cases still open today (6 Nov, since midnight). One is past its deadline and needs you first: Road accident at Ekkattuthangal in Adyar. S... (214 chars) |
| $.result.stage.say.ta | இன்று 23 சம்பவங்கள். 2 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: தண்ணீர் தேக்கம், Saidapet (Adyar River - Saidapet stretch), அடையாறு; ... (225 chars) | இன்று (6 நவம்பர், நள்ளிரவு முதல்) 17 சம்பவங்கள் இன்னும் நிலுவையில். 1 காலக்கெடு தாண்டியது, முதலில் கவனிக்க வேண்டியது: சாலை விபத்து, Ekkattut... (232 chars) |
| $.result.stage.blocks[0].items[0].label | எல்லா சம்பவங்கள், இன்று | எல்லா சம்பவங்கள் இன்னும் நிலுவையில், இன்று |
| $.result.stage.blocks[0].items[0].value | 23 | 17 |
| $.result.stage.blocks[0].items[1].value | 2 | 1 |
| $.result.stage.blocks[1].title | சம்பவங்கள் · அடையாறு · இன்று | சம்பவங்கள் · அடையாறு · இன்று (6 நவம்பர், நள்ளிரவு முதல்) |
| $.result.stage.blocks[1].total | 23 | 17 |
| $.result.stage.blocks[1].rows.length | 12 | 17 |
| $.result.stage.blocks[1].rows[0].id | INC-20261105-5C94BB | INC-20261106-444D4F |
| $.result.stage.blocks[1].rows[0].title | Call recd: canal water flowing into Srinivasa Nagar 6th St, Saidapet from Adyar River | Two-wheeler skids near Ekkattuthangal Metro Station; rider injured |
| $.result.stage.blocks[1].rows[0].sev | Severe | High |
| $.result.stage.blocks[1].rows[0].place | Saidapet (Adyar River - Saidapet stretch) | Ekkattuthangal |
| $.result.stage.blocks[1].rows[0].dept | PWD-WRD | POL-GCP |
| $.result.stage.blocks[1].rows[0].deptName | PWD Water Resources | Greater Chennai Police |
| $.result.stage.blocks[1].rows[0].t | 2026-11-05 23:41:50 | 2026-11-06 00:25:39 |
| $.result.stage.blocks[1].rows[0].lat | 13.010337 | 13.019162 |
| $.result.stage.blocks[1].rows[0].lon | 80.206788 | 80.203481 |
| $.result.stage.blocks[1].rows[0].cat | Flooding & waterlogging | Road accident |
| $.result.stage.blocks[1].rows[1].id | INC-20261106-444D4F | INC-20261106-D39D78 |
| $.result.stage.blocks[1].rows[1].title | Two-wheeler skids near Ekkattuthangal Metro Station; rider injured | Canal overflowing near Adambakkam; water entering nearby streets including Jeevan Nagar 4th Street, Guru Brindavan |
| $.result.stage.blocks[1].rows[1].sev | High | Medium |
| $.result.stage.blocks[1].rows[1].status | In progress | Open |

...and 188 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round

Session ask, id f1e6ac2ad90ac282, 12391 bytes to 3732 bytes.

| Path | A | B |
|---|---|---|
| $.result.steps.length | 2 | 1 |
| $.result.steps[0].a | view | period |
| $.result.steps[0].view | {object with 1 keys} | (absent) |
| $.result.steps[0].period | (absent) | weekly |
| $.result.steps[1] | {object with 2 keys} | (absent) |
| $.result.stage.recipe | cases | ranking |
| $.result.stage.title | கடுமையான சம்பவங்கள் · இந்த வாரம் | Top 5 · Severe incidents · this week |
| $.result.stage.takeaway.en | 54 are past their deadline. | Royapuram is 4× the median of all 15. |
| $.result.stage.takeaway.ta | 54 காலக்கெடுவைத் தாண்டியவை. | ராயபுரம், அனைத்து 15-இன் இடைநிலையை விட 4 மடங்கு. |
| $.result.stage.say.en | 52 severe cases this week; here are the 12 that matter most. 54 are past their deadline and need you first: standing water at Pulianthope (B... (281 chars) | Highest: Royapuram, 16 incidents. Then Thiruvottiyur 9, Anna Nagar 7. |
| $.result.stage.say.ta | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 54 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: தண்ணீர் தேக்கம், Pulianthope (Buckingham Canal - Basin... (258 chars) | அதிகம்: ராயபுரம், 16 சம்பவங்கள். அடுத்து திருவொற்றியூர் 9, அண்ணா நகர் 7. |
| $.result.stage.blocks[0].items.length | 2 | 3 |
| $.result.stage.blocks[0].items[0].key | total | top |
| $.result.stage.blocks[0].items[0].label | கடுமையான சம்பவங்கள், இந்த வாரம் | Royapuram |
| $.result.stage.blocks[0].items[0].value | 52 | 16 |
| $.result.stage.blocks[0].items[0].unit | null | incidents |
| $.result.stage.blocks[0].items[1].key | late | total |
| $.result.stage.blocks[0].items[1].label | காலக்கெடு தாண்டியவை | All areas together |
| $.result.stage.blocks[0].items[1].value | 54 | 65 |
| $.result.stage.blocks[0].items[1].unit | null | incidents |
| $.result.stage.blocks[0].items[1].tone | bad | neutral |
| $.result.stage.blocks[0].items[2] | (absent) | {object with 8 keys} |
| $.result.stage.blocks[1].kind | CaseList | Ranking |
| $.result.stage.blocks[1].id | cases | rank |
| $.result.stage.blocks[1].title | கடுமையான சம்பவங்கள் · இந்த வாரம் | Severe incidents |

...and 76 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round

Session ask, id 484c3e63acc4f70c, 11437 bytes to 11374 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.en | 11 cases this week; here are the 10 that matter most. 5 are past their deadline and need you first: uncleared garbage at Rasha Hydhar Street... (344 chars) | 11 cases this week; here are the 10 that matter most. 5 are past their deadline and need you first: uncleared garbage at Chepauk in Teynampe... (271 chars) |
| $.result.stage.say.ta | இந்த வாரம் 11 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: அகற்றப்படாத குப்பை, Rasha Hydhar Street, Anna Salai, Chepauk, தே... (313 chars) | இந்த வாரம் 11 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: அகற்றப்படாத குப்பை, Chepauk, தேனாம்பேட்டை; அகற்றப்படாத குப்பை, M... (244 chars) |
| $.result.stage.blocks[0].items[2].label | Solid Waste Management வசம் | திடக்கழிவு மேலாண்மைத் துறை வசம் |
| $.result.say | இந்த வாரம் 11 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: அகற்றப்படாத குப்பை, Rasha Hydhar Street, Anna Salai, Chepauk, தே... (313 chars) | இந்த வாரம் 11 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: அகற்றப்படாத குப்பை, Chepauk, தேனாம்பேட்டை; அகற்றப்படாத குப்பை, M... (244 chars) |

### collector POST /api/collector/thunai/agent/round

Session ask, id 0401451bde1ac789, 6197 bytes to 6056 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.en | 2 cases this week. One is past its deadline and needs you first: a street light or electrical problem at Srinivasa Nagar V Cross Road, Srini... (216 chars) | 2 cases this week. One is past its deadline and needs you first: a street light or electrical problem at Kolathur in Madhavaram. Say "read t... (169 chars) |
| $.result.stage.say.ta | இந்த வாரம் 2 சம்பவங்கள். 1 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: தெருவிளக்கு அல்லது மின் பிரச்சினை, Srinivasa Nagar V Cross Road, ... (222 chars) | இந்த வாரம் 2 சம்பவங்கள். 1 காலக்கெடு தாண்டியது, முதலில் கவனிக்க வேண்டியது: தெருவிளக்கு அல்லது மின் பிரச்சினை, Kolathur, மாதவரம். "படி" அல்லத... (175 chars) |
| $.result.say | இந்த வாரம் 2 சம்பவங்கள். 1 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: தெருவிளக்கு அல்லது மின் பிரச்சினை, Srinivasa Nagar V Cross Road, ... (222 chars) | இந்த வாரம் 2 சம்பவங்கள். 1 காலக்கெடு தாண்டியது, முதலில் கவனிக்க வேண்டியது: தெருவிளக்கு அல்லது மின் பிரச்சினை, Kolathur, மாதவரம். "படி" அல்லத... (175 chars) |

### collector POST /api/collector/thunai/agent/round

Session ask, id 2941e2ef55b91f8b, 3654 bytes to 3706 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.ta | 6 அளவீடுகள். அதிகம்: Veeranam, 72%, 6 Nov, 6:00 AM நிலவரப்படி. | 6 அளவீடுகள். அதிகம்: Veeranam, 72%, 6 நவ., முற்பகல் 6:00 நிலவரப்படி. |
| $.result.say | 6 அளவீடுகள். அதிகம்: Veeranam, 72%, 6 Nov, 6:00 AM நிலவரப்படி. | 6 அளவீடுகள். அதிகம்: Veeranam, 72%, 6 நவ., முற்பகல் 6:00 நிலவரப்படி. |

### collector POST /api/collector/thunai/agent/round

Session ask, id fa394469d1d31521, 11073 bytes to 10939 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.en | 91 cases this week; here are the 12 that matter most. 42 are past their deadline and need you first: standing water at Saidapet (Adyar River... (247 chars) | 91 cases this week; here are the 12 that matter most. 42 are past their deadline and need you first: standing water at Saidapet in Adyar, an... (207 chars) |
| $.result.stage.say.ta | இந்த வாரம் 91 சம்பவங்கள். 42 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: தண்ணீர் தேக்கம், Saidapet (Adyar River - Saidapet stretch), அடை... (232 chars) | இந்த வாரம் 91 சம்பவங்கள். 42 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: தண்ணீர் தேக்கம், Saidapet, அடையாறு; தண்ணீர் தேக்கம், அடையாறு. "... (185 chars) |
| $.result.say | இந்த வாரம் 91 சம்பவங்கள். 42 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: தண்ணீர் தேக்கம், Saidapet (Adyar River - Saidapet stretch), அடை... (232 chars) | இந்த வாரம் 91 சம்பவங்கள். 42 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: தண்ணீர் தேக்கம், Saidapet, அடையாறு; தண்ணீர் தேக்கம், அடையாறு. "... (185 chars) |

### collector POST /api/collector/thunai/agent/round

Session ask, id 9f079c06d08640a4, 337 bytes to 3732 bytes.

| Path | A | B |
|---|---|---|
| $.result.kind | none | do |
| $.result.steps.length | 0 | 1 |
| $.result.steps[0] | (absent) | {object with 2 keys} |
| $.result.stage | null | {object with 13 keys} |
| $.result.say | null | அதிகம்: ராயபுரம், 16 சம்பவங்கள். அடுத்து திருவொற்றியூர் 9, அண்ணா நகர் 7. |
| $.result.note | no-model | quick |
| $.trace.length | 1 | 2 |
| $.trace[0].label | யோசிக்கிறேன் | தரவைப் படிக்கிறேன் |
| $.trace[1] | (absent) | {object with 3 keys} |
| $.lane | no-model | quick |

### collector POST /api/collector/thunai/agent/round

Session ask, id f09bcf697432c0ab, 10951 bytes to 10836 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.en | 11 cases this week; here are the 10 that matter most. 5 are past their deadline and need you first: uncleared garbage at Rasha Hydhar Street... (344 chars) | 11 cases this week; here are the 10 that matter most. 5 are past their deadline and need you first: uncleared garbage at Chepauk in Teynampe... (271 chars) |
| $.result.stage.say.ta | இந்த வாரம் 11 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: அகற்றப்படாத குப்பை, Rasha Hydhar Street, Anna Salai, Chepauk, தே... (313 chars) | இந்த வாரம் 11 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: அகற்றப்படாத குப்பை, Chepauk, தேனாம்பேட்டை; அகற்றப்படாத குப்பை, M... (244 chars) |
| $.result.say | இந்த வாரம் 11 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: அகற்றப்படாத குப்பை, Rasha Hydhar Street, Anna Salai, Chepauk, தே... (313 chars) | இந்த வாரம் 11 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: அகற்றப்படாத குப்பை, Chepauk, தேனாம்பேட்டை; அகற்றப்படாத குப்பை, M... (244 chars) |

### collector POST /api/collector/thunai/agent/round

Session ask, id f025856d46a1ca5f, 6116 bytes to 6165 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.en | 3 cases this week. One is past its deadline and needs you first: a street light or electrical problem at Church Road, Padi, Mogappair in Amb... (233 chars) | 3 cases this week. One is past its deadline and needs you first: a street light or electrical problem at Mogappair in Ambattur. Street Light... (214 chars) |
| $.result.stage.say.ta | இந்த வாரம் 3 சம்பவங்கள். 1 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: தெருவிளக்கு அல்லது மின் பிரச்சினை, Church Road, Padi, Mogappair, ... (235 chars) | இந்த வாரம் 3 சம்பவங்கள். 1 காலக்கெடு தாண்டியது, முதலில் கவனிக்க வேண்டியது: தெருவிளக்கு அல்லது மின் பிரச்சினை, Mogappair, அம்பத்தூர். தெருவிள... (217 chars) |
| $.result.say | இந்த வாரம் 3 சம்பவங்கள். 1 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: தெருவிளக்கு அல்லது மின் பிரச்சினை, Church Road, Padi, Mogappair, ... (235 chars) | இந்த வாரம் 3 சம்பவங்கள். 1 காலக்கெடு தாண்டியது, முதலில் கவனிக்க வேண்டியது: தெருவிளக்கு அல்லது மின் பிரச்சினை, Mogappair, அம்பத்தூர். தெருவிள... (217 chars) |

### collector POST /api/collector/thunai/agent/round

Session ask, id 9ef6d6c5b729a804, 3654 bytes to 3706 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.ta | 6 அளவீடுகள். அதிகம்: Veeranam, 72%, 6 Nov, 6:00 AM நிலவரப்படி. | 6 அளவீடுகள். அதிகம்: Veeranam, 72%, 6 நவ., முற்பகல் 6:00 நிலவரப்படி. |
| $.result.say | 6 அளவீடுகள். அதிகம்: Veeranam, 72%, 6 Nov, 6:00 AM நிலவரப்படி. | 6 அளவீடுகள். அதிகம்: Veeranam, 72%, 6 நவ., முற்பகல் 6:00 நிலவரப்படி. |

### collector POST /api/collector/thunai/agent/round

Session ask, id a3c117ff746b0a57, 8200 bytes to 8219 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.en | 7 cases this week. The most urgent: a safety problem at a drain worksite at Periyar 5Th Salai in Adyar. Storm Water Drain holds 7 of them. S... (179 chars) | 7 cases this week. The most urgent: a safety problem at a drain worksite in Adyar. Storm Water Drain holds 7 of them. Say "read them", or "o... (158 chars) |
| $.result.stage.say.ta | இந்த வாரம் 7 சம்பவங்கள். மிக அவசரமானது: வடிகால் பணியிடத்தில் பாதுகாப்புப் பிரச்சினை, Periyar 5Th Salai, அடையாறு. Storm Water Drain வசம் 7. "... (185 chars) | இந்த வாரம் 7 சம்பவங்கள். மிக அவசரமானது: வடிகால் பணியிடத்தில் பாதுகாப்புப் பிரச்சினை, அடையாறு. மழைநீர் வடிகால் துறை வசம் 7. "படி" அல்லது "திற... (169 chars) |
| $.result.say | இந்த வாரம் 7 சம்பவங்கள். மிக அவசரமானது: வடிகால் பணியிடத்தில் பாதுகாப்புப் பிரச்சினை, Periyar 5Th Salai, அடையாறு. Storm Water Drain வசம் 7. "... (185 chars) | இந்த வாரம் 7 சம்பவங்கள். மிக அவசரமானது: வடிகால் பணியிடத்தில் பாதுகாப்புப் பிரச்சினை, அடையாறு. மழைநீர் வடிகால் துறை வசம் 7. "படி" அல்லது "திற... (169 chars) |

### collector POST /api/collector/thunai/agent/round (direct, sentence 2)

Session ask, id 374abbf925411872, 7427 bytes to 7260 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.en | 5 cases this week. 5 are past their deadline and need you first: uncleared garbage at Rasha Hydhar Street, Anna Salai, Chepauk in Teynampet,... (309 chars) | 5 cases this week. 5 are past their deadline and need you first: uncleared garbage at Chepauk in Teynampet, and uncleared garbage at Mylapor... (236 chars) |
| $.result.stage.say.ta | இந்த வாரம் 5 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: அகற்றப்படாத குப்பை, Rasha Hydhar Street, Anna Salai, Chepauk, தேன... (312 chars) | இந்த வாரம் 5 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: அகற்றப்படாத குப்பை, Chepauk, தேனாம்பேட்டை; அகற்றப்படாத குப்பை, My... (243 chars) |
| $.result.say | 5 cases this week. 5 are past their deadline and need you first: uncleared garbage at Rasha Hydhar Street, Anna Salai, Chepauk in Teynampet,... (309 chars) | 5 cases this week. 5 are past their deadline and need you first: uncleared garbage at Chepauk in Teynampet, and uncleared garbage at Mylapor... (236 chars) |

### collector POST /api/collector/thunai/agent/round (direct, sentence 8)

Session ask, id be3f567754865da5, 3503 bytes to 3529 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.ta | 6 அளவீடுகள். அதிகம்: Veeranam, 72%, 6 Nov, 6:00 AM நிலவரப்படி. | 6 அளவீடுகள். அதிகம்: Veeranam, 72%, 6 நவ., முற்பகல் 6:00 நிலவரப்படி. |

### collector POST /api/collector/thunai/agent/round (direct, sentence 10)

Session ask, id 72847463243eb5f3, 3876 bytes to 3902 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.ta | Manali, Chennai - CPCB: 121 AQI, 4 Nov, 5:00 PM நிலவரப்படி. | Manali, Chennai - CPCB: 121 AQI, 4 நவ., பிற்பகல் 5:00 நிலவரப்படி. |

### collector POST /api/collector/thunai/agent/round (direct, sentence 12)

Session ask, id 555df8086cdb06ba, 3624 bytes to 3807 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.title | Solid Waste Management · brief, today | Solid Waste Management · brief, the last 24 hours |
| $.result.stage.takeaway.en | 18 new incidents came in today; 18 cases are still open, and none is past the deadline. | 18 new incidents came in the last 24 hours; 18 cases are still open, and none is past the deadline. |
| $.result.stage.takeaway.ta | இன்று 18 புதிய சம்பவங்கள் வந்தன; 18 இன்னும் நிலுவையில்; கெடு தாண்டியது எதுவும் இல்லை. | கடந்த 24 மணி நேரத்தில் 18 புதிய சம்பவங்கள் வந்தன; 18 இன்னும் நிலுவையில்; கெடு தாண்டியது எதுவும் இல்லை. |
| $.result.stage.say.en | Solid Waste Management: 18 new incidents came in today; 18 cases are still open, and none is past the deadline. Most complaint records here ... (187 chars) | Solid Waste Management: 18 new incidents came in the last 24 hours; 18 cases are still open, and none is past the deadline. Most complaint r... (199 chars) |
| $.result.stage.say.ta | திடக்கழிவு மேலாண்மைத் துறை: இன்று 18 புதிய சம்பவங்கள் வந்தன; 18 இன்னும் நிலுவையில்; கெடு தாண்டியது எதுவும் இல்லை. இங்குள்ள பெரும்பாலான புகார... (188 chars) | திடக்கழிவு மேலாண்மைத் துறை: கடந்த 24 மணி நேரத்தில் 18 புதிய சம்பவங்கள் வந்தன; 18 இன்னும் நிலுவையில்; கெடு தாண்டியது எதுவும் இல்லை. இங்குள்ள ... (205 chars) |
| $.result.stage.blocks[1].points[0].text | 18 new incidents came in today; 18 cases are still open, and none is past the deadline. | 18 new incidents came in the last 24 hours; 18 cases are still open, and none is past the deadline. |
| $.result.stage.blocks[1].points[0].ta | இன்று 18 புதிய சம்பவங்கள் வந்தன; 18 இன்னும் நிலுவையில்; கெடு தாண்டியது எதுவும் இல்லை. | கடந்த 24 மணி நேரத்தில் 18 புதிய சம்பவங்கள் வந்தன; 18 இன்னும் நிலுவையில்; கெடு தாண்டியது எதுவும் இல்லை. |
| $.result.say | Solid Waste Management: 18 new incidents came in today; 18 cases are still open, and none is past the deadline. Most complaint records here ... (187 chars) | Solid Waste Management: 18 new incidents came in the last 24 hours; 18 cases are still open, and none is past the deadline. Most complaint r... (199 chars) |

### collector POST /api/collector/thunai/agent/round (direct, sentence 19)

Session ask, id 61ed15dc04e17ba5, 11353 bytes to 11290 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.en | 11 cases this week; here are the 10 that matter most. 5 are past their deadline and need you first: uncleared garbage at Rasha Hydhar Street... (344 chars) | 11 cases this week; here are the 10 that matter most. 5 are past their deadline and need you first: uncleared garbage at Chepauk in Teynampe... (271 chars) |
| $.result.stage.say.ta | இந்த வாரம் 11 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: அகற்றப்படாத குப்பை, Rasha Hydhar Street, Anna Salai, Chepauk, தே... (313 chars) | இந்த வாரம் 11 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: அகற்றப்படாத குப்பை, Chepauk, தேனாம்பேட்டை; அகற்றப்படாத குப்பை, M... (244 chars) |
| $.result.stage.blocks[0].items[2].label | Solid Waste Management வசம் | திடக்கழிவு மேலாண்மைத் துறை வசம் |
| $.result.say | இந்த வாரம் 11 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: அகற்றப்படாத குப்பை, Rasha Hydhar Street, Anna Salai, Chepauk, தே... (313 chars) | இந்த வாரம் 11 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: அகற்றப்படாத குப்பை, Chepauk, தேனாம்பேட்டை; அகற்றப்படாத குப்பை, M... (244 chars) |

### collector POST /api/collector/thunai/agent/round (direct, sentence 20)

Session ask, id f0ed9bee243901b3, 6113 bytes to 5972 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.en | 2 cases this week. One is past its deadline and needs you first: a street light or electrical problem at Srinivasa Nagar V Cross Road, Srini... (216 chars) | 2 cases this week. One is past its deadline and needs you first: a street light or electrical problem at Kolathur in Madhavaram. Say "read t... (169 chars) |
| $.result.stage.say.ta | இந்த வாரம் 2 சம்பவங்கள். 1 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: தெருவிளக்கு அல்லது மின் பிரச்சினை, Srinivasa Nagar V Cross Road, ... (222 chars) | இந்த வாரம் 2 சம்பவங்கள். 1 காலக்கெடு தாண்டியது, முதலில் கவனிக்க வேண்டியது: தெருவிளக்கு அல்லது மின் பிரச்சினை, Kolathur, மாதவரம். "படி" அல்லத... (175 chars) |
| $.result.say | இந்த வாரம் 2 சம்பவங்கள். 1 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: தெருவிளக்கு அல்லது மின் பிரச்சினை, Srinivasa Nagar V Cross Road, ... (222 chars) | இந்த வாரம் 2 சம்பவங்கள். 1 காலக்கெடு தாண்டியது, முதலில் கவனிக்க வேண்டியது: தெருவிளக்கு அல்லது மின் பிரச்சினை, Kolathur, மாதவரம். "படி" அல்லத... (175 chars) |

### collector POST /api/collector/thunai/agent/round (direct, sentence 22)

Session ask, id 75892bd131e3b8c5, 3570 bytes to 3622 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.ta | 6 அளவீடுகள். அதிகம்: Veeranam, 72%, 6 Nov, 6:00 AM நிலவரப்படி. | 6 அளவீடுகள். அதிகம்: Veeranam, 72%, 6 நவ., முற்பகல் 6:00 நிலவரப்படி. |
| $.result.say | 6 அளவீடுகள். அதிகம்: Veeranam, 72%, 6 Nov, 6:00 AM நிலவரப்படி. | 6 அளவீடுகள். அதிகம்: Veeranam, 72%, 6 நவ., முற்பகல் 6:00 நிலவரப்படி. |

### officerA POST /api/collector/assistant/chat

Session ask, id b5c6b01cbcec6214, 2021 bytes to 2122 bytes.

| Path | A | B |
|---|---|---|
| $[3].data.headline | 1 open citizen complaint · last 24 hours | 1 open citizen complaint · today (6 Nov, since midnight) |
| $[3].data.answerMarkdown | **1** open citizen complaint in the last 24 hours in Adyar zone for Solid Waste Management.  - They are about 1 incident, 1 of them still op... (142 chars) | **1** open citizen complaint today (6 Nov, since midnight) in Adyar zone for Solid Waste Management.  - They are about 1 incident, 1 of them... (151 chars) |
| $[3].data.voiceSummary | 1 open citizen complaint in the last 24 hours in Adyar zone for Solid Waste Management. | 1 open citizen complaint today (6 Nov, since midnight) in Adyar zone for Solid Waste Management. |
| $[3].data.scopeLine | Last 24 hours · Adyar (Zone 13) · Solid Waste Management · as of 6 Nov, 6:08 PM | Today (6 Nov, since midnight) · Adyar (Zone 13) · Solid Waste Management · as of 6 Nov, 6:08 PM |
| $[3].data.sources.tools[0].args.hours | null | 18 |
| $[3].data.sources.tools[0].args.range | null | {object with 2 keys} |

### officerA GET /api/collector/assistant/sessions/<uuid-1>

Session ask, id 1a6d36645cc22bb6, 2066 bytes to 2183 bytes.

| Path | A | B |
|---|---|---|
| $.messages[1].text | 1 open citizen complaint · last 24 hours | 1 open citizen complaint · today (6 Nov, since midnight) |
| $.messages[1].card.headline | 1 open citizen complaint · last 24 hours | 1 open citizen complaint · today (6 Nov, since midnight) |
| $.messages[1].card.answerMarkdown | **1** open citizen complaint in the last 24 hours in Adyar zone for Solid Waste Management.  - They are about 1 incident, 1 of them still op... (142 chars) | **1** open citizen complaint today (6 Nov, since midnight) in Adyar zone for Solid Waste Management.  - They are about 1 incident, 1 of them... (151 chars) |
| $.messages[1].card.voiceSummary | 1 open citizen complaint in the last 24 hours in Adyar zone for Solid Waste Management. | 1 open citizen complaint today (6 Nov, since midnight) in Adyar zone for Solid Waste Management. |
| $.messages[1].card.scopeLine | Last 24 hours · Adyar (Zone 13) · Solid Waste Management · as of 6 Nov, 6:08 PM | Today (6 Nov, since midnight) · Adyar (Zone 13) · Solid Waste Management · as of 6 Nov, 6:08 PM |
| $.messages[1].card.sources.tools[0].args.hours | null | 18 |
| $.messages[1].card.sources.tools[0].args.range | null | {object with 2 keys} |

### collector GET /api/collector/audit

Session ask, id a39eb5710e1b812a, 70909 bytes to 70921 bytes.

| Path | A | B |
|---|---|---|
| $.log[0].id | 1000000040 | 1000000039 |
| $.log[1].id | 1000000039 | 1000000038 |
| $.log[2].id | 1000000038 | 1000000037 |
| $.log[3].id | 1000000037 | 1000000036 |
| $.log[4].id | 1000000036 | 1000000035 |
| $.log[5].id | 1000000035 | 1000000034 |
| $.log[6].id | 1000000034 | 1000000033 |
| $.log[7].id | 1000000033 | 1000000032 |
| $.log[8].id | 1000000032 | 1000000031 |
| $.log[9].id | 1000000031 | 1000000030 |
| $.log[10].id | 1000000030 | 1000000029 |
| $.log[11].id | 1000000029 | 1000000028 |
| $.log[12].id | 1000000028 | 1000000027 |
| $.log[13].id | 1000000027 | 1000000026 |
| $.log[14].id | 1000000026 | 1000000025 |
| $.log[15].id | 1000000025 | 1000000024 |
| $.log[16].id | 1000000024 | 1000000023 |
| $.log[17].id | 1000000023 | 1000000022 |
| $.log[18].id | 1000000022 | 1000000021 |
| $.log[19].id | 1000000021 | 1000000020 |
| $.log[20].id | 1000000020 | 1000000019 |
| $.log[21].id | 1000000019 | 1000000018 |
| $.log[21].after_value | {"format":"csv","rows":1,"plan":{"steps":[{"op":"take","as":"a","layer":"incidents","filter":{"category":null,"family":null,"severity":null,... (371 chars) | {"format":"csv","rows":1,"plan":{"steps":[{"op":"take","as":"a","layer":"incidents","filter":{"category":null,"family":null,"severity":null,... (356 chars) |
| $.log[22].id | 1000000018 | 1000000017 |
| $.log[23].id | 1000000017 | 1000000016 |

...and 631 more paths (see the JSON file).

### citizenA POST /api/complaints

Session writes, id 2aa1c2dda62808d8, 988 bytes to 766 bytes.

| Path | A | B |
|---|---|---|
| $.queueNote.en | Your complaint is registered. The department officer will see it in their queue at the next update, which runs every hour. | Your complaint is registered and is already in the department officer's queue. |
| $.queueNote.ta | உங்கள் புகார் பதிவு செய்யப்பட்டது. துறை அலுவலர் அடுத்த புதுப்பிப்பில் தம் பட்டியலில் இதைப் பார்ப்பார். புதுப்பிப்பு ஒவ்வொரு மணிநேரமும் நடக்க... (144 chars) | உங்கள் புகார் பதிவு செய்யப்பட்டது; இது ஏற்கனவே துறை அலுவலரின் பட்டியலில் உள்ளது. |

### citizenA GET /api/complaints/<new-complaint-code-1>

Session writes, id 1a74f77c3d8d08f6, 1435 bytes to 1458 bytes.

| Path | A | B |
|---|---|---|
| $.checker | (absent) | department |

### collector GET /api/collector/search?q=<new-complaint-code-1>

Session writes, id cd47878c4defdb30, 1202 bytes to 1251 bytes.

| Path | A | B |
|---|---|---|
| $.incidents[0].lat | 13.016499019607844 | 13.01596568627451 |
| $.incidents[0].lon | 80.21072974509804 | 80.20999249019607 |
| $.incidents[0].sev | Medium | Low |
| $.incidents[0].sla_due | 2026-11-11 12:00:00 | 2026-11-10 12:00:00 |
| $.incidents[0].severity_reasons |  | Civic issue: Burning of street light in daytime (+15) |

### collector GET /api/collector/incidents/INC-20260926-EB3B79

Session writes, id afc98c033d1a5398, 7050 bytes to 7089 bytes.

| Path | A | B |
|---|---|---|
| $.incident.officer_step | (absent) | null |
| $.officerStep | (absent) | null |

### officerA GET /api/officer/grievances/INC-20260926-EB3B79

Session writes, id 7d3e4dfc19322b41, 1819 bytes to 1853 bytes.

| Path | A | B |
|---|---|---|
| $.grievance.stage | sent | action |
| $.grievance.breached | (absent) | 1 |
| $.next | null | close |
| $.rejected | (absent) | null |

### collector GET /api/collector/incidents/INC-20260926-EB3B79

Session writes, id e9539881d6c96949, 7050 bytes to 7089 bytes.

| Path | A | B |
|---|---|---|
| $.incident.officer_step | (absent) | null |
| $.officerStep | (absent) | null |

### collector GET /api/collector/incidents/INC-20260708-D4FE28

Session writes, id 7035aa2ffc68c0d3, 4256 bytes to 4295 bytes.

| Path | A | B |
|---|---|---|
| $.incident.officer_step | (absent) | null |
| $.officerStep | (absent) | null |

### collector GET /api/collector/incidents/INC-20261105-697F9E

Session writes, id 41a170c84d0bd23d, 3218 bytes to 3257 bytes.

| Path | A | B |
|---|---|---|
| $.incident.officer_step | (absent) | null |
| $.officerStep | (absent) | null |

### collector POST /api/collector/decisions

Session writes, id 6188adb3216547b1, 100 bytes to 183 bytes.
- status: 201 to 428

| Path | A | B |
|---|---|---|
| $.saved | [array of 1] | (absent) |
| $.error | (absent) | Confirm it's you first. |
| $.confirm | (absent) | {object with 4 keys} |

### collector GET /api/collector/incidents/INC-20261105-697F9E

Session writes, id 312d7e3e75cbc3a0, 3536 bytes to 3257 bytes.

| Path | A | B |
|---|---|---|
| $.incident.status | Open | Resolved |
| $.incident.open | 1 | 0 |
| $.incident.closed_at | null | 2026-11-06 12:00:00 |
| $.incident.decision | reopen | verify |
| $.incident.why.attention.length | 2 | 0 |
| $.incident.why.attention[0] | Still open at more than twice its 6-hour deadline | (absent) |
| $.incident.why.attention[1] | Keeps happening: 9 similar incidents here in 90 days | (absent) |
| $.incident.why.needsYou | true | false |
| $.incident.why.why.length | 2 | 0 |
| $.incident.why.why[0] | Still open at more than twice its 6-hour deadline | (absent) |
| $.incident.why.why[1] | Keeps happening: 9 similar incidents here in 90 days | (absent) |
| $.incident.officer_step | (absent) | null |
| $.decisions.length | 2 | 1 |
| $.decisions[1] | {object with 5 keys} | (absent) |
| $.officerStep | (absent) | null |

### collector GET /api/collector/overview

Session writes, id ea0ab3f25bc17c26, 232509 bytes to 235191 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur.resolved | 175 | 176 |
| $.kpi.prev.ongoing | 223 | 222 |
| $.kpi.prev.severe_open | 21 | 20 |
| $.kpi.prev.urgent | 63 | 62 |
| $.kpi.series.resolved[8] | 13 | 14 |
| $.map.pins[72].id | INC-W-<new-complaint-code-1> | INC-20261106-D3B089 |
| $.map.pins[72].lat | 13.016499019607844 | 13.1015462 |
| $.map.pins[72].lon | 80.21072974509804 | 80.2536023 |
| $.map.pins[72].title | Golden master test complaint | Kumarasamy Rajapuram பகுதி மக்கள் சார்பாக இந்த புகார் |
| $.map.pins[72].status | Open | Under review |
| $.map.pins[72].t | 2026-11-06 12:00:00 | 2026-11-06 11:26:00 |
| $.map.pins[73].id | INC-20261106-D3B089 | INC-20261106-707839 |
| $.map.pins[73].lat | 13.1015462 | 13.103349 |
| $.map.pins[73].lon | 80.2536023 | 80.2689739 |
| $.map.pins[73].title | Kumarasamy Rajapuram பகுதி மக்கள் சார்பாக இந்த புகார் | Bin full ah overflow aagudhu, road fulla kuppai irukku |
| $.map.pins[73].t | 2026-11-06 11:26:00 | 2026-11-06 11:22:00 |
| $.map.pins[74].id | INC-20261106-707839 | INC-20261106-CCFD79 |
| $.map.pins[74].lat | 13.103349 | 12.9108882 |
| $.map.pins[74].lon | 80.2689739 | 80.1949158 |
| $.map.pins[74].title | Bin full ah overflow aagudhu, road fulla kuppai irukku | வடிகால் பணி நடக்கும் இடத்தில் தடுப்பு வேலி இல்லை |
| $.map.pins[74].t | 2026-11-06 11:22:00 | 2026-11-06 11:11:00 |
| $.map.pins[75].id | INC-20261106-CCFD79 | INC-20261106-FD167D |
| $.map.pins[75].lat | 12.9108882 | 13.0374986 |
| $.map.pins[75].lon | 80.1949158 | 80.2342548 |
| $.map.pins[75].title | வடிகால் பணி நடக்கும் இடத்தில் தடுப்பு வேலி இல்லை | Mosquito menace is very high in our area. Please do fogging and spray larvicide |

...and 812 more paths (see the JSON file).

### collector GET /api/collector/overview?period=weekly&zone=13

Session writes, id 3f54c3ecc14de285, 140493 bytes to 139122 bytes.

| Path | A | B |
|---|---|---|
| $.zoneTable[7].open | 97 | 96 |
| $.map.pins[23].id | INC-W-<new-complaint-code-1> | INC-20261106-204F2B |
| $.map.pins[23].lat | 13.016499019607844 | 12.981065494705549 |
| $.map.pins[23].lon | 80.21072974509804 | 80.21751140355502 |
| $.map.pins[23].title | Golden master test complaint | தெருவிளக்கு இரண்டு வாரங்களாக எரியவில்லை. இரவில் பெண்கள் நடந்து செல்ல பயப்படுகிறார்கள் |
| $.map.pins[23].status | Open | Under review |
| $.map.pins[23].t | 2026-11-06 12:00:00 | 2026-11-06 07:03:00 |
| $.map.pins[24].id | INC-20261106-204F2B | INC-20261105-706AC2 |
| $.map.pins[24].lat | 12.981065494705549 | 12.9933308 |
| $.map.pins[24].lon | 80.21751140355502 | 80.232466 |
| $.map.pins[24].title | தெருவிளக்கு இரண்டு வாரங்களாக எரியவில்லை. இரவில் பெண்கள் நடந்து செல்ல பயப்படுகிறார்கள் | Mosquito Menace தொடர்பான பிரச்சினை எங்கள் பகுதியில் உள்ளது |
| $.map.pins[24].status | Under review | Assigned |
| $.map.pins[24].t | 2026-11-06 07:03:00 | 2026-11-05 21:09:00 |
| $.map.pins[25].id | INC-20261105-706AC2 | INC-20261105-A63603 |
| $.map.pins[25].lat | 12.9933308 | 13.0235727 |
| $.map.pins[25].lon | 80.232466 | 80.2666964 |
| $.map.pins[25].title | Mosquito Menace தொடர்பான பிரச்சினை எங்கள் பகுதியில் உள்ளது | தெருநாய்கள் தொல்லை அதிகமாக உள்ளது. குழந்தைகள் பள்ளிக்குச் செல்ல பயப்படுகிறார்கள் |
| $.map.pins[25].status | Assigned | Under review |
| $.map.pins[25].t | 2026-11-05 21:09:00 | 2026-11-05 20:52:00 |
| $.map.pins[26].id | INC-20261105-A63603 | INC-20261105-7BC208 |
| $.map.pins[26].lat | 13.0235727 | 13.0046136 |
| $.map.pins[26].lon | 80.2666964 | 80.244575 |
| $.map.pins[26].title | தெருநாய்கள் தொல்லை அதிகமாக உள்ளது. குழந்தைகள் பள்ளிக்குச் செல்ல பயப்படுகிறார்கள் | முழங்கால் அளவு தண்ணீர் தேங்கியுள்ளது. வாகனங்கள் செல்ல முடியவில்லை |
| $.map.pins[26].t | 2026-11-05 20:52:00 | 2026-11-05 17:38:00 |
| $.map.pins[27].id | INC-20261105-7BC208 | INC-20261104-D0E440 |

...and 740 more paths (see the JSON file).

### officerA GET /api/officer/grievances?tab=new&per=4

Session writes, id 78f15c9fa2f5ce11, 2641 bytes to 2693 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |

### officerA GET /api/officer/grievances/INC-20261106-0B725B

Session writes, id f5f598220fa678b3, 1810 bytes to 1853 bytes.

| Path | A | B |
|---|---|---|
| $.grievance.breached | (absent) | 0 |
| $.next | send | close |
| $.sources[0].note | Daily Thiruvalluvar Salai vazhiya dhaan poren. Nuisance by Garbage Tractor/Truck problem oru maasama irukku, yaarum kandukala. Kuppai vandi ... (280 chars) | Daily Thiruvalluvar Salai vazhiya dhaan poren. Nuisance by Garbage Tractor/Truck problem oru maasama irukku, yaarum kandukala. Kuppai vandi ... (293 chars) |
| $.rejected | (absent) | null |

### officerA POST /api/officer/grievances/INC-20261106-0B725B/report (report, send, not severe no grant)

Session writes, id 269b007250906edc, 229 bytes to 88 bytes.
- status: 428 to 409

| Path | A | B |
|---|---|---|
| $.error | Confirm it's you first. | Only severe grievances go to the Collector. Close this one as done yourself. |
| $.confirm | {object with 4 keys} | (absent) |

### officerA GET /api/officer/grievances/INC-20261106-0B725B

Session writes, id 7e8082e3c566aed5, 1810 bytes to 1853 bytes.

| Path | A | B |
|---|---|---|
| $.grievance.breached | (absent) | 0 |
| $.next | send | close |
| $.sources[0].note | Daily Thiruvalluvar Salai vazhiya dhaan poren. Nuisance by Garbage Tractor/Truck problem oru maasama irukku, yaarum kandukala. Kuppai vandi ... (280 chars) | Daily Thiruvalluvar Salai vazhiya dhaan poren. Nuisance by Garbage Tractor/Truck problem oru maasama irukku, yaarum kandukala. Kuppai vandi ... (293 chars) |
| $.rejected | (absent) | null |

### collector GET /api/collector/incidents/INC-20261106-0B725B

Session writes, id 5d702f323c8812fc, 3837 bytes to 3955 bytes.

| Path | A | B |
|---|---|---|
| $.incident.status | Under review | Assigned |
| $.incident.officer_step | (absent) | approve |
| $.officerStep | (absent) | {object with 3 keys} |

### officerA GET /api/officer/grievances/INC-20261106-707839

Session writes, id 77e5779de1b08c9d, 2097 bytes to 2126 bytes.

| Path | A | B |
|---|---|---|
| $.grievance.breached | (absent) | 0 |
| $.rejected | (absent) | null |

### collector GET /api/collector/incidents/INC-20261106-707839

Session writes, id 2f4592c4f4b13db0, 4219 bytes to 4258 bytes.

| Path | A | B |
|---|---|---|
| $.incident.officer_step | (absent) | null |
| $.officerStep | (absent) | null |

### officerA POST /api/officer/grievances/INC-20261106-31532C/report (another department's case no grant)

Session writes, id cae0d4e9caa5aaf9, 229 bytes to 51 bytes.
- status: 428 to 404

| Path | A | B |
|---|---|---|
| $.error | Confirm it's you first. | Grievance not found in your department. |
| $.confirm | {object with 4 keys} | (absent) |

### officerA GET /api/officer/grievances?tab=new

Session writes, id 4696714d53061258, 5154 bytes to 5258 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerA GET /api/officer/grievances?tab=action

Session writes, id 451c2f67b37e04a1, 5085 bytes to 5218 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 1 |
| $.rows[1].id | INC-20261102-8EC358 | INC-20261103-8989A6 |
| $.rows[1].title | Garbage at the dumping ground is burning since last Monday | Huge garbage dump near Murugan Temple bus stop, not cleared for two weeks now |
| $.rows[1].zone | 9 | 11 |
| $.rows[1].zone_name | Teynampet | Valasaravakkam |
| $.rows[1].ward | 125 | 148 |
| $.rows[1].taluk | TLK-MYL | TLK-MBM |
| $.rows[1].loc | Vedantha Desigar Street, R.K.Mutt Road, Mylapore | Thirumalai Street Meenashi Nagar, Thirumalai Nagar, Nerkundram |
| $.rows[1].lat | 13.033772 | 13.0552512 |
| $.rows[1].lon | 80.2715343 | 80.1812026 |
| $.rows[1].sev | Medium | High |
| $.rows[1].status | In progress | Awaiting verification |
| $.rows[1].complaints | 2 | 1 |
| $.rows[1].officer | null | Zonal Officer, Valasaravakkam |
| $.rows[1].t | 2026-11-02 10:29:00 | 2026-11-03 08:45:00 |
| $.rows[1].updated | 2026-11-05 11:05:00 | 2026-11-06 12:25:00 |
| $.rows[1].due_at | 2026-11-04 10:29:00 | 2026-11-04 08:45:00 |
| $.rows[1].breached | (absent) | 1 |
| $.rows[2].id | INC-20261030-158A1B | INC-20261102-8EC358 |
| $.rows[2].title | Improper Sweeping: the problem on Krishna Nagar Vinayagar Nagar has continued for the last 8 days | Garbage at the dumping ground is burning since last Monday |
| $.rows[2].zone | 7 | 9 |
| $.rows[2].zone_name | Ambattur | Teynampet |
| $.rows[2].ward | 84 | 125 |
| $.rows[2].taluk | TLK-AMB | TLK-MYL |
| $.rows[2].loc | Krishna Nagar Vinayagar Nagar, Gurusami Nagar, Pattaravakkam | Vedantha Desigar Street, R.K.Mutt Road, Mylapore |

...and 84 more paths (see the JSON file).

### officerA GET /api/officer/grievances?tab=sent

Session writes, id 2b8dd7c0ee8764d4, 5237 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.rows.length | 8 | 0 |
| $.rows[0] | {object with 25 keys} | (absent) |
| $.rows[1] | {object with 25 keys} | (absent) |
| $.rows[2] | {object with 25 keys} | (absent) |
| $.rows[3] | {object with 25 keys} | (absent) |
| $.rows[4] | {object with 25 keys} | (absent) |
| $.rows[5] | {object with 25 keys} | (absent) |
| $.rows[6] | {object with 25 keys} | (absent) |
| $.rows[7] | {object with 25 keys} | (absent) |
| $.total | 17 | 0 |

### officerA GET /api/officer/grievances?tab=verified

Session writes, id c17c6609e4007194, 5076 bytes to 5180 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 1 |
| $.rows[1].breached | (absent) | 1 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 1 |
| $.rows[6].breached | (absent) | 1 |
| $.rows[7].breached | (absent) | 1 |

### officerA GET /api/officer/grievances?tab=all

Session writes, id 39d40b4e83cd747b, 5012 bytes to 5116 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].breached | (absent) | 0 |
| $.rows[1].breached | (absent) | 0 |
| $.rows[2].breached | (absent) | 0 |
| $.rows[3].breached | (absent) | 0 |
| $.rows[4].breached | (absent) | 0 |
| $.rows[5].breached | (absent) | 0 |
| $.rows[6].breached | (absent) | 0 |
| $.rows[7].breached | (absent) | 0 |

### officerA GET /api/officer/overview

Session writes, id aa11adf02a83df15, 156711 bytes to 157370 bytes.

| Path | A | B |
|---|---|---|
| $.periodInfo.resolved | (absent) | Resolved, last 30 days |
| $.counts.action | 38 | 55 |
| $.counts.sent | 17 | 0 |
| $.oldest.breached | (absent) | 1 |
| $.map.pins[1].stage | sent | action |
| $.map.pins[14].stage | sent | action |
| $.map.pins[16].stage | sent | action |
| $.map.pins[17].stage | sent | action |
| $.map.pins[18].stage | sent | action |
| $.map.pins[19].stage | sent | action |
| $.map.pins[20].stage | sent | action |
| $.map.pins[23].stage | sent | action |
| $.map.pins[24].stage | sent | action |
| $.map.pins[28].stage | sent | action |
| $.map.pins[49].stage | sent | action |
| $.map.pins[52].stage | sent | action |
| $.map.pins[65].stage | sent | action |
| $.map.pins[66].stage | sent | action |
| $.map.pins[67].stage | sent | action |
| $.map.pins[72].stage | sent | action |
| $.map.pins[82].stage | sent | action |
| $.news[0].breached | (absent) | 0 |
| $.news[1].breached | (absent) | 0 |
| $.news[2].stage | sent | action |
| $.news[2].breached | (absent) | 1 |

...and 124 more paths (see the JSON file).

### collector POST /api/collector/assistant/chat

Session writes, id 6b492538a400ab73, 4545 bytes to 4545 bytes.

| Path | A | B |
|---|---|---|
| $[5].data.datasets[0].rows[1].open | 97 | 96 |

### collector GET /api/collector/assistant/sessions/<uuid-1>

Session writes, id f81a7f50f4a43268, 4502 bytes to 4502 bytes.

| Path | A | B |
|---|---|---|
| $.messages[1].card.datasets[0].rows[1].open | 97 | 96 |

### collector GET /api/collector/studio/<dataset-1>?export=csv

Session writes, id d7a191781f17de43, 30438 bytes to 185 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="Fever_dengue_surveillance_sample_cleaned.csv" to null

| Path | A | B |
|---|---|---|
| $.lines | 401 | 1 |
| $.line[1] | ﻿Week Ending,Hospital,Area,Fever Cases,Dengue Suspected,Dengue Confirmed,Admitted,Zone (matched),Ward (matched),Taluk (matched),Place (match... (143 chars) | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download dataset <dataset-1> as a CSV file"... (185 chars) |
| $.line[2] | 2026-04-18,UPHC Velachery,Velachery,21,2,1,1,13,179,TLK-VLC,Velachery | (absent) |
| $.line[3] | 2026-04-18,"Govt Peripheral Hospital, Anna Nagar",Anna Nagar,44,7,2,3,8,,TLK-AMJ,Anna Nagar | (absent) |
| $.line[4] | 2026-04-18,RSRM Hospital,Royapuram,42,6,2,4,5,,TLK-TDP,Royapuram | (absent) |
| $.line[5] | 2026-04-18,UPHC Saidapet,Saidapet,36,6,3,2,10,142,TLK-GND,Saidapet | (absent) |
| $.line[6] | 2026-04-18,"Govt Peripheral Hospital, K.K. Nagar",K.K. Nagar,29,6,2,2,10,131,TLK-MBM,K.K. Nagar | (absent) |
| $.line[7] | 2026-04-18,UPHC Perungudi,Perungudi,22,3,1,2,14,,TLK-VLC,Perungudi | (absent) |
| $.line[8] | 2026-04-18,UPHC Mylapore,Mylapore,17,2,1,1,9,124,TLK-MYL,Mylapore | (absent) |
| $.line[9] | 2026-04-18,"Govt Hospital, Tondiarpet",Tondiarpet,35,4,1,4,4,,TLK-TDP,Tondiarpet | (absent) |
| $.line[10] | 2026-04-18,UPHC Kodambakkam,Kodambakkam,31,5,2,2,10,,TLK-MBM,Kodambakkam | (absent) |
| $.line[11] | 2026-04-18,UPHC Adyar,Adyar,20,3,1,1,13,,TLK-VLC,Adyar | (absent) |
| $.line[12] | 2026-04-18,"Govt Peripheral Hospital, Periyar Nagar",Perambur,21,2,1,2,6,70,TLK-PRB,Perambur | (absent) |
| $.line[13] | 2026-04-18,UPHC Sholinganallur,Sholinganallur,14,1,0,1,15,,TLK-SHN,Sholinganallur | (absent) |
| $.line[14] | 2026-04-18,UPHC Thiruvottiyur,Thiruvottiyur,28,4,1,2,1,,TLK-TVT,Thiruvottiyur | (absent) |
| $.line[15] | 2026-04-18,UPHC Ambattur,Ambattur,23,3,1,2,7,,TLK-AMB,Ambattur | (absent) |
| $.line[16] | 2026-04-18,UPHC Alandur,Alandur,42,6,2,3,12,,TLK-ALD,Alandur | (absent) |
| $.line[17] | 2026-04-18,UPHC Valasaravakkam,Valasaravakkam,23,3,1,2,11,,TLK-MDR,Valasaravakkam | (absent) |
| $.line[18] | 2026-04-25,UPHC Velachery,Velachery,17,2,1,2,13,179,TLK-VLC,Velachery | (absent) |
| $.line[19] | 2026-04-25,"Govt Peripheral Hospital, Anna Nagar",Anna Nagar,47,11,5,4,8,,TLK-AMJ,Anna Nagar | (absent) |
| $.line[20] | 2026-04-25,RSRM Hospital,Royapuram,44,7,3,3,5,,TLK-TDP,Royapuram | (absent) |
| $.line[21] | 2026-04-25,UPHC Saidapet,Saidapet,38,6,2,3,10,142,TLK-GND,Saidapet | (absent) |
| $.line[22] | 2026-04-25,"Govt Peripheral Hospital, K.K. Nagar",K.K. Nagar,39,6,2,4,10,131,TLK-MBM,K.K. Nagar | (absent) |
| $.line[23] | 2026-04-25,UPHC Perungudi,Perungudi,29,4,2,3,14,,TLK-VLC,Perungudi | (absent) |
| $.line[24] | 2026-04-25,UPHC Mylapore,Mylapore,17,2,1,2,9,124,TLK-MYL,Mylapore | (absent) |

...and 377 more paths (see the JSON file).

### collector GET /api/collector/studio/<dataset-1>?export=xlsx

Session writes, id be094a0c735be649, 167267 bytes to 188 bytes.
- status: 200 to 428
- type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet to application/json
- disposition: attachment; filename="Fever_dengue_surveillance_sample_cleaned.xlsx" to null

| Path | A | B |
|---|---|---|
| $.lines | 32 | 1 |
| $.line[1] | PK         �a<'B  B     xl/_rels/workbook.xml.rels<?xml version="1.0" encoding="UTF-8" standalone="yes"?> | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download dataset <dataset-1> as an Excel fi... (188 chars) |
| $.line[2] | <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlform... (881 chars) | (absent) |
| $.line[3] | <a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:... (7619 chars) | (absent) |
| $.line[4] | <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/200... (1152 chars) | (absent) |
| $.line[5] | <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/... (150105 chars) | (absent) |
| $.line[6] | <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/... (1330 chars) | (absent) |
| $.line[7] | <metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xlrd="http://schemas.microsoft.com/office/spreadsheetml/20... (233 chars) | (absent) |
| $.line[8] |   <metadataTypes count="1"> | (absent) |
| $.line[9] |     <metadataType name="XLDAPR" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" ... (211 chars) | (absent) |
| $.line[10] |   </metadataTypes> | (absent) |
| $.line[11] |   <futureMetadata name="XLDAPR" count="1"> | (absent) |
| $.line[12] |     <bk> | (absent) |
| $.line[13] |       <extLst> | (absent) |
| $.line[14] |         <ext uri="{<uuid-1>}"> | (absent) |
| $.line[15] |           <xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/> | (absent) |
| $.line[16] |         </ext> | (absent) |
| $.line[17] |       </extLst> | (absent) |
| $.line[18] |     </bk> | (absent) |
| $.line[19] |   </futureMetadata> | (absent) |
| $.line[20] |   <cellMetadata count="1"> | (absent) |
| $.line[21] |     <bk> | (absent) |
| $.line[22] |       <rc t="1" v="0"/> | (absent) |
| $.line[23] |     </bk> | (absent) |
| $.line[24] |   </cellMetadata> | (absent) |

...and 8 more paths (see the JSON file).

### collector GET /api/collector/studio/<dataset-1>?f=[{"col"%3A"c0"%2C"op"%3A"neq"%2C"values"%3A["no such value"]}]&export=csv

Session writes, id a91af3219ee7b0a3, 30438 bytes to 185 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="Fever_dengue_surveillance_sample_cleaned.csv" to null

| Path | A | B |
|---|---|---|
| $.lines | 401 | 1 |
| $.line[1] | ﻿Week Ending,Hospital,Area,Fever Cases,Dengue Suspected,Dengue Confirmed,Admitted,Zone (matched),Ward (matched),Taluk (matched),Place (match... (143 chars) | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download dataset <dataset-1> as a CSV file"... (185 chars) |
| $.line[2] | 2026-04-18,UPHC Velachery,Velachery,21,2,1,1,13,179,TLK-VLC,Velachery | (absent) |
| $.line[3] | 2026-04-18,"Govt Peripheral Hospital, Anna Nagar",Anna Nagar,44,7,2,3,8,,TLK-AMJ,Anna Nagar | (absent) |
| $.line[4] | 2026-04-18,RSRM Hospital,Royapuram,42,6,2,4,5,,TLK-TDP,Royapuram | (absent) |
| $.line[5] | 2026-04-18,UPHC Saidapet,Saidapet,36,6,3,2,10,142,TLK-GND,Saidapet | (absent) |
| $.line[6] | 2026-04-18,"Govt Peripheral Hospital, K.K. Nagar",K.K. Nagar,29,6,2,2,10,131,TLK-MBM,K.K. Nagar | (absent) |
| $.line[7] | 2026-04-18,UPHC Perungudi,Perungudi,22,3,1,2,14,,TLK-VLC,Perungudi | (absent) |
| $.line[8] | 2026-04-18,UPHC Mylapore,Mylapore,17,2,1,1,9,124,TLK-MYL,Mylapore | (absent) |
| $.line[9] | 2026-04-18,"Govt Hospital, Tondiarpet",Tondiarpet,35,4,1,4,4,,TLK-TDP,Tondiarpet | (absent) |
| $.line[10] | 2026-04-18,UPHC Kodambakkam,Kodambakkam,31,5,2,2,10,,TLK-MBM,Kodambakkam | (absent) |
| $.line[11] | 2026-04-18,UPHC Adyar,Adyar,20,3,1,1,13,,TLK-VLC,Adyar | (absent) |
| $.line[12] | 2026-04-18,"Govt Peripheral Hospital, Periyar Nagar",Perambur,21,2,1,2,6,70,TLK-PRB,Perambur | (absent) |
| $.line[13] | 2026-04-18,UPHC Sholinganallur,Sholinganallur,14,1,0,1,15,,TLK-SHN,Sholinganallur | (absent) |
| $.line[14] | 2026-04-18,UPHC Thiruvottiyur,Thiruvottiyur,28,4,1,2,1,,TLK-TVT,Thiruvottiyur | (absent) |
| $.line[15] | 2026-04-18,UPHC Ambattur,Ambattur,23,3,1,2,7,,TLK-AMB,Ambattur | (absent) |
| $.line[16] | 2026-04-18,UPHC Alandur,Alandur,42,6,2,3,12,,TLK-ALD,Alandur | (absent) |
| $.line[17] | 2026-04-18,UPHC Valasaravakkam,Valasaravakkam,23,3,1,2,11,,TLK-MDR,Valasaravakkam | (absent) |
| $.line[18] | 2026-04-25,UPHC Velachery,Velachery,17,2,1,2,13,179,TLK-VLC,Velachery | (absent) |
| $.line[19] | 2026-04-25,"Govt Peripheral Hospital, Anna Nagar",Anna Nagar,47,11,5,4,8,,TLK-AMJ,Anna Nagar | (absent) |
| $.line[20] | 2026-04-25,RSRM Hospital,Royapuram,44,7,3,3,5,,TLK-TDP,Royapuram | (absent) |
| $.line[21] | 2026-04-25,UPHC Saidapet,Saidapet,38,6,2,3,10,142,TLK-GND,Saidapet | (absent) |
| $.line[22] | 2026-04-25,"Govt Peripheral Hospital, K.K. Nagar",K.K. Nagar,39,6,2,4,10,131,TLK-MBM,K.K. Nagar | (absent) |
| $.line[23] | 2026-04-25,UPHC Perungudi,Perungudi,29,4,2,3,14,,TLK-VLC,Perungudi | (absent) |
| $.line[24] | 2026-04-25,UPHC Mylapore,Mylapore,17,2,1,2,9,124,TLK-MYL,Mylapore | (absent) |

...and 377 more paths (see the JSON file).

### officerA GET /api/auth/security

Session writes, id c5dbb461e719c80f, 815 bytes to 419 bytes.

| Path | A | B |
|---|---|---|
| $.events.length | 4 | 2 |
| $.events[0].detail.summary | Send case INC-20261106-31532C to the Collector for verification | Close case INC-20261106-707839 with your report |
| $.events[1].action | confirm:ok | auth:signin |
| $.events[1].detail.action | officer_report | (absent) |
| $.events[1].detail.summary | Close case INC-20261106-707839 with your report | (absent) |
| $.events[1].detail.ua | (absent) | null |
| $.events[2] | {object with 3 keys} | (absent) |
| $.events[3] | {object with 3 keys} | (absent) |

### collector GET /api/collector/audit

Session writes, id 2990d3c3756b54b5, 63442 bytes to 62288 bytes.

| Path | A | B |
|---|---|---|
| $.log.length | 193 | 189 |
| $.log[0].id | 1000000030 | 1000000026 |
| $.log[1].id | 1000000029 | 1000000025 |
| $.log[2].id | 1000000028 | 1000000024 |
| $.log[3].id | 1000000027 | 1000000023 |
| $.log[4].id | 1000000026 | 1000000022 |
| $.log[5].id | 1000000025 | 1000000021 |
| $.log[6].id | 1000000024 | 1000000020 |
| $.log[7].id | 1000000023 | 1000000019 |
| $.log[8].id | 1000000022 | 1000000018 |
| $.log[9].id | 1000000021 | 1000000017 |
| $.log[10].id | 1000000020 | 1000000016 |
| $.log[11].id | 1000000019 | 1000000015 |
| $.log[11].action | confirm:ok | officer:close |
| $.log[11].table_name | security | officer_steps |
| $.log[11].record_id | 1000000002 | INC-20261106-707839 |
| $.log[11].after_value | {"action":"officer_report","summary":"Send case INC-20261106-31532C to the Collector for verification","factor":"password","ip":"direct"} | {"step_id":1000000003,"step":"close","report_id":1000000001,"photos":1} |
| $.log[12].id | 1000000018 | 1000000014 |
| $.log[12].action | officer:close | confirm:ok |
| $.log[12].table_name | officer_steps | security |
| $.log[12].record_id | INC-20261106-707839 | 1000000002 |
| $.log[12].after_value | {"step_id":1000000003,"step":"close","report_id":1000000001,"photos":1} | {"action":"officer_report","summary":"Close case INC-20261106-707839 with your report","factor":"password","ip":"direct"} |
| $.log[13].id | 1000000017 | 1000000013 |
| $.log[13].action | confirm:ok | officer:approve |
| $.log[13].table_name | security | officer_steps |

...and 839 more paths (see the JSON file).

