# District IQ: data sources audit

Audit date: 2026-11-04 (IST). Scope: `chennai-grievance-portal-main` (the app), its data store snapshot in
`chennai-grievance-portal-main/data/aws-cache/`, and the collectors and generators at the repo root.
Read-only. No code was changed, and no organisation was contacted. Web checks were limited to public pages.

## How the data reaches the app

- The PC runs `district_intel` (`run_pipeline.py refresh`) from Windows Task Scheduler (task **DistrictIntel**)
  every 30 minutes. Each source then runs on its own interval from `district_intel/config.yaml`: news, IMD and
  CPCB hourly, CFM every 3 hours, and the synthetic generators daily (`district_intel/README.md:22-26`). The
  build goes to S3 (`aws/export_intel.py`).
- The website (`DATA_BACKEND=aws`, `src/lib/aws/store.ts`) downloads the build and caches each table as
  `data/aws-cache/<table>-<sha>.json.gz`. It checks for a newer build every 5 minutes (`CHECK_MS`). **The hosted
  site is only as fresh as the PC's last upload. If the PC is off, every "live" feed freezes and nothing in the UI
  says the PC is off**, apart from the per-feed staleness rule in `src/lib/collector/freshness.ts`.
- When each build loads, `src/lib/collector/derive.ts` swaps the simulated PWD lake figures for CMWSSB's published
  reservoir figures (AWS store only; a MySQL build keeps the simulated lakes, see `src/lib/assistant/queries.ts:310`).
- The website fetches some data itself: CMWSSB lake levels (`lakes.ts`, hourly), news from nearby districts
  (`nearby.ts`, Google News RSS, hourly), SACHET CAP alerts (`alerts.ts`, every 15 minutes), AGMARKNET prices
  (`sources.ts`, daily) and article full text (`fulltext.ts`).
- The snapshot that was audited was built at `2026-11-04 19:12:00+05:30` (metrics `as_of`). The cache files were
  written 2026-11-04 23:03 local time.

## Latest dates in the cached data

Computed with node from the `.json.gz` files: the max of each date or time column, grouped by `source` and
`is_synthetic`. Two scripts did the work: `scan.js` and `scan2.js` in the session scratchpad. A read-only script
(`dur.js`) checked the durable SQLite store (`durable-1793801117786.sqlite`) for prices and sources.

| Table / slice | Rows | Synthetic? | Latest date present |
|---|---|---|---|
| events, source=grievance | 16,908 synthetic + 4 real | mostly synthetic | reported_at 2026-11-04 19:10 (the 4 real filings: last 2026-10-06) |
| events, source=police | 12,814 | **synthetic** | 2026-11-04 19:11 |
| events, source=pwd | 2,851 | **synthetic** | 2026-11-04 19:02 |
| events, source=hospital | 130 | **synthetic** | 2026-11-02 |
| events, source=news | 1,295 | real | 2026-11-04 18:33 |
| events, source=imd | 132 | real | 2026-11-04 18:59 (warnings run to 2026-11-08, as forecasts) |
| events, source=cpcb | 17 | real | 2026-11-03 11:00 |
| incidents | 28,049 (27,158 with a synthetic member) | 97% synthetic | first_reported_at 2026-11-04 19:10 |
| observations imd rainfall_24h_mm | 141 | real | 2026-11-04 08:30 |
| observations imd temp/humidity | ~165 each | real | 2026-11-04 17:30 |
| observations imd_warning_level | 310 | real | 2026-11-08 (forecast days) |
| observations cpcb aqi | 1,027 | real | 2026-11-04 17:00 |
| observations cfm reservoir_inflow_cusec | 294 | real | 2026-11-04 06:00 |
| observations cfm gauge_level_m | 39 (all flagged suspect) | real | 2026-11-02 06:30 |
| observations pwd lake_* | 3 x 3,240 | **synthetic** | 2026-11-04 (replaced by CMWSSB on the AWS store) |
| observations hospital (12 metrics) | 12 x 1,620 | **synthetic** | 2026-11-04 |
| forecasts (IMD city 7-day) | 188 | real | issued 2026-11-04 18:21 |
| documents news | 18,333 | real | published 2026-11-04 18:58 |
| documents cfm_bulletin | 23 | real | 2026-10-22 |
| documents pwd_announcement | 102 | **synthetic** | 2026-11-04 12:16 |
| pwd_works | 257 | **synthetic** | start 2026-11-02, completion 2026-11-04 |
| world_calendar (overlay rain days) | 180 | planted | 2026-11-04 |
| cmwssb-lakes.json | 21 days | real | 2026-11-04 (fetched 2026-11-04 13:02 UTC) |
| nearby-news.json | 447 items | real | 2026-11-04 18:16 (fetched 13:04 UTC) |
| news-fulltext.json | 4 entries | real | all `not_in_sitemap` (empty) |
| aibrief.json | AI outputs | derived | times only ("08:45 PM") |
| sachet-chennai.json | — | — | **file not present** (no SACHET alert saved yet) |
| durable: mandi_market_prices (Chennai markets) | 7,163 | real | **2026-10-06** (fetched 2026-10-07): 29 days old |
| durable: mandi_prices (TN / region) | 360 | real | **2026-10-26** (fetched 2026-10-28) |
| durable: mandi_weekly | 120 | real | week 24-31 Oct 2026 (fetched 2026-10-28) |
| durable: sources, AGMARKNET row | — | — | status **failing**, `AGMARKNET HTTP 400` since 2026-10-28 |
| durable: police_incident_reports (old copy) | 6,183 | synthetic | 2026-09-25 |

