# District IQ — Final audit report

Date: 2026-10-08 · Repository: `D:\farm` · Mode: read-only (no code, data, schema or env changes; only `docs/audits/*` written).
Companion files: `ARCHITECTURE_REVIEW.md`, `REQUIREMENTS_MATRIX.md`, `FUNCTIONAL_TEST_MATRIX.md`, `FINDINGS.md`, `IMPROVEMENT_ROADMAP.md`, `AUDIT_PROGRESS.md`.

**Coverage, honestly:** I read the requirements PDFs, all 71 API routes for auth, and the core server modules (`intel.ts`, the assistant pipeline, guard, compiler, gateway, the AWS store, sources/onboarding/Studio fetchers) and pipeline docs. I ran all four test suites and type checks, queried the live data build, ran a 55-question benchmark of the assistant's rules layer, and made unauthenticated API probes.
**Not done:** logged-in UI walkthroughs, live LLM answers, map and chart interactions, a production build, load tests. Those categories are marked provisional.

## 1. Executive verdict — **6.5 / 10** (provisional)
District IQ is an unusually complete prototype. It covers 8 data feeds, a real AI architecture where the LLM proposes and code computes, verified numbers, versioned workspaces, an audit log, Tamil and Tanglish support, source onboarding with logins, a Data Studio, and about 510 automated tests (508 passing).
Its main weakness is **trust in what it shows, not missing features.** 96.8% of incidents, and **100% of Severe and multi-source incidents, are synthetic**, and the Collector console never says so. 58% of real news incidents are pinned to one fallback point. Real fatal news events can never reach the Severe queue. The cross-source linker is unmeasured on real data. Every copy of the site also downloads all password hashes and citizen PII with one shared key.
Fixing those five issues is mostly small work, and it would move the product from "impressive demo" to "credible system". That is the difference judges probe for.

## 2. What is built
See `ARCHITECTURE_REVIEW.md`. In short: Python collectors and generators → `district_intel` pipeline (classification, geo, overlay, dedup, linking, priority, anomalies, agents) → SQLite build in S3 → Next.js 14 app serving it from in-memory SQLite (MySQL queries translated), with a DynamoDB durable store for users, complaints and Collector work → Collector, officer and citizen portals, plus Ask District IQ (Groq → Gemini).

## 3. Architecture
See the diagram in `ARCHITECTURE_REVIEW.md`. Main architectural risks: MySQL→SQLite dialect translation plus runtime build hooks (CODE-001), a single-writer durable store tied to one PC, and in-memory rate limits and budgets.

## 4. Functional verification
See `FUNCTIONAL_TEST_MATRIX.md`. Web 330/330 (+1 skipped), tsc clean, news 90/90, **pipeline 88/90 (2 failing)**. Auth probes are correct. Rules-layer benchmark: 33/55 correct, 2 false refusals, 9/10 unsafe prompts refused by the guard.

## 5. Requirements compliance
See `REQUIREMENTS_MATRIX.md`: 10 PASS (6 static-only), 11 PARTIAL, 1 NOT VERIFIED, 0 MISSING, 1 waived (provided systems). Every capability in the brief has an implementation. The partials are about evidence quality.

## 6. Collector perspective
- **Morning briefing:** well structured (periods, briefing notes, stories grouped across outlets, Tamil). But the "critical" items are synthetic and unlabelled, and there is no "changed since yesterday" view.
- **Investigating an incident:** the evidence panel, timeline and officer reports are good. The Collector cannot tell which members are generated, and 15 km "locations" look exact.
- **Geography:** ward and zone are consistent (0 mismatches). Taluk is approximate. Unlocated news incidents vanish from area filters.
- **Department performance:** backlog, deadlines and department navigation exist. Tiles lag the Collector's own decisions (KPI-001).
- **NL investigation:** strong with the LLM (not verified live). The keyword fallback breaks follow-up context (Scenario E).
- **Action:** decisions, assignments, officer completion reports with photos, and a verification queue all exist. Automatic routing happens as a side effect of page views (BE-001).

## 7. AI review
The design is the best part: plan → compiled parameterised SQL, a numeric verifier, a chart checker, a model pool with fallback, untrusted text kept out of logs. Weak points: the regex guard (false positives, AI-001), a fallback router that is frequently active, read-only and timeout guards that are no-ops on the AWS backend (AI-003), news classifier recall of 0.57, and a linker trained on planted pairs (LINK-001).

## 8. Data engineering
The real feeds are fresh in the live build, except CPCB (stale 9 h) and IMD (degraded). Provenance flags exist in the data but are hidden. Incident ids have been stable since round 20. The news fix work is uncommitted, and 47 duplicate headlines remain.

## 9. GIS
200 wards, 15 zones, point-in-polygon and Tamil aliases are solid. Weaknesses: centroid fallback plotted as points (GIS-001), and taluk by synthetic majority vote (GIS-002).

## 10. Backend and database
Parameterised SQL everywhere I looked. Zod validation on the assistant, workspace and source routes. Problems: GET with writes, KPI/decision drift, about 22 queries per overview poll without caching, best-effort audit.

## 11. Security
High: SEC-001 (PII and hashes on every PC through a shared key), SEC-002 (unauthenticated upload into `public/`). Medium: SEC-003 (SSRF bypass on the direct source API), SEC-004 (JWT fallback secret, TLS not verified, in-memory limits). Good: per-portal cookies, role checks on every collector and officer route, officer department taken from the DB, bcrypt, OTP never echoed in production, encrypted source secrets.

