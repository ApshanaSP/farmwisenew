# Thunai and Jarvis: references checked

## v5, 15-16 Nov 2026 (brief: docs/jarvis/JARVIS_V5_BUILD_2.md, section 17)

"Verified" and "unverified" are as the research graded them on 15 Nov 2026 unless this build checked a line itself (marked "checked in this build"). No grade was raised without opening the source. Licences of dependencies were read from the licence file in the installed package.

### Dependencies and models

| Item | Exact value | Licence (file read) | Status | Shipped? |
|---|---|---|---|---|
| undici (E3, keep-alive connection) | 8.12.4, exact (`package.json`); used with its own `fetch` and `Agent({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 600_000 })` (`keepalive.ts`); loaded on first use only, and on a Node older than its engines (>= 22.19) the built-in fetch is kept | MIT (`node_modules/undici/LICENSE` read: "MIT License, Copyright (c) Matteo Collina and Undici contributors") | option names `keepAliveTimeout`, `keepAliveMaxTimeout` as the brief states (verified for v8.10.0 by the research); behaviour under Next 15 measured in this build (see RESULTS) | yes (`JARVIS_KEEPALIVE`, default on) |
| @livekit/wakeword (C5) | 2.1.2 tried, **not installed**: `npm install` moved `onnxruntime-web` out of the top-level `node_modules`, which the page's `/thunai-ort/` route reads; reverted | Apache-2.0 (research; LICENSE and NOTICE); not re-read because nothing shipped | package and licence verified by the research; accuracy on our phrases unverified | no (C5 cut) |
| sherpa-onnx-node (B5 measurement only) | 2.0.1, outside the repo | Apache-2.0 (read in the spike's own folder) | measured in a scratch folder; never installed in the app | no |
| IndicConformer Tamil exports (B5, test only) | see B5 in RESULTS | code MIT (AI4Bharat's GitHub LICENSE); HF weights gated, tag only; community exports tag only | test only, deleted after, never committed | no |
| FLEURS `ta_in` test (B5 clips) | Hugging Face `google/fleurs` | CC-BY-4.0 (YAML header; no standalone licence file) | test only, deleted after | no |
| Silero VAD v5 (D1) | `silero_vad_v5.onnx` as shipped, now fed `[1, 576]` | MIT (https://raw.githubusercontent.com/snakers4/silero-vad/master/LICENSE) | the 64-sample context matches upstream `utils_vad.py` and `vad-web`'s `silero.ts` (research, code read) | yes (already in the app) |
| ONNX runtime in the page | `/thunai-ort/`, onnxruntime-web 1.31.0-dev.20260914-8d85527a0, one copy | MIT | unchanged | yes (already) |

### Hosted services (no new one added)

| Item | Exact value | Status | Source |
|---|---|---|---|
| Groq planner ids | `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b` (Preview) | verified; all three answered in this build | B, https://console.groq.com/docs/models |
| Groq limits, free plan | 8K tokens and 30 requests a minute, 200K tokens and 1K requests a day, per model, per organisation | **checked in this build:** `x-ratelimit-limit-tokens: 8000`, `x-ratelimit-limit-requests: 1000` on the first calls; the request allowance refills one request every 86.4 s (inferred) | B, https://console.groq.com/docs/rate-limits |
| Groq strict structured outputs | `json_schema`, `strict: true` | verified; **in this build most gpt-oss first calls came back `json_validate_failed` with a usable draft** | B, https://console.groq.com/docs/structured-outputs |
| Groq prompt cache | automatic on gpt-oss; `usage.prompt_tokens_details.cached_tokens` | verified; surfaced by `ai 7.0.122` as `inputTokenDetails.cacheReadTokens` (checked in this build); hits were rare at this traffic | B, https://console.groq.com/docs/prompt-caching |
| Groq Whisper | `whisper-large-v3` (forced Tamil), `whisper-large-v3-turbo` (forced English) | verified | B, https://console.groq.com/docs/speech-to-text |
| Anthropic | `claude-haiku-5-5` leads at deploy; `claude-opus-5-5` by explicit env only | **not called in this build**; the key returned 401 on 15 Nov 2026 | B, https://platform.claude.com/docs/en/about-claude/models/overview |
| Haiku 5.5 price | $0.10 / $0.50 per million input / output; cache write $0.125, read $0.01 | verified by the research; used for the deploy check's US$0.50 cap | B, https://platform.claude.com/docs/en/about-claude/pricing |
| Anthropic request fields | `thinking: {type: "disabled"}` always on Haiku's voice lane; `output_config.effort` low (medium allowed); no temperature, top_p, top_k or prefill | verified by the research; tested with a mocked client in this build | B, https://platform.claude.com/docs/en/build-with-claude/thinking ; https://platform.claude.com/docs/en/build-with-claude/effort ; https://platform.claude.com/docs/en/build-with-claude/structured-outputs |
| Claude audio input | none | verified (absence) | B, https://platform.claude.com/docs/en/api/messages |
| Gemini ids in `gateway.ts` | `gemini-3.5-flash-lite` verified; `gemini-3.5-flash` and `gemini-flash-lite-latest` unverified, left as they were | as stated | research area A2 |

### Methods

| Item | Source |
|---|---|
| Wilson interval at small n (no bootstrap, no normal approximation) | A/B, https://arxiv.org/html/2503.01747v3 ; https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval |
| Exact McNemar with mid-p | https://en.wikipedia.org/wiki/McNemar%27s_test |
| pass^k | https://arxiv.org/html/2406.12045 |
| Run-to-run variation of API models set to be deterministic (up to 15 % accuracy) | https://arxiv.org/html/2408.04667v5 |
| Text-only address gates near 11-20 % error | B, https://arxiv.org/abs/1808.02504 ; https://arxiv.org/html/2411.00023v2 |
| Shortlist gains at many tools (+2.3 to +6.5 F1) and example order | B, https://arxiv.org/html/2606.17519 ; https://arxiv.org/html/2309.10954v2 |
| Context rot (more prompt text hurts) | B, https://trychroma.com/research/context-rot |
| Memory write rules (G3, rules a and c) | B, https://arxiv.org/html/2605.01970v4 |


## v4, 15 Nov 2026 (brief: docs/jarvis/ULTIMATE_JARVIS.md, section 10)

**No npm dependency was added in v4** (`package.json` and `package-lock.json` are unchanged from `main` `38d96d2f`). Each source below is used as a pattern, written in our own code, or is listed as decided against. "Checked" says what this build itself read. Where it says "brief", the line is taken from the brief's own research of 14 Nov and was not re-read here.

| Source | What it is | Licence | Checked | Used how |
|---|---|---|---|---|
| AG-UI (`ag-ui-protocol/ag-ui`) | Event vocabulary for agent UIs | MIT (brief) | brief | Event names only (`RUN_STARTED`, `STEP_STARTED`, `TEXT_MESSAGE_CONTENT`, `STATE_SNAPSHOT`, `RUN_FINISHED`) in `src/lib/thunai/events.ts`; `@ag-ui/core` not added |
| LLMCompiler (arXiv 2312.04511), ReWOO (arXiv 2305.18323) | Plan all tool calls at once, run in parallel, avoid a second model pass | papers; LLMCompiler code MIT (brief) | brief | One planner call emits up to 3 reads, `Promise.allSettled`, code fills the answer ("stop at tools") in `round.ts` |
| OpenAI Agents SDK `StopAtTools` | Finish a run on a tool's result with no further model turn | SDK docs (brief) | brief | Pattern only, as above |
| ReALM (arXiv 2403.20329) | Reference resolution over on-screen entities | paper | brief | `register.ts`: ordered on-screen entities, carried slots and provenance; "the second one" resolved in code |
| Adtributor (Bhagwan et al., NSDI 2014) | Root-cause localisation by explanatory power and surprise | paper | brief | `recipes/adtributor.ts`: share of change and a Jensen-Shannon surprise per segment; thresholds (10 %, 67 %, 3 segments) are this build's choice, not the paper's |
| Noufaily et al. 2013, improved Farrington algorithm | Count-aware outbreak detection with a negative-binomial threshold and down-weighted past outbreaks | paper | brief; the 99.5 % quantile used here is this build's choice, the paper's default unverified | `detect.ts`, written from the idea, no R code copied |
| dbt, semantic layer vs text-to-SQL (Apr 2026) | Evidence that named metrics beat generated queries | blog (brief) | brief | Why `metrics.ts` exists: the planner names metric ids, code computes values |
| MINJA memory poisoning (arXiv 2503.03704) | Injected instructions persisted through an agent's memory | paper | brief | `store.ts`: only the Collector's own Level-B "remember" sentences are written; notes that read as orders are refused |
| τ-bench pass^k | Reliability over k repeated runs | paper (brief) | brief | pass^3 reported in `eval/RESULTS.md` |
| Pipecat `MinWordsInterruptionStrategy`, LiveKit false-interruption resume | Barge-in only on real words; resume after a non-interruption | Pipecat BSD-2 (brief); LiveKit pattern only | brief | Pattern only in `turn.ts`/`backchannel.ts`: duck, stop on 2 non-backchannel words or 600 ms held, resume otherwise. Neither library added |
| Chromium/Edge 141 `echoCancellation: "all"` | Removes all system playout from the mic, including `speechSynthesis` | Chrome 141 beta blog, Edge 141 notes (brief) | brief; whether `getSettings()` reports it: unverified (no browser run) | `ears.ts` asks for it and falls back to `true` |
| Claude API structured outputs | `output_config.format` limits: 16 union-typed, 24 optional parameters, 20 strict tools, shared between format and strict tools; a changed format invalidates the prompt cache | Anthropic docs | **read 15 Nov** by the ladder lane | `claude.ts` rewrites schemas for the wire under the limits |
| Anthropic SDK 1.4.0 types | `max_tokens: 0` warms the cache and is rejected with `output_config.format`; `between_tools` thinking exists | MIT | **read 15 Nov** (installed package types) | `claudeWarm()`; per-model thinking settings |
| Gemini speech generation docs | Streaming TTS over `interactions?alt=sse`, 24 kHz L16 | Google docs | **read 15 Nov** by the mouth lane; the docs disagree on the voice field | Built behind `JARVIS_TTS_STREAM=1`, off by default, unverified |
| Pipecat Smart Turn v3.2, `santhosh-005/smart-turn-tamil` | Turn-completion models | BSD-2 (cards, brief) | not downloaded | **Not shipped**: WASM latency above the 120 ms budget, Worker deferred, Tamil provenance unverified |
| sherpa-onnx keyword spotting, microWakeWord | On-device wake word | Apache-2.0 (brief) | not downloaded | **Not shipped** (optional item) |
| openWakeWord pre-trained models, Porcupine | Wake word | CC BY-NC-SA 4.0 / proprietary | brief | Excluded by licence |
| Horvitz 1999; Amershi et al. 2019; Nielsen response-time limits | Mixed-initiative principles; human-AI guidelines; 0.1/1/10 s | papers and articles | brief | The interjection policy (`watch.ts`), the honest ack and the 10 s Stop card |
| ChatGPT Pulse, Gemini Daily Brief | Finite daily briefs with a source per item | product pages (brief) | brief | The brief always ends ("That's everything for now") |
| OpenSLR SLR65 (Tamil) | Read Tamil speech | CC BY-SA 4.0, test only | not on this machine this session | The STT probe was not run (see BUILD_LOG) |

The earlier sections below are kept as they were.


Checked on 29 Oct 2026 with web searches and the sources' own pages, where they could be reached. **No new npm
dependency was added**: every idea below is used as a pattern, written in our own code. Licences matter only if a
library is added later; where a licence could not be confirmed, it says so.

| Source | What it is | Checked | Used how |
|---|---|---|---|
| [Microsoft JARVIS / HuggingGPT](https://github.com/microsoft/JARVIS) ([paper](https://arxiv.org/pdf/2303.17580v2.pdf)) | An LLM controller: task planning → model selection → execution → response | Repo and paper exist; the four stages are as described | Pattern: Thunai plans (rules, then Nova Lite), chooses console actions, runs them, answers through templates |
| [CopilotKit](https://github.com/CopilotKit/CopilotKit) | React hooks: `useCopilotReadable` (app state to the model), `useCopilotAction` (actions the model may call), `renderAndWaitForResponse` (human approval) | README of `@copilotkit/react-core` 1.71.2 | Pattern only: `ScreenState` is the readable state, the registry in `Thunai.tsx` is the action list, the tray is the approval step. The library was not added (it brings its own runtime and model wiring) |
| [WebMCP](https://w3c-cg.github.io/aikr/webMCP/webmcp-technical-notes.html) | Draft W3C community-group proposal: a page exposes tools (name, description, input schema, execute) to browser agents | Draft status confirmed; the API name differs between drafts (`navigator.modelContext` / `document.modelContext`) | Pattern: Thunai's steps are a typed, closed list. Registering them with WebMCP is left for later because the API is not stable |
| [Playwright MCP snapshots](https://playwright.dev/mcp/snapshots) | Pages read as accessibility snapshots (role, name, ref) instead of screenshots | Official docs | Pattern: `dom.ts` lists controls by role and accessible name for "show numbers" and "click Export" |
| [Apple Voice Control overlays](https://support.apple.com/en-asia/guide/mac-help/mchl26854b08/12.0/mac) | "Show numbers", "show names", "show grid" | Apple support page | Pattern: "show numbers" / "click 12" / "show names" / "click Export" |
| [Stagehand](https://docs.stagehand.dev/) | observe → act → extract browser agent, self-healing cached actions | Docs (v4 drops Playwright) | Later: the "right hand" for other websites |
| [Silero VAD in the browser](https://github.com/ricky0123/vad) (`@ricky0123/vad-web`) | Voice activity detection with ONNX Runtime Web | Project page; licence not checked | Later: barge-in by voice. Now: listening pauses while Thunai speaks; Esc or the orb interrupts |
| [openWakeWord in the browser](https://www.pkgstats.com/pkg:openwakeword-wasm-browser) | On-device wake word (has a built-in "hey jarvis" model) | Package listing; maintenance and licence not checked | Later: a trained "Hey Thunai" model |
| [Chrome on-device speech](https://groups.google.com/a/chromium.org/g/blink-dev/c/VNOok2dbmHM) | `processLocally` speech recognition (Chrome 135+) | Intent-to-ship thread; Tamil support not confirmed | Later: keep audio on the machine where the language is supported. Today the browser's recogniser may use a cloud service |
| [Amazon Nova 2 Sonic languages](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-language-support.html) | Speech-to-speech model | Language list: English (incl. India), Hindi, others; **no Tamil** | Not used: Tamil is required |
| [AI4Bharat IndicConformer (Tamil)](https://huggingface.co/ai4bharat/indicconformer_stt_ta_hybrid_ctc_rnnt_large) | Open Tamil speech recognition (NeMo) | Model card | Later: an on-premises Tamil recogniser |
| [Pipecat / LiveKit](https://livekit.com/blog/best-open-source-voice-and-video-ai-agent-frameworks) | Real-time voice pipelines; interruption vs back-channel handling | Overview article | Later: smarter interruption rules |
| Bhashini, Sarvam | Indian-language speech services | Bhashini needs registration; Sarvam is paid after ₹1,000 credits | Not used (no new paid service) |

## Added for Thunai v2 (the agent and the Stage), 29 Oct 2026

Read on GitHub in the browser on 29 Oct (the first four were checked by the owner's earlier session and are recorded in
`AGENT_BUILD_PROMPT.md`; the last three were opened during this build). Patterns only: no npm dependency was added.

| Source | Pattern | Used how in v2 |
|---|---|---|
| [openai/openai-realtime-agents](https://github.com/openai/openai-realtime-agents) "Chat-Supervisor" | A fast voice layer answers at once; a smarter model runs the tools and writes the real answer | **Two lanes**: `ackFor()` (stagelocal.ts) says "Checking the severe cases." the moment a request leaves; the agent's screen and spoken line follow |
| [CarverXx/jarvis-v3](https://github.com/CarverXx/jarvis-v3) "dual brain" | Heartbeat tone while the agent works; short spoken replies; listen again after answering | `heartbeat()` earcon in Thunai.tsx; 1-3 sentence `say`; hands-free goes back to listening when the Stage has been read |
| [a2ui-project/a2ui](https://github.com/a2ui-project/a2ui) (A2UI v0.9) | The agent sends declarative JSON naming components from a trusted catalog; the client renders its own components | `stage.ts`: a closed catalog (zod) of 15 block kinds; the client renders only those. Thunai goes one step further: the model names a *recipe and slots*, and code fills every block from the data |
| [tambo-ai/tambo](https://github.com/tambo-ai/tambo) | zod-described components; "interactable" components the user refines | The open Stage (`stageContext()`: kinds and ids only) goes back with the next sentence, so "open the third one", "add Perungudi", "only the Adyar ones" act on what is shown. Library not used (Tambo Cloud closes 31 Oct 2026) |
| [vercel/chatbot](https://github.com/vercel/chatbot) (AI SDK template) | Typed tool results render as their own components; long results open in an "artifacts" panel next to the conversation | The Stage is Thunai's artifact panel: a full screen for the answer, the console underneath, the conversation continuing in the Stage's own command bar |
| [ag-ui-protocol/ag-ui](https://github.com/ag-ui-protocol/ag-ui) (CopilotKit's AG-UI) | Event-based agent-to-UI protocol: progress events, two-way state sync, human-in-the-loop | State goes both ways (console state and the open Stage up; console steps and the Stage down); every send stays human-in-the-loop ("confirm N"). Streaming progress events were not added (a single response is under 3 s on Groq) |
| [thesysdev/openui](https://github.com/thesysdev/openui) (OpenUI, formerly Crayon) | A compact UI language the model writes, prompts generated from the allowed component library, "up to 67% fewer tokens than JSON" | The same token argument taken further for the Groq free tier: the model writes about 60 tokens (recipe + slots) instead of a UI tree, and the recipe list in the prompt is generated from the catalog |

Not done in this build: the extra GitHub search for 3–5 more voice-control projects (for example annyang, Leon,
OpenVoiceOS, known from general knowledge only, not checked here). It is listed as a gap in REPORT.md.

## Added for the Jarvis mode build, 4 Nov 2026

Used in this build, each checked where it says so. Figures quoted in earlier drafts of the prompt without a source (for example Whisper WER on IndicVoices) are not repeated here: the review found no source for them.

| Source | What it is | Licence, as checked | Used how |
|---|---|---|---|
| [snakers4/silero-vad](https://github.com/snakers4/silero-vad) v5 ONNX, from `@ricky0123/vad-web@0.0.24` | Voice activity detector | MIT per the repository's LICENSE (the CC BY-NC text is stale badge alt text, per the review) | `public/thunai/silero_vad_v5.onnx`, run by onnxruntime-web in the browser |
| onnxruntime-web, already installed through `@huggingface/transformers` | WebAssembly inference | MIT | Served from `node_modules` by `/thunai-ort/[file]`, so 14 MB of WASM stays out of git |
| `thunai/v3` branch, this repository | `vad.ts`, `turn()`, `gloss.ts`, caf5e7e, a321af5, the advise screen | Own code | Ported by `git show`, not merged |
| [OpenSLR SLR65](https://www.openslr.org/65/) `ta_in_female.zip` | Crowdsourced Tamil speech | CC BY-SA 4.0: test only, not committed or shipped, flagged | `eval/holdout/tamil-asr/`: only hashes and reference text are committed |
| Groq Whisper, `whisper-large-v3` and `-turbo` | Speech to text | Service, existing keys | Parallel forced decodes. Limits from console.groq.com/docs/rate-limits as relayed by the review: 20 RPM, 2K RPD, 7.2K audio-s/hour, 28.8K audio-s/day, 10 s minimum billing |
| Google `gemini-3.5-transcribe`, `gemini-3.5-flash-lite`, `gemini-3.8-*-tts` | Transcription, planner rung, speech | Service, existing key. Free-tier limits are not published outside AI Studio: ledger values are starting points that a 429 overrides | Third racer, ladder rung, second voice rung |
| Iglewicz and Hoaglin (1993), modified z-score | Outlier test, flagged at 3.5 | Method | `stats.ts` |
| Montgomery, *Introduction to Statistical Quality Control*: c-chart | Control limits for counts | Method | `stats.ts` |
| Theil (1950), Sen (1968); Mann (1945), Kendall (1975) | Robust slope and trend test | Method | `stats.ts` |
| Abramowitz and Stegun 26.2.17 | Normal CDF approximation | Method | `stats.ts` |
| [Playwright](https://playwright.dev) 1.63.0 | Browser tests | Apache-2.0 | `tests/e2e`, dev dependency |
| Windows SAPI voices (David, Zira) | Spoken test fixtures | Generated on this PC, synthetic | `tests/e2e/fixtures` |
