# ULTRA PROMPT: Rain Rehearsal (மழை ஒத்திகை), the map that gets Chennai ready before the rain

> **How to use:** open a new Claude Code session in `D:\farmwisenew` and say:
> **"Read `docs/RAIN_REHEARSAL_ULTRA_PROMPT.md` completely and follow it. Start with Phase 0. After each phase, stop, show me the verification results, and wait for my go-ahead."**
>
> Written 29 Oct 2026 from: a survey of this repository on branch `aws-deploy` (head `62ad9f3`) and its local AWS store cache (`chennai-grievance-portal-main/data/aws-cache/`); the CFM-DSS collector's raw cache (`cfm_dss_collector/data/raw_cache/`); the IMD collector's files; the Ask the Map build (`docs/ASK_THE_MAP_ULTRA_PROMPT.md`, `docs/ask-the-map/PROGRESS.md`); F8 Monsoon Mode in `docs/DISTRICT_IQ_ULTRA_PROMPT.md`; FarmwiseAI's website and apps (read 27–28 Oct 2026); and public research listed in section 18.
>
> This prompt builds **one feature completely**: Rain Rehearsal. It is the map-first form of F8 Monsoon Mode. Where the two disagree, this one wins. It builds on Ask the Map; it does not replace it.

---

## 0. Read this first

You start with no memory of earlier work. Everything you need is in this document and in the repository. **Where this document and the code disagree, the code wins.** Tell the user what differs and adapt.

Work in phases (section 15). After each phase, stop and report in the format of section 17. Never start the next phase without the user's go-ahead.

**Ask the user before you:**
- install any package larger than ~5 MB, or anything native. This feature needs **no routing package**: write the graph and Dijkstra yourself (section 7.3). Small pure-JS packages under 100 kB are fine if you name them in the report;
- change `district_intel/` or any collector (`cfm_dss_collector/`, `imd_weather_collector/` …). Rain Rehearsal **reads** the store and the collectors' files; it never changes the pipeline. If a collector must fetch something new (for example the bulletin PDFs, section 7.7), write the proposal and wait;
- add or change a durable table on the AWS store (`DURABLE_ADDED`, `/store/write`), or do anything destructive to any store (section 7.9 has the one table this feature wants: ask in Phase 0);
- send any email in live mode (sandbox only: `EMAIL_MODE`, `EMAIL_SANDBOX_TO`);
- add a top-bar tab or a new page. **Rain Rehearsal has no page of its own.** It lives on the existing console maps (section 5.1);
- download more than ~25 MB of data in total (road network + elevation tiles fit well under this);
- commit, push or merge. The working tree has the user's uncommitted data files; never commit data files.

**Never:**
- **forecast rain or flooding ourselves.** We quote IMD and the Chennai Flood Monitor (CFM-DSS) word for word, with their time and link. What we compute is **where past rain hurt** and **what that means for roads, help and work**. Every screen that shows a risk says so in plain words: *"Based on where it flooded in past rains. Not a forecast."*;
- let an AI model compute a number, choose a street, rank a risk, choose a task or move the map on its own. AI may only word a drafted email (which the Collector reads and edits) and at most two sentences around computed numbers;
- build SQL from strings. Plans run over in-memory features loaded by fixed queries;
- show a complainant's name, phone, email or address anywhere in this feature, including exports and emails;
- draw an incident as an exact pin when its location is coarser than the console's rule (`PIN_PRECISION_M = 2000`, `src/lib/collector/mapplace.ts`). For **flood memory**, only incidents with `loc_precision_m ≤ 300` may mark a street (section 7.2);
- hard-code a number in the UI, the demo or the tests. Every number shown comes from the data; every expected number in a test comes from an independent oracle computation in the test;
- use data from after the chosen moment when computing a rehearsal for that moment (section 7.11, "no peeking"). This is tested;
- print, log or commit `.env` values, API keys or officer passwords.

**Test servers.** Use `.claude/launch.json`: `portal-aws-dryrun` (port 3001, `AWS_STORE_DRY_RUN=1`, nothing reaches DynamoDB) for everything. Never use port 3000 (the user's live server). Node on this PC needs `NODE_EXTRA_CA_CERTS` (already in launch.json). Checks: `npx tsc --noEmit`, `npx vitest run`, `npm run eval:golden` (frozen store; `npm run eval:freeze` only with the user's OK).

**Files on this PC use CRLF line endings.** For scripted replacements, write a script file. Bash heredocs on this PC drop backslashes and turn `\b` into a backspace: write scripts with the Write tool.

**Plain words everywhere.** The Collector and the judges must understand every label without training. Write labels a Class 10 student understands, in English and Tamil. No "isochrone", "HAND", "Dijkstra" or "edge" in the UI. The method panel may name methods in a second line.

---

## 1. The goal

> **Two days before heavy rain, the map plays out what the rain will do to Chennai: the streets that will go under water, the drains to clear first, the hospitals and fire stations that get cut off and the wards that lose quick help, the dry schools that can become relief centres. The Collector taps "Send tasks", approves, and every department gets its jobs. The map then shows the work getting done, the rain arriving, and afterwards which spots were saved and which still flooded. Every rain makes it smarter.**

The loop, in four words the judges will remember: **Warn → Act → Check → Learn.**

### 1.1 The story (use it in the demo, section 16)

IMD puts Chennai on **Orange** for Thursday. On **Tuesday morning** the Collector opens the console. The top band has turned the colour of rain: *"Heavy rain likely Thursday (IMD Orange). Rehearse now: 41 hours left."* One tap and the map flies over the city:
- **glowing blue streets** where it flooded in past rains, brightest where it flooded every time;
- **orange choke points** on those streets: drain complaints still open;
- **hospital and fire-station reach** drawn as the roads they can reach in 10 minutes, **shrinking** when the blue streets go under, and **grey wards** that lose quick help;
- **green dry schools** that can serve as relief centres;
- **lakes filling** and **river gauges** showing how close each is to danger, live.

The Collector taps **Send tasks**. The plan is grouped by department: clear these 9 drains, keep a pump at this fire station, keep an ambulance on the dry side of this hospital, divert traffic from these roads, open these schools. Approve. Each officer sees their jobs on their own map with a visit order, closes each with a geotagged photo, and the Collector watches the pins turn green: **"Ready 34 of 52, rain in 6 hours."** On Thursday, complaints drop onto the map next to the predicted outlines. On Saturday, the report card: **saved, still flooded, missed**. The missed ones join the flood memory for next time.

### 1.2 Who uses it, and for what

| Person | What they need before a heavy rain | What Rain Rehearsal gives them |
|---|---|---|
| **District Collector** | "Where will it hurt, who must do what, by when, and is it done?" | The rehearsal map, one-tap task plan by department, live readiness meter, after-rain report |
| **Collector, during the rain** | "Is it happening where we said? Which hospitals are cut off right now?" | Live complaints over the predicted outlines, live gauges and lakes, current reach of help |
| **Department officer** (dept-locked) | "Which of the before-rain jobs are mine, where do I go first?" | Their jobs on their own map, **Visit order**, mark done with a geotagged photo |
| **Disaster cell / TNSDMA-style reviewers** | "Was the district ready, and did it help?" | Readiness by department, a one-page rehearsal sheet and the after-rain report card, in Tamil and English |
| **Judges (FarmwiseAI)** | "Is this the GIS decision tool our clients (TNSDMA, TNDRRA) need?" | Anticipatory action on a live map, real road routing, proof by replaying a real past rain |

Every screen answers: **"what will the rain hit first, and what can I do about it now?"**

---

## 2. Why this wins (the research)

### 2.1 What the official systems already do, and the gap we fill

