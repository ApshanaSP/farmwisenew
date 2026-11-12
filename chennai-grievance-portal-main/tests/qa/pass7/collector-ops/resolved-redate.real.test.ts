// QA pass 7, hunt2-ops-07 (P0) on the pinned snapshot: "resolving" GCC-SWM cases that were resolved months ago must not count them
// again as resolved today. The real decisions route (session and password step stubbed) and the real kpiBlock / list.
//   QA_PIN_PORT=3192 npx vitest run --config tests/qa/pass7/collector-ops/vitest.real.config.ts tests/qa/pass7/collector-ops/resolved-redate.real.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { decide } from "./lib";
import intelPool from "@/lib/collector/db";
import { asOf, kpiBlock } from "@/lib/collector/intel";

let now = "";
beforeAll(async () => { now = await asOf(); }, 300_000);
const rows = async (sql: string, p: unknown[] = []) => ((await intelPool.query(sql, p)) as unknown as [Record<string, any>[]])[0];

describe("hunt2-ops-07: a closing decision on a case already closed does not re-date its closure", () => {
  it("resolve / verify on 9 GCC-SWM cases resolved in May leaves the daily Resolved tile as it was", async () => {
    const old = await rows(`SELECT incident_id AS id, severity_level AS sev FROM incidents WHERE lead_dept = 'GCC-SWM' AND is_open = 0 AND status_std = 'Resolved'
      AND closed_at < ? - INTERVAL 60 DAY ORDER BY first_reported_at LIMIT 9`, [now]);
    expect(old.length).toBe(9);
    const s = { period: "daily" as const, zone: null, dept: "GCC-SWM" };
    const before = (await kpiBlock(s, now)).cur.resolved;
    const r = await decide(old.map((x) => String(x.id)), "resolve");
    expect(r.status).toBe(201); // the decision is still recorded (the Collector may act at any stage: officer-day-03, owner)
    const after = await kpiBlock(s, now);
    expect(after.cur.resolved).toBe(before);
    expect(after.series.resolved.reduce((a: number, b: number) => a + b, 0)).toBe(before);
  });
});
