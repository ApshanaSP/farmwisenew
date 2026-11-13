import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// hunt2-ops-04: an unknown severity, status, scope, place or flag was silently dropped: ?sev=severe or ?status=Overdue answered the whole
// list as if filtered. The routes read them with their own inline tests; refuseBadFilter checked only zone, period, dept, cat and taluk.
const h = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }));
vi.mock("@/lib/collector/guard", () => ({ collectorSession: async () => ({ email: "c@x", userId: 1, role: "collector" }), failed: () => new Response(null, { status: 500 }) }));
vi.mock("@/lib/collector/intel", async (orig) => ({
  ...(await orig<typeof import("@/lib/collector/intel")>()),
  list: async (f: Record<string, unknown>) => (h.calls.push(f), { rows: [], total: 0 })
}));
vi.mock("@/lib/officer/guard", async (orig) => ({
  ...(await orig<typeof import("@/lib/officer/guard")>()),
  officerSession: async () => ({ session: { email: "o@x", userId: 2, role: "department_officer" }, dept: { code: "GCC-SWM" } }),
  fresh: (d: unknown, status = 200) => NextResponse.json(d, { status })
}));
vi.mock("@/lib/officer/data", () => ({ grievanceList: async (_d: unknown, f: Record<string, unknown>) => (h.calls.push(f), { rows: [], total: 0 }) }));

const { GET: collectorList } = await import("@/app/api/collector/list/route");
const { GET: officerList } = await import("@/app/api/officer/grievances/route");
const { filterProblem } = await import("./filters");

const col = (qs: string) => collectorList(new NextRequest(`http://localhost/api/collector/list?period=weekly&${qs}`));
const off = (qs: string) => officerList(new NextRequest(`http://localhost/api/officer/grievances?tab=all&period=weekly&${qs}`));

describe("hunt2-ops-04: every list refuses a filter value it cannot apply, the same way", () => {
  beforeEach(() => { h.calls.length = 0; });

  it("the Collector's list: an unknown severity, status, scope or place is a 400 that names it, and the store is not read", async () => {
    for (const bad of ["sev=severe", "status=Overdue", "status=done", "scope=al", "place=bogus", "sev=__proto__"]) {
      const r = await col(bad);
      expect(r.status, bad).toBe(400);
      expect(String((await r.json()).error), bad).toMatch(/is not one of/);
    }
    expect(h.calls).toEqual([]);
  });

  it("the officer's list: an unknown flag or severity is a 400, not the whole list", async () => {
    for (const bad of ["flag=Overdue", "flag=late", "sev=low", "sev=SEVERE"]) {
      const r = await off(bad);
      expect(r.status, bad).toBe(400);
      expect(String((await r.json()).error), bad).toMatch(/is not one of/);
    }
    expect(h.calls).toEqual([]);
  });

  it("a known value is applied, an absent or empty one is no filter, and a padded one is the value it names", async () => {
    expect((await col("sev=Severe&status=overdue&scope=30d&place=nozone")).status).toBe(200);
    expect(h.calls.at(-1)).toMatchObject({ sev: "Severe", status: "overdue", scope: "30d", place: "nozone" });
    expect((await col("sev=&status=&scope=")).status).toBe(200);
    expect(h.calls.at(-1)).toMatchObject({ sev: null, status: null, scope: "period", place: null });
    expect((await col("sev=High%20&status=%20Resolved")).status).toBe(200);
    expect(h.calls.at(-1)).toMatchObject({ sev: "High", status: "Resolved" });
    expect((await off("flag=due&sev=Low")).status).toBe(200);
    expect(h.calls.at(-1)).toMatchObject({ flag: "due", sev: "Low" });
    expect((await off("flag=")).status).toBe(200);
    expect(h.calls.at(-1)).toMatchObject({ flag: null, sev: null });
  });

  it("the check and the readers agree for every value the consoles send", () => {
    const ok = ["sev=Severe", "sev=Medium", "status=open", "status=awaiting", "status=critical", "status=Resolved", "status=Under review",
      "scope=period", "scope=all", "place=unlocated", "place=notaluk", "flag=open", "flag=serious", "flag=overdue"];
    for (const q of ok) expect(filterProblem(new URLSearchParams(q)), q).toBeNull();
  });
});

describe("hunt2-ops-04: the Collector's list sends the severity the server reads, whatever language the page is shown in", () => {
  it("each severity option carries its value, so the Tamil page's translated text is never sent as ?sev= (now refused)", async () => {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    (globalThis as { React?: unknown }).React = React;
    const { ListBody } = await import("@/components/collector/app/Overlays");
    const c = { dept: null, depts: [], period: "weekly", periodLabel: "Last 7 days", zone: null, reloadKey: 0 };
    const html = renderToStaticMarkup(React.createElement(ListBody, { preset: {}, c: c as never }));
    const sev = html.match(/<select[^>]*aria-label="Severity"[^>]*>([\s\S]*?)<\/select>/)?.[1] ?? "";
    expect([...sev.matchAll(/<option([^>]*)>([^<]*)<\/option>/g)].map((m) => [m[1].match(/value="([^"]*)"/)?.[1] ?? null, m[2]]))
      .toEqual([["", "All severities"], ["Severe", "Severe"], ["High", "High"], ["Medium", "Medium"], ["Low", "Low"]]);
  });
});
