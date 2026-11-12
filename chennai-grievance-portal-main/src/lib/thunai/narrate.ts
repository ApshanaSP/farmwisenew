/**
 * Explaining one issue the way a person would: code builds a fact sheet from the record (what kind of problem, where, how long,
 * how stuck, how many people, who holds it, what to do), then a short retelling in plain words, answer first:
 *   what is wrong, and where -> how long it has been stuck -> why it matters -> what I would do next.
 * Every figure comes from the fact sheet (and is on the Stage); no line repeats the record's own wording (speechcheck.ts).
 */
import type { Bilingual, CaseRowT } from "./stage";
import { speechProblem } from "./speechcheck";

export interface FactSheet {
  /** a plain noun phrase for the problem ("standing water"), or null */
  what: { en: string; ta: string } | null;
  place: string | null;
  placeTa: string | null;
  /** hours open, if known */
  hours: number | null;
  overdue: boolean;
  serious: boolean;
  complaints: number;
  /** who holds it, in plain words */
  who: { en: string; ta: string } | null;
  /** the next step, in plain words, from code */
  next: { en: string; ta: string } | null;
  /** how it was closed; null while it is open */
  closed: ClosedAs | null;
}

export type ClosedAs = "resolved" | "rejected" | "lapsed" | "closed";

/** How an incident was closed, from its status and open flag (decisions already laid on); null while it is open. */
export function closedAs(status: unknown, open?: unknown): ClosedAs | null {
  const s = String(status ?? "").toLowerCase();
  if (/resolved|closed|done/.test(s)) return "resolved";
  if (/rejected/.test(s)) return "rejected";
  if (/lapsed/.test(s)) return "lapsed";
  return open != null && Number(open) === 0 ? "closed" : null;
}

/** What is left to say about a closed case: nothing to chase, or (a lapse has no fix on record) a check worth making. */
const CLOSED: Record<ClosedAs, { en: string; ta: string }> = {
  resolved: { en: "It's marked resolved, so there's nothing to chase unless it comes back.", ta: "இது தீர்க்கப்பட்டதாகப் பதிவாகியுள்ளது; மீண்டும் வந்தால் மட்டும் பார்த்தால் போதும்." },
  rejected: { en: "It was rejected and closed, so no work is pending on it.", ta: "இது நிராகரிக்கப்பட்டு முடிக்கப்பட்டது; இதில் நிலுவை வேலை எதுவும் இல்லை." },
  lapsed: { en: "It lapsed without being marked fixed, so it's worth checking whether the problem is still there.", ta: "சரிசெய்யப்பட்ட பதிவு இல்லாமல் இது காலாவதியானது; பிரச்சினை இன்னும் இருக்கிறதா என்று பார்ப்பது நல்லது." },
  closed: { en: "It's closed, so there's nothing to chase unless it comes back.", ta: "இது முடிக்கப்பட்டது; மீண்டும் வந்தால் மட்டும் பார்த்தால் போதும்." }
};

/**
 * Every category the store holds, by its code and its label: named no more strongly than the category itself says, so an unsafe wall
 * is not "a structure that has given way" (BUG-033). null: the category says nothing, so the issue goes unnamed.
 */
