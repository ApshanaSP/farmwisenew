# 10. Grounded summarisation and how to check it (Jarvis v7 research)

Written 17 Nov 2026 for the v7 build. The design under study: code gathers a fact sheet from the dashboard, an LLM writes a 2-4 sentence spoken answer, and code checks every figure, name and date before anything is spoken.

Marks: **(B)** = read in the source at the URL during this pass. **(M)** = my own inference or background knowledge, not read this pass. No figure appears here unless it was read in a source. Every page was read through a fetch tool that summarises the page, so re-read the page before a figure goes into a release document.

## Summary

- No prompt or model makes grounding reliable. On ELI5, even the best ALCE systems "lack complete citation support 50% of the time" (B). The top FACTS Grounding score at launch was 83.6 % (B). The Anthropic, Azure and Google docs all treat grounding as something to verify after generation (B). So the code check is the safety layer, and the prompt only lowers how often it fires (M).
- A bigger model is not a more faithful one on Vectara's summarisation leaderboard. qwen3-8b scores 4.8 % hallucination against 9.3 % for qwen3-235b-a22b, and gemini-2.5-flash-lite scores 3.3 % against 7.8 % for gemini-2.5-flash (B). Choose the model on our own fact sheets by measuring the checker's failure rate (M).
- The NLI-style checkers (MiniCheck, AlignScore, SummaC, QAFactEval, RAGAS faithfulness, FActScore) all need a model call or a hosted model. Azure's detector is English-only and retires on 30 Apr 2027 (B). Neither is a fit for a fast, bilingual, pure-TypeScript gate (M). The checks that can run in TypeScript are typed matching of numbers, dates and entities, plus word lists for direction, negation and cause words (M).
- The biggest cheap gain is a **binding check**. Each sentence carries `[F3]`-style fact ids, and every number, name and date in that sentence must sit in the facts it cites, with each name and its number in the same fact (M). Matching against the whole sheet misses "Adyar has 38" when 38 belongs to Teynampet (M).
- Number checks cannot catch a wrong direction ("fell" when the count rose), a wrong cause ("because of the rain"), a false negation ("no overdue cases") or a derived figure ("twice as many", "40 %"). Code should precompute derived values and trend directions into the sheet, ban cause words unless a fact carries a cause, and check direction and zero claims against typed fields (M).
- The cheapest repairs are dropping the failing sentence or speaking a templated line, which add no latency. Re-asking costs a full extra model round trip. Anthropic's docs recommend removing any claim without a supporting quote (B). CoVe-style verification lowers hallucination but adds passes (B, with the cost as M).

## 1. Techniques that make answers faithful to supplied facts

### 1.1 Prompting patterns, as the vendors describe them
- Anthropic's "Reduce hallucinations" page (https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations) recommends these steps (B):
  - Give the model explicit permission to say it doesn't know. The page says this "can drastically reduce false information".
  - For long documents (over 20k tokens), extract word-for-word quotes first and answer only from them.
  - Cite quotes for each claim. After drafting, find a supporting quote for each claim. If none exists, remove the claim and mark the gap with `[]`.
  - Advanced options: chain-of-thought review, best-of-N comparison, iterative refinement, and telling the model to use only the provided documents.
  - The page warns that these techniques "don't eliminate them entirely" and says to validate critical information.
- For Jarvis: our sheets are short (well under 20k tokens), so quote-first is not needed (M). The patterns that carry over are the "not in the dashboard" exit line, the "only these facts" instruction and per-claim citation (M).
- Vectara's leaderboard prompt says to use only facts in the passage, not to infer or use internal knowledge, and to reply with a fixed "unable to summarize" message when the model cannot answer. The runs used temperature 0 (B). Source: https://github.com/vectara/hallucination-leaderboard.
- Proposed v7 settings: temperature 0, or the lowest the provider allows. Reasoning off or low on gpt-oss and qwen3, because reasoning tokens delay the first sentence. Limit the answer to 2-4 short sentences with one fact cluster per sentence, and figures in digits (M).

