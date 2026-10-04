import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { registerFunctions, translate } from "./dialect";

function db() {
  const d = new DatabaseSync(":memory:");
  registerFunctions(d);
  return d;
}
const one = (d: DatabaseSync, sql: string) => Object.values(d.prepare(translate(sql)).get() as Record<string, unknown>)[0];

describe("dialect functions", () => {
  it("TIMESTAMP adds a time to a date", () => {
    const d = db();
    expect(one(d, "SELECT TIMESTAMP('2026-10-04', '06:00:00')")).toBe("2026-10-04 06:00:00");
    expect(one(d, "SELECT TIMESTAMP('2026-10-04 23:30:00', '01:00')")).toBe("2026-10-05 00:30:00");
    expect(one(d, "SELECT TIMESTAMP('2026-10-04')")).toBe("2026-10-04 00:00:00");
    expect(one(d, "SELECT TIMESTAMP(NULL, '06:00:00')")).toBeNull();
  });

  it("runs the added-source sweep query", () => {
    const d = db();
    d.exec("CREATE TABLE sources (source_id INT, enabled INT, kind TEXT, last_run_at TEXT, refresh_minutes INT)");
    d.exec(`INSERT INTO sources VALUES (1, 1, 'rss', '2000-01-01 18:00:00', 1440), (2, 1, 'html', '2999-01-01 00:00:00', 1440),
            (3, 1, 'json', '2000-01-01 00:00:00', 60), (4, 0, 'rss', NULL, 1440)`);
    const rows = d.prepare(translate(`SELECT source_id FROM sources WHERE enabled = 1 AND kind IN ('rss', 'html', 'json', 'agmarknet')
       AND (last_run_at IS NULL
         OR (refresh_minutes >= 1440 AND NOW() >= TIMESTAMP(CURDATE(), '06:00:00') AND last_run_at < TIMESTAMP(CURDATE(), '06:00:00'))
         OR (refresh_minutes < 1440 AND last_run_at < NOW() - INTERVAL refresh_minutes MINUTE))`)).all() as { source_id: number }[];
    const ids = rows.map((r) => r.source_id);
    expect(ids).toContain(3);
    expect(ids).not.toContain(2);
    expect(ids).not.toContain(4);
    // the daily one is due only after 6:00 AM IST
    expect(ids.includes(1)).toBe(Number((one(d, "SELECT HOUR(NOW())") as number)) >= 6);
  });
});
