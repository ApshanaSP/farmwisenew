# g-repair: what was accepted and what was rejected (12 Nov)

Inputs: `reviews/g-review.md` (reviewer, 9 serious points and a list of smaller ones), `reviews/g-skeptic-lang.md` (37 breaks, SKG1-01 to SKG1-37), `reviews/g-skeptic-ui.md` (16 breaks, SK2-1 to SK2-16, and the redsec2 re-run), and `findings/hunt-redsec2.json` (one P1). Every point was judged on its evidence: I read the code, ran the sentence on the real path (the pinned snapshot, a frozen clock, no model key, `ClientSim` and `ask()`), and only then changed anything. Every fix has a test that was red before it (or, for the Tamil, Tanglish and screen items, a real-run log of the old behaviour in the review), `npx tsc --noEmit --incremental false`, the full default suite, a commit and a row in `g-repair.jsonl`.

Models: none was called. No server or test here had a model key.

## Counts at the last commit

See "Final counts" at the end.

## Accepted and fixed

| Point | Verdict | Where fixed | How it was checked |
|---|---|---|---|
| hunt-redsec2-1 (P1), SK2-4, SK2-5, g-review 1 | accepted, confirmed | `a72a5bd` (earlier in this stage): the try is counted before the slow check, in the five-tries lock and the emailed-code limit; the done phrase removes the done word only | `hunt-redsec2.test.ts` and `skeptic-g2.test.ts` SK2-4 pass against a build of this tree: 20 parallel wrong passwords give at most 5 x 401 and the rest 429 |
| g-review 8, 9, SKG1-14 to SKG1-19, SK2-6 to SK2-8 | accepted | `a5bbab0` (earlier in this stage): the reminder time and the source date are read by hand in Chennai time; IST, impossible days and a missing year; the route-news test no longer depends on the day | `skeptic-g1.test.ts` SKG1-14..19 and `skeptic-g2.test.ts` SK2-6..8 turned from `it.fails` to `it` |
| g-review 2, SK2-13 | accepted | `2ed8195` | the four guards are back in `a11y.guards.pass4.test.ts` (one RegExp built from a template had its backslash undoubled: found by the RC-37 guard and fixed). The old file's own tests are unchanged |
| g-review 7 | accepted | `014b602` | the wide `.dic :focus-visible` switch-off is gone from `globals.css`; the console stylesheets draw the ring; the guard now reads the whole list and a second test requires every console stylesheet's `.dic :focus-visible` to draw one. The test failed against the old css first |
| SK2-1, SK2-2, SK2-3 | accepted | `014b602`: the dataset folder is compared on disk and case-folded; a memory field of the wrong type is damage | `skeptic-g2.test.ts` |
| SK2-9, SK2-10, SK2-11, SK2-12, SK2-15, SK2-16 | accepted | `014b602`, `32bcf1f`, `e306c19`: the Confirm box traps Tab and has Tamil words; both queue notes print the Tamil text; the 404 page has a main; the drawer body takes focus; the drawer is a dialog on a `div`. SK2-12 had a second cause the skeptic did not name: `useLang` starts as English and changes a frame later, so a note shown after load was English for a frame. `useLangNow` reads the language at the first render for a component that mounts after hydration | the live tests of `skeptic-g2.test.ts` run in a real Chromium on a build of this tree (`SK2_PORT`), all pass; `axe.mjs` now also walks every officer view, the drawer at 360 px and the 404 page: 114 runs, critical and serious 0 (`g-repair-axe.json`). The extended run also found one minor item (the drawer's `aside` with a dialog role), fixed in `e306c19` |
| SK2-14 | accepted | `32bcf1f`: ink colours for the severity words, a darker dark-theme green | the measuring script found 33 nodes on the old build and 0 on this one over six officer views, light and dark; `contrast.grepair.pass4.test.ts` and the live SK2-14 |
| SKG1-20 to SKG1-27 | accepted | `bb35922`: one window reader (`src/lib/windowspan.ts`) for Ask and Jarvis, with number words, `7d` and `24h`, digits of any script and the case endings Tamil puts on a unit; a count that cannot be applied (0, -5, 3.5, more than the records hold) or a time that names no count (since monday, this year) is said, in the language of the question; a day and a range in a month are read as those days; Tamil month names are months; `innaiku` is today | a property test over count x unit x lead x ending (1,500+ forms), and the 8 skeptic tests |
| SKG1-28 to SKG1-30 | accepted | `bb35922`: more forecast words in three languages; an order to close, reopen or export is said, with or without a model | the 3 skeptic tests; a question about closed cases is still answered |
| SKG1-31, SKG1-32, g-review 3 | accepted | `bb35922`, `8779570`: the count says its own window (3 months is the quarter, 2 weeks is no window the console holds and is asked about, last 3 days is never today); a status beside a window is handed on whole by the rules lane | `g-repair.test.ts`, `g2-real.test.ts` |
| SKG1-01 to SKG1-07 | accepted | `5f26da3`: one count rule (`readPicks`) for first, top, முதல், mudhal, last, கடைசி, kadaisi; a position from the end; முதல் between numbers is "from"; a decimal is refused | `ordinal.grepair.pass4.test.ts` and the 7 skeptic tests |
| SKG1-08 to SKG1-13 | accepted | `5f26da3`: Tanglish numbers are read through a fold of the spelling (so -thu and -dhu, b and p are one number) with hundreds and thousands; Tamil people words, 6, 7 and 8 with the joining ப் or a glued noun, the signs for 10, 100 and 1000, fractions before a unit of time; English multiples | `numbergate.grepair.pass4.test.ts`; ordinary Tanglish, the river அடையாறு and ஆறுதல் are not figures |
| SKG1-33 to SKG1-35 | accepted | `20f3123`: `zoneNosIn` reads every zone said (digits of any script, number words, `5 and 6`, `5 to 7`); one that does not exist is named; several are asked one at a time. Root cause: quick.ts's `norm` dropped other scripts' digits before the number reader saw them | `zone-no.grepair.pass4.test.ts` and the 3 skeptic tests |
| SKG1-36, SKG1-37 | accepted | `20f3123`: the brief tool names a body by its English name and the Tamil line looked it up as a code; the readings line built its own Latin month, clock and unit; a taluk was named in English | the 2 skeptic tests, and the golden run |
| g-review 4 | accepted | `8779570`: the four guards now assert the answer (the status in the slots, no step and the agent reached, the Brief block must exist, the Tamil line is checked whichever lane answered). Doing so showed that `open` as a status ("open cases in Adyar") ended in the cannot-reason line in rules-only mode: the fast lane read `open` as a verb. Fixed in quick.ts | `g-repair.test.ts`, `g2-real.test.ts` |
| g-review 5 | accepted | `8779570`: the share says incidents | `g-repair.test.ts`. The unit question itself (RC-40) stays the owner's |
| Smaller points | accepted | `8779570`: the RC-35 guard now checks each cache, not each file; the RC-05 guard scans all of src; the RC-16 guard has a getter and setter check, which found and fixed four more readers of the server's zone (the complaint code's year, the mandi weeks, the default reminder time, the quiet hours); `close` is read as being about a panel by its noun, not by an exact list | the new guards, each with a list of reasons that cannot rot |

