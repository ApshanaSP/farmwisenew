// fixall-lock-05 (left open in reviewerF-06's note): an incident's group (intel.ts incident(): the other incidents of its cluster, the same
// problem in the same area) is formed by category, place and time, never by department, and a category is led by several departments
// (SOLID_WASTE: GCC-SWM, GCC-HLT and GCC-ENG in the store). The group's reports, articles and complaints are merged into the incident, so an
// officer who opened their own incident through Ask District IQ (incident_detail, incident_story, the fast path's incident card) was told
// another department's reports, titles and sources as their own case's.
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => {
  const h = { db: null as unknown as DatabaseSync, run: null as unknown as (sql: string, params: unknown[]) => Promise<unknown> };
  return Object.assign(h, { pool: { query: async (sql: string, params: unknown[] = []) => h.run(sql, params) } });
});
h.run = async (sql: string, params: unknown[]) => {
  const [s, p] = expand(translate(sql), params);
  let st;
  for (let tries = 0; !st; tries++) {
    try {
      st = h.db.prepare(s);
    } catch (e) {
      const msg = String((e as Error).message);
      if (/no such table/i.test(msg)) return [[]];
      // an incidents column the store has and this one does not (the bare ones are the incidents' too: anySynthetic)
      const col = /no such column: (?:i\.)?(\w+)$/.exec(msg)?.[1];
      if (col && tries < 80) { h.db.exec(`ALTER TABLE incidents ADD COLUMN ${col}`); continue; }
      throw e;
    }
  }
  return /^\s*(SELECT|WITH)/i.test(s) ? [st.all(...(p as never[]))] : [{ affectedRows: Number(st.run(...(p as never[])).changes) }];
};
vi.mock("@/lib/collector/db", () => ({
  default: h.pool, ops: (t: string) => t, OPS_DB: "district_intel_ops", INTEL_DB: "district_intel", TITLE: "i.title",
  // the AWS store's groups (cluster.ts); on MySQL every incident is its own group
  CLUSTER: "COALESCE(i.cluster_id, i.incident_id)"
}));
vi.mock("@/lib/db", () => ({ default: h.pool, connectionSettings: () => ({}) }));
vi.mock("@/lib/collector/lakes", () => ({ cmwssbLakes: async () => null }));
vi.mock("@/lib/assistant/lance", () => ({ hybridSearch: async () => null, currentIncidentIds: async () => [], lanceWarm: () => undefined }));
vi.mock("@/lib/assistant/embed", async (orig) => ({ ...(await orig<typeof import("@/lib/assistant/embed")>()), warmUp: () => undefined, semanticSearch: async () => null }));

const intel = await import("@/lib/collector/intel");
const { lockTools } = await import("@/lib/assistant/pipeline");
const { runTool } = await import("@/lib/assistant/tools");
const asked = await import("@/lib/assistant/incidents");

const OWN_REPORT = "Garbage not cleared on Usman Road";
const OTHER_REPORT = "Dead animal rotting next to the bins on Usman Road";
const ist = (hoursAgo: number) => new Date(Date.now() + 330 * 60_000 - hoursAgo * 3600_000).toISOString().slice(0, 19).replace("T", " ");

