# Golden-master diff: baseline-abef9da to lane-c

Compared 3272 requests with 3272. **30 changed, 0 added, 0 removed.**

## What differs around the requests

- next_build_id: uoCyfOgnc3qJwf1N3gZ7P to KpVh4zL2FhpH-8L9BmZDS

## By route

| Route | Requests changed | Roles | Status changes | Most changed paths |
|---|---|---|---|---|
| /api/collector/assistant/export | 18 | collector, officerA, officerB | 200 -> 428 | $.line[*] (646), $.lines (15) |
| /api/collector/thunai/plan | 3 | collector | none | $.plan.kind (3), $.plan.reply (3) |
| /api/collector/list | 2 | collector | none | $.rows[*] (13), $.rows.length (2), $.total (2), $.incidents (2), $.complaints (2) |
| /api/collector/assistant/chat | 2 | collector, officerA | none | $[*].event (4), $[*].data.stage (4), $[*].data.sessionId (4), $[*] (4), $.length (2) |
| /api/collector/audit | 2 | collector | none | $.log[*].id (276), $.log[*].record_id (191), $.log[*].after_value (153), $.log[*].at (139), $.log[*].action (109) |
| /api/collector/search | 1 | collector | 500 -> 200 | $.error (1), $.zones (1), $.depts (1), $.incidents (1), $.incidentsTotal (1) |
| /api/rehearsal/state | 1 | collector | 503 -> 404 | none |
| /api/collector/workspaces/[id] | 1 | collector | 404 -> 200 | $.error (1), $.id (1), $.name (1), $.version (1), $.is_current (1) |

## Each changed request

### collector GET /api/collector/list?q=குப்பை

Session reads, id ae0c07b76616ca98, 50 bytes to 1543 bytes.

| Path | A | B |
|---|---|---|
| $.rows.length | 0 | 1 |
| $.rows[0] | (absent) | {object with 43 keys} |
| $.total | 0 | 1 |
| $.incidents | 0 | 1 |
| $.complaints | 0 | 1 |

### collector GET /api/collector/list?q=x

Session reads, id dbb6ec592c9dc08e, 50 bytes to 16409 bytes.

| Path | A | B |
|---|---|---|
| $.rows.length | 0 | 12 |
| $.rows[0] | (absent) | {object with 43 keys} |
| $.rows[1] | (absent) | {object with 43 keys} |
| $.rows[2] | (absent) | {object with 43 keys} |
| $.rows[3] | (absent) | {object with 43 keys} |
| $.rows[4] | (absent) | {object with 43 keys} |
| $.rows[5] | (absent) | {object with 43 keys} |
| $.rows[6] | (absent) | {object with 43 keys} |
| $.rows[7] | (absent) | {object with 43 keys} |
| $.rows[8] | (absent) | {object with 43 keys} |
| $.rows[9] | (absent) | {object with 43 keys} |
| $.rows[10] | (absent) | {object with 43 keys} |
| $.rows[11] | (absent) | {object with 43 keys} |
| $.total | 0 | 18 |
| $.incidents | 0 | 18 |
| $.complaints | 0 | 15 |

### collector GET /api/collector/search?q=குப்பை

Session reads, id 046a5fe26e204cff, 34 bytes to 12090 bytes.
- status: 500 to 200

| Path | A | B |
|---|---|---|
| $.error | Could not load search. | (absent) |
| $.zones | (absent) | [array of 0] |
| $.depts | (absent) | [array of 0] |
| $.incidents | (absent) | [array of 7] |
| $.incidentsTotal | (absent) | 425 |
| $.news | (absent) | [array of 4] |
| $.sources | (absent) | [array of 0] |
| $.complaints | (absent) | [array of 0] |
| $.datasets | (absent) | [array of 0] |

### collector GET /api/rehearsal/state?replay=rain-1999-01-01

Session reads, id 4ad33606006889c6, 39 bytes to 39 bytes.
- status: 503 to 404

### officerA GET /api/collector/assistant/export

Session reads, id c86aa18e689f43ba, 79 bytes to 198 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="district-iq-daily-gcc-swm.csv" to null

| Path | A | B |
|---|---|---|
| $.line[1] | ﻿list,id,what,where,department,severity,why,reported,past_deadline,complaints | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download the assistant's incident list as a... (198 chars) |

### officerA GET /api/collector/assistant/export?period=weekly

Session reads, id 4c35d25c9d6c31ef, 2844 bytes to 198 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="district-iq-weekly-gcc-swm.csv" to null

| Path | A | B |
|---|---|---|
| $.lines | 12 | 1 |
| $.line[1] | ﻿list,id,what,where,department,severity,why,reported,past_deadline,complaints | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download the assistant's incident list as a... (198 chars) |
| $.line[2] | Needs your attention,INC-20261103-8989A6,"Huge garbage dump near Murugan Temple bus stop, not cleared for two weeks now","Ward 148, Valasara... (249 chars) | (absent) |
| $.line[3] | Needs your attention,INC-20261104-EA19E3,குப்பை பிரச்சினை: Burning of Garbage at Dumping Ground,"Ward 38, Tondiarpet",Solid Waste Management... (219 chars) | (absent) |
| $.line[4] | Needs your attention,INC-20261101-E6396C,The garbage bin on Vasantha Nagar 2nd Street is overflowing for almost a month; waste is spilling o... (283 chars) | (absent) |
| $.line[5] | Needs your attention,INC-20261031-4191C8,Issue regarding broken bin in our area. Please send the conservancy team,"Ward 55, Royapuram",Solid... (238 chars) | (absent) |
| $.line[6] | Needs your attention,INC-20261102-8EC358,Garbage at the dumping ground is burning since last Monday,"Ward 125, Teynampet",Solid Waste Manage... (225 chars) | (absent) |
| $.line[7] | Needs your attention,INC-20261101-F65724,குப்பை பிரச்சினை: Broken Bin. ஒரு வாரமாக தீர்வு இல்லை,"Ward 74, Thiru-Vi-Ka-Nagar",Solid Waste Mana... (227 chars) | (absent) |
| $.line[8] | Needs your attention,INC-20261030-CB8991,Burning of Garbage: the problem near Pillaiyar Kovil has continued for the past 4 days,"Ward 119, T... (253 chars) | (absent) |
| $.line[9] | Needs your attention,INC-20261031-C8FCE8,"Huge garbage dump near Anganwadi centre, not cleared for over a week","Ward 29, Madhavaram",Solid ... (237 chars) | (absent) |
| $.line[10] | Needs your attention,INC-20260926-EB3B79,"Pillayar Koil Street la kuppai edukala, naatram thaanga mudiyala","Ward 180, Adyar",Solid Waste Ma... (229 chars) | (absent) |
| $.line[11] | Needs your attention,INC-20261104-B230BB,Chennai: Accumulated 400 tonnes of onions spoiled and emitting foul smell; Passengers' accusation,R... (249 chars) | (absent) |
| $.line[12] | Needs your attention,INC-20261105-E4D78A,Drivers struggle unable to unload 86 tonnes of onions transported in 4 lorries from Chennai..!!,Che... (245 chars) | (absent) |

### officerA GET /api/collector/assistant/export?period=monthly&zone=13

Session reads, id b39180cf7319b204, 1038 bytes to 198 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="district-iq-monthly-zone13-gcc-swm.csv" to null

| Path | A | B |
|---|---|---|
| $.lines | 5 | 1 |
| $.line[1] | ﻿list,id,what,where,department,severity,why,reported,past_deadline,complaints | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download the assistant's incident list as a... (198 chars) |
| $.line[2] | Needs your attention,INC-20260926-EB3B79,"Pillayar Koil Street la kuppai edukala, naatram thaanga mudiyala","Ward 180, Adyar",Solid Waste Ma... (229 chars) | (absent) |
| $.line[3] | Needs your attention,INC-20261026-4A8649,Shifting of Garbage Bin: the problem opp. Kalyana Mandapam has continued for the past 10 days,"Ward... (253 chars) | (absent) |
| $.line[4] | Needs your attention,INC-20261019-41B602,Waste has been lying next to Corporation Park for two weeks now and nobody from conservancy has com... (260 chars) | (absent) |
| $.line[5] | Needs your attention,INC-20261010-5133E2,Issue regarding garbage lorry without net in our area,"Ward 173, Adyar",Solid Waste Management,Low,... (213 chars) | (absent) |

### officerA GET /api/collector/assistant/export?period=quarterly&dept=GCC-SWM

Session reads, id 9d20bdbfd824b980, 10572 bytes to 198 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="district-iq-quarterly-gcc-swm.csv" to null

