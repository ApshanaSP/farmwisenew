# ULTRA PROMPT — District IQ: the feature set that wins Task 6

> **How to use:** open a new Claude Code session in `D:\farmwisenew` and say:
> **"Read `docs/DISTRICT_IQ_ULTRA_PROMPT.md` completely and follow it. Start with Phase 0. After each phase, stop, show me the verification results, and wait for my go-ahead."**
>
> Written 27 Oct 2026 from: the Task 6 brief (`C:\Users\DELL\Documents\Task_6.pdf`), the competitor proposal "GroundTruth" (`C:\Users\DELL\Downloads\proposal_copy.pdf`), FarmwiseAI's own website (products, clients, delivered projects), public evidence on grievance systems, and a survey of this repository on branch `aws-deploy` (head `6b60837`).

---

## 0. Read this first

You start with no memory of earlier work. Everything you need is in this document and in the repository. **Where this document and the code disagree, the code wins:** tell the user what differs and adapt the plan.

Work in phases (section 15). After each phase, stop and report in the format of section 17. Never start the next phase without the user's go-ahead.

**Ask the user before you:**
- install any package larger than ~5 MB, or anything native (sharp, rasterio, Docling, PyTorch, Tesseract);
- change `district_intel/` collectors or generators (new modules are fine; existing collectors stay untouched);
- add or change a durable table on the AWS store, or do anything destructive to any store;
- switch email to live mode, or send any SMS/WhatsApp (there is no real channel: test outbox only);
- commit, push, or merge (push code only, never data files; see `README.md` and git history for the convention);
- add or merge top-bar tabs if they no longer fit at 1366 × 680.

