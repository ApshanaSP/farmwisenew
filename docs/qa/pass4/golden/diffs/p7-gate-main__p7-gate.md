# Golden-master diff: p7-gate-main to p7-gate

Compared 3273 requests with 3298. **56 changed, 25 added, 0 removed.**

## What differs around the requests

- next_build_id: SWKEUJgzHqBCQjD1NS_2D to gaZnMIjiSOkRkp31HVyT-

## By route

| Route | Requests changed | Roles | Status changes | Most changed paths |
|---|---|---|---|---|
| /api/collector/thunai/agent/round | 41 | collector | none | $.result.stage.lang (41), $.result.stage.titles (41), $.result.stage.notesBi (41), $.result.stage.blocks[*].title (34), $.result.stage.blocks[*].items[*].label (20) |
| /api/collector/thunai/agent | 7 | collector | none | $.result.stage.lang (7), $.result.stage.titles (7), $.result.stage.notesBi (7), $.result.stage.blocks[*].items[*].sub (5), $.result.stage.say.ta (3) |
| /api/collector/studio/[id] | 3 | collector | none | $.confirm.scope (3) |
| /api/collector/overview | 2 | collector | none | $.severity.rows[*].lat (2), $.severity.rows[*].lon (2), $.map.pins[*].lat (1), $.map.pins[*].lon (1) |
| /api/collector/thunai/memory | 2 | collector | 200 -> 403 | $.notes (1), $.habits (1), $.pending (1), $.prefs (1), $.reminders (1) |
| /api/collector/search | 1 | collector | none | $.incidents[*].lat (1), $.incidents[*].lon (1) |

## Added requests

- anonymous GET /api/collector/thunai/brief: 401
- anonymous GET /api/collector/thunai/follow: 401
- anonymous GET /api/collector/thunai/watch: 401
- anonymous GET /api/dev/thunai/brief: 404
- anonymous GET /api/dev/thunai/watch: 404
- citizenA GET /api/collector/thunai/brief: 401
- citizenA GET /api/collector/thunai/follow: 401
- citizenA GET /api/collector/thunai/watch: 401
- citizenA GET /api/dev/thunai/brief: 404
- citizenA GET /api/dev/thunai/watch: 404
- officerA GET /api/collector/thunai/brief: 401
- officerA GET /api/collector/thunai/follow: 401
- officerA GET /api/collector/thunai/watch: 401
- officerA GET /api/dev/thunai/brief: 404
- officerA GET /api/dev/thunai/watch: 404
- officerB GET /api/collector/thunai/brief: 401
- officerB GET /api/collector/thunai/follow: 401
- officerB GET /api/collector/thunai/watch: 401
- officerB GET /api/dev/thunai/brief: 404
- officerB GET /api/dev/thunai/watch: 404
- collector GET /api/collector/thunai/brief: 200
- collector GET /api/collector/thunai/follow: 200
- collector GET /api/collector/thunai/watch: 200
- collector GET /api/dev/thunai/brief: 404
- collector GET /api/dev/thunai/watch: 404

## Each changed request

### collector POST /api/collector/thunai/agent

Session reads, id 8cf390975fbb8b52, 14872 bytes to 15113 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent

Session reads, id 91a65392a4b15c8f, 4202 bytes to 4945 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.ta | கடந்த 30 நாட்களில் Ambattur, Madhavaram-ஐ விட 2 மடங்கு High. | கடந்த 30 நாட்களில் அம்பத்தூர், மாதவரம்-ஐ விட 2 மடங்கு அதிக முக்கியத்துவம். |
| $.result.stage.say.ta | அம்பத்தூர்: 0 கடுமையான, 3 திறந்தவை. மாதவரம்: 0 கடுமையான, 2 திறந்தவை. பெரிய வேறுபாடு High: Ambattur 2, Madhavaram 1. | அம்பத்தூர்: 0 கடுமையான, 3 திறந்தவை. மாதவரம்: 0 கடுமையான, 2 திறந்தவை. பெரிய வேறுபாடு அதிக முக்கியத்துவம்: அம்பத்தூர் 2, மாதவரம் 1. |
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 1] |

### collector POST /api/collector/thunai/agent

