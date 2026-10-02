# Grievance dataset: generation report

Generated 2026-09-24 21:40 IST with seed `42`, 90 days ending 2026-09-24, mean 90/day.
Mode: inserted into MySQL (is_synthetic = 1), CSVs rebuilt from MySQL.

## Totals

|  | Rows |
|---|---|
| Synthetic complaints | 8110 |
| Real complaints (is_synthetic = 0) | 1 |
| Status-history rows | 44736 |
| of which base volume | 7484 |
| of which hotspot bursts | 139 |
| of which planted near-duplicates | 487 |
| Details rewritten to keep ward/day text unique | 3 |


## Rain events

Thunderstorm days (the day and the two after it are boosted): **2026-08-10, 2026-08-25, 2026-08-29, 2026-09-03, 2026-09-16**. Override with `--rain-days` to align with IMD rainfall.

| Rain day | Water multiplier | Complaints that day | Water Stagnation + SWD + Flood that day |
|---|---|---|---|
| 2026-08-10 | 3.27 | 127 | 50 |
| 2026-08-25 | 3.62 | 122 | 56 |
| 2026-08-29 | 3.87 | 128 | 42 |
| 2026-09-03 | 3.47 | 131 | 36 |
| 2026-09-16 | 3.25 | 123 | 36 |


## Complaints per day

One row per week (Monday first). `*` = rain-event day.

| Week of | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|---|
| 2026-06-27 |  |  |  |  |  | 80 | 67 |
| 2026-06-29 | 82 | 84 | 78 | 95 | 90 | 76 | 65 |
| 2026-07-06 | 104 | 89 | 72 | 95 | 86 | 70 | 64 |
| 2026-07-13 | 109 | 79 | 84 | 83 | 95 | 72 | 77 |
| 2026-07-20 | 81 | 75 | 89 | 88 | 92 | 72 | 69 |
| 2026-07-27 | 91 | 85 | 92 | 88 | 92 | 87 | 70 |
| 2026-08-03 | 101 | 93 | 76 | 84 | 87 | 72 | 69 |
| 2026-08-10 | 127* | 120 | 126 | 91 | 84 | 82 | 63 |
| 2026-08-17 | 91 | 83 | 75 | 85 | 98 | 59 | 69 |
| 2026-08-24 | 105 | 122* | 122 | 128 | 79 | 128* | 94 |
| 2026-08-31 | 154 | 80 | 87 | 131* | 141 | 116 | 46 |
| 2026-09-07 | 99 | 74 | 102 | 91 | 74 | 77 | 50 |
| 2026-09-14 | 107 | 87 | 123* | 134 | 124 | 94 | 64 |
| 2026-09-21 | 104 | 81 | 89 | 101 |  |  |  |


## By category

| Category | Complaints | Share |
|---|---|---|
| Garbage | 1719 | 21.2% |
| Road and Footpath | 1077 | 13.3% |
| Street Light | 1021 | 12.6% |
| Water Stagnation | 1012 | 12.5% |
| Public Health | 906 | 11.2% |
| Storm Water Drains | 401 | 4.9% |
| Public Toilet | 324 | 4.0% |
| Park and Playground | 308 | 3.8% |
| Other | 267 | 3.3% |
| Tax and Licence | 254 | 3.1% |
| General | 203 | 2.5% |
| Building Plan Permission | 150 | 1.8% |
| Flood | 147 | 1.8% |
| MEGA STREETS - CONSTRUCTION PHASE | 100 | 1.2% |
| Voter ID | 91 | 1.1% |
| Air Quality | 75 | 0.9% |
| MEGA STREETS - OPERATION PHASE | 35 | 0.4% |
| MEGA STREETS - PLANNING PHASE | 20 | 0.2% |


## By department

| Department | Complaints | Share |
|---|---|---|
| Solid Waste Management Department | 1719 | 21.2% |
| Storm Water Drain Department | 1560 | 19.2% |
| Engineering Department (Town Planning & Building Permissions) | 1382 | 17.0% |
| Health Department | 1315 | 16.2% |
| Electrical Department | 1036 | 12.8% |
| Parks & Play Fields Department | 308 | 3.8% |
| General Administration | 306 | 3.8% |
| Revenue Department | 279 | 3.4% |
| Land & Estate Department | 52 | 0.6% |
| Education Department | 35 | 0.4% |
| Buildings Department | 31 | 0.4% |
| Council Department | 21 | 0.3% |
| Family Welfare Department | 20 | 0.2% |
| Mechanical Engineering Department | 19 | 0.2% |
| Bridges Department | 16 | 0.2% |
| Financial Management Unit | 11 | 0.1% |