## What the qa4 run found after these fixes (and was fixed in `2683219`)

Running `npx vitest run --config vitest.qa4.config.ts` after the fixes showed two things the fixes themselves had caused or uncovered. Both are fixed and each has a test.

- **The old `open` bail had hidden a family of Tamil and Tanglish gaps.** Before `8779570` the fast lane handed on every sentence that held the word "open", so the English sentence and its Tamil and Tanglish twin all ended in the cannot-reason line and `metamorphic.test.ts` saw "the same facts". Once English was answered, the twins were not: a ranking of open cases was by attention score (not by open cases), `top three` gave five rows and `top 3` three, Tanglish `complaints open irukku` and the Tamil `திறந்த ... முதல் மூன்று மண்டலங்கள்` were handed on. Fixed in `quick.ts` (`zone_open`, `topN` through the console's number reader, `open irukku` in `OPEN_RE`, a slot word or a number said in words is accounted for). Six known bugs of the metamorphic file turned out fixed, so their `it.fails` rows were removed from `metamorphic.known.json`, and open-baseline-12 and -46 are marked fixed.
- **The window reader read "past the deadline this week" as an unreadable count** (an English lead word, two other words, a unit). It broke `audit-understanding-1, -2, -20` and `same-number-1`. Fixed in `windowspan.ts`: after an English lead and an English unit another word is not a number; only a vague quantity (few, several) is unread. A test lists the sentences.
- **g1-real "Tanglish: nethu Adyar la fire accident enna aachu" was red before this stage began** (I ran the test against the whole `src/lib` of `a5bbab0`: red). G2's `tiedTopics` (two kinds of equal weight: hand on) came before G1's yesterday question, so the sentence got the cannot-reason line. It now asks which window, and the question says the kind was not read. This is the one place I changed the order of two fixers' rules; the test of each is green.

## Accepted in part, or not done, with the reason

- **g-review 3, the general rule ("count the slots read, compare with the slots applied").** I fixed the finding at the mechanism it names for status and window (the rules lane has a period step and no status step, so a sentence with both is handed on whole, in every language), and gave the unread-kind guards a general shape through the one window reader. A single slot counter over every reader was not built: each reader (status, kind, level, place) lives in a different file with its own words, and a counter would have to rewrite them. The real-path tests assert what each lane does with the whole sentence.
- **Skeptic note "one window reader, not three".** The count windows (`last N units`) are now one reader. `LAST_WEEK_MONTH` in Ask is a different thing (the calendar week or month before this one, Monday to Sunday, for Ask) from Jarvis's `last week` (the console's last 7 days, BUG-003). Merging them would change an accepted decision, so it is left apart.
- **SKG1-23, 1000 days.** The existing design clamps a since-date to the records with a note; I read the skeptic's expectation (a count beyond the records is named as not a window) literally for "last N days", so `last 200 days` is now refused too, where it was counted as 180 days with a note.
- **SKG1-24.** "since monday", "this year", "last year", "from last monday", "this fortnight" are refused with a sentence, not computed. Computing them is possible but is a new feature.
- **g-review 6 (OPEN-11 patch, P2).** Not reverted and not extended. The rules say to report the `district_intel` problems, not patch around them; U1's clamp (`openedHours`, "not started yet") is two lines in the assistant tool layer, honest in its comment. Reverting would bring a visible "-1 hours" back, and the rules also say the owner decides. OPEN-11 stays open in `docs/qa/BUGS.md`. Ready patch if the owner wants it out: revert the `tools.ts` hunk of `713f8d3` (the `openedHours` helper and the `hours < 0` branch of `openFor`) and turn INV-5 in `invariants-app.test.ts` back into `it.fails`.
- **RC-15, "a Tamil brief point loses the case".** The point now carries up to two of the record's reasons and a repeated line is numbered. Naming the case (the record's title) is the owner's decision (OPEN-12, complaint wording used as titles).
- **RC-06 owner conflict (BUG-003).** English "last week" and "last month" stay the matching windows in all three languages; the reviewer's note that `docs/qa/BUGS.md` BUG-003 says something narrower than the ledger leans on is right and is reported here for the owner to confirm. Not changed.
- **The self-contradicting figure** ("52 severe cases ... 54 are past their deadline", incidents against a group count): RC-40 and RC-29, the unit question, the owner's. Not changed.
- **RC-48 protocol** (a guarded route answers 200 with a header): kept, as the reviewer says.
- **Hand-off widened** (more sentences go to the model): not a regression with a model; not changed.