const KINDS: [string, string, string | null, string | null][] = [
  ["SOLID_WASTE", "Garbage & solid waste", "uncleared garbage", "அகற்றப்படாத குப்பை"],
  ["CRIME_PROPERTY", "Theft, snatching & fraud", "a crime report", "குற்றப் புகார்"],
  ["STREETLIGHT_ELECTRICAL", "Street lights & electrical hazards", "a street light or electrical problem", "தெருவிளக்கு அல்லது மின் பிரச்சினை"],
  ["ROAD_ACCIDENT", "Road accident", "a road accident", "சாலை விபத்து"],
  ["FLOOD_WATERLOGGING", "Flooding & waterlogging", "standing water", "தண்ணீர் தேக்கம்"],
  ["DRAINAGE_SEWAGE", "Drainage & sewage", "a drainage or sewage problem", "வடிகால் அல்லது கழிவுநீர் பிரச்சினை"],
  ["ROAD_DAMAGE", "Roads, footpaths & bridges", "a damaged road", "சேதமான சாலை"],
  ["PUBLIC_ORDER", "Protests & public nuisance", "a protest or public nuisance", "போராட்டம் அல்லது பொதுத் தொல்லை"],
  ["TRAFFIC_OBSTRUCTION", "Traffic obstruction & parking", "a traffic blockage", "போக்குவரத்து நெரிசல்"],
  ["CRIME_VIOLENT", "Violent crime", "a crime report", "குற்றப் புகார்"],
  ["SANITATION_TOILETS", "Public toilets & open defecation", "a public toilet or open defecation problem", "பொதுக் கழிப்பறை அல்லது திறந்தவெளி மலம் கழிப்புப் பிரச்சினை"],
  ["ADMIN_SERVICES", "Tax, certificates & electoral services", "a tax, certificate or election service problem", "வரி, சான்றிதழ் அல்லது தேர்தல் சேவைப் பிரச்சினை"],
  ["ENCROACHMENT", "Encroachment & unauthorised construction", "an encroachment or unauthorised construction", "ஆக்கிரமிப்பு அல்லது அனுமதியற்ற கட்டுமானம்"],
  ["DRAIN_WORKS_SAFETY", "Drain works site safety", "a safety problem at a drain worksite", "வடிகால் பணியிடத்தில் பாதுகாப்புப் பிரச்சினை"],
  ["OTHER", "Other / unclassified", null, null],
  ["TREES_PARKS", "Trees, parks & playgrounds", "a tree or park problem", "மரம் அல்லது பூங்கா பிரச்சினை"],
  ["MISSING_PERSON", "Missing person", "a missing person report", "காணாமல் போனவர் புகார்"],
  ["VECTOR_DISEASE", "Vector- & water-borne disease", "a mosquito or water-borne disease problem", "கொசு அல்லது நீர்வழி நோய்ப் பிரச்சினை"],
  ["CRIMES_AGAINST_WOMEN", "Crimes against women & children", "a crime report", "குற்றப் புகார்"],
  ["BUILDING_SAFETY", "Unsafe buildings & walls", "an unsafe building or wall", "பாதுகாப்பற்ற கட்டடம் அல்லது சுவர்"],
  ["STRAY_ANIMALS", "Stray animals", "a stray animal problem", "தெரு விலங்குகள் பிரச்சினை"],
  ["DARK_SPOT_SAFETY", "Dark spots & public safety", "a dark spot or public safety problem", "இருண்ட பகுதி அல்லது பொதுப் பாதுகாப்புப் பிரச்சினை"],
  ["DRUGS_LIQUOR", "Drugs & illicit liquor", "a drugs or illicit liquor report", "போதைப்பொருள் அல்லது கள்ளச்சாராயப் புகார்"],
  ["HEALTH_SERVICES", "Health services & hospital capacity", "a hospital or health service problem", "மருத்துவமனை அல்லது சுகாதாரச் சேவைப் பிரச்சினை"],
  ["PUBLIC_WORKS", "Public works quality & worksites", "a public works or worksite problem", "பொதுப்பணி அல்லது பணியிடப் பிரச்சினை"],
  ["FOOD_SAFETY", "Food safety & meat hygiene", "a food safety problem", "உணவுப் பாதுகாப்புப் பிரச்சினை"],
  ["WATERBODY_INFRA", "Lakes, bunds & sluices", "a lake or bund problem", "ஏரி அல்லது கரைப் பிரச்சினை"],
  ["FLOOD_RELIEF", "Flood relief needs", "people who need flood relief", "வெள்ள நிவாரணம் தேவைப்படுவோர்"],
  ["AIR_POLLUTION", "Air pollution", "bad air", "காற்று மாசு"],
  ["FLOOD_RISK_SIGNAL", "Weather & flood warnings", "a weather or flood warning", "வானிலை அல்லது வெள்ள எச்சரிக்கை"],
  ["POLICE_OTHER", "Other police matters", "a police matter", "காவல் துறை விவகாரம்"],
  ["CIVIC_FACILITIES", "Civic buildings & facilities", "a problem at a civic building", "பொதுக் கட்டடத்தில் பிரச்சினை"],
  ["WATER_SUPPLY", "Drinking water supply", "a drinking-water problem", "குடிநீர்ப் பிரச்சினை"],
  ["FIRE_EXPLOSION", "Fire & explosion", "a fire", "தீ விபத்து"],
  ["SUICIDE_SELF_HARM", "Suicide & self-harm", "a self-harm report", "தற்கொலை தொடர்பான புகார்"]
];
/**
 * The Tamil of every category LABEL (the noun phrase a screen's title or scope shows, not the sentence about one issue above). Complete reference data: the codes
 * and English labels are the store's category table (KINDS above); a test fails if a category has no line here (QA pass 4, RC-15).
 */
