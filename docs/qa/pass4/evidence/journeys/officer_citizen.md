# Journey: officer_citizen (officer's day, then a citizen on a 360 px phone)

Server: `server.mjs start --port 3182 --instance officer_citizen` (production build in .next-qa, no model keys). Real Chromium (Playwright, `--mute-audio`, with-lock browser 3).
Scripts: `chennai-grievance-portal-main/tests/qa/pass4/journey-officer_citizen.*.mjs` (lib plus steps 1 to 21). Screenshots are in this folder.

## Setup problem (harness, not the app)
- With `--frozen --ticking` a department officer could not stay signed in in a real browser. The login route answers 200, then `/officer` sends the browser back to `/login`, and the screen sits on "Opening your console" for over 90 s. Citizen sign-in was fine. Likely cause (my reading, not proven): the staff cookie and token last 12 h from the frozen time (2026-11-06 12:00 IST), which the real browser clock and the edge check already count as over; the citizen token lasts 7 days so it survives. I restarted the server WITHOUT `--frozen` and the officer journey worked. So this journey ran on the real clock (7 Nov 2026), not the frozen one.
- The login route allows 8 sign-ins per email per 15 min, counted even when they succeed. My early retries hit it (429). I restarted my server to reset it, then reused saved browser state.
- The browser used `localhost:3182`, because the app redirects to `localhost` even when opened on 127.0.0.1.

## Citizen, 360 x 740 phone (touch)
1. citizen-01-home-360: home loads, no sideways scroll.
2. citizen-02-form-360: step 1 "Your details", prefilled from profile, readable, big targets.
3. citizen-03 and 04: step 2. Tapped the map: Ward 58 Royapuram and the zone filled in by themselves. Text says Google Maps is not configured (expected here).
4. citizen-05 and 06: step 3. Chose Garbage, then "Overflowing of Garbage Bin" (15 sub types, long but fine).
5. citizen-07 and 08: step 4. Added a jpg photo and 130 characters. The preview looks good. BUT the page then grew to 370 px wide on a 360 px screen: the form card and Review card run off the right edge and the page scrolls sideways (finding 1).
6. citizen-09-submitted-360: tapped Submit. "Complaint registered", number 2026-993UJN, department Solid Waste Management, next steps shown. Good.
7. citizen-10 and 11: the complaint is listed as "Complaint Filed" with address, ward, description and journey. The uploaded photo is not shown on the detail (not checked further, may be by design).

## Officer (SWM, qa.officer.swm), 1366 x 800
1. officer-01-home: Overview loads in about 5 s. 38 waiting for approval, 91 open incidents, 449 or 450 resolved this month, To approve and In action lists. Clear.
2. officer-02-search: typed the citizen's number 2026-993UJN into Search. The only result is "Ask District IQ". No complaint match (finding 2).
3. officer-03-see-all plus the API check (step 16): the new complaint is NOT in the queue (still 38 waiting), not in "See all", and `/api/officer/grievances?q=993UJN` returns 0 rows. The case the citizen filed never reached this officer in this run (finding 3). So I could not take the citizen's own case from new to closed.
4. officer-04b and 04c: I approved the top waiting case with a real mouse click. A toast says it is now In action. Counts moved: waiting 38 to 37, in action 36 to 37. Good.
5. officer-05 and 06: "Complete & close" on an In action case opens "Completion report" (remarks, up to 8 photos). The case shows a High badge while the footer says "Not severe: your department verifies and closes it." (finding 5).
6. officer-07, 07b, 08: filled remarks, added a photo, "Close as done". The app asks "Confirm it's you" (password), as designed. After confirming, the case shows "Closed by department", In action 37 to 36, resolved 449 to 450. Works end to end. The first try gave a 428 that appears as a browser console error (finding 4).
   Note: my step 21 script printed the test officer's password in its own console output (it sits in the app's confirm request). It was not saved to any file, and I did not copy it here.

## Server log
`data/aws-cache/qa/run/srv-3182.log`: no error lines during the run.

## Not reached
- The citizen's own case closed by the officer, and the citizen seeing "Resolved" with the officer's photo (the case never reached the officer).
- Collector check of a Severe case, Tamil on the phone, anonymous filing, dark mode, officer on a phone.
- Finding out whether the photo or the long text causes the 10 px overflow.