| Path | A | B |
|---|---|---|
| $.lines | 41 | 1 |
| $.line[1] | ﻿list,id,what,where,department,severity,why,reported,past_deadline,complaints | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download the assistant's incident list as a... (198 chars) |
| $.line[2] | Needs your attention,INC-20261103-8989A6,"Huge garbage dump near Murugan Temple bus stop, not cleared for two weeks now","Ward 148, Valasara... (249 chars) | (absent) |
| $.line[3] | Needs your attention,INC-20261104-EA19E3,குப்பை பிரச்சினை: Burning of Garbage at Dumping Ground,"Ward 38, Tondiarpet",Solid Waste Management... (219 chars) | (absent) |
| $.line[4] | Needs your attention,INC-20261030-6049C7,குப்பை பிரச்சினை: Absenteeism of Sweepers. 6 நாட்களாக தீர்வு இல்லை,"Ward 99, Anna Nagar",Solid Wast... (233 chars) | (absent) |
| $.line[5] | Needs your attention,INC-20261101-E6396C,The garbage bin on Vasantha Nagar 2nd Street is overflowing for almost a month; waste is spilling o... (283 chars) | (absent) |
| $.line[6] | Needs your attention,INC-20261021-26E727,"Engal street la garbage rendu vaaram ah eduklala, romba smell varudhu","Ward 54, Royapuram",Solid ... (237 chars) | (absent) |
| $.line[7] | Needs your attention,INC-20261031-4191C8,Issue regarding broken bin in our area. Please send the conservancy team,"Ward 55, Royapuram",Solid... (238 chars) | (absent) |
| $.line[8] | Needs your attention,INC-20260930-80DEA4,சாலை ஓரத்தில் குப்பை மலை போல் குவிந்துள்ளது. 10 நாட்களாக யாரும் அகற்றவில்லை,"Ward 56, Royapuram",So... (241 chars) | (absent) |
| $.line[9] | Needs your attention,INC-20261027-9FE6CE,The garbage bin opp. Primary Health Centre is overflowing for over a week; waste is spilling onto t... (271 chars) | (absent) |
| $.line[10] | Needs your attention,INC-20261102-8EC358,Garbage at the dumping ground is burning since last Monday,"Ward 125, Teynampet",Solid Waste Manage... (225 chars) | (absent) |
| $.line[11] | Needs your attention,INC-20261101-F65724,குப்பை பிரச்சினை: Broken Bin. ஒரு வாரமாக தீர்வு இல்லை,"Ward 74, Thiru-Vi-Ka-Nagar",Solid Waste Mana... (227 chars) | (absent) |
| $.line[12] | Needs your attention,INC-20261030-158A1B,Improper Sweeping: the problem on Krishna Nagar Vinayagar Nagar has continued for the last 8 days,"... (262 chars) | (absent) |
| $.line[13] | Needs your attention,INC-20261019-24B890,Overflowing of Garbage Bin: the problem in our street has continued since last Monday,"Ward 6, Thir... (254 chars) | (absent) |
| $.line[14] | Needs your attention,INC-20261020-ABCA41,"Road orathula kuppai malai maari irukku, yaarum edukala","Ward 89, Ambattur",Solid Waste Managemen... (222 chars) | (absent) |
| $.line[15] | Needs your attention,INC-20261030-CB8991,Burning of Garbage: the problem near Pillaiyar Kovil has continued for the past 4 days,"Ward 119, T... (253 chars) | (absent) |
| $.line[16] | Needs your attention,INC-20261031-C8FCE8,"Huge garbage dump near Anganwadi centre, not cleared for over a week","Ward 29, Madhavaram",Solid ... (237 chars) | (absent) |
| $.line[17] | Needs your attention,INC-20260926-EB3B79,"Pillayar Koil Street la kuppai edukala, naatram thaanga mudiyala","Ward 180, Adyar",Solid Waste Ma... (229 chars) | (absent) |
| $.line[18] | Needs your attention,INC-20261012-4BEF94,Issue regarding cleaning of water table behind Bus Depot,"Ward 52, Royapuram",Solid Waste Managemen... (222 chars) | (absent) |
| $.line[19] | Needs your attention,INC-20260930-74928B,தினமும் மாலையில் குப்பை எரிக்கப்படுகிறது. புகையால் மூச்சு விட முடியவில்லை,"Ward 131, Kodambakkam",S... (242 chars) | (absent) |
| $.line[20] | Needs your attention,INC-20261029-9ABBA7,Nuisance by Garbage Tractor/Truck: the problem on Pattunoolkaran Thottam 2nd Lane has continued for... (279 chars) | (absent) |
| $.line[21] | Needs your attention,INC-20261019-F554FB,Garbage at the dumping ground is burning for the past 12 days,"Ward 43, Tondiarpet",Solid Waste Man... (225 chars) | (absent) |
| $.line[22] | Needs your attention,INC-20261006-A551C7,Issue regarding nuisance by garbage tractor/truck in our area,"Ward 127, Kodambakkam",Solid Waste M... (227 chars) | (absent) |
| $.line[23] | Needs your attention,INC-20261018-AA72D5,Absenteeism of Sweepers: the problem near Post Office has continued for over a week,"Ward 132, Koda... (249 chars) | (absent) |
| $.line[24] | Needs your attention,INC-20261026-4A8649,Shifting of Garbage Bin: the problem opp. Kalyana Mandapam has continued for the past 10 days,"Ward... (253 chars) | (absent) |

...and 17 more paths (see the JSON file).

### officerA GET /api/collector/assistant/export?period=monthly&dept=CMWSSB

Session reads, id c83a351f40279241, 9245 bytes to 198 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="district-iq-monthly-gcc-swm.csv" to null

| Path | A | B |
|---|---|---|
| $.lines | 37 | 1 |
| $.line[1] | ﻿list,id,what,where,department,severity,why,reported,past_deadline,complaints | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download the assistant's incident list as a... (198 chars) |
| $.line[2] | Needs your attention,INC-20261103-8989A6,"Huge garbage dump near Murugan Temple bus stop, not cleared for two weeks now","Ward 148, Valasara... (249 chars) | (absent) |
| $.line[3] | Needs your attention,INC-20261104-EA19E3,குப்பை பிரச்சினை: Burning of Garbage at Dumping Ground,"Ward 38, Tondiarpet",Solid Waste Management... (219 chars) | (absent) |
| $.line[4] | Needs your attention,INC-20261030-6049C7,குப்பை பிரச்சினை: Absenteeism of Sweepers. 6 நாட்களாக தீர்வு இல்லை,"Ward 99, Anna Nagar",Solid Wast... (233 chars) | (absent) |
| $.line[5] | Needs your attention,INC-20261101-E6396C,The garbage bin on Vasantha Nagar 2nd Street is overflowing for almost a month; waste is spilling o... (283 chars) | (absent) |
| $.line[6] | Needs your attention,INC-20261021-26E727,"Engal street la garbage rendu vaaram ah eduklala, romba smell varudhu","Ward 54, Royapuram",Solid ... (237 chars) | (absent) |
| $.line[7] | Needs your attention,INC-20261031-4191C8,Issue regarding broken bin in our area. Please send the conservancy team,"Ward 55, Royapuram",Solid... (238 chars) | (absent) |
| $.line[8] | Needs your attention,INC-20261027-9FE6CE,The garbage bin opp. Primary Health Centre is overflowing for over a week; waste is spilling onto t... (271 chars) | (absent) |
| $.line[9] | Needs your attention,INC-20261102-8EC358,Garbage at the dumping ground is burning since last Monday,"Ward 125, Teynampet",Solid Waste Manage... (225 chars) | (absent) |
| $.line[10] | Needs your attention,INC-20261101-F65724,குப்பை பிரச்சினை: Broken Bin. ஒரு வாரமாக தீர்வு இல்லை,"Ward 74, Thiru-Vi-Ka-Nagar",Solid Waste Mana... (227 chars) | (absent) |
| $.line[11] | Needs your attention,INC-20261030-158A1B,Improper Sweeping: the problem on Krishna Nagar Vinayagar Nagar has continued for the last 8 days,"... (262 chars) | (absent) |
| $.line[12] | Needs your attention,INC-20261019-24B890,Overflowing of Garbage Bin: the problem in our street has continued since last Monday,"Ward 6, Thir... (254 chars) | (absent) |
| $.line[13] | Needs your attention,INC-20261020-ABCA41,"Road orathula kuppai malai maari irukku, yaarum edukala","Ward 89, Ambattur",Solid Waste Managemen... (222 chars) | (absent) |
| $.line[14] | Needs your attention,INC-20261030-CB8991,Burning of Garbage: the problem near Pillaiyar Kovil has continued for the past 4 days,"Ward 119, T... (253 chars) | (absent) |
| $.line[15] | Needs your attention,INC-20261031-C8FCE8,"Huge garbage dump near Anganwadi centre, not cleared for over a week","Ward 29, Madhavaram",Solid ... (237 chars) | (absent) |
| $.line[16] | Needs your attention,INC-20260926-EB3B79,"Pillayar Koil Street la kuppai edukala, naatram thaanga mudiyala","Ward 180, Adyar",Solid Waste Ma... (229 chars) | (absent) |
| $.line[17] | Needs your attention,INC-20261012-4BEF94,Issue regarding cleaning of water table behind Bus Depot,"Ward 52, Royapuram",Solid Waste Managemen... (222 chars) | (absent) |
| $.line[18] | Needs your attention,INC-20261029-9ABBA7,Nuisance by Garbage Tractor/Truck: the problem on Pattunoolkaran Thottam 2nd Lane has continued for... (279 chars) | (absent) |
| $.line[19] | Needs your attention,INC-20261019-F554FB,Garbage at the dumping ground is burning for the past 12 days,"Ward 43, Tondiarpet",Solid Waste Man... (225 chars) | (absent) |
| $.line[20] | Needs your attention,INC-20261018-AA72D5,Absenteeism of Sweepers: the problem near Post Office has continued for over a week,"Ward 132, Koda... (249 chars) | (absent) |
| $.line[21] | Needs your attention,INC-20261026-4A8649,Shifting of Garbage Bin: the problem opp. Kalyana Mandapam has continued for the past 10 days,"Ward... (253 chars) | (absent) |
| $.line[22] | Needs your attention,INC-20261019-41B602,Waste has been lying next to Corporation Park for two weeks now and nobody from conservancy has com... (260 chars) | (absent) |
| $.line[23] | Needs your attention,INC-20261023-A0B3CC,எங்கள் தெருவில் குப்பை இரண்டு வாரங்களாக அகற்றப்படவில்லை,"Ward 190, Perungudi",Solid Waste Managemen... (219 chars) | (absent) |
| $.line[24] | Needs your attention,INC-20261023-11DF0E,"Engal street la garbage one week ah eduklala, romba smell varudhu","Ward 152, Valasaravakkam",Soli... (236 chars) | (absent) |

