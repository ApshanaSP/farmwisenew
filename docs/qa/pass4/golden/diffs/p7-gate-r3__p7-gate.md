# Golden-master diff: p7-gate-r3 to p7-gate

Compared 3273 requests with 3273. **23 changed, 10 added, 10 removed.**

## What differs around the requests

- next_build_id: CBdQM0A0VtrCiiuGe8KNC to SWKEUJgzHqBCQjD1NS_2D

## By route

| Route | Requests changed | Roles | Status changes | Most changed paths |
|---|---|---|---|---|
| /api/map/ask | 12 | collector, officerA, officerB | none | $.trace[*].ids[*] (867), $.rows[*] (65), $.rows[*].id (45), $.rows[*].title (45), $.rows[*].first (45) |
| /api/map/export | 4 | collector | none | $.line[*] (67), $.lines (2), $.properties.window (2) |
| /api/collector/studio/[id] | 3 | collector | none | $.confirm.scope (3) |
| /api/collector/overview | 2 | collector | none | $.severity.rows[*].lat (2), $.severity.rows[*].lon (2), $.map.pins[*].lat (1), $.map.pins[*].lon (1) |
| /api/collector/audit | 1 | collector | none | $.log[*].after_value (3) |
| /api/collector/search | 1 | collector | none | $.incidents[*].lat (1), $.incidents[*].lon (1) |

## Added requests

- collector POST /api/map/insight: 200
- officerA POST /api/map/insight: 200
- citizenA POST /api/map/insight: 401
- collector POST /api/map/export: 428
- collector POST /api/map/export: 200
- collector POST /api/map/export: 428
- collector POST /api/map/export: 200
- officerA POST /api/map/export: 428
- officerA POST /api/map/export: 200
- collector POST /api/map/send: 200

## Removed requests

- collector POST /api/map/insight: 200
- officerA POST /api/map/insight: 200
- citizenA POST /api/map/insight: 401
- collector POST /api/map/export: 428
- collector POST /api/map/export: 200
- collector POST /api/map/export: 428
- collector POST /api/map/export: 200
- officerA POST /api/map/export: 428
- officerA POST /api/map/export: 200
- collector POST /api/map/send: 200

## Each changed request

### collector POST /api/map/ask

Session ask, id bc19a69485d976bf, 24167 bytes to 20811 bytes.

| Path | A | B |
|---|---|---|
| $.plan.steps[0].filter.period.kind | last_days | day |
| $.plan.steps[0].filter.period.days | 1 | (absent) |
| $.chips[2].en | Last 24 hours | Today, since midnight |
| $.chips[2].ta | கடந்த 24 மணி நேரம் | இன்று, நள்ளிரவு முதல் |
| $.chips[2].options[0].on | true | false |
| $.answer.count | 13 | 11 |
| $.answer.headline | 13 open complaints in Adyar (Zone 13) (last 24 hours) · map layer ready. | 11 open complaints in Adyar (Zone 13) (today, since midnight) · map layer ready. |
| $.answer.depts[2].code | GCC-HLT | GCC-ENG |
| $.answer.depts[2].name | Public Health (GCC) | Roads & Building Permissions |
| $.answer.depts[2].n | 3 | 1 |
| $.answer.depts[3].code | GCC-ENG | GCC-HLT |
| $.answer.depts[3].name | Roads & Building Permissions | Public Health (GCC) |
| $.answer.facts[0].value | 13 | 11 |
| $.trace[0].count | 143 | 93 |
| $.trace[0].note_en | Took open citizen complaints, last 24 hours (143). | Took open citizen complaints, today, since midnight (93). |
| $.trace[0].note_ta | திறந்த குடிமக்கள் புகார்கள், கடந்த 24 மணி நேரம் எடுக்கப்பட்டன (143). | திறந்த குடிமக்கள் புகார்கள், இன்று, நள்ளிரவு முதல் எடுக்கப்பட்டன (93). |
| $.trace[0].ids.length | 143 | 93 |
| $.trace[0].ids[4] | INC-20261105-45E2DD | INC-20261106-8D7031 |
| $.trace[0].ids[5] | INC-20261106-8D7031 | INC-20261106-EB2509 |
| $.trace[0].ids[6] | INC-20261105-4B16C2 | INC-20261106-FE8066 |
| $.trace[0].ids[7] | INC-20261106-EB2509 | INC-20261106-AD9834 |
| $.trace[0].ids[8] | INC-20261106-FE8066 | INC-20261106-F1B5D5 |
| $.trace[0].ids[9] | INC-20261105-6C5FD7 | INC-20261106-FD167D |
| $.trace[0].ids[10] | INC-20261106-AD9834 | INC-20261106-7CC00D |
| $.trace[0].ids[11] | INC-20261106-F1B5D5 | INC-20261106-9CA57F |

...and 376 more paths (see the JSON file).

### collector POST /api/map/ask

Session ask, id 39b775090318e8e0, 219861 bytes to 219847 bytes.

