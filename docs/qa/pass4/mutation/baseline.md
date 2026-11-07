# Mutation testing: baseline (NOT FINISHED)

Setup is done and works: tests/qa/pass4/stryker.conf.mjs, stryker.vitest.config.mjs, mutation-report.mjs.
Stryker instrumented all 17 critical modules (6876 mutants) and the dry run passed (465 tests).
The mutation run itself did not finish inside the 30 minute limit, so there are NO scores and NO survivors yet.
Two earlier tries failed on setup (sandbox missed data/gcc-reference; canaries test needs data/aws-cache) and one wasted time on 2106 static mutants (now ignoreStatic: true).
To finish: from chennai-grievance-portal-main run
  MUT_LABEL=baseline node tests/qa/pass4/with-lock.mjs stryker 1 -- npx stryker run tests/qa/pass4/stryker.conf.mjs
then  node tests/qa/pass4/mutation-report.mjs baseline  (writes this file with scores and the 30 survivors).
Not run: every module. outside.ts has no unit test of its own. deptscope.test.ts was left out (needs the fixtures server).
