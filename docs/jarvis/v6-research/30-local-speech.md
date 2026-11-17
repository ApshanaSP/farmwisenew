# 30 — On-device wake word, streaming STT and local TTS

Research date: 17 Nov 2026. Read-only research. Nothing was installed, built or run against the app.
Target: Edge/Chrome on Windows 11, Ryzen 5 5600H (x86-64, AVX2), Next.js 15.5 / React 19.
The page already runs Silero VAD on onnxruntime-web in an AudioWorklet.
Rule used for licences: the file or card was read. "Tag only" means a metadata tag with no licence file.
"Inferred" marks my own reasoning. Every number has its source URL next to it.

## Short answer

| Need | Best permissive pick | Licence (code / weights) | Download | Runs here |
|---|---|---|---|---|
| Wake word "Hey Jarvis" | LiveKit `hey_jarvis.onnx` (livekit-wakeword v2.1.2) | Apache-2.0 / Apache-2.0 (NOTICE file) | 7,406,177 bytes | Browser, on onnxruntime-web |
| Wake word, any phrase ("HI JARVIS") | sherpa-onnx KWS, zipformer GigaSpeech 3.3M | Apache-2.0 / Apache-2.0 tag only (training-data terms are non-commercial) | about 5.5 MB int8 model + about 12 MB wasm (inferred) | Browser, but you must compile the wasm yourself |
| Short English TTS | Piper `en_US-ljspeech-medium` (public-domain data) or Kokoro-82M | MIT (archived engine) / public domain data; Kokoro Apache-2.0 / Apache-2.0 | 21,090,429 bytes (Piper int8, sherpa) ; 92,361,116 bytes (Kokoro q8) | Browser via WASM |
| Short Tamil TTS | `sulabhkatiyar/indic-tiny-tts-tamil` (Matcha + Vocos, ONNX) | MIT / CC-BY-4.0 (LICENSE.md read) | 91,006,423 bytes (3 ONNX files) | onnxruntime (Python shown); browser port needed |
| Tamil streaming STT | None found with a permissive licence | — | — | — |

## 1. sherpa-onnx keyword spotting (KWS)

### Engine licence
- sherpa-onnx is Apache-2.0. Read: https://github.com/k2-fsa/sherpa-onnx/blob/master/LICENSE
- npm `sherpa-onnx` 2.0.1 is Apache-2.0, 15,450,801 bytes unpacked; its metadata does not mention KWS. https://registry.npmjs.org/sherpa-onnx/latest
- npm `sherpa-onnx-node` 2.0.1 (native addon) is Apache-2.0. https://registry.npmjs.org/sherpa-onnx-node/latest

### Pre-trained KWS models
Source for names, sizes and latency: https://k2-fsa.github.io/sherpa/onnx/kws/pretrained_models/index.html
Archive sizes: https://github.com/k2-fsa/sherpa-onnx/releases/tag/kws-models (read through the GitHub API).

| Model | Language | Training data | Archive (bytes) | Licence |
|---|---|---|---|---|
| sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01 | English | GigaSpeech XL, 10,000 h | 17,626,723 (mobile: 15,667,804) | Card front-matter "Apache License 2.0"; no LICENSE file in the repo file list |
| sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01 | Chinese | WenetSpeech L, 10,000 h | 32,654,866 (mobile: 15,292,881) | Not checked |
| sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20 | Chinese + English | Not stated | 32,885,699 | Not found (no card read) |

