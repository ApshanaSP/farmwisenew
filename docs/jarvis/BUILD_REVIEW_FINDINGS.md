# Review findings on the build prompt (read-only review, 4 Nov 2026)

Written against an earlier draft, so section numbers refer to that draft. OPUS_BUILD_PROMPT_V3.md wins where they differ. A skeptic pass had not finished when this was saved: re-check a finding before relying on it.

## [blocker / confirmed] Phase 2 (40 min) builds and proves streaming Azure TTS, and acknowledgement-first speech is meant to run on it.

- Evidence: AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are required at src/app/api/jarvis/say/route.ts:72. Names matching azure|speech: 0 in chennai-grievance-portal-main/.env, 0 in district_intel/.env, 0 in the shell environment, 0 in .claude/launch.json. Also absent from .env.example and .env.aws.example. The fallback is limited: route.ts:4 says "free tier: 10 a day per model", with 3 models at route.ts:17. Research prompt section 5: "No new paid service and no new accounts." Research section 2: no Tamil voice on the dev machine. Whether the owner plans to add a key before the run is unverifiable.
- Consequence: The phase cannot be exercised live. The agent either ships an unproven streaming path or burns about 30 Gemini clips a day on measurement. After that Jarvis drops to browser speech, which has no Tamil voice on this machine. Top-tier latency and first-class Tamil both fail in the demo.
- Fix: Add a Phase 0 preflight: 'Check that AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are set (names only). If absent, do not create an account. Build the chunker and player against a provider interface, test with a fake streaming server, spend at most 3 Gemini clips on proof, and report Azure as NOT EXERCISED.' Tell the owner before launch that adding the Azure key is the single most valuable manual step. Fix azure(text, lang) in the same phase: it takes no voice parameter (route.ts:34).

## [blocker / wrong] The prompt wants `await stage.commit(op)` returning a digest, with a server-side planner receiving a fresh stageDigest each round and a TS executor.

- Evidence: The loop runs on the server, inside a single JSON POST: route.ts:26-28 (src/app/api/collector/thunai/agent) -> agentServer.ts:68 handleAgent -> agent.ts:363 runThunaiAgent. The client only imports types from agent.ts (Thunai.tsx:23). The Stage is browser React state: Thunai.tsx:223 useState, :235 stageRef. All 39 Step kinds run in the browser (Thunai.tsx:635 run, runStep via hostRef). The server receives only a StageContext of kinds and ids, not the document (agentServer.ts:17-21). There is no custom server, so no WebSocket (package.json:9 `next start`). SSE precedent exists (assistant/chat/route.ts:58-87).
- Consequence: As written this is not feasible: a server loop cannot await a browser call inside one request/response. The build would either fake commit on the server, so the digest never reflects the real screen, or stall partway through a rewrite.
- Fix: State the transport in the prompt. Recommended: the browser drives the rounds. Add POST /api/collector/thunai/agent/round with {turnId, round, text, state, stageDigest}. The server runs the gates, one LLM call and the allow-listed read tools, keeps observations and facts in a turnId-keyed TTL cache, and returns {plan, ops}. The browser applies the ops, computes the digest and posts the next round. The server never trusts client-sent facts, because answerScreen (agent.ts:482) needs server-side results. Zod-validate the digest as untrusted. Raise or split checkRateLimit 30/60 (route.ts:20), because rounds now count separately. Move the 8 s deadline to a turn-level budget. Alternative: SSE plus an ack POST with a pending-promise Map on globalThis. That works only on a single instance (rate-limit.ts:1-3, railway.json sets no replicas), and src/lib has no globalThis singleton precedent. A server-side mirror covers only sortStage/filterStage (stagelocal.ts:105,125), not console steps.

## [blocker / wrong] Rule 1 lists 'Existing keys only: GROQ_API_KEY, Gemini, Azure'. A5 makes Azure Neural TTS 'streaming REST with the existing key' the primary. F1 synthesises 30 Tanglish clips with Azure ta-IN-PallaviNeural.

- Evidence: No AZURE_* variable name appears in .env, .env.example or .env.aws.example (checked names only). Present in .env: GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3, GEMINI_API_KEY, TTS_PROVIDER. say/route.ts:72 enables Azure only when AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are set. Rule 1 also forbids new accounts.
- Consequence: The TTS primary and the Tanglish audio fixtures cannot exist. Every Chrome Tamil reply falls to Gemini, which the prompt itself caps at 3 per minute (say/route.ts:4 comment: 'free tier: 10 a day per model'). With per-sentence chunking that is about one Tamil reply a minute, then silence. Phase 2's cut line and A7's TTS target are unreachable.
- Fix: State that no Azure key exists. Make the ladder Edge natural speechSynthesis (free, Tamil female) → Gemini 3.8 TTS under the ledger → on-screen text. Make Azure optional, used only if the owner adds a key. Drop or replace the Azure-synthesised Tanglish fixtures (e.g. record them with Edge's Pallavi voice and label them synthetic).

## [blocker / wrong] Azure Neural TTS is the primary voice, using 'the existing key' (A5, rule 6: 'Existing keys only: GROQ_API_KEY, Gemini, Azure'). F1 also synthesises 30 Tanglish utterances with Azure ta-IN-PallaviNeural. Phase 2 is built around Azure streaming.

- Evidence: No Azure key of any kind exists. Case-insensitive grep for azure|speech in .env matches only a comment at line 166. .env.example and .env.aws.example have no AZURE name. The shell env has no AZURE name. No other .env exists under E:\farm (only the two *.example files in chennai_news_pipeline and police_dataset_generator). Code does read AZURE_SPEECH_KEY and AZURE_SPEECH_REGION at src/app/api/jarvis/say/route.ts:35,38,72, plus optional JARVIS_AZURE_TA/EN, but they are unset. Azure CLI being on PATH is not a key. Rule 6 forbids new accounts.
- Consequence: The primary TTS path and the Azure Tanglish fixtures cannot run or be tested in the build. The real ladder becomes Gemini TTS, which the prompt itself caps at 3 RPM and calls 'never the conversational primary', then browser speech. The p50 first-audio targets, ducking and envelope guard are all designed around a PCM stream that will rarely exist on this machine. The agent could also ship an untested Azure branch and report it as done.
- Fix: Choose one: (a) the owner creates an Azure F0 Speech resource and adds AZURE_SPEECH_KEY/REGION to .env before the run, and rule 6 is amended; or (b) rewrite A5 for no key: keep the Azure branch as code-only behind the key and mark it Not verified, make Gemini per-sentence plus a phrase cache the server path, make Edge speechSynthesis the Tamil fallback, and remove Azure from the Tanglish fixtures. State plainly in the prompt that no Azure key exists.

## [blocker / wrong] A5/rule 1: Azure Neural TTS is the primary engine, 'streaming REST with the existing key'. F1 also synthesises 30 Tanglish clips with ta-IN-PallaviNeural.

- Evidence: chennai-grievance-portal-main/.env defines no AZURE_SPEECH_KEY or AZURE_SPEECH_REGION (grep -c AZURE .env = 0, and no such name in the shell environment; there is no .env.local). src/app/api/jarvis/say/route.ts reads exactly those two names. The REST docs require 'A Speech resource' key (learn.microsoft.com/.../rest-text-to-speech), so the OPENAI, AWS or other keys present cannot stand in. The quota page shows that a Foundry resource for Speech also works. Creating either breaks the prompt's own 'no new accounts' rule. Not checked: whether a key exists on another machine.
- Consequence: On this laptop the primary TTS never runs. Phase 2 falls to its cut line, per-sentence Gemini clips at a claimed ~3 RPM, which is roughly one short turn a minute. Tamil speech then depends on that path, because the research prompt says no Tamil voice is installed. The synthetic Tanglish smoke tests cannot run either.
- Fix: Before running, either have the owner add AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (region centralindia), or rewrite A5 for no Azure: Gemini Interactions streaming as primary, one TTS request per turn rather than per sentence, a code-templated acknowledgement through a browser voice or locally cached clips, and Gemini for the Tanglish fixtures. Replace 'existing key' with a Phase 0 check that branches on these variables.

## [high / gap] 'Complete this data' is delivered (the brief supplied to me lists no such capability).

- Evidence: Memory jarvis-upgrade-goal.md:8 lists "comparisons, insights, 'complete this data'". Research section 3.3 repeats it. No phase in the summary covers it. grep for 'complete this|complete the data|fill in the missing' under src/lib/thunai and src/components/collector/app/thunai returns 0. AGENT_TOOLS (agent.ts:28-30) has no Data Studio tool; Studio appears only as a page name (agent.ts:85). src/lib/studio/clean.ts:97,112 leaves unreadable values blank and offers no fill. The requirements matrix says 58% of news incidents are unlocated (R6, PARTIAL). The brief asks to "flag unresolved locations for review".
- Consequence: An explicitly quoted owner request is silently dropped. A read-only agent also has no defined way to do it, so it would either be skipped or invent values, breaking 'numbers come from code'.
- Fix: Add to Phase 4 or 5, about 20 min, a `complete` recipe. Input: the open Stage table, a Studio dataset, or unresolved incidents. Fill a cell only from a tool result or deterministic code (ward polygon to zone/taluk, gazetteer, department lookup), each with source and method. Anything unfillable stays blank and is listed as such. Never impute a count. Output is a sandbox draft table saying 'N filled, M left, here is why', with CSV export. Add a Studio dataset read tool. Add 4 EN/TA/Tanglish held-out cases.

## [high / partly] The agent is read-only with sandbox drafts.

- Evidence: Owner, memory line 10: "ask anything or tell Jarvis to do anything, and Jarvis does it". Research section 3.1: "answer, navigate, build a screen, compare, draft". Brief p.21: "automatically create or modify maps, KPI cards, charts, tables and reports". Brief p.22: "Save this workspace as Collector's Daily Briefing". WhatsApp note: "dynamically create, customize, and save dashboards". The real hard rule (research section 5) is narrower: never send, approve or delete. risk.ts already grades filters and navigation A, and workspace/remember B. Pins go to Jarvis's own store (Thunai.tsx:726-731, 885), not the Overview, which is the R9 gap.
- Consequence: Taken literally, an autonomous coder could remove or fail to observe console actions and saves. That undercuts 'acts across the console' and endangers brief capabilities R9, R17 and R20, which voice commands should reach.
- Fix: Replace 'read-only' with: 'Data tools are read-only. Level A console actions (navigate, filter, build screens) run at once with undo, and the loop observes their result. Level B (save workspace, pin, remember) takes one tap or yes. Level C is draft plus confirm N, sandbox only. Never send, approve or delete.' Add 'pin this to the Overview' as a level B action to close R9.

## [high / confirmed] The Jarvis-mode toggle and top-bar mic are Phase 6, sharing 30 min with ring core, Tamil type, a11y and an optional ward map.

- Evidence: Phase 6 starts at minute 245 of 295. Memory line 10 calls it the "Specific feature asked for". The seam is cheap: header at CollectorApp.tsx:782, state already published via jarvis:state (CollectorApp.tsx:277-283, Thunai.tsx:1379), FAB at CollectorApp.tsx:919, listener at Thunai.tsx:1391.
- Consequence: The one named feature sits second to last, under an instruction to cut scope on overrun. It is the most likely to be thin, and it is the first thing a viewer sees.
- Fix: Move it to a 15-min Phase 1a straight after baseline. Specify: toggle persisted per browser; OFF means mic stream and 'Hi Jarvis' listener closed, FAB and typing remain; ON means a mic button in `.top` beside LangSwitch, a visible recording indicator, and a blocked state from jv.mic. Define how it interacts with earMode 'asleep'. Keep Ctrl+K. State the exception to 'do not redesign the console': only this edit in CollectorApp.tsx.

## [high / partly] UI redesign is covered by a ring core plus Tamil type and a11y within Phase 6.

- Evidence: Research section 3.4: "A redesigned Jarvis UI at Iron Man level. Distinct, cinematic, but calm". Memory line 8 asks the same. Thunai v3's UI-only phase (21:20-21:45 per V3_PROGRESS.md) still drew 20 reviewer findings. Research section 7.5 requires an fps criterion; V3_REPORT 'Not verified' item 9 says 60 fps was never profiled. The summary names nothing for Panel.tsx, panel.css or the Stage's frame.
- Consequence: A new orb inside the old panel reads as a reskin, not the requested redesign. With roughly 10 min per item, a11y and Tamil legibility are what get cut.
- Fix: Fund UI at 45 min on top of the 15-min Phase 1a. Scope: ring core, panel, captions, a state system (idle, listening, hearing, thinking, speaking, interrupted, error), and the Stage header. Require a UI reviewer subagent with fixes, and a measured fps figure under reduced-motion on and off. Take the time from Phase 1 by porting v3 code (see below), and drop the optional ward map first.

## [high / partly] Branch from main and do not merge thunai/v3.

- Evidence: Not merging is defensible: main has since changed heavily (baf956d touched 74 files; dcbb40d replaced the Rain Rehearsal page). But research section 2 says "Decide, with evidence, whether to merge, cherry-pick or abandon". `git branch --contains caf5e7e` lists only thunai/v3. Missing on main: vad.ts, stt.ts, gloss.ts, newsbrief.ts, src/lib/ai/schemaprompt.test.ts, and gateway lastResort (0 hits). V3_BUILD_PROMPT's whole voice phase was budgeted at 35 min and was built in under an hour alongside the other phases.
- Consequence: Up to 65 min goes on rebuilding tested work, and fixes for already-found bugs are lost. The research prompt's required decision is unmet.
- Fix: Add a port table: 'Do not merge. Read with git show thunai/v3:<path> and port: vad.ts and vad.test.ts including a321af5, the Silero file and ORT route, the Gemini schema fallback (caf5e7e), lastResort, gloss.ts, the code privacy refusal, the advise screen (e719624). Do not port the rehearse screen without checking dcbb40d. Record why for each.' Cut Phase 1 to about 40 min.

## [high / partly] Phase 3 hedging and fallback give graceful degradation.

- Evidence: The hedge exists at agentServer.ts:83 (Gemini after 3500 ms). V3_REPORT: "the Gemini fallback never works for Thunai", 400 "invalid argument", 23 times, because the strict schema is too complex. The fix is only on thunai/v3. It also records an answering Gemini call of 19 s against an 8 s budget. I could not confirm the 400 still occurs on main, since calling providers is forbidden here, but the fixing code is absent and strict schemas are still sent (gateway.ts:398).
- Consequence: The hedge can burn time and Gemini quota and return nothing, while the ledger reports a second provider that does not actually answer. The report would call this resilience.
- Fix: Add to Phase 3: 'Port caf5e7e first. Prove with one live Gemini call through the agent schema (owner's OK for using the Gemini key on Thunai was recorded on 29 Oct; re-confirm in the run notes). If it cannot answer within budget, disable the hedge and say so.'

