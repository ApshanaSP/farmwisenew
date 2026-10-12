# Data quality report
_As of 04 Oct 2026 16:23 IST_

## Source health
| Source | Status | Last success | Newest record | Rows | Detail |
|---|---|---|---|---|---|
| imd | stale | 2026-10-04 11:25:08+05:30 | 2026-10-04 08:30:00+05:30 | 250 | Unavailable endpoints (not bypassed): IMD_CITY_TEST_PAGE: http_403; IMD_RMC_CHENNAI_HOME: no_observation_time; IMD_AWS_ARG: access_restricted; IMD_WARNINGS_API: |
| cpcb | stale | 2026-10-04 22:41:21+05:30 | 2026-10-04 22:00:00+05:30 | 174 | data.gov.in CPCB real-time air quality (3b01bcb8): no-api-key; CPCB CCR live city map: playwright-error (stale); CPCB CCR historical (advance search / repositor |
| cfm | stale | 2026-10-04 11:32:57+05:30 | 2026-10-04 06:00:00+05:30 | 220 | 24 gauge readings marked suspect (stage inversion or datum); current gauge feed returned 14 rows |
| news | stale | 2026-10-06 18:50:54.590293169+05:30 | 2026-10-04 10:43:00+05:30 | 22804 | State: last_run_at=2026-10-04T11:17:02+05:30, last_mode=daily, last_run_items=1703, backfill_completed=True |
| grievance | stale | 2026-10-04 16:41:23.812823296+05:30 | 2026-10-04 16:23:00+05:30 | 16113 |  |
| police | stale | 2026-10-06 18:50:57.445683241+05:30 | 2026-10-04 11:30:06+05:30 | 12263 |  |
| pwd | stale | 2026-10-06 18:50:57.445683241+05:30 | 2026-10-04 09:59:42+05:30 | 2144 |  |
| hospital | stale | 2026-10-04 11:33:18.697921276+05:30 | 2026-10-04 00:00:00+05:30 | 86 |  |

## Data contract
| Table | Check | Severity | Failing | Total | Action |
|---|---|---|---|---|---|
| events | event_id unique | hard | 0 | 31954 | keep first; fix loader |
| events | reported_at present | hard | 0 | 31954 | quarantine |
| events | category in master | hard | 0 | 31954 | propose crosswalk entry |
| events | lead department in master | soft | 0 | 31954 | propose department mapping |
| events | reported not before occurred (15 min) | soft | 2 | 31954 | flag |
| events | closed not before reported | hard | 0 | 31954 | quarantine |
| events | not in the future | hard | 0 | 31954 | quarantine |
| events | has a location | soft | 0 | 31954 | geo review queue |
| events | inside the district | soft | 176 | 31954 | flag out of district |
| events | taluk resolved | soft | 2 | 31954 | flag |
| events | geo confidence >= 0.7 | soft | 576 | 31954 | geo review queue |
| events | text usable | soft | 219 | 31954 | hide from briefings |
| events | provenance snapshot present | soft | 0 | 31954 | flag |
| events | cross-reference resolves | soft | 1181 | 31954 | kept as external reference; links come from matching |
| events | Closed status has a close time | soft | 0 | 31954 | flag |
| observations | plausible reading | soft | 24 | 29804 | keep value, never alert on it |
| observations | value present | hard | 0 | 29804 | quarantine |
| actions | lifecycle in order | hard | 0 | 5017 | quarantine |
| pwd_works | spend within 1.25 x sanction | soft | 0 | 242 | flag cost overrun |
| pwd_works | completed at 100% | soft | 0 | 242 | flag |

Quarantined rows: 0

## Category drift (7 days vs previous 28)
- grievance: PSI 0.074 (low); DRAINAGE_SEWAGE 8.5%→5.8%; STREETLIGHT_ELECTRICAL 14.6%→12.0%; DRAIN_WORKS_SAFETY 5.4%→3.3%
- hospital: PSI 0.421 (high); HEALTH_SERVICES 65.2%→33.3%; VECTOR_DISEASE 34.8%→66.7%
- news: PSI 1.145 (high); PUBLIC_ORDER 27.6%→13.9%; VECTOR_DISEASE 21.8%→12.8%; CRIMES_AGAINST_WOMEN 10.9%→4.4%
- police: PSI 0.097 (low); TRAFFIC_OBSTRUCTION 11.1%→6.4%; ROAD_ACCIDENT 19.0%→22.7%; PUBLIC_ORDER 13.8%→17.1%
- pwd: PSI 0.146 (moderate); FLOOD_WATERLOGGING 29.1%→41.9%; DRAINAGE_SEWAGE 24.7%→14.0%; ROAD_DAMAGE 5.7%→3.2%

Crosswalk proposals awaiting review: 23