| Path | A | B |
|---|---|---|
| $.trace[1].note_en | Not used from your question: deaths, hours. The map answered the rest; rephrase to include them. | Not used from your question: deaths. The map answered the rest; rephrase to include them. |
| $.trace[1].note_ta | கேள்வியில் பயன்படுத்தப்படாதவை: deaths, hours. மீதியைக் கொண்டு பதில் தரப்பட்டது. | கேள்வியில் பயன்படுத்தப்படாதவை: deaths. மீதியைக் கொண்டு பதில் தரப்பட்டது. |

### collector POST /api/map/ask

Session ask, id 1e635e562e92da34, 24840 bytes to 21413 bytes.

| Path | A | B |
|---|---|---|
| $.plan.steps[0].filter.period.kind | last_days | day |
| $.plan.steps[0].filter.period.days | 1 | (absent) |
| $.chips[2].en | Last 24 hours | Today, since midnight |
| $.chips[2].ta | கடந்த 24 மணி நேரம் | இன்று, நள்ளிரவு முதல் |
| $.chips[2].options[0].on | true | false |
| $.answer.count | 13 | 11 |
| $.answer.headline | Adyar (மண்டலம் 13) 13 திறந்த புகார்கள் (கடந்த 24 மணி நேரம்) · வரைபட அடுக்கு தயார். | Adyar (மண்டலம் 13) 11 திறந்த புகார்கள் (இன்று, நள்ளிரவு முதல்) · வரைபட அடுக்கு தயார். |
| $.answer.depts[2].code | GCC-HLT | GCC-ENG |
| $.answer.depts[2].name | Public Health (GCC) | Roads & Building Permissions |
| $.answer.depts[2].n | 3 | 1 |
| $.answer.depts[3].code | GCC-ENG | GCC-HLT |
| $.answer.depts[3].name | Roads & Building Permissions | Public Health (GCC) |
| $.answer.facts[0].value | 13 | 11 |
| $.trace[0].count | 143 | 93 |
| $.trace[0].note_en | Took open citizen complaints, last 24 hours (143). | Took open citizen complaints, today, since midnight (93). |
| $.trace[0].note_ta | திறந்த குடிமக்கள் புகார்கள், கடந்த 24 மணி நேரம் எடுக்கப்பட்டன (143). | திறந்த குடிமக்கள் புகார்கள், இன்று, நள்ளிரவு முதல் எடுக்கப்பட்டன (93). |
| $.trace[0].ids.length | 143 | 93 |
| $.trace[0].ids[4] | INC-20261105-45E2DD | INC-20261106-8D7031 |
| $.trace[0].ids[5] | INC-20261106-8D7031 | INC-20261106-EB2509 |
| $.trace[0].ids[6] | INC-20261105-4B16C2 | INC-20261106-FE8066 |
| $.trace[0].ids[7] | INC-20261106-EB2509 | INC-20261106-AD9834 |
| $.trace[0].ids[8] | INC-20261106-FE8066 | INC-20261106-F1B5D5 |
| $.trace[0].ids[9] | INC-20261105-6C5FD7 | INC-20261106-FD167D |
| $.trace[0].ids[10] | INC-20261106-AD9834 | INC-20261106-7CC00D |
| $.trace[0].ids[11] | INC-20261106-F1B5D5 | INC-20261106-9CA57F |

...and 380 more paths (see the JSON file).

### collector POST /api/map/ask

Session ask, id f0398307a4621bf6, 63629 bytes to 63595 bytes.

| Path | A | B |
|---|---|---|
| $.trace[1].note_en | Not used from your question: வாரம், எந்த, மண்டலத்தில், சம்பவங்கள், அதிகம். The map answered the rest; rephrase to include them. | Not used from your question: எந்த, மண்டலத்தில், சம்பவங்கள், அதிகம். The map answered the rest; rephrase to include them. |
| $.trace[1].note_ta | கேள்வியில் பயன்படுத்தப்படாதவை: வாரம், எந்த, மண்டலத்தில், சம்பவங்கள், அதிகம். மீதியைக் கொண்டு பதில் தரப்பட்டது. | கேள்வியில் பயன்படுத்தப்படாதவை: எந்த, மண்டலத்தில், சம்பவங்கள், அதிகம். மீதியைக் கொண்டு பதில் தரப்பட்டது. |

### collector POST /api/map/ask

Session ask, id d2294a1c2f5a1476, 63127 bytes to 63113 bytes.

| Path | A | B |
|---|---|---|
| $.trace[1].note_en | Not used from your question: indha, entha, jaasthi. The map answered the rest; rephrase to include them. | Not used from your question: entha, jaasthi. The map answered the rest; rephrase to include them. |
| $.trace[1].note_ta | கேள்வியில் பயன்படுத்தப்படாதவை: indha, entha, jaasthi. மீதியைக் கொண்டு பதில் தரப்பட்டது. | கேள்வியில் பயன்படுத்தப்படாதவை: entha, jaasthi. மீதியைக் கொண்டு பதில் தரப்பட்டது. |

### collector POST /api/map/ask

Session ask, id 8776cda3e9c5a398, 568173 bytes to 219906 bytes.

