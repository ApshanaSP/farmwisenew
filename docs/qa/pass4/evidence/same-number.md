# Same number everywhere (QA pass 4)

One question: does the same scope give the same figure on every screen? Each figure was read over HTTP from a running server, as the role that sees it, and compared with an independent count of the raw rows and with every other screen. Every difference is named row by row below, or it is a finding.

- **Build:** 2026-11-06 18:21:19|76734f481810. **The console's now:** 2026-11-06 18:08:00, the store's as-of, which is later than the frozen clock.
- **Server:** node tests/qa/pass4/server.mjs start --port 3120 --frozen --ticking --env ASSISTANT_TOOLS_API=1. lib/rate-limit.ts resets a bucket when Date.now() passes its end. With a clock that never moves the per-minute limits never reset and the routes answer 429. The clock starts at 12:00 and runs on, the store's as-of (18:08) is later, so the console's now stays 18:08 for the whole run and no window moves.
- **Oracle:** tests/qa/oracle/pinned.mjs, no app code. Its effective layer takes the rows the app's own build hooks remove or change from same-number-hooks.json, written by the real hooks on this build, so that a hook's work can be named by id.
- **Models:** The server has no model key. Jarvis and Ask District IQ answered through their code lanes. collector/brief needs a model and returns no write-up here; the facts it would write from are checked with a fake model at the boundary (same-number-brief.test.ts).
- **Scopes (19):** daily · district; weekly · district; monthly · district; quarterly · district; daily · zone 13; weekly · zone 13; monthly · zone 13; quarterly · zone 13; weekly · zone 5; daily · GCC-SWM; weekly · GCC-SWM; monthly · GCC-SWM; quarterly · GCC-SWM; weekly · GCC-ELE; monthly · CMWSSB; daily · POL-GCP; weekly · zone 13 · GCC-SWM; monthly · zone 13 · GCC-SWM; monthly · zone 9 · CMWSSB.
- **Evidence:** docs/qa/pass4/evidence/same-number.json holds every scope, surface, figure, oracle value and difference. **Test:** tests/qa/pass4/same-number.test.ts and same-number-brief.test.ts.

## Result

20383 readings. 19875 equal the oracle. 508 differ, and each of those is classed below (0 unexplained). 0 missing.

| Surface | Scopes | Readings | Equal | Differ | Missing |
|---|---|---|---|---|---|
| collector/overview | 19 | 3952 | 3952 | 0 | 0 |
| collector/list | 19 | 171 | 171 | 0 | 0 |
| collector/insights?part=briefing | 19 | 1806 | 1777 | 29 | 0 |
| collector/insights?part=trends | 19 | 2459 | 2271 | 188 | 0 |
| assistant/tools | 19 | 5819 | 5715 | 104 | 0 |
| assistant/chat | 19 | 2883 | 2833 | 50 | 0 |
| thunai/round | 19 | 2613 | 2476 | 137 | 0 |
| map/ask | 19 | 147 | 147 | 0 | 0 |
| collector/export | 19 | 95 | 95 | 0 | 0 |
| collector/report | 19 | 38 | 38 | 0 | 0 |
| collector/assistant/export | 8 | 8 | 8 | 0 | 0 |
| map/export | 6 | 12 | 12 | 0 | 0 |
| assistant/briefing | 4 | 20 | 20 | 0 | 0 |
| officer/overview | 9 | 186 | 186 | 0 | 0 |
| officer/grievances | 9 | 36 | 36 | 0 | 0 |
| officer/insights | 9 | 25 | 25 | 0 | 0 |
| assistant/chat(officerA) | 6 | 36 | 36 | 0 | 0 |
| map/ask(officerA) | 6 | 42 | 42 | 0 | 0 |
| assistant/chat(officerB) | 1 | 6 | 6 | 0 | 0 |
| map/ask(officerB) | 1 | 7 | 7 | 0 | 0 |
| assistant/chat(officerC) | 2 | 12 | 12 | 0 | 0 |
| map/ask(officerC) | 2 | 10 | 10 | 0 | 0 |

## The two from last time: 237 against 240, 12 against 13

Last report (docs/qa/evidence/BROWSER.md, build as-of 2026-11-05 05:02, now 06:00:42): ongoing 237 on the console against 240 from the oracle, past deadline 12 against 13. It explained them by the build hooks and named no rows.

**That build is gone.** The cached builds on this machine are as-of 11-04 12:10, 11-04 16:11, 11-04 19:12, 11-06 16:04 and 11-06 18:08; none is 11-05 05:02. So the old figures cannot be read again. What can be done is to replay the same window on the pinned build. The hooks' code has not changed since 27 Oct, so the same rules ran on the old build.

**237 against 240: three rows.** In that same window the hooks take out exactly three open rows, and three is the old difference:

| Incident | Reported | Taken out by | Past deadline flag on this build | Due |
|---|---|---|---|---|
| INC-20261104-0CD3CA | 2026-11-04 17:44:00 | report-kinds@4 | yes | 2026-11-04 23:44:00 |
| INC-20261104-2F77E5 | 2026-11-04 18:33:22 | report-kinds@4 | yes | 2026-11-05 00:33:22 |
| INC-20261104-6A87C3 | 2026-11-04 21:57:06 | news-media-only@1 | no | 2026-11-11 21:57:06 |

All three have no complaints and none is Severe, which fits the two figures that did agree last time (severe 17, complaints 128). The replay (rows reported by the old as-of, open then) gives 237 raw and 234 after the hooks: the same gap of 3. The window's count moved since then because rows closed and late rows arrived.

**12 against 13: one row, and which one cannot be proved.** Only two of the three were past their due time by the old as-of: INC-20261104-0CD3CA and INC-20261104-2F77E5. Every kept build later than the old one flags both, and the old difference was 1, so on the old build one of them still had the flag at 0. No kept build shows which. The store's flag lags the due time (same-number-15): replayed with today's flags the window gives 15 against the old 13, so the flags moved. This is the honest limit: the pair is reconciled to these two ids, not to one.

**Is it a bug?** No: a definition difference. The rows are news-only rows the build takes out everywhere, so no screen disagrees with another. The oracle of last time read the raw table and could not see the hooks. Whether two of the rules go too far is a separate matter (same-number-19).

**Does the same pair still appear?** Yes, in the same form, and now it is named:

