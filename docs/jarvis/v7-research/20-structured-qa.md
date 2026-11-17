# 20 · Answering questions over the dashboard's data (why, compare, multi-step, follow-up)

Research date: 17 Nov 2026. Scope: how an "ask your dashboard" assistant answers any question about its own data without a wrong figure: the architecture (text-to-SQL, fixed tools, semantic layer, compute in code), comparisons, why-questions, multi-step and follow-up questions, and abstention.

Legend. **(B)** read in the source itself. **(B\*)** read only in the search-result excerpt of that URL, not the full page; check before quoting it in a decision. **(M)** my inference. **(repo)** read in this worktree's code (`chennai-grievance-portal-main/src/lib/thunai/`). 12 web calls were used. Figures appear only where I read them.

## Summary

- **Semantic layer beats text-to-SQL on accuracy, and it fails safely.** On dbt's 11-question benchmark, the semantic layer scored higher than text-to-SQL for both models tested. Its failures were error messages, while text-to-SQL failures were plausible wrong numbers. It scored 0 % on questions its model did not cover until more models were added. This matches Jarvis's recipe design: widen the catalogue, never move to free SQL.
- **Production assistants ground on a curated model and on verified question-to-query pairs.** Looker has golden queries and Power BI has verified answers. Microsoft still says output is not deterministic. None of the vendors I read claims zero errors.
- **Compute in code, let the model say it.** Program-of-Thoughts reports an average gain of about 12 % over chain-of-thought when a program does the arithmetic. Jarvis already enforces this: `numbergate.ts` lets no figure through that code did not supply (repo).
- **Choosing what to say in a comparison is a scoring problem.** Tang et al. score each candidate statement as impact (the segment's share of the total) × significance (1 − p against a null pattern). Tableau Pulse uses fixed insight types: top contributors, concentrated contribution, drivers and detractors, unexpected values and trend. Jarvis already has Adtributor-style contribution and a Poisson change test (repo). What is missing is one ranker across all comparison types.
- **"Why" over operational data means where the change sits, what is linked in time, and what the data cannot tell.** Tableau's Explain Data states that its explanations are not causal.
- **Follow-ups are where accuracy collapses.** On SParC and CoSQL, whole-conversation accuracy is far below per-question accuracy, and it drops on later turns. Carry state in code (Jarvis's `frame.ts` and `register.ts` already do) and test whole chains, not single turns.
- **Abstention is hard, and models over-answer.** On TrustSQL, no method beat the baseline that abstains on everything once wrong answers were penalised. A government console needs a code-side answerability check, not the model's own judgement.

## 1. Architectures

### 1.1 Text-to-SQL vs semantic layer (dbt, 2026)

Source: https://docs.getdbt.com/blog/semantic-layer-vs-text-to-sql-2026

- Setup: the ACME Insurance dataset (from data.world, Sequeda et al.) with 15 tables; "11 questions, each run 20 times, across multiple LLMs". (B)
- Modelled project: claude-sonnet-4-6 scored 90.0 % with text-to-SQL and 98.2 % with the semantic layer. gpt-5.3-codex scored 84.1 % and 100.0 %. (B)
- Original, unmodelled schema: text-to-SQL scored 32.7 % with GPT-4 (Nov 2023) and 64.5 % with both 2026 models. The semantic layer scored 60.5 % with GPT-4 and 72.7 % with both 2026 models. (B)
- On the "too many hops" questions, which the layer's model did not cover, the semantic layer scored 0.0 % for every model. Text-to-SQL scored 48.3 %, 70.0 % and 100.0 % on them. After an LLM added three models, the layer answered every question. (B)
- Failure modes, in the post's words: "With text-to-SQL, failure looks like a plausible but incorrect answer." The semantic layer "never silently returns wrong data" and fails "like an error message". (B)
- Text-to-SQL worked only because "we loaded the entire schema as context, which isn't practical for larger datasets." (B)
- Caveat: the benchmark is small (11 questions) and covers one dataset. (M)
- For Jarvis: the recipes are a semantic layer, in which the model picks parameters and code computes. The lesson is that coverage, not the model, sets the ceiling. A question outside the recipes should produce an honest "I can't compute that yet", never a guess. (M)

### 1.2 Production "ask your dashboard" assistants

- **Looker + Gemini.** Google says the agent is grounded in the LookML semantic model plus agent instructions. It also offers "golden queries", which pair a natural-language question with a verified Looker query, to reduce ambiguity. (B\*) https://docs.cloud.google.com/looker/docs/2604/conversational-analytics-overview?hl=en
- Google claims the semantic layer cuts data errors in gen-AI natural-language queries "by as much as two thirds". The claim comes from internal testing with an unstated baseline. (B\*) https://cloud.google.com/blog/products/business-intelligence/how-lookers-semantic-layer-enhances-gen-ai-trustworthiness
- **Power BI Copilot.** "Verified answers" are author-approved visual answers that trigger on set phrases. They are stored on the semantic model, so they apply to every report that uses it. Authors add AI instructions and a simplified schema, then mark the model "Approved for Copilot". Microsoft states that these features cannot ensure a specific output every time because AI behaviour is not deterministic. (B\*) https://learn.microsoft.com/power-bi/create-reports/copilot-prepare-data-ai-verified-answers ; https://learn.microsoft.com/en-gb/power-BI/create-reports/copilot-prepare-data-ai-faq
- **Tableau Pulse.** Insights are typed: Unexpected Values (formerly Unusual Change), Top Contributors, Concentrated Contribution, Top Drivers and Top Detractors, and Current Trend. All are computed over a defined metric. (B\*) https://help.tableau.com/current/online/en-us/pulse_insights_platform_insight_types.htm ; https://help.tableau.com/current/api/rest_api/en-gb/REST/rest_api_ref_pulse.htm
- **QuickInsights**, the Microsoft Research work released in Power BI, has eight insight types, including top one, attribution, outlier, trend and correlation. It was evaluated on 447 real datasets with user studies. (B\*) https://www.microsoft.com/en-us/research/uploads/prod/2019/05/QuickInsights-camera-ready-final.pdf
- **ThoughtSpot Sage:** not read in this pass, so no claim is made.
- Common pattern: a curated model of measures and dimensions, plus a bank of verified question → query pairs, plus typed insights computed by code. The model's job is to map the question onto that structure and to phrase the result. (M, from the four entries above)

### 1.3 Compute in code, verbalise with the model

- Program of Thoughts (Chen et al.) has the model write a program and an interpreter run it, because LLMs "are prone to arithmetic calculation errors". Across five math word-problem datasets and three financial-QA datasets, the average gain over chain-of-thought is "around 12 %", in both few-shot and zero-shot settings. (B\*) https://arxiv.org/abs/2211.12588
- PAL and the ToTTo / table-to-text faithfulness work were not read in this pass, so no figures are given for them.
- Jarvis already follows this split (repo):
  - `insight.ts` computes ranks, gaps against the median, period change, largest relative gaps, unusual points and shares "by code with explicit rules (never by the model)".
  - `numbergate.ts` rejects any spoken figure that code did not supply, including figures spelled out in English or Tamil words.
- Gap: a multi-step question still has to fit one recipe. There is no way for the plan to say "take result A, subtract result B, rank" and have code do it. (M)

## 2. Comparisons ("compare everything")

### 2.1 Ranking which differences are worth saying (Tang et al., SIGMOD 2017, Microsoft Research co-authors)

Source: https://www.microsoft.com/en-us/research/publication/extracting-top-k-insights-multi-dimensional-data/ (text read from the PDF at https://web.comp.polyu.edu.hk/csmlyiu/conf/SIGMOD17_insights.pdf)

- An insight is a sibling group (a subspace broken down by one dimension) plus a composite extractor plus a type. (B)
- The extractors are Rank, % (share of the group's sum), avg (difference from the group average) and prev (difference from the previous value along an ordinal dimension). The authors recommend depth 2 or 3, which they liken to first- and second-order derivatives. (B)
- Score = Imp × Sig. Impact is the subspace's share of the whole total, normalised to [0, 1], which the paper calls "the market share of S". Significance is 1 − p under a null hypothesis for that insight type. (B)
- Point insight (one member stands out): the null is that the values follow a power law with Gaussian noise. The paper fits the other values, takes the top value's residual and computes its p-value. Shape insight (trend): it fits a line and sets Sig = r² × (1 − p) on the slope. (B)
- Non-monotonic: a member with no insight at the top level can have one in a sub-slice. The paper's example is brand T overall vs brand T × SUV. (B)
- For Jarvis: "compare everything" should enumerate candidates in code, for example:
  - zone × {dept, kind, severity} × {count, share, pending rate, closure time} × {this vs previous period};
  - score each candidate as impact × significance;
  - speak the top one or two and show the rest ranked on screen.
  This also covers the case of a small zone with a large change: impact keeps it from outranking a large one. (M)

### 2.2 Contribution: drivers, detractors, concentration

- Tableau Pulse definitions (B\*, Tableau URLs in 1.2):
  - Top Drivers are the members that "changed the most in the same direction as the observed change in the metric". Top Detractors changed most in the opposite direction.
  - Concentrated Contribution fires when a few members make up a majority ("50 % or more") of the metric.
- Jarvis already has this (repo, `recipes/adtributor.ts`):
  - explanatory power, a segment's share of the total change (shares sum to 1, and a segment that moved against the total has a negative share);
  - surprise, the Jensen-Shannon term of the share shift;
  - an exact conditional test for whether two Poisson counts differ, with a minimum count.
- Gap: these tools feed "what changed" and "explain". They are not yet a general compare ranker across departments, kinds and periods. (M)

### 2.3 Rules for saying a comparison (M unless marked)

- Compute every difference, share and ratio in code. The model only picks the frame (what against what) and the linking words.
- Say counts and shares together when sizes differ ("Adyar has more, but a smaller share is pending"). A raw count largely measures the size of the place.
- When both counts are small, use the existing Poisson test and say "about the same" rather than naming a winner.
- Use "linked with", "at the same time as" and "along with", never "because of". Tableau says its statistical explanations are "not causal" and that an algorithm cannot tell whether A causes B or B causes A. (B\*) https://help.tableau.com/current/online/en-us/explain_data_explained.htm

## 3. Why-questions over operational data

- Tableau Explain Data (B\*, URL above):
  - A value counts as expected if it falls within the 15th-85th percentile range that its model predicts.
  - Candidate explanations are scored by trading complexity against how much variation they explain.
  - Explanation types include extreme values (one outlier), number of records (an average moved because the count did), and unvisualised dimensions.
  - It is "not a statistical testing tool" and needs domain knowledge to interpret.
- Mapping to grievance data (M):
  - "Why is Adyar up?" splits into three parts:
    - where the rise sits, by department, kind and ward (Adtributor);
    - whether it is one record type or many: extreme value, or a count effect;
    - what moved at the same time: rain, news, a closure campaign. Jarvis's `explain.ts` already says rain "as a thing that happened nearby, in time, never as the cause" (repo).
  - "Why is department X slow?" can be answered only as far as the record goes: where the pending cases sit, their age, and their reopen pattern. Staffing, budget and contractor causes are not in the data and must be said to be outside it.
- Causal-language guard (M): a lint on each spoken line, in the same spirit as `speechcheck.ts`. It rejects "because / due to / caused / led to / result of" and the Tamil forms (காரணமாக, ஏனெனில், விளைவாக, ஆல் ஏற்பட்ட). The exception is a reason written in the record itself, such as a recorded closure reason, quoted as the record's reason.
- Each why-answer ends with one clause on what the data cannot tell, in the voice's register ("the record doesn't say why staff were slower") (M).

## 4. Multi-step questions and follow-ups

### 4.1 What the benchmarks show (SParC, CoSQL)

- Question match (QM) scores single questions. Interaction match (IM) scores a whole conversation and is 1 only if every turn is right. (B\*) https://arxiv.org/pdf/2203.07376v1
- Results reported:
  - Original SParC paper: the best model reached 20.2 % per question and under 10 % per interaction. (B\*) https://preview.aclanthology.org/credits/P19-1443
  - HIE-SQL: SParC 64.6 % QM and 42.9 % IM; CoSQL 53.9 % QM and 24.6 % IM. (B\*) https://arxiv.org/pdf/2203.07376v1
  - Performance degrades on later turns. (B\*) https://liner.com/review/sparc-crossdomain-semantic-parsing-in-context
- The CHASE authors note that only 32 % of CoSQL questions depend on context. Context-independent questions make up 48 % of SParC and 68 % of CoSQL. Measured accuracy on these benchmarks therefore overstates follow-up skill. (B\*) https://preview.aclanthology.org/moar-dois/2021.acl-long.180.pdf
- Lessons (M):
  1. Errors compound across turns, so the state ("what are we talking about") should live in code, not be re-inferred by the model each turn.
  2. Score Jarvis on chains of 3-4 turns (IM), because per-turn scores hide the collapse.
  3. Build test chains where every turn after the first depends on context.

### 4.2 Jarvis today (repo)

- `frame.ts` resolves "and in Adyar?", "why?", "the second one", "compare with last month", "same for Ambattur", "only severe" and "no, Anna Nagar" in code, before the fast lane.
- `register.ts` holds the entities on screen in display order (ordinals in English and Tamil), the slots carried from the last request, and the last answer's provenance. It is passed to the planner as untrusted data of at most about 300 tokens.
- Gap (M): the register knows what is on screen, but not the last result's shape: the plan that produced it, and its rows as a table.
  - With both, "and last week?" re-runs the same plan with one slot changed.
  - "the top one" becomes the first row of the last result.
  - "compare that with Teynampet" reuses the same measure and frame with a new member.

### 4.3 Decomposition (M)

- Allow a plan of at most 3 steps. Each step is either a recipe call or one whitelisted operation on earlier steps' tables: diff, ratio, share, rank, top-k, filter, join-on-key.
- Code checks the plan against a schema and runs it. Only the final fact sheet reaches the voice.
- This is the Program-of-Thoughts idea with a closed operation list instead of free Python, so the dbt "fails as an error, not a wrong number" property still holds.

## 5. Abstention: knowing the data does not hold the answer

- TrustSQL (B\*) https://arxiv.org/abs/2403.15879v2:
  - A model either answers or abstains. Abstention covers both unanswerable questions and answers that are likely wrong.
  - A reliability score rewards correct answers and correct abstentions, and penalises wrong answers and answers to unanswerable questions, with a penalty factor c.
  - "None of the methods surpass the reliability performance of the naive baseline, which abstains from answering all questions" under the penalty settings tested.
- The same benchmark's unanswerable questions were used in the EHRSQL 2024 shared task. (B\*, same URL family)
- dbt's point applies here too: a typed layer turns most unanswerable requests into a visible error rather than a wrong figure. (B, 1.1)
- An answerability check for Jarvis, run in code after planning and before speaking (M):
  1. **Outside the data:** every measure and dimension in the plan must be in the catalogue. Staffing, budgets, contractor names and the reason a case is late are not.
  2. **Outside the period:** the dates must lie inside the data's range.
  3. **Outside the place:** `outside.ts` already lists places outside Greater Chennai (repo).
  4. **Ambiguous:** "that one" with two candidates gets a short question back, not a guess.
  5. **Causal or opinion asks:** answer only the descriptive part and say the rest is outside the data.
- Partial answers (M): answer the parts that pass, say the failing part in one clause, and send only outside-world facts to the web reader:
  - outside-world facts are news, rainfall, government orders, public population figures, and must be named with their outlet (see `v6-research/40-news-web.md`);
  - never look up the console's own figures on the web.

## Gaps in this pass

- Not read: ThoughtSpot Sage, PAL, ToTTo or other data-to-text faithfulness studies, QuickInsights' scoring formulas, and any vendor's published Copilot or Gemini accuracy figure beyond the Looker claim.
- Figures marked B\* come from search excerpts.

## Recommendations for Jarvis v7 (ranked)

The latency and token notes are qualitative. Nothing here was measured.

1. **A metric catalogue plus one generic "ask" recipe (semantic-layer pattern).**
   - What: a closed list of measures (count, open, pending, overdue share, median closure time, reopen rate…) × dimensions (zone, ward, dept, kind, severity) × filters × period × compare-to. The planner fills one typed object and code runs it. Golden question → plan pairs, which the bank can hold in English, Tamil and Tanglish, act both as retrieved few-shot examples and as regression tests (Looker golden queries, Power BI verified answers).
   - Benefit: covers the long tail of "any question" without SQL. An unknown measure fails as an error, never as a figure (dbt).
   - Cost: no extra model call. The planner prompt grows by the catalogue and a few retrieved pairs (measure before adopting).
   - Risk: the model picks a near-miss measure ("pending" vs "overdue"). Mitigate with the golden pairs and by showing the measure's name on screen.
2. **A code-side answerability gate with partial answers.**
   - What: the five checks in §5. Answer what passes, say in one clause what the data cannot tell, and send only outside-world parts to the web reader with the outlet named. Score live runs with a TrustSQL-style penalty, so a wrong figure costs more than "I can't tell from the record".
   - Benefit: directly targets the "hallucinated figure is a defect" rule. It also makes "I don't know" a scored success.
   - Cost: pure code, with no model call. It adds a web call only for outside parts.
   - Risk: an over-strict gate refuses answerable questions. Track the abstention rate next to accuracy.
3. **A "compare anything" ranker.**
   - What: enumerate candidate statements in code (§2.1) using the existing `insight.ts` extractors, `adtributor.ts` explanatory power and surprise, and the Poisson test. Score each as impact × significance, say the top one or two with counts and shares, and show the full ranked table. Speak "about the same" when the test does not flag a difference.
   - Benefit: one mechanism for zones, departments, periods and kinds, and the voice says what matters, not the first row.
   - Cost: no model call. The enumeration is bounded by zones × a few dimensions × a few measures, restricted to the asked scope (M).
   - Risk: a statistically odd but operationally trivial line wins. Cap the candidates to the asked scope and keep the impact factor.
4. **Multi-step plans over a closed operation list.**
   - What: at most 3 steps (recipe calls plus diff, ratio, share, rank, top-k, filter, join), checked and run by code, and verbalised from the final fact sheet (Program-of-Thoughts without free code).
   - Benefit: answers "which department got worse in the zones that improved?" without a new recipe.
   - Cost: the planner's output grows a little, and execution is code-time only. Still one model call.
   - Risk: invalid plans on the smaller Groq models. Validate with the schema, fall back to the single-recipe plan, and log it.
5. **Follow-ups that remember the last plan and its rows.**
   - What: extend `register.ts` with the last executed plan and its result table, so a follow-up is the last plan with one slot changed or one row picked. Add 3-4-turn chains to the live set and report interaction-level accuracy beside per-turn accuracy (SParC and CoSQL show the gap).
   - Benefit: "and last week?", "the top one" and "same for Adyar" stop depending on the model re-reading the context.
   - Cost: a slightly larger register line, kept within its about-300-token cap.
   - Risk: stale state after a topic change. Reset the plan when a new measure or recipe is named.
6. **Why-answers in three parts, with a causal-word lint.**
   - What: answer in three parts: where the change sits (Adtributor), what is linked in time, and what the record cannot tell. Lint each spoken line, in English and Tamil, for causal verbs unless the cause is a recorded field.
   - Benefit: honest why-answers that a Collector can act on without over-reading them.
   - Cost: the lint is code. The three-part answer is a template, not an extra call.
   - Risk: stilted speech. Keep one linking clause per part and test with the voice rules.
