/**
 * The Manu Desk's work on the store: a petition from its photos, through the reader and the petition officer's check, to the complaint
 * and case it becomes.
 */
import { z } from "zod";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import pool, { withTransaction } from "@/lib/db";
import { generateUniqueComplaintCode } from "@/lib/complaint-code";
import { DEFAULT_FALLBACK_DEPARTMENT } from "@/lib/constants";
import { audit } from "@/lib/collector/sources";
import { DEPT_CONFIG } from "@/lib/officer/departments";
import { oneAtATime } from "@/lib/serial";
import { hasVisibleText } from "@/lib/validators";
import { addCaseLive, petitionCase } from "./cases";
import { MOBILE_RE, MOBILE_TYPED_MAX, aadhaarShaped, addHours, asciiDigits, bestArea, istNow, maskAadhaar, tenDigits } from "./clean";
import { MANU_DEPTS, manuDeptLabel, type Approved, type ReadStage, type Reading, type Repeats } from "./constants";
import { mediaTypeOf, readPhoto, removePhoto } from "./files";
import { readPetition } from "./read";
import { findRepeats } from "./repeat";
import { sendPetitionSms, smsMode, smsNote, type SmsMode } from "./sms";

type Row = RowDataPacket & Record<string, any>;

const photoUrl = (name: string) => `/api/manu/photos/${name}`;
const pagesOf = (p: Row): string[] => { try { return JSON.parse(String(p.pages ?? "[]")); } catch { return []; } };
export const readingOf = (p: Row): Reading | null => { try { return p.reading ? (JSON.parse(String(p.reading)) as Reading) : null; } catch { return null; } };
const stamp = (v: unknown) => (v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 19).replace("T", " ") : String(v).replace("T", " ").slice(0, 19));
const DAYS_TO_ACT = () => Math.max(1, Number(process.env.MANU_DAYS_TO_ACT) || 15);
const URGENT_DAYS = () => Math.max(1, Number(process.env.MANU_URGENT_DAYS) || 2);

export async function createPetition(a: { pages: string[]; uploadedBy: number; uploadedEmail: string }): Promise<number> {
  const now = istNow();
  const [r] = await pool.query<ResultSetHeader>(
    `INSERT INTO petitions (status, pages, uploaded_by, uploaded_email, created_at, updated_at) VALUES ('reading', ?, ?, ?, ?, ?)`,
    [JSON.stringify(a.pages), a.uploadedBy, a.uploadedEmail, now, now]
  );
  enqueueRead(r.insertId);
  return r.insertId;
}

export async function getPetition(id: number): Promise<Row | null> {
  const [r] = await pool.query<Row[]>(`SELECT * FROM petitions WHERE id = ? LIMIT 1`, [id]);
  return r[0] ?? null;
}

// ---------------------------------------------------------------- the reader --

declare global {
  // eslint-disable-next-line no-var
  var __manuQueue: { running: Set<number>; waiting: number[]; stage: Map<number, ReadStage> } | undefined;
}
const queue: NonNullable<typeof global.__manuQueue> = (global.__manuQueue ??= { running: new Set(), waiting: [], stage: new Map() });
queue.stage ??= new Map(); // a queue made by an earlier version of this file, on a server that kept running
const AT_ONCE = 3;

function pump(): void {
  while (queue.running.size < AT_ONCE && queue.waiting.length) {
    const id = queue.waiting.shift()!;
    queue.running.add(id);
    readOne(id).catch((e) => console.error(`[manu] reading petition ${id} failed`, e)).finally(() => { queue.running.delete(id); queue.stage.delete(id); pump(); });
  }
}

export function enqueueRead(id: number): void {
  if (queue.running.has(id) || queue.waiting.includes(id)) return;
  queue.waiting.push(id);
  queue.stage.set(id, { step: "queued" });
  pump();
}

