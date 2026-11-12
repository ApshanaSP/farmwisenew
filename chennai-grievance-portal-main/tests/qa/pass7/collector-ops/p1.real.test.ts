// QA pass 7, collector-ops P1 rows on the pinned snapshot: the real overview(), list(), exportRows(), sendBatchAction() and decisions
// route (session and password step stubbed in ./lib), each against the figure the Collector compares it with.
//   QA_PIN_PORT=3192 npx vitest run --config tests/qa/pass7/collector-ops/vitest.real.config.ts tests/qa/pass7/collector-ops/p1.real.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { decide } from "./lib";
import intelPool from "@/lib/collector/db";
import { sendBatchAction } from "@/lib/collector/actionmail";
import { actionEmails, asOf, exportRows, list, overview, type Period } from "@/lib/collector/intel";
import { deptProfile, grievanceDetail } from "@/lib/officer/data";

beforeAll(async () => { await asOf(); }, 300_000);
const rows = async (sql: string, p: unknown[] = []) => ((await intelPool.query(sql, p)) as unknown as [Record<string, any>[]])[0];
type Ov = Awaited<ReturnType<typeof overview>>;

describe("console-sync-03: the CSV's 'Closed work to check' is My Tasks", () => {
  for (const [period, dept] of [["daily", null], ["weekly", null], ["monthly", null], ["monthly", "GCC-SWM"], ["quarterly", null]] as [Period, string | null][]) {
    it(`${period} ${dept ?? "district"}`, async () => {
      const ov = await overview(period, null, dept);
      const csv = (await exportRows(period, null, dept)).filter((r) => r.list === "Closed work to check");
      expect(csv.length).toBe(ov.tasks.count);
      expect(new Set(csv.map((r) => r.id)).size).toBe(csv.length);
    });
  }
});

describe("console-sync-07: the departments table's 'Awaiting your verification' is each department's My Tasks", () => {
  for (const period of ["weekly", "quarterly"] as Period[]) {
    it(period, async () => {
      const ov = await overview(period, null, null);
      const withTasks = ov.deptNav.filter((d) => d.unverified > 0).map((d) => d.code);
      const sample = [...new Set([...withTasks.slice(0, 4), "GCC-SWM", ov.deptNav[0]?.code].filter(Boolean))] as string[];
      for (const code of sample) {
        const own = await overview(period, null, code);
        expect(ov.deptNav.find((d) => d.code === code)?.unverified ?? 0, code).toBe(own.tasks.count);
      }
    });
  }
});

describe("console-sync-06: a severe case resolved and then reopened is 'Severe, not yet checked' again", () => {
  it("leaves the tile and the list on resolve, comes back to both on reopen", async () => {
    const f = { period: "weekly", zone: null, dept: null, sev: null, cat: null, taluk: null, status: "critical", q: null, sort: "t", dir: -1, page: 1, scope: "all" } as const;
    const tile = async () => ((await overview("weekly", null, null)) as unknown as { snapshot: { critical: number } }).snapshot.critical;
    const listed = async () => ((await list(f as never)) as unknown as { incidents: number }).incidents;
    const [c] = await rows(`SELECT incident_id AS id FROM incidents WHERE is_open = 1 AND severity_level = 'Severe' AND verified = 0 AND awaiting_collector = 0
      AND incident_id NOT IN (SELECT incident_id FROM \`district_intel_ops\`.\`collector_decisions\`) ORDER BY incident_id LIMIT 1`);
    const before = { tile: await tile(), list: await listed() };
    expect(before.tile).toBe(before.list);
    expect((await decide([c.id], "resolve")).status).toBe(201);
    expect(await tile()).toBe(before.tile - 1);
    expect((await decide([c.id], "reopen")).status).toBe(201);
    expect({ tile: await tile(), list: await listed() }).toEqual(before);
  });
});

describe("hunt2-ops-11: the map legend says how many pins are drawn", () => {
  for (const period of ["weekly", "monthly", "quarterly"] as Period[]) {
    it(`${period}, zone 4`, async () => {
      const m = (await overview(period, 4, null) as Ov).map;
      for (const k of ["severe", "complaint", "other"] as const) {
        expect(m.drawn[k], k).toBe(m.pins.filter((p) => p.cat === k).length);
        expect(m.layerCounts[k], k).toBeGreaterThanOrEqual(m.drawn[k]);
        if (m.pins.length < m.pinLimit) expect(m.drawn[k], `${k}: nothing was cut`).toBe(m.layerCounts[k]);
      }
      expect(m.pins.length).toBeLessThanOrEqual(m.pinLimit);
    });
  }
});

