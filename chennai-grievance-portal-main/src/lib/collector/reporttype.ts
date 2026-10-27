/**
 * What kind of report a news headline is (LT-03). Only an incident (something that happened and that a department may
 * have to act on) becomes an incident with a severity; the rest are kept as news but never counted:
 *
 *   alert              a forecast or warning: rain, cyclone, IMD/RMC colour alerts ("'Yellow' alert for Chennai today").
 *                      These feed the alerts lane (alerts.ts), not the incident list.
 *   government_action  work a department announced or did: removal drives, boats on standby, tenders, inspections,
 *                      vaccination drives, new projects ("43 tonnes of waste removed", "980 fire personnel on standby")
 *   resolution         the end of an earlier event: rescued, traced, restored, sentenced ("5 missing boys rescued")
 *   roundup            several stories in one ("Chennai Latest News Today…", "Crime Corner"), status tables
 *                      (lake storage, "where was the highest rainfall")
 *   opinion            opinion, features, explainers, studies, memes, and political statements ("Mayor accuses",
 *                      "Anbumani insists"): someone's view, not an event
 *   other              promotions and events (a hospital's new robot, an awareness day)
 *   incident           an event: a death, injury, crime, accident, fire, flooding, outage, missing person
 *
 * Rules on the headline (the English translation of a Tamil one when there is one). The order matters: a roundup or
 * an opinion piece names incidents too, and a death beats everything after it ("Woman dies while rescuing son" is an
 * incident, not a rescue). `null` means the headline says nothing decisive: the pipeline's label stands.
 * The pipeline has the same rules (district_intel/dintel/reporttype.py): keep the two in step.
 */

export type ReportKind = "incident" | "alert" | "government_action" | "resolution" | "roundup" | "opinion" | "other";
export const NON_INCIDENT_KINDS: ReportKind[] = ["alert", "government_action", "resolution", "roundup", "opinion", "other"];

const rx = (parts: string[]) => new RegExp(parts.join("|"), "i");

