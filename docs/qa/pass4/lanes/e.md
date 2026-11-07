# Lane e: review stage (7 Nov)

Inputs: `docs/qa/pass4/reviews/e-review.md` (reviewer, reading only) and `e-skeptic.md` (skeptic, unit probes and one real run). Each point is judged on its evidence. Commits: `09a4a32` (window words, data routes, dataset guard, queue notes on screen), `c96f13b` (unreadable memory file). Tests: tsc clean in `src`, full `npx vitest run` 185 files pass (2,813 tests). Golden `merged2`: 0 server errors, explained in `docs/qa/pass4/golden/explained/merged2.md`. No model was called.

## Accepted and fixed

| Point | Verdict | What I did |
|---|---|---|
| Review 2, skeptic SK-E-1, 2, 3 (Tamil and Tanglish last week and month) | Accepted, P1. Real: the regex had English nouns only | One pattern for the three languages (கடந்த / போன வாரம், மாதம்; pona vaaram, pona maasam). Test: the same range as English. The skeptic's it.fails became it() |
| Skeptic SK-E-4 ("last week of October") | Accepted, P2 | New branch: the last 7 days of a finished month (25 to 31 Oct). Before, it was last week, or all of October. For a month not yet finished it falls through to the old behaviour (open, see below) |
| Skeptic SK-E-5 (நேற்றைக்கு, nethiku, netraikku) | Accepted, P1 | Added to the one YESTERDAY pattern. This is the "each lane has its own list" shape again, so one pattern, not a second list |
| Skeptic SK-E-6 (Tamil plural and colloquial department wise; kedu thaandiya) | Accepted, P2 | BY_DEPT reads துறை(கள்) வாரியா; LATE reads kedu thaandi(ya) |
| Skeptic SK-E-7 (DATASET_DIR set to the tracked folder under dry run) | Accepted, P3 | `datasetWriteAllowed` does not count a DATASET_DIR that resolves to data/datasets as its own |
| Review 1 (RC-47 invisible) | Accepted, P1. I searched too: nothing used the fields | The citizen's step 5 page shows `queueNote.en`, the officer's New tab shows `awaitingNote.en`. A source guard test. **Not seen on screen** (no browser run), and the Tamil sentence is not shown (both pages are English only) |
| Review 3 (hospital-data tests pass whatever happens) | Accepted, and worse than said | Making the test positive failed it at once: "Is the hospital data real?" answered "Hospital reports: 1,620 (rows after cleaning)" (the Data Studio dataset lane) and, with that fixed, "Health, by category" (the several-subjects lane). Three lanes ran before aboutTheData: Studio, several-subjects, fastPath. All three now skip a data question. The test asserts the feeds card or the data-sources help |
| Review 4 (aboutTheData too broad: "source", "records") | Accepted as a reading, then tested | DATA_WORD no longer matches a bare source or records ("is the water source healthy?" stays with water). REALNESS_WORD is unchanged. Near-miss test added |
| Review 6 (RC-51: a lock read as damaged, then replaced) | Accepted, P2 | An unreadable file (any read error but ENOENT) makes `changeMemory` throw before writing; POST answers 503 "nothing was changed". Test failed before |

## Accepted in part

- Review 1, "every hour" (the citizen sentence): the only source I found is `docs/District_IQ_Demo_8min.md` (the data is built every hour on GitHub Actions). I kept the sentence, but a local server never runs that update. For the owner to confirm.
- Review 8 (RC-45 default writes on a plain local run): true, and by design. The launcher sets DATASET_DIR. The ledger entry should read "for the launcher". No code change.

## Rejected or not done

- Review 5 (RC-09 zone performance with a zone selected): the screen is relabelled "all zones" and the earlier-period comparison is gone. Honest, not a wrong number. P2/P3, left. The PB-067 test being close to a tautology is fair; not strengthened.
- Review 7 (RC-48 fonts, RC-49 a11y): not verified this stage; no browser or axe run. Whether the consoles now fall back from Inter and JetBrains Mono needs a look on screen. Left open.
- Review 6, second part: Studio `getBoard` still answers an empty list for a damaged board file until the next save. Left open.
- Review 2, design point: "last week" is now Monday to Sunday (on a Monday it is the week just ended). For the owner.

## Open at 14:55

1. RC-47: see it on screen, and why the officerA list still said `awaiting: 0` after the writes session filed a complaint (maybe another department).
2. "Last week of <month>" for the month in progress, and for a month older than the store (falls through to the old reading).
3. RC-48 font fallback, RC-49 axe numbers, the 428 console line.
4. Studio getBoard on a damaged board file.

## Process notes

- Golden build included the working tree at 14:29, which held other agents' commits and edits in `src/lib/thunai` and `src/lib/assistant/verify.ts` (not mine; I committed by name only). So two Thunai changes in `merged2` are explained from their code (see the explained file).
- Slip: I wrote one scratch log to `E:\farm\.claude\worktrees\scratch-golden.log`, one level above this worktree, by a wrong relative path. It was a plain log of the golden run, nothing refused. I deleted it as soon as I saw it. Nothing else was written outside the worktree and the scratchpad.

## The QA 4 config run (`vitest.qa4.config.ts`), not triaged in full

I ran it once after the fixes (14:35 to 14:42). It has failures: for example metamorphic m30 (Tanglish "closed this week" is refused by Jarvis's quick lane), audit-narrate AUD-NF-11/16/17, audit-understanding-17 and -20 (English and Tamil spoken-line wording), BUG-019 name suffixes, "same number everywhere", and two live tests that need a model server (case lifecycle, TIMECONC-1). I checked three of them (m30, AUD-NF-16, audit-understanding-20): they are open audit findings in Jarvis's spoken lines and quick lane, which none of my changes read (no use of `customWindow`, `aboutTheData`, `YESTERDAY` or `datasetWriteAllowed` under `src/lib/thunai`). I did not run the same tests on the commit before my changes, so "not caused by this stage" is a reading of the code, not a comparison. The plain `npx vitest run` (185 files) passes.
