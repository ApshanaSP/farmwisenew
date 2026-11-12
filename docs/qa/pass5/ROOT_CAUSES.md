# QA pass 5: root causes

Each cluster: what went wrong, why earlier tests missed it, and the guard that now stops it. Bug ids are rows in `BUGS.json`.

## 1. Two branches, each right alone, wrong together (merge seam)
**Bugs:** P5-001, P5-002, P5-008, P5-010, P5-013, P5-015.
Main's three commits (Manu Desk, click-feedback layer) were written against Next 14, React 18 and the pre-pass-4 helpers. Pass 4 had moved the app to Next 15.5 and added rules (RC-17 body caps, RC-35 cache epoch, RC-49 fonts, PB-316 soft confirm answer). Git merged every file cleanly except four, so nothing flagged:
- Next 15 route `params` are Promises (P5-002); Next 15.5 middleware cuts request bodies at 10 MB (P5-008);
- pass 4 removed `FONTS` while main used it (P5-001);
- pass 4's "confirm first" answer is a 200 with a header, and main's layer reads any 200 as success (P5-010);
- main's new public route and new case writer did not follow pass 4's RC-17 and RC-35 rules (P5-013, P5-015).

**Why missed:** each branch's tests ran only on that branch; pass 4's class guards (`tests/qa/pass4/`) are not in the default suite, so main never ran them, and pass 4's access matrix read the Manu routes as public (P5-036).
**Guards now:** `src/app/pass5.seam.test.ts` (params are awaited everywhere; no Google Fonts link; the middleware body limit covers the desk and media limits); `src/lib/activity/confirm.pass5.test.ts`; pass 4's RC-17 and g2-cache guards now pass on the merged tree and know main's `manuStaff()`. **Lesson for the owner:** run `vitest.qa4.config.ts` as well as the default suite before merging.

## 2. Number fields read as "all the ASCII digits in the string" (Manu Desk)
**Bugs:** P5-007 (P0), and the P3 note on Tamil-keyboard digits in input boxes.
JavaScript's `\d` is ASCII only, so Tamil and full-width digits vanished; a ward "Ward 7 (Zone 6)" became 76; an ISO date became a different valid date; a 12-digit Aadhaar read into the mobile box was kept whole; the Aadhaar mask allowed one separator only; the approval masked the address in one table but not the others.
**Why missed:** the tests used tidy input. **Guard:** `src/lib/manu/clean.pass5.test.ts` (22 messy inputs) and the store test that searches every stored table for the Aadhaar digits.

## 3. Personal data reaching people who should not see it
**Bugs:** P5-009 (public tracker returned staff notes), P5-014 (anonymous complaints at the desk; any-id phone lookup), P5-011 (desk login reached Jarvis, map and traffic), P5-029 (petitioner details in logs), P5-006 (owner: published desk password).
Each feature was built for its main user and its edges were not asked "who else can reach this?". **Guards:** allow-list of public step words in `track.ts` (not a word filter); `is_anonymous` in the lookup; `assistantSession()` refuses COL-PET (access matrix now has a desk identity); `manuFailed()` logs codes for database errors. The access matrix (`tests/qa/pass4/access-matrix.mjs`) covers all 120 routes and the desk identity.

## 4. Sends that are not idempotent (petition SMS)
**Bugs:** P5-012 (fixed: double send across processes, stale closing result, non-saving copies, SMS_MODE=off), P5-022, P5-023, P5-024 (open), P5-020 (owner).
An in-memory flag guarded a sweep that runs in every server process; a stored result was reused after the facts changed; "test copy" meant only the dry-run flag. **Guard:** `src/lib/manu/sms.pass5.test.ts`, including the standing proof that no SMS or mail leaves under the QA settings. Still open: provider-side idempotency (P5-022) and a time limit on the inline send (P5-023).

## 5. Tests pinned to the day they were written
**Bugs:** P5-003 (news routing test went red on 10 Nov), P5-004 (SMS test depended on the process env and order), P5-035 (slow test near its time limit).
**Guard:** the fixed tests hold their clock and env; the suite runner `tests/qa/pass5/suite.mjs` runs shuffled under two time zones. A run under a frozen future clock was not done (see the report).

## 6. Repeat detection written for tidy English input (Manu Desk)
**Bugs:** P5-018, P5-019 (fixed), P5-030, P5-031 (open), P5-016 (fixed: closed case), P5-021 (owner).
The SQL prefilter was narrower than the matcher (exact name), online complaints carried no department, and a closed case could be joined. **Guards:** store tests for name variants, online same-problem and closed-case attach; the hunter's remaining probes are in `tests/qa/pass5/known-failures/`.
