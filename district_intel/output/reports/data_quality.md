# Data quality report
_As of 04 Oct 2026 10:57 IST_

## Source health
| Source | Status | Last success | Newest record | Rows | Detail |
|---|---|---|---|---|---|
| imd | degraded | 2026-10-04 11:01:00+05:30 | 2026-10-04 08:30:00+05:30 | 251 | Unavailable endpoints (not bypassed): IMD_CITY_TEST_PAGE: http_403; IMD_RMC_CHENNAI_HOME: no_observation_time; IMD_AWS_ARG: access_restricted; IMD_WARNINGS_API: |
| cpcb | stale | 2026-10-02 18:04:47+05:30 | 2026-10-02 17:00:00+05:30 | 59 | data.gov.in CPCB real-time air quality (3b01bcb8): no-api-key; CPCB CCR live city map: playwright-error (stale); CPCB CCR historical (advance search / repositor |
| cfm | stale | 2026-10-02 18:08:32+05:30 | 2026-10-02 06:00:00+05:30 | 204 | 24 gauge readings marked suspect (stage inversion or datum); current gauge feed returned 0 rows |
| news | ok | 2026-10-04 11:00:58.239929199+05:30 | 2026-10-04 10:39:39+05:30 | 22817 | State: last_run_at=2026-10-04T10:53:53+05:30, last_mode=daily, last_run_items=1697, backfill_completed=True |
| grievance | ok | 2026-10-04 11:03:54.320048094+05:30 | 2026-10-04 10:57:00+05:30 | 16093 |  |
| police | ok | 2026-10-04 11:04:03.698369741+05:30 | 2026-10-04 10:03:57+05:30 | 12259 |  |
| pwd | ok | 2026-10-04 11:03:51.482222319+05:30 | 2026-10-04 09:59:42+05:30 | 2146 |  |
| hospital | stale | 2026-10-04 00:10:02.443627119+05:30 | 2026-10-04 00:00:00+05:30 | 86 |  |

## Data contract
| Table | Check | Severity | Failing | Total | Action |
|---|---|---|---|---|---|
| events | event_id unique | hard | 0 | 31915 | keep first; fix loader |
| events | reported_at present | hard | 0 | 31915 | quarantine |
| events | category in master | hard | 0 | 31915 | propose crosswalk entry |
| events | lead department in master | soft | 0 | 31915 | propose department mapping |
| events | reported not before occurred (15 min) | soft | 2 | 31915 | flag |
| events | closed not before reported | hard | 0 | 31915 | quarantine |
| events | not in the future | hard | 3 | 31915 | quarantine |
| events | has a location | soft | 0 | 31915 | geo review queue |
| events | inside the district | soft | 177 | 31915 | flag out of district |
| events | taluk resolved | soft | 2 | 31915 | flag |
| events | geo confidence >= 0.7 | soft | 434 | 31915 | geo review queue |
| events | text usable | soft | 219 | 31915 | hide from briefings |
| events | provenance snapshot present | soft | 0 | 31915 | flag |
| events | cross-reference resolves | soft | 1181 | 31915 | kept as external reference; links come from matching |
| events | Closed status has a close time | soft | 0 | 31915 | flag |
| observations | plausible reading | soft | 24 | 29674 | keep value, never alert on it |
| observations | value present | hard | 0 | 29674 | quarantine |
| actions | lifecycle in order | hard | 0 | 5057 | quarantine |
| pwd_works | spend within 1.25 x sanction | soft | 0 | 242 | flag cost overrun |
| pwd_works | completed at 100% | soft | 0 | 242 | flag |

Quarantined rows: 3

## Category drift (7 days vs previous 28)
- grievance: PSI 0.083 (low); STREETLIGHT_ELECTRICAL 14.7%→11.2%; DRAINAGE_SEWAGE 8.6%→5.7%; DRAIN_WORKS_SAFETY 5.4%→3.3%
- hospital: PSI 0.421 (high); HEALTH_SERVICES 65.2%→33.3%; VECTOR_DISEASE 34.8%→66.7%
- news: PSI 1.231 (high); PUBLIC_ORDER 27.9%→14.0%; VECTOR_DISEASE 22.1%→11.3%; CRIMES_AGAINST_WOMEN 12.3%→4.3%
- police: PSI 0.099 (low); TRAFFIC_OBSTRUCTION 11.1%→6.5%; PUBLIC_ORDER 13.7%→17.3%; ROAD_ACCIDENT 19.0%→22.6%
- pwd: PSI 0.148 (moderate); FLOOD_WATERLOGGING 29.0%→41.9%; DRAINAGE_SEWAGE 24.9%→14.0%; ROAD_DAMAGE 5.7%→3.2%

Crosswalk proposals awaiting review: 23