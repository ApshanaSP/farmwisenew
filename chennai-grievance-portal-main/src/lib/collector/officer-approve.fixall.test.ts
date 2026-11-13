// QA pass 6, hunt2-ops-09: an officer's approve never reached the Collector console. The Collector's effective status (effective.ts
// effectiveSql, EFF.status, read at 21 places in 8 modules) laid only collector_decisions over the pipeline's status; approve, action
// and send live only in officer_steps, so the case stayed "Under review" on the console's chip, list filter and case page and in Ask
// District IQ, while the officer showed it approved and the citizen was told so. The status now reads the department's latest step
// when it came after the latest decision with an effect (in the same second the decision wins, as the officer's stage reads it).
// One store, read by the Collector console (list and case page), Ask District IQ and the officer's own view.
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => {
  // the officer step table is there (on MySQL the server checks at start; effective.ts officerStepsOn): before the modules build their SQL
  (globalThis as { __diqOfficerSteps?: boolean }).__diqOfficerSteps = true;
  return { db: null as unknown as import("node:sqlite").DatabaseSync };
});
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  let st;
  for (let tries = 0; !st; tries++) {
    try {
      st = h.db.prepare(s);
    } catch (e) {
      const msg = String((e as Error).message);
      if (/no such table/i.test(msg)) return [[]]; // a table this test does not need: nothing in it
      const col = /no such column: (?:i|w)\.(\w+)/.exec(msg)?.[1];
      if (col && tries < 60) { h.db.exec(`ALTER TABLE incidents ADD COLUMN ${col}`); continue; }
      throw e;
    }
  }
  return /^\s*(SELECT|WITH)/i.test(s) ? [st.all(...(p as never[]))]
    : (() => { const r = st.run(...(p as never[])); return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }]; })();
};
const pool = {
  query: async (sql: string, params: unknown[] = []) => run(sql, params),
  getConnection: async () => ({ query: async (sql: string, params: unknown[] = []) => run(sql, params), beginTransaction: async () => undefined,
    commit: async () => undefined, rollback: async () => undefined, release: () => undefined })
};
vi.mock("@/lib/collector/db", () => ({
  default: pool, ops: (t: string) => t, OPS_DB: "district_intel_ops", TITLE: "i.title", CLUSTER: "COALESCE(i.cluster_id, i.incident_id)"
}));
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/collector/lakes", () => ({ cmwssbLakes: async () => null }));
vi.mock("@/lib/complaint-progress", () => ({ syncComplaints: async () => 0, awaitingQueue: async () => 0 }));
vi.mock("@/lib/collector/intel", async (orig) => ({ ...(await orig<typeof import("@/lib/collector/intel")>()), asOf: async () => "2026-10-14 12:00:00" }));

const intel = await import("@/lib/collector/intel");
const asked = await import("@/lib/assistant/incidents");
const officer = await import("@/lib/officer/data");
const { effectiveSql, effectiveStatus } = await import("@/lib/collector/effective");

const SWM = { code: "GCC-SWM", name: "Solid Waste Management", org: "GCC", head: "SE", route: "AE → EE", short: "SWM", remarkHint: "" };

