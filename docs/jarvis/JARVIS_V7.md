ultracode.

# Jarvis v7: answers like a top aide

This file is the v7 brief (part 1, as the session that started this build gave it, 17 Nov 2026), then the research-backed plan (part 2). The brief wins over anything else, including older briefs; where it is silent, the v6 brief's rules hold (`docs/jarvis/JARVIS_V6.md`).

## Part 1: the brief

Make Jarvis answer like a top human aide to the District Collector: it should understand the question, think, and give crisp, accurate, grounded answers. This is a government project, so a hallucination is a defect. Research as widely as you need and redesign whatever needs it; the owner wants world-class work ("act like a world best AI engineer ... think beyond your limit").

### The owner's request (17 Nov 2026), rephrased; quotes are theirs

1. **Keep what works.** Navigation ("go to this page") works, and the speed and the voice are fine now. Do not slow them down or change them.
2. **Incident and news answers are robotic.**
   - "Tell me about this news" and "tell me about the Adyar issue" read out what is on the screen, including unwanted lists such as every district or zone name.
   - The owner wants a **short, crisp, human summary**, the way a real person would brief the Collector: what happened, why it matters, what is being done or stuck, and what needs the Collector.
   - Only say what is important. **Never read aloud what the Collector can already see on the screen**: the screen shows the details, the voice gives the point.
3. **"Use the AI to summarize."** A model writes the spoken answer from the gathered facts; no template reads the screen. Code checks every figure, name and date against those facts before anything is spoken. On a mismatch, re-ask the model or fall back to a safe line. v6's `brief6.ts` grounding checker is a starting point.
4. **Dashboard first, web only for the gap.**
   - Every answer is grounded in the dashboard's own data: incidents, complaints, departments, zones, officers, deadlines, the news panel.
   - Only when the dashboard has nothing on the asked part does Jarvis go to the web, for that part alone, and name the source. The owner's example: "CM Vijay is visiting Adyar" is not in the dashboard.
   - If neither source has it, say so plainly. "Don't hallucinate."
5. **"More powerful, thinking capacity."** Any question about the dashboard should be understood and answered well and accurately: why-questions; multi-step questions; comparisons ("compare everything": zones, departments, periods, categories); follow-ups. Raise accuracy, and measure it.
6. **Response time stays good.** The first spoken words come early (stream an acknowledgement or the first sentence) and the answer is short.

### The Claude key: not used in this build

The owner: "First build this code, after you build it I will test with the Claude key. Don't test until that." So no live Claude call at all:
- Every live server and runner runs with `JARVIS_CLAUDE_OFF=1`. `JARVIS_LIVE_CLAUDE=1` is never set.
- `src/lib/ai/claude.live.ts`, `src/lib/thunai/claude.v4.live.ts` and `src/lib/thunai/deploy.live.ts` are never run (they call Claude whenever a key is in `.env`).
- The `.env` copied in holds the owner's working key.
- Design for Claude Haiku 5.5 leading the planner at the owner's test (the only Claude model allowed to lead, Groq behind it). Claude paths are tested with mocks; live tests run on the free Groq and Gemini tiers.
- At the end, prove `data/thunai/claude-budget.sqlite` did not grow.
- Leave the owner a ready-to-run Claude test plan: commands with `JARVIS_LIVE_CLAUDE=1` for runners, under the US$5 ceiling (`JARVIS_CLAUDE_BUDGET_USD=5`), and what to say to Jarvis.

