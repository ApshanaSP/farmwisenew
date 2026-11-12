/**
 * The "came before" check: has this person written before, and have others written about the same thing? Run before filing, so the staff
 * can add a petition to the case that already exists instead of opening another one.
 */
import { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { RESOLVED_STATUSES } from "@/lib/constants";
import { manuDeptLabel, type RepeatMatch, type Repeats } from "./constants";
import { asciiDigits, maskAadhaar, similarity, squash, tenDigits } from "./clean";
import { grievanceCategory } from "./grade";
import { DEPT_CONFIG } from "@/lib/officer/departments";

/** `category`: the kind of problem (the unified category codes: the reader's for a petition, the complaint type's for an online one). */
export interface Candidate { mobile: string | null; name: string | null; street: string | null; ward: number | null; dept: string | null; problem: string | null; category?: string | null; excludeId?: number }
export interface Earlier {
  code: string; incidentId: string | null; filedAt: string; status: string; problem: string; dept: string | null;
  mobile: string | null; name: string | null; address: string | null; ward: number | null; reporterKind: "petition" | "online"; category?: string | null;
}

const STOP = new Set("the a an of in on at to for from and or is are was were not has have had no my our her his their this that with by be been it its days day week weeks month months year years street area near problem issue since still now more over very after before about".split(" "));
// letters of any script: Tamil was stripped to nothing by [^a-z0-9], so a problem written in Tamil never shared a topic (QA pass 6, P5-030)
// Tamil and Tanglish filler that says nothing about the problem: "our street", "in our area", "for days", "please act" (one shared filler word
// made two different problems "the same problem" for one writer: P6-011)
const TA_STOP = new Set(("எங்கள் எங்களது எங்க நாங்கள் எனது என் எங்களுக்கு தெரு தெருவில் தெருவின் பகுதி பகுதியில் பகுதியின் அருகில் அருகே உள்ள உள்ளது இந்த அந்த ஒரு மற்றும் " +
  "மிகவும் இல்லை வீடு வீட்டு வீட்டில் வீடுகள் கடந்த நாட்களாக மாதமாக வாரமாக வருடமாக நாள் நாட்கள் இருந்து மீது பற்றி தயவு செய்து செய்ய வேண்டும் வேண்டுகிறேன் " +
  "கோரிக்கை மனு ஐயா அவர்களே உடனடியாக நடவடிக்கை எடுக்க பிரச்சனை புகார் சரி இங்கு அங்கு மிக " +
  "engal enga engaluku theru therula therulla area pakkathula romba illa illai vendum seyya seyyunga pannunga ayya sir naal naalaa maasama").split(" "));
// predicates, number words and requests that any problem can share: "not working", "not coming", "two days", "please take action" (one of them
// made two different problems from one writer "the same problem", with an attach offered: reviewer 3 on P6-011, P6-020)
const FILLER = new Set(("please kindly take action immediately immediate urgent urgently working work functioning coming come required request requested " +
  "need needed sir madam again repeatedly cleared clear repaired repair fixed attended done one two three four five six seven eight nine ten " +
  "first second third many several வரவில்லை வருவதில்லை வரவே இரண்டு மூன்று நான்கு ஐந்து எங்களுடைய எங்களின் வார்டில் வார்டு வார்டின் " +
  "செய்யவில்லை எடுக்கவில்லை சரிசெய்ய சரிசெய்யவில்லை வேலை செய்யவில்லை தயவுசெய்து " +
  "rendu moonu naalu anju naala naalaa varala varalai varalae podunga edunga pannunga panunga seyyala seiyala irukku").split(" "));
// how long and how often (a closed class): "for a long time", "the last one week", "not yet", "many times" are shared by any two problems
const DURATION = new Set(("time times long last past yet ago today yesterday tomorrow daily always often everyday hour hours minute minutes night nights whole entire " +
  "continuous frequent " +
  "நீண்ட முறை பலமுறை தினமும் எப்போதும் இரவு இரவில் பகல் வருடம் மாதம் வாரம் நேரம் " +
  "thadava thadavai vaaram maasam varusham neram").split(" "));
// where, not what (a closed class): the landmark two different problems of one street share ("near the Ganesh temple", "opposite the school")
const PLACE = new Set(("temple kovil koil church mosque masjid school college hospital market station junction signal colony nagar layout stop stand opposite " +
  "behind beside front corner main cross lane avenue extension office " +
  "கோயில் கோவில் பள்ளி பள்ளிக்கூடம் மருத்துவமனை சந்தை நிலையம் சந்திப்பு நகர் காலனி எதிரில் எதிரே பின்புறம் முன்பு அலுவலகம்").split(" "));
// words for "a problem" that any problem is ("menace", "nuisance", "no response"): a closed class
const GENERIC = new Set("menace nuisance trouble hazard danger shortage response reply complaint complaints ஆபத்து தொல்லை".split(" "));

/**
 * Words that say what is wrong with a thing, not what the thing is: predicates and state words. One writer's two different problems share
 * them all the time ("Patta transfer pending" / "Building plan approval pending", "தெரு விளக்கு இயங்கவில்லை" / "குடிநீர் மோட்டார் இயங்கவில்லை",
 * "Thanni varla" / "Current varla"), so they never name a topic (QA pass 6, reviewer5-07). The FILLER list could not keep up with them
 * (P6-011 and P6-020 each added words, and the next reviewer found more): the open classes are read by their endings, and only closed ones
 * are listed (English irregular participles, a few state words, -ing nouns).
 */
const PARTICIPLE = new Set(("broken fallen stolen taken given gone torn worn shown thrown grown blown drawn sunk stuck burnt burst built bent lost left kept laid paid " +
  "sold told heard held found made sent spent lit hung shut split swept dug struck eaten frozen hidden beaten shaken written ridden driven risen bitten chosen " +
  "forgotten spoken swollen woken rotten overgrown cut").split(" "));
const STATE = new Set(("open full empty loose dirty unsafe dangerous dark low poor bad slow late weak stagnant pending " +
  "illegal unauthorized unauthorised improper irregular defective faulty insufficient inadequate incomplete heavy huge severe serious constant frequent " +
  "பழுது பழுதான சேதம் சேதமடைந்த மோசம் மோசமான ஆபத்தான sariya olunga").split(" "));
/** -ing words that are things, not doings ("building", "parking"): a closed list of the exceptions to the -ing rule */
const ING_NOUN = new Set("building ceiling parking flooding crossing railing housing lighting wiring plumbing fencing paving painting wedding clothing swimming".split(" "));
/** -ly words that are things ("family"), the exceptions to the -ly rule */
const LY_NOUN = new Set("family assembly anomaly italy".split(" "));
export function predicateWord(w: string): boolean {
  if (STATE.has(w)) return true;
  if (/^[a-z]+$/.test(w)) {
    if (PARTICIPLE.has(w)) return true;
    // English participles and gerunds: received, damaged, blocked, leaking, overflowing ("speed", "need" are not -ed)
    if (w.length >= 5 && /(?:(?<!e)ed|ing)$/.test(w) && !ING_NOUN.has(w)) return true;
    // English adverbs: properly, badly, regularly ("supply" is not one)
    if (w.length >= 5 && /(?<!p)ly$/.test(w) && !LY_NOUN.has(w)) return true;
    // Tanglish verb forms: the negative (varla, varala, kedaikala, aagala, seyyala, ...lai, ...lae), the present (aagudhu, odudhu), the
    // past (aachu, odanjuchu), the participle (odanju, udanju) and the adverb (kashtama, vaarama); -la is also the locative ("therula",
    // "roadla"), a place and not a problem
    return (w.length >= 4 && /(?:la|lai|lae|udhu|uthu|idhu|ithu|chu|nju)$/.test(w)) || (w.length >= 5 && /ama$/.test(w));
  }
  // Tamil: the negative (-இல்லை: வரவில்லை, இயங்கவில்லை, சரிசெய்யப்படவில்லை, வருவதில்லை), the adverb of time or manner (-ஆக: நாட்களாக,
  // வாரங்களாக, தாமதமாக), the locative (-இல்: நிலுவையில், சாலையில்), "without" (-ஆமல்), the finite verb (-கிறது, -கின்றன, -ள்ளது,
  // -ந்தது, -ட்டது, ...) and the participles of breaking and falling (உடைந்து, பழுதடைந்து, விழுந்து)
  return /(?:ல்லை|ாக|ஆக|ில்|இல்|ாமல்|கிறது|கின்றது|கின்றன|கிறார்கள்|ள்ளது|ள்ளன|ந்தது|ட்டது|த்தது|ற்றது|னது|டைந்து|ழுந்து)$/u.test(w);
}

/** One word, its plural taken off: "lights" is "light", "supplies" "supply", "mosquitoes" "mosquito", "விளக்குகள்" "விளக்கு", "பள்ளங்கள்" "பள்ளம்". */
const stem = (w: string): string => {
  if (/^[a-z]+$/.test(w)) {
    if (w.length <= 4) return w;
    if (/ies$/.test(w)) return `${w.slice(0, -3)}y`;
    if (/(?:ss|x|z|ch|sh|o)es$/.test(w)) return w.slice(0, -2);
    return /[^sui]s$/.test(w) ? w.slice(0, -1) : w;
  }
  if ([...w].length > 5 && w.endsWith("ங்கள்")) return `${w.slice(0, -"ங்கள்".length)}ம்`;
  return [...w].length > 4 && w.endsWith("கள்") ? w.slice(0, -"கள்".length) : w;
};
const listed = (w: string) => STOP.has(w) || TA_STOP.has(w) || FILLER.has(w) || DURATION.has(w) || PLACE.has(w) || GENERIC.has(w);

const rawWords = (s: string | null | undefined): string[] =>
  // zero-width joiners and marks inside a word are not word breaks (squash() drops them too: P6-011)
  String(s ?? "").normalize("NFC").toLowerCase().replace(/[​-‍⁠﻿]/g, "").replace(/[^\p{L}\p{M}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);

/** Two words written as one in the other line ("street light" / "streetlight", "தெரு விளக்கு" / "தெருவிளக்கு") are taken as that one word. */
function joinCompounds(words: string[], other: Set<string>): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i + 1 < words.length && other.has(words[i] + words[i + 1])) { out.push(words[i] + words[i + 1]); i++; } else out.push(words[i]);
  }
  return out;
}