| Scope | Figure | Raw | Every screen | Rows in raw only |
|---|---|---|---|---|
| daily | still open | 238 | 236 | INC-20261105-662290 (news-media-only@1); INC-20261106-7D97AB (news-media-only@1) |
| daily | past deadline | 11 | 11 | none |
| weekly | still open | 1188 | 1167 | INC-20261030-56466D (news-media-only@1); INC-20261030-8A77DD (news-media-only@1); INC-20261030-97A2C9 (report-kinds@4); INC-20261030-C822CA (report-kinds@4); INC-20261031-3C8713 (news-media-only@1); INC-20261031-C2D5A7 (news-media-only@1); INC-20261101-3D32BD (news-media-only@1); INC-20261101-8C1D4E (report-kinds@4); INC-20261101-EB01E3 (report-kinds@4); INC-20261102-1AE254 (news-media-only@1); INC-20261102-5F3CCA (news-sanity@6); INC-20261102-EC1B50 (report-kinds@4); INC-20261102-FCDE95 (news-media-only@1); INC-20261104-0CD3CA (report-kinds@4); INC-20261104-2F77E5 (report-kinds@4); INC-20261104-6A87C3 (news-media-only@1); INC-20261105-19921F (report-kinds@4); INC-20261105-5CE479-1 (news-media-only@1); INC-20261105-662290 (news-media-only@1); INC-20261105-C69AD2 (news-media-only@1); INC-20261106-7D97AB (news-media-only@1) |
| weekly | past deadline | 354 | 339 | INC-20261030-56466D (news-media-only@1); INC-20261030-8A77DD (news-media-only@1); INC-20261030-97A2C9 (report-kinds@4); INC-20261030-C822CA (report-kinds@4); INC-20261031-3C8713 (news-media-only@1); INC-20261031-C2D5A7 (news-media-only@1); INC-20261101-3D32BD (news-media-only@1); INC-20261101-8C1D4E (report-kinds@4); INC-20261101-EB01E3 (report-kinds@4); INC-20261102-5F3CCA (news-sanity@6); INC-20261102-EC1B50 (report-kinds@4); INC-20261102-FCDE95 (news-media-only@1); INC-20261104-0CD3CA (report-kinds@4); INC-20261104-2F77E5 (report-kinds@4); INC-20261105-C69AD2 (news-media-only@1) |

## One scope, every surface

The figure each surface gives under one name. A cell with one value means every surface in it agrees. Lists counted one row per group, and rows only in another figure, are in the next sections.

### daily · district

| Name | Value: where |
|---|---|
| reported | **239**: collector/overview reported, collector/list reported, collector/insights?part=briefing reported, assistant/tools reported, assistant/chat reported, thunai/round reported, map/ask has_point, assistant/briefing reported<br>**47**: collector/overview reported, assistant/tools reported<br>**94**: collector/overview reported, assistant/tools reported<br>**89**: collector/overview reported, assistant/tools reported<br>**42**: assistant/tools reported, assistant/chat reported<br>**25**: assistant/tools reported, assistant/chat reported<br>**23**: assistant/tools reported, assistant/chat reported<br>**20**: assistant/tools reported, assistant/chat reported<br>**15**: assistant/tools reported, assistant/chat reported<br>**7**: assistant/tools reported<br>**4**: assistant/tools reported<br>**6**: assistant/tools reported<br>**1**: assistant/tools reported<br>**13**: assistant/tools reported<br>**8**: assistant/tools reported<br>**5**: assistant/tools reported<br>**3**: assistant/tools reported<br>**11**: assistant/chat (same-number-13) reported<br>**236**: assistant/chat (same-number-13) reported<br>**228**: assistant/chat (same-number-9) reported |
| still open | **236**: collector/overview ongoing, collector/list ongoing, collector/insights?part=briefing open, assistant/tools ongoing, assistant/tools open, assistant/chat open, thunai/round open, thunai/round ongoing, map/ask ongoing and 3 more |
| past deadline | **11**: collector/overview overdue, collector/list overdue, collector/insights?part=briefing overdue_flag, assistant/tools overdue_flag, assistant/chat overdue_flag, thunai/round overdue_flag, map/ask overdue_flag, assistant/briefing overdue_flag<br>**0**: thunai/round (same-number-1) overdue, thunai/round (same-number-2) overdue<br>**6**: thunai/round custom |
| severe | **9**: collector/overview severe, collector/overview reported, collector/list severe, collector/insights?part=briefing severe, assistant/tools severe, assistant/tools reported, assistant/chat severe, thunai/round severe, map/ask severe and 1 more<br>**8**: collector/overview severe_open, collector/overview open, collector/overview groups, assistant/tools severe_open, assistant/tools groups, assistant/chat severe_open, thunai/round groups, map/ask severe_open<br>**5**: assistant/tools severe, assistant/chat severe<br>**0**: assistant/tools severe, assistant/chat severe |
| complaints | **147**: collector/overview complaints_open, collector/list complaints_all, collector/list complaints_ongoing, assistant/tools complaints_open, assistant/tools complaints_ongoing, assistant/chat complaints_open, thunai/round complaints_open<br>**143**: collector/overview complaint_inc, assistant/chat complaint_inc |
| serious | **54**: collector/overview urgent, collector/overview serious_open |
| news only | **13**: collector/overview news_only_open, collector/insights?part=briefing news_only, thunai/round news_only, assistant/briefing news_only |
| resolved | **3**: collector/overview resolved, collector/list resolved, assistant/tools resolved |

### weekly · district