export const CAT_LABEL_TA: Record<string, string> = {
  SOLID_WASTE: "குப்பை மற்றும் திடக்கழிவு", CRIME_PROPERTY: "திருட்டு, பறிப்பு மற்றும் மோசடி", STREETLIGHT_ELECTRICAL: "தெருவிளக்கு மற்றும் மின் ஆபத்துகள்", ROAD_ACCIDENT: "சாலை விபத்து",
  FLOOD_WATERLOGGING: "வெள்ளம் மற்றும் நீர்த்தேக்கம்", DRAINAGE_SEWAGE: "வடிகால் மற்றும் கழிவுநீர்", ROAD_DAMAGE: "சாலைகள், நடைபாதைகள் மற்றும் பாலங்கள்",
  PUBLIC_ORDER: "போராட்டங்கள் மற்றும் பொதுத் தொல்லை", TRAFFIC_OBSTRUCTION: "போக்குவரத்துத் தடை மற்றும் வாகன நிறுத்தம்", CRIME_VIOLENT: "வன்முறைக் குற்றம்",
  SANITATION_TOILETS: "பொதுக் கழிப்பறைகள் மற்றும் திறந்தவெளி மலம் கழித்தல்", ADMIN_SERVICES: "வரி, சான்றிதழ் மற்றும் தேர்தல் சேவைகள்", ENCROACHMENT: "ஆக்கிரமிப்பு மற்றும் அனுமதியற்ற கட்டுமானம்",
  DRAIN_WORKS_SAFETY: "வடிகால் பணியிடப் பாதுகாப்பு", OTHER: "பிற / வகைப்படுத்தப்படாதவை", TREES_PARKS: "மரங்கள், பூங்காக்கள் மற்றும் விளையாட்டு மைதானங்கள்", MISSING_PERSON: "காணாமல் போனவர்",
  VECTOR_DISEASE: "கொசு மற்றும் நீர்வழி நோய்கள்", CRIMES_AGAINST_WOMEN: "பெண்கள் மற்றும் குழந்தைகளுக்கு எதிரான குற்றங்கள்", BUILDING_SAFETY: "பாதுகாப்பற்ற கட்டடங்கள் மற்றும் சுவர்கள்",
  STRAY_ANIMALS: "தெரு விலங்குகள்", DARK_SPOT_SAFETY: "இருண்ட இடங்கள் மற்றும் பொதுப் பாதுகாப்பு", DRUGS_LIQUOR: "போதைப்பொருள் மற்றும் கள்ளச்சாராயம்",
  HEALTH_SERVICES: "சுகாதாரச் சேவைகள் மற்றும் மருத்துவமனைத் திறன்", PUBLIC_WORKS: "பொதுப்பணித் தரம் மற்றும் பணியிடங்கள்", FOOD_SAFETY: "உணவுப் பாதுகாப்பு மற்றும் இறைச்சி சுகாதாரம்",
  WATERBODY_INFRA: "ஏரிகள், கரைகள் மற்றும் மதகுகள்", FLOOD_RELIEF: "வெள்ள நிவாரணத் தேவைகள்", AIR_POLLUTION: "காற்று மாசு", FLOOD_RISK_SIGNAL: "வானிலை மற்றும் வெள்ள எச்சரிக்கைகள்",
  POLICE_OTHER: "பிற காவல்துறை விவகாரங்கள்", CIVIC_FACILITIES: "பொதுக் கட்டடங்கள் மற்றும் வசதிகள்", WATER_SUPPLY: "குடிநீர் விநியோகம்", FIRE_EXPLOSION: "தீ மற்றும் வெடிப்பு",
  SUICIDE_SELF_HARM: "தற்கொலை மற்றும் தன்னைத்தானே காயப்படுத்துதல்"
};

/** the Tamil of a category given its English label (a case row carries the label, not the code); null when it is not one of the store's */
export const catTaOfLabel = (label: string | null | undefined): string | null => {
  const k = KINDS.find(([, l]) => l.toLowerCase() === String(label ?? "").toLowerCase());
  return k ? CAT_LABEL_TA[k[0]] ?? null : null;
};