## Not fixed (and why)

- Data Studio's own "last N days" reader (`studio/ask.ts`, `recent`) takes English digits only. It is a different data world; the zone number there now uses the shared reader.
- The Tamil scope line of an Ask card still says `Last 10 days` in English (`describeScope`).
- The number gate fails closed only for the number families it knows; a Tanglish or Tamil number past 99 spelled in a way no family covers is passed.
- A noun-last sentence in rules-only mode ("last 7 days complaints", "open cases" with no place) still ends in the cannot-reason line. Both were so before this stage and with a model go to the model.
- The skeptic's "focus returns to the opener after the Confirm box closes" was not usable in their run and I did not test it.
- The claim in the citizen's queue note that the update "runs every hour": the code comments call the collection hourly; I did not verify the schedule itself.
- The collector console's own views were scanned by `axe.mjs` (its tabs), not by my measuring script.
- `tests/qa/pass4/audit-ui_honesty.test.ts` cannot pass on 12 Nov: it starts its own server with the clock frozen at 6 Nov 12:00 IST, so the staff cookie's `Expires` is 6 Nov 18:30 and the browser drops it; the page redirects to the login and `.daily` never shows (90 s timeout). The same would have happened on any date after 6 Nov: a time bomb of the RC-36 class in the harness, not in the app (`skeptic-g2.test.ts` and the browser checks of this stage run on a server with the real clock). Not fixed.

## Refusals

No hook or permission check refused anything in this stage.

## Final counts

Last code commit `2683219`; golden recorded on its build (`d14f673`).

- `npx tsc --noEmit --incremental false`: exit 0, no output.
- `npx vitest run` (default config): **204 files passed, 2 skipped; 3148 tests passed, 13 skipped, 0 failed**.
- `npx vitest run --config vitest.qa4.config.ts` (through the lock, a server on port 3211 from `.next-qa`, own servers for the files that start them on 23212 to 23214, no model key): **56 files: 49 passed, 5 skipped, 2 failed; 2611 tests: 2601 passed, 8 skipped, 2 failed**. The two failures are not code failures. `skeptic-g2.test.ts` SK2-16 got `sign in collector 429`: the many sign-ins of one shared server run hit the login rate limit, and the same test passes alone on a fresh server (1 passed). `same-number.test.ts` same-number-19 failed in the full run and passes when the file runs alone (53 of 53 passed); it also failed in the first full run and I did not find what makes it depend on the other files, so treat it as an unexplained flake, not as proof. With those two rerun alone, 2603 of 2611 tests passed and 8 are skipped (skipped: the files that need a hunter's own server or the live model).
- Golden `merged3` against `merged2`: 3272 requests, 84 changed, 5 added, 5 removed, all explained in `golden/explained/merged3.md`; `five_xx 0`, `problems 0`, `gaps 0`.
- axe (`g-repair-axe.json`): 114 runs (the nine pages in two languages and two themes, every officer view, the drawer at 360 px, the 404 page): critical 0, serious 0 (the one minor item, the drawer's role, was fixed afterwards).

Servers started by me (3211, and the golden's 3211 and 23212 to 23214) are all stopped. Tracked evidence files that the test runs rewrite (`evidence/bug-audit/*`, `same-number-hooks.json`) were restored with `git checkout`.
