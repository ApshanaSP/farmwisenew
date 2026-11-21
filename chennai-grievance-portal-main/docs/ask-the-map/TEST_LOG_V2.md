# Ask the Map v2: test log

21 November 2026, branch `claude/askmap-v2-e4d529` (cut from `claude/askmap-collector-final-333e26`; not in `main`). What was asked, what the right answer is, what the map answered, what broke and what was fixed.

## 1. How it was tested

| Check | How | Result |
|---|---|---|
| Unit tests, map and console | `npx vitest run src/lib/map src/components/collector src/lib/ai src/lib/city src/lib/assistant` | **2,479 passed** (143 files) |
| Unit tests, Ask the Map only | `npx vitest run src/lib/map src/components/collector/app/askmap` | 560 passed (557 before the v2 features; new: `spell.test.ts` 10, `v2.test.ts` 3) |
| Golden, frozen store, no AI | `npm run eval:golden -- src/lib/map` on `eval/store` frozen 20 Nov 2026 23:59 | **35 of 35** in 5 files (30 from the final version, 2 typo tests, 3 v2 tests) |
| Typecheck | `npx tsc --noEmit -p .` | clean |
| Lint | `npx next lint` | no errors |
| Production build | `next build` in its own dist folder (`.next-build-v2`, deleted afterwards) | passes; `/api/map/brief` and `/api/map/scorecard` built |
| Live, dev server | the Collector console at `localhost:3014` (dry-run store, QA test collector), in the browser pane and through `/api/map/ask` from the page | sections 3 and 4 |
| AI plan eval | `mapai.live.ts` on `eval/map-final/dev.json`, now with the speller first (the console's path) | RESULTS_V2.md |

The eval store had to be frozen again: `scripts/freeze-eval-store.cjs` stopped at "no such function: pii_enc" (the durable store's triggers call the PII functions). The script now registers them as pass-through on its copy (personal fields are cleared anyway).

## 2. Typos and loose spelling: the measure

`eval/map-v2/typos.json`: 72 questions typed the way a hurried officer types (English slips, Tamil names spelt loosely in English, Tanglish, Tamil script, dropped spaces, shorthand), each paired with the same question written correctly. `typos.golden.ts` asks both through `askMap` (rules only, no AI) and counts a pass when both get the same plan (or the same area brief). Every correct form is checked to be answered, so a pair can never pass by both being refused.

| Set | Speller off (the code before v2) | Speller on |
|---|---|---|
| 72 tuned questions (`typos.json`) | 35 | **72** |
| 24 held-out questions (`typos-holdout.json`), first run, never tuned against | 13 | **21** |
| the same 24 after three general fixes (below) | 13 | 23 |

The "off" column includes two v2 rule changes that help it too (Tanglish "la" read as "in", "ATM illa" read as a gap), so the code before v2 scored no higher than 35 and 13.

The three held-out misses on the first run, and what each taught:
- "theft near pallikarnai" asked "Did you mean Pallikaranai or pallikarani?" (the second is a spelling inside a longer name). Fixed: a one-word place beats spellings of it inside longer names.
- "severe flooding in ambatur" asked "ambattur or ambathur?". The same fix.
- "mosquito complaints by zon": three letters were never corrected. Fixed: a three-letter word is read as a four-letter map word one dropped letter away ("zon" zone, "wrd" ward), and nothing else.
- Still missed after the fixes (held out): "severe flooding in ambatur" asks "Did you mean ambattur or ambathur?": both spellings are names in the place list, so the map asks instead of guessing. The answer after a tap is right.
- "thefts along ana salai" (tuned set) needed one more fix: a three-letter English word ("ana") may stand in a name typed one letter off.

While tuning, one existing golden failed: "waterlogging within half a km of government hospitals" became "Government Hospital" (a facility's name spelt like two map words). Fixed: words that are all map words or English are never read as a place spelt like them. All 30 earlier golden questions pass again.

## 3. Questions asked on the running app

Asked in the console (dev server, 21 Nov 2026 about 00:20–01:00 IST) through `/api/map/ask` from the page, each next to its correct form; the independent count is a small counter written for this log in the pattern of `scripts/askmap-oracle.mjs` (raw layer files only: plain loops, its own haversine, each point's own ward and the ward file's zone; it shares no code with the map).

| Typed | Read as (shown on the answer) | Count | Correct form's count | Independent count | |
|---|---|---|---|---|---|
| hospitls near adayar | 'hospitls' as hospitals, 'adayar' as Adyar | 11 | 11 | 11 hospitals within 1 km of Adyar's point | ✓ |
| garbge in velacheri this week | garbage, Velachery | 7 | 7 | (golden-style: the same plan) | ✓ |
| tasmak shops near schools | tasmac | 4 of 31 | 4 of 31 | 4 (final's oracle, unchanged data) | ✓ |
| atm illa wards 2 km kulla | (nothing to correct; "illa" read as a gap) | 49 wards | 49 | (golden `300 random plans` invariants) | ✓ |
| kuppai pugar velacheri la | Velachery | 7 | 7 | same plan | ✓ |
| அடையார் அருகே மருத்துவமனைகள் | அடையார் → அடையாறு | 11 | 11 | 11 | ✓ |
| thefts nr ATMs this week | 'nr' as near | 49 | 49 | same plan | ✓ |
| banks in anna nager | Anna Nagar | 23 | 23 | 23 banks in Zone 8 (own ward to zone) | ✓ |
| mosquito complaints by zon | zone | 11 | 11 | same plan | ✓ |
| which ward is farthst from a fire staton | farthest, station | Ward 79 | Ward 79 | same plan | ✓ |
| pharmacys in tnagar | T. Nagar, pharmacy | 6 | 6 | 6 pharmacies within 1 km of T. Nagar | ✓ |
| floding in zone 13 this week | flooding | 17 | 17 | same plan | ✓ |
| open complaints near mylapur | Mylapore | 18 | — | — | shape ✓ (camera frames the 1 km circle) |

### The new features, live

| What | Result |
|---|---|
| The workspace (1440 px): chat docked full height on the left, map on the right, the line between them drags and takes ←/→ (Shift for bigger steps), Home/End, Enter resets | ✓ |
| "Chat only" and "Map only" fold a side; "Show the chat" brings it back; remembered in the browser | ✓ |
| A panel dragged off its dock floats over the whole map as before; Dock puts it back | ✓ (unchanged code path) |
| Phone width (375 px): map above, the chat as the sheet below | ✓ |
| Play the period: "flooding this month", Play: the bars fill day by day, the map shows "Up to 26 Oct: 12 on the map", × shows all again | ✓ |
| Ward scorecard: "ward 178 scorecard" (also from a shared link): 23 open, 20 past deadline, 2 severe, 11 from citizens, rank 22 of 200, the 30 days against 30; Print scorecard opens a one-page HTML | ✓ (golden: open and rank equal the raw rows for wards 178, 9 and 120) |
| "ward 250 scorecard" | "There is no Ward 250. Chennai has wards 1 to 200." ✓ |
| Copy link: `/collector?ask=garbge%20complaints%20this%20month` opened the console, grew the map, asked the question (as the signed-in officer), took `ask` out of the address | ✓ |
| Print brief: `/api/map/brief?q=garbge complaints this month`: question, "119 open garbage & solid waste complaints (last 30 days)", 66 past deadline, how it was worked out, the top 25 of 119, an SVG ward map with the places | ✓ |

## 4. Bugs found and fixed

1. **The map kept its full width beside the docked chat**, so half of it was off-screen and answers framed out of view. A `width:100%` rule on the map's box beat the new `left`. Fixed: `width:auto` in the workspace; the camera's padding no longer leaves room for a panel that is beside the map, not over it; the answer is framed again whenever the split opens, a side folds or a drag ends.
2. **Opening Ask the Map left the district at the edge of the new pane.** Fixed: on growing into the workspace with no answer yet, the district is framed in its pane.
3. **"Velachery la" was read as "Velachery Lake"** (a name two letters off when "la" is joined to it). Fixed: a fuzzy name match needs every word of three letters or more.
4. **"velacheri", "adayar" were left as typed**: they are words inside other place names (street and lake names). Fixed: a word of a longer name that sounds like, or is one letter off, a one-word place is that place; a place spelt like a zone's name is the zone's name ("Adayar" is Adyar, Zone 13).
5. **"nadakkudhu" became "nikkudhu"** (Tanglish not in the speller's list). Fixed: the Tanglish words the rules read are map words.
6. **"arnd" became "and".** Fixed: shorthand is read first ("arnd" around, "nr" near); a three-letter map word is never a target for a four-letter slip.
7. **"அடையார்" was not read as "அடையாறு"**, "மயிலாபூர்" not as "மயிலாப்பூர்". Fixed: a Tamil sound key (ற/ர, ள/ழ/ல, ண/ன/ந, a doubled consonant, the final dead consonant or short u) with the ending kept.
8. **The dev server restarted itself (memory) once**, which replaces the local store; the QA account was seeded again (`data/aws-cache/qa/seed-v2.mjs`, gitignored, registers the PII functions as the task said).

## 5. The AI plan step

**Groq, the night of 21 Nov (no usable numbers).** Three tries: the full set with the dev server running (Groq answered 1 call, then every model was "busy or rate-limited" and the gateway rested Groq: 44 of 45 failed in about 11 ms); with the console's background AI off (no Groq call made; stopped after 20); 10 questions with the dev server stopped (the frozen store's background steps used Groq's and Gemini's free allowance while loading; timed out). Groq's key itself worked (a direct call, 200).

**Claude Haiku 5.5, 21 Nov 12:20–13:10 IST**, after the owner supplied a working key (a one-call check first: 17 tokens in, 5 out):

| Run | Result | US$ |
|---|---|---|
| `mapai.live.ts`, dev set (45), v2 code | 33 of 45; median 3.2 s; 332,684 cached tokens read | 0.0227 |
| the same after `fitModelPlan` takes the server's language and the question's exact category words | 40 of 45 | 0.0215 |
| `typoai.live.ts`, 70 tuned typo pairs (2 briefs skipped) | key fields: 44 as typed, 52 after the speller; whole plan: 20 and 18 | 0.0713 |
| the same, 24 held out | key fields: 13 and 14; whole plan: 4 and 3 | (in the line above) |
| the typo run again after adding the key-field score | 44 / 52 tuned, 13 / 14 held out (the numbers above) | 0.0729 |

The first run's 12 misses: a family instead of the exact category (DRAINAGE for drainage, ROADS_TRAFFIC for road accidents, STRUCTURES_LAND for encroachment), a category left out (sewage), a code that does not exist (DRINKING_WATER for drinking water), two Tamil-script questions tagged Tanglish, "nearest pharmacy to Marina Beach" not measured from the place, "dengue cases bunching up" refused, the Tanglish rank question read as a count, "severe flooding … in Zone 13" without the flood family, and "children's play areas" without parks. The words fix (`route.ts fitModelPlan`, `modelwords.test.ts`) took 7 of these. Ledger: US$1.746 before, US$1.949 after.

## 6. Claude reads first: every run and every fix, question by question

All runs Claude Haiku 5.5 through `askai.live.ts` (the console's path). Question sets: `eval/map-final/dev.json` (45), `eval/map-v2/ai-holdout.json` (15, written before any AI-first run, never tuned), `big.json` (170, written in one go), `fresh.json` (80, written after the big-set fixes, never tuned), `followups.json` (15 conversations, 32 turns), the typo pairs (72 + 24). "First run" is the honest score for a set; later runs are after fixes made from it.

| Run | dev | held out | big | fresh | follow-ups | typos | typos held out | independent counts | US$ |
|---|---|---|---|---|---|---|---|---|---|
| AI step only, before (morning) | 33/45 | — | — | — | — | — | — | — | 0.023 |
| AI step only, after the words fixes | 40/45, then 43, 44 | 14/15 | — | — | — | — | — | — | 0.03 each |
| 1: console, Claude first | 45/45 | 15/15 | — | — | — | 61/72 | 20/24 | — | 0.083 |
| 2 | 45/45 | 14/15 | **162/170** (first run) | — | — | 69/72 | 23/24 (allowance ran out: rules answered) | 10 of 10 same | 0.164 |
| 3 | 45/45 | 15/15 | 166/170 | — | **32/32** (first run) | 72/72 | 22/24 | 25 of 25 same | 0.188 + 0.033 |
| 4 (stopped after the big set) | 45/45 | 15/15 | 168/169 | — | — | — | — | same | — |
| 5 | — | — | — | **77/80** (first run) | 32/32 | 72/72 | 22/24 | — | 0.107 |
| 6 + 7 (final, after all fixes) | 45/45 | 15/15 | 169/170 | 80/80 | 32/32 | 72/72 | 22/24 | 25 of 25 same | 0.33 |

### What each miss was, and the fix (at its cause)

| Question | What went wrong | Fix |
|---|---|---|
| e07 which zones saw drainage complaints rise the most | family DRAINAGE, not the category | the exact category a word names replaces a family or a guess (`fitModelPlan`) |
| e13 sewage overflow near government schools | category left out | the same |
| e20 drinking water complaints ward by ward | a code that does not exist (DRINKING_WATER) | the same |
| e10 mosquito complaints around public toilets | FLOOD chosen (one run) | a category no word of the question names is replaced |
| t23, t24 Tamil questions | tagged Tanglish | the server's language wins |
| t28 ration shops near road accidents | family ROADS_TRAFFIC | exact category |
| e19 where are dengue cases bunching up; h41 garbage near my list | refused as not a map question | prompt: what counts as a map question, clustering words, my list |
| g31 indha maasam endha ward-la kuppai … jaasthi aagiruchu | a count by ward, not a league table | Tanglish rise words in the rules; a count becomes a ranked change when the words ask which area rose |
| h36 stray dog menace near children's play areas | no parks layer | play areas are playgrounds (words, prompt) |
| h34 open severe flooding … in Zone 13 | flood family missing | family filled from the words |
| h38 encroachment near lakes gone up | STRUCTURES_LAND | exact category |
| e08 rank wards by the drop | order rise | the league table's direction from the words |
| e12 nearest pharmacy to Marina Beach | the search started nowhere | a nearest search starts at the one place named |
| a12 dengue spots clustering in the north | area after the clusters / a count | the area first, then the clusters; clusters when asked |
| t59 மண்டலம் 13 இல் வெள்ளம் | the speller made மண்டலம் (zone) a place, தண்டலம் | Tamil question words are never corrected (a real bug the rules-only test hid) |
| t45 thanni nikkudhu mylapur la | zone 0 | zones 1–15 and wards 1–200 only (`checkPlan`) |
| t08, t19, t21, t37, t46, t54, h05, h06, h15 (… in Anna Nagar, Kodambakkam la …) | the neighbourhood point, not the zone or taluk | every reading of a name offered to Claude; "in X" read as an area holds (`keepAreas`) |
| t57 அடையார் அருகே மருத்துவமனைகள் | the place left out | a place the rules found is put back |
| b019, b159, b148 metro stations, railway stations, traffic jams near metro | answered as live train or traffic status | a named map layer makes it a map question unless it asks about now (map only; the shared reader is Jarvis's) |
| b105 banks in anna nager zone | the speller read "Anna Nagar(Zone 7)", an office's label | names with digits or brackets are never a spelling target; area words never stand in a name |
| b120 ward vaariyaga kosu pugar | no count by ward | Tanglish count-by words (map only); a count by area added when asked |
| b144, b152, b155 dark spots, crimes against women, flood relief | a broader category | word lists for each |
| b122 petrol bunk pakkathula theeppidi | the fuel layer taken and not used | an unused layer means near (500 m) |
| b153 public toilet complaints in zone 6 | DRAINAGE_SEWAGE | words for toilet complaints |
| b160 fair price shops near Tondiarpet | nearest, not a list near | prompt: facilities near a place are listed within its radius (a different example in the prompt) |
| b132 ஏரிகள் அருகே மழைநீர் தேக்கம் | PWD lakes layer | prompt: lakes in general are water_bodies |
| f29 illegal parking and traffic jams near schools | answered as live traffic | any named layer makes it a map question |
| f30 unsafe old buildings in zone 4 | no category | words for old and dilapidated buildings |
| f34 enga ellam vibathu jaasthi nadakkudhu | a count, not clusters | "enga … jaasthi" with words between |
| h08 fire statoins near royapuram | the zone | "near X" read as the point holds |
| h12 severe flooding in ambatur | the place left out (a spelling tie) | the first reading's rules plan holds the place; the readings shown as buttons |

Unit tests after the fixes: 576 (from 557), golden 36/36 (a regression test for the crash below).

One crash found by the big set: "banks in zone 13 more than 2 km from an ATM" planned a gap measured from the banks of Zone 13, and the executor had no spatial index for a collection made by an area step (a server error in the console). Fixed: the index is made on first use (`execute.ts indexOf`); the answer now is "176 wards have no bank within 2 km for much of their ground". Every fix has a unit test (`modelwords.test.ts`, `modelshape.test.ts`, `spell.test.ts`).
