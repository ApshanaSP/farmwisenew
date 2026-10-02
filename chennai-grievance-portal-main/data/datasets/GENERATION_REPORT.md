# Grievance dataset: generation report

Generated 2026-10-02 12:44 IST with seed `42`, 180 days ending 2026-10-02, mean 90/day.
Mode: CSV only (nothing written to MySQL).

## Totals

|  | Rows |
|---|---|
| Synthetic complaints | 16199 |
| Real complaints (is_synthetic = 0) | 2 |
| Status-history rows | 92104 |
| of which base volume | 15098 |
| of which hotspot bursts | 129 |
| of which planted near-duplicates | 972 |
| Details rewritten to keep ward/day text unique | 0 |


## Rain events

Thunderstorm days (the day and the two after it are boosted): **2026-05-19, 2026-07-18, 2026-08-09, 2026-08-10, 2026-08-28, 2026-09-06, 2026-09-19, 2026-09-20**. Override with `--rain-days` to align with IMD rainfall.

| Rain day | Water multiplier | Complaints that day | Water Stagnation + SWD + Flood that day |
|---|---|---|---|
| 2026-05-19 | 3.60 | 145 | 63 |
| 2026-07-18 | 3.45 | 113 | 38 |
| 2026-08-09 | 3.85 | 108 | 57 |
| 2026-08-10 | 3.85 | 154 | 58 |
| 2026-08-28 | 3.17 | 114 | 27 |
| 2026-09-06 | 3.53 | 72 | 27 |
| 2026-09-19 | 3.27 | 118 | 39 |
| 2026-09-20 | 3.62 | 80 | 25 |


## Complaints per day

One row per week (Monday first). `*` = rain-event day.

| Week of | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|---|
| 2026-04-06 | 90 | 96 | 78 | 83 | 82 | 87 | 69 |
| 2026-04-13 | 96 | 93 | 88 | 83 | 92 | 72 | 68 |
| 2026-04-20 | 95 | 72 | 82 | 78 | 77 | 93 | 72 |
| 2026-04-27 | 89 | 92 | 77 | 81 | 82 | 88 | 74 |
| 2026-05-04 | 113 | 90 | 76 | 92 | 79 | 78 | 46 |
| 2026-05-11 | 107 | 90 | 99 | 108 | 83 | 82 | 68 |
| 2026-05-18 | 96 | 145* | 143 | 142 | 106 | 91 | 64 |
| 2026-05-25 | 92 | 95 | 80 | 107 | 92 | 78 | 73 |
| 2026-06-01 | 101 | 85 | 96 | 106 | 82 | 101 | 75 |
| 2026-06-08 | 106 | 100 | 95 | 93 | 90 | 87 | 67 |
| 2026-06-15 | 109 | 77 | 100 | 97 | 98 | 96 | 68 |
| 2026-06-22 | 98 | 88 | 88 | 86 | 89 | 81 | 63 |
| 2026-06-29 | 115 | 79 | 87 | 99 | 68 | 82 | 80 |
| 2026-07-06 | 91 | 92 | 91 | 90 | 90 | 103 | 74 |
| 2026-07-13 | 90 | 79 | 78 | 94 | 91 | 113* | 100 |
| 2026-07-20 | 116 | 82 | 73 | 82 | 84 | 81 | 75 |
| 2026-07-27 | 92 | 101 | 81 | 83 | 94 | 75 | 54 |
| 2026-08-03 | 104 | 90 | 107 | 89 | 86 | 89 | 108* |
| 2026-08-10 | 154* | 149 | 125 | 87 | 86 | 95 | 71 |
| 2026-08-17 | 101 | 71 | 73 | 87 | 94 | 82 | 64 |
| 2026-08-24 | 109 | 91 | 80 | 95 | 114* | 135 | 106 |
| 2026-08-31 | 87 | 81 | 90 | 82 | 101 | 78 | 72* |
| 2026-09-07 | 132 | 143 | 87 | 77 | 89 | 77 | 83 |
| 2026-09-14 | 86 | 82 | 82 | 81 | 75 | 118* | 80* |
| 2026-09-21 | 143 | 145 | 88 | 81 | 98 | 58 | 67 |
| 2026-09-28 | 84 | 71 | 79 | 93 | 42 |  |  |


## By category