...and 13 more paths (see the JSON file).

### officerA GET /api/collector/assistant/export?zone=5

Session reads, id 98d05910249b19fd, 79 bytes to 198 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="district-iq-daily-zone5-gcc-swm.csv" to null

| Path | A | B |
|---|---|---|
| $.line[1] | ﻿list,id,what,where,department,severity,why,reported,past_deadline,complaints | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download the assistant's incident list as a... (198 chars) |

### officerB GET /api/collector/assistant/export

Session reads, id 40339f76acfe36eb, 666 bytes to 198 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="district-iq-daily-gcc-ele.csv" to null

| Path | A | B |
|---|---|---|
| $.lines | 3 | 1 |
| $.line[1] | ﻿list,id,what,where,department,severity,why,reported,past_deadline,complaints | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download the assistant's incident list as a... (198 chars) |
| $.line[2] | Needs your attention,INC-20261106-DDB161,தெருவிளக்கு கம்பத்தில் மின்சாரம் தாக்குகிறது,"Ward 48, Tondiarpet",Street Lighting & Electrical,Hig... (264 chars) | (absent) |
| $.line[3] | Needs your attention,INC-20261105-45E2DD,People are getting electric shock from the street light pole in our street,"Ward 168, Perungudi",St... (239 chars) | (absent) |

### officerB GET /api/collector/assistant/export?period=weekly

Session reads, id 41c82b220f7272d9, 5662 bytes to 198 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="district-iq-weekly-gcc-ele.csv" to null

| Path | A | B |
|---|---|---|
| $.lines | 22 | 1 |
| $.line[1] | ﻿list,id,what,where,department,severity,why,reported,past_deadline,complaints | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download the assistant's incident list as a... (198 chars) |
| $.line[2] | Needs your attention,INC-20261101-3200FD,Chennai: Construction worker killed by electric shock,"Ward 189, Perungudi",Street Lighting & Elect... (324 chars) | (absent) |
| $.line[3] | Needs your attention,INC-20260616-77B20A,"Person received an electric shock from a snapped wire reported on West Mada Street Extension, Kala... (376 chars) | (absent) |
| $.line[4] | Needs your attention,INC-20261104-83D2C2,People are getting electric shock from the street light pole opp,"Ward 72, Thiru-Vi-Ka-Nagar",Stree... (242 chars) | (absent) |
| $.line[5] | Needs your attention,INC-20261104-FDA42B,People are getting electric shock from the street light pole near Corporation School,"Ward 186, Per... (255 chars) | (absent) |
| $.line[6] | Needs your attention,INC-20260712-9475F7,Temporary EB cable causes inconvenience to MKB Nagar residents,"Ward 36, Tondiarpet",Street Lightin... (233 chars) | (absent) |
| $.line[7] | Needs your attention,INC-20261104-DE5CBD,Damage to the Electric pole in our area. Please send the electrical team,"Ward 52, Royapuram",Stree... (289 chars) | (absent) |
| $.line[8] | Needs your attention,INC-20261106-DDB161,தெருவிளக்கு கம்பத்தில் மின்சாரம் தாக்குகிறது,"Ward 48, Tondiarpet",Street Lighting & Electrical,Hig... (264 chars) | (absent) |
| $.line[9] | Needs your attention,INC-20261105-D65198,People are getting electric shock from the street light pole near Pillaiyar Kovil,"Ward 112, Teynam... (274 chars) | (absent) |
| $.line[10] | Needs your attention,INC-20261103-2EAF09,"Naan S.V.M. Nagar Tnscp Road, P. Block la door no 43 la irukken","Ward 104, Anna Nagar",Street Lig... (237 chars) | (absent) |
| $.line[11] | Needs your attention,INC-20261105-45E2DD,People are getting electric shock from the street light pole in our street,"Ward 168, Perungudi",St... (239 chars) | (absent) |
| $.line[12] | Needs your attention,INC-20261103-1D9CB6,People are getting electric shock from the street light pole near Railway station entrance,"Ward 48... (315 chars) | (absent) |
| $.line[13] | Needs your attention,INC-20261105-B1B9CB,Electric shock due to street light near Water tank,"Ward 60, Royapuram",Street Lighting & Electrica... (242 chars) | (absent) |
| $.line[14] | Needs your attention,INC-20261102-590D78,Street light problem opp. Govt Higher Secondary School: overhead cable wires running in a haphazard... (277 chars) | (absent) |
| $.line[15] | Needs your attention,INC-20261031-9004FA,"Street light rendu vaaram ah eriyala, night la nadandhu poga bayama irukku","Ward 124, Teynampet",... (249 chars) | (absent) |
| $.line[16] | Needs your attention,INC-20261104-98510F,தெருவிளக்கு பிரச்சினை: Electric shock due to street light,"Ward 101, Anna Nagar",Street Lighting & ... (204 chars) | (absent) |
| $.line[17] | Needs your attention,INC-20261105-150A86,People are getting electric shock from the street light pole in our area,"Ward 196, Sholinganallur"... (223 chars) | (absent) |
| $.line[18] | Needs your attention,INC-20261031-1EA35B,"Street light one week ah eriyala, night la nadandhu poga bayama irukku","Ward 173, Adyar",Street L... (241 chars) | (absent) |
| $.line[19] | Needs your attention,INC-20261101-E5B33A,Street light problem near Corporation School: shifting of street light pole,"Ward 186, Perungudi",S... (248 chars) | (absent) |
| $.line[20] | Needs your attention,INC-20261101-AFFB21,"Street light one week ah eriyala, night la nadandhu poga bayama irukku","Ward 93, Ambattur",Street... (243 chars) | (absent) |
| $.line[21] | Needs your attention,INC-20261102-C91B0D,Street light problem: Damage to the Electric pole,"Ward 6, Thiruvottiyur",Street Lighting & Electri... (224 chars) | (absent) |
| $.line[22] | Needs your attention,INC-20261031-31BC38,Damage to the Electric pole in our area. Please send the electrical team,"Ward 176, Adyar",Street L... (241 chars) | (absent) |

### officerB GET /api/collector/assistant/export?period=monthly&zone=13

Session reads, id f4debebf804e69bb, 563 bytes to 198 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="district-iq-monthly-zone13-gcc-ele.csv" to null

| Path | A | B |
|---|---|---|
| $.lines | 3 | 1 |
| $.line[1] | ﻿list,id,what,where,department,severity,why,reported,past_deadline,complaints | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download the assistant's incident list as a... (198 chars) |
| $.line[2] | Needs your attention,INC-20261031-1EA35B,"Street light one week ah eriyala, night la nadandhu poga bayama irukku","Ward 173, Adyar",Street L... (241 chars) | (absent) |
| $.line[3] | Needs your attention,INC-20261031-31BC38,Damage to the Electric pole in our area. Please send the electrical team,"Ward 176, Adyar",Street L... (241 chars) | (absent) |

### officerB GET /api/collector/assistant/export?period=quarterly&dept=GCC-SWM

Session reads, id a0f68e19cb3ed819, 10187 bytes to 198 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="district-iq-quarterly-gcc-ele.csv" to null

