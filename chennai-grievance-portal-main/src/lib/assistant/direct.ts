/**
 * Questions whose answer is plainly one console tool, decided in code before any model: the Collector's verification
 * queue, the department backlog, and news with no department record. The router (a model) sent these to the wrong
 * place in the evaluation ("Which incidents need my verification?" became a list of the newest incidents, "Which
 * department has the oldest pending work?" was answered "not recorded", and "missing from the departmental
 * application" was read as the Missing-person category). Pure: no database, no model.
 */

export interface DirectTool { name: "verification_queue" | "dept_backlog" | "news_gaps" | "environment" | "change_drivers" | "departments" | "zones" | "taluks"; args: Record<string, unknown>; because: string }

/** a question about incidents or complaints of that kind ("air pollution complaints"), not about the readings themselves */
const INCIDENT_WORDS = /\b(complaints?|incidents?|cases?|reports?|grievances?|petitions?)\b|புகார்|சம்பவ/i;
const AQI = /\b(aqi|air quality|air pollution level|pollution levels?)\b|காற்று(த்)? தரம்/i;
const LAKES = /\b(lakes?|reservoirs?|tanks?)\b.{0,40}\b(full|storage|level|capacity|filled)\b|\b(full|storage|level|capacity)\b.{0,30}\b(lakes?|reservoirs?)\b|ஏரி/i;
const RAIN = /\b(how much|rainfall|rain fell|rained|mm of rain)\b.{0,30}\b(rain|rainfall|today|yesterday|24 hours?|mm)\b|\bhow much rain\b|மழை அளவு/i;
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

/** The one tool that answers `message`, or null to let the router decide. */
export function directTool(message: string): DirectTool | null {
  const t = message.toLowerCase();
  if (VERIFY.test(t)) return { name: "verification_queue", args: {}, because: "asks for the work awaiting the Collector's verification (My Tasks)" };
  if (COUNTED.test(t) && !WHY_CHANGE.test(t)) {
    if (BY_DEPT.test(t)) return { name: "departments", args: {}, because: "asks for the figures department by department" };
    if (BY_ZONE.test(t)) return { name: "zones", args: {}, because: "asks for the figures zone by zone" };
    if (BY_TALUK.test(t)) return { name: "taluks", args: {}, because: "asks for the figures taluk by taluk" };
  }
  if (WHY_CHANGE.test(t)) return { name: "change_drivers", args: {}, because: "asks why something rose or fell (what changed, where, and what drove it)" };
  // "which department has the oldest pending work / the biggest backlog / is slowest": the backlog card, not a list
  if (DEPT.test(t) && BACKLOG.test(t)) return { name: "dept_backlog", args: {}, because: "asks which department's open work is oldest (the backlog card)" };
  if (MULTI.test(t) && NO_RECORD.test(t)) return { name: "news_gaps", args: { minOutlets: 2 }, because: "news reported by more than one outlet with no department record" };
  // readings, not incidents: "what is the air quality today, is it getting worse?" was once counted as air-pollution incidents
  if (!INCIDENT_WORDS.test(t)) {
    if (AQI.test(t)) return { name: "environment", args: { metric: "aqi", above: above(t) }, because: "asks for the air-quality readings" };
    if (LAKES.test(t)) return { name: "environment", args: { metric: "lake_pct_full", above: above(t) }, because: "asks how full the reservoirs are" };
    if (RAIN.test(t)) return { name: "environment", args: { metric: "rainfall_24h_mm" }, because: "asks how much rain fell" };
  }
  return null;
}
