# QA pass 5: summary for the owner

This is the short version. The numbers are in `FINAL_REPORT.md` (made by a script, not typed). Nothing was pushed, merged into main, or opened as a pull request.

## What happened
- Pass 4's fixes were joined onto the newest main on the branch `claude/qa-pass5-05abfd`. Four files clashed; each kept both sides.
- Six problems came from the join itself: things that worked on each branch alone but broke together. All six are fixed.
- The new Manu Desk (paper petitions), its SMS, public tracking and the click-feedback layer were tested for the first time. Most of the serious problems were there.

## What works now that did not
- The officer page and the Manu Desk build and run on the newer Next.js that pass 4 brought in.
- Scanned petitions and large complaint videos over 10 MB upload again.
- A whole Aadhaar number is no longer stored when the reader or the officer puts it in the wrong box, or writes it with dashes, Tamil digits or line breaks.
- Dates, wards and phone numbers on petitions are read correctly in Tamil and full-width digits, and doubtful ones are marked for checking.
- Public tracking shows standard words for each step, never what staff typed.
- The desk's "has this person written before?" check no longer shows anonymous online complaints, and finds the same person when the name is written a little differently.
- Petition SMS go out once, say the right result, and never go out from a test or teammate copy of the site.
- "Your decision has been recorded" no longer appears while the password box is still open.
- The petition desk login opens only the desk, not Jarvis, the map or traffic.

## Still broken (open)
- Repeat-check wording and some matching rules for messy input (P5-030), and a rebuild losing a case's repeat count (P5-031).
- SMS: a send the provider accepted late can be sent again (P5-022); approval waits for the SMS with no time limit (P5-023); the desk shows the petitioner's number when a test number is set (P5-024); Tamil SMS name the department in English (P5-025).
- PaddleOCR runs before the AI reader, so a slow PaddleOCR delays every petition (P5-026).
- Rate limits are shared by every visitor unless `TRUST_PROXY_HOPS` is set (P5-027).
- A small PDF can expand to a very large size in memory before it is refused (P5-028).
- Ten of pass 4's own tests fail on the joined branch and were not traced (P5-034).

## Top 10 things to do next (effort)
1. Decide on the desk password (P5-006) and apply the ready patch, then change the password once (15 min).
2. Rotate the two Groq keys that sit as bare lines in `.env`, and delete those lines (10 min).
3. Run wave 2: pass 4's open list, the security red team, and a second hunt (half a day).
4. Trace the 10 failing pass-4 tests (P5-034) against pass 4's own branch (1 to 2 hours).
5. Record the golden master on a quiet machine (1 hour).
6. Make approval not wait for the SMS, and give the mail a time limit (P5-023) (1 hour).
7. Run PaddleOCR beside the AI reader, not before it (P5-026) (1 to 2 hours).
8. Set `TRUST_PROXY_HOPS` on the server behind the tunnel (P5-027) (15 min, with a test).
9. Cap PDF image expansion (P5-028) (1 hour).
10. Fix the repeat-check wording and the rebuild (P5-030, P5-031) (2 to 3 hours).

## Only you can do or decide
- Whether to push this branch, and whether to merge it into main.
- The desk password (P5-006), the closing-SMS correction (P5-020: needs a new DLT template or a rule to text only after the Collector's check), and whether a petition may join another department's case (P5-021).
- Rotating the two Groq keys.

## Not checked
- Wave 2 (see above), the golden master, the live PaddleOCR server, any live model call, Edge and Firefox, and a fake-microphone run.
- Pass 4's real-path suite was run once before most fixes, not again at the end.
