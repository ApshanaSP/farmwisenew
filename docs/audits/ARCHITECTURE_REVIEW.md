# Architecture review (as built, not as documented)

## End-to-end flow

```
 Collectors / generators                       Pipeline (Python)                          Store                      Web (Next.js 14)
 ─────────────────────────                     ─────────────────                          ─────                      ────────────────
 news RSS/sitemaps/Google News ─┐              district_intel/run_pipeline.py build        district_intel.db          /collector  CollectorApp (5 tabs)
 IMD, CFM-DSS (real)  ──────────┤  AWS Lambdas  load → classify → locate → OVERLAY →        (SQLite, 33 tables)        /officer    OfficerApp
 CPCB (real, PC + Playwright) ──┤  via GitHub   dedup → link → incidents → analytics →           │                    /citizen    file/track complaints
 grievance portal (synthetic +  │  cron (hourly) agents (planner, gaps, linker, watchdog,        ├─ S3 snapshot  ─────▶  lib/aws/store.ts: in-memory SQLite
   4 real filings) ─────────────┤  + PC Task     steward, briefing w/ number verifier)          │  (sha-cached)          + dialect.ts MySQL→SQLite
 police, PWD, hospital          │  Scheduler                                                   └─ MySQL copy (opt.)    + build hooks (derive.ts)
   (synthetic generators) ──────┘                                                                                      │
                                                                                DynamoDB durable store ◀── writes ─────┤ users, complaints, decisions,
                                                                                (one saving PC: AWS_STORE_SAVE=1)      │ assistant chats, workspaces, audit
                                                                                                                       │
 LLMs: Groq (gpt-oss-20b/120b, qwen) → Gemini fallback ◀── lib/ai/gateway.ts ◀── Ask District IQ (lib/assistant/*) ─────┘
 Embeddings: multilingual-e5 / bge-m3 (pipeline), transformers.js + LanceDB (web hybrid search)
```

The active backend on this PC is `DATA_BACKEND=aws`. MySQL is used only when someone switches back to it.

## Components

| Component | Purpose | Entry | Main files | Input → Output | Failure modes |
|---|---|---|---|---|---|
| News collector | 90-day Chennai news | `chennai_news_pipeline/run_pipeline.py` | `src/fetchers/*` (robots-aware), `relevance_filter.py` | feeds → `data/processed/*` | Google News gives snippets only (98%); feed outages surface in `source_health` |
| Env collectors | IMD, CPCB, CFM-DSS | `*_collector.py` (single files) | | public endpoints → raw cache | IMD 401/403 endpoints recorded as "not bypassed"; CPCB needs the PC (captcha/Playwright) |
| Synthetic generators | Police, PWD, hospital, grievances | `police_dataset_generator/src`, `generate_pwd_data.py`, `scripts/generate-synthetic-grievances.js` | | seeds plus a shared rain calendar (`dintel/sync.py`) | Presented in the UI without labels (DATA-001) |
| Pipeline | Curated store | `district_intel/run_pipeline.py` | `dintel/pipeline.py`, `loaders/*`, `world.py`, `dedup.py`, `linking.py`, `incidents.py`, `priority.py`, `analytics.py`, `agents/*` | collector files → `output/district_intel.db`, CSV, reports | 2 failing tests; much of it uncommitted (`eventmatch.py`, `placerole.py`, `newseval.py`) |
| AWS store | Serve the build without MySQL | `lib/aws/store.ts` | `dialect.ts` | S3 manifest → in-memory SQLite; DynamoDB → `durable.sqlite` | Dialect drift vs MySQL; one key unlocks all PII (SEC-001); READ ONLY is a no-op |
| Collector console | Overview, Insights, Sources, Briefing, Data Studio | `app/collector/page.tsx` → `components/collector/app/CollectorApp.tsx` | `lib/collector/intel.ts` (1,432 lines, every console number), `insights.ts`, `threads.ts`, `newsrel.ts` | API JSON → ECharts/Leaflet | GET with writes (BE-001); KPI ignores decisions (KPI-001) |
| Officer console | Department work queue | `app/officer` | `lib/officer/*` | department from DB, never from the request | — |
| Ask District IQ | NL Q&A | `api/collector/assistant/chat` (SSE) | `assistant/pipeline.ts`, `guard.ts`, `intent.ts`, `fastpath.ts`, `compile.ts`, `verify.ts`, `chartspec.ts`, `lance.ts` | message → card (facts, chart, sources, SQL, models) | guard false positives; rules fallback misroutes; free-tier rate limits |
| Data Studio | Bring your own file or link | `studio/*` | `lib/studio/{parse,pipeline,engine,insights,brief,connect}` | file/link → typed dataset → computed insights → AI brief (numbers checked) | Strong SSRF and robots checks |
| Source onboarding | Add a site by link plus login | `api/collector/sources/onboard/*` | `collector/onboard.ts`, `sources.ts` | URL → detected feed → mapping → preview → approve | Direct `POST /sources` skips the host check (SEC-003) |

## AI architecture (verified in code)
- **LLM tasks:** routing (fast model), query planning (fills a `QueryPlan` JSON, never SQL), answer composition, news details/labels (pipeline), briefing text (optional), Studio brief.
- **Deterministic:** every number. Tools, or the compiler (`compile.ts`: catalog-only tables and columns, one-hop joins, bound parameters, as-of cap, scope injection, pre-count shrink rules). The composer's numbers must appear in the facts (`verify.ts`): one retry, then a template.
- **Retrieval:** LanceDB hybrid (vector plus keyword) over incidents and news in the web app; bge-m3 plus a reranker plus LR plus Groq pair check for news grouping in the pipeline (per project notes).
- **Memory:** per-session turns in the durable store; `lastContext()` carries filters, result ids and the selected incident.
- **Safety:** regex code guard before any model; the planner cannot write SQL; untrusted text is not logged; per-user token budget (in memory).
- **Judgement:** this is a well-designed "LLM proposes, code computes" architecture, and the strongest engineering in the project. Its weak points are the brittle regex guard and the keyword fallback, which is used often because of free-tier limits.

## Data provenance (live build, 2026-10-08 18:08)

| Source | Class | Records | Note |
|---|---|---|---|
| News | REAL & CURRENT | 26,227 docs; 856 news-only incidents | 58% unlocated |
| IMD | REAL, degraded | 373 rows | several endpoints 401/403 |
| CFM-DSS | REAL & CURRENT | 248 | 24 suspect gauge readings flagged |
| CPCB | REAL BUT STALE | 264 | 543 min since success |
| AGMARKNET | REAL | 7,494 market prices (durable) | |
| Grievances | SYNTHETIC (+4 real) | 16,176 events | |
| Police, PWD, hospital | SYNTHETIC | 12,290 / 2,111 / 88 | |
| Overlay | SYNTHETIC, DERIVED | 441 incidents | planted to agree with real news and rain |
| Priority, severity, anomalies, hotspots | DERIVED | | from the above |