## [high / wrong] The plan can baseline in Phase 0, add a multi-round agent in Phase 4, and measure in Phase 7 on one day's quota.

- Evidence: V3_REPORT: "the three Groq keys are in one Groq organisation"; qwen cap "200,000 tokens/day"; a full run is "about 8 minutes, ~250k tokens"; final held-out "10 of 20 got no model at all"; a follow-up re-run got 31 of 40 and 19 of 20 with no answer. AGENT_PROGRESS decision 1: "a 3-round agent costs 10,000+ tokens per sentence". Arithmetic: 60 cases at 10k is 600k, equal to the entire DAILY_TOKENS (gateway.ts:185). .env has GROQ_API_KEY, _2 and _3. The ledger arrives at minute 130, after the baseline and voice work have spent quota.
- Consequence: This repeats v3: the final score measures quota, not Jarvis, and the owner has no honest number. The observation loop makes it worse than v3, and may leave no allowance for the demo, because caps reset 24 h after use.
- Fix: Put the ledger's accounting first, in Phase 0, keyed by organisation and model, not by key. Add a token budget: baseline 20 held-out cases only; tune with recorded model replies; reserve allowance for one final held-out run, executed before any other Phase 7 live call. Score 'no model answered' separately and report 'not measured' if above 20%. Add an acceptance limit on tokens per sentence, with a second round only when an observation requires it. Tell the owner not to demo within 24 h of the build.

## [high / partly] Top-tier latency is delivered by VAD, streaming TTS, acknowledgement-first speech, hedging and caches.

- Evidence: The summary has no STT work. hear/route.ts:51 defaults to whisper-large-v3 and :30 skips the place-name prompt for turbo. Research section 1 notes a serial second Whisper call. V3 measured turbo plus prompt at p50 219 vs 252 ms, with prompt halving English WER; auto-detect on Tanglish was about 97% WER; round trip p50 about 460 ms. First spoken words: 2.0-2.6 s with allowance, 5.7-17.3 s when capped, 18 s on a cold dev compile. Research A4 and A8 and section 7.5 require a streaming STT verdict, a latency budget and mic to first-audio p50/p90. Whether the full prompt states these targets is unverifiable.
- Consequence: An acknowledgement masks the wait instead of removing it. The real answer stays at 2 s or more, and numbers taken on a dev server would be meaningless.
- Fix: Add to Phase 1: remove the serial retry; choose the STT model and fixed-language policy by v3's evidence; record a streaming STT verdict. Publish a budget table per stage with targets: ack p50 at most 0.6 s, data answer first audio p50 at most 2 s and p90 at most 4 s, as starting targets the agent may revise with evidence. Add a plan cache so repeats skip the model. Measure on the production server (launch config jarvis-prod-3010), never next dev.

## [high / gap] Phases 1 and 2 stand alone (Silero, barge-in, acknowledgement-first).

- Evidence: V3 lessons not visible in the summary: Silero-only barge-in p50 about 250 ms, energy-gate pause plus Silero confirm p50 about 90 ms; a noise burst must resume, not cancel. Reviewer: an old answer could be spoken after 'stop', hence a turn generation; late transcripts swallowed the next sentence; 'confirm' must never come from captions, as they can catch Jarvis's own voice; "the answer always waited 2.5 s for the acknowledgement". a321af5: "'On it.' then nothing". On main, Thunai.tsx:1224 onBargeIn only stops voice and sets phase, and no turn generation or AbortController matched in Thunai.tsx.
- Consequence: A Silero-only design misses a sub-150 ms target. Ack-first speech can reintroduce the dropped-words bug, and stale answers can be spoken after an interruption. All were already found once.
- Fix: Add these as named acceptance tests in Phases 1 and 2: two-stage pause/confirm/resume; turn generation plus AbortController cancelling the in-flight agent call; late-transcript drop; confirm only from Whisper, typed or tapped; ack never delays or loses the answer.

## [high / wrong] A Stage reducer exists for commit to wrap.

