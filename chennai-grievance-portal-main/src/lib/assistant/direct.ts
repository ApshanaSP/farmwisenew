/**
 * Questions whose answer is plainly one console tool, decided in code before any model: the Collector's verification
 * queue, the department backlog, and news with no department record. The router (a model) sent these to the wrong
 * place in the evaluation ("Which incidents need my verification?" became a list of the newest incidents, "Which
 * department has the oldest pending work?" was answered "not recorded", and "missing from the departmental
 * application" was read as the Missing-person category). Pure: no database, no model.
 */

export interface DirectTool { name: "verification_queue" | "dept_backlog" | "news_gaps" | "environment" | "change_drivers" | "departments" | "zones" | "taluks" | "briefing"
  | "place_breakdown" | "resolution_times"; args: Record<string, unknown>; because: string }

/** a question about incidents or complaints of that kind ("air pollution complaints"), not about the readings themselves */
const INCIDENT_WORDS = /\b(complaints?|incidents?|cases?|reports?|grievances?|petitions?)\b|புகார்|சம்பவ/i;
const AQI = /\b(aqi|air quality|air pollution level|pollution levels?)\b|காற்று(த்)? தரம்/i;
const LAKES = /\b(lakes?|reservoirs?|tanks?)\b.{0,40}\b(full|storage|level|capacity|filled)\b|\b(full|storage|level|capacity)\b.{0,30}\b(lakes?|reservoirs?)\b|ஏரி/i;
const RAIN = /\b(how much|rainfall|rain fell|rained|mm of rain)\b.{0,30}\b(rain|rainfall|today|yesterday|24 hours?|mm)\b|\bhow much rain\b|மழை அளவு/i;
const FORECAST = /\b(forecast|forecasts|will it rain|is it going to rain|rain (alert|warning)s?|weather (warning|alert|update|report|outlook|today|tomorrow|this week|next)\w*|imd)\b|வானிலை|மழை (எச்சரிக்கை|முன்னறிவிப்பு)/i;
/** "more than 90%", "above 85 %", "over 90 percent": the threshold a reading must pass */
function above(t: string): number | null {
  const m = t.match(/\b(?:more than|above|over|greater than|exceed(?:s|ing)?|at least|>)\s*(\d{1,3}(?:\.\d)?)\s*(?:%|per ?cent)/i);
  return m ? Number(m[1]) : null;
}

/**
 * "Why is there a drop in complaints this week?", "what is behind the rise in flooding?": an explanation of a change, which
 * the change-drivers card answers (what rose or fell and where, rain, missed deadlines). The router once answered it with
 * the period's totals and no reason.
 */
const WHY_CHANGE = /\b(why|what (caused|is behind|explains|drove|is driving)|reason for|reasons for)\b.{0,60}\b(drops?|dropp(ed|ing)|fall|fell|falling|declin\w*|decreas\w*|dips?|rise|rising|rose|increas\w*|spikes?|jump\w*|surg\w*|more|fewer|less|higher|lower|up|down|went (up|down))\b|ஏன்.{0,40}(அதிகரி|குறை)|(அதிகரி|குறை).{0,40}ஏன்|\b(yen|en)\b.{0,30}\b(increase|decrease|jaasthi|kammi|athigam|korainj)/i;

/**
 * A count broken down by department, zone or taluk ("severe incidents this week by department", "zone-wise complaints"): the
 * breakdown card. A smaller router model once answered it with one district-wide total.
 */
const COUNTED = /\b(how many|number of|count|incidents?|complaints?|cases?|grievances?|severe|open|pending|reported)\b|எத்தனை|evlo|ethana/i;
const BY = (unit: string) => new RegExp(`\\b(by|per|each|across|every|in each|for each)\\s+(the\\s+)?${unit}s?\\b|\\b${unit}[- ]?wise\\b|\\b${unit}s? breakdown\\b`, "i");
const BY_DEPT = BY("(department|dept)"), BY_ZONE = BY("zone"), BY_TALUK = BY("taluk");

