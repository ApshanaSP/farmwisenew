/**
 * 27 Nov: the brain's `cases` table (brain/sql.ts) is made again only when the build or what it is made of changed (a decision, an officer's
 * step, an assignment, the build's own cases), never on a bare data-epoch move (the hosted copy's 5-minute reload, a news-desk sweep) or
 * every 10 minutes; and a make goes in slices with the thread let go between them, giving the same rows as one go. An in-memory store
 * through the AWS store's MySQL -> SQLite translation; nothing is read from AWS.
 */
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerFunctions, setDatabaseNames } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, build: "b1", makes: 0, turns: 0 }));
vi.mock("@/lib/aws/store", () => ({
  // the store's turn: the build being served, its id; each call is one turn (the slices take one each)
  withCurrentBuild: async (fn: (db: unknown, build: string) => unknown) => {
    h.turns++;
    const db = { exec: (s: string) => h.db.exec(s), prepare: (s: string) => { if (/CREATE TEMP TABLE brain_cases/.test(s)) h.makes++; return h.db.prepare(s); } };
    return fn(db, h.build);
  },
  storeInfo: async () => ({ buildId: h.build, builtAt: "", loadedAt: "" })
}));
vi.mock("@/lib/collector/db", () => ({ default: {}, ops: (t: string) => t, OPS_DB: "district_intel_ops", TITLE: "COALESCE(i.headline, i.title)", CLUSTER: "COALESCE(i.cluster_id, i.incident_id)" }));
vi.mock("@/lib/collector/intel", async () => {
  const { effectiveSql } = await import("@/lib/collector/effective");
  // the console's open rule: the effective open flag, and not handed to a department (intel.ts OPEN_NOW)
  return { OPEN_NOW: `(${effectiveSql("collector_decisions").open} = 1 AND NOT EXISTS (SELECT 1 FROM dept_assignments da WHERE da.incident_id = i.incident_id))` };
});

const { caseRows, casesSelect, CASES_SLICE, refreshCases } = await import("./sql");
const { bumpDataEpoch } = await import("@/lib/collector/epoch");

const COLS = `incident_id TEXT COLLATE NOCASE, title TEXT, headline TEXT, category_code TEXT, category_label TEXT, family TEXT, lead_dept TEXT, zone_no INTEGER, zone_name TEXT,
  ward_no INTEGER, taluk_code TEXT, place_text TEXT, lat REAL, lon REAL, severity_level TEXT, status_std TEXT, is_open INTEGER, verified INTEGER, first_reported_at TEXT,
  last_update_at TEXT, closed_at TEXT, sla_due_at TEXT, citizen_complaints INTEGER, police_reports INTEGER, outlet_count INTEGER, outlet_names TEXT, media_only INTEGER,
  sources TEXT, source_count INTEGER, dead INTEGER, injured INTEGER, persons_affected INTEGER, priority_score REAL, priority_reasons TEXT, severity_reasons TEXT,
  attention_reason TEXT, needs_review INTEGER, review_reason TEXT, officer TEXT, cluster_id TEXT, awaiting_collector INTEGER`;

