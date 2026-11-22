/**
 * v12 (21 Nov): a statement read through the pool waits its turn, one event-loop turn after the one before it. Promise.all of the insights'
 * 17 queries ran as one block of about 3.5 s, so speech to text and short questions stalled behind it (the report, first-question-latency
 * RC4). Here a ticker that runs once per event-loop turn must run between the queries of one Promise.all, and a build swap moves the epoch.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dataEpoch } from "@/lib/collector/epoch";
import { awsPool } from "./store";

const sqliteDb = () => {
  const { DatabaseSync } = (process as unknown as { getBuiltinModule(m: string): { DatabaseSync: new (f: string) => any } }).getBuiltinModule("node:sqlite");
  return new DatabaseSync(":memory:");
};

describe("v12: the pool serves waiting requests between its queries", () => {
  let saved: NonNullable<typeof global.__awsStore>["state"] = null;
  beforeEach(() => {
    saved = global.__awsStore!.state;
    const db = sqliteDb();
    db.exec("CREATE TABLE t (n INTEGER); INSERT INTO t VALUES (1), (2), (3)");
    // a loaded build, checked just now (no background check or reload starts)
    global.__awsStore!.state = { db, buildId: "test", builtAt: "", loadedAt: Date.now(), checkedAt: Date.now(), durableFile: "", hooksDone: new Set(), hooking: null };
  });
  afterEach(() => { global.__awsStore!.state = saved; });

  it("five queries in one Promise.all run in five event-loop turns, with other work between them", async () => {
    const pool = awsPool();
    let ticks = 0, on = true;
    const tick = () => { ticks++; if (on) setImmediate(tick); };
    setImmediate(tick);
    const at: number[] = [];
    const rows = await Promise.all([1, 2, 3, 4, 5].map((i) => pool.query(`SELECT COUNT(*) AS n, ${i} AS k FROM t`).then((r: [Record<string, number>[]]) => { at.push(ticks); return r[0][0]; })));
    on = false;
    expect(rows.map((r) => r.n)).toEqual([3, 3, 3, 3, 3]);
    expect(rows.map((r) => r.k)).toEqual([1, 2, 3, 4, 5]);
    // was: all five in the same turn (the ticker had not run between any two)
    expect(at[4] - at[0]).toBeGreaterThanOrEqual(3);
  });

  it("the queries keep their order", async () => {
    const pool = awsPool();
    const done: number[] = [];
    await Promise.all([1, 2, 3].map((i) => pool.query(`SELECT ${i} AS k`).then(() => done.push(i))));
    expect(done).toEqual([1, 2, 3]);
  });

  it("a write to the cases moves the data epoch (a case filed is never answered from an older kept read)", async () => {
    global.__awsStore!.state!.db.exec("CREATE TABLE complaints (id INTEGER PRIMARY KEY, title TEXT)");
    const pool = awsPool();
    const before = dataEpoch();
    await pool.query("INSERT INTO complaints (id, title) VALUES (?, ?)", [1, "Drain overflowing"]);
    expect(dataEpoch()).toBeGreaterThan(before);
  });
});
