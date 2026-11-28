/**
 * Generated resolutions, every day (the owner's request of 28 Nov): a handful of open cases from the GENERATED datasets (police, PWD,
 * hospital and grievance generator records; never a complaint a citizen filed on this site, never a Manu petition, never a case with
 * news, IMD, CPCB or CFM records) are resolved as a department officer would: approved, work started, then either closed by the officer
 * with remarks and an "after" photo, or sent to the Collector with them and approved by the Collector. About 40-60 % a day go through the
 * Collector, every severe one does (lib/cases/rules.ts). Times are spread through the working day and follow the case's own report time.
 *
 * Honest data trail: every resolution writes an audit_log row (action 'synthetic:resolve', actor 'district-iq', generated: true) that lists
 * every row it wrote, the photo folder holds a generated.json, and the photo comes from the generated library (data/case-photos). The
 * screens show these resolutions as they show any other (the owner tells reviewers), the way the generated outage logs are shown.
 *
 * Idempotent per slot: a day's slots are fixed by the day (synthetic-plan.ts), and a slot whose audit row exists is never done again. The
 * first run fills the last BACKFILL_DAYS days once ('synthetic:backfill' marks it); later runs fill yesterday and today, each slot once its
 * time has passed. Runs only on the copy that saves to AWS (or on MySQL), from the site's scheduler (lib/scheduler.ts), every 10 minutes.
 */
import { RowDataPacket, ResultSetHeader } from "mysql2";
import intelPool, { ops } from "@/lib/collector/db";
import pool from "@/lib/db";
import { bumpDataEpoch } from "@/lib/collector/epoch";
import { CLOSED_BY_DEPARTMENT, scrubCitizenDetails } from "@/lib/collector/scrub";
import { syncComplaints } from "@/lib/complaint-progress";
import { deptConfig } from "@/lib/officer/departments";
import { placePhoto, removePlaced } from "./photolib";
import {
  CATEGORY_PHOTOS, RESOLVABLE_CATEGORIES, approvalNote, collectorSlots, daySlots, daysToFill, fromMs, hash32, isGeneratedOnly, perDay, pickCandidate,
  remarkFor, stepTimes, toMs, viaCollector, type Candidate
} from "./synthetic-plan";

type Row = Record<string, any>;
const fmt = (col: string) => `DATE_FORMAT(${col}, '%Y-%m-%d %H:%i:%s')`;

export const SYNTH_ACTION = "synthetic:resolve";
export const BACKFILL_ACTION = "synthetic:backfill";
export const SYNTH_ACTOR = "district-iq";
export const BACKFILL_DAYS = 14;
/** the name a Collector approval of a generated resolution carries (decided_by) */
export const COLLECTOR_OFFICE = "Collector's office";
const CHUNK = 400;

const istNow = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 19).replace("T", " ");

async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [r] = await intelPool.query<RowDataPacket[]>(sql, params);
  return r as unknown as T[];
}
const chunks = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, k) => xs.slice(k * CHUNK, (k + 1) * CHUNK));

/** The slots already done (or found empty) on these days: "day#slot" keys from the audit trail. */
export async function doneSlots(days: string[]): Promise<Set<string>> {
  if (!days.length) return new Set();
  const rows = await q(`SELECT after_value FROM ${ops("audit_log")} WHERE action = ? AND (${days.map(() => "after_value LIKE ?").join(" OR ")})`,
    [SYNTH_ACTION, ...days.map((d) => `%"day":"${d}"%`)]);
  const out = new Set<string>();
  for (const r of rows) { try { const v = JSON.parse(String(r.after_value)); if (v?.day && Number.isInteger(v.slot)) out.add(`${v.day}#${v.slot}`); } catch { /* not ours */ } }
  return out;
}

/**
 * The open cases a generated resolution may be laid on, reported in [from, to]: of a kind with an "after" photo (CATEGORY_PHOTOS), of a
 * department with an officer console, untouched by anyone (no officer step, no Collector decision or note, no instruction sent), and
 * GENERATED records only (synthetic-plan.ts isGeneratedOnly: every member event generated, no real complaint, no petition, no website
 * or Manu channel, no news / IMD / CPCB / CFM source).
 */