| Path | A | B |
|---|---|---|
| $.lines | 39 | 1 |
| $.line[1] | ﻿list,id,what,where,department,severity,why,reported,past_deadline,complaints | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download the assistant's incident list as a... (198 chars) |
| $.line[2] | Needs your attention,INC-20261101-3200FD,Chennai: Construction worker killed by electric shock,"Ward 189, Perungudi",Street Lighting & Elect... (324 chars) | (absent) |
| $.line[3] | Needs your attention,INC-20260616-77B20A,"Person received an electric shock from a snapped wire reported on West Mada Street Extension, Kala... (376 chars) | (absent) |
| $.line[4] | Needs your attention,INC-20261104-83D2C2,People are getting electric shock from the street light pole opp,"Ward 72, Thiru-Vi-Ka-Nagar",Stree... (242 chars) | (absent) |
| $.line[5] | Needs your attention,INC-20261104-FDA42B,People are getting electric shock from the street light pole near Corporation School,"Ward 186, Per... (255 chars) | (absent) |
| $.line[6] | Needs your attention,INC-20260712-9475F7,Temporary EB cable causes inconvenience to MKB Nagar residents,"Ward 36, Tondiarpet",Street Lightin... (233 chars) | (absent) |
| $.line[7] | Needs your attention,INC-20261104-DE5CBD,Damage to the Electric pole in our area. Please send the electrical team,"Ward 52, Royapuram",Stree... (289 chars) | (absent) |
| $.line[8] | Needs your attention,INC-20261106-DDB161,தெருவிளக்கு கம்பத்தில் மின்சாரம் தாக்குகிறது,"Ward 48, Tondiarpet",Street Lighting & Electrical,Hig... (264 chars) | (absent) |
| $.line[9] | Needs your attention,INC-20261024-C62618,Street light problem near Post Office: damage to the electric pole,"Ward 189, Perungudi",Street Lig... (265 chars) | (absent) |
| $.line[10] | Needs your attention,INC-20261105-D65198,People are getting electric shock from the street light pole near Pillaiyar Kovil,"Ward 112, Teynam... (274 chars) | (absent) |
| $.line[11] | Needs your attention,INC-20261016-4BBE45,Street light opp. Primary Health Centre is not working for the last 11 days,"Ward 104, Anna Nagar",... (247 chars) | (absent) |
| $.line[12] | Needs your attention,INC-20261103-2EAF09,"Naan S.V.M. Nagar Tnscp Road, P. Block la door no 43 la irukken","Ward 104, Anna Nagar",Street Lig... (237 chars) | (absent) |
| $.line[13] | Needs your attention,INC-20261105-45E2DD,People are getting electric shock from the street light pole in our street,"Ward 168, Perungudi",St... (239 chars) | (absent) |
| $.line[14] | Needs your attention,INC-20261103-1D9CB6,People are getting electric shock from the street light pole near Railway station entrance,"Ward 48... (315 chars) | (absent) |
| $.line[15] | Needs your attention,INC-20261105-B1B9CB,Electric shock due to street light near Water tank,"Ward 60, Royapuram",Street Lighting & Electrica... (242 chars) | (absent) |
| $.line[16] | Needs your attention,INC-20261009-A0AD12,Street light near Pillaiyar Kovil is not working since last Monday,"Ward 56, Royapuram",Street Ligh... (293 chars) | (absent) |
| $.line[17] | Needs your attention,INC-20261021-16E04B,Street light near Mariamman Kovil is not working for almost a month,"Ward 155, Valasaravakkam",Stre... (245 chars) | (absent) |
| $.line[18] | Needs your attention,INC-20261102-590D78,Street light problem opp. Govt Higher Secondary School: overhead cable wires running in a haphazard... (277 chars) | (absent) |
| $.line[19] | Needs your attention,INC-20261031-9004FA,"Street light rendu vaaram ah eriyala, night la nadandhu poga bayama irukku","Ward 124, Teynampet",... (249 chars) | (absent) |
| $.line[20] | Needs your attention,INC-20261104-98510F,தெருவிளக்கு பிரச்சினை: Electric shock due to street light,"Ward 101, Anna Nagar",Street Lighting & ... (204 chars) | (absent) |
| $.line[21] | Needs your attention,INC-20261105-150A86,People are getting electric shock from the street light pole in our area,"Ward 196, Sholinganallur"... (223 chars) | (absent) |
| $.line[22] | Needs your attention,INC-20261027-742325,தெருவிளக்கு பிரச்சினை: Inadequate light in a particular location or spot/ dark spots,"Ward 56, Roya... (310 chars) | (absent) |
| $.line[23] | Needs your attention,INC-20261031-1EA35B,"Street light one week ah eriyala, night la nadandhu poga bayama irukku","Ward 173, Adyar",Street L... (241 chars) | (absent) |
| $.line[24] | Needs your attention,INC-20261101-E5B33A,Street light problem near Corporation School: shifting of street light pole,"Ward 186, Perungudi",S... (248 chars) | (absent) |

...and 15 more paths (see the JSON file).

### officerB GET /api/collector/assistant/export?period=monthly&dept=CMWSSB

Session reads, id 0e7b5977ec4903af, 9426 bytes to 198 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="district-iq-monthly-gcc-ele.csv" to null

| Path | A | B |
|---|---|---|
| $.lines | 36 | 1 |
| $.line[1] | ﻿list,id,what,where,department,severity,why,reported,past_deadline,complaints | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download the assistant's incident list as a... (198 chars) |
| $.line[2] | Needs your attention,INC-20261101-3200FD,Chennai: Construction worker killed by electric shock,"Ward 189, Perungudi",Street Lighting & Elect... (324 chars) | (absent) |
| $.line[3] | Needs your attention,INC-20260616-77B20A,"Person received an electric shock from a snapped wire reported on West Mada Street Extension, Kala... (376 chars) | (absent) |
| $.line[4] | Needs your attention,INC-20261104-83D2C2,People are getting electric shock from the street light pole opp,"Ward 72, Thiru-Vi-Ka-Nagar",Stree... (242 chars) | (absent) |
| $.line[5] | Needs your attention,INC-20261104-FDA42B,People are getting electric shock from the street light pole near Corporation School,"Ward 186, Per... (255 chars) | (absent) |
| $.line[6] | Needs your attention,INC-20260712-9475F7,Temporary EB cable causes inconvenience to MKB Nagar residents,"Ward 36, Tondiarpet",Street Lightin... (233 chars) | (absent) |
| $.line[7] | Needs your attention,INC-20261104-DE5CBD,Damage to the Electric pole in our area. Please send the electrical team,"Ward 52, Royapuram",Stree... (289 chars) | (absent) |
| $.line[8] | Needs your attention,INC-20261106-DDB161,தெருவிளக்கு கம்பத்தில் மின்சாரம் தாக்குகிறது,"Ward 48, Tondiarpet",Street Lighting & Electrical,Hig... (264 chars) | (absent) |
| $.line[9] | Needs your attention,INC-20261024-C62618,Street light problem near Post Office: damage to the electric pole,"Ward 189, Perungudi",Street Lig... (265 chars) | (absent) |
| $.line[10] | Needs your attention,INC-20261105-D65198,People are getting electric shock from the street light pole near Pillaiyar Kovil,"Ward 112, Teynam... (274 chars) | (absent) |
| $.line[11] | Needs your attention,INC-20261016-4BBE45,Street light opp. Primary Health Centre is not working for the last 11 days,"Ward 104, Anna Nagar",... (247 chars) | (absent) |
| $.line[12] | Needs your attention,INC-20261103-2EAF09,"Naan S.V.M. Nagar Tnscp Road, P. Block la door no 43 la irukken","Ward 104, Anna Nagar",Street Lig... (237 chars) | (absent) |
| $.line[13] | Needs your attention,INC-20261105-45E2DD,People are getting electric shock from the street light pole in our street,"Ward 168, Perungudi",St... (239 chars) | (absent) |
| $.line[14] | Needs your attention,INC-20261103-1D9CB6,People are getting electric shock from the street light pole near Railway station entrance,"Ward 48... (315 chars) | (absent) |
| $.line[15] | Needs your attention,INC-20261105-B1B9CB,Electric shock due to street light near Water tank,"Ward 60, Royapuram",Street Lighting & Electrica... (242 chars) | (absent) |
| $.line[16] | Needs your attention,INC-20261009-A0AD12,Street light near Pillaiyar Kovil is not working since last Monday,"Ward 56, Royapuram",Street Ligh... (293 chars) | (absent) |
| $.line[17] | Needs your attention,INC-20261021-16E04B,Street light near Mariamman Kovil is not working for almost a month,"Ward 155, Valasaravakkam",Stre... (245 chars) | (absent) |
| $.line[18] | Needs your attention,INC-20261102-590D78,Street light problem opp. Govt Higher Secondary School: overhead cable wires running in a haphazard... (277 chars) | (absent) |
| $.line[19] | Needs your attention,INC-20261031-9004FA,"Street light rendu vaaram ah eriyala, night la nadandhu poga bayama irukku","Ward 124, Teynampet",... (249 chars) | (absent) |
| $.line[20] | Needs your attention,INC-20261104-98510F,தெருவிளக்கு பிரச்சினை: Electric shock due to street light,"Ward 101, Anna Nagar",Street Lighting & ... (204 chars) | (absent) |
| $.line[21] | Needs your attention,INC-20261105-150A86,People are getting electric shock from the street light pole in our area,"Ward 196, Sholinganallur"... (223 chars) | (absent) |
| $.line[22] | Needs your attention,INC-20261027-742325,தெருவிளக்கு பிரச்சினை: Inadequate light in a particular location or spot/ dark spots,"Ward 56, Roya... (310 chars) | (absent) |
| $.line[23] | Needs your attention,INC-20261031-1EA35B,"Street light one week ah eriyala, night la nadandhu poga bayama irukku","Ward 173, Adyar",Street L... (241 chars) | (absent) |
| $.line[24] | Needs your attention,INC-20261101-E5B33A,Street light problem near Corporation School: shifting of street light pole,"Ward 186, Perungudi",S... (248 chars) | (absent) |

