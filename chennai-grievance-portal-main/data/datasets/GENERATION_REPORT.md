# Grievance dataset: generation report

Generated 2026-10-04 11:04 IST with seed `42`, 180 days ending 2026-10-04, mean 90/day.
Mode: CSV only (nothing written to MySQL).

## Totals

|  | Rows |
|---|---|
| Synthetic complaints | 16093 |
| Real complaints (is_synthetic = 0) | 0 |
| Status-history rows | 91506 |
| of which base volume | 14992 |
| of which hotspot bursts | 143 |
| of which planted near-duplicates | 958 |
| Details rewritten to keep ward/day text unique | 0 |


## Rain events

Thunderstorm days (the day and the two after it are boosted): **2026-05-19, 2026-07-18, 2026-08-09, 2026-08-10, 2026-08-28, 2026-09-06, 2026-09-19, 2026-09-20**. Override with `--rain-days` to align with IMD rainfall.

| Rain day | Water multiplier | Complaints that day | Water Stagnation + SWD + Flood that day |
|---|---|---|---|
| 2026-05-19 | 3.46 | 103 | 33 |
| 2026-07-18 | 3.18 | 143 | 47 |
| 2026-08-09 | 3.56 | 81 | 31 |
| 2026-08-10 | 3.56 | 135 | 45 |
| 2026-08-28 | 3.04 | 138 | 38 |
| 2026-09-06 | 3.88 | 87 | 34 |
| 2026-09-19 | 3.08 | 118 | 36 |
| 2026-09-20 | 3.08 | 81 | 31 |


## Complaints per day

One row per week (Monday first). `*` = rain-event day.

| Week of | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|---|
| 2026-04-08 |  |  | 73 | 96 | 74 | 75 | 86 |
| 2026-04-13 | 102 | 92 | 76 | 84 | 78 | 89 | 85 |
| 2026-04-20 | 121 | 82 | 87 | 100 | 89 | 97 | 64 |
| 2026-04-27 | 84 | 90 | 83 | 84 | 84 | 107 | 69 |
| 2026-05-04 | 106 | 88 | 73 | 87 | 101 | 88 | 66 |
| 2026-05-11 | 114 | 87 | 96 | 95 | 95 | 91 | 72 |
| 2026-05-18 | 101 | 103* | 125 | 115 | 80 | 84 | 61 |
| 2026-05-25 | 96 | 90 | 95 | 89 | 97 | 84 | 66 |
| 2026-06-01 | 105 | 99 | 85 | 74 | 82 | 98 | 55 |
| 2026-06-08 | 114 | 94 | 87 | 76 | 88 | 82 | 60 |
| 2026-06-15 | 97 | 81 | 74 | 95 | 88 | 77 | 65 |
| 2026-06-22 | 84 | 80 | 92 | 98 | 106 | 75 | 66 |
| 2026-06-29 | 115 | 81 | 93 | 77 | 96 | 68 | 82 |
| 2026-07-06 | 87 | 86 | 88 | 90 | 90 | 90 | 64 |
| 2026-07-13 | 85 | 89 | 85 | 97 | 72 | 143* | 104 |
| 2026-07-20 | 165 | 77 | 73 | 69 | 94 | 80 | 79 |
| 2026-07-27 | 99 | 77 | 102 | 82 | 102 | 62 | 78 |
| 2026-08-03 | 97 | 85 | 71 | 78 | 68 | 71 | 81* |
| 2026-08-10 | 135* | 134 | 107 | 75 | 93 | 97 | 48 |
| 2026-08-17 | 105 | 90 | 89 | 71 | 74 | 79 | 63 |
| 2026-08-24 | 109 | 86 | 107 | 90 | 138* | 129 | 98 |
| 2026-08-31 | 107 | 82 | 96 | 77 | 93 | 85 | 87* |
| 2026-09-07 | 164 | 118 | 101 | 76 | 92 | 91 | 73 |
| 2026-09-14 | 107 | 85 | 86 | 95 | 88 | 118* | 81* |
| 2026-09-21 | 149 | 133 | 89 | 75 | 96 | 83 | 65 |
| 2026-09-28 | 105 | 78 | 94 | 78 | 84 | 79 | 21 |


## By category

| Category | Complaints | Share |
|---|---|---|
| Garbage | 3570 | 22.2% |
| Road and Footpath | 2183 | 13.6% |
| Street Light | 2096 | 13.0% |
| Public Health | 1853 | 11.5% |
| Water Stagnation | 1815 | 11.3% |
| Storm Water Drains | 745 | 4.6% |
| Park and Playground | 649 | 4.0% |
| Public Toilet | 566 | 3.5% |
| Other | 563 | 3.5% |
| Tax and Licence | 465 | 2.9% |
| General | 456 | 2.8% |
| Building Plan Permission | 352 | 2.2% |
| Flood | 178 | 1.1% |
| MEGA STREETS - CONSTRUCTION PHASE | 175 | 1.1% |
| Voter ID | 163 | 1.0% |
| Air Quality | 153 | 1.0% |
| MEGA STREETS - PLANNING PHASE | 59 | 0.4% |
| MEGA STREETS - OPERATION PHASE | 52 | 0.3% |


