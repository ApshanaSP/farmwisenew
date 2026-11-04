# Jarvis research: techniques and open-source projects

Date: 4 Nov 2026. Scope: the District IQ console's voice assistant (Next.js 14.2, Groq LLMs, Groq Whisper STT,
English / Tamil / Tanglish, numbers only from code). Repo metadata (licence SPDX id, stars, last push, archived) was
read from the GitHub REST API on 4 Nov 2026, and licences were also checked against the LICENSE file where noted.
Star counts change daily; treat them as approximate. "Unverified" means I could not confirm it from a primary source.

What the codebase already has, so the recommendations below are deltas and not rewrites:
`src/lib/assistant/fuzzy.ts` (Damerau-Levenshtein, refuses ties), `spell.ts` (vocabulary-bound correction),
`lance.ts` (vector + keyword lists fused by RRF, K = 60), `rerank.ts` (one small LLM call picks the incident),
`context.ts` (structured follow-up state), `agent.ts` (up to three tool rounds), `verify.ts` (every number in an answer
must be a fact), `src/lib/thunai/stt.ts` (parallel forced `ta`/`en` decodes with a place-name prompt, scored on
`avg_logprob`, `no_speech_prob`, repetition and prompt echo), `src/app/api/jarvis/say/route.ts` (Gemini voices, Azure
SSML branch never run).

---

## Chosen for this build (ranked; each a small TypeScript pattern, under an hour, no new runtime dependency)

1. **Cross-script phonetic key as a third RRF list (entity linking under speech errors).** Map Tamil script to a
   roman skeleton (table copied from MIT `sanscript.js`), then collapse Tanglish spelling variants (th/t/dh/d, zh/l/r,
   aa/a, ee/i, oo/u, v/w, doubled letters, trailing -am/-an/-u) into a key, Double-Metaphone style. Index every place,
   ward and zone alias by key; feed key matches as a third ranked list into the existing RRF in `lance.ts` and as a
   candidate source for `fuzzy.ts`. Gain: "Thiruvotriyur / Tiruvottiyur / திருவொற்றியூர் / tiru otri yur" land on one
   entity where edit distance alone fails. Sources: Double Metaphone (words/double-metaphone, MIT), Indic Soundex idea
   (Thottingal; libindic code is LGPL, so re-implement from the blog, do not copy), sanscript.js Tamil scheme (MIT).
2. **Symbolic references in narration (SymGen pattern).** The composer writes `{{f3}}` instead of digits; code
   substitutes the formatted fact. Any raw digit left in model text is a failure that `verify.ts` already catches. Gain:
   the model never types a number, so verifier rejections and retries drop and latency falls; the verifier stays as the
   backstop. Source: Hennigen et al., arXiv 2311.09188.
3. **Calibrated abstention on the frozen eval set.** Combine signals already computed (Whisper `avg_logprob`,
   `no_speech_prob`, entity-match margin between best and second candidate, router agreement) into one logistic score
   fitted with Platt scaling (two parameters: safe on ~60 items), report a 5-bin reliability table with Wilson intervals,
   and set one "ask back instead of answer" threshold for a target precision. Gain: replaces hand-set thresholds with
   one measured cut and a chart the team can read. Sources: scikit-learn calibration guide (isotonic needs ~1000+
   samples; sigmoid suits small sets), Guo et al. arXiv 1706.04599.
4. **Speech text normaliser for TTS: Indian numbers, sentence chunks, place-name respellings.** Before `say`:
   (a) numbers through `Intl.NumberFormat('en-IN')` (verified: 12345678 -> "1,23,45,678"; compact -> "1.2Cr") then
   to words with lakh/crore; (b) split at sentence ends, with abbreviation guard, and send the first sentence
   immediately (pipecat's `match_endofsentence` pattern); (c) a respelling lexicon for Chennai places ("Kodungaiyur" ->
   "Ko-dung-ai-yoor") applied for Gemini voices, and emitted as Azure `<phoneme>`/`<sub>` when that branch is turned on.
   Gain: first audio sooner; figures read as an Indian listener expects; fewer mangled place names.
