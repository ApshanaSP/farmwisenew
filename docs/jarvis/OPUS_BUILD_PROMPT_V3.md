# BUILD PROMPT v3 — Jarvis: always listening, acts on what you say, a HUD worth looking at

ultracode. You are Claude Opus 5.5, autonomous, one session, at most 5 hours wall-clock. Use workflows and subagents for fan-out and independent review. No human is available: when something is blocked, take the stated fallback, record it, and move on. Never invent an API, package, model id or number.

**Read order and precedence.** This file wins. Next is `BUILD_REVIEW_FINDINGS.md` (file-and-line evidence about the code, written against an earlier draft, so its section numbers refer to that draft and a separate skeptic pass may not have finished; re-check a finding before relying on it). `OPUS_BUILD_PROMPT_V2.md` is only a reference for library, licence and research detail (sections A–F); wherever it disagrees with this file, this file wins.

## 0. What Jarvis becomes

Turn on **Jarvis mode** and there is no mic button and nothing to press. Jarvis listens. Say what you want, with or without its name, and it does it: it works out whether you were talking to it, acts, shows its work on a cinematic HUD, and answers in Tamil or English. Talk over it and it stops at once and takes the new instruction. Say "wait" and it holds while you think. It compares, finds what stands out, completes data, drives the console, and builds screens. Every number comes from code. It never presses send, approve or delete.

## 1. Paths and setup (first 5 minutes)

- Git root is the worktree root; the app is `chennai-grievance-portal-main/`. `src/`, `public/`, `eval/`, `tests/e2e/` are app-relative. Run npm and npx from the app folder. The build log, handover and references go in `docs/thunai/` at the git root.
- You are in a fresh worktree on your own branch, cut from `main`. **Do not create another branch.** The owner's main checkout is `E:\farm`; never modify it, except for the read-only copies below.
- Copy `E:\farm\docs\jarvis\{OPUS_BUILD_PROMPT_V3.md,OPUS_BUILD_PROMPT_V2.md,BUILD_REVIEW_FINDINGS.md}` into your `docs/jarvis/` and commit them.
- Copy `E:\farm\chennai-grievance-portal-main\.env` into your app folder (confirm it is gitignored first; never print or commit values). Run `npm ci`; the EBADENGINE warning on Node 24 is expected, so do not change `engines`. If the app needs other gitignored runtime data, copy that too and record it.
- **Stage explicit paths only. Never `git add -A` or `commit -a`.** `data/i18n/*` is rewritten at runtime and `data/embeddings/*` is pre-existing; neither may appear in a commit. Commit at least every 20 minutes, prefix `jarvis(<phase>):`. Never force-push or rewrite history. Commit message attribution: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Push your branch at the end of Phase 7, and at each phase end as a backup. Do not merge to `main` and do not open a PR.

## 2. Facts the review established (do not rediscover them wrongly)

- **No Azure key exists.** `.env` holds `GROQ_API_KEY`, `_2`, `_3`, `GEMINI_API_KEY`, and `TTS_PROVIDER=browser`, which is read by nothing today. AWS keys may exist: probe them, do not assume.
- **The three Groq keys are one organisation**, so they add no quota. A full eval run has cost about 250K tokens against a 200K-a-day cap; one sentence costs about 3,500 tokens with one model call and 10,000+ on a 3-round agent, against 8K TPM. Earlier held-out runs collapsed because of capacity. **An eval run with 429s is a capacity failure, not an accuracy score.**
- **The Gemini fallback fails for Thunai on `main`** (400 on the strict schema). The fix is `caf5e7e`, only on `thunai/v3`.
- **Agent:** the loop runs on the server inside one JSON POST (`api/collector/thunai/agent/route.ts` → `agentServer.ts` `handleAgent` → `agent.ts` `runThunaiAgent`). All Stage steps run in the browser. **There is no Stage reducer**: ops are spread across `applyLocal`, `applyStageOp` (`Thunai.tsx`) and helpers in `stagelocal.ts`, and they speak and fetch as side effects.
- **`voice.ts` is only the browser speechSynthesis wrapper**, not a state machine. Turn state and barge-in live in `Thunai.tsx` and `ears.ts`.
- **`mouth.ts` plays through `new Audio(blobUrl)` or speechSynthesis**, with no PCM and no AudioContext. **Edge natural voices (Pallavi, Neerja) are the first choice today**; `start-fast.bat` opens Edge because Chrome has no Tamil voice.
- **`ears.ts` already has** a conversation mode with a 60 s idle timeout, one-breath "Hi Jarvis, …", and an ambient path that posts sentences to Whisper turbo. Build on these.
- **`/hear`** defaults to `whisper-large-v3` and skips the place-name prompt on turbo. Auto-detect on Tanglish was about 97 % WER; a fixed language plus the prompt did far better.
- **`thunai/v3` measured barge-in:** energy-gate pause p50 about 90 ms; Silero-only p50 about 250 ms. It used onnxruntime directly, not `vad-web`.
- **`node:sqlite` trap:** Next's bundler breaks a plain import. `src/lib/aws/store.ts` shows the working pattern.

