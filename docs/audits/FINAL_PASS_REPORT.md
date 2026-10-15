# District IQ — final hardening pass: report

Branch `improve/final-pass`, from `improve/chatbot` @ `2c797b3`. 15 Oct 2026. The step-by-step log, with the inventory and every finding's root cause, is in [FINAL_PASS_PROGRESS.md](FINAL_PASS_PROGRESS.md).

## Summary
All phases A–G are done. 40 findings were fixed or verified, each with its own commit:
- 8 security
- 8 static-sweep
- 5 chatbot
- 13 portal end-to-end
- 5 performance
- 1 more chatbot bug from the final live run

The most serious problems fixed:
- **Anyone could forge a Collector session.** When `JWT_SECRET` was missing, tokens were signed with a key that sits in the source code (S-2).
- **Sessions outlived sign-out and password changes.** A session stayed valid for 7 days after the user signed out or changed their password (S-5).
- **The login rate limit could be bypassed.** A fake `X-Forwarded-For` header got a fresh limit on every request (S-4).
- **Tiles and the lists they open disagreed.** "Ongoing 174" opened a list of "160" (B-5).
- **Studio and the death totals were wrong.** Data Studio said "Royapuram 11,84,029 beds" (D-1), and 17 stray dogs were counted in the death totals (D-2).
- **The chatbot got half the golden questions wrong.** Before the fixes it answered 49% of them correctly. It also reported real-vs-synthetic data shares, which the product rule forbids (C-1).
- **Pages waited on the AI and on data loads.** Each Briefing view asked Gemini for a new write-up every minute (E-1). The 5-minute AWS reload froze every request while it ran (E-4).

What I could not do:
- **Two npm vulnerabilities remain.** Both come from Next.js and need a major upgrade (O-4).
- **Accounts in the shared AWS store were not changed.** The seeded accounts still use the published password (O-1). Changing them would write to AWS, which this pass was not allowed to do.

## Findings
| ID | Sev | What the user saw | Fix | Commit |
|---|---|---|---|---|
| S-2 | P0 | Missing `JWT_SECRET` → forgeable sessions | production refuses to start without a ≥32-byte secret | 49a7985 |
| S-4 | P0 | Fake `X-Forwarded-For` got a fresh login limit every time | proxy hops trusted only with `TRUST_PROXY_HOPS` | e462700, bc2b830 |
| S-5 | P0 | Sessions valid 7 days after sign-out / password change | token version checked on every request | 37cbaff |
| S-1 | P0 | Seed script used the published `Passw0rd!` | `SEED_PASSWORD` or a random password | d98cfc2 |
| S-3 | P0/P1 | 10 npm vulnerabilities (2 critical) | jspdf 4, autotable 5, nodemailer 10, overrides → 2 left (Next) | 6f01929 |
| S-6 | P1 | MySQL TLS accepted any certificate | verified by default, `DB_SSL_CA` | e407737 |
| S-8 | P1 | Source changes could go unaudited | audit row in the same transaction | 333f925 |
| S-9 | P2 | No CSP / frame / HSTS headers | full header set in next.config.js | 4bd5d4c |
| B-1 | check | Can an officer act on another department's case? | no — regression test added | ab6e7f5 |
| B-2 | P2 | Complaint codes could be probed (403 vs 404) | both 404 | 808c454 |
| B-3 | P1 | 42 silent `.catch(() => [])` hid failures as "none" | quiet only for a missing table, else logged | 39ff6c3 |
| B-4 | P1 | Due times 5.5 h off on a UTC server | IST formatting | 07e33a9 |
| B-5 | P0 | Tile "174" opened a list of "160"; exports/PDF ignored Collector decisions | one count, decision-adjusted everywhere | c8498f1, f42fe00 |
| B-6 | P1 | Failed CSV export downloaded "undefined" and said success | error + Retry | 5e770ed |
| B-7 | P2 | `sources/abc` sent NaN into SQL | id + body validation | 8a6c483, d583c24 |
| P-6 | P1 | Opening a page started source fetches | background scheduler | fa272ad |
| C-0 | — | No way to test the chatbot end to end | frozen store + `npm run eval:golden` | 6c85a39 |
| C-1 | P0 | Answers showed synthetic-data shares and a badge (against the product rule) | removed everywhere | 0d5c822, b64b7ad |
| C-2/3 | P1 | 38 of 75 golden questions wrong (wards, departments, months, deaths, follow-ups, Tamil…) | routing, places, measures, windows, memory | ea5eb59, b64b7ad |
| C-4 | P1 | Live: chart follow-up errored, "only severe" lost the period, 22.7 s comparisons, "earthquakes" listed everything | exact rules first, keyword fallback | 735bf90 |
| C-5 | P3 | Empty question → "Send { message, consoleScope }." | plain messages | f09ccb9 |
| D-1 | P0 | Studio: "Royapuram 11,84,029 beds" | latest-day filter on per-day tables | 58aa01f |
| D-2/3 | P0 | 17 stray dogs counted as deaths; horoscopes as incidents | animal-death and non-incident rules (TS + Python) | a3a5726, 9c57c10 |
| D-4 | P1 | Double-click filed a complaint twice | client guard + server serialisation | 04ba5f9 |
| D-5 | P1 | Double-click recorded a decision twice | 2-minute repeat check | 6dce336 |
| D-6 | P3 | "null, Royapuram" | place fallback | 081a3a5 |
| D-7 | P1 | Any file accepted as a profile photo under public/ | byte sniffing | 8ddf6a4 |
| D-8 | — | Whole citizen→officer→Collector loop untested | end-to-end test | ad52ccc |
| D-9 | P2 | "3 severe events" beside "0 Severe" | heading says "Open, by severity" | 65b1297 |
| D-10 | P2 | Search found only incidents | + news, sources, datasets, complaint numbers | d7064c9 |
| D-11 | P2 | Workspaces could not be renamed/deleted | owner-only, audited | e4a70a9 |
| D-12 | P1 | Briefing AI text "110 awaiting" beside a tile of 128 | hidden when stale | ae0808e |
| D-13 | P1 | CSV cells could run as Excel formulas | escaped in all exports | 383f28b |
| D-14 | P3 | Studio refusal said "Something went wrong" | the plain reason | e21df25 |
| E-1 | P1 | New Gemini write-up per Briefing view per minute | one per hour | 5382554 |
| E-2 | P2 | 452 kB map outlines; unchanged bodies re-sent | 222 kB, ETag/304 on 4 big routes | 674d4e6 |
| E-3 | P2 | 459 kB overview | 256 kB | e570e8a |
| E-4 | P1 | AWS reload froze all requests | yields every 2,000 rows | a8458e0 |
| E-5 | P1 | First questions waited for a 280 MB model download | ≤1.5 s wait, keyword search meanwhile | f997ae8 |
| G-1 | P0 | Live: "incidents in ward 120 this month" → "zero" (store: 24) | ward questions go to the ward filter | 3aabffc |