| Category | Complaints | Share |
|---|---|---|
| Garbage | 3470 | 21.4% |
| Road and Footpath | 2221 | 13.7% |
| Street Light | 2070 | 12.8% |
| Public Health | 1865 | 11.5% |
| Water Stagnation | 1790 | 11.1% |
| Storm Water Drains | 823 | 5.1% |
| Park and Playground | 687 | 4.2% |
| Other | 633 | 3.9% |
| Public Toilet | 616 | 3.8% |
| General | 459 | 2.8% |
| Tax and Licence | 436 | 2.7% |
| Building Plan Permission | 311 | 1.9% |
| MEGA STREETS - CONSTRUCTION PHASE | 209 | 1.3% |
| Flood | 206 | 1.3% |
| Air Quality | 159 | 1.0% |
| Voter ID | 146 | 0.9% |
| MEGA STREETS - OPERATION PHASE | 59 | 0.4% |
| MEGA STREETS - PLANNING PHASE | 39 | 0.2% |


## By department

| Department | Complaints | Share |
|---|---|---|
| Solid Waste Management Department | 3470 | 21.4% |
| Engineering Department (Town Planning & Building Permissions) | 2839 | 17.5% |
| Storm Water Drain Department | 2819 | 17.4% |
| Health Department | 2668 | 16.5% |
| Electrical Department | 2094 | 12.9% |
| Parks & Play Fields Department | 766 | 4.7% |
| General Administration | 634 | 3.9% |
| Revenue Department | 466 | 2.9% |
| Education Department | 119 | 0.7% |
| Land & Estate Department | 83 | 0.5% |
| Family Welfare Department | 69 | 0.4% |
| Buildings Department | 47 | 0.3% |
| Bridges Department | 37 | 0.2% |
| Council Department | 35 | 0.2% |
| Mechanical Engineering Department | 34 | 0.2% |
| Financial Management Unit | 19 | 0.1% |


## By zone

| Zone | Complaints | Share |
|---|---|---|
| 9 Teynampet | 1757 | 10.8% |
| 5 Royapuram | 1481 | 9.1% |
| 4 Tondiarpet | 1464 | 9.0% |
| 10 Kodambakkam | 1432 | 8.8% |
| 6 Thiru-Vi-Ka-Nagar | 1372 | 8.5% |
| 8 Anna Nagar | 1315 | 8.1% |
| 7 Ambattur | 1134 | 7.0% |
| 13 Adyar | 1061 | 6.5% |
| 1 Thiruvottiyur | 963 | 5.9% |
| 11 Valasaravakkam | 953 | 5.9% |
| 3 Madhavaram | 827 | 5.1% |
| 14 Perungudi | 798 | 4.9% |
| 12 Alandur | 778 | 4.8% |
| 15 Sholinganallur | 560 | 3.5% |
| 2 Manali | 304 | 1.9% |


## By status

| Status | Complaints | Share |
|---|---|---|
| Verified by Collector | 14079 | 86.9% |
| Rejected | 1237 | 7.6% |
| In Progress | 425 | 2.6% |
| Pending Approval | 268 | 1.7% |
| Approved by Department Officer | 107 | 0.7% |
| Completed - Pending Collector Verification | 83 | 0.5% |


Rejected at: Department Officer 922, Collector 315.


Last 3 days (258 complaints): Pending Approval 142, In Progress 64, Approved by Department Officer 39, Rejected 7, Completed - Pending Collector Verification 5, Verified by Collector 1.


Stalled (a gap of 10+ days before the next step): 1964 (12.1%), Engineering Department (Town Planning & Building Permissions) 726, Storm Water Drain Department 594, Solid Waste Management Department 224, Health Department 161.


## By priority

Snapshot as of 2026-10-02 12:43 (days open is part of the score).

| Priority | Complaints | Share |
|---|---|---|
| Low | 8806 | 54.4% |
| Medium | 6221 | 38.4% |
| High | 1098 | 6.8% |
| Critical | 74 | 0.5% |


## By language

| Detected language | Complaints | Share |
|---|---|---|
| en | 9883 | 61.0% |
| ta | 3863 | 23.8% |
| tanglish | 2453 | 15.1% |


The `languageOf()` detector agrees with the language each non-junk text was written in for 15909 of 15967 (99.6%).


## Duplicates and hotspots

- Planted near-duplicates: **972** re-reports in **913** groups (same sub type, 5-140 m, within 72 h, different complainant, reworded).
- The rule-based `Duplicate Group` column puts **972 of 972** (100.0%) planted re-reports in the same group as their original, and flags 1088 complaints in total as belonging to an earlier complaint's group.
- Ground truth is kept out of the main file, in `_truth/duplicate_truth.csv`.