/** people hurt or killed, or a crime: an incident whatever else the headline says */
const HARM = rx([
  String.raw`\b(killed|kills?|dies|died|dead|death|deaths|drown\w*|electrocut\w*|injur\w*|hurt|stabb\w*|murder\w*|hacked|assault\w*|rape\w*|raped|sexual|pocso|molest\w*|suicide|attack\w*|bodies (found|recovered)|body found|charred|missing)\b`,
  "பலி", "உயிரிழ", "கொலை", "தற்கொலை", "காயம்"
]);
/** something happened (not people hurt): accidents, fires, damage, flooding, outages, arrests */
const EVENT = rx([
  String.raw`\b(accidents?|collision|collides?|crash\w*|rams?|rammed|overturn\w*|fire|blaze|gutted|explosion|blast|collaps\w*|caved|cave-in|uprooted|fell|fallen|waterlogg\w*|inundat\w*|flooded|submerged|stagnat\w*|overflow\w*|breach\w*|potholes?|sinkhole|outage|power cut|blackout|no water|bomb threat|hoax|theft|thefts|stolen|steal\w*|snatch\w*|robb\w*|burglar\w*|arrest\w*|seized|seizure|held for|nabbed|cheat\w*|fraud|scam|jailbreaks?|escaped|stranded|disrupt\w*|leak\w*|contaminat\w*|outbreak|cases rise|spike in|protest\w*|stir|agitation|road roko|blockade|clash\w*|derail\w*|plunge[sd]?|skid\w*|overcharg\w*|piles? up|piling up|nightmare|menace|stench|troubles? residents|residents (flag|complain|suffer|struggle|fume))\b`,
  String.raw`\bshock as\b`, "விபத்து", "தீ விபத்து", "மின்தடை", "கைது", "திருட்டு", "மழைநீர் தேங்கி", "போராட்டம்"
]);
const ROUNDUP = rx([
  String.raw`latest news today`, String.raw`news today live`, String.raw`live updates?`, String.raw`\btop (news|stories|headlines)\b`,
  String.raw`news highlights`, String.raw`news (wrap|roundup|round-up|bulletin|digest)`, String.raw`crime corner`, String.raw`\bin brief\b`,
  String.raw`morning (news|briefing)`, String.raw`evening (news|briefing)`, String.raw`#gallery`, String.raw`where was the highest rainfall`,
  String.raw`rainfall (recorded|figures|data) (across|in) `, String.raw`storage (status|position|level)s? of`, String.raw`current water storage`,
  String.raw`(water|storage) levels? (in|of) (chennai'?s )?(major )?(lakes|reservoirs)`, String.raw`\bdeep dive\b`, String.raw`\bnews update\b.*\|.*\|`,
  String.raw`\b(water|storage) (inflow|level|levels|storage)\b.{0,60}\b(rises?|rose|decreas\w*|increas\w*|dips?|drops?|falls?)\b`, String.raw`\bwater inflow\b`,
  "இன்றைய முக்கிய செய்திகள்", "செய்தி தொகுப்பு"
]);
const OPINION = rx([
  String.raw`\bopinion\b`, String.raw`\beditorial\b`, String.raw`\bcolumn\b`, String.raw`\bexplainer\b`, String.raw`\bexplained\b`, String.raw`vox pop`,
  String.raw`public opinion`, String.raw`\bwhy (does|do|is|are)\b`, String.raw`\bwhat (it|this) means\b`, String.raw`new study`, String.raw`\bstudy (finds|shows|says)\b`,
  String.raw`\bmeme\b`, String.raw`\bviral\b`, String.raw`\bdebate\b`, String.raw`places to visit`, String.raw`things to do`, String.raw`\binterview\b`,
  String.raw`\bpodcast\b`, String.raw`\bfeature\b`, String.raw`\bhow to\b`, String.raw`\btips\b`, String.raw`left her|left him|rebuild (her|his) life`
]);
/** a politician's or official's statement: someone said, accused, demanded */
const SPEAKER = String.raw`(minister|mayor|mla|mp|cm|chief minister|leader|chief|party|dmk|aiadmk|bjp|pmk|tvk|vck|ntk|congress|cpi|cpm|dmdk|mdmk|ramadoss|anbumani|stalin|seeman|velmurugan|annamalai|vijay|palaniswami|eps|ops|udhayanidhi|governor)`;
const STATEMENT = new RegExp(String.raw`\b${SPEAKER}\b.{0,80}\b(accuses?|accused|insists?|slams?|blames?|demands?|urges?|criticis\w*|criticiz\w*|asks|questions|hits out|lashes out|alleges?|warns|condemns?|says|said|claims?|vows?|promises?|responds?|ready to respond|reacts?)\b` +
  String.raw`|\b(accuses?|insists?|slams?|demands?|urges?|criticis\w*|alleges?|condemns?)\b.{0,40}[!:]?\s*$|asks barrage of questions`, "i");
