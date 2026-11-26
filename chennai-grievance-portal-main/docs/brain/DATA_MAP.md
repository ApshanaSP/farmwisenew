# District IQ data map (for the new assistant)

Checked 26 Nov 2026, 01:00-01:20 IST, by opening the real files. Counts come from `data/aws-cache/*.json.gz` (build as of 26 Nov 00:12, downloaded 00:29) and `data/aws-cache/durable.sqlite`. Code paths are under `chennai-grievance-portal-main/` unless they start with another folder of `D:\farmwisenew`. Personal values are masked here ("(hidden)", "(locked)", "(account email)").

Contents: 0 Read this first · 1 The store (how it works, every table) · 2 Derived objects · 3 Live and scraped lanes · 4 Files on the PC only · 5 Contacts · 6 Newspaper times and "more than one newspaper" · 7 Workspaces, briefings, actions, audit, feedback · 8 Never read (secrets, personal) · 9 Gaps · 10 Traps found while checking

---

## 0. Read this first

| Question | Where the answer is |
|---|---|
| Cases, complaints, police, PWD, news-only | `incidents` with the effective status laid on (`effectiveSql`, `OPEN_NOW`), never the raw `is_open` |
| Hospital beds now | `observation_signals` (latest) or `observations` (180 days): `metric IN ('bed_occupancy_pct','occupied_beds','total_beds')`, 9 hospitals, GENERATED data |
| Which newspaper, when | `documents` (`publisher`, `published_at`, `story_id`), joined by `linked_incident_id` |
| More than one newspaper | `COUNT(DISTINCT publisher)` over `documents`, NOT `incidents.outlet_count` / `gaps.outlet_count` (they count articles) |
| In the papers, not in the registers | `incidents.media_only = 1` (935 in 180 days, 89 still open) or `gaps` (71, last 14 days, police left out) |
| Contacts | `official_contacts` (48, real GCC), `ref_offices` (21 PWD, generated), `ref_departments` (posts and route) |
| Traffic now / past | `trafficNow()` in `lib/city/traffic.ts`; `traffic_snaps`, `traffic_days` (kept since 24 Nov 22:26) |
| Reservoirs | `cmwssbLakes()`; also laid into `observations` as source `cmwssb` |
| Rain, floods, power, trains | `cityNow()`, `rehearsalState()`, `impacts(lens)` |
| Vegetable prices | `mandi_*` tables: STALE since 6 Oct / 26 Oct 2026 |
| The Collector's uploads | `lib/studio/store.ts` (2 datasets on disk) |

---

## 1. The store

### 1.1 How it is loaded

`DATA_BACKEND=aws`, so no MySQL server. `src/lib/aws/store.ts`:

| Part | What | Where it lives | Function |
|---|---|---|---|
| The build ("intel") | 32 tables + 6 views made by the pipeline on GitHub every hour | S3 -> `data/aws-cache/<table>-<sha256>.json.gz` -> one **in-memory SQLite** database (`node:sqlite`, `:memory:`) | `manifest()` POST /intel/snapshot, `download`, `buildDb`, `current()` |
| The durable store | The website's own tables + reference tables (48 tables + 2 internal) | DynamoDB + S3 -> `data/aws-cache/durable.sqlite` (WAL), **ATTACHed** to the build as schema `durable` | `fetchDurable`, `durable()` |
| `information_schema` | tables and columns listed for code that asks | attached in-memory | `catalog()` |

