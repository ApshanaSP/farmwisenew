# 10 · Semantic end-of-turn detection and turn-taking prediction

Research date: 17 Nov 2026. Bounded web research (7 searches); nothing was downloaded or run.
Every number has its source URL next to it. "Inferred" marks my own reasoning or arithmetic.

Today's Jarvis: Silero VAD in an AudioWorklet (onnxruntime-web), then a fixed wait of 300 ms (words read complete) or 650 ms (after a connective), then the whole clip goes to Groq Whisper.

## Short answer

- The most useful drop-in is the **Smart Turn family** (audio-only, Whisper-tiny based, 8M params, ~8.7 MB int8 ONNX, BSD-2-Clause code and weights). It runs after VAD silence and says "done / not done".
- Upstream Smart Turn v3.2 has **no Tamil**. Zero-shot on Tamil telephone speech it scores only **70.30%** ([src](https://huggingface.co/santhosh-005/smart-turn-tamil)).
- Two community fine-tunes add Tamil, both tagged BSD-2-Clause: `adimyth/indic-smart-turn` (English + 11 Indian languages incl. Tamil, Tamil **85.9%**, [src](https://huggingface.co/adimyth/indic-smart-turn)) and `santhosh-005/smart-turn-tamil` (Tamil only, **83.71%** tiny int8, telephone audio, [src](https://huggingface.co/santhosh-005/smart-turn-tamil)). No model was found for Tamil-English code-mixing (Tanglish).
- **LiveKit's turn detectors are ruled out by licence.** The LiveKit Model License says the models "can only" be used "together with the LiveKit Agents framework" ([src](https://huggingface.co/livekit/turn-detector/blob/main/LICENSE)).
- On LiveKit's open benchmark (English, real user turns), Smart Turn v3.2 needs **956 ms** of dead air for a 10% false-cutoff rate, against **1130 ms** for a silence-only VAD ([src](https://github.com/livekit/eot-bench)). That is **174 ms** less (inferred, arithmetic). At a 300 ms budget, false cutoffs fall from **79.3%** to **46.8%** ([src](https://github.com/livekit/eot-bench)).
- The speed it buys is modest. The bigger gain is fewer cut-ins at the same wait. Jarvis's 300 ms wait already sits in the "fast but cut-in-prone" zone of that benchmark (inferred).

## 1. Pipecat Smart Turn (latest: v3.2)

| Item | Finding | Source |
|---|---|---|
| Latest version | v3.2 (README heading "Smart Turn v3.2"; HF files `smart-turn-v3.2-cpu.onnx`, `smart-turn-v3.2-gpu.onnx`, last commit "Smart Turn v3.2", about 10 months ago). No v4 found. | [GitHub](https://github.com/pipecat-ai/smart-turn), [HF files](https://huggingface.co/pipecat-ai/smart-turn-v3/tree/main) |
| Input | Audio only: "works directly with PCM audio samples, rather than text transcriptions". 16 kHz mono, up to 8 s, truncate from the start, zero-pad at the start. | [GitHub](https://github.com/pipecat-ai/smart-turn) |
| Text input | Not yet. "Text conditioning" is a medium-term goal. | [GitHub](https://github.com/pipecat-ai/smart-turn) |
| Architecture / size | Whisper Tiny encoder + linear classifier, "approximately 8M parameters". CPU file 8.68 MB (int8), GPU file 32.4 MB (fp32). | [GitHub](https://github.com/pipecat-ai/smart-turn), [HF files](https://huggingface.co/pipecat-ai/smart-turn-v3/tree/main) |
| Languages | 23: Arabic, Bengali, Chinese, Danish, Dutch, German, English, Finnish, French, Hindi, Indonesian, Italian, Japanese, Korean, Marathi, Norwegian, Polish, Portuguese, Russian, Spanish, Turkish, Ukrainian, Vietnamese. **No Tamil.** | [GitHub](https://github.com/pipecat-ai/smart-turn) |
| Accuracy v3.2 CPU | Overall 92.63% (31,527 samples, FPR 4.73%, FNR 2.64%). English 94.26% (FPR 3.75%, FNR 1.99%). Hindi 90.11% (FPR 8.57%, FNR 1.32%). Bengali 83.80% (FPR 10.90%). Marathi 82.43% (FPR 15.12%). | [benchmark](https://huggingface.co/pipecat-ai/smart-turn-v3/raw/main/benchmarks/smart-turn-v3.2-cpu.md) |
| Accuracy v3.1 | English 94.7% (8 MB CPU) and 95.6% (32 MB GPU); GPU model ~1 point better. | [v3.1 blog](https://www.daily.co/blog/improved-accuracy-in-smart-turn-v3-1/) |
| CPU latency v3.0 (incl. preprocessing) | 12.6 ms AWS c7a.2xlarge; 17.7 ms "Modal, 6 cores"; 33.8 ms t3.2xlarge; 59.8 ms c8g.medium; 94.8 ms t3.medium. | [v3 blog](https://www.daily.co/blog/announcing-smart-turn-v3-with-cpu-inference-in-just-12ms/) |
| CPU latency v3.1 8 MB | 9 ms c7a.2xlarge (+7 ms preprocessing); 37 ms c7a.medium (+7 ms); 57 ms c8g.medium (+9 ms). Recommends `OMP_NUM_THREADS=1`. | [v3.1 blog](https://www.daily.co/blog/improved-accuracy-in-smart-turn-v3-1/) |
| Other latency | "as little as 10ms on some CPUs, and under 100ms on most cloud instances"; ~65 ms on a Pipecat Cloud 1x instance. | [GitHub](https://github.com/pipecat-ai/smart-turn) |
| Laptop-class proxies | Same Whisper-tiny int8 architecture, fine-tuned: 83 ms p50, 1 thread, idle Intel i5-12450H, plus ~12 ms mel ([src](https://huggingface.co/santhosh-005/smart-turn-tamil)); 91 ms 1 thread / ~59 ms 4 threads on a "dev laptop CPU" ([src](https://huggingface.co/deveshu/hinglish-turn-detector)). Nothing measured on a Ryzen 5 5600H. | as listed |
| Licence (code) | LICENSE file: "BSD 2-Clause License", "Copyright (c) 2024–2025, Daily". | [LICENSE](https://github.com/pipecat-ai/smart-turn/blob/main/LICENSE) |
| Licence (weights) | HF card: "License: bsd-2-clause". README: "a truly open model (BSD 2-clause license)". Base is Whisper Tiny. | [HF card](https://huggingface.co/pipecat-ai/smart-turn-v3), [GitHub](https://github.com/pipecat-ai/smart-turn) |
| ONNX | Yes, only ONNX files on HF (v3.0, v3.1 cpu/gpu, v3.2 cpu/gpu). | [HF files](https://huggingface.co/pipecat-ai/smart-turn-v3/tree/main) |
| Raw-PCM export | `soniqo/Smart-Turn-v3.2-ONNX` embeds the log-mel front-end; input is raw 16 kHz PCM `[1, 128000]`. int8 93.00% vs fp32 92.90% on 1,000 test clips. 36.3 ms (fp32) / 37.3 ms (int8) mean, 2 threads, Apple M5 Pro. Tagged BSD-2-Clause. | [HF](https://huggingface.co/soniqo/Smart-Turn-v3.2-ONNX) |
| Browser | Yes, via `@micdrop/smart-turn` (MIT, v0.3.0, optional peers onnxruntime-web / onnxruntime-node ≥1.20.0). Uses WebGPU, falls back to WebAssembly. "about 25 ms on a graphics card", "a couple of hundred milliseconds on a processor". ONNX runtime allows one active session, so the VAD loses one window while Smart Turn runs. | [docs](https://micdrop.dev/docs/client/turn-detection), [npm](https://registry.npmjs.org/@micdrop/smart-turn/latest) |
| Pipecat defaults | VAD `stop_secs` "We recommend 0.2 seconds, which is the default value". Smart Turn fallback `stop_secs` 3.0, `pre_speech_ms` 500, `max_duration_secs` 8.0. Pipecat loads `smart-turn-v3.2-cpu.onnx` with `cpu_count=1`. | [docs](https://docs.pipecat.ai/server/utilities/turn-detection/smart-turn-overview), [source](https://reference-server.pipecat.ai/en/stable/_modules/pipecat/audio/turn/smart_turn/local_smart_turn_v3.html) |

## 2. LiveKit turn detector

| Item | Finding | Source |
|---|---|---|
| Text model (EOU) | Multilingual, based on Qwen2.5-0.5B-Instruct, "0.1B params" in metadata. Input: STT text, up to 6 turns, truncated to 128 tokens. INT8 ONNX `model_q8.onnx`. English-only model deprecated. | [HF card](https://huggingface.co/livekit/turn-detector) |
| Text model status | Deprecated: "slated for removal in version 2.0 of the LiveKit Agents SDK". 396 MB on disk, <500 MB RAM, "~50-160 ms" per turn on typical CPU (hardware not named). | [docs](https://docs.livekit.io/agents/build/turns/turn-detector/) |
| Text model languages | 14: English, Spanish, French, German, Italian, Portuguese, Dutch, Chinese, Japanese, Korean, Indonesian, Turkish, Russian, Hindi. **No Tamil.** | [HF card](https://huggingface.co/livekit/turn-detector) |
| Text model accuracy | TPR 99.3–99.4% all languages. TNR: Hindi 96.3%, English 87.0%, Italian 85.1% (lowest). v0.4.1: "39.23% relative improvement" on structured input. | [HF card](https://huggingface.co/livekit/turn-detector) |
| Original English EOU (2024) | 135M SmolLM v2, ~50 ms. "Reduces unintentional interruptions by 85%" vs VAD alone; "Falsely indicates that the turn is not over 3% of the time". No test set given. | [blog](https://livekit.com/blog/using-a-transformer-to-improve-end-of-turn-detection) |
| Audio model v1 / v1-mini (current) | Audio-based, no transcript. v1 runs on LiveKit Cloud; v1-mini runs locally on CPU, 140–250 MB RAM per copy. 14 languages incl. Hindi and Arabic, **no Tamil**. With it, endpointing `min_delay` 0.3 s, `max_delay` 2.5 s (standard 0.5 s / 3.0 s). | [docs](https://docs.livekit.io/agents/build/turns/turn-detector/) |
| v1 benchmark (blog) | 9.9% false cutoffs at a 300 ms budget; 4.5% at 600 ms; 543 ms mean latency at 5% false cutoffs; 295 ms at 10%. | [blog](https://livekit.com/blog/solving-end-of-turn-detection) |
| **Licence (weights)** | "LIVEKIT MODEL LICENSE AGREEMENT": "can only use them together with the LiveKit Agents framework"; "not to use any LiveKit Models on a standalone basis or with any frameworks other than LiveKit Agents"; outputs may not be used to develop non-LiveKit models; terminates on breach. Docs say this licence covers the text model and v1-mini. v1-mini code is Apache-2.0. | [LICENSE](https://huggingface.co/livekit/turn-detector/blob/main/LICENSE), [docs](https://docs.livekit.io/agents/build/turns/turn-detector/), [blog](https://livekit.com/blog/solving-end-of-turn-detection) |
| Verdict | **Not usable.** Jarvis does not use LiveKit Agents; the licence is not on the allowed list. | inferred from the licence text |

## 3. Silero VAD

| Item | Finding | Source |
|---|---|---|
| Current version | 6.2.3, 23 Sep 2026 (6.2.0: 6 Nov 2025; 6.0.0: 26 Aug 2025). | [PyPI](https://pypi.org/project/silero-vad/) |
| Licence | LICENSE file: "MIT License", "Copyright (c) 2020-present Silero Team". (One badge's alt text says CC BY-NC 4.0; the LICENSE file and PyPI metadata say MIT.) | [LICENSE](https://github.com/snakers4/silero-vad/blob/master/LICENSE), [PyPI](https://pypi.org/project/silero-vad/) |
| Frame size | 512 samples at 16 kHz, 256 at 8 kHz ("Supported values: 256 for 8000 sample rate, 512 for 16000"). 512 / 16000 = 32 ms (inferred, arithmetic). | [utils_vad.py](https://github.com/snakers4/silero-vad/blob/master/src/silero_vad/utils_vad.py) |
| Latency | "One audio chunk (30+ ms) takes less than **1ms** to be processed on a single CPU thread" (CPU not named). JIT model "around two megabytes". | [GitHub](https://github.com/snakers4/silero-vad) |
| Defaults | `VADIterator`: threshold 0.5, `min_silence_duration_ms` 100, `speech_pad_ms` 30. | [utils_vad.py](https://github.com/snakers4/silero-vad/blob/master/src/silero_vad/utils_vad.py) |
| v6 quality | v6.0: "16% less errors on noisy real-life data", "11% less errors on multi-domain validation". v6.2: "slight quality improvement (no metrics update)", better on phone calls and unusual voices. | [releases](https://github.com/snakers4/silero-vad/releases) |
| Browser | No official JS; links the community ONNX Runtime Web project ricky0123/vad. | [GitHub](https://github.com/snakers4/silero-vad) |

## 4. Papers on turn-taking prediction

| Work | What it reports | Source |
|---|---|---|
| Voice Activity Projection, Ekstedt & Skantze 2022 | Self-supervised: predicts both speakers' future voice activity. Abstract has no numbers. Repo MIT, stereo input (mono gets a silent second channel), 50 Hz, 2 s projection window; a checkpoint is in the repo, its weights licence is not stated. | [arXiv](https://arxiv.org/abs/2205.09812), [repo](https://github.com/ErikEkstedt/VoiceActivityProjection) |
| Real-time VAP, Inoue et al. IWSDS 2024 | Xeon Gold 6128 CPU. 1 s context: 14.61 ms/frame, RTF 0.73, balanced accuracy 76.16% (Japanese). 20 s context: 273.84 ms/frame, RTF 13.69. Accuracy drops below 0.3 s context. English and Mandarin "similar". | [arXiv HTML](https://arxiv.org/html/2401.04868) |
| VAP on eot-bench | "VAP (silent agent)": 1048 ms at 10% false cutoffs vs 1130 ms VAD baseline; 63.5% false cutoffs at 300 ms. | [eot-bench](https://github.com/livekit/eot-bench) |
| TurnGPT, Ekstedt & Skantze 2020 | Text-only transformer LM for turn-taking; "outperforms two baselines". No numbers in abstract. | [arXiv](https://arxiv.org/abs/2010.10874) |
| Semantic VAD, Shi et al. Interspeech 2023 | "can reduce the average latency by 53.3%" vs VAD that waits for a preset tail silence; no significant CER loss. Internal dataset. | [arXiv](https://arxiv.org/abs/2305.12450) |
| Unified ASR + endpointing, Bijwadia et al. SLT 2022 (Google) | "reduces median endpoint latency by 120 ms (30.8% reduction)"; p90 "170 ms (23.0% reduction)"; no WER regression on voice search. | [arXiv](https://arxiv.org/abs/2211.00786) |
| Endpoint Anticipation, Udupa et al. Jun 2026 | Speech model forecasts endpoints "up to 2.56 seconds in advance"; "505 ms average latency reduction" in Unmute, at "28.4% increase in speculative computation". No licence stated. | [arXiv](https://arxiv.org/abs/2606.13450) |
| Acoustic + LLM fusion, Wang et al. ICASSP 2024 (Amazon) | Fusion beats single-modality baselines on Switchboard. No numbers in abstract. | [arXiv](https://arxiv.org/abs/2401.14717) |
| FastTurn, 2026 | Streaming CTC + acoustic features + LLM. Abstract has no numbers. | [arXiv](https://arxiv.org/abs/2604.01897) |
| Thai text EOT, ICSEC 2025 | Text-only, uses language-specific sentence-final particles. Says silence end-pointers "add hundreds of milliseconds of delay". No numbers in abstract. A useful pattern for Tamil, which ends sentences on verb forms (inferred). | [arXiv](https://arxiv.org/abs/2510.04016) |

**eot-bench (LiveKit, Apache-2.0 code), English, real human-to-agent turns.** Latency = "the time the agent waits after a true turn ending before taking the floor". Smart Turn scores are read at the 0.2 s silence point ([src](https://github.com/livekit/eot-bench)).

| Model | False cutoffs @300 ms | @600 ms | Latency @5% | Latency @10% | Usable here? |
|---|---|---|---|---|---|
| VAD baseline (silence only) | 79.3% | 33.4% | 1600 ms | 1130 ms | yes (today's approach) |
| SmartTurn v3.2 | 46.8% | 22.9% | 1384 ms | 956 ms | yes (BSD-2) |
| VAP (silent agent) | 63.5% | 29.0% | 1724 ms | 1048 ms | weights licence unclear |
| LiveKit v1.1-mini | 25.6% | 12.9% | 1124 ms | 738 ms | no (licence) |
| LiveKit v1.1 | 13.4% | 7.5% | 810 ms | 414 ms | no (licence, cloud) |
| OpenAI GPT Realtime 2 | – | – | 2000 ms | 959 ms | no (paid) |

All numbers from [eot-bench](https://github.com/livekit/eot-bench). Caveat: LiveKit made the benchmark and tops it. Its v1 blog numbers (9.9% at 300 ms) differ from this table (v1.1 13.4%); likely a different version or language pool (inferred).

## 5. Realtime APIs (published docs)

| API | Setting | Value | Source |
|---|---|---|---|
| OpenAI Realtime `server_vad` | `threshold` | "defaults to 0.5" | [javadoc](https://javadoc.io/static/com.openai/openai-java/4.7.2/com/openai/models/realtime/RealtimeSession.TurnDetection.ServerVad.html) |
| | `prefix_padding_ms` | "Defaults to 300ms" | same |
| | `silence_duration_ms` | "Defaults to 500ms" | same |
| OpenAI `semantic_vad` | method | "uses a model to determine when the user has finished speaking"; low completion probability → waits for a timeout, high → waits less | [guide](https://developers.openai.com/api/docs/guides/realtime-vad), [javadoc](https://javadoc.io/static/com.openai/openai-java/4.7.2/com/openai/models/realtime/RealtimeSession.TurnDetection.SemanticVad.html) |
| | `eagerness` | `auto` (default) = `medium`. "`low`, `medium`, and `high` have max timeouts of 8s, 4s, and 2s respectively." | [javadoc](https://javadoc.io/static/com.openai/openai-java/4.7.2/com/openai/models/realtime/RealtimeSession.TurnDetection.SemanticVad.html) |
| Gemini Live `automaticActivityDetection` | `disabled` | false by default (VAD on) | [API ref](https://aistudio.google.com/api-reference/live) |
| | `startOfSpeechSensitivity` | `START_SENSITIVITY_HIGH` (default) or `_LOW` | same |
| | `endOfSpeechSensitivity` | `END_SENSITIVITY_HIGH` (default, "ends speech more often") or `_LOW` | same |
| | `silenceDurationMs` | server default "approximately 800ms"; recommends 500–800 ms; 100–200 ms "split utterances at natural pauses"; ≥2000 ms adds perceived latency | [capabilities](https://aistudio.google.com/docs/live-api/capabilities) |
| | manual mode | client sends `activityStart`/`activityEnd`; client end threshold should be at least 500 ms | same |
| | barge-in | default `START_OF_ACTIVITY_INTERRUPTS` | [API ref](https://aistudio.google.com/api-reference/live) |

Note: Jarvis's 300 ms "complete" wait is below both providers' silence defaults (500 ms OpenAI, ~800 ms Gemini). It is safe only because of the text-completeness rule (inferred).

## 6. End-of-turn models with Tamil or Indic support

| Model | Langs | Accuracy | Size / speed | Licence (card field) | Source |
|---|---|---|---|---|---|
| `adimyth/indic-smart-turn` (whisper-base; tiny and base, int8/fp32 ONNX) | English + Hindi, Marathi, Bengali, **Tamil**, Telugu, Kannada, Malayalam, Gujarati, Punjabi, Odia, Assamese | Tamil 85.9% (base fp32, TamilEOT test). Other languages only in charts. | "under 50 ms on one CPU core"; sizes not stated | bsd-2-clause; data CC BY 4.0 (IndicVoices; credit AI4Bharat) | [HF](https://huggingface.co/adimyth/indic-smart-turn) |
| `santhosh-005/smart-turn-tamil` | Tamil only | tiny int8 83.71% (AUC 0.905); base int8 86.13%. Smart Turn v3.2 zero-shot 70.30% (AUC 0.751). | tiny int8 8.7 MB, 83 ms p50 (1 thread, i5-12450H) + ~12 ms mel; base int8 21 MB, 143 ms | BSD-2-Clause; data from SPRING_INX Tamil R1 (CC BY 4.0) | [HF](https://huggingface.co/santhosh-005/smart-turn-tamil), [paper](https://arxiv.org/abs/2609.05631) |
| `deveshu/hinglish-turn-detector` | English, Hindi, Hinglish | Hinglish 0.951 (TTS-synthetic, n=225); real voice 0.800 (one speaker, n=30) | int8 8.50 MB, 91 ms 1 thread; distilled 1.28 MB, 14 ms, 0.896 | MIT | [HF](https://huggingface.co/deveshu/hinglish-turn-detector) |
| `codewithmoin/smart-turn-hinglish` | English, Hindi | Hindi 93.9% vs 92.8% for v3.2 | ~7.8M params; ~38 ms (8 s window), ~17 ms (4 s) | bsd-2-clause | [HF](https://huggingface.co/codewithmoin/smart-turn-hinglish) |
| Pipecat Smart Turn v3.2 | Hindi, Bengali, Marathi (no Tamil) | Hindi 90.11%, Bengali 83.80%, Marathi 82.43% | 8.68 MB | BSD-2-Clause | [benchmark](https://huggingface.co/pipecat-ai/smart-turn-v3/raw/main/benchmarks/smart-turn-v3.2-cpu.md) |
| LiveKit (text, v1) | Hindi (no Tamil) | Hindi TPR 99.4%, TNR 96.3% | — | LiveKit Model License (blocked) | [HF](https://huggingface.co/livekit/turn-detector) |

Limits: the Tamil-only model is trained on narrowband telephone speech; its card says wideband or close-mic speech is out of distribution ([src](https://huggingface.co/santhosh-005/smart-turn-tamil)). Its int8 graphs need onnxruntime 1.24 or later (same source). Indic Smart Turn's data is mostly real Indian phone conversations from IndicVoices and TamilEOT ([src](https://huggingface.co/adimyth/indic-smart-turn)). No Tanglish (Tamil-English) model or dataset was found.

## 7. Techniques compared for Jarvis

| Technique | Expected saving | Evidence | Licence | Runs here? | Cost | Risk |
|---|---|---|---|---|---|---|
| A. Smart Turn v3.2 (8.68 MB int8) as a second opinion at a 200 ms silence point | English: 174 ms less dead air at 10% false cutoffs, 216 ms at 5% (inferred, arithmetic on [eot-bench](https://github.com/livekit/eot-bench)). Tamil: not found. | eot-bench; Pipecat recommends VAD stop 0.2 s ([docs](https://docs.pipecat.ai/server/utilities/turn-detection/smart-turn-overview)) | BSD-2-Clause (file + card) | Browser: yes via onnxruntime-web, WASM "a couple of hundred milliseconds" ([Micdrop](https://micdrop.dev/docs/client/turn-detection)). Node: yes (onnxruntime-node peer, [npm](https://registry.npmjs.org/@micdrop/smart-turn/latest)). | Free; 9–95 ms on cloud CPUs, ~83–95 ms laptop proxy (sources in section 1). No measurement on the 5600H. | No Tamil; 70.30% zero-shot on Tamil. Browser WASM time may cancel the saving. Sharing onnxruntime with Silero costs the VAD a window. |
| B. `adimyth/indic-smart-turn` (same runtime) | Not found | Tamil 85.9% ([HF](https://huggingface.co/adimyth/indic-smart-turn)) | bsd-2-clause (card field); data CC BY 4.0 | Same as A (needs log-mel 80×800 in JS or Node; inferred) | Free; "under 50 ms on one CPU core" | Phone-call training data; single-author community model; no Tanglish; English accuracy not read. |
| C. `santhosh-005/smart-turn-tamil` | Not found | 83.71% Tamil, 8 kHz telephone ([HF](https://huggingface.co/santhosh-005/smart-turn-tamil)) | BSD-2-Clause (card field) | Same as B; needs onnxruntime ≥1.24 | Free; 83 ms + 12 ms mel on a laptop | Out of domain for a laptop mic; Tamil only. |
| D. LiveKit text EOU or v1-mini | v1.1-mini 738 ms vs 1130 ms at 10% (eot-bench) | [eot-bench](https://github.com/livekit/eot-bench) | LiveKit Model License | Technically yes (ONNX) | Free | **Licence forbids use outside LiveKit Agents. Do not use.** |
| E. Probability → dynamic wait (OpenAI `semantic_vad` pattern: short wait when sure, long cap when not) | Not found as a number | OpenAI caps 8 s / 4 s / 2 s by eagerness ([javadoc](https://javadoc.io/static/com.openai/openai-java/4.7.2/com/openai/models/realtime/RealtimeSession.TurnDetection.SemanticVad.html)); LiveKit 0.3–2.5 s with model ([docs](https://docs.livekit.io/agents/build/turns/turn-detector/)) | n/a (a policy) | Yes | None | Jarvis's 300/650 ms rule is already a crude version; replacing the word rule with a probability needs a model (A/B). |
| F. Text-based EOU with an LLM (TurnGPT style), e.g. prompt Groq on the partial transcript | 85% fewer unintended interruptions vs VAD alone, English ([LiveKit blog](https://livekit.com/blog/using-a-transformer-to-improve-end-of-turn-detection)); 53.3% latency cut ([Semantic VAD](https://arxiv.org/abs/2305.12450)) | Papers and vendor blogs above | No permissive Tamil/Tanglish text EOU model found | Only via a network LLM call (inferred) | One extra Groq call per pause (inferred); free-tier limits | Needs a transcript before the turn ends, which today's flow (Whisper after the end) does not have (inferred). Network time can exceed the saving. |
| G. Speculative transcription: send the clip to Whisper at the first short silence and throw it away if the user keeps talking | 505 ms average in Unmute ([Endpoint Anticipation](https://arxiv.org/abs/2606.13450)); 120 ms median with joint ASR + endpointing ([Bijwadia](https://arxiv.org/abs/2211.00786)) | Papers | n/a (a policy) | Yes (inferred) | +28.4% speculative compute in the paper; for Jarvis, more Groq requests (inferred) | Groq free-tier rate limits; wasted calls on false starts. |
| H. VAP | 82 ms less than VAD baseline at 10% (inferred, arithmetic on eot-bench) | eot-bench; real-time on CPU with 1 s context ([Inoue](https://arxiv.org/html/2401.04868)) | Code MIT; weights licence not stated | Probably (PyTorch; ONNX not found) | Free | Weaker than Smart Turn on eot-bench; dialogue-trained; training-data licence unknown. Not recommended. |

## What this means for Jarvis (inferred)

1. Run a Smart Turn-family model as a **second opinion**, not a replacement. At ~200 ms of Silero silence, score the last ≤8 s. If "complete" with high confidence, end now. If not, keep waiting up to a cap. This is the Pipecat and LiveKit pattern.
2. Pick between upstream v3.2 (English + Hindi measured) and `indic-smart-turn` (Tamil measured) **only after scoring both on our own English, Tamil and Tanglish clips**. No public number covers Tanglish or laptop-mic Tamil.
3. Run it **outside the AudioWorklet** (a Web Worker, or the Node server), so it does not block Silero. The raw-PCM export (`soniqo`) avoids writing a log-mel front-end. Measure on the 5600H: browser WASM time ("a couple of hundred milliseconds" per Micdrop) may erase the gain.
4. Expect the main win to be **fewer false cut-ins** at a similar wait, plus a shorter wait after connectives when the model is sure. On the 300 ms "complete" path the most it can save is ~100 ms (300 → 200 ms), minus inference time.
5. Speculative Whisper calls (G) may save more milliseconds than any turn model, but cost Groq quota. Weigh against rate limits.

## Not verified

- Smart Turn v3.2 vs v3.1 changelog: no source found for what changed in v3.2.
- The definition of "false positive" in the Smart Turn benchmark tables (I assume positive = "turn complete", so FPR = early cut-in).
- Any Smart Turn or Indic model timing on a Ryzen 5 5600H, in Edge/Chrome WASM, or in onnxruntime-node on Windows. None was run.
- LICENSE *files* (not just card fields) for `adimyth/indic-smart-turn`, `santhosh-005/smart-turn-tamil`, `deveshu/hinglish-turn-detector`, `codewithmoin/smart-turn-hinglish`, `soniqo/Smart-Turn-v3.2-ONNX`. Only the HF licence fields/tags were read.
- Licence of the Smart Turn training data (CC BY 4.0 per the indic-smart-turn card, not checked on the dataset page) and of IndicVoices / SPRING_INX (stated by model cards only).
- Whisper Tiny / Whisper Base weight licence (believed MIT; not opened here).
- `indic-smart-turn` accuracy for English and the other Indic languages (shown only as charts), and its file sizes.
- Hindi 92.8% for Smart Turn v3.2 in the codewithmoin card vs 90.11% in Pipecat's own v3.2-cpu table: different test slice or model file, not resolved.
- LiveKit v1 blog numbers vs eot-bench v1.1 numbers: not reconciled. eot-bench's VAD baseline settings are not named.
- VAP weights licence and training data (likely Switchboard/Fisher, not checked); the MaAI real-time VAP toolkit was not checked.
- FastTurn latency figures (a search snippet quoted 120.1 ms vs 297.1 ms; not read in the paper).
- Whether ricky0123/vad (the browser Silero wrapper) has moved to Silero v6, and which Silero file Jarvis loads today.
- LiveKit community thread on Tamil turn detection (found by search, not opened).
- Groq free-tier rate limits for speculative calls (out of scope here).
