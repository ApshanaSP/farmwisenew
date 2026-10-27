# FINAL TEST & FIX: results of session 1 (27 Oct 2026)

Branch `test/final-pass`, not pushed. Fast track agreed with the owner: 4 hours (15:50–19:50), the known problems
first, then a broad sweep. This is **not** the full 21-layer run of the prompt; what was not done is listed below.

## 1. By area

| Area | Checked | Bugs found (P0/P1/P2) | Fixed | Open |
|---|---|---|---|---|
| Server memory (R-01) | Cause measured; fix; soak on the production build | 1 / 0 / 0 | 1 | 0 (see 6) |
| AI day brief | Live with AI on the production build | 1 / 3 / 0 | 4 | 0 |
| Chatbot | 2 live questions + unit and golden tests | 1 / 6 / 1 | 7 | R-11 part, B-007 |
| News classification | Both classifiers (web + pipeline) | 1 / 0 / 0 | 1 | 0 |
| Environment | Production build | 1 / 1 / 0 | 1 | R-20 |
| Data Studio | Production build | 2 / 1 / 0 | 3 | 0 |
| Numbers across pages (R-07) | Overview, Briefing, Trends, chatbot | 1 / 0 / 0 | 0 | the oracle (L6) |
| Search and lists | Production build + golden tests | 0 / 2 / 0 | 2 | 0 |
| Incident detail | Production build | 0 / 3 / 0 | 3 | 0 |
| Trends | Production build | 0 / 1 / 0 | 1 part | Kolathur map (owner) |
| Security (L3 subset) | 36 probe checks, 6 XSS payloads, 13 SSRF addresses, bundle secrets, collector→officer access | 0 / 0 / 1 | 1 | 0 |
| Accessibility | Map pins, logo link | 0 / 1 / 1 | 2 | axe not run |
| Phone width | 375 px, all pages | 0 / 1 / 0 | 1 | 0 |
| Officer and citizen portals | Pages load, refuse without a session | 0 | 0 | journeys need test logins |

## 2. The most important fixes (Before → Now)

| # | Before | Now |
|---|---|---|
| R-01 | The server ran out of memory when the hourly data arrived: every table was parsed at once (+305 MB) | One table at a time (+80 MB, and faster); the two reloads never overlap. Memory flat at about 1.4 GB under constant load |
| R-02 | The AI key points never mentioned Cyclone Arnab | The headline leads with it: "Cyclone Arnab is in 14 news outlets … Chennai has no IMD warning" (checked live) |
| R-03 | Tamil "important problems today" listed crimes and "14 rain deaths" in Chennai | The cyclone first, then the Cooum bund breach, wall collapse and hospital beds (checked live) |
| R-04 | A minister's state-wide "14 deaths so far" was an open Chennai incident | Classed as a roundup, in the website and the pipeline |
| R-05 | 21-day-old prices under "Prices today" | "Latest prices · 21 days old", in warning colour |
| R-06 | Data Studio listed 31 datasets: one grievance file 8 times, plus world population | 15 cards: "same file added 8 times", every department shown, non-Chennai data left out; nothing deleted |
| R-10 | "What should we prepare?" got a generic 5-step list | Plus the open flood problems to clear first (bund breach, flooded roads) and the zones with most |
| R-17 | Tamil key points put Periamet as Parrys and Pattaravakkam as Pattabiram | The gazetteer's Tamil names are given; a Tamil point naming a place the facts never name is not shown |
| R-21 + B-005 | Search capped at 7 with chatter ranked 2nd; the full list found 0 for "velachery flooding" | Title matches first, "N more" opens the list, and the list finds every word |
| B-003 | The banner read "Heavy rain Arnab" when the newest report was about its rain | "Cyclone Arnab" |

Also fixed: R-09, R-12, R-13, R-14, R-19, R-24, R-25, LT-12, LT-44 (152 map pins named), B-002 (malformed request bodies
gave 500s on 10 routes), B-004, B-006, and the phone number tiles.

Every fix has a regression test that failed before the fix and passes after it.

## 3. Numbers

| Check | Before | Now |
|---|---|---|
| vitest | 806 | 875 passed (1 skipped) |
| golden, no AI (frozen real data) | 4 | 6 passed (1 skipped) |
| pytest | 131 | 136 passed |
| tsc | clean | clean |
| next build | — | 0 errors |
| smoke.mjs | — | PASS |
| security.mjs | — | PASS (36 checks) |
| secrets.mjs | — | PASS (70 files, 8 patterns) |

## 4. Waiting for the owner
1. Renew the Bedrock key (`npm run ai:key`) before the demo: the yellow "AI key" banner shows on every page until then.
2. R-22: bind the dev server to 127.0.0.1, or upgrade to Next 16.
3. R-23: pin scikit-learn 1.8.0, or retrain the news model.
4. B-001: OK to add an ESLint config (no new packages)?
5. R-15: on the hourly-build PC, check the log line "incident ids: N of M reports kept their incident id". One October
   incident carries a May id (INC-20260504-5AF5D2), which suggests the id registry votes an old id onto a new incident.
6. R-18: Kolathur taluk has only ward 24 in the reference map: is there an official ward-to-taluk list?
7. Test logins for officers (3 departments) and OK to register a FINALTEST citizen, so the officer and citizen journeys
   can be tested.
8. Test packages: OK to add `@playwright/test` and `@axe-core/playwright` (dev only)?

## 5. Not tested in this session, and why
- Officer and citizen journeys (J-01 to J-04, J-14): no test logins yet.
- Full API contract for all ~80 routes (L2), every element (L5), 150-question chatbot bank (L7), axe (L14), all widths ×
  themes (L15), the numbers oracle (L6): need more sessions; Playwright needs the owner's OK.
- The 60-minute soak with 3 forced reloads: a shorter soak was run (see 6).
- Uploads (photos, Studio files) and OTP limits: need a citizen account.

## 6. Memory soak (production build, 127.0.0.1:3005)
- 47 minutes of server time, about 7,100 requests (Overview, search, alerts, Briefing and Trends data, Studio, map),
  **0 errors**. Two responses took 3.5–4 s, both while other tests ran on the same PC.
- Private memory after start-up held between **1,393 and 1,448 MB**, with no upward trend (105 samples, every 30 s,
  evidence/memory.csv). Start-up peak 1,667 MB.
- The 5-minute data reloads ran during the soak without a problem.
- **Not observed live:** an hourly *build* swap (the exact moment of the old crash). No new build arrived from AWS
  between 16:20 and 17:25. That path is covered by the measurement (+305 MB → +80 MB) and the regression test; check it
  on demo day by leaving the console open over an hour.

## 7. How to re-run what exists
```
cd chennai-grievance-portal-main
npx vitest run
AI_PROVIDER=none AI_CHAT_PROVIDER=none npx vitest run --config vitest.golden.config.ts
NEXT_DIST_DIR=.next-finaltest npx next build
(start the "final-test-3005" launch config)
node scripts/final-test/smoke.mjs
node scripts/final-test/security.mjs
node scripts/final-test/secrets.mjs
```

## 8. Demo-day checklist
- One server only, a production build, bound to 127.0.0.1 (the 7 GB PC crashed with two servers).
- `npm run ai:key` that morning.
- Close other heavy apps.
- Run the commands in section 7 once before the demo.
- No live AI tests that day (Groq budget).

## 9. Merging
Nothing is pushed. The branch is `test/final-pass` (refs/heads/test/final-pass). Merge into `main` only with the owner's OK.