...and 12 more paths (see the JSON file).

### officerB GET /api/collector/assistant/export?zone=5

Session reads, id 9e99b785703ece4a, 79 bytes to 198 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="district-iq-daily-zone5-gcc-ele.csv" to null

| Path | A | B |
|---|---|---|
| $.line[1] | ﻿list,id,what,where,department,severity,why,reported,past_deadline,complaints | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download the assistant's incident list as a... (198 chars) |

### collector GET /api/collector/assistant/export

Session reads, id d89d594e7e2cee67, 13299 bytes to 198 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="district-iq-daily.csv" to null

| Path | A | B |
|---|---|---|
| $.lines | 48 | 1 |
| $.line[1] | ﻿list,id,what,where,department,severity,why,reported,past_deadline,complaints | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download the assistant's incident list as a... (198 chars) |
| $.line[2] | Needs your attention,INC-20260515-B939EB,Ice House: uprooted tree blocks road,"Ward 115, Teynampet",PWD Water Resources,Severe,Still open at... (276 chars) | (absent) |
| $.line[3] | Needs your attention,INC-20261105-6D03C9,"Pls send pumpset to Bajanai Koil St, Pallikaranai","Ward 197, Sholinganallur",PWD Water Resources,... (321 chars) | (absent) |
| $.line[4] | Needs your attention,INC-20261105-6B3555,Cooum River - Chetpet stretch spilling over bank at Chetpet (MGR St),"Ward 61, Royapuram",PWD Water... (332 chars) | (absent) |
| $.line[5] | Needs your attention,INC-20261105-5C94BB,"Call recd: canal water flowing into Srinivasa Nagar 6th St, Saidapet from Adyar River","Ward 170, ... (348 chars) | (absent) |
| $.line[6] | Needs your attention,INC-20261105-EE9D37,Elderly man hit by share auto dies in Vadapalani; drunk driver arrested,"Ward 130, Kodambakkam",Gre... (328 chars) | (absent) |
| $.line[7] | Needs your attention,INC-20261105-61CDCB,chetpt lake full capacity reach aayiduhu chetpet,"Ward 58, Royapuram",PWD Water Resources,Severe,St... (312 chars) | (absent) |
| $.line[8] | Needs your attention,INC-20261105-A9E19D,"Old wall collapsed after rain near church, Vyasarpadi","Ward 68, Thiru-Vi-Ka-Nagar",PWD Water Reso... (225 chars) | (absent) |
| $.line[9] | Needs your attention,INC-20261106-A40AD7,"'Stabbed 10 times': Chennai man kills wife with kitchen knife, surrenders","Ward 192, Sholinganall... (335 chars) | (absent) |
| $.line[10] | Needs your attention,INC-20261106-BAE416,School van driver arrested for sexually assaulting five-year-old girl in Chennai,"Ward 23, Madhavar... (310 chars) | (absent) |
| $.line[11] | Needs your attention,INC-20260905-319067,Death of Chennai fishermen: CM Vijay announces compensation,"Ward 43, Tondiarpet",Greater Chennai P... (315 chars) | (absent) |
| $.line[12] | Needs your attention,INC-20261105-DDD4E8,Four Kasimedu fishermen lost in the 'Murazu' storm; search for five others intensified; Tamil Nadu ... (366 chars) | (absent) |
| $.line[13] | Needs your attention,INC-20261105-AB1018,Nine TN fishermen go missing in cyclone; five bodies wash ashore in Andhra Pradesh,"Ward 43, Tondia... (338 chars) | (absent) |
| $.line[14] | Needs your attention,INC-20261106-C854D7,Fatal crash near Ennore Creek Bridge,"Ward 2, Thiruvottiyur",Greater Chennai Police,Severe,1 person... (171 chars) | (absent) |
| $.line[15] | Needs your attention,INC-20260515-ACC375,"Field staff report water stagnation on Easwar Nagar 2nd Street, Kodambakkam; pumping needed","Ward... (305 chars) | (absent) |
| $.line[16] | Needs your attention,INC-20261106-DDB161,தெருவிளக்கு கம்பத்தில் மின்சாரம் தாக்குகிறது,"Ward 48, Tondiarpet",Street Lighting & Electrical,Hig... (264 chars) | (absent) |
| $.line[17] | Needs your attention,INC-20261106-C8F727,School students assault MTC bus conductor in Porur for asking to avoid footboard travel,"Ward 150, ... (304 chars) | (absent) |
| $.line[18] | Needs your attention,INC-20261106-E236AA,Bajanai Koil Main Road வீடுகளுக்குள் மழைநீர் புகுந்துள்ளது,"Ward 49, Royapuram",Storm Water Drain,H... (266 chars) | (absent) |
| $.line[19] | Needs your attention,INC-20261105-45E2DD,People are getting electric shock from the street light pole in our street,"Ward 168, Perungudi",St... (239 chars) | (absent) |
| $.line[20] | Needs your attention,INC-20261105-7F8A54,"Site visit - Heavy stagnation near PHC in Kilpauk, approx knee-deep","Ward 76, Thiru-Vi-Ka-Nagar",... (287 chars) | (absent) |
| $.line[21] | Needs your attention,INC-20261105-F6BC59,"Low lying area Anna St, Porur inundated. Water level nearly 2 ft","Ward 147, Valasaravakkam",PWD W... (282 chars) | (absent) |
| $.line[22] | Needs your attention,INC-20261105-072B60,"Kodungaiyur Canal நீர்மட்டம் உயர்ந்து குடியிருப்புகளுக்குள் புகும் அபாயம், Kodungaiyur South St","... (315 chars) | (absent) |
| $.line[23] | Needs your attention,INC-20261105-5814DE,"Bazaar St, Guindy பகுதியில் இடுப்பளவு மழைநீர் தேங்கியுள்ளது","Ward 174, Adyar",PWD Water Resources... (268 chars) | (absent) |
| $.line[24] | Needs your attention,INC-20261105-6798E8,"Dear sir, Madhavaram Surplus Drain: bank level crossed at Madhavaram Milk Colony, water on road kn... (270 chars) | (absent) |

...and 24 more paths (see the JSON file).

### collector GET /api/collector/assistant/export?period=weekly

Session reads, id 8df5c0b9873fe3d7, 79759 bytes to 198 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="district-iq-weekly.csv" to null