Session reads, id c95036250204487a, 3913 bytes to 4357 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.en | 2 incidents this week against 4 the period before (down 50%). Mainly: 2 open incidents are past their deadline; the busiest spot is K.K. Nag... (169 chars) | 2 incidents this week against 4 the period before (down 50%). Mainly: 2 open incidents are past their deadline; the busiest spot is K.K. Nag... (218 chars) |
| $.result.stage.say.ta | இந்த வாரம் 2 சம்பவங்கள், முந்தைய காலத்தில் 4. 2 காலக்கெடு தாண்டியவை; அதிக இடம் K.K. Nagar (1). | இந்த வாரம் 2 சம்பவங்கள், முந்தைய காலத்தில் 4. 2 காலக்கெடு தாண்டியவை; அதிக இடம் K.K. Nagar (1). ரெண்டு சம்பவங்கள் தான், அதனால பெருசா எடுத்துக... (152 chars) |
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |
| $.result.say | 2 incidents this week against 4 the period before (down 50%). Mainly: 2 open incidents are past their deadline; the busiest spot is K.K. Nag... (169 chars) | 2 incidents this week against 4 the period before (down 50%). Mainly: 2 open incidents are past their deadline; the busiest spot is K.K. Nag... (218 chars) |

### collector POST /api/collector/thunai/agent

Session reads, id 9f090385895630b2, 1014 bytes to 1112 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.ta | 13 hospitals within 1 km of Velachery. |  |
| $.result.stage.say.ta | 13 hospitals within 1 km of Velachery. | வரைபடத்தில் முடிவுகள் உள்ளன. |
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent

Session reads, id b709a6b7afee2afd, 11548 bytes to 11780 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent

Session reads, id ea25e31de4431e9c, 3470 bytes to 4362 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.title | Top 5 · Severe incidents · this week | முதல் 5 · கடுமையான சம்பவங்கள் · இந்த வாரம் |
| $.result.stage.blocks[0].title | Key numbers | முக்கிய எண்கள் |
| $.result.stage.blocks[0].items[0].label | Royapuram | ராயபுரம் |
| $.result.stage.blocks[0].items[1].label | All areas together | எல்லாப் பகுதிகளும் சேர்த்து |
| $.result.stage.blocks[0].items[2].label | Royapuram's share | ராயபுரம் பங்கு |
| $.result.stage.blocks[1].title | Severe incidents | கடுமையான சம்பவங்கள் |
| $.result.stage.blocks[1].method | Severe incidents by zone, this week, as the console's zone table counts them. | கடுமையான சம்பவங்கள், மண்டல வாரியாக, இந்த வாரம், கன்சோலின் மண்டல அட்டவணைப்படி. |
| $.result.stage.blocks[1].items[0].sub | 16 severe · 135 open | 16 கடுமையானவை · 135 திறந்தவை |
| $.result.stage.blocks[1].items[1].sub | 9 severe · 54 open | 9 கடுமையானவை · 54 திறந்தவை |
| $.result.stage.blocks[1].items[2].sub | 7 severe · 97 open | 7 கடுமையானவை · 97 திறந்தவை |
| $.result.stage.blocks[1].items[3].sub | 5 severe · 72 open | 5 கடுமையானவை · 72 திறந்தவை |
| $.result.stage.blocks[1].items[4].sub | 4 severe · 110 open | 4 கடுமையானவை · 110 திறந்தவை |
| $.result.stage.blocks[2].title | Severe incidents by zone | கடுமையான சம்பவங்கள், மண்டல வாரியாக |
| $.result.stage.blocks[2].shade.label | Severe incidents | கடுமையான சம்பவங்கள் |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent

