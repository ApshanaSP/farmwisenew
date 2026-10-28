# ULTRA PROMPT: Ask the Map, District IQ's conversational map

> **How to use:** open a new Claude Code session in `D:\farmwisenew` and say:
> **"Read `docs/ASK_THE_MAP_ULTRA_PROMPT.md` completely and follow it. Start with Phase 0. After each phase, stop, show me the verification results, and wait for my go-ahead."**
>
> Written 28 Oct 2026 from: FarmwiseAI's website (products page and Urban & Public Governance projects, read 28 Oct 2026), the FarmwiseAI field-inspection app "கள ஆய்வு | Field Inspection" (Play Store, read 27 Oct 2026), the competitor proposal "GroundTruth" (`C:\Users\DELL\Downloads\proposal_copy.pdf`), feature F1 of `docs/DISTRICT_IQ_ULTRA_PROMPT.md`, and a survey of this repository on branch `aws-deploy` (head `6b60837`) and its local AWS store cache (`chennai-grievance-portal-main/data/aws-cache/`).
>
> This prompt builds **one feature completely**: Ask the Map. It replaces F1 of the bigger prompt. Where the two disagree, this one wins.

---

## 0. Read this first

You start with no memory of earlier work. Everything you need is in this document and in the repository. **Where this document and the code disagree, the code wins.** Tell the user what differs and adapt.

Work in phases (section 14). After each phase, stop and report in the format of section 16. Never start the next phase without the user's go-ahead.

**Ask the user before you:**
- install any package larger than ~5 MB, or anything native (small pure-JS packages under 100 kB, such as `rbush`, are fine if you say so in the report);
- change `district_intel/` collectors or generators (the map reads the store; it never changes the pipeline);
- add or change a durable table on the AWS store (`DURABLE_ADDED`, `/store/write`), or do anything destructive to any store;
- send any email in live mode (sandbox only: `EMAIL_MODE`, `EMAIL_SANDBOX_TO`);
- add any top-bar tab or new page (this feature has none: it lives on the existing console maps, section 5.1);
- commit, push or merge. The working tree has the user's uncommitted data files; never commit data files.

**Never:**
- let an AI model compute a number, write SQL, choose a feature to show, or move the map on its own. AI may only fill the typed plan (section 7.4) and word at most two sentences around computed numbers;
- build SQL from strings in a plan. Layers are loaded by fixed queries; plans run over in-memory features;
- show a complainant's name, phone, email or address on the map, in a tooltip, a list or an export;
- draw an incident as an exact pin when its location is coarser than the console's rule (`PIN_PRECISION_M = 2000`, `src/lib/collector/mapplace.ts`);
- hard-code a number in the UI, the demo or the tests. Every number shown comes from the data. Every expected number in a test comes from an independent oracle computation in the test itself (section 13);
- print, log or commit `.env` values, API keys or officer passwords.

**Test servers.** Use `.claude/launch.json`: `portal-aws-dryrun` (port 3001, `AWS_STORE_DRY_RUN=1`, nothing reaches DynamoDB) for everything. Never use port 3000 (the user's live server). Node on this PC needs `NODE_EXTRA_CA_CERTS` (already in launch.json). Checks: `npx tsc --noEmit`, `npx vitest run`, `npm run eval:golden` (frozen store; `npm run eval:freeze` only with the user's OK).

**Files on this PC use CRLF line endings.** For scripted replacements, write a script file; do not inline `\b` in heredocs.

---

## 1. The goal

> **The Collector asks the map a question in their own words, English, Tamil or Tanglish. The map flies to the answer, marks every case in the right place, says how many and why, shows how it worked it out, and turns the answer into an action in one click.**

This is the feature the judges will remember, because it is **their own flagship product, MapsAI, done for a Collector's desk**. It must feel like that the first time they touch it.

### 1.1 Who uses it, and for what

| Person | What they need from the map, today | What Ask the Map gives them |
|---|---|---|
| **District Collector** | Before the 9 am review: where is it bad, near what, whose job is it, what do I tell whom? | "waterlogging within 300 m of schools" → count, map, worst first, the responsible departments, "Send to department" |
| **Collector, monsoon night** | Which hospitals, schools and roads are cut off by water? Where to send pumps? | "open flooding within 500 m of hospitals" · "flooding along Anna Salai" · "compare Velachery and Adyar flooding this week" |
| **Collector, before a field visit** | What is happening in this place, across every department? | Click a ward, or drag a circle → **Area brief**: every department's open issues there |
| **Department officer** (dept-locked) | Which of *my* cases are near each other? Where do I go first today? | Same map, locked to the officer's department; **Visit order** for today's highest-priority open cases |
| **Judges (FarmwiseAI)** | "Is this better than what we sell?" | The MapsAI answer shape, plus Tamil, evidence behind every pin, the method shown, and an action at the end |

Every screen answers "what needs my attention here, and what can I do now?"

---

## 2. The bar we must beat

### 2.1 FarmwiseAI MapsAI (farmwiseai.com/products, read 28 Oct 2026)

What MapsAI says about itself:
- **Conversational GIS:** ask questions of maps in plain language with no query builders or GIS training. It turns each question into a spatial query, highlights the answer on the map and explains it in context.
- **Spatial search and analysis:** locate any parcel, asset or area by name, number or location, then run buffers, overlays, proximity and area calculations.
- **Automated insights:** detects change between survey cycles, tracks trends, raises alerts.
- **Enterprise integration:** role-based access, one spatial source of truth for every department.
- Its demo line: *"Show every parcel within 500 m of the proposed corridor"* → **"142 parcels found · map layer ready"**.

Related FarmwiseAI projects (Urban & Public Governance page):
- **Field Inspection Management & Monitoring System** for the **District Collector, Yadadri Bhuvanagiri**: the Collector monitors, assigns and closes every issue from a central WebGIS dashboard.
- **GHMC WebGIS + QR**: one spatial identity for every property, many departments on one record.
- **கள ஆய்வு | Field Inspection** app for the Vellore Collector: assigned sites, location checks, geotagged photos.

### 2.2 How Ask the Map meets and passes it

| MapsAI / FarmwiseAI | Ask the Map |
|---|---|
| Plain-language question → spatial query | Same, **in English, Tamil and Tanglish, typed or spoken** (`speech.ts`) |
| "N found · map layer ready" | Same answer shape, **plus one sentence of meaning and the responsible departments** |
| Highlights the answer | **The map flies to it** (section 8) and marks each case where it really is, with its location accuracy shown (section 9) |
| Explains what it found | **"How this was worked out"**: every step with its count; click a step to see that layer alone |
| Buffers, overlays, proximity | within, inside, along a road, nearest, farthest, count by area, hotspots, compare two areas, change over time |
| Role-based access | **Officers are locked to their department** by the server, whatever they type |
| One record, many departments (GHMC) | **Area brief**: one place, every department's open issues |
| Collector assigns and closes issues (Yadadri) | **Send to department** from the answer, one approved email per department, with follow-up |
| (not stated) | **Every pin opens its evidence**: reports, sources, photos, status history |
| (not stated) | **Plan chips**: edit "300 m" to "500 m" and the answer updates instantly, with no AI call |

Use FarmwiseAI's names in the UI copy or demo only where the comparison is true. Never claim FarmwiseAI endorses us.

