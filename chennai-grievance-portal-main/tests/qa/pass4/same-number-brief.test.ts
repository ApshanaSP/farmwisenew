// QA pass 4 (same number everywhere): the AI write-ups on the Briefing page need a model, and this pass has no key on the server. So they are
// tested with a FAKE MODEL at the boundary: lib/ai/gateway's generateJson is replaced by a stub that records the facts it was handed and gives no
// answer. Nothing here reaches a real model. The real store.ts reads the pinned snapshot; the facts are compared with the independent oracle.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ prompts: [] as { name: string; prompt: string }[] }));
vi.mock("@/lib/ai/gateway", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/gateway")>()),
  generateJson: vi.fn(async (req: { name: string; prompt: string }) => {
    captured.prompts.push({ name: req.name, prompt: req.prompt });
    throw new Error("fake model: no answer");
  })
}));

import fs from "node:fs";
import path from "node:path";
import "@/lib/collector/derive";
import { awsPool } from "@/lib/aws/store";
import { explain } from "@/lib/collector/intel";
import { dayBrief, deptBrief } from "@/lib/collector/aibrief";
import { loadOracle, wallMs } from "../oracle/pinned.mjs";

const FROZEN = "2026-11-06T06:30:00.000Z"; // 12:00 IST; the store's as-of (18:08) is later, so the console's now is 18:08
const figure = (facts: string, re: RegExp) => { const m = facts.match(re); return m ? Number(m[1].replace(/,/g, "")) : null; };