Session reads, id 8207e2765a8903b7, 3359 bytes to 3557 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id 8213db3c1be53f5d, 15055 bytes to 15296 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id eb1562d1e045703b, 3537 bytes to 3735 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id bc94a14cdfe5ac48, 7308 bytes to 7593 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id 3d1d878d45cabe62, 4388 bytes to 5131 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.ta | கடந்த 30 நாட்களில் Ambattur, Madhavaram-ஐ விட 2 மடங்கு High. | கடந்த 30 நாட்களில் அம்பத்தூர், மாதவரம்-ஐ விட 2 மடங்கு அதிக முக்கியத்துவம். |
| $.result.stage.say.ta | அம்பத்தூர்: 0 கடுமையான, 3 திறந்தவை. மாதவரம்: 0 கடுமையான, 2 திறந்தவை. பெரிய வேறுபாடு High: Ambattur 2, Madhavaram 1. | அம்பத்தூர்: 0 கடுமையான, 3 திறந்தவை. மாதவரம்: 0 கடுமையான, 2 திறந்தவை. பெரிய வேறுபாடு அதிக முக்கியத்துவம்: அம்பத்தூர் 2, மாதவரம் 1. |
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 1] |

### collector POST /api/collector/thunai/agent/round

Session ask, id 915af0152152346b, 2742 bytes to 2932 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id 9a26d7a1fffe86cd, 4095 bytes to 4539 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.en | 2 incidents this week against 4 the period before (down 50%). Mainly: 2 open incidents are past their deadline; the busiest spot is K.K. Nag... (169 chars) | 2 incidents this week against 4 the period before (down 50%). Mainly: 2 open incidents are past their deadline; the busiest spot is K.K. Nag... (218 chars) |
| $.result.stage.say.ta | இந்த வாரம் 2 சம்பவங்கள், முந்தைய காலத்தில் 4. 2 காலக்கெடு தாண்டியவை; அதிக இடம் K.K. Nagar (1). | இந்த வாரம் 2 சம்பவங்கள், முந்தைய காலத்தில் 4. 2 காலக்கெடு தாண்டியவை; அதிக இடம் K.K. Nagar (1). ரெண்டு சம்பவங்கள் தான், அதனால பெருசா எடுத்துக... (152 chars) |
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |
| $.result.say | 2 incidents this week against 4 the period before (down 50%). Mainly: 2 open incidents are past their deadline; the busiest spot is K.K. Nag... (169 chars) | 2 incidents this week against 4 the period before (down 50%). Mainly: 2 open incidents are past their deadline; the busiest spot is K.K. Nag... (218 chars) |

### collector POST /api/collector/thunai/agent/round

