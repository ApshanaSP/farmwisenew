# Golden-master diff: lane-c2 to merged

Compared 3272 requests with 3272. **251 changed, 1 added, 1 removed.**

## What differs around the requests

- next_build_id: WZ7JVCj5TpPj-dySCF1pv to So8m3taxH1GV7mmkDXSIV

## By route

| Route | Requests changed | Roles | Status changes | Most changed paths |
|---|---|---|---|---|
| /api/collector/list | 72 | collector | none | $.rows[*].sla_due (728), $.rows[*].overdue (728), $.rows[*].id (23), $.rows[*].title (23), $.rows[*].zone (23) |
| /api/collector/overview | 32 | collector | none | $.severity.rows[*].sla_due (799), $.kpi.series.resolved[*] (311), $.news[*].sla_due (220), $.bell[*].sla_due (162), $.severity.rows[*].why.attention[*] (40) |
| /api/officer/overview | 30 | officerA, officerB | none | $.board.kpi.series.resolved[*] (488), $.board.severity.rows[*].sla_due (439), $.feeds[*].kind (232), $.board.news[*].sla_due (111), $.board.bell[*].sla_due (108) |
| /api/map/ask | 21 | collector | none | $.glance.overdue.ids[*] (5331), $.rows[*].overdue (331), $.brief.depts[*].overdueIds[*] (28), $.glance.overdue.n (19), $.glance.overdue.ids.length (19) |
| /api/collector/insights | 21 | collector | none | $.trends.weekly.lines[*].values[*] (554), $.trends.monthly.lines[*].values[*] (296), $.taluks[*].overdue (156), $.trends.monthly.lines[*].total (149), $.trends.weekly.lines[*].total (147) |
| /api/collector/incidents/[id] | 19 | collector | none | $.incident (19), $.incident.closed_at (2), $.incident.why.attention[*] (2), $.incident.why.why[*] (2), $.incident.status (1) |
| /api/collector/report | 18 | collector | none | $.severity.rows[*].sla_due (544), $.kpi.series.resolved[*] (204), $.news[*].sla_due (155), $.report.attention[*].sla_due (111), $.bell[*].sla_due (94) |
| /api/collector/thunai/agent/round | 17 | collector | none | $.result.stage.blocks[*].points[*].id (64), $.result.stage.blocks[*].points[*].lat (64), $.result.stage.blocks[*].points[*].lon (64), $.result.stage.blocks[*].points[*].label (64), $.result.stage.blocks[*].points[*].sev (52) |
| /api/collector/search | 5 | collector | none | $.incidents[*].sla_due (29) |
| /api/collector/assistant/chat | 5 | collector, officerA | none | $[*].data.datasets[*].rows[*].resolved (13), $[*].data.answerMarkdown (4), $[*].data.voiceSummary (3), $[*].data.kpis[*].value (3), $[*].data.datasets[*].rows[*].overdue (3) |
| /api/collector/export | 4 | collector | none | $.csv (4), $.count (4) |
| /api/collector/thunai/agent | 3 | collector | none | $.result.stage.blocks[*].rows[*].id (12), $.result.stage.blocks[*].rows[*].title (12), $.result.stage.blocks[*].rows[*].sev (12), $.result.stage.blocks[*].rows[*].place (12), $.result.stage.blocks[*].rows[*].ward (12) |
| /api/collector/sources | 1 | collector | none | $.sources[*].generated (12), $.sources[*].status (4) |
| /api/rehearsal/impacts | 1 | collector | none | $.sources[*].kind (1), $.sources[*].note (1) |
| /api/officer/insights | 1 | officerB | none | $.modules[*].kpis[*].value (1), $.modules[*].notes[*] (1) |
| /api/map/send | 1 | collector | none | $.drafts[*].body (1) |

## Added requests

- collector POST /api/collector/thunai/agent/round: 200

## Removed requests

- collector POST /api/collector/thunai/agent/round: 200

## Each changed request

### collector GET /api/collector/incidents/INC-20260926-EB3B79

Session reads, id 4df02c3725c60daa, 6908 bytes to 6908 bytes.

| Path | A | B |
|---|---|---|
| $.incident | (same keys) | (in another order) |

### collector GET /api/collector/incidents/INC-20261106-2AB4CB

Session reads, id 21c8033003bcfa9e, 3458 bytes to 3458 bytes.

| Path | A | B |
|---|---|---|
| $.incident | (same keys) | (in another order) |

### collector GET /api/collector/incidents/INC-20261104-CBCE27

Session reads, id 5ea0f2cbdeb4cfb3, 3813 bytes to 3813 bytes.

| Path | A | B |
|---|---|---|
| $.incident | (same keys) | (in another order) |

### collector GET /api/collector/incidents/INC-20260613-D7B58D

Session reads, id 5d6f915b4c414fe6, 3825 bytes to 3825 bytes.

| Path | A | B |
|---|---|---|
| $.incident | (same keys) | (in another order) |

### collector GET /api/collector/incidents/INC-20261106-31532C

Session reads, id 7f0c4e1982b09f59, 3836 bytes to 3836 bytes.

| Path | A | B |
|---|---|---|
| $.incident | (same keys) | (in another order) |

### collector GET /api/collector/incidents/INC-20261102-02C5CC

Session reads, id 388aa12e7a54e354, 4183 bytes to 4183 bytes.

| Path | A | B |
|---|---|---|
| $.incident | (same keys) | (in another order) |

### collector GET /api/collector/incidents/INC-20260729-DD5997

Session reads, id 0805ff5855183d1f, 3747 bytes to 3747 bytes.

| Path | A | B |
|---|---|---|
| $.incident | (same keys) | (in another order) |

### collector GET /api/collector/incidents/INC-20260731-09AF14

Session reads, id 8d26e1a7cdf9f943, 2828 bytes to 2828 bytes.

| Path | A | B |
|---|---|---|
| $.incident | (same keys) | (in another order) |

### collector GET /api/collector/incidents/INC-20261030-2B40AF

Session reads, id a4fd04cd7eaede36, 3411 bytes to 3411 bytes.

| Path | A | B |
|---|---|---|
| $.incident | (same keys) | (in another order) |

### collector GET /api/collector/incidents/INC-20261004-752FF2

Session reads, id 2c0abde36482cb1b, 3318 bytes to 3318 bytes.

| Path | A | B |
|---|---|---|
| $.incident | (same keys) | (in another order) |

### collector GET /api/collector/incidents/INC-20261103-17A0B9

Session reads, id 84eb0552a2101135, 3762 bytes to 3762 bytes.

| Path | A | B |
|---|---|---|
| $.incident | (same keys) | (in another order) |

### collector GET /api/collector/incidents/INC-20261026-384CFF

Session reads, id bc3e9db0ffc3788f, 4635 bytes to 4635 bytes.

| Path | A | B |
|---|---|---|
| $.incident | (same keys) | (in another order) |

### collector GET /api/collector/list

Session reads, id 92c0f3216614a7bd, 15908 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 17:16:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?cat=SOLID_WASTE

Session reads, id 316d433d2d5fe910, 15917 bytes to 16493 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-09 17:02:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-08 16:31:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-08 13:18:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-08 11:22:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 10:59:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-09 09:23:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-08 08:45:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-09 08:25:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-09 08:23:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-09 08:07:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-08 08:04:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?cat=DARK_SPOT_SAFETY

Session reads, id 4a1d78c14c209afb, 2777 bytes to 2873 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-13 10:07:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-13 08:06:00 |
| $.rows[1].overdue | (absent) | false |

### collector GET /api/collector/list?cat=FOOD_SAFETY

Session reads, id a59eb3d669447d50, 2752 bytes to 2848 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-16 09:37:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-12 20:58:00 |
| $.rows[1].overdue | (absent) | false |

### collector GET /api/collector/list?cat=PUBLIC_ORDER

Session reads, id bb0dd24b6b45180e, 7418 bytes to 7706 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-08 13:02:13 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-07 11:55:13 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-07 10:22:41 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-07 21:50:43 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-07 19:31:24 |
| $.rows[5].overdue | (absent) | false |

### collector GET /api/collector/list?cat=FLOOD_RELIEF

Session reads, id 68be18beff790611, 4013 bytes to 4157 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-07 10:59:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-06 21:42:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-06 19:08:00 |
| $.rows[2].overdue | (absent) | false |

### collector GET /api/collector/list?dept=GCC-SWM

Session reads, id 2bb93857a493d6c0, 16079 bytes to 16655 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-09 17:02:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-08 13:18:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-08 11:22:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-09 09:23:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-08 08:45:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-09 08:25:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-09 08:23:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-09 08:07:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-08 08:04:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-08 07:25:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-08 07:16:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?dept=GCC-ELE

Session reads, id 4bd160d801037be8, 17304 bytes to 17880 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-07 16:46:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-08 16:35:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-10 15:40:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-08 14:46:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-08 13:42:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-08 12:46:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-10 10:04:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-10 09:41:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-10 09:10:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-08 08:11:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-08 07:03:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-10 06:43:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?dept=POL-GCP

Session reads, id e012e5214733f5c8, 14523 bytes to 15099 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-13 16:43:38 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-07 16:03:03 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-09 15:59:35 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 21:54:11 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-07 15:27:22 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-06 20:33:29 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-09 14:11:04 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-06 19:53:54 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?dept=not+a+dept

Session reads, id 64f7392c82bb56d6, 15908 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 17:16:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?dir=1

Session reads, id 7e9a2e8dfaee6ea1, 16470 bytes to 17045 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-06 00:17:21 |
| $.rows[0].overdue | (absent) | true |
| $.rows[1].sla_due | (absent) | 2026-11-08 18:23:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-06 18:23:56 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-12 18:37:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-07 18:38:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-06 18:41:09 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-08 18:44:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 18:45:28 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-06 18:48:50 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-25 18:49:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-12-05 18:51:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-06 19:03:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?page=1

Session reads, id cb79a42eee05dd02, 16154 bytes to 16730 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-16 17:06:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-09 17:02:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-13 16:53:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-07 16:46:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-13 16:43:38 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-13 16:38:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-08 16:35:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-13 16:31:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-08 16:31:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-16 16:13:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-07 16:03:03 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-11 16:00:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?period=daily

Session reads, id bf89cf4f65c26ff3, 15908 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 17:16:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?period=weekly

Session reads, id 3dc78319781759f5, 15910 bytes to 16486 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 17:16:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?period=monthly

Session reads, id 73e18d7c81ae0c7d, 15911 bytes to 16487 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 17:16:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?period=quarterly

Session reads, id d3be032ceed0cb71, 15913 bytes to 16489 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 17:16:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?period=bogus

Session reads, id c9cde797d32f826b, 15908 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 17:16:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?place=unlocated

Session reads, id 85552d7278baa875, 6007 bytes to 6247 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-07 01:00:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-07 09:07:25 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-09 06:47:38 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-06 22:31:45 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-06 21:27:00 |
| $.rows[4].overdue | (absent) | false |

### collector GET /api/collector/list?place=nozone

Session reads, id 8f74daca77a1af6f, 3599 bytes to 3743 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-07 01:00:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-09 06:47:38 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-06 22:31:45 |
| $.rows[2].overdue | (absent) | false |

### collector GET /api/collector/list?place=notaluk

Session reads, id b2cd6b30ead4a988, 3599 bytes to 3743 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-07 01:00:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-09 06:47:38 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-06 22:31:45 |
| $.rows[2].overdue | (absent) | false |

### collector GET /api/collector/list?q=Adyar

Session reads, id 3c2f891f388dbd39, 15890 bytes to 16466 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-13 16:31:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-07 16:03:03 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-09 15:59:35 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-12-06 15:18:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-13 15:12:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-11 13:58:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-11 13:33:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-09 13:13:14 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-09 10:59:01 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-10 09:41:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-10 09:10:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?q=garbage

Session reads, id 598d1f85747dd279, 15917 bytes to 16493 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-09 17:02:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-08 16:31:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-08 13:18:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-08 11:22:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 10:59:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-09 09:23:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-08 08:45:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-09 08:25:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-09 08:23:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-09 08:07:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-08 08:04:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?q=kuppai

Session reads, id 1b0fa387504c0f23, 4062 bytes to 4206 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-08 11:22:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-08 08:45:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-08 21:51:00 |
| $.rows[2].overdue | (absent) | false |

### collector GET /api/collector/list?q=குப்பை

Session reads, id ae0c07b76616ca98, 1543 bytes to 1591 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-08 08:04:00 |
| $.rows[0].overdue | (absent) | false |

### collector GET /api/collector/list?q=x

Session reads, id dbb6ec592c9dc08e, 16409 bytes to 16984 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-08 17:45:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-12-06 15:41:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-12-06 15:18:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-07 15:16:20 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-12-06 14:31:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-12-06 12:25:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-12-06 11:44:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-26 11:13:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-07 10:59:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-06 12:42:54 |
| $.rows[11].overdue | (absent) | true |

### collector GET /api/collector/list?scope=all

Session reads, id b5fc96e7e9b58a3b, 15914 bytes to 16490 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 17:16:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?scope=30d

Session reads, id a7a3af80f3730fbf, 15911 bytes to 16487 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 17:16:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?sev=Severe

Session reads, id 71207e97504b091d, 13009 bytes to 13432 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-06 12:42:54 |
| $.rows[0].overdue | (absent) | true |
| $.rows[1].sla_due | (absent) | 2026-11-06 11:59:00 |
| $.rows[1].overdue | (absent) | true |
| $.rows[2].sla_due | (absent) | 2026-11-06 06:56:22 |
| $.rows[2].overdue | (absent) | true |
| $.rows[3].sla_due | (absent) | 2026-11-06 05:41:50 |
| $.rows[3].overdue | (absent) | true |
| $.rows[4].sla_due | (absent) | 2026-11-06 04:43:54 |
| $.rows[4].overdue | (absent) | true |
| $.rows[5].sla_due | (absent) | 2026-11-06 03:13:47 |
| $.rows[5].overdue | (absent) | true |
| $.rows[6].sla_due | (absent) | 2026-11-06 03:13:06 |
| $.rows[6].overdue | (absent) | true |
| $.rows[7].sla_due | (absent) | 2026-11-06 02:51:43 |
| $.rows[7].overdue | (absent) | true |
| $.rows[8].sla_due | (absent) | 2026-11-06 02:48:55 |
| $.rows[8].overdue | (absent) | true |

### collector GET /api/collector/list?sev=High

Session reads, id 5a015025073f2be2, 15211 bytes to 15787 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-07 16:46:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 21:54:11 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-07 15:16:20 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-06 20:33:29 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-06 19:53:54 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-06 19:52:30 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-07 01:00:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?sev=Medium

Session reads, id 06f7a814e9b313fe, 16272 bytes to 16848 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:03:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-08 17:45:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-09 17:16:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-13 16:53:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-08 16:35:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-13 16:31:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-08 16:31:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-07 16:03:03 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-11 16:00:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 15:59:35 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?sev=Low

Session reads, id c1e487225451d842, 15779 bytes to 16355 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-16 17:06:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 17:02:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-13 16:43:38 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-13 16:38:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-16 16:13:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-12-06 15:41:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-10 15:40:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-12-06 15:18:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?sev=bogus

Session reads, id 13093d57a1113c1f, 15908 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 17:16:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?sort=sev

Session reads, id ea66ca791f752577, 15782 bytes to 16358 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-16 17:06:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 17:02:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-13 16:43:38 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-13 16:38:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-16 16:13:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-12-06 15:41:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-10 15:40:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-12-06 15:18:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?sort=c

Session reads, id b1a12289ae303cdd, 16835 bytes to 17410 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-07 08:41:55 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-06 11:59:00 |
| $.rows[1].overdue | (absent) | true |
| $.rows[2].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-09 17:16:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-16 17:06:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 17:02:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?sort=r

Session reads, id 562a3a76481eb0a0, 15715 bytes to 16291 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-09 14:11:04 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-08 12:46:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-07 10:59:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-16 10:23:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-13 09:46:40 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-13 09:14:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-10 09:03:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-12-06 07:22:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-08 07:16:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-09 03:52:58 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-16 00:32:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?sort=d

Session reads, id 6cd5b11c893dd3c8, 17307 bytes to 17883 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-07 16:46:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-08 16:35:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-10 15:40:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-08 14:46:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-08 13:42:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-08 12:46:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-10 10:04:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-10 09:41:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-10 09:10:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-08 08:11:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-08 07:03:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-10 06:43:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?status=open

Session reads, id b790513fbc8014b2, 15908 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 17:16:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?status=unverified

Session reads, id dce8008690f770eb, 16203 bytes to 16779 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-09 18:03:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-09 17:16:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-16 17:06:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 17:02:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?status=verified

Session reads, id 7410c49dd3e4c6e4, 14592 bytes to 15168 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-07 16:03:03 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-09 15:59:35 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-06 21:54:11 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-07 15:27:22 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 20:33:29 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-09 14:11:04 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-06 19:53:54 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-06 19:52:30 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 13:50:31 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?status=critical

Session reads, id fb9bb38951c11ca3, 5871 bytes to 6059 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-06 05:41:50 |
| $.rows[0].overdue | (absent) | true |
| $.rows[1].sla_due | (absent) | 2026-11-06 04:43:54 |
| $.rows[1].overdue | (absent) | true |
| $.rows[2].sla_due | (absent) | 2026-11-06 03:13:47 |
| $.rows[2].overdue | (absent) | true |
| $.rows[3].sla_due | (absent) | 2026-11-06 02:48:55 |
| $.rows[3].overdue | (absent) | true |

### collector GET /api/collector/list?status=overdue

Session reads, id d3ab709c8bb22c07, 15942 bytes to 16032 bytes.

| Path | A | B |
|---|---|---|
| $.rows.length | 11 | 12 |
| $.rows[0].id | INC-20261106-A40AD7 | INC-20261106-E43C6B |
| $.rows[0].title | 'Stabbed 10 times': Chennai man kills wife with kitchen knife, surrenders | Two injured as SUV crashes near Royapettah Government Hospital |
| $.rows[0].type | Violent crime | Road accident |
| $.rows[0].cat_code | CRIME_VIOLENT | ROAD_ACCIDENT |
| $.rows[0].family | CRIME | ROADS_TRAFFIC |
| $.rows[0].zone | 15 | 9 |
| $.rows[0].zone_name | Sholinganallur | Teynampet |
| $.rows[0].ward | 192 | 119 |
| $.rows[0].loc | Neelankarai | Royapettah |
| $.rows[0].lat | 12.949 | 13.051795 |
| $.rows[0].lon | 80.259 | 80.263455 |
| $.rows[0].status | Open | In progress |
| $.rows[0].verified | 0 | 1 |
| $.rows[0].outlets | 3 | 0 |
| $.rows[0].sources | news | police |
| $.rows[0].channels | media | control_room_112\|fir_walk_in |
| $.rows[0].t | 2026-11-06 09:47:24 | 2026-11-06 11:37:16 |
| $.rows[0].summary | 2 reports (News) about violent crime at Neelankarai, Ward 192 (Sholinganallur). First reported 06 Nov 09:47. Status: open. | 2 reports (Police 112, Police FIR) about road accident at Royapettah, Ward 119 (Teynampet). First reported 06 Nov 11:37. Status: in progress... (141 chars) |
| $.rows[0].priority | 102 | 56 |
| $.rows[0].breached | 1 | 0 |
| $.rows[0].hours_open | 8.3 | 6.5 |
| $.rows[0].severity_reasons | Violent crime (+55); Affects hospital, worship (+16); Capped at High until a department or officer confirms it | Road Accident (+35); 2 injured (+16) |
| $.rows[0].priority_reasons | High violent crime (69); response past the 6 h target; not yet verified by an officer; affects hospital, worship; covered by 2 news outlets;... (188 chars) | High road accident (51); 4 similar incidents here in 90 days |
| $.rows[0].attention_reason | Only in the news |  |

...and 360 more paths (see the JSON file).

### collector GET /api/collector/list?status=Open

Session reads, id 02c0953b05797381, 15143 bytes to 15719 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-09 18:03:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-08 17:45:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-13 16:43:38 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-07 16:03:03 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 15:59:35 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?status=Under+review

Session reads, id 2551c4cc475b8fce, 16879 bytes to 17455 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-09 17:16:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-16 17:06:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 17:02:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-13 16:53:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-07 16:46:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-13 16:38:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-08 16:35:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-13 16:31:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-08 16:31:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?status=Assigned

Session reads, id 9ae0e7c672fece3d, 15797 bytes to 16373 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-16 10:23:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 10:14:39 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-16 10:04:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-09 09:23:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-10 09:10:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-10 01:42:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-11 01:26:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-10 22:12:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-08 21:51:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-08 21:09:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-12-05 20:56:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-10 20:37:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?status=In+progress

Session reads, id 3d8b428b7d3ce1ff, 15662 bytes to 16237 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-07 15:27:22 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-09 13:50:31 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-08 13:02:13 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-07 00:43:15 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-07 11:55:13 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 17:37:16 |
| $.rows[6].overdue | (absent) | true |
| $.rows[7].sla_due | (absent) | 2026-11-07 10:22:41 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-07 10:18:19 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-09 09:08:39 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-07 08:41:55 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-08 08:11:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?status=Resolved

Session reads, id 2729d06095cb563f, 4023 bytes to 16154 bytes.

| Path | A | B |
|---|---|---|
| $.rows.length | 3 | 12 |
| $.rows[0].sla_due | (absent) | 2026-11-06 23:14:17 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-08 21:11:20 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-06 02:51:43 |
| $.rows[2].overdue | (absent) | true |
| $.rows[3] | (absent) | {object with 45 keys} |
| $.rows[4] | (absent) | {object with 45 keys} |
| $.rows[5] | (absent) | {object with 45 keys} |
| $.rows[6] | (absent) | {object with 45 keys} |
| $.rows[7] | (absent) | {object with 45 keys} |
| $.rows[8] | (absent) | {object with 45 keys} |
| $.rows[9] | (absent) | {object with 45 keys} |
| $.rows[10] | (absent) | {object with 45 keys} |
| $.rows[11] | (absent) | {object with 45 keys} |
| $.total | 3 | 173 |
| $.incidents | 3 | 175 |
| $.complaints | 0 | 93 |

### collector GET /api/collector/list?status=bogus

Session reads, id 064e0fa86266673a, 15908 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 17:16:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?taluk=TLK-MYL

Session reads, id 0c9e21ba4606c68a, 16508 bytes to 17083 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-13 16:53:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-13 16:38:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-13 14:16:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-20 12:45:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-06 17:37:16 |
| $.rows[5].overdue | (absent) | true |
| $.rows[6].sla_due | (absent) | 2026-11-26 11:13:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-09 10:59:01 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-16 08:51:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-07 08:41:55 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-09 08:23:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 08:07:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?taluk=TLK-SHN

Session reads, id 64a695da27549caa, 13639 bytes to 14117 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-13 14:20:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-11 11:11:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-06 15:47:24 |
| $.rows[3].overdue | (absent) | true |
| $.rows[4].sla_due | (absent) | 2026-11-11 09:38:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 09:23:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-09 07:13:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-10 22:12:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-06 03:13:47 |
| $.rows[8].overdue | (absent) | true |
| $.rows[9].sla_due | (absent) | 2026-11-06 18:41:09 |
| $.rows[9].overdue | (absent) | false |

### collector GET /api/collector/list?taluk=TLK-MDR

Session reads, id e29402db83336acb, 15816 bytes to 16392 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 17:06:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-09 14:11:04 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-08 12:46:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-16 10:23:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-13 09:46:40 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-13 09:14:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-10 09:03:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-08 07:16:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-09 03:52:58 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-09 21:53:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-06 21:28:32 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?taluk=TLK-AYN

Session reads, id b2f3480db7448ae6, 11990 bytes to 12422 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-13 16:43:38 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-08 16:35:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-08 16:31:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-07 15:27:22 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-07 10:22:41 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-08 21:51:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-09 20:59:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-10 20:54:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-08 18:44:00 |
| $.rows[8].overdue | (absent) | false |

### collector GET /api/collector/list?zone=5

Session reads, id 9040397c6ff0d296, 16183 bytes to 16759 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-08 17:45:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-13 15:18:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-08 13:42:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-16 10:04:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-07 09:07:25 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-08 08:45:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-09 08:25:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-08 08:11:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-10 01:42:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-11 01:26:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-08 23:23:57 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?zone=13

Session reads, id c9be462ce57fca6a, 16001 bytes to 16577 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-13 16:31:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-07 16:03:03 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-09 15:59:35 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-12-06 15:18:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-13 15:12:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-11 13:58:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-11 13:33:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-09 13:13:14 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-10 09:41:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-10 09:10:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 09:08:39 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?zone=1

Session reads, id 7e54b0adc5291374, 7757 bytes to 8044 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 17:02:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-20 14:14:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-08 13:02:13 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-06 06:56:22 |
| $.rows[3].overdue | (absent) | true |
| $.rows[4].sla_due | (absent) | 2026-11-08 23:51:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-12-05 20:56:00 |
| $.rows[5].overdue | (absent) | false |

### collector GET /api/collector/list?zone=8

Session reads, id ee020434b2ab372b, 15008 bytes to 15582 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-13 16:43:38 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-08 16:31:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-06 21:54:11 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-06 20:33:29 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-12-06 11:44:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-20 07:54:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-13 04:07:58 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-13 02:18:34 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-06 04:44:35 |
| $.rows[8].overdue | (absent) | true |
| $.rows[9].sla_due | (absent) | 2026-11-06 21:42:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-06 03:33:26 |
| $.rows[10].overdue | (absent) | true |
| $.rows[11].sla_due | (absent) | 2026-11-09 21:15:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?zone=15

Session reads, id 7c823a43ebed5df5, 10964 bytes to 11346 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-13 14:20:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-06 15:47:24 |
| $.rows[2].overdue | (absent) | true |
| $.rows[3].sla_due | (absent) | 2026-11-11 09:38:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-09 07:13:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-10 22:12:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 03:13:47 |
| $.rows[6].overdue | (absent) | true |
| $.rows[7].sla_due | (absent) | 2026-11-06 18:41:09 |
| $.rows[7].overdue | (absent) | false |

### collector GET /api/collector/list?zone=99

Session reads, id 2c29acd576a08d35, 15908 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 17:16:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?zone=abc

Session reads, id d70aaf11e5e24e5a, 15908 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 17:16:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?period=weekly&zone=5

Session reads, id af22c0709a6e3bc1, 16009 bytes to 16584 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-08 17:45:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-13 15:18:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-16 10:04:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-07 09:07:25 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-08 08:45:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-09 08:25:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-08 08:11:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-11 01:26:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-08 23:23:57 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-08 22:46:44 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-06 04:43:54 |
| $.rows[11].overdue | (absent) | true |

### collector GET /api/collector/list?period=monthly&zone=13

Session reads, id 9529f03f08f59914, 15851 bytes to 16427 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-13 16:31:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-07 16:03:03 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-09 15:59:35 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-12-06 15:18:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-13 15:12:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-11 13:58:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-11 13:33:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-09 13:13:14 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-10 09:41:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-10 09:10:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-13 08:06:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?period=quarterly&zone=1

Session reads, id 32780888e1c643bb, 15375 bytes to 15947 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 17:02:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-20 14:14:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-08 13:02:13 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-06 06:56:22 |
| $.rows[3].overdue | (absent) | true |
| $.rows[4].sla_due | (absent) | 2026-11-08 23:51:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-12-05 20:56:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 17:09:19 |
| $.rows[6].overdue | (absent) | true |
| $.rows[7].sla_due | (absent) | 2026-11-08 17:01:34 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-08 14:51:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-05 15:27:11 |
| $.rows[9].overdue | (absent) | true |
| $.rows[10].sla_due | (absent) | 2026-11-09 10:01:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-06 09:50:27 |
| $.rows[11].overdue | (absent) | true |

### collector GET /api/collector/list?period=weekly&dept=GCC-SWM

Session reads, id 3f2d0e9d6219ec8e, 16089 bytes to 16665 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-09 17:02:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-08 13:18:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-08 11:22:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-09 09:23:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-08 08:45:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-09 08:25:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-09 08:23:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-08 08:04:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-08 07:25:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-08 07:16:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-08 06:41:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?period=monthly&dept=CMWSSB

Session reads, id 0a65504cd8363dcc, 14624 bytes to 15188 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-03 14:17:52 |
| $.rows[0].overdue | (absent) | true |
| $.rows[1].sla_due | (absent) | 2026-11-03 07:13:04 |
| $.rows[1].overdue | (absent) | true |
| $.rows[2].sla_due | (absent) | 2026-11-01 11:13:35 |
| $.rows[2].overdue | (absent) | true |
| $.rows[3].sla_due | (absent) | 2026-11-01 07:51:12 |
| $.rows[3].overdue | (absent) | true |
| $.rows[4].sla_due | (absent) | 2026-11-01 07:34:16 |
| $.rows[4].overdue | (absent) | true |
| $.rows[5].sla_due | (absent) | 2026-10-30 01:08:16 |
| $.rows[5].overdue | (absent) | true |
| $.rows[6].sla_due | (absent) | 2026-10-21 12:49:59 |
| $.rows[6].overdue | (absent) | true |
| $.rows[7].sla_due | (absent) | 2026-10-19 06:56:00 |
| $.rows[7].overdue | (absent) | true |
| $.rows[8].sla_due | (absent) | 2026-10-17 17:45:06 |
| $.rows[8].overdue | (absent) | true |
| $.rows[9].sla_due | (absent) | 2026-10-16 20:34:18 |
| $.rows[9].overdue | (absent) | true |
| $.rows[10].sla_due | (absent) | 2026-10-16 20:05:06 |
| $.rows[10].overdue | (absent) | true |
| $.rows[11].sla_due | (absent) | 2026-10-12 19:48:11 |
| $.rows[11].overdue | (absent) | true |

### collector GET /api/collector/list?period=monthly&zone=13&cat=SOLID_WASTE

Session reads, id 683e1235e2906431, 16222 bytes to 16789 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 02:15:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-06 16:08:00 |
| $.rows[1].overdue | (absent) | true |
| $.rows[2].sla_due | (absent) | 2026-11-05 03:18:42 |
| $.rows[2].overdue | (absent) | true |
| $.rows[3].sla_due | (absent) | 2026-11-05 08:51:00 |
| $.rows[3].overdue | (absent) | true |
| $.rows[4].sla_due | (absent) | 2026-11-04 08:44:00 |
| $.rows[4].overdue | (absent) | true |
| $.rows[5].sla_due | (absent) | 2026-11-04 18:53:00 |
| $.rows[5].overdue | (absent) | true |
| $.rows[6].sla_due | (absent) | 2026-11-04 09:26:00 |
| $.rows[6].overdue | (absent) | true |
| $.rows[7].sla_due | (absent) | 2026-11-03 03:49:00 |
| $.rows[7].overdue | (absent) | true |
| $.rows[8].sla_due | (absent) | 2026-11-02 10:49:00 |
| $.rows[8].overdue | (absent) | true |
| $.rows[9].sla_due | (absent) | 2026-11-03 07:39:00 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-02 09:10:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-01 21:49:00 |
| $.rows[11].overdue | (absent) | true |

### collector GET /api/collector/list?period=weekly&taluk=TLK-MYL

Session reads, id c2cc223f0d117bd9, 16399 bytes to 16974 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-13 16:53:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-13 16:38:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-13 14:16:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-20 12:45:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-06 17:37:16 |
| $.rows[5].overdue | (absent) | true |
| $.rows[6].sla_due | (absent) | 2026-11-26 11:13:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-09 10:59:01 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-16 08:51:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-07 08:41:55 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-09 08:23:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-07 07:47:59 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?dept=GCC-SWM&taluk=TLK-MYL

Session reads, id 21df7383258658e3, 3970 bytes to 4114 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 08:23:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-09 08:07:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-09 02:15:00 |
| $.rows[2].overdue | (absent) | false |

### collector GET /api/collector/list?period=quarterly&zone=5&dept=GCC-SWM&cat=SOLID_WASTE

Session reads, id 4e9af0efec8089ab, 15995 bytes to 16567 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-08 08:45:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-09 08:25:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-08 22:39:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-07 10:44:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-07 10:17:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-05 16:03:00 |
| $.rows[5].overdue | (absent) | true |
| $.rows[6].sla_due | (absent) | 2026-11-05 13:00:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-02 15:39:00 |
| $.rows[7].overdue | (absent) | true |
| $.rows[8].sla_due | (absent) | 2026-11-01 22:43:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-02 19:36:00 |
| $.rows[9].overdue | (absent) | true |
| $.rows[10].sla_due | (absent) | 2026-11-01 15:33:00 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-10-30 22:34:00 |
| $.rows[11].overdue | (absent) | true |

### collector GET /api/collector/list?period=weekly&cat=DARK_SPOT_SAFETY&sev=High

Session reads, id 4ff34bdbd93a1f31, 1500 bytes to 1547 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-02 16:56:00 |
| $.rows[0].overdue | (absent) | true |

