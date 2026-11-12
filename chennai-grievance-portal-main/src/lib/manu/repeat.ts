/**
 * The "came before" check: has this person written before, and have others written about the same thing? Run before filing, so the staff
 * can add a petition to the case that already exists instead of opening another one.
 */
import { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { RESOLVED_STATUSES } from "@/lib/constants";
import { manuDeptLabel, type RepeatMatch, type Repeats } from "./constants";
import { maskAadhaar, similarity, squash, tenDigits } from "./clean";
import { DEPT_CONFIG } from "@/lib/officer/departments";

export interface Candidate { mobile: string | null; name: string | null; street: string | null; ward: number | null; dept: string | null; problem: string | null; excludeId?: number }
export interface Earlier {
  code: string; incidentId: string | null; filedAt: string; status: string; problem: string; dept: string | null;
  mobile: string | null; name: string | null; address: string | null; ward: number | null; reporterKind: "petition" | "online";
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
/**
 * Words that say what is wrong with a thing, how long, or where, not what the thing is: predicates, durations and place words. One
 * writer's two different problems share them all the time ("Patta transfer pending" / "Building plan approval pending", "\u0BA4\u0BC6\u0BB0\u0BC1 \u0BB5\u0BBF\u0BB3\u0B95\u0BCD\u0B95\u0BC1
 * \u0B87\u0BAF\u0B99\u0BCD\u0B95\u0BB5\u0BBF\u0BB2\u0BCD\u0BB2\u0BC8" / "\u0B95\u0BC1\u0B9F\u0BBF\u0BA8\u0BC0\u0BB0\u0BCD \u0BAE\u0BCB\u0B9F\u0BCD\u0B9F\u0BBE\u0BB0\u0BCD \u0B87\u0BAF\u0B99\u0BCD\u0B95\u0BB5\u0BBF\u0BB2\u0BCD\u0BB2\u0BC8", "Thanni varla" / "Current varla"), so they never make a topic on their own (QA pass 6,
 * reviewer5-07). The FILLER list could not keep up with them (P6-011 and P6-020 each added words, and the next reviewer found more), so
 * the open classes are read by their endings; only the closed ones are listed: English irregular participles and a few state words.
 */
const PARTICIPLE = new Set(("broken fallen stolen taken given gone torn worn shown thrown grown blown drawn sunk stuck burnt burst built bent lost left kept laid paid " +
  "sold told heard held found made sent spent lit hung shut split swept dug struck eaten frozen hidden beaten shaken written ridden driven risen bitten chosen " +
  "forgotten spoken swollen woken rotten overgrown cut").split(" "));
const STATE = new Set("open full empty loose dirty unsafe dangerous dark low poor bad slow late weak stagnant pending".split(" "));
export function predicateWord(w: string): boolean {
  if (/^[a-z]+$/.test(w)) {
    if (PARTICIPLE.has(w) || STATE.has(w)) return true;
    // English participles and gerunds: received, damaged, blocked, leaking, overflowing ("speed", "need" are not -ed)
    if (w.length >= 5 && /(?:(?<!e)ed|ing)$/.test(w)) return true;
    // Tanglish verb forms: the negative (varla, varala, kedaikala, aagala, seyyala, ...lai, ...lae), the present (aagudhu, odudhu), the
    // past (aachu, odanjuchu); -la is also the locative ("therula", "roadla"), a place and not a problem
    return w.length >= 4 && /(?:la|lai|lae|udhu|uthu|idhu|ithu|chu)$/.test(w);
  }
  // Tamil: the negative (-\u0B87\u0BB2\u0BCD\u0BB2\u0BC8: \u0BB5\u0BB0\u0BB5\u0BBF\u0BB2\u0BCD\u0BB2\u0BC8, \u0B87\u0BAF\u0B99\u0BCD\u0B95\u0BB5\u0BBF\u0BB2\u0BCD\u0BB2\u0BC8, \u0B9A\u0BB0\u0BBF\u0B9A\u0BC6\u0BAF\u0BCD\u0BAF\u0BAA\u0BCD\u0BAA\u0B9F\u0BB5\u0BBF\u0BB2\u0BCD\u0BB2\u0BC8, \u0BB5\u0BB0\u0BC1\u0BB5\u0BA4\u0BBF\u0BB2\u0BCD\u0BB2\u0BC8), the adverb of time or manner (-\u0B86\u0B95: \u0BA8\u0BBE\u0B9F\u0BCD\u0B95\u0BB3\u0BBE\u0B95,
  // \u0BB5\u0BBE\u0BB0\u0B99\u0BCD\u0B95\u0BB3\u0BBE\u0B95, \u0BA4\u0BBE\u0BAE\u0BA4\u0BAE\u0BBE\u0B95), the locative (-\u0B87\u0BB2\u0BCD: \u0BA8\u0BBF\u0BB2\u0BC1\u0BB5\u0BC8\u0BAF\u0BBF\u0BB2\u0BCD, \u0B9A\u0BBE\u0BB2\u0BC8\u0BAF\u0BBF\u0BB2\u0BCD), "without" (-\u0B86\u0BAE\u0BB2\u0BCD) and the finite verb (-\u0B95\u0BBF\u0BB1\u0BA4\u0BC1, -\u0B95\u0BBF\u0BA9\u0BCD\u0BB1\u0BA9, -\u0BB3\u0BCD\u0BB3\u0BA4\u0BC1,
  // -\u0BA8\u0BCD\u0BA4\u0BA4\u0BC1, -\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1, ...)
  return /(?:\u0BB2\u0BCD\u0BB2\u0BC8|\u0BBE\u0B95|\u0B86\u0B95|\u0BBF\u0BB2\u0BCD|\u0B87\u0BB2\u0BCD|\u0BBE\u0BAE\u0BB2\u0BCD|\u0B95\u0BBF\u0BB1\u0BA4\u0BC1|\u0B95\u0BBF\u0BA9\u0BCD\u0BB1\u0BA4\u0BC1|\u0B95\u0BBF\u0BA9\u0BCD\u0BB1\u0BA9|\u0B95\u0BBF\u0BB1\u0BBE\u0BB0\u0BCD\u0B95\u0BB3\u0BCD|\u0BB3\u0BCD\u0BB3\u0BA4\u0BC1|\u0BB3\u0BCD\u0BB3\u0BA9|\u0BA8\u0BCD\u0BA4\u0BA4\u0BC1|\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1|\u0BA4\u0BCD\u0BA4\u0BA4\u0BC1|\u0BB1\u0BCD\u0BB1\u0BA4\u0BC1|\u0BA9\u0BA4\u0BC1)$/u.test(w);
}

/** One word, its plural taken off: "lights" is "light", "supplies" "supply", "\u0BB5\u0BBF\u0BB3\u0B95\u0BCD\u0B95\u0BC1\u0B95\u0BB3\u0BCD" "\u0BB5\u0BBF\u0BB3\u0B95\u0BCD\u0B95\u0BC1". */
const stem = (w: string): string => {
  if (/^[a-z]+$/.test(w)) return w.length > 4 && /ies$/.test(w) ? `${w.slice(0, -3)}y` : w.length > 4 && /[^sui]s$/.test(w) ? w.slice(0, -1) : w;
  return [...w].length > 4 && w.endsWith("\u0B95\u0BB3\u0BCD") ? w.slice(0, -"\u0B95\u0BB3\u0BCD".length) : w;
};
const listed = (w: string) => STOP.has(w) || TA_STOP.has(w) || FILLER.has(w);

/** A problem line's content words, and those of them that name what the problem is about (not a predicate, a duration or a place). */
function wordsOf(s: string | null | undefined): { all: Set<string>; subject: Set<string> } {
  const all = new Set<string>(), subject = new Set<string>();
  // zero-width joiners and marks inside a word are not word breaks (squash() drops them too: P6-011)
  for (const w of String(s ?? "").normalize("NFC").toLowerCase().replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").replace(/[^\p{L}\p{M}\p{N} ]/gu, " ").split(/\s+/)) {
    if ([...w].length <= 2 || listed(w)) continue;
    const st = stem(w);
    if (listed(st)) continue;
    all.add(st);
    if (!predicateWord(w)) subject.add(st);
  }
  return { all, subject };
}

/**
 * Do two problem lines, both to one department, share what they are about? They must share a word that names the thing ("sewage",
 * "pension", "\u0BB5\u0BBF\u0BB3\u0B95\u0BCD\u0B95\u0BC1"): a shared predicate ("pending", "not received", "varla") is not a topic. A line with no such word ("Flooding again")
 * is compared on all its words. The same person writing twice needs one shared subject word, however long the lines; different people in a
 * ward need more, so that two unrelated road complaints are not joined. It only brings the earlier petition to the staff's attention: a
 * person decides.
 */
export function sameTopic(a: string | null | undefined, b: string | null | undefined, samePerson = false): boolean {
  const A = wordsOf(a), B = wordsOf(b);
  if (!A.all.size || !B.all.size) return false;
  const [x, y] = A.subject.size && B.subject.size ? [A.subject, B.subject] : [A.all, B.all];
  let subject = 0;
  for (const w of x) if (y.has(w)) subject++;
  if (!subject) return false;
  if (samePerson) return true;
  let both = 0;
  for (const w of A.all) if (B.all.has(w)) both++;
  return both >= 2 || both / new Set([...A.all, ...B.all]).size >= 0.3;
}

const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const nth = (n: number) => ORD[n] ?? `${n}th`;
const day = (t: string) => { const [y, m, d] = t.slice(0, 10).split("-"); return `${d}.${m}.${y}`; };
const isOpen = (status: string) => !(RESOLVED_STATUSES as readonly string[]).includes(status) && status !== "Rejected";

/** Does the typed street name one part of the address ("door, street, area")? The end of the address is the area, not the street (P5-030). */
/** "First Cross Street" as "1 Cross Street", so "First" and "Fifth" differ by their numbers, not by a letter or two (P6-020). */
const ORDINAL: Record<string, string> = { first: "1", second: "2", third: "3", fourth: "4", fifth: "5", sixth: "6", seventh: "7", eighth: "8", ninth: "9", tenth: "10" };
export const ordinals = (s: string | null | undefined): string => String(s ?? "").replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/gi, (w) => ORDINAL[w.toLowerCase()]);

function streetIn(street: string, address: string | null): boolean {
  const all = squash(address);
  if (all.includes(street)) return true;
  // a spelling slip, not another street: "3rd Street" is not "2nd Street", so the numbers in the two must agree (P6-011). When the typed
  // street has no number, the part's number is the door number ("12 Gandhi Street"), and the letters are compared (P6-020)
  const num = (x: string) => x.replace(/\D/g, "");
  return String(address ?? "").split(/[,\n;]/).map((p) => squash(ordinals(p))).filter(Boolean)
    .some((part) => (num(street) ? num(part) === num(street) && similarity(street, part) >= 0.7 : similarity(street, part.replace(/\d/g, "")) >= 0.7));
}

/** The matches and the one line the staff read. Pure. */
export function judgeRepeats(c: Candidate, earlier: Earlier[]): Repeats {
  const mobile = tenDigits(c.mobile), name = squash(c.name), street = squash(ordinals(c.street));
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
    const topic = sameDept ? sameTopic(c.problem, e.problem, samePerson) : samePerson && e.reporterKind === "online" && sameTopic(c.problem, e.problem, false);
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
            p.mobile, p.name, p.address, p.ward_number`;
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
  const earlier: Earlier[] = [
    ...pet.map((r): Earlier => ({ code: String(r.code), incidentId: r.incident_id ?? null, filedAt: String(r.filed_at), status: String(r.status), problem: String(r.problem ?? ""), dept: r.dept_code ?? null,
      mobile: r.mobile ?? null, name: r.name ?? null, address: r.address ?? null, ward: r.ward_number == null ? null : Number(r.ward_number), reporterKind: "petition" })),
    // an online complaint names its department by the portal's name: the desk's code for it, so "the same problem" can match (P5-019)
    ...online.map((r): Earlier => ({ code: String(r.code), incidentId: `INC-W-${r.code}`, filedAt: String(r.filed_at), status: String(r.status), problem: String(r.problem ?? ""), dept: deptCodeFor(r.dept_name, c.dept),
      mobile: r.mobile_number ?? null, name: r.first_name ?? null, address: r.street_address ?? null, ward: r.ward_number == null ? null : Number(r.ward_number), reporterKind: "online" }))
  ];
  return judgeRepeats(c, earlier);
}
