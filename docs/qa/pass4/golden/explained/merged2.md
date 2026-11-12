# Golden-master changes, merged to merged2 (7 Nov, after the lane e fix stage and the review fixes)

Compared 3272 requests with 3272: **124 changed, 0 added, 0 removed**, no status changes. Recording `merged2`: `five_xx 0`, `problems 0`, `gaps 0`, no server error lines in any session. Built with `NEXT_DIST_DIR=.next-qa` through the build lock at about 14:29 IST on 7 Nov, on port 3202. Raw comparison: `docs/qa/pass4/golden/diffs/merged__merged2.md`. The baseline `merged` was recorded at commit f3ae1a8 (13:18), so this diff holds everything committed since: the earlier lane e fix stage (RC-09 to RC-51), the review fixes of this stage, and the commits other agents made in the same worktree before the build (RC-13 number gate, RC-42 stage words).

Caveat: the build used the working tree as it was at 14:29, not a clean checkout of one commit. That tree held the lane f commits `b8c82a4` and `547c76e` and possibly uncommitted edits by that agent (`git status` showed changes in `src/lib/thunai/*` and `src/lib/assistant/verify.ts` that are not mine). The two Thunai changes below are explained from their code, not from a clean-tree run.

## By route

| Route | Changed | What changed | Cause | Right? |
|---|---|---|---|---|
| `/api/officer/grievances` (every tab, officerA and officerB, 112 requests) | 112 | `awaiting` (0) and `awaitingNote` (null) are new fields | RC-47 (PB-315), earlier fix stage. The officer list now says how many filed complaints will join the list at the next update | Yes. Both are 0 and null on the frozen snapshot, so no sentence shows. I did not see a non-zero case: the writes session filed one complaint and the officerA list that followed still said 0 (the complaint may belong to another department, not checked). So the officer sentence on screen is **not verified**. |
| `/api/complaints` POST (citizenA, 1) | 1 | `queueNote` is new: `{en, ta}`, the sentence "your complaint is registered; the officer will see it at the next update" | RC-47, earlier fix stage | Yes. The citizen's step 5 page now shows it (this stage). Not seen on screen. |
| `/api/collector/assistant/chat` (4: officerB Tamil and Tanglish, collector Tamil and Tanglish) | 4 | The count card for "open" is headed "Open" (not "Reported"), and its Tamil and Tanglish sentence says "still open" instead of "reported ... of which open". The number is the same (102 of 102, 153, 2,411) | RC-10 (PB-143), earlier fix stage: `countLabel` and the Tamil and Tanglish text follow the filter the count used | Yes. The question asked for open ones; every one counted is open, so the figure did not move. One Tanglish line lost "(munnadi 225)", the figure for the period before, because the open-only card no longer compares with all reported. That is intended: 2,411 open is not comparable to 225 reported. |
| `/api/collector/thunai/agent/round` (6) and `/api/collector/thunai/agent` (1) | 7 | (a) takeaway "54 of the 52 are past their deadline" becomes "54 are past their deadline" in English and Tamil (4 requests: 2 round, 1 agent, 1 direct sentence 18). (b) In 3 requests plus direct sentence 19, two rows (or one) change `overdue` from true to false, and the next-step label "Draft for the 7 past deadline" becomes "5" (and the id list loses two ids); one request's spoken line changes from "2 past deadline" to "1" | (a) RC-13 (lane f): the number gate now reads digits of every script and every number word; the old sentence put a count (54) over a smaller total (52), which was wrong. (b) RC-12 (lane e, earlier stage): a closed, resolved or rejected case is not past its deadline (`caseRow` in `screens.ts`: `overdue = flagged and not closed`) | (a) Yes: 54 past deadline cannot be "of the 52". (b) Yes: the rows that turned false are cases already closed; the drop from 7 to 5 is two closed cases no longer counted. I did not check the two cases by id against the store in this stage. |

Nothing else in the 3,272 requests changed. No request changed status, and none became slower or failed.

## Changes of this stage that the golden run does not show

These changed code, but no recorded request reaches them (the frozen snapshot has no such input), so a clean diff proves nothing about them. They are covered by unit and snapshot tests, listed in `docs/qa/pass4/lanes/e.md`:

- Tamil and Tanglish "last week" / "last month" windows and "last week of October" (the golden questions do not use them).
- The data-question routing (the hospital-data wording is in `tests/qa/pass4/e-routes.test.ts`, run on the same snapshot).
- The unreadable memory file refusal, the `DATASET_DIR` rule, and the two on-screen sentences for RC-47.

## The earlier fix stage

The diff vs `merged` also holds the earlier lane e stage. Every request it changed is in the table above: RC-47 (grievances list, complaints POST), RC-10 (chat count cards) and RC-12 (Thunai stage rows). RC-09, RC-11, RC-45, RC-48, RC-49 and RC-51 changed no recorded request. RC-09's zone-performance retitle and RC-11's routes are in questions the golden set does not ask; RC-49 and RC-48 are page markup, and the golden run records API answers only.
