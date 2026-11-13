// QA fix-all, reviewerE-02 (on console-sync-10, 5caebd1d). OPEN_NOW (open AND NOT routed: a news complaint handed to a department is the
// department's work) reached only intel.ts and insights.ts. Ask District IQ (queries.ts, incidents.ts), the AI briefs (aibrief.ts), the
// Briefing book (briefbook.ts), the department list's top open incidents (insights.ts) and the "Severe, not yet checked" tile (intel.ts
// notYetChecked) still counted routed complaints as open, so figures that agreed before disagreed. Every open count and filter now
// reads OPEN_NOW. One store with one open routed severe news complaint (INC-N) in Teynampet: every reader gives the zone one open count.
// The first two cases are reviewer E's probe.
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
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
vi.mock("@/lib/collector/db", () => ({
  default: pool, ops: (t: string) => t, OPS_DB: "district_intel_ops", TITLE: "i.title", CLUSTER: "COALESCE(i.cluster_id, i.incident_id)"
}));
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/collector/lakes", () => ({ cmwssbLakes: async () => null }));

const intel = await import("@/lib/collector/intel");
const { zoneAttention } = await import("@/lib/assistant/queries");
const asked = await import("@/lib/assistant/incidents");
const { briefingBook } = await import("@/lib/collector/briefbook");

const ist = (hoursAgo: number) => new Date(Date.now() + 330 * 60_000 - hoursAgo * 3600_000).toISOString().slice(0, 19).replace("T", " ");