async function readOne(id: number): Promise<void> {
  const p = await getPetition(id);
  if (!p || p.status !== "reading") return;
  try {
    const pages = await Promise.all(pagesOf(p).map(async (name) => {
      const b = await readPhoto(name);
      if (!b) throw new Error("A page of this petition is missing.");
      return { mediaType: mediaTypeOf(name), data: b.toString("base64") };
    }));
    const r = await readPetition(pages, (s) => queue.stage.set(id, s));
    await pool.query(`UPDATE petitions SET status = 'needs_check', reading = ?, read_model = ?, read_ms = ?, read_error = NULL, updated_at = ? WHERE id = ? AND status = 'reading'`,
      [JSON.stringify(r.reading), r.model, r.ms, istNow(), id]);
  } catch (e) {
    console.warn(`[manu] petition ${id} not read: ${(e as Error).message}`);
    await pool.query(`UPDATE petitions SET status = 'read_failed', read_error = ?, updated_at = ? WHERE id = ? AND status = 'reading'`,
      ["The photo could not be read just now. Read it again, or type the details in.", istNow(), id]);
  }
}

/** Puts a petition back with the reader (a retry, or one the last server run never finished). */
export async function readAgain(id: number): Promise<boolean> {
  const [r] = await pool.query<ResultSetHeader>(`UPDATE petitions SET status = 'reading', read_error = NULL, updated_at = ? WHERE id = ? AND status IN ('read_failed', 'needs_check', 'reading')`, [istNow(), id]);
  if (!r.affectedRows) return false;
  enqueueRead(id);
  return true;
}

// ------------------------------------------------------------------ the desk --

export interface DeskItem {
  id: number; status: string; name: string | null; problem: string | null; dept: string; urgent: boolean; unsure: number; code: string | null; error: string | null; at: string; pages: number; thumb: string | null;
  /** while it is being read: how far the reading has got */
  stage: ReadStage | null;
}

/** What waits to be read or checked, and the last week's approved petitions. Also restarts any left unread by a restart. */
export async function deskList(): Promise<DeskItem[]> {
  const since = addHours(istNow(), -24 * 7);
  const COLS = `id, status, pages, reading, name, problem, dept_code, urgent, read_error, complaint_code, created_at, filed_at, updated_at`;
  // what still waits is the desk's work and is never cut: it shared one LIMIT 300 with the week's approved petitions, newest first, so a
  // busy grievance day pushed older waiting petitions off the desk and out of the restart below (QA pass 6, hunt2-desk-13). Only the
  // approved ones, kept for a week to show, are capped.
  const [waiting] = await pool.query<Row[]>(`SELECT ${COLS} FROM petitions WHERE status IN ('reading', 'needs_check', 'read_failed') ORDER BY created_at DESC`);
  // the latest approvals, by when they were approved (an old upload approved now is one of them), read after the waiting ones: a petition
  // approved between the two reads is in both, and is listed once, as approved (the pass 7 reviewer)
  const [approved] = await pool.query<Row[]>(`SELECT ${COLS} FROM petitions WHERE status = 'filed' AND updated_at >= ? ORDER BY updated_at DESC, id DESC LIMIT 300`, [since]);
  const filed = new Set(approved.map((r) => Number(r.id)));
  const rows = [...waiting.filter((r) => !filed.has(Number(r.id))), ...approved].sort((a, b) => stamp(b.created_at).localeCompare(stamp(a.created_at)) || Number(b.id) - Number(a.id));
  const old = addHours(istNow(), -0.08);
  for (const r of rows)
    if (r.status === "reading" && stamp(r.updated_at) < old && !queue.running.has(r.id)) enqueueRead(r.id);
  return rows.map((r): DeskItem => {
    const g = readingOf(r), pages = pagesOf(r);
    return {
      id: r.id, status: r.status, name: r.name ?? g?.name ?? null, problem: r.problem ?? g?.problem_en ?? null, dept: manuDeptLabel(r.dept_code ?? g?.department), urgent: r.status === "filed" ? Number(r.urgent) === 1 : !!g?.urgent,
      unsure: g?.unsure_fields.length ?? 0, code: r.complaint_code ?? null, error: r.read_error ?? null, at: stamp(r.filed_at ?? r.created_at), pages: pages.length, thumb: pages[0] ? photoUrl(pages[0]) : null,
      stage: r.status === "reading" ? queue.stage.get(r.id) ?? null : null
    };
  });
}

