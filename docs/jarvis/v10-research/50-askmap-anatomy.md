# Ask the Map by voice: how each feature works today, and how Jarvis can drive it

Read-only survey of the worktree `E:\farm\.claude\worktrees\jarvis-v10-49ea0b` (branch `claude/jarvis-v10-49ea0b`), 19 Nov 2026.
Paths are relative to `chennai-grievance-portal-main/` unless given in full; line numbers are as of this tree. No repo file was
changed, nothing was run against the app, no network call was made.

---

## 0. In one page

**The finding that decides the design:** Jarvis already holds Ask the Map's whole state object. `CollectorApp` builds the Console
`c` with `mapAsk` (the `useMapAsk` instance) and `askOnMap` (CollectorApp.tsx:678-688) and hands `c` to Jarvis in `thunaiHost`
(CollectorApp.tsx:743-744; `ThunaiHost.c: Console`, Thunai.tsx:95-96; `hostRef.current = host` on every render, Thunai.tsx:218-219).
So `hostRef.current.c.mapAsk.ask / run / draw / replay / restore / setRoute / setSpot / setTraceOpen / clear / setGrown` and the
fields `resp / plan / turns / cue / route / busy` are callable from Jarvis today with no bridge. The pure helpers next to them are
client-safe and exported: `applyChip` (lib/map/chips.ts:113), `cameraFor` (lib/map/camera.ts:80), `visitOrder`,
`googleMapsLink`, `downloadAnswer`, `saveView` (askmap/actions.ts), `answerGist` (useMapAsk.ts:113), `rehearsalIntent`
(lib/rehearsal/intent.ts:41).

