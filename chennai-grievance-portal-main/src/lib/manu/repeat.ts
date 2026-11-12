/**
 * The "came before" check: has this person written before, and have others written about the same thing? Run before filing, so the staff
 * can add a petition to the case that already exists instead of opening another one.
 */
import { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { RESOLVED_STATUSES } from "@/lib/constants";
import { manuDeptLabel, type RepeatMatch, type Repeats } from "./constants";
import { asciiDigits, similarity, squash, tenDigits } from "./clean";
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
/** The content words of a line, in order. */
const tokens = (s: string | null | undefined): string[] => String(s ?? "").normalize("NFC").toLowerCase()
  // zero-width joiners and marks inside a word are not word breaks (squash() drops them too: P6-011)
  .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").replace(/[^\p{L}\p{M}\p{N} ]/gu, " ").split(/\s+/)
  .filter((w) => [...w].length > 2 && !STOP.has(w) && !TA_STOP.has(w) && !FILLER.has(w));
const words = (s: string | null | undefined) => new Set(tokens(s));
/**
 * What a problem line is about: the first content word of each of its clauses. A petition names the thing first and what is wrong with it
 * after, in Tamil and Tanglish (subject, then verb: "\u0B93\u0BAF\u0BCD\u0BB5\u0BC2\u0BA4\u0BBF\u0BAF\u0BAE\u0BCD \u0B95\u0BBF\u0B9F\u0BC8\u0B95\u0BCD\u0B95\u0BB5\u0BBF\u0BB2\u0BCD\u0BB2\u0BC8", "thanni varla") and in a petition's English ("Pension not
 * received", "Drain blocked"). What is wrong ("pending", "broken", "\u0BA8\u0BBF\u0BB2\u0BC1\u0BB5\u0BC8\u0BAF\u0BBF\u0BB2\u0BCD", "kedaikala", "\u0BB5\u0BBE\u0BB0\u0B99\u0BCD\u0B95\u0BB3\u0BBE\u0B95") is open-ended and any two problems
 * can share it, so no word list can hold it; the thing a line names first is its topic (fix-all, reviewer5-07).
 */
const heads = (s: string | null | undefined): string[] =>
  String(s ?? "").split(/[,.;:!?|()\n\r\u0964]+/).map((c) => tokens(c)[0]).filter((w): w is string => !!w);
/** One word in two forms: a plural or a case ending (\u0BB5\u0BBF\u0BB3\u0B95\u0BCD\u0B95\u0BC1 / \u0BB5\u0BBF\u0BB3\u0B95\u0BCD\u0B95\u0BC1\u0B95\u0BB3\u0BCD, \u0B9A\u0BBE\u0BB2\u0BC8 / \u0B9A\u0BBE\u0BB2\u0BC8\u0BAF\u0BBF\u0BB2\u0BCD, light / lights, collect / collection). */
const alike = (x: string, y: string): boolean => {
  if (x === y) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return [...s].length >= 4 && l.startsWith(s) && [...l].length - [...s].length <= 4;
};

/**
 * Do two problem lines, both to one department, share what they are about? The same person writing twice needs one shared word, however
 * long the lines, and it must be what one of the lines is about (its topic: heads()), not only what is wrong with both ("pending"); different
 * people in a ward need more, so that two unrelated road complaints are not joined. It only brings the earlier petition to the staff's
 * attention: a person decides.
 */
export function sameTopic(a: string | null | undefined, b: string | null | undefined, samePerson = false): boolean {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return false;
  if (samePerson) {
    const about = (h: string[], other: Set<string>) => h.some((x) => [...other].some((w) => alike(x, w)));
    return about(heads(a), B) || about(heads(b), A);
  }
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both >= 2 || (both >= 1 && both / new Set([...A, ...B]).size >= 0.3);
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
    const topic = sameDept ? sameTopic(c.problem, e.problem, samePerson) : samePerson && e.reporterKind === "online" && sameTopic(c.problem, e.problem, false);
    const sameProblem = topic && (samePerson || (c.ward != null && e.ward === c.ward));
    if (!samePerson && !sameProblem) continue;
    out.push({ code: e.code, incidentId: e.incidentId, filedAt: e.filedAt, status: e.status, problem: e.problem, dept: manuDeptLabel(e.dept), samePerson, sameProblem, open: isOpen(e.status),
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
