# Golden-master changes, all four lanes merged (baseline-abef9da to merged)

Compared 3272 requests with 3272: **278 changed, 1 added, 1 removed**, 0 server errors (the baseline had 2 answers with a 5xx; the merged run has none: `five_xx 0`, `problems 0`). Built with Next 15.5.29. Raw comparison: `docs/qa/pass4/golden/diffs/baseline-abef9da__merged.md`. Joins checked against each lane's own last recording with `golden-diff.mjs lane-d2 merged`, `lane-c2 merged`, `lane-a2 merged`, `lane-b-rc08b merged` (files in the same folder).

How this was checked: every changed request id in the merged run was looked up in the lane diffs (`lane-a`, `lane-c`, `lane-d`, `lane-b-rc08b`). all 278 are changed by at least one lane recording (`lane-a`, `lane-c`, `lane-d` or `lane-d2` for `map/send`), and are explained in `lane-a.md`, `lane-c.md`, `lane-d.md` (reused, not repeated here); the effects only the merge shows are listed under joins. No lane's change disappeared in the merge except two Jarvis lines (below).

## By cluster

| Cluster | Requests | What changed | Where explained |
|---|---|---|---|
| RC-34, RC-29, RC-26 (lane d): one past-deadline rule, whole-set counts, decisions with an effect | list 70, overview 32, report 18, insights 21, export 4, map/ask 21, incidents/[id] 19, officer overview 30 (+1 insights), sources 1, rehearsal/impacts 1, chat 5, agent/round | `sla_due` and `overdue` on rows, past-deadline 888 became 1,632 (90 days), resolved counts are what was closed in the window, action list is no longer capped at 400 rows, generated feeds say `test` | lane-d.md |
| RC-32 (lane d): honesty labels | sources 1, rehearsal/impacts 1, officer overview | generated feeds are `test`, not `ok` | lane-d.md |
| RC-25 (lane c): the assistant's CSV needs the confirm step | assistant/export 18 | 200 with a CSV became 428 "Confirm it's you first" (as the console's export asks) | lane-c.md |
| RC-23 (lane c): a Tamil word is a word, bad bodies 400, unknown rain 404 | search 5 (the Tamil word: 500 became 200), list 2, workspaces/[id] 1 (404 became 200 for the golden's own workspace), rehearsal/state 1 (503 became 404) | `GET /api/collector/search?q=` a Tamil word no longer answers 500 (checked: status 200 in merged) | lane-c.md |
| RC-18, RC-19 (lane c): privacy and the exit gate | thunai/plan 3 (kind none became refuse) | a citizen's details, or an order to send, approve or delete, is refused in code | lane-c.md |
| RC-01..07 (lane a): understanding | agent/round 8, agent 2 | the language of a Tanglish question is read as Tamil (`lang en` became `ta`), a follow-up without a sign back is no step (`kind do` became `none`), a place that is not ours is said so | lane-a.md |
| RC-08, RC-08b (lane b): list counts and order | agent 5, agent/round 11 | "N of the M shown are past their deadline" became "N of the M" over the whole list; the counts are incidents; the first rows are the most serious | see below and `lanes/b.md` |
| RC-24 (lane c) | incidents/[id], audit | one rule for a row id; the audit has one more row (193 against 192) because the golden session's own write is now audited | lane-c.md |

## The two assistant/chat requests "Delete all the closed complaints from last month." (collector and officerA): explained

Before (baseline, and lanes a, b, d): 5 events and a data answer, "4,809 incidents resolved, last 30 days" (collector; 567 for the Solid Waste department for officerA). After (lane c, and the merge: byte for byte lane c's answer, sha 2dfa0b4e): 3 events and a refusal, "I can only read the data; I can't change or delete records. Decisions are made on the console itself."

The refusal is right and the data answer was wrong: a request to delete was answered as if it were a question about counts. The code that refuses it has not changed in any lane: `codeGuard` in `src/lib/assistant/guard.ts` (rule "data change", delete word + a target within 40 characters). The same source is in the baseline (`git diff abef9da HEAD -- guard.ts` is empty, and `codeGuard("Delete all the closed complaints from last month.")` returns `unsafe, data change` when called from a test, which I ran).

So the guard was in the source but never fired in the **built app on Next 14**. The cause is the production build, not the code: in the minified server bundle of every Next 14 build on this machine (`p4-lane-a`, `p4-lane-d`, `qa-full-pass`, `.next-qa`) the rule reads `.{0,40}\\\b(complaints?|...` (an escaped backslash followed by the backspace character), so it can never match a word edge. In the Next 15.5.29 build (lane c's upgrade, and this merge) the same line reads `.{0,40}\b(complaints?|...)` and matches. Next 14's compiler wrote the `\\b` of the template literal wrongly in the bundle; Next 15's does not. Lane c did not change the guard or know this; the refusal came from the compiler upgrade. Unit tests could not see it because vitest compiles with another tool.

This is a finding to keep, not a closed item: any other regex written inside a template literal (`new RegExp(\`...\\b...\`)`) was also wrong in the Next 14 production bundle. I did not scan for those; the 21 golden requests the merge changed in chat and Jarvis may include more of them. Not verified beyond this one rule.

## Joins between lanes that no single lane could see

1. `POST /api/map/send` (1 request). Changed by no lane in its first recording, but it is lane d's second recording (`lane-d2`, after the review fixes): the drafted mail lists a case as "past its deadline" where it did not, because lane d's `overdue` flag now reaches the mail (3215 to 3500 characters, see `lane-d.md`). `lane-d2 merged` has no change on it, so the merge says the same as lane d2. Explained, no join effect.
2. Jarvis "N of the M are past their deadline" (agent 3 and agent/round 16 requests, lanes b and d together). Lane b counts incidents in a list headline; lane d's one rule counts what is past due. Where the list is the severe list, the severity panel's count (52 rows) and the past-deadline figure (54 incidents) are in two units, so the merge said "54 of the 52 are past their deadline" (3 requests: the Tamil question about severe cases, in `agent` and twice in `agent/round`). **This was found here and is fixed in this merge** (`screens.ts`, the takeaway says "54 are past their deadline" without "of 52" when the part would be larger than the whole; test `a past-deadline figure is never said to be "N of M"...` in `figures.pass4b.test.ts`, it fails before the change: 10 of the 2). The root of it is lane b's own P1 review point (groups against incidents in one sentence); the unit decision stays with the owner (the AUD-NF-3 "groups" test and same-number-2 stay `it.fails`).
3. `agent` `lang en -> ta` for "Thanni complaints yen increase aachu?" and the Tamil takeaway texts: lane a. Same as in `lane-a.md`.
4. Two Jarvis lines changed in a lane but not in the merge (`$.result.stage.takeaway`, `say.en` of one request in lane d and in lane b): in the merge the line equals the baseline, because lane a's "an outside place is said so" and lane b's counts now produce the same words as before. Explained by lane a, no change in the merge.

## Rows with added and removed request

`added: POST /api/collector/thunai/agent/round` and `removed: ... same route`: one Jarvis round whose request is recorded under a different body. Lane a's recording has the same pair ("1 added, 1 removed" in `lane-a.md`); I did not trace why further. The round count is unchanged (3272 and 3272).

## What is still not explained

- The golden diff for the Jarvis `agent/round` requests lists 16 changes that are mixed effects of lanes a, b and d on the same sentence; the lane files explain each lane's part, and I checked the text of every line in the list above, but I did not check each of the 16 against a lane-only recording.
- The added and removed `agent/round` request (above): same pair as lane a's own recording, cause not traced.
- The hidden class of "regex in a template literal" in the Next 14 bundle (above) is not scanned.