## By zone

| Zone | Complaints | Share |
|---|---|---|
| 9 Teynampet | 886 | 10.9% |
| 5 Royapuram | 806 | 9.9% |
| 10 Kodambakkam | 796 | 9.8% |
| 4 Tondiarpet | 662 | 8.2% |
| 6 Thiru-Vi-Ka-Nagar | 658 | 8.1% |
| 8 Anna Nagar | 611 | 7.5% |
| 13 Adyar | 581 | 7.2% |
| 7 Ambattur | 516 | 6.4% |
| 11 Valasaravakkam | 498 | 6.1% |
| 1 Thiruvottiyur | 493 | 6.1% |
| 12 Alandur | 402 | 5.0% |
| 3 Madhavaram | 377 | 4.6% |
| 14 Perungudi | 375 | 4.6% |
| 15 Sholinganallur | 298 | 3.7% |
| 2 Manali | 151 | 1.9% |


## By status

| Status | Complaints | Share |
|---|---|---|
| Verified by Collector | 6529 | 80.5% |
| Rejected | 593 | 7.3% |
| In Progress | 508 | 6.3% |
| Pending Approval | 279 | 3.4% |
| Approved by Department Officer | 107 | 1.3% |
| Completed - Pending Collector Verification | 93 | 1.1% |
| Complaint Filed | 1 | 0.0% |


Rejected at: Department Officer 458, Collector 135.


Last 3 days (283 complaints): Pending Approval 162, In Progress 72, Approved by Department Officer 30, Rejected 9, Completed - Pending Collector Verification 6, Verified by Collector 3, Complaint Filed 1.


Stalled (a gap of 10+ days before the next step): 959 (11.8%), Storm Water Drain Department 325, Engineering Department (Town Planning & Building Permissions) 322, Solid Waste Management Department 100, Health Department 78.


## By priority

Snapshot as of 2026-09-24 21:40 (days open is part of the score).

| Priority | Complaints | Share |
|---|---|---|
| Low | 4587 | 56.6% |
| Medium | 2916 | 36.0% |
| High | 551 | 6.8% |
| Critical | 56 | 0.7% |


## By language

| Detected language | Complaints | Share |
|---|---|---|
| en | 4912 | 60.6% |
| ta | 1996 | 24.6% |
| tanglish | 1202 | 14.8% |


The `languageOf()` detector agrees with the language each non-junk text was written in for 7950 of 7991 (99.5%).


## Duplicates and hotspots

- Planted near-duplicates: **487** re-reports in **471** groups (same sub type, 5-140 m, within 72 h, different complainant, reworded).
- The rule-based `Duplicate Group` column puts **487 of 487** (100.0%) planted re-reports in the same group as their original, and flags 598 complaints in total as belonging to an earlier complaint's group.
- Ground truth is kept out of the main file, in `_truth/duplicate_truth.csv`.

| Hotspot | Sub type | Ward | Zone | Starts | Complaints | Rain-driven |
|---|---|---|---|---|---|---|
| HOT-01 | Removal of Garbage | 111 | Teynampet | 2026-09-14 04:34 | 11 | no |
| HOT-02 | Burning of Garbage at Dumping Ground | 51 | Royapuram | 2026-07-08 23:47 | 7 | no |
| HOT-03 | Stagnation of Water | 180 | Adyar | 2026-09-03 08:00 | 8 | yes |
| HOT-04 | Overflowing of Garbage Bin | 133 | Kodambakkam | 2026-07-31 22:11 | 16 | no |
| HOT-05 | Obstruction of Water Flow | 133 | Kodambakkam | 2026-08-29 10:00 | 13 | yes |
| HOT-06 | Removal of Garbage | 114 | Teynampet | 2026-09-02 04:44 | 7 | no |
| HOT-07 | Water entering Home/Shop | 49 | Royapuram | 2026-09-16 09:00 | 17 | yes |
| HOT-08 | Water entering Home/Shop | 151 | Valasaravakkam | 2026-09-03 20:00 | 12 | yes |
| HOT-09 | Water entering Home/Shop | 42 | Tondiarpet | 2026-08-10 17:00 | 8 | yes |
| HOT-10 | Overflowing of Garbage Bin | 200 | Sholinganallur | 2026-07-29 01:36 | 20 | no |
| HOT-11 | Overflowing of Garbage Bin | 157 | Alandur | 2026-07-08 22:10 | 20 | no |


