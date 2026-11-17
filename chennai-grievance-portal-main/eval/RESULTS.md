# Jarvis mode: results

## v6 (17 Nov 2026)

Branch `claude/jarvis-v6-build-adbae2` from the v5 build at `a7943b2f`; the brief is `docs/jarvis/JARVIS_V6.md`. Every latency below is from `tests/e2e/real6.spec.ts`: a production bundle built with `NEXT_PUBLIC_JARVIS_SPEC=1`, served by `scripts/jarvis6/serve-real.sh` (Claude off, Groq leading, the console's own AI off, the dry-run store with its real cached data), headless Edge with its natural voices, synthetic clips (Windows and Gemini voices, no person) played into the page's microphone, **real providers** (Groq Whisper, the Groq planner ladder, Edge's voices). Each time is from the clip's true last voiced sample. Cells are **n · p50 · p90** (nearest rank). The raw rows are in `eval/v6/latency/`; `node scripts/jarvis6/waterfall.mjs <tag>` and `node scripts/jarvis6/compare.mjs <a> <b>` rebuild the tables.

### Capacity and blocks, before any number

- **Claude:** the owner allowed the key on 17 Nov (US$5 at most, then Groq). It was refused: one tiny Haiku 5.5 call returned 401 "invalid x-api-key"; $0 spent. Every number here is the Groq ladder's.
- **Groq's free tier** (8K tokens a minute, 200K a day per model) set the pace: the planner turns are 20 s apart (`LIVE_GAP_MS=20000`) and the understanding finals waited for the day's allowance to come back (rolling 24 h).
- **Gemini** answered 503 "high demand" on 16 of 34 briefing-judge pairs in the first full run, and its 3.8 speech models stopped after about 20 requests each on the day.
- **Edge's cloud recogniser** (the closed "Hi Jarvis" path) gives empty results under automation: the closed wake can be measured only for the on-device "Hey Jarvis".

### Latency: before and after, on real providers

Bundles, in order (each a commit's code): **phase0** = v5 as handed over (`a7943b2f`); **v6a** = Phase 2 (wake word, wake reply, voice warm-up, STT fixes, short end of turn), quiet 90 ms; **v6b** = + briefing, place lane, news turn; **v6c** = + the first independent check's fixes; **v6d** = + the quiet-meter fix and Tamil's short first chunk; **v6e** = the code before the second check's fixes (the reel: those fixes change no screen); **v6f** = the code after them (the end-of-turn lever runs; then the short-sentence limit became 1.8 s, the setting its third arm measured). Wake clips for the open turns: phase0 cycles eight (three "Hey Jarvis", three "Hi Jarvis" one of them a Gemini voice, one "Hello Jarvis", one Tamil "ஹாய் ஜார்விஸ்"), v6a six (the same without the Gemini "Hi" and the Tamil one), v6c and v6d the three "Hey Jarvis" ones; the rows below compare the same clips.

| Moment, from the true end of speech | phase0 (v5) | v6 | Bundle | Target | Met? |
|---|---|---|---|---|---|
| "Hey Jarvis", Jarvis open -> first audible reply | 18 · 703 · 743 (the tone after Whisper) | **24 · 193 · 210** (the spoken "Yes?") | v6a | p50 ≤ 250, p90 ≤ 400 | **yes** |
| "Hey Jarvis", Jarvis closed -> first audible reply | 0 of 12 fired, 4 of them "Hey Jarvis" (Edge's recogniser gives nothing under automation) | **12 · 163 · 185** (12/12 fired) | v6d | p50 ≤ 250, p90 ≤ 400 | **yes** |
| "Hi Jarvis" / "Hello Jarvis", open -> first audible reply (the same three clips) | 18 · 739 · 869 | 24 · 636 · 826 | v6a | p50 ≤ 250, p90 ≤ 400 | **no** (the on-device model knows only "Hey Jarvis": an owner decision) |
| End of question -> first sound (the end-of-speech earcon) | 36 · 405 · 427 | 36 · 409 · 438 | v6a | p90 ≤ 400 | **no** (detector lag about 75 ms + the 300 ms end-of-turn wait) |
| End of question -> first word of the answer, all | 34 · 3,166 · 5,656 | 33 · 2,864 · 6,343 | v6a | p50 ≤ 900, p90 ≤ 1,500 | **no** |
|   English | 12 · 4,109 · 5,471 | 12 · 2,864 · 3,688 | v6a | | no |
|   Tamil | 11 · 3,428 · 4,318 | 11 · 2,874 · 6,343 | v6a | | no |
|   Tanglish | 11 · 3,128 · 7,578 | 10 · 3,197 · 8,226 | v6a | | no |
|   a place's state in Tamil (code lane) | — | 3 · 3,889 · 4,073 (v6c: 3 · 6,145 · 6,393) | v6d | | no |
|   a news read: the first line's voice ("Reading ETV Bharat's report...", an acknowledgement); the brief's own first sentence | — | 11 · 1,066 · 1,463; the brief 11 · 4,669 · 5,129 | v6b | | no (the first line is not the answer) |
| Simple command -> the screen changes | 3 · 1,192 · 1,194 | 9 · 1,030 · 1,737 (rules lane alone: 5 · 759 · 1,045) | v6a, v6c | p90 ≤ 700 | **no** (the end-of-turn wait and Whisper's round trip, about 330 + 400 ms) |
| Data question -> full answer spoken (its last word) | 34 · 19,943 · 30,842 | 33 · 23,617 · 37,759 (the answer in hand on screen: 34 · 2,188 · 4,200) | v6a | p90 ≤ 4 s | **no** (answers are spoken in full: a briefing, then the screen's points) |
| Barge-in: the voice ducks after the interruption's onset (PCM path, mocked hearing) | v5 START: pause p50 70 / p90 82 (n 8, the same spec; v5 RESULTS) | **8 · 83 · 92** | v6d | p90 ≤ 150 | **yes** |
| The answer is handed to the voice -> its first word | 42 · 1,253 · 1,856 | 37 · 675 · 1,251 (Tamil v6d: 3 · 987 · 1,282) | v6a, v6d | — | — |
| English speech heard as Tamil (Whisper's translation) | 7/12 | 1/12 | v6a | — | — |

Where the remaining time goes (v6a English questions, `eval/v6/latency/v6a-waterfall.md`): detector lag 71 / 96, end-of-turn wait 332 / 366, speech to text 475 / 1,021, the planner 1,210 / 1,226 (n 3 traced), speak() -> voice start 697 / 814. On the code lane the planner is gone but the situation screen's server tools take 1.2-2.6 s on the cached store (all called in parallel already).

**Two end-of-turn levers, on/off on the final bundle** (`.next-v6f`, `V6_PARTS=cmd`, 8 rules-lane commands an arm, the same bundle with a measuring flag per run; `eval/v6/latency/v6f-*-cmd.json`):

| Setting | Screen change | End-of-turn wait (last voiced -> end decided) | First sound (the earcon) | Transcript at the page | Heard in the right language |
|---|---|---|---|---|---|
| short sentence ≤ 1.2 s (the setting until then) | 4 · 805 · 3,557 | 8 · 403 · 455 | 8 · 408 · 460 | 8 · 787 · 1,611 | 6/8 |
| E2 on (early speech-to-text at 150 ms of quiet) | 6 · 763 · 1,811 | 8 · 401 · 425 | 8 · 406 · 430 | 8 · 639 · 1,795 | 8/8 |
| **short sentence ≤ 1.8 s (now the default)** | 6 · 720 · 1,020 | 8 · 281 · 433 | 8 · 286 · 439 | 8 · 701 · 1,008 | 8/8 |

The 1.8 s limit is now the default (`NEXT_PUBLIC_JARVIS_SHORT_UTT_MS=1200` restores the old one); E2 stays off for the room check (it helped the transcript here, 8 a side). The screen column's n is the commands whose screen change the spec could see (a map move is not one).

**Edge's Tamil voice** started later the longer the utterance the first time each text was said (`eval/v6/latency/voiceprobe.json`, warm, n 1 a length): 33 characters 811 ms (the first utterance of the probe, which may add its own delay), 109 characters 2,159 ms, 236 characters 2,833 ms and on its first repeat 3,030; the later repeats started in 171-346 ms at every length (the service keeps what it has said); English 185-564 ms. In the v6c run the Tamil answers began 2.6-3.1 s after they were handed over; with a short first chunk (v6d) 1.0 / 1.3 s. A Tamil answer now starts with a chunk of at most 48 characters.

### News and the web (Phase 4)

| Moment, from the true end of speech (`eval/v6/latency/v6b-news-summary.md`, live outlets) | Reads ("Read the Nth article.") | Web look-ups (Met department, rain, red alert) | Target |
|---|---|---|---|
| Taken by the news lane | 11 / 11 (10 English, 1 Tamil) | 5 / 6 (one clip heard as Tamil went to the planner) | — |
| The server's first line in hand | 11 · 826 · 967 | 5 · 865 · 1,460 | — |
| Its voice starts | 11 · 1,066 · 1,463 | 6 · 1,484 · 1,838 | Phase 2's |
| **The brief in hand (article read and answered)**: 9 of the 11 from the stored article (the brief came with the first line), 2 fetched from the outlet (1,868 the one cold read) | **11 · 854 · 1,304** | 5 · 1,442 · 1,858 | p90 ≤ 4 s: **yes** |
| The coverage brief in hand | 0 (no other outlet had covered these 11 articles) | — | p90 ≤ 8 s: **not measured in the browser** |

Server side, against the live outlets (`eval/v6/news-timing.json`, n 3 a mode): the article's brief p50 368 / p90 915 ms cold, 191 / 204 with the feeds cached; the coverage brief 680 ms (n 1). Safety: 101 tests in `src/lib/thunai/web/` (97 from the module, 4 for a case's report) and 6 for the routes (SSRF in its forms, redirects and DNS rebinding through the pinned connection, caps, robots.txt, the 10-minute memory cache with nothing on disk or in logs, the allow/deny list, hostile pages that tell Jarvis to act, privacy of every outgoing request) plus the turn's own (`newsask.v6.test.ts`).

### Phase 1: the model bake-off (`eval/v6/bakeoff/TABLE.md`, `NOTES.md`)

No free model is both faster than Groq's and as right. Groq qwen3.8-27b and gpt-oss-120b return a planner-sized JSON in p50 1,048 / p90 1,050 and 1,097 / 1,218 ms (n 4 successful calls each; two of six calls each met a 429 at 9 s spacing; `TABLE.md`'s total column counts those fast failures too); Gemini 3.5 flash-lite was right on 11/12 of the dev sentences but takes p50 1,960 / p90 3,062 ms (n 12); Gemini 3.1 flash-lite 11/11 scored, p50 2,088 / p90 3,814; allam-2-7b and gemma could not take the planner's structured output, 2.5 flash-lite is closed to new users. The ladder is unchanged (Groq first, Gemini 3.5 flash-lite last). The speed levers are therefore the code lanes, the wake and the voice, ranked in `docs/jarvis/v6-research/PLAN.md`.

### Phase 3: incident briefings (`eval/v6/brief/set.json`, `src/lib/thunai/brief6.live.ts`)

34 incidents from the cached store (8 with a news report), each briefed by v5 and by v6, in English and Tamil, on the final code (after both independent checks; `eval/v6/brief/set.json`, 17 Nov 17:02 IST). A script checks every figure and name against the record; a rubric scores length, the next step and speech-likeness; a blind pairwise judge (Gemini 3.5 flash-lite, free tier, the A/B order seeded) compares them.

| | v5 | v6 |
|---|---|---|
| Figures grounded in the record | 34/34 | 34/34 |
| Names grounded | 34/34 | 34/34 |
| Has a next step | 34/34 | 34/34 |
| Two to four sentences | 34/34 | 34/34 |
| Ends offering more ("Want the details?") | 0/34 | 34/34 |
| Words, p50 / p90 | 31 / 36 | 42 / 46 |
| Blind judge, English, the judge's record holding the incident's own assignment (n 22 judged) | 5 | **17** |
| Blind judge, Tamil, the same (n 22 judged) | 10 | 12 (about even) |
| Blind judge, English, the record holding the department's directory count instead (n 18 judged) | 6 | 12 |
| Blind judge, Tamil, the record holding the directory count (n 18 judged) | **12** | 6 |

- **Why two judge runs:** since the first independent check the briefing names an officer only from the incident's own assignment ("no officer is named" when there is none). The judge's record still held the department's directory count, so it read "no officer is named" as unsupported (its stated reason in most of the Tamil v5 wins); the record now holds the assignment the briefing reads, and both runs are shown. The briefings are the same in both. 12 (then 16) pairs in each language got no verdict (Gemini 503 "high demand"). Earlier runs, on code before the checks' fixes: English 24-4 and Tamil 18-10 (n 28), and 12-6 and 10-7 (n 18 and 17).
- The judge's reasons when it chose v5: v5 is shorter and plainer (v6 says more: since when, the outlet and when, who has it); v6's mention of a missing officer read as unsupported when the judge could not see the assignment; once a locality v5 named that v6 left out. The script found every v6 figure and name in the record.
- Ten audio samples for the owner: `docs/jarvis/samples/v6/` (README lists what each says).

### Understanding (Phase 5)

- **Diagnosis kept from v5:** the grid selected no planner change; Tamil goes to the wide bundle; strict-mode 400s and Gemini's schema refusals were fixed in v5. With the Claude key refused there was no stronger model to try, and the free Groq allowance was spent on the latency runs and the finals, so **no planner change was made or tuned** in v6.
- **Code lanes, tuned on the dev set only** (`eval/dev200`, no model): the place lane (a place's state asked loosely goes to the situation screen by code): **68/200 → 70/200** right through the code lanes (114 left to the planner). Misses that remain there: a taluk or locality that is not a zone (Velachery, T Nagar), spans no console window holds ("last six months", "since August"), and browser-only controls the runner does not route (theme, language).

- **Side talk, no model, on the final code** (`HOLDOUT=ambient` and `ambient-engaged`, `HOLDOUT_DIR=sidetalk200`, `eval/sidetalk200/results/v6final-*.json`): with Jarvis idle **0/200 acted** (0.0-1.9 %), 60/60 unnamed commands refused, no level B or C act; inside the engaged window (Jarvis's last turn 5 s ago) 58/200 acted (29.0 %, 23.2-35.6), 54/60 commands accepted: the same as v5 (the gate is unchanged in v6).

FINALS-PENDING

### Phase 6: the feel

- The HUD's core pulses on the voice's real word starts (the browser's word boundaries) and on the wake reply's own audio; the look, the layout and "Hi Jarvis" are as the owner sees them. Before/after stills and the headless recording: `docs/jarvis/screens/v6/` (`before-*` on the v5 bundle, `after-*` and `reel.webm` on the final one).

### Gates

| Gate | Command | Result |
|---|---|---|
| Unit suite | `npx vitest run` (on `1cf3d052`) | 504 files, 6,103 passed, 13 skipped, 0 failed (68 s) |
| Unit suite, shuffled, four seeds and two time zones (the QA gate's lane B, final code) | `node tests/qa/pass6/suite.mjs ...` | 6,119 passed in two runs; `firstsentence.v5` failed in the other two under the gate's two-lane load (the same seed alone: 6,119 passed, 0 failed) |
| Type check | `npx tsc --noEmit` | clean (final code) |
| Production build | `npx next build` (the QA gate's, and the measuring bundles v6a-v6e) | green; one break found and fixed on the way (a store module in the browser bundle, `e245a5d9`), now guarded by a test |
| Jarvis browser specs | `npx playwright test tests/e2e/mode.spec.ts tests/e2e/bargein.spec.ts tests/e2e/hold.spec.ts tests/e2e/vad.spec.ts tests/e2e/vadfake.spec.ts tests/e2e/e2e-latency.spec.ts tests/e2e/hud.spec.ts` (dev server 3011, console AI off) | on `1cf3d052`: 39/39 (13.9 min); on the final code: 38/39, the barge-in duck p90 324 ms from one outlier of 8 (the first test after the dev server started; the other seven 66-85 ms); the barge-in spec again, twice: 5/5 each, p90 86 and 85 ms |
| QA gate | `bash tests/qa/pass7/gate-fast.sh` (final code) | tsc, lint, build, pass 7 tests 24/24, guards 39/39, access matrix, browser drive, j1 journey: all EXIT 0; pass 4 suite 2,649 passed, 0 failed (EXIT 1: one vitest worker RPC timeout under load); golden master EXIT 2 against the old baselines, as in v5: v5's own recording to v6's differs in 6 of 3,298 bodies, all in routes v6 did not touch, no status change, no 5xx. Seven QA oracles that pinned v5's briefing wording or missed the news reader's cache moved, listed in `docs/qa/pass7/V6_EXPECTED_CHANGES.md`. Known items from v4 and v5: the seed script's `pii_enc` error, RC-35's load timeout |
| Two independent checks (read-only agents) | — | the first on the code (all findings fixed test-first), the second on the write-ups against their sources and the code since (all findings corrected; the closed same-breath command left to the owner) |

### Acceptance (against `docs/jarvis/JARVIS_V6.md`)

| Brief item | Target | Result | Met? |
|---|---|---|---|
| Phase 0: real baseline and waterfall | measured first | `eval/v6/latency/phase0-*` (48 wakes, 12 commands, 36 questions; 12 closed tries) | yes |
| Phase 1: research and bake-off | bounded research, a ranked plan | four notes and `PLAN.md` (15 levers); the bake-off of every free model the keys list | yes |
| "Hi Jarvis" -> first audible reply | p50 ≤ 250, p90 ≤ 400 | "Hey Jarvis" 193 / 210 open (n 24), 163 / 185 closed (n 12); "Hi/Hello Jarvis" 636 / 826 (n 24; v5 739 / 869 on the same clips) | **for "Hey Jarvis" only** |
| End of question -> first sound | p90 ≤ 400 | 409 / 438 (n 36) | no |
| End of question -> first word of the answer | p50 ≤ 900, p90 ≤ 1,500 | 2,864 / 6,343 (n 33); a news read's brief 4,669 / 5,129 (n 11), after its acknowledgement line at 1,066 / 1,463 | no |
| Simple command -> screen change | p90 ≤ 700 | 1,030 / 1,737 (n 9); rules lane alone 759 / 1,045 (n 5) | no |
| Data question -> full answer spoken | p90 ≤ 4 s | its last word 23,617 / 37,759 (n 33); in hand on screen 2,188 / 4,200 (n 34) | no |
| Barge-in duck | p90 ≤ 150 | 83 / 92 (n 8) | yes |
| Every figure with n, p50, p90; before and after on real providers | — | every latency cell above | yes |
| Phase 3: briefing 2-4 sentences, offer, grounded | dev set ≥ 30, a checker, a rubric, a blind judge, ten samples | 34 incidents (8 news-sourced, English and Tamil); 34/34 grounded, 2-4 sentences and the offer; the blind judge v6 17-5 in English, 12-10 in Tamil (even); ten samples | yes (the process); the judge's preference holds in English only |
| Phase 4: one article read and answered | p90 ≤ 4 s | 854 / 1,304 (n 11, in the browser; 9 from the stored article, the one cold fetch 1,868) | yes |
| Phase 4: with related coverage | p90 ≤ 8 s | not reached in the browser (no other outlet had covered the timed articles, n 0); server side 680 ms (n 1) | not verified |
| Phase 4: safety, a test for each item | mandatory | 101 web-reader tests, 6 for the routes and the turn's own; the independent check found the reader sound | yes |
| Phase 6: the feel; before/after stills and a headless video | to the owner before any visible change ships | `docs/jarvis/screens/v6/` | yes (the owner's approval is owed) |
| Phase 7: gates, documents, two independent checks, branch pushed | — | the gates above (green apart from load artifacts, each reproduced green alone); both checks done; the branch pushed | yes |

### Not verified

- **Nothing was tried with a real microphone in a real room.** Every latency is a synthetic clip played into the page's microphone in headless Edge on this PC, with real providers. Room echo, distance and noise are not in them; nor is a person who pauses mid-sentence.
- **The live captions under automation** give no words, so every measured turn ended on the detector's own values. v6 now lets the detector keep its own end when the captions read a line as complete or neutral: the room check should confirm commands still end where they should.
- **"Hi Jarvis" closed** (the browser's cloud recogniser) cannot be run under automation; only the on-device "Hey Jarvis" was measured closed. A command said in the same breath as "Hey Jarvis" while Jarvis is closed is left to that recogniser: not measurable here.
- **Claude**: no number (the key was refused). The spend ceiling is tested with stand-ins only.
- **Tamil wording** (briefings, the news reader, the wake replies, number words) is model-drafted, not checked by a Tamil speaker.
- **The news coverage brief in the browser** (n 0: no other outlet had covered the timed articles); the coverage matching's accuracy; the optional model step of the comparison (stand-in model only); the publishers' feed terms (not read).
- **Over the console's own news panel** (no screen of Jarvis's), "read the first article" reads the panel's stories (`ov.allNews`): the list it builds is not tested on its own, in a unit test or a browser (the stand-in console has no news panel); `newsAsk` on such a list is.
- **The situation screen's data time** (1.2-2.6 s) is the cached store's; the live store may differ.
- **Small n** throughout: 2-12 per cell on the later bundles (v6c, v6d), because each run spends Whisper and planner allowance.

## v5 (15-17 Nov 2026)

Measured on this Windows laptop, branch `claude/jarvis-v5-build-dfece7`, START `f830efbd` (`origin/main`: the v4 code at `40ff9082` plus two non-Jarvis commits). The brief is `docs/jarvis/JARVIS_V5_BUILD_2.md`. "Base" means START itself, run in a detached worktree with no v5 code. Raw files: `eval/holdout/results/grid-*.json`, `eval/holdout*/results/v5*`, `tests/e2e/results/`. Every interval is a 95 % Wilson interval. A grid or live run that met any 429 is a capacity failure: its clean-turn score (429 rows left out) is printed beside its all-turn score (429 rows counted wrong), and a strict-mode 400 with no usable draft, a 5xx or a timeout is its own outcome, not a wrong answer (grid files rescored so after review). Every paired comparison is an exact two-sided McNemar on the same sentences (b = right only in the first, c = right only in the second). The older sections below are unchanged.

### Capacity and blocks, before any number

- **Claude: not called, by design.** The owner's instruction is to build and test on Groq and add the Haiku 5.5 key at deploy. Every Claude path is tested with a mocked client; every live runner removes the Anthropic key from its own process first (`liverecord.ts` `groqOnly()`), and live servers run with `JARVIS_CLAUDE_OFF=1`. No result file of this build has a Claude row.
- **Groq is on the free plan.** First calls' headers: `x-ratelimit-limit-tokens: 8000` (a minute), `x-ratelimit-limit-requests: 1000` (a day) on all three models. `x-ratelimit-remaining-requests` read 999 with `x-ratelimit-reset-requests: 1m26.4s` (86,400 s / 1,000), although the copied ledger held 33-59 requests a model from the v4 build in the last 24 h. **Inferred, not verified:** the day's limits refill continuously, so the ledger's rolling 24 h window understates what is left. This build still obeyed the ledger.
- **The browser specs spend Groq** through the console's own translator (base spec run: gpt-oss-120b about 10.7K tokens, gpt-oss-20b 11.3K, qwen 2.2K, flash-lite 8.5K, logged only in the spec ledger, with per-minute 429s). Every later spec server ran with the console's AI providers off.

### v5 baseline, re-measured on START (no quota unless said)

| # | Measure | Command (app folder) | Result |
|---|---|---|---|
| 1 | Unit suite | `npx vitest run` | **5,515 passed, 13 skipped, 0 failed** (5,528), 73 s |
| 2 | Type check | `npx tsc --noEmit --incremental false` | clean, 38 s |
| 3 | Build | `npx next build` | green, 131 s |
| 4 | Jarvis browser specs (7 files) | `npx playwright test tests/e2e/mode.spec.ts … hud.spec.ts` (dev server 3011) | **39/39** (mode 14, bargein 5, hold 5, vad 2, vadfake 1, e2e-latency 3, HUD 9: 8 screens and fps), 15.3 min |
| 5 | Side talk, holdout3 | `HOLDOUT=ambient HOLDOUT_DIR=holdout3 HOLDOUT_TAG=v5base … holdout.live.ts` | **17/40 acted** (EN 2/12, TA 7/16, Tanglish 8/12), level B/C 0 |
| 6 | Side talk, holdout2 | the same with `HOLDOUT_DIR=holdout2` | **4/60 acted**, B/C 0; unnamed commands accepted 35/40 |
| 7 | New intents, no model | `HOLDOUT=rules3 HOLDOUT_DIR=holdout3 HOLDOUT_SET=all HOLDOUT_TAG=v5base …` | **12/120 right, 92 left to the planner** (EN 8/35, TA 2/50, Tanglish 2/35) |
| 8 | Prompt and schema size, characters / 4 | `GRID=sizes … grid.live.ts` | screens: v4 system 1,180 + schema 1,025 + bare user 38; v3 927 + 686 + 38. wide: v4 1,837 + 1,742 + 55; v3 1,488 + 1,403 + 55. v4 console 901 + 1,030; stage 824 + 1,116; data 1,352 + 1,035; memory 779 + 1,121 |
| 9 | Barge-in duck; mocked latency | from 4 | pause p50 70 / **p90 82 ms** (8 clips); mocked first spoken finding p50 2,040 / p90 4,925 ms, ack 786 / 3,221 |
| 10 | QA gate | not re-run on the base | the last gate was green on `6edad240` (v4 build log); START adds v4's evidence, one fix and two non-Jarvis commits |

**Not re-measured on day 1, quoted from the v4 build (taken 15 Nov by the v4 build, not re-run):** live-60 39/60 (65 %, 52.4-75.8; Tamil 18/30), new intents 6/29 on holdout3's live30 (1 capacity), 14/20 right three times out of three on the old 20-sentence sample, engaged speech-to-text p50 513 ms, real first spoken finding 2.3-2.8 s on the planner lane. Each with the caveats in the v4 section below. Tamil Whisper word error rate (about 0.50, older run): not re-measured, the clips are not on this machine.

### Step 0: is the drop from 44 to 39 real?

By script, b, c and p only: `final-planner-live60.json` (44/60, the pre-v4 final run, which met four Groq 429s) against `v4final-groq-planner-live60.json` (39/60). **n 60, b 9, c 4, exact p 0.267, mid-p 0.180: not significant.** Who answered (counts only): the 44 run: no model 20, qwen 24, gpt-oss-20b 9, gpt-oss-120b 7; the 39 run: no model 23, qwen 13, gpt-oss-20b 9, gpt-oss-120b 5, **gemini-3.5-flash-lite 10**. In the 39 run 10 of 37 model turns fell to the ladder's bottom rung (none of the 44 run's 40). The ladder order is not recorded in either file.

### The diagnosis grid (first planner call, pinned Groq models, `eval/holdout/tuning24.jsonl`)

The ledger could not fit the whole grid (qwen 101K, gpt-oss-20b 111K, gpt-oss-120b 115K tokens left against 163-186K a model), so by the brief's rule cells A and B ran first on every model, then cell G on gpt-oss-20b with what was left. Sentences: a seeded (20261115), language-balanced order; 15, 18, 15. Right = `kind` and recipe match gold. **Direction only: with 10-13 pairs only very large effects show (six discordant pairs all one way is p 0.03).**

| Model | A (v3 prose, v3 schema) | B (v4, today) | G (route-then-fill) |
|---|---|---|---|
| gpt-oss-20b | 9/15 (60.0 %, 35.7-80.2) | 9/14 (64.3 %, 38.8-83.7); all turns 9/15; one 429 | 9/13 (69.2 %, 42.4-87.3); all turns 9/15; one 429, one strict-mode 400 with no usable draft |
| gpt-oss-120b | 11/18 (61.1 %, 38.6-79.7) | 15/17 (88.2 %, 65.7-96.7); all turns 15/18; one 429 | not run |
| qwen3.8-27b | 9/13 (69.2 %, 42.4-87.3); all turns 9/15; one 429, one strict-mode 400 with no usable draft | 12/13 (92.3 %, 66.7-98.6); all turns 12/15; two strict-mode 400s with no usable draft | not run |

Scored turns: a call that answered, or a draft the lenient schema accepted (as production does); a 429 and a strict-mode 400 with no usable draft are their own outcomes, not wrong answers (the files as rescored after the review). Compare pairs, not cells.

| Pair (same model, same sentences; A, C, D, E only on recipes both schemas hold) | n | b | c | exact p | Reading |
|---|---|---|---|---|---|
| A vs B, gpt-oss-20b | 10 | 3 | 0 | 0.25 | A beats B by the direction rule (b - c >= 3) |
| A vs B, gpt-oss-120b | 12 | 0 | 1 | 1.0 | about equal |
| A vs B, qwen | 10 | 2 | 0 | 0.5 | about equal |
| G vs A, gpt-oss-20b | 10 | 0 | 2 | 0.5 | about equal |
| G vs B, gpt-oss-20b | 13 | 4 | 3 | 1.0 | about equal |

- **On 15 Nov, cells C, D, E (planned on gpt-oss-120b) and F (on qwen) did not fit the ledger.** D and E ran on day 2 on gpt-oss-20b (below); C and F are owed, with their commands in `docs/thunai/HANDOVER.md`.
- **Strict-mode 400s:** on both gpt-oss models most first calls came back `json_validate_failed` with a draft the lenient schema accepted (as production does): A 11/15 and 13/18, B 11/14 and 14/17, G 12/15. qwen: 1 and 2. Those calls carry no provider token count. Cached input tokens: none on gpt-oss-20b's A and B; 120b's B averaged 100 a call, G 119.
- **Reading against 7.5:** A beat B on gpt-oss-20b only, about equal on the other two, no model the other way by 3. The rows that would say why (A against C, D, E; F against B) are owed. G does not beat A. **No row that selects a planner change holds, so Phase 4 ships the capacity items (A2, A5) and builds A1/A1b behind `JARVIS_PLANNER_DIET`, default off; A3 (route-then-fill) stays built and unwired.**
- The grid's own tokens (ledger): qwen 49.8K, gpt-oss-20b 68.9K plus G about 34K (estimate), gpt-oss-120b 77.3K.

**Day 2 (16 Nov), on the refilled allowance: cells D and E on gpt-oss-20b** (the model where A beat B; the plan had put C, D, E on gpt-oss-120b, where A and B were about equal). They ran on 15 of the 18 sentences both schemas can express: 11 shared with A and B, 4 not; A and B's 4 new-intent sentences are left out of these pairs. Different day, same seeded order. They ran with A5's gateway (one retry on a strict-mode 400); A and B's misses were not of that kind (their rows hold no `json_validate_failed` without a draft), so that difference does not bear on the pairs.

| Model | D (v4 prose, v3 schema) | E (v3 prose, v4 schema) |
|---|---|---|
| gpt-oss-20b | clean turns 14/14 (100.0 %, 78.5-100.0); all turns 14/15; capacity failure (one 429) | clean turns 12/14 (85.7 %, 60.1-96.0); all turns 12/15; capacity failure (one 429) |

| Pair | n | b | c | exact p | Reading |
|---|---|---|---|---|---|
| A vs D, gpt-oss-20b | 11 | 0 | 2 | 0.5 | about equal |
| A vs E, gpt-oss-20b | 10 | 2 | 2 | 1.0 | about equal |

- **A harm from the v4 prose (D) or the v4 schema (E) is not shown** on 10-11 pairs across two days (direction only): neither does worse than v3 (A) on the model where B fell behind A. The per-cell D and E scores above are on a partly different set and day: compare pairs, not cells. B's shortfall on 20b on 15 Nov is not explained by either part of the v4 additions; day-to-day variation and the model mix (H3; Step 0's 10 flash-lite turns) remain. A same-day rerun of B on 20b is owed. Cell C (length alone) and F (a `why` field on qwen) were not run: owed.
- **The reading stands: no row of 7.5 selects a planner change; A1/A1b ship off, A3 unwired.**


### Understanding: live-60 on the shipped Groq ladder (holdout2, final code)

`JARVIS_CLAUDE_OFF=1 HOLDOUT=planner2 HOLDOUT_DIR=holdout2 HOLDOUT_SET=live60 HOLDOUT_TAG=<tag> … holdout.live.ts` (the runner pins Groq and removes the Anthropic key from its own process). Raw files: `eval/holdout2/results/v5first-planner-live60.json`, `v5final-planner-live60.json`. The 60 sentences are the v4 build's live-60; their rows were not read by this build.

| Run | Code | Gap between turns | Label | Right, all turns | Right, clean turns | EN | TA | Tanglish |
|---|---|---|---|---|---|---|---|---|
| First (16 Nov 23:20) | `6831ef74` | 12 s | **capacity failure** (19 turns no model answered; one 429) | 30/60 (50.0 %, 37.7-62.3) | 30/41 (73.2 %, 58.1-84.3) | 10/15 | 13/30 | 7/15 |
| **Final** (16 Nov 23:37) | `e48f98d8` | 20 s | **clean** (no 429, no capacity row; 4 general-lane turns ended on the canned general line: below) | **36/60 (60.0 %, 47.4-71.4)** | the same | **12/15** | **14/30 (46.7 %, 30.2-63.9)** | **10/15** |

- **Why the first run is a capacity failure:** with A2's honest estimate (the schema counted), the ladder refused Groq calls it knew would pass a model's minute allowance at a 12 s pace, so on most of the 19 turns only the last rung was left, and gemini-3.5-flash-lite refused the wide planner schema with 400 "too many states", which the gateway did not read as a schema refusal: no model answered. Fixed with a failing-first test (`febc7ccb`, `e48f98d8`: the refusal now falls back to plain JSON). The final run used a 20 s gap; the shipped code is the same at both gaps.
- **Who answered, final run:** code lanes with no model (quick, refusals, frames, resolve) 16/21, qwen 15/20, gpt-oss-120b 4/8, gpt-oss-20b 0/6, flash-lite 1/1; 4 general-lane turns made 2 model calls each, and the reply was refused by code (a digit, figure or line check) and replaced by the canned general line, with no model credited: 0/4. 21 turns met a strict-mode 400 (`json_validate_failed`); 12 of them were answered from the provider's draft. One turn fell back a rung.
- **Paired, by script (exact McNemar, same 60 sentences):** v5 final against v4's final (`v4final-groq-planner-live60.json`, 39/60): **b 4, c 7, p 0.55** (v4 right on 7 v5 misses, v5 right on 4 v4 misses): not significant either way. Against the pre-v4 run (`final-planner-live60.json`, 44/60): b 5, c 13, p 0.096. v5 first against v5 final: b 4, c 10, p 0.18 (19 of the first run's turns are capacity rows).
- **Against the targets:** ≥ 52/60 **not met** (36); Tamil ≥ 26/30 **not met** (14). v5 did not move understanding on Groq: the grid selected no planner change (above), so the planner prompt is v4's, and the score sits inside v4's interval.
- **Tokens a model turn, final run:** provider-reported input + output on the 23 answered turns that report usage: p50 1,803, p90 4,126; 4 over 2,500, all Tamil (the wide bundle). The 12 turns answered from a draft report no usage. The runner's own charge (its estimate, the schema counted, hedges and stopped calls included): p50 2,633 a model turn. Whole run: 51,058 prompt, 6,169 completion, 7,680 cached (Groq's prompt cache: 3,840 on a gpt-oss-20b answer, 3,840 on one of the general-lane turns whose reply code replaced).
- **Turn time in the runner** (no voice, no speech-to-text): p50 1,165 ms, p90 3,414 ms.

### New intents: holdout3's live30 on the shipped Groq ladder (final code)

`JARVIS_CLAUDE_OFF=1 LIVE_GAP_MS=20000 HOLDOUT=planner3 HOLDOUT_DIR=holdout3 HOLDOUT_SET=live30 HOLDOUT_TAG=v5final … holdout.live.ts`, 16 Nov 23:44-23:52 on `cc6d4622` (code as `e48f98d8`). The runner checked the ledger first (about 293K Groq tokens left against the 270K it needs). Only the runner's printed summary was read; no row of holdout3. Raw file: `eval/holdout3/results/v5final-planner3-live30.json`.

| | v4 final (15 Nov, quoted) | **v5 final** |
|---|---|---|
| live30 through the planner | 6/29 (20.7 %, 9.8-38.4), 1 capacity | **7/28 clean (25.0 %, 12.7-43.4); 7/30 all turns (23.3 %, 11.8-40.9)**; 2 turns no model answered (no 429; 7 strict-mode 400s in the run) |
| explain / changed / howknow / mission | 0/5 · 0/3 · 0/2 · 0/2 | 2/5 · 0/3 · 0/2 · 0/2 |
| brief / remember / recall / follow-ups | 1/3 · 0/4 · 0/2 · 5/9 | 1/3 · 0/4 · 1/2 · 3/9 |
| rules3, all 120, no model | 12 right, 92 left to the planner | **12 right, 92 left** (EN 8/35, TA 2/50, Tanglish 2/35; `v5final-rules3-all.json`) |

- **≥ 75 % not met** (25.0 %). Who answered: qwen 2/10, gpt-oss-20b 2/5, gpt-oss-120b 0/4, flash-lite 2/4, no model 1/7. Tokens: 42,622 prompt, 5,131 completion, 4,864 cached.
- **Not paired with v4's run:** v4's result file is not named in its docs, and this build does not list holdout3. The by-intent rows above are unpaired counts on the same 30 sentences; the difference (one more right) is within either interval.

### Latency and the per-stage trace

Every trace time is ms from the **last voiced sample** (the detector's own end of speech, not its decision), timings only. Server stages are placed on the page clock (one machine: the browser and the server share the clock).

**Mocked providers** (`e2e-latency.spec.ts`, hear 450 ms, planner 1,200 ms, voice 400 ms; Chromium, PCM path; n 6; `latency-mocked.json` from the final spec run, 17 Nov 00:12 on `53ed4a3d`, code as `e48f98d8`):

| | p50 | p90 |
|---|---|---|
| End of utterance decided | 332 | 342 |
| Upload sent | 335 | 346 |
| Transcript back | 814 | 823 |
| Gate and rules done | 818 | 826 |
| First streamed event | 2,034 | 2,043 |
| speak() called | 2,054 | 2,064 |
| Voice start | 2,062 | 2,537 |
| First spoken finding (spec's own clock) | 2,029 | 4,874 |

The stages add up to the mocks plus about 100 ms of the page's own work; nothing unexplained in the mocked lane.

**Real run 1** (16 Nov 22:02; production bundle with `NEXT_PUBLIC_JARVIS_SPEC=1` built from a clean worktree at `8a9d1e69`, before E2 and E3; Edge; real Whisper, the real Groq ladder with Claude off, the real voice ladder; injected synthetic clips; `latency-real-prod-v5first.json`). **The four rules-lane clips were refused by C1** (none names Jarvis, Jarvis was idle): they measure nothing. One planner turn ("how is the metro water backlog looking overall?") answered: first spoken finding **6,674 ms**. Its own trace: end of utterance 332, upload 340, STT sent 347, STT back 844, transcript 894, gate 972, first event 1,132, planner sent 5,869, back 6,614, voice start 6,987. **E1, what held the time:** round 0's qwen call had not answered after the ladder's 3.5 s default hedge wait; the hedge's gpt-oss-120b answered in 1.1 s; the plan asked for a lookup, and a second round (qwen, 722 ms) followed. A not-done round did not report its server times, so round 0 was missing from the trace: fixed. n = 1: not a rate.

**Real run 2** (16 Nov 22:20; the same set-up built at `2af986c5`, with E2 and E3 on, the run opened by a synthetic named clip; `latency-real-prod-v5early.json`): 4 of 6 clips spoke a finding.

| Clip (what Whisper returned) | Lane | First spoken finding (ms) |
|---|---|---|
| "Jarvis, show me the flooding complaints in Velachery" (heard "vela cherry") | rules | **1,467** |
| "Go to the trends page" (heard as Tamil) | planner, no answer | — |
| "Show the severe cases in Adyar" (heard "Udyar") | planner | 2,292 |
| "What about the rain in Perungudi today?" (heard as Tamil) | planner | 2,197 |
| "Jarvis, put together something useful for my morning" (heard as Tamil) | planner | 2,405 |
| "how is the metro water backlog looking overall?" | planner, no finding spoken | — |

Trace (n 6, p50 / p90): upload sent 187 / 338 (the early upload, before the end of utterance at 332 / 343), STT sent 207 / 343, back 680 / 1,215, transcript 773 / 1,245, gate 835 / 1,281, first event 1,261 / 2,212, planner sent (n 3) 918 / 1,429, back 2,328 / 4,733, tools done 2,156 / 4,742, speak 2,229 / 2,409.

- **The language finding, and why E2 ships off.** Three of the English clips came back as Tamil. By direct decodes of the same clip files: "Go to the trends page" comes back Tamil on START too (pre-existing: Whisper's race picks the forced-Tamil decode on that clip); "What about the rain in Perungudi today?" and "Jarvis, put together something useful for my morning" come back English when decoded whole (with the last line English or Tamil), and the second was heard in English in real run 1, before E2. So the early upload's audio (the sentence up to its first 150 ms pause) is the likely cause. **E2 ships default off** (`NEXT_PUBLIC_JARVIS_EARLY_STT=1` turns it on); the measured run is not the shipped default. Owed: a real run with the shipped defaults, and the room check.
- **Targets, honestly:** rules lane first finding 1,467 ms on one clean clip (target 1.0 s: **not met**; v4: 1.14 s); planner lane 2.2-2.4 s on the three planner turns that spoke (target p50 2.2 s: about at it, n 3, with E2 on); engaged speech-to-text server time (STT sent to back, per turn) p50 442 ms, n 6 (337-1,020; target 700: met). The unexplained 300-800 ms of the brief: in these runs the time sat in the planner's round 0 (a slow qwen call held by the 3.5 s default hedge wait) and in second, lookup rounds, not in the voice start.
- **E3 (keep-alive):** measured apart, 6 + 6 Whisper requests 10 s apart, twice: 15 Nov built-in p50 374 / p90 457 ms, keep-alive 235 / 858 (its first, cold request); 16 Nov (`keepalive.json`) built-in 316 / 377, keep-alive 245 / 344. Gain at p50 139 and 71 ms, over the 30 ms bar: ships on.

### Side talk and the address gate (C1, C2; no model)

`HOLDOUT=ambient` and `HOLDOUT=ambient-engaged`, `HOLDOUT_TAG=v5`, on the v5 tree. Counts and the tier that fired only. **On the unengaged harness C1 gives 0 by construction** (the harness passes no last turn, and C1 cuts exactly the tier the old false acts came through): that is not evidence about a room.

| Set | Side talk acted, C1 (shipped) | Unnamed commands refused, C1 | Level B/C acts, unengaged | With the old command tier (`JARVIS_GATE_COMMAND_TIER=1`) | Engaged window: Jarvis's last turn 5 s ago |
|---|---|---|---|---|---|
| holdout2 (60 side, 40 commands) | **0/60** (0.0-6.0 %) | **40/40** | 0 | 4/60 acted; 35/40 commands accepted | 14/60 acted (23.3 %, 14.4-35.4), all at tier 2; 37/40 commands accepted (before the review fix: 18/60 and 39/40) |
| holdout3 (40 look-alike side lines) | **0/40** (0.0-8.8 %) | (no commands in the set) | 0 | 17/40 acted | 6/40 acted (15.0 %, 7.1-29.1), all at tier 2 (before the review fix: 20/40) |
| sidetalk200 (200 side, 60 commands; frozen in this build) | **0/200** (0.0-1.9 %) | **60/60** | 0 | 21/200 acted; 55/60 commands accepted | 58/200 acted (29.0 %, 23.2-35.6), all at tier 2; 54/60 commands accepted (before the review fix: 75/200 and 59/60) |

- **The trade, side by side:** C1 takes side talk said while Jarvis is idle to 0 on every set, and refuses every unnamed command said while Jarvis is idle (they need "Jarvis" first, or must come within 20 s of its last turn). That refusal is the price the owner's default accepts.
- **Inside the follow-up window** a sixth to under a third of the look-alike side lines said within 5 s of Jarvis's turn are taken as addressed (request-shaped lines, tier 2), which allows a level B or C plan (B still waits for a spoken yes; C is a draft only; nothing is ever sent, approved or deleted). The first build kept the two command returns inside the window; the review (gate-captions-wake-1) held that C1 says to remove both, so they now fire only with `JARVIS_GATE_COMMAND_TIER=1`. The price: a sure line with no request shape said inside the window ("severe cases in Perungudi this week") is refused unless named or said as a request. With an 8 s window a line 10 s after the turn is unengaged (0 acted); with the shipped 20 s window it is engaged. `ENGAGED_MS` stays 20,000.
- **"≤ 5 %" on side talk, unengaged:** 0/200 has an upper bound of 1.9 %, so it is met on the drafted set by construction of the harness. Not claimed for a real room, or for the engaged window (29.0 % there).

### Free local Tamil decode (B5): measured, not wired

A measurement lane outside the app (its own scratch folder; models and clips downloaded there, deleted after, never in git). Figures, hashes and licences only: `eval/b5/b5-results.json` (no sentence; 0 Tamil characters). **Clips:** 200 of FLEURS `ta_in` test (read Tamil, CC-BY-4.0, test use only), seed 20261115. **Reference system:** Groq `whisper-large-v3`, `language=ta`, no prompt (200 requests, all answered). One normaliser on both sides. Runtime `sherpa-onnx-node` 2.0.1 on the CPU (Ryzen 5 5600H: AVX2, no AVX-512, no AVX-VNNI). Speed on the 50 natural 5-7 s clips at 4 threads, one decoder at a time.

| System | WER | CER | WER below Groq, paired (95 % bootstrap) | 6 s clip p50 / p90, 4 threads | Peak RSS (short clips) | Gates: WER / p50 / p90 / RSS |
|---|---|---|---|---|---|---|
| Groq forced Tamil | 56.4 | 18.9 | - | - | - | - |
| IndicConformer 120M int8 (csndhanasekar) | 30.9 | 12.5 | 25.5 (21.7-29.2) | 1,020 / 1,137 ms | 486 MB | pass / FAIL / pass / pass |
| **IndicConformer 120M fp32 (OpenVoiceOS), metadata appended** | **29.1** | **12.1** | **27.3 (23.5-31.0)** | **270 / 317 ms** | 674 MB | **pass / pass / pass / pass** |
| IndicConformer 120M int8 (OpenVoiceOS), metadata appended | 31.6 | 12.7 | 24.8 (21.0-28.6) | 1,477 / 1,742 ms | 396 MB | pass / FAIL / FAIL / pass |
| IndicConformer 600M int8, Tamil-masked (Docglasses) | 31.0 | 12.4 | 25.4 (21.7-29.0) | 2,750 / 2,967 ms | 845 MB | pass / FAIL / FAIL / pass |

- **One option passes every gate, with two catches:** the OpenVoiceOS fp32 file does not load in sherpa-onnx as published (`'vocab_size' does not exist in the metadata`); the measured copy had four metadata entries appended (108 bytes; graph and weights untouched). And it is a community export with a `license: mit` tag and no licence file. **Nothing is wired** (the brief: measure only; `JARVIS_LOCAL_TAMIL_STT` is not built). The weights' licence is the owner's decision.
- **int8 is not the fast choice on this CPU:** on the same export int8 was 5.5 times slower than fp32 and 2.5 WER points worse.
- **Accuracy is not the problem:** every local model beats forced-Tamil Groq by about 25 WER points and about 6 CER points (better on 169-171 of 200 clips; sign test p ≤ 2e-30). Much of Whisper's Tamil WER is word splitting.
- **Not measured:** Tanglish or code-mixed speech, a laptop microphone or a room, Groq with the app's own prompt, loading under Next 15, streaming. Output is Tamil script only (Tanglish English words would come out transliterated); CTC takes no hotwords. Another process (this build's browser specs) loaded the machine during some runs (1-93 % CPU before a run; the decoder still had about 3.8 cores).

### Acceptance (section 14)

| Measure | Target | Gate or report | Result |
|---|---|---|---|
| Unit suite; `tsc`; `next build`; Jarvis browser specs | all green | gate | **met** on the final code (17 Nov, `39858001`): unit suite **5,901 passed, 13 skipped, 0 failed** (5,914; START 5,515); `tsc` clean; `next build` green; Jarvis browser specs **39/39** (14.4 min, 17 Nov 00:12, on `53ed4a3d`) |
| QA gate `gate-fast.sh` | green, or red proven red on START | gate | **green apart from known items** on `6831ef74` (`39858001`): tsc, lint, build; unit runs 5,901 ×3, UTC 5,900 with one timing flake (the B1 race test under both lanes, 3,050 ms; alone about 340 ms; margin widened, listed); pass 4 suite 2,648/2,670 with RC-35's 180 s load timeout (alone 9/9), as in v4's gate; access matrix the same two cells as v4's green gate; drive 0 problems; j1 exit 0; golden master: the only new path is `$.timing` (listed), the rest v4's or noise. The seeding script's `pii_enc` error is START's (its PII commit) |
| Every QA oracle change listed and justified | complete | gate | `docs/qa/pass7/V5_EXPECTED_CHANGES.md`: C1, A6, the trace's `timing`, F1, B1, D3, A2 |
| Every spoken number from code; no digit to a voice (F1) | tested on every chunk | gate | met: numbers to words after the gate, a chunk with a number sign refused (tests; the review's high finding on 5+ digit counts fixed) |
| Never send, approve, delete; level B/C from side talk | 0 | gate | 0 unengaged on all three sets (inside the window side talk can reach tier 2, which allows B/C with a spoken yes: reported above) |
| Frozen sets untouched | clean | gate | hashes checked by the runner on every run; `git diff --stat f830efbd..HEAD -- eval/holdout2 eval/holdout3` shows only new files under `results/` |
| No audio, overheard transcript or citizen text written | none | gate | none found by the review; the trace and records hold timings, ids, counts and model names only |
| Every defect fixed has a failing-first test | all | gate | met: the commit order shows each test before its fix (D1 included) |
| Barge-in duck p90 | ≤ 250 ms | gate | **95.9 ms** on the final spec run (p50 88.8; 94.5 earlier in the build; base 82) |
| No model keys: the turn ends within 8 s | `nokeys.v4.test.ts` | gate | green in the unit suite |
| Understanding, live-60, shipped Groq ladder | ≥ 52/60 | report | **36/60 (60.0 %, 47.4-71.4), clean: not met**; first run a capacity failure (30/41 clean, 19 turns no model answered). Paired with v4's 39/60: b 4, c 7, p 0.55 |
| Tamil on that set | ≥ 26/30 | report | **14/30 (46.7 %, 30.2-63.9): not met** (v4 18/30) |
| New intents (holdout3 live sample) | ≥ 75 % | report | **7/28 clean (25.0 %, 12.7-43.4)**, 7/30 all turns, 2 turns no model answered (no 429): **not met** (v4: 6/29) |
| pass^1 and pass^3 | reported | report | owed (the `rep20` harness is built; command in the handover) |
| Side talk that acted | ≤ 5 % | report | unengaged 0/200 (0.0-1.9 %), 0/60, 0/40 (by construction of the harness); engaged window 58/200 (29.0 %), 14/60, 6/40; unnamed commands refused 60/60 and 40/40 |
| First spoken finding, planner lane | p50 ≤ 2.2 s | report | about 2.2-2.4 s on 3 planner turns (real run 2, E2 on); 6.7 s on the one turn of real run 1 (a stalled qwen call); mocked 2.0 s |
| First spoken finding, rules lane | ≤ 1.0 s | report | 1.47 s on one clean clip: not met |
| Speech-to-text, server, engaged | p50 ≤ 700 ms | report | 442 ms per turn, n 6 (real run 2) |
| Planner tokens a turn | ≤ 2,500 | report, three counts | code's own count (system + user, no schema): screens about 1,220, wide about 1,890; provider input with schema (grid cell B, the 19 answered calls that report usage): 1,344-4,121 a call (qwen about 1,350 on screens and 2,130-2,280 on wide; gpt-oss-120b 2,418-2,567; gpt-oss-20b on wide 3,987-4,121); input + output a model turn on the final live-60: provider-reported p50 1,803, p90 4,126 on the 23 answered turns that report usage (4 over 2,500, all Tamil); the runner's charge p50 2,633. English screens may meet 2,500; Tamil (wide) does not |
| Capacity failures in each live run | count | report | grid: one 429 in six of nine cell-model files (A on qwen; B on both gpt-oss; G, D, E on gpt-oss-20b); live-60 first run 19 turns with no model, final run clean (0 capacity turns; 4 general-lane turns ended on the canned general line); new-intents run 2 turns no model answered (no 429) |
| The per-stage trace: where the unexplained time sits | found or not | report | in the planner's round 0 (a slow qwen call held by the 3.5 s default hedge wait) and second, lookup rounds; not in the voice start (n small) |
| The grid: every cell run, every pair | complete | report | A, B on three models; G, D, E on gpt-oss-20b; C, F owed; pairs above |
| No live Claude call | none in any log or result | gate | none: every live run pinned Groq with the key removed; `JARVIS_CLAUDE_OFF=1` on every live server |
| Haiku-ready ladder, deploy check, `DEPLOY_HAIKU.md`, pure parts tested | complete | gate | met (mocked client; the check never run) |
| Groq `x-ratelimit-*` on the first call | recorded | report | free-plan figures (8K tokens a minute, 1K requests a day) |
| Free local Tamil decode (B5) | measured or not run | report | measured, not wired: the OpenVoiceOS 120M fp32 export passes all four gates (WER 29.1 against forced-Tamil Groq 56.4 on 200 FLEURS clips; 6 s clip p50 270 / p90 317 ms; 674 MB) once four metadata entries are appended; every int8 export fails the speed gate (p50 1,020-2,750 ms) |

### Not verified

- **Anything with a real microphone in a real room**: the address gate in a room, echo `true` against `"all"`, self-ducks, backchannels, barge-in on the browser voice, the wake phrases, Tamil number words spoken aloud. All voice figures come from injected or synthetic audio.
- **Claude, entirely**: Haiku 5.5's speed, accuracy on Tamil and Tanglish, the compact plan, the prompt cache, the effort setting. The deploy check measures these; it has never run.
- **Understanding owed:** the three repeats (pass^1, pass^3), the dev set (`eval/dev200`), the grid's cells C and F and a same-day rerun of B, and the new-intents run paired with v4's (unpaired counts only).
- **E2's language flips**: whether the early upload truly causes them (two clips, one run).
- **A real run on the shipped defaults** (E2 off): the real figures above are from runs before E2 and E3, or with E2 on.
- **Groq's daily window**: inferred from the request headers to refill continuously; the ledger still assumes a rolling 24 h.
- **The drafted sets' labels**: drafter and blind labeller are one model family and agreed on every row.
- **The Tamil number words, the Tanglish metric names, the gazetteer's Tamil spellings**: model-drafted, not checked by a Tamil speaker.
- **`NEXT_PUBLIC_JARVIS_FALSE_CUT_MS` = 2,000 ms**: a figure not checked.
- **Gemini ids `gemini-3.5-flash` and `gemini-flash-lite-latest`**: unverified, left as they were.
- **The HUD fps under Edge**: measured only headless in Chromium (final spec run: 60.1 a second speaking and listening, 58.8 with reduced motion; 32 a second earlier in the build under memory pressure).
- **B5**: read Tamil (FLEURS) only: no Tanglish, no microphone or room, Groq without the app's prompt, not loaded under Next 15, no streaming; the passing file is a community export with a tag-only licence that loads only once its metadata is added

## v4, "Ultimate Jarvis" (15 Nov 2026)

Measured on this Windows laptop, on branch `claude/priceless-bouman-2fe7f8` (from `main` `38d96d2f`). The brief is `docs/jarvis/ULTIMATE_JARVIS.md`. "Base" means `main` itself, run in a detached worktree of `38d96d2f` with no v4 code. Raw files are in `eval/holdout/results/`, `eval/holdout2/results/` and `eval/holdout3/results/`, with tags `v4base-*` and `v4final-*`. The older sections below are kept as they were.

**In short.**
- **Built and tested.** Every rule-level gate holds and is tested: the 1,000-case figure property test, the number gate on every chunk, the never-send refusals, privacy, the no-keys path, the proactive limits and the three scripted missions. The unit suite grew from 4,568 to 5,496 tests and all pass; all 30 Jarvis browser specs pass, as do the 8 HUD screenshot specs; the QA gate is green on the final tip.
- **Measured faster.** Barge-in pause p90 is 84 ms on the PCM path. Engaged speech-to-text runs at 513 ms p50 on the server.
- **Understanding did not improve, and Claude never ran.** The Anthropic key is refused (401), so every live figure is the Groq ladder. On live-60 the score fell from 44 to 39 of 60 (not significant). On the new holdout3 set, the new intents were not reached from loose phrasing: 6/29 on base and 6/29 on v4.
- **Side talk.** On holdout3's look-alike side lines the address gate acts on 17 of 40, as `main` does, though never at Level B or C.
- **Nothing was tried with a real microphone in a real room.**

### Capacity and blocks, before any number

- **Claude: blocked.** `GET /v1/models` with the `.env` key returns 401 `invalid x-api-key`. No new key or account may be made. So:
  - the live-60 "Claude-first" baseline ran on the Groq ladder;
  - the Opus 5.5 low / Sonnet 5.5 `between_tools` / Haiku 5.5 table was not run;
  - the structured-output proof and the cache-hit check ran as unit tests only.
- **The base live-60 run met four Groq 429s** (gpt-oss-20b and -120b) and 15 "busy, next model" hops. By the brief's rule it is a capacity failure, not a score. It is kept as the labelled baseline because it is the only run on `main` today, and it stays comparable because the final run used the same ladder.
- **The STT probe was not run.** The SLR65 clips are not on this machine, so the fallback was taken.
- **Groq spend today:** about 300K tokens across the three Groq models, plus about 170K on flash-lite (ledger), plus the holdout3 labelling on `gpt-oss-120b` (outside the ledger).

### Understanding

**live-60 (eval/holdout2, frozen 4 Nov, still unread), the Groq ladder both times**

| | Base (`main`, 00:30) | Final (v4, `e12b470b`, 09:18) |
|---|---|---|
| **All 60** | 44 (73.3 %, 61-82.9) | **39 (65 %, 52.4-75.8)** |
| English, 15 | 12 (80 %) | 10 (66.7 %) |
| Tamil, 30 | 20 (66.7 %, 48.8-80.8) | 18 (60 %, 42.3-75.4) |
| Tanglish, 15 | 12 (80 %) | 11 (73.3 %) |
| Capacity | four 429s in the log | 0 counted |
| Model turn p50 / p90 | 1,108 / 2,453 ms | 1,231 / 3,476 ms |
| Tokens a model turn | 1,977 | 2,878 (+46 %) |

- **Paired on the same 60:** 36 right both times, 13 wrong both times, 3 right only on v4, 8 right only on base. That gives a sign test p ≈ 0.23. So the drop is not significant, but it points the wrong way.
- **Where the wrong answers went (counts only):** readings 5, cases 4, clarify 3, chat 2, none 2, general-fallback 2, and one each of nearby, changed and brief.
- The brief's targets (Claude-first ≥ 52/60, Groq ≥ 47/60) are **not met**, and Claude's could not be run. A likely factor: every bundle now carries `calls`, memory, the register, Tanglish hints and the metric line. The prompt grew by about 900 tokens a turn, and the small Groq models read it less well. This was not tuned, because the only sets that could show it are held out.
- The final runs were on `e12b470b`. The review fixes after it (`2c335f82`, `2558f28c`, `c717ec08`) change safety paths, not the planner prompt. They were not re-measured, to keep quota for the latency run.

**holdout3 (frozen 15 Nov 09:10, unread; 120 sentences, live sample of 30)**

| | Base (`main`) | Final (v4) |
|---|---|---|
| live30 through the planner | **6/29 (20.7 %, 9.8-38.4)**, 1 capacity | **6/29 (20.7 %, 9.8-38.4)**, 1 capacity |
| English / Tamil / Tanglish | 3/9 · 2/11 · 1/9 | 3/9 · 2/12 · 1/8 |
| explain / changed / howknow / mission | 0/5 · 0/3 · 0/2 · 0/2 | 0/5 · 0/3 · 0/2 · 0/2 |
| brief / remember / recall / follow-ups | 1/3 · 1/4 · 0/2 · 4/9 | 1/3 · 0/4 · 0/2 · 5/9 |
| rules3, all 120, no model | 10 right, 95 left to the planner | 12 right, 92 left to the planner |

- Paired on live30: 4 right both times, 2 only on v4, 2 only on base.
- **Explain on holdout3 is 0/5 against a 75 % target: not met.**
- **The new paths do work when asked plainly.** This probe uses sentences written for it, none from any held-out set, run through the same harness with no model: "what changed since yesterday" → changed; "நேத்துல இருந்து என்ன மாறியிருக்கு" → changed; "how do you know" after a screen → howknow; "explain the second one" on a list → explain; "build me a water-crisis board for Velachery" → mission; "remember that I follow Adyar closely" → remember; "what do you remember about me" → recall; "brief me" → brief; "what's the situation in Adyar" → situation.
- **What failed in the probe:** "what's different this week in Adyar" and "explain this drain issue in Velachery" went to the planner. The held-out phrasing is looser still, and the Groq planner does not pick the new recipes from it. That is the honest state.

**pass^3** (τ-bench style; the old `eval/holdout` 20-sentence sample, which has already been read, run three times; the brief asked for 15)

| | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| Right | 15/20 | 14/20 (1 capacity) | 16/20 |

Mean pass@1 is 75 %. **pass^3 = 14/20** (right all three times); 16/20 were right at least once. Model turn p50 is 1,285 ms, p90 2,951 ms.

### Side talk (address gate, no model)

| | Base | v4 |
|---|---|---|
| holdout2, 60 side sentences | 4/60 acted (6.7 %) | 4/60 |
| holdout2, 40 unnamed commands accepted | 35/40 | 35/40 |
| **holdout3, 40 look-alike side lines** | **17/40 acted (42.5 %;** EN 2/12, TA 7/16, Tanglish 8/12) | **17/40** |
| Of those, Level B or C | 0 | **0** |

- The B/C gate holds.
- The ≤ 5 % target is **not met**. On holdout3's look-alike lines it is far off.
- The gate was not changed or tuned: tuning it on holdout3 would spend the set.

### Latency and voice

**End of speech to …, mocked providers** (`e2e-latency.spec.ts`; hear 450 ms, planner 1,200 ms, voice 400 ms; Chromium, PCM path; `latency-mocked.json`)

| | p50 | p90 |
|---|---|---|
| Earcon (audible) | at the VAD end mark, by construction (≤ 120 ms tone; audio output latency unmeasured) | |
| Acknowledgement on screen | 807 ms | 3,232 ms |
| Answer on screen | 2,053 ms | 4,485 ms |
| First audio = first spoken finding | 2,059 ms | 5,008 ms |

The mock alone costs 2,050 ms (450 + 1,200 + 400), so the p50 is the floor the mocks allow. The p90 is one turn in six and was not investigated.

**One real run** (`real.spec.ts`, production bundle with `NEXT_PUBLIC_JARVIS_SPEC=1`, Edge 157, real Whisper, the real planner on the Groq ladder and the real voice ladder, injected audio; six clips, not the twelve the brief asked for; `latency-real-prod.json`)

| Clip | Ack on screen | First audio | First spoken finding |
|---|---|---|---|
| "Go to the trends page" | — | — | — (a navigation) |
| "Show the severe cases in Adyar" (heard "Udyar") | 1,006 | 1,525 | — |
| "flooding complaints in Velachery" (heard "Vela Cherry") | 895 | 1,141 | **1,141** |
| Tamil, Perungudi | 919 | 2,846 | 2,846 (`qwen`) |
| Tamil, open-ended | 1,683 | 2,291 | 2,291 (`qwen`) |
| "how is the metro water backlog looking overall?" | 3,693 | 4,439 | — |

**Engaged-turn STT, server time** (telemetry of the same run): p50 **513 ms** over 7 engaged turns (374-1,314). The race's winner was English 4 times and Tamil 3. The Gemini third racer returned nothing usable on any of the 7.

Targets:

| Target | Result |
|---|---|
| Acknowledgement ≤ 0.7 s p50 | Met only by the earcon. The words come after STT, at 0.8-1.0 s |
| First finding, rules lane, ≤ 1.0 s | Not met: 1.14 s on the one clean rules clip |
| Planner lane ≤ 2.2 s p50 / 3.5 s p90 | 2.3-2.8 s on the two planner clips |
| Engaged STT ≤ 700 ms p50 | Met |

Two Whisper misreadings ("Udyar", "Vela Cherry") are in the run, as heard.

**Barge-in, PCM path** (`bargein.spec.ts`, 8 clips, injected audio; `bargein.json`)

| | p50 | p90 |
|---|---|---|
| Pause (v4: the duck to 20 %) | **76 ms** | **84 ms** (gate ≤ 250: **met**) |
| Cancel (2 real words, or 600 ms held) | 905 ms | |

The cut came from the words in 2 of 8 clips and from held speech in 6. The **browser-voice path** (Edge natural voices) was not measured: Chromium in the specs has no natural voice, and whether Edge honours `pause()` was not tested.

**HUD fps** (`hud.spec.ts` fps, headless Edge 157, this laptop's 144 Hz screen, 20 s each, `hud-fps.json`)

The page itself ran at about 144 frames a second throughout. The core's own canvas draws are what the targets measure:

| State | Core draws a second | Target |
|---|---|---|
| Listening, idle | 14.3 | ≤ 15: **met** |
| Speaking | 72 | ≥ 55: **met** |
| Reduced motion | 0 (one still frame per state change) | |

The first measurement found 16 and 143 draws a second; the second, after a 15 ms cap, found 47. Both were fixed, in `c717ec08` and `de40dd26`.

### Gates

| Gate | Result |
|---|---|
| Vitest | **5,496 passed, 13 skipped**, 445 files + 2 skipped, plain and `--sequence.shuffle`, on the final tip (`main`: 4,568) |
| `tsc --noEmit --incremental false` | clean |
| `next build` | green, and the measuring build too |
| `next lint` | exit 0, warnings only |
| Jarvis Playwright specs on the measuring build | **30/30**: mode, bargein, hold, vad, vadfake, e2e-latency. Seven of these were red on `main` before any v4 change (the specs predated the teammate's redo: since it, Chromium's SAPI voices took the place of the PCM path the specs mock). hud.spec screens 8/8 in Edge on the dev server |
| QA gate `tests/qa/pass7/gate-fast.sh` | **Green on the final tip `6edad240`** (13:21-13:51). Every step passed except one load timeout, the same test that timed out in `main`'s last gate:<br>• tsc, lint and build: green<br>• 4 shuffled unit runs: 5,496/5,509 each, 0 failed<br>• pass 7 tests 769, collector-ops 24, src guards 39: all passed<br>• access matrix and drive: green<br>• j1: clean<br>• **pass 4's whole real-path suite: 2,648 passed, 1 failed.** The failure is g2-cache RC-35 at its 180 s limit under the other lane's load; alone it passes 9/9, RC-35 in 4.4 s. Run alone just before on the same commit, the whole suite was 2,649/2,670, 0 failed<br>• **golden master: 3,298 requests, no 5xx, no problems.** Against `main`'s own recording: 56 changed, 25 added, 0 removed, every change explained in `docs/qa/pass7/V4_EXPECTED_CHANGES.md` (bilingual titles, memory writes needing the yes, lat/lon noise); noise floor 3, as on `main`<br>Getting there needed:<br>• the QA harness's gitignored data, copied in;<br>• brief-mandated oracle updates, each listed with its bug id;<br>• one real regression fixed: v4's watch cache missed the decisions epoch (RC-35's class);<br>• two open-baseline rows that v4 had regressed, fixed by behaving as `main` did: open-baseline-46 (`c8b0fb1e`) and open-baseline-11 (`6edad240`) |
| Finding 51, 1,000-case property test | **passes**. On the old code: 456 leaks; with glued forms ("deaths-300") added after review, 78 on the pre-fix code |
| Number gate on every spoken chunk | tested: server `spokenSentences`, browser `SayQueue`, mouth per chunk, the brief, interjections, mission narration, how-do-you-know, the thin-data line, the ack |
| Never send, approve, delete; privacy adversarial 50 and 10 | green, plus 7 new never-rule cases after review |
| No interjection while the Collector speaks or a turn runs; a brief always ends | unit tests (`watch.v4`, `aide.f1.v4`) |
| Three scripted missions (plan card, Start, narrated real times, stop, redirect, C to the tray) | `missions.v4`, 32 tests; not run in a browser spec |
| Every model key removed | `nokeys.v4`: the turn ends "can't reason right now" in about 0.1 s |
| Side talk Level B/C = 0 | 0 on both sets |

### Proactive (`scripts/proactive-replay.cjs`, the cached store's history)

- **History:** 8 May to 4 Nov 2026 (181 days). 146 days were replayed, each with 35 days before it.
- **Alerts:** 102, or 0.70 a day (median 1, maximum 6, 69 days with none). By kind: reservoir 60, rise 26, gap 8, rain 5, warning 3.
- **Rises:** 25 of 26 (96.2 %) pass a plain rule ("count ≥ 2× baseline and ≥ 5"). The other kinds are true by construction.
- **The data:** the reservoir data in the cache is simulated, and rain readings start on 25 Sep.
- **Interjections a demo hour** (the Collector idle all hour): mean 0.54, maximum 3 without the brief. With the brief at power-on, mean 0.01, maximum 1.
- **The detector on synthetic data:** 3 false alarms in 85,000 flat Poisson series-days. A step from 5 to 20 a day was caught within 4 days in 200 of 200 seeds.

### The independent review (Phase 7)

Five read-only reviewers, one per area: numbers and privacy, voice and barge-in, planner and quota, proactive and memory, UI and accessibility. Each tried to refute its own findings before reporting; the brief asked for separate skeptics, and they were folded in after two usage-limit stops.

**22 high findings were upheld and all 22 are fixed**, each with a test that failed first. The most serious:
- a send, approve or delete inside a "how fast … close" question passed the never rule;
- "time to close all these cases" was no longer refused;
- glued figures ("deaths-300") passed the number gate;
- case titles reached the planner's prompt through the register;
- the end-of-speech earcon dropped the Collector's next words for 400 ms;
- the ducked voice's own echo could cut it off;
- the brief could speak after the Collector had moved on;
- the plan cache was shared across users.

The specs found three more code bugs, all fixed: a level-B save in a compound sentence, the mode coming back muted, and 143 core draws a second on a 144 Hz screen. The full list is in `docs/thunai/BUILD_LOG.md`.

### Not verified

- **Anything with a real microphone in a real room.** That includes echo cancellation `"all"`, self-cancels per ten answers, the duck thresholds, backchannels, the end-of-utterance timing and the barge-in figures. All come from injected audio.
- **Claude, entirely:** structured outputs on the wire, prompt-cache hits, the warm-up, and the Opus/Sonnet/Haiku trade-off. The key is refused.
- **Streaming Gemini TTS** (`JARVIS_TTS_STREAM=1`): the docs disagree on the voice field.
- **The Gemini third STT racer:** it returned nothing usable in the real run (daily quota or the text instruction; not told apart).
- **Edge's `speechSynthesis.pause()` with natural voices**, and the browser-voice barge-in path.
- **The live-60 drop's cause.** The prompt-size explanation is a hypothesis.
- **Live mission planning by a model** (template plans and a fake model only).
- **The Tamil spoken-register lines**: not checked by a native speaker.
- **The 1366×768 card overflow and the Stage live-region timing**: checked in code only.
- **The rain thresholds** (IMD 64.5 / 115.6 / 204.5 mm, from memory) and the detector's 99.5 % quantile.
- **The holdout3 labels.** One labeller family (`gpt-oss-120b`) agreed with the drafter; no human label.

---

## v3 (4 Nov 2026)

Measured on 4 Nov 2026 on this Windows laptop, on branch `claude/jarvis-agentic-voice-5be9b7`. The brief is `docs/jarvis/OPUS_BUILD_PROMPT_V3.md`. Raw results are in `eval/holdout/results/`. The frozen sets were checked against `eval/holdout/HASHES.txt` before the final run, and all hashes match.

**In short, after the second pass below:** on a new frozen set of the same kind, the full pipeline went from 24/60 (40 %) on its first run to **44/60 (73.3 %)** on the finished code, and Tamil from 9/30 to **22/30**. It costs 64 % more tokens a sentence. That final run met four refusals from a Groq limit, so read the caveat in the section before quoting the figure. With Claude answering first, the same 60 sentences scored **49/60 (81.7 %)**, with Tamil at **25/30**, in a clean run; a model turn then takes about 3.9 s rather than 1.2 s. Side-talk false acts are unchanged, at 4/60 (6.7 %) against a 5 % target. **Nothing has been tried with a real microphone in a real room, and these sentences are typed text, not what Whisper hears.**

**In short, as first built (this report's older sections, kept as they were):** the safety gates, barge-in and mode gates pass. Understanding does not reach its targets: the rules are at 66.7 % against 85 %, and the full pipeline on the 40-sentence sample scored 42.5 %, with Tamil at 15.4 %. Side-talk false acts are 10 % against a 5 % target. The follow-up gate of 18/20 was reached only on a set I had already read; the unseen set scored 15/20 in code.

## Second pass: understanding, on a new held-out set (4 Nov 2026)

The sets in `eval/holdout/` had been read while the report was written, so they could no longer measure anything. Before any change, a new set was drafted and frozen in `eval/holdout2/`: 169 sentences (Tamil 78, English 48, Tanglish 43), a 60-sentence live sample with Tamil at half, and 100 ambient lines. Gemini drafted it from a prompt that sees no code (`draft.mjs`). A second model labelled every sentence blind, and the 15 where the two disagreed were dropped, so the set leans a little easier than a raw draft. The script never prints a sentence and no row has been read: only totals were looked at, so the set is still usable. The commits show the order: the freeze, then the scorer, then the first run, then the changes. All tuning used the old sets.

### The live sample: the same 60 sentences through the real pipeline

| | First run, unchanged code | Final, finished code |
|---|---|---|
| **All 60** | 24 (40 %, 28.6-52.6) | **44 (73.3 %, 61-82.9)** |
| English, 15 | 8 (53.3 %) | 13 (86.7 %) |
| **Tamil, 30** | 9 (30 %, 16.7-47.9) | **22 (73.3 %, 55.6-85.8)** |
| Tanglish, 15 | 7 (46.7 %) | 9 (60 %, 35.7-80.2) |
| Capacity failures counted | 0 | 0 |

**The caveat.** The final run's log has four refusals from Groq (429, `qwen` over its output tokens per minute), which the ledger does not track. Each time the next model answered, so no sentence went unanswered, but the rule is that a run with 429s is a capacity failure and not a clean score. The log does not tie them to sentences. Leaving out up to four sentences, the score stays between 71.4 % and 78.6 %, so the conclusion holds and the exact figure is provisional. It could not be re-run today, because that same run used up `qwen`'s day. The first run had no 429s. **The code has not changed since, so a clean re-run after the cap resets is fair, and should replace this figure.**

| By lane | First run | Final |
|---|---|---|
| Rules (quick) | 16/28 | 13/15 |
| Planner | 5/28 | 28/40 |
| Refuse | 2/2 | 2/2 |
| Frame | 1/2 | 1/2 |
| General | | 0/1 (the model's reply held a figure or was empty, so the "cannot reason" line was said, as it should be; scored wrong) |

| The planner's misses | First run | Final |
|---|---|---|
| Asked a clarifying question | 14 | 4 |
| Nothing usable left by the checker | 5 | 1 |
| A different screen | 4 | 7 |

| Right, by the model that answered (these saw different sentences, so this is a pointer, not a comparison) | First run | Final |
|---|---|---|
| `qwen3.8-27b` | 2/7 | 19/24 |
| `gpt-oss-20b` | 3/13 | 5/9 |
| `gpt-oss-120b` | 0/8 | 4/7 |

### What it costs

| | First run | Final |
|---|---|---|
| Sentences that used a model, of 60 | 28 | 41 |
| Tokens, whole run | 46,412 | 76,117 |
| Tokens a sentence, all | 774 | 1,269 (+64 %) |
| Tokens a sentence, Tamil | 973 | 1,679 (+73 %) |
| Tokens a model turn | 1,658 | 1,857 |
| Calls a model turn | 1.2 | 1.0 |
| A model turn, p50 / p90 | 1,015 / 1,767 ms | 1,174 / 2,557 ms |

This is the price of handing off, and it falls on one Groq organisation. At about 1,900 tokens a turn, the 8K-a-minute limit allows about four planner turns a minute per model, and Tamil now nearly always takes one, so most Tamil answers wait on a model rather than coming from the rules at once. **Today's evaluation used `qwen`'s whole daily allowance (199,936 of 200,000 by the ledger), so do not demo for 24 hours.**

### Rules and router alone: 169 sentences, no model

| | First run | Final |
|---|---|---|
| With hand-off | 66.9 % | **89.3 %** (83.8-93.2) |
| English | 79.2 % | 93.8 % |
| Tamil | 66.7 % | 91 % |
| Tanglish | 53.5 % | 81.4 % |
| Strict (code alone named the intent) | 33.7 % | 27.8 %, down on purpose |
| Wrong, with no model involved | 43 | 10 |
| The fast lane, when it answered | 49 of 89 right | 38 of 43 right |
| Handed to the planner | 69 | 112 |

This passes the 85 % and 80 % targets on paper, **but do not lean on it.** "With hand-off" only says the sentence reached a prompt that could serve it, not that the planner then got it right, and part of the rise is by definition, because the data and Tamil prompts now hold the screens. The live table is the real measure. The useful figure here is the fast lane: when it answers now, it is usually right.

### Side conversation: 60 side sentences, 40 commands, no name

| | First run | Final |
|---|---|---|
| Side talk that acted | 4/60 (6.7 %) | 4/60 (6.7 %), target 5 %. **Not met** |
| Of those, Level B or C | 0 | 0 |
| Commands accepted | 37/40 (92.5 %) | 36/40 (90 %) |

All four false acts are in Tanglish. The gate's wording rules were not changed.

### What changed

- **Scorer.** A general answer given as chat now counts as right; the lane's "cannot reason" line does not. A run on the new set refuses to start if a hash has changed.
- **Rules lane (`quick.ts`).** It answers only when it can account for the sentence's words and only one kind of question is being asked. A topic alone no longer becomes a list of its cases, and "closure rates" no longer becomes market prices.
- **Planner (`round.ts`).** `do` is the default, and clarify and chat are narrow. A general question has its own kind and label. If the model only asks back or chats about a sentence the rules can read, the rules' reading is shown (once in the final run). A model's refusal is never overruled.
- **Tamil.** Tamil and Tanglish get screens and console steps in one call, with their own examples. Loan words in Tamil letters are glossed, and localities and reservoirs are hinted.
- **Ladder (`llm.ts`).** `qwen` comes first while the minute has room.
- **False refusal (`privacy.ts`).** "Who wrote the book Mahabharata?" now goes to the general lane; "who wrote this complaint" is still refused. The 50 and 10 adversarial tests are green.

### Should a small model replace some address-gate rules?

The owner asked why Jarvis is not all AI. **Recommendation: not replace, but add one as a veto, and it has not been built, because it sends overheard sentences to a model and that is the owner's call.** The rules still decide first, and the model is asked only about a sentence they would already act on with no name, so it can stop an act and never add one. Safety and number rules stay in code either way.

| | Rules alone | With the veto |
|---|---|---|
| Old ambient set, which has been read: side talk that acted | 4/40 | **0/40** |
| Old ambient set: commands accepted | 34/40 | 34/40 |
| Frozen set | 4/60, 36/40 | **Capacity failure, no result** |

On the old set it took 38 calls, 140 tokens a call and 333 ms at p50, on the first prompt tried. On the frozen set `qwen` had no budget left, 31 of 40 calls got no answer, and that run (`final-gatemodel.json`) says nothing about accuracy. It does show that the other two models did not answer in time with so small an output limit, so the veto depends on `qwen`. **It needs a clean run on the frozen set before anyone relies on it.**

The arithmetic against an all-AI gate: at the worst-case 334 ambient sentences an hour, asking about every one costs about 47K tokens an hour, which is a model's whole day in about four hours of nonstop talk. Asked only about what the rules would act on, it should be a small fraction of that.

### Claude, added after these runs

**Every figure above is from Groq's models only.** After the final run the owner added an Anthropic key, so Jarvis now asks `claude-opus-5-5` first and falls back to Groq with no key, a refused key, no credit or any failure.

The same 60 frozen sentences on the same code, with no tuning in between:

| | Groq only (final) | Claude first |
|---|---|---|
| **All 60** | 44 (73.3 %, 61-82.9) | **49 (81.7 %, 70.1-89.4)** |
| **Tamil, 30** | 22 (73.3 %) | **25 (83.3 %, 66.4-92.7)** |
| English, 15 | 13 (86.7 %) | 12 (80 %) |
| Tanglish, 15 | 9 (60 %) | 12 (80 %) |
| Capacity failures counted, 429s in the log | 0, four 429s | 0, no 429s |
| A model turn, p50 / p90 | 1,174 / 2,557 ms | **3,870 / 5,224 ms** |
| Tokens, whole run | 76,117 | 140,270, most of the input read from the prompt cache |
| Sentences that used a model | 41 | 41, of which 38 were answered by Claude and 3 by Groq |

**Claude is probably better, but this does not prove it.** Sentence by sentence, 41 were right both ways and 8 wrong both ways; 8 were right only with Claude and 3 only with Groq. On 11 sentences that split is not significant (sign test, p about 0.23), and the intervals overlap. The speed cost is clear: over three times slower at p50, and the slowest turn took 8 s, which is the whole turn's budget. In one turn Claude's second call ran out that budget and was cut off, and three planner turns left nothing usable. `claude-haiku-5-5` might be quicker and costs far less, but it has not been tried.

An earlier attempt at this run lost its network connection partway through and saved nothing, so it is not counted. The harness now saves after every sentence. No row of the set has been read: only totals and these paired counts.

This is what one earlier live check showed, on five sentences written for the check:

| | Measured |
|---|---|
| Sentences | 4 of 5 used Claude, and all 4 got the expected kind of screen or a labelled general answer. The fifth was answered by the rules with no model |
| A turn | 2.2 to 3.4 s, against about 1.2 to 2.6 s on Groq |
| Tokens, a Tamil turn | About 3,750 in and 230 to 290 out, with 3,574 from the prompt cache on a repeat |
| Cost, a Tamil turn | About 0.7 US cents from the cache, about 2.4 cents when it writes the cache (worked out from list prices, not read from a bill) |
| With no key | Groq answered the turn in 1.3 s, with no call to Anthropic |
| With a refused key | The same turn went on to Groq and finished in 1.5 s |

This is the one paid service in Jarvis, which the first brief ruled out and the owner has now chosen. The ledger caps Claude at 500 requests and 1.5M tokens a day (`LIMITS` in `ledger.ts`), at most about US$8 on Opus 5.5. `JARVIS_CLAUDE_MODEL` picks another model. `claude-haiku-5-5` costs far less per token, but it has not been tried here.

### Checks on the finished code

Vitest 1,917 passed, 13 skipped, including the 50 and 10 adversarial privacy tests; `tsc` clean; `next build` passes; Playwright voice specs 30 of 30 (`mode`, `bargein`, `hold`, `vad`, `vadfake`, `e2e-latency`, on injected audio). The HUD specs were not re-run, since nothing they cover changed. Raw results: `eval/holdout2/results/firstrun-*` and `final-*`. The tuning runs on the old sets are `eval/holdout/results/dev3-planner-final40.json` (33/40, tuned on), `dev6-planner-tamilrest.json` (30/37, Tamil no change was made against) and `dev5-gatemodel.json` (the veto).

### What this does not show

- **Real speech.** These are typed sentences. Tamil transcription has a WER near 0.5 (see below), so a Tamil speaker in a room will do worse than 73 %, by an amount not measured. Sentences in the frozen set are also a model's idea of how a Collector talks, not recordings of one.
- **The right place.** The scorer checks the kind of screen, not its slots, so the right screen for the wrong zone counts as right.
- **Comparing localities.** Most localities have no zone in the district reference, and compare needs zones, so "Mylapore and T Nagar" cannot be served. Seen on the old set; a gap in the data, not in understanding.
- **Tanglish** is now the weakest language, at 9/15, on few sentences.
- The changes were checked by tests and these runs, not by an independent review.

## Acceptance against section 12 of the brief

| Metric | Target | Result | Status |
|---|---|---|---|
| Existing suite plus new tests, tsc, build | all green (gate) | Vitest 1,887 passed, 13 skipped (Phase 0 baseline: 1,573 passed, 13 skipped); `tsc` clean; `next build` passes; Playwright voice specs 30 of 30, HUD specs 5 of 5 | Pass |
| Mode on: a command with no click and no name, the console acts | 3 scripted (gate) | `mode.spec` | Pass, on injected audio |
| Side conversation ignored | ≤ 5 % false acts of 40 (report); Level B/C = 0 (gate) | 4/40 = 10 %; Level B/C 0 | **Report target missed**; gate passes |
| Unnamed commands accepted | ≥ 80 % of 40 (report) | 35/40 = 87.5 % | Met |
| Mode off or muted: mic tracks stopped | verified in test (gate) | `mode.spec` | Pass |
| Hold words, "wait, do X", continue, noise-resume, late-transcript drop, no old answer after stop | named tests (gate) | `hold.spec`, `bargein.spec`, `turn.test.ts` | Pass |
| Barge-in from known speech start, PCM path | p50 ≤ 150 ms, p90 ≤ 250 ms (p90 gate) | p50 82 ms, p90 98 ms | Pass, on injected audio |
| Ack and first-audio latency | mocked and one real run (report) | See "Latency" | Reported |
| Follow-ups | 18/20 (gate) | 18/20 on the set I had read; **15/20 in code on the unseen set**, the other 5 go to the planner and were not scored | **Not met cleanly** |
| Compare, insights, complete this data end to end | 3/3, filled cells show sources (gate) | 3/3 in `owner.test.ts`, code and mocked model | Pass; not run on real Studio data |
| Understanding, 150 via rules and router | ≥ 85 %, Tanglish ≥ 80 % (report) | 66.7 % with hand-off (Tanglish 65 %); 36.7 % strict | **Missed** |
| Unsupported numbers rejected | 1,000 generated cases (gate) | Property test in `chunker.test.ts` | Pass |
| Privacy adversarial; never send, approve, delete | 50 and 10 cases (gate) | `privacy.test.ts` | Pass |
| Removing Groq keys: completes or says "cannot reason" within 8 s | integration test (gate) | `owner.test.ts`: with Gemini up it answers from Gemini under 2.5 s; with no keys it says so in time | Pass, with Gemini stubbed |
| HUD: speaking ≥ 55 fps, reduced motion ≥ 59 fps, Tamil legible, UI review passed | measured (report) | speaking 144.1 fps, reduced motion 144.1 fps; UI review 25 findings, see below | Met in headless Edge only |
| Tokens per turn; ambient requests per hour | measured (report) | 1,682 tokens per model turn; 334 ambient requests an hour under nonstop room talk, 0 to the planner | Reported |

## First run versus final

First-run files are `firstrun-*.json`, kept as they were, and final files are `final-*.json`. Between them came generic fixes and the fixes from the independent review. No sentence was special-cased.

### Understanding: 150 sentences through rules and router, no model

"Strict" means code alone named the intent. "With hand-off" also counts a sentence correctly passed to the planner with a prompt bundle that can serve it, and says nothing about whether the planner then got it right.

| Set | n | `main` baseline | First run, strict | Final, strict | First run, with hand-off | Final, with hand-off (95 % interval) |
|---|---|---|---|---|---|---|
| All | 150 | 20 % | 36.7 % | 36.7 % | 62.7 % | **66.7 %** (58.8-73.7) |
| English | 60 | 30 % | 55 % | 55 % | 68.3 % | 70 % (57.5-80.1) |
| Tamil | 50 | 10 % | 14 % | 14 % | 62 % | 64 % (50.1-75.9) |
| Tanglish | 40 | 17.5 % | 37.5 % | 37.5 % | 55 % | 65 % (49.5-77.9) |

In the final run, 34 sentences were wrong and 16 deferred. No capacity failures, since no model is involved.

### Full pipeline on the frozen sample, live models

| Run | n | Right | Wrong | Capacity failures | Tokens |
|---|---|---|---|---|---|
| `main` baseline, 20-sentence sample | 20 | 11 (55 %, 34.2-74.2) | 9 | 0 | about 3,700 a sentence |
| **Final, 40-sentence sample** | 40 | **17 (42.5 %, 28.5-57.8)** | 23 | 0 | 1,682 per model turn, 1.2 calls per model turn, 28,599 in all |

| Language | n | Right |
|---|---|---|
| English | 16 | 8 (50 %) |
| Tamil | 13 | **2 (15.4 %)** |
| Tanglish | 11 | 7 (63.6 %) |

This sample was run once, on the finished code, and I did not tune to it. The two samples differ and their intervals overlap, so this does not show that accuracy fell or rose against `main`. It does show that token cost fell by more than half, and that accuracy is not good enough, least of all in Tamil.

Where the 23 misses came from:

| Lane | Right | Wrong | What the misses look like |
|---|---|---|---|
| Rules (quick) | 10 | 10 | A confident wrong screen with no model involved, for example prices or cases where performance, why or nearby was meant. **This is the first thing to fix** |
| Planner | 5 | 11 | Four asked a clarifying question and two answered as chat where a screen was expected. Two more were dropped by the checker, one was refused, and the others picked the wrong intent |
| Frame | 2 | 0 | |
| General | 0 | 1 | "What is the capital of Australia?" was answered as chat, which is what the lane is for. **My scorer has no match from general to chat, so this one miss is the scorer's.** Counted fairly it is 18/40. I have left the figure as scored |
| Refuse | 0 | 1 | "Who wrote the book Mahabharata?" refused as private, in code. A false refusal |

17 of the 40 sentences used a model at all. Groq's limits sent several of those to `gpt-oss-20b` and `gpt-oss-120b` rather than `qwen3.8-27b`, by the ledger's ordering rather than by a 429. p50 for a model turn was 1,454 ms.

### Side conversation: 40 side sentences, 40 commands, no name

| | First run | Final |
|---|---|---|
| Side talk that acted | 3/40 (7.5 %) | **4/40 (10 %)** |
| Of those, Level B or C | 0 | 0 |
| Commands accepted | 36/40 (90 %) | 35/40 (87.5 %) |

The final run is slightly worse than the first. The address gate was widened after the review found ordinary wordings it got wrong, and this set was not used for that work. I left it there rather than tune to the set. By language, the false acts are Tamil 1/12, Tanglish 3/12 and English 0/16.

### Follow-ups

| Set | First run | Final |
|---|---|---|
| `followups.jsonl`, 20 | 6/20 (16 resolved in code) | 18/20 |
| `followups2.jsonl`, 20, written later and unseen at its first run | 15/20 in code | 15/20 in code |

**The gate's 18/20 was reached only on a set I had read while fixing the scorer and the frame, so it is no longer held out.** That is why the second set exists. On that set, 15 resolve in code and the other 5 go to the planner, whose answers were not scored. The fair reading of the gate is "15/20 unseen, plus whatever the planner adds".

### Tamil transcription: 100 SLR65 clips (60 clean, 40 noisy)

Noise is synthetic babble from 8 other clips plus pink noise at 10 dB, and is labelled so. Language forced to Tamil, with the place-name prompt, except for the race, which sees the site's language.

| Transcriber | CER | WER | Clean CER / WER | Noisy CER / WER | p50 | Capacity failures |
|---|---|---|---|---|---|---|
| `whisper-large-v3` | 0.140 | 0.504 | 0.156 / 0.517 | 0.115 / 0.486 | 447 ms | 0 |
| `whisper-large-v3-turbo` | 0.157 | 0.626 | 0.138 / 0.606 | 0.186 / 0.657 | 368 ms | 0 |
| **The shipped race, `hearUtterance`** | **0.131** | **0.503** | 0.143 / 0.511 | 0.114 / 0.490 | 546 ms | 0 |
| `gemini-3.5-transcribe`, 12 clips only | 0.127 | 0.340 | | | 2.6 s | see below |

The race read all 100 clips as Tamil with the site set to English. A WER near 0.5 is high: this is speech-corpus Tamil, and Tamil word boundaries inflate WER, but it still means about one word in two differs.

## Capacity failures, shown separately

| Run | What happened | How it is treated |
|---|---|---|
| Full Gemini transcribe pass, Phase 0 | 429 on 96 of 100 | **A capacity failure, not an accuracy score.** Only the 12-clip probe is quoted above. The ledger now caps this model at 20 a day, and it runs only as a third racer when Whisper is unsure |
| Bedrock probe | `AccessDeniedException`, bearer token expired | Rung off |
| Ollama probe | No reply in 60 s | Dropped, per the phase's cut line |
| Every run in the tables above | 0 capacity failures | |

## Barge-in, injected audio through the real worklet and Silero, PCM path

| | Measured | Target |
|---|---|---|
| Voice paused, from known speech start | p50 82 ms, p90 98 ms | p50 ≤ 150, p90 ≤ 250 |
| Detector fired | p50 82 ms | |
| Turn cancelled | p50 444 ms | |

No echo canceller and no real microphone are involved. The browser voice path cannot pause: it cancels and restarts the chunk.

## Latency, from the end of speech

**Mocked providers** (hear 450 ms, planner 1,200 ms, voice 400 ms), so these are the browser's overhead plus those constants. The p90s are inflated by clips that split at a pause.

| Mark | p50 | p90 |
|---|---|---|
| Acknowledgement | 776 ms | 3,141 ms |
| Answer on screen | 2,005 ms | 4,377 ms |
| First audio | 2,007 ms | 4,832 ms |
| First spoken finding | 2,007 ms | 4,832 ms |

**One real run, production build with real providers:**

Real Whisper, real planner and the real voice ladder in Edge, on the measuring build (`NEXT_PUBLIC_JARVIS_SPEC=1`, `next start`). Audio is injected. This is one run, with few samples, so read it as an indication only.

| Sentence, as heard | Lane | Ack | Answer on screen | First audio, and first spoken finding | Tokens |
|---|---|---|---|---|---|
| "Show the severe cases in Udyar." | rules | 760 ms | 781 ms | 896 ms | 0 |
| "Show me the flooding complaints in Vela Cherry." | rules | 827 ms | 864 ms | 875 ms | 0 |
| "What about the rain in Peringudi today?" | rules | 825 ms | 850 ms | 857 ms | 0 |
| "put together something useful for my morning." | planner | 788 ms | 2,820 ms | **2,826 ms** | 1,265 |
| "how is the metro water backlog looking overall?" | rules, by its token count | 726 ms | 751 ms | 755 ms | 0 |
| "Go to the trends page" | plain move, no speech | | | | 0 |

The rules' p50 for the first spoken finding is 875 ms. **Only one sentence in this run needed the model**, so 2,826 ms is one sample, not a planner figure. On that turn Groq returned a JSON 400 twice before an answer came, and that time is included. Place names came back misheard from English Whisper ("Udyar", "Vela Cherry", "Peringudi"), and the rules still found them. The earlier dev-server run is kept in `latency-real.json`; this one is `latency-real-prod.json`.

## Ambient listening, 10.1 minutes of room talk with nothing addressed to Jarvis

Detector and budget are real; the transcriber is mocked.

| | Before the budget fix | Final |
|---|---|---|
| Sentences spoken | 146 | 146 |
| Requests to the transcriber | 8 | 56 |
| An hour, at that rate | 48 | **334** |
| To the planner | 0 | 0 |

The number went up on purpose. The low-budget window used to re-arm under nonstop talk, so after 8 sentences unnamed commands stayed out for good. It now ends after its minute. So nonstop talk costs up to 8 requests a minute in bursts, and this figure is the worst case, not a typical room. The ledger records Whisper's cap as 2,000 requests a day, so nonstop talk at this rate would reach it in about 6 hours, and the budget would then fall back to listening for the name only.

## HUD

A 20-second `requestAnimationFrame` count in headless Edge, with the HUD over the console and nothing else running:

| State | fps | Worst frame |
|---|---|---|
| Speaking | 144.1 | 8 ms |
| Reduced motion | 144.1 | |

Screens are in `docs/jarvis/screens/`: 40 images, English and Tamil, at 1366 and 1920.

The target was a real display. Headless Edge is not vsync-limited, so those figures show headroom, not what a Collector's screen would show. A separate review of the HUD raised 25 findings. 1 to 5, 7, 9 to 16 and 18 to 24 were fixed. 6 was settled by amending the rule (96 px with a Stage open). 8 and 17 are partly fixed (see Tamil under Known limits in `HANDOVER.md`). 25 is the owner's call.

## Independent review of the finished code

Five reviewers each read one risk area, and one skeptic per area tried to refute each finding. Of 60 findings, **57 were upheld, 3 refuted**. Four were blockers:

- `spoken()` dropped the integer part of every decimal, so 33.4 °C was said as "4 °C".
- A barge-in's audio started at the previous sentence.
- Jarvis could press the Verify button, which closes a severe incident for the citizen, and a bare "Yes" that deletes a dataset.
- A provider that failed fast still waited out the hedge timer, which cost 3.5 s per rung and missed the 8 s gate with Gemini healthy.

**All four blockers were real, and the earlier tests had passed with them present.** All 19 highs were fixed or fixed with a stated limit. These are the ones not fully closed:

| Finding | Status |
|---|---|
| 46 (low): the browser discards a turn's facts at 8 s, and a non-OK round goes to the analyst | Not fixed |
| 51 (low): on non-answer screens the number gate approves whatever the screen's `say` holds, so a model's `q: "flood deaths 300"` could be said as "headlines about flood deaths 300" | **Not fixed.** A real hole in "every number from code", on a narrow path |
| 54 (low): Studio column lookup mismatch in `data.ts` | Partly: `safeHands` now redacts `map` and `dataset`, the lookup remains |
| 57 (low): the power-on's tone still plays once under reduced motion | Partly |
| 18: "Jarvis, don't draft" still reaches the planner at tier 1 | Fixed except this |
| 22: HUD panels now let clicks through and hide for the console's popovers, but have no close control and can cover content by sight | Fixed except this |
| 36: a phone number spoken in single digits, "9 8 7 6…", is not masked | Fixed except this |
| 37: some errands still act when engaged, for example "take me to the hospital" within 20 s of a turn; no Tanglish statement class | Partly, by design |

The review's fixes went in after the first-run numbers and before the final ones. **They were checked by unit and browser tests and by reading part of the diffs, not by a second independent review.** The address gate in particular grew a good deal in that work (`addressed.ts`, `wake.ts`), and the side-talk figure above did not improve.

Running the specs after the fixes also found one more real bug: a sentence that went on after a short pause lost its first part. The old re-ask behaviour had been hiding this. It is fixed, with a test.

## Not verified

- **A real microphone in a real room:** AEC, its echo margin, and Jarvis hearing itself through speakers. All barge-in and latency figures are from injected audio.
- **End of utterance at 300 ms in real speech.** It splits sentences in recorded fixtures.
- **A Tamil voice heard by a person.** Tamil speech through the browser path was not exercised; no Tamil voice can be captured on this PC. Tamil is covered by the ASR set and text-level tests.
- **The speech path on the signed-in console.** `/dev/collector` was used on the dry-run store with the typed path; the voice specs run on the dev harness.
- **Live captions within 150 ms.**
- **The Azure branch.** No key exists, so it has never run.
- **The Bedrock rung.** The token has expired.
- **A live hedge** firing against a slow real provider. It is unit-tested, and Gemini's schema path was proved with one live call.
- **The reticle's position on a loaded real map.**
- **Complete this data on a real Studio dataset**, and on real rows through `slots.ids`.
- **HUD fps on a real display**, and the CSS fixes for finding 22 and 40 beyond the screenshots.
- **The planner's answers on the 5 unseen follow-ups** it was handed.
- **Whether the review's fixes introduced new defects** beyond what the tests catch.

## Conditions that affected measurement

The final real-latency run overlapped the 10-minute ambient run on the same laptop, to fit the session's time limit. That can only slow it. The screens and fps were re-run afterwards with nothing else running. Quota use for the day came from these runs on one Groq organisation, so do not demo within 24 hours.
