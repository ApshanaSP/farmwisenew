# Jarvis v7 research 50: evaluation design and hallucination measurement

17 Nov 2026. Scope: how to measure v7 (a model writes short spoken answers from dashboard facts, and from web facts only for what the dashboard lacks, with code checking the result). The questions are whether its answers are grounded, whether it hallucinates, whether it is crisper and more human than v6, how fast it is, and whether it understands as well as v6.
Web budget used: 12 reads (11 fetches, 1 search). No model API call.

Legend: **(B)** = read in the cited source in this pass. **(M)** = my inference or my own arithmetic (the arithmetic was run locally with exact binomial sums). (B-local) = read in this repo.
I did not read the source behind any figure that is not marked (B). Where I did not read a paper, its row says so.

## Summary

- **Judge in pairs, in both orders, and call a tie unless the two orders agree.** MT-Bench measured how often a judge keeps its verdict when the answers swap places: GPT-4 65.0 %, GPT-3.5 46.2 %, Claude-v1 23.8 %. The paper's fix is to swap, count a win only when both orders agree, and call everything else a tie (B). Weaker judges are less consistent. The free judges v7 can use (flash-lite, Groq models) are untested, so their consistency must be measured on the dev set before they are trusted (M).
- **Expect position bias to be worst exactly where v7 is being tested.** Judges are biased toward a position (not by chance), and the bias depends strongly on how far apart the two answers are in quality (B, Shi et al.). Close pairs, such as two good spoken answers from v6 and v7, are where the bias bites hardest (M).
- **Expect three other biases.** Verbosity bias: a "repetitive list" padding attack fooled GPT-3.5 and Claude-v1 91.3 % of the time and GPT-4 8.7 % (B). Self-preference: GPT-4 and Claude-v1 rated their own answers higher than humans did, though the data were too few to be sure (B). Bias toward LLM-written text: G-Eval flags it (B). If v6's spoken text is mostly code-built and v7's is model-written, that last bias is a confound (M).
- **Separate grounding from style.** Grounding is checked by code at the claim level: every spoken figure, name, date, time word and direction word must match the evidence the model was given. The LLM judge rates only crisp and human, never correctness (M). FACTS Grounding uses two gates: disqualify answers that do not fulfil the request, then mark an answer accurate only if it is fully grounded (B). v7 needs both, or a system that refuses everything would pass (M).
- **Score outside-dashboard questions CRAG-style.** CRAG scores perfect 1, acceptable 0.5, missing ("I don't know") 0 and incorrect −1, so a hallucination costs more than an abstention (B). Its straightforward-RAG setting hallucinated 30.1 %, against 13.5 % for its best LLM-only setting (B). The web path is the riskiest part of v7 (M).
- **Small-n statistics.** For paired correctness, use exact McNemar on the discordant pairs (exact binomial when b + c < 25) (B). For judge preferences on non-tie pairs, use an exact sign test (M). Put Wilson intervals on every rate (B). Even 0 hallucinations out of 60 only bounds the true rate below 6.0 % at 95 %; 0 of 150 bounds it below 2.5 % (M, computed).
- **Latency.** Measure time to first audio (from end of user speech to the first audio byte) per stage, and report p50, p90 and n, never means (B, Hamming). A p90 needs n ≥ 60 per condition for a bounded 95 % interval: at n = 20 none exists, and at n = 30 the upper end is the slowest run (M, computed). Report warm and cold runs separately. Cold starts cost 500–2000 ms on serverless functions, as one vendor reports it (B).

## 1. LLM as judge

