/**
 * Rain Rehearsal's whole answer on the frozen store (npm run eval:golden): the same engine the console calls, on the
 * frozen build with its clock. Every count the panel shows equals the length of the list it counts; the after-rain
 * report equals an independent count over the rain's reports; no complainant field reaches the payload; every job has
 * a unique key and a department; a replay uses only what was known two days before the rain.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { haveStore, loadFrozen } from "@/lib/assistant/__tests__/golden/harness";
import type { RehearsalState } from "./types";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));

let live: RehearsalState, replay: RehearsalState | null = null;
const PERSONAL = /complainant|mobile|phone|email|address|reporter|aadhaar/i;

beforeAll(async () => {
  if (!haveStore()) return;
  const f = await loadFrozen();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(f.frozenAt);
  const { rehearsalState } = await import("./engine");
  live = await rehearsalState({ manual: true });
  const last = [...live.rains].reverse().find((r) => r.reports >= 20 && r.end < live.asOf.slice(0, 10));
  if (last) replay = await rehearsalState({ replay: last.id });
}, 600_000);
afterAll(() => vi.useRealTimers());

describe.skipIf(!haveStore())("Rain Rehearsal on the frozen store", () => {
  it("counts what it lists", () => {
    for (const d of [live, replay].filter(Boolean) as RehearsalState[]) {
      expect(d.counts.likely).toBe(d.streets.filter((s) => s.tier === 2).length);
      expect(d.counts.possible).toBe(d.streets.filter((s) => s.tier === 1).length);
      expect(d.counts.chokes).toBe(d.chokes.length);
      expect(d.counts.dry).toBe(d.dry.length);
      expect(d.counts.jobs).toBe(d.jobs.length);
      expect(d.counts.wardsLoseFire).toBe(d.wards.filter((w) => w.loses.includes("fire")).length);
      expect(d.depts.reduce((s, x) => s + x.jobs, 0)).toBe(d.jobs.length);
      for (const s of d.streets) expect(s.incidents.length).toBeGreaterThan(0);
      for (const c of d.chokes) expect(d.streets.some((s) => s.key === c.street)).toBe(true);
    }
  });

  it("gives every job a unique key, a department and a place", () => {
    const keys = live.jobs.map((j) => j.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const j of live.jobs) { expect(j.dept).toMatch(/^[A-Z0-9-]{2,20}$/); expect(Number.isFinite(j.lat) && Number.isFinite(j.lon)).toBe(true); expect(j.en.length).toBeGreaterThan(5); }
  });

  it("never carries a complainant's personal data", () => {
    const walk = (v: unknown, path: string) => {
      if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { expect(PERSONAL.test(k), `${path}.${k}`).toBe(false); walk(x, `${path}.${k}`); }
    };
    walk(live, "live");
    if (replay) walk(replay, "replay");
  });

  it("replays a past rain from two days before it, and its report card adds up", () => {
    if (!replay) return;
    expect(replay.mode).toBe("replay");
    expect(replay.asOf < `${replay.replay!.start} 00:00:00`).toBe(true);
    const c = replay.check!;
    expect(c.onPredicted + c.missed).toBe(c.reports.length);
    expect(c.flooded + c.quiet).toBe(replay.streets.length);
    expect(c.reports.filter((r) => !r.missed).length).toBe(c.onPredicted);
    // the reports are the rain's, in time order
    for (let k = 1; k < c.reports.length; k++) expect(c.reports[k].first >= c.reports[k - 1].first).toBe(true);
    for (const r of c.reports) expect(r.first >= `${c.event.start} 00:00:00`).toBe(true);
  });

  it("answers in time", () => {
    console.log(`live rehearsal ${live.ms} ms (${live.streets.length} streets, ${live.jobs.length} jobs); replay ${replay?.ms ?? "-"} ms; payload ${JSON.stringify(live).length} bytes`);
    expect(live.ms).toBeLessThan(30_000);
  });
});
