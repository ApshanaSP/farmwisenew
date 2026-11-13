/**
 * Copy to: chennai-grievance-portal-main/src/lib/aws/frozen-clock.probe.fixall.test.ts (next to frozen-clock.fixall.test.ts)
 *
 * reviewerB-07 (P6-001, commit b3e838b). Under a moved clock, tests/qa/pass4/freeze-clock.cjs:41-43 swaps SQLite's own
 * datetime/date/time/julianday/unixepoch/strftime for app functions on every node:sqlite database, without `deterministic`. SQLite
 * does not allow a non-deterministic function in an index expression, a partial index's WHERE or a generated column ("non-deterministic
 * functions prohibited in index expressions"). The built-ins are allowed there when they are not given 'now'. So such a schema
 * builds normally and fails only in future-clock runs, which would read as a date time bomb in the app. The wrapper also returns
 * every JS number as REAL, so unixepoch() changes type from INTEGER to REAL and an integer division on it stops truncating.
 * No current schema or query hits either case (no expression index on a date function, no unixepoch in src/ or tests/): this is a latent
 * risk in the harness, and each case below is checked against the real clock first.
 * Expected on 172fabd: the moved-clock half of each test fails; the real-clock half passes.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const HARNESS = path.join(process.cwd(), "tests", "qa", "pass4", "freeze-clock.cjs");
function run(probe: string, frozen: string | null): Record<string, unknown> {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: `--require ${JSON.stringify(HARNESS)}` };
  delete env.QA_FROZEN_NOW; delete env.QA_CLOCK_TICKING;
  if (frozen) env.QA_FROZEN_NOW = frozen;
  const out = execFileSync(process.execPath, ["--no-warnings", "--input-type=module", "-e", probe], { env, encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out);
}

const INDEXED = `
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, at TEXT)");
db.exec("CREATE INDEX t_day ON t (date(at))");
db.exec("INSERT INTO t (at) VALUES ('2026-11-13 10:00:00')");
process.stdout.write(JSON.stringify(db.prepare("SELECT count(*) AS n FROM t WHERE date(at) = '2026-11-13'").get()));
`;
const TYPED = `
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(":memory:");
process.stdout.write(JSON.stringify(db.prepare("SELECT typeof(unixepoch('2026-11-13 10:00:00')) AS ty, (unixepoch('2026-11-13 10:00:00') - unixepoch('2026-11-10 22:00:00')) / 86400 AS days").get()));
`;

describe("reviewerB-07: SQLite's date functions behave the same under the moved clock as without it", () => {
  it("an index on date(at) can be built (real clock, then a clock moved 30 days)", () => {
    expect(run(INDEXED, null)).toEqual({ n: 1 });
    expect(run(INDEXED, "2026-12-13T08:00:00.000Z")).toEqual({ n: 1 });
  });

  it("unixepoch() stays an INTEGER, so whole-day arithmetic on it still truncates", () => {
    expect(run(TYPED, null)).toEqual({ ty: "integer", days: 2 });
    expect(run(TYPED, "2026-12-13T08:00:00.000Z")).toEqual({ ty: "integer", days: 2 });
  });
});
