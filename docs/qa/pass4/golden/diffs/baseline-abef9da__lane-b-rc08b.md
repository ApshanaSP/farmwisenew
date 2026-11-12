# Golden-master diff: baseline-abef9da to lane-b-rc08b

Compared 3272 requests with 3272. **16 changed, 0 added, 0 removed.**

## What differs around the requests

- next_build_id: uoCyfOgnc3qJwf1N3gZ7P to h4RGVyekAFQC94NXXBiN6

## By route

| Route | Requests changed | Roles | Status changes | Most changed paths |
|---|---|---|---|---|
| /api/collector/thunai/agent/round | 14 | collector | none | $.result.stage.blocks[*].points[*].id (76), $.result.stage.blocks[*].points[*].lat (76), $.result.stage.blocks[*].points[*].lon (76), $.result.stage.blocks[*].points[*].label (76), $.result.stage.blocks[*].points[*].sev (60) |
| /api/collector/thunai/agent | 2 | collector | none | $.result.stage.blocks[*].rows[*].id (12), $.result.stage.blocks[*].rows[*].title (12), $.result.stage.blocks[*].rows[*].sev (12), $.result.stage.blocks[*].rows[*].place (12), $.result.stage.blocks[*].rows[*].ward (12) |

## Each changed request

### collector POST /api/collector/thunai/agent

Session reads, id b709a6b7afee2afd, 10663 bytes to 11797 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway | null | {object with 2 keys} |
| $.result.stage.say.en | 114 cases this week; here are the 12 that matter most. The most urgent: uncleared garbage at Thangavel Pillai Thottam 3Rd Street, Thangavel ... (263 chars) | 122 cases this week; here are the 12 that matter most. 35 are past their deadline and need you first: uncleared garbage at Durgadevi Nagar 5... (339 chars) |
| $.result.stage.say.ta | இந்த வாரம் 114 சம்பவங்கள். மிக அவசரமானது: uncleared garbage at Thangavel Pillai Thottam 3Rd Street, Thangavel Pillai Thottam, Korukkupet in ... (230 chars) | இந்த வாரம் 122 சம்பவங்கள். 35 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Durgadevi Nagar 5Th Cross St 2Nd Lane, Du... (317 chars) |
| $.result.stage.blocks[0].items.length | 3 | 2 |
| $.result.stage.blocks[0].items[0].value | 114 | 122 |
| $.result.stage.blocks[0].items[1].value | 0 | 35 |

...and 225 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent

