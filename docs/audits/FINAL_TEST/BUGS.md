# Bugs

Status: open / fixing / fixed / verified / owner-decision / accepted. Details for each bug follow the table.

| ID | Sev | Area | Title | Status |
|---|---|---|---|---|
| R-01 | P0 | Server | Out of memory during the hourly reload | fixed (a95f18e); soak pending |
| R-02 | P0 | AI day brief | Leaves out the active cyclone alert | fixed (8e6c988) |
| R-03 | P0 | Chatbot (Tamil) | "Important problems today": state death toll as Chennai today, crimes first, garbled line | fixed (8e6c988) |
| R-04 | P0 | News → incidents | Minister's state-wide statement becomes a Chennai incident | fixed (8e6c988) |
| R-05 | P0 | Environment | 21-day-old prices under "Prices today" | fixed (268c66c) |
| R-06 | P0 | Data Studio | 8 copies of one file; a non-Chennai file; 8 s grey panels | fixed (c68c70e); panel speed not re-measured |
| R-07 | P0 | Numbers | Figures differ across pages | partly: several differences are different measures, each labelled (Police 61 open vs 62 received in 24 h; Trends 4 weeks vs chatbot 30 days); the full numbers oracle (L6) is not built yet |
| R-08 | P0 | Owner | Bedrock key expired | owner-decision |
| R-09 | P1 | Chatbot | News question gets the alert template | fixed (8b32dfa) |
| R-10 | P1 | Chatbot | Generic "what should we prepare" playbook, 11.7 s | fixed (eda4f67); speed not re-measured |
| R-11 | P1 | Chatbot | Follow-up says eight, lists 6, includes a resolved one | partly fixed (256876d): text and cards must match; 'those' keeping the open filter is not done |
| R-12 | P1 | Chatbot | "Why flooding rose": wrong base wording, causal words, ID in prose | fixed (0c13663) |
| R-13 | P1 | Chatbot | Adyar: mixed measures, silent window, unchecked "no closure" | fixed (19b63d9) |
| R-14 | P1 | Detail panel | Contradictions; 8.3 s load | fixed (1cdf4ff); load is 153 ms on the production build (8.3 s was dev mode) |
| R-15 | P1 | Incident IDs | IDs change between hourly builds | owner check: the pipeline already keeps ids in output/state/incident_ids.json; the change happened on the hourly-build PC (check its log 'incident ids: N of M kept') |
| R-16 | P1 | Overview | /alerts ×4, /nearby on load, banner after 6 s | not reproduced on the production build: each API once per load, banner instant (the duplicates were dev mode) |
| R-17 | P1 | Tamil | Wrong place name; "snowfall" | fixed (0ca620d, b5a8935) |
| R-18 | P1 | Trends | Kolathur 3; "41× usual" on 3; good news as flood relief | partly fixed (f9f3487): minimum count; Kolathur has 1 ward in the reference map (owner: the official ward-to-taluk list) |
| R-19 | P1 | Briefing | Trivial dataset facts as "needs action" | fixed (1cdf4ff) |
| R-20 | P1 | Environment | No forecast or alerts card | open (a forecast card is a new feature) |
| R-21 | P1 | Search | Capped at 7; chatter ranked 2nd | fixed (30bb5c3) |
| R-22 | P2 | Server | Dev server on all interfaces | owner-decision |
| R-23 | P2 | Pipeline | scikit-learn version mismatch | owner-decision |
| R-24 | P2 | My Tasks | Note cut mid-word | fixed (1cdf4ff) |
| R-25 | P2 | Chatbot | Same figures said twice | open |
| B-001 | P1 | L1 lint | `npm run lint` is not set up (no ESLint config; interactive prompt) | owner-decision |
| B-002 | P2 | API | An empty or broken JSON body gave a 500 on 10 routes (sign-in, register, OTP, complaints, profile) | fixed (0c13663) |
| B-003 | P1 | Alerts | Banner read "Heavy rain Arnab": a named storm took the hazard of its newest report | fixed (b5a8935) |
| B-004 | P1 | AI brief | A key point ended with a raw incident id "[INC-20261027-D07F21]" | fixed (b5a8935) |
| B-005 | P1 | Incident list | The full list's text filter matched "velachery flooding" as one phrase (0 rows) | fixed (30bb5c3) |
| B-006 | P2 | Sign-in pages | The logo link had no accessible name | fixed (1cdf4ff) |
| B-007 | P1 | Chatbot (Tamil) | Incident titles stay in English inside a Tamil answer (LT-17) | open |
| B-008 | P2 | Phone | The four number tiles cut every label at 375 px | fixed (6819fe3, final commit) |
| B-009 | P2 | Overview | A new zone + period: tiles in 0.22 s, stories panel 1.5–1.8 s (budget 1 s) | open |

## R-01 Out of memory during the hourly reload
- **Steps:** dev server (`npm run dev`, DATA_BACKEND=aws) on a 7.2 GB PC with a second dev server running; leave it 6
  minutes so the 5-minute build check and the durable reload fire; ask chatbot questions meanwhile.
- **Expected:** the new build swaps in; the server keeps answering.
- **Actual:** `FATAL ERROR: Committing semi space failed. Allocation failed - JavaScript heap out of memory` at about
  1.36 GB heap, right after "build … loaded" and "search index synced". 1 of 1.
- **Evidence:** RECHECK_2026-10-27.md; scratchpad probe: all-at-once parse +305 MB heap, one-at-a-time +80 MB.
- **Root cause:** `src/lib/aws/store.ts` `buildDb`: `Promise.all(names.map(load))` parses every table's JSON
  (documents 11 MB gz, events 7 MB gz…) into the JS heap at once, and `snaps` stays referenced until the end of the
  function (`compat(db, snaps)`). The build refresh and the durable reload (`reloadDurable`) can run at the same time,
  each with its own peak, while the old build is still open.
- **Fix:** a95f18e. Downloads stay parallel; each table is parsed and inserted one at a time and its JSON dropped; the
  durable reload and the build check never run together; the reference tables are kept compressed.
- **Regression test:** `src/lib/aws/store.memory.test.ts` "reads the next table only after the one before is in the
  database" (failed before: 6 tables at once; passes after: 1).
