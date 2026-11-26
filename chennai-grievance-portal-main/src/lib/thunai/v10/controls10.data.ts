/**
 * v10: the registry of the console's controls by voice (controls10.ts). One entry per control of the inventory
 * (docs/jarvis/v10-research/60-controls-inventory.json, its ids in controls10.ids.json) that a Collector could want by voice: its names in
 * English, Tamil and Tanglish (the visible label first, then synonyms), its region, its level and how it is done. A control with no voice path on
 * purpose is in SKIP10 with the reason (a row of data reached by its position, a mark on a map canvas, the OS file picker, a link out of the
 * console). controls10.v10.test.ts fails when an inventory id has neither.
 *
 * Press selectors (dom.ts findControl): "css", or "css::words|words" (the control whose name or label holds one of them, English or the console's
 * Tamil), or "a >> b" (press a, then b: a menu, then its item). Class names, data-key, data-voice and roles first: the site's Tamil mode
 * rewrites aria-label and title (components/i18n/Translator.tsx), never a class.
 *
 * The Tamil and Tanglish names are written as spoken, by a non-native writer: a Tamil speaker should review them.
 */
import type { PageKey, Step } from "../types";
import type { Act10, Control10, Level10, When10 } from "./controls10";

/** where a control is, said in a question back; `words`: what a sentence may add to say which one ("the map's", "in the chat") */
export const REGIONS10: Record<string, { en: string; ta: string; words?: string[] }> = {
  topbar: { en: "the top bar", ta: "மேல் பட்டை", words: ["top", "bar"] },
  menu: { en: "the Menu", ta: "மெனு" },
  account: { en: "the account menu", ta: "கணக்கு மெனு", words: ["account", "profile"] },
  bell: { en: "the alerts bell", ta: "எச்சரிக்கை மணி", words: ["bell"] },
  palette: { en: "Search", ta: "தேடல்", words: ["palette"] },
  filters: { en: "the filters", ta: "வடிப்பான்கள்" },
  band: { en: "the band", ta: "மேல் பட்டை", words: ["band", "chip"] },
  fab: { en: "the corner buttons", ta: "மூலைப் பொத்தான்கள்", words: ["corner"] },
  keys: { en: "the keyboard", ta: "விசைப்பலகை", words: ["key", "keyboard"] },
  kpi: { en: "the headline tiles", ta: "தலைப்பு அட்டைகள்", words: ["tile", "tiles", "headline"] },
  snapshot: { en: "the snapshot", ta: "சுருக்கப் பார்வை", words: ["snapshot", "tile"] },
  mapcard: { en: "the map", ta: "வரைபடம்", words: ["map", "legend", "வரைபடம்"] },
  severity: { en: "the severity card", ta: "தீவிர அட்டை", words: ["severity"] },
  tasks: { en: "My tasks", ta: "என் பணிகள்", words: ["task", "tasks"] },
  newscard: { en: "the news card", ta: "செய்தி அட்டை", words: ["news"] },
  askmap: { en: "Ask the Map", ta: "வரைபடத்திடம் கேளுங்கள்" },
  rain: { en: "Rain & flooding", ta: "மழை வெள்ளம்" },
  briefing: { en: "the Briefing page", ta: "சுருக்கப் பக்கம்", words: ["briefing"] },
  trends: { en: "the Trends page", ta: "போக்குகள் பக்கம்", words: ["trends"] },
  env: { en: "the Environment page", ta: "சுற்றுச்சூழல் பக்கம்", words: ["environment"] },
  // (the card named by what it prices: "vegetable prices-la rising first": v10 dev2, dB-control-11)
  markets: { en: "the prices card", ta: "விலை அட்டை", words: ["prices", "price", "market", "markets", "விலை", "vegetable", "vegetables", "veggies", "fruit", "fruits", "kaikari",
    "kaaikari", "kaikaari", "kaai", "vilai", "காய்கறி", "பழம்", "பழங்கள்"] },
  yourdata: { en: "Your data", ta: "உங்கள் தரவு", words: ["charts"] },
  window: { en: "the window", ta: "சாளரம்" },
  list: { en: "the incident list", ta: "சம்பவப் பட்டியல்", words: ["list", "column", "பட்டியல்"] },
  export: { en: "the export window", ta: "அறிக்கை சாளரம்", words: ["report"] },
  workspace: { en: "Workspaces", ta: "பணியிடங்கள்", words: ["workspace"] },
  customize: { en: "Customize", ta: "தனிப்பயனாக்கு", words: ["checkbox", "box"] },
  sources: { en: "Data sources", ta: "தரவு மூலங்கள்", words: ["sources"] },
  added: { en: "the added sources", ta: "சேர்த்த மூலங்கள்" },
  stories: { en: "Developing stories", ta: "வளரும் செய்திகள்", words: ["stories", "story"] },
  gaps: { en: "In the news, not in department records", ta: "செய்தியில் மட்டும்" },
  review: { en: "Locations needing review", ta: "சரிபார்க்க வேண்டிய இடங்கள்", words: ["review"] },
  conflict: { en: "Reports differ", ta: "முரண்படும் அறிக்கைகள்" },
  incident: { en: "the incident", ta: "சம்பவம்", words: ["incident"] },
  petition: { en: "the petition viewer", ta: "மனு", words: ["petition", "photo", "viewer"] },
  takeaction: { en: "Take action", ta: "நடவடிக்கை", words: ["draft"] },
  story: { en: "the news story", ta: "செய்தி", words: ["story"] },
  security: { en: "Security", ta: "பாதுகாப்பு" },
  confirm: { en: "Confirm it's you", ta: "உறுதிசெய்தல்" },
  studio: { en: "the Data Studio", ta: "தரவு அரங்கம்", words: ["studio"] },
  dataset: { en: "the dataset", ta: "தரவுத்தொகுப்பு", words: ["dataset"] },
  drill: { en: "the details", ta: "விவரங்கள்", words: ["details"] },
  connect: { en: "Connect a source", ta: "மூலத்தை இணை" },
  run: { en: "the run", ta: "இயக்கம்" },
  connectors: { en: "Live Connectors", ta: "நேரலை இணைப்பிகள்", words: ["connector", "connectors"] },
  chat: { en: "District IQ", ta: "டிஸ்ட்ரிக்ட் IQ", words: ["chat", "chatbot", "district", "iq"] },
  answer: { en: "the answer", ta: "பதில்", words: ["answer"] },
  hud: { en: "Jarvis's bar", ta: "ஜார்விஸ் பட்டை" },
  cards: { en: "Jarvis's card", ta: "ஜார்விஸ் அட்டை", words: ["card"] },
  tray: { en: "the approval tray", ta: "ஒப்புதல் தட்டு", words: ["tray"] },
  jpanel: { en: "Jarvis's side panel", ta: "ஜார்விஸ் பக்கப் பலகை", words: ["side"] },
  jq: { en: "Earlier questions", ta: "முந்தைய கேள்விகள்" },
  // (done with the screen: "podhum indha screen, dashboard-ku thirumbi polaam", "enough of this screen, back to the dashboard": v10 dev2, dB-control-8)
  stage: { en: "Jarvis's screen", ta: "ஜார்விஸ் திரை", words: ["enough", "done", "podhum", "pothum", "போதும்"] }
};

// ------------------------------------------------------------------------------------------------------------------------------ helpers --
const S = (...steps: Step[]): Act10 => ({ steps });
const P = (press: string, o: { input?: "select" | "check" | "text"; own?: true; value?: string } = {}): Act10 => ({ press, ...o });
const M: Act10 = { map: true };
const N = (never: string): Act10 => ({ never });
const page = (p: PageKey): Step => ({ a: "page", page: p });
const panel = (p: Extract<Step, { a: "panel" }>["panel"]): Step => ({ a: "panel", panel: p });
const CLOSE: Step = { a: "close", all: false };
const CLEAR: Step = { a: "view", view: { zone: null, dept: null, cat: null, taluk: null } };
const WINDOWS = ["list", "zones", "depts", "export", "news", "workspace", "customize", "sources", "item", "stories", "markets", "pattern", "gaps", "review",
  "nextdoor", "conflict", "contact", "added", "nearby", "text"];
const OV: When10 = { page: "overview" };
const BR: When10 = { page: "briefing" };
const TR: When10 = { page: "trends" };
const ENV: When10 = { page: "environment" };
const ST: When10 = { page: "studio" };
const W = (p: string | string[]): When10 => ({ panel: p });
const split = (s: string) => s.split("|").map((x) => x.trim()).filter(Boolean);
const list: Control10[] = [];
/** one control: id, region, level, how, names (en | ta | tl, each "label|synonym|…"), where */
function c(id: string, region: string, level: Level10, act: Act10, en: string, ta: string, tl: string, when?: When10) {
  list.push({ id, region, level, act, en: split(en), ta: split(ta), tl: split(tl), ...(when ? { when } : {}) });
}
const NEVER = "never" as const;

// ---------------------------------------------------------------------------------------------------------------- the top bar, menus --
c("nav.page.overview", "topbar", "A", S(page("overview")), "Overview|overview page|home page|home", "மேலோட்டம்|மேலோட்டப் பக்கம்|முகப்பு", "overview|overview page|home page");
c("nav.page.briefing", "topbar", "A", S(page("briefing")), "Briefing|briefing page", "சுருக்கம்|சுருக்கப் பக்கம்|பிரீஃபிங் பக்கம்", "briefing|briefing page");
c("nav.page.trends", "topbar", "A", S(page("trends")), "Trends|trends page|trend page", "போக்குகள்|போக்குகள் பக்கம்|டிரெண்ட்ஸ்", "trends|trends page|trend page");
c("nav.page.environment", "topbar", "A", S(page("environment")), "Environment|environment page|environment and markets", "சுற்றுச்சூழல்|சுற்றுச்சூழல் பக்கம்|சுற்றுச்சூழல் மற்றும் சந்தைகள்", "environment|environment page|suttruchoozhal page");
c("nav.page.studio", "topbar", "A", S(page("studio")), "Data Studio|studio|data studio page", "தரவு அரங்கம்|டேட்டா ஸ்டுடியோ|தரவு அரங்கப் பக்கம்", "data studio|studio|studio page");
c("topbar.search.open", "topbar", "A", S(panel("palette")), "Search|search and commands|command palette|open search", "தேடல்|தேடலைத் திற|தேடல் பெட்டியைத் திற", "search|search open pannu|search box open");
c("topbar.lang.switch", "topbar", "A", P(".lang-sw::switch the site to tamil"), "Tamil|switch the site to Tamil|site in Tamil|Tamil site", "தமிழ்|தளத்தைத் தமிழில் காட்டு|தளம் தமிழில்", "site tamil la|tamil site|site tamil la maathu");
c("topbar.lang.switch:en", "topbar", "A", P(".lang-sw::switch the site to english"), "English|switch the site to English|site in English|English site", "ஆங்கிலம்|தளத்தை ஆங்கிலத்தில் காட்டு|தளம் ஆங்கிலத்தில்", "site english la|english site|site english la maathu");
c("topbar.menu.toggle", "topbar", "A", P(".tm-btn"), "Menu|open the menu|tools menu", "மெனு|மெனுவைத் திற|கருவிகள் மெனு", "menu|menu open pannu|tools menu");
c("menu.export", "menu", "A", S(panel("export")), "Export report|export|export the report|download a report", "அறிக்கையைப் பதிவிறக்கு|அறிக்கை ஏற்றுமதி|ஏற்றுமதி", "export report|report export|report download pannu");
c("menu.workspaces", "menu", "A", S(panel("workspace")), "Workspaces|workspace|saved views", "பணியிடங்கள்|பணியிடம்|சேமித்த பார்வைகள்", "workspaces|workspace|saved views");
c("menu.customize", "menu", "A", S(panel("customize")), "Customize the dashboard|customize|customise|dashboard layout", "டாஷ்போர்டைத் தனிப்பயனாக்கு|தனிப்பயனாக்கு|டாஷ்போர்டு அமைப்பு", "customize|dashboard customize|dashboard layout");
c("menu.theme", "menu", "A", S({ a: "theme", theme: "dark" }), "Dark mode|dark theme|night mode", "இருண்ட பயன்முறை|டார்க் மோட்|இருண்ட தீம்", "dark mode|dark theme|night mode");
c("menu.theme:light", "menu", "A", S({ a: "theme", theme: "light" }), "Light mode|light theme|day mode", "ஒளி பயன்முறை|லைட் மோட்|வெளிச்ச தீம்", "light mode|light theme|day mode");
c("menu.dataSources", "menu", "A", S(panel("sources")), "Data sources|sources|feeds|open data sources", "தரவு மூலங்கள்|மூலங்கள்|டேட்டா சோர்ஸ்", "data sources|sources|feeds");
const SECURITY = P(".tm-btn >> .tm-pop [data-key=\"sec\"]");
c("menu.security", "menu", "A", SECURITY, "Security|security settings|sign-ins and sessions", "பாதுகாப்பு|பாதுகாப்பு அமைப்புகள்", "security|security settings");
c("menu.lang.en", "menu", "A", P(".lang-sw::switch the site to english"), "English language|language English", "ஆங்கில மொழி|மொழி ஆங்கிலம்", "language english|english language");
c("menu.lang.ta", "menu", "A", P(".lang-sw::switch the site to tamil"), "Tamil language|language Tamil", "தமிழ் மொழி|மொழி தமிழ்", "language tamil|tamil language");
c("topbar.bell.toggle", "bell", "A", P("button.tbtn.icon[data-pop]"), "Alerts|alerts bell|open the alerts|notifications", "எச்சரிக்கைகள்|எச்சரிக்கை மணி|அறிவிப்புகள்", "alerts|alerts bell|notifications");
c("bell.markAllRead", "bell", "A", P(".pop-h .lnk"), "Mark all read|mark the alerts read", "அனைத்தையும் படித்ததாகக் குறி|எல்லாம் படித்தது", "ellam read nu mark pannu|mark all read");
c("topbar.account.toggle", "account", "A", P("button.me"), "Account menu|account|profile|CO menu", "கணக்கு மெனு|கணக்கு|சுயவிவரம்", "account menu|account|profile");
c("account.security", "account", "A", SECURITY, "Security in the account menu|account security", "கணக்கு பாதுகாப்பு", "account security");
c("account.dataSources", "account", "A", S(panel("sources")), "Data sources in the account menu|account data sources", "கணக்கு தரவு மூலங்கள்", "account data sources");
c("account.auditLog", "account", "A", P("button.me >> button.me + .pop button.pop-i:nth-of-type(3)"), "Audit log|the audit log|decision log", "தணிக்கைப் பதிவு|தணிக்கை பதிவு", "audit log|audit log kaattu");
const RELOAD = P("button.me >> button.me + .pop button.pop-i:nth-of-type(4)");
c("account.reload", "account", "A", RELOAD, "Reload data|reload|fetch the latest data", "தரவை மீண்டும் ஏற்று|மீண்டும் ஏற்று|ரீலோடு", "reload|data reload pannu|reload data");
c("account.clearFilters", "account", "A", S(CLEAR), "Clear all filters|clear filters|clear the filters|remove all filters|reset filters", "எல்லா வடிப்பான்களையும் அழி|வடிப்பான்களை அழி|ஃபில்டர் எல்லாம் எடு", "filters clear pannu|filter ellam clear pannu|clear filters");
c("account.signOut", "account", NEVER, N("signs the Collector out"), "Sign out|log out|logout", "கணக்கிலிருந்து வெளியேறு|வெளியேறு|லாக் அவுட்", "sign out|logout pannu|log out");

