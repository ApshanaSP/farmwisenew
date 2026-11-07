# Collector journey (pass 4, fast track)

Server: port 3181, instance collector, baseline build `.next-qa`. Started WITHOUT `--frozen` after the first try failed (see finding 6): the frozen clock makes the Collector's 12 h token look expired to the middleware. So "today" is the real date; the data is still the pinned snapshot (collected 6 Nov, 06:10 PM). No AI provider on this server, so AI-written text and Tamil translation of live text are off.
Browser: Playwright, muted, 1440x900, with-lock browser 3. Screenshots sit beside this file.

## Morning, English (scripts: tests/qa/pass4/journey-collector.browser.mjs)
1. Sign in with the form. With --frozen: bounced back to login (en-00-after-signin.png). Without: lands on the console.
2. Home (en-01-home.png): greeting, 4 numbers, 5 feeds behind, map shows "Loading the map..." for the first seconds, severe list with one item needing me, Latest news. Reads clearly. No console errors.
3. Tabs Overview, Briefing, Trends, Environment, Data Studio, Daily (en-02..07): all load, no console or HTTP errors.
## Morning, Tamil (ta-01..06)
4. Layout holds; tab names, numbers panel, severity labels, zone names are Tamil. Live news headlines stay English (AI translation off here). Some chips cut off ("Collected", "மிகவும் தீவிரமான ..."). Briefing keeps many English labels (finding 2).
## Cyclone and flood day (journey-collector-storm.browser.mjs, storm-*.png)
5. Banner "Cyclone Murasu" opens a clear popover: IMD yellow, NDMA no alert, 5 outlets, lake levels, flood gauges honestly marked "39 hours ago" (storm-en-2-banner.png). Good. Raw date at the end (finding 5).
6. Act on the severe item: Take action dialog drafts an email to the officer in a few seconds, shows "Email not set up on this server, goes to the console only" (honest), Approve & send button (not pressed). Popover stays on top (finding 3). Tamil: status "திற" (finding 1), draft stays English.
7. Briefing from the storm view loads.
## Not reached
Rain tab click (my selector failed, not checked as an app fault), Ask the map and Ask District IQ (no model on this server), Jarvis, Trends/Environment/Data Studio detail, Data Studio in Tamil, mobile size, sending the email, real Tamil screenshots of Trends and Environment beyond the first load.
Server log: no server errors. Stopped.