function fresh() {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, title TEXT, cluster_id TEXT, channels TEXT, lead_dept TEXT, category_label TEXT, category_code TEXT,
      family TEXT, zone_no INTEGER, zone_name TEXT, ward_no INTEGER, taluk_code TEXT, place_text TEXT, lat REAL, lon REAL, severity_level TEXT, status_std TEXT,
      citizen_complaints INTEGER, outlet_count INTEGER, sources TEXT, source_count INTEGER, officer TEXT, summary TEXT, media_only INTEGER, verified INTEGER,
      first_reported_at TEXT, sla_due_at TEXT, closed_at TEXT, sla_breached INTEGER, is_open INTEGER, last_update_at TEXT, priority_score REAL);
    CREATE TABLE officer_steps (step_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, step TEXT, note TEXT, report_id INTEGER, actor TEXT,
      actor_user_id INTEGER, at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE officer_reports (report_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, remarks TEXT, photo_dir TEXT, photos TEXT,
      sent_by TEXT, sent_user_id INTEGER, sent_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, escalate_to TEXT, note TEXT, decided_by TEXT,
      decided_role TEXT, decided_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE ref_departments (code TEXT, name TEXT, org TEXT, head TEXT, route TEXT, action_owner INTEGER);
    CREATE TABLE ref_taluks (taluk_code TEXT, name TEXT);
    CREATE TABLE incident_timeline (incident_id TEXT, at TEXT, step TEXT, note TEXT, actor TEXT);
    CREATE TABLE incident_members (incident_id TEXT, event_id TEXT, source TEXT, channel TEXT, reported_at TEXT, title TEXT, role TEXT, link_prob REAL, link_method TEXT);
    CREATE TABLE events (event_id TEXT, source TEXT, source_record_id TEXT, incident_id TEXT, text TEXT);
    CREATE TABLE documents (doc_id TEXT, event_id TEXT, publisher TEXT, title TEXT, url TEXT, published_at TEXT, linked_incident_id TEXT, story_id TEXT);
    INSERT INTO ref_departments VALUES ('GCC-SWM', 'Solid Waste Management', 'GCC', 'SE', '', 1);`);
  return db;
}

function incident(id: string, o: Record<string, unknown> = {}) {
  const r = { incident_id: id, title: "Garbage not cleared", lead_dept: "GCC-SWM", category_label: "Garbage", category_code: "SOLID_WASTE", zone_no: 9,
    zone_name: "Teynampet", place_text: "Test Street", severity_level: "Severe", status_std: "Under review", citizen_complaints: 1, outlet_count: 0, verified: 0,
    first_reported_at: "2026-10-14 09:00:00", sla_due_at: "2026-10-15 09:00:00", sla_breached: 0, is_open: 1, last_update_at: "2026-10-14 09:00:00",
    media_only: 0, priority_score: 1, ...o };
  const k = Object.keys(r);
  h.db.prepare(`INSERT INTO incidents (${k.join(", ")}) VALUES (${k.map(() => "?").join(", ")})`).run(...(Object.values(r) as never[]));
}
const step = (id: string, s: string, at: string, dept = "GCC-SWM") =>
  h.db.prepare(`INSERT INTO officer_steps (incident_id, dept_code, step, note, actor, at) VALUES (?, ?, ?, NULL, 'swm@x', ?)`).run(id, dept, s, at);
const decide = (id: string, d: string, at: string, role = "collector") =>
  h.db.prepare(`INSERT INTO collector_decisions (incident_id, decision, note, decided_by, decided_role, decided_at) VALUES (?, ?, NULL, 'c@x', ?, ?)`).run(id, d, role, at);

/** The case's status as each reader gives it: the console's list row and case page, Ask District IQ, the officer's stage. */
async function readers(id: string) {
  const listed = await intel.list({ period: "quarterly", zone: null, dept: null, sev: null, status: null, q: id, sort: "t", dir: -1, page: 0, scope: "all" });
  const page = await intel.incident(id);
  const [ask] = await asked.incidentsByIds([id]);
  const mine = await officer.grievanceDetail(SWM, id);
  const rows = listed.rows as { id: string; status: string }[];
  return { list: rows.find((r) => r.id === id)?.status, page: page?.incident.status, ask: ask?.status, stage: mine?.grievance.stage,
    step: (page?.officerStep as { step: string } | null | undefined)?.step ?? null };
}

describe("hunt2-ops-09: an officer's step reaches the Collector's status, on one store", () => {
  beforeEach(() => { h.db = fresh(); });
  afterAll(() => { delete (globalThis as { __diqOfficerSteps?: boolean }).__diqOfficerSteps; }); // other files' stores: as they were

  it("an approve: Assigned on the console's list and case page and in Ask District IQ, approved on the officer's console", async () => {
    incident("INC-1");
    expect(await readers("INC-1")).toMatchObject({ list: "Under review", page: "Under review", ask: "Under review", stage: "new" });
    step("INC-1", "approve", "2026-10-14 10:00:00");
    expect(await readers("INC-1")).toEqual({ list: "Assigned", page: "Assigned", ask: "Assigned", stage: "approved", step: "approve" });
    // the console's status filter finds it under the officer's step
    const assigned = await intel.list({ period: "quarterly", zone: null, dept: null, sev: null, status: "Assigned", q: null, sort: "t", dir: -1, page: 0, scope: "all" });
    expect((assigned.rows as { id: string }[]).map((r) => r.id)).toEqual(["INC-1"]);
  });

  it("work started, then sent: In progress, then Awaiting verification", async () => {
    incident("INC-2");
    step("INC-2", "approve", "2026-10-14 10:00:00");
    step("INC-2", "action", "2026-10-14 10:10:00");
    expect(await readers("INC-2")).toMatchObject({ list: "In progress", page: "In progress", ask: "In progress", stage: "action" });
    step("INC-2", "send", "2026-10-14 10:20:00");
    expect(await readers("INC-2")).toMatchObject({ list: "Awaiting verification", page: "Awaiting verification", ask: "Awaiting verification", stage: "sent" });
  });

  it("a send-back after the send reads Open; the department's next step after it moves it again", async () => {
    incident("INC-3");
    step("INC-3", "approve", "2026-10-14 10:00:00");
    step("INC-3", "send", "2026-10-14 10:20:00");
    decide("INC-3", "reopen", "2026-10-14 10:30:00");
    expect(await readers("INC-3")).toMatchObject({ list: "Open", page: "Open", ask: "Open", stage: "action", step: null });
    step("INC-3", "action", "2026-10-14 10:40:00");
    expect(await readers("INC-3")).toMatchObject({ list: "In progress", page: "In progress", ask: "In progress", stage: "action", step: "action" });
  });

  it("a decision in the same second as a step comes after it: a verify closes the case whatever the step", async () => {
    incident("INC-4");
    step("INC-4", "send", "2026-10-14 11:00:00");
    decide("INC-4", "verify", "2026-10-14 11:00:00");
    expect(await readers("INC-4")).toMatchObject({ list: "Resolved", page: "Resolved", ask: "Resolved", stage: "verified" });
  });

  it("a step never opens a closed case, and another department's step does not move it", async () => {
    incident("INC-5", { status_std: "Resolved", is_open: 0 });
    step("INC-5", "approve", "2026-10-14 10:00:00");
    incident("INC-6");
    step("INC-6", "approve", "2026-10-14 10:00:00", "GCC-SWD");
    expect((await readers("INC-5")).page).toBe("Resolved");
    expect((await readers("INC-6")).page).toBe("Under review");
  });

  it("the pure rule and the SQL agree; without the step table the SQL reads no officer step", () => {
    expect(effectiveStatus(1, "Under review", null, "approve")).toEqual({ open: 1, status: "Assigned" });
    expect(effectiveStatus(1, "Open", "reopen", "action")).toEqual({ open: 1, status: "In progress" });
    expect(effectiveStatus(1, "Open", "resolve", "send")).toEqual({ open: 0, status: "Resolved" });
    expect(effectiveStatus(1, "Under review", null, "close")).toEqual({ open: 1, status: "Under review" });
    expect(effectiveSql("collector_decisions").status).toContain("officer_steps");
    expect(effectiveSql("collector_decisions", "i", null).status).not.toContain("officer_steps");
    expect(effectiveSql("collector_decisions", "i", null).laterStep).toBe("NULL");
  });
});
