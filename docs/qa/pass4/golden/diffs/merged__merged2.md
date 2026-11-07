# Golden-master diff: merged to merged2

Compared 3272 requests with 3272. **124 changed, 0 added, 0 removed.**

## What differs around the requests

- next_build_id: So8m3taxH1GV7mmkDXSIV to RDuLQPpMZxt0M0HX9y8Dj

## By route

| Route | Requests changed | Roles | Status changes | Most changed paths |
|---|---|---|---|---|
| /api/officer/grievances | 112 | officerA, officerB | none | $.awaiting (112), $.awaitingNote (112) |
| /api/collector/thunai/agent/round | 6 | collector | none | $.result.stage.blocks[*].rows[*].overdue (7), $.result.stage.next[*].label.en (4), $.result.stage.next[*].label.ta (4), $.result.stage.next[*].ids[*] (4), $.result.stage.takeaway.en (2) |
| /api/collector/assistant/chat | 4 | collector, officerB | none | $[*].data.headline (4), $[*].data.answerMarkdown (4), $[*].data.voiceSummary (4), $[*].data.kpis[*].label (4) |
| /api/collector/thunai/agent | 1 | collector | none | $.result.stage.takeaway.en (1), $.result.stage.takeaway.ta (1) |
| /api/complaints | 1 | citizenA | none | $.queueNote (1) |

## Each changed request

### collector POST /api/collector/thunai/agent

Session reads, id ea25e31de4431e9c, 11951 bytes to 11928 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 54 of the 52 are past their deadline. | 54 are past their deadline. |
| $.result.stage.takeaway.ta | 52-இல் 54 காலக்கெடுவைத் தாண்டியவை. | 54 காலக்கெடுவைத் தாண்டியவை. |

### officerB POST /api/collector/assistant/chat

Session reads, id 804bfcdc2fda16e8, 2729 bytes to 2630 bytes.

| Path | A | B |
|---|---|---|
| $[3].data.headline | 102 street lights and electrical incidents · கடந்த 90 நாட்களில் | 102 street lights and electrical incidents நிலுவையில் · கடந்த 90 நாட்களில் |
| $[3].data.answerMarkdown | கடந்த 90 நாட்களில் for Street Lighting & Electrical பகுதியில் 102 street lights and electrical incidents பதிவாகியுள்ளன: 0 கடுமையானவை, 102 இன... (171 chars) | கடந்த 90 நாட்களில் for Street Lighting & Electrical பகுதியில் 102 street lights and electrical incidents இன்னும் நிலுவையில் உள்ளன, 1 உயிரிழப... (144 chars) |
| $[3].data.voiceSummary | கடந்த 90 நாட்களில் for Street Lighting & Electrical பகுதியில் 102 street lights and electrical incidents பதிவாகியுள்ளன: 0 கடுமையானவை, 102 இன... (171 chars) | கடந்த 90 நாட்களில் for Street Lighting & Electrical பகுதியில் 102 street lights and electrical incidents இன்னும் நிலுவையில் உள்ளன, 1 உயிரிழப... (144 chars) |
| $[3].data.kpis[0].label | Reported | Open |

### officerB POST /api/collector/assistant/chat

Session reads, id f302ff54235df88d, 2142 bytes to 2099 bytes.

| Path | A | B |
|---|---|---|
| $[3].data.headline | 102 incidents · kadandha 90 naal-la | 102 incidents open · kadandha 90 naal-la |
| $[3].data.answerMarkdown | for Street Lighting & Electrical-la kadandha 90 naal-la 102 incidents report aagirukku: 0 severe, 102 innum open, 1 per uyirizhappu. | for Street Lighting & Electrical-la kadandha 90 naal-la 102 incidents innum open-la irukku, 1 per uyirizhappu. |
| $[3].data.voiceSummary | for Street Lighting & Electrical-la kadandha 90 naal-la 102 incidents report aagirukku: 0 severe, 102 innum open, 1 per uyirizhappu. | for Street Lighting & Electrical-la kadandha 90 naal-la 102 incidents innum open-la irukku, 1 per uyirizhappu. |
| $[3].data.kpis[0].label | Reported | Open |

### officerA GET /api/officer/grievances

Session reads2, id 7eeb6552758ef083, 4913 bytes to 4946 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?cat=SOLID_WASTE

Session reads2, id c764414b7e96d666, 4913 bytes to 4946 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?cat=DARK_SPOT_SAFETY

Session reads2, id a63cd91203e80cb4, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?cat=FOOD_SAFETY

