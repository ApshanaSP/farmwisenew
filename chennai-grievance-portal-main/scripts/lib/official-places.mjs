/**
 * Official places (owner, 28 Nov 2026: "only official schools, colleges, hospitals, metro stations, fire stations ..."): the rules that keep
 * an OpenStreetMap place on a facility layer only when it is the kind of place the layer says, matched to an official list where one could
 * be read by program. Pure functions, shared by scripts/build-map-layers.mjs (a fresh OSM build) and scripts/build-official-places.mjs (the
 * official lists, the AI's verdicts on the doubtful names, and a re-filter of the layer files without asking Overpass again).
 *
 * Each kept feature carries `verified`: "official" (matched to an official list entry: `official` = { src, id, name }), "name" (not on a
 * list we could read by program, but its name says plainly what it is, by rule or by the AI's verdict: `verified_by` "rule" | "ai"),
 * "reported" (a metro station on an opening reported after the operator's timetable was cut) or "tag" (a fire station OpenStreetMap tags as
 * one but does not name). Every dropped feature is kept, with
 * its reason, in data/layers/official/<layer>.dropped.json, so a re-run can bring one back when a list improves. Nothing is invented: an
 * official entry with no reliable map point is counted in meta.json (official.unmapped), never drawn.
 */

// ---------------------------------------------------------------- names --

const ABBR = [
  [/\bgovt\b|\bgovernmnet\b|\bgov\b/g, "government"], [/\bgovernment\s+higher\s+secondary\b/g, "government higher secondary"],
  [/\bg\s*h\s*s\s*s\b|\bghss\b/g, "government higher secondary school"], [/\bg\s*g\s*h\s*s\s*s\b|\bgghss\b/g, "government girls higher secondary school"],
  [/\bghs\b/g, "government high school"], [/\bhss\b|\bhr\s*sec\b|\bh\s*s\s*s\b/g, "higher secondary school"], [/\bsec\b/g, "secondary"],
  [/\bmat\b|\bmatric\b/g, "matriculation"], [/\bengg\b|\bengineeering\b/g, "engineering"], [/\bclg\b|\bcollage\b|\bcolg\b|\bcoll\b/g, "college"],
  [/\bhosp\b|\bhospitals\b/g, "hospital"], [/\buniv\b/g, "university"], [/\binst\b/g, "institute"], [/\btech\b/g, "technology"],
  [/\bfs\b|\bfire\s*(and|&)?\s*rescue\s*(services?)?\s*station\b|\bfire\s*station\b/g, "fire station"], [/\bst\b/g, "saint"], [/\bsr\b/g, "senior"],
  [/\bdr\b/g, "doctor"], [/\bschl\b/g, "school"], [/\bvidyalayam\b/g, "vidyalaya"], [/\bcorpn\b|\bcorpo\b/g, "corporation"],
  [/\buphc\b/g, "urban primary health centre"], [/\bphc\b/g, "primary health centre"], [/\bgh\b/g, "government hospital"],
  // the Textbook Corporation's school list writes Corporation and municipal schools short: "CHSS LLOYDS ROAD", "MUN HSS, LAKSHMIPURAM", "ADW HS"
  [/\bchss\b/g, "corporation higher secondary school"], [/\bchs\b/g, "corporation high school"], [/\bgbhss\b/g, "government boys higher secondary school"],
  [/\bgbhs\b/g, "government boys high school"], [/\bgghs\b/g, "government girls high school"], [/\bmun\b/g, "municipal"], [/\badw\b/g, "adi dravidar welfare"],
  [/\bsch\b/g, "school"], [/\bsci\b/g, "science"], [/\bautonomous\b/g, ""],
  // "T.Nagar" (dots gone: "tnagar") is Thiyagaraya Nagar
  [/\bt\s?nagar\b|\bthyagaraya nagar\b/g, "thiyagaraya nagar"]
];
// "madras" is a word of names ("Madras Christian College", "Madras Medical College"), not a stop word like "chennai"
const STOP = new Set(["the", "of", "and", "for", "in", "at", "a", "an", "chennai", "tamil", "nadu", "tamilnadu", "india", "pvt", "ltd", "private", "limited",
  "p", "no", "road", "street", "main", "near", "opp", "new", "old", "branch", "campus", "unit", "trust", "society"]);