| Name | Value: where |
|---|---|
| reported | **1357**: collector/overview reported, collector/list reported, collector/insights?part=briefing reported, assistant/tools reported, assistant/chat reported, thunai/round reported, map/ask has_point, assistant/briefing reported<br>**276**: collector/overview reported, assistant/tools reported<br>**499**: collector/overview reported, assistant/tools reported<br>**517**: collector/overview reported, assistant/tools reported<br>**191**: assistant/tools reported, assistant/chat reported<br>**103**: assistant/tools reported, assistant/chat reported<br>**109**: assistant/tools reported, assistant/chat reported<br>**122**: assistant/tools reported, assistant/chat reported<br>**79**: assistant/tools reported<br>**90**: assistant/tools reported<br>**19**: assistant/tools reported<br>**33**: assistant/tools reported<br>**14**: assistant/tools reported<br>**27**: assistant/tools reported<br>**25**: assistant/tools reported<br>**22**: assistant/tools reported<br>**17**: assistant/tools reported<br>**16**: assistant/tools reported<br>**15**: assistant/tools reported<br>**13**: assistant/tools reported<br>**12**: assistant/tools reported<br>**339**: assistant/chat (same-number-13) reported<br>**1167**: assistant/chat (same-number-13) reported<br>**1253**: assistant/chat (same-number-9) reported |
| still open | **1167**: collector/overview ongoing, collector/list ongoing, collector/insights?part=briefing open, assistant/tools ongoing, assistant/tools open, assistant/chat open, thunai/round open, thunai/round ongoing, map/ask ongoing and 3 more |
| past deadline | **339**: collector/overview overdue, collector/list overdue, collector/insights?part=briefing overdue_flag, assistant/tools overdue_flag, assistant/chat overdue_flag, thunai/round overdue_flag, map/ask overdue_flag, assistant/briefing overdue_flag<br>**0**: thunai/round (same-number-1) overdue, thunai/round (same-number-2) overdue<br>**12**: thunai/round (same-number-2) custom |
| severe | **65**: collector/overview severe, collector/overview reported, collector/list severe, collector/insights?part=briefing severe, assistant/tools severe, assistant/tools reported, assistant/chat severe, thunai/round severe, map/ask severe and 1 more<br>**54**: collector/overview severe_open, collector/overview open, assistant/tools severe_open, assistant/chat severe_open, map/ask severe_open<br>**52**: collector/overview groups, assistant/tools groups, thunai/round groups<br>**33**: assistant/tools severe, assistant/chat severe<br>**0**: assistant/tools severe, assistant/chat severe<br>**3**: assistant/tools severe, assistant/chat severe<br>**1**: assistant/tools severe |
| complaints | **692**: collector/overview complaints_open, collector/list complaints_ongoing, assistant/tools complaints_open, assistant/tools complaints_ongoing, assistant/chat complaints_open, thunai/round complaints_open<br>**610**: collector/overview complaint_inc, assistant/chat complaint_inc<br>**787**: collector/list complaints_all |
| serious | **307**: collector/overview urgent, collector/overview serious_open |
| news only | **77**: collector/overview news_only_open, collector/insights?part=briefing news_only, thunai/round news_only, assistant/briefing news_only |
| resolved | **182**: collector/overview resolved, collector/list resolved, assistant/tools resolved |

### weekly · zone 13

| Name | Value: where |
|---|---|
| reported | **112**: collector/overview reported, collector/list reported, collector/insights?part=briefing reported, assistant/tools reported, assistant/chat reported, thunai/round reported, map/ask has_point<br>**24**: collector/overview reported, assistant/tools reported<br>**49**: collector/overview reported, assistant/tools reported<br>**35**: collector/overview reported, assistant/tools reported<br>**21**: assistant/tools reported, assistant/chat reported<br>**13**: assistant/tools reported, assistant/chat reported<br>**7**: assistant/tools reported, assistant/chat reported<br>**11**: assistant/tools reported, assistant/chat reported<br>**5**: assistant/tools reported<br>**6**: assistant/tools reported<br>**1**: assistant/tools reported<br>**15**: assistant/tools reported<br>**10**: assistant/tools reported<br>**9**: assistant/tools reported<br>**26**: assistant/chat (same-number-13) reported<br>**91**: assistant/chat (same-number-13) reported<br>**105**: assistant/chat (same-number-9) reported |
| still open | **91**: collector/overview ongoing, collector/overview open, collector/list ongoing, collector/insights?part=briefing open, assistant/tools ongoing, assistant/tools open, assistant/chat open, thunai/round open, thunai/round ongoing and 3 more |
| past deadline | **26**: collector/overview overdue, collector/list overdue, collector/insights?part=briefing overdue_flag, assistant/tools overdue_flag, assistant/chat overdue_flag, thunai/round overdue_flag, map/ask overdue_flag<br>**0**: thunai/round (same-number-1) overdue, thunai/round (same-number-2) overdue<br>**2**: thunai/round custom |
| severe | **4**: collector/overview severe, collector/overview reported, collector/list severe, collector/insights?part=briefing severe, assistant/tools severe, assistant/tools reported, assistant/chat severe, thunai/round severe, map/ask severe<br>**3**: collector/overview severe_open, collector/overview open, collector/overview groups, assistant/tools severe_open, assistant/tools groups, assistant/chat severe_open, thunai/round groups, map/ask severe_open<br>**2**: assistant/tools severe, assistant/chat severe<br>**0**: assistant/tools severe, assistant/chat severe<br>**1**: assistant/tools severe |
| complaints | **49**: collector/overview complaints_open, collector/list complaints_ongoing, assistant/tools complaints_open, assistant/tools complaints_ongoing, assistant/chat complaints_open, thunai/round complaints_open<br>**46**: collector/overview complaint_inc, assistant/chat complaint_inc<br>**57**: collector/list complaints_all |
| serious | **20**: collector/overview urgent, collector/overview serious_open |
| news only | **0**: collector/overview news_only_open, collector/insights?part=briefing news_only, thunai/round news_only |
| resolved | **21**: collector/overview resolved, collector/list resolved, assistant/tools resolved |

### weekly · GCC-SWM

