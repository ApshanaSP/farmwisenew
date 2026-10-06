# Grievance dataset: generation report

Generated 2026-10-04 16:41 IST with seed `42`, 180 days ending 2026-10-04, mean 90/day.
Mode: CSV only (nothing written to MySQL).

## Totals

|  | Rows |
|---|---|
| Synthetic complaints | 16113 |
| Real complaints (is_synthetic = 0) | 0 |
| Status-history rows | 91617 |
| of which base volume | 15007 |
| of which hotspot bursts | 143 |
| of which planted near-duplicates | 963 |
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
| 2026-09-28 | 105 | 78 | 94 | 78 | 84 | 79 | 41 |


## By category

| Category | Complaints | Share |
|---|---|---|
| Garbage | 3574 | 22.2% |
| Road and Footpath | 2186 | 13.6% |
| Street Light | 2101 | 13.0% |
| Public Health | 1853 | 11.5% |
| Water Stagnation | 1818 | 11.3% |
| Storm Water Drains | 745 | 4.6% |
| Park and Playground | 652 | 4.0% |
| Public Toilet | 566 | 3.5% |
| Other | 563 | 3.5% |
| Tax and Licence | 467 | 2.9% |
| General | 456 | 2.8% |
| Building Plan Permission | 352 | 2.2% |
| Flood | 178 | 1.1% |
| MEGA STREETS - CONSTRUCTION PHASE | 175 | 1.1% |
| Voter ID | 163 | 1.0% |
| Air Quality | 153 | 0.9% |
| MEGA STREETS - PLANNING PHASE | 59 | 0.4% |
| MEGA STREETS - OPERATION PHASE | 52 | 0.3% |


## By department

| Department | Complaints | Share |
|---|---|---|
| Solid Waste Management Department | 3574 | 22.2% |
| Engineering Department (Town Planning & Building Permissions) | 2824 | 17.5% |
| Storm Water Drain Department | 2741 | 17.0% |
| Health Department | 2596 | 16.1% |
| Electrical Department | 2128 | 13.2% |
| Parks & Play Fields Department | 721 | 4.5% |
| General Administration | 651 | 4.0% |
| Revenue Department | 490 | 3.0% |
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
| 9 Teynampet | 1858 | 11.5% |
| 5 Royapuram | 1468 | 9.1% |
| 10 Kodambakkam | 1451 | 9.0% |
| 4 Tondiarpet | 1396 | 8.7% |
| 6 Thiru-Vi-Ka-Nagar | 1331 | 8.3% |
| 8 Anna Nagar | 1299 | 8.1% |
| 7 Ambattur | 1131 | 7.0% |
| 13 Adyar | 1116 | 6.9% |
| 11 Valasaravakkam | 963 | 6.0% |
| 1 Thiruvottiyur | 928 | 5.8% |
| 12 Alandur | 770 | 4.8% |
| 3 Madhavaram | 755 | 4.7% |
| 14 Perungudi | 749 | 4.6% |
| 15 Sholinganallur | 556 | 3.5% |
| 2 Manali | 342 | 2.1% |


## By status

| Status | Complaints | Share |
|---|---|---|
| Verified by Collector | 13958 | 86.6% |
| Rejected | 1250 | 7.8% |
| In Progress | 467 | 2.9% |
| Pending Approval | 248 | 1.5% |
| Approved by Department Officer | 97 | 0.6% |
| Completed - Pending Collector Verification | 93 | 0.6% |


Rejected at: Department Officer 917, Collector 333.


Last 3 days (241 complaints): Pending Approval 113, In Progress 85, Approved by Department Officer 20, Completed - Pending Collector Verification 10, Rejected 8, Verified by Collector 5.


Stalled (a gap of 10+ days before the next step): 1906 (11.8%), Engineering Department (Town Planning & Building Permissions) 716, Storm Water Drain Department 572, Solid Waste Management Department 205, Health Department 140.


## By priority

Snapshot as of 2026-10-04 16:41 (days open is part of the score).