describe("same number: the facts the AI day brief writes from (fake model at the boundary)", () => {
  let o: any;
  let capped: Record<string, { need_all: number; need_top400: number }> | null = null;
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(FROZEN) });
    o = loadOracle();
  });
  afterAll(() => { vi.useRealTimers(); });

  const factsFor = async (scope: { period: "daily" | "weekly" | "monthly" | "quarterly"; zone: number | null; dept: string | null }) => {
    captured.prompts.length = 0;
    const r = await dayBrief({ ...scope, taluk: null }, "qa-fake-model");
    expect(r).toBeNull(); // the fake model never answers
    expect(captured.prompts.length).toBeGreaterThan(0);
    return captured.prompts[0].prompt;
  };

  /** The brief's own window: the hour the console's now falls in (aibrief.ts briefHour). */
  const hourOf = (o: any) => wallMs(`${String(o.now).slice(0, 13)}:00:00`) as number;
  const windowRows = (o: any, period: string, zone: number | null, dept: string | null, endMs: number) => {
    const h = { daily: 24, weekly: 168, monthly: 720, quarterly: 2160 }[period]! * 3600_000;
    return o.effective.filter((r: any) => r.t != null && r.t > endMs - h && r.t <= endMs && (zone == null || r.zone === zone) && (dept == null || r.dept === dept));
  };

  it("district, daily: what it says over its own window (the hour) agrees with the raw rows", async () => {
    const f = await factsFor({ period: "daily", zone: null, dept: null });
    const rows = windowRows(o, "daily", null, null, hourOf(o));
    expect(figure(f, /Incidents reported: (\d+)/)).toBe(rows.length);
    expect(figure(f, /Severe: (\d+)/)).toBe(rows.filter((r: any) => r.sev === "Severe").length);
    expect(figure(f, /Still open: (\d+)/)).toBe(rows.filter((r: any) => r.open).length);
    expect(figure(f, /no department record: (\d+)/)).toBe(rows.filter((r: any) => r.mediaOnly).length);
    expect(figure(f, /Citizen grievances: (\d+) complaints/)).toBe(rows.reduce((a: number, r: any) => a + r.complaints, 0));
  });

  it("weekly, Adyar: its open and past-deadline facts over its own window", async () => {
    const f = await factsFor({ period: "weekly", zone: 13, dept: null });
    const rows = windowRows(o, "weekly", 13, null, hourOf(o));
    expect(figure(f, /Incidents reported: (\d+)/)).toBe(rows.length);
    expect(figure(f, /Still open: (\d+)/)).toBe(rows.filter((r: any) => r.open).length);
    // "past their deadline (any date)": open complaints at any date in the scope, as the sentence says
    const any = o.effective.filter((r: any) => r.zone === 13 && r.open && r.breached && r.complaints > 0).length;
    expect(figure(f, /past their deadline \(any date\): (\d+)/)).toBe(any);
  });

  it.fails("same-number-12 the brief's figures are the tile's figures", async () => {
    // The brief's window ends at the top of the hour (18:00) and the tile's at the console's now (18:08), so on the same page the two differ.
    const f = await factsFor({ period: "weekly", zone: null, dept: null });
    expect(figure(f, /Incidents reported: (\d+)/)).toBe(o.value("reported", { period: "weekly" }));
  });

  it("the brief against the tile: the difference is exactly the rows between the two ends of the window", async () => {
    const f = await factsFor({ period: "weekly", zone: null, dept: null });
    const tile = o.value("reported", { period: "weekly" });
    const brief = figure(f, /Incidents reported: (\d+)/);
    expect(typeof brief).toBe("number");
    const end = hourOf(o), h = 168 * 3600_000;
    const dropped = o.effective.filter((r: any) => r.t > end && r.t <= o.nowMs);
    const gained = o.effective.filter((r: any) => r.t > end - h && r.t <= o.nowMs - h);
    expect(tile - dropped.length + gained.length).toBe(brief);
  });

  it("the action list's cap: how many open incidents need the Collector, over all of them against the top 400", async () => {
    const out: Record<string, { open: number; need_all: number; need_top400: number; beyond_cap: string[] }> = {};
    for (const period of ["weekly", "monthly", "quarterly"] as const) {
      const ids = new Set(o.ids("ongoing", { period }));
      const [rows] = await (awsPool() as any).query(`SELECT i.incident_id AS id, i.category_label AS type, i.place_text AS loc, i.zone_name, i.severity_level AS sev, i.is_open AS open, i.sla_breached AS breached,
        i.severity_reasons, i.priority_reasons, i.attention_reason, i.priority_score AS priority, i.ai_summary, i.ai_attention, i.ai_next_step FROM incidents i WHERE i.is_open = 1 ORDER BY i.priority_score DESC`);
      const scoped = (rows as any[]).filter((r) => ids.has(String(r.id)));
      const need = scoped.map((r, k) => ({ id: String(r.id), k, yes: explain(r).needsYou })).filter((x) => x.yes);
      out[period] = { open: scoped.length, need_all: need.length, need_top400: need.filter((x) => x.k < 400).length, beyond_cap: need.filter((x) => x.k >= 400).map((x) => x.id) };
    }
    fs.writeFileSync(path.resolve(__dirname, "..", "..", "..", "..", "docs", "qa", "pass4", "evidence", "same-number-exportcap.json"), JSON.stringify(out, null, 1));
    capped = out;
    // the rule itself: below 400 open incidents nothing can be cut off
    expect(out.weekly.need_all).toBeGreaterThanOrEqual(out.weekly.need_top400);
  });

  it.fails("same-number-7 'need your attention' counts all that meet the rule, not only those in the top 400 read", () => {
    expect(capped?.weekly.need_top400).toBe(capped?.weekly.need_all);
  });

  it("department brief: the facts over its own window", async () => {
    captured.prompts.length = 0;
    const r = await deptBrief({ period: "weekly", zone: null, dept: "GCC-SWM", taluk: null }, "GCC-SWM", "qa-fake-model");
    expect(r).toBeNull();
    const f = captured.prompts[0].prompt;
    const rows = windowRows(o, "weekly", null, "GCC-SWM", hourOf(o));
    expect(figure(f, /Received: (\d+) incidents/)).toBe(rows.length);
    expect(figure(f, /Still open: (\d+)/)).toBe(rows.filter((x: any) => x.open).length);
    expect(figure(f, /(\d+) past deadline/)).toBe(rows.filter((x: any) => x.open && x.breached).length);
  });
});