**Never:**
- print, log, commit or write into any file the credentials of the FarmwiseAI-provided systems, officer passwords (`officer-accounts.local.csv`), `.env` values or API keys. Credentials go **only** into the Studio vault (`src/lib/studio/connect/vault.ts`), typed by the user into the app's own form;
- type a password into any site yourself; the user does it;
- bypass a login, paywall, CAPTCHA, OTP, robots.txt disallow or a site's terms;
- let an AI model compute a number, write SQL, or decide an outward action on its own;
- send anything outward (email, task, reopen, escalation) without a person pressing Approve;
- rank or name an individual officer anywhere;
- show predictions or forecasts of your own (official IMD forecasts may be quoted, labelled as IMD's).

**Test servers.** Use `.claude/launch.json` configs: `portal-aws-dryrun` (port 3001, `AWS_STORE_DRY_RUN=1`, nothing reaches DynamoDB) for anything that writes; `studio-3002` for Studio work. Do not use port 3000 for tests (it is the user's live server). Node on this PC needs `NODE_EXTRA_CA_CERTS` (already in launch.json). Checks: `npx tsc --noEmit`, `npx vitest run`, `npm run eval:golden` (frozen store; `npm run eval:freeze` only with the user's OK), `pytest` in `district_intel/`.

**Files on this PC use CRLF line endings.** For scripted text replacements, write a script file; do not inline `\b` in heredocs.

---

## 1. Mission

We are **Team Initiators**. Our entry for the **FarmwiseAI Campus Product Challenge, Task 6 (Collector's District Intelligence Platform)** is **District IQ — Chennai**, already a working platform (live feeds, news intelligence, Collector, department-officer and citizen consoles, Ask District IQ assistant, Data Studio).

This prompt adds the features that make it **impossible to beat**:

> **District IQ doesn't just show the Collector what is happening. It proves it, acts on it, checks on the ground and with the citizen that it was really fixed, and keeps the whole record for the next Collector.**

The judges are FarmwiseAI, a company that builds geospatial AI for the Tamil Nadu and Telangana governments. Every new feature below **mirrors a product FarmwiseAI already sells to government**, applied to a Collector's desk. That is our strongest argument: *"you could ship this to your clients next quarter."*

### 1.1 What the brief asks, and where each feature answers it

| Brief requirement (Task_6.pdf) | Already in District IQ | Made unbeatable by |
|---|---|---|
| Integrate the FarmwiseAI-provided systems | **Not yet** (gap) | **F2** onboards both through Source Scout |
| Integrate additional permitted public/open sources | 8+ live feeds (IMD, CFM-DSS, CPCB, AGMARKNET, CMWSSB, NDMA SACHET, news, GCC) | F2 adds any government site with one link |
| Allow new sources by link and, where permitted, credentials | Data Studio Connect (link, browser, sign-in, vault) | **F2** whole-site scouting, mapping, self-healing |
| Automatically process and organise added sources | Studio profile → insights → link | F2 + F7 (pinned, live) + F1 (as map layer) |
| Identify incidents, trends, patterns, alerts, priorities | Pipeline: dedup, linking, priority, Gi* hotspots, alerts lane | F1 spatial questions, F6 truth and repeat spots, F8 monsoon mode |
| Maps, dashboards, visualisations, summaries | Console, Leaflet map, briefings, charts | **F1** conversational GIS, **F7** My Board |
| Help the Collector know what needs attention | Briefing, My Tasks, Take action | **F4** proposals, **F6** scores, **F10** "since you last looked" |
| Collector chooses what to monitor and customises the dashboard | Customise layout, saved workspaces | **F7** "Add to dashboard" → My Board |
| AI/OCR/NLP over 30 days of district news | News pipeline, clustering, stories, Tamil-English | F11 OCR of paper petitions; F1 news as a layer |

---

## 2. Who we are up against: "GroundTruth"

A solo, plan-only proposal (33 pages). It is well written and it **will** impress, because it speaks in engineering invariants. Know it exactly.

**What they promise in the MVP:** provenance as a database invariant (an incident cannot exist without an EvidenceLink; merges add edges, never delete; append-only audit), a deterministic confidence formula `clamp(0.40·S + 0.25·T + 0.20·G + 0.15·C − 0.25·D, 0, 1)` with High/Medium/Low bands, a documented priority rule table, LLM extraction into a fixed schema, RapidFuzz geo-resolution with a visible review queue, three-stage dedup, a natural-language → validated filter object (no SQL), one synchronised workspace, briefings with code-enforced citations, saved versioned workspaces, PDF/CSV export, **Claim Court** (reduced to one challenge type), an 18-step hero demo, a validation plan on 60–80 hand-labelled records. Stack: React/Vite, FastAPI, PostgreSQL + PostGIS + pgvector on one EC2 instance, two to three sources, departmental data mocked if not provided.

**What they defer to "future extension":** snapshot comparison, delta briefings, officer handover, the AI Comptroller (consistency monitoring), disaster-response mode, 3D/asset overlays, full boundary versioning, voice. Satellite corroboration is a **mock connector** unless data is given.

**What they do not have at all:** a citizen side, any check that a closure is real, department accountability, field verification (despite the name "GroundTruth"), Tamil, a way to add a new source other than writing a connector, actions that leave the screen, and the FarmwiseAI-provided systems.

### 2.1 How we beat every line

| GroundTruth | Their status | District IQ after this prompt |
|---|---|---|
| Provenance, EvidenceLink, append-only audit | MVP plan | Shipped (merged incidents keep every report) **+ F3 hash-chained ledger anchored daily: tamper-evident, provable** |
| Deterministic confidence formula | MVP plan | Shipped confidence **+ breakdown with two evidence types they cannot have: field visits (F9) and citizen confirmation (F6)** |
| Claim Court, one challenge type | MVP plan | **F3 challenges on any field, by officers and citizens; outcomes feed department scores (F6)** |
| NL → filter object, no SQL | MVP plan | Shipped typed tools **+ F1 spatial plans (buffer, within, nearest, along a road, hotspot, compare, change)** |
| One synchronised workspace | MVP plan | Shipped console **+ F7 My Board the Collector builds from any panel, live** |
| Stalled case → rule-based escalation recommendation | Partial | **F4 proposals that follow the real chain, check who is on leave (FarmwiseAI's LMS), draft, send on approval, and follow up** |
| Snapshot comparison, delta briefing, handover | Future | **F10 shipped** |
| AI Comptroller | Future | **F3 self-checks shipped, nightly, visible** |
| Disaster-response mode | Future | **F8 Monsoon Mode shipped, with SITREPs** |
| Satellite corroboration | Mock | **F9 real ground checks; F12 real open Sentinel imagery (stretch, only if verified)** |
| Voice | Future | Shipped (Tamil, English, Tanglish) |
| 2–3 sources, departmental data mocked | MVP plan | 8+ live feeds, **F2 adds any site**, both FarmwiseAI systems connected |
| No citizen loop | — | **F6 Truth Check: "Is it really fixed?"; reopen even after the Collector verified** |
| No Tamil | — | Tamil in every screen, answer, voice and PDF |
| Postgres on EC2 | — | Runs on FarmwiseAI's own permitted AWS services (S3, Lambda, DynamoDB, API Gateway, Bedrock) |

Two earlier competitor plans (DistrictLens, DistrictPulse AI) are covered by the same table.

**Match their discipline, not just their features.** They report "objectively checkable milestones" and "results measured, not asserted". So must we: every feature here has acceptance tests, and the final report states measured numbers only.

---

## 3. FarmwiseAI's world (from farmwiseai.com, read 27 Oct 2026)

FarmwiseAI (Chennai, founded 2020): "We turn satellite, drone, field and spatial data into systems that continuously understand places, assets and change." 30+ government clients in Tamil Nadu and Telangana, 5+ statewide deployments, AWS GenAI award 2025.

| FarmwiseAI product or project | What it does | Our feature that echoes it |
|---|---|---|
| **MapsAI** (flagship, conversational GIS) | "Show every parcel within 500 m of the proposed corridor" → "142 parcels found · map layer ready"; buffers, overlays, proximity; explains what it found | **F1 Ask the Map** (same shape of answer: count + layer ready + explanation) |
| **AGRI-X** (satellite data on demand) | Choose area, dataset, dates → ready-to-use data, no manual searching | **F2 Source Scout** (choose a site → ready-to-use district data) |
| **Field Inspection Management & Monitoring System** — client: **District Collector, Yadadri Bhuvanagiri** | Inspectors record location, condition, photos on a mobile app; the Collector monitors, assigns and closes every issue from a WebGIS dashboard | **F9 Field Verify** + **F4 proposals** |
| **Integrated Feedback & Improvement System** — client: **TNDRRA** | Users raise issues; the system classifies, prioritises, assigns and tracks each to closure | **F4** + **F6 Truth Check** |
| **TNIAMP programme governance** — WRD, World Bank | 13+ departments, one monitoring view, **fund-to-field traceability**, geo-tagged evidence | **F3 Ledger** + **F6 Department scores** |
| **Drone property tax** — Coimbatore Corporation | Officials verify each property on a mobile app **with photos and a full audit trail** | **F5 Photo Proof** + F3 |
| **WebGIS + QR smart city** — GHMC | One spatial identity per property, many departments on one record | **F1 area brief**: one place, every department's issues |
| **M-Velanmai pest app** — TNAU | When the AI is **< 90% confident, a human expert answers** in the farmer's language | Our rule everywhere: **low confidence → a person**, never a guess |
| **Digital Crop Survey** — Sentinel-1/2 + field photos | Parcel-level maps for insurance, subsidies, disaster response | **F12 Lakes & floods from space** (stretch) |
| **SkyLab** (drone analytics) | Change detection between surveys | F10 compare two dates; F12 |
| Clients **TNSDMA, TNDRRA, CUMTA, Vellore Collectorate** | Disaster management, Chennai transport, a Collectorate | **F8 Monsoon Mode** |
| **AI Mentor** (voice assistant), **Experian** multilingual GenAI | Voice, Tamil and other languages | Shipped voice + Tamil everywhere |

Use these names in the UI copy and the demo only where they are true. Never claim FarmwiseAI endorses us.

---

## 4. What already exists (verify every line in Phase 0)

Portal: `chennai-grievance-portal-main/` (Next.js 14, TypeScript, Tailwind, Leaflet, ECharts, jsPDF, Playwright-core, vitest). Pipeline: `district_intel/` (Python).

**Collector console** `src/components/collector/app/CollectorApp.tsx`: pages `overview | briefing | trends | environment | studio` (top-bar tabs, `Shell.tsx`), fixed canvas FIT 1366 × 680, Marina look in FarmWise green, light/dark, `motionfx.css` animations, floating Ask button, `/` palette, Bell, toasts, Customise layout + saved workspaces (`Workspace.tsx`, `src/lib/collector/workspaces.ts`: named, versioned, frozen briefing copy).

**Map** `SatMap.tsx` (Leaflet): 200 GCC wards and 15 zones from `src/lib/collector/geo.ts` (taluks coloured by ward, no taluk boundary supplied), incident pins, AQI / rain / lake stations, items from added sources, screen-reader names on pins.

**Incident detail** `Detail.tsx` (`IncidentView`): merged reports with sources, confidence ("N reports from M sources"), department reports and photos, Take action.

**Actions** `src/app/api/collector/decisions/route.ts`: `verify | escalate | reject | resolve | reopen | note` (verify for severe only; escalate uses `nextLevel(route)`); `TakeAction.tsx` + `src/lib/collector/actionmail.ts`: AI-drafted instruction email to the right officer, sandbox by default (`EMAIL_MODE`, `EMAIL_SANDBOX_TO`, `EMAIL_LIVE_ALLOWLIST`), `outbound_emails`, follow-up due in 24 h, audit. My Tasks puts officer-sent reports first.

**Audit** `src/lib/collector/sources.ts`: `audit()` (best effort) and `auditIn(conn, …)` (inside the change's transaction).

**Ask District IQ** `src/lib/assistant/*`: router + typed tools (`tools.ts`: `overview_kpis, zones, zone_profile, departments, incidents, search, briefing, hotspots, place_breakdown, resolve_place, map_geo, incident_series, …`), numbers verified against the fact pack (`verify.ts`), language detection EN/TA/Tanglish (`lang.ts`), voice (`speech.ts`), warnings early route, officers locked to their department (`access.ts`, `lockTools`), `MapAnswer.tsx`.

**Data Studio** `src/lib/studio/*`: `connect/discover.ts` (scores tables, data files, feeds, browser-captured JSON, headlines on one page), `connect/browser.ts` (Playwright on the PC's Edge/Chrome; sign-in modes: form, manual window, kept session; never solves CAPTCHA/OTP), `connect/robots.ts` (RFC 9309), `connect/vault.ts` (AES-256-GCM), `fetchurl.ts` (public addresses only, honest UA), `parse.ts`, `place.ts` (geo-locator: lat/lon → ward, ward numbers, gazetteer EN/TA, zones, taluks), `relevance.ts` (Chennai gate), `link.ts` (Spearman link to incidents), `insights.ts`, `dashboard.ts` (the Designer), `pipeline.ts` (`runDueRefreshes`).

**Glossary** `src/lib/reference/metrics.ts`: METRICS, windows, `pctChange` with `MIN_PCT_BASE = 20`, `deadlineState`.

**Alerts** `src/lib/collector/alerts.ts` (IMD + NDMA SACHET CAP filtered to Chennai), `AlertBar.tsx`; lakes `lakes.ts` (CMWSSB); conflicts `conflicts.ts`; nearby `nearby.ts`; report kinds `reporttype.ts` (kept in step with `district_intel/dintel/reporttype.py`).

**Citizen** `src/app/citizen/file-complaint` (map pin lat/lng, photos/videos via `src/lib/complaint-media.ts`, private, access-checked), `src/app/citizen/track-complaints` + `src/lib/complaint-progress.ts` (journey from officer steps and Collector decisions; `syncComplaints`), statuses in `src/types/index.ts` (`Complaint Filed … Verified by Collector | Resolved by Department | Rejected`), OTP (`src/lib/otp.ts`), rate limits (`src/lib/rate-limit.ts`).

**Officer console** `/officer` (25 departments, own password each, dept-locked): steps approve / action / send / close, completion photos (`src/lib/officer/photos.ts`, magic-byte sniffing, access-checked).

**Pipeline** `district_intel/dintel/*`: dedup, linking, priority, severity, `analytics.py` (DBSCAN hotspots + **Getis-Ord Gi\*** per ward), geolocate with gazetteer EN/TA aliases, news LLM, report kinds. Reference places with `aliases_en` / `aliases_ta`: `data/gcc-reference/intel-reference.json`, used by `src/lib/collector/nlp.ts` `placeResolver`.

**Storage** `DATA_BACKEND=aws`: `src/lib/aws/store.ts` (snapshot → in-memory SQLite; durable tables in `data/aws-cache/durable.sqlite` synced to DynamoDB via `/store/write`; runtime-added columns via `DURABLE_ADDED`), `src/lib/aws/dialect.ts` (MySQL → SQLite).

**AI** `src/lib/ai/gateway.ts` (`generateJson` with zod schema; provider chain from `AI_PROVIDER` / `AI_FALLBACK_PROVIDER`: groq, bedrock, gemini). **Groq needs every schema field required** (use `nullable`, not `optional`). Bedrock models allowed by the TCE guide: Nova Lite / Nova Micro / Ministral 3B / 8B (Nova Lite and Gemini accept images).

**PDF** `reportPdf.ts` uses jsPDF, which **cannot shape Tamil script** (the code already swaps Tamil headlines for English descriptions). Any PDF that must show Tamil goes through S6 below.

**Standing decisions (do not reopen):** numbers come from code/SQL, never from AI; no "real/simulated" badges on sources (decision C-1); officer answers stay locked to their department and there is no department switcher; keep the floating Ask button; design for the 680 px-tall canvas; Marina green; only the existing motion style; email sandbox in demos; no forecasts of our own.

---

## 5. The laws (apply to every feature)

1. **One question a screen.** Every screen answers "what needs my attention, and what can I do now?" One primary button per card. Words before charts; a chart only when it helps.
2. **Plain words, two languages.** No jargon in the UI ("Gi\* z-score" → "more than usual for its neighbours"). Every label, message, answer, template and PDF exists in English and Tamil (Noto Sans Tamil). Tanglish questions get Tanglish answers.
3. **Numbers are computed, never generated.** AI drafts sentences around a fact pack; every number in AI text is checked against the fact pack (`verify.ts` pattern); a sentence that cites nothing is dropped before it is shown.
4. **Every number opens its rows.** Click any count, score, bar or pin → the list of cases behind it; the list's total equals the headline (tested).
5. **Every point opens its evidence.** Incident → reports, sources, photos, field visits, citizen answers, ledger.
6. **Typed plans, never free SQL.** AI output is a zod-validated plan from a closed vocabulary; anything that fails validation becomes a clarification shown as tappable choices, not a wrong answer.
7. **Human approves every outward action** (F4). The system proposes; a person approves, edits or rejects with a reason.
8. **Low confidence → a person.** Below the confidence bar (default 0.9 for AI vision/OCR, banded thresholds for place matching) the item goes to a review queue with the reason. Never a silent guess. (FarmwiseAI's own M-Velanmai rule.)
9. **Say empty plainly.** "No waterlogging reports within 300 m of a school in the last 7 days." Then one useful next fact ("the nearest is 420 m from Govt School, Saidapet").
10. **Show the method.** Every computed answer has a "How this was worked out" trace in plain steps with counts.
11. **Permitted access only.** robots.txt, site terms, honest user agent, rate limits, no bypassing of sign-ins; credentials only in the vault.
12. **Privacy by default** (DPDP Act 2023): collect the minimum, mask phone numbers except for the Collector's call desk, personal data never sent to an AI model, photos private, every export of personal data logged.
13. **Fair to departments.** Case-mix adjusted, per 1,000 cases, small numbers not ranked, "needs attention", never "worst"; no officer named in a ranking.
14. **Accessible** (GIGW 3.0 → WCAG 2.1 AA): contrast ≥ 4.5:1, full keyboard path, visible focus, screen-reader names, colour never the only signal (traffic lights carry words and icons), text alternative and data table for every chart and map answer, works at 200% text size, respects reduced motion, works at phone width (officers, field staff, citizens).
15. **Fits the canvas.** Collector pages fit 1366 × 680 without page scroll; phones get one column.
16. **Fast.** Rule-only answers < 2.5 s, AI answers < 6 s at the 90th percentile on this PC; map layers cached.
17. **Everything is in the ledger** (F3): who did what, when, what the system showed at that moment.

---

## 6. Shared foundations (build these first; every feature uses them)

### S1 — One place resolver
Extend `src/lib/collector/nlp.ts` `placeResolver` (do not fork it) into the single resolver for F1, F2, F5, F9, F11:
- inputs: English, Tamil, Tanglish names; ward numbers ("W-178", "ward 178", "178வது வார்டு"); zone names/numbers; taluks; localities; streets; **roads** (new: from the OSM roads layer, with `name`, `name:ta`, `alt_name`, `old_name`, e.g. Anna Salai = Mount Road = அண்ணா சாலை); PIN codes (only if a PIN directory is loaded); LGD codes (only if an LGD reference is loaded, otherwise say so);
- output: `{ kind, id, name_en, name_ta, geometry ref, match_score, method, alternatives[] }`;
- ambiguity rule: one name matching several kinds (Adyar = locality **and** Zone 13) → choose the smallest unit that fits the question, show the choice as a chip ("Adyar (area) ▾ · switch to Adyar zone"). Never ask a blocking question when a chip will do;
- fuzzy matching for spellings ("adayar", "velacheri") via the existing `fuzzy.ts`; Tamil inflections handled (`அடையாறு`, `அடையாறில்`, `அடையாறு அருகே`).

### S2 — Layer registry
`src/lib/map/layers.ts` (new): every map layer has `{ id, name_en, name_ta, kind: point|line|polygon, source, licence, attribution, as_of, count, fields[], evidence(featureId) }`.
- **District layers (from the store):** incidents (category, severity, status, dept, period), complaints, wards, zones, taluk shading, rain gauges, AQI stations, lakes/reservoirs (CMWSSB/CFM), hospitals (`chennai_hospital_data/`).
- **Facilities and water (cached once, refreshed monthly):** schools, hospitals/clinics/PHCs, police stations, fire stations, relief centres, canals, rivers, lakes, roads — from OpenStreetMap via the Overpass API for the Chennai bounding box, saved as GeoJSON under `chennai-grievance-portal-main/data/layers/` by a script (`scripts/build-layers.mjs`), polite (one run, `User-Agent` with contact), with "© OpenStreetMap contributors (ODbL)" shown on the map. GCC lists (relief centres, schools) are added **through F2 Source Scout** where the GCC publishes them: this is our own product used for real.
- **Studio datasets with places** become layers automatically (F2).
- **Saved layers** from F1 answers.
- Spatial index: a simple grid or RBush (tiny) over points; point-in-polygon and haversine hand-written and tested; polygon buffers via `@turf/buffer` only if needed (ask first if a larger Turf bundle is required).

### S3 — Ledger (the base of F3)
Wrap, do not replace, `audit()` / `auditIn()`: every row also gets `seq, prev_hash, hash = sha256(prev_hash ‖ canonical JSON of the row)`. A daily anchor stores the day's last hash (`ledger_anchors`) and prints it in the footer of every PDF issued that day. `verifyLedger()` walks the chain. Append-only: no update or delete path anywhere in the API (tested).

### S4 — Proposal engine (the base of F4)
`src/lib/collector/proposals.ts` (new): `propose(kind, items, evidence, rule, recipients, due, draft)` → a pending proposal; `decide(id, approve|edit|reject, by, reason)` → runs the action through existing code (decisions route, `actionmail.ts`, officer console task, complaint status). One proposal per department (a batch is split by department automatically).

### S5 — Glossary
Every new measure (F6 scores, F1 distances, F8 counts) is defined **once** in `src/lib/reference/metrics.ts` with: name EN/TA, plain definition, formula, window, unit, "higher is better?", minimum n. The UI's ⓘ next to any number shows this definition. Tests assert the UI and PDFs use the glossary, not their own wording.

### S6 — Print service (PDF that can show Tamil)
`src/lib/print/pdf.ts` (new): render a print-only HTML route (`/print/<kind>/<id>`, signed short-lived token) in the Playwright browser already used by the Studio (`browser.ts` shared browser), `page.pdf({ format: "A4" })`, fonts Plus Jakarta Sans + Noto Sans Tamil (already in `package.json`). The same HTML component renders on screen and in the PDF, so "the PDF matches the screen" holds by construction (tested by comparing extracted text). Footer: issued by, time, ledger anchor hash, page x of y. Used by F1 map PDF, F6 review pack, F8 SITREP, F10 handover, F11 token slip. Keep `reportPdf.ts` for existing English-only exports.

### S7 — Panel spec (the base of F7)
A panel is a **recipe, not a picture**: `{ panel_id, kind: tool|spatial_plan|studio_panel|score|alert|map, recipe (tool + args | F1 plan | Studio plan id | metric id + filters), period: { mode: rolling|fixed, … }, title_en, title_ta, size: S|M|L, position, threshold: { metric, op, value } | null }`. Re-running the recipe on fresh data gives the live panel. Everything that can be shown can be pinned.

---

## 7. The features

Priority: **P0** = must ship, demo-critical. **P1** = ship if time allows, strong. **P2** = stretch. Build order is in section 15.

Each feature: *Why it wins · FarmwiseAI echo · Beats GroundTruth because · Where · What the Collector sees · How it works · Rules · Data · Acceptance · Demo moment.*

---

### F1 — Ask the Map (conversational GIS) · P0

> **Superseded (28 Oct 2026) by `docs/ASK_THE_MAP_ULTRA_PROMPT.md`**, which builds this feature on its own with the real data facts (no schools or roads in the store yet; OSM layers; pin precision rule; officer lock). Build F1 from that prompt; the text below is kept for reference.

**Why it wins.** FarmwiseAI's flagship is conversational GIS (MapsAI). Commercial map assistants are mostly built for GIS analysts. A Collector-ready version that ends in an action is ahead of the market and speaks the judges' own language.

**FarmwiseAI echo.** MapsAI: "Show every parcel within 500 m of the proposed corridor → 142 parcels found · map layer ready." Our answers take exactly that shape.

**Beats GroundTruth because** their NL query is a filter object (date, category, taluk, severity…). Ours does spatial reasoning (distance, along a road, nearest, hotspots, compare, change) and ends in an action.

**Where.** A new top-bar page **Map** (full canvas map with an "Ask the map…" box over it). Spatial questions asked in Ask District IQ are routed here too: the chatbot shows its `MapAnswer` with "Open in Map".

**What the Collector sees.**
1. Types or speaks: *"waterlogging within 300 m of schools"*.
2. Answer card: **"37 open waterlogging reports are within 300 m of a school (last 30 days) · map layer ready."** One sentence of meaning ("Most are in Zone 13 and Zone 10, near 21 schools."), the map highlights them, a list sorted by priority.
3. **Plan chips** above the map, each editable or removable: `Waterlogging ▾` `Open ▾` `Last 30 days ▾` `Within 300 m ▾` `of Schools ▾`. Editing a chip re-runs instantly without AI.
4. **"How this was worked out"**: 1. Took open waterlogging incidents, last 30 days (412). 2. Took schools (OSM + GCC list, 1,284). 3. Kept incidents within 300 m of any school (37). Click a step → that layer alone on the map.
5. Actions: **Send to department** (F4) · **Save as layer** · **Add to dashboard** (F7) · **Export** GeoJSON / CSV / map PDF (S6).

**Draw-to-ask.** Click a ward or zone, or drag a circle → **"What is happening here?"** → an **Area brief** (one place, every department, the GHMC-QR idea): issues by type with counts; the worst 3 with reasons (priority rule that fired); departments responsible with their open/overdue counts; trend vs last month (glossary `pctChange`, minimum base rule); nearby facilities (schools, hospitals, relief centres within 1 km); open citizen complaints; citations to every report. Pin the brief to My Board.

**Follow-ups edit the plan, they don't start over:** "only severe", "make it 500 m", "add hospitals", "last 7 days", "compare with Adyar", "show as wards" (count by ward), "why these?" (trace), "send these to SWD" (F4). The conversation state *is* the plan.

**The map moves to what you asked (camera).** The map is live (pan, zoom, click every pin), and every answer *flies* the map to the place the question is about: the Collector watches the district zoom into Adyar, not a static picture. The camera follows the plan, never the AI's words.
- **One shot per answer shape** (`cameraFor(plan, result) → Shot[]`, `src/lib/map/camera.ts`, pure, unit-tested; a `Shot` is `{ kind: "bounds" | "point" | "path"; target; duration_ms; caption: string | null }`):
  | Question shape | What the camera does |
  |---|---|
  | names an area (place, ward, zone, taluk) | flies from the current view into the area (`flyToBounds`); the area outline draws in; everything outside it dims (a district mask with the area cut out, 45% dark) |
  | district-wide ("within 300 m of schools") | frames the *results*, not the district: the bounds of the middle 90% of result points, so one stray report doesn't zoom out to all of Chennai; a chip says "3 more outside the view · Show all" |
  | one result, `nearest`, a pin clicked in the list | flies to the point at zoom ≥ 16 and rings it (the `mfocus` ring `SatMap.tsx` already uses) |
  | `along` a road | frames the road; the 75 m corridor draws along it from one end; **"Follow the road"** pans end to end in 6 s with the count ticking up as it passes reports |
  | `compare` A and B | frames both areas at once, each outlined in its own colour with its count as a label |
  | `change` now vs before | frames the area; a **Before · Now** toggle cross-fades the two layers in place, the camera stays still |
  | `hotspot` | frames the top hotspot wards; **"Tour the top 3"** flies to each in turn (3 s each) with a caption card ("Ward 173: 41 reports, more than usual for its neighbours") |
  | `farthest` | flies to the ward and draws a line from its far point to the nearest hospital with the distance on it |
  | empty result | flies to the nearest miss and says so ("None within 300 m; the closest is 420 m away, here") |
- **Order on screen:** the camera moves first (0.6–1.6 s, longer for longer distances), then results land: pins drop in staggered by priority, `within` rings ripple out from their centres (schools), counts on the answer card tick up as pins appear.
- **Trace and list move the camera too.** Clicking a "How this was worked out" step frames that step's layer. Hovering a list row lifts its pin; clicking flies to it.
- **Follow-ups move only as much as the plan changed:** "make it 500 m" keeps the view and the rings grow from 300 to 500 m; "only severe" keeps the view and the dropped pins fade out; "compare with Adyar" pulls back to frame both; "last 7 days" keeps the view.
- **The Collector's hand wins.** If they pan or zoom, even mid-flight, the camera stops and stays put until the next question. Two buttons on the map: **Back to the answer** (re-runs the last shot) and **Whole district**.
- **Framing respects what covers the map:** the answer card and plan chips cover part of the map, so every shot uses `paddingTopLeft` / `paddingBottomRight` measured from those panels (bottom sheet at phone width). An area is never framed under the card. `maxZoom` 16 for areas, 17 for points; `zoomSnap: 0.25` as `StudioMap.tsx` does.
- **Draw-to-ask:** after the click or circle, the camera settles on the drawn area before the Area brief opens.
- **In Ask District IQ** the small `MapAnswer.tsx` map gets the same shots (today it only does a static `fitBounds`); **Open in Map** opens the full page at the same view and continues from there.
- **Reduced motion:** same final view, no flight (`fitBounds` / `setView` with `animate: false`), no ripples or pin drops, tours step on click instead of playing.
- **Testable:** the map container carries `data-camera` (last shot kind, target id, final bounds, whether the user took over) so Playwright can check the view without reading pixels.

**How it works.**
- **Plan vocabulary** (`src/lib/map/plan.ts`, zod; every field required, nullable where empty, for Groq):
  ```ts
  type Period = { kind: "last_days"; days: number } | { kind: "month"; offset: number } | { kind: "range"; from: string; to: string };
  type Filter = { category: string[] | null; severity: ("Severe"|"High"|"Medium"|"Low")[] | null;
                  status: "open" | "closed" | "any"; dept: string[] | null; period: Period | null; text: string | null };
  type AreaRef = { kind: "ward"; id: number } | { kind: "zone"; id: number } | { kind: "taluk"; code: string }
               | { kind: "place"; name: string; radius_m: number } | { kind: "drawn"; id: string };
  type Step =
    | { op: "take";      as: string; layer: LayerId; filter: Filter }
    | { op: "within";    as: string; of: string; near: string; meters: number }   // features of `of` within m of any feature of `near`
    | { op: "inside";    as: string; of: string; area: AreaRef }
    | { op: "along";     as: string; of: string; road: string; meters: number }   // road resolved by S1
    | { op: "nearest";   as: string; from: string; to: string; k: number }
    | { op: "farthest";  as: string; areas: "ward" | "zone"; from: string }        // area farthest from its nearest `from` feature
    | { op: "count_by";  as: string; of: string; by: "ward" | "zone" | "taluk" | "hex500" }
    | { op: "hotspot";   as: string; of: string; by: "ward" }                      // Gi* on ward counts + DBSCAN clusters
    | { op: "compare";   as: string; of: string; a: AreaRef; b: AreaRef }
    | { op: "change";    as: string; of: string; now: Period; before: Period };
  type Plan = { steps: Step[]; show: string; language: "en" | "ta" | "tanglish" };
  ```
  Limits enforced in code: ≤ 8 steps, 10 ≤ meters ≤ 5,000, k ≤ 20, periods ≤ 365 days, ≤ 5,000 features returned (larger → summarised by ward, said plainly).
- **Router:** a rules fast path (EN/TA/Tanglish patterns for the common shapes, no AI) → else `generateJson` with the plan schema, few-shot examples, and the layer catalogue → validate → resolve every place with S1 → execute. The model **never** sees SQL and never writes it; layers are loaded by fixed queries.
- **Executor** (`src/lib/map/execute.ts`): pure functions over in-memory features; every step returns `{ features, count, note }` for the trace.
- **Method choices stated in the trace and glossary:**
  - `farthest`: a 200 m grid of points inside each ward; the ward's distance = the 90th percentile of its points' distance to the nearest `from` feature ("which ward is farthest from a hospital" → "Ward 197: 90% of the ward is within 3.4 km of a hospital; the district's best is 0.6 km"). Filter "government hospitals" when asked.
  - `along`: the road's OSM line(s) buffered by `meters` (default 75 m).
  - `hotspot`: reuse the pipeline's Gi\* ward scores when the filter matches a stored family; otherwise compute Gi\* in TypeScript with the same contiguity as `district_intel/dintel/analytics.py` (a parity test against the Python output on frozen data) plus DBSCAN clusters; UI says "more than usual for its neighbours", never "z-score".
  - `compare` / `change`: counts, per-1,000 where a population figure exists (else counts only, said so), `pctChange` with the minimum base rule.
- **Answer text:** a fact pack → AI writes at most 2 sentences in the question's language → numbers verified → uncited sentences dropped; without AI, a template says the same.
- **Every pin opens its evidence** (`IncidentView`).

**Rules.** No free-form SQL path exists (a test greps the map code for SQL built from plan strings). Unknown layer or place → chips with the closest matches. OSM attribution always visible. Personal data (complainant names/phones) never on the map or in exports; complaints show category, status, ward, date.

**Data.** `map_layers` (registry cache), `saved_layers (id, owner, name, plan_json, created_at)`, `map_questions (id, owner, text, lang, plan_json, ms, ai_used, created_at)` for evaluation.

**Acceptance (golden, frozen data, `eval:golden`):**
1. "waterlogging within 300 m of schools" → the expected count and ids.
2. "thefts along Anna Salai this month" → Anna Salai resolved (also "Mount Road" and "அண்ணா சாலை"), 75 m buffer, current month.
3. "which ward is farthest from a hospital" → the expected ward and distance, method in the trace.
4. "where are garbage complaints clustering" → the expected top wards/clusters.
5. "compare Adyar and Velachery flooding" → both resolved as areas (chips show the choice), counts and change.
6. "அடையாறு அருகே திறந்த புகார்கள்" → open complaints near Adyar, answer in Tamil.
7. Follow-ups on 1: "make it 500 m", "only severe", "add hospitals", "last 7 days", "compare with Adyar" each change exactly one part of the plan.
8. An empty result is said plainly with the nearest miss.
9. Draw-to-ask on a ward → area brief with every count equal to its drill-down list.
10. Export GeoJSON/CSV row counts equal the answer; map PDF renders Tamil.
11. A plan with 9 steps, 9,000 m or an unknown layer is refused with a clarification, never executed.
12. Rule-only answers < 2.5 s, AI answers < 6 s (p90, on this PC).
13. Camera: `cameraFor` returns the expected shot for every question shape in the table (unit tests, no browser).
14. "open complaints near Adyar" → the map ends with the whole Adyar circle in view and not under the answer card (checked from `data-camera` against the card's box), at desktop and phone width.
15. A district-wide answer with one far-off report frames the rest and shows "1 more outside the view"; "Show all" frames everything.
16. Dragging the map mid-flight stops the camera; the next follow-up of the "make it 500 m" kind does not move it back; "Back to the answer" does.
17. Follow-ups: "make it 500 m" and "only severe" leave the view unchanged; "compare with Adyar" frames both areas.
18. With reduced motion on, every question ends at the same view as with motion, with no animation.

**Demo moment (40 s).** Monsoon morning, the whole district on screen: "waterlogging within 300 m of schools" → the map flies into Zones 13 and 10, rings ripple out from the schools, 37 pins drop in, "37 … map layer ready" → "only severe" → 28 pins fade out, 9 stay, the view doesn't move → click the worst one in the list → the map flies to it, ringed → "send these to SWD" → a proposal appears (F4).

---

### F2 — Source Scout: add any government website with one link · P0

**Why it wins.** The brief asks for exactly this ("allow new sources to be added using their link and, where legitimately permitted, credentials") and every rival plans fixed connectors. It is also how we **integrate the two FarmwiseAI-provided systems**, which the brief lists first and we have not done yet.

**FarmwiseAI echo.** AGRI-X: choose the area and data, get ready-to-use data without searching and converting by hand.

**Beats GroundTruth because** each of their sources is a connector someone writes. Ours is a link the Collector pastes.

**Where.** Data Studio → Add data → **"Scout a website"** (beside the existing file and link options).

**Extend, don't rebuild:** `connect/discover.ts`, `connect/browser.ts`, `connect/robots.ts`, `connect/vault.ts`, `fetchurl.ts`, `parse.ts`, `place.ts`, `relevance.ts`, `link.ts`, `pipeline.ts` (`runDueRefreshes`).

**What the Collector sees.**
1. Pastes a link (e.g. a department's "Reports" page). A live progress line: "Reading 12 of up to 30 pages on chennai.nic.in · robots.txt allows /press-release/ · 1 page a second."
2. **Candidate list** (one card per dataset, duplicates merged): what it holds (title + 5 sample rows), kind (file / table / dashboard data / feed), rows, columns, **date range**, **Chennai relevance** ("82% of rows name a Chennai place"), **freshness** ("newest row 25 Oct; page updated 26 Oct"), **licence/terms note** ("Government Open Data License – India" / "site terms do not mention reuse: ask the department before publishing"), where it was found, and the existing score with its reasons. Tick the ones to add.
3. **Map to the district (once):** detected place columns (district / taluk / ward / zone / LGD code / PIN / address), measures, date, category. Match against the gazetteer: "Taluk column: 14 of 16 values matched (88%) · unmatched: 'Mambalam-Guindy Tk' → suggest Guindy taluk ✓ / 'Fort-Tondiarpet' → suggest Tondiarpet ✓". The Collector confirms or fixes; learned spellings are saved **for this source** (the global gazetteer changes only on a separate approval).
4. **Refresh:** "Check every 6 hours" (default from how often the data changes); polite conditional requests.
5. **Added:** the normal Studio flow runs (profile → insights → link to incidents); the dataset is searchable, askable in Ask District IQ, a layer in F1, and has **Add to dashboard** (F7).

**How it works.**
- **Explore the site:** breadth-first from the link, same host (and its `www.` twin), depth ≤ 2, ≤ 30 pages, ≤ 2 minutes, 1 request/second per host (or the site's `Crawl-delay`), robots.txt for every host, honest user agent (the existing `UA`), skip logout / delete / print / calendar / search-result / session-id links. Rank links to follow by words: data, dataset, download, report, statistics, MIS, dashboard, abstract, press release, circular, `.csv .xls .xlsx .json .pdf`, and Tamil (தரவு, அறிக்கை, புள்ளிவிவரம், செய்தி வெளியீடு).
- **Collect every candidate:** published files (CSV/XLSX/JSON/PDF tables), HTML tables **with pagination** (follow "next" / `?page=` / DataTables Ajax, up to 20 pages or 5,000 rows for preview; all on add), the JSON APIs a dashboard calls (Playwright network capture, already in `browser.ts`), feeds. **Detect CKAN** (data portals such as data.opencity.in): use its API (`/api/3/action/package_search`, `package_show`) instead of scraping pages.
- **Place columns:** header words + value match rate ≥ 60% against S1; LGD/PIN only with a loaded reference (otherwise "LGD codes found; no LGD list loaded").
- **PDF tables:** the existing parser first. Docling only if it installs cleanly in the Python environment and the user agrees (it pulls PyTorch, ~2 GB). Cells with low confidence (merged headers, ragged rows, numbers that do not parse) go to a review grid for a person.
- **Self-healing** at every refresh: compare the shape fingerprint (`shapeKey`), the column set, the row count (a drop > 50%), the selector or JSON path, the HTTP result. On a change: keep serving the **last good** data (labelled "last good: 24 Oct"), re-discover on the same page, and put a **proposed new mapping next to the old one** ("'Ward No' is now 'Ward Number' · 'Total' column missing") in My Tasks and Sources health ("Needs a look"). A person approves or rejects. **Never silently guess.** Every heal is a ledger entry.
- **The two FarmwiseAI-provided systems** (links in Task_6.pdf):
  1. *Initial District Intelligence System* (sign-in). The **user** types the credentials into the Scout's sign-in form (vault, encrypted); you never see, type or print them. Scout captures the JSON the dashboard loads, lists the datasets, maps places. It covers Hyderabad (GHMC), so the relevance gate will say "outside Chennai": show that honestly ("Connected system · its rows are not placed on Chennai's map") and keep it as a connected source with its own panels.
  2. *Leave Monitoring System, Yadadri Bhuvanagiri Collectorate* (profile click, no credentials). Use the manual visible-window mode once to enter a profile; keep the session. **Make it useful:** officer availability ("on leave today / this week"). F4 uses it: "The officer for this work is on leave until Friday; send to the in-charge instead?" Department names are mapped once to our department codes, labelled with the source.
- **Rules:** permitted access only; never bypass a login, paywall, CAPTCHA, OTP or robots disallow; a site whose terms forbid automated access is refused with the quote; credentials only in the vault, never sent to the page or to an AI model; honest user agent; prompt-injection text inside scraped pages is data, never instructions.

**Data.** `scout_runs (id, url, started, finished, pages, status, log)`, `scout_candidates (run_id, cand_json, chosen)`, `source_mappings (source_id, version, fingerprint, mapping_json, status: active|proposed|rejected, decided_by, decided_at)`, `source_aliases (source_id, raw, place_ref)`, `source_drift (source_id, at, kind, detail_json, proposal_version)`.

**Acceptance** (mock government sites in `src/lib/studio/connect.test.ts` fixtures, local server):
1. a dashboard whose data comes from an XHR JSON → found as "dashboard data", mapped;
2. a paginated HTML table (3 pages) → all rows on add, one candidate;
3. a page linking a PDF and an XLSX → both candidates; the same table as CSV and HTML → one card;
4. a site behind a test sign-in → works with vault credentials; the password never appears in any API response, log or AI prompt (asserted);
5. a layout change (renamed column, 60% row drop) → last good kept, a side-by-side proposal, nothing switched until approved;
6. a robots disallow → refused with an explanation naming the rule; crawl limits (depth, pages, rate) hold; the UA is sent;
7. Tamil headers and Tamil place values map; unmatched values listed with suggestions;
8. a CKAN portal → API used, not page scraping.
**Live check** (with the user watching, after Phase-0 robots/terms checks): chennai.nic.in press releases and data.opencity.in → datasets found, mapped, refreshed once; both FarmwiseAI systems connected (user enters credentials).

**Demo moment (60 s).** Paste a GCC relief-centres page → 3 candidates → tick one → 96% of rows matched to wards → added → it appears as a layer on the Map and as a panel on My Board.

---

### F3 — Evidence Ledger, Challenges and Self-checks · P0

**Why it wins.** GroundTruth's headline is "every claim traced, every decision defensible". We make it **provable**: a hash chain means nobody, including us, can quietly change history; challenges are open to the people affected; and the system checks itself every night.

**FarmwiseAI echo.** TNIAMP "fund-to-field traceability"; Coimbatore "full audit trail".

**Beats GroundTruth because** their audit is append-only by API rule; ours is tamper-evident by mathematics and anchored in every PDF. Their Claim Court has one challenge type; ours covers any field, from officers and citizens, and outcomes feed F6. Their AI Comptroller is "future"; our self-checks ship.

**What the Collector sees.**
- On every incident, complaint, score and briefing: **"History"** → a time-ordered list: what arrived from which source, merges, scores and the rule, decisions, proposals, emails, field visits, photo checks, citizen answers, challenges; each with actor and time.
- **"What was known when":** for any incident, the moment each source first reported it and what the Collector's briefing said at the time (from `briefing_archive`).
- **Verify ledger** (Sources page, and the footer of each PDF): "12,431 entries · chain intact · today's anchor 3f9a…c21".
- **Challenge** (button on severity, category, place, department, a merge, a closure, a score): what is wrong, the proposed value, the evidence (photo, document, link). The system stores **what it showed at that moment** (evidence, rule, score breakdown). Outcome within 7 days by the Collector's office (or a delegated grievance officer): upheld / partly / rejected, with a reason. Upheld outcomes change the value (with a ledger entry) and count in F6 "challenge outcomes".
- Who may challenge: a department officer for their own department's items; the Collector's office for anything; a citizen for their own complaint (from Track Complaints).
- **Self-checks** (a small panel on Sources, nightly and on demand): every incident has ≥ 1 report; no source row deleted by the pipeline; drill-down totals equal headlines (sampled); no AI sentence without a citation in today's briefings; numbers in AI text match fact packs; ledger chain intact; feeds fresh; unresolved-place share under the threshold; F6 small-n rule respected. Pass/fail with history. Called "Self-checks", not "AI comptroller".

**Data.** Ledger columns on the audit table (S3), `ledger_anchors (day, head_seq, head_hash)`, `challenges (id, entity, entity_id, field, shown_json, proposed, reason, evidence_json, by, role, status, decided_by, outcome, outcome_reason, created_at, decided_at)`, `self_checks (run_at, check, passed, detail_json)`.

**Acceptance.** Editing any ledger row directly in the store makes `verifyLedger` report the exact first broken entry; no API route updates or deletes ledger rows (route scan test); a challenge stores the evidence and rule shown at that moment and is still readable after the incident changes; an upheld severity challenge changes the value and logs before/after; a citizen can challenge only their own complaint; each self-check fails on a seeded fault and passes when fixed; the PDF footer anchor equals the day's head hash.

**Demo moment (30 s).** The SWD officer challenges a severity → the Collector sees the rule that fired and the evidence as shown then → rejects with reason → History shows it, chain intact.

---

### F4 — Action Proposals: the system proposes, a person decides · P0

**Why it wins.** Dashboards that only show things do not change outcomes. Collectors act by instruction, follow-up and escalation. Making each of those a one-click, evidence-backed proposal is what turns intelligence into action, while keeping a person accountable.

**FarmwiseAI echo.** Yadadri: the Collector "monitors, assigns and closes every issue"; TNDRRA: "classifies, prioritises, assigns and tracks each to closure".

**Beats GroundTruth because** their case engine "recommends escalation by rule" and stops there; ours drafts, routes to the right officer (checking leave), sends on approval, creates the officer's task, and follows up.

**Where.** A **Proposals** list inside My Tasks (and a count on the Bell); a proposal card wherever one is created (F1 answer, incident detail, F6, F8, F2 heal).

**What the Collector sees.** A card: **"Send 7 waterlogging cases near schools to Storm Water Drain (Zone 13, 10)"** · why (evidence list + the rule) · to whom (officer accounts from the directory; "AE Zone 13 is on leave until 31 Oct (Leave system) → in-charge AE Zone 12") · deadline (category SLA) · the drafted instruction in English and Tamil (editable) · **Approve · Edit · Reject (reason required)**. After approval: "Sent · task on the officer's console · follow-up due 28 Oct 10:00".

**How it works.**
- Sources of proposals: F1 "send these to …", F6 citizen "No", stalled cases (deadline passed and no action for N days → escalate along the real chain from `nextLevel(route)` and `ref_departments`), F5 failed photo check ("ask for a new photo"), F8 playbook, F9 "check on the ground", F2 heal, chronic spots (F6).
- Batch split by department automatically; one card per department.
- Execution reuses existing code: decisions route, `actionmail.ts` (sandbox by default), officer task, complaint status sync (`syncComplaints`), `followups`.
- Follow-up: when due and nothing happened → a new proposal "Follow up / escalate".
- Learning: show acceptance and rejection rates per proposal kind; the existing priority learning may use them; **never auto-approve**.

**Data.** `proposals (id, kind, title_en, title_ta, payload_json, evidence_json, rule_id, recipients_json, due_at, status: pending|approved|rejected|expired|done, created_by, decided_by, decided_at, edit_diff_json, reject_reason)`, `proposal_items (proposal_id, entity, entity_id)`.

**Acceptance.** Nothing leaves without Approve (route test); edits persist and are logged; reject needs a reason; a mixed batch splits by department; sandbox email only; the officer sees the task; the follow-up is created and fires a new proposal when missed; escalation follows the chain; an on-leave officer triggers the in-charge suggestion; every step is in the ledger.

**Demo moment (20 s).** Approve the SWD proposal → switch to the SWD officer console (separate tab, per-tab sessions) → the task is there.

---

### F5 — Photo Proof: is the closure photo real? · P0 (rules) / P1 (AI vision)

**Why it wins.** False closures are the best-documented failure of grievance systems. A photo is only proof if it was taken there, then, and shows the problem gone.

**FarmwiseAI echo.** Coimbatore and Yadadri: field updates "with photos and a full audit trail"; M-Velanmai: AI below 90% confidence → an expert.

**Beats GroundTruth because** they have no closure step at all.

**Where.** Automatically when an officer sends or closes with photos (`/officer`), when a citizen answers "No" with a photo (F6), and on field visits (F9). A **Photo check** line on the incident and the complaint.

**What the Collector sees.** "✓ Photo checks passed: taken 2 days after the complaint, 40 m from its pin, not used before · AI: drain looks clear (high)". Or "⚠ Needs a look: the photo was taken 3.1 km from the complaint" / "⚠ This photo was already used for complaint 2026-104233 on 12 Oct". Or plainly: "No location in the photo (sent through WhatsApp?): not checked for place."

**How it works.**
1. **Metadata:** EXIF capture time (after filing, before closure), EXIF GPS distance to the complaint pin (pass ≤ 150 m), missing EXIF → "unverified", never "failed".
2. **Reuse:** a 64-bit perceptual hash (dHash) of every stored photo; Hamming distance ≤ 6 to any earlier photo in the district → reuse flag (survives resizing, light crops, recompression). Implement with a pure-JS decoder if possible; ask before installing `sharp`.
3. **Before/after** (P1): the citizen's filing photo vs the officer's completion photo → AI vision (Nova Lite or Gemini, fixed schema): `same_place: yes|no|unsure`, `problem_visible_after: yes|no|unsure`, `reason`, `confidence`. Below 0.9 → a person reviews. AI unavailable → rules only, said so.
4. **Never auto-reject.** A failed check creates an F4 proposal ("ask the department for a new photo from the site").
5. Privacy: originals private (existing access rules); copies shown to others have EXIF stripped; photos never sent to AI with personal data around them.

**Data.** `photo_checks (photo_ref, entity, entity_id, exif_time, exif_lat, exif_lon, dist_m, phash, reuse_of, ai_json, verdict: pass|needs_look|unverified, reviewed_by, reviewed_at)`.

**Acceptance.** Fixtures: GPS 3 km away → needs a look; a reused photo resized to 50% and recompressed → reuse found; WhatsApp-stripped → unverified; taken before the complaint → needs a look; same place before/after → AI result shown with confidence; AI off → rules only; nothing auto-rejected; checks appear in the ledger and in F6 "photo-verified".

**Demo moment (20 s).** An officer closes with an old photo → "already used for another complaint on 12 Oct" → a proposal asks for a new photo.

---

### F6 — Citizen Truth Check and fair Department Scores · P0

**Why it wins.** Relative performance discussed in review meetings changes behaviour (CitiStat in Baltimore; PayDash dashboards cut wage-payment delays in Madhya Pradesh and Jharkhand; a ranking report-card trial was registered for Bihar's MGNREGA officers). And official closure numbers hide unfixed problems: in Andhra Pradesh about **90%** of grievances were reported "resolved", while an IVRS survey of 33,538 "resolved" cases found only about **22%** satisfied (The Wire; the state's reply did not dispute it). Even the Government of India's CPGRAMS now calls citizens after closure: in November 2024, 44% of 55,206 feedbacks were satisfied. **F6 measures the truth from three sides: what the department claims, what citizens confirm, what photos prove.**

**FarmwiseAI echo.** TNDRRA feedback-to-closure; TNIAMP "one monitoring view across departments".

**Beats GroundTruth because** they have no citizen and no accountability measure. This is the feature a real Collector would use every week.

#### F6.1 Citizen Truth Check
- When a complaint is closed (`Resolved by Department` or `Verified by Collector`), Track Complaints (`src/app/citizen/track-complaints`, `src/lib/complaint-progress.ts`) shows: **"Is it really fixed? Yes / No"** (Tamil: "உண்மையிலேயே சரி செய்யப்பட்டதா? ஆம் / இல்லை") with an optional photo (checked by F5) and a comment, in English and Tamil.
- **"No"** → the complaint **reopens automatically**: new status `Reopened by Citizen` (add to `ComplaintStatus` and every switch that reads it), it returns to the department, **the deadline clock restarts** (new due = now + category SLA), an F4 proposal is created for the Collector's office, and it is logged in the ledger (F3).
- **Reopen even after the Collector verified it.** If the problem persists after a `Verified by Collector` closure, the citizen can still say "No" and report again. The reopened complaint then carries a **disclaimer banner** for both the Collector's office and the department officer:
  > ⚠ **Reopened by the citizen on 27 Oct, after the Collector's office verified it as fixed on 20 Oct.** Citizen says: "Drain overflowing again near the school gate." [photo · photo check result]
  The original verification is marked **"Disputed by citizen"** in the Collector's verified list (not "wrong": a field check, F9, is proposed to settle it). F6 tracks the **verification hold rate** (verified closures not disputed within 30 days). Same banner wording in Tamil.
- **Window and limits:** answers accepted for 30 days after each closure (config). One answer per closure cycle, only from the OTP-verified complainant (existing OTP). At most 2 citizen reopenings per complaint; a third "No" becomes a **persistent problem** for the Collector's grievance cell (call list) instead of another automatic reopen. Rate limits via `rate-limit.ts`. Repeated "No" on photo-verified closures is **flagged for review, not auto-punished**.
- **SMS/WhatsApp template** (EN/TA) with the tracking link exists for a **test channel only**: messages go to a dev outbox file/table; nothing is sent.
- **Spot-check list:** each week, a reproducible random sample (seeded by week) of closures with no citizen answer after 7 days, stratified by department; CSV export for the Collector's office to call (IVRS-style script in EN/TA), visible phone numbers only to the Collector role, every export logged; a form records call outcomes (fixed / not fixed / unreachable), which count as "confirmed by call". Nothing is sent automatically.

#### F6.2 Department scores (each defined once in the glossary, S5)
- **Deadlines met %** = closed within SLA ÷ closed, in the window.
- **Median days to close.**
- **Backlog age** = median age of open cases; share older than SLA.
- **Reopen rate** = reopened (citizen or Collector) ÷ closed.
- **The Truth Gap** (three bars per department): *closed as claimed* → *confirmed by citizens* (Yes answers + calls confirmed, with the response rate shown: "64 of 120 closures answered; 41 (64%) said fixed") → *photo-verified* (F5 pass). Use a Wilson interval: if the interval is wider than 30 points, show "not enough answers yet".
- **Verification hold rate** (F6.1).
- **Escalations**; **challenge outcomes** (F3, share upheld).
- **Data star rating** (1–5): on time (status updated within 24 h of the work), complete (required fields filled), consistent (no impossible status jumps).
- **"Fixed but back again":** the same category reported within 50 m within 60 days after a closure → "came back" count per department and a Map layer; 3 or more cycles → a **chronic spot** → an F4 proposal for a permanent fix to the department head. (Stops paying for the same pothole four times.)

#### F6.3 Fair by design
- **Case-mix adjusted:** expected days per category (district median over the last 90 days, or the SLA); a department's speed = observed ÷ expected (below 1.0 is faster than expected).
- **Per 1,000 cases** for counts.
- **Small numbers:** fewer than 20 closures in the window → "not enough data", listed separately in alphabetical order, **never ranked last**.
- **Two rankings:** *current level* (a composite whose weights live in config and are shown on screen) and *most improved month-on-month*, with the distance to the best.
- **Targets with traffic lights** (each with words and an icon, not colour alone); a 12-week trend with a words line ("better three weeks running").
- **"Why the score moved":** contribution by category and by zone (shift-share: mix of cases vs performance within each category), in one sentence plus a small table: "Deadlines met fell from 78% to 70%: mostly storm-water drain cases in Zone 13 (−5 points); more garbage cases this month (−1 point)."
- **Drill-down** from every number to every case; the totals equal the headline (tested).
- **Wording:** "needs attention", never "worst"; departments only, **no officer named** in any ranking.

#### F6.4 Review Room and review pack
- **Review Room** (P1, CitiStat style, projector-friendly at 1366 × 768): an agenda built automatically (departments needing attention first); one department per screen: scorecard, Truth Gap, overdue and stalled lists, chronic spots; **last meeting's Action Taken items reviewed first** (as DISHA meetings do); commitments typed live become ATR items (item, owner department, status, evidence link, due date) and F4 tasks; the next meeting shows which were kept.
- **One-click review pack** (PDF via S6, English + Tamil): scorecard, Truth Gap, overdue and stalled lists, chronic spots, last meeting's ATRs (item, status, evidence link, date; no official DISHA template was found, so these columns are ours), the ledger anchor in the footer.

**Where.** A new top-bar page **Departments** (scores, Truth Gap, Review Room). If eight tabs do not fit at 1366 × 680, propose a merge to the user.

**Data.** `truth_checks (complaint_code, cycle, answer, comment, photo_ref, channel, otp_verified, created_at)`, `spot_checks (week, complaint_code, dept, outcome, called_by, called_at)`, complaint columns `reopen_count`, `citizen_disputed_verification_at`, `dept_scores_weekly (dept, week, measure, value, n, expected, flags_json)`, `score_targets (measure, green, amber)`, `review_meetings (id, held_at, chaired_by)`, `atr_items (id, meeting_id, item, owner_dept, status, evidence_link, due_at, done_at)`, `outbox_test (id, channel, to_masked, text, created_at)`.

**Acceptance.**
1. Closing a complaint shows the question (EN and TA); "No" reopens it, restarts the deadline, creates the proposal and logs it.
2. "No" after a Collector verification shows the disclaimer banner on the Collector's and the officer's views, marks the verification "Disputed by citizen", and counts in the hold rate.
3. One answer per cycle; non-OTP users refused; the third "No" goes to the persistent list, not a reopen; rate limits hold.
4. Truth Gap computed per department, matching a hand calculation on fixtures.
5. Formula tests for every measure; case-mix changes the ranking as expected on a fixture where a slow department only handles slow categories.
6. Small-n departments are not ranked.
7. Drill-down totals equal the headline for every number on the page.
8. The PDF text equals the screen text (extracted and compared), Tamil shaped correctly.
9. No officer name appears in any ranking output (asserted on the data passed to the page).
10. "Fixed but back again" finds seeded repeat spots and none in a clean fixture.

**Demo moment (60 s).** A citizen taps "No, still flooded" (Tamil) → the complaint reopens with the banner "verified by the Collector's office on 20 Oct" → Departments page: SWD's Truth Gap "closed 120 · citizens confirm 64% · photos verify 51%" → "Why it moved" → one-click review pack in Tamil.

---

### F7 — My Board: "Add to dashboard" everywhere · P0

**Why it wins.** The brief ends: *"The Collector should be able to choose the information he/she wants to monitor and customise the dashboard accordingly."* This is that sentence, built literally.

**Where.** A new first tab **My Board**. Every panel, card, chart, map answer, area brief, chatbot answer, Studio panel, Scout dataset, score and alert gets **"Add to dashboard"** (pin icon + words).

**What the Collector sees.** A grid of live panels the Collector chose, each with "Updated 10:05 · from IMD / SWD / your dataset" and a change badge since the last look ("+3 since yesterday"). A line on top: **"Since you last looked: 2 panels changed: open waterlogging +12; SWD Truth Gap widened."** Drag to reorder, S/M/L size, rename, remove; several boards ("Monsoon", "Monday review"); boards saved and versioned with the existing workspaces ("reopen last week's version"). Optional per-panel alert: "tell me when open waterlogging is above 50" → the Bell (evaluated in code, no AI).

**How it works.** S7 recipes re-run on data refresh (no AI in the refresh path); a panel whose source broke shows "last good: 24 Oct · source needs a look" (F2 self-heal). Fits 1366 × 680 (2 rows × 3 medium panels); one column on phones.

**Data.** `boards (id, owner, name, version, is_current, created_at)`, `board_panels (board_id, panel_id, spec_json, position, size, last_seen_json, created_at)`.

**Acceptance.** Pin from 6 places (Overview card, F1 answer, area brief, chatbot chart, Studio panel, F6 score); reload keeps them (durable); new data updates them; thresholds fire once per crossing; a broken source shows last good; a board version reopens as it was; per-tab sessions keep boards apart; nothing in the refresh path calls AI (test).

**Demo moment (20 s).** "Add to dashboard" on the Map answer and on the Scout dataset → My Board shows both, live.

---

### F8 — Monsoon Mode · P1

**Why it wins.** Chennai's Collector lives through the north-east monsoon (October–December). FarmwiseAI's clients include TNSDMA and TNDRRA. GroundTruth calls disaster mode a "future extension".

**Trigger.** IMD orange/red warning for Chennai (`alerts.ts`), an NDMA SACHET alert, a CFM-DSS gauge above its danger level, a reservoir release notice, or the Collector switches it on. Switching off needs the Collector and a reason (ledger).

**What changes.** The alert bar becomes a mode bar; My Board switches to the **Monsoon board** preset: open waterlogging by ward (live), rain in the last 3 h / 24 h (gauges), lakes and releases (CMWSSB/CFM), relief centres and their status (F2 dataset), chronic flood spots (F6), hospitals near flooded wards (F1), power (TANGEDCO complaints), fallen trees, news of people stranded. Refreshes tighten within each source's limits (news every 30 min, gauges every 15 min).

**SITREP every 6 hours** (PDF via S6, EN/TA, every figure cited): situation and IMD warning (quoted as IMD's), rainfall, reservoirs, incidents by type and status, relief centres, casualties only by the existing counting rules (LT-04), actions taken (approved F4 proposals), open needs. Format modelled on common SDMA situation reports; say "District IQ format" (no official template was found).

**Playbook proposals (F4):** e.g. a Chembarambakkam release announced → "alert ward officers of the wards within 500 m of the Adyar river" (computed by F1), drafted, waiting for approval.

**Acceptance.** Replaying a frozen past alert turns the mode on, switches the board, produces a SITREP with citations whose numbers equal their drill-downs; switching off is logged; no forecast of our own anywhere.

**Demo moment (30 s).** The red alert arrives → the console turns into Monsoon Mode → SITREP in Tamil, one click.

---

### F9 — Field Verify: ground truth from the ground · P1

**Why it wins.** The competitor is named GroundTruth but collects none. We do: a person on the spot, with a geo-tagged photo, is the strongest evidence there is.

**FarmwiseAI echo.** Exactly FarmwiseAI's **Field Inspection Management & Monitoring System for the District Collector of Yadadri Bhuvanagiri**, and WaLDAS (1,24,876+ geo-tagged observations).

**How it works.** From an incident, a disputed closure (F6), a failed photo (F5) or F4, the Collector's office sends **"Please check on the ground"** to a field officer (department officer accounts; optionally a new `field_inspector` role). A phone-first page `/field`: my checks, a map pin, an "open directions" link, a short checklist per category (waterlogging: depth ankle/knee/waist, still there?, drain blocked?), camera capture (F5 runs live on GPS and time), optional Tamil voice note, submit. Offline queue (P2).

**Result:** a **field visit** becomes evidence on the incident, with the highest source reliability in the confidence breakdown; "not found" is recorded as a conflict (confidence falls); the incident shows "Checked on the ground 27 Oct 10:40 by AE Zone 13: still waterlogged (photo)". Every step is in the ledger.

**Data.** `field_checks (id, entity, entity_id, assigned_to, assigned_by, due_at, checklist_json, result_json, photo_refs, lat, lon, submitted_at)`.

**Acceptance.** Assign → the officer sees only their own checks → submit with photo → evidence appears and confidence changes → ledger; a photo 3 km away is flagged by F5; works at 375 px width and on a slow connection.

---

### F10 — Handover and Time Machine (continuity) · P1

**Why it wins.** Collectors are transferred often; knowledge leaves with them. GroundTruth names this problem and defers every solution (snapshot comparison, delta briefing, handover) to "future". We ship them.

**What the Collector sees.**
- **Since you last looked** (on sign-in, 3–5 lines, computed from the ledger and metrics): new severe incidents, decisions due, scores that moved, sources failing.
- **As of:** pick a date and time → the console as it was then (read-only, banner "You are looking at 20 Oct 09:00 · back to now"), built from the briefing archive, the ledger and status history.
- **Compare two dates:** new, closed, worse, better; a delta briefing with citations.
- **Handover pack** (page + PDF via S6, EN/TA): open commitments (ATRs, approved proposals not done), stalled cases, chronic spots, last year's monsoon spots, pending challenges, key contacts, sources and their health, the outgoing Collector's notes. The incoming Collector acknowledges each item (ledger).

**Acceptance.** As-of view at a past time shows only what existed then (a fixture incident created later is absent); the delta counts equal their lists; the handover pack lists every open commitment in the fixtures; acknowledgements are logged.

---

### F11 — Petition Day: Monday petitions, digitised · P2

**Why it wins.** In Tamil Nadu, Collectors, RDOs and Tahsildars receive petitions in person every Monday (meetings resumed on 11 May 2026 after the election code). Most petitions are paper. The brief asks for OCR; this is OCR doing a Collector's real job.

**How it works.** An intake desk mode for Collectorate staff: photograph a petition (typed or handwritten, Tamil or English) → text and fields by a vision model (Gemini or Nova Lite; Tesseract `tam+eng` as an offline fallback only if the user agrees to install it) → name, phone, place (S1), problem, relief asked, each with confidence; low-confidence fields highlighted for staff to type → classified (`ai-classifier.ts`), department routed, **duplicates linked** (an earlier complaint or an incident at the same place) → a complaint with channel "Petition Day" and a **token slip** (PDF via S6, Tamil) with the tracking code. During the meeting, the Collector's queue shows each petitioner's earlier complaints and the open incidents near their place (F1), so an answer can be given on the spot.

**Rules.** Images private; a consent line on the slip (DPDP); personal fields never sent to AI beyond the image itself where unavoidable (state this to the user and get approval before enabling vision OCR on real petitions).

**Acceptance.** Five sample images (typed EN, typed TA, handwritten TA, mixed, poor light): fields with confidence; handwritten Tamil goes to review; duplicates linked; the token works in Track Complaints.

---

### F12 — Lakes and floods from space · P2 (only if access is verified in a one-day spike)

**Why it wins.** Remote sensing is FarmwiseAI's core (Digital Crop Survey on Sentinel-1/2, SkyLab change detection). GroundTruth's satellite evidence is a mock connector. A real one, even small, is a clear win.

**How it works.** A new `district_intel` module (collectors untouched): Sentinel-2 L2A open imagery (STAC, e.g. Element 84 Earth Search on AWS; no key) → NDWI water area for Chennai's reservoirs (Chembarambakkam, Puzhal, Poondi, Cholavaram, Kannankottai–Thervoy Kandigai) on each cloud-free pass → compared with the CMWSSB/CFM storage → "satellite water spread agrees with the reported level" or "differs by 18%", with the scene date. Optional: Sentinel-1 radar flood extent in the monsoon (all-weather), only if free access is confirmed. The result is an evidence type "satellite" on flood incidents in wards that overlap detected new water.

**Rules.** If access or packages (rasterio, ~20 MB) are not cleared in one day, drop it and say so. **Never** show simulated imagery as real.

---

## 8. Cross-cutting: simple, accessible, government-grade

- **The Collector's first 10 seconds:** My Board's "since you last looked" line, the alert bar, and the count of proposals waiting. Nothing else competes.
- **Tamil everywhere:** UI strings in one dictionary (EN/TA), a language switch on every console, Tamil fonts in PDFs (S6), Tamil answers for Tamil questions, Tamil templates (Truth Check, SMS test, SITREP, handover, token slip).
- **Accessibility audit** before the final phase: keyboard-only run through F1, F4, F6, F7; screen-reader names on map answers (list view toggle); contrast check in light and dark; 200% text; reduced motion; phone width for `/field`, `/officer`, `/citizen`.
- **Explain every number:** ⓘ → glossary definition (S5); "How this was worked out" on every computed answer.
- **Honest states:** loading, empty, stale ("last good"), failed ("this source is not answering since 10:05"), AI off ("answered without AI").
- **Performance budgets** (law 16) measured and reported.

## 9. Security, privacy, permitted access

- Permitted access only (robots, terms, honest UA, rate limits, no bypass of any sign-in). The vault is the only place for credentials; API responses never include them (tested).
- SSRF: reuse `src/lib/netsafe.ts` for every scout request and every browser sub-request (already in `browser.ts`).
- AI hygiene: scraped and citizen text is data, never instructions (existing guard); personal data stripped from every fact pack and prompt; photos to AI only for F5/F11 and only after the user approves enabling it.
- DPDP Act 2023: purpose and minimum data, masked phones, retention for photos (config), consent lines, every personal-data export in the ledger.
- Roles: Collector, department officer (own department only), field inspector (own checks only), citizen (own complaints only). Server-side checks on every new route; tests for each role boundary.

## 10. Data model additions (summary)

Add each durable table the way the code already adds durable tables (look at how `outbound_emails`, `sources.mapping` and the officer tables reach both the MySQL migration path and the AWS durable store / `DURABLE_ADDED`), and ask the user before the first one.

`map_layers, saved_layers, map_questions · scout_runs, scout_candidates, source_mappings, source_aliases, source_drift · ledger columns on audit + ledger_anchors · challenges · self_checks · proposals, proposal_items · photo_checks · truth_checks, spot_checks, outbox_test, complaints.reopen_count, complaints.citizen_disputed_verification_at, status 'Reopened by Citizen' · dept_scores_weekly, score_targets · review_meetings, atr_items · boards, board_panels · monsoon_mode, sitreps · field_checks · petitions · sat_observations`

## 11. API additions (summary)

Under `/api/collector/…` unless noted; every route checks role server-side, validates with zod, writes its ledger row inside the change's transaction.

`map/ask · map/layers · map/layer/[id] · map/area-brief · map/export · map/save` — `studio/scout (NDJSON progress) · studio/scout/[run]/add · studio/mapping/[source] (get, propose, approve)` — `ledger/[entity]/[id] · ledger/verify · challenges (create, decide) · selfchecks` — `proposals (list, decide)` — `photos/check` — `/api/complaints/[code]/truth-check (citizen) · truth/spot-checks (export, record)` — `departments/scores · departments/why · review (meetings, atr) · print/[kind]/[id]` — `boards (list, save, panels)` — `monsoon (state, on, off) · sitrep` — `/api/field/checks (officer/inspector)` — `petitions (intake, list)`.

## 12. Testing

- **Unit (vitest):** plan validation and executor (every op, limits), place resolver (EN/TA/Tanglish, roads, ambiguity), Gi\* parity with Python on frozen data, scout crawl limits / robots / pagination / CKAN / self-heal diff, vault never leaks, ledger chain and tamper detection, proposal state machine, photo checks (EXIF, dHash reuse), Truth Check state machine and limits, every F6 formula, case-mix and small-n, drill-down equals headline, print text equals screen text, role boundaries.
- **Golden (`npm run eval:golden`):** add the F1 questions (section 7, F1 acceptance) and the F6 numbers to the frozen evaluation store; freeze only with the user's OK.
- **End-to-end** (Playwright scripts in `scripts/e2e/`, against `portal-aws-dryrun` on 3001): the hero demo (section 16) runs unattended and asserts each step.
- **Report measured numbers only** (pass counts, timings, golden score), never "should work".

## 13. What not to build

No new design language (keep Marina green and the motion style). No department switcher for officers. No AI in refresh paths. No forecasts. No real SMS/WhatsApp. No mock data shown as real. No new map library (Leaflet stays). No rewrite of working modules: extend them.

## 14. Risks and the fallback for each

| Risk | Fallback |
|---|---|
| AI provider down or slow | Rule fast paths and templates everywhere; "answered without AI" label |
| Overpass/OSM unavailable | Use the cached GeoJSON; facility layers from GCC lists via F2 |
| A FarmwiseAI system changes or is down | Last good data; self-heal proposal; demo shows the connector state honestly |
| Tamil PDF rendering | S6 through the browser; if the browser is missing, HTML print view only, said so |
| Small numbers in F6 on real data | "Not enough data" is the correct output; fixtures demonstrate the full ranking |
| Docling/sharp/rasterio won't install | Existing parser / pure-JS hash / drop F12, each said plainly |
| Time runs out | Ship P0 complete before any P1; cut P2 first |

## 15. Phases (stop after each; report per section 17)

- **Phase 0 — Verify and plan (no code changes).** Ask the user for the final review date and how many days remain. Check every claim in section 4 against the code; list differences. Run the baseline (`tsc`, `vitest`, `eval:golden`, `pytest`) and record numbers. Check robots.txt and terms of chennai.nic.in, data.opencity.in and both FarmwiseAI systems. Check package needs. Measure the top bar with 8 tabs. Propose the exact cut (what fits the days left) and the durable tables to add. **Stop.**
- **Phase 1 — Foundations:** S1 resolver, S2 layer registry + cached OSM layers, S3 ledger chain, S4 proposals, S5 glossary entries, S6 print service with Tamil, S7 panel spec. **Stop.**
- **Phase 2 — F1 Ask the Map + F7 My Board.** **Stop.**
- **Phase 3 — F6.1 Truth Check (incl. reopen after verification) + F5 rules + F4 wiring.** **Stop.**
- **Phase 4 — F6.2–F6.4 Department scores, Truth Gap, review pack** (Review Room if time). **Stop.**
- **Phase 5 — F2 Source Scout + both FarmwiseAI systems** (the user enters credentials). **Stop.**
- **Phase 6 — F3 challenges + self-checks + F10 continuity.** **Stop.**
- **Phase 7 — F8 Monsoon Mode + F9 Field Verify + F5 AI vision.** **Stop.**
- **Phase 8 — Stretch: F11 Petition Day, F12 satellite.** **Stop.**
- **Phase 9 — Polish:** accessibility audit, performance budgets, golden refresh (with OK), e2e hero run, `docs/District_IQ_Demo_Script.md` and the review pack updated with measured numbers. **Stop.**

If days are short, the minimum winning set is: **S1–S7 → F1 → F7 → F6.1 → F4 → F6.2 (no Review Room) → F2 (fixtures + one live site + the FarmwiseAI systems) → F3 ledger verify.**

## 16. The hero demonstration (12 minutes; 3-minute cut = steps 1, 3, 6, 8, 11)

A monsoon morning in Chennai:
1. **Sign in** → My Board: "Since you last looked: open waterlogging +12; SWD Truth Gap widened." (F7, F10)
2. **IMD red alert** arrives → Monsoon Mode; the board reflows. (F8)
3. **Map:** "waterlogging within 300 m of schools" → 37 · map layer ready → "only severe" → 9 → trace. (F1)
4. Click Ward 178 → "What is happening here?" → area brief with departments and citations. (F1)
5. "Send these to SWD" → proposal → the AE is on leave (FarmwiseAI's Leave system) → in-charge suggested → Approve. (F4, F2)
6. Switch to the SWD officer tab → the task is there → the officer closes one with an **old photo** → "already used on 12 Oct" → new-photo proposal. (F5)
7. **Field Verify** on another → the inspector's phone page → geo-tagged photo → "still waterlogged" → confidence changes. (F9)
8. **Citizen** tab → Track Complaints → "Is it really fixed?" → **"இல்லை"** with a photo → reopened, clock restarted; it had been **verified by the Collector's office** → the disclaimer banner on both consoles. (F6.1)
9. **Departments:** SWD "closed 120 · citizens confirm 64% · photos verify 51%"; "why it moved"; small departments "not enough data". (F6.2)
10. **Review pack** in Tamil, one click; footer shows the ledger anchor → **Verify ledger: chain intact.** (F6.4, F3)
11. **Data Studio → Scout a website:** paste the GCC relief-centres page → candidates → 96% matched → added → "Add to dashboard" → on My Board and as a Map layer. (F2, F7)
12. **Handover pack** for the next Collector: open commitments, chronic spots, pending challenges. (F10)

Closing line: *"GroundTruth asks you to trust its records. District IQ checks them: with the source, on the ground, and with the citizen. And it already runs on your AWS."*

## 17. Report format after each phase

1. What was built (files, in one line each).
2. Measured results: tests (before → after), golden score, timings vs budgets, screenshots (light and dark, 1366 × 680 and 375 px).
3. Acceptance list with pass/fail per item; anything failing says why and what is next.
4. What differs from this document and why.
5. Decisions needed from the user (one line each).
6. Nothing committed or pushed unless the user said so.

## 18. Judge Q&A (keep answers short and true)

- **"Isn't most department data simulated?"** Yes: police, PWD, hospital and the bulk grievance history are generated (we have no access to those systems). IMD, CFM-DSS, CPCB, AGMARKNET, CMWSSB, NDMA SACHET and the news are real, and so is every complaint filed through our citizen portal. (Check the current split in Phase 0 and quote measured numbers.) Source Scout and the vault show how real department systems plug in, and the two FarmwiseAI systems are connected live. (Do not put "simulated" badges in the UI: decision C-1; answer honestly when asked.)
- **"What if the AI is wrong?"** The AI never computes numbers or decides actions. It turns questions into typed plans that code checks and runs; every answer shows its method; below the confidence bar a person decides.
- **"How is this different from GroundTruth?"** Section 2.1 in one breath: they plan to trace claims; we trace them, test them on the ground and with the citizen, act on them with approval, and keep a tamper-evident record. Their future extensions are our shipped features.
- **"Is ranking departments fair?"** Case-mix adjusted, per 1,000, small numbers not ranked, two rankings including most improved, no individual named, every number drills to cases, and departments can challenge.
- **"Can the citizen abuse 'No'?"** OTP-verified complainant only, one answer per closure, two reopenings maximum, then a person calls; repeated "No" on photo-verified closures is reviewed, not punished.
- **"Will it scale to other districts?"** Places, departments and sources are data: a new district needs its gazetteer, wards and source links; Source Scout adds the rest.
- **"Is the scraping legal?"** robots.txt, terms, honest identity, rate limits, no bypassing sign-ins, credentials only where the owner gave access, licences shown on every dataset.

## 19. Evidence and references (cite these, not memory)

- Task 6 brief: `C:\Users\DELL\Documents\Task_6.pdf`.
- Competitor: `C:\Users\DELL\Downloads\proposal_copy.pdf` ("GroundTruth", 33 pages).
- FarmwiseAI: https://www.farmwiseai.com/products (MapsAI, SkyLab), https://www.farmwiseai.com/industries/urban-governance (Yadadri field inspection, GHMC QR, TNDRRA feedback, Coimbatore property tax), https://www.farmwiseai.com/industries/agriculture (Digital Land Foundation, Digital Crop Survey, M-Velanmai, AGRI-X, FARMPLOTTER), https://www.farmwiseai.com/industries/mining (TNIAMP, WaLDAS), https://www.farmwiseai.com/industries/infrastructure (SIPCOT), https://www.farmwiseai.com/industries/ai-automations (AI Mentor, Experian).
- Andhra Pradesh false closures: https://thewire.in/politics/too-many-delays-false-closures-why-andhras-public-grievance-redressal-system-is-facing-backlash and the state's reply https://thewire.in/government/andhra-pradesh-govt-responds-to-the-wire-report-claims-public-grievances-being-addressed-effectively
- CPGRAMS Feedback Call Centre (DARPG monthly reports): https://static.pib.gov.in/WriteReadData/specificdocs/documents/2024/dec/doc20241218473901.pdf
- Bihar MGNREGA ranking report-card trial (registered; results not found, so do not quote outcomes): https://www.socialscienceregistry.org/trials/481 · PayDash evidence: https://div.fund/portfolio/paydash-improving-last-mile-access-to-information-on-social-program-delivery
- CitiStat: https://www.centreforpublicimpact.org/case-study/data-driven-government-baltimore and https://icma.org/sites/default/files/4866_.pdf
- Tamil Nadu Monday petitions: https://cra.tn.gov.in/griev_pet.php · https://tiruvallur.nic.in/?p=73258
- DISHA timelines (agenda 10 days before, ATR within 30 days): https://eparlib.sansad.in/bitstream/123456789/3019909/1/18_Rural_Development_and_Panchayati_Raj_32.pdf
- GIGW 3.0 (WCAG 2.1 AA): https://guidelines.india.gov.in/?p=10063