/** A problem line's content words, and those of them that name what the problem is about (not a predicate, a state, a time or a place). */
function wordsOf(words: string[]): { all: Set<string>; subject: Set<string> } {
  const all = new Set<string>(), subject = new Set<string>();
  for (const w of words) {
    if ([...w].length <= 2 || listed(w)) continue;
    const st = stem(w);
    if (listed(st)) continue;
    all.add(st);
    if (!predicateWord(w)) subject.add(st);
  }
  return { all, subject };
}

/** a kind of problem that says something: OTHER (or none) does not */
const kindOf = (k: string | null | undefined): string | null => (k && k !== "OTHER" ? k : null);

/**
 * Do two problem lines, both to one department, share what they are about? They must share a word that names the thing ("sewage",
 * "pension", "விளக்கு"): a shared predicate, state, time, place or "problem" word ("pending", "not received", "varla", "for a long time",
 * "near the temple", "menace") is not a topic. Predicates are read by their endings, so new ones need no list (reviewer5-07: the one-word rule
 * counted any predicate the FILLER list did not hold); the closed classes are listed. A line with no subject word ("Flooding again") is
 * compared on all its words when the other has none either. With the kind of each problem known (`kinds`: the reader's category for a
 * petition, the complaint type's for an online complaint), two kinds are two problems, whatever words they share.
 *
 * The same person writing twice needs one shared subject word, however long the lines; different people in a ward need more, so that two
 * unrelated road complaints are not joined. It only brings the earlier petition to the staff's attention: a person decides.
 */