/** the store's category codes and labels, for the lanes that have no World to ask (catlabels.ts) */
export const CATEGORY_LABELS: { code: string; label: string }[] = KINDS.map(([code, label]) => ({ code, label }));
const BY_KIND = new Map<string, { en: string; ta: string } | null>(KINDS.flatMap(([code, label, en, ta]) => {
  const v = en && ta ? { en, ta } : null;
  return [[code.toLowerCase(), v], [label.toLowerCase(), v]] as [string, { en: string; ta: string } | null][];
}));

/** For a record with no known category: whole words only ("street" holds no tree, "wallet" no wall, "broad" no road), the specific before the general (BUG-023, BUG-033). */
const PLAIN: [RegExp, string, string][] = [
  [/accident/i, "a road accident", "சாலை விபத்து"],
  [/\brelief\b/i, "people who need flood relief", "வெள்ள நிவாரணம் தேவைப்படுவோர்"],
  [/\bflood\w*\b.*\b(risk|signal|warning|alert)|\b(risk|signal|warning|alert)\b.*\bflood|\b(cyclone|rain)\b.*\b(warning|alert)/i, "a flood warning", "வெள்ள எச்சரிக்கை"],
  [/flood|waterlog|inundat|stagnat/i, "standing water", "தண்ணீர் தேக்கம்"],
  [/\bdrains?\b|\bdrainage\b|sewage|sewer/i, "a drainage or sewage problem", "வடிகால் அல்லது கழிவுநீர் பிரச்சினை"],
  [/\b(fallen|uprooted)\b.*\btrees?\b|\btrees?\b.*\b(fell|fallen|uprooted)\b/i, "a fallen tree", "விழுந்த மரம்"],
  [/pothole|road damage|damaged road|broken road/i, "a damaged road", "சேதமான சாலை"],
  [/garbage|\bwaste\b|sanitat|debris/i, "uncleared garbage", "அகற்றப்படாத குப்பை"],
  [/\bstreet ?lights?\b|\belectrical\b/i, "a street light or electrical problem", "தெருவிளக்கு அல்லது மின் பிரச்சினை"],
  [/vector|dengue|mosquito|malaria|\bfever\b/i, "a mosquito and fever problem", "கொசு, காய்ச்சல் பிரச்சினை"],
  [/hospital.*\b(beds?|capacity|critical|strain)\b|\bbeds?\b.*\b(critical|full|short)\b|health service/i, "a hospital under strain", "நெருக்கடியில் உள்ள மருத்துவமனை"],
  [/\bfires?\b|explosion/i, "a fire", "தீ விபத்து"],
  [/water supply|drinking water/i, "a drinking-water problem", "குடிநீர்ப் பிரச்சினை"],
  [/traffic|parking/i, "a traffic blockage", "போக்குவரத்து நெரிசல்"],
  [/\bcollaps|\bcaved in\b/i, "a structure that has given way", "இடிந்த கட்டமைப்பு"],
  [/\bwalls?\b|\bbuildings?\b/i, "an unsafe building or wall", "பாதுகாப்பற்ற கட்டடம் அல்லது சுவர்"],
  [/\bcrime\b|theft|snatch|assault|murder/i, "a crime report", "குற்றப் புகார்"],
  [/\bair (quality|pollution)\b|pollution|\bsmoke\b|\baqi\b/i, "bad air", "காற்று மாசு"]
];

/** The problem in plain words: from its category when the store knows it, else from whatever its record says of itself. */
export function plainWhat(cat: string | null, label: string | null): { en: string; ta: string } | null {
  const known = cat ? BY_KIND.get(cat.trim().toLowerCase()) : undefined;
  if (known !== undefined) return known;
  for (const src of [cat, label]) {
    if (!src) continue;
    const hit = PLAIN.find(([re]) => re.test(src));
    if (hit) return { en: hit[1], ta: hit[2] };
  }
  return null;
}

