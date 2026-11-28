/**
 * The officer's one-page console (28 Nov 2026), on an isolated in-memory store through the AWS dialect (the harness of
 * integration27.sqlite.test.ts): My work's three lists come from the department's own queue (to approve, in action, reopened by the
 * Collector), and today's briefing passes on only what the officer's glance uses, the department's own figures.
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, asked: [] as unknown[][] }));
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  const st = h.db.prepare(s);
  return /^\s*(SELECT|WITH)/i.test(s)
    ? [st.all(...(p as never[]))]
    : (() => { const r = st.run(...(p as never[])); return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }]; })();
};
const pool = { query: async (sql: string, params: unknown[] = []) => run(sql, params) };
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/complaint-progress", () => ({ syncComplaints: async () => 0, awaitingQueue: async () => 3 }));
vi.mock("@/lib/collector/intel", async (orig) => ({ ...(await orig<typeof import("@/lib/collector/intel")>()), asOf: async () => "2026-10-14 12:00:00" }));
// the Collector's briefing book for the department (its own tests cover its figures): what the officer's route passes on is checked here
vi.mock("@/lib/collector/insights", () => ({
  insights: async (...a: unknown[]) => {
    h.asked.push(a);
    return {
      now: "2026-10-14 12:00:00",
      book: {
        status: { level: "watchful", reasons: ["1 death"], warning: null },
        today: { whole: false, kpi: { cur: { reported: 5 }, prev: { reported: 4 } }, overdue: 1, deaths: 1, injured: 0, awaiting: 7, unchecked: 2,
          kinds: [{ cat: "SOLID_WASTE", label: "Garbage", n: 5, prev: 4 }], zones: [{ zone: 9, name: "Teynampet", n: 5, prev: 4 }], fatal: null, days: [],
          cases: [{ id: "INC-1", title: "Wall collapse", type: "Building", sev: "Severe", zone: "Teynampet", loc: "Test Street", dept: "GCC-SWM",
            deptName: "Solid Waste Management", deptHead: "SE", dead: 1, next: "Clear the site", t: "2026-10-14 09:00:00" }] },
        citizens: { oldest: { id: "INC-2", title: "Garbage not cleared", zone: "Teynampet", days: 3, t: "2026-10-11 09:00:00" } },
        departments: [{ code: "GCC-SWM", name: "Solid Waste Management" }]
      },
      briefing: { emerging: [{ cat: "SOLID_WASTE", label: "Garbage", zone: 9, zone_name: "Teynampet", observed: 4, ratio: 6, date: "2026-10-14" },
        { cat: "ROAD_DAMAGE", label: "Road damage", zone: 9, zone_name: "Teynampet", observed: 9, ratio: 8, date: "2026-10-01" }] },
      gaps: [{ id: "INC-9", title: "Overflowing bin in the news", type: "Garbage", sev: "Medium", zone_name: "Teynampet", loc: null, t: "2026-10-14 08:00:00", outlet_count: 2,
        dept_name: "Solid Waste Management", ai_summary: "not passed on" }]
    };
  }
}));
vi.mock("@/lib/collector/alerts", () => ({ alertLane: async (now: string) => ({ banner: null, sources: [], now }) }));

const { officerWork, deptBriefing, officerAlerts } = await import("./insights");

const SWM = { code: "GCC-SWM", name: "Solid Waste Management", org: "GCC", head: "SE", route: "AE → EE", short: "SWM", remarkHint: "" };
const SCOPE = { period: "weekly" as const, zone: null, taluk: null };

function fresh() {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, title TEXT, channels TEXT, lead_dept TEXT, category_label TEXT, category_code TEXT, zone_no INTEGER,
      zone_name TEXT, ward_no INTEGER, taluk_code TEXT, place_text TEXT, lat REAL, lon REAL, severity_level TEXT, status_std TEXT,
      citizen_complaints INTEGER, outlet_count INTEGER, sources TEXT, source_count INTEGER, officer TEXT, summary TEXT, media_only INTEGER,
      first_reported_at TEXT, sla_due_at TEXT, closed_at TEXT, sla_breached INTEGER, is_open INTEGER, last_update_at TEXT);
    CREATE TABLE officer_steps (step_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, step TEXT, note TEXT, report_id INTEGER, actor TEXT,
      actor_user_id INTEGER, at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, escalate_to TEXT, note TEXT, decided_by TEXT,
      decided_role TEXT, decided_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE events (event_id TEXT, source TEXT, source_record_id TEXT, incident_id TEXT, text TEXT);
    CREATE TABLE outbound_emails (email_id INTEGER PRIMARY KEY, incident_id TEXT, subject TEXT, body TEXT, owner TEXT, body_hash TEXT, approved_at TEXT,
      to_contact_ids TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE followups (followup_id INTEGER PRIMARY KEY, email_id INTEGER, contact_id INTEGER, incident_id TEXT, summary TEXT, due_date TEXT, status TEXT);`);
  return db;
}
function incident(id: string, o: Record<string, unknown> = {}) {
  const r = { incident_id: id, title: `Garbage not cleared ${id}`, lead_dept: "GCC-SWM", category_label: "Garbage", category_code: "SOLID_WASTE", zone_no: 9,
    zone_name: "Teynampet", place_text: "Test Street", severity_level: "Medium", status_std: "Open", citizen_complaints: 1, outlet_count: 0,
    first_reported_at: "2026-10-13 09:00:00", sla_due_at: "2026-10-16 09:00:00", sla_breached: 0, is_open: 1, last_update_at: "2026-10-13 09:00:00", ...o };
  const k = Object.keys(r);
  h.db.prepare(`INSERT INTO incidents (${k.join(", ")}) VALUES (${k.map(() => "?").join(", ")})`).run(...(Object.values(r) as never[]));
}

describe("My work: to approve, in action, reopened by the Collector", () => {
  beforeEach(() => { h.db = fresh(); h.asked = []; });

  it("each list holds the department's own cases in the queue's order; a reopened case is in action and in Reopened", async () => {
    incident("INC-N1", { severity_level: "Low" });
    incident("INC-N2", { severity_level: "Severe" });
    incident("INC-A1", { status_std: "In progress" });
    incident("INC-R1", { status_std: "Awaiting verification", severity_level: "High" });
    h.db.prepare(`INSERT INTO collector_decisions (incident_id, decision, note, decided_by, decided_role, decided_at) VALUES (?, 'reopen', 'Photos unclear', 'c@x', 'collector', '2026-10-14 10:00:00')`).run("INC-R1");
    incident("INC-X1", { lead_dept: "GCC-SWD" }); // another department's: never shown
    const w = await officerWork(SWM, SCOPE);
    expect(w.new.map((r) => r.id)).toEqual(["INC-N2", "INC-N1"]); // most severe first
    expect(w.action.map((r) => r.id).sort()).toEqual(["INC-A1", "INC-R1"]);
    expect(w.returned.map((r) => [r.id, r.returned, r.returnNote])).toEqual([["INC-R1", true, "Photos unclear"]]);
    expect([...w.new, ...w.action, ...w.returned].some((r) => r.id === "INC-X1")).toBe(false);
    // RC-47: the complaints on their way to the queue are counted and said
    expect(w.awaiting).toBe(3);
    expect(w.awaitingNote?.en).toMatch(/3/);
  });
});

describe("today's briefing: the Collector's book with the department as the filter, only what the glance uses", () => {
  it("asks for the signed-in department's view and passes on no Collector task list or other department", async () => {
    const b = await deptBriefing("GCC-SWM", { period: "daily", zone: 9, taluk: null });
    expect(h.asked.at(-1)).toEqual(["daily", 9, "GCC-SWM", { taluk: null }, "briefing"]);
    expect(b?.today.cases).toEqual([{ id: "INC-1", title: "Wall collapse", type: "Building", sev: "Severe", zone: "Teynampet", loc: "Test Street", dead: 1 }]);
    expect(b?.today).not.toHaveProperty("awaiting");
    expect(b?.today).not.toHaveProperty("unchecked");
    expect(b).not.toHaveProperty("departments");
    expect(b?.gaps).toEqual([{ id: "INC-9", title: "Overflowing bin in the news", type: "Garbage", sev: "Medium", zone_name: "Teynampet", loc: null, t: "2026-10-14 08:00:00", outlets: 2 }]);
    expect(b?.gapsTotal).toBe(1);
    expect(b?.oldest?.id).toBe("INC-2");
    // an unusual rise of the period only (today's, not the one on 1 Oct), the department's own count
    expect(b?.rise).toEqual({ cat: "SOLID_WASTE", label: "Garbage", zone: 9, zoneName: "Teynampet", n: 4, date: "2026-10-14" });
  });
  it("the alerts lane is the district's, with no admin notice for the officer", async () => {
    expect(await officerAlerts()).toEqual({ lane: { banner: null, sources: [], now: "2026-10-14 12:00:00" }, admin: null });
  });
});