export function sameTopic(a: string | null | undefined, b: string | null | undefined, samePerson = false, kinds: { a?: string | null; b?: string | null } = {}): boolean {
  const ka = kindOf(kinds.a), kb = kindOf(kinds.b);
  if (ka && kb && ka !== kb) return false;
  const ra = rawWords(a), rb = rawWords(b);
  const A = wordsOf(joinCompounds(ra, new Set(rb))), B = wordsOf(joinCompounds(rb, new Set(ra)));
  if (!A.all.size || !B.all.size) return false;
  // both lines name their thing: those names must meet. Neither does: all their words. Only one does: the other's words are only a
  // predicate ("Street not swept, complained many times"), which says nothing about the first line's thing
  const [x, y] = A.subject.size && B.subject.size ? [A.subject, B.subject] : !A.subject.size && !B.subject.size ? [A.all, B.all] : [A.subject, B.subject];
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  if (!shared) return false;
  if (samePerson) return true;
  let both = 0;
  for (const w of A.all) if (B.all.has(w)) both++;
  return both >= 2 || both / new Set([...A.all, ...B.all]).size >= 0.3;
}

const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const nth = (n: number) => ORD[n] ?? `${n}th`;
const day = (t: string) => { const [y, m, d] = t.slice(0, 10).split("-"); return `${d}.${m}.${y}`; };
const isOpen = (status: string) => !(RESOLVED_STATUSES as readonly string[]).includes(status) && status !== "Rejected";

