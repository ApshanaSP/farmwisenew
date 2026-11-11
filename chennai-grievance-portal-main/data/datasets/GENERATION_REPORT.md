# Grievance dataset: generation report

Generated 2026-10-04 11:33 IST with seed `42`, 180 days ending 2026-10-04, mean 90/day.
Mode: CSV only (nothing written to MySQL).

## Totals

|  | Rows |
|---|---|
| Synthetic complaints | 16283 |
| Real complaints (is_synthetic = 0) | 2 |
| Status-history rows | 92501 |
| of which base volume | 15138 |
| of which hotspot bursts | 168 |
| of which planted near-duplicates | 977 |
| Details rewritten to keep ward/day text unique | 0 |


## Rain events

Thunderstorm days (the day and the two after it are boosted): **2026-05-19, 2026-07-18, 2026-08-09, 2026-08-10, 2026-08-28, 2026-09-06, 2026-09-19, 2026-09-20**. Override with `--rain-days` to align with IMD rainfall.

| Rain day | Water multiplier | Complaints that day | Water Stagnation + SWD + Flood that day |
|---|---|---|---|
| 2026-05-19 | 3.60 | 134 | 48 |
| 2026-07-18 | 3.45 | 127 | 36 |
| 2026-08-09 | 3.85 | 83 | 35 |
| 2026-08-10 | 3.85 | 125 | 41 |
| 2026-08-28 | 3.17 | 126 | 46 |
| 2026-09-06 | 3.53 | 128 | 36 |
| 2026-09-19 | 3.27 | 126 | 31 |
| 2026-09-20 | 3.62 | 98 | 36 |


## Complaints per day

One row per week (Monday first). `*` = rain-event day.

| Week of | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|---|
| 2026-04-08 |  |  | 79 | 99 | 72 | 88 | 71 |
| 2026-04-13 | 76 | 94 | 96 | 83 | 95 | 83 | 59 |
| 2026-04-20 | 101 | 73 | 78 | 92 | 104 | 110 | 73 |
| 2026-04-27 | 83 | 85 | 84 | 67 | 78 | 77 | 76 |
| 2026-05-04 | 83 | 96 | 82 | 87 | 83 | 80 | 61 |
| 2026-05-11 | 101 | 95 | 87 | 87 | 76 | 99 | 62 |
| 2026-05-18 | 99 | 134* | 138 | 148 | 72 | 93 | 65 |
| 2026-05-25 | 109 | 87 | 85 | 84 | 87 | 89 | 62 |
| 2026-06-01 | 106 | 90 | 72 | 84 | 72 | 84 | 64 |
| 2026-06-08 | 88 | 80 | 97 | 84 | 84 | 91 | 53 |
| 2026-06-15 | 103 | 105 | 68 | 73 | 83 | 78 | 64 |
| 2026-06-22 | 102 | 95 | 77 | 84 | 89 | 96 | 78 |
| 2026-06-29 | 95 | 88 | 91 | 57 | 84 | 94 | 76 |
| 2026-07-06 | 95 | 72 | 114 | 105 | 73 | 89 | 49 |
| 2026-07-13 | 103 | 100 | 95 | 104 | 88 | 127* | 83 |
| 2026-07-20 | 146 | 85 | 99 | 89 | 99 | 86 | 78 |
| 2026-07-27 | 101 | 97 | 87 | 113 | 89 | 75 | 53 |
| 2026-08-03 | 90 | 78 | 88 | 77 | 91 | 86 | 83* |
| 2026-08-10 | 125* | 132 | 149 | 111 | 93 | 82 | 65 |
| 2026-08-17 | 90 | 103 | 77 | 84 | 101 | 83 | 69 |
| 2026-08-24 | 103 | 80 | 82 | 87 | 126* | 133 | 105 |
| 2026-08-31 | 101 | 94 | 87 | 83 | 86 | 91 | 128* |
| 2026-09-07 | 163 | 156 | 83 | 84 | 97 | 90 | 69 |
| 2026-09-14 | 95 | 76 | 81 | 95 | 97 | 126* | 98* |
| 2026-09-21 | 161 | 147 | 114 | 96 | 86 | 97 | 50 |
| 2026-09-28 | 78 | 87 | 92 | 101 | 87 | 87 | 17 |


## By category