## 12. Frontend
Not driven (no credentials). Static review only: loading and error states exist in the main panels, and SSE cancels a previous question. NOT VERIFIED: dead buttons, hydration, map interactions.

## 13. Bugs and risks
Ranked list with evidence in `FINDINGS.md` (P0: DATA-001, SEC-001, SEC-002, GIS-001, BE-001, KPI-001, AI-001, TEST-001).

## 14. Missing high-value features
"Changed since yesterday"; an unverified-but-serious lane; per-item freshness; unified search over news and sources; pinning chatbot answers to the Overview; accuracy panels (linker, dedup, classifier); intervention before/after checks.

## 15. Competitive differentiation
**Strong:** the LLM-proposes, code-computes design with number verification; Tamil and Tanglish; source onboarding with logins and robots compliance; anomaly detection with FDR control. A general BI tool does not have these.
**Weak against command-centre products:** live departmental feeds are synthetic, there is no accuracy reporting, and no closed-loop SLA escalation.
**Potentially exceptional:** an evidence-graded briefing plus a "news vs department gap" board plus a rain-to-complaint early warning, all running on real feeds.

## 16. Top 20 improvements (most impactful first)
| # | Problem | Solution | Effort | Priority |
|---|---|---|---|---|
| 1 | Synthetic data unlabelled | Provenance chips, a Real-only toggle, a banner | M | P0 |
| 2 | PII and hashes on every PC | Split keys, strip PII, rotate | M | P0 |
| 3 | Centroid pins | Hide pins over 2 km; add an unlocated bucket | S | P0 |
| 4 | Unauthenticated upload | Auth plus private storage | S | P0 |
| 5 | Real deaths never Severe | Unverified-serious lane | S | P0/P1 |
| 6 | Guard false refusals | Imperative-only rules, plus tests | S | P0 |
| 7 | GET writes assignments | Move to cron, audit it | S | P0 |
| 8 | KPIs ignore decisions | Apply decisions in SQL | S | P0 |
| 9 | 2 failing tests, uncommitted work | Fix and commit | S | P0 |
| 10 | Linker and dedup unmeasured | Label 350 pairs; accuracy panel | S | P1 |
| 11 | Duplicate headlines | Simhash pre-merge | S | P1 |
| 12 | Fallback misroutes brief examples | Extend the intent eval | S | P1 |
| 13 | SSRF bypass | One `safeFetch` | S | P1 |
| 14 | No "since yesterday" view | Build-diff strip | M | P1 |
| 15 | Freshness per feed only | Per-item times, stop banner | S | P1 |
| 16 | Search excludes news and sources | Unified index | M | P1 |
| 17 | Chat cannot pin to the Overview | Reuse Studio pins | M | P1 |
| 18 | Read-only guard and timeout no-op on AWS | RO connection plus timeout | M | P1 |
| 19 | Taluk approximate | Official layer or label it | M | P2 |
| 20 | Overview cost | Per-build cache | S | P2 |

## 17. Quick wins (≤ 1 day each)
3, 4, 5, 6, 7, 8, 9, 11, 13, 15, plus the misleading "Paste AWS keys" message (UX-001).

## 18. Roadmap
See `IMPROVEMENT_ROADMAP.md`: Phase A (trust and safety, about 1 week) → B (intelligence quality) → C (workflows) → D (performance) → E (2–3 differentiators).

## 19. Scores (evidence-based; P = provisional)
| Category | Score |
|---|---|
| Functionality | 7/10 (P: UI not driven) |
| AI quality | 7/10 (P: live answers not run) |
| Retrieval accuracy | 5/10 (P: no retrieval eval set exists) |
| Data quality | 4/10 |
| Geographic intelligence | 5/10 |
| Incident intelligence | 5/10 |
| Briefing usefulness | 6/10 (P) |
| Collector usability | 6/10 (P) |
| Requirements compliance | 7.5/10 |
| Security | 5/10 |
| Performance | 6/10 (P: not measured under load) |
| Reliability | 6/10 |
| Code quality | 7/10 |
| Innovation | 8/10 |
| **Overall product** | **6.5/10** |

## 20. Final recommendation
To be one of the strongest entries, **make every screen honest, then prove accuracy.**
1. Label provenance everywhere and offer a Real-only view. Lead the demo with the real feeds (news, IMD, CFM, CPCB, AGMARKNET) and present the synthetic departments openly as stand-ins for the departmental apps FarmwiseAI did not provide.
2. Stop pinning unknown places to the city centre. Show "place unknown" as a counted category.
3. Add the unverified-but-serious lane so real fatal events reach page 1.
4. Publish measured accuracy: news gate F1 (have it), linker and dedup precision/recall (label 350 pairs), and intent accuracy on the brief's own example questions.
5. Close the two high security gaps (shared-key PII download, unauthenticated upload) and the guard false refusals before any judge types a question.

**Hard demo questions judges may ask, and today's answer:**
- "Is this severe incident real?" → today: synthetic, and the screen doesn't say.
- "Show incidents in the news but missing from departments" → works through the LLM; misrouted in the fallback.
- "Why is there a drop in complaints this week?" → refused.
- "How accurate is your duplicate detection?" → no measured number for real data.
- "Why are so many incidents at Ripon Building?" → centroid fallback.
