# Data Studio masterclass: report (28 Oct 2026)

Branch `studio/masterclass`, 17 commits on top of `main` (aefa724). Nothing pushed or merged.

## 1. Before → now
| Area | Before | Now |
|---|---|---|
| Any link | the best-scored thing on the page was charted, headlines included | one of 6 honest outcomes (DATA, CHOOSE, NO DATA, NOT RELEVANT, BLOCKED, ERROR) + DUPLICATE; a strict gate earns a dashboard (`connect/resolve.ts`, `connect/gate.ts`) |
| Many files | silent auto-pick of the first | the picker: groups, one card per dated series, combine, remembered by columns |
| Sources | page tables, 4 linked files | + exploration (2 clicks, 30 pages, sitemap), pagination, script JSON, CKAN, Socrata, ArcGIS, DCAT, data.gov.in (key), Tableau/Power BI/video/social/search known by address |
| File types | Excel, CSV, JSON | + PDF tables, scanned PDFs and pictures (OCR, English + Tamil), DOCX, KML/KMZ, GeoJSON, XML, ZIP, every sheet, UTF-16, legacy Tamil flagged |
| Thin data | full dashboard of 3 rows | fact card / small sorted table / full dashboard (`readiness.ts`) + honest enrichment buttons |
| Charts | no checks | Chart Doctor (`chartlint.ts`): 13 hard rules on every drawn panel, why-this-chart, alt text, Show as table |
| Updates | plain refresh, replace only | Live Connectors: replace/append/snapshots, daily files, API periods, health, retries, self-heal, quarantine, backfill, watches, Connectors tab |
| Insights | ~19 kinds by score | + 9 kinds (drivers, unusual change, change point, steady share, seasonality, correlation, target gap, funnel outliers, freshness); usefulness ranking; counts of things never "Needs action" |
| Trust | — | data card + change log (rows added/removed by content, columns, jumps, quarantines) |
| Families | — | 8 families detected with confidence, confirm/correct in one click, ranking boosted |
| Ask / outputs | — | why-answers from drivers, follow-ups keep filters, Tamil answers, "how computed"; brief PDF (EN/TA, Tamil font embedded); Excel with "What changed"; Briefing gated to Needs action |

## 2. Outcomes
**68 link fixtures** (`scripts/studio-fixtures/server.mjs`, test `outcomes.test.ts`): **68/68 correct**, including the two OCR fixtures (real rendered tables: 90%+ of cells read right). 0 dashboards for NO DATA, NOT RELEVANT, BLOCKED and ERROR.

**Live morning check** (`morning.live.test.ts`, run with `STUDIO_LIVE=1`, read-only, robots respected):

| Link | Outcome | Right? |
|---|---|---|
| data.opencity.in Chennai public toilets (CKAN) | DATA on the first run (32 s); timeout on the re-run | yes / site slow |
| data.opencity.in fire stations (guessed URL) | ERROR 404 / timeout | the URL was wrong |
| tn.data.gov.in resource, no key | BLOCKED (key) | yes |
| Wikipedia List of neighbourhoods of Chennai | NO DATA | **no**: the list is bullet points, not a table (gap below) |
| The Hindu Chennai section | NO DATA (news) | yes (was NOT RELEVANT before the fix) |
| Random Wikipedia article | NO DATA | yes (was CAPTCHA before the fix) |
| YouTube | NO DATA (video) | yes |
| GitHub CSV, world GDP | NOT RELEVANT | yes |
| chennai.nic.in home | NO DATA | yes |
| chennai.nic.in missing page | ERROR 404 | yes |
| Tableau Public | BLOCKED | yes |
| 127.0.0.1 | ERROR (private) | yes |
Google Sheet, a government PDF and a robots-disallowed page were tested on fixtures only (no known public link).

## 3. Numbers
- vitest **1,044 passed**, 13 skipped (12 live checks, 1 old) · tsc clean · golden 6/6 (no AI)
- Production build (`NEXT_DIST_DIR=.next-studio-hunt`) succeeds with `NODE_OPTIONS=--max-old-space-size=6144`; without it the build ran out of memory (exit 134).
- Chart Doctor: one test per rule, 0 hard violations over every panel of the 4 samples and every DATA fixture
- Connectors: 11 simulation tests (7 days, late, failing 15 min/1 h/3 h, drift + approval, quarantine, watch, catch-up, backfill, snapshots, API periods)
- Insights: 16 tests (each new type, funnel on different sizes, ranking parts, R-19 negatives, no causal words, golden top 3)
- Speed: 50,000 rows read, cleaned, designed, linted and mined in **3.5 s**, heap +64 MB; brief PDF 0.5 s (4.7 s when the browser starts)

## 4. Bugs
22 logged in `BUGS.md` (S-001 … S-022), all fixed with tests. The second review and the live check found more, fixed in cfec28c: CAPTCHA false positives, news pages with a stray table, connector data-safety issues (silent rebuild-failure loop, orphans after delete, re-proposing mappings, re-asked rejected periods, stalled API days, weekly running daily, Fetch now dropping history, no run lock), OCR limits (40 MP, 60 s, BM-CSV taken for a bitmap), insight edge cases (unequal windows, partial week, summed levels, Needs action flicker), and a test-only race between fixture servers.

## 5. Screens worth showing
Outcome screen (NO DATA, Tamil) · the picker (14 files, groups) · series card "Daily reservoir levels · 27 files" · fact-tier file (no charts) · chart with why-line and table toggle · Connectors tab with a self-heal proposal · Data card · Not-Chennai warning bar.

## 6. Two-minute demo
1. Paste `http://127.0.0.1:4599/ckan/dataset/chennai-public-toilets` (fixture server running, `STUDIO_FIXTURES=1`) → CHOOSE (CSV + GeoJSON) → add one.
2. Paste `http://127.0.0.1:4599/c/portal` → the picker → choose 2.
3. Paste a news article (`/n/article`) → NO DATA, "Add it to News".
4. Paste `/live/reservoirs` → the series card → "Keep updating daily" → Live Connectors → Run now.
5. `curl "http://127.0.0.1:4599/live/_state?day=8&renameFrom=8"` → Run now → the self-heal proposal → approve.

## 7. Owner questions
- **Bedrock key** expired (`npm run ai:key`); the Studio AI ran on the backup.
- **data.gov.in API key** for the OGD adapter's live path.
- **Population by ward/zone**: needed for "per 1,000 people" (the button says so).
- OCR language data (eng, tam, 4.3 MB) was downloaded into `data/ocr/` as approved.

## 8. What is left
1. Lists in `<ul>` (Wikipedia list pages) are not read as data: add a list-to-table reader in `discover.ts` when a page has one long list of names.
2. A slow portal (opencity.in) can hit the 25 s timeout: allow a longer timeout for platform APIs in `platforms.ts`.
3. Chooser gaps: bullet bars for target vs achieved, small multiples, histogram/box (`types.ts` ChartKind, `StudioChart.tsx`).
4. AI link ranking in exploration (rules only now); OneDrive/SharePoint links.
5. axe scan: blocked by the console's CSP in the browser pane; run it with Playwright `bypassCSP`.
6. Family-specific views beyond question sets and ranking (e.g. days of cover for supplies).
7. A seeded monkey run and full 390/1440 × light/dark × EN/TA screenshot set were not done (budget).