What is **not** reachable is state kept inside components: the Layers menu, heat and base map (`useMapChrome`, local to the
Overview's `Page1`, Overview.tsx:101), the Export sheet and Send dialog flags (AskOverlay.tsx:39-40), the suggestions tray and the
chip drawer (AskMapPanel.tsx:78-80), and Rain & flooding's tabs and selection (RainView.tsx:48-54).

**Recommended bridge (least new code):**
1. Core features: no bridge. One new Jarvis step `{ a: "mapdo", op, ... }` whose executor (a small client module, e.g.
   `thunai/mapops.ts`) calls `c.mapAsk` and the exported helpers directly, awaits the `AskResponse` and speaks
   `answerGist(resp)` with the response's own numbers as the number gate's allowed set.
2. One window event for the UI-local state, named like the console's existing ones (`diq:rehearsal`, `diq:studio-spot`):
   `diq:map-cmd` with `{ op, args, reply }`. Listeners added to `useMapChrome` (layer, heat, base), `AskOverlay` (export sheet,
   send dialog with a department), optionally `AskMapPanel` (tray, chips drawer) and `RainView` (tab, rain, zone). Listeners run
   synchronously inside `dispatchEvent`, so `reply` being called or not tells Jarvis at once whether the owner is mounted.
3. Publish a small map snapshot into Jarvis's `ScreenState` (buildState, Thunai.tsx:462-474) so rules and model know the
   preconditions (an answer on the map, its chips, shot count, layers on, Rain open).
4. Rain & flooding needs nothing new to open: `c.openRain()` or the existing `diq:rehearsal` event.

| # | Feature | Voice trigger with the least new code | Precondition | Jarvis level / risk |
|---|---|---|---|---|
| 1 | Ask a question | existing `{a:"map",q}` -> `c.askOnMap(q)`; better `await c.mapAsk.ask(q)` and speak `answerGist` | none (grows the map, goes to Overview, closes Rain) | A, low |
| 2 | Follow-ups and chips | text: `c.mapAsk.ask(text)` (server rules edit `prev`); chips: `c.mapAsk.run(applyChip(resp.plan, id, option))` | an answer with a plan on the map | A, low (routing risk) |
| 3 | Circle by voice | `c.mapAsk.ask("what is happening within 2 km of Kasimedu")` (same brief and circle as the tool); digits, not number words | place resolves; radius 10-5,000 m | A, low |
| 4 | Layers; shots | layers: new `diq:map-cmd` listener in `useMapChrome`; shots: `c.mapAsk.replay(i)` with `cue.index` and `resp.shots.length` | Overview mounted (layers); an answer or brief (shots) | A, low |
| 5 | Export CSV / GeoJSON | `downloadAnswer(resp, "csv"|"geojson", q)` | answer with plan and total > 0; password box | B, medium |
| 6 | Save the view | `saveView(resp, "collector", q)` (not Jarvis's `workspace` step, which saves the dashboard) | answer with plan | B, low |
| 7 | Visit order + Google Maps link | `c.mapAsk.setRoute(visitOrder(resp, null))`; link stays a click | an open, exactly placed row | A, low |
| 8 | AI analyst's insight | `POST /api/map/insight {plan}`; show and speak in Jarvis's own card (no panel UI exists) | answer with total > 0; AI up | read, low-medium |
| 9 | Send to department | `c.mapAsk.ask("send these to SWD")` (server ui cue opens the drafts) or `diq:map-cmd send {dept}` | Collector, answer with open cases, map grown | C (drafts only), high |
| 10 | Suggested questions | read `resp.followups` or `GET /api/map/suggest`; ask one with `c.mapAsk.ask(q)` | none | A / read, low |
| 11 | Rain & flooding | `c.openRain()`; a rain or tab: `diq:rehearsal` with `rehearsalIntent(text)`; close `c.rainView.close()` | Collector console | A to open, low (its sends never by voice) |

---

## 1. The pieces

### 1.1 Where it lives

```
CollectorApp.tsx
  useMapAsk(...)                                   :335-337   one conversation per tab
  Console c: mapAsk, askOnMap, openRain, rainView   :675-688
  thunaiHost { c, ... }                             :743-762  -> <Thunai host> :962
  <RainBand hidden>  (listens for "diq:rehearsal")  :861
  page === "overview" ? <Page1>                     :915
Overview.tsx Page1                                  :99
  useMapChrome(c.mapAsk)        layers/heat/base/circle tool   :101
  <SatMap ask grown extraTools overlays drawCircle heat rain>   :148-156
  rv ? <RainView> : <AskOverlay role="collector" beside=<RainPill>>  :157-163
AskOverlay.tsx      pill | panel + legend + layers menu + export sheet + SendDialog + VisitCard
AskMapPanel.tsx     Ask box, chat turns, chips, answer card, actions, Ask next, tour, trace, list, area brief
SatMap.tsx + askmap/answerLayers.ts   draws the answer and plays the camera
```

The officer's Board has its own instance (`components/officer/Board.tsx:101`, `AskOverlay role="officer"` at :130). Jarvis is on
the Collector's console only.

### 1.2 useMapAsk's state shape and actions (useMapAsk.ts:21-67)

| Field / action | What it is | Set by |
|---|---|---|
| `grown`, `setGrown` | the map card fills the page; the panel exists only while grown | pill (AskOverlay.tsx:51), Back (AskMapPanel.tsx:160), Escape (CollectorApp.tsx:708), `askOnMap` |
| `busy`, `error` | a question is in flight; last failure | `post` (useMapAsk.ts:166-222) |
| `resp: AskResponse \| null` | the answer on the map | `post`, `restore` |
| `plan: Plan \| null` | the plan follow-ups edit; set only by an `answer` with a plan (:209); kept in sessionStorage `diq-map-plan` | `post`, `restore` |
| `history: string[]` | typed questions, newest last (Ask box ↑), sessionStorage `diq-map-history`, 30 max | `ask` (:253) |
| `turns: Turn[]` | the chat: `{id, q, resp, pending, error, note, plan, req, gist}` (:73-85), 12 max, kept without rows in `diq-map-turns` | `post`, `ask` |
| `restore(id)`, `retry(id)` | show an earlier answer again (asks again if kept without rows); ask a failed turn again | folded turn, Try again |
| `cue: {seq, index, move}`, `replay(index = 0)` | the camera cue; a new `seq` makes the map play `shots[index]` | `post` (:213), `restore` (:244), `replay` (:249) |
| `tookOver`, `setTookOver` | the user's hand stopped the camera | SatMap (:229-237) |
| `spot`, `setSpot` | ids the panel points at; the list and pins narrow to them | tiles, trace steps, clusters, brief counts |
| `hover`, `setHover`, `onHover` | the row under the mouse (subscription, not React state) | list rows |
| `focus`, `setFocus` | the chosen row or pin: fly to zoom 16 and ring it | row click, pin click |
| `showBefore`, `setShowBefore` | Before · Now of a change answer | Extras |
| `traceOpen`, `setTraceOpen` | "How this was worked out" open | Trace, ui `open_trace` |
| `ask(text)` | a question or follow-up (:250-263) | Ask box, chips of a `say`, Ask next, tray, `askOnMap` |
| `run(plan, label?)` | a plan as is: chip edit, saved view, Ask District IQ's plan (:264) | chips, `openSavedWorkspace`, `askOnMap({plan})` |
| `draw(circle \| ward \| incident)` | an area with no text (:265-266) | circle tool, right-click, ward click, "What else is near here?" |
| `clear()` | new chat: answer, plan, turns, spot, route gone (:224-229) | New chat (AskMapPanel.tsx:159), ui `clear` |
| `uiCue: {seq, ui, dept}` | a "ui" answer the panel acts on: send, export, visits, open_trace (:195-202) | `post` |
| `route`, `setRoute` | the visit order on the map | VisitCard, officer's Plan my visits |

### 1.3 The server routes (src/app/api/map/)

| Route | Who / guard | Request | Response |
|---|---|---|---|
| `POST /api/map/ask` (ask/route.ts) | `assistantSession` (Collector or officer); 40 a minute (:36) | `{text ≤400 \| null, plan \| null, prev \| null, context {zone 1-15, taluk TLK-XXX, incidentId, ward 1-200, drawn {lat 12.5-13.6, lon 79.9-80.6, r 50-5000}}, reword=false}` (:11-26); one of text, plan, drawn, ward, incidentId (:43) | `AskResponse`; `{error}` with 400, 429, 500 |
| `POST /api/map/export` | `assistantSession`; **`requireConfirm(..."export"...)`** (:20); audited `ask_map:export` (:24) | `{plan, question ≤400 \| null, format "csv" \| "geojson"}` (:12) | the file (`text/csv` or `application/geo+json`), `content-disposition` file name, `x-rows` (:25) |
| `POST /api/map/insight` | `assistantSession`; 20 a minute (:17); body ≤256 KB | `{plan}` (checked, :21) | `{summary, actions[{text, dept}], watch, model, dropped}` or `{none: true}` / `{none: true, reason: "ai"}` |
| `POST /api/map/send` | **`collectorSession`** (Collector only, :20) | `draft`: `{action:"draft", plan, question, dept \| null}` (:12, :32-41); `send`: `{action:"send", dept, ids, subject, body, plan}` + **`requireConfirm(..."send_email"...)`** (:23-30) | draft: `{drafts: Draft[], closed}`; send: `{note, followups, ref, ...}` |
| `GET /api/map/suggest` | `assistantSession` | none | `{items: string[≤6]}` |
| `GET /api/map/layers/{id}` | `assistantSession`; ids in TOGGLEABLE (:12), `news`, LIVE (:31) | none | `{id, kind, meta, features[{id, name, lat?, lon?, lines?, polys?, url?, sub?, value?, kind?}], unplaced?, days?}`, ETag, 10 min cache |

### 1.4 AskResponse (lib/map/ask.ts:61-114), the fields Jarvis needs

`kind: "answer" | "brief" | "say" | "ui"`, `lang`, `plan` (null for brief/say), `chips: PlanChip[]`, `edited` (what a follow-up
changed), `answer {count, headline, meaning, depts[], miss, facts[]}`, `trace: StepOut[]`, `rows` (≤200, priority order),
`total`, `features` (≤5,000 pinnable), `unplaced`, `context {points, lines, polys, areas[{key, ref, en, ta, circle}], places,
rings}`, `extra {groups, clusters, hotWards, compare, change, areas, nearest}`, `camera: CameraInput`, `shots: Shot[]`,
`insights` (always `[]` now, :318), `glance {open, overdue, severe, where, who}` (each with ids), `conditions`, `news`, `before`,
`brief`, `say {en, ta, chips}`, `followups: string[]`, `ui`, `uiDept`, `asOf`, `ai_used`, `ms`.

### 1.5 Safety rules already in code

- A plan is typed and checked before it runs (`checkPlan`, lib/map/plan.ts:114-142: schema, 8 steps, 10-5,000 m, k ≤ 20,
  ≤ 365 days, every name read must be made earlier); a refused plan never runs; plans are never pasted into SQL and no
  complainant data is read (lib/map/safety.test.ts:9-25).
- An officer's department is forced on the server whatever the plan says (ask.ts:191-192, `placeLookup` lock :133-156).
- Export and Send's approve need "Confirm it's you": the route answers 428 (or a soft 200 with a header) with a summary and a
  scope hash; `ConfirmHost` wraps `window.fetch` (components/security/Confirm.tsx:51-67), asks for the password or an emailed
  code, gets a grant bound to this account, session, action and exact scope, good once for 5 minutes
  (lib/security/stepup.ts:20-88), and repeats the request. Its own comment: "Jarvis and the voice commands go through the same
  requests, so a spoken 'send it' still needs the typed password" (Confirm.tsx:10).
- Send: Collector only; drafts are made with no writes and no AI (lib/collector/actionmail.ts:315-330); nothing is sent until
  Approve (AskOverlay.tsx:122); sandbox by default; a 24 h follow-up per case and an audit row on send (:333 on).
- Jarvis never presses send, approve, confirm, delete, remove, submit, verify, accept and their Tamil words, by number or name
  (`DANGER_BUTTON`, lib/thunai/skeleton.ts:26-27; Thunai.tsx:805-807; buttons can also carry `data-jarvis-never`), and never
  presses save or pin buttons by a spoken click (`keepsSomething`, thunai/guards.ts; Thunai.tsx:808-809).
- Jarvis's levels: A runs at once with undo, B needs a spoken yes or a tap, C is draft-to-tray only, "never" is sending,
  approving, deleting (lib/thunai/reach.ts:1-39, risk.ts:11-26).
- The Google Maps link is "Opened only by the officer's click" (askmap/actions.ts:84).
- Rain's job emails: "You read and approve each department's email before it goes" (RainView.tsx:497); `/api/rehearsal/plan`
  also uses `requireConfirm(..."send_email"...)`.
- The analyst keeps only sentences whose numbers are in its fact pack (lib/map/analyst.ts:51-55, 81-87).

---

## 2. The five questions

### (a) How Jarvis reaches Ask the Map today

There are three lanes, and only one of them reaches the console's Ask the Map panel.

1. **Rules lane (client):** `lib/thunai/understand.ts` turns a sentence with a spatial word into `{a:"map", q: heard}`:
   `SPATIAL` (within, near, nearest, around, km, metres, along, hotspot, on the map, radius, distance, closest, Tamil அருகே,
   கிலோமீட்ட, வரைபடத்தில் ...) at :174, a ward number (`WARD` :176) or ward ranking (:182), "what is this place" -> step at
   :402-405; a named place that is not a zone or taluk -> :530-537; a bare number 16-200 -> `{a:"map", q:"ward N"}` (:559-561).
   The step carries the heard words verbatim (pinned by lib/thunai/golden.test.ts:52-55, 128-129, 179-180, 235).
2. **Planner lane (server model):** the model's `map` action becomes `{a:"map", q: model text || heard}`
   (lib/thunai/plan.ts:284).
3. Both run on the client in `runStep` (Thunai.tsx:693): `case "map": c.askOnMap?.(step.q)` (:754). `askOnMap`
   (CollectorApp.tsx:679-688) does `closeAll(); setAsk(false); setPalette(false); setPage("overview"); mapAsk.setGrown(true);
   mapAsk.ask(q)`. `ask` posts `{text, prev: current plan}` (useMapAsk.ts:262), so the question is a **plain string**; the
   server's rules or AI make the plan. Nothing is awaited: Jarvis says only "Asked the map" (`describeStep`, understand.ts:678).
4. **Agent lane (server, v2 screens):** a model `map` step is turned into the `nearby` Stage screen instead of a console step
   (lib/thunai/agent.ts:588-593: "Ask the Map is inside Thunai now"). `screens.ts nearby()` (:1596-1667) calls
   `c.h.map(q)` = `lib/thunai/data.ts mapAnswer()` (:97-99) = `askMap({text: q, plan: null, prev: null, context: all null,
   reword: false})` on the server, then builds Jarvis's own screen (a MapView block with the nearest facilities numbered, a
   Ranking, a CaseList). This is the path the v10 brief means by "data.ts, askMap": stateless (no `prev`, no circle, no chips),
   and shown in Jarvis's Stage, not on the console map.

Other existing ways in: `{a:"panel", panel:"map"}` grows the map (Thunai.tsx:715); `{a:"close", all:true}` shrinks it (:725);
`{a:"zoom"}` -> `askOnMap({incidentId})` or `askOnMap("incidents in <place>")` (:747-752); a Stage "show on main map"
(:1502, :1590-1597); a mission's `focusMap` -> `askOnMap(place)` (:2024-2031); an Ask District IQ card's `show_on_map` with a
plan -> `askOnMap({plan})` (:2408); `{a:"workspace", op:"open"}` re-runs a saved map view (CollectorApp.tsx:584-593).

Jarvis's `ScreenState` (Thunai.tsx:462-474) has nothing about the map: not whether it is grown, nor whether an answer is shown.
The dev harness stubs `askOnMap` and `mapAsk: { setGrown }` (app/dev/thunai/Harness.tsx:54-55).

### (b) The camera's shots, replay and next (lib/map/camera.ts)

The server fills `resp.camera: CameraInput` (`shape`, `areas[{id, box, label}]`, `points`, `line {id, box, path}`, `focus`,
`tour[{id, lat, lon, caption_en, caption_ta}]`, `district`; camera.ts:15-28) from the plan's shape and the answer's geometry
(ask.ts:419-448), and also `resp.shots` for a nominal 940 x 594 view (:449). `cameraFor` (camera.ts:80-148) turns the input into
shots: `{kind: bounds | point | path, box, point, path, zoom, maxZoom (16 areas, 17 points), duration_ms (0.6-1.6 s by
distance), caption_en/ta, mask, outside, padTopLeft, padBottomRight, animate}` (:41-59).

| Shape | When | Shots |
|---|---|---|
| area | `inside` step, area brief | 1: the area's bounds, the rest masked |
| compare | compare step | 1: both areas |
| change | change step in an area | 1: the area, masked (Before · Now toggles pins, camera stays) |
| along | a road or river | 2: the line's bounds; then "Follow the road", a 6 s pan end to end |
| point / nearest | one place; nearest from a place | 1: the place and the facilities found, or a point at zoom 16 |
| farthest | farthest ward | 1: the ward, its far point and the facility |
| hotspot | clusters | 1 + up to 3: the top clusters; then a tour of the top 3 at zoom 15.5 (1.2 s, then 3 s each) |
| empty | nothing found | 1: the nearest miss |
| district | anything else | 1: one result as a point, else the middle 90 % of results (with "N outside"), else the area or the district |

How the map plays them: SatMap recomputes the shots with its real box and the panel's real padding (`panelPad`, :751-764) and
plays `shots[Math.min(ask.cue.index, shots.length - 1)]` whenever `cue.seq` changes and `cue.move` is true (SatMap.tsx:497-506).
`play()` (:774-820) flies to bounds (no flight if the view already fits), flies to a point centred in the free part of the map,
or pans along a path frame by frame. A wheel, drag, touch or key on the map stops it and sets `tookOver` (:229-237). The map box
keeps `data-camera` with the last shot's kind, target and bounds "for tests" (:766-771).

- **Replay:** `ask.replay(index = 0)` clears `tookOver` and issues a new cue with `move: true` (useMapAsk.ts:249). UI uses:
  "Back to the answer" in the map tools (Chrome.tsx:52) and in the tour row (AskMapPanel.tsx:436, 445); the hotspot tour
  buttons `replay(i + 1)` plus `setSpot(cluster ids)` (:437-441); "Follow the road" `replay(1)` (:445); a trace step turned off
  `replay(0)` (:471). Restoring an earlier turn replays shot 0 (useMapAsk.ts:244).
- **Next / previous:** there is no button; the current index is readable as `ask.cue.index` and the count is
  `resp.shots.length` (the same shape gives the same count on the map). Next = `replay(min(index + 1, n - 1))`; mirror the
  hotspot buttons by also calling `setSpot({ids: resp.extra.clusters[i - 1].ids, label: caption})`.
- **Follow-ups:** a small edit keeps the view: `followUpMoves(edited, sameShape)` is false for distance, severity, period,
  status, facility, group edits and for a chip that keeps the plan's shape (camera.ts:154-157; useMapAsk.ts:211, 272-281).
- Captions (`shot.caption_en/ta`, the tour's "1. 12 reports near Kodambakkam, Ward 130") are what the v10 narrated tour can
  speak, one line per stop.

### (c) The plan format, and what a follow-up edits (lib/map/plan.ts)

```
Plan  = { steps: Step[1..8], show: <a step's "as">, language: "en" | "ta" | "tanglish" }        :76-80
Step  = take     { as, layer, filter: Filter | null, where: {government, kinds} | null }        :61-73
      | within   { as, of, near: name[1..4], meters }          | inside  { as, of, area: AreaRef }
      | along    { as, of, line: <line id>, meters }           | nearest { as, from: name | "place:<ref>", to, k }
      | farthest { as, areas: ward|zone, from, beyond_m }      | count_by{ as, of, by: ward|zone|taluk|hex500 }
      | hotspot  { as, of }  | compare { as, of, a, b }  | change { as, of, now: Period, before: Period }
Filter  = { category[], family[], severity[], status: open|closed|any, dept[], overdue, citizen, news?, period, text } :34-46
Period  = last_days {days, offset} | day|week|month|quarter {offset} | range {from, to, label, said, age_hours}       :21-31
AreaRef = ward {id} | zone {id} | taluk {code} | point {ref, radius_m} | drawn {id: "lat,lon,r"}                     :49-55
```
Names match `^[a-z][a-z0-9_]*$`. Limits `LIMITS = {steps 8, minM 10, maxM 5000, k 20, days 365, features 5000}` (:19).

Example, "open flooding within 500 m of hospitals" (route.ts buildPlan :531-620):
```json
{ "steps": [
  { "op": "take", "as": "a", "layer": "incidents", "where": null,
    "filter": { "category": null, "family": ["FLOOD"], "severity": null, "status": "open", "dept": null, "overdue": null,
                "citizen": null, "period": { "kind": "last_days", "days": 7, "offset": 0 }, "text": null } },
  { "op": "take", "as": "f1", "layer": "hospitals", "filter": null, "where": { "government": null, "kinds": ["hospital", "health_centre"] } },
  { "op": "within", "as": "near", "of": "a", "near": ["f1"], "meters": 500 } ],
  "show": "near", "language": "en" }
```

A follow-up is the next turn's text with `prev` = the current plan. `rulesRoute` (route.ts:884-914) tries `editPlan` (:659-800)
then `mergeFollowUp` (:811-864) before reading it as a new question:

| Said | Rule (route.ts) | What changes | `edited` | Camera |
|---|---|---|---|---|
| "only severe", "severe only", கடுமையானவை மட்டும் | EDIT_SEVERE :628, :671 | `take.filter.severity = ["Severe"]` | severity | stays |
| "all severities" | :629, :672 | severity null | severity | stays |
| "only the ones in the news" / "any source" | :640-641, :673-674 | `filter.news` | news | moves |
| "only the overdue ones" | :643, :675 | `filter.overdue = true` | overdue | moves |
| "which department has the most?" | :644, :677 | no plan change; headline said by department (ask.ts:305-312) | depts | moves |
| "which zone has the most?" | :645, :679-690 | adds or edits `count_by` | group | stays |
| "only open", "include closed", "closed ones", "any status" | :642, :691-694 | `filter.status` | status | stays |
| "make it 500 m", "2 km", "within 1 km" | :630, :695-703 | `within/along.meters` or `inside point radius_m`, clamped | distance | stays |
| "up or down?", "compared to last week" | :704-717 | adds a `change` step (two equal windows) | change | moves |
| "last 7 days", "this month", "today" | :720-728 | `filter.period` | period | stays |
| "by ward", "zone wise" | :729-745 | adds or edits `count_by` | group | stays |
| "add hospitals" / "remove schools" | :746-781 | a facility `take` and `within.near` | facility | stays |
| "compare with Adyar" | :782-798 | adds `compare` (the current area, or the zone holding most) | compare | moves |
| "why these?" / "export" / "send these to SWD" / "plan my visits" / "start over" | :634-639, :666-670 | a `ui` answer: open_trace, export, send (with dept), visits, clear | - | - |
| "in Velachery", "and thefts?", "near schools", "hospitals there", "garbage near them" | mergeFollowUp | a rebuilt plan keeping what is not said | follow | moves |

A chip edit sends the edited plan itself (`{plan, prev}`), checked again on the server and run with no AI (`edited: "chip"`,
ask.ts:224-228). A saved view, Ask District IQ's hand-over and `restore` also send a plan.

### (d) The chips (lib/map/chips.ts)

A chip is one part of the plan: `PlanChip {id, part, en, ta, isDefault, options[{key, en, ta, on}], removable}` (:11-20). The
server builds them per answer (`planChips`, :39-100, called in ask.ts:363-367 with names and the place's other meanings from the
resolver). The panel shows the said parts as one line ("Flooding · Open · Within 500 m of hospitals", FilterLine,
AskMapPanel.tsx:354-374); "Change" opens the chips (:185-206), each with a menu and, when removable, an ×. A default the question
did not state is marked "default".

| Chip id | Part | Options (keys) | Removable | `applyChip` effect (:113-180) |
|---|---|---|---|---|
| `category` | category | none | when a category or family is set | category and family null |
| `status` | status | open, closed, any | no | `filter.status` |
| `period` | period (absent with a change step) | 1, 7, 30, 90, all | no | `filter.period` = last N days or null |
| `severity` | severity | severe, severe_high, any | no | `filter.severity` |
| `citizen`, `news`, `overdue`, `dept` | filter flags | none | yes | clears the flag |
| `d:<as>` | distance of within/along | 100, 200, 300, 500, 1000, 2000 (+ current) | no | `meters` (10-5,000, else null) |
| `r:<as>` | radius of an inside point | same | no | `area.radius_m` |
| `f:<as>` | facility | none | when 2+ facilities | drops that facility |
| `p:<as>` | place of inside/along | the place's other meanings: `zone:13`, `ward:170`, `taluk:TLK-MYL`, `point:<ref>`, a line id | no | replaces the area or the line |
| `k:<as>` | nearest k | 1, 3, 5, 10 | no | `nearest.k` |
| `g:<as>` | group | ward, zone, taluk, hex500 | yes (drops count_by) | `count_by.by` |
| `c:<as>` | compare | none | yes (drops compare) | removes the compare step |

How a chip is applied: menu item -> `chip(c, option)` or, for a place, `altChip(c, key)` (AskMapPanel.tsx:116-129, :198) ->
`applyChip(ask.plan, c.id, option)` (a deep copy; null when the edit does not fit, e.g. 9,000 m) -> `ask.run(p, label)`
(useMapAsk.ts:264) -> `POST /api/map/ask {plan, prev}` -> a new turn labelled with the option ("500 m", "Remove: Severe"). Pinned
by route.test.ts:266-275.

### (e) The place gazetteer: "Kasimedu" to coordinates

1. `data/gcc-reference/intel-reference.json` `places` (81: 55 localities, plus zones and taluks), from the news monitor. Kasimedu
   is there: `{"name": "Kasimedu", "kind": "locality", "lat": 13.123, "lon": 80.295, "zone": null, "aliases_en": ["Kasimedu"],
   "aliases_ta": ["காசிமேடு"]}`.
2. `lib/collector/nlp.ts gazetteer()` (:69-139) builds the list: those localities first, each alias as a pattern (`enRe`: whole
   words, spaces/dots/hyphens interchangeable, :56; `taRe`: a Tamil stem at a word start so case endings still match, :67), with
   the nearest ward centroid within 2 km as its ward (:88-95, :107-112); then the GCC areas table (ward centroid as the point,
   :113-123); zones (mean of ward centroids); taluks. `gazetteerEntries()` (:143) exports it.
3. `lib/map/world.ts resolverData()` (:283-367) turns it into resolver entries: locality `ref: "loc:Kasimedu"` with lat/lon;
   then OSM neighbourhoods (`osm:<id>`), named facilities (hospitals, colleges, fire, rail and metro, police, schools, with
   everyday aliases such as "Chennai Central"), "Marina" for Marina Beach (:279-281), roads and waterways (lines, weighted by
   length), lakes, and GCC street names with no line (`data/gcc-reference/streets.json`).
4. `lib/map/resolve.ts makeResolver(data)` (:84-160): ward and zone numbers in English and Tamil, every entry's patterns, GCC
   street spans, then spelling slips on single words of 5+ letters within 2 edits (:118-124). Overlapping matches group; the
   longest wins, then the kind the verb prefers (`near`: locality, OSM place, facility first; `in`: ward, zone, taluk; `along`:
   road, waterway) or the kind the next word names ("Adyar zone", "Adyar river"); up to 3 others become a place chip's options.
5. `areaFor(entry, meters)` (:164-174) gives `{kind: "point", ref: "loc:Kasimedu", radius_m: meters ?? 1000}` (a locality's
   default radius is 1 km, a facility's 500 m, `NEAR_M` :45). At run time `placeLookup` (ask.ts:133-156) finds the entry by ref
   and returns the Place `{lat: 13.123, lon: 80.295}`; membership is the straight-line distance from it.

Jarvis's own place list (`lib/thunai/world.ts` :34-41, from the same reference file) keeps only name, aliases and zone, no
coordinates. A split spelling ("Kasi Medu") does not match the one-word alias and is two words for the fuzzy step.

---

## 3. The eleven features

### 3.1 Asking a question

- **UI today.** Pill "Ask the map…" -> `setFocusBox(true); ask.setGrown(true)` (AskOverlay.tsx:51); palette "Ask the map"
  (CollectorApp.tsx:770-771); `c.askOnMap(q)` from the chatbot, the palette and an incident's "What else is near here?"
  (CollectorApp.tsx:679-688, Detail.tsx:178-179, AssistantDialog.tsx:186). In the panel: Enter or the send button -> `submit()`
  -> `ask.ask(t)` (AskMapPanel.tsx:94-103, 237); ↑ recalls history (:104-108); the panel's own mic uses the browser's speech
  recognition and submits the final words (:111-115, 236).
- **State.** `ask` adds to `history`, checks for a rain question (3.11), then `post({text, prev: planRef.current}, t)`
  (useMapAsk.ts:250-263): aborts any question in flight, `busy`, a pending Turn, then on an answer `resp`, the turn filled,
  `spot/focus/showBefore/route` reset, `plan` saved, a camera cue (:166-214).
- **API.** `POST /api/map/ask` `{text, prev, context: {zone, taluk, incidentId: null, ward: null, drawn: null}}` ->
  `askMap()` (ask.ts:186-333): rules first (`rulesRoute`), the AI only for words the rules cannot read (:246-269), checked plan,
  60 s answer cache (:287-294), executor, answer, `fill` (chips, rows ≤200, features ≤5,000, camera, shots, :341-463), glance,
  conditions, follow-ups. Each question is logged without personal data to `data/aws-cache/map-questions.jsonl` (:522-528).
- **What the user sees.** The question as a chat bubble with "Working it out…" (AskMapPanel.tsx:166-167); then the answer card:
  a big number and the headline, one sentence of meaning, tiles (still open, past deadline, severe; a click spots them), "On the
  ground now", as-of line (:378-418); Send / Export / Save (:244-253); "Ask next" (:325-335); tour or Follow the road or Before ·
  Now (:431-455); "How this was worked out" (:457-481); the case list (6, then all, :484-549). On the map the console's pins dim
  (SatMap.tsx:423-434), the area, mask, rings, corridors, facilities and clusters are drawn (answerLayers.ts:60-162), pins drop in
  by priority (:214-299), the camera flies. A brief shows the area brief (:574-606); a `say` shows a sentence and example chips.
- **Preconditions.** Collector console; it switches to the Overview, grows the map and closes Rain (CollectorApp.tsx:728). Text
  ≤ 400 characters; 40 a minute.
- **By voice.** Works today through `{a:"map", q}` -> `c.askOnMap(q)`, but nothing is said back. Least new code: in the new
  executor, `c.setPage("overview"); c.mapAsk.setGrown(true); const r = await c.mapAsk.ask(normalised(q))` and speak
  `answerGist(r, lang)` (useMapAsk.ts:113: "160 open flooding incidents · last 7 days"), passing the response's own figures as
  the number gate's allowed set (`out(text, lang, ph, allowed)`, Thunai.tsx:487). Read the returned `AskResponse`, not
  `c.mapAsk.resp`, right after the await (the host object is refreshed on the next render). Keep the step's `q` verbatim (golden
  tests) and normalise inside the executor (3.3).
- **Risk.** A, low: read-only; an AI call is possible for unread words (latency, cost).

### 3.2 Follow-ups that edit the plan, and the chips

- **UI today.** A follow-up is typed into the same Ask box (`ask.ask`), the server edits `prev` (2c). "Ask next" buttons
  (AskMapPanel.tsx:325-335) are the server's checked follow-ups (`followUps`, lib/map/followups.ts:30-44: each is routed and run
  before it is offered, at most 4) or plain edits for an old answer (:336-351). Chips: 2d. Tiles, trace steps, cluster bubbles
  and brief counts only spot ids (`setSpot`), they do not edit the plan. A folded earlier answer -> `restore(id)`; a failed turn
  -> `retry(id)` (AskMapPanel.tsx:170, 174; useMapAsk.ts:237-246).
- **State / API.** As 3.1; chip edits post `{plan, prev}`; `edited` decides whether the camera moves.
- **What the user sees.** A new turn labelled with the follow-up or the chip option; the map redraws, the camera stays for small
  edits.
- **Preconditions.** An answer with a plan (`resp.kind === "answer" && resp.plan`). After a brief or a `say`, `mapAsk.plan` still
  holds the previous answer's plan (only answers set it, useMapAsk.ts:209), so use `resp.plan` as the base, not `mapAsk.plan`.
  `applyChip` returning null means "that change does not fit this question".
- **By voice.** Text follow-ups: `c.mapAsk.ask(text)`, no map code. The real work is routing on Jarvis's side: today "only
  severe" goes to the console (a `view` step), and "make it 2 km" reaches the map only because "km" is a
  SPATIAL word. (Severity words become `view.sev` in understand.ts:502-527, which `applyView` turns into the console's severity
  tab, CollectorApp.tsx:754.) With an answer on the grown map, short follow-ups should go to the map. The follow-up regexes live in
  `lib/map/route.ts`, which Jarvis's browser code must not import (it reaches `lib/collector/nlp` -> `lib/collector/db` and `fs`;
  `thunai/clientimports.v6.test.ts` fails on that), so move `EDIT_*`/`VISITS`/`COUNT_BY` into a small pure module (e.g.
  `lib/map/edits.ts`) imported by both. Chips by voice: `const p = applyChip(resp.plan, "r:in", "2000"); if (p) c.mapAsk.run(p,
  "2 km")` (ids and keys from `resp.chips`) — exact, no AI, the same as the menu.
