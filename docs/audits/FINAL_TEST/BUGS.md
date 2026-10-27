# Bugs

Status: open / fixing / fixed / verified / owner-decision / accepted. Details for each bug follow the table.

| ID | Sev | Area | Title | Status |
|---|---|---|---|---|
| R-01 | P0 | Server | Out of memory during the hourly reload | fixing |
| R-02 | P0 | AI day brief | Leaves out the active cyclone alert | open |
| R-03 | P0 | Chatbot (Tamil) | "Important problems today": state death toll as Chennai today, crimes first, garbled line | open |
| R-04 | P0 | News → incidents | Minister's state-wide statement becomes a Chennai incident | open |
| R-05 | P0 | Environment | 21-day-old prices under "Prices today" | open |
| R-06 | P0 | Data Studio | 8 copies of one file; a non-Chennai file; 8 s grey panels | open |
| R-07 | P0 | Numbers | Figures differ across pages | open |
| R-08 | P0 | Owner | Bedrock key expired | owner-decision |
| R-09 | P1 | Chatbot | News question gets the alert template | open |
| R-10 | P1 | Chatbot | Generic "what should we prepare" playbook, 11.7 s | open |
| R-11 | P1 | Chatbot | Follow-up says eight, lists 6, includes a resolved one | open |
| R-12 | P1 | Chatbot | "Why flooding rose": wrong base wording, causal words, ID in prose | open |
| R-13 | P1 | Chatbot | Adyar: mixed measures, silent window, unchecked "no closure" | open |
| R-14 | P1 | Detail panel | Contradictions; 8.3 s load | open |
| R-15 | P1 | Incident IDs | IDs change between hourly builds | open |
| R-16 | P1 | Overview | /alerts ×4, /nearby on load, banner after 6 s | open |
| R-17 | P1 | Tamil | Wrong place name; "snowfall" | open |
| R-18 | P1 | Trends | Kolathur 3; "41× usual" on 3; good news as flood relief | open |
| R-19 | P1 | Briefing | Trivial dataset facts as "needs action" | open |
| R-20 | P1 | Environment | No forecast or alerts card | open |
| R-21 | P1 | Search | Capped at 7; chatter ranked 2nd | open |
| R-22 | P2 | Server | Dev server on all interfaces | owner-decision |
| R-23 | P2 | Pipeline | scikit-learn version mismatch | owner-decision |
| R-24 | P2 | My Tasks | Note cut mid-word | open |
| R-25 | P2 | Chatbot | Same figures said twice | open |
| B-001 | P1 | L1 lint | `npm run lint` is not set up (no ESLint config; interactive prompt) | owner-decision |

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
- **Fix:** (in progress)
- **Regression test:** (in progress)
