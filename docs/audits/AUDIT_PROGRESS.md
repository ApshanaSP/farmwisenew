# Audit progress — District IQ (read-only audit)

Started 2026-10-08. Repo audited: `D:\farm` (the brief named `C:\FARMWISEAI`, which does not exist on this machine).
Rule: no application code, schema, env or data changes. Only files under `docs/audits/` are written.

## Source of truth for requirements
- `C:\Users\ELCOT\Downloads\Task_6 (2).pdf` (Task 6 page: provided systems, open sources, AI news intelligence, Collector platform)
- `C:\Users\ELCOT\Downloads\FarmwiseAI_Product_Challenge_Brief (1).pdf` pp. 20–23 (Task 6 capabilities, example, final-prototype checklist)
- Note: the user's standing decision (memory, 2026-10-04/07) says the two FarmwiseAI-provided systems are reference only, and FarmwiseAI confirmed they need not be integrated. They are not counted as gaps.

## Checklist
- [x] Repo layout, README, launch config, CI workflow list
- [x] Requirements PDFs read
- [x] Route inventory (pages + 71 API routes), auth guard per route
- [x] Auth core (jwt.ts, auth.ts, middleware.ts, guards), env names (values not read)
- [x] AWS store / dialect adapter (header, build, NOOP read-only)
- [x] Collector intel (overview, KPIs, routing, news stories)
- [x] Assistant pipeline (guard, intent, routing order, compiler, gateway) — live LLM not run
- [~] district_intel pipeline: README, world.py, severity outcome, data queries; dedup/linking code not line-reviewed
- [~] News pipeline: fetchers (robots), tests run
- [~] Collectors: inventory + source_health only
- [x] Data Studio / onboarding SSRF surface
- [x] Tests: vitest, pytest x2, tsc
- [~] Runtime: unauthenticated API probes only (no login, no UI driving)
- [x] Reports written (2026-10-08)

## Evidence log (raw, as collected)
- vitest: 19 files passed, 1 skipped (parity, needs PARITY_OUT); 330 tests passed. `tsc --noEmit`: exit 0, no errors. (2026-10-08 18:05)
- Active backend on this PC: `DATA_BACKEND=aws` (.env). No `AWS_STORE_SAVE` → local writes stay local. Dev server already running on :3000 (user's); not restarted.
- Live AWS build analysed from `chennai-grievance-portal-main/data/aws-cache/*.json.gz` (read-only copy in scratchpad): as_of 2026-10-08 18:08 IST.
  - incidents 27,699; with any synthetic member 26,818 (96.8%); overlay 441; open 2,694.
  - Severe 819, synthetic 819 (100%). High 4,029 (3,808 synthetic).
  - multi-source incidents 222, all synthetic, 191 overlay-planted.
  - news-only incidents 856; 501 (58.5%) at loc_precision 15 km = Chennai centroid 13.0827,80.2707 with no zone/ward/taluk.
  - 47 duplicated identical titles among news incidents.
  - news incidents with deaths: 60, all capped at High ("Capped at High until a department or officer confirms it", dintel/severity.py).
  - source_health: cpcb stale (543 min), imd degraded; others ok.
- Local `district_intel/output/district_intel.db` is stale (as_of 2026-10-04 16:23); same structural ratios (Severe 806/806 synthetic; 207/207 multi-source synthetic). Pattinapakkam secretariat protest = 68 incidents in local build, 2 in the live build (news fix #3 effective).
- Taluk assignment = majority vote of (synthetic) police/PWD coded points per ward (`ref_wards.taluk_vote_share`); Kolathur has 1 ward; Tambaram (Chengalpattu) has 4 incidents.
