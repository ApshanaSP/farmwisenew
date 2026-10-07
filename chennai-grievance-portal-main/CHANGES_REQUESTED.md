# Change requests — round 1 (2026-09-28)

Status legend: ✅ done · ⚠️ done, with a caveat

## Login / Create account pages
1. ✅ Site renamed **District IQ — Chennai Intelligent District Governance Platform** (new logo, header, page titles).
2. ✅ "Greater Chennai Corporation" removed from the login, sign-up, header, footer and logo.
3. ✅ Nothing citizen-specific: the login serves citizens, department officers and the Collector (`AuthShell.tsx`).
4. ✅ Footer now reads "District IQ · Chennai Intelligent District Governance Platform · Helpline 1913".
5. ✅ No page scroll: both pages fit one screen (checked at 1366×768 and 1920×1080).
6. ✅ Tighter premium layout: 15px inputs, 48px fields, compact password rules.

## Collector dashboard
7. ✅ Export → **PDF report** (jsPDF, vector charts): KPIs with change, key insights, department/zone bars, severity mix, trend,
   environment, the verification queue, ongoing incidents grouped by priority with reasons, open complaints, and news sent to departments. CSV kept.
8. ✅ Satellite map (Leaflet + Esri World Imagery) with ward heat shading, zone outlines, pins and stations; zooms to the selected zone.
9. ✅ Today's Briefing "See more" → wide three-column news grid with 16px headlines.
10. ✅ My Tasks: only citizen complaints where the officer reported action and asked for verification (`awaiting_collector`),
    showing the officer's note, with Verify and Send back.
11. ✅ "Recent incidents" → **Severity-based incidents**: Severe / High / Medium / Low tabs with counts and a readable card per incident.
12. ✅ Incident pop-up is view-only: no action plan, no buttons, no priority score. Plain-language "What happened" and
    "Why it needs attention", key facts, and who is responsible.
13. ⚠️ News that is a civic complaint is routed to the department officer (`district_intel_ops.dept_assignments`) and left out
    of the incident list. The officer dashboard is still "coming soon", so the routed items appear on page 2 and in the PDF.
14. ✅ Timeline shows only the reports merged into the incident (news outlets, complaints, police/PWD records), each at its own time, grouped by day.
15. ✅ Dedup checked: every incident's source list matches its linked records (0 mismatches over 35k incidents). Two UI bugs fixed:
    the incident table dropped sources, and "outlets" counted articles instead of publishers. One source-count component is now used everywhere.
16. ✅ Rainfall / air quality / reservoir cards: level pill (LOW / MODERATE / HIGH), trend arrow vs. the previous reading,
    a colour scale with a marker, and a one-line summary.
17. ✅ No scrolling on desktop: two pages (1 Overview · 2 Environment) with a pager (PageUp/PageDown also work).
18. ✅ Sidebar replaced by an 84px icon rail.
19. ✅ 48 officials from the GCC "Who's who" page stored in `district_intel_ops.official_contacts`
    (`npm run seed:contacts`) and shown in the snapshot, the contacts dialog and the incident pop-up.

# Round 3 (2026-09-28/29): gaps from the Task 6 brief

| # | Item | What was built |
|---|---|---|
| 3 | Mandi prices | AGMARKNET public API (no CAPTCHA route): daily prices + 8-week trend for Tamil Nadu and the markets around Chennai; card on the Environment & markets page |
| 4 | Collection with refresh, errors, login sessions | Sources window: status, newest data, last 5 runs, Run now / Refresh / Pause; retries with backoff; form, basic and token sign-in with session reuse and automatic re-login |
| 6 | Place names to the hierarchy | Every incident shows its taluk; unplaced incidents and uncertain links listed under "Locations needing review"; added items are resolved to area, ward, zone, taluk |
| 9 | Category trends | Trends page: 12-week and 6-month lines per category |
| 10 | Written briefing | Briefing page: generated from the store by rules (no language model), each item with why, evidence, next step; full text and download |
| 11 | Department follow-ups | Briefing page: per department open / late / to-verify counts and proposed next steps |
| 13 | Map drill-down | Zones / Taluks toggle; click a taluk to filter (village boundaries are not in the supplied data) |
| 15 | Cross-filtering | Category from the trend chart and taluk from the ranking or map filter every panel; selecting an incident flies the map to it |
| 16 | Confidence | Pop-up shows confidence with an explanation and each merged report's link strength |
| 17 | Audit history | Audit log tab (decisions, source changes, OCR uploads, workspaces) |
| 21 | News-only view | Briefing page: "In the news, not in department records", with a 2+ outlets filter |
| 22 | Taluk ranking | Trends page: unresolved incidents by taluk, last 30 days, change in reports vs the 30 days before |
| 23 | Patterns | Trends page: unusual spikes and recurring hotspots |
| 24 | OCR | Upload a newspaper page; read in the browser (English/Tamil), split into articles, classified and placed |
| 25 | Saved workspaces | Save named versions with a frozen briefing; reopen any version |
| 26 | Add a source by link | Add RSS / web page / JSON with optional login; read on a schedule and classified |
| 27 | Customize | Choose pages, Overview panels and headline cards |

Setup on another machine: `npm run setup:ops` then `npm run seed:contacts`.

# Round 4 (2026-09-29): added sources, market-wise mandi prices, developing stories

