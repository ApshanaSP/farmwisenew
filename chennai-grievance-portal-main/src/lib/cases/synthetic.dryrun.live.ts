/**
 * 28 Nov 2026: the generated resolutions end to end on the REAL store, as a dry-run copy (AWS_STORE_DRY_RUN=1: the durable store is read
 * from AWS into a file of this run's own and nothing is ever sent back; photos go to a scratch folder). No AI call, no server.
 *   CASES_DRYRUN_DIR=<scratch folder> npx vitest run --config vitest.live.config.ts src/lib/cases/synthetic.dryrun.live.ts
 * Checks: the 14-day backfill writes only GENERATED cases; every invariant of each resolution; a second run writes nothing; the Resolved
 * tile and its list agree; the officer's Resolved list leads with the reports; then a Reopen and a question on the copy, with the counts.
 */
import fs from "fs";
import path from "path";
const scratch = process.env.CASES_DRYRUN_DIR || path.join(process.cwd(), "data", "aws-cache", "dryrun-cases");
fs.mkdirSync(path.join(scratch, "uploads"), { recursive: true });
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE = path.join(scratch, "durable.sqlite");
process.env.OFFICER_UPLOAD_DIR = path.join(scratch, "uploads");
process.env.CASE_PHOTO_LIBRARY ??= path.join(process.cwd(), "data", "case-photos");
process.env.JARVIS_KEEPWARM = "0";
process.env.DISTRICT_IQ_JOBS = "off";
process.env.AI_PROVIDER = "none";
process.env.JARVIS_CLAUDE_OFF = "1";
delete process.env.DATASET_DIR;
import { expect, it } from "vitest";

type Row = Record<string, any>;
const ist = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 19).replace("T", " ");

