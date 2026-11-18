# Jarvis v8 research 10: understanding short spoken requests, references and follow-ups

18 Nov 2026. Scope: how the best assistants and the research literature handle five things Jarvis fails at today:
1. Intent from short, loose spoken requests.
2. References: "that one", "the second story", "the Adyar one", "the Supreme Court news".
3. Ellipsis and follow-ups: "and in Adyar?", "since when?", "why?".
4. Finding an item among a small set (on screen plus a store) when ASR misspells names.
5. When to ask a clarifying question and when to pick the best candidate.

Plus how to evaluate understanding. The motivating failure: the owner said "Open the Supreme Court news on Palikan" (probably Pallikaranai), and Jarvis only accepted "open the 2nd" or "read the full news".

Web budget used: 16 searches and 22 fetches. Three fetches were unreadable (two PDFs, one 404). No model API call. One local script computed string similarities (scratchpad, not in the repo).

Legend: **(B)** = read in the cited source in this pass. **(M)** = my inference or my own arithmetic. **(B-snippet)** = read only as the abstract quoted in a search result, not on the source page. Sources found but not opened are listed at the end and support no claim.

## Summary

- **Apple turns reference resolution into a numbered-list choice, and small models do it well.** ReALM writes every candidate entity (on screen, from the conversation, in the background) as a numbered text list, with "0" meaning none, and asks the model for the numbers. Its 80M model beat Apple's earlier MARRS system and matched GPT-4 (B). The planner can use the same format (M).
- **Production systems put fast, precise rules before models.** In MARRS, a rule step catches ordinals and screen-name matches first because it is "high precision and extremely fast". A model scores the remaining candidates on category, location and text, against a threshold (B). That is Jarvis's lane design, with one gap: Jarvis has no entity resolver between the transcript and the lanes (M).
- **Rewrite the follow-up into a standalone request, then let the existing understanding run unchanged.** Alexa's contextual query rewrite (CQR) work treats reference resolution as rewriting. It works "without explicit need to track the state", and slot F1 rose from 0.89 to 0.91 on the rewritten queries (B). MARRS's rewriter skips the decoder when its classifier says "none", and it passes the rewrite on alongside the original (B).
- **Carry slots forward selectively, never wholesale.** Carrying every slot from the previous turn gave precision of 17.0 %. A rule baseline gave 91.8 % precision at 67.1 % recall; the neural model reached F1 84.2. Cross-domain carryover was much harder (F1 72.2) than within-domain (86.1) (B, Alexa). For Jarvis: newly spoken slots replace old ones of the same type, and other slots carry only into an elliptical follow-up (M).
- **For misheard names, acoustic or phonetic matching beats both word matching and semantic embeddings.** Over a list of named entities, Apple measured top-1 recall of 53.5–59.5 % for BM25, 78.6–80.7 % for T5 semantic embeddings, and 83.6–85.6 % for acoustic neighbour embeddings (B). Amazon's phonetic embedding cut retrieval errors by 49.9 % (videos) and 35.3 % (books) relative to lexical search (B).
- **With a few dozen items on screen, code can do this.** A folded Jaro-Winkler score plus character-trigram overlap scores "palikan" at 0.93 / 0.75 against Pallikaranai. The nearest other Chennai localities (Pallavaram, Palavakkam) score at most 0.78 / 0.38 (M, computed). Together with IDF weighting of the query words, that separates the target cleanly and needs no model (M).
- **Ask rarely, and ask specifically.** On Alexa, the top hypothesis was right 77 % of the time even when the alternatives also scored high, so ask-on-any-close-competitor over-asks. A learned decision improved clarification F1 by 81 % (B). The one paper that states a margin rule clarifies when the top-two gap is under 0.3 (B). For read-only actions, Jarvis should act on the best candidate and name it, and ask only when two candidates are genuinely tied (M).
- **A clarification costs little when it is specific, and is wasted when it is generic.** Users "are not dissatisfied when prompted for clarifications" (B-snippet, Kiesel 2018). On Bing, generic templates got low engagement, and specific ones did up to 500 % better (B). Offering two options was the worst-rated setting in web search (B). A voice question should name the distinguishing attribute ("the Pallikaranai one or the Adyar one?") (M).
- **LLM rewriting is good, but it costs a call.** LLM4CS's aggregated LLM rewrites beat human rewrites on the TREC CAsT conversational-search benchmark (B). Bing's Prometheus generates internal queries "within the given conversation context" (B). Jarvis should use the planner's existing single call as a fallback for follow-ups that code cannot bind, not add a rewrite call to every turn (M).
- **Keep state short-lived.** Alexa sessions averaged about 2.2 turns (B). Google's speakers listen for follow-ups for about 10 s, and Gemini lets a conversation resume up to an hour later (B). Keep the focus item and the last list for a few turns or minutes, and the previous frame for ellipsis only for the next turn or two (M).
- **Measure reference resolution separately, and test it on unseen names.** ReALM counts a prediction correct only when it gets the full set of entities. It also keeps a held-out unseen domain, where systems that score well elsewhere can drop (B). Compare v7 and v8 on the same items with exact McNemar, the only test with acceptable type I error for single-run systems (B).