In `source_health`, police, PWD and hospital are recorded as `departmental dataset (synthetic generator)`, and
grievance as `departmental app export (synthetic history + live filings)`. The overlay metrics say **1,721
records were planted** across the departmental sources: grievance 659, PWD 579, police 470 and hospital 13.

## Source by source

### Rainfall and weather (IMD)
- **Real or synthetic:** real. `imd_weather_collector/imd_weather_collector.py` POSTs to
  `https://city.imd.gov.in/citywx/responsive/api/fetchCity_static.php` for 4 stations: 43278, 43279 Meenambakkam,
  99947 Madhavaram and 99948 Ennore.
- **How it is fetched:** scheduled hourly on the PC, then served from the snapshot. The 24-hour rainfall ends at
  08:30 IST, so it changes once a day.
- **Latest data:** rainfall 2026-11-04 08:30; temperature and humidity 2026-11-04 17:30.
- **UI and Jarvis:** the Environment page shows the station and the reading. Jarvis says "as of {at}"
  (`src/lib/thunai/screens.ts:647-648, 727`).
- **Verdict:** OK.

### Weather warnings (IMD district warnings, SACHET, news)
- **Real or synthetic:** real.
  - IMD district warnings come from the WFS behind `mausam.imd.gov.in/responsive/districtWiseWarningGIS.php`
    (`reactjs.imd.gov.in/geoserver/wfs`), with RMC pages as the fallback. The IMD warnings API returned
    `http_401` (IP whitelist, recorded in source_health).
  - SACHET reads `https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml`. On 2026-11-04 the feed was
    reachable and held IMD Chennai items.
  - News alerts come from `reporttype.ts`.
- **How it is fetched:** IMD hourly through the snapshot; the website reads SACHET itself every 15 minutes.
- **Latest data:** warning level through 2026-11-08 (Day 1 to Day 5). No SACHET file is saved yet.
- **Verdict:** OK. The lane compares the sources instead of trusting one.

### Reservoirs and lakes
- **CMWSSB (real).** `src/lib/collector/lakes.ts` scrapes `https://cmwssb.tn.gov.in/lake-level`, today's page at
  most once an hour. The latest saved day is 2026-11-04, and the live page showed "As On 04/11/2026" on the audit
  day. On the AWS store, `derive.ts` replaces the simulated lakes with these figures.
- **PWD lakes (synthetic).** `pwd_dataset_generator/generate_pwd_data.py:19` says "Lake / reservoir storage is
  simulated day by day". They are still in the snapshot, and a MySQL build still shows them.
- **CFM-DSS (real).** `cfm_dss_collector` reads `https://chennaifloodmonitor.tn.gov.in`. Reservoir inflow runs to
  2026-11-04 06:00. Gauge levels stop at 2026-11-02, and all 39 readings are flagged suspect.
- **UI:** the Environment page labels CMWSSB as reservoirs (`Overview.tsx` LakeCard, `source === "CMWSSB"`).
  However, the Ask-the-map layer list still says **"Lake levels · PWD"** (`askmap/Chrome.tsx:22`).