| Category | Complaints | Share |
|---|---|---|
| Garbage | 3450 | 21.2% |
| Road and Footpath | 2262 | 13.9% |
| Street Light | 2107 | 12.9% |
| Public Health | 1932 | 11.9% |
| Water Stagnation | 1814 | 11.1% |
| Storm Water Drains | 838 | 5.1% |
| Park and Playground | 669 | 4.1% |
| Public Toilet | 615 | 3.8% |
| Other | 606 | 3.7% |
| General | 469 | 2.9% |
| Tax and Licence | 424 | 2.6% |
| Building Plan Permission | 322 | 2.0% |
| Flood | 207 | 1.3% |
| MEGA STREETS - CONSTRUCTION PHASE | 183 | 1.1% |
| Voter ID | 153 | 0.9% |
| Air Quality | 140 | 0.9% |
| MEGA STREETS - OPERATION PHASE | 52 | 0.3% |
| MEGA STREETS - PLANNING PHASE | 40 | 0.2% |


## By department

| Department | Complaints | Share |
|---|---|---|
| Solid Waste Management Department | 3450 | 21.2% |
| Engineering Department (Town Planning & Building Permissions) | 2859 | 17.6% |
| Storm Water Drain Department | 2859 | 17.6% |
| Health Department | 2714 | 16.7% |
| Electrical Department | 2129 | 13.1% |
| Parks & Play Fields Department | 754 | 4.6% |
| General Administration | 649 | 4.0% |
| Revenue Department | 457 | 2.8% |
| Education Department | 106 | 0.7% |
| Land & Estate Department | 81 | 0.5% |
| Family Welfare Department | 65 | 0.4% |
| Buildings Department | 43 | 0.3% |
| Bridges Department | 38 | 0.2% |
| Council Department | 32 | 0.2% |
| Mechanical Engineering Department | 28 | 0.2% |
| Financial Management Unit | 19 | 0.1% |


## By zone

| Zone | Complaints | Share |
|---|---|---|
| 9 Teynampet | 1750 | 10.7% |
| 4 Tondiarpet | 1489 | 9.1% |
| 10 Kodambakkam | 1483 | 9.1% |
| 5 Royapuram | 1469 | 9.0% |
| 6 Thiru-Vi-Ka-Nagar | 1369 | 8.4% |
| 8 Anna Nagar | 1312 | 8.1% |
| 7 Ambattur | 1076 | 6.6% |
| 13 Adyar | 1062 | 6.5% |
| 1 Thiruvottiyur | 994 | 6.1% |
| 11 Valasaravakkam | 955 | 5.9% |
| 14 Perungudi | 836 | 5.1% |
| 3 Madhavaram | 820 | 5.0% |
| 12 Alandur | 811 | 5.0% |
| 15 Sholinganallur | 568 | 3.5% |
| 2 Manali | 289 | 1.8% |


## By status

| Status | Complaints | Share |
|---|---|---|
| Verified by Collector | 14098 | 86.6% |
| Rejected | 1238 | 7.6% |
| In Progress | 504 | 3.1% |
| Pending Approval | 250 | 1.5% |
| Approved by Department Officer | 102 | 0.6% |
| Completed - Pending Collector Verification | 90 | 0.6% |
| Complaint Filed | 1 | 0.0% |


Rejected at: Department Officer 930, Collector 308.


Last 3 days (257 complaints): Pending Approval 125, In Progress 77, Approved by Department Officer 35, Verified by Collector 7, Completed - Pending Collector Verification 6, Rejected 6, Complaint Filed 1.


Stalled (a gap of 10+ days before the next step): 1924 (11.8%), Engineering Department (Town Planning & Building Permissions) 709, Storm Water Drain Department 558, Solid Waste Management Department 218, Health Department 181.


## By priority

Snapshot as of 2026-10-04 11:33 (days open is part of the score).

| Priority | Complaints | Share |
|---|---|---|
| Low | 8825 | 54.2% |
| Medium | 6236 | 38.3% |
| High | 1127 | 6.9% |
| Critical | 95 | 0.6% |


## By language

| Detected language | Complaints | Share |
|---|---|---|
| en | 9903 | 60.8% |
| ta | 3919 | 24.1% |
| tanglish | 2461 | 15.1% |


The `languageOf()` detector agrees with the language each non-junk text was written in for 15989 of 16050 (99.6%).


## Duplicates and hotspots

- Planted near-duplicates: **977** re-reports in **938** groups (same sub type, 5-140 m, within 72 h, different complainant, reworded).
- The rule-based `Duplicate Group` column puts **977 of 977** (100.0%) planted re-reports in the same group as their original, and flags 1130 complaints in total as belonging to an earlier complaint's group.
- Ground truth is kept out of the main file, in `_truth/duplicate_truth.csv`.