| Hotspot | Sub type | Ward | Zone | Starts | Complaints | Rain-driven |
|---|---|---|---|---|---|---|
| HOT-01 | Street Dogs | 107 | Anna Nagar | 2026-07-06 20:57 | 11 | no |
| HOT-02 | Stagnation of Water | 79 | Ambattur | 2026-05-19 11:00 | 12 | yes |
| HOT-03 | Obstruction of Water Flow | 129 | Kodambakkam | 2026-08-10 18:00 | 11 | yes |
| HOT-04 | Stagnation of Water | 54 | Royapuram | 2026-05-19 10:00 | 8 | yes |
| HOT-05 | Overflowing of Garbage Bin | 90 | Ambattur | 2026-06-13 08:29 | 15 | no |
| HOT-06 | Removal of Fallen Trees | 173 | Adyar | 2026-05-19 08:00 | 7 | yes |
| HOT-07 | Burning of Garbage at Dumping Ground | 84 | Ambattur | 2026-07-24 08:58 | 5 | no |
| HOT-08 | Non burning of Street lights | 143 | Valasaravakkam | 2026-04-16 14:41 | 5 | no |
| HOT-09 | Overflowing of Garbage Bin | 91 | Ambattur | 2026-09-04 15:22 | 13 | no |
| HOT-10 | Non burning of Street lights | 169 | Perungudi | 2026-06-19 05:06 | 7 | no |
| HOT-11 | Water entering Home/Shop | 196 | Sholinganallur | 2026-08-09 07:00 | 11 | yes |
| HOT-12 | Removal of Fallen Trees | 116 | Teynampet | 2026-05-19 10:00 | 7 | yes |
| HOT-13 | Pot hole fill up / Repairs to the damaged surface | 29 | Madhavaram | 2026-06-01 04:44 | 17 | no |


## Validation

| # | Check | Result | Detail |
|---|---|---|---|
| 1 | Headers exact, in order, with BOM | PASS | 38 + 6 columns |
| 2 | Type / sub type / department / routing basis match the DB | PASS | 16201 rows |
| 3 | Needs officer review <=> assumed/unmapped | PASS | consistent |
| 4 | Lat/lng inside the Ward polygon; Ward in its Zone | PASS | 14003 pinned rows inside their ward |
| 5 | GCC-list street belongs to an area mapped to the ward | PASS | 14126 synthetic rows |
| 6 | Typed by citizen <=> Area and Locality blank | PASS | consistent |
| 7 | Anonymous = Yes <=> complainant columns blank | PASS | 1261 anonymous rows |
| 8 | Complaint No format, uniqueness, year = Filed On year | PASS | 16201 unique codes |
| 9 | History replays to Status; timestamps increase; Last Updated; Rejected At | PASS | 92104 history rows for 16201 complaints |
| 10 | Title/Details/Landmark lengths; Tamil round-trips | PASS | 1 rows with Tamil text identical to MySQL after re-reading the file |
| 11 | Every day has complaints; all 7 statuses and 16 departments appear | PASS | 180 days with complaints, 7 statuses, 16 departments |
| 12 | Real rows byte-identical (cols 1-31) to npm run export:data | PASS | 2 real row(s) identical |
| 13 | duplicate_truth.csv refers only to synthetic complaints | PASS | 2014 rows |


## One sample row per status

### Complaint Filed (real complaint)

```
2026-225QED,2026-09-24 20:15,Complaint Filed,,Water Stagnation,New Drain Construction,Storm Water Drain Department,Auto-routed,mapped,8,Anna Nagar,100,map_boundary,,,gandhi nagar 2nd street,Typed by citizen,,,13.0915588,80.2127266,New Drain Construction,dfdgfhgresf,No,Apshana,Female,9000000002,apshana@example.com,sdhsjhddk,No,2026-09-24 20:15,0,en,25,Low,"Civic issue: New Drain Construction (+15); Open 7 days, past the 7-day target (+10)",2026-225QED,1
```

### Pending Approval

```
2026-248DQB,2026-08-26 12:10,Pending Approval,,Road and Footpath,Pot hole fill up / Repairs to the damaged surface,Engineering Department (Town Planning & Building Permissions),Needs officer review,assumed,6,Thiru-Vi-Ka-Nagar,78,map_boundary,KOSAPET,KOSAPET,MOOKU STREET,From GCC list,Near EB office,600011,13.0940345,80.2558761,Road la pallam,"Pot hole fill up / Repairs to the damaged surface problem irukku, konjam indha road-a paarunga. Pallam 25 adi agalam irukku. Pipeline ku thondunadhu appadiye irukku, road podala. Already rendu thadava complaint pannom, no action.",Yes,,,,,,Yes,2026-08-26 12:39,1,tanglish,55,High,"Public-safety or sanitation issue: Pot hole fill up / Repairs to the damaged surface (+25); Open 37 days, over twice the 9-day target (+20); Citizen reports complaining before (+10)",2026-248DQB,1
```

### Approved by Department Officer