| Path | A | B |
|---|---|---|
| $.plan.steps[0].filter.period.days | 7 | 1 |
| $.chips[2].en | Last 7 days | Last 24 hours |
| $.chips[2].ta | கடந்த 7 நாட்கள் | கடந்த 24 மணி நேரம் |
| $.chips[2].isDefault | true | false |
| $.chips[2].options[0].on | false | true |
| $.chips[2].options[1].on | true | false |
| $.answer.count | 1167 | 236 |
| $.answer.headline | 1,167 open incidents irukku (last 7 days) · map layer ready. | 236 open incidents irukku (last 24 hours) · map layer ready. |
| $.answer.meaning | Neraya Royapuram (135), Tondiarpet (110) zone-la; Greater Chennai Police kitta 405. | Neraya Tondiarpet (33), Teynampet (28) zone-la; Greater Chennai Police kitta 61. |
| $.answer.depts.length | 22 | 13 |
| $.answer.depts[0].n | 405 | 61 |
| $.answer.depts[1].n | 174 | 50 |
| $.answer.depts[2].n | 105 | 26 |
| $.answer.depts[3].code | GCC-ENG | GCC-ELE |
| $.answer.depts[3].name | Roads & Building Permissions | Street Lighting & Electrical |
| $.answer.depts[3].n | 100 | 23 |
| $.answer.depts[4].code | GCC-ELE | GCC-ENG |
| $.answer.depts[4].name | Street Lighting & Electrical | Roads & Building Permissions |
| $.answer.depts[4].n | 84 | 18 |
| $.answer.depts[5].code | GCC-HLT | GCC-SWM |
| $.answer.depts[5].name | Public Health (GCC) | Solid Waste Management |
| $.answer.depts[5].n | 80 | 18 |
| $.answer.depts[6].code | GCC-SWM | GCC-HLT |
| $.answer.depts[6].name | Solid Waste Management | Public Health (GCC) |
| $.answer.depts[6].n | 67 | 17 |

...and 10729 more paths (see the JSON file).

### officerA POST /api/map/ask

Session ask, id dece30afa8390c28, 6820 bytes to 6768 bytes.

| Path | A | B |
|---|---|---|
| $.plan.steps[0].filter.period.kind | last_days | day |
| $.plan.steps[0].filter.period.days | 1 | (absent) |
| $.chips[2].en | Last 24 hours | Today, since midnight |
| $.chips[2].ta | கடந்த 24 மணி நேரம் | இன்று, நள்ளிரவு முதல் |
| $.chips[2].options[0].on | true | false |
| $.answer.headline | 1 open complaint in Adyar (Zone 13) (last 24 hours) · map layer ready. | 1 open complaint in Adyar (Zone 13) (today, since midnight) · map layer ready. |
| $.trace[0].count | 18 | 14 |
| $.trace[0].note_en | Took open citizen complaints, Solid Waste Management only, last 24 hours (18). | Took open citizen complaints, Solid Waste Management only, today, since midnight (14). |
| $.trace[0].note_ta | திறந்த குடிமக்கள் புகார்கள், Solid Waste Management மட்டும், கடந்த 24 மணி நேரம் எடுக்கப்பட்டன (18). | திறந்த குடிமக்கள் புகார்கள், Solid Waste Management மட்டும், இன்று, நள்ளிரவு முதல் எடுக்கப்பட்டன (14). |
| $.trace[0].ids.length | 18 | 14 |
| $.trace[0].ids[3] | INC-20261105-063807 | INC-20261106-0B725B |
| $.trace[0].ids[4] | INC-20261106-0B725B | INC-20261106-A1916E |
| $.trace[0].ids[5] | INC-20261106-A1916E | INC-20261106-707839 |
| $.trace[0].ids[6] | INC-20261106-707839 | INC-20261106-8134C4 |
| $.trace[0].ids[7] | INC-20261106-8134C4 | INC-20261106-896A64 |
| $.trace[0].ids[8] | INC-20261106-896A64 | INC-20261106-2BA8BF |
| $.trace[0].ids[9] | INC-20261106-2BA8BF | INC-20261106-7AB184 |
| $.trace[0].ids[10] | INC-20261106-7AB184 | INC-20261106-2AB4CB |
| $.trace[0].ids[11] | INC-20261105-4745E0 | INC-20261106-DF91D4 |
| $.trace[0].ids[12] | INC-20261106-2AB4CB | INC-20261106-2E1851 |
| $.trace[0].ids[13] | INC-20261106-DF91D4 | INC-20261106-0E2C3D |
| $.trace[0].ids[14] | INC-20261105-097D1B | (absent) |
| $.trace[0].ids[15] | INC-20261105-7F006B | (absent) |
| $.trace[0].ids[16] | INC-20261106-2E1851 | (absent) |
| $.trace[0].ids[17] | INC-20261106-0E2C3D | (absent) |

### officerA POST /api/map/ask

Session ask, id 8d5fa1baf7ab7cca, 24073 bytes to 24059 bytes.

