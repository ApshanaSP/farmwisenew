
## RC-17 (PB-068): fixed
- Root cause: /api/i18n (no sign-in, by the owner's decision) handed req.json() to zod with no size check; zod builds one issue per bad element, so a big array exhausts memory.
- Why earlier tests missed it: routes were only tested with small bodies
- Sweep: docs/qa/pass4/sweeps/RC-17.txt: every other route with no session check (auth/*, map/*, jarvis/say, auth/tab) now reads through the same readJsonCapped helper
- Class guard: lane-c.guards.test.ts fails if a route with no session check reads its body without readJsonCapped
- Three languages: False; real path: unit and route-level (body size is language free)
- Commit: see git log for RC-17

## RC-18 (PB-008, 055, 056, 057, 082, 138, 139, 140): fixed
- Root cause: privacy matched raw text against lists of known forms (one dash, one digit script, "at" and "dot" words, a few Tamil verbs). Anything outside the list (another digit script, an odd space, a zero-width mark, spaced single digits, "அட்", "oru person who complained") passed.
- Why earlier tests missed it: each test used the sentence that exposed a bug; none tried a different Unicode space, digit block or invisible mark.
- Fix: privacy.ts now normalises first (strip format characters, fold every Unicode digit block and every space or dash between digits), then matches. Refusal covers a filer by pronoun, by "person who complained", by what he wrote or said, in English, Tamil and Tanglish, plus record-state changes, money release, obey-the-record and show-your-rules asks.
- Sweep: docs/qa/pass4/sweeps/RC-18.txt (other Tamil-only digit maps live in normalise.ts, numbergate.ts, assistant/verify.ts: outside lane c, left).
- Class guard: src/lib/thunai/privacy.guard.pass4.test.ts walks every Unicode digit block, every space and dash, and invisible marks.
- Three languages: yes (open set: 7 rows rose, 0 right-to-wrong, docs/qa/pass4/results/ledger-open-baseline-codelanes--lane-c-rc18.md).
- Test change: audit-privacy_injection chain test used "what did the person write in INC-..." as an ask the rules let through; that sentence is now (rightly) refused, so the test uses "open INC-... for me".

## RC-19 (PB-009, 010, 011, 083, 084, 097, 165, 166): fixed, except the two spoken-line tests in screens.ts and stagelocal.ts
- Root cause: every kind of model line (chat, refuse, clarify question, clarify button, do reply, answer, general, the older /plan route) had its own partial copy of the checks, so a kind that was left out said what the model wrote. The refusal ran only on round 0. The asked-for-step gate opened on a bare keyword ("what type of", "street light", "Tamil Nadu", "talk to residents", "மறைமலை"). Nothing stopped our police filter being put on for another city's police.
- Why earlier tests missed it: each test drove the one kind of line that had been reported; none drove every kind with the same unsafe content, and none used a sentence that only holds the keyword.
- Fix: one exit gate, src/lib/thunai/exitgate.ts (contact, citizen's name or address, copy of what was read incl. the screen and earlier turns, an order to send/approve/delete), used by finish() for every kind (and its buttons one by one), by answerScreen, by generalReply in round.ts, and by /plan (brain.ts), which now also refuses in code and drops steps not asked for. Refusal in code now runs on every round. The asked-for gate needs the shape of a command, not a keyword. In finish(), a body of another city (resolveEntity says outside) never gets our department filter. privacy.ts reads Tamil and Tanglish approve verbs, "mark INC-... as resolved", "tray", and "ignore the rules" in Tamil.
- Sweep: docs/qa/pass4/sweeps/RC-19.txt (all model callers; the dev routes call the same functions).
- Class guard: src/lib/thunai/exitgate.guard.pass4.test.ts (kinds of line x kinds of unsafe content x three languages, plus bare-keyword sentences for every step kind).
- Three languages and real path: yes. Open set before and after with the grader: 7 rose, 0 right-to-wrong (docs/qa/pass4/results/ledger-open-baseline-codelanes--lane-c-rc19.md).
- Not fixed here: audit-privacy_injection-4 and -11 (a place field or a title read out on a line that screens.ts and stagelocal.ts build with no model). Those files belong to another lane; the tests stay it.fails. The exit gate cannot reach them because they never pass through finish().
- Test change: it.fails changed to it for audit-privacy_injection-3, -5, -6, -7, -12, the realgate chain test (-1) and audit-understanding-18; props.pass4.test.ts only got a readonly type fix.

## RC-20 + RC-21 (PB-001, PB-147): fixed in code and unit tests; the three e2e rows are changed to run but not run in a browser yet
- RC-20 root cause: with no model, rulesAsk turned a named measure into a sum only when the words "total", "sum", "how much", "cost"... were in the sentence, so "most fever cases" stayed a count of report rows. A table of one row per hospital per week silently got a "latest period" filter, so "how many rows" said 16 of 400 and no answer said it covered one week. A Tamil question had no words the rules read, so it fell through to a row count, with the same confident sentence.
- RC-20 why missed: tests asked the questions that had words from the rule list, on files without a panel column, and only checked that something was answered.
- RC-20 fix: a measure column that the question names (all its words, or the one word no other measure has) is summed; a plain row count is the whole file; an engine-added latest window is said in the answer (English and Tamil); a Tamil question with nothing the rules read is answered "I cannot read this", never a row count.
- RC-21 root cause: a link that goes through the picker saves its list and its sign-in under a token. Nothing removed them: deleting the dataset removed files by the dataset's own id, and dropVault had no caller.
- RC-21 why missed: the delete was tested for the dataset's own files, not for what the flow saved under another id.
- RC-21 fix: a dataset made from a picker records its token (.pickof), and deleting the dataset removes the token's list and sign-in; deleteConnector drops the vault; and anything saved for an id that never became a dataset is swept after a day (also on every new pick).
- Sweep: docs/qa/pass4/sweeps/RC-20-21.txt. Other encrypted secrets (collector/sources.ts, onboard.ts) live in database rows that go with their row.
- Class guards: src/lib/studio/ask.pass4.test.ts (every sample file: a named measure is summed, not counted) and src/lib/studio/secrets-kept.pass4.test.ts (every file kind in the store header is removed by delete or the sweep; dropVault has a caller).
- Three languages: English, Tamil script and Tanglish are tested at the rules level on the real fever sample. The real server path (browser tests audit-client_browser-13, test.fail removed) is run after the final build.
- Tests: scans-code-4 (two) it.fails to it; the three audit-client_browser-13 browser tests lost test.fail().