// A street's own number, written as an ordinal: "2nd", "Second", "2வது", "இரண்டாவது". "First" and "Fifth" differ by their numbers, not by a
// letter or two (P6-020); "Eleventh" is "11th" and "இரண்டாவது தெரு" is "2வது தெரு" (fix-all, reviewer5-08).
const EN_ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth",
  "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth"];
const EN_TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40 };
const TA_ORD = ["", "முதல", "இரண்ட", "மூன்ற", "நான்க", "ஐந்த", "ஆற", "ஏழ", "எட்ட", "ஒன்பத", "பத்த"]; // + ாவது / ாம் (முதல் alone is "first" too)
const ORD_WORD = new RegExp(String.raw`(?<![\p{L}\p{M}])(?:(twenty|thirty|forty)[\s-]*)?(${EN_ORD.slice(1).join("|")})(?![\p{L}\p{M}])` +
  String.raw`|(?<![\p{L}\p{M}])(${TA_ORD.slice(1).join("|")})(?:ாவது|ாம்)(?![\p{L}\p{M}])|(?<![\p{L}\p{M}])முதல்(?![\p{L}\p{M}])`, "giu");
const ORD_DIGITS = /(?<![\p{L}\p{M}\p{Nd}])(\d+)(?:st|nd|rd|th|\s*[-‐–]?\s*(?:வது|ஆவது|ஆம்|ம்))(?![\p{L}\p{M}])/giu;

