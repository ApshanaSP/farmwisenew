import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildDb, type Manifest, type Snapshot, type TableInfo } from "./store";

// R-01 (27 Oct 2026): the dev server ran out of memory when the hourly build arrived. buildDb parsed every table at
// once (Promise.all), so the whole build sat in the JS heap as JSON before a row was inserted: +305 MB on the live
// build, against +80 MB one table at a time.
const info = (rows: number): TableInfo => ({ sha: "x", rows, bytes: 0, key: "", url: "" });
const manifest = (n: number): Manifest => ({
  build_id: "t", built_at: "", exported_at: "", meta: {}, views: {}, keys: {}, indexes: {},
  tables: Object.fromEntries(Array.from({ length: n }, (_, i) => [`t${i}`, info(3)]))
});
const durableFile = () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "store-mem-")), "durable.sqlite");
  const { DatabaseSync } = (process as any).getBuiltinModule("node:sqlite");
  new DatabaseSync(f).close();
  return f;
};

describe("a build is loaded one table at a time (R-01)", () => {
  it("reads the next table only after the one before is in the database", async () => {
    let active = 0, most = 0;
    const load = async (name: string): Promise<Snapshot> => {
      most = Math.max(most, ++active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      return { table: name, columns: [["id", "int"], ["v", "text"]], rows: [[1, "a"], [2, "b"], [3, "c"]] };
    };
    const db = await buildDb(manifest(6), load, durableFile());
    expect(most).toBe(1);
    expect(db.prepare("SELECT COUNT(*) AS n FROM t5").get()).toEqual({ n: 3 });
    db.close();
  });

  it("still adds the compatibility columns a build lacks", async () => {
    const load = async (name: string): Promise<Snapshot> => ({ table: name, columns: [["incident_id", "text"]], rows: [["INC-1"]] });
    const m = manifest(0);
    m.tables = { incidents: info(1) };
    const db = await buildDb(m, load, durableFile());
    const cols = (db.prepare("SELECT name FROM pragma_table_info('incidents')").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain("ai_summary");
    db.close();
  });
});