| Priority | Complaints | Share |
|---|---|---|
| Low | 8813 | 54.7% |
| Medium | 6193 | 38.4% |
| High | 1051 | 6.5% |
| Critical | 56 | 0.3% |


## By language

| Detected language | Complaints | Share |
|---|---|---|
| en | 9720 | 60.3% |
| ta | 4025 | 25.0% |
| tanglish | 2368 | 14.7% |


The `languageOf()` detector agrees with the language each non-junk text was written in for 15804 of 15878 (99.5%).


## Duplicates and hotspots

- Planted near-duplicates: **963** re-reports in **787** groups (same sub type, 5-140 m, within 72 h, different complainant, reworded).
- The rule-based `Duplicate Group` column puts **963 of 963** (100.0%) planted re-reports in the same group as their original, and flags 1088 complaints in total as belonging to an earlier complaint's group.
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
| 2 | Type / sub type / department / routing basis match the DB | PASS | 16113 rows |
| 3 | Needs officer review <=> assumed/unmapped | PASS | consistent |
| 4 | Lat/lng inside the Ward polygon; Ward in its Zone | PASS | 13822 pinned rows inside their ward |
| 5 | GCC-list street belongs to an area mapped to the ward | PASS | 14059 synthetic rows |
| 6 | Typed by citizen <=> Area and Locality blank | PASS | consistent |
| 7 | Anonymous = Yes <=> complainant columns blank | PASS | 1293 anonymous rows |
| 8 | Complaint No format, uniqueness, year = Filed On year | PASS | 16113 unique codes |
| 9 | History replays to Status; timestamps increase; Last Updated; Rejected At | PASS | 91617 history rows for 16113 complaints |
| 10 | Title/Details/Landmark lengths; Tamil round-trips | PASS | 0 rows with Tamil text identical to MySQL after re-reading the file |
| 11 | Every day has complaints; all 7 statuses and 16 departments appear | **FAIL** | 1 problem(s); first: status never appears: Complaint Filed |
| 12 | Real rows byte-identical (cols 1-31) to npm run export:data | PASS | 0 real row(s) identical |
| 13 | duplicate_truth.csv refers only to synthetic complaints | PASS | 1893 rows |


## One sample row per status

### Pending Approval

```
2026-447XGQ,2026-09-02 08:10,Pending Approval,,Road and Footpath,Electrical wires/obstruction on footpath,Engineering Department (Town Planning & Building Permissions),Needs officer review,assumed,14,Perungudi,169,map_boundary,,,gandhi nagar cross rd,Typed by citizen,Near Mosque,,12.9726758,80.1931443,Problem on our road,"I live at door no. 59, gandhi nagar cross rd. Complaint about electrical wires/obstruction on footpath near Mosque. Loose gravel on the surface makes bikes skid. 37 families in our lane face this daily. Please do the needful.",No,J. T. Manikandan Balasubramanian,Male,9000036811,,"No. 72, Gangadharan 2nd Street",Yes,2026-09-02 08:23,1,en,53,High,"Public-safety or sanitation issue: Electrical wires/obstruction on footpath (+25); Affects a place of worship (+8); Open 32 days, over twice the 9-day target (+20)",2026-447XGQ,1
```

### Approved by Department Officer

```
2026-640UAL,2026-08-30 11:50,Approved by Department Officer,,Road and Footpath,Illegal Parking on foot path,Engineering Department (Town Planning & Building Permissions),Needs officer review,assumed,13,Adyar,179,map_boundary,PERUNGUDI,OOMAITHURAI 2ND CROSS STREET,OOMAITHURAI 2ND CROSS STREET,From GCC list,,,12.9743226,80.2271524,Road problem,"Illegal Parking on foot path problem irukku, konjam indha road-a paarunga. Engal sandhula 45 family daily kashtapadranga. Udane vandhu paarunga please.",No,M. S. Kavitha,Female,9000093285,,"No. 241, Dwaraga Nagar Colony 3rd Street",No,2026-10-03 10:15,1,tanglish,40,Medium,"Civic issue: Illegal Parking on foot path (+15); 1 other 'Illegal Parking on foot path' complaint in Ward 179 in the last 72 h (+5); Open 35 days, over twice the 9-day target (+20)",2026-732XON,2
```