function fresh(n: number) {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  // the build's tables are WITHOUT ROWID, keyed by their primary key (aws/store.ts build)
  db.exec(`CREATE TABLE incidents (${COLS}, PRIMARY KEY (incident_id)) WITHOUT ROWID;
    CREATE TABLE ref_departments (code TEXT PRIMARY KEY, name TEXT) WITHOUT ROWID; CREATE TABLE ref_taluks (taluk_code TEXT PRIMARY KEY, name TEXT) WITHOUT ROWID;
    INSERT INTO ref_departments VALUES ('GCC-SWD', 'Storm Water Drains'); INSERT INTO ref_taluks VALUES ('TLK-MYL', 'Mylapore');
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, decided_at TEXT);
    CREATE TABLE officer_steps (step_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, step TEXT, at TEXT);
    CREATE TABLE dept_assignments (incident_id TEXT PRIMARY KEY, dept_code TEXT, assigned_at TEXT);`);
  const ins = db.prepare(`INSERT INTO incidents (incident_id, title, category_code, category_label, lead_dept, zone_no, zone_name, taluk_code, place_text, severity_level, status_std,
    is_open, verified, first_reported_at, last_update_at, sla_due_at, citizen_complaints, outlet_count, outlet_names, dead) VALUES (?, ?, 'DRAINAGE_SEWAGE', 'Drainage', 'GCC-SWD', 9, 'Teynampet',
    'TLK-MYL', 'Main Road, Mylapore', ?, ?, ?, 0, '2026-11-27 08:00:00', '2026-11-27 08:00:00', '2026-11-28 08:00:00', ?, 1, 'The Hindu', 0)`);
  db.exec("BEGIN");
  for (let k = 0; k < n; k++) ins.run(`INC-20261127-${String(k).padStart(6, "0")}`, `Case ${k}`, k % 7 === 0 ? "Severe" : "Medium", k % 3 === 0 ? "Resolved" : "Open", k % 3 === 0 ? 0 : 1, k % 5);
  db.exec("COMMIT");
  return db;
}
const openNow = async () => Number(((await caseRows("SELECT COUNT(*) AS n FROM cases WHERE is_open = 1"))[0] as { n: number }).n);

beforeEach(() => { h.db = fresh(30); h.build = "b1"; h.makes = 0; h.turns = 0; (globalThis as { __brainCases?: unknown }).__brainCases = undefined; });
afterEach(() => { vi.useRealTimers(); });

describe("27 Nov: cases is made again on a new build or a decision, not on every data-epoch move", () => {
  it("made once; a bare epoch move (a reload, a news sweep) and 11 minutes later do not make it again", async () => {
    const n0 = await openNow();
    expect(n0).toBe(20); // 30 cases, every third resolved by the pipeline
    expect(h.makes).toBe(1);
    bumpDataEpoch();
    expect(await openNow()).toBe(n0);
    bumpDataEpoch(); bumpDataEpoch();
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 11 * 60_000 });
    expect(await openNow()).toBe(n0);
    expect(h.makes).toBe(1);
  });

  it("a Collector's decision is in the very next answer (its write moves the epoch)", async () => {
    const n0 = await openNow();
    h.db.prepare("INSERT INTO collector_decisions (incident_id, decision, decided_at) VALUES (?, 'resolve', '2026-11-27 09:00:00')").run("INC-20261127-000001");
    bumpDataEpoch(); // as store.ts run() does on a write to collector_decisions
    expect(await openNow()).toBe(n0 - 1);
    expect(h.makes).toBe(2);
    // an assignment to a department and an officer's step are what it is made of too
    h.db.prepare("INSERT INTO dept_assignments VALUES (?, 'GCC-SWD', '2026-11-27 09:05:00')").run("INC-20261127-000002");
    bumpDataEpoch();
    expect(await openNow()).toBe(n0 - 2);
    expect(h.makes).toBe(3);
  });

  it("a case filed or joined between builds (the build's own cases changed) is counted", async () => {
    const n0 = await openNow();
    h.db.prepare("UPDATE incidents SET citizen_complaints = citizen_complaints + 1, last_update_at = '2026-11-27 09:10:00' WHERE incident_id = ?").run("INC-20261127-000004");
    bumpDataEpoch();
    expect(Number(((await caseRows("SELECT complaints FROM cases WHERE id = ?", ["INC-20261127-000004"]))[0] as { complaints: number }).complaints)).toBe(5);
    h.db.prepare("INSERT INTO incidents (incident_id, title, is_open, status_std, severity_level, first_reported_at) VALUES ('INC-20261127-NEW001', 'Filed now', 1, 'Open', 'High', '2026-11-27 09:11:00')").run();
    bumpDataEpoch();
    expect(await openNow()).toBe(n0 + 1);
  });

  it("a case changed in place on the build being served is in the next answer (the news desk's headline and review flag, a petition's department)", async () => {
    await openNow();
    const one = async (id: string) => (await caseRows("SELECT title, needs_review, review_reason, dept_code, severity FROM cases WHERE id = ?", [id]))[0] as Record<string, unknown>;
    // the news desk laid over the served build (newsdesk.ts laid -> derive.ts applyDesk: newsHeadlines, the hold for review), then its epoch bump
    h.db.prepare("UPDATE incidents SET headline = 'Tree falls on a car in Mylapore', needs_review = 1, review_reason = 'The news desk reads this report as a statement' WHERE incident_id = ?").run("INC-20261127-000005");
    bumpDataEpoch();
    expect(await one("INC-20261127-000005")).toMatchObject({ title: "Tree falls on a car in Mylapore", needs_review: 1, review_reason: "The news desk reads this report as a statement" });
    // a petition's case kept as the petition officer chose (manu/cases.ts keepPetitionCase), after a reload or a build swap
    h.db.prepare("UPDATE incidents SET lead_dept = 'GCC-SWM', severity_level = 'High' WHERE incident_id = ?").run("INC-20261127-000006");
    bumpDataEpoch();
    expect(await one("INC-20261127-000006")).toMatchObject({ dept_code: "GCC-SWM", severity: "High" });
    // the build's own writes still work with the count's triggers on it: a column added (applyDesk's needs_review), a case taken out
    h.db.exec("ALTER TABLE incidents ADD COLUMN zz_extra INTEGER");
    h.db.prepare("UPDATE incidents SET zz_extra = 1 WHERE incident_id = ?").run("INC-20261127-000007");
    const before = await openNow();
    h.db.prepare("DELETE FROM incidents WHERE incident_id = ?").run("INC-20261127-000008");
    bumpDataEpoch();
    expect(await openNow()).toBe(before - 1);
    // and nothing changed: an epoch move alone still does not make it again
    const makes = h.makes;
    bumpDataEpoch();
    await openNow();
    expect(h.makes).toBe(makes);
  });

  it("a new build makes it again", async () => {
    await openNow();
    h.build = "b2";
    await openNow();
    expect(h.makes).toBe(2);
  });
});