- **Verdict:**
  - CMWSSB: OK.
  - Map layer label: MISLEADING. It credits PWD for CMWSSB data, and on a MySQL build the data shown would be
    simulated.

### Air quality (CPCB)
- **Real or synthetic:** real. `cpcb_air_quality_collector` reads the CPCB CCR live city map
  (`airquality.cpcb.gov.in/ccr/`).
  - data.gov.in resource `3b01bcb8…` was not used because it needs an API key.
  - CCR history is behind a captcha and is not bypassed.
- **How it is fetched:** hourly, but only while the PC is on. The tooltip at `CollectorApp.tsx:991` says so.
- **Latest data:** AQI 2026-11-04 17:00.
- **Verdict:** OK.

### Flood monitoring (CFM-DSS)
- **Real or synthetic:** real, scraped from `chennaifloodmonitor.tn.gov.in` every 3 hours.
- **Latest data:** inflow 2026-11-04 06:00; gauges 2026-11-02 (suspect); bulletins 2026-10-22.
- **Verdict:** OK. The alerts lane says when the gauge feed has gone quiet.

### Complaints (grievance portal)
- **Real or synthetic:** mostly synthetic.
  - History comes from `node scripts/generate-synthetic-grievances.js --days 180 --seed 42`
    (`district_intel/config.yaml:212`).
  - Only 4 events are real portal filings, the last on 2026-10-06.
- **How it is fetched:** generated daily; the overlay plants extra complaints on "world" rain days.
- **Latest data:** 2026-11-04 19:10.
- **UI and Jarvis:** shown as the district's complaints. Answers never say that the records are synthetic (see the
  bugs below).
- **Verdict:** MISLEADING. FarmwiseAI permits mock departmental data, but the UI and assistant hide it by design.

### Police
- **Real or synthetic:** **synthetic.**
  - `police_dataset_generator/README.md:3`: "Generates a synthetic Police Department dataset".
  - `src/lib/generator.ts:4,161`: each day comes from a seeded RNG stream.
- **Real alternative:** no official daily feed exists. See the live data plan.
- **How it is fetched:** generated daily.
- **Latest data:** 2026-11-04 19:11.
- **Verdict:** MISLEADING wherever it is labelled "live", "Healthy" or a "department export".

### PWD (works, incidents, announcements, lakes)
- **Real or synthetic:** **synthetic.** `generate_pwd_data.py:6`: "Synthetic, "live-looking" seed data for the PWD".
- **How it is fetched:** generated daily.
- **Latest data:** events 2026-11-04 19:02; works completion 2026-11-04; announcements 2026-11-04 12:16.
- **Verdict:** MISLEADING. The map shows these under "On the ground now" with a live dot.

### Hospitals
- **Real or synthetic:** **synthetic.** `chennai_hospital_data/chennai_hospital_data_generator.py:5`: "All values are
  FICTIONAL", seeded with SHA-256.
- **How it is fetched:** generated daily.
- **Latest data:** observations 2026-11-04; events 2026-11-02.
- **UI:** the map layer is labelled "Govt hospital beds · MIS" (`Chrome.tsx:23`), which suggests an official MIS
  feed. The assistant calls them "live bed readings".
- **Verdict:** MISLEADING.

### News
- **Real or synthetic:** real. Sources:
  - `chennai_news_pipeline`: RSS, sitemaps and Google News.
  - `nearby.ts`: Google News RSS for the neighbouring districts.
  - The Hindu RSS source (durable `sources` id 21).
- **How it is fetched:** hourly.
- **Latest data:** 2026-11-04 18:58; nearby news 18:16.
- **Verdict:** OK.

### Market prices (AGMARKNET)
- **Real or synthetic:** real. The website calls `api.agmarknet.gov.in/v1/...` (`src/lib/collector/sources.ts:555,
  647, 706`).
- **How it is fetched:** daily, but **failing since 2026-10-28 with HTTP 400**.
- **Latest data:** Chennai market prices 2026-10-06; state and regional prices 2026-10-26.
- **UI:** the Environment price card shows the date and a stale tag (`Insights.tsx:686-703, 760, 800`, R-05).
  The written briefing's price line has no date at all.
- **Verdict:**
  - Price card: OK.
  - Briefing line: MISLEADING.

### Incidents, alerts, KPIs, briefings, hotspots
- **Real or synthetic:** derived by `district_intel` from all of the sources above, at `as_of` 2026-11-04 19:12.
  27,158 of the 28,049 incidents have a synthetic member.
