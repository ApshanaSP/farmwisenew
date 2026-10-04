# News classification: current method vs LLM (199 articles)

## Agreement

| | Agree |
|---|---|
| Is it a Chennai incident? | 146/199 (73%) |
| Category (articles both call an incident) | 40/86 (47%) |

## Incident filter disagreements

- Current says incident, LLM says not: **45**
- LLM says incident, current missed it: **8**

## Suicide articles

| Current | LLM | Title |
|---|---|---|
| CRIME_VIOLENT | SUICIDE_SELF_HARM | முதல்வர் விஜய்க்கு வீடியோ வெளியிட்டு ஆட்டோ டிரைவர் தற்கொலை சென்னையில் அதிர்ச்சி |
| CRIME_VIOLENT | SUICIDE_SELF_HARM | 'Invited her to guest house': 3rd case filed against granite baron R Veeramani over Class  |
| nan | SUICIDE_SELF_HARM | R. Veeramani booked for abetting suicide of minor in 2004 |
| CRIME_VIOLENT | SUICIDE_SELF_HARM | சென்னையில் 14-வது மாடியில் இருந்து குதித்து மருத்துவ மாணவர் தற்கொலை |
| nan | SUICIDE_SELF_HARM | How a psychological autopsy can help with suicide prevention | Chennai News |
| nan | OTHER | Chennai man held after absconding for wife's suicide |
| CRIME_VIOLENT | SUICIDE_SELF_HARM | 'ஜெம்' வீரமணி வன்கொடுமையால் சிறுமி தற்கொலை: போலீசில் தாய் புகார் |
| OTHER | SUICIDE_SELF_HARM | Gem Granites owner R. Veeramani booked for abetting suicide of minor by the Greater Chenna |
| CRIME_VIOLENT | CRIME_VIOLENT | சென்னை: எஸ்.ஐ. தற்கொலை வழக்கில் திடீர் திருப்பம் - மனைவியே ஆண் நண்பர் மூலம் கொலை செய்தது அ |
| CRIME_VIOLENT | SUICIDE_SELF_HARM | சென்னை பெரியமேடு லாட்ஜில் அண்ணன்-தம்பி தூக்கு போட்டு தற்கொலை: தாய் இறந்த விரக்தியில் விபரீ |
| CRIME_VIOLENT | SUICIDE_SELF_HARM | 20 ஆண்டுகளில் ஐஐடி மாணவர்கள் 171 பேர் தற்கொலை! சென்னைக்கு 2வது இடம்! |

## Biggest category changes (current -> LLM)

| Current | LLM | Articles |
|---|---|---|
| OTHER | CRIME_VIOLENT | 9 |
| OTHER | CRIME_PROPERTY | 5 |
| CRIME_VIOLENT | SUICIDE_SELF_HARM | 4 |
| ROAD_ACCIDENT | FIRE_EXPLOSION | 3 |
| OTHER | POLICE_OTHER | 3 |
| OTHER | TRAFFIC_OBSTRUCTION | 3 |
| OTHER | SUICIDE_SELF_HARM | 2 |
| OTHER | FIRE_EXPLOSION | 2 |
| OTHER | ENCROACHMENT | 2 |
| OTHER | STREETLIGHT_ELECTRICAL | 2 |
| FLOOD_RELIEF | OTHER | 1 |
| CRIME_VIOLENT | CRIMES_AGAINST_WOMEN | 1 |
| CRIME_PROPERTY | CRIME_VIOLENT | 1 |
| FLOOD_WATERLOGGING | CRIME_VIOLENT | 1 |
| OTHER | PUBLIC_ORDER | 1 |

## Sample disagreements to check

