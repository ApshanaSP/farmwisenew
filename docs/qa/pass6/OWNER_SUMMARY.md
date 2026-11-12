# QA pass 6: summary for the owner

This is the short version. The numbers are in `FINAL_REPORT.md` (made by a script from the files, not typed). Nothing was pushed, merged into
main, or opened as a pull request. The branch is `claude/qa-pass6-a84a72`, built on pass 5's branch.

## In numbers (from FINAL_REPORT.md)
190 rows in BUGS.json: 24 P0, 45 P1, 80 P2, 41 P3. Fixed: 32 (9 of them pass 5 rows), each with a test that fails without the fix. Open: 145 (5 re-run by me; the rest are the testers' own reports with their probes). Yours to decide: 13.

The final gate ran on commit `effe51b`: type check and lint clean (no errors), production build passed, the unit suite passed 4 times (3 shuffled in Indian time, 1 in UTC): 3428 of 3441 tests pass in each run, 13 are skipped (as before this pass), none fail. The golden master changed only where a fix meant it to (`evidence/golden-explained.md`). The access matrix: 1,168 of 1,170 cells as designed (the same 2 explained cells as pass 5).

## What happened
- The run started at 13:54. It worked for 2 h 55 min, then hit the usage limit; the final gate, this summary and the skeptic were done after
  the pause, from 21:03 (after the five-hour window). `STATE.md` has the clock.
- First the base was checked on a quiet machine: type check, lint, the unit suite in two time zones, a production build, the golden master
  (pass 5 never recorded it) and the access matrix. The access matrix was made stricter and found a real gap at once.
- Then two rounds of fresh testers (eight in all) looked for problems without seeing each other's notes, and five reviewers tried to break each
  batch of fixes. The reviewers broke several fixes; every break was fixed again and has its own row and test.

## What works now that did not
- An officer can no longer see another department's incidents through Ask District IQ or Ask the Map (by id, by "near this incident", or
  through an empty map answer).
- Only a citizen can file an online complaint; the Collector, officers and the petition desk used to be able to file one as themselves.
- A text a citizen or a newspaper wrote (a complaint title, a headline) can no longer close Ask District IQ's writer's "this is data" fence,
  and a number written in such a title is no longer accepted as a figure for the answer unless it is quoted word for word.
- A cut-off Excel file no longer stalls the whole site, and a crafted PDF no longer holds it for seconds or eats hundreds of MB. A whole but crafted Excel file still can (see "Still broken").
- The Data Studio's headless browser blocks the ways found in this pass to reach this computer's own services (a page's WebSocket, a plain redirect, workers, WebRTC). The final red team found two more (a site that answers the check and the browser differently, and a POST redirect): see "Still broken".
- An online complaint's Aadhaar number is masked on the consoles, as the petition desk already did.
- The "Severe, not yet checked" tile counts the same cases as the list it opens, under the category and taluk filters.
- Petition SMS: a send that may already have reached the provider is never sent twice; approving does not wait on the SMS; the desk names
  the test number when one is set; closing several petitions waits once.
- The desk's "came before" check works for Tamil, counts people not petitions, does not take a stranger with the same name for the same
  person, and no longer offers to join another department's case. A new build keeps a petition case's repeat count.
- A batch instruction from the Collector shows on every case it lists; a staff password change keeps the 12-hour session; the citizen's
  phone menu is readable (contrast).

## Still broken (open; the worst first)
- Jarvis and Ask District IQ without a model: "new complaints today" is answered with this week's cases, and "severe incidents open right
  now" says 0 while the console shows 20 (seen in a browser). Pass 4's "last month" and "up or down" questions, and 7 Tamil/English pairs,
  still give wrong facts.
- The briefing's opening sentence (written by the pipeline days ago) can say "more incidents" when the live figures say fewer; resolving a
  case that was already resolved counts it again as resolved today.
- The reviewers' last breaks: the officer's lock misses joined tables on the model's path; some planted figures still pass the writer's
  check (news headlines cut short); some filler words still join two different petitions; a whole but crafted Excel file, and an XML file of
  comments, can still hold the server thread.
- The Studio browser: a site that answers the check one way and the browser another, or a form POST redirected, still reaches this computer's own services (the final red team).
- Account security found by the second red team: the password-change page does not limit wrong current passwords; "verify mobile" sends the
  code to the e-mail, not the phone; a profile photo is saved in a public folder with a guessable name.
- The petition desk: "+91 98400 12345" is stored as another person's number; in a busy week waiting petitions drop off the list; an urgent
  petition joined to a normal case keeps the normal deadline.
- The rest are listed in `BUGS.json` with how to reproduce each.

## Top 10 things to do next (effort)
1. Decide the items in "Only you" below (an hour of decisions).
2. Parse Studio uploads in a worker thread with a time limit, so no file can stall the site, whatever the parser does (half a day).
3. Put the Studio's headless browser behind a small proxy that refuses private addresses (half a day).
4. Make Ask District IQ's writer take its allowed figures from the structured data only, not from text (half a day).
5. Fix the rules lanes' periods: "today", "right now", "last month", "up or down" (one to two days, with pass 4's test sets).
6. Rate-limit the password change; send the mobile code by SMS or drop "verified"; move profile photos out of public/ (2 to 3 hours).
7. Normalise "+91" and "0" mobiles at the desk and accept only 6-9 starts (1 hour).
8. Hold the officer's lock on every joined table in the planner's queries (1 to 2 hours).
9. Page the desk's list, and give an urgent petition its own deadline when it joins a case (2 hours).
10. Run pass 4's whole real-path suite once on a quiet machine and trace what fails (half a day).

## Only you can do or decide
- Whether to push this branch (and pass 4 and pass 5 under it), and whether to merge into main.
- The petition desk password (P5-006, ready patch in `docs/qa/pass5/patches/`); the closing SMS after a reopen (P5-020); whether a petition
  may join another department's case (P5-021: the desk no longer offers it, the server still accepts it).
- Sign-out ends only that tab's session (Apshana's per-tab design): revoking the token itself needs a list of signed-out tokens.
- The officer's lists show only cases reported inside the chosen period; the Collector may verify, reopen or reject at any stage. Both are
  designs, not bugs, but they hide old open work and tell citizens "checked" when nothing was done.
- PaddleOCR runs before the AI reader by design; running both side by side gives the same result sooner.
- Set `TRUST_PROXY_HOPS` on the server behind the tunnel, so rate limits are per person.
- Rotate the two Groq keys that sit as bare lines in `.env` (from pass 5).

## Not checked
- No live AI model was called. The AI-facing fixes were proven with written model replies or the compiled database query.
- The final gate ran after the five-hour window, at 21:03 to 21:26, because of the usage limit.
- Most open rows (the testers' reports) were not re-run by me; each names its probe in `tests/qa/pass6/known-failures/`.
- The officer's-day browser journey stalled on a page element and proves nothing; the Collector's morning ran in English only.
- Pass 4's whole real-path suite was not run; its tests that start their own servers were not run.
- PaddleOCR live, Edge, Firefox and a fake microphone were not run.
