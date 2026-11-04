# Round 32: Ask the Map chat, Rain impacts, Studio into Jarvis, confirm before action

Status: **built and checked on the local test server (2026-11-04). Not committed.**

## What was built

### 1. Ask the Map is a chat
- Your question shows as a bubble the moment you press Enter, with "Working it out…"; a failed answer stays with "Try again".
- Ask box at the bottom; earlier answers fold to one line ("Show" redraws them); "New chat" clears; the chat is kept per tab.
- Welcome with suggested questions; the lightbulb by the box brings suggestions back at any time.
- "Ask next": 3-4 follow-ups made from each answer (its top zone, the facility or place most of it is near, overdue cases, the department to send to, a zone to compare with). Each is checked on the server before it is shown (`src/lib/map/followups.ts`, test `followups.golden.ts`).
- Send / Export / Save sit right under the answer. A question that opens the Rain view stays in the chat as a note.

### 2. Rain: Flooding · Traffic · Power · Metro
- Tabs at the top of the Rain panel, each with its count for the chosen rain; the rain chosen carries across tabs. Flooding's rain page shows the other tabs' counts as chips.
- Traffic: police traffic-obstruction, accident and road-damage reports in rain windows, placed on roads (main roads city-wide, streets per ward); main roads that flood; 26 OpenStreetMap underpasses with water or traffic at them; traffic news of rain days. Live TomTom flow and incidents appear when `TOMTOM_API_KEY` is set (key kept on the server; tiles proxied and cached; district tiles only).
- Power: streetlight and electrical-hazard complaints in rains (1.6× on rain days), by ward; outage news; TNPDCL planned-cut notices as printed in 356 news articles (localities matched to the map's place names); 53 substations. Rain-day outages per area are a labelled grey sample.
- Metro: ChennaiGTFS (CMRL track shapes, metro and suburban stations, trains an hour), newest stations from OpenStreetMap; stations with a flood street within 300 m; waterlogging at stations; disruption news; nearest dry station. Delays are a labelled grey sample.
- Ask the Map / Jarvis questions like "where does traffic jam when it rains", "which areas lose power in rain", "metro stations at risk in the monsoon" open the right tab.
- Code: `src/lib/rehearsal/impacts.ts`, `traffic.ts`, `/api/rehearsal/impacts`, `/api/rehearsal/traffic/*`, `rehearsal/ImpactView.tsx`, `rainKit.tsx`; layers `data/layers/transit.json` (`scripts/build-transit-layer.mjs`), `underpasses.geojson`, `substations.geojson` (`scripts/build-map-layers.mjs`).

### 3. Data Studio: no separate AI analyst
- The analyst column is gone; the dataset gets the full width. District link is a card in Insights; Alerts is a tab.
- With a dataset open, Jarvis suggests its questions and answers from the dataset's own engine (chart, Add to dashboard, Alert me, Open in the Studio). Drill-down "Ask" goes to Jarvis.

### 4. Security
- Staff sign in with the password alone. (An authenticator step was built on 2026-11-04 and removed the same day at the user's request; it is on branch backup/pre-friend-pull-2026-11-04.)
- "Confirm it's you" before: every email send (Take action, Ask the Map, Rain jobs), Collector decisions (verify, escalate, return, resolve), the officer's report, deleting a dataset, approving a data source, exports. Server answers 428; the box asks for the code; the grant is bound to the account, session, action and exact content for 5 minutes. Cancelled = "Not confirmed: nothing was done."
- Every email carries "Approved by … confirmed with the password · Reference DIQ-XXXX-XXXX" (HMAC); Menu → Security → Check an email says Genuine / Not found; the officer console shows the reference on the Collector's instruction.
- Cross-site write requests refused (403) in the middleware; staff sessions 12 hours; Security page (status, recent activity, sign out other devices); all of it in the audit log.
- Code: `src/lib/security/*`, `/api/auth/mfa`, `/api/auth/confirm`, `/api/auth/security`, `components/auth/SecondStep.tsx`, `components/security/*`, migration `014_staff_mfa.sql`.

## Checks
- `tsc` clean; unit suite 1,587 passed; golden: follow-ups 12/12, rain impacts 4/4.
- Browser (test server r32-3011, dry-run store, SMTP blocked): sign-in setup and code, chat, follow-ups, tray, export and send with confirmation, reference shown Genuine, Rain tabs, station card, Security page, Studio + Jarvis, delete with confirmation, 375 px phone, dark mode.

## For the demo
- For live traffic, sign up free at developer.tomtom.com, put `TOMTOM_API_KEY=...` in the portal's `.env`, restart.
- Restart your own server so the store adds the new user columns.

## Sources
- TomTom pricing: https://developer.tomtom.com/pricing
- ChennaiGTFS: https://github.com/ungalsoththu/ChennaiGTFS
- OpenStreetMap (ODbL) via Overpass
