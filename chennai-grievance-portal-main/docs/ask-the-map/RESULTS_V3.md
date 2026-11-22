# Ask the Map v3: results (22 Nov 2026)

v3 is on branch `claude/askmap-v3-e4d529`. **v2 in main (5dd50b30) is unchanged**, so the owner can compare the two and
choose. v3 runs on port 3016 (`askmap-v3-prod-3016`); v2 runs on port 3015.

## What is new, in plain words

1. **Answers you can see at a glance.** "Which school has the most complaints near it" no longer scatters hundreds of
   tiny dots. The top 10 places get big numbered badges with their name and count, number 1 pulses, and the rest fade
   to small grey dots. Ward and zone answers colour each area from light to dark red. Names that would overlap move
   to the other side or show only the number. Clicking a badge, area or bar flies the map there and shows only
   those cases.
2. **A calmer chat.** Each answer shows:
   - the answer card;
   - the top 5 as bars;
   - "Ask next";
   - one row of actions.

   Filters, the full table, every case and "how this was worked out" sit under "More detail". While it works, the
   chat shows the steps ("Reading your question", "Counting on the map") and a shimmering card.
3. **Real population data.** People per ward come from Kontur Population (2023, CC BY 4.0): 6.57 million in the 200
   wards. You can now ask "which ward has the most garbage complaints *for its population*" and get cases per 10,000
   people. Areas with too few cases for a fair rate are listed after the rest.
4. **The rain to come.** "Will it rain tomorrow, where should we clear drains" shows the forecast millimetres over
   each zone for the next 24 hours (Open-Meteo, free), in blue, beside that zone's open flooding and drain cases, and
   names where to clear drains first.
5. **Follow-ups that point.** After "which ward has the most garbage complaints", "what is happening there" or "show
   me the second one" goes to that ward. "What about hospitals" or "only garbage" keep the shape of the last answer.
6. **More answers:**
   - "least complaints zone" (fewest first, every area counted);
   - "petrol bunks along OMR" (places along a road);
   - 500 m areas named by their neighbourhood.
7. **Day by day you can see.** Pressing **▶ Play** puts a large panel on the map: the date ("Tuesday 17 November"),
   the cases so far, a strip of the days with today lit, and a progress line, at 1×, 2× or ½× speed.
8. **Map loading.** A radar sweep over a drifting street grid ("Drawing Chennai's 200 wards") replaces "Loading the
   map…", and the satellite tiles fade in.

## Scores (Claude Haiku 5.5 alone, the console's own path, final run)

| Set | v2 final | v3 final |
|---|---|---|
| Dev (45) | 45 | **45** |
| Held out (15) | 15 | 14 |
| Big (170) | 163 | 160 |
| Fresh (80, never tuned) | 77 | 76 |
| Human-style (155) | 148 | **150** |
| Follow-ups (32 turns) | 31 | 30 |
| Typos, same as correct form (72 / 24) | 58 / 22 | **59** / 21 |
| **New:** human-style v3 (90) | — | 86 (89 in round 3) |
| **New:** v3 follow-ups incl. "there" (70 turns) | — | 65 |
| **New:** v3 held out, never tuned (40) | — | 37 (35 at first sight) |
| **New:** v3 held-out follow-ups (20 turns) | — | 18 (19 at first sight) |
| Server errors | 0 | **0** |

Claude reads every question slightly differently from run to run, so a set moves by a few questions between runs.
On the v2 sets v3 is level with v2 (dev, human and typos up; big, fresh and held-out within a few). Median 3.6 s a
question in the final run (3.0 s in quieter runs).