## 3. Rules

1. Next.js 14.2, React 18, TypeScript, zod. Scope is Jarvis: the Thunai folders, `api/jarvis/*`, `api/collector/thunai/*`, `api/dev/thunai/*`, `gateway.ts`, plus minimal mount points in the console. Do not redesign the console itself; the HUD sits over it.
2. Tamil, English and Tanglish are all first-class. Numbers come from code only: extend `figuresOk` + `spellsNumber` (Tamil numerals, lakh/crore, %) into a gate on every spoken chunk.
3. **Action levels** (extend `risk.ts`): data tools are read-only. **Level A** (navigate, filter, open, build or change screens, map focus) runs at once, with undo. **Level B** (save a workspace, pin, remember) needs a spoken yes or a tap. **Level C** (anything outward) is draft-to-tray only, and Jarvis can never send, approve or delete. A "yes" must come from Whisper, typed text or a tap, never from browser captions.
4. Privacy: no citizen's words, phone numbers or Aadhaar in speech or on screen. Code-level redaction on every tool result. Audio is never stored. Ambient transcripts are never logged and never reach the planner before the address gate passes them.
5. No new paid services or accounts. Claude via Bedrock only as a last-resort planner rung if the probe shows the keys work, because it bills the team's AWS account; log and report each call. Permissive licences only; NC or share-alike data is test-only and flagged.
6. Demo target: one Windows laptop, **Edge first for Tamil voice**, Chrome second. Degrade gracefully when providers fail.
7. Existing tests, `tsc --noEmit` and `next build` stay green at each phase end. Time the first cycle in Phase 0; if over about 8 minutes, run `next build` only at Phases 2, 4, 6 and 7.
8. Time box: phases sum to 295 min. Overrun by more than 15 %: stop at a green commit and move on. Cut scope, not quality. Phases 0 and 7 are mandatory.
9. Honest measurement: held-out sets are written before tuning and frozen by hash. Report first-run and final separately, with a "Not verified" list. Never tune to a noisy test.

## 4. Always-listening Jarvis mode (the headline)

**States:** `off` means the mic tracks are stopped and nothing listens. `on` means the mic is open and there is **no mic button**. `muted` means the mic is closed, one keystroke away. Toggle in the top bar; `Ctrl+Shift+J` toggles, `Ctrl+Shift+M` mutes, `Esc` interrupts; voice: "Jarvis, go to sleep". Persist the choice. After a reload the browser may need a gesture for audio, so show "click to resume". Handle a denied permission clearly. When the tab is hidden, mute and say so on return. Show a visible red dot with the word "Listening" whenever the mic is open, and a one-time first-use notice that speech is sent to transcription services and not stored.

**Address gate** (`src/lib/thunai/addressed.ts`, pure, tested). No speaker identification exists, so anyone in the room can command it; state this in HANDOVER. After STT and before anything acts:
1. **Named:** contains "Jarvis" or Tamil ஜார்விஸ் → act.
2. **Engaged:** within 20 s of Jarvis's last turn, and it parses as a request or follow-up → act.
3. **Command-shaped:** the rules layer resolves a high-confidence intent with slots, or an imperative verb plus a district noun ("show Adyar's cases") → act, **Level A only**.
4. **Everything else** → ignore. Show a faint transcript line that fades in 2 s; do not log it and do not call the planner.