let areaCache: { at: number; rows: { name: string; ward: number }[] } | null = null;
async function areas() {
  if (areaCache && Date.now() - areaCache.at < 600_000) return areaCache.rows;
  const [r] = await pool.query<Row[]>(`SELECT a.name, aw.ward_number FROM gcc_areas a JOIN area_wards aw ON aw.area_id = a.id AND aw.is_primary = 1`);
  areaCache = { at: Date.now(), rows: r.map((x) => ({ name: String(x.name), ward: Number(x.ward_number) })) };
  return areaCache.rows;
}

/** The ward an area's name points to, when the petition does not say. */
export async function wardFromArea(area: string | null | undefined): Promise<{ ward: number; area: string } | null> {
  try {
    const hit = bestArea(area, await areas());
    return hit ? { ward: hit.ward, area: hit.name } : null;
  } catch { return null; }
}

export async function wardName(ward: number | null | undefined): Promise<string | null> {
  if (!ward) return null;
  const [r] = await pool.query<Row[]>(`SELECT z.zone_name FROM zone_wards zw JOIN zones z ON z.id = zw.zone_id WHERE zw.ward_number = ? LIMIT 1`, [ward]);
  return r[0] ? String(r[0].zone_name) : null;
}

export interface Detail {
  id: number; status: string; pages: string[]; at: string; readError: string | null; model: string | null; seconds: number | null;
  reading: Reading | null;
  suggestedWard: { ward: number; area: string; zone: string | null } | null;
  repeats: Repeats | null;
  approved: Approved | null;
  /** how an SMS would go out when this is approved */
  smsMode: SmsMode;
}

export async function petitionDetail(id: number): Promise<Detail | null> {
  const p = await getPetition(id);
  if (!p) return null;
  const g = readingOf(p);
  let suggestedWard: Detail["suggestedWard"] = null, repeats: Repeats | null = null;
  if (g && p.status === "needs_check") {
    const s = g.ward ? null : await wardFromArea(g.area_en);
    if (s) suggestedWard = { ...s, zone: await wardName(s.ward) };
    repeats = await findRepeats({ mobile: g.mobile, name: g.name, street: g.street, ward: g.ward ?? s?.ward ?? null, dept: g.department, problem: g.problem_en, category: g.category, excludeId: id }).catch(() => null);
  }
  return {
    id: p.id, status: p.status, pages: pagesOf(p).map(photoUrl), at: stamp(p.created_at), readError: p.read_error ?? null, model: p.read_model ?? null,
    seconds: p.read_ms ? Math.round(Number(p.read_ms) / 100) / 10 : null, reading: g, suggestedWard, repeats,
    approved: p.status === "filed" ? await approvedNote(p) : null, smsMode: smsMode()
  };
}

const approvedNote = async (p: Row): Promise<Approved> => ({ code: String(p.complaint_code), dept: manuDeptLabel(p.dept_code), attached: Number(p.attached) === 1, sms: await smsNote(String(p.complaint_code)) });

// ------------------------------------------------------------------- filing --