/** Who holds it, as people say it ("the corporation's drains team", "the police", "Metrowater"). */
export function plainWho(code: string | null, name: string | null): { en: string; ta: string } | null {
  if (!code && !name) return null;
  const c = code ?? "";
  if (c.startsWith("POL")) return { en: "the police", ta: "காவல்துறை" };
  if (c === "CMWSSB") return { en: "Metrowater", ta: "குடிநீர் வாரியம்" };
  if (c.startsWith("PWD")) return { en: "the PWD", ta: "பொதுப்பணித்துறை" };
  if (c === "TANGEDCO") return { en: "the electricity board", ta: "மின் வாரியம்" };
  if (c === "HLT-DMS") return { en: "the health department", ta: "சுகாதாரத் துறை" };
  if (c === "GCC-SWD") return { en: "the corporation's drains team", ta: "மாநகராட்சியின் மழைநீர் வடிகால் பிரிவு" };
  if (c === "GCC-SWM") return { en: "the corporation's conservancy team", ta: "மாநகராட்சியின் துப்புரவுப் பிரிவு" };
  if (c.startsWith("GCC")) return { en: "the corporation", ta: "மாநகராட்சி" };
  return name ? { en: name, ta: name } : null;
}

/** "about four days", never a figure: the voice says time in words. */
export function ageWords(hours: number | null): { en: string; ta: string } | null {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return null;
  if (hours < 3) return { en: "a couple of hours", ta: "இரண்டு மணி நேரமாக" };
  if (hours < 20) return { en: "several hours", ta: "சில மணி நேரமாக" };
  if (hours < 36) return { en: "about a day", ta: "ஏறக்குறைய ஒரு நாளாக" };
  if (hours < 72) return { en: "a couple of days", ta: "இரண்டு நாட்களாக" };
  if (hours < 24 * 6) return { en: "several days", ta: "பல நாட்களாக" };
  if (hours < 24 * 10) return { en: "about a week", ta: "ஏறக்குறைய ஒரு வாரமாக" };
  if (hours < 24 * 21) return { en: "a couple of weeks", ta: "இரண்டு வாரங்களாக" };
  return { en: "well over three weeks", ta: "மூன்று வாரங்களுக்கும் மேலாக" };
}

/** "6 hours", "4 days", "2 weeks" as the store writes open_for, in hours. */
export function hoursOf(openFor: unknown): number | null {
  const m = String(openFor ?? "").match(/(\d+(?:\.\d+)?)\s*(minute|min|hour|hr|h|day|d|week|wk|month)/i);
  if (!m) return null;
  const n = Number(m[1]), u = m[2].toLowerCase();
  return u.startsWith("min") ? n / 60 : u.startsWith("h") ? n : u.startsWith("d") ? n * 24 : u.startsWith("w") ? n * 168 : n * 720;
}

export function factSheet(row: CaseRowT, extra: { openFor?: unknown; firstAt?: string | null; now?: number; next?: { en: string; ta: string } | null; placeTa?: string | null; open?: unknown } = {}): FactSheet {
  let hours = hoursOf(extra.openFor);
  if (hours == null && extra.firstAt) {
    const m = String(extra.firstAt).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (m) hours = ((extra.now ?? Date.now()) - Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]) - 5, Number(m[5]) - 30)) / 3_600_000;
  }
  return {
    what: plainWhat(row.cat, row.why ?? row.title), place: row.place ?? row.zoneName ?? null, placeTa: extra.placeTa ?? row.zoneName ?? row.place ?? null,
    hours, overdue: row.overdue, serious: row.sev === "Severe" || row.sev === "High", complaints: row.complaints, who: plainWho(row.dept, row.deptName), next: extra.next ?? null, closed: closedAs(row.status, extra.open)
  };
}

/** "to X" in Tamil, joined as the word ends: துறை -> துறையிடம், மாநகராட்சி -> மாநகராட்சியிடம், வாரியம் -> வாரியத்திடம், பிரிவு -> பிரிவிடம் */
export function idam(word: string): string {
  // a name with no Tamil in it ("Pollution Control Board") takes the ending after a hyphen: glued on, it reads as one broken word (BUG-019, AUD-NF-7)
  if (/[A-Za-z0-9)]$/.test(word)) return `${word}-இடம்`;
  if (/[ைிீ]$/.test(word)) return `${word}யிடம்`;
  if (/ம்$/.test(word)) return `${word.slice(0, -2)}த்திடம்`;
  if (/ு$/.test(word)) return `${word.slice(0, -1)}ிடம்`;
  if (/்$/.test(word)) return `${word.slice(0, -1)}ிடம்`;
  return `${word}இடம்`;
}

