# Lane b skeptic review (branch claude/p4-lane-b, commit ef189f1, RC-08)

Method: real round on the pinned snapshot (planRound, serverHands, no model key), plus ClientSim sentences. About 40 sentences and 100 filter combinations. Tests: tests/qa/pass4/skeptic-b.test.ts (it.fails).

## Breaks
1. Part larger than the whole (medium). `cases` open, Severe, q "tree", monthly: "14 severe cases the last 30 days; ... 15 are past their deadline". Also flood 33/35, water 36/38. The headline total counts list rows (groups), the past-deadline figure counts incidents; the commit chose that unit split on purpose, but the open list now puts both in one sentence and the Kpis. Fix: say the headline in incidents too (list incidents), or say late in groups where the sentence compares them.
2. advise disagrees with the cases screen (medium). Same weekly scope: cases overdue says 325 past their deadline, advise says "283 open cases are past their deadline" (283 is the group count from `late.total`; it should use `late.incidents`). Tamil advise says 283 too.

## Held up
Severity order ascending on every screen tried; overdue counts match the console (39 Severe, 133 High, 325 weekly); "held by" is not said for partial lists; Tamil `cases` takeaway uses the same figures as English.

## Not tested or out of scope
Tamil and code-switched sentences ("காலக்கெடு தாண்டிய வழக்குகள்", "overdue cases வேணும்") reach only the model lane with no key, so the rules fall back to "no model" text: not a lane b break, and unverifiable here. "overdue water cases" returns one Drinking water case (category match, not RC-08). Dashboard shows open 1111 in the Kpis and 1025 in the list total (same group/incident split, pre-existing, not in this commit's claim).
