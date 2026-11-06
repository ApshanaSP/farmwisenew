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