### 1.2 Fact-sheet design
- FACTS Grounding gives the model a source document, a system instruction that limits it to that document, and a request. A response must be "fully supported by the document" to count as accurate (B). Source: https://deepmind.google/discover/blog/facts-grounding-a-new-benchmark-for-evaluating-the-factuality-of-large-language-models/
- Vertex check-grounding accepts up to 200 facts, each up to 10k characters, with optional attributes. The docs recommend splitting large facts into smaller ones (B). Source: https://docs.cloud.google.com/generative-ai-app-builder/docs/check-grounding
- For Jarvis: make each fact one short line with an id, typed fields and an `as_of` time in IST (M). Example: `F3 zone=Teynampet|தேனாம்பேட்டை open=38 overdue=5 trend=up(+6 since 2026-11-16) as_of=2026-11-17T10:40+05:30`.
- Code should write every derived value into the sheet: differences, percentages, ratios, rank ("highest of 15 zones"), relative dates ("due in 2 days") and the rounded spoken form ("about 1.2 lakh"). The model then never computes, and the checker only needs set membership (M).
- Atomic facts help the binding check, and compact facts help the 8K tokens/min Groq budget (M).

### 1.3 Citation ids per sentence, versus JSON
- ALCE's finding is that even the best systems lack complete citation support 50 % of the time on ELI5 (B). Source: https://arxiv.org/abs/2305.14627
- So the model's own citation ids show what it means to cite, not that the claim is true. Code must check that the cited fact actually contains each value (M).
- Vertex returns a claims list (sentences) with byte offsets and supporting fact indices. A claim that is only partly supported gets no citation (`[]`) (B).
  - Vertex treats a claim as grounded only when it is "wholly entailed"; one wrong date fails it (B).
  - Its offsets are UTF-8 byte positions (B). Tamil text is multi-byte and JavaScript strings are UTF-16, so v7 must not mix the two kinds of offset (M).
- Inline trailing markers (`Teynampet has 38 open complaints [F3].`) stream token by token and mark the end of each sentence (M).
  - JSON (`{"s":[{"text":..,"facts":[..]}]}`) is easier to parse but needs a partial-JSON parser to stream, and small models break JSON more often under streaming (M).
  - Recommendation: inline markers. Strip them before TTS, accept a marker split across stream chunks, reject unknown ids (for example `F99`), and remove markers before extracting numbers so that `F3` is not read as 3 (M).

### 1.4 Small versus large models (Vectara leaderboard, last updated 22 Oct 2026, judged by HHEM-2.3)
- The leaderboard measures how often a model hallucinates when summarising 7,700+ non-public articles. The rate is 100 minus HHEM's factual-consistency rate, and answer quality is not scored (B). Source: https://github.com/vectara/hallucination-leaderboard

| Model (as listed) | Hallucination rate | Answer rate |
|---|---|---|
| claude-haiku-4-5-20251001 | 9.8 % | 99.5 % |
| openai/gpt-oss-120b | 14.2 % | 99.9 % |
| qwen/qwen3-8b | 4.8 % | 99.9 % |
| qwen/qwen3-14b | 5.4 % | 99.9 % |
| qwen/qwen3-32b | 5.9 % | 99.9 % |
| qwen/qwen3-235b-a22b | 9.3 % | 94.9 % |
| google/gemini-2.5-flash-lite | 3.3 % | 99.5 % |
| google/gemini-3.1-flash-lite-preview | 8.2 % | 99.6 % |
| google/gemini-3-flash-preview | 13.5 % | 99.8 % |

- The table covers selected rows (B). The best listed model has 1.8 % and the worst 24.2 % (B). gpt-oss-20b is not listed, and I did not see Groq's exact qwen id or Haiku 5.5 (B).
- Caveats (M):
  - The task is English news summarisation, not Tamil and not structured fact sheets.
  - HHEM is a model-based judge.
  - The newer flash-lite does worse than the older one, so the figures do not carry across model versions.
  - Use the table to choose which models to test first, not to make the final choice.
- FACTS Grounding uses 1,719 examples (860 public, 859 private) with documents up to 32k tokens and three judges (Gemini 1.5 Pro, GPT-4o, Claude 3.5 Sonnet) (B).
  - It judges in two phases: an eligibility phase that disqualifies responses that do not address the request, then a grounding phase (B).
  - At launch the top score was gemini-2.0-flash-exp at 83.6 % (B), so about 1 response in 6 still failed (M, arithmetic).
  - v7 needs both phases as well: a sheet-grounded answer that does not answer the Collector's question is also a defect (M).