it("the 14-day backfill on a dry-run copy of the real store, then today's run, the lists and a reopen", async () => {
  // loaded here, after the environment above is set: the store reads its file and its dry-run switch when it loads
  await import("@/lib/collector/derive");
  const { default: intelPool, ops } = await import("@/lib/collector/db");
  const { asOf, kpiBlock } = await import("@/lib/collector/intel");
  const { savesToAws } = await import("@/lib/aws/store");
  const { deptProfile, grievanceDetail, grievanceList } = await import("@/lib/officer/data");
  const { BACKFILL_ACTION, SYNTH_ACTION, runSyntheticResolutions } = await import("./synthetic");
  const { resolvedList } = await import("./resolution");
  const { answerInquiry, askDepartment, caseNow, reopenCase } = await import("./lifecycle");
  const q = async (sql: string, p: unknown[] = []) => ((await intelPool.query(sql, p)) as unknown as [Row[]])[0];
  const t0 = Date.now();
  expect(process.env.AWS_STORE_DRY_RUN).toBe("1");
  await asOf();
  expect(savesToAws()).toBe(false);
  const before = (await q(`SELECT COUNT(*) AS n FROM ${ops("audit_log")} WHERE action = ?`, [SYNTH_ACTION]))[0].n;
  const hadBackfill = (await q(`SELECT COUNT(*) AS n FROM ${ops("audit_log")} WHERE action = ?`, [BACKFILL_ACTION]))[0].n;
  console.log(`store loaded in ${Math.round((Date.now() - t0) / 1000)} s; generated resolutions already on the copy: ${before}; backfill marked: ${hadBackfill}`);
  const now = ist();
  const kBefore = await kpiBlock({ period: "weekly", zone: null }, now);

  const r = await runSyntheticResolutions({ now, log: (s) => console.log(s) });
  console.log(JSON.stringify({ backfill: r.backfill, days: `${r.days[0]}..${r.days.at(-1)}`, due: r.due, written: r.written, viaCollector: r.viaCollector,
    closedByOfficer: r.closedByOfficer, skipped: r.skipped.slice(0, 5) }));
  expect(r.written).toBeGreaterThan(0);
  expect(r.skipped).toEqual([]);

  // every case written is GENERATED only, and every row is in order
  const ids = r.ids;
  const ph = (n: number) => Array(n).fill("?").join(", ");
  const real = await q(`SELECT DISTINCT e.incident_id AS id FROM events e WHERE e.incident_id IN (${ph(ids.length)}) AND COALESCE(e.is_synthetic, 0) <> 1`, ids);
  expect(real).toEqual([]);
  const realMembers = await q(`SELECT DISTINCT m.incident_id AS id FROM incident_members m LEFT JOIN events e ON e.event_id = m.event_id
    WHERE m.incident_id IN (${ph(ids.length)}) AND (e.event_id IS NULL OR COALESCE(e.is_synthetic, 0) <> 1)`, ids);
  expect(realMembers).toEqual([]);
  const codes = (await q(`SELECT source_record_id AS c FROM events WHERE source = 'grievance' AND incident_id IN (${ph(ids.length)})`, ids)).map((x) => String(x.c));
  if (codes.length) expect(await q(`SELECT complaint_code FROM complaints WHERE complaint_code IN (${ph(codes.length)}) AND COALESCE(is_synthetic, 0) <> 1`, codes)).toEqual([]);
  expect(await q(`SELECT incident_id FROM petitions WHERE incident_id IN (${ph(ids.length)})`, ids)).toEqual([]);
  const inc = await q(`SELECT incident_id AS id, severity_level AS sev, category_code AS cat, lead_dept AS dept, DATE_FORMAT(first_reported_at, '%Y-%m-%d %H:%i:%s') AS t, sources, channels
    FROM incidents WHERE incident_id IN (${ph(ids.length)})`, ids);
  const byDay: Record<string, { n: number; via: number }> = {}, byDept: Record<string, number> = {}, byCat: Record<string, number> = {};
  const actors = new Set<string>();
  for (const i of inc) {
    expect(String(i.sources)).not.toMatch(/news|imd|cpcb|cfm/);
    expect(String(i.channels)).not.toMatch(/citizen_grievance|manu/);
    const steps = await q(`SELECT step, DATE_FORMAT(at, '%Y-%m-%d %H:%i:%s') AS at FROM ${ops("officer_steps")} WHERE incident_id = ? ORDER BY step_id`, [i.id]);
    const dec = await q(`SELECT decision, decided_role AS role, DATE_FORMAT(decided_at, '%Y-%m-%d %H:%i:%s') AS at FROM ${ops("collector_decisions")} WHERE incident_id = ?`, [i.id]);
    const rep = await q(`SELECT photo_dir AS dir, photos FROM ${ops("officer_reports")} WHERE incident_id = ?`, [i.id]);
    expect(steps.map((s) => s.step).slice(0, 2)).toEqual(["approve", "action"]);
    for (const s of await q(`SELECT actor FROM ${ops("officer_steps")} WHERE incident_id = ?`, [i.id])) actors.add(String(s.actor));
    expect(String(steps[0].at) > String(i.t) && steps[0].at < steps[1].at && steps[1].at < steps[2].at && steps[2].at <= dec[0].at && dec[0].at <= now).toBe(true);
    const via = steps[2].step === "send";
    if (i.sev === "Severe") expect(via).toBe(true);
    expect(dec[0]).toMatchObject(via ? { decision: "verify", role: "collector" } : { decision: "resolve", role: "department_officer" });
    expect(fs.existsSync(path.join(scratch, "uploads", String(rep[0].dir), "1.jpg"))).toBe(true);
    const day = String(dec[0].at).slice(0, 10);
    byDay[day] = { n: (byDay[day]?.n ?? 0) + 1, via: (byDay[day]?.via ?? 0) + (via ? 1 : 0) };
    byDept[i.dept] = (byDept[i.dept] ?? 0) + 1;
    byCat[i.cat] = (byCat[i.cat] ?? 0) + 1;
  }
  console.log("per day (written, via Collector):", JSON.stringify(byDay));
  console.log("officers named on the steps (designations only):", JSON.stringify([...actors].slice(0, 12)));
  expect([...actors].some((x) => /\(/.test(x))).toBe(false);
  console.log("per department:", JSON.stringify(byDept));
  console.log("per kind:", JSON.stringify(byCat));
  console.log("severities:", JSON.stringify(inc.reduce((m: Row, i) => ({ ...m, [i.sev]: (m[i.sev] ?? 0) + 1 }), {})));
  const audits = await q(`SELECT after_value FROM ${ops("audit_log")} WHERE action = ?`, [SYNTH_ACTION]);
  expect(audits.length).toBe(Number(before) + r.written);
  expect(audits.every((a) => JSON.parse(String(a.after_value)).generated === true)).toBe(true);

  // idempotent
  const again = await runSyntheticResolutions({ now });
  console.log(`second run: ${again.written} written, days ${again.days.join(", ")}`);
  expect(again.written).toBe(0);

  // the Collector's Resolved tile and the list it opens agree; the list leads with the reports
  for (const period of ["daily", "weekly"] as const) {
    const k = await kpiBlock({ period, zone: null }, now);
    const l = await resolvedList({ period, zone: null, dept: null, sev: null, q: null, page: 0 });
    console.log(`${period}: Resolved tile ${k.cur.resolved}, list ${l.total}, with a completion report ${l.withReport}; first rows: ${l.rows.slice(0, 3).map((x) => `${x.id} ${x.resolution?.approvedBy} ${x.resolution?.photos?.length ?? 0} photo`).join("; ")}`);
    expect(l.total).toBe(k.cur.resolved);
    expect(l.rows[0]?.has_report).toBe(true);
  }
  const kAfter = await kpiBlock({ period: "weekly", zone: null }, now);
  console.log(`weekly Resolved before the run ${kBefore.cur.resolved}, after ${kAfter.cur.resolved}; ongoing ${kBefore.cur.ongoing} -> ${kAfter.cur.ongoing}`);

  // the officer's own Resolved list (the Verified tab) for the department with the most
  const top = Object.entries(byDept).sort((a, b) => b[1] - a[1])[0][0];
  const dept = (await deptProfile(top))!;
  const v = await grievanceList(dept, { tab: "verified", period: "monthly", zone: null, taluk: null, page: 0, per: 8, cat: null, q: null });
  console.log(`${top} Verified tab: ${v.total} cases; first: ${v.rows.slice(0, 3).map((x) => `${x.id} ${x.resolution?.approvedBy ?? "-"} ${x.resolution?.photos?.length ?? 0}`).join("; ")}`);
  expect(v.rows[0]?.resolution?.report).toBe(true);

  // Reopen one, ask about another, on this copy only: the newest ones, closed inside the week, so the counts move
  const [a, b] = [ids[ids.length - 1], ids[ids.length - 2]];
  const k1 = await kpiBlock({ period: "weekly", zone: null }, now);
  await reopenCase(a, "Dry-run check: the spot needs a second look before this can stay closed.", { email: "dryrun@local", role: "collector", userId: null });
  expect(await caseNow(a)).toMatchObject({ open: 1, status: "Open" });
  const k2 = await kpiBlock({ period: "weekly", zone: null }, now);
  console.log(`after a reopen: weekly Resolved ${k1.cur.resolved} -> ${k2.cur.resolved}, ongoing ${k1.cur.ongoing} -> ${k2.cur.ongoing}`);
  expect(k2.cur.resolved).toBe(k1.cur.resolved - 1);
  const da = inc.find((x) => x.id === a)!.dept;
  const ga = (await grievanceDetail((await deptProfile(da))!, a))!;
  expect(ga.grievance).toMatchObject({ stage: "action", returned: true, reopened: true });
  const qn = await askDepartment(b, "Dry-run check: was the whole stretch covered?", { email: "dryrun@local", role: "collector", userId: null });
  const db = inc.find((x) => x.id === b)!.dept;
  expect((await grievanceDetail((await deptProfile(db))!, b))!.grievance).toMatchObject({ stage: "verified", asked: true });
  await answerInquiry(db, b, qn.decisionId, "Dry-run answer: yes, all of it.", { email: "dryrun-officer@local", role: "department_officer", userId: null });
  expect((await grievanceDetail((await deptProfile(db))!, b))!.grievance).toMatchObject({ asked: false });
  console.log(`done in ${Math.round((Date.now() - t0) / 1000)} s; nothing was sent to AWS (dry run: ${!savesToAws()})`);
});
