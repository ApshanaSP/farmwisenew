# Data quality report
_As of 04 Oct 2026 11:31 IST_

## Source health
| Source | Status | Last success | Newest record | Rows | Detail |
|---|---|---|---|---|---|
| imd | degraded | 2026-10-04 11:25:08+05:30 | 2026-10-04 08:30:00+05:30 | 250 | Unavailable endpoints (not bypassed): IMD_CITY_TEST_PAGE: http_403; IMD_RMC_CHENNAI_HOME: no_observation_time; IMD_AWS_ARG: access_restricted; IMD_WARNINGS_API: |
| cpcb | degraded | 2026-10-04 11:27:40+05:30 | 2026-10-04 11:00:00+05:30 | 118 | data.gov.in CPCB real-time air quality (3b01bcb8): no-api-key; CPCB CCR live city map: 200; CPCB CCR historical (advance search / repository): captcha-gated; ap |
| cfm | ok | 2026-10-04 11:32:57+05:30 | 2026-10-04 06:00:00+05:30 | 220 | 24 gauge readings marked suspect (stage inversion or datum); current gauge feed returned 14 rows |
| news | ok | 2026-10-04 11:25:04.350211382+05:30 | 2026-10-04 09:10:09+05:30 | 22804 | State: last_run_at=2026-10-04T11:17:02+05:30, last_mode=daily, last_run_items=1703, backfill_completed=True |
| grievance | ok | 2026-10-04 11:33:26.614738464+05:30 | 2026-10-04 11:28:00+05:30 | 16285 |  |
| police | ok | 2026-10-04 11:33:48.163769484+05:30 | 2026-10-04 11:30:06+05:30 | 12263 |  |
| pwd | ok | 2026-10-04 11:33:19.928975582+05:30 | 2026-10-04 09:59:42+05:30 | 2144 |  |
| hospital | stale | 2026-10-04 00:12:28.286772490+05:30 | 2026-10-04 00:00:00+05:30 | 86 |  |

## Data contract
| Table | Check | Severity | Failing | Total | Action |
|---|---|---|---|---|---|
| events | event_id unique | hard | 0 | 32503 | keep first; fix loader |
| events | reported_at present | hard | 0 | 32503 | quarantine |
| events | category in master | hard | 0 | 32503 | propose crosswalk entry |
| events | lead department in master | soft | 0 | 32503 | propose department mapping |
| events | reported not before occurred (15 min) | soft | 2 | 32503 | flag |
| events | closed not before reported | hard | 0 | 32503 | quarantine |
| events | not in the future | hard | 0 | 32503 | quarantine |
| events | has a location | soft | 0 | 32503 | geo review queue |
| events | inside the district | soft | 178 | 32503 | flag out of district |
| events | taluk resolved | soft | 3 | 32503 | flag |
| events | geo confidence >= 0.7 | soft | 716 | 32503 | geo review queue |
| events | text usable | soft | 225 | 32503 | hide from briefings |
| events | provenance snapshot present | soft | 0 | 32503 | flag |
| events | cross-reference resolves | soft | 1181 | 32503 | kept as external reference; links come from matching |
| events | Closed status has a close time | soft | 0 | 32503 | flag |
| observations | plausible reading | soft | 24 | 29748 | keep value, never alert on it |
| observations | value present | hard | 0 | 29748 | quarantine |
| actions | lifecycle in order | hard | 0 | 4592 | quarantine |
| pwd_works | spend within 1.25 x sanction | soft | 0 | 242 | flag cost overrun |
| pwd_works | completed at 100% | soft | 0 | 242 | flag |

Quarantined rows: 0

## Category drift (7 days vs previous 28)
- grievance: PSI 0.07 (low); SOLID_WASTE 20.6%→23.8%; DRAINAGE_SEWAGE 7.7%→5.4%; DRAIN_WORKS_SAFETY 6.1%→3.8%
- hospital: PSI 0.421 (high); HEALTH_SERVICES 65.2%→33.3%; VECTOR_DISEASE 34.8%→66.7%
- news: PSI 0.403 (high); ROAD_ACCIDENT 12.9%→3.5%; ROAD_DAMAGE 2.1%→9.4%; STRAY_ANIMALS 2.4%→5.5%
- police: PSI 0.069 (low); TRAFFIC_OBSTRUCTION 11.1%→6.4%; ROAD_ACCIDENT 19.0%→22.6%; PUBLIC_ORDER 13.8%→17.2%
- pwd: PSI 0.148 (moderate); FLOOD_WATERLOGGING 29.0%→41.9%; DRAINAGE_SEWAGE 24.9%→14.0%; ROAD_DAMAGE 5.7%→3.2%

Crosswalk proposals awaiting review: 23