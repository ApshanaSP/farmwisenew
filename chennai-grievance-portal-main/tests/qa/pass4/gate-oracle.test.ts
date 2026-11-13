// QA pass 4, final gate (oracles and factory): findings the final run of the oracles made. Real store on the pinned snapshot, real route, no model.
// A test named gate-oracle-N is a bug that is open now: it.fails keeps the suite green and the bug visible. The fixer changes it to it().
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/gate-oracle.test.ts
// Evidence: docs/qa/pass4/evidence/oracles-final.md and same-number.raw-final.json and same-number-final.json (the same figure read over HTTP on the final build).
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  process.env.STEP_UP = "off";
  (process.env as Record<string, string>).NODE_ENV = "test";
  return { who: {} as Record<string, unknown> };
});

vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()),
  resolvePortal: async () => "collector",
  getActivePortalSession: async (p: string) => h.who[p] ?? null,
  getSessionFromCookies: async () => h.who.citizen ?? null,
  getActiveSession: async () => h.who.citizen ?? null }));

const COLLECTOR = { userId: 1000000001, email: "qa.collector@example.test", role: "collector", tv: 0 };
const FROZEN = "2026-11-06T06:30:00.000Z";

let exportRoute: typeof import("@/app/api/collector/assistant/export/route");
let intel: typeof import("@/lib/collector/intel");
let limits: typeof import("@/lib/assistant/limits");

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(FROZEN));
  await import("@/lib/collector/derive");
  intel = await import("@/lib/collector/intel");
  limits = await import("@/lib/assistant/limits");
  exportRoute = await import("@/app/api/collector/assistant/export/route");
  h.who.collector = COLLECTOR;
});
afterAll(() => { vi.useRealTimers(); });

describe("gate-oracle: the assistant's CSV against the figure it came from", () => {
  it("gate-oracle-1 the assistant's CSV is whole, or says it is cut at its row cap (quarterly, whole district: 1,077 rows asked, 1,000 given)", async () => {
    const all = await intel.exportRows("quarterly", null, null);
    // the case only means something when the period holds more rows than the cap: today it does (1,077 against 1,000)
    expect(all.length).toBeGreaterThan(limits.LIMITS.exportRows);
    const res = await exportRoute.GET(new NextRequest("http://127.0.0.1/api/collector/assistant/export?period=quarterly"));
    expect(res.status).toBe(200);
    const text = await res.text();
    const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim()).length - 1; // minus the header
    const said = /cut|truncat|only the first|first 1,?000|of 1,?0\d\d|limit/i.test(text.slice(0, 400)) || [...res.headers.keys()].some((k) => /truncat|total|rows|cap|limit/i.test(k));
    expect(lines === all.length || said).toBe(true);
  });
});
