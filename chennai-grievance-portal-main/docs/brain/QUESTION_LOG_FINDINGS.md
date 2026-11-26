# How badly the assistants answered: findings from the question logs

Read on 26 Nov 2026. All times are IST. Nothing was run against a paid model or a server.

## What was read

| Log | Size | What it holds | Limit |
|---|---|---|---|
| `data/thunai/audit.jsonl` | 842 lines, 29 Oct to 25 Nov | what was heard, the outcome and the lane | the answer text is not stored |
| `data/thunai/telemetry.ndjson` | 76,331 lines, 4 to 25 Nov | reader's kind, analyst's kind, lane, timings, ignored speech | no text; test runs are mixed in (rows with model `m` or `stand-in` were left out) |
| `data/thunai/memory-*.json` | 4 files | recent questions | nothing not already in the audit |
| `data/thunai/probe16` | 268 graded answers (22 Nov) replaying the owner's own questions | question, answer, verdict, issue | v16 build |
| `data/thunai/probe18`, `probe19` | 25 and 483 answers (24 and 25 Nov) | question, plan, answer | not graded; read here |
| `assistant_messages` in `durable.sqlite` | 61 question and answer pairs, 1 Oct to 18 Nov | chatbot (Ask District IQ) | `assistant_feedback` is empty: no thumbs up or down was ever recorded |
| `data/aws-cache/map-questions.jsonl` | 11,247 lines, 460 distinct | Ask the Map | almost all test runs |

The audit has 722 lines from the owner's own sign-in. Lines of one turn were joined: **450 owner turns, 406 distinct sentences**, over 13 days.
Where the answer text was not logged, the fault below is proved from the lane, from the telemetry, or by running the app's own matching code on
the sentence (`newsRequest` in `src/lib/thunai/v8/news8.ts`, bundled and run offline).

### Outcome of the 450 owner turns

| Outcome | Turns |
|---|---|
| A fixed screen (cases 49, news 38, city 36, focus 17, summary 14, brief 13, prices 13, ranking 11, readings 11, ...) | 244 |
| A console action (page, filter, panel) | 72 |
| v19 analyst screen (`screen ask`) | 29 |
| "instant" (news lane, map lane, a spoken line) | 42 |
| Spoken line only (not held, chat, meta) | 29 |
| Handed to the chatbot or a dataset | 8 |
| Too long, no model, cannot do, refused | 22 |
| Other (drafts, confirm) | 4 |

### Grades that exist

`probe16`, the owner's questions replayed on 22 Nov and graded one by one: **131 right, 96 partly, 32 wrong**, 6 not gradable, 3 ungraded.
So 51% of the 259 gradable answers were right. (The v19 build came after this; its 483 probe answers were not graded.)

## The failure patterns

Counts are owner turns, counted by hand from the log unless said. One turn can be in two patterns. Patterns 8 and 12 and the misheard names in 14 are judged counts ("about").

### 1. "The dashboard does not hold that", for data it does hold (partial data access). 10 owner turns, 4 more in probes

Cause: the analyst's instruction (`v19/plan.ts`) says the records hold six things only: incidents, traffic, air, rain, lakes and weather, prices and news. A model
that is told this must answer `not_held` for everything else. The refusal line is fixed: *"The dashboard does not hold X. I can answer from its incidents, traffic, air, rain, lakes, prices and news."*
Telemetry shows `analyst kind=not_held` on each of these.