Level B and C need tier 1 or 2. When unsure, do not act. A wrong silent ignore is recoverable by saying "Jarvis"; acting on someone's side conversation is not.

**Quota for always-on.** Whisper bills a 10 s minimum per request, so 7,200 audio-s/hour is about 12 requests a minute; also 20 RPM, 2K RPD and 28.8K audio-s/day. Ambient (unengaged) segments get one decode in the site language, at least 400 ms of speech, and a hard cap of 8 a minute in the ledger. Engaged and named turns get the full STT in section 5. When the budget runs low, tell the user and fall back to free browser recognition for the name only ("say Jarvis first"). Report ambient requests per hour measured in a 10-minute run.

**Self-hearing guard.** While speaking, ignore transcripts whose normalised text overlaps more than 60 % with what Jarvis is saying. Require a higher energy margin during speech. speechSynthesis gives no reference signal, so this text guard is the main protection on that path. Run a 2 s self-test on mode start only on the PCM path.

**Interrupting and holding.**
- Two-stage barge-in, ported from `thunai/v3`: an energy gate on 20 ms frames **pauses or ducks at once**; Silero confirms speech held for at least 200 ms; only then cancel the turn. Speech shorter than about 250 ms at VAD end (cough, noise) **resumes** from where it stopped. Key this to the VAD end event, not a transcript timer.
- A turn generation id plus an AbortController on the fetch; every await checks the id so an old answer can never speak after an interruption. The server honours `req.signal` through a new signal parameter in the gateway. Drop late transcripts.
- After cancel, the query frame stays, so "no, Anna Nagar" refines the last request.
- **Hold words** ("wait", "stop", "one second", "hold on", "இரு", "நில்லு", "ஒரு நிமிஷம்"): go silent, cancel nothing on screen, listen up to 4 s longer before ending the utterance, and do not answer the hold word itself. "Wait, show Anna Nagar" is hold plus command, handled as a command. "Continue" or "தொடரு" resumes the interrupted answer from its chunk.
- speechSynthesis path: `cancel()` only, so resume restarts at the sentence boundary.
- **Measure latency from the fixture's known speech start**, not from the detector's event. Report the detector-fire time as a component.

## 5. Voice pipeline

- **VAD:** port `thunai/v3`'s `vad.ts`, its test, the Silero file, the ORT route and `a321af5`, read through `git show`. Use that proven path rather than a new `vad-web` integration. Check the model's licence file. If it is NC, use the v5 MIT model. End of utterance about 300 ms (`hold` extends it), hard max 14 s, constants in ms derived from the real sample rate. Replace ScriptProcessorNode with an AudioWorklet. Keep an energy fallback if ORT fails. No SharedArrayBuffer; check that `middleware.ts` and any CSP allow the assets.
- **STT:** remove the serial re-send. Engaged turns: parallel forced decodes, `ta` on `whisper-large-v3` with the place-name prompt, `en` on turbo, with the prompt also sent on utterance decodes. Choose by `avg_logprob`, `no_speech_prob` < 0.6, `compression_ratio` < 2.4, a repetition check and a script check. Keep the hallucination regex. **Phase 0 probe (10 min or less):** `gemini-3.5-transcribe` versus the flash-lite models on the same Tamil clips; choose by CER, and use the winner as the third racer within budget. Fallbacks: browser recognition, then typed text. Port `gloss.ts`. Add `xlit.ts` and extend `lexicon.ts` with Tamil, transliterated and romanised forms. NFC plus punctuation strip only; never Whisper's BasicTextNormalizer on Tamil.
- **TTS ladder:** (1) Edge natural speechSynthesis for Tamil and Indian English; (2) Gemini `3.8-flash-lite-tts`, then `3.8-flash-tts`, ledger-capped at 3 RPM, on the AudioContext PCM path with GainNode and AnalyserNode; (3) on-screen text. The Azure branch stays in code behind its key, marked "Not verified". Drop `2.5-flash-preview-tts`. `TTS_PROVIDER`: treat the existing `browser` value as legacy for `auto`, update the example files, and do not add a second variable.
- **Chunker:** terminators `. ! ? । ॥` and newline; first chunk at 20 or more characters; split on commas only above 120 characters; Tamil unit test. Gate every chunk.
- **Acknowledge first:** a code-templated, numberless line ("Comparing Adyar with Anna Nagar") within about 600 ms, then the findings. The acknowledgement must never delay or lose the answer. The answer is shown on screen as soon as it exists, whatever the voice is doing.
- **Latency targets, measured:** ack p50 ≤ 0.6 s; rules-layer first audio p50 ≤ 1.8 s, p90 ≤ 3.5 s; planner p50 ≤ 3.0 s, p90 ≤ 5.0 s; barge-in pause p50 ≤ 150 ms, p90 ≤ 250 ms.

