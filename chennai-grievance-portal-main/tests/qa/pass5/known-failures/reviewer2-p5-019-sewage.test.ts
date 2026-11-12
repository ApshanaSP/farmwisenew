/**
 * reviewer2 probe for d42025a (P5-019): an online complaint's department is mapped to a desk code through DEPT_CONFIG portalName. Eight of the
 * desk's 21 departments have no portal department (CMWSSB, TANGEDCO, DIST-REV, POL-GCP, HLT-DMS, PWD-WRD, TNPCB, DIST-DM), and the portal's own
 * classifier (lib/ai-classifier.ts) sends "sewage" to the Storm Water Drain Department while the desk sends sewage overflow to Metrowater
 * (CMWSSB, the desk's commonest petition). So the same person's online sewage complaint is still "an earlier petition on other problems" and its
 * case is not offered: P5-019 still happens for that class. PASSES while the gap is present.
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as import("node:sqlite").DatabaseSync }));
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  const st = h.db.prepare(s);
  if (/^\s*(SELECT|WITH)/i.test(s)) return [st.all(...(p as never[]))];
  const r = st.run(...(p as never[]));
  return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }];
};
const pool = { query: async (sql: string, params: unknown[] = []) => run(sql, params) };
vi.mock("@/lib/db", () => ({ default: pool, withTransaction: async (fn: (c: typeof pool) => Promise<unknown>) => fn(pool) }));

const { findRepeats } = await import("@/lib/manu/repeat");

beforeEach(() => {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  h.db = new DatabaseSync(":memory:");
  registerFunctions(h.db);
  h.db.exec(`
    CREATE TABLE petitions (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT, name TEXT, mobile TEXT, address TEXT, ward_number INT, dept_code TEXT, problem TEXT, complaint_code TEXT, incident_id TEXT, filed_at TEXT);
    CREATE TABLE complaints (id INTEGER PRIMARY KEY, complaint_code TEXT, status TEXT, title TEXT, mobile_number TEXT, first_name TEXT, street_address TEXT, ward_number INT, department_id INT, is_synthetic INT, is_anonymous INT, created_at TEXT);
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
    INSERT INTO departments VALUES (4, 'Storm Water Drain Department');
    INSERT INTO complaints (complaint_code, status, title, mobile_number, first_name, street_address, ward_number, department_id, is_synthetic, is_anonymous, created_at)
      VALUES ('2026-403SEW', 'Complaint Filed', 'Sewage overflowing on the street', '9000041873', 'Parvathi', '27 Jawahar St', 70, 4, 0, 0, '2026-11-08 10:00:00');`);
});

describe("reviewer2 / P5-019: no portal department for the desk's Metrowater", () => {
  it("the same person's online sewage complaint is still 'on other problems' for a Metrowater petition", async () => {
    const r = await findRepeats({ mobile: "9000041873", name: "Parvathi", street: "Jawahar St", ward: 70, dept: "CMWSSB", problem: "Sewage overflowing on the street" });
    expect(r.matches.find((m) => m.code === "2026-403SEW")).toMatchObject({ samePerson: true, sameProblem: false });
    expect(r.headline ?? "").toContain("on other problems");
    expect(r.attachTo).toBeNull();
  });
});
