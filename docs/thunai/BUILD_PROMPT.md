# Thunai (துணை): build prompt

You are building **Thunai**, a voice pilot for the District IQ **Collector console**. The Collector holds a key (or
the orb) and talks in English, Tamil or Tanglish, and Thunai **operates the dashboard live**: it changes filters,
pages and map views, opens and closes panels, presses any visible control, reads answers aloud, runs short
multi-step missions, remembers what it is told, and never lets anything leave the console without the Collector's
explicit, counted approval.

This feature must win the FarmwiseAI Campus Product Challenge, Task 6. **Reliability beats cleverness**: every
command in the demo must work every time. Every fact in section 2 was read from the code on 2026-10-29. If something
does not match what you find, **trust the code**, note the difference in `docs/thunai/PROGRESS.md`, and adapt.

Two design studies inform this prompt and are kept for reference only:
`docs/thunai/reference/claude-design.md` (detailed: Tamil handling, confidence, golden commands, missions). Use it for
details (Tamil phrases, golden-set ideas); **this prompt decides the scope**. Where they differ, this prompt wins.

---

## 0. How you work (read first)

1. **Be the best engineer in the world, and be honest.** Never claim something works unless a test or a browser
   check proves it. Never invent a file, function, prop, API, package or version: open it and read it first.
2. **Rules first, AI second.** At least 80% of commands are understood by code alone (no AI call). Nova Lite only fills
   a typed plan for the rest and can only choose actions from the allowed list.
3. **The AI never computes or invents a number.** Every number Thunai shows or speaks comes from data the console
   already holds or from an existing API, and is spoken through a template.
4. **No causal claims.** "Flooding complaints rose 40%; rainfall was also high in these wards" is fine. "Because of",
   "driven by", "due to" are not, unless the source data itself says so.
5. **Small vertical slices.** After each slice: `npx tsc --noEmit --incremental false` clean, `npx vitest run`
   green, `docs/thunai/PROGRESS.md` updated, and a commit on the branch. Never leave the branch broken.
6. **Tests are sacred.** Never delete, skip or weaken an existing test to make something pass. Fix the code.
7. **Blocked? Write it down, do not fake it.** If something needs what you do not have (a key, a sign-in, data that
   does not exist), write the blocker and the exact next step in `PROGRESS.md` and move to the next slice.
8. Work efficiently: read only what you need; do not re-read files you already know.

## 1. Security and project rules (non-negotiable)

- Never read, print, edit or commit `.env*` files or any key, token or password. Never log secrets.
- Never set `AWS_STORE_SAVE`. Never delete or rewrite anything in `data/studio/` or `data/datasets/`.
- Never send a real email or SMS. Run the dev server with `SMTP_HOST=127.0.0.1` and `SMTP_PORT=1`.
- Never open `officer-accounts.local.csv`. Never type, store or repeat any password. Thunai never enters passwords,
  OTPs or CAPTCHAs, and never fills a password field.
- Do not integrate the FarmwiseAI reference systems (the "Initial District Intelligence System" and the Yadadri leave
  portal). The organisers said they are reference only.
- AI: the chatbot stays on Groq (do not change `AI_CHAT_PROVIDER`). Thunai's planner uses the existing gateway with
  `prefer: "bedrock"` (Nova Lite). No new paid service, no Anthropic key in the product.
- `git`: create branch `thunai/pilot` from `main`. Commit at each slice. **Never push. Never merge. Never force.**
- Officers are locked to their department by the server. Build Thunai for the **Collector console only**.

## 2. Verified facts about the code (use these exact names)

Repository `D:\farm\chennai-grievance-portal-main` (Next.js 14, React 18, TypeScript 5.6, zod 3, vitest 3, Leaflet,
ECharts, `@aws-sdk/client-bedrock-runtime`). Path alias `@/` = `src/`.

**Console shell**: `src/components/collector/app/CollectorApp.tsx`.
- `export type PageKey = "overview" | "briefing" | "trends" | "environment" | "studio"`. **Ask District IQ and Ask the
  Map are overlays, not pages**: open the assistant with `setAsk(true)` / the existing `askWith(q)`, and the map
  question with `c.askOnMap?.(q)` or `mapAsk.ask(q)`.