const article = (s: string) => (/^(a|an|the|uncleared|standing|street|bad|people)\b/i.test(s) ? s : `${/^[aeiou]/i.test(s) ? "an" : "a"} ${s}`);

/** The retelling, in two to four short sentences. `label` is the record's own short name, used only when the kind is unknown. */
export function explainIssue(f: FactSheet, label: string, sources: string[] = []): Bilingual {
  const what = f.what ? article(f.what.en) : "an issue";
  // a closed case is told as closed: not how long it has been open, or what to ask anyone to do about it (BUG-031)
  if (f.closed) {
    const said = CLOSED[f.closed];
    const was = /^people\b/.test(what) ? "There were" : "There was";
    const first = `${was} ${what}${f.place ? ` at ${f.place}` : ""}${f.what ? "" : `, logged as ${label.toLowerCase()}`}.`;
    const plain = `${was} ${what}${f.place ? ` at ${f.place}` : ""}.`;
    const ta = `${f.placeTa ? `${f.placeTa} பகுதியில் ` : ""}${f.what ? f.what.ta : "ஒரு பிரச்சினை"} இருந்தது. ${said.ta}`;
    const en = `${first} ${said.en}`;
    return { en: speechProblem(en, sources, [f.place ?? "", f.placeTa ?? ""]) ? `${plain} ${said.en}` : en, ta };
  }
  // a plural kind ("people who need flood relief") takes "There are" (audit-understanding-20)
  const there = /^people\b/.test(what) ? "There are" : "There's";
  const s1 = `${there} ${what}${f.place ? ` at ${f.place}` : ""}${f.what ? "" : `, logged as ${label.toLowerCase()}`}.`;
  const age = ageWords(f.hours);
  const s2 = age ? `It's been open for ${age.en}${f.overdue ? ", and it's past its deadline" : ""}.` : f.overdue ? "It's past its deadline." : "";
  // how many are affected is said by how many complained: two complaints are not "a lot of residents" (AUD-NF-11)
  const reach = f.complaints >= 10 ? { en: "a lot of residents", ta: "நிறைய பேரைப் பாதிக்கிறது" } : f.complaints >= 3 ? { en: "several households", ta: "பல குடும்பங்களைப் பாதிக்கிறது" } : { en: "more than one household", ta: "ஒன்றுக்கு மேற்பட்ட குடும்பங்களைப் பாதிக்கிறது" };
  const s3 = f.complaints >= 2 ? `${f.complaints} people have complained about it, so it's hitting ${reach.en}${f.serious ? ", and it's one of the serious ones" : ""}.`
    : f.serious ? "It's one of the serious ones." : "";
  const s4 = f.next ? `I'd ${f.next.en}${f.overdue ? " today" : ""}.` : f.who ? `I'd ask ${f.who.en} for an update${f.overdue ? " today" : ""}.` : "";
  const en = [s1, s2, s3, s4].filter(Boolean).join(" ");
  const whatTa = f.what ? f.what.ta : "ஒரு பிரச்சினை";
  const t1 = `${f.placeTa ? `${f.placeTa} பகுதியில் ` : ""}${whatTa} இருக்கிறது.`;
  const t2 = age ? `${age.ta} தீர்க்கப்படாமல் இருக்கிறது${f.overdue ? ", கெடுவும் தாண்டிவிட்டது" : ""}.` : f.overdue ? "கெடு தாண்டிவிட்டது." : "";
  const t3 = f.complaints >= 2 ? `${f.complaints} பேர் புகார் கொடுத்திருக்கிறார்கள், ${reach.ta}${f.serious ? "; இது கடுமையானவற்றில் ஒன்று" : ""}.` : f.serious ? "இது கடுமையானவற்றில் ஒன்று." : "";
  const t4 = f.next ? `${f.next.ta}${f.overdue ? ", இன்றே" : ""}.` : f.who ? `${idam(f.who.ta)} ${f.overdue ? "இன்றே " : ""}நிலவரம் கேட்கலாம்.` : "";
  const ta = [t1, t2, t3, t4].filter(Boolean).join(" ");
  // the gates: a line that reads a record out, or carries a field, falls back to the plainest retelling
  const names = [f.place ?? "", f.placeTa ?? ""];
  if (speechProblem(en, sources, names)) return { en: [`${there} ${what}${f.place ? ` at ${f.place}` : ""}.`, s2, s4].filter(Boolean).join(" "), ta };
  return { en, ta };
}
