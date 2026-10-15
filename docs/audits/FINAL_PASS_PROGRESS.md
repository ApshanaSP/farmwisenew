# Final pass — progress log

Branch: `improve/final-pass` (from `improve/chatbot` @ 2c797b3). Started 15 Oct 2026.

## Baseline (Phase A)

| Check | Result |
|---|---|
| Vitest | 41 files, **494 passed**, 1 skipped (parity, needs live AWS) — up from 475 on 13 Oct |
| `tsc --noEmit --incremental false` | clean |
| `next build` (into `.next-build`) | **passes** (collector 223 kB first load, officer 217 kB, citizen 162–176 kB, middleware 30.9 kB) |
| district_intel pytest | **97 passed** (a first run collided with the concurrent Vitest run and reported 2 collection errors; re-run alone: 97 passed) |
| chennai_news_pipeline pytest | **90 passed** |
| `npm audit --omit=dev` | 10 vulns (2 critical, 7 high, 1 moderate): next (critical, fix = Next 16 major), jspdf/dompurify (fix = jspdf 4 major), jspdf-autotable (5 major), nodemailer (10 major), postcss via next, sharp via @lancedb/lancedb (fix = downgrade to 0.30), source-map-js (non-breaking fix) |

Notes: `next build` adds its dist folder to `tsconfig.json` `include`; reverted after each build so the tree stays clean.

## Inventory

### Pages (src/app)
| Page | Guard | Tested |
|---|---|---|
| `/` | redirects by session | ☐ |
| `/login` | public | ☑ (sign-in as seeded Collector, 1.4 s) |
| `/register`, `/forgot-password` | public; signed-in citizen redirected | ☐ |
| `/citizen`, `/citizen/file-complaint`, `/citizen/track-complaints` | middleware: citizen cookie | ☐ |
| `/profile` | middleware: any session | ☐ |
| `/officer` | middleware: officer cookie | ☐ |
| `/collector` | middleware: collector cookie | ☑ (loads, no console errors, tiles under CSP) |
| `/dev/ui` | public (component gallery) | ☐ |

### API routes (src/app/api) — method · auth
Middleware does not cover `/api`; every route guards itself.