- A new build is checked for every 60 s (`CHECK_MS`), loaded into a fresh database and swapped whole (`onBuildSwap` tells listeners). The build hooks (section 2.1) run on it first.
- Writes to durable tables are noted by triggers in `_changes` and sent to DynamoDB (`flush`), only on the PC with `AWS_STORE_SAVE=1` (this PC). Other copies reload every 5 min.
- A second process on this PC must set `AWS_DURABLE_FILE` (or gets `durable-p<pid>.sqlite`).
- Text columns are `COLLATE NOCASE`: `=` and `ORDER BY` ignore case.
- Every time value is an **IST wall-clock string** `YYYY-MM-DD HH:MM:SS`. "Now" is `asOf()` in `lib/collector/intel.ts` (the wall clock, or the build's as_of if later), never `new Date()`.

### 1.2 Who runs SQL

| Pool | File | Use |
|---|---|---|
| `intelPool` (default export) | `src/lib/collector/db.ts` | the intel build and ops tables. `ops("workspaces")` gives the qualified ops name, `TITLE` the display title, `CLUSTER` the group id |
| `pool` (default export), `withTransaction` | `src/lib/db.ts` | portal tables (users, complaints, petitions …) |

Both are `awsPool()` over the SAME SQLite store: every table is reachable from either, unqualified. `pool.query(sql, params)` -> `run()` -> `expand()` (mysql2 placeholders: `IN (?)`, `??`, `SET ?`) -> `translate()` -> `db.prepare`.

**Dialect: write MySQL (or plain SQLite).** `lib/aws/dialect.ts` rewrites: `` `db`.`t` `` -> `t`; `x - INTERVAL n DAY`, `DATE_ADD/DATE_SUB` -> `dt_add`; `a / b` -> real division; `IF(` -> `iif(`; `CAST AS SIGNED/DECIMAL/CHAR`; `GROUP_CONCAT(x SEPARATOR 's')`; `INSERT IGNORE`, `ON DUPLICATE KEY UPDATE`. Functions added: NOW, CURDATE, DATE_FORMAT, DATE, TIMESTAMPDIFF, DATEDIFF, HOUR, DAYNAME, MONTHNAME, WEEKDAY, YEARWEEK, QUARTER, FIELD, GREATEST, LEAST, JSON_UNQUOTE, JSON_LENGTH, SUBSTRING_INDEX, LOCATE, FIND_IN_SET, LEFT, RIGHT, LPAD, ANY_VALUE, HAS_WORD. Window functions and CTEs work (SQLite). No REGEXP, no stored procedures, no DATE arithmetic with `+ 1`.

### 1.3 Read-only: what protects it

- On AWS, `START TRANSACTION READ ONLY` is a **no-op** (`NOOP` in store.ts). `assistant/compile.ts readOnly()` therefore relies on its own `^SELECT` check only. An INSERT or UPDATE sent through a pool reaches DynamoDB.
- `run()` **decrypts** locked personal columns on every read through a pool (`decryptRow`). A read straight on the `node:sqlite` handle (`withCurrentBuild((db) => db.prepare(...))`) returns the locked text `enc:v1:…` instead. For an AI, prefer the raw handle.
- **A filter on column names is not enough.** A result column can be renamed without naming it: `WITH x(a, b, c) AS (SELECT * FROM audit_log) SELECT c FROM x`, or `SELECT 1 AS a, 2 AS b, 3 AS c UNION ALL SELECT * FROM complaints` (both checked in SQLite: they return the private column under the new name). Refuse `SELECT *` and `alias.*` over any table that has a private column (section 8), or refuse those tables whole, or run over a view that holds only the allowed columns. Locked columns come back as `enc:v1:` text this way, but the unlocked ones (complaints.description, audit_log.before_value, petitions.subject, outbound_emails.body) come back plain.
- `node:sqlite` in Node 22.14 has no `setAuthorizer`; use one-statement checks plus `PRAGMA query_only`, inside `withCurrentBuild` (it holds the write lock).

### 1.4 The rules behind the console's numbers (reuse these, do not re-invent)

| Rule | Code |
|---|---|
| Effective open/status/verified/closed (Collector decisions, then later officer steps) | `effectiveSql(ops("collector_decisions"))` in `lib/collector/effective.ts` -> `.open .status .verified .closedAt` |
| "Open now" on every tile (effective open, minus news complaints routed to a department) | `OPEN_NOW`, `openNowSql(alias, open)` in `lib/collector/intel.ts` |
| Past its deadline | `pastDueSql(now)` in `lib/reference/metrics.ts` (`sla_breached = 1 OR sla_due_at < now`) |
| Windows: rolling 24 h, 7, 30, 90 days back from now | `PERIODS`, `periodWindow`, `scopeWhere` in intel.ts |
| Resolved = closed as Resolved inside the window, by close time | `kpiBlock`, v18 `closedWhere` |
| Locality | last part of `place_text` before "(" (`LOCALITY` in `thunai/v18/window.ts`) |

### 1.5 Views in the build (from `district_intel/dintel/mysql_export.py` VIEWS)

`v_open_incidents_live`, `v_collector_queue`, `v_zone_summary`, `v_taluk_unresolved`, `v_media_gaps`, `v_department_performance`. They read the pipeline's raw status (no decisions on top) and all 180 days: numbers differ from the console. `_export_meta` (k, v: build_id, built_at, exported_at) is the freshness record.

### 1.6 Build tables (32, read-only, replaced every hour)

Built by `district_intel` on GitHub (`ApshanaSP/farmwisenew-dataload`, started hourly), except CPCB and CFM which this PC collects hourly (`district_intel/scripts/run_intel.bat`, Task Scheduler "DistrictIntel") and pushes. Loaded with `WITHOUT ROWID` primary keys; indexed columns are listed in `mysql_export.py EXTRA_INDEXES` and `store.py INDEXES`.

The build hooks add these columns and tables on this server (not in the files): `incidents.headline`, `incidents.cluster_id`, `incidents.cluster_size`, `incidents.dead_reported`, `incidents.injured_reported`, table `_placed(incident_id, place, how)`, rows `INC-W-…` for website and Manu filings; and they remove news-only incidents that are not news media, not incidents, or merged. So **served counts are a little lower than the counts below** for `incidents`.

#### `incidents` (28,532 rows; first_reported_at 2026-05-30 02:07 to 2026-11-26 00:09)

THE case table: one row per real-world incident, made by merging complaints, police, PWD, hospital, IMD, CPCB and news records. Every console count comes from it.

- Written by: pipeline (incidents.py), then build hooks on this server. Refresh: hourly build.
- Good for questions like: "How many severe incidents in Adyar in the last 2 days?"; "Which ward has the most open garbage cases?"; "Which cases are past their deadline in the police?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `incident_id` | text | all | incident id (INC-YYYYMMDD-XXXXXX; INC-W-<complaint code> for a website or Manu filing) | INC-20260504-08B2A5 |
| `category_code` | text | all | category code (35; ref_categories) | DRAINAGE_SEWAGE |
| `category_label` | text | all | category in words | Drainage & sewage |
| `family` | text | all | category family (15) | DRAINAGE |
| `lead_dept` | text | all | department that handles it (ref_departments.code) | PWD-WRD |
| `depts_involved` | text | all | departments whose records it holds | PWD-WRD |
| `support_depts` | text | 22,130 | other departments that help | CMWSSB |
| `needs_coordination` | bool | all | needs several departments | 0 |
| `first_reported_at` | datetime | all | FIRST REPORTED (every dashboard window uses this) | 2026-05-30 02:07:48 to 2026-11-26 00:09:45 |
| `occurred_at_est` | datetime | all | estimated time it happened | 2026-05-30 02:07:48 to 2026-11-27 00:00:00 |
| `last_update_at` | datetime | all | last change | 2026-05-31 05:07:59 to 2026-11-26 00:11:28 |
| `ward_no` | int | 27,722 | GCC ward 1-200 | 106 (1 to 200) |
| `zone_no` | int | 27,722 | GCC zone 1-15 (null = outside or not placed) | 8 (1 to 15) |
| `zone_name` | text | 27,722 | zone name | Anna Nagar |
| `taluk_code` | text | 27,845 | revenue taluk code TLK-… (ref_taluks) | TLK-AMJ |
| `lat` | float | all | latitude | 13.072368 (12.84268 to 13.2343643) |
| `lon` | float | all | longitude | 80.221909 (80.132 to 80.3308729) |
| `loc_precision_m` | float | all | precision of the point, metres (2,000 or less is drawn as a pin) | 50 (30 to 15000) |
| `place_text` | text | 28,523 | place in words | Anna Nagar (Anna Nagar Macro Drain) |
| `spread_m` | float | all | how far apart its reports are | 0 (0 to 14829) |
| `member_count` | int | all | records merged in | 1 (1 to 24) |
| `sources` | text | all | sources joined with a vertical bar (grievance, police, pwd, hospital, imd, cpcb, news) | pwd |
| `source_count` | int | all | number of sources | 1 (1 to 4) |
| `channels` | text | all | channels | control_room |
| `citizen_complaints` | int | all | citizen complaints in it | 0 (0 to 23) |
| `police_reports` | int | all | police reports in it | 0 (0 to 6) |
| `outlet_count` | int | all | number of news ARTICLES in it (pipeline counts source_record_id), not newspapers; see section 6 | 0 (0 to 24) |
| `has_official_record` | bool | all | a department record exists | 1 |
| `media_only` | bool | all | 1 = ONLY IN THE NEWS, no department record | 0 |
| `is_synthetic_any` | bool | all | holds generated records | 1 |
| `is_overlay_any` | bool | all | holds scenario records | 0 |
| `status_std` | text | all | the PIPELINE's status; the effective status is effectiveSql() | Resolved 24097, In progress 2000, Lapsed 1026, Rejected 645, Open 290, Under review 244, Assigned 124, Awaiting verification 106 |
| `verified` | bool | all | verified | 0 |
| `verified_at` | datetime | 25,336 | when verified | 2026-05-31 01:59:04 to 2026-11-26 00:09:04 |
| `closed_at` | datetime | 24,742 | when closed | 2026-05-31 05:07:59 to 2026-11-26 00:08:00 |
| `is_open` | bool | all | the PIPELINE's open flag; use OPEN_NOW / effectiveSql | 0 |
| `severity_score` | float | all | 0-100 score behind the level | 38 (5 to 100) |
| `severity_level` | text | all | Severe, High, Medium or Low | Low 12809, Medium 10201, High 4506, Severe 1016 |
| `severity_reasons` | text | all | why that severity (rule points) | blocked drain (+25); Partial service disruption (+5); Aff… |
| `dead` | float | all | deaths (counted once) | 0 (0 to 5) |
| `injured` | float | all | injured | 0 (0 to 1654) |
| `persons_affected` | float | 12,120 | people affected | 20 (0 to 5000) |
| `vulnerable` | text | 10,434 | worship, school, hospital … mentioned | worship |
| `weather_related` | bool | all | weather related | 0 |
| `officer` | text | 24,883 | post in charge | Zonal Officer, Anna Nagar |
| `reliability` | float | all | best source reliability | 1 (0.3 to 1) |
| `confidence` | float | all | confidence of match and place | 1 (0.3 to 1) |
| `needs_review` | bool | all | needs a human check | 0 |
| `review_reason` | text | 1,018 | why | low location or link confidence 1010, reports spread over more than 3 km 8 |
| `sla_hours` | float | all | deadline length | 168 (1 to 720) |
| `sla_due_at` | datetime | all | deadline | 2026-05-31 08:02:29 to 2026-12-25 22:58:00 |
| `hours_open` | float | all | hours open at the build | 141.4 (0 to 4311.3) |
| `hours_to_first_action` | float | 25,336 | hours to first action | 30.9 (0 to 910.4) |
| `sla_basis` | text | all | resolution or response | resolution 19843, response 8689 |
| `sla_ratio` | float | all | hours / deadline | 0.84 (0 to 405.78) |
| `sla_breached` | bool | all | past deadline at the build (use pastDueSql for now) | 0 |
| `growth_24h` | int | all | new reports in 24 h | 0 (0 to 7) |
| `recurrence_90d` | int | all | similar ones here in 90 days | 1 (0 to 134) |
| `rain_coupled` | bool | all | rises with rain | 0 |
| `priority_score` | float | all | priority, higher = more urgent | 43 (5 to 143.7) |
| `priority_reasons` | text | all | why it ranks so | Medium drainage & sewage (38); affects worship |
| `awaiting_collector` | bool | all | waits for the Collector's check (pipeline) | 0 |
| `attention_reason` | text | 248 | why it needs attention | Well past its deadline, Needs several departments |
| `attention_flag` | bool | all | flagged | 0 |
| `title` | text | all | pipeline title ("category – place"); show headline instead | Drainage & sewage – Anna Nagar (Anna Nagar Macro Drain) |
| `summary` | text | all | template sentence | 1 report (PWD control room) about drainage & sewage at An… |
| `ai_summary` | text | 11 | AI summary (11 rows) | A wall along the Cooum River at Chetpet gave way during r… |
| `ai_summary_ta` | text | 11 | AI summary, Tamil | 28 அக்டோபர் 2026 அன்று மழை போது செட்ட்பெட்டில் கோம் நதிக்… |
| `ai_attention` | text | 11 | AI reasons, JSON list | ["Worshippers near the wall are at risk of injury.", "The… |
| `ai_next_step` | text | 11 | AI next step | PWD Water Resources should dispatch an inspection team an… |
| `ai_model` | text | 11 | model | openai/gpt-oss-20b 6, openai/gpt-oss-120b 5 |
| `hotspot_id` | text | 3,473 | hotspot it belongs to | HOT-FLOOD_WATERLOGGING-024 |
| `action_total` | int | all | actions planned | 0 (0 to 11) |
| `action_done` | int | all | actions done | 0 (0 to 11) |
| `next_action_due` | datetime | 1,736 | next action due | 2026-06-01 20:25:37 to 2027-01-22 00:00:00 |

#### `events` (35,399 rows; reported_at 2026-05-30 02:07 to 2026-11-26 00:11)

Source records before merging, one row each: citizen complaint, police report, PWD incident, hospital alert episode, IMD warning, news incident, CPCB pollution episode.

- Written by: pipeline loaders. Refresh: hourly build.
- Good for questions like: "How many complaints came through the citizen app yesterday?"; "Average police response minutes this month?"; "How many complaints were rejected as duplicates?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `event_id` | text | all | source record id (GRV-…, POL-…, PWD-INC-…, HSP-…, NEWS-…, IMDW-…, CPCB-…) | GRV-2026-975DNZ |
| `source` | text | all | grievance, police, pwd, news, imd, hospital, cpcb | grievance 17105, police 13040, pwd 3205, news 1601, imd 178, hospital 161, cpcb 109 |
| `source_record_id` | text | all | id in the source (the complaint number for a grievance) | 2026-975DNZ |
| `deep_link` | text | 18,034 | citizen tracking link (localhost) | http://localhost:3000/citizen/track-complaints?code=2026-… |
| `snapshot_sha256` | text | 32,750 | hash of the source file | 4c70c3d84fad4aeb185430f540b77919a… 16255, cde7c1b26df3eb580154e467b2681af36… 12342, aa67f7e9292385a0d8655a1f2ae523a9e… 2405, d64d6e0a12364f5d57011bd40c7d8f157… 1601, f8a370626b27cfe590c0ed46d7414acae… 147 |
| `is_synthetic` | bool | all | 1 = generated (test) data | 1 |
| `is_overlay` | bool | all | 1 = added by the scenario overlay | 0 |
| `occurred_at` | datetime | all | when it happened | 2026-05-30 02:07:48 to 2026-11-27 00:00:00 |
| `reported_at` | datetime | all | when reported (for news: the published time) | 2026-05-30 02:07:48 to 2026-11-26 00:11:28 |
| `closed_at` | datetime | 30,584 | when closed | 2026-05-31 05:07:59 to 2026-11-26 00:08:00 |
| `time_precision` | text | all | how exact the time is | filed_time 17105, exact 16245, published 1601, day 339, hour 109 |
| `issue_age_claimed_days` | float | 3,258 | days the citizen says it has lasted | 8 (2 to 90) |
| `title` | text | all | title | Removal of Garbage, Pallavan Road, Ward 114 |
| `text` | text | all | the record's own words (a citizen's complaint text: UNTRUSTED, may hold names; 8 rows hold a phone number) | (hidden) |
| `lang` | text | 35,290 | language | en 26788, ta 5607, tanglish 2893, other 2 |
| `junk_flag` | float | 35,290 | 1 = junk | 0 (0 to 1) |
| `simhash` | text | 34,951 | text hash | 85cf6ca682fab39f |
| `category_src` | text | 35,390 | category in the source | Garbage |
| `subcategory_src` | text | 17,096 | sub-category in the source | Removal of Garbage |
| `category_code` | text | all | category code (35; ref_categories) | SOLID_WASTE |
| `category_family` | text | all | family | WASTE_SANITATION |
| `category_conf` | float | all | confidence | 1 (0.064 to 1) |
| `category_method` | text | all | how it was categorised | crosswalk:type |
| `dept_src` | text | 35,165 | department in the source | Solid Waste Management Department |
| `lead_dept` | text | all | department that handles it (ref_departments.code) | GCC-SWM |
| `support_depts` | text | 27,485 | other departments | GCC-HLT |
| `is_actionable` | bool | all | needs action | 1 |
| `lat` | float | all | latitude | 13.0600682 (12.84268 to 13.2343643) |
| `lon` | float | all | longitude | 80.2742646 (80.132 to 80.33196357996088) |
| `loc_precision_m` | float | all | how precise the point is, metres | 30 (30 to 15000) |
| `place_text` | text | 35,390 | place in words | Pallavan Road, Pallavan Nagar, Chepauk |
| `ward_no` | int | 34,325 | GCC ward 1-200 | 114 (1 to 200) |
| `zone_no` | int | 34,325 | GCC zone 1-15 (null = outside or not placed) | 9 (1 to 15) |
| `taluk_code` | text | 34,475 | revenue taluk code TLK-… (ref_taluks) | TLK-MYL |
| `taluk_src` | text | 14,894 | taluk in the source | TLK-AYN |
| `geo_level` | text | all | point, ward, locality, taluk, zone, district | point 31317, ward 2303, district 923, locality 528, taluk 231, zone 97 |
| `geo_method` | text | all | how it was placed | pin |
| `geo_conf` | float | all | confidence of the place | 1 (0.3 to 1) |
| `in_district` | bool | all | 1 = inside Chennai | 1 |
| `dead` | float | 17,721 | deaths | 0 (0 to 5) |
| `injured` | float | 17,721 | injured | 0 (0 to 1654) |
| `persons_affected` | float | 16,267 | people affected | 2 (0 to 5000) |
| `affected_imputed` | float | 15,422 | 1 = that number is imputed | 0 (0 to 1) |
| `vulnerable_flags` | text | 11,834 | hospital, school, elderly … mentioned | hospital |
| `hazard_flag` | float | 33,328 | hazard words | 0 (0 to 1) |
| `access_blocked` | float | 16,120 | road or access blocked | 0 (0 to 1) |
| `blockage_minutes` | float | 3,838 | minutes blocked (police) | 100 (10 to 625) |
| `service_disruption` | text | 3,080 | none, partial, full (PWD) | none 1354, partial 1266, full 460 |
| `crowd_estimate` | float | 841 | crowd size (police) | 210 (20 to 4980) |
| `weather_related` | float | 32,553 | weather related | 0 (0 to 1) |
| `claims_prior_complaint` | float | 31,727 | says they complained before | 0 (0 to 1) |
| `has_photo` | float | 31,727 | has a photo | 1 (0 to 1) |
| `severity_score` | float | all | 0-100 score behind the level | 25 (5 to 100) |
| `severity_level` | text | all | Severe, High, Medium or Low | Low 14905, Medium 12593, High 6611, Severe 1290 |
| `severity_reasons` | text | all | why that severity (rule points) | Public-safety or sanitation issue: Removal of Garbage (+2… |
| `status_src` | text | 35,290 | status in the source | Verified by Collector |
| `status_std` | text | all | standard status | Resolved 29310, In progress 2244, Open 2019, Rejected 1274, Under review 281, Assigned 138, Awaiting verification 133 |
| `status_at` | datetime | 35,290 | time of that status | 2026-05-30 10:24:19 to 2026-11-26 00:11:28 |
| `first_action_at` | datetime | 30,954 | first action | 2026-05-31 01:59:04 to 2026-11-26 02:46:09 |
| `response_applicable` | float | 35,290 | a response time applies | 1 (0 to 1) |
| `response_minutes` | float | 29,521 | minutes to respond | 311 (2 to 54626) |
| `rejection_reason_code` | text | 1,274 | why rejected (duplicate …) | duplicate 598, insufficient_details 212, work_unsatisfactory 162, photo_mismatch 154, not_jurisdiction 90, private_property 30, other 28 |
| `reopen_count` | float | 31,727 | times reopened | 0 (0 to 1) |
| `assigned_office_id` | text | 13,910 | police station (PS-…) or PWD office | PS-AYN-02 |
| `officer` | text | 30,344 | post assigned ("AE, Zone 9", "SHO, … Police Station") | Assistant Engineer, Ward 114 |
| `channel` | text | all | citizen_app, control_room_112, fir_walk_in, media, patrol, manu … | citizen_app |
| `reporter_hash` | text | 14,943 | one-way hash of the citizen (PRIVATE) | (hidden) |
| `source_reliability` | float | all | reliability | 1 (0.3 to 1) |
| `dup_group_id` | text | all | duplicate group | GRV-2026-975DNZ |
| `incident_id` | text | all | incident it was merged into | INC-20260531-4668DE |
| `link_prob` | float | 2,386 | probability of the link | 0.668 (0.6 to 1) |
| `link_method` | text | all | singleton, within_source_rule, scorer | singleton 27184, within_source_rule 5829, scorer 2386 |
| `ext_ref` | text | 3,973 | reference to another system | 2026-975DNZ |
| `ext_ref_status` | text | 3,973 | what that reference is | story 1601, source_duplicate_group 1207, external_system_unresolved 1165 |

#### `incident_members` (35,399 rows; reported_at 2026-05-30 02:07 to 2026-11-26 00:11)

Which source records make up which incident.

- Written by: pipeline linker. Refresh: hourly build.
- Good for questions like: "Which records are joined in INC-…?"; "How many incidents have both a police report and a complaint?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `incident_id` | text | all | incident id (INC-YYYYMMDD-XXXXXX; INC-W-<complaint code> for a website or Manu filing) | INC-20260504-08B2A5 |
| `event_id` | text | all | source record id (GRV-…, POL-…, PWD-INC-…, HSP-…, NEWS-…, IMDW-…, CPCB-…) | PWD-INC-053406 |
| `source` | text | all | which source | grievance 17105, police 13040, pwd 3205, news 1601, imd 178, hospital 161, cpcb 109 |
| `source_record_id` | text | all | id in the source | PWD-INC-053406 |
| `channel` | text | all | channel | control_room |
| `reported_at` | datetime | all | reported | 2026-05-30 02:07:48 to 2026-11-26 00:11:28 |
| `link_prob` | float | 2,386 | probability of the link | 0.747 (0.6 to 1) |
| `link_method` | text | all | how linked | singleton 27184, within_source_rule 5829, scorer 2386 |
| `severity_level` | text | all | Severe, High, Medium or Low | Low 14905, Medium 12593, High 6611, Severe 1290 |
| `status_std` | text | all | standard status | Resolved 29310, In progress 2244, Open 2019, Rejected 1274, Under review 281, Assigned 138, Awaiting verification 133 |
| `deep_link` | text | 18,034 | tracking link | http://localhost:3000/citizen/track-complaints?code=2026-… |
| `title` | text | all | title | Desilting needed for drain, Anna Nagar |
| `is_overlay` | bool | all | scenario record | 0 |
| `role` | text | all | first_report, corroboration, media_coverage | first_report 28532, corroboration 6215, media_coverage 652 |

#### `incident_timeline` (146,872 rows; at 2026-05-30 02:07 to 2026-11-26 00:11)

Every step of every record: first report, routed, crew assigned, work, verification, closed.

- Written by: pipeline. Refresh: hourly build.
- Good for questions like: "What happened with this case, step by step?"; "How long between routing and the crew being assigned in GCC-SWD?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `event_id` | text | all | source record id (GRV-…, POL-…, PWD-INC-…, HSP-…, NEWS-…, IMDW-…, CPCB-…) | PWD-INC-053406 |
| `at` | datetime | all | time of the step | 2026-05-30 02:07:48 to 2026-11-26 00:11:28 |
| `step` | text | all | First report, Routed, Crew assigned, Work in progress, Officer verified, Awaiting verification, Resolved, Rejected, News coverage … | First report |
| `status_std` | text | 146,230 | standard status | Open 34309, Resolved 29798, In progress 28301, Assigned 18944, Under review 17091, Awaiting verification 16513, Rejected 1274 |
| `actor` | text | all | who (role or PWD office) | control_room |
| `note` | text | all | officer's or system note (untrusted text) | (hidden) |
| `source` | text | all | which source | grievance 97020, police 37375, pwd 11197, news 954, hospital 326 |
| `incident_id` | text | all | incident id (INC-YYYYMMDD-XXXXXX; INC-W-<complaint code> for a website or Manu filing) | INC-20260504-08B2A5 |

#### `actions` (5,616 rows; due_at 2026-06-01 20:25 to 2027-01-22 00:00)

Tasks: 1,567 real PWD field tasks (with dates) and 4,049 drafts of the Action Planner (playbook and coordination steps).

- Written by: PWD generator + action_planner agent. Refresh: hourly build.
- Good for questions like: "Which PWD tasks are overdue?"; "What is the next step for this case and who owns it?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `action_id` | text | all | task id: PWD-TSK-… real PWD field task; ACT-… planner draft | PWD-TSK-17601 |
| `event_id` | text | 1,567 | the PWD record the task came from (pwd_task rows only) | PWD-INC-052811 |
| `dept_code` | text | all | department code | PWD-WRD |
| `office_id` | text | 1,567 | PWD office id (ref_offices) | PWD-OFF-015 |
| `owner` | text | all | post (and for PWD the officer name) that owns the task | (hidden) |
| `text` | text | all | what to do | Sandbag bank of Captain Cotton Canal - Vyasarpadi stretch… |
| `sop_step` | float | 3,404 | step number in the category playbook | 1 (1 to 7) |
| `assigned_at` | datetime | 1,567 | assigned (PWD tasks only) | 2026-06-01 12:45:59 to 2026-11-25 21:49:24 |
| `due_at` | datetime | all | due | 2026-06-01 20:25:37 to 2027-01-22 00:00:00 |
| `status` | text | all | Draft = planner suggestion nobody accepted; the rest are PWD statuses | Draft 4049, Done 1418, In progress 104, Not started 42, Pending 3 |
| `created_by` | text | all | department or agent:action_planner | agent:action_planner 4049, department 1567 |
| `origin` | text | all | playbook ¦ pwd_task ¦ coordination | playbook 3404, pwd_task 1567, coordination 645 |
| `completed_at` | datetime | 1,430 | completed | 2026-06-05 09:53:14 to 2026-11-25 23:27:26 |
| `verified_at` | datetime | 1,333 | verified | 2026-06-13 08:50:46 to 2026-11-25 21:20:33 |
| `evidence` | text | 667 | photo path named by the generator (the file is not on disk) | uploads/pwd/PWD-TSK-17601.jpg |
| `incident_id` | text | all | incident id (INC-YYYYMMDD-XXXXXX; INC-W-<complaint code> for a website or Manu filing) | INC-20260530-693329 |

#### `documents` (22,544 rows; published_at 2025-10-23 00:00 to 2026-11-25 23:58)

News articles (22,409), PWD announcements (112) and CFM flood bulletins (23), with outlet, story, category, places and the AI reading.

- Written by: news pipeline on GitHub + AI labels. Refresh: news is collected in one nightly run (about 23:00); the build is hourly.
- Good for questions like: "Which newspapers reported the Padi murder and when?"; "What did Dinamalar report about water supply this week?"; "How many stories were in two or more newspapers this week?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `doc_id` | text | all | article or bulletin id | 20261119-59d3d098cbb5443e |
| `article_id` | text | 22,409 | same id (news only) | 20261119-59d3d098cbb5443e |
| `story_id` | text | 22,409 | same-event story across outlets (STY-…) | STY-98cbb5443e |
| `story_role` | text | 22,409 | first_report or follow_up | follow_up 12418, first_report 9991 |
| `outlet_count` | float | 22,409 | REAL number of distinct publishers in the story (checked: equals COUNT(DISTINCT publisher) on 9,991 of 9,991 stories) | 1 (1 to 87) |
| `title` | text | all | headline as published (Tamil or English) | சென்னையில் புகழ்பெற்ற 'உட்லண்ட்ஸ்' திரையரங்கை 25 ஆண்டு கு… |
| `summary` | text | 19,540 | feed summary | (hidden) |
| `body` | text | 9,497 | article text where it could be read (9,362 full texts) | (hidden) |
| `url` | text | 22,432 | publisher link (a Google News link for 13,046 snippet rows) | https://news.google.com/rss/articles/CBMi-AFBVV95cUxNRlQy… |
| `publisher` | text | all | NEWSPAPER / outlet name | Samayam Tamil |
| `publisher_domain` | text | all | site | tamil.samayam.com |
| `publisher_tier` | text | all | official, established, regional, aggregator, social | established 12018, regional 9769, social 464, aggregator 158, official 135 |
| `reliability` | float | all | 0.3-1 by tier | 0.6 (0.3 to 1) |
| `lang` | text | all | en, ta, other | en 11956, ta 10475, other 113 |
| `source_kind` | text | all | news, pwd_announcement, cfm_bulletin | news 22409, pwd_announcement 112, cfm_bulletin 23 |
| `report_type` | text | all | incident, crime, court, civic_complaint, announcement, alert, opinion … | other |
| `published_at` | datetime | all | WHEN THE NEWSPAPER PUBLISHED IT (IST) | 2025-10-23 00:00:00 to 2026-11-25 23:58:59 |
| `fetched_at` | datetime | 22,409 | when the news monitor collected it (a nightly batch about 23:00-00:10, not "first seen") | 2026-09-24 23:29:49 to 2026-11-26 00:05:50 |
| `is_district` | bool | all | 1 = about Chennai district | 1 |
| `is_incident` | bool | all | 1 = reports an incident | 0 |
| `incident_conf` | float | 22,409 | confidence of that | 0.011 (0 to 1) |
| `category_code` | text | 22,409 | category code (35; ref_categories) | OTHER |
| `category_conf` | float | 22,409 | confidence of the category | 0.011 (0 to 1) |
| `department` | text | 22,409 | department guessed by the monitor (74% are the GCC-GAD fallback: do not count by it) | GCC-LND |
| `place_text` | text | 22,409 | place in words | Chennai |
| `lat` | float | 22,409 | latitude | 13.0827 (12.868 to 13.2146) |
| `lon` | float | 22,409 | longitude | 80.2707 (80.152 to 80.3203) |
| `geo_level` | text | 22,409 | district, locality, taluk, zone | district 17453, locality 2658, taluk 1795, zone 503 |
| `dead` | float | 22,409 | deaths read from the text | 0 (0 to 180) |
| `injured` | float | 22,409 | injured read from the text | 0 (0 to 1654) |
| `event_id` | text | 1,601 | the NEWS-… event made from it (1,601) | NEWS-20261012-eb8aad4800c14f01 |
| `linked_incident_id` | text | 1,601 | the incident it is joined to (1,601) | INC-20261012-C58335 |
| `ai_people` | text | 457 | people named in the report (personal: victims, accused) | (hidden) |
| `ai_orgs` | text | 913 | organisations named | TANGEDCO |
| `ai_dead` | float | 2,525 | deaths, AI reading | 0 (0 to 9) |
| `ai_injured` | float | 2,525 | injured, AI reading | 0 (0 to 1654) |
| `ai_status` | text | 466 | ongoing, under_investigation, action_taken, resolved | action_taken 156, under_investigation 141, ongoing 124, resolved 45 |
| `ai_place` | text | 960 | place, AI reading | various localities in Chennai |
| `title_en` | text | 19,932 | English headline of a Tamil report (machine or desk) | Tiruppur Subramaniam takes 25-year lease of Chennai's fam… |
| `geo_method` | text | 22,409 | how it was placed | gazetteer+role 22373, gazetteer+llm_place 36 |
| `body_status` | text | all | full, full_publisher_page, snippet… | snippet_google_news 13046, full_publisher_page 5216, full 4258, title_only 23, snippet 1 |
| `places` | text | 7,545 | every place named, ¦-separated | Vadapalani¦T. Nagar¦Kodambakkam |
| `place_roles` | text | 7,423 | JSON: each place and its role (event, mention, home, hospital) | [{"place": "Kodambakkam", "role": "event", "p": 0.63}, {"… |

#### `gaps` (71 rows; first_reported_at 2026-11-12 07:00 to 2026-11-25 23:45)

"In the news, not in department records": news-only, non-police incidents of the last 14 days.

- Written by: gap_finder agent. Refresh: hourly build.
- Good for questions like: "What is in the papers that no department has logged?"; "Which department should log it?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `incident_id` | text | all | incident id (INC-YYYYMMDD-XXXXXX; INC-W-<complaint code> for a website or Manu filing) | INC-20261123-38098C |
| `title` | text | all | title | North Chennai Water Supply Disruption From November 25 |
| `category_code` | text | all | category code (35; ref_categories) | WATER_SUPPLY |
| `lead_dept` | text | all | department that handles it (ref_departments.code) | CMWSSB |
| `zone_name` | text | 25 | zone name | Madhavaram |
| `ward_no` | int | 25 | GCC ward 1-200 | 30 (21 to 184) |
| `outlet_count` | int | all | number of news ARTICLES joined to the incident, NOT newspapers (see section 6) | 7 (1 to 7) |
| `first_reported_at` | datetime | all | earliest article published | 2026-11-12 07:00:52 to 2026-11-25 23:45:34 |
| `severity_level` | text | all | Severe, High, Medium or Low | Medium 43, Low 22, High 6 |
| `priority_score` | float | all | priority, higher = more urgent | 40 (20 to 112) |
| `gap_strength` | text | all | "reported by 2+ outlets" when outlet_count >= 2 (so really 2+ articles) | single outlet 55, reported by 2+ outlets 16 |
| `suggested_action` | text | all | template line | Ask CMWSSB to verify on the ground and log it in their sy… |

#### `observations` (32,819 rows; observed_at 2025-07-23 16:15 to 2026-11-30 00:00)

Every reading over time: hospitals (beds, OPD, emergencies, diseases, medicine, ambulance, staff), lakes, rain, temperature, humidity, IMD warning level, AQI, river gauges, reservoir inflow.

- Written by: collectors (IMD, CPCB, CFM), hospital and PWD generators; CMWSSB hook replaces the lakes; live IMD lane overlays warnings. Refresh: hourly build; IMD warning every 10 min.
- Good for questions like: "Which hospital has the most free beds now?"; "How has AQI at Manali moved over 7 days?"; "How much did it rain at Nungambakkam on 21 October?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `metric` | text | all | what was measured (24 metrics, listed below) | lake_storage_mcft |
| `value` | float | all | value | 19.67 (-4.2 to 15915) |
| `unit` | text | all | unit | mcft |
| `place_type` | text | all | facility or district | facility 32369, district 450 |
| `place_id` | text | all | station or facility id | PWD-AST-0001 |
| `place_name` | text | all | station or facility | Adambakkam Lake |
| `lat` | float | 32,802 | latitude | 12.99737 (12.89 to 13.4) |
| `lon` | float | 32,802 | longitude | 80.201093 (79.86 to 80.333333) |
| `ward_no` | int | 26,900 | GCC ward 1-200 | 161 (2 to 197) |
| `zone_no` | int | 26,900 | GCC zone 1-15 (null = outside or not placed) | 12 (1 to 15) |
| `taluk_code` | text | 29,160 | revenue taluk code TLK-… (ref_taluks) | TLK-ALD |
| `observed_at` | datetime | all | when observed | 2025-07-23 16:15:00 to 2026-11-30 00:00:00 |
| `period` | text | all | day, 24h or instant | day 30028, 24h 1667, instant 1124 |
| `source` | text | all | hospital, pwd, imd, cpcb, cfm (cmwssb after the build hooks) | hospital 19440, pwd 9720, imd 1612, cpcb 1465, cfm 582 |
| `quality` | text | all | ok, derived, suspect (every CFM gauge reading is suspect) | ok 29415, derived 3240, suspect 164 |
| `is_synthetic` | bool | all | 1 = generated (test) data | 1 |
| `detail` | text | 5,906 | words: disease, alert, AQI band, warning text, gauge marks | Hypertension |

#### `observation_signals` (190 rows; observed_at 2026-11-18 17:30 to 2026-11-26 00:00)

The latest reading per metric and place with its 7-day and 28-day references.

- Written by: pipeline; CMWSSB hook; live IMD. Refresh: hourly build.
- Good for questions like: "Which hospitals are above 90% occupancy?"; "Is any reading unusual today?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `metric` | text | all | what was measured | ambulance_available |
| `place_id` | text | all | station or facility | HSP-government-peripheral-hospital-anna-naga |
| `place_name` | text | all | name | Government Peripheral Hospital Anna Nagar |
| `lat` | float | all | latitude | 13.087 (12.907419 to 13.4) |
| `lon` | float | all | longitude | 80.21 (79.86 to 80.333333) |
| `taluk_code` | text | 162 | revenue taluk code TLK-… (ref_taluks) | TLK-AMJ |
| `observed_at` | datetime | all | latest reading | 2026-11-18 17:30:00 to 2026-11-26 00:00:00 |
| `value` | float | all | latest value | 1 (0 to 12313) |
| `unit` | text | all | unit | flag |
| `ewma7` | float | all | 7-day weighted mean | 1 (0 to 11348.46) |
| `mean28` | float | all | 28-day mean | 1 (0 to 11200.29) |
| `zscore` | float | 178 | how unusual | -5.1 (-5.1 to 3.83) |
| `slope_per_day` | float | all | trend a day | 0 (-1570.571 to 326.286) |
| `n_points` | int | all | readings behind it | 180 (10 to 446) |
| `detail` | text | 31 | words | Good |
| `source` | text | all | which source | hospital 108, pwd 54, imd 19, cpcb 7, cfm 2 |
| `anomaly` | bool | all | 1 = unusual | 0 |
| `days_to_full` | text | 0 | lakes only (empty in the build; set by the CMWSSB hook) |  |

#### `forecasts` (272 rows; valid_from 2026-09-25 00:00 to 2026-12-01 00:00)

IMD's city forecast text for 4 stations, today and up to 6 days ahead. NO code on the site reads it.

- Written by: IMD collector. Refresh: twice a day.
- Good for questions like: "What does IMD forecast for Sunday at Nungambakkam?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `location_id` | text | all | IMD city station | IMD_CITY_STATION:99947:Chennai-Ma… 68, IMD_CITY_STATION:43278:Chennai-Nu… 68, IMD_CITY_STATION:43279:Chennai-Me… 68, IMD_CITY_STATION:99948:Chennai-En… 68 |
| `issued_at` | datetime | all | issued (latest issue kept per day) | 2026-09-25 10:01:36 to 2026-11-25 18:38:09 |
| `valid_from` | datetime | all | day it is for | 2026-09-25 00:00:00 to 2026-12-01 00:00:00 |
| `forecast_text` | text | all | sky, rain, max and min in words | Generally cloudy sky with Light rain; Max 37.0 °C; Min 27… |
| `source_url` | text | all | IMD page | https://city.imd.gov.in/citywx/re… 68, https://city.imd.gov.in/citywx/re… 68, https://city.imd.gov.in/citywx/re… 68, https://city.imd.gov.in/citywx/re… 68 |

#### `alerts` (68 rows; created_at 2026-11-26 00:12 to 2026-11-26 00:12)

The Watchdog's alerts.

- Written by: watchdog; CMWSSB hook replaces lake alerts. Refresh: hourly build.
- Good for questions like: "What alerts stand now?"; "Which hospital alerts are critical?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `alert_id` | text | all | alert id | ALR-0001 |
| `type` | text | all | type of alert | incident_attention 25, lake_level 13, anomaly 12, sla 11, hospital 3, weather_warning 2, data_quality 2 |
| `severity` | text | all | severity | Medium 27, Severe 24, High 17 |
| `title` | text | all | title | Slow rise in flooding & waterlogging in Valasaravakkam |
| `message` | text | all | one line of figures | 26 incidents in the 10 days to 2026-11-25 against 9.45 ex… |
| `explanation` | text | all | why it was raised | CUSUM check for a doubling against the baseline before th… |
| `place` | text | all | place | Valasaravakkam |
| `zone_no` | float | 37 | GCC zone 1-15 (null = outside or not placed) | 11 (1 to 15) |
| `date` | date | 14 | day it concerns (can be in the future for IMD) | 2026-11-20 to 2026-11-27 |
| `category_code` | text | 12 | category code (35; ref_categories) | AIR_POLLUTION 8, FLOOD_WATERLOGGING 1, STRAY_ANIMALS 1, CRIMES_AGAINST_WOMEN 1, DRAIN_WORKS_SAFETY 1 |
| `incident_ids` | text | 25 | incident behind it | INC-20261123-7066BA |
| `created_at` | datetime | all | row made (IST) | 2026-11-26 00:12:00 to 2026-11-26 00:12:00 |
| `status` | text | all | always new from the pipeline; open on CMWSSB lake rows | new 68 |

#### `anomalies` (12 rows; date 2026-11-20 to 2026-11-25)

Unusual rises: a zone and category far above its usual level (28-day baseline, weekday and rain factors, false-discovery check).

- Written by: watchdog. Refresh: hourly build.
- Good for questions like: "What is rising unusually, and where?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `date` | date | all | day (or last day of the run) | 2026-11-20 to 2026-11-25 |
| `category_code` | text | all | category code (35; ref_categories) | AIR_POLLUTION 8, FLOOD_WATERLOGGING 1, STRAY_ANIMALS 1, CRIMES_AGAINST_WOMEN 1, DRAIN_WORKS_SAFETY 1 |
| `zone_no` | int | all | GCC zone 1-15 (null = outside or not placed) | 11 (2 to 14) |
| `observed` | int | all | reports counted | 26 (3 to 26) |
| `expected` | float | all | usual level | 9.45 (0 to 9.45) |
| `p_value` | float | all | chance of so many by luck | 0.0000446 (5.15e-18 to 0.00019) |
| `ratio` | float | all | times the usual | 2.8 (2.8 to 180) |
| `kind` | text | all | spike (one day) or slow_rise (a run) | spike 10, slow_rise 2 |
| `rise_days` | int | all | days in the run | 10 (1 to 10) |
| `q_value` | float | all | false-discovery corrected | 0.0122 (2.03e-14 to 0.0416) |
| `rain_adjusted` | bool | all | baseline allowed for rain | 1 |

#### `hotspots` (352 rows; last_seen 2026-09-16 08:48 to 2026-11-26 00:09)

Clusters of incidents close together (DBSCAN 250 m).

- Written by: pipeline. Refresh: hourly build.
- Good for questions like: "Where do the same problems keep coming back?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `hotspot_id` | text | all | cluster id | HOT-BUILDING_SAFETY-000 |
| `category_code` | text | all | category code (35; ref_categories) | BUILDING_SAFETY |
| `incidents` | int | all | incidents in it | 13 (3 to 47) |
| `incidents_30d` | int | all | in the last 30 days | 7 (0 to 20) |
| `open` | int | all | still open | 5 (0 to 12) |
| `lat` | float | all | latitude | 13.099928 (12.849022 to 13.212703) |
| `lon` | float | all | longitude | 80.229741 (80.15149 to 80.323819) |
| `wards` | text | 351 | wards, ¦-separated | 96¦97 |
| `first_seen` | datetime | all | first incident | 2026-08-28 00:43:20 to 2026-10-27 02:51:52 |
| `last_seen` | datetime | all | latest | 2026-09-16 08:48:00 to 2026-11-26 00:09:45 |
| `top_place` | text | 350 | busiest place | Periyar Nagar (Govt Peripheral Hospital, Periyar Nagar) |

#### `daily_counts` (22,567 rows; date 2026-05-30 to 2026-11-26)

Records per day, zone, category and source (the history behind baselines).

- Written by: pipeline. Refresh: hourly build.
- Good for questions like: "Trend of garbage records by month?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `date` | date | all | day | 2026-05-30 to 2026-11-26 |
| `zone_no` | int | 22,026 | GCC zone 1-15 (null = outside or not placed) | 4 (1 to 15) |
| `category_code` | text | all | category code (35; ref_categories) | DRAINAGE_SEWAGE |
| `source` | text | all | source system | grievance 11731, police 7788, pwd 1945, news 962, hospital 141 |
| `count` | int | all | records reported that day (records, not incidents) | 2 (1 to 32) |

#### `kpis` (128 rows; window_end 2026-08-28 00:12 to 2026-11-26 00:12)

The pipeline's KPI snapshot per period and zone. Its 'resolved' differs from the console: prefer kpiBlock().

- Written by: pipeline. Refresh: hourly build.
- Good for questions like: "(use the console functions instead)"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `period` | text | all | period | daily 32, weekly 32, monthly 32, quarterly 32 |
| `offset` | bool | all | 0 = this window, 1 = the one before | 0 |
| `zone_no` | float | 120 | GCC zone 1-15 (null = outside or not placed) | 1 (1 to 15) |
| `window_start` | datetime | all | start | 2026-05-30 00:12:00 to 2026-11-25 00:12:00 |
| `window_end` | datetime | all | end | 2026-08-28 00:12:00 to 2026-11-26 00:12:00 |
| `incidents` | int | all | reported | 169 (3 to 15875) |
| `severe_incidents` | int | all | severe | 3 (0 to 642) |
| `high_incidents` | int | all | high | 32 (0 to 2756) |
| `open_incidents` | int | all | open | 168 (2 to 2543) |
| `resolved` | int | all | closed inside the window, whatever the report date (differs from the console) | 163 (1 to 14127) |
| `complaints_filed` | int | all | complaints filed | 76 (0 to 9445) |
| `complaints_open` | int | all | complaints open | 76 (0 to 1173) |
| `sla_breached_open` | int | all | open past deadline | 3 (0 to 1019) |
| `median_hours_to_first_action` | float | 122 | median hours to first action | 0.3 (0.1 to 36.6) |
| `multi_source_incidents` | int | all | seen by 2+ sources | 5 (0 to 384) |
| `media_only` | int | all | news only | 9 (0 to 935) |

#### `briefings` (4 rows; as_of 2026-11-26 00:12 to 2026-11-26 00:12)

The template briefing for each period.

- Written by: briefing agent. Refresh: hourly build.
- Good for questions like: "What does the weekly briefing say?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `briefing_id` | text | all | id | BRF-daily-202611260012 1, BRF-weekly-202611260012 1, BRF-monthly-202611260012 1, BRF-quarterly-202611260012 1 |
| `period` | text | all | daily, weekly, monthly, quarterly | daily 1, weekly 1, monthly 1, quarterly 1 |
| `as_of` | datetime | all | build time | 2026-11-26 00:12:00 to 2026-11-26 00:12:00 |
| `window_start` | text | all | window start in words | 25 Nov 2026 00:12 1, 19 Nov 2026 00:12 1, 27 Oct 2026 00:12 1, 28 Aug 2026 00:12 1 |
| `window_end` | text | all | window end in words | 26 Nov 2026 00:12 4 |
| `markdown` | text | all | the whole briefing text | # Collector's Daily Briefing, Che… 1, # Collector's Weekly Briefing, Ch… 1, # Collector's Monthly Briefing, C… 1, # Collector's Quarterly Briefing,… 1 |
| `fact_pack` | text | all | JSON of every figure used | (hidden) |
| `unverified_numbers` | bool | all | numbers not found in the facts (0) | 0 |
| `unverified_list` | text | 0 | empty |  |
| `method` | text | all | template | template 4 |
| `attention_items` | int | all | items listed | 5 (5 to 5) |
| `ai_summary` | text | 2 | AI opening, English (2 of 4 periods) | This period saw about the same nu… 1, This week saw more incidents comp… 1 |
| `ai_summary_ta` | text | 2 | the same in Tamil | இந்த காலகட்டத்தில் முந்தைய காலகட்… 1, முndय காலத்துடன் ஒப்பிடும்போது இந… 1 |

#### `briefing_notes` (20 rows; written_at 2026-11-25 14:29 to 2026-11-25 21:25)

AI notes of the briefing by section (situation, health, law, 12 departments, 5 news).

- Written by: briefai.py (Gemini). Refresh: hourly build, when facts change.
- Good for questions like: "What does the briefing say about GCC-SWM?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `section` | text | all | situation, health, law, departments or news | departments 12, news 5, situation 1, health 1, law 1 |
| `item_key` | text | 17 | department code or doc_id | PWD-WRD |
| `text_en` | text | all | AI note, English | The last 24 hours were quieter than the previous period a… |
| `text_ta` | text | 3 | AI note, Tamil (3 rows) | கடந்த 24 மணி நேரம் அதற்கு முந்தைய… 1, கடந்த 7 நாட்களில் நோய் அறிக்கைகள்… 1, கடந்த 24 மணி நேரத்தில் வன்முறை கு… 1 |
| `extra` | text | 5 | JSON: group, why, rank (news rows) | {"group": "governance", "why": "R… 1, {"group": "governance", "why": "D… 1, {"group": "public_mood", "why": "… 1, {"group": "governance", "why": "C… 1, {"group": "incident", "why": "Mai… 1 |
| `model` | text | all | model that wrote it | gemini-3.5-flash-lite 19, gemini-3.5-flash 1 |
| `written_at` | datetime | all | written | 2026-11-25 14:29:24 to 2026-11-25 21:25:24 |
| `written_for` | text | all | the hour it was written for | 25 Nov, 09:02 PM 12, 25 Nov, 01:52 PM 7, 25 Nov, 05:53 PM 1 |
| `as_of` | datetime | all | build time | 2026-11-26 00:12:00 to 2026-11-26 00:12:00 |

#### `pwd_works` (258 rows; start_date 2024-07-15 00:00 to 2026-11-25 00:00)

PWD works with money and progress.

- Written by: PWD generator. Refresh: daily.
- Good for questions like: "Which PWD works are late?"; "Which office has the most overspending?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `work_id` | text | all | work id | PWD-WRK-00513 |
| `work_title` | text | all | what the work is | Construction of new wing - Govt Peripheral Hospital, Peri… |
| `work_type` | text | all | type | desilting 87, bund_strengthening 40, building_repair 36, building_construction 29, flood_mitigation 20, canal_lining 18, sluice_repair 11, encroachment_removal 9, bridge_repair 8 |
| `asset_id` | text | all | PWD asset | PWD-AST-0067 |
| `office_id` | text | all | PWD office id (ref_offices) | PWD-OFF-003 |
| `sanctioned_amount_lakh` | float | all | sanctioned, Rs lakh | 1057.78 (5.08 to 4226.51) |
| `expenditure_lakh` | float | all | spent, Rs lakh | 1016.36 (0.5 to 2606.67) |
| `start_date` | datetime | all | start | 2024-07-15 00:00:00 to 2026-11-25 00:00:00 |
| `target_date` | datetime | all | target | 2025-08-08 00:00:00 to 2028-07-02 00:00:00 |
| `completion_date` | datetime | 169 | completed | 2026-06-01 00:00:00 to 2026-11-26 00:00:00 |
| `status` | text | all | completed, in_progress, on_hold | completed 169, in_progress 87, on_hold 2 |
| `physical_progress_pct` | int | all | % done | 100 (1 to 100) |
| `asset_name` | text | all | asset | Govt Peripheral Hospital, Periyar Nagar |
| `latitude` | float | all | latitude | 13.100215 (12.898182 to 13.4) |
| `longitude` | float | all | longitude | 80.229443 (79.965 to 80.30357) |
| `taluk_code` | text | all | revenue taluk code TLK-… (ref_taluks) | TLK-AYN |
| `spend_pct` | float | all | % of sanction spent | 96.1 (0.7 to 108.6) |
| `overrun_pct` | float | all | % over the sanction | 0 (0 to 8.6) |
| `progress_gap_pct` | float | all | spend minus progress (negative = behind) | -3.9 (-31.4 to 8.6) |
| `office` | text | all | office name | Buildings Division (North), Chennai |

#### `world_calendar` (180 rows; date 2026-05-30 to 2026-11-25)

One calendar for all sources: rain days, festivals, protests.

- Written by: pipeline. Refresh: hourly build.
- Good for questions like: "Was 21 October a rain day?"; "Which festivals fell in this window?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `date` | date | all | day | 2026-05-30 to 2026-11-25 |
| `rain_event` | bool | all | rain day | 0 |
| `rain_intensity` | float | all | 0-2 | 0 (0 to 2) |
| `reflected_by` | text | 67 | sources that show it | police |
| `declared_by` | text | 16 | sources that declared it | grievance¦police 13, grievance 3 |
| `festival` | text | 10 | festival | Muharram |
| `protest` | text | 7 | protest | Students' demonstration at Valluvar Kottam |
| `monsoon_phase` | text | all | dry, southwest, northeast | southwest 122, northeast 56, dry 2 |
| `weekday` | text | all | weekday | Saturday 26, Sunday 26, Monday 26, Tuesday 26, Wednesday 26, Thursday 25, Friday 25 |

#### `link_pairs` (3,186 rows)

Pairs of records the linker scored.

- Written by: linker. Refresh: hourly build.
- Good for questions like: "Which record pairs need a human check?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `event_a` | text | all | record A | POL-20260918-0060 |
| `event_b` | text | all | record B | NEWS-20260924-626a30d175484ce4 |
| `src_a` | text | all | source A | grievance 1782, police 852, pwd 392, news 127, hospital 33 |
| `src_b` | text | all | source B | pwd 1830, police 853, grievance 386, news 79, hospital 38 |
| `prob` | float | all | probability they are one event | 0.7442773453312593 (0.3506193754860876 to 0.9998707655745046) |
| `decision` | text | all | linked, or review (a person should decide) | linked 2816, review 370 |
| `features` | text | all | JSON: distance, hours apart, text similarity | {"dist_m": 255.54, "dt_h": 2.449, "dist_norm": 0.101, "dt… |

#### `review_queue` (464 rows; created_at 2026-11-26 00:12 to 2026-11-26 00:12)

What waits for a person: 370 links, 71 gaps, 23 crosswalk entries.

- Written by: linker, data steward. Refresh: hourly build.
- Good for questions like: "What is waiting for review?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `review_id` | text | all | id | REV-00001 |
| `item_type` | text | all | link, gap, crosswalk | link 370, gap 71, crosswalk 23 |
| `item_id` | text | all | pair, incident or label to check | POL-20260918-0019~NEWS-20260924-626a30d175484ce4 |
| `suggestion` | text | all | suggested decision | AI suggests different incidents: Different events: police… |
| `reason` | text | all | why it needs a check | Link probability 0.38 is in the review band |
| `evidence` | text | 441 | JSON of both sides | (hidden) |
| `status` | text | all | all open | open 464 |
| `created_at` | datetime | all | row made (IST) | 2026-11-26 00:12:00 to 2026-11-26 00:12:00 |

#### `data_quality` (20 rows)

Data contract checks.

- Written by: data steward. Refresh: hourly build.
- Good for questions like: "Is the data healthy?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `table` | text | all | table checked | events 15, observations 2, pwd_works 2, actions 1 |
| `check` | text | all | check | event_id unique |
| `severity` | text | all | hard or soft | soft 13, hard 7 |
| `failing` | int | all | rows failing | 0 (0 to 1582) |
| `total` | int | all | rows checked | 35399 (258 to 35399) |
| `examples` | text | 7 | ids that fail | IMDW-202611100000¦IMDW-202611260000¦IMDW-202611270000 |
| `action` | text | all | what the steward does | keep first; fix loader |

#### `source_health` (8 rows; last_success_at 2026-11-25 11:19 to 2026-11-26 00:11)

Freshness of the 8 feeds.

- Written by: data steward. Refresh: hourly build.
- Good for questions like: "Which sources are stale?"; "How old is the CPCB data?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `source` | text | all | feed | imd 1, cpcb 1, cfm 1, news 1, grievance 1, police 1, pwd 1, hospital 1 |
| `kind` | text | all | what it is (says synthetic for generators) | live collector 3, departmental dataset (synthetic g… 3, live collector (RSS, sitemaps, Go… 1, departmental app export (syntheti… 1 |
| `last_run_at` | datetime | all | last run | 2026-11-25 23:05:32 to 2026-11-26 00:11:30 |
| `last_success_at` | datetime | all | last success | 2026-11-25 11:19:08 to 2026-11-26 00:11:30 |
| `newest_record_at` | datetime | all | newest record | 2026-11-25 11:00:00 to 2026-11-26 00:11:28 |
| `freshness_target_min` | int | all | target minutes | 60 (60 to 60) |
| `minutes_since_success` | int | all | minutes since success at the build | 14 (14 to 786) |
| `status` | text | all | status | ok 7, stale 1 |
| `rows` | int | all | rows read | 1612 (147 to 62259) |
| `endpoints_ok` | float | 3 | endpoints working | 4 (0 to 9) |
| `endpoints_total` | float | 3 | endpoints | 4 (1 to 9) |
| `detail` | text | 4 | detail | Unavailable endpoints (not bypass… 1, data.gov.in CPCB real-time air qu… 1, 164 gauge readings marked suspect… 1, State: last_run_at=2026-11-26T00:… 1 |

#### `metrics` (18 rows)

How well each AI step did, as JSON.

- Written by: pipeline. Refresh: hourly build.
- Good for questions like: "How accurate is the category classifier?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `metric` | text | all | name | pipeline_version |
| `value` | text | all | JSON: how well each AI step did (classifier F1, dedup, linking, geo, anomaly checks) | "dintel-1.0.0" |

#### `agent_runs` (6 rows; as_of 2026-11-26 00:12 to 2026-11-26 00:12)

What each pipeline agent did in the build.

- Written by: pipeline. Refresh: hourly build.
- Good for questions like: "How long did the last build take?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `agent` | text | all | pipeline agent | action_planner 1, gap_finder 1, linker 1, watchdog 1, data_steward 1, briefing 1 |
| `trigger` | text | all | what starts it | new_or_open_high_incidents 1, daily_after_briefing 1, gray_band_pairs 1, hourly 1, after_load 1, scheduled 06:30 / on demand 1 |
| `as_of` | datetime | all | build time | 2026-11-26 00:12:00 to 2026-11-26 00:12:00 |
| `duration_s` | float | all | seconds | 306.85 (158.91 to 306.85) |
| `tools` | text | all | tools it read | list_incidents¦read_playbooks 1, list_incidents 1, get_pair_evidence 1, anomalies¦warnings¦metric_signals… 1, read_run_logs¦run_contract¦catego… 1, query_metrics 1 |
| `llm_calls` | int | all | model calls | 0 (0 to 12) |
| `outputs` | text | all | counts it made | incidents=680; draft_actions=4049 1, media_only_incidents=71; two_plus… 1, review_items=370; ai_checked=190 1, alerts=66 1, sources=8; not_ok=1; checks=20; f… 1, briefings=4; unverified_numbers=0 1 |
| `notes` | text | 0 | always empty |  |

#### `ref_categories` (35 rows)

35 categories with lead department, playbook and deadlines.

- Written by: reference YAML. Refresh: rare.
- Good for questions like: "What is the deadline for a severe water supply case?"; "Who handles stray animals?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `category_code` | text | all | category code (35; ref_categories) | FLOOD_WATERLOGGING |
| `label` | text | all | category in words | Flooding & waterlogging |
| `family` | text | all | family | FLOOD |
| `lead_dept` | text | all | department that handles it (ref_departments.code) | GCC-SWD |
| `support_depts` | text | 26 | other departments | POL-GCP¦DIST-DM |
| `base_severity` | int | all | base score | 45 (5 to 60) |
| `rain_sensitive` | bool | all | rises with rain | 1 |
| `sla_severe_h` | int | all | deadline, hours, when Severe | 6 (1 to 72) |
| `sla_high_h` | int | all | when High | 24 (4 to 168) |
| `sla_medium_h` | int | all | when Medium | 72 (24 to 336) |
| `sla_low_h` | int | all | when Low | 120 (48 to 720) |
| `link_window_h` | int | all | linking window | 72 (6 to 336) |
| `link_radius_m` | int | all | linking radius | 600 (100 to 30000) |
| `playbook` | text | all | standard steps, ¦-separated | Deploy pumps and clear standing water¦Clear drain inlets … |
| `sla_basis` | text | all | resolution or response | resolution 25, response 10 |

#### `ref_departments` (27 rows)

27 departments with head post and escalation route.

- Written by: reference YAML. Refresh: rare.
- Good for questions like: "Who does storm water drains escalate to?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `code` | text | all | department code | GCC-SWD |
| `name` | text | all | name | Storm Water Drain |
| `org` | text | all | organisation | Greater Chennai Corporation |
| `head` | text | all | designation of the head | Superintending Engineer (SWD) |
| `route` | text | all | escalation route | AE → EE → SE → Chief Engineer |
| `action_owner` | bool | all | owns incidents | 1 |
| `source_names` | text | 20 | names used by sources | Storm Water Drain Department |

#### `ref_facilities` (197 rows)

197 facilities: police stations 60, river gauges 26, lakes 18, government buildings 14, canals 12, drains 11, river stretches 10, hospitals 9, air stations 9, bunds 8, sluices 7, bridges 7, weather stations 4, gate sites 2.

- Written by: reference + generators. Refresh: hourly build.
- Good for questions like: "Where is the nearest police station to …?"; "How many beds is Stanley built for?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `facility_id` | text | all | id | PS-ALD-01 |
| `type` | text | all | type | police_station |
| `name` | text | all | name | Alandur Police Station |
| `lat` | float | 196 | latitude | 13.002 (12.849 to 13.4) |
| `lon` | float | 196 | longitude | 80.2005 (79.86 to 80.333333) |
| `taluk_code` | text | 156 | revenue taluk code TLK-… (ref_taluks) | TLK-ALD |
| `precision_m` | float | 196 | position precision | 30 (30 to 3000) |
| `source` | text | all | source | pwd 87, police 60, cfm 28, hospital 9, cpcb 9, imd 4 |
| `capacity` | float | 27 | beds (hospital) or mcft (lake) | 28 (6 to 3645) |
| `relevance` | text | 115 | inside, upstream | inside 82, upstream 18, inside_chennai 15 |
| `downstream_taluks` | text | 31 | taluks downstream | TLK-MDR¦TLK-AMJ¦TLK-EGM¦TLK-PSW¦T… 11, TLK-MDV¦TLK-TVT¦TLK-AMB 7, TLK-ALD¦TLK-GND¦TLK-MBM¦TLK-MYL¦T… 6, TLK-MDV¦TLK-TVT 3, TLK-SHN¦TLK-VLC 3, TLK-MDV¦TLK-TVT¦TLK-AMB¦TLK-PRB 1 |
| `specialties` | text | 9 | hospital specialties | General Medicine, Gynecology |
| `address` | text | 9 | hospital address | Anna Nagar, Chennai 600102 |
| `in_district` | bool | 9 | inside Chennai (hospitals) | 1 |
| `basin` | text | 26 | river basin | Cooum 11, Kosasthalayar 7, Adyar 5, Kovalam 3 |
| `same_as` | text | 2 | the CMWSSB name of a gate site | Puzhal Reservoir (Red Hills) 1, Chembarambakkam Reservoir 1 |

#### `ref_offices` (21 rows)

21 PWD offices with officer, phone and email (all GENERATED).

- Written by: PWD generator. Refresh: rare.
- Good for questions like: "Which PWD office covers Velachery?"; "Who heads the Adyar Basin Division?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `office_id` | text | all | PWD office id (ref_offices) | PWD-OFF-001 |
| `office_name` | text | all | office | Office of the Chief Engineer, PWD (Chennai Region) |
| `wing` | text | all | HQ, Buildings, Water Resources | Water Resources 11, Buildings 9, HQ 1 |
| `officer_name` | text | all | officer (GENERATED name) | (hidden) |
| `designation` | text | all | designation | Executive Engineer 11, Assistant Executive Engineer 7, Superintending Engineer 2, Chief Engineer 1 |
| `phone` | text | all | GENERATED phone (+91-44-0000-…) | (hidden) |
| `email` | text | all | GENERATED email (example.tn.gov.in) | (hidden) |
| `taluk_codes_covered` | text | all | PWD's own taluk codes | TLK01¦TLK02¦TLK03¦TLK04¦TLK05¦TLK06¦TLK07¦TLK08¦TLK09¦TLK… |
| `dept_code` | text | all | department code | PWD-WRD 12, PWD-BLD 9 |
| `taluks` | text | all | taluks covered, ¦-separated | TLK-ALD¦TLK-AMB¦TLK-AMJ¦TLK-AYN¦TLK-EGM¦TLK-GND¦TLK-MDV¦T… |

#### `ref_taluks` (18 rows)

18 taluks (17 in the district and Tambaram).

- Written by: reference YAML. Refresh: rare.
- Good for questions like: "Which taluk is Pallikaranai in?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `taluk_code` | text | all | revenue taluk code TLK-… (ref_taluks) | TLK-ALD |
| `name` | text | all | name | Alandur |
| `name_ta` | text | all | Tamil name | ஆலந்தூர் |
| `police_code` | text | 16 | police code | TLK-ALD |
| `pwd_code` | text | 16 | PWD code | TLK01 |
| `in_district` | bool | all | inside Chennai (Tambaram is not) | 1 |
| `lat` | float | all | latitude | 12.9975 (12.91 to 13.18) |
| `lon` | float | all | longitude | 80.2006 (80.1 to 80.3) |
| `aliases` | text | all | other names | Alandur |
| `note` | text | 2 | note | Official taluk; the police and PW… 1, Chengalpattu district; appears in… 1 |

#### `ref_wards` (200 rows)

200 wards with zone, taluk and statistics.

- Written by: pipeline. Refresh: hourly build.
- Good for questions like: "Which wards are low-lying and hot?"; "Which wards touch ward 120?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `ward_no` | int | all | GCC ward 1-200 | 1 (1 to 200) |
| `zone_no` | int | all | GCC zone 1-15 (null = outside or not placed) | 1 (1 to 15) |
| `zone_name` | text | all | zone name | Thiruvottiyur |
| `taluk_code` | text | all | revenue taluk code TLK-… (ref_taluks) | TLK-TVT |
| `taluk_vote_share` | float | all | how sure the taluk is | 0 (0 to 1) |
| `area_km2` | float | all | area | 1.831 (0.289 to 10.905) |
| `centroid_lat` | float | all | centre | 13.225054 (12.865226 to 13.225054) |
| `centroid_lon` | float | all | centre | 80.32431 (80.152326 to 80.32431) |
| `adjacent_wards` | text | all | neighbours | 2 |
| `flood_reports` | int | all | flood reports, 180 days | 8 (1 to 173) |
| `incidents_30d` | int | all | incidents in 30 days | 8 (5 to 105) |
| `open_incidents` | int | all | open | 3 (0 to 58) |
| `open_past_deadline` | int | all | open past deadline | 2 (0 to 26) |
| `low_lying_index` | float | all | 0-1, higher = lower ground | 0.255 (0.005 to 1) |
| `gi_star_z_30d` | float | all | Getis-Ord hot-spot score | -0.32 (-2.13 to 5.25) |
| `hot_ward` | bool | all | statistically hot | 0 |
| `geometry` | text | all | outline GeoJSON (large: never select) | (hidden) |

#### `ref_zones` (15 rows)

The 15 zones.

- Written by: reference. Refresh: rare.
- Good for questions like: "Which zone is number 13?"

| Column | Type | Filled | Meaning | Example or values |
|---|---|---|---|---|
| `zone_no` | int | all | GCC zone 1-15 (null = outside or not placed) | 1 (1 to 15) |
| `zone_name` | text | all | zone name | Thiruvottiyur |
| `outline` | text | all | outline GeoJSON (large: never select) | (hidden) |


#### The 24 metrics in `observations` / `observation_signals`

| Metric | Source | Places | Rows | Dates | Range | Meaning |
|---|---|---|---|---|---|---|
| `bed_occupancy_pct`, `occupied_beds`, `total_beds` | hospital (generated) | 9 hospitals | 1,620 each | 31 May to 26 Nov 2026, daily | 63.58-99.5 %, 134-2,985, 197-3,000 | hospital beds |
| `opd_count`, `emergency_cases` | hospital | 9 | 1,620 each | daily | 328-15,915; 47-917 | outpatients, emergencies |
| `disease_cases` (disease in `detail`) | hospital | 9 | 1,620 | daily | 41-1,248 | leading disease that day |
| `medicine_status` (0 critical, 1 limited, 2 available) | hospital | 9 | 1,620 | daily | 0-2 | medicine |
| `ambulance_available` (0/1), `health_alert_level` (0-3, words in `detail`) | hospital | 9 | 1,620 each | daily | | ambulance, alert |
| `doctors_on_roll`, `nurses_on_roll`, `vaccination_pct` | hospital | 9 | 1,620 each | daily | 28-517; 70-1,331; 74.77-96.93 | staff, vaccination |
| `rainfall_24h_mm` | IMD | 4 stations (Nungambakkam, Meenambakkam, Madhavaram, Ennore) | 202 | 25 Sep to 25 Nov | 0-222.5 | 24 h to 08:30 |
| `temp_max_c`, `temp_min_c`, `temp_departure_c`, `humidity_pct` | IMD | 2-4 | 226-253 | 18 Sep to 25 Nov | | weather |
| `imd_warning_level` (0 green-3 red, words in `detail`) | IMD + live lane | district | 450 | 25 Sep to 30 Nov (days ahead) | 0-3 | warning |
| `aqi` (band in `detail`) | CPCB | 7 stations | 1,465 | 25 Sep to 25 Nov 11:00 | 25-315 | air. No pollutants (PM2.5 etc.): the CPCB pollutant file is empty |
| `gauge_level_m` (warning and danger marks in `detail`) | CFM-DSS | 23 bridges | 164 | 23 Jul 2025 to 24 Nov 2026 | | ALL `quality='suspect'` (danger below warning): never alert on it |
| `reservoir_inflow_cusec` | CFM-DSS | Red Hills, Chembarambakkam | 418 | 28 Aug to 25 Nov | 0-42 | inflow |
| `lake_pct_full`, `lake_storage_mcft`, `lake_outflow_cusec` | PWD generator in the file (18 lakes, 3,240 each) | REPLACED in memory by 6 CMWSSB reservoirs | | | | storage |

Hospitals on 26 Nov 2026 (occupancy %, occupied/total): Institute of Child Health 96.89 (966/997); Obstetrics and Gynecology Egmore 96.24 (768/798); Rajiv Gandhi GGH 93.23 (2,796/2,999); Kilpauk MC 91.39 (1,093/1,196); Stanley 89.94 (1,619/1,800); Royapettah 88.93 (755/849); Peripheral Anna Nagar 84.42 (168/199); Thoracic Medicine Tambaram 79.87 (595/745, outside the district, no ward); Multi-Super Specialty 78.67 (391/497).

Where the website reads them: `lib/collector/briefbook.ts` (hospitals at 85% or more, Briefing page), `lib/officer/insights.ts hospital()` (Government Hospitals officer console: beds by day, by hospital, diseases, alerts), `lib/map/conditions.ts` + `/api/map/layers/live_hospitals` (map), `lib/map/world.ts condsOf` (reads `observation_signals`), chatbot tool `environment` (`lib/assistant/queries.ts ENV_METRICS`, `envSignals`). Alerts: `alerts` type `hospital` (3 now), incidents lead_dept `HLT-DMS` (150).

```sql
-- free beds now, most first
SELECT b.place_name, t.value AS beds, b.value AS occupied, t.value - b.value AS free, p.value AS pct, p.observed_at
FROM observation_signals b JOIN observation_signals t ON t.place_id = b.place_id AND t.metric = 'total_beds'
JOIN observation_signals p ON p.place_id = b.place_id AND p.metric = 'bed_occupancy_pct'
WHERE b.metric = 'occupied_beds' ORDER BY free DESC;
```

### Durable tables (the website's own; DynamoDB behind them)

#### `collector_decisions` (6 rows; decided_at 2026-09-28 09:37 to 2026-10-02 15:23)

The Collector's decisions, laid over incidents by effectiveSql().

- Written by: website (POST /api/collector/decisions). Refresh: at once.
- Good for questions like: "Which cases did I verify last month?"; "What did I escalate and to whom?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `decision_id` | all | id | 8 |
| `incident_id` | all | incident id (INC-YYYYMMDD-XXXXXX; INC-W-<complaint code> for a website or Manu filing) | INC-20260919-566998 |
| `decision` | all | verify, escalate, reject, resolve, reopen, note | verify 4, reopen 1, escalate 1 |
| `escalate_to` | 1 | department or office | POL-GCP 1 |
| `note` | 2 | note | Sent back to the department: the … 1, Escalated to ACP 1 |
| `decided_by` | all | account email | (account email) |
| `decided_role` | all | role | collector 6 |
| `decided_at` | all | when | 2026-09-30 10:22:05 |
| `applied_at` | 0 | when the pipeline applied it (never set on AWS) |  |
| `superseded_by` | 0 | newer decision |  |

#### `action_updates` (4 rows; updated_at 2026-09-27 14:28 to 2026-09-28 09:44)

The Collector's changes to action statuses.

- Written by: website (/api/collector/actions). Refresh: at once.
- Good for questions like: "Which actions did I change?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `update_id` | all | id | 4 |
| `action_id` | all | actions.action_id | ACT-07e04411fcaf |
| `incident_id` | all | incident id (INC-YYYYMMDD-XXXXXX; INC-W-<complaint code> for a website or Manu filing) | INC-20260924-3B4360 |
| `dept_code` | 0 | department code |  |
| `office_id` | 0 | PWD office id (ref_offices) |  |
| `owner` | 0 | owner |  |
| `text` | 0 | new wording |  |
| `status` | all | status | Not started 4 |
| `due_at` | 0 | new due |  |
| `note` | 0 | note |  |
| `updated_by` | all | who (email) | (account email) |
| `updated_at` | all | row changed (IST) | 2026-09-27 14:28:52 |
| `applied_at` | 0 | when the pipeline applied it (never set on AWS) |  |

#### `review_decisions` (0 rows)

Decisions on review_queue items. Empty.

- Written by: website. Refresh: at once.
- Good for questions like: "Which links did I confirm?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `decision_id` | 0 | id |  |
| `review_id` | 0 | review_queue.review_id |  |
| `item_type` | 0 | link, gap or crosswalk |  |
| `item_id` | 0 | item it is about |  |
| `decision` | 0 | what was decided |  |
| `payload` | 0 | JSON details |  |
| `note` | 0 | note |  |
| `decided_by` | 0 | account email |  |
| `decided_at` | 0 | when |  |
| `applied_at` | 0 | when the pipeline applied it (never set on AWS) |  |

#### `officer_steps` (5 rows; at 2026-10-01 09:16 to 2026-10-02 15:22)

Officer steps that change the effective status.

- Written by: officer console. Refresh: at once.
- Good for questions like: "What did the health department do on this case?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `step_id` | all | id | 5 |
| `incident_id` | all | incident id (INC-YYYYMMDD-XXXXXX; INC-W-<complaint code> for a website or Manu filing) | INC-20260916-6429F2 |
| `dept_code` | all | department code | GCC-HLT |
| `step` | all | approve, action, send, close | send 3, approve 2 |
| `note` | 3 | note | toilets have cleaned and sanitized 1, food officer raid has been taken … 1, 20 boats have been arranged 1 |
| `report_id` | 3 | officer_reports | 3 |
| `actor` | all | account email | (account email) |
| `actor_user_id` | all | users.id | 34 |
| `at` | all | when | 2026-10-01 10:54:59 |

#### `officer_reports` (3 rows; sent_at 2026-10-01 09:16 to 2026-10-02 15:22)

Completion reports with remarks and photos (uploads/officer-reports).

- Written by: officer console. Refresh: at once.
- Good for questions like: "What did the officer write when closing?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `report_id` | all | id | 3 |
| `incident_id` | all | incident id (INC-YYYYMMDD-XXXXXX; INC-W-<complaint code> for a website or Manu filing) | INC-20260920-CCC74E |
| `dept_code` | all | department code | GCC-HLT |
| `remarks` | all | officer's completion remarks | toilets have cleaned and sanitized 1, food officer raid has been taken … 1, 20 boats have been arranged 1 |
| `photo_dir` | all | folder under uploads/officer-reports/ | (hidden) |
| `photos` | all | JSON file names | ["1.jpg"] 3 |
| `sent_by` | all | account email | (account email) |
| `sent_user_id` | all | users.id | 34 |
| `sent_at` | all | when | 2026-10-01 10:55:38 |

#### `dept_assignments` (7 rows; assigned_at 2026-10-27 14:17 to 2026-10-27 17:29)

News-only civic complaints sent to a department with its officer.

- Written by: job POST /api/collector/jobs/route-news (last ran 27 Oct). Refresh: job, not scheduled.
- Good for questions like: "Which news complaints were routed and to whom?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `incident_id` | all | incident id (INC-YYYYMMDD-XXXXXX; INC-W-<complaint code> for a website or Manu filing) | INC-20261019-43712B |
| `dept_code` | all | department code | CMWSSB |
| `contact_id` | 6 | official_contacts.contact_id | 13 |
| `officer_name` | 6 | officer | R.A.Prabhakar 3, P. Banukumar 2, M.Palani 1 |
| `officer_designation` | all | designation | Superintending Engineer (SWD) 3, Superintending Engineer (SWM) 2, Superintending Engineer (Bus Rout… 1, Superintending Engineer 1 |
| `officer_phone` | 6 | officer's published phone | (hidden) |
| `reason` | all | why it was routed | News report of garbage & solid wa… 2, News report of drainage & sewage … 2, News report of roads, footpaths &… 1, News report of drinking water sup… 1, News report of drainage & sewage … 1 |
| `status` | all | status | Assigned 7 |
| `assigned_by` | all | always the news monitor job | District IQ news monitor 7 |
| `assigned_at` | all | when | 2026-10-27 17:29:32 |

#### `outbound_emails` (7 rows; created_at 2026-10-06 21:52 to 2026-11-22 19:14)

Action emails (all sandbox).

- Written by: Take action, map send, rain tasks. Refresh: at once.
- Good for questions like: "Which departments did I write to this week?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `email_id` | all | id | (hidden) |
| `owner` | all | sender account | (account email) |
| `to_contact_ids` | all | JSON list of recipients (holds emails: PRIVATE) | (hidden) |
| `cc_contact_ids` | 0 | empty |  |
| `incident_id` | all | incident id (INC-YYYYMMDD-XXXXXX; INC-W-<complaint code> for a website or Manu filing) | INC-20261006-497574 |
| `subject` | all | subject | (hidden) |
| `body` | all | letter | (hidden) |
| `language` | all | language | en 7 |
| `mode` | all | sandbox (never reached a department) | sandbox 7 |
| `status` | all | status | sent 6, failed 1 |
| `approved_at` | all | approved | 2026-10-06 21:52:49 |
| `send_after` | 0 | empty |  |
| `sent_at` | 6 | sent | 2026-10-06 21:56:44 |
| `delivered_to` | 6 | test inbox (PRIVATE) | (account email) |
| `message_id` | 0 | empty |  |
| `body_hash` | all | hash | 7f75df1724a74724f44e69f22c73f48dcf53df06fc6605da1d6a14c89… |
| `error` | 1 | error | self-signed certificate in certif… 1 |
| `created_at` | all | row made (IST) | 2026-11-02 20:40:25 |

#### `followups` (7 rows; due_date 2026-10-07 21:52 to 2026-11-23 19:14)

Promises awaited after an email; also rain rehearsal tasks ("[RR] …").

- Written by: Take action, rehearsal. Refresh: at once.
- Good for questions like: "Which follow-ups are overdue?"; "Which rain tasks are pending?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `followup_id` | all | id | 1 |
| `email_id` | all | outbound_emails.email_id | (hidden) |
| `contact_id` | all | for a department row: users.id; else official_contacts | 31 |
| `incident_id` | all | incident id (INC-YYYYMMDD-XXXXXX; INC-W-<complaint code> for a website or Manu filing) | INC-20261006-497574 |
| `summary` | all | what is awaited; a rain task starts "[RR] {json}" | Completion report with photos fro… 6, Completion report with photos fro… 1 |
| `due_date` | all | due | 2026-10-07 21:52:50 |
| `status` | all | status | pending 7 |
| `last_checked_at` | 0 | never set |  |
| `created_at` | all | row made (IST) | 2026-10-06 21:52:50 |

#### `workspaces` (3 rows; created_at 2026-09-29 10:07 to 2026-10-27 17:34)

Saved dashboards (filters and layout), versioned by name.

- Written by: website. Refresh: at once.
- Good for questions like: "Which workspaces have I saved?"; "Open the demo workspace of 27 October"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `workspace_id` | all | id | 3 |
| `owner` | all | account email | (account email) |
| `name` | all | name | Demo – 27 Oct 2026 2, Collector's Daily Briefing 1 |
| `version` | all | version number | 1 2, 2 1 |
| `is_current` | all | latest | 1 2, 0 1 |
| `layout` | all | JSON layout | {"pages":{"briefing":true,"trends… 2, {"kpis": ["severe", "complaints",… 1 |
| `filters` | all | JSON filters, with archiveId of the frozen briefing | {"period":"weekly","zone":null,"d… 1, {"period":"daily","zone":null,"de… 1, {"cat": null, "dept": null, "page… 1 |
| `created_at` | all | row made (IST) | 2026-09-29 10:07:06 |

#### `briefing_archive` (59 rows; issued_at 2026-09-27 12:58 to 2026-10-27 17:34)

Frozen briefings: the pipeline's (to 2 Oct) and each saved workspace's.

- Written by: pipeline (stopped with MySQL), website. Refresh: on save.
- Good for questions like: "What did the briefing say on 27 October?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `archive_id` | all | id | 1 |
| `briefing_id` | all | BRF-… or WS-<workspace name> | BRF-daily-202609270150 |
| `period` | all | period | daily 16, weekly 15, quarterly 14, monthly 14 |
| `as_of` | all | data time | 2026-09-27 01:50:00 |
| `window_start` | 56 | start | 2026-09-26 01:50:00 |
| `window_end` | 56 | end | 2026-09-27 01:50:00 |
| `markdown` | all | the frozen briefing | # Collector's Daily Briefing, Chennai District _26 Sep 20… |
| `fact_pack` | all | JSON figures | (hidden) |
| `method` | all | template or workspace snapshot | template 56, workspace snapshot 3 |
| `issued_by` | all | pipeline, or "<owner> v<n>" | pipeline 56, (account email) 1, (account email) 1, (account email) 1 |
| `issued_at` | all | kept | 2026-09-27 12:58:07 |

#### `audit_log` (262 rows; at 2026-09-27 14:28 to 2026-11-25 22:20)

Every change and security event.

- Written by: website. Refresh: at once.
- Good for questions like: "(through auditLog() only: it hides citizens)"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `log_id` | all | id | 7 |
| `at` | all | time | 2026-09-27 14:28:52 |
| `actor` | all | account email or system name | (account email) |
| `action` | all | what was done (33 kinds) | action:status |
| `table_name` | all | table | action_updates |
| `record_id` | 231 | row | (hidden) |
| `before_value` | 67 | JSON before (PRIVATE: 26 rows hold officers' phones, deleted petitions) | (hidden) |
| `after_value` | 214 | JSON after (PRIVATE: sign-in rows hold IP and browser) | (hidden) |

#### `assistant_sessions` (30 rows; updated_at 2026-10-01 10:08 to 2026-11-23 10:43)

Chatbot conversations.

- Written by: chatbot. Refresh: at once.
- Good for questions like: "What did I ask before?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `session_id` | all | id | 04572f68-e36e-4fa3-a700-3a57b46f584d |
| `owner` | all | account email | (account email) |
| `title` | all | title | (hidden) |
| `created_at` | all | row made (IST) | 2026-10-04 23:14:34 |
| `updated_at` | all | row changed (IST) | 2026-10-01 10:54:08 |

#### `assistant_messages` (122 rows; created_at 2026-10-01 10:08 to 2026-11-18 23:00)

Chatbot messages with their cards.

- Written by: chatbot. Refresh: at once.
- Good for questions like: "(the owner's own only)"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `message_id` | all | id | 03cb54c8-f075-4cb8-b977-92e9a2ab7c58 |
| `session_id` | all | chat | 04572f68-e36e-4fa3-a700-3a57b46f584d |
| `role` | all | user or assistant | user 61, assistant 61 |
| `content_text` | all | what was typed or answered (private to its owner) | (hidden) |
| `language` | all | language | en 112, ta 6, tanglish 4 |
| `input_mode` | 61 | text or voice | text 54, voice 7 |
| `payload_json` | 61 | the answer card | (hidden) |
| `plan_json` | 61 | the plan | (hidden) |
| `scope_json` | 104 | the filters | {"period":"daily","zone":null,"dept":null,"cat":null,"tal… |
| `created_at` | all | row made (IST) | 2026-10-04 23:14:37 |

#### `assistant_feedback` (0 rows)

Thumbs on chatbot answers. Empty.

- Written by: chatbot. Refresh: at once.

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `feedback_id` | 0 | id |  |
| `message_id` | 0 | message rated |  |
| `insight_key` | 0 | insight rated |  |
| `owner` | 0 | account email |  |
| `rating` | 0 | 1 or -1 |  |
| `comment` | 0 | comment |  |
| `created_at` | 0 | row made (IST) |  |

#### `assistant_pins` (0 rows)

Pinned chatbot charts. Empty.

- Written by: chatbot. Refresh: at once.

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `pin_id` | 0 | id |  |
| `owner` | 0 | account email |  |
| `title` | 0 | title |  |
| `question` | 0 | question pinned |  |
| `plan_json` | 0 | the plan |  |
| `chart_json` | 0 | the chart |  |
| `scope_json` | 0 | the filters |  |
| `position` | 0 | order |  |
| `created_at` | 0 | row made (IST) |  |

#### `official_contacts` (48 rows)

GCC Who's who: Commissioner, control room, joint/deputy commissioners, chief and superintending engineers, zonal officers.

- Written by: loaded once from data/gcc-reference/official-contacts.json. Refresh: copied 28 Sep 2026.
- Good for questions like: "Who is the zonal officer of Adyar?"; "Who is the SE of storm water drains and the phone?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `contact_id` | all | id | 1 |
| `grp` | all | group | Commissioner |
| `dept_code` | 28 | department code | GCC-BLD |
| `zone_no` | 15 | GCC zone 1-15 (null = outside or not placed) | 1 |
| `region` | 3 | North, Central, South | South 1, North 1, Central 1 |
| `rank` | all | 1 = shown first | 1 36, 2 10, 3 2 |
| `name` | all | name | Dr. G.S. Sameeran, I.A.S. |
| `designation` | all | designation | Commissioner |
| `office` | all | office address | Ripon Building, Chennai-600003 |
| `phone` | all | PUBLISHED official phone | (hidden) |
| `email` | 46 | PUBLISHED official email | (hidden) |
| `source_url` | all | GCC Who's who page | https://chennaicorporation.gov.in… 48 |
| `retrieved_on` | all | copied on | 2026-09-28 48 |

#### `sources` (14 rows; last_run_at 2026-09-29 18:46 to 2026-11-26 01:15)

Registered sources (8 pipeline feeds, 4 live RSS, AGMARKNET, OCR).

- Written by: website. Refresh: at once.
- Good for questions like: "Which sources are failing?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `source_id` | all | id | 4 |
| `name` | all | name | Grievance portal |
| `url` | all | link | chennai_hospital_data (department export) |
| `kind` | all | kind | pipeline 8, rss 4, ocr 1, agmarknet 1 |
| `description` | all | description | Citizen complaints filed on this portal |
| `pipeline_key` | 8 | pipeline feed | grievance |
| `auth` | all | none or login | none 14 |
| `login_url` | 0 | SECRET (login page) |  |
| `user_field` | 0 | SECRET (form field) |  |
| `pass_field` | 0 | SECRET (form field) |  |
| `username` | 0 | SECRET (login name) |  |
| `secret_enc` | 0 | SECRET (password of a login source) |  |
| `session_enc` | 0 | SECRET (session) |  |
| `session_expires_at` | 0 | SECRET (session) |  |
| `refresh_minutes` | all | how often | 1440 9, 10 4, 0 1 |
| `enabled` | all | 1 = on | 1 14 |
| `status` | all | status | ok 7, new 5, failing 2 |
| `last_run_at` | 9 | last run | 2026-09-29 18:46:05 |
| `last_ok_at` | 9 | last success | 2026-09-29 18:46:05 |
| `last_error` | 3 | last error | GitHub did not start the run (HTT… 1, AGMARKNET now asks for a CAPTCHA … 1, A refresh is already running. 1 |
| `items_total` | all | items so far | 0 9, 22502 1, 1114 1, 188 1, 140 1, 85 1 |
| `created_by` | all | who added it | system 10, live-lane 3, (account email) 1 |
| `created_at` | all | row made (IST) | 2026-09-28 22:30:57 |
| `mapping` | 0 | field mapping (empty) |  |

#### `source_items` (1,549 rows; published_at 2026-05-18 19:22 to 2026-11-26 01:00)

Items the live lane and added links read (4 live RSS feeds + 1 removed).

- Written by: scheduler every 10 min (runDueSources). Refresh: 10 min.
- Good for questions like: "What did The Hindu publish in the last hour about Chennai?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `item_id` | all | id | 661 |
| `source_id` | all | sources.source_id | 21 |
| `hash` | all | dedupe hash | 003970c0c51591a3b101145df6fd956a223e7ff4 |
| `url` | all | link | https://www.thehindu.com/news/cities/chennai/police-seize… |
| `title` | all | headline (UNTRUSTED) | Police seize over 50 kg of gutkha in Ponneri, three arres… |
| `body` | 939 | feed text (UNTRUSTED) | Police said the accused procured gutkha from Andhra Prade… |
| `published_at` | 1,527 | WHEN THE OUTLET PUBLISHED IT (IST) | 2026-05-18 19:22:34 |
| `fetched_at` | all | WHEN THE SITE FIRST SAW IT (within about 10 min for the 4 live feeds) | 2026-09-28 23:00:05 |
| `lang` | all | language | en 1548, ta 1 |
| `category_code` | 276 | category code (35; ref_categories) | CRIME_VIOLENT |
| `category_label` | 276 | category | Violent crime & crimes against women |
| `dept_code` | 276 | department code | POL-GCP |
| `category_conf` | 276 | confidence | 0.6 238, 0.75 37, 0.9 1 |
| `matched_terms` | 276 | words matched | murder, murdered |
| `zone_no` | 233 | GCC zone 1-15 (null = outside or not placed) | 9 |
| `ward_no` | 192 | GCC ward 1-200 | 126 |
| `taluk_code` | 194 | revenue taluk code TLK-… (ref_taluks) | TLK-MYL |
| `place` | 237 | place | Pattinapakkam |
| `place_conf` | 237 | confidence | 0.8 192, 0.6 43, 0.5 2 |
| `lat` | 235 | latitude | 13.0269 |
| `lon` | 235 | longitude | 80.2785 |
| `place_v` | all | version | 2 1549 |
| `is_incident` | all | a civic issue | 0 1273, 1 276 |
| `origin` | all | fetch | fetch 1549 |

#### `source_runs` (1,515 rows; started_at 2026-09-28 22:35 to 2026-11-26 01:15)

Each fetch of each source.

- Written by: scheduler. Refresh: 10 min.
- Good for questions like: "When did the DT Next feed last fail?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `run_id` | all | id | 20 |
| `source_id` | all | sources.source_id | 5 |
| `started_at` | all | start | 2026-09-29 16:57:05 |
| `finished_at` | all | end | 2026-09-28 22:35:51 |
| `ok` | all | 1 = worked | 1 1474, 0 41 |
| `http_status` | 1,440 | HTTP status | 200 1440 |
| `items_seen` | all | read | 370 |
| `items_new` | all | new | 309 |
| `login` | all | login used | none 1515 |
| `attempts` | all | tries | 22 |
| `error` | 46 | error | fetch failed |
| `triggered_by` | all | scheduler or account email | scheduler 1494, (account email) 13, (account email) 7, (account email) 1 |

#### `mandi_market_prices` (7,163 rows; date 2026-09-15 to 2026-10-06)

Daily prices at 8 Chennai markets. STALE: last day 6 Oct 2026 (AGMARKNET asks for a CAPTCHA; DATA_GOV_API_KEY is not set).

- Written by: AGMARKNET collector / ogdprices. Refresh: daily when it works (off).
- Good for questions like: "Tomato price at Anna Nagar on 6 October?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `date` | all | report day | 2026-09-18 |
| `market` | all | Uzhavar Sandhai market | Anna Nagar 1530, K.K. Nagar 1350, Nanganallur 1244, Pallavaram 1068, Guduvancheri 785, Kundrathur 605, Medavakkam 432, Ambattur 149 |
| `commodity` | all | item | Amaranthus |
| `variety` | all | variety | Banana - Green |
| `cmdt_group` | all | group | Vegetables |
| `min_price` | all | min Rs/quintal | 4000 |
| `max_price` | all | max | 4000 |
| `modal_price` | all | modal (divide by 100 for Rs/kg) | 4000 |
| `arrival` | all | tonnes | 0.02 |
| `fetched_at` | all | when it was read (IST) | 2026-09-29 11:15:20 |

#### `mandi_prices` (360 rows; date 2026-09-24 to 2026-10-26)

Daily averages for Tamil Nadu and Chennai markets. STALE: last day 26 Oct 2026.

- Written by: AGMARKNET collector. Refresh: off.
- Good for questions like: "Onion price in Tamil Nadu in October?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `date` | all | day | 2026-09-24 |
| `scope` | all | tamil_nadu or chennai_markets | tamil_nadu 243, chennai_markets 117 |
| `commodity` | all | item | Groundnut |
| `cmdt_group` | all | group | Vegetables 168, Cereals 102, Oil Seeds 84, Pulses 6 |
| `price` | all | Rs/quintal | 7900 |
| `arrival` | all | tonnes | 0.15 |
| `msp` | 192 | minimum support price | 7517 56, 2441 29, 5708 28, 2410 21, 2900 18, 5205 17, 4023 17, 8450 6 |
| `fetched_at` | all | when it was read (IST) | 2026-09-28 22:40:29 |

#### `mandi_weekly` (120 rows; week_start 2026-08-01 to 2026-10-24)

Weekly price trend of 5 vegetables. STALE: last week 24 Oct 2026.

- Written by: AGMARKNET collector. Refresh: off.
- Good for questions like: "Is brinjal up on the year?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `week_start` | all | week | 2026-08-01 |
| `week_label` | all | in words | 1-8 Aug 2026 |
| `scope` | all | tamil_nadu or chennai_region | tamil_nadu 60, chennai_region 60 |
| `commodity` | all | item | Tomato 24, Potato 24, Onion 24, Brinjal 24, Banana 24 |
| `price` | all | Rs/quintal | 6000.55 |
| `districts` | all | districts averaged | 1 50, 37 36, 36 21, 3 10, 35 3 |
| `chg_week` | 100 | size of the change on the week, % | 12.4 |
| `chg_month` | 103 | on the month, % | 16.53 |
| `chg_year` | 78 | on the year, % | 33.37 |
| `fetched_at` | all | when it was read (IST) | 2026-09-29 11:09:41 |

#### `traffic_snaps` (54 rows; at 2026-11-24 22:26 to 2026-11-26 01:21)

One row per 10-minute TomTom reading (Chennai totals).

- Written by: lib/city/history.ts recordTraffic (the PC that saves only). Refresh: 10 min.
- Good for questions like: "When was the worst jam yesterday?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `id` | all | row id | 1 |
| `at` | all | reading time | 2026-11-24 22:26:00 |
| `spots` | all | stretches TomTom reported | 100 |
| `jams` | all | jammed | 5 |
| `very` | all | very congested | 1 |
| `congested` | all | congested | 3 |
| `slow` | all | slow | 1 |
| `closed` | all | closed | 86 |
| `flooded` | all | flooded | 0 54 |
| `accidents` | all | accidents | 0 54 |
| `works` | all | road works | 11 23, 9 19, 12 6, 10 6 |
| `delay_min` | all | total delay, minutes | 13 |
| `zones` | all | JSON zone -> jams | {"9":1,"12":2,"15":2} |
| `created_at` | all | row made (IST) | 2026-11-24 22:26:36 |

#### `traffic_days` (1,056 rows; day 2026-11-24 to 2026-11-26)

One row per road stretch per day.

- Written by: recordTraffic. Refresh: 10 min.
- Good for questions like: "Which roads were most congested over the last 2 days?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `id` | all | row id | 58 |
| `day` | all | day (IST) | 2026-11-25 845, 2026-11-26 106, 2026-11-24 105 |
| `stretch` | all | stretch key | nh716a, sh51¦janappanchatram¦janappanchatram |
| `name` | all | "Road: from → to" | Anna Salai / Eldams Road → Thiruvalluvar Road |
| `road` | 179 | road number | SH113 |
| `zone` | 930 | zone | 1 |
| `zone_name` | all | zone name | Teynampet |
| `ward` | 877 | ward | 123 |
| `lat` | all | latitude | 13.03904 |
| `lon` | all | longitude | 80.24963 |
| `seen` | all | 10-minute readings that saw it jammed | 1 |
| `very` | all | readings very congested | 1 |
| `closed` | all | readings closed | 0 |
| `flooded` | all | readings flooded | 0 1056 |
| `accidents` | all | readings with an accident | 0 1056 |
| `max_delay_s` | all | worst delay, seconds | 223 |
| `sum_delay_s` | all | sum of delays | 223 |
| `max_len_m` | all | longest queue, m | 280 |
| `first_at` | all | first seen | 2026-11-24 22:26:00 |
| `last_at` | all | last seen | 2026-11-24 22:26:00 |
| `worst` | all | worst level that day | very 537, closed 256, congested 191, slow 72 |

#### `petitions` (10 rows; created_at 2026-11-09 22:31 to 2026-11-23 17:11)

Manu Desk paper petitions.

- Written by: Manu Desk. Refresh: at once.
- Good for questions like: "How many petitions were filed this month, by department?"; "Which petitions are past their due date?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `id` | all | row id | 17 |
| `source` | all | counter | counter 10 |
| `status` | all | reading, read_failed, needs_check, filed | filed 9, needs_check 1 |
| `pages` | all | JSON photo names (data/private-uploads/petitions, locked) | (hidden) |
| `uploaded_by` | all | users.id | 39 10 |
| `uploaded_email` | all | PRIVATE | (hidden) |
| `citizen_user_id` | 0 | PRIVATE (citizen account; never set) |  |
| `reading` | all | PRIVATE, locked (what the AI read) | (locked) |
| `read_model` | all | model | claude-opus-5-5 8, paddle+claude-opus-5-5 2 |
| `read_ms` | all | ms | 11999 |
| `read_error` | 0 | reading error |  |
| `name` | 9 | PRIVATE, locked | (locked) |
| `mobile` | 8 | PRIVATE, locked | (hidden) |
| `address` | 9 | PRIVATE, locked | (locked) |
| `area` | 9 | street and area (no door number) | (hidden) |
| `ward_number` | 9 | ward | 52 |
| `dept_code` | 9 | department code | GCC-SWM |
| `category_code` | 9 | category code (35; ref_categories) | SOLID_WASTE |
| `urgent` | all | urgent | 0 9, 1 1 |
| `subject` | 9 | petition's subject (may name the person) | (hidden) |
| `problem` | 9 | problem in one line | (hidden) |
| `request` | 9 | what is asked | (hidden) |
| `full_text` | 9 | PRIVATE, locked | (locked) |
| `petition_date` | 9 | date on the paper dd.mm.yyyy | 15.09.2026 |
| `language` | 9 | language of the paper | ta 5, en 4 |
| `complaint_code` | 9 | number given | 2026-074AUR |
| `complaint_id` | 9 | complaints.id | 16168 |
| `incident_id` | 9 | incident id (INC-YYYYMMDD-XXXXXX; INC-W-<complaint code> for a website or Manu filing) | INC-W-2026-074AUR |
| `attached` | all | joined an existing case | 0 10 |
| `filed_by` | 9 | desk login | (account email) |
| `filed_at` | 9 | approved | 2026-11-09 22:32:59 |
| `due_at` | 9 | due | 2026-11-24 22:32:59 |
| `reject_reason` | 0 | why rejected |  |
| `created_at` | all | row made (IST) | 2026-11-09 22:31:52 |
| `updated_at` | all | row changed (IST) | 2026-11-09 22:32:59 |
| `recurrence` | all | times the writer came before | 0 10 |

#### `petition_sms` (3 rows; created_at 2026-11-10 01:14 to 2026-11-10 21:48)

SMS to petitioners (test mode).

- Written by: Manu Desk. Refresh: at once.
- Good for questions like: "Was the receipt SMS sent?"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `id` | all | row id | 1 |
| `complaint_code` | all | petition number | 2026-181GCF |
| `kind` | all | received or closed | received 3 |
| `status` | all | waiting, test, sent, failed | test 3 |
| `result` | 0 | done or rejected |  |
| `detail` | 0 | gateway detail |  |
| `attempts` | all | tries | 1 3 |
| `tried_at` | all | last try | 2026-11-10 01:14:21 |
| `sent_at` | all | sent | 2026-11-10 01:14:21 |
| `created_at` | all | row made (IST) | 2026-11-10 01:14:21 |

#### `complaints` (8,123 rows; created_at 2026-06-27 03:11 to 2026-11-10 21:48)

The website's own complaints. 8,110 are generated history that stops on 24 Sep 2026; 13 are real filings (9 petitions, 4 online) up to 10 Nov. NOT the live complaint feed: use events where source='grievance'.

- Written by: citizen portal, Manu Desk. Refresh: at once.
- Good for questions like: "(count from incidents/events, never from here)"

| Column | Filled | Meaning | Example or values |
|---|---|---|---|
| `id` | all | row id | 8055 |
| `complaint_code` | all | complaint number (2026-000KPV) | 2026-000KPV |
| `user_id` | 4 | citizen account (PRIVATE) | (hidden) |
| `initials` | 4,158 | initials (PRIVATE) | (hidden) |
| `first_name` | all | PRIVATE, locked | (hidden) |
| `last_name` | 3,275 | PRIVATE, locked | (hidden) |
| `gender` | all | PRIVATE | (hidden) |
| `street_address` | all | PRIVATE, locked | (hidden) |
| `pincode` | 4,091 | home PIN (PRIVATE) | (hidden) |
| `mobile_number` | 8,122 | PRIVATE, locked | (hidden) |
| `phone_number` | 0 | PRIVATE |  |
| `email` | 3,713 | PRIVATE, locked | (hidden) |
| `zone_id` | all | zones.id | 1 |
| `ward_number` | all | ward | 100 |
| `locality_id` | 0 | legacy, empty |  |
| `street_id` | 0 | legacy, empty |  |
| `specific_location` | 4,037 | landmark (PRIVATE with the address) | (hidden) |
| `latitude` | 6,983 | latitude | 13.0915588 |
| `longitude` | 6,983 | longitude | 80.2127266 |
| `department_id` | all | departments.id | 1 |
| `complaint_type_id` | 0 | legacy, empty |  |
| `title` | all | title | New Drain Construction |
| `description` | all | the citizen's own words (PRIVATE text; 8 rows hold a phone number) | (hidden) |
| `media_path` | 3,664 | photo path | (hidden) |
| `is_anonymous` | all | filed anonymously | 0 7452, 1 671 |
| `needs_manual_review` | all | routing to check | 0 5784, 1 2339 |
| `status` | all | status | Verified by Collector 6529, Rejected 593, In Progress 508, Pending Approval 279, Approved by Department Officer 107, Completed - Pending Collector Ver… 93, Complaint Filed 14 |
| `rejected_stage` | 593 | who rejected | Department Officer 458, Collector 135 |
| `remarks` | 593 | rejection remark | (hidden) |
| `created_at` | all | row made (IST) | 2026-09-24 20:15:41 |
| `updated_at` | all | row changed (IST) | 2026-09-24 20:15:41 |
| `complaint_subtype_id` | 8,114 | complaint_subtypes.id | 1 |
| `gcc_area_id` | 7,125 | gcc_areas.id | 1 |
| `gcc_locality_id` | 7,125 | gcc_localities.id | 1 |
| `gcc_street_id` | 7,125 | gcc_streets.id | 1 |
| `manual_street_name` | 989 | typed street | (hidden) |
| `street_type` | 456 | street type | High Road |
| `ward_source` | all | map_boundary or user_selected | map_boundary 6983, user_selected 1140 |
| `location_pincode` | 4,879 | PIN of the problem | (hidden) |
| `is_synthetic` | all | 1 = generated (test) data | 1 8110, 0 13 |

#### `complaint_status_history` (44,748 rows; created_at 2026-06-27 03:11 to 2026-11-10 21:48)

Status steps of those complaints (legacy).

- Written by: portal. Refresh: at once.

Columns: `id`, `complaint_id`, `status`, `stage`, `remarks`, `changed_by`, `created_at`.

#### `users` (33 rows)

Accounts. SECRET: never read.

- Written by: website. Refresh: at once.

Columns: `id`, `email`, `password_hash`, `role`, `department_id`, `dept_code`, `is_active`, `created_at`, `updated_at`, `email_verified_at`, `email_verification_exempt`, `token_version`.

#### `user_profiles` (5 rows)

Citizen profiles. PRIVATE: never read.

- Written by: website. Refresh: at once.

Columns: `id`, `user_id`, `first_name`, `last_name`, `gender`, `date_of_birth`, `mobile_number`, `mobile_verified`, `alternate_email`, `door_no_and_street`, `area`, `locality`, `pincode`, `zone_id`, `ward_number`, `aadhaar_number_encrypted`, `aadhaar_last4`, `profile_photo`, `created_at`, `updated_at`.

#### `password_resets` (0 rows)

OTPs. SECRET: never read. Empty now.

- Written by: website. Refresh: at once.

Columns: `id`, `user_id`, `purpose`, `identifier`, `otp_hash`, `expires_at`, `attempts`, `used`, `created_at`.

### 1.7 Reference and legacy tables in the durable store

#### `departments` (16 rows)

The portal's 16 departments (complaints.department_id).

- Written by: seed. Refresh: never.
- Good for questions like: "What does the Health Department handle?"

Columns: `id`, `name`, `description`.

#### `police_stations` (60 rows)

60 stations (also in ref_facilities). No phones anywhere.

- Written by: migration. Refresh: never.
- Good for questions like: "Which stations are in Adyar taluk?"

Columns: `station_code`, `station_name`, `taluk_code`, `latitude`, `longitude`.

#### `police_incident_reports` (6,183 rows; reported_datetime 2026-06-28 00:39 to 2026-09-25 17:43)

LEGACY generator copy (28 Jun to 25 Sep 2026); nothing on the site reads it. Use events where source='police'.

- Written by: migration. Refresh: never.

Columns: `report_id`, `incident_datetime`, `reported_datetime`, `station_code`, `taluk_code`, `locality`, `latitude`, `longitude`, `category`, `title`, `description`, `persons_affected`, `injured_count`, `fatalities`, `vulnerable_victim`, `weapon_involved`, `road_blocked`, `blockage_minutes`, `crowd_estimate`, `is_weather_related`, `source`, `linked_grievance_code`, `status`, `response_minutes`, `closed_datetime`.

#### `zones` (15 rows)

15 zones with ward ranges.

- Written by: seed. Refresh: never.

Columns: `id`, `zone_number`, `zone_name`, `ward_start`, `ward_end`.

#### `zone_wards` (200 rows)

Ward to zone.

- Written by: import. Refresh: never.
- Good for questions like: "Which zone is ward 120 in?"

Columns: `ward_number`, `zone_id`, `source`, `source_version`.

#### `area_wards` (2,141 rows)

Area to ward, derived from OpenStreetMap geocodes (not official).

- Written by: import. Refresh: never.
- Good for questions like: "Which wards are in this area?"

Columns: `area_id`, `ward_number`, `is_primary`, `confidence`, `source`, `source_version`, `created_at`.

#### `gcc_areas` (250 rows)

GCC areas (complaint form).

- Written by: import. Refresh: never.

Columns: `id`, `gcc_id`, `name`, `zone_id`.

#### `gcc_localities` (4,883 rows)

GCC localities.

- Written by: import. Refresh: never.
- Good for questions like: "Which area is this locality in?"

Columns: `id`, `gcc_id`, `name`, `area_id`.

#### `gcc_streets` (53,800 rows)

53,800 GCC streets.

- Written by: import. Refresh: never.
- Good for questions like: "Which locality is this street in?"

Columns: `id`, `gcc_id`, `name`, `locality_id`.

#### `localities` (32 rows)

32 seed localities (legacy).

- Written by: seed. Refresh: never.

Columns: `id`, `zone_id`, `name`.

#### `streets` (192 rows)

192 seed streets (legacy).

- Written by: seed. Refresh: never.

Columns: `id`, `locality_id`, `name`.

#### `locality_wards` (0 rows)

Empty by design.

- Written by: -. Refresh: never.

Columns: `locality_id`, `ward_number`, `confidence`, `source`, `source_version`, `created_at`.

#### `complaint_categories` (18 rows)

GCC complaint categories (18).

- Written by: import. Refresh: never.

Columns: `id`, `name`, `sort_order`, `is_active`, `source`, `source_fetched_at`, `created_at`, `updated_at`.

#### `complaint_subtypes` (328 rows)

GCC sub-complaints (328) with the department mapping.

- Written by: import. Refresh: never.
- Good for questions like: "Which department handles street dogs?"

Columns: `id`, `category_id`, `gcc_id`, `label`, `department_id`, `mapping_status`, `is_frequent`, `frequent_order`, `sort_order`, `is_active`, `created_at`, `updated_at`.

#### `complaint_types` (22 rows)

Legacy types (22).

- Written by: seed. Refresh: never.

Columns: `id`, `name`, `department_id`, `is_frequent`.

#### `reference_data_sources` (6 rows)

Where each reference import came from.

- Written by: import. Refresh: never.

Columns: `dataset`, `source_url`, `source_label`, `is_official`, `fetched_at`, `row_count`, `notes`, `updated_at`.

#### `schema_migrations` (11 rows)

Internal.

- Written by: -. Refresh: never.

Columns: `filename`, `applied_at`.

#### `_changes` (0 rows)

Internal queue of rows waiting to go to AWS.

- Written by: store. Refresh: -.

Columns: `id`, `t`, `k`.

#### `_keys` (31 rows)

Internal keys.

- Written by: store. Refresh: -.

Columns: `t`, `key`.


---

## 2. Derived objects (computed on the site)

### 2.1 Build hooks (`lib/collector/derive.ts`, `lib/manu/cases.ts`, `lib/live/imd.ts`), in order

| Hook | Effect on the in-memory build |
|---|---|
| `cmwssb-reservoirs@1` | deletes all `lake_*` readings and `lake_level` alerts, writes CMWSSB's six reservoirs (Poondi, Cholavaram, Puzhal, Kannankottai Thervoy Kandigai, Chembarambakkam, Veeranam); `observation_signals.days_to_full` filled |
| `readable-headlines@3`, `news-headlines@1` | `incidents.headline` from the records' own words |
| `places-from-reports@2` | places unplaced open incidents from their text (`_placed`) |
| `news-media-only@2` | drops news-only incidents from non-news sites |
| `report-kinds@4` | drops news-only incidents that are forecasts, government work, roundups, opinion |
| `news-sanity@7` | history items, gas deaths, same-story merges, animal deaths, statewide counts (`dead_reported`, `injured_reported`) |
| `news-desk@1` | better English headlines of Tamil news; drops sport/film/feature incidents (later verdicts laid on as they come) |
| `website-cases@1` | adds petitions and online complaints as `INC-W-…` incidents |
| `incident-clusters@4` | `cluster_id`, `cluster_size` |
| live IMD hook | the newest 10-minute warning over `imd_warning_level` |

### 2.2 Objects the UI reads

| Object | Function (file) | API | What it holds |
|---|---|---|---|
| Overview | `overview(period, zone, dept, focus)` (collector/intel.ts) | /api/collector/overview | KPI tiles, severity, zones, map pins, tasks, news (250), stories, feeds, environment, bell |
| KPI tiles | `kpiBlock(scope, now)` (intel.ts) | in overview | severe, complaints, ongoing, resolved, each with the period before |
| Waiting for the Collector | `awaitingCheck`, `awaitingByDept` (intel.ts) | in overview | cases left to check |
| Case detail | `incident(id, {dept})` (intel.ts) | /api/collector/incidents/[id] | facts, group, every report in time order with outlet and time, decisions, officer step, department reports, emails, contacts |
| Lists, search | `list(f)`, `search(text)`, `wordsWhere` (intel.ts) | /list, /search | incidents; zones, departments, incidents by text |
| Area snapshot | `areaSnapshot(zone, scope, now)` | in overview | zone figures + zonal officer |
| Insights pages | `insights(period, zone, dept, focus, part)` (collector/insights.ts) | /insights | briefing (with `book` from `briefbook.ts briefingBook`), gaps, trends (12 weeks, 6 months), taluks, patterns (anomalies + hotspots), review (`locreview.reviewLocations`), markets |
| Pattern detail | `pattern(q)` (insights.ts) | /pattern | one spike, hotspot or category in depth |
| News list | `newsStories(period, now)`, `newsLeftOut(period, now)`, `newsArticles(ids)` (intel.ts) | /news | stories with every outlet and time, act/know verdict; what the desk left out; article text |
| News desk | `deskTick`, `sweep`, `judge` (newsdesk.ts); `deskOf`, `deskBook` (deskbook.ts) | - | AI verdict act/know/skip per headline; 3,077 kept in `data/aws-cache/newsdesk.json`; no TypeScript file named newstime exists |
| Developing stories | `stories(scope, now, user)` (storyai.ts), `newsUnits`, `threadOf` (threads.ts) | /stories | threads with stages and days; last list in `stories-last.json` (12) |
| Reports differ | `periodConflicts(period, now, user)`, `storyConflicts(ids, title, user, id)` (conflicts.ts) | /conflicts | what outlets state differently; verdicts in `data/news-verdicts.json` (250) |
| Next door | `nearby(now, user)`, `nearbyDetail(id, now, user)` (nearby.ts) | /nearby | Tiruvallur, Kancheepuram, Chengalpattu news (405 items in `nearby-news.json`), hourly |
| AI briefs | `dayBrief`, `deptBrief`, `trendBrief`, `patternBrief` (aibrief.ts) | /brief | cached in `aibrief.json` (1,500 entries: nearby 274, conflicts 254, story-steps 235, story-line 235, day2 225, story-groups 154 …) |
| Case analysis | `analyseIncident(id, user)`, `analyseStory(ids, user)` (analysis.ts) | /incidents/[id]/analysis, /news/analysis | cached in `analysis.json` (94) |
| Alert lane | `alertLane(now)`, `sachetChennai()` (alerts.ts) | /alerts | IMD + SACHET (NDMA CAP) + news alerts, levels |
| Locations to review | `reviewLocations(rows, wards, resolve)` (locreview.ts) | in insights | unplaced cases judged |
| Environment block | inside `overview` (`bottom`: rain, aqi, lakes, 24 rain days) | in overview | stations with series |
| Reservoirs | `cmwssbLakes(now, days)` (lakes.ts) | in overview | capacity, level, storage, inflow, outflow, rain, last year |
| Market prices | `mandiMarkets()`, `mandi(scope)`, `mandiWeekly(scope)` (sources.ts); `ogdMarketDay`, `ogdReadDays` (ogdprices.ts) | in insights | see staleness |
| Added sources | `addedItems`, `sourceItems`, `listSources`, `collectionStatus` (sources.ts) | /sources | live RSS items |
| Focus, change, trends | tool `focus_trends`, `change_drivers`, `category_trends` (assistant/queries.ts, tools.ts) | - | where to concentrate, what moved |
| Officer console | `officerOverview`, `grievanceList`, `grievanceDetail`, `deptInsights` (lib/officer) | /api/officer/* | dept-locked; `deptInsights` has modules police, **hospital**, lakes, pwdworks, pwdfield, weather, air, markets |
| Ask the Map | `world()` (lib/map/world.ts), `askMap` (ask.ts), `conditionsNear` | /api/map/* | spatial questions over every layer |
| Meaning search | `hybridSearch(kind, query, filters)` (assistant/lance.ts), `data/embeddings` (incident vectors, e5-base) | - | find incidents and news by meaning; `data/lancedb` is empty now, so the older index is used |

---

## 3. Live and scraped lanes

| Lane | Code | Source | Kept | Cadence | Key |
|---|---|---|---|---|---|
| IMD district warning + nowcast | `lib/live/imd.ts liveImdTick` | IMD GIS WFS, RMC pages | in-memory build only; state in `lib/live/state.ts live()` | 10 min (scheduler) | none |
| News RSS | `lib/live/news.ts ensureLiveNews`, `sources.ts runDueSources` | The Hindu, TOI, DT Next, TNIE | `source_items` (about 1,550; 275 read as civic issues) | 10 min | none |
| News desk | `newsdesk.ts deskTick` | AI (Claude Haiku) | `newsdesk.json` | each minute, small batches | AI |
| Live traffic | `lib/rehearsal/traffic.ts liveIncidents`, `lib/city/traffic.ts trafficNow` | TomTom incidentDetails v5 | memory 5 min (trafficNow 60 s) | on demand | `TOMTOM_API_KEY` set |
| Traffic tiles | `flowTile` | TomTom flow | memory 2 min | on demand | same |
| Traffic history | `lib/city/history.ts recordTraffic`, `trafficHistory(from, to, zone)`, `trafficByHour` | the above | `traffic_snaps` (53 readings at 01:15), `traffic_days` (1,055), since 24 Nov 22:26 | 10 min, this PC only | same |
| City answer | `lib/city/now.ts cityNow(topic, {zone, focus, rain, rank})` | traffic + rehearsal + impacts | memory 90 s fresh, 5 min stale | on demand | - |
| Rain now | `lib/rehearsal/cfmlive.ts liveRain`, `heavyNow` | Chennai Flood Monitor AWS | memory 10 min | on demand | none |
| Rain rehearsal | `lib/rehearsal/engine.ts rehearsalState`, `pastRains`, `planFor`, `facilityReach` | store + data/roads | memory per build | hourly (at quiet moments) | - |
| Rain impacts | `lib/rehearsal/impacts.ts impacts(lens)` with lens traffic, power or metro | store + layers; **power hours and train delays are GENERATED** (seeded from complaints) | memory per build | per build | - |
| SACHET (NDMA) | `alerts.ts sachetChennai` | CAP RSS | memory 15 min | on demand | none |
| Rain forecast by zone | `lib/map/forecast.ts rainForecast` | Open-Meteo hourly | memory 30 min | on demand, Ask the Map only | none |
| Reservoirs | `lakes.ts cmwssbLakes` | cmwssb.tn.gov.in/lake-level | `data/aws-cache/cmwssb-lakes.json` (21 days, 5 to 25 Nov) | hourly | none |
| Prices | `sources.ts collectMandiMarkets`, `ogdprices.ts` | AGMARKNET / data.gov.in | `mandi_*` | **not updating**: AGMARKNET asks for a CAPTCHA; `DATA_GOV_API_KEY` is not in `.env` | missing |
| Next-door news | `nearby.ts` | Google News RSS | `nearby-news.json` | hourly | none |
| Article full text | `fulltext.ts fullText` | publisher pages (robots checked) | `news-fulltext.json` (8) | on demand | none |
| Jarvis web reader | `lib/thunai/web/*` (list in `config/jarvis-web-domains.json`) | 6 news sites, SACHET, Wikipedia | memory | on demand | none |
| CPCB air | `cpcb_air_quality_collector/` on this PC | CPCB CCR map (Playwright) | CSV -> GitHub branch -> build | hourly (often fails: 11:00 reading still the newest at 00:12) | none |
| CFM-DSS | `cfm_dss_collector/` on this PC | chennaifloodmonitor.tn.gov.in | CSV + `raw_cache` -> build; gate discharge and bulletins read straight from the CSV/JSON by `rehearsal/source.ts` | hourly | none |
| IMD city weather | `imd_weather_collector/` (GitHub) | city.imd.gov.in | build | hourly, readings twice a day | none |

CFM-DSS gate file `cfm_dss_gate_operations_chennai.csv` (416 rows): columns gate_site_id, gate_site_name, observed_at, gates_open_count (always empty), discharge, inflow. Discharge exists only here, not in the build.

---

## 4. Files on this PC only

**The generators' CSVs here are old copies and the website does not read them**: it reads the build. They stop at 4 Oct 2026.

| Path | What | Read by the site |
|---|---|---|
| `chennai_hospital_data/chennai_hospital_health_data.csv` | 1,620 rows, 8 Apr to 4 Oct 2026: hospital_name, date, taluk, total_beds, occupied_beds, bed_occupancy_rate, outpatient_count, emergency_cases, disease_type, disease_cases, vaccination_coverage, medicine_availability, doctor_count, nurse_count, ambulance_available, health_alert, alert_level | No. The current data is `observations` source `hospital` in the build (loader `district_intel/dintel/loaders/hospital.py`) |
| `pwd_dataset_generator/data/pwd/*.csv` | incidents 2,019, tasks 697, works 242, water levels 3,240, assets 87, offices 21, announcements 96 | No (build: `events`, `actions`, `pwd_works`, `ref_facilities`, `ref_offices`, `documents`) |
| `police_dataset_generator/output/*.csv` | reports, stations, ground truth (to 4 Oct) | No |
| `data/datasets/grievances.csv` (16,287), `grievance_status_history.csv` (92,503) | complaints to 4 Oct, **plain names, mobiles, emails, addresses** | No. Never give to an AI |
| `exports/complaints.json`, `.csv`, `.xlsx` | portal export of 2 Oct with plain citizen details (also a copy of every field) | No. Never give to an AI |
| `officer-accounts.local.csv` | officers' user names and **passwords** | No. Never read |
| `district_intel/output/*` | last local pipeline run (17 Oct), 164 MB sqlite, curated CSVs | Only `state/grievance_rain_days.txt` (rain days) by `rehearsal/source.ts` |
| `cfm_dss_collector/data` | gate operations, `raw_cache` bulletins | Yes, `rehearsal/source.ts` |
| `data/gcc-reference/` | areas-localities (250 areas, 4,883 localities), streets (53,800), complaint types, official-contacts.json (48), intel-reference.json (35 categories with keywords, 18 taluks, 81 gazetteer places) | `nlp.ts`, migrations |
| `data/boundaries/gcc-wards.geojson` | 200 ward outlines (DataMeet, not official) | `lib/wards.ts loadWardDataset`, `resolveWard(lat, lon)` |
| `data/layers/` (31 files) | OpenStreetMap: schools 647, colleges 187, hospitals and clinics 1,441, fire stations 16, police 112, rail/metro 235, places 582, roads 10,988, waterways 41, water bodies 360, underpasses 33, substations 75, banks 482, ATMs 412, worship 991, parks 616, water tanks 154, toilets 138, bus stations 102, government offices 179, pharmacies 292, fuel 230, markets 39, cemeteries 97, wine shops 73, ration shops 18; `population.json` (200 wards, 6,567,612 people, Kontur 2023); `transit.json` (108 stations, 10 lines, trains an hour, not a timetable) | `lib/map/world.ts`, `rehearsal/impacts.ts` |
| `data/roads/` | routable road graph (123,062 nodes, 157,419 edges, 11,295 km), elevation | `rehearsal/graph.ts`, `engine.ts` |
| `data/studio/` | Collector's datasets: "Chennai Relief Shelter Locations" (136 rows, 12 columns, **column c4 = contact name and phone, role person**) and "Chennai Metro Daily Station Ridership by Ticket Type" (13,480 rows, 24 Jan to 23 Nov 2026, station code and 20 ticket columns); one unfinished pick (GCC site); 1 dashboard (`dashboards.json`) | `lib/studio/store.ts getMeta/getRows/listDatasets`, `dashboards.ts` |
| `data/studio-samples/`, `docs/studio-demo/data/` | demo CSV/XLSX (fever surveillance, SWD desilting register, hospital beds, PDS ration stock; metro ridership, flood spots by ward, rainfall 1993-2023, reservoir 2004-2019, CPCB 2021-2026, ward property tax) | only if added in Data Studio |
| `data/ocr/`, `manu_paddle_ocr/` | OCR models and the Paddle reading server | Manu Desk |
| `data/private-uploads/petitions/*.jpg` (8) | petition photos, locked | Manu photo route only. Never give to an AI |
| `uploads/officer-reports/<dir>/*` | officers' completion photos (3 folders) | officer console |
| `data/thunai/` | Jarvis memory (notes, reminders, habits, recent words per user), `audit.jsonl` (842), telemetry, AI ledgers and budget | Jarvis only. A user's own private words |
| `data/embeddings/`, `data/lancedb/` (empty), `data/i18n/`, `data/eval/`, `data/aws-cache/dryrun*` | search vectors, translations, eval sets, test copies | internal |
| `data/aws-cache/map-questions.jsonl` (11,247) | every Ask the Map question with its plan | internal |
| `data/map-lists/` | officers' own place lists | does not exist yet |
| `chennai_news_pipeline/data` | raw and processed news to 4 Oct | No |

Manu petitions: `petitions` table (9 filed, 1 needs_check) plus the photos above. `lib/manu/petitions.ts deskList, petitionDetail` (Manu desk login only), case id in `petitions.incident_id`.

Rain rehearsal outputs: nothing is written to disk; `rehearsalState()` returns flood streets, reach, chokes, dry schools, trigger, plan and tasks, cached per build; approved tasks go to `followups`.

---

## 5. Contacts

| Who | Where | Detail |
|---|---|---|
| GCC officials (real, published) | `official_contacts` (durable, 48 rows, copied 28 Sep 2026 from chennaicorporation.gov.in "Who's who"; same as `data/gcc-reference/official-contacts.json`) | columns contact_id, grp, dept_code, zone_no, region, rank, name, designation, office, phone, email, source_url, retrieved_on. Groups: Zonal Officers 15, Superintending Engineers 9, Chief Engineers 5, Others 5, Joint/Deputy Commissioners 4, Regional Deputy Commissioners 3, Health 3, Revenue 2, Commissioner 1, Control room 1 |
| Storm water drain officers | `official_contacts` where dept_code = 'GCC-SWD': ONE row, contact 12, the Superintending Engineer (SWD). The same person is also in contact 18 (Mechanical i/c). Ward-level "AE, Zone n" appear only as post names in `events.officer` / `incidents.officer` (no phone) | |
| PWD officers | `ref_offices` (build, 21 rows: 12 PWD-WRD, 9 PWD-BLD) columns office_id, office_name, wing, officer_name, designation, phone, email, dept_code, taluks | **GENERATED**: phones are +91-44-0000-1007 … 1147, emails @example.tn.gov.in. Flood Monitoring Cell & Control Room = PWD-OFF-019 |
| Department posts and escalation | `ref_departments` (27) head, route (for example GCC-SWD: AE → EE → SE → Chief Engineer) | posts, no people |
| Duty phones | Only contact 2 "GCC Control Room, 24 hrs complaints cell 1913" and the fixed "1913" in the UI (Header, Footer, Overlays). No duty roster exists anywhere | |
| Departments with NO people in the data | POL-GCP, PWD-WRD, PWD-BLD (except the generated offices), HLT-DMS, CMWSSB, TANGEDCO, TNPCB, DIST-DM, DIST-REV | the console says "not on the GCC Who's who page. Head: …" |
| Officers on a case | `dept_assignments` (7, with officer_phone), `incidents.officer`, `actions.owner` | |
| Relief shelter contacts | Data Studio dataset column c4 (names and phones): role person, hidden | |
| Police stations | `ref_facilities` type police_station (60), `police_stations` | no phone |

How the website shows them: `contactsFor(dept, zone)` (lib/collector/intel.ts) returns department rows first, then the zone's officer, with phone and email. Used by the case page (Detail.tsx), Overview "All contacts", Overlays `ContactBody`, NewsPreview, officer Board. The chatbot tool `contacts` returns name, designation, office and source link only (phone and email withheld); Jarvis has the same tool.

Good for: "Who is the zonal officer of Adyar and the phone?", "Who heads the Cooum Basin Division?", "Who should I call about storm water drains?"

---

## 6. Newspaper times, outlets, "more than one newspaper", "not in the registers"

| Need | Column |
|---|---|
| When a newspaper published | `documents.published_at` (or `source_items.published_at` for the live feeds) |
| When the site first saw it | `source_items.fetched_at` (live feeds, about 10 min). `documents.fetched_at` is the nightly batch (about 23:00 to 00:10; half of the articles are 13 h old by then) |
| Which newspaper | `documents.publisher`, `publisher_domain`, `publisher_tier` (official/established/regional are news; filter with `isNewsMedia(publisher, domain, tier)`) |
| The story (same event, all outlets) | `documents.story_id` (9,991 stories); `documents.outlet_count` = real distinct publishers of the story (verified on all 9,991) |
| The incident of an article | `documents.linked_incident_id` (1,601 articles, 980 incidents); `documents.event_id` -> `events` (source 'news', reported_at = published_at on 400 of 400 checked) |
| First report of a case | `incidents.first_reported_at`; for a news-only case it equals the earliest linked article (935 of 935 checked) |
| Only in the news | `incidents.media_only = 1` (has_official_record = 0 and outlet_count > 0) |
| Not in the registers list | `gaps` (71: media_only, last 14 days, lead_dept <> 'POL-GCP': police-led stories are left out; with police there are 161 in the 14 days) |

**Counting newspapers correctly.** `incidents.outlet_count` is `COUNT(DISTINCT source_record_id)` of the news records, i.e. articles (checked: equal to the news event count on 980 of 980; larger than the distinct publishers on 150). `gaps.outlet_count` and `gap_strength` copy it. So "reported by 2+ outlets" is wrong for many: of 16 gaps with outlet_count >= 2 only **4** have 2 or more different newspapers linked (for example INC-20261118-4B1539 says 3 and is one outlet); over 180 days 280 news-only incidents say 2+ but only 197 have 2+ linked newspapers (83 are one newspaper). Counting the whole story, 481 have 2+. Only incidents merged by `news-sanity` have their outlet_count rewritten to distinct publishers.

```sql
-- news-only open cases in 2+ different newspapers, with who and when (strict: the articles joined to the case)
SELECT i.incident_id, COALESCE(i.headline, i.title) AS case_title, i.zone_name, i.first_reported_at,
       COUNT(DISTINCT d.publisher) AS newspapers, GROUP_CONCAT(DISTINCT d.publisher) AS names, MIN(d.published_at) AS first_published
FROM incidents i
JOIN documents d ON d.linked_incident_id = i.incident_id AND d.source_kind = 'news' AND d.publisher_tier IN ('official','established','regional')
WHERE i.media_only = 1 AND i.is_open = 1
GROUP BY i.incident_id HAVING COUNT(DISTINCT d.publisher) >= 2 ORDER BY newspapers DESC;
-- wider (what sourcesFor() shows on the site): also every article of the same story:
--   JOIN documents d1 ON d1.linked_incident_id = i.incident_id JOIN documents d ON d.story_id = d1.story_id OR d.doc_id = d1.doc_id
-- a story cluster can be broad (a cyclone's whole coverage), so name the count "newspapers that carried the story"
```

How the website does it: `sourcesFor(ids)` (intel.ts) lists the publishers of the incident's articles **plus the rest of their story**, filtered by `isNewsMedia`, and `withSources` shows that as `outlets`; `newsStories()` groups by `story_id` then `clusterNews`, giving every outlet with its earliest time; the insights page's "more than one newspaper" button (Insights.tsx line 326) and the chatbot's `news_gaps` minOutlets filter on `outlet_count >= 2` (articles).

---

## 7. Workspaces, briefings, actions, audit, feedback

| Thing | Table | Read by | Now |
|---|---|---|---|
| Saved workspaces (versions) | `workspaces` (owner, name, version, is_current, layout, filters with archiveId) | `listWorkspaces(owner)`, `openWorkspace`, `saveWorkspace` (collector/workspaces.ts) | 3 rows: "Demo – 27 Oct 2026" v1 and v2, "Collector's Daily Briefing" v1 |
| Frozen briefings | `briefing_archive` (markdown + fact_pack) | `openWorkspace` | 59: 56 pipeline (last 2 Oct) + 3 workspace snapshots |
| Current briefings | `briefings`, `briefing_notes` | `insights().briefing`, tool `briefing` | 4 + 20 |
| Decisions | `collector_decisions` | `effectiveSql` everywhere; `incident()` lists them | 6 |
| Action tasks | `actions` (build) + `action_updates` (4) | /api/collector/actions, insights `nextActs` | |
| Officer work | `officer_steps` (5), `officer_reports` (3) | lib/officer/data.ts, `incident().officerStep/deptReports` | |
| Emails and follow-ups | `outbound_emails` (7, all sandbox), `followups` (7, all pending) | `actionEmails(ids)`, rehearsal `readTasks` | |
| Routing | `dept_assignments` (7, none since 27 Oct) | `assignmentsFor` | job not scheduled |
| Audit | `audit_log` (262) | `auditLog()` (hides citizens), `recentEvents` | actions such as auth:signin, assistant:answer, petition:file, studio:add |
| Chatbot | `assistant_sessions` (30), `assistant_messages` (122), `assistant_feedback` (0), `assistant_pins` (0) | assistant/store.ts (owner-checked) | |
| Review | `review_queue` (464 open), `review_decisions` (0) | insights `review` counts | |

---

## 8. Never read (exact)

**Secrets.** `users.password_hash`, `users.token_version`, `password_resets.otp_hash`, `password_resets.identifier`, `sources.secret_enc`, `sources.session_enc`, `sources.session_expires_at`, `sources.username`, `sources.user_field`, `sources.pass_field`, `sources.login_url`, `_changes.*`, `_keys.*`, `schema_migrations.*`. Files: `.env`, `officer-accounts.local.csv`, `data/thunai/*.sqlite`.

**Citizens' personal data (locked `enc:v1:` in the store, plain through a pool).** `complaints.first_name`, `.last_name`, `.street_address`, `.mobile_number`, `.phone_number`, `.email`; `user_profiles.first_name`, `.last_name`, `.date_of_birth`, `.mobile_number`, `.alternate_email`, `.door_no_and_street`, `.aadhaar_number_encrypted`, `.aadhaar_last4`, `.profile_photo`; `petitions.name`, `.mobile`, `.address`, `.full_text`, `.reading`.

**Citizens' personal data NOT locked.** `complaints.initials`, `.gender`, `.pincode`, `.location_pincode`, `.specific_location`, `.manual_street_name`, `.description` (8 rows hold a phone number), `.remarks`, `.media_path`, `.user_id`; `complaint_status_history.remarks`, `.changed_by`; `users.email`, `.id` links; `user_profiles.gender`, `.area`, `.locality`, `.pincode`, `.user_id`, `.ward_number`; `petitions.subject`, `.problem`, `.request`, `.uploaded_email`, `.citizen_user_id`, `.uploaded_by`, `.pages`; `events.reporter_hash`, `events.text` (8 rows hold a phone number), `incidents.title` / `.headline` of a complaint is the citizen's own words; `incident_timeline.note` ("complainant confirmed" notes); `police_incident_reports.description`.

**Other people's private data.** `audit_log.actor`, `.before_value` (26 rows hold phones, 1 email), `.after_value` (9 phones, 7 emails, sign-in IP and browser), `.record_id`; `assistant_messages.content_text`, `.payload_json`, `.plan_json`; `assistant_sessions.owner`, `.title`; `outbound_emails.to_contact_ids` (emails in all 7), `.delivered_to`, `.body`, `.owner`; `officer_reports.sent_by`, `.sent_user_id`, `.photo_dir`; `officer_steps.actor`, `.actor_user_id`; `workspaces.owner`; `collector_decisions.decided_by`; `action_updates.updated_by`; `source_runs.triggered_by`; `sources.created_by`; `briefing_archive.issued_by` (3 hold an email); `documents.ai_people` (private people named in crime news), `documents.body` (139 rows hold a phone number, 106 an email); Data Studio columns with role `person`; `data/thunai/memory-*.json`.

**Allowed (published for the public).** `official_contacts.phone`, `.email`; `dept_assignments.officer_phone` (copied from them). `ref_offices.phone/email` are generated: say so if shown.

**Untrusted text (may carry instructions).** `events.text/title`, `documents.title/summary/body/title_en`, `source_items.title/body`, `incident_timeline.note`, `gaps.title`, Studio cells, TomTom names.

Masking helper: `redactText` (lib/thunai/privacy.ts) hides phones, emails, Aadhaar in text; it does not hide names.

---

## 9. Gaps: data the store or disk holds that neither Jarvis nor the chatbot reaches today

Jarvis reaches data through `serverHands` (thunai/data.ts): 29 of the chatbot's 33 tools (`AGENT_TOOLS` in agent.ts: all but incident_story, search, category_summary, map_geo), `consoleOverview/List/News`, Ask the Map, Data Studio, v18 windows, and the v19 analyst whose sources are only `incidents, traffic, air, rain, lakes, weather, prices, news`. The chatbot reaches those tools plus a planner over the 34 tables and views in `assistant/catalog.ts POLICY` (default deny).

| Data | Jarvis | Chatbot | Notes |
|---|---|---|---|
| **Hospital beds, OPD, emergencies, diseases, medicine, ambulance, staff (12 metrics, 9 hospitals, 180 days)** | No (its `environment` metric list is rain, aqi, lakes, temp, humidity; the analyst has no hospital source; only hospital incidents, the map layer and a Studio upload) | Yes: tool `environment`, planner on `observations` | officer console only otherwise |
| Phone numbers and emails of officials | No | No | withheld by design; the console shows them |
| PWD officers and offices (`ref_offices` names) | No | office and designation only | generated |
| River gauges `gauge_level_m` (23), reservoir inflow | No (rain rehearsal only) | planner only (`observations`) | all suspect |
| CFM gate discharge, bulletins list | No (inside `rehearsalState` triggers) | No | CSV/JSON on disk |
| IMD forecast text (`forecasts`, 272 rows, to 1 Dec) | No | No (excluded on purpose) | no code reads the table |
| Open-Meteo zone rain forecast | Only through Ask the Map | only through the map lane | |
| `incidents.headline`, `cluster_id/size`, `dead_reported`, `injured_reported`, `_placed` | headline and cluster as display only | not in the catalog | |
| PWD works money and progress (`pwd_works`, 258) | No tool; map layer only | planner | |
| Actions and playbook tasks (`actions`, 5,616) | Next step of one case only | planner (actions) | |
| `incident_timeline` (146,872 steps), `incident_members` | one case at a time | one case at a time | no counting by step or time between steps |
| Records rather than incidents: `events` fields response_minutes, channel, rejection reason, reopen_count, blockage_minutes, crowd_estimate, service_disruption | No | partly (response_minutes, channel) | |
| Which newspapers, when, per case; distinct newspapers; article text; AI reading; `places`/`place_roles` | news list and one case; article text in the news reader | headlines and links; no body | no tool counts distinct newspapers (the chatbot's planner could, over `documents.publisher`) |
| What the news desk left out, Next door, Reports differ | screens open, text not answerable | No | `newsLeftOut`, `nearby`, `periodConflicts` |
| Live RSS items not yet in the build (`source_items`) | inside stories only | No | newest news |
| Alerts table, `briefing_notes`, alert lane (SACHET) | warnings only; not the list | planner (alerts) | |
| Predictions-like fields (`observation_signals.slope_per_day`, `days_to_full`) | No | excluded on purpose | |
| Linker pairs, review queue items, AI accuracy (`metrics`), `agent_runs`, `kpis`, `data_quality` details | No | review_queue and data_quality counts only | |
| Collector's own record: `collector_decisions`, `action_updates`, `workspaces`, `briefing_archive`, `followups`, `outbound_emails` (who was written to, when, pending replies) | workspace open/save by name; nothing to ask about | excluded | |
| Officer side: `officer_steps`, `officer_reports` (remarks, photos) | in one case's detail | in one case's detail | |
| Manu petitions as petitions (count, department, urgency, due date, repeats) | No | No | they count as incidents only |
| The website's own complaints tables and sub-types (how departments are mapped, 328 sub-types) | No | No | |
| Traffic history (`traffic_days`, `traffic_snaps`) | Yes | No (live only) | |
| Wards: population, density, underpasses, substations, transit frequency, elevation, road graph reach | Ask the Map (population) / Rain view | map lane | not answerable as figures elsewhere |
| Ward statistics (`ref_wards`: low-lying, Gi*, flood reports, adjacent wards) | No | planner, without adjacency | |
| Chatbot's own history, feedback, pins; Jarvis notes and reminders | own notes only | own chats only | |
| Data Studio dataset rows and dashboards | Yes (Collector) | Yes (Collector) | never person columns |
| Files: `data/studio-samples`, `docs/studio-demo/data`, `data/gcc-reference` streets and localities, collectors' CSV history | No | resolve_place uses area names | |

---

## 10. Traps found while checking

1. **`outlet_count` counts articles, not newspapers** (section 6). The "more than one newspaper" button and `news_gaps(minOutlets)` overstate.
2. **Prices are weeks old**: `mandi_market_prices` ends 6 Oct 2026, `mandi_prices` 26 Oct, `mandi_weekly` 24 Oct. Any "today's price" must say the date.
3. `mandi_weekly.chg_*` average only the rises: the collector's `avg` drops zero and negative values (sources.ts line 701), so falls never show.
4. `complaints` is not the live complaint feed (stops 24 Sep except 13 real filings). Complaints in the news desk sense are `events` source 'grievance' (17,105 to 26 Nov).
5. `incidents.is_open` / `status_std` / `v_*` views / `kpis` ignore the Collector's decisions and the routing; use `effectiveSql` and `OPEN_NOW`.
6. Two meanings of "past deadline": the pipeline's `sla_breached` is 1,082 open cases, the console's rule (`pastDueSql`) is 2,001 of 2,764 open in the raw build. The difference is 917 response-basis cases (police work) that met their response target but whose `sla_due_at` has passed, and 2 others.
7. All CFM gauge readings are `quality = 'suspect'`; CPCB can be 12+ hours old (stale at 00:12 on 26 Nov); rain readings end at the 08:30 or 17:30 bulletin.
8. `documents.department` is 74% `GCC-GAD` (fallback); use the incident's or the desk's category instead.
9. Future rows exist: `alerts.date` to 27 Nov, `observations` (IMD days ahead) to 30 Nov, `events.occurred_at` to 27 Nov, `forecasts` to 1 Dec, `actions.due_at` to Jan 2027. Cap with `<= asOf()`.
10. `daily_counts` starts 30 May, but news documents start 28 Aug 2026; "news in June" does not exist.
11. The `hospital` data is generated (source_health.kind says "synthetic generator"), as are police, PWD and the history of complaints; news, IMD, CPCB, CFM, CMWSSB, TomTom, OSM are real. `is_synthetic` / `is_synthetic_any` mark it (27,297 of 28,532 incidents).
12. `ref_wards.geometry` and `ref_zones.outline` are large: never select them in an answer.
13. An officer's console is locked to its department (`lockDept`); an assistant must apply it to every read.
14. Power-off hours and train delays in Rain (`impacts("power")`, `impacts("metro")`) are generated, not measured.