- `export interface Console` (~line 92) is passed to every page as `c={c}`; it is built at `const c: Console =`
  (~line 530). State and actions include: `page, setPage(p)`; `period, setPeriod(p)` (Period from
  `src/lib/collector/intel.ts`: `"daily" | "weekly" | "monthly" | "quarterly"` = last 24 h / 7 / 30 / 90 days, with
  previous-period labels in `PERIODS`); `zone, setZone(1..15|null)`, `zoneName`, `zoneNameOf(z)`; `dept, deptName,
  setDept(code|null)`, `depts: DeptNav[]`; `cat, setCat(c|null)`; `taluk, setTaluk(code|null)`, `talukName(code)`;
  `mapMode, setMapMode("zones"|"taluks")`; `layers, toggleLayer(k)`; `sevTab, setSevTab(s)`; `envSel, setEnvSel(card,
  id)`; `focus, locate(row), highlight(row)`; `setAsk(bool)`; `openInc(id)`; `openAction(id)` (opens the AI-drafted
  instruction to a department officer: a draft, never a send); `openList(preset, title)`; `openNewsAll()`;
  `openStory(s)`; `openZones()`; `openDepts()`; `openFeeds()`; `openSources(tab?)`; `openStories(focus?)`;
  `openMarkets()`; `openPattern(p)`; `openGaps()`; `openReview()`; `openConflict(s)`; `openNearby(e)`;
  `openNextDoor()`; `dayBrief`; `stories`; `conflicts`; `nearby`; `verify(rows)`; `sendBack(row)`; `closeAll()`;
  `layout, setLayout(l)`; `workspaceName, openWorkspace(), saveWorkspace(name), openSavedWorkspace(id)`;
  `toast(msg, kind?, act?)`; `showText(title, md)`; `askOnMap?(q)`. **Read the full interface before using it.**
- Same file: `clearFilters()`, `toggleTheme()`, `openExport()`, `openCustomize()`, the command palette
  (`<Palette … actions={actions} search={searchHits} ask={askWith} askMap={…} />`), and
  `const mapAsk = useMapAsk(...)` (`./askmap/useMapAsk`) with `ask(q)`, `run(plan)`, `draw({ incidentId })`,
  `setGrown(bool)`, `grown`.