Session reads2, id 5b133ca94c4c7a79, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?cat=PUBLIC_ORDER

Session reads2, id 38599b4205ddc926, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?cat=FLOOD_RELIEF

Session reads2, id 6c429b6659afeae3, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?cat=NOT_A_CATEGORY

Session reads2, id 8cf49bc38fd3a17d, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?flag=open

Session reads2, id df59ac0a25b39e7d, 4913 bytes to 4946 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?flag=serious

Session reads2, id 86fe648fb2313370, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?flag=overdue

Session reads2, id 202312348c8e31e5, 4886 bytes to 4919 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?flag=due

Session reads2, id 6aa43fc1251ad051, 3515 bytes to 3548 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?period=daily

Session reads2, id b80e2526078f9fa6, 4913 bytes to 4946 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?period=weekly

Session reads2, id dab66449b74ca1b2, 4913 bytes to 4946 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?period=monthly

Session reads2, id 2abe95cf40e961d9, 4913 bytes to 4946 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?period=quarterly

Session reads2, id 4d6d5cc1491e305b, 4913 bytes to 4946 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?period=bogus

Session reads2, id 907fc49d6c2daa96, 4913 bytes to 4946 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?q=Adyar

Session reads2, id 9ae477fed53ec365, 1223 bytes to 1256 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?q=garbage

Session reads2, id 6f5ea0cf05916bbc, 4913 bytes to 4946 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?q=kuppai

Session reads2, id 38d045617ce77adf, 1238 bytes to 1271 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?q=குப்பை

Session reads2, id 8e2e091c146aab59, 2692 bytes to 2725 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?q=x

Session reads2, id 47382d59efd2454d, 4913 bytes to 4946 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?q=INC-20260926-EB3B79

Session reads2, id 6b43265a9552eb1e, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?sev=Severe

Session reads2, id 45d030a393df15d3, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?sev=High

Session reads2, id b0acfb1b1cccb1f4, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?sev=Medium

Session reads2, id 589c5c009ff87a06, 4913 bytes to 4946 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?sev=Low

Session reads2, id 2fb26e6988b89b68, 4662 bytes to 4695 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?sev=bogus

Session reads2, id 62b2ac71300e6edd, 4913 bytes to 4946 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?tab=all

Session reads2, id 202f59f4d5b7398e, 4698 bytes to 4731 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?tab=new

Session reads2, id fc99fd364787f994, 4913 bytes to 4946 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?tab=action

Session reads2, id cd335786bb4b1f26, 4881 bytes to 4914 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?tab=sent

Session reads2, id fcccf7473110520d, 4998 bytes to 5031 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?tab=verified

Session reads2, id 8cca66dfe5c75d49, 4792 bytes to 4825 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?tab=bogus

Session reads2, id 062b1f3ee4c425d3, 4913 bytes to 4946 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?taluk=TLK-MYL

Session reads2, id 998b40d6b77c7989, 3668 bytes to 3701 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?taluk=TLK-SHN

Session reads2, id 2b4b43f247ef813b, 650 bytes to 683 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?taluk=TLK-MDR

Session reads2, id 7446ab14b6b529d2, 1258 bytes to 1291 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?taluk=TLK-AYN

Session reads2, id 8ead7f5458d73f91, 701 bytes to 734 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?taluk=TLK-XXX

Session reads2, id 74d1c6aecd2808e2, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?zone=5

Session reads2, id 6a08aaa61e8c6db2, 4187 bytes to 4220 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?zone=13

Session reads2, id 45f99be531bae84e, 1223 bytes to 1256 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?zone=1

Session reads2, id c5b8a20287f5a417, 2333 bytes to 2366 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?zone=8

Session reads2, id 976db2ef4409ac97, 642 bytes to 675 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?zone=15

Session reads2, id 65f730dac9bcfcca, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?zone=99

Session reads2, id c626f7d8036c7b1b, 4913 bytes to 4946 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?zone=abc

Session reads2, id e4b13d4dc1e88463, 4913 bytes to 4946 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?period=weekly&zone=5

Session reads2, id bd9bcf98ca294531, 3624 bytes to 3657 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?period=monthly&zone=13

Session reads2, id 04c300829a48b564, 1223 bytes to 1256 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?period=quarterly&zone=1

Session reads2, id 5801bd75500dcc15, 2333 bytes to 2366 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?period=monthly&zone=13&cat=SOLID_WASTE

