/**
 * v12 (21 Nov): Ask the Map's AI plan has a hard deadline (PLAN_MS, 12 s since askmap-v2) on a strongly held timer. At 06:38:33 a filler sentence held the
 * map lane 25.2 s waiting on a Claude console step (the SDK's 25 s), then answered without AI anyway. The model is a test double that
 * answers only when its signal says stop.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const seen: { signal?: AbortSignal }[] = [];
vi.mock("@/lib/ai/gateway", () => ({
  generateJson: vi.fn((c: { abortSignal?: AbortSignal }) => {
    seen.push({ signal: c.abortSignal });
    // a model that never answers: only the signal ends the call
    return new Promise((_res, rej) => c.abortSignal?.addEventListener("abort", () => rej(c.abortSignal!.reason), { once: true }));
  })
}));

import { PLAN_MS, aiPlan } from "./ai";

const ctx = (signal?: AbortSignal) => ({ cats: ["FLOOD_WATERLOGGING"], depts: ["GCC"], places: [], user: "collector@test", lang: "en" as const, signal });

afterEach(() => { vi.useRealTimers(); seen.length = 0; });

describe("v12: aiPlan's deadline", () => {
  it("gives up after PLAN_MS (12 s) with its own error, never the SDK's 25 s", async () => {
    vi.useFakeTimers();
    expect(PLAN_MS).toBe(12_000);
    let err: unknown = null, settled = false;
    const p = aiPlan("okay now tell me show me", null, ctx()).then(() => { settled = true; }, (e) => { err = e; settled = true; });
    await vi.advanceTimersByTimeAsync(PLAN_MS - 100);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    await p;
    expect(settled).toBe(true);
    expect(String((err as Error)?.message)).toMatch(/no plan in 12 s/);
    expect(seen[0].signal?.aborted).toBe(true);
  });

  it("the request's own abort is passed on as itself (a cancel, not a timeout)", async () => {
    const ac = new AbortController();
    const p = aiPlan("schools in Zone 11", null, ctx(ac.signal)).catch((e: unknown) => e);
    await Promise.resolve();
    ac.abort(new DOMException("gone", "AbortError"));
    const e = await p;
    expect((e as DOMException).name).toBe("AbortError");
  });
});