/** a pure function of one string, remembered (a layer of 1,400 names against a list of 550 asks for the same names many times) */
const memo = (fn) => { const m = new Map(); return (s) => { const k = String(s ?? ""); let v = m.get(k); if (v === undefined) { v = fn(k); m.set(k, v); } return v; }; };
/** Lower case, accents gone, abbreviations spelt out, punctuation and stop words dropped. */
export const normOfficial = memo((s) => {
  let t = String(s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[.'’`"]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9஀-௿]+/g, " ");
  for (const [re, to] of ABBR) t = t.replace(re, to);
  return t.replace(/\s+/g, " ").trim();
});
/** One spelling for the many ways a Tamil name is written in English: Thiruvanmiyur = Tiruvanmiyur; the consonants only, after the first letter. */
export function translit(w) {
  return w.replace(/th/g, "t").replace(/dh/g, "d").replace(/zh/g, "l").replace(/kh/g, "k").replace(/ph/g, "p").replace(/bh/g, "b").replace(/sh/g, "s").replace(/w/g, "v")
    .replace(/ee/g, "i").replace(/oo/g, "u").replace(/aa/g, "a").replace(/y$/g, "i").replace(/(.)\1+/g, "$1").replace(/[aeiou]/g, (v, i) => (i === 0 ? v : "")).replace(/(.)\1+/g, "$1");
}
/** a and b differ by at most one letter put in, taken out or changed ("vsrmnpt", "vsrmpt": Washermanpet, Washermempet) */
function oneEdit(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return d + (a.length - i) + (b.length - j) <= 1;
}
const GENERIC = new Set(["school", "college", "hospital", "government", "higher", "secondary", "high", "primary", "middle", "matriculation", "girls", "boys", "station",
  "fire", "engineering", "technology", "institute", "university", "arts", "science", "medical", "centre", "center", "corporation", "nursery", "public", "senior",
  "health", "clinic", "multispeciality", "speciality", "super", "research", "education", "management", "studies", "national", "international", "women", "men", "memorial"]);
export const tokensOf = memo((s) => normOfficial(s).split(" ").filter((w) => w && !STOP.has(w)));
const translitAll = memo((s) => tokensOf(s).map(translit));
/**
 * How alike two names are, 0..1: the Dice overlap of their words (each word in its transliterated spelling), where the distinctive words
 * (not "school", "college", "government") count three times. 1 = the same distinctive words.
 */
export function nameScore(a, b) {
  const A = tokensOf(a), B = tokensOf(b);
  if (!A.length || !B.length) return 0;
  const w = (x) => (GENERIC.has(x) ? 1 : 3);
  const ta = translitAll(a), tb = translitAll(b);
  // one word in two spellings: the same, or the same skeleton with the same first letter and nearly the same length ("Sunderarajan",
  // "Sundararajan"), or one a long prefix of the other; never two words that only share consonants ("SIVET" is not "Saveetha")
  const same = (i, k) => A[i] === B[k] || (A[i][0] === B[k][0] && Math.abs(A[i].length - B[k].length) <= 2
      && ((ta[i] === tb[k] && ta[i].length >= 3) || (ta[i].length >= 5 && tb[k].length >= 5 && oneEdit(ta[i], tb[k]))))
    || (A[i].length >= 6 && B[k].length >= 6 && (A[i].startsWith(B[k]) || B[k].startsWith(A[i])));
  let hit = 0, tot = 0, distinct = false;
  const used = new Set();
  for (let i = 0; i < A.length; i++) {
    tot += w(A[i]);
    const j = B.findIndex((_, k) => !used.has(k) && same(i, k));
    if (j >= 0) { used.add(j); hit += w(A[i]) + w(B[j]); if (!GENERIC.has(A[i])) distinct = true; }
  }
  for (let j = 0; j < B.length; j++) tot += w(B[j]);
  // no distinctive word in common: "Government Higher Secondary School" alone says nothing about which one
  return distinct ? hit / tot : Math.min(0.4, hit / tot);
}

/** What kind of institution a name says, and in what subject: two names that disagree are not one place ("Madha Medical College" is not
 *  "Madha Engineering College"; "Madras Medical College" is not "Madras University"). */
const SUBJECT = /\b(engineering|medical|medicine|dental|nursing|pharmacy|law|architecture|education|teacher|arts|management|business|polytechnic|veterinary|physiotherapy|eye|ortho\w*|cancer|maternity|child|psychiatr\w*|siddha|ayurved\w*|homoeo\w*|unani)\b/g;
// a college, a university, an institute: "Anna Institute of Management" is not "Anna University" (a deemed university called an institute
// and mapped as "X University" then goes unmatched, and is kept on its name: a missed match, never a wrong one). Schools: girls or boys;
// Corporation ("Chennai High School", "CHS"), government, municipal or Adi Dravidar welfare; high or higher secondary.
const FACETS = [
  [["college", /\bcollege\b/], ["university", /\buniversity\b/], ["institute", /\binstitute\b/], ["academy", /\bacademy\b/]],
  [["girls", /\bgirls?\b|\bwomen\b/], ["boys", /\bboys?\b/]],
  [["corporation", /\bcorporation\b|^chennai (high|higher|middle|primary|boys|girls|school)\b/], ["government", /\bgovernment\b/], ["municipal", /\bmunicipal\b/], ["adw", /\badi dravidar\b/]],
  [["hss", /\bhigher secondary\b/], ["hs", /\bhigh school\b/], ["middle", /\bmiddle school\b/], ["primary", /\bprimary school\b/]]
];
const facetsOf = memo((s) => {
  const t = normOfficial(s);
  const subj = new Set((t.match(SUBJECT) ?? []).map((x) => (x === "medicine" ? "medical" : x === "teacher" ? "education" : x)));
  return [subj, ...FACETS.map((pairs) => new Set(pairs.filter(([, re]) => re.test(t)).map(([k]) => k)))];
});
export function conflict(a, b) {
  const fa = facetsOf(a), fb = facetsOf(b);
  return fa.some((x, i) => x.size > 0 && fb[i].size > 0 && ![...x].some((y) => fb[i].has(y)));
}

// ----------------------------------------------------------------- rules --

/** What each layer may hold, by its name: `drop` (plainly another kind of place), `keep` (plainly this kind), else the AI is asked. */
export const RULES = {
  colleges: {
    drop: [
      [/\b(coaching|tuition|tutorial|tutors?|ias|ips|upsc|tnpsc|tnusrb|neet|jee|iit ?jee|gre|gmat|ielts|toefl|ssc|rrb|bank exams?|competitive exams?|civil services)\b/i, "coaching or exam preparation"],
      [/\bexam(ination)?s? (centre|center|hall)\b|\btest (centre|center)\b|\bonline exam\b/i, "an exam centre"],
      [/\b(study|learning|skill|placement|career|counsell?ing|guidance|consultants?|overseas|abroad|admission)\b/i, "a study, career or admission centre"],
      [/\b(computer|software|it|typewriting|shorthand|spoken english|language|languages|abacus|vedic maths|aviation academy|driving|animation|multimedia|fashion designing|beautician)\b.*\b(centre|center|academy|institute|training|classes|school)\b/i, "a training institute"],
      [/\b(dance|music|yoga|karate|martial|swimming|chess|drawing|art|arts academy|film|acting)\b.*\b(academy|school|classes|centre)\b/i, "a hobby or arts school"],
      [/\b(hostel|library|guest house|staff quarters|canteen|auditorium|stadium|ground|gate|parking|admin(istrative)? (block|office))\b/i, "a building or facility of a campus, not a college"],
      [/^(?!.*\b(college|university)\b).*\b(matriculation|higher secondary|high school|primary school|nursery|kindergarten|cbse|vidyalaya)\b/i, "a school"],
      [/\bresearch (centre|center|station|lab|laboratory|foundation)\b|\blaborator(y|ies)\b/i, "a research centre, not a college"],
      // research institutes that teach no college course of their own (the owner: "not academic research centres")
      [/\b(institute of mathematical sciences|imsc|leather research|structural engineering research|ocean technology|epidemiology|research in tuberculosis|brackishwater|king institute|development studies|csir|icmr|isro|drdo|igcar)\b/i, "a research institute, not a college"],
      // a department, block or hall of a campus is not a college of its own ("Department of Aeronautical Engineering", "RLHC (Rajam Lecture Hall Complex)")
      [/^(the )?(department|dept\.?) of\b|\bdepartment$|\b(lecture hall|hall complex|block|wing|annexe|annex|extension centre|extension center|study centre|study center|regional centre|regional center)\b/i, "a department, block or centre of a campus, not a college"],
      [/\b(niit|aptech|jetking|csc|nttf|tally|iiht|lakshya|ims|time|t\.?i\.?m\.?e\.?|career launcher|fiitjee|aakash|allen|byju'?s|vision ias|shankar ias|apollo computer)\b/i, "a training or coaching company"],
      // an Industrial Training Institute or other trade school trains for a trade; it is not a college
      [/\b(industrial training institute|i\.?t\.?i\.?|training institute|technical institute|seamen|road transport|medical coding|gaming|activity cent(re|er)|crew)\b/i, "a training institute, not a college"],
      [/\b(hangar|quadrangle|workshop|machine shop|drawing hall|office|annexure|department|laborator(y|ies))\b/i, "a department, block or centre of a campus, not a college"],
      // a staff college trains officers already in service ("Reserve Bank Staff College", "Police Training College"); a teacher-training college is a college
      [/\b(staff college|police training|bank staff)\b/i, "a staff training college, not a college for students"],
      [/^\s*(my|our)\s+(college|school)\s*$/i, "not the name of a place"]
    ],
    keep: [/\b(college|university|deemed|polytechnic|institute of (technology|science|management|engineering|architecture|education|medical|dental|pharmac|nursing|hotel|fashion|law)|school of (architecture|law|management|engineering|planning|business|medicine|optometry)|academy of (architecture|research and education|higher education|maritime)|national institute (of|for) siddha)\b/i,
      /\b(iit|nift|imu|iiitdm|ignou|tiss)\b/i, /கல்லூரி|பல்கலைக்கழக/]
  },
  schools: {
    drop: [
      [/\b(coaching|tuition|tutorial|tutors?|ias|neet|jee|tnpsc|exam)\b/i, "coaching or tuition"],
      [/\b(play ?school|pre ?-?school|pre ?-?kg|kindergarten|kinder garden|day ?care|creche|playhouse|tiny tots|toddlers?|kidzee|euro ?kids|little millennium|montessori house)\b/i, "a pre-school or day care (not a school on UDISE+)"],
      [/\b(driving|dance|music|yoga|karate|kung fu|martial|swimming|chess|abacus|drawing|art|arts|film|acting|cricket|football|tennis|badminton|skating|gym|fitness|beauty|cookery|tailoring)\b.*\b(school|academy|classes|centre|center|institute)\b/i, "a driving, sports, hobby or arts school"],
      [/\b(computer|spoken english|language|typewriting|software)\b.*\b(school|centre|center|institute|academy)\b/i, "a computer or language institute"],
      // a college mapped as a school; but "S.B.O.A School and Junior College" and "Madras Christian College Higher Secondary School" are schools
      [/^(?!.*\b(schools?|junior college|vidyalaya|vidhyalaya)\b).*\b(college|university|polytechnic)\b|\bschool of (architecture|law|management|engineering|planning|business|medicine|nursing|pharmacy|hotel|design)\b/i, "a college or university, not a school"],
      [/\b(hostel|staff quarters|canteen|playground|ground|parking|bus stop)\b/i, "a building or ground, not a school"]
    ],
    keep: [/\b(schools?|vidh?y[a-z]*|vidya mandir|matric|matriculation|higher secondary|high school|primary|middle|hss|mhss|hr\.? ?sec\.?|kendriya|cbse|icse|convent|gurukul|ashram school|special school|deaf|blind)\b/i, /பள்ளி/]
  },
  hospitals: {
    treats: /\b(hospitals?|clinics?|polyclinic|poly clinic|nursing home|health (centre|center)|medical (centre|center|mission|college)|surgical (centre|center|clinic))\b/i,
    drop: [
      // "XYZ Medicals" is a shop; "Madras Medical Mission" is a hospital: the singular word alone says nothing
      // these four go only when the name has no word for a place that treats people ("Apollo Clinic & Pharmacy", "Kidney Hospital and
      // Diagnostic Centre" and "Police Hospital" stay)
      [/\b(pharmacy|pharma|medicals|medical (shop|store|stores|agencies|hall)|chemists?|druggists?|drug house)\b/i, "a pharmacy", "soft"],
      [/\b(lab|labs|laboratory|laboratories|diagnostics?|diagnostic (centre|center)|scans?|scan (centre|center)|imaging|x[- ]?ray|mri|ct scan|pathology|blood (test\w*|collection)|sample collection|path ?lab)\b/i, "a laboratory or scan centre", "soft"],
      [/\b(commissioner|police|office|offices|directorate)\b/i, "an office, not a hospital or clinic", "soft"],
      [/\b(optical|opticals|opticians?|spectacles|eye wear|eyewear|lens)\b/i, "an optical shop", "soft"],
      [/\b(veterinary|vet|pet|animal|cattle|poultry)\b/i, "a veterinary clinic (not for people)"],
      [/\b(salon|spa|beauty|parlour|parlor|hair (studio|transplant)|slimming|tattoo|gym|fitness)\b/i, "a salon, spa or gym"],
      [/\b(ambulance|blood bank|insurance|tpa|medical equipment|surgicals|hearing aids?)\b/i, "a medical service or shop, not a hospital or clinic", "soft"]
    ],
    keep: [/\b(hospital|hospitals|nursing home|clinic|clinics|polyclinic|dispensary|health (centre|center|post)|primary health|medical (centre|center|college|mission)|maternity|dental|dentist|eye (care|centre|center)|ortho|cardiac|cancer|kidney|fertility|ivf|siddha|ayurveda|ayush|homoeo|homeo|unani|naturopathy|physiotherapy|rehabilitation|esi|uphc|phc)\b/i,
      // names the rules above miss, as OpenStreetMap writes them: "Jayam Polyclinc", "Baby Child Clininc", "Vijaya Heart Centre", "Dr. A. L. Annamalais Ent Care Centre"
      /\b(polyclin\w*|clini\w*|hoapital|health ?care|healthcare|medicare|care cent(re|er)|heart cent(re|er)|ent|nethralaya|netralaya|vaidya\w*|vaidhya\w*|specialist|diabet\w*|speciality cent(re|er)|dentistry)\b/i, /^dr\.?\s/i,
      /மருத்துவமனை|சுகாதார நிலையம்|மருந்தகம்/]
  },
  fire_stations: { drop: [[/\b(extinguishers?|fire safety (equipment|products)|fire protection (systems|services) (pvt|ltd|company)|fire works|fireworks|crackers)\b/i, "a fire-safety shop, not a station"],
    // an airport's or a power plant's own fire service is not a public Fire and Rescue station (TNFRS)
    [/\b(airport|nctps|thermal|power (plant|station)|refinery|cpcl|ioc|bpcl|hpcl|port trust|ennore port|kamarajar port|sipcot|industrial)\b/i, "an airport's or a plant's own fire service, not a TNFRS station"],
    [/\b(school|training|academy|directorate|headquarters|head office|office)\b/i, "a TNFRS office or school, not a station"]], keep: [/\bfire\b|தீயணைப்பு/i] }
};
/** A name's verdict by rule: { v: "drop" | "keep" | "unsure", why }. An unnamed place cannot be checked against any list. */
export function ruleVerdict(layer, name) {
  const R = RULES[layer];
  if (!R) return { v: "keep", why: "no rule for this layer" };
  if (!name || !String(name).trim()) return { v: "drop", why: "no name: it cannot be checked against an official list" };
  const n = String(name);
  for (const [re, why, soft] of R.drop) if (re.test(n) && !(soft && R.treats?.test(n))) return { v: "drop", why };
  if (R.keep.some((re) => re.test(n))) return { v: "keep", why: "its name says so" };
  return { v: "unsure", why: "its name does not say" };
}

// -------------------------------------------------------------- geometry --

export const haversineM = (a, b) => {
  const R = 6371008.8, rad = Math.PI / 180;
  const dp = (b[1] - a[1]) * rad, dl = (b[0] - a[0]) * rad;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/// ------------------------------------------------------------- matching --

/** The district names a list gives, written one way ("CHENNAI (EXT. GCC)", "Thiruvallur" and "Tiruvallur" are the same). */
export const districtOf = (d) => {
  const t = String(d ?? "").toLowerCase();
  return !t ? null : /chennai/.test(t) ? "chennai" : /t(h)?iruvallur/.test(t) ? "tiruvallur" : /chengal/.test(t) ? "chengalpattu" : /kanch|kanc/.test(t) ? "kancheepuram" : t;
};

/**
 * The official entry a feature is, or null: the best name score at or above `min` (0.62), taken only when no other entry scores as well
 * (a tie between two "St. Joseph's" is left unmatched, never guessed). An entry with its own point must also be within `maxM` metres.
 * District: an entry that names its district is matched only to a feature on the same side of the district line (`strict`, the school list,
 * whose "Chennai" is the Corporation's area as the map's is), or across it only on a near-exact name (0.85: the college lists still use the
 * districts before Chennai grew in 2018, so a college in Mogappair is listed under Tiruvallur). A village of one name in two districts
 * ("GHSS Kolathur" in Kancheepuram, Kolathur in Chennai) is never taken for the other.
 */
export function bestMatch(feat, entries, { min = 0.62, maxM = 1500, strict = false, extra = [] } = {}) {
  const names = [feat.properties.name, ...(feat.properties.alt ?? []), ...extra].filter(Boolean);
  if (!names.length) return null;
  const inside = !!feat.properties.in_district;
  let best = null, second = 0;
  for (const e of entries) {
    if (e.lat != null && e.lon != null && haversineM(feat.geometry.coordinates, [e.lon, e.lat]) > maxM) continue;
    const d = districtOf(e.district);
    const across = d != null && (d === "chennai") !== inside;
    if (across && strict) continue;
    const s0 = Math.max(...names.flatMap((n) => [e.name, ...(e.alt ?? [])].filter(Boolean).map((m) => (conflict(n, m) ? 0 : nameScore(n, m)))));
    const s = across && s0 < 0.85 ? 0 : s0;
    if (!best || s > best.s) { second = best?.s ?? second; best = { e, s }; } else if (s > second) second = s;
  }
  if (!best || best.s < min || second >= best.s - 1e-9) return null;
  return best;
}

/** The neighbourhood a point is in (the nearest named OSM neighbourhood within `maxM`), for matching a station named by its locality. */
export function nearestPlace(coord, places, maxM = 1500) {
  let best = null;
  for (const p of places) { const d = haversineM(coord, p.geometry.coordinates); if (d <= maxM && (!best || d < best.d)) best = { p, d }; }
  return best;
}

// ---------------------------------------------------------------- filter --

const HOSPITAL_KIND = /\b(clinic|clinics|polyclinic|dispensary|dental|dentist|physiotherapy)\b/i;
const HEALTH_CENTRE = /\b(health (centre|center|post)|primary health|uphc|phc|urban health|wellness centre)\b/i;

/**
 * One layer's features against its official lists and the AI's verdicts. `official`: { sources, entries } (entries: { id, src, name, alt?,
 * district?, lat?, lon? }), or null when no list could be read; `ai`: a Map of `${layer}|${feature id}` to { v: "keep" | "drop", why, kind? };
 * `places`: the OSM neighbourhoods (for fire stations named by their locality). In order: a name that plainly says another kind of place is
 * dropped (a coaching centre whose name is like a college's is still a coaching centre); then the official match; then the name rules and the
 * AI's verdict. Returns the features to keep (with `verified` and, when matched, `official`), the dropped ones with their reasons, the doubtful
 * ones the AI has not judged yet (`unjudged`), the official entries with no map point (`unmapped`) and the counts.
 */
export function filterLayer(layer, feats, official, ai = new Map(), places = [], { strict = false } = {}) {
  const kept = [], dropped = [], unjudged = [];
  const taken = new Map();
  const entries = official?.entries ?? [];
  // first, every name's match: a list entry with no map point that matches points far apart ("Apollo Hospitals" against every branch) is one
  // place of many, and which one cannot be told, so none of them takes it; a university's campuses (Chepauk, Guindy, Taramani) all do
  const strong = new Map(), byEntry = new Map();
  if (entries.length) for (const f of feats) {
    if (!f.properties.name || ruleVerdict(layer, f.properties.name).v === "drop") continue;
    const m = bestMatch(f, entries, { strict });
    if (!m) continue;
    strong.set(f.properties.id, m);
    (byEntry.get(m.e.id) ?? byEntry.set(m.e.id, []).get(m.e.id)).push(f.geometry.coordinates);
  }
  const ambiguous = new Set([...byEntry].filter(([, cs]) => cs.some((a) => cs.some((b) => haversineM(a, b) > 400))).map(([id]) => id)
    .filter((id) => { const e = entries.find((x) => x.id === id); return e && e.lat == null && !/university/i.test(`${e.kind ?? ""} ${e.name}`); }));
  for (const f0 of feats) {
    const f = { ...f0, properties: stripOfficial(f0.properties) };
    const p = f.properties;
    const r = ruleVerdict(layer, p.name);
    if (r.v === "drop" && p.name) { dropped.push(drop(f, r.why)); continue; }
    let m = strong.get(p.id) ?? null;
    if (m && ambiguous.has(m.e.id)) m = null;
    // a name that says only what the place is ("Government Higher Secondary School", "Chennai High School") is read with the neighbourhood it
    // stands in, as the lists name them ("GHSS VELACHERY"); such a match never takes a list entry another point already holds
    if (!m && entries.length && p.name && tokensOf(p.name).every((x) => GENERIC.has(x)) && places.length) {
      const near = places.filter((x) => x.properties.name && haversineM(f.geometry.coordinates, x.geometry.coordinates) <= 1200)
        .sort((a, b) => haversineM(f.geometry.coordinates, a.geometry.coordinates) - haversineM(f.geometry.coordinates, b.geometry.coordinates)).slice(0, 2);
      const weak = near.length ? bestMatch({ ...f, properties: { ...p, alt: [] } }, entries.filter((e) => !taken.has(e.id)), { strict, extra: near.map((x) => `${p.name} ${x.properties.name}`) }) : null;
      if (weak) { m = weak; p.matched_by = "name and neighbourhood"; }
    }
    if (m) {
      const prev = taken.get(m.e.id);
      // one official place drawn once: a second OSM point of it (a gate, a block) goes, unless it is far away (another campus of one name);
      // a point that only its other names tie to the entry ("College of Engineering, Guindy", also called Anna University) is a place of its own
      if (prev && haversineM(prev.geometry.coordinates, f.geometry.coordinates) <= 400) {
        if (Math.max(nameScore(p.name, m.e.name), nameScore(p.name, prev.properties.name ?? "")) >= 0.5) { dropped.push(drop(f, `a second map point of ${m.e.name}`)); continue; }
        m = null;
      }
    }
    if (m) {
      p.verified = "official";
      p.official = { src: m.e.src ?? official.source?.id ?? null, id: m.e.id, name: m.e.name };
      // a name OpenStreetMap holds only in Tamil ("அண்ணா பல்கலைக்கழகம்") is shown in English as the list writes it, the Tamil kept as its Tamil name
      if (p.name && !/[a-z]/i.test(p.name)) { p.name_ta = p.name_ta ?? p.name; p.name = titleCase(m.e.name); }
      if (layer === "hospitals") p.kind = m.e.kind ?? kindByName(p.name, p.kind);
      kept.push(f);
      taken.set(m.e.id, f);
      continue;
    }
    // a fire station with no name, in the neighbourhood an official station is named after
    if (layer === "fire_stations" && !p.name && entries.length && places.length) {
      const near = places.filter((x) => x.properties.name && haversineM(f.geometry.coordinates, x.geometry.coordinates) <= 1500);
      const hits = entries.filter((e) => !taken.has(e.id) && near.some((x) => nameScore(e.place ?? e.name, x.properties.name) >= 0.75));
      if (hits.length === 1) {
        p.name = hits[0].name; p.verified = "official"; p.named_from = "the TNFRS list, by the neighbourhood it stands in";
        p.official = { src: hits[0].src ?? official.source?.id ?? null, id: hits[0].id, name: hits[0].name };
        kept.push(f); taken.set(hits[0].id, f);
        continue;
      }
    }
    // a fire station is plain from its tag (amenity=fire_station: nothing else is tagged so), so one with no name stays, as an unnamed station,
    // unless it is a second point of a station already kept (checked below)
    if (layer === "fire_stations" && !p.name) { p.verified = "tag"; kept.push(f); continue; }
    const j = ai.get(`${layer}|${p.id}`);
    const v = r.v === "unsure" && j ? j : r;
    if (v.v === "drop") { dropped.push(drop(f, v.why, j && r.v === "unsure" ? "ai" : "rule")); continue; }
    if (v.v === "unsure") { unjudged.push(f); continue; }
    p.verified = "name";
    p.verified_by = j && r.v === "unsure" ? "ai" : "rule";
    if (layer === "hospitals") p.kind = (j && j.kind) || kindByName(p.name, p.kind);
    kept.push(f);
  }
  // an unnamed point within 400 m of a named one of the layer is that station drawn twice
  for (let i = kept.length - 1; i >= 0; i--) {
    const f = kept[i];
    if (f.properties.verified !== "tag") continue;
    const twin = kept.find((g) => g !== f && g.properties.name && haversineM(g.geometry.coordinates, f.geometry.coordinates) <= 400);
    if (twin) { kept.splice(i, 1); dropped.push(drop(f, `a second map point of ${twin.properties.name}`)); }
  }
  // an official place with no map point of its own: counted and named in meta.json, never drawn (only those the list puts in Chennai district)
  const unmapped = entries.filter((e) => !taken.has(e.id) && (e.lat == null || e.lon == null) && (e.district == null || districtOf(e.district) === "chennai")).map((e) => e.name);
  return { kept, dropped, unjudged, unmapped, matched: taken.size };
}
const drop = (f, why, by = "rule") => ({ ...f, properties: { ...f.properties, dropped: why, dropped_by: by } });
/** "CHS CHINTADRIPET" reads "Chs Chintadripet"; a name already in mixed case is left as written */
const titleCase = (s) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s);
function stripOfficial(p) {
  const { verified, verified_by, official, named_from, matched_by, dropped, dropped_by, ...rest } = p;
  void verified; void verified_by; void official; void named_from; void matched_by; void dropped; void dropped_by;
  return { ...rest };
}
/** hospital, clinic or health centre by the name, when the OSM tag disagrees with it ("XYZ Dental Clinic" tagged a hospital) */
export function kindByName(name, kind) {
  const n = String(name ?? "");
  if (HEALTH_CENTRE.test(n)) return "health_centre";
  if (/\b(hospital|hospitals|nursing home|medical college|maternity home)\b/i.test(n)) return "hospital";
  if (HOSPITAL_KIND.test(n)) return "clinic";
  return kind;
}

// ------------------------------------------------------------- rail, metro --

const NOT_PASSENGER = /\b(berth|jetty|wharf|siding yard|goods|yard|loco shed|shed|cabin|depot|bus|terminus|terminal bus|mtc)\b/i;
const bare = (s) => String(s ?? "").replace(/\b(metro|mrts|railway station|station|junction|jn)\b/gi, " ");

/**
 * The rail and metro stations, checked against the operators' own timetables (CMRL and Southern Railway suburban GTFS, data/layers/transit.json)
 * and, for what opened after those timetables were cut (CMRL's calendar ends in 2021), the openings in `opened` (data/layers/official/
 * rail_metro.opened.json: each station with the report it is taken from).
 *   - a timetable station: kept at the operator's point, named as the operator names it, with the Tamil name and other names of the
 *     OpenStreetMap station it matches within 400 m (`verified` "official"); one OSM has not mapped is added from the timetable;
 *   - an OSM metro station not in the timetable: kept only when it is on a reported opening (`verified` "reported"), else dropped as one still
 *     being built;
 *   - an OSM railway station not in the suburban timetable (Chennai Central, the long-distance and MRTS stations): kept on its name, unless the
 *     name says it is no passenger station (a berth, jetty, siding or depot) or `opened.no_halt` says trains do not stop there;
 *   - bus stations and stands tagged as stations go (they are on the bus stations layer), and a second point within 300 m of a kept station.
 */
export function railMetro(gtfs, osm, wardAt, opened = { stations: [], no_halt: [] }) {
  const r5 = (v) => Math.round(v * 1e5) / 1e5;
  const used = new Set();
  const kept = [], dropped = [];
  for (const s of gtfs.stations) {
    const c = [s.lon, s.lat];
    const want = s.kind === "metro" ? "metro" : "rail";
    const cand = osm.filter((f) => !used.has(f.properties.id) && haversineM(c, f.geometry.coordinates) <= 400 && (f.properties.kind === want || f.properties.kind === "station" || (want === "rail" && f.properties.kind === "metro" && /suburban|mrts|railway/i.test(f.properties.name ?? ""))))
      .map((f) => ({ f, s: nameScore(bare(s.name), bare(f.properties.name)), d: haversineM(c, f.geometry.coordinates) }))
      .sort((a, b) => b.s - a.s || a.d - b.d);
    const o = cand[0] && (cand[0].s >= 0.5 || cand[0].d <= 150) ? cand[0].f : null;
    if (o) used.add(o.properties.id);
    const ward = wardAt(s.lon, s.lat);
    const alt = [...new Set([o?.properties.name, ...(o?.properties.alt ?? [])].filter((x) => x && x !== s.name))];
    kept.push({ type: "Feature", geometry: { type: "Point", coordinates: [r5(s.lon), r5(s.lat)] },
      properties: { id: s.id, name: s.name, name_ta: o?.properties.name_ta ?? null, alt: alt.length ? alt : undefined, kind: want,
        lines: s.lines, ward, in_district: ward != null, verified: "official", official: { src: s.id.startsWith("cmrl:") ? "cmrl-gtfs" : "sr-suburban-gtfs", id: s.id, name: s.name },
        osm: o?.properties.id ?? undefined } });
  }
  // a second point of a kept station: within 120 m, or within 300 m under a like name (Chennai Central and the Moore Market suburban terminal,
  // 250 m apart, are two stations)
  const near = (f, kind) => kept.find((k) => k.properties.kind === kind && (() => { const d = haversineM(k.geometry.coordinates, f.geometry.coordinates);
    return d <= 120 || (d <= 300 && [k.properties.name, ...(k.properties.alt ?? [])].some((n) => nameScore(bare(n), bare(f.properties.name)) >= 0.5)); })());
  const openedHit = (f) => (opened.stations ?? []).find((o) => o.kind === f.properties.kind && [f.properties.name, ...(f.properties.alt ?? [])].some((n) => nameScore(bare(n), bare(o.name)) >= 0.75));
  for (const f0 of osm) {
    if (used.has(f0.properties.id)) continue;
    const f = { ...f0, properties: stripOfficial(f0.properties) };
    const p = f.properties;
    // a suburban terminal tagged with the metro's network is a railway station
    if (p.kind === "metro" && /\b(suburban|mrts|railway)\b/i.test(p.name ?? "") && !/\bmetro\b/i.test(p.name ?? "")) p.kind = "rail";
    const k = p.kind;
    if (k === "bus") { dropped.push(drop(f, "a bus station (it is on the bus stations layer)")); continue; }
    if (k !== "metro" && k !== "rail") { dropped.push(drop(f, "not a rail or metro station (a bus terminus, jetty or other station)")); continue; }
    if (!p.name) { dropped.push(drop(f, "no name: it cannot be checked against the timetables")); continue; }
    const twin = near(f, k);
    if (twin) { dropped.push(drop(f, `a second map point of ${twin.properties.name}`)); continue; }
    if (NOT_PASSENGER.test(p.name)) { dropped.push(drop(f, "not a passenger station (a berth, siding, depot or bus terminus)")); continue; }
    if ((opened.no_halt ?? []).some((o) => nameScore(bare(p.name), bare(o.name)) >= 0.75)) { dropped.push(drop(f, "trains do not stop here (see the source in rail_metro.opened.json)")); continue; }
    if (k === "metro") {
      const o = openedHit(f);
      if (!o) { dropped.push(drop(f, "a metro station not yet open (CMRL Phase 2: not in the timetable nor in an opening reported by 28 Nov 2026)")); continue; }
      p.verified = "reported"; p.official = { src: o.src, id: null, name: o.name };
    } else { p.verified = "name"; p.verified_by = "rule"; }
    kept.push(f);
    used.add(p.id);
  }
  return { kept, dropped };
}
/** @deprecated the timetables alone (kept for scripts that still call it): railMetro with no openings */
export const railFromGtfs = (gtfs, osm, wardAt) => railMetro(gtfs, osm, wardAt);