- **Risk.** A, low; the main risk is misrouting a sentence between the console's filters and the map.

### 3.3 A drawn circle by voice ("within two kilometres of Kasimedu")

- **UI today.** The circle tool (Chrome.tsx:56-57) turns on `drawCircle`; SatMap (:697-718) disables dragging, mousedown sets the
  centre, mousemove the radius (50-5,000 m), mouseup calls `ask.draw({lat, lon, r})` and turns the tool off. Right-click:
  `draw({lat, lon, r: 500})` (:241-245). Ward click: `draw({ward})` (:179).
- **State / API.** `draw` posts `{text: null, context: {drawn: {lat, lon, r}}}` labelled "What is inside the circle I drew?"
  (useMapAsk.ts:265-266). The server (ask.ts:200-216) makes the area `{kind: "drawn", id: "lat,lon,r"}`, an **area brief**
  (`areaBrief`, brief.ts:33): open issues, citizens', by type, worst three, departments with overdue, last 30 days against the
  30 before, facilities in and around; plus conditions, camera `area`, the brief's follow-ups. `plan` is null.
- **What the user sees.** "What is happening here: …" brief card; a dashed circle with the district masked outside it
  (answerLayers.ts:66-81); the camera frames the circle.
- **By voice, least code.** Send a canonical sentence through `c.mapAsk.ask`: `"what is happening within 2 km of Kasimedu"`.
  The rules read BRIEF (route.ts:81) with a place and no facility and return `{kind: "brief", area: {kind: "point", ref:
  "loc:Kasimedu", radius_m: 2000}}` (:901-904); the server draws the same circle from `context.areas[0].circle` (ask.ts:233-243)
  and the brief is computed the same way (centre plus radius, brief.ts:36-43). No map code at all. Two notes: `distanceOf`
  (route.ts:97-107) reads digits, "a km" and "half a km" only, so "two kilometres" must become "2 km" first (Jarvis's
  `normalise()`, lib/thunai/normalise.ts:80-110, already turns number words, English and Tamil, into digits); and "draw a circle
  …" leaves "draw" and "circle" unread, which calls the AI or adds a "not used" note. Said without "what is happening", "within
  2 km of Kasimedu" becomes an answer (open incidents, last 7 days, inside 2 km) whose radius chip `r:in` is then editable.
