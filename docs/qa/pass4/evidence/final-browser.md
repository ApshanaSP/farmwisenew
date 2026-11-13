# Final browser drive of the .next-qa build (6bb5423), 12 Nov 2026

Server: `node tests/qa/pass4/server.mjs start --port 3232 --ticking` (production build `.next-qa`, built from 6bb5423f97637a24de52f9f3d2406e5d3d217640; `git diff 6bb5423 -- src` is empty, so the build still matches the source). No model keys. Browser: Playwright Chromium, `--mute-audio`, light theme, one sign-in per role through the API (the cookie is kept for a day because a `--ticking` server dates staff cookies from 6 Nov, which the real clock counts as past). The server was stopped at the end.

Scripts (all in `chennai-grievance-portal-main/tests/qa/pass4/`): `final-browser.pages.mjs` (pages), `.overlays.mjs` (dialogs and wizard steps), `.journeyA/B/C/E/S.mjs`, `.signout.mjs`, `.collectorSees.mjs`, `.figures.mjs`, `.table.mjs`. Raw results and screenshots: `docs/qa/pass4/evidence/final-browser/`.

## Counts

| What | Result |
|---|---|
| Pages x role x language x width (7 roles incl. signed out, 17 pages, plus 5 officer views and 8 collector tabs) | 568 rows: 521 pass, 47 fail. All 47 are axe "serious" (one of them is also a tab that cannot be clicked). |
| Console errors, failed requests, sideways scroll, wrong landing page, HTTP 5xx on those 568 | 0 |
| axe on the 568 page rows | 0 critical, 393 serious nodes in 47 rows |
| Opened screens (dialogs, panels, wizard steps) x language x width | 156 rows: 100 pass, 56 fail (axe). 4 are axe CRITICAL (Collector Menu pop-up). |
| Console errors on opened screens | only `503 POST /api/jarvis/say` (FB-10) |
| Journeys | A (collector decides): en 1440, en 360, ta 1440 done, ta 360 stopped (FB-8). B (officer works to closed, citizen and collector see it): en 1440 officerA, en 360 officerC, ta 360 officerB, plus the Collector's search. C (citizen files, officer told): en 1440, en 360, ta 360, ta 1440. E: Rain tabs en/ta at 1440 and 360; Ask District IQ 1440 and 360; Jarvis 1440 and 360 in English, Tamil and Tanglish. S: sign in as all 6 roles (en 1440, ta 360), wrong password, sign out as 4 roles x 2 languages. |
| Findings | 11 (0 P0, 3 P1, 6 P2, 2 P3) |

`axe.mjs` itself was NOT run. It signs in on 127.0.0.1 and the app's redirects go to localhost, and a `--ticking` server dates staff cookies from 6 Nov, so it would scan sign-in pages. The same `@axe-core/playwright` scan (all rules, all impacts) ran inside `final-browser.pages.mjs` and `.overlays.mjs` instead. Dark theme was not scanned in this drive.

## Environment fact that matters

`.cache/models/Xenova/multilingual-e5-base/onnx/model_quantized.onnx` in this worktree is a 134-byte git-lfs pointer (the real file is 278 MB in the main checkout). The server log shows `embedding index: Load model ... failed: Protobuf parsing failed` five times. So the Ask District IQ and Jarvis runs below had no meaning index: they are "rules only". FB-2 and FB-3 may differ with the real model; they are still the real behaviour of this build in this setup. I did not copy the model in (it is a tracked file).

## Findings

