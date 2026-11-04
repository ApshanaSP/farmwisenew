# BUILD PROMPT v2 — Jarvis (thunai) → an agentic, bilingual, conversational-speed district aide

You are Claude Opus 5.5 running autonomously in ultracode. The **git root is `E:\farm`**; the Next.js app is the subfolder **`chennai-grievance-portal-main/`**. Every `src/...` path below is relative to that app folder; `docs/...` paths are relative to the git root. No human is available. You have one session of at most 5 hours wall-clock. Read this whole prompt before touching a file.

Where this prompt says "unverified", the research could not confirm it — verify it yourself in the first minutes of the relevant phase (read the package's README/licence on disk after `npm view`/`npm i`, or run a probe) and take the stated fallback if it does not hold. Never invent an API, a package, a model id, or a number.

## 0. What Jarvis becomes (one paragraph)

Jarvis stops being a chatbot with a voice and becomes a present, always-reachable aide inside the Collector's console: a mic in the top bar that is live the moment "Jarvis mode" is on, beside the existing "Hi/Hello Jarvis" wake word (kept, not replaced); a neural voice gate that hears the end of a sentence in ~300 ms instead of 768 ms and lets the Collector interrupt within 150 ms; a pipeline that overlaps STT, planning, tool fetches and speech so the first words are audible at the A7 targets (p50 ≤ 1.8 s on rules-layer turns); an agent loop that sees the result of each action it takes, is told when a step fails, can run tools in parallel, resolves "and in Adyar?", "why?", "the second one", "compare with last month" from a structured query frame, and answers general questions without a keyword wall while still refusing anything that would expose a citizen; an analysis layer that computes outliers, trends and seasonality in code, can **complete a dataset** (name what is missing, derive what is derivable, draft the follow-ups to the sandbox tray), and lets the model only name findings while code supplies every number; a calm, cinematic HUD that is legible in Tamil at 60 fps and respects reduced motion; and an evaluation harness whose held-out sets were written before tuning. Jarvis still never presses send, approve or delete.

## 1. Ground truth — the repo as it is (read this, don't rediscover it wrong)

File locations (verified against `main` at baf956d; trust these over any older notes):

- **Browser-side voice/UI code** is in `src/components/collector/app/thunai/`: `Thunai.tsx`, `Stage.tsx`, `Panel.tsx`, `ears.ts`, `mouth.ts`, `voice.ts`, `wake.ts` (+ `wake.test.ts`), `stage.css`, `panel.css`, `thunai.css`.
- **Server-side agent code** is in `src/lib/thunai/`: `agent.ts`, `agentServer.ts`, `plan.ts`, `understand.ts`, `screens.ts`, `stage.ts`, `say.ts`, `normalise.ts`, `quick.ts` (+ `quick.test.ts`), `golden.test.ts`, `risk.ts`. Also there, and to be read before you add anything that may overlap: `stagelocal.ts`, `stagefake.ts` (Stage execution, needed for B0), `insight.ts`, `explain.ts` (before `stats.ts` and D0), `lexicon.ts` (before the `xlit.ts` alias tables), `store.ts`, `brain.ts`, `world.ts`, `next.ts`, `watch.ts`, `audit.ts`, `data.ts`, `types.ts`. Extend what exists rather than building a second version.
- `src/lib/ai/gateway.ts` — providers are `gemini | bedrock | groq | openai` (Bedrock via `src/lib/ai/bedrock.ts`, Converse API, currently Amazon Nova Lite). `AI_PROVIDER` / `AI_FORCE_PROVIDER` / `AI_CHAT_PROVIDER` select them.
- `src/lib/jarvis/voices.ts` exists (voice pool from the Jarvis commit) — read it before touching TTS; extend rather than duplicate.
- `src/lib/thunai/quick.ts` is the existing **fast lane** (answers without AI for cases, news, prices, readings, why/where). Build on it; nothing in this build may bypass or break it.
- API routes: voice is `src/app/api/jarvis/hear/route.ts` and `src/app/api/jarvis/say/route.ts`. The agent is reached through `src/app/api/collector/thunai/{agent,plan,memory,audit,world}/route.ts`, with dev versions in `src/app/api/dev/thunai/{agent,plan,tool,draft}/route.ts`. Any change to the agent's request or response must update both. Read the `memory` route before writing `frame.ts`.
- The repo's docs live at git root: `docs/thunai/` (v2/v3 reports, PROGRESS logs), `docs/jarvis/`. `chennai-grievance-portal-main/eval/` already exists (`golden.json`, `promptfooconfig.yaml`): add `eval/holdout/`, `eval/asr/` and `RESULTS.md` beside them and leave those files alone. Playwright specs go in `chennai-grievance-portal-main/tests/e2e/`; vitest files sit beside the modules they test, as today.
- The working tree on `main` currently has **pre-existing local modifications** (embeddings `.bin`/`.json`, `data/i18n/en.json`, `ta.json`). Before branching: `git stash push -m "pre-jarvis-build local changes"` and record it in BUILD_LOG and HANDOVER. Never commit these files as part of this build.
- A local branch `thunai/v3` exists. **Do not merge it.** Read (via `git show thunai/v3:<path>` only) its `vad.ts`, `stt.ts`, `gloss.ts` for the Silero settings and any Tamil normalisation tables worth copying into `xlit.ts`; its held-out collapse (75 → 40 → 5 %) was quota failure, not reasoning failure — its eval logs are not evidence about reasoning. Record this in BUILD_LOG.

Placement rule for new files: browser-audio modules (`vad.ts`, `bargein.ts`, `chunker.ts`, `TopBarMic.tsx`, `RingCore.tsx`) go in `src/components/collector/app/thunai/`; server/shared logic (`stt.ts`, `frame.ts`, `toolsets.ts`, `privacy.ts`, `xlit.ts`, `stats.ts`, `telemetry.ts`, `geo/wards.ts`) goes in `src/lib/thunai/`.

## 2. Non-negotiable rules

1. Next.js 14.2 App Router, React 18, TypeScript, zod. Browser-only audio capture.
2. English and Tamil are both first-class. Tamil must work, not degrade. Tanglish (romanised Tamil) must be handled.
3. Numbers come from code, never from a model. Keep and extend the figure gate (`figuresOk` + `spellsNumber`, incl. Tamil numerals ௦–௯, lakh/crore, %). Every spoken number must be verified against a tool result.
4. Jarvis may never press send, approve or delete. Drafts go to the approval tray; sandbox only. Keep `risk.ts` grades A/B/C and the closed action enum.
5. **The wake word stays.** "Hi/Hello Jarvis" (`wake.ts`) and the continuous-conversation behaviour shipped in baf956d keep working. The top-bar mic and Ctrl+Space are additional entry points; the Jarvis-mode toggle governs whether wake listening runs at all. If a change would regress wake behaviour, the change loses.
6. Privacy: no citizen's own words, phone numbers or Aadhaar in speech or on screen.
7. No new paid service and no new accounts. Existing keys only (verify which exist in Phase 0 — see 3.C0; do not assume any key exists, including Azure). Permissive licences only (MIT, Apache-2.0, BSD, ISC, OFL for fonts). Copyleft/NC items only as test data, flagged in the report.
8. Must run on one Windows laptop (Chrome) for the demo and degrade gracefully when a provider is rate-limited or offline.
9. Do not break the existing tests (`npx vitest run src/lib/thunai src/components/collector/app/thunai` — record the actual baseline count in Phase 0; do not trust any remembered number), `tsc --noEmit`, or `next build`. Run all three at the end of every phase.
10. Scope is Jarvis alone: the paths in section 1, plus one minimal mount point in the console top bar. Do not redesign the rest of the console.
11. Hard time box: 5 hours. Phase budgets below sum to 295 min with 5 min slack. If a phase overruns its budget by more than 15 %, stop it at a green, committed state and move on — cut scope, not quality. Phases 0 and 7 are mandatory and may not be cut.
12. Branch and commit discipline: after the stash in section 1, `git checkout -b jarvis/agentic-voice` from `main`. Small commits (one concern each, message prefixed `jarvis(<phase>):`). Never force-push, never rewrite history, never commit secrets. Commit at least every 20 minutes.
13. Honest measurement: held-out sets written in Phase 0 before any tuning, frozen by committing their SHA-256; first-run and final scores reported separately; the final report lists what was not verified.

## 3. Researched architecture decisions (A–F)

Each decision names the chosen library/model, its licence, why it won, and the evidence. "Verify" = confirm in the first 5 minutes of the phase; if false, take the stated fallback.

### A. Voice I/O and latency (highest leverage)

**A1. VAD — replace the RMS gate with Silero VAD via `@ricky0123/vad-web`.**

- Package: `@ricky0123/vad-web` 0.0.31 (ISC; sole dependency `onnxruntime-web` ^1.17, MIT). Ships Silero legacy/v5/v6 ONNX models; default is "legacy", so pass `model: "v6"` explicitly (~2.2 MB; < 1 ms per 512-sample/32 ms frame). Options are ms-based: `redemptionMs` (default 1400 — far too long), `preSpeechPadMs` (800), `minSpeechMs` (400), plus `positiveSpeechThreshold`/`negativeSpeechThreshold` and the `onSpeechStart`/`onSpeechEnd`/`onFrameProcessed` callbacks. Its worklet resamples to 16 kHz and posts transferable 512-sample frames; ORT inference runs on the main thread — acceptable at < 1 ms/frame; do not re-engineer it.
- Licence check required: the package metadata says MIT for the Silero model but the README badge has shown CC BY-NC 4.0 — read the LICENSE file in the vendored model directory and record which applies; if the shipped v6 model is NC, use v5 (MIT) and note it.
- Why it won: the only maintained browser-ready neural VAD with a permissive licence, already proven on `thunai/v3` (~90 ms barge-in). WebRTC VAD (GMM) is worse in office noise; TEN VAD has field-of-use restrictions; Picovoice Cobra is commercial.
- Noisy-office false-accept rate: unverified — measure on the noise-augmented held-out audio (F).
- Implementation: `vad.ts` (new, component folder). Serve ONNX + WASM assets from `public/vad/` (copy from `node_modules/.../dist` in a `predev`/`prebuild` script; set `baseAssetPath`/`onnxWASMBasePath`). Starting values: positive 0.6, negative 0.35, **`redemptionMs` 300** (end of utterance ≈ 300 ms after the last voiced frame; this one number is the spec — do not also derive a frame count), `preSpeechPadMs` 200, `minSpeechMs` 150, hard max 14 s kept. Keep all of `ears.ts`'s constants in milliseconds and derive frames from the real AudioContext sample rate (fixes the 44.1/48 kHz drift).

**A2. Capture — AudioWorklet, not ScriptProcessorNode.**

`@ricky0123/vad-web` already uses an AudioWorkletNode for capture and resampling; keep that path and delete the ScriptProcessorNode code in `ears.ts`. No SharedArrayBuffer (COOP/COEP would hit the whole console). Keep `getUserMedia` constraints `{echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1}`. Expected effect: capture no longer stalls on React re-renders; decision granularity 32 ms frames + ~64–96 ms onset; end-of-utterance ~250–300 ms after the last voiced frame (you measure in Phase 7).

**A3. Barge-in ≤ 150 ms, and barge-in that redirects work.**

- Production systems (Pipecat BSD-2; LiveKit Agents Apache-2.0; OpenAI Realtime `server_vad`) trigger interruption on the VAD's speech-start while the agent speaks, gated by minimum duration/words; LiveKit rolls back false interruptions (`resume_false_interruption`). None diarises; all rely on echo cancellation + thresholds. LiveKit's turn detector and Pipecat's Smart Turn v3 both exclude Tamil — use VAD-based turns.
- Design (`bargein.ts`, new, component folder): while `mode === "speaking"`, fire barge-in when 3 consecutive 32 ms frames ≥ 0.85 (≈ 96 ms).
- Self-echo guard (no model): `mouth.ts` knows the PCM it plays (after the Phase 2 rewrite it schedules AudioBuffers itself — verify this holds before relying on it; today's `<audio>`-element playback may not be AEC-referenced by Chrome). Keep a 1 s ring buffer of playback RMS at 32 ms resolution; on a candidate barge-in, normalised cross-correlation of mic RMS vs playback envelope over the last 320 ms for lags 0–120 ms; max correlation > 0.8 → echo, ignore. Add a 2 s loopback self-test on Jarvis-mode start (chirp through the GainNode, measure residual correlation); if residual > 0.5, raise the barge-in gate to 0.92 / 5 frames. `@ennuicastr/webrtcaec3.js` (BSD/0BSD WASM AEC3) is optional, only if the self-test shows AEC broken and Phase 1 has time.
- Duck TTS −12 dB for the first 150 ms after a candidate onset (GainNode ramp); false-interruption rollback: no transcript within 1.5 s → resume from the interrupted chunk.
- Redirect, not just stop: onBargeIn (a) aborts the in-flight agent run and `/api/jarvis/say` fetches via AbortController, (b) discards queued TTS sentences, (c) keeps the current query frame (B5) so "no, Anna Nagar" refines it, (d) marks the aborted step in telemetry. **Abort crosses the network as a cancelled fetch**: the browser aborts the HTTP request; the server route must check `request.signal` and stop its own downstream work. Do not pretend one AbortSignal object spans browser and server.
- Instrument: `performance.mark("jarvis:bargein:onset")` / `("jarvis:bargein:silenced")`; the difference is the reported barge-in latency.

**A4. STT — Tamil accuracy is the real problem. Two transcribers in parallel, Tamil-script output, transliteration for matching.**

- Measured facts: Groq ASR is file-based only, no streaming. Whisper large-v3 Tamil WER 48.6–56 % (FLEURS) and ~82 % (IndicVoices); Whisper LID only 64.5–80 % accurate; zero-shot turbo on Tamil-English code-switch ~115 % WER. Gemini 3 Flash ≈ 12.1 % FLEURS-Tamil WER (Pro 11.4), IndicConformer 25.5, Whisper 48.6. Whisper cannot be the Tamil primary.
- Do not adopt: streaming-Whisper servers, in-browser WebGPU Whisper (small ≈ 93 % Tamil WER). Future (HANDOVER only): AI4Bharat IndicConformer (MIT per card, HF-gated), Meta Omnilingual ASR (Apache-2.0, details unverified).
- Design (`/api/jarvis/hear` rewritten; `stt.ts` new in lib): early upload at VAD end (~300 ms silence). Two transcribers race from existing keys: (a) Groq `whisper-large-v3-turbo` as two parallel forced decodes `language=ta` and `language=en` (never the serial re-send; never Whisper LID), and (b) Gemini `generateContent` with inline audio (`gemini-3.5-flash-lite` / `gemini-3.1-flash-lite` — free-tier lite, 10 RPM / 500 RPD; verify ids) with strict JSON `{text_ta_script, text_latin, language}` keeping Tamil words in Tamil script. Arbitration: Gemini's result if within 1500 ms of the first; else the Whisper decode with better `avg_logprob`, swapping Gemini's text into the on-screen line if it lands later (no re-plan). Under quota pressure (ledger, C) drop to Whisper only.
- Whisper confidence gate: `no_speech_prob` < 0.6, `avg_logprob` > −1.0, `compression_ratio` < 2.4, 3-gram-repetition check, script check (ta decode > 30 % Latin → suspect). Keep the hallucination regex.
- Speculative partial at 1.2 s (Whisper only, `partial: true`) for intent prefetch (B4) and the "hearing…" line; auto-disable below 30 % of the hourly audio budget (Groq Whisper: 20 RPM, 7,200 audio-seconds/hour).
- Tanglish: transcripts are Tamil script for Tamil words, Latin for English; matching happens on both forms. `xlit.ts` (new): deterministic Tamil ↔ Latin transliterator (ISO 15919-lite, ~100 lines, no runtime dep); extend alias tables in `understand.ts`/`screens.ts` so every place/department/keyword has Tamil-script, transliterated and common-romanised forms. Generate the table offline with AI4Bharat IndicXlit if it installs in < 5 min; else hand-write ~200 entries. Never apply Whisper's BasicTextNormalizer to Tamil (strips vowel signs/virama); NFC + punctuation strip only.
- Fallback ladder when both providers fail: browser Web Speech (`ta-IN`/`en-IN`, Chrome) → text input in the panel.
- Report CER/WER per transcriber on the held-out subset per F1's sizes (not more), first-run and final. No invented targets.

**A5. TTS — stream it, start it early, Tamil first. Verify the keys before choosing the primary.**

- Engines checked: Kokoro-82M (Apache-2.0) — no Tamil → English-only offline fallback at best. Piper → GPL from v1.3 → rejected. `mms-tts-tam` CC-BY-NC → test audio only. Indic-Parler / IndicF5 — permissive but server-scale → HANDOVER. Groq TTS — no Tamil. Coqui XTTS — CPML, rejected.
- Hosted facts: Gemini TTS catalogue `gemini-3.8-flash-tts` / `gemini-3.8-flash-lite-tts` (Tamil listed; free tier ~3 RPM; output 24 kHz 16-bit PCM; streaming only via Interactions API, free-tier availability unverified; `gemini-2.5-flash-preview-tts` is limited-access — drop it). Azure: `ta-IN-PallaviNeural` / `ta-IN-ValluvarNeural` / `en-IN-NeerjaNeural` exist; F0 = 0.5 M neural chars/month; streaming first-byte latency unverified. Windows `speechSynthesis`: legacy Tamil "Valluvar" at best. The current code also uses **Edge natural voices as a working fallback** (see `src/lib/jarvis/voices.ts`) — keep that path alive.
- Ladder (in `/api/jarvis/say`), **conditional on the Phase 0 key audit**:
  1. **If an Azure Speech key exists** (an env var that is actually a Speech resource — an Azure OpenAI or other Azure key does not count): Azure streaming REST, `ta-IN-PallaviNeural` / `en-IN-NeerjaNeural` (verify ids in the voice list), `X-Microsoft-OutputFormat: raw-24khz-16bit-mono-pcm`, piped through the route as a ReadableStream; never buffer a WAV.
  2. Gemini `gemini-3.8-flash-lite-tts` → `gemini-3.8-flash-tts`: one 10-minute probe of the Interactions streaming path; if unavailable on free tier, `generateContent` per sentence chunk. 3 RPM → the ledger must refuse to exceed it; Gemini is never the conversational primary.
  3. The existing browser/Edge voice path (today's behaviour) — keep working as the no-key, offline and rate-limited fallback. `kokoro-js` (English-only) is optional; skip if Phase 2 is tight.
  - **If no Azure Speech key exists, the ladder is 2 → 3 and you say so in BUILD_LOG and RESULTS — do not burn time wiring a provider with no key.**
  - Wire `TTS_PROVIDER` for real: `azure | gemini | browser | auto` (default `auto` = ladder).
- Sentence chunking + progressive playback (`mouth.ts` rewrite, `chunker.ts` new, component folder): terminators `. ! ? । ॥` and newline; split on `, ;` only above 120 chars; send the first chunk at ≥ 20 chars at a terminator; explicit Tamil unit test. Play via Web Audio: Int16 → Float32, AudioBuffers scheduled back-to-back on the AudioContext timeline with 50–100 ms pre-roll and ≥ 1 chunk lookahead; `performance.mark("jarvis:tts:first-audio")` when the first source starts. Route playback through a GainNode (ducking) and AnalyserNode (UI).
- Start TTS before the agent finishes: the agent emits an **acknowledgement sentence** that depends only on the query frame ("Comparing Adyar with Anna Nagar for October.") spoken while tools run (templated by code, numberless), then the finding sentences after the figure gate. This is the single biggest perceived-latency win.

**A6. Speech-to-speech — rejected.** No open or free S2S/streaming-speech model supports Tamil, and S2S lets the model speak numbers, which breaks rule 3. Keep STT → planner → code-built answer → TTS.

**A7. Latency budget, mic → first audio (p50 targets; you measure actuals).**

| Stage | Today (by code) | Target | How |
|---|---|---|---|
| End-of-utterance detect | 768 ms | ≤ 300 ms | `redemptionMs: 300` |
| Upload + STT (Groq turbo) | ~700–1200 ms | ~600–900 ms (overlapped) | early upload; partial at 1.2 s |
| Rules layer (`quick.ts` + understand) | ~1.5 ms | unchanged | — |
| Planner (fast model) | 800–2500 ms | 600–1500 ms | short schemas, two-stage routing, plan cache |
| Tool calls | serial, 300–1500 ms | parallel + speculative | B4 |
| TTS first audio | whole clip, 1500–4000 ms | ≤ 300 ms after first sentence | streaming PCM, ack first |
| **Total** | ~4–9 s | **p50 ≤ 1.8 s / p90 ≤ 3.5 s rules-layer; p50 ≤ 3.0 s / p90 ≤ 5.0 s planner** | |

Required overlaps: (i) STT partial → rules intent → speculative tool prefetch; (ii) acknowledgement TTS during tool calls; (iii) planner hedge timer from the observed p95 of the fast model, not a fixed 3500 ms.

### B. Agentic planning and tool use

**B0. Decide where the loop runs — first 10 minutes of Phase 4, before writing code.** Read `agent.ts` and `agentServer.ts` and establish which side executes the loop and where the Stage reducer lives. The design below requires the planner to see a fresh stage digest each round. If the loop is server-side and the Stage is browser-side, do **not** invent `await stage.commit()` across the network: either (a) run screen-op execution client-side between rounds — the route returns the round's ops, the client applies them to the Stage reducer and sends the digest back with the next round request (one round-trip per round, bounded by MAX_ROUNDS), or (b) maintain a server-side mirror of the Stage state (the reducer is pure — reuse it) and reconcile to the client as today. Pick whichever matches the existing architecture with the smaller diff, write the choice and the reason in BUILD_LOG, and only then implement. A step resolves when its op has been applied and digested — never by `sleep()`.

**B1. Act–observe–act inside the existing bounded loop (`agent.ts`).** ReAct-style: every step returns `Observation {ok, kind, summary, data?, error?, stageDigest}`; the next planner round receives the observations plus a fresh `stageDigest` (≤ 400 tokens: recipe, slot values, block kinds, row counts, selected entity, visible ordinals 1..n with ids). Keep MAX_ROUNDS = 3, DEADLINE_MS = 8000, but allow tools in **all** rounds (the rounds-0–1 restriction is what forced the hardcoded missions); replace the two hardcoded missions and their `sleep(1600)` per B0. Evidence: Vercel AI SDK / OpenAI Agents SDK / Anthropic's loop all feed back only structured results plus a step cap; Huang et al. (ICLR 2024) show free-text self-reflection lowers accuracy — so: code-generated observations, at most one corrective round, no reflection prose. TypeScript in `agent.ts`; no framework. Token discipline (see C): observation ≤ 150 tokens, digest ≤ 400, frame ≤ 120, tool schemas one line; target ≤ 2.5 K tokens per planner call, ≤ 2 planner calls per turn on average.

**B2. Failures surfaced, not swallowed.** Every tool/step error becomes `{ok:false, error:{code, message, retryable}}` fed back with "choose a different action or say briefly what you could not do". Max one retry per step; never the same action with identical args twice (dedupe key = action + canonical JSON). < 1500 ms left → answer with what is known.

**B3. Tool surface — expose the hidden tools, route in two stages.** Evidence: accuracy degrades past ~30–50 tools (Anthropic docs); adaptive shortlists of ~2 tools beat fixed 5 (Meta, arXiv 2605.24660); RAG-MCP 13.6 → 43.1 %. Design (`toolsets.ts`, new): 5 bundles over **all** tools — cases, geo, metrics, news/readings, drafts (take the real tool names from the code; the count in older notes may be off — enumerate them in Phase 4 and bundle every one). Rules layer picks a bundle; if no rule fires, a tiny enum-output router call (≤ 300 tokens). The planner sees only that bundle. Plan-as-JSON executed by code, not native tool calling: Groq `gpt-oss` has no parallel tool calling and strict `json_schema` can't combine with tools/streaming — so the planner emits a JSON plan (zod → `zod-to-json-schema`, MIT) in strict mode and a TS executor runs it (LLMCompiler pattern). Constrained decoding: invalid-output rate → ~0 % (arXiv 2609.23742). Keep the plan schema small (action enum fine; avoid nested anyOf for Gemini compatibility).

**B4. Speculative and parallel tool execution.** The executor runs all independent steps of a round with `Promise.allSettled`. Speculative prefetch: when the STT partial or final transcript hits a rules-layer intent with resolved slots, start the obvious tool call(s) into a 10 s promise cache; the planner's identical call resolves instantly. Safe: every tool is read-only (verify this claim against the tool registry in Phase 4 before enabling prefetch; exclude any that writes).

**B5. Memory — a structured query frame, not chat history.** `frame.ts` (new, lib): `QueryFrame = {intent, slots:{place?, dept?, category?, window?, metric?, compareTo?}, recipe, visible:[{ordinal,id,label}], lastAnswerFacts:[{key,value,unit}], turn}`. Deterministic rules before any model: "and in Adyar?" → replace place; "why?" → recipe why, same slots; "the second one" → `visible[1].id`; "compare with last month" → `compareTo = shift(window, −1)`. Only when rules fail does the planner get the last frame and output a frame delta. Carry slots selectively by type (Alexa carryover evidence: naive carry-everything ruins precision). Keep the last 3 frames; send the latest + one-line summary of the prior two. Integrate with — do not duplicate — whatever follow-up state `quick.ts`/`understand.ts` already hold.

**B6. Off-topic wall → three-way router with a privacy policy.** Rules first, then fast model with a 3-label schema: `district` (tools) | `general` (model answers, no tools, no district numbers; greetings, definitions, date/time, how-to-use-Jarvis, general knowledge with a one-line caveat) | `refuse` (privacy: citizen identity/phone/Aadhaar/address/verbatim complaint text; any send/approve/delete). Privacy is a **code-level** policy in `privacy.ts`: regexes for Indian mobiles, Aadhaar (12 digits, optional Verhoeff), and a redaction pass over every tool result before it reaches model or Stage. No NeMo Guardrails / semantic-router.

**B7. Patterns stolen from JARVIS-like OSS.** OpenVoiceOS: intent-confidence tiers (exact → fuzzy → fallback LLM) = the rules layer + bundle router. openai-realtime-agents: chat-supervisor two-lane = acknowledgement-then-findings. ag-ui: state-delta events = stageDigest deltas. Leon/annyang/HuggingGPT add nothing — do not adopt.

### C. Serving capacity and reliability

**C0. Quota and key facts (re-verify live in Phase 0 — this is mandatory, 10 min, before anything else is built).**

- **Key audit first**: list which env vars actually exist (`GROQ_API_KEY`(S), `GEMINI_API_KEY`, AWS/Bedrock, OpenAI, any Azure var) — names only, never values. Determine whether any Azure var is a **Speech** resource; if none is, flip A5's ladder as stated. Probe `GET https://api.groq.com/openai/v1/models` and one Gemini `models.list` to confirm today's model ids; record `x-ratelimit-*` headers from one call per model.
- Groq free tier: chat models `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b` — each 30 RPM / 1 K RPD / 8 K TPM / 200 K TPD per organisation. Whisper 20 RPM, 7,200 audio-s/hour, 25 MB cap. This explains the v3 429 storms (3 rounds × hedge × 3 retries at ~5.5 K tokens blows 8 K TPM in a minute). The fix is structural — token diet (B1), rules-first, bundle routing, plan cache (C3), and spreading turns across the three Groq models by remaining TPM (C1). Both Phase 3 (ledger) and Phase 4 (token diet) carry it.
- Gemini free tier: `gemini-3.8-flash`/`3.6-flash` 5 RPM / 20 RPD (never hedge into these); `3.5-flash-lite`/`3.1-flash-lite` 10 RPM / 500 RPD / 250 K TPM; TTS 3 RPM. Per project.
- **Bedrock/Claude option**: `gateway.ts` already has a Bedrock provider. If the Phase 0 probe shows the AWS keys are valid, add Claude to the degradation ladder via Bedrock — `anthropic.claude-haiku-5-5` for the bundle router and frame-delta tasks (very cheap), `anthropic.claude-sonnet-5-5` as a planner fallback. Verify both ids with a 1-call probe; if the keys are dead or the ids unavailable in the account's region, skip and note it. Claude has no audio — planner lane only. Bedrock usage is billed to the team's AWS account, so Claude is a fallback rung only, never the primary or the hedge target during evals; log every Claude call in telemetry and report the call count in RESULTS.

**C1. Shared, persisted quota state.** Replace in-process Maps with a SQLite ledger: `node:sqlite` (Node ≥ 22.13) or `better-sqlite3` (MIT — verify; if the native build fails on Windows, fall back to a JSON file ledger with atomic rename). No Redis. Table `quota(provider, key_id, model, window_start, requests, tokens, audio_seconds, last_429_at, cooldown_until, observed_rpm, observed_tpm)`; update from rate-limit headers when present. **Deployment caveat**: the ledger is for the laptop demo and dev; it must be behind an interface so a hosted deployment (ephemeral/multi-instance filesystem) can swap it out — note this in HANDOVER, do not solve it now. Admission control: pick the Groq model with the most remaining TPM; refuse a planner call whose estimate exceeds the remaining minute budget and fall down the ladder. Hedging: tied request at the observed p95 of the primary (min 1000 ms), loser aborted; hedge target = another Groq model with budget, else Gemini flash-lite; no hedge below 40 % of any per-minute budget. Degradation ladder per call: Groq (most budget) → next Groq → Gemini flash-lite → Bedrock (Claude or Nova, if keys valid) → local Ollama (C2) → rules-only answer ("I can show the screen but cannot reason about it right now"). Log every hop with its reason.

**C2. Local fast lane** — only if Ollama is already installed (or installs in < 5 min) **and** a 2-minute probe shows < 700 ms per structured call: `qwen3:1.7b`/`4b` (Apache-2.0), Q8/fp16 tag, for the bundle router and frame deltas only. Otherwise skip and note it.

**C3. Caching.** Plan cache: key = (intent, canonical slots, bundle, data_version) → validated plan JSON, TTL 10 min; plus normalised-utterance → (intent, slots) memo; in the ledger DB. Exact keys only — semantic caches rejected (3–5 % false positives are unacceptable for a numeric assistant). Tool-result cache 30 s TTL by canonical args (serves B4). Prompt shaping: schemas only for the chosen bundle, one-line descriptions, stable system-prompt prefix. Telemetry: one JSON line per request to `.jarvis/telemetry.ndjson` (gitignore it) `{t, provider, model, ms, tokens_in, tokens_out, status, hedge, phase}`.

### D. Analysis quality — and the owner's features

**D0. The owner's asks are first-class acceptance criteria, not side effects:** (a) **comparisons** — "compare Adyar with Anna Nagar", "compare with last month" produce a comparison screen plus a spoken delta with code-computed numbers; (b) **insights** — "what stands out", "any unusual wards" run the D1 outlier/trend scans and speak the findings with caveats; (c) **"complete this data"** — given the current screen or a named dataset, Jarvis (i) names what is missing (empty fields, feeds behind, wards with no reports in the window — computed in code), (ii) fills what is derivable in code (rates, per-population normalisation, totals), and (iii) drafts the follow-up requests to the responsible departments **into the approval tray** (grade B drafts; never sent). Each gets at least one held-out understanding item and one acceptance test.

**D1. Statistics** — `stats.ts` (new, lib), ~250 lines, tests; `simple-statistics` (ISC) only for helpers. Outliers: modified z-score with median/MAD (Iglewicz & Hoaglin 1993), flag |M| > 3.5, n ≥ 8, Benjamini–Hochberg q = 0.1 when scanning many wards. Count anomalies: Poisson c-chart (c̄ ± 3√c̄; only when c̄ ≥ 5), u-chart when normalising, EWMA (λ = 0.3) for drifting series; suppress "% change" when baseline < 5. Trend: Theil–Sen + Mann–Kendall (direction only when p < 0.05 and n ≥ 8). Seasonality: ≥ 2 years → same-period-last-year + 52-week MA ratio; else "not enough history". Forecast: only "if the current slope continues, next month ≈ x ± y", labelled extrapolation. Every function returns `{value, n, method, caveat}`; caveats have English and Tamil strings the speech layer must include.

**D2. The model never produces a number — template-slot speech.** The planner's spoken text contains only placeholders `{n:key}`; code fills them from `lastAnswerFacts` and stats outputs, formatted per language (Tamil numerals optional; lakh/crore grouping). The verifier extracts digits, Tamil digits, English number words (`words-to-numbers`, MIT — verify) and Tamil number words (~40-entry table), normalises lakh/crore, whitelists ids, and rejects any value not in the fact table within rounding tolerance: regenerate once, then drop the sentence. Gate applied in `agent.ts` **and** in `mouth.ts` before any chunk reaches TTS. Property-test with `fast-check` (MIT): random fact tables and sentences; any unsupported number is rejected.

**D3. Ward-level maps — optional, strictly time-boxed.** Keep whichever library the map block already uses if MapLibre or Leaflet; else MapLibre GL JS (BSD-3, verify current version) with `promoteId`/`setFeatureState` for choropleths. Data: opencity.in Chennai GCC ward KML → GeoJSON ≤ 500 KB via mapshaper (dev-time), `public/geo/chennai-wards.geojson`; ward→zone table into `geo/wards.ts`. **If the ward file is not obtained within 15 minutes, keep zone shading and move on.** New block kinds in the zod catalog: Sparkline row, ControlChart; extend Chart with small multiples only. No pie/3D/radar.

### E. UI — calm HUD, present and legible (this is a headline deliverable, not a leftover)

**E1. Design direction (original; no Marvel/Disney artwork, names or trademarks).** One audio-reactive focal element: a ring core (concentric thin rings + reactive inner disc), 56 px in the top bar, 160 px when the panel is open. States legible without colour: idle (slow 6 s opacity breathing), listening (rings expand with mic RMS; red recording dot), hearing (partial transcript under the core within 150 ms), thinking (slow rotation; intent chip "Comparing Adyar vs Anna Nagar…"), speaking (inner disc pulses with TTS amplitude from the AnalyserNode), interrupted (collapse in 120 ms), error/offline (amber, static). Palette: the console's neutrals + one cyan accent + one amber; no scanlines, no glow blur on text, no full-screen motion. Transitions 120–200 ms ease-out; nothing slower than 300 ms except idle breathing. Implementation: SVG/CSS transform+opacity only (compositor-safe; never animate filter/box-shadow/backdrop-filter) + one ≤ 160 px 2D canvas driven by an AnalyserNode (fftSize 256, smoothing 0.8), rAF, paused when hidden or reduced-motion. No three.js/WebGL/GSAP; `motion` only if already a dependency.

**E2. Jarvis-mode toggle and the top-bar mic** (`TopBarMic.tsx`, new; one mount point in the console top bar). Three-state model from Windows Voice Access (off / sleeping / listening) with persistent status text — **sleeping means the wake word is armed**; the existing wake flow is the primary hands-free path and must keep working. Click = push-to-talk toggle; Ctrl+Space global chord (ignored in inputs/contentEditable); Esc cancels/interrupts. Toggle persists to localStorage. Permission: wrap `navigator.permissions.query({name:"microphone"})` in try/catch; denied → tooltip with Chrome steps. In-app red dot + "Listening" text (not colour-only). `aria-live="polite"` announces state with 500 ms debounce; never announce partials. `role="button"`, `aria-pressed`, focus ring ≥ 3:1 (WCAG 2.2). `prefers-reduced-motion` → static rings, plain level bar; `prefers-contrast: more` → thicker rings. The idle breathing (> 5 s animation) is stoppable via the Jarvis-mode toggle — document for SC 2.2.2.

**E3. Tamil legibility.** Font stack for Jarvis surfaces: `"Noto Sans Tamil", "Nirmala UI", Latha, system-ui, sans-serif`; Noto Sans Tamil (OFL-1.1) self-hosted Tamil-subset woff2 in `public/fonts/`. Never per-glyph animate, letter-space, blur, underline or fade-split Tamil text (breaks conjuncts and vowel signs); line-height ≥ 1.5; Western digits in UI, Tamil numerals only in speech when the setting is on; ≥ 16 px Tamil body / 14 px chips; default shaping untouched.

### F. Evaluation — honest by construction, sized to fit the clock and the quotas

**F1. Held-out sets (written in Phase 0 before any tuning; SHA-256 committed; never edited after first run).**

- `eval/holdout/understanding.jsonl`: **150 commands** — EN 60 / TA 50 / Tanglish 40 — drafted by a different model (Gemini) with a different prompt than the rules layer; you review for realism only. Stratify across all recipes and local commands **including D0's comparison / insight / complete-this-data intents**; include 20 two-turn follow-ups. Scoring the full 150 through the **rules layer + router** is cheap (code). Through the **full planner path**, score a fixed 40-item subset (stratified), 2 s inter-turn gap — up to 80 planner calls, about 9 minutes at ~9 calls a minute across the three Groq models (8 K TPM ÷ 2.5 K tokens × 3); report both numbers with Wilson 95 % intervals.
- `eval/holdout/tamil-asr/`: **100 clean utterances** (deterministic selection by sorted SHA-256 of id) from the first scriptable source: OpenSLR SLR65 (CC BY-SA — share-alike, test-only, flagged) → FLEURS `ta_in` (CC-BY-4.0) → IndicVoices (gated; not in CI). Plus the **same 100 with office noise at 10 dB SNR** (MUSAN, CC-BY-4.0). **Quota plan (do the arithmetic, it is the constraint):** Groq Whisper at 20 RPM → 200 files ≈ 10–12 min, run clean in Phase 0 foreground, noisy in background. Gemini flash-lite at 10 RPM / 500 RPD → score it on **the clean 100 only, once, in Phase 0, in the background** (~10 min, ≤ 100 RPD) to decide A4's arbitration; do **not** re-run Gemini on audio in Phase 7. Phase 7 re-runs **Whisper only, on a fixed 50-clip subset** (clean 25 / noisy 25, chosen by the same hash order) — ~5 min, because the new `/hear` sends two forced decodes per clip (100 calls at 20 RPM). First-run vs final columns therefore compare like-for-like on that 50-clip subset, with the full-100 first-run numbers reported once.
- Tanglish audio: no permissive code-switched corpus exists; evaluate Tanglish on the understanding set (text; phrasing source UCI TamilSentiMix, CC BY 4.0). Synthesise 30 Tanglish utterances with the chosen TTS as **smoke tests only, labelled synthetic, never held-out**.
- Metric: CER and WER after NFC + punctuation strip + Latin lower-casing (never Whisper's normalizer on Tamil); `jiwer` (Apache-2.0 — verify) or a 40-line TS Levenshtein. Tanglish compared after both sides pass `xlit.ts`.

**F2. Browser pipeline tests (Playwright — verify it is in devDependencies, else add).** Chromium with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=<abs>.wav` (WAV must match the audio bus format exactly; loops unless `%noloop`; read failure is silent — probe bus sample rate first and generate fixtures to match). Tests: `vad.spec` (onSpeechStart within 150 ms of utterance offset; onSpeechEnd within 400 ms of end; no event on noise-only), `bargein.spec` (TTS playing, fixture speech → onset→silenced ≤ 150 ms p50 over 10 runs; CI gate p90 ≤ 250 ms), `e2e-latency.spec` (STT/LLM/TTS mocked by `msw` at recorded latencies → mic-frame→first-audio; one unmocked local run reported separately). Unit tests (vitest) for `chunker`, `frame`, `privacy`, `stats`, `xlit`, the extended figure gate (fast-check), and both routes with recorded fixtures. Gate CI on functional assertions and generous ceilings; report p50/p90 as artifacts; never tune thresholds to make CI green.

**F3. Report.** `eval/RESULTS.md`: two columns per metric (first-run / final), the like-for-like note from F1, and a "Not verified" list with reasons.

## 4. Phased build plan — 295 minutes + 5 slack, hard stop at 5 h

Each phase ends with: tests green, `tsc` green, `next build` green, commit. **Time the first full three-check cycle in Phase 0; if it exceeds ~8 minutes, run vitest + tsc per phase and `next build` at Phases 2, 4, 6, 7 only — record the decision.** Keep `docs/thunai/BUILD_LOG.md` running (timestamps per phase, what was cut). If a phase overruns by > 15 %, finish at a green state and move on.

**Phase 0 — Baseline, key audit, held-out sets, instrumentation (30 min, mandatory)**
Stash pre-existing local changes (section 1); branch. Run the three checks; **record the real test count** and timings. Key audit + quota probes per C0 (including the Azure-Speech determination and the Bedrock validity probe — these flip A5 and C1 options). Write and freeze the held-out sets (F1), commit hashes. First-run scores: understanding through the existing rules layer (code, fast); Whisper on the clean 100 (foreground ~10 min) and noisy 100 + Gemini clean 100 in the background while Phase 1 proceeds. Add `telemetry.ts`. If a provider blocks, record "not run" and continue.

**Phase 1 — Voice input: AudioWorklet + Silero VAD + barge-in (60 min)**
Install `@ricky0123/vad-web` + `onnxruntime-web`; asset copy script; model licence check; `vad.ts`; rebuild `ears.ts` on it (ms constants, delete ScriptProcessorNode) **without breaking `wake.ts`** — wake listening consumes the same frame stream; `bargein.ts` (probability window, envelope guard, ducking, rollback, abort propagation per A3); AEC loopback self-test. Playwright `vad.spec`, `bargein.spec`. Cut line: ship VAD + simple abort; defer envelope guard and rollback (record it).

**Phase 2 — Streaming TTS and overlap (40 min)**
`/api/jarvis/say`: ladder per A5 as resolved by the Phase 0 key audit; `TTS_PROVIDER` wired; keep the existing browser/Edge path working. `chunker.ts` (Indic terminators, Tamil unit test); `mouth.ts` rewrite (scheduled AudioBuffers + GainNode + AnalyserNode); acknowledgement-first speaking; figure gate on every chunk. Cut line: per-sentence Gemini clips (still earlier first audio than today).

**Phase 3 — Gateway: quota ledger, admission control, adaptive hedge, ladder, caches (30 min)**
Before the agent loop, because the loop's observations add tokens against 8 K TPM. SQLite/JSON ledger, header-driven limits, per-model budget selection, p95 hedge with abort and quota suppression, degradation ladder (including Bedrock/Claude if Phase 0 validated it), plan + tool-result caches, utterance memo, telemetry. Ollama lane only if the probe passes.

**Phase 4 — Agent loop: observe, fail loudly, route tools, remember (50 min)**
**First 10 min: B0 boundary decision, written to BUILD_LOG.** Then: Observation type + stageDigest; tools in all rounds; op-applied-and-digested step resolution (no sleeps); error observations + dedupe; plan-as-JSON strict + TS executor with `Promise.allSettled`; `toolsets.ts` bundles over the enumerated tool registry; speculative prefetch (read-only tools only); `frame.ts` with the four deterministic follow-ups, integrated with `quick.ts`; `privacy.ts` + three-way router replacing the wall; token diet. Unit tests for frame, privacy, toolsets, loop (mocked gateway). Cut line: observation loop + errors + executor + frame first; bundles and prefetch second.

**Phase 5 — Analysis + owner features (20 min)**
`stats.ts` (outliers + trend first; c-chart/EWMA/seasonality if time), Sparkline/ControlChart blocks, D0 recipes (compare / insights / complete-this-data with tray drafts), `{n:key}` templating with the gate as a pipeline stage, fast-check property tests. Cut line: outliers + trend + compare + complete-this-data; seasonality reported as "not enough time".

**Phase 6 — UI: Jarvis mode, top-bar mic, ring core, Tamil type, a11y (45 min)**
Must-ship: `TopBarMic.tsx` with the three states coexisting with wake; `RingCore.tsx` with all seven states wired to `voice.ts`; aria-live + keyboard; reduced-motion variants; Noto Sans Tamil self-hosted; panel typography pass. Then, if time: intent chip polish, ward map (D3, 15-min box). Measure fps with Chrome tracing for 20 s in speaking state; target ≥ 55 fps.

**Phase 7 — Measure, report, hand over (20 min, mandatory)**
Re-run per F1's reduced final plan: understanding 150 via rules+router, 40-item planner subset, Whisper 50-clip subset, barge-in p50/p90, mic→first-audio p50/p90 (mocked; plus one real local run if quotas allow). Write `eval/RESULTS.md` (first-run vs final, like-for-like note, Not-verified list). Update `docs/thunai/REFERENCES.md` (every source + licence). Final three checks, final commit, push the branch (no force). `docs/thunai/HANDOVER.md`: what shipped, what was cut, the stash note, the ledger's deployment caveat, next steps on a Linux box (IndicConformer / Omnilingual ASR, Indic-Parler TTS, ward map if skipped).

## 5. File-level guidance

Change (paths per section 1):
- `src/components/collector/app/thunai/ears.ts` — rebuild on `vad.ts`; delete ScriptProcessorNode; ms constants; emits speechStart/partialReady/speechEnd; keeps feeding `wake.ts`.
- `src/components/collector/app/thunai/mouth.ts` — streaming PCM scheduling, GainNode ducking, AnalyserNode, chunk queue, abortable, gate on every chunk.
- `src/components/collector/app/thunai/voice.ts` — state machine idle→listening→hearing→thinking→speaking→(interrupted); owns the per-turn AbortController; exposes state to UI; wake transitions preserved.
- `src/lib/thunai/agent.ts` (+ `agentServer.ts` per the B0 decision) — observation loop, error observations, parallel tools, bundle-scoped tool lists, frame in/out, acknowledgement-first speech, gate as pipeline stage; remove the `sleep(1600)` missions.
- `src/lib/thunai/plan.ts` — plan schema gains `frameDelta`, `ack` (templated, numberless), `bundle`; structured-output schema export.
- `src/lib/thunai/understand.ts` — alias tables in both scripts via `xlit.ts`; router labels district|general|refuse; `quick.ts` fast lane stays first.
- `src/lib/thunai/screens.ts` — Sparkline, ControlChart; stats-backed slots; D0 compare/insight/complete screens.
- `src/lib/thunai/risk.ts` — grades unchanged; general lane is grade A (no tools); complete-this-data drafts are grade B.
- `src/lib/ai/gateway.ts` — ledger, adaptive hedge, abort, ladder (incl. optional Bedrock/Claude ids), caches, telemetry.
- `src/app/api/jarvis/hear/route.ts` — early/partial uploads, parallel forced-language decodes, repetition check, Gemini arbitration, `request.signal` respected.
- `src/app/api/jarvis/say/route.ts` — streaming pass-through per the resolved ladder, `TTS_PROVIDER`, `request.signal` respected.
- `src/components/collector/app/thunai/Thunai.tsx`, `Stage.tsx`, `Panel.tsx` — mount core/mic, consume `voice.ts` state, aria-live, reduced motion; no Stage restructure beyond the two new blocks.
- Console top bar — one mount point for `TopBarMic` behind the Jarvis-mode flag (minimal diff).

Create: `src/components/collector/app/thunai/{vad,bargein,chunker}.ts`, `TopBarMic.tsx`, `RingCore.tsx`; `src/lib/thunai/{stt,frame,toolsets,privacy,xlit,stats,telemetry}.ts`, `geo/wards.ts` (optional); `public/vad/*`, `public/fonts/NotoSansTamil-*.woff2`, `public/geo/chennai-wards.geojson` (optional); `eval/holdout/*`, `eval/asr/score.(py|ts)`, `eval/RESULTS.md`; `tests/e2e/{vad,bargein,e2e-latency}.spec.ts`; vitest files beside each new module; `docs/thunai/BUILD_LOG.md`, `HANDOVER.md`; update `docs/thunai/REFERENCES.md`; `.env.example` additions: `TTS_PROVIDER`, `GROQ_API_KEYS`, `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` (marked optional), `OLLAMA_URL` (optional). Gitignore `.jarvis/`.

## 6. Measurable acceptance criteria (report all; gate where marked)

| Metric | Target | Gate? |
|---|---|---|
| Barge-in latency (onset → silenced), p50 / p90 | ≤ 150 ms / ≤ 250 ms | p90 gate in CI |
| End-of-utterance detection after last voiced frame | ≤ 350 ms | report |
| Mic → first audio, rules-layer turns, p50 / p90 (mocked) | ≤ 1.8 s / ≤ 3.5 s | report |
| Mic → first audio, planner turns, p50 / p90 (mocked) | ≤ 3.0 s / ≤ 5.0 s | report |
| Same, real providers (one local run) | report actuals | report |
| Tamil ASR CER/WER (per F1's subsets, clean and noisy) | first-run and final; no invented targets | report |
| Tanglish understanding accuracy (held-out, xlit-normalised) | ≥ 80 % | report |
| Understanding accuracy, 150 held-out via rules+router (Wilson 95 %) | ≥ 85 % final; first-run separate | report |
| Understanding accuracy, 40-item planner subset | report both runs | report |
| Follow-up resolution (4 types, 20 items) | 18/20 | gate (unit) |
| **Compare / insight / complete-this-data each work end-to-end** (spoken answer with gated numbers + correct screen; complete-this-data also leaves ≥ 1 tray draft) | 3/3 demo scripts pass | gate (integration) |
| Wake word still wakes Jarvis; mic button and Ctrl+Space also work | existing wake tests + 2 new | gate |
| Every spoken number verified against a tool result | 1,000-case property test rejects all unsupported numbers | gate |
| Privacy: no phone/Aadhaar/citizen verbatim in any Stage block or TTS chunk | 50-case adversarial unit set | gate |
| Jarvis never emits send/approve/delete | existing risk tests + 10 adversarial commands | gate |
| UI frame rate, speaking state, 20 s trace | ≥ 55 fps; reduced-motion ≥ 59 fps | report |
| Existing suite (count recorded in Phase 0) + all new tests; tsc and build clean | 100 % | gate |
| Graceful degradation: with GROQ_API_KEY removed, a turn completes via the ladder within 8 s or says "cannot reason right now" | — | gate (integration) |

## 7. What you must not do

- Do not adopt Pipecat/LiveKit/NeMo/semantic-router/LangGraph or any server-side Python voice stack. No native parallel tool calling on gpt-oss; no `json_schema` + tools/streaming combined on Groq; never hedge into `gemini-3.8-flash` (20 RPD).
- No S2S model; no model-emitted digit reaching speech or screen un-gated.
- No Redis, SharedArrayBuffer/COOP-COEP, three.js/WebGL, Prophet/ARIMA, semantic text cache.
- Nothing under GPL/CPML/CC-BY-NC ships; NC/SA data is test-only and flagged.
- Do not remove or regress the wake word, the `quick.ts` fast lane, or the existing browser-voice fallback.
- Do not merge `thunai/v3`; do not edit held-out sets after first run; do not tune to CI noise; do not force-push; do not commit the stashed pre-existing changes.
- Do not assume a key exists: every provider in a ladder was validated in Phase 0 or is skipped with a note.
- Do not spend more than the phase budget chasing any single "unverified" item — take the fallback and record it.

## 8. Final deliverable

Branch `jarvis/agentic-voice` pushed, green on tests/type-check/build, with `eval/RESULTS.md` (first-run vs final, like-for-like note, Not-verified list), `docs/thunai/BUILD_LOG.md` (including the B0 decision and the stash note), `docs/thunai/HANDOVER.md`, and `docs/thunai/REFERENCES.md` updated with every library, model, licence and source used. Prefer one thing that works beautifully over five that half work.