- **Alternative.** `c.mapAsk.draw({lat, lon, r})` gives exactly the tool's brief but needs coordinates in the browser; Jarvis's
  place list has none (2e). Adding lat/lon there is one line but covers only the 81 reference places, while the server resolves
  every GCC area, OSM place, facility and road.
- **Preconditions.** The place resolves; radius 10-5,000 m for a point (plan limits), 50-5,000 m for a drawn circle.
- **Risk.** A, low; correctness depends on number words and the spoken place name.

### 3.4 Layers, and the camera's shots

**Layers.**
- **UI today.** `useMapChrome` (Chrome.tsx:29-82), mounted in `Page1` (Overview.tsx:101): the Layers button (:58) opens a menu
  (:64-80) whose checkboxes call `toggle(id)` (:37-48) -> `GET /api/map/layers/{id}` -> `on[id] = {id, kind, features,
  unplaced, days}` -> `overlays` -> SatMap draws them (:561-585: news "N" squares, live readings as value pills, facilities as dots,
  lines, lake polygons) and the Legend lists them (:85-124). Ids: On the ground now `live_rain, live_lakes, live_works,
  live_hospitals, live_air`; Reports `news`; Facilities and water `schools, colleges, hospitals, fire_stations, police,
  rail_metro, water_bodies, waterways` (:16-25). Also: heat view (:53-55, only with an answer), Satellite / Streets (:59-61), the
  circle tool, "Back to the answer" (:52).
