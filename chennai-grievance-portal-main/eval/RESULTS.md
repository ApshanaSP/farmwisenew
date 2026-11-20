# Jarvis mode: results

## v10: the owner's "version 9" (19-20 Nov 2026)

Branch `claude/jarvis-v10-49ea0b`, from v9's tip `0a4b0245` (also GitHub `main`). The brief: `docs/jarvis/JARVIS_V10.md`; the research: `docs/jarvis/v10-research/`; the log: `docs/thunai/BUILD_LOG.md` (v10). **Not merged, no PR: the owner decides.** Final code: `65917112`.

**The news changed overnight.** The console's store rebuilt its news between the two days (the panel went from 28 stories to 13), so every comparison below is v9 and v10 run on the same day's store, each in its own checkout (v9: `0a4b0245`, the runner copied in untracked).

### The blind set (written before any fix, hashed, never read)

`eval/v10/blind/set.json`: 103 spoken requests a helper wrote without seeing the code or `eval/` (names by ear, screen references, intelligent reading, news, Ask the Map, dashboard controls, side talk, cut-off lines, new features; English 42, Tamil 31, Tanglish 30; 28 with speech-to-text slips). Hashed into `eval/v10/HASHES.txt` (`0f9e01e1…`) and committed (`c1d30933`) before any fix; only totals were read in this session.

| | v9 (`0a4b0245`) | v10 (`65917112`) |
|---|---|---|
| Dry (the code lanes, no model) | 16/103 | 39/103 |
| **Live** (Haiku leading, answers on, 20 s apart; the store of 20 Nov) | **20/103** | **48/103** |
| Paired, live | right only in v9: **0** | right only in v10: **28** (exact McNemar p ≈ 7×10⁻⁹) |
| The reply's language | 84/90 | 87/90 |
| The turn's own time in the runner (p50 / p90) | 2.16 / 5.60 s | 1.76 / 4.15 s |

| Kind (live) | Items | v9 | v10 |
|---|---|---|---|
| Names said by ear | 17 | 1 | 6 |
| Screen references ("the fast one", "the second last") | 14 | 0 | 5 |
| Intelligent reading (the brief, "read it fully", another language) | 12 | 0 | 7 |
| News | 12 | 2 | 3 |
| Ask the Map by voice | 18 | 0 | 7 |
| Dashboard controls | 12 | 4 | 6 |
| Side talk kept silent | 8 | 7 | 8 |
| Cut-off lines | 5 | 5 | 5 |
| New features (tour, field visit, news to ground truth) | 5 | 1 | 1 |
| English / Tamil / Tanglish | 42 / 31 / 30 | 9 / 5 / 6 | 20 / 14 / 14 |

A first live run of v10 (36/103) passed only v7's aide to the news events, so "read" there was v7's recital, not v10's brief, and the brief's offer was never kept: the runner was made to read as `news/route.ts` and Thunai.tsx do (`f84113c1`), and the set run once more on the final code. v9's live run is the same on both days (20/103, the same items).

### Regression sets

| Set | v9, the same day | v10 |
|---|---|---|
| v8's dev set (`eval/v8/dev`, 105), dry | 100/105 | 100/105 (none lost) |
| v8's dev set, live | 102/105 (v9's own run on 19 Nov; v8 103/105 beside it) | **103/105** (language 92/92); the two left are the panel's positions whose stories moved (d-ref-11, d-ref-12, as in every version's dry run) |
| v9's blind set (`eval/v8/news9`, 60; seen: regression only), dry | 23/60 | 35/60 |
| news9, **live** | **24/60** (language 58/60) | **35/60** (language 60/60); paired 12 right only in v10, 1 only in v9 (fixed after: `65917112`) |
| The owner's own turns (`eval/v10/replay`, 27, local, never committed), dry | — | 16/27 (11 left to the planner) |
| The owner's own turns, **live** | — | **24/27** |
| A fresh development set (`eval/v10/dev2`, 122; written blind to the code on 20 Nov), dry | 32/122 | 60/122 |

The owner's turns left: "Open the GCC issue." over the panel (its story left the panel overnight), and two lines the speech-to-text garbled past reading ("ETHUK ENDOFICER RESPONSIBLE?", "தக்காலி பிரைச்சென்னை நிகியும்."); the planner asked back on the last. The ones v9 got wrong and v10 now gets right include "Tell me about Cyclone Aquan." (Cyclone Akvan's story with the rain gauges), "Tell me about the fast news." (the first), "Tell me about the" (held, joined to its rest), "Javes, Goto News." (Jarvis's name by ear; "goto" is "go to"), and "Alexa ..." and fillers kept silent.

### Hearing: Sarvam with and without the day's keyterms

`src/lib/thunai/sarvam.live.ts` with `SARVAM_BENCH_SET=v10`: 71 synthetic clips (v6's 40, v8's 11, v10's 20; Windows' and Gemini's voices, no person), each through the shipped `hearUtterance` in shadow (Whisper decides, Sarvam heard alongside) and in the owner's `tamil` mode, twice: with v9's fixed zone list as Sarvam's keyterms, and with the day's 50 news names.

| | Whisper | Sarvam, v9's list | Sarvam, the day's names | `tamil` mode, v9's list |
|---|---|---|---|---|
| Word error, all 71 | 0.330 | **0.127** | 0.156 | 0.154 |
| English / Tamil / Tanglish | 0.171 / 0.461 / 0.614 | 0.052 / 0.238 / 0.208 | 0.082 / 0.213 / 0.291 | 0.102 / 0.238 / 0.200 |
| The language right | 0.859 | 0.944 | 0.944 | 0.944 |

Sarvam's call: 240 ms at p50, 351 ms at p90. Paired by clip, the day's names made Sarvam worse on 9 clips and better on 1, and once wrote a storm's name into an unrelated question ("Teynampet இந்த week" as "அக்வான் இந்த week"); the one gain ("Cyclone Aquan" heard as "Akwan") the names-by-ear layer makes after hearing anyway. So the console keeps v9's list; the day's names are opt-in (`JARVIS_SARVAM_DAY_KEYTERMS=1`). Each run billed 528 s, Rs 4.31 before GST.

### Latency on real providers

`tests/e2e/real6.spec.ts` (real Whisper, Edge's natural voices, synthetic clips; ms from each clip's true end of speech; each cell **n · p50 · p90**). v9's bundle (`.next-v9f`, `0a4b0245`) then v10's (`.next-v10f`, `65917112`), each served on port 3012 by `scripts/jarvis6/serve-real.sh` (Claude off, Groq leading, the dry-run store). The tables: `eval/v6/latency/compare-v10cmp-v9-v10cmp-v10.md`, `compare-v10q-v9-v10q-v10.md`.

| Moment | v9 | v10 |
|---|---|---|
| Wake, open, all -> first audible reply | 48 · 555 · 603 | 48 · 546 · 609 |
| Wake, open, "Hey Jarvis" | 18 · 202 · 218 | 18 · 195 · 213 |
| Wake, closed -> first audible reply (fired 4/12 on both) | 4 · 164 · 168 | 4 · 165 · 176 |
| Command -> the screen changes | 10 · 859 · 1,956 | 10 · **806 · 1,405** |
| Command -> first sound | 12 · 308 · 340 | 12 · 293 · 324 |
| Question -> first sound (the tone) | 36 · 404 · 423 | 36 · 399 · 427 |
| Question -> first word of the answer, first run | 33 · 2,431 · 4,716 | 34 · 3,950 · 5,968 |

**The first run's question line is not like for like.** Groq's free day ran out during v10's run (the ledger: all three Groq text models at their 200K-token day), and the answer writer fell back to Gemini Flash-Lite for 5 of v10's 11 Tamil questions and none of v9's; even on Groq one call varied by seconds between the runs. So the question parts were run again for both, back to back on a quiet machine, both on the same writer (Gemini Flash-Lite, Groq's day spent):

| Moment, the re-run | v9 | v10 |
|---|---|---|
| Question -> first sound | 36 · 405 · 429 | 36 · 401 · 422 |
| Question -> the whole answer in hand | 33 · 1,149 · 3,746 | 34 · 1,112 · 4,543 |
| Question -> first word of the answer | 33 · 4,646 · 6,561 | 34 · 4,900 · 8,218 |
| Transcript at the page | 36 · 839 · 881 | 36 · 833 · 897 |

**Paired by clip** (the median of v10 − v9, 33-34 pairs): first word **+22 ms**, the answer in hand **−13 ms**, transcript to answer **+4 ms**: the same route (the planner) and the same writer with the same token counts on every clip; single calls swing both ways by up to two seconds, which is the p90's movement. **Load:** v9's first run ran beside the live dev run, v10's on a quiet machine (a bias toward v10); the re-runs had the same conditions. None of the moments is measurably worse than v9; the command's screen change is faster (p90 −551 ms).

### The owner's asks on the real path

`real6.spec.ts` part `owner10` (20 synthetic clips of the owner's asks: Windows' voices, two Tamil lines by Gemini's; `tests/e2e/fixtures/v10`), played into the dev console's microphone stream on v10's measuring bundle, Claude as shipped (Haiku leading), real speech to text (Sarvam in `tamil` mode, as the owner's console), Edge's voices; the rows in `eval/v10/real/` (local). Two runs: the first found two defects, fixed test-first before the second (`a26d1df6`): "Jauvis, Go to news." searched the news for "Jauvis" (Jarvis's name now one shape, not a list); and the dev console's news route, a twin of the console's, had none of v10's additions (the brief, the weather, the meaning ranker), so its reading was v7's recital.

