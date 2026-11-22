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
