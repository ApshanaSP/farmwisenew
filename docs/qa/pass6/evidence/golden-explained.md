# Golden master: every change explained

- Baseline `p6-base` (start commit `5c082b7`, 13:59) and its repeat `p6-base2` (14:02, nothing changed): 3 requests differ, all the map
  position of the complaint the recorder files itself in its write session (`$.incidents[0].lat/lon` on `/api/collector/search?q=<new-complaint-code-1>`,
  `$.map.pins[*].lat/lon` on `/api/collector/overview` and `?period=weekly&zone=13`). This is the noise floor: the recorder's own new complaint is
  placed in its ward with a small offset taken from its complaint number, and the number is new each run (`src/lib/manu/cases.ts` spread()).
- Gate `p6-gate` (final commit `effe51b`, 21:20) against `p6-base`: 3,277 requests each, 0 server errors, the same 3 gaps (the Manu routes with an id
  in the path have no sample ids in the golden plan). **15 requests changed** (`docs/qa/pass4/golden/diffs/p6-base__p6-gate.md`):

| Requests | What changed | Why |
|---|---|---|
| 8 x `/api/collector/overview` with `cat=` or `taluk=` (SOLID_WASTE, DARK_SPOT_SAFETY, FOOD_SAFETY, PUBLIC_ORDER; TLK-MYL, TLK-SHN, TLK-MDR; weekly TLK-MYL) | `$.snapshot.critical` 20 -> 0 (TLK-SHN: 20 -> 1) | P6-028 (`bf50474`): the "Severe, not yet checked" tile now applies the console's category and taluk filters, as the list it opens does. 20 was the whole district's count whatever the filter. |
| 4 x `/api/collector/report` with `cat=` or `taluk=` (SOLID_WASTE, DARK_SPOT_SAFETY, TLK-MYL, TLK-SHN) | `$.snapshot.critical` 20 -> 0 (TLK-SHN: 20 -> 1) | P6-028: the report reads the same snapshot as the overview. |
| `/api/collector/search?q=<new-complaint-code-1>`, `/api/collector/overview`, `/api/collector/overview?period=weekly&zone=13` | the recorder's new complaint's lat/lon | the noise floor above (the same three requests that differ between the two baseline recordings). |

No other request changed. In particular the golden plan's Ask District IQ, Ask the Map and officer requests do not name another department's
incident, so P6-006, P6-012 and P6-021 (refusals for those) change nothing there; P6-003 changes nothing because the plan files complaints as a
citizen only; the Manu Desk fixes are not in the plan (gaps) and are proven by their own tests and the access matrix.