Session reads, id ea25e31de4431e9c, 12225 bytes to 11951 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 12 of the 12 shown are past their deadline. | 39 of the 52 are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 12-இல் 12 காலக்கெடுவைத் தாண்டியவை. | 52-இல் 39 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 52 severe cases this week; here are the 12 that matter most. 12 are past their deadline and need you first: standing water at Pulianthope (B... (319 chars) | 52 severe cases this week; here are the 12 that matter most. 39 are past their deadline and need you first: standing water at Pulianthope (B... (281 chars) |
| $.result.stage.say.ta | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 12 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Pulianthope (Buckingham Canal - Basi... (290 chars) | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 39 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Pulianthope (Buckingham Canal - Basi... (261 chars) |
| $.result.stage.blocks[0].items.length | 3 | 2 |
| $.result.stage.blocks[0].items[1].value | 12 | 39 |

...and 4 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round

Session ask, id bc94a14cdfe5ac48, 7383 bytes to 7359 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 5 of the 5 shown are past their deadline. | 5 of the 5 are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 5-இல் 5 காலக்கெடுவைத் தாண்டியவை. | 5-இல் 5 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 5 cases this week. 5 are past their deadline and need you first: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Lloyds Road), ... (298 chars) | 5 cases this week. 5 are past their deadline and need you first: uncleared garbage at Rasha Hydhar Street, Anna Salai, Chepauk in Teynampet,... (309 chars) |
| $.result.stage.say.ta | இந்த வாரம் 5 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Lloy... (301 chars) | இந்த வாரம் 5 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rasha Hydhar Street, Anna Salai, Chepauk in ... (312 chars) |
| $.result.stage.blocks[1].rows | (same items) | (in another order) |
| $.result.stage.blocks[2].points[0].id | INC-20261102-132638 | INC-20261103-22C9F8 |

...and 27 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round

Session ask, id ac136777a4aee429, 11213 bytes to 12145 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway | null | {object with 2 keys} |
| $.result.stage.say.en | 23 cases today; here are the 12 that matter most. The most urgent: an encroachment or unauthorised construction at Vallalar Extn Extension i... (224 chars) | 24 cases today; here are the 12 that matter most. One is past its deadline and needs you first: standing water at Saidapet (Adyar River - Sa... (197 chars) |
| $.result.stage.say.ta | இன்று 23 சம்பவங்கள். மிக அவசரமானது: an encroachment or unauthorised construction at Vallalar Extn Extension in Adyar. Storm Water Drain வசம்... (190 chars) | இன்று 24 சம்பவங்கள். 1 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Saidapet (Adyar River - Saidapet stretch). "படி" அல... (178 chars) |
| $.result.stage.blocks[0].items.length | 3 | 2 |
| $.result.stage.blocks[0].items[0].value | 23 | 24 |
| $.result.stage.blocks[0].items[1].value | 0 | 1 |

...and 234 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round

Session ask, id f1e6ac2ad90ac282, 12498 bytes to 12224 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 12 of the 12 shown are past their deadline. | 39 of the 52 are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 12-இல் 12 காலக்கெடுவைத் தாண்டியவை. | 52-இல் 39 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 52 severe cases this week; here are the 12 that matter most. 12 are past their deadline and need you first: standing water at Pulianthope (B... (319 chars) | 52 severe cases this week; here are the 12 that matter most. 39 are past their deadline and need you first: standing water at Pulianthope (B... (281 chars) |
| $.result.stage.say.ta | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 12 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Pulianthope (Buckingham Canal - Basi... (290 chars) | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 39 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Pulianthope (Buckingham Canal - Basi... (261 chars) |
| $.result.stage.blocks[0].items.length | 3 | 2 |
| $.result.stage.blocks[0].items[1].value | 12 | 39 |

...and 4 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round

Session ask, id 484c3e63acc4f70c, 11166 bytes to 11103 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 7 of the 10 shown are past their deadline. | 5 of the 11 are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 10-இல் 7 காலக்கெடுவைத் தாண்டியவை. | 11-இல் 5 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 10 cases this week. 7 are past their deadline and need you first: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Lloyds Road),... (329 chars) | 11 cases this week; here are the 10 that matter most. 5 are past their deadline and need you first: uncleared garbage at Rasha Hydhar Street... (344 chars) |
| $.result.stage.say.ta | இந்த வாரம் 10 சம்பவங்கள். 7 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Llo... (332 chars) | இந்த வாரம் 11 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rasha Hydhar Street, Anna Salai, Chepauk in... (313 chars) |
| $.result.stage.blocks[0].items[0].value | 10 | 11 |
| $.result.stage.blocks[0].items[1].value | 7 | 5 |

...and 57 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round

Session ask, id 0401451bde1ac789, 5985 bytes to 5945 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 1 of the 2 shown is past its deadline. | 1 of the 2 is past its deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 2-இல் 1 காலக்கெடுவைத் தாண்டியவை. | 2-இல் 1 காலக்கெடுவைத் தாண்டியவை. |

### collector POST /api/collector/thunai/agent/round

Session ask, id fa394469d1d31521, 11480 bytes to 10927 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway | null | {object with 2 keys} |
| $.result.stage.say.en | 105 cases this week; here are the 12 that matter most. The most urgent: an encroachment or unauthorised construction at Vallalar Extn Extens... (229 chars) | 112 cases this week; here are the 12 that matter most. 26 are past their deadline and need you first: standing water at Saidapet (Adyar Rive... (248 chars) |
| $.result.stage.say.ta | இந்த வாரம் 105 சம்பவங்கள். மிக அவசரமானது: an encroachment or unauthorised construction at Vallalar Extn Extension in Adyar. Storm Water Drai... (196 chars) | இந்த வாரம் 112 சம்பவங்கள். 26 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Saidapet (Adyar River - Saidapet stretch), s... (226 chars) |
| $.result.stage.blocks[0].items.length | 3 | 2 |
| $.result.stage.blocks[0].items[0].value | 105 | 112 |
| $.result.stage.blocks[0].items[1].value | 0 | 26 |

...and 254 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round

Session ask, id f09bcf697432c0ab, 10780 bytes to 10717 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 7 of the 10 shown are past their deadline. | 5 of the 11 are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 10-இல் 7 காலக்கெடுவைத் தாண்டியவை. | 11-இல் 5 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 10 cases this week. 7 are past their deadline and need you first: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Lloyds Road),... (329 chars) | 11 cases this week; here are the 10 that matter most. 5 are past their deadline and need you first: uncleared garbage at Rasha Hydhar Street... (344 chars) |
| $.result.stage.say.ta | இந்த வாரம் 10 சம்பவங்கள். 7 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Llo... (332 chars) | இந்த வாரம் 11 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rasha Hydhar Street, Anna Salai, Chepauk in... (313 chars) |
| $.result.stage.blocks[0].items[0].value | 10 | 11 |
| $.result.stage.blocks[0].items[1].value | 7 | 5 |

...and 57 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round

Session ask, id f025856d46a1ca5f, 6322 bytes to 6279 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 2 of the 3 shown are past their deadline. | 1 of the 3 is past its deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 3-இல் 2 காலக்கெடுவைத் தாண்டியவை. | 3-இல் 1 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 3 cases this week. 2 are past their deadline and need you first: a street light or electrical problem at Church Road, Padi, Mogappair in Amb... (333 chars) | 3 cases this week. One is past its deadline and needs you first: a street light or electrical problem at Church Road, Padi, Mogappair in Amb... (333 chars) |
| $.result.stage.say.ta | இந்த வாரம் 3 சம்பவங்கள். 2 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: a street light or electrical problem at Church Road, Padi, Mogapp... (336 chars) | இந்த வாரம் 3 சம்பவங்கள். 1 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: a street light or electrical problem at Church Road, Padi, Mogapp... (336 chars) |
| $.result.stage.blocks[0].items[1].value | 2 | 1 |
| $.result.say | இந்த வாரம் 3 சம்பவங்கள். 2 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: a street light or electrical problem at Church Road, Padi, Mogapp... (336 chars) | இந்த வாரம் 3 சம்பவங்கள். 1 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: a street light or electrical problem at Church Road, Padi, Mogapp... (336 chars) |

### collector POST /api/collector/thunai/agent/round

Session ask, id 9ef6d6c5b729a804, 5107 bytes to 5067 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 2 of the 2 shown are past their deadline. | 2 of the 2 are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 2-இல் 2 காலக்கெடுவைத் தாண்டியவை. | 2-இல் 2 காலக்கெடுவைத் தாண்டியவை. |

### collector POST /api/collector/thunai/agent/round (direct, sentence 2)

Session ask, id 374abbf925411872, 7335 bytes to 7311 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 5 of the 5 shown are past their deadline. | 5 of the 5 are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 5-இல் 5 காலக்கெடுவைத் தாண்டியவை. | 5-இல் 5 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 5 cases this week. 5 are past their deadline and need you first: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Lloyds Road), ... (298 chars) | 5 cases this week. 5 are past their deadline and need you first: uncleared garbage at Rasha Hydhar Street, Anna Salai, Chepauk in Teynampet,... (309 chars) |
| $.result.stage.say.ta | இந்த வாரம் 5 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Lloy... (301 chars) | இந்த வாரம் 5 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rasha Hydhar Street, Anna Salai, Chepauk in ... (312 chars) |
| $.result.stage.blocks[1].rows | (same items) | (in another order) |
| $.result.stage.blocks[2].points[0].id | INC-20261102-132638 | INC-20261103-22C9F8 |

...and 27 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round (direct, sentence 17)

Session ask, id ef7c2b826ce05b4d, 11129 bytes to 12061 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway | null | {object with 2 keys} |
| $.result.stage.say.en | 23 cases today; here are the 12 that matter most. The most urgent: an encroachment or unauthorised construction at Vallalar Extn Extension i... (224 chars) | 24 cases today; here are the 12 that matter most. One is past its deadline and needs you first: standing water at Saidapet (Adyar River - Sa... (197 chars) |
| $.result.stage.say.ta | இன்று 23 சம்பவங்கள். மிக அவசரமானது: an encroachment or unauthorised construction at Vallalar Extn Extension in Adyar. Storm Water Drain வசம்... (190 chars) | இன்று 24 சம்பவங்கள். 1 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Saidapet (Adyar River - Saidapet stretch). "படி" அல... (178 chars) |
| $.result.stage.blocks[0].items.length | 3 | 2 |
| $.result.stage.blocks[0].items[0].value | 23 | 24 |
| $.result.stage.blocks[0].items[1].value | 0 | 1 |

...and 234 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round (direct, sentence 18)

Session ask, id e2bf5af9ffe285e3, 12414 bytes to 12140 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 12 of the 12 shown are past their deadline. | 39 of the 52 are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 12-இல் 12 காலக்கெடுவைத் தாண்டியவை. | 52-இல் 39 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 52 severe cases this week; here are the 12 that matter most. 12 are past their deadline and need you first: standing water at Pulianthope (B... (319 chars) | 52 severe cases this week; here are the 12 that matter most. 39 are past their deadline and need you first: standing water at Pulianthope (B... (281 chars) |
| $.result.stage.say.ta | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 12 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Pulianthope (Buckingham Canal - Basi... (290 chars) | இந்த வாரம் 52 கடுமையான சம்பவங்கள். 39 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: standing water at Pulianthope (Buckingham Canal - Basi... (261 chars) |
| $.result.stage.blocks[0].items.length | 3 | 2 |
| $.result.stage.blocks[0].items[1].value | 12 | 39 |

...and 4 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round (direct, sentence 19)

Session ask, id 61ed15dc04e17ba5, 11082 bytes to 11019 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 7 of the 10 shown are past their deadline. | 5 of the 11 are past their deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 10-இல் 7 காலக்கெடுவைத் தாண்டியவை. | 11-இல் 5 காலக்கெடுவைத் தாண்டியவை. |
| $.result.stage.say.en | 10 cases this week. 7 are past their deadline and need you first: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Lloyds Road),... (329 chars) | 11 cases this week; here are the 10 that matter most. 5 are past their deadline and need you first: uncleared garbage at Rasha Hydhar Street... (344 chars) |
| $.result.stage.say.ta | இந்த வாரம் 10 சம்பவங்கள். 7 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rotary Nagar Ixth Street, Rotary Nagar (Llo... (332 chars) | இந்த வாரம் 11 சம்பவங்கள். 5 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: uncleared garbage at Rasha Hydhar Street, Anna Salai, Chepauk in... (313 chars) |
| $.result.stage.blocks[0].items[0].value | 10 | 11 |
| $.result.stage.blocks[0].items[1].value | 7 | 5 |

...and 57 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round (direct, sentence 20)

Session ask, id f0ed9bee243901b3, 5901 bytes to 5861 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 1 of the 2 shown is past its deadline. | 1 of the 2 is past its deadline. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 2-இல் 1 காலக்கெடுவைத் தாண்டியவை. | 2-இல் 1 காலக்கெடுவைத் தாண்டியவை. |