## 6. Agent

- **Browser drives rounds.** Add `POST /api/collector/thunai/agent/round` `{turnId, round, text, state, stageDigest, observations}`, with the same route under `api/dev/thunai`. The server runs the gates, one LLM call and the allow-listed read tools, and returns steps. The browser applies them, builds the digest and calls again, up to MAX_ROUNDS = 3 and an 8 s deadline. Replace both `sleep(1600)` missions.
- **Create a pure `stageReducer(doc, op)`** in `stagelocal.ts`, split from speech and network effects. `commit` goes through refs and returns the digest. Expose a `settled()` promise for console-wide steps. Extend the existing stage tests.
- **Token budget (a hard rule):** the first round's prompt must shrink, and later rounds send only deltas and the digest. Observation ≤ 150 tokens, digest ≤ 400, frame ≤ 120, one-line tool schemas in bundles. Target ≤ 2.5K per call and ≤ 2 calls per turn; measure and report. Five tool bundles over the real registry (enumerate it from the code; expose the unreachable tools there). Rules pick the bundle, else a tiny router call.
- **Plan as JSON** in strict `json_schema`, executed by a TS executor with `Promise.allSettled`. Errors become observations `{ok:false, error}`; at most one retry; never repeat identical args; no reflection prose.
- **`frame.ts`** resolves "and in Adyar?", "why?", "the second one" and "compare with last month" **before `offTopic` and `quickScreen`** in `handleAgent`, using `b.stage`, turns, `lastPlace` and `lastFilter`, and replaces the prompt-only rules at `agent.ts:105-107`.
- **`quick.ts`** stays as the latency lane but must bail to the planner on multi-intent, advice and mission sentences, and on elliptical sentences when a Stage or recent turn is open. Move RAIN below COMPARE. Add the review's failing sentences to `quick.test.ts`.
- **Router** replaces the keyword wall: `district` | `general` (no tools, no district numbers) | `refuse`. `privacy.ts` does the code-level checks. Port v3's privacy refusal and advise screen.
- **Reach audit:** enumerate what the console can do and map it to Level A/B actions. "Tell Jarvis to do anything" means every read, navigate and build action works by voice, and anything else gets a clear spoken "I can't do that, here's what I can". Include "Save this workspace as Collector's Daily Briefing".

## 7. Owner features (each is a gated acceptance test)

- **Compare:** a comparison screen plus a spoken difference, numbers from code.
- **Insights:** `stats.ts` after reading `insight.ts` and `explain.ts`: modified z-score, c-chart, Theil–Sen with Mann–Kendall, each returning `{value, n, method, caveat}`, with Tamil caveats.
- **Complete this data:** on the open Stage table, a Studio dataset or unresolved incidents. Fill a cell **only** from a tool result or deterministic code (ward→zone, gazetteer, department lookup, derived rates), and show the source on each filled cell. Name what cannot be filled. Draft follow-ups to the tray at Level C. Never guess a value.
- **Speech templates:** the model writes `{n:key}` placeholders only; code fills them. Property test with 1,000 cases.

## 8. The HUD (a headline deliverable; original design, no film artwork or logos)

Turning Jarvis mode on must feel like an event. The console stays visible and usable beneath.