Session ask, id a00a263949adc0de, 3577 bytes to 3701 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id 47837972a243c09b, 1154 bytes to 1252 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.ta | 13 hospitals within 1 km of Velachery. |  |
| $.result.stage.say.ta | 13 hospitals within 1 km of Velachery. | வரைபடத்தில் முடிவுகள் உள்ளன. |
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id 157508256127d2ef, 3950 bytes to 4076 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id 1959186f8ccc0a1e, 3874 bytes to 4139 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id ac136777a4aee429, 15939 bytes to 16209 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.blocks[0].title | Key numbers | முக்கிய எண்கள் |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id f1e6ac2ad90ac282, 3732 bytes to 4624 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.title | Top 5 · Severe incidents · this week | முதல் 5 · கடுமையான சம்பவங்கள் · இந்த வாரம் |
| $.result.stage.blocks[0].title | Key numbers | முக்கிய எண்கள் |
| $.result.stage.blocks[0].items[0].label | Royapuram | ராயபுரம் |
| $.result.stage.blocks[0].items[1].label | All areas together | எல்லாப் பகுதிகளும் சேர்த்து |
| $.result.stage.blocks[0].items[2].label | Royapuram's share | ராயபுரம் பங்கு |
| $.result.stage.blocks[1].title | Severe incidents | கடுமையான சம்பவங்கள் |
| $.result.stage.blocks[1].method | Severe incidents by zone, this week, as the console's zone table counts them. | கடுமையான சம்பவங்கள், மண்டல வாரியாக, இந்த வாரம், கன்சோலின் மண்டல அட்டவணைப்படி. |
| $.result.stage.blocks[1].items[0].sub | 16 severe · 135 open | 16 கடுமையானவை · 135 திறந்தவை |
| $.result.stage.blocks[1].items[1].sub | 9 severe · 54 open | 9 கடுமையானவை · 54 திறந்தவை |
| $.result.stage.blocks[1].items[2].sub | 7 severe · 97 open | 7 கடுமையானவை · 97 திறந்தவை |
| $.result.stage.blocks[1].items[3].sub | 5 severe · 72 open | 5 கடுமையானவை · 72 திறந்தவை |
| $.result.stage.blocks[1].items[4].sub | 4 severe · 110 open | 4 கடுமையானவை · 110 திறந்தவை |
| $.result.stage.blocks[2].title | Severe incidents by zone | கடுமையான சம்பவங்கள், மண்டல வாரியாக |
| $.result.stage.blocks[2].shade.label | Severe incidents | கடுமையான சம்பவங்கள் |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id 484c3e63acc4f70c, 11374 bytes to 11688 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.blocks[0].title | Key numbers | முக்கிய எண்கள் |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id 0401451bde1ac789, 6056 bytes to 6394 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.blocks[0].title | Key numbers | முக்கிய எண்கள் |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id 2941e2ef55b91f8b, 3706 bytes to 3928 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.title | Reservoir storage | நீர்த்தேக்க இருப்பு |
| $.result.stage.blocks[0].title | Reservoir storage | நீர்த்தேக்க இருப்பு |
| $.result.stage.blocks[1].title | Stations | நிலையங்கள் |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id 6f62837a7c869338, 2021 bytes to 2417 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.blocks[0].text | Nothing in the data matches this, for this scope. | இந்தப் பார்வைக்குத் தரவில் எதுவும் பொருந்தவில்லை. |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id fa394469d1d31521, 10939 bytes to 11493 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.title | Cases · Adyar · this week | சம்பவங்கள் · அடையாறு · இந்த வாரம் |
| $.result.stage.blocks[0].title | Key numbers | முக்கிய எண்கள் |
| $.result.stage.blocks[0].items[0].label | All cases, this week | எல்லா சம்பவங்கள், இந்த வாரம் |
| $.result.stage.blocks[0].items[1].label | Past their deadline | காலக்கெடு தாண்டியவை |
| $.result.stage.blocks[1].title | Cases · Adyar · this week | சம்பவங்கள் · அடையாறு · இந்த வாரம் |
| $.result.stage.blocks[2].title | Where they are | எங்கே உள்ளன |
| $.result.stage.blocks[2].rule | Numbered as in the list; cases without an exact place are not drawn. | பட்டியலில் உள்ளபடி எண்கள்; சரியான இடம் இல்லாத சம்பவங்கள் வரையப்படவில்லை. |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id 9f079c06d08640a4, 3732 bytes to 4624 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.title | Top 5 · Severe incidents · this week | முதல் 5 · கடுமையான சம்பவங்கள் · இந்த வாரம் |
| $.result.stage.blocks[0].title | Key numbers | முக்கிய எண்கள் |
| $.result.stage.blocks[0].items[0].label | Royapuram | ராயபுரம் |
| $.result.stage.blocks[0].items[1].label | All areas together | எல்லாப் பகுதிகளும் சேர்த்து |
| $.result.stage.blocks[0].items[2].label | Royapuram's share | ராயபுரம் பங்கு |
| $.result.stage.blocks[1].title | Severe incidents | கடுமையான சம்பவங்கள் |
| $.result.stage.blocks[1].method | Severe incidents by zone, this week, as the console's zone table counts them. | கடுமையான சம்பவங்கள், மண்டல வாரியாக, இந்த வாரம், கன்சோலின் மண்டல அட்டவணைப்படி. |
| $.result.stage.blocks[1].items[0].sub | 16 severe · 135 open | 16 கடுமையானவை · 135 திறந்தவை |
| $.result.stage.blocks[1].items[1].sub | 9 severe · 54 open | 9 கடுமையானவை · 54 திறந்தவை |
| $.result.stage.blocks[1].items[2].sub | 7 severe · 97 open | 7 கடுமையானவை · 97 திறந்தவை |
| $.result.stage.blocks[1].items[3].sub | 5 severe · 72 open | 5 கடுமையானவை · 72 திறந்தவை |
| $.result.stage.blocks[1].items[4].sub | 4 severe · 110 open | 4 கடுமையானவை · 110 திறந்தவை |
| $.result.stage.blocks[2].title | Severe incidents by zone | கடுமையான சம்பவங்கள், மண்டல வாரியாக |
| $.result.stage.blocks[2].shade.label | Severe incidents | கடுமையான சம்பவங்கள் |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id f09bcf697432c0ab, 10836 bytes to 11688 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.title | Cases · Teynampet · Garbage & solid waste · this week | சம்பவங்கள் · தேனாம்பேட்டை · குப்பை மற்றும் திடக்கழிவு · இந்த வாரம் |
| $.result.stage.blocks[0].title | Key numbers | முக்கிய எண்கள் |
| $.result.stage.blocks[0].items[0].label | All cases, this week | எல்லா சம்பவங்கள், இந்த வாரம் |
| $.result.stage.blocks[0].items[1].label | Past their deadline | காலக்கெடு தாண்டியவை |
| $.result.stage.blocks[0].items[2].label | Held by Solid Waste Management | திடக்கழிவு மேலாண்மைத் துறை வசம் |
| $.result.stage.blocks[1].title | Cases · Teynampet · Garbage & solid waste · this week | சம்பவங்கள் · தேனாம்பேட்டை · குப்பை மற்றும் திடக்கழிவு · இந்த வாரம் |
| $.result.stage.blocks[2].title | Where they are | எங்கே உள்ளன |
| $.result.stage.blocks[2].rule | Numbered as in the list; cases without an exact place are not drawn. | பட்டியலில் உள்ளபடி எண்கள்; சரியான இடம் இல்லாத சம்பவங்கள் வரையப்படவில்லை. |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id f025856d46a1ca5f, 6165 bytes to 7063 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.title | Cases · Ambattur · Street lights & electrical hazards · this week | சம்பவங்கள் · அம்பத்தூர் · தெருவிளக்கு மற்றும் மின் ஆபத்துகள் · இந்த வாரம் |
| $.result.stage.blocks[0].title | Key numbers | முக்கிய எண்கள் |
| $.result.stage.blocks[0].items[0].label | All cases, this week | எல்லா சம்பவங்கள், இந்த வாரம் |
| $.result.stage.blocks[0].items[1].label | Past their deadline | காலக்கெடு தாண்டியவை |
| $.result.stage.blocks[0].items[2].label | Held by Street Lighting & Electrical | தெருவிளக்கு மற்றும் மின் துறை வசம் |
| $.result.stage.blocks[1].title | Cases · Ambattur · Street lights & electrical hazards · this week | சம்பவங்கள் · அம்பத்தூர் · தெருவிளக்கு மற்றும் மின் ஆபத்துகள் · இந்த வாரம் |
| $.result.stage.blocks[2].title | Where they are | எங்கே உள்ளன |
| $.result.stage.blocks[2].rule | Numbered as in the list; cases without an exact place are not drawn. | பட்டியலில் உள்ளபடி எண்கள்; சரியான இடம் இல்லாத சம்பவங்கள் வரையப்படவில்லை. |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id 9ef6d6c5b729a804, 3706 bytes to 3928 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.title | Reservoir storage | நீர்த்தேக்க இருப்பு |
| $.result.stage.blocks[0].title | Reservoir storage | நீர்த்தேக்க இருப்பு |
| $.result.stage.blocks[1].title | Stations | நிலையங்கள் |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round

