# District IQ Collector console: every page, tile, label and button

This file is the assistant's own reference. Each entry says what an element shows, the exact rule behind it, where the data comes from, which filters apply, what a click does, and the code and API behind it. Paths are under `chennai-grievance-portal-main/src`. "Filters: ALL" means period, zone, taluk, department and category together. Names after ## are the page names on screen; names after ### are the labels on screen.

## How to read every number (rules shared by all pages)

### Periods (Daily, Weekly, Monthly, Quarterly)
- Shows: the reporting window of the Overview and Briefing pages.
- Worked out: Daily = the calendar day in India, from 12 AM to now; between 12 AM and 6 AM the day before goes on (so at 2 AM the page still shows everything since 12 AM yesterday), and at 6 AM the new day starts from its 12 AM. Nothing reported in the day leaves the page before the day is over. Daily is compared with the same hours one day earlier ("yesterday by this time"). Weekly = last 7 days, Monthly = last 30 days, Quarterly = last 90 days, back from now, compared with the same length just before. "The last 24 hours", when asked in words, is the rolling 24 hours before the clock.
- Source: incidents.first_reported_at / closed time / last_update_at. Times are India time (IST).
- Code: lib/collector/intel.ts PERIODS, periodWindow, asOf. API: `periodInfo.label` in /api/collector/overview.

### Incident
- Shows: one real problem or event. One incident can hold many reports.
- Worked out: the pipeline joins reports from all sources that are the same event (time, place, category, text). Auto-merge at match probability 0.85 or more; 0.40 to 0.85 goes to review. Place and time limits come from each category (for example flooding: within 600 m and 72 h).
- Source: district_intel tables incidents, incident_members, events, documents.

### Merged rows ("3 incidents merged", "2 merged")
- Worked out: on the AWS store, incidents that are the same problem in the same area are shown as one row (cluster_id). Placed incidents: same category, within 300 m of the group's first report and within 72 h; citizen complaints also join on the same named street or place in the same zone within 1,500 m, or the same citizen in the same zone within 600 m. Crimes, accidents and fires join only when the text also reads alike. City-level news joins when headlines are alike (TF-IDF cosine 0.45 or more); routine notices (power, rain, dengue) are one group a week. Lists and the severity card count rows (groups); the KPI tiles count every incident, so a tile can be larger than the card.
- Code: lib/collector/cluster.ts clusterIncidents; lib/collector/db.ts CLUSTER.

### Open / still open
- Worked out: the effective status. The pipeline's status, with the Collector's latest decision on top: verify, resolve and reject close a case; reopen (Send back) opens it; note and escalate change nothing. A later department step moves an open case to Assigned (approve), In progress (action) or Awaiting verification (send). A news-only civic complaint handed to a department is not counted as open on the console.
- Source: incidents + collector_decisions + officer_steps + dept_assignments.
- Code: lib/collector/effective.ts effectiveSql; lib/collector/intel.ts OPEN_NOW.

### Severity (Severe, High, Medium, Low)
- Worked out: a score from fixed rules on the facts of the event, 0 to 100: Severe 70 or more, High 50 to 69, Medium 30 to 49, Low under 30. Age, deadlines and number of reports do not change severity (they change priority).
  - Citizen grievance: flood or high-risk kind 35, public safety or sanitation 25, ordinary civic 15, tax/licence/voter 5; +15 immediate hazard; +8 for each vulnerable group or place (school, hospital, children, elderly; at most +24); +10 if the citizen says it was reported before.
  - Police record (from the 28 Nov build): the kind of offence is scored by its legal class, the punishment bands of the BNSS First Schedule: punishable with death, life or more than 7 years 50 (murder, BNS 103(1); rape or dowry death, BNS 64(1)/80(2)), 3 to 7 years 35 (crimes against women, BNS 74; theft, BNS 303(2); snatching, BNS 304(2); cyber fraud, BNS 318(4)), under 3 years or fine only 20 (assault, BNS 115(2); road accident, BNS 281; protest, BNS 189(2)/191(2); traffic obstruction, BNS 285; nuisance, BNS 292). Not offences by themselves (District IQ defaults): weather emergency 45, missing person 40, drugs/liquor 30 (punishment depends on quantity), other 15. Then: offence against a woman or child (BNS Chapter V) +20, in place of the vulnerable-victim points (so rape or dowry death is Severe, 50 + 20); any death makes it at least 70 (Severe), at least +30; +10 per injured (max +30); +10 vulnerable victim; weapon +10, or raises simple hurt to BNS 118(1) (+15); +10 road blocked over 60 min; +10 crowd over 1,000.
  - PWD record: bund breach 60, wall collapse 55, canal overflow or lake surplus 45, bridge damage 40, waterlogging or sluice failure 35, building crack 30, blocked drain 25, encroachment 15 (District IQ defaults); any death makes it at least 70; +10 per injured (max +30); full disruption +15, partial +5; access blocked +10; 500 or more people +15, 100 or more +10; vulnerable +8 each (max +16).
  - News and other: the category's base score (the crime categories take their legal class: violent crime 50, crimes against women 35 + 20, theft/snatching/fraud 35, road accident 20, protests 20, traffic obstruction 20; the rest are District IQ defaults); any death at least 70; +10 per injured (max +30); hazard +10; vulnerable +8 each (max +16). Not confirmed by a department or officer: capped at 69 (High).
  - Every point is written in severity_reasons as "<what> (+points)" and, with the rule it comes from (the BNS section or "District IQ default"), in incidents.score_why ("sev"). The incident's case page shows them under "How it was scored". The points of each class and factor are District IQ choices; the classes themselves are the law's.
- Source: district_intel/dintel/severity.py and reference/severity_rules.yaml; level cut-offs in dintel/refdata.py severity_level; stored in incidents.severity_score, severity_level, severity_reasons, score_why.

### Priority (order "most urgent first")
- Worked out: priority = severity score (impact) + urgency and spread points + the Collector-learned adjustment. Points (District IQ defaults): several sources 5 x log2(number of sources); citizen complaints 3 x log2(1 + complaints) when more than one; open more than twice past its deadline +20, past it +10, close to it (three quarters of the time used, from the 28 Nov build) +5; Severe/High open and not verified by an officer +8; 3 or more new reports in 24 h +8; vulnerable people +5; 2 or more news outlets +5; only in the news +5; linked to a rain day +5; 3 or more similar incidents here in 90 days +5. Learning: once 30 Verify / Send back decisions count (at least 5 each way), and only if the learned weights rank them better in a held-out test, an adjustment is added: each signal may move by at most its own points and the whole adjustment by at most 10 points; it is shown as one line ("Your past decisions on similar cases: +6, mostly for: ..."). Until then there is no adjustment.
- Every term with its points is in incidents.score_why ("pri"); they add up to priority_score. The case page shows them under "How it was scored".
- Source: district_intel/dintel/priority.py; incidents.priority_score, priority_reasons, score_why.

