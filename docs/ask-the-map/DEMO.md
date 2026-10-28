# Ask the Map: demo script (numbers measured 28 Oct 2026, 02:00 IST, store as of 01:00)

> Every number below came from the live answer on the dry-run server (port 3001). The store refreshes hourly, so
> **run the questions once more just before the demo and read the numbers off the screen**: never from this page.

## Collector, 90 seconds: "monsoon morning"

1. **The Overview, as every morning.** Click **Ask the map…** on the map card and type
   **"waterlogging within 300 m of schools"**. The map grows to fill the page, flies to the results, rings ripple out from
   the schools and pins drop in:
   > **76 open flooding & waterlogging incidents are within 300 m of a school (last 30 days) · map layer ready.**
   > Most are in Kodambakkam (14) and Royapuram (11), near 64 schools; PWD Water Resources holds 34 of them.

   Point at the chips: `Flooding & waterlogging` `Open default` `Last 30 days default` `Within 300 m` `of Schools (OSM)`.
2. Type **"only severe"**: most pins fade, the view does not move.
   > **15** open severe flooding & waterlogging incidents are within 300 m of a school.
3. Click the worst one in the list: the map flies to it at street level, ringed, with its school's 300 m ring. Click
   again: its reports and status open.
4. Type **"compare with Adyar"**: the map pulls back to frame both zones, outlined in two colours with their counts.
   > Anna Nagar (Zone 8) **3**, Adyar (Zone 13) **0** (severe, within 300 m of a school).
5. Type **"send these to SWD"**: one draft for the Storm Water Drain department opens, its cases listed; press
   **Approve and send** (sandbox: it goes to the team inbox, a follow-up is set for 24 h, the audit log has the plan).
   For all departments press **Send to department**: on the 76-case answer that is 3 drafts (PWD Water Resources 34,
   Storm Water Drain 32, Greater Chennai Police 10).
6. Switch to Tamil: **"அடையாறு அருகே திறந்த புகார்கள்"**: a Tamil answer, and the map flies to Adyar.
   > அடையாறு இலிருந்து 1 கி.மீ க்குள் **4** திறந்த புகார்கள் (கடந்த 30 நாட்கள்) · வரைபட அடுக்கு தயார்.
7. Press the circle tool and drag a circle over a neighbourhood (or right-click any spot, or click a ward):
   **What is happening here?** The Area brief lists every department's open issues there. Typed instead,
   "what is happening in T. Nagar?" gave **26** open within 1 km (theft 6, flooding 5, road accidents 2 …).

## Officer, 30 seconds

Sign in as the Storm Water Drain officer. On the Board's map, **Ask the map**:
- **"my open cases near hospitals"** → **155** open incidents within 500 m of a hospital, *Storm Water Drain only*
  (the trace says so). Asking "SWM open cases near schools" is answered for SWD too, with "Your department only".
- **"plan my visits today"** (or the **Plan my visits** button) → numbered stops in order with straight-line legs and
  the total (on "open waterlogging in zone 9 this month": 6 stops, 11 km), **Open in Google Maps**.

## The line for the judges

"This is MapsAI's answer shape, built for a Collector: it speaks Tamil, every pin opens its evidence, it shows its
method, and every answer ends in an action."

---

## 12 questions a judge might ask (each tried on 28 Oct)

| # | Question | What to show | Measured |
|---|---|---|---|
| 1 | "How do you know it's within 300 m?" | Open **How this was worked out**: schools from OpenStreetMap, straight-line distance, and the cases left out for having no exact place | 647 schools; 5 left out |
| 2 | "What if a report's location is vague?" | Coarser than 2 km is never pinned; 51–2,000 m shows its accuracy circle on hover; "N with no exact place (counted, not pinned)" | rule in `mapplace.ts` |
| 3 | "Does the AI make up numbers?" | Every number is computed by the executor; the AI may only fill the typed plan or reword one sentence, which must carry exactly the template's numbers | 120/120 test questions answered with no AI |
| 4 | "And with no internet AI?" | The rules answer; set AI off and ask again | same answers |
| 5 | "Change 300 to 500 m" | The `Within 300 m ▾` chip → 500 m: rings grow, no AI call | instant |
| 6 | "Nearest hospital to each open severe flooding case" | Pins with their nearest hospital and distance | 50 cases, median 270 m |
| 7 | "Which ward is farthest from a fire station?" | The far point, a dashed line, the distance, and the honest note | Ward 79, 12.4 km (90 %); "OpenStreetMap lists 13 fire stations in the district; any it misses would bring these distances down" |
| 8 | "How long to drive there?" | Plain refusal with an alternative | "I measure straight-line distance … open Google Maps" |
| 9 | "Where are garbage complaints clustering?" | Clusters, Tour the top 3 | 177 clusters (90 days), largest 32 near Kosapet; Wards 63, 114, 59 above their neighbours |
| 10 | "Can an officer see other departments?" | Ask as the SWD officer for SWM cases | answered for SWD, "Your department only" |
| 11 | "Can I take this away?" | **Export** → CSV or GeoJSON | 76 rows for the 76 headline; as-of and plan in the header |
| 12 | "Where does the map come from?" | Legend and as-of line: Esri imagery, OSM (ODbL) facilities and roads, DataMeet ward boundaries (community data, not GCC-official) | built 28 Oct 2026 |

Also asked and answered: "thefts along Anna Salai this month" (1, Anna Salai drawn end to end; Follow the road),
"accidents on GST Road" (0, said plainly), "5 nearest police stations to Marina" (Triplicane PS at 1.2 km, the 5th at 3.6 km).