const VERIFY = /\b(need|needs|needing|awaiting|waiting( for)?|pending|due)\b.{0,30}\b(my |your |collector'?s? )?(verification|verify|verifying|approval|sign[- ]?off|check(ing)?)\b|\bmy tasks?\b|\b(to|for me to) (verify|approve)\b|\bverification (queue|list|pending)\b|சரிபார்க்க|சரிபார்ப்பு/i;
const DEPT = /\b(department|departments|dept|depts)\b|துறை/i;
const BACKLOG = /\bbacklogs?\b|\b(oldest|longest|slowest|most delayed|most pending)\b|\b(pending|open) (the )?longest\b/i;
const MULTI = /\b(more than one|multiple|several|many|two or more|2 or more|at least (two|2)|2\+)\s+(news ?papers?|papers|outlets?|media|news (sources?|outlets?)|publications?)\b/i;
const NO_RECORD = /\b(missing|not (in|on|recorded|logged|registered)|no (department(al)?|record)|absent|without|unrecorded|not yet in)\b.{0,50}\b(department(al)?|app(lication)?|records?|system)\b/i;

/** "What changed since last week?", "anything new today?": what moved against the period before. */
const CHANGED = /\bwhat('s| has| have|s)? (changed|new)\b|\banything new\b|\bchanges? (since|from|over|in the last)\b|என்ன மாற்றம்/i;
/** "What should I focus on today?", "what needs my attention?": the change-drivers card ends with what to act on first. */
const FOCUS = /\bwhat should (i|we) (focus|look|concentrate|act|work) on\b|\bwhere should (i|we) (focus|start|look)\b|\bwhat needs my attention\b|\b(my|today'?s) priorities\b|\bprioriti[sz]e (today|this week)\b/i;

/**
 * "Which ward has the most garbage complaints?", "which taluk has the highest severe incidents?": a ranking of places or
 * departments, not a list of the newest incidents (the rules once listed eight garbage incidents for it).
 */
const WHICH_MOST = (unit: string) => new RegExp(`\\b(which|what|top|highest|worst)\\s+(\\d+\\s+)?${unit}s?\\b.{0,60}\\b(most|highest|maximum|max|more|biggest|largest|top|worst|leads?|leading)\\b`, "i");
const MOST_DEPT = WHICH_MOST("(department|dept)"), MOST_ZONE = WHICH_MOST("zone"), MOST_TALUK = WHICH_MOST("taluk"), MOST_WARD = WHICH_MOST("(ward|area|locality)");
/** "average resolution time", "how quickly does Metrowater resolve complaints", "which department resolves fastest": time to close */
const RESOLUTION = /\b(average|avg|mean|median|typical)\s+(time\s+(to|for)\s+(resolve|resolution|close|closing|fix)\w*|(resolution|closing|closure|turnaround|response)\s+time)\b|\b(resolution|closure|turnaround)\s+times?\b|\bhow (fast|quickly|long)\b.{0,40}\b(resolve|resolved|resolving|close|closed|closing|fix|fixed|fixing|clear|cleared|clearing)\b|\bresolves? (the )?(fastest|quickest|slowest)\b|\b(fastest|quickest|slowest) (to )?resolv\w*|\bresolv\w*\b.{0,30}\b(fastest|quickest|slowest|fast|quickly|slowly)\b|\b(fastest|quickest|slowest)\b.{0,15}\b(clos|resolv|fix|clear|dispos)\w*|\b(clos|dispos)\w*\b.{0,30}\b(fastest|quickest|slowest)\b/i;
const LATE = /\b(overdue|over-due|late|delayed|past (the |their )?deadline|missed (the |their )?deadline|sla)\b/i;
/**
 * "what happened this week?", "indha week enna nadandhuchu", "இன்று என்ன நடந்தது?": the whole message asks what happened in a
 * period, and names nothing else ("what happened at Velachery lake" is one incident's story, not this)
 */
const HAPPENED = /^\s*(so\s+)?what('s| has| all| all has)?\s*(happened|been happening)\s*(today|yesterday|this week|this month|last week|last month|so far|recently|in the last \d+ (hours|days))?\s*[?.!]*\s*$|^\s*(indha|intha|inniki|innaiki|nethu|today|this|last)?\s*(week|maasam|month|vaaram)?\s*enna\s*(ellam\s*)?nada(n?d|n?t)h\w*\s*[?.!]*\s*$|^\s*(இந்த வாரம்|இன்று|நேற்று)?\s*என்ன நடந்த\S*\s*[?]*\s*$/i;
/** "is the garbage situation in Tondiarpet getting better?", "is flooding improving?": the period against the one before, and why */
const TREND_Q = /\b(getting|got|becoming|is it|are they) (better|worse)\b|\b(improv|worsen)(ing|ed)\b|\bon the (rise|decline)\b/i;
/** "brief me", "summary for today's meeting with the commissioner", "talking points for the review": the briefing */
const BRIEF = /\bbrief me\b|\b(summary|summarise|summarize|brief(ing)?|notes?|talking points|points)\b.{0,40}\b(meeting|review|commissioner|minister|secretary|cm|press)\b|\b(prepare|give me|draft)\b.{0,20}\b(brief(ing)?|daily summary|situation report|sitrep)\b|\bsitrep\b/i;

/** The one tool that answers `message`, or null to let the router decide. */
export function directTool(message: string): DirectTool | null {
  const t = message.toLowerCase();
  if (VERIFY.test(t)) return { name: "verification_queue", args: {}, because: "asks for the work awaiting the Collector's verification (My Tasks)" };
  if (COUNTED.test(t) && !WHY_CHANGE.test(t)) {
    if (BY_DEPT.test(t)) return { name: "departments", args: {}, because: "asks for the figures department by department" };
    if (BY_ZONE.test(t)) return { name: "zones", args: {}, because: "asks for the figures zone by zone" };
    if (BY_TALUK.test(t)) return { name: "taluks", args: {}, because: "asks for the figures taluk by taluk" };
  }
  if (!WHY_CHANGE.test(t) && !/\b(why|reason)\b/.test(t)) {
    if (MOST_WARD.test(t)) return { name: "place_breakdown", args: {}, because: "asks which ward or area has the most (location-wise counts)" };
    if (MOST_TALUK.test(t)) return { name: "taluks", args: {}, because: "asks which taluk has the most" };
    if (MOST_ZONE.test(t)) return { name: "zones", args: {}, because: /\b(improv\w*|better|worse\w*|chang\w*|compared?)\b/.test(t)
      ? "asks which zone improved or worsened the most against the period before" : "asks which zone has the most" };
    // "which department has the most overdue cases": the backlog card holds overdue counts; the department list does not
    if (MOST_DEPT.test(t) && (BACKLOG.test(t) || LATE.test(t))) return { name: "dept_backlog", args: {}, because: "asks which department has the most overdue or oldest open work" };
    if (MOST_DEPT.test(t)) return { name: "departments", args: {}, because: "asks which department has the most" };
  }
  if (BRIEF.test(t)) return { name: "briefing", args: {}, because: "asks for a briefing or a summary for a meeting" };
  if (HAPPENED.test(t)) return { name: "briefing", args: {}, because: "asks what happened in the period" };
  if (WHY_CHANGE.test(t)) return { name: "change_drivers", args: {}, because: "asks why something rose or fell (what changed, where, and what drove it)" };
  if (CHANGED.test(t)) return { name: "change_drivers", args: {}, because: "asks what changed against the period before" };
  // (a bare "is it getting worse?" is about the previous answer, whatever it measured: the pipeline reads it from there)
  // (a reading's trend, "is the air quality getting worse?", stays with the readings below)
  if (TREND_Q.test(t) && !/^\s*(is|are|has|have)\s+(it|that|this|they|these|those)\b/.test(t) && !AQI.test(t) && !LAKES.test(t) && !RAIN.test(t)
    && !/\b(price|prices|rate|rates)\b/.test(t))
    return { name: "change_drivers", args: {}, because: "asks whether it is getting better or worse" };
  // "top 3 departments by open incidents", "worst 5 zones": a ranking of departments, zones or taluks, not incidents
  const top = t.match(/\b(top|bottom|worst|best)\s+(\d{1,2}\s+|three\s+|five\s+|ten\s+)?(departments?|depts?|zones?|taluks?)\b/);
  if (top) return /^dep/.test(top[3]) ? { name: "departments", args: {}, because: "asks for the top departments" }
    : /^zone/.test(top[3]) ? { name: "zones", args: {}, because: "asks for the top zones" } : { name: "taluks", args: {}, because: "asks for the top taluks" };
  if (FOCUS.test(t)) return { name: "change_drivers", args: {}, because: "asks what to focus on: what moved, what is late, and what to act on first" };
  if (RESOLUTION.test(t)) return { name: "resolution_times", args: {}, because: "asks how fast incidents are resolved (time from report to closing)" };
  // "which department has the oldest pending work / the biggest backlog / is slowest": the backlog card, not a list
  if (DEPT.test(t) && BACKLOG.test(t)) return { name: "dept_backlog", args: {}, because: "asks which department's open work is oldest (the backlog card)" };
  if (MULTI.test(t) && NO_RECORD.test(t)) return { name: "news_gaps", args: { minOutlets: 2 }, because: "news reported by more than one outlet with no department record" };
  // readings, not incidents: "what is the air quality today, is it getting worse?" was once counted as air-pollution incidents
  if (!INCIDENT_WORDS.test(t)) {
    if (AQI.test(t)) return { name: "environment", args: { metric: "aqi", above: above(t) }, because: "asks for the air-quality readings" };
    if (LAKES.test(t)) return { name: "environment", args: { metric: "lake_pct_full", above: above(t) }, because: "asks how full the reservoirs are" };
    if (RAIN.test(t)) return { name: "environment", args: { metric: "rainfall_24h_mm" }, because: "asks how much rain fell" };
    // "rain forecast for this week", "will it rain tomorrow?": IMD's district warnings for the coming days (the assistant
    // makes no forecast of its own); the records search once answered "no incidents match"
    if (FORECAST.test(t)) return { name: "environment", args: { metric: "imd_warning_level" }, because: "asks about the weather ahead (IMD's warnings)" };
  }
  return null;
}
