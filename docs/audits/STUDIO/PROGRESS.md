# Data Studio masterclass: progress

**Status (28 Oct 2026, end of session 2): all U-items built; see REPORT.md for results and what is left.** Session 2 added OCR, U5 Live Connectors, U4 insights 2.0, U7 data card, U6 families, U8 Ask/brief/export, and the bug hunt fixes. vitest 1,044 passed, tsc clean.

Branch `studio/masterclass` (from `main` at aefa724). Nothing pushed.

## Baseline (session 1 start, 28 Oct 2026)
| Check | Result |
|---|---|
| `npx vitest run` | 875 passed, 1 skipped |
| `npx tsc --noEmit --incremental false` | clean |
| `AI_PROVIDER=none npx vitest run --config vitest.golden.config.ts` | 6 passed, 1 skipped |

## Now (session 1 end)
| Check | Result |
|---|---|
| vitest | **996 passed**, 1 skipped, 2 todo (OCR, see owner questions) |
| tsc | clean |
| golden (no AI) | 6 passed, 1 skipped |
| 9.1 outcome fixtures | **66 of 66** correct (+2 OCR todo); 0 dashboards for NO DATA / NOT RELEVANT / BLOCKED / ERROR |
| 9.4 Chart Doctor | 13 hard rules, one test each; **0 hard violations** over every panel of the 4 samples and every DATA fixture |
| 9.7 numbers | KPIs and bars recomputed from the raw fixture rows: equal (20+ values) |

## Done in session 1 (with proof)
- **U1 link engine**: `connect/resolve.ts` (six outcomes + DUPLICATE), `connect/gate.ts` (strict gate a/b/c),
  `connect/explore.ts` (2 clicks, 30 pages, sitemap, data words, robots), `connect/platforms.ts` (CKAN, Socrata,
  ArcGIS paged, DCAT, data.gov.in with key; video/social/search/Tableau/Power BI known by address),
  `connect/series.ts`, `formats.ts` (PDF text tables, DOCX, KML/KMZ, GeoJSON, XML, ZIP, UTF-16, legacy-Tamil flag),
  pagination, script-JSON sniffing, duplicate by content and schema, polite 1 req/s/host, a 60 MB read budget per
  link, the fixture host only with `STUDIO_FIXTURES=1`. Proof: `outcomes.test.ts`, `engine.safety.test.ts`.
- **U1b picker**: `Outcome.tsx` Picker (groups, series card with latest/all/keep-updating, search, sort, type filter,
  select recommended, combine when columns match, 50 per page, 5-row previews), `/api/collector/studio/pick`,
  choice remembered by schema. Browser-checked at 1440 and 390 px, EN and Tamil: 2 of 2 picked datasets added (S-009
  fixed). Proof: outcomes.test.ts 9.2, engine.safety.test.ts "the choice is remembered".
- **Outcome screens**: NO DATA / NOT RELEVANT (preview + Use anyway → warning bar) / BLOCKED (vault) / ERROR (retry
  only where it helps) / DUPLICATE (open / refresh). Tamil reasons and buttons by reason code.
- **U2 sufficiency**: `readiness.ts` (tiers, GUARD), Designer tiers in `dashboard.ts` (fact = numbers + rows, small =
  sorted table with in-cell bars + ≤3 KPIs + ≤1 bar), % change needs base ≥ 20, map needs 5 places and 20% placed.
  Browser-checked: a 3-row file shows 2 cards and its rows, no chart. Proof: chartlint.test.ts 9.3.
- **U3 Chart Doctor**: `chartlint.ts` (lint, violations, renderPanel) on every drawn panel (view, Analyst answer,
  board, preview, add-panel, drill breakdowns); why-this-chart line, alt text, "Show as table", zero axis, labels and
  titles wrap at words. A guard test fails if a drawn panel skips it.
- Review by a fresh subagent: no cheating found; its 12 findings fixed (S-014..S-018 in BUGS.md).
- `vault.ts` follows `STUDIO_DIR`; launch configs `studio-masterclass-3001` (with STUDIO_FIXTURES=1) and
  `studio-fixtures-4599`; `data/studio-test` is the working copy (git-ignored).

## Half-done (exact next step)
1. **U2 enrichment buttons** (per 1,000 people, compare with incidents, compare with last refresh, find more on this
   site, "what should this be compared with?"): not built. Next: a row of buttons under the fact/small view in
   `Dataset.tsx`; "compare with incidents" opens the existing District link tab; "last refresh" reads
   `source.connect.history`; "per 1,000" needs ward/zone population, which the district reference does not hold
   (say so on the button until the owner provides it).
2. **U3 chooser gaps**: bullet bars (target vs achieved), small multiples (> 6 series), histogram/box, funnel flags,
   "gaps shown as gaps" on sparse daily series. Next: chart kinds in `types.ts` ChartKind + `StudioChart.tsx`, chosen in
   `dashboard.ts`, rules in `chartlint.ts`.
3. **Live-AI link ranking** (Nova Lite ranks links in exploration): rules ranking only (`explore.ts` dataRank). Next:
   `ai.ts` call with a content-hash cache, rules fallback; at most 1 call per link.
4. **Adapters not done**: OneDrive/SharePoint public links (`fetchurl.ts directUrl`).
5. **9.8 / 9.11 a11y**: axe could not run in the browser pane: the console's CSP blocks injected scripts and fetches.
   Next: a Playwright script with `bypassCSP: true` and the owner's session, or run axe in vitest with linkedom.
   Keyboard: native checkboxes/buttons, focus rings added; not yet walked end to end with the keyboard only.
6. **9.10 performance**: not measured (list, open, picker < 3 s, 50k-row ingest).
7. The **insights** on small files are trivial ("3 zone complaints", "1 sites"): U4 (session 2) must rank them out.
8. Session 2 also: U5 Live Connectors (the series "Keep updating daily" choice today only sets a daily refresh of the
   newest file: the connector object, modes, health, quarantine are session 2), U4, U6, U7, U8, the bug hunt, REPORT.

## Owner questions
- **OCR** (fixtures d-ocr-image, d-ocr-scan are `it.todo`): tesseract.js is installed but its language data (eng, tam
  traineddata, ~25 MB) is not. May it be downloaded into the repo (e.g. `data/ocr/`)? Until then a scanned PDF says
  plainly that it is a scan and asks for the Excel/CSV.
- **Bedrock key** looks expired (the console banner says so): `npm run ai:key`. Studio AI ran on the backup.
- **data.gov.in API key**: needed for the OGD adapter's live path (BLOCKED-key outcome until then).
- A dev server not started by this session was listening on **port 3005** at the start; it was left alone.

## Handover for session 2
Read this file, `BUGS.md`, `TASKS.json`. Start servers with the `studio-fixtures-4599` and `studio-masterclass-3001`
launch configs (the browser pane already holds a Collector session). Fixture links: `http://127.0.0.1:4599/...`
(list in `scripts/studio-fixtures/server.mjs` FIXTURES). Windows note: Python edits save CRLF; tests that parse
source must accept `\r\n`. Then: finish half-done items 1-2, then U5.
