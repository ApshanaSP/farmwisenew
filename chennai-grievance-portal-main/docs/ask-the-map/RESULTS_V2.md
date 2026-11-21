# Ask the Map v2: results

21 November 2026, branch `claude/askmap-v2-e4d529` (built on `claude/askmap-collector-final-333e26`; not in `main`; pushing or merging needs the owner's yes). Research: RESEARCH_V2.md. Every check: TEST_LOG_V2.md.

## What is new

- **It reads loose typing like a person.** "hospitls near adayar", "garbge in velacheri", "tasmak", "tnagar", "anna nager", "thefts nr ATMs", "complaints by zon", "அடையார் அருகே" are read as meant. The answer says what it read ("Read 'adayar' as Adyar"). When two readings are equally close it asks "Did you mean …?" with a button for each, never guesses. Corrections go only toward the map's own words and place names; English, Tanglish and street words are left alone. Questions the rules still cannot read go to the AI with the corrected words.
- **A full-screen workspace.** On a computer the chat is docked full height on the left and the map fills the rest. Drag the line between them (or use the arrow keys) to resize; "Chat only" and "Map only" fold a side away; the split is remembered. The panel can still be dragged to float over the map. On a phone the map is on top and the chat below. Answers are framed in the map's own pane.
- **Play the period.** Under an answer, a bar for each day (by the day each case was first reported), Play/Pause, a slider, and "up to the day"; the map shows only those cases.
- **Ward scorecard.** "ward 178 scorecard" (or the button on a ward's brief, or in Tamil): open issues, past deadline, severe, from citizens, the ward's rank among all 200 wards, the last 30 days against the 30 before, top issues, departments, nearby services, and a printable page.
- **Copy link.** A link that opens the console on the same question. Whoever opens it gets today's numbers and only what their role allows (it carries the question, not the data).
- **Print brief.** One printable page for any answer: the question, the headline, the numbers, how it was worked out, a map of the places, the top 25 rows.

## Numbers

| | Before v2 | v2 |
|---|---|---|
| Typo questions read as their correct form, no AI (72, `eval/map-v2/typos.json`) | 35 | **72** |
| Held-out typo questions, never tuned against (24) | 13 | **21** on the first run, 23 after three general fixes |
| Live typo questions on the running console (12): same plan and count as the correct form | — | **12 of 12**; 3 counts checked against an independent counter (11, 6, 23: all equal) |
| Golden, frozen store, no AI | 30 of 30 | **35 of 35** (30 old + typos + scorecard, timeline and brief against raw rows) |
| Unit tests (map, console, AI, city, assistant) | — | **2,479 passed** |
| Typecheck, lint, production build | clean | clean, no lint errors, build passes |

**AI plan step on the 45 dev questions** (`eval/map-final/dev.json`, `mapai.live.ts`, now with the speller first, as the console runs it):

Measured on 21 Nov 2026 (about 12:20–13:10 IST) with Claude Haiku 5.5 (`AI_MAP_PROVIDER=anthropic`, low effort, no thinking, structured outputs, the cached prompt), after the owner supplied a working key.

| Code and provider | Correct | Time | US$ |
|---|---|---|---|
| Old code (`de01e264`), Groq (20 Nov) | 6 of 45 | — | 0 |
| Final code, Groq (20 Nov; 16 lost to Groq's per-minute limit) | 21 of 45 | median 2.9 s | 0 |
| **v2 code, Claude Haiku 5.5** | **33 of 45** (all 45 answered by Claude) | median 3.2 s, p90 3.9 s | 0.0227 (US$0.0005 a question) |
| **v2 code + the question's own words on top, Claude Haiku 5.5** | **40 of 45** | median 3.2 s, p90 3.9 s | 0.0215 |

The second Claude run adds one change, made after reading the first run's 12 misses: the server's reading of the question wins over the model on two things, as it already did for time words (`route.ts fitModelPlan`): the language (the model called two Tamil-script questions "Tanglish"), and an exact category the rules' word list reads ("sewage", "drinking water", "road accidents", "flooding") where the model gave none, a code that does not exist (`DRINKING_WATER`) or only the broader family. That fixed 7. It was measured on the same 45 questions it was read from, so treat 40 as tuned; the typo questions below are a second check. Still missed: "dengue cases bunching up" and "garbage near the places on my list" (the model refused them as not map questions), the Tanglish rank question (read as a count by ward), "children's play areas" (no parks layer taken), and "mosquito complaints around public toilets" (flooding chosen in the second run; right in the first: the model varies a little between runs).

**The typo questions through Claude** (`src/lib/map/typoai.live.ts`: each typed question planned by Claude as typed and after the speller, compared with the rules' plan for the correct form; 2 pairs that are area briefs skipped):

| | As typed | After the speller | Rules + speller, no AI |
|---|---|---|---|
| 70 tuned: layers, category, places and kind of answer all right | 44 | **52** | 70 (72 of 72 with the briefs) |
| 70 tuned: the whole plan the same | 20 | 18 | 70 |
| 24 held out: layers, category, places and kind all right | 13 | 14 | 23 |

So Claude alone misreads many slips, the speller helps it (44 to 52), and the rules with the speller read them all; in the console these questions never reach the AI. Most of Claude's remaining differences are another kind of the same place (Velachery the locality, not the taluk; Anna Nagar the neighbourhood, not Zone 8). The whole-plan match is low because the model chooses details differently (a 2 km radius, "nearest" instead of "within", all statuses), not because it misread the words. Cost of both typo runs: US$0.07 each.

US$ spent on Claude in this work: **about US$2.30** (the spend record went from US$1.949 to US$4.252 of the US$5 ceiling), most of it on the AI-only test runs (about US$0.0006 a question).

## Claude reads first (21 Nov 2026, afternoon)

At the owner's request, Claude Haiku 5.5 now reads every typed question; the word rules are only a hint and a fallback. The speller's reading, the words as typed and the rules' plan go to Claude as a suggestion it may overrule (`ask.ts`, `ai.ts`). The rules answer only when Claude cannot (no key, busy, a plan the server refuses), and their safety checks stay in front: no Ward 250, no forecast, out-of-scope questions, the console's commands. The server still runs every plan and counts; the number gate is unchanged. Only Claude was used for these runs (the owner's instruction); Groq's 6/45 and 21/45 are history.

The prompt now tells Claude how officers type (slips, Tamil names spelt many ways, shorthand, Tanglish with a short glossary), and every reading of a place name is offered (Anna Nagar the zone and the neighbourhood). After Claude, the question's own words still settle a few things (`route.ts fitModelPlan`, `keepAreas`): the language, the exact category a word names, "in X" as the area and "near X" as the point, the direction of a league table, a count by area or clusters when asked, a layer taken and never used, a place left out.

**Scored through the console's own path** (`askai.live.ts`: `askMap` end to end, live, frozen store; a busy provider is waited for, never scored as a miss):

| Question set | First run | Final |
|---|---|---|
| Dev set (`eval/map-final/dev.json`, 45) | 45/45 (AI step alone this morning: 33) | **45/45** |
| Held out (`ai-holdout.json`, 15, never tuned) | 15/15 | **15/15** |
| Big set (`big.json`, 170) | 162/170 | **169/170** (b160 lists the nearest shops, not all within 1 km) |
| Fresh set (`fresh.json`, 80, written after the big-set fixes, never tuned) | **77/80** | 80/80 |
| Follow-up conversations (`followups.json`, 32 turns) | 32/32 | **32/32** |
| Typo pairs (72) | 61/72 | **72/72** |
| Typo pairs held out (24) | 20/24 | **22/24** (Ambattur read as the taluk, not the zone; an extra health filter) |
| Facility counts against an independent count of the raw files | — | **25 of 25 the same** |

Earlier, for history: Groq on the old code 6/45, on the final version 21/45 (20 Nov).

Time: median about 2.8 s a question, p90 about 3.7 s (the rules alone answered in about 0.1 s). Cost: about US$0.0005 a question. Spend record: US$1.949 carried over, US$2.98 now, of the US$5 ceiling. The shared record in the Jarvis v10 worktree was deleted during the day; a new one is in this worktree's gitignored `data/aws-cache/claude-budget-v2.sqlite`, started at the old total.

Note for the owner: each officer has a daily AI allowance (`ASSISTANT_DAILY_TOKENS`, default 600,000 uncached tokens, about 300 questions). With Claude reading every question, a very heavy user can reach it; the rules then answer, as before.

## AI only (21 Nov 2026, evening: the owner's instruction)

The owner asked for Ask the Map to be "AI powered, no rules". Since this change Claude Haiku 5.5 reads every typed question **as typed** and decides what kind of answer it needs: a map answer (a plan the server runs), an area brief, a ward scorecard, the live city now (traffic, rain, flood streets, power, trains), or "not a map question". The word rules no longer decide anything; they answer only when Claude cannot be reached (no key, the service busy, a plan the server refuses twice), so the console never goes blank. `AI_MAP_MODE=hybrid` or `rules` in `.env` brings the earlier behaviour back.

What Claude is given: the question as typed, the place references the question names (looked up in the gazetteer, typed and as spelt right, so it can cite them), the world's categories, families, layers and zones, and the words officers use for each (English, Tamil, Tanglish) as knowledge. Before writing the plan it writes what the question names (kinds of problem, facilities, places, zone, ward); the server makes the plan use what Claude itself named, and checks every code and place reference against the world's own, asking once more if one is wrong. The server still runs every plan and counts every number.

New answers built for the owner's questions:
- **which school (hospital, market, bus stand) has the most complaints near it**: each case counted at the place it is near;
- **which area needs my attention**: open cases past their deadline, by ward (or zone);
- **which area (department, kind of case) is resolving fast or slow**: the median days from first report to closing, from the store's closing time, over the last 90 days;
- **what are people complaining about most / which department holds most**: counts by kind and by department;
- **what is happening near X**: answers now say what the cases are mostly about (for example "Mostly garbage (20), flooding (12), streetlights (8)").

**Scored through the console's own path, Claude only** (`askai.live.ts`; one test officer per set):

| Question set | First AI-only run | Final |
|---|---|---|
| Dev (45) | 43 | **45** |
| Held out (15, never tuned) | 13 | **15** |
| Big (170) | 158 | **163** |
| Fresh (80, never tuned) | 75 | **77** |
| Human-style (155: one word, "what is happening near …", attention, speed, Tanglish, Tamil) | 103 (first ever run) | **148** |
| Follow-up conversations (32 turns) | 25 | **31** |
| Typo questions read as Claude reads their correct form (72 + 24) | — | **58 / 72, 22 / 24** |
| Server errors | 1 | **0** |

Time: median 3.0 s a question, p90 3.9 s. Cost: US$0.40 for the final run of 613 questions (about US$0.0006 a question). Spend record: US$4.25 of the US$5 ceiling.

**Speed of the screen.** The slowness the owner saw was the development server, which compiles each page on first use (20–30 s). In a production build (`next build`, `next start`) the console loads in about 0.6 s with the map tiles, Ask the Map's workspace opens in 0.12 s, and an answer takes about 3–4 s (Claude's reading). A speed answer draws only its first 15 areas, so the map is not buried.

Known limits of AI only:
- Claude sometimes reads one word differently in two runs (a zone or its taluk, flooding or waterlogging), so a typo and its correct form can get slightly different plans (58 of 72 the same).
- Every answer now waits for Claude (about 3 s, not 0.1 s); without the AI the rules answer as before.
- Each officer has a daily AI allowance (`ASSISTANT_DAILY_TOKENS`, about 300 questions).

## Known limits

- The speller corrects toward the words and places the map knows. A place missing from the place list cannot be reached by a misspelling of it. Two names in the list spelt alike ("Ambattur", "Ambathur") make it ask instead of answer.
- Tamil script: the common letter mix-ups and doubled consonants are read; other Tamil misspellings are left as typed (the AI may still read them).
- "Play the period" uses the day each case was first reported; a case is shown on that day only (as in Kepler.gl). Windows longer than 120 days have no bar.
- The scorecard ranks wards by open issues only (1 = the most). Ward boundaries are DataMeet's, not GCC's (unchanged).
- A shared link carries the typed question; an answer changed by chips is printed from its plan but cannot be shared as a link.
- Leaflet stays (RESEARCH_V2.md section 4). "Draw an area and ask" with free shapes was weighed and not built in this run (the circle tool remains).
- Claude reads every question first: answers take about 3 s, not 0.1 s; without the AI (no key, busy, the daily allowance used) the rules answer as before. Earlier note: Claude Haiku 5.5 read 40 of the 45 dev questions as the AI step alone; the 40 is after a fix read from the same questions. It refuses a few loose questions as "not a map question", and alone it misreads many typos (the speller and the rules cover those). Groq's free allowance runs out under the console's own background steps.

## Owner decisions

1. AI only is the default (the owner's choice): `AI_MAP_MODE=hybrid` brings back the rules' hint, `rules` the rules alone (about 0.1 s an answer instead of about 3 s) and `AI_MAP_PROVIDER` on Claude Haiku 5.5: 45/45 dev, 80/80 fresh, about US$0.0005 a question.
5. Raise `ASSISTANT_DAILY_TOKENS` if officers will ask more than about 300 map questions a day each.
2. Ask TNeGA (TNGIS) for the departments' layers (ration shops, TASMAC outlets, PHCs) to replace OpenStreetMap's partial ones.
3. Merge this branch (and the final version under it) to `main`, or not.
4. Whether the shared link should also carry chip-changed answers (it would put a plan in the address).