- **State.** Local to `Page1`: not on MapAsk or the Console, lost when the Collector leaves the Overview (CollectorApp.tsx:915).
  Overlays are drawn whether or not the map is grown, but hidden while Rain is open (Overview.tsx:154).
- **By voice.** No path today. Jarvis's `layer` step is a different thing: the console's own pin layers `severe, complaint,
  other, added, stations` (lib/thunai/plan.ts:21; Thunai.tsx:707). This is the one core feature that needs the bridge: a
  `diq:map-cmd` listener in `useMapChrome` for `layer {id, on}`, `heat {on}`, `base {sat|streets}` (check `on[id]` first,
  `toggle` flips), replying with the layers on. Alternative: lift `on/heat/base` into `useMapAsk` so they are on `c.mapAsk`
  (also keeps layers across page changes).
- **Preconditions.** The Overview mounted (Jarvis first sets the page and waits for `host.settled()`); grown to see the tools and
  legend; heat needs an answer.

**Shots.** See 2b. By voice, with no new map code: "replay" -> `c.mapAsk.replay(0)`; "next shot" ->
`replay(Math.min(c.mapAsk.cue.index + 1, resp.shots.length - 1))` plus the cluster spot for a hotspot tour; "previous" likewise;
"follow the road" -> `replay(1)` on an `along` answer; speak `resp.shots[i].caption_en`. Preconditions: an answer or brief (the
camera effect ignores `say`, SatMap.tsx:500); more than one shot only for hotspot and along answers. The panel's highlighted tour
button (local `tour`, AskMapPanel.tsx:76) will not follow a voice replay (cosmetic).

