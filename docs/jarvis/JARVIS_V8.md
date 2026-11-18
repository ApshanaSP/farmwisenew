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
