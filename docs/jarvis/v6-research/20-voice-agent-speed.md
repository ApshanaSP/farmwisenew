# 20 — How the fastest voice agents get low latency

Research only. No code was changed. Written 17 Nov 2026.
Method: 6 web searches, the rest by opening pages directly. Every number below has its source URL next to it.
Pages were read through a page-to-text fetch tool, so numbers are as that tool returned them.
"Inferred" marks my own reasoning or arithmetic, not a source figure.

## 0. Short answer for Jarvis

- In Pipecat's published budget, two stages dominate: LLM time to first byte, 650 ms, and transcription plus endpointing, 300 ms. TTS first byte is next at 120 ms. https://voiceaiandvoiceagents.com/
- The stages in that table add up to 1,293 ms (my sum). The page's prose rounds this to "about 1,200 ms". https://voiceaiandvoiceagents.com/
- Our cascade has three things the fast stacks avoid (inferred):
  - Groq has no documented streaming speech-to-text, so we wait for a whole upload after the turn ends. https://console.groq.com/docs/speech-to-text
  - TTS is one request per whole answer.
  - The planner returns JSON, which is hard to speak while it streams.
- Four changes are the best fit (all inferred, built from sourced parts):
  1. **A semantic end-of-turn model.** Pipecat's Smart Turn is BSD 2-clause, about 8M parameters and 8 MB quantised, and runs in "as little as 10ms" on some CPUs. https://github.com/pipecat-ai/smart-turn With it, the VAD silence wait can fall from Pipecat's old 0.8 s default to the 0.2 s it now recommends. https://voiceaiandvoiceagents.com/ https://docs.pipecat.ai/pipecat/fundamentals/stt-latency-tuning.md
  2. **Stream the LLM and speak the first sentence first.** Gemini TTS now streams audio (`stream: true`). https://aistudio.google.com/docs/speech-generation Edge voices can be queued one sentence at a time (inferred).
  3. **A local instant path for "Hi Jarvis" and short acknowledgements.** A pre-rendered clip skips the LLM and TTS stages entirely (inferred).
  4. **Warm connections.** A new TLS connection costs one TCP round trip plus two TLS round trips. https://hpbn.co/transport-layer-security-tls/
- **Preemptive LLM start is proven, but needs interim transcripts we don't have.**
  - LiveKit enables it by default. https://docs.livekit.io/agents/logic/turns/tuning.md
  - One 2026 paper cut average latency from 1195 ms to 690 ms, with about 28% of speculative compute discarded. https://arxiv.org/html/2606.13450
  - Groq Whisper is upload-only, limited to 20 RPM, and bills a minimum of 10 s per request. https://console.groq.com/docs/rate-limits https://console.groq.com/docs/speech-to-text
- **Gemini Live is the one free full-duplex option.** It is "Free of charge" on the free tier. https://aistudio.google.com/docs/pricing It has server VAD with streaming audio in and out. https://aistudio.google.com/docs/live-api/capabilities Moving to it would replace the cascade, not tune it (inferred).

## 1. Published latency figures, side by side

| System | Figure | What it measures | Source |
|---|---|---|---|
| Pipecat reference cascade | ~1,200 ms (table sums to 1,293 ms) | Voice to voice, macOS mic to speaker | https://voiceaiandvoiceagents.com/ |
| Pipecat best demo | "as low as 500 ms" | Voice to voice | https://voiceaiandvoiceagents.com/ |
| Human norm | "500ms is typical" | Response gap | https://voiceaiandvoiceagents.com/ |
| GPT-4o (audio) | 232 ms minimum, 320 ms average | Audio response | https://arxiv.org/abs/2410.21276 |
| Moshi | 160 ms theoretical, 200 ms practical (L4 GPU) | Full duplex | https://arxiv.org/abs/2410.00037 https://github.com/kyutai-labs/moshi |
| Freeze-Omni | 745 ms average, 1,020 ms P90; about 1.2 s in real use | LLM interrupt to first PCM; real use adds turn end and network | https://arxiv.org/html/2411.00774 |
| Unmute TTS | ~750 ms on one L40S, ~450 ms with services on separate GPUs | TTS latency | https://github.com/kyutai-labs/unmute |
| Ultravox 0.5 8B | ~150 ms time to first token; ~50-100 tok/s (A100-40GB) | Audio in, text out | https://huggingface.co/fixie-ai/ultravox-v0_5-llama-3_1-8b |
| RelayS2S | 81 ms P90 (commit), against 420-1,091 ms for cascades | First response | https://arxiv.org/html/2603.23346v1 |

