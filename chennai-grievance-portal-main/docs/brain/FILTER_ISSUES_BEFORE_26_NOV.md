# Filter issues found before the 26 Nov round (fixed in that round unless marked by design)

Each line is an element that does not follow a filter the page shows, with file:line. Items marked (by design) say so on screen.

1. Briefing > Key points ignore the category filter: the day brief has no category (lib/collector/aibrief.ts:122 BriefScope; app/api/collector/brief/route.ts:35; components/collector/app/CollectorApp.tsx:510 sends it, unused).
2. Briefing > Key points: unusual rises follow only the zone, not department or taluk (lib/collector/aibrief.ts:247); rain/air/reservoir figures and alerts are district-wide (aibrief.ts:249, 254), so a department view still leads with the weather.
3. Briefing > department AI brief ignores the category filter (components/collector/app/BriefingBook.tsx:276; aibrief.ts:122).
4. Briefing > Critical now uses max(period, 7 days) but its tooltip says 7 days (lib/collector/briefbook.ts:59; BriefingBook.tsx:187).
5. Briefing > Oldest open complaint: any date up to 180 days, not the period (briefbook.ts:89).
6. Briefing > status line and Warnings are district-wide whatever the filters (briefbook.ts:101).
7. Overview > Latest news > Differ: period only, never zone/taluk/department/category (CollectorApp.tsx:519; conflicts.ts periodConflicts).
8. Overview > Latest news > Next door: no filter; always 7 days, all three districts (CollectorApp.tsx:527; lib/collector/nearby.ts).
9. Overview > Latest news > News: with any zone/taluk/department/category filter the list switches from all news to news linked to incidents (lib/collector/intel.ts:1114) without a label; the tab count disappears.
10. Overview > Severe, not yet checked: not the period, any date (by design, said in the tooltip) (Overview.tsx:338; intel.ts notYetChecked).
11. Overview > Traffic pill count and view: district-wide, ignore the zone and department (Overview.tsx:57; traffic/TrafficView.tsx has its own zone filter).
12. Overview > Rain pill and rehearsal: ignore zone, department and period (rehearsal/RainBand.tsx; RainView.tsx own zone filter).
13. Overview > Map stations count and layer: all stations, not the zone (Overview.tsx:220; useEnv mapStations in Overview.tsx).
14. Overview > Ask the Map receives zone and taluk only; department, period and category are not passed (CollectorApp.tsx:378; askmap/useMapAsk.ts:21, 233).
15. Trends > Locations needing review follows the Overview's period (90 days on Quarterly) although the page says "not filtered" and the text says 30 days (lib/collector/insights.ts:157; Insights.tsx:501).
16. Environment > rain-day sentence and reservoir series use the Overview's period (at least 7 or 10 days) although the page says "not filtered" (lib/collector/intel.ts:1300, 1325; Overview.tsx:684).
17. Ask District IQ: default period is the last 90 days, not the console's period; category is not used (assistant/AssistantDialog.tsx:321).
18. Today's insights (the orange badge and cards): daily and whole district whatever the filters (app/api/collector/assistant/insights/route.ts; CollectorApp.tsx:302).
19. Palette search: whole district, any date, ignores the filters (lib/collector/intel.ts search()).
20. Departments popup lists every department whatever the department filter, and its title says no period (by design) (Overlays.tsx DeptsBody; intel.ts overview deptNav).
21. Incident list: the console's category and taluk stay applied but cannot be seen or changed inside the list; "All 180 days" is any date (Overlays.tsx ListBody:79; intel.ts list()).
22. Open complaints tile: its list opens all open incidents sorted by complaints, so it also shows incidents with no complaint (Overview.tsx:87).
23. News > See more: "All" counts every story; "Needs action" and "For information" count only the 250 loaded (Overlays.tsx:329-340).
24. Data Studio and dashboards: not filtered by any console filter (by design).
25. Notices and alert chip: district-wide (by design).
26. Copy issue, not a filter: "Only in the news" window says "Newest and most serious first" but orders by priority (Insights.tsx:330; insights.ts:188).

Not filter issues but related (also seen):
- Locations review text says "Open one to see its reports and set the place", but no screen sets a place (Insights.tsx:501; no control in Detail.tsx).
- The Mandi prices and Locations needing review windows read the page part that is loaded (CollectorApp.tsx:463, 726, 730; Thunai.tsx:833-834): if Jarvis opens them from the Overview without turning to Environment or Trends first, nothing loads them and they stay on the loading state; from another insights page they read that page's part and can say nothing is there.
- Customize and old cards still use old names ("Satellite map", "Severity-based incidents", "Environment & markets … developing stories") that are not on the screen (Workspace.tsx CustomizeBody).
- Floating buttons cover content: Ask District IQ (motionfx.css:78, right 20px, bottom 20px, about 230 x 48 px, z-index 70) and Jarvis with its clock (jarvisswitch.css:2, right 18px, bottom 78px, about 160 x 46 px, z-index 70) sit on the last rows of the card in the bottom-right corner: Latest news (Overview), Only in the news (Briefing), Locations needing review (Trends), the last price rows (Environment). Only the Data Studio leaves room, and only 62 px (studio.css:585), less than the 126 px both buttons take. On the grown map they cover the key: .amleg (askmap.css:173, right 12, bottom 26) and .rv-leg (rainview.css:153, right 12, bottom 22), because .map-wrap is its own stacking layer (z-index 0). Popups (scrim 80, modal 85), the chatbot (90), toasts (120, top right) and search (130) are above the buttons, which is correct.
- Unused code kept in the bundle: FreshWarn (CollectorApp.tsx), FeedsBody (Overlays.tsx), FromDatasets (BriefingBook.tsx), `snapshot.topTaluk`, `backlog`.
