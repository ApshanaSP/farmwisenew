# Jarvis v8: understands like the best assistant

This file is the v8 brief (part 1, as the session that started this build gave it, 18 Nov 2026), then the research-backed plan (part 2) and, at the end, what was built and the results against the targets. The brief wins over anything else, including older briefs; where it is silent, the v7 and v6 briefs' rules hold (`docs/jarvis/JARVIS_V7.md`, `docs/jarvis/JARVIS_V6.md`).

## Part 1: the brief

Jarvis is the voice assistant inside the District Collector of Chennai's console (`chennai-grievance-portal-main/`, Next 15 / React 19; English, Tamil, Tanglish; "Hey Jarvis"). v7 (branch `claude/jarvis-v7-upgrade-00072d`, tip `22304da4`, not in main) added an "aide": the screen's facts by code, one streamed model call writing 2-4 sentences, a code checker on every sentence before it is spoken. Results (`chennai-grievance-portal-main/eval/RESULTS.md`, v7): a blind judge preferred v7's answers to v6's 35-2 on the holdout; live-60 understanding 46/60 (v6 45/60); about 3 sentences in 115 overstated; the first spoken word about 1 s later than v6 with Claude Haiku writing. The owner tried it in Edge and says the answers are good but understanding is still poor, and is very tired: they want one finished, self-tested, top-class build and do not want to run things again. The owner allowed Claude on 17 Nov with a US$10 ceiling (`JARVIS_CLAUDE_BUDGET_USD=10`). They now want Claude Sonnet for the final testing (Haiku or Groq while building), and Sarvam AI considered for listening (speech to text) with a budget of up to Rs 500, which they will buy at the final stage only.

Goal, in the owner's words: "think like the world's best AI assistant", understanding "very high", "more powerful", "don't make me run again". Work like the v7 build did, phases logged in `docs/thunai/BUILD_LOG.md`, but finish everything, including the testing.

### The owner's own examples (each a defect: a failing test first, then the fix; then the same check live)

