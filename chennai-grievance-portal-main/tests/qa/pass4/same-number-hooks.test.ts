// QA pass 4 (same number everywhere): what the app's own build hooks (lib/collector/derive.ts) do to the pinned build, row by row.
// The real store.ts loads the pinned snapshot and runs the real hooks. Each hook is wrapped only to read the incidents table before
// and after it, so the raw snapshot (the oracle's input) can be reconciled with what every screen reads, by id and by hook.
// The file it writes is what tests/qa/pass4/same-number.mjs uses to name the rows. No model, no server, no write to any store.
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import "@/lib/collector/derive";
import { awsPool } from "@/lib/aws/store";

type Row = Record<string, any>;
const FIELDS = ["zone_no", "zone_name", "ward_no", "taluk_code", "lat", "lon", "place_text", "first_reported_at", "last_update_at", "category_code", "lead_dept", "severity_level", "status_std", "is_open", "sla_breached", "sla_due_at", "loc_precision_m", "citizen_complaints", "media_only", "source_count", "member_count", "dead", "injured"];
const OUT = path.resolve(__dirname, "..", "..", "..", "..", "docs", "qa", "pass4", "evidence", "same-number-hooks.json");

describe("same number: what the build hooks change", () => {
  // the same frozen clock as the server: the places hook looks back from "today"
  beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-06T06:30:00.000Z") }); });
  afterAll(() => { vi.useRealTimers(); });
  it("records every row each hook removes or changes", async () => {
    const hooks: Map<string, (db: any) => any> = (globalThis as any).__awsStore.hooks;
    const steps: { hook: string; removed: Row[]; changed: Row[] }[] = [];
    const read = (db: any) => new Map((db.prepare(`SELECT incident_id, ${FIELDS.join(", ")} FROM incidents`).all() as Row[]).map((r) => [String(r.incident_id), r]));
    for (const [name, hook] of [...hooks]) {
      hooks.set(name, async (db: any) => {
        const before = read(db);
        await hook(db);
        const after = read(db);
        const removed = [...before.entries()].filter(([id]) => !after.has(id)).map(([id, r]) => ({ id, media_only: r.media_only, first_reported_at: r.first_reported_at, zone_no: r.zone_no, lead_dept: r.lead_dept, is_open: r.is_open, sla_breached: r.sla_breached, severity_level: r.severity_level }));
        const changed: Row[] = [];
        for (const [id, r] of after) {
          const b = before.get(id);
          if (!b) continue;
          const d = Object.fromEntries(FIELDS.filter((f) => String(b[f]) !== String(r[f])).map((f) => [f, [b[f], r[f]]]));
          if (Object.keys(d).length) changed.push({ id, ...d });
        }
        steps.push({ hook: name, removed, changed });
      });
    }
    const [rows] = await (awsPool() as any).query(`SELECT COUNT(*) AS n FROM incidents`);
    const [grouped] = await (awsPool() as any).query(`SELECT incident_id AS id, cluster_id AS c FROM incidents WHERE cluster_size > 1`);
    expect(Number(rows[0].n)).toBeGreaterThan(1000);
    const [placedRows] = await (awsPool() as any).query(`SELECT incident_id AS id, place, how FROM _placed`);
    const how = new Map((placedRows as Row[]).map((p) => [String(p.id), { place: p.place, how: p.how }]));
    const removed = steps.flatMap((s) => s.removed.map((r) => ({ ...r, hook: s.hook })));
    const zoneMoves = steps.flatMap((s) => s.changed.filter((c) => c.zone_no).map((c) => ({ id: c.id, hook: s.hook, zone_no: c.zone_no, zone_name: c.zone_name ?? null, ...(how.get(String(c.id)) ?? {}) })));
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ note: "Written by tests/qa/pass4/same-number-hooks.test.ts from the pinned build: what lib/collector/derive.ts takes out of or changes in the incidents table.",
      incidents_after_hooks: Number(rows[0].n), removed, zoneMoves, clusters: Object.fromEntries((grouped as Row[]).map((g) => [String(g.id), String(g.c)])), changed: steps.flatMap((s) => s.changed.map((c) => ({ hook: s.hook, ...c }))) }, null, 1));
    expect(steps.length).toBeGreaterThanOrEqual(8);
  });
});
