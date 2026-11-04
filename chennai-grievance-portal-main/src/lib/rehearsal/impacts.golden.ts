/**
 * Rain's Traffic, Power and Metro tabs on the frozen store (npm run eval:golden): each lists places with what every
 * rain did at them, every report points at a place that exists, the numbers the panel shows (a rain's count, a place's
 * rains) add up, and the generated logs (Power's outages, Metro's delays) are named as generated in the sources.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { haveStore, loadFrozen } from "@/lib/assistant/__tests__/golden/harness";
import type { ImpactData, Lens } from "./impacts";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/ai/gateway", async (orig) => {
  const m = await orig<typeof import("@/lib/ai/gateway")>();
  return { ...m, aiStatus: () => ({ available: false, problem: null, providers: [], stt: "" }), generateJson: async () => { throw new m.AiUnavailableError(); } };
});

let data: Record<Lens, ImpactData>;
beforeAll(async () => {
  if (!haveStore()) return;
  const f = await loadFrozen();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(f.frozenAt);
  const { impacts } = await import("./impacts");
  data = { traffic: await impacts("traffic"), power: await impacts("power"), metro: await impacts("metro") };
  for (const l of ["traffic", "power", "metro"] as Lens[]) {
    const d = data[l];
    console.log(`[${l}] items ${d.items.length} (level 3: ${d.items.filter((x) => x.level === 3).length}), reports ${d.reports.length}`);
    console.log(`[${l}] rains`, d.rains.map((r) => `${r.id.slice(5)}:${r.hit}`).join(" "));
    console.log(`[${l}] kpis`, d.kpis.map((k) => `${k.n} ${k.label}`).join(" | "));
    console.log(`[${l}] top`, d.items.slice(0, 5).map((x) => `${x.label} (${x.rains.length} rains, ${x.reports})`).join(" | "));
    console.log(`[${l}] insights`, d.insights.join(" // "));
    console.log(`[${l}] sources`, d.sources.map((s) => `${s.label}: ${s.n} (${s.kind})`).join(" | "));
  }
}, 600_000);

describe.skipIf(!haveStore())("Rain impacts", () => {
  for (const lens of ["traffic", "power", "metro"] as Lens[]) {
    it(`${lens}: places, what each rain did at them, and the counts adding up`, () => {
      const d = data[lens];
      expect(d.items.length).toBeGreaterThan(0);
      expect(d.kpis).toHaveLength(3);
      for (const r of d.rains) expect(r.hit).toBe(d.items.filter((x) => x.byRain[r.id]).length);
      const keys = new Set(d.items.map((x) => x.key));
      for (const r of d.reports) if (r.item) expect(keys.has(r.item), `${r.id} -> ${r.item}`).toBe(true);
      for (const x of d.items) {
        expect(x.rains).toEqual(Object.keys(x.byRain).sort());
        for (const id of x.rains) { expect(d.rains.some((r) => r.id === id)).toBe(true); expect(x.byRain[id].why.length).toBeGreaterThan(0); }
      }
      // the demo's generated logs are named as such in the sources (the panel shows Traffic's sources only)
      if (lens !== "traffic") expect(d.sources.some((s) => s.kind === "generated")).toBe(true);
    });
  }
  it("traffic: every road's rains come from its own records", () => {
    for (const x of data.traffic.items) {
      const own = new Set(data.traffic.reports.filter((r) => r.item === x.key && r.rain).map((r) => r.rain));
      for (const id of x.rains) expect(own.has(id) || x.kind === "underpass", `${x.key} rain ${id}`).toBe(true);
    }
  });
  it("metro has the lines: two metro lines and the suburban corridors", () => {
    expect(data.metro.items.length).toBeGreaterThanOrEqual(5);
    expect(data.metro.items.every((x) => x.kind === "line" && (x.path?.length ?? 0) > 1)).toBe(true);
  });
});