1. "Open the Supreme Court news on Palikan" (probably Pallikaranai) does not open it: Jarvis expects a number or "read the full news". A short request naming a story by its topic, place or outlet ("open the Supreme Court news", "the Pallikaranai marsh story", "read The Hindu's piece on the Metro") must find the matching item in the news on screen or in the dashboard's stored news (`search_records`, kind news), open it and brief it. Confirm from the store what "Palikan" was.
2. Short news questions get "it's not in the data of the Chennai console". News and current-affairs questions must search the dashboard's news first, then the allowed outlets' feeds (v7's `gap.ts` path), and refuse only what is truly outside the district and absent from both. Find which lane says it and fix the routing.
3. Jarvis says "On it" too often: find every "On it" acknowledgement (wake replies, acks, Tamil equivalents) and replace it with something better or with nothing; never the same filler on every turn.
4. Spoken English is sometimes answered in Tamil. Answer in the language of the Collector's own utterance on that turn (Tamil script or Tanglish -> Tamil; English -> English), whatever the console's language setting or the last turn's language, and whatever Whisper mislabels: check the transcript's script and words, not only the detector's label.
5. When the Collector is talking to someone else in the room, Jarvis must not answer. Strengthen the addressee decision (v5/v6's ambient work): no name, a third person addressed, or speech that is not a request to Jarvis -> stay silent and listening. Measure false wakes and missed requests.

### Understanding, across the board

- Research first (subagents allowed, at most five at a time; notes in `docs/jarvis/v8-research/`): how the best assistants resolve intent, references ("that one", "the second story", "the Adyar one"), ellipsis and follow-ups, and topic and entity search over news and records; planner prompt and tool design for Claude Sonnet 5.5 and Haiku 5.5; Tamil and Tanglish.
- Then build: entity and topic resolution over everything on screen and in the store (cases, news, zones, places, departments, outlets, people named in news); a stronger planner path for hard or ambiguous turns (Sonnet as the "deep" model when the owner's key is on, with Haiku or Groq for fast turns, and a clear rule for which model a turn gets); conversation memory for follow-ups; clarifying questions only when truly ambiguous. Keep v7's grounding: code checks every spoken figure, name and time; a hallucination is a defect.
- Measure understanding before and after on sets built first: a dev set for tuning, plus a new hashed holdout of realistic short, loose, spoken requests in English, Tamil and Tanglish (the owner's examples, news-by-topic, references, follow-ups, speech addressed to someone else, and English that must stay English). Keep v7's `eval/holdout2` live-60 as the regression check: never read its rows, read only the runner's printed summaries, run it once at the end. Never touch `eval/holdout3`.

### Sarvam AI (the owner buys at the final stage; no account, no call to the paid API)

- Research Sarvam's speech to text for Tamil, English and Tanglish: accuracy evidence, latency, streaming, pricing in rupees, data use and licence. Design and build the integration behind a flag, off by default, as one more hearing path beside Groq Whisper (or a fallback for Tamil), with mocked tests and recorded-fixture tests.
- Give the owner a budget: what Rs 500 buys (hours of audio, number of turns), what the final test needs, and a ready-to-run test plan for when they buy the key.

### Claude

- Ceiling: US$10 in all (`JARVIS_CLAUDE_BUDGET_USD=10`), counted in `data/thunai/claude-budget.sqlite`; record the spend before and after. While building, use Haiku 5.5 or the free Groq and Gemini tiers. **The final tests run with Claude Sonnet 5.5 leading** (the owner asked for it), labelled as such, with a cost estimate first; if the remaining ceiling cannot cover them, run what fits and say so. Never run `src/lib/ai/claude.live.ts`, `src/lib/thunai/claude.v4.live.ts` or `src/lib/thunai/deploy.live.ts`. Use `JARVIS_LIVE_CLAUDE=1` for runners and raise `JARVIS_CLAUDE_DAY_TOKENS` when a run needs it.

### Standing rules (unchanged from v6 and v7)

- Git: never push to `main`, open no PR, push only this branch. Stage explicit paths only, never `git add -A` or `commit -a`. `data/i18n/*` and `data/embeddings/*` never go in a commit. Commits start with `jarvis8(<phase>):` and end with the attribution line. Full answer rows that carry case titles (a citizen's own words) stay local; commit summaries.
- Tests: every defect fix gets a failing-first test.
- Keys: never print or commit a key; never open `.env` files.
- Services and privacy: no new accounts; permissive licences only; no audio stored; nothing personal in any web search or any request to an outside service.
- Look: the HUD and "Hi Jarvis" stay as the owner sees them; any visible change needs before and after stills and a video. Apshana's console work is final.
- Live runs: `LIVE_GAP_MS=20000`, and check the quota ledger first (`node scripts/jarvis6/ledger-left.mjs`); never fill a missing run with an estimate.
- Builds rewrite `next-env.d.ts` and `tsconfig.json`: restore both before each commit.

### Done means

- Every example above fixed and shown live on the real path (`tests/e2e/real6.spec.ts` with synthetic clips, real providers), not only in unit tests.
- Understanding measured before and after (the new holdout once at the end, live-60 once at the end), the blind judge against v7, latency (wake, command -> screen, question -> first word) no worse than v7, each figure with n, p50 and p90.
- An independent read-only check before the finals (three reviewers: code, wiring with privacy and spend, the numbers against the result files), every finding fixed test-first.
- Gates green: full unit suite, tsc, lint, next build, the QA gate `bash tests/qa/pass7/gate-fast.sh` (on a clean tree), the Jarvis browser specs (`mode`, `bargein`, `hold`, `vad`, `vadfake`, `e2e-latency`, `hud`, `aide7`).
- Write-ups: v8 sections in RESULTS, HANDOVER (owner decisions first), BUILD_LOG and DEMO; a ready-to-run production build the owner can open with `start-fast.bat` (rebuilt on the final code); the branch pushed; a memory note for v8.
- Report: commits and the pushed tip first, then the numbers against the targets, what was not verified, the Sarvam budget, and the Claude spend.

### What the owner's own session showed (18 Nov, 20:05-21:21 IST, read from the local audit log, not committed)

The owner's Edge session tonight is in the copied `data/thunai/audit.jsonl` (local only). Among its turns: "Open the news." (the console's news panel opened) then "Open that one, that's Supreme Court order." (answered by the rules, no story opened); a Hindu headline read aloud with "And that news." (**refused**, the Tamil word in it made the turn Tamil); "Alexa, when was it open?" (answered by the planner: another assistant's name, so said to someone else); one-word or cut-off lines ("What are the", "தயவுசெய்து,", an unclear Tamil word) answered by the planner as if they were requests. The store confirms "Palikan": today's stories on the **Pallikaranai marsh** construction ban (Dinamalar: "Construction ban on Pallikkaranai wetland ordered by the Supreme Court"; The Hindu, Dinamani, LawChakra, Bar and Bench: the Madras High Court sends the litigants to the Supreme Court).

## Part 2: the plan, as built (18 Nov 2026)

The research is in `docs/jarvis/v8-research/`: `10-understanding.md` (references, ellipsis, follow-ups, topic search over news, the ambiguity margin, evaluation), `20-addressee-language.md` (device-directed speech, the reply-language rule), `30-sarvam.md` (Sarvam's speech to text, its price and terms), `40-tamil-matching.md` (Tamil and Tanglish name matching, 36 must-match and 22 must-not-match pairs), `50-claude-models.md` (Sonnet 5.5 and Haiku 5.5, which model a turn gets). Each claim there is marked (B) read in its source or (M) the writer's own inference.

### 1. A code resolver in front of the lanes (`src/lib/thunai/v8/`)

v7's order is kept; v8's lanes run first, in the browser (`v8/browser.ts`, the same function the evaluation runs):
- **A story by its topic** (`news8.ts`, `newsfind.ts`, `match.ts`): "open the Supreme Court news on Palikan", a headline read aloud, "the Pallikaranai marsh story", "read DT Next's piece on the water deficit", "the Nungambakkam subway one, open it", in English, Tamil and Tanglish. The request's own verbs, news nouns, ordinals and fillers are taken out; each topic word is matched to every story's words by a Tamil-loose key (th/t/d, zh/l, sh/s, long vowels, doubled letters, case endings stripped, Tamil script romanised), Jaro-Winkler with an edit-distance ceiling, a prefix rule for a name cut short ("Palikan", "Palikana") and English word forms ("inauguration" / "inaugurated"); weighted by how rare the word is; a story on screen gets a small lead; a district place the request names vetoes a story that does not mention it. Candidates: the stories on the screen, then the dashboard's stored news of the last week (news outlets' reports only, as the news reader reads them). Several outlets' reports of one event are one story; within it the report in the request's language is read (an English request gets the English report). Another close story is offered in one line ("say 'the other one'"), never a question back (research 10, recs 5-7). The server reads it through the news route (`{ find }`), as v7's read.
- **A news question** ("any news on the cyclone?", "what's the news on the Supreme Court?", "பள்ளிக்கரணை பற்றி செய்தியில என்ன வந்திருக்கு?"): the same search; the best story is read; nothing in the dashboard's news, then the allowed outlets' feeds (v7's gap path: fixed addresses, no query); nothing there either, said plainly in the Collector's own words. A news question needs a news word or an outlet; the console's own reports ("the weekly report") and pages ("open the news panel") stay out.
- **References** (`refs8.ts`): an ordinal in three languages ("rendavadhu news ah padinga", "ரெண்டாவது சம்பவத்தைத் திறங்க", "the third news") and "the Teynampet one" on a list; a count ("the first five") and v7's own list commands keep their meaning.
- **Follow-ups**: "since when?" and Tamil/Tanglish forms with a case open (`asks7.ts`), "more on it" and "the other one" after a found story (forgotten on any other turn).

### 2. The owner's five examples

1. A story by its topic: above. 2. Short news questions: above; the resolve lane's "I have no data on X" no longer answers a news question or a Tamil "which department" (`entities.ts`). 3. "On it": a sentence with no topic of its own gets no spoken filler (the bar shows that Jarvis is working); a topic line is never said twice running; the 10-second line rotates (`stagelocal.ts`, `turnstate.ts`). 4. The reply's language is the language of the Collector's own words on this turn (`lang8.ts`: Tamil letters, or a Tamil word ending the clause, or more Tamil than English grammar words: Tamil; else any English word: English; neither: the last language the Collector used, else English), never the ears' label or the console's setting; at the ears, two Whisper decodes that are translations of each other are weighed by their confidence alone (`stt.ts choose`). 5. The addressee gate (`addressed.ts sideTalk8`): another assistant ("Alexa, ..."; also in Tamil letters), a person named or titled with a comma ("Ramesh, ...", "Madam, ..."), an errand for a person ("call him back", "tell the DRO"), a filler or a doubled acknowledgement, a line cut off before its point, one unknown word: silent and listening; a yes while Jarvis waits for one is an answer; the first sentence after "Hey Jarvis" is the call's own request.

### 3. Which model a turn gets (`deep8.ts`, `llm.ts`)

No model for what code settles (most turns). The fast model (Haiku 5.5 with the owner's key, else Groq) for the planner's ordinary turns and the aide's writing. The deep model (Sonnet 5.5, `JARVIS_DEEP_MODEL`) first on a hard or unclear planner turn (an analysis question, a long or many-part request, a reference with a screen behind it), and once more when the fast plan is no answer; one deep call a turn at most, at most 8 s before the next rung. The finals run with Sonnet leading every Claude call, as the owner asked.

### 4. Sarvam (`sarvam.ts`, `docs/jarvis/SARVAM.md`)

`saaras:v4` in `codemix` mode, behind `JARVIS_STT_SARVAM` (`tamil`, `primary`, `shadow`; off by default and without `SARVAM_API_KEY`), never on room audio, falling back to Whisper on any error or after 2.5 s; mocked and synthetic-fixture tests only (no key, no call).

### 5. Evaluation, built before tuning

The dev set (`eval/v8/dev`, 105 requests, for tuning) and the holdout (`eval/v8/holdout`, 111 requests written by a helper that saw neither the code nor the dev set, hashed before any fix: `eval/v8/HASHES.txt`) cover the owner's examples, news by topic, news questions, references, follow-ups, side talk, language, commands, questions and outside; each request with the screen it is said over, earlier turns, the open mic's timing and the ears' label. The runner (`v8/eval8.live.ts`) sends each through the addressee gate, the browser's lanes and the server's round on the dry-run store. v7's side is measured from v7's own commit (`22304da4`, a separate checkout), not through the rollback switch. The owner's examples run on the real path (`real6.spec.ts` part `owner8`).

### 6. Flags

`JARVIS_UNDERSTAND=v7` (and `NEXT_PUBLIC_JARVIS_UNDERSTAND=v7` in the browser build) turns every v8 understanding change off. `JARVIS_DEEP_MODEL` (default `claude-sonnet-5-5`; `off`), `JARVIS_DEEP_MS` (8,000), `JARVIS_STT_SARVAM` (off), `JARVIS_SARVAM_TIMEOUT_MS`, `JARVIS_SARVAM_DAY_S`, `JARVIS_SARVAM_KEYTERMS`.