- **CFM-DSS, Chennai's Real Time Flood Forecasting and Spatial Decision Support System** (`chennaifloodmonitor.tn.gov.in`, Water Resources Department) gives a **72-hour early warning** and **street-level inundation forecasts for the major flood-vulnerable areas**, identified from historical floods (its project page names Nungambakkam, Meenambakkam, Velachery, Saidapet, Mambalam, Mudichur). It publishes **bulletins**: observed rainfall, rainfall forecasts (ECMWF and NCEP-GFS, deterministic and ensemble), lake inflow and lake level forecasts, river level forecasts and a **Street Flood Inundation Forecast**. Our CFM collector already lists these bulletins (section 4.3).
- **C-FLOWS** (NCCR, launched 2019) is a ward-level flood warning web GIS with a library of 700+ pre-computed flood scenarios; warnings go to revenue officials through **TNSMART**.
- **GCC** names about 207–219 flood-vulnerable locations each year, keeps ~215 relief centres and ~111 kitchens ready, and places high-capacity pumps in waterlogging-prone spots (Velachery, Ambattur SIDCO, Tiruvottiyur, Manali). These lists live in press releases and review meetings, **not on a map tied to open complaints and to who must act**.

**The gap:** the forecasts say *where water will be*. Nobody turns that, two days ahead, into **"these drains, these pumps, these hospitals, these officers, by Wednesday night, and was it done?"** That is Rain Rehearsal. It **uses** the official forecasts as the trigger and quotes them; it adds the **local memory** (complaints from past rains), the **consequence** (roads, help and shelter, by real road routing), the **action** (tasks with approval and follow-up) and the **check** (after-rain report). It never competes with the official forecast.

### 2.2 Anticipatory action: the method we follow

Humanitarian agencies (IFRC Early Action Protocols, the Anticipation Hub, WFP/OCHA anticipatory action) use one simple pattern: **a pre-agreed trigger + pre-agreed actions + the lead time to do them + a check afterwards.** Lessons from their trigger studies, built into this feature:
- **Lead time decides which actions are possible.** Drains and pumps need about 24–48 h. Rain Rehearsal therefore has **three levels** (Watch at ~72 h, Rehearse at ≤ 48 h, Act at ≤ 24 h), each with the actions that fit its time (section 7.1).
- **Know the skill of your trigger before you trust it.** We show **how well the flood memory worked on past rains**, measured honestly against chance (section 7.11), before asking anyone to act on it.
- **Cheap actions for uncertain forecasts, costly ones only for strong ones.** Yellow → watch and check; Orange → clear drains, place pumps; Red or a lake release → open relief centres, ambulances on the dry side.

### 2.3 Road access to help during floods: what research does, and we do the same

- A study of the 2013 Jakarta flood (Klipper, Zipf, Lautenbach, AGILE 2021) used OpenStreetMap roads and found that **roads cut by water raised travel time to the nearest hospital for about 1.5 million people**, beyond those flooded directly.
- Recent work (DISruptionMap, 2024; World Bank/ICRS 2026; Pakistan 2025 floods) does the same thing everywhere: **remove the flooded road pieces from the road network, then route again** to hospitals and services. DISruptionMap counts a road as impassable above ~27 cm of water, the depth at which ordinary cars stall.

We do exactly this, on Chennai's real OpenStreetMap road network, with **no package and no server**: our own road graph and shortest-path code (section 7.3), precomputed for normal roads and for rehearsal roads.

### 2.4 FarmwiseAI: speak the judges' language

