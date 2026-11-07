# Lane b: figures and time (fixer notes)

Branch claude/p4-lane-b. Each cluster: root cause, why earlier tests missed it, the fix, the sweep, the class guard.
The tests of every cluster of this lane were flipped from it.fails to it at the start, so a commit early in the lane has red tests for the clusters not yet done.

## RC-08 Counts and totals taken from one page of 12 rows
Bugs: PB-002, PB-004, PB-016, PB-017, PB-058, PB-059, PB-215.
- Root cause (two parts, both in how screens.ts reads the incident list). 1) The incidents tool sorts severity with FIELD(...) and a default direction of
  newest-first, which is DESC, so "sort severity" put the LEAST serious cases first. Every screen that took "the first page" or "the first row" of that list
  (dashboard list, advise, explain-one, complete) got Low cases, and the overdue filter run over that page found none. 2) Counts ("past their deadline",
  "held by X") were made over the rows on screen, after the slice, next to a total for the whole list.
- Why earlier tests missed it: the fake tool returned every row at once, in the order given, so neither paging nor direction showed. BUG-007 and BUG-021 were
  checked on the helper, not on the path the chat takes.
- Fix (mechanism): one function, incidentList(), is the only place screens.ts reads the list. It sets the direction for the order asked (severity ascending),
  and a status of "overdue" goes to the console's own filter through a new hand, Hands.list (data.ts consoleList, intel.list), which returns the rows and the
  whole count of incidents. The past-deadline figure everywhere in the cases screen is that count; "held by" and "who holds most" are said only for a list shown
  whole; casesSay takes the whole-list late count. advise reads the first case past its deadline from the overdue list. agent.ts's own incidents call passes dir 1.
- Unit decision: a past-deadline figure counts INCIDENTS, as the console tile does (339 this week), not the groups (rows) of the list (296). A list row is one
  group of the same problem. Two old tests disagree with that and stay as it.fails with a comment: AUD-NF-3 "not even the console's groups" (asks for groups)
  and same-number-2 severe (its oracle counts groups, 37; the incident count is 39). The other three tests of the same inputs ask for incidents. Owner to confirm.
- Sweep: docs/qa/pass4/sweeps/RC-08.txt.
- Class guard: src/lib/thunai/figures.pass4b.test.ts (a fake store that pages 12 a page and orders as the real one; plus a source guard that screens.ts
  calls the tool in one place only, and that every thunai source asking for severity order says the direction).

## Review round (7 Nov): what was accepted and rejected
`reviews/b-review.md` does not exist (the reviewer's file never arrived), so only the skeptic's file `reviews/b-skeptic.md` was judged.

Accepted (both were real, reproduced by its it.fails tests on the pinned snapshot; both fixed at the mechanism, tests flipped to `it`):
1. Part larger than the whole ("14 severe ... 15 past their deadline"). Cause: the headline total of a list was `r.total`, the list's rows (groups of one problem), while the past-deadline figure counts incidents. Fix: in cases(), the headline total is the incident count of the same list (`r.incidents`); the group count is kept only for "is the list shown whole" (`groupsTotal`). One unit on the screen now. The Tamil takeaway uses the same variables.
2. advise said 283 where the cases screen said 325. Cause: advise read `late.total` (groups) instead of `late.incidents`. Fixed.
3. Same split on the dashboard (open tile "ongoing" against the Open cases list total; the skeptic listed it as pre-existing, outside the commit's claim). It is the same mechanism, one line, so it is fixed too and has its own test.
Tests: tests/qa/pass4/skeptic-b.test.ts (three `it`).

Rejected: nothing. The skeptic's "not tested" items (Tamil and code-switched sentences reaching only the model lane) stay open: they need a model key and none is allowed here.

Golden diff (baseline-abef9da to lane-b-rc08b, built from this branch): 3272 requests, 16 changed, 0 added, 0 removed. All 16 are collector `agent` / `agent/round` answers that build a cases list (explained below); the build id also differs (expected). Nothing else moved.
- Headline total rose where the list groups incidents (114 to 122 this week, 23 to 24 today, 10 to 11): the count is now incidents, as the console tile counts them.
- Past-deadline figure changed from a count of the 12 rows on screen to the whole list ("12 of the 12 shown" to "39 of the 52"; Kpis late 0 to 35, 0 to 1): RC-08 part 2.
- "Held by" tile and the "held by" words are gone from partial lists: RC-08 part 2.
- Row order and ids changed where severity order was ascending-by-mistake (least serious first): RC-08 part 1.
No unexplained change.

Open: the props.pass4 "number gate (property)" test fails (fullwidth digits, seed 4242). It is outside lane b (number gate), and not touched here. `tsc` shows errors only in tests/qa/pass4/scans-code.test.ts and src/lib/thunai/props.pass4.test.ts (typing of other lanes' tests).