| Path | A | B |
|---|---|---|
| $.trace[1].note_en | Not used from your question: deaths, hours. The map answered the rest; rephrase to include them. | Not used from your question: deaths. The map answered the rest; rephrase to include them. |
| $.trace[1].note_ta | கேள்வியில் பயன்படுத்தப்படாதவை: deaths, hours. மீதியைக் கொண்டு பதில் தரப்பட்டது. | கேள்வியில் பயன்படுத்தப்படாதவை: deaths. மீதியைக் கொண்டு பதில் தரப்பட்டது. |

### officerA POST /api/map/ask

Session ask, id 697554ff489e03de, 7457 bytes to 7335 bytes.

| Path | A | B |
|---|---|---|
| $.plan.steps[0].filter.period.kind | last_days | day |
| $.plan.steps[0].filter.period.days | 1 | (absent) |
| $.chips[2].en | Last 24 hours | Today, since midnight |
| $.chips[2].ta | கடந்த 24 மணி நேரம் | இன்று, நள்ளிரவு முதல் |
| $.chips[2].options[0].on | true | false |
| $.answer.headline | Adyar (மண்டலம் 13) 1 திறந்த புகார்கள் (கடந்த 24 மணி நேரம்) · வரைபட அடுக்கு தயார். | Adyar (மண்டலம் 13) 1 திறந்த புகார்கள் (இன்று, நள்ளிரவு முதல்) · வரைபட அடுக்கு தயார். |
| $.trace[0].count | 18 | 14 |
| $.trace[0].note_en | Took open citizen complaints, Solid Waste Management only, last 24 hours (18). | Took open citizen complaints, Solid Waste Management only, today, since midnight (14). |
| $.trace[0].note_ta | திறந்த குடிமக்கள் புகார்கள், Solid Waste Management மட்டும், கடந்த 24 மணி நேரம் எடுக்கப்பட்டன (18). | திறந்த குடிமக்கள் புகார்கள், Solid Waste Management மட்டும், இன்று, நள்ளிரவு முதல் எடுக்கப்பட்டன (14). |
| $.trace[0].ids.length | 18 | 14 |
| $.trace[0].ids[3] | INC-20261105-063807 | INC-20261106-0B725B |
| $.trace[0].ids[4] | INC-20261106-0B725B | INC-20261106-A1916E |
| $.trace[0].ids[5] | INC-20261106-A1916E | INC-20261106-707839 |
| $.trace[0].ids[6] | INC-20261106-707839 | INC-20261106-8134C4 |
| $.trace[0].ids[7] | INC-20261106-8134C4 | INC-20261106-896A64 |
| $.trace[0].ids[8] | INC-20261106-896A64 | INC-20261106-2BA8BF |
| $.trace[0].ids[9] | INC-20261106-2BA8BF | INC-20261106-7AB184 |
| $.trace[0].ids[10] | INC-20261106-7AB184 | INC-20261106-2AB4CB |
| $.trace[0].ids[11] | INC-20261105-4745E0 | INC-20261106-DF91D4 |
| $.trace[0].ids[12] | INC-20261106-2AB4CB | INC-20261106-2E1851 |
| $.trace[0].ids[13] | INC-20261106-DF91D4 | INC-20261106-0E2C3D |
| $.trace[0].ids[14] | INC-20261105-097D1B | (absent) |
| $.trace[0].ids[15] | INC-20261105-7F006B | (absent) |
| $.trace[0].ids[16] | INC-20261106-2E1851 | (absent) |
| $.trace[0].ids[17] | INC-20261106-0E2C3D | (absent) |

...and 4 more paths (see the JSON file).

### officerA POST /api/map/ask

Session ask, id cc6505c5c1a07af9, 6974 bytes to 6940 bytes.

| Path | A | B |
|---|---|---|
| $.trace[1].note_en | Not used from your question: வாரம், எந்த, மண்டலத்தில், சம்பவங்கள், அதிகம். The map answered the rest; rephrase to include them. | Not used from your question: எந்த, மண்டலத்தில், சம்பவங்கள், அதிகம். The map answered the rest; rephrase to include them. |
| $.trace[1].note_ta | கேள்வியில் பயன்படுத்தப்படாதவை: வாரம், எந்த, மண்டலத்தில், சம்பவங்கள், அதிகம். மீதியைக் கொண்டு பதில் தரப்பட்டது. | கேள்வியில் பயன்படுத்தப்படாதவை: எந்த, மண்டலத்தில், சம்பவங்கள், அதிகம். மீதியைக் கொண்டு பதில் தரப்பட்டது. |

### officerB POST /api/map/ask

Session ask, id e7da02bc74406071, 6729 bytes to 6715 bytes.

| Path | A | B |
|---|---|---|
| $.trace[1].note_en | Not used from your question: indha, entha, jaasthi. The map answered the rest; rephrase to include them. | Not used from your question: entha, jaasthi. The map answered the rest; rephrase to include them. |
| $.trace[1].note_ta | கேள்வியில் பயன்படுத்தப்படாதவை: indha, entha, jaasthi. மீதியைக் கொண்டு பதில் தரப்பட்டது. | கேள்வியில் பயன்படுத்தப்படாதவை: entha, jaasthi. மீதியைக் கொண்டு பதில் தரப்பட்டது. |