| FarmwiseAI | Rain Rehearsal |
|---|---|
| **MapsAI**: ask the map in plain words; "142 parcels found · map layer ready" | Ask the Map answers rehearsal questions: "what will flood Thursday?", "which hospitals get cut off?", "dry schools near Velachery", in English, Tamil and Tanglish (section 9) |
| **Field Inspection** (கள ஆய்வு, Vellore; Yadadri Collector's system): assign, geotagged photo proof, close with report | Before-rain tasks to officers, closed with a geotagged photo checked against the task's place (section 7.9) |
| Clients **TNSDMA, TNDRRA** (disaster management) | A disaster-readiness loop on the Collector's own map, with a report card a disaster authority can read |

Use FarmwiseAI's names only where the comparison is true. Never claim FarmwiseAI endorses us.

### 2.5 GroundTruth (the competitor proposal)

GroundTruth lists "disaster mode" as a **future extension**, has no routing, no tasks, no Tamil, and a mocked satellite feed. Rain Rehearsal ships the whole loop, on real roads, with proof from a real past rain.

---

## 3. The selling lines (plain words; use them in the empty state and the demo)

1. **"See tomorrow's flood today."** Two days ahead, the map shows where the rain will hurt, from where it hurt before.
2. **"Fix the drain before the rain."** Every open drain complaint on a flood street becomes a job, with a deadline before the rain.
3. **"Who loses help when the roads go under?"** Real road routing shows which hospitals and fire stations get cut off, and which wards lose quick help.
4. **"From warning to work in one minute."** Send tasks, approve, done: each department gets its own list.
5. **"Watch the city get ready."** Pins turn green as officers finish, with photo proof.
6. **"After the rain, the truth."** Saved, still flooded, missed. The map learns from every rain.
7. **"We don't guess the weather."** The trigger is IMD's and the Chennai Flood Monitor's own warning, quoted.

---

## 4. What already exists (measured 29 Oct 2026; re-verify every line in Phase 0)

Portal: `chennai-grievance-portal-main/` (Next.js 14.2, TypeScript, Leaflet 1.9.4, zod, vitest, Playwright-core). Store: `DATA_BACKEND=aws`, snapshot loaded into in-memory SQLite (`src/lib/aws/store.ts`); queries go through `intelPool` (`src/lib/collector/db.ts`). Durable rows (emails, follow-ups, audit, workspaces) live in `data/aws-cache/durable.sqlite` and sync to DynamoDB only on the saving PC.

### 4.1 The store: water incidents (local cache, 29 Oct 2026)

| Fact | Value |
|---|---|
| `incidents` | 27,757 rows, 75 columns |
| Water-related (`family` FLOOD or DRAINAGE) | **4,587**: FLOOD_WATERLOGGING 1,755 · DRAINAGE_SEWAGE 1,554 · DRAIN_WORKS_SAFETY 722 · WATERBODY_INFRA 230 · FLOOD_RELIEF 151 · FLOOD_RISK_SIGNAL 111 · WATER_SUPPLY 64 |
| Open now (`is_open = 1`) | 517 |
| Place good enough for a street (`loc_precision_m ≤ 300`) | 4,038 (≤ 50 m: 3,944) |
| Synthetic (`is_synthetic_any = 1`) | 4,312 of 4,587. **Keep the existing `testData` handling; add no "real/simulated" badges (standing decision C-1). The demo says "on our test data" for measured hit rates.** |
| Rain days (`district_intel/output/state/grievance_rain_days.txt`) | 11: 19 May, 18 Jul, 9–10 Aug, 28 Aug, 6 Sep, 19–20 Sep, **21–23 Oct 2026** |
| Water incidents reported 0–2 days after each rain day | 150–288 (21 Oct: 288), against ~76 in an average 3-day window: **rain clearly shows in the data** |
| Event columns useful here (`events`) | `weather_related`, `access_blocked`, `blockage_minutes`, `hazard_flag`, `vulnerable_flags`, `service_disruption`, `geo_level`, `loc_precision_m` |

**Feasibility measured (Phase 0 must re-measure; never quote these numbers in the UI):** flood memory built only from incidents before 21 Oct (FLOOD_WATERLOGGING ×2, rain-window ×2, 400 m grid) covered **39.6 %** of the 164 waterlogging incidents of 21–24 Oct with its top 200 cells, against **7.8 %** for 200 cells picked at random (2,551 cells have any incident): **about 5× better than chance**. With 250 m cells: 20.1 % against 3.8 %. Your street-level memory (section 7.2) must **beat these grid numbers** on the same split, or say why not.

### 4.2 The store: live and reference data

| Table | What matters |
|---|---|
| `observation_signals` (190 rows, newest reading per place and metric) | `lake_pct_full`, `lake_storage_mcft`, `lake_outflow_cusec` (18 lakes), `reservoir_inflow_cusec` (2), `rainfall_24h_mm` (4 weather stations), `imd_warning_level` (1), hospital `total_beds`, `occupied_beds`, `bed_occupancy_pct`, `ambulance_available`, `emergency_cases` (9 hospitals); each with `observed_at`, `ewma7`, `mean28`, `zscore`, `slope_per_day`, **`days_to_full`** |
| `observations` (31,180) | history of the same metrics (for "how fast is this lake rising?") |
| `forecasts` (160) | IMD city forecasts: `location_id, issued_at, valid_from, forecast_text, source_url`. **No rainfall in mm**: only text ("Generally cloudy sky with Light rain"). Valid to 3 Nov 2026 in the cache |
| `pwd_works` (255) | water works: desilting 91, bund_strengthening 40, flood_mitigation 19, canal_lining 15, sluice_repair 10, encroachment_removal 8; status in_progress 121, sanctioned 3, on_hold 2; `target_date`, `physical_progress_pct`, `progress_gap_pct`, lat/lon |
| `ref_facilities` (197) | police_station 60, river_gauge 26, lake 18, govt_building 14, canal 12, drain 11, river_stretch 10, hospital 9, sluice 7, bridge 7, bund 8, weather_station 4, gate_site 2; `basin`, `downstream_taluks`, `capacity` |
| `alerts` (64) | the console's alert lane (`type, severity, title, message, explanation, place, zone_no, date, category_code`) |
| `ref_departments` | names, lead department per category, escalation chain, playbook |

### 4.3 Official feeds already collected (files, not yet all in the store)

- **IMD** (`imd_weather_collector/data/`): `imd_weather_warnings_chennai.csv` (district warning per day: `valid_from, valid_to, warning_colour` Green/Yellow/Orange/Red, `warning_text`), `imd_weather_forecasts_chennai.csv`, observations. `src/lib/assistant/warnings.ts` and `src/app/api/collector/alerts/route.ts` already read warnings.
- **CFM-DSS** (`cfm_dss_collector/`), endpoints fetched hourly by Playwright: `GetCriticalWaterLevel` and `GetDangerMaxWaterlevel` (river points with `warninglevel`, `dangerlevel`, `diff_to_warning`, `diff_to_danger`), `GetCsectionAndWaterLevel`, `GetAWLR_AWRSData` (sensor list), `GetAllSubBasinAndPointid` (Adyar, Cooum … points), `GetTankDataByDate` (lakes: `ftl`, `waterlevel`, storage), `GetHistoricalDataForReservoir` (inflow, discharge, gates open), `GetPublishAlert`, **`GetBulletins`** (bulletin list with `linktext`, `date`, PDF `filename`: "Observed Rainfall", "Rainfall Forecast ECMWF/NCEPGFS", "Lake Inflow Forecast", "Lake Water Level Forecast", "River Water Level Forecast", **"Street Flood Inundation Forecast"**). Outputs: `cfm_dss_gauge_observations_chennai.csv`, `cfm_dss_gate_operations_chennai.csv`, `cfm_dss_alerts_chennai.csv`, `cfm_dss_station_coverage.csv`. The PDFs themselves are **not** downloaded today.

### 4.4 Map code (from Ask the Map, 28 Oct 2026)

- `src/components/collector/app/SatMap.tsx`: the console map (Collector Overview, officer Board and Cards). **Its props are used by three screens: do not change their meaning.** Pins on canvas, ward polygons, `flyTo` / `flyToBounds`, `.mfocus` ring, marker scale by zoom.
- `src/components/collector/app/askmap/*`: `AskMapPanel.tsx`, `AskOverlay.tsx`, `useMapAsk.ts`, `answerLayers.ts`, `actions.ts` (Export, Save view, officer **Visit order**: nearest-neighbour + 2-opt, straight legs), `leafletSafe.ts` (crash guard), `Chrome.tsx`, `askmap.css`.
- `src/lib/map/*`: `geom.ts` (haversine, boxes: **use it, do not add a fourth distance helper**), `types.ts` (`LayerId`, `World`), `world.ts` (loads the map world, OSM layers and live conditions), `conditions.ts` ("On the ground now": IMD warning, nearest rain, lakes near full, PWD water works), `plan.ts`, `route.ts` (rules router, EN/TA/Tanglish, `FACILITIES`), `execute.ts`, `answer.ts`, `camera.ts` (the shot per answer), `insights.ts`, `ai.ts` / `wire.ts` (AI fills a flat plan schema), `resolve.ts`, `words.ts`.
- `src/app/api/map/*`: `ask`, `export`, `insight`, `layers`, `suggest`, **`send`** (Collector only: re-runs the answer on the server and drafts **one email per department** via `draftBatchAction`; `sendBatchAction` sends one approved draft, sandbox by default, with a follow-up per case and an audit row).
- OSM layers in `data/layers/` (built by `scripts/build-map-layers.mjs`, ODbL, attribution in `meta.json`): schools 647, colleges 187, hospitals, fire_stations, police_osm, rail_metro, osm_places, water_bodies, waterways, **roads (3.8 MB)**. **The roads layer is merged by street name for drawing; it has no shared nodes, so it cannot be routed.** Section 7.3 builds a separate routable graph.
- `src/lib/collector/actionmail.ts`: `draftAction`/`sendAction` (one incident), `draftBatchAction`/`sendBatchAction` (`BATCH_MAX = 25` cases per email), `delivery()` (sandbox/live), `tidyEmail()`. Writes `outbound_emails`, `followups (email_id, contact_id, incident_id, summary, due_date, status)` and `audit_log`. **The officer console does not read `followups` today.**
- Console: Collector pages `overview | briefing | trends | environment | studio` (`CollectorApp.tsx:64`); top band `AlertBar.tsx`; `/` palette; floating Ask button (keep it); fixed canvas **1366 × 680**. Officer pages `overview | work` (`src/components/officer/OfficerApp.tsx:57`), map on `Board.tsx`.
- AI: `src/lib/ai/gateway.ts` `generateJson<T>` with a zod schema; providers groq, bedrock, gemini. **Groq needs every schema field required** (use `nullable`, never `optional`), and refuses nested unions (flat schemas).
- Glossary: `src/lib/reference/metrics.ts` (`METRICS`, `pctChange`, `MIN_PCT_BASE = 20`, `dataAge`). Every new measure goes here (section 12).

**Standing decisions (do not reopen):** numbers come from code, never from AI · officers stay locked to their department, no switcher · keep the floating Ask button · design for the 680 px-tall canvas · Marina look in FarmWise green, light and dark · motion only in the existing style (`motionfx.css`) · email sandbox in demos · **no forecasts of our own**.

---

## 5. What the Collector sees

### 5.1 Where it lives (no new page)

1. **The top band** (`AlertBar.tsx`). When a trigger fires (section 7.1) the band becomes the **Rain band**: a soft animated rain texture (CSS only, `prefers-reduced-motion` turns it off), the official words quoted, the countdown and one button:
   > 🌧 **Heavy rain likely Thursday** · IMD Orange for Chennai, issued 28 Oct 13:00 · **41 h left** · [ **Rehearse** ]
2. **The Overview map** (`SatMap.tsx` via a new overlay component). **Rehearse** grows the map (same "grown" view Ask the Map uses) and turns on the **Rehearsal layer**. A **Rehearsal** chip also sits in the map's layer menu, so the Collector can open it any day ("Rehearse a heavy rain now").
3. **Ask the Map**: rehearsal questions open the same layer (section 9).
4. **The `/` palette**: "Rehearse", "Rain plan", "மழை ஒத்திகை".
5. **The officer Board**: a **Before-rain tasks** card appears when the officer's department has tasks (section 10).
6. **Briefing page**: after a rain, the **report card** appears at the top for 7 days (section 7.10).

### 5.2 Layout at 1366 × 680 (no page scroll)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🌧 Heavy rain likely Thu · IMD Orange · 41 h left            Ready 0/52 ▮▯▯▯▯ [Send tasks]│  ← Rain band
├───────────────────────────────────────────────────────────────┬─────────────────────────┤
│                                                               │ RAIN REHEARSAL          │
│                     MAP (grown)                               │ Thu 30 Oct · IMD Orange │
│   blue streets · choke points · reach of help · dry schools   │ ─────────────────────── │
│   lakes filling · gauges · grey wards                         │ 38 streets likely  ⓘ    │
│                                                               │ 61 open drain jobs      │
│   [legend, 5 rows, folds]          [layers: ✓Streets ✓Help    │ 3 hospitals cut off     │
│                                     ✓Drains ✓Schools ✓Water]  │ 7 wards lose quick help │
│                                                               │ 12 dry schools          │
│                                                               │ ─────────────────────── │
│                                                               │ What to do first (5)    │
│                                                               │ 1 Clear 9 drains, Velach│
│                                                               │ 2 Pump at Saidapet FS … │
│                                                               │ [ Send tasks (52) ]     │
├───────────────────────────────────────────────────────────────┴─────────────────────────┤
│ ◀  Now ─── Wed (Act) ─── Thu 🌧 Rain ─── Fri (Check) ─── Sat (Learn)  ▶   ⟲ Replay a rain│  ← Rehearsal clock
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

- Right panel 300 px, map the rest. Numbers are big; each has ⓘ with its glossary definition.
- On phones (< 768 px): the panel becomes a bottom sheet with three snap heights; the clock becomes a row of five chips.

### 5.3 The rehearsal clock (the heart of the experience)

A slider under the map with five stops. **The map changes by itself at each stop**; no other control is needed.

| Stop | When | What the map shows | Panel |
|---|---|---|---|
| **Warn** | now (T−48 h … T−24 h) | blue streets, choke points, reach of help (normal vs rehearsal), grey wards, dry schools, lakes, gauges | counts + "What to do first" + **Send tasks** |
| **Act** | T−24 h … rain | the same, plus task pins (orange → green as done), officer routes | **Readiness meter**: done / total, by department, late tasks |
| **Rain** | rain window | live complaints dropping in (new pins pulse once), **ghost outlines** of predicted streets, live gauges and lakes, reach of help **now** | "Where it is happening": matches with the prediction so far |
| **Check** | rain + 48 h | every predicted street marked **Saved / Still flooded / Quiet**; every flooded spot we did not predict marked **Missed** | report card |
| **Learn** | after Check | the updated flood memory: new streets added, old ones fading | "Memory changed: +6 streets, 3 faded" |

The clock also has **⟲ Replay a rain**: pick any past rain day; every computation then uses only data from before that moment (section 7.11). This is how the demo proves the idea.

### 5.4 Tap anything: it explains itself

- **A blue street:**
  > **Velachery Main Road** (Ward 177) · **Likely to flood**
  > Flooded in **4 of the last 5** heavy rains · **3 open drain complaints** · **220 m** from Veerangal Odai · **Desilting late by 12 days** (PWD)
  > *Based on where it flooded in past rains. Not a forecast.* [Show the past complaints] [Add job]
- **A hospital:**
  > **Govt Hospital Saidapet** · 140 beds, 88 % full, ambulance available
  > **Normal:** reached from 9 wards in 10 min · **Rehearsal:** from 4 wards · Main road **Anna Salai (Saidapet stretch)** likely under water. Best dry route: via **Jones Road**, 6 → 14 min.
  > [Show route] [Add job: ambulance on dry side]
- **A grey ward:** "Ward 170 loses quick help: nearest fire station 7 min → 19 min in rehearsal."
- **A lake:** "Chembarambakkam 91 % full (CFM, 06:00), rising 1.2 points a day · if released, 14 wards within 500 m of the Adyar downstream."
- **A gauge:** "Adyar at Saidapet bridge: 0.6 m below warning level (CFM, 06:30)."
- **A dry school:** "Corporation School, Kodambakkam: not on a flood street, reachable on rehearsal roads, 1.1 km from the nearest blue street." [Add job: open as relief centre]

### 5.5 "Send tasks"

Opens the **Rehearsal plan** over the panel: jobs grouped by department, each with its place, reason, deadline (before the rain, by lead time), and a tick. The Collector can untick, edit text, or add from the map. **Approve** drafts **one email per department** through the existing batch email path and creates the tasks (section 7.9). The sandbox note shows as on Take action. Nothing leaves before Approve.

---

## 6. The map's visual language (it must read without a legend, and the legend is still there)

| Thing | Look | Motion |
|---|---|---|
| **Likely street** | road line in rain-blue, glow (2-layer stroke), width 3–7 px by how many past rains flooded it | a slow shimmer along the line (CSS dash offset, 6 s), off with reduced motion |
| **Possible street** | thinner, 50 % opacity blue | none |
| **Choke point** (open drain complaint on a likely/possible street) | orange square pin (distinct from round incident pins) | one pulse on first show |
| **Task pin** | small flag: orange = to do, green = done (with ✓), red = late | flips orange → green with the existing `motionfx` pop |
| **Reach of help, normal** | the roads reached within the threshold drawn in pale green under the map | — |
| **Reach of help, rehearsal** | the same roads, now only those still reached, in solid green; the lost part fades to grey | animated "shrink" from normal to rehearsal over 0.8 s when the layer opens |
| **Ward that loses quick help** | ward polygon hatched grey | fades in |
| **Hospital / fire station** | existing facility icons; a red ring when cut off | ring ripple once |
| **Dry school** | green school icon with a small roof | — |
| **Lake** | water polygon fill level = % full (bottom-up gradient), border red above 90 % | gentle rise animation to the current level |
| **Gauge** | pin with a tiny vertical bar: green → amber → red as it nears danger | — |
| **Release ribbon** | translucent band along the river downstream | flows downstream (dash animation) |
| **Ghost prediction** (during Rain) | dotted outline of likely streets | — |
| **Saved / Still flooded / Missed** (Check) | green ✓ street / blue-red street with ✗ / purple ➕ dot | — |

Colour-blind safe (check the palette against deuteranopia; blue/orange/green with shape differences, never colour alone). Light and dark themes both. Every map element has a screen-reader title. **Never more than ~600 drawn features at district zoom**: streets simplify and merge by name at low zoom; full detail from zoom 14.

---

## 7. How it works

All new logic lives in **`src/lib/rehearsal/`** (pure, unit-tested, no React), UI in **`src/components/collector/app/rehearsal/`**, APIs in **`src/app/api/rehearsal/`**, build scripts in **`scripts/`**. Every function that reads time takes an explicit **`asOf`** (section 7.11).

### 7.1 The trigger (`trigger.ts`): when the rain band appears

Inputs, each read with its time and source link:
- IMD district warning colour for the next 3 days (`imd_weather_warnings_chennai.csv` / the store's `imd_warning_level`);
- CFM-DSS: a **river point within `diff_to_warning ≤ 0.5 m`**, a **lake ≥ 90 % full and rising**, a **release** (gate operations: `gates_open_count > 0` or discharge rising), a new **Street Flood Inundation Forecast** or rainfall forecast bulletin in the last 24 h;
- the Collector's own switch ("Rehearse a heavy rain now"), logged with a reason.

Levels (plain words in the band):

| Level | Rule (all thresholds in `metrics.ts`, shown under ⓘ) | Band says |
|---|---|---|
| **Watch** | IMD Yellow within 72 h, or a lake ≥ 85 % and rising | "Rain watch: Yellow for Thursday. Have a look." |
| **Rehearse** | IMD Orange/Red within 48 h, or a CFM street-flood bulletin issued, or a river point ≤ 0.5 m below warning | "Heavy rain likely Thursday. Rehearse now: 41 h left." |
| **Act** | IMD Orange/Red within 24 h, or a release, or a river point at warning | "Heavy rain tomorrow. 18 of 52 jobs done." |

The trigger never invents a time: "Thursday" is the warning's `valid_from`. "41 h left" counts to `valid_from`. If two sources disagree, show both ("IMD Orange; CFM forecast bulletin of 28 Oct also issued"). Switching off before the window ends needs a reason (audit row).

### 7.2 Flood memory (`memory.ts`): where past rain hurt

**Unit: a street piece** = one edge chain of the routable road graph (section 7.3) between junctions, named from OSM. Street pieces in the same ward with the same name are grouped as one **street** for display.

**Which incidents count:** categories FLOOD_WATERLOGGING (weight 2), FLOOD_RISK_SIGNAL (1.5), DRAINAGE_SEWAGE (1), DRAIN_WORKS_SAFETY (0.5, only if the text mentions water stagnation; reuse `classify()` words); `loc_precision_m ≤ 300`; before `asOf`. Snap each to the nearest street piece within **60 m** (≤ 50 m precision) or **150 m** (≤ 300 m); otherwise it does not mark a street (it still counts for its ward). Use a simple grid index (no RBush needed; if you add RBush, say so).

**Rain events:** consecutive rain days form one event (19–20 Sep is one; 21–23 Oct is one). A **rain incident** is one reported from the event's first day to 2 days after its last day. Rain days come from `grievance_rain_days.txt` **and** from rainfall readings (`rainfall_24h_mm` ≥ 30 mm at any Chennai station, glossary), deduplicated. If they disagree, Phase 0 reports it.

**Score of a street piece** (shown as reasons, never as a bare number):

```
memory = Σ over rain events e:  weight(incidents on the piece during e) × decay(age of e)      [rain hurt here]
       + 0.3 × Σ weight(water incidents outside rain events) × decay(age)                     [it stagnates anyway]
decay(age) = 0.5 ^ (age_days / 180)                                                           [half weight after 6 months]

boosts (each × a factor fitted in Phase 2 on past rains, kept only if it improves the backtest):
  near water   : distance to a waterway line or water body ≤ 300 m
  low ground   : elevation below the ward's median by ≥ 2 m (section 7.6; optional)
  open drains  : open drain/flood complaints on the piece now
  late works   : a PWD water work within 300 m with progress_gap_pct > 10 or past target_date
```

**Tiers:** **Likely** = the street flooded in **≥ 2 rain events**, or its score is in the top `K_LIKELY`; **Possible** = flooded in 1 rain event or the next tier. `K_LIKELY` and the boost factors are fitted **only on rain events before the one being tested** (section 7.11) and stored in `data/rehearsal/calibration.json` with the backtest that justified them.

**Every Likely street must have at least one past complaint the Collector can click.** No street is ever marked from boosts alone.

### 7.3 Real road routing (`graph.ts`, `route.ts`, `scripts/build-road-graph.mjs`)

**Build once (script, re-run only on request):**
1. Overpass query for drivable roads in the district box plus a 3 km margin (so routes can leave and re-enter): `way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|service)$"]["access"!~"^(private|no)$"]` with **`out body; >; out skel qt;`** so ways come with **node ids** (shared nodes = junctions). Respect `oneway=yes/-1` (ambulances and fire engines may ignore one-way in an emergency: build both views, default *ignore one-way for emergency vehicles*, glossary). Back off and retry on a busy public server, as `build-map-layers.mjs` does. Keep the ODbL attribution.
2. Compact the graph: keep junctions and dead ends as nodes, merge the shape points between them into edge geometry. Store as **`data/roads/graph.bin`** (typed arrays: node lat/lon `Float32`, CSR adjacency `Uint32`, edge length m `Float32`, class `Uint8`, name index `Uint32`, ward `Uint16`, shape offsets) + `graph-meta.json` (counts, OSM base time, query, hash). Target **≤ 8 MB**; report the real size.
3. Assign each edge its ward (midpoint in ward polygon, `mapGeo()` rings) and its waterway distance.

**Speeds** (urban Chennai, an emergency vehicle without traffic; in `metrics.ts`, shown under ⓘ as *our assumption*): motorway/trunk 40 km/h, primary 35, secondary 30, tertiary 25, residential/unclassified 18, living_street/service 10. No live traffic is claimed.

**Shortest paths:** your own **Dijkstra with a binary heap** over the CSR arrays (and A* with a straight-line heuristic for single routes). Multi-source Dijkstra from all fire stations at once gives "nearest fire station time" for every node in one run.

**Two road states:**
- **Normal**: all edges.
- **Rehearsal**: edges on **Likely** streets are **cut**; edges on **Possible** streets are **slowed** (speed × 0.3). The glossary explains: *"We don't know the water depth. A street that flooded in two or more past rains is treated as closed; one that flooded once is treated as slow. Cars stall at about 30 cm of water."*
- **Now** (during Rain): edges with an **open** flooding complaint within 60 m in the last 12 h are cut, plus `access_blocked` events.

**What we compute (precomputed per road state; cached by `memory build id + graph hash`):**
- **Reach of help** for each hospital (government first; those with emergency in `observation_signals`) and each fire station: the edges reachable within **`T_HELP` = 10 min** (glossary, *our assumption, not a government norm*; the Collector may switch 5 / 10 / 15). Draw **the reached roads themselves**, never an invented hull.
- **Quick help by ward:** for each ward, the median node time to the nearest fire station and to the nearest hospital, normal vs rehearsal. A ward **loses quick help** when it goes from ≤ `T_HELP` to > `T_HELP`, or becomes unreachable.
- **Cut-off facility:** a hospital or fire station whose reached road length falls by ≥ 50 % or whose own access node is cut.
- **Detour:** for a cut-off hospital, the best rehearsal route from the nearest dry major road, with minutes normal → rehearsal and the street names it uses.
- **On demand** (`POST /api/rehearsal/route`): "route from X to Y avoiding flooding", for Ask the Map and the officer's visit order. Server-side, **p90 ≤ 150 ms**.

**Honesty:** the reach is a model on OSM roads with assumed speeds. Say so once in the method panel, plainly: *"Drive times use OpenStreetMap roads and typical speeds without traffic. They show which roads matter, not exact minutes."*

### 7.4 Choke points and jobs from complaints (`chokes.ts`)

Open incidents (`is_open = 1`) in DRAINAGE_SEWAGE, FLOOD_WATERLOGGING, DRAIN_WORKS_SAFETY, WATERBODY_INFRA on or within 100 m of a Likely or Possible street. Each one becomes a candidate job for its `lead_dept`, ranked by: on Likely > Possible, the street's memory score, `priority_score`, age, `sla_breached`. Incidents already covered by a pending follow-up are marked "already asked on <date>" and not asked again unless the Collector ticks them.

### 7.5 Dry schools and relief (`shelter.ts`)

Schools (OSM layer) that are **not within 150 m of a Likely street**, are **reachable on rehearsal roads** from a hospital within 15 min, and have a name. Prefer government / corporation schools (OSM `operator` or name contains Corporation/Government/அரசு/மாநகராட்சி). Label them **"Possible relief centre"**, never "relief centre": the official list is GCC's. If the user later provides GCC's relief-centre list (Source Scout or a CSV), show official ones with a badge and use those first.

### 7.6 Low ground (`elevation.ts`, optional, kept only if it helps)

Elevation from **AWS Terrain Tiles** (open data, no key: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, height = R×256 + G + B/256 − 32768; SRTM ~30 m underneath; attribution required). Fetch zoom 13–14 tiles for the district once (`scripts/build-elevation.mjs`, a few MB), sample at each edge midpoint, store per edge in the graph. Chennai is flat and SRTM has metres of error, so **use only the relative signal** (below the ward's median by ≥ 2 m) as one boost, and **keep it only if the backtest improves** (report both numbers). Never show elevation in metres to the Collector; say "lower than its surroundings".

### 7.7 Lakes, rivers, releases and official bulletins (`water.ts`)

- Lakes: `observation_signals` `lake_pct_full`, `slope_per_day`, `days_to_full`, `lake_outflow_cusec` + CFM tank data. Show fill level and trend.
- River points: CFM `GetDangerMaxWaterlevel` / critical levels: current level, warning, danger, `diff_to_warning`. Join to basin (`GetAllSubBasinAndPointid`).
- **Release ribbon:** when a reservoir's discharge rises or gates open (CFM gate operations), draw the river downstream (OSM waterways named Adyar / Cooum / Kosasthalaiyar … matched by basin) and list **wards within 500 m of it**. These wards get playbook tasks (section 7.8).
- **Official bulletins (P1, needs the user's OK to extend the collector or to fetch PDFs from the portal side):** fetch the newest *Street Flood Inundation Forecast* and *Rainfall Forecast* PDFs listed by `GetBulletins`, extract text with a pure-JS PDF text reader (or `pdftotext` if present; ask before adding a package), and match named areas to our places with the existing resolver. Show a badge on matching streets/wards: **"CFM forecast 28 Oct names this area"**, with the PDF link. If the PDF is an image with no text layer, show the bulletin link only. **Never let AI read numbers out of a bulletin.**
- NDMA **SACHET** CAP alerts (P2): only if a public Tamil Nadu feed is confirmed in Phase 0; otherwise skip and say so.

### 7.8 The playbook (`playbook.ts`): from the map to tasks

Rules, not AI. Each rule: **when** (trigger level + map condition) → **job** (department, text template EN/TA, place, deadline rule). Departments come from `ref_departments` and the incident's `lead_dept`; never hard-code an officer.

| When | Job (department) | Deadline |
|---|---|---|
| Open drain/flood complaint on a Likely/Possible street | "Clear the drain at <place> (complaint <no>, open <n> days)" (incident's lead dept, usually storm-water drains) | rain − 24 h |
| Likely street with no open complaint but ≥ 3 past rain events | "Check and clear drains along <street>" (storm-water drains) | rain − 24 h |
| PWD water work late within 300 m of a Likely street | "Finish or make safe <work> before the rain (progress <p> %)" (PWD) | rain − 24 h |
| Cluster of Likely streets (≥ 3 within 800 m) | "Keep a pump ready near <place>" (Corporation / fire service) | rain − 12 h |
| Hospital cut off | "Keep an ambulance on the dry side: <road>; tell the hospital its dry route" (Health) | rain − 12 h |
| Ward loses quick help | "Pre-position a fire tender at <dry point>" (Fire & Rescue) | rain − 12 h |
| Likely street that is a primary/secondary road | "Plan a diversion for <road> via <dry route>" (Traffic police) | rain − 6 h |
| Level Act or release, dry school chosen | "Keep <school> ready as a relief centre" (Revenue / Education) | rain − 6 h |
| Release ribbon | "Alert ward officers of wards <list> within 500 m of <river>" (Revenue / Corporation) | at once |

Deadlines are computed from the warning's `valid_from`; if a deadline is already past, the job says "as soon as possible". At most **`BATCH_MAX` (25) jobs per department per email**; more go into a second email ("and 12 more on the map"). Jobs are ordered by impact (on Likely streets first, then by memory score).

### 7.9 Tasks, officers and the readiness meter (`tasks.ts`)

**Storage (decide in Phase 0 with the user):**
- **Preferred:** one new durable table `rehearsal_tasks (task_id, rehearsal_id, dept, kind, title_en, title_ta, place_text, lat, lon, ward_no, incident_id NULL, due_at, status [todo|done|late|dropped], done_at, done_by, photo_ref NULL, photo_lat NULL, photo_lon NULL, email_id NULL, created_by, created_at)` and `rehearsals (rehearsal_id, trigger_json, as_of, memory_build, graph_hash, created_by, created_at, closed_at, report_json)`. **Ask before creating them.**
- **Fallback with no new table:** each job is a `followups` row (`summary` starts with `[RR:<rehearsal_id>:<kind>]`, `incident_id` when there is one, `due_date`), the rehearsal itself a workspace row. Say which was chosen in the Phase 0 report.

**Approve** → for each department: `draftBatchAction`-style draft listing its jobs (incident ids where they exist, the other jobs as lines), the Collector reviews and sends (sandbox by default), tasks created, one `audit_log` row per email with the rehearsal id. AI may word the email body (EN/TA) from the computed job list; the job list itself is code.

**Officer side** (section 10): sees only their department's tasks, marks **Done** with an optional photo; the browser's location at upload is compared with the task place (**≤ 300 m** = "checked at the place", otherwise "photo taken elsewhere", shown honestly, never blocked). Photo storage reuses the officer photo route (`src/app/api/officer/photos`).

**Readiness meter:** done / total, by department, by tier; **late** = past `due_at` and not done; **at risk** = due within 3 h and not started. The Rain band shows "Ready 34 / 52". A department behind by more than 30 % with less than 12 h left raises one alert in the alert lane (code rule).

### 7.10 Live and after the rain (`live.ts`, `report.ts`)

**Rain window** = from the warning's `valid_from` (or the first rain-day reading) to 48 h after the rain ends (no new rain-day reading for 24 h). During it:
- new water incidents appear as they arrive (poll `GET /api/rehearsal/state?since=` every **60 s** with an ETag; return only changes);
- the "Now" road state (section 7.3) updates at most every 10 min;
- the panel shows **"Where it is happening: 41 new flooding reports, 29 on predicted streets"**.

**Report card** (computed at the end of the window; recomputable any time):

| Mark | Rule |
|---|---|
| **Still flooded** | a Likely/Possible street with ≥ 1 flooding report within 60 m during the window |
| **Quiet** (shown as "No flooding reported") | a predicted street with no report. If its jobs were all done, it says **"Jobs done, no flooding reported"**. Never claim the jobs *caused* it |
| **Missed** | a flooding report ≥ 150 m from any predicted street. It joins the memory automatically, because memory is computed from incidents |

Headline: *"This rain: 29 of 41 flooding reports were on predicted streets (71 %). Picking the same length of street at random would catch about 9 %."* Both numbers computed (section 7.11). Also: jobs done before the rain, by department; cut-off hospitals that got their dry route; time from approval to done.

One-page **rehearsal sheet** and **report card** export (HTML print route rendered to PDF with the existing Playwright browser, Tamil shaped correctly; `reportPdf.ts`/jsPDF cannot shape Tamil). P1.

### 7.11 Replay and "no peeking" (`replay.ts`), the proof

- Every function takes `asOf`. Memory uses incidents with `first_reported_at < asOf`; calibration uses rain events that **ended before** `asOf`; open complaints are those open **at** `asOf` (from `incident_timeline` / status history, not today's status); lakes and gauges use the newest reading before `asOf`.
- **Replay a rain:** pick a past rain event; `asOf` = its first day minus 2 days. The map shows the rehearsal as it would have looked, then the clock plays the real reports in.
- **Backtest table** (Phase 2 and the method panel): for every past rain event with enough data, the share of its flooding reports on predicted streets, against the share for **the same total street length picked at random** (1,000 random draws, median and 90 % range), and against the 400 m grid baseline of section 4.1. Report **lift = ours ÷ random**. If the lift is below 2×, say so and do not present the feature as predictive; present it as "streets with a flooding history".
- A test proves no peeking: adding fake incidents dated after `asOf` changes nothing.

---

## 8. AI's role (small and safe)

AI may: word each department's email (EN/TA) from the computed job list (the Collector edits before sending); write one plain sentence above the panel ("Most risk is in the south: Velachery, Saidapet and Adambakkam") **from computed facts only**, checked by the existing number verifier (`verify.ts`); turn a free-text rehearsal question into the typed plan (Ask the Map's existing path). AI may not pick streets, tiers, routes, tasks, deadlines or numbers. With `AI_PROVIDER=none` everything works, with template text.

---

## 9. Ask the Map: rehearsal questions

Add a rehearsal **verb family** to the map's rules router (`route.ts`) and plan (`plan.ts`), executed by `src/lib/rehearsal/*`. Each answer uses Ask the Map's answer shape (big number, map layer ready, how it was worked out, actions) and its camera.

| Question (EN / TA / Tanglish) | Answer |
|---|---|
| "what will flood tomorrow?" · "நாளை எங்கே வெள்ளம் வரும்?" · "naalaiku enga thanni nikkum" | rehearsal layer for the next warning (or "no warning now; showing a rehearsal for a heavy rain"), Likely streets count |
| "which hospitals get cut off?" · "எந்த மருத்துவமனைகள் துண்டிக்கப்படும்?" | cut-off hospitals with detours |
| "wards that lose fire cover" | grey wards, minutes normal → rehearsal |
| "dry schools near Velachery" | possible relief centres within the area |
| "route from Saidapet GH to Guindy avoiding flooding" | the route on rehearsal roads, minutes, street names |
| "open drain complaints on flood streets in zone 13" | choke points, Send to department |
| "how did we do last rain?" · "கடந்த மழையில் எப்படி?" | the last report card |
| "replay 21 October" | replay mode at that event |
| follow-ups: "only Likely", "make it 15 minutes", "add police stations", "compare with Adyar" | edit the current plan, no AI call |

"Send these to department" on a rehearsal answer opens the **Rehearsal plan** (section 5.5), not a plain email.

---

## 10. Officers: the same map, their own jobs

- Officer Board shows **Before-rain tasks (n)** when their department has open rehearsal tasks: list + map pins + countdown.
- **Visit order** (existing) over the tasks, now with **real road routing on rehearsal roads** (section 7.3) instead of straight legs; "Open in Google Maps" stays (coordinates only, ≤ 9 waypoints, opened only by a click).
- **Done** with photo (section 7.9). The officer cannot see other departments' tasks; the server enforces `lockDept`, whatever the request says.
- Officers see the rehearsal layer (streets, help, water) for their department's area, without the Send tasks button.

---

## 11. Real time and efficiency (budgets; measure and report p90 on this PC)

| Work | Where | Budget |
|---|---|---|
| Road graph build | script, once | ≤ 5 min including download; graph ≤ 8 MB |
| Elevation build (optional) | script, once | ≤ 2 min, ≤ 10 MB downloaded |
| Flood memory + calibration | server, on store load, cached by store build id | ≤ 1.5 s |
| Reach of help, 2 road states, all hospitals + fire stations | server, after memory, cached | ≤ 3 s; served from cache after |
| `GET /api/rehearsal/state` (first open) | server | ≤ 400 ms, payload ≤ 400 kB gzip at district zoom |
| `GET /api/rehearsal/state?since=` (live poll) | server | ≤ 60 ms, ≤ 10 kB when nothing changed (304 with ETag) |
| `POST /api/rehearsal/route` | server | ≤ 150 ms |
| Map draw at district zoom | browser canvas | ≤ 600 features, first paint ≤ 300 ms after data, 60 fps pan on this PC |
| Clock stop change | browser | ≤ 100 ms (all stops' layers already in the payload) |

Load the graph once per server process (memory-mapped typed arrays from `graph.bin`). Never run routing in the browser. Re-use `world.ts` loading and caches; do not load OSM layers twice.

---

## 12. Laws for this feature

1. **Not a forecast.** Every risk screen says "Based on where it flooded in past rains. Not a forecast." Official forecasts are quoted with source and time.
2. **Every blue street has a clickable past complaint.**
3. **Every number has a glossary entry** in `src/lib/reference/metrics.ts` (name EN/TA, plain definition, formula, window, unit, minimum n), shown under ⓘ. New entries: likely street, possible street, rain event, rain incident, choke point, reach of help, `T_HELP`, quick help lost, cut-off facility, assumed speeds, dry school, readiness, late task, still flooded, missed, lift over random.
4. **No peeking** (section 7.11).
5. **Approve before anything leaves**; sandbox by default; audit every email and every switch.
6. **Officers see only their department.**
7. **Privacy:** no complainant identity anywhere.
8. **Plain words, Tamil too:** every label, band text, card and email has EN and TA, written by people-style templates (use the existing `words.ts` style).
9. **Works without AI** (`AI_PROVIDER=none`).
10. **Works on the 680 px canvas and at 375 px width.**
11. **Map props stay compatible** for all three SatMap callers.
12. **Attribution:** OpenStreetMap (ODbL), AWS Terrain Tiles, CFM-DSS, IMD: in the map's attribution and the method panel.

---

## 13. The method panel ("How this was worked out")

One fold-out in the panel, plain words first, method name second:
1. "We found the streets where people reported flooding in past heavy rains." *(n incidents, m rain events, precision ≤ 300 m)*
2. "We marked streets that flooded twice or more as likely, once as possible." *(tiers, calibration date)*
3. "We closed the likely streets on the road map and worked out how far help can drive in 10 minutes, before and after." *(OpenStreetMap roads, assumed speeds, shortest paths)*
4. "We added open drain complaints and late PWD works on those streets." *(counts)*
5. "On past rains, this caught X % of flooding reports, against Y % for random streets." *(backtest table)*
6. "Official words: IMD Orange for 30 Oct (issued …); CFM bulletin of 28 Oct." *(links)*

Each step shows its count; clicking a step shows that layer alone (as Ask the Map does).

---

## 14. Quality: built to have no bugs

### 14.1 Unit tests (vitest, no store)
- `graph`: tiny hand-made graphs (line, square, one-way, disconnected): Dijkstra and A* distances equal a brute-force oracle; multi-source equals min of single-source; cutting an edge never makes a route shorter; slowed edges only lengthen.
- `memory`: snapping (60/150 m), precision filter, rain-event grouping (consecutive days merge), decay, tiers; "Likely requires a clickable complaint".
- `trigger`: each level from fixtures; "41 h left" from `valid_from`; disagreeing sources both shown; no warning → no band.
- `playbook`: each rule from a fixture; deadlines past → "as soon as possible"; batching at 25; dedupe with pending follow-ups.
- `report`: still flooded / quiet / missed on fixtures; random baseline is reproducible with a seed.
- `replay`: **no-peeking property** (future incidents change nothing).
- `words`: every label has EN and TA; no banned words in the UI (isochrone, HAND, Dijkstra, edge, node).

### 14.2 Golden tests on the frozen store (`src/lib/rehearsal/rehearsal.golden.ts`)
- Replay of the 21–23 Oct event: counts of Likely/Possible streets, choke points, cut-off hospitals, grey wards, lift over random; each value equal to an independent oracle query in the test.
- Reach of help for 3 named hospitals, normal vs rehearsal, equal to an oracle Dijkstra.
- The rehearsal state payload matches its own drill-downs (every panel number = the count of the features it lists).

### 14.3 Property tests
- Random graphs: triangle inequality on results; cutting more edges never increases reach.
- Random `asOf`: memory monotone in time (adding past incidents never removes a Likely street unless decay drops it below the tier, and then the reason says "faded").

### 14.4 End-to-end (Playwright on `portal-aws-dryrun`, port 3001)
- With a fixture warning: band appears → Rehearse → map grows, layers on, panel numbers > 0 → tap a street card → Send tasks → untick 2 → Approve (sandbox) → tasks exist → sign in as an officer of that department → sees only their tasks → Done with a photo → Collector's meter goes up by one.
- Replay 21 Oct → clock to Check → report card numbers equal the golden values.
- 375 px width: bottom sheet works, no horizontal scroll. Dark theme screenshot. Reduced motion: no animation.
- Ask the Map: the nine questions of section 9 each return a rehearsal answer (EN, TA, Tanglish).

### 14.5 Performance
Measure every budget of section 11 (p90 of 50 runs) and report the table. Anything over budget is a bug.

### 14.6 Self-review before every phase report
Re-read the laws (section 12); grep the UI for banned words; check every number on screen has ⓘ; check no complainant fields reach any payload (test asserts the payload's keys); check SatMap callers still render; `tsc`, all unit tests, golden tests.

---

## 15. Phases (stop after each one)

**Phase 0: verify and measure (no feature code).**
Re-verify section 4 against the code and the store; list differences. Re-run the feasibility backtest of section 4.1 and report it. Check: IMD warnings file freshness and colours present; CFM endpoints in the latest raw cache; whether bulletin PDFs are reachable and have a text layer (download **one** for inspection only, into the scratchpad); whether a SACHET feed for Tamil Nadu exists; the officer photo route; how `followups` are written. **Ask the user:** (a) the durable tables of section 7.9 or the fallback; (b) permission to fetch bulletin PDFs (portal side or collector change); (c) one-way rule for emergency vehicles; (d) `T_HELP` default (10 min). Report and stop.

**Phase 1: road graph and routing engine.**
`scripts/build-road-graph.mjs`, `graph.bin` + meta, `graph.ts` (loader), `route.ts` (Dijkstra, A*, multi-source), ward and waterway per edge; optional `build-elevation.mjs` if the user agreed. Unit + property tests. Report graph size, node/edge counts, build time, three sample routes with minutes and street names (screenshot of them drawn on the map in a dev page or test harness).

**Phase 2: flood memory, calibration and the backtest.**
`memory.ts`, rain events, snapping, tiers, boosts, `calibration.json`, `replay.ts` with no-peeking, backtest table for every past rain event against random and grid baselines, with and without each boost. **Report the lift honestly.** If the lift is < 2×, stop and discuss with the user before building UI on it.

**Phase 3: trigger, rehearsal layer and the clock.**
`trigger.ts`, `water.ts`, `chokes.ts`, `shelter.ts`, reach of help (normal/rehearsal), `GET /api/rehearsal/state`, the Rain band, the overlay on SatMap, the right panel, cards, legend, the clock (Warn stop + Replay), the method panel. Light/dark, 680 px, 375 px. Screenshots.

**Phase 4: Send tasks, officers and readiness.**
`playbook.ts`, the Rehearsal plan sheet, Approve through the batch email path (sandbox), task storage as agreed, officer Before-rain tasks with real-road Visit order and photo done, readiness meter, Act stop, late/at-risk alerts. E2E of section 14.4 (first scenario).

**Phase 5: live rain, report card, Ask the Map.**
Rain stop with live polling and ghost outlines, "Now" road state, Check and Learn stops, report card on the Briefing page, Ask the Map verb family (section 9), official bulletin badges if agreed. E2E second and fourth scenarios.

**Phase 6: hardening, PDF and demo.**
Rehearsal sheet and report card PDFs (Tamil shaped), performance table, accessibility pass, dark theme, reduced motion, failure states (no warning, CFM down, no graph file: the feature says what is missing and still shows what it can), demo script with real numbers (section 16). Final self-review.

---

## 16. Demo script (2 minutes; fill every number in Phase 6 from the real answers, never from this page)

1. **(15 s) The problem.** "Every monsoon, the same streets flood, the same drains are blocked, and help can't get through. The warnings come two days early. The work doesn't."
2. **(25 s) Replay 21 October.** ⟲ Replay → pick 21 Oct. "This is what the map would have shown on 19 October, using only what we knew then." Blue streets glow; reach of help shrinks; *n* hospitals cut off; *m* wards grey.
3. **(20 s) Proof.** Slide to Rain: the real reports of 21–23 Oct drop in onto the blue streets. Check: **"X % of flooding reports were on predicted streets; random streets would catch Y %."** ("On our test data.")
4. **(30 s) Today.** Back to now (or a fixture Orange warning): the band, Rehearse, tap a hospital: "6 → 14 min, dry route via Jones Road". **Send tasks** → the plan by department → Approve (sandbox).
5. **(20 s) Officer.** Switch to the drains officer: their jobs, visit order on real roads, Done with a photo → back to the Collector: the pin turns green, "Ready 1 / 52".
6. **(10 s) Ask the Map, in Tamil.** "நாளை எங்கே வெள்ளம் வரும்?" → the same layer.
7. **(10 s) Close.** "Warn, act, check, learn. On the Collector's map. Built on IMD and the Chennai Flood Monitor's own warnings. We never guess the weather."

---

## 17. Report format (after every phase)

1. **Done:** what was built, files touched (paths).
2. **Proof:** test counts (unit, golden, e2e), screenshots, measured numbers (with how they were computed).
3. **Differences from this prompt** and why (the code wins).
4. **Decisions taken** (only undoable ones) and **questions for the user** (one line each).
5. **Not done / risks**, honestly.

---

## 18. Sources (research, read 28–29 Oct 2026)

- Chennai Flood Monitor, project background and FAQ: https://chennaifloodmonitor.tn.gov.in/Master/AboutUs · https://chennaifloodmonitor.tn.gov.in/Master/FAQ
- How urban flood warning systems work (Business Standard, Jul 2026): https://www.business-standard.com/india-news/how-urban-flood-warning-systems-work-mumbai-chennai-show-the-way-126070900246_1.html
- C-FLOWS / NCCR ward-level warning: https://thewire.in/environment/nccr-develops-warning-system-for-flooding-in-chennai-with-ward-level-detail · https://www.nccr.gov.in/sites/default/files/clChen.pdf
- GCC monsoon preparedness, vulnerable spots, relief centres: https://www.dtnext.in/news/chennai/is-gcc-prepared-for-the-monsoon-746922 · https://www.dtnext.in/news/chennai/gcc-prepared-to-handle-northeast-monsoon-says-commissioner-sameeran · https://citizenmatters.in/chennai-northeast-monsoon-flooding-gcc-vulnerability-list-19969
- Anticipatory action and early action protocols: https://www.anticipation-hub.org/news/zambia-activates-its-early-action-protocol-for-floods · https://nhess.copernicus.org/articles/21/261/2021/nhess-21-261-2021.html · https://www.anticipation-hub.org/Documents/Reports/Anticipatory_Action_Pilot_2020__Trigger_Analysis_Bangladesh.pdf
- Flood impact on road networks and hospital access: https://agile-giss.copernicus.org/articles/2/4/2021/ (Jakarta) · https://arxiv.org/pdf/2410.05286 (DISruptionMap) · https://www.4tu.nl/resilience/ICRS26/02-infrastructure-utilities-and-economic-systems/02-elco-koks-a-rapid-decision-support-tool-to-assess-flood-induced-accessibility-disruptions.pdf
- AWS Terrain Tiles (open DEM): https://registry.opendata.aws/terrain-tiles
- NDMA SACHET: https://sachet.ndma.gov.in (feed for Tamil Nadu to be confirmed in Phase 0)

---

## 19. Definition of done

- A fixture (or real) IMD Orange warning turns on the Rain band; one tap shows the full rehearsal on the Overview map at 1366 × 680, light and dark, and at 375 px.
- Likely and Possible streets each open a card with clickable past complaints; reach of help shrinks from normal to rehearsal on **real OSM road routing**; cut-off hospitals show a dry detour; grey wards show minutes before and after; dry schools, lakes, gauges and the release ribbon show with their source and time.
- Send tasks → Approve drafts one email per department (sandbox), creates tasks, audits; officers see only their own, route on real roads, close with a photo; the readiness meter moves.
- Rain, Check and Learn stops work; the report card shows still flooded / no flooding reported / missed with lift over random.
- Replay 21 Oct works and the no-peeking test passes; the backtest table is in the method panel with the honest lift.
- Ask the Map answers the questions of section 9 in English, Tamil and Tanglish.
- Every number has ⓘ; no complainant data anywhere; works with `AI_PROVIDER=none`; all budgets met; `tsc`, unit, golden and e2e tests pass.
- Nothing committed or pushed without the user's word.
