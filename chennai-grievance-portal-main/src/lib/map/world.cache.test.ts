/**
 * Ask the Map speed round (23 Nov 2026): consecutive questions share one reading of the Collector's decisions and the store build
 * key, and get the same World object; a decision (the data epoch) or OVERLAY_MS starts a new reading. The store is a stub that
 * counts its queries.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ sql: [] as string[], decisions: [] as { incident_id: string; decision: string }[], meta: 0 }));
vi.mock("@/lib/collector/db", () => ({
  default: {
    query: async (sql: string) => {
      h.sql.push(sql);
      if (/FROM incidents i WHERE i\.lat IS NOT NULL/.test(sql)) return [[
        { id: "I1", cat: "SOLID_WASTE", family: "WASTE_SANITATION", dept: "GCC-SWM", ward: 1, zone: 1, taluk: "TLK-AAA", lat: 13.0, lon: 80.2, prec: 30, place: null, status: "Open", open: 1, sev: "Low",
          priority: 10, reasons: null, sla_due: null, breached: 0, first: "2026-11-20 10:00:00", closed_at: null, title: "Garbage", citizen: 1, sources: 1, hotspot: null, tags: null, outlets: 0 }]];
      if (/collector_decisions/.test(sql)) return [h.decisions];
      return [[]];
    }
  },
  TITLE: "i.title",
  ops: (t: string) => `\`ops\`.\`${t}\``
}));
vi.mock("@/lib/collector/intel", () => ({ asOf: async () => "2026-11-23 10:00:00", exportMeta: async () => { h.meta++; return { build_id: "b1" }; } }));
vi.mock("@/lib/collector/geo", () => ({ mapGeo: async () => ({ wards: [], zones: [], taluks: [] }) }));
vi.mock("@/lib/collector/nlp", async (orig) => ({ ...(await orig<object>()), categories: () => [], gazetteerEntries: async () => [] }));

import { bumpDataEpoch } from "@/lib/collector/epoch";
import { OVERLAY_MS, world } from "./world";

const decisionReads = () => h.sql.filter((s) => /collector_decisions/.test(s)).length;

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-23T04:30:00Z")); });
afterEach(() => vi.useRealTimers());

describe("the world for consecutive questions", () => {
  it("is read once and shared: the same object, one reading of the decisions, one build-key query", async () => {
    const a = await world();
    const reads = decisionReads(), meta = h.meta;
    const b = await world();
    const c = await world();
    expect(b).toBe(a);
    expect(c.world).toBe(a.world);
    expect(decisionReads()).toBe(reads);
    expect(h.meta).toBe(meta);
    expect(a.world.incidents[0].open).toBe(true);
  });

  it("a decision moves the data epoch: the next question reads the decisions again and the case has left the open list", async () => {
    const a = await world();
    const reads = decisionReads();
    h.decisions.push({ incident_id: "I1", decision: "resolve" });
    bumpDataEpoch();
    const b = await world();
    expect(decisionReads()).toBe(reads + 1);
    expect(b.world).not.toBe(a.world);
    expect(b.world.incidents[0].open).toBe(false);
    // the base (the store build's part) is kept
    expect(b.resolver).toBe(a.resolver);
    expect(b.world.wards).toBe(a.world.wards);
  });

  it("without a decision, the reading is renewed after OVERLAY_MS", async () => {
    await world();
    const reads = decisionReads(), meta = h.meta;
    vi.setSystemTime(Date.now() + OVERLAY_MS - 1000);
    await world();
    expect(decisionReads()).toBe(reads);
    vi.setSystemTime(Date.now() + 2000);
    await world();
    expect(decisionReads()).toBe(reads + 1);
    expect(h.meta).toBe(meta + 1);
  });
});