5. **Adaptive end-of-turn silence (smart-turn idea, text-only).** Keep the VAD silence window short by default and
   lengthen it when the running transcript ends in a continuation cue: English ("and", "but", "so", "the", "of"),
   Tamil/Tanglish ("matrum", "apram", "aana", "enna", "ah", "-um"), or a filler ("um", "uh", "hmm"). Gain: fewer
   collector questions cut in half without making every reply slower. Smart Turn itself has no Tamil and no browser
   runtime (see Part B), so take only the idea.
6. **Guarded follow-up rewrite.** Deterministic detector first (pronouns, ordinals, "same", "there", "athu", "anga",
   bare filters such as "only Adyar"); rewrite only when it fires, and reject a rewrite that introduces an entity not in
   the question or `context.ts` state. Gain: stops the rewriter inventing a place or date; most turns skip the call.
   Source: LangChain history-aware retriever prompt ("Do NOT answer the question, just reformulate it").

## Rejected / later

| Item | Why not now |
|---|---|
| pipecat-ai/smart-turn model | BSD-2 and good, but Tamil is not among its 23 languages; Python/ONNX only, no browser runtime in the repo. Revisit if a Tamil build appears or if STT moves server-side with audio. |
| LiveKit turn-detector model | Weights under "livekit-model-license" (custom, not OSI); Hindi listed, Tamil not. |
| Pipecat, LiveKit Agents, TEN Framework | Full server runtimes (Python / WebRTC); against "no heavy runtime frameworks". TEN licence also adds Agora-specific restrictions. |
| AI4Bharat IndicConformer | MIT and has Tamil, but needs AI4Bharat's NeMo fork and a GPU host; no Tanglish code-switch claim. Later, as an offline benchmark against Groq Whisper. |
| Whisper LoRA for Tanglish | Only self-reported, synthetic-corpus numbers found; needs training and hosting. |
| Cross-encoder reranker | No embeddings/rerank endpoint used on Groq here; `rerank.ts` already uses an LLM reranker (RankGPT style). |
| Isotonic regression | Needs ~1000+ labelled items per scikit-learn guidance; the frozen set is ~60. |
| Letta, mem0, Graphiti | Memory servers with their own storage and services; `context.ts` already holds the state this product needs. |
| CopilotKit, AG-UI, A2UI | Protocols/SDKs for agent-to-UI; the console already renders typed cards. Read A2UI's component-catalogue idea only. |
| Kokoro, Piper | No Tamil voices (Kokoro voice prefixes include Hindi only; Piper voice list has hi/ml/te, no ta). Piper's active fork is GPL-3.0. |
| annyang | Wraps the browser SpeechRecognition API, which cannot take a place-name prompt or be scored; current Groq path is better. |
| Silero VAD in browser (ricky0123/vad, ISC) | Reasonable later if the current VAD misfires; adds an ONNX model download to the page. |

---

## Part A: techniques

### A1. Entity linking under speech errors (rank: 1)

Patterns:
- **Phonetic keys.** Double Metaphone produces primary/alternate keys so differently spelled names collide.
  https://github.com/words/double-metaphone (MIT, ~99 stars, last push Nov 2022: stable, small). Talisman bundles many
  phonetic and fuzzy algorithms in JS: https://github.com/Yomguithereal/talisman (MIT). Copy: the key-collision idea
  and the two-key fallback, not the English rules (they do not fit Tamil names).
- **Indic Soundex.** libindic maps letters of different Indic scripts to shared phonetic classes so the same word in
  two scripts compares equal (`compare('ಬೆಂಗಳೂರು', 'बॆंगळूरु') -> 2`). https://github.com/libindic/soundex,
  description at http://thottingal.in/blog/2009/07/26/indicsoundex/. Licence LGPL-3.0: re-implement, do not copy code.