**Pairwise vs pointwise.** MT-Bench sets out the trade-off (https://arxiv.org/html/2306.05685v4) (B):
- Pairwise comparison grows quadratically with the number of models.
- Single-answer grading scales better, but it can miss subtle differences between close pairs.
- Its absolute scores can shift more than pairwise verdicts when the judge model changes.
- It gives more ties than pairwise grading.

v7 compares two systems on fixed items, so the quadratic cost does not apply. Pairwise is the natural design for "judge prefers v7 over v6" (M).

**Position bias.** MT-Bench, Table 2 (https://arxiv.org/html/2306.05685v4) (B):
- Consistency under swapping: Claude-v1 23.8 % (it favoured the first answer 75.0 % of the time), GPT-3.5 46.2 %, GPT-4 65.0 %.
- Mitigation (§3.4): swap the order, count a win only if both orders agree, otherwise a tie.
- Few-shot examples raised GPT-4's consistency to 77.5 %.

Shi et al., "Judging the Judges", tested 15 judges across about 40 answer models and more than 150,000 instances (https://arxiv.org/abs/2406.07791) (B):
- The bias is "not due to random chance" and varies significantly across judges and tasks.
- The length of the prompt's parts has only a weak effect.
- The quality gap between the two solutions strongly affects position bias.

A different paper with the same title, Thakur et al. (arXiv 2406.12624), was not read (M).

**Verbosity bias.** MT-Bench padded 23 list answers by restating the list, adding no information. Failure rates: Claude-v1 and GPT-3.5 91.3 %, GPT-4 8.7 % (B, same URL; the text calls it Table 4, but the figures are in Table 3).
For v7, spoken brevity is part of the target, so the rubric must reward the shorter answer when both are equally complete. Log word counts and report whether wins track length (M).

**Self-enhancement.** GPT-4 gave itself a win rate about 10 % higher than humans did, and Claude-v1 about 25 % higher. GPT-3.5 did not favour itself. The authors say the data are too limited to conclude (B, same URL).
→ Do not use a judge from the same model family as v7's writer (M).

**Reference-guided judging.** On math, GPT-4's failures went from 14/20 (default prompt) to 6/20 (chain of thought) to 3/20 (judge given a reference answer) (B, same URL, Table 4).
→ This supports giving the grounding checker the evidence bundle as the reference. It also supports not asking the style judge to verify facts at all (M).

**Agreement with humans.** MT-Bench, non-tie votes: GPT-4 pairwise agreed with humans 85 % on turn 1 and on turn 2, against human–human agreement of 81 % and 82 %. On Chatbot Arena it was 87 % on non-ties and 64 % with ties included (B, same URL, Tables 5–6). These come from English chat, so they do not carry over to Tamil or Tanglish voice answers judged by a free model (M).

**G-Eval** (https://arxiv.org/abs/2303.16634) (B): the judge uses chain of thought plus a form-filling paradigm, and reached a Spearman correlation of 0.514 with humans on summarization. The authors flag that LLM evaluators may be biased toward LLM-generated text.
The abstract says nothing about probability-weighted scores, so they are not claimed here.

**Judge-model choice** (M):
- MT-Bench's weaker judges were badly position-biased (B, above), and the free judges are unmeasured.
- So run two judges from different families: Gemini flash-lite, and one Groq-hosted open model.
- FACTS also combines several judge models "to mitigate evaluation bias" (https://arxiv.org/abs/2501.03200) (B). CRAG averages two LLM judges (B, below).
- Gate each judge on the dev set: a judge with low swap consistency is unusable. I suggest ≥ 70 % as the bar (M, not from a source).

**Rubric design (M).** The judge sees the user's question in its own language and two blind replies, labelled A and B by a seeded random draw. It is told that facts are checked elsewhere, and rates in this order:
1. The reply answers the question in its first sentence.
2. It is crisp: no filler, no restating the question, no reading out lists.
3. It sounds like a person speaking in the question's register (English, Tamil or Tanglish).
4. It suits speech in length: the shorter one wins when both are equally complete.

The judge writes a one-sentence reason first, then `{"winner":"A"|"B"|"tie"}`, at temperature 0.

## 2. Statistics for small n

**Paired correctness (understanding, v7 vs v6 on the same items).** McNemar uses only the discordant pairs b and c, and the traditional advice is the exact binomial test when b + c < 25. There is a mid-p variant, and simulations found the exact and continuity-corrected tests "overly conservative" (https://en.wikipedia.org/wiki/McNemar%27s_test) (B).
v6 already pairs its finals by exact McNemar against v5's files (JARVIS_V6.md line 227) (B-local). Keep that design (M).

**Pairwise preference.** Drop ties and run an exact two-sided sign test on the v7 wins out of the non-tie verdicts. Report the tie count next to it, since MT-Bench reports agreement both with and without ties (B). The test itself is (M).

**How many non-tie verdicts are needed** (two-sided α = 0.05, exact binomial; M, computed):

| non-tie n | wins needed | power if true v7 win rate 65 % | 70 % | 75 % |
|---|---|---|---|---|
| 20 | 15 (75 %) | 0.25 | 0.42 | 0.62 |
| 30 | 21 (70 %) | 0.36 | 0.59 | 0.80 |
| 40 | 27 (68 %) | 0.44 | 0.70 | 0.90 |
| 60 | 39 (65 %) | 0.56 | 0.84 | 0.97 |
| 80 | 50 (62 %) | 0.72 | 0.94 | 1.00 |

If about a third of verdicts are ties, 90 judged pairs give about 60 non-ties. That is enough to detect a 70 % win rate with about 84 % power, but not a 65 % win rate (M).

**Intervals.** Wilson "can be safely employed with small samples and skewed observations" and has no zero-width problem. The Wald interval narrows to zero width as p̂ → 0 or 1, "falsely implying certainty". The rule of three gives (0, 3/n) as an approximate 95 % interval when no events are seen (https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval) (B).
Computed (M):
- 0/60 → Wilson (0, 6.0 %), rule of three 5.0 %.
- 0/100 → (0, 3.7 %).
- 1/60 → (0.3, 8.9 %).
- 45/60 → (62.8, 84.2 %), matching v6's reported interval.

So "0 hallucinations" must always be reported as "0/n, 95 % upper bound X %" (M).

**Consistency (pass^k).** τ-bench proposes pass^k "to evaluate the reliability of agent behavior over multiple trials". It reports gpt-4o succeeding on < 50 % of tasks, with pass^8 < 25 % in retail (https://arxiv.org/abs/2406.12045) (B).
The abstract does not define pass^k. My understanding, not read in this pass, is that it means all k independent trials of a task succeed (M). With independent trials at per-trial success p it equals p^k:
- p = 0.95 → pass^3 0.857, pass^5 0.774.
- p = 0.90 → pass^3 0.729.

(M, computed.) A model writer at temperature > 0 can hallucinate on one run in three, so outside-dashboard items should be run k = 3 times (M).

## 3. Hallucination metrics for grounded answers

**FACTS Grounding** (https://arxiv.org/abs/2501.03200) (B):
- Each prompt has a user request and a document of up to 32k tokens.
- Phase 1 disqualifies responses that "do not fulfill the user request".
- Phase 2 marks a response accurate only if it is "fully grounded in the provided document".
- Judges are automated. The judge prompt was chosen against a held-out test set. The final score aggregates across several judge models.
- The leaderboard has public and private splits to protect its integrity.

The abstract does not give the example count or name the judge models.
→ For v7 (M): gate 1, did it answer what was asked (or abstain correctly)? Gate 2, is every claim supported? Choose the checker's settings on the dev set only.

**CRAG** (https://arxiv.org/html/2406.04744) (B):
- 4,409 QA pairs, labelled Perfect 1, Acceptable 0.5, Missing 0 ("I don't know", empty or clarification) or Incorrect −1. Truthfulness is the mean.
- Auto-eval merges Perfect and Acceptable into "accurate", so truthfulness = accuracy − hallucination.
- The LLM judges, gpt-3.5-turbo-0125 and llama-3-70B-instruct, are averaged. Their F1 against human labels was 94.7 % and 98.9 %. Two human graders agreed 94 %.
- Best LLM-only (GPT-4 Turbo): 33.5 % accurate, 13.5 % hallucinated, 53.0 % missing.
- Best straightforward RAG: 43.6 % accurate, 30.1 % hallucinated, 26.3 % missing.
- Industry systems hallucinated about 16–25 %.

→ Use CRAG's scale for reporting outside-dashboard answers. The v7 gate is stricter: Incorrect = 0 (M).

**RGB** (https://arxiv.org/abs/2309.01431) (B): it tests four abilities: noise robustness, negative rejection, information integration and counterfactual robustness. LLMs "still struggle significantly" with negative rejection. The abstract gives no definition and no numbers.
My reading is that negative rejection means declining when the retrieved text holds no answer (M).

**AbstentionBench** (https://arxiv.org/abs/2506.09038) (B):
- 20 datasets covering unknown answers, underspecified questions, false premises, subjective questions and outdated information.
- Reasoning fine-tuning degrades abstention by 24 % on average.
- Scaling is of little use.
- A crafted system prompt helps but does not fix it.

How abstention is judged is not in the abstract.
→ The v7 outside-dashboard set should mix these kinds. For example: a ward the snapshot lacks (unknown), "how many?" with no referent (underspecified), "why did complaints double?" when they did not (false premise), and last year's figure (outdated) (M).

**Not read in this pass:** SQuAD 2.0 (https://arxiv.org/abs/1806.03822) and FRAMES (https://arxiv.org/abs/2409.12941). Their names are listed for follow-up only, and no figure from them is used (M).

**Claim-level checker for v7** (M, a design from the sources above):
1. *Normalize.* Handle Tamil and English digits, number words in English, Tamil and Tanglish (ஆயிரம், lakh, crore), percentages, and rupees. Resolve dates and relative time words ("yesterday", "last week", நேற்று) against the frozen snapshot date. Allow rounding only with a hedge word ("about 1,200" for 1,187), to 2 significant figures.
2. *Extract checkable claims.*
   - Numbers.
   - Names (wards, zones, departments, officers, places), from a gazetteer built from the dashboard in both scripts plus transliterations.
   - Dates and time words.
   - Direction and rank words ("rose", "highest", அதிகம்).
   - Causal links ("because", "due to", காரணம்).
3. *Match against the evidence bundle given to the model for that turn,* not the whole database. A true figure that was not in the bundle still counts as unsupported, because its origin cannot be verified. Recompute direction and rank words from the facts by code.
4. *Causal claims on "why" questions* are the hardest. They pass only if the cause is a fact in the bundle, or a web fact with its source. Otherwise the answer must say the dashboard does not give a reason. Paraphrased qualitative claims that code cannot decide go to both judges, and they must agree that the claim is supported.
5. *Metrics per set:*
   - answers fully grounded (0 unsupported), as x/n with a Wilson interval;
   - unsupported-claim rate (unsupported / checkable claims);
   - gold-fact recall (gold facts spoken / gold facts expected), to catch vacuous answers;
   - over-abstention rate on answerable items;
   - CRAG-style counts on the outside set.
6. *Check the checker.* Measure recall by mutation: inject a wrong number, name, date or direction into known-good answers. On dev the checker must catch 100 % of them. Measure precision with about 40 hand-labelled real answers, including Tamil ones.

## 4. Dev set with gold facts, without leaking into the holdout

- **Freeze a dashboard snapshot** (a fixture with a fixed "today"). Compute gold facts by code queries on it rather than writing them by hand: cheap, exact and re-runnable (M).
- **Write questions from templates per category** (incident, news, compare, why, follow-up, outside) and per language, then paraphrase them (by a person, or a model that never sees the holdout).
- **Split by template and entity, not by row,** so a paraphrase of a dev item cannot sit in the holdout (M). FACTS keeps a private split for the same integrity reason (B, URL above).
- **Use recorded web snippets** for news and outside items in the holdout, so the run is reproducible. Real web goes in a separate live smoke set that is not scored against targets (M).
- **Keep the existing frozen-set rules.** The holdout is never read and only the runner touches it, once (JARVIS_V6.md line 84) (B-local).
- **Freeze before the final run,** with a hash manifest of everything that can change the score (M):
  - snapshot;
  - holdout items and gold;
  - v6's answers, generated once and stored;
  - checker version and gazetteer;
  - judge prompt, judge model ids and temperature;
  - seeds and the A/B draw;
  - scoring script;
  - targets and tests (two-sided α 0.05).

  Any prompt change after the holdout run voids it (M).

## 5. Measuring voice-agent latency

- **Definition.** "The total time from when a user finishes speaking until they hear the agent's response", measured as firstAudioByte − userSpeechEnd. The chain is STT → LLM → TTS → audio, plus silence detection and network. "Monitor P95 latency, not averages" (https://hamming.ai/blog/voice-ai-latency-whats-fast-whats-slow-how-to-fix-it) (B).
- **Reference figures.** The same vendor reports production P50 of 1.4–1.7 s and P90 of 3.3–3.8 s, "drawing on 10M+ mins". It does not give a call count (B), and the figures are vendor-reported and unaudited (M). It cites a human turn gap of 200–300 ms from arXiv 2404.16053, which I did not read (B as cited).
- **Cold starts.** "Serverless functions adding 500–2000ms". The vendor advises keeping persistent connections (B, same URL).
- **Sample size** (M, computed distribution-free 95 % intervals from order statistics):

  | n | p50 interval | p90 interval |
  |---|---|---|
  | 20 | 6th–15th fastest | none exists |
  | 30 | 10th–21st | 22nd to the slowest run |
  | 60 | 22nd–38th | 50th–59th |
  | 100 | 40th–60th | 84th–96th |

  → Use n ≥ 60 per condition for a p90 claim.
- **Protocol** (M):
  - Real providers.
  - Interleave v6 and v7 runs (ABAB) to cancel drift in provider load.
  - Separate warm runs from cold runs (a fresh process, or the first turn after idle).
  - Log every stage's timestamps.
  - Count 429s and fallbacks as their own rows with their latency; never drop them.
  - Report n, p50, p90 and max per stage and end to end, with provider, model and time of day.

## Recommendations for Jarvis v7

Ranked by value. "Cost" counts build effort and calls on the free tier. "Risk" names what could make the number wrong.

1. **Make the code claim checker the grounding gate, and test it by mutation before any tuning.**
   - What: the §3 design, checking against the per-turn evidence bundle. It covers figures, names, dates and time words, direction and rank words, and causes. Mutation recall must be 100 % on dev, and precision must be measured on about 40 hand-labelled answers.
   - Cost: about a day to build, no model calls.
   - Risk: Tamil and Tanglish number words and transliterated names cause false alarms or misses. Paraphrased qualitative claims still need the two-judge fallback.
2. **Sets and sizes. Dev ≈ 120, frozen holdout ≈ 150, plus the existing live-60.**
   - Dev: 20 per category × 6 categories, about 50 % English and 25 % each Tamil and Tanglish, used for tuning.
   - Holdout: 18 per category for incident, news, compare, why and follow-up (90), plus 60 outside-dashboard items mixing unknown, underspecified, false-premise, outdated and web-answerable.
   - Gold facts are computed by code from the frozen snapshot, and web snippets are recorded.
   - Understanding: the existing live-60 holdout, paired with v6's file by exact McNemar. "At least v6's" means a count ≥ v6's and no significant loss.
   - Cost: mostly templates plus code queries, about a day.
   - Risk: even 0/60 outside-dashboard errors bounds the rate only below 6.0 % (0/150 overall below 2.5 %). Say so in the results.
3. **Blind pairwise judge, both orders, two judge families.**
   - Judges: Gemini flash-lite and one Groq-hosted open model, neither in v7 writer's family, at temperature 0, using the §1 rubric (reason, then A, B or tie).
   - Per judge: a v7 win counts only if both orders agree, otherwise a tie. The final verdict for a pair is v7 only if both judges say v7. Report each judge separately.
   - Before use, gate each judge on dev:
     - swap consistency ≥ 70 % (my bar, not a source's);
     - an answer against itself is a tie;
     - a padded or robotic version of a good answer loses;
     - about 30 dev pairs labelled blind by the owner or a Tamil speaker, with agreement reported (MT-Bench's GPT-4 reached 85 % on English non-ties, a reference point, not a target).
   - Statistics: exact sign test on non-ties, needing ≥ 60 non-ties for a 70 % win rate at about 84 % power. Log word counts against wins.
   - Cost: 4 calls per pair, about 600 on the holdout, within free tiers but subject to daily caps.
   - Risk: free judges may be weak in Tamil, and may favour model-written text over v6's code-built phrasing (G-Eval). The human labels are the only guard against both.
4. **Score outside-dashboard answers CRAG-style, with k = 3 runs and FACTS's two gates.**
   - Labels: correct, abstain or clarify, hallucinated. The target is hallucinated = 0/n on all three runs (pass^3 = 1), plus over-abstention on answerable items reported next to it.
   - Cost: 3× the writer's calls on 60 items.
   - Risk: abstaining on everything games the 0. The eligibility gate and gold-fact recall catch it.
5. **Latency on real providers.**
   - n ≥ 60 per condition, warm and cold reported separately, ABAB interleave with v6, time to first audio per stage, p50 and p90 with n and max, failures and fallbacks counted.
   - Cost: about 240 turns of calls.
   - Risk: provider load and free-tier pacing (v6's runner had to wait for minute windows) inflate the tail. Record the time of day and the rate-limit events.
6. **Freeze and run once.**
   - What: the §4 hash manifest is written before the final run. Holdouts are touched only by the runner, once. Results are reported as x/n with Wilson intervals, exact p-values and the tie count.
   - Cost: low.
   - Risk: tuning drift after a peek. Any change voids the run.
