# Thunai v2: the agent and the Stage (6-hour build prompt)

You are the engineer who turns Thunai, the District Collector's voice co-pilot, from a voice remote control into a real
agent: when the Collector asks for something, Thunai **fetches it, shows it on a purpose-built screen, and reads it out**,
the way JARVIS works for Tony Stark. Production quality: every number comes from the data, every action is safe, every
part is tested, and the owner can demo it to the FarmwiseAI panel.

Work in `D:\farm\chennai-grievance-portal-main` on a new branch `thunai/agent` cut from `thunai/pilot` (commit `45c2e3b`
or later). Commit at every checkpoint; **never push or merge**.

---

## 1. What the owner said (the problem to solve)

The current Thunai understands natural speech well (AI-first brain, 40/43 live), but it only **moves the console**:

- "Show me the 6 severe cases" → it sets the Severe filter. It does **not** display the six cases, and does not say what
  they are. The owner expects them on screen, one card each, and a spoken summary.
- "Read today's news" → it opens the news panel. It does **not** read anything. The owner expects a news-reading view
  that reads the headlines aloud, one by one, with the current one highlighted.
- In general: "if I ask for something, it should open it, show it properly and tell me, like in the Iron Man movie."
  The owner wants it agentic, deeply understanding, and top class, for this big, complex console.

## 2. What the research says (checked on GitHub on 29 Oct 2026, in Chrome)