| When | Heard | What happened | What the store holds |
|---|---|---|---|
| 25 Nov 22:53 | What are all the bed capacity of government hospitals in Chennai today? | not_held, no screen | `observations`: total beds, occupied beds, occupancy, doctors, nurses, OPD, medicine, ambulance for 9 hospitals, daily |
| 25 Nov 23:04 | So. Who is in charge of this taluk? Give me the contact details. | not_held | 48 officials in `official_contacts` (15 zonal officers among them). Tahsildars are not held, so the right answer says that and gives the zonal officer |
| 25 Nov 23:04 | Okay, give me the contact details of PWD department in search. | not_held | 21 PWD offices with officer, designation, phone and e-mail in `ref_offices` (the phone and e-mail are sample values, which the answer must say) |
| 25 Nov 23:10 | Show incidents reported by more than one newspaper but missing from the connected departmental application | not_held | `gaps`: 71 rows, **16 with 2 or more outlets** |
| 25 Nov 22:23 (twice) | What is the time to travel from Perungudi to Anna Nagar? | not_held | route times are not kept; live jams on the way are. A bare refusal was the wrong reply |
| 25 Nov 23:21 | When was the last time data was collected? | sent to the Data Studio lane, one spoken line | `source_health`: last run and status of 8 feeds |
| 25 Nov 23:15, 23:55 | tell me the data sources ... used for this briefing; What are the data's collected from external links | "meta" chat reply | `source_health`, `sources`, Studio datasets |
| 20 Nov 10:57 | Tell me where today. There will be rainfall. | "The dashboard only holds rainfall readings ... not a forecast" | `forecasts`: IMD 7-day forecast per station, 272 rows. No Jarvis recipe or v19 reader reads this table |
| 25 Nov probes | how many hospital beds are there (2), cases in ward 120, how many roads are closed now | not_held | all held (ward and closed roads were fixed the same day; beds were not) |
| 27 Oct 00:04 (chatbot) | Is there a cyclone warning? | "outside the Chennai district data" (fixed 20 minutes later) | `alerts`, news |

Also never reached from a question: petitions as petitions (only incidents tagged Manu), location review, reports that differ, stories and their steps,
contacts, PWD works and money, tasks, e-mails sent, decisions, workspaces, briefing archive, hotspots, anomalies, data quality, gates.

### 2. A question taken as a headline search. 19 owner turns, 10 of them on 25 Nov

Cause: before any understanding, the browser runs `newsLane8` (`v8/browser.ts`). Any sentence with "news", "report", "story" or "newses" is turned into a
search over headlines. Of the owner's 42 "instant" turns the matcher takes 23; only 4 of those were a request for a story. The other 19, with the search terms the matcher gives:

| When | Heard | Searched for |
|---|---|---|
| 25 Nov 22:24 | Okay, when was this news? Published. | published |
| 25 Nov 22:50 | Which particular incident or news I should concentrate first? | particular, incident, concentrate |
| 25 Nov 22:52 | Give me a summary of Thiruvottiyur, crime news and incidents. | summary, thiruvottiyur, crime, incidents |
| 25 Nov 22:53 | Is there any news regarding this? | regarding |
| 25 Nov 22:33 | ஆ. Is there any news near Temple today? | near, temple |
| 25 Nov 22:39 | School-க்கு பக்கத்துல இருக்கிற incidents-லாம் report ஆகிருக்கிற top 3 areas சொல்லு. | school, pakkattula, incidents, top, areas |
| 25 Nov 22:56 | ... News for the past twenty four hours in which newses there are conflicts ... | past, twenty, four, hours, conflicts |
| 25 Nov 22:58 | So what are all the incidents and news in which location is not known and it needs a review? | all, incidents, location, not, known, needs, review |
| 25 Nov 23:02 | So which department is showing stable improvements ... Regarding incidents and news. | department, stable, improvements, performance |
| 25 Nov 23:11 | Create a quarterly trend of incident categories and prepare a department-wise follow-up report | create, quarterly, trend, incident, categories, department |
| 24 Nov 00:35 | Top four news alone. | top, four, alone |
| 20 Nov 22:28 to 22:30 (5 times), 23 Nov 09:31 | இன்னைக்கு news காட்டு and the like | innaikku ("today") |
| 22 Nov 01:48 | இந்த news-அ. Close பண்ணு. | close |
| 20 Nov 10:59 | News page போ. | po ("go") |

