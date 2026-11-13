/**
 * Reviewer 2 probe (QA pass 7, studio-parse): the packed reply (parse-worker.ts toWire/fromWire) round-trips a table exactly, through V8's
 * serializer as child_process "advanced" serialization uses it.
 *   timeout 300 npx vitest run --config vitest.p7.config.ts --maxWorkers=2 tests/qa/pass7/studio-parse/reviewer2/pack.test.ts < /dev/null
 */
import v8 from "node:v8";
import { expect, it } from "vitest";
import { fromWire, toWire, type Reply } from "@/lib/studio/parse-worker";
import type { Table } from "@/lib/studio/parse";

const wire = (r: Reply) => fromWire(v8.deserialize(v8.serialize(toWire(r))));
const base = { headers: ["a", "b", "c"], sheet: "S", sheets: ["S", "T"], caption: "cap", format: "excel" as const, truncated: 7, part: "Sheet \"S\"", notes: ["n1", "n2"] };

it("numbers that are not ordinary: -0, NaN, Infinity, -Infinity, 2^53+2, 5e-324", () => {
  const rows = [[-0, NaN, Infinity], [-Infinity, 2 ** 53 + 2, 5e-324]];
  const t = (wire({ tables: [{ ...base, rows } as Table] }) as { tables: Table[] }).tables[0];
  console.log("numbers:", t.rows, Object.is(t.rows[0][0], -0));
  expect(Object.is(t.rows[0][0], -0)).toBe(true);
  expect(t.rows).toEqual(rows);
});

it("text: very long, empty, lone surrogates, '__proto__', the same text in many cells", () => {
  const long = "x".repeat(5_000_000);
  const rows = [[long, "", "\ud800"], ["__proto__", long, "constructor"], ["a", "a", "a"]];
  const t = (wire({ tables: [{ ...base, rows } as Table] }) as { tables: Table[] }).tables[0];
  expect(t.rows).toEqual(rows);
});

it("meta fields, 0 rows, 0 headers, a null table of a page", () => {
  const z = { ...base, headers: [], rows: [] } as Table;
  const r = wire({ tables: [z, { ...base, rows: [] } as Table] }) as { tables: Table[] };
  expect(r.tables).toEqual([z, { ...base, rows: [] }]);
  const p = wire({ page: { tables: [null, { ...base, rows: [[1, "x", null]] } as Table], feed: "f", headlines: [["h", null, null, null, "l"]], files: [{ url: "u", text: "t" }], scripts: ["s"], next: null } });
  expect(p).toEqual({ page: { tables: [null, { ...base, rows: [[1, "x", null]] }], feed: "f", headlines: [["h", null, null, null, "l"]], files: [{ url: "u", text: "t" }], scripts: ["s"], next: null } });
});

it("rows the parsers should never build (ragged, sparse, undefined, a row that is not an array): what comes out", () => {
  // eslint-disable-next-line no-sparse-arrays
  const rows = [[1, , 3], [undefined, "u"], [], "abc", null, [true, { o: 1 }]] as unknown as Table["rows"];
  const t = (wire({ tables: [{ ...base, rows } as Table] }) as { tables: Table[] }).tables[0];
  console.log("odd rows in:", rows, "out:", t.rows);
  // documented, not asserted as a break: undefined/holes -> null, a string row -> its characters, a null row -> []
});