## 2. Pipecat

**Latency budget table** (ms). Source: https://voiceaiandvoiceagents.com/

| Stage | ms |
|---|---|
| mic in | 40 |
| Opus encode | 21 |
| network | 10 |
| packet handling | 2 |
| jitter buffer | 40 |
| Opus decode | 1 |
| **transcription + endpointing** | **300** |
| **LLM TTFB** | **650** |
| sentence aggregation | 20 |
| **TTS TTFB** | **120** |
| return path (encode, packet handling, network, jitter, decode, speaker) | 21 + 2 + 10 + 40 + 1 + 15 |

**LLM guidance** (https://voiceaiandvoiceagents.com/)
- Rule of thumb: time to first token of "600 ms or less is fast enough".
- Elsewhere the page asks for first non-thinking token "faster than 700ms".
- Measured TTFT, median / P95:
  - GPT-4.1: 536 / 1771 ms
  - Gemini 2.5 Flash: 597 / 1137 ms
  - Claude 4.5 Haiku: 637 / 1615 ms

**Tool calls add a second inference.** The page's example: 450 ms TTFT, plus 100 tokens at 100 tok/s, gives 1,450 ms. https://voiceaiandvoiceagents.com/

**Turn detection**
- The default VAD stop is 0.8 s. https://voiceaiandvoiceagents.com/
- Pipecat's tuning page now recommends `stop_secs` 0.2. Its P99 transcript timings are measured at 0.2. https://docs.pipecat.ai/pipecat/fundamentals/stt-latency-tuning.md
- Smart Turn takes "~30ms on a typical cloud vCPU". Turn decisions land in "~250ms" from the pause. https://voiceaiandvoiceagents.com/
- The Smart Turn repo (https://github.com/pipecat-ai/smart-turn) says:
  - v3.2, built on Whisper Tiny.
  - CPU version 8 MB (quantised), GPU version 32 MB.
  - 10 ms on some CPUs, under 100 ms on most cloud instances, about 65 ms on Pipecat Cloud.
  - Takes up to 8 s of 16 kHz audio and covers 23 languages.
  - BSD 2-clause licence.

**Sentence aggregation**
- With no aggregator set, `SimpleTextAggregator` is used, "aggregating text based on sentence boundaries". https://docs.pipecat.ai/api-reference/server/utilities/frame/llm-text-processor.md
- The budget gives this step 20 ms. https://voiceaiandvoiceagents.com/

**Interruptions** (https://docs.pipecat.ai/pipecat/fundamentals/interruptions.md)
- On user speech, an `InterruptionFrame` cancels the LLM stream mid-way. TTS clears its pending text. Unplayed audio is dropped.
- The bot goes silent "within roughly one audio write".
- Only text that was actually spoken is kept in the context.

**User idle**
- `UserIdleProcessor` is now `user_idle_timeout` on the user aggregator.
- The timer starts when the bot stops speaking.
- The docs suggest 5-10 s, an escalating re-prompt, and ending after 2-3 tries.
- https://docs.pipecat.ai/pipecat/fundamentals/detecting-user-idle.md

**Pre-warming**
- "Keeping an idle pool of agents is the easiest way to avoid long cold starts." https://voiceaiandvoiceagents.com/
- No connection keep-alive page exists in the docs index. https://docs.pipecat.ai/llms.txt

**Speculative or early LLM start:** none. No such page is in the Pipecat docs index. https://docs.pipecat.ai/llms.txt

**Filler**
- The primer suggests speaking a short line before a slow lookup, for example "Please hold on while I look that order up". https://voiceaiandvoiceagents.com/
- Pipecat also ships a backchannel extension for listening sounds. https://docs.pipecat.ai/llms.txt

## 3. LiveKit Agents: preemptive generation

Source for this section: https://docs.livekit.io/agents/logic/turns/tuning.md

**How it works**
- The LLM starts "as soon as a final transcript arrives, before the turn is confirmed".
- A streaming speech-to-text service finalises segments while the turn detector is still deciding.
- TTS is optional (`preemptive_tts`, off by default). Turning it on "Cuts more latency at the cost of wasted compute on cancellations".

**Cancellation**
- "The preemptive response should be canceled when the final transcript changes."
- Turns longer than `max_speech_duration` (10.0 s) are skipped, because "Long turns are more likely to mutate".
- `max_retries` is 3 per turn.

**Default:** enabled.

**Saving:** no millisecond figure is published.
- The docs warn that it "doesn't always reduce latency".
- LiveKit's latency guide says that if the reply must be regenerated, latency "will not be improved" and tokens are wasted. https://livekit.com/blog/understand-and-improve-agent-latency
- A GitHub issue reports two full LLM requests when context or tools change between the early start and the confirmed turn. Seen in search results only. https://github.com/livekit/agents/issues/4219

**Other defaults**
- Endpointing `min_delay` 0.5 s, `max_delay` 3.0 s.
- Interruption `min_duration` 0.5 s.
- `false_interruption_timeout` 2.0 s.

**Published latency figures:** none in milliseconds. Both guides rate techniques only qualitatively:
- Co-locating the agent with the models is "The most impactful step".
- Prewarming the VAD is "Table stakes".
- A "Thinking" sound during tool calls.
- https://livekit.com/blog/understand-and-improve-agent-latency
- https://livekit.com/field-guides/guide/homepage-agent-latency

## 4. Kyutai: Moshi and Unmute

**Moshi**
- A full-duplex speech-text model that models user and system as parallel streams, with an "inner monologue" of text tokens. https://arxiv.org/abs/2410.00037
- Mimi codec at 12.5 Hz and 1.1 kbps, with a 7B temporal transformer. https://github.com/kyutai-labs/moshi
- Latency: 160 ms theoretical (80 ms Mimi frame + 80 ms acoustic delay); 200 ms in practice on an L4 GPU. https://github.com/kyutai-labs/moshi
- The PyTorch version needs a GPU with 24 GB. https://github.com/kyutai-labs/moshi
- Licences: code MIT (Python) and Apache (Rust); weights CC-BY 4.0. https://github.com/kyutai-labs/moshi
- Quality is weak for an assistant. On Audio Trivia QA, Moshi scores 22.8 against 56.4 for its own text backbone. https://arxiv.org/html/2411.00774

**Unmute** — STT + any text LLM + TTS (https://github.com/kyutai-labs/unmute)
- Works with any OpenAI-compatible LLM. In production it uses GPT OSS 120B via OpenRouter.
- Needs a CUDA GPU with at least 16 GB. No native Windows.
- Code MIT.

**Kyutai STT**
- `stt-1b-en_fr`: 500 ms delay, with a semantic VAD that predicts "the probability that the user is done talking". https://kyutai.org/stt
- `stt-2.6b-en`: 2.5 s delay. https://kyutai.org/stt
- The semantic VAD runs only in the Rust server. https://kyutai.org/stt
- "Flush trick": after the VAD fires, the server processes the remaining 500 ms at about 4x real time, so it takes about 125 ms. https://kyutai.org/stt That saves about 375 ms (inferred arithmetic).
- STT weights CC-BY 4.0. https://github.com/kyutai-labs/delayed-streams-modeling

**Kyutai TTS**
- Actually 1.8B parameters. https://huggingface.co/kyutai/tts-1.6b-en_fr
- Streams text in: it starts speaking "as soon as the first few words" arrive. https://huggingface.co/kyutai/tts-1.6b-en_fr
- Audio is offset 1.28 s from the text. https://huggingface.co/kyutai/tts-1.6b-en_fr
- Weights CC-BY 4.0. https://huggingface.co/kyutai/tts-1.6b-en_fr

**Fit for us:** no. Every Kyutai model needs a large CUDA GPU, and none runs on Groq or Gemini (inferred). The ideas transfer: a semantic end-of-turn signal, a flush, and text-streaming TTS.

## 5. Ultravox

- An audio encoder and projector feeding an open-weight LLM. No separate speech-to-text step. Outputs streaming text, not speech. https://github.com/fixie-ai/ultravox
- The 0.5 8B model uses Llama 3.1 8B Instruct with the whisper-large-v3-turbo encoder. https://huggingface.co/fixie-ai/ultravox-v0_5-llama-3_1-8b
- Time to first token "approximately 150ms", ~50-100 tok/s, on an A100-40GB. https://huggingface.co/fixie-ai/ultravox-v0_5-llama-3_1-8b
- Licences:
  - Code: MIT. https://github.com/fixie-ai/ultravox
  - 8B weights: the card says "mit". https://huggingface.co/fixie-ai/ultravox-v0_5-llama-3_1-8b
  - The Llama backbone has its own licence. That licence was not read, so permissive status is not verified.
- **Fit for us:** no. It needs a GPU host and is not on Groq or Gemini (inferred).

## 6. OpenAI Realtime and Gemini Live

**OpenAI Realtime** (https://developers.openai.com/api/docs/guides/realtime-vad)
- `server_vad` is the default.
- `semantic_vad` waits on a classifier's "finished speaking" probability. Its `eagerness` setting is low / medium / high / auto.
- `high` "chunks audio as soon as possible".
- A shorter `silence_duration_ms` detects turns faster. The example uses 500 ms, but it is not a stated default.
- **Fit for us:** no. It is paid and would need a new account.

**Gemini Live** (https://aistudio.google.com/docs/live-api/capabilities)
- Audio in is 16-bit PCM at 16 kHz. Audio out is 24 kHz.
- VAD is automatic by default:
  - Recommended silence is 500-800 ms.
  - "The server's internal default is approximately 800ms".
  - 100-200 ms is called "Too low".
- Hybrid VAD: the client's VAD sends `audio_stream_end` at the end of speech "for faster finalization".
- On barge-in, "the ongoing generation is canceled and discarded".
- Sessions: 15 min audio-only. Context: 128k tokens for native audio models.
- Free tier: Live models are "Free of charge" for input and output. https://aistudio.google.com/docs/pricing
- **Fit for us:** possible.
  - It would replace Whisper, the planner and TTS in one socket.
  - Tool calls would have to move to Live function calling, and the planner's JSON contract would be lost (inferred).
  - Free-tier rate limits and browser connection details were not checked.

## 7. Papers on early response and full duplex

| Paper | Method | Measured saving | Error / cost | Source |
|---|---|---|---|---|
| Endpoint Anticipation (2026) | 25M model forecasts end of turn 320-2560 ms ahead. On a forecast, it runs ~10 LLM tokens plus TTS into a cache, then releases or discards it | Unmute with Gemma 3 4B: average latency 1195 → 690 ms (−505 ms). Median realised anticipation 640 ms at h=640 | ERC 28.4% at h=960 (the paper calls it extra or discarded speculative compute). PAR 66.2% at h=640. Response quality not measured | https://arxiv.org/html/2606.13450 |
| RelayS2S (2026) | A duplex S2S model drafts a ~5-word prefix. A verifier gates it, then the cascade continues from it | P90 81 ms against 420 ms (Qwen2.5-0.5B), 513 ms (7B), 1,091 ms (GPT-4o) | 8.5% of prefixes inappropriate. Verifier at 0.5 lets 45.7% of bad prefixes through. Low-quality rate with GPT-4o: 5.5% → 7.4% | https://arxiv.org/html/2603.23346v1 |
| DDTSR (2026) | A small model speaks discourse connectives while a large model reasons. ASR, LLM and TTS overlap | 19%-51% lower response latency | "preserving discourse quality"; no numbers in the abstract | https://arxiv.org/abs/2602.23266 |
| Predictive ASR + EOU (2024) | ASR trained on masked future audio predicts end of utterance and the next words | End of utterance "up to 300ms prior" | WER on LS-100 goes 8.4% → 10.3% with 300 ms masked. Future-word error stays above 70% (FWER@5) | https://arxiv.org/html/2409.19990v1 |
| LLM-enhanced DM (2025) | A 0.5B LLM as semantic VAD emits four turn-control tokens | No latency figures | Turn accuracy 0.9785 | https://arxiv.org/html/2502.14145 |
| SyncLLM (2024) | Llama3-8b made time-synchronous, full duplex | Tested with network latency up to 240 ms | Beats baselines on meaningfulness | https://arxiv.org/abs/2409.15594 |
| Freeze-Omni (2024) | Frozen Qwen2-7B with speech in and out, duplex by state prediction | 745 ms average from interrupt to first PCM; ~1.2 s real | Web Q 44.73 against 45.13 for the text backbone | https://arxiv.org/html/2411.00774 |
| Moshi (2024) | Multistream full duplex | 160 / 200 ms | Weak QA (see §4) | https://arxiv.org/abs/2410.00037 |
| Fillers in VR agents (2025) | Tested no filler, icon plus sound, and natural voice plus gesture | Natural fillers improved rated response time at 4.0 s and 6.5 s delays | Icon and sound gave no significant effect. Above 4 s, experience degrades | https://arxiv.org/html/2507.22352v1 |

## 8. Groq specifics

**Output speed** (Groq's own table, https://console.groq.com/docs/models)

| Model | Tokens/s |
|---|---|
| gpt-oss-20b | 1000 |
| gpt-oss-120b | 500 |
| llama-3.1-8b-instant | 560 |
| llama-3.3-70b-versatile | 280 |
| qwen/qwen3.8-27b (preview) | 450 |

- Orpheus TTS models are in preview.

**Time to first answer token** (Artificial Analysis, https://artificialanalysis.ai/providers/groq)

| Model | Seconds |
|---|---|
| gpt-oss-120b, low | 1.32 |
| gpt-oss-20b, low | 1.48 |
| llama 3.1 8B | 1.49 |
| llama 3.3 70B | 1.36 |
| gpt-oss-20b, high | 7.55 |
| gpt-oss-120b, high | 5.54 |

- These average a single-request workload and a multi-turn agentic workload, over 5 days. https://artificialanalysis.ai/models/gpt-oss-20b/providers
- They likely overstate a short voice prompt (inferred). Our own logs are the better baseline.
- Groq publishes no time to first token of its own on the models page.

**Speech-to-text** (https://console.groq.com/docs/speech-to-text)
- File upload only. No streaming, websocket or partial results are documented.

| Model | Speed vs real time | WER | Price per hour |
|---|---|---|---|
| whisper-large-v3 | 189x | 10.3% | $0.111 |
| whisper-large-v3-turbo | 216x | 12% | $0.04 |

- The minimum billed length is 10 s.

**Rate limits** (https://console.groq.com/docs/rate-limits)

| Model | RPM | RPD | Tokens/min | Tokens/day |
|---|---|---|---|---|
| gpt-oss-20b, gpt-oss-120b | 30 | 1K | 8K | 200K |
| whisper | 20 | 2K | — | — |

- Whisper also has audio-seconds limits: 7.2K per hour, 28.8K per day.
- The page is unclear whether this table is the free plan or the developer plan.
- Speculative calls spend these limits. Two LLM calls per turn halve the turns per minute (inferred).

## 9. Technique scorecard for this stack

Stack: Edge browser + Next.js server + Groq and Gemini free tiers.

| Technique | Saving | Evidence | Licence | Applies here? | Cost | Risk |
|---|---|---|---|---|---|---|
| Semantic end-of-turn model, shorter silence wait | Up to ~600 ms (inferred: 0.8 s default minus 0.2 s recommended). Smart Turn runs in 10-100 ms | Pipecat primer, tuning page, Smart Turn repo | BSD 2-clause | Yes. Run it on the Next.js server or in the browser (browser/ONNX not verified). Tamil support not checked | CPU only, free | Cutting users off mid-sentence. Needs a test set |
| Client VAD sends end-of-stream at once (hybrid VAD) | Not found in ms | Gemini Live docs | n/a | Yes, already our model. Silero ends the turn and we upload | None | Same as above |
| Stream LLM text, first sentence to TTS | Not found. Inferred: every sentence after the first stops blocking first audio. Budget: aggregation 20 ms, TTS first byte 120 ms | Pipecat budget and aggregator docs; Kyutai TTS streams text in | n/a | Yes. Groq streaming plus Edge voices per sentence, or Gemini TTS `stream: true` | None | JSON planner output must be restructured so speech text streams first (inferred) |
| Streaming TTS instead of whole-answer TTS | Not found as a number | Gemini TTS streaming docs; Unmute | n/a | Yes, Gemini TTS streaming. Free per pricing page | Free-tier quota unknown | Stream needs a PCM player in the browser (inferred) |
| Pre-rendered acknowledgement / greeting clip | Skips LLM 650 ms + TTS 120 ms of the reference budget (inferred). Perceived gain proven at ≥4 s delays only | Primer; LiveKit "Thinking" sound; filler study | Own audio | Yes, for "Hi Jarvis" and before slow tools | None | Sounds canned if overused. Icon or sound alone had no effect |
| Warm TLS connections, keep-alive | 1 TCP + 2 TLS round trips. Example: 168 ms to tunnel at 28 ms one-way. Resumption saves a round trip | hpbn.co | n/a | Yes. Server to Groq/Gemini: open or keep the connection warm at page load or VAD speech start (inferred). Browser to Next.js is local | One tiny request | Idle sockets may be closed by the server. Wasted call counts toward RPM |
| Warm-up calls / prewarm models | Not found in ms | LiveKit prewarm VAD "Table stakes"; primer idle pool | n/a | Yes. Load Silero and the turn model at page load | Memory | Low |
| Preemptive LLM on interim or final segments | 505 ms average (EPA paper); LiveKit gives no figure | LiveKit tuning docs; arXiv 2606.13450 | n/a | Partly. Groq has no streaming STT. Pseudo-streaming is limited by 20 RPM and the 10 s minimum bill. Edge's own speech recognition gives interim results but may send audio to a vendor service | Doubles LLM calls; ~28% discarded compute | Stale answers; tool side effects must wait for the confirmed turn |
| Smaller or faster model for the first reply | gpt-oss-20b 1000 tok/s vs 120b 500 tok/s. TTFT similar (1.48 vs 1.32 s, agentic workload) | Groq models page; Artificial Analysis | Apache-2.0 for gpt-oss (not re-read here) | Yes | Same quota | Lower answer quality |
| Fewer tool round trips | Example: an extra call took TTFT from 450 to 1,450 ms | Primer | n/a | Yes. Answer from local data in one planner call where possible | None | Planner complexity |
| Full duplex S2S (Gemini Live) | No published ms read. GPT-4o-class models reach 232-320 ms | Gemini Live docs; GPT-4o paper | Hosted | Possible, free tier | Rewrite of the cascade | Free limits unknown; loses the planner JSON contract; audio goes to Google |
| Moshi / Unmute / Ultravox / Freeze-Omni self-hosted | 150-200 ms class | §4, §5 | MIT/Apache code, CC-BY 4.0 or MIT weights | No. Needs 16-24 GB CUDA GPU or a hosted GPU | GPU | n/a |

## Not verified

- Free-tier figures:
  - Whether the Groq rate-limit table is the free plan or the developer plan. The page says the table shows developer-plan base limits.
  - Gemini Live and Gemini TTS free-tier rate limits and concurrent sessions.
- Gemini specifics:
  - Whether Gemini Live can be opened from the browser with ephemeral tokens.
  - Gemini TTS streaming time to first audio. The docs give no latency.
- Groq and model figures:
  - Groq time to first token for short voice-style prompts. Artificial Analysis figures mix in agentic workloads, and two of its pages disagree. For example, gpt-oss-20b high shows 7.55 s in one place and 9.62 s in another.
  - Licence of the Ultravox Llama base model, and gpt-oss's Apache-2.0 licence (not re-read this session).
- Smart Turn:
  - Whether it runs in the browser (ONNX/WASM).
  - Whether it supports Tamil. 23 languages are listed; only some were seen.
- Edge browser:
  - Whether Edge's built-in speech recognition gives interim results in our setup, and where the audio goes.
- Secondary sources:
  - LiveKit `preemptive_lead_time` and GitHub issue #4219 were seen only in search snippets.
  - The Unmute "200-350 ms" and "3-4 s" figures come from third-party pages and conflict. Not used.
- Paper details:
  - Definitions of the EPA paper's PAR and ERC metrics. The paper's own wording on the 28.4% figure is inconsistent.
- Hard numbers not found:
  - No source gave a measured millisecond saving for keep-alive alone, filler audio, sentence streaming, or LiveKit preemptive generation.
- Not measured against our app:
  - None of the savings above were measured on our app. All "inferred" savings need a run with timing marks before they are claimed.