The same matcher also takes: "Report the incidents not resolved by taluk" (incidents, not, resolved, taluk), "When was this news reported?" (reported),
"Give me the incident timeline of the Kasimedu story" (incident, timeline, kasimedu), "What is the bed occupancy report of hospitals?" (bed, occupancy,
hospitals), "Show the sources of this report" (sources). This one lane explains five of the owner's complaints at once: when reported, timeline, unresolved
by taluk, location review, differ.

### 3. Follow-ups lost or answered from the wrong thing. 23 owner turns, besides the two in pattern 2

| When | Earlier question | Follow-up heard | What happened |
|---|---|---|---|
| 1 Nov 20:22 | tomato price | தமில்லாக டிராஞ்சலைட் பண்ணி சொல்லவும் (say it in Tamil) | chatbot: "outside the data" |
| 4 Nov 14:22 | today's briefing in Tamil | tell in tamil read | silence on replay |
| 20 Nov 22:22 to 22:24 | Kodambakkam live traffic | Show me this in the map / Show it in the map / Zoom into the roads | case list, then a "Roads" filter three times, then the district summary |
| 21 Nov 23:18 | areas improving | weekly, monthly எல்லாமே சொல்லணும் | only set the period |
| 22 Nov 01:51 | Adyar against Alandur crime | Do it over a week. | on replay no reply; first answer used 24 hours |
| 22 Nov 11:54 | severe cases today | Which I should concentrate first? / Which incident ... / the incident alone ... | the same area summary three times |
| 24 Nov 14:46 | summary of Anna Nagar | Give me for forty eight hours / Me for 48 hours / Give me week | asked three times; the same brief screen each time |
| 25 Nov 09:24 | most congested area | Tell me all. | 24-hour roads incident summary instead of the jams |
| 25 Nov 22:38 | top three areas near schools | No, tell me the area's name. | list of places near schools again |
| 25 Nov 22:57 | reports that differ | Then what does that differ one mentioned in the dashboard / But it's showing one in the dashboard | "what changed" screen, then the Overview page opened |
| 25 Nov 23:04 | taluk ranking | Who is in charge of this taluk? | not held |
| 25 Nov 23:15 | sources of the briefing | Show me that. | a Data Studio dataset |
| 25 Nov 23:18 | past deadline, PWD, 7 days | From this show me only Royapuram incidents. | a plain console filter, the other limits gone |
| 25 Nov 23:20 | near Srinivasa Priya Hospital | What are the complaints near this hospital? | instant lane, no screen |
| 25 Nov 23:35 | petitions from Manu | Open this petition and its image / No, I'm asking the Manu petition | a spoken line, then the same incident list |
| 4 Oct 23:25 (chatbot, twice) | Ambattur news | tell me more about the sixth story | the same district list both times |

### 4. Generic requests guessed, never asked back. 10 owner turns

The v19 plan has four kinds (`answer`, `view`, `not_held`, `other`). There is no "ask the Collector" kind, so the model must pick a measure.

"Give me top three areas." (25 Nov 22:41, ranked by something unsaid), "Give me a summary of. Crime in." (23:11), "Happening." (23:00, gave news), "Manali."
(22:32), "Since." (24 Nov 18:52, ran the last one again), "Tell me all." (25 Nov 09:24), "T. Nagar வந்து." (21 Nov, on replay it opened Teynampet with no hint),
"Madhavaram. தப்பு தேட்டா?" (23 Nov, a traffic screen), "road accidents, flooding and public interest" (23:07),
"Draft and mail." (22 Nov, refused).

### 5. Sources and "how do you know" not answered. 8 owner turns