- **Transliteration to a common script.** sanscript.js has a Tamil scheme table (MIT):
  https://github.com/indic-transliteration/sanscript.js. IndicXlit (MIT) is a neural model for roman-to-native,
  heavier than needed: https://github.com/AI4Bharat/IndicXlit.
- **Fuse candidates by rank, not score.** Edit-distance, phonetic-key and embedding candidates have incomparable
  scores; RRF (A3) merges them.

What to copy: a ~40-line `tamilKey(s)` with a lookup table; precompute keys for the gazetteer; keep `fuzzy.ts`'s
refusal to guess between equally close candidates. Expected gain: largest of all items for spoken place names; measure
on the frozen set as entity-link accuracy before/after (unverified until run).

### A2. Context-aware query rewriting for follow-ups (rank: 6)

- LangChain `create_history_aware_retriever`: rewrite the follow-up into a standalone question, "do NOT answer",
  return unchanged when not needed.
  https://reference.langchain.com/v0.3/python/langchain/chains/langchain.chains.conversational_retrieval.base.ConversationalRetrievalChain.html
- Structured state beats chat-text rewriting where the referent is a listed item ("the second one"): this repo's
  `context.ts` already does this; keep it as the first resolver.
- Guard: rewrite only on a detected anaphor/ellipsis; diff entities in the rewrite against question + state; fall back
  to the raw question on mismatch.

Expected gain: fewer wrong-place answers on follow-ups and one fewer LLM call on most turns.

### A3. Hybrid retrieval, RRF and reranking (rank: supports 1)

- RRF: score = sum of 1/(k + rank); k = 60 from Cormack, Clarke and Büttcher, SIGIR 2009,
  https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf. Already in `lance.ts`.
- Add lists rather than tune weights: a phonetic-key list (A1) and an exact-alias list slot straight into the sum.
- LLM listwise reranking of the top few (RankGPT, Sun et al., arXiv 2304.09542). Already in `rerank.ts`.
- Small-k caution: with k = 60 the gap between rank 1 and rank 5 is small; for a 3-list fusion over a short gazetteer
  an exact alias hit should short-circuit fusion.

### A4. Grounded narration: numbers from code, words from model (rank: 2)

- **Symbolic references (SymGen).** The LLM writes text with references to input fields; a parser fills values, so
  every figure traces to a source cell. Hennigen et al., arXiv 2311.09188 (COLM 2024 per press coverage).
- **Post-hoc numeric verification.** Every numeric span is matched to a fact or flagged; this repo's `verify.ts` is
  this pattern. A related 2025 proposal ("Proof-Carrying Numbers") labels spans verified / bare / flagged; I did not
  read the paper itself, so details are unverified.
- **Placeholder copy mechanisms** in table-to-text (Suadaa et al., "Towards Table-to-Text Generation with Numerical
  Reasoning") avoid hallucinated figures; the survey arXiv 2202.03629 notes numbers are a frequent hallucination source.

What to copy: give the composer a fact list with ids (`f1: open complaints, Adyar, 42`), require `{{f1}}`, substitute
in code with the console's formatter, then run `verify.ts`. Tamil narration takes the same slots.

### A5. Agent loops that observe their own results

- ReAct (thought / action / observation): arXiv 2210.03629. Reflexion (verbal self-feedback on failure): arXiv
  2303.11366. Anthropic "Building effective agents" (evaluator-optimizer, keep loops simple):
  https://www.anthropic.com/engineering/building-effective-agents
- openai/openai-realtime-agents `chatSupervisor/supervisorAgent.ts`: `handleToolCalls` loops `while (true)`, feeding
  each `function_call_output` back until the model returns text. Copy the loop shape and the "fast voice agent defers to
  a text supervisor" split; do not copy the unbounded loop.
- CarverXx/jarvis-v3: same dual-brain split (fast chat model, slower tool agent).

`agent.ts` already caps at three rounds. Small addition (not in the top 6): when a tool returns zero rows, the loop
gets one widening retry (drop the narrowest filter) and the answer says what was widened.

### A6. Confidence calibration and abstention (rank: 3)

- Temperature scaling for neural nets: Guo et al., arXiv 1706.04599. LLM self-knowledge: Kadavath et al., arXiv
  2207.05221.
- scikit-learn: isotonic "will perform as well as or better than 'sigmoid' when there is enough data (greater than ~
  1000 samples)"; sigmoid "most effective for small sample sizes". https://scikit-learn.org/stable/modules/calibration.html
