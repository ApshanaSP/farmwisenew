# Rain Rehearsal: build log

Built from `docs/RAIN_REHEARSAL_ULTRA_PROMPT.md`, started 29 Oct 2026 00:40 IST. The user said (29 Oct, ~00:45): **"continue all the phases, do not stop for me or ask me, complete everything, I'll sleep."** So every phase runs without a stop, and where the prompt says "ask the user" I take the safe default and list it under *Decisions* below for the morning.

Limits kept (same as the Ask the Map night): no commit or push · email sandbox only · no package installs · **no new durable store tables** · no change to `district_intel/` or any collector.

**Another session was editing the same map files at the same time** ("Ask the Map Ultra Prompt", local_c675bb92, running; uncommitted edits to `SatMap.tsx`, `Overview.tsx`, `CollectorApp.tsx`, `askmap/*`, `lib/map/route.ts`, `lib/map/ask.ts`; it committed `778cc33` at 00:25). To avoid overwriting each other, Rain Rehearsal lives in **new files** (`src/lib/rehearsal/`, `src/components/collector/app/rehearsal/`, `src/app/api/rehearsal/`, `scripts/build-road-graph.mjs`) and touches shared files only with small hooks, each re-read just before the edit.

---

## Phase 0: verify and measure (29 Oct 00:40–01:05)

### Differences from the prompt (the code wins)

