# District IQ: feature matrix for the QA pass

Built from the code on branch `qa/full-pass` (app root `chennai-grievance-portal-main`, abbreviated `app/` below; `src/` paths are relative to it). Where a doc and the code disagree, this file follows the code. Every status starts as **UNTESTED** for this pass. Line numbers come from the tree as read on 2026-11-04.

Legend: Risk H/M/L. "Oracle" means a check that does not depend on the code under test: a DB count, a second data path, a file on disk, or an HTTP status from a raw request.

---

## 0. Top 15 riskiest untested areas

| # | Area | Why it is risky | Test that reaches it today |
|---|------|-----------------|---------------------------|
| 1 | **Dev-only routes exposed through the public tunnel** (`/api/dev/thunai/*`, `/dev/thunai`, `/dev/assistant`, `/dev/ui`, `/dev/rehearsal`) | These routes check only `NODE_ENV !== "production"`, with no session and no host check (`src/app/api/dev/thunai/*/route.ts`, e.g. `tool/route.ts:14`). `start.bat` runs `npm run dev`, and `host-tunnel.bat` forwards whatever is listening on :3000. Run together, they put unauthenticated LLM calls, STT and district data tool calls (`serverHands`) on a public URL. `/dev/thunai` also renders in production when `NEXT_PUBLIC_JARVIS_SPEC=1` (`src/app/dev/thunai/page.tsx:8`). | None. The e2e specs *use* `/dev/thunai` but never check that it is closed. |
| 2 | **Outward email paths**: incident action, Ask-the-Map batch send, Rain plan send, Jarvis tray "confirm N" | `lib/collector/actionmail.ts` (`sendAction`, `sendBatchAction`) and `lib/rehearsal/tasks.ts` (`sendDept`). `EMAIL_MODE=live` sends to real officers. The step-up is checked per route, but the content, recipients and sandbox/live switch have no test. | None (`actionmail`, `sendDept` = 0 test hits). |
| 3 | **Citizen complaint filing** `POST /api/complaints` | Uses `getActiveSession()` with **no role check**, so a staff session resolved by Referer could file (`src/app/api/complaints/route.ts:34`). It has **no rate limit**, only a per-user mutex and duplicate check. Zone, ward and street are re-validated server-side. | Lib-level loop only (`src/lib/loop.sqlite.test.ts:94`). The route itself is untested. |
| 4 | **Forgot-password flow** | `verify-otp` and `reset-password` have **no rate limit** and rely on the OTP attempt cap in `lib/otp.ts`. The OTP goes out by email. The dev OTP leak is gated by `NODE_ENV` and `NEXT_PUBLIC_DEV_SHOW_OTP` (`lib/otp.ts:241`). | Only the malformed-body 400 check (`src/app/api/auth/malformed.test.ts`). |
| 5 | **Rate limits behind the tunnel** | `getClientIp` returns `"direct"` unless `TRUST_PROXY_HOPS` is set (`src/lib/rate-limit.ts:71`). Behind cloudflared or localhost.run, every public client then shares one bucket at 10x allowance. The per-email login limit (8 per 15 min) lets anyone lock the Collector out. Buckets live in memory and reset on restart (host-server loops a restart). | `src/lib/rate-limit.test.ts` (unit only, no route). |
| 6 | **`POST /api/i18n`**: anonymous LLM calls plus a persistent disk cache | Open to every page. Each new text costs an LLM call, and the result is written to `data/i18n/{ta,en}.json` and served to every later visitor (`src/app/api/i18n/route.ts:31-41,64`). A crafted string can poison the shared Tamil labels. It has zod (max 80 texts of 400 chars) and a 60/min per-IP limit (shared "direct" bucket, see #5). | None for the route. |
| 7 | **Export correctness and step-up consistency** | `GET /api/collector/export` (CSV) needs step-up "export". `GET /api/collector/assistant/export` returns the **same `exportRows`** with **no step-up** (capped at 1,000 rows and 10 a day, in memory) (`src/app/api/collector/assistant/export/route.ts:15`). Also `POST /api/map/export` (CSV/GeoJSON), the PDF report (`components/collector/app/reportPdf.ts:51`) and the officer PDF (`components/officer/OfficerApp.tsx:379`). Nothing compares the files with the screen. | `src/lib/csv.test.ts` (cell escaping only). |
| 8 | **Collector console session expiry** | No 401 handling in the Collector console. The officer console redirects to `/login` (`components/officer/OfficerApp.tsx:120`); the Collector console has no matching code (searched `components/collector/**`). An expired or revoked session probably leaves panels showing "Could not load" with no route back to sign-in. | None. |
| 9 | **Officer uploads**: completion report and rain task "done" | `POST /api/officer/grievances/[id]/report` and `POST /api/rehearsal/tasks` read the whole multipart body before the size check, check file type by magic bytes, have no zod, and take the department from the DB. The report also needs step-up "officer_report". | `deptlock.sqlite.test.ts` covers `recordStep` only, not the report or task routes. |
| 10 | **Data Studio ingestion and connectors** | Upload up to 15 MB (Excel/CSV/PDF/photo OCR), link and API connectors on a schedule (outward fetch), quarantine and approve, dataset delete (step-up). There are many routes (`studio/*`) with `maxDuration` 120 to 300 s. | Lib tests exist (`studio/*.test.ts`, `ssrf.test.ts`); no route or UI test. |
| 11 | **Source onboarding** (`sources/onboard`, `/preview`, `/approve`, `sources/[id]` run/patch/delete, `sources/ocr`) | Fetches URLs the Collector types in (outward, SSRF surface; `netsafe` is unit-tested). Approve needs step-up; **DELETE and PATCH do not**. | `src/app/api/collector/sources/[id]/route.test.ts`, `netsafe.test.ts`. Onboard routes have no test. |
| 12 | **Jarvis level C end to end** (tray, confirm N, step-up 428, grant, send) | `confirmGate` is unit-tested (`lib/thunai/risk.ts:39`). In the console, the tray loop posts each draft separately (`components/collector/app/thunai/Thunai.tsx:533-549`). Each draft has its own scope hash, so it raises its own 428 prompt through the global fetch wrapper (`components/security/Confirm.tsx:29`). "Live" drafts are not posted; they open the Take Action panel. | `risk` in unit tests; `hud.spec.ts` shows the tray but does not send. |
| 13 | **`POST /api/collector/actions`** (record an action / assignment) | Writes to the intel DB in a transaction with **no step-up**, while `decisions` requires one. Untested. | None. |
| 14 | **Workspaces and the briefing archive** | Save, open and delete versions; the Briefing saves a workspace version with the archived markdown (`lib/collector/workspaces.ts:23-32`). Owner scoping is in SQL. | None. |
| 15 | **The .bat launchers** | `host-server.bat` never rebuilds unless you pass `rebuild`, so after a pull it serves a **stale `.next-prod`**. `start.bat` hardcodes `D:\farm\...` while the repo is at `E:\farm`. `host-tunnel.bat` hardcodes `C:\Users\DELL\...` and uses SSH `StrictHostKeyChecking=accept-new`. | None (manual). |

---

## 1. Page routes (`src/app/**/page.tsx`)

The middleware (`src/middleware.ts:84-131`) matches `/api/*`, `/citizen/*`, `/officer/*`, `/collector/*`, `/profile/*`, `/login`, `/register` and `/forgot-password`. **`/dev/*` and `/` are not matched.**

| Route | File:line | Who can reach it (code) | Promise | Oracle | Risk | Status |
|---|---|---|---|---|---|---|
| `/` | `src/app/page.tsx:4-15` | Anyone. It redirects by role: citizen to `/citizen`, officer to `/officer`, collector to `/collector`, otherwise `/login`. | Land on the right console | Sign in as each seeded role, GET `/`, and compare the `Location` header with the role. | L | UNTESTED |
| `/login` | `src/app/login/page.tsx:144` | Always reachable, even when signed in (`middleware.ts:113`) | Password-only sign-in, redirects to the role's console | `POST /api/auth/login` with each seeded user; check `redirectTo`, then `SELECT role FROM users WHERE email=?` | M | UNTESTED |
| `/register` | `src/app/register/page.tsx:12` | Public. A signed-in citizen is sent to `/citizen` (`middleware.ts:106`). | Create a citizen account | `SELECT COUNT(*) FROM users WHERE email=? AND role='citizen'` = 1 after submit | M | UNTESTED |
| `/forgot-password` | `src/app/forgot-password/page.tsx:23` | Public, same rule as `/register` | Email OTP, verify, reset | After reset, the old password fails login and the new one works; `users.token_version` went up | H | UNTESTED |
| `/citizen` | `src/app/citizen/page.tsx:12-15` | Middleware citizen session, plus the page checks `role === "citizen"` | Citizen home | Non-citizen session: GET gives 302 to `/login` | L | UNTESTED |
| `/citizen/file-complaint` | `src/app/citizen/file-complaint/page.tsx:104` | Middleware citizen session; client-side session check (`:106,239`) | File a complaint with location and photo | `SELECT * FROM complaints WHERE complaint_code=?` matches what was entered, and the zone/ward/street chain is consistent | H | UNTESTED |
| `/citizen/track-complaints` | `src/app/citizen/track-complaints/page.tsx:41` | Middleware citizen session | List and filter own complaints, view detail and photo | Count of rows on screen = `SELECT COUNT(*) FROM complaints WHERE user_id=?` (with the status filter) | M | UNTESTED |
| `/officer` | `src/app/officer/page.tsx:32-34` | Middleware officer session, plus `role === "department_officer"` | Department console | An officer of dept A never sees dept B ids (`deptlock` style) | H | UNTESTED |
| `/collector` | `src/app/collector/page.tsx:15-17` | Middleware collector session, plus `role === "collector"` | Collector console | Non-collector: 302. Collector: 200. | M | UNTESTED |
| `/profile` | `src/app/profile/page.tsx:47` | Any signed-in portal (`middleware.ts:103`) | View and edit profile, photo, mobile OTP, change password | DB row after PUT; change-password revokes the other sessions | M | UNTESTED |
| `/dev/assistant` | `src/app/dev/assistant/page.tsx:11` | **No session.** `notFound()` only in production. | Preview of Ask District IQ | In production: 404. On the dev server through the tunnel: reachable (risk). | M | UNTESTED |
| `/dev/collector` | `src/app/dev/collector/page.tsx:17` | Not production, `AWS_STORE_DRY_RUN=1`, and Host is localhost/127.0.0.1 | Console preview on the dry-run store | Wrong Host header gives 404 | L | UNTESTED |
| `/dev/officer` | `src/app/dev/officer/page.tsx:18-20` | Same as `/dev/collector`, plus `?dept=` | Officer preview | Same | L | UNTESTED |
| `/dev/rehearsal` | `src/app/dev/rehearsal/page.tsx:11` | Production gate only | Rain rehearsal preview | Its API (`/api/rehearsal/dev`) needs dry-run and localhost; the page alone shows no data | L | UNTESTED |
| `/dev/thunai` | `src/app/dev/thunai/page.tsx:8` | **Reachable in production when `NEXT_PUBLIC_JARVIS_SPEC=1`.** No session. | Jarvis stand-in console (used by e2e) | In production with the flag unset: 404 | H | UNTESTED |
| `/dev/ui` | `src/app/dev/ui/page.tsx:8` | Production gate only | UI kit | 404 in production | L | UNTESTED |

---

## 2. API routes (`src/app/api/**/route.ts`), 115 files

**Global rules.** The middleware refuses cross-site non-GET requests with a 403 (`src/middleware.ts:69-89`; tested in `stepup.test.ts:60`). Nothing in the codebase sets a request-body size limit for route handlers; where a limit exists, the route checks it **after** reading the whole body (`req.json()`, `arrayBuffer()`, `formData()`). Rate limits live in memory and are per process (`src/lib/rate-limit.ts:1-12`). Step-up "Confirm it's you" returns 428 until a grant comes back in `x-diq-grant` (`src/lib/security/stepup.ts:50-64`; switched off only when `NODE_ENV=test` and `STEP_UP=off`).

Auth helpers:
- `collectorSession()` (`src/lib/collector/guard.ts:6`): Collector role only.
- `officerSession()` (`src/lib/officer/guard.ts:47`): officer role, with the department read from the DB on every call.
- `assistantSession()` (`src/lib/assistant/access.ts:21`): Collector, or officer locked to their department (`lockDept`).
- `getSessionFromCookies`, `getActiveSession`, `getActivePortalSession`, `getActiveSessions` (`src/lib/auth.ts:116-203`).
- `jobKeyOk()` (`src/lib/jobauth.ts`): `x-job-key` header.

Column key: **SV** = schema validation (zod or a specific regex); **RL** = rate limit; **Body** = size limit; **W/O** = writes data / calls outward. **RISK** marks a route that writes or calls outward without an auth check, or one with no schema validation.

### 2.1 Auth and profile

| Route | Methods (line) | Auth | Scope | SV | RL | Body | W/O | Flags |
|---|---|---|---|---|---|---|---|---|
| auth/login | POST :14 | none (it creates the session) | users | zod `loginSchema` | yes: IP 20 (200 for "direct") and email 8 per 15 min | none | W: session cookie, securityLog | **RISK** (expected: unauthenticated write; lockout DoS via per-email limit) |
| auth/logout | POST :8 | getPortalSession / getSessionFromCookies | own portal | none (no body) | no | n/a | W: clears cookie | RISK (no schema; low) |
| auth/me | GET :6 | getSessionFromCookies | self | none | no | n/a | none | RISK (no schema; low) |
| auth/register | POST :8 | **none** | creates a citizen | zod | yes (IP) | none | W: INSERT users | **RISK** (unauthenticated write) |
| auth/forgot-password/request-otp | POST :12 | **none** | email | zod | yes: IP 10 per 15 min | none | W: OTP row; O: **sendMail** | **RISK** (unauthenticated outward email) |
| auth/forgot-password/verify-otp | POST :12 | **none** | email | zod | **no** (OTP attempt cap only) | none | W: OTP attempts | **RISK** (unauthenticated, no RL) |
| auth/forgot-password/reset-password | POST :9 | **none** (OTP is the credential) | email | zod | **no** | none | W: UPDATE users.password_hash, revokeSessions | **RISK** (unauthenticated write, no RL) |
| auth/confirm | POST :27 | getSessionFromCookies + isStaff | self | zod discriminated union | via factor failure lock (5 per 15 min, `lib/security/factors.ts:3`) and email cooldown | none | W: securityLog; O: **emailCode** | OK |
| auth/security | GET :21, POST :34 | getSessionFromCookies | self | zod (POST) | no | none | W: revokeSessions, cookie | GET: RISK (no schema; low) |
| auth/tab | POST :9 | **none** | this browser's own cookies | `isSlot()` checks (not zod) | no | none | W: copies cookies between slots | **RISK** (unauthenticated cookie write; low, own cookies only) |
| profile | GET :31, PUT :94 | getSessionFromCookies | self | zod (PUT) | no | none | W: INSERT/UPDATE | GET: RISK (no schema; low) |
| profile/change-password | POST :11 | getSessionFromCookies | self | zod | **no** | none | W: UPDATE password, revoke | OK (no RL on current-password guessing: M) |
| profile/mobile-otp/request | POST :9 | getSessionFromCookies | self | zod | no (OTP cooldown) | none | O: **sendMail** | OK |
| profile/mobile-otp/verify | POST :15 | getSessionFromCookies | self | zod | no | none | W: INSERT/UPDATE | OK |
| profile/photo | POST :12 | getSessionFromCookies | self | **none** (multipart; size and type checks) | no | 2 MB after read | W: file write, DB | **RISK** (no schema) |

### 2.2 Citizen complaints and public reference data

| Route | Methods | Auth | Scope | SV | RL | Body | W/O | Flags |
|---|---|---|---|---|---|---|---|---|
| complaints | POST :31, GET :307 | POST: getActiveSession (**no role check**); GET: citizen role | own user_id | zod `complaintSubmitSchema` (POST); GET none | **no** | none | W: INSERT complaint (mutex + duplicate check) | GET: RISK (no schema); POST: M (no role check, no RL) |
| complaints/[code] | GET :7 | getSessionFromCookies | owner, staff | **none** | no | n/a | none | **RISK** (no schema) |
| complaints/media | POST :11 | getActiveSession + citizen | self | none (multipart; magic-byte sniff) | yes: 20 per 15 min per user | 10 MB after read | W: private file | **RISK** (no schema) |
| complaints/media/[name] | GET :14 | getActiveSessions | owner, dept, Collector | none (name pattern in lib) | no | n/a | none | RISK (no schema); tested `route.test.ts` |
| complaint-taxonomy | GET :16 | **none** | public | none | no | n/a | DB read | **RISK** (no schema; read-only) |
| complaint-types | GET :8 | **none** | public | none | no | n/a | DB read | **RISK** (no schema; read-only) |
| departments | GET :8 | **none** | public | none | no | n/a | DB read | **RISK** (no schema; read-only) |
| locations/areas | GET :9 | **none** | public | none | no | n/a | read | **RISK** (no schema) |
| locations/gcc-localities | GET :6 | **none** | public | none (query param) | no | n/a | read | **RISK** (no schema) |
| locations/gcc-streets | GET :17 | **none** | public | none | no | n/a | read | **RISK** (no schema) |
| locations/localities | GET :5 | **none** | public | none | no | n/a | read | **RISK** (no schema) |
| locations/resolve-ward | GET :17 | **none** | public | none (lat/lon parsed by hand) | no | n/a | read, point-in-polygon | **RISK** (no schema) |
| locations/streets | GET :5 | **none** | public | none | no | n/a | read | **RISK** (no schema) |
| locations/wards | GET :16 | **none** | public | none | no | n/a | read | **RISK** (no schema) |
| locations/zones | GET :8 | **none** | public | none | no | n/a | read | **RISK** (no schema) |
| i18n | POST :64 | **none** | public | zod (`lang`, up to 80 texts of 400 chars) | yes: 60/min per IP | by schema after read | W: **disk** `data/i18n/*.json`; O: **LLM** (`generateJson`) | **RISK** (unauthenticated LLM + persistent write) |

### 2.3 Collector console

| Route | Methods | Auth | Scope | SV | RL | Body | W/O | Flags |
|---|---|---|---|---|---|---|---|---|
| collector/actions | POST :23 | collectorSession | district | zod | no | none | W: INSERT (transaction), **no step-up** | OK (M: no step-up) |
| collector/alerts | GET :14 | collectorSession | district | none | no | n/a | reads aiStatus | RISK (no schema) |
| collector/audit | GET :7 | collectorSession | district | none | no | n/a | read | RISK (no schema) |
| collector/brief | GET :28 | collectorSession | district | none | no | n/a | read (may call LLM via aibrief) | RISK (no schema) |
| collector/conflicts | GET :13 | collectorSession | | none | no | | read | RISK (no schema) |
| collector/decisions | POST :42 | collectorSession + **step-up "decide"** | incident ids | zod | no | none | W: INSERT, syncComplaints to citizen status | OK (tested `route.sqlite.test.ts`) |
| collector/export | GET :12 | collectorSession + **step-up "export"** | filters | none (parse* helpers) | no | n/a | CSV out | RISK (no schema) |
| collector/geo | GET :9 | collectorSession | | none | no | | read | RISK (no schema) |
| collector/incidents/[id] | GET :7 | collectorSession | | none | no | | read | RISK (no schema) |
| collector/incidents/[id]/analysis | GET :8 | collectorSession | | none | no | | read (+AI) | RISK (no schema) |
| collector/incidents/[id]/action | GET :11 (draft), POST :24 (send) | collectorSession + **step-up "send_email"** (POST) | incident | **none** (POST input is not zod-parsed) | no | none | O: **email** (`sendAction`); GET drafts (LLM) | **RISK** (no schema on an outward email) |
| collector/insights | GET :10 | collectorSession | | none | no | | read | RISK (no schema) |
| collector/jobs/route-news | POST :13 | **jobKeyOk** (`x-job-key`, constant time) | n/a | none | no | n/a | W: routes news into complaints | RISK (no schema; no session by design; tested `route.test.ts`) |
| collector/list | GET :11 | collectorSession | | none | no | | read | RISK (no schema) |
| collector/nearby | GET :12 | collectorSession | | none | no | | read | RISK (no schema) |
| collector/news | GET :8 | collectorSession | | none | no | | read | RISK (no schema) |
| collector/news/analysis | GET :8 | collectorSession | | none | no | | read (+AI) | RISK (no schema) |
| collector/news/article | GET :9 | collectorSession | | none | no | | O: **fetches the article's full text** (`fullText`) | **RISK** (no schema; outward fetch) |
| collector/overview | GET :8 | collectorSession | | none | no | | read | RISK (no schema) |
| collector/pattern | GET :9 | collectorSession | | none | no | | read | RISK (no schema) |
| collector/report | GET :8 | collectorSession | | none | no | | read | RISK (no schema) |
| collector/search | GET :9 | collectorSession | | none (q sliced to 80, LIKE-escaped) | no | | read | RISK (no schema) |
| collector/stories | GET :10 | collectorSession | | none | no | | read (+AI) | RISK (no schema) |
| collector/sources | GET :8, POST :35 | collectorSession | | zod (POST) | no | none | W: addSource | GET: RISK (no schema) |
| collector/sources/[id] | POST :17 (run), PATCH :30, DELETE :46 | collectorSession | | zod (PATCH) | no | none | W: update/remove; O: **runSource fetch**; **no step-up on DELETE** | POST/DELETE: RISK (no schema); tested `route.test.ts` |
| collector/sources/ocr | POST :22 | collectorSession | | zod | no | none | W: UPDATE + audit; O: OCR | OK |
| collector/sources/onboard | POST :25 (streams) | collectorSession | | zod | no | none | O: **fetches a typed-in URL** (maxDuration 90) | OK (SSRF via netsafe) |
| collector/sources/onboard/preview | POST :12 | collectorSession | | zod | no | none | O: fetch | OK |
| collector/sources/onboard/approve | POST :32 | collectorSession + **step-up "approve_source"** | | zod | no | none | W: scheduled source | OK |
| collector/studio | GET :19, POST :62 | collectorSession | | zod | yes | `MAX_BYTES` (15 MB) after read | W: dataset; O: AI | GET: RISK (no schema) |
| collector/studio/[id] | GET :28, PATCH :129, DELETE :149, POST :192 | collectorSession + **step-up "delete_dataset"** (DELETE) | | zod (26 uses) | yes | none | W: board/meta/delete; O: AI | OK |
| collector/studio/connectors | GET :18, POST :41 | collectorSession | | zod | **no** | none | W: connector state; O: **runConnector fetch** (maxDuration 300) | GET: RISK (no schema) |
| collector/studio/pick | GET :17, POST :37 | collectorSession | | zod | yes | none | read/AI | OK |
| collector/studio/watch | GET :8 | collectorSession | | none | no | | read | RISK (no schema) |
| collector/workspaces | GET :8, POST :26, PATCH :41, DELETE :55 | collectorSession | owner = email | zod | no | none | W: save/delete | GET: RISK (no schema) |
| collector/workspaces/[id] | GET :7 | collectorSession | owner = email | regex `^\d{1,9}$` | no | | read | OK |
| collector/assistant/chat | POST :36 (SSE) | assistantSession | Collector: district; officer: `lockDept` | zod | yes (`admit`) | message length by zod | O: **LLM** pipeline | OK |
| collector/assistant/briefing | POST :12 | collectorSession | | zod | yes | none | W: saveWorkspace + audit; O: LLM | OK |
| collector/assistant/export | GET :15 | assistantSession | lockDept | **none** | yes (10 a day, in memory) | n/a | CSV out + audit; **no step-up** | **RISK** (no schema; step-up bypass compared with collector/export) |
| collector/assistant/feedback | POST :18 | assistantSession | own | zod | yes | none | W: saveFeedback | OK |
| collector/assistant/insights | GET :10 | assistantSession | | none | yes | | read/AI | RISK (no schema) |
| collector/assistant/pins | GET :11, POST :17, DELETE :29 | assistantSession | own | zod (POST) | yes | none | W: add/delete pin | DELETE: RISK (no schema) |
| collector/assistant/sessions | GET :9 | assistantSession | own email | none | no | | read | RISK (no schema) |
| collector/assistant/sessions/[id] | GET :9 | assistantSession | own email | none | no | | read | RISK (no schema) |
| collector/assistant/status | GET :13 | assistantSession | | none | no | | O: embed warmUp | RISK (no schema) |
| collector/assistant/tools | GET :21, POST :39 | collectorSession | | zod (POST) | yes | none | W: audit; runTool | GET: RISK (no schema) |
| collector/thunai/agent | POST :17 | collectorSession | | zod (`AgentBody`) | yes | none | O: **LLM** (Groq/Claude/Gemini race) | OK |
| collector/thunai/agent/round | POST :18 | collectorSession | | zod | yes | none | O: LLM | OK |
| collector/thunai/plan | POST :12 | collectorSession | | zod | yes | none | O: LLM | OK |
| collector/thunai/audit | GET :18, POST :29 | collectorSession | own | zod | **no** | none | W: appendAudit | GET: RISK (no schema) |
| collector/thunai/memory | GET :25, POST :35 | collectorSession | own | zod | **no** | none | W: changeMemory | GET: RISK (no schema) |
| collector/thunai/world | GET :9 | collectorSession | | none | no | | read | RISK (no schema) |
| jarvis/hear | POST :17 | collectorSession | | **none** (raw audio) | yes | `MAX_AUDIO_BYTES` after `arrayBuffer()` | O: **STT** | **RISK** (no schema) |
| jarvis/say | POST :70 | collectorSession | | zod | yes | text size check | O: **TTS fetch** | OK |

### 2.4 Map ("Ask the Map")

| Route | Methods | Auth | Scope | SV | RL | Body | W/O | Flags |
|---|---|---|---|---|---|---|---|---|
| map/ask | POST :32 | assistantSession | lockDept | zod | yes | none | O: LLM | OK |
| map/export | POST :15 | assistantSession + **step-up "export"** | lockDept | zod (`plan: z.unknown()`, checked in `exportAnswer`) | no | none | CSV/GeoJSON + audit | OK |
| map/insight | POST :13 | assistantSession | | zod | yes | none | O: LLM | OK |
| map/layers/[id] | GET :58 | assistantSession | | **none** (id switch) | no | | read | RISK (no schema) |
| map/send | POST :19 | collectorSession + **step-up "send_email"** | | zod | no | none | O: **batch email** | OK |
| map/suggest | GET :9 | assistantSession | | none | no | | read | RISK (no schema) |

### 2.5 Officer console

| Route | Methods | Auth | Scope | SV | RL | Body | W/O | Flags |
|---|---|---|---|---|---|---|---|---|
| officer/geo | GET :8 | officerSession | dept from DB | none | no | | read | RISK (no schema) |
| officer/grievances | GET :14 | officerSession | dept | none (`parseScope`) | no | | read | RISK (no schema) |
| officer/grievances/[id] | GET :9, POST :25 | officerSession | dept (`ID_RE`) | zod (POST) | no | none | W: recordStep | OK (tested `deptlock.sqlite.test.ts`) |
| officer/grievances/[id]/report | POST :16 | officerSession + **step-up "officer_report"** | dept | **none** (multipart) | no | photo size after read | W: savePhotos, recordStep | **RISK** (no schema) |
| officer/insights | GET :8 | officerSession | dept | none | no | | read | RISK (no schema) |
| officer/overview | GET :8 | officerSession | dept | none | no | | read | RISK (no schema) |
| officer/photos/[dir]/[name] | GET :14 | getActiveSessions + officerDeptCode | dept, Collector | none (path parts) | no | | file read | RISK (no schema; path parts reach the filesystem) |
| officer/search | GET :8 | officerSession | dept | none | no | | read | RISK (no schema) |

### 2.6 Rain rehearsal

| Route | Methods | Auth | Scope | SV | RL | Body | W/O | Flags |
|---|---|---|---|---|---|---|---|---|
| rehearsal/dev | GET :23, POST :48 | **none**; `allowed()` = not production, `AWS_STORE_DRY_RUN=1`, and Host header localhost (`:16-20`) | acts as Collector or as `?dept=` | **none** | no | none | W: markDone; O: **sendDept email** (dev: true) | **RISK** (unauthenticated write and outward call; relies on the Host header) |
| rehearsal/impacts | GET :10 | collectorSession | | none (lens list) | no | | read | RISK (no schema) |
| rehearsal/photo/[dir]/[name] | GET :12 | getActiveSessions + dept | | zod | no | | file read | OK |
| rehearsal/plan | POST :23 | collectorSession + **step-up "send_email"** (send) | | zod | no | none | O: **sendDept email** | OK |
| rehearsal/rains | GET :12 | collectorSession | | none | no | | read | RISK (no schema) |
| rehearsal/reach | GET :9 | collectorSession | | none | no | | read | RISK (no schema) |
| rehearsal/route | POST :14 | getActivePortalSession, collector or officer | | zod | no | none | routing compute | OK |
| rehearsal/state | GET :13 | collectorSession | | none | no | | read | RISK (no schema) |
| rehearsal/tasks | GET :11, POST :26 | officerSession | dept | **none** (multipart) | no | photo size after read | W: savePhotos, markDone | **RISK** (no schema) |
| rehearsal/traffic/[z]/[x]/[y] | GET :9 | assistantSession | | **none** (`Number()` on path parts, no bounds) | no | | O: **TomTom tile fetch** | **RISK** (no schema; outward) |
| rehearsal/traffic/live | GET :9 | assistantSession | | none | no | | O: **TomTom** | **RISK** (no schema; outward) |

### 2.7 Dev Jarvis (`/api/dev/thunai/*`): 404 in production only, **no session, no Host check**

| Route | Methods | SV | Body | O | Flags |
|---|---|---|---|---|---|
| dev/thunai/agent | POST :10 | zod | none | **LLM** | **RISK** (unauthenticated outward on any dev server, including one behind the tunnel) |
| dev/thunai/agent/round | POST :11 | zod | none | **LLM** | **RISK** |
| dev/thunai/draft | GET :8 | none | n/a | draft (LLM) | **RISK** |
| dev/thunai/hear | POST :9 | none | `MAX_AUDIO_BYTES` after read | **STT** | **RISK** |
| dev/thunai/plan | POST :11 | zod | none | **LLM** | **RISK** |
| dev/thunai/tool | POST :13 | none | none | real data tool calls (`serverHands`) | **RISK** |

---

## 3. Console features

### 3.1 Collector console (`src/components/collector/app/CollectorApp.tsx`, 1001 lines)

| Feature | Where | Promise | Oracle | Risk | Status |
|---|---|---|---|---|---|
| Pages: Overview, Briefing, Trends, Environment & markets, Data Studio | `CollectorApp.tsx:74-75, 487` | Five pages; pages can be hidden through Customize (Overview always stays) | Hide a page in Customize, reload: it is still hidden (workspace layout row in `ops.workspaces`) | M | UNTESTED |
| Period switch: daily, weekly, monthly, quarterly | `CollectorApp.tsx:135, 237`; `lib/collector/intel.ts` PERIODS | Every panel follows the period | KPI "open" for the period = `SELECT COUNT(*) FROM incidents WHERE is_open=1 AND <period window>` | H | UNTESTED |
| Filters: zone, department, category, taluk, severity (cross-filter `Focus`) | `CollectorApp.tsx:136-137, 236`; `intel.ts:52-53, 703` | Clicking a chart category or map zone filters the map, the list and the sources | List row count = SQL count with the same WHERE; the news card hides when filtered (`intel.ts:881-883`) | H | UNTESTED |
| Map: zones/taluks mode, layers Severe/Complaints/Other | `Overview.tsx:130-133`; `SatMap.tsx:34-40` | Layer toggles show counts; the taluk mode colours taluks | Layer count chip = `layerCounts` = SQL count by category | M | UNTESTED |
| Ask-the-Map reference layers (schools, hospitals, police, rail/metro, lakes, gauges, roads, waterways, water bodies, hotspots, news, live feeds) | `lib/map/types.ts:185-192`; `api/map/layers/[id]/route.ts:25-58` | Turning a layer on draws its features | Feature count on the map = rows in the layer's source table or GeoJSON | M | UNTESTED |
| Ask the Map (question to map answer, Send, Export, Save) | `askmap/AskMapPanel.tsx:62`; `CollectorApp.tsx:201` | NL question gives highlighted places; Export matches the answer rows | Exported CSV row count = header `x-rows` = number of pins on the map | H | UNTESTED |
| Priority list / Attention card (severe, tasks) | `Attention.tsx:18` | Worst first | Order = SQL `ORDER BY severity, open` on the same filter | M | UNTESTED (unit `Attention.test.ts`) |
| Incident detail + analysis ("Why it needs you") | `Detail.tsx:34-52`; `api/collector/incidents/[id]/analysis` | Evidence, sources, AI explanation | Source count = `SELECT COUNT(*) FROM incident_members WHERE incident_id=?` | M | UNTESTED |
| Decisions (verify, resolve, reopen, reject), with step-up | `api/collector/decisions/route.ts:42-114` | Writes the decision; the citizen's complaint status follows | Citizen `complaints.status` changes for the linked complaints | H | tested (sqlite) |
| Take action / instruction email | `TakeAction.tsx:15-29`; `api/collector/incidents/[id]/action` | Draft, step-up, send (sandbox or live) | Sandbox inbox (`EMAIL_SANDBOX_TO`) receives exactly one mail with the shown subject; audit row exists | H | UNTESTED |
| News, stories, conflicts | `Stories.tsx:37`; `Conflicts.tsx:14-53`; `NewsPreview.tsx` | Stories are deduplicated; conflicting reports are flagged | Story count ≤ `SELECT COUNT(DISTINCT story_id)`; the conflict badge appears only when sources differ | M | UNTESTED |
| Next door (nearby districts) | `Nearby.tsx:29` | Nearby items | API rows = rendered rows | L | UNTESTED |
| Gaps / review / pattern bodies | `Insights.tsx:323, 480, 588` | Data gaps, location review | Compare with the `api/collector/insights` JSON | L | UNTESTED |
| Briefing page + Briefing Book (EN/TA, read aloud) | `Insights.tsx:133`; `BriefingBook.tsx:29, 114-137` | AI briefing whose numbers are checked against facts | Every number in the briefing markdown appears in the fact pack (`briefing_archive.fact_pack`) | H | UNTESTED |
| Trends, Markets | `Insights.tsx:359, 700, 785` | Charts by period | Chart totals = SQL group-by totals | M | UNTESTED |
| Alert bar (rain/IMD level) | `AlertBar.tsx:25`; `api/collector/alerts` | Current warning | Level = latest IMD row | M | UNTESTED |
| Export report: PDF report or CSV action list | `Overlays.tsx:224 ExportBody`; `reportPdf.ts:51`; `api/collector/export` | Step-up, then the file | CSV rows = on-screen action list rows for the same filters; PDF KPI = screen KPI | H | UNTESTED |
| Sources panel (list, run, edit, delete, onboard, OCR language) | `Sources.tsx:15, 86, 225` | Manage data sources | `ops.sources` row changes plus audit rows per action | M | UNTESTED |
| Workspaces (save, open versions, delete) and Customize | `Workspace.tsx:9-20, 118`; `CollectorApp.tsx:554-611` | Save filters and layout, reopen them | `SELECT * FROM workspaces WHERE owner=?` versions; reopening restores the filters exactly | M | UNTESTED |
| Command palette (Ctrl+K), including datasets and actions | `CollectorApp.tsx:688-707, 759-788` | Jump anywhere | Each palette action lands on the stated page or panel | L | UNTESTED |
| Global search | `api/collector/search/route.ts:9`; `intel.ts:1419-1461` | Zones, departments, incidents, news, sources, datasets, complaint number | For a seeded keyword, each group = its SQL LIKE count (capped 4/3) | M | UNTESTED |
| Theme light/dark | `CollectorApp.tsx:302-308` (`localStorage diq-theme`, `html[data-theme]`) | Persists, no flash | Reload: `document.documentElement.dataset.theme` matches the stored value | L | UNTESTED |
| Language switch EN/TA | `TopMenu.tsx LangSwitch` (`CollectorApp.tsx:812`); `lib/i18n/lang.ts:9-24`; `components/LangToggle` on auth pages | Site-wide Tamil, numbers unchanged | Every number on a page is the same in EN and TA (`#` rule in `api/i18n:51`) | M | UNTESTED |
| Sign out | `CollectorApp.tsx:840` (`POST /api/auth/logout`) | Ends this tab's Collector session | Then `GET /api/collector/overview` gives 401 | M | UNTESTED |
| Session expiry / revocation | **no 401 handler in the Collector console** | A user signed out elsewhere should go to /login | Revoke (change password elsewhere), click anything: expect a redirect to /login | H | UNTESTED |
| Per-tab sessions (slots) | `src/lib/session-cookies.ts`, `api/auth/tab`, `lib/tab-session.ts` | Three tabs, three logins | Each tab's `/api/auth/me` returns its own role | M | unit-tested (lib) |
| Rain & flooding (rehearsal) on the map, plan sheet, send jobs | `rehearsal/RainBand.tsx`, `RainView.tsx`, `PlanSheet.tsx:16`; `api/rehearsal/*` | Past rains, flood streets, jobs per department, send with step-up | Jobs sent = rows in the rehearsal tasks store for that department; officer tasks list shows them | H | UNTESTED |
| Ask District IQ (assistant dialog: chat, pins, sessions, feedback, CSV) | `assistant/AssistantDialog.tsx:37`; `api/collector/assistant/*` | Number-checked answers; officers are locked to their department | For a benchmark question, the answer number = SQL; an officer asking about another department gets their own department's data | H | unit-tested (lib) |
| **Data Studio** (upload, connect link/API, connectors, quarantine/approve, analyst, charts, map, drill, data card, outcome, insights, delete) | `studio/Studio.tsx:34, 216`; `Connectors.tsx`; `Analyst.tsx`; `StudioChart.tsx`; `api/collector/studio/*` | Upload Excel/CSV/PDF/photo up to 15 MB; schedule refresh; charts honest | Row count shown = rows in the uploaded file; chart totals = sum over the file column | H | lib-tested only |
| AI steps in the console (brief key points, story AI, analysis, action drafts, translations) | `lib/collector/aibrief.ts`, `storyai.ts`, `actionmail.ts`; `lib/ai/gateway.ts` | Falls back to templates when the AI is busy | With AI keys unset: every panel still renders (no 500) | M | partially unit-tested |

### 3.2 Officer console (`src/components/officer/OfficerApp.tsx`)

| Feature | Where | Promise | Oracle | Risk | Status |
|---|---|---|---|---|---|
| Tabs new / action / sent / verified | `src/lib/officer/stages.ts:10-29` | Grievances by stage, own department only | Tab counts = `SELECT stage, COUNT(*) ... WHERE dept=?` | H | partially (deptlock) |
| Approve / act / record step | `api/officer/grievances/[id]` | Moves the stage, audited | DB stage changes; an audit row exists | H | tested (sqlite) |
| Completion report with photos (step-up) | `api/officer/grievances/[id]/report` | Sends to the Collector | Photo file on disk + `recordStep`; Collector sees it; the citizen sees the photo (loop test) | H | lib loop only |
| PDF report export | `OfficerApp.tsx:379, 480, 532` | Report for this period and area | PDF totals = tab counts | M | UNTESTED |
| Rain tasks (mark done with photo/location) | `api/rehearsal/tasks` | Done tasks are recorded | Task row `done_at` set, photo stored | M | UNTESTED |
| Session expiry | `OfficerApp.tsx:120` | 401 goes to `/login?redirect=/officer` | Revoke, act, check the redirect | M | UNTESTED |
| Sign out | `OfficerApp.tsx:571` | | Then officer APIs give 401 | L | UNTESTED |

### 3.3 Citizen

| Feature | Where | Promise | Oracle | Risk | Status |
|---|---|---|---|---|---|
| File complaint (taxonomy, zone/ward/street, map, photo) | `citizen/file-complaint/page.tsx`; `api/complaints POST`; `api/complaints/media` | One complaint per submit, correct department | `complaints` row with `department_id` = taxonomy mapping; no duplicates on double click | H | UNTESTED |
| Track complaints + detail + photo | `citizen/track-complaints/page.tsx`; `api/complaints GET`, `[code]` | Own complaints only | Another citizen's code gives 404/403 | H | UNTESTED |
| Profile, photo, mobile OTP, change password | `profile/page.tsx`; `api/profile/*` | | DB rows; old sessions revoked on change | M | photo route tested |

---

## 4. Jarvis ("Thunai")

| Feature | Where | Promise | Oracle | Risk | Status |
|---|---|---|---|---|---|
| Modes **off / on / muted** | `components/collector/app/thunai/hudstore.ts:7`; `Thunai.tsx:198` | off: mic tracks stopped; on: listening; muted: closed, one key away | `navigator.mediaDevices` track `readyState === "ended"` when off | H | e2e `mode.spec.ts` |
| Wake word "Hi Jarvis" (browser speech) | `thunai/wake.ts:2-4` | Wakes, takes a command said in the same breath | Wake fires once per phrase | M | unit + e2e |
| VAD / barge-in / hold | `lib/thunai/vad.ts`; e2e `vad*.spec.ts`, `bargein.spec.ts`, `hold.spec.ts` | Speech end detection; interrupting stops TTS | | M | e2e |
| STT (`/api/jarvis/hear`) / TTS (`/api/jarvis/say`) | routes above; `lib/thunai/stt.ts` | Tamil and English | Transcript of a fixture WAV = expected text | M | unit `stt.test.ts` |
| **Step union**: 40 actions: `page, period, view, mapMode, layer, panel, close, item, draft, zoom, ask, map, theme, lang, mode, speed, handsfree, workspace, undo, stop, off, repeat, whatDid, whereAmI, explain, numbers, click, scroll, type, clearText, remember, recall, forget, remind, send, confirm, mission, read, help` | `src/lib/thunai/types.ts:24-64` | Nothing outside this union can run | For each action, run its canonical phrase and compare the ScreenState diff with the expected one | H | unit `golden`, `navcommand`, `quick` |
| Panels Jarvis can open (18) | `types.ts:17-19` | | Panel open = the console's `modal.kind` | L | partial |
| Risk levels **A / B / C** | `lib/thunai/risk.ts:11-31` | A runs with undo; B (workspace save, remember, forget, remind) needs one tap; C (draft, send, confirm, rain mission) fills the tray | Every ActionName maps to a level; a C step never makes a network POST without a tap | H | unit (risk via tests) |
| **Approval tray** + `confirm N` gate (N = count, shown ≥ 2 s, nothing added) | `risk.ts:39-45`; `Thunai.tsx:279-549, 674-683, 1810` | Jarvis never sends; the Collector's "confirm N" or tap sends sandbox drafts; live drafts open Take Action | Sandbox inbox count = N; audit "sent X of N" | H | unit gate; no send test |
| Lanes: **quick/rules** (`quickScreen`), **district / screens / planner** (agent rounds with LLM), **general**, **refuse** (privacy, forbidden, off-topic) | `lib/thunai/router.ts:13-53`; `agentServer.ts:36-100` | Off-topic gets a polite refusal and no model call | Off-topic phrase: no LLM request logged (`calls: []`, `note: "off-topic"`) | M | unit `agentServer`, `round`, `turn` |
| LLM ladder (Claude first, then Groq; Gemini raced after 3.5 s) | `agentServer.ts:70-95`; `lib/ai/gateway.ts`, `order.ts` | Answer under the deadline; fallback works | Kill the primary key: still answers | M | unit `order`, `gateway` |
| **Stage recipes** (19): `cases, case, news, readings, ranking, compare, trend, why, performance, dashboard, map, nearby, brief, drafts, answer, prices, advise, insight, complete` | `lib/thunai/stage.ts:72`; `screens.ts:163-190` | Each recipe builds a checked Stage document (≤ 6 blocks); numbers come from the data | `cases` count = SQL count for the same slots; the "none today" fallback widens to the week (`agentServer.ts:55-64`) | H | unit `stage.test.ts` |
| HUD (phase, captions, step chips, pointer) | `thunai/Hud.tsx`, `hudcore.ts`, `hudstore.ts` | Shows what Jarvis heard and did | Caption text = the transcript returned by the API | M | unit + e2e `hud.spec.ts` |
| Memory / audit log / pins / questions | `api/collector/thunai/memory`, `audit`; `JarvisLogView.tsx`, `JarvisPins.tsx` | Remembered notes persist per user | Store rows for the user | L | UNTESTED |
| Privacy refusal | `lib/thunai/privacy.ts` | No personal data about citizens | Ask for a complainant's phone number: refused | H | unit `privacy.test.ts` |

---

## 5. Launchers (repo root, read only)

| File | What it does | Risk | Oracle |
|---|---|---|---|
| `host-server.bat` | `cd` into the app; `NEXT_DIST_DIR=.next-prod`; `NODE_EXTRA_CA_CERTS` = Avast cert; builds only if `.next-prod\BUILD_ID` is missing (or the `rebuild` argument); loops `npm run start -- -p 3000` (binds 127.0.0.1) with a 5 s restart | **M: serves a stale build after code changes**; restarts wipe the in-memory rate limits | Compare `.next-prod/BUILD_ID` time with the latest commit time |
| `host-tunnel.bat` | Public HTTPS to 127.0.0.1:3000 through `C:\Users\DELL\cloudflared\cloudflared.exe`, else `ssh -R 80:127.0.0.1:3000 nokey@localhost.run` (`StrictHostKeyChecking=accept-new`); reconnect loop | **H: exposes whatever runs on :3000, including the dev server and its unauthenticated `/api/dev/*`**; hardcoded user path | With the dev server running, `curl <public>/api/dev/thunai/tool` should not answer |
| `start.bat` | Starts portable MySQL `D:\farm\mysql\bin\mysqld.exe`, `cd D:\farm\chennai-grievance-portal-main`, opens the browser, runs `npm run dev` | **M: hardcoded `D:\` paths (repo is on `E:\`)**; the dev server enables `/dev/*` | Run it on this PC: expect a path failure |
| `start-fast.bat` | Same build-once logic as host-server; opens Edge at `/login`; `npm run start -p 3000` | L: stale build as above | Same |

---

## 6. Cross-check: `E:\farm\docs\audits\REQUIREMENTS_MATRIX.md` PARTIAL rows

| Row | Matrix says | Code now |
|---|---|---|
| R2: connect and search across sources | Top search covers zones, departments and incidents only | **Improved.** `intel.ts:1419-1461` now also returns news (word groups, including translated Tamil headlines), sources and a complaint-number lookup; the route adds Studio datasets (`api/collector/search/route.ts:16-17`). Still LIKE-based, capped at 3 or 4 per group. |
| R5: entity extraction | People and organisations come from headlines | Unchanged in shape: `district_intel/dintel/loaders/news.py:306-307` fills `ai_people`/`ai_orgs` from the LLM details; exported through `mysql_export.py:60`. Accuracy needs a sample audit. |
| R6: resolve inconsistent place names | Unresolved places pinned at the centroid, not flagged | Map still places zone pins from ward centroids (`lib/collector/geo.ts:90-101`); no "approximate location" flag found in the console. Still PARTIAL. |
| R7: dedup / clustering | 47 duplicate headlines; simhash pre-merge proposed | `simhash64` is now computed per title (`dintel/loaders/news.py:386, 801`), with union-find dedup (`dedup.py:1`) and a linker (`linking.py:3, 290`). Whether the simhash is used for merging needs the duplicate-headline count re-run. |
| R8: summaries / briefing | Briefing route reviewed; generation not run | `api/collector/assistant/briefing` saves a workspace version + `briefing_archive` (`lib/collector/workspaces.ts:23-32`); `BriefingBook.tsx` EN/TA. Generation still has no test. |
| R9: NL search that changes maps/cards/charts | Live LLM not run | Assistant pipeline + Ask the Map + Jarvis Stage recipes exist; many unit tests; no live end-to-end test. |
| R10: provenance and audit | Audit insert failures swallowed | **Still true** for `audit()` (`lib/collector/sources.ts:47-50`, `.catch` logs only); `auditIn()` (`:53`) is transactional and used by workspaces/decisions. |
| R11: unified search | See R2 | As R2. Still no full-text search over documents. |
| R12: map drill-down | No village level | Zones/taluks switch (`SatMap.tsx:34-40`); ward geometry exists; no village layer (no data). |
| R16: selection cross-filter | News not filtered by zone/department | Now **hidden** rather than unfiltered when any filter is set (`intel.ts:881-883`). Check that the screen says so. |
| R20: customise the dashboard | Overview layout mostly fixed | `Workspace.tsx:9-20`: pages (briefing, trends, environment, studio) and Overview panels (map, snapshot, brief, severity, tasks) can be toggled and saved. Tiles cannot be pinned on page 1. |

---

## 7. Existing tests

**Vitest (`src/**/*.test.ts`, 139 files).**
- API routes: `auth/malformed`, `auth/password-only`, `collector/decisions/route.sqlite`, `collector/jobs/route-news/route`, `collector/sources/[id]/route`, `complaints/media/[name]/route`, `profile/photo/route`.
- Console components: `Attention`, `CollectorApp`, `thunai/Hud`, `hudstore`, `status`, `wake`.
- `lib/ai/*` (6), `lib/assistant/__tests__/*` (25), `lib/aws/*` (4), `lib/collector/*` (25), `lib/map/*` (9), `lib/rehearsal/*` (4), `lib/studio/*` (13), `lib/thunai/*` (26).
- Security and plumbing: `stepup`, `rate-limit`, `session-cookies`, `tab-session`, `auth.revoke`, `netsafe`, `markdown.xss`, `csv`, `etag`, `jobauth`, `secrets`, `db.tls`, `serial`, `scheduler`, `fallback`.
- DB loops: `loop.sqlite`, `complaint-progress(.sqlite)`, `officer/deptlock.sqlite`, `source-hygiene`.

**Playwright (`tests/e2e/*.spec.ts`, 9).** `ambientrate`, `bargein`, `e2e-latency`, `hold`, `hud`, `mode`, `real`, `vad`, `vadfake`. All of them drive Jarvis on `/dev/thunai` or `/dev/collector`. **None signs in, files a complaint, uses the officer console, exports, or opens Data Studio.**

## 8. Coverage gaps (no test reaches them), riskiest first

1. Dev routes and pages exposed when the dev server is tunnelled (`/api/dev/thunai/*`, `/api/rehearsal/dev`, `/dev/*`).
2. Outward email: `actionmail.sendAction` / `sendBatchAction`, `rehearsal/tasks.sendDept`, the `EMAIL_MODE` live/sandbox switch, and the Jarvis tray send.
3. `POST /api/complaints` route (role check missing, no rate limit) and the citizen filing UI.
4. Forgot-password: request-otp, verify-otp, reset-password (no rate limit on the last two).
5. Rate limiting behind a proxy (`TRUST_PROXY_HOPS`), and login lockout by email.
6. `POST /api/i18n`: anonymous LLM calls and cache poisoning.
7. Exports: collector CSV, assistant CSV (no step-up), map CSV/GeoJSON, PDF report, officer PDF, all against the screen.
8. Collector console behaviour on 401 (session expiry or revocation).
9. Officer report upload and rain-task upload routes.
10. Data Studio routes and UI (upload limits, connectors, delete).
11. Source onboarding routes (outward fetch); DELETE/PATCH without step-up.
12. `collector/actions` POST.
13. Workspaces CRUD and the briefing archive.
14. `jarvis/say` / `jarvis/hear` routes; TomTom traffic routes (unbounded tile coordinates).
15. Middleware page gating per role (`/citizen`, `/officer`, `/collector` redirects).
16. Theme and language persistence; Tamil number integrity.
17. Public location/taxonomy GET routes (no rate limit; DB load).
18. The launchers (stale build, wrong paths).