Session ask, id ea1f39f6c1384abd, 1252 bytes to 1680 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.title | Velachery pakkathula hospital enga iruku? | சுகாதாரச் சேவைகள் மற்றும் மருத்துவமனைத் திறன், Velachery |
| $.result.stage.takeaway.ta | within 1 km of Velachery-la 13 hospitals irukku. |  |
| $.result.stage.say.ta | within 1 km of Velachery-la 13 hospitals irukku. | வரைபடத்தில் முடிவுகள் உள்ளன. |
| $.result.stage.blocks[0].text | Nothing in the data matches this, for this scope. | இந்தப் பார்வைக்குத் தரவில் எதுவும் பொருந்தவில்லை. |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |
| $.result.say | within 1 km of Velachery-la 13 hospitals irukku. | வரைபடத்தில் முடிவுகள் உள்ளன. |

### collector POST /api/collector/thunai/agent/round

Session ask, id a3c117ff746b0a57, 8219 bytes to 9033 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.title | Cases · Adyar · Drain works site safety · this week | சம்பவங்கள் · அடையாறு · வடிகால் பணியிடப் பாதுகாப்பு · இந்த வாரம் |
| $.result.stage.blocks[0].title | Key numbers | முக்கிய எண்கள் |
| $.result.stage.blocks[0].items[0].label | All cases, this week | எல்லா சம்பவங்கள், இந்த வாரம் |
| $.result.stage.blocks[0].items[1].label | Past their deadline | காலக்கெடு தாண்டியவை |
| $.result.stage.blocks[0].items[2].label | Held by Storm Water Drain | மழைநீர் வடிகால் துறை வசம் |
| $.result.stage.blocks[1].title | Cases · Adyar · Drain works site safety · this week | சம்பவங்கள் · அடையாறு · வடிகால் பணியிடப் பாதுகாப்பு · இந்த வாரம் |
| $.result.stage.blocks[2].title | Where they are | எங்கே உள்ளன |
| $.result.stage.blocks[2].rule | Numbered as in the list; cases without an exact place are not drawn. | பட்டியலில் உள்ளபடி எண்கள்; சரியான இடம் இல்லாத சம்பவங்கள் வரையப்படவில்லை. |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round (direct, sentence 0)