| # | Request | What was built |
|---|---|---|
| 1 | Today's Briefing: "From added sources" tab | Page 1 briefing card has News / From added sources tabs (last 7 days at least, follows zone, department, category and taluk). "See more" opens every item with a civic-only filter |
| 2 | Map pins for added items with a place | Violet diamond pins (lighter when not a civic issue) with their own legend toggle. Places come from the news monitor's gazetteer (localities with coordinates and Tamil names, now exported by `scripts/export-reference.py`) plus the GCC area list; older items are placed again automatically |
| 3 | Page 2 briefing: "From added sources" section; open each item and its source link | Short section under "Needs your attention" (also in Full text / Download and the PDF). Every item opens a viewer: text, how it was classified and placed (with the matched words), "Open the source link", "Show on the map" |
| 4 | Mandi prices, Chennai market-wise | New "Chennai markets" view: each Uzhavar Sandhai market (Anna Nagar, K.K. Nagar, Nanganallur, Ambattur; Medavakkam, Pallavaram, Kundrathur, Guduvancheri) side by side, cheapest green and dearest red, your zone's market highlighted; click a market for its full price list with change and 14-day trend. From AGMARKNET's open state market-wise daily report (`district_intel_ops.mandi_market_prices`, last 14 days). Koyambedu does not report to AGMARKNET |
| 5 | Replace the news timeline: cluster the same event as it continues, show what happened time-wise | "Developing stories" card and full view (`src/lib/collector/threads.ts`): reports about one event are threaded across outlets, stories and days; each report is labelled (first report, arrest, death, court, probe, protest, action, warning, completed) and shown by day. Rules only, explained in the view |

Setup on another machine: `npm run setup:ops` (adds the new table and columns), `python scripts/export-reference.py`, then run AGMARKNET from Data sources.

# Round 5 (2026-09-29): taluk filter, location checks, readable briefing and trends, scrollable mandi table

| # | Request | What was done |
|---|---|---|
| 1 | Taluk dropdown like the zone one | "All taluks" dropdown next to Zone and Department (the separate taluk chip was removed). Filters every panel |
| 2 | Check taluk and event locations (Egmore showed under Mylapore) | New test `npm run validate:locations`. Found and fixed: (a) the pipeline kept a source's own taluk label instead of the ward's, 583 incidents disagreed with their ward, now 0 (`district_intel/dintel/geolocate.py`); (b) the grievance generator put addresses of large GCC areas (EGMORE spans 26 wards) in far-away wards, 41.5% of grievances were >2.5 km from the locality in their address, now 6.5%; every "Egmore" address is now in Egmore taluk. Known gap: Kolathur taluk is not coded by any source, so it has almost no wards |
| 3 | Collector's Briefing hard to read, cut off, small fonts | Rebuilt: four headline numbers, conditions and prices on one line, then numbered cards with "Why it matters" and a highlighted "Next step", larger type (15-17px); the card scrolls, nothing is clipped |
| 4 | Grievance descriptions look generated (many identical) | Generator writes each complaint from optional parts (who is writing, what exactly they see, when, how many affected) in English, Tamil and Tanglish; fixed a bug that fed 8,110 older synthetic rows into the pipeline twice. Distinct descriptions: about 85% -> 98.4% |
| 5 | Incident categories over time hard to understand | Replaced the multi-line chart with "Which problems are rising?": one row per category with total, a bar per week or month, last week, and a rise/fall badge; a sentence names the biggest rise and fall |
| 6 | Mandi prices do not scroll | Tables scroll inside the card with a fixed header row and commodity column; all items are listed |

# Round 6 (2026-09-29): daily data, clearer reasons, fewer tasks, page order, spikes and hotspots, prices

| # | Request | What was done |
|---|---|---|
| 1 | Collect all data once a day | Task Scheduler job `DistrictIntel` now runs daily at 6:00 AM (was every 30 min); every pipeline feed in `district_intel/config.yaml` is due every 1440 min, with 30 min slack so the 6:00 run is never skipped; added sources and AGMARKNET default to daily and run from 6:00 AM (`runDueSources`). The top bar shows "Updated daily, 6:00 AM" and the data time |
| 2 | "What happened" / "Why it needs attention" confusing; show reasons only where needed | `explain()` rewritten: one plain sentence (cause and place), short facts (people affected, road blocked, near a school...), and at most 3 reasons in plain words. Reasons appear only when the incident is open and severe/high, or has a strong signal (well past deadline, several departments, only in the news, deaths). Otherwise the pop-up says "No action needed from you". The severity card marks and lists first only the incidents that need the Collector |
| 3 | Collector need not verify every task | My Tasks keeps only closures that are severe/high, have 3+ complaints, involve several departments, were in the news, or (medium) took over twice their deadline: 23 of 96. Each task shows why it is there; the rest are counted as left to department heads |
| 4 | Developing stories on page 2 or 3 | Moved to page 2 (Briefing), next to Department follow-ups. "In the news, not in department records" opens from the briefing's "seen only in the news" chip |
| 5 | Page 4 needs no area or department filter | Environment & markets page hides the filters and always shows the whole district (station pickers per card) |
| 6 | Mandi price table clearer | Full-width card; Chennai city and suburb markets grouped under headers; cheapest/dearest as green/red pills with a legend; search box; "since the last report" movers on top; average and change columns |
| 7 | "Which problems are rising?" and insights unclear | Three summary cards (rising fastest, falling fastest, most reported); rows sorted rising first with Rising/Steady/Falling, last 4 weeks vs the 4 before, and the zone adding the most reports |
| 8 | Click an unusual spike or recurring hotspot to see its details | New detail view (`/api/collector/pattern`): what happened in plain words, day-by-day or month-by-month bars, places, suggested next step, every incident behind it, and "Show only this on the dashboard". Hotspot incidents come from `incidents.hotspot_id` |
| 9 | Tiles in reading order; filters in one place | Page 1 reads left to right: what is urgent (severity), where (map and snapshot), what to act on (My Tasks, then news). Period, zone, taluk and department sit together in one filter bar on pages 1 to 3 |
| 10 | Why only 4/8 feeds live | News, IMD, CPCB and CFM had not been fetched since 28 Sep 2 PM: the scheduled task had Windows' default "stop if the computer switches to battery", so every run on battery was killed mid-way (`^C` / "window-CLOSE event" in refresh.log). The task now runs on battery, catches up if 6:00 AM was missed, and stops after 2 h. The four feeds were refreshed (8/8 live). Feeds that arrive with some endpoints blocked (IMD, CPCB) count as live and show "Partial" with the reason; daily feeds turn stale after 36 h |

