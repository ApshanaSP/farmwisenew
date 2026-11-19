ultracode. You are Claude Opus 5.5, autonomous. This is the **JARVIS v5 build prompt, second research pass** (`JARVIS_V5_BUILD_2.md`). It replaces `docs/jarvis/ULTIMATE_JARVIS.md` (v4) and the first v5 build prompt (`JARVIS_V5_BUILD.md`). It stands alone: everything you need to build is in this file.

**Owner's instruction for this build (15 Nov 2026): build and test everything with Groq. The Claude Haiku 5.5 key is added only at deploy.** Make no live Claude call. Ship the Haiku path ready, tested with mocks, with a one-command deploy check the owner runs once the key works (section 9, item A6).

**Time box.** Day 1: about 490 minutes of wall-clock, phases 0 to 8 (section 13). Day 2: one block of about 60 minutes for the final live runs, because the diagnosis grid spends most of one day's free Groq tokens (section 7). If the session cannot stay alive until the Groq day quota resets, write the owed runs with their exact commands in the handover and stop. Cut scope, not quality. If a phase overruns by more than 15 %, stop at a green commit and move on.

**No human is available.** When something is blocked, take the stated fallback, write it in the build log, move on. **Never invent an API, package, model id, licence, price or number.** If you cannot confirm a thing, write "unverified" beside it.

**At most five subagents at a time.** The last build was stopped twice by usage limits† (the second a weekly limit, `docs/thunai/BUILD_LOG.md:26`; the "5-hour" limit and the count of twelve agents are from the v4 handover: re-check). Parallel lanes need disjoint files and their own dev-server ports (section 5 says how to pin one).

**Read order and precedence.** This file wins. Then, in your worktree: `docs/thunai/HANDOVER.md`, `chennai-grievance-portal-main/eval/RESULTS.md` (v4 section on top), `docs/thunai/BUILD_LOG.md`, `docs/qa/JARVIS_VOICE.md`, `docs/jarvis/PERSONA.md`, `docs/qa/pass7/V4_EXPECTED_CHANGES.md`. Optional background, read-only, not needed to build: `E:/farm/docs/jarvis/JARVIS_V5_RESEARCH_2.md`, `E:/farm/docs/jarvis/v5-research-2/` and `E:/farm/docs/jarvis/v5-research/` (the research files and their reasoning). Every `file:line` below was read on 15 Nov 2026 at `40ff9082`. Lines drift: re-check each one before you edit it. **Lines marked † come from the v4 tree, `docs/thunai/HANDOVER.md`, `docs/thunai/BUILD_LOG.md` and `docs/jarvis/ULTIMATE_JARVIS.md`, read on 15 Nov 2026, not from the research files.** They are: the usage limits above; the four lessons in section 1; the 401 in section 4.2; section 5 row 10; `ears.ts:144-148` (D2); `stt.ts:379-408` (B1); `stt.ts:150-166` (B2); the result file names in 6.3; the runner details in 6.5; the ports in section 5; the traps in section 12.

**What this build is for.** One question: what is the smallest set of changes that makes Jarvis understand loose Tamil, Tanglish and English speech, answer in under about two seconds, and ignore talk not meant for it?

**The honest expectation, so you do not chase a number.**

