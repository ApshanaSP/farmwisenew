# 10. Sarvam AI: the whole API catalogue, checked for Jarvis v10

Written 19 Nov 2026 for the v10 build. This is desk research from Sarvam's official pages only: docs.sarvam.ai (guides, API reference, the OpenAPI and AsyncAPI specs, the changelog), sarvam.ai (pricing, blogs, legal pages, trust center), the `sarvamai` packages on PyPI and npm, and Sarvam's Hugging Face cards. No account was made, nothing was sent to any Sarvam API, and no `.env` file was opened. Third-party Tamil ASR benchmarks are in `docs/jarvis/v8-research/30-sarvam.md` (18 Nov) and are not repeated here. Every speech-to-text fact below was read again today.

**Marks.** (B) means I read it in the linked source on 19 Nov 2026. (M) means it is my own inference, design or arithmetic. "Rs" is Indian rupees before 18 % GST unless a line says otherwise. Sarvam's pages contradict each other in more than fifteen places. Section 13.4 lists every contradiction, and the build should follow the safer reading.

Contents: 0 Summary · 1 Platform · 2 Catalogue at a glance · 3 Speech to text · 4 Speech to English · 5 Translation · 6 Transliteration · 7 Language identification · 8 Text to speech · 9 Chat LLMs · 10 Decisions API (Prism) · 11 Documents · 12 Other products · 13 For Jarvis (what helps, request shapes, cost, not confirmed) · 14 Recommendations for Jarvis v10

---

## 0. Summary