function fresh() {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, title TEXT, cluster_id TEXT, category_label TEXT, category_code TEXT, family TEXT,
      lead_dept TEXT, zone_no INTEGER, zone_name TEXT, ward_no INTEGER, taluk_code TEXT, place_text TEXT, lat REAL, lon REAL,
      severity_level TEXT, status_std TEXT, is_open INTEGER, verified INTEGER, citizen_complaints INTEGER, outlet_count INTEGER, sources TEXT,
      source_count INTEGER, channels TEXT, first_reported_at TEXT, summary TEXT, priority_score REAL, sla_breached INTEGER, sla_due_at TEXT,
      closed_at TEXT, hours_open REAL, severity_reasons TEXT, priority_reasons TEXT, attention_reason TEXT, officer TEXT, media_only INTEGER,
      awaiting_collector INTEGER, police_reports INTEGER, last_update_at TEXT, ai_summary TEXT, ai_attention TEXT, ai_next_step TEXT,
      loc_precision_m REAL, persons_affected INTEGER, member_count INTEGER, confidence REAL, hotspot_id TEXT);
    CREATE TABLE ref_departments (code TEXT, name TEXT, org TEXT, head TEXT, route TEXT, action_owner INTEGER);
    CREATE TABLE ref_wards (ward_no INTEGER, zone_no INTEGER, zone_name TEXT, taluk_code TEXT, centroid_lat REAL, centroid_lon REAL);
    CREATE TABLE ref_taluks (taluk_code TEXT, name TEXT);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, escalate_to TEXT, note TEXT,
      decided_by TEXT, decided_at TEXT);
    CREATE TABLE dept_assignments (incident_id TEXT, dept_code TEXT, officer_name TEXT, officer_designation TEXT, officer_phone TEXT,
      status TEXT, assigned_at TEXT);
    CREATE TABLE incident_members (incident_id TEXT, source TEXT);
    CREATE TABLE metrics (metric TEXT, value TEXT);
    INSERT INTO ref_departments VALUES ('GCC-SWD', 'Storm Water Drains', 'GCC', 'Superintending Engineer', '', 1);
    INSERT INTO ref_wards VALUES (1, 1, 'Tiruvottiyur', 'TLK-EGM', 13.1, 80.3), (100, 9, 'Teynampet', 'TLK-MYL', 13.04, 80.25),
      (120, 10, 'Kodambakkam', 'TLK-EGM', 13.05, 80.22);
    INSERT INTO ref_taluks VALUES ('TLK-MYL', 'Mylapore'), ('TLK-EGM', 'Egmore');`);
  return db;
}

function add(id: string, sev: string, zone: number, complaints: number) {
  h.db.prepare(`INSERT INTO incidents (incident_id, title, cluster_id, category_label, category_code, lead_dept, zone_no, zone_name, taluk_code,
      severity_level, status_std, is_open, verified, citizen_complaints, outlet_count, first_reported_at, sla_breached, media_only,
      awaiting_collector, last_update_at, priority_score, attention_reason, lat, lon, place_text)
    VALUES (?, ?, NULL, 'Drainage', 'DRAINAGE_SEWAGE', 'GCC-SWD', ?, ?, 'TLK-MYL', ?, 'Open', 1, 0, ?, 0, ?, 0, 0, 0, ?, 1, NULL, 13.05, 80.25, 'Main Road')`).run(
    id, `Drain ${id}`, zone, zone === 10 ? "Kodambakkam" : "Teynampet", sev, complaints, ist(3), ist(2));
}

beforeEach(() => {
  h.db = fresh();
  add("INC-A", "Severe", 9, 2);
  add("INC-B", "High", 10, 0);
  add("INC-C", "Medium", 9, 1);
  add("INC-N", "Severe", 9, 1); // a news complaint the routing job handed to the department
  h.db.exec(`INSERT INTO dept_assignments (incident_id, dept_code, status) VALUES ('INC-N', 'GCC-SWD', 'Assigned')`);
});

describe("reviewerE-02: every open figure reads the one definition (OPEN_NOW)", () => {
  it("Ask's 'zones' tool gives a zone the open count of the console's zone table", async () => {
    const ov = await intel.overview("daily", null);
    const scope = { period: "daily" as const, zone: null, dept: null, cat: null, taluk: null };
    const ask = await zoneAttention(scope, ov.now);
    const console9 = ov.zoneTable.find((z) => z.zone === 9)?.open; // 2 on 01902042 (INC-A, INC-C; the routed INC-N is left out)
    const ask9 = ask.find((z) => z.zone === 9)?.open;
    expect(ask9).toBe(console9); // fails on 01902042: Ask says 3 (on 3d97a9fc both said 3)
  });

  it("Ask's 'zones' tool and its 'zone_profile' tool (the area snapshot) give one zone one open count", async () => {
    const ov = await intel.overview("daily", 9);
    const scope = { period: "daily" as const, zone: null, dept: null, cat: null, taluk: null };
    const ask = await zoneAttention(scope, ov.now);
    const snap = await intel.areaSnapshot(9, { period: "daily", zone: 9, dept: null, cat: null, taluk: null }, ov.now);
    expect(ask.find((z) => z.zone === 9)?.open).toBe(Number(snap.active)); // fails on 01902042: 3 against 2
  });

  it("one zone, one open count: Ask's zones tool, zone_profile, Ask's incident counts and the console's zone table", async () => {
    const ov = await intel.overview("daily", null);
    const scope = { period: "daily" as const, zone: null, dept: null, cat: null, taluk: null };
    const zones = (await zoneAttention(scope, ov.now)).find((z) => z.zone === 9)?.open;
    const snap = Number((await intel.areaSnapshot(9, { ...scope, zone: 9 }, ov.now)).active);
    const counted = (await asked.countIncidents({ period: "daily", zone: 9 }, ov.now)).open;
    const win = (await asked.windowRows({ period: "daily", zone: 9 }, ov.now, 10)).open;
    const table = ov.zoneTable.find((z) => z.zone === 9)?.open;
    expect([zones, snap, counted, win]).toEqual([table, table, table, table]);
    expect(table).toBe(2); // INC-A and INC-C; the routed INC-N is the department's
    // the district: Ask's count is the Ongoing tile
    expect((await asked.countIncidents({ period: "daily" }, ov.now)).open).toBe(ov.kpi.cur.ongoing);
    // the open-only list Ask shows leaves it out too, and a share of incidents counts it neither open nor closed
    const list = await asked.rankedIncidents({ period: "daily", zone: 9, openOnly: true }, ov.now, 10);
    expect(list.items.map((x) => x.incidentId).sort()).toEqual(["INC-A", "INC-C"]);
    const share = await asked.shareOfIncidents({ period: "daily", zone: 9 }, ov.now);
    expect([share.n, share.open, share.closed]).toEqual([3, 2, 0]);
  });

  it("'Severe, not yet checked' leaves out a severe news complaint handed to a department", async () => {
    const ov = await intel.overview("daily", null);
    expect(Number((ov.snapshot as { critical?: number }).critical)).toBe(1); // INC-A only
  });

  it("the Briefing book's severe-open list leaves it out", async () => {
    const ov = await intel.overview("daily", null);
    const book = await briefingBook({ period: "daily", zone: null, dept: null, cat: null, taluk: null }, ov.now, null);
    expect(book.critical.map((i) => i.id)).toEqual(["INC-A"]);
  });
});