/** A street as its number (an ordinal; "" when none) and its words. A bare number is the door number ("12 Gandhi Street"), not the street's. */
export function streetKey(s: string | null | undefined): { num: string; words: string[] } {
  const v = asciiDigits(String(s ?? "").normalize("NFC")).replace(/[​-‍⁠﻿]/g, "")
    .replace(ORD_WORD, (_m, tens?: string, en?: string, ta?: string) =>
      ` #${ta ? TA_ORD.indexOf(ta) : en ? (tens ? EN_TENS[tens.toLowerCase()] : 0) + EN_ORD.indexOf(en.toLowerCase()) : 1} `)
    .replace(ORD_DIGITS, (_m, n: string) => ` #${Number(n)} `);
  const nums = v.match(/#\d+/g) ?? [];
  const words = v.replace(/#\d+/g, " ").replace(/\p{Nd}+/gu, " ").split(/[^\p{L}\p{M}]+/u).map((w) => w.toLowerCase()).filter(Boolean);
  return { num: nums[0]?.slice(1) ?? "", words };
}

/**
 * Does the typed street name one part of the address ("door, street, area")? The end of the address is the area, not the street (P5-030).
 * The street's number must agree ("3rd Street" is not "2nd Street", and "Gandhi Street" is not "2nd Gandhi Street": reviewer5-08); then the
 * same words, the typed street inside a part with no comma before the area, or a spelling slip ("Gandhi Stret": P6-020).
 */
function streetIn(typed: string | null, address: string | null): boolean {
  const t = streetKey(typed);
  if (!t.words.length) return false;
  const tn = t.words.join("");
  const within = (p: string[]) => p.some((_, i) => t.words.every((w, k) => p[i + k] === w));
  return String(address ?? "").split(/[,\n;]/).map(streetKey).some((p) => {
    if (!p.words.length || p.num !== t.num) return false;
    const pn = p.words.join("");
    return pn === tn || (t.words.length >= 2 && within(p.words)) || similarity(tn, pn) >= 0.7;
  });
}

/** The matches and the one line the staff read. Pure. */
export function judgeRepeats(c: Candidate, earlier: Earlier[]): Repeats {
  const mobile = tenDigits(c.mobile), name = squash(c.name), street = streetKey(c.street).words.length ? c.street : null;
  const out: (RepeatMatch & { sameDept: boolean; who: string; phone: string })[] = [];
  for (const e of earlier) {
    const theirs = tenDigits(e.mobile);
    const sameMobile = !!mobile && theirs === mobile;
    // a name alone is weak: with no street to compare, the same name with another mobile on both sides, or in another ward, is somebody
    // else ("R. Kumar" in Adyar is not "R. Kumar" in Perambur: QA pass 6, P5-030)
    const otherWard = c.ward != null && e.ward != null && e.ward !== c.ward;
    const contradicts = (!!mobile && !!theirs && theirs !== mobile) || otherWard;
    // with a street typed, the same name on the same street is the person even with a new mobile, but not in another ward: "Gandhi Street"
    // is in many wards (P6-011)
    const sameName = !!name && squash(e.name) === name && (street ? streetIn(street, e.address) && !otherWard : !contradicts);
    const samePerson = sameMobile || sameName;
    const sameDept = !!c.dept && e.dept === c.dept;
    // an online complaint is filed under the portal's departments, which the desk's do not all map to (eight have none: P5-037), so for
    // the same person the topic decides; between different people the department must agree as well
    // across departments the stricter rule for different people applies, so one shared word ("water") is not enough (P6-011)
    // the kind of each problem, when known, keeps two kinds apart and lets one shared word name the problem within one kind (reviewer5-07)
    const kinds = { a: c.category, b: e.category };
    const topic = sameDept ? sameTopic(c.problem, e.problem, samePerson, kinds) : samePerson && e.reporterKind === "online" && sameTopic(c.problem, e.problem, false, kinds);
    const sameProblem = topic && (samePerson || (c.ward != null && e.ward === c.ward));
    if (!samePerson && !sameProblem) continue;
    // what the desk is shown of an earlier filing goes through the mask here, whatever the source: an online complaint's title was
    // returned raw, whole Aadhaar number and all (QA pass 6, redteam-gate-02)
    out.push({ code: e.code, incidentId: e.incidentId, filedAt: e.filedAt, status: e.status, problem: maskAadhaar(e.problem), dept: manuDeptLabel(e.dept), samePerson, sameProblem, open: isOpen(e.status),
      sameDept, who: squash(e.name) || theirs || e.code, phone: theirs });
  }
  // the person's own petitions on this problem first (the headline names the latest of them, and the desk shows the first rows), then
  // others on it, then the person's other petitions; newest first in each (P6-011)
  const rank = (m: { samePerson: boolean; sameProblem: boolean }) => (m.samePerson && m.sameProblem ? 0 : m.sameProblem ? 1 : 2);
  out.sort((a, b) => rank(a) - rank(b) || b.filedAt.localeCompare(a.filedAt));
  const mine = out.filter((m) => m.samePerson && m.sameProblem), person = out.filter((m) => m.samePerson), others = out.filter((m) => !m.samePerson && m.sameProblem);
  let headline: string | null = null;
  if (mine.length) {
    const last = mine[0];
    headline = `This is this person's ${nth(mine.length + 1)} petition on this problem. The last one was filed on ${day(last.filedAt)} and is ${last.open ? "still open" : `marked "${last.status}"`}.`;
  } else if (others.length) {
    // people, not petitions: one neighbour who wrote three times is one person (P5-030)
    // one person may write once with a mobile and once without: a name or a mobile in common is one person (P6-011)
    const parent = new Map<string, string>();
    const root = (k: string): string => { let r = k; while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!; return r; };
    const join = (a: string, b: string) => { const x = root(a), y = root(b); if (x !== y) parent.set(y, x); };
    for (const m of others) { if (!parent.has(m.who)) parent.set(m.who, m.who); if (m.phone) join(m.who, `tel:${m.phone}`); }
    const people = new Set(others.map((m) => root(m.who))).size;
    headline = `${people} other ${people === 1 ? "person has" : "people have"} written about this in the same ward.`;
  } else if (person.length) {
    headline = `This person has written ${person.length} earlier ${person.length === 1 ? "petition" : "petitions"} on other problems.`;
  }
  // only a case of the same department is offered: joining another department's case is the owner's decision (P5-021)
  const target = [...mine, ...others].find((m) => m.open && m.incidentId && m.sameDept);
  // a case of another department is not offered to join: the desk shows "Add to this case" for a match with a case id, so such a match
  // comes without one (joining another department's case is the owner's decision, P5-021; P6-011)
  return { headline, matches: out.slice(0, 8).map(({ sameDept, who: _w, phone: _p, ...m }) => (sameDept ? m : { ...m, incidentId: null })), attachTo: target?.incidentId ?? null };
}

/** The desk's department code for a portal department name: the candidate's own when it is that portal department, else the first that is. */
function deptCodeFor(portalName: unknown, prefer: string | null | undefined): string | null {
  const n = String(portalName ?? "");
  if (!n) return null;
  if (prefer && DEPT_CONFIG[prefer]?.portalName === n) return prefer;
  return Object.entries(DEPT_CONFIG).find(([, d]) => d.portalName === n)?.[0] ?? null;
}

export async function findRepeats(c: Candidate): Promise<Repeats> {
  const mobile = tenDigits(c.mobile) || "__none__";
  const name = c.name?.trim() || "__none__";
  const COLS = `p.complaint_code AS code, p.incident_id AS incident_id, DATE_FORMAT(p.filed_at, '%Y-%m-%d %H:%i:%s') AS filed_at, COALESCE(c.status, 'Complaint Filed') AS status, p.problem, p.dept_code,
            p.mobile, p.name, p.address, p.ward_number, p.category_code`;
  // the same mobile or name, and the same ward and department, as before; in a query of their own, so a busy department can never push them
  // out of the limit (the second reviewer)
  const [byPerson] = await pool.query<RowDataPacket[]>(
    `SELECT ${COLS} FROM petitions p LEFT JOIN complaints c ON c.complaint_code = p.complaint_code
      WHERE p.status = 'filed' AND p.id <> ? AND (p.mobile = ? OR p.name = ? OR (p.ward_number = ? AND p.dept_code = ?))
      ORDER BY p.filed_at DESC LIMIT 200`,
    [c.excludeId ?? 0, mobile, name, c.ward ?? -1, c.dept ?? "__none__"]
  );
  // with no ward read, also the department's recent petitions, so the matcher (which compares names by their letters: squash()) sees
  // "R.Kumar" for "R. Kumar", decomposed Tamil and a name with a zero-width joiner; a byte-exact name was all it got before (P5-018)
  const [byDept] = c.ward == null && c.dept
    ? await pool.query<RowDataPacket[]>(
      `SELECT ${COLS} FROM petitions p LEFT JOIN complaints c ON c.complaint_code = p.complaint_code
        WHERE p.status = 'filed' AND p.id <> ? AND p.dept_code = ? ORDER BY p.filed_at DESC LIMIT 200`, [c.excludeId ?? 0, c.dept])
    : [[] as RowDataPacket[]];
  const seen = new Set<string>();
  const pet = [...byPerson, ...byDept].filter((r) => { const k = String(r.code); if (seen.has(k)) return false; seen.add(k); return true; });
  // a citizen who filed anonymously is never shown to the desk, whatever number it types (QA pass 5, P5-014)
  const [online] = await pool.query<RowDataPacket[]>(
    `SELECT c.complaint_code AS code, DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i:%s') AS filed_at, c.status, c.title AS problem, c.mobile_number, c.first_name, c.street_address, c.ward_number, d.name AS dept_name
       FROM complaints c LEFT JOIN departments d ON d.id = c.department_id
      WHERE COALESCE(c.is_synthetic, 0) = 0 AND COALESCE(c.is_anonymous, 0) = 0 AND c.mobile_number = ?
        AND c.complaint_code NOT IN (SELECT complaint_code FROM petitions WHERE complaint_code IS NOT NULL) ORDER BY c.created_at DESC LIMIT 50`,
    [mobile]
  );
  // an online complaint's kind of problem, from its type and sub-type as the pipeline reads them (grade.ts). Best effort: a store with no
  // taxonomy leaves it unknown, and the words alone decide
  const kind = new Map<string, string>();
  if (online.length) {
    const [k] = await pool.query<RowDataPacket[]>(
      `SELECT c.complaint_code AS code, cs.label AS subtype, cc.name AS type FROM complaints c JOIN complaint_subtypes cs ON cs.id = c.complaint_subtype_id
         LEFT JOIN complaint_categories cc ON cc.id = cs.category_id WHERE c.complaint_code IN (?)`, [online.map((r) => String(r.code))]).catch(() => [[] as RowDataPacket[]]);
    for (const r of k) kind.set(String(r.code), grievanceCategory(r.type, r.subtype));
  }
  const earlier: Earlier[] = [
    ...pet.map((r): Earlier => ({ code: String(r.code), incidentId: r.incident_id ?? null, filedAt: String(r.filed_at), status: String(r.status), problem: String(r.problem ?? ""), dept: r.dept_code ?? null,
      mobile: r.mobile ?? null, name: r.name ?? null, address: r.address ?? null, ward: r.ward_number == null ? null : Number(r.ward_number), reporterKind: "petition", category: r.category_code ?? null })),
    // an online complaint names its department by the portal's name: the desk's code for it, so "the same problem" can match (P5-019)
    ...online.map((r): Earlier => ({ code: String(r.code), incidentId: `INC-W-${r.code}`, filedAt: String(r.filed_at), status: String(r.status), problem: String(r.problem ?? ""), dept: deptCodeFor(r.dept_name, c.dept),
      mobile: r.mobile_number ?? null, name: r.first_name ?? null, address: r.street_address ?? null, ward: r.ward_number == null ? null : Number(r.ward_number), reporterKind: "online",
      category: kind.get(String(r.code)) ?? null }))
  ];
  return judgeRepeats(c, earlier);
}
