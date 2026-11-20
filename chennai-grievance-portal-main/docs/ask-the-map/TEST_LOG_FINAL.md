# Ask the Map final: test log

20 November 2026, branch `claude/askmap-collector-final-333e26`. What was asked, what the right answer is (counted independently), what the map answered, what broke and what was fixed.

## 1. How it was tested

| Check | How | Result |
|---|---|---|
| Unit tests, Ask the Map | `npx vitest run src/lib/map src/components/collector/app/askmap src/lib/ai src/lib/city` | **679 passed** (598 before this work; 81 new: `final.test.ts`, `uploads.final.test.ts`) |
| Unit tests, whole app | `npx vitest run` | 8,438 of 8,443 passed. The 5 failures were Jarvis tests timing out at 12–19 s while the dev server, two AI evals and the build ran beside them; the same 5 files run alone: **55 of 55 passed** |
| Typecheck | `npx tsc --noEmit -p .` | clean |
| Lint | `npx next lint` | no errors (warnings only, all in files this work did not touch) |
| Build | `next build` (own dist folder) | see section 6 |
| Golden, frozen store, no AI | `npm run eval:golden -- src/lib/map` on `eval/store` frozen 20 Nov 2026 | before: **19 of 20** (one failure); after: **30 of 30** (20 old + 10 new) |
| Live, dev server | the Collector console at `localhost:3012` (dry-run store, QA test collector), in the browser pane: the panel's tools, the Ask box, and `/api/map/ask` called from the page as the panel calls it | sections 3 and 4 |
| AI plan eval | `src/lib/map/mapai.live.ts` on `eval/map-final/dev.json` (45 questions written for this; not the blind set) | section 5 |

The independent counts in section 3 come from `scripts/askmap-oracle.mjs`: it reads the raw layer files and the ward file only, with plain loops and its own haversine, and shares no code with the map's executor. The golden tests' oracles (`map.golden.ts`, `final.golden.ts`) count incidents from the raw rows the same way.

## 2. The golden sets, before and after