## Validation

| # | Check | Result | Detail |
|---|---|---|---|
| 1 | Headers exact, in order, with BOM | PASS | 38 + 6 columns |
| 2 | Type / sub type / department / routing basis match the DB | PASS | 8111 rows |
| 3 | Needs officer review <=> assumed/unmapped | PASS | consistent |
| 4 | Lat/lng inside the Ward polygon; Ward in its Zone | PASS | 6980 pinned rows inside their ward |
| 5 | GCC-list street belongs to an area mapped to the ward | PASS | 7124 synthetic rows |
| 6 | Typed by citizen <=> Area and Locality blank | PASS | consistent |
| 7 | Anonymous = Yes <=> complainant columns blank | PASS | 671 anonymous rows |
| 8 | Complaint No format, uniqueness, year = Filed On year | PASS | 8111 unique codes |
| 9 | History replays to Status; timestamps increase; Last Updated; Rejected At | PASS | 44736 history rows for 8111 complaints |
| 10 | Title/Details/Landmark lengths; Tamil round-trips | PASS | 2476 rows with Tamil text identical to MySQL after re-reading the file |
| 11 | Every day has complaints; all 7 statuses and 16 departments appear | PASS | 90 days with complaints, 7 statuses, 16 departments |
| 12 | Real rows byte-identical (cols 1-31) to npm run export:data | PASS | 1 real row(s) identical; 8110 synthetic rows also identical |
| 13 | duplicate_truth.csv refers only to synthetic complaints | PASS | 1097 rows |


## One sample row per status

### Complaint Filed

```
2026-148VST,2026-09-24 21:13,Complaint Filed,,General,Complaints regarding Community Hall,General Administration,Needs officer review,assumed,5,Royapuram,50,map_boundary,PARK TOWN,V.O.C. NAGAR,MEENAMBAL SIVARAJ NAGAR (SCB QUARTERS A - G BLOCKS),From GCC list,,600003,13.1185571,80.2938013,Complaints regarding Community Hall,Complaints regarding Community Hall தொடர்பாக புகார். நடவடிக்கை எடுக்கவும். முதியவர்கள் நடக்க முடியவில்லை. அதிகாரிகள் நேரில் வந்து பார்க்கவும்.,No,T. B. Dinesh,Male,9000031953,dinesh_t978@example.in,"No. 146, Gandhi Nagar 2nd Conal Cross Road",Yes,2026-09-24 21:13,1,ta,23,Low,Civic issue: Complaints regarding Community Hall (+15); Affects elderly people (+8),2026-148VST,1
```

### Pending Approval

```
2026-592OLS,2026-08-21 14:01,Pending Approval,,General,Food Requirement,General Administration,Needs officer review,assumed,15,Sholinganallur,193,map_boundary,SHOLINGANALLUR,KUDUMIYANDI THOPPU,KUDUMIYANDI THOPPU M.G.R. NAGAR MAIN ROAD,From GCC list,,,12.9502973,80.2365760,Food Requirement,Food Requirement தொடர்பாக புகார். நடவடிக்கை எடுக்கவும். இரவில் பெண்கள் நடந்து செல்ல பயப்படுகிறார்கள். அதிகாரிகள் நேரில் வந்து பார்க்கவும்.,No,Pavithra Subramanian,Female,9000084672,,"No. 50, Jeevarathnam 1st Cross Street",Yes,2026-08-21 14:06,1,ta,35,Medium,"Civic issue: Food Requirement (+15); Open 34 days, over twice the 9-day target (+20)",2026-592OLS,1
```

### Approved by Department Officer

