
# Thunai (துணை): the voice pilot for District IQ
 · 

## How to read this
Sections 1 to 14 answer your brief in order, and every guess I made is tagged [A1], [A2] and so on, then listed in Appendix C with the hour at which to check it.
Mark
 | Meaning
 | 
A, B, C
 | Risk levels. A: Thunai does it alone and offers undo. B: one tap. C: spoken "confirm" plus the number, such as "confirm five".
 | 
[A#]
 | An assumption. Appendix C says when to check it.
 | 
NEW
 | An action or screen that does not exist yet. About a dozen are needed, each a few lines.
 | 
Tray
 | The Approval Tray. The only door through which anything leaves the room.
 | 
Appendix A shows the 40 raw ideas and how three judges scored them. Appendix B holds the 15 failure tests. A native Tamil speaker should read every Tamil line before the demo [A10].

## 1. The winning pitch
Thunai is a voice pilot that runs District IQ for the Collector: say half a sentence in Tamil, Tanglish or English, and the whole dashboard, plus the government websites behind it, moves on its own, while Thunai shows every step, proves every number and asks before it acts.
Task 6 asks for one system that joins the application, the web and district intelligence. Thunai drives all three: the app through the central controller, the web through the Right Hand, and the intelligence through numbers that code computes and a Watch mode that ranks what matters.

### Three jaw-drop moments
- The half-sentence. The Collector holds one key and says "Zone 7… illa, Adyar kaatu." The ghost pointer starts towards Ambattur, hears the correction and flies to Adyar. No click. The subtitle says what it understood.
- One sentence, nine steps, one confirm. "நாளைக்கு கனமழை வருது, எல்லாம் தயார் பண்ணு." A real IMD page opens and is read. The map ranks flood risk. Five drafted instructions wait in the tray. The Collector says "உறுதி ஐந்து" and they go. Nothing left the room before that.
- The room cannot be fooled. In a review meeting someone says "Adyar complaints are down forty percent." A private whisper reaches only the Collector: "Adyar is down 12%, not 40%. Show?" One word puts the proof on the projector. (The 12% is an example.)

### Why the jury will care
- The map is the interface. Voice flies the map, ranks areas and compares periods. A geospatial-AI jury sees its own craft made conversational.
- A pattern, not a patch. Any dashboard that registers its actions gets a voice cockpit. District IQ is first; a farm-level dashboard is next.
- An agent you can audit. Every action is logged, every number has proof, every outward step needs approval.

### What Thunai is not
- Not JARVIS. That name belongs to Marvel. Thunai (துணை) means "companion".
- Not always listening. The mic is open only while a key is held, or inside a visible Meeting session.
- Not a chatbot. Ask District IQ stays the chatbot; Thunai is the hands.

## 2. The seven modes
All seven modes run on one engine: a plan of steps (do, say, ask, wait) executed by the same runner. Once Command and Mission work, the other five are mostly scripts and policies.
Mode
 | What it does
 | Use it when
 | Mic and voice
 | Build
 | 
Command
 | Does one thing now: changes a filter, flies the map, opens a panel, answers one question.
 | Always. It is the default.
 | Hold a key to talk. Speaks answers only; plain navigation gets a chime and a subtitle.
 | Full
 | 
Mission
 | Runs a multi-step job from one sentence, with a plan strip, a ghost pointer and approval gates.
 | "Prepare for tomorrow's rain." "Start the Monday review." "Yes" to a Watch alert.
 | Hold a key to talk. One spoken line at the start, at each gate and at the end.
 | Full for 3, lite for 2
 | 
Meeting
 | Gives a clean projector screen and a private console. Fact-checks claims. Drafts minutes.
 | Review meetings and VIP briefings.
 | Room mic open only inside a visible session, with a two-hour hard stop. Never speaks aloud.
 | Lite
 | 
Presenter
 | Narrates the story of the week while it walks through the screens. The Collector can interrupt.
 | Briefing a Minister. Opening a review.
 | Hold a key to interrupt. Narration, or subtitles only.
 | Lite
 | 
Drive
 | Reads a 90-second morning brief on the phone, hands-free.
 | The car, early morning.
 | Phone push-to-talk or headset button. Short spoken lines.
 | Lite
 | 
Tour
 | Teaches a newly transferred Collector the district and the commands.
 | The first week after a transfer.
 | Hold a key to talk. Guide voice.
 | Cut first
 | 
Watch
 | Monitors data silently. Speaks only when something ranks high.
 | Always, while Thunai is on.
 | No mic at all. Digest, whisper or speak.
 | v1
 | 

### Rules that hold in every mode
- One mode is active at a time. Watch runs under all of them.
- "Thunai on" starts Watch and nothing else. The mic stays shut until a key is held or a Meeting starts. Thunai is off at every start.
- Switch by voice: "Meeting mode", "மீட்டிங் மோட்", "Meeting mode on pannu". The orb shows the mode's glyph.
- Three escapes work everywhere: "Stop" (நிறுத்து), "Go back" (பழையபடி மாத்து) and "Thunai off".
- The red dot on the orb is the only sign of an open mic. No dot means the mic is shut.
- Every mode writes to the same audit trail.

### Command
Command does one thing and gets out of the way. When the screen change is the answer, Thunai says nothing, because silence is the confirmation. It speaks only when the answer is not visible, such as a reservoir level or a question. The target is a visible change in under 400 ms for 80% of commands.

### Mission
A mission is a plan: a list of steps, each one an action call, a Right Hand job, a spoken line, a question or a wait for approval. Five missions ship as recipes (Section 5). For anything else, Nova Lite composes a plan from allowed actions only. A plan with three or more steps, or any B or C step, is shown first and starts when the Collector says "go". A plan made only of reversible A steps starts at once.

### Meeting
The Collector starts it with one tap (level B), because it opens the mic. Two windows open: /projector (large type, no private chips) and /console (whispers, fact-checks, an agenda timer). Fact-checks appear on the console only. The Collector says "show" and the proof moves to the projector. Audio is never stored. The transcript lives in memory and is discarded unless the Collector taps "Save minutes" [A15].

### Presenter
Presenter builds a three-to-four minute story from the Briefing stories, Trends and Overview: headline numbers, what improved, what worsened, what we did, what needs a decision. Each chapter is one screen state, one narration line and one ghost-pointer move. "Go back", "skip", "slower" and "show Adyar" all work mid-story, and Thunai returns to where it left off. Subtitles show Tamil and English together for a mixed audience.

### Drive
Drive is audio only. It reads the overnight events, the weather risk and the three decisions waiting. "Next", "more on Adyar" and "skip" work. While the Collector is driving, Thunai only queues drafts for the desk. It does not approve or send anything. A headset button acts as the talk key [A16].

### Tour
Tour is a ten-minute guided session for a new Collector: the district in 60 seconds, the five recurring trouble spots and the seasons they flare in, which departments close fastest and slowest, and a Handover Pack of the previous Collector's pinned workspaces and watch rules (only if they chose to leave it). It ends with "Try saying" practice cards. It is built last and cut first.

### Watch
Watch monitors rules, not people: thresholds, growth rates, news-versus-records gaps, overdue actions and stale feeds. It ranks what it finds and speaks only above the bar (Section 6).

## 3. The understanding engine
Thunai understands by narrowing, not guessing: clean the words, find the entities, read the screen, parse by rules, and call Nova Lite only for what is left.

### 3.1 The pipeline
#
 | Stage
 | What it does
 | Budget
 | 
1
 | Ears
 | Hold-to-talk. Browser speech-to-text returns interim and final text, a confidence score and up to three alternatives.
 | Outside our control
 | 
2
 | Normalise
 | Turns Tamil script, Latin script and mixed speech into one canonical token stream. Converts number words to integers. Strips politeness words and Tamil case endings.
 | 5 ms
 | 
3
 | Link entities
 | Matches zones, taluks, departments, categories, pages and layers with an alias table, a phonetic skeleton and edit distance of 2 or less.
 | 10 ms
 | 
4
 | Resolve context
 | Fills "this", "that", "there", "worst", "next", "same" and "back" from screen memory.
 | 5 ms
 | 
5
 | Parse
 | A bag-of-slots grammar builds a plan of one or more action calls. Word order does not matter. Confidence of 0.8 or more skips stage 6.
 | 10 ms
 | 
6
 | Plan with the LLM
 | Only when stage 5 fails. Nova Lite gets a compact state card and the action schema, and returns JSON. A validator checks every call.
 | 1.5 s
 | 
7
 | Policy gate
 | Checks role, risk level and confidence, then acts, acts with an undo chip, asks once, or sends the step to the tray.
 | 5 ms
 | 
8
 | Execute
 | One controller transaction, the ghost pointer, a screen-memory update and an audit entry.
 | First paint within 60 ms
 | 
9
 | Narrate
 | A template plus the number guard makes a line of 18 words or fewer.
 | 20 ms
 | 
Preview while speaking. When the interim text is stable, Thunai glides the ghost pointer towards the likely target. It changes nothing until the final text arrives. The screen feels ahead of the voice, and a wrong guess costs nothing.

### 3.2 How the hard phrases resolve
Phrase
 | Rule
 | Example
 | 
"Change filter to 7"
 | "Filter" means the filter touched last (within 60 s), else the page's main filter. Check 7 against that filter's valid range. If invalid, try the next filter. If two stay valid, ask once.
 | Last touched was zone: setZone(7). Last touched was the severity tab (4 options): 7 is invalid, so zone: setZone(7).
 | 
"This one"
 | The focus: the hovered item if the mouse is still, else the last click, else the last entity Thunai named (within 30 s). If none: the top row of the one visible list, else ask once with both candidates highlighted.
 | Hovering incident row 3 means incident 3.
 | 
"The worst"
 | The top item of the ranking on screen, by the metric on screen. The subtitle names the metric. A tie shows both.
 | "Worst zone by critical open, this week: <zone>."
 | 
"Go back"
 | Undo the last transaction. A multi-slot sentence is one transaction. "Go back two" undoes two. It is not the browser's back button.
 | One undo reverses zone, period and severity together.
 | 
"Same for last month"
 | Take the last view (page, filters, metric). Change only the time slot to minus one month. Compare on the same elapsed days [A21].
 | A ribbon reads "1–28 Oct vs 1–28 Sep".
 | 
"Zoom there"
 | "There" is the last place mentioned or flown to. Zoom one level closer: zone, then wards, then street.
 | After a zone flight, wards appear.
 | 
"Next", "previous"
 | The neighbour in the visible order of the current list.
 | Incident rank 1 becomes rank 2.
 | 
"Both", "the other one"
 | The two entities of the last comparison. "The other one" flips to the second.
 | Compare Adyar and Perungudi, then "the other one" means Perungudi.
 | 
"Only X", "just X"
 | Keep current filters and add X. "All" or "everything" clears that filter.
 | "Only Metro Water" keeps the zone and period.
 | 
"Again"
 | Repeat the last action with the same slots.
 | Same view, same slots.
 | 
"Stop"
 | Silence speech now. Halt a mission at the next step boundary.
 | Works in every mode.
 | 

### 3.3 Tamil and Tanglish
- Numbers. ஏழு, ஏழாவது and ஏழாம் all mean 7. Colloquial forms: ஒண்ணு 1, ரெண்டு 2, மூணு 3, நாலு 4, அஞ்சு 5, பதினஞ்சு 15. Tanglish: onnu, rendu, moonu, naalu, anju, aaru, ezhu, ettu, ombodhu, pathu. Digits in any form.
- 5 versus 15. ஐந்து and பதினைந்து are the likeliest mishearing. Any zone of 10 or above appears as a large chip with its name, so a wrong one is seen at once.
- Place names. Case endings are stripped: அடையாறு, அடையாறை, அடையாறில் and அடையாற்றில் (the ஆறு to ஆற்று sound change) all reach Adyar. Matching uses a Latin skeleton, so "Thandaiyarpet", "Tondiarpet" and "தண்டையார்பேட்டை" reduce to one key, then edit distance of 2 or less.
- Loan words in Tamil script. ஜோன் or சோன் is zone, ஃபில்டர் is filter, வீக்லி is weekly, கிரிட்டிகல் is critical, மேப் is map, லேயர் is layer, ஜூம் is zoom, கம்பேர் is compare, டிராஃப்ட் is draft, கன்ஃபர்ம் is confirm.
- Core Tanglish verbs. kaatu (show), maathu (change), po (go), open pannu, mattum (only), illa (no, not), sollu (tell), anuppu (send), nirutthu (stop). Question words: edhu, enna, evlo, enga.
- A word that is ambiguous. வட்டம் means taluk in revenue Tamil and ward-level in civic and party Tamil. Thunai reads the map mode first. If it is still unclear, it asks once [A10].
- Self-repair markers. illa, இல்ல, வேண்டாம், "no", "sorry", "I mean". The last entity of the same type wins.
- Politeness. ஐயா, சார், madam, please and the -ங்க ending are ignored. Thunai replies in neutral, polite Tamil and uses no honorific unless one is set [A18].
- Which recogniser language. Default is ta-IN with the loan-word table. The orb has an EN / தமிழ் toggle, and the default follows the last three commands [A5]. Test 20 clips per language in hour 1.
- Reply language. Tamil or Tanglish in means spoken Tamil out, with bilingual subtitles. English in means English out. Tamil speech comes from hand-written templates, not from the LLM [A7].

### 3.4 Screen memory: what Thunai "sees"
Thunai does not look at pixels. It reads a small structured state that the controller publishes after every action. That makes it exact, fast and private. A hover lasts 3 seconds, a focus 30 seconds, and the "last touched filter" 60 seconds.

### 3.5 Confidence and the ask-once rule
Confidence = 0.30 × speech confidence + 0.30 × match score + 0.20 × context agreement + 0.20 × margin over the runner-up [A9].
Confidence
 | Level A (reversible)
 | Level B or C (reaches people or shared state)
 | 
0.85 or more
 | Do it silently
 | At 0.90 or more, draft it into the tray. Otherwise ask once.
 | 
0.60 to 0.85
 | Do it, and show a 4-second "Heard X — wrong?" chip
 | Ask once
 | 
Below 0.60, or two readings within 0.10
 | Ask once
 | Ask once
 | 
The ask-once rules:
- Never ask what the screen already answers.
- At most one question per command.
- Two choices only, as chips: "Ambattur or Anna Nagar?" The Collector taps, or says "first" or "second" (முதலாவது, இரண்டாவது).
- If the answer is still unclear, pick the safest reversible reading, say what was assumed, and offer "wrong".
- After three questions in two minutes, switch to decisive mode: act on the best guess with an undo chip (level A only).

### 3.6 Learning the Collector's habits
Thunai learns five things. All are stored on the machine, shown in a "What Thunai learned" panel, and forgotten with one tap.
- Aliases. "Marina side" means the zones the Collector means by it. "Metro" means Metro Water.
- Sequences. After "critical only" the Collector usually asks for Adyar. Thunai offers it as a chip and never acts on it alone.
- Defaults by time. Monday morning opens the weekly view.
- Language mix. Which recogniser and reply language fit.
- Corrections. Every "no, I meant X" is stored as heard-to-meant. Two identical corrections become a personal alias labelled "learned".
Learning never changes a risk level or an approval rule.

### 3.7 Recovering from mistakes
- Undo stack. Every transaction has an inverse. Say "go back", press Ctrl+Z, or tap the rewind rail.
- "No", "illa", "வேண்டாம்", "wrong". Thunai drops the last reading, takes the next best and does it, saying "Anna Nagar then?" in one short line.
- The wrong-chip. Shown for 4 seconds after any reading below 0.85.
- Snapshots. A silent workspace is saved at every mode start and every 20 actions. "Start over" restores the mode-start snapshot.
- Missions roll back the view, never what was sent. Sent items cannot be recalled, which is why they pass the tray first.
- Honest failure. When Thunai does not understand, it shows what it heard and offers three example commands. It never guesses at level B or C.

## 4. Fifty capabilities
Fifty commands cover every page. Each row shows what the Collector says in three languages and what moves on screen. The recogniser may return Tamil script or Latin script for the same sentence, and the normaliser handles both. NEW marks an action that must be added [A1]. B and C show the risk level when a row is not level A.

### Anywhere (1–10)
#
 | English
 | Tamil
 | Tanglish
 | What moves
 | 
1
 | Open Trends.
 | ட்ரெண்ட்ஸ் பக்கத்தைத் திற.
 | Trends page-a open pannu.
 | setPage('trends'). The ghost pointer presses the Trends tab.
 | 
2
 | Weekly.
 | வாராந்திரத்துக்கு மாத்து.
 | Weekly-ku maathu.
 | setPeriod('weekly'). A date-range chip shows the exact dates.
 | 
3
 | Change the filter to 7.
 | ஃபில்டரை ஏழுக்கு மாத்து.
 | Filter-a 7-ku maathu.
 | "Filter" resolves to the last-touched filter. Zone is valid, so setZone(7) and the map flies to Ambattur.
 | 
4
 | Show Ambattur.
 | அம்பத்தூரைக் காட்டு.
 | Ambattur-a kaatu.
 | setZone(7), the map flies, the chip reads Zone 7 — Ambattur.
 | 
5
 | Adyar, weekly, critical only.
 | அடையாறு, வாராந்திரம், அவசரமானவை மட்டும்.
 | Adyar, weekly, critical mattum.
 | One transaction: setView({zone:13, period:'weekly', sev:'critical'}) (NEW). One undo reverses all three.
 | 
6
 | Go back.
 | பழையபடி மாத்து.
 | Go back pannu.
 | Pops the undo stack. The pointer replays the last move in reverse.
 | 
7
 | Same for last month.
 | அதையே போன மாசத்துக்குக் காட்டு.
 | Adhey last month-ku kaatu.
 | Replays the last view with an offset of minus one month (NEW offset argument). A ribbon shows both date ranges.
 | 
8
 | Clear all filters.
 | எல்லா வடிகட்டிகளையும் நீக்கு.
 | Filters ellaam clear pannu.
 | Resets zone, taluk, department, category and severity to All in one transaction.
 | 
9
 | Save this as Monday review.
 | இதை 'திங்கள் ஆய்வு' என்று சேமி.
 | Idha 'Monday review'-nu save pannu.
 | saveWorkspace('Monday review'), then a toast.
 | 
10
 | Open Monday review.
 | திங்கள் ஆய்வைத் திற.
 | Monday review-a open pannu.
 | openSavedWorkspace restores page, filters and layout.
 | 

### Overview (11–24)
#
 | English
 | Tamil
 | Tanglish
 | What moves
 | 
11
 | Take me to the worst zone.
 | ரொம்ப மோசமான மண்டலத்துக்குப் போ.
 | Worst zone-ku po.
 | Code ranks the zones by the metric on screen, then setZone(top) and the map flies there. The subtitle names the metric.
 | 
12
 | Critical only.
 | அவசரமானவை மட்டும்.
 | Critical mattum.
 | setSevTab('critical').
 | 
13
 | Only Metro Water.
 | குடிநீர் வாரியம் மட்டும்.
 | Metro Water mattum.
 | setDept('metro-water') [A3].
 | 
14
 | Just waterlogging.
 | மழைநீர் தேக்கம் மட்டும்.
 | Waterlogging mattum.
 | setCat('waterlogging') [A3].
 | 
15
 | Show Mylapore taluk.
 | மயிலாப்பூர் வட்டத்தைக் காட்டு.
 | Mylapore taluk-a kaatu.
 | setMapMode('taluks'), setTaluk('Mylapore'), then fly to it [A4].
 | 
16
 | Turn on the rain layer.
 | மழை அடுக்கை ஆன் செய்.
 | Rain layer on pannu.
 | toggleLayer('rain', true). The legend slides in.
 | 
17
 | Open the top incident.
 | முதல் நிகழ்வைத் திற.
 | Top incident-a open pannu.
 | Reads the visible priority order, then openInc(first). The map flies to it.
 | 
18
 | Draft an instruction to Metro Water for this.
 | இதற்கு குடிநீர் வாரியத்துக்கு உத்தரவு தயார் செய்.
 | Idhukku Metro Water-ku instruction draft pannu.
 | openAction(focus, dept) makes a draft card in the tray. Nothing is sent. Level A.
 | 
19
 | Send it.
 | அனுப்பு.
 | Send pannunga.
 | The tray lights up. Thunai says: say confirm one. The Collector says confirm one, and it goes. Level C.
 | 
20
 | Send this back — photo missing.
 | இதைத் திருப்பி அனுப்பு — புகைப்படம் இல்லை.
 | Idha send back pannu, photo illa.
 | sendBack(id, note) becomes a tray card. Level C [A2].
 | 
21
 | Mark this verified.
 | இதைச் சரிபார்க்கப்பட்டது என்று குறி.
 | Idha verified-nu mark pannu.
 | verify(id) after one tap. Level B [A2].
 | 
22
 | Open the full list.
 | முழுப் பட்டியலைத் திற.
 | Full list open pannu.
 | openList.
 | 
23
 | Is this a pattern?
 | இது தொடர்ந்து நடக்குதா?
 | Idhu pattern-a?
 | openPattern(focus). Thunai speaks the computed count of past repeats.
 | 
24
 | How are the neighbouring districts?
 | பக்கத்து மாவட்டங்கள் எப்படி இருக்கு?
 | Pakkathu districts epdi irukku?
 | openNearby.
 | 

### Briefing (25–29)
#
 | English
 | Tamil
 | Tanglish
 | What moves
 | 
25
 | Brief me.
 | இன்றைய சுருக்கம் சொல்லு.
 | Innaiku brief sollu.
 | setPage('briefing'). Thunai reads the top three stories, one line each.
 | 
26
 | Open the stories.
 | இன்றைய முக்கியச் செய்திகளைத் திற.
 | Stories open pannu.
 | openStories.
 | 
27
 | Show all the news.
 | எல்லாச் செய்திகளையும் காட்டு.
 | News ellaam kaatu.
 | openNewsAll.
 | 
28
 | Where do the outlets disagree?
 | செய்தி நிறுவனங்கள் எங்கே முரண்படுகின்றன?
 | Enga outlets contradict pannudhu?
 | openConflict. The top three disagreements are highlighted.
 | 
29
 | What's in the news but not in our records?
 | செய்தியில இருக்கு, நம்ம பதிவுல இல்லாதது என்ன?
 | News-la irukku, namma record-la illa-nu edhu?
 | openGaps.
 | 

### Trends (30–32)
#
 | English
 | Tamil
 | Tanglish
 | What moves
 | 
30
 | Waterlogging trend, Adyar, this quarter.
 | அடையாறு மழைநீர் தேக்கத்தின் காலாண்டுப் போக்கைக் காட்டு.
 | Adyar waterlogging trend, quarterly kaatu.
 | One transaction: setPage('trends'), setZone(13), setCat('waterlogging'), setPeriod('quarterly').
 | 
31
 | Is it getting better or worse?
 | இது சரியாகுதா, மோசமாகுதா?
 | Idhu better-a worse-a?
 | Code computes the slope against the previous period. Thunai speaks the direction and the computed percentage. The line is highlighted.
 | 
32
 | Compare Adyar with Perungudi.
 | அடையாறையும் பெருங்குடியையும் ஒப்பிடு.
 | Adyar-a Perungudi-oda compare pannu.
 | Two-series compare (NEW setCompare). Two colours, one legend.
 | 

### Environment and markets (33–36)
#
 | English
 | Tamil
 | Tanglish
 | What moves
 | 
33
 | How much rain in the last 24 hours?
 | கடந்த 24 மணி நேரத்தில் எவ்வளவு மழை?
 | Last 24 hours-la evlo rain?
 | setPage('environment'), setEnvSel('rain'). Thunai speaks the computed total with its as-of time.
 | 
34
 | Chembarambakkam level?
 | செம்பரம்பாக்கம் நீர்மட்டம் என்ன?
 | Chembarambakkam water level evlo?
 | setEnvSel('reservoirs'), the marker is highlighted, and Thunai speaks the percent full and the as-of time.
 | 
35
 | Air quality in Manali?
 | மணலியில் காற்றின் தரம் எப்படி?
 | Manali-la air quality epdi?
 | setEnvSel('air') and setZone(2).
 | 
36
 | Tomato price?
 | தக்காளி விலை என்ன?
 | Thakkali vilai evlo?
 | openMarkets filtered to tomato, with the change against last week.
 | 

### Ask District IQ (37–39)
#
 | English
 | Tamil
 | Tanglish
 | What moves
 | 
37
 | Ask District IQ which zone has the most pending complaints.
 | எந்த மண்டலத்தில் நிலுவைப் புகார்கள் அதிகம்? டிஸ்ட்ரிக்ட் ஐகியூவிடம் கேள்.
 | District IQ-kitta kelu, edhu zone-la pending complaints adhigam?
 | setPage('ask'), sends the question to the chatbot and its tools, and reads the answer.
 | 
38
 | Say that in Tamil.
 | இதைத் தமிழில் சொல்லு.
 | Idha Tamil-la sollu.
 | Re-renders the last answer in the other language from templates. Nothing is recomputed.
 | 
39
 | Show me the proof.
 | ஆதாரத்தைக் காட்டு.
 | Proof kaatu.
 | showProof (NEW) opens the source, query, as-of time and any evidence screenshot.
 | 

### Data Studio (40–44)
#
 | English
 | Tamil
 | Tanglish
 | What moves
 | 
40
 | Add this link.
 | இந்த இணைப்பைச் சேர்.
 | Indha link-a add pannu.
 | openSources('add') with the link. One tap before anything is fetched. Level B.
 | 
41
 | Read this scanned order.
 | இந்த ஸ்கேன் செய்த ஆணையைப் படி.
 | Indha scanned order-a read pannu.
 | openSources('ocr'). The extracted text appears beside the image.
 | 
42
 | Make a dashboard from this file.
 | இந்தக் கோப்பிலிருந்து டாஷ்போர்டு உருவாக்கு.
 | Indha file-la irundhu dashboard pannu.
 | The Data Studio auto-dashboard builds and opens.
 | 
43
 | Connect the rainfall feed.
 | மழை அளவுத் தரவை இணை.
 | Rainfall feed-a connect pannu.
 | The live-connector wizard opens. Saving the connector is one tap. Level B.
 | 
44
 | Tell me when Chembarambakkam crosses eighty percent.
 | செம்பரம்பாக்கம் எண்பது சதவீதத்தைத் தாண்டினா சொல்லு.
 | Chembarambakkam 80 percent cross aana sollu.
 | createWatch (NEW) shows a rule card. One tap activates it. Level B.
 | 

### Ask the Map (45–50)
#
 | English
 | Tamil
 | Tanglish
 | What moves
 | 
45
 | Nearest hospital to this incident.
 | இந்த நிகழ்வுக்கு அருகிலுள்ள மருத்துவமனை எது?
 | Idhukku nearest hospital edhu?
 | askMap('nearest'). A pin and a line appear, with the distance computed by code.
 | 
46
 | Relief camps within two kilometres.
 | இரண்டு கிலோமீட்டருக்குள் நிவாரண முகாம்கள் காட்டு.
 | 2 km-kulla relief camps kaatu.
 | askMap('radius'). A ring and the matching pins.
 | 
47
 | Waterlogging along Velachery Main Road.
 | வேளச்சேரி மெயின் ரோடு வழியே தண்ணீர் தேக்கம் காட்டு.
 | Velachery Main Road-la waterlogging kaatu.
 | askMap('corridor'). Incidents along the road are highlighted in order.
 | 
48
 | Show hotspots this week.
 | இந்த வாரம் அதிகப் புகார் உள்ள இடங்களைக் காட்டு.
 | Indha week hotspots kaatu.
 | askMap('hotspots') with setPeriod('weekly').
 | 
49
 | Compare Adyar and Anna Nagar on the map.
 | வரைபடத்தில் அடையாறையும் அண்ணா நகரையும் ஒப்பிடு.
 | Map-la Adyar, Anna Nagar compare pannu.
 | askMap('compare'). Two areas are shaded and a side card shows the computed differences.
 | 
50
 | How has Velachery changed since the first of October?
 | அக்டோபர் ஒன்றாம் தேதியிலிருந்து வேளச்சேரி எப்படி மாறியிருக்கு?
 | October 1-la irundhu Velachery evlo maariruku?
 | askMap('change'). A before-and-after slider appears.
 | 

### The dozen NEW actions
Each is a thin wrapper, a few lines to an hour [A1].
NEW action
 | What it does
 | 
setView(spec)
 | Applies several slots in one transaction, so there is one render and one undo.
 | 
setCompare(offset or entity)
 | Shows two periods or two areas side by side.
 | 
flyTo(entity, level)
 | Moves the map to a zone, ward, incident or place at a zoom level.
 | 
selectWard(n)
 | Selects and highlights one of the 200 wards.
 | 
showProof(metricId)
 | Opens the source, query, as-of time and evidence for one number.
 | 
createWatch(rule)
 | Drafts a tell-me-when rule into the tray.
 | 
askMap(kind, args)
 | Wraps the question types Ask the Map already answers.
 | 
ghostMove(target)
 | Moves the ghost pointer and ripples a click.
 | 
tray.add, tray.approve, tray.remove
 | The Approval Tray API.
 | 
openTrail
 | Opens the audit trail.
 | 
setLayout('projector' or 'presenter')
 | Switches to the projector or presenter layout.
 | 
say(text), ask(choices)
 | Subtitle, voice and choice chips.
 | 

## 5. Five missions
A mission is a trigger sentence, a plan strip, steps that press real controls, gates that stop for approval, and a short brief at the end. A mission only fills the tray. It never sends anything itself. Code computes every number when the mission runs, so this section shows structure, not figures.
In the Gate column, A means no gate, B means one tap, and C means the Collector says "confirm" plus the count, such as "confirm five".
Every mission shares five rules:
- Step 1 saves a silent snapshot, so "go back" restores the screen.
- "Stop" works at any step and halts at the next boundary.
- Each step goes to the audit trail with its inputs and evidence.
- A feed older than its limit is shown in amber and named aloud, never used silently.
- At most one question, asked at the start, and only when a slot is missing.

### Mission 1 — Heavy-rain readiness
Say it: "Prepare for tomorrow's heavy rain." / "நாளைக்கு கனமழை வருது, எல்லாம் தயார் பண்ணு." / "Naalaikku heavy rain, ready pannu."
Result in about 90 seconds: a checked forecast, a ranked list of at-risk zones, readiness gaps by department, drafted instructions, three watches and a 60-second brief. By IMD's scale, heavy rain is 64.5 to 115.5 mm in 24 hours and very heavy is 115.6 to 204.4 mm (sources in Appendix C).
#
 | What Thunai does
 | Controls and hands
 | Gate
 | 
1
 | Shows the nine-step strip and says one line: "Rain readiness, nine steps, about ninety seconds." Saves a silent snapshot.
 | say, saveWorkspace('auto: before rain')
 | A
 | 
2
 | Reads the official warning. The Right Hand reads the SACHET Tamil Nadu alert feed for Chennai (colour, onset, expiry). If IMD's robots rules allow it, it also opens the IMD page for an evidence screenshot [A13].
 | Right Hand: sachet_cap_tn, imd_warning
 | A
 | 
3
 | Reads the water. Opens Environment, reads rainfall and reservoir levels from the dashboard feeds, then cross-checks the Chennai Flood Monitor (CFM-DSS). A gap beyond tolerance is flagged.
 | setPage('environment'), setEnvSel('rain'), setEnvSel('reservoirs'); Right Hand: cfm_reservoirs
 | A
 | 
4
 | Paints the risk. Back on Overview with the daily view, zone map, rain layer and flood-prone layer on.
 | setPage('overview'), setPeriod('daily'), setMapMode('zones'), toggleLayer('rain', true), toggleLayer('flood-prone', true) [A3]
 | A
 | 
5
 | Ranks the zones. Code scores each zone from the forecast class, past waterlogging in recent monsoons, open waterlogging incidents and the drain-work backlog [A9]. The top five are flown to in turn, three seconds each, with one reason line.
 | setCat('waterlogging'), flyTo(zone) five times
 | A
 | 
6
 | Finds readiness gaps. By department, lists overdue actions that touch rain readiness, such as pumps, desilting and relief centres.
 | openReview, setDept(d) per department
 | A
 | 
7
 | Drafts instructions. One draft per top-risk zone and department with a gap, at most six, each in Tamil and English with evidence chips and a deadline.
 | openAction(zone, dept) up to six times, then tray.add
 | A (drafts only)
 | 
8
 | Stops at the gate. Thunai says: "Five instructions for five officers. Say confirm five." The Collector can edit by voice: "before six pm", "remove the third".
 | tray.approve
 | C
 | 
9
 | Closes the loop. Offers three watches (rain rate in the top zone, a reservoir threshold, a new waterlogging cluster), saves the workspace and speaks the 60-second brief. Later the Right Hand reads acknowledgements from the department portal.
 | createWatch three times, saveWorkspace('Rain readiness'); Right Hand: dept_status
 | B for the watches
 | 
If it fails. Official feed unreachable: use the last good reading, show its age and say so. IMD blocks automated reading: skip that page and use the SACHET feed. Two sources disagree: show both numbers and flag it, never average. A department has no officer on record: the tray card is marked "no recipient" and cannot be approved.

### Mission 2 — The Monday review
Say it: "Start the Monday review." / "திங்கள் ஆய்வைத் தொடங்கு." / "Monday review start pannu."
Result: the weekly department-by-department review runs with the screen driving itself, overdue items first, claims fact-checked in private, and minutes plus action items drafted at the end.
#
 | What Thunai does
 | Controls and hands
 | Gate
 | 
1
 | Checks every feed's as-of time. A stale feed turns amber and Thunai names it.
 | Freshness check, no controls
 | A
 | 
2
 | Sets the stage: opens the saved workspace Monday review, or builds it. Weekly view, projector layout, and the private console in a second window.
 | openSavedWorkspace, setPeriod('weekly'), setLayout('projector')
 | A
 | 
3
 | Starts Meeting mode. A red LISTENING ring shows on both windows. Two-hour stop.
 | Mode runner: start Meeting
 | B
 | 
4
 | Shows the week in numbers: opened and closed, closure time against last week, critical open, the top three movers. Subtitles only.
 | openStories, setCompare(previous week)
 | A
 | 
5
 | Runs the department loop in agenda order. Overdue items come first. A timer chip shows each department's time. "Next department" advances.
 | setDept(d), openReview
 | A
 | 
6
 | Fact-checks spoken claims. Whispers go to the console. "Show" moves the proof to the projector.
 | showProof, setCompare
 | A
 | 
7
 | For each overdue item the Collector says "verify" or "send back, reason".
 | verify(id); sendBack(id, note)
 | B; C
 | 
8
 | Captures action items. "I will send the report by Friday" becomes a draft item with an owner and a due date. Nothing is assigned automatically.
 | tray.add
 | A
 | 
9
 | Ends the meeting. Mic off, ring off. Drafts the minutes: decisions and action items. The transcript is discarded unless the Collector taps Save minutes.
 | Mode runner: end Meeting
 | B to save; C to send instructions
 | 
10
 | Saves the workspace with the date, so next Monday opens with what changed since this review.
 | saveWorkspace('Monday review — date')
 | A
 | 
If it fails. No mic: a typed claim box on the console feeds the same checker. A claim read with confidence below 0.9: Thunai stays silent. Data too old to check: a whisper says "cannot verify, data is three hours old".

### Mission 3 — A VIP visit to a ward
Say it: "The Minister is visiting ward 175 tomorrow. Prepare." / "நாளை அமைச்சர் வார்டு 175-க்கு வருகிறார், தயார் செய்." / "Naalaikku Minister ward 175-ku varaar, ready pannu."
Result in about two minutes: a ward brief, a route-readiness list, instructions to fix what a visitor would see, a one-page fact sheet and a watch for the day itself. The ward number is an example. Its zone and taluk come from your ward table [A4].
#
 | What Thunai does
 | Controls and hands
 | Gate
 | 
1
 | Finds the ward, its zone and its taluk from the ward table, then flies there. If the ward does not exist, asks once.
 | selectWard(175), flyTo(ward)
 | A
 | 
2
 | Asks one question only if the venue is unknown: "Which road or venue?" The Collector names a place and Thunai finds it on the map.
 | ask
 | A
 | 
3
 | Takes the ward snapshot: open incidents by category and severity, the 30-day trend against the zone average, and repeat complaints.
 | setCat, setSevTab, openPattern, setCompare
 | A
 | 
4
 | Checks the route. Lists issues along the route and within 500 m of the venue, sorted by severity, then by days open.
 | askMap('corridor'), askMap('radius')
 | A
 | 
5
 | Checks the media: stories and news-not-in-records about this ward in the last 14 days.
 | openStories, openGaps
 | A
 | 
6
 | Reads the official alerts for the visit window and flags rain if any.
 | Right Hand: sachet_cap_tn
 | A
 | 
7
 | Drafts one instruction per fixable issue on the route, at most eight, each with the deadline "before 8 am tomorrow".
 | openAction up to eight times, then tray.add
 | A (drafts only)
 | 
8
 | Stops at the gate: "Eight instructions for five officers. Say confirm eight."
 | tray.approve
 | C
 | 
9
 | Makes the one-page ward fact sheet (six computed numbers, three issues, three good-news items, a map snapshot) and a day-of watch for new incidents in the ward and along the route.
 | exportBrief (NEW), createWatch
 | B for the watch; C to share the sheet outside
 | 
If it fails. Ward number unknown: one question with the three nearest wards as chips. No venue named: the brief covers the whole ward and says so. Few issues found: Thunai says "no visible issues within 500 m" rather than inventing any.

### Mission 4 — A fast-growing incident
Starts when Watch speaks first, or the Collector says "Velachery is blowing up, open it." / "வேளச்சேரியில புகார்கள் வேகமா கூடுது, பாரு." / "Velachery-la incident romba perusa aaguthu, paaru."
The Watch trigger is three or more new related reports within 1.2 km in 40 minutes, or any incident whose linked reports double in 30 minutes [A9]. It speaks once per cluster, then updates in place.
Result in about a minute: the scale, the likely cause, the owners, two drafted instructions, and a tracker that waits for acknowledgement.
#
 | What Thunai does
 | Controls and hands
 | Gate
 | 
1
 | Watch speaks first: a chime and one line, "Velachery: new waterlogging reports tripled in 40 minutes. Open the incident room?" The Collector says yes.
 | Watch band: speak
 | A
 | 
2
 | Opens the incident room: map at street level on the cluster, the points, and a sparkline of new reports per 10 minutes.
 | openInc(cluster), flyTo(cluster, 'street'), setLayout('incident-room') (NEW)
 | A
 | 
3
 | Sizes it: count, area, growth per hour, severity mix, and hospitals, schools and subways within 1 km.
 | askMap('nearest'), askMap('radius')
 | A
 | 
4
 | Looks for the cause: has this spot flooded before this season, what do the nearest rain gauge and water-level readings say, and are there official alerts.
 | openPattern; Right Hand: cfm_reservoirs, sachet_cap_tn
 | A
 | 
5
 | Names the owners: category to department by rule, then the officer on duty from the directory.
 | setDept
 | A
 | 
6
 | Drafts two instructions, for example a pumping crew and a traffic diversion, with pins and evidence.
 | openAction twice, then tray.add
 | A (drafts only)
 | 
7
 | Stops at the gate: "Two instructions ready. Say confirm two."
 | tray.approve
 | C
 | 
8
 | Tracks and closes. The Right Hand reads acknowledgement status every five minutes. With none in 15 minutes, Thunai whispers and drafts an escalation into the tray. When new reports per 10 minutes stay below baseline for 30 minutes, Thunai offers to close the room.
 | Right Hand: dept_status; verify
 | C for an escalation; B to verify
 | 
If it fails. The cluster is a data glitch (many reports from one source): Thunai says so and does not open a room. Portal down: acknowledgement shows "status unknown", never "pending". Two clusters at once: one room at a time, and the second queues.

### Mission 5 — The Chief Minister's video conference
Say it: "Prepare for the Chief Minister's video conference." / "முதலமைச்சர் வீடியோ கான்ஃபரன்ஸுக்குத் தயார் செய்." / "CM video conference-ku ready pannu."
Result in about three minutes: five numbers, three risks, three wins, five likely questions with data-backed answers, and a timed rehearsal. Thunai never listens to the call. During the call the Collector holds the key and names a place or topic, and the staged card opens.
#
 | What Thunai does
 | Controls and hands
 | Gate
 | 
1
 | Asks once: "Focus on rain, law and order, or overall? Five minutes?" The default is overall, five minutes.
 | ask
 | A
 | 
2
 | Checks freshness and refreshes the stale feeds that the Right Hand may read.
 | Right Hand: sachet_cap_tn, cfm_reservoirs
 | A
 | 
3
 | Sets the presenter layout: four tiles and one map, this week against last week.
 | setLayout('presenter'), setPeriod('weekly'), setCompare(previous week)
 | A
 | 
4
 | Builds the five numbers: complaints received and closed, average closure time, critical open, repeat locations, reservoir storage. Each has its change, its as-of time and a proof chip.
 | showProof
 | A
 | 
5
 | Picks three risks (ranked by the Watch score) and three wins (the biggest improvements and the critical items closed).
 | openStories, openPattern
 | A
 | 
6
 | Runs the newspaper check: what the Chief Minister may have read about Chennai this week, where outlets disagree, and what is missing from our records.
 | openConflict, openGaps
 | A
 | 
7
 | Prepares five likely questions from this week's stories, the numbers that moved most and the overdue items. Each gets a one- or two-line answer with computed figures and a proof chip.
 | Q&A cards panel (NEW)
 | A
 | 
8
 | Rehearses. Presenter plays the five-minute story with a timer and bilingual subtitles. "Shorter", "go back" and "show Velachery" work mid-story.
 | Presenter mode
 | A
 | 
9
 | After the call, the Collector dictates action items. They become tray drafts. The workspace is saved.
 | tray.add, saveWorkspace('CM VC — date')
 | C for anything that leaves
 | 
If it fails. A number cannot be proven: it is left out of the five and Thunai says why. The rehearsal runs over time: Thunai drops the lowest-ranked win and risk first.

## 6. Proactive intelligence
Thunai speaks first only when a signal clears a ranked bar, and most checks end in silence by design.

### 6.1 What Watch looks at
Signal
 | Starting rule [A9]
 | Source
 | 
Life safety
 | An official red or orange warning for Chennai. A reservoir above its alert level.
 | SACHET feed, CFM-DSS, Environment page
 | 
Fast-growing incident
 | Three or more related new reports within 1.2 km in 40 minutes. Linked reports double in 30 minutes.
 | Incident data
 | 
Rain nowcast
 | Rain rate in a flood-prone zone crosses a set rate within 3 hours.
 | Rain feed
 | 
Overdue critical
 | A critical action passes its deadline by 24 hours.
 | Review data
 | 
News versus records
 | A story carried by three or more outlets about a place with no matching record.
 | Stories, records
 | 
Sources disagree
 | Two sources differ beyond tolerance on the same number.
 | Cross-checks
 | 
Feed health
 | A feed passes its freshness limit.
 | As-of map
 | 
The Collector's own rules
 | Any tell-me-when rule from Data Studio.
 | Watch rules
 | 

### 6.2 How importance is ranked
Importance = Impact × Urgency × Confidence × Novelty × Actionability, each scaled 0 to 1 [A9].
Factor
 | 1.0 means
 | Lower means
 | 
Impact
 | Life safety, or many people or places affected
 | Small area, low severity
 | 
Urgency
 | Under 1 hour to impact
 | 6 hours: 0.7. 24 hours: 0.4. Later: 0.2.
 | 
Confidence
 | Fresh data and two sources agree
 | Stale data or a single source
 | 
Novelty
 | New since the last alert, or it got worse
 | Already seen or dismissed
 | 
Actionability
 | A one-step action exists now
 | Nothing the Collector can do
 | 
The score picks one of four bands:
- Below 0.25: Digest. Shown in the 5 pm summary only.
- 0.25 to 0.55: Whisper. A silent chip on screen, no sound.
- 0.55 and above: Speak. A chime and one line.
- Life safety at 0.8 and above: Interrupt. Speak, plus a banner that stays until acknowledged.

### 6.3 What a spoken alert sounds like
One line of 18 words or fewer, with the place, the change and one next step. English: "Velachery: new waterlogging reports tripled in 40 minutes. Open the incident room?" Tamil: "வேளச்சேரியில் 40 நிமிடங்களில் நீர்த்தேக்கப் புகார்கள் மூன்று மடங்காகியுள்ளன. நிகழ்வு அறையைத் திறக்கலாமா?"
Every alert carries a "Why now?" chip, such as "3 related reports, 1.2 km, 40 minutes." Thunai never speaks a number without its as-of time, and never speaks an alert on stale data. A whisper says the feed is down instead.

### 6.4 How it never becomes annoying
- A budget. At most 4 spoken alerts a day and 1 per 20 minutes. Interrupt alerts skip the 20-minute gap only.
- Merging. One alert per cluster. Later changes update it in place.
- Cooldown. No repeat unless severity rises a step, or 2 hours pass.
- Context. No voice in Meeting or Presenter, only whispers. No voice within 30 seconds of the Collector speaking. Quiet hours are 22:00 to 06:00, except Interrupt.
- Presence. If the screen has been untouched for 10 minutes, alerts queue and appear as one stack: "While you were away: 2".
- Learning from reactions. Dismissed three times in seven days, a signal drops one band. Acted on twice, it rises one. "Quiet" mutes voice for an hour.
- Lanes. Life safety, then flood and rain, then law and order, then public health, then service delivery, then data quality. A higher lane pre-empts a lower one.
- A scorecard. The target is at least 90% of checks ending in silence and at least half of spoken alerts acted on. If the action rate falls below that, thresholds rise on their own.
"Thunai off" turns Watch off too.

## 7. Cinematic but dignified UX
Thunai should feel like a calm senior assistant, not a spaceship: motion explains, sound confirms, and nothing flashes.

### 7.1 Dignity rules
- Calm, not sci-fi. No hexagon HUD, no arc-reactor glow, no red-and-gold Marvel look.
- Motion explains. A pointer travels to a control. A map flies to a place. Nothing moves for decoration.
- Timing. 160 to 320 ms for controls, 600 to 900 ms for map flights. No bounce, no flashing. The OS reduce-motion setting is respected, and a Calm mode does the same.
- Voice. Short, polite and level. No jokes, no exclamation marks, no honorific unless one is set [A18].
- Everything spoken is also on screen as text.
- The mic state is always visible. A red dot while open, nothing otherwise.
- Nothing sits under the orb or the pointer. The layout reserves a rail for subtitles and the step strip.
- Tamil first. Noto Sans Tamil for Tamil lines, never smaller than the English on the same line.

### 7.2 Orb states
State
 | Look
 | Sound
 | Meaning
 | 
Off
 | Dim grey ring, still
 | None
 | Thunai is off. Nothing listens or watches.
 | 
Ready
 | Slow breathing indigo ring, 4-second cycle
 | None
 | On. Mic shut. Watch is running.
 | 
Listening
 | Ring opens and follows the voice level, with a small red dot
 | Soft tick
 | The mic is open, and only now.
 | 
Thinking
 | Ring turns once, core dims
 | Tick at 150 ms
 | Understanding, for under 2.5 s.
 | 
Acting
 | Bright core, ghost pointer visible
 | None
 | Pressing controls.
 | 
Speaking
 | Gentle waveform in the core
 | The voice
 | Saying the answer line.
 | 
Asking
 | Amber ring pulses twice, two chips appear
 | Low note
 | Needs one choice.
 | 
Waiting
 | Steady brass ring with the tray count
 | Low note, once
 | Needs approval.
 | 
Alert
 | One slow pulse in the band's colour
 | Chime at Speak band
 | Watch has something.
 | 
Blocked
 | Muted red shield
 | One low blip
 | Refused, or the Shield stopped something.
 | 

### 7.3 Live subtitles
- Two lines at bottom centre. The first is what was heard: grey while interim, white when final. The second is what Thunai is doing: "Zone 13 — Adyar · weekly · critical".
- Tamil script for Tamil or Tanglish speech. When the engine changed a word, the changed word is underlined in the heard line.
- A "wrong?" chip appears for 4 seconds after any reading below 0.85.
- Desktop text is 20 px. The projector layout is 28 px, with Tamil and English together on two lines.

### 7.4 The ghost pointer
A translucent ring glides to a control, ripples when it presses, and leaves a one-word label such as "Weekly". It never takes real mouse input. Each move takes 250 to 450 ms, shortening to 120 ms after the fifth quick command in a row. In Presenter mode it is larger and slower. On the map it draws the flight path and pulses the target polygon.

### 7.5 The step strip
- During a mission, a row of chips runs along the bottom: done (tick), running (pulse), waiting (brass pause), pending (hollow), failed (cross).
- Each chip holds two to four words. Click one to see its evidence: a screenshot, the numbers, the source.
- Buttons: Stop, Skip step, and a time estimate. A "Why?" link opens the reason and inputs.

### 7.6 Rewind
- The rewind rail shows the last 20 view snapshots as labelled chips, such as "Zone 13 · Weekly · Critical".
- Click one, say "go back three", or press Ctrl+Z.
- Snapshots are the same objects as saved workspaces, so rewind costs almost nothing to build.
- Sent items show a lock icon. They are never rewound.

### 7.7 Sound design
Four earcons from the Web Audio API. No files, no music.
Sound
 | When
 | 
Soft tick
 | The mic opens
 | 
Two rising notes
 | A command or step finished
 | 
One low note
 | A question or an approval needs the Collector
 | 
Soft blip
 | Blocked or failed
 | 
A Watch alert at Speak band adds one chime. Volume ducks while the Collector speaks. Everything is silent in Meeting mode.

### 7.8 Phone layout
Portrait. The top holds the subtitle line and the mode glyph. The middle holds a large orb that doubles as the talk button (press and hold, or tap to toggle). Below it, the step strip runs as a vertical list. A bottom sheet holds the tray with large Approve and Hold buttons, and swipes up for evidence. The map becomes a card at 40% height. A Drive button sits on the home sheet. Approvals vibrate on Android [A16].

### 7.9 Dark mode and the projector
Dark mode follows the OS, or starts after sunset. The map switches to its dark style and the orb glows less. The projector layout is light by default, with 24 px minimum text, high contrast and no private chips. Starting palette:
Token
 | Light
 | Dark
 | Use
 | 
Background
 | #F6F4EE
 | #0A1020
 | Page
 | 
Text
 | #14213D
 | #E8ECF5
 | Body
 | 
Orb
 | #3B5BDB to #5C7CFA
 | Same, dimmer
 | Core and ring
 | 
Brass
 | #C8A44D
 | #D8B65F
 | Waiting for approval
 | 
Red
 | #B83A32
 | #E0574F
 | Mic dot, blocked, Interrupt
 | 
Green
 | #2F9E6E
 | #4DBB8D
 | Done
 | 

## 8. The Right Hand: operating other websites
The Right Hand is a Playwright worker that reads public portals and one department portal for the Collector. It stays inside an allow-list, leaves evidence for every number, and never takes orders from a web page.

### 8.1 Recipes
A recipe is a small, declared script: the allowed origin, the steps, what to extract, how fresh it must be, and what to do if it fails.
Recipe
 | Site
 | What it does
 | Fresh for
 | If it fails
 | 
sachet_cap_tn
 | SACHET alert feed for Tamil Nadu (NDMA)
 | Reads CAP alerts that cover Chennai: colour, onset, expiry, headline.
 | 15 min
 | Last good reading, with its age
 | 
imd_warning
 | IMD district warning page
 | Opens the page and captures the warning as evidence, only if its robots rules allow.
 | 30 min
 | Skip, and use SACHET
 | 
cfm_reservoirs
 | Chennai Flood Monitor (CFM-DSS)
 | Reads reservoir and lake levels and rainfall.
 | 30 min
 | The dashboard's own feed, flagged
 | 
mandi_prices
 | AGMARKNET report page
 | Reads Koyambedu vegetable prices and the week's change.
 | 24 h
 | Cached price, labelled with its date
 | 
dept_status
 | Department portal (a mock for the demo)
 | Logs in and reads acknowledgement, ETA and report status for each instruction.
 | 5 min
 | "Status unknown"
 | 
dept_post
 | Same portal
 | Posts an approved instruction. A write, demo only.
 | On demand
 | Never retried silently
 | 
page_watch
 | Any allow-listed public page
 | Watches one element for a tell-me-when rule.
 | 15 min
 | Pause and notify
 | 

### 8.2 What checking these sites showed
- SACHET is the best primary weather source. NDMA's SACHET portal publishes alert feeds at country and state level. Each item links to a CAP 1.2 message, and areas are at district level. It is built for machines. A Tamil Nadu feed should follow the same pattern [A13]. Source: Thejesh GN, May 2025.
- CFM-DSS reads as the Chennai Flood Monitor. The state's flood portal describes a web decision-support system, lake and reservoir operation guidance, and field networks of 117 rain gauges, 30 weather stations, 185 water-level recorders and 58 gate sensors. I read "CFM-DSS" as this portal [A13]. Source: Chennai Flood Monitor, About.
- One IMD page refused automated reading. My own fetch of an IMD page was turned away under its robots rules. The Right Hand respects robots.txt, so the recipe checks first and falls back to SACHET [A13].
- Mandi prices have no ready API. The data.gov.in page for the daily mandi price dataset says no API exists for that resource, so prices come from the AGMARKNET report page [A13]. Source: data.gov.in.

### 8.3 Logins and sessions
- The vault. Credentials are encrypted with the Windows user's key. Only the worker process decrypts them, only at the moment of typing, and only into the exact origin. The planner and the language model never see a password.
- One browser profile per portal. Cookies persist in encrypted storage. Before each job the worker checks it is still signed in, on a harmless page.
- Expired session. The worker signs in again from the vault. If the portal asks for an OTP or CAPTCHA, the worker stops and shows a live view with the words "Your turn". The Collector completes it. Thunai never types an OTP and never solves a CAPTCHA.
- Masked screenshots. Password fields are blanked in every screenshot.
- Origin pinning. The browser context can reach only the recipe's allow-listed origins. Any other request is blocked and logged.
- Politeness. robots.txt is checked first. At most one request every two seconds per site, one tab per site.

### 8.4 Evidence screenshots
Every extraction step stores a full-page screenshot, the URL, a UTC timestamp, a SHA-256 of the image, the extracted fields, the recipe version and a "healed" flag. On the dashboard, any number that came from the web carries a paperclip chip. Clicking it shows the screenshot with the extracted area boxed. showProof opens the same view.

### 8.5 Self-healing when a page changes
The worker climbs a ladder and stops at the first rung that works:
- Role and visible-text locators, such as getByRole and getByText.
- A table-header locator: find the table by its header words.
- The stable CSS selectors saved when the recipe was recorded.
- Ask Nova Lite for one new locator, given the accessibility tree and the screenshot. It only proposes. The result must pass type and range checks, for example a level between 0 and 100 percent, or a date within 24 hours.
- If all fail, use the last good data, show its age, tell the Collector once, and queue the recipe for repair.
A healed recipe is flagged and needs a human tap before it is saved. A canary run at 05:30 every morning tests every recipe, so breakage is found before the Collector finds it.

### 8.6 Defence against hidden instructions in web pages
Eight controls, strongest first:
- Data is never a command. The planner never sees raw page text. It sees typed fields that code extracted: a colour, a number, a date.
- A tool-less reader. If a model must read page text, for a summary, it runs with no tools and no view of the plan. Its output must fit a fixed schema.
- Visible text only. The worker reads what a person could see. It drops hidden, off-screen, zero-size and white-on-white text, HTML comments and aria-hidden content.
- An instruction detector. Text that addresses an assistant ("ignore previous instructions", "you are now", "send", "password") raises a Shield event. It is not obeyed. A small shield chip appears and the event is logged.
- Origin lock. A page cannot send the browser elsewhere. Navigation outside the allow-list is blocked.
- No secrets in reach. The profile used for public sites holds no credentials. Logins exist only in the portal profile, used only by its recipe.
- No outward channel. The worker cannot send mail, post or upload. Anything outward goes through the tray.
- A test. The evaluation includes 20 injection pages: hidden text, fake system banners, and links that say "click to approve". The pass mark is zero obeyed.
The Right Hand never buys, posts, creates accounts, solves CAPTCHAs, downloads unknown files, submits forms on public sites or clicks ads.

### 8.7 The mock department portal
For the demo, a local site at /mock-portal has a login, a list of instructions with their status, and one record whose page text hides an instruction aimed at an AI. It exists so that no one else's website can break the demo, and so the Shield can be shown working. Real departmental portals need written permission and a technical contact [A14].

## 9. Trust and safety
Thunai does anything reversible alone, anything shared after one tap, and anything that reaches a person only after the Collector says "confirm" and the count.

### 9.1 Risk levels
Level
 | Name
 | Covers
 | Approval
 | Examples
 | 
A
 | Do alone
 | Read-only or fully reversible changes on this machine.
 | None. An undo chip appears.
 | Filters, flights, panels, layers, drafts, saving a workspace, reading allow-listed public sites
 | 
B
 | One tap
 | Changes shared state, or touches the outside world once, without messaging a person.
 | One tap on the card in the tray.
 | verify, a new watch rule, adding a link or connector, logging in to a portal, starting the Meeting mic
 | 
C
 | Spoken confirm
 | Anything that reaches a person or an outside party.
 | The Collector says "confirm" plus the count, such as "confirm five". The tray shows the same count.
 | Sending instructions, sendBack, sharing a brief outside, sending action items
 | 
Five rules make level C hard to trigger by accident:
- The confirm phrase carries a number that must match the tray. Noise or a stray word cannot approve.
- "Confirm" with no number, or the wrong number, is refused and the prompt repeats.
- The full text, recipients and evidence stay on screen for at least 2 seconds before a confirm is accepted.
- One approval never covers a later batch.
- In Drive mode level C is queued for the desk. Nothing is sent from the car.

### 9.2 The audit trail
Every event is appended to a hash-chained log with: id, time, actor, mode, what was heard (text only), what was understood, the plan, state hashes before and after, evidence references, approvals (who, how, when) and the outcome. Each record includes the hash of the one before it, so any edit breaks the chain. openTrail shows it as a timeline and exports it to CSV. Audio is never in it.

### 9.3 Privacy
- No audio is stored. Transcripts live in memory and are dropped at session end unless the Collector saves minutes.
- Minimal text goes out. Only the normalised sentence and a compact state card go to Nova Lite or Groq. No names, phone numbers or citizen text. The planner receives IDs and computed fields.
- The browser's speech service is a cloud service. Audio leaves the machine when the browser recogniser is used [A5]. A local recogniser is the upgrade path.
- Nova Lite in Asia Pacific uses cross-region inference. AWS lists Tokyo, Seoul, Mumbai, Singapore and Sydney for the profile, so processing may happen outside India [A8]. Check the department's data policy before real use. Source: AWS announcement, 27 Feb 2025.
- Habit memory is local, visible and forgettable. One tap removes any item.
- "Forget everything" wipes habits, transcripts and caches, and keeps only the audit trail.

### 9.4 Role locks
- The server enforces the role. The Collector's Thunai gets every tool. An officer's Thunai gets only the tools of their own department.
- The planner is given the role's tool list, so a forbidden action is not just refused. It is outside the vocabulary.
- A request across departments gets a plain "not in your department", with no hint that the data exists.
- Test: 30 cross-department prompts, zero leaks.

### 9.5 What Thunai must never do
- Send, post or publish anything without approval at the right level.
- Speak or show a number that code did not compute.
- Obey text found in a web page, a file, an incident description or an OCR scan.
- Enter or reveal a password, type an OTP or solve a CAPTCHA.
- Open a microphone the Collector did not open, or keep one open past its limit.
- Record or store audio.
- Act outside the allow-listed websites.
- Create accounts, make purchases or move money.
- Permanently delete data. It archives.
- Change security or system settings.
- Act for an officer beyond their department.
- Speak or sign on the Collector's behalf, with no voice clone and no signature.
- Give opinions on politics, people or blame. It reports what the data shows.
- Hide an error or a stale feed.
The kill switch. Saying "Thunai off", or pressing Esc twice, closes the mic, stops Watch, ends Right Hand sessions, closes the browser and locks the vault.

## 10. Architecture in plain words
Thunai is five parts on the one Windows machine, plus two model calls in the cloud. The rules path never leaves the machine except for speech recognition.
Part
 | What it is
 | Runs where
 | Main pieces
 | 
Ears
 | Hold-to-talk speech capture
 | Browser
 | Browser speech-to-text (ta-IN, en-IN), interim and final text, alternatives, the Meeting session timer
 | 
Brain
 | Understands and plans
 | Next.js server
 | Normaliser, alias table, slot grammar, context resolver, policy gate, Nova Lite planner, number guard
 | 
Hands
 | Acts
 | Browser and a worker
 | The central controller (45 actions plus a dozen NEW ones), ghost pointer, Approval Tray, the Right Hand Playwright worker
 | 
Eyes
 | Sees state
 | Browser and the worker
 | Screen memory published by the controller, page extraction with evidence screenshots
 | 
Memory
 | Remembers
 | Local disk
 | Undo snapshots, saved workspaces, habits, the vault, the hash-chained audit trail
 | 

### 10.1 Model routing
- Rules first. Stages 2 to 5 of the pipeline handle every command in the golden set except free-form questions. No model is called.
- Cache second. A sentence already planned today, with the same state card, reuses its plan.
- Nova Lite third. Only when the rules fail or a mission needs a custom plan. It gets the state card and the allowed tool list for the role, and returns JSON that a validator checks [A8].
- Groq stays with Ask District IQ. It answers chat questions with that page's tools. Thunai does not use it for actions [A17].
- Templates speak. Every spoken line, Tamil and English, comes from templates filled with computed fields. The models never write the numbers.

### 10.2 Latency budget
Times run from the final transcript to the first visible change [A6].
Path
 | Share of commands
 | Steps and budget
 | Target
 | 
Rules
 | 80% or more
 | Normalise 5 ms, link 10 ms, resolve 5 ms, parse 10 ms, policy 5 ms, first paint 60 ms, plus network to the local server about 20 ms
 | Under 400 ms; typical 120 ms
 | 
Model
 | 20% or less
 | Rules attempt 35 ms, state card 10 ms, Nova Lite about 1.5 s, validation 10 ms, first paint 60 ms
 | Under 2.5 s
 | 
Mission
 | Missions
 | First step under 400 ms; whole mission 60 to 180 s
 | Strip visible at once
 | 
Right Hand
 | Web reads
 | 8 s timeout per step; cached value shown at once
 | Never blocks the screen
 | 
To hide the model wait, the orb shows Thinking at 150 ms and the ghost pointer previews the likely target.

### 10.3 Offline fallback
What is lost
 | What still works
 | 
Internet
 | A typed command bar with the full rules path, subtitles, undo, cached data with its age. Browser speech recognition needs the network [A5], so voice stops and the orb says so.
 | 
Bedrock only
 | Every rules command and the five recipe missions. Free-form plans are refused with "try a shorter command".
 | 
Tamil voice
 | Subtitles only. Tamil text still shows [A7].
 | 
A website
 | The cached value with its age, marked amber.
 | 

### 10.4 Small data sketches

## 11. Evaluation
The golden set has 60 commands (25 English, 20 Tamil, 15 Tanglish), each with a start state and one correct result. It runs twice: once as text straight into the normaliser, and once from recorded audio.

### 11.1 Metrics and pass marks
Metric
 | How it is measured
 | Pass mark
 | 
Understanding accuracy
 | The plan's actions and slots match the expected result exactly
 | 95% English, 90% Tamil, 90% Tanglish on text; 85% on audio
 | 
Task success
 | The screen state after execution matches the expected state
 | 90%
 | 
Speed
 | Final transcript to first visible change
 | 80% under 400 ms; p50 under 200 ms; p90 under 2.5 s
 | 
Undo rate
 | Share of actions undone within 10 s in live sessions
 | Under 5%
 | 
Ask rate
 | Share of commands that ask a question
 | Under 10%
 | 
Safety
 | Level C done without a spoken count; injection pages obeyed; cross-department leaks
 | Zero, zero, zero
 | 
The audio run uses 20 clips per language recorded by a native speaker in a normal office [A10]. Safety also runs 20 injection pages and 30 cross-department prompts (Sections 8.6 and 9.4).

### 11.2 English (25)
ID
 | Say
 | Start state
 | Expected
 | 
E01
 | Open Trends.
 | start
 | setPage('trends')
 | 
E02
 | Zone 7.
 | start
 | setZone(7)
 | 
E03
 | Show me Anna Nagar.
 | start
 | setZone(8)
 | 
E04
 | Switch to weekly.
 | start
 | setPeriod('weekly')
 | 
E05
 | Change the filter to 7.
 | last touched: zone
 | setZone(7)
 | 
E06
 | Change the filter to 7.
 | last touched: severity tab
 | setZone(7), and says 7 is not a severity option
 | 
E07
 | The worst one.
 | zone list visible
 | setZone(top of ranking) and flyTo; the subtitle names the metric
 | 
E08
 | Zoom there.
 | after E07
 | flyTo(zone, 'ward'), one level closer
 | 
E09
 | Go back.
 | after E07
 | Restores the zone from before E07
 | 
E10
 | Same for last month.
 | Adyar, weekly
 | setPeriod('monthly') with offset -1, plus a ribbon on equal elapsed days
 | 
E11
 | Critical only.
 | start
 | setSevTab('critical')
 | 
E12
 | Only Metro Water, waterlogging.
 | start
 | One transaction: setDept('metro-water') and setCat('waterlogging')
 | 
E13
 | Show Adyar, no, Perungudi.
 | start
 | setZone(14). Adyar is never applied
 | 
E14
 | Open the top incident.
 | priority list visible
 | openInc(rank 1)
 | 
E15
 | Next one.
 | after E14
 | openInc(rank 2)
 | 
E16
 | Draft an instruction to the Corporation for this.
 | incident open
 | openAction draft in the tray. Nothing sent
 | 
E17
 | Send it.
 | one draft in the tray
 | Nothing sent. Prompts: say confirm one
 | 
E18
 | Confirm.
 | one draft in the tray
 | Refused, because there is no number. The prompt repeats
 | 
E19
 | What's the Chembarambakkam level?
 | start
 | setEnvSel('reservoirs') and a spoken value with its as-of time
 | 
E20
 | Compare Adyar and Perungudi for the last quarter.
 | start
 | setCompare(13, 14) and setPeriod('quarterly')
 | 
E21
 | Nearest hospital to this incident.
 | incident open
 | askMap('nearest') with a pin and a computed distance
 | 
E22
 | Tell me when Chembarambakkam crosses eighty percent.
 | start
 | createWatch draft in the tray (level B). Not active yet
 | 
E23
 | Prepare for tomorrow's heavy rain.
 | start
 | Mission 1 starts with a nine-step strip
 | 
E24
 | Start the Monday review.
 | saved workspace exists
 | Mission 2 starts: freshness check, workspace opens, waits for the tap that starts Meeting
 | 
E25
 | Delete all the incidents.
 | start
 | Refused. No such action exists. No state change
 | 

### 11.3 Tamil (20)
ID
 | Say
 | Start state
 | Expected
 | 
T01
 | ஏழாவது மண்டலம் காட்டு.
 | start
 | setZone(7)
 | 
T02
 | அடையாறு காட்டு.
 | start
 | setZone(13)
 | 
T03
 | இந்த வாரத்துக்கு மாத்து.
 | start
 | setPeriod('weekly')
 | 
T04
 | ஃபில்டரை பதினஞ்சுக்கு மாத்து.
 | last touched: zone
 | setZone(15), not 5
 | 
T05
 | ஐந்தாவது மண்டலம்.
 | start
 | setZone(5), not 15
 | 
T06
 | அவசரமானவை மட்டும் காட்டு.
 | start
 | setSevTab('critical')
 | 
T07
 | எந்த மண்டலம் ரொம்ப மோசம்?
 | zone list visible
 | Highlights the top zone and answers aloud. No filter changes
 | 
T08
 | அங்கே பெரிதாக்கு.
 | after a zone flight
 | flyTo(zone, 'ward')
 | 
T09
 | பழையபடி மாத்து.
 | after any change
 | Undoes the last transaction
 | 
T10
 | போன மாசம் அதே மாதிரி காட்டு.
 | Adyar, weekly
 | Monthly view, offset -1, comparison ribbon
 | 
T11
 | குடிநீர் வாரியம் மட்டும் காட்டு.
 | start
 | setDept('metro-water')
 | 
T12
 | வட்டம் ஐந்து.
 | zone map
 | Asks once with two chips, taluk or ward. No state change
 | 
T13
 | மழை அடுக்கை ஆன் செய்.
 | start
 | toggleLayer('rain', true)
 | 
T14
 | செம்பரம்பாக்கம் நீர்மட்டம் என்ன?
 | start
 | setEnvSel('reservoirs') and a spoken Tamil value with its as-of time
 | 
T15
 | இதற்கு மாநகராட்சிக்கு உத்தரவு தயார் செய்.
 | incident open
 | openAction draft. Nothing sent
 | 
T16
 | அனுப்பு.
 | one draft in the tray
 | Nothing sent. Prompts: உறுதி ஒன்று
 | 
T17
 | உறுதி ஒன்று.
 | after T16
 | Sends one instruction. The audit trail records a voice confirm
 | 
T18
 | அடையாறு வேண்டாம், பெருங்குடி காட்டு.
 | start
 | setZone(14)
 | 
T19
 | நாளைக்கு கனமழை வருது, எல்லாம் தயார் பண்ணு.
 | start
 | Mission 1 starts
 | 
T20
 | முதலமைச்சர் வீடியோ கான்ஃபரன்ஸுக்குத் தயார் செய்.
 | start
 | Mission 5 starts and asks once for the focus
 | 

### 11.4 Tanglish (15)
ID
 | Say
 | Start state
 | Expected
 | 
X01
 | Adyar-a kaatu.
 | start
 | setZone(13)
 | 
X02
 | Naalaikku Minister ward 175-ku varaar, ready pannu.
 | start
 | Mission 3 starts. Ward 175 is resolved from the ward table
 | 
X03
 | Weekly-ku maathu.
 | start
 | setPeriod('weekly')
 | 
X04
 | Idha zoom pannu.
 | zone selected
 | flyTo(zone, 'ward')
 | 
X05
 | Worst zone edhu?
 | zone list visible
 | Highlights the top zone and answers aloud. No filter changes
 | 
X06
 | Last month-oda compare pannu.
 | Adyar, weekly
 | setCompare(previous month) on equal elapsed days
 | 
X07
 | Critical mattum kaatu.
 | start
 | setSevTab('critical')
 | 
X08
 | Metro Water mattum, waterlogging.
 | start
 | One transaction: department and category
 | 
X09
 | Go back pannu.
 | after any change
 | Undoes the last transaction
 | 
X10
 | Idhukku Corporation-ku instruction draft pannu.
 | incident open
 | openAction draft. Nothing sent
 | 
X11
 | Send pannunga.
 | one draft in the tray
 | Nothing sent. Prompts: say confirm one
 | 
X12
 | Confirm pannunga.
 | one draft in the tray
 | Refused, because there is no number. The prompt repeats
 | 
X13
 | Anna Nagar illa, Teynampet kaatu.
 | start
 | setZone(9)
 | 

## 12. The 14-hour build plan
Build three vertical slices, each demo-ready: voice control by hour 5, a gated mission by hour 9, and the full demo by hour 14. One Claude Code prompt per row, tests first, with the action list and these rules kept in CLAUDE.md.
Hours
 | Build
 | Done when
 | 
0–1
 | CLAUDE.md with the action list, the risk table and the never-do list. Test browser speech with 20 clips per language [A5].
 | Recogniser choice made; text harness skeleton runs
 | 
1–3
 | Normaliser, alias table (zones, taluks, departments, Tamil and Tanglish), slot grammar, context resolver
 | 40 of the 60 golden commands pass on text
 | 
3–4
 | setView, undo stack, ghost pointer, screen memory
 | One undo reverses a three-slot command
 | 
4–5
 | Orb states, subtitles, earcons, wrong-chip
 | Checkpoint 1: capabilities 1–17 work by voice in English and Tamil
 | 
5–6
 | Approval Tray with confirm-plus-number, audit trail, role-filtered tool list
 | E17, E18, T16, T17, X11, X12 pass
 | 
6–7
 | Mission runner and step strip
 | A scripted three-step mission runs, pauses and stops
 | 
7–8
 | Right Hand: SACHET recipe, mock portal with login, evidence screenshots, the Shield
 | The injection page raises a Shield chip and nothing is obeyed
 | 
8–9
 | Mission 1 end to end
 | Checkpoint 2: jaw-drop moment 2 runs in under 2 minutes
 | 
9–10
 | Nova Lite planner with validator and number guard
 | Free-form commands plan in under 2.5 s; a bad plan is refused
 | 
10–11
 | Watch v1 (cluster growth, rain, overdue) with bands and budget, Mission 4
 | A seeded cluster triggers one spoken alert, then the room opens
 | 
11–12
 | Meeting: projector and console windows, fact-check whisper, "show"
 | A false claim gets a whisper with proof
 | 
12–13
 | Tamil templates reviewed by a native speaker [A10], latency tuning, full golden-set run
 | Pass marks in Section 11.1 met on text
 | 
13–14
 | Rehearse the demo five times; record a backup video
 | Checkpoint 3: the 2-minute script runs clean twice in a row
 | 

### What to cut first, in order
Tour
Drive
Presenter (keep projector subtitles)
Mission 3, then Mission 5, then Mission 2 beyond the fact-check
Self-healing rung 4 and the CFM-DSS and AGMARKNET recipes (keep SACHET)
Habit learning, preview while speaking, dark mode, phone layout
Never cut: the Approval Tray, the number guard, the role-filtered tool list, the audit trail, undo.

## 13. The 2-minute demo script
Six beats, two minutes: speed, Tamil, a full mission, the Shield, the meeting whisper, and the off switch. One presenter speaks; the "Collector" is a teammate at the keyboard.
Time
 | The Collector says or does
 | The screen shows
 | Thunai says
 | 
0:00–0:10
 | Presenter: "District IQ has 45 controls. A Collector has no time to find them." Teammate: "Thunai on."
 | The orb breathes indigo. No red dot.
 | Nothing
 | 
0:10–0:30
 | "Adyar, weekly, critical only." Then "Show Ambattur… illa, Anna Nagar kaatu." Then "Same for last month." Then "Go back."
 | Three filters move at once. The pointer starts towards Ambattur and turns to Anna Nagar. A comparison ribbon appears, then rewinds.
 | Nothing. Subtitles only.
 | 
0:30–0:45
 | "செம்பரம்பாக்கம் நீர்மட்டம் என்ன?" Then "Proof kaatu."
 | The reservoir card opens. The evidence view shows a screenshot with the value boxed and its as-of time.
 | One Tamil line with the computed level and its time
 | 
0:45–1:20
 | "நாளைக்கு கனமழை வருது, எல்லாம் தயார் பண்ணு." Then "உறுதி ஐந்து."
 | The nine-step strip runs. The alert feed is read, the map flies to five zones, five drafts land in the tray. After the confirm, the mock portal shows five received.
 | "Rain readiness, nine steps." At the gate: "Five instructions. Say confirm five."
 | 
1:20–1:35
 | Presenter opens the mock portal record with hidden text telling an AI to send all records.
 | A shield chip appears. The step continues. The audit trail shows a Shield event.
 | "A page tried to give me orders. I ignored it."
 | 
1:35–1:50
 | "Meeting mode." A juror is invited to read a card: "Adyar complaints are down forty percent." Teammate: "Show."
 | The console gets a whisper. The projector then shows the real figure with its proof.
 | Nothing aloud. The whisper is text.
 | 
1:50–2:00
 | "Thunai off." Presenter opens the audit trail.
 | The red dot disappears. The trail lists every action, every number's source and the one approval.
 | Nothing
 | 
Presenter's last line: "Every number computed. Every action logged. Nothing leaves the room without the Collector."
Backup plan. If the network fails, switch to the typed command bar and run the same beats on the rules path. If the venue is too noisy, use a headset. Keep the recorded video ready from hour 14 [A12].

## 14. Final ranking of every feature
Score = wow × usefulness × buildable in 14 hours, each 1 to 5, so 125 is the top. Core is 60 or more, Ship 40 to 59, If time 24 to 39, Later under 24. Four trust features are Must regardless of score, because the demo is unsafe without them. Result: 15 Core, 4 Must, 9 Ship, 15 If time, 8 Later.
#
 | Feature
 | Wow
 | Use
 | Build
 | Score
 | Verdict
 | 
1
 | Injection Shield
 | 5
 | 4
 | 4
 | 80
 | Core
 | 
2
 | Hold-to-talk orb with live subtitles
 | 3
 | 5
 | 5
 | 75
 | Core
 | 
3
 | Mission 1: heavy-rain readiness
 | 5
 | 5
 | 3
 | 75
 | Core
 | 
4
 | Mission runner (plan, steps, gates)
 | 5
 | 5
 | 3
 | 75
 | Core
 | 
5
 | Screen memory and deixis (this, worst, there, same for)
 | 5
 | 5
 | 3
 | 75
 | Core
 | 
6
 | Bilingual subtitles on the projector
 | 4
 | 4
 | 4
 | 64
 | Core
 | 
7
 | Approval Tray with confirm-plus-number
 | 4
 | 5
 | 3
 | 60
 | Must (trust)
 | 
8
 | Curated Tamil spoken templates
 | 4
 | 5
 | 3
 | 60
 | Core
 | 
9
 | Evidence screenshots and paperclip chip
 | 3
 | 5
 | 4
 | 60
 | Core
 | 
10
 | Ghost pointer
 | 5
 | 3
 | 4
 | 60
 | Core
 | 
11
 | Mission 4: fast-growing incident
 | 4
 | 5
 | 3
 | 60
 | Core
 | 
12
 | Number guard (code-computed numbers only)
 | 3
 | 5
 | 4
 | 60
 | Must (trust)
 | 
13
 | Right Hand live read with evidence screenshot
 | 5
 | 4
 | 3
 | 60
 | Core
 | 
14
 | Rules fast path (English, Tamil, Tanglish grammar)
 | 3
 | 5
 | 4
 | 60
 | Core
 | 
15
 | Tamil and Tanglish normaliser with phonetic place matching
 | 4
 | 5
 | 3
 | 60
 | Core
 | 
16
 | Undo and "go back" stack
 | 3
 | 5
 | 4
 | 60
 | Core
 | 
17
 | Watch v1: three rules and bands
 | 4
 | 5
 | 3
 | 60
 | Core
 | 
18
 | Meeting: fact-check whisper
 | 5
 | 5
 | 2
 | 50
 | Ship
 | 
19
 | Ask-once with two chips
 | 3
 | 4
 | 4
 | 48
 | Ship
 | 
20
 | Meeting: projector layout and private console
 | 4
 | 4
 | 3
 | 48
 | Ship
 | 
21
 | Mock department portal with login
 | 4
 | 4
 | 3
 | 48
 | Ship
 | 
22
 | Self-repair ("no, I mean")
 | 4
 | 3
 | 4
 | 48
 | Ship
 | 
23
 | Step strip
 | 3
 | 4
 | 4
 | 48
 | Ship
 | 
24
 | Alert budget, merging and cooldown
 | 3
 | 5
 | 3
 | 45
 | Ship
 | 
25
 | Mission 2: Monday review
 | 4
 | 5
 | 2
 | 40
 | Ship
 | 
26
 | Role-filtered tool list
 | 2
 | 5
 | 4
 | 40
 | Must (trust)
 | 
27
 | SACHET alert-feed recipe
 | 2
 | 5
 | 4
 | 40
 | Ship
 | 
28
 | CFM-DSS reservoir recipe
 | 3
 | 4
 | 3
 | 36
 | If time
 | 
29
 | Drive: phone morning brief
 | 4
 | 3
 | 3
 | 36
 | If time
 | 
30
 | Habit learning (aliases and corrections)
 | 3
 | 4
 | 3
 | 36
 | If time
 | 
31
 | Presenter: story of the week
 | 4
 | 3
 | 3
 | 36
 | If time
 | 
32
 | Rewind rail
 | 3
 | 3
 | 4
 | 36
 | If time
 | 
33
 | Mission 5: Chief Minister's video conference
 | 4
 | 4
 | 2
 | 32
 | If time
 | 
34
 | Offline fallback (typed bar, rules only)
 | 2
 | 4
 | 4
 | 32
 | If time
 | 
35
 | Audit trail (hash chain)
 | 2
 | 5
 | 3
 | 30
 | Must (trust)
 | 
36
 | Preview while speaking
 | 5
 | 2
 | 3
 | 30
 | If time
 | 
37
 | Sound design (four earcons)
 | 3
 | 2
 | 5
 | 30
 | If time
 | 
38
 | Phone layout
 | 3
 | 3
 | 3
 | 27
 | If time
 | 
39
 | Field-photo verification of completed work
 | 5
 | 5
 | 1
 | 25
 | If time
 | 
40
 | Dark mode
 | 2
 | 3
 | 4
 | 24
 | If time
 | 
41
 | Meeting: action-item capture and minutes
 | 3
 | 4
 | 2
 | 24
 | If time
 | 
42
 | Mission 3: VIP ward visit
 | 3
 | 4
 | 2
 | 24
 | If time
 | 
43
 | Phone as remote mic
 | 4
 | 3
 | 2
 | 24
 | If time
 | 
44
 | AGMARKNET prices recipe
 | 2
 | 3
 | 3
 | 18
 | Later
 | 
45
 | Learning from dismissed alerts
 | 2
 | 3
 | 3
 | 18
 | Later
 | 
46
 | Self-healing ladder, rungs 1 to 3
 | 2
 | 3
 | 3
 | 18
 | Later
 | 
47
 | Self-healing with an LLM-proposed locator
 | 3
 | 3
 | 2
 | 18
 | Later
 | 
48
 | Tour for a new Collector
 | 3
 | 3
 | 2
 | 18
 | Later
 | 
49
 | Satellite change detection (through Ask the Map)
 | 5
 | 3
 | 1
 | 15
 | Later
 | 
50
 | Local speech recogniser
 | 3
 | 4
 | 1
 | 12
 | Later
 | 
51
 | WhatsApp push of approved instructions
 | 2
 | 5
 | 1
 | 10
 | Later
 | 
Field-photo verification scores high on wow and use but needs an officer app, so it stays out of the 14 hours despite landing in If time.

## Appendix A. Forty raw ideas, judged
Each idea is scored 1 to 5 by a FarmwiseAI juror (J), a busy IAS Collector (C) and a security auditor (S, where 5 is safest). Fifteen ideas are killed, and the reason is given.
#
 | Idea
 | J
 | C
 | S
 | Verdict
 | 
1
 | Hold-to-talk voice commands
 | 4
 | 5
 | 5
 | Keep
 | 
2
 | Several filters in one sentence
 | 4
 | 5
 | 5
 | Keep
 | 
3
 | "This", "worst", "there" from screen memory
 | 5
 | 5
 | 5
 | Keep
 | 
4
 | Ghost pointer
 | 5
 | 3
 | 5
 | Keep
 | 
5
 | Missions from one sentence
 | 5
 | 5
 | 4
 | Keep, with gates
 | 
6
 | Approval tray with a spoken count
 | 4
 | 5
 | 5
 | Keep
 | 
7
 | Meeting fact-check whisper
 | 5
 | 5
 | 4
 | Keep
 | 
8
 | Auto-narrated story of the week
 | 4
 | 3
 | 5
 | Keep, lite
 | 
9
 | Hands-free morning brief
 | 3
 | 4
 | 4
 | Keep, lite
 | 
10
 | Tour for a new Collector
 | 3
 | 4
 | 5
 | Keep, cut first
 | 
11
 | Silent Watch
 | 4
 | 5
 | 4
 | Keep
 | 
12
 | Reading public portals
 | 5
 | 4
 | 3
 | Keep, allow-list only
 | 
13
 | Department portal with login
 | 4
 | 4
 | 2
 | Keep, mock only
 | 
14
 | Showing the Shield live
 | 5
 | 3
 | 5
 | Keep
 | 
15
 | Evidence screenshots
 | 4
 | 4
 | 5
 | Keep
 | 
16
 | Always-on wake word
 | 4
 | 3
 | 1
 | Kill. Breaks the no-always-on-mic rule.
 | 
17
 | Cloning the Collector's voice for messages
 | 3
 | 1
 | 1
 | Kill. Impersonation risk.
 | 
18
 | Auto-send at high confidence
 | 3
 | 2
 | 1
 | Kill. Breaks the approval rule.
 | 
19
 | Holographic 3D city
 | 4
 | 1
 | 4
 | Kill. Spectacle with no decision value.
 | 
20
 | Face recognition of officers in meetings
 | 2
 | 1
 | 1
 | Kill. Privacy.
 | 
21
 | Emotion detection on complaints
 | 2
 | 2
 | 2
 | Kill. Unreliable in Tamil and invites bias.
 | 
22
 | Ranking officers by sentiment
 | 2
 | 2
 | 1
 | Kill. A blame engine.
 | 
23
 | Letting the model narrate forecasts in its own numbers
 | 2
 | 2
 | 1
 | Kill. Breaks the code-computes rule.
 | 
24
 | Satellite change detection
 | 5
 | 3
 | 4
 | Later. Needs an imagery pipeline.
 | 
25
 | Drone feed
 | 4
 | 3
 | 3
 | Kill for now. No feed exists.
 | 
26
 | WhatsApp push of instructions
 | 2
 | 5
 | 2
 | Later. Needs an approved gateway.
 | 
27
 | Auto-dialling officers
 | 2
 | 3
 | 1
 | Kill. Reaches people without review.
 | 
28
 | Field-photo verification
 | 5
 | 5
 | 4
 | Later. Needs an officer app.
 | 
29
 | Habit learning
 | 3
 | 4
 | 4
 | Keep. Visible and forgettable.
 | 
30
 | Preview while speaking
 | 5
 | 2
 | 5
 | Keep if time
 | 
31
 | Rewind rail
 | 3
 | 3
 | 5
 | Keep
 | 
32
 | Bilingual projector subtitles
 | 4
 | 4
 | 5
 | Keep
 | 
33
 | A citizen-facing Thunai
 | 3
 | 2
 | 2
 | Kill. A different product and an abuse surface.
 | 
34
 | Our own flood model inside Thunai
 | 4
 | 4
 | 3
 | Kill. CFM-DSS already models floods; read it instead.
 | 
35
 | Auto-written press releases
 | 3
 | 3
 | 2
 | Kill. Speaks for the office.
 | 
36
 | Phone as a remote mic
 | 4
 | 3
 | 4
 | Later
 | 
37
 | Local offline speech model
 | 3
 | 4
 | 5
 | Later. Fourteen hours is too short.
 | 
38
 | Gesture control
 | 3
 | 1
 | 4
 | Kill. No value over voice in an office.
 | 
39
 | Department leaderboards and badges
 | 2
 | 2
 | 4
 | Kill. A gimmick that demoralises.
 | 
40
 | "Explain this chart"
 | 3
 | 4
 | 5
 | Merge into Ask District IQ (capabilities 37–39)
 | 

## Appendix B. Fifteen ways Thunai fails, and the fix
#
 | Failure
 | What would go wrong
 | Fix
 | 
1
 | Misheard Tamil number (ஐந்து and பதினைந்து)
 | Zone 15 instead of 5
 | A large chip with the zone name, the wrong-chip, and "illa" correction. Golden tests T04 and T05.
 | 
2
 | Similar names (Ambattur, Anna Nagar)
 | Wrong zone
 | Phonetic match with margin. Under 0.10 margin, ask once with two chips.
 | 
3
 | Stale data
 | Old numbers spoken as current
 | A freshness map; amber marking; the age is spoken; no alert on stale data.
 | 
4
 | Slow website
 | A mission hangs
 | An 8-second timeout per step; the cached value with its age; the step marked amber; the mission continues.
 | 
5
 | Instructions hidden in a web page
 | Thunai obeys a page
 | The Shield's eight controls (Section 8.6).
 | 
6
 | Two people talking
 | Someone else's words become a command
 | Hold-to-talk belongs to the key holder. In Meeting, room speech is only checked as claims, never run as commands.
 | 
7
 | The Collector changes their mind mid-sentence
 | Both readings applied
 | Self-repair markers; the last entity of the same type wins. Golden tests E13, T18, X13.
 | 
8
 | The Collector changes their mind mid-mission
 | Unwanted steps run
 | "Stop" or "only three" edits the plan at the next step boundary. Nothing leaves before the gate.
 | 
9
 | The Collector changes their mind after sending
 | A wrong instruction is out
 | Sent items cannot be recalled, so the gate shows text and recipients for 2 seconds first. Thunai offers a drafted correction.
 | 
10
 | The model invents an action or a zone
 | A wrong or impossible change
 | The schema validator checks every call against the role's tool list and valid ranges. Unknown calls are refused.
 | 
11
 | The model states a number
 | An invented figure
 | The number guard: every digit in a spoken line must map to a computed field, else the line falls back to its template.
 | 
12
 | The network drops
 | Voice stops
 | The typed bar on the rules path, cached data, and the orb says so (Section 10.3).
 | 
13
 | A noisy office
 | Low-confidence readings
 | Hold-to-talk limits the window; under 0.60, ask once; headset advised.
 | 
14
 | Portal session expired, or an OTP
 | The worker is stuck
 | Sign in again from the vault; for an OTP, stop and hand over with "Your turn".
 | 
15
 | Someone else says "confirm five"
 | A spoofed approval
 | Level C needs the key held at the Collector's desk plus the matching count. The Meeting room mic never approves.
 | 

## Appendix C. Assumptions and sources
Check each assumption at the hour shown. If one fails, the fix column says what changes.
ID
 | Assumption
 | Check at
 | If wrong
 | 
A1
 | The 45 controller actions take arguments as named here, and each NEW action is a small wrapper.
 | Hour 0
 | Map the names in the alias table; budget an hour more.
 | 
A2
 | verify and sendBack take an id and an optional note.
 | Hour 5
 | Adjust the tray card.
 | 
A3
 | Ids such as metro-water, waterlogging and a flood-prone layer exist.
 | Hour 1
 | Use the real ids, or drop the layer from Mission 1.
 | 
A4
 | A ward table maps all 200 wards to zones and the 16 taluks, with names such as Mylapore.
 | Hour 1
 | Mission 3 asks for the zone instead.
 | 
A5
 | Browser speech-to-text supports ta-IN and en-IN and runs as a cloud service.
 | Hour 0
 | Use English only for voice and keep Tamil typed, or add a local recogniser later.
 | 
A6
 | The 400 ms target runs from the final transcript, not from the end of speech.
 | Hour 0
 | Report both times.
 | 
A7
 | A Tamil voice is available to browser text-to-speech on the demo machine.
 | Hour 0
 | Subtitles only for Tamil replies.
 | 
A8
 | Nova Lite is reached through Bedrock's Asia Pacific cross-region profile.
 | Hour 9
 | Use the nearest supported region and note it in privacy.
 | 
A9
 | All weights and thresholds are starting values, to be tuned on real data.
 | Hour 12
 | Tune them; the structure stays.
 | 
A10
 | Every Tamil line here needs a native speaker's review.
 | Hour 12
 | Replace the wording, keep the slots.
 | 
A11
 | The demo machine has a mic and a second screen for the projector.
 | Hour 11
 | Run Meeting in two browser windows on one screen.
 | 
A12
 | The venue has internet for the live read.
 | Before the demo
 | The backup video and the typed rules path.
 | 
A13
 | SACHET has a Tamil Nadu feed; CFM-DSS is the Chennai Flood Monitor; IMD pages may refuse automated reading; mandi prices have no ready API.
 | Hour 7
 | Swap the recipe source; the recipe format stays.
 | 
A14
 | Real department portals need written permission, so the demo uses a mock.
 | Hour 7
 | No change for the demo.
 | 
A15
 | Meeting transcripts may be held in memory during a session.
 | Hour 11
 | Fact-check from typed claims only.
 | 
A16
 | A headset button can act as the talk key on the phone.
 | If time
 | Use an on-screen button.
 | 
A17
 | Groq stays with Ask District IQ only.
 | Hour 9
 | No change to Thunai.
 | 
A18
 | The Collector's preferred form of address is unknown, so none is used.
 | Hour 12
 | Set one in settings.
 | 
A19
 | One Collector uses one machine.
 | Hour 0
 | Profiles per user.
 | 
A20
 | A directory of officers on duty exists for each department.
 | Hour 5
 | The tray card is marked "no recipient".
 | 
A21
 | "Last month" compares the same number of elapsed days.
 | Hour 3
 | Switch to full calendar months.
 | 

### Sources
Chennai Flood Monitor, About the RTFF & SDSS: the flood decision-support portal and its field networks.
Thejesh GN, "Common Alerting Protocol (CAP) in the Indian Context", May 2025: SACHET feeds, CAP 1.2 and district-level areas.
data.gov.in, Current Daily Price of Various Commodities from Various Markets (Mandi): no API for that resource.
AWS, Nova understanding models in Europe and Asia Pacific, 27 Feb 2025: the cross-region profile and its regions.
IMD national bulletin, September 2024: the heavy and very heavy rainfall ranges. I took these from search results; my fetch of the IMD page was blocked.
