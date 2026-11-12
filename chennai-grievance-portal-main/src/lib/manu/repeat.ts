/**
 * The "came before" check: has this person written before, and have others written about the same thing? Run before filing, so the staff
 * can add a petition to the case that already exists instead of opening another one.
 */
import { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { RESOLVED_STATUSES } from "@/lib/constants";
import { manuDeptLabel, type RepeatMatch, type Repeats } from "./constants";
import { similarity, squash, tenDigits } from "./clean";
import { DEPT_CONFIG } from "@/lib/officer/departments";

export interface Candidate { mobile: string | null; name: string | null; street: string | null; ward: number | null; dept: string | null; problem: string | null; excludeId?: number }
export interface Earlier {
  code: string; incidentId: string | null; filedAt: string; status: string; problem: string; dept: string | null;
  mobile: string | null; name: string | null; address: string | null; ward: number | null; reporterKind: "petition" | "online";
}

const STOP = new Set("the a an of in on at to for from and or is are was were not has have had no my our her his their this that with by be been it its days day week weeks month months year years street area near problem issue since still now more over very after before about".split(" "));
const words = (s: string | null | undefined) => new Set(String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

/**
 * Do two problem lines, both to one department, share what they are about? The same person writing twice needs one shared content word
 * ("sewage"), however long the lines; different people in a ward need more, so that two unrelated road complaints are not joined. It only
 * brings the earlier petition to the staff's attention: a person decides.
 */
export function sameTopic(a: string | null | undefined, b: string | null | undefined, samePerson = false): boolean {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return false;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  if (samePerson) return both >= 1;
  return both >= 2 || (both >= 1 && both / new Set([...A, ...B]).size >= 0.3);
}

const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const nth = (n: number) => ORD[n] ?? `${n}th`;
const day = (t: string) => { const [y, m, d] = t.slice(0, 10).split("-"); return `${d}.${m}.${y}`; };
const isOpen = (status: string) => !(RESOLVED_STATUSES as readonly string[]).includes(status) && status !== "Rejected";

/** The matches and the one line the staff read. Pure. */
export function judgeRepeats(c: Candidate, earlier: Earlier[]): Repeats {
  const mobile = tenDigits(c.mobile), name = squash(c.name), street = squash(c.street);
  const out: RepeatMatch[] = [];
  for (const e of earlier) {
    const sameMobile = !!mobile && tenDigits(e.mobile) === mobile;
    const sameName = !!name && squash(e.name) === name && (!street || similarity(street, squash(e.address).slice(-street.length)) >= 0.7 || squash(e.address).includes(street));
    const samePerson = sameMobile || sameName;
    const sameDept = !!c.dept && e.dept === c.dept;
    const topic = sameDept && sameTopic(c.problem, e.problem, samePerson);
    const sameProblem = topic && (samePerson || (c.ward != null && e.ward === c.ward));
    if (!samePerson && !sameProblem) continue;
    out.push({ code: e.code, incidentId: e.incidentId, filedAt: e.filedAt, status: e.status, problem: e.problem, dept: manuDeptLabel(e.dept), samePerson, sameProblem, open: isOpen(e.status) });
  }
  out.sort((a, b) => b.filedAt.localeCompare(a.filedAt));
  const mine = out.filter((m) => m.samePerson && m.sameProblem), person = out.filter((m) => m.samePerson), others = out.filter((m) => !m.samePerson && m.sameProblem);
  let headline: string | null = null;
  if (mine.length) {
    const last = mine[0];
    headline = `This is this person's ${nth(mine.length + 1)} petition on this problem. The last one was filed on ${day(last.filedAt)} and is ${last.open ? "still open" : `marked "${last.status}"`}.`;
  } else if (others.length) {
    headline = `${others.length} other ${others.length === 1 ? "person has" : "people have"} written about this in the same ward.`;
  } else if (person.length) {
    headline = `This person has written ${person.length} earlier ${person.length === 1 ? "petition" : "petitions"} on other problems.`;
  }
  const target = [...mine, ...others].find((m) => m.open && m.incidentId);
  return { headline, matches: out.slice(0, 8), attachTo: target?.incidentId ?? null };
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
  const [pet] = await pool.query<RowDataPacket[]>(
    `SELECT p.complaint_code AS code, p.incident_id AS incident_id, DATE_FORMAT(p.filed_at, '%Y-%m-%d %H:%i:%s') AS filed_at, COALESCE(c.status, 'Complaint Filed') AS status, p.problem, p.dept_code,
            p.mobile, p.name, p.address, p.ward_number
       FROM petitions p LEFT JOIN complaints c ON c.complaint_code = p.complaint_code
      WHERE p.status = 'filed' AND p.id <> ? AND (p.mobile = ? OR p.name = ? OR (${c.ward != null ? "p.ward_number = ? AND " : ""}p.dept_code = ?))
      ORDER BY p.filed_at DESC LIMIT 200`,
    // with no ward read, the department's recent petitions are fetched, so the matcher (which compares names by their letters: squash())
    // sees "R.Kumar" for "R. Kumar", decomposed Tamil and a name with a zero-width joiner; a byte-exact name was all it got before (P5-018)
    [c.excludeId ?? 0, mobile, name, ...(c.ward != null ? [c.ward] : []), c.dept ?? "__none__"]
  );
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