| Id | Sev | What | Steps and evidence |
|---|---|---|---|
| FB-1 | P1 | Jarvis says more cases are past deadline than there are severe cases: "9 severe cases this week. 10 are past their deadline". On a re-run: "7 severe cases this week. 7 are past their deadline", while the list it returns flags only 5 rows overdue. | Collector, Jarvis, type "how many severe incidents this week". `final-browser/journeyE-jarvis-1440.json`, `figures-run.txt` (same round called through the API: total 7, overdue flags 5). |
| FB-2 | P1 | "What is the rainfall in Adyar" (English, Tamil, Tanglish "mazhai") is understood as zone Adyar (slots zones [13]) but answered with the city's highest reading ("Highest: Chennai-Madhavaram at 14 mm"), not Adyar's. The typo "maze" gives a briefing "0 incidents in Adyar" instead. A confident answer about the wrong place. | `figures-run.txt` (last four lines), `journeyE-jarvis-1440.json` steps jarvis-ta and jarvis-tanglish, `E-jarvis-ta-1440-4.png`. |
| FB-3 | P1 | Ask District IQ: "Why did the Chembarambakkam lake level rise this week?" is answered "Incidents fell to 267, mostly garbage and solid waste". It gives no lake-level answer and does not say it has none. (Honest part: the panel header says the AI provider is not configured and answers come from the console's data.) | Collector, Ask District IQ, type the question. `E-ask-en-1440-2.png`, `journeyE-ask-1440.json`, `journeyE-ask-360.json`. |
| FB-4 | P2 | After the Collector approves an instruction, the row still shows "Act" for 18 s or more in the same session; it shows "Sent" only after a reload (English and Tamil; in Tamil "Sent" stays English). | Journey A: `journeyA-en-1440.json` steps row-same-session-3s, -18s, row-after-reload; `A-en-1440-07-list-after.png`, `A-en-1440-07b-list-after-reload.png`. |
| FB-5 | P2 | Severe counts differ on one screen: tile "Severe events 11" and map chip "Severe 11", list and Jarvis "9" (Tamil run: 10 and 9). Cause not pinned (merged or already-sent incidents may explain it); the screen does not say. | `A-en-1440-07-list-after.png`, `A-ta-1440-07b-list-after-reload.png`. |
| FB-6 | P2 | Signing out clears the cookie and redirects, but the old session token still works: `/api/collector/overview`, `/api/officer/grievances` and `/api/complaints` answer 200 with the old cookie after sign-out (401 with no cookie). Collector, officerA, officerC and citizenA, both languages. | `final-browser.signout.mjs`; `journeyS-signout.json`, `journeyS-signout-citizenA.json`. A stateless token; a design fact for the owner. |
| FB-7 | P2 | Layout clips at 360 px: (a) the Take action dialog footer, "Approve" runs off the right edge, and in Tamil the Approve click timed out (journey A ta 360 stopped); (b) the Collector Menu pop-up is cut off at the left edge; (c) in Tamil the bottom bar shows only 4 of 5 tabs, "Data Studio" is off screen and cannot be clicked (`clickErr` on collector:studio ta 360, in two runs); (d) the Ask panel header and scope bar are cut off. | `A-ta-360-99-error.png`, `A-en-360-04-detail-and-draft.png`, `ovl-fail-collector_collector_overlay_Menu_en_360.png`, `fail-collector_collector_studio_ta_360.png`, `ovl-fail-collector_collector_overlay_Ask_District_IQ_empty__en_360.png`. |
| FB-8 | P2 | Tamil screens keep English: officer and Collector chrome ("Work & insights", "than the previous month", "Collected 6 Nov, 06:10 PM", "Export PDF", "LOGGED IN AS", the case timeline "Received / In action / Sent to Collector / Verified", "COMPLETION REPORT FROM"), Ask answers ("Zones by open incidents", raw codes WATERBODY_INFRA and FLOOD_RELIEF), the "Sent" chip. | `B-ta-360-officerB-01-home.png`, `B-ta-360-officerB-07-closed.png`, `A-ta-1440-07b-list-after-reload.png`, `journeyE-ask-1440.json` (ask-ta). |
| FB-9 | P2 | Accessibility, axe serious or critical (target 0), on 52 distinct page or screen combinations. By rule: **color-contrast** (486 nodes: officer red delta chips 3.93:1 on the 1440 officer pages; bottom-bar active item 3.85:1 on citizen pages at 360 in English; Collector briefing, trends, environment and studio chips and delta text 2.0 to 4.1:1; white on green "ok" buttons 3.38:1 in the officer report dialog; news level tags); **aria-required-children, CRITICAL** (Collector Menu pop-up `.pop` holds buttons, 4 screens); **nested-interactive** (108 nodes: Data Studio map, `li[role=option]` in citizen wizard step 3); **label-content-name-mismatch** (78 nodes: "Act" and done buttons); **scrollable-region-focusable** (15: Environment, Studio, incident detail, Ask scope bar); **aria-command-name** (8: map markers on citizen track and Studio); **definition-list and dlitem** (citizen track: `dt` without `dl`). | `final-browser/pages.json`, `overlays-citizen.json`, `overlays-officer.json`, `overlays-collector.json`, and the `fail-*.png` and `ovl-fail-*.png` screenshots. |
| FB-10 | P3 | Every Tamil or Tanglish Jarvis answer fires `503 POST /api/jarvis/say` (two console errors each) when no voice is set up (the route answers `no-tts`); nothing on screen says Jarvis cannot speak. | `journeyE-jarvis-1440.json`, `overlays-collector.json`. |
| FB-11 | P3 | The forgot-password page opened in Tamil at 360 once drew in English (the toggle showed the Tamil state); three other runs of the same page were Tamil. Intermittent. | `fail-collector_forgot_ta_360.png`. The re-run was Tamil. |

Not findings, but worth the owner's eye:
- A citizen files a complaint and gets the number at once (for example `2026-789RVA`; the number is drawn one character per box, so a text read sees separate characters). The citizen is told "the department officer will see it at the next update, which runs every hour". The officer is told only by a note in Work and insights ("1 new complaint is filed with your department and will join this list at the next update"); the Overview count (36) and the bell do not change until the update.
- Asked about a case number that exists (just closed), Jarvis says "I cannot reason right now: no model is answering. Plain requests still work" while the search palette finds it. Honest.
- The Collector's draft for "Ice House: uprooted tree blocks road" reads "Canal overflow at Ice House ... Deploy pumpsets" (a merged waterlogging incident carrying one complaint's title: OPEN-12, the owner's decision).
- Officer completion (journey B) worked on all three officers: approve, in action, completion report, password confirmation, closed and "Verified"; the Collector's search found the same number. Sign-in for all 6 roles, a wrong password (plain message, stays on `/login`) and the sign-out menu worked.
- Server log (`data/aws-cache/qa/run/srv-3232.log`): no server errors apart from the embedding model line above and the "AI translation unavailable" notice (no key, expected).

## Page by role by language

Each cell is 1440 px / 360 px. "pass" means: landed where expected, no console error, no failed request, no sideways scroll, axe 0 critical and 0 serious, Tamil text present when Tamil was asked for. Collector rows include the Briefing, Trends, Environment, Data Studio and four period tabs; officer rows the work view and four period tabs. Where the 360 px cell differs from the 1440 px cell, both are shown.

### English: each cell is 1440 px / 360 px

| Page | collector | officerA | officerB | officerC | citizenA | citizenB | signedOut |
|---|---|---|---|---|---|---|---|
| sign-in page | pass | pass | pass | pass | pass | pass | pass |
| register | pass | pass | pass | pass | pass / axe serious color-contrast x1 | pass / axe serious color-contrast x1 | pass |
| / (goes home) | pass (redirect) | axe serious color-contrast x19 / pass | axe serious color-contrast x20 / pass | axe serious color-contrast x5 / pass | pass / axe serious color-contrast x1 | pass / axe serious color-contrast x1 | pass (sent to sign-in) |
| citizen home | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) | pass / axe serious color-contrast x1 | pass / axe serious color-contrast x1 | pass (sent to sign-in) |
| file a complaint | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) | pass | pass | pass (sent to sign-in) |
| track complaints | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) | axe serious aria-command-name x1; axe serious definition-list x2; axe serious dlitem x12 / axe serious color-contrast x1 | pass / axe serious color-contrast x1 | pass (sent to sign-in) |
| officer overview | pass (sent to sign-in) | axe serious color-contrast x19 / pass | axe serious color-contrast x20 / pass | axe serious color-contrast x5 / pass | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) |
| profile | pass | pass | pass | pass | pass | pass | pass (sent to sign-in) |
| dev-ui | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) |
| dev-collector | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) |
| dev-officer | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) |
| dev-assistant | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) |
| dev-rehearsal | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) |
| dev-thunai | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) |
| 404 | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) |
| forgot password | pass | pass | pass | pass | pass / axe serious color-contrast x1 | pass / axe serious color-contrast x1 | pass |
| officer:work | n/a | pass | pass | pass | n/a | n/a | n/a |
| officer:daily | n/a | pass | pass | pass | n/a | n/a | n/a |
| officer:weekly | n/a | pass | pass | pass | n/a | n/a | n/a |
| officer:monthly | n/a | pass | pass | pass | n/a | n/a | n/a |
| officer:quarterly | n/a | pass | pass | pass | n/a | n/a | n/a |
| collector overview | pass | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) |
| collector:briefing | axe serious color-contrast x3 | n/a | n/a | n/a | n/a | n/a | n/a |
| collector:trends | axe serious color-contrast x27 / axe serious color-contrast x6 | n/a | n/a | n/a | n/a | n/a | n/a |
| collector:environment | axe serious color-contrast x24; axe serious scrollable-region-focusable x1 / axe serious color-contrast x2; axe serious scrollable-region-focusable x1 | n/a | n/a | n/a | n/a | n/a | n/a |
| collector:studio | axe serious aria-command-name x2; axe serious color-contrast x4; axe serious label-content-name-mismatch x1; axe serious nested-interactive x1 / axe serious aria-command-name x2; axe serious color-contrast x2; axe serious nested-interactive x1 | n/a | n/a | n/a | n/a | n/a | n/a |
| collector:daily | pass | n/a | n/a | n/a | n/a | n/a | n/a |
| collector:weekly | pass | n/a | n/a | n/a | n/a | n/a | n/a |
| collector:monthly | axe serious label-content-name-mismatch x9 / pass | n/a | n/a | n/a | n/a | n/a | n/a |
| collector:quarterly | axe serious label-content-name-mismatch x10 / pass | n/a | n/a | n/a | n/a | n/a | n/a |