| Route | Methods | Auth |
|---|---|---|
| auth/login, register, forgot-password/{request-otp,verify-otp,reset-password} | POST | public, rate-limited |
| auth/logout | POST | portal session |
| auth/me | GET | session |
| collector/* (35 routes: overview, list, geo, stories, brief, insights, news, news/analysis, news/article, pattern, report, search, export, audit, decisions, actions, incidents/[id], incidents/[id]/action, incidents/[id]/analysis, sources, sources/[id], sources/ocr, sources/onboard{,/preview,/approve}, studio, studio/[id], workspaces, workspaces/[id]) | GET/POST/PATCH/DELETE | `collectorSession()` (collector cookie, active) |
| collector/assistant/{chat,export,feedback,insights,pins,sessions,sessions/[id],status} | GET/POST/DELETE | `assistantSession()` (Collector, or officer locked to own dept) |
| collector/assistant/{briefing,tools} | POST / GET,POST | `collectorSession()` |
| collector/jobs/route-news | POST | `x-job-key` (REFRESH_API_KEY) |
| officer/{overview,grievances,grievances/[id],grievances/[id]/report,insights,geo,search} | GET/POST | `officerSession()` (officer cookie, dept from DB) |
| officer/photos/[dir]/[name] | GET | any active session + ownership check |
| complaints | GET, POST | citizen session |
| complaints/[code] | GET | citizen + ownership |
| complaints/media | POST | active session, rate-limited |
| complaints/media/[name] | GET | any active session + ownership |
| profile, profile/{photo,change-password,mobile-otp/request,mobile-otp/verify} | GET/PUT/POST | session |
| complaint-types, complaint-taxonomy, departments, locations/* (9) | GET | public reference data |

### Console panels
Collector: Overview (KPIs, SatMap, severity list, My Tasks, Latest news), Briefing, Trends (Insights), Environment, Data Studio, Stories, Sources (+Onboard), Take Action, Workspaces, Detail panel, search, CSV/PDF exports, Ask District IQ. Officer: board, drawer, stages, report, insights, PDF. Citizen: home, file complaint (4 steps), track, profile.

## Findings

| ID | Area | Sev | Symptom | Root cause | Fix | Files | Test | Status |
|---|---|---|---|---|---|---|---|---|
| S-2 | Security | P0 | Missing `JWT_SECRET` → tokens signed with a key in the source; anyone could forge a Collector session | `jwt.ts`/`crypto.ts` fallbacks | `lib/secrets.ts`: production throws at server start (instrumentation) and on first use when a secret is missing or < 32 bytes; labelled dev fallback only outside production; read lazily so builds compile | secrets.ts, jwt.ts, crypto.ts, instrumentation-node.ts | secrets.test.ts (3) | fixed 49a7985 |
| S-4 | Security | P0 | Fake `X-Forwarded-For` gave a fresh login bucket on every request; buckets never purged | `getClientIp` trusted the left-most XFF hop | XFF read only with `TRUST_PROXY_HOPS=n` (n-th from the right); otherwise one shared bucket with 10× allowance; expired buckets swept at 10k keys. AI budget is per account, not IP — unaffected | rate-limit.ts, login/register/request-otp routes, DEPLOYMENT.md | rate-limit.test.ts (5) | fixed e462700, bc2b830 |
| S-6 | Security | P1 | URL-based MySQL connections accepted any certificate | `rejectUnauthorized: false` | Verified by default; `DB_SSL_CA` for a provider CA; `DB_SSL_INSECURE=true` explicit opt-out; same in scripts/db-config.js | db.ts, scripts/db-config.js, DEPLOYMENT.md | db.tls.test.ts (4) | fixed e407737 |
| S-5 | Security | P0 | Sessions stayed valid 7 days after sign-out / password change / reset; citizen routes did not re-check `is_active` | stateless JWT, `getSessionFromCookies` never touched the DB | `users.token_version` (migration 013; AWS store adds the column on every load via `DURABLE_ADDED`); token carries `tv`; every session read checks active + version; logout, change-password, reset raise it; change-password re-issues this browser's cookie | auth.ts, types, login/logout/change-password/reset routes, aws/store.ts, migrations/013 | auth.revoke.test.ts (4) | fixed 37cbaff |
| S-8 | Security | P1 | Audit failures on source add/update/remove/onboard were swallowed with a warn | `audit()` caught and continued outside any transaction | `auditIn()` inside one transaction with the change (rollback if the row fails); `audit()` for convenience actions now logs actor/action/record at error level. Decisions, actions, officer steps were already transactional | collector/sources.ts, onboard.ts | sources.audit.test.ts (2) | fixed 333f925 |
| S-9 | Security | P2 | No CSP / frame / referrer / HSTS headers | none configured | `next.config.js` headers(): CSP (allows OSM/Esri tiles, Google Fonts, Google Maps, Tesseract CDN), frame-ancestors none, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS in prod, `poweredByHeader: false`. Checked: Collector console loads, tiles + fonts render, 0 console errors | next.config.js | browser check | fixed 4bd5d4c |
| B-1 | Officer lock | P0 check | Could an officer read/act on another department's grievance by id? | — (lock holds: every officer query filters `lead_dept`; `recordStep` re-reads the stage row under a per-grievance lock) | Regression test on SQLite via the AWS dialect | lib/officer/deptlock.sqlite.test.ts | 3 tests | verified ab6e7f5 |
| B-2 | Citizen privacy | P2 | `GET /api/complaints/<code>` answered 403 for someone else's code and 404 for a missing one, so codes could be probed | ownership check returned a distinct status | Both answer 404 "Complaint not found"; ids compared as numbers | api/complaints/[code]/route.ts | — | fixed 808c454 |
| P-6 | GET side effects | P1 | Opening the Overview or Data Studio started source fetches and dataset refreshes | `runDueSources()`/`runDueRefreshes()` in GET handlers | `lib/scheduler.ts` started once from instrumentation (every minute, first after 1 min); removed from overview/studio GETs | scheduler.ts, instrumentation-node.ts, overview, studio routes | scheduler.test.ts | fixed fa272ad |
| B-3 | Swallowed errors | P1 | 42 `.catch(() => [])`/`null` on queries hid real failures as "none" on the console and in the chatbot | blanket catch meant for optional tables | `lib/fallback.ts` `orEmpty/orNull(where)`: quiet only for a missing table/column, otherwise logged with file:line; briefbook `safe()` uses it. Non-DB catches (LanceDB opens, JSON parse of fetched pages) left as they were. The 55 empty `catch {}` blocks were reviewed: all are deliberate (storage blocked, already-closed handles, URL parsing) | 19 lib files | fallback.test.ts | fixed 39ff6c3 |
| B-4 | Time zone | P1 | On a server running in UTC, times passed as `Date` (e.g. an action's due time) were stored 5.5 h behind `NOW()` | `sqlDate()` formatted in the server's local zone; store is IST | `sqlDate()` formats IST; actions route passes an IST string | aws/dialect.ts, api/collector/actions | dialect.test.ts | fixed 07e33a9 |
| B-5 | Numbers | P0 | **"Ongoing incidents 174" tile opened a list saying "160 incidents"**; "Severe, not yet checked 19" opened 18. Snapshot "past deadline" / "serious" and the CSV export / PDF / search used the raw `is_open`, so a Collector "resolve" left them stale | list `total` = `COUNT(DISTINCT cluster)` (rows) labelled as incidents; snapshot/export used pipeline flag, tiles use the decision-adjusted flag | list returns `incidents` (`COUNT(*)`) and `total` (rows); header reads "173 incidents in 159 rows (similar reports grouped)"; snapshot, dept/area snapshot, export, report, search use `EFF.open`; list fetch shows error + Retry instead of crashing on a 500 | intel.ts, Overlays.tsx | consistency.sqlite.test.ts (3, fail on old code) | fixed c8498f1, f42fe00 |
| B-6 | Error states | P1 | CSV export on a server error downloaded a file containing "undefined" and toasted success; Workspaces showed "No saved workspaces yet" when loading failed | `r.json()` without `r.ok` | check `r.ok`/shape; alert + Retry | Overlays.tsx, Workspace.tsx | browser | fixed 5e770ed |
| S-3 | Dependencies | P0/P1 | npm audit: 2 critical, 7 high, 1 moderate | old jspdf/autotable/nodemailer; LanceDB pulling transformers 3 + sharp 0.33 | jspdf 4.2.1, jspdf-autotable 5.0.8, nodemailer 10.1.1 (+ types 8), `npm audit fix` (source-map-js), `overrides` so LanceDB uses transformers 4.3 (its optional embedding registry is unused). **Audit: 10 → 2 (both Next.js)**. Collector PDF rendered from the live payload with jspdf 4: 3 pages, headings and numbers correct | package.json, lock, mailer.ts | full suite; PDF check | fixed 6f01929 |
| B-7 | Validation | P2 | `sources/[id]` passed `Number("abc")` (NaN) into SQL; PATCH said 500 for a missing source; workspace id unchecked | no id/body validation | id regex, zod PATCH body (15–1440 min), 404 for not found | sources/[id], workspaces/[id] | route.test.ts (2) | fixed 8a6c483, d583c24 |
| S-1 | Security | P0 | Seed script created Collector/officer/citizen with published `Passw0rd!` | hard-coded password | `SEED_PASSWORD` (≥12 chars) or random 24-char password printed once; README updated. Existing AWS accounts untouched → owner decision D-1 | scripts/seed-users.js, README.md | n/a (script) | fixed d98cfc2 / decision |

## Decisions for the owner
- **D-1 Seeded accounts in the shared AWS store** still use the published password. Recommendation: change their passwords (or deactivate them) from the saving PC; then give judges a separate demo account.
- **D-2 `.env` defines `AADHAAR_ENCRYPTION_KEY` twice** (both 32 chars). I did not edit `.env`. Recommendation: delete one line; check which value encrypted existing rows first (dotenv keeps the first).
- **D-4 Next.js 14 → 15/16** (the 2 remaining audit items, incl. critical RSC DoS / cache poisoning / smuggling). Plan: branch; `npx @next/codemod@latest upgrade`; make `cookies()`/`headers()` async in lib/auth.ts, middleware unchanged; React 19 for 15+; re-check `experimental.instrumentationHook` (stable in 15) and `serverComponentsExternalPackages` → `serverExternalPackages`; run the full suite + click-through. Risk: medium (auth helpers are sync today and used in ~25 routes). Recommendation: do it right after the demo, not before.
- **D-3 Railway / any proxy deployment** must set `TRUST_PROXY_HOPS=1`; a provider whose MySQL certificate cannot be verified needs `DB_SSL_CA` (or, last resort, `DB_SSL_INSECURE=true`).
