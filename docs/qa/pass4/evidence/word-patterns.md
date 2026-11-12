# Word pattern audit (pass 4)

Made by tests/qa/pass4/word-pattern-audit.mjs. A mid-word hit starts inside a longer word. "extends" only ends inside one (often a fine stem match).

```json
{
 "files": 91,
 "regexes": 1380,
 "regexes_not_compiled": 0,
 "includes_matchers": 38,
 "keyword_lists": 447,
 "patterns_run": 1185,
 "shape_regexes_skipped": 646,
 "corpus": {
  "title": 15285,
  "category": 35,
  "place": 8614,
  "adversarial": 119
 },
 "patterns_with_mid_word_hits": 261,
 "patterns_with_mid_word_hits_on_real_data": 237
}
```

## Mid-word matches (worst first, real data first)

- `src/lib/thunai/lexicon.ts:76` list [tree, trees, tree fall, fallen trees, மரம், மரங்கள்] : 13830 hits
  - "tree" x13830, e.g. [title] Drain works site safety – Karunanithi Nagar I Street, Karunanithi Nagar, Kottur
- `src/lib/thunai/screens.ts:218` regex /power|electric|tree/ : 13830 hits
  - "tree" x13830, e.g. [title] Drain works site safety – Karunanithi Nagar I Street, Karunanithi Nagar, Kottur
- `src/lib/assistant/lang.ts:66` list [la, le, ku, kku, nu, nnu, oda, ode, ...] : 2505 hits
  - "varam" x962, e.g. [title] Flooding & waterlogging – Ponniammanmedu-Madhavaram
  - "anda" x606, e.g. [title] Drain works site safety – Mount Poothamalli Salai, Mount Poothamalli Salai, Nandambakkam
  - "unga" x605, e.g. [title] Drainage & sewage – Kodungaiyur (Kodungaiyur Canal)
  - "inda" x248, e.g. [title] Garbage & solid waste – Chindambaram Nagar, 3Rd Lane, Old Washermenpet, Basin Bridge
- `src/lib/assistant/lang.ts:44` list [enna, yenna, ennaa, evlo, evalo, evvalo, evvalavu, evalavu, ...] : 2117 hits
  - "illa" x497, e.g. [title] Street lights & electrical hazards – Muniyapillai Lane, Pudupet, Pudupet
  - "illai" x364, e.g. [title] Street lights & electrical hazards – Muniyapillai Lane, Pudupet, Pudupet
  - "antha" x296, e.g. [title] Garbage & solid waste – Santhappa Street, Thattangulam, Choolai
  - "enna" x287, e.g. [title] Water Resources Dept. steps up estuary dredging in Chennai to improve flood water discharg
- `src/lib/thunai/quick.ts:131` list [chennai, madras, district, zone, zones, ward, wards, taluk, ...] : 1908 hits
  - "rain" x1725, e.g. [title] Drain works site safety – Karunanithi Nagar I Street, Karunanithi Nagar, Kottur
  - "road" x129, e.g. [title] Other / unclassified – Thiruvotriyur Highroad (Railway Quarters), Vallalar Nagar, Basin Br
  - "ward" x11, e.g. [title] Street lights & electrical hazards – Edward Park Street, Kosapet, Kosapet
  - "சாலை" x8, e.g. [title] திருச்சி-சென்னை தேசிய நெடுஞ்சாலையில் அரசு பஸ் கவிழ்ந்து விபத்து: 3 பேர் படுகாயம்
- `src/lib/thunai/quick.ts:108` list [rain, rainfall, raining, மழை, mazhai, malai] : 1904 hits
  - "rain" x1725, e.g. [title] Drain works site safety – Karunanithi Nagar I Street, Karunanithi Nagar, Kottur
  - "malai" x172, e.g. [title] Garbage & solid waste – Thirumalai Priya Nagar Velmurugan St, Thirumalai Priya Nagar, Pudu
  - "மழை" x6, e.g. [title] வடகிழக்கு பருவமழை தொடங்க உள்ளதால் மழைநீர் வடிகால் பணிகளை விரைந்து முடிக்க வேண்டும் | Dinak
  - "raining" x1, e.g. [title] Gem Granites Veeramani case: Chennai Police issue LOC restraining five suspects from leavi