| Name | Value: where |
|---|---|
| reported | **109**: collector/overview reported, collector/list reported, collector/insights?part=briefing reported, assistant/tools reported, assistant/chat reported, thunai/round reported, map/ask has_point, officer/overview reported, officer/insights reported and 2 more<br>**67**: collector/overview reported, assistant/tools reported, assistant/chat (same-number-13) reported<br>**2**: collector/overview reported, assistant/tools reported<br>**40**: collector/overview reported, assistant/tools reported<br>**4**: assistant/tools reported<br>**3**: assistant/tools reported<br>**1**: assistant/tools reported<br>**29**: assistant/chat (same-number-13) reported<br>**101**: assistant/chat (same-number-9) reported |
| still open | **67**: collector/overview ongoing, collector/overview open, collector/list ongoing, collector/insights?part=briefing open, assistant/tools ongoing, assistant/tools open, assistant/chat open, thunai/round open, thunai/round ongoing and 9 more<br>**1167**: thunai/round (same-number-3) open<br>**66**: officer/overview custom |
| past deadline | **29**: collector/overview overdue, collector/list overdue, collector/insights?part=briefing overdue_flag, assistant/tools overdue_flag, assistant/chat overdue_flag, thunai/round overdue_flag, map/ask overdue_flag, officer/overview custom, officer/overview overdue and 3 more<br>**0**: thunai/round (same-number-1) overdue, thunai/round (same-number-2) overdue |
| severe | **0**: collector/overview severe, collector/overview severe_open, collector/overview reported, collector/overview open, collector/overview groups, collector/list severe, collector/insights?part=briefing severe, assistant/tools severe, assistant/tools severe_open and 11 more |
| complaints | **67**: collector/overview complaints_open, collector/list complaints_ongoing, assistant/tools complaints_open, assistant/tools complaints_ongoing, assistant/chat complaints_open, thunai/round complaints_open, officer/overview complaints_open<br>**65**: collector/overview complaint_inc, assistant/chat complaint_inc<br>**113**: collector/list complaints_all |
| serious | **2**: collector/overview urgent, collector/overview serious_open, thunai/round serious_open, officer/overview custom, officer/overview serious_open, officer/grievances custom |
| news only | **2**: collector/overview news_only_open, collector/insights?part=briefing news_only |
| resolved | **40**: collector/overview resolved, collector/list resolved, assistant/tools resolved, officer/overview resolved |

### weekly · zone 13 · GCC-SWM

| Name | Value: where |
|---|---|
| reported | **10**: collector/overview reported, collector/list reported, collector/insights?part=briefing reported, assistant/tools reported, assistant/chat reported, thunai/round reported, map/ask has_point, officer/overview reported, officer/insights reported and 2 more<br>**6**: collector/overview reported, assistant/tools reported, assistant/chat (same-number-13) reported<br>**0**: collector/overview reported, assistant/tools reported<br>**4**: collector/overview reported, assistant/tools reported<br>**1**: assistant/tools reported<br>**5**: assistant/chat (same-number-13) reported<br>**7**: assistant/chat (same-number-9) reported |
| still open | **6**: collector/overview ongoing, collector/overview open, collector/list ongoing, collector/insights?part=briefing open, assistant/tools ongoing, assistant/tools open, assistant/chat open, thunai/round open, thunai/round ongoing and 9 more<br>**0**: assistant/tools (same-number-4) open<br>**91**: thunai/round (same-number-3) open |
| past deadline | **5**: collector/overview overdue, collector/list overdue, collector/insights?part=briefing overdue_flag, assistant/tools overdue_flag, assistant/chat overdue_flag, thunai/round overdue_flag, thunai/round overdue, map/ask overdue_flag, officer/overview custom and 4 more<br>**2**: thunai/round (same-number-2) overdue |
| severe | **0**: collector/overview severe, collector/overview severe_open, collector/overview reported, collector/overview open, collector/overview groups, collector/list severe, collector/insights?part=briefing severe, assistant/tools severe, assistant/tools severe_open and 11 more |
| complaints | **6**: collector/overview complaints_open, collector/overview complaint_inc, collector/list complaints_ongoing, assistant/tools complaints_open, assistant/tools complaints_ongoing, assistant/chat complaints_open, assistant/chat complaint_inc, thunai/round complaints_open, officer/overview complaints_open<br>**10**: collector/list complaints_all<br>**0**: assistant/tools (same-number-4) complaints_open |
| serious | **0**: collector/overview urgent, collector/overview serious_open, thunai/round serious_open, officer/overview custom, officer/overview serious_open, officer/grievances custom |
| news only | **0**: collector/overview news_only_open, collector/insights?part=briefing news_only |
| resolved | **4**: collector/overview resolved, collector/list resolved, assistant/tools resolved, officer/overview resolved |

## Every difference, by what it is

| What | Class | Readings | Example |
|---|---|---|---|
| definition | definition | 254 | daily · district / collector/insights?part=trends / trends.weekly.SOLID_WASTE.total against its own bars: app 1756, oracle 1669 |
| same-number-1 | bug | 57 | daily · district / thunai/round:dashboard / CaseList.first row's severity rank ('most serious first', 0 = Severe): app 3, oracle 0 |
| same-number-11 | bug | 38 | daily · district / thunai/round:performance(zone) / kpi.n: app 232, oracle 239 |
| same-number-10 | bug | 34 | daily · district / collector/insights?part=trends / trends.weekly.bar[2026-08-10] against the whole week: app 315, oracle 1083 |
| same-number-13 | bug | 34 | daily · district / assistant/chat:card label / tile 'Reported' on the past-deadline card: app 11, oracle 239 |
| same-number-2 | bug | 22 | daily · district / thunai/round:cases(open) / kpi.late: app 0, oracle 11 |
| same-number-3 | bug | 20 | daily · GCC-SWM / thunai/round:performance / kpi.open: app 236, oracle 18 |
| same-number-8 | bug | 16 | daily · district / collector/insights?part=briefing / gaps.rows on the page: app 10, oracle 13 |
| same-number-9 | bug | 16 | daily · district / assistant/chat:list / tile 'Incidents matching', no filter: app 228, oracle 239 |
| same-number-6 | bug | 13 | daily · district / collector/insights?part=briefing / stats.handledByDepts ('routine', nothing to do) against the PDF's routine: app 230, oracle 189 |
| same-number-4 | bug | 4 | weekly · zone 13 · GCC-SWM / assistant/tools:zone_profile / zone.13.active: app 0, oracle 6 |

## Raw snapshot against every screen, row by row

The app's build hooks (lib/collector/derive.ts) change this build before any screen reads it: 174 incidents taken out (news-media-only@1: 144, report-kinds@4: 29, news-sanity@6: 1), 119 given a zone from their reports. Every screen reads the changed build, so these differ only from the raw table. The rows of each figure are below for the district; every scope is in same-number.json.

