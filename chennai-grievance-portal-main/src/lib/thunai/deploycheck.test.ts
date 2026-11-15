/**
 * v5 A6 (d): the pure parts of the Haiku deploy check (deploy.live.ts, which the owner runs once the key works and this build never
 * runs): the cost and its US$0.50 cap, the key check's verdict, the rate-limit headers kept, the timing sets and summary, the pairing,
 * the decision and the env lines it prints, the Groq file Step 4 pairs against, the ledger check, and the eval-only ladder pin.
 * No model call. Invented values only.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ARMS, CAP_USD, PRICE, Spend, armEnv, armP50, costUsd, cycleTo, envLines, gridRows, keyVerdict, ledgerCheck, liveBaseline, pairTuning, pickArm,
  pickLead, quantile, rateLimitHeaders, timingSets, type TimingRow
} from "./deploycheck";
import { Ledger, MemoryStore } from "./ledger";
import { ladder } from "./llm";

describe("cost: Haiku 5.5's prices, and the run stops before US$0.50", () => {
  it("a million tokens of each kind costs its price", () => {
    expect(PRICE).toEqual({ input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 });
    expect(costUsd({ input_tokens: 1e6, output_tokens: 0 })).toBeCloseTo(0.1, 10);
    expect(costUsd({ input_tokens: 0, output_tokens: 1e6 })).toBeCloseTo(0.5, 10);
    expect(costUsd({ input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1e6 })).toBeCloseTo(0.125, 10);
    expect(costUsd({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1e6 })).toBeCloseTo(0.01, 10);
  });

  it("a planner call: 650 new input, 2,000 read from the cache, 230 out", () => {
    // 650 x 0.10 + 2000 x 0.01 + 230 x 0.50 = 65 + 20 + 115 = 200 millionths of a dollar
    expect(costUsd({ input_tokens: 650, output_tokens: 230, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 })).toBeCloseTo(0.0002, 10);
  });

  it("Spend: adds each call, and refuses a call that could take the run over the cap (priced at the dearest call so far)", () => {
    expect(CAP_USD).toBe(0.5);
    const s = new Spend();
    expect(s.room()).toBe(true);
    s.add({ input_tokens: 1_000_000, output_tokens: 600_000 }); // 0.10 + 0.30 = 0.40
    expect(s.spent).toBeCloseTo(0.4, 10);
    expect(s.room()).toBe(false); // another 0.40 would make 0.80
    const t = new Spend(0.5);
    for (let i = 0; i < 10; i++) t.add({ input_tokens: 650, output_tokens: 230, cache_read_input_tokens: 2000 });
    expect(t.calls).toBe(10);
    expect(t.room(100)).toBe(true);
    expect(t.room(10_000)).toBe(false);
  });
});

describe("Step 1: the key", () => {
  it("401, 403 or a refusal: key refused, stop (cost $0)", () => {
    for (const r of [{ status: 401 }, { status: 403 }, { stopReason: "refusal" }]) expect(keyVerdict(r)).toEqual({ go: false, line: "key refused" });
    expect(keyVerdict({ status: 400, message: "Your credit balance is too low" })).toEqual({ go: false, line: "key refused (no credit left)" });
  });
  it("an answer (max_tokens 1 stops on max_tokens): go on", () => {
    expect(keyVerdict({ stopReason: "max_tokens" }).go).toBe(true);
    expect(keyVerdict({ stopReason: "end_turn" }).go).toBe(true);
  });
  it("busy or broken: stop, and say so", () => {
    expect(keyVerdict({ status: 429 })).toMatchObject({ go: false });
    expect(keyVerdict({ status: 429 }).line).toMatch(/rate limited/);
    expect(keyVerdict({ status: 529 }).line).toMatch(/busy/);
    expect(keyVerdict({}).line).toMatch(/no answer/);
  });
  it("only the anthropic-ratelimit-* headers are kept, names and values: never a key, an id or a cookie", () => {
    const h = new Headers({ "anthropic-ratelimit-requests-limit": "4000", "anthropic-ratelimit-tokens-remaining": "1999000", "Anthropic-RateLimit-Input-Tokens-Reset": "2026-11-20T10:00:00Z",
      "x-api-key": "sk-ant-should-never-show", "request-id": "req_123", "set-cookie": "a=b", "retry-after": "3" });
    expect(rateLimitHeaders(h)).toEqual({ "anthropic-ratelimit-requests-limit": "4000", "anthropic-ratelimit-tokens-remaining": "1999000", "anthropic-ratelimit-input-tokens-reset": "2026-11-20T10:00:00Z" });
    expect(rateLimitHeaders(undefined)).toEqual({});
    expect(rateLimitHeaders({ "anthropic-ratelimit-requests-remaining": "9", authorization: "Bearer x" })).toEqual({ "anthropic-ratelimit-requests-remaining": "9" });
  });
});

describe("Step 2: timing", () => {
  it("the screens and wide sentences by the rules' route, each cycled to 20; other bundles left out", () => {
    const items = ["s1", "s2", "s3", "w1", "d1"].map((text) => ({ text }));
    const route = (t: string) => (t.startsWith("s") ? "screens" : t.startsWith("w") ? "wide" : "data");
    const sets = timingSets(items, route);
    expect(sets.screens).toHaveLength(20);
    expect(sets.screens.slice(0, 4)).toEqual(["s1", "s2", "s3", "s1"]);
    expect(new Set(sets.wide)).toEqual(new Set(["w1"]));
    expect(sets.wide).toHaveLength(20);
    expect(cycleTo([], 20)).toEqual([]);
    expect(cycleTo([1, 2], 3)).toEqual([1, 2, 1]);
  });

  const row = (arm: TimingRow["arm"], ms: number, over: Partial<TimingRow> = {}): TimingRow => ({ arm, bundle: "screens", cold: false, ms, outcome: "ok", output_tokens: 200, input_tokens: 600, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0, stop_reason: "end_turn", path: "format", ...over });

  it("the whole-call p50 of an arm: warm, clean calls only, both bundles; the cold first call apart", () => {
    const rows = [row("low", 5000, { cold: true }), row("low", 800), row("low", 900, { bundle: "wide" }), row("low", 1000), row("low", 50, { outcome: "rate_limited" }), row("medium", 1300)];
    expect(armP50(rows, "low")).toBe(900);
    expect(armP50(rows, "medium")).toBe(1300);
    expect(armP50(rows, "compact")).toBeNull();
    expect(quantile([3, 1, 2], 0.5)).toBe(2);
    expect(quantile([], 0.5)).toBeNull();
  });
});

describe("Step 3: pairing, ids both runs have, clean outcomes only", () => {
  it("b = right only in the first, c = right only in the second; a 429 or an error on either side is left out", () => {
    const x = [{ id: "a", ok: true, outcome: "ok" }, { id: "b", ok: true, outcome: "ok" }, { id: "c", ok: false, outcome: "off_schema" }, { id: "d", ok: true, outcome: "ok" }, { id: "e", ok: false, outcome: "rate_limited" }, { id: "only-x", ok: true, outcome: "ok" }];
    const y = [{ id: "a", ok: false, outcome: "ok" }, { id: "b", ok: true, outcome: "ok" }, { id: "c", ok: true, outcome: "json_validate_failed" }, { id: "d", ok: false, outcome: "error" }, { id: "e", ok: true, outcome: "ok" }];
    const p = pairTuning(x, y);
    expect(p).toMatchObject({ n: 3, b: 1, c: 1 });
    expect(p.p).toBe(1);
  });
  it("a grid file's rows: id, ok and outcome only", () => {
    const file = JSON.parse('{"rows":[{"id":"t1","ok":true,"outcome":"ok","recipe":"cases","ms":9}]}') as Parameters<typeof gridRows>[0];
    expect(gridRows(file)).toEqual([{ id: "t1", ok: true, outcome: "ok" }]);
    expect(gridRows({})).toEqual([]);
  });
});

describe("the decision", () => {
  const p50 = (low: number | null, medium: number | null, compact: number | null) => ({ low, medium, compact });
  const even = { b: 0, c: 0 };

  it("effort medium only when it beats low by b - c >= 3 and its p50 is at most 1,200 ms", () => {
    expect(pickArm({ p50: p50(900, 1200, null), mediumVsLow: { b: 4, c: 1 }, compactVsLow: even }).arm.effort).toBe("medium");
    expect(pickArm({ p50: p50(900, 1201, null), mediumVsLow: { b: 4, c: 1 }, compactVsLow: even }).arm.effort).toBe("low");
    expect(pickArm({ p50: p50(900, 1000, null), mediumVsLow: { b: 3, c: 1 }, compactVsLow: even }).arm.effort).toBe("low");
    expect(pickArm({ p50: p50(900, null, null), mediumVsLow: { b: 9, c: 0 }, compactVsLow: even }).arm.effort).toBe("low");
  });

  it("compact on when it is not worse than full (c - b < 3) and saves at least 200 ms p50; it was measured at effort low only", () => {
    expect(pickArm({ p50: p50(1000, 1500, 800), mediumVsLow: even, compactVsLow: { b: 0, c: 2 } }).arm).toEqual(ARMS.find((a) => a.id === "compact"));
    expect(pickArm({ p50: p50(1000, 1500, 801), mediumVsLow: even, compactVsLow: even }).arm.compact).toBe(false);
    expect(pickArm({ p50: p50(1000, 1500, 600), mediumVsLow: even, compactVsLow: { b: 0, c: 3 } }).arm.compact).toBe(false);
    // medium chosen: the compact arm (low) is not combined with it
    expect(pickArm({ p50: p50(1000, 1100, 600), mediumVsLow: { b: 5, c: 0 }, compactVsLow: even }).arm).toEqual(ARMS.find((a) => a.id === "medium"));
  });

  it("lead: Haiku stays first unless worse than Groq on the live-60 by c - b >= 3, or its p50 for the chosen arm is over 1,500 ms", () => {
    expect(pickLead(900, { b: 2, c: 4 }).lead).toBe("haiku");
    expect(pickLead(900, { b: 1, c: 4 }).lead).toBe("groq");
    expect(pickLead(1501, { b: 5, c: 0 }).lead).toBe("groq");
    expect(pickLead(1500, null).lead).toBe("haiku");
    expect(pickLead(null, null).lead).toBe("haiku");
  });

  it("the env lines to set, and the groq line when Groq should lead; it never writes .env", () => {
    const low = ARMS.find((a) => a.id === "low")!, compact = ARMS.find((a) => a.id === "compact")!;
    expect(envLines(low, "haiku")).toEqual(["JARVIS_PLANNER_LEAD=haiku", "JARVIS_HAIKU_EFFORT=low", "JARVIS_PLAN_COMPACT=0"]);
    expect(envLines(compact, "groq")).toEqual(["set JARVIS_PLANNER_LEAD=groq", "JARVIS_PLANNER_LEAD=groq", "JARVIS_HAIKU_EFFORT=low", "JARVIS_PLAN_COMPACT=1"]);
    expect(armEnv(ARMS.find((a) => a.id === "medium")!)).toEqual({ JARVIS_HAIKU_EFFORT: "medium", JARVIS_PLAN_COMPACT: "0" });
  });
});

describe("Step 4: the Groq file it pairs against, and the ledger first", () => {
  it("this build's final Groq live-60 file when it exists, else v4's, and says which", () => {
    const has = (names: string[]) => (f: string) => names.some((n) => f.endsWith(n));
    expect(liveBaseline("R", has(["v5final-groq-planner-live60.json", "v4final-groq-planner-live60.json"]))).toMatchObject({ which: "v5final" });
    expect(liveBaseline("R", has(["v4final-groq-planner-live60.json"]))).toMatchObject({ which: "v4final" });
    expect(liveBaseline("R", has([]))).toBeNull();
  });
  it("the run starts only when the ledger's Claude day holds it", () => {
    expect(ledgerCheck({ ok: true, left: { rpd: 400, tpd: 1_000_000 } }, 60).ok).toBe(true);
    expect(ledgerCheck({ ok: true, left: { rpd: 100, tpd: 1_000_000 } }, 60).ok).toBe(false);
    expect(ledgerCheck({ ok: true, left: { rpd: 400, tpd: 100_000 } }, 60).ok).toBe(false);
    expect(ledgerCheck({ ok: false, left: { rpd: 400, tpd: 1_000_000 } }, 60).ok).toBe(false);
  });
});

describe("the eval-only ladder pin (JARVIS_LADDER_PIN=anthropic): Step 4 is answered by Haiku or by nobody", () => {
  afterEach(() => vi.unstubAllEnvs());
  const l = () => new Ledger(new MemoryStore());
  it("pinned: the Claude rung alone; no key: no rung at all", () => {
    vi.stubEnv("JARVIS_CLAUDE_MODEL", "");
    vi.stubEnv("JARVIS_LADDER_PIN", "anthropic");
    expect(ladder(2000, l(), false, true)).toEqual([{ provider: "anthropic", model: "claude-haiku-5-5" }]);
    vi.stubEnv("JARVIS_PLANNER_LEAD", "groq");
    expect(ladder(2000, l(), false, true)).toEqual([{ provider: "anthropic", model: "claude-haiku-5-5" }]);
    expect(ladder(2000, l(), false, false)).toEqual([]);
  });
  it("unset (the app): the ladder is what it was", () => {
    vi.stubEnv("JARVIS_LADDER_PIN", "");
    vi.stubEnv("JARVIS_PLANNER_LEAD", "");
    expect(ladder(2000, l(), false, true).map((r) => r.provider)).toEqual(["anthropic", "groq", "groq", "groq", "gemini"]);
  });
});
