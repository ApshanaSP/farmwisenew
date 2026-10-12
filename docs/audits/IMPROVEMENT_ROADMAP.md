# Improvement roadmap (proposal — nothing implemented)

Effort assumes one developer who already knows the codebase. S ≈ ≤ 1 day, M ≈ 2–4 days, L ≈ 1–2 weeks.

## Phase A — Correctness, trust and safety (do first, about 1 week)
| # | Change | Files | Effort | Validation |
|---|---|---|---|---|
| A1 | Provenance everywhere: Real / Synthetic / Overlay / Mixed chip on incident rows, cards, map pins and briefing lines; "Real data only" toggle; overview banner with the split | `intel.ts` ROW (+`is_synthetic_any, is_overlay_any`), `scopeWhere` (+`real` flag), `Overview.tsx`, `Detail.tsx`, `BriefingBook.tsx`, `reportPdf.ts` | M | Toggle on: Severe count 0, news incidents remain; snapshot test |
| A2 | Unlocated ≠ centroid: no pins for `loc_precision_m > 2000`; "District-wide / place unknown" count on the map and zone table | `intel.ts:745-758`, `SatMap.tsx` | S | Pin count drops by about 500; no stack at 13.0827, 80.2707 |
| A3 | Lock down `/api/complaints/media` (session, rate limit, magic bytes, store outside `public/`) | `api/complaints/media/route.ts`, file-complaint page | S | Unauthenticated POST → 401 |
| A4 | Split the AWS key: teammates get the intel snapshot only; no `users.password_hash` or complaint PII in `/store/load` for non-owner copies; rotate the key | AWS API Lambdas, `lib/aws/store.ts` | M | Durable file on a teammate PC has no hash or PII columns |
| A5 | GET is read-only: move `routeNewsComplaints` to the pipeline or cron, with audit rows | `intel.ts:576-619` | S | Overview GET performs no INSERT/DELETE (log check) |
| A6 | KPI tiles respect Collector decisions | `intel.ts kpiBlock` | S | Resolve one incident → "ongoing" −1 immediately |
| A7 | Guard false positives | `assistant/guard.ts`, `__tests__/guards.test.ts` | S | Both sentences answered; all existing guard tests pass |
| A8 | Fix the 2 failing pipeline tests and commit the news work | `dintel/loaders/news.py`, `eventmatch.py` | S | pytest 90/90 |
| A9 | One `safeFetch` for every outbound request | `collector/sources.ts`, `fulltext.ts`, `studio/fetchurl.ts`, `onboard.ts` | S | Unit test: `http://169.254.169.254`, `[::ffff:a9fe:a9fe]` and a redirect to localhost are all refused |
| A10 | Fail closed on a default `JWT_SECRET` in production | `lib/jwt.ts` | S | Boot error without a secret |

## Phase B — Intelligence quality (about 1–1.5 weeks)
| # | Change | Why | Effort |
|---|---|---|---|
| B1 | **"Unverified but serious" lane:** news with deaths ≥ 1, or ≥ 2 independent outlets, goes to page 1 with Verify / Dismiss | Real fatal events currently never reach the Collector's top queue (SEV-001) | S |
| B2 | Headline simhash pre-merge (72 h) before embeddings | 47 duplicate headlines remain | S |
| B3 | Label 150 real link pairs and 200 news-dedup pairs; show precision/recall in a "How accurate is this?" panel | The linker and dedup are unmeasured on real data | S (labelling) |
| B4 | Add the brief's 7 example questions and the Scenario E chain to the intent eval; "why" beats "show"; "only/compare" = refinement | Fallback routing is wrong on brief examples | S |
| B5 | Full-text extraction for incident-gated news (about 1,700 articles), robots-aware extractor already present | Details currently come from headlines | M |
| B6 | Official taluk boundaries, when supplied; meanwhile label taluk figures "approximate" | Taluk is derived from synthetic points | M |

## Phase C — Collector workflows (about 1 week)
| # | Change | Effort |
|---|---|---|
| C1 | "What changed since yesterday" strip: new, escalated, closed and stalled incidents, with deltas from the build-to-build incident diff (stable ids exist since round 20) | M |
| C2 | Per-item freshness ("published 3 h ago · collected 40 min ago") and a page banner when feeds stop | S |
| C3 | Assistant answers pinnable to the Overview (Studio already has pins) | M |
| C4 | Unified search over incidents, news documents, source items and Studio datasets (one LanceDB index) | M |
| C5 | Action follow-through: an assignment SLA timer, overdue escalations to the Collector, and closure verification with photos (officer reports exist) | M |

## Phase D — Performance and robustness (about 3–4 days)
| # | Change | Effort |
|---|---|---|
| D1 | Cache `overview()` per (scope, build_id) for 30–60 s; it runs about 22 queries per poll | S |
| D2 | Read-only SQLite connection plus a query timeout (worker or interrupt) for compiled queries | M |
| D3 | Run the parity test in CI on a fixture build | M |
| D4 | Persist rate limits and token budgets in the durable store | S |
| D5 | Pin scikit-learn to the training version | S |

## Phase E — Differentiation (choose 2–3)
1. **"Seen by news, missing from departments" gap board.** It answers the brief's literal example. It works on *real* news versus departmental records, and is honest even with synthetic departments.
2. **Rain-to-complaint early warning.** Real IMD/CFM rainfall plus per-category rain factors (already learned in `analytics.py`) → predicted flood-complaint wards for the next 24 h, scored after the fact.
3. **Evidence-graded briefing.** Each line carries a strength grade (number of independent sources × reliability × freshness) and a one-click evidence drawer.
4. **Intervention check.** After an action is closed, compare the area's complaint rate 14 days before and after against matched control wards.
5. **Voice morning brief in Tamil:** the three most serious items plus actions, using the TTS already present.