| Scope | Figure | Raw | Screens | Rows in raw only | Rows on screen only |
|---|---|---|---|---|---|
| daily · district | reported | 241 | 239 | 2: INC-20261105-662290, INC-20261106-7D97AB | none |
| daily · district | open | 238 | 236 | 2: INC-20261105-662290, INC-20261106-7D97AB | none |
| daily · district | news_only | 15 | 13 | 2: INC-20261105-662290, INC-20261106-7D97AB | none |
| daily · district | news_only_open | 15 | 13 | 2: INC-20261105-662290, INC-20261106-7D97AB | none |
| daily · district | complaints_all | 147 | 147 | 2: INC-20261105-662290, INC-20261106-7D97AB | none |
| daily · district | complaints_open | 147 | 147 | 2: INC-20261105-662290, INC-20261106-7D97AB | none |
| weekly · district | reported | 1378 | 1357 | 21: INC-20261030-56466D, INC-20261030-8A77DD, INC-20261030-97A2C9, INC-20261030-C822CA, INC-20261031-3C8713, INC-20261031-C2D5A7 and 15 more (all in same-number.json) | none |
| weekly · district | open | 1188 | 1167 | 21: INC-20261030-56466D, INC-20261030-8A77DD, INC-20261030-97A2C9, INC-20261030-C822CA, INC-20261031-3C8713, INC-20261031-C2D5A7 and 15 more (all in same-number.json) | none |
| weekly · district | overdue_flag | 354 | 339 | 15: INC-20261030-56466D, INC-20261030-8A77DD, INC-20261030-97A2C9, INC-20261030-C822CA, INC-20261031-3C8713, INC-20261031-C2D5A7 and 9 more (all in same-number.json) | none |
| weekly · district | news_only | 98 | 77 | 21: INC-20261030-56466D, INC-20261030-8A77DD, INC-20261030-97A2C9, INC-20261030-C822CA, INC-20261031-3C8713, INC-20261031-C2D5A7 and 15 more (all in same-number.json) | none |
| weekly · district | news_only_open | 98 | 77 | 21: INC-20261030-56466D, INC-20261030-8A77DD, INC-20261030-97A2C9, INC-20261030-C822CA, INC-20261031-3C8713, INC-20261031-C2D5A7 and 15 more (all in same-number.json) | none |
| weekly · district | complaints_all | 787 | 787 | 21: INC-20261030-56466D, INC-20261030-8A77DD, INC-20261030-97A2C9, INC-20261030-C822CA, INC-20261031-3C8713, INC-20261031-C2D5A7 and 15 more (all in same-number.json) | none |
| weekly · district | complaints_open | 692 | 692 | 21: INC-20261030-56466D, INC-20261030-8A77DD, INC-20261030-97A2C9, INC-20261030-C822CA, INC-20261031-3C8713, INC-20261031-C2D5A7 and 15 more (all in same-number.json) | none |
| monthly · district | reported | 5685 | 5574 | 111: INC-20261008-09DE5F, INC-20261008-2F1866-1, INC-20261008-6F1ADC, INC-20261008-AB68B6, INC-20261009-2AB1FB, INC-20261009-749A06 and 105 more (all in same-number.json) | none |
| monthly · district | open | 2096 | 2074 | 22: INC-20261030-56466D, INC-20261030-8A77DD, INC-20261030-97A2C9, INC-20261030-C822CA, INC-20261030-D938A4, INC-20261031-3C8713 and 16 more (all in same-number.json) | none |
| monthly · district | overdue_flag | 758 | 742 | 16: INC-20261030-56466D, INC-20261030-8A77DD, INC-20261030-97A2C9, INC-20261030-C822CA, INC-20261030-D938A4, INC-20261031-3C8713 and 10 more (all in same-number.json) | none |
| monthly · district | news_only | 432 | 321 | 111: INC-20261008-09DE5F, INC-20261008-2F1866-1, INC-20261008-6F1ADC, INC-20261008-AB68B6, INC-20261009-2AB1FB, INC-20261009-749A06 and 105 more (all in same-number.json) | none |
| monthly · district | news_only_open | 100 | 78 | 22: INC-20261030-56466D, INC-20261030-8A77DD, INC-20261030-97A2C9, INC-20261030-C822CA, INC-20261030-D938A4, INC-20261031-3C8713 and 16 more (all in same-number.json) | none |
| monthly · district | complaints_all | 3255 | 3255 | 111: INC-20261008-09DE5F, INC-20261008-2F1866-1, INC-20261008-6F1ADC, INC-20261008-AB68B6, INC-20261009-2AB1FB, INC-20261009-749A06 and 105 more (all in same-number.json) | none |
| monthly · district | complaints_open | 1174 | 1174 | 22: INC-20261030-56466D, INC-20261030-8A77DD, INC-20261030-97A2C9, INC-20261030-C822CA, INC-20261030-D938A4, INC-20261031-3C8713 and 16 more (all in same-number.json) | none |
| quarterly · district | reported | 15289 | 15115 | 174: INC-20260814-FB9A56, INC-20260821-06C502, INC-20260823-2D47F4, INC-20260825-64D661, INC-20260825-B9AE1C, INC-20260828-264F7D and 168 more (all in same-number.json) | none |
| quarterly · district | open | 2433 | 2411 | 22: INC-20261030-56466D, INC-20261030-8A77DD, INC-20261030-97A2C9, INC-20261030-C822CA, INC-20261030-D938A4, INC-20261031-3C8713 and 16 more (all in same-number.json) | none |
| quarterly · district | overdue_flag | 904 | 888 | 16: INC-20261030-56466D, INC-20261030-8A77DD, INC-20261030-97A2C9, INC-20261030-C822CA, INC-20261030-D938A4, INC-20261031-3C8713 and 10 more (all in same-number.json) | none |
| quarterly · district | news_only | 747 | 573 | 174: INC-20260814-FB9A56, INC-20260821-06C502, INC-20260823-2D47F4, INC-20260825-64D661, INC-20260825-B9AE1C, INC-20260828-264F7D and 168 more (all in same-number.json) | none |
| quarterly · district | news_only_open | 100 | 78 | 22: INC-20261030-56466D, INC-20261030-8A77DD, INC-20261030-97A2C9, INC-20261030-C822CA, INC-20261030-D938A4, INC-20261031-3C8713 and 16 more (all in same-number.json) | none |
| quarterly · district | complaints_all | 9113 | 9113 | 174: INC-20260814-FB9A56, INC-20260821-06C502, INC-20260823-2D47F4, INC-20260825-64D661, INC-20260825-B9AE1C, INC-20260828-264F7D and 168 more (all in same-number.json) | none |
| quarterly · district | complaints_open | 1238 | 1238 | 22: INC-20261030-56466D, INC-20261030-8A77DD, INC-20261030-97A2C9, INC-20261030-C822CA, INC-20261030-D938A4, INC-20261031-3C8713 and 16 more (all in same-number.json) | none |

## Same name, different count: the rows