## 2. Automated checks

### 2.1 What production systems do
- **Google Vertex check grounding** (B):
  - Takes an answer candidate (up to 4096 tokens) and facts.
  - Returns a support score that "loosely approximates the fraction of claims" that are grounded, per-claim citations and an optional per-claim score.
  - The citation threshold defaults to 0.6.
  - Sentences that need no check (for example "Here is what I found.") are flagged `grounding_check_required=false`.
  - Latency is "less than 500ms".
  - The page I read did not state supported languages.
  - Source: https://docs.cloud.google.com/generative-ai-app-builder/docs/check-grounding
- **Azure AI Content Safety groundedness detection** (B):
  - Offers a fast non-reasoning mode (a binary answer for real-time use) and a reasoning mode (explanations for debugging).
  - Has Summarization and QnA task types and Medical and Generic domains.
  - A preview correction feature rewrites ungrounded spans to the source value. Its examples are "5%" changed to "4.5%" and "1065" changed to "1066".
  - Supports English only and retires on 30 Apr 2027.
  - Source: https://learn.microsoft.com/en-us/azure/ai-services/content-safety/concepts/groundedness
- **Anthropic:** per-claim quote verification and retraction, done by the model itself (B, §1.1).
- For Jarvis: both hosted checkers would send Collector data to another cloud API, and neither covers Tamil (Vertex unknown, Azure English-only). Copy their design rather than call them (M):
  - claims split at sentences,
  - a sentence passes only when every claim in it is wholly supported,
  - an allow-list of filler sentences,
  - a correction step limited to replacing one value.

### 2.2 Research checkers and what each needs
- **MiniCheck** (Tang, Laban, Durrett, EMNLP 2024) (B):
  - Small fact-checking models trained on synthetic errors, reaching "GPT-4-level performance but for 400x lower cost".
  - The best model, MiniCheck-FT5, has 770M parameters.
  - The benchmark is LLM-AggreFact.
  - Source: https://arxiv.org/abs/2404.10774
  - A 770M model is still a model to host, it was trained on English, and it adds latency on every sentence (M).
- I did not read these this pass, so the descriptions are (M) and give no figures:
  - SummaC: NLI scores at sentence level, https://arxiv.org/abs/2111.09525
  - AlignScore: a unified alignment model, https://arxiv.org/abs/2305.16739
  - QAFactEval: generates questions and answers them against the source, https://arxiv.org/abs/2112.08542
  - FActScore: splits text into atomic facts, then retrieves and verifies each, https://arxiv.org/abs/2305.14251
  - RAGAS faithfulness: an LLM extracts claims and an LLM judges whether each is supported, https://arxiv.org/abs/2309.15217
  - All of them need an NLI or LLM call. None is feasible as a no-extra-call TypeScript gate. They could serve as offline auditors on a test set (M).
- **Entity-level checks:** Nan et al. (EACL 2021) report "entity hallucination" (summarisers naming entities absent from the source) and propose entity-level consistency metrics (B). Source: https://arxiv.org/abs/2102.09130. The abstract gives no formulas. Entity precision against the source is plain string matching, so it can run in TypeScript (M).
- **Quantity checks:** HERMAN (Zhao, Cohen, Webber, Findings of EMNLP 2020) finds quantities (dates, numbers, sums of money) in candidate summaries, checks whether each appears in the source "in a similar context", and ranks supported candidates higher (B).
  - Ranked-up summaries had higher ROUGE precision with no comparable loss of recall, and people preferred them in a preliminary human evaluation (B).
  - Source: https://arxiv.org/abs/2009.13312
  - "In a similar context" is the same idea as our binding check (M).