- **Risk.** A, low.

### 3.5 Export as CSV or GeoJSON

- **UI today.** Export (AskMapPanel.tsx:249, disabled when `!r.total`) or "Export all" under a long list (:546) ->
  `actions.onExport(r)` -> `setExporting(true)` (AskOverlay.tsx:59, 65) -> the sheet (:75-88): "Export N rows. Exactly the
  answer's rows, with the as-of date and the question in the file. No personal details." with "CSV (spreadsheet)",
  "GeoJSON (GIS)", Cancel -> `downloadAnswer(r, f, question)` (actions.ts:11-23). Saying or typing "export", "download",
  "export csv" gives a server `ui: "export"` (route.ts:639, :669) -> `uiCue` -> the panel's effect (AskMapPanel.tsx:86-92) opens
  the same sheet; the format is still a click.
- **API.** `POST /api/map/export {plan, question, format}` -> "Confirm it's you" (password or emailed code) -> `exportAnswer`
  (ask.ts:568-594) re-runs the plan on fresh data, **all** rows (not the list's 200); CSV with `#` header lines (question, as-of,
  window, plan) or a GeoJSON FeatureCollection (rows with no exact place have null geometry) -> audited -> file. The browser
  downloads it and toasts "Exported ask-the-map-<stamp>.csv: N rows."
- **By voice.** `downloadAnswer(resp, "csv" | "geojson", question)` from the new executor, the format taken from the words. The
  password box appears, by design. Note that "export as CSV" is not read by the server's EDIT_EXPORT (only "export|download"
  followed by these/them/this/it/csv/geojson/the list), so the export must be decided on Jarvis's side, not sent as text.
  Use the shown turn's question, not `ask.history`'s last entry (AskOverlay.tsx:46 uses the latter).
- **Preconditions.** An answer with a plan and `total > 0`.
- **Risk.** B, medium: data leaves the console as a file (no personal data; audited; password). A download started outside a
  click may meet the browser's "multiple downloads" prompt.

### 3.6 Save the view

- **UI today.** Save view (AskMapPanel.tsx:250) -> `saveView(a, role, question)` (AskOverlay.tsx:66; actions.ts:27-40). Collector:
  `POST /api/collector/workspaces {name: "Map · <question>", filters: {askMap: {plan, question, as_of}}, layout: {}}`
  (`collectorSession`, no step-up) -> toast `Saved as workspace "Map · …". It re-runs on fresh data when opened.` Officer: this
  browser's `localStorage` (`diq-map-views`, 20 max). Reopened from Workspaces: `openSavedWorkspace` sees `askMap.plan`, grows the
  map and `run(plan)` on today's data (CollectorApp.tsx:584-593).
- **By voice.** `saveView(resp, "collector", question)`. A spoken name needs a small change (a name argument, or post the
  workspace body directly). Do not use Jarvis's existing `{a:"workspace", op:"save"}`: it calls `c.saveWorkspace(name)`, which
  saves the dashboard's filters, layout and a frozen briefing (CollectorApp.tsx:561-578), not the map's plan. Reopening by voice
  already works (`{a:"workspace", op:"open"}`, Thunai.tsx:760-773).
- **Preconditions.** An answer with a plan (the button is only under answers).
- **Risk.** B (writes a workspace version), low.

### 3.7 The visit order with its Google Maps link

- **UI today (officer only).** Plan my visits (AskMapPanel.tsx:248) -> `onVisits` (AskOverlay.tsx:67-71) -> `visitOrder(a, null)`
  (actions.ts:52-82: the 10 highest-priority open rows with an exact place, nearest neighbour from the top case, then 2-opt,
  straight-line legs) -> none: toast "No open case in this answer has an exact place to visit." -> else `ask.setRoute(route)`.
  `VisitCard` (AskOverlay.tsx:151-176): "Visit order: N stops, X km", "Straight-line, not road distance…", the stops with each
  leg, **Open in Google Maps** (a plain link, `target="_blank"`, `googleMapsLink(route)`: coordinates only, at most 9 waypoints,
  actions.ts:85-91), Use my location (browser geolocation, then `visitOrder` from there), Close. SatMap draws a dashed line and
  numbered stops, flies to them, and a map click restarts the route from that point (SatMap.tsx:522-547). The text "plan my
  visits" gives a server `ui: "visits"` (route.ts:638, 667).
- **The Collector.** `onVisits` is undefined for role `collector` (AskOverlay.tsx:67): no button, and "plan my visits" said on the
  Collector's console only adds the note "Planning your visits from this answer." and nothing opens (a bug). But the card is not
  role-gated: it renders whenever `ask.route` is set (AskOverlay.tsx:90). `route` is cleared by each new answer (useMapAsk.ts:208).
- **By voice.** `c.mapAsk.setRoute(visitOrder(resp, null))`; say "7 stops, 12.4 km straight-line; Open in Google Maps is on the
  card". Leave the link to the Collector's click (the code's own rule; a link opened from speech is not a user gesture and would
  be blocked anyway; the v10 brief: sending it anywhere needs the Collector's yes and an existing channel).
- **Preconditions.** An answer with at least one open, exactly placed row among its first 200 rows.
- **Risk.** A, low (computes and shows); location needs the Collector's permission.

### 3.8 The AI analyst's insight

- **UI today: none.** The panel's "AI analyst" and "What needs attention" cards were removed in commit `778cc33f` (29 Oct 2026,
  "Removed the AI analyst and 'What needs attention'; insights no longer computed per question"); `ask.ts:317-318` sets
  `insights = []`. The route and `lib/map/analyst.ts` remain, with no caller in `src/`.
- **API.** `POST /api/map/insight {plan}` (20 a minute) -> `analyse` (analyst.ts:57-92): 5-minute cache per role, department and
  plan; re-runs the plan; only for an answer with `total > 0`; a fact pack (headline, meaning, top departments, the trace's
  method lines, unplaced count, the top 5 cases, :37-48); one `generateJson` call (role "reasoning", schema `{summary,
  actions[≤3]{text, dept}, watch}`); every sentence with a number not in the facts is dropped; department codes kept only if in
  the answer -> `{summary, actions, watch, model, dropped}` or `{none: true}` (`reason: "ai"` when no model is available).
- **By voice.** Jarvis posts `{plan: resp.plan}`, speaks the summary and shows summary, actions and watch in its own HUD card. An
  action with a department can be offered as "Send these to <dept>?" (3.9, drafts only). Re-adding the card to the panel would
  undo a deliberate design change by a teammate; ask the owner first.
