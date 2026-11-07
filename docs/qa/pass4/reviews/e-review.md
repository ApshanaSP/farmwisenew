# Lane e review (reviewer, 7 Nov, read-only)

Scope: the nine commits after f3ae1a8 (RC-09, 10, 11, 12, 45, 47, 48, 49, 51). I read the diff, code first and then tests. I ran nothing: no server, no model, no test run (fast track). Everything below is from reading, so each point says what I saw and where.

## Verdict by cluster

| RC | Verdict | One line |
|---|---|---|
| RC-09 figure scope | Good, one gap | Real comparison test (PB-060 checks the tile against the console's own list). Zone performance is fixed by relabelling "all zones", not by honouring the zone. |
| RC-10 windows | Partly, with a language hole | One YESTERDAY table is a real mechanism. "last week" and "last month" are English only. |
| RC-11 route order | Mechanism right, tests weak | aboutTheData read first in every lane is the right fix. Some tests only say what the answer is not. |
| RC-12 case row | Good | Category code plus holder, not title words. A closed case is not overdue. Tests are strong. |
| RC-45 dataset writes | Good for the launcher | One switch, and the launcher sets DATASET_DIR. |
| RC-47 queue delay | Not delivered to the user | The two notes are in API JSON only. No screen shows them. |
| RC-48 console errors | Partly | Font link removed. The 428 log is left as "by design". |
| RC-49 a11y | Plausible, not verified | Source-text guards only. |
| RC-51 damaged file | Good, one loose end | Missing and damaged are split, a copy is kept aside, GET answers 503. |

No existing test was weakened or deleted. yesterday.test.ts only gained lines. All new tests are additions.

## Problems, most serious first

1. **RC-47 (PB-315): the fix is invisible.** `queueNote` is returned by `POST /api/complaints` (src/app/api/complaints/route.ts) and `awaiting` / `awaitingNote` by `grievanceList` (src/lib/officer/data.ts). I searched src/components and src/app for any use of `queueNote`, `awaitingNote` or an officer-list `.awaiting`: none. The citizen's file-complaint page and the officer queue never show the sentence. The root cause (the queue is built from pipeline incidents, so a new complaint is late) is also untouched. The ledger says "partly", but the half it claims, that the citizen and the officer are told, is not done. The guard test (complaint-awaiting.pass4.test.ts, last describe) is a regex over route.ts and data.ts source. It passes with nothing on screen, which is the state now. The citizen sentence also says the update "runs every hour"; I found no source for that in the diff or the sweep file. P1.

2. **RC-10: "last week" and "last month" are English only.** The calendar-week branch in customWindow (fastpath.ts) matches `(last|previous|pona|kadandha) (week|month)`. Tamil "கடந்த வாரம்" and Tanglish "pona vaaram" do not match, and periodNamed reads `vaaram` and `வாரம்` as the rolling weekly window. So the same question gives the calendar week in English and the rolling 7 days in Tamil and Tanglish. That is the "each lane has its own list" shape RC-10 names. countInLanguage even has the labels "pona vaaram" and "கடந்த வாரம்", which can only be reached by an English question. The new tests in yesterday.test.ts cover last week and last month in English only (yesterday is covered in three languages). P1 for the Tamil and Tanglish lane. Design point for the owner: "last week" is now Monday to Sunday, so on a Monday it is the week just ended and on a Sunday it is a week ago.

3. **RC-11: tests that pass whatever happens.** In tests/qa/pass4/e-routes.test.ts the three "hospital data real?" cases only assert `not.toMatch(/bed occupancy|.../)` and a headline that is not "severe events". A wrong answer of any other kind, or an error card, passes. They should assert the help topic or the feeds card. The feeds cases and the "past deadline by department" cases are positive and fine. P2.

4. **RC-11: aboutTheData is broad.** DATA_WORD includes `sources` and `records`, and REALNESS_WORD includes `healthy`, `working`, `fresh`, `test`, `real`, `live`. By reading, "is the water source healthy?" has both and would go to source_health before any subject route, in directTool, guard and offlineRoute alike. I did not run it, so this is a reading and not a finding with a test. It needs a near-miss test list. P2.

5. **RC-09: zone performance with a zone selected.** The screen ignores the zone and is retitled "all zones". That is honest, but the user asked about one zone and gets all of them. The Reported tile now equals the trend total (all incidents, zone-less ones too) while Severe, Open and Complaints still sum the zone rows, and prev and delta were set to null, so the comparison with the earlier period is gone. The PB-067 test (`kpi(n) == trendSum`) is close to a tautology because the tile was set from that same number. P2 or P3.

6. **RC-51: no second notice, and a loose trigger.** GET returns 503 once. After the next change the file is healthy, the old notes are gone from view, and the only trace is a console.error line and a `.damaged-<time>` file. `load()` treats any read error other than ENOENT (a locked file, EACCES) as damaged, so a transient lock could make the next write replace real notes with one note. Rare, but it is the data-loss shape the fix is for. Studio `getBoard` still returns an empty list for a damaged board file until the next save. P2.

7. **RC-48 and RC-49.** Removing the Google fonts link (collector and officer pages) stops the blocked fetch, but I saw no replacement for Inter and JetBrains Mono (src/app/layout.tsx loads other fonts), so the consoles may now render in the fallback stack. That is a visible design change and should be checked on screen. The 428 console line is left as "by design"; the sweep says "not swept further". The a11y guards (a11y.pass4.test.ts) are source-text checks. The contrast one computes real ratios, which is good. The tablist and label ones only match markup. The real proof is tests/qa/pass4/axe.mjs against a server, which I did not run. The 52 to 0, 102 to 0 and 56 to 0 numbers are the author's, not verified here. P3.

8. **RC-45 default.** `datasetWriteAllowed()` returns true when none of DATASET_DIR, AWS_STORE_DRY_RUN or the aws backend is set. A plain local run on the MySQL backend still writes the tracked data/datasets. Only the launcher is protected (env.mjs sets DATASET_DIR). Reasonable, but the ledger should say "for the launcher". P3.

## What looked right

- RC-12: `actionForOne(catCode, dept, deptName)` reads the category code (briefbook INC selects `category_code AS cat`) and names the holder from the case's own department field, so the step cannot name another agency. `Object.hasOwn` stops a prototype word. The tests cover 7 categories by 8 holders, a closed case (Resolved, Closed, Rejected, Lapsed), and a reopened case. These would fail on the old code.
- RC-10: customWindow no longer returns a range and an offset together (incidents.ts ignores the offset when a range is set). One YESTERDAY pattern in when.ts is imported by fastpath, pipeline and decide.
- RC-09 PB-060: the test compares the tile with the console's own `list()` count for the department. A real cross-check.
- Tamil strings in new tests are checked for Tamil script and for no long Latin words.

## For the owner
- Calendar or rolling "last week" (item 2).
- Whether "every hour" is true for the update (item 1).