// ------------------------------------------------------------------------------------------------------------------------- the palette --
c("palette.input", "palette", "A", P("#dic-q", { input: "text" }), "Search box|search field|type in search", "தேடல் பெட்டி|தேடல் புலம்", "search box|search field");
c("palette.action.askDistrictIQ", "palette", "A", S(panel("assistant")), "Ask District IQ|District IQ|the chatbot|open the chatbot|open the chat", "District IQ-விடம் கேளுங்கள்|டிஸ்ட்ரிக்ட் IQ|சாட்பாட்", "district iq|chatbot open pannu|chat open pannu");
c("palette.action.jarvis", "palette", "A", S({ a: "off" }), "Switch Jarvis off|turn Jarvis off|Jarvis off", "ஜார்விஸை அணை|ஜார்விஸ் ஆஃப்", "jarvis off pannu|jarvis-a off pannu");
c("palette.action.rain", "palette", "A", M, "Rain & flooding|rain and flooding|flood view", "மழை வெள்ளம்|மழை வெள்ளப் பார்வை", "rain flooding|mazhai vellam");
c("palette.action.askMap", "palette", "A", S(panel("map")), "Ask the map|open ask the map|big map|grow the map", "வரைபடத்திடம் கேளுங்கள்|பெரிய வரைபடம்|வரைபடத்தைப் பெரிதாக்கு", "ask the map|big map|map perusa pannu");
c("palette.action.export", "palette", "A", S(panel("export")), "Export report in search|export from search", "தேடலில் அறிக்கை ஏற்றுமதி", "search la export");
c("palette.action.dataSources", "palette", "A", S(panel("sources")), "Open data sources|data sources in search", "தரவு மூலங்களைத் திற", "data sources open pannu");
c("palette.action.workspaces", "palette", "A", S(panel("workspace")), "Workspaces in search|open workspaces", "பணியிடங்களைத் திற", "workspaces open pannu");
c("palette.action.customize", "palette", "A", S(panel("customize")), "Customize from search|open customize", "தனிப்பயனாக்கலைத் திற", "customize open pannu");
c("palette.action.theme", "palette", "A", S({ a: "theme", theme: "dark" }), "Switch to dark theme|dark theme please", "இருண்ட தீமுக்கு மாற்று", "dark theme ku maathu");
c("palette.action.theme:light", "palette", "A", S({ a: "theme", theme: "light" }), "Switch to light theme|light theme please", "ஒளி தீமுக்கு மாற்று", "light theme ku maathu");
c("palette.action.reload", "palette", "A", RELOAD, "Reload data from search|reload the data", "தரவை மறுபடி ஏற்று", "data-a reload pannu");
c("palette.action.clearFilters", "palette", "A", S(CLEAR), "Clear all filters from search|clear every filter", "ஒவ்வொரு வடிப்பானையும் அழி", "ella filter-um clear pannu");

// --------------------------------------------------------------------------------------------------------------------- the filter band --
c("filter.period.daily", "filters", "A", S({ a: "period", period: "daily" }), "Daily|day|daily view|per day", "தினசரி|நாள்|தினசரி பார்வை", "daily|daily view|dhinamum");
c("filter.period.weekly", "filters", "A", S({ a: "period", period: "weekly" }), "Weekly|week|weekly view|this week", "வாராந்திர|வாரம்|இந்த வாரம்", "weekly|vaaram|indha vaaram");
c("filter.period.monthly", "filters", "A", S({ a: "period", period: "monthly" }), "Monthly|month|monthly view|this month", "மாதாந்திர|மாதம்|இந்த மாதம்", "monthly|maasam|indha maasam");
c("filter.period.quarterly", "filters", "A", S({ a: "period", period: "quarterly" }), "Quarterly|quarter|quarterly view|this quarter", "காலாண்டு|மூன்று மாதம்|இந்தக் காலாண்டு", "quarterly|quarter|moonu maasam");
c("filter.zone", "filters", "A", P(".band .filters label.fsel:nth-of-type(1) select", { input: "select" }), "Zone|zone filter|zone list", "மண்டலம்|மண்டல வடிப்பான்|மண்டலப் பட்டியல்", "zone|zone filter");
c("filter.taluk", "filters", "A", P(".band .filters label.fsel:nth-of-type(2) select", { input: "select" }), "Taluk|taluk filter|taluk list", "வட்டம்|வட்ட வடிப்பான்|வட்டப் பட்டியல்", "taluk|taluk filter");
c("filter.department", "filters", "A", P(".band .filters label.fsel:nth-of-type(3) select", { input: "select" }), "Department|department filter|department list", "துறை|துறை வடிப்பான்|துறைப் பட்டியல்", "department|department filter");
c("filter.category.clear", "filters", "A", S({ a: "view", view: { cat: null } }), "Clear category|clear the category filter|remove the category", "வகையை அழி|வகை வடிப்பானை எடு", "category clear pannu|category filter edu");
c("filter.clear", "filters", "A", S(CLEAR), "Clear|clear the filter band", "அழி|வடிப்பான்களை அகற்று", "clear|filter clear pannu");

// ------------------------------------------------------------------------------------------------------------------ the band, the fabs --
c("band.alerts.chip", "band", "A", P("button.alc"), "Warnings|warning chip|the weather warning", "எச்சரிக்கை|வானிலை எச்சரிக்கை", "warning|warning chip|weather warning");
c("band.alerts.hide", "band", "A", P("[role=dialog] button::hide until it changes|மாறும் வரை"), "Hide until it changes|hide the warning", "மாறும் வரை மறை|எச்சரிக்கையை மறை", "warning hide pannu|maarum varai maraicchu");
c("band.collected", "band", "A", S(panel("sources")), "Collected|data freshness|freshness chip", "சேகரிக்கப்பட்டது|தரவு புதுமை", "collected|data freshness");
c("overlay.scrim", "window", "A", S(CLOSE), "Click outside|close this window|close the panel", "வெளியே தட்டு|இந்தச் சாளரத்தை மூடு", "veliya click pannu|window close pannu", W(WINDOWS));
c("fab.askDistrictIQ", "fab", "A", S(panel("assistant")), "Ask District IQ button|the chat button|District IQ button", "District IQ பொத்தான்|சாட் பொத்தான்", "district iq button|chat button");
c("fab.jarvis", "fab", "A", S({ a: "off" }), "Close Jarvis|Jarvis off|turn off Jarvis", "ஜார்விஸை மூடு|ஜார்விஸ் ஆஃப்", "jarvis close pannu|jarvis off");
c("fab.jarvis.earlierQuestions", "fab", "A", P(".jvf-q", { own: true }), "Earlier questions|my earlier questions|past questions|question history", "முந்தைய கேள்விகள்|பழைய கேள்விகள்", "earlier questions|munnadi ketta questions|old questions");
c("toast.action", "band", "A", P(".toast button"), "Refresh on the toast|refresh the new data|toast refresh", "அறிவிப்பில் புதுப்பி|புதிய தரவைப் புதுப்பி", "toast refresh|pudhu data refresh pannu");
c("kbd.ctrlK", "keys", "A", S(panel("assistant")), "Control K|ctrl K", "கண்ட்ரோல் கே", "control k|ctrl k");
c("kbd.slash", "keys", "A", S(panel("palette")), "Slash key|press slash", "ஸ்லாஷ் விசை|ஸ்லாஷ்", "slash key|slash");
c("kbd.escape", "keys", "A", S(CLOSE), "Escape|escape key|press escape", "எஸ்கேப்|எஸ்கேப் விசை", "escape|escape key");

