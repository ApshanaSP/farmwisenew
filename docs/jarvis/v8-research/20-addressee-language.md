# Jarvis v8 research 20: who is being spoken to, and which language to answer in

18 Nov 2026. Docs only: no code changed, no paid API called, nothing personal searched.

**Legend**
- **(B)**: read in the cited source this session (a fetched page, or a repo file at the path given).
- **(M)**: my inference, design proposal or arithmetic; not stated by a source.
- **(S)**: seen only in a search-result summary; the source page itself was not opened. Treat as unverified.

Two problems: (1) addressee detection. In conversation mode after "Hey Jarvis", Jarvis should stay quiet when the Collector talks to someone in the room, and answer when the Collector talks to Jarvis without using the name. (2) Answer language. Reply in the language of the Collector's utterance on that turn, whatever the UI setting, the last turn or Whisper's label says.

---

## Summary

1. **No large assistant decides the addressee from words alone.** Amazon, Apple and Google combine several signal types: acoustic, ASR-decoder confidence, lexical and (Google, Alexa with camera) visual. On their own, words are the weakest of these. Amazon reports equal error rates (EER) of 20.1% for the ASR 1-best text, 9.3% for decoder features and 5.2% combined. Apple reports 12.7% text-only against 6.5% multimodal. Microsoft (Shriberg) reports 23.1% lexical, 12.6% prosodic and 11.1% combined. (B) [Mallidi](https://arxiv.org/abs/1808.02504), [Apple/THN](https://arxiv.org/html/2403.14438v2), [Shriberg](https://www.isca-archive.org/interspeech_2012/shriberg12_interspeech.html)
2. **Words work well on commands and badly on free-form speech.** Shriberg found lexical models handle commands well but confuse free-form directed speech with talk between people. Jarvis has a narrow console command set, so "does this map to something the console can do" is the strongest text cue we have. (B for the finding, M for applying it to Jarvis)
3. **Context helps, and an untuned LLM makes a poor gate.** In Apple's study of follow-ups without the wake word, adding the first query and an 8-best ASR list cut false accepts at 10% false rejects from 8.3% to 4.8%. A prompt-only 7B model, with no tuning, falsely accepted 46.7% at a 13.8% false-reject rate. On multi-party addressee recognition, GPT-4o scored only "marginally above chance". (B) [Apple follow-up](https://arxiv.org/html/2411.00023v2), [benchmark](https://arxiv.org/abs/2501.16643)
4. **Industry listening windows are short.** Google Continued Conversation listens about 10 s and Gemini for Home up to 15 s (B, [Google help](https://support.google.com/googlenest/answer/7685981?hl=en)). Alexa Follow-Up Mode listened about 5 s at launch (S). Jarvis listens 20 s (`ENGAGED_MS`) (B, `chennai-grievance-portal-main/src/lib/thunai/addressed.ts`). The longer the window, the more side talk falls inside it (M).
5. **Google ends the conversation once you turn to someone else.** Its help page says that if you start talking to someone else, the Assistant recognises the conversation is over (B, same help page). Jarvis should do the same: once a vocative to another person is detected, close the window (M).
6. **How the field measures it.** Papers report EER, false accepts at a fixed false-reject rate (Apple: FAR at 5% and 10% FRR), and false-trigger suppression at a fixed true-positive rate (B). For Jarvis, report false wakes per hour of side talk plus a missed-request rate, and pick the operating point that favours silence. Saying "Jarvis" puts a wrongly ignored request right; nothing undoes an action taken on side talk. That is already the gate's stated policy. (B repo, M)
7. **Whisper's language label cannot decide the reply language.** Zero-shot, Whisper identifies the language correctly 64.5% of the time on FLEURS (B, [Whisper paper](https://ar5iv.labs.arxiv.org/html/2212.04356)). Language ID is known to mislabel English spoken with the accent of the dominant language (B, [EACL 2026](https://aclanthology.org/2026.findings-eacl.242)). Forcing or misdetecting the language can produce a translation instead of a transcript (B, [OpenAI forum](https://community.openai.com/t/whisper-3-detects-incorrect-language-translates-instead-of-transcribes/828870)). In our own 17 Nov run, the forced-Tamil decode turned 10 of 22 English sentences into Tamil (B, `src/lib/thunai/stt.ts`).
8. **Off-the-shelf text language ID fails on short romanised text.** FastText labelled "aap kaise ho?" as Finnish at 68% and short English messages as German at 92–99% (B, [Fin](https://fin.ai/research/building-a-better-language-detection-model-for-fin/)). IndicLID reaches 80.4% on romanised text overall and an F1 of 95 for romanised Tamil, but says it is "most confused for short inputs (<10 words)" (B, [IndicLID](https://arxiv.org/html/2305.15814v3)). Use a word-list and grammar rule tuned to Jarvis's own vocabulary instead (M).
9. **Bilingual assistants answer in the language of the query.** Google answers in the language used after "Hey Google", and can't recognise more than one language in a single phrase (B, [Google help](https://support.google.com/googlenest/answer/7550584?hl=en)). Alexa's Hindi/English mode replies in Hindi to Hindi and English to English (B, [Business Today](https://www.businesstoday.in/technology/news/now-talk-to-alexa-seamlessly-in-hindi-english-and-hinglish/story/383810.html)). Neither publishes a rule for code-mixed speech.
10. **Two current code paths break the owner's rule.** (B repo)
    - `replyLang` (`src/lib/thunai/round.ts:142`) falls back to Whisper's label whenever the text has at most one English function word. So "show Adyar" and "Adyar status" are answered in Tamil when Whisper says `ta`.
    - The speech-to-text race gives the first good decode to the *last heard line's* language and adds a +0.1 lean to the *site* language (`stt.ts`). Those are exactly the last-turn and UI-setting biases the owner wants removed.
11. **Recommended language rule: grammar decides, names are neutral.** Script first. Then Tamil grammatical markers (case suffixes, question words, verbs, copulas), and above all a Tamil word at the end of the clause, against English function words. Place names, numbers and acronyms are neutral. An utterance with no language evidence takes the Collector's own last non-neutral utterance, else English. The full procedure and its tests are below. (M)

---

## Part 1. Addressee detection (device-directed speech)

### 1.1 Amazon

- **Mallidi et al. (2018)** classify each utterance as device-directed or background speech. The purpose is to reject false wakes and accept follow-ups without the wake word. Two LSTMs (one on acoustics, one on the ASR 1-best) and the ASR decoder's features feed a feed-forward network. EER: decoder features 9.3%, acoustic embedding 10.9%, 1-best text 20.1%, combined 5.2%. (B) https://arxiv.org/abs/1808.02504
  - Implication: text alone is the weakest single input, and the decoder's own confidence is the strongest. We have Whisper's `avg_logprob` and `no_speech_prob` for free. (M)
- **Gillespie et al. (ICASSP 2020)** combine "semantic lexical features" with a lightweight acoustic feature for follow-up-mode directedness. EER falls 14% relative to an acoustic-only model, and semi-supervised learning helps further. (B) https://arxiv.org/abs/2010.01949
- **Natural turn-taking / Conversation Mode (2020 announcement):**
  - Follow-Up Mode "uses acoustic cues" to tell directed from non-directed speech. Camera devices add body-position cues, and an on-device fusion model decides.
  - Amazon claims it works "even when multiple speakers are interacting with each other and with Alexa".
  - It also mentions separate work using syntactic and semantic features of utterances. No error rates are given.
  - (B) https://www.amazon.science/blog/change-to-alexa-wake-word-process-adds-natural-turn-taking
- **Alexa Follow-Up Mode (2018 launch coverage).** About a 5 s window after the response. Alexa does not respond if it isn't confident you are speaking to it. Off during music and calls. (S) https://techcrunch.com/2018/03/10/now-you-can-have-a-conversation-with-alexa-without-screaming-hey-alexa-for-every-request/

### 1.2 Apple

- **Siri's pipeline:**
  - Stages: an always-on keyword spotter, then a high-precision checker, then speaker ID, then false-trigger mitigation through "Siri directed speech detection". That last stage runs three systems: an ASR-lattice RNN, a streaming acoustic transformer, and a BERT-like text classifier. The text classifier also catches *non-vocative* uses of "Siri".
  - Apple avoids the one-best ASR hypothesis there because it can "hallucinate" the trigger phrase.
  - (B) https://machinelearning.apple.com/research/voice-trigger
  - Implication: Jarvis's Whisper prompt begins "Jarvis, Chennai District Collector console." (B, `stt.ts:57`). A prompted decoder can write "Jarvis" into side talk and so create a false "named" verdict. Measure this directly (see 3.4). (M)
- **Streaming transformer for false-trigger mitigation.** It suppresses 95% of false triggers using one extra second of audio after the trigger, and cuts false rejects 18% relative at a fixed false-alarm rate. (B) https://machinelearning.apple.com/research/streaming-transformer
- **Multimodal LLM for device-directed speech without a trigger (ICASSP 2024):**
  - Text-only input is the ASR 1-best fed to GPT-2.
  - Eval-set EER: text-only 12.70%, audio-only 10.98%, multimodal 7.95%, best (GPT-2 1.5B with LoRA) 6.53%.
  - Training used about 40k directed and 40k non-directed utterances. The eval set has about 14k directed and 23k non-directed.
  - (B) https://arxiv.org/html/2403.14438v2
- **Follow-up conversations with LLMs (2024):**
  - Setup: the first query has the wake word, the follow-up doesn't. The input is the first query's 1-best text plus the follow-up's 1-best or 8-best list with costs. The model is Vicuna-7B.
  - Results (FRR / FAR):
    - Prompt only: 13.8% / 46.7%.
    - Prompt + LoRA, 1-best: 12.6% / 16.4%.
    - Prompt + LoRA, 8-best: 18.6% / 2.3%.
    - Classifier head with context + n-best: EER 7.9%, FAR at 10% FRR 4.8%. Without context it was 8.3%.
  - Data: about 245k utterance pairs from people solving puzzles together, directed to undirected about 1:4.
  - The previous *assistant response* was not used; the authors list it as future work.
  - (B) https://arxiv.org/html/2411.00023v2
  - Implications: (a) context matters; (b) an untuned prompt is a poor gate; (c) the 10% FRR operating point is a reasonable industry anchor. (M)

### 1.3 Google

- **Look and Talk (Nest Hub Max, 2022):**
  - Visual stages: proximity (about 5 ft, from face size), Face Match, gaze, and active-speaker detection.
  - Then Voice Match, on-device ASR, and "intent understanding". That last step combines non-lexical audio cues (pitch, speed, hesitation sounds) with a *text model on the transcript* to filter out speech not meant for the Assistant.
  - Stricter attention is required before listening, to "minimize false triggers". No error rates are published.
  - (B) https://research.google/blog/look-and-talk-natural-conversations-with-google-assistant/
- **Continued Conversation:**
  - Listens about 10 s after a response, and the microphone turns off after 10 s of silence. Gemini for Home listens up to 15 s.
  - You can "start talking to someone else" and the Assistant recognises the conversation is over.
  - "Thank you", "Stop" or "I'm done" ends it. On Google Assistant it is US English only.
  - (B) https://support.google.com/googlenest/answer/7685981?hl=en

### 1.4 Academic

- **Shriberg, Stolcke, Hakkani-Tür, Heck (Interspeech 2012):**
  - Task: system-directed versus human-directed speech in multi-person dialogue with a system.
  - EER at 19% WER: lexical 23.1%, prosodic 12.6% (energy-contour GMMs were best), combined 11.1%.
  - Lexical models are good on commands but confuse free-form directed speech with human talk. Prosody fixes this, suggesting people change speaking style when they change addressee.
  - (B) https://www.isca-archive.org/interspeech_2012/shriberg12_interspeech.html
- **LLMs on multi-party addressee recognition:**
  - On triadic multimodal conversations, GPT-4o is "marginally above chance". (B) https://arxiv.org/abs/2501.16643
  - An EMNLP 2024 study found that structural cues help LLM addressee recognition. (S) https://arxiv.org/abs/2409.18602
  - Neither tests the narrower question "to the assistant or not?", which is easier (M).

### 1.5 What Jarvis already does (repo)

- **`addressed.ts` tiers** (B):
  - 1 named: "Jarvis" or ஜார்விஸ் is in the utterance.
  - 2 engaged: within 20 s of Jarvis's last turn, the utterance looks like a request, and it is not side talk or a chore.
  - 3 stop word.
  - 0 ignored: shown as a faint line for 2 s.
- **Side-talk cues** (B): regexes for pronouns, honorifics (sir, madam, anna except as a place, akka), past and future plans, errands and room objects, statements, Tamil and Tanglish side talk.
- **Unnamed command lines** (B): the "command tier", which acted on unnamed command-shaped lines, was cut in v5 because such lines are "most often said to someone else".
- **Gaps against the brief's examples** (M, from reading the code; not run):
  - "Ramesh, send the file to the Commissioner" is silent today, but by accident. A leading name breaks the request shape (`REQUEST_EN` and `IMPERATIVE_EN` are anchored at the start), and "file" is a weak side cue. No rule knows "Ramesh" is a vocative, or that "send ... to the Commissioner" is an action Jarvis cannot do.
  - A *trailing* vocative goes through. "show the Adyar report, Ramesh" opens with "show", so it counts as a request. No side cue fires and "report" is console work, so tier 2 acts inside the window.
  - "call him back after lunch" is caught by the strong cues `him` and `lunch`.
  - "what about Adyar?" and "show the severe cases" pass inside the window, as they should.

### 1.6 What can be done text-only (we have transcript and timing, no direction)

Text-only results in the literature are 12.7–23.1% EER in open domains (B, above). Jarvis's domain is narrow: a console with a finite set of capabilities. Lexical models are strong on commands (B, Shriberg), so a domain-fit feature should do better than those figures on our data (M). The hard residue is **domain-shaped side talk**, for example the Collector telling an officer "Adyar complaints are too many, check with the AE". Text alone cannot always separate that from a request (M). Four mitigations:

1. **Vocative and recipient detection.** A person's name or a role at the start or end of the utterance, set off by a comma ("Ramesh, ..."); Tanglish address particles at the end ("... da", "... pa", "... ma"); a human recipient ("to the Commissioner", "AE kitta"). (M)
2. **Capability fit.** An action verb that is not in the console's capability registry (send a file, call, inform, sign, bring) marks side talk. (M)
3. **Closing the window.** After a vocative to another person, close the engaged window, as Google does when you turn to someone else (B for Google's behaviour, M for the rule).
4. **A cheap recovery path.** The faint ignored line already exists. Add "Jarvis, that one" or "Jarvis, do that" within 10 s to act on the last ignored line. A false reject then costs one short phrase. (M)

Two more cheap signals:
- **Decoder confidence.** Mallidi's decoder features beat text and acoustics alone (B). Whisper's `avg_logprob` and `no_speech_prob` can serve as a weak "far, quiet or overlapped speech" cue (M).
- **Loudness, optional.** The browser already measures levels (`onLevel`). Speech level relative to the Collector's recent *directed* utterances is a cheap stand-in for energy cues (Shriberg's best prosodic feature, B). Log it and evaluate offline before gating on it (M).

---

## Part 2. Answer language

### 2.1 Whisper's language ID: failure modes

- **Overall accuracy.** Whisper predicts the language token right after the start-of-transcript token, from 99 language tokens. Zero-shot language-ID accuracy on FLEURS is 64.5%, against 77.7% for the best supervised system. Whisper has no training data for 20 of FLEURS's 102 languages. (B) https://ar5iv.labs.arxiv.org/html/2212.04356
- **Accented English in code-switched speech.** Language-ID models often fail to identify English spoken with the accent of the matrix (dominant) language. Fine-tuning on a little accented English fixes this; fine-tuning on code-switched speech hurts monolingual accuracy. Tested pairs include Hindi–English. (B) https://aclanthology.org/2026.findings-eacl.242. Which models were tested was not visible in the abstract. (B)
- **Accents and dialects in general.** Spoken dialogue systems "frequently fail" on under-represented accents and misidentify the input language. (B) https://arxiv.org/abs/2605.23235
- **Wrong detection gives a translation.** A developer reports that when Whisper detects the wrong language, it *translates* the whole transcription into that language. (B) https://community.openai.com/t/whisper-3-detects-incorrect-language-translates-instead-of-transcribes/828870
- **Jarvis's own data** (B, `src/lib/thunai/stt.ts:226-231`):
  - Jarvis runs two forced decodes, one Tamil and one English.
  - In the 17 Nov Phase 0 run, *10 of 22 English sentences* came back from the forced-Tamil decode as a Tamil translation.
  - On all 10, the English decode was the surer one, by 0.01 to 0.29 in log-probability.
  - On Tamil speech, the Tamil decode was always surer (by 0.08 to 1.07). On Tanglish it was as sure or surer.
  - Auto-detect on Tanglish was about 97% WER in an earlier test (B, `stt.ts:6-7`).
- **Consequences** (M):
  - Neither the label nor the script of the winning decode is reliable evidence of the spoken language.
  - The comparison of the two forced decodes' confidences *is* informative, but the margins are thin.
  - The reply-language rule must read the words, and the decode choice must not be biased by the last turn or by the UI setting.

### 2.2 Text language ID for romanised Tamil versus English

- **IndicLID (AI4Bharat, ACL 2023)** (B) https://arxiv.org/html/2305.15814v3
  - Covers native-script and romanised text for 22 languages, with English as a class.
  - Text that is more than 50% Roman goes to the romanised classifier.
  - Romanised test: accuracy 80.40 and macro F1 74.72 overall; romanised Tamil F1 95.01.
  - Architecture: a fastText character-n-gram model, with IndicBERT taking over when fastText's confidence is ≤ 0.6.
  - It is "most confused for short inputs (<10 words)", and nearly all Jarvis commands are that short.
- **Synthetic data for romanised LID (2025).** Synthetic training data with natural spelling variation raised romanised Indic F1 from 74.7% to 85.4%, and to 88.2% with harvested text. Romanisation makes normally easy pairs confusable (Hindi and Urdu). (B) https://arxiv.org/abs/2504.21540
- **fastText (as used by Fin).** It "struggles with short inputs or when the script doesn't match":
  - "im need help" was labelled German at 92%.
  - "aap kaise ho?" was labelled Finnish at 68%.
  - Fin replaced it with an XLM-R classifier (macro F1 89.8 against 80.2).
  - (B) https://fin.ai/research/building-a-better-language-detection-model-for-fin/
- **Lingua.**
  - Rule-based extras help short text; mixed-language detection is "experimental".
  - In low-accuracy mode, accuracy on texts under 120 characters "will drop significantly".
  - No romanised Tamil model is listed (Tamil is supported in its own script).
  - (B) https://pypi.org/project/lingua-language-detector/
- **CLD3.** Its only romanised Indic support is Latin Hindi, per IndicLID. (B, IndicLID paper)
- **Takeaway** (M):
  - No generic detector is built for 1–6-word Tanglish console commands.
  - Jarvis already has the right kind of tool: `detectLang` in `src/lib/thunai/normalise.ts:120` uses Tanglish words and endings against English function words (B).
  - It needs a better lexicon split (grammar versus content words), clause-final position, and neutral gazetteer tokens. A model is not needed.
  - IndicLID is useful *offline* to pre-label longer eval rows.

### 2.3 Measuring code-mixing (CMI)

- **The formula** (Das and Gambäck), as reproduced: CMI = 100 × [1 − max(wᵢ)/(n − u)] when n > u, else 0.
  - n is the number of tokens.
  - u is the number of language-independent tokens.
  - max(wᵢ) is the count of the dominant language's words.
  - The scale runs 0–100.
- **Its limits.** CMI ignores the number of switch points and the order of words: an alternating sentence and a two-block sentence both score 50.
- (B) https://ar5iv.labs.arxiv.org/html/1707.01183. A further paper argues these metrics have inherent limitations (B, abstract only) https://arxiv.org/abs/2106.10123
- **Use for Jarvis** (M): log CMI (u = neutral tokens: places, numbers, acronyms, "Jarvis") and use it to *stratify the evaluation*: CMI = 0, 1–30, over 30. Do not gate on it. On a 3-word utterance it jumps in steps of 33.

### 2.4 How bilingual assistants choose the reply language

- **Google, 2018.**
  - Language ID runs alongside two monolingual recognisers. A ranker uses the language-ID probabilities, transcription confidence and user preferences.
  - The first part of a query gives an early language guess, then one recogniser continues.
  - The reply is in kind: the Assistant replies in the language it identified.
  - Entity names in another language (songs, places) are handled through that first-part guess.
  - (B) https://research.google/blog/teaching-the-google-assistant-to-be-multilingual/
- **Google help today.** The Assistant answers in the language used after "Hey Google". It can't recognise more than one language in the same phrase. India pairs are English and Hindi (no Tamil listed). (B) https://support.google.com/googlenest/answer/7550584?hl=en
- **Alexa, English/Hindi (India, Oct 2019).** Asked about Diwali in Hindi, Alexa answers in Hindi; asked in English, it answers in English. It is described as understanding "completely in Hindi or Hinglish". (B) https://www.businesstoday.in/technology/news/now-talk-to-alexa-seamlessly-in-hindi-english-and-hinglish/story/383810.html
  - About 60% of requests on Hindi/English devices were reported as mixed. (S) The Amazon India blog page did not resolve, so this is unverified.
- **Takeaway** (M):
  - Both answer per query, from the query's own language. Neither ties the answer to the previous turn or the UI setting. The owner's rule matches industry practice.
  - For code-mixed queries neither documents a rule. The Matrix Language Frame idea, where the language supplying the grammatical morphemes is the base language, is a sensible stand-in (M; not read this session).
  - In Tamil, which is verb-final, the clause-final word is the cheapest proxy for that grammar.

---

## Recommendations for Jarvis v8

### R1. The addressee gate: features and scoring (text plus timing)

Keep tiers 1 (named), 3 (stop) and "talked about" as they are. Replace tier 2's yes/no rules with a **score**, run only for unnamed utterances inside the engaged window. All weights and thresholds below are starting values to tune on the dev set (M).

**Hard silences (checked first; any one means silent, even inside the window):**

| Id | Rule | Examples |
|---|---|---|
| V1 | **Vocative to another person.** First or last token group is a given name (Tamil and Indian given-name list, about 2k entries), an honorific (sir, madam, saar, anna not as a place, akka, thambi, ji) or a role (PA, AE, AEE, DRO, RDO, tahsildar, VAO, driver). It is set off by a comma or opens an imperative, and is not "Jarvis" or a gazetteer place. Tanglish address particles at the end ("... da", "... di", "... pa", "... ma" after a verb) also count. Effect: **also closes the engaged window**. | "Ramesh, send the file to the Commissioner"; "show the Adyar report, Ramesh" (passes today); "Sir, the MLA is waiting"; "seri, vaa pa" |
| V2 | **An action the console cannot do, aimed at a person.** The verb is not in the capability registry (send, forward, give, bring, call, phone, inform, sign, ask; Tanglish *anuppu*, *kudu*, *sollu* + *kitta*), and its object or recipient is a human (pronoun, role or name). | "call him back after lunch"; "AE kitta sollunga"; "send it to the Commissioner" |
| V3 | **Personal narrative.** First person or third person with past or future plans, no console noun (the existing `SIDE_TENSE`, `SIDE_STRONG`, `chore` and `statement` rules). | "I told him yesterday"; "avaru eppo varuvaru" |

**Score (act if total ≥ θ; start with θ = 3):**

| Sign | Feature | Weight |
|---|---|---|
| + | The rules or planner resolve the line to a console capability with its slots filled (`rulesSure` and a known tool) | +3 |
| + | Follow-up form: ellipsis or continuation ("what about X", "and X?", "only the severe ones", "same for Adyar", "the second one", "why?") | +2 |
| + | Overlap with Jarvis's last answer or the open Stage: the same zone, metric or story | +1 |
| + | Question or imperative mood (the existing `shaped`) | +1 |
| − | A human third person (he, she, they, *avar*, *avanga*, "the Commissioner") with no console noun | −2 |
| − | Second person with personal content ("are you coming", "did you eat") | −2 |
| − | Seconds since Jarvis finished: 0–8 s → 0; 8–15 s → −1; 15–20 s → −2; over 20 s → ambient (silent unless named) | 0 to −2 |
| − | Whisper unsure (`avg_logprob` < −0.6 or `no_speech_prob` > 0.5 on the chosen decode) | −1 |
| − | More than 14 words with no console parse | −1 |

Worked examples (M):

| Utterance | Score | Verdict |
|---|---|---|
| "show the severe cases" at 4 s | +3 +1 = 4 | act |
| "what about Adyar?" at 6 s, Adyar on screen | +2 +1 +1 = 4 | act |
| "Adyar la enna problem" at 12 s | +3 +1 −1 = 3 | act |
| "Ramesh, send the file to the Commissioner" | V1 | silent; window closed |
| "call him back after lunch" | V2 | silent |
| "Adyar complaints romba jaasthi, AE kitta sollunga" | V2 | silent, despite the console nouns |

**Other rules:**
- **Window.** Let the score decay, as in the table, and keep 20 s as the hard edge. Consider cutting the hard edge to 15 s if the evaluation shows side talk in the 15–20 s band (Google uses about 10 s, Gemini 15 s, Alexa launched at about 5 s). (B/S for the figures, M for the rule)
- **Recovery.** "Jarvis, that one" or "Jarvis, do that" within 10 s of an ignored line acts on that line. A test checks it acts on the ignored text, not on the faint caption's truncation. (M)
- **The LLM tie-breaker stays off by default.** If enabled, it runs only when the score is θ−1 or θ.
  - Input: Jarvis's last answer (one line), seconds since, the utterance, and the capability list.
  - Output: one token, `jarvis`, `person` or `unsure`; `unsure` means silent.
  - Keep it only if the dev set shows lower FAR at equal FRR. Untuned prompting was poor in Apple's study (FAR 46.7%). (B for the evidence, M for the rule)
- **Check the prompt for hallucinated names.** Whisper's prompt starts with "Jarvis". On the side-talk audio, count transcripts that contain "Jarvis" when no one said it. If the rate is above 0, require "Jarvis" as a separate word with a confident word-level timestamp, or drop it from the head of the prompt for ambient decodes. (M; Apple's hallucination warning is B)

### R2. Addressee evaluation: what to measure and how

- **Metrics:**
  - **False wakes per hour of side talk**: Jarvis speaks or acts on speech not meant for it, per hour of recorded side talk inside open windows.
  - **FAR**: false accepts divided by side-talk utterances.
  - **Missed requests (FRR)**: unnamed requests to Jarvis inside the window that were ignored, divided by all such requests.
  - **False "named"**: side-talk transcripts in which Jarvis's name was hallucinated.
  - Also report EER and the curve over θ = 1…5, so the operating point is a visible choice. (M; the metric family is industry practice, B)
- **Targets (proposed, M):**
  - FAR ≤ 2% on side-talk rows and ≤ 1 false wake per hour of side talk.
  - FRR ≤ 10% on unnamed in-window requests, the same anchor as Apple's operating point.
  - 0 misses on named requests.
  - Rule of three: 0 false accepts in n rows bounds FAR below 3/n at 95% confidence. Showing ≤ 2% needs at least 150 side-talk rows with 0 errors.
- **Dev set (tune θ and weights) and a hashed holdout (run once)**, about 300 rows each, in English, Tamil and Tanglish:

  | Group | Rows | Expected |
  |---|---|---|
  | Unnamed requests in the window: commands, ellipsis ("and severe?", "what about Adyar?"), references ("the second one") | 120 (40 English, 40 Tamil, 40 Tanglish) | act |
  | Vocative side talk ("Ramesh, ...", "Sir, ...", "... pa") | 30 | silent |
  | Out-of-console actions aimed at people ("call him back after lunch", "AE kitta sollunga") | 30 | silent |
  | Domain-shaped side talk: console nouns said to a person ("Adyar complaints are too many, tell the AE") | 30 | silent (the hardest group; report it separately) |
  | Tamil and Tanglish personal side talk | 30 | silent |
  | One side of a phone call; reading a paper aloud; TV or radio news | 30 | silent |
  | Unnamed requests after 20 s | 30 | silent |

  - Each row carries: text, seconds since Jarvis's last turn, Jarvis's last answer (one line), the Collector's previous utterance, expected verdict, group, language and CMI.
  - Build **minimal pairs**: the same words with and without a vocative, or at 4 s and at 18 s.
- **Side-talk recording** (end-to-end, through the microphone, voice activity detection and Whisper):
  - Record 30–60 minutes of a scripted two-person office conversation in Tamil and English.
  - Re-open conversation mode with "Hey Jarvis" every 2–3 minutes, so that side talk falls inside windows.
  - Interleave 20 unnamed requests.
  - Count false wakes per hour and missed requests.
  - An hour or more is needed before a target of 1 per hour means anything (Poisson counts). (M)

### R3. The reply-language rule, text-only (replaces the label fallback in `replyLang`)

Token classes (lists live beside `normalise.ts`):
- **N, neutral.** Gazetteer names (zones, wards, places, departments, people), numbers, acronyms (AQI, PWD, GCC, PA), "Jarvis", and backchannels (ok, seri, haan, mm) standing alone or at the start.
- **T_g, Tamil grammar.**
  - Case suffixes: -la/-le/-ku/-kku/-oda/-ode/-nu/-ai, glued or hyphenated, or a separate token after a noun.
  - Question words: enna, enga, epdi/eppadi, evlo/evvalavu, yaaru, eppo, edhu.
  - Verbs and verb endings: kaattu(nga), sollu(nga), paaru, pannu(nga), podu, kudu, -nga/-unga/-udhu/-uchu/-aachu.
  - Copulas and negation: irukku, illa, venum, vendaam.
- **T_c, Tamil content.** mazhai, kuppai, thanni, vellam, saalai, naalaikku, innaiku, romba, konjam, nilavaram, pugar.
- **E_g, English grammar.** Articles, prepositions, auxiliaries, pronouns, wh-words, and English verbs in command position (show, open, give, tell, compare).
- **E_c, English content.** Other English dictionary words not in the gazetteer (status, complaints, cases, severe, problem, forecast).

**Procedure:**

1. **Script.** If Tamil letters make up at least half of the non-neutral letters:
   - (a) If the other forced decode is Latin, at least as confident, and reads English by step 2 with E_g ≥ 1, the answer is **English**. This catches a forced-Tamil translation of English speech; on 17 Nov the English decode was surer on all 10 such cases (B repo).
   - (b) Else, back-transliterate the Tamil-script tokens with the existing `xlit` and `phonetic` helpers. If at least 60% of the non-neutral ones are English words (ஷோ, கேசஸ், ஸ்டேட்டஸ்) and none is a T_g, the answer is **English**.
   - (c) Else, **Tamil**.
2. **Latin text:**
   - R-a: the last non-neutral token is T_g (Tamil is verb-final) → **Tamil**.
   - R-b: else, if T_g + T_c > E_g → **Tamil**.
   - R-c: else, if E_g + E_c ≥ 1 → **English**.
   - R-d: else → **neutral**.
3. **Neutral.** Use the language of the Collector's most recent *non-neutral* utterance in this conversation (within the engaged window); if there is none, English. Never use Whisper's label, Jarvis's own last reply language, or the UI setting. Keep neutral replies light on language: name, number, screen. (M; **owner decision**, since the brief's "regardless of the last turn" is about utterances that carry language)
4. **Fix the speech-to-text race** (B repo for the current code, M for the change):
   - On engaged turns, do not let "first good decode wins" favour `lastLang`.
   - When the first good decode is Tamil-script and the clip is under 3 s, give the English decode its 250 ms to finish so step 1(a) can run.
   - Drop the +0.1 site lean from anything that decides the reply language.

**Edge-case tests (expected output; text-only unit tests):**

| Utterance | Expected | Why |
|---|---|---|
| Adyar la enna problem | ta | R-a: "enna"/"la" are Tamil grammar; "problem" is English content; Adyar is neutral |
| show Adyar | en | R-c (today's code answers Tamil when Whisper says `ta`) |
| Adyar status | en | R-c |
| Adyar status enna | ta | R-a |
| Adyar | neutral → fallback | R-d |
| Thiru Vi Ka Nagar / Anna Nagar complaints | neutral / en | names are neutral; "Anna" here is a place |
| what about Adyar? | en | R-c |
| Adyar-ku enna aachu | ta | R-a |
| severe cases kaattunga | ta | R-a |
| show pannunga | ta | R-a |
| what is the status, sollunga | ta | R-a: the clause-final verb is Tamil |
| show me the list, seri | en | "seri" is a backchannel and neutral |
| seri (alone) | neutral | backchannel handling |
| zone 13 la | ta | R-a |
| naalaikku rain forecast | ta | R-b (T_c 1 > E_g 0) |
| Ambattur kuppai | ta | R-b |
| அடையாறு நிலவரம் என்ன | ta | step 1(c) |
| ஷோ தி சிவியர் கேசஸ் | en | step 1(b): English in Tamil script |
| கடுமையான வழக்குகளைக் காட்டு, with a surer English decode "show the severe cases" | en | step 1(a) |
| show அடையாறு | en | the Tamil-script token is a place, so neutral |
| PA kitta kudunga | ta (and V2: silent) | R-a; the language is decided even when the line is ignored |

Collisions to cover in tests (M):
- "la" in English song or filler words.
- "a" as an English article versus the Tamil -a suffix (count -a only when hyphenated or glued).
- "po" (post office) and "PA" (assistant, an acronym, so neutral).
- "anna" (place, honorific or brother).

### R4. Language evaluation

- **Set:** 200 utterances, at least 100 of them as **audio** (the failure lives in the decode, not only the text):
  - 60 English from Tamil-accented speakers, including 1–3-word commands ("show Adyar", "severe cases", "next").
  - 50 Tamil-script speech.
  - 60 Tanglish (CMI > 0).
  - 30 neutral (places, numbers).
- **Metrics:**
  - Wrong-language replies per 100 turns, by group and by CMI band.
  - A confusion matrix of ta / en / neutral.
- **Gates (M):**
  - **0 of 60** English utterances answered in Tamil: "English that must stay English" in the brief.
  - At most 2 of 60 Tanglish utterances answered in English.
  - Neutral rows follow the fallback 100% of the time.
- **Log per turn**, so failures can be audited from the printed summaries alone without reading holdout rows:
  - Whisper's label.
  - Which decode won, and both log-probabilities.
  - The T_g, T_c, E_g and E_c counts.
  - CMI.
  - The decision path: 1a, 1b, 1c, R-a, R-b, R-c or R-d.
- **Keep the baseline.** Re-run the 17 Nov "10 of 22" English set through the fixed race. The target is 0 of 22 answered in Tamil.

### R5. What not to do

- **Don't use** fastText lid.176, CLD3 or Lingua to decide the reply language. They are short-text and romanised-text failures, by their own or third-party evidence (B, 2.2).
- **Don't use** Whisper's `language` field anywhere in the reply-language decision (B, 2.1).
- **Don't make** an untuned LLM call the sole addressee gate (B, 1.2 and 1.4).
- **Don't widen** the window beyond 20 s, and don't bring back the unnamed command tier, without the R2 numbers (M).