### officerB POST /api/map/ask

Session ask, id 8073f84112e61801, 95846 bytes to 30966 bytes.

| Path | A | B |
|---|---|---|
| $.plan.steps[0].filter.period.days | 7 | 1 |
| $.chips[2].en | Last 7 days | Last 24 hours |
| $.chips[2].ta | கடந்த 7 நாட்கள் | கடந்த 24 மணி நேரம் |
| $.chips[2].isDefault | true | false |
| $.chips[2].options[0].on | false | true |
| $.chips[2].options[1].on | true | false |
| $.answer.count | 84 | 23 |
| $.answer.headline | 84 open incidents irukku (last 7 days) · map layer ready. | 23 open incidents irukku (last 24 hours) · map layer ready. |
| $.answer.meaning | Neraya Royapuram (14), Tondiarpet (12) zone-la; Ellaam Street Lighting & Electrical kitta. | Neraya Tondiarpet (4), Royapuram (4) zone-la; Ellaam Street Lighting & Electrical kitta. |
| $.answer.depts[0].n | 84 | 23 |
| $.answer.facts[0].value | 84 | 23 |
| $.trace[0].count | 84 | 23 |
| $.trace[0].note_en | Took open incidents, Street Lighting & Electrical only, last 7 days (84). | Took open incidents, Street Lighting & Electrical only, last 24 hours (23). |
| $.trace[0].note_ta | திறந்த சம்பவங்கள், Street Lighting & Electrical மட்டும், கடந்த 7 நாட்கள் எடுக்கப்பட்டன (84). | திறந்த சம்பவங்கள், Street Lighting & Electrical மட்டும், கடந்த 24 மணி நேரம் எடுக்கப்பட்டன (23). |
| $.trace[0].ids.length | 84 | 23 |
| $.trace[0].ids[0] | INC-20261101-3200FD | INC-20261106-DDB161 |
| $.trace[0].ids[1] | INC-20260616-77B20A | INC-20261105-45E2DD |
| $.trace[0].ids[2] | INC-20261104-83D2C2 | INC-20261106-F1B5D5 |
| $.trace[0].ids[3] | INC-20261104-FDA42B | INC-20261106-9CA57F |
| $.trace[0].ids[4] | INC-20260712-9475F7 | INC-20261106-A90262 |
| $.trace[0].ids[5] | INC-20261106-DDB161 | INC-20261105-A114D1 |
| $.trace[0].ids[6] | INC-20261104-DE5CBD | INC-20261106-A67D6A |
| $.trace[0].ids[7] | INC-20261105-D65198 | INC-20261106-F27E38 |
| $.trace[0].ids[8] | INC-20261105-45E2DD | INC-20261106-204F2B |
| $.trace[0].ids[9] | INC-20261103-2EAF09 | INC-20261106-B715B6 |

...and 859 more paths (see the JSON file).

### collector POST /api/map/export (plan of sentence 1 with grant)

Session ask, id 42dc9571a98ffbb0, 13197 bytes to 13282 bytes.