- **One host, one header, one balance.** Every API lives on `https://api.sarvam.ai` and takes the header `api-subscription-key`. Billing draws on one prepaid rupee balance per organisation (B, [auth](https://docs.sarvam.ai/api-reference/authentication.md), [billing](https://docs.sarvam.ai/api/platform/billing.md)).
- **Speech to text.** `saaras:v4` is the default model. REST takes clips of up to 30 s. `keyterms` takes up to 50 terms of up to 64 characters each, on v4 only. A realtime WebSocket gives partial transcripts. The price is Rs 0.49 a minute, billed per second (B, sections 3.1–3.11).
- **Confidence values.** STT returns only language-level confidence (`language_probability` on REST and the legacy socket, `language_confidence` on the realtime socket) plus VAD confidence. No endpoint returns per-word confidence, log-probabilities or alternative transcripts (B, section 3.9).
- **Text APIs.**
  - Translate costs Rs 2 per 1,000 characters (B).
    - `mayura:v1`: up to 1,000 characters, 11 languages, 4 registers, Latin or native-script output.
    - `sarvam-translate:v1`: up to 2,000 characters, 23 languages, formal register only.
  - Transliterate costs Rs 2 per 1,000 characters, takes up to 1,000 characters, and converts Tamil to Latin script and back (B).
  - Language identification costs Rs 0.35 per 1,000 characters, takes up to 1,000 characters, and returns no confidence (B).
- **Text to speech.** Bulbul v3 costs Rs 3 per 1,000 characters and has 4 speakers recommended for Tamil. Bulbul v4 Flash costs Rs 1 or Rs 2 per 1,000 characters (two Sarvam pages disagree) and has 4 Tamil voice IDs (B, section 8).
- **LLMs.**
  - `sarvam-105b` has Apache-2.0 open weights and a 128K-token context. It costs Rs 10 input and Rs 25 output per 1M tokens, an introductory price that runs to the end of 2026 (B).
  - Sarvam-M has been withdrawn from the API (B).
  - `sarvam-prism` returns calibrated probabilities over a fixed set of options for Rs 4 per 1M input tokens. That makes it a ready-made "ask instead of guess" gate, if a pay-as-you-go key is allowed to call it. Access is UNCONFIRMED (section 10).
- **Cost for Jarvis.** At 150 turns of 4 s a day, speech to text costs about Rs 4.90–6.06 a day. With a few translations it costs Rs 11.50–20.76 a day.
  - The free Rs 100 lasts 16–20 days of speech to text alone.
  - A Rs 500 top-up lasts 70–102 days of speech to text alone (M, section 13.3).

---

## 1. Platform: host, auth, SDKs, errors, rate limits, credits, data

### 1.1 Host, authentication, keys

- **Base URL:** `https://api.sarvam.ai`, the "Production" server (B, [OpenAPI](https://docs.sarvam.ai/openapi/apis.json)).
- **REST auth:** the header `api-subscription-key: <key>` (B, [auth](https://docs.sarvam.ai/api-reference/authentication.md)).
  - The same key is also accepted as `Authorization: Bearer <key>` on all endpoints. This is meant for OpenAI-compatible tools that call chat completions (B, same).
  - A missing, malformed or unknown key returns **403, not 401**, with `invalid_api_key_error` (B, same).
- **WebSocket auth:**
  - The legacy STT socket and the TTS socket take the header `Api-Subscription-Key` (B, [legacy STT WS](https://docs.sarvam.ai/api-reference/legacy/speech-to-text/transcribe/ws.md), [TTS WS](https://docs.sarvam.ai/api-reference/text-to-speech/stream.md)).
  - The realtime STT socket takes the header `API-SUBSCRIPTION-KEY`. In browsers it takes the subprotocol `api-subscription-key.<key>`, which the server echoes back (B, [realtime WS](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe/realtime/ws.md)).
  - The subprotocol puts the key in the page, so Jarvis must never open this socket from the browser (M).
- **Keys:**
  - You create keys by hand in the dashboard, and each key's value is shown only once (B, [auth](https://docs.sarvam.ai/api-reference/authentication.md)).
  - Keys belong to the workspace, not to a person. An organisation can hold up to 50 active keys (B, [platform FAQ](https://docs.sarvam.ai/api/platform/faq.md)).
  - Rate limits apply to the whole account, so extra keys add no throughput (B, same).

### 1.2 SDKs

| | Python | JavaScript / TypeScript |
|---|---|---|
| Package | `sarvamai` (B, [PyPI](https://pypi.org/project/sarvamai/)) | `sarvamai` (B, [package.json](https://unpkg.com/sarvamai@1.1.19/package.json)) |
| Latest | **0.1.46**, released 13 Nov 2026 (B, PyPI) | **1.1.19**, published 2026-11-13T14:25Z (B, [npm registry](https://registry.npmjs.org/sarvamai)) |
| Runtime | Python >= 3.8, < 4.0 (B) | Node >= 18; depends on `ws ^8.16.0`; ships CJS and ESM (B) |
| Client | `SarvamAI(api_subscription_key=...)` and `AsyncSarvamAI` (B, [SDK page](https://docs.sarvam.ai/api/getting-started/sdks.md)) | `new SarvamAIClient({ apiSubscriptionKey })` (B, same) |
| Repository | github.com/sarvamai/sarvam-python-sdk (B, PyPI). The fetcher got a 404. | github.com/sarvamai/sarvam-javascript-sdk (B). The fetcher got a 404. |
| Licence | Not shown on PyPI (B) | No `license` field in 1.1.19. Only 1.0.0 declared "MIT" (B, registry). **UNCONFIRMED.** |

- **Defaults:** a 30 s timeout and up to 3 retries with exponential backoff on 429, 5xx and connection errors (B, [SDK page](https://docs.sarvam.ai/api/getting-started/sdks.md)). That also retries a 429 that means "credit spent", which is pointless, so set `maxRetries: 0` if the SDK is used (M).
- **JS 1.1.19 transcribe request type.** It has `keyterms?: string[]` (B, [request type](https://unpkg.com/sarvamai@1.1.19/dist/cjs/api/resources/speechToText/client/requests/SpeechToTextTranscriptionRequest.d.ts)). Its doc comment still calls `saaras:v3` the default and recommended model, which contradicts the REST reference (B). Always send `model` (M).
- **JS 1.1.19 realtime `connect()` arguments** (B, [realtime Client.d.ts](https://unpkg.com/sarvamai@1.1.19/dist/cjs/api/resources/speechToTextRealtimeStreaming/client/Client.d.ts)):
  - `language_code` (required), `model`, `stream_type`, `mode`, `prompt?: string`, `keyterms?: string`, `endpointing`, `encoding`, `sample_rate`.
  - The VAD settings: `return_timestamps`, `threshold`, `prefix_padding_ms`, `silence_duration_ms`, `min_speech_duration_ms`.
  - A required `"Api-Subscription-Key"` field.
  - The keyterms guide still says the SDK `connect()` helpers lack `keyterms` (B, [keyterms guide](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/how-to/keyterms.md)). That is out of date for JS 1.1.19 (M).
- **Minimum versions for keyterms:** Python `>=0.1.33a1` for REST and `>=0.1.33a3` for batch; JS `>=1.1.10-alpha.1` for batch (B, keyterms guide).

### 1.3 Errors and close codes

The REST error body is `{"error": {"message": "...", "code": "...", "request_id": "..."?}}` (B, [errors](https://docs.sarvam.ai/api/getting-started/errors-troubleshooting.md)). No request-id response header is documented (B, same).

| `error.code` | HTTP | Meaning (B, errors page) | Jarvis action (M) |
|---|---|---|---|
| `invalid_api_key_error` | 403 | Key missing, malformed or unknown | Cool Sarvam for 10 min and tell the owner |
| `invalid_request_error` | 400 / 413 / 422 | Bad parameters, payload or file. Includes a clip over 30 s, more than 50 keyterms, a keyterm over 64 characters, keyterms that are not a JSON array, and keyterms with a model other than v4 (B, [keyterms guide](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/how-to/keyterms.md)) | Do not retry. Fall back to Whisper. |
| `unprocessable_entity_error` | 422 | The schema is valid but a business rule failed | Do not retry |
| `insufficient_quota_error` | **402**, message "No credits available." | The balance is empty. Retrying will not help. | Cool, tell the owner, fall back |
| `rate_limit_exceeded_error` | 429 (the table also lists 503) | The account went over its requests per minute | Back off and fall back for this turn |
| `model_rate_limit_exceeded_error` | 429 | The model or upstream provider is saturated. `Retry-After` is documented only for this code. | Honour `Retry-After` |
| `seat_budget_exhausted_error` | 429 | The seat's spend budget is used up | Treat as spent credit |
| `audio_duration_busy_error` | 429 | The gateway's audio-duration readers are busy | Back off |
| `internal_server_error` / `model_call_failed` / `model_overloaded` | 500 / 502 / 503 | Server-side failure | Retry with backoff, or fall back |

- **Retries:** retry only on 429, 500, 502 and 503. Sarvam's sample starts at 1 s, doubles each time, caps at 60 s and stops after 5 attempts (B, errors page).
- **Conflict:** the endpoint references for `/speech-to-text`, `/translate`, `/transliterate`, `/text-lid` and `/text-to-speech` describe 429 as "Quota exceeded" and include `insufficient_quota_error` in their code lists (B, [STT REST ref](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe.md)). The errors, pricing and billing pages say spent credit returns 402 (B). Handle both forms: any 402, or a 429 whose code is `insufficient_quota_error` (M). Jarvis's `sarvam.ts` already does this.
- **Realtime STT socket** (B, [errors](https://docs.sarvam.ai/api/getting-started/errors-troubleshooting.md), [realtime WS](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe/realtime/ws.md)):
  - Close 1003: invalid key, rate limit, or quota spent.
  - Close 1008: no audio for 60 s (`inactivity_timeout`, status 408).
  - Close 1011: server error. Retry with backoff.
  - Close 4000: a bad parameter or model, "beta denied", or the account is not enabled.
  - Errors arrive first as `{"event":"error","code","is_fatal","message","status_code"}`.
  - `chunk_too_large` and `invalid_config` are not fatal.
- **Legacy STT socket** (B, errors page):
  - A bad key is rejected with HTTP 403 at the handshake.
  - Bad parameters close the socket with 4000.
  - A later error arrives as `{"type":"error","data":{"message"}}`, followed by close 1000.

### 1.4 Rate limits (per account, not per key)

Over the limit, REST returns 429. A WebSocket opened too fast closes with 1003 (B, [pricing](https://docs.sarvam.ai/api/getting-started/pricing.md)).

| API | Pay as you go | Pro | Growth |
|---|---|---|---|
| STT REST | 60 req/min | 100 | 4,000 |
| STT WebSocket streaming (one line; whether the legacy and realtime sockets share it is not stated) | 20 concurrent | 100 | 100 |
| STT batch | 20 req/min | 100 | 500 |
| TTS REST and HTTP stream | 60 req/min | 200 | 1,000 |
| TTS WebSocket | 60 concurrent | 200 | 1,000 |
| Text translation | 60 req/min | 200 | 1,000 |
| LLM `sarvam-105b` family | 60 req/min | 200 | 300 |
| LLM default (`gemma4`, `glm5.3`, `deepseekv4.1-flash-1017`) | 50 req/min | 200 | 1,000 |
| Document AI Parse (20 pages a request) / Extract (30) | 200 / 30 req/min | 300 / 50 | 400 / 60 |

All figures are (B, pricing). The pricing page lists no limits for transliteration, language identification or the Decisions API (B). The STT FAQ uses different plan names (Starter 60, Pro 100, Business 4,000) (B, [STT FAQ](https://docs.sarvam.ai/api/speech-to-text/faq.md)).

### 1.5 Credits and billing

- **Free credit:**
  - Rs 100 for every verified user at signup. The pricing page says it "never expires" (B, [pricing](https://docs.sarvam.ai/api/getting-started/pricing.md)), and the billing page also says credits do not expire (B, [billing](https://docs.sarvam.ai/api/platform/billing.md)).
  - The free credit is not limited to evaluation or non-commercial use. Spending credit counts as payment for the Production License on outputs (B, [licensing](https://docs.sarvam.ai/api/getting-started/commercial-licensing.md)).
  - **But** the Terms of Service v2.0 (§5.4, effective 29 Jul 2026) make free credits discretionary, non-refundable, and possibly subject to eligibility rules, usage limits and expiry, revocable without notice (B, [ToS](https://www.sarvam.ai/terms-of-service)).
- **Top-ups:**
  - Rs 1,000 paid gives 1,000 credits (B, [sarvam.ai/api-pricing](https://www.sarvam.ai/api-pricing)).
  - All prices exclude GST (B, pricing). Whether GST is added at checkout or taken out of the credit is not stated.
  - On a minimum top-up, the billing page says amounts below the minimum are rejected at checkout, without giving the minimum. The licensing page says no minimum purchase is required (B, both). The minimum is UNCONFIRMED.
- **Balance and controls:**
  - There is one balance per organisation, with no budget per workspace or per key (B, [billing](https://docs.sarvam.ai/api/platform/billing.md), [FAQ](https://docs.sarvam.ai/api/platform/faq.md)).
  - The dashboard shows a low-balance banner. Auto-recharge needs a stored payment method (B, billing).
- **At zero:**
  - API calls fail with 402. Adding credit resumes service at once, with no key rotation (B, billing).
  - Running out does not change the plan or its rate limits (B, pricing).
- **Plans:**
  - Pay as you go costs Rs 0 a month.
  - Pro costs Rs 9,999, Growth Rs 49,999 and Business Rs 1,99,999. Each plan fee is returned as credit (B, [api-pricing](https://www.sarvam.ai/api-pricing)).
- **Refunds:** unused credit is not refunded, except where the law requires it (B, ToS §5.2).

### 1.6 Data retention, model training, residency

- **Retention setting** (B, [data retention](https://docs.sarvam.ai/api/platform/data-retention.md)):
  - It lives under Settings → Workspace → Data policy, and only the Owner can change it.
  - The periods are 0 days ("no retention", Model APIs only), 1, 15, 30, 45, 60, 90, 180, 365 and 730 days.
  - Model APIs and Voice Agents can each override the workspace default.
  - Changes apply only to data created afterwards.
  - **Until an Owner sets a period, data is kept indefinitely.**
  - The self-serve controls shipped on 15 Sep 2026 (B, [changelog](https://docs.sarvam.ai/changelog/2026/9/15.md)).
- **Privacy Policy** (updated 29 Jul 2026), which contradicts the retention page (B, [privacy policy](https://sarvam.ai/privacy-policy)):
  - Content retention is user-configurable, with a default of 30 days after last access.
  - Content is used to train and fine-tune models unless you opt out.
  - The section is headed "Opt-In", but its text describes opting out.
- **EULA** (last modified 22 May 2026): no training on customer content without explicit opt-in consent. The Terms of Service win any conflict (B, [EULA](https://www.sarvam.ai/eula)).
- **Terms of Service v2.0:**
  - Training happens only with consent, which you may decline or withdraw. Usage data may be used to improve the services (§17.5).
  - Sarvam processes and stores information in India (§8.2) (B, [ToS](https://www.sarvam.ai/terms-of-service)).
- **The switch:** an Owner-only **"Model training" toggle** sits under Settings → Organisation → General (B, [platform FAQ](https://docs.sarvam.ai/api/platform/faq.md)). Its default position is not stated.
- **Trust center** (B, [trust center](https://www.sarvam.ai/trust-center)):
  - ISO 27001:2022 certified. A SOC 2 Type II report is available under NDA. ISO 42001 and DPDP compliance are "in progress".
  - Managed production runs on Azure Central India. LLM inference runs on Yotta and NxtGen infrastructure.
  - Data is encrypted with AES-256 at rest and TLS 1.2 or later in transit.
  - Sarvam says customer data is never used to train models for other customers.

---

## 2. Catalogue at a glance

Prices are pay-as-you-go and exclude GST. Every price, limit and rate figure is (B), from the sections below. The last column is (M).

| API | Endpoint | Models | Price | Main limits | Rate (PAYG) | For Jarvis (M) |
|---|---|---|---|---|---|---|
| STT REST | `POST /speech-to-text` | `saaras:v4` (default), `saaras:v3` | Rs 0.49/min, per second, 1 s minimum | Up to 30 s; keyterms up to 50 × 64 characters (v4) | 60 req/min | **Primary** |
| STT realtime | `wss://api.sarvam.ai/speech-to-text-realtime/ws` | `saaras:v4` (default), `saaras:v3-realtime` | Rs 0.49/min of billed `audio_duration_s` | Closes after 60 s without audio; 8 or 16 kHz | 20 concurrent | Prototype |
| STT legacy socket | `wss://api.sarvam.ai/speech-to-text/ws` | `saaras:v4`, `saaras:v3` | Same | Final transcript per utterance only | 20 concurrent | No |
| STT batch | `/speech-to-text/job/v1` … | v4, v3 | Rs 0.49/min; Rs 0.59/min with diarization | 20 files × 2 h; up to 20 speakers | 20 req/min | Not now |
| Speech → English | `/speech-to-text` with `mode=translate`; legacy `/speech-to-text-translate` | v4 or v3; legacy v3 or v2.5 | STT rate (M; no separate line) | 30 s | as STT | Experiment |
| Translate | `POST /translate` | `mayura:v1`, `sarvam-translate:v1` | Rs 2.00 / 1,000 characters | 1,000 or 2,000 characters | 60 req/min | **Yes, on demand** |
| Transliterate | `POST /transliterate` | none | Rs 2.00 / 1,000 characters | 1,000 characters | not listed | Occasional |
| Language ID | `POST /text-lid` | none | Rs 0.35 / 1,000 characters | 1,000 characters | not listed | Only if a probe passes |
| TTS | `POST /text-to-speech`, `POST /text-to-speech/stream`, `wss://…/text-to-speech/ws` | `bulbul:v3`, `bulbul:v4-flash`, `bulbul:v2` | v3 Rs 3.00/1K characters; v4 Flash Rs 1.00 or 2.00/1K | 2,500 / 3,500 / 2,500 characters | 60 req/min; 60 concurrent | Optional |
| Pronunciation dictionary | create, list, get, update, delete | Bulbul | not listed | 100 words a dictionary | | Only with Bulbul |
| Voice cloning (beta) | `/voices/*` | | Rs 2.00/1K characters | | 60 req/min | No |
| Chat | `POST /v1/chat/completions`, `POST /v2/chat/completions` | `sarvam-105b`, `sarvam-105b-conversations`, open models | 105B: Rs 10 in, 0.25 cached, 25 out per 1M tokens | 128K or 32K context | 60 req/min | No (bench first) |
| Decisions | `POST /v2/systemone` | `sarvam-prism`, `clef` | Rs 4 per 1M input tokens, Rs 0 output | 32,768 tokens a question; 2–255 options; 60 s | not listed | Probe |
| Embeddings | `POST /v2/embeddings` | `embeddinggemma-2` (Provisioned Throughput) | Rs 2 per 1M input tokens | 8,192 tokens | | No |
| Document AI | doc-ai jobs | Sarvam Vision (3B) | Parse Rs 0.50/page; Extract Rs 1.00/page | see section 11 | 200 / 30 req/min | Later |
| Document translation | translate-document jobs | | Rs 5.00 per 1K billable characters per target language; Rs 1 minimum | | 200 req/min | Later |
| Dubbing | dubbing jobs | | Rs 40/min | | 5 req/min | No |

---

## 3. Speech to text (Saaras)

### 3.1 Models

| Model | Status | Where it runs | Notes |
|---|---|---|---|
| `saaras:v4` | Default; Sarvam calls it "recommended, latest" (B, [REST ref](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe.md)). Launch blog dated 25 Sep 2026 (B, [v4 blog](https://www.sarvam.ai/blogs/introducing-saaras-v4)). | REST, batch, legacy socket, realtime socket | 22 Indic languages plus Indian and Global English. Keyterms. A 3B hybrid state-space decoder trained from scratch (B, v4 blog). |
| `saaras:v3` | Still available (B, [Saaras page](https://docs.sarvam.ai/api/api-guides-tutorials/models/saaras.md)). Launch blog dated 11 Feb 2026 (B, [v3 blog](https://sarvam.ai/blogs/asr)). | REST, batch, legacy socket; default on `/speech-to-text-translate` | Indian English only. No keyterms. |
| `saaras:v3-realtime` | Realtime socket only (B, [realtime WS](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe/realtime/ws.md)) | Realtime | Sending `keyterms` returns `invalid_request` (B) |
| `saaras:v2.5` | "Deprecated soon", with no date (B, Saaras page) | `/speech-to-text-translate` only | 11 languages |
| `saarika:v2.5` | Deprecated, with no date. Replaced by `saaras:v4` with `mode=transcribe` (B, [Saarika](https://docs.sarvam.ai/api/getting-started/models/saarika.md)). | | |

No audio-LLM ("Sarvam Audio") model appears in the API model catalogue (B, [models](https://docs.sarvam.ai/api/getting-started/models.md)).

### 3.2 Output modes (v3 and v4)

Source for this list: (B, [output modes](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/how-to/select-output-mode.md), [keyterms guide](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/how-to/keyterms.md)).

- `transcribe` (default): native script, with numbers normalised to digits. **English words are written in the native script.**
- `translate`: English text, whatever language was spoken.
- `verbatim`: word for word. Filler words stay in, numbers stay as spoken words, and there is no normalisation.
- `translit`: romanised, Latin-script output.
- `codemix`: English words in Latin script, Indic words in native script. Sarvam suggests it for mixed-language speech and for terms that must stay in Latin script.

The docs' only examples are Hindi; there is no Tamil example (B). Jarvis's own 40-clip bench measured Tanglish WER 0.612 (Whisper) against 0.138 (Sarvam, codemix) (from the brief).

### 3.3 REST: `POST https://api.sarvam.ai/speech-to-text` (multipart/form-data)

Sources for this section (B, [REST ref](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe.md), [OpenAPI](https://docs.sarvam.ai/openapi/apis.json), [STT FAQ](https://docs.sarvam.ai/api/speech-to-text/faq.md)).

| Field | Type | Values (B) | Jarvis value (M) |
|---|---|---|---|
| `file` | binary, the only required field | WAV, MP3, AAC, AIFF, OGG, OPUS, FLAC, MP4/M4A, AMR, WMA, WebM, PCM. Best at 16 kHz. Multichannel audio is merged to mono. REST and batch accept 8, 16, 22.05 and 44.1 kHz. | 16 kHz mono WAV, as today |
| `model` | enum | `saaras:v3`, `saaras:v4`; default v4 | `saaras:v4`, always sent |
| `mode` | enum or null | the 5 modes; default `transcribe` | `codemix` |
| `language_code` | enum | `unknown` (auto-detect) plus 23 codes, including `ta-IN` and `en-IN` | `unknown` |
| `keyterms` | array of strings or null, sent as a JSON-encoded array in one form field | Up to 50 terms of up to 64 characters each. One phrase per item; never a comma-separated string. v4 only. | today's list (section 13.2) |
| `with_timestamps` | boolean, default false | Chunk-level timestamps (phrases, not words) | false |
| `input_audio_codec` | enum | Needed only for PCM (`pcm_s16le`, `pcm_l16`, `pcm_raw`, 16 kHz only). The full enum includes `wav`, `mp3`, `aac`, `aiff`, `ogg`, `opus`, `flac`, `mp4`, `x-m4a`, `amr`, `x-ms-wma` and `webm`. | omit |

- **No `prompt` field:** the `/speech-to-text` operation has none (B, OpenAPI). `prompt` exists only on the legacy `/speech-to-text-translate` endpoint and on the realtime socket (B).
- **Limits:**
  - 30 s of audio per request (B). For longer audio, use batch, which takes up to 2 h (B).
  - No file-size limit is stated (B).
- **Response 200** (B):
  - Shape: `{ request_id: string|null, transcript: string, language_code: string|null, language_probability?: number|null, timestamps?: { words: string[], start_time_seconds: number[], end_time_seconds: number[] }|null }`.
  - `language_code` is the most predominant language detected, or null if none is detected.
  - Despite its name, `words` holds phrase chunks.
- **Diarization:** not available on REST. It is batch only (B).

### 3.4 Keyterms (keyterm prompting)

Sources for this section (B, [keyterms guide](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/how-to/keyterms.md), [v4 blog](https://www.sarvam.ai/blogs/introducing-saaras-v4)).

- **Name:** `keyterms`. The older `keyterm` and `hotwords` fields are deprecated; do not send them (B).
- **Limits:** at most 50 distinct terms, at most 64 characters per term, and no total-length limit stated (B).
- **Format:** an array of strings, one phrase per item (for example `["Sarvam","New Delhi","Vistaar"]`) (B).
  - REST: the JSON-encoded array goes in one multipart field.
  - Batch: a plain JSON array inside `job_parameters`.
  - WebSocket: the JSON-encoded array, URL-encoded as a query parameter.
- **Where it works:** `saaras:v4` only. It works on REST, batch (including every chunk of a diarized batch), the legacy socket and the realtime socket (B).
  - Another page says keyterms work on REST and batch only (B, [language codes](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/how-to/specify-language-codes.md)). See section 13.4.
- **Effect:** keyterms bias recognition but do not guarantee a term appears. There is no boost or weight parameter (B).
- **Price:** the guide does not mention one (B). The pricing pages charge only per minute, so keyterms appear to cost nothing extra (M).
- **Script:** the guide gives no guidance on Tamil script versus Latin script (B). Two pointers:
  - The v4 blog's best result, 16.03 % WER on IndicContextEval, came from the "L5" setting: a list of domain entities given **in native script, along with the language** (B).
  - In `codemix` output, English words stay in Latin script and Tamil words are written in Tamil script (B, section 3.2).
  - So each term should be in the script it will appear in within the output (M): Latin for English words, acronyms and brands ("GCC", "RMC"), Tamil script for Tamil names when spoken in Tamil.
- **Changing the list:**
  - REST: per request, so the list can change on every call (M).
  - Legacy socket: fixed for the session (B).
  - Realtime socket: the guide says `config.update` can change keyterms mid-call, but the AsyncAPI schema for `config.update` has no `keyterms` field (B, [AsyncAPI](https://docs.sarvam.ai/asyncapi.json)). Reconnect to change the list (M).

### 3.5 Realtime socket: `wss://api.sarvam.ai/speech-to-text-realtime/ws`

Sources for this section (B, [realtime WS ref](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe/realtime/ws.md), [realtime guide](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/realtime-streaming.md), [AsyncAPI](https://docs.sarvam.ai/asyncapi.json)).

**Query parameters.** All are passed as strings.

| Parameter | Values | Default |
|---|---|---|
| `language_code` | **required**: `auto` or a BCP-47 code. Odia is `or-IN` here and `od-IN` on REST. | none |
| `model` | `saaras:v4`, `saaras:v3-realtime` | `saaras:v4` |
| `stream_type` | `fast` (lowest-latency partials), `balanced` (more accurate partials), `simulated` (no partials) | `balanced` |
| `mode` | the 5 modes, **applied to the final transcript only**; partials are always plain transcription | `transcribe` |
| `prompt` | free-text context hint (described as non-streaming; no length limit stated) | none |
| `keyterms` | a JSON-encoded string; v4 only | none |
| `endpointing` | `vad` (the server finds turn ends) or `manual` (the client sends `speech_start` and `speech_end`) | `vad` |
| `encoding` | `linear16`, `linear32`, `mulaw`, `alaw`; mono only | `linear16` |
| `sample_rate` | `8000`, `16000`; any other value closes the socket with 4000 | `16000` |
| `return_timestamps` | `true` adds `start_s` and `end_s` to finals | `false` |
| `threshold`, `prefix_padding_ms`, `silence_duration_ms`, `min_speech_duration_ms` | VAD settings; ignored with `manual` | 0.3, 300, 1000, 250 |

**Client events.** Each is a flat JSON object.

- `{"event":"audio_input","audio":"<base64>"}`.
- `speech_start` and `speech_end` (manual endpointing only).
- `flush`, which forces the buffered audio to finalise (manual only).
- `{"event":"config.update", ...}` carrying `language_code`, `prompt`, `mode`, `stream_type` (`fast` or `balanced` only), `endpointing`, `threshold`, `silence_duration_ms`, `min_speech_duration_ms`.
  - Language, prompt, mode, stream type and endpointing take effect at the next utterance boundary. The VAD settings take effect at once.
  - The `language_code` description says it re-arms auto-LID and resets the "sticky language".
- `end` and `ping`.

**Server events.** Each is a flat JSON object with no `data` wrapper (B, AsyncAPI).

- `session.begin`: `{request_id, config}`.
- `vad.speech_start` and `vad.speech_end`: `{utterance_idx, confidence}`.
- `transcript.partial`: `{utterance_idx, text, language?}`.
- `transcript.final`: `{utterance_idx, text, language?, language_confidence?, start_s?, end_s?}`. `language` and `language_confidence` are present only with `auto`.
- `config.updated`: `{applied:[...]}`.
- `pong`.
- `session.end`: `{request_id, total_duration_s, total_utterances, audio_duration_s}`, where **`audio_duration_s` is the billed quantity**.
- `error`: `{code, is_fatal, message, status_code?}`.

**Limits:**

- The socket closes after 60 s without audio (B).
- On `fast`, one frame may be at most 16,000 bytes, which is 500 ms at 16 kHz (B).
- The examples send about 100 ms (3,200 bytes) a frame (B).
- No maximum session length is stated, though the reference mentions a "max duration" close (B).
- The plan allows 20 concurrent STT sockets (B, pricing).
- The AsyncAPI spec gives this channel **no beta marker**; only voice cloning is marked beta (B). Close code 4000 still lists "beta denied", and the guide adds "account not enabled" (B). Whether a pay-as-you-go key can open this socket is therefore UNCONFIRMED.

### 3.6 Legacy socket: `wss://api.sarvam.ai/speech-to-text/ws`

Sources for this section (B, [legacy WS ref](https://docs.sarvam.ai/api-reference/legacy/speech-to-text/transcribe/ws.md), [streaming guide](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/streaming-api.md)).

- **Query parameters:**
  - `language-code` (with a hyphen in the reference; the guide's table writes `language_code`), default `unknown`.
  - `model`: `saaras:v4` or `saaras:v3`.
  - `mode`, `keyterms`, `sample_rate` (16000 or 8000), `input_audio_codec`.
  - `high_vad_sensitivity`, `vad_signals`, `flush_signal`, and ten frame-count VAD settings.
- **Messages:**
  - Audio goes up as `{"audio":{"data":"<base64>","sample_rate":"16000","encoding":"audio/wav"}}`. A flush is `{"type":"flush"}`.
  - A final comes back once per utterance: `{"type":"data","data":{request_id, transcript, language_code, language_probability, metrics:{audio_duration, processing_latency}}}`.
- **Formats:** WAV or raw PCM only.
- **SDK bug:** the JS SDK's `connect()` silently drops `mode` (B, streaming guide).
- **Status:** Sarvam says the realtime socket supersedes this one for new voice-agent work (B).

### 3.7 Batch

Source for this section (B, [batch guide](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/batch-api.md)).

- **Calls:**
  - `POST /speech-to-text/job/v1` creates the job.
  - Upload the files, then start the job.
  - `GET /speech-to-text/job/v1/{job_id}/status` reports progress.
  - `POST /speech-to-text/job/v1/download-files` with `{job_id, files:["0.json"]}` fetches results.
- **`job_parameters`:** `model`, `mode`, `language_code`, `with_diarization`, `num_speakers`, `keyterms`, `input_audio_codec`.
- **Limits:** up to 20 files a job, up to 2 h a file, and up to 20 speakers when diarizing.
- **Latency:** "minutes", depending on the queue (B, [which-API](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/which-api-to-use.md)). That rules it out for live turns (M).

### 3.8 Price

- **Rates:** real-time, streaming and batch cost Rs 0.49 a minute on pay as you go, Rs 0.45 on Pro, Rs 0.41 on Growth and Rs 0.38 on Business. Batch with diarization costs Rs 0.59 a minute on pay as you go (B, [pricing](https://docs.sarvam.ai/api/getting-started/pricing.md), [api-pricing](https://www.sarvam.ai/api-pricing)).
- **Billing:** per second. Duration is rounded up to the whole second, with a 1 s minimum (B, [STT FAQ](https://docs.sarvam.ai/api/speech-to-text/faq.md)).
- **Surcharges:** the FAQ adds 20 % for diarization, which matches 0.59 against 0.49, and **10 % for language detection** (B). Neither pricing page shows the 10 % (B), so it is UNCONFIRMED.
- **Sockets:** a socket is billed on the `audio_duration_s` it is fed (B). An open microphone streaming all day would bill silence at Rs 29.40 an hour (M).

### 3.9 What STT gives you to decide "ask instead of guess"

- **REST:**
  - `language_probability`, 0.0–1.0: Sarvam's confidence in the *detected language*, not in the words.
  - It is returned only when `language_code` is `unknown` or left out, and is null when a code is given (B, [REST ref](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe.md), [Saaras](https://docs.sarvam.ai/api/api-guides-tutorials/models/saaras.md)).
- **Legacy socket:** the same `language_probability` on finals, plus `metrics.processing_latency` in seconds (B).
- **Realtime socket:**
  - `language_confidence`, 0–1, on `transcript.final`, and only with `language_code=auto`.
  - `confidence` on the VAD events.
  - Partials carry no confidence. Finals never carry word confidence or a `words` array (B, [realtime ref](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe/realtime/ws.md)).
- **What no STT endpoint gives:** per-word confidence, log-probabilities, n-best lists or alternatives (B: none of these is in the REST or socket schemas).
- **Signals outside STT:**
  - Chat `logprobs` on `sarvam-105b` (B, section 9).
  - Prism's calibrated option probabilities (B, section 10).
  - Agreement between the Whisper and Sarvam readings, which Jarvis already computes in `sarvam.ts` (M).

### 3.10 Latency (vendor claims only)

- **Streaming:** v4 time to first token below 150 ms (B, [v4 blog](https://www.sarvam.ai/blogs/introducing-saaras-v4), 25 Sep 2026). Saaras v3's realtime "Fast" mode targets the same sub-150 ms start (B, [v3 blog](https://sarvam.ai/blogs/asr)).
- **Product page:** median latency under 250 ms, uptime above 99.5 % (B, [STT page](https://www.sarvam.ai/apis/speech-to-text)).
- **REST:** no published figure, only "one round-trip after upload" (B, [which-API](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/which-api-to-use.md)). Jarvis's own v9 bench measured p50 281 ms and p90 403 ms per call (from the brief).
- **Region:** managed production runs on Azure Central India (B, trust center).

---

## 4. Speech to English text

- **New endpoint:** `POST /speech-to-text` with `mode=translate` gives English text from speech in any of the 22 Indic languages, on v3 or v4 (B, [output modes](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/how-to/select-output-mode.md)). Sarvam recommends this form for new integrations (B, [STT overview](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/overview.md)).
- **Legacy endpoint:** `POST /speech-to-text-translate` (multipart) (B, [legacy translate ref](https://docs.sarvam.ai/api-reference/legacy/speech-to-text-translate/translate.md)).
  - `model` is `saaras:v3` (the default) or `saaras:v2.5`. `saaras:v4` is **not** accepted here.
  - It accepts `prompt`, a string of conversation context with no stated maximum.
  - The response matches REST STT. `diarized_transcript` is always null.
- **One mode per call:** a single call or socket gives a single mode. To get both a `codemix` reading and an English reading of the same clip, Jarvis would make two calls and pay twice (M).

---

## 5. Text translation: `POST https://api.sarvam.ai/translate` (JSON)

Sources for this section (B, [translate ref](https://docs.sarvam.ai/api-reference/text/translate-text.md), [translation guide](https://docs.sarvam.ai/api/api-guides-tutorials/text-processing/translation.md), [Mayura](https://docs.sarvam.ai/api/api-guides-tutorials/models/mayura.md), [Sarvam-Translate](https://docs.sarvam.ai/api/api-guides-tutorials/models/sarvam-translate.md), [OpenAPI](https://docs.sarvam.ai/openapi/apis.json)).

| | `mayura:v1` | `sarvam-translate:v1` |
|---|---|---|
| Languages | 11: en, hi, bn, **ta**, te, gu, kn, ml, mr, pa, od, each to and from English | 23: English plus all 22 scheduled languages, both directions |
| Input limit | 1,000 characters | 2,000 characters (the schema's `maxLength` is 2,000) |
| `mode` | `formal` (default), `modern-colloquial`, `classic-colloquial`, `code-mixed` | `formal` only |
| `output_script` | `roman`, `fully-native`, `spoken-form-in-native`; null means no transliteration | not supported |
| `source_language_code: "auto"` | yes. Detection runs only when `auto` is sent. | no |
| `numerals_format` | `international` (default, 0–9) or `native` | the same |
| `speaker_gender` | `Male` or `Female` | (accepted by the schema) |

- **Response:** `{ request_id, translated_text, source_language_code }`. There is no confidence field (B).
- **`output_script` example**, for the English input "Your EMI of Rs. 3000 is pending" (B, Mayura):
  - `roman` gives a Latin-script Hindi sentence.
  - `fully-native` gives native script with digits.
  - `spoken-form-in-native` spells out the number and the acronym for speech.
  - No Tamil example is published (B).
- **Code-mixed or romanised input:** acceptance is not stated (B). A 1 Mar 2025 changelog entry says translation "improves handling of multilingual and code-switched inputs" (B, [changelog](https://docs.sarvam.ai/changelog/2025/3/1.md)).
- **Errors:** 400, 403, 422, 429 ("quota exceeded"), 500 (B).
- **Price:** Rs 2.00 per 1,000 characters ("formal and colloquial"), the same line for both models (B, pricing). No latency figure is published (B).
- **Open weights:** `sarvam-translate` is a Gemma 3 4B fine-tune with an 8K-token context, under the **GPL-3.0** licence (B, [HF card](https://huggingface.co/sarvamai/sarvam-translate)). Running it on the laptop's CPU would be slow (M).

## 6. Transliteration: `POST https://api.sarvam.ai/transliterate` (JSON)

Sources for this section (B, [transliterate ref](https://docs.sarvam.ai/api-reference/text/transliterate-text.md), [guide](https://docs.sarvam.ai/api/api-guides-tutorials/text-processing/transliteration.md), [OpenAPI](https://docs.sarvam.ai/openapi/apis.json)).

- **Request:**
  - `input`: required, at most 1,000 characters (the schema's `maxLength`). Longer input returns 422.
  - `source_language_code`: `auto` or one of 11 codes.
  - `target_language_code`: one of the 11 codes; `auto` is not allowed.
  - `numerals_format`: `international` or `native`.
  - `spoken_form`: boolean, default false. It has no effect when the target is `en-IN`.
  - `spoken_form_numerals_language`: `english` or `native`, used only when `spoken_form` is true.
- **Response:** `{ request_id, transliterated_text, source_language_code }`.
- **Directions:**
  - Indic script to Latin: source is the Indic code, target is `en-IN`.
  - Latin to Indic script: the guide's response example uses source `en-IN`, target the Indic code, for romanised or code-mixed text (B).
  - Indic to Indic is not explicitly covered (B).
  - No Tamil example is published (B).
- **Spoken form:** converts digits, currency and times into words for speech. Sarvam's example turns "9:30am" into the spoken Hindi time (B).
- **Price:** Rs 2.00 per 1,000 characters (B, pricing). No rate limit or latency figure is published (B).

## 7. Language identification: `POST https://api.sarvam.ai/text-lid` (JSON)

Sources for this section (B, [LID ref](https://docs.sarvam.ai/api-reference/text/identify-language.md), [LID guide](https://docs.sarvam.ai/api/api-guides-tutorials/text-processing/language-detection.md)).

- **Request:** `{ "input": "<at most 1,000 characters>" }`. Longer input returns 422.
- **Response:** `{ request_id, language_code, script_code }`, with **no confidence**.
- **Values:**
  - Languages: en, hi, bn, gu, kn, ml, mr, od, pa, ta, te, each with the `-IN` suffix.
  - Scripts: `Latn`, `Deva`, `Beng`, `Gujr`, `Knda`, `Mlym`, `Orya`, `Guru`, `Taml`, `Telu`.
- **Romanised Tamil (Tanglish):** the docs show no example, and only English is shown with `Latn` (B). What it returns for Tanglish is UNCONFIRMED.
- **Price:** Rs 0.35 per 1,000 characters (B, pricing).

## 8. Text to speech (Bulbul)

Sources for this section (B, [Bulbul](https://docs.sarvam.ai/api/api-guides-tutorials/models/bulbul.md), [TTS REST ref](https://docs.sarvam.ai/api-reference/text-to-speech/convert.md), [HTTP stream ref](https://docs.sarvam.ai/api-reference/text-to-speech/convert-stream.md), [TTS WS ref](https://docs.sarvam.ai/api-reference/text-to-speech/stream.md), [voices](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices.md), [v4 Flash best practices](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/best-practices.md), [v3 best practices](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/bulbul-v3-best-practices.md), [TTS overview](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/overview.md)).

- **Models:**
  - `bulbul:v4-flash` is the newest. It has 222 persona voices in 10 languages, including Tamil but not Malayalam or Odia.
  - `bulbul:v3` is the REST default when `model` is left out. It has 30-plus speakers in 11 languages.
  - `bulbul:v2` is legacy.
  - The HTTP stream and socket default to `bulbul:v2`, so always send `model`.
- **Tamil voices:**
  - v4 Flash: `aravind_ta_ads`, `aravind_ta_suspense`, `gokul_ta_narration`, `vijay_ta_narration`. The best-practice guide calls Tamil coverage narrow and says to audition the voices carefully.
  - v3: Sarvam recommends `ratan` and `rohan` (male) and `ishita` and `ritu` (female) for `ta-IN`.
  - v3-to-v4 mapping: `gokul` becomes `gokul_ta_narration` and `vijay` becomes `vijay_ta_narration`.
- **REST request** (`POST /text-to-speech`):
  - `text`: required; at most 2,500 characters for v3 and v4 Flash, 1,500 for v2.
  - `language_code`: required, one of the 11 codes.
  - `speaker`: lowercase and case-sensitive, and must belong to the chosen model.
  - `model`.
  - `pace`: 0.5–2.0 on v3 and v4 Flash.
  - `temperature`: 0.01–1.0, default 0.6, v3 and v4 Flash.
  - `speech_sample_rate`: 8000 up to 48000, default 22050. The rates above 24000 work on REST only.
  - `output_audio_codec`: default `wav`. `opus` fails validation on v3 and v4 Flash.
  - `dict_id`: v3 and v4 Flash.
- **REST response:** `{ request_id, audios: ["<base64>"] }`.
- **Streaming:**
  - The HTTP stream (`POST /text-to-speech/stream`) takes up to 3,500 characters and returns audio bytes, for example `audio/mpeg`.
  - The socket takes up to 2,500 characters a message, with under 500 recommended for the lowest latency. It speaks MP3 only and closes after 1 minute idle. Its client messages are `config`, `text`, `flush` and `ping`.
- **Writing Tamil for Bulbul:**
  - Write Tamil words in Tamil script and English words in Latin script. Romanised Indic text "degrades quality".
  - There is no SSML.
  - No latency figure in milliseconds is published.
- **Price:** Bulbul v3 costs Rs 3.00 per 1,000 characters on pay as you go. **Bulbul v4 Flash costs Rs 1.00 on the docs pricing page but Rs 2.00 on sarvam.ai/api-pricing** (B, [pricing](https://docs.sarvam.ai/api/getting-started/pricing.md), [api-pricing](https://www.sarvam.ai/api-pricing)). Characters are rounded to the nearest whole character (B).
- **Pronunciation dictionary** (B, [pronunciation dictionary](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/pronunciation-dictionary.md)):
  - A JSON file under a `pronunciations` key that maps a language code to word-to-replacement pairs. Sarvam's Tamil example writes "EMI" as Tamil letters.
  - Limits: 100 words a dictionary, 10 dictionaries a user, 1 MB, one dictionary a request.
  - It is passed as `dict_id` on REST, the HTTP stream and the socket.
  - It applies only to exact matches.
- **Voice Agents only:** Bulbul v3 reached end of life for Voice Agents on 10 Nov 2026. It stays on the TTS API (B, [changelog 14 Oct](https://docs.sarvam.ai/changelog/2026/10/14.md)).

## 9. Chat LLMs (Token Factory)

Sources for this section (B, [Token Factory](https://docs.sarvam.ai/api/token-factory.md), [Sarvam-105B](https://docs.sarvam.ai/api/token-factory/models/sarvam-105b.md), [chat v2 ref](https://docs.sarvam.ai/api-reference/chat/chat-completions-v2.md), [chat v1 ref](https://docs.sarvam.ai/api-reference/chat/chat-completions-v1.md), [models](https://docs.sarvam.ai/api/getting-started/models.md), [HF card](https://huggingface.co/sarvamai/sarvam-105b), [pricing](https://docs.sarvam.ai/api/getting-started/pricing.md)).

- **Endpoints:**
  - `POST /v1/chat/completions` serves only `sarvam-105b` and `sarvam-105b-conversations`.
  - `POST /v2/chat/completions` is OpenAI-compatible: point the client at `https://api.sarvam.ai/v2`.
  - There is also a Responses API, and `POST /v2/embeddings`.
- **`sarvam-105b`:**
  - A mixture-of-experts model with 106B parameters in total and 10.3B active per token, released under Apache-2.0 (B, HF).
  - It has a 128K-token context. The `max_tokens` ceiling depends on the plan: Starter 4,096, Pro 16,384, Business 128,000. The default is 2,048 tokens, and reasoning tokens count toward it.
  - Sarvam claims the 10 most-spoken Indian languages plus English, in native script, romanised and code-mixed text, and says it wins 90 % of pairwise comparisons on Indian-language benchmarks. **No Tamil-specific number is published** (B).
  - No throughput or time-to-first-token figure is published (B).
- **`sarvam-105b-conversations`:** a 32K context with reasoning always off, tuned for voice agents.
- **Price:** Rs 10 input, Rs 0.25 cached input and Rs 25 output per 1M tokens, an introductory price that runs to the end of 2026. Reasoning tokens are billed as output. The rate limit is 60 req/min on pay as you go.
- **Main v2 fields:**
  - `reasoning_effort`: `none`, `low`, `medium`, `high`, `max`.
  - `tools` and `tool_choice`.
  - `response_format`, either a `json_schema` (with `strict`) or a `json_object`.
  - `logprobs` and `top_logprobs`, supported on `sarvam-105b`.
  - `stop` (up to 4 sequences) and `seed`.
  - `n`: only 1 is allowed, and values above 1 return 400 since 7 Nov 2026 (B, [changelog](https://docs.sarvam.ai/changelog/2026/11/7.md)).
  - The request body may be at most 10 MiB.
- **Other models served:** `gemma4`, `glm5.3`, `glm5.3-flash` and `deepseekv4.1-flash-1017`, which are serverless, and further models on Provisioned Throughput (B, [pricing](https://docs.sarvam.ai/api/getting-started/pricing.md)).
- **Withdrawn:** Sarvam-M, a 24B model built on Mistral Small, is deprecated and no longer served, and calls to it fail. Sarvam-30B is deprecated. Both are replaced by `sarvam-105b` (B, [Sarvam-M](https://docs.sarvam.ai/api/getting-started/models/sarvam-m.md), [models](https://docs.sarvam.ai/api/getting-started/models.md)).
- **Data handling:** the Token Factory page says nothing about retention for LLM calls (B). The workspace data policy in section 1.6 applies (M).

## 10. Decisions API (Sarvam Prism): `POST https://api.sarvam.ai/v2/systemone`

Sources for this section (B, [Decisions API](https://docs.sarvam.ai/api/token-factory/decisions-api.md), [Prism](https://docs.sarvam.ai/api/token-factory/models/sarvam-prism.md)).

- **What it is:** `sarvam-prism` is a "System-1" decision model built on Sarvam-105B. It generates no text. It returns a probability for each option.
- **Request:** `{ model, state, questions: { <id>: { type, instructions, criteria } } }`.
- **Question types:**
  - `noul` (yes or no) returns `noul`, the probability of "yes".
  - `choice` takes 2–255 options and returns `choice`, `confidence` and `probabilities`.
  - `score` takes 2–10 ordered levels and returns `score` (a float), `confidence`, `legend` and `probabilities`.
- **Usage field:** `output_tokens` is always 0.
- **Limits:** 32,768 tokens a question (state plus options). A request must finish within 60 s, or it returns 503.
- **Languages:** English, 10 Indian languages and Hinglish.
- **Calibration:** Sarvam calls the probabilities calibrated. On answers given at 90 % or more, Sarvam reports 2.2 % wrong against 3.3 % expected, and 4.4 % wrong against 5.4 % expected in Indian languages.
- **Thresholds:** the guide's example acts automatically only when `probabilities[choice] >= 0.9` and hands everything else to a person. Threshold on the top probability, not on `confidence`.
- **Price:** Rs 4 per 1M input tokens and Rs 0 output, "on every plan" (B, Prism page).
- **Access:** the Decisions API guide says `sarvam-prism` and `clef` both run on Provisioned Throughput, which is enabled per organisation (B). Pay-as-you-go access is UNCONFIRMED.

## 11. Documents: Sarvam Vision, Document AI, Document Translation

- **Sarvam Vision:**
  - A 3B state-space vision-language model for documents, covering 23 languages including Tamil (B, [Sarvam Vision](https://docs.sarvam.ai/api/api-guides-tutorials/models/sarvam-vision.md)).
  - Document AI is an async job API: create an upload URL, then parse, extract, split or classify, then poll status and fetch results or a download URL (B, [API index](https://docs.sarvam.ai/api-reference/llms.txt)).
  - Inputs: PDF, PNG, JPG and ZIP. TIFF works for split and classify only (B, [limits](https://docs.sarvam.ai/api/api-guides-tutorials/document-intelligence/languages-formats-limits.md)).
- **Limits conflict:**
  - The limits page gives 30 pages per parse, 20 per extract, 500 per split or classify, and 200 MB per file.
  - The Vision page gives 10 pages per PDF and 10 req/min.
  - The pricing page gives 200 req/min for parse. Its rate-limit table also labels Parse "20 pages a request" and Extract "30", the reverse of the limits page (B, [pricing](https://docs.sarvam.ai/api/getting-started/pricing.md)).
- **Price:** parse Rs 0.50 a page, extract Rs 1.00 a page (B, [pricing](https://docs.sarvam.ai/api/getting-started/pricing.md)).
- **Document translation:** Rs 5.00 per 1,000 billable characters per target language, rounded up to the rupee, with a Rs 1 minimum (B, pricing).
- **Jarvis use:** later, for Tamil government orders and scanned petitions. Not needed for v10 (M).

## 12. Other products (not for v10)

- **Instant Voice Cloning (beta):** Rs 2.00 per 1,000 characters (B, pricing). A free watermark-detect endpoint shipped on 9 Nov 2026 at 5 req/min (B, [changelog](https://docs.sarvam.ai/changelog/2026/11/9.md)).
- **Dubbing:** Rs 40 a minute (B, pricing).
- **Voice Agents (Samvaad):** advertised "from Rs 3 a minute" (B, [STT page](https://www.sarvam.ai/apis/speech-to-text)).
- **Studio products:** Content Studio and Cowork are UIs, not APIs.
- **Self-hosting:** Saaras v3, Bulbul v3 and Vision can be self-hosted on SageMaker (B, [API index](https://docs.sarvam.ai/api/llms.txt)).
- **Beta list:** the "Beta APIs" page lists no current beta APIs (B, [beta APIs](https://docs.sarvam.ai/api-reference/beta-apis.md)).
- **Docs for agents:** the docs offer `llms.txt` indexes and an MCP server at `https://docs.sarvam.ai/_mcp/server` (B, [SDK page](https://docs.sarvam.ai/api/getting-started/sdks.md)).

---

## 13. For Jarvis

### 13.1 Which APIs clearly help

1. **REST STT with today's keyterms (already wired; make the list daily).**
   - `saaras:v4` with `codemix` cut Tanglish WER from 0.612 to 0.138 on Jarvis's bench (from the brief).
   - Keyterms are per request and appear to add no cost, so the list can follow the news and the screen on every turn (M).
   - The repo's `StoryItem` already holds `title`, `titleEn` and `story` (`chennai-grievance-portal-main/src/lib/thunai/v8/news8.ts`), and `placesOf(world)` lists place names (`.../v8/newsfind.ts`). Today's keyterms can come from these, at no extra call (M).
2. **The realtime socket for latency (prototype only).**
   - Audio uploads while the Collector speaks, and v4 claims under 150 ms to first token (B).
   - **But** partials are always plain `transcribe`, so English words in a Tamil sentence arrive in Tamil script, and Jarvis's English matcher cannot use them (M from B, section 3.5). Only the final carries `codemix`.
   - REST already measures p50 281 ms, so the gain is the finalisation time after the button is released, which has to be measured (M).
3. **Translation for news.** Read a Tamil story out in English (`sarvam-translate:v1`, formal), and give an English answer back in Tamil (`mayura:v1`, colloquial, with native, roman or spoken-form output). This is on demand, cached per story, and billed per character (M).
4. **Transliteration, occasionally.**
   - Tamil script to Latin for display, or Tanglish to Tamil script before searching Tamil headlines.
   - Calling it on every turn would cost more than the STT itself (about Rs 0.12 for a 60-character line; M). Per-turn matching should stay local (M).
5. **Language ID.** No clear gain. `sarvam.ts` already reads Tamil script locally for free. `/text-lid` is worth having only if it labels Tanglish as `ta-IN` with script `Latn`, which is UNCONFIRMED (M).
6. **Prism as an "ask instead of guess" gate (probe).** Calibrated option probabilities for about Rs 0.0016 a turn (400 tokens at Rs 4 per 1M; M). Its access is UNCONFIRMED (section 10).

### 13.2 Exact request shapes (TypeScript, server-side only)

**(a) REST STT with today's keyterms.** This is (M), built from the (B) shapes in sections 3.3 and 3.4.

```ts
const KEYTERMS_MAX = 50, KEYTERM_CHARS = 64;                       // Sarvam's limits (B)
/** Up to 50 phrases: on-screen names first, then today's news names, then the fixed zones. */
export function dayKeyterms(onScreen: string[], news: string[], fixed: string[]): string {
  const seen = new Set<string>(), out: string[] = [];
  for (const raw of [...onScreen, ...news, ...fixed].flatMap((t) => t.split(","))) {   // never a comma list in one item (B)
    const t = raw.normalize("NFC").replace(/\s+/g, " ").trim(), k = t.toLowerCase();
    if (!t || t.length > KEYTERM_CHARS || seen.has(k)) continue;
    seen.add(k); out.push(t);
    if (out.length === KEYTERMS_MAX) break;
  }
  return JSON.stringify(out);                                        // one multipart field holding a JSON array (B)
}

const f = new FormData();
f.append("file", wav, "speech.wav");            // 16 kHz mono WAV, under 30 s (B)
f.append("model", "saaras:v4");                 // send it: the JS SDK still documents v3 as default (B)
f.append("mode", "codemix");
f.append("language_code", "unknown");           // the only way to get language_probability back (B)
f.append("keyterms", dayKeyterms(screenNames, todaysNames, ZONE_NAMES));
const r = await fetch("https://api.sarvam.ai/speech-to-text", {
  method: "POST", headers: { "api-subscription-key": process.env.SARVAM_API_KEY! }, body: f, signal: AbortSignal.timeout(2500),
});
// 200 → { request_id, transcript, language_code, language_probability, timestamps? }
// 402, or 429 with code insufficient_quota_error → credit spent; 429 otherwise → busy; 403 → bad key (section 1.3)
```

**(b) Realtime socket for push-to-talk, relayed by the server.** This is (M), built from the (B) shapes in section 3.5. The key never reaches the browser.

```ts
import WebSocket from "ws";  // the SDK's own dependency. Node 24's global WebSocket could instead authenticate from the server
                             // with the subprotocol `api-subscription-key.<key>` (B: realtime ref); test which works.
const q = new URLSearchParams({
  model: "saaras:v4", language_code: "auto", mode: "codemix", stream_type: "fast",
  endpointing: "manual", encoding: "linear16", sample_rate: "16000",
  keyterms: dayKeyterms(screenNames, todaysNames, ZONE_NAMES),     // JSON array, URL-encoded (B)
});
const ws = new WebSocket(`wss://api.sarvam.ai/speech-to-text-realtime/ws?${q}`, { headers: { "api-subscription-key": key } });
ws.on("open", () => ws.send(JSON.stringify({ event: "speech_start" })));            // button pressed
const push = (pcm16k: Buffer) =>                                                     // ~100 ms = 3,200 bytes; at most 16,000 on `fast` (B)
  ws.send(JSON.stringify({ event: "audio_input", audio: pcm16k.toString("base64") }));
const release = () => ws.send(JSON.stringify({ event: "speech_end" }));               // whether {"event":"flush"} is also needed: UNCONFIRMED
ws.on("message", (raw) => {
  const e = JSON.parse(String(raw));                                                 // flat events, no `data` wrapper (B)
  if (e.event === "transcript.final") {                                              // e.text (codemix), e.language, e.language_confidence
    ws.send(JSON.stringify({ event: "end" }));
  } else if (e.event === "session.end") {                                            // e.audio_duration_s → the ledger's billed seconds
  } else if (e.event === "error" && e.is_fatal) {                                    // fall back to REST, then Whisper
  }
});
```

- **Long URL:** Tamil-script keyterms grow the query string fast. Each Tamil code point is 3 UTF-8 bytes, so 9 characters once percent-encoded. Fifty Tamil terms of 64 characters would make a URL of about 29 KB. Sarvam documents no URL limit, so keep the socket's keyterm list short or mostly Latin, and test it (M).
- **Where the relay runs:** Next.js route handlers cannot accept a WebSocket upgrade. There are two options (M):
  - A streamed POST: the browser sends `fetch` with a `ReadableStream` body and `duplex: "half"`, and the route forwards chunks to Sarvam and answers with the final transcript.
  - A small relay in the allowed Python sidecar.
- **Opening and closing:** open the socket on button-down and send `end` after the final. That avoids both the 60 s idle close and the cost of billed silence (M).

**(c) A Tamil story in English, and an answer back in Tamil.** This is (M), built from the (B) shapes in section 5.

```ts
async function sarvamTranslate(body: Record<string, unknown>) {
  const r = await fetch("https://api.sarvam.ai/translate", {
    method: "POST", headers: { "api-subscription-key": key, "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw Object.assign(new Error(`translate ${r.status}`), { status: r.status, body: await r.json().catch(() => null) });
  return (await r.json()) as { request_id: string | null; translated_text: string; source_language_code: string };
}
// Tamil story → English: chunks of at most 2,000 characters, cut at sentence ends; formal only
await sarvamTranslate({ input: chunk, source_language_code: "ta-IN", target_language_code: "en-IN",
  model: "sarvam-translate:v1", mode: "formal", numerals_format: "international" });
// English answer → Tamil: at most 1,000 characters
await sarvamTranslate({ input: answer, source_language_code: "en-IN", target_language_code: "ta-IN",
  model: "mayura:v1", mode: "modern-colloquial", output_script: "fully-native", numerals_format: "international" });
// output_script "roman" = Tamil in Latin letters (Tanglish-like display); "spoken-form-in-native" = numbers and acronyms spelled for TTS;
// mode "code-mixed" keeps English words in the sentence; "formal" for official wording (B: options; M: Tamil results untested)
```

**(d) Transliteration and language ID.** This is (M), built from the (B) shapes in sections 6 and 7.

```jsonc
// POST https://api.sarvam.ai/transliterate   (input ≤ 1,000 characters)
{ "input": "<Tamil-script text>", "source_language_code": "ta-IN", "target_language_code": "en-IN" }          // Tamil → Latin
{ "input": "Velachery-la thanni theriyuma", "source_language_code": "en-IN", "target_language_code": "ta-IN" } // Latin → Tamil (source code as in the guide's example; Tanglish untested)
{ "input": "₹200 kattanum", "source_language_code": "ta-IN", "target_language_code": "ta-IN", "spoken_form": true, "spoken_form_numerals_language": "english" }
// → { "request_id": "...", "transliterated_text": "...", "source_language_code": "..." }

// POST https://api.sarvam.ai/text-lid        (input ≤ 1,000 characters)
{ "input": "<text>" }   // → { "request_id": "...", "language_code": "ta-IN", "script_code": "Taml" }
```

**(e) A Prism gate (probe once the key exists).** This is (M), built from the (B) shape in section 10.

```jsonc
// POST https://api.sarvam.ai/v2/systemone
{ "model": "sarvam-prism",
  "state": "Heard (Sarvam codemix): <transcript>\nHeard (Whisper): <transcript>\nOn screen: news panel, 18 stories",
  "questions": { "act": { "type": "choice", "instructions": "What is the speaker asking the console to do?",
    "criteria": { "open_story": "Open or read a news story", "zone_status": "Status of a zone or locality",
                  "unclear": "Cannot tell; the console should ask again" } } } }
// → { "answers": { "act": { "type": "choice", "choice": "...", "confidence": 0.7, "probabilities": { ... } } }, "usage": { "input_tokens": 153, "output_tokens": 0 } }
// act only if probabilities[choice] ≥ 0.9 (Sarvam's example threshold), otherwise ask the Collector
```

### 13.3 Cost per day, and how long the credit lasts

All of this section is (M), arithmetic on the (B) prices in sections 3.8, 5, 6 and 7.

- **Assumptions:** 150 engaged turns a day, 4.0 s of audio each, one REST call per turn, billed per second rounded up.
- **Light text day:**
  - 2 Tamil story bodies of 1,000 characters each, Tamil to English (2,000 characters).
  - 2 answers of 400 characters, English to Tamil (800 characters).
  - 5 transliterations of 100 characters (500 characters).
  - Total Rs 6.60.
- **Heavy text day:**
  - 3 stories of 1,500 characters (4,500 characters) and 3 answers of 500 characters (1,500 characters).
  - 10 transliterations (1,000 characters) and 20 language-ID calls of 100 characters (2,000 characters).
  - Total Rs 14.70.

| Day | Rs a day before GST | With 18 % GST |
|---|---|---|
| STT only, exactly 4 s a clip, no surcharge: 600 s = 10 min × Rs 0.49 | 4.90 | 5.78 |
| STT only, plus 0.5 s average round-up (675 s) and the 10 % detection surcharge if it applies | 6.06 | 7.15 |
| STT plus the light text day | 11.50–12.66 | 13.57–14.94 |
| STT plus the heavy text day | 19.60–20.76 | 23.13–24.50 |

| How long the credit lasts (days of use) | Free Rs 100 | Rs 500 of credit | Rs 500 paid including GST (Rs 423.73 of credit) |
|---|---|---|---|
| STT only | 16.5–20.4 | 82–102 | 70–86 |
| STT plus light text | 7.9–8.7 | 39–43 | 33–37 |
| STT plus heavy text | 4.8–5.1 | 24–25 | 20–22 |

- **Per turn:** Rs 0.033 (4 s), or Rs 0.036 with the surcharge.
- **Today's daily cap:** `JARVIS_SARVAM_DAY_S` (2,400 s, which is 40 min or Rs 19.60) sits well above the expected 10–11.25 min.
- **Optional extras, per day:**
  - Bulbul for 30 Tamil replies of 200 characters (6,000 characters): Rs 18 on v3, Rs 6–12 on v4 Flash.
  - `sarvam-105b` for all 150 turns at 1,500 input and 300 output tokens each: about Rs 3.40.
  - A Prism gate on every turn: about Rs 0.24.
  - A second `translate`-mode decode on 60 Tamil turns: Rs 1.96–2.16.
  - Streaming instead of REST costs the same per second, as long as the socket is fed only while the button is held. An open socket fed all day costs Rs 29.40 an hour.
- **Two unknowns move the text lines** (section 13.4):
  - Whether input or output characters are billed.
  - How Tamil is counted. Tamil letters often take 2–3 Unicode code points, so if Sarvam counts code points, the same Tamil text costs more than its visible length suggests.

### 13.4 What is not confirmed (or where Sarvam's own pages disagree)

1. **The 10 % surcharge for language detection.** The STT FAQ lists it; neither pricing page does. Budget with it (section 13.3).
2. **The Bulbul v4 Flash price.** The docs pricing page says Rs 1.00 per 1,000 characters; sarvam.ai/api-pricing says Rs 2.00. The api-pricing page also still shows DeepSeek's prices from before the 7 Nov cut, so the docs page is probably newer (M).
3. **The status for spent credit.** The errors, pricing and billing pages say 402. Every endpoint reference says 429 "Quota exceeded".
4. **The minimum top-up, and how GST is applied to it.** The billing page says a minimum exists; the licensing page says none. Whether GST is added at checkout or taken from the credit is not stated.
5. **Free-credit terms.** The pricing and billing pages say credits never expire; ToS §5.4 allows expiry and revocation. The steps that make a user "verified" are not described.
6. **The data defaults.**
   - The retention page keeps data indefinitely until an Owner sets a period; the Privacy Policy says 30 days after last access by default.
   - The EULA requires opt-in before training; the Privacy Policy describes opting out; the "Model training" toggle has no stated default.
7. **Realtime socket access for a pay-as-you-go key.** Close code 4000 lists "beta denied" and "account not enabled", but the spec has no beta marker.
8. **Changing keyterms on an open realtime socket.** The guide says `config.update` can do it; the AsyncAPI schema has no such field.
9. **Keyterms on the legacy socket.** The keyterms guide says yes; the language-codes page says REST and batch only.
10. **Ending a manual realtime turn.** Whether `speech_end` alone finalises the turn or a `flush` must follow, how long the final takes after release, the maximum session length, and whether billing rounds up per session are all unstated.
11. **Tamil-script keyterms.** There is no guidance beyond the v4 blog's "native script" result. The maximum URL length for socket keyterms is not documented.
12. **Tanglish through the text APIs.** It is unknown whether `/text-lid` labels Tanglish as `ta-IN`, whether `/transliterate` handles Tanglish well or which source code it wants (`en-IN`, `ta-IN` or `auto`), and whether `mayura:v1` accepts romanised or code-mixed input.
13. **Character counting** for the text APIs: input or output characters, and code points or visible letters for Tamil.
14. **Missing figures.** No latency is published for translation, transliteration, language ID or TTS. No rate limit is published for transliteration, language ID or the Decisions API.
15. **Prism access.** The Decisions API guide says Provisioned Throughput only; the Prism page and the pricing table imply every plan.
16. **`sarvam-105b` details.**
    - The default `reasoning_effort` is `low` on the model page and `medium` in the v1 reference.
    - The model page says `sarvam-105b-conversations` is v1-only, but the v2 reference's model list includes it.
    - No Tamil quality numbers are published.
17. **SDK details.** The licence is unknown: `package.json` has no `license` field and both GitHub repositories returned 404. Whether the JS SDK's REST `transcribe()` serialises `keyterms` correctly at runtime is unknown; the guide said the fix "had not shipped" when written, though the 1.1.19 types include the field.
18. **Bulbul parameters.** Whether `temperature`, `pitch` and `loudness` apply to v4 Flash differs between the reference and the best-practice guide. Whether pronunciation dictionaries work on v4 Flash is also unclear: the limits table says v3 only, but the examples use v4 Flash.
19. **Document AI limits** differ across three pages (section 11).
20. **Accuracy and format.** No Tamil WER is published for Saaras v4 or v3, and no REST latency figure is published. The effect of sending WebM/Opus instead of WAV on accuracy is unknown, although both formats are accepted.

---

## 14. Recommendations for Jarvis v10

1. **Keep REST `/speech-to-text` as the Sarvam path.** Use `saaras:v4`, `mode=codemix`, `language_code=unknown`, with `model` sent explicitly. The detection surcharge, if real, costs about Rs 0.50 a day, and it buys `language_probability`, one of the only uncertainty signals there is (M).
2. **Make the keyterm list daily.** Rebuild it whenever the news store refreshes, with this priority: names on screen, then today's story places, events and organisations, then the 15 fixed zones. Cap it at 50 terms of at most 64 characters, one phrase per item, with no commas. Add the Tamil-script form of a Tamil name when that name appears in a Tamil-script headline. A/B the list on the 40-clip bench: (a) today's Latin-only list, (b) with Tamil-script forms added, (c) with news names added. Log only the counts, never the terms.
3. **Build "ask instead of guess" from what exists.** No per-word confidence is available. Combine `language_probability` (start at < 0.7 and calibrate it on the bench and from the `stt_sarvam` `conf` telemetry), Sarvam–Whisper word agreement (`agreement()` in `sarvam.ts`), and keyterm near-misses (within an edit distance of 1–2 of a keyterm but not equal to it). When they say "unsure", ask a confirm question instead of acting.
4. **Harden the error mapping.** Keep treating 402, or 429 with `insufficient_quota_error`, as spent credit. Add `seat_budget_exhausted_error` to that group. Treat a 503 with `rate_limit_exceeded_error` as busy. Honour `Retry-After` only for `model_rate_limit_exceeded_error`. Never let an SDK auto-retry; set `maxRetries` to 0 or use plain `fetch`, as today. On the realtime socket, close 1003 means cool down, close 4000 means not enabled, so fall back to REST.
5. **Trim silence before upload.** Billing is per second, rounded up, with a 1 s minimum, so cutting leading and trailing silence with the existing VAD saves roughly 10–25 % (M). Keep the 30 s guard.
6. **Prototype the realtime socket behind a new flag, and adopt it only on evidence.**
   - Relay it server-side only, never with the browser subprotocol.
   - Settings: `endpointing=manual`, `stream_type=fast`, `language_code=auto`, `mode=codemix`, 100 ms frames.
   - Open the socket on button-down and send `end` after the final.
   - Adopt it only if the p50 time from button release to final transcript beats REST's 281 ms by 150 ms or more on the bench. Remember that partials will not be codemix.
7. **Add news translation on demand.**
   - Tamil story body to English: `sarvam-translate:v1`, formal, in chunks of at most 2,000 characters cut at sentence ends.
   - English answer to Tamil: `mayura:v1`, `modern-colloquial` with `fully-native` output for the screen, or `spoken-form-in-native` before any TTS.
   - Cache by story id plus a text hash, so each story is paid for once.
   - Cap translation at 10,000 characters a day (Rs 20) with its own ledger line.
   - Use the existing `titleEn` for headlines, and translate only bodies the Collector asks for.
8. **Transliterate locally per turn.** For Tamil-to-Latin matching on every turn, use a local transliterator in the Python sidecar, which is free and adds no network round trip. Call Sarvam `/transliterate` only for occasional display, after a 10-sentence Tanglish probe shows which source code it wants.
9. **Hold back `/text-lid`, Bulbul and `sarvam-105b` in v10.** Adopt each only after a specific probe:
   - LID: does Tanglish come back as `ta-IN` with script `Latn`?
   - Bulbul: does `ritu` or `ratan` on v3 beat the current Tamil voice? This costs Rs 3 per 1,000 characters.
   - `sarvam-105b`: does it beat Haiku on a Tamil-reply bench?
10. **Probe Prism once the key exists.** One call to `/v2/systemone` costs a fraction of a paisa. If it answers, prototype it as the confirm gate (act at 0.9 or above, otherwise ask). If it returns 403 or 404, record "Provisioned Throughput only" and drop it.
11. **Do the account hygiene on day one, before the first call.** The Owner sets Model API data retention to **0 days** under Settings → Workspace → Data policy, and switches **"Model training" off** under Settings → Organisation → General. Keep auto-recharge off so spend cannot run past the top-up. Keep the key server-side only.
12. **Plan the budget.** Expect about Rs 5–6 a day for STT, so the free Rs 100 lasts 2–3 weeks. With on-demand translation expect Rs 12–21 a day. A Rs 500 top-up covers about 3 months of STT alone, or 3–6 weeks with translation. Keep `JARVIS_SARVAM_DAY_S` at 2,400 s and add a daily character cap for the text APIs.
13. **Skip the SDK for REST and text calls.** A plain `fetch` is simpler and its licence is unknown. If the realtime prototype goes ahead, a raw `ws` client of about 60 lines avoids the dependency, though the 1.1.19 SDK's `connect()` does expose `keyterms` and `prompt`.
14. **Re-read pricing and the changelog before each release.** The changelog had seven entries in the first 18 days of November 2026 alone. The introductory LLM prices end on 31 Dec 2026, and Sarvam's two pricing pages already disagree.