## By department

| Department | Complaints | Share |
|---|---|---|
| Solid Waste Management Department | 3570 | 22.2% |
| Engineering Department (Town Planning & Building Permissions) | 2821 | 17.5% |
| Storm Water Drain Department | 2738 | 17.0% |
| Health Department | 2596 | 16.1% |
| Electrical Department | 2123 | 13.2% |
| Parks & Play Fields Department | 718 | 4.5% |
| General Administration | 651 | 4.0% |
| Revenue Department | 488 | 3.0% |
| Education Department | 96 | 0.6% |
| Family Welfare Department | 69 | 0.4% |
| Land & Estate Department | 62 | 0.4% |
| Bridges Department | 41 | 0.3% |
| Buildings Department | 35 | 0.2% |
| Council Department | 30 | 0.2% |
| Mechanical Engineering Department | 30 | 0.2% |
| Financial Management Unit | 25 | 0.2% |


## By zone

| Zone | Complaints | Share |
|---|---|---|
| 9 Teynampet | 1855 | 11.5% |
| 5 Royapuram | 1465 | 9.1% |
| 10 Kodambakkam | 1450 | 9.0% |
| 4 Tondiarpet | 1396 | 8.7% |
| 6 Thiru-Vi-Ka-Nagar | 1329 | 8.3% |
| 8 Anna Nagar | 1298 | 8.1% |
| 7 Ambattur | 1131 | 7.0% |
| 13 Adyar | 1114 | 6.9% |
| 11 Valasaravakkam | 962 | 6.0% |
| 1 Thiruvottiyur | 927 | 5.8% |
| 12 Alandur | 768 | 4.8% |
| 3 Madhavaram | 754 | 4.7% |
| 14 Perungudi | 749 | 4.7% |
| 15 Sholinganallur | 555 | 3.4% |
| 2 Manali | 340 | 2.1% |


## By status

| Status | Complaints | Share |
|---|---|---|
| Verified by Collector | 13942 | 86.6% |
| Rejected | 1249 | 7.8% |
| In Progress | 462 | 2.9% |
| Pending Approval | 239 | 1.5% |
| Approved by Department Officer | 104 | 0.6% |
| Completed - Pending Collector Verification | 94 | 0.6% |
| Complaint Filed | 3 | 0.0% |


Rejected at: Department Officer 917, Collector 332.


Last 3 days (238 complaints): Pending Approval 103, In Progress 85, Approved by Department Officer 24, Completed - Pending Collector Verification 11, Rejected 8, Verified by Collector 4, Complaint Filed 3.


Stalled (a gap of 10+ days before the next step): 1902 (11.8%), Engineering Department (Town Planning & Building Permissions) 714, Storm Water Drain Department 572, Solid Waste Management Department 205, Health Department 140.


## By priority

Snapshot as of 2026-10-04 11:03 (days open is part of the score).

| Priority | Complaints | Share |
|---|---|---|
| Low | 8802 | 54.7% |
| Medium | 6187 | 38.4% |
| High | 1047 | 6.5% |
| Critical | 57 | 0.4% |


## By language

| Detected language | Complaints | Share |
|---|---|---|
| en | 9710 | 60.3% |
| ta | 4018 | 25.0% |
| tanglish | 2365 | 14.7% |


The `languageOf()` detector agrees with the language each non-junk text was written in for 15785 of 15859 (99.5%).


## Duplicates and hotspots

- Planted near-duplicates: **958** re-reports in **784** groups (same sub type, 5-140 m, within 72 h, different complainant, reworded).
- The rule-based `Duplicate Group` column puts **958 of 958** (100.0%) planted re-reports in the same group as their original, and flags 1083 complaints in total as belonging to an earlier complaint's group.
- Ground truth is kept out of the main file, in `_truth/duplicate_truth.csv`.

