// Fix-all round 2, reviewerC-05 (reviewer C's probe on hunt2-desk-14 / fix ea62510c).
//
// The fix gave "the person's own petitions" a query of their own, but that query is still (p.mobile = ? OR p.name = ?) ... LIMIT 200: the
// person's own rows (same mobile) share one LIMIT with every other person of the same exact name, newest first. With 200+ newer petitions
// from other people called "R. Kumar" (a common name, any ward, any department), the person's own older petition by mobile is cut again,
// exactly the row's bug. A petition to another department is reachable through no other query (byWard is this ward AND this department),
// so "This person has written 1 earlier petition on other problems" disappears.
// Harness: in-memory SQLite through the store translation, as src/lib/manu/desk.fixall.test.ts.
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  const st = h.db.prepare(s);
  if (/^\s*(SELECT|WITH)/i.test(s)) return [st.all(...(p as never[]))];
  const r = st.run(...(p as never[]));
  return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }];
};
const pool = { query: async (sql: string, params: unknown[] = []) => run(sql, params) };
vi.mock("@/lib/db", () => ({ default: pool, withTransaction: async (fn: (c: typeof pool) => Promise<unknown>) => fn(pool) }));
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t, TITLE: "i.title" }));

const { findRepeats } = await import("@/lib/manu/repeat");

beforeEach(() => {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE petitions (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL DEFAULT 'counter', status TEXT NOT NULL DEFAULT 'reading', pages TEXT NOT NULL, name TEXT, mobile TEXT,
      address TEXT, area TEXT, ward_number INT, dept_code TEXT, category_code TEXT, problem TEXT, complaint_code TEXT, incident_id TEXT, filed_at TEXT, created_at TEXT);
    CREATE TABLE complaints (id INTEGER PRIMARY KEY, complaint_code TEXT, user_id INT, first_name TEXT, street_address TEXT, mobile_number TEXT, ward_number INT, department_id INT,
      title TEXT, description TEXT, is_anonymous INT NOT NULL DEFAULT 0, status TEXT, is_synthetic INT NOT NULL DEFAULT 0, complaint_subtype_id INT, created_at TEXT);
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);`);
  h.db = db;
});

describe("reviewerC-05: the person's own petition is not cut by others of the same name", () => {
  it("the person's TANGEDCO petition (same mobile) is still found when 210 other R. Kumars wrote later", async () => {
    const ins = h.db.prepare(`INSERT INTO petitions (status, pages, name, mobile, address, ward_number, dept_code, problem, complaint_code, incident_id, filed_at, created_at)
      VALUES ('filed', '[]', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    // the person's own, in January, to another department
    ins.run("R. Kumar", "9000041873", "27, Jawahar Street, Perambur", 70, "TANGEDCO", "Power cut every night, transformer sparking", "2026-001OWN", "INC-W-2026-001OWN",
      "2026-01-05 10:00:00", "2026-01-05 10:00:00");
    // 210 other people named R. Kumar, other mobiles, other wards, newer
    for (let i = 0; i < 210; i++) {
      const code = `2026-${String(100 + i).padStart(3, "0")}RKM`;
      ins.run("R. Kumar", `98${String(10000000 + i)}`, `${i}, Main Road`, 100 + (i % 50), "GCC-SWM", "Garbage not cleared", code, `INC-W-${code}`,
        `2026-10-${String(1 + (i % 28)).padStart(2, "0")} 10:00:00`, "2026-10-01 10:00:00");
    }
    const r = await findRepeats({ mobile: "9000041873", name: "R. Kumar", street: "Jawahar Street", ward: 70, dept: "CMWSSB", problem: "Sewage overflowing on the street", excludeId: -1 });
    expect(r.matches.map((m) => m.code)).toContain("2026-001OWN");
    expect(r.headline).toMatch(/This person has written 1 earlier petition/);
  });
});
