/**
 * What Ask District IQ's rules cannot do, said plainly (QA pass 4, RC-44). A question the rules had no lane for used to end in the default
 * incident list or KPI block, an answer about something else: "save this workspace" got counts, "list every source" got headline KPIs, a
 * forecast got a past count, a letter to draft got a list of incidents. This is the closed list of what is not done in chat, each with where
 * to do it or what to ask instead; a test sends every kind and requires no figures in the reply. Pure: no database, no model.
 *
 * A share ("what percentage of complaints are resolved") is not on this list: it is answered (shareAsked, fastpath.ts).
 */
import type { Lang } from "@/lib/assistant/lang";

export type NotDone = "workspace" | "sources" | "forecast" | "letter" | "deptComplaints" | "order";
const L = (en: string, ta: string, tanglish: string): Record<Lang, string> => ({ en, ta, tanglish });

const SAY: Record<Exclude<NotDone, "deptComplaints" | "order">, Record<Lang, string>> & { deptComplaints?: Record<Lang, string>; order?: Record<Lang, string> } = {
  workspace: L("Chat cannot save or reopen a workspace, so nothing was saved. On the console, open the top menu, choose Workspaces, and use Save or Open there.",
    "அரட்டையில் பணியிடத்தைச் சேமிக்கவோ மீண்டும் திறக்கவோ முடியாது, எதுவும் சேமிக்கப்படவில்லை. கன்சோலின் மேல் மெனுவில் Workspaces என்பதைத் தேர்ந்தெடுத்து அங்கே சேமிக்கவும் அல்லது திறக்கவும்.",
    "Chat-la workspace-a save panna illa reopen panna mudiyaadhu, adhanaala edhuvum save aagala. Console-oda top menu-la Workspaces select pannitu, angaye Save illa Open pannunga."),
  sources: L("Chat does not list every record behind a briefing. Each answer card has a Sources section with the tables and checks behind its figures, and one incident opens with its own records.",
    "ஒரு சுருக்க அறிக்கையின் பின்னால் உள்ள எல்லாப் பதிவுகளையும் அரட்டை பட்டியலிடாது. ஒவ்வொரு பதில் அட்டையிலும் அதன் எண்களுக்குப் பின்னால் உள்ள அட்டவணைகளும் சரிபார்ப்புகளும் Sources பகுதியில் உள்ளன; ஒரு சம்பவத்தைத் திறந்தால் அதன் பதிவுகள் தெரியும்.",
    "Briefing-ku pinnaadi irukkira ella records-aiyum chat list pannaadhu. Ovvoru answer card-layum figures-ku pinnaadi irukkira tables, checks Sources section-la irukku; oru incident-a open pannaa adhoda records theriyum."),
  forecast: L("I cannot say what will happen: without the AI this answers only from what has been recorded, and it makes no estimate of the future. Ask for the recent trend instead, such as how this week compares with last week.",
    "என்ன நடக்கும் என்று என்னால் சொல்ல முடியாது: AI இல்லாமல் இது பதிவானவற்றிலிருந்து மட்டுமே பதில் தருகிறது, எதிர்காலத்தை மதிப்பிடாது. அதற்குப் பதிலாக சமீபத்திய போக்கைக் கேளுங்கள், உதாரணமாக இந்த வாரம் கடந்த வாரத்துடன் எப்படி ஒப்பிடுகிறது.",
    "Enna nadakkum-nu naan sollamudiyaadhu: AI illama idhu record aanadhula irundhu mattum dhaan answer pannum, future-a estimate pannaadhu. Adhukku badhila recent trend kelunga, udhaaranathukku indha week last week-oda eppadi irukku."),
  letter: L("I cannot draft letters or emails without the AI, so nothing was written. I can give the figures to put in one: ask for the incidents or counts for that place and period.",
    "AI இல்லாமல் என்னால் கடிதம் அல்லது மின்னஞ்சல் வரைய முடியாது, எதுவும் எழுதப்படவில்லை. அதில் வைக்க வேண்டிய எண்களைத் தர முடியும்: அந்த இடம், காலத்துக்கான சம்பவங்கள் அல்லது எண்ணிக்கையைக் கேளுங்கள்.",
    "AI illama letter illa email draft panna mudiyaadhu, adhanaala edhuvum ezhudhala. Adhula vekka vendiya figures tharalaam: andha place, period-ku incidents illa counts kelunga.")
};

SAY.deptComplaints = L("The department list counts incidents, not citizens' complaints, so I cannot split complaints by department without giving you figures about something else. Ask for incidents by department, or for the complaints of one department.",
  "துறைப் பட்டியல் சம்பவங்களை எண்ணுகிறது, குடிமக்களின் புகார்களை அல்ல; அதனால் புகார்களைத் துறை வாரியாகப் பிரித்துத் தர முடியாது. துறை வாரியாகச் சம்பவங்களை, அல்லது ஒரு துறையின் புகார்களைக் கேளுங்கள்.",
  "Department list incidents-a thaan ennudhu, citizens complaints-a illa; adhanaala complaints-a department-wise pirichu tharamudiyaadhu. Department-wise incidents-a, illa oru department-oda complaints-a kelunga.");

