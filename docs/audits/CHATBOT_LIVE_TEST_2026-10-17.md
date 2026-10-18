# Ask District IQ: live test and fixes (17 Oct 2026)

Branch `improve/final-pass`, on top of `8d671b6`. Each answer was read by hand against the data.

## How it was tested
- **Without the AI model**: 64 new Collector questions on the frozen data (`explore.golden.ts`). This is the path every question takes when Groq and Gemini are both out.
- **With the AI models**: a new live harness runs the whole pipeline on the frozen data with the real Groq and Gemini keys.
  - The harness paces questions to stay inside the free tiers. Meaning search is off in it, so searches use keywords.
  - Command: `set LIVE_FILE=questions.json&& npx vitest run --config vitest.live.config.ts`. It writes every answer, with its route, models and checks, to `LIVE_OUT`.
  - Four rounds: 69, 51, 21 and 7 questions.
  - The questions covered follow-ups, Tamil, Tanglish, typos, comparisons, explanations, news, weather, prices, contacts, safety and refusals.
- The free tiers were the bottleneck. In round 2, Groq returned 429s and Gemini returned "503 high demand" for about half the questions, so those were answered by the rules. That tested the fallback path too.

## What was wrong, and what changed
| Area | Before | Now |
|---|---|---|
| Emergencies | "any emergencies right now?" → "no emergencies" (a keyword search) | The most serious open incidents |
| Wrong place or measure | "Royapuram … 104 open" (104 was Anna Nagar's); "199 open complaints" (199 was open incidents) | The verifier checks each figure's place and measure, and asks the model again |
| Invented fact ids | `{{driver_places.0.n}}` threw the draft away for a template | Mapped to the real fact (`place1.now`); the prompt names the ids |
| Counts in one place | "garbage complaints in Kodambakkam, last 10 days" → planner failed → district-wide figures for 30 days | Exact count from the store (16) |
| Follow-ups | "which one is most serious" lost the zone, widened to a month and named an incident not on the list; bare "why?" → "I didn't understand"; "adhu en increase aachu" lost the week; "only top 3" → not understood; "what should I do" after one incident → district-wide | Each one reads the previous answer |
| Rankings | "which ward has the most garbage complaints" → 8 newest incidents; "most overdue department" → "not recorded"; "top 3 departments" → 3 incidents | Ward, zone, taluk and department rankings, the backlog card |
| New: resolution time | "average resolution time for SWD" opened an uploaded desilting file | `resolution_times` tool: average days to resolve, share on time, by department |
| Data Studio hijacks | Department names, prices ("onion is not present in this dataset"), dengue and hospital thresholds were answered from uploaded files | The console's own data; uploads still answer "my data" and breakdowns only they hold |
| Topics | "fire accidents" → road accidents; mosquito → all incidents; "murders this month" → 188 (every violent crime) | Fires, disease, and 41 murders by title words or a recorded death |
| Periods and ages | "open for more than 7 days" read as the last 7 days; "இன்றைய" (today's), "since yesterday" and "indha week" ignored | Age filter (`minOpenDays`); the periods are read correctly |
| Places | Tambaram (outside the district) → "no incidents in Tambaram taluk"; OMR ignored; "zone 9 vs 10 vs 13" → one ranking | Said plainly; main roads by any of their names; three-way comparison |
| Weather | "will it rain tomorrow" → "no incidents match" | IMD's warning in force and the days ahead, with no forecast of our own |
| Language without AI | Tamil questions got English list templates; "Adyar zone" inside Tamil sentences | Tamil and Tanglish wording |
| Wording | "up from 32" when equal; "No, it is in progress" for "what is the status"; due dates as raw timestamps; duplicate notes and caveats | Fixed |
| Comparisons | "open complaints in Anna Nagar compared to Teynampet" → two zone summaries with muddled figures; "which zone improved the most" → "not recorded", then a rise called an improvement | Two places side by side on the measure asked (112 against 89 open complaints); Ambattur 320 → 317 |
| Incident stories | "Porur bund breach" → "no recorded report" (Tamil headline; an empty meaning search stopped the keyword search) | Keyword ranking over headlines and places; the breach is found and told |
| Server | The `cmwssb-reservoirs` build step failed on the 17 Oct data (alerts table without `category_code`) | Fixed; the step applies cleanly |

## Results
- Unit tests: **633 passed**, 1 skipped (baseline 547). New file: `src/lib/assistant/__tests__/routing-oct17.test.ts`.
- Golden set: **75/75**.
- `tsc --noEmit`: clean.
- Live rounds: no crashes in 148 questions. The last round, on the fixes, answered all 7 correctly.

## Still open
- **Free-tier limits.** Groq's 8k tokens per minute and Gemini's demand spikes push many questions to the rules. A paid key, or a smaller router prompt for qwen ("Request too large"), would help most.
- **Department figures include news items.** News-only items are counted as department incidents; for example, "Metrowater to hold open house meetings" is listed as an open Metrowater incident.
- **Tanglish summaries without the AI.** When the model is out, some summary templates still answer Tanglish questions in English.
- **Not tested in the app.** The chat was not tested through the app: no test login works locally, because the officer passwords no longer match the AWS store.
