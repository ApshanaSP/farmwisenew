# Thunai: references checked

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