### 2.3 GroundTruth (the competitor proposal)

Their "natural-language query" is a validated **filter object** (date, category, taluk, severity). It has no distance, no "near", no "along a road", no hotspots, no comparisons and no actions from the map. They have no Tamil and no officer view. Their satellite feed is a mock. Ask the Map does all of these, and it runs today.

---

## 3. Why the Collector will need this every day (the selling lines)

Put these in the demo and in the Ask box's empty state, in plain words:
1. **"Ask, don't search."** One sentence replaces filtering five dropdowns and a mental map of 200 wards.
2. **"It knows what is near what."** Schools, hospitals, police and fire stations, lakes, canals and roads are on the same map as every complaint and incident.
3. **"Every dot is real and checkable."** Click any pin to see who reported it, when, and its status. A location that isn't known exactly is never drawn as an exact pin.
4. **"From question to order in one minute."** Answer, then Send to department, then a follow-up is set.
5. **"In Tamil, too."** "அடையாறு அருகே திறந்த புகார்கள்" gets a Tamil answer.
6. **"Your officers see the same map, for their own work."** One map for the Collector and every department, with the right access for each.

---

## 4. What already exists (measured 28 Oct 2026; re-verify every line in Phase 0)

Portal: `chennai-grievance-portal-main/` (Next.js 14.2, TypeScript, Leaflet 1.9.4, zod, vitest, Playwright-core; **no Turf, no RBush**). Store: `DATA_BACKEND=aws`, snapshot loaded into in-memory SQLite (`src/lib/aws/store.ts`); queries go through `intelPool` (`src/lib/collector/db.ts`).

### 4.1 Map code

- **`src/components/collector/app/SatMap.tsx`**: the console map, used by the Collector's **Overview** (`Overview.tsx:109`) and the officer console (**`src/components/officer/Board.tsx:82`**, **`Cards.tsx:78`**). It shows:
  - base layers: Esri World Imagery, plus Esri road and place-name overlays from zoom 13;
  - 200 ward polygons and 15 zone outlines, with zone heat shading or a taluk colouring mode;
  - zone names that never overlap (`declutter`), and markers that scale with zoom (CSS `--pz`);
  - incident pins (`.mpin`: size by severity, pulse for open severe, faded when closed; **max 150 pins**) and stations (AQI, rain, lake);
  - items from added sources, fanned out when they share a point;
  - the selected incident ringed with `.mfocus` and reached by `flyTo(…, ≥14.5, 0.7 s)`; zones and taluks reached by `flyToBounds(…, 0.6 s)`;
  - screen-reader titles on pins, and a `pinColor` prop (the officer console colours by severity).
  - **Its props are used by three screens: do not change their meaning.**
- **`assistant/MapAnswer.tsx`**: the assistant's map answers (`map_zones`, `map_wards`, `map_points`, `map_hotspots`, see `chartspec.ts:18`). It frames with a static `fitBounds`, and scroll-wheel zoom is off.
- **`studio/StudioMap.tsx`**: the Data Studio map, with zone focus by `flyToBounds`.
- **`src/lib/collector/geo.ts`** `mapGeo()`:
  - wards: `{ ward, zone, taluk, rings: [lat, lon][][] }`, simplified to ~10 m;
  - zones: `{ zone, name, lat, lon, lines }`;
  - taluks: `{ code, name, lat, lon }`. **Taluks have no boundary**: a taluk is the union of its wards.
  - Ward boundaries are the DataMeet community dataset, not an official GCC publication (the `map_geo` tool says so). The file is `data/boundaries/gcc-wards.geojson`.
- **`src/lib/collector/mapplace.ts`**: `PIN_PRECISION_M = 2000`, the `PINNABLE` SQL rule, `isPinnable()`, and `PLACE_FILTERS` for "no exact place".
- **Incident detail** `Detail.tsx:167` has **"Show on map"** → `c.locate(i)` (`CollectorApp.tsx:511`).
- **Distance code exists in three places** (`conflicts.ts`, `intel.ts`, `nearby.ts`). Centralise it (section 7.1); do not add a fourth copy.

### 4.2 Data in the store (local cache, as of 27 Oct 2026 20:06)

| Table | Rows | What matters for the map |
|---|---|---|
| `incidents` | **27,778** (reported 1 May to 27 Oct 2026) | All have `lat/lon`. `loc_precision_m`: ≤ 50 m 24,752 · 51–300 m 619 · 301–2,000 m 1,797 · > 2,000 m 610 (not pinnable). **27,168 pinnable.** `is_open` = 1 for 2,736. `severity_level`: Low 12,836 · Medium 9,888 · High 4,147 · Severe 907. 35 `category_code`s (top: SOLID_WASTE 3,664, CRIME_PROPERTY 2,997, STREETLIGHT_ELECTRICAL 2,263, ROAD_ACCIDENT 1,872, FLOOD_WATERLOGGING 1,700). Open flooding: 217. Useful columns: `incident_id, category_code, category_label, family, lead_dept, depts_involved, ward_no, zone_no, zone_name, taluk_code, lat, lon, loc_precision_m, place_text, status_std, is_open, severity_level, priority_score, priority_reasons, sla_due_at, sla_breached, first_reported_at, last_update_at, hotspot_id, title, ai_summary_ta, citizen_complaints, source_count, vulnerable`. **`vulnerable`** holds tags read from the report text (`school`, `hospital`, `worship`, `bus_stop`, `children`, `elderly`…). These are *mentions*, not distances: never present them as "near a school". 27,019 rows have `is_synthetic_any = 1`. Keep the tools' existing `testData` handling, and add no "real/simulated" badges (standing decision C-1). |
| `ref_facilities` | **197 points** | police_station 60, river_gauge 26, lake 18, govt_building 14, canal 12, drain 11, river_stretch 10, hospital 9, air_quality_station 9, bund 8, sluice 7, bridge 7, weather_station 4, gate_site 2. **Canals and rivers are single points here, not lines.** **No schools, no fire stations, no relief centres, no roads.** |
| `hotspots` | 347 | DBSCAN 250 m clusters: id, category, lat/lon, wards, top place |
| `ref_wards` / `ref_zones` / `ref_taluks` | 200 / 15 / 18 | via `mapGeo()` |
| `ref_categories` / `ref_departments` | 35 / 27 | labels, lead department, playbook, escalation chain |
| `data/gcc-reference/intel-reference.json` | 81 places | **points** with `aliases_en` / `aliases_ta`, `requires_context` |
| `data/gcc-reference/streets.json` | 53,800 street names | GCC PGR list with locality and area; **no geometry** |
| `data/gcc-reference/areas-localities.json` | 250 areas, 4,883 localities | **no geometry, no ward numbers** |
| `chennai_hospital_data/` | 9 hospitals × daily rows | the same 9 hospitals as `ref_facilities` |

**So the map needs real facility, road and water layers that the store does not have.** Section 7.2 builds them once from OpenStreetMap.

Ward-level Getis-Ord Gi\* is computed in `district_intel/dintel/analytics.py`, but it is **not** in the portal's store. Phase 0 confirms this.

### 4.3 Assistant, language, AI and actions

