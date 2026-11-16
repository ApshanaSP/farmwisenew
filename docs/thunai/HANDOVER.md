# Jarvis mode: handover

## v5 (15-17 Nov 2026)

Branch `claude/jarvis-v5-build-dfece7`, cut from `origin/main` at START `f830efbd` (the v4 code at `40ff9082` plus two non-Jarvis commits). The brief is `docs/jarvis/JARVIS_V5_BUILD_2.md`. **Not merged, no PR: the owner decides.** Numbers: `chennai-grievance-portal-main/eval/RESULTS.md` (v5 section on top). The day's record: `docs/thunai/BUILD_LOG.md`. Deploying Haiku: `docs/jarvis/DEPLOY_HAIKU.md`. The room check and demo: `docs/jarvis/DEMO.md`. Oracle changes: `docs/qa/pass7/V5_EXPECTED_CHANGES.md`. Review: `docs/jarvis/BUILD_REVIEW_FINDINGS.md`.

**Read this first.**
- **Claude was not called at all, by design** (owner: build and test on Groq, add the Haiku key at deploy). The Haiku-first ladder is built and tested with mocks; the deploy check is built and never run.
- **Understanding did not move on Groq.** Final live-60 on the shipped ladder: **36/60** (60.0 %, 47.4-71.4), Tamil 14/30, against v4's 39/60 on the same sentences (paired b 4, c 7, p 0.55: no difference shown either way); new intents 7/28 clean (25.0 %, 12.7-43.4) against v4's 6/29. The targets (52/60, Tamil 26/30, new intents 75 %) are **not met**. The grid selected no planner change, so the planner prompt is v4's.
- **Nothing was tried with a real microphone in a real room**, again.

### Owner actions (first)

