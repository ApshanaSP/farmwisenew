/**
 * Tamil for the words the site shows most: the pages, filters, cards, buttons and the counts' labels. Checked by hand,
 * so the words a Collector reads every day are exact. "#" stands for a number ("# open" → "# திறந்தவை"); the
 * Translator puts the real numbers back in order. Anything not here is translated once by AI (api/i18n) and cached.
 */
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
  "Chennai · Collector": "சென்னை · ஆட்சியர்", "Feeds, OCR upload, audit log": "தரவு ஊட்டங்கள், OCR பதிவேற்றம், தணிக்கைப் பதிவு",
  "Every decision and change": "ஒவ்வொரு முடிவும் மாற்றமும்", "Fetch the latest from the store": "சமீபத்திய தரவைப் பெறு",
  "Whole district, every department": "முழு மாவட்டம், எல்லா துறைகளும்", "Feeds, added sources, OCR upload": "ஊட்டங்கள், சேர்த்த மூலங்கள், OCR பதிவேற்றம்",
  "Notifications": "அறிவிப்புகள்", "Mark all read": "அனைத்தையும் படித்ததாகக் குறி", "Alerts": "எச்சரிக்கைகள்",

  // ---- greetings and the band
  "Good morning, Collector": "காலை வணக்கம், ஆட்சியர்", "Good afternoon, Collector": "மதிய வணக்கம், ஆட்சியர்",
  "Good evening, Collector": "மாலை வணக்கம், ஆட்சியர்",
  "Daily": "தினசரி", "Weekly": "வாராந்திர", "Monthly": "மாதாந்திர", "Quarterly": "காலாண்டு",
  "All 15 zones": "அனைத்து 15 மண்டலங்கள்", "All # zones": "அனைத்து # மண்டலங்கள்", "All taluks": "அனைத்து வட்டங்கள்", "All departments": "அனைத்து துறைகள்",
  "Clear": "அழி", "Zone": "மண்டலம்", "Taluk": "வட்டம்", "Department": "துறை", "Period": "காலம்", "Filters": "வடிப்பான்கள்",
  "District-wide · not filtered": "மாவட்டம் முழுவதும் · வடிகட்டப்படவில்லை", "Your files · not filtered": "உங்கள் கோப்புகள் · வடிகட்டப்படவில்லை",
  "Collected today, #:# AM": "இன்று சேகரிக்கப்பட்டது, காலை #:#", "Collected today, #:# PM": "இன்று சேகரிக்கப்பட்டது, மதியம் #:#",
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
  "Create an account": "கணக்கை உருவாக்கு", "Signing in…": "உள்நுழைகிறது…"
};