Session ask, id 15912c26bef9ca15, 15007 bytes to 15248 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round (direct, sentence 1)

Session ask, id a88392c79b867872, 3489 bytes to 3687 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round (direct, sentence 2)

Session ask, id 374abbf925411872, 7260 bytes to 7545 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round (direct, sentence 3)

Session ask, id 78433e1b88e12ccf, 4340 bytes to 5083 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.ta | கடந்த 30 நாட்களில் Ambattur, Madhavaram-ஐ விட 2 மடங்கு High. | கடந்த 30 நாட்களில் அம்பத்தூர், மாதவரம்-ஐ விட 2 மடங்கு அதிக முக்கியத்துவம். |
| $.result.stage.say.ta | அம்பத்தூர்: 0 கடுமையான, 3 திறந்தவை. மாதவரம்: 0 கடுமையான, 2 திறந்தவை. பெரிய வேறுபாடு High: Ambattur 2, Madhavaram 1. | அம்பத்தூர்: 0 கடுமையான, 3 திறந்தவை. மாதவரம்: 0 கடுமையான, 2 திறந்தவை. பெரிய வேறுபாடு அதிக முக்கியத்துவம்: அம்பத்தூர் 2, மாதவரம் 1. |
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 1] |

### collector POST /api/collector/thunai/agent/round (direct, sentence 5)

Session ask, id 04eb4463a66d39c9, 2694 bytes to 2884 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round (direct, sentence 6)

Session ask, id 224b008e8bbe8b08, 4047 bytes to 4491 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.say.en | 2 incidents this week against 4 the period before (down 50%). Mainly: 2 open incidents are past their deadline; the busiest spot is K.K. Nag... (169 chars) | 2 incidents this week against 4 the period before (down 50%). Mainly: 2 open incidents are past their deadline; the busiest spot is K.K. Nag... (218 chars) |
| $.result.stage.say.ta | இந்த வாரம் 2 சம்பவங்கள், முந்தைய காலத்தில் 4. 2 காலக்கெடு தாண்டியவை; அதிக இடம் K.K. Nagar (1). | இந்த வாரம் 2 சம்பவங்கள், முந்தைய காலத்தில் 4. 2 காலக்கெடு தாண்டியவை; அதிக இடம் K.K. Nagar (1). ரெண்டு சம்பவங்கள் தான், அதனால பெருசா எடுத்துக... (152 chars) |
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |
| $.result.say | 2 incidents this week against 4 the period before (down 50%). Mainly: 2 open incidents are past their deadline; the busiest spot is K.K. Nag... (169 chars) | 2 incidents this week against 4 the period before (down 50%). Mainly: 2 open incidents are past their deadline; the busiest spot is K.K. Nag... (218 chars) |

### collector POST /api/collector/thunai/agent/round (direct, sentence 8)

Session ask, id be3f567754865da5, 3529 bytes to 3653 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round (direct, sentence 9)

