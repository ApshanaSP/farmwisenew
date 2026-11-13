// QA pass 7, collector-ops: the P7 reviewer 2 breaks of b4ea9c1 (P1 rows), kept as regression tests; each failed before the fix in the commit that adds this file.
//   QA_PIN_PORT=3192 npx vitest run --config tests/qa/pass7/collector-ops/vitest.real.config.ts tests/qa/pass7/collector-ops/review2-breaks.real.spec.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { COLLECTOR, decide } from "./lib";
import intelPool from "@/lib/collector/db";
import { asOf, overview, type Period } from "@/lib/collector/intel";
import { insights } from "@/lib/collector/insights";
import { sendBatchAction } from "@/lib/collector/actionmail";
import { deptProfile, grievanceList, officerOverview, recordStep } from "@/lib/officer/data";

beforeAll(async () => { await asOf(); }, 300_000);
const rows = async (sql: string, p: unknown[] = []) => ((await intelPool.query(sql, p)) as unknown as [Record<string, any>[]])[0];
const OPS = "`district_intel_ops`";
const NO_DEC = `i.incident_id NOT IN (SELECT incident_id FROM ${OPS}.\`collector_decisions\`) AND i.incident_id NOT IN (SELECT incident_id FROM ${OPS}.\`officer_steps\`)`;

// runs first: on the untouched snapshot
describe("console-sync-07 elsewhere: every per-department 'waiting for your check' figure is My Tasks", () => {
  it("the Briefing's department follow-ups ('N to check'; Jarvis dept_followups 'Awaiting verification, X') agree with the departments table", async () => {
    const ov = await overview("quarterly", null, null);
    const ins = await insights("quarterly", null, null, {}, "briefing") as unknown as { deptActions: { code: string; awaiting: number }[] };
    const diff = ins.deptActions.map((d) => ({ code: d.code, briefing: d.awaiting, table: ov.deptNav.find((x) => x.code === d.code)?.unverified ?? 0 }))
      .filter((x) => x.briefing !== x.table);
    console.log("R2-BRIEF " + JSON.stringify({ tasks: ov.tasks.count, diff }));
    expect(diff).toEqual([]);
  });
});

describe("console-sync-06: a severe case the department sent from the officer console ('the department asking for the Collector's check')", () => {
  it("is in My Tasks and in 'Severe, not yet checked'", async () => {
    const [c] = await rows(`SELECT i.incident_id AS id, i.lead_dept AS dept FROM incidents i JOIN ref_departments d ON d.code = i.lead_dept AND d.action_owner = 1
      WHERE i.is_open = 1 AND i.severity_level = 'Severe' AND i.verified = 1 AND i.awaiting_collector = 0 AND i.status_std IN ('Open', 'Under review')
      AND ${NO_DEC} ORDER BY i.incident_id LIMIT 1`);
    expect(c).toBeTruthy();
    const snap = async () => {
      const ov = await overview("weekly", null, null);
      return { tile: (ov.snapshot as unknown as { critical: number }).critical, tasks: ov.tasks.count };
    };
    const before = await snap();
    const dept = (await deptProfile(c.dept))!;
    const officer = { email: "qa-r2-officer@example.test", userId: 990002 };
    await recordStep(dept, c.id, "approve", officer);
    await recordStep(dept, c.id, "send", officer, { remarks: "Work done on site, photos attached.", photoDir: "qa-r2", photos: [] });
    const after = await snap();
    console.log("R2-CRIT " + JSON.stringify({ id: c.id, dept: c.dept, before, after }));
    expect(after.tasks, "My Tasks takes the officer's report").toBe(before.tasks + 1);
    expect(after.tile, "'Severe, not yet checked'").toBe(before.tile + 1);
  });
});