Two figures on screen with close names. Each pair below is named by id, for the weekly district. Every scope is in same-number.json.

| First figure | Second figure | Only in the first | Only in the second | Why |
|---|---|---|---|---|
| severe 65 | severe_open 54 | 11: INC-20261030-2795BA, INC-20261030-6A2B89, INC-20261031-66F22A, INC-20261031-CAD4A3, INC-20261101-21274C, INC-20261101-738431, INC-20261102-FC4A9C, INC-20261103-FB02F4, INC-20261104-1268EE, INC-20261104-C0ACD0-1, INC-20261105-8CA458 | 0: none | Severe tile (open or closed) against severe still open: the closed ones |
| overdue_flag 339 | overdue_due 505 | 0: none | 166: INC-20261030-0F04A5, INC-20261030-169AD6, INC-20261030-2807E6, INC-20261030-4C188F, INC-20261030-8A1D4A, INC-20261030-9512AE, INC-20261030-C00F61, INC-20261030-C2ACC2, INC-20261030-F81DD3, INC-20261030-F83D50, INC-20261030-FDEF36, INC-20261030-FE7681 and 18 more (all in same-number.json) | The store's past-deadline flag against due time passed: open rows whose deadline has gone by but the flag is 0 |
| complaints_all 787 | complaints_open 692 | 190: INC-20260601-8D191C, INC-20260605-53FD9F, INC-20260716-856110, INC-20260926-7073F5, INC-20261009-38EFBC, INC-20261025-2351B8-1, INC-20261026-1C2262, INC-20261026-3284F5, INC-20261030-16F0E6, INC-20261030-1F2378, INC-20261030-2795BA, INC-20261030-289E18 and 18 more (all in same-number.json) | 0: none | Complaints added up over everything against open only: complaints on closed incidents |
| severe_open 54 | severe groups (severity panel, Jarvis 'severe cases') 52 | 2: INC-20261022-D1B3AB, INC-20261105-6B3555 | 0: none | The panel shows one row per group of the same problem in the same area; these severe open incidents sit inside a group whose row is another severe incident |

**Needs you, or routine (same-number-6, same-number-7), weekly district:** still open 1167. The Briefing shows 6 and calls 1161 routine, nothing to do. The PDF says 293 need attention and 874 are routine. The CSV has 293 rows. By the app's own rule over every open incident, 328 need attention. Called routine on the Briefing but on the action list: 287 rows, INC-20261022-73B9C3, INC-20261104-22A6D5, INC-20261025-09E045, INC-20261031-648BD2, INC-20261101-EC06C4, INC-20261105-5CE479, INC-20261105-E00D42, INC-20260529-9C273D, INC-20261105-6D03C9, INC-20261102-3B27A7, INC-20261103-53934E, INC-20261104-3F4AC4-1 and 275 more (all in same-number.json). Past the top 400 the list reads: INC-20261102-E4F7BB, INC-20261103-2274BF, INC-20261103-9882A5, INC-20261104-59B5D6, INC-20261104-CF4AC1, INC-20261105-3EA191, INC-20261106-0D8647, INC-20261106-16E828, INC-20261031-A89DE8, INC-20261101-8C909D, INC-20261101-F0440B, INC-20261105-54DF3F and 23 more (all in same-number.json).

**Only in the news (same-number-8):** weekly, the figure says 77, the written line says 60, the list holds 56. Not on the list: INC-20261031-F91BB9, INC-20261101-B2527C-1, INC-20261102-95A28A, INC-20261103-587B10, INC-20261103-5B6382, INC-20261103-7BCBDC, INC-20261104-4D20F4, INC-20261104-51E4B0, INC-20261104-915520, INC-20261104-A0D675, INC-20261104-B230BB, INC-20261104-B2C18F, INC-20261105-1B735B, INC-20261105-32EE0C, INC-20261105-AB1018, INC-20261105-C7821E, INC-20261105-CDA398, INC-20261105-E4D78A, INC-20261105-FF9686, INC-20261106-0D8647, INC-20261106-6C670B. Monthly: the figure says 321, of which 243 are lapsed and left out of the list; 78 are not; the written line says 60, the list holds 56.

**Severe, weekly district:** the tile says 65 (open or closed), under it 54 open, and the panel and Jarvis say 52. The 11 closed: INC-20261030-2795BA, INC-20261030-6A2B89, INC-20261031-66F22A, INC-20261031-CAD4A3, INC-20261101-21274C, INC-20261101-738431, INC-20261102-FC4A9C, INC-20261103-FB02F4, INC-20261104-1268EE, INC-20261104-C0ACD0-1, INC-20261105-8CA458. The open ones inside another row's group: INC-20261022-D1B3AB (in the row of INC-20260515-B939EB); INC-20261105-6B3555 (in the row of INC-20261105-0E6577). Jarvis's page: 12 rows of 52; it says 12 past deadline, the whole list has 37; the ones not on the page: INC-20261105-0E6577, INC-20261011-3B6A63, INC-20261021-7F7CDE-1, INC-20261024-3284F5, INC-20261101-811851, INC-20261104-376603, INC-20261104-3B5138-2, INC-20261104-3D9A09, INC-20261104-3F4AC4-1, INC-20261104-54D0A3, INC-20261104-5B3F36, INC-20261104-8B0DE7, INC-20261104-DD857A, INC-20261104-F5D2D8, INC-20261104-FA9F68, INC-20261105-162636, INC-20261105-3FF6DA, INC-20261105-5C94BB, INC-20261105-61CDCB, INC-20261105-697F9E, INC-20261105-A9E19D, INC-20261105-AC4742, INC-20261105-BFD2E3, INC-20261105-E35462, INC-20261105-E9CD2E.

**The first of the 12 complete weeks (same-number-10):** the bar for the week of 2026-08-10 says 315. That whole week has 1083 incidents. The 768 missing are those before the rolling window's start, 2026-08-14 18:08:00; the first of them: INC-20260609-05F7E1 2026-08-13 15:54:16, INC-20260718-3733C7-1 2026-08-10 23:47:01, INC-20260809-0855D4 2026-08-10 21:48:09, INC-20260809-538E9F 2026-08-10 11:53:50, INC-20260809-73DC52 2026-08-10 17:24:00, INC-20260809-8AAAF5-2 2026-08-10 07:32:11, INC-20260810-027D21 2026-08-10 11:54:00, INC-20260810-050433 2026-08-10 08:23:00 and 7 more (all in same-number.json).

