/**
 * Tamil for the words the site shows most: the pages, filters, cards, buttons and the counts' labels. Checked by hand,
 * so the words a Collector reads every day are exact. "#" stands for a number ("# open" → "# திறந்தவை"); the
 * Translator puts the real numbers back in order. Anything not here is translated once by AI (api/i18n) and cached.
 */
import { MANU_DEPTS } from "@/lib/manu/constants";

export const TA: Record<string, string> = {
  // ---- pages and the top bar
  "Overview": "மேலோட்டம்", "Briefing": "சுருக்கம்", "Trends": "போக்குகள்", "Environment": "சுற்றுச்சூழல்", "Data Studio": "தரவு அரங்கம்",
  "Environment & markets": "சுற்றுச்சூழல் & சந்தைகள்", "Search": "தேடல்", "Menu": "மெனு", "Tools": "கருவிகள்",
  "Export report": "அறிக்கையைப் பதிவிறக்கு", "PDF report or CSV action list": "PDF அறிக்கை அல்லது CSV செயல் பட்டியல்",
  "Workspaces": "பணியிடங்கள்", "Save or reopen a view": "ஒரு பார்வையைச் சேமி அல்லது மீண்டும் திற",
  "Customize the dashboard": "டாஷ்போர்டைத் தனிப்பயனாக்கு", "Choose what the dashboard shows": "டாஷ்போர்டு என்ன காட்டும் என்று தேர்வு செய்",
  "Dark mode": "இருண்ட பயன்முறை", "Light mode": "ஒளி பயன்முறை", "Language": "மொழி", "English": "ஆங்கிலம்", "Tamil": "தமிழ்",
  "Data sources": "தரவு மூலங்கள்", "Audit log": "தணிக்கைப் பதிவு", "Reload data": "தரவை மீண்டும் ஏற்று", "Clear all filters": "எல்லா வடிப்பான்களையும் அழி",
  "Sign out": "வெளியேறு", "Collector's Office": "ஆட்சியர் அலுவலகம்", "District Collector, Chennai": "மாவட்ட ஆட்சியர், சென்னை",
  "Chennai · Collector": "சென்னை · ஆட்சியர்", "Feeds and audit log": "தரவு ஊட்டங்கள், தணிக்கைப் பதிவு",
  "Every decision and change": "ஒவ்வொரு முடிவும் மாற்றமும்", "Fetch the latest from the store": "சமீபத்திய தரவைப் பெறு",
  "Whole district, every department": "முழு மாவட்டம், எல்லா துறைகளும்", "Feeds and added sources": "ஊட்டங்கள், சேர்த்த மூலங்கள்",
  "Notifications": "அறிவிப்புகள்", "Mark all read": "அனைத்தையும் படித்ததாகக் குறி", "Alerts": "எச்சரிக்கைகள்",

  // ---- greetings and the band
  "Good morning, Collector": "காலை வணக்கம், ஆட்சியர்", "Good afternoon, Collector": "மதிய வணக்கம், ஆட்சியர்",
  "Good evening, Collector": "மாலை வணக்கம், ஆட்சியர்",
  "Daily": "தினசரி", "Weekly": "வாராந்திர", "Monthly": "மாதாந்திர", "Quarterly": "காலாண்டு",
  "All 15 zones": "அனைத்து 15 மண்டலங்கள்", "All # zones": "அனைத்து # மண்டலங்கள்", "All taluks": "அனைத்து வட்டங்கள்", "All departments": "அனைத்து துறைகள்",
  "Clear": "அழி", "Zone": "மண்டலம்", "Taluk": "வட்டம்", "Department": "துறை", "Period": "காலம்", "Filters": "வடிப்பான்கள்",
  "District-wide · not filtered": "மாவட்டம் முழுவதும் · வடிகட்டப்படவில்லை", "Your files · not filtered": "உங்கள் கோப்புகள் · வடிகட்டப்படவில்லை",
  "Collected today, #:# AM": "இன்று சேகரிக்கப்பட்டது, முற்பகல் #:#", "Collected today, #:# PM": "இன்று சேகரிக்கப்பட்டது, பிற்பகல் #:#",
  "# of # feeds current · #/# live": "# / # ஊட்டங்கள் நடப்பில் · #/# நேரலை",

  // ---- KPI tiles and snapshot
  "Severe events": "கடுமையான நிகழ்வுகள்", "Open complaints": "திறந்த புகார்கள்", "Ongoing incidents": "நடப்பு நிகழ்வுகள்", "Open incidents": "திறந்த நிகழ்வுகள்",
  "Resolved today": "இன்று தீர்க்கப்பட்டவை", "Resolved this week": "இந்த வாரம் தீர்க்கப்பட்டவை", "Resolved this month": "இந்த மாதம் தீர்க்கப்பட்டவை",
  "Resolved this quarter": "இந்தக் காலாண்டில் தீர்க்கப்பட்டவை",
  "than yesterday": "நேற்றை விட", "than last week": "கடந்த வாரத்தை விட", "than last month": "கடந்த மாதத்தை விட", "from yesterday": "நேற்றிலிருந்து",
  "# fewer": "# குறைவு", "# more": "# அதிகம்", "No change": "மாற்றமில்லை",
  "Most serious zones": "மிகவும் தீவிரமான மண்டலங்கள்", "Past deadline, still open · 24 h": "காலக்கெடு தாண்டியும் திறந்தவை · 24 மணி",
  "Severe, not yet checked": "கடுமையானவை, இன்னும் சரிபார்க்கப்படாதவை",

  // ---- overview cards
  "Ask the map…": "வரைபடத்திடம் கேளுங்கள்…", "Ask the map": "வரைபடத்திடம் கேளுங்கள்", "Rain": "மழை", "Rain & flooding": "மழை & வெள்ளம்",
  "By severity": "தீவிரம்", "My tasks": "பணிகள்", "See all": "அனைத்தும்", "Severe": "கடுமை", "High": "அதிகம்", "Medium": "நடுத்தரம்", "Low": "குறைவு",
  "# need you": "# உங்கள் கவனம் தேவை", "shown first": "முதலில் காட்டப்படுகிறது", "Act": "செயல்படு",
  "Latest news": "சமீபத்திய செய்திகள்", "See more": "மேலும்", "News": "செய்தி", "Differ": "முரண்", "Next door": "அண்டை", "Added": "சேர்த்தவை",
  "Complaints": "புகார்கள்", "Other": "மற்றவை", "Stations": "நிலையங்கள்", "Zones": "மண்டலங்கள்", "Taluks": "வட்டங்கள்",
  "# not on the map": "# வரைபடத்தில் இல்லை", "Incidents by zone": "மண்டலவாரி நிகழ்வுகள்", "Fewer": "குறைவு", "More": "அதிகம்",
  "Loading the map…": "வரைபடம் ஏற்றப்படுகிறது…", "High severity incident": "அதிக தீவிர நிகழ்வு", "Medium severity incident": "நடுத்தர தீவிர நிகழ்வு",
  "Low severity incident": "குறைந்த தீவிர நிகழ்வு", "no citizen complaint": "குடிமக்கள் புகார் இல்லை", "Reports differ": "செய்திகள் முரண்படுகின்றன",
  "# hrs ago": "# மணி நேரம் முன்பு", "# hr ago": "# மணி நேரம் முன்பு", "# min ago": "# நிமிடம் முன்பு", "# mins ago": "# நிமிடங்கள் முன்பு",
  "# days ago": "# நாட்கள் முன்பு", "# day ago": "# நாள் முன்பு", "yesterday": "நேற்று", "today": "இன்று", "just now": "இப்போது",
  "# similar reports": "# ஒத்த செய்திகள்", "Still open at more than": "இன்னும் திறந்தே உள்ளது",
  "No officer has confirmed": "எந்த அதிகாரியும் உறுதிப்படுத்தவில்லை",

  // ---- briefing
  "Key points": "முக்கிய அம்சங்கள்", "last 24 hours": "கடந்த 24 மணி நேரம்", "Listen": "கேளுங்கள்", "Departments": "துறைகள்",
  "Stories still developing": "தொடரும் செய்திகள்", "Only in the news": "செய்திகளில் மட்டும்", "LATEST": "சமீபத்தியது",
  "WEATHER & WATER": "வானிலை & நீர்", "LIVES LOST": "உயிரிழப்புகள்", "CIVIC SERVICES": "குடிமைச் சேவைகள்", "LAW & ORDER": "சட்டம் & ஒழுங்கு",
  "HEALTH": "சுகாதாரம்", "ALERT": "எச்சரிக்கை", "# deaths": "# உயிரிழப்புகள்", "# severe": "# கடுமை", "# dead": "# உயிரிழப்பு",
  "what each received · last 24 hours": "ஒவ்வொன்றும் பெற்றவை · கடந்த 24 மணி",

  // ---- trends
  "Which problems are rising?": "எந்தப் பிரச்சனைகள் அதிகரிக்கின்றன?", "last 4 weeks compared with the 4 weeks before": "கடந்த 4 வாரங்கள், அதற்கு முந்தைய 4 வாரங்களுடன் ஒப்பிட்டு",
  "Rising:": "அதிகரிப்பு:", "Falling:": "குறைவு:", "PROBLEM": "பிரச்சனை", "4 weeks before": "4 வாரங்களுக்கு முன்", "Last 4 weeks": "கடந்த 4 வாரங்கள்",
  "CHANGE": "மாற்றம்", "MOST NEW REPORTS IN": "அதிக புதிய புகார்கள்", "Unresolved by taluk": "வட்டவாரி தீர்க்கப்படாதவை", "last 30 days": "கடந்த 30 நாட்கள்",
  "TALUK": "வட்டம்", "OPEN INCIDENTS": "திறந்த நிகழ்வுகள்", "Unusual rises": "அசாதாரண உயர்வுகள்", "Recurring hotspots": "மீண்டும் வரும் இடங்கள்",
  "keeps coming back": "மீண்டும் மீண்டும் வருகிறது", "Locations needing review": "சரிபார்க்க வேண்டிய இடங்கள்", "Review all": "அனைத்தையும் சரிபார்",
  "Place unknown": "இடம் தெரியவில்லை", "Placed from the report": "செய்தியிலிருந்து இடம் கண்டது", "now on the map": "இப்போது வரைபடத்தில்",
  "USUAL": "வழக்கம்", "#% more": "#% அதிகம்", "#% less": "#% குறைவு", "about the same": "ஏறக்குறைய அதே",
  "Flooding & waterlogging": "வெள்ளம் & நீர் தேக்கம்", "Road accident": "சாலை விபத்து", "Traffic obstruction & parking": "போக்குவரத்து தடை & நிறுத்தம்",
  "Theft, snatching & fraud": "திருட்டு, பறிப்பு & மோசடி", "Drainage & sewage": "வடிகால் & கழிவுநீர்", "Garbage & sanitation": "குப்பை & சுகாதாரம்",
  "Streetlight & power": "தெருவிளக்கு & மின்சாரம்", "Water supply": "குடிநீர் விநியோகம்", "Fire accident": "தீ விபத்து",

  // ---- environment
  "Rainfall": "மழைப்பொழிவு", "Air quality": "காற்றின் தரம்", "Reservoir storage": "நீர்த்தேக்க இருப்பு", "All stations (average)": "அனைத்து நிலையங்கள் (சராசரி)",
  "Steady": "நிலையானது", "Rising": "அதிகரிக்கிறது", "Falling": "குறைகிறது", "LOW": "குறைவு", "BELOW HALF": "பாதிக்குக் கீழ்", "% full": "% நிரம்பியது",
  "Vegetable and fruit prices": "காய்கறி மற்றும் பழ விலைகள்", "Prices today": "இன்றைய விலைகள்", "Compare markets": "சந்தைகளை ஒப்பிடு",
  "Around Chennai": "சென்னையைச் சுற்றி", "Tamil Nadu": "தமிழ்நாடு", "Full screen": "முழுத் திரை", "Preparing…": "தயாராகிறது…",
  "Pinned from Data Studio": "தரவு அரங்கிலிருந்து பின் செய்தவை", "Show all pins": "எல்லா பின்களையும் காட்டு", "Show fewer": "குறைவாகக் காட்டு",
  "Nothing pinned yet": "இன்னும் எதுவும் பின் செய்யவில்லை", "Add to dashboard": "டாஷ்போர்டில் சேர்", "Added to dashboard": "டாஷ்போர்டில் சேர்க்கப்பட்டது",
  "Remove from dashboard": "டாஷ்போர்டிலிருந்து நீக்கு", "Open in Data Studio": "தரவு அரங்கில் திற",

  // ---- data studio
  "Add data": "தரவைச் சேர்", "Drop a file or browse": "கோப்பை இங்கே இடுங்கள் அல்லது தேர்ந்தெடுங்கள்", "Your data": "உங்கள் தரவு", "Studio board": "அரங்கப் பலகை",
  "Live Connectors": "நேரலை இணைப்பிகள்", "Try it with a sample": "ஒரு மாதிரியுடன் முயலுங்கள்", "Drop any department file.": "எந்தத் துறைக் கோப்பையும் இடுங்கள்.",
  "Reads messy files": "குழப்பமான கோப்புகளையும் படிக்கும்", "Cleans and shows its work": "சுத்தம் செய்து விவரம் காட்டும்", "Links with the district": "மாவட்டத்துடன் இணைக்கும்",
  "Answers in plain words": "எளிய சொற்களில் பதில்", "Pin": "பின் செய்", "Pinned": "பின் செய்யப்பட்டது", "Unpin": "பின் நீக்கு",

  // ---- common
  "Close": "மூடு", "Back": "பின்", "Open": "திற", "Save": "சேமி", "Cancel": "ரத்து", "Send": "அனுப்பு", "Export": "பதிவிறக்கு", "Download": "பதிவிறக்கு",
  "Yes": "ஆம்", "No": "இல்லை", "Done": "முடிந்தது", "Loading…": "ஏற்றப்படுகிறது…", "Ask": "கேள்", "Try": "முயலுங்கள்", "Show": "காட்டு", "Hide": "மறை",
  "Status": "நிலை", "Severity": "தீவிரம்", "Reported": "புகாரளிக்கப்பட்டது", "Resolved": "தீர்க்கப்பட்டது", "Pending": "நிலுவையில்", "In progress": "நடைபெறுகிறது",
  "Take action": "நடவடிக்கை எடு", "Approve and send": "ஒப்புதல் அளித்து அனுப்பு", "Show on map": "வரைபடத்தில் காட்டு", "Details": "விவரங்கள்",
  "Ask District IQ": "District IQ-விடம் கேளுங்கள்", "Ask Jarvis": "ஜார்விஸிடம் கேளுங்கள்", "Jarvis": "ஜார்விஸ்", "Chat": "அரட்டை", "Talk": "பேசு",
  "Welcome back": "மீண்டும் வருக", "Email address": "மின்னஞ்சல் முகவரி", "Password": "கடவுச்சொல்", "Sign in": "உள்நுழை", "Forgot password?": "கடவுச்சொல் மறந்ததா?",
  "Create an account": "கணக்கை உருவாக்கு", "Signing in…": "உள்நுழைகிறது…",
  // ---- the Collector's Briefing page: fixed labels (QA pass 4, RC-15, PB-300; guard in ta.pass4.test.ts reads these components)
  "Critical now": "இப்போது மிக முக்கியமானவை", "Warnings": "எச்சரிக்கைகள்", "IMD warning": "வானிலை ஆய்வு மையத்தின் எச்சரிக்கை", "Oldest open complaint": "மிகப் பழைய திறந்த புகார்",
  "Most serious reports": "மிகத் தீவிரமான பதிவுகள்", "Watch": "கவனிக்க",  "Latest": "சமீபத்தியது",
  "Normal": "இயல்பு", "Watchful": "கண்காணிப்பில்", "Alert": "எச்சரிக்கை", "Meanwhile:": "இதற்கிடையில்:",
  "Developing stories": "வளர்ந்துவரும் செய்திகள்", "Where it stands": "தற்போதைய நிலை", "What happened:": "என்ன நடந்தது:", "open incident": "திறந்த சம்பவம்", "added source": "சேர்ந்த மூலம்",
  "· same event over time": "· ஒரே நிகழ்வு காலப்போக்கில்",
  "First report": "முதல் செய்தி", "Arrest": "கைது", "Death": "உயிரிழப்பு", "Court": "நீதிமன்றம்", "Probe": "விசாரணை", "Protest": "போராட்டம்", "Action": "நடவடிக்கை",
  "Warning": "எச்சரிக்கை", "Completed": "நிறைவு", "Update": "புதுப்பிப்பு",
  "# report · # outlet": "# செய்தி · # ஊடகம்", "# report · # outlets": "# செய்தி · # ஊடகங்கள்", "# reports · # outlet": "# செய்திகள் · # ஊடகம்", "# reports · # outlets": "# செய்திகள் · # ஊடகங்கள்",
  "· updated": "· புதுப்பிக்கப்பட்டது", "# developments ·": "# வளர்ச்சிகள் ·",
  "Written by AI from the records; numbers checked against the data": "பதிவுகளிலிருந்து AI எழுதியது; எண்கள் தரவுடன் சரிபார்க்கப்பட்டன",
  "Reading the period's incidents, grievances and news…": "இந்தக் காலத்தின் சம்பவங்கள், புகார்கள், செய்திகளைப் படிக்கிறது…", "Writing a short brief…": "சிறு சுருக்கத்தை எழுதுகிறது…",
  "Joining reports about the same event…": "ஒரே நிகழ்வு பற்றிய செய்திகளை இணைக்கிறது…", "Joining the reports about each event…": "ஒவ்வொரு நிகழ்வு பற்றிய செய்திகளையும் இணைக்கிறது…",
  "No department received a report in this period.": "இந்தக் காலத்தில் எந்தத் துறைக்கும் புகார் வரவில்லை.", "No story developed further in this period.": "இந்தக் காலத்தில் எந்தச் செய்தியும் மேலும் வளரவில்லை.",
  "Every incident in the news has a department record.": "செய்தியில் உள்ள ஒவ்வொரு சம்பவத்துக்கும் துறைப் பதிவு உள்ளது.",
   "what each received · last 7 days": "ஒவ்வொன்றும் பெற்றவை · கடந்த 7 நாட்கள்",
  "what each received · last 30 days": "ஒவ்வொன்றும் பெற்றவை · கடந்த 30 நாட்கள்", "what each received · last 90 days": "ஒவ்வொன்றும் பெற்றவை · கடந்த 90 நாட்கள்",

  // ---- the workflow's own words (QA pass 6, officer-day-11): with no model key they stayed English. The officer console's stages and
  // report form (lib/officer/stages.ts, components/officer), the citizen's tracker and journey (StatusTracker, track-complaints,
  // lib/complaint-progress.ts) and the "Confirm it's you" box (components/security/Confirm.tsx, lib/security/stepup.ts ACTION_WORD).
  // officer console: stages, tabs and buttons
  "New": "புதியது", "In action": "நடவடிக்கையில்", "Sent to Collector": "ஆட்சியருக்கு அனுப்பப்பட்டது", "Verified": "சரிபார்க்கப்பட்டது",
  "Closed": "மூடப்பட்டது", "Received": "பெறப்பட்டது", "Returned": "திருப்பி அனுப்பப்பட்டது", "Approve": "ஒப்புதல் அளி",
  "Waiting for your approval": "உங்கள் ஒப்புதலுக்குக் காத்திருக்கிறது", "Collector Feedback": "ஆட்சியரின் கருத்து",
  "Verified by Collector": "ஆட்சியரால் சரிபார்க்கப்பட்டது", "Verified by Collector ·": "ஆட்சியரால் சரிபார்க்கப்பட்டது ·",
  "Closed by your department": "உங்கள் துறையால் மூடப்பட்டது", "Returned by Collector": "ஆட்சியர் திருப்பி அனுப்பினார்",
  "Returned for rework": "மீண்டும் பணி செய்யத் திருப்பி அனுப்பப்பட்டது", "Returned by the Collector for rework.": "மீண்டும் பணி செய்ய ஆட்சியர் திருப்பி அனுப்பினார்.",
  "Returned by the Collector: redo the work and send a fresh completion report": "ஆட்சியர் திருப்பி அனுப்பினார்: பணியை மீண்டும் செய்து, புதிய பணி நிறைவு அறிக்கையை அனுப்பவும்",
  "Waiting for the Collector's verification": "ஆட்சியரின் சரிபார்ப்புக்குக் காத்திருக்கிறது",
  "Approving moves it to In action and assigns it to": "ஒப்புதல் அளித்தால், இது “நடவடிக்கையில்” நிலைக்கு மாறி, இவரிடம் ஒப்படைக்கப்படும்:",
  "Approving moves it to In action and assigns it to the field officer.": "ஒப்புதல் அளித்தால், இது “நடவடிக்கையில்” நிலைக்கு மாறி, கள அலுவலரிடம் ஒப்படைக்கப்படும்.",
  "Complete & send to Collector": "பணியை முடித்து ஆட்சியருக்கு அனுப்பு", "Complete & close": "பணியை முடித்து மூடு",
  "Severe: the Collector verifies it. Remarks and photos go to the Collector.": "கடுமையானது: இதை ஆட்சியர் சரிபார்ப்பார். குறிப்புகளும் புகைப்படங்களும் ஆட்சியருக்குச் செல்லும்.",
  "You verify this one: your remarks and photos are kept as the record.": "இதை நீங்களே சரிபார்க்கிறீர்கள்: உங்கள் குறிப்புகளும் புகைப்படங்களும் பதிவாக வைக்கப்படும்.",
  // officer console: the completion report
  "Remarks · what was done": "குறிப்புகள் · செய்யப்பட்ட பணி", "Photos of completed work": "முடிந்த பணியின் புகைப்படங்கள்",
  "Photos of completed work (": "முடிந்த பணியின் புகைப்படங்கள் (", "Upload site photos": "இடத்தின் புகைப்படங்களைப் பதிவேற்று",
  "JPG or PNG · you can pick several, or drop them here": "JPG அல்லது PNG · பலவற்றைத் தேர்ந்தெடுக்கலாம், அல்லது இங்கே இழுத்து விடலாம்",
  "Attach at least one photo of the completed work.": "முடிந்த பணியின் ஒரு புகைப்படமாவது இணைக்கவும்.",
  "Write remarks describing the work done.": "செய்த பணியை விவரிக்கும் குறிப்புகளை எழுதவும்.",
  ": your department verifies and closes it; only Severe cases go to the Collector.": ": உங்கள் துறையே சரிபார்த்து மூடும்; கடுமையான வழக்குகள் மட்டுமே ஆட்சியருக்குச் செல்லும்.",
  "Send to Collector": "ஆட்சியருக்கு அனுப்பு", "Close as done": "முடிந்ததாக மூடு", "Sending…": "அனுப்புகிறது…", "Closing…": "மூடுகிறது…",
  // the citizen's tracker and journey
  "Complaint Filed": "புகார் பதிவானது", "Pending Approval": "ஒப்புதலுக்குக் காத்திருக்கிறது", "Approved by Department Officer": "துறை அலுவலர் ஒப்புதல் அளித்தார்",
  "Completed – pending Collector verification": "பணி முடிந்தது – ஆட்சியரின் சரிபார்ப்புக்குக் காத்திருக்கிறது",
  "Resolved – checked by the department": "தீர்க்கப்பட்டது – துறையால் சரிபார்க்கப்பட்டது",
  "Filed": "பதிவானது", "Approved": "ஒப்புதல் அளிக்கப்பட்டது", "Awaiting Collector": "ஆட்சியருக்காகக் காத்திருக்கிறது", "Rejected": "நிராகரிக்கப்பட்டது",
  "Journey": "புகாரின் பயணம்", "Photos of the work done": "செய்த பணியின் புகைப்படங்கள்",
  "Accepted by the department; work will be scheduled.": "துறை ஏற்றுக்கொண்டது; பணி திட்டமிடப்படும்.",
  "Work has started.": "பணி தொடங்கியது.", "Work done; sent to the Collector's office to check.": "பணி முடிந்தது; சரிபார்க்க ஆட்சியர் அலுவலகத்துக்கு அனுப்பப்பட்டது.",
  "Work done and checked by the department.": "பணி முடிந்து, துறையால் சரிபார்க்கப்பட்டது.",
  "The department checked the finished work and closed the complaint.": "முடிந்த பணியைத் துறை சரிபார்த்து, புகாரை மூடியது.",
  "The Collector's office checked the work and closed the complaint.": "ஆட்சியர் அலுவலகம் பணியைச் சரிபார்த்து, புகாரை மூடியது.",
  "The Collector's office returned it to the department for more work.": "கூடுதல் பணிக்காக ஆட்சியர் அலுவலகம் இதைத் துறைக்குத் திருப்பி அனுப்பியது.",
  "Rejected by the Collector's office.": "ஆட்சியர் அலுவலகம் நிராகரித்தது.",
  // the "Confirm it's you" box and the actions it confirms
  "Confirm it's you": "இது நீங்கள்தான் என்பதை உறுதிசெய்யுங்கள்", "Your account password": "உங்கள் கணக்கின் கடவுச்சொல்",
  "The #-digit code from the email": "மின்னஞ்சலில் வந்த #-இலக்கக் குறியீடு", "Confirm": "உறுதிசெய்", "Checking…": "சரிபார்க்கிறது…",
  "Use my password": "என் கடவுச்சொல்லைப் பயன்படுத்து", "Send another code": "இன்னொரு குறியீட்டை அனுப்பு", "Email me a code": "குறியீட்டை எனக்கு மின்னஞ்சலில் அனுப்பு",
  "Being signed in is not enough for this. It is checked on the server for exactly this action, and recorded in the audit log.":
    "இதற்கு உள்நுழைந்திருப்பது மட்டும் போதாது. இந்தச் செயலுக்கென்றே சர்வரில் சரிபார்க்கப்பட்டு, தணிக்கைப் பதிவில் பதிவாகும்.",
  "Send email": "மின்னஞ்சல் அனுப்பு", "Record a decision": "முடிவைப் பதிவு செய்", "Send the completion report": "பணி நிறைவு அறிக்கையை அனுப்பு",
  "Delete a dataset": "தரவுத்தொகுப்பை நீக்கு", "Approve a new data source": "புதிய தரவு மூலத்துக்கு ஒப்புதல் அளி", "Change or remove a data source": "தரவு மூலத்தை மாற்று அல்லது நீக்கு", "Export data": "தரவைப் பதிவிறக்கு",
  "Sign out every other device": "மற்ற எல்லாச் சாதனங்களிலிருந்தும் வெளியேறு",

  // ---- /track, where a petitioner's SMS sends them (fix-all run, hunt2-desk-15): it was English but for the heading
  "Track your petition or complaint": "உங்கள் மனு அல்லது புகாரின் நிலையை அறியுங்கள்",
  "Number on your slip": "உங்கள் ஒப்புகைச் சீட்டில் உள்ள எண்", "Last 4 digits of your mobile": "உங்கள் கைபேசி எண்ணின் கடைசி 4 இலக்கங்கள்",
  "Check status": "நிலையை அறிக", "Check another number": "வேறொரு எண்ணின் நிலையை அறிக",
  "With:": "கையாளும் துறை:", "Received:": "பெற்ற நாள்:", "Expected by:": "முடிக்க எதிர்பார்க்கும் நாள்:",
  "Received at the Collector's office and sent to the department.": "ஆட்சியர் அலுவலகத்தில் பெறப்பட்டு, துறைக்கு அனுப்பப்பட்டது.",
  "Received online and sent to the department.": "இணையம் வழியாகப் பெறப்பட்டு, துறைக்கு அனுப்பப்பட்டது.",
  "Waiting for the department to accept it.": "துறை ஏற்றுக்கொள்வதற்காகக் காத்திருக்கிறது.",
  "The department is working on it.": "துறை இதற்கான பணியைச் செய்து வருகிறது.",
  "It could not be taken up. The Collector's office can tell you why.": "இதை எடுத்துக்கொள்ள இயலவில்லை. காரணத்தை ஆட்சியர் அலுவலகம் உங்களுக்குத் தெரிவிக்கும்.",
  "We could not find that. Check the number on your slip and the last 4 digits of your mobile number.":
    "இதைக் கண்டறிய முடியவில்லை. உங்கள் ஒப்புகைச் சீட்டில் உள்ள எண்ணையும், கைபேசி எண்ணின் கடைசி 4 இலக்கங்களையும் சரிபார்க்கவும்.",
  "Too many tries. Please wait a few minutes.": "பலமுறை முயன்றுவிட்டீர்கள். சில நிமிடங்கள் கழித்து மீண்டும் முயலவும்.",
  "Tracking is not available just now. Please try again.": "நிலையை இப்போது அறிய இயலவில்லை. மீண்டும் முயலவும்.",
  "Tracking is not available just now.": "நிலையை இப்போது அறிய இயலவில்லை.",
  // the petition desk's departments, by their English names (lib/manu/constants.ts; P5-025)
  ...Object.fromEntries(MANU_DEPTS.map((d) => [d.label, d.ta]))
};

/**
 * Words whose Tamil depends on where they stand (QA pass 4, RC-15, PB-299): the dictionary above is by English text alone, so a status "Open" took the Tamil of the
 * button "Open" (திற, the order "open it"). An element marked data-i18n-ctx="status" is looked up here first.
 */
export const TA_CTX: Record<string, Record<string, string>> = {
  status: {
    "Open": "திறந்துள்ளது", "Under review": "பரிசீலனையில்", "Assigned": "ஒதுக்கப்பட்டது", "In progress": "நடைபெறுகிறது", "Awaiting verification": "சரிபார்ப்புக்காகக் காத்திருக்கிறது",
    "Resolved": "தீர்க்கப்பட்டது", "Rejected": "நிராகரிக்கப்பட்டது", "Lapsed": "காலாவதியானது", "Closed": "மூடப்பட்டது", "Reopened": "மீண்டும் திறக்கப்பட்டது"
  }
};