| Path | A | B |
|---|---|---|
| $.lines | 60 | 61 |
| $.line[4] | # Plan: {"steps":[{"op":"take","as":"a","layer":"incidents","filter":{"category":null,"family":null,"severity":["Severe"],"status":"open","d... (285 chars) | # Window: last 7 days: reported after 2026-10-30 18:08:00 to 2026-11-06 18:08:00 IST |
| $.line[5] | id,title,category,severity,status,open,ward,zone,department,first_reported,place,nearest,nearest_m,lat,lon,location_known_to_m | # Plan: {"steps":[{"op":"take","as":"a","layer":"incidents","filter":{"category":null,"family":null,"severity":["Severe"],"status":"open","d... (285 chars) |
| $.line[6] | INC-20261105-0476D7,Families stranded by flooding at Kellys,Flooding & waterlogging,Severe,In progress,yes,104,Anna Nagar,PWD Water Resource... (256 chars) | id,title,category,severity,status,open,ward,zone,department,first_reported,place,nearest,nearest_m,lat,lon,location_known_to_m |
| $.line[7] | INC-20260515-B939EB,Ice House: uprooted tree blocks road,Flooding & waterlogging,Severe,In progress,yes,115,Teynampet,PWD Water Resources,20... (207 chars) | INC-20261105-0476D7,Families stranded by flooding at Kellys,Flooding & waterlogging,Severe,In progress,yes,104,Anna Nagar,PWD Water Resource... (256 chars) |
| $.line[8] | INC-20260516-4D00AC,Floodwater traps residents near Temple St,Flooding & waterlogging,Severe,In progress,yes,104,Anna Nagar,PWD Water Resour... (212 chars) | INC-20260515-B939EB,Ice House: uprooted tree blocks road,Flooding & waterlogging,Severe,In progress,yes,115,Teynampet,PWD Water Resources,20... (207 chars) |
| $.line[9] | INC-20261103-53934E-1,Canal overflowing near Gangai Nagar; water entering nearby streets including Poongodiammal Street,Flooding & waterlogg... (273 chars) | INC-20260516-4D00AC,Floodwater traps residents near Temple St,Flooding & waterlogging,Severe,In progress,yes,104,Anna Nagar,PWD Water Resour... (212 chars) |
| $.line[10] | INC-20261105-D0CC25,"Wall along Govt Kilpauk Medical College Hospital gave way near Main Rd, Kilpauk",Unsafe buildings & walls,Severe,In pro... (277 chars) | INC-20261103-53934E-1,Canal overflowing near Gangai Nagar; water entering nearby streets including Poongodiammal Street,Flooding & waterlogg... (273 chars) |
| $.line[11] | INC-20261105-BB4429,"Mogappair: Karpagam Ave fully flooded near OHT water tank, knee-deep",Flooding & waterlogging,Severe,In progress,yes,85... (226 chars) | INC-20261105-D0CC25,"Wall along Govt Kilpauk Medical College Hospital gave way near Main Rd, Kilpauk",Unsafe buildings & walls,Severe,In pro... (277 chars) |
| $.line[12] | INC-20261022-73B9C3,Seven Wells: inundation strands residents,Flooding & waterlogging,Severe,In progress,yes,56,Royapuram,PWD Water Resource... (214 chars) | INC-20261105-BB4429,"Mogappair: Karpagam Ave fully flooded near OHT water tank, knee-deep",Flooding & waterlogging,Severe,In progress,yes,85... (226 chars) |
| $.line[13] | INC-20261104-22A6D5,Patrol team: Overflow from the canal near bus stop - Chetpet residents alarmed,Flooding & waterlogging,Severe,In progres... (231 chars) | INC-20261022-73B9C3,Seven Wells: inundation strands residents,Flooding & waterlogging,Severe,In progress,yes,56,Royapuram,PWD Water Resource... (214 chars) |
| $.line[14] | INC-20261025-09E045,Floodwater traps residents near Periya Mettu Palayam 1st Road,Flooding & waterlogging,Severe,In progress,yes,10,Thiruvot... (237 chars) | INC-20261104-22A6D5,Patrol team: Overflow from the canal near bus stop - Chetpet residents alarmed,Flooding & waterlogging,Severe,In progres... (231 chars) |
| $.line[15] | INC-20261105-6D03C9,"Pls send pumpset to Bajanai Koil St, Pallikaranai",Flooding & waterlogging,Severe,In progress,yes,197,Sholinganallur,PW... (249 chars) | INC-20261025-09E045,Floodwater traps residents near Periya Mettu Palayam 1st Road,Flooding & waterlogging,Severe,In progress,yes,10,Thiruvot... (237 chars) |
| $.line[16] | INC-20260529-9C273D,"Field staff report water stagnation on Jeeva Nagar 17th St, Korukkupet; pumping needed",Flooding & waterlogging,Severe,... (262 chars) | INC-20261105-6D03C9,"Pls send pumpset to Bajanai Koil St, Pallikaranai",Flooding & waterlogging,Severe,In progress,yes,197,Sholinganallur,PW... (249 chars) |
| $.line[17] | INC-20261102-3B27A7,Canal overflowing near Ernavoor; water entering nearby streets including Manali Express Road,Flooding & waterlogging,Sev... (266 chars) | INC-20260529-9C273D,"Field staff report water stagnation on Jeeva Nagar 17th St, Korukkupet; pumping needed",Flooding & waterlogging,Severe,... (262 chars) |
| $.line[18] | INC-20261104-5B3F36,"T. Nagar மார்க்கெட் அருகில் முழங்கால் அளவு தண்ணீர், பள்ளி குழந்தைகள் செல்ல சிரமம்",Flooding & waterlogging,Severe,In pr... (268 chars) | INC-20261102-3B27A7,Canal overflowing near Ernavoor; water entering nearby streets including Manali Express Road,Flooding & waterlogging,Sev... (266 chars) |
| $.line[19] | INC-20261104-3F4AC4-1,"CR: mogappair Eri reached FTL, surplus course opp","Lakes, bunds & sluices",Severe,In progress,yes,85,Ambattur,PWD Wa... (224 chars) | INC-20261104-5B3F36,"T. Nagar மார்க்கெட் அருகில் முழங்கால் அளவு தண்ணீர், பள்ளி குழந்தைகள் செல்ல சிரமம்",Flooding & waterlogging,Severe,In pr... (268 chars) |
| $.line[20] | INC-20261105-5C94BB,"Call recd: canal water flowing into Srinivasa Nagar 6th St, Saidapet from Adyar River",Flooding & waterlogging,Severe,I... (271 chars) | INC-20261104-3F4AC4-1,"CR: mogappair Eri reached FTL, surplus course opp","Lakes, bunds & sluices",Severe,In progress,yes,85,Ambattur,PWD Wa... (224 chars) |
| $.line[21] | INC-20261105-6B3555,Cooum River - Chetpet stretch spilling over bank at Chetpet (MGR St),Flooding & waterlogging,Severe,In progress,yes,61,R... (253 chars) | INC-20261105-5C94BB,"Call recd: canal water flowing into Srinivasa Nagar 6th St, Saidapet from Adyar River",Flooding & waterlogging,Severe,I... (271 chars) |
| $.line[22] | INC-20261105-0E6577,"Cooum River full ah overflow aagudhu, Chetpet School St kulla thanni varudhu",Flooding & waterlogging,Severe,In progres... (263 chars) | INC-20261105-6B3555,Cooum River - Chetpet stretch spilling over bank at Chetpet (MGR St),Flooding & waterlogging,Severe,In progress,yes,61,R... (253 chars) |
| $.line[23] | INC-20261105-E9CD2E,Dengue Surge; Bed Capacity Critical at Rajiv Gandhi Government General Hospital,Vector- & water-borne disease,Severe,Ope... (261 chars) | INC-20261105-0E6577,"Cooum River full ah overflow aagudhu, Chetpet School St kulla thanni varudhu",Flooding & waterlogging,Severe,In progres... (263 chars) |
| $.line[24] | INC-20261022-D1B3AB,Tree falls across road at Royapettah,Flooding & waterlogging,Severe,In progress,yes,115,Teynampet,PWD Water Resources,20... (210 chars) | INC-20261105-E9CD2E,Dengue Surge; Bed Capacity Critical at Rajiv Gandhi Government General Hospital,Vector- & water-borne disease,Severe,Ope... (261 chars) |
| $.line[25] | INC-20261105-3FF6DA,Jafferkhanpet: portion of old structure gives way,Flooding & waterlogging,Severe,In progress,yes,138,Kodambakkam,Greater... (216 chars) | INC-20261022-D1B3AB,Tree falls across road at Royapettah,Flooding & waterlogging,Severe,In progress,yes,115,Teynampet,PWD Water Resources,20... (210 chars) |
| $.line[26] | INC-20261101-811851,Tree crashes near Pantheon Road,Flooding & waterlogging,Severe,In progress,yes,61,Royapuram,Greater Chennai Police,2026-... (186 chars) | INC-20261105-3FF6DA,Jafferkhanpet: portion of old structure gives way,Flooding & waterlogging,Severe,In progress,yes,138,Kodambakkam,Greater... (216 chars) |
| $.line[27] | INC-20261105-61CDCB,chetpt lake full capacity reach aayiduhu chetpet,"Lakes, bunds & sluices",Severe,In progress,yes,58,Royapuram,PWD Water ... (215 chars) | INC-20261101-811851,Tree crashes near Pantheon Road,Flooding & waterlogging,Severe,In progress,yes,61,Royapuram,Greater Chennai Police,2026-... (186 chars) |

