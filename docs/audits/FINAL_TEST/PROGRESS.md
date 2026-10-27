# FINAL TEST & FIX: progress

Branch `test/final-pass` (from `main` at 4483d25). Prompt: `C:\Users\ELCOT\Desktop\FINAL_TEST_AND_FIX_PROMPT.md`.
Session 1 ran on 27 Oct 2026, 15:50–19:50, as a 4-hour fast track agreed with the owner: the known R and LT items first,
then a broad sweep. The full 21-layer plan continues in later sessions.

## Baseline (commit 4483d25)

| Check | Result |
|---|---|
| vitest | 806 passed, 1 skipped |
| tsc --noEmit | clean |
| golden (AI_PROVIDER=none) | 4 passed, 1 skipped |
| pytest district_intel | 131 passed; scikit-learn 1.8.0 → 1.9.1 warning (R-23) |
| npm run lint | not set up (no ESLint config; B-001) |
| npm audit --omit=dev | 3: next (critical, fix only in 16.x), postcss ×2 (high, via next) |

## Now

| Check | Result |
|---|---|
| vitest | 854 passed, 1 skipped (+48 regression tests) |
| tsc | clean |
| golden (no AI) | 6 passed, 1 skipped (+2 on the frozen real data) |
| pytest | 136 passed (+5) |
| next build (production) | 0 errors |
| scripts/final-test/smoke.mjs | PASS (private APIs 401 without a session, no stack or SQL in refusals) |
| scripts/final-test/security.mjs | PASS (36 checks: traversal, dev pages, headers, wrong methods, malformed bodies, sign-in throttling) |

## Done
- R-01, R-02, R-03, R-04, R-05, R-06, R-09, R-10, R-12, R-13, R-14, R-17, R-19, R-21, R-24, R-25 fixed, each with a
  regression test that failed before the fix.
- R-11, R-18 partly fixed (see BUGS.md).
- R-16 not reproduced on the production build (dev-mode double fetches).
- New bugs found and fixed: B-002 to B-006 (BUGS.md). LT-44 map pins named.
- Verified live on the production build with AI: R-02 (the brief leads with Cyclone Arnab), R-03 (the Tamil "important
  problems" leads with the alert and the Cooum bund breach), R-06 (Studio 31 → 15 cards), R-14 (detail panel 153 ms).
- Memory soak on the production build: see RESULTS.md.

## Next (later sessions)
- R-07 numbers oracle (L6); R-11 "those" keeping the open filter; R-20 forecast card; B-007 Tamil titles in Tamil answers.
- Officer and citizen journeys (need the owner's test logins).
- Layers L2 (full API contract), L5 (every element), L7 (150-question bank), L14 (axe), L15 (widths × themes).

## Questions for the owner
1. **Test logins:** officer test accounts in at least 3 departments (two in different departments). OK to register a
   `FINALTEST` citizen on localhost?
2. **Test packages:** OK to add the dev-only `@playwright/test` and `@axe-core/playwright` on the test branch?
3. **Bedrock key (R-08):** renew with `npm run ai:key` before the demo.
4. **R-22:** bind the dev server to 127.0.0.1, or upgrade to Next 16? (The test server binds to 127.0.0.1.)
5. **R-23:** pin scikit-learn 1.8.0, or retrain the news model?
6. **Lint (B-001):** OK to add `.eslintrc.json` with `next/core-web-vitals` (packages already installed)?
7. **R-15:** on the PC that runs the hourly build, check the log line "incident ids: N of M reports kept their incident
   id". The registry `district_intel/output/state/incident_ids.json` should keep ids across builds.
8. **R-18:** Kolathur taluk has only ward 24 in the reference map. Is there an official ward-to-taluk list?

## Records and files created (test data)
- Chatbot sessions and their audit rows ("assistant:answer"): about 12 questions, in the local in-memory copy only (never
  saved to AWS: AWS_STORE_SAVE is not set).
- No complaints, accounts or Studio files were created. Nothing under data/ was deleted.
- New files: scripts/final-test/{smoke,security,memwatch}.mjs; docs/audits/FINAL_TEST/*; two launch configs.

## Numbers
- Live AI chatbot questions used: 9 (Groq).
