/**
 * 27 Nov review: the market prices source run (sources.ts collectMandi through runSource). The hosted copy cannot reach agrimark.tn.gov.in,
 * so the copy that reads it sends the hosted copy what it holds after each run (tnpush.ts pushTnPrices: a no-op without
 * TN_PRICES_PUSH_URL), and a failed send is said on the Sources page, never thrown. No network: the collector and the send are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  runs: [] as unknown[][],
  collect: vi.fn(),
  push: vi.fn()
}));
vi.mock("@/lib/collector/db", () => ({
  default: {
    query: async (sql: string, params: unknown[] = []) => {
      if (/SELECT \* FROM .*sources WHERE source_id/.test(sql)) return [[{ source_id: 9, kind: "agmarknet", name: "Tamil Nadu market prices (Uzhavar Sandhai)" }]];
      if (/INSERT INTO .*source_runs/.test(sql)) h.runs.push(params);
      return [{ affectedRows: 1 }];
    }
  },
  ops: (t: string) => `ops.${t}`, TITLE: "i.title", CLUSTER: "i.incident_id", INTEL_DB: "district_intel", OPS_DB: "district_intel_ops"
}));
vi.mock("@/lib/collector/tnprices", async (orig) => ({ ...(await orig<typeof import("./tnprices")>()), collectTnPrices: h.collect }));
vi.mock("@/lib/collector/tnpush", () => ({ pushTnPrices: h.push }));

import { runSource } from "./sources";

const run = (o: Partial<{ calls: number; answered: number; seen: number; added: number; errors: string[] }> = {}) =>
  ({ calls: 2, answered: 2, seen: 40, added: 5, errors: [], newest: "2026-11-26", days: ["2026-11-26"], ...o });
/** the run row written: [id, started, ok, http, seen, new, login, attempts, error, actor] */
const lastRun = () => h.runs.at(-1)!;

beforeEach(() => {
  h.runs = [];
  h.collect.mockReset();
  h.push.mockReset();
  vi.stubEnv("DATA_GOV_API_KEY", "");
  vi.stubEnv("AGMARKNET_API", "");
});

describe("the market prices run", () => {
  it("sends the hosted copy what this copy holds after reading the markets", async () => {
    h.collect.mockResolvedValue(run());
    h.push.mockResolvedValue({ sent: 160, merged: 8, error: null });
    const r = await runSource(9, "scheduler");
    expect(h.push).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: true, seen: 40, items_new: 5, error: null });
  });

  it("says a failed send on the Sources page and stays healthy: the markets were read", async () => {
    h.collect.mockResolvedValue(run());
    h.push.mockResolvedValue({ sent: 160, merged: null, error: "could not reach the hosted copy: timeout" });
    const r = await runSource(9, "scheduler");
    expect(r.ok).toBe(true);
    expect(r.error).toMatch(/hosted copy.*could not reach the hosted copy: timeout/);
    expect(lastRun()[8]).toMatch(/hosted copy/);
  });

  it("a send that throws never fails the run", async () => {
    h.collect.mockResolvedValue(run());
    h.push.mockRejectedValue(new Error("boom"));
    const r = await runSource(9, "scheduler");
    expect(r.ok).toBe(true);
    expect(r.error).toMatch(/boom/);
  });
});
