# Ask the Map: research for the final version

20 November 2026. What I read, what each source gives us, and what this build takes from it, ranked by what a Collector gains.

## 1. The plan we build against

The Claude Doc "Ask the Map: making it Collector-grade" (read with the docs tool, 20 Nov 2026). Its points that decide this build:

- **Claude should read the questions.** Today Amazon Nova Lite writes the plan when the word lists fail; the doc ranks "Claude writes the plan" first.
- **Map the Collector's job, not just complaints.** Banks and ATMs (the Collector chairs the quarterly RBI Lead Bank Scheme meetings, DCC and DLRC), places of worship and wine shops (distance rules), ration shops (food access), and the civic places people are sent to.
- **Rank areas by change** (as NITI Aayog's Aspirational Districts dashboard ranks districts by improvement) and **find gaps by distance** (as PM Gati Shakti does for siting services).
- **A partial layer must say so on the map** ("OpenStreetMap, 31 shops, not the full list").
- **Rule distances must come from the Excise desk**, never a guessed legal figure.
- **Meeting packs** written from the server's facts; **load your own list** with officer approval.

## 2. What the code does today (read before building)

- `src/lib/map/route.ts` reads most questions with rules (about 880 lines of word lists); `ai.ts` fills a flat plan (`wire.ts`) when they cannot; `plan.ts` checks it; `execute.ts` runs it; `answer.ts` words it from templates. The AI never computes a number, and a reworded sentence whose numbers are not facts is dropped.
- `src/lib/ai/gateway.ts` tries providers in `AI_FORCE_PROVIDER`, `AI_PROVIDER`, `AI_FALLBACK_PROVIDER` order. The live `.env` forces Bedrock (Nova Lite), so every map plan went to Nova Lite first.
- **Found on 20 Nov 2026, live settings:** the Bedrock keys in the main `.env` have expired (AccessDenied), Groq's free models run out within minutes under load, and the `ANTHROPIC_API_KEY` in the main `.env` is refused (401). So on the live settings Ask the Map's AI step mostly fails, and questions the rules cannot read fall to chips. This is the strongest reason for its own provider order.
- `claude.ts` already sends structured outputs, but a schema with more than 16 union fields or 24 optional ones goes as plain JSON. The map's flat plan has about 40 nullable fields a step, so it would have gone as plain JSON.

## 3. Open-source projects studied

Licences checked on the npm registry on 20 Nov 2026 (`registry.npmjs.org/<package>/latest`).

| Project | Licence | What it does | What we take |
|---|---|---|---|
| [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) | MIT | Clusters thousands of markers by zoom | Already have our own pixel-grid clusters (`answerLayers.ts drawPins`); keep them. The idea we take: a cluster's count on the bubble, a click zooms in. Used for the league table's area bubbles. |
| [Leaflet.heat](https://github.com/Leaflet/Leaflet.heat) | BSD-2-Clause | Canvas heat layer | The console already has a heat view. No change. |
| [Leaflet.draw](https://github.com/Leaflet/Leaflet.draw) | MIT | Drawing and editing shapes | The circle tool exists. Not needed now. |
| [leaflet-geoman (free)](https://github.com/geoman-io/leaflet-geoman) | MIT (a paid Pro also exists) | Drawing, editing, snapping | Worth it if officers must draw their own polygons (encroachment areas). Left for later; not in this build. |
| [leaflet-side-by-side](https://github.com/digidem/leaflet-side-by-side) | MIT | Swipe between two layers | Apshana's Then-and-now swipe already does this (final, not touched). |
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | BSD-3-Clause | WebGL vector maps, 3D, terrain | A move off Leaflet would rewrite `SatMap.tsx` and every layer drawer. Nothing in this build needs WebGL; 3D flood depth is a later item in the doc. **Stay on Leaflet.** |
| [Turf.js](https://github.com/Turfjs/turf) | MIT | Buffers, nearest point, points in polygon | Our `geom.ts` already has haversine, a grid index, point-in-polygon and distance to a line, with tests. We take Turf's patterns, not the package: "points within N m of other points" (the rule check), and "nearest facility from each area" as a gap analysis (the isochrone-style idea, with straight lines, said as such). No new dependency. |
| [Supercluster](https://github.com/mapbox/supercluster) | ISC | Fast point clustering | Same as above: not needed at our sizes (under 5,000 pins). |
| [osmtogeojson](https://github.com/tyrasd/osmtogeojson) / Overpass | MIT / data ODbL | OSM JSON to GeoJSON | Our `scripts/build-map-layers.mjs` already does this, politely (one query a layer, pauses, back-off on 429/502). We add 14 layers to it. ODbL attribution stays on the map and in every answer's sources. |
| [kepler.gl](https://github.com/keplergl/kepler.gl) | MIT | Analyst UI: layers, filters, a legend per layer | UX we take: every layer's colour in one table (`LAYER_COL`), a legend that lists only what is on the map with counts and source, and a "data is partial" line where it is. |
| Felt (closed product) | — | Shareable maps, "add your data" | UX we take: upload a table, see what was placed and what was not, then publish. Our version: review rows, then approve. |
| [PapaParse](https://github.com/mholt/PapaParse) | MIT | CSV parsing | Not needed: SheetJS (`xlsx`, Apache-2.0, already a dependency) reads CSV and Excel the same way. |
| [SheetJS](https://github.com/SheetJS/sheetjs) | Apache-2.0 | Excel and CSV | Used for "Load your own list" (already in `package.json`). Formulas off; cells read as text. |
| [LLM-Find](https://github.com/gladcolor/LLM-Find), [LLM-Geo](https://github.com/gladcolor/LLM-Geo), GIS Copilot (Penn State GIScience) | open source (repos) | An LLM writes and runs GIS code | We do **not** let the model write code. The lesson we take: a fixed set of spatial operations with a schema is safer and testable; their failures are wrong operations and made-up numbers. |
| [SpatialText2SQL (multi-agent branch)](https://github.com/SongY123/SpatialText2SQL) | open source | Natural language to spatial SQL | Same lesson: never SQL from the model. Our typed plan (10 steps, now 11) stays the model's only output, checked by `checkPlan`. |
| [GeoBenchX](https://github.com/Solirinai/GeoBenchX) | open source | Benchmark of LLM agents on multi-step GIS tasks | The method we take for the eval: each question has the operations and parameters a correct plan must have, scored automatically (`eval/map-final/dev.json`, `mapai.live.ts`). |
| Civic dashboards: NITI Aayog Champions of Change, Andhra RTGS, PM Gati Shakti (described in the plan doc) | — | Rank by change; close the loop; gap analysis | The league table (`rank`), the gap list, and the meeting packs. |

## 4. The Claude API, read for this build

From the claude-api skill (cached 3 Nov 2026) and `src/lib/ai/claude.ts`:

- Model: **Claude Haiku 5.5** (`claude-haiku-5-5`), the owner's choice. US$0.10 / 0.50 a million tokens in / out (US$0.01 cache read). Thinking can be turned off with `disabled` at effort high or below; the map's plan needs no thinking (the server computes everything), so effort `low`, thinking off.
- **Structured outputs** (`output_config.format`) take at most 16 union fields and 24 optional ones. So the map's flat plan goes out in a "sentinel" form: every field required, "" / -1 / [] / "" for none, read back to nulls before the plan check. Zero unions, zero optional fields.
- **Prompt caching:** the minimum cacheable prefix on Haiku 5.5 is 512 tokens; the map's fixed prompt (layers, kinds, categories with labels, departments, zones, examples) is about 2,700 tokens and byte-stable per world, so it goes as the cached system block. The question, the places it names and the rules' hint are the only per-call text.
- **Refusals:** Haiku 5.5 has no server-side fallback; a refusal or an error makes the gateway try the next provider, then the chips.
- **PDF input:** a `document` block with base64 PDF; used only when an officer uploads a PDF list.

## 5. What this build does, ranked

1. **Ask the Map's own AI order** (`AI_MAP_PROVIDER`, default Claude, Nova Lite, Groq, Gemini), independent of `AI_FORCE_PROVIDER`; Claude Haiku 5.5 with structured outputs and the cached prompt. Jarvis and the other console steps are untouched.
2. **Collector layers**: 14 OpenStreetMap layers (Overpass, the same box, ODbL, as of 20 Nov 2026), in the plan schema, the words (English, Tamil, Tanglish), the Layers menu, the legend and the AI's prompt. Partial layers say so in every answer and on the map.
3. **Rank areas by change**: a new `rank` step over the existing `change` step; the league table, map bubbles for rises and falls.
4. **Gap questions**: `farthest` per neighbourhood as well as per ward; a Gaps button; a list to print or download.
5. **Rule-distance checks**: `within` of places from places; the distance is the officer's setting; the answer says the legal distance is the Excise desk's to confirm.
6. **Load your own list**: CSV, Excel, PDF (Claude Haiku 5.5 reads a PDF); reviewed and approved before it shows.
7. **Meeting packs**: weekly review, quarterly bank meeting, pre-monsoon meeting; one printable page.
8. **Polish**: legends, loading and error states, Tamil, keyboard (league rows are focusable, tools are buttons with aria-expanded), phone width.

Not built (and why): MapLibre and 3D (no need yet, high cost); Sonnet 5.5 escalation on a failed plan check (the owner chose Haiku; left as a setting to add); close-the-loop tracking and the ISRO flood layer (Phase 3, outside access needed).

## 6. Data facts found while building

- **Ration shops by name: OpenStreetMap holds 18 in the box (14 in the district), not 162.** The Overpass name search for "ration" also matches "Corpo*ration*" and "Refrige*ration*" (Overpass regex has no word boundary); the plan doc's 162 came from the same match. The layer now keeps whole-word names only. Ask the Map says "OpenStreetMap, 18 ration shops, not the full list; Civil Supplies (TNPDS) holds the full one".
- Counts on 20 Nov 2026 (in the box / in the district): banks 482 / 389, ATMs 412 / 329, places of worship 991 / 803, parks and playgrounds 616 / 508, water tanks 154 / 114, public toilets 138 / 125, bus stations 102 / 78, government offices, courts and town halls 179 / 145, pharmacies 292 / 236, fuel 230 / 169, markets 39 / 36, cemeteries and crematoriums 97 / 79, wine shops, bars and pubs 73 / 62 (31 wine shops).
- `shop=alcohol` in OSM includes some non-TASMAC shops and some mistagged ones; the rule check's note asks the Excise desk to confirm each place on the ground.

Sources: the plan doc (claude.ai artifact TV2FjayGhMAddiMM1gcTD1); npm registry pages for each package above; [Penn State GIScience, LLM-Find](https://giscience.psu.edu/llm-find-an-autonomous-gis-agent-framework-for-geospatial-data-retrieval); [GeoBenchX paper](https://arxiv.org/html/2503.18129v2); [Development Seed, Language interfaces for maps](https://developmentseed.org/blog/2025-01-29-llms/); [Leaflet plugins](https://leafletjs.com/plugins); [Turf docs](https://turfjs.org/docs/api/nearestPoint); Overpass API (overpass-api.de), 20 Nov 2026.
