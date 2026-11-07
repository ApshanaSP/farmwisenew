# Judge journey: Collector console, real browser

Who: a judge with no help, reading the screen. Account: the local test Collector. Server: baseline build, port 3180, instance judge, started WITHOUT --frozen (see step 0). Live clock 7 Nov 2026 about 10:00 IST; data collected 6 Nov 18:10. Browser muted (--mute-audio). Pictures are in evidence/journeys/judge/. Scripts: tests/qa/pass4/journey-judge.walk.mjs and walk2 to walk6.

0. Frozen clock: with --frozen the Collector page never opens (stuck at "Opening your console"). Restarted without it. Finding journey-judge-8. Opening by 127.0.0.1 also fails; I used localhost.
1. Sign in (00-login.png), then Overview (01-home.png). Brief item: synchronized map, KPI, table. Seen: four KPI tiles, ward map with severity colours, severity list with Act buttons, news feed. Good.
2. Periods Daily, Weekly, Monthly, Quarterly (04-overview-*.png). Numbers change (Quarterly: 588 severe, 2,412 ongoing). Met.
3. Briefing tab (03-tab-Briefing.png). Key points, Critical now, Warnings, departments, "Stories still developing" (dedup and clusters, "11 reports, 9 outlets"). Good. But key point 1 disagrees with the Overview (journey-judge-5).
4. Trends tab (03-tab-Trends.png): rising and falling categories, last 4 weeks against the 4 before. Environment tab (03-tab-Environment.png): rain, air, markets. Met.
5. Open one incident (08-open-incident.png): what happened, why it needs you, timeline of 3 reports from 2 sources, who reported, who is responsible, confidence 50% "review", Show on map. Evidence and traceability: met.
6. Severity tile filter (06-click-severe-tile.png) works. A click on a zone name on the map did not respond (07 FAIL); I did not try the map shape itself. The zone, taluk and department selectors at the top were not tried.
7. Menu: Export report, Workspaces, Customize, Data sources, Security.
   - Export report (19-export-report.png): daily, weekly, monthly, quarterly; PDF and CSV action list. Buttons are there; I did not download or read the files.
   - Workspaces (17-workspaces.png): save form with "Collector's Daily Briefing" prefilled, explains versions. "No saved workspaces yet". I did not press Save.
   - Data sources (18-data-sources.png): 12 sources with status, newest data, record count, run history, Refresh, Run now, Pause. AGMARKNET shows Failing with reason "HTTP 400"; CPCB and CFM-DSS show Stale with reason. This answers refresh and error handling honestly. Audit log tab exists; rows not read. Login sessions: Data Studio "Connect with sign-in or schedule" exists (16-datastudio-connect.png), not walked through.
8. The brief's own requests, typed into Ask District IQ (Ctrl K; no AI key, so rules only) (12-ask-1..6.png, 12-ask-full.txt):
   - Briefing request: a department table with open counts, not a briefing.
   - Weekly road accidents, flooding, public infrastructure: good, counts per category with top zone.
   - Taluks with most unresolved: one total, no taluks (journey-judge-3).
   - Quarterly trend and department follow-up: department table only.
   - Every source used: KPI figures (journey-judge-2).
   - Save workspace: counts, nothing saved (journey-judge-1).
   - Newspaper-only incidents: good list of 6 stories "News only, no department record" with outlets and source counts, but wrong categories and a wrong place on some (journey-judge-6).
9. The same newspaper sentence in the top Search / Ask the map panel gives "Missing person" (11-search-query.png): journey-judge-4.
10. Console and network: no browser console error and no HTTP error in any walk (errs*.json are empty). Server log: the embedding model fails to load (journey-judge-7).

Not reached: reading a downloaded PDF or CSV, reopening a saved workspace version, audit log rows, Tamil mode, voice, add-source-by-link to the end, the top zone, taluk and department selectors, Ask District IQ with an AI key.

Requirements R1 to R16, see evidence/requirements.json. Met: R1, R3, R7, R10, R12, R13, R15. Partly: R2, R4, R5, R6, R8, R9, R11, R14, R16. Not met: none.
