
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
