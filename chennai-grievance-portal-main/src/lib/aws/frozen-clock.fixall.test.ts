/**
 * P6-001: the future-clock runs (tests/qa/pass4/freeze-clock.cjs through NODE_OPTIONS) move JS's Date, and the store's NOW() follows
 * it (lib/aws/dialect.ts), but SQLite's own clock did not: datetime('now') in a test schema's DEFAULT or in a test's INSERT read the
 * wall clock. Six unit tests mixed the two clocks and failed whenever the clock was moved, so those paths could not be checked for
 * date time bombs. The harness now gives every node:sqlite database it opens the same moved clock.
 * Each case runs a child node process with the harness preloaded, as the future-clock suite does.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const HARNESS = path.join(process.cwd(), "tests", "qa", "pass4", "freeze-clock.cjs");
// ESM import of node:sqlite, as the tests and the store import it
const PROBE = `
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, at TEXT DEFAULT (datetime('now', '+330 minutes')))");
db.exec("INSERT INTO t (id) VALUES (1)");
const r = db.prepare("SELECT at, datetime('now') AS dt, datetime() AS bare, date('now', '+1 day') AS tomorrow, strftime('%s', 'now') AS s, julianday('now') AS jd, datetime('2026-01-01 10:00:00', '+1 day') AS literal FROM t").get();
process.stdout.write(JSON.stringify({ ...r, js: new Date().toISOString() }));
`;
function run(frozen: string | null, ticking = false): Record<string, string | number> {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: `--require ${JSON.stringify(HARNESS)}` };
  delete env.QA_FROZEN_NOW; delete env.QA_CLOCK_TICKING;
  if (frozen) env.QA_FROZEN_NOW = frozen;
  if (ticking) env.QA_CLOCK_TICKING = "1";
  const out = execFileSync(process.execPath, ["--no-warnings", "--input-type=module", "-e", PROBE], { env, encoding: "utf8", timeout: 20_000 });
  return JSON.parse(out);
}

describe("P6-001: under the future-clock harness SQLite's 'now' is the moved clock too", () => {
  it("a frozen clock 30 days ahead: datetime('now'), a DEFAULT, date(), strftime() and julianday() all read it", () => {
    const r = run("2027-03-10T08:00:00.000Z");
    expect(r.js).toBe("2027-03-10T08:00:00.000Z");
    expect(r.dt).toBe("2027-03-10 08:00:00");
    expect(r.bare).toBe("2027-03-10 08:00:00");
    expect(r.at).toBe("2027-03-10 13:30:00"); // the schema's IST default
    expect(r.tomorrow).toBe("2027-03-11");
    expect(Number(r.s)).toBe(Date.parse("2027-03-10T08:00:00Z") / 1000);
    expect(Number(r.jd)).toBeCloseTo(Date.parse("2027-03-10T08:00:00Z") / 86_400_000 + 2440587.5, 6);
    expect(r.literal).toBe("2026-01-02 10:00:00"); // a date that is not 'now' is untouched
  });

  it("a ticking clock starts at the moved moment and SQLite agrees with JS to the second", () => {
    const r = run("2027-03-10T08:00:00.000Z", true);
    expect(String(r.dt).slice(0, 16)).toBe(String(r.js).replace("T", " ").slice(0, 16));
  });

  it("with no moved clock SQLite keeps the real one", () => {
    const r = run(null);
    expect(Math.abs(Date.parse(`${r.dt}Z`) - Date.now())).toBeLessThan(60_000);
  });
});