GigaSpeech model files, from the ModelScope file list
(https://www.modelscope.cn/models/pkufool/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01):
- encoder int8 4,807,159 bytes; decoder int8 277,985; joiner int8 163,380; bpe.model 244,837; tokens.txt 5,006.
- int8 set total: 5,498,367 bytes (my sum).
- fp32 encoder 12,174,219 bytes.
- The card (README.md, 743 bytes) says licence "Apache License 2.0" in its front-matter. No LICENSE file is listed.

Training-data risk:
- GigaSpeech audio access terms say "Researcher shall use the Database only for non-commercial research and educational purposes."
  https://huggingface.co/datasets/speechcolab/gigaspeech
- So the weights are tagged Apache-2.0, but they were trained on non-commercial-access audio. Whether that binds the weights is a legal question. Flag it to the owner.

### How custom keywords are written
Source: https://k2-fsa.github.io/sherpa/onnx/kws/index.html
- One keyword per line, as model tokens. Example from the docs: `▁HE LL O ▁WORLD :1.5 #0.35` and `▁HE Y ▁S I RI`.
- `:x` is the per-keyword boosting score. Higher means easier to trigger.
- `#x` is the per-keyword trigger threshold (0 to 1). Lower means easier to trigger.
- `@NAME` is the display name. Keywords cannot contain spaces, so use `@HI_JARVIS`.
- Convert plain text to tokens with `sherpa-onnx-cli text2token --tokens-type bpe --bpe-model bpe.model`
  (https://k2-fsa.github.io/sherpa/onnx/kws/pretrained_models/index.html).
- So "HI JARVIS" and "HEY JARVIS" can both go in one file. Their accuracy was not measured anywhere I found.
- The WASM config object also has `modelingUnit` and `bpeVocab` fields
  (https://github.com/k2-fsa/sherpa-onnx/blob/master/wasm/kws/sherpa-onnx-kws.js). Inferred: these may let the page pass plain text keywords without pre-tokenising. Not verified.
- WASM defaults: `keywordsScore: 1.0`, `keywordsThreshold: 0.25`, `maxActivePaths: 4`, `numTrailingBlanks: 1` (same file).
- Keywords are fixed when the spotter is created; `createStream()` takes no keyword argument (same file).

### Reported latency and false alarms
- zh-en model: "The `chunk_size=8` model has a latency of 160ms", chunk 16 has 320 ms.
  https://k2-fsa.github.io/sherpa/onnx/kws/pretrained_models/index.html
- GigaSpeech model latency: not found. Inferred: it is a chunk-16 model (file names say `chunk-16`), so probably similar to 320 ms. Not verified.
- GigaSpeech KWS results (https://github.com/k2-fsa/icefall/blob/master/egs/gigaspeech/KWS/RESULTS.md):
  - Small set, 20 commands, negatives = 40 h of GigaSpeech test: original model recall 86%, 1 false alarm in 40 h (0.025 per hour). Fine-tuned: 98.7%, 0.6 per hour.
  - Large set, 200+ commands, 23 h negatives: original 83.6% recall, 0.45 false alarms per hour. Fine-tuned 97.9%, 1.3 per hour.
  - These are generic commands, not "Jarvis".

### Ready-made WebAssembly KWS build?
- Source exists: `wasm/kws/` (app.js, index.html, sherpa-onnx-kws.js, CMakeLists.txt) and `build-wasm-simd-kws.sh`.
  https://github.com/k2-fsa/sherpa-onnx/tree/master/wasm/kws
- The build script asks for emscripten; "emsdk 4.0.23 is known to work".
  https://github.com/k2-fsa/sherpa-onnx/blob/master/build-wasm-simd-kws.sh
- The demo's default model is the Chinese WenetSpeech one (assets/README.md). The English model must be swapped in.
  https://github.com/k2-fsa/sherpa-onnx/blob/master/wasm/kws/assets/README.md
- No prebuilt KWS wasm found:
  - Release v2.0.1 has 295 assets; wasm assets cover forced alignment, TTS, VAD, TEN-VAD and speech enhancement. None is KWS.
    https://github.com/k2-fsa/sherpa-onnx/releases/tag/v2.0.1
  - The README's 25 WebAssembly demos include no KWS demo. https://github.com/k2-fsa/sherpa-onnx
  - Hugging Face search of k2-fsa spaces for "kws" and "keyword" returned nothing (https://huggingface.co/api/spaces?author=k2-fsa&search=kws).
  - No npm package for the browser KWS build was found.
- Expected download size (inferred): the VAD wasm build is 12,571,916 bytes
  (https://huggingface.co/spaces/k2-fsa/web-assembly-vad-sherpa-onnx). A KWS build should be of the same order, plus the 5.5 MB int8 model. Not measured.
- The CMake file sets `INITIAL_MEMORY=512MB`, `ALLOW_MEMORY_GROWTH=1` and `--preload-file` for the model
  (https://github.com/k2-fsa/sherpa-onnx/blob/master/wasm/kws/CMakeLists.txt).
- Inferred from `cmake/onnxruntime-wasm-simd.cmake` in the repo: sherpa-onnx links its own onnxruntime into the wasm. If so, it would not touch the page's `node_modules/onnxruntime-web` and could not repeat the Silero breakage.

### Web Worker / AudioWorklet
- The demo captures audio with a ScriptProcessorNode and runs KWS on the main thread (app.js).
  https://github.com/k2-fsa/sherpa-onnx/blob/master/wasm/kws/app.js
- Inferred: an emscripten module can run in a Web Worker, fed 16 kHz frames from the existing AudioWorklet over a MessagePort.
- Inferred: running it inside the AudioWorklet itself is risky (512 MB initial memory, preloaded data file, no fetch in the worklet scope). Not tested.

## 2. Other on-device wake-word options

| Option | Code licence | Weights licence | "Jarvis" model | Runs in browser | Size | Verdict |
|---|---|---|---|---|---|---|
| LiveKit `livekit-wakeword` v2 | Apache-2.0 (LICENSE) | Apache-2.0: NOTICE says "the model weights (*.onnx, *.tflite, encoders.tar.gz) are licensed under the Apache License, Version 2.0" | `hey_jarvis.onnx` | Yes, `@livekit/wakeword` (onnxruntime-web) | 7,406,177 bytes | Permissive both. Best fit. |
| sherpa-onnx KWS | Apache-2.0 | Apache-2.0 tag only; GigaSpeech terms non-commercial | Any text | Yes, after a self-build | about 5.5 MB model | Permissive on paper; data risk; build needed |
| openWakeWord | Apache-2.0 | CC BY-NC-SA 4.0 | `hey_jarvis` | Not official | Not stated | Excluded (non-commercial weights) |
| `openwakeword-wasm-browser` (npm) | MIT | Ships openWakeWord models (NC) | `hey_jarvis` | Yes | 19,050,302 bytes unpacked | Excluded (same NC weights) |
| microWakeWord / ESPHome models | Apache-2.0 | Apache-2.0 (repo LICENSE) | `hey_jarvis.tflite` v2 | No browser runtime noted; TFLite Micro for ESP32 | 52,272 bytes | Permissive, but a TFLite + front-end port is needed |
| Mycroft Precise | Apache-2.0 | Not found (precise-data repo not reachable) | `hey-mycroft` only | No; "designed to run on Linux" | Not found | Not suitable |
| EfficientWord-Net | Apache-2.0 (LICENSE.md) | Inside the repo (inferred Apache-2.0); trained on MLCommons Multilingual Spoken Words | Few-shot: user records 3-4 samples | Python + TFLite; a browser demo page exists | Not found | Possible, unproven |
| Porcupine (Picovoice) | Apache-2.0 SDK | Needs an AccessKey "obtained from Picovoice Console" | Built-in keywords | Yes, `@picovoice/porcupine-web` | 14,391,530 bytes unpacked | Excluded (account needed) |

Sources:
- LiveKit repo, figures and NOTICE: https://github.com/livekit/livekit-wakeword , https://github.com/livekit/livekit-wakeword/blob/main/NOTICE , release https://github.com/livekit/livekit-wakeword/releases/tag/v2.1.2
- LiveKit JS client README: https://github.com/livekit/livekit-wakeword/blob/main/client/js/README.md
- openWakeWord README: https://github.com/dscripka/openWakeWord
- openwakeword-wasm-browser: https://registry.npmjs.org/openwakeword-wasm-browser/latest
- microWakeWord: https://github.com/kahrendt/microWakeWord ; models https://github.com/esphome/micro-wake-word-models (models/v2/hey_jarvis.json: `probability_cutoff` 0.97)
- Mycroft Precise: https://github.com/MycroftAI/mycroft-precise (last push 2023-11-25)
- EfficientWord-Net: https://github.com/Ant-Brain/EfficientWord-Net
- Porcupine: https://github.com/Picovoice/porcupine ; npm https://registry.npmjs.org/@picovoice/porcupine-web/latest

### LiveKit details (the best permissive option)
- Ready-made models in release v2.1.2: `hey_jarvis.onnx` 7,406,177 bytes, `hey_jarvis_micro.tflite` 451,032 bytes. https://github.com/livekit/livekit-wakeword/releases/tag/v2.1.2
- Download URL: https://github.com/livekit/livekit-wakeword/releases/download/v2.1.2/hey_jarvis.onnx
- Speed: "one 80 ms step takes about 1 ms in WebAssembly" (JS client README). The repo README says 16.5 ms of CPU per second of audio for the standard model.
- Accuracy (LiveKit's own bench, which "may favor its models"): hey_livekit 89% recall at 0.5 false alarms per hour; bench score hey_jarvis 0.914 (standard). Shipped models: 0.5 to 2.5 false alarms per hour on conversational speech at threshold 0.5. https://github.com/livekit/livekit-wakeword
- Browser: "captures audio with an AudioWorklet, resamples it to 16 kHz and runs the model on the main thread". onnxruntime-web wasm is "about 15 MB (4 MB gzipped)" (JS client README).
- Training data: synthetic speech from LiveKit Inference TTS, plus about 4 GB of unnamed noise and speech sources (repo README). The NOTICE says the models "were trained in part on synthetic speech".
- Risk: the model is for "Hey Jarvis". "Hi Jarvis" was not measured. Training a new phrase uses LiveKit Inference TTS (inferred: that needs a LiveKit account).

### Why the earlier `@livekit/wakeword` install broke Silero (inferred)
- `@livekit/wakeword` 2.1.2 declares optional peers `onnxruntime-web ^1.31.1` and `onnxruntime-node ^1.31.1`. https://registry.npmjs.org/@livekit/wakeword/2.1.2
- This project's top-level `onnxruntime-web` is `1.31.0-dev.20260914-8d85527a0` (read from node_modules). `@huggingface/transformers` 4.3.2 pins exactly that version. https://registry.npmjs.org/@huggingface/transformers/latest
- A prerelease `1.31.0-dev` does not satisfy `^1.31.1`. Inferred: npm installed 1.31.1 to meet the peer and re-arranged where the two copies live.
- Inferred ways round it (not tested): load `hey_jarvis.onnx` with the page's existing onnxruntime-web and vendor the small Apache-2.0 client code (the whole npm package is 52,975 bytes unpacked), or install with a peer override. The client's feature front-end must come along; whether the ONNX file expects raw audio or features is not stated in the README.

## 3. Streaming / local speech-to-text

| Option | Code licence | Weights licence | Languages | Latency (source) | Size | Runs here |
|---|---|---|---|---|---|---|
| sherpa-onnx streaming zipformer en 2023-06-26 | Apache-2.0 | Apache-2.0 tag only | English | Not found | encoder int8 71,082,637 + decoder int8 1,307,236 + joiner int8 259,335 bytes | WASM (self-build or demo space), Node |
| Moonshine streaming (Tiny/Small/Medium) | MIT | MIT for all streaming and English models | No Tamil | Linux x86: Tiny 69 ms, Small 165 ms, Medium 269 ms (vendor) | Tiny 34 M params | JS/WASM listed |
| Moonshine legacy non-English non-streaming | MIT | Moonshine Community License (non-commercial) | Arabic, Japanese, Korean, Mandarin, Spanish, Ukrainian, Vietnamese | — | — | Excluded |
| Whisper via transformers.js | Apache-2.0 (transformers.js) | `openai/whisper-tiny`, `whisper-base`: Apache-2.0 tag | Multilingual incl. Tamil (not verified here) | Whisper Tiny 1,141 ms on Linux x86, native, vendor table; browser figure not found | Not checked | WASM/WebGPU; already a dependency |
| IndicConformer CTC (sherpa export) | Apache-2.0 tag (repack) | Source MIT (AI4Bharat) | Tamil + 21 others | Not found | ta int8 197,595,513 bytes | sherpa-onnx OfflineRecognizer (not streaming) |
| Parakeet Tamil "kili" | — | CC-BY-SA-4.0 tag | Tamil, Tanglish data | Not found | — | ShareAlike: not on the allowed list |
| Thedal Tamil/Tanglish AED | — | "Research-Only Noncommercial License" (LICENSE read) | Tamil, Tanglish, English | — | — | Excluded |
| Kyutai STT | MIT (Python) / Apache-2.0 (Rust) | CC-BY 4.0 | English, French | 0.5 s delay (1B), 2.5 s (2.6B) | about 1B / 2.6B params | No CPU or WASM path mentioned |

Sources:
- sherpa streaming zipformer: https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26
- The README lists an English streaming WASM space (https://huggingface.co/spaces/k2-fsa/web-assembly-asr-sherpa-onnx-en), but the Hugging Face API refused it to an anonymous client. Not checked.
- Moonshine licence (read): https://github.com/moonshine-ai/moonshine/blob/main/LICENSE
- Moonshine languages: https://github.com/moonshine-ai/moonshine
- Moonshine vs Whisper table (vendor; Linux x86 cells "read pessimistically"): https://github.com/moonshine-ai/moonshine/blob/main/docs/moonshine-vs-whisper.md and https://github.com/moonshine-ai/moonshine/blob/main/docs/using/benchmarks.md
- moonshine-js npm 0.1.29: MIT, 30,567,118 bytes unpacked, depends on `onnxruntime-web ^1.22.0`. https://registry.npmjs.org/@moonshine-ai/moonshine-js/latest
- Whisper weights tags: https://huggingface.co/openai/whisper-tiny , https://huggingface.co/openai/whisper-base
- IndicConformer repack: https://huggingface.co/parismitaglobalsolutions/indicconformer-sherpa-onnx ; source model tag MIT, gated: https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual
- Parakeet Tamil: https://huggingface.co/shrirajh/parakeet-tamil-kili
- Thedal: https://huggingface.co/Badri0510/Thedal-AED-Tamil-Tanglish-English-INT4-ConvINT8-ONNX
- Kyutai: https://github.com/kyutai-labs/delayed-streams-modeling ; weights tag https://huggingface.co/kyutai/stt-1b-en_fr
- Third-party note: transformers.js Whisper in Node averaged about 1,100 ms per utterance on an M2 CPU (https://micdrop.dev/docs/ai-integration/provided-integrations/whisper). Not a browser or x86 figure.

Takeaways:
- English streaming: Moonshine Tiny/Small streaming is the permissive low-latency option. Browser latency on this laptop: not found.
- Tamil streaming STT: no permissive streaming model found. The nearest is offline IndicConformer Tamil (about 198 MB int8), run after the VAD ends a phrase.
- Inferred: moonshine-js depends on its own onnxruntime-web range. Check the install tree before adding it, given the earlier Silero breakage.

## 4. Local TTS

### Kokoro-82M
- Weights: "This is an Apache-licensed model"; 82 million parameters; trained on "permissive/non-copyrighted audio data", and the card says synthetic audio from closed commercial TTS providers is included. https://huggingface.co/hexgrad/Kokoro-82M
- Code: `hexgrad/kokoro` Apache-2.0 (LICENSE). `kokoro-js` 1.2.1 Apache-2.0, 30,395,646 bytes unpacked, depends on `phonemizer` and `@huggingface/transformers ^3.5.1`. https://registry.npmjs.org/kokoro-js/latest
- Languages (VOICES.md): American English, British English, Japanese, Mandarin, Spanish, French, Hindi, Italian, Brazilian Portuguese. No Tamil. No Indian English. Hindi voices are graded C. https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md
- kokoro-js README shows only American and British English voices; dtypes fp32, fp16, q8, q4, q4f16; devices wasm/webgpu. https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/README.md
- ONNX sizes (https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX): `model_quantized.onnx` 92,361,116 bytes; `model_q8f16.onnx` 86,033,585; `model_fp16.onnx` 163,234,740; `model.onnx` 325,532,232.
- Speed: no first-party figure. A third-party page lists RTF about 1.1 for "Mid-range x86 laptop (WASM q8, 1 thread)", citing community reports (https://voicechanger.live/text-to-speech/benchmarks). That is slower than real time.
- Licence risk: `phonemizer` (npm, Apache-2.0) describes itself as a converter "using eSpeak NG" and ships `src/espeakng.worker.js` (1,449,799 bytes). https://github.com/xenova/phonemizer.js . eSpeak NG is GPL-3.0 (COPYING). https://github.com/espeak-ng/espeak-ng . Inferred: kokoro-js ships compiled GPL code in the browser bundle. Owner should decide.
- Also: kokoro-js pins `@huggingface/transformers ^3.5.1`, while the app uses 4.3.x. Inferred: a second transformers and onnxruntime-web copy would be installed.

### Piper
- Original `rhasspy/piper`: MIT (LICENSE.md), archived. https://github.com/rhasspy/piper
- New `OHF-Voice/piper1-gpl`: GPL-3.0 (COPYING); it "embeds espeak-ng for phonemization". https://github.com/OHF-Voice/piper1-gpl
- Voice licences: "The Piper project makes no license grant of its own over voice models"; each MODEL_CARD names its dataset licence. https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/LICENSING.md
- Voice list: 183 voices; no Tamil (`ta_IN`) and no Indian English (`en_IN`). Indian voices exist for hi_IN, ml_IN, te_IN, mr_IN. https://huggingface.co/rhasspy/piper-voices (voices.json)
- Sample voice cards (https://huggingface.co/rhasspy/piper-voices):
  - `en_US-ljspeech-medium`: dataset "public domain". Good.
  - `en_GB-alba-medium`: CC-BY-4.0. Good.
  - `en_US-lessac-medium`: Blizzard 2013 licence page (not read; treat as restricted until read).
  - `hi_IN-pratham-medium`: CC BY-NC-SA 4.0. Excluded.
  - `ml_IN-meera`, `te_IN-maya`: IndicTTS data, "See URL" / IIT Madras licence PDF (not read).
- Size: `vits-piper-en_US-ljspeech-medium-int8.tar.bz2` 21,090,429 bytes; `vits-piper-en_GB-alba-medium-int8.tar.bz2` 21,104,326. https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models
- Speed: third-party "Piper (medium voice)" RTF about 0.11 on a mid-range x86 laptop, WASM (https://voicechanger.live/text-to-speech/benchmarks). Not first-party.

### sherpa-onnx TTS in WASM
- Prebuilt WASM TTS bundles in release v2.0.1 (https://github.com/k2-fsa/sherpa-onnx/releases/tag/v2.0.1):
  - `vits-piper-en_US-libritts_r-medium`: 85,592,265 bytes.
  - `matcha-icefall-en_US-ljspeech`: 131,658,983 bytes.
  - `pocket-tts-int8-2026-01-26`: 98,502,669 bytes.
  - `supertonic-3-tts-int8`: 132,114,901 bytes.
- Kokoro and Kitten models exist for sherpa-onnx (not as prebuilt wasm): `kokoro-int8-multi-lang-v1_1` 147,052,523 bytes; `kitten-nano-en-v0_8-int8` 31,220,690 bytes. https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models
- Kitten: code Apache-2.0 (https://github.com/KittenML/KittenTTS); `KittenML/kitten-tts-nano-0.8-int8` Apache-2.0 tag only.
- No Tamil TTS model in the sherpa-onnx `tts-models` release (646 assets; name filter for ta/tam/tamil found none). The only Tamil-capable model I know of there, MMS, is excluded anyway: `facebook/mms-tts-tam` is CC-BY-NC-4.0. https://huggingface.co/facebook/mms-tts-tam
- The current sherpa-onnx `cmake/` folder lists no eSpeak NG file. Whether today's TTS builds still compile eSpeak NG: not verified.

### Tamil TTS candidates

| Model | Code | Weights | Gated | Size | Speed (source) | Notes |
|---|---|---|---|---|---|---|
| `sulabhkatiyar/indic-tiny-tts-tamil` | MIT | CC-BY-4.0 (LICENSE.md read); Vocos vocoder MIT; data Rasa CC-BY-4.0 | No | 19,169,253 + 17,687,134 + 54,150,036 bytes ONNX | RTF 0.136 on x86 CPU, 1 thread, PyTorch | No eSpeak. Tamil script only; Latin English words are skipped. 24 kHz, two voices. Community model by one author |
| `ai4bharat/vits_rasa_13` | — | CC-BY-4.0 tag | Yes (HF login) | 40.2 M params | Not given | Python, `trust_remote_code`, CUDA example; Tamil female voice TAM_F |
| `ai4bharat/IndicF5` | — | MIT tag | Yes | Not checked | Not checked | Includes Tamil |
| `ai4bharat/indic-parler-tts` | — | Apache-2.0 tag | Yes | Not checked | Not checked | Includes Tamil and English |
| AI4Bharat Indic-TTS (FastPitch + HiFi-GAN, Coqui) | MIT (LICENSE.txt) | Not separately stated | No | `ta.zip` 1,520,799,925 bytes | Not reported | Too big for a browser |
| `facebook/mms-tts-tam` | — | CC-BY-NC-4.0 | No | — | — | Excluded |
| `Jeyaram-K/piper-tamil-voices` | — | Apache-2.0 tag only, no licence file, no dataset named | No | about 63.5 MB per voice | — | One voice is named "ValluvarNeural", which is also a cloud-TTS voice name; provenance unknown. Avoid |
| `prasadvittaldev/pocket-tts-tamil-onnx-int4` | — | CC-BY-4.0 tag only | No | about 111 MB | — | Community fine-tune of Kyutai Pocket TTS; data not stated |

Sources: https://huggingface.co/sulabhkatiyar/indic-tiny-tts-tamil (and its LICENSE.md), https://huggingface.co/ai4bharat/vits_rasa_13 , https://huggingface.co/ai4bharat/IndicF5 , https://huggingface.co/ai4bharat/indic-parler-tts , https://github.com/AI4Bharat/Indic-TTS (release v1-checkpoints-release), https://huggingface.co/datasets/ai4bharat/Rasa (CC-BY-4.0 tag, gated), https://huggingface.co/Jeyaram-K/piper-tamil-voices , https://huggingface.co/prasadvittaldev/pocket-tts-tamil-onnx-int4

Inferred for Tamil in the browser: indic-tiny-tts-tamil's three ONNX graphs could run on the page's onnxruntime-web. Its text front-end (characters, Tamil number words) and the flow-matching loop would need porting from Python to JS. Not tested. Credit lines for the model and Rasa are required by CC-BY-4.0.

Inferred for short fixed phrases: if Jarvis only needs a few fixed acknowledgements ("Yes?", "சொல்லுங்க"), they could be generated once offline and shipped as audio clips. That avoids runtime TTS and its download. The licence of the voice used still applies to the clips.

## 5. Kyutai (Unmute) streaming STT / TTS

- Unmute: MIT (LICENSE). https://github.com/kyutai-labs/unmute
- Delayed Streams Modeling: "MIT license for the Python parts, and Apache license for the Rust backend"; STT weights "CC-BY 4.0". https://github.com/kyutai-labs/delayed-streams-modeling
- STT: `kyutai/stt-1b-en_fr` about 1B params, 0.5 s delay; `kyutai/stt-2.6b-en` about 2.6B params, 2.5 s delay (same page). English and French only.
- Hardware: the Rust server example uses a CUDA feature flag and cites an L40S GPU; MLX path is for Apple silicon. No CPU-only, ONNX or WASM path is mentioned (same page). Inferred: STT will not run usefully on this laptop in a browser.
- TTS weights `kyutai/tts-1.6b-en_fr`: CC-BY-4.0 tag. Inferred: too large for CPU real-time here.
- Pocket TTS (Kyutai, CPU-friendly): CC-BY-4.0, 100M params, "~6x real-time on a CPU of MacBook Air M4", "Uses only 2 CPU cores", "~200ms to get the first audio chunk"; x86 cloud VM (4 vCPU) about 2.3-2.5x real time on CPU; English, French, German, Portuguese, Italian, Spanish (no Tamil); gated (HF login); bars voice cloning without consent. https://huggingface.co/kyutai/pocket-tts
- Pocket TTS prebuilt WASM via sherpa-onnx: 98,502,669-byte bundle (v2.0.1 release). The demo space ships a 13,473,435-byte wasm and a 198,294,577-byte data file. https://huggingface.co/spaces/k2-fsa/web-assembly-en-tts-pocket

## Cost and risk summary

- Cost: every option above is free to download. None needs a paid plan. Gated Hugging Face repos need a free Hugging Face login (a new account if the owner has none). Porcupine needs a Picovoice account. LiveKit custom-phrase training needs LiveKit Inference (inferred: an account).
- Privacy: all picks run on the device after a one-time model download. Inferred: serve the model files from the app's own origin so the idle page makes no third-party calls.
- Biggest risks:
  1. LiveKit model is for "Hey Jarvis"; the owner's phrase is "Hi Jarvis". Not measured.
  2. sherpa-onnx KWS needs a self-built wasm (emsdk install), and its English model's data is non-commercial-access.
  3. kokoro-js and Piper-style front-ends lean on eSpeak NG (GPL-3.0).
  4. Tamil TTS options are community or gated models; none is a mature browser package.
  5. No permissive streaming Tamil STT exists that I found.

## Not verified

- Whether `hey_jarvis.onnx` fires on "Hi Jarvis", and its false-alarm rate on Tamil/Tanglish speech.
- Whether `hey_jarvis.onnx` takes raw 16 kHz audio or needs a JS feature front-end from the client package.
- That the onnxruntime-web peer range was the exact cause of the earlier Silero breakage (inferred from version numbers only).
- sherpa-onnx KWS: real latency of the GigaSpeech chunk-16 model, its accuracy for "HI JARVIS", the final wasm size, and whether plain-text keywords work through `modelingUnit`/`bpeVocab` in WASM.
- Whether the sherpa-onnx WASM module runs inside a Web Worker or AudioWorklet without changes.
- Licence of the zh-en-3M-2025-12-20 and WenetSpeech KWS models.
- Browser (WASM) latency of Moonshine streaming, Whisper and the sherpa streaming zipformer on a Ryzen 5 5600H.
- Whisper's Tamil accuracy; whisper.cpp wasm licence and speed (not looked up).
- The Blizzard 2013 (lessac) and IIT Madras IndicTTS dataset licence texts.
- Whether today's sherpa-onnx TTS builds include eSpeak NG.
- That phonemizer.js's `espeakng.worker.js` is an unmodified GPL-3.0 eSpeak NG build (inferred from its name and README).
- IndicF5 and Indic Parler-TTS sizes and CPU speed; vits_rasa_13 CPU speed.
- indic-tiny-tts-tamil running in onnxruntime-web, and its quality on short phrases.
- EfficientWord-Net weights' training-data licence and its in-browser latency.
- Kokoro and Piper speed figures above come from a third-party page that collected them from others; none was measured here.