describe("reviewer4-02: a 30-case batch email reaches every case, not the first 25", () => {
  it("cases 26 to 30 show the instruction in the officer's drawer and the Collector's case emails", async () => {
    const open = await rows(`SELECT incident_id AS id FROM incidents WHERE lead_dept = 'GCC-SWM' AND is_open = 1 ORDER BY priority_score DESC LIMIT 30`);
    expect(open).toHaveLength(30);
    const subject = `QA7 batch ${Date.now()}`;
    const r = await sendBatchAction({ dept: "GCC-SWM", ids: open.map((x) => x.id), subject, body: "Please clear these thirty garbage points and send a completion report with photos for each.", plan: null }, "qa-p7@example.test");
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.followups).toBe(30);
    const dept = (await deptProfile("GCC-SWM"))!;
    const fups = await rows(`SELECT incident_id FROM \`district_intel_ops\`.\`followups\` WHERE email_id = ?`, [r.body.id]);
    expect(new Set(fups.map((f) => f.incident_id))).toEqual(new Set(open.map((x) => x.id)));
    for (const { id } of open) {
      const d = await grievanceDetail(dept, id) as unknown as { instructions?: { subject: string }[] } | null;
      expect(d?.instructions?.map((x) => x.subject) ?? [], id).toContain(subject);
      expect((await actionEmails([id])).map((x) => x.subject), id).toContain(subject);
    }
  });
});

describe("hunt2-ops-05: a case the Collector sends back is in the department's queue whatever its date", () => {
  it("an old resolved GCC-SWM case reopened by the Collector is in In action, its count and search, in every period", async () => {
    const { grievanceList, search, officerOverview } = await import("@/lib/officer/data");
    const now = await asOf();
    const [c] = await rows(`SELECT incident_id AS id FROM incidents WHERE lead_dept = 'GCC-SWM' AND is_open = 0 AND status_std = 'Resolved'
      AND first_reported_at < ? - INTERVAL 100 DAY ORDER BY first_reported_at DESC LIMIT 1`, [now]);
    const dept = (await deptProfile("GCC-SWM"))!;
    const returned = async (period: Period) => (await officerOverview(dept, { period, zone: null, taluk: null }) as unknown as { counts: { returned: number } }).counts.returned;
    const before = { daily: await returned("daily"), quarterly: await returned("quarterly") };
    expect((await decide([c.id], "reopen", "Not done: the garbage point is still there.")).status).toBe(201);
    for (const period of ["daily", "monthly", "quarterly"] as Period[]) {
      const l = await grievanceList(dept, { tab: "action", period, zone: null, taluk: null, page: 0, per: 100, cat: null, q: c.id });
      expect(l.rows.map((r) => r.id), period).toContain(c.id);
    }
    expect((await search(dept, c.id)).map((r) => r.id)).toContain(c.id);
    expect(await returned("daily")).toBe(before.daily + 1);
    expect(await returned("quarterly")).toBe(before.quarterly + 1);
  });
});

describe("console-sync-03 with work waiting: the CSV keeps to the period and to one row per group", () => {
  it("a closure updated 60 days ago is not in the daily CSV, and two closures of one group are one row", async () => {
    const now = await asOf();
    const sev = await rows(`SELECT incident_id AS id FROM incidents WHERE is_open = 1 AND severity_level = 'Severe' AND citizen_complaints > 0
      AND incident_id NOT IN (SELECT incident_id FROM \`district_intel_ops\`.\`collector_decisions\`) ORDER BY incident_id LIMIT 3`);
    expect(sev).toHaveLength(3);
    const [a, b, c] = sev.map((x) => String(x.id));
    // the pipeline marks them reported done (awaiting_collector): a and b today, in one group; c 60 days ago
    await intelPool.query(`UPDATE incidents SET awaiting_collector = 1, last_update_at = ? - INTERVAL 2 HOUR, cluster_id = 'QA7-G' WHERE incident_id IN (?, ?)`, [now, a, b]);
    await intelPool.query(`UPDATE incidents SET awaiting_collector = 1, last_update_at = ? - INTERVAL 60 DAY WHERE incident_id = ?`, [now, c]);
    const ov = await overview("daily", null, null);
    const csv = (await exportRows("daily", null, null)).filter((r) => r.list === "Closed work to check").map((r) => String(r.id));
    expect(ov.tasks.count).toBeGreaterThanOrEqual(1);
    expect(csv.length).toBe(ov.tasks.count);
    expect(csv).not.toContain(c);
    expect(csv.filter((id) => id === a || id === b)).toHaveLength(1);
  });
});