- **Verdict:** MISLEADING. They are presented as the district's situation, with no synthetic share anywhere.

### Other sources found
- **Reference data:** GCC streets and areas (official, fetched 2026-09-23) and DataMeet ward boundaries (community,
  labelled not official in `reference_data_sources`). Both are static files.
- **Map layers:** OSM-derived files in `data/layers/*.geojson`, which are static.
- **Rehearsal traffic:** TomTom (`src/app/api/rehearsal/traffic/live/route.ts`). It is live and needs a key.
- **The Hindu RSS and chennai.nic.in pages:** sources the Collector added, run daily (durable `sources` 21 and 22).
- **Data Studio samples:** labelled "Sample · synthetic" (`studio/Dataset.tsx:252`). OK.

## Honesty bugs to fix

1. `src/components/auth/AuthHero.tsx:96`: "Live across Chennai's 15 zones" with a pulsing dot. At `:109` it says
   "8 Live data feeds". Four of the 8 feeds (grievance, police, PWD, hospital) are synthetic generators.
2. `src/components/collector/app/CollectorApp.tsx:724` counts every feed with status ok as live, including the
   synthetic ones. The total is shown as "x/y live" at `:990`.
   - The tooltip at `:991` says "Every source is collected hourly", but the generators run daily, and the hosted
     copy only changes when the PC uploads a build.
   - The same pattern is in `src/components/officer/OfficerApp.tsx:519` ("Data feeds · n/m live") and `:661`.
3. `src/components/collector/app/Overlays.tsx:180-186`: the feeds table marks police, PWD and hospital as
   "Healthy". It drops the `kind` column that `src/lib/collector/intel.ts:853` reads, which says
   "(synthetic generator)". The note at `:190` says the pipeline refreshes every source every 30 minutes, which is
   wrong for the generators (daily).
4. `src/components/collector/app/askmap/Chrome.tsx:21-24`: the "On the ground now" layers are labelled
   "Lake levels · PWD", "PWD works under way · PWD" and "Govt hospital beds · MIS".
   - The hospital beds and PWD works are synthetic, and "MIS" suggests an official system.
   - On AWS the lake data is CMWSSB, not PWD.
5. `src/components/collector/app/askmap/AskMapPanel.tsx:419-424` shows "On the ground now" with a live dot, built
   by `src/lib/map/conditions.ts:2-6, 98-108`. It presents synthetic hospital bed occupancy and emergency cases,
   plus synthetic PWD works, as current readings. The header comment says "nothing is estimated".
6. Two assistant routes treat synthetic hospital data as live:
   - `src/lib/assistant/direct.ts:16-17, 130` sends "hospital beds available now" to "the live bed readings".
   - `src/lib/assistant/pipeline.ts:1269-1271` treats the same hospital readings as "the console's live readings"
     for "today", "now" or "currently".
7. Four places make it policy never to disclose synthetic data in answers:
   - `src/lib/ai/prompts/planner.ts:18`: "answers never split real from synthetic data".
   - `src/lib/assistant/pipeline.ts:1829`: "answers do not label or count it".
   - `src/lib/assistant/pipeline.ts:1951-1952`: "never mention test, synthetic or real data".
   - `src/lib/assistant/tools.ts:190-191`.

   Only `src/lib/assistant/help.ts:10` discloses it, and only when the user asks about data sources. A Collector
   asking "how many chain snatchings today?" gets generated figures stated as fact.
8. `src/lib/collector/insights.ts:276-287`, rendered at `src/components/collector/app/Insights.tsx:166`: the
   briefing line "Vegetable prices: Tomato ₹X/kg across N Chennai markets, up Y% on the previous report" has no
   date. The Chennai market prices are from 2026-10-06, 29 days before the audit, and AGMARKNET has failed
   (HTTP 400) since 2026-10-28. The fallback at `:285` says "up X% in a day" about prices that are 9 or more days
   old.
9. `src/lib/collector/insights.ts:289-293`: the briefing's conditions line has no time on any figure.
   - Rainfall is the 24 hours ending 08:30.
   - Reservoirs come from CMWSSB on AWS, but on a MySQL build "reservoirs X% full" is the simulated PWD figure.
