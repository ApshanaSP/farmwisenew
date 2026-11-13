/**
 * Fix-all round 2, the Collector console's figures: two places that show the same thing read it from one definition, so they agree. Each
 * test reads both places on the same in-memory store (the AWS store's MySQL -> SQLite translation); a table the store does not have reads as
 * no rows (feeds, environment, news), so overview() and report() run whole.
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
const pool = {
  query: async (sql: string, params: unknown[] = []) => {
    const [s, p] = expand(translate(sql), params);
    let st;
    try {
      st = h.db.prepare(s);
    } catch (e) {
      // the parts of the console this store does not hold (feeds, stations, news, sources) read as nothing
      if (/no such table/i.test(String((e as Error).message))) return [[]];
      throw e;
    }
    return /^\s*(SELECT|WITH)/i.test(s) ? [st.all(...(p as never[]))] : [{ affectedRows: Number(st.run(...(p as never[])).changes) }];
  }
};
vi.mock("@/lib/collector/db", () => ({
  default: pool, ops: (t: string) => t, OPS_DB: "district_intel_ops", TITLE: "i.title", CLUSTER: "COALESCE(i.cluster_id, i.incident_id)"
}));
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/collector/lakes", () => ({ cmwssbLakes: async () => null }));

const intel = await import("./intel");

const ist = (hoursAgo: number) => new Date(Date.now() + 330 * 60_000 - hoursAgo * 3600_000).toISOString().slice(0, 19).replace("T", " ");

type Inc = { id: string; sev: string; zone?: number | null; zoneName?: string | null; taluk?: string | null; cat?: string; dept?: string;
  open?: number; complaints?: number; reported?: number; awaiting?: number; attention?: string | null; cluster?: string | null; updated?: number };

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
      loc_precision_m REAL, persons_affected INTEGER);
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

function add(x: Inc) {
  h.db.prepare(`INSERT INTO incidents (incident_id, title, cluster_id, category_label, category_code, lead_dept, zone_no, zone_name, taluk_code,
      severity_level, status_std, is_open, verified, citizen_complaints, outlet_count, first_reported_at, sla_breached, media_only,
      awaiting_collector, last_update_at, priority_score, attention_reason, lat, lon, place_text)
    VALUES (?, ?, ?, 'Drainage', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, 0, 0, ?, ?, 1, ?, 13.05, 80.25, 'Main Road')`).run(
    x.id, `Drain ${x.id}`, x.cluster ?? null, x.cat ?? "DRAINAGE_SEWAGE", x.dept ?? "GCC-SWD", x.zone === undefined ? 9 : x.zone,
    x.zoneName === undefined ? (x.zone === 10 ? "Kodambakkam" : x.zone === 1 ? "Tiruvottiyur" : "Teynampet") : x.zoneName, x.taluk ?? "TLK-MYL",
    x.sev, (x.open ?? 1) ? "Open" : "Resolved", x.open ?? 1, x.complaints ?? 1, ist(x.reported ?? 3), x.awaiting ?? 0, ist(x.updated ?? 2),
    x.attention ?? null);
}

beforeEach(() => {
  h.db = fresh();
});

describe("pass4-open-03: My Tasks' reason names the level the way every screen does", () => {
  it("'With you because' (and the CSV's 'Closed work to check') never says 'Severe severity'", async () => {
    add({ id: "INC-T1", sev: "Severe", awaiting: 1, complaints: 2 });
    const rows = await intel.exportRows("daily", null, null);
    const check = rows.filter((r) => r.list === "Closed work to check");
    expect(check.map((r) => r.id)).toEqual(["INC-T1"]);
    expect(check[0].why).not.toMatch(/Severe severity/);
    expect(check[0].why.split("; ")[0]).toBe("Severe");
    const ov = await intel.overview("daily", null);
    expect(ov.tasks.rows.map((r) => r.because)).toEqual([["Severe"]]);
  });
});
