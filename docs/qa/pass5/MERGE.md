# Merging pass 4 into main

`git merge --no-ff 7279522` (tip of `claude/qa-pass4-ecfcb9`) into `d45cf96` (main). Merge base `abef9da`. Main was 3 commits ahead of the base, pass 4 was 102. Done in about 10 minutes, 09:24 to 09:34 IST, 12 Nov.

## Conflicts (4 files), and how each was resolved

| File | Main (d45cf96) | Pass 4 (7279522) | Resolution |
|---|---|---|---|
| `src/app/api/auth/logout/route.ts` | Looks the account up only when the portal cannot be told, so sign-out does not wait on the store. Calls `resolvePortal()` synchronously (Next 14). | Next 15 upgrade (RC-22): `resolvePortal()` and `clearAuthCookie()` are async; still always looked the session up. | Both: main's "no store lookup when the portal is known", with pass 4's `await resolvePortal()` and `await clearAuthCookie()`. |
| `src/components/collector/app/Detail.tsx` | Imports `PetitionOriginal` (Manu Desk) | Imports `sevLabel` (severity label fix) | Both imports kept. The rest of the file auto-merged. |
| `src/components/collector/app/thunai/jarvisswitch.css` | The earlier-questions panel `.jq` moved out of `.dic` to the page, one layer above Jarvis (`z-index: 2147482996`), with a `.jq-tall` class. | `.dic .jq` with `z-index: 75`; the tall position adds `env(safe-area-inset-bottom)` (phones with a home bar). | Main's layout and layer, with pass 4's safe-area inset added to `.jq.jq-tall`. |
| `src/lib/collector/sources.ts` | OCR sources left out of the source list (`WHERE kind <> 'ocr'`): the OCR route was removed. | `source_health.kind` selected, so generated feeds are labelled test data, not Healthy (RC-32). | Both: main's `WHERE kind <> 'ocr'` and ordering, plus pass 4's `kind` column. |

## Seams the merge left broken (not textual conflicts)

Git merged these files cleanly, but the result did not build. Each is a bug in `BUGS.json`, fixed in its own commit after the merge commit.

| Bug | What broke | Why |
|---|---|---|
| P5-001 | `src/app/officer/page.tsx`: `Cannot find name 'FONTS'` (tsc). | Pass 4 (e927d66, RC-49) removed the `FONTS` constant and the Google Fonts links; main's new Manu counter branch still used them. |
| P5-002 | `api/manu/case/[incident]`, `api/manu/petitions/[id]` (GET and POST), `api/manu/photos/[name]`: `params` typed as a plain object. `next build` on Next 15 rejects this type and the segment is read without being awaited. | Main's Manu Desk was written for Next 14; pass 4 moved the app to Next 15.5. |

The merge commit itself therefore does not type-check; the two fix commits right after it restore a clean type check. The class guard `src/app/pass5.seam.test.ts` fails on the merge commit and passes after the fixes.