"Why didn't you get till 1st November?" (1 Nov 21:19): the chatbot **made up** a reason, *"reporting cut-off captured only drinking-water incidents"*.
"Show every source and application record used to create this briefing." (25 Nov 23:11 and 23:12, a brief demo question): the rules only opened the briefing page and the
sources panel, with nothing said, both times. Then "tell me the data sources and application used for this briefing" (23:15, chat reply), "Show me that." (a dataset), "Show me the
data sources." (panel). "... At record you are saying that these are the repeated traffic. Do you have any?" (22:32): the list again, not the record. "When was the last time data was
collected?" (23:21).

### 6. The seven demo questions of the brief, as tried on 25 Nov

| Demo question | Tried at | Result |
|---|---|---|
| 1 weekly summary of flooding, accidents and public infrastructure | 23:07, 23:08, 23:09 | asked three times. The summary screen has one subject slot (`topic: Topic or null` in `recipes/summary.ts`), so three subjects cannot all be answered |
| 2 more than one newspaper, not in department records | 23:10 | not held (pattern 1). On 12 Oct the chatbot answered "253", then "0" after a change; the table holds 16 |
| 3 quarterly trend and department follow-up report | 23:11 | headline search (pattern 2) |
| 4 today's briefing, three most serious, read the action summary | 23:12 | 24-hour brief screen; the planner spoke a short line |
| 5 taluks with most unresolved last month | 23:10 | answered by the analyst (the only one of the seven) |
| 6 every source and application record | 23:11, 23:12 | panel opened, nothing said |
| 7 save the workspace and reopen last week's | 23:12 | planner spoke a line; no `workspace` step was taken. `workspaces` holds three rows, none from the last week |

### 7. Words on the screen taken as orders. 19 owner turns

A word rule fires on one word and changes the console instead of answering: "Zoom into the roads" sets the category Roads, footpaths (3 times, 20 Nov); "See live
traffic" sets Traffic obstruction, Severe (20 Nov); "Show me live traffic in map" sets a category and the severe layer (21 Nov); "Where are the flooded roads?" gave road-damage cases (21 Nov);
"Storm drain water, Raya Buram" and "field staff report water studying at Royapuram" gave drinking water (1 and 2 Nov); "But it's showing one in the dashboard",
"this is overall dashboard", "This is the dashboard too" open the Overview page; "What are my tasks to do today?" only set the period to daily (22 Nov); "இன்று நேரம் என்ன
இப்போது?" (what time is it) set the period (2 Nov); "Customize this dashboard into only overview and Data Studio page" opened Data Studio (25 Nov); "Okay, close all the pages and go to Data Studio
page" was refused as a deletion (20 Nov); "Give me a full overview dashboard for PWD" opened the Overview (24 Nov); a garbled Tamil sentence with the word தரவு opened Data Studio (1 Nov); "tell in tamil todyas briefing" only opened
the page (4 Nov); "Top four severe cases explain" only set a filter (24 Nov).

### 8. The right screen but not the thing asked (grain, rank, number, measure). About 25 owner turns, most before v19

Areas when one incident was asked; five when two were asked (25 Nov 09:25, and again after he complained in Tamil); the most congested when the second was asked; the attention
score when complaints were asked (20 Nov 10:57); open incidents when overdue or open complaints were asked (9 Nov, 3 times); a city average when one market was asked
(KK Nagar banana, 2 Nov); a list of 35 streets when the one most flooded street was asked (1 Nov 21:20); areas when roads were asked (22 Nov 01:50); one zone when two were named (18
Nov, 4 Nov). On the v19 probes: "Who handles the most severe cases?", "which zone police are the busiest", "what percentage of cases are past deadline" answered over 24 hours with
no window said in the question.

### 9. The wrong window. 18 distinct probe questions (of 483 answers), 1 owner turn

