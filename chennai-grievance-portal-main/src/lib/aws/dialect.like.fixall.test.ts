import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { expand, registerFunctions, translate } from "@/lib/aws/dialect";

// officer-day-22: MySQL's default LIKE escape is the backslash, SQLite has none. The dialect adds the escape to every `LIKE ?`; it must
// read a MySQL-escaped pattern as MySQL does in every position of a query, not only the first: written as a quoted backslash, the
// escape read as an escaped quote to expand(), which swallowed every placeholder after it.
const db = new DatabaseSync(":memory:");
registerFunctions(db);
db.exec(`CREATE TABLE t (id INTEGER, a TEXT, b TEXT, c TEXT);
  INSERT INTO t VALUES (1, 'x', 'bin_50% full', 'p'), (2, 'x', 'bin 50 is full', 'q'), (3, 'x', 'C:\\temp', 'r');`);
const all = (sql: string, params: unknown[]) => {
  const [s, p] = expand(translate(sql), params);
  return (db.prepare(s).all(...(p as never[])) as { id: number }[]).map((r) => r.id);
};
const esc = (q: string) => `%${q.replace(/[%_\\]/g, (m) => "\\" + m)}%`;

describe("officer-day-22: a MySQL-escaped LIKE pattern on the AWS store", () => {
  it("'_' and '%' are literal in every LIKE of the query, and the placeholders after it keep their values", () => {
    const sql = "SELECT id FROM t WHERE (a LIKE ? OR b LIKE ? OR c LIKE ?) AND id < ? ORDER BY id";
    expect(all(sql, ["%zzz%", esc("bin_50"), "%zzz%", 9])).toEqual([1]);
    expect(all(sql, ["%zzz%", esc("50% full"), "%zzz%", 9])).toEqual([1]);
    expect(all(sql, ["%zzz%", "%zzz%", "%q%", 9])).toEqual([2]);
    expect(all(sql, ["%zzz%", esc("\\temp"), "%zzz%", 9])).toEqual([3]);
    expect(all(sql, ["%x%", "%zzz%", "%zzz%", 2])).toEqual([1]);
  });
  it("a LIKE with its own ESCAPE is left alone", () => {
    expect(translate("SELECT 1 FROM t WHERE a LIKE ? ESCAPE '!'")).not.toMatch(/char\(92\)/);
    expect(all("SELECT id FROM t WHERE b LIKE ? ESCAPE '!' ORDER BY id", ["%bin!_50%"])).toEqual([1]);
  });
});
