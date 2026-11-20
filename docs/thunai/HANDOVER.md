# Jarvis mode: handover

## v10, your "version 9" (19-20 Nov 2026)

Branch `claude/jarvis-v10-49ea0b`, from v9's `0a4b0245` (also GitHub `main`); final code `65917112`. The brief: `docs/jarvis/JARVIS_V10.md`; the numbers: `eval/RESULTS.md` (v10); the log: `docs/thunai/BUILD_LOG.md`. **Not merged, no PR: you decide.**

### Your decisions (first)

1. **Sarvam: keep `JARVIS_STT_SARVAM=tamil`** (on since 19 Nov 15:35). On 71 synthetic clips Sarvam's word error was 0.127 against Whisper's 0.330 (Tamil 0.238 against 0.461, Tanglish 0.208 against 0.614, English 0.052 against 0.171), the language right 94% against 86%, a call 240 ms at the median. `primary` (Sarvam for English too) looks right on these numbers, but nothing has been heard yet in your own voice: the console logged no Sarvam turn since 15:35. Use it a day in `tamil`, then try `primary`.
2. **The day's news names as Sarvam's keyterms: leave off** (`JARVIS_SARVAM_DAY_KEYTERMS` unset). Measured, they made Sarvam worse (0.156 against 0.127) and once wrote a cyclone's name into an unrelated question. Names said by ear are matched after hearing instead, which is what fixed "Cyclone Aquan".
3. **Buying Sarvam credit (Rs 500): not yet.** About Rs 12 of the Rs 100 signup credit is used (v9's bench Rs 3, v10's two benches Rs 8.62). At Rs 0.49 a minute of speech, an hour of talking to Jarvis is about Rs 30; a working day of ordinary use (a hundred requests of three seconds) about Rs 2.5, so the rest lasts weeks. Buy when the dashboard shows Rs 20 left.
4. **Merge to `main`**: your call. Everything below is on the branch only.
5. **Speaker verification** (ignore other voices): researched (`docs/jarvis/v10-research/30-side-talk.md`), not built. It needs your explicit yes and a short enrolment of your voice; only a voice embedding would be stored, locally.
6. **Clean-up you may want** (nothing of yours was deleted):
   - `E:\tmp_e10_head.ts`, a stray copy of a source file one of my commands wrote to the drive root; the safety check would not let me delete it there. Please delete it.
   - Drive E: is nearly full (about 12 GB free). My finished checkouts can go once you have read this: `E:\farm\.claude\worktrees\v10-pre-review` and `E:\farm\.claude\worktrees\v10-eval-v9` (about 2.2 GB each, plus v9's 1 GB measuring build).
7. **Rollback** to v9's understanding: set both `JARVIS_UNDERSTAND=v9` and `NEXT_PUBLIC_JARVIS_UNDERSTAND=v9` in `.env`, then `start-fast.bat rebuild`.

### What improved (plain words, with the numbers)

- **Understanding, on a new blind set** (103 spoken requests written by a helper who saw neither the code nor the tests, run once at the end on the same day's news): **v9 20/103, v10 48/103**; 28 right only in v10, none only in v9. Names said by ear 1 → 6 of 17, screen references 0 → 5 of 14, reading 0 → 7 of 12, Ask the Map 0 → 7 of 18, controls 4 → 6 of 12, side talk 7 → 8 of 8. English 9 → 20, Tamil 5 → 14, Tanglish 6 → 14.
- **Your own turns** (27, replayed from your audit log, live): **24/27**. "Tell me about Cyclone Aquan." reads Cyclone Akvan's story with the rain gauges; "the fast news" is the first; "Tell me about the" waits for the rest; "Javes, Goto News." opens the news; "Alexa ..." and fillers stay silent.
- **No regression on v9's own tests**: v8's dev set 100/105 as v9; v9's blind set 24 → 35 of 60 live.
- **New things you can do by voice**: Ask the Map's every feature (a question, follow-ups, a circle "within two kilometres of Kasimedu", layers, shots, export, save, visit order, the analyst, send to a department as drafts, suggested questions, Rain & flooding); the narrated district tour ("take me round the district", "next", "stop"); a field visit plan; the whole dashboard's controls (586 counted; Jarvis never presses send, approve, delete or Sign out); "read" as a short brief with the console's own cases on it and one offered next step; "read it fully"; "what do we have on this?" (news to ground truth).
- **Speed: not slower anywhere measured.** Wake 555 → 546 ms; a command to the screen 859 → 806 ms (p90 1.96 → 1.41 s); a question's tone 404 → 399 ms; a question's first word, both on the same writer model and paired by clip, +22 ms (the writer model's own variance, seconds a call, is the rest).

### What is not verified

- **No real microphone in a real room, and no Tamil speaker has checked the Tamil and Tanglish wording** (model-written).
- **Ask the Map by voice, the tour, the field visit and the dashboard's controls have not been seen in a browser.** The real-path harness is the dev console, which has neither. They pass their unit tests and score on the blind set; try them yourself (DEMO, v10, steps 8-10). Shown on the real path: Cyclone Aquan's brief, the cut-off join, "read it fully", Tamil, Sign out refused.
- Sarvam on your own voice (see decision 1).
- Two of your turns stay wrong (lines the speech-to-text garbled past reading); see RESULTS.

### Spend

Claude: **US$0.61 of the US$10 ceiling** (the record from 1,154 rows / US$1.135719 to 1,710 rows / US$1.746005; US$8.25 of the ceiling left). Sarvam: about Rs 8.62 this session. Groq and Gemini: free tiers.

## v8 (18-19 Nov 2026)

Branch `claude/jarvis-v8-700c5f`, from v7's `22304da4`. The brief and the plan: `docs/jarvis/JARVIS_V8.md`; the research: `docs/jarvis/v8-research/`; Sarvam: `docs/jarvis/SARVAM.md`; the numbers: `eval/RESULTS.md` (v8). **Not merged, no PR: the owner decides.**

**Read this first.**
- **Your five examples work on the real path** (production bundle, synthetic clips, real Whisper, real models, Edge's voices), with Sonnet 5.5 leading (`o8final`) and as shipped (`o8ship`, the final code): "Open the Supreme Court news on Palikan" (Whisper: "Palikkan") reads The Hindu's English report on the Pallikaranai marsh case; "What's the news on the Supreme Court?" answers from the dashboard's news; no "On it" and no filler said on every turn; English on a Tamil console is answered in English, Tamil in Tamil, the Tanglish request in Tamil; "Ramesh, send the file...", "Alexa, when was it open?" (Whisper wrote "Alexa" in Tamil letters) and "Call him back after lunch." are left alone.
- **Understanding, measured on a blind holdout once** (111 requests written by a helper that saw neither the code nor the dev set): **v7 44/111, v8 75/111 as shipped, 76/111 with Sonnet leading** (paired with v7: 32 right only in v8, 1 only in v7, p < 1e-8). The reply's language: 86/98 → 95/98. Side talk: v7 answered 5 of 13 lines said to someone else, v8 2; v8 silenced 1 of 98 requests (v7 5).
- **Not "very high" yet on news by topic:** on the holdout v8 found 9 of 22 named stories and answered 6 of 14 news questions (v7: 0 and 2). The misses are known classes (an acronym said letter by letter, a place name split or spelt by ear, an outlet misheard, colloquial Tamil words left in the topic, "open the X protest" with no news word, Tamil ordinals past the fifth). They need a fix and a fresh blind set: the follow-up.
- **live-60 (v7's own regression set): 46/60, the same as v7** (Sonnet leading; English 13/15, Tamil 24/30, Tanglish 9/15 on both).
- **The judge:** Sonnet-led v8 preferred to v7 39-20 (p = 0.018); as shipped 31-21 (p = 0.21, not significant); the owner's examples 5-0 and news by topic 13-4 (Sonnet-led).
- **Speed is v7's, except one thing you asked for:** wake and commands paired by clip on the final bundle differ by Whisper's own time (the page's own part: wake 5 ms on both, commands 30 against 30.5 ms); questions the evening before: the tone at 407 → 412 ms, the answer's first word +31.5 ms at the paired median. **But v7 spoke "On it" or a topic line first and v8 does not,** so the first words you hear come about 2.4 s later at the median (p50 1.8 s → 4.3 s). See decision 6.
- **Claude:** v8 spent **US$0.771** of the US$10 ceiling (442 calls: Sonnet 156, US$0.697; Haiku 286, US$0.074). Record before: 550 rows, US$0.147505; after: 992 rows, US$0.918660.
- **Sarvam:** built and tested with mocks only; no account, no key, no call. The plan to buy and test is below and in `docs/jarvis/SARVAM.md`.
- **Nothing was tried with a real microphone in a real room**; the Tamil wording is model-written and not checked by a Tamil speaker.

### Owner actions and decisions (first)

1. **The deep model is on by default when the Claude key is set.** A hard or unclear planner turn (an analysis question, a long or many-part request, a reference with a screen behind it) asks Sonnet 5.5 first; a turn whose fast plan comes back empty or asks back asks Sonnet after Haiku; once a turn, at most 8 s before the next rung. On the holdout it took 6 of 111 turns and got 3 right, the same 3 as v7; two of the six were lines said to someone else that the gate let through, which it answered. A Sonnet call averaged US$0.0045 in these runs (four calls with a cache write cost US$0.021-0.023 each). `JARVIS_DEEP_MODEL=off` turns it off; `JARVIS_DEEP_MS` sets the wait.
2. **Who leads: Haiku (shipped) or Sonnet.** On the holdout Sonnet leading scored 76 against Haiku's 75 (p = 1.0): no measurable gain in understanding, at about 17 times the price a call in these runs (US$0.0045 against US$0.00026). Keep Haiku leading (`JARVIS_CLAUDE_MODEL` unset) unless the blind judge below says Sonnet's answers are worth it to you.
3. **Raise Jarvis's own Claude day cap if Sonnet leads or the deep model is busy.** It is 1.5M tokens and 500 requests a model a day and 50,000 tokens a minute (set in v4 against Opus's prices). `JARVIS_CLAUDE_DAY_TOKENS` and `JARVIS_CLAUDE_DAY_REQUESTS` raise the day; the per-minute window is shared by every process on the laptop.
4. **Sarvam (Rs 500): to buy and test,** in this order: sign up at Sarvam's dashboard (the Rs 100 signup credit comes first; it never expires); in the dashboard's data settings choose no retention and no use of your audio for training, if offered; buy Rs 500 of credit (about Rs 590 with GST); put `SARVAM_API_KEY` in `.env` (never in a commit); then run the plan in `docs/jarvis/SARVAM.md` (a 3-clip smoke run, about Rs 0.20; then the test, 80 calls, about Rs 3 with GST), first with `JARVIS_STT_SARVAM=shadow`, then `tamil`. What Rs 500 buys: 17.0 hours of audio before GST (about 20,400 three-second turns), or 14.4 hours if the Rs 500 must cover GST.
5. **Rollback** to v7's understanding: set both `JARVIS_UNDERSTAND=v7` and `NEXT_PUBLIC_JARVIS_UNDERSTAND=v7` in `.env`, then `start-fast.bat rebuild` (the browser's switch is fixed when the bundle is built). Either one alone turns the server's half off.
6. **Rules you may want to change** (each a line of code, each tested):
   - **The reply's language** is the language of your own words on that turn: Tamil letters, a Tamil verb at the end, or more Tamil than English grammar words is Tamil; any other English word is English. A turn with no language of its own ("ok", a name alone) gets the language you used last, else English. The console's language setting and Whisper's label no longer decide it.
   - **Silence:** a line that starts with another assistant's name ("Alexa", "Siri", "Cortana", "Bixby"; "Hey Google" or "OK Google"; "Google", "Gemini" or "ChatGPT" followed by a comma or a stop), or with a person's name or title and a comma ("Ramesh, ...", "Madam, ..."), an errand for a person ("call him back", "tell the DRO"), a filler or a doubled "ok ok", a line cut off before its point, or one unknown word is not answered on the open mic. Say "Jarvis" to be heard regardless. A yes or a number while Jarvis waits for your answer is always an answer.
   - **The news opener** ("Reading The Hindu's report...") is said only when it was not the line said last; the screen shows it either way.
   - **No spoken filler:** with "On it" gone, nothing is spoken between the tone and the answer (about 4.3 s at the median for a question, against 1.8 s to v7's "On it"). If that silence feels long, a topic line for slow turns only ("Looking at Royapuram.") is a one-line change; the owner asked for no "On it".
7. **A data quirk to know:** one of the news panel's 25 rows (19 Nov) was a merged cluster whose first stored report is another story. v8's finder now reads the report whose headline the row shows; reading that row by its number ("read the 10th") still reads the row's first report, as v7 did.
8. Still open from v7 and earlier: "Hi Jarvis" on the device, the wake reply's voice, the talk-over trade-off, IndicConformer's licence, Groq Zero Data Retention.

### What shipped

- **A code resolver in front of the lanes (`src/lib/thunai/v8/`):** a story by its topic, place or outlet among the screen's and the store's last week (`news8.ts`, `newsfind.ts`, `match.ts`: a Tamil-loose key, Jaro-Winkler with an edit ceiling, a prefix rule for a name cut short, English word forms, rarity weights, a place veto, several outlets' reports of one event as one story, the report in your language); news questions searching the dashboard's news, then the outlets' feeds, then saying plainly that neither has it; "the other one" and "what else is in the news about it?"; references by position in three languages (`refs8.ts`); "since when?" and Tamil "which department" follow-ups.
- **The addressee gate's new silences** (`addressed.ts sideTalk8`) and the first sentence after "Hey Jarvis" taken as the call's own request.
- **The reply's language from your words** (`lang8.ts`, `round.ts replyLang`); at the ears, two Whisper decodes that are translations of each other weighed by confidence alone (`stt.ts`).
- **No spoken filler** (`stagelocal.ts`, `turnstate.ts`): the bar still shows v7's "On it."; nothing is spoken until there is something to say, a topic line is never said twice running, the 10-second line rotates.
- **The deep model** (`deep8.ts`, `llm.ts`, `gateway.ts`) and the rule for which model a turn gets.
- **Sarvam** behind `JARVIS_STT_SARVAM` (off), mocked and synthetic-fixture tests.
- **Evaluation:** the dev set and the hashed holdout (`eval/v8/`), the runner with its answer mode and blind judge (`v8/eval8.live.ts`), the owner's examples on the real path (`real6.spec.ts` part `owner8`, 11 clips).
- **Two defects the QA gate found, fixed test-first:** v8's week of stored stories now follows the data epoch like every timed cache over the store (`7da4e5b7`); and, older than v8 (since v6), **one "database is locked" when a server first opened the Claude spend record kept Claude refused until a restart**; the open now waits out a moment's lock with three short tries and a failed open is tried again after 2 s (`5b6b8763`, `21ff151d`). If Claude ever seemed to stop answering until a restart, this was a likely cause.
- **Checks:** two independent read-only reviews before the finals (code; wiring with privacy and spend) and their findings fixed test-first; a third, read-only check of every number in these write-ups against the result files (14 corrections, none in the code); the gates below.

### Gates (the final code, `21ff151d`)

**The gates on the final code** (`21ff151d`; the QA gate `bash tests/qa/pass7/gate-fast.sh` on a clean tree, 03:48-04:15, its fifth run this night): type check, lint and the production build EXIT 0; the four shuffled unit runs (two time zones) **6,694 passed in three, 6,693 and 1 failed in one**; pass 7's tests 769 passed (7 skipped); the collector-ops real path 24/24; the src guards 39/39; the browser drive (28 pages, 0 problems) and the Collector journey j1 EXIT 0; the access matrix 1,270 of 1,272 cells (the same two cells as the record before v8: the QA seed's `pii_enc` problem, since v5); the golden master EXIT 2 against the old baselines (as in v5, v6 and v7: the build id, jittered map points, and the same Jarvis lines as v7's own gate record); pass 4's whole real-path suite 2,647 passed, 2 failed. **The three reds, none from v8's code:** (1) the unit run's failure is v4's `llm.v4.test.ts` real-clock bound (1,500 ms) met at 1,627 ms under the gate's two lanes (the same seed, 7202, at 1,929 ms in the run before); the same seed alone passed 8 of 9 runs (the one other failure's file was not kept); (2) pass 4's RC-35 write test, the known 180 s load timeout (alone 3.9 s); (3) `audit-ui_honesty-11`, an expected-to-fail check that this checkout's search model is a git-lfs pointer, which here is the real 278 MB file (environmental). **Jarvis browser specs 41/41** (15.1 min, before the gates' fixes, which touch no browser code). **Three defects the gates found were fixed test-first:** v8's stories cache and the data epoch (`7da4e5b7`); the Claude spend record that, after one locked open, refused Claude until a restart (older than v8; `5b6b8763`, `21ff151d`); and v8's own Sarvam test's thin timing margin (`19230a27`), with v6's night-time clock test pinned (`713a50f0`). The ready-to-run production bundle (`.next-prod`, as `start-fast.bat` builds it) was rebuilt on `21ff151d`.

### Not verified

- A real microphone in a real room; a Tamil speaker's ear on the Tamil lines.
- Sarvam against the real service.
- Questions' latency on the final bundle (measured on the bundle before the last three fixes, which add no call on a question's path).
- live-60 paired item by item with v7 (the result file was overwritten; the totals are equal per language).
- Writing a call's cost to the spend record can still wait past its 2 s under extreme contention (12 processes writing without pause, in a test); older than v8 and not changed.
- The fixes after `.next-v8e` (`7da4e5b7`, `5b6b8763`, `21ff151d`) were not replayed on the real path; they touch no single request's answer, and the gates ran on them.

## v7 (17-18 Nov 2026)

Branch `claude/jarvis-v7-upgrade-00072d`, from v6's `736ce5f1`. The brief and the plan: `docs/jarvis/JARVIS_V7.md`; the research: `docs/jarvis/v7-research/`. **Not merged, no PR: the owner decides.** Numbers: `chennai-grievance-portal-main/eval/RESULTS.md` (v7 section on top). The night's record: `docs/thunai/BUILD_LOG.md`. What to say in Edge: `docs/jarvis/DEMO.md` (v7 table on top).

**Read this first.**
- **Jarvis now answers like an aide instead of reading the screen.** For a question (an incident, "tell me about this news", "the Adyar issue", why, compare, a brief, a follow-up), the screen goes up as v6 built it and a model writes two to four sentences from the screen's facts: the point first, why it matters, what is done or stuck, what needs you. Code checks every sentence against the facts before it is spoken; a sentence that fails is never said. Nothing on the screen is read out item by item ("read them" still does).
- **Grounding is high, not perfect.** Every sentence Jarvis says passed code's check against its facts. Re-checked afterwards: on the last dev run (Haiku writing, 48 questions) the audit passed 47 of 48 answers (the flag: a false "found" on a Tamil outside question, fixed); on the holdout (once, at the end) 47 of 48, the flag read by hand and supported. An independent grounding judge's flags, read by hand, found **3 sentences of 118 (dev) and 3 of 115 (holdout)** that overstate or misrender: "almost twice" for 1.7 (fixed), a wrong Tamil "more in Adyar", "severe" for an incident rated high, a citizen's Tanglish complaint misrendered, "metro transport" for an Intelligent Transport System, a Tamil "much more" for 16 against 11. So **100 % grounded is not met.** After the finals an independent code review found more ways a wrong sentence could pass the checker (a figure put on the wrong place across a comma, "up 18" against "down 18", "this afternoon" against "yesterday afternoon", a window's length taken for a count, and more); all were fixed test-first (`3bd03b13`), and the dev set was run again on that code (below). Comparatives ("more in X") and a paraphrase of the record's words are still not checked by code.
- **Outside the dashboard:** 16 outside questions across dev and holdout: nothing invented; each said plainly that the dashboard and the latest news have nothing on it, in your own words, or refused a place outside the district. One false "found" on dev (a Tamil place name as the search) was fixed (dashboard first, then the outlets' own feeds; nothing is filled in by a model).
- **The judge prefers v7:** a blind judge (Gemini 3.1 flash-lite, both orders) preferred v7 to v6 on the dev set 36-1 before the review's fixes and **38-2 on the final code** (tie 1, split 3, 7 undecided; sign test p 5.5e-10) and on the holdout **35-2** (tie 2, split 5, 4 undecided; p 1.0e-8), in every kind and language.
- **The cost is time.** v7 waits for its first checked sentence, where v6 spoke its line at once. With Haiku writing, on the same bundle and the 11 questions both runs timed, the first word came at p50 3.7 s against 1.7 s for v6's answers (the median per-question difference 1.0 s); the first sentence reached the browser 0.8-3.2 s after the screen. With Haiku planning and Groq writing, the same day: +0.3 s per question at the median. Groq-led v7 against v6's Groq figures (another day): 3.2 s against 2.9 s at p50, 4.2 s against 6.3 s at p90. The target "no slower than v6" is **not met** with Haiku writing. `JARVIS_AIDE_LEAD=groq` makes Groq write first while Haiku plans; `JARVIS_ANSWER=v6` restores v6's answers.
- **Understanding:** live-60 with Haiku leading : 46/60 against v6's 45/60 (Tamil 24/30 against 25/30; paired p 1.0): at least v6's, not higher. Two holdout follow-ups got no answer ("tell me more about that one", "since when?").
- **Claude:** you allowed it at 22:45 ("use claude api limit 10 dollar"); v7 spent US$0.119 of the US$10 ceiling (446 calls; record before: 93 rows, US$0.024195; after: 539 rows, US$0.142792).
- **Nothing was tried with a real microphone in a real room**, again; the Tamil wording is model-written and not checked by a Tamil speaker.

### Owner actions and decisions (first)

1. **Which model writes the answers.** Haiku's answers are the ones judged against v6 above (Groq's were not judged against Haiku's); Haiku is slower to its first sentence (about 1.1 s after the screen in the runner, 0.8-3.2 s on the real path) than Groq's qwen (0.4-0.6 s), and Groq's free day holds about 100 answers a model. Default: as the planner (Haiku first when the key works). `JARVIS_AIDE_LEAD=groq` puts Groq first for the writer only. Your call.
2. **Jarvis's own Claude day cap.** It is 1.5M tokens and 500 requests a day, set in v4 against Opus's prices; on Haiku 5.5 that is under US$0.10 of spend, so a busy day would drop Claude to Groq long before your US$10 ceiling. The runs raised it by flag (`JARVIS_CLAUDE_DAY_TOKENS`, `JARVIS_CLAUDE_DAY_REQUESTS`); the default is unchanged. Say if it should be raised for Haiku.
3. **The judge and the spoken style are model-made.** The dev and holdout questions, the Tamil example lines in the writer's instructions and the judges are all models; a Tamil speaker should listen to the Tamil answers (DEMO step 6).
4. Still open from v6: "Hi Jarvis" on the device, the wake reply's voice, the talk-over trade-off, the news reader's lists, IndicConformer's licence, Groq Zero Data Retention (v6 section below).

### What shipped

- **The aide (`src/lib/thunai/aide7/`):** `facts.ts` (the screen as numbered facts by code: figures, Tamil names, times said as a person says them in IST, every ratio, rank and direction worked out in advance; a citizen's complaint never reaches a model, identifiers masked), `prompt.ts` (fixed-bytes instructions per language, cached by Haiku), `writer.ts` and `stream.ts` (one streamed plain-text call: `GAP:` then `S: sentence [F1,F3]` lines; Haiku 5.5, then Groq qwen3.8-27b, gpt-oss-120b, gpt-oss-20b, then Gemini flash-lite), `ground.ts` (the checker: figures exact or hedged, a figure bound to its place, names in English, Tamil and transliteration, times, causes, direction, superlatives, multiples, absolutes, guesses, ids, markup, copying the screen, lists, length, language), the repair ladder (the first sentence: one re-ask if there is time, else the next model, else the recipe's own line; a later failure ends the answer), `gap.ts` (the part the dashboard does not hold: the dashboard's news, then the outlets' feeds; a nothing line in your own words that claims only what was searched), `index.ts` (which turns get it, the round's wiring), `news.ts` (the /news route's brief written by the aide).
- **New code lanes (`asks7.ts`):** compare everything / all zones / all departments; this period against the last; why A is worse than B; the X issue; "who has it?" with a case on the screen; a public office or event, and current events with no district word, to the place's situation or the news with the outside part searched, never the general lane's model memory.
- **"Tell me about this news"** reads the report in focus (English, Tamil, Tanglish).
- **Evaluation (`aide7/eval7.live.ts`):** dry routing, live runs of v7 and v6, the audit, the blind pairwise judge in both orders, the grounding judge; `V6_FROM` / `V7_FROM` reuse one side's answers; the dev (48) and holdout (48, hashed before tuning) sets in `eval/v7/`.
- **An independent read-only check after the finals** (three reviewers: the aide's code, the wiring with privacy and spend, the numbers against the result files) found real defects: ways a wrong sentence could pass the checker, routing that took ordinary commands away from their lanes ("10 cm of rain" as the CM, "draft a letter about the issue in Adyar" never reaching the planner), the browser's number gate silencing queued checked sentences and approving unchecked figures, an incomplete v6 rollback, uncounted spend on a mid-stream Claude error, a document of any source readable by the news aide, and 15 inaccuracies in these write-ups. All fixed test-first (`3bd03b13`, `a3ff4df4`, `23cb02da`) or corrected here; the dev set was run again on the final code (RESULTS).
- **Defects found by running it, each fixed test-first:** see BUILD_LOG (a level read as a rise; a two-letter gap match; a Tamil place name as the gap's search; v6's "why did flooding reports drop" refused as an order to drop records; and the false refusals).

### Flags (new in v7, with their defaults)

| Flag | Default | What it does |
|---|---|---|
| `JARVIS_ANSWER` | `v7` | `v6`: v6's answers (its lines, the items read out) and v6's routing (no `asks7`) |
| `NEXT_PUBLIC_JARVIS_ANSWER` | `v7` | the browser's side of the same switch ("tell me about this news" lanes): set it to `v6` together with `JARVIS_ANSWER=v6` |
| `JARVIS_AIDE` | on | `0`: v7's routing, the recipe's own line (no writer): the understanding runs use it |
| `JARVIS_AIDE_WEB` | on | `0`: no look-up for a gap (the answer says the dashboard has nothing on it) |
| `JARVIS_AIDE_FIRST_MS` | `3500` | the first checked sentence's deadline after the screen is ready, then the fallback (800-15,000) |
| `JARVIS_AIDE_LEAD` | as `JARVIS_PLANNER_LEAD` | `groq` puts Claude after Groq for the writer; `haiku` Haiku first |
| `JARVIS_CLAUDE_DAY_TOKENS`, `JARVIS_CLAUDE_DAY_REQUESTS` | unset (1.5M, 500) | raise Jarvis's own Claude day cap for a run; the spend ceiling holds every call whatever |

### Runs owed (from `chennai-grievance-portal-main/`)

1. **The real-room check** (DEMO, v5 section) and the v7 table at the top of DEMO, in Edge, with a person speaking; a Tamil speaker listening to the Tamil answers.
2. **Latency with Groq writing on more clips** (4 a language here): `NEXT_DIST_DIR=.next-v7 NEXT_PUBLIC_JARVIS_SPEC=1 npx next build`, `CLAUDE=1 JARVIS_CLAUDE_BUDGET_USD=10 bash scripts/jarvis7/serve-real.sh .next-v7 3012 JARVIS_AIDE_LEAD=groq`, `REAL=1 SPEC_PROD=1 V6_TAG=<tag> V6_PARTS=en,ta,tg LIVE_GAP_MS=20000 npx playwright test tests/e2e/real6.spec.ts`, `node scripts/jarvis6/compare.mjs v7h6 <tag>`.
3. **The news coverage brief in the browser** (owed from v6).

### Gates on the final code

Type-check, build, guards, pass 7's tests, the access matrix, the browser drive and j1 green; lint clean after one rename in a new test; Jarvis browser specs 41/41. Three reds, none from v7's code: v6's `brief6.case.v6.test.ts` "a problem dated by the day alone" fails at night (its report one hour before the clock reads as "last night" or "early this morning"; it passes in the day; pin its clock to fix it); pass 4's RC-35 load timeout (known, as in v6); the golden master against the old baselines (as in v5 and v6).

### Known limits

- **The checker does not check comparisons or severity words**: "more in Adyar" against the facts' two numbers, or "severe" said of an incident rated high, pass if their figures and names are right. The dev run's grounding judge found one of each in 118 sentences.
- **The first word is later** (above). The screen is never held back for the words.
- **A one-word gap search is loose**: "is the CM coming to Adyar?" in Tamil searched the one word for the CM the Collector said and matched three reports of the CM inspecting the 108 ambulance centre; the answer framed them honestly ("nothing on Adyar, but ..."), yet a looser match could bring an unrelated report. The writer also still says "the records here show no ..." before code's own nothing line now and then (its instructions say not to).
- **The gap search reads headlines only** (the dashboard's stored news and the outlets' feeds, by the words you said); a report that names the event differently is missed and the answer says nothing was found.
- **Tamil:** the writer's Tamil is model-written; the nothing line in Tamil is code's template.

### The owner's Claude test plan (ready to run; US$10 ceiling)

Done in this build already with your key (US$0.119 in all): the dev set five times, the holdout once, live-60 once, three latency runs with Haiku leading. To repeat or extend, from `chennai-grievance-portal-main/`, in Git Bash:

1. **Before:** `node scripts/jarvis7/claude-spend.mjs` (rows and dollars).
2. **The answers on the dev set** (48 questions, about US$0.013): `JARVIS_LIVE_CLAUDE=1 JARVIS_CLAUDE_BUDGET_USD=10 JARVIS_CLAUDE_DAY_TOKENS=6000000 AIDE7=run SET=dev TAG=<tag> V6=all LIVE_GAP_MS=20000 npx vitest run --config vitest.live.config.ts src/lib/thunai/aide7/eval7.live.ts`, then the same with `AIDE7=audit`, and `AI_GEMINI_MODEL_FAST=gemini-3.1-flash-lite JUDGE_MODEL=gemini-3.1-flash-lite AIDE7=judge` (free).
3. **The voice path in the browser:** `npm run build` as usual, `start-fast.bat`, then the v7 table at the top of `docs/jarvis/DEMO.md`: "Hey Jarvis, tell me about the Adyar issue", "who has it?", "show me the latest news" then "tell me about this news", "compare everything", "why is Adyar worse than Anna Nagar", "CM Vijay is visiting Adyar, what should I know?", the Tamil and Tanglish lines.
4. **Timed:** the latency commands in "Runs owed" 2, with `CLAUDE=1` (Haiku writes) or `JARVIS_AIDE_LEAD=groq` (Groq writes).
5. **After:** `node scripts/jarvis7/claude-spend.mjs` again.

## v6 (17 Nov 2026)

Branch `claude/jarvis-v6-build-adbae2`, from the v5 build at `a7943b2f`. The brief is `docs/jarvis/JARVIS_V6.md`. **Not merged, no PR: the owner decides.** Numbers: `chennai-grievance-portal-main/eval/RESULTS.md` (v6 section on top). The day's record: `docs/thunai/BUILD_LOG.md`. The reel: `docs/jarvis/DEMO.md`.

**Read this first.**
- **"Hey Jarvis" is instant now**: the spoken "Yes?" comes p50 193 / p90 210 ms after the name with Jarvis open (n 24), 163 / 185 ms closed (n 12), against v5's tone at 703 / 743. **"Hi Jarvis" is not**: the on-device model knows only "Hey Jarvis", so "Hi/Hello Jarvis" still go through the speech service (636 / 826 ms).
- **Answers start sooner but not within the brief's targets**: English question -> first word 2.9 / 3.7 s (v5 4.1 / 5.5 s); the voice itself starts 0.7 s after it is handed over (v5 1.3 s), Tamil 1.0 s with its short first chunk (was 2.6 s). The rest is the planner and the speech-to-text round trip; the first sound (the end-of-speech earcon) stays at about 0.41 / 0.44 s.
- **Jarvis reads the news**: "read the first article" -> the brief in hand 0.85 / 1.3 s (n 11) with the outlet and the time, the sources as links.
- **Briefings sound like an aide in English; Tamil is even**: a blind judge preferred v6 to v5 17-5 in English and 12-10 in Tamil (n 22 each, the final code); every figure and name traces to the record (34/34).
- **Understanding rose with Claude, not with v6's code**: with Claude Haiku 5.5 leading the planner (your working key, from 19:14), live-60 scored **45/60** (v5 on Groq 36/60; paired exact McNemar p 0.049), Tamil 25/30 (v5 14/30); the new intents stayed low, 8/30 on the second run (v5 7/30, p 1.0); the first Claude-led run, 2/30, was a capacity failure from the runner's pacing (kept as `v6final-planner3-live30.json`; the runner fixed). The brief's targets (52/60, Tamil 26/30, new intents 75 %) are not met. The planner is v5's and the code lanes scored as in v5 (16/21), so the gain is the model; handling the new intents in code is the likely next step (not built). Spend: **US$0.021** for both sets.
- **Claude ran for the understanding finals only**: every latency figure is Groq's. Your pasted key sat on a line of its own; it is now the `ANTHROPIC_API_KEY=` line of this worktree's `.env` and the refused one is commented out (neither was printed). With a working key Haiku leads the planner by default (`JARVIS_PLANNER_LEAD=groq` keeps Groq first), and its call took p50 2.1-2.4 s in the runner against the Groq planner's 1.2 s in the v6a waterfall: the voice path with Claude leading is not measured, and the answer times above would not hold with it (`JARVIS_PLANNER_LEAD=groq` keeps them).
- **Nothing was tried with a real microphone in a real room**, again.

### Owner actions and decisions (first)

1. **The Anthropic key: put the working one where Jarvis runs.** You allowed Claude on 17 Nov (US$5 at most, then Groq). The key in every `.env` was refused (401 "invalid x-api-key") until you pasted a working one into this worktree's `.env` at 19:14; the finals then spent **US$0.021**. The main checkout's `.env` (and v5's worktree) still hold the refused key. The live runners that call `groqOnly()` (holdout, brief6, bakeoff, grid, keepalive) use Claude only with `JARVIS_LIVE_CLAUDE=1`; `claude.live.ts`, `claude.v4.live.ts` and `deploy.live.ts` call Claude whenever a key is in `.env` (the US$5 ceiling still holds). The spend record held test runs' pretend costs (US$0.25, no real call): it was renamed aside to `data/thunai/claude-budget.test-rows-17nov.sqlite`, and the unit tests now use a temporary record. The ceiling is built (`src/lib/ai/claudebudget.ts`): each billed Claude response, from any caller, is counted in `data/thunai/claude-budget.sqlite`; from $4.75 (the $5 ceiling less one call's $0.25 margin) the key is treated as absent and the planner, the warm-up and the console's steps go to Groq; if that record cannot be kept (no `node:sqlite`, as on Node 22 before 22.13), no Claude call goes out at all. Put a working key in `chennai-grievance-portal-main/.env`, then run the deploy check (`docs/jarvis/DEPLOY_HAIKU.md`).
2. **"Hi Jarvis" on the device.** The on-device wake word that shipped is LiveKit's pretrained "hey jarvis" model (Apache-2.0 code and weights). It answers "Hey Jarvis" in about 0.2 s; "Hi Jarvis" and "Hello Jarvis" still go through the speech service (p50 636 / p90 826 ms, the tone). A "Hi Jarvis" model means training one: LiveKit's own trainer needs a CUDA GPU (none here) or their paid cloud; a sherpa-onnx keyword spotter could be built as WebAssembly without training, unmeasured. Your call whether to train, to switch the spoken greeting to "Hey Jarvis", or to keep both.
3. **The wake reply's voice.** The nine short replies (five English: "Yes?", "Go ahead.", "I'm listening."...; four Tamil) were made once with Gemini TTS (voice Despina, the 2.5 and 3.1 preview speech models) on the free tier and ship as files in `public/thunai/wake/`; Edge's Neerja (the answer's voice) cannot start fast enough cold (0.5-1.6 s measured). Your call whether a different voice for the first word is acceptable, and whether audio generated on Gemini's free tier may ship (its terms let the outputs be used; free-tier inputs are used to improve Google's products).
4. **The talk-over trade-off.** The reply waits for 90 ms of quiet after "Hey Jarvis". When a command follows in one breath ("Hey Jarvis, show the severe cases"), the reply lands in its comma pause at 90 and at 150 ms alike (4/4 each), and with Jarvis open the command is still heard and acted on (8/8). **Closed, the same comma pause opens Jarvis with the reply and stops the browser's recogniser, so the command said in that breath is lost** (v5's recogniser kept it as the sentence's rest; a sentence said straight on, with no pause of 90 ms within 0.4 s of the name, is still left to the recogniser). This cannot be measured under automation (the recogniser gives nothing there). Your choice: keep the instant closed reply (`NEXT_PUBLIC_JARVIS_KWS=all`, the default: say "Hey Jarvis", wait for "Yes?", then the command), or `NEXT_PUBLIC_JARVIS_KWS=open` (the device's wake word only while Jarvis is open; closed it is v5's recogniser, about 1 s, with same-breath commands kept). `NEXT_PUBLIC_JARVIS_WAKE_QUIET_MS` raises the pause.
5. **The news reader's lists.** `chennai-grievance-portal-main/config/jarvis-web-domains.json` is your allow/deny list (seven Tamil Nadu outlets' own feeds, NDMA SACHET for weather warnings, Wikipedia's API; Google News and GDELT denied). Two decisions in it: Wikipedia's API paths are read although its robots.txt asks crawlers to keep out of `/api/` and `/w/` (`robotsExempt`; the Wikimedia API policy sanctions bots that identify themselves), and the `contact` field Wikimedia's User-Agent policy asks for is empty. The publishers' feed terms were not read.
6. **Free local Tamil hearing (B5)**: still waits on your yes to IndicConformer's weights licence; not wired.
7. **Groq Zero Data Retention** (console, Data Controls): still assumed off.

### What shipped

- **Instant wake (Phase 2):** LiveKit WakeWord's "hey jarvis" model (Apache-2.0, `public/thunai/hey_jarvis.onnx`, its own worker on the page's onnxruntime-web) listens while Jarvis is open and closed (`NEXT_PUBLIC_JARVIS_KWS=all`). The HUD answers in the next frame; a short spoken reply ("Yes?", `public/thunai/wake/`) plays once the Collector pauses (90 ms). Closed, a pause after the name opens Jarvis with the reply at once (a comma pause too: a command in the same breath is then lost, owner decision 4); a sentence said straight on with no pause is left to the browser's recogniser, which brings its words whole. "Hi Jarvis" and "Hello Jarvis" still wake through the speech service as before.
- **The voice starts sooner:** a silent utterance warms Edge's natural voice while a sentence to Jarvis is said (`NEXT_PUBLIC_JARVIS_VOICE_PREWARM`), so the answer's first word starts in about 0.7 s after it is handed over, not 1.3 s.
- **Speech to text:** a bare "Jarvis" ends the race at the first decode; English speech decoded by the forced-Tamil Whisper (a translation) no longer wins over the English decode when it is less sure: English clips heard as Tamil 7/12 → 1/12.
- **End of turn:** a short command (up to 1.8 s of speech) ends after 180 ms of quiet (was 300), with the live captions running too (they had overridden it); the console step runs while the pointer glides (was after it).
- **Briefings (Phase 3, `brief6.ts`):** an incident is told as an aide would: what and since when (relative, IST), why it is serious (complaints, the outlet that reported it and when, the deadline), who has it and what is stuck (the record's own assignment, by role, never a name or the directory), what I would do, "Want the details?". Tamil the same. `JARVIS_BRIEF=v5` restores the old retelling.
- **News and the web (Phase 4, `src/lib/thunai/web/`, `newsask.ts`):** "read the article", "the second article", "read DT Next's report", "what are other papers saying", over the news on screen (Jarvis's list or the console's panel) or a case (that incident's own news report); "look it up", a forecast, a warning or the Met department to the web (NDMA SACHET, Wikipedia, the outlets' feeds). The first line is said at once, the brief as it comes; the sources are links on the Stage. SSRF, robots.txt, caps, a 10-minute memory cache, the owner's allow/deny list, prompt-injection and privacy tests (103 + the turn's).
- **Understanding (Phase 5):** the place lane: a place's state asked loosely ("what's happening in Royapuram", "Kodambakkam la enna nadakkudhu", "தேனாம்பேட்டை எப்படி இருக்கு") goes to the situation screen by code, no planner.
- **The feel (Phase 6):** the HUD's core pulses on the voice's real word starts and on the wake reply's own audio. Look and layout unchanged.
- **The owner's Claude ceiling:** US$5 (`JARVIS_CLAUDE_BUDGET_USD`), counted across processes; no shared record means no Claude call; aborted calls counted at their worst case; each call in flight holds a margin.
- **A browser-bundle guard:** the build broke when the briefing imported a store module into the console's bundle; a test now walks the browser import graph from `Thunai.tsx`.

### What was cut, and why

| Item | What happened | Why |
|---|---|---|
| "Hi Jarvis" on the device | Not built | The pretrained model is "hey jarvis"; a "hi jarvis" model needs training (LiveKit Cloud and a CUDA GPU, or a sherpa-onnx WebAssembly build, unmeasured): the owner's call |
| Planner or prompt changes for understanding | None | The Claude key was refused until 19:14, so there was no stronger model to tune against; the grid of v5 selected no change; the free Groq allowance went to the measurements. The finals then ran v5's planner with Haiku 5.5 leading |
| E2 early speech-to-text | Still off (v5's default) | Now switchable per measuring run (`NEXT_PUBLIC_JARVIS_EARLY_STT`), not measured on/off this build: with the short end of turn the upload already goes at about 190 ms of quiet on a short command |
| A semantic end-of-turn model (Smart Turn) | Not built | BSD-2 and promising in the research (10 §1), but no Tamil and unmeasured here |
| Faster situation screens | Not changed | Its server calls already run in parallel; the cached store's slowest call sets 1.2-2.6 s |
| Local voices, Gemini Live | Not built | Edge's voices start in about 0.2 s warm (English); a voice change is the owner's |

### Flags (new in v6, with their defaults)

| Flag | Default | What it does |
|---|---|---|
| `NEXT_PUBLIC_JARVIS_KWS` | `all` | The on-device "Hey Jarvis" (LiveKit WakeWord `hey_jarvis.onnx`, Apache-2.0, in a worker): `all` while Jarvis is open and closed, `open` only while open, `off` none (v5: the browser recogniser only) |
| `NEXT_PUBLIC_JARVIS_KWS_THRESHOLD` | `0.5` | The wake word's score to fire |
| `NEXT_PUBLIC_JARVIS_WAKE_REPLY` | `clip` | `clip`: a short spoken reply ("Yes?", five English and four Tamil, `public/thunai/wake/`); `tone`: v5's tone |
| `NEXT_PUBLIC_JARVIS_WAKE_QUIET_MS` | `90` | How long the Collector must pause after "Hey Jarvis" before the reply plays (at 150 the reply still landed in a one-breath command's comma, 4/4 as at 90, and came 60 ms later) |
| `NEXT_PUBLIC_JARVIS_VOICE_PREWARM` | on (`0` off) | A silent utterance keeps Edge's natural voice warm while a sentence to Jarvis is said, so a warm start is about 0.2 s (probes), not 0.5-1.6 s cold; on the real path the answer's first word now starts 0.7 s after it is handed over (was 1.3) |
| `NEXT_PUBLIC_JARVIS_SHORT_EOU_MS` | `180` (`0` off) | The end of a short command (under 1.8 s of speech) after 180 ms of quiet, not the normal 300; with the live captions running too |
| `NEXT_PUBLIC_JARVIS_GLIDE_FIRST` | off | v5's order (the screen glides, then the step runs); v6 runs the step during the glide |
| `JARVIS_STT_NAME_FAST` | on (`0` off) | A bare "Jarvis"/"Hey Jarvis" ends the speech-to-text race at the first decode |
| `JARVIS_STT_DIRECTION` | on (`0` off) | The forced-Tamil decode that translated English speech loses to the English one when it is less sure |
| `JARVIS_BRIEF` | `v6` | `v5` restores the old incident retelling |
| `JARVIS_LIVE_CLAUDE` | off | `1` lets a live runner that calls `groqOnly()` (holdout, brief6, bakeoff, grid, keepalive) keep the Claude key and lead; off, it removes the key (v5's rule) |
| `JARVIS_CLAUDE_BUDGET_USD` | `5` | The owner's ceiling on Claude spend; past it (less one call's margin, $0.25) every caller goes to Groq |
| `JARVIS_CLAUDE_BUDGET_FILE` | `data/thunai/claude-budget.sqlite` | Where the spend is counted (counts and dollars only) |
| `JARVIS_WEB_DOMAINS` | `config/jarvis-web-domains.json` | The owner's allow/deny list for the news reader |
| `JARVIS_WEB_MODEL` | off | An optional model step that compares the outlets' text (spotlighted, quotes checked verbatim); off: code compares |
| `NEXT_PUBLIC_JARVIS_TA_FIRST_CHUNK` | `48` (`0` off) | A Tamil answer's first spoken chunk, at most this many characters (Edge's Tamil voice starts later the longer the utterance) |
| `NEXT_PUBLIC_JARVIS_SHORT_UTT_MS` | `1800` | How much speech still counts as a short sentence (1.2 s until the last measurement: 8 commands a side, end of turn p50 403 -> 281 ms, screen p50 805 -> 720; `1200` restores it) |
| `NEXT_PUBLIC_JARVIS_EOU_MS` | `300` | Any other sentence's end-of-turn quiet (measuring knob, 150-1000) |
| `NEXT_PUBLIC_JARVIS_EARLY_STT` | off (v5's E2) | Now also settable per run in a measuring build (`window.__jvFlags`) |

Every `NEXT_PUBLIC_` flag above except `NEXT_PUBLIC_JARVIS_TA_FIRST_CHUNK` can also be set per run in a build made with `NEXT_PUBLIC_JARVIS_SPEC=1` through `window.__jvFlags` (the real-path spec's `V6_FLAGS`); a normal build reads its environment only.

### Runs owed (each with its exact command, from `chennai-grievance-portal-main/`)

1. **The real-room check** at the top of `docs/jarvis/DEMO.md`, then the v6 reel there.
2. **The deploy check** with the working key in the copy that runs Jarvis (`docs/jarvis/DEPLOY_HAIKU.md`), and **the voice path timed with Haiku leading** (`tests/e2e/real6.spec.ts` on a server with the key, not measured). The understanding finals with Haiku leading are done (RESULTS v6, Phase 5). To repeat them, the runner needs `JARVIS_LIVE_CLAUDE=1`: `JARVIS_LIVE_CLAUDE=1 JARVIS_CLAUDE_BUDGET_USD=5 HOLDOUT=planner2 HOLDOUT_DIR=holdout2 HOLDOUT_SET=live60 HOLDOUT_TAG=<tag> LIVE_GAP_MS=20000 npx vitest run --config vitest.live.config.ts src/lib/thunai/holdout.live.ts` and `HOLDOUT=planner3 HOLDOUT_DIR=holdout3 HOLDOUT_SET=live30 …` with the same flags, paired by `HOLDOUT=pair`; without the flag the runner removes the key and the run is Groq's.
3. **The news coverage brief in the browser**, on a day the outlets cover the same story: build `NEXT_DIST_DIR=.next-v6 NEXT_PUBLIC_JARVIS_SPEC=1 npx next build`, serve `bash scripts/jarvis6/serve-real.sh .next-v6 3012`, run `REAL=1 SPEC_PROD=1 V6_TAG=<tag> V6_PARTS=news V6_WAKES=wake_zira,wake_mark,wake_g_puck LIVE_GAP_MS=10000 npx playwright test tests/e2e/real6.spec.ts`, then `node scripts/jarvis6/news-latency.mjs <tag>`.
4. **E2 on and off with questions** (commands done: on the final bundle E2 brought the transcript p50 787 -> 639 ms, 8 commands a side): `V6_FLAGS='{"NEXT_PUBLIC_JARVIS_EARLY_STT":"1"}'` against none, `V6_PARTS=en,ta,tg` (about 30 planner turns each), then the room check before turning it on.
5. **The questions again on the final bundle** (the place lane and Tamil's first chunk on all 36): `V6_TAG=<tag> V6_PARTS=en,ta,tg LIVE_GAP_MS=20000` (about 30 planner turns), then `node scripts/jarvis6/compare.mjs v6a <tag>`.

### Known limits

- **The free Groq tier** carries about 69 planner calls a model a day; this build's measurements spent qwen3.8-27b's and gpt-oss-120b's (gpt-oss-20b's was already spent by v5's last runs). The understanding finals used none of it (Haiku 5.5, then flash-lite).
- **Edge's Tamil voice** starts in 0.8-3 s depending on the sentence's length; English in about 0.2 s.
- **The wake reply can sound in a comma pause**: "Hey Jarvis, show the severe cases" said in one breath got the reply in its comma (4/4 at 90 ms and at 150 ms of required quiet); the command was still heard and acted on (8/8).
- **The situation screen's data takes 1.2-2.6 s** on the cached store.

## v5 (15-17 Nov 2026)

Branch `claude/jarvis-v5-build-dfece7`, cut from `origin/main` at START `f830efbd` (the v4 code at `40ff9082` plus two non-Jarvis commits). The brief is `docs/jarvis/JARVIS_V5_BUILD_2.md`. **Not merged, no PR: the owner decides.** Numbers: `chennai-grievance-portal-main/eval/RESULTS.md` (v5 section on top). The day's record: `docs/thunai/BUILD_LOG.md`. Deploying Haiku: `docs/jarvis/DEPLOY_HAIKU.md`. The room check and demo: `docs/jarvis/DEMO.md`. Oracle changes: `docs/qa/pass7/V5_EXPECTED_CHANGES.md`. Review: `docs/jarvis/BUILD_REVIEW_FINDINGS.md`.

**Read this first.**
- **Claude was not called at all, by design** (owner: build and test on Groq, add the Haiku key at deploy). The Haiku-first ladder is built and tested with mocks; the deploy check is built and never run.
- **Understanding did not move on Groq.** Final live-60 on the shipped ladder: **36/60** (60.0 %, 47.4-71.4), Tamil 14/30, against v4's 39/60 on the same sentences (paired b 4, c 7, p 0.55: no difference shown either way); new intents 7/28 clean (25.0 %, 12.7-43.4) against v4's 6/29. The targets (52/60, Tamil 26/30, new intents 75 %) are **not met**. The grid selected no planner change, so the planner prompt is v4's.
- **Nothing was tried with a real microphone in a real room**, again.

### Owner actions (first)

1. **Turn on Groq Zero Data Retention** (console, Data Controls). This build assumed it is off. Groq keeps nothing by default but may keep logs up to 30 days (B, https://console.groq.com/docs/your-data).
2. **Fix the Anthropic key** (it returned 401 on 15 Nov 2026), make sure `JARVIS_CLAUDE_OFF` is not set, then run the deploy check exactly as `docs/jarvis/DEPLOY_HAIKU.md` says and set the env lines it prints. It stops at $0 if the key is refused and caps itself at US$0.50.
3. **Know the free-tier ceiling:** Groq's free plan (8K tokens a minute, 200K a day per model, checked from the response headers) carries about 69 planner calls a model a day at about 2,880 tokens a call, about 208 over the three models: **it cannot carry 300 planner turns a day.** Haiku at deploy is the capacity answer (a 429 is a capacity failure, never a wrong answer).
4. **Decide on IndicConformer's weights** (free local Tamil hearing, B5): the MIT licence file is in AI4Bharat's GitHub repository; the Hugging Face weights are gated with only a `license:mit` tag, and every runnable export is an individual's. Measured, not wired: on 200 FLEURS read-Tamil clips the OpenVoiceOS fp32 export of the 120M Tamil IndicConformer passes every B5 gate (WER 29.1 against forced-Tamil Groq's 56.4; a 6 s clip in p50 270 / p90 317 ms at 4 threads; 674 MB), but it loads in sherpa-onnx only after four metadata entries are appended to a copy, and it has a `license: mit` tag and no licence file. Every int8 export failed the speed gate on this CPU (p50 1,020-2,750 ms). Figures: `eval/RESULTS.md`, "Free local Tamil decode (B5)".
5. **Decide whether to open a free Cloudflare Workers AI account** as an overflow speech pool (zero retention by default: B, https://developers.cloudflare.com/workers-ai/platform/data-usage/). Not created, not built.
6. **Decide whether Gemini TTS may stay on the free tier** (the app's second voice): free-tier content is used to improve Google's products (B, https://aistudio.google.com/docs/pricing). Unchanged.
7. **The decisions of section 3.1**, with what was measured: 

| Decision | Built with (the brief's default) | What was measured, for the choice |
|---|---|---|
| Drop the unengaged command tier | Dropped; `JARVIS_GATE_COMMAND_TIER=1` restores it | Shipped: side talk with Jarvis idle 0/60, 0/40, 0/200; unnamed commands refused 40/40 and 60/60. With the old tier: 4/60, 17/40, 21/200 acted; commands accepted 35/40 and 55/60 |
| A small-model veto on the gate | Off, not built | Engaged window (5 s after Jarvis's turn): 14/60, 6/40, 58/200 side lines acted, all at tier 2 (no model) |
| Licence tag in place of a licence file (embedding routers) | Not accepted; the n-gram router is the only one | Route-then-fill (G) on the n-gram shortlist did not beat the v3 prompt (A) on the grid |
| Which Claude model leads | `claude-haiku-5-5`, thinking disabled; `JARVIS_PLANNER_LEAD=groq` puts it after Groq; Opus never first | Nothing live (no Claude call by design); the deploy check measures it |
| IndicConformer weights (B5) | Measure only; nothing wired | The OpenVoiceOS 120M fp32 passes all four gates (WER 29.1 against Groq's 56.4; p50 270 ms; 674 MB) after its metadata is appended; every int8 export fails the speed gate here |
| Cloudflare Workers AI account | Not created, not built | — |
| Gemini TTS on the free tier | Unchanged | — |
| Groq Zero Data Retention | Assumed off | — |
| On-device wake word | Not shipped (the install broke Silero's runtime path: see "What was cut") | — |
| `echoCancellation: "all"` | Default `true`; `NEXT_PUBLIC_JARVIS_ECHO=all` | Nothing in a room; the room check compares them |
| Groq ladder order | Unchanged | Not ranked: the grid compared prompts on each model, not the models. On the final live-60 the model that answered scored qwen 15/20, gpt-oss-120b 4/8, gpt-oss-20b 0/6 (small n, different sentences: not a ranking) |
| Whether "≤ 2,500 planner tokens" counts the schema | Three counts reported | Code's count without the schema: screens about 1,220, wide about 1,890. Provider input with the schema (grid cell B, answered calls): 1,344-4,121 a call, over 2,500 on gpt-oss's calls (2,418-4,121). Final live-60, provider input + output a turn: p50 1,803, p90 4,126 (4 over 2,500, all Tamil) |
| Sets, gazetteer, spoken metric names | Model-drafted (no owner file at the paths) | Labelled "model-drafted, not checked by a Tamil speaker" |


### What shipped (each with a test that failed first where it fixes a defect)

- **The address gate (C1):** with Jarvis idle, an unnamed command is refused; the bare stop word still acts. Both command-tier returns come back only with `JARVIS_GATE_COMMAND_TIER=1` (and `NEXT_PUBLIC_JARVIS_GATE_COMMAND_TIER=1` in the browser). Side talk with Jarvis idle: 0/60, 0/40, 0/200 acted; unnamed commands refused 40/40 and 60/60. Inside the 20 s window after an answer, request-shaped lines still act (side talk there: 14/60, 6/40, 58/200).
- **Captions only while engaged (C3)**; a strict audio gate behind a flag, off (C4); Silero's 64-sample context (D1); echo cancellation `true` by default, `"all"` by flag, shown only in the measurement view (D2).
- **Speech-to-text:** the Gemini third racer is gone (B1); the echo guard uses the decode's own confidence and never drops a one-word answer to a pending question (B2, wired end to end); a keep-alive connection to Groq (E3, on: p50 316 → 245 ms on 6 + 6 Whisper requests); a gazetteer corrector, off (B3).
- **No digit reaches any voice (F1):** numbers are said in words in the sentence's language after the number gate (Tamil number words model-drafted, not checked by a Tamil speaker); counts are said as numbers, codes digit by digit.
- **Capacity honesty:** the token estimate counts the schema (A2); a strict-mode 400 gets one retry on the same model, then the next (A5); Gemini's "too many states" schema refusal falls back to plain JSON so the last rung can answer.
- **Haiku-ready (A6):** `claude-haiku-5-5` leads when a working key is present (`JARVIS_PLANNER_LEAD=groq` puts it after Groq); thinking always disabled, effort `low` (or `medium`), no sampling fields, `max_tokens` 600; a 401/403 skips Claude for 10 minutes; Opus only by explicit env and never first; the compact plan for the Claude rung (A7, off); the deploy check and `docs/jarvis/DEPLOY_HAIKU.md`. **No live Claude call was made.**
- **Planner prompt:** unchanged by default. The grid selected no prompt change, so the schema diet and conditional context (A1/A1b) ship behind `JARVIS_PLANNER_DIET`, off; route-then-fill (A3) is built and not wired. Metric names in code (A4) for the four metrics that can show a change.
- **Memory (G3):** notes carry their source, time and turn; a note copied off the Stage's news or complaint text, or not said by the Collector, is refused; old notes without a source stay listed but never reach a prompt.
- **D3:** with `NEXT_PUBLIC_JARVIS_DUCK_PAUSE=1` the duck no longer uses `pause()`/`resume()`; a backchannel after a cut resumes the answer.
- **Measurement:** the per-stage trace (timings only, zero at the last voiced sample) in the specs and the measurement view; the statistics module; the per-turn record of every live run; the diagnosis grid; frozen `eval/dev200` and `eval/sidetalk200`.

### What was cut, and why

| Item | What happened | Why |
|---|---|---|
| E2 early speech-to-text | Built, **default off** (`NEXT_PUBLIC_JARVIS_EARLY_STT=1`) | In real run 2, two English clips that decode right whole came back as Tamil when their early upload was used; owed: a real run and the room check |
| C5 on-device wake word | Not shipped | Installing `@livekit/wakeword@2.1.2` moved `onnxruntime-web` out of the top-level `node_modules`, which the page's `/thunai-ort/` route reads: Silero would not load. Today's browser wake stays |
| A3 route-then-fill | Built, not wired | Grid cell G did not beat cell A |
| A1/A1b | Built, default off | No row of the grid's reading selects them |
| F2 Edge voice start | Moved to the room check | The Playwright-launched Edge lists no natural voice and no Tamil voice |
| B5 wiring | Not wired | The brief says measure only; the one model that passes needs its metadata added before it loads and has a tag-only licence (the owner's decision). Not tried on Tanglish or a microphone |
| Grid cells C and F, a same-day rerun of B | Owed | The ledger could not fit the whole grid; D and E ran on day 2 |

### Environment variables (v5)

| Variable | Default | What it does |
|---|---|---|
| `JARVIS_GATE_COMMAND_TIER` / `NEXT_PUBLIC_JARVIS_GATE_COMMAND_TIER` | off | `1` restores v4's unengaged command tier |
| `NEXT_PUBLIC_JARVIS_STRICT_AUDIO_GATE` | off | `1`: no audio leaves the browser unless Jarvis is woken or engaged (then only "Jarvis" said inside the window is heard: keep off until an on-device wake ships) |
| `NEXT_PUBLIC_JARVIS_VAD_CONTEXT` | on | `0` turns off Silero's 64-sample context |
| `NEXT_PUBLIC_JARVIS_ECHO` | `true` | `all` asks for `echoCancellation: "all"` |
| `NEXT_PUBLIC_JARVIS_EARLY_STT` | off | `1` turns on the early upload (E2) |
| `NEXT_PUBLIC_JARVIS_FALSE_CUT_MS` | 2000 | with the duck-pause flag, how long a cut voice waits before it re-speaks (a figure not checked) |
| `JARVIS_GAZETTEER` | off | `1` corrects place names after the decode |
| `JARVIS_KEEPALIVE` | on | `0` uses the built-in fetch for Groq |
| `JARVIS_PLANNER_DIET` | off | `1`: the schema diet and conditional context |
| `JARVIS_PLANNER_LEAD` | `haiku` | `groq` puts Groq first and Haiku after it |
| `JARVIS_CLAUDE_MODEL` | `claude-haiku-5-5` | Opus only by naming it; it then goes after the Groq ladder |
| `JARVIS_HAIKU_EFFORT` | `low` | `medium` allowed |
| `JARVIS_PLAN_COMPACT` | off | `1`: the compact plan on the Claude rung |
| `JARVIS_CLAUDE_OFF` | off | `1` stops every call to Anthropic (the build's live runs used it) |
| `JARVIS_LADDER_PIN` | unset | evaluation only: `anthropic` gives the Claude rung alone |

### What each hosted service retains

- **Groq:** nothing by default; logs up to 30 days; a Zero Data Retention switch in the console (B, https://console.groq.com/docs/your-data). Assumed off.
- **Anthropic API:** prompts and outputs not retained by default for Haiku 5.5; flagged chats up to 2 years (B, https://platform.claude.com/docs/en/manage-claude/api-and-data-retention). Whether that can be turned off: not found.
- **Edge online voices:** text and audio deleted after conversion (B, https://learn.microsoft.com/en-us/microsoft-edge/privacy-whitepaper).
- **Gemini free tier:** used to improve Google's products (B, https://aistudio.google.com/docs/pricing).

### Runs owed (each with its exact command, from `chennai-grievance-portal-main/`)

1. **The deploy check** (the owner, once the Haiku key works; Claude, at most US$0.50): `HOLDOUT=deploy-haiku npx vitest run --config vitest.live.config.ts src/lib/thunai/deploy.live.ts` (see `docs/jarvis/DEPLOY_HAIKU.md`).
2. **Pair the new-intents run with v4's** (the owner, who may look in `eval/holdout3/results/`: this build did not): `HOLDOUT=pair HOLDOUT_DIR=holdout3 PAIR_X=v5final-planner3-live30.json PAIR_Y=<v4's planner3 live30 file> npx vitest run --config vitest.live.config.ts src/lib/thunai/holdout.live.ts` (no model; counts only).
3. **The repeats for pass^3** (20 of the live-60 by a seeded shuffle; about 173K Groq tokens): `JARVIS_CLAUDE_OFF=1 HOLDOUT=planner2 HOLDOUT_DIR=holdout2 HOLDOUT_SET=rep20 HOLDOUT_TAG=v5final-r1 npx vitest run --config vitest.live.config.ts src/lib/thunai/holdout.live.ts`, then `-r2` and `-r3`, then `HOLDOUT=passk HOLDOUT_DIR=holdout2 PASSK_FILES=v5final-r1-planner-rep20.json,v5final-r2-planner-rep20.json,v5final-r3-planner-rep20.json npx vitest run --config vitest.live.config.ts src/lib/thunai/holdout.live.ts`.
4. **The dev set** (575,600 tokens a pass: just under a whole free day of 600,000 over the three models; the runner starts only with 600,000 left (200 × 3,000), so only on a day nothing else has used): `JARVIS_CLAUDE_OFF=1 HOLDOUT=planner2 HOLDOUT_DIR=dev200 HOLDOUT_SET=live60 HOLDOUT_TAG=v5dev npx vitest run --config vitest.live.config.ts src/lib/thunai/holdout.live.ts`.
5. **Grid cells owed** (diagnosis; about 50K tokens each): `GRID=run GRID_RUN="openai/gpt-oss-20b:C" GRID_N=15 npx vitest run --config vitest.live.config.ts src/lib/thunai/grid.live.ts`; `GRID_RUN="qwen/qwen3.8-27b:F" GRID_N=15`; a same-day rerun of B: `GRID_RUN="openai/gpt-oss-20b:B" GRID_N=15` (copy `grid-B-openai-gpt-oss-20b.json` aside first: the run replaces its rows); then `GRID=pairs`.
6. **A real run on the shipped defaults** (E2 off; about 15K Groq tokens and 12 Whisper requests): build `NEXT_DIST_DIR=.next-agentbuild NEXT_PUBLIC_JARVIS_SPEC=1 npx next build`, start `npx next start -H 127.0.0.1 -p 3012` with `NEXT_DIST_DIR=.next-agentbuild NEXT_PUBLIC_JARVIS_SPEC=1 JARVIS_CLAUDE_OFF=1 JARVIS_PLANNER_LEAD=groq AI_PROVIDER=none AI_FORCE_PROVIDER=none AI_FALLBACK_PROVIDER=none AI_CHAT_PROVIDER=none` and the dry-run store settings of `playwright.config.ts`, then `SPEC_PROD=1 REAL=1 PW_CHANNEL=msedge npx playwright test tests/e2e/real.spec.ts`. Then the same with `NEXT_PUBLIC_JARVIS_EARLY_STT=1` built in, to see whether E2's language flips hold.
7. **The five-minute real-room check** at the top of `docs/jarvis/DEMO.md`.

### Monthly cost with Haiku leading (300 turns a day)

About **$3.42-$4.45** (2,650 tokens in and 230 out a turn; floor and +30 % tokenizer), about $2.75-$3.57 with the compact plan (prices: B, https://platform.claude.com/docs/en/about-claude/pricing). The deploy check's own cost is capped at US$0.50 (about $0.15 expected).

### Running the gates in a new worktree

- Copy `data/aws-cache/qa/` (`pinned/`, `golden/`, `durable.sqlite` **and the matching `test-collector.txt`**) and `data/thunai/` from a worktree that gated; the main checkout has none of them.
- `tests/qa/pass7/gate-fast.sh` waits on a lock folder from an earlier session (`gate-fast.sh:21`): its parent must exist and no stale `vitest-4599.lock` may be left.
- Commit everything first: the gate checks out `tsconfig.json`, `next-env.d.ts` and evidence files.
- `g2-cache` RC-35 can time out at 180 s under the full gate; alone it passes.
- `tests/qa/seed-local-users.mjs` stops with `no such function: pii_enc` on a server database since START's PII commit (`f830efbd`, before v5): the encrypting triggers call a function only the app registers. The access matrix still gave the same cells as v4's gate. Not fixed here (not Jarvis).
- Under both lanes the machine is loaded: one unit test's time bound (the B1 race) met 3,050 ms in the UTC run; its margin is now 4.5 s.
- **The Jarvis browser specs spend Groq quota through the console's translator** unless the dev server runs with `AI_PROVIDER=none` (now set in `playwright.config.ts`, with `JARVIS_CLAUDE_OFF=1`). Nothing else may hold port 3011.
- **Never run `npm ci` while a vitest or esbuild process is alive** (a locked `esbuild.exe` stops it after it has deleted part of `node_modules`; `npm install` from the lockfile restores it).

### Known limits

- **Nothing was tried with a real microphone in a real room**, again.
- **Inside the 20 s window after an answer, request-shaped side talk still acts** (up to 29 % of look-alike lines), and level B or C needs only a spoken yes. No speaker identification.
- **The free Groq tier cannot carry 300 planner turns a day**; under load the ladder now refuses a call it knows would pass the minute's allowance (A2), and the turn falls to flash-lite or to "can't reason right now".
- **Whisper's race picks Tamil for some English sentences** ("Go to the trends page", on START too).
- **Tamil number words, Tanglish metric names and the gazetteer's Tamil spellings are model-drafted**, not checked by a Tamil speaker.

## v4, "Ultimate Jarvis" (15 Nov 2026)

Branch `claude/priceless-bouman-2fe7f8`, cut from `main` at `38d96d2f`. The brief is `docs/jarvis/ULTIMATE_JARVIS.md`. **Not merged and no PR: the owner decides.** Numbers are in `chennai-grievance-portal-main/eval/RESULTS.md` (v4 section on top), the day's record is in `docs/thunai/BUILD_LOG.md`, how Jarvis speaks is in `docs/jarvis/PERSONA.md`, and the demo with its five-minute room check is in `docs/jarvis/DEMO.md`.

**Read this first.**
- **The Anthropic key on this machine is refused** (401 `invalid x-api-key`, 15 Nov). Claude never answered a single live call in this build, so every live figure is Groq first. Put a valid `ANTHROPIC_API_KEY` in `.env` and Claude goes first again with no code change. The ladder skips a refused key after one fast call.
- **Nothing has been tried with a real microphone in a real room**, again. All voice figures come from injected audio.
- **Understanding did not improve on the frozen sets, and the live-60 score fell.** On live-60 the Groq ladder scored 39/60 against `main`'s 44/60 (both runs on the same Groq ladder; paired 3 newly right, 8 newly wrong, not significant). On the new holdout3 set, a sample of 30 scored 6/29 on `main` and 6/29 on v4. The new abilities work when asked plainly (see the probe in RESULTS), but loose held-out phrasing does not reach them. Read the RESULTS section before quoting anything.

### What shipped

- **Truth first.** The speakable figure set is built only from block data and code text (`speakable.ts`). Model text slots have their figures stripped. A 1,000-case property test failed with 456 leaks on the old code and passes now. A line chart is a line. Tamil screens carry Tamil titles, block titles, notes and units.
- **The planner.**
  - Every bundle can look facts up.
  - Reads run in parallel, and code fills the answer with no second model pass unless a read failed ("stop at tools").
  - Console steps come back for act, observe, act. The screen's digest goes back too, scrubbed of phones, Aadhaar, e-mails and quoted words.
  - Memory and the last four turns reach the prompt as untrusted text.
  - Speech confidence and language steer the reply.
  - Commands get 8 s; analysis questions and missions get 25 s, with progress.
  - Likely reads start while the planner thinks.
- **A streamed turn.** `/agent/round` answers NDJSON with AG-UI event names (`events.ts`). The browser puts the screen up and speaks sentence 1 as soon as they arrive.
- **The ears.**
  - First good decode wins, and Whisper gives up at 5 s.
  - Gemini races in parallel only when the ledger allows.
  - Each language gets its own prompt, built from the lexicon and the open screen's names.
  - An English decode that translated confident Tamil cannot win.
  - `/hear` gives up after 6 s, and a split sentence is never posted twice.
  - End of utterance adapts: 300 ms when the words read complete, 650 ms after a connective.
  - The browser asks for `echoCancellation: "all"`, with a fallback.
  - Captions run only while an engaged turn is heard.
  - Barge-in ducks the voice and stops it only on two real words or 600 ms of held speech. Backchannels let it carry on, in EN, TA and Tanglish.
- **The mouth.**
  - One TTS request per answer, and one voice per turn.
  - A short earcon at the end of speech.
  - A numberless acknowledgement, spoken only if nothing is ready by 1.2 s.
  - Lakh and crore in speech.
  - Gemini TTS streaming is built behind `JARVIS_TTS_STREAM=1`, off and unverified.
- **Understanding.**
  - A typed metric registry: the planner names metrics, code computes them.
  - "What changed since yesterday / this week", split by zone, kind and department, with share of change, a surprise score and a band. It says "linked with", never "caused".
  - "Explain this one".
  - A situation view of a place.
  - A dialogue register: "the second one", "that Velachery one", "and in Adyar?". A past window said as a follow-up ("same for last week") goes on to the planner, as on `main`.
  - "How do you know?", which reads method, n, period, sources and caveat.
  - A one-slot clarify with three options.
  - About 120 more Tanglish forms, and TNEB/EB → TANGEDCO.
- **Behaves like an aide.**
  - A count-aware rise detector (after Noufaily et al. 2013) and real server-side signals.
  - The brief on power-on and on "brief me". It is finite and always ends.
  - Interjections only when nobody is speaking and no turn runs, at most three an hour.
  - Tell me / Later / Not about this.
  - Follow an incident or zone.
  - Composable missions with a plan card, Start, narrated steps with real times, stop, skip and instead-do-X. Drafts go to the tray only.
  - A decision record and "what did you do today?".
  - Memory that is opt-in, viewable and resettable. It refuses notes that read as orders (MINJA).
- **The HUD, on the teammate's light bar.**
  - One visual state machine and a mic-hot cue.
  - The core is docked and throttled to 15 fps when idle.
  - Captions in the bar, one progress line with real times, and an evidence chip.
  - Mission and interjection cards, and one history entry point.
  - Polite, debounced announcements.
  - The listen key is now `Ctrl+Shift+Space`, because Alt+Space opens the Windows window menu.

### What was cut, and why

| Item | What happened | Why |
|---|---|---|
| STT probe of `gemini-3.5-transcribe-live` | Not run | The 100 SLR65 clips are not on this machine; downloading the share-alike corpus unattended was not done. Fallback taken: Whisper first, first good decode, Gemini as a parallel third racer |
| Turn-completion model (Smart Turn v3.2, smart-turn-tamil) | Not shipped | WASM latency above the 120 ms budget, the Worker deferred by the brief's cut line, the Tamil model's provenance unverified. The adaptive text rules end every turn |
| On-device wake word, "Jarvis knows your voice" | Not built | Optional items; no model download in an unattended run |
| Silero in a Worker, 64-sample context, resampling | Deferred | The brief's Phase 2 cut line. The Silero state is now reset per session |
| Outlook band, spoken map tour | Outlook not built; the tour exists in the mission planner only | Phase 4 cut line |
| Live Claude runs (model table, structured-output proof, cache hits) | Not run | The key is refused; the code is unit-tested |
| A separate skeptic per review area | Folded into each reviewer | Two usage-limit stops during the run |

### Environment variables added

- `JARVIS_TTS_STREAM=1` (server): Gemini TTS streaming. Off by default, unverified.
- `NEXT_PUBLIC_JARVIS_DUCK_PAUSE=1` (browser): on duck, pause Edge's natural voices instead of letting them speak on. Off by default; whether Edge honours `pause()` with natural voices is unmeasured.
- `JARVIS_LIVE` (live harness only).
- The model is still `JARVIS_CLAUDE_MODEL`, default `claude-opus-5-5`. Sonnet 5.5 and Haiku 5.5 get the right thinking settings, but they were never measured.

New `TUNING` keys in `src/lib/thunai/vad.ts`, the first places to look after a real-room try:

| Key | Value |
|---|---|
| `eouCompleteMs` | 300 |
| `eouOpenMs` | 650 |
| `bargeHoldMs` | 600 |
| `bargeWords` | 2 |
| `hearTimeoutMs` | 6000 |

### How to run the demo in Edge

Exactly as before: `start-fast.bat` from the repository root opens Edge. See `docs/jarvis/DEMO.md`, which starts with the five-minute room check.

### Known limits

- **No speaker identification.** Anyone in the room can command Jarvis. Level B and C need the name and a yes, but anyone can say those.
- **Side talk that looks like a command still acts.** On holdout3's look-alike side lines (they mention places, numbers, "remember", "explain"), the address gate acted on 17 of 40. That is the same on `main` and on v4, all at Level A, never B or C. holdout2's side talk stays at 4/60. The gate was not tuned, because tuning it on holdout3 would spend the set. The v3 report's model veto is still the owner's call.
- **Loose phrasing of the new intents goes to the planner.** On the Groq models, the planner rarely picks the new recipes from it. Plain phrasings work. The planner prompt grew by about 900 tokens a turn, which may also explain the live-60 drop.
- **Tamil spoken-register lines are unchecked** by a native speaker (PERSONA.md lists them).
- **Quota:** the Groq keys are one organisation. One evaluation day used about 300K Groq tokens. Do not demo within 24 hours of a heavy run.
- **The ledger is a local SQLite file.** A multi-process host needs a shared store.
- **Two QA open-baseline rows regressed on v4 and were fixed:** open-baseline-46 (a zone's situation is its brief again, `c8b0fb1e`) and open-baseline-11 (a past week said as a follow-up goes on to the planner, `6edad240`). In both cases v4 now behaves as `main` did. Details are in `docs/qa/pass7/V4_EXPECTED_CHANGES.md`.
- **Running the QA gate in a new worktree** needs the gitignored QA data: `data/aws-cache/qa/pinned`, `golden`, `durable.sqlite` and the matching `test-collector.txt`. Copy them from a worktree that gated before; the main checkout has none.

### What a key would add (not signed up; the owner's call)

- **Sarvam** `saaras:v3-realtime` with `codemix`: the best measured Tamil on the independent Josh Talks "Voice of India" set, at ₹0.49 a minute. Bulbul v4 Flash TTS for voice.
- **ElevenLabs Flash v2.5**: Tamil voice with fast first audio.
- **Azure Speech**: 0.5M characters a month free, the ta-IN Pallavi and Valluvar voices, and an exact pause on the PCM path. The Azure branch in `say/route.ts` still compiles and has still never run.
- **A valid Anthropic key** is the cheapest win of all. The code is ready.

### Tests

From `chennai-grievance-portal-main/`:

```bash
npx vitest run
```

```bash
npx tsc --noEmit --incremental false
```

```bash
npx playwright test tests/e2e/mode.spec.ts tests/e2e/bargein.spec.ts tests/e2e/hold.spec.ts tests/e2e/vad.spec.ts tests/e2e/vadfake.spec.ts tests/e2e/e2e-latency.spec.ts tests/e2e/hud.spec.ts
```

Live evaluation: `HOLDOUT=planner3 HOLDOUT_DIR=holdout3 HOLDOUT_SET=live30` (and `rules3`, `ambient`) in `src/lib/thunai/holdout.live.ts`. It spends quota; check the ledger first. The holdout3 set is frozen in `eval/holdout3/HASHES.txt` and is still unread: only totals have been looked at.

---

## v3 (4 Nov 2026)

Pushed to `main` by fast-forward on the owner's request, 4 Nov 2026, from branch `claude/jarvis-agentic-voice-5be9b7`. The brief is `docs/jarvis/OPUS_BUILD_PROMPT_V3.md`. Numbers are in `chennai-grievance-portal-main/eval/RESULTS.md`, the day's record is in `docs/thunai/BUILD_LOG.md`, and pictures are in `docs/jarvis/screens/`.

**Read this first.** Nothing has been tried with a real microphone in a real room. Barge-in, the address gate and the latency figures come from injected or recorded audio. Do the five-minute check at the top of `docs/jarvis/DEMO.md` before showing it to anyone.

## What shipped

Turn on Jarvis mode (top bar, or `Ctrl+Shift+J`). There is no mic button.

- **Always listening, with an address gate.** It works out from the words whether it was spoken to: by name, within 20 s of its last turn, or a sentence the rules are sure of. A sentence with no name and no recent turn can only do level A. Side talk gets a faint line that fades in 2 s, and never reaches the planner.
- **Barge-in in two stages.** The energy gate pauses the voice at once, Silero confirms it is speech, and 200 ms held cancels the turn. A cough resumes from where it stopped. Every answer carries a generation id, so an old answer cannot speak after an interruption.
- **Hold words.** "wait" goes silent and changes nothing on screen, and "continue" brings the answer back. "Wait, show Anna Nagar" is a command.
- **Three lanes.** Reflex commands are local and take no model. Screens are built by code from the data, using templated speech. Planner turns are driven from the browser in rounds on `/agent/round`, using prompt bundles and a token diet.
- **Capacity handling.** A ledger keyed by organisation and model, a ladder with a hedge at p95, and a spoken "cannot reason right now" within 8 s if no model answers.
- **New abilities.** Compare, what stands out (each finding shows its method, its n and a caveat), complete this data (filled cells show their source, blanks stay blank and say why), pin to the Overview, save a workspace. The last two need a spoken yes or a tap.
- **Every number from code.** The model writes `{n:key}` placeholders, and a gate runs on every spoken chunk.
- **Privacy in code.** A request for a citizen's words, phone or Aadhaar is refused by rules with no model involved, and tool results are redacted.
- **It never sends, approves or deletes.** The tray's button is the Collector's own tap. Buttons with those effects also carry `data-jarvis-never`, so they cannot be pressed by number or by name.
- **The HUD.** Core, ribbon, work timeline with real times, result panels, map reticle, system strip, power-on, Tamil type, reduced motion. The console stays underneath and usable.
- **Voice.** Edge natural voices first, then Gemini TTS on an AudioContext PCM path, then words on screen.

## What was cut, and what changed from the brief

| Item | What happened | Why |
|---|---|---|
| PCM 2 s self-test | Cut | Phase 1's stated cut line |
| Speculative prefetch | Cut | Phase 4's stated cut line ("prefetch last") |
| Ollama rung | Dropped | The probe got no reply in 60 s. Phase 3's cut line |
| Bedrock rung | Off | The probe returned `AccessDeniedException`: bearer token expired |
| FLEURS `ta_in` | Not used | The datasets API refused it. 100 SLR65 clips were used; male clips were not |
| `msw` | Not added | It cannot intercept the Next server's outbound fetches from a browser test. `page.route` is used instead |
| 240 px core with a Stage open | Stays 96 px | 240 px does not fit above an open screen. The 240 px rule holds with no screen open |
| Wake word on page load | Removed | With the mode off, nothing listens |
| Tab hidden | Reopens the mic on return and says so | The brief says mute and say so. The mic is closed while hidden, and the mode is meant to need no pressing |

Severity red on Stage screens was left for the owner to decide (UI review finding 25).

## How to run the demo in Edge

From the repository root (the folder above `chennai-grievance-portal-main/`):

```bash
start-fast.bat
```

This opens Microsoft Edge, which has the natural Tamil and Indian English voices. Chrome has no Tamil voice. The script and the failure fallbacks are in `docs/jarvis/DEMO.md`. Wired headphones avoid most echo. Do not demo within 24 hours of a heavy evaluation run: Groq's daily caps reset 24 hours after use.

The two settings most likely to need changing after a real-room try are both in `TUNING` in `src/lib/thunai/vad.ts`: `echoMarginDb` (8; raise to 12 if it stops itself) and `endOfUtteranceMs` (300; raise to 500 if sentences get cut at pauses. thunai/v3's own data recommended 500 to 800).

## Known limits

- **No speaker identification.** Anyone in the room can command it. The gate decides whether a sentence was addressed to Jarvis, not who said it. Level B and C need the name and a yes, but anyone can say those too.
- **Unnamed requests depend on the words.** The gate is a text rule set, so it will sometimes act on side talk or ignore a real command. See the ambient figures in `RESULTS.md`.
- **The rules now hand off when unsure, so Tamil nearly always takes a model turn** of about 1,900 tokens and 1.2 to 2.6 s. Understanding rose from 40 % to 73 % on the new frozen set, at 64 % more tokens a sentence.
- **Claude is paid by the token.** With `ANTHROPIC_API_KEY` in `.env`, Jarvis asks `claude-opus-5-5` first and falls back to Groq with no key or on any failure. Nothing else in the portal uses it. On the frozen set it scored 49/60 (Tamil 25/30) against Groq's 44/60 (22/30), which is probably better but not proven. A model turn takes about 3.9 s at p50 and 5.2 s at p90 against Groq's 1.2 s and 2.6 s, and the ledger caps a day at 500 requests. The key has to be in the `.env` of whichever copy runs, including any hosted deployment.
- **Quota is the real ceiling.** The three Groq keys are one organisation, so they add nothing: 8K tokens a minute, and a daily cap that one evaluation run can use up. There is also a limit on output tokens per minute that the ledger does not track, which `qwen` hit during the final run. The Gemini transcriber allowed about 28 calls in a day, so it runs only as a third racer when Whisper is unsure.
- **Tamil voice needs Edge.** Elsewhere the words stay on screen.
- **Tamil coverage on screens is partial.** Only the `cases` recipe's labels are Tamil at the source. Other recipes rely on the runtime translator, `when()` writes English months, and HUD panel titles use the screen's title as it comes.
- **The console's runtime translator shares the same Groq organisation.** Loading the Tamil console drew 429s on its minute limits during the screen runs, which competes with Jarvis's own quota. It also makes mistakes with figures: one news headline, "47-year-old Chennai man", came out in Tamil as "47-thousand". That translator is not part of this build and the number gate does not cover it, but it shows on the same screen.
- **Noise figures for Tamil transcription use synthetic babble**, and are labelled so.
- **The ledger is a local SQLite file** (`node:sqlite`, with a memory fallback). A hosted deployment with more than one process needs a different store behind the same interface.
- **Whisper's end of utterance at 300 ms** splits "Jarvis," from what follows. The name alone now engages and listens on, but this is the first thing to retest in a room.
- **A sentence still at Whisper when someone else talks for 200 ms is merged with their words.** The capture reaches back so that a sentence with a pause in it stays whole, and that means a second speaker's words go along with it.
- **Understanding: the second pass is in `eval/RESULTS.md`.** The full pipeline scored 44/60 (73.3 %) on the new frozen set, with Tamil at 22/30, up from 24/60 and 9/30 on its first run. Two things come first: re-run that sample once the cap resets, because the final run met four 429s, and try real Tamil speech, because every one of these sentences is typed text. Tanglish, at 9/15, is now the weakest language.
- **The address gate is still above its target:** 4/60 false acts against 5 %, all in Tanglish. A small model as a veto on what the rules would act on took the old set from 4/40 to 0/40 and lost no commands, but its run on the frozen set was a capacity failure. It has not been built: it sends overheard sentences to a model, so that is the owner's call.

## What an Azure key would add

A speech key (`AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`) with `TTS_PROVIDER=auto` or `azure` turns on the branch in `src/app/api/jarvis/say/route.ts`. It sends one SSML request and gets a 24 kHz WAV back in the ta-IN Pallavi or en-IN Neerja voice.

- The natural voices would work outside Edge, including Chrome and hosted machines.
- The audio would go through the PCM path, so barge-in gets the exact pause and resume measured here. Edge's own voices cannot pause, so they restart the chunk.
- The HUD gets a real voice level from the analyser, not an envelope driven by the state.

That branch has never run, because no key exists. It is marked Not verified, and is not a paid service this build added or relies on.

## Findings from the final independent review

See "Independent review" in `eval/RESULTS.md` for what was fixed and what was left.

## Tests

From `chennai-grievance-portal-main/`:

```bash
npx vitest run
```

```bash
npx tsc --noEmit --incremental false
```

```bash
npx playwright test tests/e2e/mode.spec.ts tests/e2e/bargein.spec.ts tests/e2e/hold.spec.ts tests/e2e/vad.spec.ts tests/e2e/vadfake.spec.ts tests/e2e/e2e-latency.spec.ts
```

A measuring production build for the real latency run needs `NEXT_PUBLIC_JARVIS_SPEC=1` at compile time, so a normal production build has none of the test hooks. See `playwright.config.ts` (`SPEC_PROD=1`).

Live evaluation lives in `src/lib/thunai/holdout.live.ts` and spends real quota, so check the ledger first. The set still held out is `eval/holdout2/` (`HOLDOUT_DIR=holdout2`, `HOLDOUT_SET=live60`), with hashes in `HASHES.txt`, and a run refuses it if one has changed. Do not edit it, tune to it or open its rows: only totals have been read so far. `eval/holdout/` has been read, so use it for tuning.