// ------------------------------------------------------------------------------------------------------------- the Overview's cards --
c("kpi.severe", "kpi", "A", P("button.kpi[data-k=\"severe\"]"), "Severe events tile|severe events card|click severe events", "கடுமையான நிகழ்வுகள் அட்டை|கடுமையான நிகழ்வுகள் அட்டையைத் தட்டு", "severe events tile|severe events card", OV);
c("kpi.openComplaints", "kpi", "A", P("button.kpi[data-k=\"complaints\"]"), "Open complaints tile|open complaints card|click open complaints", "திறந்த புகார்கள் அட்டை|திறந்த புகார்கள் அட்டையைத் தட்டு", "open complaints tile|open complaints card", OV);
c("kpi.ongoing", "kpi", "A", P("button.kpi[data-k=\"ongoing\"]"), "Ongoing incidents tile|ongoing incidents card|click ongoing incidents", "நடப்பு நிகழ்வுகள் அட்டை|நடப்பு நிகழ்வுகள் அட்டையைத் தட்டு", "ongoing incidents tile|ongoing incidents card", OV);
c("kpi.resolved", "kpi", "A", P("button.kpi[data-k=\"resolved\"]"), "Resolved tile|resolved card|click resolved", "தீர்க்கப்பட்டவை அட்டை|தீர்க்கப்பட்டவை அட்டையைத் தட்டு", "resolved tile|resolved card", OV);
c("snap.mostSeriousZones", "snapshot", "A", P("button.stile[data-l^=\"Most serious zones\"]"), "Most serious zones|most serious zones tile", "மிகவும் தீவிரமான மண்டலங்கள்|தீவிரமான மண்டலங்கள் அட்டை", "most serious zones|serious zones tile", OV);
c("snap.pastDeadline", "snapshot", "A", P("button.stile[data-l^=\"Past deadline\"]"), "Past deadline, still open|past deadline tile|overdue tile", "காலக்கெடு தாண்டியும் திறந்தவை|காலக்கெடு தாண்டியவை அட்டை", "past deadline tile|deadline thaandinadhu", OV);
c("snap.severeUnchecked", "snapshot", "A", P("button.stile[data-l^=\"Severe, not yet checked\"]"), "Severe, not yet checked|not yet checked tile", "கடுமையானவை, இன்னும் சரிபார்க்கப்படாதவை|சரிபார்க்கப்படாதவை அட்டை", "severe not yet checked|check pannaadha severe", OV);
c("snap.busiestDept", "snapshot", "A", P("button.stile[data-l^=\"Busiest department\"]"), "Busiest department|busiest department tile", "அதிக வேலை உள்ள துறை|பரபரப்பான துறை", "busiest department|busy department tile", OV);
c("snap.dept.allContacts", "snapshot", "A", P("button.more::all contacts"), "All contacts|department contacts|the officers' contacts", "எல்லா தொடர்புகளும்|துறைத் தொடர்புகள்", "all contacts|contacts kaattu", OV);
c("snap.dept.mostOpenWorkIn", "snapshot", "A", P("button.stile[data-l^=\"Most open work in\"]"), "Most open work in|most open work tile", "அதிக திறந்த வேலை உள்ள இடம்", "most open work|open work tile", OV);
c("snap.officer.contact", "snapshot", NEVER, N("calls or emails an officer: the Collector's own tap"), "Call the officer|email the officer", "அலுவலரை அழை|அலுவலருக்கு மின்னஞ்சல்", "officer-a call pannu|officer ku mail pannu", OV);
c("map.layer.severe", "mapcard", "A", S({ a: "layer", layer: "severe", on: null }), "Severe pins|severe layer|severe on the map", "கடுமை குறிகள்|கடுமை அடுக்கு", "severe pins|severe layer", OV);
c("map.layer.complaint", "mapcard", "A", S({ a: "layer", layer: "complaint", on: null }), "Complaint pins|complaints layer|complaints on the map", "புகார் குறிகள்|புகார் அடுக்கு", "complaint pins|complaints layer", OV);
c("map.layer.other", "mapcard", "A", S({ a: "layer", layer: "other", on: null }), "Other pins|other layer|other incidents on the map", "மற்ற குறிகள்|மற்றவை அடுக்கு", "other pins|other layer", OV);
c("map.layer.added", "mapcard", "A", S({ a: "layer", layer: "added", on: null }), "Added pins|added layer|added items on the map", "சேர்த்த குறிகள்|சேர்த்தவை அடுக்கு", "added pins|added layer", OV);
c("map.layer.stations", "mapcard", "A", S({ a: "layer", layer: "stations", on: null }), "Station pins|stations layer|weather stations on the map", "நிலையக் குறிகள்|நிலையங்கள் அடுக்கு", "station pins|stations layer", OV);
c("map.notDrawn", "mapcard", "A", P("button.unloc::not drawn"), "Not drawn|pins not drawn|every incident in this view", "வரையப்படாதவை|வரையப்படாத குறிகள்", "not drawn|draw pannaadhadhu", OV);
c("map.unlocated", "mapcard", "A", P("button.unloc::not on the map|வரைபடத்தில் இல்லை"), "Not on the map|unlocated incidents|incidents with no place", "வரைபடத்தில் இல்லை|இடம் தெரியாத சம்பவங்கள்", "map la illadhadhu|not on the map", OV);
c("map.mode.zones", "mapcard", "A", S({ a: "mapMode", mode: "zones" }), "Zones|zone map|zones view", "மண்டலங்கள்|மண்டல வரைபடம்", "zones|zone map|zones view");
c("map.mode.taluks", "mapcard", "A", S({ a: "mapMode", mode: "taluks" }), "Taluks|taluk map|taluks view", "வட்டங்கள்|வட்ட வரைபடம்", "taluks|taluk map|taluks view");
c("map.zoomIn", "mapcard", "A", P(".map-tools button:nth-of-type(1)"), "Zoom in|zoom in on the map|closer", "பெரிதாக்கு|ஜூம் இன்|அருகே காட்டு", "zoom in|zoom in pannu|kitta kaattu", OV);
c("map.zoomOut", "mapcard", "A", P(".map-tools button:nth-of-type(2)"), "Zoom out|zoom out on the map|further out", "சிறிதாக்கு|ஜூம் அவுட்|தொலைவில் காட்டு", "zoom out|zoom out pannu", OV);
c("map.fit", "mapcard", "A", P(".map-tools button:nth-of-type(3)"), "Fit the view|whole district|show the whole district|reset the map view", "முழு மாவட்டம்|முழு வரைபடம்|முழு மாவட்டத்தைக் காட்டு", "whole district|full map|fit the view", OV);
c("map.backToPrevious", "mapcard", "A", P(".map-back"), "Back to previous view|previous map view|map back", "முந்தைய பார்வைக்குத் திரும்பு|முந்தைய வரைபடப் பார்வை", "previous view|map back pannu", OV);
c("map.rightClick", "mapcard", "A", M, "What is happening here|ask about this spot", "இங்கே என்ன நடக்கிறது|இந்த இடம் பற்றி கேள்", "inga enna nadakkudhu", OV);
c("att.switch.severity", "severity", "A", P(".att-sw [role=tab]:nth-of-type(1)"), "By severity|severity view|by severity tab", "தீவிரம்|தீவிரப்படி|தீவிரம் டேப்", "by severity|severity view", OV);
c("att.switch.tasks", "tasks", "A", P(".att-sw [role=tab]:nth-of-type(2)"), "My tasks|tasks tab|show my tasks", "பணிகள்|என் பணிகள்|பணிகள் டேப்", "my tasks|tasks tab|en tasks", OV);
c("att.seeAll", "severity", "A", P(".att button.more"), "See all incidents|see all|all of them in a list", "அனைத்தும்|எல்லா சம்பவங்களும்|அனைத்தையும் பார்", "see all|ella incidents|ellaam paaru", OV);
c("att.sevPill.severe", "severity", "A", S({ a: "view", view: { sev: "Severe" } }), "Severe tab|severe pill|severe list", "கடுமை டேப்|கடுமை பட்டியல்", "severe tab|severe list");
c("att.sevPill.high", "severity", "A", S({ a: "view", view: { sev: "High" } }), "High tab|high pill|high list", "அதிகம் டேப்|அதிக தீவிர பட்டியல்", "high tab|high list");
c("att.sevPill.medium", "severity", "A", S({ a: "view", view: { sev: "Medium" } }), "Medium tab|medium pill|medium list", "நடுத்தரம் டேப்|நடுத்தர பட்டியல்", "medium tab|medium list");
c("att.sevPill.low", "severity", "A", S({ a: "view", view: { sev: "Low" } }), "Low tab|low pill|low list", "குறைவு டேப்|குறைந்த தீவிர பட்டியல்", "low tab|low list");
c("task.sendBack", "tasks", NEVER, N("sends a task back to the department"), "Send back to the department|send back", "துறைக்குத் திருப்பி அனுப்பு", "department ku thirumbi anuppu", OV);
c("task.verify", "tasks", NEVER, N("verifies a department's work"), "Verify|verify the work|mark verified", "சரிபார்|வேலையை உறுதிசெய்", "verify pannu|work verify pannu", OV);
c("task.openIncident", "tasks", "A", P(".att-link"), "Open the incident from my tasks|task's incident", "பணியின் சம்பவத்தைத் திற", "task incident open pannu", OV);
c("news.seeMore", "newscard", "A", P(".a-brief button.more"), "See more|more news|see more news", "மேலும்|மேலும் செய்திகள்", "see more|innum news", OV);
c("news.tab.news", "newscard", "A", P(".a-brief .btabs [role=tab]:nth-of-type(1)"), "News|news tab", "செய்தி|செய்தி டேப்", "news tab|news", OV);
c("news.tab.differ", "newscard", "A", P(".a-brief .btabs [role=tab]:nth-of-type(2)"), "Differ|reports differ tab|differ tab", "முரண்|முரண் டேப்|முரண்பாடுகள்", "differ tab|reports differ", OV);
c("news.tab.nextDoor", "newscard", "A", P(".a-brief .btabs [role=tab]:nth-of-type(3)"), "Next door|next door tab|neighbouring districts", "அண்டை|அண்டை டேப்|அண்டை மாவட்டங்கள்", "next door|next door tab|pakkathu district", OV);
c("news.tab.added", "newscard", "A", P(".a-brief .btabs [role=tab]:nth-of-type(4)"), "Added|added tab|added items tab", "சேர்த்தவை|சேர்த்தவை டேப்", "added tab|added items", OV);

// ------------------------------------------------------------------------------- Ask the Map and Rain & flooding: the map lane's (map10.ts) --
const MAPS: [string, string, string, string][] = [
  ["askmap.pill.open", "Ask the map pill|open ask the map pill", "வரைபடத்திடம் கேளுங்கள் பொத்தான்", "ask the map pill"],
  ["askmap.input", "Ask the map box|map question box", "வரைபடக் கேள்விப் பெட்டி", "map question box"],
  ["askmap.ask", "Ask the map now|send the map question", "வரைபடத்திடம் இப்போது கேள்", "map kitta ippo kelu"],
  ["askmap.mic", "Speak to the map|map microphone", "வரைபடத்திடம் பேசு", "map kitta pesu"],
  ["askmap.suggestions.toggle", "Suggested questions|map suggestions", "பரிந்துரைக்கப்பட்ட கேள்விகள்", "suggested questions"],
  ["askmap.suggestion.pick", "Ask the suggested question|try the suggestion", "பரிந்துரைத்த கேள்வியைக் கேள்", "suggestion kelu"],
  ["askmap.newChat", "New map chat|new map question", "புதிய வரைபட உரையாடல்", "pudhu map chat"],
  ["askmap.back", "Back to overview from the map|shrink the map", "வரைபடத்திலிருந்து மேலோட்டத்துக்கு", "map-la irundhu overview ku"],
  ["askmap.panel.minimise", "Minimise the map panel|hide the map panel", "வரைபடப் பலகையைச் சிறிதாக்கு", "map panel minimise pannu"],
  ["askmap.panel.dock", "Dock the map panel|dock on the left", "வரைபடப் பலகையை இடப்புறம் வை", "map panel dock pannu"],
  ["askmap.turn.retry", "Try the map question again|retry the map", "வரைபடக் கேள்வியை மீண்டும் முயல்", "map retry pannu"],
  ["askmap.turn.showAgain", "Show the earlier map answer|show that map answer again", "முந்தைய வரைபடப் பதிலைக் காட்டு", "munnadi map answer kaattu"],
  ["askmap.filters.toggle", "Change the map question|edit the map question", "வரைபடக் கேள்வியை மாற்று", "map question maathu"],
  ["askmap.chip.menu", "Map chip menu|change a map chip", "வரைபடச் சிப் மெனு", "map chip menu"],
  ["askmap.chip.option", "Pick a map chip option|map chip option", "வரைபடச் சிப் தேர்வு", "map chip option"],
  ["askmap.chip.remove", "Remove a map chip|drop that part of the map question", "வரைபடச் சிப்பை நீக்கு", "map chip remove pannu"],
  ["askmap.answer.tile", "Map answer tile|still open on the map", "வரைபடப் பதில் அட்டை", "map answer tile"],
  ["askmap.answer.showAll", "Show all on the map answer|map show all", "வரைபடப் பதிலில் அனைத்தும்", "map answer ellam kaattu"],
  ["askmap.send", "Send the map answer to the department|map send to department", "வரைபடப் பதிலைத் துறைக்கு அனுப்பு", "map answer department ku anuppu"],
  ["askmap.export", "Export the map answer|map export", "வரைபடப் பதிலை ஏற்றுமதி செய்", "map export pannu"],
  ["askmap.saveView", "Save the map view|map save view", "வரைபடப் பார்வையைச் சேமி", "map view save pannu"],
  ["askmap.tour", "Map hotspot tour|tour the top three places", "வரைபடச் சுற்றுப் பயணம்", "map tour"],
  ["askmap.followRoad", "Follow the road|follow this road", "சாலை வழியே|இந்தச் சாலை வழியே", "road follow pannu"],
  ["askmap.beforeNow", "Before and now on the map|map before now", "வரைபடத்தில் முன்பு இப்போது", "map before now"],
  ["askmap.trace.toggle", "How this was worked out|map working", "இது எப்படிக் கணக்கிடப்பட்டது", "idhu eppadi kanakku pottadhu"],
  ["askmap.trace.step", "Map working step|show that working step", "வரைபடக் கணக்குப் படி", "map working step"],
  ["askmap.list.row", "Map case row|a case on the map list", "வரைபடப் பட்டியல் சம்பவம்", "map list case"],
  ["askmap.list.press", "Map case news link|that outlet's story", "வரைபடச் செய்தி இணைப்பு", "map news link"],
  ["askmap.list.showAll", "Show all map cases|map list show all", "வரைபடச் சம்பவங்கள் அனைத்தும்", "map cases ellam"],
  ["askmap.brief.count", "What is happening here count|map brief count", "இங்கே நடப்பதன் எண்ணிக்கை", "inga nadakkuradhu count"],
  ["askmap.brief.worst", "Worst three on the map|map worst three", "வரைபடத்தில் மோசமான மூன்று", "map worst moonu"],
  ["askmap.answerPin", "Map answer pin|a pin of the map answer", "வரைபடப் பதில் குறி", "map answer pin"],
  ["askmap.tool.backToAnswer", "Back to the map answer|map target", "வரைபடப் பதிலுக்குத் திரும்பு", "map answer ku thirumbu"],
  ["askmap.tool.heat", "Heat view|map heat view", "வெப்பப் பார்வை", "heat view"],
  ["askmap.tool.circle", "Draw a circle on the map|map circle", "வரைபடத்தில் வட்டம் வரை", "map la circle podu"],
  ["askmap.tool.layers", "Map layers menu|map layers", "வரைபட அடுக்குகள்", "map layers"],
  ["askmap.tool.basemap", "Switch to the streets map|satellite or streets", "தெரு வரைபடத்துக்கு மாற்று", "streets map ku maathu"],
  ["map.overlay.live_rain", "Rain last 24 hours layer|rain layer", "கடந்த 24 மணி மழை அடுக்கு", "rain layer"],
  ["map.overlay.live_lakes", "Lake levels layer|lakes layer", "ஏரி நீர்மட்ட அடுக்கு", "lake levels layer"],
  ["map.overlay.live_works", "PWD works layer|works under way layer", "பொதுப்பணி வேலைகள் அடுக்கு", "pwd works layer"],
  ["map.overlay.live_hospitals", "Government hospital beds layer|hospital beds layer", "அரசு மருத்துவமனைப் படுக்கைகள் அடுக்கு", "hospital beds layer"],
  ["map.overlay.live_air", "Air quality layer|air layer", "காற்றின் தர அடுக்கு", "air quality layer"],
  ["map.overlay.news", "News reports layer|news on the map", "செய்தி அறிக்கைகள் அடுக்கு", "news layer"],
  ["map.overlay.schools", "Schools layer|schools on the map", "பள்ளிகள் அடுக்கு", "schools layer"],
  ["map.overlay.colleges", "Colleges layer|colleges on the map", "கல்லூரிகள் அடுக்கு", "colleges layer"],
  ["map.overlay.hospitals", "Hospitals layer|hospitals on the map", "மருத்துவமனைகள் அடுக்கு", "hospitals layer"],
  ["map.overlay.fire_stations", "Fire stations layer|fire stations on the map", "தீயணைப்பு நிலையங்கள் அடுக்கு", "fire stations layer"],
  ["map.overlay.police", "Police stations layer|police on the map", "காவல் நிலையங்கள் அடுக்கு", "police stations layer"],
  ["map.overlay.rail_metro", "Rail and metro layer|rail on the map", "ரயில் மெட்ரோ அடுக்கு", "rail metro layer"],
  ["map.overlay.water_bodies", "Lakes and ponds layer|water bodies layer", "ஏரிகள் குளங்கள் அடுக்கு", "lakes ponds layer"],
  ["map.overlay.waterways", "Rivers and canals layer|waterways layer", "ஆறுகள் கால்வாய்கள் அடுக்கு", "rivers canals layer"],
  ["askmap.export.csv", "Export the map as CSV|map CSV", "வரைபடத்தை சிஎஸ்வி ஆக", "map csv"],
  ["askmap.export.geojson", "Export the map as GeoJSON|map GeoJSON", "வரைபடத்தை ஜியோஜேசன் ஆக", "map geojson"],
  ["askmap.export.cancel", "Cancel the map export|map export cancel", "வரைபட ஏற்றுமதியை ரத்து செய்", "map export cancel"],
  ["askmap.sendDialog.dept", "Map draft department|the department of the map draft", "வரைபட வரைவுத் துறை", "map draft department"],
  ["askmap.sendDialog.subject", "Map draft subject|subject of the map draft", "வரைபட வரைவின் தலைப்பு", "map draft subject"],
  ["askmap.sendDialog.message", "Map draft message|message of the map draft", "வரைபட வரைவின் செய்தி", "map draft message"],
  ["askmap.sendDialog.close", "Close the map draft|map send dialog close", "வரைபட வரைவை மூடு", "map draft close"],
  ["rain.close", "Close rain and flooding|close the flood view", "மழை வெள்ளத்தை மூடு", "rain flooding close pannu"],
  ["rain.tab.flood", "Flooding tab|flooding", "வெள்ளம் டேப்|வெள்ளம்", "flooding tab"],
  ["rain.tab.traffic", "Traffic tab|traffic in the rain", "போக்குவரத்து டேப்", "traffic tab"],
  ["rain.tab.power", "Power tab|power cuts in the rain", "மின்சாரம் டேப்", "power tab"],
  ["rain.tab.metro", "Metro tab|metro in the rain", "மெட்ரோ டேப்", "metro tab"],
  ["rain.tryAgain", "Try rain and flooding again|retry the flood view", "மழை வெள்ளத்தை மீண்டும் முயல்", "rain retry pannu"],
  ["rain.also.chip", "Also in this rain|what else happened in this rain", "இந்த மழையில் மேலும்", "indha mazhaila innum"],
  ["rain.pastRain.open", "Open a past heavy rain|past heavy rains", "கடந்த கனமழைகள்", "past heavy rains"],
  ["rain.zone.toggle", "Flooded zone|zones with the most flooding", "அதிக வெள்ள மண்டலங்கள்", "flood zones"],
  ["rain.street.open", "Flood street|streets that flood", "வெள்ளம் வரும் தெருக்கள்", "flood streets"],
  ["rain.report.open", "Flooding report|open a flooding report", "வெள்ள அறிக்கை", "flood report"],
  ["rain.reports.showAll", "Show all flooding reports|show fewer flooding reports", "எல்லா வெள்ள அறிக்கைகளும்", "ella flood reports"],
  ["rain.nav.allRains", "All rains|every heavy rain", "எல்லா மழைகளும்", "ella mazhai"],
  ["rain.nav.older", "Older rain|the rain before", "முந்தைய மழை", "munnadi mazhai"],
  ["rain.nav.newer", "Newer rain|the rain after", "அடுத்த மழை", "adutha mazhai"],
  ["rain.card.back", "Back to the rain|back to all rains", "மழைக்குத் திரும்பு", "mazhaikku thirumbu"],
  ["rain.card.openComplaint", "Open the flood complaint|open that complaint", "வெள்ளப் புகாரைத் திற", "flood complaint open pannu"],
  ["rain.card.streetLink", "Open the flood street|that street", "அந்தத் தெருவைத் திற", "andha street open pannu"],
  ["rain.rainDot", "Rain dot|one heavy rain", "மழைப் புள்ளி", "rain dot"],
  ["rain.jobs.review", "Review and send the jobs|jobs before the next rain", "அடுத்த மழைக்கு முன் வேலைகள்", "next mazhaikku munnadi jobs"],
  ["rain.map.pick", "Pick on the flood map|that flood spot", "வெள்ள வரைபடத்தில் தேர்ந்தெடு", "flood map pick"],
  ["impact.byRain", "That rain's impact|what happened in that rain", "அந்த மழையின் பாதிப்பு", "andha mazhai impact"],
  ["impact.item.open", "Open the jammed road|open that line", "நெரிசலான சாலையைத் திற", "jam road open pannu"],
  ["impact.sources", "Where this comes from|impact sources", "இது எங்கிருந்து வருகிறது", "idhu enga irundhu varudhu"],
  ["impact.source.open", "Open the impact report|read the impact article", "பாதிப்பு அறிக்கையைத் திற", "impact report open pannu"],
  ["impact.liveTraffic", "Live speeds on the map|live traffic", "நேரலை போக்குவரத்து", "live traffic"],
  ["plan.close", "Close the jobs sheet|close send jobs", "வேலைகள் தாளை மூடு", "jobs sheet close pannu"],
  ["plan.dept.tick", "Tick all the department's jobs|department jobs tick", "துறையின் எல்லா வேலைகளையும் டிக் செய்", "department jobs tick pannu"],
  ["plan.job.tick", "Tick that job|job tick", "அந்த வேலையை டிக் செய்", "andha job tick pannu"],
  ["plan.job.showOnMap", "Show that job on the map|job on the map", "அந்த வேலையை வரைபடத்தில் காட்டு", "job map la kaattu"],
  ["plan.draft", "Draft the job emails|draft emails for the jobs", "வேலை மின்னஞ்சல்களை வரைவு செய்", "job emails draft pannu"],
  ["plan.subject", "Job email subject|subject of the job email", "வேலை மின்னஞ்சலின் தலைப்பு", "job email subject"],
  ["plan.message", "Job email message|message of the job email", "வேலை மின்னஞ்சலின் செய்தி", "job email message"],
  ["plan.backToJobs", "Back to the jobs|jobs list", "வேலைகளுக்குத் திரும்பு", "jobs ku thirumbu"]
];
for (const [id, en, ta, tl] of MAPS) c(id, id.startsWith("rain.") || id.startsWith("impact.") || id.startsWith("plan.") ? "rain" : "askmap", "A", M, en, ta, tl, OV);
c("askmap.sendDialog.approve", "askmap", NEVER, N("sends to a department"), "Approve and send the map draft|approve the map draft", "வரைபட வரைவுக்கு ஒப்புதல் அளித்து அனுப்பு", "map draft approve pannu", OV);
c("plan.approve", "rain", NEVER, N("sends to a department"), "Approve and send the jobs|approve one department's jobs", "வேலைகளுக்கு ஒப்புதல் அளித்து அனுப்பு", "jobs approve pannu", OV);
c("plan.approveAll", "rain", NEVER, N("sends to every department"), "Approve all the jobs|approve all", "எல்லா வேலைகளுக்கும் ஒப்புதல்", "ella jobs approve pannu", OV);