Session reads2, id 9d4f6c40252fe6aa, 1223 bytes to 1256 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?period=weekly&taluk=TLK-MYL

Session reads2, id 74b033f69cbfe84a, 3071 bytes to 3104 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?period=weekly&cat=DARK_SPOT_SAFETY&sev=High

Session reads2, id 8ab9462ee3b2758f, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?period=monthly&tab=all&sev=High

Session reads2, id e8266a0daa48aade, 3077 bytes to 3110 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?period=monthly&tab=all&cat=SOLID_WASTE

Session reads2, id 43ae454eea29528b, 4698 bytes to 4731 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances

Session reads2, id ff217ca4330d478b, 4758 bytes to 4791 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?cat=SOLID_WASTE

Session reads2, id 5d5796ae82d6a6af, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?cat=DARK_SPOT_SAFETY

Session reads2, id ddb36b10d8076e5b, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?cat=FOOD_SAFETY

Session reads2, id 966d7e7a270fc4ca, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?cat=PUBLIC_ORDER

Session reads2, id aea65cc0258e35f8, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?cat=FLOOD_RELIEF

Session reads2, id 3f14ce8eada23484, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?cat=NOT_A_CATEGORY

Session reads2, id 3fc5230d1f519688, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?flag=open

Session reads2, id 20c68b0a09c6ea5c, 4758 bytes to 4791 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?flag=serious

Session reads2, id 2f51489803aae58b, 3606 bytes to 3639 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?flag=overdue

Session reads2, id a8edc13a1f4c7381, 4771 bytes to 4804 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?flag=due

Session reads2, id a3616728f164c30f, 1288 bytes to 1321 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?period=daily

Session reads2, id f04ceb455a7cc711, 5086 bytes to 5119 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?period=weekly

Session reads2, id 5b8108cc84314973, 4758 bytes to 4791 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?period=monthly

Session reads2, id 374b4b739aa85e48, 4758 bytes to 4791 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?period=quarterly

Session reads2, id 64a283f7200da639, 4758 bytes to 4791 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?period=bogus

Session reads2, id 6c4da859bec795fb, 5086 bytes to 5119 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?q=Adyar

Session reads2, id 6b0361534e367c8f, 1468 bytes to 1501 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?q=garbage

Session reads2, id f35fa0210b13dc66, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?q=kuppai

Session reads2, id 53aaf713f43059d5, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?q=குப்பை

Session reads2, id ac51bba83a6bba73, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?q=x

Session reads2, id 8690f640573a389b, 4758 bytes to 4791 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?q=INC-20260926-EB3B79

Session reads2, id 4f14cb97e8542a0b, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?sev=Severe

Session reads2, id b9095ba278d0269a, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?sev=High

Session reads2, id fe1c82627b30362d, 3606 bytes to 3639 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?sev=Medium

Session reads2, id 7b4dc751bbe80260, 5166 bytes to 5199 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?sev=Low

Session reads2, id 854d624445c3e8b4, 4813 bytes to 4846 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?sev=bogus

Session reads2, id aa8f1cbe84cc99d8, 4758 bytes to 4791 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?tab=all

Session reads2, id df11867e7ee6961a, 4945 bytes to 4978 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?tab=new

Session reads2, id f05d989a02bb1710, 4758 bytes to 4791 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?tab=action

Session reads2, id 76e6562a23d4d60a, 5054 bytes to 5087 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?tab=sent

Session reads2, id b2b83600db1de703, 5345 bytes to 5378 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?tab=verified

Session reads2, id 3debde103903e062, 5099 bytes to 5132 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?tab=bogus

Session reads2, id a41d387198a2a447, 4758 bytes to 4791 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?taluk=TLK-MYL

Session reads2, id 04d4a5d3b49b34fe, 1375 bytes to 1408 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?taluk=TLK-SHN

Session reads2, id dae89d212db972a0, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?taluk=TLK-MDR

Session reads2, id 50acb3e00dd5d506, 3005 bytes to 3038 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?taluk=TLK-AYN

Session reads2, id 0bd41e756d7a5b58, 1348 bytes to 1381 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?taluk=TLK-XXX

Session reads2, id d52aae784a35feca, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?zone=5

Session reads2, id c1d092275969691f, 4234 bytes to 4267 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?zone=13

Session reads2, id 420c2ac1d1a7cb29, 1468 bytes to 1501 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?zone=1

Session reads2, id 38586f1f11e2b7b5, 1267 bytes to 1300 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?zone=8

Session reads2, id a036548660f9f1a6, 1308 bytes to 1341 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?zone=15