- `src/lib/thunai/stagelocal.ts:186` regex /rain|reservoir|lake|full|மழை|ஏரி|நீர்|air|aqi|காற்று/ : 1785 hits
  - "rain" x1725, e.g. [title] Drain works site safety – Karunanithi Nagar I Street, Karunanithi Nagar, Kottur
  - "நீர்" x54, e.g. [title] சென்னை அண்ணா நகரில் மழைநீர் வடிகால் பள்ளத்தில் விழுந்து பெண் பலி!
  - "மழை" x6, e.g. [title] வடகிழக்கு பருவமழை தொடங்க உள்ளதால் மழைநீர் வடிகால் பணிகளை விரைந்து முடிக்க வேண்டும் | Dinak
- `src/lib/thunai/agent.ts:268` list [flood, water, rain, thanni, வெள்ள, தண்ணீர்] : 1745 hits
  - "rain" x1725, e.g. [title] Drain works site safety – Karunanithi Nagar I Street, Karunanithi Nagar, Kottur
  - "thanni" x12, e.g. [title] Garbage & solid waste – Nallathanni Odai Kuppam, Nallathanni Odai Kuppam, Rajakadai
  - "water" x7, e.g. [title] Chennai: Sewage Mixes with Rainwater, Overflows on GST Road
  - "வெள்ள" x1, e.g. [title] நேபாள பெருவெள்ளம்: தமிழக யாத்ரீகர்கள் 85 பேர் தொடர்பாக தகவல் எதுவும் இல்லை: உறவினர்கள் வேத
- `src/lib/assistant/guard.ts:149` regex /rain|மழை/ : 1731 hits
  - "rain" x1725, e.g. [title] Drain works site safety – Karunanithi Nagar I Street, Karunanithi Nagar, Kottur
  - "மழை" x6, e.g. [title] வடகிழக்கு பருவமழை தொடங்க உள்ளதால் மழைநீர் வடிகால் பணிகளை விரைந்து முடிக்க வேண்டும் | Dinak
- `src/lib/assistant/datasets.ts:409` list [label, n, delta, open, severe, rain] : 1727 hits
  - "rain" x1725, e.g. [title] Drain works site safety – Karunanithi Nagar I Street, Karunanithi Nagar, Kottur
  - "open" x2, e.g. [adversarial] reopened
- `src/lib/thunai/screens.ts:20` list [rain, aqi, lakes, temp, humidity] : 1726 hits
  - "rain" x1725, e.g. [title] Drain works site safety – Karunanithi Nagar I Street, Karunanithi Nagar, Kottur
  - "temp" x1, e.g. [title] Chennai: 6 juveniles held for attempted murder in Kasimedu
- `src/lib/thunai/screens.ts:22` list [rain, aqi, lakes, temp, zone_severe, zone_open, zone_incidents, zone_complaints, ...] : 1726 hits
  - "rain" x1725, e.g. [title] Drain works site safety – Karunanithi Nagar I Street, Karunanithi Nagar, Kottur
  - "temp" x1, e.g. [title] Chennai: 6 juveniles held for attempted murder in Kasimedu
- `src/lib/assistant/pipeline.ts:721` regex /rain|aqi|air|lake|reservoir|bed|hospital|temperature|humid|gauge|inflow|weather/i : 1725 hits
  - "rain" x1725, e.g. [title] Drain works site safety – Karunanithi Nagar I Street, Karunanithi Nagar, Kottur
- `src/lib/thunai/gloss.ts:63` list [pakkathula, pakkam, பக்கத்துல, பக்கம், அருகில்] : 1077 hits
  - "pakkam" x1077, e.g. [title] Garbage & solid waste – Aazhkandeswarar Nagar Main Road, Arignar Anna Nagar Iv Street, Tho
- `src/lib/thunai/gloss.ts:28` list [vaaram, varam, வாரம்] : 962 hits
  - "varam" x962, e.g. [title] Flooding & waterlogging – Ponniammanmedu-Madhavaram
- `src/lib/assistant/lang.ts:79` list [than, china, nan] : 908 hits
  - "than" x846, e.g. [title] Garbage & solid waste – A'Sathananddhapuram, Sathanandhapuram, Kaladipet
  - "china" x62, e.g. [title] Air pollution – Thiruchinankuppam I Block, Thiruchinankuppam, Rajakadai
- `src/lib/thunai/lexicon.ts:162` list [no, not, illa, illai, இல்ல, இல்லை, வேண்டாம், vendaam, ...] : 861 hits
  - "illa" x497, e.g. [title] Street lights & electrical hazards – Muniyapillai Lane, Pudupet, Pudupet
  - "illai" x364, e.g. [title] Street lights & electrical hazards – Muniyapillai Lane, Pudupet, Pudupet
