# 30 · Side talk: is this speech meant for Jarvis?

Research for the Jarvis v10 build: brief `docs/jarvis/JARVIS_V10.md`, the owner's ask 8 ("if I'm speaking someone outside, it should not respond") and section 4.8. Written 19 Nov 2026 and re-checked the same evening: the load-bearing (B) claims were re-read at their sources, and the uncommitted v10 changes in the working tree were read (§1.1). Appendix C lists what the re-check changed. This is research only. No account was made, no paid API was called, no audio or text was sent to any service, and no repository file other than this one was changed.

**Legend.** (B) means I read it in the cited source; the URL or repository path is given. (M) means my own inference, arithmetic or design proposal. Dates and versions are the source's own. "Not confirmed" means I looked and could not verify it.

**This note builds on two earlier notes and does not repeat them:**
- `docs/jarvis/v8-research/20-addressee-language.md` covers the addressee literature, the R1 scoring idea and the R2 evaluation design. The numbers I reuse from it were re-read at the source for this note.
- `docs/jarvis/v6-research/10-turn-taking.md` covers end-of-turn models in depth: Smart Turn, LiveKit, VAP and Silero. Section 3.6 here adds only what changed, or what matters for cut-off lines.

---

## 0. The answer in brief

1. **Every assistant that ships uses more than words.** Amazon, Apple and Google add acoustic, ASR-decoder, camera or speaker-identity signals to the text. Words alone are the weakest single signal everywhere: equal error rate (EER) 20.1% at Amazon, 23.1% at Microsoft, 12.7% at Apple. Today Jarvis has words, timing and Whisper's decoder confidence, and nothing that says *who* is speaking. (§2.1)
2. **Jarvis's follow-up window is long.** Alexa listened for 5 s at launch and Alexa+ listens for about 8 s. Google's Continued Conversation listens for about 10 s; only Gemini Live on Gemini for Home listens up to 15 s. Jarvis listens for 20 s (`ENGAGED_MS`). Google also ends the conversation once you "start to talk to someone else", and on Google Assistant the feature requires Voice Match, so Google ties its window to the enrolled voice. Recommendation: 10 s by default, 15 s while Jarvis waits for an answer, 6 s while other people are present, and close the window on any cue that a person is being addressed. (§2.2, §5.3)
3. **The wake word itself is a side-talk source.** LiveKit's README says its wake-word models give "0.5 to 2.5 false alarms per hour" of conversational speech at the default threshold of 0.5, which is the threshold Jarvis uses. After a wake, the next sentence within 12 s counts as "called" and is answered. Raise the threshold after measuring it, and let speaker verification veto a "called" line in someone else's voice. (§2.3)
4. **Add the missing linguistic cues** (§3), each with English, Tamil-script and Tanglish forms. Some are already in the uncommitted code (§1.1), along with one tested false positive ("vendaam" read as hearsay):
   - Tamil-script vocatives, titles and attention-getters: சார், ஐயா, அம்மா, அண்ணா, தம்பி, ஏங்க, டேய்;
   - address particles at the end of a line (da / pa / ma);
   - talk about the screen: "see, this one has gone up", reading a headline aloud;
   - reported speech: the quotative என்று / -ன்னு, and the hearsay clitic -ஆம்;
   - more cut-off endings: prepositions; Tamil postpositions and case-marked nouns with no verb.

   Sarvam's codemix mode writes Tamil words in Tamil script, so the Tamil-script lists matter most once Sarvam is the main transcriber.
5. **For a cut-off line, wait first, then ask, and only ask if Jarvis was called.**
   - When a line ends dangling, raise the end-of-sentence silence to 1.5 s.
   - If it still ends dangling, hold it and join it to the next accepted sentence said within the follow-up window. The uncommitted v10 code already does this, with 12 s (§1.1).
   - If the held line was named, called or answering Jarvis and 4 s pass in silence, ask one short question ("About what?"). Otherwise stay silent.
   - No open *text* end-of-turn model covers Tamil. The open Tamil models work on audio and were trained on telephone calls: smart-turn-tamil is BSD-2, 8.7 MB and 83 ms p50 on one thread. LiveKit's models are ruled out by licence. (§3.6)
6. **Speaker verification works on a Windows CPU with permissive licences, and needs no PyTorch.**
   - The tool is sherpa-onnx (Apache-2.0). There are Python 3.14 Windows wheels and a Node win-x64 addon.
   - The model is 3D-Speaker's CAM++ trained on VoxCeleb, as ONNX: Apache-2.0, 7.18M parameters, a 29.6 MB file, 0.73% EER on VoxCeleb1-O.
   - It costs about 40 ms on one thread for a 3 s clip. That is arithmetic from the paper's real-time factor, not measured on this laptop. (§4)
7. **Run speaker verification in a local Python sidecar.** It follows the PaddleOCR service's pattern: 127.0.0.1 only, in memory only. It checks each clip in parallel with speech-to-text, so it adds no latency. It abstains when it is down, slow, or the clip is under 1 s. A browser version comes later. It would be either a sherpa-onnx WebAssembly build with its C speaker-embedding API (no feature-parity risk), or onnxruntime-web once a JavaScript feature parity test passes. (§4.6, §4.7)
8. **Enrolment, with the owner's explicit yes only:**
   - about 40 s of natural speech in 8 short prompts, in English, Tamil and Tanglish, at the console's own microphone;
   - store one averaged embedding plus the model's hash and the thresholds;
   - never store audio;
   - a voice command deletes it;
   - re-enrol whenever the model changes;
   - downloading the model file (29,596,979 bytes) and the two wheels also needs the owner's OK. (§4.3, §4.5, §4.7)
9. **Speaker verification answers "who", not "to whom".** The Collector's own side talk still passes it, so the text cues and the shorter window are still needed. It does remove visitors' speech, and the false wakes their speech causes, which is a large share of what an office produces. This share is my inference and must be measured. (§2.1, §5)
10. **Measure:** false wakes per hour of side talk (target ≤ 0.5), missed requests (named ≤ 2%, unnamed in-window ≤ 10%) and cut-off lines answered (target 0). For speaker verification, also measure the false-reject rate when false accepts are held at 1%, by clip length, language and distance, and latency p50 and p90. None of the brief's latency figures may get worse than v9's. (§5.5)

---

## 1. Where Jarvis stands today (as committed at HEAD `0a4b0245`; §1.1 adds the uncommitted changes)

All facts in this section are (B, repo), from `chennai-grievance-portal-main/` unless another path is given.

**The gate** (`src/lib/thunai/addressed.ts`) decides in this order:
- named ("Jarvis" or ஜார்விஸ்) acts;
- "talked about" is silent;
- the stop word acts;
- v8's hard silences in `sideTalk8`: another assistant, a title, a person's name, an errand for a person, a question to a person, a filler, a cut-off line, an unclear single word;
- called acts;
- awaiting an answer acts;
- engaged acts if it is shaped as a request and not side talk;
- otherwise silent.
- `ENGAGED_MS = 20_000`.

**The window** (`src/components/collector/app/thunai/conductor.ts`):
- `CALL_MS = 12_000`: the first sentence within 12 s of "Hey Jarvis" is the call's own request.
- `inWindow()` is true within `ENGAGED_MS` of the wake or of Jarvis's last turn, or while Jarvis speaks.
- With the strict audio gate, "nothing goes to /hear otherwise". Ambient speech outside the window never reaches speech-to-text.

**Wake word** (`src/components/collector/app/thunai/kws.ts`):
- LiveKit WakeWord `hey_jarvis.onnx` (Apache-2.0), run in a browser worker by onnxruntime-web.
- `NEXT_PUBLIC_JARVIS_KWS_THRESHOLD` defaults to 0.5.
- "Hi Jarvis" is not caught by this model and keeps the browser recogniser's path.

**Ears** (`src/components/collector/app/thunai/ears.ts`, `src/lib/thunai/vad.ts`, `src/lib/thunai/eou.ts`):
- One microphone, with echo cancellation, noise suppression and auto gain control.
- Silero VAD v5 runs in onnxruntime-web (version `1.31.0-dev` in `node_modules`).
- A 25 s ring buffer lives in memory, and audio is never stored.
- End-of-sentence silence (`TUNING`):

  | Case | Silence before the sentence ends |
  |---|---|
  | Default | 300 ms |
  | Short sentences under 1.8 s of speech | 180 ms |
  | Words judged complete | 300 ms |
  | Words "open": a connective, preposition or article (`eou.ts`, browser captions) | 650 ms |
  | After a hold word | +4000 ms |

- Early speech-to-text sends the sentence so far at a 150 ms pause (`earlySttMs`).
- The conductor's `carry` joins a sentence's reading to the next part only if the next part began while the first was still being transcribed.

**Speech-to-text confidence** (`src/lib/thunai/stt.ts`):
- Whisper's `no_speech_prob`, `avg_logprob` and `compression_ratio` are scored, and no-speech is declared at ≥ 0.6.
- A Sarvam decode gets a fixed log-probability, because Sarvam returns no word confidence (B, `docs/jarvis/SARVAM.md` item 11).

**There is no speaker identification.** The gate's own header says so: "anyone in the room can command it".

**The owner's failures** (B, brief Part 3): "Tell me about the" and "What are the" were answered; one-word lines were answered; "Alexa, when was it open?" was answered.

**Gaps (M):**
1. **Cut-off lines.**
   - `DANGLING8` and `eou.ts`'s `OPEN` list cover English articles and prepositions and a few Tamil and Tanglish connectives.
   - They miss "tell me / show me" with nothing after it, sentence-final auxiliaries and wh-words (in `eou.ts`), Tamil postpositions (பற்றி, பத்தி) and case-marked nouns with no verb.
   - Even when a cut-off line is caught, it is silenced, not completed: the remainder arrives later as a separate, context-less turn.
   - 650 ms is short for a thinking pause.
2. **Titles and vocatives are Latin-script only.** `HONORIFIC8` and `vocative8` don't see சார், ஐயா, அம்மா, ஏங்க, டேய் or end particles. Sarvam codemix writes Tamil words in Tamil script (B, `docs/jarvis/v8-research/30-sarvam.md`).
3. **The 20 s window is 1.3–4× what products use** (§2.2).
4. **A false wake makes the next sentence "called".** It is then answered unless a hard silence catches it.
5. **Nothing acoustic says who is speaking.**

### 1.1 What the uncommitted v10 working tree already does

Read between 17:40 and 17:52 IST on 19 Nov 2026, while the build was still changing it. It is not committed; HEAD is `0a4b0245`. Re-read the diff before building on this list. All (B, repo) unless marked (M).

- **Three new hard silences** in `sideTalk8`, behind `understandV10()`:
  - `PHONE_OPEN`: "hello? / ஹலோ" followed by haan, sollunga, சொல்லுங்க, …
  - `SCREEN_TALK_EN`, `_TG`, `_TA`:
    - "see," or "look," at the start, "look at this / here";
    - idhu / inga … paarunga;
    - இதோ / இதை / இங்க + பாருங்க.
  - `HEARSAY_TG` and `HEARSAY_TA`: a line ending in -maam / -yaam / -chaam / -daam / -taam, or in -மாம் / -களாம் / -ச்சாம் / -தாம். These are skipped while Jarvis awaits an answer.
  - **One false positive.** `HEARSAY_TG` matches the Tanglish negative **"vendaam"** ("ven" + "daam").
    - (B, tested) I ran the pattern, copied from the file at 17:52, in Node. It returns true for "indha alert vendaam" and "adhu vendaam", and false for வேண்டாம் and வேணாம்.
    - (M) So "Indha alert vendaam" ("not this alert") is silenced as hearsay whenever Jarvis is not awaiting an answer.
    - (M) Exclude vendaam and its spellings (vaendaam, veandaam) before the suffix test.
- **Tamil-script titles** (`addressed.ts`, `HONORIFIC_TA`, behind `understandV10()`):
  - with a comma or stop after them: சார், சாரு, மேடம், ஐயா, அய்யா, அம்மா, அக்கா, தம்பி, அண்ணா, அண்ணே, மச்சான், மச்சி, தங்கச்சி, பாப்பா;
  - with or without one: ஏங்க, ஏய், டேய், ஏம்பா, ஏம்மா;
  - at the end of a line: ", சார் / மேடம் / ஐயா".
  - A title with no comma counts as a name or a place ("அண்ணா நகர்"). Gap 2 above is therefore partly closed.
