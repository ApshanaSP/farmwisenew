/**
 * Adversarial review 1 of 2b5d080 (hunt2-desk-13): deskList now reads waiting petitions (no limit) and the week's approved ones
 * (LIMIT 300, newest CREATED first) in two queries. Same store translation as desk.sqlite.test.ts.
 *   npx vitest run --config vitest.p7.config.ts --maxWorkers=1 tests/qa/pass7/desk-and-accounts/review1
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, between: null as null | (() => void) }));
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  const st = h.db.prepare(s);
  if (/^\s*(SELECT|WITH)/i.test(s)) return [st.all(...(p as never[]))];
  const r = st.run(...(p as never[]));
  return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }];
};
const pool = {
  query: async (sql: string, params: unknown[] = []) => {
    const out = run(sql, params);
    // another request (the officer approving) lands between deskList's two reads
    if (/status IN \('reading', 'needs_check', 'read_failed'\) ORDER BY/.test(sql) && h.between) { h.between(); h.between = null; }
    return out;
  }
};
vi.mock("@/lib/db", () => ({ default: pool, withTransaction: async (fn: (c: typeof pool) => Promise<unknown>) => fn(pool) }));
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/collector/sources", () => ({ audit: async () => undefined }));
vi.mock("@/lib/mailer", () => ({ isSmtpConfigured: () => false, sendMail: async () => ({ ok: true }) }));
vi.mock("@/lib/manu/read", () => ({ readPetition: async () => null }));

const { deskList } = await import("@/lib/manu/petitions");
const { istNow, addHours } = await import("@/lib/manu/clean");

beforeEach(() => {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`CREATE TABLE petitions (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT NOT NULL DEFAULT 'reading', pages TEXT NOT NULL, reading TEXT, read_error TEXT, name TEXT, problem TEXT,
    dept_code TEXT, urgent INT NOT NULL DEFAULT 0, complaint_code TEXT, filed_at TEXT, created_at TEXT, updated_at TEXT)`);
  h.db = db;
  h.between = null;
});

describe("review1 hunt2-desk-13: the desk list after the split", () => {
  it("the petition approved a minute ago (uploaded 10 days ago, approved after a backlog) is on the desk's approved list in a week of 300+ approvals", async () => {
    const now = istNow(), at = (x: number) => addHours(now, x);
    const ins = h.db.prepare(`INSERT INTO petitions (status, pages, name, problem, dept_code, complaint_code, filed_at, created_at, updated_at) VALUES ('filed', '[]', 'X', 'Y', 'GCC-ELE', ?, ?, ?, ?)`);
    // the backlog petition: uploaded 10 days ago, waited, approved just now
    ins.run("2026-999OLD", at(-0.02), at(-240), at(-0.02));
    // 300 others uploaded and approved over the last two days
    for (let i = 0; i < 300; i++) ins.run(`2026-${String(100 + i)}AAA`, at(-48 + i / 10), at(-48 + i / 10), at(-48 + i / 10));
    const list = await deskList();
    expect(list.some((x) => x.code === "2026-999OLD"), "the most recent approval is missing").toBe(true);
  });

  it("a petition approved while the desk list is being read appears once, not as both waiting and approved", async () => {
    const now = istNow();
    h.db.prepare(`INSERT INTO petitions (id, status, pages, name, problem, dept_code, created_at, updated_at) VALUES (7, 'needs_check', '[]', 'R. Kumar', 'Sewage', 'CMWSSB', ?, ?)`).run(addHours(now, -2), addHours(now, -2));
    h.between = () => h.db.prepare(`UPDATE petitions SET status = 'filed', complaint_code = '2026-777AAA', filed_at = ?, updated_at = ? WHERE id = 7`).run(istNow(), istNow());
    const list = await deskList();
    expect(list.filter((x) => x.id === 7).map((x) => x.status)).toHaveLength(1);
  });
});
