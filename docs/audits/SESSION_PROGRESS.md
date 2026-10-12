# Improvement session 1 — progress

Branch: `improve/session-1` (created from `main` at `18f78ef`, 2026-10-12). Nothing pushed.
Working tree at start: clean apart from untracked `.agents/`, `.claude/skills/`, `collector-before-after.png` (left untouched).
No `.env` edited, no data under `data/`, `district_intel/output/`, `public/uploads/` touched, no pipeline / model / LLM run.

## Step 0 — baseline (2026-10-12)

| Suite | Result |
|---|---|
| Vitest (`chennai-grievance-portal-main`) | 330 passed, 1 skipped |
| `tsc --noEmit` | clean |
| pytest (`district_intel`), first run | collection error in `tests/test_signals.py`: Windows Application Control blocked a scikit-learn DLL (`_k_means_minibatch`). Environment, not code: the same file ran (11 passed) later in the session. |
| pytest without `test_signals.py` | 77 passed, 2 failed (`test_news_understanding.py::test_details_become_document_columns`, `::test_translated_tamil_headline_joins_the_english_story`) — i.e. the audit's 88 + 2 |

## Improvements

| # | Finding | Status | Commit |
|---|---|---|---|
| 1 | GIS-001 map locations | **done** (browser-verified) | `89fc2a5` |
| 2 | AI-001 guard | **done** | `a48cf37` |
| 3 | KPI-001 effective status | **done** (verified on an isolated in-memory copy; no live decision existed to check) | `5f3d10a` |
| 4 | BE-001 read-only overview | **done** (401s live; authorised path end-to-end on an isolated store with a test key) | `f9693ae` |
| 5 | SEC-002 uploads | **done** (live with seeded test accounts) | `6962cf8` |
| 6 | FRESH-001 freshness | **done** (browser-verified; assistant caveat by test, no LLM called) | `cca4a6c` |
| 7 | TEST-001 pipeline tests | **done** | `3db8221` |
| 8 | SEC-003 safe fetch | **done** | `90c568d` |

After the eight commits, the teammate's `origin/main` (1d074a1, rounds 21–22) was merged into the branch: `d0f9bbe` (two conflicts, both kept from each side). Local `main` was fast-forwarded to `origin/main`. Nothing was pushed.

### 1 — GIS-001: incorrect incident map locations