/** An order that changes or exports records (SKG1-30): chat only reads them, so nothing was done, and the sentence says where it is done. */
SAY.order = L("Chat only reads the records: it cannot close, reopen or export cases, so nothing was changed or exported. An officer closes or reopens a case on the officer console, and the top menu's Export report button gives the file.",
  "அரட்டை பதிவுகளை மட்டுமே படிக்கும்: வழக்குகளை மூடவோ மீண்டும் திறக்கவோ பதிவிறக்கவோ முடியாது, எதுவும் மாற்றப்படவில்லை, பதிவிறக்கப்படவில்லை. வழக்கை அலுவலர் தன் கன்சோலில் மூடுவார் அல்லது மீண்டும் திறப்பார்; கோப்பு வேண்டுமெனில் மேல் மெனுவில் உள்ள அறிக்கையைப் பதிவிறக்கு பொத்தானைப் பயன்படுத்துங்கள்.",
  "Chat records-a padikka mattum dhaan seiyum: case-a close, reopen illa export panna mudiyaadhu, adhanaala edhuvum maaralaa, export aagalaa. Case-a officer avanga console-la close illa reopen pannuvaanga; file vennumna top menu-la Export report button use pannunga.");
const ORDER_QUESTION = /^\s*(?:(?:how|what|which|who|when|why|where|is|are|were|was|did|does|do|has|have|evlo|enna|eppo)\b|எத்தனை|எந்த|என்ன|ஏன்|யார்)/i;
const ORDER_EN = /^\s*(?:(?:please|pls|kindly|can you|could you|would you)\s+)*(?:close|reopen|re-open|resolve|export|download|reassign|assign|escalate)\b.{0,60}\b(?:complaints?|cases?|incidents?|grievances?|tickets?|them|all|everything|excel|csv|pdf|xlsx?|spreadsheet)\b|\bexport\b.{0,50}\b(?:excel|csv|pdf|xlsx?|spreadsheet)\b/i;
const ORDER_TG = /\b(?:export|close|reopen|re-open|download|resolve)\b.{0,40}\b(?:pannu|pannunga|panni|pannidu|pannidunga|podu|seiyu)\b/i;
const ORDER_TA = /(?<![஀-௿])(?:ஏற்றுமதி|பதிவிறக்கம்?|பதிவிறக்கு|மூடு|மூடுங்கள்|மூடிவிடு|மீண்டும் திற|மீண்டும் திறக்க|தீர்த்துவிடு)(?![஀-௿])/u;
const FUTURE_MORE = /\bwill there\b|\b(?:in|over|for) the (?:coming|upcoming|next) (?:days?|weeks?|months?|quarters?|years?)\b|\b(?:coming|upcoming) (?:days?|weeks?|months?|quarters?|years?)\b|\boutlook\b|\bby next year\b|\b(?:expected|projected|estimated) (?:number|count|total|rise|increase|volume)\b|\b(?:future|forthcoming)\b|\b(?:edhirkaalam|ethirkaalam|kanippu|munkanippu|munnarivippu|varumaa)\b|\bnext (?:few )?(?:days|weeks|months)\b|எதிர்காலத்தில்|எதிர்காலம்|முன்கணிப்பு|முன்னறிவிப்பு|கணிப்பு|கணிக்க|அடுத்த (?:காலாண்டு|வருடம்|ஆண்டு|சில நாட்கள்)|வரும் (?:நாட்களில்|வாரங்களில்|மாதங்களில்|காலாண்டு|வருடம்|ஆண்டு)|\bevlo\b.{0,40}\bvarum\b/i;

