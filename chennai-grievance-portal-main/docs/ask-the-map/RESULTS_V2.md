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

US$ spent on Claude in this work: **US$0.203** (the shared ledger went from US$1.746 to US$1.949 of the US$5 ceiling): the two dev-set runs, the two typo-set runs and three one-call key checks. Groq tries on the night (no answers): see TEST_LOG_V2.md section 5.

## Known limits

- The speller corrects toward the words and places the map knows. A place missing from the place list cannot be reached by a misspelling of it. Two names in the list spelt alike ("Ambattur", "Ambathur") make it ask instead of answer.
- Tamil script: the common letter mix-ups and doubled consonants are read; other Tamil misspellings are left as typed (the AI may still read them).
- "Play the period" uses the day each case was first reported; a case is shown on that day only (as in Kepler.gl). Windows longer than 120 days have no bar.
- The scorecard ranks wards by open issues only (1 = the most). Ward boundaries are DataMeet's, not GCC's (unchanged).
- A shared link carries the typed question; an answer changed by chips is printed from its plan but cannot be shared as a link.
- Leaflet stays (RESEARCH_V2.md section 4). "Draw an area and ask" with free shapes was weighed and not built in this run (the circle tool remains).
- Claude Haiku 5.5 reads 40 of the 45 dev questions; the 40 is after a fix read from the same questions. It refuses a few loose questions as "not a map question", and alone it misreads many typos (the speller and the rules cover those). Groq's free allowance runs out under the console's own background steps.

## Owner decisions

1. Keep `AI_MAP_PROVIDER` on its default (Claude Haiku 5.5 first): 40 of 45 against Groq's 21, about US$0.0005 a question.
2. Ask TNeGA (TNGIS) for the departments' layers (ration shops, TASMAC outlets, PHCs) to replace OpenStreetMap's partial ones.
3. Merge this branch (and the final version under it) to `main`, or not.
4. Whether the shared link should also carry chip-changed answers (it would put a plan in the address).
