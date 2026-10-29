# Ask the Map: overnight build log (28 Oct 2026)

Run of `docs/ASK_THE_MAP_ULTRA_PROMPT.md`, all phases without stops (the user's instruction, 28 Oct night).
Limits kept: no commit or push, email sandbox only, no large packages, no new store tables. Decisions that can be
undone took the recommended default and are listed at the end for the morning.

Test server: `portal-aws-dryrun` (port 3001, dry run). A test Collector session is minted locally for it
(scratchpad `mint-session.cjs`, never printed). Screenshots: `docs/review-pdfs/ask-the-map/` (not committed).

---

## Phase 0: verify and measure

### Section 4 facts against the code and the store (local cache, 27 Oct 2026 20:06)

| Fact in the prompt | Measured | |
|---|---|---|
| incidents 27,778, all with lat/lon | 27,778, all with lat/lon | same |
| precision ≤50 m 24,752 · 51–300 619 · 301–2,000 1,797 · >2,000 610 | same | same |
| 27,168 pinnable | 27,168 | same |
| open 2,736 | 2,736 (`is_open`; the console uses the *effective* open flag, with the Collector's decisions laid on top) | same |
| severity Low 12,836 · Medium 9,888 · High 4,147 · Severe 907 | same | same |
| 35 categories; top SOLID_WASTE 3,664 … FLOOD_WATERLOGGING 1,700 | same | same |
| open flooding 217 | 217 | same |
| `is_synthetic_any` 27,019 | 27,019 | same |
| reported 1 May to 27 Oct 2026 | 2026-05-01 00:11 to 2026-10-27 20:06 | same |
| ref_facilities 197, kinds as listed | same (columns: `type`, not `kind`) | same |
| hotspots 347 | 347 | same |
| ref_wards / ref_zones / ref_taluks 200 / 15 / 18 | 200 / 15 / 18 (17 in the district) | same |
| intel-reference.json 81 places | 81 | same |
| **Ward Gi\* is not in the portal store** | **It is.** `ref_wards.gi_star_z_30d` (200 wards), `hot_ward` (13 hot), and `adjacent_wards` (the contiguity) | **differs**: the TS Gi\* parity test runs against the stored column |
| `MapAnswer.tsx` at `assistant/MapAnswer.tsx` | `src/components/collector/app/assistant/MapAnswer.tsx` | path only |
| Distance code in `conflicts.ts`, `intel.ts`, `nearby.ts` | **None there.** The copies are in `locreview.ts`, `nlp.ts`, `threads.ts`, `studio/place.ts` (111.2 km/degree), `cluster.ts` (111,320 m) and SQL in `assistant/incidents.ts` | **differs**: the identical JS copies now import `geom.ts` |
| Defaults end at the store's as-of time, never the wall clock | `asOf()` returns the **later** of the pipeline's as-of and the IST wall clock, and every console window uses it | **differs**: the map uses `asOf()` too, so its numbers equal the Overview's |
| "open" | The console counts the *effective* open flag (`effectiveSql`: a Collector resolve/reject closes, reopen opens) | the map applies the same rule (`effectiveStatus`) |
| Frozen golden store | `eval/store` was frozen 17 Oct (27,420 incidents), not 27 Oct | golden tests use the frozen store; the oracle computes its own expected numbers, so the date does not matter |

### Location audit (9.10), read-only

- Incidents outside every ward polygon: **404** (all pinnable; mostly in the 3 km fringe the pipeline accepts).
- Point in a different ward from the recorded `ward_no`: **171** (all pinnable; 105 at ≤50 m, 7 at 51–300 m, 59 at 301–2,000 m); of these the **zone** differs for **22**.
- Records with no `ward_no`/`zone_no`: **611**; **482** sit exactly on the district centroid (13.0827, 80.2707), all coarser than 2 km (never pinned).
- At 0/0: **0**.
- Facilities outside the district: **23** of 197 (one has no coordinates).
- Ward polygons: 200 single polygons, no holes.

Decision: **inside a ward, zone or taluk counts by the record's `ward_no`/`zone_no`/`taluk_code`** (the console's rule), so the Map always equals the Overview. 171 mismatches out of 27,168 pins (0.6 %) is small; drawn shapes, "near" and "along" use the pinnable point.

### Overview map card at 1366 × 680 (dry-run server, CSS zoom 1)

- top bar 0–60; band (greeting, filters, KPIs) 72–270; row of four cards 282–666.
- map card `.a-map`: x 22, y 282, **376 × 384**; the Leaflet map inside it **350 × 224**.
- Grown in place, the card covers the band and the row: **1,322 × 594** (x 22, y 72), so the 380 px panel leaves a ~940 px wide map.
- Screenshot: `docs/review-pdfs/ask-the-map/phase0-overview-before.png`. Console errors: 0.

### SatMap callers (props must keep their meaning)

| Caller | Props |
|---|---|
| `collector/app/Overview.tsx:109` | geo, zoneCounts, pins (≤150), zone, layers, stations, added, onItem, mode, taluk, focus, onZone, onTaluk, onPin, zoneTip, onStation |
| `officer/Board.tsx:82` | geo, zoneCounts, pins, zone, layers, stations=[], added=[], … (+ `pinColor`) |
| `officer/Cards.tsx:78` | the same as Board |

### OpenStreetMap layers (built 28 Oct 2026 00:23–01:00 IST, one run; the public server was busy, so the script backs off and retries)

| Layer | Features | In the district | Notes |
|---|---|---|---|
| schools | 647 | 560 | 6 node/way duplicates merged |
| colleges | 187 | 125 | |
| hospitals | 1,441 | 1,069 | hospitals, clinics and health centres; "hospitals" in a question means hospitals + health centres (clinics only when asked) |
| fire_stations | 16 | 13 | **OSM is incomplete here** (Chennai has more): answers say the count |
| police_osm | 112 | 95 | cross-check only; the map uses the store's 60 |
| osm_places | 582 | 425 | neighbourhoods, extend the resolver |
| rail_metro | 235 | 196 | rail, metro and bus terminals |
| roads | 10,988 named groups | 9,094 | 3.8 MB raw / 512 kB gzip, server-side only (over the 400 kB budget, but never sent to the browser) |
| waterways | 41 named | 36 | 326 unnamed drains dropped |
| water_bodies | 360 | 233 | 217 unnamed ponds under 0.5 ha dropped |

Spot checks (distance from a known position to the named feature): Stanley Hospital 29 m · Rajiv Gandhi GGH 52 m · Chennai Central 88 m · Egmore 32 m · IIT Madras 343 m (campus centre) · Buckingham Canal at Mylapore 388 m · Velachery Lake 152 m · Chembarambakkam is outside the box (not in the layer), as expected. Anna Salai and the Adyar River "missed" only because OSM splits them: the real Anna Salai is named "Anna Salai (Mount Road)" in four pieces (plus 8 unrelated residential "Anna Salai" streets), the Buckingham Canal is split between "Buckingham Canal" and "Buckingham Kaalvaai", and the Cooum is named only in Tamil (கூவம் ஆறு). Fixed in `world.ts`: pieces of one main road merge by base name, a road's own names outrank names it shares, and a short alias list (Mount Road, OMR, GST Road, ECR, PH Road, Cooum, Buckingham, Adyar River, Chennai Central, CMBT, Marina) points at the right feature.

Police cross-check: of the store's 60 stations, 12 have an OSM police point within 300 m and 33 within 1 km. OSM's police points are sparse and often off; the map uses the store's layer, as the prompt says.

### Empty-state questions (each returns a non-empty answer on the 27 Oct data)

Generated by rules at runtime (`suggest.ts`, Phase 2); on today's data they come out as: see Phase 2.

---

## Phase 1: engine (done)

Files (all new unless said): `src/lib/map/` geom.ts, types.ts, plan.ts, words.ts, resolve.ts, route.ts, execute.ts, answer.ts, chips.ts, camera.ts, brief.ts, ai.ts, world.ts, ask.ts, fixture.ts; API `src/app/api/map/ask/route.ts`, `src/app/api/map/layers/[id]/route.ts`; `scripts/build-map-layers.mjs` (+ `npm run layers:build`). Small edits: `nlp.ts` exports its gazetteer and name patterns; `locreview.ts`, `nlp.ts`, `threads.ts`, `studio/place.ts` use `roughKm` from geom.ts (same formula).

Verified:
- `npx tsc --noEmit`: clean.
- `npx vitest run`: **1,151 passed**, 1 skipped (the whole suite; the map's own: 266).
- Rule-only coverage on the 120-question set (40 EN, 40 TA, 40 Tanglish): **120/120**. Honest note: I wrote the set alongside the rules, so it flatters them; the question log (`data/aws-cache/map-questions.jsonl`) will show real coverage.
- Golden on the frozen store (`npx vitest run --config vitest.golden.config.ts src/lib/map/map.golden.ts`): **5/5**: 30 questions equal a brute-force oracle (ids and counts); 10 Map counts equal the console's own incident list; Area brief counts equal their lists; officer lock; byte-for-byte determinism.
- Live (dry-run server): rule-only answers 50–500 ms after the first (the first builds the world in ~2–5 s).

Differs from the prompt:
- "open" = the console's Open incidents list and Ongoing tile (effective status, not already routed to a department), so the Map equals the list it opens. The zone table counts routed ones too; the console itself has the two meanings.
- Plan type additions (each needed by a listed question): `last_days.offset`, `take.where.kinds`, `within.near` is a list, `nearest.from` may be `place:<ref>`, `farthest.beyond_m`.
- Hotspots default to all statuses over 90 days (the pipeline's own window), so "where are X clustering" has enough reports; the chips say so and can change it.

---

## Phase 2: Ask the Map on the Overview map (done; screenshots in docs/review-pdfs/ask-the-map/)

- An **"Ask the map…" pill** sits top-left on the Overview's map. One click grows the map card in place over the band and the cards (CSS only: the same SatMap instance), and opens the 380 px panel. **Back to overview** (or Esc) shrinks it with the answer still drawn (the pill then shows the answer's headline); **Clear** removes the answer and flies the map back to the Overview's view.
- Panel: Ask box (Enter asks, ↑ recalls, mic where the browser has speech), **plan chips** (each part has a ▾ menu; defaults are marked "default"; a chip edit re-runs with no AI), the answer card ("N … · map layer ready", one sentence, departments, no-exact-place count, as-of line with every layer's source and date), **How this was worked out** (click a step: its rows on the map), the list (worst first, ≤200, "and N more · Export all"; hover lifts the pin, click flies to it, a second click opens the incident; ↑/↓/Enter work), Area brief, and actions.
- Map: answer layers in their own panes above the console's pins, which dim to 25 % (the zone heat fades too); area outlines with a district mask; rings around facilities with a case nearby (ripple in); road and water corridors drawn to true width at every zoom; facility glyphs with letters and shapes; pins drop in by priority; >400 on screen below zoom 14 cluster in a pixel grid; stacked points show a count and fan out; coarse locations show their accuracy circle on hover; compare outlines in two colours with counts; nearest lines with distances; farthest far-point line; hotspot circles (pins appear when one is chosen); count-by bubbles.
- Camera (`cameraFor` + `play` in SatMap): flies to every answer, frames the middle 90 % of results, never under the panel (padding from the panel's real box), the user's drag/wheel/pinch stops it (`user_took_over` in `data-camera`), small follow-ups keep the view, reduced motion jumps without flight. Follow the road (6 s) and Tour the top 3 hotspots.
- Grown tools: Back to the answer, the circle tool (drag a circle → Area brief), right-click a spot (500 m brief), click a ward (ward brief), Layers (schools, colleges, hospitals, fire, police, rail/metro, lakes, rivers; canvas markers), Satellite/Streets, metric scale bar; legend from what is shown, with counts, sources and the DataMeet note.
- Empty state: 6 questions generated from the live data (`/api/map/suggest`), each verified non-empty, plus the selling lines.

## Phase 3: integration (done)

- **Ask District IQ**: distance, road and nearest questions go to the map engine (`lib/map/assistant.ts`, a lane in `pipeline.ts` before the Studio lane); the card shows the points, the steps, and **Show on the console map**, which runs the same plan on the Overview's map.
- **Incident detail**: "What else is near here?" runs "within 500 m of this incident, last 30 days, any status" on the map.
- **/ palette**: "Ask the map: “…”" runs the typed text; "Ask the map" opens the grown map.
- **Officer Board**: the same pill, panel and grown view, locked to the officer's department on the server (the officer's KPIs row hides while grown). No Send to department.

## Phase 4: actions (done except map print)

- **Send to department** (Collector): `POST /api/map/send` re-runs the answer on the server, drafts one email per department (≤25 cases listed, "and N more"), each opens for review and editing; **nothing is sent until Approve**; sandbox by default (`delivery()`), a follow-up per listed case due in 24 h, one `audit_log` row per email with the plan JSON. Built on actionmail.ts (`draftBatchAction`, `sendBatchAction`).
- **Export**: `POST /api/map/export` CSV or GeoJSON of exactly the answer's rows (76 rows for a 76 headline, checked), the question, as-of and plan in the header/properties, no personal data, audited.
- **Save view**: the Collector's view is a workspace (`filters.askMap.plan`): opening it re-runs the plan on fresh data. An officer's view is kept in that browser (officers have no workspaces).
- **Visit order** (officer): top 10 open, exact-place cases by priority; nearest neighbour + 2-opt; numbered stops and straight legs on the map; total distance; click the map or "Use my location" to start elsewhere; **Open in Google Maps** (coordinates only, ≤9 waypoints, opened only by a click).
- Not done: **map print to PDF** (P1).

## Phase 5: hardening and demo

- **Property test** (in `map.golden.ts`): 300 seeded random valid plans on the frozen store: no throw; pins drawn + beyond-the-5,000 + no exact place = headline; list = min(total, 200); every row meets every filter of its plan (re-checked); point rules keep only exact places; every 10th plan's CSV export = headline. **p50 13 ms, p90 162 ms** (budget 300 ms), max 1.6 s (a 2.5 km "within lakes" polygon plan). It found two real bugs, now fixed: answers over 5,000 places did not say they were capped (now: "The map draws the 5,000 highest-priority places; all N are counted, by ward in the bubbles", with ward bubbles), and the invariant needed the capped count.
- **Performance** (dry-run server, this PC, warm, 50 runs below the 40/min rate limit): rule-only answers **p50 135 ms, p90 158 ms end to end**, server p90 59 ms (budget 1.5 s). With the AI rewording the meaning sentence: 0.35–2.2 s. First answer after a server start builds the world: 2–5 s.
- **E2E (Playwright, msedge, port 3001)**: Collector flow at 1366 × 680 (16 steps: empty state, schools, only severe (view kept: true), trace, row focus, compare, Tamil, road, hotspots, brief, nearest, farthest, by ward, change, empty answer with nearest miss, back to overview), dark mode, reduced motion (same final views, no flight), phone 375 × 812 (bottom sheet); officer flow (lock, visit order). **Zero console errors** in every run; no page scroll at 1366 × 680; requests only to this app, Esri tiles and Google Fonts (already used by the console). Screenshots: `docs/review-pdfs/ask-the-map/`.
- **Demo script** with measured numbers and 12 rehearsal questions: `docs/ask-the-map/DEMO.md`.
- Fixes from looking at the screenshots: framing too wide (legend counted as bottom padding), zone heat now fades under an answer, "from it" → "from a school", Area brief circles for named places, hotspot answers show clusters (pins only for a chosen cluster), AI rewording may no longer add a sentence of true-but-irrelevant numbers ("It covers 200 areas and 12372 metres" was caught: a rewording must carry exactly the template's numbers), honest OSM fire-station note, officer grown map had zero height, phone sheet height, Tamil back label.

---

## Morning summary (28 Oct, ~02:45 IST)

**Done:** Phases 0–5, except map print to PDF. Nothing committed or pushed. One sandbox email sent to the team inbox, to test Approve and send.

**Verified:** `tsc` clean · unit tests 1,154 passed · golden 14/14 (map 8 incl. the Gi* parity with the pipeline's stored values, Ask District IQ's own goldens still pass) · E2E demo twice in a row with identical answers and 0 console errors · officer flow · dark mode, reduced motion, phone.

**Not done / not verified:**
- Map print to PDF (P1).
- No scripted keyboard-only run, contrast measurement or 200 % text test (the keyboard paths are built).
- The AI planner path was not exercised live: the rules answered every test question.
- A native speaker has not reviewed the Tamil strings.
- The rules answer from the words they recognise: in "spots where kids might be at risk from standing water", "kids" is ignored, but the trace shows what was used.
- Chips lose their "default" marks after a follow-up edit.
- An officer's saved views are kept in that browser only.

**Decisions for you (defaults taken, all reversible):**
1. **`data/layers/*.geojson` (4.9 MB, OpenStreetMap, ODbL)** is untracked, and the map needs it at runtime. Recommended: commit it, or each machine runs `npm run layers:build`.
2. **Commit and push**: recommended to review this log and the diff, then commit on `aws-deploy`. Data files stay out.
3. **Partly understood questions**: recommended to send a question to the AI first when it holds words the rules didn't use, if AI is available.

---

## AI upgrade (28 Oct, morning)

Homework: FarmwiseAI's Play Store apps (கள ஆய்வு / FIMMS Vellore, Field Inspection Yadadri, CURE for GHMC, M Velanmai, TNAU AgriCart) and its LinkedIn page. Their apps do assigned sites, overdue flags, GPS geofenced check-ins, geotagged photo evidence, issue → target date → Action Taken Report, nearest buildings on a GIS map, and bilingual voice. No public post shows a conversational map. Ask the Map goes past them: it answers a question about the whole district, finds what matters in the answer, and turns it into an action with an owner.

- **AI planner that works.** Groq and Gemini refused the plan's JSON schema (nested one-of shapes), so the AI path had never run. The model now fills a flat form (`wire.ts`), and code turns it into the typed plan and checks it (round-trip test on 14 plan shapes).
- **AI on the words the rules miss.** The router lists the meaningful words it could not use ("kids", "sea", "north"). When there are any, the AI reads the whole question, with the rules' plan as a hint and a concept list (kids → schools, coast → coastal zones, north/south zones). Example: "spots where kids might be at risk from standing water" → flooding within 200 m of schools. Without AI, the rules answer and the trace names the unused words.
- **Insights the map computes** (`insights.ts`), each with its rows (click → those pins):
  - past deadline, and with whom;
  - repeat spots (3+ reports within 100 m);
  - change on the period before (reported in both windows, so not skewed by later closures);
  - concentration in one ward;
  - wards well above their neighbours (Gi*);
  - the most affected named facility;
  - reports mentioning children, schools, hospitals or the elderly;
  - severe and still open.
- **AI analyst** (`analyst.ts`, `POST /api/map/insight`, Groq gpt-oss-120b, ~1.3–3 s): a short reading, up to three actions with the owning department (a one-click draft to that department), and one thing to watch. It writes only from the computed facts; any sentence with a number not in the facts is dropped. It loads after the map answer, so the map never waits.
- **Faster:**
  - the map world is built at server start;
  - answers are cached for a minute per plan;
  - the headline is no longer AI-reworded (one AI call per question instead of two);
  - insight rows are sorted through a lookup table (a 14,716-incident answer went from 18 s to ~1 s).
  - Normal answers: 40–90 ms server time.
- **Smoother map:**
  - beyond the top 300 pins, places are dots on one canvas, so 5,000 stay fluid;
  - count bubbles appear only when over 1,500 are on screen;
  - a Heat view toggle;
  - the camera no longer flies when the answer is already in view;
  - softer flights;
  - the panel code loads when the pointer reaches the pill.
- **Fixes:** a road named "(North)" no longer matches "north"; "Most affected" names only named facilities; "all incidents this quarter" is a new question, not a period edit.
- **Checks:** 294 map unit tests; 8 map golden tests (property p90 257 ms); browser run with 0 console errors. Screenshots ai1–ai5 in docs/review-pdfs/ask-the-map/.

## News on the map (2026-10-28, after the push)

- **"In the news" filter:** incidents a news outlet reported (`incidents.outlet_count > 0`). Words: in the news, newspapers, press, media, headlines; செய்தி / செய்திகளில் / நாளிதழ் / பத்திரிகை; news la, paper la. The AI planner has a `news` field and a concept line. Default status is "any" for news questions (what was reported, open or not).
- **Follow-ups and chips:** "only in the news", "news only", "செய்திகளில் வந்தவை மட்டும்" add it; "all sources" or the chip's × removes it. Plans saved before this still parse (the field is optional).
- **Articles behind an answer:** an "in the news" answer pins each article at the locality it names (purple "N"). Its popup gives the headline, outlet, date and a link to the publisher. Articles that name only a taluk, zone or the district are counted in the panel ("counted, not pinned"), never placed at a guessed spot.
- **Press links in the list:** every row with news coverage shows up to 3 outlets, each linking to its article.
- **News layer:** Layers → Reports → "News reports, 30 days". Covers all incident articles in the district, including the ones the pipeline did not link to an incident. Live data on 28 Oct: 268 pins, 946 counted without a locality. An officer sees only their department's news.
- **Insight:** "N of the M were reported in the news; K still open", with "Only the ones in the news" as the next step.
- **Fix found by the property test:** "by ward/taluk" no longer fails when none of the results has that area on record; it says so (news-only incidents often name only the city).
- **Checks:** map unit 307 passed; golden 8 passed (p90 211 ms); live: "flooding in the news this week" gives 8 incidents and 8 articles (3 pinned, 5 counted); browser run with 0 console errors. Screenshots news1–news3 in docs/review-pdfs/ask-the-map/.

## Clearer answers, live feeds, crash fixes (2026-10-28 evening)

- **Answer at a glance:** the panel now leads with the number in large type and what it counts ("160 · open flooding incidents · last 7 days"), with no "map layer ready". Under it: one sentence of meaning, then key-fact tiles (past deadline, severe, and still open when closed ones are counted). Each tile shows its own cases on the map when clicked.
- **Filters folded:** the plan's parts are one line ("Flooding (all kinds) · Last 7 days") with a Change button; the chips open only when asked. Insights are renamed "What needs attention" and show 3, then "N more".
- **On the ground now** (src/lib/map/conditions.ts): live feeds that have a place, read where the answer is.
  - Flooding and drainage: the IMD district warning, the nearest station's 24 h rain (or "No rain …: standing water points to drains or pipes"), lakes over 85 % full in the area, and PWD water works under way and behind schedule. Building works are left out.
  - Health: the nearest government hospitals' bed occupancy and emergencies.
  - Pollution and fire: the nearest AQI station.
  - An orange or red IMD warning is shown with every answer. Area briefs show conditions too.
  - Each reading is drawn on the map as a value pill (works as small amber squares, figures on hover).
- **Live layers:** Layers → "On the ground now": Rain (IMD), Lake levels (PWD), PWD works under way, Govt hospital beds (MIS), Air quality (CPCB). Sources are observation_signals (latest per place) and pwd_works. No new tables.
- **Crash fixes:**
  - Leaflet guards (askmap/leafletSafe.ts) stop the "Cannot read properties of null (_latLngToNewLayerPoint …)" family of errors when a new answer clears pins mid-zoom.
  - The panel prefetch on hover no longer leaves a failed chunk load unhandled.
  - The Send dialog survives a dropped connection.
  - An aborted question no longer shows "could not answer".
  - A 33-question headless run (follow-ups, chips, fast repeats) and an officer run showed 0 page errors.
- **Answer fixes:**
  - Gibberish ("asdf qwerty") is no longer answered with the whole district: the AI planner's flat plan has `understood`.
  - "ward 999" and "zone 22" are said plainly.
  - "compare zone 9 and zone 10" after an answer is a new question.
- **Checks:** map unit 317 passed. Screenshots v2-1 … v2-6 (light) in docs/review-pdfs/ask-the-map/.
- **Faster everywhere:** a filter's date window was worked out (with date parsing) once per incident, about 27,000 times per step; it is now worked out once per filter (execute.ts windowOf). The random-plan check went from p90 380 ms to 40 ms; insights that re-run the question (change on last period) got the same speed-up.
- **Final checks:** golden 14 passed (p90 40 ms); map unit 317 passed; full unit run: the only failures are 2 Data Studio outcome tests that pass when run alone (timing under load, files not touched here).

## Simpler answers and place questions (2026-10-29)

- **Place questions answer with the places.** "schools in Valasaravakkam" used to become "open incidents within 500 m of a school in Zone 11", and the map drew every school near any incident in Chennai. Now the router reads a facility with no incident words, and no "near" before it, as the places themselves: take schools, keep those inside the area (by their ward for a ward, zone or taluk; by distance for a circle). Answer: "13 schools in Valasaravakkam (Zone 11). 1 is government. Including …"; the map draws only those 13; the panel lists them by name. "flooding near schools", "school pakkathula kuppai" and "பள்ளிகள் அருகே" still ask about incidents near schools.
- **Near places trimmed to the answer.** A "within" step followed by an area used to keep every place it measured to; now only the places the final incidents are near are drawn.
- **Default period 7 days** (was 30) when the question names none, in the rules and in the AI planner's prompt. Hotspots keep their 90 days.
- **Removed the AI analyst and "What needs attention"** from the panel; insights are no longer computed per question (insights.ts and /api/map/insight stay, unused).
- **Card trimmed:** the departments row is gone (the meaning sentence names the main one), tiles with 0 are hidden, live readings capped at 2, the as-of line is one short line (sources on hover). Meaning does not repeat the one zone asked about; "It is …" for one; "All are with …" when one department holds all.
- **Filter line** says "Near schools" or "Within 300 m of schools", not "of Schools (OSM)". Area headlines keep the "within 500 m of a school" part.
- **Hover lag:** hovering a list row set React state in the console shell, re-rendering the whole Collector console on every row; the hover now goes straight to the map pins. A row click reaches the next frame in about 100 ms in dev mode; the rest is the map's fly-to.
- Tests: map unit 324 passed (new: places in an area, near vs places, 7-day default, near-place trimming); golden 14 passed, p90 43 ms; tsc clean. Screenshots v3-1…v3-4 in docs/review-pdfs/ask-the-map.

## Follow-ups, the conversation, and the Overview map first (2026-10-29)

- **Follow-ups keep what they do not change** (route.ts `mergeFollowUp`, after `editPlan`): "in Adyar" / "what about Velachery?" / "make it zone 10" keep the topic, period, status and distance and move the place; "and thefts?" / "same for flooding" keep the place and period and change the topic; "near schools" adds the distance to the last answer; "hospitals there" lists them in the last answer's area; "open complaints near them" after a places answer. A full question ("flooding in zone 13") is still a new question. New edits: "show the overdue ones" / "how many are past deadline?" (overdue filter), "which department has the most?" (same plan, answer said by department), "which zone has the most?" (count by zone), and "remove hospitals" when it is the only facility (drops the distance step). Follow-up words added to FILLER so they no longer call the AI.
- **The conversation in the panel**: every question shows as a bubble with its answer; earlier questions stay above as a chat (question + the answer's gist), and a click brings that answer back (and makes it the one follow-ups edit). Chip edits and map clicks are labelled too. "Ask next" chips under each answer are follow-ups the router reads (overdue, only severe, which zone, which department, this month, near schools; for places: other facilities there, complaints near them).
- **Panel wider**: clamp(380px, 34%, 460px).
- **Overview leads with the map** (Overview.tsx grid + overview-map.css, loaded last): the map spans both rows on the left (2.1fr); severity and tasks stack in the middle; news runs down the right. The band is thinner (18.5 px greeting, one-line count tiles, breakdown in the tooltip, slimmer snapshot rows, thinner alert bars). The map card has no header: its name and Zones/Taluks sit in the row under it (title hidden on a narrow card). The map re-fits the district when its box grows until the user or an answer moves it. Map: 350×126 → 635×293 at 1366×680; 499×364 → 899×582 at 1920×1080.
- Tests: map unit 331 passed (new follow-up chains); golden 14 passed, p90 41 ms; tsc clean; headless console checks (collector conversation, officer Board) 0 errors. Screenshots ov-before/after5 and v4-1…v4-4 in docs/review-pdfs/ask-the-map.