```
2026-190LRR,2026-08-31 21:44,Approved by Department Officer,,Storm Water Drains,Insufficient Barricading,Storm Water Drain Department,Auto-routed,mapped,10,Kodambakkam,142,map_boundary,EKKATTUTHANGAL,GANDHI NAGAR,SOOLAPANDIAN STREET,From GCC list,Behind Vegetable market,600093,13.0195203,80.2203969,Insufficient Barricading,Complaint from the residents of Soolapandian Street. The storm water drain work behind Vegetable market has no barricading; a two-wheeler fell into the pit. 37 families in our lane face this daily. Request you to look into this urgently.,No,Senthil,Male,9000087785,senthil.18@example.in,"No. 223, Sardar Colony 4th Street",No,2026-10-02 04:30,1,en,45,Medium,"Public-safety or sanitation issue: Insufficient Barricading (+25); Open 31 days, over twice the 7-day target (+20)",2026-190LRR,1
```

### In Progress

```
2026-639YML,2026-08-12 11:58,In Progress,,MEGA STREETS - CONSTRUCTION PHASE,No arrangement made for temporary displacement (Khadar Nawas Khan Road),Engineering Department (Town Planning & Building Permissions),Needs officer review,assumed,3,Madhavaram,27,map_boundary,MADHAVARAM,MOOLAKADAI,PERIYAR NAGAR MAIN ROAD,From GCC list,,600066,13.1650686,80.2353315,No arrangement made for temporary displacement (Khadar Nawas Khan Road),மெகா ஸ்ட்ரீட் திட்டப் பணியில் பிரச்சினை: No arrangement made for temporary displacement (Khadar Nawas Khan Road). பள்ளி குழந்தைகள் மிகவும் சிரமப்படுகிறார்கள். அதிகாரிகள் நேரில் வந்து பார்க்கவும்.,No,Prakash Krishnan,Male,9000057605,,"No. 189, Yogeswaran Street",Yes,2026-09-14 15:01,1,ta,51,High,"Civic issue: No arrangement made for temporary displacement (Khadar Nawas Khan Road) (+15); Affects a school or anganwadi, children (+16); Open 51 days, over twice the 16-day target (+20)",2026-639YML,1
```

### Completed - Pending Collector Verification

```
2026-969NCJ,2026-08-15 22:43,Completed - Pending Collector Verification,,Other,Other / not listed above,Bridges Department,Needs officer review,unmapped,5,Royapuram,57,map_boundary,MINT,OLD WASHERMENPET,DHAKSHINA MURTHY KOIL STREET,From GCC list,Near Anganwadi centre,600003,13.0934220,80.2810784,Other / not listed above,"Subway la thanni thengi nikkudhu, nadakka mudiyala. Engal sandhula 31 family daily kashtapadranga.",No,M. Arun,Male,9000010026,arunm665@example.com,"No. 241, West Karikalan 3rd Street Sivasai Flats",Yes,2026-09-30 02:21,1,tanglish,43,Medium,"Civic issue: Other / not listed above (+15); Affects a school or anganwadi (+8); Open 47 days, over twice the 12-day target (+20)",2026-969NCJ,1
```

### Verified by Collector

```
2026-073TGX,2026-04-06 00:24,Verified by Collector,,Garbage,Burning of Garbage at Dumping Ground,Solid Waste Management Department,Auto-routed,mapped,4,Tondiarpet,45,map_boundary,VYASARPADI,ANNA NAGAR,ANNA NAGAR - V STREET,From GCC list,மாநகராட்சி பள்ளி அருகில்,600021,13.1145784,80.2573437,Burning of Garbage at Dumping Ground,My elderly parents live on Anna Nagar - V Street. Garbage at the dumping ground is burning for two weeks now. Thick smoke is covering the whole area. Hotel waste is dumped here late at night. Kindly send someone to inspect.,No,Karthik,Male,9000052484,karthik.316@example.in,"No. 20/8, Ramakrishna Nagar",Yes,2026-05-09 21:29,1,en,41,Medium,"Public-safety or sanitation issue: Burning of Garbage at Dumping Ground (+25); Affects a school or anganwadi, elderly people (+16)",2026-073TGX,1
```

### Rejected

```
2026-707DND,2026-04-06 07:33,Rejected,Department Officer,Road and Footpath,Formation of New Road,Engineering Department (Town Planning & Building Permissions),Needs officer review,assumed,7,Ambattur,93,map_boundary,MOGAPPAIR,PADI,T.S.KRISHNA NAGAR,From GCC list,Near Post Office,,13.0765728,80.1894232,Formation of New Road,test,No,N. Sangeetha Natarajan,Female,9000046596,,"No. 226, Ags Colony Phase¿Iii 2nd Avenue Cross South Street",Yes,2026-04-08 16:43,1,en,15,Low,Civic issue: Formation of New Road (+15),2026-707DND,1
```