// ----------------------------------------------------------------------------------------------------------------- the Briefing page --
c("bb.keypoints.lang", "briefing", "A", P(".bb-lang button:nth-of-type(2)"), "Key points in Tamil|Tamil key points", "முக்கியக் குறிப்புகள் தமிழில்|தமிழ் குறிப்புகள்", "key points tamil la|tamil key points", BR);
c("bb.keypoints.lang:en", "briefing", "A", P(".bb-lang button:nth-of-type(1)"), "Key points in English|English key points", "முக்கியக் குறிப்புகள் ஆங்கிலத்தில்|ஆங்கிலக் குறிப்புகள்", "key points english la|english key points", BR);
c("bb.keypoints.listen", "briefing", "A", P("button.bb-btn"), "Listen to the key points|listen|read the key points aloud", "முக்கியக் குறிப்புகளைக் கேளுங்கள்|கேளுங்கள்", "key points kelu|key points padi", BR);
c("bb.oldestComplaint", "briefing", "A", P("button.bb-fact"), "Oldest open complaint|the oldest complaint", "மிகப் பழைய திறந்த புகார்|பழைய புகார்", "oldest complaint|pazhaya complaint", BR);
c("bb.depts.seeAll", "briefing", "A", S(panel("depts")), "See all departments|departments|departments window", "எல்லா துறைகளும்|துறைகள்|துறைகள் சாளரம்", "ella departments|departments|departments window");
c("bb.dept.seeAll", "briefing", "A", P("button.bb-all"), "See all reports|all the department's reports", "எல்லா அறிக்கைகளும்|துறையின் எல்லா அறிக்கைகளும்", "ella reports|department reports ellam", BR);
c("bb.stories.seeAll", "briefing", "A", S(panel("stories")), "See all stories|developing stories|stories still developing", "வளரும் செய்திகள்|எல்லா செய்திகளும்", "developing stories|ella stories");
c("bb.newsOnly.seeAll", "briefing", "A", S(panel("gaps")), "See all only in the news|only in the news|news only incidents", "செய்தியில் மட்டும்|செய்தியில் மட்டுமே உள்ளவை", "news la mattum|news only incidents");
c("bp.fullText", "briefing", "A", P("button.more::full text|முழு உரை"), "Full text|the full briefing|whole briefing", "முழு உரை|முழுச் சுருக்கம்", "full text|full briefing", BR);
c("bp.download", "briefing", "A", P("button.more::download|பதிவிறக்கு"), "Download the briefing|download briefing text", "சுருக்கத்தைப் பதிவிறக்கு|பதிவிறக்கு", "briefing download pannu|download briefing", BR);
c("bp.save", "briefing", "A", S(panel("workspace")), "Save the briefing view|save this briefing", "இந்தச் சுருக்கத்தைச் சேமி|சுருக்கப் பார்வையைச் சேமி", "briefing save pannu|indha briefing save", BR);
c("bp.opening.lang", "briefing", "A", P(".bf2-lang button:nth-of-type(2)"), "Opening in Tamil|Tamil opening", "தொடக்கம் தமிழில்|தமிழ் தொடக்கம்", "opening tamil la|tamil opening", BR);
c("bp.opening.lang:en", "briefing", "A", P(".bf2-lang button:nth-of-type(1)"), "Opening in English|English opening", "தொடக்கம் ஆங்கிலத்தில்|ஆங்கிலத் தொடக்கம்", "opening english la|english opening", BR);
c("bp.opening.listen", "briefing", "A", P("button.bf2-listen"), "Listen to the opening|read the briefing aloud", "தொடக்கத்தைக் கேளுங்கள்|சுருக்கத்தைப் படி", "opening kelu|briefing padi", BR);
c("bp.newsOnlyGap", "briefing", "A", S(panel("gaps")), "Seen only in the news|news only gap", "செய்தியில் மட்டும் பார்த்தவை", "news la mattum paathadhu");
c("bp.decisions.more", "briefing", "A", P("button.bf2-more"), "Show more that need you|show more decisions|show only the top three", "மேலும் முடிவுகளைக் காட்டு|உங்களுக்கான மேலும் முடிவுகள்", "innum decisions kaattu|more decisions", BR);
c("bp.added.seeAll", "briefing", "A", P("button.lnk::see all"), "See all from added sources|added sources see all", "சேர்த்த மூலங்களிலிருந்து அனைத்தும்", "added sources ellam", BR);
c("bp.archived.backToLive", "briefing", "A", P("button.lnk::back to live|நேரலைக்கு"), "Back to live|live briefing|back to the live briefing", "நேரலைக்குத் திரும்பு|நேரலைச் சுருக்கம்", "live ku thirumbu|live briefing", BR);
c("bp.stories.seeAll", "briefing", "A", S(panel("stories")), "See all developing stories|developing stories card", "வளரும் செய்திகள் அனைத்தும்", "developing stories ellam");
c("bp.newsOnly.seeAll", "briefing", "A", S(panel("gaps")), "See all news with no department record|news no department record", "துறைப் பதிவு இல்லாத செய்திகள்", "department record illadha news");

// -------------------------------------------------------------------------------------------------------- Trends, Environment, prices --
c("trends.noTaluk", "trends", "A", P("button.tk::no taluk"), "No taluk|incidents with no taluk", "வட்டம் இல்லாதவை|வட்டம் இல்லாத சம்பவங்கள்", "no taluk|taluk illadhadhu", TR);
c("trends.review.all", "trends", "A", S(panel("review")), "Review all|locations needing review|review the locations", "அனைத்தையும் சரிபார்|சரிபார்க்க வேண்டிய இடங்கள்", "review all|locations review pannu");
c("trends.review.unknown", "trends", "A", S(panel("review")), "Place unknown on trends|unknown places", "இடம் தெரியாதவை", "place theriyaadhadhu", TR);
c("trends.review.placed", "trends", "A", S(panel("review")), "Placed from the report on trends|placed from reports", "அறிக்கையிலிருந்து இடம் கண்டவை", "report la irundhu place", TR);
c("env.rain.station", "env", "A", P("select[data-voice=\"env.rain.station\"]", { input: "select" }), "Rainfall station|rain station|choose the rain station", "மழை நிலையம்|மழை அளவு நிலையம்", "rain station|mazhai station", ENV);
c("env.aqi.station", "env", "A", P("select[data-voice=\"env.aqi.station\"]", { input: "select" }), "Air quality station|AQI station|air station", "காற்றுத் தர நிலையம்|காற்று நிலையம்", "air quality station|aqi station", ENV);
c("env.lake.station", "env", "A", P("select[data-voice=\"env.lake.station\"]", { input: "select" }), "Reservoir station|reservoir|lake station", "நீர்த்தேக்க நிலையம்|நீர்த்தேக்கம்|ஏரி நிலையம்", "reservoir station|lake station", ENV);
c("markets.scope.list", "markets", "A", P("[data-voice=\"markets.scope\"] button:nth-of-type(1)"), "Prices today|latest prices|today's prices", "இன்றைய விலைகள்|சமீபத்திய விலைகள்", "innaikku vilai|prices today|latest prices");
c("markets.scope.markets", "markets", "A", P("[data-voice=\"markets.scope\"] button:nth-of-type(2)"), "Compare markets|markets side by side", "சந்தைகளை ஒப்பிடு|சந்தைகள் பக்கம் பக்கமாக", "markets compare pannu|compare markets");
c("markets.scope.chennai", "markets", "A", P("[data-voice=\"markets.scope\"] button:nth-of-type(3)"), "Around Chennai|prices around Chennai", "சென்னையைச் சுற்றி|சென்னை சுற்றுவட்ட விலைகள்", "chennai suththi|around chennai");
c("markets.scope.tamilNadu", "markets", "A", P("[data-voice=\"markets.scope\"] button:nth-of-type(4)"), "Tamil Nadu prices|across Tamil Nadu", "தமிழ்நாடு விலைகள்|தமிழ்நாடு முழுவதும்", "tamil nadu prices|tamil nadu full");
c("markets.fullScreen", "markets", "A", S(panel("markets")), "Full screen prices|mandi prices|market prices window", "முழுத் திரை விலைகள்|சந்தை விலைகள்", "full screen prices|mandi prices");
c("markets.find", "markets", "A", P(".mk-bar .mk-find input", { input: "text" }), "Find a vegetable or fruit|find a vegetable|find in the prices", "காய்கறி அல்லது பழத்தைத் தேடு|காய்கறியைத் தேடு", "kaai kari thedu|vegetable find pannu");
c("markets.sort.az", "markets", "A", P(".mk-bar [role=group] button:nth-of-type(1)"), "A to Z|alphabetical|sort by name", "அகர வரிசை|பெயர் வரிசை", "a to z|name order");
// (said loosely, "rising first mela varattum", "ஏறுபவை முதல்ல": the order words are controls10.ts FIRST_W; v10 dev2, dB-control-11)
c("markets.sort.rising", "markets", "A", P(".mk-bar [role=group] button:nth-of-type(2)"), "Rising first|prices rising first", "விலை ஏறுபவை முதலில்|ஏறும் விலைகள் முதலில்|விலை ஏறுவது முதலில்", "rising first|vilai yerum first|yerum vilai first");
c("markets.sort.falling", "markets", "A", P(".mk-bar [role=group] button:nth-of-type(3)"), "Falling first|prices falling first", "விலை இறங்குபவை முதலில்|இறங்கும் விலைகள் முதலில்|விலை இறங்குவது முதலில்", "falling first|vilai irangum first|irangum vilai first");
c("markets.allMarkets", "markets", "A", P(".mk-back .btn"), "All markets|back to all markets", "எல்லா சந்தைகளும்|எல்லா சந்தைகளுக்கும் திரும்பு", "ella markets|all markets");