- **Preconditions.** An answer with a plan and `total > 0`; a model available.
- **Risk.** Read; low to medium (AI latency and cost; already number-checked against its facts, and Jarvis's own gate applies).

### 3.9 Send to department (drafts; sent only on the Collector's own yes)

- **UI today (Collector only).** Send to department (AskMapPanel.tsx:247, disabled when `!r.total`) -> `setSending({dept: null})`
  (AskOverlay.tsx:64) -> `SendDialog` (:99-148). On mount: `POST /api/map/send {action: "draft", plan, question, dept}` -> all
  rows re-run, the open ones grouped by department (only `dept` if given), largest first, one template draft each
  (`draftBatchAction`, no writes, no AI) -> `{drafts: [{dept, deptName, ids, total, listed, subject, body, to: {name, email} |
  null, delivery: {mode, smtp, to, note}}], closed}`. The dialog: "One email per department, listing its open cases from this
  answer. Nothing is sent until you press Approve."; per department the To line with Sandbox or Live, an editable subject and
  message, **Approve and send** -> `POST {action: "send", dept, ids, subject, body, plan}` -> "Confirm it's you" bound to that
  department, those case ids, that subject and body -> `sendBatchAction` (sandbox by default, `outbound_emails` row, a 24 h
  follow-up per case, audit) -> "sent", "Follow-up set for N cases (24 h). Reference …", toast.
- **Text path that exists.** "send these to SWD" -> `editPlan` -> `{kind: "ui", ui: "send", dept: "GCC-SWD"}` (route.ts:635, 670;
  pinned by route.test.ts:260-263) -> `uiCue` -> `onSend(resp, dept)` -> the dialog opens on that department's draft. The
  Collector is also offered "Send these to <dept>" under answers (followups.ts:111; never offered to an officer,
  followups.golden.ts).
- **By voice.** `c.mapAsk.ask("send these to <dept words>")`: zero new code, the drafts open. Or, without the server round trip
  and the remount quirk below, `diq:map-cmd {op: "send", dept}` handled in AskOverlay (`setSending({dept})`). Jarvis then reads
  "Drafted 2 emails: Storm Water Drains, 12 cases; …; nothing is sent until you press Approve." Jarvis never presses Approve (the
  click guard refuses it, and the server would still ask for the password).
- **Preconditions.** Collector session; an answer with a plan and open cases; the map grown (the panel must be mounted for the
  cue to land).
- **Quirk.** The panel acts on `uiCue` in an effect keyed on `uiCue.seq` (AskMapPanel.tsx:86-92) and the panel unmounts when the
  map shrinks, so after "Back to overview" and growing the map again the last cue fires again and the Send dialog (or Export
  sheet) reopens. Voice will grow and shrink the map more often; clear the cue after use or skip a cue older than the mount.
- **Risk.** High: C for drafts; sending is never Jarvis's.

### 3.10 The suggested questions

- **UI today.** Before the first question (AskMapPanel.tsx:163, 292-319): "From today's data" (up to 4 live suggestions not in
  the standing set) and four standing groups (Before the rain, Where to act first, People and places, In Tamil; `GROUPS`,
  :281-290). The bulb (:234) opens a tray at any time (:227-232) with up to 9: the current answer's follow-ups, the live ones,
  then the standing ones (`trayQs`, :268-274). Under each answer, "Ask next" (3.2). Each is `submit(q)`. Live suggestions come
  from `GET /api/map/suggest` once, when the map first grows (AskOverlay.tsx:41-44), kept in a module variable for the page's
  life (:21); the server makes up to 6 by rules, each checked to return rows, cached per store build and hour
  (lib/map/suggest.ts:26-70).
- **By voice.** "What can I ask the map?": read 3 or 4 of `resp.followups` (with an answer) else of `/api/map/suggest` (or the
  standing ones, if `GROUPS` is exported); "ask the second one" -> `c.mapAsk.ask(list[1])`. Showing the tray itself needs
  `diq:map-cmd {op: "tray"}` in AskMapPanel (local state).
- **Preconditions.** None; follow-ups need an answer.
- **Risk.** Low.

### 3.11 Rain & flooding

- **UI today.** The Rain pill beside "Ask the map…" (Overview.tsx:36-46, 162; it shows the warning level) -> `c.openRain()`
  (CollectorApp.tsx:676) -> `openRain({replay: null, manual: false})` (:325-328) sets `rain = {rain, seq, lens}` and the page ->
  `Page1` sees `rv` (Overview.tsx:103): SatMap gets the rain layer and the streets base, Ask the Map steps aside (the map shrinks
  its Ask state, CollectorApp.tsx:727) and `RainView` opens (RainView.tsx, keyed by `seq`). It loads `/api/rehearsal/state` and
  `/rains` (and the Traffic, Power, Metro impacts): "Rain · Flooding" with tabs Flooding / Traffic / Power / Metro, the warning
  line, all rains (counts, where most flooding is, past rains, zones, the streets that flood most, "Review and send N jobs") or
  one rain (older and newer, zones, flood streets, its jobs, its reports), and cards for a street or a report. PlanSheet sends the
  jobs, each department's email read and approved (password, `/api/rehearsal/plan`). Close or Escape (back one level first,
  CollectorApp.tsx:706). Also the palette (:768-769).
- **From a question.** `useMapAsk.ask` checks `rehearsalIntent(t)` when `window.__diqRehearsal` is set (useMapAsk.ts:255-261):
  "what will flood tomorrow", "which hospitals get cut off", "dry schools near Velachery", "how did we do last rain", "replay 21
  October", traffic, power or metro in rain (lib/rehearsal/intent.ts:41-57). A match adds a note turn and dispatches
  `diq:rehearsal` with `{replay, manual, stop, focus, lens}`; `RainBand` (mounted hidden on the Collector's console,
  CollectorApp.tsx:861) listens and sets the flag (RainBand.tsx:27-31) and calls `openRain(detail)`. `openRain` keeps `replay`
  ("rain-2026-10-21" opens that rain), turns `stop` check/rain/learn into "latest", keeps `lens`, and drops `focus`.
- **By voice.** Nothing in Jarvis reaches it today. Least code: `c.openRain()`; a given rain or tab:
  `window.dispatchEvent(new CustomEvent("diq:rehearsal", {detail: rehearsalIntent(text) ?? {}}))` (existing event and pure
  function); close `c.rainView?.close()`; back one level `c.rainView?.esc.current?.()`. Moving inside the view (a zone, a street,
  another tab once open) needs a small listener in RainView; dispatching `diq:rehearsal` again works but remounts RainView and
  reloads its data.
- **Preconditions.** The Collector's console (RainBand mounted); it switches to the Overview.
- **Risk.** Low to open and look; its job emails are never Jarvis's to send.

---

## 4. The bridge

### 4.1 No bridge needed (direct calls on `hostRef.current.c`)