- `src/lib/thunai/telemetry.ts:10` list [event, ms, provider, model, tokens, lane, round, calls, ...] : 624 hits
  - "round" x516, e.g. [title] Trees, parks & playgrounds – Water Tank Road, Natarajapuram, Aminjikarai
  - "lang" x88, e.g. [title] Flooding & waterlogging – 10Th Block Elango Salai 2Nd Cross Street, Mugappair, 7H Bus Stan
  - "lane" x10, e.g. [title] Drainage & sewage – Asirvadapuram1Stlane, Asirvatha Puram, Broadway
  - "turn" x6, e.g. [title] Chennai Citizen Connect: Sewage overflow keeps returning to GST Road junction
- `src/lib/assistant/tools.ts:221` list [what, this, that, case, incident, tell, about, more, ...] : 543 hits
  - "enna" x287, e.g. [title] Water Resources Dept. steps up estuary dredging in Chennai to improve flood water discharg
  - "more" x150, e.g. [title] Theft, snatching & fraud – Egmore
  - "pathi" x81, e.g. [title] Trees, parks & playgrounds – Then Thirupathi Street, Near Dav Girls School, Mugappair
  - "ward" x11, e.g. [title] Street lights & electrical hazards – Edward Park Street, Kosapet, Kosapet
- `src/lib/assistant/tools.ts:69` list [severe, serious, critical, high, medium, minor, major, open, ...] : 498 hits
  - "enna" x287, e.g. [title] Water Resources Dept. steps up estuary dredging in Chennai to improve flood water discharg
  - "pathi" x81, e.g. [title] Trees, parks & playgrounds – Then Thirupathi Street, Near Dav Girls School, Mugappair
  - "intha" x46, e.g. [title] Drainage & sewage – Sigirinthapalayam 5Th Street, Sigirinthapalayam, Korukkupet
  - "change" x26, e.g. [title] Garbage & solid waste – Tiny Sector Sidco Indl. Estate, Telephone Exchange, Pattaravakkam
- `src/lib/assistant/catalog.ts:405` list [url, auth, login_url, user_field, pass_field, username, secret_enc, session_enc, ...] : 477 hits
  - "auth" x477, e.g. [title] Encroachment & unauthorised construction – Mathew Cross Street, Near Div.Office, Kathirved
- `src/lib/assistant/datasets.ts:236` regex /report|new|rise|trend/i : 477 hits
  - "rise" x477, e.g. [title] Encroachment & unauthorised construction – Mathew Cross Street, Near Div.Office, Kathirved
- `src/lib/assistant/pipeline.ts:723` regex /spike|unusual|anomal|rise/i : 477 hits
  - "rise" x477, e.g. [title] Encroachment & unauthorised construction – Mathew Cross Street, Near Div.Office, Kathirved
- `src/lib/thunai/entities.ts:32` list [greater, chennai, city, madras, metro, metropolitan, the, our, ...] : 302 hits
  - "city" x301, e.g. [title] Health services & hospital capacity – Government Peripheral Hospital Anna Nagar
  - "local" x1, e.g. [title] #BreakingNews | மின்சார ரயில் தடம் புரண்டு விபத்து #Chennai | #ChennaiLocalTrain | #Suburb
