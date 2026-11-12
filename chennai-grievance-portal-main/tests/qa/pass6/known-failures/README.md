# QA pass 6: known failures and the agents' probes

Every probe the pass 6 hunters, reviewers and the lead wrote, one folder per agent (`redsec2`, `console-sync`, `officer-day`, `journeys`,
`pass4-open`, `hunt2-sec`, `hunt2-ops`, `hunt2-desk`, `reviewer1` to `reviewer5`, `lead`). They are not part of the unit suite and are never
skipped there. The rows of `docs/qa/pass6/BUGS.json` point at them in their `repro`.

    npx vitest run --config vitest.p6probe.config.ts tests/qa/pass6/known-failures/<folder>     (the .test.ts files)
    node tests/qa/pass6/known-failures/<folder>/<script>.mjs                                     (the .mjs scripts: most need the test server on 3106)

Read before running a whole folder:
- A probe states either the behaviour the product needs (it fails while the bug is open, and passes once fixed) or the behaviour the agent
  found (it passes while the bug is there, and fails once fixed). Each file's header says which.
- Some files reproduce a hang on purpose and must only be run in a child process under `timeout 30`: `reviewer3/p8-*.test.ts` (fixed by
  P6-018/P6-030, so they now finish), `reviewer5/zip-intact.test.ts` (a whole ZIP with a crafted deflate entry still hangs), and
  `reviewer5/parse-slow.test.ts` (an XML of comments).
- The tests that need the pinned snapshot sit in `pass4-open/tests/qa/pass4/` and run with
  `QA_PIN_PORT=3197 npx vitest run --config vitest.qa4.config.ts --dir tests/qa/pass6/known-failures/pass4-open <file>`.
- The `.mjs` scripts sign in through `tests/qa/pass6/lib/live.mjs` and never print a password, cookie or token. The journey scripts
  (`journeys/j1.mjs`, `j2.mjs`, `j3.mjs`) write screenshots to `docs/qa/pass6/evidence/journeys/` and results to `$JOURNEYS_OUT`.
- Two files carry `// @ts-nocheck` (type errors in their own helpers): `pass4-open/live-3106.test.ts`, `pass4-open/studio-parse.test.ts`.