| Path | A | B |
|---|---|---|
| $.lines | 294 | 1 |
| $.line[1] | ﻿list,id,what,where,department,severity,why,reported,past_deadline,complaints | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download the assistant's incident list as a... (198 chars) |
| $.line[2] | Needs your attention,INC-20261105-0476D7,Families stranded by flooding at Kellys,"Ward 104, Anna Nagar",PWD Water Resources,Severe,Still ope... (280 chars) | (absent) |
| $.line[3] | Needs your attention,INC-20260515-B939EB,Ice House: uprooted tree blocks road,"Ward 115, Teynampet",PWD Water Resources,Severe,Still open at... (276 chars) | (absent) |
| $.line[4] | Needs your attention,INC-20260516-4D00AC,Floodwater traps residents near Temple St,"Ward 104, Anna Nagar",PWD Water Resources,Severe,Still o... (276 chars) | (absent) |
| $.line[5] | Needs your attention,INC-20261103-53934E-1,Canal overflowing near Gangai Nagar; water entering nearby streets including Poongodiammal Street... (331 chars) | (absent) |
| $.line[6] | Needs your attention,INC-20261105-BB4429,"Mogappair: Karpagam Ave fully flooded near OHT water tank, knee-deep","Ward 85, Ambattur",PWD Wate... (320 chars) | (absent) |
| $.line[7] | Needs your attention,INC-20261105-D0CC25,"Wall along Govt Kilpauk Medical College Hospital gave way near Main Rd, Kilpauk","Ward 78, Thiru-V... (341 chars) | (absent) |
| $.line[8] | Needs your attention,INC-20261022-73B9C3,Seven Wells: inundation strands residents,"Ward 56, Royapuram",PWD Water Resources,Severe,Still ope... (300 chars) | (absent) |
| $.line[9] | Needs your attention,INC-20261104-22A6D5,Patrol team: Overflow from the canal near bus stop - Chetpet residents alarmed,"Ward 58, Royapuram"... (295 chars) | (absent) |
| $.line[10] | Needs your attention,INC-20261025-09E045,Floodwater traps residents near Periya Mettu Palayam 1st Road,"Ward 10, Thiruvottiyur",PWD Water Re... (325 chars) | (absent) |
| $.line[11] | Needs your attention,INC-20261031-648BD2,"Prisoner under police custody escapes in Kolathur, Chennai!","Ward 23, Madhavaram",Greater Chennai... (316 chars) | (absent) |
| $.line[12] | Needs your attention,INC-20261101-EC06C4,Woman with disability dies in midnight fire at Korattur apartment,"Ward 83, Ambattur",Greater Chenn... (308 chars) | (absent) |
| $.line[13] | Needs your attention,INC-20261105-5CE479,Newborn girl found abandoned in Neelankarai,"Ward 192, Sholinganallur",District Disaster Management... (309 chars) | (absent) |
| $.line[14] | Needs your attention,INC-20261105-E00D42,Wife dies in front of husband's eyes as lorry hits near Porur toll plaza,"Ward 150, Valasaravakkam"... (332 chars) | (absent) |
| $.line[15] | Needs your attention,INC-20260529-9C273D,"Field staff report water stagnation on Jeeva Nagar 17th St, Korukkupet; pumping needed","Ward 48, ... (322 chars) | (absent) |
| $.line[16] | Needs your attention,INC-20261105-6D03C9,"Pls send pumpset to Bajanai Koil St, Pallikaranai","Ward 197, Sholinganallur",PWD Water Resources,... (321 chars) | (absent) |
| $.line[17] | Needs your attention,INC-20261102-3B27A7,Canal overflowing near Ernavoor; water entering nearby streets including Manali Express Road,"Ward ... (300 chars) | (absent) |
| $.line[18] | Needs your attention,INC-20261103-53934E,Man electrocuted after bike falls into waterlogged pothole in Madhavaram,"Ward 30, Madhavaram",Grea... (308 chars) | (absent) |
| $.line[19] | Needs your attention,INC-20261104-3F4AC4-1,"CR: mogappair Eri reached FTL, surplus course opp","Ward 85, Ambattur",PWD Water Resources,Sever... (316 chars) | (absent) |
| $.line[20] | Needs your attention,INC-20261104-5B3F36,"T. Nagar மார்க்கெட் அருகில் முழங்கால் அளவு தண்ணீர், பள்ளி குழந்தைகள் செல்ல சிரமம்","Ward 140, Koda... (350 chars) | (absent) |
| $.line[21] | Needs your attention,INC-20261105-E9CD2E,Dengue Surge; Bed Capacity Critical at Rajiv Gandhi Government General Hospital,"Ward 59, Royapuram... (345 chars) | (absent) |
| $.line[22] | Needs your attention,INC-20261105-0E6577,"Cooum River full ah overflow aagudhu, Chetpet School St kulla thanni varudhu","Ward 58, Royapuram"... (295 chars) | (absent) |
| $.line[23] | Needs your attention,INC-20261105-6B3555,Cooum River - Chetpet stretch spilling over bank at Chetpet (MGR St),"Ward 61, Royapuram",PWD Water... (332 chars) | (absent) |
| $.line[24] | Needs your attention,INC-20261105-5C94BB,"Call recd: canal water flowing into Srinivasa Nagar 6th St, Saidapet from Adyar River","Ward 170, ... (348 chars) | (absent) |

...and 270 more paths (see the JSON file).

### collector GET /api/collector/assistant/export?period=monthly&zone=13

Session reads, id d3af7b7712c585ce, 13546 bytes to 198 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="district-iq-monthly-zone13.csv" to null

| Path | A | B |
|---|---|---|
| $.lines | 53 | 1 |
| $.line[1] | ﻿list,id,what,where,department,severity,why,reported,past_deadline,complaints | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download the assistant's incident list as a... (198 chars) |
| $.line[2] | Needs your attention,INC-20261021-B1DD28-1,Caller reported waterlogging on M,"Ward 171, Adyar",Storm Water Drain,High,Still open at more tha... (221 chars) | (absent) |
| $.line[3] | Needs your attention,INC-20261105-5C94BB,"Call recd: canal water flowing into Srinivasa Nagar 6th St, Saidapet from Adyar River","Ward 170, ... (348 chars) | (absent) |
| $.line[4] | Needs your attention,INC-20261029-A570CE,"Maraimalai Adigal Bridge, Saidapet: railing broken and potholes on approach, Saidapet","Ward 170, ... (294 chars) | (absent) |
| $.line[5] | Needs your attention,INC-20261105-BFD2E3,Little Mount பெட்ரோல் பங்க் எதிரில் சாலையில் தண்ணீர் தேங்கி வாகனங்கள் செல்ல முடியவில்லை,"Ward 170, ... (348 chars) | (absent) |
| $.line[6] | Needs your attention,INC-20261021-238B98-1,Kottivakkam: uprooted tree blocks road,"Ward 182, Adyar",PWD Water Resources,High,Still open at m... (269 chars) | (absent) |
| $.line[7] | Needs your attention,INC-20261024-CC1F95,"Maraimalai Adigal Bridge, Saidapet இணைப்பு சாலையில் அரிப்பு, வாகன ஓட்டிகள் அச்சம்","Ward 170, Adya... (290 chars) | (absent) |
| $.line[8] | Needs your attention,INC-20261018-F26B30,Tree falls across road at Thiruvanmiyur,"Ward 181, Adyar",Greater Chennai Police,High,Still open at... (200 chars) | (absent) |
| $.line[9] | Needs your attention,INC-20261031-663467,"Waterlogging reported at Subramaniyar Koil St, Guindy Industrial Estate - ankle-deep water, vehicl... (330 chars) | (absent) |
| $.line[10] | Needs your attention,INC-20261027-C3D054,Search on for a teenage girl last seen near Anna Centenary Library,"Ward 172, Adyar",Greater Chenna... (284 chars) | (absent) |
| $.line[11] | Needs your attention,INC-20261031-764F7A,"Canal water flowing into Anna St, Jafferkhanpet from Adyar River","Ward 174, Adyar",PWD Water Reso... (326 chars) | (absent) |
| $.line[12] | Needs your attention,INC-20261103-3B18F3,Missing person complaint: a schoolboy from Guindy,"Ward 174, Adyar",Greater Chennai Police,High,No ... (267 chars) | (absent) |
| $.line[13] | Needs your attention,INC-20261104-A0AEDD,Tree falls across road at Taramani,"Ward 180, Adyar",Greater Chennai Police,High,Still open at more... (195 chars) | (absent) |
| $.line[14] | Needs your attention,INC-20261104-88A6DF,Structure collapse reported in Kotturpuram,"Ward 171, Adyar",Greater Chennai Police,High,Still open... (257 chars) | (absent) |
| $.line[15] | Needs your attention,INC-20260708-E4914B,Families stranded by flooding at Adayar,"Ward 171, Adyar",Greater Chennai Police,High,Needs several... (218 chars) | (absent) |
| $.line[16] | Needs your attention,INC-20261104-F9A212,Families stranded by flooding at Thiruvanmiyur,"Ward 182, Adyar",Greater Chennai Police,High,Still ... (207 chars) | (absent) |
| $.line[17] | Needs your attention,INC-20261028-54740E,Collision at Velachery leaves two injured,"Ward 179, Adyar",Greater Chennai Police,Severe,1 person ... (170 chars) | (absent) |
| $.line[18] | Needs your attention,INC-20261104-39E85E,"rain water stagnant knee-deep on balaji nagar main rd, guindy industrial estate near subway","Ward... (328 chars) | (absent) |
| $.line[19] | Needs your attention,INC-20261105-5814DE,"Bazaar St, Guindy பகுதியில் இடுப்பளவு மழைநீர் தேங்கியுள்ளது","Ward 174, Adyar",PWD Water Resources... (268 chars) | (absent) |
| $.line[20] | Needs your attention,INC-20261023-6C7674,Stagnation of Water தொடர்பாக புகார். மழை பெய்தால் தெரு முழுவதும் தண்ணீர் தேங்குகிறது,"Ward 171, Ady... (296 chars) | (absent) |
| $.line[21] | Needs your attention,INC-20261031-C405C6,"Unsafe dark spots/ corners problem irukku, konjam indha road-a paarunga","Ward 173, Adyar",Roads &... (240 chars) | (absent) |
| $.line[22] | Needs your attention,INC-20261023-2256D5,Pedestrian hit by vehicle near Taramani,"Ward 180, Adyar",Greater Chennai Police,Severe,1 person ha... (222 chars) | (absent) |
| $.line[23] | Needs your attention,INC-20261101-86BE85,"Two-wheeler skids and falls near Kathipara Junction, SIDCO Industrial Estate","Ward 174, Adyar",Gr... (261 chars) | (absent) |
| $.line[24] | Needs your attention,INC-20261104-1D6F0C,Families stranded by flooding at Velachery,"Ward 177, Adyar",Greater Chennai Police,High,Past its 2... (233 chars) | (absent) |

