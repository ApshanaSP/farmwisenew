# Data Studio masterclass: bugs

Each bug: ID, severity, steps, expected, actual, root cause (file:line), fix commit, regression test.
Severity: P0 wrong data or unsafe · P1 a promise broken (an outcome, the gate, a chart rule) · P2 rough edge · P3 polish.

| ID | Sev | Steps | Expected | Actual | Root cause | Fix | Test |
|---|---|---|---|---|---|---|---|
| S-001 | P1 | Paste a news article, a home page or a menu-only page | NO DATA, never a dashboard | A page of 5+ headlines became a "dataset" of headlines (kind `headlines` scored up to +22) and was charted | `connect/discover.ts` (old line 263: headlines boosted to win) and `pipeline.ts` `choose()` always took `found[0]` | Strict gate (`connect/gate.ts` gateA) rejects headlines and page feeds; `connect/resolve.ts` decides the outcome | `outcomes.test.ts` n-article, n-blog, n-home |
| S-002 | P1 | Paste a cricket score card / student marks with no AI model set | NOT RELEVANT | Rules alone never stopped a run (`relevance.ts` judge: "With no AI, nothing is stopped") | `relevance.ts` judge(): block needed an AI verdict | Rules relevance before the run (`gate.ts` quickRelevance): no Chennai evidence, or an off-topic header set, is NOT RELEVANT | r-cricket, r-marks, r-shares, r-population, r-kerala |
| S-003 | P1 | Paste a page linking 2+ data files | CHOOSE (the Collector picks) | The best-scored candidate was used silently | `pipeline.ts` ingestLink: `choose(c.found)` | CHOOSE outcome + saved pick + `/api/collector/studio/pick` | c-3tables, c-csv-xlsx, c-portal |
| S-004 | P1 | Re-add the same sample or file | "You already have this. Open / Refresh instead?" | It silently opened the old dataset (no outcome shown) | `pipeline.ts` alreadyAdded() returned the old id as if new | DUPLICATE outcome (`resolve.ts` duplicateOutcome, findDuplicate by content hash and schema) | outcomes.test.ts duplicates |
| S-005 | P2 | robots.txt fetched with plain `fetch()` | Every request through the SSRF guard | robots.txt bypassed `safeFetch` (redirects to private hosts were followed) | `connect/robots.ts:63` | Through `safeFetch` with the Studio's allow list, the polite rate and a size cap | connect.test.ts robots, outcomes b-robots |
| S-006 | P2 | Link a page with 5+ data files | Every file offered | Only the first 4 CSV/XLSX/JSON links were read; PDF, KML, GeoJSON, ZIP, ODS, DOCX ignored | `parse.ts` dataLinksIn `.slice(0, 4)` | `discover.ts` fileLinksIn (80 links, 20 read) + new formats | c-portal, c-deep |
| S-007 | P2 | A paginated HTML table | All pages' rows | Only page 1 | no pagination | `discover.ts` paginate() | d-paginated (100 rows) |
| S-008 | P2 | A PDF, KML, ZIP, DOCX, GeoJSON, UTF-16 CSV | Read | PDF refused; UTF-16 read as garbage; others unsupported | `parse.ts` parseFile | `formats.ts` + `parse.ts` parseAll | d-pdf, d-kml, d-utf16, c-zip, c-ckan |