- **Before** (code at `de01e264`, the same frozen store): `map.golden.ts` stopped at its 16th question, "accidents near metro stations": the live-city reader took "metro stations" for a question about trains (`kind: say`). Every check after it in that test never ran. `followups.golden.ts`: 12 of 12.
- **Fixed:** Ask the Map now keeps a question that names an incident category near stations as a map question (`ask.ts`; the shared city reader that Jarvis uses is unchanged).
- **Then found:** "past-deadline cases near hospitals" counted 318 against the oracle's 183. The map was right: since RC-34, "past its deadline" is the store's flag **or** the due time gone by the console's clock; the oracle still read the flag only. The oracle was brought to the console's rule (`map.golden.ts`), not the map changed.
- **After:** 30 of 30, including `final.golden.ts` (rule checks, gaps per neighbourhood, the league table, Collector layers in an area and near incidents, the Tamil rule check, the meeting packs' numbers).

## 3. Questions asked on the running app

Asked in the console (dev server, 20 Nov 2026 about 22:15–23:40 IST). "Right answer" is the independent count; ✓ means the map's number equals it. AI = whether a model was used.

### The Collector's layers

| Question | Right answer | The map's answer | |
|---|---|---|---|
| banks | 482 | "482 banks in Chennai district." + partial-list note | ✓ |
| ATMs in Zone 13 | 46 | "46 ATMs in Adyar (Zone 13)." | ✓ |
| courts | 9 | "9 courts in Chennai district." | ✓ |
| playgrounds in Zone 11 | 1 | "1 playground in Valasaravakkam (Zone 11)." | ✓ |
| ration shops | 18 | "18 ration shops in Chennai district." + "OpenStreetMap, 18 ration shops, not the full list; Civil Supplies (TNPDS) holds the full one." | ✓ (after the fix in 4.1) |
| ration shops in Tondiarpet | 0 | "No ration shops in Tondiarpet (Zone 4) on the map." + the partial note | ✓ |
| crematoriums | 10 | "10 crematoriums in Chennai district." | ✓ |
| burial grounds in Zone 3 | 5 | "5 cemeteries and crematoriums in Madhavaram (Zone 3)." | ✓ |
| petrol bunks | 230 | "230 fuel stations in Chennai district." | ✓ |
| how many temples in Mylapore | 57 (by the map's taluk rule) | "57 temples in Mylapore taluk." | ✓ (golden-style check) |
| atms near Adyar | 3 within 1 km of Adyar's point | "3 ATMs within 1 km of Adyar." | ✓ |
| வங்கிகள் | 482 | "சென்னை மாவட்டம் 482 வங்கிகள்." | ✓ |
| மதுக்கடைகள் | 31 | "சென்னை மாவட்டம் 31 மதுக்கடைகள்." | ✓ |
| பூங்காக்கள் | 616 | "சென்னை மாவட்டம் 616 பூங்காக்கள்." | ✓ |
| பள்ளிவாசல்கள் (mosques) | 78 | "சென்னை மாவட்டம் 78 பள்ளிவாசல்கள்." (not schools: see 4.4) | ✓ |

### Rule checks

| Question | Right answer | The map's answer | |
|---|---|---|---|
| wine shops within 100 m of schools | 4 of 31 | "4 of 31 wine shops are within 100 m of a school" + "You set this distance; confirm the legal distance with the Excise desk." | ✓ |
| tasmac shops near temples | 7 (100 m default) | "7 of 31 … within 100 m of a place of worship" | ✓ |
| Rule check button: wine shops, schools + places of worship, 100 m | 12 | "12 of 31 wine shops are within 100 m of a school or place of worship"; the pairs table names each shop and what it is near; lines and rings on the map | ✓ |
| liquor shops and bars within 200 m of schools or temples | 33 of 73 | "33 of 73 wine shops and bars are within 200 m of a place of worship or school" | ✓ (after 4.5) |
| பள்ளிகளுக்கு 100 மீட்டருக்குள் உள்ள மதுக்கடைகள் | 4 of 31 | "31 மதுக்கடைகள் இல் 4, பள்ளி இலிருந்து 100 மீ க்குள்" | ✓ (after 4.6) |
| bars near colleges | 0 of 42 | "None of the 42 bars and pubs on the map is within 100 m of a college." | ✓ |
| schools near hospitals | 499 of 647 (500 m) | "499 of 647 schools are within 500 m of a hospital" + "Straight-line distance" (no Excise note) | ✓ (after 4.3) |

### Gaps

| Question | Right answer | The map's answer | |
|---|---|---|---|
| Gaps button: neighbourhoods, 2 km, a ration shop | 199 of 422 (18 shops) | "199 of 422 neighbourhoods are more than 2 km from a ration shop"; the gap list (CSV, print) | ✓ (53 before the ration fix: the wrong shops were "Corporation" offices) |
| neighbourhoods more than 3 km from a bank | 26 of 422 | "26 of 422 neighbourhoods are more than 3 km from a bank" + partial note | ✓ |
| வங்கியிலிருந்து 2 கி.மீ க்கு மேல் உள்ள பகுதிகள் | 41 of 422 | "422 பகுதிகளில் 41, வங்கி இலிருந்து 2 கி.மீ க்கு மேல்" | ✓ |
| wards with no ATM within 2 km | the executor's 200 m grid (golden `300 random plans` checks its invariants) | "49 wards have no ATM within 2 km for much of their ground" | ✓ (golden) |
| which ward is farthest from a pharmacy | — | "Ward 196 is the farthest from a pharmacy: 90 % of it is within 5.3 km" | shape ✓ |
| ATM illadha wards 2 km kulla | a ward gap | listed all ATMs | ✗ → fixed (4.7) |

### Ranked change (the league table)

| Question | Right answer | The map's answer | |
|---|---|---|---|
| which wards got worse for flooding this month | each ward's two 30-day counts (golden oracle: every row equal) | "108 wards got worse … Ward 197 rose most, from 13 to 29"; league table, red and green bubbles | ✓ (golden) |
| most improved zones for garbage | the same, by zone, the fall | "10 zones improved … Tondiarpet (Zone 4) fell most, from 20 to 13" | ✓ |
| இந்த மாதம் எந்த வார்டுகளில் வெள்ளம் அதிகரித்தது | as above | "108 வார்டுகள் அதிகரித்தன; முதலில் வார்டு 197: 13 இலிருந்து 29" | ✓ |
| which 5 zones got worse this week | — | "12 zones got worse … Teynampet (Zone 9) rose most, from 88 to 180" (the table shows the top 10; "5" is not used) | ✓ (limit noted) |

### Incidents near the new layers

| Question | Right answer | The map's answer | |
|---|---|---|---|
| garbage complaints near markets | golden oracle (raw rows, haversine) | 6 open complaints within 500 m of a market | ✓ (golden) |
| thefts near ATMs this week | — | "50 open theft, snatching & fraud incidents are within 500 m of an ATM" + partial note | ✓ |
| fires near fuel stations | — | 1 | ✓ |
| mosquito complaints near public toilets | — | 2 | ✓ |
| road accidents near bus stands | — | 7 | ✓ |
| ration kadai pakkathula kuppai | — | "500 m kulla ration shop pakkathula 23 … irukku" (Tanglish) | ✓ (count before the ration fix) |
| மதுக்கூடங்கள் அருகே திருட்டு | — | 9 | ✓ |
| incidents near my list | — | 17 within 500 m of the approved test list | ✓ |

### Refusals and limits (unchanged, re-checked)

| Question | Expected | Got |
|---|---|---|
| banks in Zone 99 | "There is no Zone 99" | ✓ |
| ward 250 ration shops | "There is no Ward 250" | ✓ |
| forecast flooding tomorrow near schools | no forecast | ✓ |
| who is the complainant near Adyar | never personal data | ✓ |
| asdf qwer | not a map question | ✓ (14 s, because the AI providers were busy; see 5) |

### The panel and the pages

| What | Result |
|---|---|
| Tools row (Gaps, Rule check, Meeting pack, Your lists) | ✓ opens and closes, aria-expanded, keyboard reachable |
| Gap list: table, All, CSV, Print | ✓ |
| Rule check: setting kept in this browser, Excise note, pairs table, CSV | ✓ |
| League table: rows focusable, Enter or click shows that ward's cases; CSV; Print | ✓ |
| Meeting packs: weekly, bank, pre-monsoon (HTML page, SVG ward map, numbers, top 10s) | ✓ all three; the bank pack's numbers equal the map's own answers (golden) |
| Your lists: upload CSV, review rows, approve, show on the map, ask near it, remove | ✓ |
| Upload limits: 2 MB+ file refused (413), a .txt refused (400) | ✓ |
| Legend: Collector layers coloured, "OpenStreetMap, N …, not the full list" | ✓ |
| Phone width (375 px): panel, tools, answers | ✓ (tools scroll in one row after 4.10) |
| Tamil answers for the new shapes | ✓ |

## 4. Bugs found and fixed

1. **Ration shops were mostly not ration shops.** The Overpass name search for "ration" matched "Corpo*ration*", "Refrige*ration*": 146 of 164 were wrong (LIC offices, sales corporations). The plan doc's 162 came from the same search. Fixed: whole-word names only; OSM has **18**. A gap answer went from 53 to 199 neighbourhoods more than 2 km from a ration shop.
2. **Words the rules had read were sent to the AI as "unread"** ("got worse", "more than 3 km from", "past-deadline", "neighbourhoods", Tamil "அதிகரித்தது"): slow answers (up to 21 s with the free models), and once the AI dropped the overdue filter the rules had read. Fixed: those words count as read.
3. **"schools near hospitals" said "confirm the legal distance with the Excise desk"** and used 100 m. Fixed: the Excise note and 100 m only for licensed premises; other places near places use 500 m and say "straight-line distance".
4. **"பள்ளிவாசல்" (mosque) also matched "பள்ளி" (school).** Fixed: a Collector layer's words are taken out once read.
5. **"within 200 m of schools or temples" measured from schools only** and treated temples as the subject. Fixed: a place joined by "or"/"and" to one measured from is measured from too; "wine shops and bars" keeps both kinds.
6. **Tamil "பள்ளிகளுக்கு 100 மீட்டருக்குள்"** (the distance after the place) was not read as "near". Fixed.
7. **Tanglish "ATM illadha wards"** listed ATMs. Fixed: "illadha/illatha" and "இல்லாத வார்டு" are gap words.
8. **A gap from an empty layer crashed** (no ATMs in a test world; an empty list). Fixed: "There are no … on the map to measure from."; a meeting pack's section says so and the pack is still made.
9. **List upload placed rows by their own names** ("Relief Centre" → Chennai Central, "Nowhere Nagar" → T. Nagar). Fixed: only the address column, and only a known place named whole in it, longest name first.
10. **The pack page and printed tables were unreadable in a dark browser**; the tools wrapped to two rows on a phone. Fixed.
11. Wording: "a ATM" → "an ATM"; kinds by name ("4 of 31 wine shops", "bars and pubs"); "past-deadline" in the headline; "against in the 30 days before" → "against the 30 days before"; the Tamil partial note no longer has an English office name in it.
12. The golden set's one failure ("accidents near metro stations") and the stale overdue oracle (section 2).

One round of fixes, then one skeptic pass (the golden sets and the live battery again), as the lessons from v10 say.

## 5. The AI plan step: Claude Haiku 5.5 against the current providers

See RESULTS_FINAL.md for the table. In short: on the live settings the current providers mostly cannot answer (Bedrock keys expired, Groq's free per-minute limits, Gemini's free tier busy), and Claude could not be measured because the Anthropic key in the portal's `.env` is refused (401). Raw lines: the eval logs listed in RESULTS_FINAL.md.

## 6. Build

See RESULTS_FINAL.md (filled in when the build finished).