Session reads2, id 9076c9512cdbf81d, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?zone=99

Session reads2, id 6697d1d8c97472b5, 4758 bytes to 4791 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?zone=abc

Session reads2, id 34627a782591adad, 4758 bytes to 4791 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?period=weekly&zone=5

Session reads2, id b92acb53c8e1a9a6, 3595 bytes to 3628 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?period=monthly&zone=13

Session reads2, id af950460851c6def, 1468 bytes to 1501 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?period=quarterly&zone=1

Session reads2, id 849d784629a50a4d, 1267 bytes to 1300 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?period=monthly&zone=13&cat=SOLID_WASTE

Session reads2, id 3de6633ad4b8ddad, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?period=weekly&taluk=TLK-MYL

Session reads2, id 996ded8e43e1e0ed, 1375 bytes to 1408 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?period=weekly&cat=DARK_SPOT_SAFETY&sev=High

Session reads2, id 0524e049f8263f83, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?period=monthly&tab=all&sev=High

Session reads2, id 6fba68681c70e54c, 4960 bytes to 4993 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerB GET /api/officer/grievances?period=monthly&tab=all&cat=SOLID_WASTE

Session reads2, id e58ac932678fce7a, 66 bytes to 99 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### collector POST /api/collector/thunai/agent/round

Session ask, id f1e6ac2ad90ac282, 12224 bytes to 12201 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 54 of the 52 are past their deadline. | 54 are past their deadline. |
| $.result.stage.takeaway.ta | 52-இல் 54 காலக்கெடுவைத் தாண்டியவை. | 54 காலக்கெடுவைத் தாண்டியவை. |

### collector POST /api/collector/thunai/agent/round

Session ask, id 484c3e63acc4f70c, 11103 bytes to 11105 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.blocks[1].rows[7].overdue | true | false |
| $.result.stage.blocks[1].rows[9].overdue | true | false |
| $.result.stage.next[0].label.en | Draft for the 7 past deadline | Draft for the 5 past deadline |
| $.result.stage.next[0].label.ta | காலக்கெடு தாண்டிய 7-க்கு வரைவு | காலக்கெடு தாண்டிய 5-க்கு வரைவு |
| $.result.stage.next[0].ids[4] | INC-20261101-C8D6E1 | INC-20261101-774B5E |

### collector POST /api/collector/thunai/agent/round

Session ask, id f09bcf697432c0ab, 10717 bytes to 10719 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.blocks[1].rows[7].overdue | true | false |
| $.result.stage.blocks[1].rows[9].overdue | true | false |
| $.result.stage.next[0].label.en | Draft for the 7 past deadline | Draft for the 5 past deadline |
| $.result.stage.next[0].label.ta | காலக்கெடு தாண்டிய 7-க்கு வரைவு | காலக்கெடு தாண்டிய 5-க்கு வரைவு |
| $.result.stage.next[0].ids[4] | INC-20261101-C8D6E1 | INC-20261101-774B5E |

### collector POST /api/collector/thunai/agent/round

Session ask, id f025856d46a1ca5f, 6279 bytes to 5966 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.en | 3 cases this week. One is past its deadline and needs you first: a street light or electrical problem at Church Road, Padi, Mogappair in Amb... (333 chars) | 3 cases this week. One is past its deadline and needs you first: a street light or electrical problem at Church Road, Padi, Mogappair in Amb... (233 chars) |
| $.result.stage.say.ta | இந்த வாரம் 3 சம்பவங்கள். 1 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: a street light or electrical problem at Church Road, Padi, Mogapp... (336 chars) | இந்த வாரம் 3 சம்பவங்கள். 1 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: a street light or electrical problem at Church Road, Padi, Mogapp... (240 chars) |
| $.result.stage.blocks[1].rows[2].overdue | true | false |
| $.result.stage.next[0].label.en | Draft for the 2 past deadline | Draft for the 1 past deadline |
| $.result.stage.next[0].label.ta | காலக்கெடு தாண்டிய 2-க்கு வரைவு | காலக்கெடு தாண்டிய 1-க்கு வரைவு |
| $.result.stage.next[0].ids.length | 2 | 1 |
| $.result.stage.next[0].ids[1] | INC-20261031-651B9F | (absent) |
| $.result.say | இந்த வாரம் 3 சம்பவங்கள். 1 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: a street light or electrical problem at Church Road, Padi, Mogapp... (336 chars) | இந்த வாரம் 3 சம்பவங்கள். 1 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: a street light or electrical problem at Church Road, Padi, Mogapp... (240 chars) |

