# Golden diff explained: lane a (Jarvis understanding), baseline-abef9da to lane-a

Both recordings: pinned snapshot, frozen clock 2026-11-06 12:00 IST, no model key, 3272 requests. Diff: docs/qa/pass4/golden/diffs/baseline-abef9da__lane-a.md. Result: 7 changed, 1 added, 1 removed; every other request is byte for byte the same (no route outside the Jarvis round and agent routes changed; no status code changed). The build id differs because the code was rebuilt. Each change below was checked against the stored bodies (`kind`, `note`, `lane`, `say`).

The first golden run (before the fixes in the last commit of lane a) showed two more changes that were wrong, and they were fixed, not explained: "List the top five departments by pending cases" had become "I have no data on Five Departments" (a number word in front of an agency word was taken for a place name: RC-01; number and rank words are now ordinary words), and a Tamil sentence about the electricity department had become "no data on Minsarat Department" (same cause; the Tamil word for electricity is now a term). A third, "Velachery hospitals" (the Tamil sentence), only appeared through them. Both now answer as at baseline.

## RC-01 (outside place, reply language)

| Request | Before | After | Why |
|---|---|---|---|
| "Thanni complaints yen increase aachu?" (agent route and round route, 2 requests) | result.lang en (and the status line "Thinking") | result.lang ta (status line in Tamil) | Tanglish sentence. detectLang read one marker word before; it now counts Tanglish marks (yen, aachu, thanni) against English function words, so the reply language is Tamil, as the Tanglish rows of the grader expect. Correct. |

## RC-05 (topic, status, filters)

| Request | Before | After | Why |
|---|---|---|---|
| Tamil: "today, how many complaints are pending in the Adyar zone?" (ac13...) | stage slots status null | status "open" (and its next-step slots) | statusIn reads the Tamil word for pending as still-open; the list slot now carries the filter the sentence asked for. Same answer rows, now filtered to open ones. Correct. A second request with the same text appears as added and removed: its body carries the earlier turn's state, which changed with this answer. |
| Tanglish: "Inniku Adyar la evlo complaints pending iruku?" | 105 cases this week | 87 cases this week | "pending" is the open status; before, the lane dropped it and counted every case of the zone (105 all, 87 open). The new number is the open count. Correct (this is the RC-05 finding "a read filter is dropped"). |
| Tanglish: "Chennai lakes la water level enna?" | two steps (a view filter for water supply and a page) | one step (the environment page); screen: Reservoir storage readings | The bare word "water" no longer beats "lakes" (the water-supply category). The answer is the lake readings, as the English question gets. Correct. |
| Tamil: "status of the storm-water drain works?" (7ee5...) | quick lane: a rain-gauge screen ("4 readings, most: Madhavaram 14 mm") | no screen (no model here: "I can't think"); with a model the planner answers | Two causes. The Tamil word for rain matched inside the Tamil word for storm water (rain water), and the fast lane then showed rain gauges for a question about drain works: a confident answer about the wrong thing. Now "drain" (Tamil too) is a topic, and the fast lane has no screen for drain works, so it hands the sentence on. A safe answer instead of a wrong one. |
| Tanglish: "Drain work status Zone 13 la enna nilamai?" | resolve lane: today's brief for Adyar (6 points), the drain topic dropped | no screen (no model here); with a model the planner answers | "drain" was an unknown word, so the sentence was taken for a zone brief and the topic was dropped. Now it is a topic, and a zone with a topic beside it is that topic's question, which the fast lane cannot build. Safe instead of wrong. |

## Not changed

No request of the Ask District IQ, officer, citizen, map or export routes changed; no figure outside the Jarvis round changed. RC-02, RC-03, RC-04, RC-06 and RC-07 changed no recorded request: their sentences are in the grader's open set and the audit tests, not in this recording.

## Second pass (review and skeptic fixes)

Recorded again as `lane-a2` (same 3272 requests, same pinned snapshot, frozen clock, no model key; a fresh production build of the fixed code). Diff `lane-a` to `lane-a2`: 0 changed, 0 added, 0 removed (only the build id around the requests differs). The fixes of the second pass (plain English words and localities before an agency word, overdue and resolved status, the Tamil word for unresolved) change no recorded request; their sentences are in the unit tests, tests/qa/pass4/a-skeptic.test.ts and the audit tests. Diff: docs/qa/pass4/golden/diffs/lane-a__lane-a2.md.
