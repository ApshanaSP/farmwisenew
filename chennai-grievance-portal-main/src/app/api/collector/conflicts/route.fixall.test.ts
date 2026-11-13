import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// pass4-open-06 (pass 4 RC-43 sibling): /api/collector/conflicts was the one route that read ?period= with parsePeriod and no
// refusal, so ?period=weekly2 or ?period=yearly quietly became "daily" and answered for a period nobody asked for.
const h = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("@/lib/collector/guard", () => ({ collectorSession: async () => ({ email: "c@x", userId: 1, role: "collector" }), failed: () => new Response(null, { status: 500 }) }));
vi.mock("@/lib/collector/conflicts", () => ({
  periodConflicts: async (...a: unknown[]) => (h.calls.push(["period", ...a]), { stories: [] }),
  storyConflicts: async (...a: unknown[]) => (h.calls.push(["story", ...a]), [])
}));
vi.mock("@/lib/collector/intel", async (orig) => ({ ...(await orig<typeof import("@/lib/collector/intel")>()), asOf: async () => new Date("2026-11-13T00:00:00Z") }));

import { GET } from "./route";

const get = (qs: string) => GET(new NextRequest(`http://localhost/api/collector/conflicts${qs}`));

describe("pass4-open-06: /api/collector/conflicts refuses a period it does not know", () => {
  beforeEach(() => { h.calls.length = 0; });

  it("answers 400 for an unknown period and never reads the store", async () => {
    for (const bad of ["weekly2", "yearly", "DAILY", "__proto__", "1"]) {
      const r = await get(`?period=${encodeURIComponent(bad)}`);
      expect(r.status, bad).toBe(400);
      expect(String((await r.json()).error)).toMatch(/is not one of/);
    }
    expect(h.calls).toEqual([]);
  });

  it("still answers a known period, and the documented default when none is given", async () => {
    expect((await get("?period=weekly")).status).toBe(200);
    expect(h.calls.at(-1)?.[1]).toBe("weekly");
    expect((await get("")).status).toBe(200);
    expect(h.calls.at(-1)?.[1]).toBe("daily");
    expect((await get("?period=")).status).toBe(200);
    expect(h.calls.at(-1)?.[1]).toBe("daily");
  });

  it("a story lookup by report ids is not a period query and is not refused by it", async () => {
    expect((await get("?ids=DOC-1,DOC-2&title=x")).status).toBe(200);
    expect(h.calls.at(-1)?.[0]).toBe("story");
  });
});

// The pass 4 class guard (tests/qa/pass4/g2-routes.test.ts) looks for parseZone, parseTaluk and parseScope only, so a route that read
// just ?period= slipped past it. This guard covers the period too.
describe("pass4-open-06 class guard: every API route that reads ?period= refuses an unknown one", () => {
  it("each route.ts that calls parsePeriod or reads the period also calls refuseBadFilter", () => {
    const root = path.join(process.cwd(), "src", "app", "api");
    const files: string[] = [];
    (function walk(d: string) { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : e.name === "route.ts" && files.push(path.join(d, e.name)); })(root);
    const reads = files.filter((f) => /\bparsePeriod\(|get\("period"\)/.test(fs.readFileSync(f, "utf8")));
    expect(reads.length).toBeGreaterThan(5);
    const loose = reads.filter((f) => !/refuseBadFilter\(/.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(root, f).split(path.sep).join("/"));
    expect(loose).toEqual([]);
  });
});