## Chatbot scorecard
| Measure | Before | After |
|---|---|---|
| Golden set (75 questions, frozen data, numbers checked by SQL, no AI) | 37/75 (49.3%) | **75/75 (100%)** |
| Golden latency (no AI) | — | p50 82 ms, p95 274 ms |
| Live run, 49 questions (Groq + Gemini) | — | 0 errors, p50 2.1 s, p95 15.3 s |
| Live re-check after fixes (9) | 4 wrong | 9 right; comparison 22.7 s → 0.9 s |
| Final live run (10) | — | 10 answered, 0 errors; 1 wrong (ward 120) → fixed (G-1), re-checked live |
| Live questions used | | 69 of the ~80 budget, never more than 6 a minute |

## Performance
| Endpoint | 13 Oct | Before Phase E | After |
|---|---|---|---|
| Sign in | 94.7 s | 2.0 s cold / 0.09 s | same |
| Overview | 8.5 s | 0.26 s, 459 kB | 0.29 s, **256 kB**; unchanged → 304, 0 B |
| Map outlines | — | 452 kB, 1 h cache | **222 kB**, 1 day cache, 304 on revisit |
| Stories | 14 s | 5.5 s / 0.02 s | AI wait ≤1.5 s; 304 when unchanged |
| Briefing write-up | — | new one per minute | one per hour, 0.05 s cached |
| AWS reload | froze requests | — | requests answered during the load |
| First chat question (fresh machine) | waited for model download | — | ≤1.5 s |

Measured on the dev server (port 3001) on this PC. The production build passes.

## Tests
| Suite | Baseline | Final |
|---|---|---|
| Vitest | 494 passed, 1 skipped | **547 passed**, 1 skipped (parity needs live AWS) |
| Golden (`npm run eval:golden`) | 37/75 | **75/75**, plus the AI-on exact-path test |
| `tsc --noEmit` | clean | clean |
| `next build` | passes | passes |
| district_intel pytest | 97 | **98** |
| chennai_news_pipeline pytest | 90 | 90 |
| `npm audit --omit=dev` | 10 | 2 (Next.js) |

## Decisions for the owner
- **O-1 Seeded accounts in the shared AWS store** still use the published `Passw0rd!`.
  - Recommendation: change those passwords or deactivate the accounts from the PC that saves to AWS, and give judges a separate demo account.
- **O-2 `.env` defines `AADHAAR_ENCRYPTION_KEY` twice.**
  - Recommendation: keep the first value, because dotenv uses the first one and existing rows were encrypted with it. Delete the second line.
- **O-3 Deployment settings.** Any deployment behind a proxy must set `TRUST_PROXY_HOPS=1`. A MySQL provider whose certificate cannot be verified needs `DB_SSL_CA`.
- **O-4 Upgrade Next.js 14 → 15/16.** This clears the last 2 audit items.
  - Plan: async `cookies()`/`headers()` in lib/auth.ts, React 19 and the renamed config keys.
  - Recommendation: do it right after the demo, not before.
- **O-5 Duplicate Data Studio datasets.** These are listed in the progress file and were not deleted, per the rules.
  - Recommendation: delete the older copies.

## Next steps
1. Settle O-1 and O-2 before the demo. Each is a few minutes of work.
2. Do the Next.js upgrade (O-4) on its own branch, then run the full suite, the golden set and a click-through.
3. Re-freeze the golden store after each pipeline build (`npm run eval:freeze`). Add every wrong live answer as a golden case.
4. Test the profile mobile OTP with a test SMS gateway. It was not run here because it would send a real SMS.

## Branch
`improve/final-pass`: the commits after `2c797b3`, up to the commit that adds this report.