| Hotspot | Sub type | Ward | Zone | Starts | Complaints | Rain-driven |
|---|---|---|---|---|---|---|
| HOT-01 | Removal of Garbage | 40 | Tondiarpet | 2026-07-16 08:08 | 20 | no |
| HOT-02 | Removal of Garbage | 139 | Kodambakkam | 2026-08-12 21:07 | 10 | no |
| HOT-03 | Water entering Home/Shop | 43 | Tondiarpet | 2026-08-28 20:00 | 7 | yes |
| HOT-04 | Mosquito Menace | 23 | Madhavaram | 2026-08-12 15:01 | 15 | no |
| HOT-05 | Street Dogs | 157 | Alandur | 2026-09-05 21:19 | 17 | no |
| HOT-06 | Removal of Fallen Trees | 143 | Valasaravakkam | 2026-09-06 14:00 | 14 | yes |
| HOT-07 | Stagnation of Water | 63 | Royapuram | 2026-05-19 08:00 | 6 | yes |
| HOT-08 | Street Dogs | 72 | Thiru-Vi-Ka-Nagar | 2026-09-22 22:17 | 18 | no |
| HOT-09 | Pot hole fill up / Repairs to the damaged surface | 159 | Alandur | 2026-07-25 16:16 | 18 | no |
| HOT-10 | Pot hole fill up / Repairs to the damaged surface | 91 | Ambattur | 2026-04-24 23:01 | 12 | no |
| HOT-11 | Pot hole fill up / Repairs to the damaged surface | 197 | Sholinganallur | 2026-08-05 14:03 | 16 | no |
| HOT-12 | Mosquito Menace | 69 | Thiru-Vi-Ka-Nagar | 2026-09-22 20:35 | 5 | no |
| HOT-13 | Mosquito Menace | 27 | Madhavaram | 2026-06-30 11:05 | 10 | no |


## Validation

| # | Check | Result | Detail |
|---|---|---|---|
| 1 | Headers exact, in order, with BOM | PASS | 38 + 6 columns |
| 2 | Type / sub type / department / routing basis match the DB | PASS | 16285 rows |
| 3 | Needs officer review <=> assumed/unmapped | PASS | consistent |
| 4 | Lat/lng inside the Ward polygon; Ward in its Zone | PASS | 14075 pinned rows inside their ward |
| 5 | GCC-list street belongs to an area mapped to the ward | PASS | 14176 synthetic rows |
| 6 | Typed by citizen <=> Area and Locality blank | PASS | consistent |
| 7 | Anonymous = Yes <=> complainant columns blank | PASS | 1355 anonymous rows |
| 8 | Complaint No format, uniqueness, year = Filed On year | PASS | 16285 unique codes |
| 9 | History replays to Status; timestamps increase; Last Updated; Rejected At | PASS | 92501 history rows for 16285 complaints |
| 10 | Title/Details/Landmark lengths; Tamil round-trips | PASS | 1 rows with Tamil text identical to MySQL after re-reading the file |
| 11 | Every day has complaints; all 7 statuses and 16 departments appear | PASS | 180 days with complaints, 7 statuses, 16 departments |
| 12 | Real rows byte-identical (cols 1-31) to npm run export:data | PASS | 2 real row(s) identical |
| 13 | duplicate_truth.csv refers only to synthetic complaints | PASS | 2083 rows |


## One sample row per status

### Complaint Filed

```
2026-574CEJ,2026-10-04 11:28,Complaint Filed,,Public Health,Mosquito Menace,Health Department,Auto-routed,mapped,8,Anna Nagar,97,map_boundary,ANNA NAGAR EAST,N BLOCK,N- BLOCK 19TH  STREET,From GCC list,Near Murugan Temple bus stop,600101,13.0958664,80.2293835,Kosu thollai,"Kosu thollai romba jaasthi, dengue vara chance irukku. Fogging pannunga. Indha maasam fogging vandi varala. Night la innum mosam. Already rendu thadava complaint pannom, no action.",No,Selvi,Female,9000051514,selvi406@example.com,"No. 165/2, Thirumangalam 3rd Lane",No,2026-10-04 11:28,1,tanglish,61,High,"High-risk issue: Mosquito Menace (+35); Affects a bus stop, a place of worship (+16); Citizen reports complaining before (+10)",2026-574CEJ,1
```

### Pending Approval

```
2026-912XLH,2026-08-31 12:26,Pending Approval,,Garbage,Cleaning of Water Table,Solid Waste Management Department,Auto-routed,mapped,14,Perungudi,191,map_boundary,PALLIKARANAI,BETHEL NAGAR,KARPAGA VINAYAGAR FIRST CROSS STREET,From GCC list,,,12.9107718,80.1999887,Kuppai problem,"Cleaning of Water Table problem rendu vaaram ah irukku, yaarum kandukala. Engal sandhula 30 family daily kashtapadranga. Konjam urgent ah paarunga sir.",No,Tamilselvi,Female,9000023602,,"No. 220, Kamaraj Nagar 4th Street",No,2026-08-31 12:43,1,tanglish,35,Medium,"Civic issue: Cleaning of Water Table (+15); Open 33 days, over twice the 3-day target (+20)",2026-912XLH,1
```