### Deadline, past deadline, overdue
- Worked out: the deadline is first report time + the hours for the incident's category and severity (reference/categories.yaml sla_h, for example flooding 6/24/72/120 h for Severe/High/Medium/Low). Police and some categories use time to first response. Past deadline = the pipeline flagged it, or its due time is before now, and it is still open. Every tile, list and popup uses this one rule.
- Where the hours come from (reference/sla_sources.yaml, incidents.sla_source): official timelines where one was found and read (checked 28 Nov 2026): drinking water Medium 3 days for a service-line leak (CMWSSB Citizen's Charter 2021, section 5C(2)) and Low 5 days for no or defective supply (section 5C(4)), called official ONLY when the complaint is that kind of fault; other water complaints show the charter clauses as related notes. Street lights and electrical hazards are the Corporation's (GCC-ELE): TNERC's restoration times (regulation 12(II)) bind TANGEDCO's supply, so they are shown as related notes and the street-light deadlines (Severe 4 h, High 24 h) are District IQ defaults. Every other deadline is a District IQ default: no GCC citizen's charter with grievance timelines was found, and BNSS sets investigation timelines (rape cases within two months, section 193(2)), not first-response hours. No deadline is longer than one month.
- Code: lib/reference/metrics.ts pastDueSql, isPastDeadline.

### "Needs you" / why it needs you
- Worked out: an open incident needs the Collector when it has at least one reason and it is Severe or High, or its strongest reason scores 70 or more. Reasons and strength: deaths 100; still open at more than twice its deadline 90; needs several departments 80; no officer has confirmed it (Severe/High) 75; no response within target 70; in the news with no department record 70; more reports still coming 65; past its deadline 60; 3 or more citizens complained 55; 2 or more outlets 50; keeps happening (5 or more similar in 90 days) 40. The AI may word the reasons; it never decides. Anything else is "routine: the department is handling it".
- Code: lib/collector/intel.ts explain(), attentionRows().

### Confidence, "review"
- Worked out: the weakest of the report-matching probability and the location confidence. Under 70 %, or reports spread over 3 km, or over 80 reports, it is flagged for review.

### Where the data comes from (all sources)
- Citizen grievances: District IQ portal complaints plus generated history (marked "Test data" in Data sources); paper petitions ("Manu") approved at the Collector's office.
- Police, PWD field records and works, hospital MIS: generated departmental feeds (marked Test data).
- News: live news monitor (RSS, sitemaps, Google News), English and Tamil, hourly; plus 4 live RSS feeds every 10 minutes (The Hindu, Times of India, DT Next, The New Indian Express).
- IMD: district warning (every 10 minutes), rain gauges at 8:30 and 17:30.
- CPCB: hourly AQI stations. CFM-DSS / Chennai Flood Monitor: river gauges, live rain (every 10 minutes).
- CMWSSB (Chennai Metro Water): storage of 6 drinking-water reservoirs, read hourly.
- TN Department of Agricultural Marketing & Agri Business (agrimark.tn.gov.in): retail vegetable and fruit prices at 8 Uzhavar Sandhai farmer markets in and around Chennai, read daily (AGMARKNET's API asks for a CAPTCHA since October and is not used).
- NDMA SACHET: disaster alerts naming Chennai, every 15 minutes.
- TomTom: live traffic incidents every 5 minutes, road colours every 2.
- OpenStreetMap: roads, facilities, water bodies. GCC website: officer contacts. DataMeet: ward outlines.
- The store is rebuilt hourly (GitHub dataload to S3, read by the site); decisions, tasks, workspaces and added links are kept in the durable operations store.

## Top bar, menus and page frame

### Overview / Briefing / Trends / Environment / Data Studio (tabs)
- Shows: the five pages. PageUp / PageDown also turn pages. Pages can be switched off in Customize.
- Click: opens the page. "Second page" = Briefing, third = Trends, fourth = Environment & markets, fifth = Data Studio.
- Code: components/collector/app/CollectorApp.tsx pages; Shell.tsx PageTabs.

### Search ( / )
- Shows: command palette: zones, departments, incidents, complaint numbers, news, data sources, Data Studio datasets, actions (Go to, Export, Rain & flooding, Live traffic, Ask the map, Jarvis, theme, reload), "Ask the map" and "Ask District IQ" with the typed words.
- Worked out: every typed word must appear, in any order, in an incident's headline, place, zone or category, or its id. Words in the headline first, then open, then priority; 7 incidents shown with "N more".
- Filters: none. It searches the whole district and any date.
- Click: opens the item, or filters to a zone or department.
- Code: Shell.tsx Palette, intel.ts search(). API: GET /api/collector/search?q= (incidents[], incidentsTotal, zones[].open).

### Language button (தமிழ் / English)
- Shows: switches the whole site and Jarvis to Tamil or English; remembered in the browser. Code: TopMenu.tsx LangSwitch, lib/i18n.

### Menu
- My dashboards: the Data Studio's Dashboards tab.
- Export report: PDF or CSV (see Export report).
- Workspaces: save or reopen a view.
- Customize the dashboard: choose pages, panels and headline cards.
- Dark mode / Light mode: theme, remembered in this browser (light by default).
- Data sources: links, every source, audit log.
- Security: sign-ins, sessions, check an email reference.
- Language: English / Tamil.
- Code: TopMenu.tsx, CollectorApp.tsx.

### Bell (alerts)
- Shows: the number and list of open severe and high incidents of the view, at most 6, grouped Now (last hour), Earlier today, Earlier.
- Worked out: same filter and open rule as the tiles, Severe first, then most citizen complaints. New data makes it count as unread again; "Mark all read" is only for this browser session.
- Source: incidents. Filters: ALL. Click: opens the incident.
- Code: intel.ts overview (bell), Shell.tsx Bell. API: /api/collector/overview `bell[]`.

### CO (account menu)
- Shows: who is signed in and the data time; Security, Data sources, Audit log (every decision and change), Reload data, Clear all filters, Sign out (this tab only).

### Date, alert chip and data chip (top-left of the band)
- Alert chip (for example "Cyclone Murasu", "Thunderstorms & Lightning"): shown only when there is a warning; colour = red, orange, yellow, or "watch" for news only. Click: what each source says, the fallback figures, and the news behind it. See "Why is this alert shown".
- Data chip "Collected today, 11:02": when the feeds were last collected, with "N of M feeds current · X/Y live" or "Data as of". Turns amber with "N feeds behind" when a feed this page uses is more than twice its refresh interval late. Generated test feeds are never counted live. Click: Data sources.
- Filters: none (district-wide, all feeds). Code: CollectorApp.tsx Collected, lib/collector/freshness.ts. API: overview `collection`, `feeds`.

### Filters row (Period, All 15 zones, All taluks, All departments, category chip, Clear)
- Shows: the filters of Overview and Briefing. The department list shows "(N open)". A category filter can only be set by Ask District IQ, Jarvis, or a saved workspace; it shows as a chip with an x.
- Worked out: choosing one re-reads the page; a toast says "Showing X only. All panels filtered." Trends and Environment say "District-wide · not filtered"; Data Studio says "Your files · not filtered".

### "Good morning, Collector" and page title
- Shows: greeting by IST hour (before 12 morning, before 17 afternoon) on Overview; the page name elsewhere.

### Pinned (chips under the greeting)
- Shows: Jarvis screens the Collector pinned; a click rebuilds the screen from today's data. Hidden when none. Kept in this browser. Code: thunai/JarvisPins.tsx.

### Toast messages (top right)
- Shows: "New data from the pipeline", "Live update: ...", results of actions. The console checks for new data every 20 seconds and refreshes when nothing is open.

### Jarvis button, clock and Ask District IQ button (bottom right)
- Shows: "Jarvis" (start or close Jarvis; also opens by saying "Hi Jarvis"), the clock with the number of earlier questions, and "Ask District IQ Ctrl K" with an orange number = today's insights ready. They float over the bottom-right corner of every page.
- Code: thunai/JarvisFab.tsx, CollectorApp.tsx; CSS jarvisswitch.css (right 18px, bottom 78px), motionfx.css (right 20px, bottom 20px), both z-index 70.

## Overview

Defaults for this page, unless an entry says otherwise. Source: the district intelligence store (table incidents, with the Collector's decisions on top). Filters: ALL. Code: components/collector/app/Overview.tsx and Attention.tsx, computed by lib/collector/intel.ts overview(). API: GET /api/collector/overview?period=&zone=&taluk=&dept=&cat= (the JSON path is given per entry).

### Severe events (tile)
- Shows: incidents rated Severe reported in the period, open or closed; below it "N still open · M closed" and the change from the previous period ("3 fewer than yesterday").
- Worked out: count of severity = Severe by first report time; fewer is shown as good.
- Source: incidents. Filters: ALL. Click: list "Severe events".
- Code: intel.ts kpiBlock; Overview.tsx Kpi. API: /api/collector/overview `kpi.cur.severe`, `kpi.prev.severe`, `kpi.cur.severe_open`.

### Open complaints (tile)
- Shows: citizen complaints on incidents still open, "on N open incidents".
- Worked out: sum of citizen complaints of open incidents reported in the period. Hidden when a department is chosen (then it is a note on Open incidents).
- Filters: ALL. Click: list of open incidents sorted by complaints (it also lists open incidents with no complaint). API: `kpi.cur.complaints`, `kpi.cur.complaint_inc`.

### Ongoing incidents / Open incidents (tile)
- Shows: incidents reported in the period not yet resolved; "N of them severe or high". Called "Open incidents" when a department is chosen.
- Filters: ALL. Click: open incidents by severity. API: `kpi.cur.ongoing`, `kpi.cur.urgent`.

### Resolved since 12 AM / 7 / 30 / 90 days (tile)
- Shows: incidents closed as Resolved in the period, by closing time (the Collector's decisions included), and "M reported".
- Worked out: effective status Resolved and closed time in the window; the first closing since it was last open.
- Filters: ALL. Click: list status Resolved. API: `kpi.cur.resolved`, `kpi.cur.reported`.

### District Snapshot: Most serious zones
- Shows: up to two GCC zones. Worked out: zones by points of incidents reported in the period, Severe = 3 and High = 1, open or closed. Filters: period, taluk, category. Click: filters to the first zone. API: `snapshot.topZones`.

### Past deadline, still open (tile in every snapshot)
- Shows: open incidents past their deadline, reported in the period. Filters: ALL. Click: list "Open and past deadline". API: `snapshot.overdue`.

### Severe, not yet checked (tile)
- Shows: open severe incidents no officer has confirmed on the ground, or that a department sent for checking. Worked out: open and Severe and (not verified or awaiting the Collector, or an officer's completion report not yet decided). A less severe case an officer sent for approval is in My tasks, not here. Any date, not the period.
- Filters: zone, taluk, department, category; NOT the period (by design). Click: list of any date. API: `snapshot.critical`.

### Zone snapshot (when a zone is chosen): Zonal officer (GCC), Past deadline, Busiest department
- Shows: the zonal officer from the GCC Who's who page with phone and email; the department with most open incidents there. Filters: ALL. Click on Busiest department: filters to it. Code: intel.ts areaSnapshot. API: `snapshot.zoneOfficer`, `snapshot.keyDept`.

### Department snapshot (when a department is chosen): Department head, Past deadline, Most open work in
- Shows: the head, "All contacts", and the zone with most of this department's open incidents. Filters: ALL. Click: "All contacts" opens official contacts and escalation route; the zone tile filters to it. Code: intel.ts deptSnapshot. API: `snapshot.contacts`, `snapshot.topZone`.

### Map (Chennai District / zone / taluk name)
- Shows: GCC wards and zones shaded by incidents reported ("Incidents by zone", Fewer to More), incident pins, stations and added items. Taluks view colours wards by revenue taluk.
- Worked out: zone shading = incidents in the period for every zone (follows department, taluk and category, never the zone itself). Pins: only places known to within 2,000 m; at most 150 pins, open first, then most severe, then most complaints, newest. Pin colours: red Severe, amber with a citizen complaint, cyan other. Zone tooltip: open, severe, complaints.
- Source: incidents (lat, lon, loc_precision_m); ward outlines DataMeet.
- Filters: ALL for pins. Click: a ward filters to its zone (or taluk), a pin opens the incident, a station opens the Environment page on it, a violet diamond opens an added item.
- Code: SatMap.tsx; intel.ts overview map; mapplace.ts PINNABLE. API: `map.pins`, `map.zoneCounts`, `map.drawn`, `map.layerCounts`, `map.unlocated`, `zoneTable`.

### Severe / Complaints / Other (legend buttons)
- Shows: pins drawn per layer, "N of M" when the 150 limit cut it. Click: show or hide. API: `map.drawn`, `map.layerCounts`.

### N not drawn (pin limit) / N not on the map
- Shows: incidents left off: over the pin limit, or with no exact place (district-wide or unknown). Click: the list of them. API: `map.unlocated`.

### Added (legend) / Stations (legend)
- Added: items from links the Collector added that name a place. Filters: ALL (Daily = since 12 AM, else the period's days). Stations: every air, rain and reservoir station, off by default; not filtered by zone. API: `added.pins`; `bottom.aqi/rain/lakes.stations`.

### Zones | Taluks (switch)
- Shows: GCC zones and wards, or revenue taluks.

### + − fit, Full screen, Map / Satellite, Map tools
- Zoom, show the whole area, full screen, switch street map and satellite (remembered). The street map is the default (since 28 Nov in green and yellow: homes soft yellow, parks and trees green, main roads yellow and orange); a Collector who chose Satellite keeps it.
- Map tools: "Then and now" (swipe between an old and the current Esri satellite photo, with photo dates) and "Measure and plot" (draw a plot: area, perimeter, wards touched, incidents inside, copy as GeoJSON, or ask about it).
- "Back to previous view" appears at the foot of the map, in the middle, after an incident was located (it used to sit at the top, behind Ask the map, Rain and Traffic). Code: SatMap.tsx, geotools/GeoTools.tsx, components/map/basemap.ts.

### Ask the map… (pill)
- See "Ask the Map".

### Rain (pill)
- Shows: opens Rain & flooding. Turns to the warning colour with "Rain watch", "Heavy rain likely" or "Heavy rain soon" when IMD, the flood monitor, a reservoir release or a lake over 85 % and rising warns. Filters: none. Code: Overview.tsx RainPill; lib/rehearsal/trigger.ts. API: /api/rehearsal/state `trigger`.

### Traffic N (pill)
- Shows: live traffic, N = spots needing action now, whole city. Read every 5 minutes. Filters: none (district-wide). API: /api/traffic `counts.action`.

### By severity (card)
- Shows: open incidents by level, the same problem reported several times shown once; four tabs with counts and their share; "N need you · shown first"; each row: title, the reason (if it needs you), zone, department, age, "N merged", and "Act" for severe ones ("Sent" when an instruction went out). One line per row (title, then one line of facts cut with "…"); hover for the whole reason, place, department and age.
- Worked out: one row per merged group under the group's most severe member; 12 most urgent rows per level by priority; ones that need you first.
- Source: incidents. Filters: ALL. Click: opens the incident and highlights it on the map; "Act" opens Take action; "See all" the list.
- Code: Attention.tsx SevList; intel.ts overview sevRows. API: `severity.counts`, `severity.rows[]`.

### My tasks (tab of the same card)
- Shows: closed work on severe incidents, and any case a department sent for the Collector's approval, waiting for the Collector's check, one per group; whether a report with photos came; "N other closures verified by departments".
- Worked out: the department marked done in the period (Severe, citizen complaint, still open, no Collector decision), plus every completion report an officer sent from its console, of any severity and whatever its date. The department closes everything else itself.
- Filters: ALL. Click: opens the remarks and photos in place. Verify closes the whole group (asks for the password); Send back reopens it; Ask opens Take action to request a report.
- Code: Attention.tsx TaskList; intel.ts awaitingRule, awaitingCheck. API: `tasks.rows`, `tasks.count`, `tasks.leftToDepts`. POST /api/collector/decisions.

### Latest news: News
- Shows: news stories of the period that belong on the Collector's desk, each with the news desk's line, "Needs action" or "For information", area of work, outlets, place and age; "Reports differ" or "Also a grievance / Severe incident · no citizen complaint yet". A story only (or first) in Tamil shows its Tamil headline as published, with the English line under it; a story with English and Tamil reports shows English first with the Tamil headline under it; with the site in Tamil, only the Tamil headline.
- Worked out: district articles from established, regional and official outlets (no blogs or social); the same event from any outlet and language is one story; the AI news desk keeps act and know, skips the rest; until an article is read, rules decide. Newest 250 stories shown, tab number = all.
- Source: documents (news monitor) + data/aws-cache/newsdesk.json. Filters: period only. When a zone, taluk, department or category is set, the list changes to news linked to incidents in that filter (no count on the tab).
- Click: the incident if it has one, else the news popup. "See more": full list.
- Code: intel.ts newsStories, newsDocs; newsdesk.ts. API: overview `allNews[]`, `allNewsTotal`, `news[]`.

### Latest news: Differ ("Reports differ")
- Shows: stories where two or more newspapers give different facts about the same incident (the number dead or injured, arrests, age, place, time, cause), what each paper says, and who to ask. A story that has since been settled stays with "resolved at 2:20 PM: the reports now agree".
- Worked out: stories with at least two outlets whose reports are of the same event within 30 hours. An AI reads the two reports side by side and the difference is listed only when each claim is really in its report; estimates, and tolls that rise later, do not count; a date with or without its year, or one list of names inside another, is not a difference. Each pair of texts is read once and its verdict kept. A difference once found is written in a book for the day (by day, what differs, and the reports), so it stays on the list until the day is over, whatever new reports, a new build or a busy AI do. Ordered by the size of the gap, then the newest.
- Why the list may change: a new difference is found, or one is marked resolved. It does not disappear in the middle of the day.
- Source: documents and live feeds; data/aws-cache/differ-book.json. Filters: ALL, through the incident a story belongs to; stories with no incident are listed apart as "district-wide".
- Code: conflicts.ts periodConflicts, differbook.ts, conflictscope.ts, Conflicts.tsx. API: GET /api/collector/conflicts.

### Latest news: Next door
- Shows: news of Tiruvallur, Kancheepuram and Chengalpattu that could reach Chennai, in Prepare (likely to reach Chennai or already serious) and Watch groups.
- Worked out: Google News searches per district and for disease, in English and Tamil, last 7 days, read at most once an hour; only headlines naming a place there; noise and Chennai's own news dropped; Prepare = outbreak or 3+ reports of disease, surplus/flood/breach, gas leak or blast, hooch/communal/riot; the AI sorts it and writes why it matters.
- Filters: none. Click: what happened, why it matters for Chennai, suggested precaution, every report. "See more": the whole list.
- Code: nearby.ts; Nearby.tsx. API: GET /api/collector/nearby `districts[]`, `watch[]`.

### Latest news: Added
- Shows: items from links the Collector added. Filters: ALL (since 12 AM on Daily, else the period's days). "Add or remove links" opens Data sources. Click: the item, its category and place and its source link. Code: Added.tsx. API: `added.items`, `added.count`.

### See more (Latest news): All / Needs action / For information / Left out
- Shows: every news story, filter by area of work; "Left out" = news the desk skipped with its reason (films, sport, business, party politics, petty crime, another district, feature, listing, religion, personal, promotion).
- Worked out: All shows the period's total; Needs action and For information count the stories loaded (at most 250). Left out comes from /api/collector/news?left=1. With a zone, department or category filter the list shows only linked incident news and has no Left out.
- Code: Overlays.tsx NewsAllBody; intel.ts newsLeftOut.

## Incident pop-up (details of one incident)

Defaults: Source: incidents, incident_members, events, documents, officer_reports, outbound_emails, official_contacts. Filters: none (it is about one incident and every incident merged with it). Code: components/collector/app/Detail.tsx IncidentView, lib/collector/intel.ts incident(). API: GET /api/collector/incidents/{id}. Opened from any list, pin, bell row, news story or search hit; closed by Esc, x or a click outside.

### Header chips
- Severity (solid colour), status, "Action taken" (an instruction was emailed), "Verified by you", "Closed by the department" / "Resolved", "Sent to ..." (news complaint routed to an officer), the department's step (Approved / Work started / Completion report sent to you), "N incidents merged", "In the news · N outlets", "N citizen complaints".

### Location line and buttons
- Place, zone, ward; department; "First reported"; "Show on map" (needs a point); "What else is near here?" (Ask the Map: 500 m, 30 days, every department); "Take action" (severe and open only; "Action taken · send again" after the first).

### What happened
- Shows: the AI's 3 to 5 sentence account of every report, or the rules' sentence and facts while it is written. Every number is checked against the records. Code: analysis.ts; Detail.tsx Explained. API: /api/collector/incidents/{id}/analysis.

### Why it needs you / Next step / No action needed from you
- Shows: up to 4 reasons with evidence (AI, or rules from explain()), the next step, or "No action needed from you" when it is routine.

### Reports differ
- Shows: where outlets covering it disagree (see Differ). Only when 2 or more outlets reported it.

### Instruction sent
- Shows: when and to whom the Take action email went, its subject, and whether it was emailed or is on the officer's console.

### Work reported by (department) / No completion report
- Shows: the officer's remarks and site photos from the completion report; or a note that none was sent. Citizens' details are masked. Click on a photo: full size.

### Key facts
- Open for / Closed; Deadline (red "missed" when past); Citizen complaints (all merged reports); Field officer; Taluk; Confidence (amber below 70 %, "review" flag).

### Paper petition (when it is a Manu)
- Shows: the scanned petition with zoom. Code: components/manu/PetitionOriginal.tsx.

### How it unfolded (timeline)
- Shows: every report in time order, day by day: citizen complaints, police, PWD, hospital, news (with outlet and kind), IMD. "First" = the first report; "linked 87%" = how sure the match is; "merged" = from another merged incident. Tamil headlines carry an English line; AI-read details: place, people, bodies, casualties, status.
- Source: incident_members, events, documents. Code: intel.ts incident().

### Reported by
- Shows: counts per source: citizen complaints (Manu named), police reports, PWD records, hospitals, news outlets (names), IMD. An outlet counts once however many articles.

### N incidents merged into this one
- Shows: every incident joined to it (same problem, same area) with place, time, status and complaints.

### Only in the news … sent to
- Shows: the officer a news-only civic complaint was routed to automatically (open news-only complaints in civic categories of the last 30 days; done by the job POST /api/collector/jobs/route-news, which this server's own scheduler does not run).

### Who is responsible
- Shows: the department head and the zonal officer with phone and email from the GCC Who's who page; "Not listed" when the department has none. A link to the source and its date.

- API for the pop-up: GET /api/collector/incidents/{id} `incident`, `group`, `reports`, `contacts`, `deptReports`, `emails`. Code: Detail.tsx IncidentView.

## Take action

### Take action (dialog)
- Shows: three steps (read, find the officer, draft), the recipient (the department officer's account; the head is for reference only), the sandbox or live note, whether one was already sent, and the subject and message to edit. Severe incidents only.
- Worked out: AI drafts from the incident's facts (a template if no model). Sandbox mode (the default) sends only to the team inbox and to the officer's console. Approve & send asks for the password, gives a reference (DIQ-XXXX-XXXX) and sets a follow-up due in 24 hours. A completion report with photos comes to My tasks.
- Click: Redraft, Copy, Cancel, Approve & send. Code: TakeAction.tsx, actionmail.ts, security/stepup.ts. API: GET/POST /api/collector/incidents/{id}/action; tables outbound_emails, followups, audit_log.

### Verify / Send back / decisions
- Worked out: verify and resolve close as done, reject closes as Rejected, reopen sends back; a note needs words. Only severe incidents can be verified by the Collector. Every decision is confirmed with the password, audited with the incident's score at that moment (priority learning), and shown to the citizen. API: POST /api/collector/decisions.

## Lists and small popups

### Incident list (opened by tiles, "See all", search)
- Shows: incidents, 12 rows a page: title, zone, department, severity, status, "Reported by" (source counts), reported time. Filters inside: keyword, department, severity, status (Unresolved, Awaiting your verification, Severe not yet checked, Open and past deadline, Open, Under review, Assigned, In progress, Resolved, Rejected, Lapsed), time (the period or "All 180 days"). "X incidents in Y rows" when similar reports are grouped. Line under the filters says the scope and complaints linked.
- Worked out: one row per merged group (its most severe member); sort by reported, severity, complaints, zone or department. "All 180 days" means any date in the store.
- Filters: carries zone and the console's category and taluk silently; the department can be changed in the list. Click: the incident. Code: Overlays.tsx ListBody, intel.ts list(). API: GET /api/collector/list `rows`, `total`, `incidents`, `complaints`.

### Departments (popup)
- Shows: every department with Open incidents, Awaiting your verification and Severe for the period (zone, taluk and category apply; the department filter does not, so all are listed). Opened by "See all" on the Briefing Departments card, or by Jarvis.
- Click: a department filters the whole dashboard to it and closes the popup (toast "Showing X only. All panels filtered.").
- Code: Overlays.tsx DeptsBody; intel.ts overview deptNav. API: overview `deptNav[]`.

### Zones by open complaints (popup)
- Shows: every zone with open incidents, open complaints and severe, plus "No zone (district-wide or unknown)" so rows add up. Click: filters to the zone, or lists the no-zone incidents. Opened by Jarvis only (no button on screen). API: `zoneTable`, `zoneUnassigned`.

### Official contacts (popup)
- Shows: the department's officers and the zonal officer, escalation route, GCC 1913. Source: GCC Who's who (official_contacts).

### News popup ("In the news")
- Shows: what happened and why (AI from every outlet; the news desk's line until then), key facts, sources with links, "Reports differ", the full article (fetched from the publisher where its robots.txt allows), timeline of reports and the responsible department with contacts. Code: NewsPreview.tsx. API: /api/collector/news?ids=, /news/analysis, /news/article.

### Export report
- Shows: PDF report (period can be chosen here) with headline tiles, key points, "Needs your attention" (10 most urgent), work waiting for your check, where the workload is, news with no department record, and environment; or CSV action list ("Needs your attention" and "Closed work to check", with the reason). Follows zone, department, category and taluk. The CSV asks for the password; the PDF does not. Code: Overlays.tsx ExportBody, reportPdf.ts, intel.ts report(), exportRows(). API: GET /api/collector/report, /api/collector/export.

### Customize the dashboard
- Shows: switches for pages, Overview panels (Satellite map, District snapshot, Latest news, Severity-based incidents, My tasks) and headline cards. Saved in this browser and with each workspace version. Code: Workspace.tsx CustomizeBody.

## Workspaces

### Save the current view as
- Shows: saves period, zone, department, category, taluk, page, layers, station choices and layout, with a frozen copy of the briefing, as a new version. Code: Workspace.tsx; workspaces.ts. API: POST /api/collector/workspaces.

### Version list (v1, v2 … latest)
- Click: reopens it: filters applied on live data, the Briefing shows the saved copy. A saved Ask the Map view runs its plan again on today's data. Rename and Delete are beside each name. API: GET /api/collector/workspaces, /workspaces/{id}.
- (28 Nov) While a saved workspace is open the top bar shows a box "Saved workspace: <name> · saved <time>" with a green "Back to live dashboard" button (also first in the Menu and in the search palette). Its Briefing is drawn from the copy saved then, in the same layout as the live Briefing ("Saved copy · data as of <time>" beside the scope); new data does not change it; the other pages show live data with its filters. Changing a filter, or "Back to live dashboard", returns to the live dashboard (Back also restores the filters, layers and layout from before). Saving a new version waits until you are back on the live dashboard. Versions saved before 28 Nov kept only the written briefing: they open on the Briefing page's card in the written format. Code: CollectorApp.tsx SavedBar, BriefingBook.tsx freezeBook, lib/collector/workspacesnap.ts.

## Briefing (the second page)

Defaults: Source: incidents and documents in the store. Filters: ALL: the period, zone, taluk, department and category in force apply to every card (exceptions are stated). Code: components/collector/app/BriefingBook.tsx, lib/collector/briefbook.ts briefingBook(), lib/collector/insights.ts, lib/collector/glance.ts. API: GET /api/collector/insights?part=briefing (JSON `book`, `gaps`, `briefing`); stories from GET /api/collector/stories.

### Today at a glance (key points, the Collector's overview)
- Shows: a greeting and one sentence on the situation; five figures (Reported, Open, Past deadline, Severe, Resolved) each with its change on the period before; the last 7 days as small bars (reported beside resolved); and three lists of at most four points: "What is happening" (deaths, kinds and areas that rose, the strongest news, a warning), "What needs you" (severe cases not yet checked, work past its deadline, cases waiting in My tasks, reports that differ, incidents only in the news), "What to do next" (the next step of the most serious open cases, who to ask). Buttons EN / தமிழ் and Listen (reads it aloud). Every figure and point opens what it counts.
- Why it is there: so the Collector knows in half a minute what is happening and what needs their attention. It is not a list of severe incidents only.
- Worked out: by code (glance.ts) from the tiles' own figures and this page's lists for the filters in force; no model writes a figure. An AI may word the opening sentence, only when each of its figures is one already shown.
- Source: incidents, the action list, unusual rises, news documents, alerts. Filters: ALL. Weather, the air and the reservoirs are left out under a filter; a warning then carries the label "District-wide". A view with nothing in it says so.
- Code: glance.ts composeGlance; BriefingBook.tsx. API: insights `book.today`, `book.glance`.

### Status (Normal / Watchful / Alert)
- Shows: the status of the view by fixed rules. Worked out: Alert when 3 or more deaths or 15 or more severe incidents in the period, or (whole district) an official orange or red warning for Chennai; Watchful at 1 death or 5 severe, or (whole district) a yellow warning or storm news. Filters: ALL; warnings count only on the whole district's view. Code: briefbook.ts. API: insights `book.status`.

### Warnings / IMD warning
- Shows: what IMD, SACHET and the news each say and whether they agree, and feeds not reporting. District-wide, and labelled so under a filter. API: `book.alerts`.

### Oldest open complaint
- Shows: the oldest open citizen complaint of the period, in days. Filters: ALL. Click: the incident. API: `book.citizens.oldest`.

### Under the glance: Departments, Stories still developing, Only in the news
- Shows: three full-size cards under "Today at a glance". The Briefing page scrolls: the glance first, the three cards below it ("Departments, stories and news below" until the page is scrolled). Each card shows the rows that fit whole and says at its foot how many more ("9 more departments"), which opens the full list.

### Departments
- Shows: each department in one line: what it received in the period, what is past its deadline, deaths and severe (only when above 0). "See all" opens the Departments popup.
- Worked out: incidents reported in the period (open and closed) by lead department. Filters: ALL (a department filter leaves only that one).
- Click on a department: opens the department's summary pop-up.
- Code: BriefingBook.tsx Departments; briefbook.ts. API: /api/collector/insights `book.departments[]`.

### Department summary (the pop-up a click on a department opens)
- Shows: who heads the department and who to call; a written summary in two or three sentences; eight figures (reported, open, past deadline, severe, resolved, complaints, waiting for you, time taken to close) with their change; seven charts with headings: the last 7 days (reported and resolved each day), the last 12 weeks, severity, how long open cases have waited, what was reported most (with the period before), where (zones, or wards when a zone is chosen), and deadlines kept (closed in time or late, open in time or past); then its most important open cases, the news about its work, the steps it owes, and your instructions still waiting for a reply. The button "Show only this department on the page" filters the console.
- Opened from: Briefing Departments, the Departments popup, Overview's busiest department, and "Summary" in the department's snapshot.
- Worked out: the same functions as the tiles with the department as a filter. Filters: period, zone, taluk and category apply, except the charts that say their own window (last 7 days, last 12 weeks, waiting time at any date).
- Code: DeptSummary.tsx, MiniCharts.tsx, lib/collector/deptsummary.ts. API: /api/collector/dept.

### Stories still developing
- Shows: news stories that really moved on (attack, arrest, death, court): title, status (Ongoing, Awaiting next step, Settled), the latest two steps with dates ("latest 2 of 6 events"; the rest open with the story), outlets and "updated".
- Worked out: reports of the last 14 to 30 days; the AI finds the matters, joins duplicates, drops repeats and routine notices (prices, forecasts, lists), and writes each event once with every outlet; labels and figures are checked against the reports. A story is shown if it had two or more events in the period. Without AI, rules show stories with two or more different headlines from two outlets (or 3 reports) and a new kind of step or over a day.
- Filters: ALL (stories updated since the period start). Click: the story's timeline. "AI is reading…" while it writes.
- Code: storyai.ts stories, threads.ts. API: GET /api/collector/stories `threads[]`.

### Developing stories (popup)
- Shows: story list, and the story's timeline: each event with outlets and links, "Where it stands", records linked, and "Show every report" with repeats folded.

### Only in the news
- Shows: incidents reported in the news with no department record yet, with the department they belong to; count on the header.
- Worked out: news-only incidents in the period, not lapsed, not about another district, and not left out by the news desk; highest priority first. Filters: ALL. Click: the incident. "Only stories in 2+ outlets" filter in the window. API: insights `gaps[]`.

### Saved briefing (when a saved workspace is open)
- Shows (since 28 Nov): the same Briefing page as live, drawn from the saved copy: "Today at a glance" with a "Saved copy · data as of <time>" chip, its figures, key points and last 7 days as they were, then Departments, Stories still developing and Only in the news as saved. Clicking a point opens today's records. A version that kept only the written briefing (saved before 28 Nov, or from a chat answer's "Save as workspace") shows it on the page's card ("This version kept only the written briefing"). Code: BriefingBook.tsx (saved), lib/collector/workspacesnap.ts.

## Trends

Defaults: Source: incidents, anomalies, hotspots, ref_taluks, ref_wards. Filters: none (district-wide). Code: components/collector/app/Insights.tsx TrendsPage, lib/collector/insights.ts. API: GET /api/collector/insights?part=trends&period=.

### Page note "District-wide · not filtered"
- Shows: Trends is for the whole district. Zone, taluk and department do not apply. The period chosen on Overview still changes one thing: the window of "Locations needing review".

### Which problems are rising?
- Shows: the top 8 categories (plus all others): last 4 full weeks against the 4 weeks before, the change, the zone adding most, and a sentence of what rose and fell.
- Worked out: full Monday to Sunday weeks before this week. Rising = up 10 % or more, falling = down 10 % or more; categories with at least 5 reports before are named. Click: category window (12 weeks, zones, cause, incidents, next step). Code: insights.ts seriesOf, Insights.tsx Rising. API: insights?part=trends `trends.weekly.lines[]`, `trends.where`.

### Unresolved by taluk
- Shows: open incidents reported in the last 30 days by taluk, severe and past-deadline numbers, change on the 30 days before, and "No taluk". Click: the list. API: `taluks[]`, `talukUnassigned`.

### Unusual rises
- Shows: a day or fortnight with far more reports than normal for that category and zone ("4× usual"); spikes of the last 21 days. Worked out: Poisson test against the usual level, adjusted for rain, checked against 5 % false discoveries, at least 3 reports in the pipeline and 5 on screen; slow rises = a doubling over up to 14 days. Click: what happened. API: `patterns.emerging[]`.

### Recurring hotspots
- Shows: places where the same problem keeps coming back: 5 or more incidents within 250 m in 90 days (DBSCAN), with at least 3 in the last 30 days. Click: every incident there, month by month. API: `patterns.hotspots[]`.

### Pattern window (spike / hotspot / category)
- Shows: title, stats, AI "What is happening" with a shared cause only if the reports name one, chart (dashed line = usual), places, next step, and the incidents (max 60). API: /api/collector/pattern, /api/collector/brief?kind=pattern.

### Locations needing review ("location needs review")
- Shows: "Place unknown" = open incidents reported only as "in Chennai", and "Placed from the report" = open incidents the site placed from their reports (AWS store), with a list of unknown ones.
- Worked out: open incidents of the last 30 days (or of the period when longer: 90 days on Quarterly) with no zone. Each is judged by rules: District (IMD warnings, city-wide news), Located (its point is within 2.5 km of a ward, or its place or headline names a known Chennai place), Outside (beyond the wards, or a town outside the district), Missing (a specific event only "in Chennai", or a place the map does not know). Only Missing is listed; the same headline once. A twin headline already placed is left out.
- Source: incidents, ref_wards, the gazetteer. Filters: none on this page. Click: the incident. The review window has tabs "Place unknown" and "Placed from the report", a find box, and "Map"; its text tells the Collector to set the place, but the incident popup has no control to do so.
- Code: locreview.ts judgeLocation; insights.ts review; Insights.tsx LocationReview, ReviewBody. API: insights?part=trends `review.unplaced[]`, `review.unplacedTotal`, `review.placed[]`.

## Environment & markets

Defaults: Filters: none except each card's own station picker. Code: components/collector/app/Overview.tsx EnvPage, RainCard, AqiCard, LakeCard; Insights.tsx MarketsCard; lib/collector/intel.ts environment(), lakes.ts, sources.ts mandi*. API: GET /api/collector/overview (JSON `bottom`) and GET /api/collector/insights?part=environment (JSON `markets`).

### Page note
- "District-wide · not filtered": zone and department do not apply. Each card has its own station picker ("All stations"). The period chosen on Overview still changes the days covered by the rain sentence and the reservoir chart (never less than 7 or 10 days).

### Rainfall
- Shows: rain in 24 hours (average of stations), level (No rain, Light under 15.6 mm, Moderate under 64.5, Heavy under 115.6, Very heavy 115.6 or more), change on the previous day, the IMD scale, "N rain days in the last D days", and a 10-day bar chart. If the newest reading is over one day old, it says the date. Source: IMD gauges (observations rainfall_24h_mm); rain days from the shared rain calendar (world_calendar). API: overview `bottom.rain`.

### Air quality
- Shows: AQI (average of stations) with CPCB band (Good 0–50, Satisfactory 51–100, Moderate 101–200, Poor 201–300, Very poor 301–400, Severe over 400), change from the previous hour, the worst station, and the last 24 hours with the 100 line. Source: CPCB hourly. API: `bottom.aqi`.

### Reservoir storage
- Shows: combined percent full of Chennai's 6 drinking-water reservoirs (storage over capacity) or one; Low under 30 %, below half, Normal, Good, High 92 % or more (watch for surplus); mcft now, capacity, a year ago, change, and the CMWSSB source with its date. Source: CMWSSB daily (not the simulated PWD figures). API: `bottom.lakes`.

### Vegetable and fruit prices
- Shows: four views: Prices today / Latest prices (one line per item: average, change, cheapest and dearest market, two-week line), Compare markets (8 markets side by side), Around Chennai and Tamil Nadu (weekly averages). "Red ▲ = price went up since the market's last report." Prices older than 3 days are called "Latest prices" with their age, never today.
- Worked out: ₹ per kg = modal price per quintal / 100 (the modal price is the middle of the market's low and high); only items sold in 2 or more markets in the simple list; average of the market's latest prices of the last 3 days. Around Chennai is the weekly average of the 8 markets; the Tamil Nadu tab is AGMARKNET's state series and is hidden once it is 3 weeks old (it stopped on the week of 24 Oct). Source: Uzhavar Sandhai retail prices from the TN Agricultural Marketing department (data/aws-cache/tn-prices.json with mandi_market_prices; mandi_weekly and mandi_prices for the state). API: insights?part=environment `markets`.

### Mandi prices (Full screen)
- Shows: the same, every commodity at every market. A click on a market shows its price list.

## Why is this alert shown (alert chip and Briefing warnings)

### The alerts lane
- Shows: what IMD, NDMA SACHET and the news each say about warnings for Chennai, and whether they agree.
- Worked out: IMD = today's and tomorrow's district warning level (0 to 3). SACHET = alerts naming Chennai still in force (last 24 h, not expired; severity mapped to the same scale). News = warning articles of the last 48 h; a named cyclone with 3 or more outlets, or 2 or more reports that put Chennai under a warning, counts as active. Banner = strongest official level (red 3, orange 2, yellow 1); a storm or warning only in the news shows as "watch"; a hazard feed quiet for longer than its limit (CFM gauges 6 h, IMD rain 30 h) during an active alert turns it red with fallback rain and lake levels. "Agree", "news only", "official only" or "sources differ" are stated. A festival or occasion in a headline is never an alert name.
- Source: IMD (read every 10 minutes), SACHET (every 15), news (48 h), CFM, CMWSSB. Filters: none. Code: alerts.ts alertLane; AlertBar.tsx. API: GET /api/collector/alerts `lane.banner`, `lane.sources`, `lane.agreement`.

### Admin notice (grey)
- Shows: an AI key was refused by a provider and how to renew it. Can be hidden until it changes. Source: lib/ai/keyhealth.ts.

## Data sources (Menu > Data sources; data chip)

### Your links
- Shows: feeds and pages the Collector added: paste a link (RSS, page, JSON), name, how often it is read (10 min to daily), and confirm the site allows reading; items, status, Run, Pause / Resume, Remove (removing takes its items off the news and the map; pausing and removing ask for the password). Code: Sources.tsx MyLinks. API: GET/POST /api/collector/sources, POST/PATCH/DELETE /api/collector/sources/{id}.

### All sources
- Shows: every source with type (Pipeline feed, Public API, RSS, Web page, JSON), status (Healthy, Partial = some endpoints blocked, Stale, Failing, Login failed, Not run yet, Test data = generated), newest data, records, last 5 runs, and buttons. Pipeline feeds refresh hourly; "Refresh" starts the data load. "N of M live sources healthy". Source: source_health, sources, source_runs.

### Audit log
- Shows: every decision, source change and saved workspace, newest first: when, who, what, record, details. API: GET /api/collector/audit.

## Ask the Map

### Ask the map… (pill) and panel
- Shows: a question about places, distance, roads or areas, in English or Tamil, typed or spoken, answered on the Overview's map; the plan as chips that can be changed (no AI call), "How this was worked out", the answer, "Cases" list (up to 200, worst first), "Responsible" departments, "as of", and tools. Bulb = suggested questions. History recalled with ↑.
- Worked out: rules read the question first, AI only for what rules cannot read; every number comes from the server's executor over the store; the answer names a map layer. It receives the console's zone and taluk, not its department, period or category. The officer's console is locked to the officer's department.
- Click: pins, rows, chips, "What is happening here?" (an area brief), Send to department (one draft per department, sent only on Approve, sandbox by default), Export CSV or GeoJSON, Save view (a workspace), Plan my visits (officers). The Gaps, Rule check, Meeting pack and Your lists tools were removed on 28 Nov 2026; such questions can still be typed ("wards more than 2 km from a fire station", "wine shops within 100 m of schools"). "Today's data" insights under the answer are computed, not written by AI.
- Code: askmap/AskMapPanel.tsx, AskOverlay.tsx, useMapAsk.ts; lib/map/*. API: POST /api/map/ask, /api/map/send, /api/map/insight, GET /api/map/layers/{id}, /api/map/suggest.

### What is happening here (area brief)
- Shows: open issues in a ward, zone, taluk or circle by department; by type; the worst three with the rule that fired; last 30 days against the 30 before; facilities; citizen reports. Every count opens its list.

### On the ground now
- Shows: live conditions bearing on the answer (IMD warning, rain, lakes, PWD works, hospital beds, air quality) with place and time; at most four.

### Layers (menu) and legend
- Shows: optional map layers: live feeds (rain, lake levels, works, hospital beds, air), news of 30 days, the Collector's own layers (banks, ATMs, ration shops, wine shops, worship, parks, tanks, toilets and others from OpenStreetMap, some partial), facilities, rivers, police stations (store). The legend lists only what is on the map with counts; "Ward boundaries: DataMeet community data, not an official GCC map."

### Area tools on the grown map
- Back to the answer, Heat view, Draw a circle ("what is happening here?"), right-click a spot, Layers.

## Rain & flooding rehearsal

### Rain · Flooding
- Shows: past heavy rains (dates and mm), flooding reports in them, streets that flood in 3 or more rains, the zones and streets that flood most, what to do first, and jobs to send before the next rain; tabs Traffic, Power, Metro. A record of the past, never a forecast.
- Worked out: a heavy rain = a pipeline rain day or IMD 30 mm or more, or consecutive days; a flooding or drain complaint with a place within 300 m marks the street (waterlogging counts double); a complaint from a rain's first day to 2 days after its last counts for that rain. A street that flooded in 3 or more rains is likely to flood again; in 1 or 2, possible (the worst streets first, up to a length limit). Street card: rains it flooded, complaints, blocked drains still open, distance to water, ground lower than nearby roads, late works, main road. Zones and streets are clickable; "Open the complaint" opens the incident.
- Filters: none (its own rain and zone choices). Click: rain, zone, street, report, jobs. Code: rehearsal/RainView.tsx; lib/rehearsal/*. API: /api/rehearsal/state, /api/rehearsal/rains, /api/rehearsal/impacts/{lens}.

### Trigger (colour on the Rain button)
- Worked out: IMD level 1 = watch, 2 or 3 within 24 h = act, within 48 h = rehearse, later = watch; a CFM river point within 0.5 m of its warning level = rehearse, at or above = act; a reservoir releasing water = act; a lake 85 % or more and rising = watch; a CFM street-flood bulletin = rehearse, rain bulletin = watch; heavy rain now (15 mm or more in an hour or 64.5 mm since 08:30) = act, 30 mm = watch. Code: trigger.ts.

### Before the next heavy rain (jobs)
- Shows: jobs by kind (clear blocked drains, check drains along flood streets, finish works, pumps, ambulances on the dry side of hospitals, fire cover, traffic diversions, relief schools, warn wards below a release) with the department, place, reason and time before the rain (24 h drains/streets/works, 12 h pumps/hospitals/fire, 6 h diversions/shelters). Sent jobs show done/total.
- Click: Send jobs: tick, one draft per department, Approve and send (sandbox by default). Code: PlanSheet.tsx, playbook.ts, tasks.ts.

### Traffic / Power / Metro (tabs)
- Shows: roads jammed in each heavy rain (police, road accidents, road-damage complaints, flooded roads, underpasses, news), wards that lost power and for how long, trains late and stations closed, with jobs. Power hours and metro delays are generated (rain-day outages and delays are published nowhere), seeded on that rain's own complaints. Click: a place, "Live traffic now" for the live view. Code: impacts.ts, ImpactView.tsx.

## Live traffic

### Live traffic (map panel; Traffic pill)
- Shows: what TomTom sees now: counts Very congested, Congested, Water on road, Accidents, Closed; tabs Act now, Keeps coming, By zone, All live; a card per spot with delay, length, the body that answers for it, records nearby, news and "Send to …"; a trouble spot is sent as one case. "Updated … every 2 min"; "Road colours" toggle.
- Worked out: levels by TomTom's magnitude (very = major delay, congested = moderate). Needs action: water or an accident; very congested with 3+ min delay, a named road, or 2+ reports nearby; congested 5+ min; 3+ reports nearby; a closed road of 300 m or more. Score: very 80, flood 90, accident 85, congested 55, works 30, closed 25, slow 15, plus delay (max 30), reports nearby (max 20), road name 5. Keeps coming = live jams with 2 or more of the district's own reports (traffic, accidents, road damage, flooding) within 250 m (news within 500 m) in 30 days, joined. TomTom has no cameras: speeds come from GPS of phones and vehicles. Officer records are limited to their department when an officer looks.
- Filters: its own zone choice only; does not follow the console's zone, department or period. Code: traffic/TrafficView.tsx, lib/city/traffic.ts. API: GET /api/traffic `counts`, `spots[]`, `clusters[]`, `zones[]`; POST /api/traffic/action.

## Data Studio

### Dashboards / Datasets / Live connectors (tabs)
- Dashboards: the Collector's own dashboards (tiles moved by the grip, resized by the corner, renamed by double-click, "Add from a dataset"; a click opens the dataset).
- Datasets: every file, link and sample added, its dashboards, refresh state and link strength with district incidents; "N files not shown: no Chennai rows".
- Live connectors: sources kept up to date, with Healthy, Late, Failing, Paused, Needs review, last and next run, rows added, proposals and quarantines.
- Code: studio/Studio.tsx. API: /api/collector/studio, /studio/connectors, /studio/dashboards.

### Add data
- Shows: drop a file (CSV, Excel, JSON, PDF …), paste a link (sign-in and refresh options), or a sample (synthetic data on real wards). Seven agents read, clean, map, check the relevance (a table unrelated to Chennai is stopped unless "Use anyway"), link it with the district's incidents, find insights and build the dashboard.

### Dataset page: Insights, Alerts, Data Detective, AI reading, Rows, Data card
- Insights: AI summary (verdict and findings), cards with evidence charts (Backlog, Delay, Turnaround, Service gap, Hotspot, Rising/Falling, Concentration, Anomaly, Linked …), "See the records", "Pin to a dashboard". KPI tiles and charts open the rows behind a mark (Drill). "What we took from it" lists rows used, columns, period and share on the map.
- Alerts: "tell me when …" rules on the dataset. Data Detective: what was cleaned or fixed. AI reading: what each column was read as, with correction. Rows: the data, filter. Data card: source, terms, readiness, checks, change log.
- Worked out: no model computes a number; charts pass fixed rules (a trend needs 3 periods, a map 5 places and 20 % of rows placed, a percentage needs a base of 20).
- Downloads: CSV, Excel with "What changed", a brief PDF (English or Tamil), all asking for the password. Code: lib/studio/*.

### Your files and Jarvis
- The assistant and Jarvis read these datasets too (lib/studio/forAssistants.ts). Datasets shown in the console are the Collector's own; the Environment page no longer shows them.

## Ask District IQ (chatbot)

### Ask District IQ (dialog, Ctrl K)
- Shows: the chatbot: greeting, "Try asking" examples, "Today's insights" cards (and Listen/Play), pinned questions, earlier conversations, a second tab "Asked of Jarvis" (the last 60 questions on this browser), microphone, language Auto/English/Tamil/Tanglish, Stop. "Answering for" chips: Last 90 days, zone or All zones, department or All departments, taluk.
- Worked out: the same assistant as Jarvis. Each question goes to Claude with the conversation, what the console shows and tools that read every record (incidents, news, complaints, police, PWD, hospitals, weather, lakes, air, traffic, prices, contacts, your own files, and what every tile means). Every figure and name in the answer is checked against what was read before it is shown ("N figures checked"); when a request can mean several things it asks back. Answers carry tables or charts, the sources and how it was counted, CSV and image download, pin, read aloud, feedback. "Show on Jarvis" opens the full-screen answer. When Claude is off or out of budget, the older rules answer.
- Filters: takes the console's zone, department and taluk. With no time said it uses the window the console shows for a tile's figure, the whole backlog for a list of open work, and says which. Click on an action: filters the console or opens a page. Code: assistant/AssistantDialog.tsx; lib/brain/*; lib/assistant/*. API: POST /api/collector/assistant/chat, /assistant/insights, /assistant/sessions, /assistant/pins.

### Today's insights (cards, and the orange number on the button)
- Worked out: from the day's briefing: the change on the previous day when 15 % or more, unusual rises, the 4 top attention items, news-only incidents; ranked by priority, recency and the Collector's feedback; 5 at most. Daily and whole district for the Collector; the officer's are their department. API: GET /api/collector/assistant/insights `items[]`.

## Jarvis

### Jarvis bar
- Shows: one slim bar along the bottom of the screen, over the foot of the page (the page does not move or shrink when Jarvis opens or when Type is pressed; since 28 Nov every page scrolls inside the console and the end of its scroll leaves the bar's room): the listening core, what it heard, what it says, its steps, the evidence chip (rows behind the answer), and buttons: Stop talking, Mute, Type (the box opens inside the bar), Questions, Close Jarvis. Jarvis opens by the button, by "Hi Jarvis", or the palette. Its questions with answers are kept (last 60 on this browser).
- Worked out: the same assistant as Ask District IQ, by voice: Claude reads the records with tools, and code checks every figure and name before it is said. What is drawn comes from the tables read. Emails are drafted into an approval tray, never sent without the Collector's tap.
- Code: thunai/Thunai.tsx, Hud.tsx, Stage.tsx; lib/brain/*, lib/thunai/*.

### Jarvis full screen (Stage)
- Shows: the answer as blocks (tiles, case list, chart, trend, map, comparison, brief, news, readings, findings, drafts), with period, area and measure pickers, view switch (chart / table / map), drill, pin, export, save as a workspace, "Show on the main map".

### Cards above the bar
- A mission's plan and progress, and "Jarvis noticed something" (with Tell me, Later, Not about this).

### Earlier questions
- Shows: the questions asked of Jarvis, newest first, with the answers; a click opens the answer's screen again; "See all" opens the chatbot's Asked of Jarvis tab.

## Manu Desk (petition desk: /officer, petition login)

### Upload, reading, verify and approve
- Shows: photos of paper petitions on the left; the reading stages (PaddleOCR, then AI OCR, then a comparison of both); each field beside the photo with flagged doubts; Approve and Delete; "Awaiting verification" and "Approved this week" lists; "came before" check (the same writer or the same problem) with an offer to attach.
- Worked out: nothing goes to a department unapproved. Required: name, ward, department, subject/problem; mobile is checked, Aadhaar-shaped numbers are masked. On approval the petition becomes an incident marked "Manu" (incidents.channels = manu) with a deadline, and a text to the citizen is prepared (test SMS to the team inbox by default).
- Where: on the Collector's console it shows as a Manu complaint in "Reported by", with the scan in the incident popup. Code: components/manu/*, lib/manu/*.

## Officer console (department officer)

### Overview
- Shows: Severe events, Open incidents, Waiting for your approval, "Resolved, reported in …", the department's map with Ask the Map (locked to the department), department snapshot, "By severity | My work" card, department news, and a "Before rain" strip when the Collector sent rain jobs. Filters: period, zone, taluk. The department is fixed by the account.
- Same incident rules as the Collector's console. Code: components/officer/*; lib/officer/*. API: /api/officer/*.

### Work & insights
- Shows: "What needs you now" (new, returned, past deadline, due in 24 h, oldest, sent, and findings from data sources), "Grievances" board: New → In action → Sent to Collector → Verified (severe) or closed by the department with remarks and photos; department's record, complaint types, trends, "Collector Feedback", and cards per data source (weather, lakes, police, hospitals, works, air, markets) with "Details". A card covering the whole district is marked "District-wide".
- Ask District IQ answers for this department only. Bell = feedback from the Collector.

## Citizen site

### Home
- Shows: greeting, Total filed, In progress, Resolved, recent three complaints with their progress, quick actions (File a complaint, Track status, My profile).

### File a complaint
- Shows: category, description, photo, location or ward; limits on number; "Complaint registered" with a number and what happens next.

### Track complaint / Track a Manu
- Shows: the journey of each complaint (received, in action, with the Collector, done), photos of the work done, and the map; a public page tracks a Manu by its number.

### Log in / register / profile
- Shows: email and password sign-in, sign-up, forgotten password, contact details, language and theme.