**A line's total against its bars (a definition, not shown on the Trends page):** SOLID_WASTE says 1756, its bars add up to 1669. The total is the rolling 84 days; the bars are calendar weeks. In the total only: 87 rows after the last bar, first INC-20260926-CA8783, INC-20260926-EB3B79, INC-20261013-2F511C, INC-20261029-2F511C, INC-20261102-0A22A5, INC-20261102-132638, INC-20261102-21E60D, INC-20261102-22A3E6 and 7 more (all in same-number.json). On the monthly lines the same is true of rows from before the first month shown. Ask District IQ's fact 'last 12 weeks' carries the total, so a written answer can differ from its chart by these rows.

**Rows with no zone (same-number-11), weekly district:** 51 rows, 51 open, by department {"DIST-DM":33,"CMWSSB":1,"POL-GCP":11,"GCC-SWD":2,"GCC-ENG":1,"GCC-HLT":2,"GCC-SWM":1}. First of them: INC-20261029-574983, INC-20261029-76C282, INC-20261031-11F020, INC-20261031-345A17, INC-20261031-4F2F8B, INC-20261031-52D1F1, INC-20261031-8A9C74, INC-20261031-F91BB9, INC-20261101-0C6EE8, INC-20261101-0DF912 and 10 more (all in same-number.json). The console's zone table shows them as a separate line; Jarvis's zone performance drops them from 'Reported' and 'Open'.

**The AI brief's window (same-number-12):** the brief's facts end at the top of the hour, the tile at the console's now. Weekly: tile 1357, brief 1356. In the tile only: INC-20261106-6EAFF2 2026-11-06 18:05:00, INC-20261106-896A64 2026-11-06 18:08:00, INC-20261106-AD9834 2026-11-06 18:03:00. In the brief only: INC-20261030-525A8F 2026-10-30 18:04:00, INC-20261030-BD67A7 2026-10-30 18:04:00.

**The past-deadline flag against the due time (same-number-15, OPEN-7):** weekly, the flag says 339 and 505 have a due time that has passed, 166 with no flag. Not one flagged row is still inside its due time. Sample: INC-20261030-0F04A5 due 2026-10-31 02:43:56, INC-20261030-169AD6 due 2026-10-31 00:27:07, INC-20261030-2807E6 due 2026-10-31 19:02:53, INC-20261030-4C188F due 2026-10-31 05:46:18, INC-20261030-8A1D4A due 2026-10-31 01:37:46, INC-20261030-9512AE due 2026-10-31 05:28:08, INC-20261030-C00F61 due 2026-10-30 23:30:11, INC-20261030-C2ACC2 due 2026-10-31 04:29:44 and 7 more (all in same-number.json).

**Rows dated after the console's now (same-number-16, OPEN-11):** INC-20261103-A41A60, INC-20261103-A46CB2, INC-20261105-3B6CB7, INC-20261105-46BBF4, INC-20261105-7574E3, all 2026-11-06 19:11:33. No window counts them. The backlog has no date filter, so DIST-DM reads 43 there against 38 up to now.

**Durable rows pointing at no incident (same-number-17):** decisions on INC-20261002-96FD26 (verify), INC-20260926-42DCD3 (escalate), INC-20260925-2B958A (reopen), INC-20260927-B15416 (verify), INC-20260919-566998 (verify), INC-20260924-3CD4E7 (verify); officer steps on INC-20260930-9743FA (send), INC-20260916-6429F2 (approve), INC-20260920-CCC74E (send), INC-20261002-96FD26 (approve), INC-20261002-96FD26 (send). These incidents are not in this build and their screens answer 404, so these decisions lay on nothing.

## Decisions and routings on top

Not run yet when this page was first written; same-number.test.ts runs it (its second describe). See the next section.

## Since this was recorded: rules the app changed, and how the harness and the oracle follow them (fix-all round 3, 14 Nov 2026)

The pass 7 gate (combined branch 43c1698a) ran same-number.test.ts for the first time since pass 4. Every difference it found was traced in one
run on a fresh build (port 3110, the same --frozen --ticking server), and each one was one of two kinds: (a) screens that disagree with each other,
an app bug, or (b) screens that agree with each other while the harness or the oracle still used a rule the app no longer has. All of them were (b).
None of the expectations was set to what the app printed: each harness or oracle change below follows a rule the app documents in its code.