### Approved by Department Officer

```
2026-559LRF,2026-08-30 18:28,Approved by Department Officer,,Road and Footpath,Pot hole fill up / Repairs to the damaged surface,Engineering Department (Town Planning & Building Permissions),Needs officer review,assumed,6,Thiru-Vi-Ka-Nagar,73,map_boundary,PULIANTHOPE,J.J.NAGAR,J.J.NAGAR 7TH STREET,From GCC list,,,13.1030274,80.2541873,Pot hole fill up / Repairs to the damaged surface,Road surface is badly damaged in our area with deep potholes for the last 10 days. Metal plates left after the cable work are sticking out. There is a hospital nearby and ambulances find it hard to pass. Request you to look into this urgently.,No,C. P. Pavithra Arumugam,Female,9000088418,,"No. 69, Ganesh Nagar 8th St",Yes,2026-09-01 20:41,1,en,53,High,"Public-safety or sanitation issue: Pot hole fill up / Repairs to the damaged surface (+25); Affects a hospital or health centre (+8); Open 34 days, over twice the 9-day target (+20)",2026-559LRF,1
```

### In Progress

```
2026-019QDM,2026-08-11 20:19,In Progress,,MEGA STREETS - OPERATION PHASE,Encroaching Public Space (MC Road),Engineering Department (Town Planning & Building Permissions),Needs officer review,assumed,5,Royapuram,62,map_boundary,CHINDATRIPET,NAVALAR NEDUNCHEZHIYAN NAGAR,NAVALAR NEDUNCHEZHIYAN NAGAR LANES SLUM,From GCC list,,600013,13.0735913,80.2687917,Encroaching Public Space (MC Road),Regarding the mega streets project: encroaching public space (mc road). This has continued since last Monday. The half-finished work has narrowed the road to one lane. About 19 houses on the street are affected.,Yes,,,,,,No,2026-08-13 01:41,1,en,35,Medium,"Civic issue: Encroaching Public Space (MC Road) (+15); Open 53 days, over twice the 16-day target (+20)",2026-019QDM,1
```

### Completed - Pending Collector Verification

```
2026-856RWF,2026-08-15 18:35,Completed - Pending Collector Verification,,Road and Footpath,Relaying of Road,Engineering Department (Town Planning & Building Permissions),Needs officer review,assumed,11,Valasaravakkam,154,map_boundary,,,kalaignar 4th Colony,Typed by citizen,அங்கன்வாடி மையம் அருகில்,,13.0266515,80.1748048,Relaying of Road,Complaint about relaying of road in our street. It gets worse every time it rains. Accidents are happening frequently. Kindly send someone to inspect.,No,Valli,Female,9000070763,,"No. 122, Varadappan Street",No,2026-10-01 13:36,1,en,43,Medium,"Civic issue: Relaying of Road (+15); Affects a school or anganwadi (+8); Open 49 days, over twice the 9-day target (+20)",2026-856RWF,1
```

### Verified by Collector

```
2026-099ABA,2026-04-08 00:24,Verified by Collector,,Garbage,Burning of Garbage at Dumping Ground,Solid Waste Management Department,Auto-routed,mapped,4,Tondiarpet,45,map_boundary,VYASARPADI,ANNA NAGAR,ANNA NAGAR - V STREET,From GCC list,மாநகராட்சி பள்ளி அருகில்,600021,13.1145784,80.2573437,Burning of Garbage at Dumping Ground,My elderly parents live on Anna Nagar - V Street. Garbage at the dumping ground is burning for two weeks now. Thick smoke is covering the whole area. Hotel waste is dumped here late at night. Kindly send someone to inspect.,No,Murugan Babu,Male,9000069982,,"No. 92, Thamarai Quarters (Thiruvalleeswarar Nagar)",Yes,2026-04-11 16:02,1,en,41,Medium,"Public-safety or sanitation issue: Burning of Garbage at Dumping Ground (+25); Affects a school or anganwadi, elderly people (+16)",2026-099ABA,1
```

### Rejected

```
2026-401AJB,2026-04-08 07:33,Rejected,Department Officer,Road and Footpath,Formation of New Road,Engineering Department (Town Planning & Building Permissions),Needs officer review,assumed,7,Ambattur,93,map_boundary,MOGAPPAIR,PADI,T.S.KRISHNA NAGAR,From GCC list,Near Post Office,,13.0765728,80.1894232,Formation of New Road,test,No,G. E. Sangeetha,Female,9000036251,sangeethag205@example.in,"No. 209, G.K.M. Colony 26th Cross Street",Yes,2026-04-08 22:39,1,en,15,Low,Civic issue: Formation of New Road (+15),2026-401AJB,1
```