### In Progress

```
2026-727FOB,2026-08-14 10:18,In Progress,,MEGA STREETS - PLANNING PHASE,Project information not provided (Washermenpet Metro),Engineering Department (Town Planning & Building Permissions),Needs officer review,assumed,12,Alandur,167,user_selected,ULLAGARAM,BHARATHIYAR STREET,BHARATHIYAR STREET,From GCC list,,,,,Project information not provided (Washermenpet Metro),Mega street project work la problem: Project information not provided (Washermenpet Metro). Konjam paarunga. Paadhi velai la road one lane aayiduchu. Konjam urgent ah paarunga sir.,No,Rajesh,Male,9000041962,,"No. 16, Vinayagapuram(I.D. Hospital Backside)",Yes,2026-08-18 11:08,1,tanglish,25,Low,"Administrative issue: Project information not provided (Washermenpet Metro) (+5); Open 51 days, over twice the 16-day target (+20)",2026-727FOB,1
```

### Completed - Pending Collector Verification

```
2026-176BVP,2026-08-12 16:09,Completed - Pending Collector Verification,,MEGA STREETS - CONSTRUCTION PHASE,Labourer not using the safety equipment (Arunachaleshwar Road),Engineering Department (Town Planning & Building Permissions),Needs officer review,assumed,2,Manali,16,map_boundary,KADAPAKKAM,KAMARAJAPURAM,KAMARAJAPURAM KADAPAKKAM LINK ROAD,From GCC list,,600051,13.1841519,80.2902383,Labourer not using the safety equipment (Arunachaleshwar Road),Regarding the mega streets project: labourer not using the safety equipment (arunachaleshwar road). This has continued for the past 9 days. The half-finished work has narrowed the road to one lane. The problem is worse at night. About 50 houses on the street are affected. Kindly send someone to inspect.,No,Balaji Babu,Male,9000020184,,"No. 214, Kambar Lane",Yes,2026-10-04 11:27,1,en,45,Medium,"Public-safety or sanitation issue: Labourer not using the safety equipment (Arunachaleshwar Road) (+25); Open 53 days, over twice the 16-day target (+20)",2026-176BVP,1
```

### Verified by Collector

```
2026-280CDJ,2026-04-08 00:59,Verified by Collector,,General,Complaints regarding any other CoC building,General Administration,Needs officer review,assumed,10,Kodambakkam,140,user_selected,SAIDAPET WEST,SAIDAPET WEST,KAMBAR STREET,From GCC list,Behind Ration shop,,,,Complaints regarding any other CoC building,Complaint regarding complaints regarding any other coc building; the issue has continued for the past 10 days.,No,V. Manikandan Subramanian,Male,9000005729,,"No. 206/2, Portguese Church 8th Lane",No,2026-04-21 02:28,1,en,15,Low,Civic issue: Complaints regarding any other CoC building (+15),2026-280CDJ,1
```

### Rejected

```
2026-151IWD,2026-04-09 06:02,Rejected,Department Officer,Public Health,Public toilet cleaning,Health Department,Auto-routed,mapped,5,Royapuram,50,map_boundary,ROYAPURAM,CORPORATION COLONY,CORPORATION COLONY 4TH STREET,From GCC list,,600013,13.1103228,80.2956893,Public toilet cleaning,Complaint regarding public toilet cleaning on Corporation Colony 4th Street. The fogging vehicle has not come to our street this month. It is worst in the morning around 7 am. 21 families in our lane face this daily. Request you to look into this urgently.,No,J. Pandian,Male,9000080009,,"No. 124, Varadappan Street",No,2026-04-11 02:03,1,en,20,Low,Civic issue: Public toilet cleaning (+15); 1 other 'Public toilet cleaning' complaint in Ward 50 in the last 72 h (+5),2026-873MTG,2
```