- On ~60 items: Platt (fit a, b by Newton steps, 20 lines of TS), 5 equal-count bins, Wilson score interval per bin,
  and a risk-coverage table (precision vs fraction answered). Pick the threshold from the table, store it in code.
- Groq verbose_json gives `avg_logprob` ("near -0.5 or lower may signal transcription issues"), `no_speech_prob`,
  `compression_ratio`: https://console.groq.com/docs/speech-to-text. Already used by `stt.ts`.

### A7. Semantic turn detection (rank: 5)

- pipecat-ai/smart-turn v3.2: audio-only classifier on Whisper Tiny, ~8M params, int8 CPU ONNX ~8 MB, 16 kHz,
  last 8 s of audio, sigmoid "complete" probability with 0.5 cut (`inference.py`). Runs after VAD silence; re-run on
  the whole turn if speech resumes. 23 languages; Tamil not listed. https://github.com/pipecat-ai/smart-turn
- Pipecat wiring (`src/pipecat/audio/turn/smart_turn/base_smart_turn.py`): `stop_secs = 3` hard fallback,
  `pre_speech_ms = 500`, `max_duration_secs = 8`.
- LiveKit's turn detector is text-based (Qwen2.5-0.5B base) but under a custom model licence; Tamil not listed.

Copy: the two-stage shape (short silence -> "is it complete?" check -> hard timeout), with a lexical check standing in
for the model.

### A8. Code-switched Tamil-English ASR

- Groq Whisper: `whisper-large-v3` (stated 10.3% WER, generic) and `whisper-large-v3-turbo`; `prompt` up to 224
  tokens for spelling of names, "use the same language as the audio"; `language` ISO-639-1 improves accuracy/latency.
- `stt.ts` notes auto-detect on Tanglish was about 97% WER on its own set and forced language plus prompt did far
  better; that matches the pattern to keep.
- Research: CS-FLEURS (arXiv 2509.14161) reports distinct-script pairs much worse than same-script pairs; a 2025
  benchmark covers Tamil-English (arXiv 2506.14177); older Tamil-English CS work arXiv 2006.00782. Whisper numbers for
  Tamil-English in these: unverified.
- Small adds: build the prompt per turn from the current page's places (the 224-token budget is tight); keep the
  transcript in both scripts and let A1's key bridge them.

### A9. Natural TTS (rank: 4)

- Chunk at sentence ends and stream the first chunk: pipecat `src/pipecat/utils/string.py::match_endofsentence`
  (uses wikimedia sentencex, MIT, for abbreviation handling).
- Numbers: `Intl.NumberFormat('en-IN')` gives lakh grouping (checked in Node); write a words converter for
  "1.2 crore", "45 thousand", ordinals, dates ("4 November"), and phone/ID digits read one by one.
- Pronunciation: Azure supports `<phoneme>` (IPA/SAPI), `<sub>`, and PLS lexicon files referenced from SSML:
  https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-pronunciation. Google
  supports `<phoneme>` and `<sub>`; PLS support on Google is unverified. Browser `speechSynthesis` does not interpret
  SSML (W3C public-speech-api list, 2018; current Chrome status unverified), so respelling is the portable fallback.