export async function generatedCandidates(from: string, to: string): Promise<Candidate[]> {
  const rows = await q(
    `SELECT i.incident_id AS id, i.lead_dept AS dept, i.category_code AS cat, i.severity_level AS sev, ${fmt("i.first_reported_at")} AS reportedAt,
            ${fmt("i.sla_due_at")} AS slaDueAt, i.place_text AS place, i.zone_name AS zoneName, i.ward_no AS ward, i.officer, i.sources, i.channels, i.media_only
     FROM incidents i JOIN ref_departments dp ON dp.code = i.lead_dept AND dp.action_owner = 1
     WHERE i.is_open = 1 AND i.category_code IN (?) AND i.first_reported_at >= ? AND i.first_reported_at <= ?
       AND NOT EXISTS (SELECT 1 FROM ${ops("officer_steps")} s WHERE s.incident_id = i.incident_id)
       AND NOT EXISTS (SELECT 1 FROM ${ops("collector_decisions")} d WHERE d.incident_id = i.incident_id)
       AND NOT EXISTS (SELECT 1 FROM ${ops("outbound_emails")} m WHERE m.incident_id = i.incident_id)
       AND NOT EXISTS (SELECT 1 FROM ${ops("followups")} f WHERE f.incident_id = i.incident_id)`,
    [RESOLVABLE_CATEGORIES, from, to]);
  if (!rows.length) return [];
  const ids = rows.map((r) => String(r.id));
  const facts = new Map(ids.map((id) => [id, { events: 0, realEvents: 0, codes: [] as string[] }]));
  for (const part of chunks(ids)) {
    // every member event (an event the build no longer has counts as real: nothing unknown is resolved), and every event filed to the case
    const [members, events] = await Promise.all([
      q(`SELECT m.incident_id AS id, COUNT(*) AS n, SUM(CASE WHEN e.event_id IS NULL OR COALESCE(e.is_synthetic, 0) <> 1 THEN 1 ELSE 0 END) AS real_n
         FROM incident_members m LEFT JOIN events e ON e.event_id = m.event_id WHERE m.incident_id IN (?) GROUP BY m.incident_id`, [part]),
      q(`SELECT incident_id AS id, source, source_record_id AS code, COALESCE(is_synthetic, 0) AS syn FROM events WHERE incident_id IN (?)`, [part])
    ]);
    for (const m of members) { const f = facts.get(String(m.id)); if (f) { f.events += Number(m.n); f.realEvents += Number(m.real_n); } }
    for (const e of events) {
      const f = facts.get(String(e.id));
      if (!f) continue;
      f.events += 1;
      if (Number(e.syn) !== 1) f.realEvents += 1;
      if (e.source === "grievance" && e.code) f.codes.push(String(e.code));
    }
  }
  // the portal's own complaints and petitions filed into these cases: a real one (is_synthetic 0) keeps the case out
  const codes = [...new Set([...facts.values()].flatMap((f) => f.codes))];
  const realCodes = new Set<string>();
  for (const part of chunks(codes)) {
    const [r] = await pool.query<RowDataPacket[]>(`SELECT complaint_code AS code FROM complaints WHERE complaint_code IN (?) AND COALESCE(is_synthetic, 0) <> 1`, [part]);
    for (const x of r) realCodes.add(String(x.code));
  }
  const petitioned = new Set<string>();
  for (const part of chunks(ids)) {
    try {
      const [r] = await pool.query<RowDataPacket[]>(`SELECT incident_id AS id FROM petitions WHERE incident_id IN (?)`, [part]);
      for (const x of r) petitioned.add(String(x.id));
    } catch (e) {
      // a store without the Manu table has no petitions; any other failure stops the run (nothing is resolved on a guess)
      if (!/doesn't exist|no such table|ER_NO_SUCH_TABLE/i.test(String((e as Error).message))) throw e;
    }
  }
  return rows.filter((r) => {
    const f = facts.get(String(r.id))!;
    return isGeneratedOnly({ events: f.events, realEvents: f.realEvents, sources: r.sources, channels: r.channels, mediaOnly: r.media_only,
      realComplaints: f.codes.filter((c) => realCodes.has(c)).length, petitions: petitioned.has(String(r.id)) ? 1 : 0 });
  }).map((r) => ({ id: String(r.id), dept: String(r.dept), cat: String(r.cat), sev: r.sev ?? null, reportedAt: String(r.reportedAt), slaDueAt: r.slaDueAt ?? null,
    place: r.place ?? null, zoneName: r.zoneName ?? null, ward: r.ward == null ? null : Number(r.ward), officer: r.officer ?? null }));
}

export interface PlannedResolution {
  day: string; slot: number; at: string; via: boolean; c: Candidate; remark: string; times: ReturnType<typeof stepTimes>; officer: string;
}

/**
 * The field officer who files it: the designation the case's record gives (the generated record names one: "AE, Zone 9", "SHO, Kannagi Nagar
 * Police Station"), else the department's field officer. Only the designation: a person's name in it ("... Division (V. Karthikeyan)") is
 * dropped, so no generated step is ever put in a real person's name.
 */
export function officerOf(c: { officer: string | null; dept: string; zoneName?: string | null }): string {
  // a generic role only: a named office or station ("Executive Engineer, Cooum Basin Division", "SHO, Mylapore Police Station") is a post
  // one real person holds, so generated work is never put on it. The zone is kept when the case has one.
  const zone = String(c.zoneName ?? "").trim();
  return `${deptConfig(c.dept).short} field officer${zone ? `, ${zone} zone` : ""}`;
}

/** The resolutions due now: each slot of `days` whose time has passed and that is not done, with its case, its way and its times. */
export function planDue(days: string[], now: string, done: Set<string>, pool0: Candidate[], fixedPerDay?: number | null): PlannedResolution[] {
  const out: PlannedResolution[] = [];
  const taken = new Set<string>();
  for (const day of days) {
    const n = perDay(day, fixedPerDay);
    const slots = daySlots(day, n);
    const toCollector = collectorSlots(n, day);
    // the departments in a seeded order for the day, each slot starting one further along, so a day spreads over several departments
    const depts = [...new Set(pool0.map((c) => c.dept))].sort((a, b) => hash32(`${day}|${a}`) - hash32(`${day}|${b}`));
    slots.forEach((at, k) => {
      if (at > now || done.has(`${day}#${k}`)) return;
      const turn = depts.length ? [...depts.slice(k % depts.length), ...depts.slice(0, k % depts.length)] : [];
      const c = pickCandidate(pool0, at, taken, turn, `${day}#${k}`);
      if (!c) return;
      taken.add(c.id);
      const via = viaCollector(toCollector[k], c.sev);
      out.push({ day, slot: k, at, via, c, remark: remarkFor(c.cat, c.place, `${day}#${k}|${c.id}`), times: stepTimes(c.reportedAt, at, via, `${day}#${k}|${c.id}`), officer: officerOf(c) });
    });
  }
  return out;
}

export interface RunResult { days: string[]; due: number; written: number; viaCollector: number; closedByOfficer: number; skipped: string[]; ids: string[]; backfill: boolean }

/**
 * Writes the resolutions due now (each in its own transaction, re-checking under it that nobody has touched the case meanwhile), then
 * tells the residents' trackers (synthetic complaints only, by the selection) and empties the caches once.
 * `now` (IST) and `perDay` for tests and the dry-run script; `sync: false` leaves the complaints' statuses alone.
 */
export async function runSyntheticResolutions(opts: { now?: string; perDay?: number | null; backDays?: number; sync?: boolean; log?: (s: string) => void } = {}): Promise<RunResult> {
  const now = opts.now ?? istNow();
  const log = opts.log ?? (() => undefined);
  const today = now.slice(0, 10);
  const [marked] = await Promise.all([q(`SELECT 1 AS x FROM ${ops("audit_log")} WHERE action = ? LIMIT 1`, [BACKFILL_ACTION])]);
  const backfill = !marked.length;
  const days = daysToFill(today, opts.backDays ?? (backfill ? BACKFILL_DAYS : 2));
  const done = await doneSlots(days);
  const firstSlot = daySlots(days[0], perDay(days[0], opts.perDay))[0];
  const from = fromMs(toMs(firstSlot) - 21 * 24 * 3_600_000), to = now;
  const pool0 = await generatedCandidates(from, to);
  const plan = planDue(days, now, done, pool0, opts.perDay);
  const res: RunResult = { days, due: plan.length, written: 0, viaCollector: 0, closedByOfficer: 0, skipped: [], ids: [], backfill };
  for (const p of plan) {
    try {
      if (await writeOne(p)) {
        res.written++;
        res.ids.push(p.c.id);
        if (p.via) res.viaCollector++; else res.closedByOfficer++;
      } else res.skipped.push(`${p.day}#${p.slot} ${p.c.id}: touched meanwhile or no photo`);
    } catch (e) {
      res.skipped.push(`${p.day}#${p.slot} ${p.c.id}: ${(e as Error).message}`);
    }
  }
  if (res.written) {
    bumpDataEpoch();
    if (opts.sync !== false) await syncComplaints(res.ids, null);
  }
  // the backfill is done once: marked when this run had nothing more to do for the past days
  if (backfill && !res.skipped.length) {
    await intelPool.query(`INSERT INTO ${ops("audit_log")} (actor, action, table_name, record_id, before_value, after_value) VALUES (?, ?, 'officer_steps', ?, NULL, ?)`,
      [SYNTH_ACTOR, BACKFILL_ACTION, today, JSON.stringify({ generated: true, source: "synthetic-resolutions", days, written: res.written })]);
  }
  log(`[resolutions] ${res.written} generated resolutions written (${res.viaCollector} approved by the Collector, ${res.closedByOfficer} closed by the officer)${res.skipped.length ? `, ${res.skipped.length} skipped` : ""}`);
  return res;
}

/** One generated resolution, in one transaction. False when the case was touched meanwhile or there is no photo to attach. */
async function writeOne(p: PlannedResolution): Promise<boolean> {
  const group = CATEGORY_PHOTOS[p.c.cat] ?? "street";
  const photo = await placePhoto(group, `${p.day}#${p.slot}|${p.c.id}`, p.times.report.slice(0, 10), { incident_id: p.c.id, day: p.day, slot: p.slot });
  if (!photo) return false;
  const conn = await intelPool.getConnection();
  const lock = `officer:${p.c.id}`;
  let locked = false;
  try {
    const [[l]] = await conn.query<RowDataPacket[]>(`SELECT GET_LOCK(?, 5) AS ok`, [lock]);
    locked = Number(l?.ok) === 1;
    if (!locked) { await removePlaced(photo.dir); return false; }
    const [touched] = await conn.query<RowDataPacket[]>(
      `SELECT 1 AS x FROM ${ops("officer_steps")} WHERE incident_id = ? UNION ALL SELECT 1 AS x FROM ${ops("collector_decisions")} WHERE incident_id = ? LIMIT 1`, [p.c.id, p.c.id]);
    if (touched.length) { await removePlaced(photo.dir); return false; }
    await conn.beginTransaction();
    const step = async (s: string, at: string, note: string | null, reportId: number | null) => {
      const [r] = await conn.query<ResultSetHeader>(
        `INSERT INTO ${ops("officer_steps")} (incident_id, dept_code, step, note, report_id, actor, actor_user_id, at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
        [p.c.id, p.c.dept, s, note, reportId, p.officer, at]);
      return r.insertId;
    };
    const approve = await step("approve", p.times.approve, null, null);
    const action = await step("action", p.times.action, null, null);
    const [rep] = await conn.query<ResultSetHeader>(
      `INSERT INTO ${ops("officer_reports")} (incident_id, dept_code, remarks, photo_dir, photos, sent_by, sent_user_id, sent_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      [p.c.id, p.c.dept, p.remark, photo.dir, JSON.stringify(photo.names), p.officer, p.times.report]);
    const last = await step(p.via ? "send" : "close", p.times.report, scrubCitizenDetails(p.remark), rep.insertId);
    const [dec] = p.via
      ? await conn.query<ResultSetHeader>(
        `INSERT INTO ${ops("collector_decisions")} (incident_id, decision, escalate_to, note, decided_by, decided_role, decided_at) VALUES (?, 'verify', NULL, ?, ?, 'collector', ?)`,
        [p.c.id, approvalNote(`${p.day}#${p.slot}`), COLLECTOR_OFFICE, p.times.close])
      : await conn.query<ResultSetHeader>(
        `INSERT INTO ${ops("collector_decisions")} (incident_id, decision, escalate_to, note, decided_by, decided_role, decided_at) VALUES (?, 'resolve', NULL, ?, ?, 'department_officer', ?)`,
        [p.c.id, `${CLOSED_BY_DEPARTMENT} ${scrubCitizenDetails(p.remark)}`, p.officer, p.times.close]);
    await conn.query(`INSERT INTO ${ops("audit_log")} (actor, action, table_name, record_id, before_value, after_value) VALUES (?, ?, 'officer_steps', ?, ?, ?)`,
      [SYNTH_ACTOR, SYNTH_ACTION, p.c.id, JSON.stringify({ stage: "open", severity_level: p.c.sev, reported_at: p.c.reportedAt }),
        JSON.stringify({ generated: true, source: "synthetic-resolutions", day: p.day, slot: p.slot, via: p.via ? "collector" : "officer", dept: p.c.dept,
          steps: [approve, action, last], report_id: rep.insertId, decision_id: dec.insertId, photo_dir: photo.dir, photo: photo.libraryFile, photo_made_by: photo.source,
          times: p.times })]);
    await conn.commit();
    return true;
  } catch (e) {
    await conn.rollback().catch(() => undefined);
    await removePlaced(photo.dir).catch(() => undefined);
    throw e;
  } finally {
    if (locked) await conn.query(`SELECT RELEASE_LOCK(?)`, [lock]).catch(() => undefined);
    conn.release();
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __synthResolveAt: number | undefined;
  // eslint-disable-next-line no-var
  var __synthResolveBusy: boolean | undefined;
}
/** how often the scheduler's tick runs it at most */
export const SYNTH_EVERY_MS = 10 * 60_000;

/**
 * The scheduler's call (lib/scheduler.ts): at most every 10 minutes, one run at a time. SYNTH_RESOLUTIONS=off turns it off. With the AWS
 * store it runs only on the copy that saves to AWS (lib/aws/store.ts savesToAws): another copy's rows would never reach the others and would
 * be made again by the saving copy. SYNTH_RESOLUTIONS_PER_DAY fixes the number a day (default 8 to 12).
 */
export async function syntheticTick(): Promise<void> {
  if (process.env.SYNTH_RESOLUTIONS === "off" || global.__synthResolveBusy) return;
  if (Date.now() - (global.__synthResolveAt ?? 0) < SYNTH_EVERY_MS) return;
  if (process.env.DATA_BACKEND === "aws" && process.env.SYNTH_RESOLUTIONS !== "force") {
    const { savesToAws } = await import("@/lib/aws/store");
    if (!savesToAws()) return;
  }
  global.__synthResolveAt = Date.now();
  global.__synthResolveBusy = true;
  try {
    const n = Number(process.env.SYNTH_RESOLUTIONS_PER_DAY);
    const r = await runSyntheticResolutions({ perDay: Number.isFinite(n) && n > 0 ? n : null });
    if (r.written || r.skipped.length) console.log(`[resolutions] ${r.written} written (${r.viaCollector} via the Collector)${r.skipped.length ? `; skipped: ${r.skipped.slice(0, 3).join("; ")}` : ""}`);
  } catch (e) {
    if (!/doesn't exist|no such table|ER_NO_SUCH_TABLE/i.test(String((e as Error).message))) console.warn(`[resolutions] skipped: ${(e as Error).message}`);
  } finally {
    global.__synthResolveBusy = false;
  }
}
