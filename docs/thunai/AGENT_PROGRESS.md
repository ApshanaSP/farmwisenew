# Thunai v2: progress and decisions (29 Oct 2026)

Branch `thunai/agent`, cut from `thunai/pilot` (36ac244). Nothing pushed or merged. The unrelated modified files
(`data/datasets/*.csv`, `tsconfig.json`) were left alone and never committed.

## Decisions (and why)

1. **The model chooses a recipe; code builds the screen.** The prompt's plan was "the model may do up to 3 tool rounds,
   then return a Stage built from references to tool results". With the Groq free tier (about 8,000 tokens a minute per
   model per key) a 3-round agent costs 10,000+ tokens per sentence, so most screens would fall to the smaller models.
   Instead the model names one of 15 **screen recipes** (cases, case, news, readings, ranking, compare, trend, why,
   performance, dashboard, map, nearby, brief, drafts, answer) and its slots, checked against the real lists. Code then
   calls Ask District IQ's tools (`runTool`) and builds every block. One model call (about 3,500 tokens) answers most
   sentences. The model still may call tools itself (up to 3 rounds, 8 s) for a question no recipe fits; that ends in the
   `answer` screen, whose sentences must use only figures the tools returned.
2. **The spoken line is written by code**, in English and Tamil templates, from the screen's own data (`screens.ts`).
   The model's line is used only on the `answer` screen, and only when every figure in it is in the tool results. A unit
   test checks, for every recipe and both languages, that every figure spoken is on the screen (it caught one: the trend's
   percentage was spoken but not shown; it is now on the KPI tile).
3. **"These 6 severe cases" are the console's own list**: a `console_severe` hand reads `overview().severity`, the same
   function and scope the console uses (`data.ts`), and the whole list is shown even if the Collector said a different
   number (the count changes during the day).
4. **Ask the Map inside the Stage** calls Ask the Map's own engine (`askMap`, lib/map/ask.ts). The ranked list of
   schools (or hospitals...) is code measuring each place to its nearest result (haversine), within the radius Ask the
   Map used. No second spatial engine.
5. **Rain "areas"**: the store has only 4 IMD rain stations and none per zone, so "top 3 areas with rainfall" ranks the
   stations and says so on screen ("the data has no zone-level gauge"). When every station reads 0 mm it says there was no
   rain rather than ranking zeros.
6. **Local Stage commands need no model** ("next", "stop", "only the Adyar ones", "sort by complaints", "show it as a
   table", "open 3", "draft for the first three", "pin this", "export"), in English, Tamil and Tanglish
   (`stagelocal.ts`). Refinements that need new data ("add Perungudi", "make it monthly") go to the agent with the open
   Stage. Stage filters (period, area, measure) and drill-downs rebuild the screen **directly** (no model, no tokens).
7. **Operate and show**: code adds the console steps that make the console agree with the screen (one view step, one
   period step, the severe layer for maps, the Environment page for readings). The model's own view/period steps give way
   to these, so closing the Stage leaves the console on the same scope.
8. **Safety unchanged**: sending is never a model action; drafts go to the approval tray and only "confirm N" (or the
   button) sends, through the existing Take action endpoint, sandbox only. The dev console's draft route can read a draft
   but has no send at all. Saving a workspace is level B (one tap / "yes"). No citizen phone numbers, e-mails or letter
   openings reach the cards or the voice (`safeText`); incident ids are never spoken.
9. **Voice** (the owner: "voice not nice", "Indian voice if available"): `voice.ts` picks the most natural voice the
   device has, Indian voices first (Edge/Windows "Online (Natural)" en-IN and ta-IN voices when present), speaks in
   sentence-sized pieces (Chrome stops long utterances), and reports word boundaries for the karaoke highlight. A "Voice"
   panel lists the device's voices with a Try button. Still the browser's own speech service: no new service.
10. **Speaking like an aide** (the owner: "it should not read unwanted detail, no incident ids, say what the problem is
    and what is important"): case lists are summarised ("6 severe cases today. One is past its deadline and needs you
    first: hospital beds critical at Stanley. Greater Chennai Police holds 3 of them."), and each case is briefed as
    where, what, how long, deadline, who (`caseBrief`), never its id or the citizen's words.
11. **Theme and palette**: the Stage follows the console's light/dark theme. Chart colours use the dataviz skill's
    reference categorical palette; slots 1-4 validated with its checker (dark: all pass; light: contrast WARN for two
    slots, so the Compare board always shows values as text and every chart has a table view).

## Skills used and what each changed
- `dataviz`: chart form per job (bars for rankings, a line with the usual range shaded and unusual points marked for
  trends, grouped bars for comparisons, a heat strip for department × measure); one value axis per chart; values on the
  marks; tooltips on every mark; a table view for every chart; validated colours.
- `design-taste-frontend`: design read ("in-product command overlay for a District Collector, calm dark-glass mission
  control, the console's own fonts and icon family"); one accent, one radius scale, no em-dashes in UI copy, motion only
  for arrival, reading and work in progress, all off under reduced motion.
- `redesign-existing-projects`, `web-design-guidelines`: see the review section below (filled in after the review).

## Log
- Read the build prompt, REPORT.md, plan.ts, Thunai.tsx, assistant/agent.ts, tools.ts; probed every tool's real output
  shape on the local store through a dev-only route.
- Built stage.ts, insight.ts, screens.ts, data.ts, agent.ts, agentServer.ts, routes; checkpoint ee4232d.
- Built Stage.tsx, stage.css, StageChart.tsx, export.ts, voice.ts; extended StudioMap with numbered pins and outlines;
  wired Thunai.tsx; 95 Thunai tests; checkpoint a9ea3d8.
- Live cases and unseen set: see AGENT_REPORT.md.