- Evidence: There is no reducer (no useReducer in thunai/*.tsx). Ops are spread across applyLocal (Thunai.tsx:861-928), applyStageOp (:930-944) and the pure helpers in stagelocal.ts. They return void and speak as a side effect through out(). They read render-closure state (stageBack :875, pins :887). `open`, `clear` and `everywhere` do network calls through directStage. View mode, filter and narration position sit in separate state and refs (setStageViews :897, setStageFilter :905, narrIndex). Two op vocabularies exist: STAGE_OPS 15 (agent.ts:32) and LocalCmd 18 (stagelocal.ts:9-20). Console steps have no settle signal: `loading` is local to CollectorApp.tsx:242, and my grep did not find it in the Console interface (:98). That missing signal looks like the reason for sleep(1600).
- Consequence: A digest computed right after commit will be stale for view, period and page steps, and an async loop hitting stale closures will read an old tray or stageBack. Removing sleep(1600) without a settle signal makes the rain mission draft from the old list (Thunai.tsx:1151).
- Fix: Add a task: create a pure `stageReducer(doc, op)` in src/lib/thunai/stagelocal.ts, split from the effects (speech, network). Have commit go through refs only. Expose a `settled()` promise or a loading flag on Console from CollectorApp.tsx. Extend the existing stageContext (stage.ts:116) and the agentPrompt Stage line (agent.ts:150) into the digest instead of adding a parallel one.

## [high / wrong] AbortSignal threads from voice.ts through agent.ts to gateway to tools.

- Evidence: It crosses a network boundary, and almost none of it exists today. voice.ts has no signal. It is only the Web Speech fallback, imported solely by mouth.ts:9. Barge-in lives in ears.ts and Thunai.tsx:1224, which only stops voice and sets abortMission. post() passes no signal (Thunai.tsx:103-104). req.signal reaches only hands.map (route.ts:26, data.ts:57). agentServer.ts:79 makes its own unlinked controllers. AgentDeps.llm has no signal parameter (agent.ts:315). within() does not cancel (agent.ts:355). hands.tool drops it and runTool has no signal (data.ts:57, tools.ts:1210). There is no turn guard: Thunai.tsx:1041-1053 still shows the late result after a barge-in. Working pattern: chat/route.ts:55 AbortSignal.any([gate.signal, req.signal]), limits.ts:65 supersede, AssistantDialog.tsx:178 client controller. Next 14.2.35 wires req.signal from the node response (next-server.js:1084,1228). Live disconnect propagation through Railway's proxy: unverifiable.
- Consequence: Following the prompt literally means editing the wrong file. A signal cannot be passed as an object across the fetch. Barge-in would stop speech while the old turn still replaces the Stage and spends Groq tokens.
- Fix: Rewrite as: barge-in in Thunai.tsx calls AbortController.abort() on the turn's fetch and bumps a turnId; every await in handle checks turnId before showing anything. On the server, AbortSignal.any([req.signal, supersede]) flows into handleAgent, into a new signal argument on llm, and into a/b2 and generateJson (already supported at gateway.ts:218,397). Tools: check the signal between calls only; mysql2 queries in runTool are not cancelled. Do not abort memoised shared promises (data.ts:19, tools.ts `once`).

## [high / gap] The prompt never mentions quick.ts (fast lane added in baf956d).

- Evidence: handleAgent runs offTopic, then quickScreen, before the agent (agentServer.ts:42-67). quickScreen receives no stage or turns (:49). Run in a scratchpad bundle with a small fixture World: 'prepare for heavy rain' -> readings rain, which pre-empts rule 1a's mission (agent.ts:111). 'compare the rain in Adyar and Perungudi' -> readings with zone 13 only. 'what should I do about flooding in Adyar' -> a cases list. 'and severe?' -> cases, all zones, fresh:true.
- Consequence: The new planner is never consulted for these sentences, so the agentic behaviour will appear not to work and eval results will mostly measure rules. Removing quick.ts instead brings back the 2-20 s model rounds its header comment (quick.ts:2-3) says it was added to avoid.
- Fix: Add a section naming quick.ts. Keep it as the latency lane but make it bail to the planner on multi-intent, advice and mission sentences, and when a Stage or recent turn is open and the sentence is elliptical. Move RAIN below COMPARE. Add these sentences to quick.test.ts. Report quick-lane and planner scores separately.

## [high / partly] Section B5 wants a new frame.ts for follow-up context.

- Evidence: No frame.ts exists, but follow-up handling already exists in several layers: localStageCommand before everything (Thunai.tsx:1017-1019); understand() with lastFilter (understand.ts:427), which is nulled for the server by screenOf (brain.ts); lastPlace (Thunai.tsx:252,507-508); turns capped at 4 (Thunai.tsx:249, brain.ts PlanBody); Stage slots and prompt rules (agent.ts:105-107,130-131); dropCopiedFilters (agent.ts:260); quick.ts:111 bail words. Fixture run: 'and in Adyar?', 'why?', 'now monthly' -> null (reach the agent); 'what about flooding?', 'what about the news', 'and the rain there', 'and severe?' -> a fresh screen with context lost.
- Consequence: frame.ts placed inside the agent never runs for the sentences quick.ts takes, and it becomes another source of truth that can disagree with Stage slots and lastPlace.
- Fix: Say that frame.ts resolves before offTopic and quickScreen in handleAgent, takes b.stage, turns and lastPlace as input, and replaces the prompt-only rules at agent.ts:105-107 rather than sitting beside them. Send lastFilter too or remove it from the frame's inputs.

## [high / gap] Plan-as-JSON over multiple rounds with a fresh digest each round, on the existing Groq setup.

- Evidence: AGENT_REPORT.md:25,54: about 3,500 tokens per sentence with one model call. Static system text is 8,442 chars before the codes list (agent.ts:82-134), resent each round. gateway.ts:126 limits one model to 8,000 TPM. gateway.ts:127-128: qwen allows 1,000 output tokens a minute, maxOut 900. agentServer.ts:75,77: maxOutputTokens 1100 and qwen first. .env holds GROQ_API_KEY, _2 and _3 (names only). Provider-side token counting for the JSON schema itself: unverifiable, no provider calls made.
- Consequence: Arithmetic from those figures: three rounds cost at least 10,500 tokens, over one model's minute allowance in a single turn, and qwen's output cap can be used up by about one round at 900 tokens. The FABLE prompt (docs/jarvis/FABLE_RESEARCH_PROMPT.md:47) already records 429s dominating the v3 evals. The multi-round design risks repeating that.
- Fix: Require a slim prompt for rounds after the first (delta observations and digest only, or a split static prefix), a token budget per turn measured and reported, and a rule that an eval run with 429s is reported as a capacity failure and is not scored as accuracy. Do not assume qwen-first holds for multi-round turns; re-pick the order by measurement.

## [high / partly] Section 4 says ears.ts, mouth.ts and voice.ts are at src/lib/thunai/ (e.g. 'src/lib/thunai/ears.ts — rebuild on vad.ts'). It also names src/app/api/jarvis/{hear,say}/route.ts and Thunai.tsx, Stage.tsx and Panel.tsx under src/components/collector/app/thunai/.

- Evidence: Glob: ears.ts, mouth.ts, voice.ts, wake.ts and wake.test.ts exist ONLY at chennai-grievance-portal-main/src/components/collector/app/thunai/; `ls src/lib/thunai` has no ears, mouth, voice, vad or stt file. Thunai.tsx:31-32 imports them relatively ('./mouth', './ears'); mouth.ts:9 imports './voice'; ears.ts:13-14 imports './wake' and '../assistant/speech'. The two API routes and Thunai.tsx, Stage.tsx and Panel.tsx are where the prompt says.
- Consequence: An agent following section 4 creates fresh src/lib/thunai/{ears,mouth,voice}.ts beside the live files. Either it builds an unwired parallel stack, or it has to move client-only modules (window, navigator, AudioContext) into the lib folder that server code imports. Either way time is lost and the old files stay live.
- Fix: Section 4 'Change:' should read src/components/collector/app/thunai/ears.ts, mouth.ts and voice.ts (and keep wake.ts there). Put the new pure, testable modules (vad.ts, bargein.ts, chunker.ts) in src/lib/thunai/. The routes and Thunai.tsx, Stage.tsx and Panel.tsx paths are already right.

## [high / wrong] voice.ts is the turn state machine ('idle→listening→hearing→thinking→speaking→(interrupted), owns the AbortController per turn'), and 'one AbortSignal' is threaded 'from voice.ts through agent.ts → gateway → tools'.

- Evidence: voice.ts:1-8 and 96-133 is the browser speechSynthesis wrapper: voice scoring, gender, chunks and speakLines. mouth.ts:9 consumes it as `import * as browser from './voice'` (bestVoice, voiceGender, hasVoice, speakText, stopVoice), and Thunai.tsx:1632-1636 uses it for the voice picker. Turn state lives in Thunai.tsx: Phase type with 9 states at :79, the mute effect at :1358-1372, onBargeIn at :1224. agent.ts runs on the SERVER: Thunai.tsx:739 calls post('/api/collector/thunai/agent'); post() at Thunai.tsx:102 passes no signal; agentServer.ts:7 imports runThunaiAgent; agent/route.ts:26 already passes req.signal into serverHands; gateway.ts:218/397 already accepts abortSignal.
- Consequence: Rewriting voice.ts as a state machine breaks mouth.ts's speechSynthesis fallback and the voice picker. One shared AbortSignal cannot cross the HTTP boundary to agent.ts. The Ears contract consumed at Thunai.tsx:1214-1372 is far larger than 'consume voice.ts state', so Phase 1 and Phase 6 budgets are underestimated.
- Fix: Leave voice.ts as the browser-voice engine. Put the turn state machine in a new pure module (e.g. src/lib/thunai/turn.ts, which can port v3's turn() and its tests). Abort the turn with an AbortController on the client fetch to /api/collector/thunai/agent and /api/jarvis/say, then rely on req.signal → serverHands → gateway abortSignal on the server. Name Thunai.tsx:1214-1372 as the code to rewire.

## [high / wrong] A1 says Silero/vad-web is 'already proven on the project's own thunai/v3 branch (~90 ms barge-in)'. A3 designs barge-in as Silero only: 3 consecutive frames at ≥0.85 (≈96 ms), target p50 ≤150 ms.

- Evidence: git show thunai/v3:docs/thunai/V3_REPORT.md line 72: 'Barge-in: Thunai's voice paused ... 72-115 ms, p50 ≈ 90 ms (7 clips) with the energy-gate pause; Silero-only was 139-327 ms (p50 ≈ 250 ms, 10 clips)'. V3_PROGRESS.md:68 says the energy-gate pause was 'added after measuring Silero-only at p50 ≈ 250 ms'. v3 ears.ts uses onQuickOnset from EnergyVad to pause, and Silero (echoPos 0.7, 2 frames, vad.ts PROB_DEFAULTS) confirms. v3 RESULTS.md: Silero's start lands about 60-100 ms late.
- Consequence: The design, at an even stricter 0.85 threshold, reproduces the configuration the project already measured at about 250 ms p50. The ≤150 ms p50 and ≤250 ms p90 CI gate will fail or be met only by the flawed metric (next finding). Phase 1's 65 minutes go on rediscovering this.
- Fix: Use v3's two-stage scheme: an energy-gate onset (20 ms frames, raised echo margin) PAUSES or ducks playback at once, Silero confirms speech held for ≥200 ms, then the turn is cancelled; a short noise resumes. Credit the 90 ms to the energy-gate pause, not to Silero.

## [high / wrong] A3 says to 'Instrument it: performance.mark("jarvis:bargein:onset") and ("jarvis:bargein:silenced"); the difference is the barge-in latency you report'. The acceptance table defines barge-in latency as 'speech onset → playback silenced'.

- Evidence: These two definitions differ. The onset mark is placed by code when the detector fires (after its 96 ms or more of frames), not when the person starts speaking. v3 measured 'from the start of the interrupting speech' against fixtures with known speech start times (V3_REPORT.md:72).
- Consequence: The reported number leaves out detector latency, so a Silero design that really takes about 250 ms could report about 5-20 ms and pass the CI gate. This breaks the prompt's own honest-measurement rule.
- Fix: Measure from the fixture's known speech start: the playback timeline plus the fake-capture offset, or an injected marker in the WAV. Record the detector-fire mark as a separate component.

## [high / wrong] A3 says 'mouth.ts knows the exact PCM it is playing' and to 'play TTS through the AudioContext (which you do anyway)'. Phase 1 builds bargein.ts with the envelope guard, GainNode ducking, a loopback chirp self-test and bargein.spec playing a 6 s TTS clip.

- Evidence: mouth.ts:61 turns the response into a blob URL (URL.createObjectURL(await r.blob())); mouth.ts:76-85 plays it with `new Audio(url)` (an HTMLAudioElement). mouth.ts never decodes PCM or touches an AudioContext. When the browser has a natural female voice, clip() returns null (mouth.ts:50) and speechSynthesis speaks (mouth.ts:88-94), so no PCM exists at all. The AudioContexts that do exist are for capture (ears.ts:109), the heartbeat (Thunai.tsx:112-117) and earcons (Thunai.tsx:135-138), all separate.
- Consequence: The ordering is inverted: Phase 1 (65 min) cannot build the envelope guard, ducking, chirp self-test or bargein.spec until Phase 2 (40 min) has rewritten mouth.ts onto Web Audio. On the speechSynthesis path the guard and ducking cannot exist; only cancel works.
- Fix: Phase 1: VAD plus stop and abort only, using stopVoice. Move the envelope guard, ducking, self-test and bargein.spec to after the Phase 2 mouth rewrite. State that the speechSynthesis path has no PCM, analyser or gain, so barge-in there is cancel only and the guard is disabled.

## [high / wrong] A3 says barge-in must AbortController.abort() the agent run and discard queued TTS, AND 'false-interruption rollback: if no transcript arrives within 1.5 s of a barge-in, resume playback from the interrupted chunk'.

- Evidence: These two rules contradict each other. After the abort and discard there is nothing left to resume. Also, a transcript only exists after end of utterance (300 ms or more) plus an STT round trip (v3 measured browser→Groq→back p50 ≈ 460 ms, 354-775 ms; V3_REPORT.md:74). So any interruption longer than about 0.7 s gets no transcript within 1.5 s, and Jarvis would resume talking over the Collector. v3 solved this with pause → confirm (bargeMs 200) → cancel, and resume on a short vadEnd (thunai/v3 vad.ts turn(); vad.test.ts:98, :113).
- Consequence: As written, Jarvis either cannot roll back or talks over a Collector who is still speaking.
- Fix: Key rollback to the VAD speech-end event with a short duration (under about 200-300 ms), not to a transcript timer. On onset, pause or duck and keep the queue and agent alive; abort and discard only once speech is confirmed.

## [high / partly] A5: /say buffers whole WAVs; drop gemini-2.5-flash-preview-tts; 'Wire TTS_PROVIDER for real ... default auto'; .env.example additions include TTS_PROVIDER.

- Evidence: Buffering is confirmed: say/route.ts:42 (Azure arrayBuffer), :60-66 (Gemini whole clip, wrapped by wav()), :92 (one response); mouth.ts:61 r.blob(). The model list is confirmed at say/route.ts:17 (the 3.8-flash-lite-tts, 3.8-flash-tts and 2.5-flash-preview-tts defaults, overridable by JARVIS_TTS_MODELS). TTS_PROVIDER is read nowhere under src (Grep). It is documented at .env.example:163-164 and .env.aws.example:35 with the value 'browser', and the repo's .env SETS it to browser (grep -c '^TTS_PROVIDER=browser' .env → 1).
- Consequence: Wiring TTS_PROVIDER 'for real' honours the existing .env value and makes the demo browser-only. In Chrome, with no Tamil voice, mouth.ts:91 and Thunai.tsx:42 then show Tamil replies silently. The '.env.example addition' is redundant because the variable already exists.
- Fix: Say that TTS_PROVIDER already exists with the value 'browser' in .env and both examples, and that the build must treat an existing 'browser' as legacy (map it to auto) or change the documented default. Do not add it again.

## [high / wrong] The prompt's TTS ladder does not mention Edge natural voices, and says 'Windows speechSynthesis: only a legacy male Tamil voice Valluvar ... no Natural Tamil voice' (the brief describes them as a current fallback).

- Evidence: The code makes them the FIRST choice, not a fallback. mouth.ts:31-38 natural() and mouth.ts:50 `if (natural(lang)) return Promise.resolve(null)` mean the browser voice speaks before any server call whenever Edge's online female voice exists (comment mouth.ts:32-33: 'Edge has them for Tamil (Pallavi) and Indian English (Neerja)'). voice.ts:46-48 and :32 rank 'Online (Natural)' voices. The settings tell users to 'open in Edge' (Thunai.tsx:1565-1567), and the menu calls the AI voice 'when the browser has none' (Thunai.tsx:1571). Commit baf956d's message says 'Edge natural voices as fallback', which does not match the code. Rule 1 says the demo runs in Chrome.
- Consequence: A mouth.ts rewrite to Web Audio PCM per the spec drops the natural() shortcut. That removes the only free, quota-free female Tamil voice the project has, at the same time that Azure is missing (previous finding). Tamil voice quality and availability fall, which breaks the 'Tamil must not degrade' rule.
- Fix: Keep Edge natural speechSynthesis as a ladder rung, and name the demo browser (Edge, or Chrome with Gemini). Note that this rung has no PCM, AnalyserNode or GainNode, so the UI uses a synthetic level and barge-in is cancel only.

## [high / partly] /hear does 'a serial re-send between languages', relies on Whisper's language ID, has a hallucination regex and uses Groq Whisper. A4 replaces it with two parallel forced decodes on whisper-large-v3-turbo and says to 'keep the hallucination regex'.

- Evidence: Groq Whisper by raw fetch: hear/route.ts:32-34. Real utterances default to whisper-large-v3 (:51, JARVIS_STT_MODEL override); only wake probes use turbo. The place-name PROMPT is skipped whenever model === 'whisper-large-v3-turbo' (:30). The re-send is ONE serial call pinned to the SITE language, only when the language ID returns something outside {en, ta}, and never for wake (:55-57). A Tamil clip misidentified as English is not retried. INVENTED regex at :18; noise gate at :61-64. The header comment ('large-v3-turbo, about 0.4 s', :3) is stale. v3 measurements (thunai/v3 RESULTS.md STT table): English turbo 9.8% WER without the prompt vs 5.3% with it; large-v3 13.2% → 2.3% with the prompt; exact place names go from 44-50% to 67-94%. Both main (:48-49) and v3 (stt.ts:13-17) chose large-v3 for Tamil.
- Consequence: Moving to turbo through the existing whisper() helper silently drops the place-name prompt, the biggest measured accuracy lever. It also moves Tamil to the model both earlier efforts rejected for it.
- Fix: In A4, either keep large-v3 for the language=ta decode (as in v3's stt.ts), or delete the turbo prompt skip at hear/route.ts:30 for non-wake calls. Always send PROMPT on utterance decodes. Describe today's re-send accurately.

## [high / gap] Three-state top-bar mic: 'click = push-to-talk toggle (click to start, VAD ends it; click again to cancel)'. voice.ts states are idle/listening/hearing/thinking/speaking/interrupted. ears.ts 'emits speechStart/partialReady/speechEnd'. (Does this conflict with baf956d's wake word and always-listening?)

- Evidence: baf956d shipped: the wake word through webkitSpeechRecognition (wake.ts:46-101) PLUS a second wake path that posts ambient sentences to Whisper turbo (ears.ts:247-276); one-breath 'Hi Jarvis, <command>' handling (ears.ts:9, :180-184); a multi-turn conversation with a 60 s idle timeout (Thunai.tsx:1236-1247, :1356-1372; Panel.tsx:40 'no need to say my name'); BYE (Thunai.tsx:1323); the mic opened at page load by default (Thunai.tsx:1290-1303, 'jarvis-wake' defaults to on); the 'Wake on Hi Jarvis' menu (Thunai.tsx:1559); and FAB and jarvis:state status (CollectorApp.tsx:276-282, :917-924). The prompt mentions 'wake' once (Windows Voice Access precedent) and never mentions wake.ts, 'Hi Jarvis', conversation mode, jarvis:toggle or jarvis:state. Research question 4b (on-device wake word: openWakeWord/Porcupine) has no decision in the prompt. Existing hotkeys Alt+T and Alt+Space (Thunai.tsx:1431-1436) are not mentioned against the new Ctrl+Space. jarvis:toggle already accepts {talk:true} (Thunai.tsx:1389), though no caller sends it. The ears.ts:3 comment 'Nothing is sent anywhere' while asleep is false given :262.
- Consequence: Following the file guidance (rebuild ears.ts with only speech events, a single-utterance push-to-talk) silently deletes the shipped wake word and hands-free conversation, and leaves wake.ts orphaned. Alternatively the agent has to invent where 'sleeping' fits. Keeping wake with Silero means running inference on the main thread all day plus Whisper probes.
- Fix: Decide explicitly. For example: off = mic closed; sleeping = wake word active ('Hi Jarvis', keep wake.ts, wake.test.ts and the Whisper name check, rate-limited in the ledger); listening = conversation mode that continues until 60 s of quiet or 'bye'; a click on the mic enters conversation; Esc or a click ends it. Keep the Ears onWake/wake/sleep/mute contract. Drive TopBarMic through jarvis:toggle {talk:true} and jarvis:state. Keep Alt+Space, or justify the change. Fix the ears.ts:3 comment.

## [high / wrong] The demo browser is Chrome (rule 7). A5 says Windows speechSynthesis has only a legacy male Tamil voice, Valluvar.

- Evidence: start-fast.bat comment reads 'Jarvis speaks Tamil with Microsoft Edge's own voice (Pallavi), so the console opens in Edge' and the launch line is 'start "" msedge'. mouth.ts:33 says 'Edge has them for Tamil (Pallavi) and Indian English (Neerja); Chrome has Google's English ones but no Tamil'. voice.ts:46 says the same. Both Edge and Chrome are installed at their default paths.
- Consequence: With no Azure key, Edge's natural Pallavi voice is the only free neural Tamil voice without a tight rate limit, and the prompt rules it out by assumption. speechSynthesis also bypasses AudioContext, so the GainNode ducking, the AnalyserNode UI and the playback-envelope echo guard do not exist on that path. Those features need a defined behaviour there, or barge-in breaks on the most likely Tamil voice. Testing in Chromium only will miss it.
- Fix: Change rule 7 to 'Edge (primary for Tamil voice) and Chrome'. Add browser speechSynthesis in Edge as an explicit tier. For that tier specify: cancel() on barge-in, no envelope guard, and a state-driven UI animation instead of the analyser.

## [high / partly] TTS_PROVIDER gets wired as azure | gemini | kokoro | browser | auto, with auto as the default.

- Evidence: The name already exists and is set to browser in .env, at .env.example:164 and at .env.aws.example:35. The .env value was read as "browser". It is wired to nothing today: say/route.ts:72-88 goes straight to Azure then Gemini.
- Consequence: Once it is wired, the existing .env value forces browser speech on this laptop. Every /api/jarvis/say path stops being used in dev and in the demo, Gemini TTS included, and the latency and streaming measurements silently measure the wrong thing. .env is gitignored, so the code change alone will not fix it.
- Fix: Add to Phase 2: change the example files to auto, and either tell the agent to run with TTS_PROVIDER=auto in the shell for its own runs or have the owner edit .env. Log the effective provider at startup.

## [high / partly] C1: use node:sqlite for the ledger (or better-sqlite3), and 'pin Node >= 22.13 if the project runs on it'.

- Evidence: Node is v24.21.0. package.json engines is 22.x. There is no .nvmrc or .node-version. npm warns EBADENGINE on every install (observed). The probe require('node:sqlite') worked on 24.21. src/lib/aws/store.ts:27-30 explains the trap: 'Next.js 14's bundler does not know the node:sqlite scheme (and rewrites createRequire)', and store.ts loads it through process.getBuiltinModule("node:sqlite"), with only a type import at line 24. Gateway.ts is imported by 33 files, none in src/components or middleware, and no route uses the edge runtime, so a node-only gateway is safe if loaded this way.
- Consequence: A plain import { DatabaseSync } from 'node:sqlite' in gateway.ts or a ledger module passes vitest and fails next build under webpack. That burns phase time in Phase 3. better-sqlite3 adds a native build for no benefit. Pinning Node would also conflict with the machine, which runs 24 while engines says 22.x.
- Fix: Replace C1's text with: 'Reuse the store.ts pattern, process.getBuiltinModule("node:sqlite") with a type-only import. Do not add better-sqlite3 and do not change engines. Open the DB lazily, never at module import, because next build workers import route modules. Take the path from an env var (THUNAI_DIR or similar) so parallel vitest processes do not share data/.'

## [high / confirmed] Do not break the 150 passing tests (npx vitest run src/lib/thunai src/components/collector/app/thunai).

- Evidence: Observed: 9 files passed, 150 tests passed, 11.28 s, no failures, on vitest 3.2.7. The project's full suite per 'npx vitest list' is 117 files and 1,575 tests. I did not run the full suite, because src/lib/aws/parity.test.ts writes files without a visible temp dir. Its pass state is unverified. tsc --noEmit --incremental false exited 0 with no output in 52 s, so the type-check baseline is clean.
- Consequence: The 150-test gate does not cover the blast radius. The prompt rewrites src/lib/ai/gateway.ts, which 33 source files import, including /api/i18n, Ask District IQ and Studio. Tests that import it, such as src/lib/ai/retryafter.test.ts, rerank, conflicts, nearby, storyai and studio, sit outside the subset. A gateway regression would pass every gate the prompt sets, yet break features outside Jarvis.
- Fix: Keep the fast subset per phase. Add a full 'npx vitest run' at Phase 0 as a baseline, listing any failures already present, and again at the end of Phase 3 and in Phase 7. The acceptance row should read: full suite no worse than baseline.

## [high / partly] git checkout -b jarvis/agentic-voice from main, with small commits.

- Evidence: The tree is dirty: 4 tracked files modified and 2 untracked paths (docs/jarvis/, docs/thunai/V3_BUILD_PROMPT.md). data/embeddings .bin goes from 33.9 MB to 25.1 MB and is tracked even though .gitignore:33 ignores the folder. data/i18n/en.json and ta.json are rewritten at runtime by src/app/api/i18n/route.ts (FILE and save()), which any running app can trigger through the gateway. checkout -b keeps these in the working tree and does not commit them. Branch name jarvis/agentic-voice is unused. main matches origin/main (0 ahead, 0 behind). Thunai/v3 exists locally only.
- Consequence: The branch command works, but any git add -A or commit -a sweeps a 25 MB binary, runtime translation cache lines and the owner's untracked prompts into the first jarvis commit. Starting the dev server for Playwright or evals keeps dirtying i18n files, so they recur at every commit. The final 'clean tree' cannot be reached by normal means.
- Fix: Add to rule 8: 'Stage explicit paths only; never git add -A or commit -a. data/embeddings/* and data/i18n/* are pre-existing and must stay out of commits; report them.' Better still, the owner commits or stashes the 4 files before starting. An autonomous agent should not decide this.

## [high / wrong] Paths docs/thunai/BUILD_LOG.md, docs/thunai/HANDOVER.md, docs/thunai/REFERENCES.md, eval/... and src/... all share one root ('repository chennai-grievance-portal-main').

- Evidence: Git root is E:/farm. docs/thunai/REFERENCES.md is tracked at the git root (E:\farm\docs\thunai), not in the app. BUILD_LOG.md and HANDOVER.md exist nowhere. The app has its own chennai-grievance-portal-main/docs/ (AI_KEY_ROTATION.md, SECURITY_AUDIT.md). src/ exists only in the app folder. eval/ exists in the app with golden.json and promptfooconfig.yaml, and eval/store/ is ignored. There is no tests/ folder in the app: tests are src/**/*.test.ts, .golden.ts, .live.ts beside the source.
- Consequence: Working from the app folder as instructed, the agent will create a second chennai-grievance-portal-main/docs/thunai/ and will not find REFERENCES.md to update. eval/ resolves differently depending on cwd. Commands such as 'git add docs/thunai/...' behave differently from each directory.
- Fix: Add a Paths section: 'git root E:\farm; app root E:\farm\chennai-grievance-portal-main. src/, public/, eval/, tests/e2e/ are app-relative. Build log, handover and references go in E:\farm\docs\thunai\. Run npm and npx from the app root.'

## [high / wrong] Phase 0 (25 min) and Phase 7 (20 min) run Tamil ASR on 200 clips, clean and noisy, on both transcribers.

- Evidence: By the prompt's own numbers: Gemini lite 10 RPM and 500 RPD; 200 clean + 200 noisy = 400 calls first-run and 400 final = 800, above 500 per day, before any TTS or hedge use. Groq Whisper at 20 RPM with 2 forced decodes per clip is 800 requests, at least 40 minutes per pass, against a 20-minute Phase 7. A4 removes the serial re-send but the eval multiplies it. Environment: ffmpeg and sox are not on PATH. Default python is 3.14.7 (3.12 also present). MUSAN and OpenSLR downloads have to fit Phase 0; their sizes are unverified. Free disk: E: 215 GB, C: 34 GB. Hardware: Ryzen 5 5600H, 15.3 GB RAM, RTX 3050 Ti Laptop GPU.
- Consequence: Phase 7 is mandatory and uncuttable, but its rerun cannot finish in budget and hits the daily Gemini cap, so 'final' numbers will be missing or partial. Clips also would have no place to live: eval/holdout/tamil-asr is not gitignored, and committing CC BY-SA audio bloats a public repo.
- Fix: Reduce to 60 clean + 40 noisy for both runs, or run the final pass overnight as a separate script and report it as such. Give Phase 7 a budget that matches, or make the ASR rerun a background job started by end of Phase 5. Commit only manifest.json with hashes, and gitignore the WAVs. Do mixing and resampling in Node or Python without ffmpeg. Pin python 3.12 for jiwer and IndicXlit.

## [high / wrong] Phases 0 and 7 run the Tamil ASR evaluation on 200 clean + 200 noisy utterances, with Gemini lite taking '~20 min for 200 files' and Whisper at 20 RPM.

- Evidence: Limits: whisper-large-v3-turbo 20 RPM, 2K RPD, 7.2K ASH, 28.8K ASD, per organisation (console.groq.com/docs/rate-limits). Whisper bills a 10 s minimum per request (console.groq.com/docs/speech-to-text). Arithmetic: the final design sends 2 forced decodes per file, so 800 requests = 40 min at 20 RPM against a 20-min Phase 7. Gemini on the 'same subset' is 400 files = 40 min at the prompt's 10 RPM, not 20. Two runs is 800 requests, above the prompt's 500 RPD. Whisper first run + final run is about 1,200 of 2K RPD before any live use or partials. The prompt omits the 2K RPD and 28.8K ASD figures. Unverifiable: whether ASH counts billed or actual seconds.
- Consequence: Phase 7 is mandatory and cannot finish in budget. The Gemini arm hits its daily cap mid-run, and live turns then compete with the evaluation for quota. This repeats the v3 failure, where 429s destroyed the evals.
- Fix: Cut to 100 utterances (50 clean, 50 noisy) per run, or start the final run in the background at the start of Phase 6. Add 'Whisper 2K RPD, 28.8K audio-s/day, 10 s minimum billing'. State the request budget per run in the ledger, and reserve 20 % of RPD for live turns.

## [high / wrong] A1: Silero is 'already proven on the project's own thunai/v3 branch (~90 ms barge-in)'. A3 fires on 3 Silero frames >= 0.85 (~96 ms) with a target of <= 150 ms.

- Evidence: thunai/v3:docs/thunai/V3_REPORT.md:72 says '72-115 ms, p50 ≈ 90 ms (7 clips) with the energy-gate pause; Silero-only was 139-327 ms (p50 ≈ 250 ms, 10 clips)'. Commit 868e76b reads 'energy-gate pause with Silero confirmation'. V3 did not use the vad-web runtime: ears.ts:44 calls ort.InferenceSession.create directly, with the model file taken from vad-web 0.0.24 (V3_PROGRESS.md:58). External check: Pipecat's default start is 0.2 s (vad_analyzer.py) and LiveKit's min_duration default is 0.5 s (docs.livekit.io/reference/agents/turn-handling-options), so 96 ms is 2-5 times more aggressive than both cited frameworks.
- Consequence: The 90 ms evidence belongs to the design the prompt tells the builder to delete. A Silero-only path measured about 250 ms here, so the 150 ms target and the p90 gate may fail or get tuned against. Also, if the 'onset' mark is set when the VAD fires, the reported metric leaves out detection delay and flatters the result.
- Fix: Correct A1 to say the 90 ms came from the energy gate. Make A3 two-stage: an instant duck from a level gate, then confirmation or cancel from Silero. Define onset as the known speech start in the fixture, not the VAD event. Keep an energy fallback when ORT fails to load.

## [high / wrong] A4 picks Gemini lite through generateContent for Tamil STT. A6 says 'Gemini native-audio/Live shows no free tier on the pricing page'.

- Evidence: aistudio.google.com/docs/models lists gemini-3.5-transcribe (Stable) and gemini-3.5-transcribe-live. aistudio.google.com/docs/pricing shows both as Free Tier 'Free of charge', and also Gemini 3.8 Live and 3.1 Flash Live Preview. Search results point to an ai.google.dev model page for 'gemini-3.5-transcribe' (audio up to 1 hour, word annotations), and third-party reports of the changelog say GA on 26 Aug 2026 with 85+ locales. Unverified: Tamil. I found no Google page naming it, only third-party Bolna listing 'ta'. Free-tier RPM is also unknown. The prompt names neither model.
- Consequence: The prompt calls Tamil accuracy 'the real problem' but never tests a dedicated free transcription model, or a possible streaming path that would change the partial-transcript design. Its A6 statement is stale.
- Fix: Add a Phase 0 probe of 10 minutes or less: run gemini-3.5-transcribe with the lite models on the same Tamil clips, choose by CER, and record its limits from 429s and headers. Correct the A6 Live free-tier sentence. Treat transcribe-live as a future option unless the probe is clearly better.

## [high / partly] F1: add noise from MUSAN (CC-BY-4.0) as 'office noise at 10 dB SNR', inside the 25-min Phase 0.

- Evidence: openslr.org/17: licence CC BY 4.0 is confirmed, but the only download is musan.tar.gz at 11G. The page describes 'music, speech, and noise' and I could not confirm any office category.
- Consequence: An 11 GB fetch sits in a mandatory 25-min phase, on a laptop, for a small amount of noise. 'Office noise' is also an unsupported label for the measurement.
- Fix: Drop the MUSAN download. Generate babble by mixing 6-8 other held-out clips plus pink noise in code, and label it as such. Otherwise make MUSAN optional, only if already on disk, and call it 'MUSAN noise' rather than office noise.

## [medium / unverifiable] The research prompt's required output is present.

- Evidence: I saw only the phase summary. docs/jarvis/ holds only FABLE_RESEARCH_PROMPT.md, and grep for 'jarvis/agentic-voice' in E:\farm *.md finds nothing. Not visible in the summary against research section 4 and section 7: streaming STT (A4); wake word verdict (4b; wake.ts is still cloud en-IN); Tanglish strategy (A5); speech-to-speech verdict (A7); the 10 unreachable tools (B11); speculative and parallel calls (B12); Tamil and Tanglish WER and fps criteria (7.5); per-decision licence and evidence (7.2); the two named live TTS bugs; 'say what you would not do'.
- Consequence: Items silently absent look decided when they are not, and the coder may spend time rediscovering them. Tamil WER will have no method because no Tamil voice exists on the machine.
- Fix: Check the full text against this list. Add one decision line for each of A1 to F26 (chosen, rejected, why, licence, evidence, or 'unverified'). For Tamil WER, name a method using a permissively licensed public Tamil speech corpus, or state 'NOT MEASURED' as an expected outcome, not a failure. Also fix mouth.ts serverOk never resetting, which is asserted by the research prompt and which I did not re-check.

## [medium / partly] Scope and priorities match how the work will be judged.

- Evidence: Scope is right: memory says "Jarvis alone" and research section 5 says no console redesign. Brief p.22: "The core application will be considered complete if all required functions work through text-based natural-language interaction." Voice is optional ("Optional voice commands, if implemented"). Phases 1 and 2 take 105 of 295 min (36%) on that optional, mic-unverifiable part, while the visible agent and analysis work gets 80 min and the UI 30. Brief p.23: "The final demonstration should show the core capabilities".
- Consequence: Hard-to-see audio work takes the largest share, while what a judge sees (agent acts, screens, comparison, mic, UI) comes late and gets cut first. Typed input must benefit equally, or the improvements do not count toward the required path.
- Fix: Keep voice as the differentiator but rebalance after porting v3: voice about 60, agent about 65, analysis and complete-data about 45, UI and mic about 60. State that every agent feature must work typed as well as spoken. Add the brief's own items to the held-out set: "Prepare today's district briefing, show the three most serious incidents and read the action summary", plus the p.22 comparable requests (e.g. incidents in more than one newspaper but missing from the departmental application; the news_gaps tool is allowlisted).

## [medium / partly] Stats, template speech and new blocks are complete in Phase 5 (25 min), and comparisons and insights are covered.

- Evidence: Phase 5 covers insights only partly. Research section 3 also lists comparisons, 'what's changed' and 'what should I do'. The advise screen for that last one is only on thunai/v3 (e719624). AGENT_REPORT requires that every screen in both languages passes the spoken-figure test, and research section 1 describes a closed zod catalog, so two new block kinds touch the catalog, screens.ts, Stage.tsx and Tamil templates. Research question 19 asks for anomaly, trend and seasonality methods; the Compare block exists but its 6-metric limit is not addressed in the summary.
- Consequence: Only control charts ship, while the conversational analysis the owner asked for stays as it is. 25 min is likely to compromise the Tamil templates or the figure tests.
- Fix: Add per-class acceptance: compare, what changed, why, what first, outlier, complete-data, in EN, TA and Tanglish. Port advise. Extend Compare's metrics. Keep the figure-gate test mandatory for new blocks. Raise the phase to about 45 min including complete-data.

## [medium / gap] New agent, stats and speech preserve traceability required by the brief.

- Evidence: Brief p.21: "Preserve source links, timestamps, evidence, confidence and an audit history for every important finding". Brief p.22: "Show every source and application record used to create this briefing." Required list on p.23: "Source traceability, audit history". R10 is PARTIAL in REQUIREMENTS_MATRIX.md. The summary does not mention audit.ts or per-block sources.
- Consequence: A multi-step agent that shows computed findings with no method or source weakens a mandatory capability during the demo, and observe loops can skip the audit trail.
- Fix: Add a rule: 'Every agent round, tool call and console step goes to the existing audit trail (text only). Every new block and spoken finding carries source, timestamp and method. "Where does this number come from?" must work on any screen.'

## [medium / partly] Top-bar mic and agent behaviour can be proved in Phase 7.

- Evidence: Harness.tsx:3 is "A stand-in console". It renders its own tabs (line 82) and <Thunai host={host}/> (line 110), and imports CollectorApp only as a type (line 9), so the `.top` header does not exist there. "Real console" is the first or a leading not-verified item in REPORT.md:74, AGENT_REPORT.md:88 and V3_REPORT item 4. Prior prompts forbade typing real passwords.
- Consequence: The named feature ships unproven in the only place it exists, for the fourth build running.
- Fix: Extract a JarvisMic component used by both CollectorApp and the harness, and add a harness top bar for browser proof. Add type-check plus an owner sign-in checklist as a deliverable. Mark the real console as NOT VERIFIED unless the owner signs in.

## [medium / partly] 65 min of VAD and barge-in work yields trustworthy voice behaviour.

- Evidence: Research section 2: "A real microphone has never been used." V3_REPORT item 1: echo cancellation through real speakers not tested; "if Thunai stops itself, raise echoMargin". Item 3: speech out "not heard". The agent cannot test this unattended.
- Consequence: Figures from synthetic audio can be reported as barge-in performance, and self-interruption may first show up in front of the audience.
- Fix: Deliver a 5-minute owner real-room checklist, one tuning constants block, an on-screen metrics overlay for dev, and a push-to-talk fallback switch. Label all numbers 'injected audio'.

## [medium / partly] The general-question router fits the rules.

- Evidence: Research section 5: "Numbers come from code, never from a model." The figure gate at agent.ts:488 (per research prompt) would reject figures in general answers. V3_BUILD_PROMPT section 4: general knowledge "allowed only when clearly labelled as such". V3 put privacy refusal in code before any model.
- Consequence: Either general answers get dropped by the gate or the rule gets weakened to let them through. Off-topic chatter also spends the scarce daily allowance.
- Fix: Specify: privacy check in code first; the general lane is labelled 'general knowledge, not district data', uses no figures unless from a tool, never mixes into a district screen, and uses the smallest adequate model with its own token cap.

## [medium / unverifiable] The brief's deliverables and deadlines are respected.

- Evidence: No calendar deadline in the brief PDF, the Task 6 PDF, the WhatsApp note, or a grep of docs/ top-level and audits docs; only "approximately two to three weeks" and a "final demonstration". District_IQ_Demo_8min.md and District_IQ_Demo_Script.md have 0 mentions of Jarvis, Thunai or voice. Every earlier build shipped a demo script (REPORT.md, AGENT_REPORT.md, V3_REPORT). Phase 7 as summarised is 'measure and report'.
- Consequence: The build may finish with no way to show it, and a demo date near the build would collide with the 24-hour quota reset.
- Fix: Add a deliverable docs/jarvis/DEMO.md: a 2-minute real-console script including the brief's voice example, plus a typed path as fallback. The owner should supply the date, since it decides how quota is spent.

## [medium / partly] 295 minutes with a 20-minute closing phase is a realistic plan.

- Evidence: V3_PROGRESS timestamps: started 21:03, report commit 21:59 (2c4864f), about 56 min against a 140-min budget. What followed until 22:40 was quota and fallback trouble. So minutes do not bind; quota and memory do. AGENT_REPORT: the 7.5 GB machine "ran out of memory for a parallel run". V3: suite needs --maxWorkers=2 (79 s), build needs NODE_OPTIONS=--max-old-space-size=8192 and its own NEXT_DIST_DIR; owner's server on port 3000 must stay up. A live set run alone takes about 8 min, and V3's verification plus reviews took about 24 min on smaller scope.
- Consequence: Time-based gates give false comfort. Phase 7 is too small for final eval, latency runs, suite, build, reviews and the report, and parallel subagents can run the machine out of memory and fail the build.
- Fix: Treat phase minutes as ceilings, with gates based on evidence. Raise Phase 7 to about 35 min by dropping the ward map. Restate machine rules: never run the dev server, full suite and build concurrently; own port and dist dir; do not stop port 3000. Require a progress file updated at each phase, as v3 did.

## [medium / gap] Executor can combine a screen with console steps.

- Evidence: Thunai.tsx:1050-1054: when ag.stage exists the client shows it and returns without running ag.steps. The comment says the dashboard's filters stay as they were. agent.ts:472-475 still computes syncSteps and kept model steps and returns them, and its comment says the console agrees with the screen.
- Consequence: Any plan of the form 'open this page, then build this screen' silently loses its steps on the client. Server tests can pass while the browser does nothing.
- Fix: Make the prompt decide: either the executor applies ordered ops including steps, with this branch removed, or agent.ts stops returning steps with a screen. Add a browser-level check, since vitest is node-only.

## [medium / partly] 31 tools, 10 unreachable; names incidents, search_records, incident_detail, incident_story, category_summary, resolve_place, map_geo, nearby, briefing, performance, trend, compare.

- Evidence: Counted from tools.ts TOOLS (:379 on): 31 tools. AGENT_TOOLS has 21 (agent.ts:28-30). The 10 unreachable: incidents, search_records, incident_detail, incident_story, search, briefing, category_summary, source_health, resolve_place, map_geo. nearby, performance, trend and compare are RECIPES (stage.ts:66), not tools; recipe `brief` differs from tool `briefing`. category_summary and map_geo are llm:false in tools.ts, and map_geo returns polygons 'not for answering'. Call has only period, zone, dept, cat, taluk, place, metric, text (agent.ts:54-56). callArgs' default branch sends only {scope} (agent.ts:286), while incident_story requires text (tools.ts:691).
- Consequence: Adding a name to AGENT_TOOLS alone gives a ToolError at run time (tools.ts:1215-1219). Listing recipes as tools sends the build looking for tools that do not exist.
- Fix: Replace the list with the exact 10 names. Exclude map_geo and category_summary or justify lifting llm:false. Require Call and callArgs changes for each newly reachable tool. Treat nearby, performance, trend and compare as recipes.

## [medium / partly] Every tool is read-only.

- Evidence: tools.ts has no direct writes (grep), and overview() is documented read-only (intel.ts:751); the only write there is routeNewsComplaints (:592-636), called from its job route and not from tools. Grep of the import closure found no writes in the modules checked; I did not read sources.ts's mandi readers line by line. Exceptions: incident_story calls warmUp (tools.ts:694) -> buildIndex -> save writes data/embeddings (embed.ts:148-152,232,258), and those files show as modified in git status. The helper near tools.ts:299 appears to reach a model through pickIncident (rerank.ts:35). hands.map appends the Collector's text to data/aws-cache/map-questions.jsonl (map/ask.ts:510-512). The model can also choose stateful actions: remember, remind, forget, saveWorkspace, send (plan.ts:19-21).
- Consequence: The 21 reachable tools are read-only as far as checked, but exposing incident_story adds disk writes, cold-start latency and a hidden model call inside a voice turn's budget. It may also dirty the tree during the build.
- Fix: Change the wording to 'the 21 AGENT_TOOLS read the store; incident_story, search and search_records have embedding or rerank side effects'. Keep the actions distinct from the tools in the risk rules.

## [medium / wrong] agent.ts has two hardcoded missions with sleep(1600).

- Evidence: The missions are in Thunai.tsx:1105-1161, in the browser; agent.ts only names them in the prompt and steps. sleep(1600) is at :1142 and sleep(1200) at :1147, both in the rain mission only. The brief mission polls at 200 ms (:1111) and waits 3500 ms in non-voice mode (:1121).
- Consequence: A build told to fix this in agent.ts finds nothing there, and the missions can only be replaced after the browser executor exists.
- Fix: Correct the file reference. Schedule mission replacement after the executor and settle signal.

## [medium / partly] Errors are swallowed.

- Evidence: Tool errors ARE fed to the model: agent.ts:400-402 pushes `[error] name: msg` into observations. Swallowed: client step failures, which only reach console.error and a chip (Thunai.tsx:657-660); callAgent network failure -> null (:747); model failure after results -> log and break (agent.ts:382-385); screen build failure -> note 'deadline' (:468-470).
- Consequence: Re-implementing tool-error feedback wastes time, while the real gap (client failures never reach the planner) needs the new transport.
- Fix: Narrow the task to returning client step and commit failures in the next round's digest, plus making model and screen failures visible.

## [medium / partly] gateway.ts has a fixed 3500 ms hedge into Gemini Flash and 3 retries.

- Evidence: The hedge is in agentServer.ts:79-88, not gateway.ts. It also fires immediately if main fails (:84) and is skipped with no GEMINI_API_KEY (:81). It asks role 'fast', whose first default is gemini-3.5-flash-lite (gateway.ts:73), so Flash-Lite by default; AI_GEMINI_MODEL_FAST is not among the .env names. Retries: tryModel has at most 3 attempts (:388), but 429/503 return on the first failure (:441-451), timeouts return (:412-417), and pool models get no repeat on non-status errors (:464). Only other retryable errors loop (:452-459). Confirmed: in-process Maps spent :186, cooling :359, strikes :365, usage :375. Model ids in code: gateway.ts:119-120, agentServer.ts:77. For Jarvis turns `first` puts qwen, then gpt-oss-20b, ahead of the role order. Live availability of the ids: unverifiable. AI_FORCE_PROVIDER is present in .env and precedes `prefer` (gateway.ts:162); its value was not read.
- Consequence: Hedge edits aimed at gateway.ts miss. Latency modelling that assumes 3 retries on 429 is wrong.
- Fix: Point hedge work at agentServer.ts. Say 'max 3 attempts, none on 429/503'. Have the build log which provider actually answers rather than assume from defaults.

## [medium / partly] The keyword off-topic wall is a known item to widen.

- Evidence: Confirmed at quick.ts:85-104 and agentServer.ts:42-48. Fixture run: offTopic=true for 'give me a summary' (GENERAL matches 'give me a', and 'summary' is not in DISTRICT), so it is refused even though quick.ts:82 lists summary under ATTENTION. Also true for 'how does this number come' and 'who is the commissioner'. The fixture World was small; a real place name could change a result.
- Consequence: Everyday Collector requests and meta questions are refused with no model call, before any new planner runs.
- Fix: Tell the build that offTopic lives in quick.ts with tests in quick.test.ts, runs first, and needs these sentences as regression cases.

## [medium / gap] A rewrite of the loop leaves tests intact (150 passing must stay green).

- Evidence: agent.test.ts has 42 it() blocks driving runThunaiAgent(input, deps), with `llm` injected (agent.test.ts:28,299). agent.live.ts:103 has the same signature. agentServer.test.ts has 1 and stage.test.ts 27, using buildScreen and fakeHands.
- Consequence: Splitting the loop across browser and server breaks these unless a driver is kept.
- Fix: Keep runThunaiAgent as an in-process driver with injected llm, hands and a fake `commit`, and have the browser driver and server round call the same planRound function.

## [medium / gap] A3 fires barge-in only 'While mode === "speaking"'.

- Evidence: Today the barge-in branch runs whenever the ears are muted and awake (ears.ts:205), and Thunai.tsx:1361-1362 mutes during thinking, acting, speaking and narrating. So speaking over Jarvis while it THINKS also triggers capture. mute(true) calls reset() (ears.ts:154), which drops any sentence in progress. onBargeIn also sets abortMission (Thunai.tsx:1224), and speech heard while busy is queued (Thunai.tsx:1340-1352). v3's turn() captures a new sentence while thinking (vad.test.ts:132 'a new sentence while Thunai is still thinking is captured').
- Consequence: Narrowing barge-in to 'speaking' loses the Collector's correction ('no, Anna Nagar') said during the 1-5 s thinking window. That is the redirect case A3(c) is meant to serve.
- Fix: Detect barge-in in thinking, acting and speaking. In thinking, cancel the in-flight agent fetch and capture the new sentence; in speaking, use the pause, confirm and cancel sequence.

## [medium / gap] The prompt is silent on the two live TTS bugs: azure() ignores the chosen voice, and mouth.ts never resets serverOk.

- Evidence: say/route.ts:34-35 azure(text, lang) takes no voice argument, yet the cache key at :79 includes the voice. mouth.ts:15-17 and :63 `if (++fails >= 2) serverOk = false` is never reset. hasVoice (mouth.ts:25) then returns false for Tamil without a browser voice, and Thunai.tsx:42 shows Tamil silently until a reload. The prompt contains neither 'serverOk' nor any Azure voice parameter.
- Consequence: With Gemini as the only server TTS on a free tier, two 429s or 503s permanently silence Tamil for the session, during exactly the demo the prompt targets.
- Fix: Add to Phase 2: a per-request failure backoff that recovers (e.g. retry the server after 60 s) and a voice parameter for every provider.

## [medium / gap] The prompt does not mention src/lib/jarvis/voices.ts.

- Evidence: src/lib/jarvis/voices.ts:2 JARVIS_VOICES = 6 Gemini prebuilt female voice names (Despina default). It is used by the say route's zod enum (say/route.ts:13, :18), mouth.ts:8, :19, :22 (setJarvisVoice), and Thunai.tsx:35, :191, :1294 (localStorage 'jarvis-voice'), :1402-1403 and :1571 (the 'AI voice' menu). A second, separate browser-voice setting also exists (voiceName, 'thunai-voice', Thunai.tsx:1635). src/lib/jarvis/ is outside rule 1's scope list.
- Consequence: If Azure becomes primary, the voice picker silently does nothing (azure() ignores the voice). Adding a provider-specific voice requires editing a file the scope rule forbids. Two voice settings with unclear precedence remain.
- Fix: Add src/lib/jarvis/voices.ts to scope. Define a per-provider voice map (Gemini names, Azure ids, browser names) and one user-facing voice setting.

## [medium / gap] A5: 'pipe the chunked response straight through the route as a ReadableStream; never buffer a WAV'.

- Evidence: Today's route caches 300 clips (say/route.ts:20, :80, :91) and sets Cache-Control max-age=86400. The client caches 80 blob URLs and prefetches common lines (mouth.ts:18, :49-74; Thunai.tsx:1273 prefetch of the wake line). The client contract is Content-Type audio/wav (say/route.ts:92), and Gemini's sample rate is parsed from its mimeType (:66).
- Consequence: A pure pass-through loses the caches that make repeated lines free. That matters most under the Gemini quota. Raw PCM also needs its sample rate sent out of band.
- Fix: Tee the stream into the server cache. Serve cache hits whole. Send the rate and format in a response header.

## [medium / gap] A4's Whisper volume: two forced decodes per utterance plus a 1.2 s partial, against Groq Whisper limits of 20 RPM and 7,200 audio-seconds/hour.

- Evidence: That is 3 Whisper calls per turn, so at most about 6 turns a minute. Today's wake probes also post ambient sentences of up to 5.5 s at up to 15 a minute (ears.ts:253-262) to the same route and the same single GROQ_API_KEY (hear/route.ts:33). The .env has GROQ_API_KEY_2 and _3, which hear does not use; gateway.ts:104-112 pools _2.._5. The prompt adds a new 'GROQ_API_KEYS' name that matches neither scheme.
- Consequence: If wake is kept, idle probes plus conversation exceed 20 RPM, causing 429s on STT. A new env name splits the key configuration.
- Fix: Budget Whisper calls per minute across wake, partial and final in the ledger. Disable partials and the second decode under pressure. Reuse the GROQ_API_KEY_N convention, not GROQ_API_KEYS.

## [medium / gap] A4 arbitration: 'use Gemini's result if it arrives within 1500 ms of the first result'. A7 targets a rules-layer p50 ≤1.8 s from mic to first audio.

- Evidence: Measured Whisper round trip is p50 ≈ 460 ms (V3_REPORT.md:74). Waiting up to 1.5 s more puts up to about 2 s of STT on the critical path. A7's STT row assumes 600-900 ms. The F2 e2e test mocks STT, so it would not expose this.
- Consequence: The latency targets and the arbitration rule contradict each other, and the mocked test hides it.
- Fix: Plan on the first acceptable transcript. Use Gemini only to correct the displayed line, or re-plan only if the intent or slots differ. Or measure Gemini lite latency in Phase 0 and set the wait from that.

## [medium / partly] A1 and A2: redemptionMs 300, minSpeechMs 150, preSpeechPadMs 200; end of utterance ≈300 ms ('Silero redemption 8 frames' in A7).

- Evidence: thunai/v3 RESULTS.md recommendation 3: 'Use about 250 ms of pre-roll and a 600-800 ms hangover with either detector'. v3 shipped hangoverMs 500 and minSpeechMs 220 (vad.ts PROB_DEFAULTS). 8 frames × 32 ms = 256 ms, not 300. Today's minimum utterance is 9 frames ≈ 384 ms (ears.ts:239).
- Consequence: The prompt's 300 ms is below the project's own measured recommendation and is untested for Tamil pauses or 'Hi Jarvis … <pause> … command'. It risks sentences split mid-thought, each sent as a separate turn.
- Fix: Start at 500-600 ms and tune it on the held-out audio. Make A1 and A7 agree.

## [medium / partly] The @ricky0123/vad-web 0.0.31 API (ISC, onnxruntime-web ^1.17; legacy/v5/v6 models; default 'legacy'; redemptionMs, preSpeechPadMs, minSpeechMs, onFrameProcessed); copy assets into public/vad/; a hard 14 s max 'kept from today'; delete the ScriptProcessorNode.

- Evidence: Checked against the copy unpacked in this session's scratchpad (npm/vad/package): package.json is 0.0.31, ISC, dependency onnxruntime-web ^1.17.0. dist has silero_vad_legacy, v5 and v6 .onnx; real-time-vad.d.ts has DEFAULT_MODEL 'legacy', options getStream, audioContext, processorType 'AudioWorklet'|'ScriptProcessor'|'auto', and onFrameProcessed(probs, frame). real-time-vad.js:101 and :131-140 fall back to a ScriptProcessor. FrameProcessorOptions has NO maximum-duration option, and the pre-speech buffer is private, so the 14 s cap and the 1.2 s partial upload need caller code. In the repo, onnxruntime-web is 1.31.0-dev, transitive only; its dist has ort-wasm-simd-threaded.wasm 14.3 MB, the .jsep.wasm 28.4 MB and the .asyncify.wasm 26.9 MB; public/vad is not gitignored (git check-ignore). v3 deliberately served ORT from node_modules through src/app/thunai-ort/[file]/route.ts and a webpackIgnore import to keep 14 MB out of git. The CSP allows wasm-unsafe-eval and worker-src 'self' blob: (next.config.js:11, :17); Permissions-Policy allows microphone=(self) (:31); the middleware matcher does not cover /vad (middleware.ts:101-110). Whether Next 14.2's webpack bundles 'onnxruntime-web/wasm' cleanly: unverifiable (no install allowed).
- Consequence: A literal 'copy from dist' commits tens of MB of WASM. The 14 s cap and the partials are not features of the library. If bundling fails, next build breaks in Phase 1 with no stated fallback.
- Fix: Copy only the worklet bundle, the chosen .onnx file and the one ort-wasm-simd-threaded.{mjs,wasm} pair, and gitignore public/vad (or reuse v3's thunai-ort route). Set ort numThreads=1. Implement the 14 s cap and the partial ring in ears.ts. Make v3's loadSilero (direct onnxruntime-web, webpackIgnore) the stated fallback if bundling breaks the build.

## [medium / partly] thunai/v3: 'Cherry-pick only the Silero integration idea (not the files — @ricky0123/vad-web supersedes a hand-rolled vad.ts) and read its stt.ts/gloss.ts for any Tamil normalisation table worth copying into xlit.ts'.

- Evidence: thunai/v3 src/lib/thunai/vad.ts (239 lines) is NOT a hand-rolled neural VAD. It holds pure, browser-free logic: EnergyVad (20 ms dB gate, 10th-percentile floor), ProbVad (thresholds applied to Silero probabilities), and turn(), a barge-in state machine with pause/resume/cancel, STOP_ONLY and GOODBYE (Tamil included), and the 'awaiting' fix for the 'On it.' bug (commit a321af5). vad.test.ts (174 lines) has about 22 cases, including barge-in, cough resume and late-transcript drop. Silero inference is in v3 ears.ts loadSilero(), using onnxruntime-web directly with public/thunai/silero_vad_v5.onnx taken from the vad-web 0.0.24 tarball; no npm dependency was added (git diff main thunai/v3 -- package.json is empty). stt.ts (93 lines) holds a Groq key pool (GROQ_API_KEY.._5), turbo for en and large-v3 for ta, STT_PROMPT, hint, audioKind, and cleanTranscript (prompt-echo filter); it has no Tamil normalisation table. gloss.ts (103 lines) is a word gloss of about 60 entries from Tanglish and Tamil to English, injected into the agent prompt (v3 agent.ts:17, :173), not a transliterator. v3 also predates baf956d (merge-base c9212fa) and has no wake.ts, wake.test.ts, mouth.ts or Panel.tsx. On main, the Tamil and Tanglish alias forms live in lexicon.ts and normalise.ts (Grep for adyar/அடையாறு), not in understand.ts or screens.ts as the prompt says.
- Consequence: vad-web replaces only loadSilero and ProbVad. Barring v3's files throws away the tested turn() and EnergyVad quick-onset that produced the measured 90 ms, plus the race fixes. Copying v3's ears.ts would delete the wake word. The xlit work looks for alias tables in the wrong files.
- Fix: Let the build port v3 vad.ts's EnergyVad and turn() with their tests (the probability source swapped to vad-web's onFrameProcessed), stt.ts's key-pool, per-language model and cleanTranscript logic, and gloss.ts's LEX as seed rows for the alias tables. Never take v3's ears.ts or Thunai.tsx. Point xlit at lexicon.ts and normalise.ts.

## [medium / gap] Phase 0: 'Run the existing /api/jarvis/hear on the Tamil ASR subset'.

- Evidence: hear/route.ts:40-41 requires collectorSession(), a signed-in Collector (lib/collector/guard.ts), and :43 limits it to 60 a minute. Main has no dev STT route: src/app/api/dev/thunai/ has only agent, draft, plan and tool. v3 added /api/dev/thunai/stt for exactly this.
- Consequence: An unattended agent gets 401s, or has to sign in with credentials, which it must not handle. The first-run STT baseline is lost.
- Fix: Have the eval script call Groq directly with the same form fields as hear/route.ts, or add a NODE_ENV-guarded /api/dev/thunai/stt that wraps the same function.

## [medium / partly] Telemetry goes to .jarvis/telemetry.ndjson. The ledger location is not specified.

- Evidence: git check-ignore finds no rule for .jarvis in either .gitignore. data/thunai/ is already ignored and already holds Thunai state (src/lib/thunai/store.ts:11, app .gitignore). .gitignore also covers data/aws-cache/.
- Consequence: Telemetry becomes an untracked file that any git add -A commits to a repository whose own example file calls it public (.env.aws.example comment: 'this repository is public'). It holds provider and model request logs. A ledger placed elsewhere has the same problem.
- Fix: Use data/thunai/telemetry.ndjson and data/thunai/ledger.sqlite, honouring THUNAI_DIR. If .jarvis/ stays, add it to the .gitignore in Phase 0.

## [medium / unverifiable] Run vitest, tsc and next build at the end of every phase (8 times, inside the 295 minutes).

- Evidence: Measured: vitest subset 11 s; tsc 52 s (non-incremental). No next build duration is recorded anywhere I searched: docs/audits/FINAL_PASS_PROGRESS.md:11 and FINAL_TEST/PROGRESS.md:26 give pass or error counts only. The sole hint is the start-fast.bat echo, 'Building District IQ once (a few minutes)'. The .next, .next-thunai and .next-test folders have no BUILD_ID and their traces have no next-build span, so they appear to be dev output. Their webpack-compilation spans run up to 31.9 s for one compile (.next-test server). Also, FINAL_PASS_PROGRESS.md:16 records that 'next build adds its dist folder to tsconfig.json include', which dirties the tree for a dist name not already listed.
- Consequence: If a build takes about 3 to 5 minutes, which is an assumption and not a measurement, 8 builds cost 24 to 40 minutes of a budget with only 5 minutes of slack. That would be 12 to 20 percent of a 25-minute Phase 5 or 20-minute Phase 7 per run. A build into the default .next also clobbers a running next dev on the same folder, and the Playwright and eval runs need a server.
- Fix: Phase 0 must time next build and record it. Use NEXT_DIST_DIR=.next-prod, which is already in tsconfig include and used by start-fast.bat, and start it as a background job. If the measured build exceeds 3 minutes, build only at the end of Phases 3, 6 and 7 and run vitest and tsc at every phase. Add the build time to the budgets.

## [medium / wrong] File list says src/lib/thunai/ears.ts, mouth.ts and voice.ts.

- Evidence: These files are at src/components/collector/app/thunai/{ears,mouth,voice,wake}.ts. src/lib/thunai/ has none of them. thunai/v3 also has ears.ts in the components folder.
- Consequence: The agent could create duplicates in src/lib/thunai and leave imports aimed at the old ones, or spend time reconciling. Moving browser-only audio into src/lib alongside server modules also invites accidental server imports.
- Fix: Correct the 3 paths in section 4 and in the A1 and A3 references. Put new browser-only modules (vad.ts, bargein.ts) beside them, not in src/lib/thunai.

## [medium / partly] F2: Playwright 'already in devDependencies? verify, else add'; tests in tests/e2e; msw for mocked routes; CI gates.

- Evidence: Only playwright-core 1.63.0 is present, as a runtime dependency. @playwright/test is absent, and npm shows its latest as 1.64.1. Installed browsers are chromium-1243 and headless-shell-1243 in ms-playwright, which match playwright-core 1.63.0's browsers.json. msw is absent. tsconfig include is **/*.ts with no tests exclusion, so tests/e2e/*.spec.ts and eval/asr/score.ts are type-checked by the gate. vitest include is src/**/*.test.ts, so it will not pick up spec files. There is no .github folder, so no CI exists at all.
- Consequence: A bare 'npm i -D @playwright/test' brings 1.64.1 and probably a different Chromium revision, forcing a browser download mid-phase (revision not checked). If specs are written before the install, tsc fails. msw cannot intercept the Next server's outbound fetches from a browser test, and a browser-side worker would add a service worker file to public/. Every 'gate in CI' row has no runner, so it is not a gate.
- Fix: Say: 'npm i -D @playwright/test@1.63.0 (matches installed chromium-1243).' Use Playwright page.route for browser-side mocks instead of msw, and drop msw. Replace 'CI' throughout with 'local npm script run in Phase 7', or add a CI workflow explicitly with time budgeted. Rule out .test.tsx: vitest will not run it.

## [medium / wrong] D3: 'Keep whichever map library MapView already uses if MapLibre or Leaflet', then specifies promoteId, setFeatureState, the built-in heatmap layer, OpenFreeMap, and says 'deck.gl, h3-js, Leaflet not for this build'. Ward data must be fetched from opencity.in and a gazette.

- Evidence: The map is Leaflet: SatMap.tsx:4,11, Stage.tsx:19 (leaflet.css), assistant/MapAnswer.tsx, studio/StudioMap.tsx. maplibre-gl is not installed. Ward data already exists: data/boundaries/gcc-wards.geojson, 531 KB, 200 features, with properties ward_no, zone_number, zone_name and source_zone_name, and src/lib/wards.ts uses it for point-in-polygon. So the ward-to-zone table is already there. data/layers/ has more geojson. The CSP connect-src would also block OpenFreeMap vector tiles (next.config.js csp).
- Consequence: D3 contradicts itself. Its implementation detail is all MapLibre, while its rule keeps Leaflet. The 15-minute hunt, the KML conversion and geo/wards.ts duplicate committed data. public/geo copies it again.
- Fix: Rewrite D3: 'Map is Leaflet, keep it. Use data/boundaries/gcc-wards.geojson as is, served through an existing or new API route, with L.geoJSON style updates for the choropleth and a canvas renderer for points. No new map dependency, no download.'

## [medium / partly] A1: copy ONNX and WASM assets to public/vad/ in a predev/prebuild script.

- Evidence: public/vad is not gitignored (check-ignore has no rule). node_modules/onnxruntime-web/dist has 4 wasm files: 14.3 MB, 16.8 MB, 26.9 MB and 28.4 MB. npm scripts on this Windows machine would run under cmd.exe (not tested). Thunai/v3 already solved this differently: src/app/thunai-ort/[file]/route.ts serves an allow-listed set from node_modules ('so 14 MB of WebAssembly is not copied into git'), with public/thunai/silero_vad_v5.onnx committed (2.3 MB).
- Consequence: Copying the whole dist adds up to 86 MB of generated files that an unignored git add could commit to the repo. A shell cp in a script fails on Windows. The prompt tells the agent not to take v3's files, which discards a working pattern.
- Fix: Copy only the wasm variant vad-web loads, using a Node script (fs.cpSync), and add public/vad/ to the app .gitignore. Allow v3's allow-listed route as the fallback, and mention it in A1.

## [medium / partly] Credentials: 'GROQ_API_KEY, Gemini, Azure (and whatever OPENAI/Bedrock keys exist)', and .env.example gains GROQ_API_KEYS.

- Evidence: Names set non-empty in .env: GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3, GEMINI_API_KEY, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN, AWS_BEARER_TOKEN_BEDROCK, AWS_REGION, AI_BEDROCK_MODEL. OPENAI_API_KEY is present but EMPTY. GROQ_API_KEYS (plural) is used nowhere: the convention is GROQ_API_KEY_2 to _5 (src/lib/ai/gateway.ts:107-112). /api/jarvis/hear reads only GROQ_API_KEY (hear/route.ts:33,42). .env sets AI_PROVIDER=bedrock, AI_FORCE_PROVIDER=bedrock, AI_FALLBACK_PROVIDER=groq,gemini and AI_CHAT_PROVIDER=groq,gemini. Gateway.ts:155,162 puts AI_FORCE_PROVIDER first for every non-chat call. THUNAI_PROVIDER is unset, so agentServer.ts:14 uses groq. .env is dated 2026-10-29, and .env.aws.example says the AWS keys 'expire after a few hours', so Bedrock is likely stale (validity unverifiable without calling it, which I did not do). Other names code reads: JARVIS_STT_MODEL, JARVIS_TTS_MODELS, JARVIS_MODELS_FIRST, JARVIS_AZURE_EN/TA, GEMINI_API_KEY. Note: Ollama is installed (0.40.13) but the only pulled model is llama3.2:3b, a family the prompt bans; qwen3 must be downloaded.
- Consequence: A new GROQ_API_KEYS name makes two conventions for one idea. A1 also says extra keys in one org add no quota, while the gateway pools them, so the ledger's key_id column could misreport capacity. Whether the 3 keys share an org is unverifiable. Calls that follow AI_FORCE_PROVIDER try likely-dead Bedrock first and add latency to the 'ladder' measurement. The prompt's ladder omits Bedrock while the live configuration puts it first.
- Fix: Drop GROQ_API_KEYS and keep the numbered form. Tell the agent the ledger keys by provider and model across keys unless Phase 0 headers prove separate orgs. Tell it to treat Bedrock as off unless a probe works, and to name the AI_FORCE_PROVIDER interaction. Delete OPENAI from the list of available keys. Mention that the Ollama probe includes a model pull.

## [medium / partly] A4: 'Independent 2026 benchmarks put Gemini 3 Flash at 12.1 % FLEURS-Tamil WER (Pro 11.4 %), IndicConformer at 25.5 %, Whisper at 48.6 %.'

- Evidence: The numbers are real but not independent and not from one benchmark. Whisper-large-v3 48.58 and IndicConformer-600M 25.49 come from the Lemura Labs Tamil-ASR-Qwen3 card (huggingface.co/osmapi/tamil-asr-qwen3), labelled self-reported, by authors of a competing model. Gemini 3 Flash 12.1 and Pro 11.4 come from the Josh Talks Voice of India page (voiceofindiablogs.ai.joshtalks.com), which states no normaliser. The same table has Flash at 19.9 on real speech, tied with IndicConformer at 19.9. arXiv 2608.08235 Table 3 has Gemini 3 Flash 35.2† and IndicConformer 30.1 (mean across datasets, with Flash on fewer datasets). None of these measured the lite models the prompt actually uses.
- Consequence: Not fabricated, but the 12 vs 25 vs 49 comparison mixes sources, and the hard-coded arbitration 'use Gemini if it arrives within 1500 ms' rests on it. Other sources show Flash no better than IndicConformer on non-FLEURS speech.
- Fix: Replace 'Independent' with 'separately reported, not comparable'. Cite each source, and add the 19.9 vs 19.9 and 35.2 vs 30.1 figures. Make arbitration conditional on the Phase 0 lite-model CER rather than assuming Gemini wins.

## [medium / unverifiable] A4 'measured facts': Whisper 56 % on FLEURS, ~82 % on IndicVoices, language ID 64.5-80 %, turbo 114.6 % on code-switched speech, whisper-small Tamil ≈ 93 %.

- Evidence: One targeted search found none of 82 %, 114.6 % or 64.5 %. The nearest hit was a Whisper-small LoRA card reporting a 0.976 WER baseline on its own synthetic set. 56 % and 93 % were not separately searched and appeared nowhere in the pages I read. A secondary blog attributes a conflicting 26.0 % for Whisper large-v3 on FLEURS Tamil to ElevenLabs, which I also could not verify. The prompt gives no source for any of these.
- Consequence: Treat as likely fabricated or at least uncited. Low design impact, because the conclusion that Whisper is weak on Tamil is independently supported by the 48.58 figure and is to be measured anyway. But they are labelled 'measured facts' in a prompt that forbids invented numbers, and could be copied into REFERENCES.md and the report.
- Fix: Delete these figures, or mark them 'unverified, no source found'. Forbid copying them into eval/RESULTS.md or REFERENCES.md.

## [medium / wrong] F1: SLR65 is 'the only ungated, script-fetchable set' and is tried first. FLEURS is used only 'if it downloads without a token'. Acceptance row: 'Tamil ASR CER/WER on FLEURS subset'.

- Evidence: huggingface.co/api/datasets/google/fleurs reports gated: false, licence cc-by-4.0, tag format:parquet. datasets-server.huggingface.co/splits?dataset=google/fleurs&config=ta_in returns train, validation and test. openslr.org/65 confirms CC BY-SA 4.0 and direct files ta_in_female.zip 769M + ta_in_male.zip 603M (1.37 GB; links not tested). Unverifiable: 50 speakers, 4,291 utterances, 7.08 h, 48 kHz and Wikipedia sentences appear on neither the page nor about.html.
- Consequence: The source-order rule selects SLR65, so the FLEURS acceptance row has no data and A4's published FLEURS reference points are not comparable. The build also takes a 1.37 GB share-alike download when a non-SA, smaller set is available.
- Fix: Reorder: FLEURS ta_in test split first (the Lemura card reports 586 clips), SLR65 as fallback. Remove 'the only ungated'. Mark the SLR65 corpus statistics as unverified.

## [medium / wrong] F2: 'Chromium source facts: the WAV must match the audio bus format exactly (no resampling)' and fixtures must be generated to match. Tests keep echoCancellation, noiseSuppression and autoGainControl on.

- Evidence: media/base/media_switches.cc comment on kUseFileForFakeAudioCapture: 'The input file is converted to suit Chrome's audio buses if necessary, so most sane .wav files should work.' media/audio/simple_sources.cc FileSource builds an AudioConverter from file params to output params. The same comment says to 'disable audio processing (lest your audio file will play back distorted)'. Confirmed from the prompt: looping is the default; %noloop works (fake_audio_input_stream.cc splits on '%' and CHECKs 'noloop'); a read failure logs LOG(ERROR) and returns 0 frames.
- Consequence: The probe page and matched fixtures waste time. The real hazard is unaddressed: AEC, NS and AGC can distort the fixture, giving flaky or misleading VAD and barge-in results that invite threshold tuning.
- Fix: Remove the exact-match sentence and the probe. Use any 16-bit PCM WAV with %noloop. In vad.spec and bargein.spec, inject getStream with processing disabled for functional assertions, and report one separate AEC-on run. Assert the fixture is non-silent, because read failures are silent.

## [medium / partly] A1/Phase 1: copy assets from node_modules/onnxruntime-web/dist into public/vad/. A1 describes the footprint as ~2.2 MB.

- Evidence: Lockfile resolved on a scratch copy only: installing vad-web alone puts ORT 1.31.1 at node_modules/@ricky0123/vad-web/node_modules/onnxruntime-web, while the root stays 1.31.0-dev.20260914 (pinned by @huggingface/transformers 4.3.0). Installing vad-web and onnxruntime-web together puts 1.31.1 at the root and nests the dev build under transformers. ort-wasm-simd-threaded.wasm is 14,848,852 bytes, and dist also has jsep 29.5 MB, asyncify 28.7 MB and jspi 17.9 MB. v3's route comment deliberately avoided committing '14 MB of WebAssembly'. Not tested in a real Next build.
- Consequence: If the builder omits the explicit onnxruntime-web install, the copy script takes WASM from a different ORT build than the JS using it. A blanket dist copy adds about 90 MB, and committing it bloats git. Actual first load is about 17 MB, not 2.2 MB.
- Fix: Require a direct dependency on onnxruntime-web and have the script assert version equality. Allowlist vad.worklet.bundle.min.js, silero_vad_v6.onnx, ort-wasm-simd-threaded.wasm and ort-wasm-simd-threaded.mjs. Add public/vad/ to .gitignore. Budget a first-load mic delay and load it only when Jarvis mode turns on.

## [medium / partly] A5 fallback: if Interactions streaming is unavailable, 'use generateContent per sentence chunk'. 'Plain generateContent returns a whole clip'. 3.8 TTS models described as 'stable'.

- Evidence: aistudio.google.com/docs/speech-generation shows TTS examples only on POST /v1beta/interactions and mentions generateContent only in its migration section. Streaming with stream:true and audio/l16 is confirmed; unary returns WAV. docs/models labels both 3.8 TTS models 'New' with no stable label. docs/interactions says the API is GA and generateContent is 'legacy' but 'remains fully supported'. say/route.ts currently calls models/${model}:generateContent. Unverified: whether 3.8 TTS works there, and free-tier availability of Interactions (the pricing page does not mention it).
- Consequence: The named fallback may not exist for these models, and the builder would discover that in the cut-line path.
- Fix: Change the fallback to Interactions unary (non-streaming) first, then generateContent only if the probe passes. Replace 'stable' with 'listed as New'. Keep the 10-minute probe.

## [medium / unverifiable] C0: Gemini free tier 3.8/3.6 Flash 5 RPM / 20 RPD; lite 10 RPM / 500 RPD / 250K TPM; TTS 3 RPM. A5: the ledger must refuse more than 3 TTS requests a minute.

- Evidence: aistudio.google.com/docs/rate-limits gives no free-tier RPM, TPM or RPD: limits 'can be viewed in Google AI Studio'. It does confirm limits are per project. The search found only third-party blogs with conflicting numbers, none mentioning these models. The pricing page confirms all four named ids are free of charge. Tamil is listed for both TTS models. Audio input is priced for both lite models.
- Consequence: Hard-coded ledger constants may be wrong in either direction, and the design conclusions rest on them ('Gemini is never the primary', 'hedge only into lite', '~7 turns').
- Fix: Mark these numbers 'unverified: AI Studio only'. Make them config defaults overridden by observed 429s and any returned headers, not constants. Do not state them as read facts in C0.

## [medium / partly] A4: Whisper gate 'upstream defaults no_speech_prob < 0.6, avg_logprob > -1.0, compression_ratio < 2.4'. Two decodes use whisper-large-v3-turbo.

- Evidence: openai/whisper transcribe.py: values are correct, but semantics differ. A segment is skipped as silence only when no_speech_prob > 0.6 AND avg_logprob <= -1.0; logprob and compression thresholds trigger temperature fallback, not rejection. Groq documents all three fields under verbose_json (confirmed). Prompt's cited Tamil WER figures are for large-v3, not turbo. Groq's doc gives overall WER of 12 % for turbo and 10.3 % for large-v3. v3 commit e719624 reads 'Whisper large-v3 for Tamil with a conversation hint'.
- Consequence: A flat three-way AND rejects low-confidence but valid Tamil, which plausibly scores low on logprob. Moving real Tamil utterances to turbo is an unstated, unmeasured regression risk, since main uses large-v3 for real utterances per the research prompt.
- Fix: Reject as silence only when no_speech_prob > 0.6 and avg_logprob <= -1.0. Treat compression ratio and logprob as suspect flags tunable on non-held-out data. Include large-v3 in the Phase 0 comparison and choose by CER. Both models have the same rate limits.

## [medium / partly] A5: Azure wins on quota because '0.5 M chars ≫ 3 RPM'. F0 limit given as 0.5 M characters/month only.

- Evidence: Confirmed: F0 '0.5 million characters free per month' (azure.microsoft.com/pricing/details/speech). ta-IN-PallaviNeural, ta-IN-ValluvarNeural and en-IN-NeerjaNeural are listed (language-support). raw-24khz-16bit-mono-pcm is in the Streaming list, riff-24khz in NonStreaming (rest-text-to-speech); the body 'can be played as it's transferred'. Omitted: speech-services-quotas-and-limits gives F0 '20 transactions per 60 seconds', not adjustable. F0 streaming: I found no tier exclusion; the same REST table covers F0. First-byte latency is unmeasured. Forum posts only suggest one F0 per subscription.
- Consequence: Sentence chunking at about 4 requests a turn gives about 5 turns a minute. Barge-in aborts, retries and fixture generation also count, so an unmodelled limit produces 429s in the primary path.
- Fix: Add 'Azure F0: 20 requests/60 s, enforced in the ledger; coalesce short sentences; use the centralindia region for ta-IN'. The docs say most TTS 429s come from serving a voice outside its native region.

## [low / partly] Branching from main is clean.

- Evidence: Git status shows uncommitted changes to data/i18n/en.json, data/i18n/ta.json and data/embeddings/incidents-Xenova_multilingual_e5_base.{bin,json}, plus untracked docs/jarvis/ and docs/thunai/V3_BUILD_PROMPT.md. Commit baf956d made the whole site bilingual, so new labels may touch those i18n files; how i18n strings are added was not checked.
- Consequence: A broad git add could commit the owner's unrelated data edits, or new labels could collide with them.
- Fix: Add: 'Stage by explicit path; never git add -A; do not commit those four files. Never push or merge. Add new UI strings through the site's existing i18n path, in both languages, and report any conflict.'

## [low / gap] The prompt ignores say.ts and normalise.ts: will a rewrite break them?

- Evidence: say.ts: bilingual templates plus numberGuard, which THROWS on an unlisted number (say.ts:94); used only by Thunai.tsx:18. A throw inside a step is swallowed at Thunai.tsx:657. normalise.ts: token and number normaliser for understand.ts; its detectLang also feeds agent.ts:16,154,369,411 and plan.ts:10. A loop rewrite should not break either if they stay imported. quick.ts is imported only by agentServer.ts:11 and its test, and depends on the recipe names, the `prices` recipe and the `fresh` slot (checkScreen agent.ts:192).
- Consequence: New executor speech built with line() can fail silently through numberGuard. Renaming recipes or slots silently breaks the fast lane. Any change to detectLang shifts reply language across the agent.
- Fix: Name all three as keep-and-extend. New spoken lines go through say.ts templates. Freeze the RECIPES and slot names or update quick.ts together with them.

## [low / gap] Language handling is uniform across lanes.

- Evidence: quick path and the off-topic reply decide language by Tamil-script regex only (agentServer.ts:43,51). The agent uses detectLang, including the Tanglish regex (agent.ts:369, normalise.ts:110-114).
- Consequence: A Tanglish question answered by the quick lane gets English; the same sentence through the agent gets Tamil.
- Fix: Use detectLang in agentServer.ts and add a Tanglish language assertion to quick.test.ts.

## [low / partly] risk.ts grades A/B/C with a closed action enum.

- Evidence: Confirmed: risk.ts:10-17, Step union 39 kinds (types.ts:24-65), AI_ACTIONS 37 (plan.ts:19-21). Gap: planRisk returns the highest grade (risk.ts:26-28), but the client gates only on === "B" (Thunai.tsx:1049,1077,1091). A plan [send, remember] grades C, skips the one-tap card, and remember runs. `send` itself only fills the tray (:615-623).
- Consequence: Multi-step plans make this bypass more likely.
- Fix: Have the new executor gate on `planRisk !== "A"` per step, with C still requiring confirm N.

## [low / partly] Zod block catalog in screens.ts; plan.ts up to 3 steps per round; figuresOk + spellsNumber with one call site.

- Evidence: The catalog is in stage.ts:25-61 (15 kinds, including MapView :44 and Chart :54); screens.ts only imports its types (:9). plan.ts has no per-round limit: AiPlanSchema steps max 8 (plan.ts:50). The limit of 3 is tool CALLS per round in agent.ts (:24,:64); agent plan steps max 6 (:61). figuresOk has one call site (agent.ts:488). spellsNumber has five (:415,416,417,422,488). Other number gates: say.ts:94, plan.ts replyOk :264,:299, /\d/ checks :287-291.
- Consequence: Wrong file targets. New model-written text may be assumed covered when it needs an explicit gate call.
- Fix: Correct the three references. Say any new model-written spoken text must pass figuresOk and spellsNumber against server-held facts.

## [low / partly] Plan-as-JSON in strict json_schema mode (to be built).

- Evidence: Already there: AgentPlanSchema (agent.ts:57-68), AiPlanSchema (plan.ts:46-54). Strict mode: Groq structuredOutputs and strictJsonSchema (gateway.ts:130), OpenAI (:144), Gemini structuredOutputs (:81). Bedrock uses a tool call (gateway.ts header :4-5). Rejected drafts can pass through the lenient schema (gateway.ts:419-426, agent.ts:73-77), so checkers remain essential. Plan field `done` is never read by the loop; only `calls` drives it (agent.ts:388).
- Consequence: A new plan schema would duplicate one and risk dropping checkPlan, checkScreen, checkStageOp and dropCopiedFilters.
- Fix: Tell the build to extend AgentPlanSchema with all properties present and nullable, keep the lenient path and checkers, and either honour or remove `done`.

## [low / partly] 16 recipes, 18 local commands, rules layer about 1.5 ms.

- Evidence: 16 recipes: stage.ts:66. But agentSystem documents only 15; `prices` is absent from agent.ts:89-103 while the enum permits it, and the tomato example routes to calls (:133). 18 local commands: stagelocal.ts:9-20. The 1.5 ms: golden.test.ts:265-271 measures understand() only, not quickScreen; I did not rerun it, so the number is unverified today.
- Consequence: The model is not told about `prices` unless the rewrite adds it.
- Fix: Add prices to the recipe text, and do not cite the 1.5 ms as covering quick.ts.

## [low / unverifiable] The prompt under review contains stage.commit, stageDigest, frame.ts and section B5.

- Evidence: Grep of E:\farm *.md and docs/.claude found none of these terms. docs/thunai/V3_BUILD_PROMPT.md is an older, different prompt, and docs/jarvis/FABLE_RESEARCH_PROMPT.md is the research assignment. I reviewed only the claims relayed in my task, not the prompt text.
- Consequence: Other wrong statements in the prompt's wording were not checked by this review.
- Fix: Save the prompt in the repo or the scratchpad before the final review pass, and do not let the build read V3_BUILD_PROMPT.md as current.

## [low / partly] ears.ts is an RMS gate on a ScriptProcessorNode: 42.7 ms frames, 128 ms onset, 768 ms end of utterance, 14 s max, frame constants that drift between 44.1 and 48 kHz, and barge-in by an 11-frame energy integrator.

- Evidence: ears.ts:36 FRAME=2048; :111 createScriptProcessor; :197-199 RMS; :221 hysteresis; :225 onset loud>=3; :235 quiet>=18; :239 voiced<9 discarded; :208-210 leaky integrator over>=11 at floor*6 / 0.035. At 48 kHz that is 42.7/128/768/469 ms; at 44.1 kHz it is 46.4/139/836/511 ms, so the frame counts do drift. BUT the 14 s cap (:233) and the 5.5 s wake-probe cap (:255) are computed in seconds from ctx.sampleRate and do not drift. The quiet counter (:232) is not consecutive: frames between the on and off thresholds neither add to it nor reset it, so 768 ms is a minimum. new AC() (:109) takes the device rate, so a 16 kHz Bluetooth headset would make onset about 384 ms and end of utterance about 2.3 s.
- Consequence: Minor. The baseline 'Today (by code)' numbers are right for 48 kHz.
- Fix: Reword as 'frame-counted thresholds (onset, end of utterance, minimum voiced, barge-in) drift with the device rate; the 14 s cap is already in seconds'.

## [low / gap] A5 says to play via AudioBufferSourceNode scheduling, implicitly keeping the speed setting.

- Evidence: The Collector's speed setting is 0.7-1.4 (Thunai.tsx:218, :561, :1423), applied as HTMLAudioElement.playbackRate in mouth.ts:80 (clamped 0.8-1.25). An AudioBufferSourceNode's playbackRate changes pitch (this is Web Audio behaviour, not checked in the repo).
- Consequence: After the rewrite, 'speak faster' would raise Jarvis's pitch, and scheduled start times would need dividing by the rate.
- Fix: Apply speed at the provider (Azure SSML prosody or a Gemini instruction), or keep 1.0 for scheduled PCM.

## [low / gap] Keep the hallucination regex.

- Evidence: INVENTED (hear/route.ts:18) blanks a bare 'bye', 'thank you', 'thanks', 'okay' or 'நன்றி', and ears.ts:294 then drops the clip. So the bare forms in Thunai.tsx:1323's BYE regex never arrive, and saying 'bye' or 'thank you' alone does not end the conversation. Main also has no prompt-echo filter for utterances; v3's cleanTranscript does (thunai/v3 stt.ts). hear/route.ts:29 notes that Whisper can repeat its hint on near-silence.
- Consequence: A small, existing UX bug is preserved, and prompt-echo hallucinations stay unfiltered once the prompt is sent on every decode.
- Fix: Only treat INVENTED matches as noise when the VAD segment is short or low-confidence. Add v3's prompt and hint echo check.

## [low / gap] E2 says 'Esc cancels/interrupts'.

- Evidence: Thunai.tsx:1439 stops speech on Esc only when window.speechSynthesis?.speaking or phase === 'acting'. Server-voice playback (HTMLAudioElement, mouth.ts:78) is therefore not stopped by Esc today, and Web Audio playback after the rewrite will not be either.
- Consequence: Esc silently fails for the main TTS path.
- Fix: Base the Esc test on mouth.speaking() and the turn state, not on speechSynthesis.

## [low / gap] The prompt implies karaoke word highlighting works today (it is silent on onWord).

- Evidence: Thunai.tsx:768 and :794 pass onWord into mouth.speakLines, but mouth.ts never calls o.onWord. Its fallback forwards only rate, voice and onEnd (mouth.ts:92), and HTMLAudio playback has no word timing. Only voice.ts:115 emits word boundaries.
- Consequence: Read-aloud word highlighting has been dead since baf956d. A rewrite could cement this without anyone noticing.
- Fix: Have mouth forward onWord on the speechSynthesis path. On the PCM path, highlight per chunk or line (onLine), since streaming PCM has no word timing.

## [low / wrong] E3: self-host Noto Sans Tamil in public/fonts/ as a subset woff2.

- Evidence: @fontsource-variable/noto-sans-tamil is a dependency, and src/app/layout.tsx:7 already imports its wght.css. The tamil-wght woff2 is in node_modules/@fontsource-variable/noto-sans-tamil/files. public/fonts and public/vad do not exist today. public holds brand, default-avatar.svg and uploads.
- Consequence: This duplicates a font already loaded on every page, and adds a binary to the repo.
- Fix: Delete the public/fonts item. Reference the existing font-family name in the Jarvis font stack.

## [low / partly] B3: Meta arXiv 2605.24660 found adaptive K ≈ 2.2 gave 93-96 % selection accuracy vs 85-87 % at fixed K = 5.

- Evidence: The paper exists (Repantis et al., v2 7 Jun 2026; author line 'Meta Platforms'). K≈2.2 is from one retrained BFCL experiment. BM25: 93.1 vs 87.1. Embeddings: 96.1 vs 84.6. The prompt's range mixes scorers. These are choice accuracies conditional on the gold tool being presented. End-to-end, fixed K=5 is ahead at 73.3 vs 71.7, on 120 test queries.
- Consequence: Real citation with overstated implication. Very small bundles may not help end to end, and narrow bundles risk leaving out the right tool. The bundle design survives, but this is not strong evidence.
- Fix: State both scorers and the end-to-end 73.3 vs 71.7. Add a telemetry counter for 'correct tool not in bundle', plus an escape to a wider list.

## [low / partly] A1: read the LICENSE file 'in the vendored model directory'; v6 '11-16 % error reduction'; vad-web 0.0.31 'published ~Oct 2026'.

- Evidence: Silero LICENSE on GitHub is MIT. The README badge's image URL says MIT while its alt text says 'CC BY-NC 4.0', so the conflict is only alt text. The vad-web 0.0.31 tarball has only README.md, dist and package.json, so there is no LICENSE beside the models. npm time shows 0.0.31 published 2026-09-12, not October. 11-16 %: only a third-party blog mentions these numbers; primary release notes not found.
- Consequence: The builder cannot follow the licence step as written and may burn time or fall back to v5 needlessly.
- Fix: Replace with: 'Silero upstream LICENSE is MIT (checked 2026-11-04); the CC BY-NC text is stale badge alt text; use v6.' Change the date to Sep 2026. Mark 11-16 % as unverified.

## [low / partly] Package licences and versions: Noto Sans Tamil OFL; maplibre-gl BSD-3 ('npm showed 5.6.1'); words-to-numbers MIT; simple-statistics ISC; zod-to-json-schema MIT; IndicConformer LICENSE file.

- Evidence: Confirmed: Noto OFL 1.1 (notofonts/tamil OFL.txt), maplibre-gl BSD-3-Clause, words-to-numbers 1.5.1 MIT (last modified 2022, depends on babel-runtime 6.x), simple-statistics 8.0.0 ISC. Wrong: maplibre-gl latest is 6.16.0; zod-to-json-schema is ISC, not MIT (repo zod is 3.25.76); kokoro-js is 1.2.1, not 1.2.0. IndicConformer API shows licence mit and gated 'auto', with no LICENSE file in siblings. @fontsource-variable/noto-sans-tamil 5.3.0 (OFL-1.1) is already a dependency. v2.004 unverified.
- Consequence: All still permissive, so nothing is blocked. Self-hosting a new subset in public/fonts duplicates an installed package and spends Phase 6 time.
- Fix: Correct the values. Use the installed fontsource package instead of a new public/fonts file. Change 'read the LICENSE file' for IndicConformer to 'card metadata says MIT'.

## [low / gap] Scope of this check and limits on the evidence.

- Evidence: Read the prompt text from this session's log because it is not in the repo; docs/thunai/V3_BUILD_PROMPT.md is a different, older prompt. Most web evidence came through WebFetch summaries, not raw pages. Downloads were not run for SLR65, FLEURS or MUSAN. No provider was called and no key value was read or printed. Scratch files are only in the session scratchpad. The shell's Node is v24.21.0 while package.json engines says 22.x (npm EBADENGINE warning), which affects the node:sqlite and pinning guidance in C1. Not checked: LiveKit and Pipecat language counts, BFCL, RAG-MCP, Portkey and other citations outside my list.
- Consequence: A 'confirmed' here means the doc or source said so on 2026-11-04, not that it was tested end to end.
- Fix: Keep the Phase 0 live probes. State the required Node version explicitly in C1.

## [none / unverifiable] Review limits and a disclosure.

- Evidence: The full build prompt was not available; all 'missing' findings are against the supplied summary. Separately, while grepping my scratch text extract of the Task_6 PDF for dates, one credential line from that PDF appeared in this session's tool output. I did not use it and do not repeat it here. I deleted both extracts from the scratchpad. Repo status was unchanged afterwards, and no provider was called.
- Consequence: Some gaps may already be closed in the full text. The owner may want to know that the session transcript contains that one line; memory notes these credentials are confidential.
- Fix: Re-check findings marked gap or unverifiable against the full prompt before editing it. Keep the Task_6 PDF out of any file the build agent is told to read.

