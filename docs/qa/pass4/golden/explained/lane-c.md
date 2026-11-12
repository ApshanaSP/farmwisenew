# Golden-master changes, lane c (baseline-abef9da to lane-c)

Compared 3272 requests: 30 changed, 0 added, 0 removed. 0 server errors (five_xx 0; the baseline had 2). Built with Next 15.5.29 (the build id differs, which is expected). The repeat of the baseline against itself has 0 changes, so none of these is noise.
Full diff: docs/qa/pass4/golden/diffs/baseline-abef9da__lane-c.md.

| Requests | Change | Cluster | Why |
|---|---|---|---|
| 18 x `GET /api/collector/assistant/export` (collector, officerA, officerB) | 200 with a CSV becomes 428 "Confirm it's you first" | RC-25 (PB-163) | The assistant's CSV now asks for the same confirm step as the console's export of the same rows. The answer card fetches the file, so the confirm box answers the 428 in the browser; a bare request has no grant, as the golden run does. |
| 3 x `POST /api/collector/thunai/plan` | plan kind none becomes refuse, with the privacy reply (twice, English and Tamil) or the never-send reply | RC-19 (PB-009) and RC-18 | The older /plan route now refuses a citizen's details and an order to send, approve or delete in code before any model, as /round and /agent do. Before, with no model, it answered nothing. |
| `GET /api/collector/search?q=குப்பை` | 500 becomes 200 with results | RC-23 (PB-108) | A Tamil word is cut at letters and combining marks together, so it is a word; before, the vowel signs cut it into single letters and the query was empty (500). |
| `GET /api/collector/list?q=குப்பை` | 0 rows becomes 1 row | RC-23 (PB-108) | Same cause: the Tamil word now matches. |
| `GET /api/collector/list?q=x` | 0 rows becomes 12 rows (18 matches) | RC-23 | A one-letter word is no longer dropped to an empty query; it is searched as typed (substring). The search route returned 500 for this before (the empty query). Judgement call: a one-letter search matching anything with that letter is noisy but honest, and not a crash. |
| `GET /api/rehearsal/state?replay=rain-1999-01-01` | 503 becomes 404 | RC-23 (PB-233) | A rain that is not in the record is "not found"; 503 is kept for a service that is down. |
| `GET /api/collector/workspaces/1000000002` | 404 becomes 200, the saved workspace | RC-24 (PB-085, PB-196, PB-212) | One id rule takes ten-digit ids, which a copy that does not save to AWS gives its own rows. |
| 2 x `GET /api/collector/audit` | ids shift by one, one more entry | RC-24 | The workspace now opens, so the open is audited (one entry more). |
| 2 x `POST /api/collector/assistant/chat` (collector, officerA; "Delete all the closed complaints from last month.") | 5 events with a data answer become 3 events with the refusal "I can only read the data; I can't change or delete records" | not isolated | The assistant's own guard (src/lib/assistant/guard.ts, unchanged since 25 Oct, and not in lane c) refuses this sentence at once on this build, in a unit call and on a live server; the baseline build answered it by fetching data. No file in the assistant pipeline changed in this lane except access.ts (an awaited portal read). The new answer is the right one for a delete order; the cause of the baseline's pass-through was not found, so this row is reported and not claimed as a fix. |

Not in the diff on purpose: Tamil and English open-set grades (ledger: 0 right-to-wrong after RC-18 and after RC-19), the figures of every other route (unchanged), and the CSV export of the console (still 428 without a grant, as before).