- Pauses: commas and full stops for Gemini voices; `<break time="300ms"/>` only on the Azure path.

---

## Part B: open-source projects

Maintenance = last push to default branch per GitHub API, 4 Nov 2026.

| Name | URL | Licence (source) | Stars / maintenance | What it is / what to take | Used? |
|---|---|---|---|---|---|
| Smart Turn | https://github.com/pipecat-ai/smart-turn | BSD-2-Clause (LICENSE; HF weights bsd-2-clause) | ~1.6k; push Jan 2026; not archived | Audio turn-end classifier. Take the two-stage turn logic. | Idea only (#5) |
| microsoft/JARVIS (HuggingGPT) | https://github.com/microsoft/JARVIS | MIT (API) | ~25.6k; push Jul 2025 | LLM plans tasks and dispatches to HF models (arXiv 2303.17580). Research demo; nothing to copy for voice. | No |
| openai-realtime-agents | https://github.com/openai/openai-realtime-agents | MIT (API) | ~7.0k; push Jan 2026 | Next.js demo: chat-supervisor and handoff patterns, output guardrail classifier. Take loop shape, add a cap. | Pattern (A5) |
| jarvis-v3 | https://github.com/CarverXx/jarvis-v3 | Apache-2.0 (API) | 4 stars; push Oct 2026 | Local dual-brain voice assistant (fast chat LLM + tool agent). Hobby-scale; idea only. | No |
| Silero VAD | https://github.com/snakers4/silero-vad | MIT (API) | ~10.6k; push Oct 2026 | Small VAD model. Browser wrapper ricky0123/vad is ISC (LICENSE), ~2.1k stars. | Later |
| A2UI | https://github.com/a2ui-project/a2ui | Apache-2.0 (LICENSE) | ~17.0k; push Nov 2026 | Agent-to-UI declarative format rendered by the client's own components (code not read here). | No |
| AG-UI | https://github.com/ag-ui-protocol/ag-ui | MIT (API) | ~17.0k; push Nov 2026 | Event protocol between agent backends and front ends. | No |
| CopilotKit | https://github.com/CopilotKit/CopilotKit | MIT (API) | ~38.5k; push Nov 2026 | React SDK for in-app agents and generative UI. Heavy for this product. | No |
| IndicConformer | https://github.com/AI4Bharat/IndicConformerASR | MIT (README + API; HF model mit) | ~106; push Jun 2025 | Conformer ASR for 22 languages incl. Tamil; needs AI4Bharat NeMo fork. | Later (benchmark) |
| Pipecat | https://github.com/pipecat-ai/pipecat | BSD-2-Clause (API) | ~17.1k; push Nov 2026 | Python voice-agent pipeline. Take sentence splitter and turn params. | Pattern (A7, A9) |
| LiveKit Agents | https://github.com/livekit/agents | Apache-2.0 (API) | ~15.1k; push Nov 2026 | WebRTC voice-agent framework. Turn-detector weights: livekit-model-license (not permissive). | No |
| TEN Framework | https://github.com/TEN-framework/ten-framework | Apache-2.0 **plus extra conditions** (LICENSE: no hosting on end-user devices; no use competing with Agora) | ~11.2k; push Nov 2026 | Voice-agent framework. Not permissive. | No |
| OpenJarvis | https://github.com/open-jarvis/OpenJarvis | Apache-2.0 (LICENSE confirmed) | ~13.1k; push Nov 2026 | Local-first personal agent framework from Stanford Hazy Research / Scaling Intelligence Lab (per Stanford blog). Other "OpenJarvis" repos are unrelated small projects. | No |
| OpenVoiceOS | https://github.com/OpenVoiceOS/ovos-core | Apache-2.0 (LICENSE) | ~300; push Nov 2026 | Python voice-assistant OS (Mycroft lineage). | No |
| Leon | https://github.com/leon-ai/leon | MIT (API) | ~17.6k; push Nov 2026 | Self-hosted personal assistant (Node + Python). | No |
| annyang | https://github.com/TalAter/annyang | MIT (API) | ~6.8k; push Oct 2026 | Command matching over browser SpeechRecognition. | No |
| Letta | https://github.com/letta-ai/letta | Apache-2.0 (API) | ~25.3k; push Oct 2026 | Stateful agent server with tiered memory. | No |
| Graphiti | https://github.com/getzep/graphiti | Apache-2.0 (API) | ~32.5k; push Nov 2026 | Temporal knowledge graph for agent memory; needs a graph DB. | No |
| mem0 | https://github.com/mem0ai/mem0 | Apache-2.0 (API) | ~68.4k; push Nov 2026 | Memory layer service for agents. | No |
| RapidFuzz | https://github.com/rapidfuzz/RapidFuzz | MIT (API) | ~4.2k; push Nov 2026 | Python/C++ string metrics. Use in offline eval scripts only; scorers (token_set_ratio, partial_ratio) are copyable ideas. | Idea |
| Fuse.js | https://github.com/krisk/Fuse | Apache-2.0 (API) | ~20.5k; push Aug 2026 | JS fuzzy search (Bitap). Not phonetic; `fuzzy.ts` already covers edit distance. | No |
| IndicXlit | https://github.com/AI4Bharat/IndicXlit | MIT (API) | ~146; push Oct 2023 (stale) | Neural transliteration for 21 languages. Too heavy; sanscript.js table is enough. | No |
| Kokoro | https://github.com/hexgrad/kokoro | Apache-2.0 (LICENSE; HF weights apache-2.0) | ~9.9k; push Aug 2025 | 82M TTS. Voice prefixes include Hindi (hf_/hm_); no Tamil. | No |
| Piper | https://github.com/rhasspy/piper | MIT (API) — **archived** | ~11.3k; archived | Local TTS. Successor https://github.com/OHF-Voice/piper1-gpl is **GPL-3.0**. Voice list: no Tamil. | No |
| sanscript.js | https://github.com/indic-transliteration/sanscript.js | MIT (API) | ~122; push Jun 2025 | Script tables; copy the Tamil table. | Yes (#1) |
| double-metaphone | https://github.com/words/double-metaphone | MIT (API) | ~99; push Nov 2022 | Reference for phonetic-key design. | Idea (#1) |
| libindic soundex | https://github.com/libindic/soundex | **LGPL-3.0** (API) | ~59; push Feb 2019 | Cross-script Indic soundex. Idea only. | Idea (#1) |
| Aksharamukha | https://github.com/virtualvinodh/aksharamukha | **Unverified** (API: none detected; LICENSE file not found at root) | ~222; push Mar 2025 | Script converter. Do not copy. | No |

### Dev test tools

| Name | URL | Licence | Maintenance | Fit | Used? |
|---|---|---|---|---|---|
| fast-check | https://github.com/dubzzz/fast-check | MIT (API) | ~5.2k; push Nov 2026 | Property tests for `tamilKey`, number-to-words and `verify.ts` (any fact formatted then verified must pass). | Recommended |
| @axe-core/playwright | https://github.com/dequelabs/axe-core-npm | **MPL-2.0** (LICENSE); axe-core also MPL-2.0 | ~730 (axe-core ~7.8k); push Nov 2026 | Accessibility scan inside existing Playwright tests. File-level copyleft: fine as an unmodified devDependency. | Recommended (dev only) |
| msw | https://github.com/mswjs/msw | MIT (API) | ~18.3k; push Oct 2026 | Mock Groq/Gemini HTTP in vitest; code already injects `fetcher`, so optional. | Optional |
| StrykerJS | https://github.com/stryker-mutator/stryker-js | Apache-2.0 (API) | ~3.3k; push Oct 2026 | Mutation testing; run on `verify.ts`, `fuzzy.ts`, `decide.ts` only (slow on the whole repo). | Optional |
