# Golden-master diff: baseline-abef9da to lane-a

Compared 3272 requests with 3272. **7 changed, 1 added, 1 removed.**

## What differs around the requests

- next_build_id: uoCyfOgnc3qJwf1N3gZ7P to mZlhdncqi_lG3LVwULcIz

## By route

| Route | Requests changed | Roles | Status changes | Most changed paths |
|---|---|---|---|---|
| /api/collector/thunai/agent/round | 6 | collector | none | $.trace[*].label (5), $.result.say (4), $.result.stage.blocks[*].items[*].value (4), $.result.stage.blocks[*].items[*].key (3), $.result.stage.blocks[*].items[*].label (3) |
| /api/collector/thunai/agent | 1 | collector | none | $.result.lang (1) |

## Added requests

- collector POST /api/collector/thunai/agent/round: 200

## Removed requests

- collector POST /api/collector/thunai/agent/round: 200

## Each changed request

### collector POST /api/collector/thunai/agent

Session reads, id 2bb2d79b381a6eec, 171 bytes to 171 bytes.

| Path | A | B |
|---|---|---|
| $.result.lang | en | ta |

### collector POST /api/collector/thunai/agent/round

Session ask, id ac136777a4aee429, 11213 bytes to 11217 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.slots.status | null | open |
| $.result.stage.next[0].slots.status | null | open |

### collector POST /api/collector/thunai/agent/round

Session ask, id 7ee55bdb05ba2342, 2666 bytes to 337 bytes.

| Path | A | B |
|---|---|---|
| $.result.kind | do | none |
| $.result.steps.length | 1 | 0 |
| $.result.steps[0] | {object with 2 keys} | (absent) |
| $.result.stage | {object with 13 keys} | null |
| $.result.say | 4 அளவீடுகள். அதிகம்: Chennai-Madhavaram, 14 mm, 6 Nov, 8:30 AM நிலவரப்படி. | null |
| $.result.note | quick | no-model |
| $.trace.length | 2 | 1 |
| $.trace[0].label | தரவைப் படிக்கிறேன் | யோசிக்கிறேன் |
| $.trace[1] | {object with 3 keys} | (absent) |
| $.lane | quick | no-model |

### collector POST /api/collector/thunai/agent/round

Session ask, id fa394469d1d31521, 11480 bytes to 11478 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.en | 105 cases this week; here are the 12 that matter most. The most urgent: an encroachment or unauthorised construction at Vallalar Extn Extens... (229 chars) | 87 cases this week; here are the 12 that matter most. The most urgent: an encroachment or unauthorised construction at Vallalar Extn Extensi... (228 chars) |
| $.result.stage.say.ta | இந்த வாரம் 105 சம்பவங்கள். மிக அவசரமானது: an encroachment or unauthorised construction at Vallalar Extn Extension in Adyar. Storm Water Drai... (196 chars) | இந்த வாரம் 87 சம்பவங்கள். மிக அவசரமானது: an encroachment or unauthorised construction at Vallalar Extn Extension in Adyar. Storm Water Drain... (195 chars) |
| $.result.stage.blocks[0].items[0].value | 105 | 87 |
| $.result.stage.blocks[1].total | 105 | 87 |
| $.result.stage.slots.status | null | open |
| $.result.stage.next[0].slots.status | null | open |
| $.result.say | இந்த வாரம் 105 சம்பவங்கள். மிக அவசரமானது: an encroachment or unauthorised construction at Vallalar Extn Extension in Adyar. Storm Water Drai... (196 chars) | இந்த வாரம் 87 சம்பவங்கள். மிக அவசரமானது: an encroachment or unauthorised construction at Vallalar Extn Extension in Adyar. Storm Water Drain... (195 chars) |
| $.trace[1].label | 105 சம்பவங்களைப் படித்தேன் | 87 சம்பவங்களைப் படித்தேன் |

### collector POST /api/collector/thunai/agent/round

Session ask, id bcf00976700038f4, 309 bytes to 337 bytes.

| Path | A | B |
|---|---|---|
| $.result.lang | en | ta |
| $.trace[0].label | Thinking | யோசிக்கிறேன் |

### collector POST /api/collector/thunai/agent/round

Session ask, id 9ef6d6c5b729a804, 5107 bytes to 3800 bytes.

| Path | A | B |
|---|---|---|
| $.result.steps.length | 2 | 1 |
| $.result.steps[0].a | view | page |
| $.result.steps[0].view | {object with 1 keys} | (absent) |
| $.result.steps[0].page | (absent) | environment |
| $.result.steps[1] | {object with 2 keys} | (absent) |
| $.result.stage.recipe | cases | readings |
| $.result.stage.title | Cases · Drinking water supply · this week | Reservoir storage |
| $.result.stage.takeaway.en | 2 of the 2 shown are past their deadline. | Veeranam is 21% above its 28-day average. |
| $.result.stage.takeaway.ta | காட்டப்பட்ட 2-இல் 2 காலக்கெடுவைத் தாண்டியவை. | Veeranam அதன் 28 நாள் சராசரியை விட 21% அதிகம். |
| $.result.stage.say.en | 2 cases this week. 2 are past their deadline and need you first: Drinking water supply at Chennai, and a drinking-water problem at K.K. Naga... (234 chars) | 6 readings. Highest: Veeranam at 72% full, as of 6 Nov, 6:00 AM. |
| $.result.stage.say.ta | இந்த வாரம் 2 சம்பவங்கள். 2 காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: Drinking water supply at Chennai, a drinking-water problem at K.K... (237 chars) | 6 அளவீடுகள். அதிகம்: Veeranam, 72%, 6 Nov, 6:00 AM நிலவரப்படி. |
| $.result.stage.blocks.length | 3 | 2 |
| $.result.stage.blocks[0].kind | Kpis | Readings |
| $.result.stage.blocks[0].id | kpis | readings |
| $.result.stage.blocks[0].title | Key numbers | Reservoir storage |
| $.result.stage.blocks[0].items.length | 3 | 6 |
| $.result.stage.blocks[0].items[0].key | total | (absent) |
| $.result.stage.blocks[0].items[0].label | All cases, this week | (absent) |
| $.result.stage.blocks[0].items[0].value | 2 | 72.1 |
| $.result.stage.blocks[0].items[0].unit | null | (absent) |
| $.result.stage.blocks[0].items[0].prev | null | (absent) |
| $.result.stage.blocks[0].items[0].delta | null | (absent) |
| $.result.stage.blocks[0].items[0].tone | neutral | (absent) |
| $.result.stage.blocks[0].items[0].spark | [array of 0] | (absent) |
| $.result.stage.blocks[0].items[0].id | (absent) | CMWSSB-VEERANAM |

...and 76 more paths (see the JSON file).

### collector POST /api/collector/thunai/agent/round

Session ask, id a3c117ff746b0a57, 3298 bytes to 337 bytes.

| Path | A | B |
|---|---|---|
| $.result.kind | do | none |
| $.result.stage | {object with 13 keys} | null |
| $.result.say | இன்று சுருக்கத்தில் 6 குறிப்புகள். 24 incidents were reported in Adyar (last 24 hours), 71% more than the previous period. | null |
| $.result.note | resolve:exact | no-model |
| $.trace[0].label | சுருக்கம் தயார் செய்கிறேன் | யோசிக்கிறேன் |
| $.lane | resolve | no-model |

