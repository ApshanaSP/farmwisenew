/**
 * The alert does not come and go (26 Nov 2026): the AI's reading of a headline is kept by the headline, so a new report, another build's ids or
 * a model that fails takes no reading away; and the reports behind an alert leave it by whole days, never in the middle of one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const g = vi.hoisted(() => ({ calls: [] as string[], fail: false }));
vi.mock("@/lib/collector/db", () => ({ default: { query: vi.fn() } }));
vi.mock("@/lib/ai/gateway", () => ({
  aiStatus: () => ({ available: true }),
  generateJson: async (c: { prompt: string }) => {
    g.calls.push(c.prompt);
    if (g.fail) throw new Error("busy");
    return { object: { items: c.prompt.split("\n").map((l) => ({ id: l.split(":")[0], hazard: "heavy_rain", storm_name: "", occasion: "", level: "orange", districts: ["Chennai"], when: "" })) } };
  }
}));
const { aiReads, lane } = await import("./alerts");
const settled = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => { global.__alertAi = undefined; g.calls = []; g.fail = false; });

describe("one reading per headline", () => {
  it("kept when another headline joins, under another id, and when the model fails", async () => {
    expect(aiReads([{ id: "D1", text: "Orange alert for Chennai" }])).toBeNull();
    await settled();
    expect(aiReads([{ id: "D1", text: "Orange alert for Chennai" }])?.get("D1")?.level).toBe(2);
    expect(g.calls).toHaveLength(1);
    g.fail = true;
    const docs = [{ id: "X7", text: "Orange  alert for Chennai" }, { id: "D2", text: "Heavy rain to return" }];
    expect([...aiReads(docs)!.keys()]).toEqual(["X7"]); // the same headline in the next build
    await settled();
    expect(g.calls).toEqual(["D1: Orange alert for Chennai", "D2: Heavy rain to return"]); // only the new one was asked about
    expect([...aiReads(docs)!.keys()]).toEqual(["X7"]);
    expect(g.calls).toHaveLength(2); // a failed one is not asked again on every load
  });
});

describe("the reports behind an alert", () => {
  const n = (t: string, k: number) => ({ id: `N${k}`, title: `Orange alert for Chennai, heavy rain likely (${k})`, titleEn: null, publisher: `Outlet ${k}`, t });
  const at = (now: string) => lane({ now, imd: [], sachet: [], feeds: [], fallback: null, news: [n("2026-11-24 01:00:00", 1), n("2026-11-24 02:00:00", 2)] });
  it("stay from 12 AM two days before the desk's day, whatever the hour, and leave when the day rolls over", () => {
    for (const now of ["2026-11-26 06:00:00", "2026-11-26 14:00:00", "2026-11-26 23:59:00", "2026-11-27 05:59:00"]) expect(at(now).newsOutlets, now).toBe(2);
    expect(at("2026-11-27 06:00:00").newsOutlets).toBe(0);
  });
});