describe("27 Nov: a make in slices, the thread let go between them", () => {
  it("gives the same rows as one go, one store turn a slice", async () => {
    const N = CASES_SLICE * 2 + 700;
    h.db = fresh(N);
    let ticks = 0, done = false;
    const tick = () => { ticks++; if (!done) setImmediate(tick); };
    setImmediate(tick);
    expect(await refreshCases()).toBe(true);
    done = true;
    // the plan, the table's shape, two full slices, then the last slice with the swap: five turns, and other work ran between them
    expect(h.turns).toBe(5);
    expect(ticks).toBeGreaterThanOrEqual(3);
    const all = casesSelect(true, "all");
    const oneGo = JSON.stringify(h.db.prepare(`SELECT * FROM (${all.sql}) ORDER BY id`).all(...(all.params as never[])));
    const sliced = JSON.stringify(h.db.prepare("SELECT * FROM temp.brain_cases ORDER BY id").all());
    expect(sliced).toBe(oneGo);
    expect(Number((h.db.prepare("SELECT COUNT(*) AS n FROM temp.cases").get() as { n: number }).n)).toBe(N);
    // and up to date: a read after it does not make it again
    h.makes = 0;
    await openNow();
    expect(h.makes).toBe(0);
  });

  it("a make already running is shared; a new build meanwhile leaves the next read to make it for that build", async () => {
    h.db = fresh(CASES_SLICE + 10);
    const a = refreshCases(), b = refreshCases();
    expect(a).toBe(b);
    h.build = "b2"; // the hourly build swapped in while the slices went in
    expect(await a).toBe(false);
    h.makes = 0;
    expect(await openNow()).toBeGreaterThan(0);
    expect(h.makes).toBe(1);
  });
});