// ------------------------------------------------------------------------------------------------------------------------- the windows --
c("modal.close", "window", "A", S(CLOSE), "Close|close the window|close this", "மூடு|சாளரத்தை மூடு|இதை மூடு", "close pannu|window close pannu|close", W(WINDOWS));
const LW = W("list");
c("list.filter", "list", "A", P(".modal .filters input[type=search]", { input: "text" }), "Filter the list|search the list|keyword filter", "பட்டியலில் தேடு|பட்டியலை வடிகட்டு", "list la thedu|list filter pannu", LW);
c("list.department", "list", "A", P(".modal .filters select:nth-of-type(1)", { input: "select" }), "Department|department of the list", "துறை|பட்டியலின் துறை", "department|list department", LW);
c("list.severity", "list", "A", P(".modal .filters select:nth-of-type(2)", { input: "select" }), "Severity|severity of the list", "தீவிரம்|பட்டியலின் தீவிரம்", "severity|list severity", LW);
c("list.status", "list", "A", P(".modal .filters select:nth-of-type(3)", { input: "select" }), "Status|status of the list", "நிலை|பட்டியலின் நிலை", "status|list status", LW);
c("list.timeRange", "list", "A", P(".modal .filters select:nth-of-type(4)", { input: "select" }), "Time range|range of the list", "கால அளவு|பட்டியலின் கால அளவு", "time range|list time range", LW);
c("list.sort.zone", "list", "A", P(".modal thead th.sortable:nth-of-type(2)"), "Sort by zone|zone column", "மண்டலப்படி வரிசைப்படுத்து|மண்டல நெடுவரிசை", "zone vaariyaa sort pannu|zone column", LW);
c("list.sort.department", "list", "A", P(".modal thead th.sortable:nth-of-type(3)"), "Sort by department|department column", "துறைப்படி வரிசைப்படுத்து|துறை நெடுவரிசை", "department vaariyaa sort pannu|department column", LW);
c("list.sort.severity", "list", "A", P(".modal thead th.sortable:nth-of-type(4)"), "Sort by severity|severity column", "தீவிரப்படி வரிசைப்படுத்து|தீவிர நெடுவரிசை", "severity vaariyaa sort pannu|severity column", LW);
c("list.sort.reported", "list", "A", P(".modal thead th.sortable:nth-of-type(7)"), "Sort by reported|reported column|sort by date", "தேதிப்படி வரிசைப்படுத்து|புகாரளித்த நெடுவரிசை", "date vaariyaa sort pannu|reported column", LW);
c("list.page.prev", "list", "A", P(".modal .pgr button:nth-of-type(1)"), "Previous page|previous", "முந்தைய பக்கம்|முந்தையது", "previous page|munnadi page", LW);
c("list.page.next", "list", "A", P(".modal .pgr button:nth-of-type(2)"), "Next page|next", "அடுத்த பக்கம்|அடுத்தது", "next page|adutha page", LW);
c("list.retry", "list", "A", P(".modal [role=alert] .lnk"), "Retry|load the list again", "மீண்டும் முயல்|பட்டியலை மீண்டும் ஏற்று", "retry|list reload pannu", LW);
const EX = W("export");
c("export.period.daily", "export", "A", P(".modal .seg [role=tab]:nth-of-type(1)"), "Daily|daily report", "தினசரி|தினசரி அறிக்கை", "daily|daily report", EX);
c("export.period.weekly", "export", "A", P(".modal .seg [role=tab]:nth-of-type(2)"), "Weekly|weekly report", "வாராந்திர|வாராந்திர அறிக்கை", "weekly|weekly report", EX);
c("export.period.monthly", "export", "A", P(".modal .seg [role=tab]:nth-of-type(3)"), "Monthly|monthly report", "மாதாந்திர|மாதாந்திர அறிக்கை", "monthly|monthly report", EX);
c("export.period.quarterly", "export", "A", P(".modal .seg [role=tab]:nth-of-type(4)"), "Quarterly|quarterly report", "காலாண்டு|காலாண்டு அறிக்கை", "quarterly|quarterly report", EX);
c("export.pdf", "export", "A", P(".modal .btn:not(.plain)"), "Download the report|PDF|download the PDF", "அறிக்கையைப் பதிவிறக்கு|பிடிஎஃப் பதிவிறக்கு", "report download pannu|pdf download", EX);
c("export.csv", "export", "A", P(".modal .btn.plain"), "Download action list|CSV|the action list", "செயல் பட்டியலைப் பதிவிறக்கு|சிஎஸ்வி", "action list download pannu|csv download", EX);
const WS = W("workspace");
c("workspace.name", "workspace", "A", P(".wsave input", { input: "text" }), "Workspace name box|name box", "பணியிடப் பெயர் பெட்டி|பெயர் பெட்டி", "workspace name box|name box", WS);
c("workspace.save", "workspace", "B", P(".wsave .btn"), "Save new version|save a new version", "புதிய பதிப்பைச் சேமி", "pudhu version save pannu", WS);
c("workspace.rename.input", "workspace", "A", P(".wren input", { input: "text" }), "New name box|new name", "புதிய பெயர் பெட்டி|புதிய பெயர்", "pudhu name box", WS);
c("workspace.rename.save", "workspace", "B", P(".wren .btn:not(.plain)"), "Save the new name|save rename", "புதிய பெயரைச் சேமி", "pudhu name save pannu", WS);
c("workspace.rename.cancel", "workspace", "A", P(".wren .btn.plain"), "Cancel rename|cancel", "பெயர் மாற்றத்தை ரத்து செய்|ரத்து", "rename cancel pannu|cancel", WS);
c("workspace.delete", "workspace", NEVER, N("starts deleting a workspace"), "Delete the workspace|delete", "பணியிடத்தை நீக்கு", "workspace delete pannu", WS);
c("workspace.delete.confirm", "workspace", NEVER, N("deletes a workspace"), "Yes delete all versions", "எல்லா பதிப்புகளையும் நீக்கு", "ella version-um delete pannu", WS);
c("workspace.delete.keep", "workspace", "A", P(".wdel .btn.plain"), "Keep|keep it|don't delete", "வைத்திரு|நீக்க வேண்டாம்", "keep pannu|delete venaam", WS);
c("workspace.retry", "workspace", "A", P(".modal [role=alert] .lnk"), "Retry loading workspaces|retry", "பணியிடங்களை மீண்டும் ஏற்று|மீண்டும் முயல்", "workspaces retry pannu|retry", WS);
const CU = W("customize");
const CUST: [string, string, string, string][] = [
  ["customize.page.briefing", "Briefing", "சுருக்கம்", "briefing"], ["customize.page.trends", "Trends", "போக்குகள்", "trends"],
  ["customize.page.environment", "Environment", "சுற்றுச்சூழல்", "environment"], ["customize.page.studio", "Data Studio", "தரவு அரங்கம்", "data studio"],
  ["customize.panel.map", "Satellite map", "செயற்கைக்கோள் வரைபடம்", "satellite map"], ["customize.panel.snapshot", "District snapshot", "மாவட்டச் சுருக்கப் பார்வை", "district snapshot"],
  ["customize.panel.brief", "Latest news", "சமீபத்திய செய்திகள்", "latest news"], ["customize.panel.severity", "Severity-based incidents", "தீவிர அடிப்படையிலான சம்பவங்கள்", "severity incidents"],
  ["customize.panel.tasks", "My tasks", "என் பணிகள்", "my tasks"], ["customize.kpi.severe", "Severe events", "கடுமையான நிகழ்வுகள்", "severe events"],
  ["customize.kpi.complaints", "Open complaints", "திறந்த புகார்கள்", "open complaints"], ["customize.kpi.ongoing", "Ongoing incidents", "நடப்பு நிகழ்வுகள்", "ongoing incidents"],
  ["customize.kpi.resolved", "Resolved", "தீர்க்கப்பட்டது", "resolved"]
];
for (const [id, en, ta, tl] of CUST) c(id, "customize", "A", P(`input[data-voice="${id}"]`, { input: "check" }), `${en}|${en} checkbox|${en} box`, `${ta}|${ta} பெட்டி`, `${tl}|${tl} checkbox|${tl} tick`, CU);
c("customize.reset", "customize", "A", P(".cust-f .btn.plain"), "Reset to default|reset the layout", "இயல்புநிலைக்கு மீட்டமை|அமைப்பை மீட்டமை", "default ku reset pannu|layout reset", CU);
c("customize.apply", "customize", "B", P(".cust-f .btn:not(.plain)"), "Apply|apply the layout|apply these changes", "பொருத்து|இந்த அமைப்பைப் பொருத்து", "apply pannu|layout apply pannu", CU);
const SO = W("sources");
c("sources.tab.sources", "sources", "A", P(".tabs2 button:nth-of-type(1)"), "Connected sources|sources tab", "இணைக்கப்பட்ட மூலங்கள்|மூலங்கள் டேப்", "connected sources|sources tab", SO);
c("sources.tab.audit", "sources", "A", P(".tabs2 button:nth-of-type(2)"), "Audit log tab|audit tab", "தணிக்கைப் பதிவு டேப்|தணிக்கை டேப்", "audit log tab|audit tab", SO);
c("sources.run", "sources", NEVER, N("starts a pipeline load"), "Run now|refresh the feed|refresh this source", "இப்போது இயக்கு|ஊட்டத்தைப் புதுப்பி", "ippo run pannu|feed refresh pannu", SO);
c("sources.pauseResume", "sources", NEVER, N("pauses or resumes a feed"), "Pause the source|resume the source", "மூலத்தை நிறுத்து|மூலத்தைத் தொடர்", "source pause pannu|source resume pannu", SO);
c("sources.remove", "sources", NEVER, N("removes a source"), "Remove the source", "மூலத்தை நீக்கு", "source remove pannu", SO);
c("sources.allSources", "sources", "A", P(".modal .lnk::all sources|எல்லா மூலங்கள்"), "All sources|back to all sources", "எல்லா மூலங்களும்|எல்லா மூலங்களுக்கும் திரும்பு", "ella sources|all sources", SO);
c("added.civicOnly", "added", "A", P(".modal input[type=checkbox]", { input: "check" }), "Civic issues only|only civic issues", "குடிமைப் பிரச்சினைகள் மட்டும்", "civic issues mattum", W("added"));
c("item.showOnMap", "added", "A", P(".modal button::show on the map|வரைபடத்தில்"), "Show the item on the map|item on the map", "இதை வரைபடத்தில் காட்டு", "idha map la kaattu", W("item"));
c("item.sourceSettings", "added", "A", S(panel("sources")), "Source settings|settings of this source", "மூல அமைப்புகள்", "source settings", W("item"));
c("stories.openIncident", "stories", "A", P(".modal .lnk::incident|சம்பவம்"), "Open the story's incident|story incident", "செய்தியின் சம்பவத்தைத் திற", "story incident open pannu", W("stories"));
c("stories.everyReport", "stories", "A", P(".sv-all"), "Show every report|every report|hide every report", "எல்லா அறிக்கைகளையும் காட்டு", "ella reports kaattu|every report", W("stories"));
c("gaps.multiOutlet", "gaps", "A", P(".modal input[type=checkbox]", { input: "check" }), "Only stories in two or more outlets|two or more outlets", "இரண்டுக்கு மேற்பட்ட ஊடகங்களில் உள்ளவை மட்டும்", "rendu outlets mela mattum", W("gaps"));
c("review.tab.missing", "review", "A", P(".rv-bar .seg [role=tab]:nth-of-type(1)"), "Place unknown|unknown place tab", "இடம் தெரியாதவை|இடம் தெரியாத டேப்", "place theriyaadhadhu|unknown place tab", W("review"));
c("review.tab.placed", "review", "A", P(".rv-bar .seg [role=tab]:nth-of-type(2)"), "Placed from the report|placed tab", "அறிக்கையிலிருந்து இடம் கண்டவை|இடம் கண்ட டேப்", "report la place|placed tab", W("review"));
c("review.find", "review", "A", P(".rv-bar .mk-find input", { input: "text" }), "Find an incident or place|find in review", "சம்பவம் அல்லது இடத்தைத் தேடு", "incident illa place thedu", W("review"));
c("conflict.readReports", "conflict", "A", P(".modal .btn::read the reports|அறிக்கைகளைப் படி"), "Read the reports|read both reports", "அறிக்கைகளைப் படி", "reports padi", W("conflict"));