- **The name** also matches ஜர்விஸ். `unclearWord()` is now shared with the browser's lanes.
- **Cut-off lines** (`conductor.ts` `ignored()`):
  - A line the gate turns away as "cut-off", within `ENGAGED_MS` of Jarvis's last turn or the wake, is "cut-off-held".
  - The window stays open, and the console keeps the text.
- **The browser's "wait" lane** (`v10/browser10.ts`, `Thunai.tsx`):
  - A cut-off line or a lone unclear word that passed the gate gets no answer.
  - `joinCut()` joins the next sentence said within **12 s** (`ms = 12_000`), unless that sentence repeats the cut line whole or is a fresh request (`FRESH`: it starts with a verb or a question word).
  - The dangling endings are:
    - English: articles, possessives, "of", and / or / but / if / because / than, is / are / was / were, what / which;
    - "tell me about" / "news on" frames;
    - Tamil பற்றி, பத்தி, குறித்து, என்ன, அந்த, இந்த, எந்த, ஒரு;
    - Tanglish pathi, andha, indha, endha, oru, la, le.
- **Unchanged:**
  - `ENGAGED_MS` 20 s, `CALL_MS` 12 s, wake-word threshold 0.5, `ASSISTANT8`;
  - no question back for a cut-off line;
  - no speaker verification.
- **(M) Note on the join.** Both `accept()` and `fromCaptions()` gate every sentence on its own before anything is joined, so side talk said after a cut-off line is silenced, not joined. Two things still need a test:
  - a held line outlives a silenced side remark, and is then joined to the next accepted, non-fresh sentence up to 12 s later;
  - 12 s is longer than the 10 s follow-up window proposed in §5.

---

## 2. Device-directed speech detection: literature and products

### 2.1 Signals used and the numbers reported

| System (date) | Signals | Reported result | Source |
|---|---|---|---|
| Amazon, Mallidi et al. (Interspeech 2018) | Two LSTMs (acoustic; ASR 1-best text) plus ASR decoder features, fused by a feed-forward network | EER: decoder 9.3%, acoustic 10.9%, 1-best text 20.1%, combined 5.2% (44% relative better) | (B) https://arxiv.org/abs/1808.02504 |
| Amazon, Gillespie et al. (ICASSP 2020), follow-up mode | Semantic lexical features plus a light acoustic feature | 14% relative EER reduction over an acoustic-only model; no absolute EER in the abstract | (B) https://arxiv.org/abs/2010.01949 |
| Amazon Science blog (6 May 2020), the Follow-Up Mode detector | The current turn **and the turn before it**, word embeddings (lexical and semantic), and ASR-confidence features, in an LSTM with attention | EER 9.1% against 10.6% for the best baseline (14% better); a plain DNN got 19.2% | (B) https://www.amazon.science/blog/how-alexa-knows-when-youre-talking-to-her |
| Amazon "natural turn-taking" (blog, 24 Sep 2020) | Follow-Up Mode's acoustic cues, plus camera body position fused on device; pacing cues planned: fillers, lengthened vowels and "incomplete utterances" decide whether the customer finished or "needs prompting" | No numbers | (B) https://www.amazon.science/blog/change-to-alexa-wake-word-process-adds-natural-turn-taking |
| Alexa Conversation Mode (Echo Show 8 2nd gen and Echo Show 10 3rd gen; 18 Nov 2021) | The camera's estimate of each person's head orientation, plus an audio device-directed voice-activity model (a separable CNN on filterbank energies). Only requests judged directed are recorded and sent; no images leave the device | Visual model: false rejects −80% against a PnP baseline. Adding the audio model: false rejects −83% against visual only, false wakes from ambient noise −80%, false wakes from Alexa's own replies −42% | (B) https://www.amazon.science/blog/new-alexa-feature-enables-natural-multiparty-interactions , https://www.aboutamazon.com/news/devices/conversation-mode-helps-interactions-with-alexa-feel-more-natural |
| Apple Siri voice trigger (blog, 11 Aug 2023) | DNN-HMM keyword spotter, then a conformer checker, then **SpeakerID**, then false-trigger mitigation. The mitigation stage has three parts: an RNN over the full ASR lattice, a streaming acoustic transformer, and a BERT-like text classifier that also flags "non-vocative" uses of "Siri" | No rates | (B) https://machinelearning.apple.com/research/voice-trigger |
| Apple streaming-transformer false-trigger mitigation (Jul 2021) | Acoustic only, 1 s of audio after the trigger | Suppresses 95% of false triggers; 18% relative false-reject reduction at a fixed false-alarm rate | (B) https://machinelearning.apple.com/research/streaming-transformer |
| Apple multimodal LLM detection (ICASSP 2024) | Text, audio and decoder signals into GPT-2. Eval set: 14k directed, 23k not directed | EER: text 12.70%, audio 10.98%, decoder signals alone 28.09%, all three 7.95%; best 6.53% (GPT-2 1.5B, LoRA) | (B) https://arxiv.org/html/2403.14438v2 |
| Apple follow-ups without the wake word (2024) | Previous query plus the follow-up's 1-best or 8-best ASR list, Vicuna-7B. Directed:undirected about 1:4; mean clip 3.5 ± 3.25 s | Classifier EER 10.5% (1-best, no context) down to 7.9% (context + 8-best). False accepts at 10% false rejects: 11.4% down to 4.8%; at 5%: 29.9% down to 16.7%. **Prompt-only, untuned: 13.8% false rejects, 46.7% false accepts.** No time window is defined | (B) https://arxiv.org/html/2411.00023v2 |
| Microsoft, Shriberg et al. (Interspeech 2012) | Lexical against prosodic (energy-contour GMMs); recogniser word error rate 19% | EER: lexical 23.1%, prosodic 12.6%, combined 11.1% | (B) https://www.isca-archive.org/interspeech_2012/shriberg12_interspeech.html |
| Shriberg, Stolcke, Ravuri (Interspeech 2013) | Speech rhythm and vocal effort; no ASR needed | Rhythm and effort outperform lexical models and need only "the first couple seconds of speech" | (B) https://www.isca-archive.org/interspeech_2013/shriberg13_interspeech.html |
| SmartWeb, Batliner et al. (AVSP 2007) | Prosody, part-of-speech, face (looking at the device or not); 3.2 h, 2,086 turns | Two-class (focused on the system or not), class-averaged recall: prosody 68.6% (76.6% speaker-normalised), part-of-speech 76.0%, video 70.5%, all three 84.5% | (B) https://www.isca-archive.org/avsp_2007/batliner07_avsp.pdf |
| Meetings, Jovanovic et al. (EACL 2006) | Utterance cues (names, "you"/"we"), gaze, conversational context | Five-way addressee accuracy: utterance 52.6%, gaze 66.5%, context 73.1%, all 82.6%. "utterance features are the most unreliable cues" | (B) https://aclanthology.org/E06-1022.pdf |
| Google Look and Talk (research blog, 27 Jul 2022) | Proximity (about 5 ft), Face Match, gaze, active-speaker check (5 frames + 0.5 s audio), **Voice Match**, on-device ASR, intent from text plus pitch, speed and hesitation; 8 models. Google's product blog says 6 models and "more than 100 signals" | No rates. It activates only when **both Face Match and Voice Match** recognise the user | (B) https://research.google/blog/look-and-talk-natural-conversations-with-google-assistant/ , https://blog.google/products/assistant/assistant-io-2022/ |
| Meta WearVox benchmark (arXiv v1, 25 Dec 2025) | Speech LLMs on smart-glasses audio. The side-talk task has 1,082 items: 582 side talk plus 500 valid queries | Side-talk rejection accuracy, single channel: Kimi-Audio 47.0, Gemma 3n 59.9, Qwen2.5-Omni 60.4, GPT-4o Audio 66.0, GPT-5 + Whisper 73.8, Gemini 2.5 Flash 88.2, Gemini 2.5 Flash Thinking 91.4. Their own model: 85.4 single-channel, 93.9 multi-channel | (B) https://arxiv.org/html/2601.02391v1 |

**What this means for Jarvis (M):**
- **Words are the weakest signal, and ASR-decoder features the strongest single one** (Amazon 9.3% EER). Jarvis already has Whisper's decoder features. It loses them once Sarvam is primary, because Sarvam returns only a language probability. Replacements:
  - a Whisper shadow decode where one exists;
  - agreement between two decodes, a cheap stand-in for Apple's n-best (Apple: context plus 8-best cut false accepts at 10% false rejects from 11.4% to 4.8%, which is 58% relative, by my arithmetic);
  - speech duration;
  - the speaker score.
- **Context matters most in multi-party talk** (Jovanovic: context 73.1% against utterance 52.6%). Amazon's own Follow-Up Mode detector takes the previous turn as an input (B, 2020 row). For Jarvis, context means its last answer, what is on screen, whether it is waiting for an answer, and whether other voices were heard recently.
- **Gaze is weak when the screen is what people talk about.** Bakx et al. (2003), as reported by Jovanovic (2006), found users looked at the system 94% of the time when talking to it, and still 57% of the time when talking to the other person (B, via Jovanovic). The Collector will look at the console while explaining it to a visitor (M). SmartWeb also found video cannot detect reading aloud, because readers face the display (B, Batliner). So no camera for v10. It would also need its own consent (M).
- **Prosody helps but is blurred here.** Shriberg's prosodic model halved the lexical EER, and Batliner found speech to the system louder, while side talk had lower energy, longer pauses and a smaller pitch range (B). But Jarvis's microphone runs auto gain control (B, `ears.ts`), which flattens level differences (M). Keep it as a later feature, measured with and without gain control.
- **Don't use an untuned LLM as the gate** (Apple prompt-only: 46.7% false accepts). Large speech LLMs reach about 90% side-talk rejection (WearVox), but with a cloud call, cost and seconds of latency per line (M).
- **Speaker identity is part of every trigger-free design that ships:** Siri's SpeakerID stage, and Look and Talk's Voice Match (B). It answers *who*, not *to whom* (M).

### 2.2 Follow-up windows in products

| Product | How long it listens after its reply | What ends it, and conditions | Source |
|---|---|---|---|
| Alexa Follow-Up Mode (launch, Mar 2018) | 5 s | Acts only when "confident" the speech is not background noise; off during music, audiobooks and calls; US English at launch; "thank you" or "stop" ends it | (B, launch coverage) https://www.iclarified.com/64894/amazon-alexa-gets-new-followup-mode-that-allows-backtoback-requests-without-repeating-wake-word |
| Alexa+ Follow Up Mode (help page, read 19 Nov 2026) | "up to about 8 seconds after Alexa's response" | Not for skills, smart home, routines, button presses or Bluetooth-paired devices. On Echo Show you can interrupt without the wake word when "in view of the camera and facing the screen" | (B) https://digprjsurvey.amazon.com/csad/help/node/TtQI6drnxX9fpAYrc1 |
| Google Continued Conversation (Google Assistant and Gemini for Home) | "about 10 seconds"; the mic turns off after 10 s of silence | Ends on "Thank you", "Stop" or "I'm done", or when you "start to talk to someone else". Off during a phone call, a ringing alarm or timer, and media control. On Google Assistant: US English only, set per user, and **requires Voice Match**. On Gemini for Home: all its languages, and if an admin turns it on it works for everyone | (B) https://support.google.com/googlenest/answer/7685981?hl=en (no date on the page; read 19 Nov 2026) |
| Gemini Live on Gemini for Home | "up to 15 seconds"; it stops listening after 15 s of silence | Same page | (B) same |
| Alexa Conversation Mode (Nov 2021) | No fixed window. Anyone "in view of the device's camera and looking toward the screen" can speak without the wake word. It exits after "a short period" with no request; the user can change this, and no number is given | Turned on by voice each time ("Alexa, join the conversation"); turned off by voice, the mic/camera button or the shutter | (B) https://www.aboutamazon.com/news/devices/conversation-mode-helps-interactions-with-alexa-feel-more-natural |
| Google "Stop" without the wake word (smart speakers and displays, 26 Jan 2022) | — | Saying "stop" stops a speaking reply, "no #HeyGoogle needed". This is the product precedent for Jarvis's stop word from any voice (G1) | (B, press coverage quoting Google's post) https://voicebot.ai/2022/01/26/new-stop-command-silences-google-assistant-without-hey-google-wake-word/ |
| Siri back-to-back requests (iOS 17 and later) | Not documented | — | Not confirmed |
| **Jarvis today** | 20 s from Jarvis's last turn or the wake; 12 s for the call's first sentence | v8's hard silences | (B, repo) |