- `src/lib/thunai/plan.ts:326` regex /\b(why|how|what|which|who|when|where|compare|versus|vs|trend|rising|falling|most|least|top|worst|best|count|number of|summar|explain|analy|tell me|is there|are : 297 hits
  - "enna" x287, e.g. [title] Water Resources Dept. steps up estuary dredging in Chennai to improve flood water discharg
  - "யார்" x10, e.g. [title] புழல் காவாங்கரை தனியார் மீன் மார்க்கெட்டால் தேசிய நெடுஞ்சாலையில் போக்குவரத்து நெரிசல்: வாக
- `src/lib/thunai/gloss.ts:31` list [enna, என்ன, என்னென்ன] : 287 hits
  - "enna" x287, e.g. [title] Water Resources Dept. steps up estuary dredging in Chennai to improve flood water discharg
- `src/lib/thunai/privacy.ts:52` regex /(per|peru|address|number|enna|kuduthadhu|pannadhu)/i : 287 hits
  - "enna" x287, e.g. [title] Water Resources Dept. steps up estuary dredging in Chennai to improve flood water discharg
- `src/lib/thunai/gloss.ts:14` list [padi, padinga, படி] : 253 hits
  - "padi" x247, e.g. [title] Roads, footpaths & bridges – B Kalayanapuram 5Th Street, B Kalayanapuram, Vyasarpadi
  - "படி" x6, e.g. [title] வடகிழக்குப் பருவமழை இன்று தொடக்கம்:சென்னை மற்றும் தமிழகத்தில் அடுத்த 2 வாரங்களுக்கு மழை எப
- `src/lib/assistant/studiolink.ts:21` list [complaint, grievance, incident, news, issue, civic, flood, flooding, ...] : 229 hits
  - "road" x129, e.g. [title] Other / unclassified – Thiruvotriyur Highroad (Railway Quarters), Vallalar Nagar, Basin Br
  - "rate" x49, e.g. [title] Unsafe buildings & walls – George Town (Collectorate Building, Rajaji Salai)
  - "street" x16, e.g. [title] Public toilets & open defecation – Kavarai 5Thstreet, Nageshwara Road, Vanagaram Road
  - "ward" x11, e.g. [title] Street lights & electrical hazards – Edward Park Street, Kosapet, Kosapet
- `src/lib/thunai/gloss.ts:12` list [kaattu, kaatu, kattu, kaminga, காட்டு, காமி] : 202 hits
  - "kattu" x202, e.g. [title] Tax, certificates & electoral services – Munuswamy Street, Ekkattuthangal, Ekkattuthangal
- `src/lib/thunai/fixture.ts:37` list [t nagar, thyagaraya nagar, தி.நகர்] : 191 hits
  - "t nagar" x191, e.g. [title] Encroachment & unauthorised construction – Besant Nagar 19Th Cross Street, Adayar, Adayar
- `src/lib/thunai/gloss.ts:15` list [mazhai, mazha, malai, மழை] : 178 hits
  - "malai" x172, e.g. [title] Garbage & solid waste – Thirumalai Priya Nagar Velmurugan St, Thirumalai Priya Nagar, Pudu
  - "மழை" x6, e.g. [title] வடகிழக்கு பருவமழை தொடங்க உள்ளதால் மழைநீர் வடிகால் பணிகளை விரைந்து முடிக்க வேண்டும் | Dinak
- `src/lib/assistant/pipeline.ts:517` regex /\b(there|that (zone|area|place|taluk)|same (zone|area|place|taluk)|this (zone|area)|over there|which (one|of (these|them|those))|among (these|them|those)|of (t : 148 hits
  - "anga" x148, e.g. [title] Drain works site safety – Ranga Avenue 1St Street, Ranga Avenue, Kathirvedu
- `src/lib/thunai/agent.ts:269` list [road, pothole, சாலை] : 137 hits
  - "road" x129, e.g. [title] Other / unclassified – Thiruvotriyur Highroad (Railway Quarters), Vallalar Nagar, Basin Br
  - "சாலை" x8, e.g. [title] திருச்சி-சென்னை தேசிய நெடுஞ்சாலையில் அரசு பஸ் கவிழ்ந்து விபத்து: 3 பேர் படுகாயம்
- `src/lib/thunai/lexicon.ts:68` list [road, roads, pothole, potholes, road damage, footpath, சாலை, பள்ளம், ...] : 137 hits
  - "road" x129, e.g. [title] Other / unclassified – Thiruvotriyur Highroad (Railway Quarters), Vallalar Nagar, Basin Br
  - "சாலை" x8, e.g. [title] திருச்சி-சென்னை தேசிய நெடுஞ்சாலையில் அரசு பஸ் கவிழ்ந்து விபத்து: 3 பேர் படுகாயம்
- `src/lib/thunai/plan.ts:324` regex /\b(go|goto|open|switch|change|set|filter|navigate|take me|bring|move|select|pick|turn (on|off)|apply|put|jump|zoom|clear|reset|remove the filter|close|hide|onl : 134 hits
  - "thira" x129, e.g. [title] Health services & hospital capacity – Sudanthirapuram, Sudanthirapuram, Rajakadai
  - "திற" x5, e.g. [title] சென்னை பட்டினம் பாக்கம் பகுதியில் கட்ட உள்ள தலைமைச் செயலகத்திற்கு எதிர்ப்பு தெரிவித்து மெர
- `src/lib/thunai/stagelocal.ts:70` regex /(திற|thira|thirandhu|open pannu)/ : 134 hits
  - "thira" x129, e.g. [title] Health services & hospital capacity – Sudanthirapuram, Sudanthirapuram, Rajakadai
  - "திற" x5, e.g. [title] சென்னை பட்டினம் பாக்கம் பகுதியில் கட்ட உள்ள தலைமைச் செயலகத்திற்கு எதிர்ப்பு தெரிவித்து மெர
- `src/lib/thunai/screens.ts:217` regex /road|pothole|traffic/ : 129 hits
  - "road" x129, e.g. [title] Other / unclassified – Thiruvotriyur Highroad (Railway Quarters), Vallalar Nagar, Basin Br
- `src/lib/assistant/intent.ts:326` list [people, persons, workers, road] : 129 hits
  - "road" x129, e.g. [title] Other / unclassified – Thiruvotriyur Highroad (Railway Quarters), Vallalar Nagar, Basin Br
- `src/lib/thunai/plan.ts:20` list [page, period, view, clearFilters, panel, mapMode, layer, item, ...] : 107 hits
  - "lang" x88, e.g. [title] Flooding & waterlogging – 10Th Block Elango Salai 2Nd Cross Street, Mugappair, 7H Bus Stan
  - "view" x13, e.g. [title] Stray animals – Riverview Residency 3Rd Street Extension, Riverview Residency, Karapakkam
  - "mission" x3, e.g. [title] Road accidents claimed 346 lives in Chennai this year: Commissioner
  - "close" x2, e.g. [adversarial] disclosed
- `src/lib/thunai/gloss.ts:65` list [vandha, vantha, வந்தா, வந்தால்] : 96 hits
  - "vantha" x96, e.g. [title] Tax, certificates & electoral services – Nehru Colony Main Road, Palavanthangal, Nanganall
- `src/lib/thunai/lexicon.ts:14` list [royapuram, rayapuram, royapuram zone] : 96 hits
  - "rayapuram" x96, e.g. [title] Drain works site safety – Thiyagarayapuram 11Th Cross Street, Thiyagarayapuram, Kaladipet
- `src/lib/thunai/plan.ts:311` list [page, close, theme, mode, lang, mapMode, layer, scroll, ...] : 90 hits
  - "lang" x88, e.g. [title] Flooding & waterlogging – 10Th Block Elango Salai 2Nd Cross Street, Mugappair, 7H Bus Stan
  - "close" x2, e.g. [adversarial] disclosed
- `src/lib/assistant/edits.ts:19` list [show, it, this, that, them, these, on, the, ...] : 90 hits
  - "change" x26, e.g. [title] Garbage & solid waste – Tiny Sector Sidco Indl. Estate, Telephone Exchange, Pattaravakkam
  - "heat" x26, e.g. [title] Drainage & sewage – Erikarai Street, Rakki Theatre, Ambattur O.T
  - "view" x13, e.g. [title] Stray animals – Riverview Residency 3Rd Street Extension, Riverview Residency, Karapakkam
  - "line" x9, e.g. [title] Water supply to north Chennai areas affected; work in progress to repair burst in major pi
- `src/lib/thunai/gloss.ts:32` list [enga, engey, எங்க, எங்கே] : 69 hits
  - "enga" x69, e.g. [title] Roads, footpaths & bridges – Thriuvengadam Street, Periamet, Vepery
- `src/lib/thunai/quick.ts:114` list [where, எங்கே, எங்கு, enga, engey] : 69 hits
  - "enga" x69, e.g. [title] Roads, footpaths & bridges – Thriuvengadam Street, Periamet, Vepery
- `src/lib/assistant/intent.ts:191` list [where, location, which area, which place, exact place, எங்கே, enga] : 69 hits
  - "enga" x69, e.g. [title] Roads, footpaths & bridges – Thriuvengadam Street, Periamet, Vepery
- `src/lib/thunai/gloss.ts:17` list [thanni, thanneer, tanni, தண்ணி, தண்ணீர், நீர்] : 68 hits
  - "நீர்" x54, e.g. [title] சென்னை அண்ணா நகரில் மழைநீர் வடிகால் பள்ளத்தில் விழுந்து பெண் பலி!
  - "thanni" x12, e.g. [title] Garbage & solid waste – Nallathanni Odai Kuppam, Nallathanni Odai Kuppam, Rajakadai
  - "tanni" x2, e.g. [title] Theft, snatching & fraud – Britannia Junction
- `src/lib/assistant/pipeline.ts:1428` regex /personal|phone|address|aadhaa?r|name/i : 66 hits
  - "phone" x42, e.g. [title] Garbage & solid waste – Tiny Sector Sidco Indl. Estate, Telephone Exchange, Pattaravakkam
  - "name" x24, e.g. [title] Garbage & solid waste – K P Park Tnscb Tenament27Th. Block, Pulianthope, Pulianthope
- `src/lib/assistant/pipeline.ts:1686` regex /personal|phone|address|aadhaa?r|name/i : 66 hits
  - "phone" x42, e.g. [title] Garbage & solid waste – Tiny Sector Sidco Indl. Estate, Telephone Exchange, Pattaravakkam
  - "name" x24, e.g. [title] Garbage & solid waste – K P Park Tnscb Tenament27Th. Block, Pulianthope, Pulianthope
- `src/lib/assistant/datasets.ts:258` list [part, reported, reported_prev, open, severe, high, complaints, top_zone, ...] : 65 hits
  - "part" x63, e.g. [title] Street lights & electrical hazards – Roobam Apartments, Near Dav Girls School, Mugappair
  - "open" x2, e.g. [adversarial] reopened
- `src/lib/thunai/normalise.ts:48` list [zone, ward, confirm, click, back, undo, filter, to, ...] : 64 hits
  - "press" x50, e.g. [title] Violent crime – Express Avenue Mall
  - "ward" x11, e.g. [title] Street lights & electrical hazards – Edward Park Street, Kosapet, Kosapet
  - "உறுதி" x1, e.g. [title] சென்னையில் ஒரே நாளில் 50 பேருக்கு டெங்குஉறுதி- 2,000-ஐ கடந்த பாதிப்பு?
  - "back" x1, e.g. [title] Vehicles Tailback on Chennai-Tiruchy NH as Lakhs Return After Holidays
- `src/lib/assistant/intent.ts:164` list [news, headline, headlines, press, media, newspaper, newspapers, reported in the news, ...] : 59 hits
  - "press" x50, e.g. [title] Violent crime – Express Avenue Mall
  - "news" x5, e.g. [title] அமைச்சர் ஜெகதீஸ்வரியின் கார் மோதி இளைஞர் பலி! #Minister #Jagadeeswari #Car #Accident #chen
  - "story" x3, e.g. [title] Five Men Hack History-Sheeter In Chennai To Death Over Murder In 2009
  - "செய்தி" x1, e.g. [title] சென்னைக்கு நற்செய்தி! 3 நாள்களில் வடகிழக்கு பருவமழை!
- `src/lib/thunai/gloss.ts:29` list [maasam, masam, மாசம், மாதம், மாச] : 53 hits
  - "masam" x53, e.g. [title] Health services & hospital capacity – Ramasamy Raja Street, Sandror Palayam, Aminjikarai
- `src/lib/assistant/tools.ts:58` list [this, that, these, those, week, weeks, month, months, ...] : 50 hits
  - "have" x22, e.g. [title] Dark spots & public safety – V.G.N.Shanthi Nagar Mahaveer Gandhi St.,, V.G.N.Shanthi Nagar
  - "list" x10, e.g. [title] Garbage & solid waste – Journalist Colony 3Rd Lane, Journalist Colony, Thiruvanmiyur
  - "this" x6, e.g. [title] Garbage & solid waste – V.G.N.Shanthi Nagar Prathish St.,, V.G.N.Shanthi Nagar, Ambattur
  - "case" x4, e.g. [title] Red suitcase murder: CCTV trail leads cops to Chennai house, gruesome evidence emerges
- `src/lib/thunai/quick.ts:103` list [rate, rates, cost, ரேட்] : 49 hits
  - "rate" x49, e.g. [title] Unsafe buildings & walls – George Town (Collectorate Building, Rajaji Salai)
- `src/lib/thunai/quick.ts:204` regex /(price|rate|cost|விலை|vilai|எவ்வளவு|evvalavu|how much)/ : 49 hits
  - "rate" x49, e.g. [title] Unsafe buildings & walls – George Town (Collectorate Building, Rajaji Salai)
- `src/lib/assistant/verify.ts:73` regex /pct|percent|share|rate|%|occupancy/ : 49 hits
  - "rate" x49, e.g. [title] Unsafe buildings & walls – George Town (Collectorate Building, Rajaji Salai)
- `src/lib/assistant/studiolink.ts:18` list [chennai, data, list, details, daily, sample, corporation, public, ...] : 46 hits
  - "name" x24, e.g. [title] Garbage & solid waste – K P Park Tnscb Tenament27Th. Block, Pulianthope, Pulianthope
  - "list" x10, e.g. [title] Garbage & solid waste – Journalist Colony 3Rd Lane, Journalist Colony, Thiruvanmiyur
  - "tamil" x8, e.g. [title] Garbage & solid waste – Kannitamil Street, B.V. Nagar, Nanganallur
  - "date" x3, e.g. [title] Rain lashes Chennai, leaves streets inundated
- `src/lib/assistant/catalog.ts:401` list [officer_name, phone, email, taluk_codes_covered] : 42 hits
  - "phone" x42, e.g. [title] Garbage & solid waste – Tiny Sector Sidco Indl. Estate, Telephone Exchange, Pattaravakkam
- `src/lib/assistant/pipeline.ts:193` list [what, whats, happening, happened, that, this, about, tell, ...] : 37 hits
  - "have" x22, e.g. [title] Dark spots & public safety – V.G.N.Shanthi Nagar Mahaveer Gandhi St.,, V.G.N.Shanthi Nagar
  - "this" x6, e.g. [title] Garbage & solid waste – V.G.N.Shanthi Nagar Prathish St.,, V.G.N.Shanthi Nagar, Ambattur
  - "news" x5, e.g. [title] அமைச்சர் ஜெகதீஸ்வரியின் கார் மோதி இளைஞர் பலி! #Minister #Jagadeeswari #Car #Accident #chen
  - "event" x4, e.g. [title] Unsafe buildings & walls – Guindy (King Institute of Preventive Medicine)
- `src/lib/thunai/outside.ts:7` list [tambaram, avadi, pallavaram, chromepet, selaiyur, medavakkam, poonamallee, tiruvallur, ...] : 36 hits
  - "avadi" x30, e.g. [title] Roads, footpaths & bridges – Kamaraj Nagar10Th Street, Chavadi Street, Korattur
  - "agra" x3, e.g. [title] Drainage & sewage – South Pragram 2Nd Cross Street, Kaladipet, Kaladipet
  - "kanpur" x2, e.g. [title] Roads, footpaths & bridges – Kakkanpuram, Little Mount, Saidapet
  - "railway" x1, e.g. [title] #BreakingNews | மின்சார ரயில் தடம் புரண்டு விபத்து #Chennai | #ChennaiLocalTrain | #Suburb
- `src/lib/thunai/gloss.ts:34` list [endha, entha, எந்த] : 32 hits
  - "entha" x32, e.g. [title] Street lights & electrical hazards – Senthamizh Street, Chenghutuvan Nagar, Pattaravakkam
- `src/lib/assistant/deptwords.ts:37` regex /water|lake|tank|canal|river|flood/i : 32 hits
  - "river" x17, e.g. [title] Auto-rickshaw driver murders his wife in Ambattur in moving auto
  - "tank" x8, e.g. [title] Trees, parks & playgrounds – Seethapathy 3Rd Street, Thattankulam Road, Madhavaram
  - "water" x7, e.g. [title] Chennai: Sewage Mixes with Rainwater, Overflows on GST Road
- `src/lib/assistant/deptwords.ts:39` regex /build|water|lake|tank|canal|river|flood/i : 32 hits
  - "river" x17, e.g. [title] Auto-rickshaw driver murders his wife in Ambattur in moving auto
  - "tank" x8, e.g. [title] Trees, parks & playgrounds – Seethapathy 3Rd Street, Thattankulam Road, Madhavaram
  - "water" x7, e.g. [title] Chennai: Sewage Mixes with Rainwater, Overflows on GST Road
- `src/lib/thunai/stagelocal.ts:325` list [measure, value, unit, before, change] : 30 hits
  - "change" x26, e.g. [title] Garbage & solid waste – Tiny Sector Sidco Indl. Estate, Telephone Exchange, Pattaravakkam
  - "unit" x4, e.g. [title] Roads, footpaths & bridges – Punitha Anthoniyar Main St, Punitha Anthoniyar Nagar, Puzhal
- `src/lib/assistant/fastpath.ts:417` regex /tambaram|avadi|chengalpattu|kanchipuram|tiruvallur|poonamallee/i : 30 hits
  - "avadi" x30, e.g. [title] Roads, footpaths & bridges – Kamaraj Nagar10Th Street, Chavadi Street, Korattur
- `src/lib/assistant/datasets.ts:84` list [name, zone, severe, high, n, open, complaints, n_prev] : 27 hits
  - "name" x24, e.g. [title] Garbage & solid waste – K P Park Tnscb Tenament27Th. Block, Pulianthope, Pulianthope
  - "open" x2, e.g. [adversarial] reopened
  - "zone" x1, e.g. [adversarial] ozone
- `src/lib/assistant/pipeline.ts:1428` regex /delet|chang|modif|updat|data change/i : 27 hits
  - "chang" x26, e.g. [title] Garbage & solid waste – Tiny Sector Sidco Indl. Estate, Telephone Exchange, Pattaravakkam
  - "Updat" x1, e.g. [title] #NewsUpdate | கார் கட்டுப்பாட்டை இழந்து விபத்து #ZeeTamilNews | #Velachery | #Car | #Accid
- `src/lib/assistant/pipeline.ts:1687` regex /delet|chang|modif|updat|data change/i : 27 hits
  - "chang" x26, e.g. [title] Garbage & solid waste – Tiny Sector Sidco Indl. Estate, Telephone Exchange, Pattaravakkam
  - "Updat" x1, e.g. [title] #NewsUpdate | கார் கட்டுப்பாட்டை இழந்து விபத்து #ZeeTamilNews | #Velachery | #Car | #Accid
- `src/lib/assistant/chartspec.ts:185` regex /compare|previous|last (week|month)|change|\bvs\b|versus|than before|\bwhy\b|rose|rising|fell|falling|better|worse|improv|what changed|மாற்றம்|ஒப்பிடு|ஏன்/ : 26 hits
  - "change" x26, e.g. [title] Garbage & solid waste – Tiny Sector Sidco Indl. Estate, Telephone Exchange, Pattaravakkam
- `src/lib/assistant/datasets.ts:115` list [name, code, open, n, severe, unverified] : 26 hits
  - "name" x24, e.g. [title] Garbage & solid waste – K P Park Tnscb Tenament27Th. Block, Pulianthope, Pulianthope
  - "open" x2, e.g. [adversarial] reopened
- `src/lib/assistant/datasets.ts:147` list [name, code, days, hours, n, onTime, onTimePct] : 26 hits
  - "name" x24, e.g. [title] Garbage & solid waste – K P Park Tnscb Tenament27Th. Block, Pulianthope, Pulianthope
  - "days" x2, e.g. [title] Vehicles Tailback on Chennai-Tiruchy NH as Lakhs Return After Holidays
- `src/lib/assistant/datasets.ts:159` list [name, code, days, hours, n, overdue] : 26 hits
  - "name" x24, e.g. [title] Garbage & solid waste – K P Park Tnscb Tenament27Th. Block, Pulianthope, Pulianthope
  - "days" x2, e.g. [title] Vehicles Tailback on Chennai-Tiruchy NH as Lakhs Return After Holidays
- `src/lib/assistant/datasets.ts:207` list [name, code, open, overdue, serious, awaiting] : 26 hits
  - "name" x24, e.g. [title] Garbage & solid waste – K P Park Tnscb Tenament27Th. Block, Pulianthope, Pulianthope
  - "open" x2, e.g. [adversarial] reopened
- `src/lib/assistant/datasets.ts:414` list [name, overdue, open] : 26 hits
  - "name" x24, e.g. [title] Garbage & solid waste – K P Park Tnscb Tenament27Th. Block, Pulianthope, Pulianthope
  - "open" x2, e.g. [adversarial] reopened
- `src/lib/assistant/verify.ts:102` regex /change|delta|diff|vs|pct/ : 26 hits
  - "change" x26, e.g. [title] Garbage & solid waste – Tiny Sector Sidco Indl. Estate, Telephone Exchange, Pattaravakkam
- `src/lib/assistant/verify.ts:126` regex /change|delta/i : 26 hits
  - "change" x26, e.g. [title] Garbage & solid waste – Tiny Sector Sidco Indl. Estate, Telephone Exchange, Pattaravakkam
- `src/lib/thunai/stagelocal.ts:61` regex /name/ : 24 hits
  - "name" x24, e.g. [title] Garbage & solid waste – K P Park Tnscb Tenament27Th. Block, Pulianthope, Pulianthope
- `src/lib/assistant/datasets.ts:317` list [name, designation, office] : 24 hits
  - "name" x24, e.g. [title] Garbage & solid waste – K P Park Tnscb Tenament27Th. Block, Pulianthope, Pulianthope

## Not compiled