- **Ask District IQ** `src/lib/assistant/*`:
  - `tools.ts`: 30+ typed tools, including `resolve_place` (`numberedPlace` for "ward 106" / "வார்டு 106", then `resolvePlace`), `place_breakdown`, `hotspots`, `map_geo`, `incidents`;
  - `fastpath.ts` / `intent.ts`: the rules router (it already answers "similar incidents within N km of the selected one");
  - `verify.ts`: numbers in AI text checked against the fact pack; `lang.ts`: EN / TA / Tanglish; `speech.ts`: voice; `fuzzy.ts`: `editDistance`, `closest`;
  - `access.ts`: `assistantSession()` gives `role` and **`lockDept`** (an officer's department comes from the database, never from the request). `pipeline.ts:161` `lockTools` puts that department into every tool's scope, and `scopeWhere` in `src/lib/collector/intel.ts:127` applies it as `i.lead_dept = ?`.
- **Place resolver** `src/lib/collector/nlp.ts`: `placeResolver()`, `resolvePlace()` → `{ place, ward, zone, taluk, conf, lat, lon }`; `classify()` and `categoryWords()` for category words.
- **AI** `src/lib/ai/gateway.ts`: `generateJson<T>({ … zod schema … })`, provider chain `AI_PROVIDER` / `AI_FALLBACK_PROVIDER` (groq, bedrock, gemini). **Groq needs every schema field required** (use `nullable`, never `optional`).
- **Glossary** `src/lib/reference/metrics.ts`: `METRICS`, `pctChange` with `MIN_PCT_BASE = 20`, `changeWords`, `deadlineState`, `dataAge`.
- **Actions** `src/lib/collector/actionmail.ts`: `draftAction(id, user)`, `sendAction(id, input, user)`, `delivery()`, `tidyEmail()`, `Recipient`. These are per incident, sandbox by default, with follow-up due in 24 h and audit. Audit helpers: `audit()` / `auditIn()` in `src/lib/collector/sources.ts`.
- **Console:**
  - Collector pages: `PageKey = "overview" | "briefing" | "trends" | "environment" | "studio"` (`CollectorApp.tsx:61`); tab labels at `CollectorApp.tsx:819`;
  - the canvas is a fixed 1366 × 680; the `/` palette (`CollectorApp.tsx:267`); the floating Ask button (keep it);
  - officer pages `overview | work` (`OfficerApp.tsx:57`).
- **Tests:** `vitest` unit tests; golden tests `src/**/*.golden.ts` on the frozen store (`vitest.golden.config.ts`, `AI_PROVIDER=none`).

**Standing decisions (do not reopen):**
- numbers come from code, never from AI;
- officers stay locked to their department, with no department switcher;
- keep the floating Ask button;
- design for the 680 px-tall canvas;
- Marina look in FarmWise green, light and dark;
- motion only in the existing style (`motionfx.css`);
- email sandbox in demos;
- no forecasts of our own.

---

## 5. What the Collector sees

### 5.1 Where it lives

**No new tab and no new page.** Ask the Map lives **on the existing console map**: the same `SatMap` instance on the Overview, with the same wards, zones, pins, stations, filters and look. The top bar does not change.

1. **On the Overview map**, an **"Ask the map…"** box sits top-left inside the map card. The Overview's zone or taluk filter is the question's context.
2. **The map grows in place.** When a question is asked, the Overview's map card expands to fill the Overview's canvas (the other cards slide away with the existing motion style), and the panel (5.2) opens over its left side. **"Back to overview"** (and Esc) shrinks it back with the answer still drawn. Clearing the question restores the normal Overview map exactly.
3. **In Ask District IQ**, spatial questions are answered by the same engine. The chat shows the `MapAnswer` with the camera, a count line and **"Show on the console map"**, which closes the dialog and runs the same plan on the Overview map at the same view.
4. **Incident detail "Show on map"** keeps its current behaviour. It gains **"What else is near here?"**, which runs `within 500 m of this incident, last 30 days, any department` on the Overview map.
5. **The `/` palette** gains "Ask the map: …", which runs the typed text on the Overview map.
6. **Officer console:** the Board's existing map gets the same Ask box and grow-in-place view, locked to the officer's department (section 10).

**How it joins the existing map (do not create a second map):**
- `SatMap.tsx` gains **optional** props only: `answer` (result features, context facilities, rings and corridors, area mask), `shots` (the camera, section 8), `onUserMove` (to detect the user taking over) and `onDraw` (click a ward, drag a circle, right-click a spot).
- With none of them passed, `SatMap` renders exactly as today. The Overview, officer Board and officer Cards keep working unchanged (tested by screenshots).
- The answer's layers go in their own layer groups on the same map, above the console's pins. While an answer is shown, the console's own pins dim to 25 % so that the answer stands out; they come back when it is cleared.
- The new panel is a separate component (`AskMapPanel.tsx`) placed by `Overview.tsx` and `Board.tsx` over the map.

### 5.2 Layout at 1366 × 680 (no page scroll)

- **The grown map fills the Overview's canvas** under the top bar and the alert bar.
- **A left panel, 380 px wide,** floats over the map with the page's glass style:
  - the **Ask box** (text field, mic button, send; Enter submits; ↑ recalls the last question);
  - **plan chips**, one per part of the plan, each with a ▾ menu to change or remove it;
  - the **answer card**: headline count + "map layer ready", one sentence of meaning, and the "as of" line;
  - **"How this was worked out"**, collapsed by default, with one row per step and its count;
  - the **result list**, sorted by priority, scrolling inside the panel; it lists **up to 200 rows** with "and N more · Export all" when there are more;
  - **actions**: Send to department · Export · Save view.
- **Right edge:** map tools: + / −, Whole district, Back to the answer, Layers (toggle facility and water layers), Satellite / Streets base map.
- **Bottom-left:** the metric scale bar (`L.control.scale({ imperial: false })`). **Bottom-right:** the legend, built only from the layers shown, with their counts. **Bottom edge:** attribution ("Imagery © Esri…", "© OpenStreetMap contributors" whenever an OSM layer is shown).
- **Phone width (< 768 px):** the map is on top; the panel becomes a bottom sheet with three heights (peek: Ask box + headline; half; full). The camera's padding follows the sheet (section 8).
- **Map tools** reuse the map's existing control style; add only what is missing (Back to the answer, Layers, circle tool, scale bar).

### 5.3 The empty state (Ask box focused, nothing asked yet)

- Six **suggested questions**, generated by rules from the live data so that each one returns a non-empty answer. Examples of the shapes: the category with the most open severe incidents near schools; this week's top hotspot category; the zone with the most past-deadline cases. Tapping one runs it.
- A short line: "Ask about any place, distance, road or area, in English or Tamil."
- The map stays exactly as the Overview shows it until a question is asked.

### 5.4 One question, end to end

*"waterlogging within 300 m of schools"*
1. The chips appear at once: `Flooding & waterlogging ▾` `Open ▾` `Last 30 days ▾` `Within 300 m ▾` `of Schools (OSM) ▾`. Defaults the question didn't state (open, last 30 days) carry a small "default" mark.
2. The camera flies to the results (section 8). Rings spread from the schools that have a case nearby; pins drop in by priority; the headline count ticks up as they land.
3. The headline reads **"N open waterlogging reports are within 300 m of a school (last 30 days) · map layer ready."** N, the zones and the school count all come from the data.
4. The sentence of meaning, e.g. "Most are in Zone X and Zone Y, near K schools; the Storm Water Drain department holds M of them."
5. The trace:
   1. Took open waterlogging incidents, last 30 days (a).
   2. Took schools from OpenStreetMap (b).
   3. Kept the incidents within 300 m of any school (N).
   4. Left out c that have no exact location.
6. In the list, each row shows: title, severity word, status, ward/zone, distance to the nearest school ("120 m from Govt Hr Sec School, Saidapet"), age, lead department.

**Follow-ups edit the plan; they never start over.** Each one below changes one part of the plan:
- "only severe"
- "make it 500 m"
- "add hospitals"
- "last 7 days"
- "compare with Adyar"
- "show by ward" (count by ward)
- "why these?" (opens the trace)
- "send these to SWD"

"Start over" or a new topic clears the plan. The plan is the conversation's state; it is kept per tab (sessions are per tab already).

### 5.5 Draw-to-ask and "What's here?"

- **Click a ward**, **drag a circle** (the circle tool in the right toolbar), or **right-click / long-press any spot** (a 500 m circle) → **"What is happening here?"** The camera settles on the area, then the **Area brief** opens in the panel:
  - open issues by type with counts;
  - the worst 3, each with the priority rule that fired (`priority_reasons`);
  - the departments responsible, with their open and past-deadline counts;
  - this period against the one before (`pctChange` with the minimum-base rule, else counts in words);
  - facilities inside or within 1 km: schools, hospitals, police, fire, lakes, canals;
  - how many of the open issues came from citizens (category, status, ward, date; never personal data);
  - every count opens its list, and every list total equals its count (tested).

---

## 6. The questions it must answer

Support every shape below in English, Tamil and Tanglish. The rules fast path must handle the **bold** ones with no AI.

| Shape | Examples |
|---|---|
| **near a facility type** | "**waterlogging within 300 m of schools**", "garbage near hospitals", "பள்ளிகள் அருகே மழைநீர் தேக்கம்", "school pakkathula water stagnation" |
| **near a named place** | "**open complaints near Adyar**", "accidents near Koyambedu bus stand", "அடையாறு அருகே திறந்த புகார்கள்" |
| **inside an area** | "**flooding in Zone 13 this week**", "streetlight problems in ward 178", "Velachery taluk severe incidents" |
| **along a road** | "**thefts along Anna Salai this month**" (also "Mount Road", "அண்ணா சாலை"), "potholes on OMR", "accidents on GST Road" |
| **near water** | "**incidents within 200 m of Buckingham Canal**", "waterlogging near lakes" |
| **nearest** | "**nearest hospital to each open severe flooding case**", "5 nearest police stations to Marina" |
| **farthest / gaps** | "which ward is farthest from a hospital", "areas with no fire station within 3 km" |
| **count by area** | "**garbage complaints by ward**", "flooding zone wise this month" |
| **hotspots** | "**where are garbage complaints clustering**", "hotspots of road accidents" |
| **compare** | "**compare Adyar and Velachery flooding**", "Zone 10 vs Zone 13 open cases" |
| **change** | "**flooding this week vs last week in Zone 13**", "did accidents on Anna Salai go down this month?" |
| **department lens** | "SWD's open cases near schools", "past-deadline cases near hospitals" |
| **one incident** | "what else is near this?" (from the detail panel) |
| **area brief** | "what is happening in Saidapet?", "ward 170 summary" |

Out of scope, said plainly with a useful alternative: routing by real travel time ("I measure straight-line distance; open in Google Maps for travel time"), forecasts, anything about a named person.

---

## 7. How it works

### 7.1 Geometry (`src/lib/map/geom.ts`, new, pure, fully unit-tested)

- `haversineM(a, b)`. Make `conflicts.ts`, `intel.ts` and `nearby.ts` import it. Their own tests must still pass unchanged.
- `pointInPolygon(p, rings)`: ray casting, holes honoured; `pointInWard(p)` uses the ward rings from `mapGeo()`.
- `distToSegmentM(p, a, b)` and `distToLineM(p, line)`: a local equirectangular projection at Chennai's latitude (error < 0.5 % within 50 km; the test asserts this against haversine).
- `bboxOf`, `expandBboxM`, `circlePolygon(center, r, steps = 64)`.
- `GridIndex`: a 250 m cell grid over points, for `within` / `nearest` in O(nearby cells). Use RBush only if the grid is measurably too slow, and say so.
- `robustBounds(points, keep = 0.9)`: the bounds of the middle 90 % of points by latitude and by longitude, for camera framing (section 8).
- Formatting (shared with the UI): `fmtDistance(m)` gives "40 m", "420 m" (rounded to 10 m below 1 km) and "3.4 km" (one decimal); the Tamil forms come from the same function.

### 7.2 Layers (`src/lib/map/layers.ts` + `scripts/build-map-layers.mjs`, new)

**Registry entry:** `{ id, name_en, name_ta, kind: "point" | "line" | "polygon", source, licence, attribution, as_of, count, fields[] }`. Every answer names the layers it used and their as-of dates.

**From the store (fixed queries, cached for the life of the server like `mapGeo()`):**
- `incidents`: the columns of 4.2. Pins only where `isPinnable()`. The rest are kept for counts inside areas (by `ward_no` / `zone_no` / `taluk_code`) and listed as "no exact place".
- **Citizen complaints are already inside `incidents`** (grievance-portal reports, `citizen_complaints` > 0). "Complaints" in a question is a filter on incidents (`citizen: true`), never a second layer. Do not read the portal's `complaints` table for the map: it would double-count and carry personal data.
- `police` (`ref_facilities` police_station), `hospitals_store` (the 9), `lakes_store`, `gauges` (river_gauge, weather_station, air_quality_station), `pwd_assets` (canal/drain/river_stretch/bund/sluice/bridge points, labelled as points).
- `hotspots` (the 347), and wards, zones and taluks (from `mapGeo()`).

**From OpenStreetMap, built once by `scripts/build-map-layers.mjs`** (Overpass API, one polite run):
- the box is the district wards' bounds + 3 km;
- `User-Agent: DistrictIQ-layer-build/1.0 (Team Initiators, hackathon prototype)`; `[timeout:180]`; `out center tags` for areas;
- output goes to `chennai-grievance-portal-main/data/layers/*.geojson` + `meta.json` (`as_of`, query, counts, licence ODbL);
- re-run only on request (`npm run layers:build`).

| Layer id | OSM tags | Notes |
|---|---|---|
| `schools` | `amenity=school` | centroids; names in EN and `name:ta` where present |
| `colleges` | `amenity=college`, `amenity=university` | separate layer ("schools and colleges" → both) |
| `hospitals` | `amenity=hospital`, `amenity=clinic`, `healthcare=hospital\|clinic\|centre` | `government` only when `operator:type=government` or the name matches Government / Govt / GH / PHC / UPHC / ESI. Say "government (by name or operator)" |
| `fire_stations` | `amenity=fire_station` | |
| `police_osm` | `amenity=police` | **only as a cross-check of the store's 60**: report the matches in Phase 0, and show the store's layer on the map |
| `roads` | `highway=motorway\|trunk\|primary\|secondary\|tertiary` + named `residential\|unclassified\|living_street` | merged by normalised name; `name`, `name:ta`, `alt_name`, `old_name`, `ref` (OMR, GST, ECR); simplified to ~5 m; **server-side only**: the client receives only the matched road |
| `waterways` | `waterway=river\|canal\|drain\|stream` | lines; Adyar, Cooum, Buckingham Canal, Otteri Nullah… |
| `water_bodies` | `natural=water`, `water=lake\|reservoir\|pond` | polygons; joined to `lakes_store` by name where possible |
| `osm_places` | `place=suburb\|neighbourhood\|quarter` | points with `name:ta`; they extend the resolver (7.3) |
| `rail_metro` | `railway=station`, `station=subway`, `public_transport=station` | P1 |

**Rules:**
- Deduplicate a node and a way with the same normalised name within 100 m.
- Mark `in_district` by `pointInWard`; facilities in the 3 km margin are kept for "nearest" and labelled "outside the district".
- **Phase 0 reports each layer's count and spot-checks 10 named features by hand** against the Esri imagery (Stanley Hospital, Rajiv Gandhi GGH, Anna Salai, Buckingham Canal, Adyar River, Chembarambakkam is outside, …).

**Saved views:** a plan + camera, saved per user. Use the existing workspaces storage if it can hold a JSON blob (`src/lib/collector/workspaces.ts`). Otherwise ask before adding a durable table.

### 7.3 Place resolver (extend `nlp.ts` `placeResolver`; do not fork it)

**Output:** `{ kind: "ward" | "zone" | "taluk" | "locality" | "osm_place" | "facility" | "road" | "waterway" | "street_name_only", id, name_en, name_ta, geometry, match, method, alternatives[] }`.

**Order** (the first exact hit wins; ties become chips):
1. ward numbers ("ward 178", "W-178", "178வது வார்டு"; reuse `numberedPlace`);
2. zone names and numbers;
3. taluks;
4. gazetteer localities (81, with Tamil aliases);
5. OSM places;
6. facility names ("Stanley Hospital", "Koyambedu bus stand");
7. roads and waterways (by `name` / `name:ta` / `alt_name` / `old_name` / `ref`: "Mount Road" = "Anna Salai" = "அண்ணா சாலை"; "OMR" = "Rajiv Gandhi Salai");
8. GCC street names (53,800, no geometry). When a GCC street matches an OSM road by normalised name, use the OSM line. When it doesn't, the answer says "this street is in GCC's list but has no map line; showing incidents whose recorded place names it", and the trace shows that it matched on text.

**Spelling and Tamil forms:**
- spellings via `fuzzy.ts` ("adayar", "velacheri", "anna salai road");
- Tamil inflections (அடையாறு / அடையாறில் / அடையாறு அருகே / அடையாறுக்கு);
- Tanglish ("adyar pakkathula", "school kitta").

**Ambiguity rule:**
- One name, several kinds ("Adyar" = locality, Zone 13 and the Adyar River) → pick the kind the question's verb implies (`along` → road or river; `in` → area; `near` → locality point), and show the choice as a chip: "Adyar (area, 1 km) ▾ · Adyar zone · Adyar River".
- Never a blocking question when a chip will do.

**Points get a radius, said in the chip.** A locality or OSM place resolves to a point, so `near` defaults to 1,000 m ("near Adyar (1 km) ▾"); a facility, to 500 m.

**Membership rule (so the Map always agrees with the Overview):**
- **inside a ward, zone or taluk:** counted by the record's `ward_no` / `zone_no` / `taluk_code`, the same rule as the console, so "flooding in Zone 13 this week" on the Map equals the Overview's number (tested);
- **near a point, along a line, inside a drawn shape:** counted by the incident's pinnable point;
- the trace says which rule was used.

### 7.4 The plan (`src/lib/map/plan.ts`, zod; every field required, nullable where empty)

```ts
type Period  = { kind: "last_days"; days: number } | { kind: "month"; offset: number } | { kind: "range"; from: string; to: string };
type Filter  = { category: string[] | null; family: string[] | null; severity: ("Severe"|"High"|"Medium"|"Low")[] | null;
                 status: "open" | "closed" | "any"; dept: string[] | null; overdue: boolean | null; citizen: boolean | null;
                 period: Period | null; text: string | null };
type AreaRef = { kind: "ward"; id: number } | { kind: "zone"; id: number } | { kind: "taluk"; code: string }
             | { kind: "point"; ref: string; radius_m: number } | { kind: "drawn"; id: string };
type Step =
  | { op: "take";     as: string; layer: LayerId; filter: Filter | null; where: { government: boolean | null } | null }
  | { op: "within";   as: string; of: string; near: string; meters: number }
  | { op: "inside";   as: string; of: string; area: AreaRef }
  | { op: "along";    as: string; of: string; line: string; meters: number }      // road or waterway resolved by 7.3
  | { op: "nearest";  as: string; from: string; to: string; k: number }
  | { op: "farthest"; as: string; areas: "ward" | "zone"; from: string }
  | { op: "count_by"; as: string; of: string; by: "ward" | "zone" | "taluk" | "hex500" }
  | { op: "hotspot";  as: string; of: string }
  | { op: "compare";  as: string; of: string; a: AreaRef; b: AreaRef }
  | { op: "change";   as: string; of: string; now: Period; before: Period };
type Plan = { steps: Step[]; show: string; language: "en" | "ta" | "tanglish" };
```

**Enforced in code:**
- ≤ 8 steps; 10 ≤ meters ≤ 5,000; k ≤ 20; periods ≤ 365 days and inside the data's range;
- ≤ 5,000 features returned (larger → summarised by ward, said plainly);
- names in `as` unique; every `of` / `near` / `from` refers to an earlier step.

**Defaults** (shown as chips marked "default"):
- status open for incidents;
- last 30 days, ending at the **store's as-of time** (`asOf()`), never the wall clock;
- `along` 75 m; `near` a point 1,000 m (locality) or 500 m (facility).

**Officer lock:** the server injects `dept = [lockDept]` into every `take` of `incidents`, with the console's rule (`lead_dept`, as `scopeWhere` does). It ignores any `dept` the plan carries and says so once in the trace ("Your department only").

### 7.5 Router (`src/lib/map/route.ts`)

1. **Rules fast path** (no AI): EN, TA and Tanglish patterns for the bold shapes of section 6. Category words come from `classify()` / `categoryWords()`, departments from `deptwords.ts`, places from 7.3, distances from "300 m", "300 meters", "300 மீட்டர்", "half a km" and "1.5 km". Measure the coverage on the question set (13.2): **≥ 80 % rule-only**.
2. **Else** `generateJson` with the plan schema, the layer catalogue, the category and department code lists, and 12 few-shot examples (EN, TA, Tanglish). Validate. On failure, retry once with the validation error. If it still fails → a clarification with chips of the closest matches.
3. **Resolve every place** with 7.3; check the limits; execute.
4. **Follow-ups:** the rules recognise edits (radius, severity, period, add/remove layer, compare, by ward). The AI path receives the current plan and returns the edited plan, never a fresh one.
5. **AI down** (`AiUnavailableError`, `AI_PROVIDER=none`): the rules still answer. Anything else gets "I can answer these kinds of map questions without AI:" + chips.

### 7.6 Executor (`src/lib/map/execute.ts`)

- Pure functions over in-memory features. Every step returns `{ features, count, note_en, note_ta }` for the trace.
- **`farthest`:** a 200 m grid of points inside each ward. A ward's distance is the 90th percentile of its points' distances to the nearest `from` feature. The trace states the method ("90 % of Ward W is within 3.4 km of a hospital; the district's best ward is 0.6 km").
- **`hotspot`:** when the filter matches a stored hotspot category, use the stored DBSCAN hotspots. Otherwise run DBSCAN (250 m, min 3, as the pipeline) in TypeScript. Ward Gi\* in TypeScript with the same contiguity as `analytics.py`, with a parity test against the Python output on the frozen data. The UI says "more than usual for its neighbours", never "z-score".
- **`compare` / `change`:** counts, plus `pctChange` only above `MIN_PCT_BASE`; otherwise words ("up from 6 to 11").
- **Determinism:** same plan + same store → same output, byte for byte (tested). Sort by `priority_score` desc, then `first_reported_at` desc, then `incident_id`.
- **Server route `POST /api/map/ask`:**
  - uses `assistantSession()` for role and `lockDept`, and `src/lib/rate-limit.ts`;
  - takes `{ text, plan?, context: { zone, taluk, incidentId, drawn? } }`;
  - returns `{ plan, chips, answer, trace, features (results only, capped), context_layers (only the facilities that matter to the answer), camera, as_of, layers_used }`.
- **`GET /api/map/layers/:id`:** cached with ETag; the toggleable layers only, within the district box.
- **Question log:** text, plan, language, ms, ai_used, result count, user role (no personal data) appended to `data/aws-cache/map-questions.jsonl`, for evaluation (never committed).

### 7.7 The answer text

- A fact pack (counts, top zones, top departments, distances) → a template sentence in the question's language.
- AI may rewrite it into at most 2 sentences. Numbers are checked with the `verify.ts` pattern; an uncited sentence is dropped. Without AI, the template stands.
- **Always "map layer ready"** after the count (the MapsAI echo), in Tamil "வரைபட அடுக்கு தயார்".
- **An empty answer is said plainly, with the nearest miss:** "No open waterlogging reports within 300 m of a school in the last 7 days. The closest is 420 m from Govt School, Saidapet." The camera goes there.

---

## 8. The camera: the map moves to what you asked

The map is live (pan, zoom, click every pin), and **every answer flies the map to the place the question is about**. The camera follows the plan, never the AI's words.

**`cameraFor(plan, result, viewport) → Shot[]`** (`src/lib/map/camera.ts`, pure, unit-tested). A `Shot` is `{ kind: "bounds" | "point" | "path"; target; duration_ms; caption_en; caption_ta }`.

| Question shape | What the camera does |
|---|---|
| names an area (ward, zone, taluk, point + radius) | flies from the current view into the area (`flyToBounds`); the outline draws in; everything outside dims (a district mask with the area cut out, 45 % dark) |
| district-wide ("within 300 m of schools") | frames the **results**, not the district: `robustBounds(results, 0.9)`, so one far-off report does not zoom out to all of Chennai; a chip says "N more outside the view · Show all" |
| one result, `nearest`, a list row clicked | flies to the point at zoom ≥ 16 and rings it (`.mfocus`, as `SatMap.tsx` does) |
| `along` a road or waterway | frames the line; the corridor draws along it from one end; **"Follow the road"** pans end to end in 6 s while the count ticks up as it passes cases |
| `compare` A and B | frames both areas at once, each outlined in its own colour with its count as a label |
| `change` now vs before | frames the area; a **Before · Now** toggle cross-fades the two layers in place; the camera stays still |
| `hotspot` | frames the top hotspots; **"Tour the top 3"** flies to each in turn (3 s each) with a caption card ("Ward 173: 41 reports, more than usual for its neighbours") |
| `farthest` | flies to the ward and draws a dashed line from its far point to the nearest facility, with the distance on it |
| empty result | flies to the nearest miss and says so |

**Rules:**
- **Order:**
  1. the camera moves (0.6–1.6 s, scaled by the distance flown);
  2. results land: pins drop in staggered by priority, and `within` rings ripple out from their centres;
  3. the headline count ticks up as pins appear.
- **The trace and the list move the camera too.** Clicking a trace step frames that step's layer. Hovering a list row lifts its pin; clicking a row flies to it and opens the incident on a second click.
- **Follow-ups move only as much as the plan changed:**
  - "make it 500 m" keeps the view, and the rings grow from 300 to 500 m;
  - "only severe" keeps the view, and the dropped pins fade out;
  - "compare with Adyar" pulls back to frame both;
  - "last 7 days" keeps the view.
- **The user's hand wins.** If they pan or zoom, even mid-flight (`movestart` with no programmatic flag), the camera stops and stays put until the next question. **Back to the answer** re-runs the last shot; **Whole district** frames the district.
- **Never under the panel:**
  - every shot uses `paddingTopLeft` / `paddingBottomRight` measured from the panel's and the chips' real boxes (the bottom sheet at phone width);
  - `maxZoom` 16 for areas and 17 for points; `zoomSnap: 0.25`; never zoom out beyond the district.
- **Reduced motion:** the same final view with no flight (`fitBounds` / `setView` with `animate: false`), no ripples or pin drops, and tours step on click instead of playing.
- **Testable:** the map container carries `data-camera` (last shot kind, target id, final bounds, `user_took_over`), so Playwright can check the view without reading pixels.
- **In Ask District IQ** the small `MapAnswer.tsx` map gets the same shots (keep scroll-wheel zoom off there; the page scrolls). **Show on the console map** continues on the Overview map from the same view.

---

## 9. Correct markings and locations

The judges build GIS for a living. A wrong pin or an overclaimed location loses them. Every one of these rules is tested:

1. **Exact where it is exact.** A pin sits at the incident's `lat/lon` only when `isPinnable()` holds. For 51–2,000 m precision, a faint circle of radius `loc_precision_m` shows on hover and selection. The tooltip says "Location known to about 300 m (a street named in a report)".
2. **Never a false pin.** The 610 incidents coarser than 2,000 m (and any new ones) are never drawn as pins. They are counted inside areas by their record's ward/zone where they have one, and listed under "N with no exact place" (`PLACE_FILTERS.unlocated`).
3. **Stacked points fan out.** Several cases at the same coordinates show one marker with a count badge. A click fans them out in a small circle (as `SatMap`'s added-source fan-out does), and each one stays clickable.
4. **Clusters at the district zoom.** When more than 400 results are on screen, group them in a pixel grid with count bubbles. A click zooms into the cluster. At zoom ≥ 14, every pin shows individually. The cluster counts add up to the headline (tested).
5. **Distinct, readable markers.**
   - Incidents keep the console's `.mpin` style: size by severity, pulse for open severe, faded when closed, coloured by `CAT_COL` (Collector) or by severity (officer, as `pinColor` does today).
   - Facilities use glyph markers with a letter and a shape: S school (square), C college, H hospital (cross), F fire station, P police (shield), L lake, W waterway label.
   - Colour is never the only signal: every marker has a screen-reader name and a tooltip in words.
6. **Lines and areas drawn true.**
   - Buffers around points use `L.circle` (radius in metres).
   - Road and water corridors are polygons built in `geom.ts`.
   - Ward and zone outlines come from `mapGeo()`. Ward numbers label at zoom ≥ 14, decluttered with the existing rule.
7. **Distances in the right units.** Use `fmtDistance()` everywhere: "120 m", "3.4 km". Measure straight-line distance and say so once in the trace ("straight-line distance").
8. **The legend tells the truth.** It shows only the layers on the map, each with its count and source. It includes "Ward boundaries: DataMeet community data, not an official GCC map".
9. **As-of always visible:** "Incidents as of 27 Oct 2026, 20:06 · Schools: OpenStreetMap, built 28 Oct 2026".
10. **Phase 0 location audit:** report how many incidents fall outside every ward polygon, how many have a point in a different ward from their recorded `ward_no`, how many sit at 0/0 or exactly on the district centroid (13.0827, 80.2707), and how many facilities are outside the district. **Do not change the data** (the pipeline owns it). Use the numbers to pick the membership rule (7.3) and mention any large mismatch to the user.

---

## 10. Officers: the same map, locked to their department

- **Where:** the officer Board's map (`Board.tsx`) gets the Ask box and panel in a compact form. The officer console's own layout and pages stay as they are.
- **The lock:** the server forces the officer's department on every incident and complaint layer (7.4). Facility layers are shared. A question about another department is answered for the officer's own, and the trace says "Your department only".
- **What officers can do:** ask, see the answer, open cases (to their own Work page), export, and save views. **No "Send to department"** (that is the Collector's).
- **Visit order (P1):** "plan my visits today" or a button on any answer orders the officer's top 10 open, highest-priority cases.
  - The start point is where the officer clicks on the map, or their device location if they press "Use my location" (the browser asks them). `ref_offices` has no coordinates, so there is no default office point. Without a start, the route starts at the highest-priority case.
  - The order is nearest-neighbour from the start, improved with 2-opt.
  - The route shows numbered pins and straight-line legs with the total distance ("straight-line, not road distance").
  - **Open in Google Maps** builds a directions link with ≤ 9 waypoints. It opens only when the officer clicks it, and it carries coordinates only.

---

## 11. Actions from an answer

1. **Send to department (Collector only):**
   - one draft **per responsible department** (by `lead_dept`), listing its cases from the answer (≤ 25 per email; more → "and N more", with a CSV link inside the console);
   - built on `actionmail.ts`: reuse `delivery()`, `tidyEmail()` and the `Recipient` lookup; add `draftBatchAction(ids, dept, user)` and `sendBatchAction(…)`;
   - each draft opens for review. **Nothing is sent until the Collector presses Approve.** Sandbox by default; follow-up due in 24 h; one `audit()` row per email with the plan JSON.
2. **Export:** CSV and GeoJSON of exactly the answer's rows (the count equals the headline). No personal data; the as-of date and the plan go in the file header / properties. Log each export with `audit()`.
3. **Map print (P1):** an A4 PDF of the current view, legend, headline, trace and list. Render a print route in the Playwright browser the Studio already uses (`page.pdf`, Noto Sans Tamil) so that Tamil answers print correctly. jsPDF cannot shape Tamil.
4. **Save view:** the plan + camera (7.2). It re-runs on fresh data when opened ("live"), with its as-of date shown.
5. **Open in Ask District IQ:** hands the plan's filters to the assistant for a chart or a written summary.

---

## 12. Laws for this feature

1. **Numbers are computed, never generated.** Every number on screen, in AI text, in exports and in emails comes from the executor.
2. **Every number opens its rows.** Click the headline, any trace count, a cluster or a ward count → its list. The list total equals the number (tested).
3. **The same question gives the same number everywhere.** A Map answer equals Ask District IQ and the Overview for the same filters (tested on 10 pairs).
4. **Typed plans only.** Plans from a closed vocabulary, validated; anything that fails becomes chips, never a guess.
5. **Plain words, two languages.** No GIS jargon in the UI ("buffer" → "within 300 m"; "Gi\*" → "more than usual for its neighbours"). Every label, chip, answer, trace line, legend and export header exists in English and Tamil; Tanglish questions get Tanglish answers.
6. **Privacy (DPDP Act 2023):** no complainant personal data anywhere on the map or in exports; nothing personal sent to an AI model (plans carry place names and categories only).
7. **A person approves every outward action.**
8. **Accessible (WCAG 2.1 AA):**
   - full keyboard path: the Ask box is reachable by Tab and from the `/` palette ("Ask the map"; `/` itself stays the palette), Enter runs, Tab reaches the chips, the list and the map tools, ↑ / ↓ move through the list, Enter opens a case;
   - `aria-live="polite"` for the headline;
   - a list view that is a complete text alternative to the map;
   - contrast ≥ 4.5:1 in light and dark; works at 200 % text size; respects reduced motion.
9. **Fits the canvas:** 1366 × 680 with no page scroll; phone width with the bottom sheet.
10. **Honest limits:** straight-line distances; community ward boundaries; OSM completeness varies; all said once, where they matter, never as a wall of caveats.

---

## 13. Quality: built to have no bugs

"No bugs" means: every rule above has a test, every number has an oracle, and every screen has been seen working.

### 13.1 Unit tests (vitest, no store)

- **`geom.ts`:**
  - haversine against 5 known pairs (Marina lighthouse to Chennai Central, …) within 0.5 %;
  - point-in-polygon with holes and multipolygons;
  - point-to-segment distances;
  - `robustBounds` with outliers;
  - `fmtDistance` in EN and TA.
- **Resolver:**
  - 60 cases, including every alias in `intel-reference.json`, 20 ward/zone forms in EN and TA, 10 roads (Anna Salai / Mount Road / அண்ணா சாலை, OMR / Rajiv Gandhi Salai, GST, ECR, Poonamallee High Road, …), 10 misspellings, 5 Tamil inflections and 5 ambiguous names with the expected chip.
- **Plan schema:**
  - every limit;
  - unknown layer → clarification;
  - a 9-step plan or 9,000 m is refused and never executed.
- **Rules router:**
  - 120 questions (40 EN, 40 TA, 40 Tanglish) → expected plans.
  - Follow-ups: each of the 8 edits of 5.4 changes exactly one part of the plan.
- **Executor:**
  - each op on a 30-feature fixture with hand-checked answers;
  - determinism: the same plan run twice gives the same output.
- **Camera:** `cameraFor` returns the expected shot for every row of section 8's table, including padding and maxZoom.
- **Markings:**
  - pinnable rule: a 2,001 m incident is never in `features_pinned`;
  - cluster counts sum to the total.
- **Officer lock:** a plan with `dept: ["GCC-SWM"]` run as a GCC-SWD officer returns only GCC-SWD rows, and the trace says so.
- **Safety:** a test greps `src/lib/map/**` for SQL built from plan strings (template literals into `query(`) and fails if it finds any.

### 13.2 Golden tests on the frozen store (`src/lib/map/map.golden.ts`, `npm run eval:golden`)

- **30 questions** covering every shape of section 6, in all three languages.
- **The expected answer is computed in the test by an independent brute-force oracle:** plain loops over every row, haversine for every pair, no grid index, no shared code path except `haversineM`. The oracle and the executor must return the same count and the same ids.
- **Cross-page consistency:** 10 questions whose Map count must equal the Ask District IQ tool count and the Overview's figure for the same filters.
- **Area brief:** every count equals its drill-down list.
- **Exports:** the CSV/GeoJSON row count equals the headline.

### 13.3 Property tests

- 300 random valid plans (seeded) on the frozen store. For each:
  - no throw;
  - count = list length = exported rows = drawn pins + clustered + "no exact place";
  - every feature satisfies every filter of its plan (re-checked independently);
  - runtime < 300 ms.

### 13.4 End-to-end (Playwright on `portal-aws-dryrun`, port 3001)

- **The Collector demo (section 15) and the officer demo**, step by step, at 1366 × 680 and 375 × 812, in light and dark, with screenshots saved under `docs/review-pdfs/ask-the-map/` (not committed).
- **`data-camera` checks:**
  - "open complaints near Adyar" ends with the whole Adyar circle in view and not under the panel;
  - a district-wide answer with one far-off report frames the rest and shows "1 more outside the view";
  - dragging mid-flight sets `user_took_over` and the next small follow-up doesn't move the map;
  - with reduced motion, the final views are the same.
- **Zero console errors**; no failed requests except tile 404s at the edges; no request to any host other than this app and the Esri tile servers.
- **Keyboard-only run** of the main flow.
- **Overview, officer Board and Ask District IQ still look and work as before:** screenshot comparison before and after, plus their existing tests passing.

### 13.5 Performance (measured on this PC, p90 of 50 runs, reported)

- Rule-only answer < 1.5 s end to end, executor < 150 ms; AI-routed answer < 5 s.
- The Overview loads no slower than today: the Ask panel and the map engine load on first focus of the Ask box (dynamic import, `ssr: false`, as `AssistantDialog` is loaded); the panel opens in < 300 ms after that.
- Use the canvas renderer (`preferCanvas`) for more than 300 markers; divIcons only for the top 300 results.
- Layer payloads gzip < 400 kB each; roads stay on the server.

### 13.6 Self-review before every phase report

Read your own diff file by file. List every edge case you thought of and the test that covers it:
- empty answers, one result, 5,000+ results;
- a place on the district border, a road outside the district, a ward with no incidents;
- Tamil-only input, a mixed-language question, a question with two places;
- AI down, the store reloading, two tabs with different plans.

Fix what you find before reporting.

---

## 14. Phases (stop after each one)

**Phase 0: Verify and measure (no feature code).**
- Re-check every fact of section 4 and list what differs.
- Run the location audit (9.10).
- Build the OSM layers with `scripts/build-map-layers.mjs` and report counts and the 10 hand spot-checks.
- Confirm whether ward Gi\* is in the store.
- Measure the Overview map card's size at 1366 × 680 and plan the grow-in-place view; list every `SatMap` caller and its props.
- Propose the 6 empty-state questions from real data.
- **Stop.**

**Phase 1: Engine (no UI).**
- `geom.ts`, `layers.ts`, the resolver extension, `plan.ts`, `route.ts` (rules), `execute.ts`, `camera.ts`, `POST /api/map/ask`, `GET /api/map/layers/:id`, with the unit tests (13.1) and the golden + oracle tests (13.2) green.
- Report the rule-only coverage on the 120 questions.
- **Stop.**

**Phase 2: Ask the Map on the Overview map.**
- The optional `SatMap` props, the Ask box, the grow-in-place view and Back to overview, the panel, chips, answer card, trace, list, camera, markings, legend, scale, as-of line, empty state, Area brief and What's here.
- With no question asked, the Overview looks exactly as before (screenshot compare).
- Light/dark, phone sheet, reduced motion.
- Screenshots of every state.
- **Stop.**

**Phase 3: Integration.**
- Ask District IQ routing + `MapAnswer` camera + Show on the console map; incident detail "What else is near here?"; `/` palette; officer Board map with the lock.
- Before/after screenshots of every touched screen.
- **Stop.**

**Phase 4: Actions.**
- Send to department (sandbox, approve, audit, follow-up), Export CSV/GeoJSON, Save view, officer Visit order, map print (P1).
- **Stop.**

**Phase 5: Hardening and demo.**
- AI routing for the remaining shapes, property tests, E2E, performance, accessibility and Tamil review.
- Write the demo script (section 15) **with the measured numbers filled in from the live answers**, plus 12 rehearsal questions a judge might ask, each verified.
- Final report.
- **Stop.**

---

## 15. Demo script (fill every number in Phase 5 from the real answers; never from this page)

**Collector, 90 seconds, "monsoon morning":**
1. The Overview, as the Collector sees it every morning. In the map's Ask box, type or say **"waterlogging within 300 m of schools"**. The map grows to fill the screen, flies into the worst zones, rings ripple out from the schools, and pins drop in: **"N … · map layer ready"**.
2. "**only severe**" → most pins fade out and a few stay; the view doesn't move.
3. Click the worst one in the list → the map flies to it, ringed; a second click shows its reports and photos.
4. "**compare with Adyar**" → the map pulls back to frame both areas, with their counts.
5. "**send these to SWD**" → a draft per department opens; press Approve (sandbox); the follow-up is set.
6. Switch to Tamil: "**அடையாறு அருகே திறந்த புகார்கள்**" → a Tamil answer, and the map flies to Adyar.
7. Drag a circle over a neighbourhood → **"What is happening here?"** → the Area brief with every department's open issues.

**Officer, 30 seconds:** sign in as the SWD officer. "**my open cases near hospitals**" → their department only. Then "**plan my visits today**" → numbered route, total distance, Open in Google Maps.

**The line for the judges:** "This is MapsAI's answer shape, built for a Collector: it speaks Tamil, every pin opens its evidence, it shows its method, and every answer ends in an action."

---

## 16. Report format (after every phase)

1. **Done:** what was built, as a list of user-visible behaviours.
2. **Verified:** commands run and their results (`tsc`, `vitest` counts, golden counts, E2E pass/fail, p90 timings), and screenshots (paths).
3. **Differs from this prompt:** every place where the code or data did not match, and what you did.
4. **Not done / not verified:** said plainly.
5. **Needs your decision:** at most 3 questions, each with a recommended answer.

---

## 17. Definition of done

- [ ] Every shape in section 6 answers correctly in EN, TA and Tanglish (golden + oracle green).
- [ ] ≥ 80 % of the question set answers with no AI; the rest within 5 s at p90.
- [ ] The map flies to every answer, never frames under the panel, stops when the user takes over, and respects reduced motion.
- [ ] No incident coarser than 2,000 m is ever drawn as a pin; every location's accuracy is visible.
- [ ] Count = list = export = pins + clusters + no-exact-place, for 300 random plans.
- [ ] The Map, Ask District IQ and the Overview agree on 10 shared questions.
- [ ] Officers see only their department, whatever they type.
- [ ] Send to department sends nothing without Approve; sandbox in demo.
- [ ] No personal data on the map or in exports; no SQL from plan strings (grep test).
- [ ] Overview, officer Board and Ask District IQ look and behave as before (screenshots + existing tests).
- [ ] 1366 × 680 with no page scroll; phone bottom sheet; light and dark; keyboard-only path; zero console errors.
- [ ] The demo script runs start to finish with measured numbers, twice in a row.
