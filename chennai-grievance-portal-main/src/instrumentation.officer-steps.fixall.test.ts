// Reviewer G's probe on hunt2-ops-09 (b053ed1c), kept: the Collector's status reads the department's latest officer step, guarded by
// effective.ts officerStepsOn().
//
// reviewerG-02: on MySQL the guard was decided once per process, at start (instrumentation-node.ts ready(), memoised), and a failed check was
//   final: MySQL not yet accepting connections when the server started set it off for the whole run. Every module also built EFF.status
//   once, at load. Now the check is made again at most every 60 s while the status is read, and the status SQL is built when read
//   (effective.lazy.fixall.test.ts).
// reviewerG-03: on the AWS store the guard was not checked at all (officerStepsOn() = DATA_BACKEND === "aws"), so a store whose durable tables
//   have no officer_steps failed every query that reads EFF.status. Now the AWS store is checked through its information_schema too.
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ calls: 0, up: false, tables: 1 }));
// instrumentation-node.ts's own start-up work, out of the way (no secrets check, no jobs, no AWS download, no warm-ups)
vi.mock("@/lib/aws/store", () => ({ warmUp: () => undefined }));
vi.mock("@/lib/secrets", () => ({ assertSecrets: () => undefined }));
vi.mock("@/lib/scheduler", () => ({ startJobs: () => undefined }));
vi.mock("@/lib/collector/derive", () => ({}));
vi.mock("@/lib/collector/intel", () => ({ overview: async () => ({}), deptList: async () => [] }));
vi.mock("@/lib/map/suggest", () => ({ suggestions: async () => [] }));
vi.mock("@/lib/dataset/append", () => ({ warmDatasetKeys: () => undefined }));
// the store: refuses connections until `up`, then answers information_schema with `tables` officer_steps tables
vi.mock("@/lib/collector/db", () => ({
  OPS_DB: "district_intel_ops",
  ops: (t: string) => t,
  default: {
    query: async () => {
      h.calls++;
      if (!h.up) throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:3306"), { code: "ECONNREFUSED" });
      return [[{ n: h.tables }]];
    }
  }
}));

const g = globalThis as { __diqOfficerSteps?: boolean; __diqOfficerStepsRecheck?: () => void };
const clean = () => { delete g.__diqOfficerSteps; delete g.__diqOfficerStepsRecheck; };

describe("reviewerG-02: MySQL not up yet when the server starts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv("DATA_BACKEND", "");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("DIQ_WARM", "0");
    clean();
    h.calls = 0;
    h.up = false;
    h.tables = 1;
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); clean(); });

  it("once MySQL is up, the Collector's status reads officer steps again without a restart", async () => {
    const { beforeFirstRequest, ready } = await import("@/instrumentation-node");
    const { officerStepsOn } = await import("@/lib/collector/effective");
    await beforeFirstRequest(); // register() awaits this before the first request
    expect(officerStepsOn()).toBe(false); // MySQL refused the check: off for now
    h.up = true; // MySQL is up a few seconds later, with district_intel_ops.officer_steps
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await ready();
    // was: the check ran once (calls = 1) and its "no" stood for the life of the process
    expect(officerStepsOn()).toBe(true);
  });

  it("reading the status looks again at most once a minute (setup:officer run while the server is up)", async () => {
    h.up = true;
    h.tables = 0; // setup:officer not run yet
    const { beforeFirstRequest, ready } = await import("@/instrumentation-node");
    const { officerStepsOn } = await import("@/lib/collector/effective");
    await beforeFirstRequest();
    expect([officerStepsOn(), h.calls]).toEqual([false, 1]);
    h.tables = 1; // setup:officer has run
    for (let k = 0; k < 20; k++) officerStepsOn(); // read within the minute: no new check
    await ready();
    expect([officerStepsOn(), h.calls]).toEqual([false, 1]);
    await vi.advanceTimersByTimeAsync(61_000);
    officerStepsOn(); // the first read after the minute starts a check (the status it builds still reads none)
    await ready();
    expect([officerStepsOn(), h.calls]).toEqual([true, 2]);
  });
});

describe("reviewerG-03: an AWS store with no officer_steps table", () => {
  beforeEach(() => { vi.resetModules(); vi.useRealTimers(); vi.stubEnv("DATA_BACKEND", "aws"); vi.stubEnv("NEXT_PHASE", ""); vi.stubEnv("DIQ_WARM", "0");
    clean(); h.calls = 0; h.up = true; h.tables = 0; });
  afterEach(() => { vi.unstubAllEnvs(); clean(); });

  it("the Collector's status still reads (the pipeline's, with decisions), as it did before hunt2-ops-09", async () => {
    const { effectiveSql } = await import("@/lib/collector/effective");
    setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
    const db = new DatabaseSync(":memory:");
    registerFunctions(db);
    db.exec(`CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, lead_dept TEXT, status_std TEXT, is_open INTEGER, closed_at TEXT, verified INTEGER);
      CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, decided_at TEXT);
      INSERT INTO incidents VALUES ('INC-1', 'GCC-SWM', 'Under review', 1, NULL, 0);`);
    const [sql] = expand(translate(`SELECT ${effectiveSql("collector_decisions").status} AS status FROM incidents i`), []);
    // was: "no such table: officer_steps" (the SQL named it unconditionally on DATA_BACKEND=aws)
    expect(db.prepare(sql).all()).toEqual([{ status: "Under review" }]);
  });

  it("the AWS store is checked, never assumed: without the table off, with it on; the check does not hold the server's start", async () => {
    const { beforeFirstRequest, ready } = await import("@/instrumentation-node");
    const { officerStepsOn } = await import("@/lib/collector/effective");
    let resolved = false;
    void beforeFirstRequest().then(() => (resolved = true));
    await Promise.resolve();
    expect(resolved).toBe(true); // register() does not wait for the store's download on AWS
    await ready();
    expect([officerStepsOn(), h.calls]).toEqual([false, 1]); // checked: this store has no officer_steps
    vi.resetModules();
    clean();
    h.tables = 1;
    const again = await import("@/instrumentation-node");
    const eff = await import("@/lib/collector/effective");
    await again.ready();
    expect(eff.officerStepsOn()).toBe(true);
    expect(eff.effectiveSql("collector_decisions").status).toMatch(/officer_steps/);
  });
});