## 1. Intent from short, loose spoken requests

**Cascade: rules first, model second.**
- MARRS (Apple, on-device) (https://ar5iv.labs.arxiv.org/html/2311.01650) (B):
  - A rule-based mention detector matches known screen and context entity names in the utterance.
  - A rule-based resolver handles ordinals and media commands before any model; "the rule-based system is high precision and extremely fast".
  - Only unresolved mentions go to a small scoring model (the mention detector has about 116k parameters, the resolver about 196k).
- Alexa ranks several interpretations, the HypRank hypotheses, using ASR, NLU and context signals, and acts on the top one unless a separate model decides to clarify (https://www.amazon.science/blog/reducing-unnecessary-clarification-questions-from-voice-agents) (B).
- Jarvis already has the cascade (lanes, then planner). What it lacks is an entity-binding step, so a lane needs an exact command form ("open the 2nd") instead of a verb plus any descriptor (M).

**Template span, then retrieval.** Apple's named-entity correction does not try to understand the whole sentence (https://arxiv.org/html/2409.06062v1) (B):
- Hand-written templates such as `/play (.*)/` cut out the likely entity span.
- Only that span is matched against the entity list.

For Jarvis this means a lane `/(open|read|show|tell me about|kaattu|padi|sollu) (the )?(.*?) (news|story|article|case)?( on| about| in (.*))?/`. The captured descriptor goes to the matcher (section 4), not to another regex (M). The Tamil verbs are my examples and are not from a source (M).

**What a short request leaves out is usually in context.** In the CQR corpus, 67 % of slots in the rewritten queries were carried over from the dialogue (https://ar5iv.labs.arxiv.org/html/1903.11783) (B). Treat a short utterance as a likely follow-up and check the conversation state before calling it unknown (M).

**ASR biasing.** A step upstream of everything above is to give the transcriber a vocabulary prompt of locality and zone names, if the Groq Whisper endpoint accepts one. I did not verify that this session (M).

## 2. Reference resolution ("that one", "the second story", "the Adyar one", "the Supreme Court news")

**ReALM** (https://arxiv.org/html/2403.20329v2) (B):
- **Three entity kinds:** on-screen, conversational, and background. Items the agent listed become conversational entities for later turns.
- **Screen as text:** the screen is rebuilt from parsed entities, sorted top to bottom, then left to right. Each entity is tagged inline, e.g. `{{1. (206) 198 1999}}`.
- **Answer format:** candidates are a numbered list, with "0" for none. The model outputs the numbers, more than one when needed, and predictions are de-duplicated.
- **Scoring:** a prediction is correct only if all the relevant entities are predicted, in any order.

Accuracy (%), from the paper's Table 3 (B):

| System | Conversational | Synthetic | On-screen | Unseen domain |
|---|---|---|---|---|
| MARRS | 92.1 | 99.4 | 83.5 | 84.5 |
| GPT-3.5 | 84.1 | 34.2 | 74.1 | 67.5 |
| GPT-4 | 97.0 | 58.7 | 90.1 | 98.4 |
| ReALM-80M | 96.7 | 99.5 | 88.9 | 99.3 |
| ReALM-3B | 97.9 | 99.8 | 93.0 | 97.8 |

- Hallucinated entities were rare, so Apple did not constrain decoding (B).
- The stated limits: complex positional reasoning, and non-text screen elements (B).
- For Jarvis's planner: give it the same numbered list of panel items and cases, have it return ids with 0 allowed, and have code reject any id not in the list (M).

**MARRS scoring** (https://ar5iv.labs.arxiv.org/html/2311.01650) (B):
- Each candidate gets three scores: category, location and text. Weights depend on the request tokens, and entities above a threshold are returned.
- Conversational references lean on text and location; background references lean on category.
- Reported F1: on-screen 83.39, conversational 89.85.

For Jarvis, the mapping is (M):
- "the second story" is location: an ordinal over the active list.
- "the Adyar one" and "the Supreme Court news" are text: the matcher over the active list, then the store.
- "that one", "it", "adhu" are recency: the focus item.

**Order of precedence** (M):
1. An explicit ordinal against the active list.
2. A descriptor match against what is on screen now.
3. The focus item, for pure deictics.
4. A descriptor match against the store.
5. Clarify.

This mirrors MARRS's order of rules, then screen, then context (B for MARRS, M for the mapping).

## 3. Ellipsis and follow-ups ("and in Adyar?", "since when?", "why?")

**Two industrial patterns** (B):
- **Slot carryover:** a per-slot decision whether to carry a slot from context. The model uses turn distance (one-hot recency), slot key and value embeddings, and the current dialogue act (https://ar5iv.labs.arxiv.org/html/1806.01773).
- **Contextual query rewrite:** rewrite the utterance so it "contain[s] all relevant slot values from the context". The domain NLUs "stay optimized for single-shot utterances" (https://ar5iv.labs.arxiv.org/html/1903.11783).

**Carryover numbers** (Alexa data, Table 3 of the slot-carryover paper) (B):

| Method | Precision | Recall | F1 |
|---|---|---|---|
| Naive: carry everything from the last turn | 17.0 | 92.5 | 28.7 |
| Rule baseline | 91.8 | 67.1 | 77.5 |
| Neural, with word attention | 75.8 | 94.7 | 84.2 |

- Within-domain carryover reached F1 86.1, and cross-domain only 72.2 (B).
- Sessions averaged about 2.2 turns (B).
- For Jarvis, a rule carryover is the right trade. A wrong carried slot gives a wrong spoken answer, which is worse than a missed one, so precision matters more than recall (M).

**The MARRS rewriter** (B):
- A classifier labels each turn as anaphora/ellipsis, correction by repetition, or none.
- "None" skips the decoder, so most turns pass through unchanged.
- The rewrite goes downstream alongside the original, with the label.
- It is a 4.5M-parameter LSTM. Anaphora/ellipsis rewrites scored F1 91.44 and exact match 87.83.

**LLM rewriting quality** (B):
- T5 "achieves the best results both on CANARD and CAsT", two conversational-question rewriting benchmarks (https://arxiv.org/abs/2004.01909).
- LLM4CS generates several rewrites and hypothetical responses and aggregates them. It beat existing methods "and even using human rewrites" on CAsT-19/20/21 (https://arxiv.org/abs/2303.06573v2).
- Bing's Prometheus generates internal queries "iteratively through a component called Bing Orchestrator", within the conversation context (https://blogs.bing.com/search-quality-insights/february-2023/Building-the-New-Bing).

So rewriting is a solved enough problem for an LLM. The question for Jarvis is cost and latency, not quality (M).

**Follow-up types Jarvis needs, each a frame operation** (M):

| Utterance | Operation |
|---|---|
| "and in Adyar?" / "Adyar la?" | Previous frame with zone := Adyar |
| "what about yesterday?" | Previous frame with time := yesterday |
| "since when?" / "eppo irundhu?" | Start date of the focus item (incident reported date, or news time) |
| "why?" / "yen?" | Cause or description field of the focus item, or its stored article text; the aide writes, code checks |
| "tell me more about that one" | Detail recipe on the focus item |
| "who is handling it?" | Officer by role for the focus item's department and zone |

**How long state lives** (B):
- Google speakers listen "for about 10 seconds" for a follow-up (https://support.google.com/googlenest/answer/7685981?hl=en).
- Gemini for Home can resume "up to one hour later".
- Alexa sessions averaged about 2.2 turns.

Jarvis's Collector works a dashboard for longer stretches than a smart-speaker user. Even so, the frame for ellipsis should only reach back one or two turns, while the focus item and the last list can live longer (M).

## 4. Matching a spoken descriptor to items, robust to ASR misspellings

**Evidence** (B):
- Apple, retrieval over a named-entity list from ASR spans, top-1 / top-5 recall (https://arxiv.org/html/2409.06062v1):
  - BM25: 53.5 / 71.2 (head entities).
  - T5 semantic embeddings: 80.7 / 86.9.
  - Acoustic neighbour embeddings, orthographic: 84.8 / 91.6.
  - The task is "interested in acoustic similarity rather than semantic similarity".
  - Phoneme input added under 1 % over spelling input and needs a pronunciation model, so Apple used the spelling version.
- Amazon, phonetic plus semantic embedding (https://www.isca-archive.org/interspeech_2022/zhou22h_interspeech.html):
  - Against semantic embedding alone, retrieval errors fell 7.07 % relative for videos and 4.23 % for books.
  - Against lexical search, they fell 49.9 % and 35.3 %.
- BEIR calls BM25 "a robust baseline" for zero-shot retrieval. Dense models "often underperform" out of domain (https://arxiv.org/abs/2104.08663).

**What that means at Jarvis's scale** (M):
- BM25 is the right weighting scheme, but its exact-token matching fails on "Palikan".
- A semantic embedding model would place "Palikan" nowhere useful: it is not a word.
- What is needed is BM25-style IDF weighting over fuzzy, phonetic token matches. With a few dozen panel items and a few thousand stored items, that is cheap in code.
- A small acoustic or phonetic embedding model is the step after that, if the logs show the code matcher missing.

**Local check on the motivating case** (M, computed in the scratchpad with Jaro-Winkler and character trigrams, after folding Tamil romanisation: aa→a, ee/ii→i, oo/uu→u, th→t, dh→d, zh→l, sh→s, w→v, y→i, doubled letters single):

| Candidate locality | Jaro-Winkler, raw | Jaro-Winkler, folded | Trigram containment, folded |
|---|---|---|---|
| Pallikaranai | 0.903 | 0.927 | 0.75 |
| Palavakkam | 0.770 | 0.783 | 0.38 |
| Pallavaram | 0.760 | 0.770 | 0.38 |
| Pulianthope | 0.661 | 0.674 | 0.12 |
| Adyar | 0.562 | 0.676 | 0.00 |
| Perungudi | 0.552 | 0.552 | 0.12 |

- Jaro-Winkler alone gives unrelated names 0.55–0.68, so its threshold must be high (about 0.85 or more).
- Trigram containment separates better: a 0.37 gap against a 0.14 gap for Jaro-Winkler.
- Using both, with a gazetteer margin, is safer than either alone.

**Gazetteer entity linking** (M):
- Link query tokens first to the closed gazetteer of zones, localities, departments, outlets and officer roles, with Tamil and Tanglish aliases.
- Once linked, the canonical name matches item fields exactly.
- A locality is a stronger signal than a headline word, because the gazetteer is closed and small.
- Apple's template-span step and MARRS's name matcher are the same idea (B for those systems).

**Fusing lists.** If the store search and the panel matcher produce separate rankings, reciprocal rank fusion (sum of 1/(k + rank)) is the standard way to merge them. I did not open the RRF paper this session (M).

## 5. Clarify or pick the best candidate?

**Production evidence** (B):
- Alexa's old rule asked whenever competing hypotheses scored high. Yet the top hypothesis was right "77% of the time" in those cases (https://www.amazon.science/blog/reducing-unnecessary-clarification-questions-from-voice-agents).
- The learned decision uses:
  - the top hypothesis;
  - alternatives close to it on ASR, NLU or overall score;
  - the signal-to-noise ratio;
  - whether the request repeats the previous one;
  - flags for truncated utterances.
- It raised clarification F1 by 81 % over the threshold baseline (https://arxiv.org/abs/2109.12451).

**An explicit margin rule** (https://ar5iv.labs.arxiv.org/html/2008.07559) (B):
- A query is ambiguous if the top intent's score is below t1, or the top-two gap is below t2 = 0.3 on calibrated softmax scores.
- Raw SVM scores gave many false ambiguities until they were calibrated.
- The fallback question names the discriminating phrases: "Are you talking about X or Y?".
- The paper reports no post-clarification accuracy.

**What users think of clarifications:**
- Kiesel et al. 2018 found users were not dissatisfied by clarifications and sometimes enjoyed them, and that the best form depends on context (B-snippet).
- Bing clarification panes (https://ar5iv.arxiv.org/html/2006.00166) (B):
  - Generic templates engaged poorly; specific ones did up to 500 % better.
  - Sessions with clarification had 16.6 % less dissatisfaction, which the authors call not fully representative.
  - Ambiguous queries engaged less (0.70 of the average) because the top results often already covered the main intent.
- Clarification usefulness study (https://arxiv.org/html/2402.01934v1) (B):
  - Specific questions beat generic ones.
  - Two answer options rated worst, with 3–5 better.
  - Usefulness fell as queries got longer: short queries gain most.
  - Prior work cites inappropriate questions causing "frustration and dissatisfaction".

**For Jarvis** (M):
- **Read-only actions** (open, read or summarise an item): act on the best candidate and name it in the reply ("Opening The Hindu's Pallikaranai Supreme Court story"). Naming it lets a wrong pick be corrected in one turn ("no, the Adyar one").
- **Real ties:** clarify only when the top two are close and both plausible.
- **Write actions** (assign, escalate, notify; anything that changes records): always confirm.
- **Voice-specific limits:** offer 2–3 named options, never 5. The web-search finding that two options is worst comes from panes the user can scan, not from speech. Never ask twice in a row.

## 6. Evaluating understanding

**Metrics** (M, built on B):
- Intent accuracy.
- Slot F1. CQR reports slot F1 rising from 0.89 to 0.91 on rewrites (B).
- Frame exact match.
- Reference accuracy, counted correct only when the full gold set is predicted, as in ReALM (B).
- Follow-up success over 2–4-turn dialogues.
- Clarification rate, and unnecessary-clarification rate.
- Wrong-action rate. This is the costliest error, so report it on its own.

**Holdout design:**
- ReALM's unseen domain (alarms, zero-shot) changed the ranking of systems. GPT-3.5 fell to 67.5, and ReALM's accuracy moved non-monotonically with size (B).
- For Jarvis (M):
  - Hold out place names, outlets and phrasings that never appear in dev items or in the lexicons.
  - Include real Whisper transcripts of spoken audio, not only typed misspellings.
  - Report English, Tamil and Tanglish slices separately.
  - Tune thresholds on dev only, then freeze them before running the holdout.

**Paired tests:**
- Dietterich: McNemar "is the only test with acceptable type I error" when each system can be run only once (https://mlanthology.org/neco/1998/dietterich1998neco-approximate/) (B).
- v7's evaluation note already uses exact binomial McNemar when the discordant pairs number fewer than 25 (B-local, docs/jarvis/v7-research/50-evaluation.md).
- Run v7 and v8 on the same frozen items and test on the discordant pairs (M).

## Recommendations for Jarvis v8

1. **Add a code resolver before the lanes, and route on its output.** Order: transcript → resolver (fold, link to the gazetteer, detect cues, bind references, rewrite) → lanes → planner (fallback) → aide.
   - With no reference or ellipsis cue, the utterance passes through unchanged, as in MARRS.
   - With a cue, the resolver emits a standalone canonical rewrite (e.g. "open news N12") and a `resolved` block of entity ids. The lanes read both. (M; pattern B from MARRS and CQR.)
   - Test: v7's live-60 single-turn items keep their lane and result; there is no regression from pass-through.

2. **Keep a typed referent register with explicit lifetimes.**
   - `list`: the last list shown or spoken, as ordered ids. A new list replaces it, and it expires after 5 user turns or 10 minutes since last use.
   - `focus`: the last single item opened or answered, with the same lifetime.
   - `frame`: intent, metric, zone, locality, department, status, severity and time range. It is used only for ellipsis in the next 2 turns.
   - `offered`: pending clarification options, valid for 1 turn.
   - Expired state is never guessed from. (M; lifetimes informed by B: about 2.2 turns per Alexa session, Google's ~10 s window and 1 h resume.)
   - Test: "since when?" six turns after the focus was set produces a clarification, not a stale answer.

3. **Bind references in a fixed order.** (1) Explicit ordinal against `list`. (2) Descriptor match against on-screen items. (3) A pure deictic ("that one", "it", "adhu", "athu") goes to `focus`. (4) Descriptor match against the store. (5) Clarify. (M; mirrors MARRS's rules, then screen, then context, B.)
   - Test: "the second story" while the news panel is showing resolves to panel position 2 in 100 % of templated cases.

4. **Score items with IDF-weighted fuzzy phonetic matching.** S(i) = Σ_q idf(q)·sim(q,i) / Σ_q idf(q), plus 0.10 if the item is on screen now and 0.05 if it was in the last answer.
   - q ranges over the query's content tokens after stopword and filler removal ("news", "story", "on", "about", "la", "pathi").
   - sim(q,i) is the best match over the item's tokens (headline, place, zone, locality, outlet, linked incident title): 1 for exact or gazetteer-canonical; otherwise max(Jaro-Winkler, trigram containment) on folded forms, counted only if ≥ 0.80. Tokens of 3 letters or fewer match only exactly.
   - idf is the BM25 idf over the candidate set.
   - Worked example (M, computed): with 10 items, two "Supreme Court" stories and one Pallikaranai item, "Supreme Court news on Palikan" scores 0.97 for the Pallikaranai story against 0.60 for the other Supreme Court story.
   - **Place veto:** if the query links to a gazetteer place and an item's place, zone and locality all differ from it, that item cannot be auto-accepted. Without the veto, "Supreme Court news on Palikan" with no Pallikaranai item would accept the Adyar story at 0.60. Jarvis should instead say it found no Supreme Court story for Pallikaranai, and offer the nearest one (M).
   - Test: a fixture of 30 real ASR misspellings of Chennai localities links top-1 in ≥ 90 % of cases, and a misspelling never links to a different locality.

5. **Ambiguity rule: accept, clarify or fall through.**
   - Accept the top item when S1 ≥ 0.55 and S1 − S2 ≥ 0.15.
   - Clarify between the top 2–3 when S1 ≥ 0.55 and the gap is under 0.15.
   - Below 0.55 there is no reference: hand the request to the planner as a search.
   - Start values (M), then calibrate on dev so that clarifications are ≤ 10 % of reference turns and wrong picks are ≤ 3 % of accepted ones (M; the margin rule is B from arXiv 2008.07559, which uses t2 = 0.3 on softmax; the cost of over-asking is B from Alexa's 77 % finding).
   - Test: "the Supreme Court news" with two Supreme Court items clarifies; "...on Palikan" does not.

6. **Ask specifically, and only once.**
   - The question names the distinguishing field: "The Pallikaranai one or the Adyar one?" or "The Hindu's or the Times'?". Never "what do you mean?".
   - At most 3 options. The answer is resolved only against `offered` (ordinal, name or fuzzy match).
   - Never two clarifications in a row: on a second miss, pick the top item and name it. (M; specific beats generic, B.)
   - Test: every clarification string contains at least one candidate's distinguishing attribute.

7. **Act and name for read-only actions; confirm write actions.** When the resolver binds an item for open, read or summarise, the reply names it (outlet plus place, or case title plus zone), so the Collector can say "no, the other one". Assign, escalate and notify always confirm the bound record. (M; grounded in Alexa's 77 % top-correct finding, B.)
   - Test: the named item in the spoken reply equals the resolved id in 100 % of logged turns, checked by the existing fact gate.

8. **Carryover by rule, precision first.**
   - Slots spoken in the new utterance replace slots of the same type. Other slots carry only from the immediately previous frame, and only when the utterance is elliptical: short, no own intent verb, or opening with "and", "what about", "how about", "-la?".
   - A full request (verb plus entity) never inherits slots. (M; naive carry-all had 17 % precision against 92 % for rules, B.)
   - Test: "and in Adyar?" after "how many open drainage cases in Perungudi this week" produces the same frame with zone Adyar. "show road cases" after it carries nothing.

9. **Map the follow-up words to frame operations in code.**
   - since when / eppo irundhu / eppolerndhu → the focus item's start date.
   - why / yen / edhukku → the focus item's cause, description or article text, through the aide.
   - who's handling it → officer by role.
   - tell me more / innum sollu → the detail recipe.
   - The Tamil forms need checking against real transcripts (M).
   - Test: each operation has an EN/Tamil/Tanglish triple in the dev set.

10. **Planner fallback uses ReALM's format.** When the resolver detects a cue but cannot bind it, the planner prompt carries `list`, `focus` and the on-screen items as a numbered list (`1. [news] headline | outlet | place | time`, `0. none`). The planner returns `ref_ids` plus a standalone `rewrite`, and code rejects any id that is not listed. (M; format B from ReALM.)
    - Test: no planner output with an unlisted id ever reaches the aide.

11. **Grow a gazetteer with ASR aliases.**
    - Seed it with zone, locality, department and outlet names, plus Tamil and Tanglish spellings.
    - When a resolved turn is not followed by a correction, log the misheard token and its canonical name for owner review.
    - Optionally, pass the locality names to the transcriber as a vocabulary prompt if the endpoint supports one (unverified).
    - (M; the closed-gazetteer linking pattern is B from Apple's template-span retrieval and MARRS's name matcher.)
    - Test: an alias-table hit never overrides an exact gazetteer match.

12. **Evaluate understanding as its own gate.**
    - Build a dev set and a frozen holdout of 2–4-turn dialogues labelled with gold frames and gold resolved ids.
    - The holdout has unseen place names and phrasings, real Whisper transcripts, and EN/Tamil/Tanglish slices.
    - Report intent accuracy, slot F1, frame exact match, reference accuracy (full-set match), clarification rate, unnecessary-clarification rate and wrong-action rate, each with a Wilson interval.
    - Compare v7 and v8 with exact McNemar on discordant pairs. (M; the metric definitions and test choice are B from ReALM, CQR and Dietterich.)

## Sources found but not opened (no claim above rests on them)

- Alexa "Scaling multi-domain dialogue state tracking via query reformulation" (arXiv 1903.05164).
- ACL Industry 2023 unified carryover and friction rewriting with BART (2023.acl-industry.58).
- Amazon "Pre-training for query rewriting" (arXiv 2002.05607).
- Phonetic-reward ASR rewriting (arXiv 2012.11468).
- N-best deep entity retrieval (Interspeech 2021).
- ASR-aware entity reference expansion (EMNLP 2024 industry).
- Raghuvanshi et al., entity resolution for noisy ASR transcripts (D19-3011; the PDF was unreadable here).
- QReCC (Anantha et al. 2021).
- GECOR ellipsis and coreference data (D19-1462).
- Cormack et al., reciprocal rank fusion (SIGIR 2009).
- Indian-name Soundex variants (search listings only).
- CLAM selective clarification (arXiv 2212.07769).
- The MARRS and slot-carryover PDFs were unreadable, and the ar5iv HTML versions were read instead.
- 2018 press coverage of Alexa cross-domain carryover and Follow-Up Mode, which is secondary.