# Round 7 (2026-09-30): page 1 layout, Trends page without filters

| # | Request | What was done |
|---|---|---|
| 1 | Map hard to use; District Snapshot takes too much space | Map runs the full height on the left with nothing over it; its legend moved under the map as toggle chips. District Snapshot is one horizontal strip on the right |
| 2 | Today's Briefing too small | Severity, My Tasks and Today's Briefing sit side by side under the snapshot, full height; the briefing column is the widest of the three. Headers shortened; task cards made compact (officer's note on one line, reasons as chips, Send back and Verify) so three tasks show at once |
| 3 | "Which problems are rising?" still unclear | Each problem shows the two numbers being compared as two bars (grey = 4 weeks before, blue/red/green = last 4 weeks), the change in words ("22% more", "About the same"), and the zone with the most new reports. One sentence on top names what is rising and falling. List and detail use the same full Monday-to-Sunday weeks, so their numbers match |
| 4 | Clicking on the Trends page must not filter anything | Page 3 is district-wide and has no filter bar. A problem opens its detail (weekly bars, zones adding reports, incidents); a taluk opens its open incidents; spikes and hotspots open their details. None of these change the dashboard's filters, and the "Show only this" button was removed |
| 5 | Spikes, hotspots and locations needing review stay constant | They are loaded district-wide, whatever filters are set on pages 1 and 2 |


# Round 8 (2026-09-30): explainable page 1, one count per department, action-list export, daily data checks

| # | Request | What was done |
|---|---|---|
| 1 | Make the dashboard clearly explainable | "? How to read" button on every page opens a guide: what each card shows, what its numbers count, what to do, the words used (incident, complaint, severity, past deadline, needs you) and where the data comes from, with today's collection status. Headline tiles explain what they count on hover |
| 2 | Department filter shows incident counts twice | With a department selected, "Open complaints" and "Ongoing incidents" become one "Open incidents" tile with the complaint count beside the label; the selected department in the dropdown no longer repeats its open count |
| 3 | "In the news, not in department records" as a tile in the news card | Moved out of the snapshot strip into Today's Briefing as an "Only in news" tab, each item marked with the department it belongs to; See more opens the full list |
| 4 | Clear, easy UI | Filters, help and pages fit one header row (the pager names the page; "Clear" instead of "Clear filters"); snapshot subtitles say "Daily · last 24 hours" etc.; period buttons explain their window |
| 5 | Export: not every incident | CSV is now an action list: incidents that need the Collector, then closed work to check, one row each with the reason (daily: 65 rows instead of every open incident). PDF lists the 10 most urgent and counts the rest; 8 closures; 5 news-only items (weekly report: 3 pages) |
| 6 | Last 24 hours: daily / weekly / monthly / quarterly | Export dialog has its own Daily / Weekly / Monthly / Quarterly choice; the PDF is titled "Collector's Daily/Weekly/Monthly/Quarterly Report" |
| 7 | Data must be fetched properly, once a day; did it run this morning? | It did not run at 6:00 AM on 30 Sep: the laptop was asleep until 9:08 AM and the first run was 12:05 PM. CPCB and grievance then failed (CPCB live map error; a run cut off by sleep). `run_pipeline.py refresh` now tries each feed up to 3 times (60 s apart, 30 min per try), logs the date of each run and records `_last_collection`; the 21:00 run collected both (8/8 today). The DistrictIntel task wakes the computer (WakeToRun) and may run 3 h; the leftover one-time DistrictIntelCpcb task was disabled. The top bar shows "Collected today, <time>" or which feeds are still missing |

# Round 9 (2026-10-01): Daily means today, news-only card on page 2, tidier Trends

| # | Request | What was done |
|---|---|---|
| 1 | Daily must show only today's data on every page, not "2 days ago" | Daily is now the calendar day of the latest data, from midnight (`periodWindow`/`periodSince` in intel.ts), compared with yesterday. Pages 1 and 2 follow it everywhere: headline numbers, map, severity, My Tasks (closures reported today), bell, news, added-source items (were at least 7 days), developing stories (those with a report today), the news-only list (was at least 7 days) and the briefing. Weekly/monthly/quarterly stay the last 7/30/90 days. Pages 3 and 4 are multi-week by design and unchanged |
| 2 | Remove "How to read"; Today's Briefing as it was | The help button and guide are removed. Today's Briefing is back to News / From added sources |
| 3 | Page 2: a separate tile for news not in department data | New card "News, no dept record" on the Briefing page: each item with place, time and the department it belongs to; See all opens the full list |
| 4 | Page 3: remove descriptions (Unresolved by taluk, Locations needing review) | Both description paragraphs and the review summary lines were removed |
| 5 | Locations needing review shows 96 but only one visible | The description took the card's space and the list clipped instead of scrolling, and only 30 were loaded. All of them now load and the list scrolls (96 of 96) |

# Round 10 (2026-10-01): Department Officer dashboards merged, connected to the Collector

| # | Request | What was done |
|---|---|---|
| 1 | Merge only the department officer dashboard from the zip, change nothing else | Taken from the zip: `src/app/officer`, `src/app/api/officer/*`, `src/components/officer/*`, `src/lib/officer/*`, migration 011, `setup-officer-ops.js`, `seed-officers.js`. Not taken: the zip's own data refresh job (`daily-refresh.js`, `refresh.ts`, the `dept_*` tables), its sample store generator, and its older copies of the Collector console files |
| 2 | Data fetched exactly as before (unified data only) | The officer console reads only `district_intel` / `district_intel_ops`, loaded by the pipeline's daily 6:00 AM run. Department insights were rewritten to use the store (events, observations, pwd_works, hotspots, market prices) instead of the zip's raw-file tables |
| 3 | Connect task, verification, send to Collector | Officer: Approve → Complete & send (remarks + photos). Collector: the report appears first in My Tasks and in "Awaiting your verification" with the officer's remarks; the incident pop-up shows the report and photos; Verify or Send back (existing buttons). Sent back → officer sees "Returned" with the note and resends. Tested end to end |
| 4 | Department data made into insights (police, PWD, hospital, agri, ...) | "Department insights" page per department (see README section 13). There is no agriculture department in the store, so market prices are on District Revenue |
| 5 | Neat, clear, accessible for the Collector; tiles like the Collector's department filter | Collector opens any department's console read-only from the department snapshot ("Department console"), switches department from the banner, and verifies or sends back from there. Tiles add the Collector's "Severe or high, open" and "Past deadline, open" (with the busiest zone); the department head's contact is in the account menu |

# Round 11 (2026-10-01): Ask District IQ merged from the zip, one-page department console

| # | Request | What was done |
|---|---|---|
| 1 | Merge only the chatbot from the zip, change nothing else | Taken from `farmwiseai-main.zip`: `src/lib/assistant/*`, `src/lib/ai/*`, `src/app/api/collector/assistant/*`, `src/components/collector/app/assistant/*`, `eval/`, `vitest.config.ts`, `scripts/build-embeddings.cjs`, `create-assistant-ro-user.sql`, `generate-assistant-catalog.js`, the assistant's tables in `setup-intel-ops.js`, its npm packages and `.env.example` block. Hooked in the way the zip does it: the new pop-up replaces the old rule-based "Ask" panel (launcher with today's insight count, Ctrl+K), three exports added (`scopeWhere`, `placeNames`, `categoryWords`) and `overview(..., { route: false })` for read-only callers. Not taken: everything else in the zip (its collectors, pipeline, older console files, SSRF and crypto changes) |
| 2 | Data fetched as before (unified data only) | The assistant reads only `district_intel` / `district_intel_ops` through the console's own functions; it fetches nothing |
| 3 | Chatbot on the Collector and the department officer dashboards | Same pop-up on both (`assistant/host.ts`). An officer's answers are locked to their department on the server (`access.ts`, `lockDept`): department rankings become the department's own figures, other departments' incidents are not opened, insights are the department's, no department filter action |
| 4 | No navigation to other departments | The department switcher is gone from the officer console (also in the Collector's read-only view; the Collector picks a department on the Collector console) |
| 5 | Each department its own username and password; show who is logged in | `npm run seed:officers --reset-passwords` gave each of the 25 `officer.<code>@chennai.gov.in` accounts its own password, listed in the git-ignored `officer-accounts.local.csv`. The top bar shows "Logged in as officer.<code>" |
| 6 | New layout; no separate Grievances / Department insights pages; informative for the officer | One scrolling page: seven tiles (adds *Due in 24 hours*), the grievance board beside **What needs you now** (approvals, returned work, late and due-soon, the oldest, waiting for the Collector, the first finding of each source), map / news / Collector feedback, insight tiles (Details opens the full source), trends |
| 7 | Insights useful for the officer, not the same for everyone | New *Complaint patterns* tile for every department (rising and falling types, busiest wards, how many reached the news); rain and IMD warnings added for Roads, Electrical, SWM (and air quality), Parks, Bridges (and lakes), TANGEDCO |

# Round 12 (2026-10-01): Department console laid out like the Collector console

| # | Request | What was done |
|---|---|---|
| 1 | Officer dashboard like the Collector dashboard with the department filter, plus department details | Rebuilt on the Collector console's layout and classes: fits the window (no scroll), period / zone / taluk filters with the department fixed, pager with 4 pages. Page 1 is the Collector's own overview filtered to the department (same KPIs with sparklines, map, department snapshot, By severity, Today's Briefing) with **My Work** (approve / complete & send) in place of the Collector's My Tasks. Page 2 grievance board + What needs you now + Collector feedback; page 3 department data cards; page 4 trends |
| 2 | No navigation between the consoles; Collector signs in separately | `/officer` is for department officers only (middleware and API guard); the Collector's "Department console" link and the Collector view of the officer console (department switcher, read-only mode) are removed |
| 3 | Chatbot "should use the API I have given" | The chatbot is wired to the zip's provider (Amazon Bedrock, or Groq/OpenAI). No key was found in the portal `.env` or in the zip, so it still answers "Without AI" by rules until a key is added |
| 4 | Data always unified | Every figure comes from `district_intel` / `district_intel_ops`; page 1 calls the Collector console's `overview()` |

# Round 13 (2026-10-01): one Insights page; AI key for the demo

| # | Request | What was done |
|---|---|---|
| 1 | Department data and Trends pages not clear; make one page with meaningful insights | Pages 3 and 4 merged into **Insights** (`InsightsPage.tsx`): work-record figures strip, "What the data says" (plain findings, the main one of each source first, each opens its data), trend, complaint types against the previous period with rise/fall chips, open by area, and the department's district data as compact rows with Details. Fits one screen |
| 2 | Chatbot key changes every 3 hours; use the key given at the demo | `npm run ai:key`: paste the AWS portal's key block (any format) or a Groq key; it writes `.env` and tests the key. The app re-reads keys on the next question, no restart |

# Round 14 (2026-10-01): pages 2 and 3 merged into one "Work & insights" page

| # | Request | What was done |
|---|---|---|
| 1 | Pages 2 and 3 repeat each other; one page with the insights the officer mainly needs, clearer and easier | Two pages now: Overview and **Work & insights**. Page 2: work-record figures; the grievance board (4 clear columns: grievance with place and complaints, severity, reported, next step; tabs on their own row); What needs you now (the single list of things to act on, plus the main finding of each data source); complaint types against the previous period; the department's district data (Collector feedback when there is none). Dropped as repeats: "What the data says" (same findings as What needs you now), Trend and Open by zone (on page 1's map and snapshot) |

# Round 15 (2026-10-04): page 2 rebuilt with nothing repeated; duplicates removed across the console

| # | Request | What was done |
|---|---|---|
| 1 | Page 2 is clumsy: clean, easy to understand, no scrolling | `BriefingBook.tsx` rebuilt (classes `pb-*`): five cards in three columns that fit the screen. Lists show only the rows that fit whole (`useFit` in `lib.tsx`), with *See all* for the rest, so nothing scrolls and no row is cut |
| 2 | Pages repeat the same details and options; remove redundant tiles | Page 2 now shows only what no other page has: **Summary** (district status, the period in words, IMD warning, oldest open complaint), **What each department received**, **Health and safety** (hospitals over 85% full, disease reports this week, crime up or down), **Stories still developing**, **Only in the news**. Removed from page 2 because another page has them: the severe incident list and the KPI numbers (page 1), Verify/Overdue tiles (My Tasks, Snapshot), the news feed (page 1), Spikes (page 3), the masthead date and sources line (top bar), print/download/save (Export, Workspace). Page 1: the Snapshot lost "Severe or high, still open" (= the severity card's Severe + High) and "Most open work (taluk)" (= page 3's taluk table); the severity card has one *See all* instead of two. Top bar: "feeds live" and "Collected" were two chips opening the same dialog, now one |
| 3 | "Today in brief" and "In the news": what are they? Clear headings | "Today in brief" (which only restated the numbers) is now **Summary · last 24 hours** (follows the period), written from the store: reported and the change, injuries, the busiest zone and what it was about, what citizens complained about most. "In the news" is split into **Stories still developing** and **Only in the news**. Page 1's "Today's Briefing" card is now **Latest news**, so it no longer clashes with the Briefing page |
| 4 | Ask District IQ as before | The floating button is back on both consoles, unchanged |
| 5 | Premium look | Card headers on every page have a tinted icon chip; panels have a faint top light. Light theme covered |

# Round 16 (2026-10-04): no Health and safety card; real developing stories; Chennai district only; smaller map markers

| # | Request | What was done |
|---|---|---|
| 1 | Health and safety card not needed | Removed from page 2. Page 2 is now Summary + Only in the news, What each department received, Stories still developing |
| 2 | Developing stories show the same news again | `threads.ts` (RULES 10): a story is shown only when it developed (a later report is a new kind of step: protest after a collapse, court case after a launch, arrest after a murder) or it kept being reported for more than a day. The same event written up by several outlets within hours is no longer a "developing story" (15 stories became 7). Each story is drawn as its timeline with dates |
| 3 | "Locations needing review" has Nellai news; only Chennai district | Found in five places (review list, Only in the news, Latest news, By severity, map). Cause: the pipeline's district rule knew other districts only in English. `district_intel/dintel/loaders/news.py` `outside_headline()`: a headline that places its event outside Chennai district (English "in/near/at X" or "X:", Tamil locative "நெல்லையில்", 60+ places), names it before any Chennai anchor, and does nothing in Chennai, is not Chennai news, so it never becomes an incident. 27 of 9,150 Chennai articles move out, all led by another place; test `tests/test_outside_district.py`. The same change is in the hourly build repo (farmwisenew-dataload), waiting to be pushed |
| 4 | Map circles too big | Markers are 8-11 px and grow with the zoom (`--pz`); zone and taluk names never overlap (a name that would cover another waits for a closer zoom); added-source and station markers are smaller |
| 5 | The hourly build ran an older copy of the code; do the switch | The farmwisenew-dataload job no longer keeps a copy: every run takes the pipeline, collectors and generators from the main repo (code only; data from the saved state), so a fix pushed to main is live on the next hourly run and your friend's newer pipeline now builds the website's data. Optional secrets `GROQ_API_KEY` / `GEMINI_API_KEY` in the dataload repo turn on AI news labelling and the AI briefing; without them the rules are used. Tested locally on the job's real data before pushing (build 155 s, 33 tables; the Nellai items marked outside Chennai, no incidents) |

# Round 17 (2026-10-04): one look for every portal; light/dark everywhere

| # | Asked | Done |
|---|---|---|
| 1 | Department officer console has no light theme | Sun/moon button in the officer top bar, the same as the Collector's (the officer CSS already used the shared tokens). The choice is saved as `diq-theme` and shared by every page |
| 2 | Citizen portal should look like the Collector portal | All Tailwind colours now come from `src/app/theme.css` (generated by `node scripts/gen-portal-theme.js` from the Collector tokens): dark by default, light under `html[data-theme="light"]`, set before first paint in `layout.tsx`. New Collector-style pieces in `globals.css`: `diq-bg` (glow + grid backdrop), `diq-top` top bar, `diq-tbtn`, `diq-panel`, `diq-kpi` / `diq-ic` tiles. Header = Collector top bar (uppercase brand, segmented nav with Overview, helpline, theme button, round avatar). Citizen home = page head + 3 KPI tiles + Recent complaints and Quick actions panels. File, track and profile pages pick up the same panels, buttons and colours |
| 3 | Login page should match | Login, create account and forgot password: Collector top bar with theme button, the night backdrop, an indigo brand panel and gradient buttons; works in both themes |

# Round 18 (2026-10-04): AI briefing for the Collector, locations that really need review, everything checked, premium look

| # | Asked | Done |
|---|---|---|
| 1 | AI briefing more efficient and easy for the Collector | Page 2 (`BriefingBook.tsx`, classes `bb-*`) rebuilt as a brief read in a minute. **Key points**: the pipeline's AI note split into numbered points, shown in full (it was cut off after five lines), numbers highlighted; EN / தமிழ் and Listen kept; the same points by rules when there is no AI note. Under it the status pill (Alert · 5 deaths), the **critical incidents** the note talks about as one-click links, the IMD warning and the oldest open complaint, and when the AI wrote it. **Departments**: one row each with the count, deaths and severe badges and a short line ("Theft, protests, road accidents · Teynampet, Adyar"); a click opens the full note and the top incidents in place, with *All N reports*. Developing stories and Only in the news on the right. Nothing repeats another page |
| 2 | "Locations needing review" should list only incidents without a proper location; make the algorithm work properly | New `src/lib/collector/locreview.ts` (tests `locreview.test.ts`). An open incident with no zone is now listed only when its place is really unknown: a specific event (murder, accident, fire, a complaint about one road) reported only as "in Chennai". Left out, and counted in one line under the title: IMD warnings for the whole district and city-wide news (dengue totals, power-cut schedules, reservoir storage, drives, round-ups); incidents whose own map point is within 2.5 km of a ward (zone found), or whose place text or headline names a Chennai place, in English or Tamil, or a landmark (Broadway, பெரியமேடு = Periamet, Chennai airport, Secretariat...); and places outside Chennai district (Mangadu, Tambaram, Tiruttani, Pattabiram...). The same story filed as two incidents is one row. On today's data: 137 listed before, 30 now (88 city-wide, 14 placed from the report, 7 outside Chennai). The Tamil place matcher (`nlp.ts`) now also matches inflected names (பட்டினப்பாக்கத்தில் = Pattinapakkam) |
| 3 | Check every function works efficiently and properly | Two automated checks (all GET APIs for every period and filter, 88 calls; and a 78-step click-through of every page, filter, dialog and list in a browser): no errors. Fixed what they found: **"Past deadline, still open" (13) opened a list of all 185 incidents** (`overdue` was missing from the list API's allowed statuses); **Ongoing incidents** counted 9 news complaints sent to departments that its list and the severity card leave out (185 vs 176); **My Tasks** said 8 but *See all* showed 13 (the list ignored the period; both now use the last update in the period); the list dialog had no "Last 30 days" choice for lists opened from the taluk table. Every count on the dashboard now equals the list it opens |
| 4 | Speed | *Developing stories* were re-threaded on almost every request (cache keyed on the clock): now once per data build, and the threading compares a report only with stories that share a word with it and are still within reach (a month: about 8 s → 1.4 s, same 240 stories). The Briefing, Trends and Environment pages each ask only for their own part of the insights (`?part=`), and a quarter's news list sends the newest 250 stories (was 1 MB). **Ask District IQ froze the site**: its meaning-search model ran on the web server's main thread and restarted every 30 s, so while it was open a 75 ms request took up to 15 s. The model now runs on a worker thread (`scripts/embed-worker.mjs`), updates once per data build, and reads its 80 MB index without blocking: requests stay at about 0.1 s |
| 5 | Premium, professional look with fewer clashing colours | New tokens (`tokens.css`) and a final style layer (`collector.css`, "PREMIUM LAYER"): deep navy with a soft indigo glow, panels with depth, an indigo-to-blue gradient for the primary action and the selected tab, Inter font. Colour carries meaning with four hues only: indigo (information, selection), rose (severe, deaths), amber (high, warnings), emerald (verified, good). KPI tiles carry their own colour, card icons sit in tinted badges, severity tabs light up in their colour; map shading indigo to rose; light theme matches. The officer console uses the same styles |

# Round 19 (2026-10-06): news grouped and readable in the console, real reservoirs, real-life wording, places from the reports

| # | Asked | Done |
|---|---|---|
| 1 | News that is not a grievance should be grouped like the rest | `src/lib/collector/newsrel.ts`: the same event from many outlets, in Tamil and English (Tamil read through its English translation) and filed by the pipeline as several incidents, is one story; power-cut notices, rain updates and dengue counts are one story each. On 6 Oct, 80 stories became 52 (the nurses' protest: 20 reports from 15 outlets, one story). Cards say "+N similar reports" |
| 2 | Cannot see the full news | A news-only story opens inside the console (`NewsPreview.tsx`): the report's full text when the outlet's page could be read (else its summary and a link), the Tamil headline with its English translation, what the AI read (place, people, casualties, status), and every outlet's report of the story beside it |
| 3 | Only news relevant to the Collector | Left out: company launches and contracts, real estate, courses and admissions, films and sport, prices, leaders' statements about other leaders, and news from other districts or states, even when the pipeline linked it to an incident (Tiruttani murder, Ulundurpet bus crash, Haryana, Mettur). Also applied to "Only in the news" |
| 4 | Stories still developing shows one | Compact previews (title, steps as chips, reports and outlets): three fit. Stories are threaded on English headlines, so Tamil and English reports join |
| 5 | Spikes and hotspots read generated; make it look like real life everywhere | Every incident titled "<category> – <street>" gets a headline from its own reports (`incidents.headline`, `derive.ts`): the police report ("A cab hit a two-wheeler on ..."), the citizen's own words, the PWD field note. Used on every list, the pop-up, the briefing, the officer console and Ask District IQ (`TITLE` in `collector/db.ts`). Spikes read "4 road accidents in Teynampet on Mon 5 Oct" with the localities and the newest report quoted; hotspots "Thefts and snatchings near Egmore" with the latest report |
| 6 | Locations needing review: place is in the headline, and map it | Landmarks first (Central Station, Anna Salai, Fort station, Chennai Port, Rajarathinam Stadium, GH), then the headline, its English translation, the AI's place, another outlet's report, the article's opening, and other reports of the same event. Those incidents get a ward, zone and point, so they are on the map and in the zone counts; the card has a "Placed from the report" tab with Show on map. On 6 Oct: 35 unknown -> 28; 16 placed |
| 7 | Reservoir 99% looks generated; make it real time | The simulated PWD lakes are replaced by Chennai Metro Water's published storage of the six reservoirs (`lakes.ts`, cmwssb.tn.gov.in/lake-level, read hourly, 14 days of history): 36.7% full on 6 Oct (4,857 of 13,222 mcft; 9,355 mcft a year ago). Also in the store (observations, signals), so the briefing and Ask District IQ use the same figures; the simulated "lake nearly full" alerts are gone |
| 8 | Remove "Add a source" (a teammate is building it) | Removed from the top bar, the command palette, the Data sources dialog and empty states. The onboarding code is left in place for the teammate |

Store steps (`onBuild` in `lib/aws/store.ts`, `lib/collector/derive.ts`) run on each build after it loads on this server; they change only the in-memory build. Tests: `newsrel.test.ts`, `derive.test.ts`, `lakes.test.ts`.

# Round 20 (2026-10-06): AI "Take action" on severe incidents, a tidier pop-up, severe-only verification with evidence, news from news media, grouped incidents

| # | Asked | Done |
|---|---|---|
| 1 | For severe incidents, an agentic AI that takes action: drafts an email and sends it to the department officer | **Take action** on every severe row of By severity and in a severe incident's pop-up (`TakeAction.tsx`, `lib/collector/actionmail.ts`, `GET/POST /api/collector/incidents/[id]/action`). The agent reads the incident and every report it was merged from, finds the department's officer account (and the department head from the GCC directory, for reference), and drafts the instruction with AI from those facts and the category's standard steps (`ref_categories.playbook`); without a working model a template says the same. The Collector reads, may edit, and approves; nothing is sent before. Delivery is safe by rule: `EMAIL_MODE=sandbox` (default) sends only to `EMAIL_SANDBOX_TO`; `live` only to `EMAIL_LIVE_ALLOWLIST`; without SMTP nothing is emailed. Whatever the email does, the instruction reaches the officer console on that grievance ("From the Collector"). Kept in `outbound_emails`, a follow-up due in 24 h in `followups`, and the audit log. Severe only, checked on the server |
| 2 | Remove the key facts unless needed; the pop-up looks clumsy | Pop-up rebuilt in two columns (`Detail.tsx`, `action.css`): what happened, why it needs you, the instruction sent, the department's report with photos, then how it unfolded; the rail has who reported it, the incidents merged into it, and who is responsible. The Key facts grid and the fact chips are gone; the deadline sits in the header line |
| 3 | My Tasks shows no remark, work or photo from the officer; verification only for severe events, the rest by the department | My Tasks lists **severe** closures only, each with the department's remarks and photo thumbnails. A task with no report from the officer console says so and offers **Ask for report** (Take action) instead of Verify. The officer console: a severe grievance is completed with remarks and photos and **sent to the Collector**; any other is **closed by the department** (`close` step; recorded as a resolve by the officer, so every console shows it closed). The server refuses the wrong step either way, and refuses a Collector verify of a non-severe incident. Today's pipeline build has no severe incident awaiting verification, so My Tasks fills as officers complete severe work |
| 4 | News-only stories: show them like other news, with the full article; remove "no grievance yet" | The news preview now reads like an incident (`NewsPreview.tsx`): the article, how the story unfolded across outlets in time order, and the department that handles it with its contacts. When the monitor kept only a headline, the article is fetched when opened (`lib/collector/fulltext.ts`, `/api/collector/news/article`): Google News links are never followed; the headline is found in the publisher's own news sitemap and read where its robots.txt allows; Mozilla Readability on linkedom takes out the text; cached on disk. "News only · no grievance yet" is removed (the severity and complaint labels stay) |
| 5 | News from official news media only, relevant to the Collector | `isNewsMedia` (`newsrel.ts`): recognised newspapers, TV channels, agencies and government sources, by web domain or name (the monitor's "regional" tier held any unknown site). Applied to Latest news, the preview, the pop-up's timeline and outlet lists, and the officer console. A build step drops incidents known only from non-media sites (151 on 6 Oct: Social News XYZ, LatestLY, Dailyhunt, property blogs...) |
| 6 | Similar grievances, same area and problem, as one with all sources; group incidents to avoid redundancy | `lib/collector/cluster.ts` (tests `cluster.test.ts`): placed incidents of one category within 300 m of a group's first report and 72 h of it (leader clustering on a grid of 300 m cells, 9 cells checked each); city-level news by headline similarity (TF-IDF over English words and Tamil stems) within 72 h; routine notices one group a week. Run on each build (`incident-clusters@1`, about 0.8 s for 27,000 incidents). By severity, My Tasks and lists show one row per group with "+N similar"; the pop-up merges every report of the group; Verify acts on the whole group |

Also fixed: outlet lists showed one comma-joined name for many-outlet incidents (`GROUP_CONCAT(DISTINCT ... SEPARATOR)` has no SQLite form); now one row per publisher (`intel.sourcesFor`, `officer/data.outletsFor`).

Round 20, second pass (same day):
- **Pop-up detail restored** in the new layout: fact chips (deaths, injuries, people affected, access blocked...), an "At a glance" block (open for, deadline, citizen complaints, field officer, taluk, confidence), "linked N%" on each merged report, and the "Sent to ..." tag.
- **The same complaint twice was not merged** (two dark-spot complaints on Gandhi Street, Royapuram, pins 460 m apart in wards 58 and 59): grouping now also joins citizen complaints of one category on the **same named street or locality in the same zone** (within 1.5 km) and the **same person reporting it again** in the same zone (within 600 m), within 72 hours. Police and hospital records are events and still group by distance only. Tests cover the case.
- **Official record news only**: newspapers, TV news channels, news agencies and government sources (`mediaKind`); digital-only portals and magazines are out (224 news-only incidents left out on 6 Oct). Each report shows its kind (Newspaper, TV news, News agency, Government). Routine notices go to their topic's department (power cuts to Street Lighting & Electrical).
- **AI drafting**: portal set to Gemini first, Groq as backup (`AI_PROVIDER`, `AI_FALLBACK_PROVIDER`); emails laid out in paragraphs and numbered steps (`tidyEmail`). Email settings block added to the portal `.env` (SMTP, sandbox inbox).

Round 20, third pass (same day):
- **Analysed explanations**: "What happened" and "Why it needs you" are written by AI from all of the incident's reports, the department's response, deadlines, recurrence and the category's standard steps (`lib/collector/analysis.ts`, `/api/collector/incidents/[id]/analysis`): 3 to 5 sentences joining every report, each reason with its evidence, a next step; every number is checked against the facts (else the rules' wording stays). Cached per incident state. News stories get the same ("Why it matters to you", `/api/collector/news/analysis`).
- **Pop-up alignment back to the three columns** (what happened, key facts | how it unfolded | sources, merged incidents, who is responsible), with the incident's id, "Action taken" and "N incidents merged" in the header.
- **News pop-up laid out like an incident** (`NewsView`): analysis and key facts, the report in full, how it unfolded, who is responsible; the keyword tags above the headline are gone. News from other districts is also caught from the article's own place and bodies (Tirupur, Avinashi... every Tamil Nadu district).
- **Action taken** shows once an instruction is sent: a green tick on the By severity row, a mark on My Tasks and list rows, and "Action taken · send again" in the pop-up.
- **Merged incidents** read "N incidents merged" everywhere, and the pop-up lists every merged incident with its id.
- **Incident ids stay the same from build to build** (pipeline `linking.stable_ids`, registry `output/state/incident_ids.json`): an incident keeps the id most of its reports had, even when an earlier report joins it later; on a split the larger part keeps it. Ids of the synthetic test generators still change when the generators rewrite their records.
- **Two different crimes were merged** (a child-theft complaint against a fertility hospital and an OTP fraud, 270 m apart in Kolathur): crimes, accidents, fires, public order and missing persons (`EVENT_CATEGORIES`) now join only when their reports also read as the same event (headline similarity without the place name and report boilerplate), and two incidents known only from police or hospital records never join (each record is its own case). Over 30 days, event groups went from 80 to 27, each one event told by several outlets. Standing problems (lights, garbage, drains, water, roads) still group by place.
- **Incident ids are no longer shown** in the console.
- **Latest news headlines are the articles' own**, also when a filter is on and in "See more" (not the incident's complaint text, e.g. "Migrant worker electrocuted in Nanganallur", not "Moovarasampet Main Road la current wire thongudhu"); the pop-up is unchanged.
- **An incident in the news is headed by the article's headline** everywhere (pop-up, By severity, lists, briefing): build step `news-headlines@1` sets `incidents.headline` from official news media (English first, else the translation of a Tamil one). The citizen's complaint stays in "How it unfolded".