- **Power-on:** a 1.2 s sequence (dim, core ignites, panels slide in) with one short synthesised earcon. Skippable, never repeated within a session. Earcons must not trigger barge-in.
- **The core:** one large audio-reactive element, drawn on a 2D canvas (no three.js, no library) plus SVG rings. It docks top-centre at 96 px when idle and grows to 240 px while speaking or thinking. Distinct by shape as well as colour: idle slow breathing; listening rings follow mic level; hearing the live transcript appears beneath within 150 ms; thinking segments orbit; speaking the disc pulses (AnalyserNode on PCM, a state-driven envelope on speechSynthesis); holding rings freeze, half open; interrupted collapses in 120 ms; offline amber and still.
- **Live transcript ribbon** under the core, and **a work timeline** showing the real steps as they run ("Resolving Adyar → Reading 1,204 cases → Comparing → Done"), driven by actual observations with the time each took. No invented steps.
- **Result panels:** answers arrive as angular glass panels that animate from the core to their place, with count-up numbers (values from code). The map gets a targeting reticle that sweeps to the place being discussed, with pulse rings on outliers.
- **System strip:** real data only: last-turn latency, active provider, feed freshness, listening budget.
- **Look:** near-black translucent layer, one electric cyan accent, one amber for warnings, thin technical lines, tabular numerals. Spatial layout with hierarchy, not a chat box. No composer in Jarvis mode (keyboard icon reveals it). Text is always crisp and high-contrast, with no glow on body text, no scanlines over text.
- **Performance:** animate only transform and opacity, never filter, box-shadow or backdrop-filter; static backdrop blur is fine if traces hold. Canvas pauses when hidden. Measure with a 20 s trace: ≥ 55 fps speaking.
- **Tamil:** Noto Sans Tamil subset self-hosted, then Nirmala UI. Never letter-space, animate per glyph, blur or split Tamil text; whole-line fades only. Line-height ≥ 1.5, body ≥ 16 px.
- **Accessibility:** `aria-live="polite"` with 500 ms debounce, no partials; focus rings ≥ 3:1; `prefers-reduced-motion` gives static rings, no power-on and a plain level bar; Jarvis mode off stops all motion.
- **Mandatory:** an independent UI-review subagent (screenshots in Edge at 1366×768 and 1920×1080, English and Tamil) and a fix pass, before Phase 6 ends.

## 9. Capacity

- **Ledger in Phase 0**, keyed by **organisation and model, not key**. Reuse the `store.ts` pattern (`process.getBuiltinModule("node:sqlite")`, type-only import, lazy open, never at import time). No better-sqlite3. Behind an interface; note in HANDOVER that a hosted deployment needs a different store.
- **Port `caf5e7e` first in Phase 3** and prove it with one live Gemini call through the agent schema. If it cannot answer within budget, disable the hedge and say so. Hedge at the observed p95 (at least 1 s), aborting the loser, into another Groq model or flash-lite, and never into `3.8-flash` (20 RPD). No hedge below 40 % of any minute budget.
- **Ladder:** Groq with the most budget → next Groq → flash-lite → Bedrock if the probe passed → rules-only spoken answer. Log each hop. Ollama only if already installed and a 2-minute probe shows under 700 ms.
- **Caches:** plan cache keyed by (intent, slots, bundle, data_version), 10 min; tool results 30 s; speculative prefetch for read-only tools only (verify in the registry). No semantic cache.
- **Port table from `thunai/v3`** (no merge; `git show` only): `vad.ts` and tests, `a321af5`, Silero and ORT route, `caf5e7e`, `lastResort`, `gloss.ts`, `stt.ts` ideas, privacy refusal, advise screen, `turn()` and its tests into `src/lib/thunai/turn.ts`, news brief if time allows. Check `git diff` against the review before porting; `main` moved a lot.
- **Do not add:** Pipecat, LiveKit, NeMo, LangGraph, Redis, Prophet, three.js, COOP/COEP, S2S models, or any GPL or NC runtime.

## 10. Evaluation, fitted to the quota