(M) A longer window means:
- more side talk inside it;
- more of the room's speech uploaded to cloud speech-to-text, since nothing outside the window is sent;
- more spent of Sarvam's free credit.

### 2.3 False wakes against missed requests

**How it is counted** (B, sources above):
- EER;
- false accepts at a fixed false-reject rate (Apple uses 5% and 10%);
- false alarms per hour (wake words) or per month (Personalized Hey Siri);
- misactivations per hour (privacy studies).

**Numbers reported:**
- **Smart speakers next to TV dialogue** misactivated 0.95 times per hour, or 1.43 times per 10,000 words. On some devices, 10% of misactivations lasted at least 10 s. (B) Dubois et al., PETS 2020, https://petsymposium.org/popets/2020/popets-2020-0072.php
- **LiveKit WakeWord, the family of Jarvis's `hey_jarvis.onnx`:**
  - "At the default threshold of 0.5, these four models give 0.5 to 2.5 false alarms per hour on the bench's conversational speech; raise the threshold if you see too many."
  - `hey_jarvis.onnx` scores 0.914 on the plain bench. It is about 7 MB, at about 1 ms per 80 ms step on one CPU.
  - The "hey livekit" model caught 89% of wake words at 0.5 false alarms per hour.
  - (B) https://github.com/livekit/livekit-wakeword (README, lines on the bench and on defaults)
- **Apple Personalized Hey Siri** (16 Apr 2018): speaker-recognition EER of 4.3% (4×256 DNN, 200 production users). End to end, with 150 users' triggers and 2,800 h of negative audio: 1 false accept per month at 5.2% false rejects and 3.2% imposter accepts. (B) https://machinelearning.apple.com/research/personalized-hey-siri
- **Alexa Conversation Mode:** adding the audio model cut false wakes from ambient noise by 80%, and from Alexa's own replies by 42% (B, §2.1). (M) An assistant hearing itself is a false-wake class big enough to report on its own. Jarvis handles it with `selfHeard` and `overlap` (B, repo), and the replay set should count it separately.