1. **"today" in Jarvis and Ask District IQ is the calendar day since midnight IST** (pass 7, P6-022, `src/lib/period/read.ts`: "one phrase, one
   meaning"). The harness asked "how many incidents today" for the console's Daily window (the last 24 hours). In the same run every other surface
   said 239 reported, 236 still open, 22 past deadline, 9 severe and 147 open complaints for the last 24 hours, and Ask District IQ and Jarvis
   both said 144 reported, 3 severe, 144 still open and 10 past deadline for "today", which are exactly the oracle's rows reported since
   00:00 on 6 Nov. So the screens agree; the question named another window. The harness now names the console's Daily in the rules lanes' own
   words, "in the last 24 hours" (`SAID` in same-number.mjs), and reads "today" on its own (`readToday`: Ask's count card and Jarvis's
   "cases past deadline today", against the oracle's rows since midnight), so the phrase keeps its meaning under test. This also brings back the
   card's "period before" (`count.Reported.prev`), which the calendar day does not print. Two things seen on the way, not changed here: "give me
   the briefing today" is the last-24-hours brief in both lanes, and says so; and Ask the Map still reads "today" as the last 24 hours, so the
   harness keeps "today" in its own map questions.
2. **A department's "Awaiting your verification" and the Briefing's "N to check" are that department's My Tasks** (pass 7 review 2 of
   console-sync-07, 4dacf4e4, `intel.ts awaitingByDept`), one per group, never the pipeline's awaiting flag on any severity. On the pinned snapshot
   My Tasks is empty in the core scopes (the oracle's own `awaitingCheck` gives 0), and the app said 0 for every department, against
   `awaiting_flag`'s 1 to 15. The harness now reads both figures against `awaitingCheck` by department (`toCheck`).
3. **The officer's stages** (`src/lib/officer/data.ts STAGE_SQL`): the pipeline's "Awaiting verification" is Sent to Collector only for a
   severe case, any other is In action (officer-day-29); and the latest step and decision are the ones with the highest step_id and decision_id
   (officer-day-15, -24). Solid Waste this week: the app said 36 in action and 0 sent, the old oracle 21 and 15; the 15 are non-severe cases the
   pipeline marks Awaiting verification. `pinned.mjs stageOf` now follows the app's rule, as it says it does.
4. **Open is the glossary's open everywhere** (console-sync-10, reviewerE-02, reviewerG-01: `OPEN_NOW`, not routed to a department). On the pinned
   snapshot no routed incident is open in any window (7 are routed: 4 closed, 3 not in this build), so the first describe does not move.
   The second describe runs the routing job (11 news complaints handed to departments) and 5 decisions. There every surface of the Collector's
   console, the Briefing and Ask District IQ's tools agreed with each other on the routed-out figure (weekly district: 1,153 still open on the
   Ongoing tile, the Briefing, its headline and the briefing tool), while the oracle's `open`, `severe_open`, `serious_open`, `overdue_flag`,
   `news_only_open`, `complaints_open`, `complaint_inc` and `verified_open` still counted routed complaints (1,164): 91 readings, all by the routed
   ones. `pinned.mjs DEFS` now gives each of these the glossary's rule (`openNow`: open and not routed), and the district snapshot's "departments
   with open work" in the harness does the same.

   **One difference is left, and it is the owner's to decide (fixall3-officer-open, class `decision` in `KNOWN`):** the officer's own Work record
   (`src/lib/officer/insights.ts`, the effective open flag with no routing rule) and the officer's queue count a news complaint routed to the
   department as open: it is the department's work. The officer's Board (the Collector's overview of the department, which "the Collector's and
   the officer's boards give the same figures" holds to) and the officer's Ask District IQ use OPEN_NOW since round 2. With 2 complaints routed to
   Solid Waste this week the officer sees 66 still open in the Work record and the queue, and 64 on the Board. Before round 2 all of them said 66.
   On the pinned snapshot nothing is routed open, so "the officer's own counts add up to the board's open figure" still passes, but it would not
   on data where the routing job has run. Which open the officer console shows (the console's, or the department's queue) is a product choice.

## Findings

| Id | Severity | Title | Class |
|---|---|---|---|
| same-number-1 | P0 | Jarvis says there are no past-deadline cases while the tile says 339, and shows the least serious cases as 'most serious first' | wrong sort direction; a count taken from one page |
| same-number-2 | P0 | 'Past their deadline' and 'Held by' beside a list's total count only the 12 rows on screen | a count taken from one page |
| same-number-3 | P0 | Jarvis's department performance for one department shows the whole district's open figure | a filter applied to one tile and not the next |
| same-number-4 | P0 | zone_profile with a department chosen says the zone has 0 open incidents and 0 open complaints | missing value read as 0 |
| same-number-5 | P1 | A dashboard for one zone says 'Most in' another zone | a figure from a wider scope said as if it were this scope's |
| same-number-6 | P0 | The Briefing calls 1,161 open incidents routine, 'nothing to do', while the PDF and CSV of the same scope say 293 need the Collector | a count taken from a shortened list |
| same-number-7 | P0 | 'Need your attention' counts only those among the top 400 open incidents read, so the PDF and CSV undercount and 'routine' is too high | a count taken from a capped query |
| same-number-8 | P0 | Three numbers on one Briefing for 'only in the news': 77, 60 and 56 (monthly 321, 60 and 56) | a count taken from a capped query |
| same-number-9 | P0 | 'Incidents matching' and 'All cases' count groups, so they do not match the tile | a count of groups called a count of incidents |
| same-number-10 | P0 | The first of the '12 complete weeks' holds only the end of its week: 315 against 1,083 | time window |
| same-number-11 | P0 | Zone performance's 'Reported, this week' says 1,306 beside a trend of 1,357, and it drops any zone filter | a sum of parts that leaves a part out |
| same-number-12 | P2 | The AI brief's facts end at the top of the hour, the tile at the console's now, so one page can show two figures | time window |
| same-number-13 | P1 | A card's tile says 'Reported' over a count of something else | a label that does not fit the figure |
| same-number-14 | P1 | 'This quarter' in a brief on a body or zone gives today's brief | a word dropped from the scope |
| same-number-15 | P2 | The store's past-deadline flag misses open incidents whose due time has passed: 339 against 505 this week (OPEN-7) | pipeline data |
| same-number-16 | P3 | The backlog counts rows dated after the console's now (OPEN-11) | pipeline data |
| same-number-17 | P2 | Collector decisions and officer steps point at incidents that are not in this build | pipeline data |
| same-number-18 | P2 | A workspace saved on a copy that does not save to AWS cannot be opened: 404 | a limit that does not fit the data |
| same-number-19 | P2 | The hook that leaves out 'sites that are not news media' takes out 144 incidents, most from real news sites, with 6 deaths | owner's decision |
| same-number-20 | P1 | With no model, 'past deadline by department' says no incidents match, and 'complaints by department' answers about open incidents | a confident answer about another measure |
| same-number-21 | P3 | Spoken lines read '1357 incidents reports this week' and '112 incidents of incidents this week' | wording |
| same-number-22 | P2 | The tile 'Resolved this week' says 182 where 1,166 were resolved this week | a label that does not fit the figure |
| same-number-23 | P2 | Jarvis says '52 severe cases this week' where the tile says 65 and the line under it 54 | a definition not said |

## What could not be run, and limits

- The old build behind 237 against 240 is not kept, so that pair is reconciled on a replay (above), and 12 against 13 only to two ids.
- No model ran. collector/brief returned no write-up: its facts were checked with a fake model at the boundary. Figures a model would write in its own words were not read. Two sentences asked of Jarvis fell through to the planner and got no answer: 'street lighting and electrical report this week' and 'how is street lighting and electrical doing this week'. A model might read words differently from the code lanes, so findings marked as code-lane ones (same-number-14, same-number-20) are about what answers when no model does, or before one is asked.
- The server's log has no error on a route. It repeats 'search index sync failed' and 'embedding index' lines because in this worktree .cache/models/.../model_quantized.onnx is a 134-byte Git LFS pointer: an environment matter, already in the other findings files. No figure here uses it. It has one effect here: meaning search stays off.
- Trends: the page reads the whole district whatever the zone or department, so the trends readings for a zone or department scope are read with the scope sent; the console itself does not send them on that page.
