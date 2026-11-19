/** The metric registry (metrics.ts): every id reads from a real tool, values come from code, and a missing metric is an error, never a number. */
import { describe, expect, it } from "vitest";
import type { ToolResult } from "@/lib/assistant/types";
import { METRIC_DEFS, computeMetric, metricArgs, metricById, metricsPromptLine, readMetric } from "./metrics";
import { MEASURES } from "./screens";
import { fakeHands } from "./stagefake";

const SCOPE = { period: "daily" as const, zone: null, dept: null, cat: null, taluk: null, sev: null };
const res = (data: unknown): ToolResult => ({ tool: "x", args: {}, scope: null, asOf: "2026-10-29 07:00:00", data, facts: [], sources: [], incidentIds: [], testData: true, caveats: [] });

describe("the registry", () => {
  it("has one entry per id, both languages, a unit and a source tool", () => {
    const ids = METRIC_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of METRIC_DEFS) {
      expect(d.label.en.length, d.id).toBeGreaterThan(2);
      expect(/[஀-௿]/.test(d.label.ta), `${d.id} Tamil label`).toBe(true);
      expect(d.unit.en.length, d.id).toBeGreaterThan(0);
      expect(d.source.tool, d.id).toMatch(/^[a-z_]+$/);
    }
  });
  it("keeps the names the ranking screen already uses, so one word means one thing", () => {
    for (const m of MEASURES) expect(metricById(m), m).not.toBeNull();
  });
  it("gives the planner one line of at most 600 characters naming every id", () => {
    const line = metricsPromptLine();
    expect(line.length).toBeLessThanOrEqual(600);
    for (const d of METRIC_DEFS) expect(line).toContain(d.id);
  });
  it("sends a tool only the filters it honours", () => {
    const zoneOpen = metricById("zone_open")!;
    expect(metricArgs(zoneOpen, { ...SCOPE, zone: 13, cat: "FLOOD_WATERLOGGING" })).toEqual({ scope: { period: "daily", zone: null, dept: null, cat: "FLOOD_WATERLOGGING", taluk: null } });
    expect(metricArgs(metricById("rain")!, { ...SCOPE, zone: 13 })).toEqual({ metric: "rainfall_24h_mm" });
  });
});

describe("computeMetric", () => {
  it("computes the value, the figure before and the change in code", async () => {
    const r = await computeMetric("incidents_reported", SCOPE, fakeHands());
    expect(r).toMatchObject({ ok: true, value: 50, prev: 40, delta: 10, pct: 25 });
  });
  it("reads a zone's own row when the scope names the zone, else sums the zones", async () => {
    expect(await computeMetric("zone_open", { ...SCOPE, zone: 13 }, fakeHands())).toMatchObject({ ok: true, value: 101 });
    const all = await computeMetric("zone_incidents", SCOPE, fakeHands());
    expect(all).toMatchObject({ ok: true, value: 120 + 80 + 59 + 143, prev: 100 + 85 + 40 + 95 });
    if (all.ok) expect(all.rows.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
  });
  it("takes the highest gauge for rain and never averages department averages", async () => {
    expect(await computeMetric("rain", SCOPE, fakeHands())).toMatchObject({ ok: true, value: 64.2 });
    const backlog = await computeMetric("dept_backlog", SCOPE, fakeHands());
    expect(backlog).toMatchObject({ ok: true, value: null });
    if (backlog.ok) expect(backlog.rows[0]).toMatchObject({ key: "POL-GCP", value: 36 });
  });
  it("an unknown metric is an error object with no number in it", async () => {
    const r = await computeMetric("flood_deaths", SCOPE, fakeHands());
    expect(r).toMatchObject({ ok: false, error: "unknown_metric" });
    expect("value" in r).toBe(false);
    expect((r as { message: string }).message).not.toMatch(/\d/);
    // an id written by a model with a figure in it is echoed without the figure
    const sly = await computeMetric("deaths_500", SCOPE, fakeHands());
    expect(sly).toMatchObject({ ok: false, error: "unknown_metric" });
    expect((sly as { message: string }).message).not.toMatch(/\d/);
  });
  it("a failed tool and a missing field are errors, never a guessed 0", async () => {
    expect(await computeMetric("incidents_reported", SCOPE, fakeHands({ change_drivers: () => { throw new Error("store offline"); } }))).toMatchObject({ ok: false, error: "tool_failed" });
    expect(readMetric(metricById("incidents_reported")!, res({ totals: { prev: 40 } }), SCOPE)).toMatchObject({ ok: false, error: "no_data" });
    expect(readMetric(metricById("zone_open")!, res({ rows: [] }), SCOPE)).toMatchObject({ ok: false, error: "no_data" });
    // the fake's environment has no warning in force: said as missing
    expect(await computeMetric("imd_warning", SCOPE, fakeHands())).toMatchObject({ ok: false, error: "no_data" });
    // a zone with no row is not counted as 0
    expect(await computeMetric("zone_open", { ...SCOPE, zone: 2 }, fakeHands())).toMatchObject({ ok: false, error: "no_data" });
  });
  it("gives no percentage on a base too small to make one honest", () => {
    const r = readMetric(metricById("incidents_reported")!, res({ totals: { n: 9, prev: 3 } }), SCOPE);
    expect(r).toMatchObject({ ok: true, value: 9, prev: 3, delta: 6, pct: null });
  });
  it("every registered metric either computes on the fake world or says why not", async () => {
    for (const d of METRIC_DEFS) {
      const r = await computeMetric(d.id, SCOPE, fakeHands());
      if (r.ok) expect(r.value === null || Number.isFinite(r.value), d.id).toBe(true);
      else expect(["no_data", "tool_failed"], d.id).toContain(r.error);
    }
  });
});
