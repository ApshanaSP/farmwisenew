# Hunter D (pass 2): new P0/P1 findings

App: `chennai-grievance-portal-main` (branch qa/full-pass). Scratch tests `src/lib/collector/zz-huntD{1,2,3}.test.ts` were written, run, and deleted.

| id | severity | file:line | steps | expected | actual | evidence | root cause | confidence |
|---|---|---|---|---|---|---|---|---|
| D1 | P0 | src/lib/officer/data.ts:326; src/lib/collector/intel.ts:857-860 | Sign in as a department officer (for example GCC-SWD) and GET /api/officer/overview. Read `board.bell`. | Only the officer's department's incidents. | `board.bell` holds the district's open Severe/High incidents from every department (id, title, place, summary, officer, dept, complaints). The officer UI does not draw it, but the JSON goes to the browser. | zz-huntD2: `overview("daily", null, "GCC-SWD")` sends the bell query with params `[now,24,now,0]` and no department, and returns a TNP incident. | The bell query in `overview()` applies only the period window, and `deptBoard()` passes `d.bell` to the officer unchanged. | High |
| D2 | P0 | src/lib/collector/insights.ts:159-161, 239-242; src/lib/assistant/insightcards.ts:50,67-75 | As an officer, GET /api/collector/assistant/insights. The chips come from `insights("daily", null, lockDept)` → `briefing.emerging`. The same happens on the Collector's briefing with a department filter. | Emerging patterns, and their example headlines, for that department only. | Anomalies from every department are listed. Each carries `example` (another department's incident headline) and `localities`. | zz-huntD1: with dept GCC-SWD, the anomalies query params were `["2026-11-05 12:00:00"]` (no department). `emerging` returned VECTOR_DISEASE with example "Dengue cases at Health dept clinic, Kodambakkam". | The anomalies query and the spike-example query filter by zone only, never by `lead_dept`. | High |
| D3 | P1 | src/app/api/collector/assistant/export/route.ts:24 vs src/lib/collector/intel.ts:1490-1494 | Ask the assistant for an answer with a CSV, then open /api/collector/assistant/export?period=daily. | The event, area, location and status columns are filled. | Those 4 of 9 columns are always empty on every row. | zz-huntD3 output: `INC-9,,,,Storm Water Drains,Severe,,3,2026-11-05 09:00`. | The route's column names (event, area, location, status) do not exist on the rows `exportRows()` returns (what, where, why...). | High |
| D4 | P0 | src/lib/collector/insights.ts:118,124,128-133,298; src/lib/collector/briefbook.ts:61,79 vs src/lib/collector/intel.ts:705 (EFF.open) | The Collector resolves or rejects an incident, or an officer closes one ("Close as done" writes a `resolve` decision). Then open the briefing (page 2) or the assistant's insights. | The briefing's "N still open", the attention list, the department open counts and "severe still open" all match the page-1 KPI tiles, which apply the latest decision. | The briefing still counts the incident as open and can list it under attention or severe-open until the pipeline is rebuilt. Page 1 has already dropped it. | Code path: insights/briefbook use raw `i.is_open`. kpiBlock/overview use `effectiveSql(...).open`. `effective.ts` says the overlay must apply everywhere. No test covers insights/briefbook. | insights.ts and briefbook.ts were never moved to the effective-status overlay. | Medium-high (code read; not executed) |
| D5 | P1 | src/app/api/i18n/route.ts:69-99 | Without signing in, POST /api/i18n `{lang:"ta", texts:["<a site label>", "<instruction telling the model what to return for item 0>"]}`. | An open route cannot change what other users see. | Whatever the model returns for item 0 is cached for all users and written to data/i18n/ta.json. The only check is the count of "#" characters. Any visitor can fix the Tamil wording of uncached labels, and of Jarvis's Tamil→English lines, and can spend AI quota (60 calls/min/IP × 80 texts). | Code path read end to end. The route is open by design ("the login page is in Tamil too"). | A shared, persistent translation cache is filled from unauthenticated input, and texts are batched with other caller-supplied texts in one prompt. | Medium |

## Checked, no new P0/P1
Guard coverage of all 112 API routes:
- collector routes use `collectorSession`.
- officer routes use `officerSession`; the department comes from the database.
- assistant and map routes use `assistantSession` with `lockDept`.
- dev routes use `localOnly`; rehearsal/dev checks for dev, dry-run and a localhost Host header.
- the job route uses `jobKeyOk`.

Also checked:
- **Officer workflow:** grievance detail, recordStep and the report lock to the department. Photo and complaint-media access checks.
- **Sign-in:** login, OTP reset, token_version revocation, per-tab slot copy.
- **Step-up confirmation** on export, decisions and report.
- **Studio:** uploads (15 MB plus extension check). Link and connector fetches go through netsafe safeFetch, including the browser connector.
- **Collector:** export with requireConfirm; workspaces scoped by owner; assistant sessions and pins scoped by owner.
- **Jarvis:** hear and say need a session, are rate-limited and have size limits.