**The owner's update, 17 Nov 2026, 22:45 IST, in this session:** "use claude api limit 10 dollar". From then on the live runs use Claude Haiku 5.5 leading (the planner and the answer writer), Groq behind it, under `JARVIS_CLAUDE_BUDGET_USD=10` (the owner's ceiling, counted across every caller in `data/thunai/claude-budget.sqlite`; 93 rows, US$0.024195 before the first v7 Claude call at 22:48). Everything before 22:45 was built and run with Claude off, as the rules above say. The finals therefore run with Haiku leading (the owner's deployment), labelled as such; the Groq runs made before are kept and labelled as Groq.

### Where things stand (v6)

v6 is branch `claude/jarvis-v6-build-adbae2` at `736ce5f1`, pushed, not in `main`. This worktree is cut from it. Read first: `docs/jarvis/JARVIS_V6.md`; `docs/thunai/HANDOVER.md` (v6); `chennai-grievance-portal-main/eval/RESULTS.md` (v6); `docs/thunai/BUILD_LOG.md` (v6); `docs/jarvis/DEMO.md`. Code under `chennai-grievance-portal-main/src/lib/thunai/`: `round.ts` (planner rounds), `llm.ts` (the ladder; Haiku leads when a key works; `JARVIS_PLANNER_LEAD=groq` keeps Groq first), `quick.ts` (code lanes), `brief6.ts` (briefings and grounding), `newsask.ts` and `web/*` (the news reader: SSRF guard, robots.txt, allow/deny list in `config/jarvis-web-domains.json`), `stagelocal.ts` (`narrationOf`, the spoken lines built from the screen: the robotic part), `screens.ts`, `mouth.ts` and `chunker.ts` (the voice), `src/components/collector/app/thunai/Thunai.tsx`. Run and measure: `/dev/thunai`; `tests/e2e/real6.spec.ts` with `scripts/jarvis6/`; `.claude/launch.json` (`jarvis-ai-3009` is the dry-run store with AI on).

| Measure | v6 result |
|---|---|
| "Hey Jarvis" → spoken reply | 193 / 210 ms |
| English question → first word, on Groq | 2.9 / 3.7 s |
| Command → screen | 1.0 / 1.7 s |
| News brief | 0.85 / 1.3 s |
| Understanding finals, Haiku leading | live-60 45/60 (v5 on Groq 36/60), Tamil 25/30, new intents 8/30 |

The new intents (explain, changed, howknow, mission, brief, remember, recall) rarely reach their recipes through the planner; handling them in code was never built.

**Quota:** Groq's free tier is 8K tokens a minute and 200K a day per model. On 17 Nov the day was spent; it returns on a rolling 24 h. Run `node scripts/jarvis6/ledger-left.mjs` before every live run, and never fill a missing run with an estimate.

### Standing rules (from the v6 brief, still in force)

- **Git:** never push to `main`, open no PR, push only this branch. Stage explicit paths only, never `git add -A` or `commit -a`. `data/i18n/*` and `data/embeddings/*` never go in a commit. Commits start with `jarvis7(<phase>):` and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Tests:** every defect fix gets a failing-first test.
- **Holdouts:** never touch `eval/holdout3`. Never read the rows of `eval/holdout2`: no `ls` there and no `git status -uall`. The runner may read them; only its printed summaries are read. The holdout finals run once, at the end, on Groq, labelled as such.
- **Keys:** never print or commit a key, never open `.env` files. The v6 worktree's `.env` is copied in without being read.
- **Services and privacy:** no paid services and no new accounts; permissive licences only. No audio stored, nothing personal in any web search.
- **Agents:** at most five subagents at a time.
- **Look:** the HUD and "Hi Jarvis" stay as the owner sees them. Any visible change needs before and after stills and a video. Apshana's console work is final.
- **Live runs:** `LIVE_GAP_MS=20000`, and check the quota ledger first.
- **Builds:** they rewrite `next-env.d.ts` and `tsconfig.json`; restore both before each commit.

### What done looks like

1. **This file first:** the brief, plus the research-backed plan. Research notes with sources in `docs/jarvis/v7-research/`, covering grounded summarisation and its checks, answering over structured data, planner and tool-use design, Claude Haiku 5.5 tool use and prompt caching, spoken-answer style for voice agents, and evaluation and hallucination measurement.
2. **The answer layer.** For incident, news, "tell me about X", why and compare questions: gather facts from the dashboard, and from the web only for the missing part; the model writes a 2-4 sentence spoken answer in an aide's voice, in English and Tamil; code checks every figure, name and date before speaking; the screen shows the details and the voice gives the point; the first sentence streams early.
3. **Evaluation built before tuning:** a dev set (incident, news, compare, why, follow-up and outside-dashboard questions, in English, Tamil and Tanglish, with gold facts); a grounding and hallucination checker; a blind judge for "crisp and human", v7 against v6, as in v6's briefing judge; latency on real providers (Groq), each figure with n, p50 and p90; then the holdout finals once.
4. **Targets:** 100 % grounded (no unsupported figure, name or date spoken); 0 hallucinations on outside-dashboard questions; the judge prefers v7 over v6; understanding at least v6's on Groq; wake, command → screen and question → first word no slower than v6, and aim lower.
5. **Gates green:** the unit suite, `tsc`, lint and `next build`; the QA gate `bash tests/qa/pass7/gate-fast.sh`; the Jarvis browser specs.
6. **Wrap-up:** a v7 section in RESULTS, HANDOVER, BUILD_LOG and DEMO; an independent read-only check of code and write-ups, with every finding fixed; the branch pushed.
7. **Report:** commits first, then the numbers against the targets, then what is not verified, then the owner's Claude test plan.

## Part 2: the plan (17 Nov 2026, after the research)

The research is in `docs/jarvis/v7-research/`: `10-grounding.md` (grounded summarisation and its checks), `20-structured-qa.md` (answering over structured data; why, compare, multi-step, follow-ups), `30-planner-tools-claude.md` (planner and tool use; Claude Haiku 5.5 streaming and prompt caching; Groq and Gemini specifics), `40-spoken-style.md` (spoken answers beside a screen; briefing style; Tamil register), `50-evaluation.md` (judges, statistics, hallucination scoring, latency). Each claim there is marked (B) read in its source or (M) the agent's own inference.

### 1. What is robotic today (measured offline on the dry-run store, no model)

The screens of v6 are good; their words are not. The recipe builds a screen and a code-templated line, and the browser then reads list items aloud (`stagelocal.ts` `narrationOf`, `Thunai.tsx` `narrate(..., auto)`):

| Asked | What v6 does |
|---|---|
| "Explain this news", "summarise the news" | The district's news list for the week, then "12 headlines. Reading them now." and every headline read out, outlet first |
| "Brief me" | "9 points in the brief for the last 24 hours. ...", then every point read out |
| "Tell me about the Adyar issue" | The explain recipe for Adyar (a month): a templated retelling of the top case, field by field |
| "Which department is worst" | "Highest: Greater Chennai Police, 373 incidents. Then Storm Water Drain 137, Roads & Building Permissions 107." |
| "Compare Adyar and Anna Nagar" | "Adyar: 3 severe and 86 open. Anna Nagar: 3 severe and 92 open. The biggest gap is ..." (the screen read back) |
| "Compare everything", "compare this week with last week", "why is Adyar worse than Anna Nagar", "CM Vijay is visiting Adyar, what should I know" | No code lane; the planner, whose answer is again a template over the screen |

### 2. The design: an aide layer between the screen and the voice (`src/lib/thunai/aide7/`)

The screen keeps showing the details exactly as v6 builds them. What is *said* changes:

1. **Facts, by code** (`facts.ts`). From the screen document the recipe built, plus what the record holds that the screen does not show (a case's assignment role, its deadline, the news report's outlet and time; a news item's stored article text and its linked incident), code builds a numbered fact sheet: one short plain-English line per fact, each with its source (dashboard, an outlet, a web site), its relative time said the way a person says it in English and Tamil (computed in IST by code, as `brief6.ts` does), the Tamil names of its zones, departments and outlets, and every derived value precomputed (differences, ratios, shares, rank, direction). The model never computes (10 §rec 1; 20 §rec 3).
2. **The writer, a model** (`writer.ts`, `prompt.ts`). One plain-text streamed call that sees only the question, the answer language, a one-line note of what the screen shows, and the fact sheet. Its output is line-oriented so the first sentence can be checked and spoken while the rest is written: `GAP: none` (or the part of the question the facts do not cover), then two to four `S: <sentence> [F2,F5]` lines. The style is BLUF: the point, why it matters, what is done or stuck, what needs the Collector (40 §rec 1-6): no lists, no field names, no ids, at most two places named, never what the screen already shows, news attributed to its outlet first, polite spoken Tamil for a Tamil turn. The system prompt is fixed bytes (no per-turn text), over 512 tokens so Claude Haiku 5.5 can cache it (30 §rec 4). Ladder: Haiku 5.5 when a working key is present and Claude is on (the owner's test), then Groq qwen3.8-27b, gpt-oss-120b, gpt-oss-20b, then Gemini 3.5 flash-lite; thinking off, temperature 0 (30 §rec 1, 6, 7).
3. **The checker, code, per sentence, before anything is spoken** (`ground.ts`; 10 §rec 2, 4, 5; 50 §rec 1). A sentence passes only if: every number is in the facts it cites (exactly, or hedged with "about", "nearly", "over" within a stated tolerance; ratios and percentages only where code precomputed them); every name (zone, place, department, outlet, person, any capitalised word) is in its cited facts, and a name and the number said with it sit in the same fact (the binding check: "Adyar has 38" when 38 is Teynampet's fails); every time or date word is one code computed for a cited fact; a cause word ("because", "due to", Tamil "காரணமாக") only where a cited fact itself states a cause; direction words against the facts' direction; superlatives only against a rank; no id, field label, markdown or URL; no run of seven or more words copied from a title on the screen; no sentence naming three or more places; at most 30 words; a Tamil answer in Tamil script.
4. **Repair** (10 §rec 3; 30 §rec 3). The first sentence fails: one re-ask naming the problem if there is time before the speaking deadline, else the fallback. A later sentence fails: it is dropped and the answer ends with what passed. No checked sentence by the deadline: the fallback, which is the recipe's own code line (v6's, grounded by construction) cut to its first two sentences, never an item list.
5. **Dashboard first, web only for the gap.** The `GAP:` line (and a code check for names in the question that no fact holds) names the part the dashboard does not cover. For that part alone: first the dashboard's own news reports, then the allowed outlets' own feeds (v6's reader: nothing leaves the server but the feed requests; filtered here by the gap's public words, never a complaint, a name of a citizen or an address), then one checked sentence that names the outlet and when. Nothing found: "I have nothing on that in the dashboard or in today's news" with the gap said in the question's own words. Neither source is ever filled in by the model (20 §rec 2; 50 §rec 4).
6. **Speaking.** The screen goes out first (as now), then each checked sentence as a `TEXT_MESSAGE_CONTENT` event, which the browser's existing queue speaks at once. After an aide answer nothing is read item by item (the Collector can still say "read them"). The browser's number gate allows the answer's own checked figures.
7. **Which turns.** Questions get the aide: a case, the situation of a place, explain, why, what changed, compare, the news and a news item, the brief, rankings, performance, advice, trends and readings, and the planner's answer screens. Commands keep v6's short lines and v6's speed: navigation, filters, sorting, "open the third", maps, drafts.

### 3. Understanding: more questions reach the right facts (`quick.ts`, `frame.ts`, a new `asks7.ts`)

Code lanes, test-first, tuned on dev sets only (20 §rec 3-6):
- "Tell me about / explain / summarise this news (article, story)" with news on screen: the item in focus, else the first, read with its stored article text and its linked incident; without news on screen, the day's news summarised (not read).
- "Tell me about the X issue (problem)": the open incident that matters most in X, with X's situation as context.
- "Compare everything", "compare all zones (departments)", "compare this week with last week", "why is A worse than B": the compare screens (zones, departments, periods, kinds) with code ranking which differences are worth saying (impact times significance, `adtributor.ts`, `insight.ts`); "about the same" when the test flags no difference; why-answers say where the change sits, what is linked in time, and what the record cannot tell.
- Multi-part questions ("tell me about Adyar and what the papers say") gather the facts of up to three recipes in parallel for one answer.
- Follow-ups keep v6's frame ("and in Adyar?", "the second one", "why?"), and the writer gets the last answer's topic.

The planner prompt is not changed: understanding on Groq must stay at least v6's, and every planner answer screen now also goes through the aide.

### 4. Evaluation, built before tuning (`eval/v7/`)

- **Dev set** (`eval/v7/dev/`, for tuning): about 72 items, 12 in each of incident, news, compare, why, follow-up and outside-dashboard, in English, Tamil and Tanglish, each with the screen it is asked on and gold facts computed by code from the dry-run store; outside-dashboard items mix unknown, false-premise and web-answerable ones (50 §rec 2, smaller for the free tier's daily tokens).
- **v7 answer holdout** (`eval/v7/holdout/`): about 60 items made the same way before any tuning, hashed, and run once at the end.
- **The checker proven first:** planted errors (a wrong number, a swapped name, a wrong time, an invented cause, an invented person) must all be caught; false rejects counted on checked good answers (50 §rec 1).
- **Grounding and hallucination:** every spoken sentence of every run re-checked by an offline audit against the gold facts; outside-dashboard answers scored correct / abstained / hallucinated (CRAG-style), the zero reported with its Wilson bound (50 §rec 4).
- **Blind pairwise judge:** v7 against v6's spoken answer, each pair in both orders, a win only if both orders agree, two free judge families where the quota allows (Gemini 3.5 flash-lite; a Groq model other than the writer's), exact sign test (50 §rec 3).
- **Latency on Groq** with the real-path spec: first sound, first word of the answer, command → screen, wake; n, p50, p90; v6 and v7 bundles on the same clips (50 §rec 5).
- **Understanding:** the live-60 holdout once at the end on Groq, paired by exact McNemar with v5's Groq final (v6 changed no planner and ran its finals with Claude, so v5's Groq run is the Groq baseline).

**As built (17 Nov):** the dev set is 48 questions and the answer holdout 48 (8 a kind), not 72 and 60: at about 1,600 Groq tokens a writer call, plus v6's planner turns for the comparison, the larger sets would not fit the free tier's day beside the latency runs and live-60. The holdout was hashed at 21:04, before any live run.

### 5. Claude Haiku 5.5 at the owner's test

The writer streams from Claude through the official SDK under the owner's spend ceiling (`claudebudget.ts`, `billed()`), thinking disabled, a cached system prompt, `max_tokens` about 300; a first-token watchdog hands a slow call to Groq. Tested with mocks only (request bytes of the cached prefix identical across turns, the budget path, the fallbacks). The owner's test plan goes in HANDOVER.

### 6. Flags (all default to v7's behaviour; each restores v6's)

`JARVIS_ANSWER` (`v7`; `v6` speaks v6's lines and reads the items), `JARVIS_AIDE_WEB` (on; `0` no web look-up for a gap), `JARVIS_AIDE_LEAD` (as the planner's lead: `groq` puts Claude after Groq for the writer too), `JARVIS_AIDE_DEADLINE_MS` (the first checked sentence's deadline before the fallback).

### 7. Risks

- **Groq's free tier:** a writer call is about 1.2-1.8K tokens on top of the planner's; per-minute room decides which model writes, and a busy minute means the fallback line.
- **Latency:** on planner turns the writer adds its first-sentence time; the new code lanes skip the planner for the commonest questions, which pays for it. Measured, not assumed.
- **False rejects** shorten answers or bring the fallback; counted per model.
- **Tamil:** model-written Tamil is not checked by a Tamil speaker.

### 8. Order of work

1. This file and the research, committed. 2. The checker and the dev set, with planted-error tests. 3. Facts, prompt, writer, streaming, fallback (mocked tests). 4. Wired into the round and the browser. 5. The new code lanes. 6. Live dev runs on Groq and the judge; tuning on dev only. 7. Latency runs on Groq. 8. The gates. 9. The finals once: the v7 answer holdout and live-60. 10. The write-ups, an independent read-only check, the push.