| Hotspot | Sub type | Ward | Zone | Starts | Complaints | Rain-driven |
|---|---|---|---|---|---|---|
| HOT-W2936 | Street Dogs | 107 | Anna Nagar | 2026-04-11 18:07 | 15 | no |
| HOT-W2938 | Removal of Garbage | 95 | Anna Nagar | 2026-04-25 17:59 | 7 | no |
| HOT-W2941 | Removal of Fallen Trees | 62 | Royapuram | 2026-05-19 15:00 | 11 | yes |
| HOT-W2948 | Burning of Garbage at Dumping Ground | 123 | Teynampet | 2026-07-03 17:17 | 7 | no |
| HOT-W2950 | Stagnation of Water | 132 | Kodambakkam | 2026-07-18 20:00 | 16 | yes |
| HOT-W2951 | Overflowing of Garbage Bin | 88 | Ambattur | 2026-07-26 00:01 | 15 | no |
| HOT-W2953 | Obstruction of Water Flow | 182 | Adyar | 2026-08-10 20:00 | 6 | yes |
| HOT-W2956 | Stagnation of Water | 47 | Tondiarpet | 2026-08-28 15:00 | 12 | yes |
| HOT-W2957 | Obstruction of Water Flow | 145 | Valasaravakkam | 2026-09-06 20:00 | 12 | yes |
| HOT-W2958 | Burning of Garbage at Dumping Ground | 191 | Perungudi | 2026-09-12 18:10 | 19 | no |
| HOT-W2959 | Water entering Home/Shop | 164 | Alandur | 2026-09-19 08:00 | 15 | yes |
| HOT-W2960 | Non burning of Street lights | 146 | Valasaravakkam | 2026-09-27 05:59 | 8 | no |


## Validation

| # | Check | Result | Detail |
|---|---|---|---|
| 1 | Headers exact, in order, with BOM | PASS | 38 + 6 columns |
| 2 | Type / sub type / department / routing basis match the DB | PASS | 16093 rows |
| 3 | Needs officer review <=> assumed/unmapped | PASS | consistent |
| 4 | Lat/lng inside the Ward polygon; Ward in its Zone | PASS | 13802 pinned rows inside their ward |
| 5 | GCC-list street belongs to an area mapped to the ward | PASS | 14040 synthetic rows |
| 6 | Typed by citizen <=> Area and Locality blank | PASS | consistent |
| 7 | Anonymous = Yes <=> complainant columns blank | PASS | 1293 anonymous rows |
| 8 | Complaint No format, uniqueness, year = Filed On year | PASS | 16093 unique codes |
| 9 | History replays to Status; timestamps increase; Last Updated; Rejected At | PASS | 91506 history rows for 16093 complaints |
| 10 | Title/Details/Landmark lengths; Tamil round-trips | PASS | 0 rows with Tamil text identical to MySQL after re-reading the file |
| 11 | Every day has complaints; all 7 statuses and 16 departments appear | PASS | 180 days with complaints, 7 statuses, 16 departments |
| 12 | Real rows byte-identical (cols 1-31) to npm run export:data | PASS | 0 real row(s) identical |
| 13 | duplicate_truth.csv refers only to synthetic complaints | PASS | 1885 rows |


## One sample row per status

### Complaint Filed

```
2026-167YXP,2026-10-04 10:54,Complaint Filed,,General,Unauthorized Advertisement Boards,General Administration,Needs officer review,assumed,8,Anna Nagar,100,map_boundary,THIRUMANGALAM,THIRUMANGALAM ROAD,POST OFFICE ROAD,From GCC list,Behind Ration shop,600040,13.0979019,80.2145701,Unauthorized Advertisement Boards,Unauthorized Advertisement Boards தொடர்பாக புகார். நடவடிக்கை எடுக்கவும். உடனடியாக நடவடிக்கை எடுக்கவும்.,No,P. Madhan,Male,9000057309,madhanp296@example.in,"No. 238, Ppd 2nd Street E/W",Yes,2026-10-04 10:54,1,ta,15,Low,Civic issue: Unauthorized Advertisement Boards (+15),2026-167YXP,1
```

### Pending Approval

```
2026-447XGQ,2026-09-02 08:10,Pending Approval,,Road and Footpath,Electrical wires/obstruction on footpath,Engineering Department (Town Planning & Building Permissions),Needs officer review,assumed,14,Perungudi,169,map_boundary,,,gandhi nagar cross rd,Typed by citizen,Near Mosque,,12.9726758,80.1931443,Problem on our road,"I live at door no. 59, gandhi nagar cross rd. Complaint about electrical wires/obstruction on footpath near Mosque. Loose gravel on the surface makes bikes skid. 37 families in our lane face this daily. Please do the needful.",No,J. T. Manikandan Balasubramanian,Male,9000036811,,"No. 72, Gangadharan 2nd Street",Yes,2026-09-02 08:23,1,en,53,High,"Public-safety or sanitation issue: Electrical wires/obstruction on footpath (+25); Affects a place of worship (+8); Open 32 days, over twice the 9-day target (+20)",2026-447XGQ,1
```

### Approved by Department Officer

