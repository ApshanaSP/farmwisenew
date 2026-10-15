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
| `/citizen`, `/citizen/file-complaint`, `/citizen/track-complaints` | middleware: citizen cookie | ☑ (filed 3 test complaints locally; double submit D-4; tracking D-6) |
| `/profile` | middleware: any session | ☑ (photo upload sniffing D-7; mobile OTP not exercised: it would send an SMS) |
| `/officer` | middleware: officer cookie | ☑ (approve/close a test incident; 375 px check; dept lock B-1) |
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
| S-1 | Security | P0 | Seed script created Collector/officer/citizen with published `Passw0rd!` | hard-coded password | `SEED_PASSWORD` (≥12 chars) or random 24-char password printed once; README updated. Existing AWS accounts untouched → owner decision O-1 | scripts/seed-users.js, README.md | n/a (script) | fixed d98cfc2 / decision |
| C-0 | Chatbot test harness | — | No way to test the chatbot end to end without live AI and live data | — | `scripts/freeze-eval-store.cjs` freezes the current build (read-only manifest call; personal rows stripped; `eval/store/` gitignored); `store.ts` exposes `buildDb`/`applyBuildHooks`/`poolOver` so the frozen build is loaded exactly like the live one; `npm run eval:golden` runs the real `ask()` with the clock pinned, AI off, meaning-search off | store.ts, harness.ts, vitest.golden.config.ts | golden set | done 6c85a39 |
| C-1 | Chatbot / product rule | P0 | Answers said "1,187 of 1,221 incidents come from test (synthetic) sources", a "Test data" badge, "Hospital readings are test data" — against the standing decision (no real/synthetic counts or badges) | synthetic-share caveats in tools, pipeline, prompts, card UI | removed caveats/facts/badge/Sources row; composer + planner told never to mention it; help text neutral | tools.ts, pipeline.ts, help.ts, composer.ts, planner.ts, catalog.ts, AnswerCard.tsx, text.ts | golden `ALWAYS` check | fixed 0d5c822, b64b7ad |
| C-2/C-3 | Chatbot routing (no-AI path) | P1 | Golden set on the pre-fix code: **37/75 (49.3%)**. Zones/wards by number, departments (Metrowater, PWD, SWM, TNPCB, police), named months, "since Diwali", deaths, "what changed", "what should I focus on", follow-up chart, "and last month?" after a failed turn, reset, thanks, Studio datasets all failed; "news about flooding" led with an MRTS fall; "how many open grievances" gave a 4-KPI dump; "what is happening in Velachery" gave the help text; Tamil answers had English nouns; a 5,000-char message lost its place | dept alias table only in the LLM route; `resolve_place` had no numbers; counts had no measure; topic news matched any mis-filed article; clarify turns overwrote memory; help regex caught "what is"; assistant "open" used the raw pipeline flag (disagreed with tiles after a decision) | `deptwords.ts` shared; `numberedPlace()`; count measures (deaths/complaints/vs previous); exact calendar windows (`range`); topic = ≥50% of a story's filed articles; memory survives clarify/refusal; `RESET`/`sinceReset`; thanks/bye replies; keyword search fallback with a plain "no records match"; `studiolink.ts` → Studio's own analyst (engine computes numbers) with a guard so uploaded files never hijack district questions; decision-adjusted open/status in all assistant queries; Tamil incident kinds | intent, fastpath, incidents, tools, pipeline, guard, direct, news, cards, deptwords, studiolink | **golden 75/75 (100%)**, p50 82 ms / p95 274 ms (no AI); countlang test updated | fixed ea5eb59, b64b7ad |
| C-4 | Chatbot (live) | P1 | Live run found: "show as a chart" after a count → error; "only severe" lost the period (90 days instead of 7); "this month vs last month complaints" took 22.7 s (router → planner, 3 models); "earthquakes this week" listed every incident, then (after a first fix) "Three earthquakes recorded" from nearest-in-meaning records | router path ignored the rules' exact readings; follow-up regex lacked "only/just"; meaning search returned unrelated neighbours for an unknown subject | exact rules first for chart-after-count, period-vs-period and death counts; "only/just" follow-ups; unknown subject → keyword search, meaning matches must name the subject | pipeline.ts, decide.ts, tools.ts | golden 75/75; live re-check 9 questions all correct | fixed 735bf90 |
| C-5 | Chatbot robustness | P3 | Empty / 1,600-char message answered "Send { message, consoleScope }." | generic zod error | "Type a question first." / "keep it under 1,500 characters" | chat/route.ts | curl | fixed f09ccb9 |
| D-1 | Data Studio numbers | P0 | Live: "hospital beds by zone" → **"Royapuram 11,84,029 beds"** (BUG-2 again, via Studio's Ask) | `checkPlan` never added the latest-period filter for per-day (panel) tables; dashboards/drill/insights did | per-day table read at its latest date unless the question is a trend or names dates → Royapuram 6,571 | studio/ai.ts | studio.test.ts (+1) | fixed 58aa01f |
| D-2 | News numbers | P0 | "17 stray dogs found dead in Madambakkam; IT employee arrested" was a news incident with **dead = 17** in the death totals; no horoscope/obituary rule existed | death counts never checked who died | `animalDeathsOnly()` (English + Tamil, people-death words win) → `dead_reported`, not counted; `notAnIncident()` drops horoscopes and natural-death obituaries; hook bumped to news-sanity@5 | newssanity.ts, derive.ts | newssanity.test.ts (+4, real headlines) | fixed a3a5726 |
| D-3 | Pipeline news | P2 | same gap in the Python loader | — | `not_an_incident()` mirror in loaders/news.py | district_intel | test_news_sanity.py (+1) → 98 passed | fixed 9c57c10 |
| D-4 | Citizen filing | P1 | A double-clicked "Submit" filed the same complaint twice (two numbers); the citizen header overflowed at 1024 px | no client guard; no server check | `submittingRef` guard; server files one complaint at a time per citizen (`lib/serial.ts`) and an identical repeat within 2 min returns the first number (`duplicate: true`); header `whitespace-nowrap`/`min-w-0` | file-complaint page, api/complaints, serial.ts, Header.tsx | serial.test.ts | fixed 04ba5f9 |
| D-5 | Collector decisions | P1 | A double-clicked decision was recorded and audited twice | no repeat check | the same decision by the same person on the same incident within 2 min is not recorded again | api/collector/decisions | route.sqlite.test.ts | fixed 6dce336 |
| D-6 | Wording | P3 | "null, Royapuram" on complaints and insights without a locality | string join of a null | place fallback | track-complaints page, Insights.tsx | browser | fixed 081a3a5 |
| D-7 | Uploads | P1 | Profile photo accepted any file the browser labelled image/* and wrote it under public/ | trusted `file.type` | magic-byte sniff (JPEG/PNG/WebP) before writing | api/profile/photo | route.test.ts | fixed 8ddf6a4 |
| D-8 | End-to-end loop | — | No test covered the whole loop | — | complaint → officer approves + report with photo → Collector verifies → citizen sees "Verified by Collector" and the photo; another citizen cannot | loop.sqlite.test.ts | 1 test | added ad52ccc |
| D-9 | Numbers wording | P2 | "3 severe events" beside a "0 Severe" tile | panel counted open only, heading didn't say so | heading "Open, by severity" | Overview.tsx, Board.tsx | browser | fixed 65b1297 |
| D-10 | Search | P2 | Console search found only incidents/zones/departments | — | also news, connected sources, Data Studio datasets, complaint numbers | intel.ts, search route, CollectorApp, Shell | browser | fixed d7064c9 |
| D-11 | Workspaces | P2 | Saved workspaces could not be renamed or deleted | no API | PATCH/DELETE (owner only, every version, audited); inline rename/delete | workspaces.ts, route, Workspace.tsx | browser | fixed e4a70a9 |
| D-12 | Briefing numbers | P1 | The pipeline's AI opening said "110 awaiting" beside a live tile of 128 | AI text written at build time | hidden once its figures no longer match the live tiles | briefbook.ts | — | fixed ae0808e |
| D-13 | Exports | P1 | A headline starting with `=`/`+`/`-`/`@` ran as a formula in Excel | raw CSV cells | `csvCell()` writes them as text, in all 4 exports | lib/csv.ts + 4 routes | csv.test.ts | fixed 383f28b |
| D-14 | Data Studio | P3 | A refused file said "Something went wrong" | parse errors not marked as user errors | `UserError` with the plain reason ("The file has a header but no rows.") | studio parse.ts, pipeline.ts, http.ts | — | fixed e21df25 |
| E-1 | Performance / AI cost | P1 | Each Briefing view asked Gemini for a new write-up (~2,900 tokens, 7 s) every minute | facts stamped to the minute, so the cache key changed every minute | facts time rounded to the hour | aibrief.ts | — | fixed 5382554 |
| E-2 | Performance | P2 | Map outlines 452 kB on every console load; big endpoints re-sent unchanged bodies | zone outlines stored as 2-point segments; no ETag | segments joined into lines + Douglas–Peucker at ~10 m → **222 kB**, cached a day; `jsonWithEtag` on overview / insights / stories / geo → **304, 0 bytes** when unchanged | geo.ts, etag.ts, 4 routes | geo.test.ts (4), etag.test.ts (3) | fixed 674d4e6 |
| E-3 | Performance | P2 | Overview payload 459 kB, 210 kB of it story articles the card never shows | full `days[]` per story | card gets an `updates` count; Stories view still loads its own full data → **256 kB** | intel.ts, threads.ts, Stories.tsx | collector suite | fixed e570e8a |
| E-4 | Performance | P1 | The 5-minute AWS reload and a new build inserted every row in one synchronous run, freezing all requests meanwhile | sync loops on the main thread | `breathe()` yields every 2,000 rows (the database being filled is not shared yet, so pausing mid-transaction is safe) | aws/store.ts | store.breathe.test.ts (2); golden on the changed `buildDb` | fixed a8458e0 |
| E-5 | Performance | P1 | On a fresh machine the first questions waited for the ~280 MB embedding model download | question-time `embed()` awaited the loader | `embed(..., { quick: true })` waits at most 1.5 s, then keyword search answers while the model keeps loading | embed.ts, lance.ts, examples.ts, news.ts | assistant suite, golden | fixed f997ae8 |
| G-1 | Chatbot (live) | P0 | Final live run: "incidents in ward 120 this month" → **"Ward 120 recorded zero incidents"**; the store has 24 | the router matched "Ward 120" as a place name in titles | a plain list/count for a numbered ward goes straight to the store's ward filter | pipeline.ts | exact.golden.ts (fails on old code) | fixed 3aabffc |

### Chatbot scorecard
| Measure | Before | After |
|---|---|---|
| Golden set, no AI (75 questions, numbers re-computed by SQL) | 37/75 (49.3%) | **75/75 (100%)** |
| No-AI latency (golden) | — | p50 82 ms, p95 274 ms |
| Live (Groq + Gemini), 49 questions | — | 0 errors; p50 2.1 s, p95 15.3 s; 40 used a model, Gemini answered when Groq models were busy |
| Live re-check after C-4 (9 questions) | 4 wrong | all correct; period-vs-period 22.7 s → 0.9 s |
| Final live run (10 questions, after Phase E) | | 10/10 answered, 0 errors; 1 wrong (ward 120 → zero) fixed as G-1 and re-checked live |
| Live questions used | | 69 of the ~80 budget |

### Performance (dev server on this PC, port 3001; Collector session)
| Endpoint | 13 Oct (review) | Before this phase | After |
|---|---|---|---|
| Sign in | 94.7 s (cold) | 2.0 s cold / 0.09 s warm | same |
| `/api/collector/overview` | 8.5 s | 0.26 s, 459 kB | 0.29 s, **256 kB**; unchanged → **304, 0 B** |
| `/api/collector/geo` | — | 0.70 s, 452 kB, `max-age=3600` | **222 kB**, `max-age=86400`; revisit → 304, 0 B |
| `/api/collector/stories` | 14 s | 5.5 s first / 0.02 s cached | AI wait capped at 1.5 s (already); 304 when unchanged |
| `/api/collector/brief` | — | new Gemini write-up every minute (~2,900 tokens, 2.5–7 s) | one per hour; 0.05 s cached |
| `/api/collector/insights` | — | 1.9 s / 0.9 s, 199 kB | 304 when unchanged |
| Chat, first question on a fresh machine | waited for the 280 MB model | — | ≤ 1.5 s wait, keyword search meanwhile |
| AWS reload / new build | froze every request for the load | — | yields every 2,000 rows |
| Chat (golden, no AI) | — | — | p50 82 ms, p95 274 ms |
| Chat (live, models on) | — | — | p50 2.1 s, p95 15.3 s (49 q); final 10: 0.05–9.2 s |

No model runs while a page loads: the Briefing write-up is cached per hour, stories wait at most 1.5 s for the model and are otherwise served from rules, and the overview/insights/geo routes call no model.

## Phase F — UX checks
- Collector console at 1366×768: one screen, no horizontal overflow, 360 map shapes drawn with the simplified outlines; current load all 200s, no new console errors.
- 375 px (phone): home, login, officer console — no horizontal scroll.
- Dates: every formatter uses IST and day-month order; every number formatter uses `en-IN` (no locale-less `toLocaleString`).
- Dialogs: search palette, assistant, detail panel, onboarding, rename all close on Esc (code-checked; the hidden browser pane pauses framer-motion exit animations, so closing could not be watched).
- Frames: the new `frame-ancestors 'none'` blocks the app inside an iframe, as intended.

## Phase G — final verification (15 Oct, after all fixes)
| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| Vitest | **60 files, 547 passed**, 1 skipped (parity, needs live AWS) — baseline 494 |
| Golden (`npm run eval:golden`) | **75/75 (100%)** + exact-path test (AI on, no model call) |
| `next build` (into `.next-build`) | passes; tsconfig.json reverted |
| district_intel pytest | **98 passed** (baseline 97) |
| chennai_news_pipeline pytest | **90 passed** |
| `npm audit --omit=dev` | 2 (both Next.js → O-4), baseline 10 |
| Final live questions | 10 + 1 re-check; 69 of ~80 used in the session |

## Decisions for the owner
- **O-1 Seeded accounts in the shared AWS store** still use the published password. Recommendation: change their passwords (or deactivate them) from the saving PC; then give judges a separate demo account.
- **O-2 `.env` defines `AADHAAR_ENCRYPTION_KEY` twice** (both 32 chars). I did not edit `.env`. Recommendation: delete one line; check which value encrypted existing rows first (dotenv keeps the first).
- **O-4 Next.js 14 → 15/16** (the 2 remaining audit items, incl. critical RSC DoS / cache poisoning / smuggling). Plan: branch; `npx @next/codemod@latest upgrade`; make `cookies()`/`headers()` async in lib/auth.ts, middleware unchanged; React 19 for 15+; re-check `experimental.instrumentationHook` (stable in 15) and `serverComponentsExternalPackages` → `serverExternalPackages`; run the full suite + click-through. Risk: medium (auth helpers are sync today and used in ~25 routes). Recommendation: do it right after the demo, not before.
- **O-5 Duplicate Data Studio datasets** (not deleted, per the rules): "Citizen Grievances" ×3, "Chennai Corporation Public Grievances and Complaints" ×2 (+2 near-identical names), "Storm-water drain desilting register (sample)" ×2, "Ration shop stock (Tamil headers) (sample)" ×3, "Fever & dengue surveillance (sample)" ×2, "Google News Feed Summary" ×2, "Property Valuation Details" ×2, "Chennai Metro Stations List" ×2, and two copies of the hospital file under different names ("Chennai Hospital Daily Health Metrics", "Chennai Hospital Capacity and Disease Data"). The chatbot lists each name once (newest). Recommendation: delete the older copies from Data Studio.
- **O-3 Railway / any proxy deployment** must set `TRUST_PROXY_HOPS=1`; a provider whose MySQL certificate cannot be verified needs `DB_SSL_CA` (or, last resort, `DB_SSL_INSECURE=true`).