### collector GET /api/collector/list?period=monthly&zone=5&status=open

Session reads, id 4c3823598613c9d2, 16010 bytes to 16585 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-08 17:45:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-13 15:18:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-16 10:04:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-07 09:07:25 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-08 08:45:00 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-09 08:25:00 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-08 08:11:00 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-11 01:26:00 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-08 23:23:57 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-08 22:46:44 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-06 04:43:54 |
| $.rows[11].overdue | (absent) | true |

### collector GET /api/collector/list?period=quarterly&sev=Severe&status=overdue

Session reads, id a4a4658926d8a105, 18689 bytes to 18805 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].id | INC-20260515-B939EB | INC-20261106-BAE416 |
| $.rows[0].title | Ice House: uprooted tree blocks road | School van driver arrested for sexually assaulting five-year-old girl in Chennai |
| $.rows[0].type | Flooding & waterlogging | Crimes against women & children |
| $.rows[0].cat_code | FLOOD_WATERLOGGING | CRIMES_AGAINST_WOMEN |
| $.rows[0].family | FLOOD | CRIME |
| $.rows[0].dept | PWD-WRD | POL-GCP |
| $.rows[0].dept_name | PWD Water Resources | Greater Chennai Police |
| $.rows[0].zone | 9 | 3 |
| $.rows[0].zone_name | Teynampet | Madhavaram |
| $.rows[0].ward | 115 | 23 |
| $.rows[0].loc | Ice House | Puzhal |
| $.rows[0].lat | 13.05345339618489 | 13.159604 |
| $.rows[0].lon | 80.2708643260533 | 80.20623 |
| $.rows[0].status | In progress | Open |
| $.rows[0].complaints | 3 | 0 |
| $.rows[0].outlets | 0 | 1 |
| $.rows[0].sources | grievance\|police\|pwd | news\|police |
| $.rows[0].source_count | 3 | 2 |
| $.rows[0].channels | citizen_app\|control_room_112\|field_staff | control_room_112\|media |
| $.rows[0].t | 2026-11-06 05:59:00 | 2026-11-06 10:42:54 |
| $.rows[0].summary | 7 reports (Grievance portal, PWD field staff, Police 112) about flooding & waterlogging at Ice House, Ward 115 (Teynampet). First reported 0... (173 chars) | 4 reports (News, Police 112) about crimes against women & children at Puzhal, Ward 23 (Madhavaram). First reported 06 Nov 10:42. Status: ope... (142 chars) |
| $.rows[0].priority | 136.9 | 101 |
| $.rows[0].breached | 1 | 0 |
| $.rows[0].hours_open | 12.2 | 7.4 |
| $.rows[0].severity_reasons | canal overflow (+45); Full service disruption (+15); Access blocked (+10); About 339 people affected (+10) | Crimes Against Women (+55); 1 injured (+8); Vulnerable victim (+10) |

...and 311 more paths (see the JSON file).

### collector GET /api/collector/overview

Session reads, id 39b0e214fde3d0b5, 230470 bytes to 232574 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 3 | 175 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 9 | 155 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 15 |
| $.kpi.series.resolved[1] | 2 | 15 |
| $.kpi.series.resolved[2] | 1 | 16 |
| $.kpi.series.resolved[3] | 0 | 19 |
| $.kpi.series.resolved[4] | 0 | 15 |
| $.kpi.series.resolved[5] | 0 | 11 |
| $.kpi.series.resolved[6] | 0 | 15 |
| $.kpi.series.resolved[7] | 0 | 18 |
| $.kpi.series.resolved[8] | 0 | 13 |
| $.kpi.series.resolved[9] | 0 | 16 |
| $.kpi.series.resolved[10] | 0 | 10 |
| $.kpi.series.resolved[11] | 0 | 12 |
| $.snapshot.overdue | 11 | 22 |
| $.news[0].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.news[1].sla_due | (absent) | 2026-11-13 16:43:38 |
| $.news[2].sla_due | (absent) | 2026-11-07 15:18:31 |
| $.news[3].sla_due | (absent) | 2026-11-06 12:42:54 |
| $.news[4].sla_due | (absent) | 2026-11-06 15:47:24 |
| $.news[5].sla_due | (absent) | 2026-11-07 09:07:25 |
| $.news[6].sla_due | (absent) | 2026-11-09 06:47:38 |

...and 61 more paths (see the JSON file).

### collector GET /api/collector/overview?cat=SOLID_WASTE

Session reads, id bea1527b406da7fb, 64683 bytes to 65517 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 17 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 21 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 1 |
| $.kpi.series.resolved[1] | 0 | 1 |
| $.kpi.series.resolved[2] | 0 | 1 |
| $.kpi.series.resolved[3] | 0 | 3 |
| $.kpi.series.resolved[4] | 0 | 2 |
| $.kpi.series.resolved[5] | 0 | 1 |
| $.kpi.series.resolved[6] | 0 | 1 |
| $.kpi.series.resolved[7] | 0 | 2 |
| $.kpi.series.resolved[8] | 0 | 1 |
| $.kpi.series.resolved[9] | 0 | 2 |
| $.kpi.series.resolved[10] | 0 | 1 |
| $.kpi.series.resolved[11] | 0 | 1 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-08 08:04:00 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-08 06:41:00 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-08 08:45:00 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-07 18:38:00 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-08 16:31:00 |
| $.severity.rows[5].sla_due | (absent) | 2026-11-08 13:18:00 |
| $.severity.rows[6].sla_due | (absent) | 2026-11-08 07:16:00 |
| $.severity.rows[7].sla_due | (absent) | 2026-11-08 11:22:00 |

...and 18 more paths (see the JSON file).

### collector GET /api/collector/overview?cat=DARK_SPOT_SAFETY

Session reads, id a6c1f11197ff2d7d, 29673 bytes to 29929 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 2 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 1 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[4] | 0 | 1 |
| $.kpi.series.resolved[5] | 0 | 1 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-13 08:06:00 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-13 10:07:00 |
| $.bell[0].sla_due | (absent) | 2026-11-06 11:59:00 |
| $.bell[1].sla_due | (absent) | 2026-11-06 02:48:55 |
| $.bell[2].sla_due | (absent) | 2026-11-06 03:13:06 |
| $.bell[3].sla_due | (absent) | 2026-11-06 03:13:47 |
| $.bell[4].sla_due | (absent) | 2026-11-06 04:43:54 |
| $.bell[5].sla_due | (absent) | 2026-11-06 05:41:50 |

### collector GET /api/collector/overview?cat=FOOD_SAFETY

Session reads, id 2da516963c159fa5, 29460 bytes to 29716 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 1 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 5 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[9] | 0 | 1 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-12 20:58:00 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-16 09:37:00 |
| $.bell[0].sla_due | (absent) | 2026-11-06 11:59:00 |
| $.bell[1].sla_due | (absent) | 2026-11-06 02:48:55 |
| $.bell[2].sla_due | (absent) | 2026-11-06 03:13:06 |
| $.bell[3].sla_due | (absent) | 2026-11-06 03:13:47 |
| $.bell[4].sla_due | (absent) | 2026-11-06 04:43:54 |
| $.bell[5].sla_due | (absent) | 2026-11-06 05:41:50 |

### collector GET /api/collector/overview?cat=PUBLIC_ORDER

Session reads, id f98e87062fb9c07c, 36501 bytes to 36885 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 5 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 8 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 1 |
| $.kpi.series.resolved[5] | 0 | 1 |
| $.kpi.series.resolved[6] | 0 | 2 |
| $.kpi.series.resolved[11] | 0 | 1 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-07 10:22:41 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-07 11:55:13 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-07 21:50:43 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-07 19:31:24 |
| $.severity.rows[5].sla_due | (absent) | 2026-11-08 13:02:13 |
| $.bell[0].sla_due | (absent) | 2026-11-06 11:59:00 |
| $.bell[1].sla_due | (absent) | 2026-11-06 02:48:55 |
| $.bell[2].sla_due | (absent) | 2026-11-06 03:13:06 |
| $.bell[3].sla_due | (absent) | 2026-11-06 03:13:47 |
| $.bell[4].sla_due | (absent) | 2026-11-06 04:43:54 |
| $.bell[5].sla_due | (absent) | 2026-11-06 05:41:50 |

### collector GET /api/collector/overview?dept=GCC-SWM

Session reads, id 528e783e33393de3, 54647 bytes to 55225 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 17 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 18 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 1 |
| $.kpi.series.resolved[1] | 0 | 1 |
| $.kpi.series.resolved[2] | 0 | 1 |
| $.kpi.series.resolved[3] | 0 | 3 |
| $.kpi.series.resolved[4] | 0 | 2 |
| $.kpi.series.resolved[5] | 0 | 1 |
| $.kpi.series.resolved[6] | 0 | 1 |
| $.kpi.series.resolved[7] | 0 | 2 |
| $.kpi.series.resolved[8] | 0 | 1 |
| $.kpi.series.resolved[9] | 0 | 2 |
| $.kpi.series.resolved[10] | 0 | 1 |
| $.kpi.series.resolved[11] | 0 | 1 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-08 08:04:00 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-08 06:41:00 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-08 08:45:00 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-07 18:38:00 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-08 13:18:00 |
| $.severity.rows[5].sla_due | (absent) | 2026-11-08 07:16:00 |
| $.severity.rows[6].sla_due | (absent) | 2026-11-08 11:22:00 |
| $.severity.rows[7].sla_due | (absent) | 2026-11-08 07:25:00 |

...and 10 more paths (see the JSON file).

### collector GET /api/collector/overview?dept=GCC-ELE

Session reads, id f990ca8e7fa66599, 67300 bytes to 68037 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 11 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 7 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 1 |
| $.kpi.series.resolved[1] | 0 | 3 |
| $.kpi.series.resolved[3] | 0 | 2 |
| $.kpi.series.resolved[6] | 0 | 2 |
| $.kpi.series.resolved[7] | 0 | 2 |
| $.kpi.series.resolved[11] | 0 | 1 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-07 16:46:00 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-06 19:03:00 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-08 16:35:00 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-08 14:46:00 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-08 08:11:00 |
| $.severity.rows[5].sla_due | (absent) | 2026-11-07 19:18:00 |
| $.severity.rows[6].sla_due | (absent) | 2026-11-08 13:42:00 |
| $.severity.rows[7].sla_due | (absent) | 2026-11-08 07:03:00 |
| $.severity.rows[8].sla_due | (absent) | 2026-11-08 12:46:00 |
| $.severity.rows[9].sla_due | (absent) | 2026-11-07 21:05:00 |
| $.severity.rows[10].sla_due | (absent) | 2026-11-07 20:44:00 |
| $.severity.rows[11].sla_due | (absent) | 2026-11-09 20:59:00 |
| $.severity.rows[12].sla_due | (absent) | 2026-11-10 15:40:00 |
| $.severity.rows[13].sla_due | (absent) | 2026-11-10 09:10:00 |

...and 9 more paths (see the JSON file).

### collector GET /api/collector/overview?dept=CMWSSB

Session reads, id a4c12d9d5bbc192b, 18418 bytes to 18418 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.series | (same keys) | (in another order) |

### collector GET /api/collector/overview?dept=POL-GCP

Session reads, id bf56cac30316263f, 121466 bytes to 123237 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 69 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 3 | 58 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 6 |
| $.kpi.series.resolved[1] | 0 | 5 |
| $.kpi.series.resolved[2] | 0 | 6 |
| $.kpi.series.resolved[3] | 0 | 5 |
| $.kpi.series.resolved[4] | 0 | 5 |
| $.kpi.series.resolved[5] | 0 | 7 |
| $.kpi.series.resolved[6] | 0 | 8 |
| $.kpi.series.resolved[7] | 0 | 8 |
| $.kpi.series.resolved[8] | 0 | 7 |
| $.kpi.series.resolved[9] | 0 | 4 |
| $.kpi.series.resolved[10] | 0 | 5 |
| $.kpi.series.resolved[11] | 0 | 3 |
| $.snapshot.overdue | 5 | 16 |
| $.news[0].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.news[1].sla_due | (absent) | 2026-11-13 16:43:38 |
| $.news[2].sla_due | (absent) | 2026-11-06 12:42:54 |
| $.news[3].sla_due | (absent) | 2026-11-06 15:47:24 |
| $.news[4].sla_due | (absent) | 2026-11-07 09:07:25 |
| $.news[5].sla_due | (absent) | 2026-11-07 01:44:37 |
| $.news[6].sla_due | (absent) | 2026-11-06 22:31:45 |

...and 51 more paths (see the JSON file).

### collector GET /api/collector/overview?period=daily

Session reads, id b98902a6131e2d60, 230470 bytes to 232574 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 3 | 175 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 9 | 155 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 15 |
| $.kpi.series.resolved[1] | 2 | 15 |
| $.kpi.series.resolved[2] | 1 | 16 |
| $.kpi.series.resolved[3] | 0 | 19 |
| $.kpi.series.resolved[4] | 0 | 15 |
| $.kpi.series.resolved[5] | 0 | 11 |
| $.kpi.series.resolved[6] | 0 | 15 |
| $.kpi.series.resolved[7] | 0 | 18 |
| $.kpi.series.resolved[8] | 0 | 13 |
| $.kpi.series.resolved[9] | 0 | 16 |
| $.kpi.series.resolved[10] | 0 | 10 |
| $.kpi.series.resolved[11] | 0 | 12 |
| $.snapshot.overdue | 11 | 22 |
| $.news[0].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.news[1].sla_due | (absent) | 2026-11-13 16:43:38 |
| $.news[2].sla_due | (absent) | 2026-11-07 15:18:31 |
| $.news[3].sla_due | (absent) | 2026-11-06 12:42:54 |
| $.news[4].sla_due | (absent) | 2026-11-06 15:47:24 |
| $.news[5].sla_due | (absent) | 2026-11-07 09:07:25 |
| $.news[6].sla_due | (absent) | 2026-11-09 06:47:38 |

...and 61 more paths (see the JSON file).

### collector GET /api/collector/overview?period=weekly

Session reads, id 754287b66e1e2e10, 408389 bytes to 410896 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 182 | 1166 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 708 | 1192 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 47 | 192 |
| $.kpi.series.resolved[1] | 51 | 161 |
| $.kpi.series.resolved[2] | 31 | 168 |
| $.kpi.series.resolved[3] | 22 | 159 |
| $.kpi.series.resolved[4] | 19 | 156 |
| $.kpi.series.resolved[5] | 9 | 155 |
| $.kpi.series.resolved[6] | 3 | 175 |
| $.snapshot.overdue | 339 | 505 |
| $.news[0].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.news[1].sla_due | (absent) | 2026-11-13 16:43:38 |
| $.news[2].sla_due | (absent) | 2026-11-07 15:18:31 |
| $.news[3].sla_due | (absent) | 2026-11-06 12:42:54 |
| $.news[4].sla_due | (absent) | 2026-11-06 15:47:24 |
| $.news[5].sla_due | (absent) | 2026-11-07 09:07:25 |
| $.news[6].sla_due | (absent) | 2026-11-09 06:47:38 |
| $.news[7].sla_due | (absent) | 2026-11-07 01:44:37 |
| $.news[8].sla_due | (absent) | 2026-11-06 22:31:45 |
| $.news[9].sla_due | (absent) | 2026-11-06 10:26:22 |
| $.news[10].sla_due | (absent) | 2026-11-06 09:29:21 |
| $.news[11].sla_due | (absent) | 2026-11-06 21:27:00 |

...and 66 more paths (see the JSON file).

### collector GET /api/collector/overview?period=monthly

Session reads, id b2be60661f0640d7, 551982 bytes to 554492 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 3084 | 4809 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 4255 | 4433 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 137 | 168 |
| $.kpi.series.resolved[1] | 139 | 142 |
| $.kpi.series.resolved[2] | 145 | 153 |
| $.kpi.series.resolved[3] | 111 | 166 |
| $.kpi.series.resolved[4] | 141 | 163 |
| $.kpi.series.resolved[5] | 134 | 153 |
| $.kpi.series.resolved[6] | 120 | 143 |
| $.kpi.series.resolved[8] | 119 | 170 |
| $.kpi.series.resolved[9] | 123 | 150 |
| $.kpi.series.resolved[10] | 151 | 147 |
| $.kpi.series.resolved[11] | 120 | 152 |
| $.kpi.series.resolved[12] | 122 | 145 |
| $.kpi.series.resolved[13] | 151 | 157 |
| $.kpi.series.resolved[14] | 197 | 166 |
| $.kpi.series.resolved[15] | 157 | 149 |
| $.kpi.series.resolved[16] | 152 | 171 |
| $.kpi.series.resolved[17] | 121 | 165 |
| $.kpi.series.resolved[18] | 99 | 175 |
| $.kpi.series.resolved[19] | 121 | 185 |
| $.kpi.series.resolved[20] | 86 | 176 |

...and 88 more paths (see the JSON file).

### collector GET /api/collector/overview?period=quarterly

Session reads, id b421657684ecf5d9, 590924 bytes to 593427 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 11784 | 13579 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 12243 | 10448 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 1063 | 999 |
| $.kpi.series.resolved[1] | 932 | 1007 |
| $.kpi.series.resolved[2] | 1076 | 971 |
| $.kpi.series.resolved[3] | 962 | 1022 |
| $.kpi.series.resolved[4] | 1050 | 1038 |
| $.kpi.series.resolved[5] | 915 | 1015 |
| $.kpi.series.resolved[6] | 1150 | 1007 |
| $.kpi.series.resolved[7] | 926 | 1040 |
| $.kpi.series.resolved[8] | 948 | 1021 |
| $.kpi.series.resolved[9] | 889 | 1067 |
| $.kpi.series.resolved[10] | 1024 | 1069 |
| $.kpi.series.resolved[11] | 677 | 1168 |
| $.kpi.series.resolved[12] | 172 | 1155 |
| $.snapshot.overdue | 888 | 1632 |
| $.news[0].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.news[1].sla_due | (absent) | 2026-11-13 16:43:38 |
| $.news[2].sla_due | (absent) | 2026-11-07 15:18:31 |
| $.news[3].sla_due | (absent) | 2026-11-06 12:42:54 |
| $.news[4].sla_due | (absent) | 2026-11-06 15:47:24 |
| $.news[5].sla_due | (absent) | 2026-11-07 09:07:25 |

...and 72 more paths (see the JSON file).

### collector GET /api/collector/overview?period=bogus

Session reads, id 14b397a270267780, 230470 bytes to 232574 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 3 | 175 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 9 | 155 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 15 |
| $.kpi.series.resolved[1] | 2 | 15 |
| $.kpi.series.resolved[2] | 1 | 16 |
| $.kpi.series.resolved[3] | 0 | 19 |
| $.kpi.series.resolved[4] | 0 | 15 |
| $.kpi.series.resolved[5] | 0 | 11 |
| $.kpi.series.resolved[6] | 0 | 15 |
| $.kpi.series.resolved[7] | 0 | 18 |
| $.kpi.series.resolved[8] | 0 | 13 |
| $.kpi.series.resolved[9] | 0 | 16 |
| $.kpi.series.resolved[10] | 0 | 10 |
| $.kpi.series.resolved[11] | 0 | 12 |
| $.snapshot.overdue | 11 | 22 |
| $.news[0].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.news[1].sla_due | (absent) | 2026-11-13 16:43:38 |
| $.news[2].sla_due | (absent) | 2026-11-07 15:18:31 |
| $.news[3].sla_due | (absent) | 2026-11-06 12:42:54 |
| $.news[4].sla_due | (absent) | 2026-11-06 15:47:24 |
| $.news[5].sla_due | (absent) | 2026-11-07 09:07:25 |
| $.news[6].sla_due | (absent) | 2026-11-09 06:47:38 |

...and 61 more paths (see the JSON file).

### collector GET /api/collector/overview?taluk=TLK-MYL

Session reads, id ee66b8bc8550bfdb, 74618 bytes to 75616 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 10 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 7 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 1 |
| $.kpi.series.resolved[1] | 0 | 2 |
| $.kpi.series.resolved[2] | 0 | 1 |
| $.kpi.series.resolved[4] | 0 | 2 |
| $.kpi.series.resolved[7] | 0 | 1 |
| $.kpi.series.resolved[8] | 0 | 1 |
| $.kpi.series.resolved[10] | 0 | 2 |
| $.snapshot.overdue | 1 | 3 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-06 11:59:00 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-07 08:41:55 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-09 10:59:01 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-06 22:36:06 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-06 18:23:56 |
| $.severity.rows[5].sla_due | (absent) | 2026-11-06 17:37:16 |
| $.severity.rows[6].why.attention.length | 0 | 1 |
| $.severity.rows[6].why.attention[0] | (absent) | Past its deadline |
| $.severity.rows[6].why.needsYou | false | true |
| $.severity.rows[6].why.why.length | 0 | 1 |
| $.severity.rows[6].why.why[0] | (absent) | Past its deadline |
| $.severity.rows[6].sla_due | (absent) | 2026-11-06 08:43:47 |

...and 23 more paths (see the JSON file).

### collector GET /api/collector/overview?taluk=TLK-SHN

Session reads, id 8d15afb2d6fc9841, 49556 bytes to 50102 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 16 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 10 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 2 |
| $.kpi.series.resolved[1] | 0 | 2 |
| $.kpi.series.resolved[2] | 0 | 1 |
| $.kpi.series.resolved[3] | 0 | 2 |
| $.kpi.series.resolved[6] | 0 | 1 |
| $.kpi.series.resolved[7] | 0 | 1 |
| $.kpi.series.resolved[8] | 0 | 2 |
| $.kpi.series.resolved[9] | 0 | 1 |
| $.kpi.series.resolved[10] | 0 | 2 |
| $.kpi.series.resolved[11] | 0 | 2 |
| $.news[0].sla_due | (absent) | 2026-11-06 15:47:24 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-06 03:13:47 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-06 15:47:24 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-06 18:41:09 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-13 14:20:00 |
| $.severity.rows[5].sla_due | (absent) | 2026-11-09 07:13:00 |
| $.severity.rows[6].sla_due | (absent) | 2026-11-11 11:11:00 |
| $.severity.rows[7].sla_due | (absent) | 2026-11-10 22:12:00 |
| $.severity.rows[8].sla_due | (absent) | 2026-11-11 09:38:00 |

...and 7 more paths (see the JSON file).

### collector GET /api/collector/overview?taluk=TLK-MDR

Session reads, id 13cfa0f8f9a75092, 60949 bytes to 61655 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 13 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 1 | 11 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 1 |
| $.kpi.series.resolved[1] | 0 | 1 |
| $.kpi.series.resolved[2] | 0 | 1 |
| $.kpi.series.resolved[3] | 0 | 1 |
| $.kpi.series.resolved[4] | 0 | 2 |
| $.kpi.series.resolved[6] | 0 | 3 |
| $.kpi.series.resolved[7] | 0 | 1 |
| $.kpi.series.resolved[8] | 0 | 2 |
| $.kpi.series.resolved[9] | 0 | 1 |
| $.news[0].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-06 21:28:32 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-09 14:11:04 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-07 19:18:00 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-08 12:46:00 |
| $.severity.rows[5].sla_due | (absent) | 2026-11-09 03:52:58 |
| $.severity.rows[6].sla_due | (absent) | 2026-11-12 21:03:00 |
| $.severity.rows[7].sla_due | (absent) | 2026-11-10 09:03:00 |
| $.severity.rows[8].sla_due | (absent) | 2026-11-08 07:16:00 |
| $.severity.rows[9].sla_due | (absent) | 2026-11-16 17:06:00 |

...and 11 more paths (see the JSON file).

### collector GET /api/collector/overview?zone=5

Session reads, id 26c06b6bcb04c5cd, 72630 bytes to 73560 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 14 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 22 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 1 |
| $.kpi.series.resolved[3] | 0 | 2 |
| $.kpi.series.resolved[4] | 0 | 1 |
| $.kpi.series.resolved[5] | 0 | 3 |
| $.kpi.series.resolved[6] | 0 | 2 |
| $.kpi.series.resolved[7] | 0 | 2 |
| $.kpi.series.resolved[9] | 0 | 2 |
| $.kpi.series.resolved[11] | 0 | 1 |
| $.news[0].sla_due | (absent) | 2026-11-07 09:07:25 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-06 02:48:55 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-06 04:43:54 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-06 18:48:50 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-06 20:20:00 |
| $.severity.rows[5].sla_due | (absent) | 2026-11-07 09:07:25 |
| $.severity.rows[6].sla_due | (absent) | 2026-11-06 19:08:00 |
| $.severity.rows[7].sla_due | (absent) | 2026-11-08 08:11:00 |
| $.severity.rows[8].sla_due | (absent) | 2026-11-12 19:21:34 |
| $.severity.rows[9].sla_due | (absent) | 2026-11-10 20:37:00 |
| $.severity.rows[10].sla_due | (absent) | 2026-11-08 17:45:00 |

...and 17 more paths (see the JSON file).

### collector GET /api/collector/overview?zone=13

Session reads, id d04519dc5d7628c2, 74780 bytes to 75749 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 1 | 23 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 3 | 9 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 3 |
| $.kpi.series.resolved[1] | 0 | 2 |
| $.kpi.series.resolved[2] | 1 | 2 |
| $.kpi.series.resolved[3] | 0 | 5 |
| $.kpi.series.resolved[4] | 0 | 2 |
| $.kpi.series.resolved[5] | 0 | 1 |
| $.kpi.series.resolved[6] | 0 | 1 |
| $.kpi.series.resolved[7] | 0 | 1 |
| $.kpi.series.resolved[8] | 0 | 1 |
| $.kpi.series.resolved[9] | 0 | 2 |
| $.kpi.series.resolved[10] | 0 | 1 |
| $.kpi.series.resolved[11] | 0 | 2 |
| $.snapshot.overdue | 1 | 2 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-06 05:41:50 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-06 23:59:31 |
| $.severity.rows[2].why.attention.length | 1 | 2 |
| $.severity.rows[2].why.attention[0] | Keeps happening: 5 similar incidents here in 90 days | Past its deadline |
| $.severity.rows[2].why.attention[1] | (absent) | Keeps happening: 5 similar incidents here in 90 days |
| $.severity.rows[2].why.why.length | 1 | 2 |
| $.severity.rows[2].why.why[0] | Keeps happening: 5 similar incidents here in 90 days | Past its deadline |

...and 28 more paths (see the JSON file).

### collector GET /api/collector/overview?zone=1

Session reads, id cddb8f25b6b9a109, 38262 bytes to 38687 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 9 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 10 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[2] | 0 | 3 |
| $.kpi.series.resolved[4] | 0 | 1 |
| $.kpi.series.resolved[6] | 0 | 1 |
| $.kpi.series.resolved[7] | 0 | 2 |
| $.kpi.series.resolved[9] | 0 | 1 |
| $.kpi.series.resolved[11] | 0 | 1 |
| $.snapshot.overdue | 0 | 1 |
| $.severity.rows[0].why.attention.length | 1 | 2 |
| $.severity.rows[0].why.attention[1] | (absent) | Past its deadline |
| $.severity.rows[0].why.why.length | 1 | 2 |
| $.severity.rows[0].why.why[1] | (absent) | Past its deadline |
| $.severity.rows[0].sla_due | (absent) | 2026-11-06 06:56:22 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-08 23:51:00 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-09 17:02:00 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-20 14:14:00 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-08 13:02:13 |
| $.severity.rows[5].sla_due | (absent) | 2026-12-05 20:56:00 |
| $.bell[0].sla_due | (absent) | 2026-11-06 11:59:00 |
| $.bell[1].sla_due | (absent) | 2026-11-06 02:48:55 |
| $.bell[2].sla_due | (absent) | 2026-11-06 03:13:06 |

...and 3 more paths (see the JSON file).

### collector GET /api/collector/overview?zone=8

Session reads, id 3f3ddc093af4ab49, 54816 bytes to 55567 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 1 | 14 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 1 | 14 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 2 |
| $.kpi.series.resolved[3] | 0 | 1 |
| $.kpi.series.resolved[5] | 0 | 1 |
| $.kpi.series.resolved[6] | 0 | 2 |
| $.kpi.series.resolved[7] | 0 | 2 |
| $.kpi.series.resolved[8] | 0 | 2 |
| $.kpi.series.resolved[9] | 0 | 2 |
| $.kpi.series.resolved[11] | 0 | 1 |
| $.snapshot.overdue | 0 | 2 |
| $.news[0].sla_due | (absent) | 2026-11-13 16:43:38 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-06 21:54:11 |
| $.severity.rows[1].why.attention.length | 0 | 1 |
| $.severity.rows[1].why.attention[0] | (absent) | Past its deadline |
| $.severity.rows[1].why.needsYou | false | true |
| $.severity.rows[1].why.why.length | 0 | 1 |
| $.severity.rows[1].why.why[0] | (absent) | Past its deadline |
| $.severity.rows[1].sla_due | (absent) | 2026-11-06 04:44:35 |
| $.severity.rows[2].why.attention.length | 1 | 2 |
| $.severity.rows[2].why.attention[1] | (absent) | Past its deadline |
| $.severity.rows[2].why.why.length | 1 | 2 |

...and 19 more paths (see the JSON file).

### collector GET /api/collector/overview?zone=15

Session reads, id e90fdb13f88d1157, 46412 bytes to 46893 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 13 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 7 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 1 |
| $.kpi.series.resolved[1] | 0 | 2 |
| $.kpi.series.resolved[2] | 0 | 1 |
| $.kpi.series.resolved[3] | 0 | 1 |
| $.kpi.series.resolved[6] | 0 | 1 |
| $.kpi.series.resolved[7] | 0 | 1 |
| $.kpi.series.resolved[8] | 0 | 2 |
| $.kpi.series.resolved[9] | 0 | 1 |
| $.kpi.series.resolved[10] | 0 | 1 |
| $.kpi.series.resolved[11] | 0 | 2 |
| $.news[0].sla_due | (absent) | 2026-11-06 15:47:24 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-06 03:13:47 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-06 15:47:24 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-06 18:41:09 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-13 14:20:00 |
| $.severity.rows[5].sla_due | (absent) | 2026-11-09 07:13:00 |
| $.severity.rows[6].sla_due | (absent) | 2026-11-10 22:12:00 |
| $.severity.rows[7].sla_due | (absent) | 2026-11-11 09:38:00 |
| $.bell[0].sla_due | (absent) | 2026-11-06 11:59:00 |

...and 5 more paths (see the JSON file).

### collector GET /api/collector/overview?period=weekly&zone=5

Session reads, id 0498feb041980d20, 177619 bytes to 179734 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 16 | 117 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 76 | 130 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 5 | 23 |
| $.kpi.series.resolved[1] | 0 | 18 |
| $.kpi.series.resolved[2] | 6 | 13 |
| $.kpi.series.resolved[3] | 4 | 15 |
| $.kpi.series.resolved[4] | 1 | 12 |
| $.kpi.series.resolved[5] | 0 | 22 |
| $.kpi.series.resolved[6] | 0 | 14 |
| $.snapshot.overdue | 39 | 59 |
| $.news[0].sla_due | (absent) | 2026-11-07 09:07:25 |
| $.news[1].sla_due | (absent) | 2026-11-07 03:56:22 |
| $.news[2].sla_due | (absent) | 2026-11-04 01:41:25 |
| $.news[3].sla_due | (absent) | 2026-11-03 17:41:55 |
| $.news[4].sla_due | (absent) | 2026-11-03 17:34:00 |
| $.news[5].sla_due | (absent) | 2026-11-03 17:49:30 |
| $.news[6].sla_due | (absent) | 2026-11-03 16:09:53 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-03 02:06:53 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-05 03:50:26 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-05 22:18:14 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-05 12:00:00 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-04 23:40:19 |

...and 69 more paths (see the JSON file).

### collector GET /api/collector/overview?period=monthly&zone=13

Session reads, id 31959f5180fff1e5, 232197 bytes to 234672 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 281 | 428 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 363 | 392 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 13 | 17 |
| $.kpi.series.resolved[1] | 14 | 13 |
| $.kpi.series.resolved[2] | 10 | 17 |
| $.kpi.series.resolved[3] | 9 | 19 |
| $.kpi.series.resolved[4] | 16 | 19 |
| $.kpi.series.resolved[5] | 14 | 10 |
| $.kpi.series.resolved[6] | 14 | 9 |
| $.kpi.series.resolved[7] | 12 | 10 |
| $.kpi.series.resolved[8] | 11 | 12 |
| $.kpi.series.resolved[9] | 9 | 10 |
| $.kpi.series.resolved[10] | 14 | 11 |
| $.kpi.series.resolved[11] | 9 | 10 |
| $.kpi.series.resolved[12] | 3 | 12 |
| $.kpi.series.resolved[13] | 15 | 12 |
| $.kpi.series.resolved[14] | 16 | 18 |
| $.kpi.series.resolved[15] | 14 | 16 |
| $.kpi.series.resolved[16] | 15 | 18 |
| $.kpi.series.resolved[17] | 9 | 11 |
| $.kpi.series.resolved[18] | 11 | 13 |
| $.kpi.series.resolved[20] | 6 | 10 |