| Fact | Consequence for you |
|---|---|
| No figure behind any choice in this file was measured on Tamil, on Tanglish or in the real room | The first step in every area is a measurement. Build second |
| The drop from 44/60 to 39/60 is not proven real: 5 of 60 is about one standard error and the two 95 % intervals (52.4–75.8 % and 61.0–82.9 %) overlap almost fully | Run the diagnosis grid before any planner change |
| Nothing in the evidence says code alone reaches 52/60 on the free Groq models | Report 52/60 as a target, never promise it. A likely honest result is about 44/60 |
| The planner-lane figure that can be promised on the keys held is about 2.1 s p50, not 1.8 s | 1.8 s needs a streaming recogniser, which is not in v5 |
| Nothing may be bought except the Claude API (owner). The Groq Developer plan is paid | Never build, test or recommend a paid plan or service. Cut tokens a turn instead |
| **Groq's free tier cannot carry the planner at 300 turns a day**: about 2,880 tokens a call against 200,000 tokens a day per model is about 69 calls a model a day, about 208 over the three models (B, https://console.groq.com/docs/rate-limits, "Free Plan Limits" tab) | Haiku at deploy is the capacity answer. Count every 429 as a capacity failure, never as a wrong answer |
| Haiku 5.5 has **no** Tamil or Tanglish figure anywhere. Its thinking-off speed is two sources 3× apart (about 0.7 s or about 1.85 s for today's 230-token plan) and thinking off cost it 24 points on Anthropic's own agent eval | Haiku-first is the owner's plan, not a measured win. The deploy check (A6) measures it against the Groq final run on the same sentences |
| The Claude API takes **no audio input** (no audio block or media type on any Anthropic page) | Speech-to-text stays a separate, free stage. Never design an audio path to Claude |

---

## 1. Paths, branch and setup (first 15 minutes)

| Item | Rule |
|---|---|
| Git root and app | Git root is the worktree root. The app is `chennai-grievance-portal-main/`. Run npm and npx from the app folder. `src/`, `public/`, `eval/`, `tests/` are app-relative. Docs go in `docs/thunai/` and `docs/jarvis/` at the git root |
| **Start point** | The v4 code is on `origin/main` at **`40ff9082`**. The owner's local `main` checkout (`E:\farm`, at `38d96d2f`) is **41 commits behind and is the pre-v4 app**: it has no `eou.ts`, `register.ts`, `metrics.ts`, `events.ts`, no `recipes/` folder. Never build from it |
| Branch | You are in a fresh worktree on your own branch. Run `git fetch origin`, then `git rev-parse HEAD`. If HEAD is not `40ff9082…` and your branch has no commits of its own, run `git merge --ff-only 40ff9082`. If `origin/main` has moved past `40ff9082`, fast-forward to its tip instead, write the new SHA in the build log and re-check every line number here. **Call the SHA you start from START.** Wherever this file names `40ff9082` as the baseline (the section 5 worktree, the failing-first tests, the diff in 11.1, section 12, section 14), use START. `40ff9082` stays the v4 side of the grid (section 7.2). **Do not create another branch** |
| Never | Never push to `main`. Never merge to `main`. **No PR.** Never force-push or rewrite history. Never modify `E:\farm` (the owner's checkout); you may read from it |
| Staging | **Stage explicit paths only. Never `git add -A`, never `commit -a`.** `data/i18n/*` is rewritten at runtime and `data/embeddings/*` is pre-existing: neither may appear in a commit |
| Commits | At least every 20 minutes. Prefix `jarvis5(<phase>):`. End each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push your branch at each phase end as a backup |
| This file | Save this prompt as `docs/jarvis/JARVIS_V5_BUILD_2.md` and commit it first |
| Secrets | Copy `E:\farm\chennai-grievance-portal-main\.env` into your app folder. Confirm it is gitignored first. **Never print, log or commit a value** |
| Install | `npm ci`. The EBADENGINE warning on Node 24 is expected |
| Runtime data | Copy `data/thunai/` and `data/aws-cache/` from `E:/farm/.claude/worktrees/priceless-bouman-2fe7f8/chennai-grievance-portal-main/` (the last gated v4 worktree). Both are gitignored. Record what you copied. `data/thunai/` holds the quota ledger |
| QA harness data | See the trap in section 12 before you run the QA gate |

Lessons from earlier builds in this repo† (each cost hours; from the v4 build prompt):

- Heredocs and `node -e` strings in Bash can eat backslashes (`\b` once became a backspace byte in committed code). Edit regexes with the Edit tool, then grep new files for control bytes.
- vitest `mergeConfig` concatenates `include` arrays. Run new test files with `--sequence.shuffle` before calling them green.
- Pass 4's big suite can end with "Timeout calling onTaskUpdate" while every test passed. Read the JSON report's `success` and per-file counts before calling it red.
- The browser specs once went red because Chromium's SAPI voices replaced the mocked PCM path. `tests/e2e/helpers.ts` hides them now. Keep that.

---

## 2. The six rules (they survive every change; extend, never weaken)

1. **Every number Jarvis says or shows comes from code, never from a model.** The model writes `{n:key}` placeholders. `fillTemplate` and the number gate (`src/lib/thunai/numbergate.ts`, `speakable.ts`) run on every spoken chunk and every model string shown. No speech-to-speech model in the answer path.
2. **Jarvis never sends, approves or deletes.** Saving, pinning and remembering (level B) need a spoken yes or a tap. Outward actions (level C) are drafts only. `data-jarvis-never` buttons can never be pressed.
3. **Privacy.** No citizen's own words, phone number or Aadhaar in speech, on screen, in memory, in logs or in any prompt leaving the server. **Audio is never stored.** Overheard (unaddressed) speech is never logged and never reaches the planner. For every hosted service, the handover states what it retains and whether retention can be turned off.
4. **Tamil and Tanglish are first-class**, not a degraded mode.
5. **Licences.** Anything shipped is permissive: MIT, Apache-2.0, BSD, ISC. **Read the licence file itself**, not a model card's tag. Non-commercial or share-alike data is test-only and never shipped.
6. **The light bottom-bar HUD and "Hi Jarvis" waking it from off stay** as the owner sees them. You may change how they work inside, never what the owner sees.

These apply to your own work too (section 11, "Privacy in the work").

Scope is Jarvis only: `src/lib/thunai/`, `src/components/collector/app/thunai/`, `src/app/api/jarvis/*`, `src/app/api/collector/thunai/*`, `src/lib/ai/{gateway,claude}.ts`, `public/thunai/`, `eval/`, `tests/e2e/`, plus minimal mount points. Do not redesign the console. QA passes 4–7 fixed 280+ bugs: do not regress them.

---

## 3. Decisions

### 3.1 The owner's decisions. Do not take them. Use the default.

| Decision | Why it is the owner's | Default you build with |
|---|---|---|
| Dropping the unengaged "command-shaped" tier of the address gate | It takes side talk to 0/40 on the present harness, and refuses a first command said without "Jarvis" when Jarvis has not spoken in the last 20 s | **Dropped**, stop word kept, old behaviour behind `JARVIS_GATE_COMMAND_TIER=1`. Report both counts side by side |
| A small-model veto on the address gate | It sends overheard sentences to a hosted model (rule 3). Never measured on engaged-window turns | **Off. Do not build it.** Build the engaged-window side-talk measure and report it |
| A licence tag in place of a licence file | `intfloat/multilingual-e5-small` and `paraphrase-multilingual-MiniLM-L12-v2` carry a tag and no LICENSE file | **Not accepted. No embedding router ships in v5.** The n-gram router is the only router |
| Buying or switching any key or plan | **The owner has said (15 Nov 2026): the Claude API key is the only paid service; nothing else can be afforded.** | **No Sarvam, no paid Groq, no Azure, no other paid service: do not build, test or recommend them.** You make no account, purchase or key. **Claude spend in this build is $0: make no live Claude call at all**, even if a key in `.env` works (owner: "test with Groq; the Haiku key at deploy") |
| Which Claude model leads the ladder | The ladder puts `claude-opus-5-5` first when the key works. Opus measured p50 3.9 s here, over the lane, and costs about $137 a month at 300 turns a day against about $3.42 for Haiku 5.5 (a floor) | **The owner's plan: `claude-haiku-5-5` (thinking disabled) leads the ladder at deploy**, Groq ladder behind it as today, Gemini flash-lite, then rules. Build it as item A6: the default of `JARVIS_CLAUDE_MODEL` becomes `claude-haiku-5-5`, a new `JARVIS_PLANNER_LEAD` (`haiku` default, `groq`) lets the deploy check put Groq first. **Take `claude-opus-5-5` off the first rung in every case**; keep it selectable by env. No Sonnet anywhere |
| IndicConformer weights for free local Tamil hearing (item B5) | The MIT licence **file** is in AI4Bharat's GitHub repo; the Hugging Face weights are gated and carry only a `license:mit` tag; every runnable ONNX export is by an individual | **Measure only.** You may download a model for the spike, outside git, never committed. Anything you wire stays behind `JARVIS_LOCAL_TAMIL_STT`, **default off** |
| A Cloudflare Workers AI account (free; zero retention by default) for an overflow speech pool | A new account | **Not created, not built.** Owner action in the handover |
| Gemini TTS on the free tier (the app's second voice today) | Free-tier content is "used to improve our products" | **Unchanged.** Listed for the owner |
| Sarvam for Tamil speech | Not affordable (owner, 15 Nov 2026) | **Not built, not tested.** Groq Whisper stays; Tamil hearing is improved only by the free items (B1–B3, and B5 if its measurement passes and the owner accepts the weights' licence) |
| Groq Zero Data Retention | A console switch (Data Controls). You cannot reach the console | Assume **off**. Write "turn on Zero Data Retention" as the first owner action in the handover |
| Stored test audio from real people | Rule 3 says audio is never stored, with no exception | **Nothing stored.** The real-room check is live reading; only pass/fail and timings are kept |
| On-device wake word as the default wake | No figure exists for `hey_jarvis.onnx` on "Hi Jarvis", bare "Jarvis", Tamil forms or Indian accents | **Today's browser wake stays the default.** The on-device model ships behind a flag, off |
| `echoCancellation: "all"` as the default (v4 asks it first today, untested) | Both browsers accept the value; nothing says what it does on Windows or to `speechSynthesis` audio | **Default `true`.** `"all"` behind a flag until the room check compares them (section 8, item D2) |
| Reordering the Groq ladder | No source ranks the three models on Tamil | **Order unchanged** |
| Whether "planner prompt ≤ 2,500 tokens" counts the JSON schema | The brief does not say | Report three counts (section 14) |
| Tuning, dev and side-talk sets written by a person; the 300-name gazetteer; spoken metric names | Owner's data | If the owner left a file at the path named in section 11, use it. If not, draft it as section 11 says and label it "model-drafted, not checked by a Tamil speaker" |

### 3.2 Already right. Do not change.

One JSON plan, then code runs the tools. Strict structured output on Groq. NDJSON over fetch. No voice framework. Edge natural voices first. Code-decided interjections with the present limits (`watch.ts:89`). The barge-in duck (p90 84 ms against 250 ms). The text end-of-utterance rules (300 ms / 650 ms, `eou.ts`). The metric registry's "error, not a guess" rule. Forced-language Whisper (never automatic language detection).

---

## 4. Where it stands: the starting facts, corrected

### 4.1 Corrections to the research brief (the code is right)

| The brief said | The code says (`40ff9082`) |
|---|---|
| Next.js 14.2, React 18 | `next 15.5.29`, `react 19.3.1`, `zod 3.25.76` installed, `ai 7.0.122`, `@ai-sdk/groq 4.0.52`, `@anthropic-ai/sdk 1.4.0`, `typescript ^5.6.3`, `vitest ^3.2.7`, `@playwright/test ^1.63.0` |
| About 25 recipes | **22** recipes in one enum (`src/lib/thunai/stage.ts:74-75`), one of them `answer`. `recipes/*` holds only the three v4 recipes (`changed`, `explain`, `situation`); the other 19 are built in `screens.ts` |
| One JSON call a turn | Up to **four** model calls: an optional router call (`round.ts:741`), the bundle call (`:820`), one wider retry on `kind: other` (`:826-830`), and up to `MAX_ROUNDS = 3` (`agent.ts:28`) |
| Planner prompt about 2,900 tokens | 2,878 is **input plus output as the provider counted it**, per model turn (`eval/RESULTS.md:36`: 1,977 → 2,878). The code's own cap, `CALL_TOKENS = 2500` (`round.ts:331`), counts system + user text only at 3.5 characters a token and **leaves the JSON schema out**. The schema is 1,000–1,750 tokens more (characters / 4) |
| `conductor.ts`, `turnstream.ts`, `mouth.ts`, `voice.ts` beside the `lib` files | They are in `src/components/collector/app/thunai/` |
| The local `main` holds v4 | It does not (section 1) |

Two files are named `metrics.ts` (`src/lib/thunai/metrics.ts` is Jarvis's; `src/lib/reference/metrics.ts` is not). Two are named `plan.ts` (`src/lib/thunai/plan.ts`; `src/lib/map/plan.ts` is not).

### 4.2 Measured on 15 Nov 2026 (v4, Groq ladder)

| Measure | Result | Target |
|---|---|---|
| Understanding, frozen live-60 (`eval/holdout2`) | 39/60 (44/60 before v4) | ≥ 52/60 |
| Tamil on that set | 18/30 | ≥ 26/30 |
| New intents, frozen sample of 30 (`eval/holdout3`) | 6/29 | ≥ 75 % |
| Side talk that made Jarvis act (`eval/holdout3`, 40 look-alike side lines; `eval/RESULTS.md:72`†) | 17/40, level B/C 0 | ≤ 5 % |
| Same sentence three times, right all three | 14/20 | — |
| Planner turn, Groq | p50 1.2 s, p90 3.5 s | — |
| Planner turn, Claude Opus 5.5 (older run) | p50 3.9 s, p90 5.2 s | — |
| Tokens a planner turn (in + out, provider count) | 2,878 | ≤ 2,500 (which count: owner) |
| Speech-to-text, server time, engaged turn | p50 513 ms | ≤ 700 ms |
| End of speech → first spoken finding, rules lane | 1.1 s | ≤ 1.0 s |
| End of speech → first spoken finding, planner lane | 2.3–2.8 s | p50 ≤ 2.2 s |
| Barge-in duck after the user starts | p90 84 ms | ≤ 250 ms |
| Tamil Whisper word error rate (100 read clips, older run) | about 0.50 | — |
| Unit suite / Jarvis specs / QA gate | 5,496 passing / 30 passing, 8 HUD screenshot specs / green on the final tip | stay green |

The Anthropic key in the app's `.env` returned **401 on 15 Nov 2026**† (`eval/RESULTS.md:10, :16`). Every recent figure is the Groq ladder. The Groq keys are one organisation, assumed on the **free plan**: 30 requests and 8,000 tokens a minute, 1,000 requests and 200,000 tokens a day, per model; Whisper 20 requests a minute, 2,000 a day, 7,200 audio-seconds an hour, 28,800 a day (grade B, https://console.groq.com/docs/rate-limits, "Free Plan Limits" tab; limits are per organisation, so more keys add nothing). One sentence above the tabs still calls the table the Developer base: **log the `x-ratelimit-*` response headers of your first Groq call** (names and values only, never the key) and record which figures apply.

### 4.3 The file map (all checked at `40ff9082`)

`lib` = `src/lib/thunai/`. `ui` = `src/components/collector/app/thunai/`.

| Stage | File | What you would change |
|---|---|---|
| Capture, voice detector | `public/thunai/ears.worklet.js`; `ui/ears.ts`; `lib/vad.ts`; `public/thunai/silero_vad_v5.onnx` | `sileroRunner` (`ears.ts:60`), `loadSilero` (:76), class `Ears` (:94), `echoAudio` (:47), `TUNING` (`vad.ts:13`) |
| End of utterance | `lib/eou.ts`; `ui/conductor.ts` | `eouFor` (`eou.ts:46`), class `Conductor` (`conductor.ts:139`) |
| Speech-to-text | `lib/stt.ts`; `src/app/api/jarvis/hear/route.ts` | `hearUtterance` (:363), `decode` (:268), `sttPrompt` (:93), `choose` (:205), `third` (:244); `POST` (`route.ts:18`) |
| Address gate, wake | `lib/addressed.ts`; `ui/wake.ts`; `ui/captions.ts`; `ui/Thunai.tsx` | `addressed` (:112), `looksSide` (:96), `looksRequest` (:105), `ENGAGED_MS` (:26); `wakeIn` (`wake.ts:63`), `startWake` (:85); the caption recogniser is created at `Thunai.tsx:2322` (`new HearingCaptions`) and wake starts at `:2386` |
| Rules | `lib/understand.ts`, `quick.ts`, `frame.ts`, `register.ts`, `router.ts`, `rules.ts` | `understand` (:237), `quickScreen` (:371), `isElliptical` (`frame.ts:45`), `registerLine` (`register.ts:296`), `routeByRules` (`router.ts:32`), `bundleByRules` (:45) |
| Planner | `lib/round.ts`, `agent.ts`, `llm.ts`, `plan.ts`; `src/lib/ai/claude.ts`, `gateway.ts`; `src/app/api/collector/thunai/agent/round/route.ts` | `planRound` (`round.ts:571`), `firstPrompt` (:341), `SCHEMAS` (:291), `withLook` (:289-298), the bundle constants (:227-263), `CALL_TOKENS` (:331); `Screen` (`agent.ts:47`), `checkScreen` (:185); `ladder` (`llm.ts:26`), `estimate` (:21), `callLlm` (:122), `hedgeAfter` (:78); `turnLine` (`plan.ts:87`), `memoryLines` (:100); `claudeJson` (`claude.ts:379`); `generateJson` (`gateway.ts:331`), `groq()` (:145), `tryModel` (:475) |
| Screens | `lib/screens.ts`, `recipes/*`, `metrics.ts`, `stage.ts` | `buildScreen` (`screens.ts:317`), `computeMetric` (`metrics.ts:208`), `metricsPromptLine` (:222) |
| Number safety | `lib/numbergate.ts`, `speakable.ts` | `gateChunk` (:241), `fillTemplate` (:251), `speakableFigures` (`speakable.ts:67`) |
| Transport | `lib/events.ts`, `streamturn.ts`; `ui/turnstream.ts` | `readEvents` (:55), `roundStream` (:32), `readRound` (`turnstream.ts:61`), `SayQueue` (:102) |
| Voice | `ui/mouth.ts`, `ui/voice.ts`; `src/app/api/jarvis/say/route.ts` | `speakLines` (`mouth.ts:396`), `duckVoice` (:472), `pauseVoice` (:438), `bestVoice` (`voice.ts:70`) |
| Barge-in | `lib/turn.ts`, `backchannel.ts` | `turn` (:118) |
| Proactive | `lib/detect.ts`, `signals.ts`, `watch.ts`, `briefing.ts` | `mayInterject` (`watch.ts:110`) |
| Evaluation | `src/lib/thunai/holdout.live.ts`; `vitest.live.config.ts`; `eval/` | section 11 |

### 4.4 What the planner sends today (you need this for the grid)

- `planRound` routes by rules, picks a **bundle** (`router.ts:45-55`), then sends `system = systemFor(bundle, world)` (`round.ts:266`), `schema = SCHEMAS[bundle]` and `prompt = firstPrompt(...)`, `maxOutputTokens: 500`, `lane: "planner"`.
- Bundle choice: memory words → `memory`; an open Stage and a "this/that" word → `stage`; **any sentence read as Tamil (Tamil script, or Tanglish with enough marks) → `wide`**; console words → `console`; count, price or contact words → `data`; else `screens`.
- Size by bundle (characters / 4): `screens` system ~1,180 + schema ~1,025 + user ~45 = **about 2,250**. `wide` (every Tamil sentence): system ~1,837 + schema ~1,742 + user ~60 = **about 3,640**, more in real tokens. At 8,000 tokens a minute that is two Tamil calls a minute per model.
- Field order the model must write: `kind, lang, reply, options, screen…, calls, done`. The spoken `reply` comes **before** the recipe. There is no reasoning field. All 21 screen keys are written every time (20 slots, all required and nullable).
- Examples are fixed, not chosen per sentence: one English example in `SCREENS`, 13 in `TAMIL_B` (wide only), 6 Tanglish examples in the user message outside `wide`.
- The system message is the same every turn for a bundle; everything per-turn is in the user message. Keep it so: Groq's cache needs an exact prefix.

### 4.5 What v4 added (`git diff 38d96d2f..40ff9082`), per turn

| Addition | Where | Cost (characters / 4) | Applies to |
|---|---|---|---|
| `calls` (max 3) and `done` in **every** bundle's schema (`withLook`); before, only `data` had them | `round.ts:289-298` | ~275 tokens | every non-data bundle, every turn |
| `LOOKUP` line with `TOOL_FIELDS` on every non-data system prompt | `round.ts:257, :261, :267` | ~104 | every non-data bundle |
| Three new recipes (`changed`, `explain`, `situation`) and one routing line in `SCREENS` | `round.ts:234-235` | ~103 | screens, data, wide |
| Recipe enum 19 → 22; `Screen.metricId`; `what` gains `change` | `stage.ts:74`, `agent.ts:59-63` | ~50 | every schema with `screen` |
| `PERSONA_LINE` in `CORE` | `round.ts:227-228`, `persona.ts:12` | ~46 | all |
| Three more `TAMIL_B` examples; act-observe sentence in `CONSOLE_B` | `round.ts:251-254` | ~58 + ~39 | wide; console, wide |
| Recent turns 2 → 4 with slots and result | `round.ts:353`, `plan.ts:87` | up to +100 | turns with history |
| Register line | `round.ts:361`, `register.ts:296` | up to +300 | turns with a screen or history |
| Memory lines | `round.ts:363`, `plan.ts:100` | up to +260 | when notes exist |
| Tanglish hints: grammar line and 6 examples | `round.ts:346`, `gloss.ts:170` | ~200 | Tanglish outside `wide` |
| Metric ids line | `round.ts:348`, `metrics.ts:222` | ~112 | "what changed" sentences |
| Low-confidence line | `round.ts:368` | ~40 | unsure hearing |

On a bare sentence the growth is about 580 tokens (`screens`) and about 680 (`wide`). Close to half of it is schema. The v4 wrong answers went to: readings 5, cases 4, clarify 3, chat 2, none 2, general fallback 2 (`eval/RESULTS.md:39`). The three new recipes look like older ones: `changed` against `trend`/`why`, `explain` against `case`/`why`, `situation` against `brief`/`dashboard`.

---

## 5. Phase 0 — setup and baseline on an untouched copy (45 min, mandatory)

Baselines run on a pristine copy so your edits cannot touch them.

```
# from the git root of your worktree (Git Bash)
git worktree add --detach .claude/worktrees/jv5-base 40ff9082
cmd //c "mklink /J .claude\worktrees\jv5-base\chennai-grievance-portal-main\node_modules chennai-grievance-portal-main\node_modules"
# data/ is a tracked folder (41 tracked files), so the base checkout already has it: junction only the two gitignored subfolders
cmd //c "mklink /J .claude\worktrees\jv5-base\chennai-grievance-portal-main\data\thunai chennai-grievance-portal-main\data\thunai"
cmd //c "mklink /J .claude\worktrees\jv5-base\chennai-grievance-portal-main\data\aws-cache chennai-grievance-portal-main\data\aws-cache"
# copy .env into the base app folder too (gitignored; never print it)
```

**When you are done with it: remove the three junctions (`node_modules`, `data\thunai`, `data\aws-cache`) with `cmd //c rmdir <junction path>` first, then `git worktree remove`.** Deleting the folder with the junctions in place deletes what is behind them.

**Ports†.** `playwright.config.ts:16-32` hard-codes the dev server to 127.0.0.1:3011 with `reuseExistingServer: true`. A spec run in one tree silently reuses a server another tree left on 3011, and then measures the wrong tree. Before any spec run, check that nothing from another tree listens on 3011 (`netstat -ano | findstr :3011`). A lane or the base tree starts its own server, `NEXT_DIST_DIR=.next-lane<N> npx next dev -H 127.0.0.1 -p <port>` with the env of `playwright.config.ts:32`, and runs specs with `SPEC_URL=http://127.0.0.1:<port>`.

Re-measure, on the base worktree, in this order. Write every figure to `eval/RESULTS.md` under "v5 baseline, re-measured" with the command used.

| # | Measure | Command (from the app folder) | Uses Groq quota? |
|---|---|---|---|
| 1 | Unit suite, count of tests | `npx vitest run` | no |
| 2 | Type check | `npx tsc --noEmit --incremental false` | no |
| 3 | Build | `npx next build` | no |
| 4 | Jarvis browser specs | `npx playwright test tests/e2e/mode.spec.ts tests/e2e/bargein.spec.ts tests/e2e/hold.spec.ts tests/e2e/vad.spec.ts tests/e2e/vadfake.spec.ts tests/e2e/e2e-latency.spec.ts tests/e2e/hud.spec.ts` (dev server on 127.0.0.1:3011, or `SPEC_URL` for a pinned port: see "Ports" above) | no (mocked) |
| 5 | Side talk, and the unnamed commands accepted | `HOLDOUT=ambient HOLDOUT_DIR=holdout3 HOLDOUT_TAG=v5base npx vitest run --config vitest.live.config.ts src/lib/thunai/holdout.live.ts`. Read `sideFalseActs/sideN`, `sideLevelBC`, `commandsAccepted/commandsN` from the summary only | no |
| 6 | The same on `HOLDOUT_DIR=holdout2` | as 5 | no |
| 7 | New intents with no model | `HOLDOUT=rules3 HOLDOUT_DIR=holdout3 HOLDOUT_TAG=v5base …` (totals only) | no |
| 8 | Prompt and schema size by bundle | a scratch script that imports the modules and prints string lengths for `systemFor`, `SCHEMAS[bundle]` and a bare `firstPrompt`, in characters and characters / 4 | no |
| 9 | Barge-in duck p90, mocked latency by lane | from 4 (`bargein.spec.ts`, `e2e-latency.spec.ts`), on the same server as 4 | no |
| 10 | QA gate | Not re-run on the base by default. The last gate was green on `6edad240`† (`docs/thunai/BUILD_LOG.md:55`); `40ff9082` adds its evidence and one fix. Say so. If your own gate later shows a red item, run that item alone on the base to prove whether it is red there too | no |

The harness header gives the Windows cmd form (`set HOLDOUT=rules&& npx vitest run --config vitest.live.config.ts src/lib/thunai/holdout.live.ts`). There is no npm script for it. In Git Bash, prefix the variables as above.

**Not re-measured on day 1, and why. Say so in the results.**

| Measure | Why | What stands in |
|---|---|---|
| Live-60 (39/60), Tamil 18/30, new intents 6/29, 14/20 repeats | The grid needs most of the day's free tokens (section 7). 60 × 2,878 = 172,680 tokens will not fit beside it | Quote the 15 Nov figures from `eval/RESULTS.md` (v4 section, lines 9-40) only, labelled "taken 15 Nov by the v4 build, not re-run", with the caveats it gives for each run. **Do not open or list `eval/holdout3/results/`.** Files in `eval/holdout2/results/` are read only by the Step 0 script (6.3) |
| Real end-to-end latency (2.3–2.8 s), speech-to-text p50 513 ms | Needs live Groq calls | A measuring production build: `NEXT_DIST_DIR=.next-agentbuild NEXT_PUBLIC_JARVIS_SPEC=1 npx next build` (`next start` reads that folder: `playwright.config.ts:26`), then `SPEC_PROD=1 npx playwright test tests/e2e/real.spec.ts` (port 3012). **After** the grid, only if the ledger says it can finish. Else owed |
| Tamil word error rate 0.50 | The 100 clips are not on this machine (only `eval/holdout/tamil-asr/manifest.json` hashes) | Not re-measured. List it under "Not verified" |

Check the ledger (`data/thunai/`) before every live run. Never start a run that cannot finish.

---

## 6. Phase 1 — the scoring harness and the trace (50 min, mandatory)

It moves no number. Without it no later number can be trusted: at 60 sentences a real 5-point gain is detected 14 % of the time.

### 6.1 Statistics, in code, no package

New file `src/lib/thunai/evalstats.ts` with `src/lib/thunai/evalstats.test.ts`. Write the tests first.

| Function | Definition | Test vectors (must pass) |
|---|---|---|
| `wilson(k, n)` | 95 % Wilson score interval, z = 1.96 | 39/60 → 52.4–75.8 %; 44/60 → 61.0–82.9 %; 2/40 → 1.4–16.5 %; 4/200 upper bound 5.0 % (to 0.1) |
| `mcnemar(b, c)` | Exact two-sided sign test on the discordant pairs, and its mid-p. b = right only in run X, c = right only in run Y | b = 6, c = 0 → p ≈ 0.03; 5 and 1 → p ≈ 0.22; 6 and 1 → p = 0.125 |
| `passK(correct, n, k)` | Mean over sentences of C(c, k) / C(n, k). Report pass^1 and pass^3 with n = 3 | hand-computed cases |
| `majority3(runs)` | A sentence is right if right in at least 2 of 3 runs | hand-computed cases |

Grade A/B for the method (https://arxiv.org/html/2503.01747v3 for Wilson at small n; https://arxiv.org/html/2406.12045 for pass^k; https://arxiv.org/html/2408.04667v5: API-served models set to be deterministic still varied by up to 15 % in accuracy across runs). Do not use a bootstrap or a normal-approximation interval.

### 6.2 Per-turn record in every live run

Extend `src/lib/thunai/holdout.live.ts` (and, where the fields do not surface, `lib/llm.ts` and `src/lib/ai/gateway.ts`) so each scored turn records:

| Field | Meaning |
|---|---|
| `model_used` | the id that answered |
| `rate_limited` | a 429 was met on this turn |
| `fell_back` | another rung answered than the first asked |
| `json_validate_failed` | HTTP 400 from strict mode. Its own outcome, not a wrong answer |
| `prompt_tokens`, `completion_tokens`, `cached_tokens` | from the provider's usage. Read `usage.prompt_tokens_details.cached_tokens` from the raw response if the SDK does not surface it (unverified that `ai 7.0.122` does) |
| `ms` | call latency |
| `ladder_order` | which order the run used |

Every summary prints: score with its Wilson interval; score per answering model; capacity failures as their own column; the score on clean turns beside the score with capacity failures counted as wrong. **A run that met any 429 is labelled a capacity failure**, never quoted as a plain score.

A way to pin one model: `only: { provider: "groq", models: [id] }`, as `src/lib/ai/gateway.test.ts:10` does. A pinned run never retries a 429 on another model.

### 6.3 Step 0: is the drop real? (minutes, no quota)

Write a script that takes two result files of the live-60 in `eval/holdout2/results/`†, pairs them by sentence id, and **prints only b, c and the exact p-value**. The 44/60 run is `final-planner-live60.json` (`eval/RESULTS.md:200`, the pre-v4 final run; it met four Groq refusals: say so). The 39/60 run is `v4final-groq-planner-live60.json`. The script asserts each file's total is 44 and 39 before pairing; if not, skip Step 0 and say so. Never print ids, gold, got or text, and never open the files by hand: the set is frozen.

### 6.4 The per-stage trace

One timestamp per stage on every turn. **Zero is the last voiced sample**, not the detector's decision. Timings only: no audio, no transcript text (rule 3).

| Stamp | File |
|---|---|
| last voiced sample; end-of-utterance decision; upload sent | `ui/conductor.ts`, `ui/ears.ts` |
| speech-to-text request sent and back (server) | `lib/stt.ts`, `src/app/api/jarvis/hear/route.ts` |
| address gate and rules done | `lib/addressed.ts` caller in `ui/Thunai.tsx` |
| planner sent, planner back, tools done | `lib/round.ts` |
| first event received in the browser | `ui/turnstream.ts` |
| `speak()` called, voice `onstart` | `ui/mouth.ts` |

`tests/e2e/e2e-latency.spec.ts` writes the trace into its result file, p50 and p90 by lane with n. Today's stages add to about 2,013 ms (300 + 513 + 1,200) and the lane measures 2,300–2,800: **300–800 ms is unexplained.** The trace exists to find it. If it sits in the Edge voice start, nothing in this build fixes it: report it.

### 6.5 Sets to prepare now (they run later)

| Set | Path | Size | Rule |
|---|---|---|---|
| Tuning set for the grid | `eval/holdout/tuning24.jsonl` | 24: 8 English, 8 Tamil script, 8 Tanglish; 6 of the 24 on the new intents (explain, what changed, how do you know, missions, memory) | If the owner left this file, use it. Else take sentences from `eval/holdout/understanding.jsonl` (already read; tuning is allowed there) and, for the new intents it lacks, write invented commands. Each line: `{id, lang, text, gold: {kind, recipe \| null, slots}}`. **Never derived from `eval/holdout2` or `eval/holdout3`.** Label model-written lines |
| Example bank (only cell G and route-then-fill use it) | `src/lib/thunai/bank/*.json` | 12 a recipe a language form (22 × 3 × 12) | Drafted by one Opus subagent that sees the recipe list and slot definitions and **no eval file at all**. Then filtered in code: recipe in the enum, slots valid under `checkScreen`, no digits, no duplicates, no line whose normalised text is within the tuning set. Commands only; no citizen words |
| Side-talk set | `eval/sidetalk200/ambient.jsonl`† + `HASHES.txt` (the runner reads `<dir>/ambient.jsonl`: `holdout.live.ts:160`) | 200 text items, each `{id, text, lang, kind: "side" \| "command"}` as in `eval/holdout/ambient.jsonl` (already read; allowed as the format reference) | Owner's file if present. Else drafted by a subagent that sees no code and no eval file (give it the row shape only), labelled blind by a second, disagreements dropped, frozen by hash, **never read by you**. Draft about 260 side items so that 200 remain. Run with `HOLDOUT=ambient HOLDOUT_DIR=sidetalk200`. Scored twice: unengaged, and with Jarvis's last turn 5 s ago |
| Dev set | `eval/dev200/understanding.jsonl` + `eval/dev200/live60.json`† = `{"live60": [all 200 ids]}` (the runner takes its id list from that file: `holdout.live.ts:235`) + `HASHES.txt` | 200: about 70 English, 70 Tamil script, 60 Tanglish; loose and half-said forms. Row shape as `eval/holdout/understanding.jsonl` | Same drafting rule. Frozen by hash. Scored, never read, never tuned on. Run with `HOLDOUT=planner2 HOLDOUT_DIR=dev200 HOLDOUT_SET=live60 HOLDOUT_TAG=<tag>`. It will not fit a day of free quota (200 × 2,878 = 575,600 tokens): its runs are owed (section 11) |

Draft the bank first: the grid's cell G waits for it.

---

## 7. Phase 2 — the diagnosis grid (30 min of your time; about 22 min of wall-clock plus pacing, in the background)

**This runs before any change to the planner prompt or schema, and before anything else that spends Groq tokens that day.** Grade: token facts A (repo). Every accuracy expectation below is U until this runs.

**If the ledger cannot fit the full grid** (the copied ledger carries the v4 build's 15 Nov usage): run cells A and B first on each model, with as many balanced sentences as fit (multiples of 3, one of each language form). If fewer than 12 pairs fit on every model, the grid is owed: Phase 4 ships A2 only, A1 and A1b are built behind the flag default off, A3 is not wired, and the grid command goes in the handover. Do not wait for the quota to reset and do not skip silently.

### 7.1 Three hypotheses

| | H1: the added text distracts | H2: the choice got harder | H3: a different model answered |
|---|---|---|---|
| Claim | The new blocks are near-miss distractors and extra instructions | Every bundle now offers two ways to answer (`screen`, `calls`); three look-alike recipes; `reply` is written before the recipe | A bigger call cuts each model from 3 to 2 calls a minute, so more turns fall to another rung |
| Separates it | Neutral padding does not hurt, the added blocks do (C against D) | v3 prose with the v4 schema hurts (E); a `why` field first helps qwen (F) | With one model pinned, v3 and v4 score the same (A ≈ B) |

### 7.2 Rules of the run

| Item | Value |
|---|---|
| Runner | New file `src/lib/thunai/grid.live.ts` (the live config includes `src/**/*.live.ts`). Variants live in `src/lib/thunai/grid/` and are imported **only** by the runner |
| Scored | The first planner call only. A sentence is **right when `kind` and recipe match gold**: this recipe-level score drives b and c. Slots-right is printed beside it |
| Sentences | `eval/holdout/tuning24.jsonl`. **No frozen set is read or used.** Sentences whose gold is not a screen recipe present in both schemas (the new intents that answer through `steps` in the memory bundle or through `kind`) are scored in cells B, F and G only (and in the deploy check's Haiku arms) and are left out of every pair with A, C, D, E |
| Model | Pinned, one model per run: `only: { provider: "groq", models: [id] }`. No ladder, no hedge |
| A 429 | Recorded as a capacity failure. Never retried on another model |
| HTTP 400 `json_validate_failed` | Its own outcome |
| v3 | The planner prose and schemas as at `38d96d2f`: `git show 38d96d2f:chennai-grievance-portal-main/src/lib/thunai/round.ts` (and `agent.ts`, `stage.ts` for the 19-recipe `Screen`). Copy the constants into `src/lib/thunai/grid/v3.ts` |
| v4 | As at `40ff9082`, imported from `round.ts` unchanged |
| Results | `eval/holdout/results/grid-<cell>-<model>.json` |
| Also note | Which ladder order and which models answered the 39/60 run: count the per-row `model` field of `eval/holdout2/results/v4final-groq-planner-live60.json`† by script (counts only, no ids), or read `docs/thunai/BUILD_LOG.md`. The file's summary has no ladder-order field: if the order cannot be told, write "not recorded" |

### 7.3 Cells

| Cell | Prose | Schema | Estimated tokens a call (in + out) | Tests |
|---|---|---|---|---|
| A | v3 | v3 | 2,300 | Control, inside every model |
| B | v4 | v4 | 3,200 | Today |
| C | v3 + 900 tokens of neutral filler (plain prose about nothing in the task) | v3 | 3,200 | Length alone (H1) |
| D | v4 | v3 | 3,000 | The added instructions (H1) |
| E | v3 | v4 | 2,500 | The schema and label set (H2) |
| F | v4, plus a first field `why` (12 words at most, never shown or spoken, never passed to the number gate as speech) | v4 + `why` first | 3,300 | The missing reasoning step (H2) |
| G | The rules (`CORE`) + 5 shortlisted recipes with their slots + the other recipe names + 8 retrieved examples, least similar first, most similar last | `SCHEMAS.screens` (v4, unchanged) for every sentence in every language | 1,300 without the schema; **plan on about 2,275** (U) | Route-then-fill |
| H | — | — | — | **Not run in this build** (no live Claude call). It moves to the deploy check, item A6 |

- D and E are scored only on sentences whose gold recipe exists in both schemas.
- Cell G needs the n-gram router (section 9, item A3) and the bank. Build both in `src/lib/thunai/` behind no production call site yet.
- **The 1,300 for G is unverified and probably low.** It was estimated without the schema; the `screens` schema alone is about 1,025 tokens by characters / 4 (`wide` is about 1,742), and whether Groq bills the schema one-for-one is unverified. Until measured, estimate G as about 1,250 + 1,025 = 2,275 a call. Measure it.
- **Which schema G sends.** `SCHEMAS` is per bundle. Cell G and item A3 send `SCHEMAS.screens` (v4, unchanged) for every sentence, Tamil included. Route-then-fill applies only when `bundleByRules` returns `screens` or `wide`; sentences the rules route to `console`, `memory`, `stage` or `data` take the v4 path unchanged.

### 7.4 Token plan against 8,000 a minute and 200,000 a day per model (the three models run in parallel, each on its own quota)

| Model (pinned) | Cells | Tokens a sentence | Sentences | Tokens | Share of the day | Minutes at 8K a minute |
|---|---|---|---|---|---|---|
| `openai/gpt-oss-20b` | A, B, G | 2,300 + 3,200 + 1,300 = 6,800 | 24 | 163,200 | 82 % | 21 |
| `openai/gpt-oss-120b` | A, C, D, E | 2,300 + 3,200 + 3,000 + 2,500 = 11,000 | 16 | 176,000 | 88 % | 22 |
| `qwen/qwen3.8-27b` | A, B, F | 2,300 + 3,200 + 3,300 = 8,800 | 20 | 176,000 | 88 % | 22 |

- If cell G is near 2,275 a call, the `openai/gpt-oss-20b` row is 7,775 × 24 = 186,600 tokens (93 % of the day), not 163,200. Cut G's sentences (keep the language balance) if the first three calls say so.
- For the 16- and 20-sentence runs take the first 16 and 20 lines of a fixed, seeded shuffle that keeps the three language forms balanced. Record the seed.
- **Measure the first three calls of each cell.** If the provider's count is more than 10 % over the estimate, cut sentences (keep the language balance) so the run finishes inside the day. A Tamil call is larger than an English one. Reasoning tokens on gpt-oss count as output.
- If the first three gpt-oss calls of a cell show `cached_tokens > 0`, cached tokens stop counting toward the limit: run all cells on all 24 sentences on the two gpt-oss models.
- Pace inside the minute limit. Order on gpt-oss-20b: A, B, then G (G waits for the bank).
- **Cell H is not run in this build.** The Haiku arms (thinking off at low effort, thinking off at medium effort, and the compact plan) run on the same 24 sentences in the deploy check (item A6), paired against the Groq cells you record here. Keep this grid's result files: the deploy check reads them.

### 7.5 How to read it, and what to build

Compare two cells **on the same model and the same sentences**. b = sentences right only in X, c = right only in Y. Print b, c and `mcnemar(b, c)` for every pair.

**The build rule (a direction rule, not a significance test):** "X beats Y" when b − c ≥ 3 on a model and no model that ran both cells shows the opposite sign by 3 or more. "About equal" otherwise. With 16–24 pairs only large effects show (six discordant pairs all one way is p = 0.03; five of six is p = 0.22). Say this beside every grid figure.

| Result | Reading | Build (section 9 item) |
|---|---|---|
| A about equal to B on every pinned model | H3: mix, capacity or noise | **Do not rewrite the prompt for accuracy.** Ship the capacity items only (A2). Build the schema diet (A1) behind its flag, **default off** |
| A beats E | H2: schema and label set | Schema diet (A1), default on |
| A beats D, and C about equal to A | H1: the instructions, not the length | Conditional context (A1b), default on |
| A beats C | H1: length alone | A1 and A1b, default on; and route-then-fill (A3) if G is not worse than A |
| G beats A | The fix works whatever the cause | Route-then-fill (A3), default on |
| F beats B on qwen, not on gpt-oss | H2: missing reasoning step | `why` first for qwen only, behind a flag, **default off**; owed a paired run |
| (deploy day) Haiku beats A and its p50 is inside the lane | Model ability is the limit | The deploy check keeps Haiku first; nothing to build now |
| Nothing beats anything | Noise | Ship A2 only. Say so plainly |

More than one row can hold: apply every row that holds. Every planner change ships with an env switch that restores v4 behaviour.

**What the grid cannot settle, and what is owed.** The winner must be re-run against cell A on the full tuning set, three runs a sentence, scored by majority, before any claim. That does not fit a day (section 11.3). It is an owed run.

---

## 8. Phase 3 — fixes that do not touch the planner (60 min; start them in lanes while the grid runs)

Every defect gets a test that **fails on `40ff9082` first**. Commit the failing test, then the fix. If a test you expected to fail already passes, the current code is right: record that and change nothing.

| # | Item | Files | Failing-first test | Grade, source | Lifts understanding above 52/60? |
|---|---|---|---|---|---|
| C1 | **Cut the unengaged command tier.** In `addressed` (`addressed.ts:112`), remove the two returns with `why: "rules"` and `why: "imperative"` (`:123-124`). Keep the `why: "stop"` return (`:118`; it also carries `tier: 3`): the bare stop word (`:29-31`, English, Tanglish, Tamil) still acts at level A. `JARVIS_GATE_COMMAND_TIER=1` restores the two removed returns | `lib/addressed.ts`, `src/lib/thunai/addressed.test.ts` | Unit test with **invented** look-alike side lines (not rows from any eval set) that the rules resolve and that carry a district noun or an imperative: each acts today, none after. A stop-word case still acts. An invented unnamed command with `lastTurnAt: null` is refused; the same with `lastTurnAt` 5 s ago still acts | A for the harness effect (own code: the harness passes `lastTurnAt: null`, so every one of the 17 passed tier 3). Nothing for a real room. Text-only gates sit near 11–20 % error in English (B, https://arxiv.org/abs/1808.02504 ; B, https://arxiv.org/html/2411.00023v2) | **No.** It does not touch understanding |
| C2 | **Engaged-window side-talk measure.** Add mode `ambient-engaged` to the harness: the same side lines scored with `lastTurnAt` = now − 5,000 ms. Also print the result at `ENGAGED_MS` 8,000 and 20,000. Keep 20,000 | `src/lib/thunai/holdout.live.ts` | — (a measure, not a fix) | No published figure for the window length (U) | No |
| C3 | **Captions only while engaged.** The caption recogniser runs only within `ENGAGED_MS` (20,000 ms, `addressed.ts:26`) of the wake or of Jarvis's last turn, or while Jarvis is speaking. One constant, no new number. Today it streams room audio to the browser vendor for as long as the mode is on | `ui/Thunai.tsx` (`:2322`, where `HearingCaptions` is created), `ui/captions.ts`, `ui/conductor.ts` | A unit or browser test that the recogniser's `start` is not called while idle and unengaged, and is called on a wake and inside the window | A (own code read). Outside the window `eou.ts` falls to its fixed 300 ms, as it already does with no captions | No |
| C4 | **Strict audio gate, behind `NEXT_PUBLIC_JARVIS_STRICT_AUDIO_GATE=1`, default off.** With it on, no `/api/jarvis/hear` request is made unless woken or engaged (the same test as C3: within `ENGAGED_MS` of the wake or of Jarvis's last turn, or while Jarvis is speaking), and the route refuses audio that does not carry that engaged mark in the request. **Default behaviour is unchanged:** the capped ambient lane still uploads so a name said late in a sentence is found in the transcript | `ui/ears.ts`, `ui/conductor.ts`, `src/app/api/jarvis/hear/route.ts` | With the flag on: a test that no hear request is made when neither woken nor in window | Rule 3. The flag becomes the default only with the on-device wake (C5) after the room check: owner | No |
| D1 | **Silero's missing 64-sample context.** `sileroRunner` feeds `[1, 512]`. Upstream Python and `vad-web` both prepend the last 64 samples of the previous frame and feed `[1, 576]`. Keep a 64-sample context (zeros at start), prepend it, update it from each frame's tail, zero it in `reset()` | `ui/ears.ts:60-70`, `ui/ears.v4.test.ts` (or a new test beside it) | With a fake session: the `input` tensor has dims `[1, 576]`; its first 64 samples equal the previous frame's last 64 (zeros on the first frame); `reset()` zeroes the context. Fails today | A, code read on both sides: https://raw.githubusercontent.com/snakers4/silero-vad/master/src/silero_vad/utils_vad.py ; https://raw.githubusercontent.com/ricky0123/vad/master/packages/web/src/models/silero.ts . Effect on accuracy unmeasured | No |
| | **After D1:** re-run `vad.spec.ts`, `vadfake.spec.ts`, `bargein.spec.ts`. If onset timing moved, re-tune the speech threshold in `TUNING` (`lib/vad.ts:13`) and record old and new values. If the specs cannot be made green inside the phase, keep the fix behind `NEXT_PUBLIC_JARVIS_VAD_CONTEXT=0` to switch it off, ship it on only when green, and log it | | | | |
| D2 | **Echo setting made switchable and visible.** v4 asks `"all"` first and falls back to `true` (`ears.ts:144-148`†). Make the default `true`; `NEXT_PUBLIC_JARVIS_ECHO=all` asks for `"all"`. The applied value is already stored in `ui/hudstore.ts` (`strip.echo`, `:40-41`) and `Hud.tsx` does not draw it. Show it, and the trace timings, **only in the measurement view** (when `NEXT_PUBLIC_JARVIS_SPEC=1`, or in `ui/JarvisLogView.tsx`), never in the default bottom bar (rule 6). The 8 HUD screenshot specs must pass unchanged. If `getSettings()` does not read `"all"`, the run is a `true` run | `ui/ears.ts`, `ui/hudstore.ts`, `ui/JarvisLogView.tsx` | Unit test on the constraint chosen for each flag value | A that Chrome 141 and Edge 141 accept the value (https://developer.chrome.com/release-notes/141 ; https://learn.microsoft.com/en-us/microsoft-edge/web-platform/release-notes/141). On Windows 11 `"all"` selects a system-loopback canceller and delays the microphone by 170 ms by default; `true` can miss local SAPI voices (A, Chromium source: https://raw.githubusercontent.com/chromium/chromium/main/media/base/media_switches.cc ; https://raw.githubusercontent.com/chromium/chromium/main/content/browser/speech/tts_win.cc). Effect on Edge online natural voices: U | No |
| B1 | **Remove the Gemini third racer.** It returned nothing usable at about 28 calls a day. Take `third` and its call sites out of the race (`stt.ts:244`, `:379-408`†); keep the two forced-language Whisper decodes | `lib/stt.ts`, its tests | A test that no Gemini transcribe request is made on an engaged turn even with `GEMINI_API_KEY` set. Fails today | Brief §3 (own measurement) | No |
| B2 | **Echo guard on the decode's own confidence.** A transcript is dropped as a prompt echo only when (a) three or more prompt names come back in prompt order, or (b) no clarifying question is pending and the detector's speech span is very short **and** the decode's `no_speech_prob` / `avg_logprob` fail the bars `scoreDecode` already uses (`stt.ts:150-166`†: `noSpeech >= 0.3 || logprob < -0.6`; do not invent new thresholds). A one-word answer to a pending question ("Velachery") is never dropped | `lib/stt.ts` | A one-word place-name answer with a clarify pending is kept; three prompt names in order with high `no_speech_prob` is dropped | B: `verbose_json` returns `no_speech_prob`, `avg_logprob`, `compression_ratio` per segment (https://console.groq.com/docs/speech-to-text) | No |
| F1 | **No digit reaches any voice.** Every spoken chunk has its numbers rendered as words in code, in the sentence's language (Tamil number words for Tamil, English words for English), before any TTS call. A spoken chunk that still holds a digit is rejected. The number gate accepts the word form | `lib/speakable.ts`, `lib/numbergate.ts`, `ui/mouth.ts` | A chunk with digits, English and Tamil: assert the string handed to the voice has no digit and the gate still passes it | Rests on C/U: no engine's Tamil digit reading is verified by any source | No |
| A2 | **Capacity honesty.** (a) If the grid's first calls show the provider's `prompt_tokens` more than 10 % above `estimate()` (`llm.ts:21`, which leaves the schema out), add the schema's JSON length to the estimate at the same characters-a-token rate. (b) Log `cached_tokens` per call in the `llm` telemetry. Keep the system text and schema byte-identical per bundle; nothing per-turn before them | `lib/llm.ts`, `src/lib/ai/gateway.ts` | `estimate()` of a call with a schema is at least the tokens of system + prompt + schema. Fails today | B: caching is automatic on `openai/gpt-oss-20b` and `openai/gpt-oss-120b` only, exact prefix, hits not guaranteed, cached tokens not counted toward limits, 2 h expiry (https://console.groq.com/docs/prompt-caching). Whether the schema is billed one-for-one: U | No. It may cut capacity failures |

**Report beside C1, always together:** side talk acted n/N with its interval; unnamed commands refused n/N; level B/C acts (must be 0); the engaged-window figure from C2. On the present harness C1 gives 0/40 **by construction**. That is not evidence about a room. "≤ 5 %" cannot be claimed from 40 items (2/40 has an interval of 1.4–16.5 %): it needs ≤ 4 of 200.

---

## 9. Phases 4 to 6 — the changes, in order of leverage

### Phase 4 — the planner change the grid supports (55 min)

Build only what section 7.5 selects. Nothing here adds text to the prompt: examples replace text, never add to it.

| # | Item | Files | Detail | Fallback | Lifts understanding above 52/60? |
|---|---|---|---|---|---|
| A1 | **Schema diet** (`JARVIS_PLANNER_DIET`, default per the grid) | `lib/round.ts` (`withLook` :289-298, `LOOKUP` :257/:261/:267, `EVERYTHING_SCHEMA` :299-303), `lib/router.ts:45` | `calls`, `done` and the `LOOKUP` line only in the `data` bundle. A sentence that needs a lookup is routed to `data` by the rules. **Check first:** run every lookup-type Tamil and Tanglish sentence in `eval/holdout/` through `bundleByRules`. If any fails to reach `data`, keep `calls`, `done` and `LOOKUP` in `wide` too. About −380 tokens a turn (A, repo arithmetic) | Flag off restores v4 | **No, not on its own.** May win back some of the lost 5 (U: no measurement). The v4 misses went to the second route (readings 5, cases 4) |
| A1b | **Conditional context** (same flag) | `lib/round.ts:341-371`, `lib/frame.ts:45`, `lib/plan.ts:100` | Register line only when `isElliptical` or a "this/that" word. Memory lines only in the `memory` bundle. Metric ids line only on a change word (already so). Tanglish hints only when the bundle is not `wide` (already so). `PERSONA_LINE` out of `CORE` (persona stays in the code templates) | Revert per line | No, not on its own |
| A3 | **Route-then-fill** (`JARVIS_ROUTE_FILL`, default per the grid). Build for cell G in Phase 2; wire into `planRound` only if G beats A | New `lib/shortlist.ts` (router), `lib/bank/*.json`, `lib/round.ts` (`firstPrompt`, `planRound`) | **Router:** character 3–5-gram TF-IDF cosine in TypeScript over the bank, after `normalise.ts`. No package, no model. It sits after the rules lane. **Prompt:** static rules first; then, in the user message, the 5 shortlisted recipes with slots, the other recipe names, 8 examples (least similar first, most similar last), the sentence last. **Schema:** `SCHEMAS.screens` (v4, unchanged, full recipe enum) for every sentence in every language. It applies only when `bundleByRules` returns `screens` or `wide`; the other bundles take the v4 path unchanged. `checkScreen` still decides. Log how often the model's recipe is outside the shortlist; add no new clarify rule in v5. The bank holds no figures; the gate runs as before | If G does not beat A: do not wire it. Keep the files, flag off | **No.** Nearest published shortlist gain: +2.3 to +6.5 F1 at 51 tools (B, https://arxiv.org/html/2606.17519). A router miss cannot be recovered by the planner. Example order: B, https://arxiv.org/html/2309.10954v2 ; count for our models unverified (test 4 if 8 does not fit) |
| A4 | **Metric names in code** | `lib/metrics.ts` (`MetricDef` gains `names: { en: string[]; ta: string[]; tanglish: string[] }`), `lib/understand.ts`, `lib/quick.ts` | Match normalised whole phrases only, before the planner. One match on a "what changed in X" sentence → the `changed` recipe with `metricId` set. No match or two matches → the planner, as today. Names: the owner's list if present; else from the labels already in `MetricDef`, Tanglish forms flagged for a Tamil speaker | Planner names `metricId` as today | No. May move part of the new-intents set (C: no source measured alias matching) |

| A5 | **Strict-mode HTTP 400 handled as a schema failure** (the rule in section 10) | `src/lib/ai/gateway.ts` (`tryModel` :475; v4 already reads the draft out of a `json_validate_failed` reply at `:301-305`: read what it does next before you change anything) | On `json_validate_failed` with no usable draft: one retry on the same model, then the next model; logged as a schema failure, not a capacity failure | If v4 already does this, record "already right" and change nothing | No |
| A6 | **Haiku-ready ladder and the deploy check** (always built; 35 min). No live Claude call | `lib/llm.ts` (`ladder` :26), `src/lib/ai/claude.ts` (`claudeJson` :379; thinking and effort at `:285-288, :342`), `src/lib/ai/gateway.ts`; new `src/lib/thunai/deploy.live.ts`; new `docs/jarvis/DEPLOY_HAIKU.md` | **(a) Ladder.** `JARVIS_PLANNER_LEAD=haiku` (default) and a working `ANTHROPIC_API_KEY`: `claude-haiku-5-5` → the Groq ladder (order unchanged) → `gemini-3.5-flash-lite` → rules. `JARVIS_PLANNER_LEAD=groq`: Groq first, Haiku after Groq. Default of `JARVIS_CLAUDE_MODEL` becomes `claude-haiku-5-5`; `claude-opus-5-5` only by explicit env and never with `thinking: disabled` (Opus rejects it). **(b) Request.** Always `thinking: {type: "disabled"}` (omitting it turns adaptive thinking **on**); `output_config.effort` from `JARVIS_HAIKU_EFFORT`, `low` default, `medium` allowed, anything else falls back to `low` (with thinking disabled, `xhigh`/`max` return 400); `output_config.format` as today; no `temperature`, `top_p`, `top_k` or prefill; `max_tokens` 600; system block byte-identical per bundle with `cache_control`; keep v4's 1-token warm call with the same format, thinking and effort (it also compiles the grammar before the first spoken turn). **(c) Failure handling.** 401/403: mark the key refused for 10 minutes and skip Claude at once. 429: next rung, logged as capacity. `stop_reason` `"refusal"` or `"max_tokens"`: next rung, logged. 400 "schema too complex": the existing plain-JSON path, logged with `path`. **(d) Deploy check** (section 9, "The deploy check") | Flag `JARVIS_PLANNER_LEAD=groq` | **Unknown.** Haiku is the best chance of the build's items to lift the live-60, and no source measures it on Tamil |
| A7 | **Compact plan for the Claude rung** (`JARVIS_PLAN_COMPACT=1`, default off; Claude path only; the Groq schemas are untouched) | `lib/round.ts` (`SCHEMAS`), `lib/agent.ts` (`Screen`, `checkScreen`), `src/lib/ai/claude.ts` | Output schema: `kind`, `recipe` (required, first), `slots` as an array of `{key, value}` with `key` an enum of the screen slot keys and `value` a string, only for slots that have a value, then `reply`, `options`. Convert in code to the same `Screen` (absent slots null) before `checkScreen`. Cuts about 150 of 230 output tokens; output tokens set Haiku's time (input costs about 0.25 s per 100,000 tokens: B, https://platform.claude.com/cookbook/latency-optimization-latency-optimization). Count the schema's optional and union parameters in a unit test against Anthropic's per-request limits (24 optional, 16 union: B, https://platform.claude.com/docs/en/build-with-claude/structured-outputs) | Flag off | No. Latency only; its accuracy is measured on deploy day |

**Tests for Phase 4 (each written first; invented sentences only).**

| Item | Test |
|---|---|
| A1, A1b | With the flag on, `SCHEMAS.screens` has no `calls` or `done` and `systemFor("screens")` has no LOOKUP text. With it off, both are byte-equal to v4 |
| A3 | The shortlist contains the gold recipe for 3 invented sentences per language form. Flag off gives the v4 prompt byte for byte |
| A4 | One alias match sets `metricId`. Two matches go to the planner |
| A5 | In `src/lib/ai/gateway.test.ts`, with a mocked 400: same model retried once, then the next model, outcome logged as a schema failure. It must fail on the start commit, or the code is already right |
| A6 | Mocked Anthropic client only (no network): the request body for Haiku has `thinking: {type: "disabled"}`, the effort from `JARVIS_HAIKU_EFFORT` (`low` by default, `max` coerced to `low`), the format, and no `temperature`; the ladder order for each value of `JARVIS_PLANNER_LEAD`; a mocked 401 skips Claude at once and a second turn inside 10 minutes makes no Claude call; a mocked `stop_reason: "refusal"` and `"max_tokens"` each fall to the first Groq rung; Opus is never sent `disabled`. `src/lib/thunai/nokeys.v4.test.ts` stays green |
| A7 | A compact plan with three slots converts to the same `Screen` as the full plan with the other slots null; an unknown slot key is rejected by the schema; the schema's optional and union counts are under 24 and 16; flag off sends the v4 schema byte for byte |

Cut line for Phase 4: keep whatever 7.5 selected among A1, A1b, A3, **and keep A6 in every case** (the owner's deploy depends on it). Cut A4 first, then A5, then A7.

#### The deploy check (item A6 d)

The owner runs it once the Haiku key works. You build it, test its pure parts with mocks, and **never run it live.**

| Item | Value |
|---|---|
| Command | `HOLDOUT=deploy-haiku npx vitest run --config vitest.live.config.ts src/lib/thunai/deploy.live.ts` (the live config already includes `src/**/*.live.ts`) |
| Step 1, key | One tiny call. On 401 or any refusal: print "key refused", stop, cost $0. Else log the `anthropic-ratelimit-*` header names and values (never the key) |
| Step 2, timing | One warm call per bundle, then 20 calls each on the `screens` and `wide` bundles with sentences from `eval/holdout/tuning24.jsonl`, for three arms: thinking off + `low`; thinking off + `medium`; thinking off + `low` + compact plan. Log per call: total ms, `output_tokens`, `input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `stop_reason`, `path`. First (cold) call reported apart |
| Step 3, tuning accuracy | The 24 tuning sentences, one run per arm, scored like grid cell B; paired by script against this build's Groq grid file for cell B on each Groq model (b, c, p) |
| Step 4, live-60 | The live-60 through the existing runner pinned to Haiku with the arm Step 3 picks (`HOLDOUT=planner2 HOLDOUT_DIR=holdout2 HOLDOUT_SET=live60 HOLDOUT_TAG=deploy-haiku`; add a pin such as `HOLDOUT_PIN=anthropic:claude-haiku-5-5` if the runner has none). Paired by script against this build's final Groq live-60 result file (`v5final`), or, if that run is still owed, against `eval/holdout2/results/v4final-groq-planner-live60.json` (say which): **b, c and exact p only, never ids or text** |
| Decision, printed | **Effort:** `medium` only if it beats `low` by b − c ≥ 3 on Step 3 and its whole-call p50 ≤ 1,200 ms; else `low`. **Compact:** on if it is not worse than full (c − b < 3) and saves ≥ 200 ms p50. **Lead:** Haiku stays first unless it is worse than Groq on the live-60 by c − b ≥ 3, or its whole-call p50 for the chosen arm is over 1,500 ms; then print "set `JARVIS_PLANNER_LEAD=groq`". The check prints the env lines to set; it never edits `.env` |
| Cost cap | Computed from `usage` at $0.10 / $0.50 per million input / output tokens; stop at **US$0.50**. Expected about $0.15 |
| Output | `eval/holdout/results/deploy-haiku-*.json` and a printed summary with intervals |
| `docs/jarvis/DEPLOY_HAIKU.md` | For the owner: fix the key, run the command, read the decision, set the printed env lines, restart. Monthly cost at 300 turns a day: about $3.42–$4.45 (2,650 in, 230 out a turn; floor and +30 % tokenizer), about $2.75–$3.46 with the compact plan |

Prices and fields: B, https://platform.claude.com/docs/en/about-claude/pricing ; https://platform.claude.com/docs/en/build-with-claude/thinking ; https://platform.claude.com/docs/en/build-with-claude/effort .

Not built: a `why` field by default; fewer slot keys; a changed field order; streaming the plan; tool calling on Groq (neither streaming nor tools work with Groq Structured Outputs: B, https://console.groq.com/docs/structured-outputs); two plans a turn; a small-model router; an embedding router.

### Phase 5 — latency: trace, then overlap (45 min)

Target: planner lane p50 ≤ 2.2 s. **Expected: about 2.1 s.** Rests on C. Lifts understanding: **no.**

Budget, clock from the last voiced sample:

| # | Stage | Today | Budget | Clock | Grade |
|---|---|---|---|---|---|
| 1 | Silence before the upload starts (the 300 ms end-of-utterance wait runs beside stage 2) | 300 ms, then upload | 150 ms | 150 | C; U for Tamil pause lengths |
| 2 | Speech-to-text, server time, warm connection | 513 ms | 450 ms | 600 | own; C for the saving |
| 3 | Address gate + rules | not measured | 10 ms | 610 | U |
| 4 | Planner, whole strict-JSON call (Groq cannot stream it) | 1,200 ms | 1,200 ms | 1,810 | own; B |
| 5 | Tools in process + code-built first sentence + number gate | not measured | 40 ms | 1,850 | U |
| 6 | NDJSON event to the browser | not measured | 5 ms | 1,855 | C |
| 7 | Edge voice starts | not measured | 250 ms | 2,105 | U for Edge |
| | **Total** | 2,300–2,800 | **2,105 ms** | | 95 ms of slack to 2.2 s |

At deploy, with Haiku and the compact plan, stage 4 is budgeted at 1,000 ms (0.45–1.03 s on two published rates plus the India round trip, U): total about 1,905 ms. Without the compact plan Haiku's stage 4 is about 0.71–1.85 s plus the round trip. With `echoCancellation: "all"`, Chromium delays the microphone by 170 ms by default (`added_delay_ms`, A, https://raw.githubusercontent.com/chromium/chromium/main/media/base/media_switches.cc): add 170 ms to the Groq lane (2,275 ms, over target).

Rules lane (target ≤ 1.0 s): 150 + 450 + 10 + 40 + 5 + 250 = 905 ms, 95 ms of slack.

| # | Item | Files | Detail and rule | Fallback |
|---|---|---|---|---|
| E1 | **Read the trace first** | section 6.4 | Find the unexplained 300–800 ms. If one stage holds it (a cold connection, a retry, a slow voice start), fix that stage before anything below | — |
| E2 | **Early speech-to-text** (`NEXT_PUBLIC_JARVIS_EARLY_STT`, default on if its tests pass) | `ui/conductor.ts`, `ui/ears.ts`, `src/app/api/jarvis/hear/route.ts` | Start the upload at 150 ms of silence; abort it if speech resumes; at most 2 attempts a turn; skip when the utterance is over 10 s; **only when woken or inside the follow-up window** (rule 3). Failing-first test: a resumed-speech case aborts the first request and the transcript used is the full one. Report extra Whisper calls a turn. Whisper base limits are 20 requests a minute per model (B, https://console.groq.com/docs/rate-limits). The "100–200 ms" gain is a vendor claim on a model with no Tamil (C, https://developers.deepgram.com/docs/flux/voice-agent-eager-eot) | Fixed 300 ms as today |
| E3 | **Warm connection** | `lib/stt.ts`, `src/lib/ai/gateway.ts` (`createGroq({ fetch })`) | npm `undici` (MIT, https://raw.githubusercontent.com/nodejs/undici/main/LICENSE): `new Agent({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 600_000 })`. **Use `fetch` and `Agent` from the same `undici` package**; passing an npm `Agent` to the built-in or Next-wrapped `fetch` is unverified. Option names verified for undici v8.10.0; pin the version `npm` resolves and record it. Measure stage 2 before and after in the trace. **Drop it if the gain is under 30 ms.** No warm-up request with user data | Leave the default; if stage 2 stays 513 ms the lane is 2,168 ms, still inside 2.2 s |
| E4 | **Code-built first sentence as soon as the plan returns** | `lib/round.ts`, `lib/streamturn.ts`, `lib/screens.ts`, `lib/recipes/*` | Check whether sentence 1 is already written by code from the built screen. If it is, record "already right" and change nothing. If the first sentence waits on the model's `reply`, speak a per-recipe template sentence with numbers from code first; the model's `reply` supplies later sentences through the gate | As today |
| F2 | **Voice start, measured once** | a headed Playwright run with `channel: "msedge"` | Time from `speak()` to `onstart` for the Tamil voice, and whether `boundary` events fire. If the natural voices are not listed in the automated browser, move this to the room check | Room check |
| D3 | **Re-speak after a false interruption** | `lib/turn.ts`, `ui/mouth.ts` | If the voice stopped and no caption words arrive within the timeout, `cancel()` and re-speak from the start of the cut sentence. **Never use `speechSynthesis.pause()` / `resume()` as the mechanism.** If v4 already does this, record it. Failing-first test if not | Leave as is |

Tests for Phase 5: E2 and D3 carry theirs above. E3 is measured, not unit-tested (stage 2 before and after, in the trace). E4: a unit test that the first spoken sentence of a planner turn is built by code and passes the number gate before the model's `reply` is used; if v4 already passes it, record "already right".

Cut line for Phase 5: keep E1 and E2. Cut D3, then F2 (move it to the room check), then E3, then E4.

Not built: streaming speech-to-text (a Next route handler cannot hold a WebSocket; the best Tamil service has no browser token and publishes no latency), planner speculation, any filler phrase counted as meeting the target.

### Phase 6 — flagged extras (85 min; all optional, all default off)

**Lifts understanding above 52/60: no, for every item here.** The 60 and the Tamil 30 are scored from text; C5, B3 and B5 act on audio, G3 on memory.

| # | Item | Files | Exact choice | Status | Fallback |
|---|---|---|---|---|---|
| C5 | **On-device wake word**, `NEXT_PUBLIC_JARVIS_WAKE=device`, default `browser` | `ui/wake.ts`, `ui/ears.ts`, `public/thunai/` | npm `@livekit/wakeword` **2.1.2**, Apache-2.0. Import `@livekit/wakeword/core` and pass the app's existing `ort` object: `new WakeWordModel(ort)`, `loadModel(bytes, name)`. **One runtime in the page: do not add a second `onnxruntime-web`.** Model `hey_jarvis.onnx` from the `livekit/livekit-wakeword` release v2.1.2 (7,406,177 bytes), copied to `public/thunai/`. Listener: threshold 0.5, debounce 2. One WASM thread; **no COOP/COEP headers**. After a wake, confirm the name in the transcript before the planner runs. The transcript name check stays a way in | Package version, licence (LICENSE and NOTICE read), `/core` export, model size: **verified** (A, https://registry.npmjs.org/@livekit/wakeword ; https://raw.githubusercontent.com/livekit/livekit-wakeword/main/LICENSE ; https://api.github.com/repos/livekit/livekit-wakeword/releases). Accuracy on "Hi Jarvis", bare "Jarvis", Tamil forms: **unverified**. The browser client was first published 6 Nov 2026. Its peer range wants `onnxruntime-web ^1.31.1`; the app has `1.31.0-dev.20260914-8d85527a0`: behaviour with the app's copy **unverified** | If it does not load on the app's `ort`, do not ship it. Today's browser wake stays |
| B3 | **Gazetteer corrector**, `JARVIS_GAZETTEER=1`, default off | New `lib/gazetteer.ts`, called from `lib/stt.ts` after the decode | Own TypeScript, no package. Names: the owner's list if present, else the zones, localities and departments already in the repo (`lexicon.ts`, `entities.ts`), in Tamil script and common romanised spellings. Token and bigram windows; normalised edit distance plus a consonant-skeleton key; accept only above a strict threshold **and** only when one candidate wins clearly. Never touches digits or number words. Logs counts of corrected and uncorrected, never text. Set the threshold on invented misspellings ("Udyar" → Adyar, "Vela Cherry" → Velachery) so that a list of ordinary words gives zero false fixes; record it. **Test** (`lib/gazetteer.test.ts`): the two invented misspellings are fixed; a list of ordinary words comes back unchanged; digits and number words are untouched | No published number for a deterministic corrector (C) | Flag off |
| B4 | **Cut: Sarvam is not affordable (owner, 15 Nov 2026).** Do not build or test it | — | — | — | — |
| B5 | **Free local Tamil decode: measure first** (45 min). Wiring, if any, behind `JARVIS_LOCAL_TAMIL_STT=1`, **default off** (owner decides the weights' licence) | Measurement in a scratch folder outside the repo (for example `%TEMP%\jv5-stt-spike`); wiring, only if the gates pass and 30 minutes remain: `lib/stt.ts`, `src/app/api/jarvis/hear/route.ts`, `next.config.js` | **Runtime:** npm `sherpa-onnx-node` **2.0.1** (Apache-2.0; optional dependency `sherpa-onnx-win-x64` 2.0.1 is the Windows prebuilt), in the Node process: `OfflineRecognizer` with `modelConfig.nemoCtc.model`, `tokens`, `numThreads`, `provider: "cpu"`, 16 kHz, 80-dim features (the official `test_asr_non_streaming_nemo_ctc.js` example). **No Python, no second service.** **Models** (test use only): AI4Bharat IndicConformer Tamil mono, CTC head, about 120M, first (`csndhanasekar/sherpa-onnx-indicconformer-ta-int8`, 138 MB, sherpa format; and `OpenVoiceOS/ai4bharat-indicconformer-ta-onnx`, fp32 and int8, `base_model` = the official `indicconformer_stt_ta_hybrid_ctc_rnnt_large`; whether sherpa loads the OpenVoiceOS files as they are is unverified); then the 600M Tamil file (`Docglasses-AI/indic-conformer-600m-sherpa-onnx-int8`, `indicconformer-ta.int8.onnx`, 659 MB). Record each file's SHA-256. **Clips:** 200 rows of the FLEURS `ta_in` test split by a seeded shuffle (public, CC BY 4.0, `test.tar.gz` 406.6 MB; count the rows), resampled to 16 kHz mono if needed, kept outside git, deleted after. **Measure:** load time; decode p50 and p90 for 5–7 s clips at `numThreads` 2 and 4; process RSS; **fp32 and int8 both** (a QInt8 export can fail to load on ONNX Runtime's CPU provider with a ConvInteger error, C; int8 was slower than fp32 on x86 in one published table, B; and drifted without VNNI, B); plain WER and CER after one hand-rolled normaliser (NFC, strip punctuation, lower-case Latin), **paired** against forced-Tamil Groq `whisper-large-v3` on the same 200 clips (200 Whisper requests, 10 % of a day). **Gates:** Tamil WER ≥ 10 points below forced-Tamil Groq; 6 s clip p50 ≤ 700 ms and p90 ≤ 1.5 s at 4 threads; RSS ≤ 1.5 GB. **If they pass and 30 min remain:** add `sherpa-onnx-node` to the app, `serverExternalPackages: ['sherpa-onnx-node']` in `next.config.js` (an inference: check the Next 15 docs), Node runtime on the hear route, the Tamil leg decodes locally with a 1,500 ms timeout and falls back to forced-Tamil Groq; the model file lives in a gitignored `data/models/` and is never committed; the English Groq racer is unchanged. Failing-first test: with the flag off, no local recogniser is created; with it on and the recogniser throwing, the Groq Tamil leg answers | Accuracy B: FLEURS Tamil full test, IndicConformer-600M WER 25.49 against Whisper-large-v3 48.58, one normaliser, run by a rival model's maker (https://huggingface.co/lemuralabs/tamil-asr-qwen3/raw/main/README.md). Code licence MIT, file read (A, https://raw.githubusercontent.com/AI4Bharat/IndicConformerASR/master/LICENSE); HF weights gated, tag only. Runtime A (https://registry.npmjs.org/sherpa-onnx-node/latest). **Speed on an x86 laptop: never measured** (estimate 0.15–0.35 s for 6 s on the 120M model, from Parakeet CTC 0.6B at RTFx 34.8–43.2 on a Ryzen 7 9800X3D: B, https://istupakov.github.io/onnx-asr/benchmarks/). Output is Tamil script only: English words in Tanglish come out transliterated; no hotwords on CTC; no streaming | Groq forced-Tamil, as today. If a gate fails, write the figures and stop |
| G3 | **Memory write rules** | `lib/plan.ts:100`, `lib/store.ts`, the memory step in `lib/agent.ts` | (a) No save in a turn whose Stage showed news or complaint text unless the Collector repeats the note in his own words. (c) Each entry stores `source: "collector-spoken"`, time and turn id; entries without it are dropped from the prompt. The letters are area G's: its rule (b), a habit written only after the same correction twice, was cut by the skeptic ("twice" has no source) and is not built. Failing-first test for each, in a new `src/lib/thunai/memorywrite.test.ts` | B (the authors' own defence, one simulated agent: https://arxiv.org/html/2605.01970v4). No section 4.2 measure moves | Current behaviour |

Cut line for Phase 6: the whole phase can be cut. Cut order: G3, C5, B3, then B5's wiring (keep B5's measurement if any time remains: it decides the owner's free-Tamil question). (B4 is already cut.)

**Not in this build, whatever time is left:** Silero v6 (only after D1 and a threshold re-tune; a later build); any turn-completion model; speaker verification; an Azure or Sarvam voice; a custom wake model; the address-gate model veto; a voice framework, WebRTC or a custom server; cross-origin isolation headers; a Python sidecar for speech (it would break "no separate backend"; owner's call); Cloudflare Workers AI (needs an account); local Whisper (1.1–1.5 s per 6 s on a fast desktop and weak Tamil); any audio sent to Claude (the API takes none).

---

## 10. When a key is missing or refused

| Situation | Do |
|---|---|
| Any Anthropic key in `.env` (it returned 401 on 15 Nov 2026) | **Make no live Claude call, whether it works or not** (owner: test with Groq, Haiku at deploy). Every Claude path is unit-tested with mocks (A6). **Live runs pin Groq** (`JARVIS_PLANNER_LEAD=groq` in the run's environment), so a working key cannot make the Haiku rung answer a scored turn. Write "Claude not called by design" in the build log |
| The owner later runs the deploy check | Section 9, "The deploy check". It stops at once, at $0, if the key is refused |
| Any other paid key is present in `.env` | Ignore it. Only Groq free, Gemini free and Anthropic are used |
| Groq 429 during a run | The run is a capacity failure. Do not move it to another model. Re-run only when the ledger says it can finish |
| Groq strict-mode HTTP 400 `json_validate_failed` | Record as its own outcome. In production code (item A5 in section 9, with its file and test): one retry on the same model, then the next model; log it as a schema failure, not a capacity failure (a user report exists for `openai/gpt-oss-20b`: C, https://discuss.huggingface.co/t/groq-route-intermittently-returns-json-validate-failed-with-strict-structured-outputs/179097) |
| `qwen/qwen3.8-27b` returns 404 (it is a Preview model) | Drop it from that run; log it |
| A package will not install, a model file will not download, a licence file cannot be read | Do not ship the item. Take its fallback. Log it |
| Anything needs a new account, a purchase, a console setting or a new key | **Stop that item.** Write it under "Owner actions" in the handover. Never create one |

---

## 11. Honest evaluation

### 11.1 The sets

| Set | State | You may |
|---|---|---|
| `eval/holdout/` | Already read | Read it, tune on it. **The only set you tune on** |
| `eval/holdout2/` (live-60, ambient) | Frozen by hash (`HASHES.txt`), unread | Run it through the runner. Look at totals only |
| `eval/holdout3/` (new intents, look-alike side talk) | Frozen by hash, **unread** | Same. **Never open, list, print, grep or diff a file in it, and never open a per-row result file from it.** Only the runner touches it; only totals are looked at |
| `eval/dev200/`, `eval/sidetalk200/` | You freeze them by hash in Phase 1 | Run and count. Never read, never tune on |

- The runner recomputes sha256 for every set except `holdout` and throws on a mismatch (`holdout.live.ts:41-49`). Add the two new sets to the same check.
- **Gate:** at the end, `git diff --stat 40ff9082 -- chennai-grievance-portal-main/eval/holdout2 chennai-grievance-portal-main/eval/holdout3` shows nothing but new files under `results/`.
- Paired comparisons on frozen sets are computed by script and print b, c and p only.
- Never write a test, an example, a rule or a bank line from a frozen sentence. Tests use invented sentences.

### 11.2 How every score is reported

| Rule | Detail |
|---|---|
| Interval | Wilson 95 % on every score |
| Build against build | Same sentences, exact McNemar (mid-p beside it), b and c printed. Never compare runs on different sentences |
| Repeats | Where quota allows: three runs a sentence, majority scoring, pass^1 and pass^3 |
| Per model | The answering model is logged per turn; every understanding score is also split by model |
| Capacity | A run with any 429 is a capacity failure. Print the count. Print the clean-turn score beside the all-turn score |
| First run and final run | Reported separately, never merged. If no planner-affecting code changed after the first run, say the first run is the final |
| Pinned and ladder | The like-for-like figure against 39/60 and 44/60 is the shipped ladder. A pinned run is reported beside it when quota allows. Never present a ladder score as one model's score |
| A win | Do not call a change a win on the frozen 60 from a single run, or from fewer than about 9 net sentences (power for a 10-point step at n = 60 is 0.40) |
| Latency | Clock from the last voiced sample. p50 and p90 with n. With few turns the p90 is indicative: say so |
| No judge | No model judge gates anything |
| Not verified | Every report ends with a "Not verified" list |

### 11.3 The quota calendar (free tier: 200,000 tokens a day and 8,000 a minute per model; three models)

| Day | Runs | Tokens (estimate) |
|---|---|---|
| 1 | The grid (section 7). Then, only if the ledger allows: the real-latency run, baseline and final | 163,200 + 176,000 + 176,000 |
| 2 | **Final runs on the shipped ladder:** live-60 (`HOLDOUT=planner2 HOLDOUT_DIR=holdout2 HOLDOUT_SET=live60 HOLDOUT_TAG=v5final`), then new intents (`HOLDOUT=planner3 HOLDOUT_DIR=holdout3 HOLDOUT_SET=live30 HOLDOUT_TAG=v5final`), then the repeats for pass^3: run the live-60 command twice more (tags `v5final-r1`, `-r2`, `-r3` for the three runs) **only if the ledger fits all three**; else take the first 20 ids of `live60.json` by a seeded shuffle done in code (ids never printed) and run those three times. Compute pass^1, pass^3 and majority by script from the three result files. No-model runs: `ambient` and the new `ambient-engaged` on `holdout2`, `holdout3`, `sidetalk200`; `rules3` | 60 × 2,878 = 172,680 a run; 30 × about 2,900; repeats: 60 × 2,878 × 3 = 518,040, or 20 × 2,878 × 3 = 172,680 |
| 2–4 | Owed: the grid's winner against cell A on the full tuning set, three runs a sentence | 24 × 3 × 2 cells |
| later | Owed: `dev200`, one pass a day per model at most | 200 × 2,878 = 575,600 a pass |

- **The free tier cannot carry 300 planner turns a day** (about 69 calls a model a day at 2,880 tokens). That is a fact for the handover, not a defect to fix in code. Gpt-oss cached tokens do not count toward the limit (B, https://console.groq.com/docs/prompt-caching): keep the static prefix byte-identical.
- The default pacing is `LIVE_GAP_MS` = 12,000 ms between sentences. The runner checks the ledger and refuses a run that cannot finish (`holdout.live.ts:244`).
- When the Groq daily window resets is unverified. Read the 429's `retry-after` and the ledger.
- Results go to `eval/<dir>/results/<tag>-<mode>.json`.
- If you cannot run day 2: write each owed run in the handover with its exact command and expected token cost, and list every figure it would have produced under "Not verified". **Never fill a missing run with an estimate.**

### 11.4 Privacy in the work itself

- **No audio is stored.** No microphone recording of any person is made, kept or committed by you. Test audio is synthetic (made by the app's own TTS) or a public permissive set kept outside git, and is labelled so.
- **Overheard speech is never logged and never sent to a model**, in tests as in the app. The side-talk sets are invented text. Logs of side-talk runs hold counts and the tier that fired, never the sentence.
- **Test sentences are synthetic.** No real complaint text, no citizen's words, no phone number, no Aadhaar, anywhere: tests, bank, sets, prompts, logs.
- The trace and all telemetry hold timings, ids, model names and counts only.
- Nothing sensitive goes to the Gemini free tier (its terms let unpaid content be used to improve products and be read by people: B, https://aistudio.google.com/docs/terms).
- Never record real office chatter as a test set.

---

## 12. The gates stay green

Run from `chennai-grievance-portal-main/`.

| Gate | Exact command |
|---|---|
| Unit suite | `npx vitest run` |
| Type check | `npx tsc --noEmit --incremental false` |
| Build | `npx next build` |
| Jarvis browser specs | `npx playwright test tests/e2e/mode.spec.ts tests/e2e/bargein.spec.ts tests/e2e/hold.spec.ts tests/e2e/vad.spec.ts tests/e2e/vadfake.spec.ts tests/e2e/e2e-latency.spec.ts tests/e2e/hud.spec.ts` (dev server on 127.0.0.1:3011; first check that no other tree's server holds that port, or pin your own with `SPEC_URL`: section 5, "Ports") |
| QA gate | `bash tests/qa/pass7/gate-fast.sh` (two lanes; `gate.sh` is the same gate in one lane). Evidence goes to `../docs/qa/pass7/evidence/` |

The QA gate runs: tsc, `next lint`, the production build (`NEXT_DIST_DIR=.next-qa NEXT_TELEMETRY_DISABLED=1 npx next build`), pass 4's real-path suite, four shuffled unit runs, the pass 7 tests, source guards, the golden master and its diff, the access matrix, the browser drive and journey j1. Start it in the background early in Phase 7 and again before the final commit; it is long.

**Known traps†. Each one cost the last build time.** The QA data files, port 3106 and `p7-gate-r3` are in `docs/thunai/HANDOVER.md:108`, `docs/thunai/BUILD_LOG.md:41-44` and `tests/qa/pass7/gate-fast.sh` at `40ff9082`. The lock path and the RC-35 count (9/9) were not re-checked: confirm them.

| Trap | What to do |
|---|---|
| A new worktree lacks the QA harness's gitignored data. The gate then fails on Collector sign-in (401) and the pinned API and the 3106 server do not start | Before the first gate run, copy from `E:/farm/.claude/worktrees/priceless-bouman-2fe7f8/chennai-grievance-portal-main/data/aws-cache/qa/` into your `data/aws-cache/qa/`: `pinned/`, `golden/`, `durable.sqlite` **and the matching `test-collector.txt`**. A fresh `test-collector.txt` does not match the copied hashes. The main checkout has none of these |
| Both gate scripts hard-code a lock folder from an earlier session (`gate.sh:18`, `gate-fast.sh:21`: `C:/Users/arjun/AppData/Local/Claude-Data/…/vitest-4599.lock`) and wait on it forever | Before the run, check that the lock's parent folder exists (create it if not) and that no stale `vitest-4599.lock` folder is left by a dead session. Remove a stale one only when no other session is running the gate. If you must change the path in the script, list it as a gate-script change |
| Both scripts run `git checkout -- tsconfig.json next-env.d.ts` and restore evidence files with `git checkout` | Commit everything first. Never run the gate with uncommitted edits to those files |
| `g2-cache` RC-35 has a known 180 s load timeout under the full gate | It passes alone (9/9). Run it alone and record that. Not a regression |
| The golden diff needs the previous gate's recording | If `p7-gate-r3` is missing, rebuild it from `40ff9082` and say so |
| Pass 4's suite can report a vitest "onTaskUpdate" timeout with every test green | Read the JSON report |

**QA oracles.** Any change to a QA oracle (an expected value, a golden recording, a source guard) is listed in a new file `docs/qa/pass7/V5_EXPECTED_CHANGES.md`: the oracle, old value, new value, the item in this prompt that requires it. An oracle may change only when this prompt requires the behaviour change (for example C1: an unnamed, unengaged command is now refused). Anything else red is a regression: fix the code, not the oracle. A red item is acceptable only if you prove it is red on `40ff9082` too.

---

## 13. Phases

| # | Min | Work | Cut line |
|---|---|---|---|
| 0 | 45 | Setup; branch check; baseline worktree; no-quota baselines (section 5); Groq `x-ratelimit-*` headers logged on the first call (no Claude call) | mandatory |
| 1 | 50 | `evalstats`; per-turn record; Step 0; the trace; tuning set; bank draft started; side-talk and dev sets drafted and frozen | mandatory. If short: freeze `sidetalk200` only and owe `dev200` |
| 2 | 30 | The grid, in the background (about 22 min plus pacing); router and bank for cell G; read the result against 7.5 | mandatory. If the bank is late, run G last or owe it |
| 3 | 60 | Section 8, in four lanes with disjoint files, while the grid runs. Lane 1: C1, C2 (`addressed.ts`, `holdout.live.ts`). Lane 2: C3, C4, D1, D2, in that order (`Thunai.tsx`, `captions.ts`, `conductor.ts`, `ears.ts`, `hear/route.ts`, `hudstore.ts`, `JarvisLogView.tsx`). Lane 3: B1, B2 (`stt.ts`). Lane 4: F1 (`speakable.ts`, `numbergate.ts`, `mouth.ts`). A2 by the lead, after the grid's first calls (`llm.ts`, `gateway.ts`) | keep C1, C2, D1, B1, F1, A2. Cut C4, then D2, then B2 |
| 4 | 90 | The planner change 7.5 selects (A1, A1b, A3), then A6 (Haiku-ready ladder and the deploy check), A4, A5, A7 | keep what 7.5 selected **and A6**. Cut A4, then A5, then A7 |
| 5 | 45 | E1, E2, E3, E4, F2, D3 | keep E1, E2 |
| 6 | 85 | B5 measurement first, then C5, B3, G3, then B5 wiring if its gates passed | the whole phase can be cut; keep B5's measurement last of all |
| 7 | 40 | Independent review (section 15); fix every upheld finding; QA gate started in the background at the start of this phase | mandatory |
| 8 | 45 | All gates; no-model final runs; any live run the ledger allows; results, handover, demo, references; remove the baseline worktree (junctions first); push the branch | mandatory |
| Day 2 | 60 | Final live runs (section 11.3), results updated, branch pushed | owed in the handover if the session cannot wait |

Sum of day 1: 45 + 50 + 30 + 60 + 90 + 45 + 85 + 40 + 45 = 490 minutes. Phases 0, 1, 2, 7 and 8 are mandatory. Keep `docs/thunai/BUILD_LOG.md` with a timestamp, the decision and the cut for every step.

---

## 14. Acceptance

"Gate" must hold before you call the build done. "Report" is measured and written down honestly, met or not.

| Measure | Target | Gate or report | Honest expectation |
|---|---|---|---|
| Unit suite (count from Phase 0) plus new tests; `tsc`; `next build`; Jarvis browser specs | all green | **gate** | — |
| QA gate `gate-fast.sh` | green, or every red item proven red on `40ff9082`; RC-35 passing alone | **gate** | — |
| Every QA oracle change listed and justified in `V5_EXPECTED_CHANGES.md` | complete | **gate** | — |
| Every spoken number traced to code; no digit handed to a voice (F1) | tested on every chunk | **gate** | — |
| Never send, approve, delete; level B/C acts from side talk | 0 | **gate** | — |
| Frozen sets untouched (hash check and the `git diff --stat` in 11.1) | clean | **gate** | — |
| No audio file, transcript of overheard speech, or citizen text written by the build or the app | none | **gate** | — |
| Every defect fixed has a test that failed on `40ff9082` (commit order shows it), Silero context (D1) included | all | **gate** | — |
| Barge-in duck after onset | p90 ≤ 250 ms | **gate** (`bargein.spec.ts`) | 84 ms today |
| Removing every model key: the turn completes from rules or says it cannot reason, within 8 s | covered by `src/lib/thunai/nokeys.v4.test.ts` (exists at `40ff9082`); it stays green in `npx vitest run`. Add no new test unless a v5 change touches the ladder | **gate** | — |
| Understanding, live-60, shipped Groq ladder | ≥ 52/60 | report, with interval, per model, b and c against the 15 Nov run | **Not likely from code.** About 44/60 if the grid blames the v4 additions; 39 ± noise if it does not |
| Tamil on that set | ≥ 26/30 | report | Unlikely on the free models; that set is scored from text, so speech-to-text cannot move it |
| New intents (`holdout3` live sample) | ≥ 75 % | report | Unknown (U) |
| Same sentence three times, right all three; pass^1 and pass^3 | reported (the three tagged runs of section 11.3, day 2; computed by script) | report | — |
| Side talk that acted | ≤ 5 % | report, **always beside the count of real unnamed commands refused**, the engaged-window figure and the interval | 0/40 on the present harness by construction after C1. ≤ 5 % is provable only as ≤ 4 of 200 |
| End of speech → first spoken finding, planner lane | p50 ≤ 2.2 s | report (mocked, and real if the ledger allowed) | **About 2.1 s.** 1.8 s is not promised |
| End of speech → first spoken finding, rules lane | ≤ 1.0 s | report | About 1.0 s |
| Speech-to-text, server time, engaged turn | p50 ≤ 700 ms | report | 513 ms today |
| Planner tokens a turn | ≤ 2,500 | report **three counts**: the code's own (system + user, no schema); provider-counted input (with schema); provider-counted input + output | About −380 with A1. English may meet it; Tamil (`wide`) will not |
| Capacity failures in each live run | count | report | — |
| The per-stage trace: where the unexplained 300–800 ms sits | found or not | report | — |
| The grid: every cell, every pair, b, c, p | complete | report | Direction only |
| No live Claude call made by the build or its runs | none in any log or result file | **gate** | — |
| Haiku-ready ladder (A6 a–c) with its mocked tests; the deploy check and `DEPLOY_HAIKU.md` exist; the check's pure parts (decision rule, cost cap, pairing that prints b, c, p only) unit-tested | complete | **gate** | — |
| Groq `x-ratelimit-*` figures on the first call: free plan or not | recorded | report | Free-plan figures expected |
| Free local Tamil decode (B5): WER and CER against forced-Tamil Groq on the same clips, paired; p50/p90 at 2 and 4 threads; RSS; fp32 and int8 | measured, or "not run" with the reason | report | Unknown. The 120M model is likely fast enough; whether it beats Groq by 10 points on FLEURS clips is the question |

---

## 15. Independent review, before the final runs (Phase 7, mandatory)

- Five reviewers, each a fresh subagent that has not seen your reasoning, one per risk area. Then five skeptics, one per area, who try to refute each finding. **Never more than five agents at once:** run the reviewers, then the skeptics.

| Area | Looks for |
|---|---|
| Numbers and privacy | Any path where a model-written figure or a digit reaches speech or the screen; any log, trace or prompt holding transcript text of unaddressed speech or citizen words; any stored audio |
| Address gate, captions, wake | Tier 3 really gone and the stop word kept; engaged-window logic; captions off when idle; the flags default to the safe value; "Hi Jarvis" still wakes from off as before (rule 6) |
| Planner, prompt and quota | The shipped planner matches what the grid selected and nothing more; flags restore v4; `checkScreen` still guards every plan; the estimate fix; no added prompt text; the Haiku request fields (thinking disabled, effort, no temperature), the ladder flags, the compact plan's conversion, and no live Claude call anywhere |
| Voice, detector and latency | The Silero context fix against upstream; early upload aborts and never runs unengaged; no `pause()`/`resume()`; trace zero at the last voiced sample |
| Evaluation honesty | Frozen sets untouched and unread; no test or bank line derived from them; statistics correct against the test vectors; capacity failures labelled; first and final separate; every claim in `RESULTS.md` backed by a result file |

- **Fix every upheld finding**, blockers and highs first, each with a test. Write findings and verdicts to `docs/jarvis/BUILD_REVIEW_FINDINGS.md` (v5 section on top).
- Only then run the final gates and the final runs.

---

## 16. Deliverables

The branch pushed, gates green, with:

| File | Content |
|---|---|
| `chennai-grievance-portal-main/eval/RESULTS.md` | **A v5 section on top**, older sections untouched. In it: the re-measured baseline; Step 0 (b, c, p); the grid in full with the build rule's verdict; every acceptance row with interval; first run and final run separately; capacity failures; C1's four figures side by side; the trace's finding; then **"Not verified"**: every figure not measured, every owed run, every unverified choice in section 17 that shipped |
| `docs/thunai/HANDOVER.md` | What shipped, what was cut, every env flag with its default and what it does. **Owner actions**, first: turn on Groq Zero Data Retention; fix the Anthropic key's 401 and run the deploy check (`docs/jarvis/DEPLOY_HAIKU.md`); the Groq free-tier capacity fact (about 69 planner calls a model a day); whether to accept the GitHub MIT file for IndicConformer's tag-only Hugging Face weights (with B5's figures); whether to open a free Cloudflare Workers AI account as an overflow speech pool (zero retention by default: B, https://developers.cloudflare.com/workers-ai/platform/data-usage/); whether Gemini TTS may stay on the free tier; the decisions of section 3.1 with what you measured for each. **What each hosted service retains** (Groq: nothing by default, logs up to 30 days, Zero Data Retention switch — B, https://console.groq.com/docs/your-data; Anthropic API: prompts and outputs not retained by default for Haiku 5.5, flagged chats up to 2 years — B, https://platform.claude.com/docs/en/manage-claude/api-and-data-retention; Edge online voices: text and audio deleted after conversion — B, https://learn.microsoft.com/en-us/microsoft-edge/privacy-whitepaper; Gemini free tier: used to improve Google's products — B, https://aistudio.google.com/docs/pricing). **Runs owed**, each with its exact command and token cost, the deploy check first. Monthly cost with Haiku leading at 300 turns a day: about $3.42–$4.45 (2,650 tokens in and 230 out a turn), about $2.75–$3.46 with the compact plan (prices B, https://platform.claude.com/docs/en/about-claude/pricing). How to run the gates in a new worktree (section 12 traps) |
| `docs/jarvis/DEPLOY_HAIKU.md` | The owner's deploy steps (section 9, "The deploy check") |
| `docs/thunai/BUILD_LOG.md` | Timestamps, decisions, fallbacks taken, cuts. v5 section on top |
| `docs/jarvis/DEMO.md` | **A five-minute real-room check at the top** (below), then the demo script |
| `docs/thunai/REFERENCES.md` | Every source used and the licence of every dependency or model added, read from the licence file. Section 17 is the start of it |
| `docs/qa/pass7/V5_EXPECTED_CHANGES.md` | Every oracle change, justified |
| `docs/jarvis/BUILD_REVIEW_FINDINGS.md` | Review findings and verdicts |

**The five-minute real-room check** (Edge, the real laptop, speakers on, no headset; nothing is recorded; the owner notes pass/fail and reads timings and the applied echo value from the measurement view of item D2 (`NEXT_PUBLIC_JARVIS_SPEC=1` or `JarvisLogView`); the bottom bar itself is unchanged, rule 6). Write it as a table: what to say, what should happen, which flag or `TUNING` value to change if it does not.

| # | Do | Should happen |
|---|---|---|
| 1 | From off, say "Hi Jarvis" three times, then bare "Jarvis" three times | Wakes each time (browser wake). Then repeat both with `NEXT_PUBLIC_JARVIS_WAKE=device` if it shipped: note hits out of three for each (the model was trained on "hey jarvis") |
| 2 | Say one named Tamil command with a Chennai place name, one Tanglish, one English | Right screen each time. Read end of speech → first spoken finding from the trace |
| 3 | Within 20 s, a follow-up without the name | Acts |
| 4 | After 30 s of silence, a command without the name | **Refused** (this is the price of C1). Say it again with "Jarvis": acts |
| 5 | Two people talk about lunch and a meeting for one minute, once idle and once just after an answer | No act. Count any |
| 6 | Let Jarvis give five long answers with nobody speaking, at normal speaker volume, with echo `true`, then with `NEXT_PUBLIC_JARVIS_ECHO=all`; do it once with the Edge online natural voice and once with a local (non-natural) Windows voice | Jarvis does not duck or stop itself. Count self-ducks for each of the four cases; the measurement view shows the applied value. Chromium's source shows `true` can miss local SAPI voices; online voices are unknown; `"all"` adds 170 ms of microphone delay |
| 7 | Say "mm", "sari", "okay" over an answer; then a real interruption | The voice carries on for the first; stops for the second |
| 8 | Say "stop" with no name while Jarvis is silent and while it speaks | Stops |
| 9 | Ask a question whose answer has a number, in Tamil | The number is spoken as Tamil words and matches the screen |
| 10 | Leave the room idle for the rest of the five minutes | No wake, no act. Count any |

The demo script after it shows: a loose Tamil follow-up chain, "what changed" with drivers, "explain this one", "how do you know?", side talk ignored, the never-send refusal, and "go to sleep".

---

## 17. Exact choices and references (start of `REFERENCES.md`)

"Verified" and "unverified" are as the research graded them on 15 Nov 2026. Re-check a line before you rely on it; never upgrade a grade without opening the source.

| Item | Exact value | Licence | Status | Fallback | Source |
|---|---|---|---|---|---|
| Groq planner ids | `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b` (Preview) | hosted | verified | `gemini-3.5-flash-lite` as today, then rules-only | B, https://console.groq.com/docs/models |
| Groq limits (free plan tab) | 30 requests and 8K tokens a minute, 1K requests and 200K tokens a day, per model; Whisper 20 requests a minute, 2K a day, 7.2K audio-s an hour, 28.8K a day; per organisation. Developer tab (paid, out of scope): 1K RPM, 250K TPM | — | verified on both tabs. That the held keys are on the free figures: **read the headers** | plan on the free figures | B, https://console.groq.com/docs/rate-limits |
| Groq Preview status | `qwen/qwen3.8-27b` is Preview: "should not be used in production environments"; keep `openai/gpt-oss-120b` (production) right behind it | — | verified | gpt-oss rungs | B, https://console.groq.com/docs/models |
| Groq structured output | `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`; every property in `required`; optional as a nullable type; `additionalProperties: false` on every object. No streaming, no tools in the same call | — | verified | `{ type: "json_object" }` plus the zod check | B, https://console.groq.com/docs/structured-outputs |
| Not available on Groq | `logprobs`, `n > 1`; `seed` is best effort | — | verified | score three runs | B, https://console.groq.com/docs/api-reference |
| Groq reasoning | gpt-oss: `reasoning_effort` `low\|medium\|high` only. qwen3.8: also `none`. The gateway sends `reasoningFormat: "hidden"` to every id | — | verified as stated. Whether Groq ignores or rejects `reasoning_format` on gpt-oss: **unverified** | leave as is | B, https://console.groq.com/docs/reasoning |
| Groq prompt cache | automatic on the two gpt-oss ids; exact prefix; 2 h idle expiry; hits not guaranteed; read `usage.prompt_tokens_details.cached_tokens` | — | verified. Hit rate at this traffic, and with Zero Data Retention on: **unverified** | none needed | B, https://console.groq.com/docs/prompt-caching |
| Groq Whisper | `whisper-large-v3` (forced Tamil), `whisper-large-v3-turbo` (forced English); `prompt` ≤ 224 tokens; `response_format=verbose_json`; 10 s minimum billing | hosted | verified | — | B, https://console.groq.com/docs/speech-to-text |
| Whisper prompt | Keep today's prompt. **Do not put the 300 names in it** (about 70 words fill 224 tokens; overall error rose 10.3 → 12.1 with a 70-word list) | — | verified | — | B, https://arxiv.org/html/2502.11572v2 |
| Anthropic id | `claude-haiku-5-5` (dateless pinned snapshot, released 7 Oct 2026). `claude-opus-5-5` by explicit env only | hosted | verified. Key refused on 15 Nov; not called in this build | Groq ladder | B, https://platform.claude.com/docs/en/about-claude/models/overview |
| Haiku 5.5 price | Input $0.10/M, output $0.50/M; cache write 5 min $0.125/M, 1 h $0.20/M; cache read $0.01/M | — | verified | — | B, https://platform.claude.com/docs/en/about-claude/pricing |
| Anthropic fields | `output_config.format = { type: "json_schema", schema }`; `cache_control: { type: "ephemeral" }` on the system block (minimum 512 tokens on Haiku 5.5); effort via `output_config.effort`, **default `medium` if omitted**; **omitting `thinking` means adaptive thinking on**; Haiku 5.5 accepts `thinking: {type: "disabled"}` at `high` effort or below (400 at `xhigh`/`max`); Opus 5.5 rejects `"disabled"` with a 400; no `temperature`/`top_p`/`top_k`, no prefill. Structured outputs stream; required properties come first; per-request limits 24 optional and 16 union parameters; a new schema compiles on first use (no figure) and stays cached 24 h from last use. Changing effort or thinking breaks the cache: pin them | — | verified | Groq ladder | B, https://platform.claude.com/docs/en/build-with-claude/structured-outputs ; https://platform.claude.com/docs/en/build-with-claude/thinking ; https://platform.claude.com/docs/en/build-with-claude/effort ; https://platform.claude.com/docs/en/build-with-claude/prompt-caching |
| Haiku 5.5 speed, thinking off | First text 0.59 s, 183 tok/s (blog, n = 3, short prompt: C+); fit 581 tok/s + about 0.31 s a call, first text 0.40–0.61 s cached (Anthropic cookbook, 2 Nov 2026: B). Caching gave no time gain. Thinking off scored 72.0 % against 97.5 % with thinking on in the cookbook's agent eval | — | **conflicting; measure on deploy day** | — | https://computingforgeeks.com/claude-haiku-5-5-released-features-benchmarks/ ; https://platform.claude.com/cookbook/latency-optimization-latency-optimization |
| Haiku 5.5 on Tamil | **No figure exists** for any Claude model on Tamil alone. Anthropic: Haiku 5.5 Hindi 96.6 %, Bengali 95.4 % of English (max effort, thinking on); "Submit text in its native script rather than transliteration" | — | verified (absence) | — | B, https://platform.claude.com/docs/en/build-with-claude/multilingual-support |
| Claude audio input | **None.** Input blocks are text, image, document and tool types; media types images, PDF, plain text | — | verified (absence) | separate speech-to-text | B, https://platform.claude.com/docs/en/api/messages |
| Anthropic limits (start tier) | 4,000 requests, 2,000,000 input tokens, 400,000 output tokens a minute for each 5.5 model. A new organisation may start in a lower Evaluation tier | — | verified; Evaluation-tier figures **unverified** | — | B, https://platform.claude.com/docs/en/api/rate-limits |
| Gemini ids in `gateway.ts` | `gemini-3.5-flash-lite` verified. `gemini-3.5-flash` and `gemini-flash-lite-latest` are **unverified** (not on Google's page): leave them, list them under "Not verified" | hosted | as stated | — | area A2 of the research |
| Router | character 3–5-gram TF-IDF cosine, own TypeScript | none needed | design; unverified on Tanglish | no router (v4 path) | — |
| Embedding models | **Do not ship.** `intfloat/multilingual-e5-small`: tag `mit`, no LICENSE file. `paraphrase-multilingual-MiniLM-L12-v2`: tag `apache-2.0`, no LICENSE file, Tamil not in its language list | tag only | verified (negative) | n-gram router | A, https://huggingface.co/api/models/intfloat/multilingual-e5-small/tree/main ; https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2/raw/main/README.md |
| Voice detector | `silero_vad_v5.onnx` as shipped, fed `[1, 576]` after D1; inputs `input`, `state` `[2,1,128]`, `sr` int64; outputs `output`, `stateN` | MIT | verified (code read) | D1's off switch | Licence file: A, https://raw.githubusercontent.com/snakers4/silero-vad/master/LICENSE (MIT). Code: A, https://raw.githubusercontent.com/snakers4/silero-vad/master/src/silero_vad/utils_vad.py |
| ONNX runtime in the page | the copy already served from `/thunai-ort/`, `1.31.0-dev.20260914-8d85527a0`, `numThreads = 1`, provider `wasm`. One copy only | MIT | verified | — | A, https://raw.githubusercontent.com/microsoft/onnxruntime/main/LICENSE |
| Wake word (flagged) | `@livekit/wakeword` 2.1.2, `/core` export; `hey_jarvis.onnx`, release v2.1.2, 7,406,177 bytes | Apache-2.0 (LICENSE and NOTICE) | package, licence and size verified; accuracy on our phrases **unverified**; a self-trained model's licence is not stated | today's browser wake | A, https://registry.npmjs.org/@livekit/wakeword ; https://raw.githubusercontent.com/livekit/livekit-wakeword/main/NOTICE |
| Echo constraint | default `echoCancellation: true`; flag asks the plain value `"all"` (never `exact`); read `track.getSettings().echoCancellation` | web API | value accepted in Chrome 141 and Edge 141: verified. Effect: **unverified** | `true` | A, https://developer.chrome.com/release-notes/141 |
| Connection reuse | npm `undici`, `Agent({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 600_000 })`, with undici's own `fetch` | MIT | option names verified for v8.10.0; version to pin and behaviour under Next 15: **unverified** | default dispatcher | B, https://undici.nodejs.org/api/Client |
| Local speech runtime (B5) | npm `sherpa-onnx-node` 2.0.1; optional `sherpa-onnx-win-x64` 2.0.1; Node ≥ 16; NeMo CTC through `OfflineRecognizer` | Apache-2.0 | version and licence verified; runs under Next 15 on Windows: **unverified** | Groq forced-Tamil | A, https://registry.npmjs.org/sherpa-onnx-node/latest |
| Local Tamil model (B5, test only) | AI4Bharat IndicConformer Tamil, CTC: mono about 120M (community sherpa exports `csndhanasekar/sherpa-onnx-indicconformer-ta-int8`; `OpenVoiceOS/ai4bharat-indicconformer-ta-onnx` fp32 + int8); 600M Tamil file `Docglasses-AI/indic-conformer-600m-sherpa-onnx-int8` | Code MIT (file read). HF weights: gated, `license:mit` tag only, no file. Exports: tag only | licence of the weights: **owner decision**; x86 speed: **unverified**; FLEURS Tamil 25.49 WER for the 600M (rival's run) | Groq forced-Tamil | A, https://raw.githubusercontent.com/AI4Bharat/IndicConformerASR/master/LICENSE ; https://huggingface.co/api/models/ai4bharat/indic-conformer-600m-multilingual ; https://huggingface.co/api/models/OpenVoiceOS/ai4bharat-indicconformer-ta-onnx ; B, https://huggingface.co/lemuralabs/tamil-asr-qwen3/raw/main/README.md |
| Test clips (only for B5) | Hugging Face `google/fleurs`, config `ta_in`, split `test` (`test.tar.gz` 406.6 MB; 586 or 591 rows: count them); kept outside git, deleted after, never shipped | CC-BY-4.0 (YAML header; no standalone LICENSE file read) | verified as stated | skip B5 | B, https://huggingface.co/datasets/google/fleurs/raw/main/README.md ; A, https://huggingface.co/api/datasets/google/fleurs/tree/main/data/ta_in/audio |
| Word error scorer (only for B5) | plain WER after one normaliser applied to both sides (NFC, strip punctuation, lower-case Latin), hand-rolled in TypeScript | own | design | `jiwer` (Apache-2.0, LICENSE read; version unverified) | B, https://raw.githubusercontent.com/jitsi/jiwer/master/LICENSE |
| Statistics | Wilson z = 1.96; exact McNemar with mid-p; pass^k; no package | own | verified (definitions) | — | https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval ; https://en.wikipedia.org/wiki/McNemar%27s_test ; https://arxiv.org/html/2406.12045 |
| Voices | Edge natural voices first through `speechSynthesis`; Gemini TTS as PCM second; text last. Unchanged | — | already in the app | — | — |
| Proactive limits | `INTERJECT = { perHour: 3, gapMs: 600000, afterUserMs: 30000, … }` (`watch.ts:89`). Unchanged. A model never decides when to interject (about half of model-raised alerts were false alarms) | — | verified in code | — | B, https://arxiv.org/html/2410.12361v3 |

**Do not, with the reason in one line each:**

| Do not | Why |
|---|---|
| Add context, hints, lists or examples to the planner prompt | Tried in v4; understanding fell (B, https://trychroma.com/research/context-rot) |
| Measure understanding through the ladder alone | The score becomes a blend of three models at two calls a minute each |
| Change the schema's field order, drop strict mode, or stream the plan | Not tested by the grid; strict JSON cannot stream on Groq |
| Normalise romanised Tamil to Tamil script word by word in the live path | The transliterator is right on about 68 % of words and 42 % of names (B, https://github.com/AI4Bharat/IndicXlit) |
| Use a model's own confidence to decide when to ask | Groq has no `logprobs` |
| Put Opus on the voice lane | p50 3.9 s measured here |
| Make any live Claude call in this build | Owner: test with Groq, Haiku at deploy |
| Leave `thinking` unset on Haiku, or turn it on for the voice lane | Omitted means adaptive thinking on; low effort with thinking on measured 6.26 s to first answer token (A, https://artificialanalysis.ai/models/claude-haiku-5-5) |
| Count on prompt caching for speed | No time gain at these sizes (B, Anthropic cookbook); it is for cost and Groq limits |
| Send audio to Claude, or plan for it | The API takes no audio (B) |
| Run local Whisper on the laptop | 1.1–1.5 s per 6 s on a fast desktop CPU and 48.58 FLEURS Tamil WER (B, https://istupakov.github.io/onnx-asr/benchmarks/) |
| Assume int8 is the fast, safe choice on x86 | Slower than fp32 in one x86 table; drift without VNNI; a QInt8 export that fails on ORT CPU (B, B, C) |
| Ship a community model export unchecked, or commit a model file | Individual uploads with tag-only licences; record SHA-256; keep models out of git |
| Add a Python sidecar | Breaks "no separate backend" (owner's call); the CTC path runs in Node |
| Retry automatic language detection, or re-add the Gemini racer | Both tried and failed (brief §3) |
| Ship TEN, openWakeWord's models, Porcupine, LiveKit's turn detector, Piper, MMS-TTS | Not permissive, or proprietary |
| Let any turn-completion model decide turns | The official model scores 70.30 % on Tamil; the Tamil fine-tune is one author on telephone speech with no licence file beside the weights (B, https://huggingface.co/santhosh-005/smart-turn-tamil) |
| Claim "≤ 5 % side talk" from 40 items, or a win on the frozen 60 from one run | The intervals are too wide |
| Send digits to any voice | No engine's Tamil digit reading is verified |
| Record real people or real office talk | Rule 3 |

---

## 18. Before you finish, check

- Does every figure in `RESULTS.md` have a result file, an interval and its n?
- Are first run and final run separate, and is every run with a 429 labelled a capacity failure?
- Is every unmeasured thing in the "Not verified" list, with no estimate standing in for a run?
- Were `eval/holdout2` and `eval/holdout3` never read, and are their hashes intact?
- Did every fixed defect have a test that failed first?
- Is every QA oracle change listed and justified?
- Is every owner decision left to the owner, with the default built and the measured trade written down?
- Are the baseline worktree's three junctions (`node_modules`, `data\thunai`, `data\aws-cache`) removed with `rmdir` and the worktree deleted?
- Is the branch pushed, with nothing pushed to `main` and no PR opened?
- Was no live Claude call made, and does `DEPLOY_HAIKU.md` tell the owner exactly what to run and how to read it?
- Were B5's model and audio files kept out of git and deleted from the scratch folder?