In the first v19 runs 7 questions with a window said were answered over the last 24 hours, and 11 open-ended ones ("the longest", "share", "busiest") were silently cut to 24 hours: "second worst zone for garbage **this week**", "top 4 localities
**this month**", "which day **last week**", "women safety cases from **last weekend**" ("none in the records"), "did severe go up compared to **last week**" ("7 in the last 24 hours,
the same as ... 1 day before"), "which police cases are waiting **the longest**" ("59 over the last 24 hours"), "which of the zones **has improved the most**". Owner: 22 Nov, violent crime "over a week" compared over 24
hours. Two compared sides once had two different windows (Adyar 7 days, Anna Nagar 24 hours) and the answer still named a winner.

### 10. Wrong place. 6 probe answers

"The zone Perambur lies in" was said to be Royapuram; 121 of 123 Perambur incidents are in Thiru-Vi-Ka-Nagar. "Teynampet, the zone that covers T Nagar" (5 answers); 112 of 114
T. Nagar incidents are in **Kodambakkam**. Each gave exact figures of the wrong zone.

### 11. Old or conflicting data said as now. 6 owner or probe questions

Vegetable prices end on 6 Oct; asked on 25 Nov, one answer said the 6 Oct price "falls within the last 7 days". Manali's AQI of 261 is a reading of 22 Nov 01:00 and was given as "right now" on 25
Nov. Lakes have two sources that disagree: Chembarambakkam is 33.6% (CMWSSB daily page) and 92% (PWD sample feed); Puzhal 69% and 92%. Answers never say which one was used. The chatbot repeated a week-old cyclone answer word for word (15 Nov).

### 12. Today's summary without the news; news without the substance. About 10 owner turns (the answer text is not in the log; the first two are the owner's own report)

"Give me a brief of today" (25 Nov 23:48), "Prepare today's district briefing" (23:12), "இன்னைக்கு, இன்சிடன்ஸ்லாம் சொல்லு" (1 Nov): counts and severe cases, no news. "Read today's news" answered
"12 headlines." (4 Nov and replay), "2 headlines about construction ban" (18 Nov). "Okay, read today's news." (25 Nov 22:23): the answer was cut at the client deadline. Asked twice or more in
one sitting on 20, 21, 22, 23 Nov.

### 13. Reports that differ change between minutes. 3 owner turns on 25 Nov, and the stored verdicts

The verdict is made by a model over a **batch** of stories (`news-conflicts3`, 254 stored batches). Which stories share a batch changes with every new report, so
the same story is judged again next to others. In the stored batches: one model calls a later development an "update", another calls it a "conflict"; "December 1" against "December 1, 2026" was called a
difference; a different number of reports counts as "the same incident" each time. `data/news-verdicts.json` (since 23 Nov) keeps verdicts by report set, but a new report makes a new set. Jarvis
then answered from the news search, not from this list (pattern 2), so the tile said one and he said none.

### 14. Speech: cut sentences, doubled phrases, wrong names. About 60 of 406 sentences

- **Cut in the middle by a full stop or question mark: about 37** ("Which area is? Highly congested traffic.", "Okay, when was this news? Published.", "Give me the new. News about Kolathur MLA.", "Zoom. Into hundred feet road ...").
- **A phrase said or heard twice: 9** ("Compare vegetable prices over markets today. Compare vegetable prices over markets today. over markets today.").
- **Names and words misheard, about 25:** Raya Buram, Raya Puraam (Royapuram), Coletour (Kolathur), madavaram, Pallikarnai, last train / last range (last rain), CR quality / YAR quality / யார் quality (air quality), task mark (TASMAC), prime (crime), compliance (complaints), Transpage (Trends page),
  Superview page (Overview), incidence (incidents), water studying (waterlogging), Javas / Javed (Jarvis), LMI ABOICOL TUNEWS.
- **In his own speech out loud:** answers carry filler tails. "Nothing in the dashboard or the latest news mentions *Where did the fire accident happen today*" (the question echoed as a topic) is in 7 of the graded answers; "Nothing needs you yet" in 2; "open the link" advice in others.
- 72 sounds were ignored (unclear 20, not addressed to Jarvis 19, side talk 12, the rest aside, filler or his own voice).