```
2026-640UAL,2026-08-30 11:50,Approved by Department Officer,,Road and Footpath,Illegal Parking on foot path,Engineering Department (Town Planning & Building Permissions),Needs officer review,assumed,13,Adyar,179,map_boundary,PERUNGUDI,OOMAITHURAI 2ND CROSS STREET,OOMAITHURAI 2ND CROSS STREET,From GCC list,,,12.9743226,80.2271524,Road problem,"Illegal Parking on foot path problem irukku, konjam indha road-a paarunga. Engal sandhula 45 family daily kashtapadranga. Udane vandhu paarunga please.",No,M. S. Kavitha,Female,9000093285,,"No. 241, Dwaraga Nagar Colony 3rd Street",No,2026-10-03 10:15,1,tanglish,40,Medium,"Civic issue: Illegal Parking on foot path (+15); 1 other 'Illegal Parking on foot path' complaint in Ward 179 in the last 72 h (+5); Open 34 days, over twice the 9-day target (+20)",2026-732XON,2
```

### In Progress

```
2026-176BVP,2026-08-12 16:09,In Progress,,MEGA STREETS - CONSTRUCTION PHASE,Labourer not using the safety equipment (Arunachaleshwar Road),Engineering Department (Town Planning & Building Permissions),Needs officer review,assumed,2,Manali,16,map_boundary,KADAPAKKAM,KAMARAJAPURAM,KAMARAJAPURAM KADAPAKKAM LINK ROAD,From GCC list,,600051,13.1841519,80.2902383,Labourer not using the safety equipment (Arunachaleshwar Road),Regarding the mega streets project: labourer not using the safety equipment (arunachaleshwar road). This has continued for the past 9 days. The half-finished work has narrowed the road to one lane. The problem is worse at night. About 50 houses on the street are affected. Kindly send someone to inspect.,No,Balaji Babu,Male,9000020184,,"No. 214, Kambar Lane",Yes,2026-09-12 12:06,1,en,45,Medium,"Public-safety or sanitation issue: Labourer not using the safety equipment (Arunachaleshwar Road) (+25); Open 52 days, over twice the 16-day target (+20)",2026-176BVP,1
```

### Completed - Pending Collector Verification

```
2026-368DZL,2026-08-26 18:29,Completed - Pending Collector Verification,,Building Plan Permission,Building Plan Sanction,Engineering Department (Town Planning & Building Permissions),Auto-routed,mapped,10,Kodambakkam,128,map_boundary,NESAPAKKAM,NESAPAKKAM,PERIYAR NAGAR BALAMBAL STREET,From GCC list,,600078,13.0389417,80.1919773,Building Plan Sanction,My building plan approval application has been pending for the last 9 days. I have already complained twice but no action taken. Please resolve at the earliest.,No,R. Anand,Male,9000018557,,"No. 119, Velan Nagar 1st Street",No,2026-10-03 02:29,1,en,45,Medium,"Civic issue: Building Plan Sanction (+15); Open 38 days, over twice the 9-day target (+20); Citizen reports complaining before (+10)",2026-368DZL,1
```

### Verified by Collector

```
2026-280CDJ,2026-04-08 00:59,Verified by Collector,,General,Complaints regarding any other CoC building,General Administration,Needs officer review,assumed,10,Kodambakkam,140,user_selected,SAIDAPET WEST,SAIDAPET WEST,KAMBAR STREET,From GCC list,Behind Ration shop,,,,Complaints regarding any other CoC building,Complaint regarding complaints regarding any other coc building; the issue has continued for the past 10 days.,No,V. Manikandan Subramanian,Male,9000005729,,"No. 206/2, Portguese Church 8th Lane",No,2026-04-21 02:28,1,en,15,Low,Civic issue: Complaints regarding any other CoC building (+15),2026-280CDJ,1
```

### Rejected

```
2026-151IWD,2026-04-09 06:02,Rejected,Department Officer,Public Health,Public toilet cleaning,Health Department,Auto-routed,mapped,5,Royapuram,50,map_boundary,ROYAPURAM,CORPORATION COLONY,CORPORATION COLONY 4TH STREET,From GCC list,,600013,13.1103228,80.2956893,Public toilet cleaning,Complaint regarding public toilet cleaning on Corporation Colony 4th Street. The fogging vehicle has not come to our street this month. It is worst in the morning around 7 am. 21 families in our lane face this daily. Request you to look into this urgently.,No,J. Pandian,Male,9000080009,,"No. 124, Varadappan Street",No,2026-04-11 02:03,1,en,20,Low,Civic issue: Public toilet cleaning (+15); 1 other 'Public toilet cleaning' complaint in Ward 50 in the last 72 h (+5),2026-873MTG,2
```