...and 103 more paths (see the JSON file).

### collector GET /api/collector/overview?period=quarterly&zone=1

Session reads, id 75351ec64df2030f, 207827 bytes to 210613 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 658 | 758 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 722 | 622 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 47 | 52 |
| $.kpi.series.resolved[1] | 46 | 40 |
| $.kpi.series.resolved[2] | 58 | 63 |
| $.kpi.series.resolved[3] | 56 | 55 |
| $.kpi.series.resolved[4] | 60 | 61 |
| $.kpi.series.resolved[5] | 51 | 58 |
| $.kpi.series.resolved[6] | 64 | 56 |
| $.kpi.series.resolved[7] | 55 | 46 |
| $.kpi.series.resolved[8] | 65 | 66 |
| $.kpi.series.resolved[9] | 48 | 68 |
| $.kpi.series.resolved[10] | 64 | 67 |
| $.kpi.series.resolved[11] | 35 | 68 |
| $.kpi.series.resolved[12] | 9 | 58 |
| $.snapshot.overdue | 42 | 72 |
| $.news[0].sla_due | (absent) | 2026-11-05 15:27:11 |
| $.news[1].sla_due | (absent) | 2026-11-06 07:31:00 |
| $.news[2].sla_due | (absent) | 2026-10-30 00:35:13 |
| $.news[3].sla_due | (absent) | 2026-11-05 14:50:43 |
| $.news[4].sla_due | (absent) | 2026-10-27 20:56:12 |
| $.news[5].sla_due | (absent) | 2026-10-25 21:37:24 |

...and 122 more paths (see the JSON file).

### collector GET /api/collector/overview?period=weekly&dept=GCC-SWM

Session reads, id 21e6f5dd86122d0f, 107214 bytes to 108211 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 40 | 131 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 135 | 141 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 11 | 28 |
| $.kpi.series.resolved[1] | 10 | 18 |
| $.kpi.series.resolved[2] | 10 | 15 |
| $.kpi.series.resolved[3] | 7 | 16 |
| $.kpi.series.resolved[4] | 2 | 19 |
| $.kpi.series.resolved[5] | 0 | 18 |
| $.kpi.series.resolved[6] | 0 | 17 |
| $.news[0].sla_due | (absent) | 2026-11-08 17:25:50 |
| $.news[1].sla_due | (absent) | 2026-11-07 03:56:22 |
| $.news[2].sla_due | (absent) | 2026-11-05 03:18:42 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-04 08:45:00 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-05 00:52:00 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-03 10:37:00 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-02 15:39:00 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-04 10:29:00 |
| $.severity.rows[5].sla_due | (absent) | 2026-11-05 20:50:00 |
| $.severity.rows[6].sla_due | (absent) | 2026-11-05 19:40:00 |
| $.severity.rows[7].sla_due | (absent) | 2026-11-03 23:25:00 |
| $.severity.rows[8].sla_due | (absent) | 2026-11-04 10:39:10 |
| $.severity.rows[9].sla_due | (absent) | 2026-11-02 09:00:00 |

...and 18 more paths (see the JSON file).

### collector GET /api/collector/overview?period=monthly&dept=CMWSSB

Session reads, id 18116763af0cce8f, 55054 bytes to 55630 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.series | (same keys) | (in another order) |
| $.news[0].sla_due | (absent) | 2026-11-03 14:17:52 |
| $.news[1].sla_due | (absent) | 2026-11-03 07:13:04 |
| $.news[2].sla_due | (absent) | 2026-11-01 11:13:35 |
| $.news[3].sla_due | (absent) | 2026-11-01 07:51:12 |
| $.news[4].sla_due | (absent) | 2026-11-01 07:34:16 |
| $.news[5].sla_due | (absent) | 2026-10-30 01:08:16 |
| $.news[6].sla_due | (absent) | 2026-10-21 12:49:59 |
| $.news[7].sla_due | (absent) | 2026-10-19 06:56:00 |
| $.news[8].sla_due | (absent) | 2026-10-17 17:45:06 |
| $.news[9].sla_due | (absent) | 2026-10-16 20:34:18 |
| $.news[10].sla_due | (absent) | 2026-10-16 20:05:06 |
| $.news[11].sla_due | (absent) | 2026-10-14 17:52:34 |
| $.news[12].sla_due | (absent) | 2026-10-12 19:48:11 |
| $.news[13].sla_due | (absent) | 2026-10-11 16:53:09 |
| $.news[14].sla_due | (absent) | 2026-10-11 07:37:09 |
| $.news[15].sla_due | (absent) | 2026-10-11 00:46:18 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-03 07:13:04 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-03 14:17:52 |

### collector GET /api/collector/overview?zone=8&dept=GCC-ELE

Session reads, id 1f1702587c9a7fb7, 21612 bytes to 21676 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 3 |
| $.kpi.series | (same keys) | (in another order) |
| $.bell[0].sla_due | (absent) | 2026-11-06 19:03:00 |
| $.bell[1].sla_due | (absent) | 2026-11-07 16:46:00 |

### collector GET /api/collector/overview?period=monthly&zone=13&cat=SOLID_WASTE

Session reads, id 90e5dddcfac3a41d, 61546 bytes to 62058 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 42 | 47 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 39 | 42 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 1 | 2 |
| $.kpi.series.resolved[1] | 2 | 0 |
| $.kpi.series.resolved[2] | 0 | 3 |
| $.kpi.series.resolved[3] | 0 | 1 |
| $.kpi.series.resolved[4] | 2 | 1 |
| $.kpi.series.resolved[5] | 3 | 0 |
| $.kpi.series.resolved[6] | 3 | 0 |
| $.kpi.series.resolved[7] | 0 | 2 |
| $.kpi.series.resolved[9] | 1 | 0 |
| $.kpi.series.resolved[11] | 0 | 5 |
| $.kpi.series.resolved[12] | 1 | 0 |
| $.kpi.series.resolved[13] | 2 | 1 |
| $.kpi.series.resolved[14] | 0 | 1 |
| $.kpi.series.resolved[16] | 3 | 1 |
| $.kpi.series.resolved[17] | 1 | 0 |
| $.kpi.series.resolved[18] | 4 | 1 |
| $.kpi.series.resolved[19] | 3 | 1 |
| $.kpi.series.resolved[21] | 4 | 2 |
| $.kpi.series.resolved[23] | 2 | 3 |
| $.kpi.series.resolved[24] | 1 | 4 |

...and 21 more paths (see the JSON file).

### collector GET /api/collector/overview?period=weekly&taluk=TLK-MYL

Session reads, id e120e15ec8222ac8, 139218 bytes to 140772 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 8 | 78 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 53 | 102 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 2 | 15 |
| $.kpi.series.resolved[1] | 2 | 11 |
| $.kpi.series.resolved[2] | 1 | 10 |
| $.kpi.series.resolved[3] | 3 | 11 |
| $.kpi.series.resolved[4] | 0 | 14 |
| $.kpi.series.resolved[5] | 0 | 7 |
| $.kpi.series.resolved[6] | 0 | 10 |
| $.snapshot.overdue | 25 | 36 |
| $.news[0].sla_due | (absent) | 2026-11-12 14:32:55 |
| $.news[1].sla_due | (absent) | 2026-11-05 16:00:31 |
| $.news[2].sla_due | (absent) | 2026-11-01 06:52:52 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-06 11:59:00 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-01 06:52:52 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-02 20:56:29 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-01 09:36:00 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-06 04:35:25 |
| $.severity.rows[5].sla_due | (absent) | 2026-11-07 08:41:55 |
| $.severity.rows[6].sla_due | (absent) | 2026-11-05 13:23:33 |
| $.severity.rows[7].sla_due | (absent) | 2026-11-06 17:26:32 |
| $.severity.rows[8].sla_due | (absent) | 2026-11-02 07:26:35 |

...and 44 more paths (see the JSON file).

### collector GET /api/collector/search?q=Adyar

Session reads, id 5ea2d6c2c96b79b2, 10214 bytes to 10438 bytes.

| Path | A | B |
|---|---|---|
| $.incidents[0].sla_due | (absent) | 2026-11-06 05:41:50 |
| $.incidents[1].sla_due | (absent) | 2026-10-20 14:01:49 |
| $.incidents[2].sla_due | (absent) | 2026-07-09 01:30:42 |
| $.incidents[3].sla_due | (absent) | 2026-11-05 15:01:04 |
| $.incidents[4].sla_due | (absent) | 2026-11-05 13:23:33 |
| $.incidents[5].sla_due | (absent) | 2026-07-03 22:39:43 |
| $.incidents[6].sla_due | (absent) | 2026-11-01 13:42:21 |

### collector GET /api/collector/search?q=garbage

Session reads, id 6fa0fd482e2663a0, 10510 bytes to 10734 bytes.

| Path | A | B |
|---|---|---|
| $.incidents[0].sla_due | (absent) | 2026-07-06 12:53:12 |
| $.incidents[1].sla_due | (absent) | 2026-11-04 08:45:00 |
| $.incidents[2].sla_due | (absent) | 2026-11-05 00:52:00 |
| $.incidents[3].sla_due | (absent) | 2026-11-03 13:51:18 |
| $.incidents[4].sla_due | (absent) | 2026-10-28 20:01:00 |
| $.incidents[5].sla_due | (absent) | 2026-11-03 10:37:00 |
| $.incidents[6].sla_due | (absent) | 2026-10-23 20:58:00 |

### collector GET /api/collector/search?q=kuppai

Session reads, id 40c6fd3786d05200, 9321 bytes to 9545 bytes.

| Path | A | B |
|---|---|---|
| $.incidents[0].sla_due | (absent) | 2026-11-04 10:39:10 |
| $.incidents[1].sla_due | (absent) | 2026-10-22 11:37:00 |
| $.incidents[2].sla_due | (absent) | 2026-11-08 08:45:00 |
| $.incidents[3].sla_due | (absent) | 2026-11-08 11:22:00 |
| $.incidents[4].sla_due | (absent) | 2026-11-08 21:51:00 |
| $.incidents[5].sla_due | (absent) | 2026-07-20 19:15:00 |
| $.incidents[6].sla_due | (absent) | 2026-10-20 17:18:00 |

### collector GET /api/collector/search?q=குப்பை

Session reads, id 046a5fe26e204cff, 12090 bytes to 12314 bytes.

| Path | A | B |
|---|---|---|
| $.incidents[0].sla_due | (absent) | 2026-11-05 00:52:00 |
| $.incidents[1].sla_due | (absent) | 2026-11-01 07:43:00 |
| $.incidents[2].sla_due | (absent) | 2026-10-02 16:31:00 |
| $.incidents[3].sla_due | (absent) | 2026-11-03 23:25:00 |
| $.incidents[4].sla_due | (absent) | 2026-11-10 04:58:48 |
| $.incidents[5].sla_due | (absent) | 2026-10-02 21:52:00 |
| $.incidents[6].sla_due | (absent) | 2026-11-05 01:39:13 |

### collector GET /api/collector/search?q=INC-20260926-EB3B79

Session reads, id 39d0a5c4d391239c, 1318 bytes to 1350 bytes.

| Path | A | B |
|---|---|---|
| $.incidents[0].sla_due | (absent) | 2026-11-04 10:39:10 |

### collector GET /api/collector/sources

Session reads, id 5be5ec49e4b66c74, 8974 bytes to 9194 bytes.

| Path | A | B |
|---|---|---|
| $.sources[0].status | ok | test |
| $.sources[0].generated | (absent) | true |
| $.sources[1].status | ok | test |
| $.sources[1].generated | (absent) | true |
| $.sources[2].status | ok | test |
| $.sources[2].generated | (absent) | true |
| $.sources[3].status | ok | test |
| $.sources[3].generated | (absent) | true |
| $.sources[4].generated | (absent) | false |
| $.sources[5].generated | (absent) | false |
| $.sources[6].generated | (absent) | false |
| $.sources[7].generated | (absent) | false |
| $.sources[8].generated | (absent) | false |
| $.sources[9].generated | (absent) | false |
| $.sources[10].generated | (absent) | false |
| $.sources[11].generated | (absent) | false |

### collector GET /api/rehearsal/impacts?lens=traffic

Session reads, id 446b8bda89827302, 271089 bytes to 271152 bytes.

| Path | A | B |
|---|---|---|
| $.sources[0].kind | real | generated |
| $.sources[0].note | District store, placed on the road to 300 m | Generated police and complaint records in the district store (test data), placed on the road to 300 m |

### collector GET /api/collector/export (export with grant)

Session reads, id b1916beafc4486d6, 15094 bytes to 15803 bytes.

| Path | A | B |
|---|---|---|
| $.csv | list,id,what,where,department,severity,why,reported,past_deadline,complaints "Needs your attention","INC-20260515-B939EB","Ice House: uproot... (13550 chars) | list,id,what,where,department,severity,why,reported,past_deadline,complaints "Needs your attention","INC-20260515-B939EB","Ice House: uproot... (14196 chars) |
| $.count | 47 | 50 |

### collector GET /api/collector/export?period=weekly (export with grant)

Session reads, id 84c67b0c4e89039c, 91017 bytes to 115769 bytes.

| Path | A | B |
|---|---|---|
| $.csv | list,id,what,where,department,severity,why,reported,past_deadline,complaints "Needs your attention","INC-20261105-0476D7","Families stranded... (83056 chars) | list,id,what,where,department,severity,why,reported,past_deadline,complaints "Needs your attention","INC-20261105-0476D7","Families stranded... (105659 chars) |
| $.count | 293 | 392 |

### collector GET /api/collector/export?period=monthly&zone=13 (export with grant)

Session reads, id 91f4a3ac2886d9c5, 15558 bytes to 18701 bytes.

| Path | A | B |
|---|---|---|
| $.csv | list,id,what,where,department,severity,why,reported,past_deadline,complaints "Needs your attention","INC-20261021-B1DD28-1","Caller reported... (14045 chars) | list,id,what,where,department,severity,why,reported,past_deadline,complaints "Needs your attention","INC-20261021-B1DD28-1","Caller reported... (16894 chars) |
| $.count | 52 | 66 |

### collector GET /api/collector/export?period=weekly&taluk=TLK-MYL (export with grant)

Session reads, id adb71d5573c043c3, 7232 bytes to 8344 bytes.

| Path | A | B |
|---|---|---|
| $.csv | list,id,what,where,department,severity,why,reported,past_deadline,complaints "Needs your attention","INC-20260515-B939EB","Ice House: uproot... (6667 chars) | list,id,what,where,department,severity,why,reported,past_deadline,complaints "Needs your attention","INC-20260515-B939EB","Ice House: uproot... (7674 chars) |
| $.count | 24 | 29 |

### collector POST /api/map/ask

Session reads, id acea570744e2dc46, 125531 bytes to 125573 bytes.

| Path | A | B |
|---|---|---|
| $.rows[1].overdue | false | true |
| $.rows[5].overdue | false | true |
| $.glance.overdue.n | 1 | 3 |
| $.glance.overdue.ids.length | 1 | 3 |
| $.glance.overdue.ids[0] | INC-20260926-EB3B79 | INC-20261015-52768D |
| $.glance.overdue.ids[1] | (absent) | INC-20260926-EB3B79 |
| $.glance.overdue.ids[2] | (absent) | INC-20261026-B5525C |

### collector POST /api/map/ask

Session reads, id 56b0fe227c8f23a4, 14701 bytes to 14900 bytes.

| Path | A | B |
|---|---|---|
| $.brief.depts[0].overdue | 2 | 11 |
| $.brief.depts[0].overdueIds.length | 2 | 11 |
| $.brief.depts[0].overdueIds[0] | INC-20261102-543E58 | INC-20260928-A4DC12 |
| $.brief.depts[0].overdueIds[1] | INC-20261010-26EC2B | INC-20261018-D4DA09 |
| $.brief.depts[0].overdueIds[2] | (absent) | INC-20261106-444D4F |
| $.brief.depts[0].overdueIds[3] | (absent) | INC-20261025-174A67 |
| $.brief.depts[0].overdueIds[4] | (absent) | INC-20261102-543E58 |
| $.brief.depts[0].overdueIds[5] | (absent) | INC-20260609-28CA24 |
| $.brief.depts[0].overdueIds[6] | (absent) | INC-20261026-D6A041 |
| $.brief.depts[0].overdueIds[7] | (absent) | INC-20260826-57153E |
| $.brief.depts[0].overdueIds[8] | (absent) | INC-20261010-26EC2B |
| $.brief.depts[0].overdueIds[9] | (absent) | INC-20261007-DFDF59 |
| $.brief.depts[0].overdueIds[10] | (absent) | INC-20261102-7AD96F |

### collector POST /api/map/ask

Session reads, id 029c64275e967dd6, 20263 bytes to 20594 bytes.

| Path | A | B |
|---|---|---|
| $.brief.depts[0].overdue | 4 | 19 |
| $.brief.depts[0].overdueIds.length | 4 | 19 |
| $.brief.depts[0].overdueIds[2] | INC-20261010-26EC2B | INC-20261101-86BE85 |
| $.brief.depts[0].overdueIds[3] | INC-20261001-5E55F0 | INC-20260917-AC5526 |
| $.brief.depts[0].overdueIds[4] | (absent) | INC-20260729-706989 |
| $.brief.depts[0].overdueIds[5] | (absent) | INC-20260607-0A5AA8 |
| $.brief.depts[0].overdueIds[6] | (absent) | INC-20260927-6E2B80 |
| $.brief.depts[0].overdueIds[7] | (absent) | INC-20260906-6B7747 |
| $.brief.depts[0].overdueIds[8] | (absent) | INC-20260715-04B7B2 |
| $.brief.depts[0].overdueIds[9] | (absent) | INC-20261024-C97BC8 |
| $.brief.depts[0].overdueIds[10] | (absent) | INC-20261030-C2ACC2 |
| $.brief.depts[0].overdueIds[11] | (absent) | INC-20261026-D6A041 |
| $.brief.depts[0].overdueIds[12] | (absent) | INC-20261010-26EC2B |
| $.brief.depts[0].overdueIds[13] | (absent) | INC-20261001-5E55F0 |
| $.brief.depts[0].overdueIds[14] | (absent) | INC-20260818-EDDD47 |
| $.brief.depts[0].overdueIds[15] | (absent) | INC-20261031-CD94E2 |
| $.brief.depts[0].overdueIds[16] | (absent) | INC-20261029-C48214 |
| $.brief.depts[0].overdueIds[17] | (absent) | INC-20261007-DFDF59 |
| $.brief.depts[0].overdueIds[18] | (absent) | INC-20260725-369609 |

### collector POST /api/map/ask

Session reads, id 3ccf25a57b0a2586, 564083 bytes to 567722 bytes.

| Path | A | B |
|---|---|---|
| $.rows[56].overdue | false | true |
| $.rows[70].overdue | false | true |
| $.rows[82].overdue | false | true |
| $.rows[83].overdue | false | true |
| $.rows[85].overdue | false | true |
| $.rows[100].overdue | false | true |
| $.rows[104].overdue | false | true |
| $.rows[125].overdue | false | true |
| $.rows[156].overdue | false | true |
| $.rows[161].overdue | false | true |
| $.rows[185].overdue | false | true |
| $.rows[186].overdue | false | true |
| $.rows[187].overdue | false | true |
| $.rows[197].overdue | false | true |
| $.rows[199].overdue | false | true |
| $.glance.overdue.n | 339 | 505 |
| $.glance.overdue.ids.length | 339 | 505 |
| $.glance.overdue.ids[56] | INC-20261104-3B5138-2 | INC-20261102-98BDA9 |
| $.glance.overdue.ids[57] | INC-20261104-CD5940 | INC-20261104-3B5138-2 |
| $.glance.overdue.ids[58] | INC-20261021-238B98-1 | INC-20261104-CD5940 |
| $.glance.overdue.ids[59] | INC-20260513-493D82 | INC-20261021-238B98-1 |
| $.glance.overdue.ids[60] | INC-20261105-A9E19D | INC-20260513-493D82 |
| $.glance.overdue.ids[61] | INC-20261104-83D2C2 | INC-20261105-A9E19D |
| $.glance.overdue.ids[62] | INC-20261103-08F9E4 | INC-20261104-83D2C2 |
| $.glance.overdue.ids[63] | INC-20261104-3C1FF8 | INC-20261103-08F9E4 |

...and 441 more paths (see the JSON file).

### collector POST /api/map/ask

Session reads, id 1fe636173178017d, 564083 bytes to 567722 bytes.

| Path | A | B |
|---|---|---|
| $.rows[56].overdue | false | true |
| $.rows[70].overdue | false | true |
| $.rows[82].overdue | false | true |
| $.rows[83].overdue | false | true |
| $.rows[85].overdue | false | true |
| $.rows[100].overdue | false | true |
| $.rows[104].overdue | false | true |
| $.rows[125].overdue | false | true |
| $.rows[156].overdue | false | true |
| $.rows[161].overdue | false | true |
| $.rows[185].overdue | false | true |
| $.rows[186].overdue | false | true |
| $.rows[187].overdue | false | true |
| $.rows[197].overdue | false | true |
| $.rows[199].overdue | false | true |
| $.glance.overdue.n | 339 | 505 |
| $.glance.overdue.ids.length | 339 | 505 |
| $.glance.overdue.ids[56] | INC-20261104-3B5138-2 | INC-20261102-98BDA9 |
| $.glance.overdue.ids[57] | INC-20261104-CD5940 | INC-20261104-3B5138-2 |
| $.glance.overdue.ids[58] | INC-20261021-238B98-1 | INC-20261104-CD5940 |
| $.glance.overdue.ids[59] | INC-20260513-493D82 | INC-20261021-238B98-1 |
| $.glance.overdue.ids[60] | INC-20261105-A9E19D | INC-20260513-493D82 |
| $.glance.overdue.ids[61] | INC-20261104-83D2C2 | INC-20261105-A9E19D |
| $.glance.overdue.ids[62] | INC-20261103-08F9E4 | INC-20261104-83D2C2 |
| $.glance.overdue.ids[63] | INC-20261104-3C1FF8 | INC-20261103-08F9E4 |

...and 441 more paths (see the JSON file).

### collector POST /api/map/ask

Session reads, id a0a8d4fa5c53d52c, 564083 bytes to 567722 bytes.

| Path | A | B |
|---|---|---|
| $.rows[56].overdue | false | true |
| $.rows[70].overdue | false | true |
| $.rows[82].overdue | false | true |
| $.rows[83].overdue | false | true |
| $.rows[85].overdue | false | true |
| $.rows[100].overdue | false | true |
| $.rows[104].overdue | false | true |
| $.rows[125].overdue | false | true |
| $.rows[156].overdue | false | true |
| $.rows[161].overdue | false | true |
| $.rows[185].overdue | false | true |
| $.rows[186].overdue | false | true |
| $.rows[187].overdue | false | true |
| $.rows[197].overdue | false | true |
| $.rows[199].overdue | false | true |
| $.glance.overdue.n | 339 | 505 |
| $.glance.overdue.ids.length | 339 | 505 |
| $.glance.overdue.ids[56] | INC-20261104-3B5138-2 | INC-20261102-98BDA9 |
| $.glance.overdue.ids[57] | INC-20261104-CD5940 | INC-20261104-3B5138-2 |
| $.glance.overdue.ids[58] | INC-20261021-238B98-1 | INC-20261104-CD5940 |
| $.glance.overdue.ids[59] | INC-20260513-493D82 | INC-20261021-238B98-1 |
| $.glance.overdue.ids[60] | INC-20261105-A9E19D | INC-20260513-493D82 |
| $.glance.overdue.ids[61] | INC-20261104-83D2C2 | INC-20261105-A9E19D |
| $.glance.overdue.ids[62] | INC-20261103-08F9E4 | INC-20261104-83D2C2 |
| $.glance.overdue.ids[63] | INC-20261104-3C1FF8 | INC-20261103-08F9E4 |

...and 441 more paths (see the JSON file).

### collector POST /api/map/ask

Session reads, id 49814d1350c8d5ff, 564083 bytes to 567722 bytes.

| Path | A | B |
|---|---|---|
| $.rows[56].overdue | false | true |
| $.rows[70].overdue | false | true |
| $.rows[82].overdue | false | true |
| $.rows[83].overdue | false | true |
| $.rows[85].overdue | false | true |
| $.rows[100].overdue | false | true |
| $.rows[104].overdue | false | true |
| $.rows[125].overdue | false | true |
| $.rows[156].overdue | false | true |
| $.rows[161].overdue | false | true |
| $.rows[185].overdue | false | true |
| $.rows[186].overdue | false | true |
| $.rows[187].overdue | false | true |
| $.rows[197].overdue | false | true |
| $.rows[199].overdue | false | true |
| $.glance.overdue.n | 339 | 505 |
| $.glance.overdue.ids.length | 339 | 505 |
| $.glance.overdue.ids[56] | INC-20261104-3B5138-2 | INC-20261102-98BDA9 |
| $.glance.overdue.ids[57] | INC-20261104-CD5940 | INC-20261104-3B5138-2 |
| $.glance.overdue.ids[58] | INC-20261021-238B98-1 | INC-20261104-CD5940 |
| $.glance.overdue.ids[59] | INC-20260513-493D82 | INC-20261021-238B98-1 |
| $.glance.overdue.ids[60] | INC-20261105-A9E19D | INC-20260513-493D82 |
| $.glance.overdue.ids[61] | INC-20261104-83D2C2 | INC-20261105-A9E19D |
| $.glance.overdue.ids[62] | INC-20261103-08F9E4 | INC-20261104-83D2C2 |
| $.glance.overdue.ids[63] | INC-20261104-3C1FF8 | INC-20261103-08F9E4 |

...and 441 more paths (see the JSON file).

### collector POST /api/map/ask

Session reads, id e44825a3b4fd654e, 564083 bytes to 567722 bytes.

| Path | A | B |
|---|---|---|
| $.rows[56].overdue | false | true |
| $.rows[70].overdue | false | true |
| $.rows[82].overdue | false | true |
| $.rows[83].overdue | false | true |
| $.rows[85].overdue | false | true |
| $.rows[100].overdue | false | true |
| $.rows[104].overdue | false | true |
| $.rows[125].overdue | false | true |
| $.rows[156].overdue | false | true |
| $.rows[161].overdue | false | true |
| $.rows[185].overdue | false | true |
| $.rows[186].overdue | false | true |
| $.rows[187].overdue | false | true |
| $.rows[197].overdue | false | true |
| $.rows[199].overdue | false | true |
| $.glance.overdue.n | 339 | 505 |
| $.glance.overdue.ids.length | 339 | 505 |
| $.glance.overdue.ids[56] | INC-20261104-3B5138-2 | INC-20261102-98BDA9 |
| $.glance.overdue.ids[57] | INC-20261104-CD5940 | INC-20261104-3B5138-2 |
| $.glance.overdue.ids[58] | INC-20261021-238B98-1 | INC-20261104-CD5940 |
| $.glance.overdue.ids[59] | INC-20260513-493D82 | INC-20261021-238B98-1 |
| $.glance.overdue.ids[60] | INC-20261105-A9E19D | INC-20260513-493D82 |
| $.glance.overdue.ids[61] | INC-20261104-83D2C2 | INC-20261105-A9E19D |
| $.glance.overdue.ids[62] | INC-20261103-08F9E4 | INC-20261104-83D2C2 |
| $.glance.overdue.ids[63] | INC-20261104-3C1FF8 | INC-20261103-08F9E4 |

...and 441 more paths (see the JSON file).

### collector POST /api/map/ask (follow-up)

Session reads, id 6131819989edda5f, 17734 bytes to 17789 bytes.

| Path | A | B |
|---|---|---|
| $.rows[4].overdue | false | true |
| $.rows[5].overdue | false | true |
| $.rows[6].overdue | false | true |
| $.rows[7].overdue | false | true |
| $.glance.overdue.n | 4 | 8 |
| $.glance.overdue.ids.length | 4 | 8 |
| $.glance.overdue.ids[4] | (absent) | INC-20261028-54740E |
| $.glance.overdue.ids[5] | (absent) | INC-20261018-D4DA09 |
| $.glance.overdue.ids[6] | (absent) | INC-20261101-86BE85 |
| $.glance.overdue.ids[7] | (absent) | INC-20261023-2256D5 |
| $.followups.length | 4 | 3 |
| $.followups[0] | Show only the overdue ones | Send these to Greater Chennai Police |
| $.followups[1] | Send these to Greater Chennai Police | Near schools |
| $.followups[2] | Near schools | Last 7 days |
| $.followups[3] | Last 7 days | (absent) |

### collector POST /api/map/ask (follow-up)

Session reads, id d91e1460c8cfcd9f, 564854 bytes to 568493 bytes.

| Path | A | B |
|---|---|---|
| $.rows[56].overdue | false | true |
| $.rows[70].overdue | false | true |
| $.rows[82].overdue | false | true |
| $.rows[83].overdue | false | true |
| $.rows[85].overdue | false | true |
| $.rows[100].overdue | false | true |
| $.rows[104].overdue | false | true |
| $.rows[125].overdue | false | true |
| $.rows[156].overdue | false | true |
| $.rows[161].overdue | false | true |
| $.rows[185].overdue | false | true |
| $.rows[186].overdue | false | true |
| $.rows[187].overdue | false | true |
| $.rows[197].overdue | false | true |
| $.rows[199].overdue | false | true |
| $.glance.overdue.n | 339 | 505 |
| $.glance.overdue.ids.length | 339 | 505 |
| $.glance.overdue.ids[56] | INC-20261104-3B5138-2 | INC-20261102-98BDA9 |
| $.glance.overdue.ids[57] | INC-20261104-CD5940 | INC-20261104-3B5138-2 |
| $.glance.overdue.ids[58] | INC-20261021-238B98-1 | INC-20261104-CD5940 |
| $.glance.overdue.ids[59] | INC-20260513-493D82 | INC-20261021-238B98-1 |
| $.glance.overdue.ids[60] | INC-20261105-A9E19D | INC-20260513-493D82 |
| $.glance.overdue.ids[61] | INC-20261104-83D2C2 | INC-20261105-A9E19D |
| $.glance.overdue.ids[62] | INC-20261103-08F9E4 | INC-20261104-83D2C2 |
| $.glance.overdue.ids[63] | INC-20261104-3C1FF8 | INC-20261103-08F9E4 |

...and 441 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent

Session reads, id b709a6b7afee2afd, 10663 bytes to 11797 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway | null | {object with 2 keys} |
| $.result.stage.say.en | 114 cases this week; here are the 12 that matter most. The most urgent: uncleared garbage at Thangavel Pillai Thottam 3Rd Street, Thangavel ... (263 chars) | 122 cases this week; here are the 12 that matter most. 35 are past their deadline and need you first: uncleared garbage at Durgadevi Nagar 5... (339 chars) |
| $.result.stage.say.ta | இந்த வாரம் 114 சம்பவங்கள். மிக அவசரமானது: uncleared garbage at Thangavel Pillai Thottam 3Rd Street, Thangavel Pillai Thottam, Korukkupet in ... (230 chars) | இந்த வாரம் 122 சம்பவங்கள். 35 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Durgadevi Nagar 5Th Cross St 2Nd Lane, Du... (317 chars) |
| $.result.stage.blocks[0].items.length | 3 | 2 |
| $.result.stage.blocks[0].items[0].value | 114 | 122 |
| $.result.stage.blocks[0].items[1].value | 0 | 35 |
| $.result.stage.blocks[0].items[1].tone | good | bad |
| $.result.stage.blocks[0].items[2] | {object with 8 keys} | (absent) |
| $.result.stage.blocks[1].total | 114 | 122 |
| $.result.stage.blocks[1].rows[0].id | INC-20261106-896A64 | INC-20261104-EA19E3 |
| $.result.stage.blocks[1].rows[0].title | Thangavel Pillai Thottam people sarbaaga indha complaint | குப்பை பிரச்சினை: Burning of Garbage at Dumping Ground |
| $.result.stage.blocks[1].rows[0].sev | Low | High |
| $.result.stage.blocks[1].rows[0].status | Open | In progress |
| $.result.stage.blocks[1].rows[0].place | Thangavel Pillai Thottam 3Rd Street, Thangavel Pillai Thottam, Korukkupet | Durgadevi Nagar 5Th Cross St 2Nd Lane, Durga Devi Nagar, Tondiarpet |
| $.result.stage.blocks[1].rows[0].ward | 48 | 38 |
| $.result.stage.blocks[1].rows[0].t | 2026-11-06 18:08:00 | 2026-11-04 00:52:00 |
| $.result.stage.blocks[1].rows[0].overdue | false | true |
| $.result.stage.blocks[1].rows[0].lat | 13.1145099 | 13.1297495 |
| $.result.stage.blocks[1].rows[0].lon | 80.2837677 | 80.2746615 |
| $.result.stage.blocks[1].rows[1].id | INC-20261106-2AB4CB | INC-20261103-8989A6 |
| $.result.stage.blocks[1].rows[1].title | Issue regarding removal of garbage in our street | Huge garbage dump near Murugan Temple bus stop, not cleared for two weeks now |
| $.result.stage.blocks[1].rows[1].sev | Low | High |
| $.result.stage.blocks[1].rows[1].status | Under review | Awaiting verification |
| $.result.stage.blocks[1].rows[1].zone | 1 | 11 |
| $.result.stage.blocks[1].rows[1].zoneName | Thiruvottiyur | Valasaravakkam |