### Tamil: each cell is 1440 px / 360 px

| Page | collector | officerA | officerB | officerC | citizenA | citizenB | signedOut |
|---|---|---|---|---|---|---|---|
| sign-in page | pass | pass | pass | pass | pass | pass | pass |
| register | pass | pass | pass | pass | pass (sent home) | pass (sent home) | pass |
| / (goes home) | pass (redirect) | axe serious color-contrast x19 / pass | axe serious color-contrast x20 / pass | axe serious color-contrast x5 / pass | pass (redirect) | pass (redirect) | pass (sent to sign-in) |
| citizen home | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) | pass | pass | pass (sent to sign-in) |
| file a complaint | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) | pass | pass | pass (sent to sign-in) |
| track complaints | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) | axe serious aria-command-name x1; axe serious definition-list x2; axe serious dlitem x12 / axe serious color-contrast x1 | pass / axe serious color-contrast x1 | pass (sent to sign-in) |
| officer overview | pass (sent to sign-in) | axe serious color-contrast x19 / pass | axe serious color-contrast x20 / pass | axe serious color-contrast x5 / pass | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) |
| profile | pass | pass | pass | pass | pass | pass | pass (sent to sign-in) |
| dev-ui | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) |
| dev-collector | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) |
| dev-officer | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) |
| dev-assistant | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) |
| dev-rehearsal | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) |
| dev-thunai | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) |
| 404 | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) | pass (404) |
| forgot password | pass | pass | pass | pass | pass (sent home) | pass (sent home) | pass |
| officer:work | n/a | pass | pass | pass | n/a | n/a | n/a |
| officer:daily | n/a | pass | pass | pass | n/a | n/a | n/a |
| officer:weekly | n/a | pass | pass | pass | n/a | n/a | n/a |
| officer:monthly | n/a | pass | pass | pass | n/a | n/a | n/a |
| officer:quarterly | n/a | pass | pass | pass | n/a | n/a | n/a |
| collector overview | pass | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) | pass (sent to sign-in) |
| collector:briefing | axe serious color-contrast x3 / axe serious color-contrast x2 | n/a | n/a | n/a | n/a | n/a | n/a |
| collector:trends | axe serious color-contrast x26 / axe serious color-contrast x5 | n/a | n/a | n/a | n/a | n/a | n/a |
| collector:environment | axe serious color-contrast x23; axe serious scrollable-region-focusable x1 / axe serious color-contrast x1; axe serious scrollable-region-focusable x1 | n/a | n/a | n/a | n/a | n/a | n/a |
| collector:studio | axe serious aria-command-name x2; axe serious color-contrast x4; axe serious label-content-name-mismatch x1; axe serious nested-interactive x1 / tab not clickable; axe serious color-contrast x1; axe serious scrollable-region-focusable x1 | n/a | n/a | n/a | n/a | n/a | n/a |
| collector:daily | pass | n/a | n/a | n/a | n/a | n/a | n/a |
| collector:weekly | axe serious label-content-name-mismatch x2 / pass | n/a | n/a | n/a | n/a | n/a | n/a |
| collector:monthly | axe serious label-content-name-mismatch x1 / pass | n/a | n/a | n/a | n/a | n/a | n/a |
| collector:quarterly | axe serious label-content-name-mismatch x1 / pass | n/a | n/a | n/a | n/a | n/a | n/a |