| Ask | The second run |
|---|---|
| "Tell me about Cyclone Aquan." (heard "Aquin") | **the brief**: "BBC reports that Cyclone Aquan is centered 840 km from Chennai ... The storm touches the district with heavy rain warnings across Chennai. The console shows ..." |
| "Tell me about the" ... "Puzhal jail drugs story." | **held, joined, read**: The New Indian Express's Puzhal story |
| "Read it fully." | **the whole story**: "... in full: about two minutes. Say stop any time." |
| "அக்வான் புயல் பத்தி சொல்லுங்க." | **in Tamil**, Dinakaran's Akvan story |
| "Sign out." | **refused**: "That one is yours to tap." |
| "Hide the severe pins." | first run (heard "Seavio") **hidden**; second (heard "Civia") the planner's severe list |
| "Tell me about the fast news." | a story read (the dev console shows no news panel, so "the first" of a list was not tested here) |
| Ask the Map, the tour, the alerts bell | **not testable here**: the dev console has no Ask the Map ("I can't do that on the map here") and no dashboard |
| "What do we have on this?", the three side-talk lines, two map questions | **not heard**: they played while Jarvis was still reading a long answer, and nothing was transcribed (the same in both runs) |

So the real path shows names by ear with the brief, the cut-off join, the full read, Tamil, and the never-pressed control. Ask the Map, the tour, the controls, side talk and news to ground truth rest on their unit tests and the evaluation sets (the blind set's Ask the Map 0 → 7 of 18, controls 4 → 6, side talk 7 → 8); they have not been seen working in a browser.

### The independent reviews

- **The second review of v9's diff** (carried from v9): 31 findings confirmed, each by a probe that failed on v9's code; all fixed test-first (`a7429f4d`; `review9b.v10.test.ts`, `review9m.v10.test.ts`).
- **The review of v10, before the finals**: five read-only reviewers by area (names and the gate, news, reading, Ask the Map, controls); a finding counted only when a probe reproduced it. **44 confirmed** (13 high). Fixed in four rounds, each a failing test first, each checked by a read-only skeptic: 44, then the 32 problems the skeptics found in those fixes, then 24 more, then the last 12 high ones (`7847273f`). Among them: a complete question ending in "is" held as cut off; "ஆமாம்" (yes) silenced as hearsay; rain and flood news taken by Rain & flooding; a brief able to say "no open cases" when there were four; any sentence with "message" typed into an open draft; a privacy refusal reaching the news writer with news on screen.

### The gates (`ef94846e`, then `65917112`)

`tests/qa/pass7/gate-fast.sh` on a clean tree, run on `8d238c50` (three test failures and a lint error, all in tests, fixed in `f84113c1`) and again on `ef94846e`: type check, lint, the production build, the four shuffled unit runs (8,184 tests each, 0 failures), the pass 7 tests, the guards, the access matrix (3,303 requests, no 5xx, no problems), the browser drive (28 pages, none with a problem) and the Collector's Jarvis journey j1 all passed. The golden master against pass 7's recording differs as v9's gate did, plus v10's new lexicon route (5 requests). One failure, environmental: pass 4's `audit-ui_honesty-11` is an `it.fails` for a git-lfs pointer, and every checkout here holds the real 278 MB model (so v10's meaning ranker loads in the owner's console too). On `a8e5ef06` (the final v10 code): the same, every step passing but that one; its evidence committed (`65d8c82c`).

**The Jarvis browser specs** (`tests/e2e`, providers mocked at the browser, on a production bundle built with `NEXT_PUBLIC_JARVIS_SPEC=1`): 31 passed (mode 14, barge-in 5, hold 5, the mocked latency 3, aide 2, VAD 2), 69 skipped by design (the real-provider specs need `REAL=1`). Three failed, none from v10: `hud.spec`'s screens open `/dev/collector`, which is off in production builds by design (unchanged since v9; it runs on the dev server only), and `pass4-client-fixes` BUG-012 needs the QA harness's own server on port 3135. The HUD screens were not re-run on the dev server.

**With `main`** (Apshana's live traffic and city data work; first tested as a merge with `7f3b3d94`, `bc0e1034` on the v10 branch; `main` itself holds her own merge of v10, `cf03535f`, and the two guard fixes on top): type check clean, 8,375 unit tests pass across `src`; the QA gate on `bc0e1034`: type check, lint, the build, the four shuffled unit runs (8,388 tests each, 0 failures), the pass 7 tests, the guards, the access matrix (no 5xx, no problems) and j1 pass. Three findings new against v10's own gate, all in `main`'s new code (left for Apshana: her work is final): pass 4's `g2-cache` class guard names three timed caches over the store that neither follow the data epoch nor say why (`lib/city/now.ts`, `lib/city/traffic.ts`, `lib/live/imd.ts`), and its epoch test timed out (180 s); the browser drive counts 4 pages with problems, among them two serious accessibility findings (`definition-list`, `dlitem`) on the citizen's track-complaints page at desktop width, which `main` changed and v10 did not. And again pass 4's environmental `audit-ui_honesty-11`.

### Not verified

- **No real microphone, no real room, no Tamil speaker**: every clip is synthetic, and the Tamil and Tanglish wording (the brief's, the controls' and map's phrasings) is model-written.
- **Ask the Map, the narrated tour, the field visit and the dashboard's controls were never seen in a browser**: the real-path harness is the dev console, which has neither; on the console they rest on unit tests (the map lane 57, mapops 24, controls 171 + 287 page tests on a linkedom page) and the blind set.
- **Side talk and news to ground truth on the real path**: the clips were not heard (they played over Jarvis's long read).
- **Sarvam on the owner's own voice**: the console has logged no Sarvam turn since Tamil mode went on (19 Nov 15:35).
- **Speaker verification**: researched only (`docs/jarvis/v10-research/30-side-talk.md`); it needs the owner's yes and an enrolment.
- **Sarvam's streaming and "ask instead of guess"**: Sarvam's REST reply gives only `language_probability` (no word confidences; `10-sarvam-catalogue.md`), and with no real-voice data there is nothing to set a threshold from.

## v9: v8's news-matching misses (19 Nov 2026)

Branch `claude/dazzling-torvalds-52b811`, built on v8's tip `7fa525fb`. On the owner's yes (19 Nov), `main` was fast-forwarded to it, which brings v5 to v9 into `main` together. The task: fix the miss classes v8's section lists under "Where v8 still misses", each with a failing test first, and measure the fixes on a fresh blind set run once against v8's own commit.

### The blind set, before any fix

`eval/v8/news9/set.json`: 60 requests (news by topic 22, news questions 16, ordinals and outlets on the console's news panel 14, console controls 8; English 24, Tamil 18, Tanglish 18; 20 with speech-to-text slips). Written by a helper that saw neither the code nor `eval/v8/`, only the store's stories (`EVAL8=ref`, 19 Nov 09:43: today's panel of 27 and this week's 120); hashed (`eval/v8/HASHES.txt`, sha256 `f5494087…`) and committed (`d47973e3`) before any fix. **One leak to state:** the helper's report back named its slipped and colloquial words (among them "Kathi para", "N D T V", "Malai Malar", "current thiruttu", "kosu", "current cut"); I saw those words, not the items. The fixes follow v8's miss classes and were written as tests before the report arrived (`news9.v8.test.ts`); the three colloquial words it named ("current", "thiruttu", "kosu") are left out of every new word list on purpose, so those items measure nothing they were tuned on.

### What changed (each with its failing test first; `news9.v8.test.ts`, then `news9r.v8.test.ts` for the review's findings)

| Class (v8's list) | v9 |
|---|---|
| Acronym said letter by letter ("I O C L") | joined in the tokenizer, request and headline alike (`b07c1530`) |
| Place split or spelt by ear ("Kasi medu", "Pattinapakam", "Kodungayur", "Vandaloor") | a split name matched joined, story by story, only on a headline word its parts are not, by spelling; spellings by ear already folded to one key in v8 (their misses were the lane) (`a37876d3`, `f98d938f`) |
| Outlet misheard ("Deccan Chronical", "ETV Bharath") | outlets read word by word, exact then by ear (a long name's word, no English word); The Indian Express is no longer The New Indian Express (`4464efac`, `6c92d7f0`) |
| Colloquial Tamil left in the topic ("பத்தின", "-வுல", "மிரண்டு ஓடின") | the spoken forms around a topic are the request's own; -வுல and the accusative's sandhi are case endings; a spoken verb costs a story that lacks it a fifth of a word; a gloss of event and civic nouns lets a Tamil request find an English headline (`405fce85`, `67f592ec`, `e790e466`) |
| Tamil ordinals past the fifth ("ஏழாவது"), "the last one" | ord8.ts reads positions to the twelfth in three languages; on the console's news panel "the seventh one", "the last one" are its stories (`6b44279e`, `31efc7fd`) |
| "open the X protest" with no news word | a soft search: a named event (not a place alone, not plural, no console word, no case in focus), taken only above 0.7 and only a story with the event and its naming word; nothing that close, the console's lanes as in v8 (`e7a0cc3b`, `79db9ef1`, `d1ec89b0`) |

### The independent reviews

**First review**, after the six classes were built and before the blind run. Finders by area (matcher, routing, Tamil, wiring, speed) worked over the v8-to-v9 diff, and a verifier reproduced each finding against the code before it counted. 33 were confirmed: 10 high, 13 medium, 10 low. 29 of them were regressions against v8. Two examples:
- "Marina beach" said in full vetoed every story that writes "Marina" alone.
- The gloss for தீ (fire) caught the தி in தி.மு.க. and தி.நகர்.

All 33 were fixed, each with its failing test first (`news9r.v8.test.ts`, commits `f98d938f` to `e790e466`).

**Second review**, of those fixes. It started, then stalled on the Claude plan's five-hour usage limit, and was stopped. It is carried to v10 as that build's first step (`docs/jarvis/JARVIS_V10.md`, Part 8). So the fixes after the first review have had no independent review yet.

### The blind set, once (v8's own commit against v9)

Run once, after every fix and the first review, on 19 Nov from 14:15 to 14:26 IST. v8's commit `7fa525fb` ran in a separate checkout and v9 at `e790e466`, side by side, on the same store build (`2026-11-19 10:23:57`):

| | v8's commit | v9 |
|---|---|---|
| No model (`final9dry`) | 14/60 | 23/60 |
| Live, Haiku leading as shipped (`final9live`) | 15/60 | 24/60 |

By kind and language, live:

| | n | v8's commit | v9 |
|---|---|---|---|
| News by topic | 22 | 2 | 3 |
| News questions | 16 | 7 | 10 |
| Ordinals and outlets on the news panel | 14 | 0 | 5 |
| Console controls, and one question | 8 | 6 | 6 |
| English | 24 | 8 | 15 |
| Tamil | 18 | 3 | 5 |
| Tanglish | 18 | 4 | 4 |

Live, v9 gained 10 requests and lost 1.
- **Gained:**
  - the acronyms said letter by letter (D R I, I O C L);
  - "Veera Mani";
  - the Tamil "சைபர் மோசடி பத்தின செய்தி";
  - "Tiruvotriyur la enna nadandhuchu";
  - the panel's 7th, 11th and 12th, and the Tamil 8th;
  - "Malai Malar".
- **Lost:** "Palli karanai construction ban news padinga". v9 opened the Tamil headline of the same Supreme Court ban; v8 opened an English one. The set's answer names only English words, so it counts as a miss.

**The panel moved between the set's writing and the run.** The writer saw today's panel at 09:43, with 27 stories. The runs' store build had 25, and only one story kept its place.
- Positions ("the seventh one", "number 11") are scored against the panel at run time, so they are unaffected.
- The five requests whose answers name a headline from the 09:43 panel are affected. Against the run-time panel:
  - v9's answer to "the last one on the list, open it" was right: it opened the run-time last story, in its Tamil headline;
  - NDTV and Makkal Kural had no story on the panel;
  - DT Next had four.

The scores above stand as measured.

**Where v9 still misses** (the live rows, read after the run; for v10, `docs/jarvis/JARVIS_V10.md`):
1. **"நியூஸ்" is not a news word.** The Tamil-script spelling of "news", which Whisper writes, is not on v9's list, so "புழல் ஜெயில் நியூஸ் படிங்க" makes no news request at all. v8 had the same gap. Six of the set's Tamil requests made no news request at all for this reason.
2. **A story described with no news word gets no news request.** That is 13 of the 22 topic requests: "adha padinga", "அத காட்டு", "pull up the ... thing", "show me the ... one". The console's rules or the planner take them, and the planner searched the news for none of them. v9's soft search needs an "open"-type verb and an event word from a fixed list. It fired on two (the D R I seizure, the I O C L fire).
3. **Weather words take news questions.** Two examples: "மழை பத்தி என்ன நியூஸ் இருக்கு?" and "what's the latest on the cyclone". This is the same fault as the owner's own "Tell me about Cyclone Aquan" (19 Nov, in the local audit log). The instant lane answered it and the news was never searched.
4. **Ordinals past the twelfth.**
   - "இருபதாவது" (20th) and "pathinettavadhu" (18th) go to the planner, which does not read them.
   - "irubathi naalavadhu" (24th) and "irubathi rendavadhu" (22nd) are read as the 4th and the 2nd. That is a wrong story read, the worst kind of miss.
5. **Tamil describing an English headline** in words no gloss covers. For example, the Collector flagging off vehicles for persons with disabilities.
6. **Outlets.**
   - An outlet said in Tamil with a case ending ("மக்கள் குரல்ல") is not read as one.
   - When an outlet has several stories on the panel, v9 opens one instead of asking which.
7. **Two console commands that v8 and v9 both miss:** "open the drainage complaints for Ambattur" and "map la Manali zone kaattu".

The probes behind items 1 and 2 are local (`probe9e`, `probe9f`, not committed).

### Regression checks

v8's dev set (`eval/v8/dev`, 105 requests), v8's own commit (`7fa525fb`, a separate checkout) against v9, started together on the same store build (`2026-11-19 10:23:57`):

| | v8's commit | v9 |
|---|---|---|
| No model (`devdry1`) | 100/105 | 100/105, every row the same |
| Live, Haiku leading as shipped (`devlive1`) | 103/105 | 102/105 |

The one live difference is the Tamil "எந்தத் துறை மெதுவாக இருக்கு?" (which department is slow?), a planner turn neither version's lanes touch (the server's round imports nothing v9 changed): in the paired run v9's call found no model (both runs shared Haiku's minute window), and alone it came back an empty plan once and right once; v8's commit was right in all three tries. v8's own notes record the same sentence as "Haiku's empty plan" (RESULTS v8, `live2`). (The two dev reference misses in both are the panel's positions: the store's panel has moved since the set was written on 18 Nov.)

### Sarvam, measured for the first time

The owner made a Sarvam account on 19 Nov and put the key in `.env`. v8's bench (`src/lib/thunai/sarvam.live.ts`, `SARVAM_BENCH=1`) then ran 40 synthetic clips through Whisper and Sarvam `saaras:v4` (codemix, with v8's fixed keyterms). These are synthetic voices, not the Collector's. The result is local, in `data/thunai/sarvam-bench.json`.

| Word error rate | n | Whisper (the race) | Sarvam |
|---|---|---|---|
| All | 40 | 0.369 | 0.146 |
| English | 14 | 0.077 | 0.042 |
| Tamil | 14 | 0.452 | 0.258 |
| Tanglish | 12 | 0.612 | 0.138 |

- **Language right:** Whisper 0.90, Sarvam 0.975.
- **Time:** the Sarvam call took 281 ms at p50 and 403 ms at p90; the Whisper race took 439 ms and 683 ms.
- **Cost:** 80 calls, 316 billed seconds, Rs 2.58 before GST, from the free signup credit.

`JARVIS_STT_SARVAM` stays off until the owner sets it (`docs/jarvis/SARVAM.md`). The next step is `shadow` on the owner's own voice, then `tamil`; that is the owner's decision, in `docs/jarvis/JARVIS_V10.md`.

### Spend

- **Claude:** the ledger moved from US$1.050 to US$1.136 across the two live blind runs (US$0.086). That includes two of the owner's own console turns made at the same time.
- **v9's build as a whole:** from US$0.919 at v8's end to US$1.136, so US$0.217. That includes the owner's own console sessions on 19 Nov.

### Gates

- **Jarvis unit suites** on `e790e466`: 218 files and 3,389 tests, all passed. Lint is clean.
- **The QA gate** (`bash tests/qa/pass7/gate-fast.sh`) ran on a clean tree at `43fbbed8`, 14:31 to 15:01 IST. It came out the same as v8's gate on every check:
  - Type check, lint and the production build pass.
  - The unit suite under four seeds and time zones: 6,762 passed and 0 failed each time (13 pending).
  - Pass 7's lane tests: 769 passed. Collector-ops real-path: 24 passed. The src guards: 39 passed.
  - Pass 4's real-path suite: 2,648 passed and 1 failed, `audit-ui_honesty-11`. That test fails in any checkout holding the real search model rather than its git-lfs pointer; it failed in v8's gate too.
  - The golden master against the previous gate's recording: 89 changed, 37 added, 12 removed. v8's was 91, 35 and 10, on the same routes. The noise floor is the same 3.
  - The access matrix shows the same two cells as v7's and v8's gates.
  - The browser drive: 28 pages, none with problems. The Collector's Jarvis journey: every step clean.
  - **One tooling fault:** `tests/qa/seed-local-users.mjs` stops at "no such function: pii_enc". The cause is main's encrypted personal details, `f830efbd`. The matrix and drive came out the same as v8's anyway. Left for v10.

## v8 (18-19 Nov 2026)

Branch `claude/jarvis-v8-700c5f` from v7's `22304da4`; the brief and the plan are `docs/jarvis/JARVIS_V8.md`, the research `docs/jarvis/v8-research/`. The goal, in the owner's words: "think like the world's best AI assistant", understanding "very high", "more powerful", "don't make me run again". The owner's five examples are the spine; every number below is from a result file named beside it (local where the rows hold a citizen's words).

### Capacity, spend and blocks, before any number

- **Claude spend:** the owner's record (`data/thunai/claude-budget.sqlite`) held **550 rows, US$0.147505** when first read (21:30, 18 Nov; v8's first call was at 22:36) and **992 rows, US$0.918660** after the last call (01:21, 19 Nov): v8's runs spent **US$0.771** (442 calls) of the US$10 ceiling (`JARVIS_CLAUDE_BUDGET_USD=10`), of which Sonnet 5.5 US$0.697 (156 calls; Haiku 286 calls, US$0.074). The estimate before the finals was about US$4.5, at most about US$6.
- **Jarvis's own Claude day cap** (1.5M tokens and 500 requests a model, set in v4 against Opus's prices) was raised for the runs by flag (`JARVIS_CLAUDE_DAY_TOKENS=8000000`, `JARVIS_CLAUDE_DAY_REQUESTS=3000`); its per-minute window (50,000 tokens a model, shared by every process on the laptop through the ledger) is why the Claude-heavy runs ran one model at a time.
- **Groq** carried Whisper for every real-path run (well inside its day: about 1,700 audio-seconds of 28,800 at the check); its planners were only a rung behind Claude. **Gemini 3.1 flash-lite** judged (a different family from the models judged).
- **Not called at all:** Sarvam (no account, no key: mocked and synthetic-fixture tests only), `claude.live.ts`, `claude.v4.live.ts`, `deploy.live.ts`.

### How understanding was measured

- **The dev set** (`eval/v8/dev/set.json`, 105 requests, for tuning) and **the holdout** (`eval/v8/holdout/set.json`, 111 requests: English 61, Tamil 21, Tanglish 29; about 17 with speech-to-text slips, by the set's own description; written by a helper that saw neither the code nor the dev set, hashed in `eval/v8/HASHES.txt` before any fix, run **once**, at the end). Each request carries its screen, earlier turns, the open mic's timing and the ears' label; the gold is what a right answer does (the story, the language, silence for side talk, a screen).
- **The runner** (`src/lib/thunai/v8/eval8.live.ts`) sends each through the addressee gate, the browser's lanes (`v8/browser.ts`, the function the console runs) and the server's round on the dry-run copy of the console's store. **v7's side is v7's own commit** (`22304da4`, a separate checkout) with the same runner, not v8's rollback switch.
- **The real path** (`tests/e2e/real6.spec.ts` part `owner8`): the production bundle, synthetic clips from Windows' voices, real Whisper, real models, Edge's voices; every word Jarvis says recorded with its voice and language.

### Understanding: the dev set (tuning)

| Run (`eval/v8/dev/results/`) | All | Owner's examples | News by topic | News questions | References | Follow-ups | Side talk | Language |
|---|---|---|---|---|---|---|---|---|
| v7's code, no model (`dry0-v7`) | 46/105 | 1/8 | 1/20 | 3/12 | 4/12 | 6/10 | 9/14 | 81/92 |
| v8 final code, no model (`dry-v8`, `c9e32c1a`; 3 left to the planner count as misses) | **102/105** | 8/8 | 20/20 | 12/12 | 12/12 | 9/10 | 14/14 | 92/92 |
| v8 live, Haiku leading, deep model off (`live1-v8`, before the reviews) | 104/105 | 8/8 | 19/20 | 12/12 | 12/12 | 10/10 | 14/14 | 92/92 |
| v8's lanes switched to v7 (`live1-v7`, `JARVIS_UNDERSTAND=v7`) | 54/105 | 1/8 | 1/20 | 4/12 | 5/12 | 10/10 | 9/14 | 80/92 |
| v8 live after the review fixes (`live2-v8`) | 100/105 | 8/8 | 19/20 | 9/12 | 12/12 | 10/10 | 14/14 | 91/92 |

`live2`'s four news slips came from the review fixes and were fixed test-first (`c9e32c1a`); the fifth miss was Haiku's empty plan on a Tamil "which department is slow?" (the deep model, off in that run, takes those).

### Understanding: the holdout (once, at the end)

`eval/v8/holdout/results/` (hash checked; v7 from its own commit). The rows hold the requests and answers: local.

| | v7, Haiku leading (`final-haiku-v7`) | **v8, Sonnet 5.5 leading** (`final-sonnet-v8`) | v8 as shipped: Haiku leading, Sonnet deep (`final-haiku-v8`) |
|---|---|---|---|
| All (111) | 44 (39.6 %, Wilson 31.0-48.9) | **76 (68.5 %, 59.3-76.4)** | 75 (67.6 %, 58.4-75.6) |
| The owner's examples (6) | 1 | 5 | 5 |
| News by topic (22) | 0 | 9 | 9 |
| News questions (14) | 2 | 6 | 6 |
| References (14) | 3 | 8 | 7 |
| Follow-ups (12) | 9 | 11 | 11 |
| Side talk (16: 11 said to someone else, 5 to Jarvis) | 11 | 14 | 14 |
| Language items (10) | 6 | 9 | 9 |
| Commands (6), questions (6), outside (5) | 4, 3, 5 | 5, 4, 5 | 5, 4, 5 |
| English (61), Tamil (21), Tanglish (29) | 22, 10, 12 | 40, 16, 20 | 38, 16, 21 |
| Reply in the Collector's language | 86/98 | 95/98 | 95/98 |
| Turns a model answered | Haiku 38, Groq 1 | Sonnet 22 | Haiku 16, Sonnet (deep) 6 |

**Paired** (the same 111): right only in v8 33, only in v7 1, exact McNemar p = 4.1e-9. The as-shipped run (00:57-01:08) shared Claude's minute windows with the live-60 run, a stray process (below) and the latency run; it had no capacity failure, but the deep model may have been skipped on a turn or two. As shipped against v7: 32 and 1, p = 7.9e-9. **Sonnet leading against as shipped: 76 and 75** (right only in one 2 and 1, p = 1.0): on understanding, Sonnet leading buys nothing measurable here. As shipped, the deep model was asked on 6 turns and 3 were right, the same 3 as v7 and as Sonnet leading; two of the six were the two lines said to someone else that the gate let through (h-owner-6, h-side-6), which it then answered.

**The addressee** (the 13 lines said to someone else, the 98 said to Jarvis): v7 answered 5 of the 13 (false wakes) and silenced 5 of the 98 (missed requests); v8 (Sonnet-led) answered 2 and silenced 1. As shipped: 2 and 1, the same.

**Where v8 still misses** (read after the one run; nothing was tuned on it): news by topic 13 of 22 and news questions 8 of 14. The stories are in the store; the misses are the matcher's and the lane's: an acronym spoken letter by letter ("I O C L"), a place split or spelt by ear ("Kasi medu", "Pattinapakam", "Kodungayur", "Vandaloor"), an outlet misheard ("Deccan Chronical", "ETV Bharath"), colloquial Tamil postpositions and verbs left in the topic ("பத்தின", "-வுல", "மிரண்டு ஓடின"), "open the X protest" or "the IOCL fire, open that" with no news word and nothing on the screen (v8 sends those to the planner by design), Tamil ordinals past the fifth ("ஏழாவது"), "the last one". Each class needs a fix and a fresh blind set to measure it (the follow-up).

**The blind judge** (Gemini 3.1 flash-lite, both orders, the holdout's answers): **v8 with Sonnet leading preferred 39, v7 20** (identical answers 34, split 14, no verdict 4; exact sign test p = 0.018); **v8 as shipped preferred 31, v7 21** (identical answers 37, a tie in both orders 1, split 8, no verdict 13: Gemini busy or failing; p = 0.21, not significant). By kind (Sonnet-led): the owner's examples 5-0, news by topic 13-4, news questions 7-3, references 3-2, follow-ups 4-1, side talk 2-3, language 3-4, commands 1-1, questions 1-2; by language English 23-9, Tanglish 7-6, Tamil 9-5. Of v7's 20 wins, 11 are requests both runs got wrong and 5 both got right (the same answer writer, worded differently); as shipped, 7 and 10 of 21. The judge files: `final-sonnet.judge-gemini-3.1-flash-lite.json`, `final-haiku.judge-gemini-3.1-flash-lite.json`. A first judge run was void (77 of 111 without a verdict: the judge's model was not in the gateway's Gemini pool); it is set aside.

### Understanding: live-60 (once, at the end, Sonnet 5.5 leading, `JARVIS_AIDE=0`)

`HOLDOUT=planner2 HOLDOUT_DIR=holdout2 HOLDOUT_SET=live60 HOLDOUT_TAG=v8final`; only the runner's printed summary was read.

| | v7 final (Haiku leading) | **v8 final (Sonnet 5.5 leading)** |
|---|---|---|
| All | 46/60 | **46/60** (76.7 %, Wilson 64.6-85.6) |
| English | 13/15 | 13/15 |
| Tamil | 24/30 | 24/30 |
| Tanglish | 9/15 | 9/15 |
| Code lanes (no model) | 16/21 | 16/21 |
| The model's turns | Haiku | Sonnet 30/39 |
| Capacity failures, fallbacks | 0 | 0, 0 (Sonnet first on every ladder) |

**The regression check holds: understanding on v7's sentences is v7's** (the target: no worse); it did not rise, as it did not from v6 to v7. live-60's sentences are planner turns about the console; v8's new lanes (news by topic, news questions, references, side talk, the reply's language) are what the holdout above measures. **Not paired item by item:** the first attempt (19 Nov, 00:59) printed "room: groq" (the runner's own room check knew only Haiku as a Claude leader; fixed test-first, `b576c1ff`) and was stopped at once; stopping its shell did not end its test process, which ran on and wrote over the finished run's result file after the run had printed its summary. The summary above is the finished run's (01:02-01:17); rerunning would break "once", so the pairing with v7's rows is not reported. The stray process's Sonnet calls are in the spend above; it shared Sonnet's minute window with the as-shipped holdout run, so it may have kept the deep model out of a few of that run's turns.

### The owner's examples on the real path

`eval/v8/real/<tag>-owner8.json` (local). Four runs: `o8a` and `o8b` while building (Haiku leading, the deep model off), **`o8final` (Sonnet 5.5 leading, `.next-v8d`)** and `o8ship` (as shipped: Haiku leading, Sonnet as the deep model, `.next-v8e`). (`.next-v8e` is the final code but for three later fixes the gates found: `7da4e5b7` (the week of stored stories follows the data epoch) and `5b6b8763`, `21ff151d` (the Claude spend record's open); no single request's answer changes).

| Example | o8a (first) | o8b | **o8final (Sonnet)** | o8ship (as shipped) |
|---|---|---|---|---|
| 1 "Open the Supreme Court news on Palikan" (heard "Polygon", then "Palikkan") | found after "Still putting it together"; Dinamalar's Tamil headline in the English voice | The Hindu's English report | **The Hindu's English report on the Pallikaranai marsh case** | the same |
| 1 the HPV headline read out | the opener began after 44 s; the report did not come within the turn's 45 s | read | **read (The Hindu)** | read |
| 1 "Read the Pallikaranai marsh story" (heard "Palikana Imash") | not found ("Nothing in the dashboard or the latest news mentions Palikana Imash") | found (ETV Bharat); the brief stalled once | **found (The Times of India), briefed** | the same |
| 1 Tanglish "Supreme Court news open pannunga" (heard "Panyunga") | Whisper returned nothing | dropped by the gate | **answered in Tamil (The Hindu)** | the same |
| 2 "What's the news on the Supreme Court?" | Dinamalar's Tamil headline in the English voice | answered (The Hindu) | **answered from the dashboard's news** | the same |
| 3 "And what about the other thing?" (no topic) | no filler | no filler | **no filler; "Which other thing do you mean?" with the closest guesses** | the same |
| 3 the news opener ("Reading The Hindu's report...") | | | said on every news turn (5 of 5) | **said on 3 of 5: the Hindu opener once, then the next two Hindu turns went straight to the report; the Times of India's and the Tamil Hindu opener (other lines) were said** |
| 4 English on a Tamil console | English | English | **English (2/2)**; Tamil in Tamil | the same |
| 5 "Ramesh, send the file...", "Alexa, when was it open?", "Call him back after lunch." | Ramesh silent; Alexa (heard in Tamil letters) answered, and that answer said again on the next line | all silent | **all silent** (the gate's record: heard "ரோமெஷ்", "அலேக்சா") | all silent |

### Latency on real providers

`eval/v6/latency/v8fin-v7-*.json` and `v8fin-v8-*.json`, compared in `compare-v8fin-v7-v8fin-v8.md` (`tests/e2e/real6.spec.ts`: real Whisper, Edge's voices, synthetic clips; ms from each clip's true end of speech; n · p50 · p90). Run back to back on 19 Nov: v7's own bundle (`.next-v7f`, v7's commit) and **v8's final bundle** (`.next-v8e`), both with Claude on as shipped (Haiku leading; v8 with Sonnet as the deep model).

| Moment | v7 | v8 |
|---|---|---|
| Wake, open, "Hey Jarvis" -> first audible reply | 4 · 209 · 215 | 4 · 208 · 257 |
| Wake, open, "Hi/Hello Jarvis" and Tamil (Whisper hears them) | 8 · 581 · 782 | 8 · 649 · 671 |
| Wake, open, all | 12 · 572 · 606 | 12 · 583 · 658 |
| Wake, closed -> first audible reply (fired 4/12 on both) | 4 · 149 · 191 | 4 · 190 · 197 |
| Command -> the screen changes | 10 · 1130 · 7525 | 10 · 1123 · 8332 |
| Command -> first sound | 12 · 304 · 345 | 12 · 318 · 365 |

**Paired by clip** (medians, the midpoint for an even n): wake +4 ms (n 12; Whisper's transcript -6 ms; the page's own part after the transcript 5 ms on both); command to screen +52.5 ms (n 10), Whisper's transcript +38.5 ms (n 12); the page's own part 30 against 30.5 ms. Closed wake +30 ms on 4 pairs (too few to read). **Load:** v8's runs had more company than v7's: the as-shipped holdout run, the live-60 run and the stray process ran during v8's latency run (00:57-01:07); v7's (01:07-01:18) ran with less. The bias is against v8. The p90 of command to screen is the planner's command ("show the severe cases"), the model's time.

**Questions** were measured the evening before on `.next-v8c` against `.next-v7f` (`compare-v8lat-v7-v8lat-v8.md`, the same configuration): question to first sound 12 · 407 · 415 against 12 · 412 · 421; to the answer's first word 12 · 5327 · 9796 against 12 · 5944 · 8701 (paired median +31.5 ms, n 12); the whole answer in hand 12 · 3525 · 8128 against 12 · 4360 · 5325 (paired median +1.5 ms). **The first spoken words come later, by design:** v7 said a filler or topic line first (the first words at p50 1,842 / p90 2,472 ms; the answer itself first in 4 of 12), v8 says nothing until the answer (p50 4,292 / p90 7,249 ms; the answer first in 9 of 12); the tone at about 0.4 s and the bar's "On it." are the same in both. That is the owner's example 3 (no "On it"), at the price of about 2.4 s more silence at the median. v8's lanes cost 1-4 ms a turn warm; their first call (170 ms) is now made while the page is idle. Questions were not re-measured on the final bundle: it differs from `.next-v8c` by the wiring review's fixes (`b76fa7bf`: the gate's answer rule, the word caps, the warm-up while idle), the news matching (`c9e32c1a`) and the news opener (`3a4cacf5`), none of which adds a call on a question's path.

### After the finals

**The third independent check** (read only; the write-ups' numbers against the result files and the code) found 14 mismatches in these drafts, none in the code, all corrected before they were committed: the side-talk split (11 said to someone else and 5 to Jarvis, not 13 and 3); a claim that the deep model's turns "carry the hard ones" (they scored 3 of 6, as v7 did, and two were side lines the gate let through); the news opener in `o8ship` (said on 3 of 5 news turns, the Hindu one once, not "once"); "no spoken line repeats" in the demo (the same report asked twice is read twice); the questions' paired n (12, not 13) and medians taken as the upper middle for an even n (now the midpoint); the as-shipped judge's ties (37 identical answers and 1 tie in both orders); two cells of the first real run (`o8a`); a cache-write price; the order of the deep model's rungs; the runs' shared load; and wording. It also confirmed every holdout count, interval, pairing and p value, the judge's tallies, the spend figures and the code's defaults.

**The gates on the final code** (`21ff151d`; the QA gate `bash tests/qa/pass7/gate-fast.sh` on a clean tree, 03:48-04:15, its fifth run this night): type check, lint and the production build EXIT 0; the four shuffled unit runs (two time zones) **6,694 passed in three, 6,693 and 1 failed in one**; pass 7's tests 769 passed (7 skipped); the collector-ops real path 24/24; the src guards 39/39; the browser drive (28 pages, 0 problems) and the Collector journey j1 EXIT 0; the access matrix 1,270 of 1,272 cells (the same two cells as the record before v8: the QA seed's `pii_enc` problem, since v5); the golden master EXIT 2 against the old baselines (as in v5, v6 and v7: the build id, jittered map points, and the same Jarvis lines as v7's own gate record); pass 4's whole real-path suite 2,647 passed, 2 failed. **The three reds, none from v8's code:** (1) the unit run's failure is v4's `llm.v4.test.ts` real-clock bound (1,500 ms) met at 1,627 ms under the gate's two lanes (the same seed, 7202, at 1,929 ms in the run before); the same seed alone passed 8 of 9 runs (the one other failure's file was not kept); (2) pass 4's RC-35 write test, the known 180 s load timeout (alone 3.9 s); (3) `audit-ui_honesty-11`, an expected-to-fail check that this checkout's search model is a git-lfs pointer, which here is the real 278 MB file (environmental). **Jarvis browser specs 41/41** (15.1 min, before the gates' fixes, which touch no browser code). **Three defects the gates found were fixed test-first:** v8's stories cache and the data epoch (`7da4e5b7`); the Claude spend record that, after one locked open, refused Claude until a restart (older than v8; `5b6b8763`, `21ff151d`); and v8's own Sarvam test's thin timing margin (`19230a27`), with v6's night-time clock test pinned (`713a50f0`). The ready-to-run production bundle (`.next-prod`, as `start-fast.bat` builds it) was rebuilt on `21ff151d`.

## v7 (17-18 Nov 2026)

Branch `claude/jarvis-v7-upgrade-00072d` from v6's `736ce5f1`; the brief and the plan are `docs/jarvis/JARVIS_V7.md`, the research `docs/jarvis/v7-research/`. Until 22:45 on 17 Nov no live Claude call was made (the brief); **at 22:45 the owner wrote "use claude api limit 10 dollar"**, and from 22:48 the live runs used **Claude Haiku 5.5 leading** (the planner and the new answer writer) under `JARVIS_LIVE_CLAUDE=1 JARVIS_CLAUDE_BUDGET_USD=10`, with Groq behind it. Each figure below says which model led. The answers are scored by `src/lib/thunai/aide7/eval7.live.ts` on the console's dry-run store (real cached data, read only); every figure has its n.

### Capacity, spend and blocks, before any number

- **Claude spend:** the owner's record (`data/thunai/claude-budget.sqlite`) held 93 rows, US$0.024195 before the first v7 Claude call (22:48) and 539 rows, US$0.142792 after the last (02:08 on 18 Nov): v7's runs spent **US$0.119** (446 calls) of the US$10 ceiling. `claude.live.ts`, `claude.v4.live.ts` and `deploy.live.ts` were never run.
- **Jarvis's own Claude day cap** (1.5M tokens, 500 requests, set against Opus's prices) would have stopped Claude at under US$0.10 of Haiku spend in the middle of the finals; the runs raised it by flag (`JARVIS_CLAUDE_DAY_TOKENS=6000000`, `JARVIS_CLAUDE_DAY_REQUESTS=2000`). The default is unchanged: an owner decision (HANDOVER).
- **Groq's free tier** was spent for the day at the start (20:15) and came back on the rolling window through the night: the first half of the dev set ran on Groq (gpt-oss-20b mostly), the latency runs led by Groq ran at 23:40, everything else on Haiku.
- **Gemini:** 3.5 flash-lite sent no text inside the 3.5 s first-sentence window on the smoke test (6.7-9.9 s to the first token that evening) and its day was near its limit; the judges ran on **Gemini 3.1 flash-lite** (a different family from the Haiku writer). Gemma 4 refused the gateway's thinking setting (400) and was not used.

### How the answers were measured

- **Sets:** `eval/v7/dev/set.json` (48 questions, for tuning) and `eval/v7/holdout/set.json` (48, hashed at 21:04 before any live run, run once at the end): 8 each of incident, news, compare, why, follow-up and outside-dashboard, in English, Tamil and Tanglish. Model-drafted; the Tamil not checked by a Tamil speaker.
- **Gold facts** are the fact sheet code builds from the store for each answer (kept whole in each result row): every figure, name and time a sentence may say. The live checker binds each sentence to the facts it cites; the offline audit re-checks every spoken sentence the model wrote against every fact of its sheet (and a gap's report sentences against the reports).
- **Outside the dashboard:** each answer is scored found (a report named with its outlet), abstained (said plainly as not found, claiming only what was searched) or hallucinated.
- **The judge:** blind pairwise, v7's spoken answer against v6's (v6's line and every item v6 read aloud), Gemini 3.1 flash-lite, each pair asked in both orders; a win counts only when both orders agree; exact two-sided sign test on the wins.
- **The grounding judge** (Gemini 3.1 flash-lite) lists claims its facts do not support; its flags were read by hand.
- **Latency:** `tests/e2e/real6.spec.ts` on a production bundle served by `scripts/jarvis7/serve-real.sh`, headless Edge with its natural voices, the same synthetic clips as v6, real providers, times from the clip's true last voiced sample; n · p50 · p90 (nearest rank).

### The answers: dev runs (tuning)

| Run | Writer | n | Model's answer said | Fallback | First checked sentence after the screen, p50 / p90 (n) | Refused live | Audit: answers clean | Outside: abstained / found / invented |
|---|---|---|---|---|---|---|---|---|
| `dev1` (first half, 22:18-22:26) | Groq (gpt-oss-20b 15, qwen 3, flash-lite 1) | 24 | 19 | 5 (2 capacity) | 635 / 998 (19) | 17 | 21/24 | — |
| `dev2` (Haiku, before tuning on it) | Haiku 5.5 (42), gpt-oss-20b (1) | 48 | 43 | 3 | 1,064 / 1,776 (42) | 36 | 46/48 (with the fixed checker: the two flags are the two spoken defects) | 6 / 1 (false: a two-letter match) / 0 |
| `dev3` (round 1) | Haiku 5.5 | 48 | 45 | 0 | 1,167 / 1,528 (45) | 27 | **48/48** (111 sentences) | 7 / 0 / 0 |
| `dev4` (round 2, the last) | Haiku 5.5 | 48 | 46 | 0 | **1,057 / 1,293** (46) | 20 | 47/48 (118 sentences; the flag: a false "found", fixed after) | 6 / 1 (false, fixed) / 0 |

The other rows of each Haiku run were answered by other lanes: a clarifying question ("tell me more about it") and the refusal of a question about Kerala; in `dev3` also "who has it?", which got no answer (the planner's reply failed v6's exit gate: fixed after by a code lane). `dev1` has none. "Refused live" counts sentences (a sentence can carry several problems). Median answer length 32-38 words.

**What the checker did not catch on dev4 (the grounding judge's flags read by hand):** the judge flagged 20 answers (28 claims). Read by hand: 3 spoken sentences of 118 carry a claim the facts do not support: "almost twice" for a ratio of 1.7 (the tolerance was loose: tightened after, test first), the Tamil "flooding is more in Adyar" (Adyar 7, Anna Nagar 10: a comparative claim; after a fact listed Anna Nagar's kinds out of order, fixed), and "three severe open incidents, including a road accident" (that accident is rated high). One more is the false "found" the audit flagged (d-out-5, fixed). The rest are not defects: two answers no model wrote (a clarifying question, the Kerala refusal), three restatements of their facts, and the judge's noise (suggestions, "nothing found" lines, "the record shows what moved, not why", which its instructions call supported).

**The blind judge on the last dev run** (`dev4full`: v7's `dev4` answers against v6 answered live with its planner on Haiku, as v6's own finals ran; Gemini 3.1 flash-lite, both orders): **v7 preferred 36, v6 1**, tie 1, split 3, no verdict 7 (rate limits and timeouts in one order); exact sign test p = 5.5e-10. By kind v7's wins: incident 4/4 decided, news 8/8, compare 7/7, why 7/7, follow-up 6 of 7 (v6 1), outside 4 (split 3, tie 1). By language: English 21-1, Tamil 9-0, Tanglish 6-0. Mean length v7 41 words, v6 55 (v6's line and the items it read). The earlier judge on `dev4` alone judged 25 pairs (23 had no v6 answer: v6 had been reused from a Groq run limited to its code lanes) and decided 13: v7 10, v6 1, split 2.

### The answers: the holdout (once, at the end, Haiku leading)

`eval/v7/holdout/results/final.json` (hash checked; v7 and v6 both answered live, Haiku leading both).

| | Holdout (48) |
|---|---|
| The model's answer said | 43 (all Haiku) |
| The fallback (the recipe's own line) | 1 ("what's in today's news": "12 headlines.", the line without its "Reading them now") |
| Other lanes | 4: two refusals of places outside the district (Mumbai, Bengaluru), and two follow-ups with no answer: "tell me more about that one" (the planner built no screen) and "since when?" (its reply failed v6's exit gate: in the app, "I can't do that"); v6 answered both with a screen (the slowest department again; the week's case list for "since when?") |
| First checked sentence after the screen, p50 / p90 | **1,011 / 1,409 ms** (n 43; English 915, Tamil 1,239, Tanglish 1,100 at p50) |
| Sentences refused live | 20 (carrying 26 problems: misbound 8, name 5, list 4, multiplier 3, copy 2, time, direction, cause, absolute 1 each) |
| The audit: answers whose every spoken sentence passes again | 47/48 (it re-checks the 115 sentences the model wrote in 43 answers; the fallback and other lanes' lines are code's); the one flag read by hand is the audit's looser test ("the river's water has risen to the bank near the subway", from the record's "Water level in Adyar River at brim near subway", against a falling count elsewhere on the sheet), the claim supported |
| Outside the dashboard (8) | 6 said plainly as not found (claiming the dashboard and the latest news), 2 refused as outside the district; **0 found, 0 invented** (zero, Wilson 95 % upper bound 32 % on 8) |
| Median answer length | 37 words |

**The blind judge on the holdout** (Gemini 3.1 flash-lite, both orders): **v7 preferred 35, v6 2**, tie 2, split 5, no verdict 4; exact sign test p = 1.0e-8. By kind: incident 8-0, news 5-1 (split 1), compare 6-0, why 7-0, follow-up 5-0, outside 4-1 (tie 2). By language: English 19-1, Tamil 9-1, Tanglish 7-0. v6's two wins: "what's in today's news" (v7's fallback, "12 headlines.", against v6 reading every headline) and the Tamil "is the minister coming to Royapuram". Mean length v7 41 words, v6 53.

**The grounding judge on the holdout**, its 24 flagged answers read by hand: **3 spoken sentences of 115 are off**: a citizen's Tanglish complaint ("knee-deep water near the bus stop with every rain") said as water "about the size of a bus stop"; "metro transport" for a report on an Intelligent Transport System; the Tamil "much more" for 16 against 11. The rest are supported restatements, suggestions, "nothing found" lines, the two refusals and the fallback. So **100 % grounded is not met**: about 3 sentences in 115-118 carry an overstatement or a misrendering that code does not check (comparatives, a paraphrase of the record's words).

### After the finals: the independent check, its fixes, and the dev set on the final code

An independent read-only check (three reviewers: the aide's code; the wiring, privacy and spend; these numbers against the result files) found defects the finals did not show: ways a wrong sentence could pass the checker (a figure put on the wrong place across a comma or inside a two-place fact, "up 18" against "down 18", "this afternoon" against "yesterday afternoon", a window's length or a group's size taken for a count, an extreme licensed by another place's rank, one outlet's stories taken as one report, Tamil offices and causes, a cut-off line), routing that took ordinary commands away from their lanes, the browser's number gate silencing queued checked sentences and approving unchecked figures, an incomplete `JARVIS_ANSWER=v6` rollback, uncounted spend on a mid-stream Claude error, and any stored document readable by the news aide. All were fixed test-first (`3bd03b13`, `a3ff4df4`, `23cb02da`, `6b4510a5`). **The finals above ran before these fixes** (code at `3dfc93f1`); they were not run again (run once).

The dev set on the code after the fixes (Haiku leading; v6's live answers reused from `dev4full`):

| Run | Code | Model's answer said | Fallback | First checked sentence p50 / p90 (n) | Sentences refused live | Audit | Outside: abstained / found / invented |
|---|---|---|---|---|---|---|---|
| `dev5` | `23cb02da` (the review's binding before its last narrowing) | 45 (44 Haiku, 1 gpt-oss-20b) | 1 | 1,002 / 1,949 (45) | 40 (dev4: 20): most for binding, which the next commit narrowed | 48/48 (114 sentences) | 7 / 0 / 0 |
| `dev6` | `6b4510a5` (the final code) | 46 (all Haiku) | 0 | 1,007 / 1,675 (46) | 29 | 48/48 (114 sentences) | 6 / 1 (a related report, honestly framed: no report names the CM and Adyar; the answer says so, then that three outlets reported the CM inspecting the 108 ambulance centre in Chennai) / 0 |

The blind judge on `dev6` (the final code against v6's live answers, Gemini 3.1 flash-lite, both orders): **v7 preferred 38, v6 2**, tie 1, split 3, no verdict 4; exact sign test p = 1.5e-9. v7 led in every kind (incident 8-0, news 6-0, compare 8-0, why 6-0, follow-up 6-1, outside 4-1) and language (English 24-1, Tamil 8-0, Tanglish 6-1).

The gates on the final code: type-check, production build, guards, pass 7's tests, the access matrix, the browser drive, the Collector journey j1: green. Lint: one error in a new test file (a helper named `useStream` read as a React hook), fixed after the gate. Four unit runs of 6,301 tests: 6,287 passed, 13 skipped, 1 failed each time: v6's `brief6.case.v6.test.ts` "a problem dated by the day alone", which fails at night (its report one hour before the clock is then "last night" or "early this morning"; unchanged since v6). Pass 4's real-path suite: 2,648 passed, 1 failed, the known RC-35 load timeout (as in v6). The golden master: EXIT 2 against the old baselines, as in v5 and v6. Jarvis browser specs: 41/41.

Browser specs on the final code: 41/41 (barge-in duck p50 74 / p90 82 ms, n 8; v6 83 / 92). Latency was not measured again on the final code (`.next-v7d` = `ee74e8d8`): the later commits change the checker, the routing, the figures the browser's gate allows and the error paths, not the timing path.

### Understanding: live-60 (once, at the end, Haiku leading the planner, `JARVIS_AIDE=0`)

`HOLDOUT=planner2 HOLDOUT_DIR=holdout2 HOLDOUT_SET=live60 HOLDOUT_TAG=v7final`, Haiku 5.5 leading, Groq behind; only the runner's printed summary was read.

| | v6 final (Haiku leading) | **v7 final (Haiku leading)** |
|---|---|---|
| All | 45/60 | **46/60** (76.7 %, Wilson 64.6-85.6) |
| English | — | 13/15 |
| Tamil | 25/30 | 24/30 |
| Tanglish | — | 9/15 |
| Code lanes (no model) | 16/21 | 16/21 |
| Capacity failures | 1 | 0 |

Paired on the same 60 sentences (`HOLDOUT=pair`): 3 right only in v7, 2 right only in v6, exact McNemar p = 1.0. **Understanding is at least v6's** (the target); it did not rise. The new v7 lanes (compare, why-worse, the X issue, "who has it?", public events) are not in live-60's sentences.

### Latency on real providers

Bundle `.next-v7d` (= `ee74e8d8`; the later commits change the gap search's words, the checker's multiple tolerance, the kinds' order and the runner, nothing on the voice path). 4 questions a language, 4 commands.

| Moment, from the true end of speech | v6a (Groq) | v6d (Groq) | **v7 Groq leading** (`v7g`) | v7 Haiku leading (`v7h`) | v6's answers, Haiku leading, same bundle (`v7h6`) | Haiku plans, Groq writes (`v7hg`, during the finals) | Target |
|---|---|---|---|---|---|---|---|
| "Hey Jarvis", open -> first audible reply | 24 · 193 · 210 | 7 · 189 · 227 | 6 · 201 · 229 | 6 · 184 · 206 | 4 · 207 · 218 | 4 · 203 · 217 | no slower than v6: **yes** |
| "Hey Jarvis", closed -> first audible reply | 1 · 158 · 158 (1 of 12 fired) | 12 · 163 · 185 | 4 · 170 · 172 (4 of 4 "Hey Jarvis" clips fired) | — | — | — | yes |
| Command -> the screen changes | 9 · 1,030 · 1,737 | — | 3 · 1,080 · 1,295 | 3 · 696 · 1,090 | — | — | no slower: **about even** (n 3) |
| Question -> first sound (the earcon) | 36 · 409 · 438 | 7 · 409 · 428 | 12 · 408 · 426 | 12 · 396 · 410 | 12 · 409 · 421 | 12 · 404 · 419 | yes |
| **Question -> first word of the answer** | 33 · 2,864 · 6,343 | 7 · 3,096 · 7,006 | **12 · 3,191 · 4,150** | 12 · 3,826 · 5,754 | 11 · 1,651 · 3,745 | 11 · 1,995 · 5,101 | **no** (see below) |
|   English | 12 · 2,864 · 3,688 | 2 · 3,020 · 3,020 | 4 · 1,947 · 4,225 | 4 · 3,826 · 5,754 | 3 · 1,404 · 2,533 | 3 · 1,733 · 5,101 | |
|   Tamil | 11 · 2,874 · 6,343 | 3 · 3,889 · 4,073 | 4 · 4,027 · 4,150 | 4 · 5,335 · 6,805 | 4 · 3,636 · 4,354 | 4 · 5,058 · 9,453 | |
|   Tanglish | 10 · 3,197 · 8,226 | 2 · 7,006 · 7,006 | 4 · 1,898 · 3,191 | 4 · 3,004 · 4,422 | 4 · 1,382 · 3,745 | 4 · 1,995 · 2,302 | |
| Question -> the screen's answer in hand | 34 · 2,188 · 4,200 | 7 · 2,379 · 5,847 | 12 · 1,788 · 2,937 | 12 · 1,466 · 3,039 | 11 · 1,241 · 3,114 | 11 · 1,154 · 3,220 | |
| Question -> the answer's last word | 33 · 23,617 · 37,759 | 7 · 37,906 · 39,168 | 12 · 20,914 · 25,676 | 12 · 22,694 · 28,034 | 12 · 18,581 · 34,677 | 12 · 20,673 · 28,037 | |
| The answer handed to the voice -> its first word | 37 · 675 · 1,251 | 7 · 742 · 1,282 | 13 · 387 · 809 | 13 · 359 · 799 | 11 · 379 · 846 | 11 · 316 · 1,456 | |

**The first word:** v7 waits for its first checked sentence, where v6 spoke its line the moment the screen was ready. On the same Haiku-led bundle, on the 11 questions both runs timed, the first word came at p50 3,653 ms (v7) against 1,651 (v6's answers); the median per-question difference is 1.0 s. The aide's first sentence reached the browser 0.8-3.2 s after the screen (p50 1.0 s, p90 2.4 s, n 12). The v6-answers run went while the dev set's v6 answers were being run on Haiku in another process. With Groq writing: v7 Groq-led 3,191 / 4,150 against v6a's 2,864 / 6,343 (different days and bundles, n 12 against 33); on the same day, Haiku planning with Groq writing (`v7hg`, run while the finals ran) against v6's answers on the same planner, the median per-question difference is +0.33 s. The server log shows its 10 writer calls all on Groq's qwen (the latency rows do not record the writer). The target "no slower than v6" is **not met** with Haiku writing (about +1-2 s); with Groq writing the cost is about 0.3 s, on small n.

## v6 (17 Nov 2026)

Branch `claude/jarvis-v6-build-adbae2` from the v5 build at `a7943b2f`; the brief is `docs/jarvis/JARVIS_V6.md`. Every latency in the tables below is from `tests/e2e/real6.spec.ts`: a production bundle built with `NEXT_PUBLIC_JARVIS_SPEC=1`, served by `scripts/jarvis6/serve-real.sh` (Claude off, Groq leading, the console's own AI off, the dry-run store with its real cached data), headless Edge with its natural voices, synthetic clips (Windows and Gemini voices, no person) played into the page's microphone, **real providers** (Groq Whisper, the Groq planner ladder, Edge's voices). Each time is from the clip's true last voiced sample. Cells are **n · p50 · p90** (nearest rank). The raw rows are in `eval/v6/latency/`; `node scripts/jarvis6/waterfall.mjs <tag>` and `node scripts/jarvis6/compare.mjs <a> <b>` rebuild the tables.

### Capacity and blocks, before any number

- **Claude:** the owner allowed the key on 17 Nov (US$5 at most, then Groq). The key in `.env` was refused all day (401 "invalid x-api-key") until the owner pasted a working one at 19:14; then the understanding finals ran with Claude Haiku 5.5 leading the planner, **US$0.021** spent in all. Every latency in the tables here is the Groq ladder's (Claude off); the only Claude timings are the finals' planner call times (Phase 5; no voice, no speech to text). With a working key Haiku leads the planner by default (`JARVIS_PLANNER_LEAD=groq` keeps Groq first), and its call took p50 2.1-2.4 s in the runner against the Groq planner's 1.2 s in the v6a waterfall: the voice path with Claude leading is not measured, and the answer times above would not hold with it.
- **Groq's free tier** (8K tokens a minute, 200K a day per model) set the pace: the planner turns are 20 s apart (`LIVE_GAP_MS=20000`); this build's measurements used up qwen3.8-27b's and gpt-oss-120b's day (gpt-oss-20b's was already spent by v5's last runs), so the understanding finals ran with Claude leading (Phase 5 below).
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

- **Diagnosis kept from v5:** the grid selected no planner change; Tamil goes to the wide bundle; strict-mode 400s and Gemini's schema refusals were fixed in v5. With the Claude key refused until 19:14 there was no stronger model to tune against, and the free Groq allowance was spent on the measurements, so **no planner change was made or tuned** in v6: the finals below are v5's planner with Claude Haiku 5.5 leading it.
- **Code lanes, tuned on the dev set only** (`eval/dev200`, no model): the place lane (a place's state asked loosely goes to the situation screen by code): **68/200 → 70/200** right through the code lanes (114 left to the planner). Misses that remain there: a taluk or locality that is not a zone (Velachery, T Nagar), spans no console window holds ("last six months", "since August"), and browser-only controls the runner does not route (theme, language).

- **Side talk, no model, on the final code** (`HOLDOUT=ambient` and `ambient-engaged`, `HOLDOUT_DIR=sidetalk200`, `eval/sidetalk200/results/v6final-*.json`): with Jarvis idle **0/200 acted** (0.0-1.9 %), 60/60 unnamed commands refused, no level B or C act; inside the engaged window (Jarvis's last turn 5 s ago) 58/200 acted (29.0 %, 23.2-35.6), 54/60 commands accepted: the same as v5 (the gate is unchanged in v6).

- **The finals, with Claude Haiku 5.5 leading the planner.** The owner, 17 Nov 19:00: "do with claude, don't spend more than 5 dollars"; the key in `.env` was refused until the owner pasted a working one at 19:14. Command: `JARVIS_LIVE_CLAUDE=1 JARVIS_CLAUDE_BUDGET_USD=5 LIVE_GAP_MS=20000 HOLDOUT=planner2|planner3 HOLDOUT_DIR=holdout2|holdout3 HOLDOUT_TAG=v6final|v6final2 … holdout.live.ts`, on the shipped code with the runner's own fixes: `1fa830fb` (the pre-check counts Claude's day) and `faa6b3e4` (`JARVIS_LIVE_CLAUDE`) for every run, and `e120f4be` (each item waits for the lead's minute window) for the second live30 only, committed after the first failed. The ladder: Haiku 5.5, then gemini-3.5-flash-lite (Groq's day was spent). The planner is v5's (no planner change in v6); v6's routing change (the place lane, in code) left the code lanes at 16/21 on live-60, as in v5, so the gain sits in the planner turns: these runs measure the model. Only the runner's printed summaries were read; no row of holdout2 or holdout3. **Spend: US$0.021 for both sets and the key checks** (86 calls; 89 % of Claude's input tokens were read from its cache, at US$0.01 a million: the runner's call lines, 492,628 of 552,606), counted by the ceiling's record.
- **live-60** (holdout2, `eval/holdout2/results/v6final-planner-live60.json`, 19:18-19:32): **45/60 (75.0 %, 62.8-84.2)** all turns; 45/59 clean (76.3 %, 64.0-85.3). One Tamil turn is a capacity row (no model answered): Claude gave no answer in the time the planner left it (at least 6 s), and no other model answered in the turn's time (no 429). EN 12/15, **Tamil 25/30** (25/29 clean), Tanglish 8/15. Who answered: Haiku 5.5 29/38 (76.3 %); no model 16/22: the code lanes 16/21 (as v5) and the capacity row 0/1. By lane: quick 11/13, planner 28/37, refuse 3/3, frame 1/2, resolve 1/3, general 1/1, no model 0/1. Claude's call time in the runner (no voice): p50 2,422 ms, p90 2,882 (n 39). Tokens: 278,279 in all, 7,323 a model turn.
- **Paired with v5's final** (36/60 on the Groq ladder; exact McNemar on the same 60, by script): **b 4, c 13, p 0.049** (mid-p 0.031): with Haiku leading, v6 is right on 13 sentences v5 missed and wrong on 4 v5 got. Tamil 14/30 -> 25/30. For reference, the 4 Nov build's Opus 5.5-first run on the same 60 scored 49/60, Tamil 25/30, at p50 3.9 s a model turn (the score: `docs/thunai/BUILD_LOG.md`, 4 Nov; the time: this file's "Claude, added after these runs").
- **New intents** (holdout3's live30): the **first** Claude-led run (19:32, `v6final-planner3-live30.json`) was a **capacity failure, not a score**: 2/30 all turns, 21 capacity rows (no model answered; 27 turns in all without a model) and no 429 from any provider. The runner fired five wide planner calls in seconds, the ledger's minute window for Claude (50K tokens) had no room left, the ladder offered only flash-lite, which was busy (it timed out, then was rate-limited) and was cooled, and the runner, which paused only after a turn that made a call, ran the other items within the same minute. Fixed test-first: each item now waits for the lead's minute window (`e120f4be`). The **second** run (19:36-19:47, `v6final2-planner3-live30.json`, five waits, 140 s in all): **8/30 (26.7 %, 14.2-44.4)** all turns, 8/29 clean (27.6 %, 14.7-45.7), one capacity row (no model answered). By intent: explain 1/5, changed 1/3, howknow 0/2, mission 0/2, brief 1/3, remember 0/4, recall 0/2, follow-ups 5/9. Haiku 5.5 7/24; no model 1/6 (five code-lane turns and the capacity row). Claude's call time p50 2,123 ms, p90 2,701 (n 33). **Paired with v5's final** (7/30, Groq): b 2, c 3, **p 1.0**: no difference. Haiku leading did not lift the new intents (paired p 1.0: no difference shown). As the v4 build found on Groq, loose phrasings of the new intents go to the planner, which rarely picks their recipes; handling them in code is the likely next step (not built).
- **Side talk on the holdouts, no model** (`HOLDOUT=ambient` and `ambient-engaged`, `v6final-ambient*.json`, 19:04): with Jarvis idle **0/60** (0.0-6.0 %) on holdout2 with 40/40 unnamed commands refused, and **0/40** (0.0-8.8 %) on holdout3; inside the engaged window (Jarvis's last turn 5 s ago) 14/60 (23.3 %, 14.4-35.4) with 37/40 commands accepted, and 6/40 (15.0 %, 7.1-29.1): each the same as v5.
- **Against the targets:** live-60 ≥ 52/60 **not met** (45); Tamil ≥ 26/30 **not met** (25); new intents ≥ 75 % **not met** (26.7 %); side talk acted on while idle stays 0: **met** (0/60, 0/40, 0/200).

### Phase 6: the feel

- The HUD's core pulses on the voice's real word starts (the browser's word boundaries) and on the wake reply's own audio; the look, the layout and "Hi Jarvis" are as the owner sees them. Before/after stills and the headless recording: `docs/jarvis/screens/v6/` (`before-*` on the v5 bundle, `after-*` and `reel.webm` on the final one).

### Gates

| Gate | Command | Result |
|---|---|---|
| Unit suite | `npx vitest run` | final code (`784bcc41`): 505 files, 6,119 passed, 13 skipped, 0 failed (on `1cf3d052`: 6,103 passed) |
| Unit suite, shuffled, four seeds and two time zones (the QA gate's lane B, final code) | `node tests/qa/pass6/suite.mjs ...` | final code (`784bcc41`, gate of 18:16-18:46): 6,119 passed in three runs; the fourth 6,117 passed, 2 failed: the v6 speech race test's real-clock bound (< 400 ms) took 826 and 668 ms under the gate's two-lane load and passed alone (7/7); it now runs on the test clock and still fails on v5's behaviour (`2aa0aee3`). The gate before, on `5c1cf7a1`'s tree: 6,119 passed in two runs, `firstsentence.v5` failed in the other two under load (the same seed alone: 6,119 passed, 0 failed) |
| Type check | `npx tsc --noEmit` | clean (final code) |
| Production build | `npx next build` (the QA gate's, and the measuring bundles v6a-v6e) | green; one break found and fixed on the way (a store module in the browser bundle, `e245a5d9`), now guarded by a test |
| Jarvis browser specs | `npx playwright test tests/e2e/mode.spec.ts tests/e2e/bargein.spec.ts tests/e2e/hold.spec.ts tests/e2e/vad.spec.ts tests/e2e/vadfake.spec.ts tests/e2e/e2e-latency.spec.ts tests/e2e/hud.spec.ts` (dev server 3011, console AI off) | on `1cf3d052`: 39/39 (13.9 min); on the code after the second check: 38/39 (a 324 ms barge-in outlier on the first test after the dev server started; the spec again twice 5/5, p90 86 and 85 ms); **on the final code** (`784bcc41`): 37/39 with the barge-in duck p90 94 ms, the two reds being Windows file errors writing two HUD screenshots ("UNKNOWN: unknown error, open ...png"); the HUD spec again alone: 9/9 |
| QA gate | `bash tests/qa/pass7/gate-fast.sh` (final code `784bcc41`, 18:16-18:46) | tsc, lint, build, guards 39/39, access matrix, browser drive, j1 journey: all EXIT 0; the collector-ops real path 24/24; pass 7 tests 768 passed, 1 failed, 7 skipped (776): hunt2-sec-07, which counts the files in `public/uploads/profile` before and after one upload, so another worker writing there at the same moment fails it; v6 did not touch the profile code, and the file alone passes 11/11; pass 4 suite 2,648 passed, 1 failed (RC-35's load timeout, a known item). The gate before, on `5c1cf7a1`'s tree: the same steps EXIT 0, pass 4 suite 2,649 passed, 0 failed (EXIT 1: one vitest worker RPC timeout under load); golden master EXIT 2 against the old baselines, as in v5: v5's own recording to v6's differs in 6 of 3,298 bodies, all in routes v6 did not touch, no status change, no 5xx. Seven QA oracles that pinned v5's briefing wording or missed the news reader's cache moved, listed in `docs/qa/pass7/V6_EXPECTED_CHANGES.md`. Known items from v4 and v5: the seed script's `pii_enc` error, RC-35's load timeout |
| After the gates | — | four commits changed only the live runners and the unit configs (`1fa830fb`, `8b31d36a`, `faa6b3e4`, `e120f4be`), and one test (`2aa0aee3`): on the tip, tsc clean; lint clean on the changed files; unit suite (default config) 507 files, 6,126 passed, 13 skipped, 0 failed, and the real spend record unchanged by it. The QA gate and the browser specs were not re-run: these commits change no app code (the live runners, the unit configs and tests only) |
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
| Phase 5: understanding, live-60 | ≥ 52/60 | 45/60 (75.0 %, 62.8-84.2) with Haiku 5.5 leading, 45/59 clean; v5 on Groq 36/60, paired b 4, c 13, p 0.049 | no |
| Phase 5: Tamil (live-60's 30) | ≥ 26/30 | 25/30 (one capacity row; 25/29 clean); v5 14/30 | no |
| Phase 5: new intents (holdout3 live30) | ≥ 75 % | 8/30 (26.7 %, 14.2-44.4), 8/29 clean; v5 7/30, paired p 1.0; the first Claude-led run a capacity failure (the runner's pacing, fixed) | no |
| Phase 5: side talk acted on while idle | stays 0 | 0/60 and 0/40 on the holdouts, 0/200 on sidetalk200 | yes |
| Phase 6: the feel; before/after stills and a headless video | to the owner before any visible change ships | `docs/jarvis/screens/v6/` | yes (the owner's approval is owed) |
| Phase 7: gates, documents, two independent checks, branch pushed | — | the gates above (green apart from load artifacts, each reproduced green alone); both checks done, and a third, read-only, on the finals' write-up (its findings corrected); the branch pushed | yes |

### Not verified

- **Nothing was tried with a real microphone in a real room.** Every latency is a synthetic clip played into the page's microphone in headless Edge on this PC, with real providers. Room echo, distance and noise are not in them; nor is a person who pauses mid-sentence.
- **The live captions under automation** give no words, so every measured turn ended on the detector's own values. v6 now lets the detector keep its own end when the captions read a line as complete or neutral: the room check should confirm commands still end where they should.
- **"Hi Jarvis" closed** (the browser's cloud recogniser) cannot be run under automation; only the on-device "Hey Jarvis" was measured closed. A command said in the same breath as "Hey Jarvis" while Jarvis is closed is left to that recogniser: not measurable here.
- **Claude in the voice path**: the understanding finals are the only Claude numbers (the planner in the runner, no voice, no speech to text); every latency in the tables above is the Groq ladder's. With a working key Haiku leads the planner by default (`JARVIS_PLANNER_LEAD=groq` keeps Groq first), and its call took p50 2.1-2.4 s in the runner against the Groq planner's 1.2 s in the v6a waterfall: the voice path with Claude leading is not measured, and the answer times above would not hold with it. The spend ceiling counted the finals' US$0.021 live; its stop at US$4.75 is tested with stand-ins only.
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
