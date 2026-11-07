
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
