# Findings — District IQ audit (2026-10-08)

Read-only audit of `D:\farm`. Confidence labels: **Verified** (a query, test or request was run), **Static** (read in code, not executed), **Hypothesis**.
Data figures come from the live AWS build cached on this PC (`chennai-grievance-portal-main/data/aws-cache`, as_of 2026-10-08 18:08 IST), copied read-only into a scratch database.

Severity: Critical / High / Medium / Low. Ordered by priority.

---

## P0 — must fix

### DATA-001 · Data · Critical — The Collector cannot tell real records from synthetic ones, and almost everything is synthetic
- **Observed:** 26,818 of 27,699 incidents (96.8%) contain synthetic records. **All 819 Severe incidents are synthetic.** All 222 multi-source incidents are synthetic, and 191 of them were planted by the scenario overlay. In the durable store, 8,110 of 8,114 complaints are synthetic; 4 are real.
- **Expected:** every incident, KPI, map pin and briefing line says whether it rests on real, synthetic or derived data.
- **Evidence:** query `SELECT severity_level, COUNT(*), SUM(is_synthetic_any) FROM incidents GROUP BY 1` → Severe 819/819. `grep -rn is_synthetic src/components` finds only Data Studio sample tags; the Collector console (`src/components/collector/app/*`) never reads `is_synthetic_any` / `is_overlay_any`. Only the assistant reads them (`src/lib/assistant/queries.ts:70-89`, `tools.ts:73`).
- **Root cause:** `district_intel/dintel/world.py` (scenario overlay) plants departmental records, including records dated *a few hours before real news stories* ("News-anchored incidents", world.py header, lines 1–15). The flags exist in the data, but the UI drops them.
- **Impact:** the critical-incident list, My Tasks (Severe only, `intel.ts:139` `FOR_COLLECTOR`), "AI Take action" and the cross-source "seen by several sources" signal are generated data shown as operational fact. A judge who asks "is this real?" exposes it at once.
- **Fix:** add a provenance badge on every incident card, KPI and briefing line (Real / Synthetic / Overlay / Mixed), a global "Real data only" toggle that filters `is_synthetic_any = 0`, and a banner on the overview stating the real/synthetic split. Turn the overlay off by default for demos, or label it "scenario".
- **Effort:** Medium (one column is already on every row; UI chips plus a scope flag passed through `scopeWhere`). **Confidence:** Verified.

### SEC-001 · Security/Privacy · High — Every copy of the website downloads all users' password hashes and citizens' personal data through one shared key
- **Observed:** the durable store sent to every PC (`data/aws-cache/durable-*.sqlite`) holds `users` (38 rows, with `password_hash`) and `complaints` (names, mobile numbers, street addresses, email). It is fetched with a single team-wide `REFRESH_API_KEY` that also sits in GitHub Actions secrets and in every teammate's `.env`.
- **Evidence:** table and column listing of the durable file (names only, no values read). `src/lib/aws/store.ts` header (lines 1–22): "POST /store/load hands over [the website's own data]". `README.md` "Quick start": teammates copy the key into `.env`.
- **Impact:** a laptop loss or a leaked key exposes every account hash and every citizen's PII. It also conflicts with the brief's privacy expectations.
- **Fix:** split the API: a read-only intel snapshot key for teammates, while the durable store is served only to the saving server. Strip `password_hash` and complaint PII columns from `/store/load` for non-owner copies (or return masked views), give each person their own key, and rotate the current key.
- **Effort:** Medium. **Confidence:** Verified (structure); key distribution Static.

### SEC-002 · Security · High — Unauthenticated file upload into `public/`
- **Observed:** `POST /api/complaints/media` has no session check. It trusts the browser-declared MIME type (`file.type`) and writes into `public/uploads/complaints/`, which Next serves to anyone.
- **Evidence:** `src/app/api/complaints/media/route.ts` (whole file; no `getSessionFromCookies`). Not executed: running it would write files.
- **Impact:** anyone can fill the disk (10 MB per request, no rate limit) or host arbitrary bytes under the portal's domain with an image extension. Citizen complaint photos are publicly fetchable by URL.
- **Fix:** require a citizen session, add a rate limit, sniff magic bytes, store outside `public/`, and serve through an authorised route (the officer photo route `api/officer/photos/[dir]/[name]` is already the right pattern).
- **Effort:** Small. **Confidence:** Static (strongly supported).

