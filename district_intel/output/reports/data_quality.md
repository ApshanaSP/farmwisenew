# Data quality report
_As of 02 Oct 2026 12:32 IST_

## Source health
| Source | Status | Last success | Newest record | Rows | Detail |
|---|---|---|---|---|---|
| imd | degraded | 2026-10-02 12:31:40+05:30 | 2026-10-02 08:30:00+05:30 | 203 | Unavailable endpoints (not bypassed): IMD_CITY_TEST_PAGE: http_403; IMD_RMC_CHENNAI_HOME: no_observation_time; IMD_AWS_ARG: access_restricted; IMD_WARNINGS_API: |
| cpcb | degraded | 2026-10-02 12:38:14+05:30 | 2026-10-02 12:00:00+05:30 | 55 | data.gov.in CPCB real-time air quality (3b01bcb8): no-api-key; CPCB CCR live city map: 200; CPCB CCR historical (advance search / repository): captcha-gated; ap |
| cfm | ok | 2026-10-02 12:43:26+05:30 | 2026-10-02 06:00:00+05:30 | 208 | 24 gauge readings marked suspect (stage inversion or datum); current gauge feed returned 14 rows |
| news | ok | 2026-10-02 12:31:37.638570309+05:30 | 2026-10-02 10:26:39+05:30 | 21416 | State: last_run_at=2026-10-02T12:23:39+05:30, last_mode=daily, last_run_items=1853, backfill_completed=True |
| grievance | ok | 2026-10-02 15:36:59.992372990+05:30 | 2026-10-02 12:32:00+05:30 | 16201 |  |
| police | ok | 2026-10-02 12:44:19.243196487+05:30 | 2026-10-02 12:26:00+05:30 | 12268 |  |
| pwd | ok | 2026-10-02 12:43:53.825512886+05:30 | 2026-10-02 11:32:35+05:30 | 2142 |  |
| hospital | ok | 2026-10-02 12:43:52.611550808+05:30 | 2026-10-02 00:00:00+05:30 | 83 |  |

## Data contract
| Table | Check | Severity | Failing | Total | Action |
|---|---|---|---|---|---|
| events | event_id unique | hard | 0 | 32386 | keep first; fix loader |
| events | reported_at present | hard | 0 | 32386 | quarantine |
| events | category in master | hard | 0 | 32386 | propose crosswalk entry |
| events | lead department in master | soft | 0 | 32386 | propose department mapping |
| events | reported not before occurred (15 min) | soft | 0 | 32386 | flag |
| events | closed not before reported | hard | 0 | 32386 | quarantine |
| events | not in the future | hard | 0 | 32386 | quarantine |
| events | has a location | soft | 0 | 32386 | geo review queue |
| events | inside the district | soft | 181 | 32386 | flag out of district |
| events | taluk resolved | soft | 3 | 32386 | flag |
| events | geo confidence >= 0.7 | soft | 734 | 32386 | geo review queue |
| events | text usable | soft | 223 | 32386 | hide from briefings |
| events | provenance snapshot present | soft | 0 | 32386 | flag |
| events | cross-reference resolves | soft | 1184 | 32386 | kept as external reference; links come from matching |
| events | Closed status has a close time | soft | 0 | 32386 | flag |
| observations | plausible reading | soft | 24 | 29626 | keep value, never alert on it |
| observations | value present | hard | 0 | 29626 | quarantine |
| actions | lifecycle in order | hard | 0 | 4412 | quarantine |
| pwd_works | spend within 1.25 x sanction | soft | 0 | 236 | flag cost overrun |
| pwd_works | completed at 100% | soft | 0 | 236 | flag |

Quarantined rows: 0

## Category drift (7 days vs previous 28)
- grievance: PSI 0.105 (moderate); SOLID_WASTE 21.9%→26.1%; DRAIN_WORKS_SAFETY 6.3%→2.6%; DRAINAGE_SEWAGE 8.5%→5.5%
- hospital: PSI 0.078 (low); HEALTH_SERVICES 58.3%→44.5%; VECTOR_DISEASE 41.7%→55.6%
- news: PSI 0.558 (high); ROAD_ACCIDENT 13.1%→2.1%; ROAD_DAMAGE 1.8%→10.4%; STRAY_ANIMALS 2.1%→5.7%
- police: PSI 0.109 (moderate); TRAFFIC_OBSTRUCTION 11.2%→7.2%; PUBLIC_ORDER 13.5%→17.5%; FLOOD_WATERLOGGING 4.1%→1.1%
- pwd: PSI 0.133 (moderate); DRAINAGE_SEWAGE 24.9%→14.1%; FLOOD_WATERLOGGING 29.1%→37.2%; ENCROACHMENT 10.9%→16.7%

Crosswalk proposals awaiting review: 23