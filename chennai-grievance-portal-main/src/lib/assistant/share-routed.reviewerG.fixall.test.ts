// reviewerG-05 (reviewer G's probe on reviewerE-02): Ask's share of incidents counts a routed open news complaint neither open nor closed
// (OPEN_NOW, by design), but the answer the fast path wrote from it ("Of the 3 incidents ..., 2 are open and 0 closed") gave no count for
// the third, and the percentage answers divided by a total that includes it. The routed count is now returned and named.
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

// the pool is made in vi.hoisted: the static imports above (catalog, compile) load the mocked db before this file's own top-level code runs
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
      const col = /no such column: (?:i\.|b\.)?(\w+)$/.exec(msg)?.[1]; // an incidents column (i, or b in the planner lane's SQL)
      if (col && tries < 60) { h.db.exec(`ALTER TABLE incidents ADD COLUMN ${col}`); continue; }
      throw e;
    }
  }
  return /^\s*(SELECT|WITH)/i.test(s) ? [st.all(...(p as never[]))] : [{ affectedRows: Number(st.run(...(p as never[])).changes) }];
};
vi.mock("@/lib/collector/db", () => ({
  default: h.pool, ops: (t: string) => t, OPS_DB: "district_intel_ops", INTEL_DB: "district_intel", TITLE: "i.title",
  CLUSTER: "COALESCE(i.cluster_id, i.incident_id)"
}));
vi.mock("@/lib/db", () => ({ default: h.pool, connectionSettings: () => ({}) }));
vi.mock("@/lib/collector/lakes", () => ({ cmwssbLakes: async () => null }));

const intel = await import("@/lib/collector/intel");
const asked = await import("@/lib/assistant/incidents");
const { fastPath } = await import("@/lib/assistant/fastpath");

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
    INSERT INTO ref_wards VALUES (100, 9, 'Teynampet', 'TLK-MYL', 13.04, 80.25);
    INSERT INTO ref_taluks VALUES ('TLK-MYL', 'Mylapore');`);
  return db;
}

function add(id: string, mediaOnly: 0 | 1) {
  h.db.prepare(`INSERT INTO incidents (incident_id, title, cluster_id, category_label, category_code, lead_dept, zone_no, zone_name, taluk_code,
      severity_level, status_std, is_open, verified, citizen_complaints, outlet_count, first_reported_at, sla_breached, media_only,
      awaiting_collector, last_update_at, priority_score, attention_reason, lat, lon, place_text)
    VALUES (?, ?, NULL, 'Drainage', 'DRAINAGE_SEWAGE', 'GCC-SWD', 9, 'Teynampet', 'TLK-MYL', 'High', 'Open', 1, 0, 0, 1, ?, 0, ?, 0, ?, 1, NULL,
      13.05, 80.25, 'Main Road')`).run(id, `Drain ${id}`, ist(3), mediaOnly, ist(2));
}

beforeEach(() => {
  h.db = fresh();
  add("INC-A", 0);  // an ordinary open incident
  add("INC-M", 1);  // open, seen only in the news, not routed
  add("INC-N", 1);  // a news complaint the routing job handed to the department: not open on the console (OPEN_NOW)
  h.db.exec(`INSERT INTO dept_assignments (incident_id, dept_code, status) VALUES ('INC-N', 'GCC-SWD', 'Assigned')`);
});


const names = { zones: new Map([[9, { name: "Teynampet" }]]), taluks: new Map(), depts: new Map() };
// no window in the words ("today" would be read as a named window, answered in English only): the period is the router's
const ask = (share: string, lang = "en") => fastPath({ message: "share of open incidents in Teynampet", lang, names, now: ist(0), lockDept: null,
  ctx: null, place: { zone: 9 }, scope: { period: "daily", zone: 9, dept: null, cat: null, taluk: null } } as never,
  { intent: "INCIDENT_COUNT", share, period: "daily", because: "a share" } as never);

describe("reviewerG-05: Ask's share of incidents accounts for every incident it counts", () => {
  it("shareOfIncidents: open + closed + routed is the total", async () => {
    const r = await asked.shareOfIncidents({ period: "daily", zone: 9 }, ist(0));
    expect([r.n, r.open, r.closed, r.routed]).toEqual([3, 2, 0, 1]);
    expect(r.open + r.closed + r.routed).toBe(r.n);
  });

  it("the open-to-closed answer names the routed complaint, so its figures add up to the total", async () => {
    const card = (await ask("ratio"))!.card;
    expect(card.answerMarkdown).toContain("**2** are open, **0** closed and 1 is a news complaint handed to a department, neither open nor closed on the console");
    expect(card.answerMarkdown).toMatch(/^Of the 3 incidents reported /);
    expect(card.kpis?.find((k) => k.label === "Handed to departments")?.value).toBe(1);
  });

  it("a percentage answer names it too (its total includes it), in English, Tamil and Tanglish", async () => {
    expect((await ask("open"))!.card.answerMarkdown).toMatch(/2 of 3\.[\s\S]*2 still open[\s\S]*; 1 is a news complaint handed to a department/);
    expect((await ask("open", "ta"))!.card.answerMarkdown).toMatch(/ஒப்படைக்கப்பட்ட செய்திப் புகார்கள் 1/);
    expect((await ask("open", "tanglish"))!.card.answerMarkdown).toMatch(/oppadaicha news complaints 1/);
  });

  it("with nothing routed, the answers read as before", async () => {
    h.db.exec("DELETE FROM dept_assignments");
    const card = (await ask("ratio"))!.card;
    expect(card.answerMarkdown).toContain("**3** are open and **0** closed.");
    expect(card.answerMarkdown).not.toMatch(/handed to/);
  });
});