10. Durable `sources` registry, rows 2-4, as shown on the Sources page (`Sources.tsx:86` labels them "Pipeline
    feed"): police, PWD and hospital are described as "(department export)". They are generator outputs. The same
    rows show IMD, CPCB and news as last run on 2026-09-29, which contradicts source_health (2026-11-04).
11. `src/lib/thunai/screens.ts:601, 610`: Jarvis says "Prices of N items at Chennai markets, reports to {date}". The
    date is there, but nothing says that 29 days is stale; the Environment card at least shows a `PriceAge` tag.

## Live data plan

Verified on 2026-11-04 with WebSearch and WebFetch. "Unverified" means I could not confirm the point from a primary
source.

### IMD API (api.imd.gov.in)
- **Provides:** city 7-day forecasts, current weather, district warnings, nowcast, rainfall and cyclone data
  (index at `https://api.imd.gov.in/public/api_reference.html`).
- **Update rate:** not stated. The observation windows are 08:30 and 17:30 IST.
- **Access:** **not open.** `https://api.imd.gov.in/api/v1/cityforecast?id=43279` returned **HTTP 401**, and the
  collector already logs `mausam.imd.gov.in/api/warnings_district_api.php` as 401 (IP whitelist). The reference page
  states no key, licence or terms. How to get whitelisted is **unverified**.
- **Licence:** unverified (none stated).
- **Reliability:** high once access is granted.
- **Fit:** it would replace the city-weather POST scrape and the WFS warning layer with official endpoints.
- **Effort:** small once whitelisted (about a day).
- **Owner must:** ask IMD to whitelist the server's static egress IP. The hosted site needs a fixed IP.
- **No-key adapter today:** **No** (401).

### Open-Meteo
- **Provides:** forecast and hourly precipitation for any coordinates. The historical API covers ERA5 from 1940 and
  ERA5-Land from 1950 with a 5-day delay, and ECMWF IFS from 2017 updated every 6 hours with no delay.
- **URLs:** `https://api.open-meteo.com/v1/forecast` and `https://archive-api.open-meteo.com/v1/archive`.
- **Update rate:** hourly model runs.
- **Access:** no key. A test call for Chennai returned JSON with no key; a key is only needed for commercial plans.
  The free tier allows fewer than 10,000 calls a day, 5,000 an hour and 600 a minute (300,000 a month).
- **Licence:** data is CC BY 4.0, with a link to Open-Meteo shown next to the data. However, the terms say the
  free API is for **non-commercial use only**.
- **Reliability:** good. It is model data, not a gauge observation, so it must be labelled as a model.
- **Fit:** forecasts and gridded rain where IMD has no station; the collector already has it as a labelled
  fallback.
- **Effort:** low. The fallback code exists, and it is off by default because both hosts' robots.txt say
  `Disallow: /`, according to the collector header. I did not re-check robots.txt.
- **Owner must:** decide whether a vendor-built Collector dashboard counts as non-commercial. If not, buy a
  subscription.
- **No-key adapter today:** **Yes technically, but conditional.** No key is needed and CC BY 4.0 is permissive, but
  the non-commercial clause and the robots.txt question need the owner's decision first.

### CMWSSB reservoir levels
- **Provides:** daily storage, level, inflow, outflow and rain for 6 reservoirs, plus a total, at
  `https://cmwssb.tn.gov.in/lake-level`. The page showed "As On 04/11/2026" and takes `?date=dd-mm-yyyy`.
- **Update rate:** daily (morning).
- **Access:** free public HTML. There is no API or download.
- **robots.txt:** disallows only `/core/`, `/profiles/`, `/admin/`, `/search/`, `/user/*` and `/node/add/`, so
  `/lake-level` is allowed.
- **Licence:** the Terms of Use say content "may be reproduced free of charge after taking proper permission by
  sending a mail". The source must be credited, and the content must not be used in a misleading way. © CMWSSB, all
  rights reserved.
- **Reliability:** official, but it is an HTML table and will break if the layout changes.
- **Fit:** already built (`lakes.ts`).
- **Effort:** done.
- **Owner must:** email CMWSSB for reproduction permission. I did not contact them.
- **No-key adapter today:** **Yes for access** (already live). **The licence is not permissive**: it needs
  permission by email.

### Greater Chennai Police on data.opencity.in
- **Provides:** 7 datasets: jurisdictions (KML), road crashes 1998-2025 (CSV/PDF, last updated 2026-02-09),
  TN crime data 2022 and 2023 (annual PDF/CSV), police stations (CSV/KML), and a public-gatherings rule PDF.
- **Update rate:** **no daily feed.** The data is static or annual.
- **Access:** free downloads.
- **Licence:** "Other (Public Domain)" on 6 of the 7 datasets.
- **Reliability:** good for reference, useless for live incidents.
- **Fit:** station points and jurisdiction polygons, plus a historical baseline for road crashes. It cannot replace
  the synthetic police feed.
- **Effort:** low (static import).
- **Owner must:** nothing for static use. A daily feed would need an agreement with GCP.
- **gccp.xenovex.com:** **not confirmed as official.** It is on a vendor domain, not `.gov.in`, it returned HTTP 503
  on the audit day, and earlier snapshots showed placeholder "0" metrics. Reporting (TheNewsMinute) says Chennai
  police have no website of their own and use `tnpolice.gov.in` and `eservices.tnpolice.gov.in`. Do not use it.
- **No-key adapter today:** **Yes for the static reference data. No live police feed exists.**

### Air quality
- **CPCB CCR** (`airquality.cpcb.gov.in/ccr/`)
  - Provides: station AQI, updated hourly.
  - Access: free public page. History is captcha-gated (not bypassed).
  - Licence: unverified. robots.txt returned 404.
  - Fit: the current collector.
  - No-key adapter today: **Yes for access (in use). Licence unverified.**
- **data.gov.in resource `3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69`** (real-time AQI from CPCB)
  - Provides: hourly data, current values only (no history).
  - Access: **needs a free API key** from registration. Third-party guides mention a sample key limited to 10
    records per call.
  - Licence: probably the Government Open Data Licence India (GODL), unverified; the page returned 403 to the
    fetch.
  - No-key adapter today: **No** (key needed).
- **OpenAQ v3**
  - Access: needs an `X-API-Key` from free registration at explore.openaq.org. The free plan allows 60 requests a
    minute and 2,000 an hour.
  - Licence: set per source. The licence of the CPCB data on OpenAQ is **unverified**. OpenAQ attribution is
    required.
  - No-key adapter today: **No** (key needed).

### Tamil Nadu flood and rain sensors
- **TN-Alert app (TNSDMA):** forecasts, rainfall, reservoir levels and flood-vulnerable areas, in Tamil. **No public
  API was found** (unverified).
- **TNSMART:** daily district rainfall-analysis PDFs at `beta-tnsmart.rimes.int/DATA/Rainfall/daily_reports/
  rainfall_analysis_YYYY-MM-DD.pdf` (seen for 2023-2025). A blog reports TNSDMA opened daily rainfall for more than
  500 stations. Licence and how current the reports are: unverified.
- **GCC real-time flood warning, RTFF/SDSS, flood meters and ICCC dashboards:** reported in news. **No public feed
  was found.**
- **Fit:** TNSMART PDFs could add a daily rain-gauge layer beyond IMD's 4 stations. That means PDF parsing, about
  2-3 days of effort.
- **Owner must:** ask TNSDMA or GCC ICCC for data access. Confirm TNSMART's terms.
- **No-key adapter today:** **No.** TNSMART needs no key but its licence is unverified, and there is no sensor
  API.

### Also worth noting
- **SACHET CAP** (`sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml`): reachable with no key and carries
  IMD Chennai alerts. Already built. Licence unverified.
- **AGMARKNET** (`api.agmarknet.gov.in`): **failing with HTTP 400 since 2026-10-28.** Someone needs to check
  whether the endpoint or its parameters changed. Licence unverified.

## Verdict: could a live adapter be built today with no new account or key and a permissive licence?

| Source | Verdict | Why |
|---|---|---|
| IMD api.imd.gov.in | No | Returns 401; needs IP whitelisting |
| Open-Meteo | Conditional | No key and CC BY 4.0, but the free tier is non-commercial only, and robots.txt `Disallow: /` is noted in the code |
| CMWSSB lake levels | Access yes, licence no | Already live; reproduction needs email permission |
| GCP / data.opencity.in | Static yes, live no | Public-domain static datasets only; no daily feed. xenovex is not official |
| CPCB CCR | Access yes, licence unverified | Already in use; history is captcha-gated |
| data.gov.in AQI | No | API key required |
| OpenAQ | No | API key required |
| TN-Alert / GCC sensors | No | No public API found |
| TNSMART PDFs | Unverified | No key, but terms and freshness are unconfirmed |