1. **Turn on Groq Zero Data Retention** (console, Data Controls). This build assumed it is off. Groq keeps nothing by default but may keep logs up to 30 days (B, https://console.groq.com/docs/your-data).
2. **Fix the Anthropic key** (it returned 401 on 15 Nov 2026), make sure `JARVIS_CLAUDE_OFF` is not set, then run the deploy check exactly as `docs/jarvis/DEPLOY_HAIKU.md` says and set the env lines it prints. It stops at $0 if the key is refused and caps itself at US$0.50.
3. **Know the free-tier ceiling:** Groq's free plan (8K tokens a minute, 200K a day per model, checked from the response headers) carries about 69 planner calls a model a day at about 2,880 tokens a call, about 208 over the three models: **it cannot carry 300 planner turns a day.** Haiku at deploy is the capacity answer (a 429 is a capacity failure, never a wrong answer).
4. **Decide on IndicConformer's weights** (free local Tamil hearing, B5): the MIT licence file is in AI4Bharat's GitHub repository; the Hugging Face weights are gated with only a `license:mit` tag, and every runnable export is an individual's. Measured, not wired: on 200 FLEURS read-Tamil clips the OpenVoiceOS fp32 export of the 120M Tamil IndicConformer passes every B5 gate (WER 29.1 against forced-Tamil Groq's 56.4; a 6 s clip in p50 270 / p90 317 ms at 4 threads; 674 MB), but it loads in sherpa-onnx only after four metadata entries are appended to a copy, and it has a `license: mit` tag and no licence file. Every int8 export failed the speed gate on this CPU (p50 1,020-2,750 ms). Figures: `eval/RESULTS.md`, "Free local Tamil decode (B5)".
5. **Decide whether to open a free Cloudflare Workers AI account** as an overflow speech pool (zero retention by default: B, https://developers.cloudflare.com/workers-ai/platform/data-usage/). Not created, not built.
6. **Decide whether Gemini TTS may stay on the free tier** (the app's second voice): free-tier content is used to improve Google's products (B, https://aistudio.google.com/docs/pricing). Unchanged.
7. **The decisions of section 3.1**, with what was measured: 

| Decision | Built with (the brief's default) | What was measured, for the choice |
|---|---|---|
| Drop the unengaged command tier | Dropped; `JARVIS_GATE_COMMAND_TIER=1` restores it | Shipped: side talk with Jarvis idle 0/60, 0/40, 0/200; unnamed commands refused 40/40 and 60/60. With the old tier: 4/60, 17/40, 21/200 acted; commands accepted 35/40 and 55/60 |
| A small-model veto on the gate | Off, not built | Engaged window (5 s after Jarvis's turn): 14/60, 6/40, 58/200 side lines acted, all at tier 2 (no model) |
| Licence tag in place of a licence file (embedding routers) | Not accepted; the n-gram router is the only one | Route-then-fill (G) on the n-gram shortlist did not beat the v3 prompt (A) on the grid |
| Which Claude model leads | `claude-haiku-5-5`, thinking disabled; `JARVIS_PLANNER_LEAD=groq` puts it after Groq; Opus never first | Nothing live (no Claude call by design); the deploy check measures it |
| IndicConformer weights (B5) | Measure only; nothing wired | The OpenVoiceOS 120M fp32 passes all four gates (WER 29.1 against Groq's 56.4; p50 270 ms; 674 MB) after its metadata is appended; every int8 export fails the speed gate here |
| Cloudflare Workers AI account | Not created, not built | — |
| Gemini TTS on the free tier | Unchanged | — |
| Groq Zero Data Retention | Assumed off | — |
| On-device wake word | Not shipped (the install broke Silero's runtime path: see "What was cut") | — |
| `echoCancellation: "all"` | Default `true`; `NEXT_PUBLIC_JARVIS_ECHO=all` | Nothing in a room; the room check compares them |
| Groq ladder order | Unchanged | Not ranked: the grid compared prompts on each model, not the models. On the final live-60 the model that answered scored qwen 15/20, gpt-oss-120b 4/8, gpt-oss-20b 0/6 (small n, different sentences: not a ranking) |
| Whether "≤ 2,500 planner tokens" counts the schema | Three counts reported | Code's count without the schema: screens about 1,220, wide about 1,890. Provider input with the schema: about 1,600-2,200 a call. Final live-60, provider input + output a turn: p50 1,803, p90 4,126 (4 over 2,500, all Tamil) |
| Sets, gazetteer, spoken metric names | Model-drafted (no owner file at the paths) | Labelled "model-drafted, not checked by a Tamil speaker" |


### What shipped (each with a test that failed first where it fixes a defect)

- **The address gate (C1):** with Jarvis idle, an unnamed command is refused; the bare stop word still acts. Both command-tier returns come back only with `JARVIS_GATE_COMMAND_TIER=1` (and `NEXT_PUBLIC_JARVIS_GATE_COMMAND_TIER=1` in the browser). Side talk with Jarvis idle: 0/60, 0/40, 0/200 acted; unnamed commands refused 40/40 and 60/60. Inside the 20 s window after an answer, request-shaped lines still act (side talk there: 14/60, 6/40, 58/200).
- **Captions only while engaged (C3)**; a strict audio gate behind a flag, off (C4); Silero's 64-sample context (D1); echo cancellation `true` by default, `"all"` by flag, shown only in the measurement view (D2).
- **Speech-to-text:** the Gemini third racer is gone (B1); the echo guard uses the decode's own confidence and never drops a one-word answer to a pending question (B2, wired end to end); a keep-alive connection to Groq (E3, on: p50 316 → 245 ms on 6 + 6 Whisper requests); a gazetteer corrector, off (B3).
- **No digit reaches any voice (F1):** numbers are said in words in the sentence's language after the number gate (Tamil number words model-drafted, not checked by a Tamil speaker); counts are said as numbers, codes digit by digit.
- **Capacity honesty:** the token estimate counts the schema (A2); a strict-mode 400 gets one retry on the same model, then the next (A5); Gemini's "too many states" schema refusal falls back to plain JSON so the last rung can answer.
- **Haiku-ready (A6):** `claude-haiku-5-5` leads when a working key is present (`JARVIS_PLANNER_LEAD=groq` puts it after Groq); thinking always disabled, effort `low` (or `medium`), no sampling fields, `max_tokens` 600; a 401/403 skips Claude for 10 minutes; Opus only by explicit env and never first; the compact plan for the Claude rung (A7, off); the deploy check and `docs/jarvis/DEPLOY_HAIKU.md`. **No live Claude call was made.**
- **Planner prompt:** unchanged by default. The grid selected no prompt change, so the schema diet and conditional context (A1/A1b) ship behind `JARVIS_PLANNER_DIET`, off; route-then-fill (A3) is built and not wired. Metric names in code (A4) for the four metrics that can show a change.
- **Memory (G3):** notes carry their source, time and turn; a note copied off the Stage's news or complaint text, or not said by the Collector, is refused; old notes without a source stay listed but never reach a prompt.
- **D3:** with `NEXT_PUBLIC_JARVIS_DUCK_PAUSE=1` the duck no longer uses `pause()`/`resume()`; a backchannel after a cut resumes the answer.
- **Measurement:** the per-stage trace (timings only, zero at the last voiced sample) in the specs and the measurement view; the statistics module; the per-turn record of every live run; the diagnosis grid; frozen `eval/dev200` and `eval/sidetalk200`.

### What was cut, and why

| Item | What happened | Why |
|---|---|---|
| E2 early speech-to-text | Built, **default off** (`NEXT_PUBLIC_JARVIS_EARLY_STT=1`) | In real run 2, two English clips that decode right whole came back as Tamil when their early upload was used; owed: a real run and the room check |
| C5 on-device wake word | Not shipped | Installing `@livekit/wakeword@2.1.2` moved `onnxruntime-web` out of the top-level `node_modules`, which the page's `/thunai-ort/` route reads: Silero would not load. Today's browser wake stays |
| A3 route-then-fill | Built, not wired | Grid cell G did not beat cell A |
| A1/A1b | Built, default off | No row of the grid's reading selects them |
| F2 Edge voice start | Moved to the room check | The Playwright-launched Edge lists no natural voice and no Tamil voice |
| B5 wiring | Not wired | The brief says measure only; the one model that passes needs its metadata added before it loads and has a tag-only licence (the owner's decision). Not tried on Tanglish or a microphone |
| Grid cells C and F, a same-day rerun of B | Owed | The ledger could not fit the whole grid; D and E ran on day 2 |

### Environment variables (v5)

| Variable | Default | What it does |
|---|---|---|
| `JARVIS_GATE_COMMAND_TIER` / `NEXT_PUBLIC_JARVIS_GATE_COMMAND_TIER` | off | `1` restores v4's unengaged command tier |
| `NEXT_PUBLIC_JARVIS_STRICT_AUDIO_GATE` | off | `1`: no audio leaves the browser unless Jarvis is woken or engaged (then only "Jarvis" said inside the window is heard: keep off until an on-device wake ships) |
| `NEXT_PUBLIC_JARVIS_VAD_CONTEXT` | on | `0` turns off Silero's 64-sample context |
| `NEXT_PUBLIC_JARVIS_ECHO` | `true` | `all` asks for `echoCancellation: "all"` |
| `NEXT_PUBLIC_JARVIS_EARLY_STT` | off | `1` turns on the early upload (E2) |
| `NEXT_PUBLIC_JARVIS_FALSE_CUT_MS` | 2000 | with the duck-pause flag, how long a cut voice waits before it re-speaks (a figure not checked) |
| `JARVIS_GAZETTEER` | off | `1` corrects place names after the decode |
| `JARVIS_KEEPALIVE` | on | `0` uses the built-in fetch for Groq |
| `JARVIS_PLANNER_DIET` | off | `1`: the schema diet and conditional context |
| `JARVIS_PLANNER_LEAD` | `haiku` | `groq` puts Groq first and Haiku after it |
| `JARVIS_CLAUDE_MODEL` | `claude-haiku-5-5` | Opus only by naming it; it then goes after the Groq ladder |
| `JARVIS_HAIKU_EFFORT` | `low` | `medium` allowed |
| `JARVIS_PLAN_COMPACT` | off | `1`: the compact plan on the Claude rung |
| `JARVIS_CLAUDE_OFF` | off | `1` stops every call to Anthropic (the build's live runs used it) |
| `JARVIS_LADDER_PIN` | unset | evaluation only: `anthropic` gives the Claude rung alone |

### What each hosted service retains

- **Groq:** nothing by default; logs up to 30 days; a Zero Data Retention switch in the console (B, https://console.groq.com/docs/your-data). Assumed off.
- **Anthropic API:** prompts and outputs not retained by default for Haiku 5.5; flagged chats up to 2 years (B, https://platform.claude.com/docs/en/manage-claude/api-and-data-retention). Whether that can be turned off: not found.
- **Edge online voices:** text and audio deleted after conversion (B, https://learn.microsoft.com/en-us/microsoft-edge/privacy-whitepaper).
- **Gemini free tier:** used to improve Google's products (B, https://aistudio.google.com/docs/pricing).

### Runs owed (each with its exact command, from `chennai-grievance-portal-main/`)

1. **The deploy check** (the owner, once the Haiku key works; Claude, at most US$0.50): `HOLDOUT=deploy-haiku npx vitest run --config vitest.live.config.ts src/lib/thunai/deploy.live.ts` (see `docs/jarvis/DEPLOY_HAIKU.md`).
2. **Pair the new-intents run with v4's** (the owner, who may look in `eval/holdout3/results/`: this build did not): `HOLDOUT=pair HOLDOUT_DIR=holdout3 PAIR_X=v5final-planner3-live30.json PAIR_Y=<v4's planner3 live30 file> npx vitest run --config vitest.live.config.ts src/lib/thunai/holdout.live.ts` (no model; counts only).
3. **The repeats for pass^3** (20 of the live-60 by a seeded shuffle; about 173K Groq tokens): `JARVIS_CLAUDE_OFF=1 HOLDOUT=planner2 HOLDOUT_DIR=holdout2 HOLDOUT_SET=rep20 HOLDOUT_TAG=v5final-r1 npx vitest run --config vitest.live.config.ts src/lib/thunai/holdout.live.ts`, then `-r2` and `-r3`, then `HOLDOUT=passk HOLDOUT_DIR=holdout2 PASSK_FILES=v5final-r1-planner-rep20.json,v5final-r2-planner-rep20.json,v5final-r3-planner-rep20.json npx vitest run --config vitest.live.config.ts src/lib/thunai/holdout.live.ts`.
4. **The dev set** (575,600 tokens a pass: more than a free day; the runner refuses a run that cannot finish): `JARVIS_CLAUDE_OFF=1 HOLDOUT=planner2 HOLDOUT_DIR=dev200 HOLDOUT_SET=live60 HOLDOUT_TAG=v5dev npx vitest run --config vitest.live.config.ts src/lib/thunai/holdout.live.ts`.
5. **Grid cells owed** (diagnosis; about 50K tokens each): `GRID=run GRID_RUN="openai/gpt-oss-20b:C" GRID_N=15 npx vitest run --config vitest.live.config.ts src/lib/thunai/grid.live.ts`; `GRID_RUN="qwen/qwen3.8-27b:F" GRID_N=15`; a same-day rerun of B: `GRID_RUN="openai/gpt-oss-20b:B" GRID_N=15` (copy `grid-B-openai-gpt-oss-20b.json` aside first: the run replaces its rows); then `GRID=pairs`.
6. **A real run on the shipped defaults** (E2 off; about 15K Groq tokens and 12 Whisper requests): build `NEXT_DIST_DIR=.next-agentbuild NEXT_PUBLIC_JARVIS_SPEC=1 npx next build`, start `npx next start -H 127.0.0.1 -p 3012` with `NEXT_DIST_DIR=.next-agentbuild NEXT_PUBLIC_JARVIS_SPEC=1 JARVIS_CLAUDE_OFF=1 JARVIS_PLANNER_LEAD=groq AI_PROVIDER=none AI_FORCE_PROVIDER=none AI_FALLBACK_PROVIDER=none AI_CHAT_PROVIDER=none` and the dry-run store settings of `playwright.config.ts`, then `SPEC_PROD=1 REAL=1 PW_CHANNEL=msedge npx playwright test tests/e2e/real.spec.ts`. Then the same with `NEXT_PUBLIC_JARVIS_EARLY_STT=1` built in, to see whether E2's language flips hold.
7. **The five-minute real-room check** at the top of `docs/jarvis/DEMO.md`.

### Monthly cost with Haiku leading (300 turns a day)

About **$3.42-$4.45** (2,650 tokens in and 230 out a turn; floor and +30 % tokenizer), about $2.75-$3.57 with the compact plan (prices: B, https://platform.claude.com/docs/en/about-claude/pricing). The deploy check's own cost is capped at US$0.50 (about $0.15 expected).

### Running the gates in a new worktree

- Copy `data/aws-cache/qa/` (`pinned/`, `golden/`, `durable.sqlite` **and the matching `test-collector.txt`**) and `data/thunai/` from a worktree that gated; the main checkout has none of them.
- `tests/qa/pass7/gate-fast.sh` waits on a lock folder from an earlier session (`gate-fast.sh:21`): its parent must exist and no stale `vitest-4599.lock` may be left.
- Commit everything first: the gate checks out `tsconfig.json`, `next-env.d.ts` and evidence files.
- `g2-cache` RC-35 can time out at 180 s under the full gate; alone it passes.
- `tests/qa/seed-local-users.mjs` stops with `no such function: pii_enc` on a server database since START's PII commit (`f830efbd`, before v5): the encrypting triggers call a function only the app registers. The access matrix still gave the same cells as v4's gate. Not fixed here (not Jarvis).
- Under both lanes the machine is loaded: one unit test's time bound (the B1 race) met 3,050 ms in the UTC run; its margin is now 4.5 s.
- **The Jarvis browser specs spend Groq quota through the console's translator** unless the dev server runs with `AI_PROVIDER=none` (now set in `playwright.config.ts`, with `JARVIS_CLAUDE_OFF=1`). Nothing else may hold port 3011.
- **Never run `npm ci` while a vitest or esbuild process is alive** (a locked `esbuild.exe` stops it after it has deleted part of `node_modules`; `npm install` from the lockfile restores it).

### Known limits

- **Nothing was tried with a real microphone in a real room**, again.
- **Inside the 20 s window after an answer, request-shaped side talk still acts** (up to 29 % of look-alike lines), and level B or C needs only a spoken yes. No speaker identification.
- **The free Groq tier cannot carry 300 planner turns a day**; under load the ladder now refuses a call it knows would pass the minute's allowance (A2), and the turn falls to flash-lite or to "can't reason right now".
- **Whisper's race picks Tamil for some English sentences** ("Go to the trends page", on START too).
- **Tamil number words, Tanglish metric names and the gazetteer's Tamil spellings are model-drafted**, not checked by a Tamil speaker.

## v4, "Ultimate Jarvis" (15 Nov 2026)

Branch `claude/priceless-bouman-2fe7f8`, cut from `main` at `38d96d2f`. The brief is `docs/jarvis/ULTIMATE_JARVIS.md`. **Not merged and no PR: the owner decides.** Numbers are in `chennai-grievance-portal-main/eval/RESULTS.md` (v4 section on top), the day's record is in `docs/thunai/BUILD_LOG.md`, how Jarvis speaks is in `docs/jarvis/PERSONA.md`, and the demo with its five-minute room check is in `docs/jarvis/DEMO.md`.

**Read this first.**
- **The Anthropic key on this machine is refused** (401 `invalid x-api-key`, 15 Nov). Claude never answered a single live call in this build, so every live figure is Groq first. Put a valid `ANTHROPIC_API_KEY` in `.env` and Claude goes first again with no code change. The ladder skips a refused key after one fast call.
- **Nothing has been tried with a real microphone in a real room**, again. All voice figures come from injected audio.
- **Understanding did not improve on the frozen sets, and the live-60 score fell.** On live-60 the Groq ladder scored 39/60 against `main`'s 44/60 (both runs on the same Groq ladder; paired 3 newly right, 8 newly wrong, not significant). On the new holdout3 set, a sample of 30 scored 6/29 on `main` and 6/29 on v4. The new abilities work when asked plainly (see the probe in RESULTS), but loose held-out phrasing does not reach them. Read the RESULTS section before quoting anything.

### What shipped

- **Truth first.** The speakable figure set is built only from block data and code text (`speakable.ts`). Model text slots have their figures stripped. A 1,000-case property test failed with 456 leaks on the old code and passes now. A line chart is a line. Tamil screens carry Tamil titles, block titles, notes and units.
- **The planner.**
  - Every bundle can look facts up.
  - Reads run in parallel, and code fills the answer with no second model pass unless a read failed ("stop at tools").
  - Console steps come back for act, observe, act. The screen's digest goes back too, scrubbed of phones, Aadhaar, e-mails and quoted words.
  - Memory and the last four turns reach the prompt as untrusted text.
  - Speech confidence and language steer the reply.
  - Commands get 8 s; analysis questions and missions get 25 s, with progress.
  - Likely reads start while the planner thinks.
- **A streamed turn.** `/agent/round` answers NDJSON with AG-UI event names (`events.ts`). The browser puts the screen up and speaks sentence 1 as soon as they arrive.
- **The ears.**
  - First good decode wins, and Whisper gives up at 5 s.
  - Gemini races in parallel only when the ledger allows.
  - Each language gets its own prompt, built from the lexicon and the open screen's names.
  - An English decode that translated confident Tamil cannot win.
  - `/hear` gives up after 6 s, and a split sentence is never posted twice.
  - End of utterance adapts: 300 ms when the words read complete, 650 ms after a connective.
  - The browser asks for `echoCancellation: "all"`, with a fallback.
  - Captions run only while an engaged turn is heard.
  - Barge-in ducks the voice and stops it only on two real words or 600 ms of held speech. Backchannels let it carry on, in EN, TA and Tanglish.
- **The mouth.**
  - One TTS request per answer, and one voice per turn.
  - A short earcon at the end of speech.
  - A numberless acknowledgement, spoken only if nothing is ready by 1.2 s.
  - Lakh and crore in speech.
  - Gemini TTS streaming is built behind `JARVIS_TTS_STREAM=1`, off and unverified.
- **Understanding.**
  - A typed metric registry: the planner names metrics, code computes them.
  - "What changed since yesterday / this week", split by zone, kind and department, with share of change, a surprise score and a band. It says "linked with", never "caused".
  - "Explain this one".
  - A situation view of a place.
  - A dialogue register: "the second one", "that Velachery one", "and in Adyar?". A past window said as a follow-up ("same for last week") goes on to the planner, as on `main`.
  - "How do you know?", which reads method, n, period, sources and caveat.
  - A one-slot clarify with three options.
  - About 120 more Tanglish forms, and TNEB/EB → TANGEDCO.
- **Behaves like an aide.**
  - A count-aware rise detector (after Noufaily et al. 2013) and real server-side signals.
  - The brief on power-on and on "brief me". It is finite and always ends.
  - Interjections only when nobody is speaking and no turn runs, at most three an hour.
  - Tell me / Later / Not about this.
  - Follow an incident or zone.
  - Composable missions with a plan card, Start, narrated steps with real times, stop, skip and instead-do-X. Drafts go to the tray only.
  - A decision record and "what did you do today?".
  - Memory that is opt-in, viewable and resettable. It refuses notes that read as orders (MINJA).
- **The HUD, on the teammate's light bar.**
  - One visual state machine and a mic-hot cue.
  - The core is docked and throttled to 15 fps when idle.
  - Captions in the bar, one progress line with real times, and an evidence chip.
  - Mission and interjection cards, and one history entry point.
  - Polite, debounced announcements.
  - The listen key is now `Ctrl+Shift+Space`, because Alt+Space opens the Windows window menu.

### What was cut, and why

| Item | What happened | Why |
|---|---|---|
| STT probe of `gemini-3.5-transcribe-live` | Not run | The 100 SLR65 clips are not on this machine; downloading the share-alike corpus unattended was not done. Fallback taken: Whisper first, first good decode, Gemini as a parallel third racer |
| Turn-completion model (Smart Turn v3.2, smart-turn-tamil) | Not shipped | WASM latency above the 120 ms budget, the Worker deferred by the brief's cut line, the Tamil model's provenance unverified. The adaptive text rules end every turn |
| On-device wake word, "Jarvis knows your voice" | Not built | Optional items; no model download in an unattended run |
| Silero in a Worker, 64-sample context, resampling | Deferred | The brief's Phase 2 cut line. The Silero state is now reset per session |
| Outlook band, spoken map tour | Outlook not built; the tour exists in the mission planner only | Phase 4 cut line |
| Live Claude runs (model table, structured-output proof, cache hits) | Not run | The key is refused; the code is unit-tested |
| A separate skeptic per review area | Folded into each reviewer | Two usage-limit stops during the run |

### Environment variables added

- `JARVIS_TTS_STREAM=1` (server): Gemini TTS streaming. Off by default, unverified.
- `NEXT_PUBLIC_JARVIS_DUCK_PAUSE=1` (browser): on duck, pause Edge's natural voices instead of letting them speak on. Off by default; whether Edge honours `pause()` with natural voices is unmeasured.
- `JARVIS_LIVE` (live harness only).
- The model is still `JARVIS_CLAUDE_MODEL`, default `claude-opus-5-5`. Sonnet 5.5 and Haiku 5.5 get the right thinking settings, but they were never measured.

New `TUNING` keys in `src/lib/thunai/vad.ts`, the first places to look after a real-room try:

| Key | Value |
|---|---|
| `eouCompleteMs` | 300 |
| `eouOpenMs` | 650 |
| `bargeHoldMs` | 600 |
| `bargeWords` | 2 |
| `hearTimeoutMs` | 6000 |

### How to run the demo in Edge

Exactly as before: `start-fast.bat` from the repository root opens Edge. See `docs/jarvis/DEMO.md`, which starts with the five-minute room check.

### Known limits

- **No speaker identification.** Anyone in the room can command Jarvis. Level B and C need the name and a yes, but anyone can say those.
- **Side talk that looks like a command still acts.** On holdout3's look-alike side lines (they mention places, numbers, "remember", "explain"), the address gate acted on 17 of 40. That is the same on `main` and on v4, all at Level A, never B or C. holdout2's side talk stays at 4/60. The gate was not tuned, because tuning it on holdout3 would spend the set. The v3 report's model veto is still the owner's call.
- **Loose phrasing of the new intents goes to the planner.** On the Groq models, the planner rarely picks the new recipes from it. Plain phrasings work. The planner prompt grew by about 900 tokens a turn, which may also explain the live-60 drop.
- **Tamil spoken-register lines are unchecked** by a native speaker (PERSONA.md lists them).
- **Quota:** the Groq keys are one organisation. One evaluation day used about 300K Groq tokens. Do not demo within 24 hours of a heavy run.
- **The ledger is a local SQLite file.** A multi-process host needs a shared store.
- **Two QA open-baseline rows regressed on v4 and were fixed:** open-baseline-46 (a zone's situation is its brief again, `c8b0fb1e`) and open-baseline-11 (a past week said as a follow-up goes on to the planner, `6edad240`). In both cases v4 now behaves as `main` did. Details are in `docs/qa/pass7/V4_EXPECTED_CHANGES.md`.
- **Running the QA gate in a new worktree** needs the gitignored QA data: `data/aws-cache/qa/pinned`, `golden`, `durable.sqlite` and the matching `test-collector.txt`. Copy them from a worktree that gated before; the main checkout has none.

### What a key would add (not signed up; the owner's call)

- **Sarvam** `saaras:v3-realtime` with `codemix`: the best measured Tamil on the independent Josh Talks "Voice of India" set, at ₹0.49 a minute. Bulbul v4 Flash TTS for voice.
- **ElevenLabs Flash v2.5**: Tamil voice with fast first audio.
- **Azure Speech**: 0.5M characters a month free, the ta-IN Pallavi and Valluvar voices, and an exact pause on the PCM path. The Azure branch in `say/route.ts` still compiles and has still never run.
- **A valid Anthropic key** is the cheapest win of all. The code is ready.

### Tests

From `chennai-grievance-portal-main/`:

```bash
npx vitest run
```

```bash
npx tsc --noEmit --incremental false
```

```bash
npx playwright test tests/e2e/mode.spec.ts tests/e2e/bargein.spec.ts tests/e2e/hold.spec.ts tests/e2e/vad.spec.ts tests/e2e/vadfake.spec.ts tests/e2e/e2e-latency.spec.ts tests/e2e/hud.spec.ts
```

Live evaluation: `HOLDOUT=planner3 HOLDOUT_DIR=holdout3 HOLDOUT_SET=live30` (and `rules3`, `ambient`) in `src/lib/thunai/holdout.live.ts`. It spends quota; check the ledger first. The holdout3 set is frozen in `eval/holdout3/HASHES.txt` and is still unread: only totals have been looked at.

---

## v3 (4 Nov 2026)

Pushed to `main` by fast-forward on the owner's request, 4 Nov 2026, from branch `claude/jarvis-agentic-voice-5be9b7`. The brief is `docs/jarvis/OPUS_BUILD_PROMPT_V3.md`. Numbers are in `chennai-grievance-portal-main/eval/RESULTS.md`, the day's record is in `docs/thunai/BUILD_LOG.md`, and pictures are in `docs/jarvis/screens/`.

**Read this first.** Nothing has been tried with a real microphone in a real room. Barge-in, the address gate and the latency figures come from injected or recorded audio. Do the five-minute check at the top of `docs/jarvis/DEMO.md` before showing it to anyone.

## What shipped

Turn on Jarvis mode (top bar, or `Ctrl+Shift+J`). There is no mic button.

- **Always listening, with an address gate.** It works out from the words whether it was spoken to: by name, within 20 s of its last turn, or a sentence the rules are sure of. A sentence with no name and no recent turn can only do level A. Side talk gets a faint line that fades in 2 s, and never reaches the planner.
- **Barge-in in two stages.** The energy gate pauses the voice at once, Silero confirms it is speech, and 200 ms held cancels the turn. A cough resumes from where it stopped. Every answer carries a generation id, so an old answer cannot speak after an interruption.
- **Hold words.** "wait" goes silent and changes nothing on screen, and "continue" brings the answer back. "Wait, show Anna Nagar" is a command.
- **Three lanes.** Reflex commands are local and take no model. Screens are built by code from the data, using templated speech. Planner turns are driven from the browser in rounds on `/agent/round`, using prompt bundles and a token diet.
- **Capacity handling.** A ledger keyed by organisation and model, a ladder with a hedge at p95, and a spoken "cannot reason right now" within 8 s if no model answers.
- **New abilities.** Compare, what stands out (each finding shows its method, its n and a caveat), complete this data (filled cells show their source, blanks stay blank and say why), pin to the Overview, save a workspace. The last two need a spoken yes or a tap.
- **Every number from code.** The model writes `{n:key}` placeholders, and a gate runs on every spoken chunk.
- **Privacy in code.** A request for a citizen's words, phone or Aadhaar is refused by rules with no model involved, and tool results are redacted.
- **It never sends, approves or deletes.** The tray's button is the Collector's own tap. Buttons with those effects also carry `data-jarvis-never`, so they cannot be pressed by number or by name.
- **The HUD.** Core, ribbon, work timeline with real times, result panels, map reticle, system strip, power-on, Tamil type, reduced motion. The console stays underneath and usable.
- **Voice.** Edge natural voices first, then Gemini TTS on an AudioContext PCM path, then words on screen.

## What was cut, and what changed from the brief

| Item | What happened | Why |
|---|---|---|
| PCM 2 s self-test | Cut | Phase 1's stated cut line |
| Speculative prefetch | Cut | Phase 4's stated cut line ("prefetch last") |
| Ollama rung | Dropped | The probe got no reply in 60 s. Phase 3's cut line |
| Bedrock rung | Off | The probe returned `AccessDeniedException`: bearer token expired |
| FLEURS `ta_in` | Not used | The datasets API refused it. 100 SLR65 clips were used; male clips were not |
| `msw` | Not added | It cannot intercept the Next server's outbound fetches from a browser test. `page.route` is used instead |
| 240 px core with a Stage open | Stays 96 px | 240 px does not fit above an open screen. The 240 px rule holds with no screen open |
| Wake word on page load | Removed | With the mode off, nothing listens |
| Tab hidden | Reopens the mic on return and says so | The brief says mute and say so. The mic is closed while hidden, and the mode is meant to need no pressing |

Severity red on Stage screens was left for the owner to decide (UI review finding 25).

## How to run the demo in Edge

From the repository root (the folder above `chennai-grievance-portal-main/`):

```bash
start-fast.bat
```

This opens Microsoft Edge, which has the natural Tamil and Indian English voices. Chrome has no Tamil voice. The script and the failure fallbacks are in `docs/jarvis/DEMO.md`. Wired headphones avoid most echo. Do not demo within 24 hours of a heavy evaluation run: Groq's daily caps reset 24 hours after use.

The two settings most likely to need changing after a real-room try are both in `TUNING` in `src/lib/thunai/vad.ts`: `echoMarginDb` (8; raise to 12 if it stops itself) and `endOfUtteranceMs` (300; raise to 500 if sentences get cut at pauses. thunai/v3's own data recommended 500 to 800).

## Known limits

- **No speaker identification.** Anyone in the room can command it. The gate decides whether a sentence was addressed to Jarvis, not who said it. Level B and C need the name and a yes, but anyone can say those too.
- **Unnamed requests depend on the words.** The gate is a text rule set, so it will sometimes act on side talk or ignore a real command. See the ambient figures in `RESULTS.md`.
- **The rules now hand off when unsure, so Tamil nearly always takes a model turn** of about 1,900 tokens and 1.2 to 2.6 s. Understanding rose from 40 % to 73 % on the new frozen set, at 64 % more tokens a sentence.
- **Claude is paid by the token.** With `ANTHROPIC_API_KEY` in `.env`, Jarvis asks `claude-opus-5-5` first and falls back to Groq with no key or on any failure. Nothing else in the portal uses it. On the frozen set it scored 49/60 (Tamil 25/30) against Groq's 44/60 (22/30), which is probably better but not proven. A model turn takes about 3.9 s at p50 and 5.2 s at p90 against Groq's 1.2 s and 2.6 s, and the ledger caps a day at 500 requests. The key has to be in the `.env` of whichever copy runs, including any hosted deployment.
- **Quota is the real ceiling.** The three Groq keys are one organisation, so they add nothing: 8K tokens a minute, and a daily cap that one evaluation run can use up. There is also a limit on output tokens per minute that the ledger does not track, which `qwen` hit during the final run. The Gemini transcriber allowed about 28 calls in a day, so it runs only as a third racer when Whisper is unsure.
- **Tamil voice needs Edge.** Elsewhere the words stay on screen.
- **Tamil coverage on screens is partial.** Only the `cases` recipe's labels are Tamil at the source. Other recipes rely on the runtime translator, `when()` writes English months, and HUD panel titles use the screen's title as it comes.
- **The console's runtime translator shares the same Groq organisation.** Loading the Tamil console drew 429s on its minute limits during the screen runs, which competes with Jarvis's own quota. It also makes mistakes with figures: one news headline, "47-year-old Chennai man", came out in Tamil as "47-thousand". That translator is not part of this build and the number gate does not cover it, but it shows on the same screen.
- **Noise figures for Tamil transcription use synthetic babble**, and are labelled so.
- **The ledger is a local SQLite file** (`node:sqlite`, with a memory fallback). A hosted deployment with more than one process needs a different store behind the same interface.
- **Whisper's end of utterance at 300 ms** splits "Jarvis," from what follows. The name alone now engages and listens on, but this is the first thing to retest in a room.
- **A sentence still at Whisper when someone else talks for 200 ms is merged with their words.** The capture reaches back so that a sentence with a pause in it stays whole, and that means a second speaker's words go along with it.
- **Understanding: the second pass is in `eval/RESULTS.md`.** The full pipeline scored 44/60 (73.3 %) on the new frozen set, with Tamil at 22/30, up from 24/60 and 9/30 on its first run. Two things come first: re-run that sample once the cap resets, because the final run met four 429s, and try real Tamil speech, because every one of these sentences is typed text. Tanglish, at 9/15, is now the weakest language.
- **The address gate is still above its target:** 4/60 false acts against 5 %, all in Tanglish. A small model as a veto on what the rules would act on took the old set from 4/40 to 0/40 and lost no commands, but its run on the frozen set was a capacity failure. It has not been built: it sends overheard sentences to a model, so that is the owner's call.

## What an Azure key would add

A speech key (`AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`) with `TTS_PROVIDER=auto` or `azure` turns on the branch in `src/app/api/jarvis/say/route.ts`. It sends one SSML request and gets a 24 kHz WAV back in the ta-IN Pallavi or en-IN Neerja voice.

- The natural voices would work outside Edge, including Chrome and hosted machines.
- The audio would go through the PCM path, so barge-in gets the exact pause and resume measured here. Edge's own voices cannot pause, so they restart the chunk.
- The HUD gets a real voice level from the analyser, not an envelope driven by the state.

That branch has never run, because no key exists. It is marked Not verified, and is not a paid service this build added or relies on.

## Findings from the final independent review

See "Independent review" in `eval/RESULTS.md` for what was fixed and what was left.

## Tests

From `chennai-grievance-portal-main/`:

```bash
npx vitest run
```

```bash
npx tsc --noEmit --incremental false
```

```bash
npx playwright test tests/e2e/mode.spec.ts tests/e2e/bargein.spec.ts tests/e2e/hold.spec.ts tests/e2e/vad.spec.ts tests/e2e/vadfake.spec.ts tests/e2e/e2e-latency.spec.ts
```

A measuring production build for the real latency run needs `NEXT_PUBLIC_JARVIS_SPEC=1` at compile time, so a normal production build has none of the test hooks. See `playwright.config.ts` (`SPEC_PROD=1`).

Live evaluation lives in `src/lib/thunai/holdout.live.ts` and spends real quota, so check the ledger first. The set still held out is `eval/holdout2/` (`HOLDOUT_DIR=holdout2`, `HOLDOUT_SET=live60`), with hashes in `HASHES.txt`, and a run refuses it if one has changed. Do not edit it, tune to it or open its rows: only totals have been read so far. `eval/holdout/` has been read, so use it for tuning.