// ------------------------------------------------------------------------------------------------ the incident, its action, a story --
const INC = W("incident");
c("inc.close", "incident", "A", S(CLOSE), "Close the incident|close", "சம்பவத்தை மூடு|மூடு", "incident close pannu|close", INC);
c("inc.showOnMap", "incident", "A", P(".iv-loc::show on map|வரைபடத்தில் காட்டு"), "Show on map|show it on the map", "வரைபடத்தில் காட்டு", "map la kaattu", INC);
c("inc.nearHere", "incident", "A", S({ a: "zoom", target: null }), "What else is near here|near here|nearby incidents", "இங்கு அருகில் வேறு என்ன|அருகில் உள்ளவை", "pakkathula enna irukku|near here", INC);
c("inc.takeAction", "incident", "C", S({ a: "draft" }), "Take action|draft action|draft an instruction", "நடவடிக்கை எடு|வரைவு|அறிவுறுத்தல் வரைவு", "action edu|draft pannu|action draft", INC);
c("petition.viewer.nav", "petition", "A", P(".mn-lb-bar button::next|அடுத்து"), "Next page of the petition|next petition page", "மனுவின் அடுத்த பக்கம்", "petition adutha page", INC);
c("petition.viewer.nav:prev", "petition", "A", P(".mn-lb-bar button::previous|முந்தைய"), "Previous page of the petition|previous petition page", "மனுவின் முந்தைய பக்கம்", "petition munnadi page", INC);
c("petition.viewer.zoom", "petition", "A", P(".mn-lb-bar button::zoom in"), "Zoom into the petition|petition zoom in", "மனுவைப் பெரிதாக்கு", "petition zoom in", INC);
c("petition.viewer.zoom:out", "petition", "A", P(".mn-lb-bar button::zoom out"), "Zoom out of the petition|petition zoom out", "மனுவைச் சிறிதாக்கு", "petition zoom out", INC);
c("petition.viewer.rotate", "petition", "A", P(".mn-lb-bar button::rotate"), "Rotate the petition|rotate", "மனுவைச் சுழற்று|சுழற்று", "petition rotate pannu|rotate", INC);
c("petition.viewer.close", "petition", "A", P(".mn-lb-bar button::close"), "Close the petition viewer|close the photo", "மனுவை மூடு|படத்தை மூடு", "petition close pannu|photo close", INC);
c("ta.back", "takeaction", "A", P(".ta .ta-h .xbtn"), "Back to the incident|close the draft", "சம்பவத்துக்குத் திரும்பு|வரைவை மூடு", "incident ku thirumbu|draft close pannu", INC);
c("ta.subject", "takeaction", "A", P(".ta .ta-f:not(.grow) input", { input: "text" }), "Subject|draft subject", "தலைப்பு|வரைவின் தலைப்பு", "subject|draft subject", INC);
c("ta.message", "takeaction", "A", P(".ta .ta-f.grow textarea", { input: "text" }), "Message|draft message", "செய்தி|வரைவின் செய்தி", "message|draft message", INC);
// (C, as risk.ts runs a draft: it asks the model again and replaces the draft and the Collector's edits, so it needs the name: v10 review 2, finding 33)
c("ta.redraft", "takeaction", "C", P(".ta .ta-f2 .btn:nth-of-type(1)"), "Redraft|draft it again", "மீண்டும் வரைவு செய்|மறுவரைவு", "redraft pannu|thirumba draft pannu", INC);
c("ta.copy", "takeaction", "A", P(".ta .ta-f2 .btn:nth-of-type(2)"), "Copy the draft|copy", "வரைவை நகலெடு|நகலெடு", "draft copy pannu|copy", INC);
c("ta.cancel", "takeaction", "A", P(".ta .btn.plain::cancel|ரத்து"), "Cancel the draft|cancel", "வரைவை ரத்து செய்|ரத்து", "draft cancel pannu|cancel", INC);
c("ta.approve", "takeaction", NEVER, N("sends the instruction to the officer"), "Approve and send|send the instruction", "ஒப்புதல் அளித்து அனுப்பு", "approve panni anuppu", INC);
c("ta.done.back", "takeaction", "A", P(".ta-done .btn"), "Back to the incident after sending|done, back to the incident", "அனுப்பிய பின் சம்பவத்துக்குத் திரும்பு", "anuppina appuram incident ku", INC);
c("nv.close", "story", "A", S(CLOSE), "Close the story|close the news story", "செய்தியை மூடு", "story close pannu", W("story"));
c("nv.openIncident", "story", "A", P(".iv-loc::open the incident|சம்பவத்தை"), "Open the story's incident|open its incident", "இந்தச் செய்தியின் சம்பவத்தைத் திற", "indha news incident open pannu", W("story"));
c("sec.close", "security", "A", P(".sec .sec-x"), "Close security|close the security panel", "பாதுகாப்பை மூடு", "security close pannu");
c("sec.refInput", "security", "A", P(".sec input[translate=no]", { input: "text" }), "Email reference box|email reference", "மின்னஞ்சல் குறிப்பு பெட்டி", "email reference box");
c("sec.check", "security", "A", P(".sec button.pri"), "Check the reference|check", "குறிப்பைச் சரிபார்|சரிபார்", "reference check pannu|check");
c("sec.signOutOthers", "security", NEVER, N("signs out every other device"), "Sign out every other device|sign out other devices", "மற்ற எல்லாச் சாதனங்களிலிருந்தும் வெளியேறு", "matha devices la irundhu sign out");
c("cfm.code", "confirm", NEVER, N("a password or a code: never typed by Jarvis"), "Password box|code box", "கடவுச்சொல் பெட்டி|குறியீட்டுப் பெட்டி", "password box|code box");
c("cfm.confirm", "confirm", NEVER, N("confirms a guarded action"), "Confirm it's me|confirm", "உறுதிசெய்", "confirm pannu");
c("cfm.cancel", "confirm", "A", P(".cfm .cfm-acts button[type=button]"), "Cancel the check|cancel", "சரிபார்ப்பை ரத்து செய்|ரத்து", "check cancel pannu|cancel");
c("cfm.usePassword", "confirm", "A", P(".cfm .cfm-alt button:nth-of-type(1)::password|கடவுச்சொல்"), "Use my password|password instead", "என் கடவுச்சொல்லைப் பயன்படுத்து", "en password use pannu");
c("cfm.emailCode", "confirm", NEVER, N("emails a code"), "Email me a code|send another code", "எனக்கு மின்னஞ்சலில் குறியீடு அனுப்பு", "enakku code mail pannu");

// ------------------------------------------------------------------------------------------------------------------- the Data Studio --
c("studio.add.link", "studio", "A", P(".ds-linkf input", { input: "text" }), "Link box|paste a link|link to a data source", "இணைப்புப் பெட்டி|தரவு இணைப்பு", "link box|link paste pannu", ST);
c("studio.add.linkGo", "studio", NEVER, N("reads a link into a new dataset"), "Read the link|add the link", "இணைப்பைப் படி", "link padi", ST);
c("studio.add.options", "studio", "A", P(".ds-linkf button.alt"), "Sign-in and refresh options|link options", "உள்நுழைவு மற்றும் புதுப்பிப்பு விருப்பங்கள்", "sign in refresh options|link options", ST);
c("studio.add.connect", "studio", "A", P(".ds-connect-cta"), "Connect with sign-in or schedule|connect a source", "உள்நுழைவு அல்லது அட்டவணையுடன் இணை|மூலத்தை இணை", "source connect pannu|connect with sign in", ST);
c("studio.add.sample", "studio", NEVER, N("adds a dataset"), "Add the sample|add a sample dataset", "மாதிரியைச் சேர்", "sample add pannu", ST);
c("studio.list.board", "studio", "A", P(".ds-top-tabs [role=tab]:nth-of-type(1)"), "My dashboards|open the dashboards|dashboards tab", "என் டாஷ்போர்டுகள்|டாஷ்போர்டுகளைத் திற", "en dashboards|dashboards open pannu", ST);
c("studio.list.datasets", "studio", "A", P(".ds-top-tabs [role=tab]:nth-of-type(2)"), "My datasets|datasets tab|show the datasets", "என் தரவுத்தொகுப்புகள்", "en datasets|datasets kaattu", ST);
c("studio.list.connectors", "studio", "A", P(".ds-top-tabs [role=tab]:nth-of-type(3)"), "Live Connectors|live connectors list", "நேரலை இணைப்பிகள்", "live connectors", ST);
c("ds.refetch", "dataset", NEVER, N("fetches the link again into the dataset"), "Fetch the link again|refetch", "இணைப்பை மீண்டும் எடு", "link thirumba edu", ST);
c("ds.download.csv", "dataset", "A", P("a.ds-icon[href*=\"export=csv\"]"), "Download the cleaned data|download CSV", "சுத்தமான தரவைப் பதிவிறக்கு|சிஎஸ்வி பதிவிறக்கு", "clean data download pannu|csv download", ST);
c("ds.download.xlsx", "dataset", "A", P("a.ds-icon[href*=\"export=xlsx\"]"), "Download as Excel|Excel", "எக்செல் ஆகப் பதிவிறக்கு|எக்செல்", "excel ah download pannu|excel", ST);
c("ds.brief.pdf.en", "dataset", "A", P("a.ds-icon[href*=\"lang=en\"]"), "Dataset brief in English|English brief PDF", "ஆங்கிலத்தில் தரவுச் சுருக்கம்", "english brief pdf", ST);
c("ds.brief.pdf.ta", "dataset", "A", P("a.ds-icon[href*=\"lang=ta\"]"), "Dataset brief in Tamil|Tamil brief PDF", "தரவுச் சுருக்கம் தமிழில்|தமிழ் சுருக்கம்", "tamil brief pdf", ST);
c("ds.delete", "dataset", NEVER, N("deletes a dataset"), "Delete this dataset", "இந்தத் தரவுத்தொகுப்பை நீக்கு", "indha dataset delete pannu", ST);
c("ds.delete.yes", "dataset", NEVER, N("deletes a dataset"), "Yes delete it", "ஆம் நீக்கு", "aama delete pannu", ST);
c("ds.delete.no", "dataset", "A", P(".ds-confirm button:nth-of-type(2)"), "No, keep the dataset|don't delete the dataset", "வேண்டாம், தரவுத்தொகுப்பை வை", "venaam dataset irukkattum", ST);
const DST: [string, string, string, string][] = [["ds.tab.dash", "Insights", "நுண்ணறிவுகள்", "insights"], ["ds.tab.alerts", "Alerts", "எச்சரிக்கைகள்", "alerts"],
  ["ds.tab.detective", "Data Detective", "தரவுத் துப்பறிவாளர்", "data detective"], ["ds.tab.mapping", "AI reading", "AI வாசிப்பு", "ai reading"],
  ["ds.tab.rows", "Rows", "வரிசைகள்", "rows"], ["ds.tab.card", "Data card", "தரவு அட்டை", "data card"]];
