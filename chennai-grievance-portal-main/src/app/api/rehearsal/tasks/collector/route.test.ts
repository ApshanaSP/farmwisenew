/**
 * The Collector's rain action tracker route: what it accepts (tab, rain, department, note, due date, places), that it checks the
 * places against the server's own data before asking for the password, that the password box sees exactly what is written, and
 * that verify and send-back go to the stage machine (lib/rehearsal/tasks.ts stepFix).
 */
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  signedIn: true,
  prepared: null as null | { rain: unknown; ok: unknown[]; skipped: unknown[] },
  prepareArgs: [] as unknown[],
  assigned: [] as unknown[],
  steps: [] as unknown[],
  confirms: [] as { act: string; summary: string; scope: unknown }[],
  refuse: false
}));
vi.mock("@/lib/collector/guard", () => ({
  collectorSession: async () => (H.signedIn ? { email: "collector@example.test", role: "collector", userId: 1 } : (await import("next/server")).NextResponse.json({ error: "Not authenticated" }, { status: 401 })),
  failed: (_e: unknown, what: string) => Response.json({ error: `Could not load ${what}.` }, { status: 500 })
}));
vi.mock("@/lib/security/stepup", () => ({
  requireConfirm: async (_req: unknown, _s: unknown, act: string, summary: string, scope: unknown) => {
    H.confirms.push({ act, summary, scope });
    return H.refuse ? { ok: false, res: Response.json({ error: "Confirm it's you first." }, { status: 428 }) } : { ok: true, grant: null };
  }
}));
vi.mock("@/lib/rehearsal/engine", () => ({ RehearsalUnavailable: class extends Error { status = 503; } }));
vi.mock("@/lib/rehearsal/trackview", () => ({
  trackerState: async () => ({ asOf: "2026-11-28 10:00:00", share: 0.7, nearM: 100, depts: [], fixes: [] }),
  prepareAssign: async (...a: unknown[]) => { H.prepareArgs = a; return H.prepared; }
}));
vi.mock("@/lib/rehearsal/tasks", () => ({
  assignFixes: async (...a: unknown[]) => { H.assigned.push(a); return (a[4] as { place: string }[]).map((x, k) => ({ id: 100 + k, place: x.place })); },
  fixById: async (id: number) => (id === 7 ? { head: { p: "Velachery Main Road" }, place: "n5|w173", lens: "flood", status: "done", trail: [], stage: "done" } : null),
  stepFix: async (...a: unknown[]) => { H.steps.push(a); return { status: 200, body: { ok: true, stage: a[1] === "verify" ? "verified" : "in_action" } }; }
}));