### collector POST /api/collector/thunai/agent/round (direct, sentence 18)

Session ask, id e2bf5af9ffe285e3, 12140 bytes to 12117 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.en | 54 of the 52 are past their deadline. | 54 are past their deadline. |
| $.result.stage.takeaway.ta | 52-இல் 54 காலக்கெடுவைத் தாண்டியவை. | 54 காலக்கெடுவைத் தாண்டியவை. |

### collector POST /api/collector/thunai/agent/round (direct, sentence 19)

Session ask, id 61ed15dc04e17ba5, 11019 bytes to 11021 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.blocks[1].rows[7].overdue | true | false |
| $.result.stage.blocks[1].rows[9].overdue | true | false |
| $.result.stage.next[0].label.en | Draft for the 7 past deadline | Draft for the 5 past deadline |
| $.result.stage.next[0].label.ta | காலக்கெடு தாண்டிய 7-க்கு வரைவு | காலக்கெடு தாண்டிய 5-க்கு வரைவு |
| $.result.stage.next[0].ids[4] | INC-20261101-C8D6E1 | INC-20261101-774B5E |

### collector POST /api/collector/assistant/chat

Session ask, id 83e4e1ba5a1f1ba4, 2619 bytes to 2520 bytes.

| Path | A | B |
|---|---|---|
| $[3].data.headline | 153 street lights and electrical incidents · கடந்த 90 நாட்களில் | 153 street lights and electrical incidents நிலுவையில் · கடந்த 90 நாட்களில் |
| $[3].data.answerMarkdown | கடந்த 90 நாட்களில் 153 street lights and electrical incidents பதிவாகியுள்ளன: 0 கடுமையானவை, 153 இன்னும் நிலுவையில், 1 உயிரிழப்பு. | கடந்த 90 நாட்களில் 153 street lights and electrical incidents இன்னும் நிலுவையில் உள்ளன, 1 உயிரிழப்பு. |
| $[3].data.voiceSummary | கடந்த 90 நாட்களில் 153 street lights and electrical incidents பதிவாகியுள்ளன: 0 கடுமையானவை, 153 இன்னும் நிலுவையில், 1 உயிரிழப்பு. | கடந்த 90 நாட்களில் 153 street lights and electrical incidents இன்னும் நிலுவையில் உள்ளன, 1 உயிரிழப்பு. |
| $[3].data.kpis[0].label | Reported | Open |

### collector POST /api/collector/assistant/chat

Session ask, id c71378c43ea77a2a, 2107 bytes to 2054 bytes.

| Path | A | B |
|---|---|---|
| $[3].data.headline | 2,411 incidents · kadandha 90 naal-la | 2,411 incidents open · kadandha 90 naal-la |
| $[3].data.answerMarkdown | kadandha 90 naal-la 2,411 incidents report aagirukku (munnadi 225): 137 severe, 2,411 innum open, 71 per uyirizhappu. | kadandha 90 naal-la 2,411 incidents innum open-la irukku (137 severe), 71 per uyirizhappu. |
| $[3].data.voiceSummary | kadandha 90 naal-la 2,411 incidents report aagirukku (munnadi 225): 137 severe, 2,411 innum open, 71 per uyirizhappu. | kadandha 90 naal-la 2,411 incidents innum open-la irukku (137 severe), 71 per uyirizhappu. |
| $[3].data.kpis[0].label | Reported | Open |

### citizenA POST /api/complaints

Session writes, id 2aa1c2dda62808d8, 440 bytes to 988 bytes.

| Path | A | B |
|---|---|---|
| $.queueNote | (absent) | {object with 2 keys} |

### officerA GET /api/officer/grievances?tab=new&per=4

Session writes, id 78f15c9fa2f5ce11, 2508 bytes to 2541 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?tab=new

Session writes, id 4696714d53061258, 4921 bytes to 4954 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?tab=action

Session writes, id 451c2f67b37e04a1, 4852 bytes to 4885 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?tab=sent

Session writes, id 2b8dd7c0ee8764d4, 4998 bytes to 5031 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?tab=verified

Session writes, id c17c6609e4007194, 4843 bytes to 4876 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

### officerA GET /api/officer/grievances?tab=all

Session writes, id 39d40b4e83cd747b, 4779 bytes to 4812 bytes.

| Path | A | B |
|---|---|---|
| $.awaiting | (absent) | 0 |
| $.awaitingNote | (absent) | null |