| Source | Pattern | Use it for |
|---|---|---|
| [openai/openai-realtime-agents](https://github.com/openai/openai-realtime-agents), "Chat-Supervisor" | A fast voice layer replies at once ("let me check that"); a smarter text model runs the tool calls and writes the real answer; the voice layer speaks it | **Two lanes.** Instant acknowledgement + earcon, then the agent's grounded answer |
| [CarverXx/jarvis-v3](https://github.com/CarverXx/jarvis-v3), "dual brain" | Fast conversational LLM decides when to escalate to a tool-running agent; a heartbeat tone while the agent works; the result is rephrased into a 2-sentence spoken reply; a follow-up-listen state after answering | Heartbeat earcon while working; short spoken summaries; listen for a follow-up after a Stage opens |
| [a2ui-project/a2ui](https://github.com/a2ui-project/a2ui) (Google, A2UI v0.9) | The agent sends **declarative JSON naming components from a trusted catalog** plus a data model; the client renders its own components; flat list with ids, incrementally updatable; "safe like data, expressive like code" | **The Stage catalog.** The model chooses components and data references; it never writes UI code or numbers |
| [tambo-ai/tambo](https://github.com/tambo-ai/tambo) | Components registered with zod schemas become tools; "interactable" components persist and update as the user refines ("only Adyar ones", "sort by complaints") | Stage components are zod-described; the open Stage is part of the agent's context and can be refined by voice. (Tambo Cloud shuts down 31 Oct 2026: use the pattern, not the library.) |
| CopilotKit, WebMCP, Playwright snapshots, Apple Voice Control | (already used in v1; see `docs/thunai/REFERENCES.md`) | Keep |

Add each of these to `docs/thunai/REFERENCES.md` with what was used. Do not add npm dependencies for them.

## 3. Verified facts about this codebase (read the code before relying on any detail)

- **Thunai v1** (branch `thunai/pilot`): `src/lib/thunai/` (plan.ts = AI-first planner with a closed step schema and the
  checker; brain.ts = one structured call; understand.ts = rules, now the offline backup; risk.ts; say.ts; store.ts memory;
  audit.ts), `src/components/collector/app/thunai/Thunai.tsx` (orb, dock, chips, undo, tray, memory/trail/help panels,
  missions, Watch; `handle()` sends every sentence to the brain; `isReflex` controls stay local), `dom.ts`, `thunai.css`.
  Routes: `src/app/api/collector/thunai/{plan,world,memory,audit}`, dev-only `src/app/api/dev/thunai/plan` and
  `src/app/dev/thunai` (stand-in console, 404 in production). Read `docs/thunai/REPORT.md` first.
- **Ask District IQ already has an agent and 31 data tools**: `src/lib/assistant/tools.ts` (`TOOLS`, `runTool(name, args)`,
  `listTools`): overview_kpis, zones, zone_profile, departments, severity, verification_queue, resolution_times,
  dept_backlog, incidents, search_records, incident_detail, incident_story, search, briefing, dept_followups, news_gaps,
  category_trends, taluks, hotspots, category_summary, change_drivers, place_breakdown, unusual_rises,
  developing_stories, contacts, environment, mandi_prices, source_health, resolve_place, incident_series, map_geo.
  `src/lib/assistant/agent.ts` (AI_CHAT_MODE=agent) runs tool rounds; the composer and its **number verifier** write the
  answer; `cards.ts` / `answer.ts` define answer cards and charts. **Reuse these. Do not write a second data layer.**
  Check how the chat route passes the Collector's scope and session into the tools, and how tool results carry `facts`.
- **The console's own data is already in the browser**: `host.ov` (the Overview: `severity.rows` and `severity.counts`,
  `allNews` (newest 250) and `allNewsTotal`, `stories`, `zoneTable`, and more; see `Overview` in `src/lib/collector/intel.ts`)
  and `host.ins` (insights, environment readings). Prefer the tools on the server for answers; use `host.ov` where the
  Stage must match exactly what the console shows (for example "these 6 severe cases" = the console's own list).
- **Other endpoints**: `/api/collector/list` (filtered, paged incident list: period, zone, dept, sev, cat, taluk, place,
  status, q, sort), `/api/collector/news?ids=` and `news/article`, `stories`, `insights`, `brief`, `search`, `nearby`,
  `incidents/[id]` and `incidents/[id]/action` (Take action draft; POST sends under EMAIL_MODE).
- **AI**: `ai@7.0.122` (has `generateText` with tools and `stopWhen`/`stepCountIs`), `@ai-sdk/groq`, the gateway
  `src/lib/ai/gateway.ts` (`generateJson`, providers, pools, per-minute limits, 2 Groq keys present). Thunai's brain uses
  `THUNAI_PROVIDER` (default groq → gpt-oss-120b first; `bedrock` = Nova Lite when the owner pastes a fresh AWS key).
  Groq free tier: about 8,000 tokens a minute per model per key; a v1 call is about 4,000 tokens. **Token budget is a
  design constraint**: send tool lists compactly, cache the static prompt, cap rounds.
- **Speech**: `src/components/collector/app/assistant/speech.ts` (`speak(text, lang, onEnd, rate)`, `listen`,
  `stopSpeaking`); Web Speech API; en-IN and ta-IN.
- Tests: vitest (node env, `src/**/*.test.ts`), live config `vitest.live.config.ts` (`*.live.ts`; Thunai's is
  `src/lib/thunai/brain.live.ts`, run with LIVE_GAP_MS=7000). Before this build: 1,396 passed, 13 skipped; tsc clean;
  production build succeeds with `NODE_OPTIONS=--max-old-space-size=8192` and a separate `NEXT_DIST_DIR`.

## 4. What to build

### 4.1 The agent (server): look, then act, then tell
A new route `POST /api/collector/thunai/agent` (collector session, rate-limited), and a pure, unit-testable core in
`src/lib/thunai/agent.ts` with the model call, the tools and the data injected (so tests use fakes, like
`assistant/agent.ts`).

- Input: the sentence, the screen state, the last turns, **the open Stage** (its kind and item ids), notes and habits.
- The model may do up to **3 tool rounds**: call the assistant's data tools (an allow-listed subset that fits the token
  budget, picked by relevance if needed), read results, decide. Then it returns one **final plan**:
  - `ui`: console steps (the v1 Step union, checked by the v1 checker: page, view, period, panel, item, map, layers…);
  - `stage`: a Stage document (section 4.2) built from **references to tool results** (row ids, result keys), never from
    figures the model typed;
  - `say`: the spoken summary (1–3 short sentences, the Collector's language). Every figure in it must appear in the tool
    results (reuse or mirror the composer's number verifier); otherwise drop it and speak a template line;
  - `kind`: do | clarify | chat | refuse (as in v1).
- **Two lanes** (Chat-Supervisor): the client shows "Checking the severe cases…" and plays a soft heartbeat earcon the
  moment the request leaves; simple steering ("Zone 7", "weekly") may still use the v1 one-shot planner when it is
  enough (decide by a cheap rule or the v1 plan's kind). Instant controls stay local.
- Hard limits: 3 rounds, a total deadline (about 8 s), then answer with what was gathered. On failure: v1 planner, then
  the rules, and the dock says which answered.
- Security as in v1: the request is data, not instructions; the model cannot send, delete, or call anything outside the
  allow-list; tool arguments are validated by the tools' own schemas; no citizen phone numbers or personal text in the
  spoken line.

### 4.2 The Stage (client): the JARVIS screen
A full-screen overlay (portal on `document.body`, Esc / "close" / orb closes it, the console stays underneath; focus
trap; works at 375 px; dark "glass" look that matches `thunai.css`; reduced-motion respected). It renders a **closed
catalog** of components, each with a zod schema in `src/lib/thunai/stage.ts`; the client renders only these:

| Component | Shows | Voice while open |
|---|---|---|
| `CaseList` | N incident cards: severity colour, title, zone, place, age, complaints, status, department; numbered | "open 3", "next", "read them", "only Adyar ones", "sort by complaints", "draft action for 2" |
| `CaseDetail` | one incident: what, where, since when, complaints, department, timeline, linked news, map thumbnail if available | "draft action", "show on map", "who handles this" |
| `NewsReader` | headline cards (source, time, place, linked incident); reads them aloud one by one, highlighting the one being read (karaoke style) | "next", "stop", "again", "read the full article", "open the incident" |
| `Readings` | rain / AQI / reservoir gauges with level, capacity %, time of reading, trend sparkline | "which is highest", "compare with last week" |
| `Compare` | two or more zones/departments side by side (bars + table) | "add Perungudi", "only severe" |
| `Chart` | a chart from a tool result (reuse the assistant's chart spec and ECharts setup) | "explain this" |
| `Brief` | the morning brief as numbered points; read aloud with highlight | "next", "skip", "more on 2" |
| `Answer` | a short written answer with the facts it used (cited rows) | "show me those" |
| `Drafts` | the approval tray, large, one card per draft; same "confirm N" rule | "confirm 3" |

- The Stage is **interactable** (Tambo pattern): its kind and item ids go back to the agent with the next sentence, so
  refinements act on what is shown. A refinement that only filters or sorts what is already shown is done locally.
- Narration: `speak()` item by item with highlight; barge-in by Esc, the orb, or saying "stop"; hands-free returns to
  listening after the Stage is read (jarvis-v3's follow-up listen). Tamil reading uses ta-IN; titles keep their own
  language.
- Every number on the Stage is rendered from tool data by code. The model only chooses components, item ids, order and
  emphasis.

### 4.2b Insight screens: Thunai builds a dashboard on demand (the owner's top wish)
"Top 3 areas with the most rainfall", "compare Adyar and Ambattur", "how has dengue moved this quarter", "map the
severe cases": Thunai composes a **new screen** for the question, the way Data Studio builds visualisations, high-end
and alive (animated entrance, live highlights while it speaks, every element clickable and speakable).

- The Stage document is a **layout of 1–6 blocks** (A2UI: a flat list with ids and a grid layout hint), each block one
  catalog component bound to a tool result. Add to the catalog:
  - `Ranking`: top / bottom N (bars with values, rank badges, the time of the data) + the same items highlighted on a map;
  - `MapView`: zones / wards / taluks shaded by a measure, or points (stations, incidents, hotspots), with the items
    being talked about pulsing. Geometry from the `map_geo` tool; reuse `StudioMap.tsx` or the console's map, never a
    new map library;
  - `Compare` (upgraded to a full comparison board): KPI tiles per area (incidents, severe, open, complaints, median
    resolution), side-by-side bars by category, trend lines over the period, both areas outlined on the map, and a
    spoken "what differs most" computed by code (largest relative gaps), not by the model;
  - `Trend`: a measure over time with the unusual points marked (`incident_series`, `category_trends`, `unusual_rises`);
  - `Kpis`: 2–6 big-number tiles with change vs the previous period.
- **Reuse the existing visual parts**: `components/collector/app/studio/StudioChart.tsx`, `StudioMap.tsx`,
  `lib/studio/spec.ts` and `chartlint.ts` (chart specs and checks), `assistant/ChartRenderer.tsx` / `Figure.tsx`. Read them
  first and extend; do not add a second chart or map stack.
- Data comes from the tools: `environment` (latest reading per station: rainfall_24h_mm, aqi, lake_pct_full… with 28-day
  mean and z-score), `place_breakdown`, `zone_profile`, `zones`, `hotspots`, `category_trends`, `incident_series`,
  `change_drivers`, `resolve_place`, `map_geo`. When a question needs a ranking the tool does not give directly (top 3
  zones by rainfall from station readings), **code** aggregates the tool rows (for example the max or mean of the
  stations in each zone, saying which) and labels the method on screen. The model never computes numbers.
- The screen can be refined by voice ("add Perungudi", "make it monthly", "only severe", "show it as a map"), and saved
  as a console workspace on request (level B, one tap).
- Design bar: the console's own fonts and colour tokens, dark glass panels, a clear title that restates the question,
  a one-line takeaway at the top ("Adyar had 2× the severe incidents of Ambattur this week"), sources and "as of" time
  at the bottom, no empty or broken charts (if a block has no data it says so in words), responsive to 375 px.

### 4.2c Operate AND show: Thunai acts on the page it builds (the owner, 29 Oct)
The owner: "based on my query it should operate, not only visualise; it can take action on that page; building screens
for me; very fast and neat; department-wise performance, every insight; not random insights."

- Every answer is **an operation plus a screen**: Thunai sets the console (filters, page, map, panels) so the console
  agrees with the Stage, then builds the screen, then speaks. Closing the Stage leaves the console showing the same scope.
- **Actions from the Stage**, by voice or click, all through the existing console actions and the v1 risk levels:
  open an incident, open Take action, draft for one or several rows (into the approval tray), assign/mark for review
  where the console already has that action (find it; never invent a new write path), save the screen as a workspace,
  export (the console's own Export), pin, "show this on the main map", "open the department's backlog". Anything that
  leaves the console still needs "confirm N".
- **Insight quality, not random insights**: each screen answers the question asked, leads with the one takeaway that
  matters (largest gap, worst performer, sharpest change), and shows only blocks that support it. Insights are computed
  by code from tool results with explicit rules (rank, gap vs median, change vs previous period, z-score from the
  `environment` tool, share of total), each labelled with its method; the model picks which ones to show and words the
  takeaway, and the spoken-figure check applies.
- **Department performance screen** (scenario 18): "department-wise performance" / "which department is slowest" →
  Kpis (open, overdue, median resolution time, verified share), a Ranking of departments (worst first, with the
  console's own measures from `departments`, `dept_backlog`, `resolution_times`, `dept_followups`), a Trend of backlog,
  a heat strip of department × category, and actions on each row ("open its backlog", "draft a follow-up to the
  head" → tray). Also "zone-wise performance" with the same layout.

### 4.2d The generated-studio spec the owner pasted (all of it is in scope)
- A **command bar** on the Stage (and Thunai's bar): typed or spoken questions; each answer opens **a new full screen**
  (not a text reply) with an insight map, charts, a ranked table, key numbers and a short written summary.
- "Top 3 areas with rainfall" → ranked view, map highlighting those areas, bar and trend charts, key numbers.
- "Compare A vs B" → side-by-side matching metrics, differences highlighted, a radar or grouped chart, a one-line
  verdict.
- **Follow-ups refine the current screen** ("now show last year", "add temperature"); when the data cannot do it (for
  example no history before the dataset starts), say so plainly on the screen.
- **Filters** on every screen: date range (the console's periods plus custom where the tools support it), region
  (zone/taluk/ward/place), metric.
- **Interactive visuals**: hover details, click to drill down (zone → wards → incidents), zoom and pan on the map.
- **Switch any block** between chart, table and map views (where the data has places).
- **Save, pin and export** screens: save = console workspace (level B), pin = keep in a "Pinned screens" strip on the
  Stage (per Collector, in Thunai's memory file), export = PNG of the screen and CSV of its data (client-side, no new
  service).
- **Design**: premium, distinctive, not a template; light and dark themes; smooth transitions between screens
  (shared-element style: the block you asked about grows into the new screen); clean typography (the console's fonts,
  Noto Sans Tamil); **colourblind-safe palettes** (check categorical and sequential colours with the `dataviz` skill's
  validator); fast and responsive on phone and desktop; prefers-reduced-motion honoured.
- **Quality**: every number from the real data, no invented values; unclear questions get one short clarifying question
  with buttons.

### 4.2e How to work (use everything available)
- Model: Opus 5.5 at high effort for the main session.
- **Skills** (load before the work they cover): `dataviz` before any chart, palette or KPI tile; `design-taste-frontend`
  and `redesign-existing-projects` before designing the Stage and insight screens; `web-design-guidelines` to review the
  finished UI (accessibility, focus, contrast, motion); `run` / the browser pane to verify. Record what each skill
  changed in AGENT_PROGRESS.md.
- **Subagents in parallel** where the parts do not touch the same files: one reads and maps the assistant tools'
  result shapes into the Stage bindings; one writes the 40 + 20 live cases before any tuning; one reviews the finished
  UI against the design bar and the guidelines; one runs a `/code-review`-style correctness pass on the agent core. You
  stay the integrator; check every subagent's output before using it.
- Look at 2–3 more real projects on GitHub for generative dashboards / agentic UIs (for example Vercel's generative UI
  examples, CopilotKit's AG-UI demos) through the browser, take patterns only, list them in REFERENCES.md.

### 4.2f Ask the Map inside Thunai (all in one)
The owner: "that school idea, Ask the Map, it should all be done in this Jarvis, all in one."
- Questions about places and distances ("schools within 1 km of the flooding", "hospitals near this incident", "which
  wards around Velachery have waterlogging", "shelters near the severe cases") are answered **inside the Stage**: a
  `MapView` with the results (numbered pins matching a ranked table), the distance rule on screen, and actions on each
  result. Today Thunai only forwards these to the console's Ask the Map (`c.askOnMap`); find how Ask the Map answers
  (the conversational map on the Collector console, commit 030fdbf and 9a20b92, `/api/collector/nearby`, `geo`) and
  call the same server logic from the agent as a tool. Do not build a second spatial engine.
- Scenario 19: "schools within 1 km of flooding in Adyar" → MapView + ranked table of schools with distance, spoken
  count and nearest; "draft an alert to the nearest three" → drafts into the tray (confirm N to send, sandbox only).

### 4.3 The scenarios that must work (golden list: unit tests with fakes, live tests, and browser proof)
1. "Show me the 6 severe cases" / "severe cases kaatu" / "கடுமையான சம்பவங்களைக் காட்டு" → Severe filter set **and**
   `CaseList` with exactly the console's severe rows (6 if it shows 6), spoken: how many, the worst one, where.
2. "Read today's news" / "இன்றைய செய்திகளைப் படி" → `NewsReader` with today's headlines, read aloud one by one.
3. "What's in the news about flooding in Velachery" → filtered `NewsReader`.
4. "How full is Chembarambakkam?" / "all the reservoirs" → `Readings`, level spoken from data with its time.
5. "Compare Adyar and Ambattur this week" → `Compare`.
6. "Why is Perungudi so bad lately?" → change_drivers / unusual_rises → `Answer` + `Chart`, spoken reasons.
7. "Open the third one" (Stage open) → `CaseDetail` of row 3; "draft action for this" → draft in the tray.
8. "Brief me" → `Brief`, read aloud with highlight.
9. "Only the ones in Adyar" / "sort by complaints" with a Stage open → refined locally.
10. "Which department is slowest?" → `Chart` of resolution times + spoken top 3.
11. "Prepare for heavy rain" → the v1 mission, now ending on a Stage (readings, flooding cases, drafts).
12. Small talk, refusals, clarifications, "go back", "stop" → as in v1.
13. "Top 3 areas with the most rainfall" / "எங்கே அதிக மழை?" → a screen with `Ranking` + `MapView` (+ `Kpis`), the method
    labelled, the top area spoken with its reading and time.
14. "Compare Adyar and Ambattur" / "Adyar vs Ambattur this month" → the `Compare` board; "add Perungudi" adds a column.
15. "How has dengue moved this quarter?" → `Trend` with unusual points + `Ranking` of zones; spoken peak and change.
16. "Map the severe cases" / "show hotspots on a map" → `MapView` with points, numbered to match a `CaseList`.
17. "Make me a flooding dashboard for this week" → a 4–6 block screen (Kpis, MapView, Ranking, Trend, CaseList).
18. "Department-wise performance" / "which department is slowest" / "zone-wise performance" → the performance screen
    (4.2c), with row actions.
19. "Schools within 1 km of flooding in Adyar" → Ask the Map inside the Stage (4.2f).
20. Any screen: "show it as a table", "switch to map", "pin this", "export this", "save as Monsoon watch".
Write at least 40 agent cases (English, Tamil, Tanglish) for the live test, written **before** tuning, and keep a
separate unseen set of 20 written after; report both scores honestly.

## 5. Build order (about 8 hours; commit at each checkpoint; keep going until done)
Between steps 3 and 4 below, add **Insight screens** (about 75 min): the layout renderer, Ranking, MapView, Compare,
Trend, Kpis, the code-side aggregations and their unit tests, and scenarios 13–20 in the fakes and the live set; then the
operate-and-act layer (4.2c), the studio features (4.2d: command bar, filters, view switch, drill-down, pin, export) and
Ask the Map inside the Stage (4.2f), about 2 hours more.

1. **Read** (20 min): REPORT.md, plan.ts, Thunai.tsx, assistant/agent.ts, tools.ts, the chat route, cards.ts. Write
   `docs/thunai/AGENT_PROGRESS.md` with decisions as you go.
2. **Stage catalog + renderer** (75 min): `stage.ts` schemas, `Stage.tsx`, CaseList and NewsReader first, wired to
   `host.ov` with no AI, behind a dev button on `/dev/thunai` (add realistic made-up severe rows and news there).
   Unit-test the schema checks. Checkpoint commit.
3. **Agent core** (90 min): `agent.ts` with injected model/tools, the token-budgeted tool list, rounds, the final plan,
   the checker (v1 steps + Stage references + spoken-figure check). Unit tests with fakes for every scenario in 4.3.
   Checkpoint commit.
4. **Route + client wiring** (60 min): the agent route, the two lanes, heartbeat earcon, Stage from the plan, narration
   with highlight and barge-in, Stage context in the next request, local refinements. Dev route twin for `/dev/thunai`.
   Checkpoint commit.
5. **Live** (45 min): `agent.live.ts` with the 40 cases (paced for Groq), fix generic problems (not phrase hacks), then
   the 20 unseen. Record both scores, p50/p90 latency, tokens per call, and which model answered.
6. **Browser proof** (40 min): on `/dev/thunai` with real model calls: scenarios 1, 2, 4, 7, 8, 9, 13, 14, 17, 18, 19, 20 in English and Tamil;
   phone width; dark/light; reduced motion; no console errors. Screenshots in `docs/thunai/evidence/`.
7. **Finish** (30 min): full vitest, tsc, production build, `docs/thunai/AGENT_REPORT.md` (what, numbers, not verified,
   2-minute demo script), update REFERENCES.md. Final commit.
If time runs short, cut in this order: Tamil narration polish, local refinements, Trend, Chart (keep Ranking, MapView,
Compare, CaseList, NewsReader: those are the owner's must-haves). Never cut tests, the
number check, or the safety gates.

## 6. Rules that do not change
- Never read, print, edit or commit `.env*` or keys; never set AWS_STORE_SAVE; no git push or merge.
- No real email or SMS: dev servers use SMTP_HOST=127.0.0.1, SMTP_PORT=1; nothing is sent without "confirm" plus the count.
- Do not sign in to the console with the Collector's credentials; never use `officer-accounts.local.csv`; the Task 6
  PDF credentials are confidential. The owner signs in himself for the real-console check.
- No paid services or Anthropic keys in the product. Ask District IQ's chat stays Groq-only (AI_CHAT_PROVIDER=groq);
  Thunai's brain follows THUNAI_PROVIDER.
- Do not integrate the FarmwiseAI reference systems. Never delete `data/studio` or `data/datasets`.
- Tests are sacred: never weaken or delete one to pass; never tune on the unseen set.
- Every number spoken or shown comes from data through code. If something was not verified, say so in the report.

## 7. Done means
- The 20 scenarios work in the browser with real model calls; evidence saved.
- Live agent score and unseen score reported, with latency and tokens.
- All tests pass, tsc clean, production build succeeds, everything committed on `thunai/agent`, nothing pushed.
- AGENT_REPORT.md tells the owner, in plain words, what to try first on the real console.