const { GET, POST } = await import("./route");
const day = (n = 0) => new Date(Date.now() + 330 * 60_000 + n * 86_400_000).toISOString().slice(0, 10);
const post = (body: unknown) => POST(new NextRequest("http://localhost/api/rehearsal/tasks/collector", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
const item = (place = "n5|w173", dept = "GCC-SWD", note = "Clear and desilt the drains along it") => ({ place, dept, note });
const assign = (o: Record<string, unknown> = {}) => ({ action: "assign", lens: "flood", rain: "rain-2026-11-18", due: day(7), items: [item()], ...o });
const server = { place: "n5|w173", dept: "GCC-SWD", note: "Clear and desilt the drains along it", label: "Velachery Main Road", lat: 12.98, lon: 80.22, ward: 173 };

beforeEach(() => {
  H.signedIn = true; H.refuse = false; H.assigned = []; H.steps = []; H.confirms = []; H.prepareArgs = [];
  H.prepared = { rain: { id: "rain-2026-11-18" }, ok: [server], skipped: [] };
});

describe("the tracker route", () => {
  it("is for the signed-in Collector only", async () => {
    H.signedIn = false;
    expect((await GET()).status).toBe(401);
    expect((await post(assign())).status).toBe(401);
    H.signedIn = true;
    const r = await GET();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ share: 0.7, fixes: [] });
  });

  it("refuses an assignment that is not well formed, before reading any data", async () => {
    const bad = [
      assign({ lens: "boats" }), assign({ rain: "18 Nov" }), assign({ due: "05/12/2026" }), assign({ items: [] }),
      assign({ items: [item("n5|w173", "NOT-A-DEPT")] }), assign({ items: [item("n5|w173", "GCC-SWD", "short")] }), assign({ items: [item("bad} key")] }),
      assign({ items: Array.from({ length: 301 }, (_, k) => item(`e${k}`)) }), { action: "fly" }, null
    ];
    for (const b of bad) expect((await post(b)).status).toBe(400);
    expect(H.prepareArgs).toEqual([]);
    expect(H.confirms).toEqual([]);
  });

  it("refuses a due date in the past or more than 120 days ahead", async () => {
    expect((await post(assign({ due: day(-1) }))).status).toBe(400);
    expect((await post(assign({ due: day(121) }))).status).toBe(400);
    expect((await post(assign({ due: day(0) }))).status).toBe(201);
  });

  it("checks the places against the server's data: no such rain is 404, nothing left to assign is 409 with the reasons", async () => {
    H.prepared = { rain: null, ok: [], skipped: [{ place: "n5|w173", why: "not-hit" }] };
    expect((await post(assign())).status).toBe(404);
    H.prepared = { rain: { id: "rain-2026-11-18" }, ok: [], skipped: [{ place: "n5|w173", why: "unfinished" }] };
    const r = await post(assign());
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.error).toMatch(/already has an action in progress/);
    expect(j.skipped[0]).toMatchObject({ why: "unfinished", words: "already has an action in progress" });
    expect(H.confirms).toEqual([]);
    expect(H.assigned).toEqual([]);
  });

  it("asks for the password on exactly what it writes, then writes the server's places", async () => {
    H.prepared = { rain: { id: "rain-2026-11-18" }, ok: [server, { ...server, place: "e9", dept: "PWD-WRD", label: "A lane off 2nd Street" }], skipped: [{ place: "e10", why: "not-hit" }] };
    const r = await post(assign({ items: [item(), item("e9", "PWD-WRD"), item("e10")] }));
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ created: 2, ids: [100, 101], depts: 2, skipped: [{ place: "e10", why: "not-hit", words: "not hit in this rain" }] });
    expect(H.prepareArgs[0]).toBe("flood");
    expect(H.prepareArgs[1]).toBe("rain-2026-11-18");
    expect(H.confirms).toHaveLength(1);
    expect(H.confirms[0].act).toBe("decide");
    expect(H.confirms[0].summary).toBe(`Assign 2 streets to 2 departments, due ${day(7)}`);
    expect((H.confirms[0].scope as { items: { place: string }[] }).items.map((x) => x.place)).toEqual(["e9", "n5|w173"]);
    const [rain, lens, due, user, items] = H.assigned[0] as [string, string, string, string, typeof server[]];
    expect([rain, lens, due, user]).toEqual(["rain-2026-11-18", "flood", day(7), "collector@example.test"]);
    // the name and point come from the server's data, never the browser's
    expect(items[0]).toEqual(server);
  });

  it("writes nothing when the password is not confirmed", async () => {
    H.refuse = true;
    expect((await post(assign())).status).toBe(428);
    expect(H.assigned).toEqual([]);
    expect((await post({ action: "verify", id: 7 })).status).toBe(428);
    expect(H.steps).toEqual([]);
  });

  it("verify and send back: a known fix, a note to send back, and the stage machine decides", async () => {
    expect((await post({ action: "verify", id: "7" })).status).toBe(400);
    expect((await post({ action: "verify", id: 8 })).status).toBe(404);
    const v = await post({ action: "verify", id: 7 });
    expect(v.status).toBe(200);
    expect(H.confirms.at(-1)).toMatchObject({ act: "decide", summary: "Verify the fix at Velachery Main Road" });
    expect(H.steps.at(-1)).toEqual([7, "verify", { role: "collector", user: "collector@example.test" }, expect.objectContaining({ remarks: null })]);
    expect((await post({ action: "reopen", id: 7 })).status).toBe(400);
    expect((await post({ action: "reopen", id: 7, note: "no" })).status).toBe(400);
    const b = await post({ action: "reopen", id: 7, note: "The outfall is still blocked" });
    expect(b.status).toBe(200);
    expect(H.steps.at(-1)).toEqual([7, "reopen", { role: "collector", user: "collector@example.test" }, expect.objectContaining({ remarks: "The outfall is still blocked" })]);
  });
});

void NextResponse;