...and 29 more paths (see the JSON file).

### collector GET /api/collector/assistant/export?period=quarterly&dept=GCC-SWM

Session reads, id d0e460dedb9feebd, 10572 bytes to 198 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="district-iq-quarterly-gcc-swm.csv" to null

| Path | A | B |
|---|---|---|
| $.lines | 41 | 1 |
| $.line[1] | ﻿list,id,what,where,department,severity,why,reported,past_deadline,complaints | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download the assistant's incident list as a... (198 chars) |
| $.line[2] | Needs your attention,INC-20261103-8989A6,"Huge garbage dump near Murugan Temple bus stop, not cleared for two weeks now","Ward 148, Valasara... (249 chars) | (absent) |
| $.line[3] | Needs your attention,INC-20261104-EA19E3,குப்பை பிரச்சினை: Burning of Garbage at Dumping Ground,"Ward 38, Tondiarpet",Solid Waste Management... (219 chars) | (absent) |
| $.line[4] | Needs your attention,INC-20261030-6049C7,குப்பை பிரச்சினை: Absenteeism of Sweepers. 6 நாட்களாக தீர்வு இல்லை,"Ward 99, Anna Nagar",Solid Wast... (233 chars) | (absent) |
| $.line[5] | Needs your attention,INC-20261101-E6396C,The garbage bin on Vasantha Nagar 2nd Street is overflowing for almost a month; waste is spilling o... (283 chars) | (absent) |
| $.line[6] | Needs your attention,INC-20261021-26E727,"Engal street la garbage rendu vaaram ah eduklala, romba smell varudhu","Ward 54, Royapuram",Solid ... (237 chars) | (absent) |
| $.line[7] | Needs your attention,INC-20261031-4191C8,Issue regarding broken bin in our area. Please send the conservancy team,"Ward 55, Royapuram",Solid... (238 chars) | (absent) |
| $.line[8] | Needs your attention,INC-20260930-80DEA4,சாலை ஓரத்தில் குப்பை மலை போல் குவிந்துள்ளது. 10 நாட்களாக யாரும் அகற்றவில்லை,"Ward 56, Royapuram",So... (241 chars) | (absent) |
| $.line[9] | Needs your attention,INC-20261027-9FE6CE,The garbage bin opp. Primary Health Centre is overflowing for over a week; waste is spilling onto t... (271 chars) | (absent) |
| $.line[10] | Needs your attention,INC-20261102-8EC358,Garbage at the dumping ground is burning since last Monday,"Ward 125, Teynampet",Solid Waste Manage... (225 chars) | (absent) |
| $.line[11] | Needs your attention,INC-20261101-F65724,குப்பை பிரச்சினை: Broken Bin. ஒரு வாரமாக தீர்வு இல்லை,"Ward 74, Thiru-Vi-Ka-Nagar",Solid Waste Mana... (227 chars) | (absent) |
| $.line[12] | Needs your attention,INC-20261030-158A1B,Improper Sweeping: the problem on Krishna Nagar Vinayagar Nagar has continued for the last 8 days,"... (262 chars) | (absent) |
| $.line[13] | Needs your attention,INC-20261019-24B890,Overflowing of Garbage Bin: the problem in our street has continued since last Monday,"Ward 6, Thir... (254 chars) | (absent) |
| $.line[14] | Needs your attention,INC-20261020-ABCA41,"Road orathula kuppai malai maari irukku, yaarum edukala","Ward 89, Ambattur",Solid Waste Managemen... (222 chars) | (absent) |
| $.line[15] | Needs your attention,INC-20261030-CB8991,Burning of Garbage: the problem near Pillaiyar Kovil has continued for the past 4 days,"Ward 119, T... (253 chars) | (absent) |
| $.line[16] | Needs your attention,INC-20261031-C8FCE8,"Huge garbage dump near Anganwadi centre, not cleared for over a week","Ward 29, Madhavaram",Solid ... (237 chars) | (absent) |
| $.line[17] | Needs your attention,INC-20260926-EB3B79,"Pillayar Koil Street la kuppai edukala, naatram thaanga mudiyala","Ward 180, Adyar",Solid Waste Ma... (229 chars) | (absent) |
| $.line[18] | Needs your attention,INC-20261012-4BEF94,Issue regarding cleaning of water table behind Bus Depot,"Ward 52, Royapuram",Solid Waste Managemen... (222 chars) | (absent) |
| $.line[19] | Needs your attention,INC-20260930-74928B,தினமும் மாலையில் குப்பை எரிக்கப்படுகிறது. புகையால் மூச்சு விட முடியவில்லை,"Ward 131, Kodambakkam",S... (242 chars) | (absent) |
| $.line[20] | Needs your attention,INC-20261029-9ABBA7,Nuisance by Garbage Tractor/Truck: the problem on Pattunoolkaran Thottam 2nd Lane has continued for... (279 chars) | (absent) |
| $.line[21] | Needs your attention,INC-20261019-F554FB,Garbage at the dumping ground is burning for the past 12 days,"Ward 43, Tondiarpet",Solid Waste Man... (225 chars) | (absent) |
| $.line[22] | Needs your attention,INC-20261006-A551C7,Issue regarding nuisance by garbage tractor/truck in our area,"Ward 127, Kodambakkam",Solid Waste M... (227 chars) | (absent) |
| $.line[23] | Needs your attention,INC-20261018-AA72D5,Absenteeism of Sweepers: the problem near Post Office has continued for over a week,"Ward 132, Koda... (249 chars) | (absent) |
| $.line[24] | Needs your attention,INC-20261026-4A8649,Shifting of Garbage Bin: the problem opp. Kalyana Mandapam has continued for the past 10 days,"Ward... (253 chars) | (absent) |

...and 17 more paths (see the JSON file).

### collector GET /api/collector/assistant/export?period=monthly&dept=CMWSSB

Session reads, id cf76e847d80c383f, 650 bytes to 198 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="district-iq-monthly-cmwssb.csv" to null

| Path | A | B |
|---|---|---|
| $.lines | 3 | 1 |
| $.line[1] | ﻿list,id,what,where,department,severity,why,reported,past_deadline,complaints | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download the assistant's incident list as a... (198 chars) |
| $.line[2] | Needs your attention,INC-20261031-90C4D5,"Nesapakkam residents complain of worms in metro water, seek action","Ward 137, Kodambakkam",Chenna... (286 chars) | (absent) |
| $.line[3] | Needs your attention,INC-20261031-345A17,"India, ADB sign $230 million loan to modernise Chennai water supply, sanitation",Chennai,Chennai M... (283 chars) | (absent) |

### collector GET /api/collector/assistant/export?zone=5

Session reads, id 79e622ed7caa22c2, 1750 bytes to 198 bytes.
- status: 200 to 428
- type: text/csv to application/json
- disposition: attachment; filename="district-iq-daily-zone5.csv" to null