Session ask, id fe4f72a16d13d08f, 1107 bytes to 1205 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.ta | 13 hospitals within 1 km of Velachery. |  |
| $.result.stage.say.ta | 13 hospitals within 1 km of Velachery. | வரைபடத்தில் முடிவுகள் உள்ளன. |
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round (direct, sentence 10)

Session ask, id 72847463243eb5f3, 3902 bytes to 4028 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round (direct, sentence 12)

Session ask, id 555df8086cdb06ba, 3807 bytes to 4072 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round (direct, sentence 17)

Session ask, id a1cc51848f7bb9a1, 15855 bytes to 16125 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.blocks[0].title | Key numbers | முக்கிய எண்கள் |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round (direct, sentence 18)

Session ask, id 93bf66819951ca90, 3648 bytes to 4540 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.title | Top 5 · Severe incidents · this week | முதல் 5 · கடுமையான சம்பவங்கள் · இந்த வாரம் |
| $.result.stage.blocks[0].title | Key numbers | முக்கிய எண்கள் |
| $.result.stage.blocks[0].items[0].label | Royapuram | ராயபுரம் |
| $.result.stage.blocks[0].items[1].label | All areas together | எல்லாப் பகுதிகளும் சேர்த்து |
| $.result.stage.blocks[0].items[2].label | Royapuram's share | ராயபுரம் பங்கு |
| $.result.stage.blocks[1].title | Severe incidents | கடுமையான சம்பவங்கள் |
| $.result.stage.blocks[1].method | Severe incidents by zone, this week, as the console's zone table counts them. | கடுமையான சம்பவங்கள், மண்டல வாரியாக, இந்த வாரம், கன்சோலின் மண்டல அட்டவணைப்படி. |
| $.result.stage.blocks[1].items[0].sub | 16 severe · 135 open | 16 கடுமையானவை · 135 திறந்தவை |
| $.result.stage.blocks[1].items[1].sub | 9 severe · 54 open | 9 கடுமையானவை · 54 திறந்தவை |
| $.result.stage.blocks[1].items[2].sub | 7 severe · 97 open | 7 கடுமையானவை · 97 திறந்தவை |
| $.result.stage.blocks[1].items[3].sub | 5 severe · 72 open | 5 கடுமையானவை · 72 திறந்தவை |
| $.result.stage.blocks[1].items[4].sub | 4 severe · 110 open | 4 கடுமையானவை · 110 திறந்தவை |
| $.result.stage.blocks[2].title | Severe incidents by zone | கடுமையான சம்பவங்கள், மண்டல வாரியாக |
| $.result.stage.blocks[2].shade.label | Severe incidents | கடுமையான சம்பவங்கள் |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round (direct, sentence 19)

Session ask, id 61ed15dc04e17ba5, 11290 bytes to 11604 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.blocks[0].title | Key numbers | முக்கிய எண்கள் |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round (direct, sentence 20)

Session ask, id f0ed9bee243901b3, 5972 bytes to 6310 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.blocks[0].title | Key numbers | முக்கிய எண்கள் |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round (direct, sentence 22)

Session ask, id 75892bd131e3b8c5, 3622 bytes to 3844 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.title | Reservoir storage | நீர்த்தேக்க இருப்பு |
| $.result.stage.blocks[0].title | Reservoir storage | நீர்த்தேக்க இருப்பு |
| $.result.stage.blocks[1].title | Stations | நிலையங்கள் |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round (follow-on)

Session ask, id f8461f953dc4cad9, 15083 bytes to 15324 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round (follow-on)

Session ask, id 507ff072d9b4a836, 5824 bytes to 6242 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.takeaway.ta | Street lights & electrical hazards அதிகம் உயர்ந்தது: 3, முன்பு 0. | தெருவிளக்கு மற்றும் மின் ஆபத்துகள் அதிகம் உயர்ந்தது: 3, முன்பு 0. |
| $.result.stage.say.ta | கடந்த 24 மணி நேரத்தில் 24 சம்பவங்கள், முந்தைய காலத்தில் 14. Street lights & electrical hazards 3 கூடியது, Drainage & sewage 2 கூடியது, Theft... (205 chars) | கடந்த 24 மணி நேரத்தில் 24 சம்பவங்கள், முந்தைய காலத்தில் 14. தெருவிளக்கு மற்றும் மின் ஆபத்துகள் 3 கூடியது, வடிகால் மற்றும் கழிவுநீர் 2 கூடியத... (220 chars) |
| $.result.stage.lang | (absent) | en |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector POST /api/collector/thunai/agent/round (follow-on)

