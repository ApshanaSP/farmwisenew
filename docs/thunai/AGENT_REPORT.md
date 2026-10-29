# Thunai v2: the agent and the Stage (report, 29 Oct 2026)

Branch `thunai/agent` (from `thunai/pilot`). Several commits; **nothing pushed or merged**. The unrelated changed files
(`data/datasets/*.csv`, `tsconfig.json`) were not touched or committed.

## What it does now, in one paragraph
Ask Thunai for something and it **operates, shows and tells**. It says at once what it is doing ("Checking the severe
cases.") with a soft heartbeat while it works, sets the console to the right scope, and opens a full-screen **Stage**
built for the question: case cards with a numbered map, a news reader that reads the headlines aloud with the word
being spoken highlighted, reservoir gauges, rankings, a comparison board, trends with the unusual weeks marked,
department and zone performance, a 5-block dashboard, Ask the Map results (schools near flooding, ranked by distance).
Then it speaks a short summary, like an aide: how many, which need you first and why, who holds them. Never an ID,
never a citizen's own words, never a number that is not on the screen. Everything on the Stage can be clicked or said:
"open the third one", "draft action for 2", "only the Royapuram ones", "sort by complaints", "add Perungudi", "make it
monthly", "show it as a table", "pin this", "export", "save as Monsoon watch", "all of Chennai", "stop", "next".

## How it works (plain words)
- The AI model (Groq, gpt-oss-120b first) only **chooses**: which screen ("recipe") and its details (zones, period,
  category...), or an action on the open screen. Code checks every choice against the real lists.
- **Code fetches and counts**: it calls Ask District IQ's own tools (the same numbers as the console), the console's own
  severity list and news, and Ask the Map's own engine. Insights are rules: rank, gap against the median, change on the
  previous period, the largest gaps between areas, the usual range of a series. Each is labelled with its method.
- **Code writes what Thunai says**, in English and Tamil, from the screen's own data. A test checks for every screen
  and both languages that each spoken figure is on the screen (it caught real slips during the build).
- One model call per sentence (about 3,500 tokens). Stage controls (filters, drill-downs, "next", "only X") need **no
  model at all**, so they are instant and cost nothing. For a question no screen fits, the model may look at data
  itself (up to 3 rounds, about 8 s), and its answer may use only figures the tools returned.
- Safety is unchanged from v1: drafts go to the approval tray; only "confirm N" (or the button) sends, sandbox only.
  The model can no longer press a "send/approve/delete" button by name.

## New, beyond the brief (the owner asked for "more creative, useful")
- **Thunai anticipates**: every screen ends with 2-3 suggested next steps computed from what it shows ("Draft for the 2
  past deadline", "Why is Adyar higher?", "Open Greater Chennai Police's backlog", "Draft an alert for the nearest 3").
- **It notices stale filters**: if a list is empty because of filters left on the console, it says which ("the console
  still has Flooding on") and offers **All of Chennai** in one tap or one word.
- **Better voice**: the most natural voice on the device, **Indian voices first** (Edge/Windows "Natural" en-IN and
  ta-IN voices sound best), sentence-sized speech so long lines do not cut off, word-by-word highlight, and a **Voice**
  panel to pick and try voices.
- **Briefs like an aide**: "6 severe cases today. One is past its deadline and needs you first: hospital beds critical
  at Stanley, Royapuram. Greater Chennai Police holds 3 of them." Each case read as where, what, how long, deadline,
  who. No incident IDs, no complaint text, no phone numbers (removed from cards too).
- **Memory for follow-ups**: the open screen travels with the next sentence, so "this", "the third one", "add X",
  "same for Y" act on what is shown; the last 4 turns go too.
- **Ask the Map, smarter**: "flooding in Adyar" that finds nothing around the Adyar locality is asked again for Zone 13
  Adyar, and the screen says which reading was used.

## Numbers (all measured)
- **Live understanding, 40 cases** (English, Tamil, Tanglish; written by a separate subagent before any tuning):
  first run **33/40 (83%)**, p50 1.2 s, p90 1.8 s. After generic fixes (no phrase hacks): **38/40 (95%)**, p50 1.2 s,
  p90 1.7 s. The second number is no longer independent.
- **Unseen set, 20 new phrasings** (held out, never used for tuning): **18/20 (90%)** on its first and only run,
  p50 1.3 s, p90 1.9 s. The two misses: "what's behind the spike in mosquito complaints in Kodambakkam?" (it asked a
  clarifying question) and "rain alert vandhirukku, mission start pannu" (nothing usable).
- **Tokens**: about 3,500-3,600 per sentence (p50). **Which model answered**: on the free tier gpt-oss-120b answered
  about a quarter of the live calls; the rest fell to qwen3-27b and gpt-oss-20b as each model's per-minute allowance ran
  out. The smaller models are less careful (several browser fixes below were for their habits).
- After the live runs I made more generic changes (old v1 "map" and "read" steps become screens; a filter the model
  copies from the console but the sentence never mentions is dropped; a rule naming the rain mission; slots name only
  what the sentence names). These are unit-tested but **not re-measured live**.
- **Tests**: 114 Thunai tests pass (agent scenarios 1-20 with fakes, the catalog, every screen in both languages
  against the spoken-figure rule, insights, local commands, the route's body check). Full suite and build: see the end.
- **Data speed**: every screen builds from the real store in under 2 s (most under 0.5 s). In the dev browser a
  screen took 5-15 s end to end, mostly the dev server compiling after my edits and Groq's queue; a production build
  will be faster (not measured).

## Proven in the browser (`/dev/thunai`, real model calls) — screenshots in `docs/thunai/evidence/`
| Scenario | File |
|---|---|
| 1 severe cases (lane 1 ack, then the screen with KPIs, cards, numbered map) | `s01a-lane1-ack.jpg`, `s01b-severe-cases.jpg` |
| 2 news (Tamil) and English read-aloud with the spoken word highlighted | `s02-news-tamil.jpg`, `s02b-news-read-aloud-karaoke.jpg` |
| 4 reservoir level asked in Tamil, answered in Tamil from the data with its time | `s04-reservoir-tamil.jpg` |
| 6/12 "why is Perungudi so bad" → a clarifying question with buttons | `s12-clarify-buttons.jpg` |
| 7 "open the third one", then "draft action for this" → tray (sandbox, "confirm 1") | `s07a-open-third.jpg`, `s07b-draft-tray.jpg` |
| 8 brief me | `s08-brief.jpg` |
| 9 "only the ones in Royapuram" (instant, no model) | `s09-local-filter.jpg` |
| 11 prepare for heavy rain → mission ends on the flooding screen | `s11-rain-mission-ends-on-stage.jpg` |
| 13 top 3 areas with the most rainfall (honest: all 4 stations read 0 mm) | `s13-rain-ranking-no-rain.jpg` |
| 14 compare Adyar and Ambattur, then "add Perungudi" | `s14a-compare.jpg`, `s14b-add-perungudi.jpg` |
| 15 dengue this quarter (usual range shaded, 6 weeks marked; dark theme) | `s15-dengue-trend-dark.jpg` |
| 16 map the severe cases (empty because of leftover filters → explained → All of Chennai) | `s16a-filters-explained.jpg`, `s16b-severe-all-chennai.jpg` |
| 17 flooding dashboard for this week | `s17-flooding-dashboard.jpg` |
| 18 department-wise performance | `s18-dept-performance.jpg` |
| 19 schools within 1 km of flooding in Adyar | `s19-schools-near-flooding.jpg` |
| 20 table view, pin, save (with the one-tap confirm) | `s20-table-pin-save-ask.jpg` |
| Phone width (375 px), dark theme: no sideways scroll | `phone-dark-filters-explained.jpg`, `phone-dark-all-of-chennai.jpg` |

## Not verified (be careful in the demo)
1. **The real console** (needs your sign-in): all checks ran on the dev stand-in console with the real store and real
   model calls. The wiring in CollectorApp is unchanged from v1 and type-checked; first thing to do is sign in on port
   3007 and run the demo below.
2. **Microphone** was not used (typed input only). **Tamil speech**: the browser pane has no Tamil voice, so Tamil
   lines were shown, not heard. On Windows, install the Tamil voice (Settings → Time & language → Speech) or use Edge.
3. **Export**: the CSV is unit-tested; the PNG export and the download were not clicked (it would write to your
   Downloads). The PNG draws charts and text; the map is shown by its caption (map tiles cannot be copied).
4. **Sending** was not exercised; the dev console cannot send at all. The tray sends only through the existing Take
   action endpoint and only when the draft says "sandbox".
5. **Reduced motion**: the CSS turns every animation off under `prefers-reduced-motion`; this was not emulated.
6. **Live scores** were measured before the last round of generic fixes (see above).
7. Nova Lite (THUNAI_PROVIDER=bedrock) was not called (the AWS key has expired).
8. **Full test suite and production build**: see the last section (the machine was short of memory during the run).

## Reviews done during the build
- A subagent reviewed the UI against the design bar and web guidelines: 24 findings (focus trap, contrast of the accent
  fill, map controls unstyled inside the Stage, charts redrawing on every spoken word, 375 px breaks...). Fixed.
- A subagent reviewed the agent core for correctness and security: 17 findings (spelled-out numbers slipping past the
  figure check, a model "click" that could press Send by name, console steps read as Stage actions, deadline not
  enforced on every call, citizen text in the brief...). Fixed, with tests.

## The 2-minute demo (sign in first; the numbers are whatever the data shows)
1. **Alt+T**, then type or say: **"Show me the severe cases."** The Stage opens: tiles, cards, numbered map. Thunai
   tells you which need you first and who holds them.
2. **"Open the third one."** then **"Draft action for this."** The draft waits in the tray. Say **"Discard"** or
   press it (nothing is sent without "confirm 1").
3. **"Read today's news."** It reads the headlines one by one, the word being spoken lit. Say **"stop"**.
4. **"Compare Adyar and Ambattur this week."** then **"add Perungudi."** Tap **"Why is Adyar higher?"**.
5. **"Department-wise performance."** then **"show it as a table"**, **"pin this"**.
6. **"Schools within 1 km of flooding in Adyar."** Tap **"Draft an alert for the nearest 3"** (tray only).
7. In Tamil: **"செம்பரம்பாக்கம் ஏரியில் எவ்வளவு தண்ணீர் இருக்கு"**.
8. **"Prepare for heavy rain."** It runs the mission and ends on the flooding screen. **Esc** closes the Stage; the
   console stays on the same scope.

## Files
- Server: `src/lib/thunai/{stage,screens,insight,next,data,agent,agentServer,stagelocal}.ts`,
  `src/app/api/collector/thunai/agent/route.ts`, dev twins under `src/app/api/dev/thunai/{agent,tool,draft}`.
- Client: `src/components/collector/app/thunai/{Stage.tsx,stage.css,StageChart.tsx,voice.ts,export.ts}`, wired in
  `Thunai.tsx`; `studio/StudioMap.tsx` gained numbered pins and outlines; `studio/client.ts` reads the Stage's theme.
- Tests: `src/lib/thunai/{agent,stage,agentServer}.test.ts`, fakes in `stagefake.ts`; live: `agent.live.ts` with
  `agent.cases.ts` (run: `set LIVE_GAP_MS=7000&& npx vitest run --config vitest.live.config.ts src/lib/thunai/agent.live.ts`).
- Decisions: `docs/thunai/AGENT_PROGRESS.md`. References: `docs/thunai/REFERENCES.md`.

## Full suite, type check, production build
- **All tests: 1,466 passed, 13 skipped (the existing skips), 0 failed**, in 108 files (before this build: 1,396
  passed). The machine (7.5 GB) ran out of memory for a parallel run while another session's dev server and the
  browser were open, so the suite was run folder by folder in one process; every folder passed.
- **Type check**: clean.
- **Production build**: succeeds (`NEXT_DIST_DIR=.next-agentbuild`, `NODE_OPTIONS=--max-old-space-size=8192`; the
  folder was deleted afterwards). The dev-only routes (`/api/dev/thunai/*`, `/dev/thunai`) return 404 in production.