| Path | A | B |
|---|---|---|
| $.lines | 6 | 1 |
| $.line[1] | ﻿list,id,what,where,department,severity,why,reported,past_deadline,complaints | {"error":"Confirm it's you first.","confirm":{"action":"export","title":"Export data","summary":"Download the assistant's incident list as a... (198 chars) |
| $.line[2] | Needs your attention,INC-20261105-6B3555,Cooum River - Chetpet stretch spilling over bank at Chetpet (MGR St),"Ward 61, Royapuram",PWD Water... (332 chars) | (absent) |
| $.line[3] | Needs your attention,INC-20261105-61CDCB,chetpt lake full capacity reach aayiduhu chetpet,"Ward 58, Royapuram",PWD Water Resources,Severe,St... (312 chars) | (absent) |
| $.line[4] | Needs your attention,INC-20261106-E236AA,Bajanai Koil Main Road வீடுகளுக்குள் மழைநீர் புகுந்துள்ளது,"Ward 49, Royapuram",Storm Water Drain,H... (266 chars) | (absent) |
| $.line[5] | Needs your attention,INC-20261105-4E19A1-1,"New Colony 2nd St, Pulianthope பகுதியில் இடுப்பளவு மழைநீர் தேங்கியுள்ளது","Ward 58, Royapuram",P... (286 chars) | (absent) |
| $.line[6] | Needs your attention,INC-20261106-16E828,Chennai \| Fire Accident \| Terrifying fire accident in Chennai apartment building,"Ward 61, Royapura... (328 chars) | (absent) |

### collector POST /api/collector/assistant/chat

Session reads, id b0faa45ee14d22fa, 2217 bytes to 1559 bytes.

| Path | A | B |
|---|---|---|
| $.length | 5 | 3 |
| $[1].event | status | answer |
| $[1].data.stage | fetching | (absent) |
| $[1].data.id | (absent) | <uuid-2> |
| $[1].data.kind | (absent) | refusal |
| $[1].data.language | (absent) | en |
| $[1].data.display | (absent) | text |
| $[1].data.headline | (absent) | I can only read the data; I can't change or delete records. Decisions are made on the console itself. |
| $[1].data.answerMarkdown | (absent) | I answer from the Chennai district data on this console: incidents and complaints by zone, ward, taluk and department; lakes, rain, air qual... (215 chars) |
| $[1].data.voiceSummary | (absent) | I can only read the data; I can't change or delete records. Decisions are made on the console itself. I can only help with Chennai district ... (145 chars) |
| $[1].data.voiceLang | (absent) | en-IN |
| $[1].data.chart | (absent) | null |
| $[1].data.datasets | (absent) | [array of 0] |
| $[1].data.kpis | (absent) | [array of 0] |
| $[1].data.table | (absent) | null |
| $[1].data.followUps | (absent) | [array of 0] |
| $[1].data.chips | (absent) | [array of 3] |
| $[1].data.consoleActions | (absent) | [array of 0] |
| $[1].data.autoActions | (absent) | [array of 0] |
| $[1].data.caveats | (absent) | [array of 0] |
| $[1].data.scope | (absent) | null |
| $[1].data.scopeLine | (absent) |  |
| $[1].data.asOf | (absent) | 2026-11-06 18:08:00 |
| $[1].data.testData | (absent) | false |
| $[1].data.sources | (absent) | {object with 10 keys} |

...and 10 more paths (see the JSON file).

### officerA POST /api/collector/assistant/chat

Session reads, id b318df67c4885144, 2194 bytes to 1559 bytes.

| Path | A | B |
|---|---|---|
| $.length | 5 | 3 |
| $[1].event | status | answer |
| $[1].data.stage | fetching | (absent) |
| $[1].data.id | (absent) | <uuid-2> |
| $[1].data.kind | (absent) | refusal |
| $[1].data.language | (absent) | en |
| $[1].data.display | (absent) | text |
| $[1].data.headline | (absent) | I can only read the data; I can't change or delete records. Decisions are made on the console itself. |
| $[1].data.answerMarkdown | (absent) | I answer from the Chennai district data on this console: incidents and complaints by zone, ward, taluk and department; lakes, rain, air qual... (215 chars) |
| $[1].data.voiceSummary | (absent) | I can only read the data; I can't change or delete records. Decisions are made on the console itself. I can only help with Chennai district ... (145 chars) |
| $[1].data.voiceLang | (absent) | en-IN |
| $[1].data.chart | (absent) | null |
| $[1].data.datasets | (absent) | [array of 0] |
| $[1].data.kpis | (absent) | [array of 0] |
| $[1].data.table | (absent) | null |
| $[1].data.followUps | (absent) | [array of 0] |
| $[1].data.chips | (absent) | [array of 3] |
| $[1].data.consoleActions | (absent) | [array of 0] |
| $[1].data.autoActions | (absent) | [array of 0] |
| $[1].data.caveats | (absent) | [array of 0] |
| $[1].data.scope | (absent) | null |
| $[1].data.scopeLine | (absent) |  |
| $[1].data.asOf | (absent) | 2026-11-06 18:08:00 |
| $[1].data.testData | (absent) | false |
| $[1].data.sources | (absent) | {object with 10 keys} |

...and 10 more paths (see the JSON file).

### collector GET /api/collector/audit

Session reads, id 177239dc8a77b194, 67605 bytes to 70856 bytes.

| Path | A | B |
|---|---|---|
| $.log[0].id | 1000000089 | 1000000071 |
| $.log[1].id | 1000000088 | 1000000070 |
| $.log[2].id | 1000000087 | 1000000069 |
| $.log[3].id | 1000000086 | 1000000068 |
| $.log[4].id | 1000000085 | 1000000067 |
| $.log[5].id | 1000000084 | 1000000066 |
| $.log[6].id | 1000000083 | 1000000065 |
| $.log[7].id | 1000000082 | 1000000064 |
| $.log[8].id | 1000000081 | 1000000063 |
| $.log[9].id | 1000000080 | 1000000062 |
| $.log[10].id | 1000000079 | 1000000061 |
| $.log[11].id | 1000000078 | 1000000060 |
| $.log[12].id | 1000000077 | 1000000059 |
| $.log[13].id | 1000000076 | 1000000058 |
| $.log[14].id | 1000000075 | 1000000057 |
| $.log[15].id | 1000000074 | 1000000056 |
| $.log[16].id | 1000000073 | 1000000055 |
| $.log[17].id | 1000000072 | 1000000054 |
| $.log[18].id | 1000000071 | 1000000053 |
| $.log[19].id | 1000000070 | 1000000052 |
| $.log[20].id | 1000000069 | 1000000051 |
| $.log[21].id | 1000000068 | 1000000050 |
| $.log[22].id | 1000000067 | 1000000049 |
| $.log[23].id | 1000000066 | 1000000048 |
| $.log[24].id | 1000000065 | 1000000047 |

...and 818 more paths (see the JSON file).

### collector POST /api/collector/thunai/plan

Session ask, id f142931994ad2501, 56 bytes to 220 bytes.

| Path | A | B |
|---|---|---|
| $.plan.kind | none | refuse |
| $.plan.reply | (absent) | I can't share a citizen's name, phone number, Aadhaar or their own words. I can show the case, its place, its department and how long it has... (151 chars) |

### collector POST /api/collector/thunai/plan

Session ask, id 5c33f2f3465945e3, 56 bytes to 153 bytes.

| Path | A | B |
|---|---|---|
| $.plan.kind | none | refuse |
| $.plan.reply | (absent) | I never send, approve or delete. I can draft it for your tray, and the tap is yours. |

### collector POST /api/collector/thunai/plan

Session ask, id da0a51ec9d345bdb, 56 bytes to 509 bytes.

| Path | A | B |
|---|---|---|
| $.plan.kind | none | refuse |
| $.plan.reply | (absent) | குடிமக்களின் பெயர், தொலைபேசி எண், ஆதார் அல்லது அவர்கள் சொன்ன வார்த்தைகளை என்னால் தர முடியாது. சம்பவம், இடம், துறை, எவ்வளவு காலமாகத் திறந்துள... (164 chars) |

### collector GET /api/collector/workspaces/1000000002

Session writes, id 63e8758c86919173, 32 bytes to 191 bytes.
- status: 404 to 200

| Path | A | B |
|---|---|---|
| $.error | Workspace not found. | (absent) |
| $.id | (absent) | 1000000002 |
| $.name | (absent) | Golden workspace |
| $.version | (absent) | 1 |
| $.is_current | (absent) | 1 |
| $.layout | (absent) | {object with 1 keys} |
| $.filters | (absent) | {object with 2 keys} |
| $.created_at | (absent) | 2026-11-06 12:00:00 |
| $.briefing | (absent) | null |

### collector GET /api/collector/audit

Session writes, id 2990d3c3756b54b5, 63222 bytes to 63442 bytes.

| Path | A | B |
|---|---|---|
| $.log.length | 192 | 193 |
| $.log[0].id | 1000000029 | 1000000030 |
| $.log[1].id | 1000000028 | 1000000029 |
| $.log[2].id | 1000000027 | 1000000028 |
| $.log[3].id | 1000000026 | 1000000027 |
| $.log[4].id | 1000000025 | 1000000026 |
| $.log[5].id | 1000000024 | 1000000025 |
| $.log[6].id | 1000000023 | 1000000024 |
| $.log[7].id | 1000000022 | 1000000023 |
| $.log[7].action | workspace:save | workspace:open |
| $.log[7].after_value | {"name":"Golden workspace","version":1,"filters":{"period":"weekly"}} | {"name":"Golden workspace","version":1} |
| $.log[8].id | 1000000021 | 1000000022 |
| $.log[8].action | assistant:save_briefing | workspace:save |
| $.log[8].record_id | Briefing 2026-11-06 (weekly) | 1000000002 |
| $.log[8].after_value | {"period":"weekly"} | {"name":"Golden workspace","version":1,"filters":{"period":"weekly"}} |
| $.log[9].id | 1000000020 | 1000000021 |
| $.log[9].action | workspace:save | assistant:save_briefing |
| $.log[9].record_id | 1000000001 | Briefing 2026-11-06 (weekly) |
| $.log[9].after_value | {"name":"Briefing 2026-11-06 (weekly)","version":1,"filters":{"period":"weekly"}} | {"period":"weekly"} |
| $.log[10].id | 1000000019 | 1000000020 |
| $.log[10].actor | (masked, 27 chars) | (masked, 25 chars) |
| $.log[10].action | confirm:ok | workspace:save |
| $.log[10].table_name | security | workspaces |
| $.log[10].record_id | 1000000002 | 1000000001 |
| $.log[10].after_value | {"action":"officer_report","summary":"Send case INC-20261106-31532C to the Collector for verification","factor":"password","ip":"direct"} | {"name":"Briefing 2026-11-06 (weekly)","version":1,"filters":{"period":"weekly"}} |

...and 701 more paths (see the JSON file).