...and 34 more paths (see the JSON file).

### collector POST /api/map/export (plan of sentence 1 with grant)

Session ask, id dfc10f23cddc06bb, 26749 bytes to 26835 bytes.

| Path | A | B |
|---|---|---|
| $.properties.window | (absent) | last 7 days: reported after 2026-10-30 18:08:00 to 2026-11-06 18:08:00 IST |

### collector POST /api/map/export (plan of sentence 2 with grant)

Session ask, id 1c8debebc8b14503, 2120 bytes to 2205 bytes.

| Path | A | B |
|---|---|---|
| $.lines | 11 | 12 |
| $.line[4] | # Plan: {"steps":[{"op":"take","as":"a","layer":"incidents","filter":{"category":["SOLID_WASTE"],"family":null,"severity":null,"status":"ope... (356 chars) | # Window: last 7 days: reported after 2026-10-30 18:08:00 to 2026-11-06 18:08:00 IST |
| $.line[5] | id,title,category,severity,status,open,ward,zone,department,first_reported,place,nearest,nearest_m,lat,lon,location_known_to_m | # Plan: {"steps":[{"op":"take","as":"a","layer":"incidents","filter":{"category":["SOLID_WASTE"],"family":null,"severity":null,"status":"ope... (356 chars) |
| $.line[6] | INC-20261102-8EC358,Garbage at the dumping ground is burning since last Monday,Garbage & solid waste,Medium,In progress,yes,125,Teynampet,So... (257 chars) | id,title,category,severity,status,open,ward,zone,department,first_reported,place,nearest,nearest_m,lat,lon,location_known_to_m |
| $.line[7] | INC-20261103-22C9F8,எங்கள் குடியிருப்போர் நலச் சங்கம் (47 குடும்பங்கள்) சார்பாக எழுதுகிறேன்,Garbage & solid waste,Medium,Under review,yes,11... (274 chars) | INC-20261102-8EC358,Garbage at the dumping ground is burning since last Monday,Garbage & solid waste,Medium,In progress,yes,125,Teynampet,So... (257 chars) |
| $.line[8] | INC-20261030-CB8991,Burning of Garbage: the problem near Pillaiyar Kovil has continued for the past 4 days,Garbage & solid waste,Medium,Assi... (293 chars) | INC-20261103-22C9F8,எங்கள் குடியிருப்போர் நலச் சங்கம் (47 குடும்பங்கள்) சார்பாக எழுதுகிறேன்,Garbage & solid waste,Medium,Under review,yes,11... (274 chars) |
| $.line[9] | INC-20261101-774B5E,Complaint about cleanliness in footpath opp. St. Mary's Church,Garbage & solid waste,Low,Assigned,yes,124,Teynampet,Road... (225 chars) | INC-20261030-CB8991,Burning of Garbage: the problem near Pillaiyar Kovil has continued for the past 4 days,Garbage & solid waste,Medium,Assi... (293 chars) |
| $.line[10] | INC-20261102-132638,Removal of Debris: the problem on Rotary Nagar Ixth Street has continued for two weeks now,Garbage & solid waste,Low,In ... (302 chars) | INC-20261101-774B5E,Complaint about cleanliness in footpath opp. St. Mary's Church,Garbage & solid waste,Low,Assigned,yes,124,Teynampet,Road... (225 chars) |
| $.line[11] |  | INC-20261102-132638,Removal of Debris: the problem on Rotary Nagar Ixth Street has continued for two weeks now,Garbage & solid waste,Low,In ... (302 chars) |
| $.line[12] | (absent) |  |

