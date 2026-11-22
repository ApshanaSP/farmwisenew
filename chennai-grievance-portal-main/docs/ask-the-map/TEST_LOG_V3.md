# Ask the Map v3: test log (21-22 Nov 2026, overnight)

Every run is Claude Haiku 5.5 alone, through the console's own path (`src/lib/map/askai.live.ts`, one test officer per
set), on the frozen store. The plan scorer is `evalcheck.misses`; the answer judge is `judge.live.ts`. Spend record:
`data/aws-cache/claude-budget-v3.sqlite` (a fresh US$5 for v3).

## New sets (eval/map-v3)

| Set | Size | What |
|---|---|---|
| `human.json` (human3) | 90 | typed like an officer on a phone: loose words, Tanglish, Tamil, "per person", "which X area has the most", the forecast |
| `followups.json` (followups3) | 26 conversations, 70 turns | short follow-ups that lean on the last answer, including "there", "the second one" |
| `holdout.json` (holdout3) | 40 | written after round 2, **never tuned against** |
| `followups-holdout.json` (followups3h) | 8 conversations, 20 turns | the same, never tuned against |

## Rounds

| Round | human3 | followups3 | holdout3 | followups3h | Errors | US$ |
|---|---|---|---|---|---|---|
| 1, before any v3 prompt change | 81/90 | 54/58 | — | — | 0 | 0.09 |
| 2, which-X-area, Tanglish words, brief vs list, follow-up shape, "there" | 87/90 | 67/70 | — | — | 0 | 0.10 |
| 3, previous-answer places only when pointed at, category words | 89/90 | 67/70 | **35/40** (first sight) | **19/20** (first sight) | 0 | 0.14 |
| Full regression after round 3 fixes | 88/90 | 66/70 | 38/40 | 19/20 | 0 | 0.67 (all sets) |
| Final run (round 4 fixes: along, ref repair, fewest, cell names, points_at_previous) | 86/90 | 65/70 | 37/40 | 18/20 | 0 | 0.57 (all sets) |
| After the final run: fewest moved to its own field (probe, 5 questions x 5) | — | — | — | — | 0 | 25/25 right |

The held-out sets were first run in round 3: 35/40 and 19/20 are the honest unseen scores. After that, round 4 fixed
general bugs they showed (the "which X area" rule listed too few facilities; a follow-up pointing at a place should drop
the ranking; "what kinds of complaints in X"; two Tanglish words), so later held-out scores are no longer unseen.

## What the runs found, and the fix (at the cause)

- "which school area has most problems" was counted by ward: the prompt now says any facility's area is counted near it.
- Tanglish: kitta (near), naai (dog), thanni thengi / nikkudhu (standing water, not water supply), maadu (cattle), makkal thogai (population).
- "tnagar traffic problems", "all complaints in ward 120 including closed" became area summaries: a brief is only for a plain "what is happening"; a list is a plan.
- Follow-ups kept the wrong shape ("which is slowest" after a count by department; "police station?" after nearest hospital): the prompt says keep the shape and grouping.
- "only garbage" after a ranking was pinned to the previous answer's top place: the AI now says in its reply whether the follow-up points at one of the last answer's places (`points_at_previous`); if not, a step it pinned to one is removed. Decided by the AI, not by a word rule.
- "include closed" lost Velachery: the AI wrote a made-up ref (osm:Velachery for loc:Velachery). A ref the map does not know is repaired from the conversation's own place of the same name.
- "petrol bunks along OMR" showed an internal error: "along" now works for facilities, not only cases.
- "least complaints zone" named the most: count_by has a fewest-first order, and every area counts (an area with none too).
- "500 m cell 15682,3381": cells are named by their neighbourhood ("500 m around Perambur").
- "last month" read as the previous calendar month: correct; the scorer accepts a calendar month for 30 days (and a calendar week for 7).
- A forecast answer was scored as "not the live city": the scorer now knows the forecast answer.

## The v2 sets in the full regression (v2 final, then v3)