// the name and the problem must have characters a reader can see: trim() keeps the zero-width ones (U+200B, joiners, U+2060, U+FEFF), so a
// petition was approved with an invisible name, and a problem of six zero-width spaces passed the 5-character minimum (hunt2-desk-02).
// The shared rule of every other form (validators.ts); the value is kept as typed.
const NAME = "Enter the petitioner's name.", PROBLEM = "Say in a line what the problem is.";
export const fileSchema = z.object({
  name: z.string().trim().min(2, NAME).max(120).refine((v) => hasVisibleText(v, 2), NAME),
  // read as a number first (+91, 0091 and a leading 0 dropped, any script's digits), then it must be a mobile: 10 digits starting 6 to 9.
  // Ten digits of any kind were accepted, so "0984001234" (a 0-prefixed number cut short) was stored and an SMS would go to it (hunt2-desk-04)
  // a number in Aadhaar's 4-4-4 groups is refused here as the reader's check refuses it (cleanReading), not read as a +91 mobile
  mobile: z.string().trim().max(MOBILE_TYPED_MAX, "That is too long for a mobile number.")
    .refine((m) => !aadhaarShaped(m), "This looks like an Aadhaar number, not a mobile number.").transform(tenDigits)
    .refine((m) => m === "" || MOBILE_RE.test(m), "A mobile number has 10 digits and starts with 6, 7, 8 or 9 (+91 or a 0 in front is fine)."),
  door: z.string().trim().max(40),
  street: z.string().trim().max(200),
  area: z.string().trim().max(120),
  // any script's digits, kept as 0 to 9: \d is ASCII only, so a pincode typed on a Tamil keyboard was refused (hunt2-desk-07)
  pincode: z.string().trim().transform((v) => asciiDigits(v)).refine((v) => /^(\d{6})?$/.test(v), "A pincode has 6 digits."),
  ward: z.number({ invalid_type_error: "Enter the ward number." }).int().min(1, "Ward numbers run from 1 to 200.").max(200, "Ward numbers run from 1 to 200."),
  date: z.string().trim().max(20),
  subject: z.string().trim().max(300),
  problem: z.string().trim().min(5, PROBLEM).max(400).refine((v) => hasVisibleText(v, 5), PROBLEM),
  request: z.string().trim().max(500),
  dept: z.enum(MANU_DEPTS.map((d) => d.code) as [string, ...string[]], { errorMap: () => ({ message: "Choose a department." }) }),
  urgent: z.boolean(),
  fullText: z.string().max(30_000),
  attachTo: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).nullable().optional()
});
export type FileFields = z.infer<typeof fileSchema>;

export class FileError extends Error {}

/** The petition as a complaint and a case. Approving twice (a double click) changes nothing the second time. */
export async function filePetition(id: number, f: FileFields, by: string): Promise<Approved> {
  const release = await oneAtATime(`petition:${id}`);
  try {
    const p = await getPetition(id);
    if (!p) throw new FileError("That petition is no longer here.");
    if (p.status === "filed") return approvedNote(p);
    if (p.status === "reading") throw new FileError("This petition is still being read.");

    const [wards] = await pool.query<Row[]>(`SELECT zone_id FROM zone_wards WHERE ward_number = ? LIMIT 1`, [f.ward]);
    if (!wards[0]) throw new FileError("That ward is not one of the Corporation's wards.");
    const portalName = DEPT_CONFIG[f.dept]?.portalName ?? "General Administration";
    const [depts] = await pool.query<Row[]>(`SELECT id, name FROM departments WHERE name IN (?, ?)`, [portalName, DEFAULT_FALLBACK_DEPARTMENT]);
    const dept = depts.find((d) => d.name === portalName) ?? depts[0];
    if (!dept) throw new FileError("No department is set up to receive this.");

    const now = istNow();
    const g = readingOf(p);
    // every field the officer typed is masked before it is stored anywhere: the complaint, the petition and the case (P5-007)
    const address = maskAadhaar([f.door, f.street, f.area].filter(Boolean).join(", ") || `Ward ${f.ward}`);
    const place = maskAadhaar([f.street, f.area].filter(Boolean).join(", ") || `Ward ${f.ward}`);
    const mobile = tenDigits(f.mobile) || null;
    const subject = maskAadhaar(f.subject || f.problem), problem = maskAadhaar(f.problem), request = maskAadhaar(f.request), fullText = maskAadhaar(f.fullText);
    const dueAt = addHours(now, 24 * (f.urgent ? URGENT_DAYS() : DAYS_TO_ACT()));
    const code = await generateUniqueComplaintCode();
    const category = g?.category || "OTHER";
    const language = g?.language ?? (/[஀-௿]/.test(fullText) ? "ta" : "en");

    await withTransaction(async (conn) => {
      const [ins] = await conn.query<ResultSetHeader>(
        `INSERT INTO complaints (complaint_code, user_id, first_name, gender, street_address, pincode, mobile_number, zone_id, ward_number, ward_source, specific_location, department_id, title, description, is_anonymous, needs_manual_review, status, created_at, updated_at)
         VALUES (?, ?, ?, 'Not stated', ?, ?, ?, ?, ?, 'user_selected', ?, ?, ?, ?, 0, 0, 'Complaint Filed', ?, ?)`,
        [code, null, maskAadhaar(f.name), address, f.pincode || null, mobile, wards[0].zone_id, f.ward, place, dept.id, subject.slice(0, 250), [problem, request, fullText].filter(Boolean).join("\n\n"), now, now]
      );
      await conn.query(`INSERT INTO complaint_status_history (complaint_id, status, stage, remarks, changed_by, created_at) VALUES (?, 'Complaint Filed', 'Collector Office', ?, NULL, ?)`,
        [ins.insertId, `Paper petition received at the Collector's office and sent to ${manuDeptLabel(f.dept)}.`, now]);
      await conn.query(
        `UPDATE petitions SET status = 'filed', name = ?, mobile = ?, address = ?, area = ?, ward_number = ?, dept_code = ?, category_code = ?, urgent = ?, subject = ?, problem = ?, request = ?, full_text = ?, petition_date = ?, language = ?,
           complaint_code = ?, complaint_id = ?, incident_id = ?, attached = ?, filed_by = ?, filed_at = ?, due_at = ?, updated_at = ? WHERE id = ?`,
        [maskAadhaar(f.name), mobile, maskAadhaar(address), place, f.ward, f.dept, category, f.urgent ? 1 : 0, subject, problem, request, fullText, f.date ? maskAadhaar(f.date) : null, language,
          code, ins.insertId, f.attachTo || `INC-W-${code}`, f.attachTo ? 1 : 0, by, now, dueAt, now, id]
      );
    });

    const filed = (await getPetition(id))!;
    const earlier = (await findRepeats({ mobile, name: f.name, street: f.street, ward: f.ward, dept: f.dept, problem, category, excludeId: id }).catch(() => null))?.matches.filter((m) => m.sameProblem).length ?? 0;
    // the count is kept with the petition, so the next build's case says it too (QA pass 6, P5-031). Best effort: a MySQL copy without
    // migration 017 still approves, and only the next build's count is lost there
    await pool.query(`UPDATE petitions SET recurrence = ? WHERE id = ?`, [earlier, id]).catch(() => undefined);
    const { incidentId } = await addCaseLive({ ...petitionCase(filed), recurrence: earlier }, f.attachTo ?? null);
    if (incidentId !== filed.incident_id) await pool.query(`UPDATE petitions SET incident_id = ?, attached = 0 WHERE id = ?`, [incidentId, id]);
    await audit(by, "petition:file", "petitions", id, null, { code, dept: f.dept, ward: f.ward, urgent: f.urgent, attachedTo: f.attachTo ?? null });
    await sendPetitionSms(code, "received");
    return approvedNote((await getPetition(id))!);
  } finally {
    release();
  }
}

