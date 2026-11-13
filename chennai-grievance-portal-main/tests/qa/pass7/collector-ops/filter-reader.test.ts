// QA pass 7, collector-ops: reviewerB-06 (P3). The filter check (filters.ts filterProblem) trimmed a value and the parse* readers (intel.ts)
// did not: ?period=weekly%20 passed the check and was answered as daily, ?dept=GCC-SWM%20 passed and dropped the department filter (the
// whole district). The first case is the pass 6 reviewer's probe (pass4-open-06.probe.fixall.test.ts) on the conflicts route; the rest
// hold the check and every reader to one rule. Unit test (vitest.p7.config.ts).
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("@/lib/collector/guard", () => ({ collectorSession: async () => ({ email: "c@x", userId: 1, role: "collector" }), failed: () => new Response(null, { status: 500 }) }));
vi.mock("@/lib/collector/conflicts", () => ({
  periodConflicts: async (...a: unknown[]) => (h.calls.push(["period", ...a]), { stories: [] }),
  storyConflicts: async (...a: unknown[]) => (h.calls.push(["story", ...a]), [])
}));
vi.mock("@/lib/collector/intel", async (orig) => ({ ...(await orig<typeof import("@/lib/collector/intel")>()), asOf: async () => "2026-11-13 05:30:00" }));

import { GET } from "@/app/api/collector/conflicts/route";
import { filterProblem } from "@/lib/collector/filters";
import { parseCat, parseDept, parsePeriod, parseTaluk, parseZone } from "@/lib/collector/intel";
import { parseScope } from "@/lib/officer/guard";
import { OFFICER } from "@/lib/officer/departments";

const get = (qs: string) => GET(new NextRequest(`http://localhost/api/collector/conflicts${qs}`));

describe("reviewerB-06: a filter value the check accepts is the value the route answers for", () => {
  beforeEach(() => { h.calls.length = 0; });

  it("the pass 6 probe: a period with a stray space is read as that period, never as daily", async () => {
    for (const v of ["weekly ", " weekly", "monthly\t"]) {
      h.calls.length = 0;
      const r = await get(`?period=${encodeURIComponent(v)}`);
      if (r.status === 400) continue;
      expect(r.status).toBe(200);
      expect(h.calls.at(-1)?.[1], JSON.stringify(v)).toBe(v.trim());
    }
  });

  const readers: [string, (v: unknown) => unknown, string[], string[]][] = [
    ["period", (v) => (parsePeriod(v) === "daily" && String(v).trim() !== "daily" ? null : parsePeriod(v)), ["weekly", "monthly", "quarterly", "daily"], ["week", "Weekly", "7d"]],
    ["zone", parseZone, ["1", "4", "15", "09"], ["0", "16", "30", "4.0", "4a", "-1"]],
    ["dept", parseDept, ["GCC-SWM", "PWD-WRD"], ["gcc-swm", "GCC SWM", "X"]],
    ["cat", parseCat, ["SOLID_WASTE", "FLOOD_WATERLOGGING"], ["solid_waste", "AB"]],
    ["taluk", parseTaluk, ["TLK-TDP"], ["TLK-TD", "tlk-tdp"]]
  ];
  for (const [key, read, good, bad] of readers) {
    it(`${key}: with stray spaces or tabs, the check and the reader agree, and the reader reads the trimmed value`, () => {
      for (const base of [...good, ...bad]) for (const v of [base, ` ${base}`, `${base} `, `\t${base}\t`]) {
        const ok = filterProblem(new URLSearchParams({ [key]: v })) == null;
        const got = read(v);
        expect(ok, `${key}=${JSON.stringify(v)}: check ${ok ? "accepts" : "refuses"}, reader ${JSON.stringify(got)}`).toBe(got != null);
        if (ok) expect(got, `${key}=${JSON.stringify(v)}`).toEqual(read(base));
        expect(ok, `${key}=${JSON.stringify(v)}`).toBe(good.includes(base));
      }
      // absent or blank is no filter, for the check and the reader
      for (const v of ["", " ", "\t"]) {
        expect(filterProblem(new URLSearchParams({ [key]: v }))).toBeNull();
        if (key !== "period") expect(read(v)).toBeNull();
      }
    });
  }

  it("?dept=GCC-SWM%20 keeps the department (it used to answer for the whole district)", () => {
    expect(filterProblem(new URLSearchParams("dept=GCC-SWM%20"))).toBeNull();
    expect(parseDept("GCC-SWM ")).toBe("GCC-SWM");
  });

  it("the officer console: a blank period is the console's default, a padded one is that period", () => {
    expect(parseScope(new URLSearchParams("period=%20")).period).toBe(OFFICER.defaultPeriod);
    expect(parseScope(new URLSearchParams("period=weekly%20")).period).toBe("weekly");
  });
});
