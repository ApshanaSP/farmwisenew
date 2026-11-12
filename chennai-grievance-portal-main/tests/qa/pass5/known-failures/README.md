# QA pass 5: known failures

Tests for bugs that are open at the end of pass 5 (`docs/qa/pass5/BUGS.json`, status `open` or `owner`). They are not part of the unit suite and
are never skipped there. Run them with:

    npx vitest run --config vitest.p5probe.config.ts tests/qa/pass5/known-failures

- `manu-logic-repeat.probe.test.ts` and `manu-logic-store.probe.test.ts`: written by the manu-logic hunter; each test states the behaviour the
  desk needs, so a failing test is an open bug (P5-018, P5-019, P5-030, P5-031). Tests for bugs fixed in pass 5 (ML-14 closed case, ML-15, ML-17)
  now pass.
- `sms.probe.test.ts`: written by the sms-ocr hunter. Its "F:" tests document the current behaviour of an open SMS bug (they pass while the bug is
  there): P5-020 (frozen closing SMS, owner), P5-022, P5-023, P5-024. The F tests for P5-012 (fixed) now fail, which is the fix showing.
- `manu-sec.probe.test.ts`: written by the manu-sec hunter. It documents behaviour as found (each test passes while its bug is there); the
  tests for bugs fixed in pass 5 (desk login reach, tracker notes, repeats lookup, logs) now fail, which is the fix showing. Still open:
  P5-027 (shared rate-limit bucket), P5-028 (PDF expansion), and the P3s in P5-033.
- `reviewer2-p5-019-sewage.test.ts`: written by the second reviewer; documents P5-037 (passes while the bug is there).