Session ask, id a3a0280ab58d2130, 15983 bytes to 16253 bytes.

| Path | A | B |
|---|---|---|
| $.result.stage.blocks[0].title | Key numbers | முக்கிய எண்கள் |
| $.result.stage.lang | (absent) | ta |
| $.result.stage.titles | (absent) | {object with 2 keys} |
| $.result.stage.notesBi | (absent) | [array of 0] |

### collector GET /api/collector/search?q=<new-complaint-code-1>

Session writes, id cd47878c4defdb30, 1251 bytes to 1252 bytes.

| Path | A | B |
|---|---|---|
| $.incidents[0].lat | 13.01596568627451 | 13.015746078431373 |
| $.incidents[0].lon | 80.20999249019607 | 80.21069837254902 |

### collector GET /api/collector/overview

Session writes, id ea0ab3f25bc17c26, 235191 bytes to 235192 bytes.

| Path | A | B |
|---|---|---|
| $.severity.rows[32].lat | 13.01596568627451 | 13.015746078431373 |
| $.severity.rows[32].lon | 80.20999249019607 | 80.21069837254902 |

### collector GET /api/collector/overview?period=weekly&zone=13

Session writes, id 3f54c3ecc14de285, 139122 bytes to 139124 bytes.

| Path | A | B |
|---|---|---|
| $.map.pins[64].lat | 13.01596568627451 | 13.015746078431373 |
| $.map.pins[64].lon | 80.20999249019607 | 80.21069837254902 |
| $.severity.rows[27].lat | 13.01596568627451 | 13.015746078431373 |
| $.severity.rows[27].lon | 80.20999249019607 | 80.21069837254902 |

### collector POST /api/collector/thunai/memory

Session writes, id 2055d0c48e9a7302, 180 bytes to 201 bytes.
- status: 200 to 403

| Path | A | B |
|---|---|---|
| $.notes | [array of 1] | (absent) |
| $.habits | {object with 0 keys} | (absent) |
| $.pending | {object with 0 keys} | (absent) |
| $.prefs | {object with 0 keys} | (absent) |
| $.reminders | [array of 0] | (absent) |
| $.recent | [array of 0] | (absent) |
| $.pins | [array of 0] | (absent) |
| $.error | (absent) | That needs your yes first. |
| $.needsYes | (absent) | true |
| $.reply | (absent) | {object with 2 keys} |

### collector GET /api/collector/thunai/memory

Session writes, id a95b5799769ae086, 180 bytes to 85 bytes.

| Path | A | B |
|---|---|---|
| $.notes.length | 1 | 0 |
| $.notes[0] | {object with 3 keys} | (absent) |

### collector GET /api/collector/studio/<dataset-1>?export=csv

Session writes, id d7a191781f17de43, 185 bytes to 185 bytes.

| Path | A | B |
|---|---|---|
| $.confirm.scope | 1wfcCyqG0tRlWsR6QfUsSyN85y0zmynT | 3Ji_P6WgOEUSWVwaqomWnYD_zZ0ksl9B |

### collector GET /api/collector/studio/<dataset-1>?export=xlsx

Session writes, id be094a0c735be649, 188 bytes to 188 bytes.

| Path | A | B |
|---|---|---|
| $.confirm.scope | 9HNmUU5dObht-lldN0rgspM-_0IgZ1xY | aUB-JhMU3T8qg6ue9gyAkaMxKFcMd3m2 |

### collector GET /api/collector/studio/<dataset-1>?f=[{"col"%3A"c0"%2C"op"%3A"neq"%2C"values"%3A["no such value"]}]&export=csv

Session writes, id a91af3219ee7b0a3, 185 bytes to 185 bytes.

| Path | A | B |
|---|---|---|
| $.confirm.scope | B4hyM3nVSIdmHMBgb1M_LQqBxB9Phm2n | DsxupLJ5cgvsJX1_lVf-7b4JfukGZFgj |