**Answer judge** (Claude reads the question and the answer's words and asks whether it answers it): 60 of 80 yes,
16 partly, 4 no, clarity 3.8 out of 5. It found real bugs the plan scorer could not, all fixed: an internal error
shown to the user; a follow-up losing its place; "least" answered as "most"; cell numbers instead of names. A last
one (the AI picking fewest-first for "highest") was fixed after the final run and checked 25 of 25 in a probe.

**Spend:** US$1.71 of the US$5 for v3 (the record `data/aws-cache/claude-budget-v3.sqlite`).

## Known limits

- **Pointing follow-ups.** "There" works when the last answer ranked areas or places. After a speed ranking or a
  count near schools it sometimes stays on the ranking instead of going to the place (3 of 6 such turns in the final
  run).
- **Tanglish words.** A few are still missed now and then (maadu, vilakku eriyala).
- **Test data.** The complaint data is mostly generated test data, so per-person rates and counts show the method,
  not real Chennai.
- **Blocked downloads.** OpenCity's flood maps and the official school list (with enrolment) would make the answers
  richer, but its site blocks automated downloads. Download them by hand and v3 can use them (see RESEARCH_V3.md).


## Update: the "keep testing" rounds (22 Nov, day)

The owner asked for more human-style testing, Collector-style questions, follow-ups, and two fixes: a new topic kept the
old kind of problem, and "incidents" seemed to count only flooding. Both are fixed (see TEST_LOG_V3.md).

Final runs (Claude Haiku 5.5 alone, 0 server errors):

| Set | v2 final | v3 now |
|---|---|---|
| Dev (45) | 45 | **45** |
| Held out (15) | 15 | 14 |
| Big (170) | 163 | **166** |
| Fresh (80) | 77 | 76 |
| Human-style (155) | 148 | **148** |
| Follow-ups (32 turns) | 31 | **31** |
| v3 human-style (90) | — | 87 |
| v3 held out (40, never tuned) | — | 39 |
| **v3 fresh (60, written this round)** | — | **57** (53 at first sight) |
| **Collector questions (60, written this round)** | — | **56** (55 at first sight) |
| v3 follow-ups (70 turns) | — | 68 |
| v3 held-out follow-ups (20) | — | 18 |
| v3 fresh follow-ups (27) | — | 23 (22 at first sight) |
| **Topic changes (24 turns, the owner's report)** | — | **23** (20 at first sight) |
| **Collector follow-ups (35 turns)** | — | **33** (32 at first sight) |

Answer judge (80 answers from the v3 sets): 59 yes, 18 partly, 3 no, clarity 3.9 of 5. Most of the "partly" are the live
city answers (traffic now, power cut now) that the console shares with Jarvis, and one-word follow-ups the judge found
vague.

**Spend:** US$4.47 of the US$5.

Still not right:
- "There" after a speed ranking (which ward is slowest, then "open cases there") sometimes stays on the ranking.
- A landmark that is not in the place list ("Velachery lake") can be answered for the whole district.
- "Live traffic now" and "power cut now" use the shared city feed (the same as Jarvis): they say what the feeds hold, and the judge would like a plainer yes or no.

## Update: the owner's round (22 Nov, evening)

- **Follow-up or new question, decided by AI.** Before a question that comes after others, Claude Sonnet 5.5 reads the
  conversation and decides: a follow-up (it gets a complete reading, and the ranked place it points at), or a new
  question (nothing of the old one carries over: "which school has the most complaints near it" after a garbage ranking
  is about every kind, near every school).
- **Area names.** Wards are said as "Anna Nagar West (Ward 102)"; one tap switches the same ranking ward, zone or taluk wise.
- **A place, two ways.** Picking a ward in a garbage answer offers "Only garbage complaints" (that ward's list and map) or
  "Full overview" (every kind and department); the two are tabs of each other.
- **The bank meeting pack is gone; the weekly review is an interactive page** (a ward map shaded by any figure or kind,
  day by day, kinds, zones, departments, light and dark, prints).

| Set (follow-ups) | before this round | now |
|---|---|---|
| Topic changes (24) | 23 | **24** |
| Held-out follow-ups (20) | 18 | **20** |
| Fresh follow-ups (27) | 23 | **26** |
| Follow-ups (70) | 68 | 68 |
| Collector follow-ups (35) | 33 | 33 |
| **New:** follow-up or new question (61) | — | 58 (Haiku reader); the 7 turns it missed pass on Sonnet |

Spend: US$5.03 of the US$7 the owner set.