### collector POST /api/map/export (plan of sentence 2 with grant)

Session ask, id c0fbdcc5b3a3252d, 3358 bytes to 3444 bytes.

| Path | A | B |
|---|---|---|
| $.properties.window | (absent) | last 7 days: reported after 2026-10-30 18:08:00 to 2026-11-06 18:08:00 IST |

### collector GET /api/collector/audit

Session ask, id a39eb5710e1b812a, 70972 bytes to 70921 bytes.

| Path | A | B |
|---|---|---|
| $.log[21].after_value | {"format":"csv","rows":1,"plan":{"steps":[{"op":"take","as":"a","layer":"incidents","filter":{"category":null,"family":null,"severity":null,... (371 chars) | {"format":"csv","rows":1,"plan":{"steps":[{"op":"take","as":"a","layer":"incidents","filter":{"category":null,"family":null,"severity":null,... (356 chars) |
| $.log[31].after_value | {"format":"geojson","rows":13,"plan":{"steps":[{"op":"take","as":"a","layer":"incidents","filter":{"category":null,"family":null,"severity":... (376 chars) | {"format":"geojson","rows":11,"plan":{"steps":[{"op":"take","as":"a","layer":"incidents","filter":{"category":null,"family":null,"severity":... (361 chars) |
| $.log[33].after_value | {"format":"csv","rows":13,"plan":{"steps":[{"op":"take","as":"a","layer":"incidents","filter":{"category":null,"family":null,"severity":null... (372 chars) | {"format":"csv","rows":11,"plan":{"steps":[{"op":"take","as":"a","layer":"incidents","filter":{"category":null,"family":null,"severity":null... (357 chars) |

### collector GET /api/collector/search?q=<new-complaint-code-1>

Session writes, id cd47878c4defdb30, 1251 bytes to 1251 bytes.

| Path | A | B |
|---|---|---|
| $.incidents[0].lat | 13.01767549019608 | 13.01596568627451 |
| $.incidents[0].lon | 80.21344347058823 | 80.20999249019607 |

### collector GET /api/collector/overview

Session writes, id ea0ab3f25bc17c26, 235191 bytes to 235191 bytes.

| Path | A | B |
|---|---|---|
| $.severity.rows[32].lat | 13.01767549019608 | 13.01596568627451 |
| $.severity.rows[32].lon | 80.21344347058823 | 80.20999249019607 |

### collector GET /api/collector/overview?period=weekly&zone=13

Session writes, id 3f54c3ecc14de285, 139122 bytes to 139122 bytes.

| Path | A | B |
|---|---|---|
| $.map.pins[64].lat | 13.01767549019608 | 13.01596568627451 |
| $.map.pins[64].lon | 80.21344347058823 | 80.20999249019607 |
| $.severity.rows[27].lat | 13.01767549019608 | 13.01596568627451 |
| $.severity.rows[27].lon | 80.21344347058823 | 80.20999249019607 |

### collector GET /api/collector/studio/<dataset-1>?export=csv

Session writes, id d7a191781f17de43, 185 bytes to 185 bytes.

| Path | A | B |
|---|---|---|
| $.confirm.scope | Y29Uq0XVxqYNoPGJVW_-XvaSev_xkaMg | 1wfcCyqG0tRlWsR6QfUsSyN85y0zmynT |

### collector GET /api/collector/studio/<dataset-1>?export=xlsx

Session writes, id be094a0c735be649, 188 bytes to 188 bytes.

| Path | A | B |
|---|---|---|
| $.confirm.scope | X-Vhovlw_n8lu2XVlQIqlwBcrpCI91lA | 9HNmUU5dObht-lldN0rgspM-_0IgZ1xY |

### collector GET /api/collector/studio/<dataset-1>?f=[{"col"%3A"c0"%2C"op"%3A"neq"%2C"values"%3A["no such value"]}]&export=csv

Session writes, id a91af3219ee7b0a3, 185 bytes to 185 bytes.

| Path | A | B |
|---|---|---|
| $.confirm.scope | AeRzc1H2quqCdMD52ABXqL7MBEAPwo03 | B4hyM3nVSIdmHMBgb1M_LQqBxB9Phm2n |

