# Lane b review (first round)

Recovered from the agent's result. The reviewer (agent ac8097d4a1639160a, branch claude/p4-lane-b) could not save this file: a hook blocked writes into the lane b worktree from this session, and its Bash attempt was denied by the auto-mode classifier. It did not work around either. Its result text is saved here as it was given (lightly laid out). Status it reported: partial. At that time the branch had one commit, ef189f1, for RC-08 only; the later commits (be37097 skeptic review, 06c8efe RC-08b) came after this round.

## Verdict on RC-08

The mechanism is fixed, not one sentence. The author found a second cause the root-cause note missed: severity order was sent with the default direction, so "most serious first" put Low cases first. Both causes are now fixed in one place, incidentList() in screens.ts plus consoleList in data.ts. The past-deadline count now comes from the console's own overdue filter, not from the rows on one page. There is no phrase list, and no test was deleted or loosened (the test diff is flips from it.fails to it, plus comments). The guard's paged fake store is real and would fail on the old code. The full vitest run gave 2376 pass and 1 fail (props.pass4 property-1, a cluster not done). The real-store tests same-number, audit-narrate_and_figures and audit-understanding passed.

## Issues

1. RC-08, P1. The cases screen mixes units for an open list: Total and "N of the TOTAL" use groups (r.total), the past-deadline figure counts incidents (lateAll). 339 incidents vs 296 groups, per lanes/b.md. The guard's fake sets incidents equal to rows, so it cannot see this. Use the incident count for total too, or say groups. (Lane b's later commit 06c8efe, RC-08b, addresses this.)
2. Lane b, P1. Only RC-08 is fixed. RC-09 to RC-16 have no fix and no b.jsonl line, but their tests were flipped to `it` at the start, so the branch is red. Do not merge it as "lane b done".
3. RC-08, P2. Two tests stay it.fails (AUD-NF-3 "console's groups", same-number-2 severe, whose oracle counts 37 groups where the screen now says 39 incidents) pending the owner's decision on the unit. Nothing is weakened; they were it.fails before.
4. Process, P2. docs/qa/pass4/reviews/b-review.md was not written or committed because writes into the p4-lane-b worktree from this session were blocked. The review run also left modified tracked files in that worktree (data/embeddings/incidents-* and two docs/qa/pass4/evidence/bug-audit JSON files) that need `git checkout --`.

## Smaller points

The source guard reads single lines, so a call split over two lines would pass it. The guard has no late Severe case and no groups. `complete` compares group rows with an incident total for the severe list, so "held by" may be hidden when it could be shown. Hands.list is optional, so the old paging fallback remains and is tested only with fakes. consoleList bypasses the tool wrapper, so its calls leave no tool facts or sources.

## Not done by the reviewer

- b-review.md was not written or committed.
- Tracked files modified by its test run were not restored: data/embeddings/incidents-Xenova_multilingual_e5_base.bin and .json, and docs/qa/pass4/evidence/bug-audit/understanding-next-step-sweep.json and understanding-rules-first.json.