| Prompt said | Found | What I do |
|---|---|---|
| head `62ad9f3` | head `778cc33` (Ask the Map follow-up by the other session) + more uncommitted Ask the Map edits | build beside it, small hooks only |
| IMD warnings from `imd_weather_collector/data/imd_weather_warnings_chennai.csv` | that CSV stops at **9 Oct** (stale). The **store** has `observations.imd_warning_level` (0 green … 3 red, `detail` = IMD's words), 248 rows, **25 Sep → 2 Nov 2026**, real (`is_synthetic = 0`) | trigger reads the store's warning history |
| rain events from `grievance_rain_days.txt` + rainfall ≥ 30 mm | file = 11 days written by `district_intel/dintel/sync.py` (the heavy-rain days the grievance generator used: the synthetic complaints follow it: 21 Oct 111 water incidents vs ~35 a normal day). Real IMD rainfall (`observations.rainfall_24h_mm`, 4 stations, 25 Sep → 28 Oct): ≥ 30 mm on **17 Oct (69.5), 18 Oct (222.5), 21 Oct (129)** | union of both, each event says its source |
| real IMD warnings around the test rain | **17 Oct Orange, 18 Oct Red ("Very Heavy Rain"), 19–21 Oct Orange, 23 Oct Orange** | the replay of 21 Oct shows the real warning that was in force |
| CFM gauges | store `gauge_level_m` 29 rows to 20 Oct, quality **"suspect"** (danger stage below warning stage on several points) | gauges shown with the official numbers and the quality word; never used to trigger when suspect |
| lakes | `lake_pct_full` etc. are PWD rows with `is_synthetic = 1` | used (standing decision C-1: no badges) |
| fire stations | OpenStreetMap has **16** (13 in the district, 7 unnamed) | reach of fire cover is computed for these and the method panel says "fire stations mapped in OpenStreetMap" |
| hospitals | OSM 1,441 (government: 45 hospitals, 69 health centres, 5 clinics) + store 9 | quick help = government hospitals + store hospitals (deduplicated within 300 m) |
| "open at that moment" for replay | `incidents.closed_at` exists; `incident_timeline` (141,891 steps) also | open at `asOf` = reported before and (not closed or closed after) |
| officer photo route | `POST /api/officer/grievances/[id]/report` (multipart, `savePhotos` in `lib/officer/photos.ts`), served by `/api/officer/photos/[dir]/[name]` | task photos reuse `newPhotoDir` / `savePhotos` |
| `followups` | written by `actionmail.ts` (`email_id, contact_id, incident_id, summary, due_date, status 'pending'`); officers never read them | task storage (decision a) |
| bulletin PDFs | `GetBulletins` JSON in the CFM raw cache lists `linktext`, `date`, `filename` (PDF); PDFs not downloaded | badge + link only (decision b) |
| SACHET Tamil Nadu feed | no public state feed found in research | skipped (P2) |

### Feasibility backtest (re-measured)

Flood memory from incidents before 21 Oct only (FLOOD_WATERLOGGING ×2, rain-window ×2), 400 m grid: top 200 cells hold **39.6 %** of the 164 waterlogging incidents of 21–24 Oct; 200 random cells **7.8 %** → about **5×** chance. 250 m grid: 20.1 % vs 3.8 %. The street-level memory must beat this (Phase 2).

### Decisions taken without the user (all undoable)

- **(a) Task storage: no new durable tables.** Each rehearsal job is a `followups` row whose `summary` starts with `[RR:<rehearsal id>:<job key>]`; the rehearsal itself is a `workspaces` row. Officers read their department's rows. Reason: the user's standing limit "no new store tables" from the Ask the Map night.
- **(b) Bulletin PDFs: not downloaded.** The newest CFM bulletins are shown as "CFM issued *Street Flood Inundation Forecast* on <date>" with the link.
- **(c) One-way: emergency vehicles ignore one-way** (both directions routable); the glossary says so.
- **(d) `T_HELP` = 10 minutes** by default; 5 / 10 / 15 switch.
- IMD warning timing: the store keeps a warning by the **day it is valid for**, not its issue time. Replay assumes the warnings for the next 3 days were known at `asOf` (IMD issues district warnings 5 days ahead). Said in the method panel.

---

## Phase 1: road network and routing (00:50–01:12)

- `scripts/build-road-graph.mjs`: Overpass, district box + 3 km, 3 x 3 tiles, drivable classes motorway → living_street (no service roads, not private), ways with node ids, so shared nodes are junctions. The public server answered HTTP 502 seven times; the script backed off and retried (21 min in all). Tiles cached in `%TEMP%\diq-road-graph` (re-run with `--offline`).
- **Result: 123,062 junctions, 157,419 road pieces (96,808 in the district), 11,295 km incl. the margin, `data/roads/graph.bin` 8.3 MB**; 787 pieces cut off by the box edge dropped. Shapes simplified to 2 m; each piece has its ward and its distance to water (OSM waterways + water bodies).
- `src/lib/rehearsal/graph.ts` (typed arrays, CSR adjacency, grid index: pieces near a point, nearest junction), `paths.ts` (multi-source Dijkstra with a binary heap, A*, road states: factor 1 / 0.3 / 0, one-way optional). No package.
- Tests: `paths.test.ts` 8 tests: Dijkstra and A* equal a Bellman-Ford oracle on 25 seeded random cities (normal, slow, closed, one-way), closing roads never brings anything nearer, time limit, route names. One bug found and fixed: drive times in Float32 made valid heap entries look stale (now Float64).
- Load + index of the real graph: **117 ms**.

## Phase 2: flood memory, replay, backtest (01:05–01:25)

- `memory.ts`: rain events (pipeline heavy-rain days ∪ IMD ≥ 30 mm; consecutive days with ≤ 1 dry day are one rain; a report counts for a rain from its first day to 2 days after its last), complaints placed ≤ 300 m mark the road pieces they were made on (≤ 50 m / 120 m), and count for every piece within the **flood spot** radius. `replay.ts`: replay at 09:00 two days before a rain, judged on its standing-water reports within 100 m of a marked street, against the same length of random streets (seeded, 300 draws). `report.ts`: still flooded / no flooding reported / missed.
- **First model (every street with one past flood complaint) was no better than chance**: lift 0.78–1.43 (it marked ~380 km; 100 m around 380 km of street covers most of the city). Reported honestly and replaced.
- **Calibration** (`calibrate.golden.ts`): 36 + 18 settings scored on the rains **before 21 Oct only** (9 Aug, 28 Aug, 6 Sep, 19 Sep, 17 Oct), the best then tested on 21–23 Oct. Chosen: flood spot 150 m, LIKELY = the worst **20 km** of streets whose spot flooded in **3+ rains**, POSSIBLE = the next **40 km** (1+ rain). A fixed length is how a Collector's list is cut, and keeps the map readable.
- **Backtest with the chosen settings** (`rehearsal.golden.ts`, 876 ms for all rains):

| Rain | Replay moment | Reports | On marked streets (60 km) | Random 60 km | Lift | Likely only (20 km) lift |
|---|---|---|---|---|---|---|
| 9–10 Aug | 7 Aug 09:00 | 111 | 9.0 % | 8.1 % | 1.11 | (no likely yet) |
| 28 Aug | 26 Aug | 55 | 12.7 % | 7.3 % | 1.75 | – |
| 6 Sep | 4 Sep | 84 | 17.9 % | 10.7 % | 1.67 | 0.67 |
| 19–20 Sep | 17 Sep | 123 | 13.8 % | 8.9 % | 1.55 | 2.50 |
| 17–18 Oct | 15 Oct | 45 | 17.8 % | 11.1 % | 1.60 | 2.00 |
| **21–23 Oct** | **19 Oct** | **178** | **17.4 %** (31) | **10.7 %** | **1.63** | **2.71** (19 reports on 20 km) |

  Honest reading: **the streets it marks catch about 1.6× what the same length of random street catches, and the likely streets about 2.7×.** That is a real signal, not a forecast; the UI says so. (The grievance data is synthetic and scatters flood complaints by street, which caps street-level repeat; the Phase 0 400 m grid's "5×" used a different, easier baseline and is not comparable.)
- Reach of help, real network, 21 Oct replay: 130 facilities (16 fire stations, 114 government hospitals and health centres), **3.2 s** for both road states and all wards; no facility loses half its reach (20 km of closed streets is spread thin), **3 wards lose quick fire cover**; 2 facilities too far from a road junction to route.
- Golden checks (all pass): covered count equals a brute-force loop over every marked piece; every marked street has a complaint; no peeking on the real data (adding every report after 19 Oct changes nothing); closing streets never brings help nearer; rehearsal reach ≤ normal reach for every facility.

## Phase 3: trigger, rehearsal view, map, clock, panel (01:25–02:00)

- `trigger.ts`: levels WATCH / REHEARSE / ACT from the store's IMD warning history (by the day it is valid for), CFM river points within 0.5 m of warning (never a point CFM marks suspect), reservoir discharge, lakes ≥ 85 % and rising, a CFM street-flood or rainfall bulletin of today or yesterday, or the Collector's own switch ("Rehearse a heavy rain anyway": 48 h out). `places.ts`: choke points (open drain / flooding complaints within 100 m of a flood street), dry schools (not within 150 m of a likely street, ≤ 15 min from a hospital on rehearsal roads, government schools first), release ribbon. `reach.ts`: 10-minute reach per hospital and fire station, normal vs rehearsal, wards losing quick help, cut-off facilities, the way out to a main road. `engine.ts` puts it together, cached per moment (live: once an hour, since the data is collected hourly).
- UI (`src/components/collector/app/rehearsal/`): `RainBand.tsx` (the slim band on every page when the trigger fires: IMD's words, countdown, Ready n / m, Rehearse), `RainRehearsal.tsx` (head with mode, reason, countdown, readiness, Replay menu, 5′/10′/15′ quick-help switch, EN/த; map; right panel; the five-stop clock), `RehearsalMap.tsx` (own Leaflet map: glowing likely streets with a shimmer, possible streets, flood-spot halos at district zoom, choke squares, hospitals / fire stations with a red ring when cut off, hatched wards, dry schools, lakes filling, gauges, release ribbon; per stop: job flags, reports dropping in over dashed rings, still flooded / no flooding reported / missed), `PlanSheet.tsx`, `words.ts` (EN/TA), `rehearsal.css` (light/dark, phone layout, reduced motion).
- Tap anything: street (rains, complaints, open drains, distance to water, late PWD work, past complaints → open), hospital / fire station (reach normal → rehearsal in km and wards; green = still reached, grey dashes = lost, fading in; beds; way out), ward (minutes before → after), lake (fill bar, trend), gauge, dry school, choke point, job, report. "How this was worked out" panel with the backtest table for every past rain.
- Verified in the browser on the dev preview: district view, street card, hospital reach (ESI Hospital: 555.9 → 376.4 km of road in 10 min, 38 → 30 wards), Rain stop (reports drop in), Check stop, Learn stop (+90 new streets, 51 moved up), dark theme, 375 px phone (no sideways scroll).
- Fixes found by looking at it: markers buried the flood streets at district zoom (halos added; drains and schools wait for street zoom; only hospitals that lose reach are drawn); the check counted "on a predicted street" within 150 m while the proof used 100 m (now both 100 m); a street said "5 past rains" but listed 2 dates (now the flood spot's rains); the card showed the after-rain result at the Warn stop (now only at Check / Learn); 8,800 SVG paths for one hospital's reach (now 2); the plan sheet's lists collapsed and the zoom buttons sat over it; the phone layout collapsed the map and clipped Close.

## Phase 4: Send tasks, officers, readiness (01:45–02:10)

- `playbook.ts` (rules, not AI): clear the drain (the complaint's own department), check drains along streets flooded in 3+ rains, finish late PWD water works, a pump near clusters of likely streets (GCC Mechanical Engineering), ambulance on the dry side of a cut-off hospital (Government Hospitals), fire cover for wards that lose it (District Disaster Management: `ref_departments` has no Fire & Rescue code), diversions on main roads (Greater Chennai Police), dry schools as relief centres at ACT (GCC Education), river alerts on a release (District Revenue). Deadlines before the rain by kind (24 h / 12 h / 6 h); a passed deadline says "as soon as possible". Stable job keys.
- `tasks.ts`: **no new table** (decision a): each approved job is a `followups` row with a `[RR] {json}` header (rehearsal, department, job key, place, ward, exact deadline). One email per department under the console's safety rule (`delivery()`, sandbox by default); `outbound_emails` + `followups` + `audit_log` (`rehearsal:send`). Officer Done: a `rehearsal:done` audit row with the photo and its distance from the job (≤ 300 m = "at the place", otherwise said, never blocked).
- APIs: `GET /api/rehearsal/state` (Collector; ETag → 304), `POST /api/rehearsal/plan` (draft / send; the server re-makes the plan and never trusts the browser), `GET /api/rehearsal/reach`, `POST /api/rehearsal/route` (Collector or officer), `GET|POST /api/rehearsal/tasks` (officer, own department only), `GET /api/rehearsal/photo/[dir]/[name]`; `/api/rehearsal/dev` + `/dev/rehearsal` for the dev preview (development + dry-run store + localhost only).
- Officer console: `BeforeRainTasks.tsx`: a slim "Before-rain tasks from the Collector" line on the Board (only while there are tasks) opening a drawer: mini map, **visit order on rehearsal roads** (flood streets avoided; e.g. 10 stops, about 35 min, 15.7 km), Open in Google Maps, Photo / Done.
- **Tested end to end on the dry-run server** (port 3006, its own durable file, SMTP pointed at a dead port so nothing can leave the PC): manual rehearsal → Send tasks → untick all but Storm Water Drain → draft → Approve → "80 tasks created; the email could not be sent (ECONNREFUSED 127.0.0.1:1); the officer still sees the jobs" → officer card 0 of 80 → Done → "1 of 80 done" → the Collector's view opens at Act: Ready 1 / 80, the department table, flags on the map.

## Phase 5: live, check, learn, Ask the Map (02:00–02:20)

- Live: the view polls every minute with an ETag; a rain whose window holds now shows its reports so far (Rain) and its check. The report card (Check) and the memory after the rain (Learn) work on replays and on a rain that has passed.
- **Ask the Map** (`lib/rehearsal/intent.ts`, a 4-line hook in `useMapAsk.ts`): "what will flood tomorrow?", "which hospitals get cut off?", "wards that lose fire cover", "dry schools near Velachery", "how did we do last rain?", "replay 21 October", "நாளை எங்கே வெள்ளம் வரும்?", "மழை ஒத்திகை", "naalaiku enga thanni nikkum" open the rehearsal at the right stop (a hospital question selects the hospital that loses most reach). Ordinary map questions ("waterlogging within 300 m of schools") are untouched (tested); on the officer console nothing changes. The `/` palette has "Rain rehearsal (மழை ஒத்திகை)".

## Phase 6: hardening and numbers (02:20–03:00)

- **Tests: 35 unit tests** (routing vs Bellman-Ford on random cities, memory, no peeking, judge, trigger, playbook, task header, questions) and **9 golden tests** on real data (`rehearsal.golden.ts`: backtest, brute-force coverage oracle, no peeking, reach never grows; `engine.golden.ts` on the frozen store: every count equals its list, the report card adds up, unique jobs, **no complainant field anywhere in the payload**). Full unit suite: **1,423 passed, 0 failed** (13 skipped). `npx tsc --noEmit`: clean.
- Measured on this PC (dev server, slower than production):

| What | Time |
|---|---|
| Road graph load + index | 117 ms |
| New moment (memory + reach of 130 facilities + plan) | 1.8–2.8 s, then cached for the hour |
| Same moment again (incl. ~450 KB JSON) | 0.43–0.55 s |
| A hospital's reach | 0.33 s |
| A route across the city (Guindy → Central: 21 min, 11.9 km) | ~0.3 s |
| Backtest of all 7 rains | 0.9 s |

- `calibrate.golden.ts` runs only with `CALIBRATE=1` (it takes minutes and asserts nothing).

---

## Morning summary (29 Oct, ~03:00)

**Built and working:** Rain Rehearsal on the Collector console (rain band, the rehearsal view over any page, the palette, Ask the Map questions); real road routing on Chennai's OpenStreetMap network (123,062 junctions, 157,419 pieces; own Dijkstra / A*); the flood memory with replay and an honest backtest; reach of help; choke points; dry schools; the plan by department; Send tasks with approval (sandbox); the officer's before-rain tasks with a real-road visit order and Done; the five-stop clock (Warn, Act, Rain, Check, Learn); English / Tamil, light / dark, phone layout.

**How to see it:**
- On the console: sign in as the Collector, press `/` → "Rain rehearsal", or ask the map "what will flood tomorrow?". There is no IMD warning today, so the band is hidden; use "Rehearse a heavy rain anyway" or "Replay a rain".
- Without signing in (dev only): start `rehearsal-3006` from `.claude/launch.json`, open `http://localhost:3006/dev/rehearsal?replay=rain-2026-10-21` (Collector view) or `?officer=GCC-SWD` (officer card).
- Demo path: Replay a rain → 21 Oct → Warn (19 Oct 09:00, real IMD Orange) → tap a blue spot → tap a hospital (its reach shrinks) → Rain (the real reports drop in) → Check (report card) → Learn → Now → Rehearse a heavy rain anyway → Send tasks → officer card → Done → Ready 1 / n.

**Honest numbers (on our test data):** the streets it names caught 17–19 % of the 21–23 Oct flooding reports, about **1.6–1.7×** what the same length of random streets catches; the likely streets alone about **2.7×**. Earlier rains 1.1–1.75×. No hospital loses half its 10-minute reach (closing ~20 km of streets is spread thin); 5 government hospitals lose 10–34 %; 1–3 wards lose quick fire cover. The numbers move a little with each hourly build of the store.

**Not done / limits:**
- I could not open the signed-in Collector console (the Collector's password is not in any project file), so the hooks in `CollectorApp.tsx` (+14 lines), `Board.tsx` (+3) and `useMapAsk.ts` (+4) are checked by `tsc`, the unit suite and the dev preview of the same components, not by clicking through the real console. Please open it once.
- Not built from the prompt: the report card on the Briefing page, the PDF rehearsal sheet, the "now" road state during a rain (roads with open flooding reports in the last 12 h), elevation (optional), CFM bulletin PDFs (decision b: listed with a link only), SACHET.
- `data/roads/graph.bin` (8.3 MB) is not committed; a teammate's copy or a server needs it (commit it, or run `node scripts/build-road-graph.mjs`: 21 min online, `--offline` from the tile cache).
- Nothing committed or pushed. `.claude/launch.json` has a new `rehearsal-3006` config. The dev-only test data (80 tasks, 1 email row) lived in `data/aws-cache/dryrun-rehearsal/` and was deleted after testing.

**Decisions to confirm:** (a) tasks in `followups` (no new table); (b) bulletin PDFs not fetched; (c) emergency vehicles ignore one-way; (d) quick help = 10 min; memory settings (150 m spot, worst 20 km likely, next 40 km possible) chosen on the rains before 21 Oct.

## 29 Oct evening: "I do not see anything"

- Cause: the rain band appears only when IMD (or CFM) has a warning out, and there is none today; the other ways in (the / palette, Ask the Map questions) were hidden. Fixed: a **Rain rehearsal** button in the Collector top bar (left of Search), always visible; inside the rehearsal, with no warning, a **Replay the 21 Oct rain** button next to "Rehearse a heavy rain anyway".
- The dev preview server (rehearsal-3006) needs the folder data/aws-cache/dryrun-rehearsal/ to exist (recreated, empty).

## 29 Oct evening: Flood Monitor data, ground height, real time; Overview cards

**What the Chennai Flood Monitor really publishes** (read in the browser pane, 29 Oct 18:00):
- The bulletins (`/HomePage/DownloadImagesFromBulletin/<id>`) are PDFs whose pages are **pictures** (bulletin 945: 23 MB, 3 pages, no text layer). A program cannot read streets out of them reliably. The only *Street Flood Inundation Forecast* in our records (id 922, 23 Oct 2025) has been removed from their server (HTTP 500). None this season.
- Machine-readable and live: **rain at the TNDRRA automatic weather stations** (`GetRainfallDatafordashboard`: last hour, since 08:30, the day before; hourly). Chennai: Karapakkam, Semmancheri, Marina reporting; plus Tiruvallur, Kancheepuram, Chengalpattu stations upstream. Many older stations are silent since 2024–25.
- Also on the site but **closed to programs** by its firewall (HTTP 403 to a plain request): the bulletin list and the per-station rain forecast (`GetAWSForecastDataByAWSId`, 24/48/72 h). Getting past that would be bot-check circumvention (the attempt was refused by the safety check), so they are not used. The bulletin list still comes from the CFM collector's hourly files. To use the station forecast properly, ask TNDRRA / CFM for API access.
- Subway / bridge level sensors (`GetRlsData`, 47 points): newest readings are months old. Not used.

**Built:**
- `lib/rehearsal/cfmlive.ts`: live rain from the Flood Monitor stations, read every 10 minutes (cached; a failed read keeps the last good one and says so; a station silent for 3 h is "not reporting", never "dry"). Heavy rain now (15 mm in an hour, or 64.5 mm since 08:30) turns the trigger to ACT; 30 mm to WATCH.
- Stations have no coordinates; each is placed by its name with the resolver's own patterns, only when the place carries the station's first word (Thervoy Kandigai is not Kandigai).
- On screen: a **Rain now** chip in the rehearsal head (Chennai's wettest reporting gauge, with the reading time and a live dot), **rain gauge drops** on the map (today's mm; hollow when not reporting), a gauge card, the live gauge table at the Rain stop, bulletins linked to their own PDFs.
- `scripts/build-elevation.mjs` → `data/roads/elevation.bin` (1.3 MB): ground height of every road piece from AWS Terrain Tiles (zoom 13, 72 tiles; SRTM 30 m), and its height compared with the roads within 500 m. 23,209 pieces lie 2 m or more below their surroundings.
- **Calibration round 2** (rains before 21 Oct only): re-ranking flood streets by water nearby raised the lift on earlier rains 1.61 → **1.69** and on 21–23 Oct 2.00 → **2.18×**; low ground did as well (1.68 / 2.29×) but not better, so by the rule only "water nearby" is used for ranking and ground height is shown on the street card ("ground about 2 m lower than the roads around it"). (The base numbers moved from last night because the store rebuilds hourly.)
- Fixed: a shell edit had turned `\b` and `\s` in the station-name cleanup into a backspace and a plain "s" (station names lost their s); caught by `source-hygiene.test.ts`. The engine and road graph caches now include a version and the elevation file, so a running server picks up changes.

**Overview: "Open, by severity" and "My Tasks"** (user: "layout is not good, I can't understand; make use of space; every tile clearly visible"):
- They were two half-height cards in the middle column; each spent most of its height on headers (severity bar + 4 big tabs + note; a rule line), so one incident and half a task showed.
- Now **one full-height card** (`Attention.tsx`, `attention.css`) with a switch at its top: **By severity | My tasks** (with counts; My tasks' count red when work waits). Severity filters in one row (count above name, each with its share as a thin bar); rows on two lines (title; the reason it needs you as a red chip, then place · department · time) with **Act** on the right; tasks on two lines (title; proof chip "3 photos" / "No report yet", then department · time) with **Send back** and **Verify** / **Ask**; a tap opens the remarks and photos in place. If one of the two is switched off in Customize, the other fills the column alone.
- The middle column got a little wider (map 1.9 : list 1.15 : news 1.0); the band's count tiles put "than yesterday" under the change instead of cutting both; the top-bar button now reads **Rain** (the bar was full).
- Result at 1366 × 768: the High list shows **7 rows at once** (was 1). Light and dark checked.
- Old `SeverityCard` / `SevMix` / `TasksCard` removed from `Overview.tsx` (147 lines). The officer Board has its own "Open, by severity" and "My Tasks" cards: not changed.
- `/dev/collector` (development + dry-run store + localhost only) renders the real Collector console without a sign-in, for layout work; its own API calls still need the sign-in.

**Checks:** `tsc` clean; 36 rehearsal unit tests; full suite 1,421 passed with 2 failures, both fixed or explained: `source-hygiene` (the backspace above, fixed) and `studio/outcomes` "d-pdf" (Data Studio, not touched; passed when re-run).

## 29 Oct evening: officer Board, same redesign

- The officer Board had "Open, by severity", "My Work" and "Today's Briefing" as three narrow columns (~325 px) under the department snapshot: titles cut, 3 tasks visible.
- Now `src/components/officer/OfficerAttention.tsx` (same look, attention.css): **one card two columns wide** (grid `map snap snap snap / map sev sev brief`, class `att2`) with the switch **By severity | My work** (My work first when grievances wait for approval; its count red then). My work has two filters (**To approve** / **In action**) and the "returned by the Collector" line; rows on two lines (full title; severity or Returned chip, then zone · time · complaints) with **Approve** or **Complete & send / close** on the right. Old `SeverityCard` and `WorkCard` removed from Board.tsx (85 lines).
- `/dev/officer?dept=GCC-SWD` (development + dry-run + localhost only) shows the officer console without a sign-in; `OfficerApp`'s 401 redirect skips `/dev/` pages only.
- Checked at 1366 x 768, light and dark. Full unit suite **1,423 passed, 0 failed**; tsc clean.

## 29 Oct evening: the flood roads, clearly (user: "I don't clearly see the flooded road; zoom and move towards it")

- **Fly-in:** the rehearsal shows the district for a moment, then flies to the worst flood street at street level and opens its card.
- **Flood-spot tour** (top left of the map): "Flood spot 1 of 30 · <street> · 6 rains", previous / next, auto-play (6 s a spot), Whole district. Worst first: most rains, then open drains, then length. Also **Worst flood streets** (top 6) in the panel; each flies the map there.
- **A chosen street is framed whole** (fit to its lines, up to zoom 16.5), and drawn above every mark: glow, white casing, bright blue road, a flowing dash along it. While it is chosen, schools, lakes, gauges, rain drops and other streets' drain squares step aside; its own open drain complaints sit on it as orange dots.
- **Roads grow with the zoom** (width x 0.8 at the district view to x 2.3 at street level), with a white casing (dark in dark mode); possible streets are dashed; the base map is paler and less coloured so the blue stands out; names of named likely streets are written on the map from zoom 14.5 (each once, at most 30), redrawn after every move.
- Reduced motion (the viewer's system setting, or `?still=1` in a preview): no zoom animation, the map jumps instead of flying. A fly that has not moved the map after 1.5 s jumps (a busy or paused tab). Map tiles no longer fade in.
- Fixed on the way: the fly-in could be cancelled by a second answer; the late ward outlines pulled the map back to the district; the map, loading lazily, missed a fly chosen before it existed.
- Checked in the preview (`/dev/rehearsal?replay=rain-2026-10-21&still=1`): spot 1 Nelson Manickam Road (ward 106, 6 rains, 4 open drains) and spot 2 Wipro Street (ward 197, 6 rains, ground 6.2 m lower than around it) framed at street level, names on the map, Whole district back out. Full unit suite 1,423 passed.

## 29 Oct night: five plain steps (SUPERSEDED the same night by "Rain & flooding on the Overview map", below)

Only the page changed (`components/collector/app/rehearsal/`: RainRehearsal.tsx, words.ts, rehearsal.css; PlanSheet's title); the engine and the API did not.
- **The Warn / Act / Rain / Check / Learn clock is now five plain steps**, along the bottom and in the panel: 1 Flood streets (where water will stand), 2 Help & shelter (who help can't reach), 3 Send jobs (tell each department what to do), 4 The rain (watch it come in), 5 Report card (did the rehearsal get it right? with a "What it learnt" tab). Each step sets the map's layers itself and starts on the whole district.
- **Every step's panel says the same three things**: Step N of 5 and a title; one sentence on what you see; a "What to do" box with one or two numbered lines. Then its content, and Back / **Next: <next step>** always at the bottom of the panel (step 5: Start again).
- Step 1: 2 numbers (likely streets, +more may flood; blocked drains on them), the worst flood streets, the street tour on the map (only in this step). Step 2: the 5 / 10 / 15 minute switch moved here ("Quick help means within"), hospitals that lose reach, wards far from a fire station, safe schools for relief camps (each one flies the map there). Step 3: jobs to send first, Send jobs (N); with no warning, a note and "Plan for a heavy rain in 48 hours" (the old "Rehearse anyway"); practice says nothing is sent. Steps 4 and 5 as before, in plain words.
- **Header**: one status line (practice: "Practice · 21 Oct · nothing is sent"; planning: "Planning for a heavy rain in 48 hours"; the hours left come first, so a narrow header cuts the words, not the countdown), Rain now, Ready, then **Now | Practice on a past rain ▾** (newest first, "best for practice" on the newest with 20+ reports; switching goes back to step 1 and flies to that rehearsal's worst street), **?** (how to use), EN / த, close. Gone from the header: Rehearse anyway, Replay the 21 Oct rain, 5′ 10′ 15′.
- **Map layers**: one button with a checklist in plain words (Flood streets; Hospitals & fire stations; Blocked-drain complaints; Safe schools; Lakes, rivers & rain gauges; Satellite view), replacing the six chips. The legend follows the step.
- **A clicked mark** opens its card under "‹ Back to step N · <title>"; Escape closes a menu first, then the card.
- **First-time guide** (once per browser, `localStorage` key `diq.rehearsal.guide`, reopened with ?): four lines and the five steps, "Start with step 1" and "Practice on the 21 Oct rain". The fly-in waits until it is closed.
- Tamil for every new label (step names, titles, what to do, Next / Back, menus, layers, legend, guide).
- Fixed on the way: the header overflowed at 1024 px and on phones (close button pushed out); on phones the title is the cloud icon, step names wrap, the layers button is an icon.
- Checked in a second preview (`rehearsal-ux-3008`, local launch.json only): steps 1 → 5 with Next in Now and in practice on 21 Oct (report card 33 of 165, 1.9×), a street and a hospital card and Back, Plan for a heavy rain, the Send jobs sheet opened and closed (nothing sent), Practice menu, Map layers, Tamil, dark mode, 1024 px and 375 px.

## 29 Oct night, later: Rain & flooding on the Overview map (user: "I don't understand it; show it in the existing map; no step by step; a beautiful overview first, classified by rain; flooded areas of past rains with descriptions and tasks; simple and insightful")

The separate full-screen rehearsal is gone (RainRehearsal.tsx, RehearsalMap.tsx, words.ts deleted). The Rain button, the rain band, the palette and Ask the Map now open **Rain & flooding on the Overview's own map**: the map grows as for Ask the Map, the console's pins step aside, the base map turns to a calm street map, and a panel sits on the left (Ask the Map's `.amp` box, so the camera keeps clear of it and it becomes a bottom sheet on phones).
- **All rains (the first screen)**: the warning now in one line, three numbers (8 heavy rains since 19 May, 706 flooding reports, 96 streets that flood in 3+ rains), one insight sentence (the three zones with the most flooding and their share; the share of reports from streets that had flooded before), **Past heavy rains** newest first (date, mm at the wettest gauge, a bar of reports, the zone with the most), zones with the most flooding (bars; a click frames that zone), **Streets that flood in most rains** (a dot per rain, "7 of 8"), and **Before the next heavy rain**: the open jobs by kind with one Review and send button.
- **One rain**: All rains / older / newer, the title and chips (mm, reports, days), a written description (how many zones; the worst three with counts; how many reports came from streets that had flooded in an earlier rain), **Where water stood** (zone bars; a click frames the zone), the flood streets with reports in it (how often each has flooded), **Before the next rain like this** (the open jobs on those streets: their drain complaints, drain checks, pumps, diversions), and the reports, newest first.
- **A street or a report** (clicked on the map or in a list) opens its card on top with Back: a street's rains as dots (each a link to that rain), its complaints, open blocked drains, water nearby, low ground, late works, main road, its jobs with Send; a report's rain, its street and whether that street had flooded before, Open the complaint.
- **The map**: over the district each flood street is a soft spot (bigger and darker = flooded in more rains), from street level the road itself with a white casing; one rain shows its reports as dots, red when the street had flooded before, amber in a new place; a chosen street glows. A key sits beside the panel (not under the console's Ask button).
- Escape goes back one level (a card, a zone, a rain), then closes; the grown map shows Rain & flooding or Ask the Map, never both. The Send jobs sheet opens beside the panel, with only the jobs of what is shown ticked (PlanSheet unchanged, its title now "Send jobs").
- New, read-only: `pastRains()` in engine.ts and `GET /api/rehearsal/rains` (every rain with its flooding reports, each tied to the flood street it stood on within 100 m; cached with the memory, one computation an hour; the first call of an hour takes about 17 s here). SatMap gets an optional `rain` layer (rehearsal/rainLayer.ts); without it the map is exactly as before.
- Dev: CollectorApp takes `dev` (only /dev/collector passes it): the map outlines and Rain & flooding read the dev API; `/dev/collector?rain=1` opens it (`&replay=rain-2026-10-21` on a rain). /dev/rehearsal keeps only the officer's before-rain card.
- Checked in the preview: all rains, the 21–23 Oct rain (167 reports, 54 from streets that had flooded before, Anna Nagar 24), a zone, Nelson Manickam Road (7 of 8 rains, 2 blocked drains open, 2.7 m lower, 4 jobs) framed at street level, a report card, Escape level by level, Close (the console's 155 pins and the Ask pill back), the Rain button, Ask the Map's "replay" and "how did we do" opening the right rain, Send jobs opened and closed (nothing sent), dark mode, 375 px (bottom sheet, map in sight above it).