### 2.3 What TypeScript can check with no model call (all M)
| Check | How | Catches | Misses |
|---|---|---|---|
| Number membership | extract digits (`1,23,456`, `1.5`, `38%`, `2.5 lakh`, English number words), normalise, and match the typed values of the cited facts | invented or garbled figures | wrong direction, wrong cause |
| Unit binding | `%` must match a percent field, "days" a duration field, "₹" a money field | count versus percent mix-ups | — |
| Binding | each name and its number must be in the same cited fact | mis-attributed figures | claims across sentences |
| Date normalisation | DD/MM (Indian order), English and Tamil month names, weekdays, today/yesterday/tomorrow (இன்று/நேற்று/நாளை), "in N days", resolved against `as_of` in IST | wrong deadlines | vague times ("recently") |
| Entity lexicon | every known zone, department and officer from the whole dashboard, in English and Tamil forms. A known name not in the cited facts fails | wrong or extra known names | unknown names in Tamil script |
| Unknown-name shape (English) | capitalised spans not at sentence start and not on a common-word list; also a title (Thiru, Dr., Mr., IAS) followed by an unknown word | invented officer names | — |
| Word lists | cause words, direction words, negation and zero words, vague quantifiers (§4) | the claims numbers miss | paraphrases outside the list |

- Tamil names (M):
  - Normalise to NFC and remove ZWJ/ZWNJ.
  - Remove honorifics (திரு, Thiru, Dr).
  - Tamil adds case suffixes and sandhi changes the end of the stem (அடையாறு → அடையாற்றில்), so exact token match falsely rejects correct names. Match the name's stem as a prefix of the token, followed by a suffix from a known list (இல், க்கு, ஐ, இன், ஆல், உடன், இடம் …).
  - Put the exact Tamil spelling in the sheet so the model copies it instead of transliterating.
  - Fuzzy matching (edit distance on a romanised form) is safe only when exactly one lexicon entry matches.
  - Tamil script has no capital letters, so an invented name in Tamil cannot be spotted by its shape. This gap stays open; the lexicon and title rule only narrow it.

