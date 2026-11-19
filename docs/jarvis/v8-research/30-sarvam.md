# 30. Sarvam AI speech to text for Jarvis v8 (Tamil, English, Tanglish)

Written 18 Nov 2026 for the v8 build. This is desk research only. No account was made and no Sarvam API, paid or free, was called. The owner buys a key only at the final stage, with a budget of up to Rs 500.

Marks: **(B)** = read in the source at the URL during this pass. **(M)** = my own inference, arithmetic or background knowledge, not read this pass. Every page was read through a fetch tool that summarises the page, so re-read the page before a figure goes into a release document. Quotes are kept under 15 words. **UNCONFIRMED** marks anything I could not settle; the full list is in section 9.

## Summary

- **The current model is `saaras:v4`**, the REST default since its 25 Sep 2026 launch. `saaras:v3` is still active. Saarika (v2.5) and the old `/speech-to-text-translate` endpoint are deprecated or being deprecated (B, [models](https://docs.sarvam.ai/api-reference-docs/getting-started/models), [Saarika](https://docs.sarvam.ai/api/getting-started/models/saarika.md), [v4 blog](https://www.sarvam.ai/blogs/introducing-saaras-v4)). One model and one endpoint now handle both transcription and speech-to-English translation, switched by `mode` (B).
- **Five output modes:** `transcribe`, `translate`, `verbatim`, `translit` and `codemix`. `codemix` writes English words in Latin script and Indic words in their native script (B, [Saaras](https://docs.sarvam.ai/api/api-guides-tutorials/models/saaras)). Auto-detect is `language_code=unknown` (or leaving it out). The response then carries `language_code` and a `language_probability` from 0 to 1 (B).
- **Short clips:** `POST https://api.sarvam.ai/speech-to-text`, multipart, header `api-subscription-key`, up to 30 s per request, WAV and most codecs, 16 kHz recommended (B, [REST ref](https://docs.sarvam.ai/api-reference-docs/speech-to-text/transcribe)). Jarvis already posts a WAV per utterance to Groq (`src/lib/thunai/stt.ts`), so REST is a near drop-in (M).
- **Streaming:** two WebSockets exist. One is the legacy `/speech-to-text/ws`, which gives final results per utterance plus VAD events. The other is `/speech-to-text-realtime/ws`, which gives partials, VAD events and live reconfiguration, and its close codes mention "beta denied" (B). Neither is needed for v8 (M).
- **Price:** Rs 0.49 a minute pay-as-you-go (Rs 29.40 an hour), excluding GST. It is "Priced per minute, billed per second" (B, [rate limits](https://docs.sarvam.ai/api-reference-docs/ratelimits.md)). Duration is rounded up to the whole second, with a 1 s minimum (B, [STT FAQ](https://docs.sarvam.ai/api-reference-docs/speech-to-text/faq.md)). **A 3 s clip is billed as 3 s**, i.e. Rs 0.0245 before GST (M, arithmetic). Signup gives Rs 100 of free credits that never expire (B).
- **What Rs 500 buys:** about **17.0 hours, or about 20,400 three-second turns**, if Rs 500 buys Rs 500 of credit. If the Rs 500 must also cover 18 % GST, it is **about 14.4 hours, or about 17,300 turns** (M, section 7). Signup credit adds 3.4 hours. The whole final test plan in section 8 costs about Rs 45, so it fits in the free credit (M).
- **Accuracy evidence is thin for Tamil and absent for Tanglish.**
  - The best independent Tamil result favours Sarvam. Voice of India (Josh Talks with AI4Bharat and IIT Madras, Apr 2026) gives Tamil OI-WER of 14.9 for Saarika 2.5 and 14.2 for Sarvam Audio. IndicConformer scores 19.9 there and GPT-4o Transcribe 64.2 (B).
  - A second independent study scores Sarvam behind. IISc's SraVaani paper (Aug 2026) gives a 6-dataset Tamil WER of 32.1 for Saaras v3, against 30.1 for IndicConformer-600M (B).
  - On FLEURS Tamil, Whisper large-v3 has 48.6 % WER, about twice IndicConformer's 25.5 % (B; this card is from a competing model's author).
  - Sarvam publishes no Tamil-specific figure for v4. Nobody has published a Tamil-English code-mixed benchmark for any Sarvam model (B, absence noted in each source).
- **Data:** the managed service runs on Azure Central India, with "India-only residency for Indian deployments" (B, [trust center](https://www.sarvam.ai/trust-center)). The terms say "We process and store information in India" (B, [ToS](https://www.sarvam.ai/terms-of-use)).
  - Training on customer content needs opt-in consent under the EULA, and an Owner-only "Model training" toggle exists (B). Its default position is **UNCONFIRMED**.
  - Retention is "retained indefinitely" until an Owner sets a period, and a 0-day setting exists for Model APIs (B, [data retention](https://docs.sarvam.ai/api/platform/data-retention.md)). On day one, set retention to 0 days and switch training off before the first call (M).
- **Recommendation:**
  - Behind a flag, use `saaras:v4` on REST with `mode=codemix` and `language_code=unknown`, plus `keyterms` built from the lexicon's place and zone names (up to 50).
  - Send one call per engaged or named turn, never ambient decodes. Race it against Groq's English decode, let it replace the forced-Tamil Whisper decode, and fall back to Whisper on any error or timeout.
  - When the key is bought, test codemix against transcribe on a recorded English, Tamil and Tanglish fixture set (section 10).

## 1. Models and what each does

| Model id | Status (Nov 2026) | Languages | Modes | Notes |
|---|---|---|---|---|
| `saaras:v4` | Default, "Recommended", "latest" (B, [models](https://docs.sarvam.ai/api-reference-docs/getting-started/models)) | 22 Indian languages plus Indian English and Global English (B) | transcribe, translate, verbatim, translit, codemix (B) | `keyterms` biasing (up to 50 terms) works on this model only (B, [Saaras](https://docs.sarvam.ai/api/api-guides-tutorials/models/saaras)) |
| `saaras:v3` | "Previous ASR model, still available", Active (B) | 22 Indian languages plus Indian English (B) | same five (B) | No `keyterms` (B) |
| `saaras:v3-realtime` | Accepted only on the realtime WebSocket (B, [realtime WS](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe/realtime/ws.md)) | n/a | n/a | No `keyterms` (B) |
| Saarika v2.5 | "will be deprecated soon", also called "a deprecated model" (B, [Saarika](https://docs.sarvam.ai/api/getting-started/models/saarika.md)) | 11 languages (B) | transcribe only (M) | Replaced by `saaras:v4` with `mode=transcribe` (B). No sunset date is given (B). |
| Saaras v2.5 (`/speech-to-text-translate`) | Being deprecated (B, [Saaras](https://docs.sarvam.ai/api/api-guides-tutorials/models/saaras)) | 11 (B) | translate | To migrate, use `/speech-to-text` with `model=saaras:v4` and `mode=translate` (B) |

### 1.1 What the modes do
These are the docs' own examples, all for one Hindi clip ("my phone number is 9840950950") (B, [Saaras](https://docs.sarvam.ai/api/api-guides-tutorials/models/saaras)):

- `transcribe` (default): native script, formatted, numbers normalised. Example: `मेरा फोन नंबर है 9840950950`.
- `translate`: English text. Example: `My phone number is 9840950950`.
- `verbatim`: no normalisation, fillers and spoken numbers kept. Digits come out as words, for example `नौ आठ चार zero ...`.
- `translit`: Latin script throughout. Example: `mera phone number hai 9840950950`.
- `codemix`: English words in Latin script, Indic words in native script. Example: `मेरा phone number है 9840950950`.

Sarvam's Tamil page shows the same pattern for Tamil (B, [Tamil page](https://www.sarvam.ai/apis/speech-to-text/tamil)):

- transcribe: `என் போன் நம்பர் 9840950950`. The English loanwords come out in Tamil script.
- translit: `en phone number 9840950950`.
- verbatim spells out the digits in Tamil words.
- The page also shows Tanglish demos that keep English words in Latin inside Tamil-script sentences, from a "Saaras v3 demo". It does not name the mode used (B).

What this means for Jarvis (M):

- Plain `transcribe` on Tanglish turns "phone" into "போன்". This would undo the lexicon matching that v5 to v7 built for English place and department names.
- `codemix` keeps "Adyar", "pending" and "news" in Latin script and the Tamil in Tamil script. That is the form the planner and the language-of-utterance rule (brief item 4) can use directly.
- Whether `codemix` on pure English speech returns plain English is **UNCONFIRMED**. No doc example covers it.

### 1.2 Language detection and confidence
- If `language_code` is left out or set to `unknown`, the model detects the language and returns `language_probability` (0.0 to 1.0). With a fixed code, `language_probability` is null. For mixed audio, the response reports "the most predominant" language (B, [Saaras](https://docs.sarvam.ai/api/api-guides-tutorials/models/saaras)).
- Sarvam reports a language-ID error of 5.22 % across 22 languages and 2.9 % across the top ten (B, [v4 blog](https://www.sarvam.ai/blogs/introducing-saaras-v4)).
- No per-word confidence or logprob is returned. REST returns only `language_probability` (B, [REST ref](https://docs.sarvam.ai/api-reference-docs/speech-to-text/transcribe)). The realtime socket says outright that it emits no transcript `confidence` (B). Jarvis's current "Whisper logprob decides" race (`stt.ts`) therefore cannot score a Sarvam decode the same way. It needs a script or lexicon check instead, which brief item 4 asks for anyway (M).

## 2. API shape

### 2.1 REST, short clips (use this one)

- **Endpoint:** `POST https://api.sarvam.ai/speech-to-text`, `multipart/form-data` (B, [REST ref](https://docs.sarvam.ai/api-reference-docs/speech-to-text/transcribe)).
- **Auth header:** `api-subscription-key: <key>` (B).
- **Limit:** up to 30 s of audio per request. Longer audio fails with 400 and the message "Audio duration exceeds the maximum limit of 30 seconds" (B, [REST guide](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/rest-api.md)).
- **Formats:** WAV, MP3, AAC, AIFF, OGG, OPUS, FLAC, MP4/M4A, AMR, WMA, WebM and raw PCM. Codecs are auto-detected except raw PCM. Multi-channel audio is merged to mono. 16 kHz is recommended, and raw PCM must be 16 kHz (B, REST ref). The FAQ lists 8, 16, 22.05 and 44.1 kHz for REST (B, [STT FAQ](https://docs.sarvam.ai/api-reference-docs/speech-to-text/faq.md)).

Multipart fields (B, REST ref unless marked):

| Field | Type | Values | Notes |
|---|---|---|---|
| `file` | file | audio bytes | required |
| `model` | string | `saaras:v4` (default), `saaras:v3` | |
| `mode` | string | `transcribe` (default), `translate`, `verbatim`, `translit`, `codemix` | v3 and v4 only |
| `language_code` | string | `unknown`, `en-IN`, `ta-IN`, `hi-IN`, ... (23 codes, BCP-47) | No default stated. Leave it out or send `unknown` to auto-detect (B, REST guide). |
| `with_timestamps` | boolean | `true`/`false` | Chunk-level only. "word-level timestamps are not supported" (B, FAQ). |
| `input_audio_codec` | string | `pcm_s16le`, `pcm_l16`, `pcm_raw` | Only for raw PCM |
| `keyterms` | string | JSON array, up to 50 terms of up to 64 characters each | `saaras:v4` only. Docs: "Do not use the older `keyterm` or `hotwords` fields." |

Example request (the curl shape is from the REST guide (B); the values are ours (M)):

```bash
curl -X POST https://api.sarvam.ai/speech-to-text \
  -H "api-subscription-key: $SARVAM_API_KEY" \
  -F model="saaras:v4" \
  -F mode="codemix" \
  -F language_code="unknown" \
  -F 'keyterms=["Pallikaranai","Teynampet","Adyar","Greater Chennai Corporation"]' \
  -F file=@speech.wav
```

The same request in Node 18+ with no SDK (M; this mirrors how `stt.ts` already posts to Groq):

```ts
const f = new FormData();
f.append("file", new Blob([wav], { type: "audio/wav" }), "speech.wav");
f.append("model", "saaras:v4");
f.append("mode", "codemix");
f.append("language_code", "unknown");
f.append("keyterms", JSON.stringify(keyterms.slice(0, 50)));
const r = await fetch("https://api.sarvam.ai/speech-to-text", {
  method: "POST",
  headers: { "api-subscription-key": key },
  body: f,
  signal: AbortSignal.timeout(2500),
});
```

200 response (field list B, REST ref):

| Field | Type | Notes |
|---|---|---|
| `request_id` | string or null | |
| `transcript` | string | |
| `language_code` | string or null | BCP-47 code of the predominant language, or null if none was detected |
| `language_probability` | number or null | 0 to 1. Present when `language_code` was `unknown` or left out. |
| `timestamps` | object or null | Only with `with_timestamps=true`. Holds `words` (phrase chunks), `start_time_seconds` and `end_time_seconds`. |

Vendor example (B, [REST guide](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/rest-api.md)):

```json
{
  "request_id": "20241115_12345678-1234-5678-1234-567812345678",
  "transcript": "नमस्ते, आप कैसे हैं?",
  "language_code": "hi-IN",
  "language_probability": 1.0
}
```

Mock fixtures for our tests. The shape is from the docs; **the text and numbers are invented (M)** and must be replaced by recorded responses once the key exists.

```json
{ "request_id": "mock_ta_codemix_1", "transcript": "Adyar zone-ல pending cases எத்தனை?", "language_code": "ta-IN", "language_probability": 0.93 }
{ "request_id": "mock_en_1", "transcript": "Open the Supreme Court news.", "language_code": "en-IN", "language_probability": 0.98 }
{ "request_id": "mock_empty", "transcript": "", "language_code": null, "language_probability": null }
```

Errors. The body is `{"error": {"request_id", "message", "code"}}` (B, REST ref):

| HTTP | `code` | Meaning | Jarvis action (M) |
|---|---|---|---|
| 400 | `invalid_request_error` | Over 30 s, corrupt file, bad model, mode, language or keyterms (B, REST guide) | Fall back to Whisper. Never send a clip over 30 s, checking with `wavSeconds()` first. |
| 403 | `invalid_api_key_error` | Missing or invalid key (B) | Mark Sarvam unhealthy for the session. Use Whisper. |
| 429 | `rate_limit_exceeded_error` | Too many requests (B, [rate limits](https://docs.sarvam.ai/api-reference-docs/ratelimits.md)) | Fall back for this turn. Back off. |
| 402, or 429 with `insufficient_quota_error` | Credits exhausted (B: the rate-limit page says 402, the REST ref says 429 "quota exceeded") | Handle both. Tell the owner, switch the flag off, use Whisper. |
| 500 / 503 | Internal error / overloaded (B) | Fall back. Retry as for a 429 (B). |

### 2.2 Legacy WebSocket (generally available, final results only)

Source: [WS spec](https://docs.sarvam.ai/api-reference-docs/speech-to-text/transcribe/ws.md) and [streaming guide](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/streaming-api.md).

- **URL:** `wss://api.sarvam.ai/speech-to-text/ws`. Auth uses the header `Api-Subscription-Key` (B).
- **Query parameters** (B), note the hyphen in `language-code`:
  - `language-code`: default `unknown`.
  - `model`: `saaras:v4` (default) or `saaras:v3`.
  - `mode`.
  - `sample_rate`: `16000` or `8000`.
  - `high_vad_sensitivity`, `vad_signals`, `flush_signal`.
  - `input_audio_codec`: `wav`, `pcm_s16le`, `pcm_l16` or `pcm_raw`.
  - `keyterms`.
  - VAD tuning knobs such as `positive_speech_threshold` (default 0.7) and `negative_frames_count` (default 18).
- **Client to server** (B):
  - Audio: `{"audio": {"data": "<base64>", "sample_rate": "16000", "encoding": "audio/wav"}}`.
  - Flush: `{"type": "flush"}`.
- **Server to client** (B):
  - Transcript: `{"type": "data", "data": {"request_id", "transcript", "timestamps": null, "diarized_transcript": null, "language_code", "language_probability", "metrics": {"audio_duration", "processing_latency"}}}`.
  - VAD events: `{"type": "events", "data": {"event_type", "timestamp", "signal_type": "START_SPEECH" | "END_SPEECH", "occured_at"}}`. The `occured_at` misspelling is Sarvam's.
  - Errors: `{"type": "error", "data": {"error", "code"}}`.
- **VAD timing** (B): one VAD frame is 512 samples, 32 ms at 16 kHz. With `high_vad_sensitivity` the end-of-speech boundary is about 64 ms of silence; otherwise about 1 s.
- **Caveat** (B): the official JS SDK's `connect()` "silently" drops `mode`, so its sessions always run as `transcribe`. Use a raw `ws` client to get `codemix`.

### 2.3 Realtime WebSocket (partials)

Source: [realtime WS](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe/realtime/ws.md).

- **URL:** `wss://api.sarvam.ai/speech-to-text-realtime/ws` (B).
- **Auth:** the header `API-SUBSCRIPTION-KEY`. Browsers can instead use the subprotocol `api-subscription-key.<key>` (B). That would expose the key to the browser, so Jarvis should proxy through its own server (M).
- **Query parameters** (B):
  - `language_code`: required, and here it is spelled with an underscore. Takes `auto` or a BCP-47 code.
  - `model`: `saaras:v4` (default) or `saaras:v3-realtime`.
  - `stream_type`: `fast`, `balanced` (default) or `simulated`.
  - `mode`, `prompt`, `keyterms`.
  - `endpointing`: `vad` (default) or `manual`.
  - `encoding`: `linear16` (default), `linear32`, `mulaw` or `alaw`. Mono only.
  - `sample_rate`: 8000 or 16000.
  - `return_timestamps`, `threshold` (default 0.3), `prefix_padding_ms` (default 300), `silence_duration_ms` (default 1000), `min_speech_duration_ms` (default 250).
- **Client events** (B):
  - Audio: `{"event": "audio_input", "audio": "<base64>"}`. On `fast`, frames over 16,000 bytes are rejected.
  - Others: `speech_start`, `speech_end`, `flush`, `config.update`, `end`, `ping`.
- **Server events** (B):
  - `session.begin`, carrying `request_id` and the resolved `config`.
  - `vad.speech_start` and `vad.speech_end`, carrying `utterance_idx` and `confidence`.
  - `transcript.partial`, carrying `utterance_idx` and `text`. Partials are always plain transcription, whatever the `mode`.
  - `transcript.final`, carrying `utterance_idx` and `text`, plus `language` and `language_confidence` when `auto`. The `mode` is applied here.
  - `config.updated`, `pong`.
  - `session.end`, carrying `total_duration_s`, `total_utterances` and `audio_duration_s`.
  - `error`, carrying `code`, `is_fatal`, `message` and `status_code`.
- **Close codes** (B):
  - 1003: rate limit, quota or bad key.
  - 1008: inactivity. The server closes after 60 s with no audio.
  - 1011: server error.
  - 4000: rejection, including "beta denied".
- **UNCONFIRMED:**
  - Whether realtime access needs beta approval for a pay-as-you-go account.
  - Whether event fields are flat or nested under a `data` object. The summary I read did not settle it, so read the raw page before writing a parser.
- **Billing:** `audio_duration_s` is "the billed audio quantity" (B). Streaming an open microphone therefore bills silence too (M), at Rs 29.40 for every hour the socket is fed. Only stream after the wake word (M).

### 2.4 Batch

Source: [which-API table](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/which-api-to-use/llms.txt) and the [batch guide](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/batch-api).

- **Limits:** jobs of up to 20 files, each up to 2 hours. Diarization is available (B).
- **Endpoints** (from a search summary, not a page read):
  - `POST /speech-to-text/job/v1` creates a job.
  - `POST /speech-to-text/job/v1/upload-files` returns presigned upload URLs.
  - `GET /speech-to-text/job/v1/{job_id}/status` reports progress.
  - `POST /speech-to-text/job/v1/download-files` takes `{"job_id", "files": ["0.json"]}`.
- The path that starts a job is **UNCONFIRMED**.
- Latency is "minutes, depending on queue and duration" (B), so batch is no use for live turns (M). For the fixture bench, REST is simpler because every clip is under 30 s (M).

### 2.5 SDK

- **Package:** the official JS/TS SDK is `sarvamai` on npm. Version 1.1.19 needs Node >= 18 and depends on `ws ^8.16.0`. Its repository is `github.com/sarvamai/sarvam-javascript-sdk` (B, [package.json via jsDelivr](https://cdn.jsdelivr.net/npm/sarvamai/package.json)).
- **Licence:** **UNCONFIRMED**. package.json has no `license` field (B), and the GitHub page returned 404 to the fetcher.
- **Methods:** REST uses `client.speechToText.transcribe({ file, model, mode, keyterms })`. Streaming uses `client.speechToTextStreaming.connect({...})`, then `socket.transcribe(...)`, `socket.flush()` and `socket.close()` (B, REST and streaming guides).
- **Recommendation:** skip the SDK (M). REST is one `fetch` with `FormData`, which the repo already does for Groq. The SDK drops `mode` on streaming. A dependency with an unknown licence is avoidable.

## 3. Accuracy evidence

| Source (who) | Set | Tamil | English / other | Mark |
|---|---|---|---|---|
| Sarvam, Saaras v4 blog, 25 Sep 2026 | Vistaar (10 langs), 7 English sets incl. Svarah, IndicContextEval | No Tamil number. "SOTA" on 22 languages claimed. | English: "lowest average WER" across 7 sets, figures in charts only. IndicContextEval L5 (keyword prompting) WER 16.03 %. | B, [v4 blog](https://www.sarvam.ai/blogs/introducing-saaras-v4) |
| Sarvam, Saaras v3 blog, 11 Feb 2026 | IndicVoices | No Tamil number | ~19 % WER overall (v2.5 was ~22 %). 19.31 % on the top-10 languages. | B, [v3 blog](https://sarvam.ai/blogs/asr) |
| Sarvam, Saarika v2.5 docs | Vistaar | Not broken out. The "9 other languages" average is 20.15 % WER, 5.07 % CER. | English 8.26 % WER. Hindi 11.81 %. 18.32 % across 11 languages. | B, [Saarika](https://docs.sarvam.ai/api/getting-started/models/saarika.md) |
| Voice of India (Josh Talks + AI4Bharat + IIT Madras), Apr 2026. Independent of Sarvam (M). | 53.4 h of Tamil from 4,434 speakers in 37 districts, scored by OI-WER | Sarvam Audio 14.2, Saarika 2.5 14.9, Gemini 3 Pro 15.7, Amazon 19.3, IndicConformer 19.9, ElevenLabs Scribe v2 20.4, GPT-4o Transcribe 64.2, Deepgram Nova 3 67.8 | On FLEURS Tamil, Sarvam Audio has 14.2 % WER against 11.4 % for Gemini 3 Pro. Whisper appears only as a qualitative hallucination example. | B, [VoI](https://voiceofindiablogs.ai.joshtalks.com/) |
| SraVaani 1.0 (IISc SPIRE Lab / ARTPARK), arXiv 2608.08235v2, 12 Aug 2026. A competing model (M). | 6 Tamil test sets, 30.77 h, mean WER | SraVaani 26.2, IndicConformer-600M 30.1, **Saaras v3 32.1**, Gemini 3 Flash 35.2 (partial) | No Whisper numbers | B, [arXiv](https://arxiv.org/html/2608.08235v2) |
| Lemura Labs Tamil-ASR-Qwen3 card, 2026. A competing model (M). | FLEURS Tamil, 586 utterances | **Whisper-large-v3 48.58 % WER / 13.75 % CER**, IndicConformer-600M 25.49 / 9.33 | No Sarvam numbers | B, [card](https://friendli.ai/models/lemuralabs/tamil-asr-qwen3) |
| Artificial Analysis | English, AA-WER | n/a | Whisper Large v3 Turbo on Groq 4.6 % at $0.67 per 1,000 min. The Saaras page showed no Saaras figures. | B, [AA](https://artificialanalysis.ai/speech-to-text/models/saaras) |

Reading the evidence (M):

- On Tamil, Sarvam's models range from best of 15 (Voice of India, colloquial speech from 37 districts) to behind IndicConformer (SraVaani, read and standard sets). Every Tamil source puts Whisper large-v3 far behind both. That matches the repo's own note in `stt.ts` that unprompted Tanglish was "about 97 % WER".
- No source measures Tamil-English code-mixing. Sarvam's own blog, "evaluating indian language asr" (Apr 2026), argues that plain WER penalises valid colloquial Tamil spellings, and it reports no system scores (B, [blog](https://www.sarvam.ai/blogs/evaluating-indian-language-asr)).
- So the owner's Tanglish speech is the deciding test, and it can only be run once the key exists.
- The STT FAQ's "95-98%" accuracy for clear speech has no stated benchmark (B, FAQ). Treat it as marketing.

## 4. Latency and region

- **Vendor claims:**
  - Streaming time to first token is "below 150 ms" (B, [v4 blog](https://www.sarvam.ai/blogs/introducing-saaras-v4)).
  - "Sub-250ms median latency" for live voice agents (B, [STT page](https://www.sarvam.ai/apis/speech-to-text.md)).
  - The Tamil page says the same: "sub-250ms latency for Tamil" over WebSocket (B).
- **REST:** **no latency figure is published for REST** or for 2 to 5 s clips. The docs describe it only as one round trip after upload (B, [which-API](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/which-api-to-use/llms.txt)).
- **Not a measurement:** the legacy WS example JSON shows `processing_latency: 0.31` for `audio_duration: 2.4` (B). It is an illustrative example in the spec.
- **No independent measurement** was found, so time to transcript is **UNCONFIRMED** until we measure it from Chennai.
- **Region:** managed production runs on Azure "Central India" (B, [trust center](https://www.sarvam.ai/trust-center)). From Chennai that should be a shorter network path than a US-hosted Groq endpoint (M). Groq's region was not checked in this pass.
- **Uptime:** "> 99.5%" is claimed (B, STT page).

## 5. Rate limits

Source: [rate limits](https://docs.sarvam.ai/api-reference-docs/ratelimits.md) and [credits & rate limits](https://docs.sarvam.ai/api-reference-docs/getting-started/pricing).

| | Pay as you go | Pro (Rs 9,999/month) | Growth (Rs 49,999/month) |
|---|---|---|---|
| REST | 60 req/min | 100 req/min | 4,000 req/min |
| WebSocket | 20 concurrent | 100 concurrent | 100 concurrent |
| Batch | 20 req/min | 100 req/min | 500 req/min |

- These figures are (B). Limits apply per account, and all keys share them (B). Business-tier figures are not listed (B).
- Some older pages and the pricing page show different numbers (Pro 200, Business 1,000), per a search summary. Treat the dashboard as authoritative (M).
- Pay-as-you-go is ample for one Collector (M). The fixture bench must throttle to at most 1 request a second (M).

## 6. Pricing

Source: [pricing page](https://www.sarvam.ai/api-pricing), [credits & rate limits](https://docs.sarvam.ai/api-reference-docs/getting-started/pricing) and [STT FAQ](https://docs.sarvam.ai/api-reference-docs/speech-to-text/faq.md).

| Service | Pay as you go | Pro | Growth | Business |
|---|---|---|---|---|
| Speech to text (real-time, streaming, batch), per minute | Rs 0.49 | Rs 0.45 | Rs 0.41 | Rs 0.38 |
| Batch with diarization, per minute | Rs 0.59 | Rs 0.54 | Rs 0.50 | Rs 0.47 |

- **Per hour:** Rs 29.40 pay-as-you-go (M, 0.49 × 60). The minute rates are (B).
- **Models:** the price does not differ by model or mode. The page names neither model, and `translate` mode is priced as STT (M, inferred from the single STT line).
- **Billing rule:** "Priced per minute, billed per second" (B). "Rounded up to the nearest second" with "Minimum charge: 1 second" (B, FAQ). A competitor's blog (smallest.ai, 18 Nov 2026) independently says per second, "not a full minute minimum" (B).
  - So a 3 s clip costs 3 s and a 3.2 s clip costs 4 s (M).
  - **Whether the billed duration is the uploaded file's length or the detected speech is UNCONFIRMED.** Assume the file length, so trim silence before upload (M).
- **Language-detection surcharge:** the STT FAQ lists language detection at "(+10%)" and diarization at "(+20%)" (B, FAQ). The pricing page shows no such surcharge (B). **UNCONFIRMED**, so the budget below is given both ways.
- **Free credits:** Rs 100 on signup for "verified" users, and credits "never expire" (B, pricing and [commercial licensing](https://docs.sarvam.ai/api/getting-started/commercial-licensing)). The verification steps are **UNCONFIRMED**.
- **GST:** all prices "exclude GST" (B). The GST rate is not stated on the page. 18 % is assumed as the usual rate for such services (M).
- **Minimum top-up:** the pricing page says "There is a minimum purchase amount" (B), but the licensing page says "No minimum purchase is required" (B). The amount is **UNCONFIRMED**. If it is above Rs 500, the owner will see that at checkout.
- **At zero balance:** calls fail with 402, and adding credit resumes service at once (B, [billing](https://docs.sarvam.ai/api/platform/billing.md)).
- **Comparison with Groq:** Whisper Large v3 Turbo on Groq is $0.67 per 1,000 minutes (B, AA). That is about $0.04 an hour, roughly Rs 3.4 an hour at about Rs 85 to the dollar (M). Sarvam pay-as-you-go is therefore roughly 8 to 9 times the cost of Groq Turbo (M). Both are small at one user's volume (M).

## 7. Budget: what Rs 500 buys

These figures are at the pay-as-you-go list price of Rs 0.49 a minute, billed per second, one REST call per turn (M, arithmetic).

| Scenario | Credit | Audio hours | 3 s turns | 5 s turns |
|---|---|---|---|---|
| A. Rs 500 of credit, GST paid on top (outlay about Rs 590) | Rs 500 | **17.0 h** (1,020 min) | **20,408** | 12,244 |
| A + 10 % LID surcharge | Rs 500 | 15.5 h | 18,552 | 11,131 |
| B. Rs 500 outlay including 18 % GST | Rs 423.73 | **14.4 h** (865 min) | **17,295** | 10,377 |
| B + 10 % LID surcharge | Rs 423.73 | 13.1 h | 15,722 | 9,433 |
| Free signup credit | Rs 100 | 3.4 h (204 min) | 4,081 (3,710 with LID) | 2,448 |

Assumptions (M):

- A turn's clip is billed on its whole length, including Jarvis's pre-roll and tail. A clip with 3 s of speech may well be about 4 to 5 s long, so the 5 s column is the safer planning figure.
- Only engaged and named turns go to Sarvam. Ambient decodes do not: they can run up to 8 a minute (`stt.ts`) and would burn credit on room talk.
- No parallel Sarvam calls are made per turn. Racing a `ta-IN` call against an `en-IN` call would double every number above. Auto-detect in one call is the cheaper design.

What that means in use (M):

- At 150 engaged turns a day of 4 s each, the cost is 10 minutes, or Rs 4.90 a day before GST.
- Rs 500 of credit therefore lasts about 100 working days.
- Streaming instead of REST costs the same per second of audio sent. Leaving a socket open on the room mic would cost Rs 29.40 an hour, or about Rs 235 for an 8-hour day.

## 8. Data use, retention, privacy, terms and licences

- **Residency:**
  - The terms say "We process and store information in India", with possible transfers under the Privacy Policy (B, [ToS](https://www.sarvam.ai/terms-of-use), v2.0, effective 29 Jul 2026).
  - The trust center says production runs on Azure Central India, with "India-only residency for Indian deployments" (B, [trust center](https://www.sarvam.ai/trust-center)).
  - VPC, on-premises and air-gapped deployments are offered (B).
- **Training use, from three sources:**
  - **EULA** (22 May 2026): no training on Your Content "unless you provide explicit opt-in consent" (B, [EULA](https://www.sarvam.ai/eula)).
  - **ToS §17.5:** training follows the Privacy Policy and law, with consent "which you may decline or withdraw". Sarvam may also use service-usage data to improve its services (B).
  - **Platform FAQ:** an Owner-only **"Model training" toggle** sits under Settings → Organisation → General (B, [platform FAQ](https://docs.sarvam.ai/api/platform/faq.md)).
  - The toggle's default position is **UNCONFIRMED**. The trust center says customer data is "never used to train models for other customers" (B). That does not rule out Sarvam's own general models (M).
- **Retention:**
  - "Until an Owner sets a retention period, your workspace's data is retained indefinitely" (B, [data retention](https://docs.sarvam.ai/api/platform/data-retention.md)).
  - "No retention (0 days)" is available for Model APIs. Periods run up to 730 days (B).
  - The trust center also offers an ephemeral mode and an opt-out from audio storage (B).
  - A search snippet of Sarvam's developer page claimed zero retention by default, but the page returned 404. **That conflicts with the retention doc, so assume indefinite retention until it is set** (M).
- **Security:** ISO 27001:2022 certified, a SOC 2 Type II report available under NDA, and DPDP Act compliance "In progress" (B, trust center). These are self-reported (B).
- **Government use:**
  - ToS §10.1 lists "essential government services" among high-stakes uses needing human review (B). Jarvis's Collector hears and acts on every answer, which should meet that (M).
  - ToS §10.1 bans real-time remote biometric identification in public spaces (B). Not relevant here (M).
  - The trust center cites production deployments for UIDAI and government (B).
- **Liability and law:**
  - The ToS caps liability at the greater of fees paid in the last 12 months or Rs 1,000 (B).
  - The EULA says Rs 10,000 (B). The licensing page says the Terms govern in a conflict (B).
  - Indian law applies, with Bengaluru arbitration and courts (B).
- **Output rights:** Sarvam assigns Output to the customer (B, ToS §17.4 and EULA). Outputs may not be used to train a competing model (B, ToS §10.5(a)).
- **Open weights:** none were found for any Sarvam speech model. The v4 blog states no licence or weights (B). The `sarvamai` Hugging Face page shows 13 of its 17 models, all text or translation and none speech (B, [HF](https://huggingface.co/sarvamai)). The Sarvam-30B and 105B LLMs are Apache 2.0, per a search snippet, not a page read (M). **Self-hosting Saaras is not an option** (M).
- **For the owner** (M): this is official audio from a government office. Before the first call:
  1. Set Sarvam API retention to 0 days.
  2. Switch "Model training" off.
  3. Ask support@sarvam.ai for the DPA.
  4. Keep the key server-side only, in the same way as `GROQ_API_KEY`.

## 9. Not confirmed (check before relying on it)

1. Whether a pay-as-you-go account needs beta approval for the realtime socket, and whether its events are flat or nested.
2. REST time to transcript for 2 to 5 s clips from Chennai. No published or independent figure was found.
3. The +10 % language-detection surcharge. It appears in the FAQ only, not on the pricing page.
4. The default position of the "Model training" toggle, and the default retention. The docs conflict.
5. The minimum top-up amount, and whether GST is added at checkout. The pages conflict.
6. What free-credit "verification" requires.
7. The `sarvamai` SDK licence.
8. Tamil-specific Saaras v4 accuracy, and any Tamil-English code-mixed benchmark. Neither has been published.
9. Whether `codemix` on pure English returns clean English. Whether `language_probability` is returned in every mode.
10. The path of the batch start endpoint.
11. Whether billing counts uploaded length or detected speech.
12. Exhausted credit as 402 or as 429 `insufficient_quota_error`. The docs say both, so handle both.
13. Rate limits for the Business tier, and older pages that show different Pro limits.

## 10. Recommendations for Jarvis v8

**Model and mode per language (M, from sections 1 to 3):**

- **One call per turn:** `saaras:v4` on REST, with `mode=codemix` and `language_code=unknown`. Add `keyterms` from the lexicon (zone names, Pallikaranai, Teynampet, outlet names, the departments most often misheard), capped at 50.
  - This single call covers English, Tamil and Tanglish.
  - Its `language_code` and `language_probability` are only a hint for brief item 4. The final language decision still checks script and words, because the detector reports only "the most predominant" language (B).
- **Tamil:** codemix, not transcribe. Transcribe writes English loanwords in Tamil script, which breaks lexicon matching.
- **English:** codemix with auto-detect should return English (UNCONFIRMED). If the bench shows otherwise, keep Groq's English decode as the English path.
- **Not for v8:** `translate` mode. The planner needs the Collector's own words for the reply-language rule and entity matching. `translit` loses Tamil script.

**Placement beside Whisper (M):**

- Put it behind `JARVIS_STT_SARVAM=1` (or similar), off by default, server-side only.
- On engaged and named turns, race Sarvam (codemix, auto) against Groq's English decode, and drop the forced-Tamil Whisper decode while Sarvam is healthy.
- Prefer Sarvam's text when it contains Tamil script or a lexicon hit. Prefer Whisper English when Sarvam returns `en-IN` and both agree. Fall back to the full Whisper race on any Sarvam error, a 2.5 s timeout, or an empty transcript.
- Ambient decodes stay on Groq only, to protect the budget.
- Never send clips over 30 s. `wavSeconds()` already exists for that check.
- Keep a per-day spend counter like the Claude ledger. A cap of about Rs 20 a day would hold Rs 500 for at least 25 days of heavy use (M).
- Primary or fallback: start Sarvam as the **Tamil and Tanglish primary** with Whisper as fallback. Make it primary for English only if the bench shows it at least equal on English.
- Mocked tests:
  - The request: URL, header, multipart fields, keyterms encoding.
  - Each error row in section 2.1, checking that the code falls back to Whisper.
  - The 30 s guard, the timeout, and the spend counter.
  - Recorded-fixture tests replay the real responses captured during the first paid run.

**What to test first when the key is bought (M):**

1. Before any call: set retention to 0 days and Model training off, and note the minimum top-up and GST at checkout. Use the Rs 100 free credit first.
2. **Smoke test, about Rs 0.15:** curl five 3 s clips (English, Tamil, Tanglish, the Pallikaranai name, silence). Check the response shape matches section 2.1. Check the dashboard bills 3 s per clip, and whether `unknown` adds 10 %.
3. **Fixture bench, about Rs 30:**
   - 150 recorded clips (50 English, 50 Tamil, 50 Tanglish), about 4 s each, run through 5 configurations:
     - v4 codemix with auto-detect.
     - v4 codemix with keyterms.
     - v4 transcribe with auto-detect.
     - v4 transcribe with a fixed `ta-IN` or `en-IN`.
     - v3 codemix with auto-detect.
   - Score per language:
     - WER and CER after normalising script and numbers.
     - Lexicon entity hit rate, including "Palikan" to Pallikaranai.
     - Language-label accuracy.
     - English-stays-English rate.
   - Run Groq's current race on the same clips.
4. **Latency, about Rs 5:** p50 and p95 REST time to transcript from the server for 2 to 5 s clips, three repeats, compared with the Groq race.
5. **Live checks, about Rs 7:** the v8 dev set and the live-60 with the flag on, once each.
6. **Optional, about Rs 5:** ten minutes on the realtime socket (`stream_type=fast`), only if the REST latency disappoints and beta access is granted.

The total is about Rs 45 before GST, which fits in the Rs 100 signup credit and leaves the Rs 500 for daily use (M).