dev 45 → 44 · held out 15 → 15 · big 163 → 158 · fresh 77 → 72 · human 148 → 148 · follow-ups 31 → 30 · typos 58 → 55 and 22 → 20.
The drops were checked: the questions that lost their main step ("garbage hotspots", "thefts along Anna Salai",
"garbage this month vs last month") pass when asked again with the same code (a probe run); they are Haiku choosing a
different "show" step between runs, the variation v2 also saw. Two were real and fixed in round 4 ("open complaints near
X" became a summary; "thanni nikkudhu" read as water supply).

## The answer judge

Claude Haiku reads the question with the answer's headline and sentence and says whether it answers it (yes / partly /
no) and how clear it is (1-5). Round 3 sample (80, headline only): 52 yes, 25 partly, 3 no, clarity 3.8. Final run (80, headline and sentence): 60 yes, 16 partly, 4 no, clarity 3.8; one "no" showed the AI choosing fewest-first for "highest", fixed after (25/25 in a probe). It found real
bugs (the internal error, the lost place, "least" answered as "most", cell numbers) that the plan scorer could not see.

## Checks

- Unit tests: `src/lib/map` and `src/components/collector`: 1,477 pass, plus `v3.test.ts` (people per ward and the rate
  checked by hand, per-person order, zone people, no-file case, the wire format both ways, unnamed places, the last
  answer's places, fewest first, places along a road against a brute-force distance).
- Golden (frozen store): 37/37.
- Typecheck clean; lint 0 errors.
- Production build OK; the v3 server is `askmap-v3-prod-3016` (`.next-prod-v3e`), v2 stays on 3015.
- Seen in the browser on the production build: the ranked picture for "which school has the most complaints near it";
  the per-person ward shading; the rain forecast in blue; the day on the map while playing; the loading picture; a
  follow-up ("what about hospitals").

## 22 Nov, "keep testing" rounds (owner: test like humans, Collector questions, follow-ups, topic changes)

New sets, each written before its first run and never tuned against:

- **fresh3** (60): phone-style questions in English, Tanglish and Tamil.
- **followups3f** (12 conversations): fresh follow-ups.
- **topics3** (12 conversations): the owner's report. After a garbage question, "show me the total incidents" or "all incidents in zone 9" stayed on garbage, and "police cases" became thefts only.
- **collector3** (60): what a Collector types while reading the console's tiles: severe, past deadline, resolved in 24 h, most serious zone, departments, news.
- **collectorf3** (12 conversations): Collector follow-ups.

At first sight: fresh3 53/60, followups3f 22/27, topics3 20/24, collector3 55/60, collectorf3 32/35.

Found and fixed, at the cause:

- **A new topic kept the old kind of problem.** The AI now says in its reply when a follow-up leaves the last answer's kind for all kinds (`every_kind`, follow-ups only). Only the carried-over kind is dropped; a kind the question names stays. When the AI says so, the kinds it named are not put back on the plan; the server's own step had been putting garbage back.
- **"Police cases"** is the police department's cases (dept POL-GCP: accidents, traffic, crime, public order), not one crime category.
- **"How many incidents" did count every kind**, but the sentence began "Mostly flooding…", so it read as flooding only. All-incident answers now say "Every kind is counted (28 kinds, 32 of them police cases)".
- **Follow-ups that add a step** ("vs last week", "where are they piling up", "compare both", "and fire station") came back as plain lists. There are worked examples in the prompt now. A nearest search that lost its starting place gets the conversation's place back. The places of earlier turns are sent, for "compare both".
- **The word tables showed the AI only 9 words per kind**, so words added later in a list (Tanglish) never reached it; it now sees 18. Tanglish: maadu, vilakku eriyala, rendavadhu (the second one), thollai (it takes the kind of the word before it: kosu thollai is mosquitoes).
- **An early wording of `every_kind` made Haiku read "accidents" as "incidents"** (accident questions fell from 23/31 to 0/4 in a probe). Reworded as follow-ups only: 2/2 again.
- **A plan that names no kind while the question has a kind's word** ("least flooded zone", "news reported accidents") gets an AI second look. The words are shown to the AI and it decides; one more call, only in that case. Probe: 20/20.
- **A distance step written backwards** (colleges near crimes) showed a raw engine message; it is turned round. **A made-up place** ("road la pallam": "la" read as a place) showed "could not be found"; the step is dropped and the rest answers.
- **Many kinds of one family** read as the family's name ("crime"), not a list of six.
- **Screen:**
  - "On the ground now" is one line that opens;
  - only an alert or a warning is drawn on the map;
  - a tile that repeats the headline's number is hidden;
  - on a phone, the map key is hidden under the sheet and labels stay on screen;
  - "fewest" answers are green.

f22's second turn ("what kind of problems are there") read two ways; it is now "what is happening at that school".

## 22 Nov, evening: the owner's round (follow-up or new question, area names, two views of a place, weekly review)

What the owner reported, and what was done at the cause:

- **"Which school has the most complaints" after a garbage answer stayed on garbage.** The planner always started a
  follow-up by editing the last plan. Now, before any question that comes after another, Claude first reads the
  conversation (the last three questions with their answers' headlines, and the places the last answer ranked first) and
  decides: a follow-up, or a new question (`turn.ts`). It writes the message as one complete question, and says which ranked
  place it points at ("the third one" is number 3). A new question is planned on its own; nothing of the old question
  carries over. A follow-up is planned as an edit, with the complete reading beside it. No word list decides this; the AI
  does. One more Haiku call on follow-ups only (about 1.6 s).
- **"Which area has the most crime" showed "Ward 102".** Every ward now carries its area's name: the OpenStreetMap suburb
  inside it, nearest its middle (a neighbourhood when it has none; the nearest name within 1.5 km when it has none inside).
  Answers, overviews, the scorecard and the map say "Anna Nagar West (Ward 102)"; the map's badges say "Anna Nagar West W102".
  A switch over the ranking counts the same answer **ward wise, zone wise or taluk wise**, one tap, no AI call.
- **Clicking a ward in a garbage answer showed only the whole overview.** Picking a place (a bar, a badge, an area) now
  opens a card with two choices: **only this answer's kind of problem there** (the garbage list and map for that ward), or
  the **full overview** (every kind and department). The overview carries two tabs, "Full overview" and "Only open garbage
  … incidents", and the topic list carries the same two tabs back. An overview now also keeps its place for follow-ups
  ("only severe ones" after an overview of ward 45 stays in ward 45).
- **The quarterly bank meeting pack is gone.**
- **The weekly review is an interactive page:** headline figures with the change on last week, a map of all 200 wards
  shaded by the figure picked (reported, change, past deadline, severe, or one kind of problem: click a kind), a ward card
  on a click, day-by-day bars for 14 days, the kinds of problem, the wards that rose most, zones (sortable; a hover lights
  them up on the map) and departments. Light and dark, prints. Every figure is counted on the server from the executor's
  own collections; a test checks that the wards, zones and kinds add up to the week's total.

Bugs found by the new tests and fixed:

- **A place found in the AI's own words.** The complete reading "within 200 m of a school" was looked up for places, and
  matched a school named "A School". Places are now looked up in the officer's words only.
- **"What about the third one" went to number 1.** The reader named the right ward but the planner took the first ranked
  place. The reader now says which number it points at, and only that place is offered to the planner. This also fixes
  "garbage complaints there" after "which zone is slowest", a known limit of the last round.
- **"hospitals?" after "which school has the most flooding near it"** became a plain list. The reader keeps the last
  question's shape (a ranking stays a ranking).
- **A cached answer** (the same plan within 60 s) came back without this question's reading.
- **After an area overview, follow-ups lost the place** (an overview had no plan to edit).

New set, written before its first run: **turns3** (25 conversations, 61 turns, each marked follow-up or new).
First run: 56/61.