- **Token plan:** run a baseline of only 20 held-out understanding cases through the planner. Tune against recorded model replies. **Reserve quota for one final run, executed first in Phase 7.** Check the ledger before each run and do not start one that cannot finish.
- `eval/holdout/understanding.jsonl`: 150 items (EN 60, TA 50, Tanglish 40) drafted by Gemini with a separate prompt, including 20 follow-ups and the section 7 intents. Rules plus router score all 150, in code. The planner scores a frozen 20 at baseline and 40 at final, the first 20 being the same items for a like-for-like comparison. Wilson 95 % intervals.
- `eval/holdout/ambient.jsonl`: 40 side-conversation sentences (EN, TA, Tanglish), and 40 unnamed commands.
- `eval/holdout/tamil-asr/`: commit only `manifest.json` with hashes, not audio. 60 clean plus 40 noisy from OpenSLR SLR65 (share-alike, test-only, flagged), then FLEURS `ta_in`. **Do not download MUSAN (11 GB)**: generate babble in code from 6–8 other clips plus pink noise, and label it so. Run the Gemini transcriber once in the Phase 0 background. Start the final Whisper pass in the background **at the start of Phase 6** so it finishes in time.
- Tests: Playwright with `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture` (probe the bus sample rate; check Playwright is a dependency first), running `vad.spec`, `bargein.spec`, `hold.spec`, `e2e-latency.spec` with mocked providers via `msw`. Vitest beside each new module. One real local run, reported separately.

## 11. Phases (295 min)

| # | Min | Work | Cut line |
|---|---|---|---|
| 0 | 30 | Setup; baselines; key and model probes; ledger accounting; freeze held-out sets; 20-case baseline; transcriber probe; telemetry | mandatory |
| 1 | 65 | v3 VAD port; AudioWorklet; `turn.ts`; two-stage barge-in; generation ids; abort through server; hold words; **Jarvis mode with address gate and ambient budget**; specs | keep the gate; defer the PCM self-test |
| 2 | 35 | TTS ladder; chunker; PCM path with gain and analyser; acknowledge first; number gate on chunks | Gemini per-sentence clips |
| 3 | 25 | Port `caf5e7e`; full ledger; hedge; degradation ladder; caches | drop Ollama |
| 4 | 45 | `stageReducer`; `/agent/round`; observations; plan executor; `frame.ts`; `quick.ts` fixes; router and privacy; token diet; bundles; reach audit | observations, executor, frame first; prefetch last |
| 5 | 20 | `stats.ts`; compare; complete this data; templated speech and property test | outliers and trend only |
| 6 | 55 | The HUD, in full; Tamil type; accessibility; fps trace; UI review and fixes | keep core, ribbon, timeline, panels; drop reticle, then power-on |
| 7 | 20 | Final held-out run **first**; report; handover; push | mandatory |

Keep `docs/thunai/BUILD_LOG.md` with timestamps, decisions and cuts.

## 12. Acceptance

| Metric | Target | Gate |
|---|---|---|
| Existing suite (count recorded in Phase 0) plus new tests, tsc, build | all green | gate |
| Mode on: speak a command with no click and no name, the console acts | 3 scripted commands | gate |
| Side conversation ignored | ≤ 5 % false acts on 40 ambient sentences | report; gate on Level B/C = 0 |
| Unnamed commands accepted | ≥ 80 % of 40 | report |
| Mode off or muted: mic tracks stopped | verified in test | gate |
| Hold words, "wait, do X", continue, noise-resume, late-transcript drop, no old answer after stop | named tests pass | gate |
| Barge-in from known speech start (PCM path) | p50 ≤ 150 ms, p90 ≤ 250 ms | p90 gate |
| Ack and first-audio latency (section 5) | mocked and one real run | report |
| Follow-ups | 18/20 | gate |
| Compare, insights, complete this data work end to end | 3/3; filled cells show sources | gate |
| Understanding, 150 via rules and router | ≥ 85 %; Tanglish ≥ 80 % | report |
| Unsupported numbers rejected | 1,000 generated cases | gate |
| Privacy adversarial set; never send/approve/delete | 50 and 10 cases | gate |
| Removing Groq keys: turn completes or speaks "cannot reason right now" within 8 s | integration test | gate |
| HUD: speaking ≥ 55 fps, reduced motion ≥ 59 fps, Tamil legible at both sizes, UI review passed | measured | report |
| Tokens per turn and ambient requests per hour | measured | report |

## 13. Deliverable

The branch pushed and green, with `eval/RESULTS.md` (first-run versus final, capacity failures shown separately, a "Not verified" list), `docs/thunai/BUILD_LOG.md`, `HANDOVER.md` (what shipped, what was cut, how to run the demo in Edge, known limits including no speaker identification, what an Azure key would add), `REFERENCES.md` updated, and HUD screenshots in `docs/jarvis/screens/`. Prefer one thing that works beautifully over five that half work.