## 3. Repair when a check fails
- **Drop the sentence:** Anthropic's documented pattern is to remove a claim that has no supporting quote and mark the gap (B). In speech, drop the sentence and stop the answer there, because later sentences may build on it (M). Adds no latency (M).
- **Correct one value:** Azure's preview correction rewrites an ungrounded value to the source value (B). For Jarvis, replace a number only when its sentence cites exactly one fact holding one value of that unit. Otherwise a correction can create a new, fluent error (M).
- **Re-ask once, naming the failing text** ("'45' is not in F3; F3 says open=38"): this is the verify-then-revise idea behind CoVe, whose four steps lower hallucination on list questions, closed-book MultiSpanQA and long-form text (B). Source: https://arxiv.org/abs/2309.11495. The abstract gives no figures or cost (B). The cost is a second full round trip plus a second prompt against the 8K tokens/min budget; I measured no latency (M).
- **Best-of-N and ranking** (HERMAN ranks a beam; Anthropic's best-of-N) (B): this costs N times the tokens, which the Groq free tier cannot afford on every turn (M).
- **Templated fallback:** a fixed line filled from the same fact sheet is always grounded and adds no latency, but sounds less natural (M).
- **Sentence-gated streaming:** buffer tokens until a sentence ends, check it, then hand it to TTS. First audio comes after the model's first sentence plus a check that takes well under a millisecond in TypeScript (M; measure). If sentence 1 fails, nothing has been spoken yet, so a re-ask is possible within a time budget; otherwise speak the template (M).
- **Sentence splitter traps:** "Dr.", "No.", "1.5", "₹2.5 lakh." and Tamil sentences ending in "." all need care (M).

## 4. Pitfalls that pass a number check (M unless marked)
- **Rounding:** "about 40" when the fact is 38. The safe rule is exact digits only, unless the sheet carries a rounded form ("about 1.2 lakh") that code produced. Do not let the checker accept any number within ±N %: "about 40" for 34 would pass a loose tolerance.
- **Percentages and ratios:** "40 %", "twice as many" and "a third" are figures the model computes. Precompute the ones you want spoken, and reject `%`, "twice", "half" and "double" unless the sheet holds that derived value.
- **Direction words:** "rose", "fell", "more", "fewer" (அதிகரித்தது, குறைந்தது) must match a `trend` field. With "fell" when the count rose, every number still matches.
- **Comparatives and superlatives:** "highest", "worst", "most delayed" need a precomputed `rank` field.
- **Negation and zero claims:** "no overdue cases", "none", "all resolved" (இல்லை, எதுவும் இல்லை) must agree with a count of 0 or a share of 100 %. "Not yet resolved" when the status is resolved passes a number check.
- **Cause words:** "because", "due to", "caused by", "owing to", "after the rain" (ஏனெனில், காரணமாக, ஆல்) are unsupported even when every figure matches. Reject them unless the cited fact has a `cause` field, such as a news item that states the cause.
- **Relative times:** "since yesterday", "last week", "overdue by 3 days". Resolve against `as_of` in IST (not UTC), and give relative forms in the sheet so the model copies them.
- **Vague quantifiers:** "most", "many", "several", "a few", "majority". Ban them, or tie each to a threshold computed from a share field.
- **Number words and scripts:** English number words, Indian grouping (1,23,456), lakh/crore (லட்சம்/கோடி) and spelled-out Tamil numbers. Tell the model to write digits. Treat spelled-out Tamil numbers as unverifiable and fail them. Check that the TTS voice reads digits correctly in Tamil.
- **Omission and eligibility:** a fully grounded answer can still leave out the one fact the Collector asked about. Check that the answer cites the fact for the entity in the question (the FACTS eligibility phase, B).

## Recommendations for Jarvis v7 (ranked)

1. **Code-built fact sheet with typed fields, ids and precomputed derived values.**
   - Contents: differences, percentages, rank, trend direction, relative dates, rounded spoken forms, and English plus Tamil names.
   - Benefit: most claims become checkable by set membership, and the model never computes.
   - Cost: code only. The sheet adds tokens against the 8K tokens/min budget, so keep each fact to one short line.
   - Risk: a derived value the sheet does not carry becomes a false reject, which means more fallbacks.
2. **Per-sentence `[F#]` markers plus a binding check** (names, numbers and dates must sit in the cited facts, name and number in the same fact).
   - Reject unknown ids, strip markers before extraction and before TTS, and check against the whole sheet only to classify an error, never to pass a sentence.
   - Benefit: catches mis-attributed figures, the error that whole-sheet matching misses.
   - Cost: a few tokens per sentence; no added latency.
   - Risk: small models drop or misplace markers (ALCE's 50 % citation gap), so measure the marker-missing rate per model.
3. **Sentence-gated streaming with a fixed repair ladder.**
   - Sentence 1 fails: re-ask once with the failing text named, only if time allows; otherwise speak the template.
   - A later sentence fails: drop it and end the answer.
   - Only replace a value when exactly one value fits.
   - Benefit: nothing unchecked is ever spoken; first audio arrives after one sentence.
   - Cost: first audio waits for a whole sentence, and a re-ask is a full extra round trip (not measured).
   - Risk: splitter errors ("Dr.", "1.5") and Tamil sentence ends.
4. **Word-list checks for claims that pass a number check.**
   - Cause words banned unless a fact has a `cause` field. Direction, comparative and superlative words checked against `trend` and `rank`. Negation and zero words checked against counts. Vague quantifiers banned. Bilingual lists.
   - Benefit: closes the "fell because of rain" class.
   - Cost: none at runtime.
   - Risk: false rejects of valid wording, and the lists need upkeep.
5. **A bilingual normaliser in TypeScript.**
   - Covers digits, Indian grouping, lakh/crore, units, English number words, DD/MM dates, Tamil months and relative day words in IST, Tamil NFC and zero-width cleanup, stem plus case-suffix matching, and honorifics.
   - Exact match by default; tolerance only through precomputed rounded forms.
   - Benefit: fewer false rejects in Tamil.
   - Cost: code and tests.
   - Risk: Tamil sandhi edge cases, and invented Tamil-script names stay hard to detect.
6. **Prompt and decoding settings.**
   - "Only these facts", the exact "not in the dashboard" line (allow-listed like Vertex's no-check sentences), temperature 0, reasoning low or off, 2-4 sentences, digits only.
   - Benefit: the vendor-documented reductions (Anthropic, Vectara's protocol).
   - Cost: about 100 prompt tokens.
   - Risk: low.
7. **Choose the model by measuring on our own sheets, and keep NLI checkers off the live path.**
   - Per model, log the check-failure, marker-missing and fallback rates on the live sets. Vectara shows size does not predict faithfulness (qwen3-8b 4.8 % against qwen3-235b 9.3 %).
   - Use MiniCheck or an LLM judge (FACTS-style, with judges from other model families) only offline to audit the checker's misses.
   - Benefit: evidence instead of leaderboard proxies.
   - Cost: offline tokens only.
   - Risk: an offline judge's own errors; spot-check by hand.