### GIS-001 · GIS · High — 58% of news incidents are drawn as exact pins on one fallback point
- **Observed:** 501 of 856 news-only incidents have `loc_precision_m = 15000`, the coordinates 13.0827, 80.2707 (city centroid), and no zone, ward or taluk.
- **Evidence:** query on `incidents WHERE sources='news'`. The overview pin query `intel.ts:745-751` selects `i.lat IS NOT NULL` with no precision filter. `grep precision src/components/collector` → no matches.
- **Impact:** the map shows a false hotspot at Park Town/Ripon Building; zone and taluk filters silently drop these incidents (zone is NULL), so area totals undercount.
- **Fix:** do not plot points with `loc_precision_m > 2000`; list them as "District-wide / place unknown" with a count on the map legend; add an "unlocated" bucket to the zone and taluk tables.
- **Effort:** Small. **Confidence:** Verified.

### BE-001 · Backend · High — A GET request deletes and inserts operational records
- **Observed:** `GET /api/collector/overview` calls `overview()`, which calls `routeNewsComplaints()`. That function `DELETE`s automatic assignments that no longer pass the classifier and `INSERT IGNORE`s new ones into `dept_assignments`, at most once a minute, from whichever tab polls.
- **Evidence:** `src/lib/collector/intel.ts:576-619`, called at `:706`.
- **Impact:** department work queues change as a side effect of someone viewing a page. A classifier change between builds silently withdraws assignments. Concurrent readers race, and the change is not audited.
- **Fix:** move routing into the pipeline or a scheduled job, write an `audit_log` row per assign/withdraw, and keep GET handlers read-only.
- **Effort:** Small–Medium. **Confidence:** Static.

### KPI-001 · Analytics · High — KPI tiles ignore the Collector's own decisions
- **Observed:** `kpiBlock()` counts `is_open` / `status_std` straight from `incidents`. Decisions (resolve, reject, reopen) are applied only to row lists through `overlay()`.
- **Evidence:** `intel.ts:673-697` (no join to `collector_decisions`) vs `intel.ts:651-660` (`overlay`).
- **Impact:** after the Collector resolves an incident, the list shows Resolved, but the "ongoing" and "resolved" tiles do not change until the pipeline rebuilds. The numbers disagree on one screen.
- **Fix:** apply the same `DECIDED` logic in the KPI SQL, or materialise an effective status view used by both.
- **Effort:** Small. **Confidence:** Static.

### AI-001 · AI · High — The code guard refuses ordinary Collector questions
- **Observed (run):** "Why is there a drop in complaints this week?" → refused as **data change**. "Show the history of flooding in Velachery" → refused as **off-topic (general knowledge)**.
- **Evidence:** deterministic benchmark (`FUNCTIONAL_TEST_MATRIX.md` §B). Regexes in `src/lib/assistant/guard.ts` `UNSAFE` ("drop … complaints") and `TOPICS` ("history of"). The guard runs before any model (`pipeline.ts:735-739`), so the LLM never gets a chance to correct it.
- **Fix:** run the destructive-verb rule only on imperative forms (verb at the start, or followed by a determiner and object); remove "history of" from general knowledge when a data word is present. Add both sentences to the guard tests.
- **Effort:** Small. **Confidence:** Verified.

### TEST-001 · Quality · Medium — The pipeline test suite fails on the current working tree
- **Observed:** `district_intel` pytest: **2 failed, 88 passed**. `test_news_understanding.py::test_details_become_document_columns` (NaN vs None) and `::test_translated_tamil_headline_joins_the_english_story` (2 Tamil-English merges where 1 is expected, a possible over-merge).
- **Evidence:** run output in `AUDIT_PROGRESS.md`. The failing code is uncommitted (`git status`: `dintel/eventmatch.py`, `placerole.py`, `newseval.py` untracked; `loaders/news.py`, `embed.py` modified).
- **Impact:** the news fix #3 work is unversioned, and one failure suggests that different events may now be merged.
- **Fix:** investigate the extra merge before trusting the new grouping, fix the None/NaN, and commit.
- **Effort:** Small. **Confidence:** Verified.

---

## P1 — high-impact

