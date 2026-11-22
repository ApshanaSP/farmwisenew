/**
 * v12 (21 Nov): the turn's deadline on a rung fires even after a garbage collection. On 21 Nov Groq planner calls with a 6 s cap ran 25 and
 * 44 s: the deadline was AbortSignal.any([stop, AbortSignal.timeout(left)]), whose timer Node 22.14 collects. The model here is a test
 * double that ignores its own time limit and stops only when its signal aborts, as a hung connection does; a full collection runs while
 * it waits. Real clock (the point is the real timer).
 */
import fs from "fs";
import os from "os";
import path from "path";
import v8 from "node:v8";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { JsonCall, JsonResult } from "@/lib/ai/gateway";
import { callLlm, resetLatency } from "./llm";
import { Ledger, MemoryStore } from "./ledger";

const S = z.object({ ok: z.boolean() });

beforeEach(() => { vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-llm12-"))); resetLatency(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("v12: a hung model call ends at the turn's deadline, garbage collection or not", () => {
  it("callLlm comes back (null: the rules answer) about at `until`, not when the Collector speaks again", async () => {
    v8.setFlagsFromString("--expose_gc");
    const gc = vm.runInNewContext("gc") as () => void;
    const stopped: number[] = [];
    // a hung call: it never answers and never honours timeoutMs; only the abort signal ends it (held only by the signal, as an SDK holds it)
    const generate = <U,>(c: JsonCall<U>): Promise<JsonResult<U>> => new Promise((_res, rej) => {
      c.abortSignal?.addEventListener("abort", () => { stopped.push(Date.now()); rej(c.abortSignal!.reason); }, { once: true });
    });
    const t0 = Date.now();
    const p = callLlm({ name: "t", system: "s", prompt: "p", schema: S, maxOutputTokens: 50, user: "u", lane: "planner", until: t0 + 900, hedge: false },
      { generate: generate as never, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false, claudeOk: () => false });
    for (let i = 0; i < 4; i++) { gc(); await new Promise((r) => setTimeout(r, 20)); }
    const r = await Promise.race([p, new Promise((r) => setTimeout(() => r("hung"), 5000))]);
    expect(r).toBeNull();
    expect(stopped.length).toBeGreaterThanOrEqual(1);
    expect(stopped[0] - t0).toBeLessThan(2500);
  });
});