describe("hunt2-ops-05: an old case the Collector sends back", () => {
  it("is not a grievance 'reported' in the first bucket of the officer's trend chart", async () => {
    const now = await asOf();
    const [c] = await rows(`SELECT i.incident_id AS id, DATE_FORMAT(i.first_reported_at, '%Y-%m-%d') AS t FROM incidents i WHERE i.lead_dept = 'GCC-SWM' AND i.is_open = 0
      AND i.status_std = 'Resolved' AND i.first_reported_at < ? - INTERVAL 100 DAY AND ${NO_DEC} ORDER BY i.first_reported_at DESC LIMIT 1`, [now]);
    const dept = (await deptProfile("GCC-SWM"))!;
    const trend = async (period: Period) => {
      const o = await officerOverview(dept, { period, zone: null, taluk: null }) as unknown as { trend: { v: number[] }[]; byType: { v: number }[] };
      return { first: o.trend.reduce((s, x) => s + (x.v[0] ?? 0), 0), all: o.trend.reduce((s, x) => s + x.v.reduce((a, b) => a + b, 0), 0), types: o.byType.reduce((s, x) => s + x.v, 0) };
    };
    const before = { daily: await trend("daily"), weekly: await trend("weekly") };
    expect((await decide([c.id], "reopen", "Not done: still there.")).status).toBe(201);
    const after = { daily: await trend("daily"), weekly: await trend("weekly") };
    console.log("R2-TREND " + JSON.stringify({ id: c.id, reported: c.t, now, before, after }));
    // the fix: it is in the In action tab
    const l = await grievanceList(dept, { tab: "action", period: "daily", zone: null, taluk: null, page: 0, per: 100, cat: null, q: c.id });
    expect(l.rows.map((r) => r.id)).toContain(c.id);
    // but "Grievances reported across the period" must not date it into the period's first bucket
    expect(after.daily.first, "daily trend, first bucket").toBe(before.daily.first);
    expect(after.weekly.first, "weekly trend, first bucket").toBe(before.weekly.first);
  });
});

describe("hunt2-ops-11 on the officer console: the department board's map legend", () => {
  it("shows the pins drawn, not every pin of the layer (the officer's Board.tsx still prints layerCounts)", async () => {
    const dept = (await deptProfile("GCC-SWM"))!;
    const o = await officerOverview(dept, { period: "quarterly", zone: null, taluk: null }) as unknown as
      { board: { map: { pins: unknown[]; drawn: Record<string, number>; layerCounts: Record<string, number> } } };
    const m = o.board.map;
    const src = readFileSync(join(process.cwd(), "src/components/officer/Board.tsx"), "utf8");
    const legend = src.slice(src.indexOf("const LAYERS"), src.indexOf("] as const", src.indexOf("const LAYERS")));
    const shown = /layerCounts/.test(legend) && !/drawn/.test(legend) ? m.layerCounts : m.drawn;
    console.log("R2-OFFMAP " + JSON.stringify({ pins: m.pins.length, drawn: m.drawn, layerCounts: m.layerCounts, legendUses: /drawn/.test(legend) ? "drawn" : "layerCounts" }));
    expect(m.pins.length).toBe(150);
    for (const k of ["severe", "complaint", "other"]) expect(shown[k], k).toBe(m.drawn[k]);
  });
});

describe("reviewer4-02 (theoretical reach): the same case id twice, 500 apart in one send", () => {
  it("writes one follow-up per case", async () => {
    const ids = (await rows(`SELECT incident_id AS id FROM incidents WHERE lead_dept = 'GCC-SWM' ORDER BY incident_id LIMIT 500`)).map((r) => String(r.id));
    expect(ids.length).toBe(500);
    const r = await sendBatchAction({ dept: "GCC-SWM", ids: [...ids, ids[0]], subject: `QA7R2 dup ${Date.now()}`,
      body: "Please clear these garbage points and send a completion report with photos for each one of them.", plan: null }, COLLECTOR.email);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const twice = await rows(`SELECT incident_id, COUNT(*) AS n FROM ${OPS}.\`followups\` WHERE email_id = ? GROUP BY incident_id HAVING COUNT(*) > 1`, [r.body.id]);
    console.log("R2-BATCH " + JSON.stringify({ followups: r.body.followups, twice }));
    expect(r.body.followups).toBe(500);
    expect(twice).toEqual([]);
  });
});