### SEV-001 · Incident intelligence · High — Real fatal incidents can never be Severe
- **Observed:** all 60 real news incidents with deaths are High, with reason "Capped at High until a department or officer confirms it". Severe therefore contains only synthetic departmental records (DATA-001).
- **Evidence:** query on `incidents WHERE sources='news' AND dead>0`; rule in `district_intel/dintel/severity.py`.
- **Impact:** a hacking death in Mylapore or two electrocution deaths do not reach My Tasks or the severe-only views. The cap is a reasonable trust rule, but its effect is that real events are invisible to the Collector's top queue.
- **Fix:** keep the cap, and add a separate "Unverified — possibly severe" lane (deaths ≥ 1, or ≥ 2 independent outlets) that does surface on page 1 with a "Verify" action.
- **Effort:** Small. **Confidence:** Verified.

### DEDUP-001 · Incident intelligence · Medium — News duplicates still split into several incidents
- **Observed:** 47 headlines appear on more than one news incident in the live build. In the older local build (4 Oct), one Pattinapakkam Secretariat protest was 68 incidents; the live build has 2 (news fix #3 helped).
- **Evidence:** `SELECT title FROM incidents WHERE sources='news' GROUP BY title HAVING COUNT(*)>1` → 47.
- **Impact:** inflated incident counts and "recurring issue" signals; the incident table is not one row per event.
- **Fix:** add an exact and near-exact headline (simhash) merge within 72 h before the embedding/LLM stage, and measure dedup precision/recall on a labelled set (see roadmap).
- **Effort:** Small. **Confidence:** Verified.

### LINK-001 · AI/Data · High — The cross-source linker has no measured accuracy on real data
- **Observed:** the linker is trained and scored on the overlay's planted pairs. The README states "Linking on real data: unmeasured until the real-pair labels are filled in", and that spot checks found mostly coincidences.
- **Evidence:** `district_intel/README.md` "Known limits"; `reference/labels/link_pair_labels.csv` is to be filled in by a person.
- **Impact:** "correlation across sources", a headline capability of the brief, has no evidence of working.
- **Fix:** label 150 real pairs (the tooling exists: `run_pipeline.py link-labels`) and report precision/recall in the UI's "How accurate is this?" panel.
- **Effort:** Small (labelling time). **Confidence:** Verified (doc).

### AI-002 · AI · Medium — The keyword fallback misreads several of the brief's own example questions
- **Observed (run, rules layer only):** "List the taluks with the highest number of unresolved incidents during the last month" → INCIDENT_COUNT. "Show incidents reported by more than one newspaper but missing from the connected departmental application" → NEWS_TOP (expected NEWS_ONLY_GAPS). "Which areas had the highest number of serious incidents during the last seven days?" → INCIDENT_COUNT. In the Scenario E follow-ups, "Why is that area showing more incidents?" → INCIDENT_LIST, refinement=false.
- **Where it matters:** these rules decide the answer whenever the LLM is unavailable or busy (`pipeline.ts:758-763`, `:806-813`). Per project notes, Groq free-tier limits cause this often. With the LLM up, the router decides, which was **not verified** end to end.
- **Fix:** add the brief's seven example questions and the Scenario E chain to `__tests__/eval/intents.json`; give "why" priority over "show" when both appear; treat "only X" / "compare with previous" as refinements even when an incident noun is present.
- **Effort:** Small. **Confidence:** Verified (rules layer).

### AI-003 · AI/Security · Medium — On the active backend, the assistant's read-only and timeout guards are no-ops
- **Observed:** `runCompiled` relies on `START TRANSACTION READ ONLY` and a `MAX_EXECUTION_TIME` hint. In AWS mode, `store.ts:546` treats `START TRANSACTION READ ONLY` as a no-op, and SQLite has no execution-time hint.
- **Impact:** safety rests entirely on the compiler emitting only SELECTs, which it does (plan → parameterised SELECT; `compile.ts` header). A heavy query, however, can block the single Node process that serves everyone.
- **Fix:** open a separate read-only SQLite connection (`DatabaseSync(..., { readOnly: true })`) for compiled queries, and use `sqlite3_progress_handler`-style interruption or a worker with a timeout.
- **Effort:** Medium. **Confidence:** Static.

### SEC-003 · Security · Medium — Adding a source through the API bypasses the private-network (SSRF) check
- **Observed:** the onboarding wizard checks every hop (`onboard.ts:59-105`), but `POST /api/collector/sources` → `addSource()` → `detectKind()` / `runSource()` uses plain `fetch` with default redirects and no host check (`sources.ts:94-107`, `:131`, `:220`, `:253`). `collector/fulltext.ts:44` also fetches news-feed URLs with `redirect: "follow"`. Studio's IPv6-mapped check misses `::ffff:169.254.*` and `::ffff:172.16/12` (`studio/fetchurl.ts:43-50`).
- **Impact:** a Collector session (or a CSRF-style request) can make the server read cloud metadata or internal services, and stored items show the response. Needs Collector auth, so Medium.
- **Fix:** route every outbound fetch through one `safeFetch` (the onboard version); share a single `privateIp()` that normalises IPv6-mapped addresses.
- **Effort:** Small. **Confidence:** Static.

### SEC-004 · Security · Medium — Weak defaults
- `src/lib/jwt.ts:8`: falls back to `"dev_only_insecure_secret_change_me"` when `JWT_SECRET` is unset; `.env.aws.example` ships `change-me-to-a-long-random-text`. Fail closed in production instead.
- `src/lib/db.ts`: `ssl: { rejectUnauthorized: false }` for URL connections.
- Rate limits and AI token budgets live in process memory (`lib/rate-limit`, `gateway.ts:166`); they reset on restart and are not shared across instances.
- No CSRF token. Cookies are `SameSite=Lax`, which protects most POST routes, so this is Low.
- **Confidence:** Static.

### FRESH-001 · Trust · Medium — Freshness is shown per feed, not per item
- **Observed:** `source_health` shows CPCB stale (543 min) and IMD degraded in the live build. Incident and story rows carry `first_reported_at` but no "collected at" / "source published at" pair. The console's "now" is the wall clock (`intel.ts:67-75`), so if the pipeline stops, Daily shows an empty, quiet district rather than a "data stopped" warning. The file's header comment (`intel.ts:7`) still says "now is the pipeline's as-of", which contradicts the code.
- **Fix:** add a page-level banner when the newest record is older than 2× the refresh interval, and show "published / collected" on each evidence row.
- **Effort:** Small. **Confidence:** Verified (health) / Static (UI).

### GIS-002 · GIS · Medium — Taluks are derived from synthetic data, not official boundaries
- **Observed:** each ward is assigned one taluk by majority vote of coded points (`ref_wards.taluk_vote_share`); the coded points come from the synthetic police/PWD generators. Kolathur gets 1 ward; Tambaram (Chengalpattu district) still has 4 incidents.
- **Impact:** taluk drill-down, a named requirement, depends on an approximation the Collector cannot see.
- **Fix:** use the official taluk boundary layer (FarmwiseAI said it would supply hierarchy and boundaries); until then, label taluk figures "approximate (ward-majority)".
- **Effort:** Medium. **Confidence:** Verified (data) / Static (method).

### OPS-001 · Operations · Medium — Audit history can silently lose entries
- `audit()` swallows insert failures with a console warning (`sources.ts:31-36`). The brief asks for an audit history for every important finding; failed audits must at least surface (a health counter) or fail the action.
- **Confidence:** Static.

### CODE-001 · Maintainability · Medium — Two SQL dialects behind one interface
- The app writes MySQL and runs it on SQLite through a translation layer (`src/lib/aws/dialect.ts`, 495 lines) plus runtime build hooks that rewrite the in-memory build (`store.ts:80-100`, `collector/derive.ts`). Parity is checked only by an opt-in test (`aws/parity.test.ts`, skipped by default). Behaviour can differ between the MySQL and AWS deployments without any test failing.
- **Fix:** run the parity test in CI against a small fixture build, or standardise on one engine.
- **Confidence:** Static.

---

## P2 — lower severity / polish
- **UX-001 (Low):** the assistant's offline notice says "Paste fresh AWS keys … Amazon Bedrock" (`pipeline.ts:817`, `:1008`) while the configured provider is Groq/Gemini. This misleads the operator.
- **DATA-002 (Low):** 98% of news rows are Google News snippets (`body_status = snippet_google_news`: 9,163 of 10,062 docs in the local build). AI details (people, orgs, deaths) come from headlines.
- **DATA-003 (Low):** the scikit-learn model pickles were trained on 1.8.0 and are loaded on 1.9.1 (`InconsistentVersionWarning` in pytest). Pin the version.
- **BE-002 (Low):** the overview runs about 22 queries in parallel per poll (`intel.ts:731-837`); a quarter returns 1 MB (`allNews` capped at 250). This is acceptable for one Collector but should be cached per (scope, build_id).