DST.forEach(([id, en, ta, tl], i) => c(id, "dataset", "A", P(`.ds-tabs [role=tab]:nth-of-type(${i + 1})`), `${en}|${en} tab`, `${ta}|${ta} டேப்`, `${tl}|${tl} tab`, ST));
c("ds.enrich.compareRefresh", "dataset", "A", P("button.ds-ghost::compare with the last refresh"), "Compare with the last refresh|last refresh", "கடைசிப் புதுப்பிப்புடன் ஒப்பிடு", "last refresh oda compare pannu", ST);
c("ds.enrich.compareIncidents", "dataset", "A", P("button.ds-ghost::compare with district incidents"), "Compare with district incidents|district incidents link", "மாவட்டச் சம்பவங்களுடன் ஒப்பிடு", "district incidents oda compare pannu", ST);
c("ds.enrich.findMore", "dataset", NEVER, N("reads more from the site into a dataset"), "Find more on this site", "இந்தத் தளத்தில் மேலும் தேடு", "indha site la innum thedu", ST);
c("ds.enrich.compareWith", "dataset", "A", P("button.ds-ghost::compared with"), "What should this be compared with|compared with what", "இதை எதனுடன் ஒப்பிட வேண்டும்", "idha edhoda compare pannanum", ST);
c("ds.focus.remove", "dataset", "A", P(".ds-focus em button"), "Remove the focus|remove that focus chip", "கவனக் குறியை நீக்கு", "focus chip remove pannu", ST);
c("ds.focus.clearAll", "dataset", "A", P(".ds-focus > button"), "Clear all focus|clear the focus", "எல்லா கவனத்தையும் அழி", "focus ellam clear pannu", ST);
c("ds.brief.reanalyse", "dataset", NEVER, N("runs the analysis again"), "Re-analyse|analyse again", "மீண்டும் பகுப்பாய்வு செய்", "thirumba analyse pannu", ST);
c("ds.brief.copyQuestions", "dataset", "A", P(".ds-brief-r header button"), "Copy the questions|copy the department questions", "கேள்விகளை நகலெடு", "questions copy pannu", ST);
c("ds.map.tools", "dataset", "A", P(".ds-map-tools button:nth-of-type(1)"), "Zoom into the dataset map|dataset map zoom in", "தரவு வரைபடத்தைப் பெரிதாக்கு", "dataset map zoom in", ST);
c("ds.map.tools:out", "dataset", "A", P(".ds-map-tools button:nth-of-type(2)"), "Zoom out of the dataset map|dataset map zoom out", "தரவு வரைபடத்தைச் சிறிதாக்கு", "dataset map zoom out", ST);
c("ds.map.tools:fit", "dataset", "A", P(".ds-map-tools button:nth-of-type(3)"), "Whole district on the dataset map|dataset map whole district", "தரவு வரைபடத்தில் முழு மாவட்டம்", "dataset map full district", ST);
c("ds.spot.close", "dataset", "A", P(".ds-spot .ds-ghost"), "Close the large chart|close open large", "பெரிய வரைபடத்தை மூடு", "large chart close pannu", ST);
// the large chart's pin is a toggle ("Add to dashboard" / "On the dashboard"): only its unpinned state adds; "Add to this dashboard" is a .ds-btn
// (v10 review 2, finding 31: a yes unpinned a chart already on the dashboard, and the second was never found)
c("ds.spot.toDashboard", "dataset", "B", P(".ds-spot .ds-ghost::add to dashboard"), "Add the large chart to the dashboard|large chart to dashboard", "பெரிய வரைபடத்தை டாஷ்போர்டில் சேர்", "large chart dashboard la podu", ST);
c("ds.spot.addHere", "dataset", "B", P(".ds-spot .ds-btn::add to this page"), "Add to this page|keep it with the charts", "இந்தப் பக்கத்தில் சேர்", "indha page la podu", ST);
c("drill.back", "drill", "A", P(".ds-drill-h > .ds-icon:first-child"), "Back in the details|details back", "விவரங்களில் பின்னால்", "details la back", ST);
c("drill.close", "drill", "A", P(".ds-drill-h > .ds-icon:last-child"), "Close the details|close details", "விவரங்களை மூடு", "details close pannu", ST);
c("drill.focus", "drill", "A", P(".ds-drill-acts .ds-btn"), "Focus the dashboard on this|focus on this", "டாஷ்போர்டை இதில் கவனி", "dashboard idhula focus pannu", ST);
c("drill.ask", "drill", "A", P(".ds-drill-acts button:nth-of-type(2)"), "Ask the AI|ask AI about this", "AI-யிடம் கேள்", "ai kitta kelu", ST);
c("drill.note", "drill", "C", P(".ds-drill-acts button:nth-of-type(3)"), "Draft a note to the department|draft a note", "துறைக்குக் குறிப்பு வரைவு செய்", "department ku note draft pannu", ST);
c("drill.download", "drill", "A", P(".ds-drill-acts a"), "Download these rows|download the details", "இந்த வரிசைகளைப் பதிவிறக்கு", "indha rows download pannu", ST);
c("drill.pin", "drill", "B", P(".ds-drill-acts button:nth-of-type(4)"), "Add the details to the dashboard|details to dashboard", "விவரங்களை டாஷ்போர்டில் சேர்", "details dashboard la podu", ST);
c("drill.note.copy", "drill", "A", P(".ds-drill .ds-chip-b::copy"), "Copy the note|copy the draft note", "குறிப்பை நகலெடு", "note copy pannu", ST);
c("drill.filter", "drill", "A", P(".ds-drill .ds-search input", { input: "text" }), "Filter these records|filter the details", "இந்தப் பதிவுகளை வடிகட்டு", "indha records filter pannu", ST);
c("ds.alert.input", "dataset", "A", P(".ds-alert-f input", { input: "text" }), "Alert box|tell me when box", "எச்சரிக்கைப் பெட்டி", "alert box", ST);
c("ds.alert.add", "dataset", NEVER, N("keeps an alert on the server"), "Add the alert", "எச்சரிக்கையைச் சேர்", "alert add pannu", ST);
c("ds.alert.remove", "dataset", NEVER, N("removes an alert"), "Remove the alert", "எச்சரிக்கையை நீக்கு", "alert remove pannu", ST);
c("ds.detective.download", "dataset", "A", P("a.ds-btn.wide"), "Download cleaned data from the detective|detective download", "துப்பறிவாளர் சுத்தத் தரவைப் பதிவிறக்கு", "detective clean data download", ST);
c("ds.mapping.undo", "dataset", "A", P("button.ds-ghost::undo"), "Undo the meanings|undo the AI reading changes", "பொருள் மாற்றங்களைத் திரும்பப் பெறு", "meanings undo pannu", ST);
c("ds.mapping.rebuild", "dataset", NEVER, N("rebuilds the dataset"), "Rebuild with these meanings", "இந்தப் பொருள்களுடன் மீண்டும் உருவாக்கு", "indha meanings oda rebuild pannu", ST);
c("ds.card.lang", "dataset", "A", P(".ds-card-top button[lang=\"ta\"]"), "Data card in Tamil|Tamil data card", "தரவு அட்டை தமிழில்", "data card tamil la", ST);
c("ds.card.lang:en", "dataset", "A", P(".ds-card-top button:not([lang])"), "Data card in English|English data card", "தரவு அட்டை ஆங்கிலத்தில்", "data card english la", ST);
c("ds.card.familyYes", "dataset", NEVER, N("sets what kind of data it is"), "Yes that's right", "ஆம் சரி", "aama correct", ST);
c("ds.card.familyChange", "dataset", "A", P(".ds-card-s .ds-lnk"), "Change the kind of data|change family", "தரவு வகையை மாற்று", "data vagai maathu", ST);
c("ds.card.familyPick", "dataset", NEVER, N("sets what kind of data it is"), "Pick the kind of data", "தரவு வகையைத் தேர்ந்தெடு", "data vagai pick pannu", ST);
c("src.tables", "dataset", "A", P(".ds-src-chip:nth-of-type(1)"), "What is used|source tables", "பயன்படுத்தியவை|மூல அட்டவணைகள்", "use pannadhu|source tables", ST);
c("src.useThis", "dataset", NEVER, N("re-reads the dataset from another table"), "Use this table", "இந்த அட்டவணையைப் பயன்படுத்து", "indha table use pannu", ST);
c("src.sync", "dataset", "A", P(".ds-src-chip:nth-of-type(2)"), "Fetched|refresh status|last fetched", "எடுத்த நேரம்|புதுப்பிப்பு நிலை", "fetch status|last fetch", ST);
c("src.schedule", "dataset", NEVER, N("sets a refresh schedule"), "Refresh hourly|refresh daily", "மணிக்கு ஒருமுறை புதுப்பி", "hourly refresh", ST);
c("src.fetchNow", "dataset", NEVER, N("fetches the source now"), "Fetch now", "இப்போது எடு", "ippo fetch pannu", ST);
c("src.keepUpdated", "dataset", NEVER, N("makes a Live Connector"), "Keep this updated", "இதைப் புதுப்பித்து வை", "idha update aagi vai", ST);
c("connect.close", "connect", "A", P(".ds-connect .ds-icon"), "Close connect|cancel connecting", "இணைப்பதை மூடு|ரத்து", "connect close pannu|cancel", ST);
c("connect.url", "connect", "A", P(".ds-connect .ds-input input", { input: "text" }), "Connect link box|the link to connect", "இணைக்கும் இணைப்புப் பெட்டி", "connect link box", ST);
c("connect.name", "connect", "A", P(".ds-connect .ds-input input[maxlength=\"100\"]", { input: "text" }), "Connect name box|name of the source", "மூலத்தின் பெயர்", "source name box", ST);
c("connect.mode", "connect", NEVER, N("chooses how to sign in to a source"), "Sign-in mode|public or API key", "உள்நுழைவு முறை", "sign in mode", ST);
c("connect.secret", "connect", NEVER, N("an API key or password: never typed by Jarvis"), "API key box|password box of the source", "ஏபிஐ கீ பெட்டி", "api key box", ST);
c("connect.username", "connect", NEVER, N("sign-in details are the Collector's own"), "User name box|key name", "பயனர் பெயர் பெட்டி", "username box", ST);
c("connect.every", "connect", NEVER, N("sets a refresh schedule"), "Keep it up to date every hour|every six hours", "ஒவ்வொரு மணிநேரமும் புதுப்பி", "ovvoru mani neramum update", ST);
c("connect.authorised", "connect", NEVER, N("a declaration only the Collector makes"), "I am authorised|authorised to use this account", "இந்தக் கணக்கைப் பயன்படுத்த எனக்கு அனுமதி உண்டு", "enakku authorisation irukku", ST);
c("connect.submit", "connect", NEVER, N("connects a source"), "Connect the source|connect now", "மூலத்தை இப்போது இணை", "ippo connect pannu", ST);
c("run.hide", "run", "A", P(".ds-run-h .ds-ghost"), "Hide the run|close the run", "இயக்கத்தை மறை|மறை", "run hide pannu|maraicchu", ST);
c("run.useAnyway", "run", NEVER, N("keeps a dataset that failed its checks"), "Use anyway", "எப்படியும் பயன்படுத்து", "eppadiyum use pannu", ST);
c("run.discard", "run", NEVER, N("discards a run"), "Discard the run", "இயக்கத்தை நீக்கு", "run discard pannu", ST);
c("run.tryAgain", "run", NEVER, N("runs the agents again"), "Try the run again", "இயக்கத்தை மீண்டும் முயல்", "run thirumba try pannu", ST);
c("outcome.action", "run", NEVER, N("acts on a run's outcome"), "Do the outcome action|outcome action", "முடிவுச் செயல்", "outcome action", ST);
c("outcome.lang", "run", "A", P(".ds-out-h button[aria-pressed][lang=\"ta\"]"), "Outcome in Tamil|Tamil outcome", "முடிவு தமிழில்", "outcome tamil la", ST);
c("outcome.lang:en", "run", "A", P(".ds-out-h button[aria-pressed]:not([lang])"), "Outcome in English|English outcome", "முடிவு ஆங்கிலத்தில்", "outcome english la", ST);
c("picker.search", "run", "A", P(".ds-pick-tools .ds-input input", { input: "text" }), "Search the datasets|dataset search", "தரவுத்தொகுப்புகளைத் தேடு", "datasets thedu", ST);
c("picker.sortType", "run", "A", P(".ds-pick-tools select:nth-of-type(1)", { input: "select" }), "Sort the datasets|dataset sort", "தரவுத்தொகுப்புகளை வரிசைப்படுத்து", "datasets sort pannu", ST);
c("picker.selectRecommended", "run", "A", P(".ds-pick-tools .ds-ghost"), "Select recommended|recommended datasets", "பரிந்துரைத்தவற்றைத் தேர்ந்தெடு", "recommended select pannu", ST);
c("picker.series", "run", NEVER, N("adds datasets"), "Latest only|combine all into one", "சமீபத்தியது மட்டும்", "latest mattum", ST);
c("picker.add", "run", NEVER, N("adds datasets"), "Add the datasets|combine into one", "தரவுத்தொகுப்புகளைச் சேர்", "datasets add pannu", ST);
c("conn.retry", "connectors", "A", P(".ds-out-why[role=alert] .ds-lnk"), "Retry the connectors|retry", "இணைப்பிகளை மீண்டும் முயல்", "connectors retry pannu", ST);
c("conn.selfHeal", "connectors", NEVER, N("approves a connector's columns"), "Map to the old columns|keep the new columns", "பழைய நெடுவரிசைகளுடன் இணை", "pazhaya columns oda map pannu", ST);
c("conn.quarantine", "connectors", NEVER, N("accepts or rejects held data"), "Approve the held data|reject the held data", "நிறுத்திய தரவை ஏற்று", "held data approve pannu", ST);
c("conn.run", "connectors", NEVER, N("runs a connector"), "Run the connector now", "இணைப்பியை இப்போது இயக்கு", "connector ippo run pannu", ST);
c("conn.pauseResume", "connectors", NEVER, N("pauses or resumes a connector"), "Pause the connector|resume the connector", "இணைப்பியை நிறுத்து", "connector pause pannu", ST);
c("conn.backfill", "connectors", NEVER, N("fills in past days"), "Fill in past days", "முந்தைய நாட்களை நிரப்பு", "munnadi naal fill pannu", ST);
c("conn.form.fields", "connectors", NEVER, N("a connector's schedule"), "Connector schedule fields", "இணைப்பி அட்டவணை", "connector schedule fields", ST);
c("conn.form.save", "connectors", NEVER, N("saves a connector's schedule"), "Save the connector schedule", "இணைப்பி அட்டவணையைச் சேமி", "connector schedule save pannu", ST);
c("studio.board.unpin", "studio", NEVER, N("takes a chart off the dashboard"), "Unpin the chart", "வரைபடத்தைப் பின் நீக்கு", "chart unpin pannu", ST);

// ------------------------------------------------------------------------------------------------------------------ Ask District IQ --
const CH = W("assistant");
c("chat.close", "chat", "A", S(CLOSE), "Close the chat|close District IQ|close the chatbot", "சாட்டை மூடு|டிஸ்ட்ரிக்ட் IQ-ஐ மூடு", "chat close pannu|chatbot close pannu", CH);
c("chat.tab.chat", "chat", "A", P(".aq-tabs [role=tab]:nth-of-type(1)"), "Ask District IQ tab|chat tab", "டிஸ்ட்ரிக்ட் IQ-விடம் கேள் டேப்|சாட் டேப்", "chat tab|district iq tab", CH);
c("chat.tab.jarvis", "chat", "A", P(".aq-tabs [role=tab]:nth-of-type(2)"), "Asked of Jarvis|Jarvis tab|what I asked Jarvis", "ஜார்விஸிடம் கேட்டவை|ஜார்விஸ் டேப்", "jarvis kitta kettadhu|jarvis tab", CH);
c("chat.language", "chat", "A", P(".aq select", { input: "select" }), "Chat language|reply language|language of the chat", "சாட் மொழி|பதில் மொழி", "chat language|reply language", CH);
c("chat.insights.toggle", "chat", "A", P(".aq [data-voice=\"chat.insights\"]"), "Insights|today's insights|chat insights", "நுண்ணறிவுகள்|இன்றைய நுண்ணறிவுகள்", "insights|innaikku insights", CH);
c("chat.history", "chat", "A", P(".aq [data-voice=\"chat.history\"]"), "Chat history|past conversations|history", "சாட் வரலாறு|பழைய உரையாடல்கள்", "chat history|pazhaya chats", CH);
c("chat.newChat", "chat", "A", P(".aq [data-voice=\"chat.newChat\"]"), "New chat|start a new chat", "புதிய சாட்|புதிய உரையாடல்", "pudhu chat|new chat", CH);
c("chat.maximize", "chat", "A", P(".aq [data-voice=\"chat.maximize\"]"), "Maximize the chat|restore the chat|bigger chat", "சாட்டைப் பெரிதாக்கு", "chat perusa pannu|chat maximize", CH);
c("chat.searchChats", "chat", "A", P(".aq-find input", { input: "text" }), "Search chats|search the conversations", "சாட்களில் தேடு", "chats la thedu", CH);
c("chat.editQuestion", "chat", "A", P(".aq-edit"), "Edit question|edit my question", "கேள்வியைத் திருத்து", "question edit pannu", CH);
c("chat.showWithJarvis", "chat", "A", P("button.aq-stage"), "Show on screen with Jarvis|show it on screen", "ஜார்விஸ் திரையில் காட்டு", "jarvis screen la kaattu", CH);
c("chat.input", "chat", "A", P(".aq-f textarea", { input: "text" }), "Ask a question box|chat box|question box", "கேள்விப் பெட்டி|சாட் பெட்டி", "question box|chat box", CH);
c("chat.send", "chat", "A", P(".aq-send:not(.stop)"), "Send the question|send it to District IQ|ask it", "கேள்வியை அனுப்பு|டிஸ்ட்ரிக்ட் IQ-க்கு அனுப்பு", "question anuppu|district iq ku anuppu", CH);
c("chat.stop", "chat", "A", P(".aq-send.stop"), "Stop the chat answer|stop answering", "சாட் பதிலை நிறுத்து", "chat answer stop pannu", CH);
c("chat.pinned.unpin", "chat", NEVER, N("removes a pinned question"), "Unpin the question", "கேள்வியைப் பின் நீக்கு", "question unpin pannu", CH);
c("answer.feedback", "answer", NEVER, N("records feedback on the server"), "Helpful|not helpful", "உதவியது|உதவவில்லை", "helpful|helpful illa", CH);
c("answer.pin", "answer", NEVER, N("pins an answer"), "Pin the answer", "பதிலைப் பின் செய்", "answer pin pannu", CH);
c("jlog.clear", "chat", NEVER, N("clears the list of what was asked of Jarvis"), "Clear this list|clear the Jarvis list", "பதிவை அழி", "list clear pannu", CH);