const DEPT_SPLIT = /\b(by|per|each|across)\s+(the\s+)?(department|dept)s?\b|\b(department|dept)[- ]?wise\b|துறை(?:கள்)? ?வாரியா|thurai ?(vaariya|wise)/i;
const PAST_DEADLINE = /\b(overdue|past (the |their )?(deadline|due)|missed (the |their )?deadline|beyond (the )?deadline|late)\b|கெடு|காலக்கெடு|தாண்டிய|\bdeadline\b/i;
const SAVE =/\b(save|store|reopen|re-open|restore|bookmark)\b|சேமி|மீண்டும் திற|\bsave\s*(pannu|pannunga|pannu)\b/i;
const WORKSPACE = /\b(workspaces?|layouts?|saved views?|this view|this screen|this briefing|daily briefing|my briefing)\b|பணியிட/i;
const ALL_SOURCES = /\b(show|list|give|display|reveal|print)\b.{0,25}\b(every|all|each|full|complete)\b.{0,25}\b(sources?|records?|references?|rows?)\b.{0,70}\b(used|behind|for|to (create|build|make|write|produce)|in)\b/i;
const FUTURE = /\b(predict|predicts|predicted|forecast|forecasts|projection|projected|project(?:s)? how|expect(?:ed)? (?:to|how)|estimate how)\b|\bwill (?:be|get|have|see|receive|reach|rise|increase|go|come|need|drop|fall|stand)\b|\bgoing to (?:be|get|rise|increase|have)\b|\bnext (?:week|month|quarter|year|few days)\b|\btomorrow\b|\bby (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|next month|end of)\b|வரும் (?:வாரம்|மாதம்)|அடுத்த (?:வாரம்|மாதம்)|நாளை|\b(?:next|adutha|varum) (?:vaaram|varam|maasam|week|month)\b|\bnaalaiku\b/i;
const THINGS = /\b(complaints?|incidents?|cases?|grievances?|reports?|petitions?|accidents?|crimes?|requests?)\b|புகார்|சம்பவ|\bpugar\b/i;
const WEATHER = /\b(rain|rainfall|weather|cyclone|storm|imd|warning|alert|temperature|heat|flood warning|wind|aqi|air quality)\b|மழை|வானிலை|புயல்/i;
const WRITE = /\b(draft|write|compose|prepare|make|create|send)\b.{0,40}\b(letters?|e-?mails?|mails?|memos?|notices?|speech|press release|circular)\b|(கடிதம்|மின்னஞ்சல்).{0,25}(வரை|எழுது)|\b(letter|email|mail)\b.{0,25}\b(ezhudhu|ezhuthu|draft pannu|write pannu)\b/i;

const SOURCES_TA = /(எல்லா|அனைத்து|ஒவ்வொரு).{0,20}(ஆதார|மூல|பதிவு).{0,50}(காட்டு|பட்டியலிடு|காண்பி)/;
const SOURCES_TG = /\b(ella|ellam|ovvoru|full)\b.{0,25}\b(sources?|records?)\b.{0,60}\b(kaattu|kaatunga|kaamichu|list pannu|list)\b/i;

/** The kind of request chat does not do, or null. `rulesOnly`: no model reads the question (a forecast or a letter is then not done at all). */
export function notDone(message: string, rulesOnly: boolean): { kind: NotDone; say: Record<Lang, string> } | null {
  const t = message.trim();
  if (SAVE.test(t) && WORKSPACE.test(t)) return { kind: "workspace", say: SAY.workspace };
  if ((ALL_SOURCES.test(t) || SOURCES_TA.test(t) || SOURCES_TG.test(t)) && /\b(briefing|brief|report|answer|summary)\b|சுருக்க|அறிக்கை/i.test(t)) return { kind: "sources", say: SAY.sources };
  // a measure the department list does not hold: complaints split by department (the rules ranked open incidents under a question about complaints, same-number-20)
  // (the past-deadline count IS held per department, so "past deadline by department" is answered by the department list: RC-11, e-routes)
  // an order to close, reopen or export records is never done from chat, with or without a model (Ask has no tool that writes)
  if (!ORDER_QUESTION.test(t) && (ORDER_EN.test(t) || ((ORDER_TG.test(t) || ORDER_TA.test(t)) && THINGS.test(t)))) return { kind: "order", say: SAY.order! };
  if (rulesOnly && /\bcomplaints?\b|புகார்/i.test(t) && !/\bincidents?\b|சம்பவ/i.test(t) && !PAST_DEADLINE.test(t) && DEPT_SPLIT.test(t)) return { kind: "deptComplaints", say: SAY.deptComplaints! };
  if (rulesOnly && WRITE.test(t)) return { kind: "letter", say: SAY.letter };
  if (rulesOnly && (FUTURE.test(t) || FUTURE_MORE.test(t)) && THINGS.test(t) && !WEATHER.test(t)) return { kind: "forecast", say: SAY.forecast };
  return null;
}

export type ShareOf = "resolved" | "open" | "severe" | "overdue";
const PERCENT = /(?<![\d.]\s?)\b(percent(?:age)?s?|share of|proportion of|ratio of|fraction of)\b|சதவீதம்|சதவிகிதம்|\bsathaveedham\b|\bsathavigidham\b|(?<![\d.]\s?)%/i;
/** "what percentage of complaints are resolved?": the share asked for and of what, else null. A threshold ("above 90 percent") is not a share. */
export function shareAsked(message: string): ShareOf | null {
  if (!PERCENT.test(message)) return null;
  if (/\d\s*(%|percent)/i.test(message) && !/\b(percentage|share|proportion|what percent)\b/i.test(message)) return null;
  if (/\b(overdue|late|past (the |their )?deadline|missed (the |their )?deadline)\b|கெடு தாண்டிய|\bdeadline (thaandi|thandi)/i.test(message)) return "overdue";
  if (/\b(resolved|closed|completed|solved|fixed|cleared|resolve aana|close aana)\b|தீர்க்கப்பட்ட|தீர்வான|முடிந்த/i.test(message)) return "resolved";
  if (/\b(severe|critical)\b|கடுமையான/i.test(message)) return "severe";
  if (/\b(open|pending|unresolved|outstanding|not resolved|still open)\b|திறந்த|நிலுவை/i.test(message)) return "open";
  return null;
}