`c.mapAsk.ask / run / draw / replay / restore / retry / clear / setGrown / setRoute / setSpot / setFocus / setTraceOpen /
setShowBefore`, the fields `resp / plan / turns / cue / route / busy / grown`, `c.askOnMap`, `c.openRain`, `c.rainView.close /
esc`, plus the client-safe helpers `applyChip`, `cameraFor`, `visitOrder`, `googleMapsLink`, `downloadAnswer`, `saveView`,
`answerGist`, `rehearsalIntent`, and `fetch("/api/map/insight" | "/api/map/suggest")`. All of these import only browser-safe code
(they are already in the console's bundle). Do not import `lib/map/route.ts`, `ask.ts`, `world.ts` or `suggest.ts` into Jarvis's
browser code.

### 4.2 One event for the state kept inside components

```ts
// src/components/collector/app/askmap/bridge.ts (new, about 40 lines, browser only)
export type MapCmd =
  | { op: "layer"; id: string; on: boolean } | { op: "heat"; on: boolean } | { op: "base"; base: "sat" | "streets" }
  | { op: "exportSheet" } | { op: "send"; dept: string | null }
  | { op: "tray"; open: boolean } | { op: "chips"; open: boolean }
  | { op: "rain"; lens?: "flood" | "traffic" | "power" | "metro"; rain?: string | null; zone?: number | null };
export interface MapReply { ok: boolean; why?: string; state?: Record<string, unknown> }

/** Hands a command to the part of Ask the Map that owns that state. null: no such part is mounted (open the map first). */
export function mapCmd(cmd: MapCmd): MapReply | null {
  let reply: MapReply | null = null;
  window.dispatchEvent(new CustomEvent("diq:map-cmd", { detail: { cmd, reply: (r: MapReply) => { reply = r; } } }));
  return reply; // listeners run synchronously inside dispatchEvent
}
/** For an owner's useEffect: handle its own ops, return the cleanup. */
export function onMapCmd(ops: MapCmd["op"][], handle: (c: MapCmd) => MapReply): () => void {
  const f = (e: Event) => { const d = (e as CustomEvent).detail; if (ops.includes(d.cmd.op)) d.reply(handle(d.cmd)); };
  window.addEventListener("diq:map-cmd", f);
  return () => window.removeEventListener("diq:map-cmd", f);
}
```
Owners: `useMapChrome` (layer, heat, base; reply with `Object.keys(on)`), `AskOverlay` (exportSheet -> `setExporting(true)`, send
-> `setSending({dept})`; reply false when there is no answer or `role !== "collector"`), optionally `AskMapPanel` (tray, chips)
and `RainView` (lens, rain, zone). For Jarvis's state, `useMapChrome` can also publish `window.__diqMapLayers` the way the Studio
publishes `window.__diqStudio` with a `diq:studio` change event (studio/Dataset.tsx:108-122; Thunai.tsx:311).

If the team prefers one uniform channel, the same event can carry the core ops too, handled inside `useMapAsk`; it adds code
without adding reach, since Jarvis already holds `c.mapAsk`.

### 4.3 Jarvis's side

- **Step.** `{ a: "mapdo"; op: "follow" | "chip" | "circle" | "shot" | "layer" | "heat" | "base" | "export" | "save" | "visits" |
  "insight" | "send" | "suggest" | "trace" | "spot" | "open" | "restore" | "clear" | "back" | "rain"; ... }` in
  `lib/thunai/types.ts`, with `ACTION_LEVEL` / `RISK` rows (reach.ts:35-39, risk.ts:11-26; reach.test.ts checks them) and REACH
  rows with an example sentence in English, Tamil and Tanglish (v10 4.7). Keep `{a: "map", q}` for questions (golden tests).
- **Levels.** A: follow, chip, circle, shot, layer, heat, base, visits, insight, suggest, trace, spot, open, restore, back, rain.
  B: save, export (the server also asks for the password for export). C: send (drafts only; Approve stays the Collector's tap
  and password). `clear` has no undo: ask first when the chat has several turns.
- **Executor** (`thunai/mapops.ts`, called from `runStep`): close Jarvis's Stage, `c.setPage("overview")`,
  `c.mapAsk.setGrown(true)`, `await host.settled?.()`; check the precondition and say plainly when it fails ("There's no answer on
  the map yet; ask a question first."); do the op; speak from the returned data only.
- **State.** Add `map` to `ScreenState`: `{grown, busy, kind, total, gist, chips[{id, part, options}], shots, shot, tour
  captions, followups, route stops, layers, heat, base, rain {open, lens}}`, built from `c.mapAsk` and `window.__diqMapLayers`;
  send a compact copy to the planner so the model can pick ops and chip ids.
- **Routing.** With an answer on the grown map, a short sentence matching the follow-up vocabulary (the moved `EDIT_*` regexes)
  becomes `mapdo follow` instead of a console filter; "replay", "next", "export as CSV", "save this view", "plan my visits",
  "what does this mean", "send these to SWD", "what can I ask", "rain" map to their ops. On the server, the agent's conversion of
  map steps into the `nearby` Stage screen (agent.ts:588-593) should leave the step on the console when the map is grown (or
  always; the owner's choice).
- **Numbers.** Normalise number words inside the executor (`normalise()`); speak only figures present in the response.

### 4.4 Gaps and bugs found on the way

1. The Collector's "plan my visits" ui cue does nothing (`onVisits` officer-only, AskOverlay.tsx:67), though the turn says
   "Planning your visits from this answer."
2. `uiCue` fires again whenever the panel remounts (AskMapPanel.tsx:86-92), reopening the Send dialog or Export sheet.
3. After a brief or `say`, `mapAsk.plan` is still the previous answer's plan (useMapAsk.ts:209).
4. Spoken number words are not read as distances by the map; Jarvis passes `heard` verbatim ("two kilometres" gives the 1 km
   default).
5. "export as CSV" is not an export to the map's rules, and the ui export never carries a format.
6. Jarvis's `workspace save` saves the dashboard, not the map's plan.
7. The AI analyst has a route and no UI since 778cc33f.
8. Save and Export name the file or workspace from `ask.history`'s last question (AskOverlay.tsx:46), not the shown turn's.
9. The live suggestions are fetched once per page load and never refreshed (AskOverlay.tsx:21, 41-44).
10. `openRain` drops `focus` (CollectorApp.tsx:325-328): "which hospitals get cut off" opens all rains on Flooding.
11. The map's context never carries the open incident (useMapAsk.ts:183), so a map step "Nearest hospital to this incident"
    (golden.test.ts:53) answers the nearest hospital to every open incident of the week; `c.askOnMap({incidentId})` exists for
    the incident itself.
12. Layers live in `Page1` and reset on any page change.

---

## 5. Tests that pin these behaviours

- `src/lib/map/route.test.ts`: 80 % of 120 questions by rules alone (:190-199); follow-ups edit exactly one part ("only severe",
  "make it 500 m", "last 30 days", "add hospitals", "compare with Adyar", "show by ward"), the ui intents "why these?", "send these
  to SWD" (dept GCC-SWD), "start over" (:223-264); chips and `applyChip` (:266-275); news as a source (:278-307); unknown wards
  and zones (:309-320); places themselves vs incidents near them, the 7-day default (:322-341); follow-ups keep what they do not
  change (:343-377).
- `src/lib/map/camera.test.ts`: one shot per shape, the hotspot tour (bounds then 3 points at 3 s), along's 6 s follow, reduced
  motion, flight time, `followUpMoves` (:9-86).
- `src/lib/map/execute.test.ts` (executor, oracle, officer lock, limits), `resolve.test.ts` (every gazetteer alias, verbs pick the
  kind, a locality 1 km and a facility 500 m), `wire.test.ts`, `safety.test.ts` (no SQL from a plan, no personal data),
  `geom.test.ts`, `conditions.test.ts`, `insights.test.ts` (the analyst's `verified` keeps only fact numbers, :60),
  `ask.pass6.test.ts`, `ask.fixall.test.ts`, `answer.pass6.test.ts` (officer lock), `periods*.fixall.test.ts` (time words),
  `tests/qa/pass6/known-failures/reviewer3/p12-map-miss.test.ts`, `tests/qa/pass4/p6-batch-mail.test.ts` (batch mail reaches
  every case).
- Golden, on the frozen store (`vitest.golden.config.ts`, `npm run eval:golden`): `map.golden.ts` (answers equal a brute-force
  oracle; count = list = export = pins + unplaced over 300 random plans; the brief's counts; officer lock; determinism) and
  `followups.golden.ts` (every offered follow-up answers; an officer is never offered Send).
- `src/lib/rehearsal/intent.test.ts`: rain questions open Rain at the right stop and tab; ordinary map questions do not.
- `src/lib/security/stepup.test.ts` and `stepup.fixall.test.ts`: the grant's binding, using `/api/map/send` as the example.
- Jarvis: `lib/thunai/golden.test.ts` (map steps carry the heard words verbatim, :52-55, 128-129, 179-180, 235),
  `server.test.ts:69`, `unseen.test.ts:28`, `agent.test.ts:263-285` (map recipe; `ask_map` hands), `reach.test.ts` (every action
  has a level and words), `thunai/clientimports.v6.test.ts` (no server module in Jarvis's browser code), the dev harness
  (`app/dev/thunai/Harness.tsx:54-55`).
- **Not covered:** no component test of `useMapAsk`, `AskMapPanel`, `AskOverlay` or `SatMap` (the officer Board's test mocks
  `AskOverlay`), and no browser test of Ask the Map in `tests/e2e`. For the bridge: unit tests of the executor against a fake
  `MapAsk`; tests that each op's level is in the reach and risk tables; a browser drive asserting `data-camera` after "replay" and
  "next shot", the layer legend after "show schools", the "Confirm it's you" box after "export as CSV" and after Approve, and that
  Jarvis refuses to press "Approve and send".