beforeEach(() => {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  h.db = new DatabaseSync(":memory:");
  registerFunctions(h.db);
  h.db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, title TEXT, cluster_id TEXT, category_label TEXT, category_code TEXT, family TEXT,
      lead_dept TEXT, zone_no INTEGER, zone_name TEXT, ward_no INTEGER, taluk_code TEXT, place_text TEXT, lat REAL, lon REAL,
      severity_level TEXT, status_std TEXT, is_open INTEGER, verified INTEGER, citizen_complaints INTEGER, first_reported_at TEXT,
      last_update_at TEXT, media_only INTEGER, sla_breached INTEGER, priority_score REAL);
    CREATE TABLE incident_members (incident_id TEXT, event_id TEXT, source TEXT, channel TEXT, reported_at TEXT, title TEXT, role TEXT,
      link_prob REAL, link_method TEXT);
    CREATE TABLE events (event_id TEXT, text TEXT);
    CREATE TABLE documents (doc_id TEXT, event_id TEXT, story_id TEXT, linked_incident_id TEXT, title TEXT, publisher TEXT, publisher_domain TEXT,
      publisher_tier TEXT, url TEXT, lang TEXT, published_at TEXT);
    CREATE TABLE ref_departments (code TEXT, name TEXT, org TEXT, head TEXT, route TEXT, action_owner INTEGER);
    CREATE TABLE ref_taluks (taluk_code TEXT, name TEXT);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, escalate_to TEXT, note TEXT,
      decided_by TEXT, decided_role TEXT, decided_at TEXT);
    CREATE TABLE dept_assignments (incident_id TEXT, dept_code TEXT, officer_name TEXT, officer_designation TEXT, officer_phone TEXT,
      status TEXT, assigned_at TEXT, reason TEXT);
    INSERT INTO ref_departments VALUES ('GCC-SWM', 'Solid Waste Management', 'GCC', 'Superintending Engineer', '', 1),
      ('GCC-HLT', 'Public Health', 'GCC', 'City Health Officer', '', 1);`);
  const add = h.db.prepare(`INSERT INTO incidents VALUES (?, ?, 'INC-OWN', 'Solid waste', 'SOLID_WASTE', 'CIVIC', ?, 10, 'Kodambakkam', 136, NULL,
    'Usman Road', 13.04, 80.23, 'Medium', 'Open', 1, 0, 1, ?, ?, 0, 0, 2)`);
  // one group (cluster INC-OWN): the officer's own incident, and another department's of the same category, a street away, a day later
  add.run("INC-OWN", "Solid waste - Usman Road", "GCC-SWM", ist(30), ist(30));
  add.run("INC-OTHER", "Solid waste - Usman Road", "GCC-HLT", ist(6), ist(6));
  const member = h.db.prepare(`INSERT INTO incident_members VALUES (?, ?, 'grievance', 'portal', ?, ?, 'first_report', NULL, NULL)`);
  member.run("INC-OWN", "E1", ist(30), OWN_REPORT);
  member.run("INC-OTHER", "E2", ist(6), OTHER_REPORT);
  h.db.exec(`INSERT INTO events VALUES ('E1', 'Bins overflowing'), ('E2', 'A dead dog by the bins')`);
});

const SCOPE = { period: "monthly", zone: null, dept: null, cat: null, taluk: null } as never;

describe("fixall-lock-05: an incident's group, for a department officer, is only that department's", () => {
  it("the Collector's case page still merges the whole group (the same problem in the same area)", async () => {
    const d = await intel.incident("INC-OWN");
    expect(d!.group.map((g) => g.id)).toEqual(["INC-OTHER"]);
    expect(d!.reports.map((r) => r.title)).toEqual([OWN_REPORT, OTHER_REPORT]);
  });

  it("intel.incident(id, { dept }): another department's incident is not merged in", async () => {
    const d = await intel.incident("INC-OWN", { dept: "GCC-SWM" });
    expect(d!.group).toEqual([]);
    expect(d!.reports.map((r) => r.title)).toEqual([OWN_REPORT]);
    expect(Number(d!.incident.complaints)).toBe(1);
  });

  it("Ask District IQ's incident_detail under the officer lock: the officer's own incident, without the other department's reports", async () => {
    const [t] = lockTools([{ name: "incident_detail", args: { id: "INC-OWN" } }], "GCC-SWM", SCOPE, []);
    const r = await runTool(t.name, t.args);
    expect((r.data as { incident: { id: string } }).incident.id).toBe("INC-OWN");
    expect(JSON.stringify(r)).toContain(OWN_REPORT);
    expect(JSON.stringify(r)).not.toContain(OTHER_REPORT);
    // the Collector's (no lock) still has both
    expect(JSON.stringify(await runTool("incident_detail", { id: "INC-OWN" }))).toContain(OTHER_REPORT);
  });

  it("the fast path's incident card (incidentDetail) for an officer: no other department's report in its evidence or timeline", async () => {
    const x = await asked.incidentDetail("INC-OWN", "all", "GCC-SWM");
    expect(x!.incidentId).toBe("INC-OWN");
    expect(JSON.stringify(x)).toContain(OWN_REPORT);
    expect(JSON.stringify(x)).not.toContain(OTHER_REPORT);
    expect(JSON.stringify(await asked.incidentDetail("INC-OWN", "all"))).toContain(OTHER_REPORT);
  });

  it("the fast path itself (an officer's \"tell me about INC-OWN\") passes the lock to the card", async () => {
    const { fastPath } = await import("@/lib/assistant/fastpath");
    const names = { zones: new Map(), taluks: new Map(), depts: new Map() };
    const input = (lockDept: string | null) => ({ message: "tell me about INC-OWN", lang: "en", scope: { period: "monthly", zone: null, dept: lockDept, cat: null, taluk: null },
      names, now: ist(0), lockDept, ctx: null, place: null }) as never;
    const decided = { intent: "INCIDENT_DETAIL", incidentId: "INC-OWN", focus: "all", because: "an incident id" } as never;
    const officer = await fastPath(input("GCC-SWM"), decided);
    expect(officer!.card.incident!.incidentId).toBe("INC-OWN");
    expect(JSON.stringify(officer!.card)).toContain(OWN_REPORT);
    expect(JSON.stringify(officer!.card)).not.toContain(OTHER_REPORT);
    expect(JSON.stringify((await fastPath(input(null), decided))!.card)).toContain(OTHER_REPORT);
  });
});