```
2026-173ARD,2026-08-25 09:59,Approved by Department Officer,,Flood,Trap at home/ any place,Storm Water Drain Department,Needs officer review,assumed,3,Madhavaram,28,map_boundary,MADHAVARAM,MRH ROAD,KATHIRVEL STREET,From GCC list,Behind Bus Depot,600060,13.1489637,80.2458688,Urgent flood help,An elderly couple is trapped at home behind Bus Depot due to flooding. Please send rescue. Elderly people cannot walk on this stretch. Please resolve at the earliest.,No,Joseph,Male,9000066917,joseph_509@example.in,"No. 177, Bangaru Street",Yes,2026-08-26 06:08,1,en,73,Critical,"High-risk issue: Trap at home/ any place (+35); Affects elderly people (+8); Filed during the rain event of 2026-08-25 (+10); Open 30 days, over twice the 7-day target (+20)",2026-173ARD,1
```

### In Progress

```
2026-119YSF,2026-07-22 18:02,In Progress,,MEGA STREETS - CONSTRUCTION PHASE,Noise levels are very high (Washermenpet Metro),Engineering Department (Town Planning & Building Permissions),Needs officer review,assumed,9,Teynampet,117,map_boundary,EGMORE,DR.SANTHOSH NAGAR,VARATHARAJALU STREET,From GCC list,,,13.0479906,80.2424611,Noise levels are very high (Washermenpet Metro),Regarding the mega streets project: noise levels are very high (washermenpet metro). This has continued for over a week. I have already complained twice but no action taken. Kindly take immediate action.,No,Balaji,Male,9000029176,balaji152@example.com,"No. 24, Surya Nagar Slum Roads",Yes,2026-08-25 21:36,1,en,45,Medium,"Civic issue: Noise levels are very high (Washermenpet Metro) (+15); Open 64 days, over twice the 16-day target (+20); Citizen reports complaining before (+10)",2026-119YSF,1
```

### Completed - Pending Collector Verification

```
2026-500BJC,2026-08-11 21:42,Completed - Pending Collector Verification,,Storm Water Drains,Insufficient Barricading,Storm Water Drain Department,Auto-routed,mapped,4,Tondiarpet,36,map_boundary,PERAMBUR,MANGALAPURAM,SASTHRI NAGAR 2ND STREET,From GCC list,Near Mariamman Kovil,600021,13.1259756,80.2571842,Insufficient Barricading,"Drain work nadakkura idathula barricade illa, oru bike pallathula vizhundhuduchu. Konjam urgent ah paarunga sir.",No,Gopal,Male,9000077334,gopal_316@example.com,"No. 151, Eligan Street",Yes,2026-09-24 07:06,1,tanglish,63,High,"Public-safety or sanitation issue: Insufficient Barricading (+25); Affects a place of worship (+8); Filed during the rain event of 2026-08-10 (+10); Open 43 days, over twice the 7-day target (+20)",2026-500BJC,1
```

### Verified by Collector

```
2026-974OPE,2026-06-27 03:11,Verified by Collector,,Water Stagnation,Stagnation of Water,Storm Water Drain Department,Auto-routed,mapped,5,Royapuram,57,map_boundary,GEORGE TOWN,SECRETARIAT,MOTHI BAZAAR (F.S.G),From GCC list,பிள்ளையார் கோயில் அருகில்,600079,13.0953495,80.2752889,Stagnation of Water,Rain water is stagnating in our area since last Monday and mosquitoes are breeding. This is a repeated complaint; still not attended. Please do the needful.,No,Joseph Subramanian,Male,9000015628,joseph.subramanian463@example.com,"No. 231, Decastor Road 1st Street",No,2026-07-02 18:04,1,en,43,Medium,Public-safety or sanitation issue: Stagnation of Water (+25); Affects a place of worship (+8); Citizen reports complaining before (+10),2026-974OPE,1
```

### Rejected

```
2026-891LUA,2026-06-27 08:20,Rejected,Collector,Street Light,Non burning of Street lights,Electrical Department,Auto-routed,mapped,9,Teynampet,124,map_boundary,ALWARPET,T.T.K. ROAD,T.T.K. LANE,From GCC list,,600004,13.0321512,80.2641468,Street light eriyala,"Street light rendu vaaram ah eriyala, night la nadandhu poga bayama irukku. Please seekiram action edunga.",No,M. Hari Babu,Male,9000079828,,"No. 102, Munieswaran Nagar, Ist Street",No,2026-07-02 16:25,1,tanglish,25,Low,Public-safety or sanitation issue: Non burning of Street lights (+25),2026-891LUA,1
```
