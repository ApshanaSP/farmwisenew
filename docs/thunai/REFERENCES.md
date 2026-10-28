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

Not done in this build: the extra GitHub search for 3–5 more voice-control projects (for example annyang, Leon,
OpenVoiceOS, known from general knowledge only, not checked here). It is listed as a gap in REPORT.md.
