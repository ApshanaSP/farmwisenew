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

**Not measured in this run.** Three tries with Groq (the only provider with a working key):
- full set, 15 s apart, dev server running: Groq answered 1 call, then every model was "busy or rate-limited" and the gateway rested Groq for the rest of the run (44 of 45 got no plan in about 11 ms);
- full set with the console's background AI off (`AI_PROVIDER=none`): no Groq call was made at all (stopped after 20);
- 10 questions, dev server stopped: the frozen store's own background steps (studio brief and profiler) used Groq's and Gemini's free allowance while loading, and the run timed out with no answers.
Groq's key itself works (a direct call returned 200 at 01:04 IST). The earlier numbers stand as the last measured: old code 6/45, final 21/45 (Groq, 20 Nov). The speller does not change what the AI is given except that typos are corrected first, and every question in the typo sets is now read by the rules with no AI.

US$ spent on Claude in this work: **0**. The `ANTHROPIC_API_KEY` in this worktree's `.env` is refused (401); the owner was asked for a working key at the start and none arrived. The spend ceiling (`JARVIS_CLAUDE_BUDGET_FILE`, US$5) was pointed at the shared record as asked.

## Known limits

- The speller corrects toward the words and places the map knows. A place missing from the place list cannot be reached by a misspelling of it. Two names in the list spelt alike ("Ambattur", "Ambathur") make it ask instead of answer.
- Tamil script: the common letter mix-ups and doubled consonants are read; other Tamil misspellings are left as typed (the AI may still read them).
- "Play the period" uses the day each case was first reported; a case is shown on that day only (as in Kepler.gl). Windows longer than 120 days have no bar.
- The scorecard ranks wards by open issues only (1 = the most). Ward boundaries are DataMeet's, not GCC's (unchanged).
- A shared link carries the typed question; an answer changed by chips is printed from its plan but cannot be shared as a link.
- Leaflet stays (RESEARCH_V2.md section 4). "Draw an area and ask" with free shapes was weighed and not built in this run (the circle tool remains).
- The AI eval could not be run tonight: no Claude key, and Groq's free allowance was used up by the console's own background steps. Run it with a Claude key, or with Groq on a quiet machine.

## Owner decisions

1. Paste a working `ANTHROPIC_API_KEY` into `E:\farm\.claude\worktrees\askmap-v2-e4d529\chennai-grievance-portal-main\.env`, then run `set AI_MAP_PROVIDER=anthropic&& npx vitest run --config vitest.live.config.ts src/lib/map/mapai.live.ts`.
2. Ask TNeGA (TNGIS) for the departments' layers (ration shops, TASMAC outlets, PHCs) to replace OpenStreetMap's partial ones.
3. Merge this branch (and the final version under it) to `main`, or not.
4. Whether the shared link should also carry chip-changed answers (it would put a plan in the address).