**What this means for Jarvis (M):**
- **Wake-word false alarms add up in a meeting day.** At 0.5–2.5 false alarms per hour, six hours of meetings could produce 3–15 false wakes. Each opens a 12 s "called" window in which the next sentence is answered unless a hard silence catches it. This is plausibly part of what the owner saw, and the replay set should test it.
- **Err towards silence.** A missed request costs one repeat with "Jarvis". A false wake interrupts the Collector in front of a visitor. Targets:
  - false wakes ≤ 0.5 per hour of side talk;
  - missed requests ≤ 2% when named;
  - missed requests ≤ 10% for unnamed follow-ups in the window (Apple's 10% operating point).

---

## 3. Linguistic cues

### 3.1 Vocatives, titles and attention-getters

- (B) A vocative is "the explicit verbal way to address someone" (Jovanovic et al. 2006, link above).
- (B) Tamil vocatives:
  - they take suffixes, mainly ē and ā;
  - the final vowel is often lengthened;
  - in colloquial speech they are often paired with "Ey!".
  - Source: https://en.wikipedia.org/wiki/Tamil_grammar
- (B) The kinship terms *annaa*, *akkaa* and *tambi* are used with non-kin, where they "combine politeness and familiarity" (Penn Tamil web book, https://ccat.sas.upenn.edu/plc/tamilweb/book/chapter3/node25.html).

(M) In a Collector's office:
- Visitors and staff address the Collector as sir, madam, ஐயா, அம்மா or "Collector sir".
- The Collector addresses staff by name or role, or as தம்பி, அண்ணா, அம்மா or சார்.
- Either way, a title or vocative at the start or end of a line means a person is the addressee. Jarvis is never "sir" or "thambi".

**Lexicon (M).** These count when they open the line (followed by a comma or pause) or close it.

| Class | English | Tamil script | Tanglish |
|---|---|---|---|
| Titles | sir, madam, ma'am, mam, boss, doctor, "Collector sir/madam" | சார், மேடம், ஐயா, அய்யா, அம்மா, டாக்டர், கலெக்டர் சார், கலெக்டர் அம்மா | saar, sir, ayya, amma, madam |
| Kin terms used for non-kin | brother, bro, sister, uncle, aunty | அண்ணா, அண்ணே, அக்கா, தம்பி, தங்கச்சி, மாமா | anna, anne, akka, thambi, thangachi, mama |
| Attention-getters (opening the line) | excuse me, hello, listen, hey + name | ஏங்க, என்னங்க, ஏய், டேய், யோவ், ஹலோ | enga, ennanga, ey, dei, dey, yov, hello |
| Address particles (closing the line, after a verb) | — | டா, டி, பா, மா ("வா பா", "சொல்லு மா") | da, di, pa, ma ("vaa pa", "sollu ma") |
| Roles | PA, AE, AEE, EE, DRO, RDO, VAO, tahsildar, driver, commissioner, secretary, inspector, officer | பி.ஏ, டிரைவர், தாசில்தார், கமிஷனர் | the same, in Latin script |

**Exceptions (M):**
- Place and scheme names stay topics, through the gazetteer (`areaWord`) as today: Anna Nagar, Anna Salai, Anna University, Amma Unavagam.
- Match on token boundaries, so that "pa" inside "pannunga" doesn't count.
- When Jarvis waits for an answer, only another assistant's name or a named person stays silent. That is today's rule (B, repo).

**Effect (M):** silent. Close the follow-up window, as Google does when you "talk to someone else" (B for Google's behaviour). Mark "company present" for 120 s (§5.3).

### 3.2 Another assistant's name

- (B, repo) `ASSISTANT8` covers:
  - alexa, siri, cortana, bixby;
  - "hey/ok google";
  - google, gemini or chatgpt when followed by punctuation;
  - the Tamil-script Alexa forms;
  - சிரி / கூகுள் / கூகிள் followed by a comma.
- (B) Apple's text classifier also flags "non-vocative uses" of its own trigger word (Siri voice-trigger blog, link above).
- (M) Add:
  - copilot;
  - "hey meta" and "meta,";
  - ஓகே கூகுள், ஹே கூகுள்;
  - ஜெமினி followed by punctuation;
  - அலெக்ஸ்.
- (M) Keep the punctuation rule for "gemini", because the Gemini flyover is a Chennai place. Keep it for சிரி too, because it is also the Tamil verb "laugh".
- (M) Talk *about* another assistant ("Alexa is better than this") isn't for Jarvis either. It is silent.

### 3.3 Talk about the screen ("see, this one has gone up")

- (B) SmartWeb split speech into four classes (Batliner et al. 2007):
  - On-Talk;
  - **Read Off-Talk**: reading from the display;
  - **Paraphrasing Off-Talk**: reporting what the screen shows to a companion;
  - Spontaneous Off-Talk: talk to a third person or to oneself.
- (B) Shares of utterances in their elicited data: On-Talk 49.6%, reading 13.3%, paraphrasing 11.1%, spontaneous 26.0%.
- (B) Reading and paraphrasing carry more nouns than On-Talk (29.6% and 27.3% against 21.2%) and fewer function words (34.5% and 43.2% against 52.9%). Spontaneous side talk has the most function words (63.1%).
- (B) Paraphrasing is "difficult to detect using the audio channel or just the word chain". Video cannot detect reading at all.
- (B) The authors note that part-of-speech features transfer to other domains, unlike keyword features ("SmartWeb, show me ...").

(M) "See, this one has gone up" is paraphrasing side talk. Jarvis knows what is on its own screen, which SmartWeb's classifier did not. Three cues:

1. **A perception verb aimed at a person:**
   - English: see, look, look at this, you can see, as you see, notice;
   - Tamil: பாருங்க, பாரு, பார், இதோ பாருங்க, பாத்தீங்களா, பார்த்தீங்களா, கவனிச்சீங்களா;
   - Tanglish: paarunga, paaru, paatheengala, kavaninga.
2. **A demonstrative plus a statement of change or level:**
   - English: "(this | that | it | these) (one)? (has)? (gone up | went up | increased | come down | dropped | is high | is too much)";
   - Tamil: இது ஏறிடுச்சு, அதிகமா இருக்கு, குறைஞ்சிருக்கு;
   - Tanglish: "idhu jaasthi aagiduchu".
3. **Reading aloud.** The line has at least 4 content words, at least 70% of them are found in one line now visible on screen (a headline, a case title, a card), and there is no request verb or question shape. Silent.

**Guard (M):** a perception verb with a console noun and no demonstrative stays a request. For example, "Adyar complaints paarunga": `IMPERATIVE_TA/TG` already treat பாரு / paaru as commands (B, repo). Test both readings on the blind set.

**Effect (M):** silent, and close the window. The Collector has turned to a person.

### 3.4 Reported speech

- **English (M):**
  - "(he | she | they | the [role] | someone) (said | told | asked | says | was saying | wants)";
  - "according to";
  - quoted text.
  - `SIDE_STRONG` already catches "told", "said" and "heard" (B, repo).
- **Tamil:**
  - The quotative என்று, colloquially -ன்னு or -னு, followed by a verb of saying or asking: சொன்னார், சொன்னாரு, சொன்னாங்க, கேட்டாங்க (M for the colloquial forms and the verb list).
  - (B) Tamil has no English-style "that" complementiser. It uses the frozen past participle of the verb *en* ("say"), *enṛu*, which has been analysed as a quotative, and the same form also works as a plain complementiser. Source: Sarveswaran, *Morphology and Syntax of the Tamil Language*, the section on complementisers, https://arxiv.org/abs/2401.08367 (text read from the PDF).
  - (M) So match என்று / -ன்னு / -னு **only when a verb of saying or asking follows**:
    - "X என்று நினைத்தேன்" ("I thought that X") is a complement, not a report. It is not a request either, but it should not be counted as reported speech;
    - என்ற / என்கிற before a noun is naming ("அக்வான் என்ற புயல்", the storm called Akvan), and it can sit inside a real request.
  - **The hearsay clitic -ஆம்** on a finite verb: வருமாம், இருக்காம். (B) "Tamil verbs also mark evidentiality, through the addition of the hearsay clitic ām" (Wikipedia, link above).
  - Exclude ஆம் standing alone, which means "yes" (M).
- **Tanglish (M):** "-nu sonnaru / sonnanga / kettanga" and the "-aam" ending ("varumaam").

**Effect (M):** silent unless named. This is not a window-closer on its own.

### 3.5 Cut-off and one-word lines

- (B) Tamil's usual order is subject-object-verb: "the verb concludes the sentence" (Wikipedia, link above).
- (M) So a Tamil request normally ends in one of:
  - an imperative or finite verb;
  - a question word;
  - the question clitic -ஆ / -ஓ;
  - a known one-word command.

  A line ending on a postposition, or on a case-marked noun with no verb, is unfinished.

**Endings that leave a line open (M).** Merge these into `DANGLING8` and `eou.ts` `OPEN`; several are already there.

| Language | Endings |
|---|---|
| English | Articles and possessives: the, a, an, my, your, our, their, some, any. Prepositions: about, for, to, of, in, on, at, from, with, by, into, between, regarding, like. Conjunctions: and, or, but, because, if, so, than. Auxiliaries and wh-words at the end: is, are, was, were, can, could, would, will, do, does, did, what, which, who, where, when, why, how. A request verb with no object: "tell me", "show me", "give me", "compare", "open the" |
| Tamil script | பற்றி, பத்தி, குறித்து. The possessives -ஓட and -உடைய, and the dative -க்கு, at the very end. An accusative noun with no verb after it: செய்தியை, புகார்களை. Conjunctive participles ending -ட்டு, -த்து, -ந்து: பார்த்து, எடுத்துட்டு. Conjunctions: ஆனா, அப்புறம், அதனால, மற்றும், அப்போ |
| Tanglish | pathi, oda, ku / kku, the accusative -ai ("news-ai"), aprom / apram, "but", "and", paathu, eduthu |

One-word lines: keep v8's rule. A single word is silent unless it is a known command, answer, ordinal or district noun (B, repo). When called, see §3.6, step 3.

### 3.6 Wait or ask? End-of-turn detection

**What products do (B):**
- Amazon planned to use fillers, lengthened vowels and "incomplete utterances" to tell whether the customer has finished or "needs prompting" (amazon.science, 2020, link above).
- Google said its models were being built to recognise "when someone is pausing, but not finished speaking" (blog.google, 11 May 2022).
- LiveKit Agents waits 0.5–3.0 s by default before committing a turn, and 0.3–2.5 s with its audio turn detector. If the model gives no answer within about a second, it commits the turn anyway (https://docs.livekit.io/agents/build/turns/turn-detector/).

**Open models:**

| Model | Input | Languages | Licence | Size / speed | Usable here? | Source |
|---|---|---|---|---|---|---|
| LiveKit turn detector: text (multilingual) and audio v1-mini | Text (deprecated per the docs; based on Qwen2.5-0.5B per the v6 note), or audio | 14; **no Tamil** | LiveKit Model License (last updated 25 Nov 2024): "can only use them together with the LiveKit Agents framework"; "not ... on a standalone basis" | Text model 396 MB, about 50–160 ms; v1-mini 140–250 MB RAM | **No** (licence) | (B) https://huggingface.co/livekit/turn-detector/blob/main/LICENSE , docs above |
| Pipecat Smart Turn v3.2 | Audio: up to the last 8 s, 16 kHz mono | 23, Hindi among them; **no Tamil** | BSD-2-Clause, code and weights | 8 MB int8 (CPU), 32 MB fp32 (GPU), about 8M parameters; "as little as 10ms on some CPUs" | Yes, but no Tamil | (B) https://github.com/pipecat-ai/smart-turn |
| indic-smart-turn (community) | Audio (Smart Turn v3 recipe on whisper-base) | English plus 11 Indian languages, Tamil among them: **85.9%** on the TamilEOT test | BSD-2-Clause, code and models; its training data CC BY 4.0 | Size not stated; "under 50 ms" on one CPU core | Candidate; trained "mostly on real Indian phone conversations" | (B) https://huggingface.co/adimyth/indic-smart-turn |
| TamilEOT `smart-turn-tamil` (community) | Audio: the last 8 s as Whisper log-mel (80 × 800) at 16 kHz; Smart Turn v3 recipe on whisper-tiny or whisper-base | Tamil | Code and weights BSD-2-Clause (model card). Paper CC BY 4.0. Source audio SPRING_INX Tamil R1, CC BY 4.0 | Tiny int8, 8.7 MB: 83.71% accuracy, p50 83 ms on one thread plus about 12 ms for the mel. Base int8, 21 MB: 86.13%, 143 ms. Zero-shot 70.30%. The int8 files need onnxruntime ≥ 1.24 | Candidate: telephone domain, 18,485 turn ends from 116 calls | (B) https://arxiv.org/abs/2609.05631 (v2, 30 Oct 2026); https://huggingface.co/santhosh-005/smart-turn-tamil |
| Namo-Turn-Detector-v1-Multilingual | Text (mmBERT-base) | 23; **no Tamil**. Hindi 0.9398, English 0.9086 accuracy | Apache-2.0 | About 295 MB quantized ONNX; "<29ms" (hardware not stated) | Possible, but no Tamil and large | (B) https://huggingface.co/videosdk-live/Namo-Turn-Detector-v1-Multilingual |
| TEN Turn Detection | Text (Qwen2.5-7B, 8B BF16) | English, Chinese | Apache-2.0 | GPU-sized | No | (B) https://huggingface.co/TEN-framework/TEN_Turn_Detection |
| Vogent-Turn-80M | Audio (the last 8 s) plus text (the previous and current utterance); a Whisper-tiny encoder with SmolLM2-135M cut to 12 layers, about 80M parameters | **English only** | "modified Apache-2.0": voice-agent platforms may not make it the default, and users must pick "Vogent Turn Detector". The files are gated: you must share your Hugging Face details | About 7 ms on a T4 GPU; the card warns that CPU may be too slow | No | (B) https://huggingface.co/vogent/Vogent-Turn-80M |

**Decision for v10 (M).** No open text end-of-turn model covers Tamil. The audio models that do (indic-smart-turn, TamilEOT) were trained on telephone speech, and none covers Tanglish. Use Jarvis's own ending rules (§3.5) on the transcript Jarvis already has: the browser captions, and the early speech-to-text at the 150 ms pause. Add an audio model only if the replay set shows cut-offs the text rule misses. The first to try would be `smart-turn-tamil` tiny int8 (8.7 MB, BSD-2) in the existing onnxruntime-web worker. It needs a JavaScript Whisper-style log-mel front end and a parity test against the card's `WhisperFeatureExtractor(chunk_length=8)` features (M).

**What to do with a cut-off line (M):**

1. **Wait inside the sentence.** If the captions or the early speech-to-text transcript ends on an open word from §3.5, raise the end-of-sentence silence from 300 / 650 ms to **1500 ms**. `eou.ts` already lengthens to 650 ms for connectives; add a "dangling" class above it.
2. **Hold it and join across sentences.** If the voice-activity detector still ends the sentence and the final transcript dangles, nothing is answered. The line is held for the **join window**, and the next accepted sentence said in that window is joined to it.
   - The uncommitted v10 code already does this with a 12 s window (`joinCut`, §1.1).
   - Don't join a sentence that repeats the held line whole, or one that is a fresh request. That is `joinCut`'s rule.
   - Keep gating each sentence on its own before any join, as `accept()` and `fromCaptions()` do now.
   - Keep the join window no longer than the follow-up window: 10 s if FOLLOW_MS becomes 10 s (§5.2).
   - Re-transcribing the joined audio from the 25 s ring is better still, because it gives the transcriber the context.
   - Today's `carry` joins only when the second part begins while the first is still being transcribed (B, repo).
3. **Ask once if nothing comes:**
   - If the held line was named, called or answering Jarvis, and **4 s** pass with no speech after it, ask **one** short question in the line's language: "About what?" / "எதைப் பற்றி?" / "Edha pathi?". For a garbled single word: "Sorry, once more?" / "மன்னிக்கவும், மறுபடி?".
   - The reply comes back as an awaited answer and is joined to the held line.
   - At most once per turn.
   - Otherwise stay silent (tier 0, today's faint line), and drop the held line when the window ends.
   - Why 4 s (M): LiveKit's longest default wait before committing a turn is 3.0 s without a turn detector and 2.5 s with one (B, above), and recalling a name can take longer. Sweep 2.5, 4 and 6 s.
   - The owner asked for "wait for the rest, or ask, not answer" (B, brief).

**Latency (M):** complete lines are untouched. Only dangling lines wait: up to 1.5 s more inside the sentence, then up to 4 s before the question. Those lines would otherwise be answered wrongly or dropped.

---

## 4. Speaker verification on a Windows CPU

### 4.1 Candidates

Entries are (B) at the source cited in the last column unless marked (M). "Vox1-O" means the VoxCeleb1 original trial list.

| # | Model | Code licence | Weights licence | Parameters | File | Reported EER | On this PC (Windows, Python 3.14, Node 24) | Source |
|---|---|---|---|---|---|---|---|---|
| 1 | **3D-Speaker CAM++, VoxCeleb2-trained** (`3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx`) | 3D-Speaker Apache-2.0; sherpa-onnx Apache-2.0 | ModelScope: "Apache License 2.0" | 7.18M | 29.6 MB ONNX | 0.73% Vox1-O, 0.89% Vox1-E, 1.76% Vox1-H (ModelScope) | sherpa-onnx wheel `cp314-win_amd64` (about 2.5 MB), or the npm addon `sherpa-onnx-win-x64` (about 23 MB unpacked) | https://www.modelscope.cn/api/v1/models/iic/speech_campplus_sv_en_voxceleb_16k ; https://github.com/modelscope/3D-Speaker ; release asset list: https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/tags/speaker-recongition-models |
| 2 | 3D-Speaker CAM++ Chinese+English "advanced" | Apache-2.0 | Apache-2.0 | (CAM++ class) | 28.3 MB ONNX | 1.16% Vox-O, 5.98% CN-Celeb; trained on "large-scale Chinese and English" data | sherpa-onnx | https://www.modelscope.cn/api/v1/models/iic/speech_campplus_sv_zh_en_16k-common_advanced |
| 3 | 3D-Speaker ERes2Net, VoxCeleb | Apache-2.0 | Apache-2.0 | 6.61M (README table) | 26.5 MB ONNX | 0.83% Vox1-O | sherpa-onnx | https://www.modelscope.cn/api/v1/models/iic/speech_eres2net_sv_en_voxceleb_16k |
| 4 | WeSpeaker ResNet34 / ResNet34-LM, VoxCeleb | Apache-2.0 | "follows the license of it's corresponding dataset". For VoxCeleb that is CC BY 4.0, so attribution is required | 6.63M | 26.5 MB ONNX | Vox1-O clean: 0.867% plain, 0.797% LM, 0.723% LM + AS-Norm, 0.659% with QMF. "LM" (large-margin fine-tuning) "could perform better on long audios, e.g. >3s", so test plain and LM on short lines | sherpa-onnx; WeSpeaker itself installs from git | https://github.com/wenet-e2e/wespeaker/blob/master/docs/pretrained.md ; https://github.com/wenet-e2e/wespeaker/blob/master/examples/voxceleb/v2/README.md |
| 5 | WeSpeaker CAM++, VoxCeleb | Apache-2.0 | CC BY 4.0 | 7.18M | 29.3 MB ONNX | 0.803% plain, 0.707% LM, 0.659% LM + AS-Norm | sherpa-onnx | as #4 |
| 6 | SpeechBrain ECAPA-TDNN (`speechbrain/spkrec-ecapa-voxceleb`) | Apache-2.0 (speechbrain 1.1.2, 14 Oct 2026, pure Python) | Hugging Face card: apache-2.0 | Not stated on the card. ECAPA-TDNN is 20.8M in the 3D-Speaker table and 14.66M in the CAM++ paper (different widths), so SpeechBrain's own count is not confirmed | 83.3 MB checkpoint | 0.80% on Vox1 test (cleaned) | Needs PyTorch: torch 2.15.0 has a `cp314-win_amd64` wheel (127 MB), and torchaudio 2.11.1. No official ONNX | https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb ; PyPI |
| 7 | NVIDIA TitaNet S / M / L | NeMo Apache-2.0 | L: CC-BY-4.0 (Hugging Face). S: "covered by the license of the NeMo Toolkit" (NGC) | S 6.4M, M 13.4M, L 25.3M (paper; the Hugging Face card says "around 23M"); 192-dim embeddings | sherpa ONNX: S 40.3 MB, L 101.4 MB | Vox1 cleaned: S 1.15%, M 0.81%, L 0.68% (paper); L 0.66% (Hugging Face, v1.10.0). The NGC TitaNet-S card is inconsistent: its performance text says "TitaNet-L" with 6.4M parameters and 1.08% EER | NeMo is heavy on Windows; use the sherpa ONNX files | https://ar5iv.labs.arxiv.org/html/2110.04410 ; https://huggingface.co/nvidia/speakerverification_en_titanet_large ; https://catalog.ngc.nvidia.com/orgs/nvidia/teams/nemo/models/titanet_small |
| 8 | pyannote `embedding` | pyannote.audio MIT | MIT, but **gated**: a Hugging Face login, shared contact information and an access token | — | — | 2.8% Vox1 test (cosine, no VAD or PLDA) | Excluded: it needs an account | https://huggingface.co/pyannote/embedding |
| 8b | pyannote `wespeaker-voxceleb-resnet34-LM` | MIT | CC-BY-4.0; the card shows no gate | (as #4) | — | (as #4) | pyannote.audio 3.1 or later (PyTorch); the same weights as #4 | https://huggingface.co/pyannote/wespeaker-voxceleb-resnet34-LM |
| 9 | Resemblyzer (GE2E, 256-dim) | Apache-2.0 | (same repo) | — | — | **None reported**; "around 1000x real-time on a GTX 1080" | Last PyPI release 0.1.4, Oct 2023: stale. Excluded | https://github.com/resemble-ai/Resemblyzer ; PyPI |
| 10 | WavLM-Base-Plus-SV (transformers.js port `Xenova/wavlm-base-plus-sv`) | — | The UniSpeech repo licence is **CC BY-SA 3.0** (share-alike) | — | ONNX 402 MB fp32, 102 MB quantized | None on the card. Its example threshold is 0.86, "the optimal threshold is dataset-dependent" | Share-alike and size. Excluded | https://huggingface.co/microsoft/wavlm-base-plus-sv ; https://github.com/microsoft/UniSpeech/blob/main/LICENSE ; https://huggingface.co/Xenova/wavlm-base-plus-sv/tree/main/onnx |

**sherpa-onnx, the runtime for #1–#5 and #7** (B):
- **Licence and platforms:** Apache-2.0. It supports Windows x64 and lists speaker identification and verification among its functions (https://github.com/k2-fsa/sherpa-onnx).
- **Python versions:** releases and their first upload dates (PyPI):

  | Version | First upload |
  |---|---|
  | 1.13.8 | 10 Sep 2026 |
  | 2.0.0 | 23 Oct 2026 |
  | 2.0.1 | 26 Oct 2026 |
  | 2.0.2 | 19 Nov 2026 (today) |

  Each has a `cp314-win_amd64` wheel.
- **npm:** `sherpa-onnx-node` 2.0.1 (26 Oct 2026, Apache-2.0) has an optional `sherpa-onnx-win-x64` dependency (23,161,917 bytes unpacked, Apache-2.0). 2.0.2 came out on 19 Nov 2026, the day of this note, so pin 2.0.1 (npm registry `time` field).
- **The wheel to pin:** `sherpa_onnx-2.0.1-cp314-cp314-win_amd64.whl`, 2,241,664 bytes, uploaded 26 Oct 2026 (PyPI). `numpy-2.5.4-cp314-cp314-win_amd64.whl` is 12,703,552 bytes, from 10 Oct 2026, and numpy 2.5.4 needs Python ≥ 3.12.
- **Python API** (`python-api-examples/speaker-identification.py`):
  - `SpeakerEmbeddingExtractorConfig(model=..., num_threads=..., provider=...)`;
  - `SpeakerEmbeddingExtractor(config)`;
  - `stream = extractor.create_stream()`, then `stream.accept_waveform(sample_rate=..., waveform=...)`, `stream.input_finished()`, `extractor.compute(stream)`;
  - `SpeakerEmbeddingManager(extractor.dim)` with `.add` and `.search(embedding, threshold=...)`;
  - default `--threshold` 0.6;
  - "If the text file contains multiple wave files for the same speaker, then the embeddings of these files are averaged."
- **Node API** (`nodejs-addon-examples/test_speaker_identification.js`): `createStream`, `acceptWaveform({sampleRate, samples})`, `compute`, `manager.addMulti`, `search` and `verify`, with `threshold = 0.6`.
- **CAM++ embedding size:** the 3D-Speaker VoxCeleb CAM++ recipe sets `embedding_size: 512`, with 80 mel bins at 16 kHz and mean normalisation (B, https://raw.githubusercontent.com/modelscope/3D-Speaker/main/egs/voxceleb/sv-cam%2B%2B/conf/cam%2B%2B.yaml). Read `extractor.dim` at load rather than hard-coding it (M).

### 4.2 CPU latency for a 3 s clip

- (B) The CAM++ paper (Table 3, "RTF was evaluated on CPU under single-thread condition"; the CPU model is not named, https://ar5iv.labs.arxiv.org/html/2303.00332):

  | Model | Parameters | FLOPs | Real-time factor |
  |---|---|---|---|
  | ECAPA-TDNN | 14.66M | 3.96G | 0.033 |
  | ResNet34 | 6.70M | 6.84G | 0.032 |
  | CAM++ | 7.18M | 1.72G | 0.013 |

- (M) Arithmetic for a 3 s clip on one thread: CAM++ ≈ **39 ms**, ResNet34 ≈ 96 ms, ECAPA ≈ 99 ms. Add a few ms for feature extraction, plus the local HTTP hop. **None of this is measured on the Collector's laptop.** The bake-off must measure it.
- (B) The sherpa-onnx diarization pipeline (segmentation + embeddings + clustering, a 56.9 s clip, 1 thread, hardware not stated) ran at TitaNet-small 0.119 and ERes2Net-base 0.297 (fp32) (https://csukuangfj.github.io/sherpa/onnx/speaker-diarization/models.html). These are upper bounds, not per-clip extraction.
- (M) Speech-to-text takes 281 ms p50 for Sarvam (B, brief). Speaker verification run in parallel will normally finish first, so it adds no latency.

### 4.3 How long the clips must be: verification and enrolment

**Test-clip length (B, ERes2NetV2 paper, Table 3, Vox1-O; https://arxiv.org/html/2406.02167):**

| Model | EER at 3.0 s | EER at 2.0 s | EER, full length |
|---|---|---|---|
| ECAPA-TDNN | 1.27% | 1.95% | 0.82% |
| ResNet34 | 1.47% | 2.12% | — |
| ERes2Net | 1.89% | 3.28% | 0.84% (Table 1, the authors' replication) |
| ERes2NetV2 | 0.98% | 1.48% | 0.61% |

- (B) In Table 3 only the test side is cut to 2 or 3 s; enrolment uses the full utterances. Jarvis has the same set-up: a long averaged enrolment and short test lines.
- (B) ECAPA's full-length 0.82% is from the paper's Table 4 (20.8M parameters). Table 3 was "reproduced through 3D-Speaker toolkit".

- (B) At 1 s it gets much worse. A July 2026 paper reports 8.334% EER on 1 s VoxCeleb1 test segments for its own WavLM + ECAPA model, a 54.8% relative reduction over a conventionally trained baseline (https://arxiv.org/abs/2609.25007, abstract). (M) That puts the baseline near 18.4% at 1 s, against about 1% at 3 s.
- Apple's follow-up clips averaged 3.5 ± 3.25 s (B, above). Many requests are 1–3 s (M).
- **Rule (M):** no decision below 1.0 s of speech. From 1.0 to 2.0 s, only a clear "other voice" counts. From 2.0 s up, a full decision.

**Enrolment:**
- (B) Resemblyzer suggests a profile from "a few seconds of speech (5s - 30s)".
- (B) Apple Personalized Hey Siri:
  - enrols with 5 phrases;
  - adds accepted utterances to the profile "until it contains 40";
  - **also stores the "Hey Siri" audio on the phone**, so profiles can be rebuilt when the model changes.
- (B) Siri's 2023 voice trigger: guided enrolment with phrases like "Siri, how's the weather?" (link in §2.1).
- (B, vendor) Picovoice Eagle:
  - enrolment "takes a few seconds of speech";
  - their cookbook says "Most speaker recognition engines require 2–3 seconds of continuous speech for reliable identification";
  - it needs an AccessKey and an account, so it is not usable here.
  - https://picovoice.ai/cookbook/ai-voice-assistant-speaker-recognition/ , https://picovoice.ai/cookbook/personalized-wake-word/
- (B) The I-MSV 2022 challenge (Indian languages, 100 h, 100 speakers, 5 sensors, 13 languages) aimed to make verification "robust to language and sensor variations between enrollment and testing". The best EERs were 2.12% (constrained) and 0.26% (unconstrained) (https://arxiv.org/abs/2302.13209).
- (M) **Enrolment for Jarvis:**
  - 30–60 s of natural speech in 6–10 clips;
  - in English, Tamil and Tanglish;
  - at the console's own microphone and seat;
  - through Jarvis's own capture chain (echo cancellation, noise suppression, gain control);
  - in the office's normal noise.

  Language and microphone mismatch are the main risks, and enrolling across them is the cheapest guard.

### 4.4 Thresholds and calibration

- (B) Thresholds are model-specific:
  - SpeechBrain's `verify_batch(..., threshold=0.25)` compares a cosine similarity (https://raw.githubusercontent.com/speechbrain/speechbrain/develop/speechbrain/inference/speaker.py);
  - sherpa-onnx's examples use 0.6;
  - the WavLM card uses 0.86.
- (B) Score normalisation helps. WeSpeaker ResNet34 on Vox1-O clean went from 0.867% to 0.787% with AS-Norm, and to 0.718% with QMF added.

**Calibration (M):**
1. **Genuine scores.** Score each enrolment clip leave-one-out against the average of the others. Then, in a supervised live check, the owner says 20 short lines and only the scores are kept.
2. **Impostor scores.** Use:
   - the synthetic text-to-speech voices already in the repo's eval clips;
   - colleagues who consent, scored live with only scores kept;
   - optionally, a public cohort, which needs the owner's OK to download a dataset.
3. **Thresholds.**
   - θ_accept = the 99th percentile of impostor scores (about 1% false accepts).
   - θ_reject = the 1st percentile of genuine scores (about 1% of the owner's lines rejected).
   - Between the two is "unsure".
   - If θ_accept < θ_reject, use their midpoint for both.
4. **Starting values** before calibration, for CAM++ via sherpa: accept 0.60 (the sherpa example) and reject 0.35 (my guess). Re-calibrate after any change of model, microphone or capture chain.
5. Add AS-Norm with a cohort of about 200 impostor embeddings only if raw cosine separation is poor.

### 4.5 Privacy

- **Repo precedents (B):** the PaddleOCR service runs on 127.0.0.1 only and keeps a photo in memory for one request, "never written to disk" (`manu_paddle_ocr/server.py`). Jarvis's ears never store audio (`ears.ts`).
- **Embeddings are biometric-derived.** (B) Model inversion can "reconstruct audio samples" from a speaker-recognition model and "generate spoofed audio samples to impersonate a speaker" (Pizzi et al. 2023, https://arxiv.org/abs/2301.03206).
- **Practice (M):**
  - Ask for consent first.
  - Store only:
    - the averaged embedding;
    - the model file name and SHA-256;
    - the dimension;
    - the thresholds;
    - summary statistics: clip count, seconds of speech, leave-one-out minimum and mean.
  - Never store audio. Drop the per-clip embeddings once calibration is done.
  - Keep the file at `chennai-grievance-portal-main/data/thunai/voiceprint.json`, on this machine only:
    - never commit it, and add it to `.gitignore` in the build;
    - make it readable by the console's Windows user only;
    - Windows DPAPI encryption is optional.
  - "Jarvis, forget my voice" deletes it.
  - Visitors' embeddings are computed per sentence in memory and dropped.
  - The speaker score may go in the local audit log. Nothing goes to any outside service.
- **Trade-off against Apple (M):** because no audio is kept, a model change means re-enrolling.

### 4.6 Can it run in the browser?

- **What exists (B):**
  - Jarvis already runs onnxruntime-web for Silero VAD and, in a worker, the wake word (`ears.ts`, `kws.ts`).
  - sherpa-onnx's `wasm/` folder has asr, forced-alignment, kws, speaker-diarization, speech-enhancement, tts, vad and vad-asr builds, plus `nodejs` and `web`. It has **no speaker-identification build**, and the README lists no speaker-identification WebAssembly demo. The diarization build does compute speaker embeddings inside WASM.
  - `diarization-js` 0.1.0 (Apache-2.0) runs an ONNX port of pyannote's community-1 diarization pipeline through onnxruntime-web (WebGPU or WASM) and exports a JavaScript `audio/fbank`.
  - `@jaehyun-ko/speaker-verification` 5.0.0 (Apache-2.0) runs NeXt-TDNN in the browser with onnxruntime-web.
  - (npm registry entries for both.)
- **Feasible, with a risk (M).** CAM++ ONNX (29.6 MB) can run in a worker with a JavaScript Kaldi-style filterbank (80 mel bins, 16 kHz, mean normalisation as in the 3D-Speaker config). The risk is a filterbank that differs from training: scores drift silently. Two checks come first:
  - a parity test against sherpa-onnx's own features, with maximum absolute difference ≤ 1e-3 on the repo's eval clips;
  - a WASM speed measurement.
- **A second browser route with no parity risk:**
  - (B) `c-api.h` declares 25 speaker-embedding functions, among them `SherpaOnnxCreateSpeakerEmbeddingExtractor`, `SherpaOnnxSpeakerEmbeddingExtractorCreateStream`, `SherpaOnnxSpeakerEmbeddingExtractorComputeEmbedding`, `SherpaOnnxSpeakerEmbeddingExtractorDim` and `SherpaOnnxSpeakerEmbeddingManagerVerify`. The config fields are `model`, `num_threads`, `debug` and `provider` (https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/sherpa-onnx/c-api/c-api.h).
  - (B) The diarization WASM build already links the embedding extractor. Its JavaScript takes `embedding: { model: './embedding.onnx' }` and a clustering threshold of 0.5 (https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/wasm/speaker-diarization/sherpa-onnx-speaker-diarization.js).
  - (M) So a WebAssembly build that exports the speaker-embedding API would use sherpa's own C++ filterbank, and browser and sidecar scores would match. The cost is an Emscripten tool-chain in the build, plus the 29.6 MB model loaded in each browser profile.
- **The gain (M):** the browser could drop a visitor's speech before it is ever uploaded to speech-to-text. That is the reason to move there in a later version.

### 4.7 Where to run it in Jarvis

**A: Python sidecar (recommended for v10, M).** It follows `manu_paddle_ocr/` (B, repo: `setup.bat`, `start.bat`, `server.py` on `127.0.0.1:8867`, started by `start-fast.bat` if its `.venv` exists).
- Folder `jarvis_voice/` at the repo root.
- `requirements.txt`: `sherpa-onnx==2.0.1` and `numpy==2.5.4`. Both are over 2 weeks old and have `cp314-win_amd64` wheels (B, PyPI).
- Python's standard-library `http.server` on **127.0.0.1:8871**. Read WAV with the standard-library `wave` module.
- The model file goes in `jarvis_voice/models/` with its SHA-256 checked at load.
- `start-fast.bat` and `start.bat` start it only if `.venv` exists, as for PaddleOCR. Jarvis works without it: speaker verification simply abstains.
- The brief suggests FastAPI with uvicorn (B, brief 4.10). The standard library is enough for four routes and adds no dependencies; either works (M).
- **Downloads need the owner's OK first** (M). Name each file, its source and its size when asking:
  - `3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx`, 29,596,979 bytes, from the k2-fsa/sherpa-onnx GitHub release `speaker-recongition-models`. The tag's misspelling is real, and the release has a `checksum.txt` (B);
  - the two wheels named in §4.1.

**B: no Python (M).** Run `sherpa-onnx-node@2.0.1` inside the Next server route that already receives the 16 kHz WAV (`/hear`). Mark it in `serverExternalPackages`. The model and API are the same.

**C: browser worker, later (M).** See §4.6.

**Request and response shapes (M):**

```
GET  /health
  -> {"ok": true, "model": "3dspeaker_speech_campplus_sv_en_voxceleb_16k", "dim": 512, "enrolled": true}

POST /verify            body: audio/wav, 16 kHz mono PCM16 (the same bytes /hear builds)
  -> {"enrolled": true, "score": 0.71, "speech_s": 2.84, "decision": "owner" | "other" | "unsure" | "short",
      "accept": 0.60, "reject": 0.35, "ms": 38}
  -> {"enrolled": false}                                  (no profile: the gate behaves as today)

POST /enrol/clip        body: audio/wav, one prompt (3–8 s); kept in memory for this enrolment session only
  -> {"clip": 3, "speech_s": 4.9, "ok": true}            ("ok": false, "why": "too short" | "too quiet" | "two voices?")
POST /enrol/finish
  -> {"ok": true, "clips": 8, "speech_s": 41.2, "loo_min": 0.62, "loo_mean": 0.74, "accept": 0.60, "reject": 0.35}
DELETE /enrol           ("Jarvis, forget my voice")
  -> {"ok": true}
```

**Wiring (M):**
1. `/hear` posts the WAV to `/verify` at the same moment it starts speech-to-text.
2. When speech-to-text returns, it uses the speaker result if it has arrived, or waits at most 50 ms more. Otherwise the decision is `none`.
3. Captions-only turns (the browser recogniser's path) have no WAV. Either abstain, or score the matching span from the ears' ring buffer.

---

## 5. The v10 gate

### 5.1 The rules, in order (M)

Inputs per sentence:
- the text and its language;
- seconds since Jarvis's voice ended;
- `called` and `awaitingAnswer`;
- the visible screen lines;
- the speaker result (`decision`, `score`, `speech_s`);
- Whisper's `noSpeech` and `logprob` when Whisper decoded;
- whether "company present" is set.

| # | Rule | Effect |
|---|---|---|
| G0 | **Hygiene:** self-hearing overlap with Jarvis's current speech ≥ 0.6 (`overlap`); Whisper `no_speech_prob` ≥ 0.6; an empty transcript | Drop, no trace on screen |
| G1 | **Stop word** (today's `isStopWord`), from any voice | Act, level A |
| G2 | **Speaker** (only once enrolled and switched on): `decision = other` with `speech_s` ≥ 1.0 | Silent, with a faint "voice not recognised" line for 2 s. Close the window. Company present for 120 s |
| G3 | **Named** ("Jarvis", ஜார்விஸ்) and not "talked about" | Go to G5 (cut-off check), then act |
| G4 | **Hard silences** (§3), checked unless named: another assistant's name; a title, vocative or attention-getter to a person; an errand for a person; a question to a person; reported speech; a perception verb plus a demonstrative about the screen; reading a visible line aloud; a filler; an unclear single word; Whisper `avg_logprob` < −1.0 on an unnamed line (Whisper's default `logprob_threshold`) | Silent. The person, assistant and screen-talk classes also close the window and set company present for 120 s |
| G5 | **Cut-off** (§3.5): an open ending | Wait 1.5 s more inside the sentence. Then hold the line for the join window and join the next accepted, non-fresh sentence. If the line was named, called or awaiting and 4 s pass in silence, ask one short question; otherwise silent |
| G6 | **Called:** the first sentence within 12 s of "Hey Jarvis" (`CALL_MS`), and G2 did not say `other` | Act |
| G7 | **Awaiting an answer** (a yes, a choice, a question back) within 15 s | Act as the answer |
| G8 | **Follow-up window:** within FOLLOW_MS of the end of Jarvis's voice; shaped as a request; not side talk (today's `looksRequest`, `looksSide`, `chore`); and the speaker decision is `owner` or `none` (not `unsure` or `other`) | Act. The window restarts after Jarvis's reply |
| G9 | Everything else | Silent (tier 0) |

### 5.2 Values

| Name | Value | Why |
|---|---|---|
| FOLLOW_MS | **10 s** from the end of Jarvis's voice (today `ENGAGED_MS` = 20 s) | Google about 10 s, Alexa+ about 8 s, Gemini Live 15 s (B, §2.2). Sweep 8 / 10 / 12 / 15 / 20 s on the replay set (M). `holdout.live.ts` already models an 8 s window against 20 s (B, repo) |
| AWAIT_MS | 15 s | Gemini Live's 15 s (B, §2.2); an answer can take thought (M) |
| COMPANY_MS | 6 s window while company is present | Shrinks, does not close, when others are in the room (M) |
| COMPANY_HOLD | 120 s since the last other-voice, vocative or screen-talk cue | (M) |
| CALL_MS | 12 s (unchanged) | (B, repo) |
| Dangling end-of-sentence silence | 1500 ms (today 650 ms for "open" words) | (M) |
| Cut-off join window | No longer than FOLLOW_MS (10 s). The uncommitted `joinCut` uses 12 s | (M); sweep 4 / 8 / 10 / 12 s |
| Cut-off question delay | 4 s of silence after a named, called or awaiting cut-off line | LiveKit's longest default wait is 3.0 s (B); sweep 2.5 / 4 / 6 s (M) |
| Clarifying questions | At most 1 per turn; only when named, called or awaiting | (M) |
| Reading aloud | ≥ 4 content words, ≥ 70% found in one visible line, no request verb or question | (M) |
| Wake-word threshold | Measure 0.5 / 0.6 / 0.7; pick the lowest that keeps the owner's recall ≥ 95% at ≤ 0.5 false wakes per hour | LiveKit says raise it above 0.5 if there are too many false alarms (B) |
| Whisper hygiene | `no_speech_prob` ≥ 0.6 drops the line (today's `stt.ts` rule, B repo); `avg_logprob` < −1.0 counts as unclear on an unnamed line | Whisper's defaults are `no_speech_threshold` 0.6 and `logprob_threshold` −1.0. Whisper itself skips a segment as silent only when **both** hold: no-speech above 0.6 and log-probability at or below −1.0 (B, https://raw.githubusercontent.com/openai/whisper/main/whisper/transcribe.py). The repo's one-condition drop is stricter. Keep it unless the replay set shows dropped requests (M) |
| Speaker: minimum speech | 1.0 s for any decision; 2.0 s for a full one | Short-clip EER rises sharply (B, §4.3) |
| Speaker thresholds (CAM++, start) | Accept 0.60, reject 0.35, then calibrated (§4.4) | sherpa example 0.6 (B); reject is my guess (M) |
| Speaker wait | ≤ 50 ms after speech-to-text returns, then abstain | Latency must not get worse than v9 (B, brief) |

### 5.3 The follow-up window (M)

- **Opens** when Jarvis's voice ends, not when its text is ready.
- **Lasts:**
  - FOLLOW_MS (10 s);
  - AWAIT_MS (15 s) while a yes, choice or question is pending;
  - COMPANY_MS (6 s) while company is present.
- **Restarts** on each accepted turn.
- **Closes at once** on any of:
  - a title, vocative or attention-getter to a person;
  - another assistant's name;
  - screen talk or reading aloud;
  - "thank you", "that's all", "போதும்", "நன்றி" or "thanks" alone;
  - a phone opener ("hello?" or ஹலோ at the start);
  - another voice (G2).
- **Reopens** only on "Hey Jarvis" or the name.
- The strict audio gate stays as it is: nothing outside the window goes to `/hear`. A shorter window therefore also means less of the room's speech uploaded, and less Sarvam credit spent.
- **Optional voice switch:** "Jarvis, meeting mode" makes Jarvis name-only (no window) until "Jarvis, meeting over" or 60 min, whichever comes first. This mirrors Alexa staying off during calls (B for Alexa). Any visible change needs before-and-after stills (B, brief Part 7).

### 5.4 Worked examples (expected verdicts, M)

| # | Who, when | Line | Rule | Verdict |
|---|---|---|---|---|
| 1 | Owner, 4 s after Jarvis spoke | "Tell me about the" … (1 s) … "Akvan storm" | G5 join | Act on "Tell me about the Akvan storm" |
| 2 | Owner, right after "Hey Jarvis" | "What are the" (then nothing) | G5 → called | After 4 s of silence, ask "About what?" once |
| 3 | Anyone | "Alexa, when was it open?" | G4 another assistant | Silent; window closed |
| 4 | Staff member, inside the window | "Sir, the MLA is waiting outside" | G2 other voice, or G4 title | Silent; window closed; company present |
| 5 | Visitor | "சார், என் மனு என்ன ஆச்சு?" (Sir, what happened to my petition?) | G2 or G4 title | Silent |
| 6 | Owner | "ஏங்க, இதைப் பாருங்க" (Hey, look at this) | G4 attention-getter + perception verb | Silent; window closed |
| 7 | Owner | "தம்பி, அந்த ஃபைலை எடுத்துட்டு வா" (Thambi, bring that file) | G4 vocative + errand | Silent |
| 8 | Owner, 3 s after an answer | "See, this one has gone up" | G4 screen talk | Silent; window closed |
| 9 | Owner | "Idhu romba jaasthi aagiduchu, paarunga" | G4 screen talk (Tanglish) | Silent |
| 10 | Owner, a headline on screen | Reads the headline word for word | G4 reading aloud | Silent |
| 11 | Owner, 6 s after Jarvis spoke | "Open the Akvan storm news" | G8 | Act |
| 12 | Owner | "He said show the Adyar report" | G4 reported speech | Silent |
| 13 | Owner | "அடையார் ரிப்போர்ட் காட்டுங்கன்னு சொன்னார்" (He said to show the Adyar report) | G4 quotative | Silent |
| 14 | Owner | "நாளைக்கு மழை வருமாம்" (They say it will rain tomorrow) | G4 hearsay -ஆம் | Silent |
| 15 | Owner, 7 s after Jarvis spoke | "Adyar la evvalavu complaints?" | G8 | Act |
| 16 | Owner, 14 s after Jarvis spoke | "Adyar la evvalavu complaints?" | Window closed (10 s) | Silent; saying "Jarvis" puts it right |
| 17 | Visitor | "Jarvis, Adyar complaints" | G2 other voice (owner-only mode) | Silent (owner's decision: see recommendation 9) |
| 18 | Anyone, while Jarvis speaks | "Stop" | G1 | Stop |
| 19 | Owner | "தயவுசெய்து," (please) | G4 filler | Silent |
| 20 | Owner, a phone rings | "Hello? Haan, sollunga" | Phone opener | Silent; window closed |
| 21 | Owner | "அக்வான் புயல் செய்தியை" … (1 s) … "திறங்க" (the Akvan storm news … open it) | G5 accusative with no verb, then join | Act on the joined line |
| 22 | Owner, after a false wake from TV audio | (a visitor speaks) | G2 other voice vetoes "called" (G6) | Silent |
| 23 | Owner, 5 s after Jarvis spoke | "அக்வான் என்ற புயல் பற்றி சொல்லுங்க" (Tell me about the storm called Akvan) | என்ற is naming, not the quotative (§3.4); G8 | Act |
| 24 | Owner, 5 s after Jarvis spoke | "Adyar complaints paarunga" (look at the Adyar complaints) | A perception verb with a console noun and no demonstrative stays a request (§3.3 guard); G8 | Act |
| 25 | Owner, 5 s after Jarvis spoke | "Indha alert vendaam" (not this alert) | A negative, not the hearsay -aam (§1.1) | Not silenced as hearsay; it goes on to the lanes |

### 5.5 What to measure (M; the metric types are industry practice, B §2.3)

**Sets:**
1. **The owner's real turns.**
   - Text and timestamps from the local audit log, labelled "for Jarvis" or "side". This set stays local and is never committed (B, brief).
   - Re-run every gate variant on it.
   - Use the timestamps for the gap distribution since Jarvis's last turn, and pick FOLLOW_MS so that at least 90% of the genuine unnamed follow-ups fall inside it, capped at 15 s.
2. **The new blind set's side-talk and cut-off groups** (brief Part 6). Add minimal pairs: the same words with and without a vocative, at 4 s and at 14 s, in Tamil script and in Latin script.
3. **Speaker audio.** Live sessions only, keeping scores and never audio:
   - the owner's 20 lines;
   - text-to-speech voices from the repo's eval clips as impostors;
   - consented colleagues.

**Gate metrics and targets:**

| Metric | Target |
|---|---|
| False wakes (Jarvis spoke or acted on side talk) per hour of in-window side talk | ≤ 0.5 |
| Missed requests, named | ≤ 2% |
| Missed requests, unnamed follow-ups in the window | ≤ 10% |
| Cut-off lines answered as requests | 0 |
| Clarifying questions per 30 min of normal use | ≤ 1 |
| Wake-word false alarms per hour of meeting-like speech, at each tried threshold | — |
| The owner's "Hey Jarvis" recall | ≥ 95% |

**Speaker-verification metrics, for each model:**
- the EER;
- the false-reject rate when false accepts are held at 1%;
- by clip length: under 1 s, 1–2 s, 2–4 s, over 4 s;
- by language: English, Tamil, Tanglish;
- by position: at the desk, and about 1.5 m across it;
- by condition: with the fan or air-conditioning on, and with Jarvis's own voice playing;
- latency p50 and p90 per clip, and memory.

Pick the model with the lowest false-reject rate at 1% false accepts on clips of 2 s or more, with latency p90 ≤ 80 ms.

**Latency:** wake, command to screen, and question to first word, each with n, p50 and p90. None may get worse than v9 (B, brief).

---

## 6. Recommendations for Jarvis v10

1. **Shorten and govern the follow-up window.**
   - `ENGAGED_MS` 20 s becomes `FOLLOW_MS` 10 s, measured from the end of Jarvis's voice; 15 s while Jarvis waits for an answer; 6 s while company is present.
   - Close the window at once on any person, assistant or screen-talk cue, or another voice.
   - Make the values flags, and sweep 8–20 s on the owner's replay set before fixing them.
2. **Extend the hard silences to Tamil script and Tanglish** (§3.1 table). The uncommitted `HONORIFIC_TA` already covers Tamil-script titles set off by a comma, and ஏங்க / ஏய் / டேய் (§1.1). Still to add:
   - Tanglish attention-getters without a comma: enga, ennanga, dei, yov;
   - end particles after a verb: da / pa / ma, டா / பா / மா;
   - "Collector sir/amma", கலெக்டர் சார்;
   - roles: PA, AE, டிரைவர்;
   - place-name exceptions through the gazetteer;
   - each hit closes the window.

   Write the failing tests first, from the §5.4 rows.
3. **Finish screen talk and reported speech** (§3.3, §3.4). The uncommitted code already has a perception verb with a demonstrative, a phone opener and the hearsay ending (§1.1). Still to add:
   - a demonstrative with a statement of change and no perception verb ("this one has gone up", "இது ஏறிடுச்சு");
   - reading a visible line aloud (≥ 4 content words, ≥ 70% overlap);
   - the quotative என்று / -ன்னு / -nu, only with a verb of saying or asking after it, and never என்ற (naming);
   - excluding "vendaam" from the Tanglish hearsay test.
4. **Hold cut-off lines, then join or ask; never answer them** (§3.6):
   - add the §3.5 endings to `eou.ts` `OPEN`, to `DANGLING8` and to `browser10.ts`'s `DANGLING_*`, as a "dangling" class with 1500 ms of end silence;
   - keep the uncommitted `joinCut` hold-and-join, with its window no longer than FOLLOW_MS;
   - if a named, called or awaiting cut-off line gets nothing for 4 s, ask one short question in its language; otherwise stay silent.
5. **Treat the wake word as a side-talk source:**
   - measure `NEXT_PUBLIC_JARVIS_KWS_THRESHOLD` at 0.5, 0.6 and 0.7 (LiveKit: 0.5–2.5 false alarms per hour at 0.5);
   - pick the lowest that keeps the owner's recall ≥ 95%;
   - with speaker verification on, an "other" voice vetoes the "called" sentence.
6. **Keep ASR-confidence features when Sarvam leads:**
   - Whisper's `no_speech_prob` ≥ 0.6 drops the line; `avg_logprob` < −1.0 counts as unclear when unnamed;
   - for a Sarvam-only decode, use Whisper-shadow agreement where it exists, the length of speech, and the speaker score.
7. **Speaker verification: the owner's explicit yes, then enrolment.**
   - A Python sidecar `jarvis_voice/`: standard-library `http.server` on 127.0.0.1:8871, with `sherpa-onnx==2.0.1` and `numpy==2.5.4`.
   - The model is the 3D-Speaker CAM++ VoxCeleb ONNX (Apache-2.0, 29.6 MB).
   - `/verify` runs in parallel with speech-to-text and abstains if it is down, takes more than 50 ms past speech-to-text, or has under 1 s of speech.
   - The gate uses `owner`, `other` or `unsure` (§5.1, G2, G6, G8).
   - If the build should have no Python, use `sherpa-onnx-node@2.0.1` in the `/hear` route.
   - Ask the owner before downloading the model (29,596,979 bytes) and the two wheels; §4.7 names each file and its source.
   - Why not SpeechBrain ECAPA first, as the brief suggests: its EER is similar (0.80% against 0.73%). But it needs PyTorch (the torch 2.15.0 Windows wheel alone is 126.7 MB), an 83.3 MB checkpoint, and about 2.5× the CPU time (real-time factor 0.033 against 0.013). Keep it in the bake-off.
8. **Enrolment and storage:**
   - a consent screen, then 8 prompts of about 5 s each (3 English, 3 Tamil, 2 Tanglish, with two "Hey Jarvis, …" commands among them), at the usual seat and microphone;
   - store only `voiceprint.json`: the averaged embedding, the model's SHA-256, the dimension, the thresholds and the summary statistics;
   - no audio, and no per-clip embeddings after calibration;
   - local, never committed;
   - "Jarvis, forget my voice" deletes it, and any model change requires a new enrolment.
9. **Owner decision: who may use Jarvis once enrolled.**
   - Default: "owner only". Other voices are ignored except "stop".
   - Alternative: "anyone with the name", where named requests from other voices are allowed at level A only.
   - A voice command switches between them. Ask the owner; do not assume.
10. **Bake-off before choosing the model.**
    - Candidates: CAM++ VoxCeleb, CAM++ Chinese+English "advanced", WeSpeaker ResNet34-LM (CC BY 4.0, attribution) and SpeechBrain ECAPA (needs PyTorch).
    - Score live and keep only the scores.
    - Report the false-reject rate at 1% false accepts, by length, language, distance and noise, plus latency p50 and p90 on the laptop.
11. **Evaluation and tests:**
    - add the §5.4 rows as unit tests;
    - extend the blind set with the side-talk classes (vocative English / Tamil / Tanglish, another assistant, reported speech, screen talk, reading aloud, phone call, visitor speech) and with cut-offs;
    - report false wakes per hour and missed requests for the gate with and without speaker verification.
12. **Do not use:**
    - LiveKit's turn detectors (licence);
    - Vogent-Turn (restricted licence, gated);
    - `pyannote/embedding` (gated account);
    - WavLM-SV (CC BY-SA 3.0, 102–402 MB);
    - Resemblyzer (stale, no EER);
    - an untuned LLM as the gate;
    - camera or gaze cues, which are weak when the screen is the shared object and need their own consent.
13. **Later:** move speaker verification into the browser, so that a visitor's speech never leaves it. There are two routes (§4.6):
    - a sherpa-onnx WebAssembly build that exports its C speaker-embedding API, with no feature-parity risk;
    - onnxruntime-web with a JavaScript filterbank, once a parity test against sherpa-onnx passes (≤ 1e-3).

    Measure the WASM speed before choosing.

---

## Appendix A. Not confirmed, or still open

- **Siri's follow-up window:** not documented by Apple. Is Alexa+'s "about 8 seconds" fixed or adaptive? The page doesn't say. Alexa Conversation Mode's inactivity timeout has no published number.
- **Latency on the Collector's laptop:** for speaker verification, and for any end-of-turn model, nothing is measured. The real-time factors above come from papers whose CPUs are unnamed.
- **Speaker-verification error on Tamil and Tanglish speech:** all the EERs above are on VoxCeleb (celebrity interviews) or CN-Celeb. Cross-language behaviour for one enrolled speaker must be measured. I-MSV 2022 shows the problem is recognised, but I did not read per-condition numbers.
- **The VoxCeleb dataset's terms:**
  - the VoxCeleb1 page now says only that its metadata is CC BY-SA 4.0;
  - WeSpeaker says its VoxCeleb models follow "CC BY 4.0";
  - ModelScope labels the 3D-Speaker VoxCeleb models Apache-2.0;
  - SpeechBrain labels its model apache-2.0.

  I report each label as published. A legal reading is outside this note.
- **The CAM++ embedding size:** the recipe says 512. Read `extractor.dim` at load.
- **The Tamil quotative என்று** is now confirmed in a grammar paper (§3.4), and the hearsay clitic -ஆம் in Wikipedia. The colloquial forms -ன்னு / -னு and the list of saying verbs are my own (M); check them on the owner's real turns.
- **TamilEOT's licences:** the arXiv page states none for the data or the model. The licences above come from the model card and the dataset source it names.
- **Whether the owner's real sessions contained false wakes:** the audit log is local and was not read for this note. The replay set will show it.
- **The 1 s baseline in arXiv 2609.25007:** the abstract gives only 8.334% and a 54.8% relative reduction. The baseline's 18.4% is my arithmetic.

---

## Appendix B. Sources

**Device-directed speech and products**
- Mallidi et al. 2018: https://arxiv.org/abs/1808.02504
- Amazon Science, Follow-Up Mode detector, 6 May 2020: https://www.amazon.science/blog/how-alexa-knows-when-youre-talking-to-her
- Amazon Science, Conversation Mode, 18 Nov 2021: https://www.amazon.science/blog/new-alexa-feature-enables-natural-multiparty-interactions
- About Amazon, Conversation Mode (18 Nov 2021, updated 26 Sep 2022): https://www.aboutamazon.com/news/devices/conversation-mode-helps-interactions-with-alexa-feel-more-natural
- Google "Stop" without the wake word, press, 26 Jan 2022: https://voicebot.ai/2022/01/26/new-stop-command-silences-google-assistant-without-hey-google-wake-word/
- Gillespie et al. 2020: https://arxiv.org/abs/2010.01949
- Amazon natural turn-taking, 24 Sep 2020: https://www.amazon.science/blog/change-to-alexa-wake-word-process-adds-natural-turn-taking
- Apple voice trigger, 11 Aug 2023: https://machinelearning.apple.com/research/voice-trigger
- Apple streaming transformer, Jul 2021: https://machinelearning.apple.com/research/streaming-transformer
- Apple multimodal LLM detection: https://arxiv.org/html/2403.14438v2
- Apple follow-ups: https://arxiv.org/html/2411.00023v2
- Apple Personalized Hey Siri: https://machinelearning.apple.com/research/personalized-hey-siri
- Shriberg et al. 2012: https://www.isca-archive.org/interspeech_2012/shriberg12_interspeech.html
- Shriberg et al. 2013: https://www.isca-archive.org/interspeech_2013/shriberg13_interspeech.html
- Batliner et al. 2007 (SmartWeb Off-Talk): https://www.isca-archive.org/avsp_2007/batliner07_avsp.pdf
- Jovanovic et al. 2006: https://aclanthology.org/E06-1022.pdf
- Google Look and Talk: https://research.google/blog/look-and-talk-natural-conversations-with-google-assistant/ and https://blog.google/products/assistant/assistant-io-2022/
- Meta WearVox: https://arxiv.org/html/2601.02391v1
- Google Continued Conversation and Gemini: https://support.google.com/googlenest/answer/7685981?hl=en
- Alexa+ Follow Up Mode: https://digprjsurvey.amazon.com/csad/help/node/TtQI6drnxX9fpAYrc1
- Alexa Follow-Up Mode, 2018: https://www.iclarified.com/64894/amazon-alexa-gets-new-followup-mode-that-allows-backtoback-requests-without-repeating-wake-word
- Dubois et al., PETS 2020: https://petsymposium.org/popets/2020/popets-2020-0072.php
- LiveKit WakeWord README: https://github.com/livekit/livekit-wakeword

**Language**
- Tamil grammar (word order, vocative, hearsay clitic): https://en.wikipedia.org/wiki/Tamil_grammar
- Penn Tamil web book (fictive kinship address): https://ccat.sas.upenn.edu/plc/tamilweb/book/chapter3/node25.html
- Sarveswaran, *Morphology and Syntax of the Tamil Language* (the quotative *enṛu*): https://arxiv.org/abs/2401.08367

**End of turn**
- LiveKit turn detector docs: https://docs.livekit.io/agents/build/turns/turn-detector/
- LiveKit licence: https://huggingface.co/livekit/turn-detector/blob/main/LICENSE
- Pipecat Smart Turn: https://github.com/pipecat-ai/smart-turn
- indic-smart-turn: https://huggingface.co/adimyth/indic-smart-turn
- TamilEOT: https://arxiv.org/abs/2609.05631
- TamilEOT model card (`smart-turn-tamil`): https://huggingface.co/santhosh-005/smart-turn-tamil
- Vogent-Turn-80M: https://huggingface.co/vogent/Vogent-Turn-80M
- Namo Turn Detector: https://huggingface.co/videosdk-live/Namo-Turn-Detector-v1-Multilingual
- TEN Turn Detection: https://huggingface.co/TEN-framework/TEN_Turn_Detection
- Whisper `transcribe.py` defaults: https://raw.githubusercontent.com/openai/whisper/main/whisper/transcribe.py

**Speaker verification**
- SpeechBrain ECAPA model card: https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb
- SpeechBrain ECAPA files: https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb/tree/main
- SpeechBrain `verify_batch` code: https://raw.githubusercontent.com/speechbrain/speechbrain/develop/speechbrain/inference/speaker.py
- WeSpeaker pretrained models: https://github.com/wenet-e2e/wespeaker/blob/master/docs/pretrained.md
- WeSpeaker VoxCeleb results: https://github.com/wenet-e2e/wespeaker/blob/master/examples/voxceleb/v2/README.md
- WeSpeaker repository: https://github.com/wenet-e2e/wespeaker
- 3D-Speaker: https://github.com/modelscope/3D-Speaker
- ModelScope CAM++ VoxCeleb: https://www.modelscope.cn/api/v1/models/iic/speech_campplus_sv_en_voxceleb_16k
- ModelScope CAM++ Chinese+English "advanced": https://www.modelscope.cn/api/v1/models/iic/speech_campplus_sv_zh_en_16k-common_advanced
- ModelScope ERes2Net VoxCeleb: https://www.modelscope.cn/api/v1/models/iic/speech_eres2net_sv_en_voxceleb_16k
- 3D-Speaker CAM++ recipe config: https://raw.githubusercontent.com/modelscope/3D-Speaker/main/egs/voxceleb/sv-cam%2B%2B/conf/cam%2B%2B.yaml
- CAM++ paper: https://ar5iv.labs.arxiv.org/html/2303.00332
- ERes2NetV2 paper: https://arxiv.org/html/2406.02167
- TitaNet paper: https://ar5iv.labs.arxiv.org/html/2110.04410
- TitaNet-L model card: https://huggingface.co/nvidia/speakerverification_en_titanet_large
- TitaNet-S on NGC: https://catalog.ngc.nvidia.com/orgs/nvidia/teams/nemo/models/titanet_small
- pyannote `embedding`: https://huggingface.co/pyannote/embedding
- pyannote `wespeaker-voxceleb-resnet34-LM`: https://huggingface.co/pyannote/wespeaker-voxceleb-resnet34-LM
- Resemblyzer: https://github.com/resemble-ai/Resemblyzer
- WavLM-Base-Plus-SV: https://huggingface.co/microsoft/wavlm-base-plus-sv
- UniSpeech licence: https://github.com/microsoft/UniSpeech/blob/main/LICENSE
- WavLM ONNX files: https://huggingface.co/Xenova/wavlm-base-plus-sv/tree/main/onnx
- sherpa-onnx: https://github.com/k2-fsa/sherpa-onnx
- sherpa-onnx speaker models release: https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/tags/speaker-recongition-models
- sherpa-onnx Python example: https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/python-api-examples/speaker-identification.py
- sherpa-onnx Node example: https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/nodejs-addon-examples/test_speaker_identification.js
- sherpa-onnx diarization timings: https://csukuangfj.github.io/sherpa/onnx/speaker-diarization/models.html
- sherpa-onnx C API header: https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/sherpa-onnx/c-api/c-api.h
- sherpa-onnx WASM folder and diarization JavaScript: https://api.github.com/repos/k2-fsa/sherpa-onnx/contents/wasm , https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/wasm/speaker-diarization/sherpa-onnx-speaker-diarization.js
- PyPI JSON for the pinned wheels: https://pypi.org/pypi/sherpa-onnx/2.0.1/json , https://pypi.org/pypi/numpy/2.5.4/json
- npm publish times and the Windows addon: `npm view sherpa-onnx-node time`, `npm view sherpa-onnx-win-x64@2.0.1`, read 19 Nov 2026
- npm `sherpa-onnx-node`: https://registry.npmjs.org/sherpa-onnx-node/latest
- npm `diarization-js`: https://registry.npmjs.org/diarization-js/latest
- npm `@jaehyun-ko/speaker-verification`: https://registry.npmjs.org/@jaehyun-ko/speaker-verification/latest
- Short test segments (1 s), July 2026: https://arxiv.org/abs/2609.25007
- I-MSV 2022: https://arxiv.org/abs/2302.13209
- Pizzi et al. 2023 (model inversion): https://arxiv.org/abs/2301.03206
- Picovoice speaker-aware assistant (vendor): https://picovoice.ai/cookbook/ai-voice-assistant-speaker-recognition/
- Picovoice personalised wake word (vendor): https://picovoice.ai/cookbook/personalized-wake-word/
- PyPI JSON for `sherpa-onnx`, `numpy`, `torch`, `torchaudio`, `speechbrain`, `onnxruntime` and `resemblyzer`: https://pypi.org/pypi/<package>/json, read 19 Nov 2026

**Repository** (B, read on branch `claude/jarvis-v10-49ea0b`), under `chennai-grievance-portal-main/src/`:
- `lib/thunai/addressed.ts`
- `lib/thunai/vad.ts`
- `lib/thunai/eou.ts`
- `lib/thunai/stt.ts`
- `components/collector/app/thunai/conductor.ts`
- `components/collector/app/thunai/ears.ts`
- `components/collector/app/thunai/kws.ts`
- `lib/thunai/holdout.live.ts`
- uncommitted, for §1.1: `git diff` of `lib/thunai/addressed.ts`, `components/collector/app/thunai/conductor.ts` and `components/collector/app/thunai/Thunai.tsx`; `lib/thunai/v10/browser10.ts` and `lib/thunai/v10/flag10.ts`

Also read: `manu_paddle_ocr/server.py`, `start-fast.bat`, `docs/jarvis/JARVIS_V10.md`, `docs/jarvis/SARVAM.md`, `docs/jarvis/v8-research/30-sarvam.md`.

---

## Appendix C. What the evening re-check changed

The facts behind each change were read at the sources cited in the section named. The policy changes in items 7 and 12 are my own design (M).

1. **Google** (§2.2): the 15 s figure is Gemini Live on Gemini for Home. Continued Conversation is about 10 s on both assistants, and on Google Assistant it requires Voice Match. Calls, alarms and media control turn it off.
2. **Amazon** (§2.1, §2.2, §2.3): added two posts.
   - The 2020 Follow-Up Mode detector uses the previous turn, lexical features and ASR confidence; EER went from 10.6% to 9.1%.
   - Conversation Mode (2021): false wakes from ambient noise −80%, from Alexa's own replies −42%.
3. **WearVox** (§2.1): its side-talk task has 582 side-talk items plus 500 valid queries, not 1,082 side-talk items.
4. **Personalized Hey Siri** (§2.3): dated 16 Apr 2018. The 200 users are for the EER; the end-to-end test used 150 users and 2,800 h of negative audio.
5. **The Tamil quotative** (§3.4) is now confirmed in a grammar paper. Added two exclusions: naming (என்ற) and "think that".
6. **End-of-turn models** (§3.6):
   - TamilEOT's model card read at source: BSD-2, 8.7 / 21 MB, 83 / 143 ms;
   - indic-smart-turn: under 50 ms on one core;
   - Vogent read at source: English only, gated, CPU may be too slow;
   - Smart Turn: input of up to 8 s.
7. **The cut-off policy** (§0, §3.6, §5, §6) now matches the uncommitted code: hold the line and join the next sentence within the follow-up window, not 2.5 s. A named or called line gets one question after 4 s of silence.
8. **Speaker-verification details** (§4.1, §4.3):
   - ERes2NetV2 cut only the test side to 2 or 3 s;
   - ERes2Net full-length EER 0.84%; ECAPA's 0.82% comes from Table 4;
   - WeSpeaker "LM" is aimed at clips over 3 s;
   - the TitaNet NGC card's wording corrected; TitaNet embeddings are 192-dim;
   - the 1 s figure is now read at source: 8.334% for the paper's own model; the baseline's 18.4% is arithmetic.
9. **Whisper** (§5.2): Whisper's own silence rule needs both conditions. The repo's drop on no-speech alone is stricter.
10. **Browser route** (§4.6): a sherpa-onnx WebAssembly build exporting the C speaker-embedding API avoids the filterbank parity risk.
11. **Packages and downloads** (§4.1, §4.7, §6):
    - exact wheel and model file names, sizes and sources;
    - `sherpa-onnx-node` 2.0.2 is from 19 Nov 2026, so pin 2.0.1;
    - every download needs the owner's OK.
12. **The working tree** (§1.1, §5.4, §6): new section on the uncommitted v10 gate code. It records one tested false positive: the Tanglish negative "vendaam" is read as hearsay. Recommendations 2–4 now list only what that code still lacks. Worked examples 23–25 were added as minimal pairs.