// ---------------------------------------------------------------------------------------------------------------- Jarvis's own UI --
c("hud.stopTalking", "hud", "A", S({ a: "stop" }), "Stop talking|stop speaking|be quiet", "பேச்சை நிறுத்து|பேசாதே", "pesradha niruthu|stop talking");
c("hud.mute", "hud", "A", P(".hud-btn[aria-pressed]", { own: true }), "Mute|mute the microphone|unmute|turn the microphone back on", "மைக்கை மூடு|மைக்கைத் திற", "mic mute pannu|mic on pannu");
c("hud.type", "hud", "A", P(".hud-btn[aria-expanded]:not(.hud-qs):not(.hud-pill-b)", { own: true }), "Type instead|type|keyboard", "தட்டச்சு|தட்டச்சு செய்", "type pannu|keyboard");
c("hud.questions", "hud", "A", P(".hud-qs", { own: true }), "Questions|my questions in Jarvis", "கேள்விகள்|என் கேள்விகள்", "questions|en questions");
c("hud.close", "hud", "A", S({ a: "off" }), "Close Jarvis|close Jarvis and go back", "ஜார்விஸை மூடு|ஜார்விஸை மூடி திரும்பு", "jarvis close pannu|jarvis-a mooduu");
c("hud.firstUse", "hud", "A", P("button::understood, open it|புரிந்தது, திற", { own: true }), "Understood, open it|understood", "புரிந்தது, திற|புரிந்தது", "purinjudhu open pannu|understood");
c("hud.answer.card", "hud", "A", P(".hud-pill-b", { own: true }), "Show the answer|show the answer card", "பதிலைக் காட்டு|பதில் அட்டை", "answer kaattu|answer card");
c("hud.answer.card:fold", "hud", "A", P(".hud-x::fold this answer away|இந்தப் பதிலைச் சிறிதாக்கு", { own: true }), "Fold this answer away|fold the answer", "இந்தப் பதிலைச் சிறிதாக்கு|பதிலைச் சுருக்கு", "answer fold pannu");
c("hud.answer.card:close", "hud", "A", P(".hud-x::close this answer|இந்தப் பதிலை மூடு", { own: true }), "Close this answer|close the answer", "இந்தப் பதிலை மூடு|பதிலை மூடு", "answer close pannu");
c("hud.answer.openFull", "hud", "A", P(".hud-ans-acts button", { own: true }), "Open full screen|show the answer full screen", "முழுத் திரையில் பார்|முழுத் திரை", "full screen la paaru|full screen open");
c("hud.evidence", "hud", "A", P(".hud-ev", { own: true }), "Show the evidence|evidence|the rows this answer rests on", "ஆதாரத்தைக் காட்டு|இந்தப் பதிலின் தரவைக் காட்டு", "evidence kaattu|proof kaattu");
c("hud.queue", "hud", "A", P("[data-testid=\"queue\"]", { own: true }), "Things you noticed|what's waiting for me|waiting things", "நீங்கள் கவனித்தவை|காத்திருப்பவை", "neenga gavanichadhu|waiting things");
c("card.longTurn.stop", "cards", "A", S({ a: "stop" }), "Stop the long answer|stop this", "நீண்ட பதிலை நிறுத்து", "long answer stop pannu");
c("card.brief", "cards", "A", P("[data-testid=\"brief\"] .row button:nth-of-type(1)", { own: true }), "Fold the brief|fold|show all of the brief", "சுருக்கத்தைச் சுருக்கு|சுருக்கு|முழுதும் காட்டு", "brief fold pannu|fold");
c("card.brief:close", "cards", "A", P("[data-testid=\"brief\"] .row button:nth-of-type(2)", { own: true }), "Close the brief|close the brief card", "சுருக்கத்தை மூடு|சுருக்க அட்டையை மூடு", "brief close pannu");
c("card.interjection", "cards", "A", P("[data-testid=\"interjection\"] .row button:nth-of-type(1)", { own: true }), "Tell me|tell me what you noticed", "சொல்லுங்கள்|என்ன கவனித்தீர்கள் என்று சொல்லுங்கள்", "sollunga|enna gavanicheenga sollunga");
c("card.interjection:later", "cards", "A", P("[data-testid=\"interjection\"] .row button:nth-of-type(2)", { own: true }), "Later|tell me later|not now", "பிறகு|பிறகு சொல்லுங்கள்", "appuram|appuram sollunga");
c("card.interjection:notabout", "cards", "B", P("[data-testid=\"interjection\"] .row button:nth-of-type(3)", { own: true }), "Not about this|don't tell me about this", "இதைப் பற்றி வேண்டாம்|இதைப் பற்றிச் சொல்ல வேண்டாம்", "idhu pathi venaam|idha pathi sollaadheenga");
c("tray.approve", "tray", NEVER, N("sends the drafts in the tray"), "Approve and send|send the drafts|approve the tray", "ஒப்புதல் அளித்து அனுப்பு|வரைவுகளை அனுப்பு", "approve panni anuppu|drafts anuppu");
c("tray.discard", "tray", NEVER, N("discards the drafts: the Collector's own tap"), "Discard the drafts|discard the tray", "வரைவுகளை நீக்கு|தட்டை நீக்கு", "drafts discard pannu|tray discard");
c("panel.close", "jpanel", "A", P(".th-panel button[aria-label=\"Close\"]", { own: true }), "Close the side panel|close Jarvis's panel", "பக்கப் பலகையை மூடு", "side panel close pannu");
c("memory.forgetAll", "jpanel", "B", S({ a: "forget", all: true }), "Forget everything|forget all my notes", "எல்லாம் மற|எல்லா குறிப்புகளையும் மற", "ellaam marandhudu|ella notes-um marandhudu");
c("jq.seeAll", "jq", "A", P(".jq-all", { own: true }), "See all earlier questions|all my questions", "எல்லா முந்தைய கேள்விகளும்|அனைத்தும்", "ella questions-um|all questions");
// Jarvis's screen left for the dashboard by its own button (Stage.tsx .st-home: the Stage closed), said loosely with the screen open ("podhum indha
// screen, dashboard-ku thirumbi polaam", "back to the dashboard"); "close", "back" and "go back" stay the Stage's own commands (stagelocal.ts) (v10
// dev2, dB-control-8: the rules moved the page under the open screen)
c("stage.backToDashboard", "stage", "A", P(".st-root .st-home", { own: true }), "Back to dashboard|back to the dashboard|return to the dashboard",
  "டாஷ்போர்டுக்குத் திரும்பு|முகப்புக்குத் திரும்பு", "dashboard thirumbu|dashboard thirumbi|dashboard thirumba|back to dashboard", { stage: true });

export const CONTROLS10: Control10[] = list;

/** the inventory's controls with no voice path of their own, on purpose: why */
const ROW = "a row of data: say its position ('open the second one'), or 'show numbers' and its number";
const LINK = "a link out of the console (an outside page, a phone number, a file): 'show numbers' and its number, the Collector's own tap";
const CANVAS = "a mark on a map or chart canvas: name the place or the case instead ('show Adyar', 'open the first one')";
const SAID = "answered by its own words before any lane (yes, no, start, stop, the choice's number)";
const STAGE = "Jarvis's Stage: its own spoken commands (stagelocal.ts: back, next, show all, read, pin, export, save, view as a table, map or chart, open N, draft, show on the map)";
export const SKIP10: Record<string, string> = {
  "bell.item.open": ROW, "palette.action.goTo": "the page tabs said by name ('go to Trends')",
  "palette.hit.zone": ROW, "palette.hit.department": ROW, "palette.hit.incident": ROW, "palette.hit.moreMatching": ROW, "palette.hit.complaintNumber": ROW,
  "palette.hit.news": ROW, "palette.hit.dataSource": ROW, "palette.hit.dataset": ROW, "palette.ask.map": "typed words: ask the map directly", "palette.ask.chat": "typed words: ask District IQ directly",
  "band.alerts.newsLink": LINK, "toast.dismiss": "a swipe: a toast goes by itself", "kbd.pageUpDown": "a key: say the page ('go to Trends')",
  "kbd.jarvisKeys": "Jarvis's keys: say stop, mute or undo", "map.ward.click": CANVAS, "map.pin.incident": CANVAS, "map.pin.added": CANVAS, "map.pin.station": CANVAS,
  "map.panZoomGestures": "drag, wheel and pinch: say zoom in, zoom out or whole district", "att.row.open": ROW, "att.row.act": "a row's own: 'draft action for the second one'",
  "task.row.expand": ROW, "task.ask": "a task row's own: 'draft action for the second one'", "task.photo": LINK, "news.story.open": ROW, "news.differ.row": ROW,
  "news.nextDoor.row": ROW, "news.added.row": ROW, "jarvisPins.chip": "a pinned screen: Jarvis opens it by its name ('open my pinned …')",
  "bb.keypoint.open": ROW, "bb.critical.open": ROW, "bb.dept.toggle": ROW, "bb.dept.death": ROW, "bb.dept.item": ROW, "bb.story.open": ROW, "bb.newsOnly.row": ROW,
  "bp.decision.open": ROW, "bp.rise.open": ROW, "bp.added.item": ROW, "bp.stories.thread": ROW, "bp.newsOnly.row": ROW, "bp.followups.dept": ROW, "bp.followups.item": ROW,
  "bp.followups.filter": "a department line's own: 'filter to <department>'", "trends.rising.row": ROW, "trends.taluk.row": ROW, "trends.rise.open": ROW,
  "trends.hotspot.open": ROW, "trends.review.row": ROW, "env.lake.sourceLink": LINK, "markets.market.open": ROW,
  "list.row.open": ROW, "zones.row.filter": "a zone's row: 'filter to zone 7'", "zones.row.noZone": ROW, "depts.row.filter": "a department's row: 'filter to <department>'",
  "contacts.gccLink": LINK, "newsAll.card": ROW, "workspace.version.open": "a saved version: 'open the workspace <name>'", "workspace.rename": "a workspace's own: 'show numbers' and its number",
  "added.card": ROW, "item.openSource": LINK, "stories.list.pick": ROW, "stories.link": LINK, "pattern.incident": ROW, "gaps.row": ROW, "review.row.open": ROW,
  "review.row.map": ROW, "sources.items": ROW, "sources.link": LINK, "askmap.panel.drag": "a drag of the panel's header: say dock the map panel", "nextdoor.row": ROW, "nearby.reportLink": LINK, "inc.reportLink": LINK, "inc.photo": LINK, "inc.gccLink": LINK,
  "petition.media.open": "an attachment: 'show numbers' and its number", "petition.page.open": "a petition page: 'show numbers' and its number",
  "nv.report.select": ROW, "nv.readAt": LINK, "studio.add.file": "the OS file picker: Jarvis never chooses a file", "studio.list.running": ROW, "studio.list.dataset": ROW,
  "ds.rename": "renaming a dataset is the Collector's typing", "ds.kpi.open": ROW, "ds.insight.records": ROW, "ds.link.incident": ROW, "ds.panel.asTable": ROW,
  "ds.panel.toDashboard": ROW, "ds.panel.openLarge": ROW, "ds.panel.remove": ROW, "ds.panel.mark": CANVAS, "drill.incident": ROW, "drill.breakdown.mark": CANVAS,
  "ds.mapping.meaning": ROW, "ds.rows.filter": "the rows' filter box: tap it, then 'type …'", "ds.rows.link": LINK, "picker.choose": ROW, "picker.preview": ROW,
  "conn.schedule": ROW, "conn.history": ROW, "conn.open": ROW, "studio.board.dataset": ROW, "chat.example": ROW, "chat.insight.open": ROW, "chat.pinned.ask": ROW,
  "chat.mic": "the chatbot's own microphone: Jarvis is already listening, say the question to Jarvis", "answer.followUp": ROW, "answer.action": ROW,
  "answer.download": LINK, "answer.tools": ROW, "answer.sources": ROW, "figure.controls": ROW, "response.controls": ROW, "jlog.openScreen": ROW, "jlog.cardAction": ROW,
  "jlog.studio": ROW, "hud.typeInput": "the typing box: typed in, not said", "card.nextStep": SAID, "card.askOnce.choice": SAID, "card.levelB": SAID, "card.mission": SAID,
  "memory.forgetItem": "a note's own: 'forget that'", "memory.unfollow": "a followed item's own: 'stop following …'", "memory.undoAlertChoice": ROW, "help.example": ROW,
  "jq.question": ROW, "stage.previous": STAGE, "stage.suggestion": STAGE, "stage.showAll": STAGE, "stage.readAloud": STAGE, "stage.pin": STAGE,
  "stage.export": STAGE, "stage.save": STAGE, "stage.filters": STAGE, "stage.block.view": STAGE, "stage.case.open": STAGE, "stage.case.takeAction": STAGE,
  "stage.case.draft": STAGE, "stage.case.showOnMap": STAGE, "stage.case.openInConsole": STAGE, "stage.other": STAGE
};