- **Data conventions checked** (`district_intel/output/curated/incidents.csv`, 27,123 incidents): every incident has a point; precision is 30 m (12,904), 50 m (11,391), 300 m (612), 800 m (332), 1,500 m (1,496), 4,000 m (59), 15,000 m (329, the district centroid 13.0827, 80.2707, no zone). **No incident has a NULL precision.** Loaders: grievance leaves precision empty only when there is no point; police/PWD/hospital/world set 30–50 m. So NULL precision with a point is treated as a precise source point (documented in `mapplace.ts`); it does not occur today.
- **Rule** (`src/lib/collector/mapplace.ts`, shared): pinnable = `lat IS NOT NULL AND COALESCE(loc_precision_m, 0) <= 2000`. Used by the pin query, the legend counts and the list filter.
- **API**: `overview().map.unlocated` (same scope/time filter as the incident counts: `w`) and `map.total`; legend layers now count pinned incidents only, so severe + complaint + other + unlocated = total. `overview().zoneUnassigned` (incidents in the zone table's scope with no zone). `insights().talukUnassigned` (same 30 days as the taluk ranking, no in-district taluk).
- **UI**: legend button "N incidents with no exact place (district-wide or unknown)" opens the existing list (`/api/collector/list?place=unlocated`); zone table row "No zone (district-wide or unknown)" (`place=nozone`); taluk ranking row "No taluk" (`place=notaluk`). No new API, the list route gained a validated `place` parameter.
- **Reconciliation**: zone rows + no-zone row = incidents in the zone-table scope; taluk rows + no-taluk row = incidents in the ranking's scope; legend layers + unlocated = incidents in view. Note: the 59 incidents at 4 km have a zone, so they are in a zone row but are not pinned — "unlocated" (map) and "no zone" (table) are different, each reconciles with its own total. The list counts groups (CLUSTER), as every list already did, so its header can be smaller than the incident count.
- **Tests**: `src/lib/collector/mapplace.test.ts` (6): the 15 km centroid point is not pinnable; 4 km not; 30–2,000 m are; SQL and TS rule share the threshold; place filter parsing.
- **Pending**: browser check on :3001 (pins gone from Park Town/Ripon Building, legend count, list opens, no console errors, screenshot) and the SQL-vs-legend count check.

### 2 — AI-001: assistant refusing normal questions — done (`a48cf37`)

- `src/lib/assistant/guard.ts`: a destructive verb is a command only at a command start (message/sentence start, or after please / can you / go and / now / then / and / also / just / I want (you) to / let's / help me) and with a target; `drop` followed by in/of/by/after/since/over/during/between/across/compared is never a command. Written SQL (`DROP TABLE`, `TRUNCATE TABLE`, `DELETE FROM x`) is refused anywhere. `DATA_WORDS` gained flood(s|ing|ed) and waterlogg*, so "history of flooding…" reaches the router.
- Tests (`__tests__/guards.test.ts`): the 5 legitimate questions + 3 more return `null`; the 5 unsafe requests + 7 more are refused with the right reason. 3 failed before the fix (reproducing the audit), 56/56 after.
- Full Vitest 356 passed / 1 skipped, tsc clean at commit time.
- Limit: "Show the history of Velachery" (a place name, no data word) is still refused as general knowledge; place names are not in `DATA_WORDS`.

### 3 — KPI-001: KPI tiles vs Collector decisions

- `src/lib/collector/effective.ts`: one table of effects (resolve → closed/Resolved, reject → closed/Rejected, reopen → open/Open; verify, escalate, note → no change; the latest non-note decision decides, as the list's `overlay()` did) used by `overlay()` and by `effectiveSql()` (the SQL CASE is generated from the same table).
- Applied in `intel.ts`: KPI tiles (ongoing, open complaints, resolved), severity panel and its counts, bell, zone table open/complaints, no-zone row, top areas, department list, backlog, severity mix, pin open/status, and the list status filters (open, unverified, verified, overdue, critical, and explicit statuses such as "Resolved"), so a tile and the list it opens use the same status.
- Not changed: snapshot/briefing text queries, insights.ts, exports — they still read pipeline status (listed under remaining risks).
- Tests: `src/lib/collector/effective.test.ts` (4).
- **Pending**: controlled check in the browser. Real team decisions must not be changed without permission, so the check is: pick an incident, read KPI + list, (with your OK) resolve then reopen it and confirm both views move together — or confirm on an incident that already has a decision.

### 4 — BE-001: no database writes on page views

- `overview()` no longer calls `routeNewsComplaints()` (the `route` option is gone; the assistant and officer callers updated).
- `routeNewsComplaints()` is exported, runs as a job, and audits every change with the existing `audit()` helper, actor `District IQ news monitor`: `assign` (after = the new assignment row) and `withdraw_assignment` (before = the withdrawn row). Only rows actually inserted / deleted (`affectedRows`) are audited.
- `POST /api/collector/jobs/route-news` (`src/app/api/collector/jobs/route-news/route.ts`), authorised by `x-job-key` = `REFRESH_API_KEY` through `src/lib/jobauth.ts` (`timingSafeEqual` over SHA-256 digests, so unequal lengths are safe; no key configured → always 401).
- Tests: `src/lib/jobauth.test.ts` (4).
- Verified live on :3001: POST with no header, a wrong key, an empty key → 401 (routing not run); GET → 405.
- **Scheduling**: an authorised scheduler calls, e.g. every 15 minutes, `curl -X POST -H "x-job-key: $REFRESH_API_KEY" https://<portal>/api/collector/jobs/route-news` (the GitHub workflow / AWS were not changed). Until a scheduler is set up, news complaints are not routed automatically.
- **Pending**: one authorised run (needs the real `REFRESH_API_KEY`, which is not a test value, so it was not used by Claude).
- Still on the GET path (not in scope, noted): `GET /api/collector/overview` also starts `runDueSources()` / `runDueRefreshes()` in the background, which fetch and store items for added sources.

### 5 — SEC-002: citizen complaint uploads

- `POST /api/complaints/media`: citizen session required (401 otherwise), `checkRateLimit` 20 per 15 min per user (429 + Retry-After), type from the first bytes (`sniffMedia`: JPEG, PNG, MP4 `ftyp`), 10 MB cap kept, stored in `data/private-uploads/complaints/` (or `COMPLAINT_UPLOAD_DIR`) with an owner note; returns `/api/complaints/media/c-YYYYMMDD-<16 hex>.<ext>`.
- `GET /api/complaints/media/[name]`: 401 without a session; allowed for the Collector, the citizen who uploaded it (owner note) or whose complaint it is, and an officer whose `users.department_id` equals the complaint's `department_id`; everyone else and every malformed name → 404. `nosniff`, private cache.
- `validators.ts`: `mediaPath` accepts only a private media URL or the old `/uploads/complaints/complaint-<ms>-<id>.<ext>` form (browser-safe rules in `complaint-media-path.ts`). `POST /api/complaints` refuses a private upload that the citizen did not upload.
- Citizen tracking page: photos (private or old) shown as before; private videos play inline; old links unchanged. `public/uploads/` untouched (it held no complaint files). `data/private-uploads/` is git-ignored.
- Tests: `src/lib/complaint-media.test.ts` (5): JPEG/PNG/MP4 recognised; text renamed `.jpg`, HTML, SVG, GIF, empty rejected; path validator rejects URLs, traversal, other folders.
- Verified live on :3001: anonymous upload of a text file named `.jpg` → 401; anonymous GET of a media name → 401.
- **Pending (needs sign-ins)**: signed-in upload of a valid photo; text-as-jpg rejected for a signed-in citizen (400); owner can view; a second citizen gets 404; the Collector can view.

### 6 — FRESH-001: data freshness disclosure

- `src/lib/collector/freshness.ts`: stale = last successful collection (`source_health.last_success_at`) more than 2 × `freshness_target_min` before the IST wall clock; no target → no verdict; never collected → "has not been collected yet". Message: "News last collected 6 hours ago; today's view may be incomplete."
- `collectionStatus()` returns `stale` (falls back to no verdicts on a store without `freshness_target_min`). `asOf()` is unchanged.
- Console: one line beside the "Collected" chip (`FreshWarn`), only for feeds the current page uses (overview/briefing/trends: grievance, police, PWD, hospital, news; environment: IMD, CPCB, flood monitoring, reservoirs, hospital; Data Studio: none). The most-behind feed is named, others counted, all listed in the tooltip; click opens the data sources.
- Assistant: `staleCaveats()` adds the same line ("…; this answer may be incomplete.") only for stale feeds the answer's tools or tables used (`feedsForAnswer`), and the composer keeps it on the card.
- Tests: `src/lib/collector/freshness.test.ts` (6): a deliberately stale news feed gives the expected message; fresh feeds and exactly-2× give none; no invented times; ordering; IST clock; feed mapping.
- **Pending**: browser check of the line (the live build's CPCB / IMD were stale in the audit) and an assistant answer that uses a stale feed.

### 7 — TEST-001: two failing pipeline tests — done (`3db8221`)

- **Cause (both)**: pandas 3.0.6 is installed (`requirements.txt` says `pandas>=2.2`, so CI and fresh installs get it).
  - *Tamil–English merge (2 vs 1)*: datetimes are stored in microseconds; `astype("int64") / 3.6e12` assumed nanoseconds, so the 24 h window was 1,000× wider and an article 40 h later merged. **The second merge was a wrong grouping; the test was right and is unchanged.** The same conversion was in `dedup.py` (×2), `linking.py`, `incidents.py` (90-day recurrence) and the 48 h story grouping; all now use `util.epoch_hours` (Timedelta-based, unit-independent, as `eventmatch.py` already did).
  - *NaN vs None*: a text column built with `None` becomes pandas 3's `str` dtype (missing = NaN); `ai_status` / `ai_place` are now object columns, so missing stays `None` (SQL NULL).
- New test `test_epoch_hours_ignores_the_storage_unit` (s/ms/us/ns, naive, NaT).
- pytest: **91 passed** (90 baseline + 1 new), including `test_signals.py` once the DLL block cleared.
- Data: nothing regenerated. **Risk**: outputs built under pandas 3 before this fix may contain over-merged news stories, duplicates and links (windows 1,000× too wide); they will correct on the next pipeline build.

### 8 — SEC-003: one safe fetcher — done (`90c568d`)

- `src/lib/netsafe.ts`: `isPrivateIp` (one implementation; IPv4 inside IPv6 in every form incl. `::ffff:a9fe:a9fe`, `::a9fe:a9fe`, `64:ff9b::/96`; ULA, link-local, site-local, multicast, documentation; unparseable = private), `assertPublicUrl` (http(s) only, no credentials in the link, localhost/.local/.internal, every DNS address public, optional allow-list), `safeFetch` (manual redirects with each hop checked, Authorization/Cookie dropped on cross-origin redirects, 303 / POST→GET, size and time caps, per-hop `prepare` for host-scoped sign-ins).
- Used by `addSource` (link and login URL checked before storing), `detectKind`, source login, `runSource` fetch, `fulltext.ts`, Studio `checkHost` / `fetchOnce` (STUDIO_ALLOW_HOSTS kept), and `onboard.ts`. The three old `privateIp` copies are gone.
- Tests `src/lib/netsafe.test.ts` (23): the five required cases plus 10 more address forms, DNS answering private, schemes/credentials, public redirect followed, sign-in not carried cross-origin, caps, allow-list. Existing Studio tests pass. Live: example.com 200 and The Hindu Chennai RSS 200 through the helpers; 169.254.169.254 refused.
- Limit: DNS rebinding between check and connect is not covered (would need the connection pinned; Node's fetch has no lookup hook without a direct `undici` dependency).

## Browser and live verification (after sign-in, 2026-10-12)

Signed in on :3001 with the project's seeded sample accounts (`scripts/seed-users.js`, local test accounts) at the user's request.

- **GIS-001**: for daily / weekly / monthly / quarterly, pinned layers + unlocated = total (185, 1,270, 5,173, 14,479) and zone rows + no-zone = total; zone 5 reconciles (504); taluk rows + no-taluk = 5,172 = the 30-day total; no pin on the centroid; legend opens the list (11 incidents, 6 groups); an invalid `place` is ignored. `ZonesBody` (the zone-table dialog) has no visible trigger in the current console (`openZones` is never called), so its new row was checked through the data only.
- **KPI-001**: none of the logged Collector decisions refers to an incident in the current build (incident ids changed between builds), so no live decision could be checked and none was made. `effective.sqlite.test.ts` runs the tile and list SQL through the AWS store's own MySQL → SQLite translation on an in-memory copy: resolve, note, reopen, reject and verify move the tile and the list together and match the overlay rule. Live overview: 0.8 s daily, 1.7 s quarterly.
- **BE-001**: the team `REFRESH_API_KEY` is a live key and was not used. `route.test.ts` runs the route end to end on an isolated store with a test key (401s write nothing; one assignment added and one withdrawn, both audited; a second run is a no-op). The only writes left in `intel.ts` are inside the job.
- **SEC-002**: live (statuses): anonymous upload 401; Collector upload 401; text-as-jpg 400; valid PNG 200 (stored under `data/private-uploads/complaints`, removed after the check); owner 200 `image/png`; a second (throwaway, local-only) citizen 404; Collector 200; officer of another department 404; anonymous 401; bad names 404. Officer-of-the-department and complaint-owner access are covered by `media/[name]/route.test.ts` (a live complaint would append to `data/datasets/grievances.csv`). Citizen tracking page renders, no new console errors.
- **FRESH-001**: CPCB is 18 h behind its 60-minute target in the live store; the Environment page shows "Air quality (CPCB) last collected 18 hours ago; this page may be incomplete."; Overview, Briefing and Trends (which do not use CPCB) show nothing. Assistant caveat tested with a mocked stale feed (asking the live assistant would call Groq/Gemini).

## Final verification (after the merge, 2026-10-12)

| Suite | Result |
|---|---|
| Vitest | 411 passed, 1 skipped (30 files + 1 skipped) — baseline was 330 / 1 |
| `tsc --noEmit` | clean |
| pytest (all) | 91 passed, 0 failed — baseline 88 passed / 2 failed (+1 new test) |

## Files changed (by improvement)

- GIS-001: `lib/collector/mapplace.ts` (+test), `lib/collector/intel.ts`, `lib/collector/insights.ts`, `app/api/collector/list/route.ts`, `components/collector/app/{Overview,Overlays,Insights,CollectorApp}.tsx`, `collector.css`
- AI-001: `lib/assistant/guard.ts`, `lib/assistant/__tests__/guards.test.ts`
- KPI-001: `lib/collector/effective.ts` (+2 tests), `lib/collector/intel.ts`
- BE-001: `lib/jobauth.ts` (+test), `app/api/collector/jobs/route-news/route.ts` (+test), `lib/collector/intel.ts`, `lib/assistant/tools.ts`, `lib/officer/data.ts`
- SEC-002: `lib/complaint-media.ts`, `lib/complaint-media-path.ts` (+test), `app/api/complaints/media/route.ts`, `app/api/complaints/media/[name]/route.ts` (+test), `app/api/complaints/route.ts`, `lib/validators.ts`, `app/citizen/track-complaints/page.tsx`, `.gitignore`
- FRESH-001: `lib/collector/freshness.ts` (+test), `lib/collector/sources.ts`, `lib/assistant/pipeline.ts` (+`__tests__/freshness.test.ts`), `CollectorApp.tsx`, `marina.css`
- TEST-001: `district_intel/dintel/{util,dedup,linking,incidents}.py`, `dintel/loaders/news.py`, `tests/test_news_understanding.py`
- SEC-003: `lib/netsafe.ts` (+test), `lib/collector/{onboard,sources,fulltext}.ts`, `lib/studio/fetchurl.ts`

(Paths under `chennai-grievance-portal-main/src/` unless shown.)

## Remaining risks and known limits

1. **Pipeline outputs built under pandas 3 before TEST-001** may hold over-merged stories, duplicates and links (time windows were 1,000× too wide). They correct on the next pipeline build; nothing was regenerated here.
2. **News routing now needs a scheduler** to call `POST /api/collector/jobs/route-news`; until then no news complaint is routed automatically.
3. `GET /api/collector/overview` still starts `runDueSources()` / `runDueRefreshes()` in the background (fetch-and-store for added sources) — not in BE-001's scope.
4. Effective status is not yet applied to briefing/snapshot text, `insights.ts` or exports.
5. SSRF: DNS rebinding between check and connect is not covered (needs a pinned connection).
6. Rate limits are in-process (reset on restart; not shared across instances).
7. The zone-table dialog has no trigger in the current UI.
8. The guard still refuses "history of <place>" when no data word is present.

## Questions for you

1. Who schedules `route-news` (GitHub Actions hourly run, AWS, or the PC), and how often?
2. Rebuild the pipeline after merging, or pin `pandas<3` in `district_intel/requirements.txt`?
3. Should the branch be pushed / opened as a PR (nothing has been pushed)?

## Recommended next improvements (Technical Excellence Plan)

- SEV-001: an "Unverified — possibly severe" lane for news incidents with deaths or several outlets, with a Verify action.
- Scope-aware evidence for the assistant's numeric answer verifier.
- Centralised authentication / authorisation (SEC-001 key split; SEC-004 weak defaults).
- AI-002 rules-layer fixes for the brief's example questions; DEDUP-001 near-exact headline merge; LINK-001 measured linker accuracy.
- Apply effective status to briefings and exports; move `runDueSources` off the GET path.