- Existing shortcuts you must not break: **Ctrl+K** (Ask District IQ), **/** (palette), **Esc** (close the top layer),
  **PageUp/PageDown** (pages). Thunai: **Alt+T** switches it on/off; **hold Alt+Space** (or hold the orb) to talk.
  Check first that nothing already uses them.

**Voice**: `src/components/collector/app/assistant/speech.ts` (browser Web Speech API): `canListen()`, `canSpeak()`,
`listen(lang: "en-IN" | "ta-IN", onText, onDone, onError): () => void`, `speak(text, lang, onEnd?): boolean`,
`stopSpeaking()`. Reuse it; extend it only if needed (e.g. alternatives, confidence).

**Ask the Map**: `POST /api/map/ask` (`src/app/api/map/ask/route.ts`): `{ text, plan, prev, context: { zone, taluk,
incidentId, ward, drawn }, reword }`, guarded by `assistantSession()`, 40 requests a minute. Thunai calls it only
through `c.askOnMap?.(q)` / `mapAsk.ask(q)`. `POST /api/map/send` sends one approved draft, **sandbox by default**.

**AI gateway**: `src/lib/ai/gateway.ts` `generateJson<T>(c: JsonCall<T>)`: `role`, `name`, `schema` (zod),
`lenient?`, `system`, `prompt`, `temperature`, `maxOutputTokens?`, `abortSignal?`, `user`, `prefer?: "gemini" |
"bedrock" | "groq" | "openai"`, `background?`, `timeoutMs?`, `chat?`; returns `{ object, info }`. Use
`prefer: "bedrock"`, `temperature: 0`, `timeoutMs: 2500`. Read the file for the valid `role` values.

**Server guards**: `collectorSession()` (`src/lib/collector/guard.ts`); `checkRateLimit(key, limit, windowSeconds)`
(`src/lib/rate-limit.ts`).

**Tests**: `vitest.config.ts` runs `src/**/*.test.ts` in the **node** environment (no jsdom, no React Testing
Library). So **all understanding, planning, risk, memory, watch and audit logic lives in plain TypeScript modules with
no React import**, and is unit-tested. The UI is verified in the browser.
- `npx tsc --noEmit --incremental false` · `npx vitest run` · no-AI golden run:
  `AI_PROVIDER=none npx vitest run --config vitest.golden.config.ts`.
- Production build: `NODE_OPTIONS=--max-old-space-size=6144 NEXT_DIST_DIR=.next-thunai npx next build`.

**Dev server**: add to `D:\farm\.claude\launch.json` a configuration `thunai-3007`: runtime `cmd`, args `/c set
NEXT_DIST_DIR=.next-thunai&& set SMTP_HOST=127.0.0.1&& set SMTP_PORT=1&& npm --prefix chennai-grievance-portal-main
run dev -- -p 3007`, port 3007. If the console needs a sign-in you do not have, **do not try to sign in**: verify with
tests, write it in `PROGRESS.md`, and leave the browser check for the owner.

Zone names (Greater Chennai Corporation): 1 Thiruvottiyur, 2 Manali, 3 Madhavaram, 4 Tondiarpet, 5 Royapuram,
6 Thiru-Vi-Ka Nagar, 7 Ambattur, 8 Anna Nagar, 9 Teynampet, 10 Kodambakkam, 11 Valasaravakkam, 12 Alandur, 13 Adyar,
14 Perungudi, 15 Sholinganallur. Use the console's own names (`zoneNameOf`) if they differ.

## 3. What to build (the Keep list)

### 3.1 The orb, the microphone and the subtitles
- An orb at the bottom right (clear of the map controls and the palette). **Alt+T** or a click switches Thunai on
  (it is off at every page load). States, each with a distinct look: off, ready, listening, thinking, acting,
  speaking, asking, waiting-for-approval, blocked.
- **Hold-to-talk by default** (hold Alt+Space or hold the orb; on a phone, tap to start and tap to stop). A **red dot is
  shown only while the microphone is open**; nothing else opens it. An optional **hands-free session** ("stay
  listening") keeps the microphone open with the red dot visible and closes it after 3 minutes of silence.
- **The microphone is paused while Thunai speaks**, so it never hears itself.
- **Live subtitles** (bottom centre, two lines): what was heard (grey while interim, white when final; Tamil in Tamil
  script) and what Thunai did ("Zone 13 · Adyar · weekly · critical").
- **Silence is confirmation**: when the screen change is the answer, Thunai does not speak (a soft earcon plays).
  It speaks only when the answer is not visible (a level, a count, a question) and in at most 18 words.
- **Output modes**: Voice, Visual only (no speech; for phone calls), Quiet (no proactive messages).
- **Earcons** generated with the Web Audio API (no audio files): mic open, done, needs you, blocked.
- **Stop anywhere**: Esc, a click on the orb, "stop", "நிறுத்து", "podhum". **Kill switch**: "Thunai off" or Esc
  twice closes the microphone and stops everything.
- Tamil font: the console's existing Tamil font; Tamil text never smaller than the English beside it. Respect
  `prefers-reduced-motion`. Use the console's existing colour tokens and light/dark themes; do not add a new palette.

### 3.2 The understanding engine (plain TypeScript in `src/lib/thunai/`)
Pipeline (each stage a pure function, each unit-tested):
1. **Normalise** (`normalise.ts`): Tamil script, Latin script and mixed speech into one token stream. Number words to
   integers: Tamil (ஒன்று… இருபது, colloquial ஒண்ணு ரெண்டு மூணு நாலு அஞ்சு… பதினஞ்சு), ordinals (ஏழாவது, ஏழாம்),
   Tanglish (onnu, rendu, moonu, naalu, anju, aaru, ezhu, ettu, ombodhu, pathu), digits in any script. Strip politeness
   words (ஐயா, சார், madam, please, the -ங்க ending) and Tamil case endings (அடையாறை / அடையாறில் / அடையாற்றில் → அடையாறு).
   Map Tamil-script loan words (ஜோன்/சோன் zone, ஃபில்டர் filter, வீக்லி weekly, கிரிட்டிகல் critical, மேப் map,
   லேயர் layer, ஜூம் zoom, கம்பேர் compare, டிராஃப்ட் draft, கன்ஃபர்ம் confirm).
2. **Link entities** (`lexicon.ts`, `link.ts`): pages, periods, zones (number, ordinal, English and Tamil names),
   departments (from `c.depts` at runtime, plus aliases such as "EB" and "Metro Water"), categories (from the data),
   taluks, map modes, layers, panels, verbs (go, show, open, close, change, set, compare, zoom, read, explain, save,
   undo, stop, send, confirm; Tanglish kaatu, maathu, po, open pannu, mattum, illa, sollu, anuppu, nirutthu). Match
   with an alias table, a Latin "skeleton" key (so Thandaiyarpet / Tondiarpet / தண்டையார்பேட்டை meet), and edit
   distance ≤ 2.
3. **Resolve context** (`resolve.ts`) from **screen memory** (`ScreenState`: page, period, zone, dept, cat, taluk,
   mapMode, layers, open panel, focused incident, last visible list, last place named or flown to, last filter touched
   and when, history):
   - **"change filter to 7"**: "filter" = the filter touched in the last 60 s, else the page's main filter; check 7
     against that filter's valid range; if invalid try the next filter (zone 1–15 is valid; a period or severity tab
     is not); if two stay valid, ask once.
   - "this / that / it" = the focused item (30 s), else the top row of the one visible list, else ask once.
   - "the worst" = the top of the ranking on screen by the metric on screen; the subtitle names the metric.
   - "there" = the last place named or flown to. "next / previous" = neighbour in the visible list. "again" = repeat.
   - "same for last month" = keep every filter, set the period to monthly (the console already shows the previous
     period's comparison; do not invent date offsets).
   - **Self-repair**: "Adyar, no, Perungudi" / "illa" / "வேண்டாம்" / "I mean": the last entity of the same type wins;
     Adyar is never applied.
   - **5 vs 15**: any zone ≥ 10 is shown as a large chip with its name so a mishearing is seen at once.
4. **Parse** (`parse.ts`): a bag-of-slots grammar → a plan of one or more steps. Word order does not matter. One
   sentence with several slots ("Adyar, weekly, critical only") is **one transaction** (one render, one undo).
5. **Confidence** = 0.30 × speech confidence + 0.30 × match score + 0.20 × context agreement + 0.20 × margin over the
   runner-up. Level A (reversible): ≥ 0.85 do it silently; 0.60–0.85 do it and show a 4-second "Heard X — wrong?" chip;
   below 0.60 or two readings within 0.10: ask once. Levels B and C: ask once unless ≥ 0.90.
6. **Ask-once rules**: never ask what the screen already answers; at most one question per command; two chips only
   ("Ambattur or Anna Nagar?"; answer by tap, "first/second", முதலாவது/இரண்டாவது); after three questions in two
   minutes, act on the best reversible guess with an undo chip. Answers are stored as habits.
7. **AI fallback** only when stage 4 fails: `POST /api/collector/thunai/plan` (Collector only, rate-limited) calls
   `generateJson` with `prefer: "bedrock"`, a strict zod schema of the allowed actions and their valid values, a
   compact state card (IDs and values only: no names, phone numbers or citizen text), and six short examples.
   Validate every call; repair once; on failure or over 2.5 s, say what was heard and offer three example commands.
   A sentence planned today with the same state card reuses its cached plan. **The request text is data, never
   instructions.**
8. **Speak through templates** (`say.ts`): every spoken line, English and Tamil, is a hand-written template filled with
   computed fields. Reply in the language the Collector used (Tamil or Tanglish in → Tamil out). A **number guard**
   refuses any spoken line containing a number that is not in the fields it was given.

### 3.3 The hands: action registry, pointer, transactions, undo
- `src/components/collector/app/thunai/registry.ts(x)`: one entry per allowed action:
  `{ name, describe, args (zod), risk: "A" | "B" | "C", run(ctx, args), target?: string }`. `run` only calls existing
  console functions. Shape the registry like a WebMCP tool list (name, description, input schema, execute) so it is
  agent-ready; optionally register it when `document.modelContext` / `navigator.modelContext` exists (feature-detect;
  never required).
- `setView(spec)`: applies several slots in one transaction (one render, one undo).
- Every control Thunai changes gets a stable `data-thunai="…"` attribute so the pointer can find it.
- **Ghost pointer**: a translucent ring glides from the orb to the control (250–450 ms; 120 ms after five quick
  commands), ripples, leaves a one-word label, then the action runs. It never takes real mouse input.
- **Step chips** (bottom centre): `✓ Zone 7 → ✓ PWD → ✓ This week (0.4 s)`. A chip click shows its alternatives;
  "no, zone 9" replaces it.
- **Undo / rewind**: before each transaction, snapshot `{ page, period, zone, dept, cat, taluk, mapMode, layers,
  open panel }`. "Undo", "go back", "go back three", **Ctrl+Z** (only when focus is not in a text field) restore in
  order. A rewind rail shows the last 20 snapshots as labelled chips. Approved sends show a lock and are never rewound.
- **Spotlight**: when Thunai speaks a number, the card holding it is outlined and the rest dims by 30% for 2 s.

### 3.4 100% voice control: the universal fallback
- "**show numbers**": a numbered badge on every visible interactive element inside the console (buttons, links,
  inputs, selects, tabs, `[role=button]`, map controls), never on Thunai's own UI. "click 12" or "12" clicks it;
  badges clear after a click or on "hide numbers". "**show names**" / "click Export" clicks the element whose
  accessible name matches (build the list like an accessibility snapshot: role + accessible name + ref).
- "scroll down/up", "top", "bottom", "next page", "close", "close all".
- "type …" dictates into the focused text box; "clear that" empties it. Never into a password field.
- **Coverage**: `src/lib/thunai/coverage.test.ts` checks that every registry action has at least one English and one
  Tamil phrase that parses to it, and that action names are unique. In the browser check, "show numbers" on each page
  must badge every visible control.

### 3.5 Capabilities (minimum; each needs English, Tamil and Tanglish test phrases)
Pages (5) and back / next page / scroll / close / close all · filters (zone by number, ordinal or name; department;
category; taluk; period; severity tab; clear filters; "same for last month") · map (zones/taluks, layers on/off, "zoom
there") · panels (latest news, developing stories, conflicts, only-in-the-news gaps, next door, markets, zones,
departments, data sources, review, workspace, export) · lists ("open the worst", "the third one", "next one", "read the
top five") · incidents (open, "draft action for this" → `openAction`, "is this a pattern?" → `openPattern`) · Ask
District IQ ("ask District IQ …" → `askWith`) · Ask the Map ("schools within 1 km of flooding", "nearest hospital to
this" → `c.askOnMap`) · settings (dark/light, Tamil/English, voice/visual/quiet, slower/faster) · workspaces (save as,
open) · conversation (stop, repeat, shorter, undo, "what did you just do?", "what am I looking at?", "explain this
chart") · approvals ("send it", "confirm two") · memory ("remember…", "what do you remember?", "forget that").
- "**What am I looking at?**" answers from the screen state: page, filters and the headline numbers on screen.
- "**Explain this chart**": the chart's title, its largest and smallest values and the change against the previous
  period, read from the chart's own data. Two factual sentences.

### 3.6 Approval tray (trust)
- Every level B and C action becomes a **tray card** (recipients, full text, evidence chips). Level B: one tap or "yes".
  Level C (anything that reaches a person): the Collector must say **"confirm" plus the count** ("confirm two",
  "உறுதி இரண்டு") matching the tray; "confirm" alone or a wrong count is refused. The card stays on screen at least
  2 s before a confirm is accepted. One approval never covers a later batch.
- Sending uses **only existing sandboxed paths** (for example `POST /api/map/send`, sandbox by default). Read each send
  path first and confirm it is sandboxed in dev; if a path is not clearly sandboxed, the tray marks the card
  "approved — send from the incident panel" and does not send.

### 3.7 Audit trail
- Append-only `data/thunai/audit.jsonl` (add `data/thunai/` to `.gitignore`), one line per event: id, time, actor,
  what was heard (text only, never audio), the plan, risk level, approvals, outcome, and the SHA-256 of the previous
  line (a hash chain, so any edit breaks it). "Show the trail" opens a timeline. Unit-test the chain.

### 3.8 Memory (JARVIS remembers)
- Per Collector user on the server: `data/thunai/<userId>.json` through a small Collector-only API. Kinds: **notes**
  ("remember that Zone 13 is my priority this monsoon"), **habits** (ask-once answers; repeated corrections become
  personal aliases labelled "learned"), **preferences** (language, voice speed, output mode), **reminders** ("remind me
  Friday at 10 to check the Velachery drain": a toast when the console is open at that time), **recent commands** (last
  200: "what did I ask yesterday?", "continue where we stopped").
- "What do you remember?" opens a memory viewer; "forget that" / "forget everything" deletes (the audit trail stays).
  Memory only sets defaults and reminds; it is never presented as data, and it never changes a risk level.

### 3.9 Watch: speaking first, rarely
- Signals only from data the console already has: a new **severe** item in the alerts lane; an overdue critical action;
  a story carried by several outlets with no department record (the existing gaps); the Collector's own Data Studio
  "tell me when" alerts; a due reminder; and a 07:00–10:00 first-open greeting with counts from the overview data.
- Score = impact × urgency × confidence × novelty × actionability (0–1). Bands: below 0.25 digest only; 0.25–0.55 a
  silent chip; above 0.55 a chime and one line; life-safety above 0.8 also a banner until acknowledged.
- Budget: at most 4 spoken alerts a day and 1 per 20 minutes; one alert per item, updated in place; no repeat for 2
  hours unless it worsens; no voice within 30 s of the Collector speaking, in Quiet mode, or 22:00–06:00 (except
  life-safety). Every alert has a "why now?" chip. Unit-test the scoring and the budget.

### 3.10 Two missions (multi-step, visible, interruptible)
A mission is a list of steps shown as a strip; step 1 saves a snapshot; "stop" halts at the next step; numbers are read
from the screen when the mission runs; it only fills the tray, never sends.
- **Morning brief**: open Briefing, read the day brief's key points one by one (from `c.dayBrief`, through templates),
  offer "show the first one".
- **Rain readiness** ("prepare for heavy rain" / "நாளைக்கு கனமழை வருது, தயார் பண்ணு"): Environment (rain and reservoir
  cards, with their as-of times) → Overview with the waterlogging/flooding category and the daily period → Ask the Map
  hotspots for flooding → the review list of overdue items → drafts with `openAction` for the top items (at most five)
  into the tray → stop at the gate: "N drafts. Say confirm N." Stale data is shown in amber and named aloud.

## 4. Cut list (do NOT build in this run; list under "Later" in the report)
- Anything needing data District IQ lacks: motor pumps and engineers, field photos, contractor breakdowns, slum-board
  layers, WhatsApp, biometric sign-off.
- Split-screen maps, hexagon heatmaps, new chart types, date offsets beyond the console's periods, two-series compare.
- Meeting mode (projector/console windows, fact-check whisper), Presenter, Drive and Tour modes; the VIP-visit, Monday
  review and CM video-conference missions.
- The "right hand" on other websites (SACHET, IMD, CFM-DSS, AGMARKNET recipes, mock department portal, injection
  shield, self-healing locators, encrypted vault changes), evidence screenshots and "show proof".
- Wake word ("Hey Thunai"), voice barge-in by VAD, server-side speech (Nova Sonic, AI4Bharat, Bhashini, Sarvam),
  preview-while-speaking, habit "sequences" and "defaults by time", Thunai on the officer console.

## 5. Verify these references before relying on them (`docs/thunai/REFERENCES.md`)
For each: open it, confirm it exists and is current, note the licence, the exact API names used as a pattern, and
whether you adopted it (code, pattern only, or not). **Prefer patterns over libraries. Add no npm dependency unless it is
small, permissively licensed, maintained and clearly needed; write the reason.**
- Microsoft JARVIS / HuggingGPT (plan → choose tool → execute → respond): https://github.com/microsoft/JARVIS
- CopilotKit (readable app state, actions, human approval): https://github.com/CopilotKit/CopilotKit
- WebMCP (pages expose tools to agents): https://w3c-cg.github.io/aikr/webMCP/webmcp-technical-notes.html
- Playwright MCP accessibility snapshots with refs: https://playwright.dev/mcp/snapshots
- Apple Voice Control "show numbers / names / grid": https://support.apple.com/en-asia/guide/mac-help/mchl26854b08/12.0/mac
- Stagehand observe → act → extract, self-healing (Later): https://docs.stagehand.dev/
- Silero VAD in the browser (Later): https://github.com/ricky0123/vad
- openWakeWord in the browser (Later): https://www.pkgstats.com/pkg:openwakeword-wasm-browser
- Chrome on-device speech recognition (`processLocally`): https://groups.google.com/a/chromium.org/g/blink-dev/c/VNOok2dbmHM
- Amazon Nova 2 Sonic languages (no Tamil): https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-language-support.html
- AI4Bharat IndicConformer Tamil ASR (Later): https://huggingface.co/ai4bharat/indicconformer_stt_ta_hybrid_ctc_rnnt_large
- Pipecat / LiveKit interruption handling (Later): https://livekit.com/blog/best-open-source-voice-and-video-ai-agent-frameworks
Also search GitHub for 3–5 more open-source voice-control or in-app copilot projects (for example voice command
libraries such as annyang, and open-source assistants such as Leon or OpenVoiceOS), read how they handle ambiguity,
undo and confirmation, and note any idea worth adopting. Verify; do not assume.

## 6. Build order (14 hours; demo-ready at hours 5, 9 and 14)
1. **H0–1**: branch, launch config, read the files in section 2, `PROGRESS.md` (plan, facts that differ),
   `REFERENCES.md` skeleton, `.gitignore` for `data/thunai/`.
2. **H1–4**: `src/lib/thunai/` normalise, lexicon, link, resolve, parse, confidence, risk, say (templates + number
   guard), with a **golden set of 150 commands** (60 English, 50 Tamil, 40 Tanglish), each with a start state and the
   expected plan, covering single and multi-slot commands, follow-ups, self-repair, 5 vs 15, ambiguity (ask once) and
   refusals ("delete all incidents" → refused, no state change). Ideas for phrases: `docs/thunai/reference/claude-design.md`
   sections 4 and 11.
3. **H4–5 (demo 1)**: orb, hold-to-talk, subtitles, registry for pages + filters + map + panels, `setView`
   transactions, pointer, chips, undo. A typed command bar under the orb works even without a microphone.
4. **H5–7**: Voice/Visual/Quiet modes, earcons, Tamil replies, the "wrong?" chip, ask-once chips, the kill switch.
5. **H7–9 (demo 2)**: show numbers / show names / click, scroll, close, typing; coverage test; "what am I looking at?";
   "explain this chart"; approval tray with confirm-plus-count; audit trail.
6. **H9–11**: Nova Lite fallback route + validation + repair + timeout + plan cache; tests with the AI mocked (no network
   in tests).
7. **H11–12**: memory (store, viewer, forget, reminders, habits and learned aliases).
8. **H12–13**: Watch v1 (scoring, bands, budget), the two missions, spotlight.
9. **H13–14 (demo 3)**: browser check at 1440 px and 390 px, light and dark, English and Tamil; production build;
   `docs/thunai/REPORT.md`; the demo script.
**If late, cut in this order**: rain-readiness mission → Watch → reminders → spotlight → rewind rail (keep voice undo).
**Never cut**: tests, undo, risk levels, the approval tray, the number guard, the audit trail.

## 7. Definition of done
- `npx tsc --noEmit --incremental false` clean; `npx vitest run` green with no existing test removed or skipped; the
  no-AI golden run passes; the production build succeeds.
- Golden set (text): ≥ 95% English, ≥ 90% Tamil, ≥ 90% Tanglish correct by rules + mocked AI; ≥ 80% by rules alone.
  Report the real numbers, failures included.
- Rules path in a unit benchmark: p50 < 50 ms, p90 < 150 ms for parse + resolve. AI path p90 < 2.5 s measured on the
  dev server if Bedrock answers; if it does not, say so.
- Safety tests: a level C action never runs without the matching spoken count; "confirm" without a count is refused;
  no action outside the registry can run; the number guard rejects an invented number.
- Browser check (if a Collector session is available): the demo below runs with no console errors; "show numbers"
  badges every visible control on each page.
- `docs/thunai/REPORT.md`: what was built, the numbers, screenshots taken, known gaps, the Later list with references,
  and the exact demo steps.

## 8. The 2-minute demo (by voice; numbers are whatever the data shows)
1. "Thunai on." Hold Alt+Space: "Show the worst flooding." → category set, top incident opens, map flies. Silent.
2. "Change filter to 7." → "Zone 7 · Ambattur" chip; every panel updates.
3. "Adyar, weekly, critical only." → three slots, one transaction. Then "Ambattur… illa, Anna Nagar kaatu." → the pointer
   starts towards Ambattur and turns to Anna Nagar.
4. "செம்பரம்பாக்கம் நீர்மட்டம் என்ன?" → the reservoir card opens; one Tamil line with the level and its as-of time.
5. "Schools within 1 km of flooding here." → Ask the Map answers on the map.
6. "Explain this chart." → two factual sentences. "Show numbers." → badges; "click 4".
7. "Remember that Zone 13 is my priority this monsoon." → saved; "what do you remember?" → the viewer.
8. "Prepare for heavy rain." → the strip runs; drafts land in the tray; "Say confirm three." → "confirm" is refused;
   "confirm three" sends through the sandbox.
9. "Go back three steps." → the screens rewind. "Show the trail." → every action and the one approval. "Thunai off."