| Current | LLM (conf) | LLM reason | Title |
|---|---|---|---|
| STREETLIGHT_ELECTRICAL | PUBLIC_ORDER (0.94) | Residents block road protesting prolonged power cuts. | Vyasarpadi residents stage road blockade over prolonged power cuts |
| OTHER | CRIME_VIOLENT (0.95) | Arrest for assault on Bengal businessman. | Absconding Trinamool leader arrested in Chennai for attacking Bengal businessman |
| ROAD_ACCIDENT | FIRE_EXPLOSION (0.98) | Fire broke out at metro office near Marina | சென்னை மெரினா அருகே மெட்ரோ ரயில் அலுவலகத்தில் தீ விபத்து! |
| OTHER | CRIME_VIOLENT (0.95) | Youth murder case, suspect arrested | சென்னை ஐஸ் ஹவுஸ் பகுதியில் இளைஞர் படுகொ*: ஒருவர் கைது! |
| CRIME_VIOLENT | SUICIDE_SELF_HARM (0.97) | Auto driver suicide reported in Chennai | முதல்வர் விஜய்க்கு வீடியோ வெளியிட்டு ஆட்டோ டிரைவர் தற்கொலை சென்னையில் அதிர்ச்சி |
| VECTOR_DISEASE | HEALTH_SERVICES (0.96) | Hospital bed shortage due to flu/dengue in Chennai | Chennai private hospitals face 12-hour bed waits as flu, dengue surge |
| OTHER | PUBLIC_ORDER (0.94) | Clash during procession leading to death in Chennai | MTC driver dies after clash during Vinayagar procession in Chennai, 5 held |
| CRIME_VIOLENT | CRIMES_AGAINST_WOMEN (0.97) | Sexual assault of minor near Chennai | Youth arrested for sexually assaulting 16-year-old girl near Chennai |
| OTHER | CRIME_VIOLENT (0.90) | Parents assault child, police intervene, violent crime | BREAKING || சென்னையில் பெற்றோர் கண்முன்னே மகனை துடிதுடிக்க கொ*ற பயங்கரம் - ரவுடி |
| OTHER | SUICIDE_SELF_HARM (0.80) | Possible self‑immolation death of police SI in Chennai | படுக்கையில் பெட்ரோல் வாடை? சென்னை எஸ்ஐ மரணத்தின் பகீர் பின்னணி | Chennai Police  |
| OTHER | CRIME_VIOLENT (0.85) | Kidnapping and detention case in Chennai | Trader kidnapped over debt; 1 held in Chennai |
| OTHER | FIRE_EXPLOSION (0.95) | Gas leak and blast caused fire/explosion in flat | Chennai: Gas leak, compressor blast gut 11th-floor flat in OMR high-rise |
| OTHER | CRIME_VIOLENT (0.90) | Arrest for violent attack on businessman | Absconding Trinamool leader arrested in Chennai for attacking Bengal businessman |
| ROAD_ACCIDENT | FIRE_EXPLOSION (0.98) | House fire in Chennai, immediate safety incident | Chennai | Fire Accident | கேஸ் கசிந்து தீப்பிடித்து எரிந்த வீடு.. நடு இரவில் சென |
| OTHER | FIRE_EXPLOSION (0.99) | Fire reported at Chennai Metro office | சென்னை மெரினாவில் உள்ள மெட்ரோ அலுவலகத்தில் தீ விப*து |
| OTHER | CRIME_PROPERTY (0.96) | Arrest for spray‑assault theft of chain | சென்னை | தூங்கிக் கொண்டிருந்த இன்ஜினீயர் முகத்தில் மயக்க ஸ்பிரே அடித்து செயின் த |
| CRIME_VIOLENT | SUICIDE_SELF_HARM (0.99) | Medical student suicide in Chennai | சென்னையில் 14-வது மாடியில் இருந்து குதித்து மருத்துவ மாணவர் தற்கொலை |
| OTHER | TRAFFIC_OBSTRUCTION (0.90) | Power cuts causing road blockage in Vyasarpadi | வியாசர்பாடியில் 3 நாட்களாக அடிக்கடி மின்தடை: பொதுமக்கள் சாலை மறியல் |
| OTHER | STREETLIGHT_ELECTRICAL (0.80) | Boy injured by electricity, safety hazard in Chennai | Chennai | விளையாட்டாக தொட்ட சிறுவன் - கைகளை சிதைத்த மின்சாரம் |
| OTHER | TRAFFIC_OBSTRUCTION (0.95) | Container trucks blocking area, causing public distress | கன்டெய்னர் லாரிகளால் ஸ்தம்பித்த மணலி புதுநகர்: பொதுமக்கள், வாகன ஓட்டிகள் கடும் அ |
| OTHER | STREETLIGHT_ELECTRICAL (0.90) | Threatening electric pole in Chennai ward, safety hazard | திருவொற்றியூர் 6வது வார்டில் அச்சுறுத்தும் மின்கம்பம்: பொதுமக்கள் பீதி |
| OTHER | CRIME_PROPERTY (0.80) | Women arrested for vandalising traffic barricades | Three women held for vandalising traffic barricades on 100-Feet Road |
| OTHER | ENCROACHMENT (0.96) | Land encroachment complaint in Royapuram, Chennai | நில அபகரிப்பு புகார் அளித்தும் உரிய நடவடிக்கை எடுக்கவில்லை: முதல்வருக்கு ராயபுரம |
| CRIME_VIOLENT | SUICIDE_SELF_HARM (0.88) | Girl suicide linked to animal cruelty, reported in Chennai | 'ஜெம்' வீரமணி வன்கொடுமையால் சிறுமி தற்கொலை: போலீசில் தாய் புகார் |
| OTHER | CRIME_VIOLENT (0.93) | Death in Puzhal, alleged foul play, police investigation | RDO probe ordered as family alleges foul play in Puzhal woman’s death |

## Accuracy

Not scored yet: fill in `correct_is_incident (1/0)` and `correct_category` in the CSV, then run this again.