...and 206 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent

Session reads, id ea25e31de4431e9c, 12225 bytes to 11951 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 12 of the 12 shown are past their deadline. | 54 of the 52 are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 12-இல் 12 காலக்கெடுவைத் தாண்டியவை. | 52-இல் 54 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 52 severe cases this week; here are the 12 that matter most. 12 are past their deadline and need you first: standing water at Pulianthope (B... (319 chars) | 52 severe cases this week; here are the 12 that matter most. 54 are past their deadline and need you first: standing water at Pulianthope (B... (281 chars) |
| $.result.stage.say.ta | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 12 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Pulianthope (Buckingham Canal - Basi... (290 chars) | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 54 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Pulianthope (Buckingham Canal - Basi... (261 chars) |
| $.result.stage.blocks[0].items.length | 3 | 2 |
| $.result.stage.blocks[0].items[1].value | 12 | 54 |
| $.result.stage.blocks[0].items[2] | {object with 8 keys} | (absent) |
| $.result.stage.sources.length | 1 | 2 |
| $.result.stage.sources[1] | (absent) | incidents |
| $.result.say | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 12 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Pulianthope (Buckingham Canal - Basi... (290 chars) | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 54 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Pulianthope (Buckingham Canal - Basi... (261 chars) |

### collector POST /api/collector/thunai/agent

Session reads, id 2bb2d79b381a6eec, 171 bytes to 171 bytes.

| Path | A | B |
|---|---|---|
| $.result.lang | en | ta |

### collector POST /api/collector/assistant/chat

Session reads, id fff6d71bc1437071, 2165 bytes to 2111 bytes.

| Path | A | B |
|---|---|---|
| $[5].data.headline | 2 matching incidents in the last 24 hours | No incidents or news reports match that in the last 24 hours |
| $[5].data.answerMarkdown | 2 matching incidents in the last 24 hours. | No incidents or news reports match that in the last 24 hours. |
| $[5].data.voiceSummary | 2 matching incidents in the last 24 hours | No incidents or news reports match that in the last 24 hours |
| $[5].data.consoleActions.length | 1 | 0 |
| $[5].data.consoleActions[0] | {object with 8 keys} | (absent) |
| $[5].data.caveats[0] | Searched the incident records for the words "death" in the last 24 hours; the meaning search is not available right now. | Could not search: the meaning search is not available right now, and the question has no word to look for in the titles. Nothing was searche... (189 chars) |
| $[5].data.sources.refs[0].detail | title or place contains: death | title or place contains: (no words to search) |
| $[5].data.sources.incidentIds.length | 2 | 0 |
| $[5].data.sources.incidentIds[0] | INC-20261106-A40AD7 | (absent) |
| $[5].data.sources.incidentIds[1] | INC-20260905-319067 | (absent) |

### collector POST /api/collector/assistant/chat

Session reads, id 820440c29a0782fc, 4395 bytes to 4402 bytes.

| Path | A | B |
|---|---|---|
| $[5].data.headline | 15,115 reported · 2,411 still open · 888 past deadline | 15,115 reported · 2,411 still open · 1,632 past deadline |
| $[5].data.answerMarkdown | In the last 90 days: **15,115** reported, **2,411** still open, **888** past deadline, **596** severe. | In the last 90 days: **15,115** reported, **2,411** still open, **1,632** past deadline, **596** severe. |
| $[5].data.voiceSummary | In the last 90 days: 15,115 reported, 2,411 still open, 888 past deadline, 596 severe. | In the last 90 days: 15,115 reported, 2,411 still open, 1,632 past deadline, 596 severe. |
| $[5].data.kpis[2].value | 888 | 1632 |

### officerA POST /api/collector/assistant/chat

Session reads, id 875d1dd5adf41fe6, 3687 bytes to 3686 bytes.

| Path | A | B |
|---|---|---|
| $[5].data.answerMarkdown | In the last 90 days: **0** severe events, **100** open citizen complaints, **96** ongoing incidents, **1,532** resolved this quarter. | In the last 90 days: **0** severe events, **100** open citizen complaints, **96** ongoing incidents, **1,609** resolved this quarter. |
| $[5].data.voiceSummary | In the last 90 days: 0 severe events, 100 open citizen complaints, 96 ongoing incidents, 1,532 resolved this quarter. | In the last 90 days: 0 severe events, 100 open citizen complaints, 96 ongoing incidents, 1,609 resolved this quarter. |
| $[5].data.datasets[0].rows[0].resolved | 108 | 95 |
| $[5].data.datasets[0].rows[1].resolved | 108 | 92 |
| $[5].data.datasets[0].rows[2].resolved | 143 | 144 |
| $[5].data.datasets[0].rows[3].resolved | 134 | 130 |
| $[5].data.datasets[0].rows[4].resolved | 122 | 132 |
| $[5].data.datasets[0].rows[5].resolved | 127 | 123 |
| $[5].data.datasets[0].rows[6].resolved | 122 | 121 |
| $[5].data.datasets[0].rows[7].resolved | 112 | 114 |
| $[5].data.datasets[0].rows[8].resolved | 143 | 137 |
| $[5].data.datasets[0].rows[9].resolved | 104 | 133 |
| $[5].data.datasets[0].rows[10].resolved | 139 | 127 |
| $[5].data.datasets[0].rows[11].resolved | 131 | 132 |
| $[5].data.datasets[0].rows[12].resolved | 39 | 129 |
| $[5].data.kpis[3].value | 1532 | 1609 |
| $[5].data.kpis[3].prev | 1504 | 1427 |

### officerA POST /api/collector/assistant/chat

Session reads, id 89b6467a8ed65684, 2051 bytes to 2133 bytes.

| Path | A | B |
|---|---|---|
| $[5].data.caveats[0] | Searched the incident records for the words "death" in the last 24 hours; the meaning search is not available right now. | Could not search: the meaning search is not available right now, and the question has no word to look for in the titles. Nothing was searche... (189 chars) |
| $[5].data.sources.refs[0].detail | title or place contains: death | title or place contains: (no words to search) |

### officerA GET /api/officer/overview

Session reads2, id d5fe93253323aca0, 154627 bytes to 156324 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 461 | 567 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 541 | 535 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 19 | 22 |
| $.board.kpi.series.resolved[1] | 23 | 18 |
| $.board.kpi.series.resolved[2] | 16 | 20 |
| $.board.kpi.series.resolved[3] | 11 | 24 |
| $.board.kpi.series.resolved[4] | 15 | 19 |
| $.board.kpi.series.resolved[5] | 17 | 19 |
| $.board.kpi.series.resolved[6] | 14 | 17 |
| $.board.kpi.series.resolved[7] | 13 | 14 |
| $.board.kpi.series.resolved[8] | 17 | 21 |
| $.board.kpi.series.resolved[9] | 19 | 11 |
| $.board.kpi.series.resolved[10] | 22 | 16 |
| $.board.kpi.series.resolved[11] | 16 | 25 |

...and 59 more paths (see the JSON file).

### officerA GET /api/officer/overview?period=daily

Session reads2, id 441a25b61259b8f3, 53008 bytes to 53935 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 0 | 17 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 0 | 18 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 0 | 1 |
| $.board.kpi.series.resolved[1] | 0 | 1 |
| $.board.kpi.series.resolved[2] | 0 | 1 |
| $.board.kpi.series.resolved[3] | 0 | 3 |
| $.board.kpi.series.resolved[4] | 0 | 2 |
| $.board.kpi.series.resolved[5] | 0 | 1 |
| $.board.kpi.series.resolved[6] | 0 | 1 |
| $.board.kpi.series.resolved[7] | 0 | 2 |
| $.board.kpi.series.resolved[8] | 0 | 1 |
| $.board.kpi.series.resolved[9] | 0 | 2 |
| $.board.kpi.series.resolved[10] | 0 | 1 |
| $.board.kpi.series.resolved[11] | 0 | 1 |

...and 18 more paths (see the JSON file).

### officerA GET /api/officer/overview?period=weekly

Session reads2, id 07fe15dfe199c3e8, 117434 bytes to 118780 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 40 | 131 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 135 | 141 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 11 | 28 |
| $.board.kpi.series.resolved[1] | 10 | 18 |
| $.board.kpi.series.resolved[2] | 10 | 15 |
| $.board.kpi.series.resolved[3] | 7 | 16 |
| $.board.kpi.series.resolved[4] | 2 | 19 |
| $.board.kpi.series.resolved[5] | 0 | 18 |
| $.board.kpi.series.resolved[6] | 0 | 17 |
| $.board.severity.rows[0].sla_due | (absent) | 2026-11-04 08:45:00 |
| $.board.severity.rows[1].sla_due | (absent) | 2026-11-05 00:52:00 |
| $.board.severity.rows[2].sla_due | (absent) | 2026-11-03 10:37:00 |
| $.board.severity.rows[3].sla_due | (absent) | 2026-11-02 15:39:00 |
| $.board.severity.rows[4].sla_due | (absent) | 2026-11-04 10:29:00 |

...and 26 more paths (see the JSON file).

### officerA GET /api/officer/overview?period=monthly

Session reads2, id db785c40238d8cf7, 154627 bytes to 156324 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 461 | 567 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 541 | 535 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 19 | 22 |
| $.board.kpi.series.resolved[1] | 23 | 18 |
| $.board.kpi.series.resolved[2] | 16 | 20 |
| $.board.kpi.series.resolved[3] | 11 | 24 |
| $.board.kpi.series.resolved[4] | 15 | 19 |
| $.board.kpi.series.resolved[5] | 17 | 19 |
| $.board.kpi.series.resolved[6] | 14 | 17 |
| $.board.kpi.series.resolved[7] | 13 | 14 |
| $.board.kpi.series.resolved[8] | 17 | 21 |
| $.board.kpi.series.resolved[9] | 19 | 11 |
| $.board.kpi.series.resolved[10] | 22 | 16 |
| $.board.kpi.series.resolved[11] | 16 | 25 |

...and 59 more paths (see the JSON file).

### officerA GET /api/officer/overview?period=quarterly

Session reads2, id 85b96b4893843e0f, 162714 bytes to 164566 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 1532 | 1609 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 1504 | 1427 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 108 | 95 |
| $.board.kpi.series.resolved[1] | 108 | 92 |
| $.board.kpi.series.resolved[2] | 143 | 144 |
| $.board.kpi.series.resolved[3] | 134 | 130 |
| $.board.kpi.series.resolved[4] | 122 | 132 |
| $.board.kpi.series.resolved[5] | 127 | 123 |
| $.board.kpi.series.resolved[6] | 122 | 121 |
| $.board.kpi.series.resolved[7] | 112 | 114 |
| $.board.kpi.series.resolved[8] | 143 | 137 |
| $.board.kpi.series.resolved[9] | 104 | 133 |
| $.board.kpi.series.resolved[10] | 139 | 127 |
| $.board.kpi.series.resolved[11] | 131 | 132 |

...and 48 more paths (see the JSON file).

### officerA GET /api/officer/overview?taluk=TLK-MYL

Session reads2, id 92c67f518d59d3c0, 53181 bytes to 53914 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 46 | 53 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 35 | 36 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 0 | 3 |
| $.board.kpi.series.resolved[1] | 2 | 1 |
| $.board.kpi.series.resolved[2] | 3 | 1 |
| $.board.kpi.series.resolved[4] | 0 | 1 |
| $.board.kpi.series.resolved[5] | 2 | 1 |
| $.board.kpi.series.resolved[6] | 4 | 1 |
| $.board.kpi.series.resolved[8] | 2 | 0 |
| $.board.kpi.series.resolved[9] | 2 | 1 |
| $.board.kpi.series.resolved[10] | 6 | 3 |
| $.board.kpi.series.resolved[11] | 0 | 5 |
| $.board.kpi.series.resolved[12] | 1 | 0 |
| $.board.kpi.series.resolved[13] | 1 | 3 |

...and 27 more paths (see the JSON file).

### officerA GET /api/officer/overview?taluk=TLK-SHN

Session reads2, id 500e575fb6ecca05, 36903 bytes to 37540 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 23 | 31 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 50 | 46 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 0 | 1 |
| $.board.kpi.series.resolved[1] | 3 | 1 |
| $.board.kpi.series.resolved[3] | 0 | 3 |
| $.board.kpi.series.resolved[4] | 0 | 2 |
| $.board.kpi.series.resolved[5] | 2 | 0 |
| $.board.kpi.series.resolved[8] | 0 | 2 |
| $.board.kpi.series.resolved[9] | 4 | 1 |
| $.board.kpi.series.resolved[10] | 3 | 1 |
| $.board.kpi.series.resolved[11] | 1 | 0 |
| $.board.kpi.series.resolved[13] | 0 | 2 |
| $.board.kpi.series.resolved[14] | 0 | 4 |
| $.board.kpi.series.resolved[15] | 0 | 1 |

...and 18 more paths (see the JSON file).

### officerA GET /api/officer/overview?zone=5

Session reads2, id 38e2edb8a6c030de, 58523 bytes to 59320 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 42 | 51 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 49 | 48 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 2 | 3 |
| $.board.kpi.series.resolved[1] | 1 | 0 |
| $.board.kpi.series.resolved[2] | 3 | 2 |
| $.board.kpi.series.resolved[3] | 2 | 0 |
| $.board.kpi.series.resolved[5] | 1 | 3 |
| $.board.kpi.series.resolved[6] | 1 | 2 |
| $.board.kpi.series.resolved[8] | 1 | 3 |
| $.board.kpi.series.resolved[9] | 2 | 1 |
| $.board.kpi.series.resolved[10] | 1 | 2 |
| $.board.kpi.series.resolved[11] | 3 | 0 |
| $.board.kpi.series.resolved[13] | 2 | 1 |
| $.board.kpi.series.resolved[15] | 2 | 3 |

...and 22 more paths (see the JSON file).

### officerA GET /api/officer/overview?zone=13

Session reads2, id 57cfe5cd1d9db7a3, 42512 bytes to 43181 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 38 | 42 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 35 | 38 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[1] | 2 | 0 |
| $.board.kpi.series.resolved[2] | 0 | 3 |
| $.board.kpi.series.resolved[3] | 0 | 1 |
| $.board.kpi.series.resolved[4] | 2 | 1 |
| $.board.kpi.series.resolved[5] | 3 | 0 |
| $.board.kpi.series.resolved[6] | 2 | 0 |
| $.board.kpi.series.resolved[7] | 0 | 2 |
| $.board.kpi.series.resolved[9] | 1 | 0 |
| $.board.kpi.series.resolved[11] | 0 | 5 |
| $.board.kpi.series.resolved[12] | 1 | 0 |
| $.board.kpi.series.resolved[13] | 2 | 0 |
| $.board.kpi.series.resolved[14] | 0 | 1 |

...and 24 more paths (see the JSON file).

### officerA GET /api/officer/overview?zone=1

Session reads2, id a26ac44e418874dc, 31306 bytes to 31879 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 24 | 33 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 40 | 38 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[3] | 0 | 2 |
| $.board.kpi.series.resolved[4] | 0 | 2 |
| $.board.kpi.series.resolved[5] | 0 | 2 |
| $.board.kpi.series.resolved[7] | 1 | 0 |
| $.board.kpi.series.resolved[8] | 2 | 1 |
| $.board.kpi.series.resolved[9] | 1 | 0 |
| $.board.kpi.series.resolved[10] | 3 | 1 |
| $.board.kpi.series.resolved[11] | 1 | 3 |
| $.board.kpi.series.resolved[13] | 0 | 2 |
| $.board.kpi.series.resolved[14] | 2 | 1 |
| $.board.kpi.series.resolved[15] | 4 | 1 |
| $.board.kpi.series.resolved[16] | 0 | 2 |

...and 14 more paths (see the JSON file).

### officerA GET /api/officer/overview?period=weekly&zone=5

Session reads2, id 98b30c85358edf73, 35612 bytes to 36281 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 2 | 7 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 12 | 17 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 1 | 2 |
| $.board.kpi.series.resolved[1] | 0 | 1 |
| $.board.kpi.series.resolved[3] | 0 | 1 |
| $.board.kpi.series.resolved[5] | 0 | 2 |
| $.board.severity.rows[0].sla_due | (absent) | 2026-11-02 15:39:00 |
| $.board.severity.rows[1].sla_due | (absent) | 2026-11-05 16:03:00 |
| $.board.severity.rows[2].sla_due | (absent) | 2026-11-08 08:45:00 |
| $.board.severity.rows[3].sla_due | (absent) | 2026-11-07 10:44:00 |
| $.board.severity.rows[4].sla_due | (absent) | 2026-11-08 22:39:00 |
| $.board.severity.rows[5].sla_due | (absent) | 2026-11-09 08:25:00 |
| $.board.severity.rows[6].sla_due | (absent) | 2026-11-07 10:17:00 |
| $.board.news[0].sla_due | (absent) | 2026-11-07 03:56:22 |

...and 2 more paths (see the JSON file).

### officerA GET /api/officer/overview?period=monthly&zone=13

Session reads2, id 3721d050a2e51302, 42512 bytes to 43181 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 38 | 42 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 35 | 38 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[1] | 2 | 0 |
| $.board.kpi.series.resolved[2] | 0 | 3 |
| $.board.kpi.series.resolved[3] | 0 | 1 |
| $.board.kpi.series.resolved[4] | 2 | 1 |
| $.board.kpi.series.resolved[5] | 3 | 0 |
| $.board.kpi.series.resolved[6] | 2 | 0 |
| $.board.kpi.series.resolved[7] | 0 | 2 |
| $.board.kpi.series.resolved[9] | 1 | 0 |
| $.board.kpi.series.resolved[11] | 0 | 5 |
| $.board.kpi.series.resolved[12] | 1 | 0 |
| $.board.kpi.series.resolved[13] | 2 | 0 |
| $.board.kpi.series.resolved[14] | 0 | 1 |

...and 24 more paths (see the JSON file).

### officerA GET /api/officer/overview?period=quarterly&zone=1

Session reads2, id be5f27a89fd0abd9, 52964 bytes to 53537 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 101 | 106 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 100 | 95 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[1] | 4 | 7 |
| $.board.kpi.series.resolved[2] | 14 | 5 |
| $.board.kpi.series.resolved[3] | 7 | 13 |
| $.board.kpi.series.resolved[5] | 9 | 10 |
| $.board.kpi.series.resolved[6] | 13 | 10 |
| $.board.kpi.series.resolved[7] | 5 | 4 |
| $.board.kpi.series.resolved[8] | 11 | 12 |
| $.board.kpi.series.resolved[9] | 6 | 8 |
| $.board.kpi.series.resolved[10] | 12 | 9 |
| $.board.kpi.series.resolved[11] | 4 | 10 |
| $.board.kpi.series.resolved[12] | 0 | 2 |
| $.board.severity.rows[0].sla_due | (absent) | 2026-10-21 06:16:00 |

...and 6 more paths (see the JSON file).

### officerA GET /api/officer/overview?period=weekly&taluk=TLK-MYL

Session reads2, id e02128e36e5b6561, 32527 bytes to 33165 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 2 | 10 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 12 | 15 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 0 | 2 |
| $.board.kpi.series.resolved[1] | 0 | 1 |
| $.board.kpi.series.resolved[3] | 1 | 2 |
| $.board.kpi.series.resolved[4] | 0 | 2 |
| $.board.kpi.series.resolved[5] | 0 | 1 |
| $.board.kpi.series.resolved[6] | 0 | 1 |
| $.board.severity.rows[0].sla_due | (absent) | 2026-11-04 10:29:00 |
| $.board.severity.rows[1].sla_due | (absent) | 2026-11-05 19:40:00 |
| $.board.severity.rows[2].sla_due | (absent) | 2026-11-01 18:55:00 |
| $.board.severity.rows[3].sla_due | (absent) | 2026-11-07 12:59:00 |
| $.board.severity.rows[4].sla_due | (absent) | 2026-11-05 10:27:00 |
| $.board.severity.rows[5].sla_due | (absent) | 2026-11-09 02:15:00 |

...and 3 more paths (see the JSON file).

### officerB GET /api/officer/insights?period=quarterly

Session reads2, id 4d047fa2b444ad69, 6368 bytes to 6368 bytes.

| Path | A | B |
|---|---|---|
| $.modules[2].kpis[2].value | 14% | 13% |
| $.modules[2].notes[1] | 14% of the closed ones met their deadline. | 13% of the closed ones met their deadline. |

### officerB GET /api/officer/overview

Session reads2, id 3c441be835c7ba16, 171549 bytes to 173469 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 272 | 339 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 315 | 339 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 12 | 10 |
| $.board.kpi.series.resolved[1] | 10 | 4 |
| $.board.kpi.series.resolved[2] | 10 | 7 |
| $.board.kpi.series.resolved[3] | 8 | 9 |
| $.board.kpi.series.resolved[4] | 10 | 16 |
| $.board.kpi.series.resolved[5] | 10 | 11 |
| $.board.kpi.series.resolved[6] | 9 | 12 |
| $.board.kpi.series.resolved[7] | 11 | 10 |
| $.board.kpi.series.resolved[8] | 9 | 10 |
| $.board.kpi.series.resolved[10] | 14 | 8 |
| $.board.kpi.series.resolved[11] | 8 | 9 |
| $.board.kpi.series.resolved[12] | 12 | 14 |

...and 66 more paths (see the JSON file).

### officerB GET /api/officer/overview?period=daily

Session reads2, id 4e7f746f9dee669b, 68272 bytes to 69358 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 0 | 11 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 0 | 7 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 0 | 1 |
| $.board.kpi.series.resolved[1] | 0 | 3 |
| $.board.kpi.series.resolved[3] | 0 | 2 |
| $.board.kpi.series.resolved[6] | 0 | 2 |
| $.board.kpi.series.resolved[7] | 0 | 2 |
| $.board.kpi.series.resolved[11] | 0 | 1 |
| $.board.severity.rows[0].sla_due | (absent) | 2026-11-07 16:46:00 |
| $.board.severity.rows[1].sla_due | (absent) | 2026-11-06 19:03:00 |
| $.board.severity.rows[2].sla_due | (absent) | 2026-11-08 16:35:00 |
| $.board.severity.rows[3].sla_due | (absent) | 2026-11-08 14:46:00 |
| $.board.severity.rows[4].sla_due | (absent) | 2026-11-08 08:11:00 |
| $.board.severity.rows[5].sla_due | (absent) | 2026-11-07 19:18:00 |

...and 17 more paths (see the JSON file).

### officerB GET /api/officer/overview?period=weekly

Session reads2, id 8a0733085b00209d, 146884 bytes to 148646 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 14 | 73 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 74 | 102 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 6 | 14 |
| $.board.kpi.series.resolved[1] | 5 | 14 |
| $.board.kpi.series.resolved[2] | 2 | 14 |
| $.board.kpi.series.resolved[3] | 1 | 6 |
| $.board.kpi.series.resolved[4] | 0 | 7 |
| $.board.kpi.series.resolved[5] | 0 | 7 |
| $.board.kpi.series.resolved[6] | 0 | 11 |
| $.board.severity.rows[0].sla_due | (absent) | 2026-11-02 04:10:35 |
| $.board.severity.rows[1].sla_due | (absent) | 2026-11-02 08:59:21 |
| $.board.severity.rows[2].sla_due | (absent) | 2026-11-05 12:51:00 |
| $.board.severity.rows[3].sla_due | (absent) | 2026-11-05 17:24:00 |
| $.board.severity.rows[4].sla_due | (absent) | 2026-10-31 23:57:08 |

...and 39 more paths (see the JSON file).

### officerB GET /api/officer/overview?period=monthly

Session reads2, id b82fcdbaaf06d94e, 171549 bytes to 173469 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 272 | 339 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 315 | 339 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 12 | 10 |
| $.board.kpi.series.resolved[1] | 10 | 4 |
| $.board.kpi.series.resolved[2] | 10 | 7 |
| $.board.kpi.series.resolved[3] | 8 | 9 |
| $.board.kpi.series.resolved[4] | 10 | 16 |
| $.board.kpi.series.resolved[5] | 10 | 11 |
| $.board.kpi.series.resolved[6] | 9 | 12 |
| $.board.kpi.series.resolved[7] | 11 | 10 |
| $.board.kpi.series.resolved[8] | 9 | 10 |
| $.board.kpi.series.resolved[10] | 14 | 8 |
| $.board.kpi.series.resolved[11] | 8 | 9 |
| $.board.kpi.series.resolved[12] | 12 | 14 |

...and 66 more paths (see the JSON file).

### officerB GET /api/officer/overview?period=quarterly

Session reads2, id 14cf00a60884dd89, 196039 bytes to 198469 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 956 | 1020 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 913 | 849 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 89 | 76 |
| $.board.kpi.series.resolved[1] | 76 | 81 |
| $.board.kpi.series.resolved[2] | 85 | 76 |
| $.board.kpi.series.resolved[3] | 80 | 84 |
| $.board.kpi.series.resolved[4] | 91 | 80 |
| $.board.kpi.series.resolved[5] | 67 | 84 |
| $.board.kpi.series.resolved[6] | 102 | 81 |
| $.board.kpi.series.resolved[7] | 53 | 82 |
| $.board.kpi.series.resolved[8] | 64 | 52 |
| $.board.kpi.series.resolved[9] | 68 | 75 |
| $.board.kpi.series.resolved[10] | 97 | 76 |
| $.board.kpi.series.resolved[11] | 71 | 101 |

...and 66 more paths (see the JSON file).

### officerB GET /api/officer/overview?taluk=TLK-MYL

Session reads2, id 1f4b7883e5657b0c, 38834 bytes to 39567 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 21 | 24 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 33 | 36 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[1] | 1 | 0 |
| $.board.kpi.series.resolved[2] | 0 | 1 |
| $.board.kpi.series.resolved[3] | 1 | 0 |
| $.board.kpi.series.resolved[9] | 0 | 2 |
| $.board.kpi.series.resolved[10] | 3 | 1 |
| $.board.kpi.series.resolved[12] | 1 | 0 |
| $.board.kpi.series.resolved[13] | 4 | 0 |
| $.board.kpi.series.resolved[14] | 2 | 1 |
| $.board.kpi.series.resolved[16] | 2 | 0 |
| $.board.kpi.series.resolved[17] | 1 | 2 |
| $.board.kpi.series.resolved[18] | 1 | 4 |
| $.board.kpi.series.resolved[19] | 0 | 1 |

...and 16 more paths (see the JSON file).

### officerB GET /api/officer/overview?taluk=TLK-SHN

Session reads2, id d5b65ebbc00a62de, 29682 bytes to 30319 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 15 | 20 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 1 | 0 |
| $.board.kpi.series.resolved[2] | 1 | 0 |
| $.board.kpi.series.resolved[3] | 0 | 1 |
| $.board.kpi.series.resolved[4] | 2 | 3 |
| $.board.kpi.series.resolved[5] | 0 | 2 |
| $.board.kpi.series.resolved[8] | 1 | 0 |
| $.board.kpi.series.resolved[9] | 0 | 2 |
| $.board.kpi.series.resolved[14] | 2 | 0 |
| $.board.kpi.series.resolved[15] | 1 | 0 |
| $.board.kpi.series.resolved[16] | 1 | 0 |
| $.board.kpi.series.resolved[19] | 1 | 0 |
| $.board.kpi.series.resolved[20] | 2 | 1 |
| $.board.kpi.series.resolved[21] | 0 | 1 |

...and 14 more paths (see the JSON file).

### officerB GET /api/officer/overview?zone=5

Session reads2, id 85538e299bdddf90, 72162 bytes to 73183 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 27 | 34 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 19 | 27 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 2 | 1 |
| $.board.kpi.series.resolved[1] | 3 | 0 |
| $.board.kpi.series.resolved[2] | 1 | 2 |
| $.board.kpi.series.resolved[3] | 0 | 1 |
| $.board.kpi.series.resolved[4] | 0 | 2 |
| $.board.kpi.series.resolved[7] | 0 | 1 |
| $.board.kpi.series.resolved[8] | 2 | 1 |
| $.board.kpi.series.resolved[9] | 2 | 1 |
| $.board.kpi.series.resolved[10] | 1 | 0 |
| $.board.kpi.series.resolved[12] | 0 | 3 |
| $.board.kpi.series.resolved[13] | 3 | 1 |
| $.board.kpi.series.resolved[14] | 1 | 0 |

...and 32 more paths (see the JSON file).

### officerB GET /api/officer/overview?zone=13

Session reads2, id 7ff683d1103a192d, 36658 bytes to 37359 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 17 | 21 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 24 | 31 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 0 | 1 |
| $.board.kpi.series.resolved[2] | 1 | 0 |
| $.board.kpi.series.resolved[3] | 1 | 0 |
| $.board.kpi.series.resolved[4] | 0 | 2 |
| $.board.kpi.series.resolved[9] | 1 | 0 |
| $.board.kpi.series.resolved[10] | 1 | 0 |
| $.board.kpi.series.resolved[12] | 0 | 1 |
| $.board.kpi.series.resolved[13] | 2 | 0 |
| $.board.kpi.series.resolved[14] | 0 | 2 |
| $.board.kpi.series.resolved[15] | 2 | 0 |
| $.board.kpi.series.resolved[16] | 0 | 1 |
| $.board.kpi.series.resolved[18] | 2 | 1 |

...and 16 more paths (see the JSON file).

### officerB GET /api/officer/overview?zone=1

Session reads2, id 9ce2073ec9195752, 41951 bytes to 42716 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 13 | 16 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 13 | 12 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[2] | 1 | 0 |
| $.board.kpi.series.resolved[7] | 1 | 2 |
| $.board.kpi.series.resolved[8] | 2 | 0 |
| $.board.kpi.series.resolved[10] | 1 | 0 |
| $.board.kpi.series.resolved[12] | 0 | 2 |
| $.board.kpi.series.resolved[13] | 0 | 1 |
| $.board.kpi.series.resolved[14] | 0 | 1 |
| $.board.kpi.series.resolved[15] | 0 | 1 |
| $.board.kpi.series.resolved[17] | 1 | 0 |
| $.board.kpi.series.resolved[19] | 1 | 0 |
| $.board.kpi.series.resolved[20] | 1 | 0 |
| $.board.kpi.series.resolved[22] | 2 | 1 |

...and 18 more paths (see the JSON file).

### officerB GET /api/officer/overview?period=weekly&zone=5

Session reads2, id fb11e838dddc8e74, 52403 bytes to 53297 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 1 | 8 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 7 | 10 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 1 | 2 |
| $.board.kpi.series.resolved[1] | 0 | 2 |
| $.board.kpi.series.resolved[2] | 0 | 2 |
| $.board.kpi.series.resolved[3] | 0 | 1 |
| $.board.kpi.series.resolved[5] | 0 | 1 |
| $.board.severity.rows[0].sla_due | (absent) | 2026-11-05 14:38:00 |
| $.board.severity.rows[1].sla_due | (absent) | 2026-11-06 07:50:00 |
| $.board.severity.rows[2].sla_due | (absent) | 2026-11-06 09:12:00 |
| $.board.severity.rows[3].sla_due | (absent) | 2026-11-05 23:51:00 |
| $.board.severity.rows[4].sla_due | (absent) | 2026-11-08 08:11:00 |
| $.board.severity.rows[5].sla_due | (absent) | 2026-11-08 17:45:00 |
| $.board.severity.rows[6].sla_due | (absent) | 2026-11-05 14:20:00 |

...and 10 more paths (see the JSON file).

### officerB GET /api/officer/overview?period=monthly&zone=13

Session reads2, id f6885d5a3b61558d, 36658 bytes to 37359 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 17 | 21 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 24 | 31 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 0 | 1 |
| $.board.kpi.series.resolved[2] | 1 | 0 |
| $.board.kpi.series.resolved[3] | 1 | 0 |
| $.board.kpi.series.resolved[4] | 0 | 2 |
| $.board.kpi.series.resolved[9] | 1 | 0 |
| $.board.kpi.series.resolved[10] | 1 | 0 |
| $.board.kpi.series.resolved[12] | 0 | 1 |
| $.board.kpi.series.resolved[13] | 2 | 0 |
| $.board.kpi.series.resolved[14] | 0 | 2 |
| $.board.kpi.series.resolved[15] | 2 | 0 |
| $.board.kpi.series.resolved[16] | 0 | 1 |
| $.board.kpi.series.resolved[18] | 2 | 1 |

...and 16 more paths (see the JSON file).

### officerB GET /api/officer/overview?period=quarterly&zone=1

Session reads2, id 2116def41c9ee8cd, 49385 bytes to 50150 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 42 | 46 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 56 | 52 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[2] | 3 | 4 |
| $.board.kpi.series.resolved[3] | 5 | 4 |
| $.board.kpi.series.resolved[4] | 3 | 4 |
| $.board.kpi.series.resolved[5] | 5 | 2 |
| $.board.kpi.series.resolved[6] | 1 | 6 |
| $.board.kpi.series.resolved[7] | 2 | 1 |
| $.board.kpi.series.resolved[8] | 3 | 2 |
| $.board.kpi.series.resolved[9] | 4 | 2 |
| $.board.kpi.series.resolved[10] | 1 | 5 |
| $.board.kpi.series.resolved[11] | 6 | 2 |
| $.board.kpi.series.resolved[12] | 1 | 6 |
| $.board.severity.rows[0].sla_due | (absent) | 2026-11-02 08:59:21 |

...and 12 more paths (see the JSON file).

### officerB GET /api/officer/overview?period=weekly&taluk=TLK-MYL

Session reads2, id cad69d6004a0c19f, 31432 bytes to 32134 bytes.

| Path | A | B |
|---|---|---|
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 0 | 1 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 4 | 13 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[1] | 0 | 1 |
| $.board.severity.rows[0].sla_due | (absent) | 2026-11-02 08:29:00 |
| $.board.severity.rows[1].sla_due | (absent) | 2026-11-02 15:35:00 |
| $.board.severity.rows[2].sla_due | (absent) | 2026-11-05 11:16:00 |
| $.board.severity.rows[3].sla_due | (absent) | 2026-11-07 20:44:00 |
| $.board.severity.rows[4].sla_due | (absent) | 2026-11-08 06:46:00 |
| $.board.bell[0].sla_due | (absent) | 2026-10-31 23:57:08 |
| $.board.bell[1].sla_due | (absent) | 2026-11-02 08:59:21 |
| $.board.bell[2].sla_due | (absent) | 2026-11-05 17:24:00 |
| $.board.bell[3].sla_due | (absent) | 2026-11-04 08:02:00 |
| $.board.bell[4].sla_due | (absent) | 2026-11-04 15:54:00 |
| $.board.bell[5].sla_due | (absent) | 2026-11-05 12:51:00 |

### collector GET /api/collector/insights

Session reads2, id efa12c9a2336cbb1, 184962 bytes to 184966 bytes.

| Path | A | B |
|---|---|---|
| $.briefing.headline[1] | 236 incidents are still open, 11 of them past the deadline; 9 severe events. | 236 incidents are still open, 22 of them past the deadline; 9 severe events. |
| $.briefing.headline[2] | 3 incidents came from more than one source, and 13 incidents appear only in the news. | 3 incidents came from more than one source, and 10 incidents appear only in the news. |
| $.briefing.stats.overdue | 11 | 22 |
| $.briefing.stats.newsOnly | 13 | 10 |
| $.briefing.stats.handledByDepts | 230 | 186 |
| $.briefing.md | # Collector's Briefing: Chennai district _Last 24 hours, data as of 2026-11-06 18:08:00_ ## At a glance - 239 incidents were reported in Che... (4457 chars) | # Collector's Briefing: Chennai district _Last 24 hours, data as of 2026-11-06 18:08:00_ ## At a glance - 239 incidents were reported in Che... (4457 chars) |
| $.deptActions[0].overdue | 5 | 16 |
| $.deptActions[0].followUps[2].overdue | false | true |
| $.trends.weekly.lines[0].total | 1756 | 1765 |
| $.trends.weekly.lines[0].values[0] | 37 | 133 |
| $.trends.weekly.lines[1].total | 1447 | 1441 |
| $.trends.weekly.lines[1].values[0] | 39 | 107 |
| $.trends.weekly.lines[2].cat | FLOOD_WATERLOGGING | STREETLIGHT_ELECTRICAL |
| $.trends.weekly.lines[2].label | Flooding & waterlogging | Street lights & electrical hazards |
| $.trends.weekly.lines[2].total | 1185 | 1096 |
| $.trends.weekly.lines[2].values[0] | 15 | 95 |
| $.trends.weekly.lines[2].values[1] | 32 | 82 |
| $.trends.weekly.lines[2].values[2] | 87 | 112 |
| $.trends.weekly.lines[2].values[3] | 82 | 83 |
| $.trends.weekly.lines[2].values[4] | 54 | 92 |
| $.trends.weekly.lines[2].values[6] | 64 | 94 |
| $.trends.weekly.lines[2].values[7] | 102 | 65 |
| $.trends.weekly.lines[2].values[8] | 88 | 82 |
| $.trends.weekly.lines[2].values[9] | 101 | 82 |
| $.trends.weekly.lines[2].values[10] | 224 | 122 |

...and 80 more paths (see the JSON file).

### collector GET /api/collector/insights?cat=SOLID_WASTE

Session reads2, id b1b96ca9bb77da74, 113866 bytes to 113869 bytes.

| Path | A | B |
|---|---|---|
| $.trends.weekly.lines[0].total | 1756 | 1765 |
| $.trends.weekly.lines[0].values[0] | 37 | 133 |
| $.trends.weekly.lines[1].total | 1447 | 1441 |
| $.trends.weekly.lines[1].values[0] | 39 | 107 |
| $.trends.weekly.lines[2].cat | FLOOD_WATERLOGGING | STREETLIGHT_ELECTRICAL |
| $.trends.weekly.lines[2].label | Flooding & waterlogging | Street lights & electrical hazards |
| $.trends.weekly.lines[2].total | 1185 | 1096 |
| $.trends.weekly.lines[2].values[0] | 15 | 95 |
| $.trends.weekly.lines[2].values[1] | 32 | 82 |
| $.trends.weekly.lines[2].values[2] | 87 | 112 |
| $.trends.weekly.lines[2].values[3] | 82 | 83 |
| $.trends.weekly.lines[2].values[4] | 54 | 92 |
| $.trends.weekly.lines[2].values[6] | 64 | 94 |
| $.trends.weekly.lines[2].values[7] | 102 | 65 |
| $.trends.weekly.lines[2].values[8] | 88 | 82 |
| $.trends.weekly.lines[2].values[9] | 101 | 82 |
| $.trends.weekly.lines[2].values[10] | 224 | 122 |
| $.trends.weekly.lines[2].values[11] | 69 | 85 |
| $.trends.weekly.lines[3].cat | STREETLIGHT_ELECTRICAL | FLOOD_WATERLOGGING |
| $.trends.weekly.lines[3].label | Street lights & electrical hazards | Flooding & waterlogging |
| $.trends.weekly.lines[3].total | 1110 | 1094 |
| $.trends.weekly.lines[3].values[0] | 27 | 89 |
| $.trends.weekly.lines[3].values[1] | 82 | 32 |
| $.trends.weekly.lines[3].values[2] | 112 | 87 |
| $.trends.weekly.lines[3].values[3] | 83 | 82 |

...and 56 more paths (see the JSON file).

### collector GET /api/collector/insights?cat=DARK_SPOT_SAFETY

Session reads2, id 1939b2944d12edba, 108842 bytes to 108846 bytes.

| Path | A | B |
|---|---|---|
| $.trends.weekly.lines[0].total | 1756 | 1765 |
| $.trends.weekly.lines[0].values[0] | 37 | 133 |
| $.trends.weekly.lines[1].total | 1447 | 1441 |
| $.trends.weekly.lines[1].values[0] | 39 | 107 |
| $.trends.weekly.lines[2].cat | FLOOD_WATERLOGGING | STREETLIGHT_ELECTRICAL |
| $.trends.weekly.lines[2].label | Flooding & waterlogging | Street lights & electrical hazards |
| $.trends.weekly.lines[2].total | 1185 | 1096 |
| $.trends.weekly.lines[2].values[0] | 15 | 95 |
| $.trends.weekly.lines[2].values[1] | 32 | 82 |
| $.trends.weekly.lines[2].values[2] | 87 | 112 |
| $.trends.weekly.lines[2].values[3] | 82 | 83 |
| $.trends.weekly.lines[2].values[4] | 54 | 92 |
| $.trends.weekly.lines[2].values[6] | 64 | 94 |
| $.trends.weekly.lines[2].values[7] | 102 | 65 |
| $.trends.weekly.lines[2].values[8] | 88 | 82 |
| $.trends.weekly.lines[2].values[9] | 101 | 82 |
| $.trends.weekly.lines[2].values[10] | 224 | 122 |
| $.trends.weekly.lines[2].values[11] | 69 | 85 |
| $.trends.weekly.lines[3].cat | STREETLIGHT_ELECTRICAL | FLOOD_WATERLOGGING |
| $.trends.weekly.lines[3].label | Street lights & electrical hazards | Flooding & waterlogging |
| $.trends.weekly.lines[3].total | 1110 | 1094 |
| $.trends.weekly.lines[3].values[0] | 27 | 89 |
| $.trends.weekly.lines[3].values[1] | 82 | 32 |
| $.trends.weekly.lines[3].values[2] | 112 | 87 |
| $.trends.weekly.lines[3].values[3] | 83 | 82 |

...and 56 more paths (see the JSON file).

### collector GET /api/collector/insights?dept=GCC-SWM

Session reads2, id bf1b134ca0b825d1, 106199 bytes to 106200 bytes.

| Path | A | B |
|---|---|---|
| $.trends.weekly.lines[0].total | 1612 | 1619 |
| $.trends.weekly.lines[0].values[0] | 31 | 116 |
| $.trends.monthly.lines[0].total | 3291 | 2905 |

### collector GET /api/collector/insights?dept=GCC-ELE

Session reads2, id 42fa0ecc71812082, 109326 bytes to 109327 bytes.

| Path | A | B |
|---|---|---|
| $.trends.weekly.lines[0].total | 1031 | 1021 |
| $.trends.weekly.lines[0].values[0] | 25 | 89 |
| $.trends.weekly.lines[1].total | 9 | 10 |
| $.trends.weekly.lines[1].values[0] | 0 | 1 |
| $.trends.monthly.lines[0].total | 2066 | 1823 |
| $.trends.monthly.lines[1].total | 20 | 17 |

### collector GET /api/collector/insights?part=briefing

Session reads2, id 23c9e93c54bea3e0, 164518 bytes to 164518 bytes.

| Path | A | B |
|---|---|---|
| $.briefing.headline[1] | 236 incidents are still open, 11 of them past the deadline; 9 severe events. | 236 incidents are still open, 22 of them past the deadline; 9 severe events. |
| $.briefing.headline[2] | 3 incidents came from more than one source, and 13 incidents appear only in the news. | 3 incidents came from more than one source, and 10 incidents appear only in the news. |
| $.briefing.stats.overdue | 11 | 22 |
| $.briefing.stats.newsOnly | 13 | 10 |
| $.briefing.stats.handledByDepts | 230 | 186 |
| $.briefing.md | # Collector's Briefing: Chennai district _Last 24 hours, data as of 2026-11-06 18:08:00_ ## At a glance - 239 incidents were reported in Che... (4457 chars) | # Collector's Briefing: Chennai district _Last 24 hours, data as of 2026-11-06 18:08:00_ ## At a glance - 239 incidents were reported in Che... (4457 chars) |
| $.deptActions[0].overdue | 5 | 16 |
| $.deptActions[0].followUps[2].overdue | false | true |

### collector GET /api/collector/insights?part=trends

Session reads2, id e8a802a76a5c7c66, 26028 bytes to 26032 bytes.

| Path | A | B |
|---|---|---|
| $.trends.weekly.lines[0].total | 1756 | 1765 |
| $.trends.weekly.lines[0].values[0] | 37 | 133 |
| $.trends.weekly.lines[1].total | 1447 | 1441 |
| $.trends.weekly.lines[1].values[0] | 39 | 107 |
| $.trends.weekly.lines[2].cat | FLOOD_WATERLOGGING | STREETLIGHT_ELECTRICAL |
| $.trends.weekly.lines[2].label | Flooding & waterlogging | Street lights & electrical hazards |
| $.trends.weekly.lines[2].total | 1185 | 1096 |
| $.trends.weekly.lines[2].values[0] | 15 | 95 |
| $.trends.weekly.lines[2].values[1] | 32 | 82 |
| $.trends.weekly.lines[2].values[2] | 87 | 112 |
| $.trends.weekly.lines[2].values[3] | 82 | 83 |
| $.trends.weekly.lines[2].values[4] | 54 | 92 |
| $.trends.weekly.lines[2].values[6] | 64 | 94 |
| $.trends.weekly.lines[2].values[7] | 102 | 65 |
| $.trends.weekly.lines[2].values[8] | 88 | 82 |
| $.trends.weekly.lines[2].values[9] | 101 | 82 |
| $.trends.weekly.lines[2].values[10] | 224 | 122 |
| $.trends.weekly.lines[2].values[11] | 69 | 85 |
| $.trends.weekly.lines[3].cat | STREETLIGHT_ELECTRICAL | FLOOD_WATERLOGGING |
| $.trends.weekly.lines[3].label | Street lights & electrical hazards | Flooding & waterlogging |
| $.trends.weekly.lines[3].total | 1110 | 1094 |
| $.trends.weekly.lines[3].values[0] | 27 | 89 |
| $.trends.weekly.lines[3].values[1] | 82 | 32 |
| $.trends.weekly.lines[3].values[2] | 112 | 87 |
| $.trends.weekly.lines[3].values[3] | 83 | 82 |

...and 72 more paths (see the JSON file).

### collector GET /api/collector/insights?part=bogus

Session reads2, id e68c97b03cf9aeda, 184962 bytes to 184966 bytes.

| Path | A | B |
|---|---|---|
| $.briefing.headline[1] | 236 incidents are still open, 11 of them past the deadline; 9 severe events. | 236 incidents are still open, 22 of them past the deadline; 9 severe events. |
| $.briefing.headline[2] | 3 incidents came from more than one source, and 13 incidents appear only in the news. | 3 incidents came from more than one source, and 10 incidents appear only in the news. |
| $.briefing.stats.overdue | 11 | 22 |
| $.briefing.stats.newsOnly | 13 | 10 |
| $.briefing.stats.handledByDepts | 230 | 186 |
| $.briefing.md | # Collector's Briefing: Chennai district _Last 24 hours, data as of 2026-11-06 18:08:00_ ## At a glance - 239 incidents were reported in Che... (4457 chars) | # Collector's Briefing: Chennai district _Last 24 hours, data as of 2026-11-06 18:08:00_ ## At a glance - 239 incidents were reported in Che... (4457 chars) |
| $.deptActions[0].overdue | 5 | 16 |
| $.deptActions[0].followUps[2].overdue | false | true |
| $.trends.weekly.lines[0].total | 1756 | 1765 |
| $.trends.weekly.lines[0].values[0] | 37 | 133 |
| $.trends.weekly.lines[1].total | 1447 | 1441 |
| $.trends.weekly.lines[1].values[0] | 39 | 107 |
| $.trends.weekly.lines[2].cat | FLOOD_WATERLOGGING | STREETLIGHT_ELECTRICAL |
| $.trends.weekly.lines[2].label | Flooding & waterlogging | Street lights & electrical hazards |
| $.trends.weekly.lines[2].total | 1185 | 1096 |
| $.trends.weekly.lines[2].values[0] | 15 | 95 |
| $.trends.weekly.lines[2].values[1] | 32 | 82 |
| $.trends.weekly.lines[2].values[2] | 87 | 112 |
| $.trends.weekly.lines[2].values[3] | 82 | 83 |
| $.trends.weekly.lines[2].values[4] | 54 | 92 |
| $.trends.weekly.lines[2].values[6] | 64 | 94 |
| $.trends.weekly.lines[2].values[7] | 102 | 65 |
| $.trends.weekly.lines[2].values[8] | 88 | 82 |
| $.trends.weekly.lines[2].values[9] | 101 | 82 |
| $.trends.weekly.lines[2].values[10] | 224 | 122 |

...and 80 more paths (see the JSON file).

### collector GET /api/collector/insights?period=daily

Session reads2, id 3918cee750c27772, 184962 bytes to 184966 bytes.

| Path | A | B |
|---|---|---|
| $.briefing.headline[1] | 236 incidents are still open, 11 of them past the deadline; 9 severe events. | 236 incidents are still open, 22 of them past the deadline; 9 severe events. |
| $.briefing.headline[2] | 3 incidents came from more than one source, and 13 incidents appear only in the news. | 3 incidents came from more than one source, and 10 incidents appear only in the news. |
| $.briefing.stats.overdue | 11 | 22 |
| $.briefing.stats.newsOnly | 13 | 10 |
| $.briefing.stats.handledByDepts | 230 | 186 |
| $.briefing.md | # Collector's Briefing: Chennai district _Last 24 hours, data as of 2026-11-06 18:08:00_ ## At a glance - 239 incidents were reported in Che... (4457 chars) | # Collector's Briefing: Chennai district _Last 24 hours, data as of 2026-11-06 18:08:00_ ## At a glance - 239 incidents were reported in Che... (4457 chars) |
| $.deptActions[0].overdue | 5 | 16 |
| $.deptActions[0].followUps[2].overdue | false | true |
| $.trends.weekly.lines[0].total | 1756 | 1765 |
| $.trends.weekly.lines[0].values[0] | 37 | 133 |
| $.trends.weekly.lines[1].total | 1447 | 1441 |
| $.trends.weekly.lines[1].values[0] | 39 | 107 |
| $.trends.weekly.lines[2].cat | FLOOD_WATERLOGGING | STREETLIGHT_ELECTRICAL |
| $.trends.weekly.lines[2].label | Flooding & waterlogging | Street lights & electrical hazards |
| $.trends.weekly.lines[2].total | 1185 | 1096 |
| $.trends.weekly.lines[2].values[0] | 15 | 95 |
| $.trends.weekly.lines[2].values[1] | 32 | 82 |
| $.trends.weekly.lines[2].values[2] | 87 | 112 |
| $.trends.weekly.lines[2].values[3] | 82 | 83 |
| $.trends.weekly.lines[2].values[4] | 54 | 92 |
| $.trends.weekly.lines[2].values[6] | 64 | 94 |
| $.trends.weekly.lines[2].values[7] | 102 | 65 |
| $.trends.weekly.lines[2].values[8] | 88 | 82 |
| $.trends.weekly.lines[2].values[9] | 101 | 82 |
| $.trends.weekly.lines[2].values[10] | 224 | 122 |

...and 80 more paths (see the JSON file).

### collector GET /api/collector/insights?period=weekly

Session reads2, id 796e17e17fc905da, 276961 bytes to 297136 bytes.

| Path | A | B |
|---|---|---|
| $.briefing.headline[1] | 1,167 incidents are still open, 339 of them past the deadline; 65 severe events. | 1,167 incidents are still open, 505 of them past the deadline; 65 severe events. |
| $.briefing.headline[2] | 46 incidents came from more than one source, and 77 incidents appear only in the news. | 46 incidents came from more than one source, and 73 incidents appear only in the news. |
| $.briefing.stats.overdue | 339 | 505 |
| $.briefing.stats.newsOnly | 77 | 73 |
| $.briefing.stats.handledByDepts | 1161 | 775 |
| $.briefing.md | # Collector's Briefing: Chennai district _Last 7 days, data as of 2026-11-06 18:08:00_ ## At a glance - 1,357 incidents were reported in Che... (6117 chars) | # Collector's Briefing: Chennai district _Last 7 days, data as of 2026-11-06 18:08:00_ ## At a glance - 1,357 incidents were reported in Che... (6115 chars) |
| $.deptActions[0].overdue | 103 | 269 |
| $.gaps.length | 56 | 73 |
| $.gaps[56] | (absent) | {object with 33 keys} |
| $.gaps[57] | (absent) | {object with 33 keys} |
| $.gaps[58] | (absent) | {object with 33 keys} |
| $.gaps[59] | (absent) | {object with 33 keys} |
| $.gaps[60] | (absent) | {object with 33 keys} |
| $.gaps[61] | (absent) | {object with 33 keys} |
| $.gaps[62] | (absent) | {object with 33 keys} |
| $.gaps[63] | (absent) | {object with 33 keys} |
| $.gaps[64] | (absent) | {object with 33 keys} |
| $.gaps[65] | (absent) | {object with 33 keys} |
| $.gaps[66] | (absent) | {object with 33 keys} |
| $.gaps[67] | (absent) | {object with 33 keys} |
| $.gaps[68] | (absent) | {object with 33 keys} |
| $.gaps[69] | (absent) | {object with 33 keys} |
| $.gaps[70] | (absent) | {object with 33 keys} |
| $.gaps[71] | (absent) | {object with 33 keys} |
| $.gaps[72] | (absent) | {object with 33 keys} |

...and 97 more paths (see the JSON file).

### collector GET /api/collector/insights?period=monthly

Session reads2, id 7a95ffe2d0b9c260, 291266 bytes to 312794 bytes.

| Path | A | B |
|---|---|---|
| $.briefing.headline[1] | 2,074 incidents are still open, 742 of them past the deadline; 251 severe events. | 2,074 incidents are still open, 1295 of them past the deadline; 251 severe events. |
| $.briefing.headline[2] | 172 incidents came from more than one source, and 321 incidents appear only in the news. | 172 incidents came from more than one source, and 74 incidents appear only in the news. |
| $.briefing.stats.overdue | 742 | 1295 |
| $.briefing.stats.newsOnly | 321 | 74 |
| $.briefing.stats.handledByDepts | 2068 | 1226 |
| $.briefing.md | # Collector's Briefing: Chennai district _Last 30 days, data as of 2026-11-06 18:08:00_ ## At a glance - 5,574 incidents were reported in Ch... (6334 chars) | # Collector's Briefing: Chennai district _Last 30 days, data as of 2026-11-06 18:08:00_ ## At a glance - 5,574 incidents were reported in Ch... (6334 chars) |
| $.deptActions[0].overdue | 150 | 701 |
| $.deptActions[2].overdue | 135 | 136 |
| $.deptActions[10].overdue | 88 | 89 |
| $.gaps.length | 56 | 74 |
| $.gaps[56] | (absent) | {object with 33 keys} |
| $.gaps[57] | (absent) | {object with 33 keys} |
| $.gaps[58] | (absent) | {object with 33 keys} |
| $.gaps[59] | (absent) | {object with 33 keys} |
| $.gaps[60] | (absent) | {object with 33 keys} |
| $.gaps[61] | (absent) | {object with 33 keys} |
| $.gaps[62] | (absent) | {object with 33 keys} |
| $.gaps[63] | (absent) | {object with 33 keys} |
| $.gaps[64] | (absent) | {object with 33 keys} |
| $.gaps[65] | (absent) | {object with 33 keys} |
| $.gaps[66] | (absent) | {object with 33 keys} |
| $.gaps[67] | (absent) | {object with 33 keys} |
| $.gaps[68] | (absent) | {object with 33 keys} |
| $.gaps[69] | (absent) | {object with 33 keys} |
| $.gaps[70] | (absent) | {object with 33 keys} |

...and 100 more paths (see the JSON file).

### collector GET /api/collector/insights?period=quarterly

Session reads2, id 9cd1b8b8c44eea28, 291871 bytes to 313399 bytes.

| Path | A | B |
|---|---|---|
| $.briefing.headline[1] | 2,411 incidents are still open, 888 of them past the deadline; 596 severe events. | 2,411 incidents are still open, 1632 of them past the deadline; 596 severe events. |
| $.briefing.headline[2] | 305 incidents came from more than one source, and 573 incidents appear only in the news. | 305 incidents came from more than one source, and 74 incidents appear only in the news. |
| $.briefing.stats.overdue | 888 | 1632 |
| $.briefing.stats.newsOnly | 573 | 74 |
| $.briefing.stats.handledByDepts | 2405 | 1334 |
| $.briefing.md | # Collector's Briefing: Chennai district _Last 90 days, data as of 2026-11-06 18:08:00_ ## At a glance - 15,115 incidents were reported in C... (6179 chars) | # Collector's Briefing: Chennai district _Last 90 days, data as of 2026-11-06 18:08:00_ ## At a glance - 15,115 incidents were reported in C... (6179 chars) |
| $.deptActions[0].overdue | 181 | 923 |
| $.deptActions[2].overdue | 144 | 145 |
| $.deptActions[10].overdue | 120 | 121 |
| $.gaps.length | 56 | 74 |
| $.gaps[56] | (absent) | {object with 33 keys} |
| $.gaps[57] | (absent) | {object with 33 keys} |
| $.gaps[58] | (absent) | {object with 33 keys} |
| $.gaps[59] | (absent) | {object with 33 keys} |
| $.gaps[60] | (absent) | {object with 33 keys} |
| $.gaps[61] | (absent) | {object with 33 keys} |
| $.gaps[62] | (absent) | {object with 33 keys} |
| $.gaps[63] | (absent) | {object with 33 keys} |
| $.gaps[64] | (absent) | {object with 33 keys} |
| $.gaps[65] | (absent) | {object with 33 keys} |
| $.gaps[66] | (absent) | {object with 33 keys} |
| $.gaps[67] | (absent) | {object with 33 keys} |
| $.gaps[68] | (absent) | {object with 33 keys} |
| $.gaps[69] | (absent) | {object with 33 keys} |
| $.gaps[70] | (absent) | {object with 33 keys} |

...and 100 more paths (see the JSON file).

### collector GET /api/collector/insights?taluk=TLK-MYL

Session reads2, id a69318590c466904, 136275 bytes to 136276 bytes.

| Path | A | B |
|---|---|---|
| $.briefing.headline[1] | 25 incidents are still open, 1 of them past the deadline; 1 severe event. | 25 incidents are still open, 3 of them past the deadline; 1 severe event. |
| $.briefing.stats.overdue | 1 | 3 |
| $.briefing.stats.handledByDepts | 20 | 19 |
| $.briefing.md | # Collector's Briefing: Mylapore taluk _Last 24 hours, data as of 2026-11-06 18:08:00_ ## At a glance - 25 incidents were reported in Mylapo... (3339 chars) | # Collector's Briefing: Mylapore taluk _Last 24 hours, data as of 2026-11-06 18:08:00_ ## At a glance - 25 incidents were reported in Mylapo... (3339 chars) |
| $.deptActions[0].code | PWD-WRD | POL-GCP |
| $.deptActions[0].name | PWD Water Resources | Greater Chennai Police |
| $.deptActions[0].head | Superintending Engineer (WRD) | Deputy Commissioner of Police |
| $.deptActions[0].open | 3 | 6 |
| $.deptActions[0].overdue | 1 | 2 |
| $.deptActions[0].complaints | 3 | 0 |
| $.deptActions[0].followUps[0].id | INC-20260515-B939EB | INC-20261105-12D4C5 |
| $.deptActions[0].followUps[0].title | Ice House: uprooted tree blocks road | Mylapore: inundation strands residents |
| $.deptActions[0].followUps[0].sev | Severe | High |
| $.deptActions[0].followUps[0].overdue | true | false |
| $.deptActions[0].followUps[0].next.owner | (masked, 45 chars) | (masked, 45 chars) |
| $.deptActions[0].followUps[0].next.due | 2026-11-06 07:11:00 | 2026-11-06 03:24:06 |
| $.deptActions[0].followUps[1].id | INC-20261106-53101D | INC-20261106-E43C6B |
| $.deptActions[0].followUps[1].title | Adyar Thiru. VI. Ka. Bridge, Adyar மேல் விரிசல் தெரிகிறது | Two injured as SUV crashes near Royapettah Government Hospital |
| $.deptActions[0].followUps[1].overdue | false | true |
| $.deptActions[0].followUps[1].next.text | Inspect and barricade | Send patrol and ambulance |
| $.deptActions[0].followUps[1].next.owner | (masked, 45 chars) | (masked, 30 chars) |
| $.deptActions[0].followUps[1].next.due | 2026-11-07 01:23:01 | 2026-11-06 12:49:16 |
| $.deptActions[0].followUps[2].id | INC-20261105-DC6E93 | INC-20261106-0E9532 |
| $.deptActions[0].followUps[2].title | 1st Avenue Kotturpuram la 1.5 adi thanni thengi irukku, vandi poga mudiyala | Alwarpet: quarrel ends in assault |
| $.deptActions[0].followUps[2].overdue | false | true |

...and 67 more paths (see the JSON file).

### collector GET /api/collector/insights?taluk=TLK-SHN

Session reads2, id d2b72bc6ef67f566, 133806 bytes to 133807 bytes.

| Path | A | B |
|---|---|---|
| $.trends.weekly.lines[0].values[0] | 5 | 9 |
| $.trends.weekly.lines[1].total | 118 | 116 |
| $.trends.weekly.lines[1].values[0] | 3 | 10 |
| $.trends.weekly.lines[2].total | 72 | 69 |
| $.trends.weekly.lines[2].values[0] | 4 | 6 |
| $.trends.weekly.lines[3].cat | FLOOD_WATERLOGGING | DRAINAGE_SEWAGE |
| $.trends.weekly.lines[3].label | Flooding & waterlogging | Drainage & sewage |
| $.trends.weekly.lines[3].total | 61 | 63 |
| $.trends.weekly.lines[3].values[0] | 0 | 9 |
| $.trends.weekly.lines[3].values[2] | 2 | 8 |
| $.trends.weekly.lines[3].values[3] | 3 | 5 |
| $.trends.weekly.lines[3].values[4] | 3 | 5 |
| $.trends.weekly.lines[3].values[5] | 4 | 5 |
| $.trends.weekly.lines[3].values[6] | 4 | 6 |
| $.trends.weekly.lines[3].values[7] | 6 | 5 |
| $.trends.weekly.lines[3].values[8] | 6 | 7 |
| $.trends.weekly.lines[3].values[9] | 6 | 2 |
| $.trends.weekly.lines[3].values[10] | 16 | 8 |
| $.trends.weekly.lines[3].values[11] | 1 | 3 |
| $.trends.weekly.lines[4].cat | DRAINAGE_SEWAGE | FLOOD_WATERLOGGING |
| $.trends.weekly.lines[4].label | Drainage & sewage | Flooding & waterlogging |
| $.trends.weekly.lines[4].total | 58 | 57 |
| $.trends.weekly.lines[4].values[0] | 1 | 6 |
| $.trends.weekly.lines[4].values[2] | 8 | 2 |
| $.trends.weekly.lines[4].values[3] | 5 | 3 |

...and 54 more paths (see the JSON file).

### collector GET /api/collector/insights?zone=5

Session reads2, id 0f3379dd383730a2, 143138 bytes to 143140 bytes.

| Path | A | B |
|---|---|---|
| $.trends.weekly.lines[0].total | 171 | 165 |
| $.trends.weekly.lines[0].values[0] | 8 | 12 |
| $.trends.weekly.lines[1].values[0] | 0 | 11 |
| $.trends.weekly.lines[2].total | 119 | 108 |
| $.trends.weekly.lines[2].values[0] | 2 | 11 |
| $.trends.weekly.lines[3].total | 114 | 107 |
| $.trends.weekly.lines[3].values[0] | 1 | 8 |
| $.trends.weekly.lines[4].total | 100 | 98 |
| $.trends.weekly.lines[4].values[0] | 4 | 9 |
| $.trends.weekly.lines[5].total | 83 | 76 |
| $.trends.weekly.lines[5].values[0] | 0 | 4 |
| $.trends.weekly.lines[6].total | 67 | 66 |
| $.trends.weekly.lines[6].values[0] | 3 | 5 |
| $.trends.weekly.lines[7].values[0] | 1 | 5 |
| $.trends.weekly.lines[8].total | 522 | 560 |
| $.trends.weekly.lines[8].values[0] | 13 | 51 |
| $.trends.monthly.lines[0].cat | CRIME_PROPERTY | SOLID_WASTE |
| $.trends.monthly.lines[0].label | Theft, snatching & fraud | Garbage & solid waste |
| $.trends.monthly.lines[0].total | 316 | 291 |
| $.trends.monthly.lines[0].values[0] | 46 | 55 |
| $.trends.monthly.lines[0].values[1] | 42 | 48 |
| $.trends.monthly.lines[0].values[2] | 64 | 53 |
| $.trends.monthly.lines[0].values[3] | 48 | 60 |
| $.trends.monthly.lines[0].values[4] | 61 | 64 |
| $.trends.monthly.lines[0].values[5] | 14 | 11 |

...and 33 more paths (see the JSON file).

### collector GET /api/collector/insights?zone=13

Session reads2, id c97a3f9d553bab49, 135930 bytes to 135906 bytes.

| Path | A | B |
|---|---|---|
| $.briefing.headline[1] | 23 incidents are still open, 1 of them past the deadline; 1 severe event. | 23 incidents are still open, 2 of them past the deadline; 1 severe event. |
| $.briefing.attention[2].overdue | false | true |
| $.briefing.stats.overdue | 1 | 2 |
| $.briefing.md | # Collector's Briefing: Adyar _Last 24 hours, data as of 2026-11-06 18:08:00_ ## At a glance - 24 incidents were reported in Adyar (last 24 ... (2063 chars) | # Collector's Briefing: Adyar _Last 24 hours, data as of 2026-11-06 18:08:00_ ## At a glance - 24 incidents were reported in Adyar (last 24 ... (2063 chars) |
| $.deptActions[1].overdue | 0 | 1 |
| $.deptActions[1].followUps[0].overdue | false | true |
| $.trends.weekly.lines[0].total | 139 | 140 |
| $.trends.weekly.lines[0].values[0] | 2 | 10 |
| $.trends.weekly.lines[1].total | 136 | 131 |
| $.trends.weekly.lines[1].values[0] | 2 | 5 |
| $.trends.weekly.lines[2].cat | FLOOD_WATERLOGGING | ROAD_ACCIDENT |
| $.trends.weekly.lines[2].label | Flooding & waterlogging | Road accident |
| $.trends.weekly.lines[2].total | 113 | 110 |
| $.trends.weekly.lines[2].values[0] | 3 | 7 |
| $.trends.weekly.lines[2].values[1] | 3 | 6 |
| $.trends.weekly.lines[2].values[2] | 13 | 6 |
| $.trends.weekly.lines[2].values[3] | 6 | 5 |
| $.trends.weekly.lines[2].values[4] | 5 | 8 |
| $.trends.weekly.lines[2].values[6] | 4 | 11 |
| $.trends.weekly.lines[2].values[7] | 7 | 9 |
| $.trends.weekly.lines[2].values[8] | 11 | 14 |
| $.trends.weekly.lines[2].values[9] | 8 | 14 |
| $.trends.weekly.lines[2].values[10] | 21 | 11 |
| $.trends.weekly.lines[2].values[11] | 3 | 9 |
| $.trends.weekly.lines[3].cat | ROAD_ACCIDENT | FLOOD_WATERLOGGING |

...and 57 more paths (see the JSON file).

### collector GET /api/collector/insights?zone=1

Session reads2, id f8b54a16fd2ba1e7, 125964 bytes to 126019 bytes.

| Path | A | B |
|---|---|---|
| $.briefing.headline[1] | 6 incidents are still open; 1 severe event. | 6 incidents are still open, 1 of them past the deadline; 1 severe event. |
| $.briefing.attention[0].overdue | false | true |
| $.briefing.stats.overdue | 0 | 1 |
| $.briefing.md | # Collector's Briefing: Thiruvottiyur _Last 24 hours, data as of 2026-11-06 18:08:00_ ## At a glance - 6 incidents were reported in Thiruvot... (1066 chars) | # Collector's Briefing: Thiruvottiyur _Last 24 hours, data as of 2026-11-06 18:08:00_ ## At a glance - 6 incidents were reported in Thiruvot... (1095 chars) |
| $.deptActions[0].overdue | 0 | 1 |
| $.deptActions[0].followUps[0].overdue | false | true |
| $.trends.weekly.lines[0].total | 110 | 111 |
| $.trends.weekly.lines[0].values[0] | 3 | 8 |
| $.trends.weekly.lines[1].cat | FLOOD_WATERLOGGING | CRIME_PROPERTY |
| $.trends.weekly.lines[1].label | Flooding & waterlogging | Theft, snatching & fraud |
| $.trends.weekly.lines[1].total | 69 | 63 |
| $.trends.weekly.lines[1].values[0] | 2 | 3 |
| $.trends.weekly.lines[1].values[1] | 1 | 6 |
| $.trends.weekly.lines[1].values[2] | 8 | 4 |
| $.trends.weekly.lines[1].values[3] | 4 | 5 |
| $.trends.weekly.lines[1].values[4] | 1 | 7 |
| $.trends.weekly.lines[1].values[5] | 6 | 3 |
| $.trends.weekly.lines[1].values[6] | 0 | 5 |
| $.trends.weekly.lines[1].values[8] | 3 | 6 |
| $.trends.weekly.lines[1].values[9] | 8 | 9 |
| $.trends.weekly.lines[1].values[10] | 13 | 5 |
| $.trends.weekly.lines[1].values[11] | 9 | 5 |
| $.trends.weekly.lines[2].cat | CRIME_PROPERTY | FLOOD_WATERLOGGING |
| $.trends.weekly.lines[2].label | Theft, snatching & fraud | Flooding & waterlogging |
| $.trends.weekly.lines[2].total | 65 | 62 |

...and 90 more paths (see the JSON file).

### collector GET /api/collector/insights?period=weekly&zone=5

Session reads2, id 94a217266ba2fa0b, 171685 bytes to 171685 bytes.

| Path | A | B |
|---|---|---|
| $.briefing.headline[1] | 135 incidents are still open, 39 of them past the deadline; 16 severe events. | 135 incidents are still open, 59 of them past the deadline; 16 severe events. |
| $.briefing.stats.overdue | 39 | 59 |
| $.briefing.stats.handledByDepts | 129 | 86 |
| $.briefing.md | # Collector's Briefing: Royapuram _Last 7 days, data as of 2026-11-06 18:08:00_ ## At a glance - 152 incidents were reported in Royapuram (l... (5056 chars) | # Collector's Briefing: Royapuram _Last 7 days, data as of 2026-11-06 18:08:00_ ## At a glance - 152 incidents were reported in Royapuram (l... (5055 chars) |
| $.deptActions[0].overdue | 13 | 33 |
| $.trends.weekly.lines[0].total | 171 | 165 |
| $.trends.weekly.lines[0].values[0] | 8 | 12 |
| $.trends.weekly.lines[1].values[0] | 0 | 11 |
| $.trends.weekly.lines[2].total | 119 | 108 |
| $.trends.weekly.lines[2].values[0] | 2 | 11 |
| $.trends.weekly.lines[3].total | 114 | 107 |
| $.trends.weekly.lines[3].values[0] | 1 | 8 |
| $.trends.weekly.lines[4].total | 100 | 98 |
| $.trends.weekly.lines[4].values[0] | 4 | 9 |
| $.trends.weekly.lines[5].total | 83 | 76 |
| $.trends.weekly.lines[5].values[0] | 0 | 4 |
| $.trends.weekly.lines[6].total | 67 | 66 |
| $.trends.weekly.lines[6].values[0] | 3 | 5 |
| $.trends.weekly.lines[7].values[0] | 1 | 5 |
| $.trends.weekly.lines[8].total | 522 | 560 |
| $.trends.weekly.lines[8].values[0] | 13 | 51 |
| $.trends.monthly.lines[0].cat | CRIME_PROPERTY | SOLID_WASTE |
| $.trends.monthly.lines[0].label | Theft, snatching & fraud | Garbage & solid waste |
| $.trends.monthly.lines[0].total | 316 | 291 |
| $.trends.monthly.lines[0].values[0] | 46 | 55 |

...and 38 more paths (see the JSON file).

### collector GET /api/collector/insights?period=monthly&zone=13

Session reads2, id 429ce1a0f9c185fe, 164513 bytes to 164489 bytes.

| Path | A | B |
|---|---|---|
| $.briefing.headline[1] | 162 incidents are still open, 57 of them past the deadline; 18 severe events. | 162 incidents are still open, 105 of them past the deadline; 18 severe events. |
| $.briefing.headline[2] | 15 incidents came from more than one source, and 21 incidents appear only in the news. | 15 incidents came from more than one source, and 0 incidents appear only in the news. |
| $.briefing.stats.overdue | 57 | 105 |
| $.briefing.stats.newsOnly | 21 | 0 |
| $.briefing.stats.handledByDepts | 156 | 96 |
| $.briefing.md | # Collector's Briefing: Adyar _Last 30 days, data as of 2026-11-06 18:08:00_ ## At a glance - 470 incidents were reported in Adyar (last 30 ... (5304 chars) | # Collector's Briefing: Adyar _Last 30 days, data as of 2026-11-06 18:08:00_ ## At a glance - 470 incidents were reported in Adyar (last 30 ... (5303 chars) |
| $.deptActions[0].overdue | 11 | 59 |
| $.trends.weekly.lines[0].total | 139 | 140 |
| $.trends.weekly.lines[0].values[0] | 2 | 10 |
| $.trends.weekly.lines[1].total | 136 | 131 |
| $.trends.weekly.lines[1].values[0] | 2 | 5 |
| $.trends.weekly.lines[2].cat | FLOOD_WATERLOGGING | ROAD_ACCIDENT |
| $.trends.weekly.lines[2].label | Flooding & waterlogging | Road accident |
| $.trends.weekly.lines[2].total | 113 | 110 |
| $.trends.weekly.lines[2].values[0] | 3 | 7 |
| $.trends.weekly.lines[2].values[1] | 3 | 6 |
| $.trends.weekly.lines[2].values[2] | 13 | 6 |
| $.trends.weekly.lines[2].values[3] | 6 | 5 |
| $.trends.weekly.lines[2].values[4] | 5 | 8 |
| $.trends.weekly.lines[2].values[6] | 4 | 11 |
| $.trends.weekly.lines[2].values[7] | 7 | 9 |
| $.trends.weekly.lines[2].values[8] | 11 | 14 |
| $.trends.weekly.lines[2].values[9] | 8 | 14 |
| $.trends.weekly.lines[2].values[10] | 21 | 11 |
| $.trends.weekly.lines[2].values[11] | 3 | 9 |

...and 58 more paths (see the JSON file).

### collector GET /api/collector/insights?period=quarterly&zone=1

Session reads2, id ef53ddd2fe4a4b2f, 169945 bytes to 169939 bytes.

| Path | A | B |
|---|---|---|
| $.briefing.headline[1] | 103 incidents are still open, 42 of them past the deadline; 35 severe events. | 103 incidents are still open, 72 of them past the deadline; 35 severe events. |
| $.briefing.headline[2] | 30 incidents came from more than one source, and 16 incidents appear only in the news. | 30 incidents came from more than one source, and 1 incident appears only in the news. |
| $.briefing.stats.overdue | 42 | 72 |
| $.briefing.stats.newsOnly | 16 | 1 |
| $.briefing.stats.handledByDepts | 97 | 59 |
| $.briefing.md | # Collector's Briefing: Thiruvottiyur _Last 90 days, data as of 2026-11-06 18:08:00_ ## At a glance - 791 incidents were reported in Thiruvo... (5227 chars) | # Collector's Briefing: Thiruvottiyur _Last 90 days, data as of 2026-11-06 18:08:00_ ## At a glance - 791 incidents were reported in Thiruvo... (5226 chars) |
| $.deptActions[0].code | PWD-WRD | POL-GCP |
| $.deptActions[0].name | PWD Water Resources | Greater Chennai Police |
| $.deptActions[0].head | Superintending Engineer (WRD) | Deputy Commissioner of Police |
| $.deptActions[0].open | 18 | 40 |
| $.deptActions[0].overdue | 16 | 36 |
| $.deptActions[0].complaints | 11 | 0 |
| $.deptActions[0].followUps[0].id | INC-20261021-3F360F | INC-20261106-C854D7 |
| $.deptActions[0].followUps[0].title | WhatsApp fwd: Retaining wall near Anna St, Ernavoor caved in near Amma Unavagam | Fatal crash near Ennore Creek Bridge |
| $.deptActions[0].followUps[0].next.text | Remove collapsed wall debris near Karpagam Ave, Ernavoor | Send patrol and ambulance |
| $.deptActions[0].followUps[0].next.owner | (masked, 35 chars) | (masked, 26 chars) |
| $.deptActions[0].followUps[0].next.due | 2026-11-10 00:00:00 | 2026-11-06 05:20:22 |
| $.deptActions[0].followUps[1].id | INC-20261025-09E045 | INC-20261014-E13026 |
| $.deptActions[0].followUps[1].title | Floodwater traps residents near Periya Mettu Palayam 1st Road | Kaladipet: woman beaten at home |
| $.deptActions[0].followUps[1].next.text | Attend waterlogging - Periya Mettu Palayam 1St Road, Kaladipet | Respond immediately |
| $.deptActions[0].followUps[1].next.owner | (masked, 35 chars) | (masked, 30 chars) |
| $.deptActions[0].followUps[1].next.due | 2026-11-09 23:32:59 | 2026-10-14 00:56:50 |
| $.deptActions[0].followUps[2].id | INC-20261016-045A33 | INC-20261102-199146 |
| $.deptActions[0].followUps[2].title | AE site report: parapet wall of Manali Kosasthalaiyar Causeway damaged, Manali | Ennore: woman beaten at home |
| $.deptActions[0].followUps[2].next.text | Inspect and barricade | Respond immediately |

...and 135 more paths (see the JSON file).

### collector GET /api/collector/insights?period=weekly&dept=GCC-SWM

Session reads2, id e0187821d5d38a13, 117793 bytes to 117794 bytes.

| Path | A | B |
|---|---|---|
| $.briefing.stats.handledByDepts | 61 | 56 |
| $.briefing.md | # Collector's Briefing: Solid Waste Management _Last 7 days, data as of 2026-11-06 18:08:00_ ## At a glance - 109 incidents were reported in... (3836 chars) | # Collector's Briefing: Solid Waste Management _Last 7 days, data as of 2026-11-06 18:08:00_ ## At a glance - 109 incidents were reported in... (3836 chars) |
| $.trends.weekly.lines[0].total | 1612 | 1619 |
| $.trends.weekly.lines[0].values[0] | 31 | 116 |
| $.trends.monthly.lines[0].total | 3291 | 2905 |

### collector GET /api/collector/report

Session reads2, id 095b16e7efdf775f, 259727 bytes to 262311 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 3 | 175 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 9 | 155 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 15 |
| $.kpi.series.resolved[1] | 2 | 15 |
| $.kpi.series.resolved[2] | 1 | 16 |
| $.kpi.series.resolved[3] | 0 | 19 |
| $.kpi.series.resolved[4] | 0 | 15 |
| $.kpi.series.resolved[5] | 0 | 11 |
| $.kpi.series.resolved[6] | 0 | 15 |
| $.kpi.series.resolved[7] | 0 | 18 |
| $.kpi.series.resolved[8] | 0 | 13 |
| $.kpi.series.resolved[9] | 0 | 16 |
| $.kpi.series.resolved[10] | 0 | 10 |
| $.kpi.series.resolved[11] | 0 | 12 |
| $.snapshot.overdue | 11 | 22 |
| $.news[0].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.news[1].sla_due | (absent) | 2026-11-13 16:43:38 |
| $.news[2].sla_due | (absent) | 2026-11-07 15:18:31 |
| $.news[3].sla_due | (absent) | 2026-11-06 12:42:54 |
| $.news[4].sla_due | (absent) | 2026-11-06 15:47:24 |
| $.news[5].sla_due | (absent) | 2026-11-07 09:07:25 |
| $.news[6].sla_due | (absent) | 2026-11-09 06:47:38 |

...and 78 more paths (see the JSON file).

### collector GET /api/collector/report?cat=SOLID_WASTE

Session reads2, id 7847baa6b52a9469, 64755 bytes to 65589 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 17 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 21 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 1 |
| $.kpi.series.resolved[1] | 0 | 1 |
| $.kpi.series.resolved[2] | 0 | 1 |
| $.kpi.series.resolved[3] | 0 | 3 |
| $.kpi.series.resolved[4] | 0 | 2 |
| $.kpi.series.resolved[5] | 0 | 1 |
| $.kpi.series.resolved[6] | 0 | 1 |
| $.kpi.series.resolved[7] | 0 | 2 |
| $.kpi.series.resolved[8] | 0 | 1 |
| $.kpi.series.resolved[9] | 0 | 2 |
| $.kpi.series.resolved[10] | 0 | 1 |
| $.kpi.series.resolved[11] | 0 | 1 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-08 08:04:00 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-08 06:41:00 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-08 08:45:00 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-07 18:38:00 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-08 16:31:00 |
| $.severity.rows[5].sla_due | (absent) | 2026-11-08 13:18:00 |
| $.severity.rows[6].sla_due | (absent) | 2026-11-08 07:16:00 |
| $.severity.rows[7].sla_due | (absent) | 2026-11-08 11:22:00 |

...and 18 more paths (see the JSON file).

### collector GET /api/collector/report?cat=DARK_SPOT_SAFETY

Session reads2, id 8843cab6fdba8ab6, 29744 bytes to 30000 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 2 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 1 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[4] | 0 | 1 |
| $.kpi.series.resolved[5] | 0 | 1 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-13 08:06:00 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-13 10:07:00 |
| $.bell[0].sla_due | (absent) | 2026-11-06 11:59:00 |
| $.bell[1].sla_due | (absent) | 2026-11-06 02:48:55 |
| $.bell[2].sla_due | (absent) | 2026-11-06 03:13:06 |
| $.bell[3].sla_due | (absent) | 2026-11-06 03:13:47 |
| $.bell[4].sla_due | (absent) | 2026-11-06 04:43:54 |
| $.bell[5].sla_due | (absent) | 2026-11-06 05:41:50 |

### collector GET /api/collector/report?dept=GCC-SWM

Session reads2, id c64879bd7d0d5da1, 54719 bytes to 55297 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 17 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 18 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 1 |
| $.kpi.series.resolved[1] | 0 | 1 |
| $.kpi.series.resolved[2] | 0 | 1 |
| $.kpi.series.resolved[3] | 0 | 3 |
| $.kpi.series.resolved[4] | 0 | 2 |
| $.kpi.series.resolved[5] | 0 | 1 |
| $.kpi.series.resolved[6] | 0 | 1 |
| $.kpi.series.resolved[7] | 0 | 2 |
| $.kpi.series.resolved[8] | 0 | 1 |
| $.kpi.series.resolved[9] | 0 | 2 |
| $.kpi.series.resolved[10] | 0 | 1 |
| $.kpi.series.resolved[11] | 0 | 1 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-08 08:04:00 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-08 06:41:00 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-08 08:45:00 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-07 18:38:00 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-08 13:18:00 |
| $.severity.rows[5].sla_due | (absent) | 2026-11-08 07:16:00 |
| $.severity.rows[6].sla_due | (absent) | 2026-11-08 11:22:00 |
| $.severity.rows[7].sla_due | (absent) | 2026-11-08 07:25:00 |

...and 10 more paths (see the JSON file).

### collector GET /api/collector/report?dept=GCC-ELE

Session reads2, id d9bddd1be4ba72de, 71423 bytes to 72224 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 11 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 7 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 1 |
| $.kpi.series.resolved[1] | 0 | 3 |
| $.kpi.series.resolved[3] | 0 | 2 |
| $.kpi.series.resolved[6] | 0 | 2 |
| $.kpi.series.resolved[7] | 0 | 2 |
| $.kpi.series.resolved[11] | 0 | 1 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-07 16:46:00 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-06 19:03:00 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-08 16:35:00 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-08 14:46:00 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-08 08:11:00 |
| $.severity.rows[5].sla_due | (absent) | 2026-11-07 19:18:00 |
| $.severity.rows[6].sla_due | (absent) | 2026-11-08 13:42:00 |
| $.severity.rows[7].sla_due | (absent) | 2026-11-08 07:03:00 |
| $.severity.rows[8].sla_due | (absent) | 2026-11-08 12:46:00 |
| $.severity.rows[9].sla_due | (absent) | 2026-11-07 21:05:00 |
| $.severity.rows[10].sla_due | (absent) | 2026-11-07 20:44:00 |
| $.severity.rows[11].sla_due | (absent) | 2026-11-09 20:59:00 |
| $.severity.rows[12].sla_due | (absent) | 2026-11-10 15:40:00 |
| $.severity.rows[13].sla_due | (absent) | 2026-11-10 09:10:00 |

...and 11 more paths (see the JSON file).

### collector GET /api/collector/report?period=daily

Session reads2, id 2546b13c9615b885, 259727 bytes to 262311 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 3 | 175 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 9 | 155 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 15 |
| $.kpi.series.resolved[1] | 2 | 15 |
| $.kpi.series.resolved[2] | 1 | 16 |
| $.kpi.series.resolved[3] | 0 | 19 |
| $.kpi.series.resolved[4] | 0 | 15 |
| $.kpi.series.resolved[5] | 0 | 11 |
| $.kpi.series.resolved[6] | 0 | 15 |
| $.kpi.series.resolved[7] | 0 | 18 |
| $.kpi.series.resolved[8] | 0 | 13 |
| $.kpi.series.resolved[9] | 0 | 16 |
| $.kpi.series.resolved[10] | 0 | 10 |
| $.kpi.series.resolved[11] | 0 | 12 |
| $.snapshot.overdue | 11 | 22 |
| $.news[0].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.news[1].sla_due | (absent) | 2026-11-13 16:43:38 |
| $.news[2].sla_due | (absent) | 2026-11-07 15:18:31 |
| $.news[3].sla_due | (absent) | 2026-11-06 12:42:54 |
| $.news[4].sla_due | (absent) | 2026-11-06 15:47:24 |
| $.news[5].sla_due | (absent) | 2026-11-07 09:07:25 |
| $.news[6].sla_due | (absent) | 2026-11-09 06:47:38 |

...and 78 more paths (see the JSON file).

### collector GET /api/collector/report?period=weekly

Session reads2, id 3216cc33d4b7fe6e, 440837 bytes to 443824 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 182 | 1166 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 708 | 1192 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 47 | 192 |
| $.kpi.series.resolved[1] | 51 | 161 |
| $.kpi.series.resolved[2] | 31 | 168 |
| $.kpi.series.resolved[3] | 22 | 159 |
| $.kpi.series.resolved[4] | 19 | 156 |
| $.kpi.series.resolved[5] | 9 | 155 |
| $.kpi.series.resolved[6] | 3 | 175 |
| $.snapshot.overdue | 339 | 505 |
| $.news[0].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.news[1].sla_due | (absent) | 2026-11-13 16:43:38 |
| $.news[2].sla_due | (absent) | 2026-11-07 15:18:31 |
| $.news[3].sla_due | (absent) | 2026-11-06 12:42:54 |
| $.news[4].sla_due | (absent) | 2026-11-06 15:47:24 |
| $.news[5].sla_due | (absent) | 2026-11-07 09:07:25 |
| $.news[6].sla_due | (absent) | 2026-11-09 06:47:38 |
| $.news[7].sla_due | (absent) | 2026-11-07 01:44:37 |
| $.news[8].sla_due | (absent) | 2026-11-06 22:31:45 |
| $.news[9].sla_due | (absent) | 2026-11-06 10:26:22 |
| $.news[10].sla_due | (absent) | 2026-11-06 09:29:21 |
| $.news[11].sla_due | (absent) | 2026-11-06 21:27:00 |

...and 83 more paths (see the JSON file).

### collector GET /api/collector/report?period=monthly

Session reads2, id fda381e1a888253e, 586442 bytes to 589432 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 3084 | 4809 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 4255 | 4433 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 137 | 168 |
| $.kpi.series.resolved[1] | 139 | 142 |
| $.kpi.series.resolved[2] | 145 | 153 |
| $.kpi.series.resolved[3] | 111 | 166 |
| $.kpi.series.resolved[4] | 141 | 163 |
| $.kpi.series.resolved[5] | 134 | 153 |
| $.kpi.series.resolved[6] | 120 | 143 |
| $.kpi.series.resolved[8] | 119 | 170 |
| $.kpi.series.resolved[9] | 123 | 150 |
| $.kpi.series.resolved[10] | 151 | 147 |
| $.kpi.series.resolved[11] | 120 | 152 |
| $.kpi.series.resolved[12] | 122 | 145 |
| $.kpi.series.resolved[13] | 151 | 157 |
| $.kpi.series.resolved[14] | 197 | 166 |
| $.kpi.series.resolved[15] | 157 | 149 |
| $.kpi.series.resolved[16] | 152 | 171 |
| $.kpi.series.resolved[17] | 121 | 165 |
| $.kpi.series.resolved[18] | 99 | 175 |
| $.kpi.series.resolved[19] | 121 | 185 |
| $.kpi.series.resolved[20] | 86 | 176 |

...and 105 more paths (see the JSON file).

### collector GET /api/collector/report?period=quarterly

Session reads2, id 299c47228fd7dd1a, 624602 bytes to 627586 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 11784 | 13579 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 12243 | 10448 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 1063 | 999 |
| $.kpi.series.resolved[1] | 932 | 1007 |
| $.kpi.series.resolved[2] | 1076 | 971 |
| $.kpi.series.resolved[3] | 962 | 1022 |
| $.kpi.series.resolved[4] | 1050 | 1038 |
| $.kpi.series.resolved[5] | 915 | 1015 |
| $.kpi.series.resolved[6] | 1150 | 1007 |
| $.kpi.series.resolved[7] | 926 | 1040 |
| $.kpi.series.resolved[8] | 948 | 1021 |
| $.kpi.series.resolved[9] | 889 | 1067 |
| $.kpi.series.resolved[10] | 1024 | 1069 |
| $.kpi.series.resolved[11] | 677 | 1168 |
| $.kpi.series.resolved[12] | 172 | 1155 |
| $.snapshot.overdue | 888 | 1632 |
| $.news[0].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.news[1].sla_due | (absent) | 2026-11-13 16:43:38 |
| $.news[2].sla_due | (absent) | 2026-11-07 15:18:31 |
| $.news[3].sla_due | (absent) | 2026-11-06 12:42:54 |
| $.news[4].sla_due | (absent) | 2026-11-06 15:47:24 |
| $.news[5].sla_due | (absent) | 2026-11-07 09:07:25 |

...and 89 more paths (see the JSON file).

### collector GET /api/collector/report?taluk=TLK-MYL

Session reads2, id 2af87a096780b60d, 84111 bytes to 86579 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 10 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 7 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 1 |
| $.kpi.series.resolved[1] | 0 | 2 |
| $.kpi.series.resolved[2] | 0 | 1 |
| $.kpi.series.resolved[4] | 0 | 2 |
| $.kpi.series.resolved[7] | 0 | 1 |
| $.kpi.series.resolved[8] | 0 | 1 |
| $.kpi.series.resolved[10] | 0 | 2 |
| $.snapshot.overdue | 1 | 3 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-06 11:59:00 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-07 08:41:55 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-09 10:59:01 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-06 22:36:06 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-06 18:23:56 |
| $.severity.rows[5].sla_due | (absent) | 2026-11-06 17:37:16 |
| $.severity.rows[6].why.attention.length | 0 | 1 |
| $.severity.rows[6].why.attention[0] | (absent) | Past its deadline |
| $.severity.rows[6].why.needsYou | false | true |
| $.severity.rows[6].why.why.length | 0 | 1 |
| $.severity.rows[6].why.why[0] | (absent) | Past its deadline |
| $.severity.rows[6].sla_due | (absent) | 2026-11-06 08:43:47 |

...and 32 more paths (see the JSON file).

### collector GET /api/collector/report?taluk=TLK-SHN

Session reads2, id 53ac579dbb8ea3e1, 60784 bytes to 61522 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 16 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 10 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 2 |
| $.kpi.series.resolved[1] | 0 | 2 |
| $.kpi.series.resolved[2] | 0 | 1 |
| $.kpi.series.resolved[3] | 0 | 2 |
| $.kpi.series.resolved[6] | 0 | 1 |
| $.kpi.series.resolved[7] | 0 | 1 |
| $.kpi.series.resolved[8] | 0 | 2 |
| $.kpi.series.resolved[9] | 0 | 1 |
| $.kpi.series.resolved[10] | 0 | 2 |
| $.kpi.series.resolved[11] | 0 | 2 |
| $.news[0].sla_due | (absent) | 2026-11-06 15:47:24 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-06 03:13:47 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-06 15:47:24 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-06 18:41:09 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-13 14:20:00 |
| $.severity.rows[5].sla_due | (absent) | 2026-11-09 07:13:00 |
| $.severity.rows[6].sla_due | (absent) | 2026-11-11 11:11:00 |
| $.severity.rows[7].sla_due | (absent) | 2026-11-10 22:12:00 |
| $.severity.rows[8].sla_due | (absent) | 2026-11-11 09:38:00 |

...and 13 more paths (see the JSON file).

### collector GET /api/collector/report?zone=5

Session reads2, id de0c525ec1bc592a, 83843 bytes to 84965 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 14 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 22 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 1 |
| $.kpi.series.resolved[3] | 0 | 2 |
| $.kpi.series.resolved[4] | 0 | 1 |
| $.kpi.series.resolved[5] | 0 | 3 |
| $.kpi.series.resolved[6] | 0 | 2 |
| $.kpi.series.resolved[7] | 0 | 2 |
| $.kpi.series.resolved[9] | 0 | 2 |
| $.kpi.series.resolved[11] | 0 | 1 |
| $.news[0].sla_due | (absent) | 2026-11-07 09:07:25 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-06 02:48:55 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-06 04:43:54 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-06 18:48:50 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-06 20:20:00 |
| $.severity.rows[5].sla_due | (absent) | 2026-11-07 09:07:25 |
| $.severity.rows[6].sla_due | (absent) | 2026-11-06 19:08:00 |
| $.severity.rows[7].sla_due | (absent) | 2026-11-08 08:11:00 |
| $.severity.rows[8].sla_due | (absent) | 2026-11-12 19:21:34 |
| $.severity.rows[9].sla_due | (absent) | 2026-11-10 20:37:00 |
| $.severity.rows[10].sla_due | (absent) | 2026-11-08 17:45:00 |

...and 23 more paths (see the JSON file).

### collector GET /api/collector/report?zone=13

Session reads2, id 14db42c25403c319, 80307 bytes to 81412 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 1 | 23 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 3 | 9 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 3 |
| $.kpi.series.resolved[1] | 0 | 2 |
| $.kpi.series.resolved[2] | 1 | 2 |
| $.kpi.series.resolved[3] | 0 | 5 |
| $.kpi.series.resolved[4] | 0 | 2 |
| $.kpi.series.resolved[5] | 0 | 1 |
| $.kpi.series.resolved[6] | 0 | 1 |
| $.kpi.series.resolved[7] | 0 | 1 |
| $.kpi.series.resolved[8] | 0 | 1 |
| $.kpi.series.resolved[9] | 0 | 2 |
| $.kpi.series.resolved[10] | 0 | 1 |
| $.kpi.series.resolved[11] | 0 | 2 |
| $.snapshot.overdue | 1 | 2 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-06 05:41:50 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-06 23:59:31 |
| $.severity.rows[2].why.attention.length | 1 | 2 |
| $.severity.rows[2].why.attention[0] | Keeps happening: 5 similar incidents here in 90 days | Past its deadline |
| $.severity.rows[2].why.attention[1] | (absent) | Keeps happening: 5 similar incidents here in 90 days |
| $.severity.rows[2].why.why.length | 1 | 2 |
| $.severity.rows[2].why.why[0] | Keeps happening: 5 similar incidents here in 90 days | Past its deadline |

...and 37 more paths (see the JSON file).

### collector GET /api/collector/report?zone=1

Session reads2, id 522492d4d5a05ccb, 39799 bytes to 40296 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 0 | 9 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 0 | 10 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[2] | 0 | 3 |
| $.kpi.series.resolved[4] | 0 | 1 |
| $.kpi.series.resolved[6] | 0 | 1 |
| $.kpi.series.resolved[7] | 0 | 2 |
| $.kpi.series.resolved[9] | 0 | 1 |
| $.kpi.series.resolved[11] | 0 | 1 |
| $.snapshot.overdue | 0 | 1 |
| $.severity.rows[0].why.attention.length | 1 | 2 |
| $.severity.rows[0].why.attention[1] | (absent) | Past its deadline |
| $.severity.rows[0].why.why.length | 1 | 2 |
| $.severity.rows[0].why.why[1] | (absent) | Past its deadline |
| $.severity.rows[0].sla_due | (absent) | 2026-11-06 06:56:22 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-08 23:51:00 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-09 17:02:00 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-20 14:14:00 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-08 13:02:13 |
| $.severity.rows[5].sla_due | (absent) | 2026-12-05 20:56:00 |
| $.bell[0].sla_due | (absent) | 2026-11-06 11:59:00 |
| $.bell[1].sla_due | (absent) | 2026-11-06 02:48:55 |
| $.bell[2].sla_due | (absent) | 2026-11-06 03:13:06 |

...and 8 more paths (see the JSON file).

### collector GET /api/collector/report?period=weekly&zone=5

Session reads2, id 85c714c0a3849702, 206837 bytes to 209432 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 16 | 117 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 76 | 130 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 5 | 23 |
| $.kpi.series.resolved[1] | 0 | 18 |
| $.kpi.series.resolved[2] | 6 | 13 |
| $.kpi.series.resolved[3] | 4 | 15 |
| $.kpi.series.resolved[4] | 1 | 12 |
| $.kpi.series.resolved[5] | 0 | 22 |
| $.kpi.series.resolved[6] | 0 | 14 |
| $.snapshot.overdue | 39 | 59 |
| $.news[0].sla_due | (absent) | 2026-11-07 09:07:25 |
| $.news[1].sla_due | (absent) | 2026-11-07 03:56:22 |
| $.news[2].sla_due | (absent) | 2026-11-04 01:41:25 |
| $.news[3].sla_due | (absent) | 2026-11-03 17:41:55 |
| $.news[4].sla_due | (absent) | 2026-11-03 17:34:00 |
| $.news[5].sla_due | (absent) | 2026-11-03 17:49:30 |
| $.news[6].sla_due | (absent) | 2026-11-03 16:09:53 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-03 02:06:53 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-05 03:50:26 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-05 22:18:14 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-05 12:00:00 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-04 23:40:19 |

...and 86 more paths (see the JSON file).

### collector GET /api/collector/report?period=monthly&zone=13

Session reads2, id e56633d976349cd6, 252159 bytes to 254953 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 281 | 428 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 363 | 392 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 13 | 17 |
| $.kpi.series.resolved[1] | 14 | 13 |
| $.kpi.series.resolved[2] | 10 | 17 |
| $.kpi.series.resolved[3] | 9 | 19 |
| $.kpi.series.resolved[4] | 16 | 19 |
| $.kpi.series.resolved[5] | 14 | 10 |
| $.kpi.series.resolved[6] | 14 | 9 |
| $.kpi.series.resolved[7] | 12 | 10 |
| $.kpi.series.resolved[8] | 11 | 12 |
| $.kpi.series.resolved[9] | 9 | 10 |
| $.kpi.series.resolved[10] | 14 | 11 |
| $.kpi.series.resolved[11] | 9 | 10 |
| $.kpi.series.resolved[12] | 3 | 12 |
| $.kpi.series.resolved[13] | 15 | 12 |
| $.kpi.series.resolved[14] | 16 | 18 |
| $.kpi.series.resolved[15] | 14 | 16 |
| $.kpi.series.resolved[16] | 15 | 18 |
| $.kpi.series.resolved[17] | 9 | 11 |
| $.kpi.series.resolved[18] | 11 | 13 |
| $.kpi.series.resolved[20] | 6 | 10 |

...and 115 more paths (see the JSON file).

### collector GET /api/collector/report?period=quarterly&zone=1

Session reads2, id 9c6d19d842191ae4, 232050 bytes to 235188 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 658 | 758 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 722 | 622 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 47 | 52 |
| $.kpi.series.resolved[1] | 46 | 40 |
| $.kpi.series.resolved[2] | 58 | 63 |
| $.kpi.series.resolved[3] | 56 | 55 |
| $.kpi.series.resolved[4] | 60 | 61 |
| $.kpi.series.resolved[5] | 51 | 58 |
| $.kpi.series.resolved[6] | 64 | 56 |
| $.kpi.series.resolved[7] | 55 | 46 |
| $.kpi.series.resolved[8] | 65 | 66 |
| $.kpi.series.resolved[9] | 48 | 68 |
| $.kpi.series.resolved[10] | 64 | 67 |
| $.kpi.series.resolved[11] | 35 | 68 |
| $.kpi.series.resolved[12] | 9 | 58 |
| $.snapshot.overdue | 42 | 72 |
| $.news[0].sla_due | (absent) | 2026-11-05 15:27:11 |
| $.news[1].sla_due | (absent) | 2026-11-06 07:31:00 |
| $.news[2].sla_due | (absent) | 2026-10-30 00:35:13 |
| $.news[3].sla_due | (absent) | 2026-11-05 14:50:43 |
| $.news[4].sla_due | (absent) | 2026-10-27 20:56:12 |
| $.news[5].sla_due | (absent) | 2026-10-25 21:37:24 |

...and 135 more paths (see the JSON file).

### collector GET /api/collector/report?period=weekly&dept=GCC-SWM

Session reads2, id c075757d7bf2eabb, 128400 bytes to 129781 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 40 | 131 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 135 | 141 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 11 | 28 |
| $.kpi.series.resolved[1] | 10 | 18 |
| $.kpi.series.resolved[2] | 10 | 15 |
| $.kpi.series.resolved[3] | 7 | 16 |
| $.kpi.series.resolved[4] | 2 | 19 |
| $.kpi.series.resolved[5] | 0 | 18 |
| $.kpi.series.resolved[6] | 0 | 17 |
| $.news[0].sla_due | (absent) | 2026-11-08 17:25:50 |
| $.news[1].sla_due | (absent) | 2026-11-07 03:56:22 |
| $.news[2].sla_due | (absent) | 2026-11-05 03:18:42 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-04 08:45:00 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-05 00:52:00 |
| $.severity.rows[2].sla_due | (absent) | 2026-11-03 10:37:00 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-02 15:39:00 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-04 10:29:00 |
| $.severity.rows[5].sla_due | (absent) | 2026-11-05 20:50:00 |
| $.severity.rows[6].sla_due | (absent) | 2026-11-05 19:40:00 |
| $.severity.rows[7].sla_due | (absent) | 2026-11-03 23:25:00 |
| $.severity.rows[8].sla_due | (absent) | 2026-11-04 10:39:10 |
| $.severity.rows[9].sla_due | (absent) | 2026-11-02 09:00:00 |

...and 30 more paths (see the JSON file).

### collector POST /api/map/ask

Session ask, id f72ab168b140febd, 62759 bytes to 63074 bytes.

| Path | A | B |
|---|---|---|
| $.rows[27].overdue | false | true |
| $.rows[31].overdue | false | true |
| $.rows[34].overdue | false | true |
| $.rows[35].overdue | false | true |
| $.rows[36].overdue | false | true |
| $.rows[37].overdue | false | true |
| $.rows[41].overdue | false | true |
| $.rows[45].overdue | false | true |
| $.rows[47].overdue | false | true |
| $.rows[48].overdue | false | true |
| $.rows[49].overdue | false | true |
| $.rows[50].overdue | false | true |
| $.rows[51].overdue | false | true |
| $.rows[52].overdue | false | true |
| $.rows[53].overdue | false | true |
| $.glance.overdue.n | 39 | 54 |
| $.glance.overdue.ids.length | 39 | 54 |
| $.glance.overdue.ids[27] | INC-20261104-3B5138-2 | INC-20261102-98BDA9 |
| $.glance.overdue.ids[28] | INC-20261105-A9E19D | INC-20261104-3B5138-2 |
| $.glance.overdue.ids[29] | INC-20261021-7F7CDE-1 | INC-20261105-A9E19D |
| $.glance.overdue.ids[30] | INC-20261104-FA9F68 | INC-20261021-7F7CDE-1 |
| $.glance.overdue.ids[31] | INC-20261105-697F9E | INC-20261106-BAE416 |
| $.glance.overdue.ids[32] | INC-20261105-162636 | INC-20261104-FA9F68 |
| $.glance.overdue.ids[33] | INC-20261104-376603 | INC-20261105-697F9E |
| $.glance.overdue.ids[34] | INC-20261104-54D0A3 | INC-20261103-B96D79 |

...and 22 more paths (see the JSON file).

### collector POST /api/map/ask

Session ask, id 072b9b8309cf3d65, 564476 bytes to 568115 bytes.

| Path | A | B |
|---|---|---|
| $.rows[56].overdue | false | true |
| $.rows[70].overdue | false | true |
| $.rows[82].overdue | false | true |
| $.rows[83].overdue | false | true |
| $.rows[85].overdue | false | true |
| $.rows[100].overdue | false | true |
| $.rows[104].overdue | false | true |
| $.rows[125].overdue | false | true |
| $.rows[156].overdue | false | true |
| $.rows[161].overdue | false | true |
| $.rows[185].overdue | false | true |
| $.rows[186].overdue | false | true |
| $.rows[187].overdue | false | true |
| $.rows[197].overdue | false | true |
| $.rows[199].overdue | false | true |
| $.glance.overdue.n | 339 | 505 |
| $.glance.overdue.ids.length | 339 | 505 |
| $.glance.overdue.ids[56] | INC-20261104-3B5138-2 | INC-20261102-98BDA9 |
| $.glance.overdue.ids[57] | INC-20261104-CD5940 | INC-20261104-3B5138-2 |
| $.glance.overdue.ids[58] | INC-20261021-238B98-1 | INC-20261104-CD5940 |
| $.glance.overdue.ids[59] | INC-20260513-493D82 | INC-20261021-238B98-1 |
| $.glance.overdue.ids[60] | INC-20261105-A9E19D | INC-20260513-493D82 |
| $.glance.overdue.ids[61] | INC-20261104-83D2C2 | INC-20261105-A9E19D |
| $.glance.overdue.ids[62] | INC-20261103-08F9E4 | INC-20261104-83D2C2 |
| $.glance.overdue.ids[63] | INC-20261104-3C1FF8 | INC-20261103-08F9E4 |

...and 441 more paths (see the JSON file).

### collector POST /api/map/ask

Session ask, id 39b775090318e8e0, 219630 bytes to 219861 bytes.

| Path | A | B |
|---|---|---|
| $.rows[8].overdue | false | true |
| $.rows[12].overdue | false | true |
| $.rows[24].overdue | false | true |
| $.rows[41].overdue | false | true |
| $.rows[42].overdue | false | true |
| $.rows[47].overdue | false | true |
| $.rows[48].overdue | false | true |
| $.rows[50].overdue | false | true |
| $.rows[55].overdue | false | true |
| $.rows[67].overdue | false | true |
| $.rows[68].overdue | false | true |
| $.glance.overdue.n | 11 | 22 |
| $.glance.overdue.ids.length | 11 | 22 |
| $.glance.overdue.ids[8] | INC-20261105-AB1018 | INC-20261106-BAE416 |
| $.glance.overdue.ids[9] | INC-20261105-DDD4E8 | INC-20261105-AB1018 |
| $.glance.overdue.ids[10] | INC-20260905-319067 | INC-20261105-DDD4E8 |
| $.glance.overdue.ids[11] | (absent) | INC-20260905-319067 |
| $.glance.overdue.ids[12] | (absent) | INC-20261106-C854D7 |
| $.glance.overdue.ids[13] | (absent) | INC-20261106-338506 |
| $.glance.overdue.ids[14] | (absent) | INC-20261106-DB59AE |
| $.glance.overdue.ids[15] | (absent) | INC-20261106-444D4F |
| $.glance.overdue.ids[16] | (absent) | INC-20261105-A18D6C |
| $.glance.overdue.ids[17] | (absent) | INC-20261105-DB3F54 |
| $.glance.overdue.ids[18] | (absent) | INC-20261106-34D369 |
| $.glance.overdue.ids[19] | (absent) | INC-20261106-E43C6B |

...and 2 more paths (see the JSON file).

### collector POST /api/map/ask

Session ask, id d08c18ab85c7b099, 564475 bytes to 568114 bytes.

| Path | A | B |
|---|---|---|
| $.rows[56].overdue | false | true |
| $.rows[70].overdue | false | true |
| $.rows[82].overdue | false | true |
| $.rows[83].overdue | false | true |
| $.rows[85].overdue | false | true |
| $.rows[100].overdue | false | true |
| $.rows[104].overdue | false | true |
| $.rows[125].overdue | false | true |
| $.rows[156].overdue | false | true |
| $.rows[161].overdue | false | true |
| $.rows[185].overdue | false | true |
| $.rows[186].overdue | false | true |
| $.rows[187].overdue | false | true |
| $.rows[197].overdue | false | true |
| $.rows[199].overdue | false | true |
| $.glance.overdue.n | 339 | 505 |
| $.glance.overdue.ids.length | 339 | 505 |
| $.glance.overdue.ids[56] | INC-20261104-3B5138-2 | INC-20261102-98BDA9 |
| $.glance.overdue.ids[57] | INC-20261104-CD5940 | INC-20261104-3B5138-2 |
| $.glance.overdue.ids[58] | INC-20261021-238B98-1 | INC-20261104-CD5940 |
| $.glance.overdue.ids[59] | INC-20260513-493D82 | INC-20261021-238B98-1 |
| $.glance.overdue.ids[60] | INC-20261105-A9E19D | INC-20260513-493D82 |
| $.glance.overdue.ids[61] | INC-20261104-83D2C2 | INC-20261105-A9E19D |
| $.glance.overdue.ids[62] | INC-20261103-08F9E4 | INC-20261104-83D2C2 |
| $.glance.overdue.ids[63] | INC-20261104-3C1FF8 | INC-20261103-08F9E4 |

...and 441 more paths (see the JSON file).

### collector POST /api/map/ask

Session ask, id f0398307a4621bf6, 63343 bytes to 63629 bytes.

| Path | A | B |
|---|---|---|
| $.rows[27].overdue | false | true |
| $.rows[31].overdue | false | true |
| $.rows[34].overdue | false | true |
| $.rows[35].overdue | false | true |
| $.rows[36].overdue | false | true |
| $.rows[37].overdue | false | true |
| $.rows[41].overdue | false | true |
| $.rows[45].overdue | false | true |
| $.rows[47].overdue | false | true |
| $.rows[48].overdue | false | true |
| $.rows[49].overdue | false | true |
| $.rows[50].overdue | false | true |
| $.rows[51].overdue | false | true |
| $.rows[52].overdue | false | true |
| $.rows[53].overdue | false | true |
| $.glance.overdue.n | 39 | 54 |
| $.glance.overdue.ids.length | 39 | 54 |
| $.glance.overdue.ids[27] | INC-20261104-3B5138-2 | INC-20261102-98BDA9 |
| $.glance.overdue.ids[28] | INC-20261105-A9E19D | INC-20261104-3B5138-2 |
| $.glance.overdue.ids[29] | INC-20261021-7F7CDE-1 | INC-20261105-A9E19D |
| $.glance.overdue.ids[30] | INC-20261104-FA9F68 | INC-20261021-7F7CDE-1 |
| $.glance.overdue.ids[31] | INC-20261105-697F9E | INC-20261106-BAE416 |
| $.glance.overdue.ids[32] | INC-20261105-162636 | INC-20261104-FA9F68 |
| $.glance.overdue.ids[33] | INC-20261104-376603 | INC-20261105-697F9E |
| $.glance.overdue.ids[34] | INC-20261104-54D0A3 | INC-20261103-B96D79 |

...and 22 more paths (see the JSON file).

### collector POST /api/map/ask

Session ask, id 94587306b96d9d3e, 362260 bytes to 363618 bytes.

| Path | A | B |
|---|---|---|
| $.rows[24].overdue | false | true |
| $.rows[42].overdue | false | true |
| $.rows[51].overdue | false | true |
| $.rows[57].overdue | false | true |
| $.rows[66].overdue | false | true |
| $.rows[67].overdue | false | true |
| $.rows[68].overdue | false | true |
| $.rows[71].overdue | false | true |
| $.rows[72].overdue | false | true |
| $.rows[73].overdue | false | true |
| $.rows[75].overdue | false | true |
| $.rows[76].overdue | false | true |
| $.rows[79].overdue | false | true |
| $.rows[80].overdue | false | true |
| $.rows[86].overdue | false | true |
| $.rows[87].overdue | false | true |
| $.rows[88].overdue | false | true |
| $.rows[89].overdue | false | true |
| $.rows[91].overdue | false | true |
| $.rows[96].overdue | false | true |
| $.rows[98].overdue | false | true |
| $.rows[100].overdue | false | true |
| $.rows[102].overdue | false | true |
| $.rows[106].overdue | false | true |
| $.rows[107].overdue | false | true |

...and 174 more paths (see the JSON file).

### collector POST /api/map/ask

Session ask, id d2294a1c2f5a1476, 62812 bytes to 63127 bytes.

| Path | A | B |
|---|---|---|
| $.rows[27].overdue | false | true |
| $.rows[31].overdue | false | true |
| $.rows[34].overdue | false | true |
| $.rows[35].overdue | false | true |
| $.rows[36].overdue | false | true |
| $.rows[37].overdue | false | true |
| $.rows[41].overdue | false | true |
| $.rows[45].overdue | false | true |
| $.rows[47].overdue | false | true |
| $.rows[48].overdue | false | true |
| $.rows[49].overdue | false | true |
| $.rows[50].overdue | false | true |
| $.rows[51].overdue | false | true |
| $.rows[52].overdue | false | true |
| $.rows[53].overdue | false | true |
| $.glance.overdue.n | 39 | 54 |
| $.glance.overdue.ids.length | 39 | 54 |
| $.glance.overdue.ids[27] | INC-20261104-3B5138-2 | INC-20261102-98BDA9 |
| $.glance.overdue.ids[28] | INC-20261105-A9E19D | INC-20261104-3B5138-2 |
| $.glance.overdue.ids[29] | INC-20261021-7F7CDE-1 | INC-20261105-A9E19D |
| $.glance.overdue.ids[30] | INC-20261104-FA9F68 | INC-20261021-7F7CDE-1 |
| $.glance.overdue.ids[31] | INC-20261105-697F9E | INC-20261106-BAE416 |
| $.glance.overdue.ids[32] | INC-20261105-162636 | INC-20261104-FA9F68 |
| $.glance.overdue.ids[33] | INC-20261104-376603 | INC-20261105-697F9E |
| $.glance.overdue.ids[34] | INC-20261104-54D0A3 | INC-20261103-B96D79 |

...and 22 more paths (see the JSON file).

### collector POST /api/map/ask

Session ask, id de5db7c5672bb27c, 361794 bytes to 363152 bytes.

| Path | A | B |
|---|---|---|
| $.rows[24].overdue | false | true |
| $.rows[42].overdue | false | true |
| $.rows[51].overdue | false | true |
| $.rows[57].overdue | false | true |
| $.rows[66].overdue | false | true |
| $.rows[67].overdue | false | true |
| $.rows[68].overdue | false | true |
| $.rows[71].overdue | false | true |
| $.rows[72].overdue | false | true |
| $.rows[73].overdue | false | true |
| $.rows[75].overdue | false | true |
| $.rows[76].overdue | false | true |
| $.rows[79].overdue | false | true |
| $.rows[80].overdue | false | true |
| $.rows[86].overdue | false | true |
| $.rows[87].overdue | false | true |
| $.rows[88].overdue | false | true |
| $.rows[89].overdue | false | true |
| $.rows[91].overdue | false | true |
| $.rows[96].overdue | false | true |
| $.rows[98].overdue | false | true |
| $.rows[100].overdue | false | true |
| $.rows[102].overdue | false | true |
| $.rows[106].overdue | false | true |
| $.rows[107].overdue | false | true |

...and 174 more paths (see the JSON file).

### collector POST /api/map/ask

Session ask, id 2a4222c03432fc3b, 564495 bytes to 568134 bytes.

| Path | A | B |
|---|---|---|
| $.rows[56].overdue | false | true |
| $.rows[70].overdue | false | true |
| $.rows[82].overdue | false | true |
| $.rows[83].overdue | false | true |
| $.rows[85].overdue | false | true |
| $.rows[100].overdue | false | true |
| $.rows[104].overdue | false | true |
| $.rows[125].overdue | false | true |
| $.rows[156].overdue | false | true |
| $.rows[161].overdue | false | true |
| $.rows[185].overdue | false | true |
| $.rows[186].overdue | false | true |
| $.rows[187].overdue | false | true |
| $.rows[197].overdue | false | true |
| $.rows[199].overdue | false | true |
| $.glance.overdue.n | 339 | 505 |
| $.glance.overdue.ids.length | 339 | 505 |
| $.glance.overdue.ids[56] | INC-20261104-3B5138-2 | INC-20261102-98BDA9 |
| $.glance.overdue.ids[57] | INC-20261104-CD5940 | INC-20261104-3B5138-2 |
| $.glance.overdue.ids[58] | INC-20261021-238B98-1 | INC-20261104-CD5940 |
| $.glance.overdue.ids[59] | INC-20260513-493D82 | INC-20261021-238B98-1 |
| $.glance.overdue.ids[60] | INC-20261105-A9E19D | INC-20260513-493D82 |
| $.glance.overdue.ids[61] | INC-20261104-83D2C2 | INC-20261105-A9E19D |
| $.glance.overdue.ids[62] | INC-20261103-08F9E4 | INC-20261104-83D2C2 |
| $.glance.overdue.ids[63] | INC-20261104-3C1FF8 | INC-20261103-08F9E4 |

...and 441 more paths (see the JSON file).

### collector POST /api/map/ask

Session ask, id 8776cda3e9c5a398, 564534 bytes to 568173 bytes.

| Path | A | B |
|---|---|---|
| $.rows[56].overdue | false | true |
| $.rows[70].overdue | false | true |
| $.rows[82].overdue | false | true |
| $.rows[83].overdue | false | true |
| $.rows[85].overdue | false | true |
| $.rows[100].overdue | false | true |
| $.rows[104].overdue | false | true |
| $.rows[125].overdue | false | true |
| $.rows[156].overdue | false | true |
| $.rows[161].overdue | false | true |
| $.rows[185].overdue | false | true |
| $.rows[186].overdue | false | true |
| $.rows[187].overdue | false | true |
| $.rows[197].overdue | false | true |
| $.rows[199].overdue | false | true |
| $.glance.overdue.n | 339 | 505 |
| $.glance.overdue.ids.length | 339 | 505 |
| $.glance.overdue.ids[56] | INC-20261104-3B5138-2 | INC-20261102-98BDA9 |
| $.glance.overdue.ids[57] | INC-20261104-CD5940 | INC-20261104-3B5138-2 |
| $.glance.overdue.ids[58] | INC-20261021-238B98-1 | INC-20261104-CD5940 |
| $.glance.overdue.ids[59] | INC-20260513-493D82 | INC-20261021-238B98-1 |
| $.glance.overdue.ids[60] | INC-20261105-A9E19D | INC-20260513-493D82 |
| $.glance.overdue.ids[61] | INC-20261104-83D2C2 | INC-20261105-A9E19D |
| $.glance.overdue.ids[62] | INC-20261103-08F9E4 | INC-20261104-83D2C2 |
| $.glance.overdue.ids[63] | INC-20261104-3C1FF8 | INC-20261103-08F9E4 |

...and 441 more paths (see the JSON file).

### collector POST /api/map/ask

Session ask, id fe04ca90c5da3fba, 564522 bytes to 568161 bytes.

| Path | A | B |
|---|---|---|
| $.rows[56].overdue | false | true |
| $.rows[70].overdue | false | true |
| $.rows[82].overdue | false | true |
| $.rows[83].overdue | false | true |
| $.rows[85].overdue | false | true |
| $.rows[100].overdue | false | true |
| $.rows[104].overdue | false | true |
| $.rows[125].overdue | false | true |
| $.rows[156].overdue | false | true |
| $.rows[161].overdue | false | true |
| $.rows[185].overdue | false | true |
| $.rows[186].overdue | false | true |
| $.rows[187].overdue | false | true |
| $.rows[197].overdue | false | true |
| $.rows[199].overdue | false | true |
| $.glance.overdue.n | 339 | 505 |
| $.glance.overdue.ids.length | 339 | 505 |
| $.glance.overdue.ids[56] | INC-20261104-3B5138-2 | INC-20261102-98BDA9 |
| $.glance.overdue.ids[57] | INC-20261104-CD5940 | INC-20261104-3B5138-2 |
| $.glance.overdue.ids[58] | INC-20261021-238B98-1 | INC-20261104-CD5940 |
| $.glance.overdue.ids[59] | INC-20260513-493D82 | INC-20261021-238B98-1 |
| $.glance.overdue.ids[60] | INC-20261105-A9E19D | INC-20260513-493D82 |
| $.glance.overdue.ids[61] | INC-20261104-83D2C2 | INC-20261105-A9E19D |
| $.glance.overdue.ids[62] | INC-20261103-08F9E4 | INC-20261104-83D2C2 |
| $.glance.overdue.ids[63] | INC-20261104-3C1FF8 | INC-20261103-08F9E4 |

...and 441 more paths (see the JSON file).

### collector POST /api/map/send (plan of sentence 1)

Session ask, id 688942c0db7068e8, 13268 bytes to 13553 bytes.

| Path | A | B |
|---|---|---|
| $.drafts[1].body | Dear Department officer,  The Collector's map shows 21 open cases for Greater Chennai Police that match "Which zone has the most severe inci... (3215 chars) | Dear Department officer,  The Collector's map shows 21 open cases for Greater Chennai Police that match "Which zone has the most severe inci... (3500 chars) |

### collector POST /api/collector/thunai/agent/round

Session ask, id bc94a14cdfe5ac48, 7383 bytes to 7359 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 5 of the 5 shown are past their deadline. | 5 of the 5 are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 5-இல் 5 காலக்கெடுவைத் தாண்டியவை. | 5-இல் 5 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 5 cases this week. 5 are past their deadline and need you first: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Lloyds Road), ... (298 chars) | 5 cases this week. 5 are past their deadline and need you first: uncleared garbage at Rasha Hydhar Street, Anna Salai, Chepauk in Teynampet,... (309 chars) |
| $.result.stage.say.ta | இந்த வாரம் 5 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Lloy... (301 chars) | இந்த வாரம் 5 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rasha Hydhar Street, Anna Salai, Chepauk in ... (312 chars) |
| $.result.stage.blocks[1].rows | (same items) | (in another order) |
| $.result.stage.blocks[2].points[0].id | INC-20261102-132638 | INC-20261103-22C9F8 |
| $.result.stage.blocks[2].points[0].lat | 13.041418 | 13.06198355 |
| $.result.stage.blocks[2].points[0].lon | 80.2590202 | 80.28117234999999 |
| $.result.stage.blocks[2].points[0].label | Removal of Debris: the problem on Rotary Nagar Ixth Street has continued for two weeks now | எங்கள் குடியிருப்போர் நலச் சங்கம் (47 குடும்பங்கள்) சார்பாக எழுதுகிறேன் |
| $.result.stage.blocks[2].points[0].sev | Low | Medium |
| $.result.stage.blocks[2].points[1].id | INC-20261101-774B5E | INC-20261102-8EC358 |
| $.result.stage.blocks[2].points[1].lat | 13.0365913 | 13.033772 |
| $.result.stage.blocks[2].points[1].lon | 80.2732008 | 80.2715343 |
| $.result.stage.blocks[2].points[1].label | Complaint about cleanliness in footpath opp. St. Mary's Church | Garbage at the dumping ground is burning since last Monday |
| $.result.stage.blocks[2].points[1].sev | Low | Medium |
| $.result.stage.blocks[2].points[2].id | INC-20261103-22C9F8 | INC-20261030-CB8991 |
| $.result.stage.blocks[2].points[2].lat | 13.06198355 | 13.0516776 |
| $.result.stage.blocks[2].points[2].lon | 80.28117234999999 | 80.263255 |
| $.result.stage.blocks[2].points[2].label | எங்கள் குடியிருப்போர் நலச் சங்கம் (47 குடும்பங்கள்) சார்பாக எழுதுகிறேன் | Burning of Garbage: the problem near Pillaiyar Kovil has continued for the past 4 days |
| $.result.stage.blocks[2].points[3].id | INC-20261102-8EC358 | INC-20261102-132638 |
| $.result.stage.blocks[2].points[3].lat | 13.033772 | 13.041418 |
| $.result.stage.blocks[2].points[3].lon | 80.2715343 | 80.2590202 |
| $.result.stage.blocks[2].points[3].label | Garbage at the dumping ground is burning since last Monday | Removal of Debris: the problem on Rotary Nagar Ixth Street has continued for two weeks now |
| $.result.stage.blocks[2].points[3].sev | Medium | Low |
| $.result.stage.blocks[2].points[4].id | INC-20261030-CB8991 | INC-20261101-774B5E |

...and 8 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round

Session ask, id ac136777a4aee429, 11213 bytes to 12303 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway | null | {object with 2 keys} |
| $.result.stage.say.en | 23 cases today; here are the 12 that matter most. The most urgent: an encroachment or unauthorised construction at Vallalar Extn Extension i... (224 chars) | 23 cases today; here are the 12 that matter most. 2 are past their deadline and need you first: standing water at Saidapet (Adyar River - Sa... (243 chars) |
| $.result.stage.say.ta | இன்று 23 சம்பவங்கள். மிக அவசரமானது: an encroachment or unauthorised construction at Vallalar Extn Extension in Adyar. Storm Water Drain வசம்... (190 chars) | இன்று 23 சம்பவங்கள். 2 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Saidapet (Adyar River - Saidapet stretch), Road acc... (220 chars) |
| $.result.stage.blocks[0].items.length | 3 | 2 |
| $.result.stage.blocks[0].items[1].value | 0 | 2 |
| $.result.stage.blocks[0].items[1].tone | good | bad |
| $.result.stage.blocks[0].items[2] | {object with 8 keys} | (absent) |
| $.result.stage.blocks[1].rows[0].id | INC-20261106-176CA8 | INC-20261105-5C94BB |
| $.result.stage.blocks[1].rows[0].title | அனுமதியின்றி கூடுதல் மாடி கட்டப்படுகிறது. நடவடிக்கை எடுக்கவும் | Call recd: canal water flowing into Srinivasa Nagar 6th St, Saidapet from Adyar River |
| $.result.stage.blocks[1].rows[0].sev | Low | Severe |
| $.result.stage.blocks[1].rows[0].status | Under review | In progress |
| $.result.stage.blocks[1].rows[0].place | Vallalar Extn Extension | Saidapet (Adyar River - Saidapet stretch) |
| $.result.stage.blocks[1].rows[0].ward | 178 | 170 |
| $.result.stage.blocks[1].rows[0].dept | GCC-ENG | PWD-WRD |
| $.result.stage.blocks[1].rows[0].deptName | Roads & Building Permissions | PWD Water Resources |
| $.result.stage.blocks[1].rows[0].complaints | 1 | 0 |
| $.result.stage.blocks[1].rows[0].t | 2026-11-06 15:18:00 | 2026-11-05 23:41:50 |
| $.result.stage.blocks[1].rows[0].overdue | false | true |
| $.result.stage.blocks[1].rows[0].lat | 12.9710944 | 13.010337 |
| $.result.stage.blocks[1].rows[0].lon | 80.2154243 | 80.206788 |
| $.result.stage.blocks[1].rows[0].cat | Encroachment & unauthorised construction | Flooding & waterlogging |
| $.result.stage.blocks[1].rows[1].id | INC-20261106-8DB9EB | INC-20261106-444D4F |
| $.result.stage.blocks[1].rows[1].title | வடிகால் பணி நடக்கும் இடத்தில் தடுப்பு வேலி இல்லை | Two-wheeler skids near Ekkattuthangal Metro Station; rider injured |
| $.result.stage.blocks[1].rows[1].sev | Low | High |
| $.result.stage.blocks[1].rows[1].status | Under review | In progress |

...and 215 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round

Session ask, id f1e6ac2ad90ac282, 12498 bytes to 12224 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 12 of the 12 shown are past their deadline. | 54 of the 52 are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 12-இல் 12 காலக்கெடுவைத் தாண்டியவை. | 52-இல் 54 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 52 severe cases this week; here are the 12 that matter most. 12 are past their deadline and need you first: standing water at Pulianthope (B... (319 chars) | 52 severe cases this week; here are the 12 that matter most. 54 are past their deadline and need you first: standing water at Pulianthope (B... (281 chars) |
| $.result.stage.say.ta | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 12 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Pulianthope (Buckingham Canal - Basi... (290 chars) | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 54 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Pulianthope (Buckingham Canal - Basi... (261 chars) |
| $.result.stage.blocks[0].items.length | 3 | 2 |
| $.result.stage.blocks[0].items[1].value | 12 | 54 |
| $.result.stage.blocks[0].items[2] | {object with 8 keys} | (absent) |
| $.result.stage.sources.length | 1 | 2 |
| $.result.stage.sources[1] | (absent) | incidents |
| $.result.say | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 12 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Pulianthope (Buckingham Canal - Basi... (290 chars) | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 54 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Pulianthope (Buckingham Canal - Basi... (261 chars) |

### collector POST /api/collector/thunai/agent/round

Session ask, id 484c3e63acc4f70c, 11166 bytes to 11103 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 7 of the 10 shown are past their deadline. | 5 of the 11 are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 10-இல் 7 காலக்கெடுவைத் தாண்டியவை. | 11-இல் 5 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 10 cases this week. 7 are past their deadline and need you first: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Lloyds Road),... (329 chars) | 11 cases this week; here are the 10 that matter most. 5 are past their deadline and need you first: uncleared garbage at Rasha Hydhar Street... (344 chars) |
| $.result.stage.say.ta | இந்த வாரம் 10 சம்பவங்கள். 7 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Llo... (332 chars) | இந்த வாரம் 11 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rasha Hydhar Street, Anna Salai, Chepauk in... (313 chars) |
| $.result.stage.blocks[0].items[0].value | 10 | 11 |
| $.result.stage.blocks[0].items[1].value | 7 | 5 |
| $.result.stage.blocks[1].total | 10 | 11 |
| $.result.stage.blocks[1].rows | (same items) | (in another order) |
| $.result.stage.blocks[2].points[0].id | INC-20261106-0E2C3D | INC-20261105-00A77C |
| $.result.stage.blocks[2].points[0].lat | 13.0506905 | 13.0310491 |
| $.result.stage.blocks[2].points[0].lon | 80.2710942 | 80.2716261 |
| $.result.stage.blocks[2].points[0].label | Nuisance by Garbage Tractor/Truck: the problem in our street has continued for two weeks now | People are burning garbage near Children's park gate every evening |
| $.result.stage.blocks[2].points[0].sev | Low | Medium |
| $.result.stage.blocks[2].points[1].id | INC-20261102-FDC61F | INC-20261103-22C9F8 |
| $.result.stage.blocks[2].points[1].lat | 13.0441146 | 13.06198355 |
| $.result.stage.blocks[2].points[1].lon | 80.2511946 | 80.28117234999999 |
| $.result.stage.blocks[2].points[1].label | Garbage Lorry without Net: the problem on Nehru 4th St has continued since last Monday | எங்கள் குடியிருப்போர் நலச் சங்கம் (47 குடும்பங்கள்) சார்பாக எழுதுகிறேன் |
| $.result.stage.blocks[2].points[1].sev | Low | Medium |
| $.result.stage.blocks[2].points[2].id | INC-20261102-132638 | INC-20261102-8EC358 |
| $.result.stage.blocks[2].points[2].lat | 13.041418 | 13.033772 |
| $.result.stage.blocks[2].points[2].lon | 80.2590202 | 80.2715343 |
| $.result.stage.blocks[2].points[2].label | Removal of Debris: the problem on Rotary Nagar Ixth Street has continued for two weeks now | Garbage at the dumping ground is burning since last Monday |
| $.result.stage.blocks[2].points[2].sev | Low | Medium |
| $.result.stage.blocks[2].points[3].id | INC-20261101-C8D6E1 | INC-20261030-CB8991 |
| $.result.stage.blocks[2].points[3].lat | 13.0386679 | 13.0516776 |

...and 38 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round

Session ask, id 0401451bde1ac789, 5985 bytes to 5945 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 1 of the 2 shown is past its deadline. | 1 of the 2 is past its deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 2-இல் 1 காலக்கெடுவைத் தாண்டியவை. | 2-இல் 1 காலக்கெடுவைத் தாண்டியவை. |

### collector POST /api/collector/thunai/agent/round

Session ask, id 7ee55bdb05ba2342, 2666 bytes to 337 bytes.

| Path | A | B |
|---|---|---|
| $.result.kind | do | none |
| $.result.steps.length | 1 | 0 |
| $.result.steps[0] | {object with 2 keys} | (absent) |
| $.result.stage | {object with 13 keys} | null |
| $.result.say | 4 அளவீடுகள். அதிகம்: Chennai-Madhavaram, 14 mm, 6 Nov, 8:30 AM நிலவரப்படி. | null |
| $.result.note | quick | no-model |
| $.trace.length | 2 | 1 |
| $.trace[0].label | தரவைப் படிக்கிறேன் | யோசிக்கிறேன் |
| $.trace[1] | {object with 3 keys} | (absent) |
| $.lane | quick | no-model |

### collector POST /api/collector/thunai/agent/round

Session ask, id fa394469d1d31521, 11480 bytes to 10891 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway | null | {object with 2 keys} |
| $.result.stage.say.en | 105 cases this week; here are the 12 that matter most. The most urgent: an encroachment or unauthorised construction at Vallalar Extn Extens... (229 chars) | 91 cases this week; here are the 12 that matter most. 42 are past their deadline and need you first: standing water at Saidapet (Adyar River... (247 chars) |
| $.result.stage.say.ta | இந்த வாரம் 105 சம்பவங்கள். மிக அவசரமானது: an encroachment or unauthorised construction at Vallalar Extn Extension in Adyar. Storm Water Drai... (196 chars) | இந்த வாரம் 91 சம்பவங்கள். 42 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Saidapet (Adyar River - Saidapet stretch), st... (225 chars) |
| $.result.stage.blocks[0].items.length | 3 | 2 |
| $.result.stage.blocks[0].items[0].value | 105 | 91 |
| $.result.stage.blocks[0].items[1].value | 0 | 42 |
| $.result.stage.blocks[0].items[1].tone | good | bad |
| $.result.stage.blocks[0].items[2] | {object with 8 keys} | (absent) |
| $.result.stage.blocks[1].total | 105 | 91 |
| $.result.stage.blocks[1].rows[0].id | INC-20261106-176CA8 | INC-20261105-5C94BB |
| $.result.stage.blocks[1].rows[0].title | அனுமதியின்றி கூடுதல் மாடி கட்டப்படுகிறது. நடவடிக்கை எடுக்கவும் | Call recd: canal water flowing into Srinivasa Nagar 6th St, Saidapet from Adyar River |
| $.result.stage.blocks[1].rows[0].sev | Low | Severe |
| $.result.stage.blocks[1].rows[0].status | Under review | In progress |
| $.result.stage.blocks[1].rows[0].place | Vallalar Extn Extension | Saidapet (Adyar River - Saidapet stretch) |
| $.result.stage.blocks[1].rows[0].ward | 178 | 170 |
| $.result.stage.blocks[1].rows[0].dept | GCC-ENG | PWD-WRD |
| $.result.stage.blocks[1].rows[0].deptName | Roads & Building Permissions | PWD Water Resources |
| $.result.stage.blocks[1].rows[0].complaints | 1 | 0 |
| $.result.stage.blocks[1].rows[0].t | 2026-11-06 15:18:00 | 2026-11-05 23:41:50 |
| $.result.stage.blocks[1].rows[0].overdue | false | true |
| $.result.stage.blocks[1].rows[0].lat | 12.9710944 | 13.010337 |
| $.result.stage.blocks[1].rows[0].lon | 80.2154243 | 80.206788 |
| $.result.stage.blocks[1].rows[0].cat | Encroachment & unauthorised construction | Flooding & waterlogging |
| $.result.stage.blocks[1].rows[1].id | INC-20261106-8DB9EB | INC-20261105-BFD2E3 |
| $.result.stage.blocks[1].rows[1].title | வடிகால் பணி நடக்கும் இடத்தில் தடுப்பு வேலி இல்லை | Little Mount பெட்ரோல் பங்க் எதிரில் சாலையில் தண்ணீர் தேங்கி வாகனங்கள் செல்ல முடியவில்லை |

...and 240 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round

Session ask, id f09bcf697432c0ab, 10780 bytes to 10717 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 7 of the 10 shown are past their deadline. | 5 of the 11 are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 10-இல் 7 காலக்கெடுவைத் தாண்டியவை. | 11-இல் 5 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 10 cases this week. 7 are past their deadline and need you first: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Lloyds Road),... (329 chars) | 11 cases this week; here are the 10 that matter most. 5 are past their deadline and need you first: uncleared garbage at Rasha Hydhar Street... (344 chars) |
| $.result.stage.say.ta | இந்த வாரம் 10 சம்பவங்கள். 7 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Llo... (332 chars) | இந்த வாரம் 11 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rasha Hydhar Street, Anna Salai, Chepauk in... (313 chars) |
| $.result.stage.blocks[0].items[0].value | 10 | 11 |
| $.result.stage.blocks[0].items[1].value | 7 | 5 |
| $.result.stage.blocks[1].total | 10 | 11 |
| $.result.stage.blocks[1].rows | (same items) | (in another order) |
| $.result.stage.blocks[2].points[0].id | INC-20261106-0E2C3D | INC-20261105-00A77C |
| $.result.stage.blocks[2].points[0].lat | 13.0506905 | 13.0310491 |
| $.result.stage.blocks[2].points[0].lon | 80.2710942 | 80.2716261 |
| $.result.stage.blocks[2].points[0].label | Nuisance by Garbage Tractor/Truck: the problem in our street has continued for two weeks now | People are burning garbage near Children's park gate every evening |
| $.result.stage.blocks[2].points[0].sev | Low | Medium |
| $.result.stage.blocks[2].points[1].id | INC-20261102-FDC61F | INC-20261103-22C9F8 |
| $.result.stage.blocks[2].points[1].lat | 13.0441146 | 13.06198355 |
| $.result.stage.blocks[2].points[1].lon | 80.2511946 | 80.28117234999999 |
| $.result.stage.blocks[2].points[1].label | Garbage Lorry without Net: the problem on Nehru 4th St has continued since last Monday | எங்கள் குடியிருப்போர் நலச் சங்கம் (47 குடும்பங்கள்) சார்பாக எழுதுகிறேன் |
| $.result.stage.blocks[2].points[1].sev | Low | Medium |
| $.result.stage.blocks[2].points[2].id | INC-20261102-132638 | INC-20261102-8EC358 |
| $.result.stage.blocks[2].points[2].lat | 13.041418 | 13.033772 |
| $.result.stage.blocks[2].points[2].lon | 80.2590202 | 80.2715343 |
| $.result.stage.blocks[2].points[2].label | Removal of Debris: the problem on Rotary Nagar Ixth Street has continued for two weeks now | Garbage at the dumping ground is burning since last Monday |
| $.result.stage.blocks[2].points[2].sev | Low | Medium |
| $.result.stage.blocks[2].points[3].id | INC-20261101-C8D6E1 | INC-20261030-CB8991 |
| $.result.stage.blocks[2].points[3].lat | 13.0386679 | 13.0516776 |

...and 38 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round

Session ask, id f025856d46a1ca5f, 6322 bytes to 6279 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 2 of the 3 shown are past their deadline. | 1 of the 3 is past its deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 3-இல் 2 காலக்கெடுவைத் தாண்டியவை. | 3-இல் 1 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 3 cases this week. 2 are past their deadline and need you first: a street light or electrical problem at Church Road, Padi, Mogappair in Amb... (333 chars) | 3 cases this week. One is past its deadline and needs you first: a street light or electrical problem at Church Road, Padi, Mogappair in Amb... (333 chars) |
| $.result.stage.say.ta | இந்த வாரம் 3 சம்பவங்கள். 2 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: a street light or electrical problem at Church Road, Padi, Mogapp... (336 chars) | இந்த வாரம் 3 சம்பவங்கள். 1 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: a street light or electrical problem at Church Road, Padi, Mogapp... (336 chars) |
| $.result.stage.blocks[0].items[1].value | 2 | 1 |
| $.result.say | இந்த வாரம் 3 சம்பவங்கள். 2 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: a street light or electrical problem at Church Road, Padi, Mogapp... (336 chars) | இந்த வாரம் 3 சம்பவங்கள். 1 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: a street light or electrical problem at Church Road, Padi, Mogapp... (336 chars) |

### collector POST /api/collector/thunai/agent/round

Session ask, id bcf00976700038f4, 309 bytes to 337 bytes.

| Path | A | B |
|---|---|---|
| $.result.lang | en | ta |
| $.trace[0].label | Thinking | யோசிக்கிறேன் |

### collector POST /api/collector/thunai/agent/round

Session ask, id 9ef6d6c5b729a804, 5107 bytes to 3800 bytes.

| Path | A | B |
|---|---|---|
| $.result.steps.length | 2 | 1 |
| $.result.steps[0].a | view | page |
| $.result.steps[0].view | {object with 1 keys} | (absent) |
| $.result.steps[0].page | (absent) | environment |
| $.result.steps[1] | {object with 2 keys} | (absent) |
| $.result.stage.recipe | cases | readings |
| $.result.stage.title | Cases · Drinking water supply · this week | Reservoir storage |
| $.result.stage.takeaway.en | 2 of the 2 shown are past their deadline. | Veeranam is 21% above its 28-day average. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 2-இல் 2 காலக்கெடுவைத் தாண்டியவை. | Veeranam அதன் 28 நாள் சராசரியை விட 21% அதிகம். |
| $.result.stage.say.en | 2 cases this week. 2 are past their deadline and need you first: Drinking water supply at Chennai, and a drinking-water problem at K.K. Naga... (234 chars) | 6 readings. Highest: Veeranam at 72% full, as of 6 Nov, 6:00 AM. |
| $.result.stage.say.ta | இந்த வாரம் 2 சம்பவங்கள். 2 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: Drinking water supply at Chennai, a drinking-water problem at K.K... (237 chars) | 6 அளவீடுகள். அதிகம்: Veeranam, 72%, 6 Nov, 6:00 AM நிலவரப்படி. |
| $.result.stage.blocks.length | 3 | 2 |
| $.result.stage.blocks[0].kind | Kpis | Readings |
| $.result.stage.blocks[0].id | kpis | readings |
| $.result.stage.blocks[0].title | Key numbers | Reservoir storage |
| $.result.stage.blocks[0].items.length | 3 | 6 |
| $.result.stage.blocks[0].items[0].key | total | (absent) |
| $.result.stage.blocks[0].items[0].label | All cases, this week | (absent) |
| $.result.stage.blocks[0].items[0].value | 2 | 72.1 |
| $.result.stage.blocks[0].items[0].unit | null | (absent) |
| $.result.stage.blocks[0].items[0].prev | null | (absent) |
| $.result.stage.blocks[0].items[0].delta | null | (absent) |
| $.result.stage.blocks[0].items[0].tone | neutral | (absent) |
| $.result.stage.blocks[0].items[0].spark | [array of 0] | (absent) |
| $.result.stage.blocks[0].items[0].id | (absent) | CMWSSB-VEERANAM |

...and 76 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round

Session ask, id a3c117ff746b0a57, 3298 bytes to 337 bytes.

| Path | A | B |
|---|---|---|
| $.result.kind | do | none |
| $.result.stage | {object with 13 keys} | null |
| $.result.say | இன்று சுருக்கத்தில் 6 குறிப்புகள். 24 incidents were reported in Adyar (last 24 hours), 71% more than the previous period. | null |
| $.result.note | resolve:exact | no-model |
| $.trace[0].label | சுருக்கம் தயார் செய்கிறேன் | யோசிக்கிறேன் |
| $.lane | resolve | no-model |

### collector POST /api/collector/thunai/agent/round (direct, sentence 2)

Session ask, id 374abbf925411872, 7335 bytes to 7311 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 5 of the 5 shown are past their deadline. | 5 of the 5 are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 5-இல் 5 காலக்கெடுவைத் தாண்டியவை. | 5-இல் 5 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 5 cases this week. 5 are past their deadline and need you first: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Lloyds Road), ... (298 chars) | 5 cases this week. 5 are past their deadline and need you first: uncleared garbage at Rasha Hydhar Street, Anna Salai, Chepauk in Teynampet,... (309 chars) |
| $.result.stage.say.ta | இந்த வாரம் 5 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Lloy... (301 chars) | இந்த வாரம் 5 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rasha Hydhar Street, Anna Salai, Chepauk in ... (312 chars) |
| $.result.stage.blocks[1].rows | (same items) | (in another order) |
| $.result.stage.blocks[2].points[0].id | INC-20261102-132638 | INC-20261103-22C9F8 |
| $.result.stage.blocks[2].points[0].lat | 13.041418 | 13.06198355 |
| $.result.stage.blocks[2].points[0].lon | 80.2590202 | 80.28117234999999 |
| $.result.stage.blocks[2].points[0].label | Removal of Debris: the problem on Rotary Nagar Ixth Street has continued for two weeks now | எங்கள் குடியிருப்போர் நலச் சங்கம் (47 குடும்பங்கள்) சார்பாக எழுதுகிறேன் |
| $.result.stage.blocks[2].points[0].sev | Low | Medium |
| $.result.stage.blocks[2].points[1].id | INC-20261101-774B5E | INC-20261102-8EC358 |
| $.result.stage.blocks[2].points[1].lat | 13.0365913 | 13.033772 |
| $.result.stage.blocks[2].points[1].lon | 80.2732008 | 80.2715343 |
| $.result.stage.blocks[2].points[1].label | Complaint about cleanliness in footpath opp. St. Mary's Church | Garbage at the dumping ground is burning since last Monday |
| $.result.stage.blocks[2].points[1].sev | Low | Medium |
| $.result.stage.blocks[2].points[2].id | INC-20261103-22C9F8 | INC-20261030-CB8991 |
| $.result.stage.blocks[2].points[2].lat | 13.06198355 | 13.0516776 |
| $.result.stage.blocks[2].points[2].lon | 80.28117234999999 | 80.263255 |
| $.result.stage.blocks[2].points[2].label | எங்கள் குடியிருப்போர் நலச் சங்கம் (47 குடும்பங்கள்) சார்பாக எழுதுகிறேன் | Burning of Garbage: the problem near Pillaiyar Kovil has continued for the past 4 days |
| $.result.stage.blocks[2].points[3].id | INC-20261102-8EC358 | INC-20261102-132638 |
| $.result.stage.blocks[2].points[3].lat | 13.033772 | 13.041418 |
| $.result.stage.blocks[2].points[3].lon | 80.2715343 | 80.2590202 |
| $.result.stage.blocks[2].points[3].label | Garbage at the dumping ground is burning since last Monday | Removal of Debris: the problem on Rotary Nagar Ixth Street has continued for two weeks now |
| $.result.stage.blocks[2].points[3].sev | Medium | Low |
| $.result.stage.blocks[2].points[4].id | INC-20261030-CB8991 | INC-20261101-774B5E |

...and 8 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round (direct, sentence 18)

Session ask, id e2bf5af9ffe285e3, 12414 bytes to 12140 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 12 of the 12 shown are past their deadline. | 54 of the 52 are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 12-இல் 12 காலக்கெடுவைத் தாண்டியவை. | 52-இல் 54 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 52 severe cases this week; here are the 12 that matter most. 12 are past their deadline and need you first: standing water at Pulianthope (B... (319 chars) | 52 severe cases this week; here are the 12 that matter most. 54 are past their deadline and need you first: standing water at Pulianthope (B... (281 chars) |
| $.result.stage.say.ta | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 12 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Pulianthope (Buckingham Canal - Basi... (290 chars) | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 54 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Pulianthope (Buckingham Canal - Basi... (261 chars) |
| $.result.stage.blocks[0].items.length | 3 | 2 |
| $.result.stage.blocks[0].items[1].value | 12 | 54 |
| $.result.stage.blocks[0].items[2] | {object with 8 keys} | (absent) |
| $.result.stage.sources.length | 1 | 2 |
| $.result.stage.sources[1] | (absent) | incidents |
| $.result.say | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 12 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Pulianthope (Buckingham Canal - Basi... (290 chars) | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 54 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Pulianthope (Buckingham Canal - Basi... (261 chars) |

### collector POST /api/collector/thunai/agent/round (direct, sentence 19)

Session ask, id 61ed15dc04e17ba5, 11082 bytes to 11019 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 7 of the 10 shown are past their deadline. | 5 of the 11 are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 10-இல் 7 காலக்கெடுவைத் தாண்டியவை. | 11-இல் 5 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 10 cases this week. 7 are past their deadline and need you first: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Lloyds Road),... (329 chars) | 11 cases this week; here are the 10 that matter most. 5 are past their deadline and need you first: uncleared garbage at Rasha Hydhar Street... (344 chars) |
| $.result.stage.say.ta | இந்த வாரம் 10 சம்பவங்கள். 7 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Llo... (332 chars) | இந்த வாரம் 11 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rasha Hydhar Street, Anna Salai, Chepauk in... (313 chars) |
| $.result.stage.blocks[0].items[0].value | 10 | 11 |
| $.result.stage.blocks[0].items[1].value | 7 | 5 |
| $.result.stage.blocks[1].total | 10 | 11 |
| $.result.stage.blocks[1].rows | (same items) | (in another order) |
| $.result.stage.blocks[2].points[0].id | INC-20261106-0E2C3D | INC-20261105-00A77C |
| $.result.stage.blocks[2].points[0].lat | 13.0506905 | 13.0310491 |
| $.result.stage.blocks[2].points[0].lon | 80.2710942 | 80.2716261 |
| $.result.stage.blocks[2].points[0].label | Nuisance by Garbage Tractor/Truck: the problem in our street has continued for two weeks now | People are burning garbage near Children's park gate every evening |
| $.result.stage.blocks[2].points[0].sev | Low | Medium |
| $.result.stage.blocks[2].points[1].id | INC-20261102-FDC61F | INC-20261103-22C9F8 |
| $.result.stage.blocks[2].points[1].lat | 13.0441146 | 13.06198355 |
| $.result.stage.blocks[2].points[1].lon | 80.2511946 | 80.28117234999999 |
| $.result.stage.blocks[2].points[1].label | Garbage Lorry without Net: the problem on Nehru 4th St has continued since last Monday | எங்கள் குடியிருப்போர் நலச் சங்கம் (47 குடும்பங்கள்) சார்பாக எழுதுகிறேன் |
| $.result.stage.blocks[2].points[1].sev | Low | Medium |
| $.result.stage.blocks[2].points[2].id | INC-20261102-132638 | INC-20261102-8EC358 |
| $.result.stage.blocks[2].points[2].lat | 13.041418 | 13.033772 |
| $.result.stage.blocks[2].points[2].lon | 80.2590202 | 80.2715343 |
| $.result.stage.blocks[2].points[2].label | Removal of Debris: the problem on Rotary Nagar Ixth Street has continued for two weeks now | Garbage at the dumping ground is burning since last Monday |
| $.result.stage.blocks[2].points[2].sev | Low | Medium |
| $.result.stage.blocks[2].points[3].id | INC-20261101-C8D6E1 | INC-20261030-CB8991 |
| $.result.stage.blocks[2].points[3].lat | 13.0386679 | 13.0516776 |

...and 38 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round (direct, sentence 20)

Session ask, id f0ed9bee243901b3, 5901 bytes to 5861 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 1 of the 2 shown is past its deadline. | 1 of the 2 is past its deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 2-இல் 1 காலக்கெடுவைத் தாண்டியவை. | 2-இல் 1 காலக்கெடுவைத் தாண்டியவை. |

### collector POST /api/collector/thunai/agent/round (follow-on)

Session ask, id 73f1e47d30159f90, 5841 bytes to 5841 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.blocks[0].items[2].value | 339 | 505 |
| $.result.stage.blocks[1].text | 1357 incidents this week against 1284 the period before (up 6%). Main reasons: flooding & waterlogging rose by 94, traffic obstruction & par... (336 chars) | 1357 incidents this week against 1284 the period before (up 6%). Main reasons: flooding & waterlogging rose by 94, traffic obstruction & par... (336 chars) |
| $.result.stage.blocks[1].facts[3].value | 103 | 269 |

### collector POST /api/collector/assistant/chat

Session ask, id 6824478baf7ee133, 7613 bytes to 7616 bytes.

| Path | A | B |
|---|---|---|
| $[5].data.answerMarkdown | Severe **596** · Open past deadline **888**  Adhigamana reported: Garbage & solid waste (1,867), Flooding & waterlogging (1,309), Street lig... (221 chars) | Severe **596** · Open past deadline **1,632**  Adhigamana reported: Garbage & solid waste (1,867), Flooding & waterlogging (1,309), Street l... (223 chars) |
| $[5].data.datasets[2].rows[0].overdue | 181 | 923 |
| $[5].data.datasets[2].rows[2].overdue | 144 | 145 |
| $[5].data.datasets[2].rows[3].overdue | 120 | 121 |
| $[5].data.kpis[2].value | 888 | 1632 |

### collector GET /api/collector/incidents/INC-20260926-EB3B79

Session writes, id afc98c033d1a5398, 7050 bytes to 7050 bytes.

| Path | A | B |
|---|---|---|
| $.incident | (same keys) | (in another order) |

### collector GET /api/collector/incidents/INC-20260926-EB3B79

Session writes, id e9539881d6c96949, 7050 bytes to 7050 bytes.

| Path | A | B |
|---|---|---|
| $.incident | (same keys) | (in another order) |

### collector GET /api/collector/incidents/INC-20260708-D4FE28

Session writes, id 7035aa2ffc68c0d3, 4256 bytes to 4256 bytes.

| Path | A | B |
|---|---|---|
| $.incident | (same keys) | (in another order) |

### collector GET /api/collector/incidents/INC-20261105-697F9E

Session writes, id 41a170c84d0bd23d, 3415 bytes to 3218 bytes.

| Path | A | B |
|---|---|---|
| $.incident | (same keys) | (in another order) |
| $.incident.status | In progress | Resolved |
| $.incident.open | 1 | 0 |
| $.incident.closed_at | null | 2026-11-06 12:00:00 |
| $.incident.why.attention.length | 2 | 0 |
| $.incident.why.attention[0] | Still open at more than twice its 6-hour deadline | (absent) |
| $.incident.why.attention[1] | Keeps happening: 9 similar incidents here in 90 days | (absent) |
| $.incident.why.needsYou | true | false |
| $.incident.why.why.length | 2 | 0 |
| $.incident.why.why[0] | Still open at more than twice its 6-hour deadline | (absent) |
| $.incident.why.why[1] | Keeps happening: 9 similar incidents here in 90 days | (absent) |

### collector GET /api/collector/incidents/INC-20261105-697F9E

Session writes, id 312d7e3e75cbc3a0, 3536 bytes to 3536 bytes.

| Path | A | B |
|---|---|---|
| $.incident | (same keys) | (in another order) |

### collector GET /api/collector/list

Session writes, id 5fe0b0ed335c49e4, 15908 bytes to 16484 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-09 18:08:00 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-16 18:05:00 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-12-06 18:00:00 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-11 17:59:00 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-13 17:54:00 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-09 17:42:06 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-07 17:31:39 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 17:16:00 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/list?status=verified&period=quarterly

Session writes, id 50228dd8087cb116, 14597 bytes to 15173 bytes.

| Path | A | B |
|---|---|---|
| $.rows[0].sla_due | (absent) | 2026-11-06 23:38:39 |
| $.rows[0].overdue | (absent) | false |
| $.rows[1].sla_due | (absent) | 2026-11-06 23:34:59 |
| $.rows[1].overdue | (absent) | false |
| $.rows[2].sla_due | (absent) | 2026-11-07 17:22:24 |
| $.rows[2].overdue | (absent) | false |
| $.rows[3].sla_due | (absent) | 2026-11-07 16:03:03 |
| $.rows[3].overdue | (absent) | false |
| $.rows[4].sla_due | (absent) | 2026-11-09 15:59:35 |
| $.rows[4].overdue | (absent) | false |
| $.rows[5].sla_due | (absent) | 2026-11-06 21:54:11 |
| $.rows[5].overdue | (absent) | false |
| $.rows[6].sla_due | (absent) | 2026-11-07 15:27:22 |
| $.rows[6].overdue | (absent) | false |
| $.rows[7].sla_due | (absent) | 2026-11-06 20:33:29 |
| $.rows[7].overdue | (absent) | false |
| $.rows[8].sla_due | (absent) | 2026-11-09 14:11:04 |
| $.rows[8].overdue | (absent) | false |
| $.rows[9].sla_due | (absent) | 2026-11-06 19:53:54 |
| $.rows[9].overdue | (absent) | false |
| $.rows[10].sla_due | (absent) | 2026-11-06 19:52:30 |
| $.rows[10].overdue | (absent) | false |
| $.rows[11].sla_due | (absent) | 2026-11-09 13:50:31 |
| $.rows[11].overdue | (absent) | false |

### collector GET /api/collector/overview

Session writes, id ea0ab3f25bc17c26, 230470 bytes to 232574 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 3 | 175 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 9 | 155 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 0 | 15 |
| $.kpi.series.resolved[1] | 2 | 15 |
| $.kpi.series.resolved[2] | 1 | 16 |
| $.kpi.series.resolved[3] | 0 | 19 |
| $.kpi.series.resolved[4] | 0 | 15 |
| $.kpi.series.resolved[5] | 0 | 11 |
| $.kpi.series.resolved[6] | 0 | 15 |
| $.kpi.series.resolved[7] | 0 | 18 |
| $.kpi.series.resolved[8] | 0 | 13 |
| $.kpi.series.resolved[9] | 0 | 16 |
| $.kpi.series.resolved[10] | 0 | 10 |
| $.kpi.series.resolved[11] | 0 | 12 |
| $.snapshot.overdue | 11 | 22 |
| $.news[0].sla_due | (absent) | 2026-11-06 23:18:50 |
| $.news[1].sla_due | (absent) | 2026-11-13 16:43:38 |
| $.news[2].sla_due | (absent) | 2026-11-07 15:18:31 |
| $.news[3].sla_due | (absent) | 2026-11-06 12:42:54 |
| $.news[4].sla_due | (absent) | 2026-11-06 15:47:24 |
| $.news[5].sla_due | (absent) | 2026-11-07 09:07:25 |
| $.news[6].sla_due | (absent) | 2026-11-09 06:47:38 |

...and 61 more paths (see the JSON file).

### collector GET /api/collector/overview?period=weekly&zone=13

Session writes, id 3f54c3ecc14de285, 138770 bytes to 140289 bytes.

| Path | A | B |
|---|---|---|
| $.kpi.cur | (same keys) | (in another order) |
| $.kpi.cur.resolved | 21 | 114 |
| $.kpi.prev | (same keys) | (in another order) |
| $.kpi.prev.resolved | 67 | 99 |
| $.kpi.series | (same keys) | (in another order) |
| $.kpi.series.resolved[0] | 7 | 20 |
| $.kpi.series.resolved[1] | 3 | 19 |
| $.kpi.series.resolved[2] | 5 | 12 |
| $.kpi.series.resolved[3] | 0 | 21 |
| $.kpi.series.resolved[4] | 2 | 10 |
| $.kpi.series.resolved[5] | 3 | 9 |
| $.kpi.series.resolved[6] | 1 | 23 |
| $.snapshot.overdue | 26 | 42 |
| $.news[0].sla_due | (absent) | 2026-11-05 03:18:42 |
| $.severity.rows[0].sla_due | (absent) | 2026-11-06 05:41:50 |
| $.severity.rows[1].sla_due | (absent) | 2026-11-05 22:12:45 |
| $.severity.rows[2].why.attention.length | 2 | 3 |
| $.severity.rows[2].why.attention[1] | Keeps happening: 9 similar incidents here in 90 days | Past its deadline |
| $.severity.rows[2].why.attention[2] | (absent) | Keeps happening: 9 similar incidents here in 90 days |
| $.severity.rows[2].why.why.length | 2 | 3 |
| $.severity.rows[2].why.why[1] | Keeps happening: 9 similar incidents here in 90 days | Past its deadline |
| $.severity.rows[2].why.why[2] | (absent) | Keeps happening: 9 similar incidents here in 90 days |
| $.severity.rows[2].sla_due | (absent) | 2026-11-01 19:56:45 |
| $.severity.rows[3].sla_due | (absent) | 2026-11-04 08:49:19 |
| $.severity.rows[4].sla_due | (absent) | 2026-11-01 23:59:47 |

...and 40 more paths (see the JSON file).

### collector GET /api/collector/incidents/INC-20261106-0B725B

Session writes, id 5d702f323c8812fc, 3837 bytes to 3837 bytes.

| Path | A | B |
|---|---|---|
| $.incident | (same keys) | (in another order) |

### collector GET /api/collector/incidents/INC-20261106-707839

Session writes, id 2f4592c4f4b13db0, 4202 bytes to 4219 bytes.

| Path | A | B |
|---|---|---|
| $.incident | (same keys) | (in another order) |
| $.incident.closed_at | null | 2026-11-06 12:00:00 |

### officerA GET /api/officer/overview?meta=1

Session writes, id 8b504339618befd5, 149 bytes to 132 bytes.

| Path | A | B |
|---|---|---|
| $.lastDecision | 2026-11-06 12:00:00 | null |

### officerA GET /api/officer/overview

Session writes, id aa11adf02a83df15, 154799 bytes to 156124 bytes.

| Path | A | B |
|---|---|---|
| $.feedback.length | 1 | 0 |
| $.feedback[0] | {object with 10 keys} | (absent) |
| $.feeds[0].kind | (absent) | departmental app export (synthetic history + live filings) |
| $.feeds[1].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[2].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[3].kind | (absent) | departmental dataset (synthetic generator) |
| $.feeds[4].kind | (absent) | live collector (RSS, sitemaps, Google News) |
| $.feeds[5].kind | (absent) | live collector |
| $.feeds[6].kind | (absent) | live collector |
| $.feeds[7].kind | (absent) | live collector |
| $.board.kpi.cur | (same keys) | (in another order) |
| $.board.kpi.cur.resolved | 462 | 568 |
| $.board.kpi.prev | (same keys) | (in another order) |
| $.board.kpi.prev.resolved | 541 | 535 |
| $.board.kpi.series | (same keys) | (in another order) |
| $.board.kpi.series.resolved[0] | 19 | 22 |
| $.board.kpi.series.resolved[1] | 23 | 18 |
| $.board.kpi.series.resolved[2] | 16 | 20 |
| $.board.kpi.series.resolved[3] | 11 | 24 |
| $.board.kpi.series.resolved[4] | 15 | 19 |
| $.board.kpi.series.resolved[5] | 17 | 19 |
| $.board.kpi.series.resolved[6] | 14 | 17 |
| $.board.kpi.series.resolved[7] | 13 | 14 |
| $.board.kpi.series.resolved[8] | 17 | 21 |
| $.board.kpi.series.resolved[9] | 19 | 11 |

...and 61 more paths (see the JSON file).

