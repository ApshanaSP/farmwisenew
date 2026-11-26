/**
 * The department summary and the Briefing's filters on an isolated in-memory store, through the AWS store's MySQL -> SQLite translation
 * (26 Nov 2026): a department's figures are the Overview's tiles with that department chosen, nothing of another department is in them, and
 * every element of the Briefing follows the period, zone, taluk, department and category (dashboard.md, "Filter issues found", 1 to 6).
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, prompts: [] as string[], lane: 0 }));
const pool = {
  query: async (sql: string, params: unknown[] = []) => {
    const [s, p] = expand(translate(sql), params);
    let st;
    for (let tries = 0; !st; tries++) {
      try {
        st = h.db.prepare(s);
      } catch (e) {
        const msg = String((e as Error).message);
        if (/no such table/i.test(msg)) return [[]];
        const col = /no such column: i\.(\w+)/.exec(msg)?.[1];
        if (col && tries < 60) { h.db.exec(`ALTER TABLE incidents ADD COLUMN ${col}`); continue; }
        throw e;
      }
    }
    return /^\s*(SELECT|WITH)/i.test(s) ? [st.all(...(p as never[]))] : [{ affectedRows: Number(st.run(...(p as never[])).changes) }];
  }
};
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t, OPS_DB: "district_intel_ops", TITLE: "i.title", CLUSTER: "COALESCE(i.cluster_id, i.incident_id)" }));
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/collector/lakes", () => ({ cmwssbLakes: async () => null }));
// a red warning is in force for the whole district
vi.mock("@/lib/collector/alerts", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  alertLane: async () => (h.lane++, { banner: { tone: "red", title: "Cyclone Arnab · red for Chennai", line: "" }, event: { hazard: "cyclone", name: "Arnab" }, sources: [], agreement: "agree", agreementText: "IMD has a red warning for Chennai.",
    officialLevel: 3, newsOutlets: 9, stale: [], fallback: null, status: { level: "alert", reasons: ["IMD red warning for Chennai"] }, news: [] })
}));
vi.mock("@/lib/ai/gateway", async (orig) => ({ ...(await orig<Record<string, unknown>>()), generateJson: async (a: { prompt: string }) => { h.prompts.push(a.prompt); throw new Error("no model in tests"); } }));

const intel = await import("./intel");
const { deptSummary } = await import("./deptsummary");
const { briefingBook } = await import("./briefbook");
const { dayBrief, deptBrief } = await import("./aibrief");
const { bumpDataEpoch } = await import("./epoch");
const { plain } = await import("./glance");

// the middle of an India day, so "today" always holds the hours these cases use
const NOW_UTC = "2026-11-26T09:00:00Z"; // 14:30 IST
const ist = (hoursAgo: number) => new Date(Date.parse(NOW_UTC) + 330 * 60_000 - hoursAgo * 3600_000).toISOString().slice(0, 19).replace("T", " ");

function fresh() {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, title TEXT, cluster_id TEXT, category_label TEXT, category_code TEXT, family TEXT, lead_dept TEXT, zone_no INTEGER,
      zone_name TEXT, ward_no INTEGER, taluk_code TEXT, place_text TEXT, lat REAL, lon REAL, severity_level TEXT, status_std TEXT, is_open INTEGER, verified INTEGER, citizen_complaints INTEGER,
      outlet_count INTEGER, sources TEXT, source_count INTEGER, first_reported_at TEXT, priority_score REAL, sla_breached INTEGER, sla_due_at TEXT, closed_at TEXT, media_only INTEGER,
      awaiting_collector INTEGER, last_update_at TEXT, dead INTEGER, injured INTEGER, member_count INTEGER);
    CREATE TABLE ref_departments (code TEXT, name TEXT, org TEXT, head TEXT, route TEXT, action_owner INTEGER);
    CREATE TABLE ref_wards (ward_no INTEGER, zone_no INTEGER, zone_name TEXT, taluk_code TEXT, centroid_lat REAL, centroid_lon REAL);
    CREATE TABLE ref_taluks (taluk_code TEXT, name TEXT);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, escalate_to TEXT, note TEXT, decided_by TEXT, decided_at TEXT);
    CREATE TABLE dept_assignments (incident_id TEXT, dept_code TEXT, status TEXT);
    CREATE TABLE incident_members (incident_id TEXT, source TEXT);
    CREATE TABLE metrics (metric TEXT, value TEXT);
    CREATE TABLE anomalies (category_code TEXT, zone_no INTEGER, date TEXT, observed INTEGER, expected REAL, ratio REAL, kind TEXT, rise_days INTEGER);
    CREATE TABLE official_contacts (contact_id INTEGER, grp TEXT, dept_code TEXT, zone_no INTEGER, name TEXT, designation TEXT, office TEXT, phone TEXT, email TEXT, source_url TEXT, retrieved_on TEXT, "rank" INTEGER);
    CREATE TABLE followups (followup_id INTEGER PRIMARY KEY, email_id INTEGER, contact_id INTEGER, incident_id TEXT, summary TEXT, due_date TEXT, status TEXT);
    CREATE TABLE actions (action_id TEXT, incident_id TEXT, dept_code TEXT, owner TEXT, text TEXT, status TEXT, due_at TEXT);
    INSERT INTO ref_departments VALUES ('GCC-SWD', 'Storm Water Drains', 'GCC', 'Superintending Engineer', '', 1), ('POL-GCP', 'Greater Chennai Police', 'Police', 'Commissioner', '', 1);
    INSERT INTO ref_wards VALUES (118, 9, 'Teynampet', 'TLK-MYL', 13.04, 80.25), (172, 13, 'Adyar', 'TLK-GUI', 13.0, 80.25);
    INSERT INTO ref_taluks VALUES ('TLK-MYL', 'Mylapore'), ('TLK-GUI', 'Guindy');
    INSERT INTO official_contacts VALUES (1, 'SE', 'GCC-SWD', NULL, 'R. Prabhakar', 'Superintending Engineer', 'Ripon Building', '9445190732', 'se@example.org', 'https://x', '2026-09-28', 1);`);
  return db;
}
interface C { id: string; dept?: string; cat?: string; zone?: 9 | 13; sev?: string; at?: number; due?: number; closed?: number; complaints?: number; dead?: number }
function add(c: C) {
  const zone = c.zone ?? 9;
  h.db.prepare(`INSERT INTO incidents (incident_id, title, category_label, category_code, lead_dept, zone_no, zone_name, ward_no, taluk_code, severity_level, status_std, is_open, verified, citizen_complaints,
      outlet_count, first_reported_at, sla_breached, sla_due_at, closed_at, media_only, awaiting_collector, last_update_at, priority_score, place_text, sources, dead, injured, member_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, 0, ?, ?, 0, 0, ?, 1, 'Main Road', 'grievance', ?, 0, 1)`).run(
    c.id, `Case ${c.id}`, c.cat === "ROAD_ACCIDENT" ? "Road accident" : "Drainage", c.cat ?? "DRAINAGE_SEWAGE", c.dept ?? "GCC-SWD", zone, zone === 9 ? "Teynampet" : "Adyar", zone === 9 ? 118 : 172,
    zone === 9 ? "TLK-MYL" : "TLK-GUI", c.sev ?? "Medium", c.closed != null ? "Resolved" : "Open", c.closed != null ? 0 : 1, c.complaints ?? 0, ist(c.at ?? 3), ist(c.due ?? -24), c.closed != null ? ist(c.closed) : null,
    ist(1), c.dead ?? 0);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW_UTC) });
  h.db = fresh(); h.prompts = []; h.lane = 0;
  bumpDataEpoch();
  add({ id: "A", sev: "Severe", complaints: 2, dead: 1 });                          // today, open
  add({ id: "B", zone: 13, sev: "High", due: 1 });                                  // today, open, past its deadline
  add({ id: "C", cat: "FLOOD_RELIEF", zone: 13, at: 5, closed: 2, due: 1, complaints: 1 }); // today, closed in time
  add({ id: "D", at: 24 * 5, due: 24 * 4, complaints: 1 });                         // 5 days ago, open, past its deadline
  add({ id: "E", at: 24 * 20, closed: 1, due: 24 * 19 });                           // 20 days ago, closed today, late
  add({ id: "F", at: 24 * 40, sev: "Severe" });                                     // 40 days ago, open
  add({ id: "P", dept: "POL-GCP", cat: "ROAD_ACCIDENT", sev: "Severe", dead: 2 });  // another department
});

describe("deptSummary: the Overview's figures with the department chosen", () => {
  it.each(["daily", "weekly", "monthly"] as const)("%s: every headline figure is its tile", async (period) => {
    const ov = await intel.overview(period, null, "GCC-SWD");
    const d = (await deptSummary("GCC-SWD", period))!;
    const snap = ov.snapshot as { overdue: number };
    expect([d.figures.reported, d.figures.open, d.figures.severe, d.figures.severeOpen, d.figures.resolved, d.figures.overdue, d.figures.awaiting])
      .toEqual([ov.kpi.cur.reported, ov.kpi.cur.ongoing, ov.kpi.cur.severe, ov.kpi.cur.severe_open, ov.kpi.cur.resolved, snap.overdue, ov.tasks.count]);
    expect([d.figures.prevReported, d.figures.prevResolved]).toEqual([ov.kpi.prev.reported, ov.kpi.prev.resolved]);
    // the charts add up to the tiles
    expect(d.severity.reduce((s, x) => s + x.n, 0)).toBe(d.figures.reported);
    expect(d.deadline.onTime + d.deadline.late + d.deadline.none).toBe(d.figures.resolved);
    expect(d.deadline.openIn + d.deadline.openPast).toBe(d.figures.open);
    expect(d.kinds.reduce((s, x) => s + x.n, 0)).toBe(d.figures.reported);
  });
  it("daily, in numbers: three reported, one closed in time, one late; another department's severe case is not there", async () => {
    const d = (await deptSummary("GCC-SWD", "daily"))!;
    expect(d.figures).toMatchObject({ reported: 3, open: 2, overdue: 1, severe: 1, resolved: 2, deaths: 1, complaints: 3 });
    expect(d.deadline).toMatchObject({ onTime: 1, late: 1, openIn: 1, openPast: 1 });
    expect(d.cases.map((x) => x.id)).toEqual(["A", "B"]);
    expect(JSON.stringify(d)).not.toContain("Case P");
    expect(d.contacts.map((x) => x.phone)).toEqual(["9445190732"]);
    expect(d.ages.map((x) => x.n)).toEqual([2, 1, 0, 0, 1]); // any date: A, B, then D, then F
    expect(d.days).toHaveLength(7);
    expect(d.days[6]).toMatchObject({ day: "2026-11-26", reported: 3, resolved: 2 });
    expect(d.weeks).toHaveLength(12);
    expect(plain(d.summary.en[0])).toMatch(/^Storm Water Drains received 3 reports /);
  });
  it("the zone, taluk and category are applied to every part, and it says which", async () => {
    const z = (await deptSummary("GCC-SWD", "daily", { zone: 13 }))!;
    expect([z.figures.reported, z.figures.severe, z.where, z.areaKind]).toEqual([2, 0, "Adyar", "ward"]);
    expect(z.areas.map((a) => a.name)).toEqual(["Ward 172"]);
    expect(z.ages.reduce((s, x) => s + x.n, 0)).toBe(1);
    const c = (await deptSummary("GCC-SWD", "daily", { cat: "FLOOD_RELIEF" }))!;
    expect([c.figures.reported, c.figures.open, c.kinds.map((k) => k.cat)]).toEqual([1, 0, ["FLOOD_RELIEF"]]);
    const t = (await deptSummary("GCC-SWD", "weekly", { taluk: "TLK-MYL" }))!;
    expect([t.figures.reported, t.where]).toEqual([2, "Mylapore taluk"]);
  });
  it("what it owes: an instruction on an open case of its own, never one addressed to another department or on a closed case", async () => {
    h.db.exec(`INSERT INTO followups (followup_id, incident_id, summary, due_date, status) VALUES (1, 'A', 'Report on the drain', '2026-11-25', 'pending'), (2, 'C', 'Closed already', '2026-11-25', 'pending'),
      (3, 'P', 'Police report', '2026-11-25', 'pending'), (4, 'A', 'Completion report with photos (map send to POL-GCP)', '2026-11-25', 'pending'), (5, 'B', 'Done one', '2026-11-25', 'done');
      INSERT INTO actions VALUES ('1', 'A', 'GCC-SWD', 'AE Ward 118', 'Clear the silt', 'Open', '2026-11-27 10:00:00'), ('2', 'A', 'POL-GCP', 'SHO', 'Divert traffic', 'Open', '2026-11-27 10:00:00'), ('3', 'C', 'GCC-SWD', 'AE', 'Old', 'Open', '2026-11-27 10:00:00');`);
    bumpDataEpoch();
    const d = (await deptSummary("GCC-SWD", "daily"))!;
    expect(d.followUps).toMatchObject([{ id: 1, text: "Report on the drain", late: true }]);
    expect(d.tasks.map((x) => x.text)).toEqual(["Clear the silt"]);
  });
  it("a code that is no department is null", async () => {
    expect(await deptSummary("NOPE", "daily")).toBeNull();
  });
});

describe("the Briefing follows every filter", () => {
  const S = { period: "daily" as const, zone: null, dept: null, cat: null, taluk: null };
  const book = (o: Partial<Parameters<typeof briefingBook>[0]> = {}) => briefingBook({ ...S, ...o }, ist(0), null);

  it("the glance's figures are the Overview's tiles for the same filters", async () => {
    for (const [zone, dept, focus] of [[null, null, {}], [13, null, {}], [null, "POL-GCP", {}], [9, "GCC-SWD", { cat: "DRAINAGE_SEWAGE" }], [null, null, { taluk: "TLK-GUI" }]] as const) {
      const ov = await intel.overview("daily", zone, dept, focus);
      const b = await book({ zone, dept, cat: (focus as { cat?: string }).cat ?? null, taluk: (focus as { taluk?: string }).taluk ?? null });
      for (const k of ["reported", "ongoing", "severe", "severe_open", "resolved", "urgent"]) expect(b.today.kpi.cur[k], `${zone} ${dept} ${k}`).toBe(ov.kpi.cur[k]);
      expect(b.today.overdue).toBe((ov.snapshot as { overdue: number }).overdue);
      expect(b.today.awaiting).toBe(ov.tasks.count);
    }
    expect((await book()).today.unchecked).toBe(Number(((await intel.overview("daily", null)).snapshot as { critical: number }).critical));
  });
  it("the most serious cases and the oldest complaint are the period's (they looked back 7 and 180 days)", async () => {
    const d = await book();
    expect(d.critical.map((i) => i.id).sort()).toEqual(["A", "P"]); // not F, open for 40 days
    expect(d.citizens.oldest?.id).toBe("A"); // not D, 5 days old
    expect((await book({ period: "weekly" })).citizens.oldest?.id).toBe("D");
    expect((await book({ dept: "POL-GCP" })).citizens.oldest).toBeNull();
  });
  it("the status line is the view's own: the district's warning is not a zone's or a department's", async () => {
    expect((await book()).status).toMatchObject({ level: "alert", reasons: expect.arrayContaining(["IMD red warning for Chennai"]) });
    for (const o of [{ zone: 9 }, { dept: "GCC-SWD" }, { cat: "DRAINAGE_SEWAGE" }, { taluk: "TLK-MYL" }]) {
      const s = (await book(o)).status;
      expect(s.reasons.join(), JSON.stringify(o)).not.toMatch(/IMD/);
      // its own deaths: one in the department and the category, three in the zone and the taluk (the police case too)
      expect([s.level, s.reasons[0]], JSON.stringify(o)).toEqual("zone" in o || "taluk" in o ? ["alert", "3 deaths"] : ["watchful", "1 death"]);
    }
    expect((await book({ zone: 13 })).status).toMatchObject({ level: "normal", reasons: [] });
  });
  it("departments carry what is open and late for the filters", async () => {
    expect((await book()).departments.find((x) => x.code === "GCC-SWD")).toMatchObject({ n: 3, open: 2, overdue: 1 });
    expect((await book({ zone: 13 })).departments.map((x) => [x.code, x.n, x.overdue])).toEqual([["GCC-SWD", 2, 1]]);
    expect((await book({ cat: "ROAD_ACCIDENT" })).departments.map((x) => x.code)).toEqual(["POL-GCP"]);
  });
  it("a view with nothing in it is empty, never the district's", async () => {
    const b = await book({ zone: 13, dept: "POL-GCP" });
    expect([b.today.kpi.cur.reported, b.today.cases.length, b.today.kinds.length, b.today.zones.length, b.departments.length, b.today.fatal]).toEqual([0, 0, 0, 0, 0, null]);
  });
});

describe("the AI key points and department brief read every filter", () => {
  const S = { period: "daily" as const, zone: null, dept: null, taluk: null };
  it("the category reaches the facts (it was dropped: a category's key points were the whole district's)", async () => {
    expect(await dayBrief({ ...S, cat: "ROAD_ACCIDENT" }, "t")).toBeNull(); // no model in tests; the facts are what matters
    expect(h.prompts[0]).toContain("Road accident");
    expect(h.prompts[0]).toContain("Incidents reported: 1");
    expect(h.prompts[0]).not.toContain("Case A");
    await deptBrief({ ...S, cat: "FLOOD_RELIEF" }, "GCC-SWD", "t");
    expect(h.prompts[1]).toContain("Received: 1 incidents");
  });
  it("weather and warnings are the district's: left out of a filtered view's facts", async () => {
    await dayBrief(S, "t");
    expect(h.prompts[0]).toMatch(/Weather alert: Cyclone Arnab/);
    h.prompts = []; h.lane = 0;
    for (const o of [{ zone: 13 }, { dept: "GCC-SWD" }, { taluk: "TLK-MYL" }, { cat: "DRAINAGE_SEWAGE" }]) await dayBrief({ ...S, ...o }, "t");
    expect(h.prompts.join("\n")).not.toMatch(/Cyclone|IMD|Air quality|reservoirs/i);
    expect(h.lane).toBe(0);
  });
  it("an unusual rise is a department's only with a report of its own behind it, counted over its own", async () => {
    for (let k = 0; k < 6; k++) add({ id: `R${k}`, cat: "ROAD_ACCIDENT", dept: k < 5 ? "POL-GCP" : "GCC-SWD" });
    h.db.exec(`INSERT INTO anomalies VALUES ('ROAD_ACCIDENT', 9, '2026-11-26', 7, 1, 7, 'spike', NULL)`);
    await dayBrief(S, "t"); await dayBrief({ ...S, dept: "POL-GCP" }, "t"); await dayBrief({ ...S, dept: "GCC-SWD" }, "t"); await dayBrief({ ...S, zone: 13 }, "t"); await dayBrief({ ...S, cat: "DRAINAGE_SEWAGE" }, "t");
    expect(h.prompts[0]).toMatch(/7 reports on 26 Nov, 7 times the usual/);
    expect(h.prompts[1]).toMatch(/6 reports on 26 Nov, part of an unusual rise there/);
    for (const k of [2, 3, 4]) expect(h.prompts[k], String(k)).not.toContain("Unusual rises");
  });
});