// ------------------------------------------------------------------ deleting --

async function dropPetition(p: Row, by: string): Promise<void> {
  await pool.query(`DELETE FROM petitions WHERE id = ?`, [p.id]);
  await Promise.all(pagesOf(p).map(removePhoto));
  await audit(by, "petition:delete", "petitions", p.id, null, { pages: pagesOf(p).length });
}

/** Deletes an unwanted upload and its photos. An approved petition is already a complaint with the departments, so it stays. */
export async function deletePetition(id: number, by: string): Promise<boolean> {
  const release = await oneAtATime(`petition:${id}`);
  try {
    const p = await getPetition(id);
    if (!p || p.status === "filed") return false;
    await dropPetition(p, by);
    return true;
  } finally {
    release();
  }
}

/** Deletes one page of an upload and reads what is left again, so nothing from the deleted page stays in the form. */
export async function deletePage(id: number, page: number, by: string): Promise<boolean> {
  const release = await oneAtATime(`petition:${id}`);
  try {
    const p = await getPetition(id);
    if (!p || !["needs_check", "read_failed"].includes(p.status)) return false;
    const pages = pagesOf(p);
    if (!pages[page]) return false;
    if (pages.length === 1) { await dropPetition(p, by); return true; }
    await pool.query(`UPDATE petitions SET pages = ?, status = 'reading', reading = NULL, read_error = NULL, updated_at = ? WHERE id = ?`, [JSON.stringify(pages.filter((_, k) => k !== page)), istNow(), id]);
    await removePhoto(pages[page]);
    await audit(by, "petition:delete_page", "petitions", id, null, { page: page + 1 });
    enqueueRead(id);
    return true;
  } finally {
    release();
  }
}