### 15. No answer in time, or a refusal of something harmless. 22 owner turns

Client deadline 10 times (Tamil questions about murders, schools and repeat roads on 21 and 22 Nov; crime in 30 days on 24 Nov; today's news on 25 Nov); "cannot do" 3 times; no model 1; refused 8 ("What is deep learning?" twice, "Tell me about the tomato
places to see", "close all the pages"). Over 353 turns of the running site (owner and test sign-ins): half within 2.3 s, one in ten over 6.1 s, the longest 16.2 s.

### 16. Wrong language. 5 owner turns

Asked for Tamil and got English (4 Nov, briefing); English asked and Tamil spoken ("Why are you speaking in Tamil all of a sudden?", 4 Nov, answered in Tamil on replay); a request to translate taken as a new question.

## The chatbot (Ask District IQ): 61 answers, about 25 wrong or weak

| When | Asked | Got |
|---|---|---|
| 1 Oct (4 times) | Which department is slowest? / Severe incidents by department (officer) | "Severe events: 0" |
| 1 Oct (2) | Which areas have the most complaints? | "Reported: 89" |
| 2 Oct | dengue news? | a category chart |
| 3 Oct | tell m eabout the incidnet in last 7 days | searched for the word "incident": 0 |
| 4 Oct | hi tell me about deaths happening recently | a greeting |
| 4 Oct (3) | cm new scheme / inaiku takali velai ena / Yeah | "could not work that out without the language model" |
| 4 Oct | tell me ambattur news | "Top district news" |
| 13 Oct | any tasks for me to do? | one incident |
| 16 Oct (3) | law student news, then the whole text pasted, then "it is a ews in thanthi" | "No matching story" three times |
| 27 Oct | Complaints in Adyar this month | 449 **incidents** called complaints |
| 1 Nov | theft area wise | an old zone filter kept: Madhavaram only |
| 1 Nov | Why didn't you get till 1st November? | an invented reason |
| 1 Nov | show me the flooded streets in the map | counts, no map |
| 15 Nov | latest cyclone news (after akwan cyclone) | the same answer again |

## What the new brain must do (from these logs)

1. Read every table the dashboard draws from. Say "not held" only after a search of the data dictionary, and then give the nearest thing held.
2. Understand first. No word lane (news, control, map) may take a sentence before it is understood as a whole.
3. Keep the subject: place, department, kind, window, rank, the list on screen, the last story, petition or person. A follow-up changes only what it names.
4. Ask back with two or three choices when the measure or the subject is missing.
5. Every answer can name its tables, records, window and time, and whether data is old, sample or in conflict.
6. "Today" and "summary" mean all kinds plus the news, warnings and what is past deadline, not severe only.
7. Several subjects, several parts, "except", "only", "second", "two": all of them in one answer.
8. One verdict per story for "differ", kept until its own reports change.
9. Repair speech before understanding: join cut sentences, drop doubled phrases, map names by ear to the real zones, taluks, roads, lakes, outlets; say the guess aloud.
10. Never place a locality in a zone from memory: use the incidents and the gazetteer.

## The evaluation bank

`src/lib/brain/eval/bank.json`: 1,258 items in 49 groups. `owner-raw` (179) and `chatbot-log` (23) are the real questions, kept with their speech errors and their real earlier turns; the rest were composed on the real names in the
store. 236 items carry earlier turns. Facts in `must` are described, not frozen as numbers, because the store changes every hour. `lang` is `ta` for Tamil script (also when mixed with English words) and `tanglish` for Tamil in Latin letters. `tables` uses store table names, and these for other sources:
`stories`, `news_conflicts`, `newsdesk`, `nearby_news`, `locreview`, `cmwssb_lakes`, `live_traffic`, `map_layers`, `rehearsal`, `studio_datasets`, `map`.