const RESOLVED = rx([
  String.raw`\b(rescued|rescues|traced|found safe|found alive|reunited|restored|resumed|reopen\w*|back to normal|escape[sd]? (safely|unhurt|unharmed)|safe(ly)? rescued|recovered|retrieved|returned safely|sentenced|convicted|acquitted|gets? \d+(\.\d+)?[- ]years?|jail term|life term|life imprisonment)\b`,
  "மீட்பு", "மீட்கப்பட்ட", "சீரானது"
]);
const ALERT = rx([
  String.raw`\b(red|orange|yellow|green) alert\b`, String.raw`\balert for\b`, String.raw`\brain alert\b`, String.raw`\bwarning\b`, String.raw`\bwarns\b`,
  String.raw`\bforecast\b`, String.raw`\bimd\b`, String.raw`meteorolog\w*`, String.raw`weather (update|centre|center|research|department|report|today)`,
  String.raw`\bhow will (the )?(rain|weather)\b`, String.raw`\brain (to|will|may|likely)\b`, String.raw`\b(heavy|very heavy|extremely heavy) rain(fall)? (likely|expected|predicted)\b`,
  String.raw`\bwill (it|the cyclone|cyclone|the storm|chennai)\b.*\b(rain|cyclone|storm|hit|affect|affected)\b`, String.raw`\bcyclone\b`, String.raw`\bdepression\b`,
  String.raw`\blow[- ]pressure\b`, String.raw`\bstorm (forming|approaching|to form)\b`, String.raw`\bsignal (no\.?|number) ?\d\b`, String.raw`\bcage hoisted\b`,
  String.raw`\bflash flood risk\b`, String.raw`\bmonsoon (update|onset|forecast)\b`, String.raw`\b(no|direct) impact on chennai\b`, String.raw`\bnowcast\b`,
  "எச்சரிக்கை", "புயல்", "வானிலை", "மழை (பெய்யும்|வாய்ப்பு)", "கனமழை"
]);
const GOV_ACTION = rx([
  String.raw`\bmore (boats|pumps|motors|staff|workers|buses|personnel)\b`, String.raw`\b(removed|removal|cleared|clearance|desilt\w*|deployed|deploys?|on standby|kept ready|ready to|boats? ready|readied|inspect\w*|launch\w*|inaugurat\w*|tender\w*|projects?|scheme|plans?|to build|to construct|construction of|sanction\w*|allocat\w*|funds?|crore|vaccinat\w*|drive|campaign|awareness|order(s|ed)?|directs?|directed|instructs?|instructed|starts? work|work (is )?underway|underway|special officers?|monitoring|preparedness|precaution\w*|measures?|relief camps?|set up|opens?|opened|holiday declared|declares holiday|advised|advises|advisory|appeal\w*|helpline|control room|to ease|to reduce|upgrade|portal|app launched)\b`,
  "நடவடிக்கை", "ஆய்வு", "அகற்றம்", "அகற்றப்பட்ட", "தயார் நிலை", "திட்டம்", "முகாம்"
]);
const PROMO = rx([
  String.raw`\b(robotic|knee (joint )?replacement|surgery at .* hospital|awareness event|world \w+ day|celebrat\w*|festival|concert|exhibition|expo|launch of .* (store|showroom|outlet)|offers?|discount|admission(s)? open|webinar|conclave|summit)\b`
]);

/** damage the weather has already done */
const IMPACT = /\b(stranded|uprooted|collaps\w*|waterlogg\w*|inundat\w*|flooded|submerged|outage|power cut|blackout|potholes?|caved|damaged)\b/i;
/** "to prevent collapse", "to face monsoon", "against rabies": the thing named did not happen */
const PREVENTED = /\b(?:to\s+)?(?:prevent\w*|avoid\w*|face|tackle|fight|combat|curb|check|reduce|ease|stop|against|ahead of|in view of)\s+(?:\w+\s+){0,3}?\w+/gi;
/** services named after what they deal with: fire personnel, fire service, flood relief teams */
const SERVICES = /\bfire\s*(?:personnel|service\w*|fighters?|and rescue|tenders?|station|brigade|department|safety)\b|\bfirefighters?\b|\bflood\s+(?:relief|response|control)\s+(?:teams?|centres?|room)\b/gi;

/**
 * The kind of report a headline is, or null when the headline is not decisive. `text` is the headline (the English
 * translation of a Tamil one first, then the original).
 */
export function reportKind(...texts: (string | null | undefined)[]): ReportKind | null {
  const t = texts.filter(Boolean).join(" \n ").replace(/[‘’]/g, "'");
  if (!t.trim()) return null;
  // what is prevented or prepared for did not happen ("inspection to prevent collapse", "980 fire personnel on standby")
  const said = t.replace(PREVENTED, " ").replace(SERVICES, " ");
  const harm = HARM.test(said), event = EVENT.test(said);
  // a missing person found is the end of the event, not a new one
  const hurt = HARM.test(said.replace(/\bmissing\b/gi, " "));
  if (ROUNDUP.test(t)) return "roundup";
  if (OPINION.test(t) && !(harm && !/left her|left him|rebuild/i.test(t))) return "opinion";
  if (STATEMENT.test(t) && !harm && !/\b(arrest\w*|held|detained|booked|raid\w*)\b/i.test(t)) return "opinion";
  // a rescue after something that happened (a car in a canal) is still that event
  if (RESOLVED.test(t) && !hurt && !event) return "resolution";
  // a forecast or warning, unless the weather already did damage ("boats stranded due to storm")
  if (ALERT.test(t) && !harm && !IMPACT.test(said)) return "alert";
  if (harm) return "incident";
  if (PROMO.test(t) && !event) return "other";
  if (GOV_ACTION.test(t) && !event) return "government_action";
  if (event) return "incident";
  return null;
}
