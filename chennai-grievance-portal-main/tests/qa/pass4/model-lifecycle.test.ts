// QA pass 4: MODEL-BASED test of the case lifecycle over HTTP (server on port 3142: node tests/qa/pass4/server.mjs start --port 3142 --frozen --ticking --instance conc).
// fast-check commands: random sequences of officer approve, Collector resolve / reopen, and reads, against a small model. After every step the
// invariants are checked; a failing sequence is shrunk. No model (AI) is called.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
// @ts-expect-error plain .mjs helper
import { Http } from "./same-number.mjs";

const PORT = Number(process.env.QA_MODEL_PORT || 3142);
const h = new Http(PORT);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** a 429 is the route's own rate limit: wait and try again, it is not a result */
async function call(who: string, method: "get" | "post", url: string, body?: unknown, headers?: Record<string, string>) {
  for (let i = 0; i < 8; i++) {
    const r = method === "get" ? await h.get(who, url, headers) : await h.post(who, url, body, headers);
    if (r.status !== 429) return r;
    await sleep(2500);
  }
  throw new Error("still rate limited: " + url);
}
async function decide(id: string, decision: string) {
  const body = { incidentIds: [id], decision };
  let r = await call("collector", "post", "/api/collector/decisions", body);
  if (r.status === 428) {
    const g = await h.grant("collector", r.json.confirm.scope, "decide");
    r = await call("collector", "post", "/api/collector/decisions", body, { "x-diq-grant": g });
  }
  return r;
}

type Model = { open: Map<string, boolean>; approved: Set<string>; base: number };
type Real = { ids: string[]; officerIds: string[] };

class Resolve implements fc.AsyncCommand<Model, Real> {
  constructor(readonly i: number) {}
  check() { return true; }
  async run(m: Model, r: Real) {
    const id = r.ids[this.i % r.ids.length];
    const res = await decide(id, "resolve");
    expect(res.status, `resolve ${id}: ${res.text.slice(0, 120)}`).toBeLessThan(300);
    m.open.set(id, false);
    const d = await call("collector", "get", `/api/collector/incidents/${id}`);
    expect(String(d.json?.status ?? d.json?.incident?.status), `status after resolve ${id}`).toBe("Resolved");
  }
  toString() { return `resolve(${this.i})`; }
}
class Reopen implements fc.AsyncCommand<Model, Real> {
  constructor(readonly i: number) {}
  check() { return true; }
  async run(m: Model, r: Real) {
    const id = r.ids[this.i % r.ids.length];
    const res = await decide(id, "reopen");
    expect(res.status, `reopen ${id}: ${res.text.slice(0, 120)}`).toBeLessThan(300);
    m.open.set(id, true);
    const d = await call("collector", "get", `/api/collector/incidents/${id}`);
    expect(String(d.json?.status ?? d.json?.incident?.status), `status after reopen ${id}`).toBe("Open");
  }
  toString() { return `reopen(${this.i})`; }
}
class Approve implements fc.AsyncCommand<Model, Real> {
  constructor(readonly i: number) {}
  check() { return true; }
  async run(m: Model, r: Real) {
    const id = r.officerIds[this.i % r.officerIds.length];
    const res = await call("officerA", "post", `/api/officer/grievances/${id}`, { step: "approve" });
    if (m.approved.has(id)) expect(res.status, `second approval of ${id} must be refused`).toBe(409);
    else expect([201, 409], `first approval of ${id}: ${res.text.slice(0, 120)}`).toContain(res.status);
    m.approved.add(id);
  }
  toString() { return `approve(${this.i})`; }
}
class CheckCount implements fc.AsyncCommand<Model, Real> {
  check() { return true; }
  async run(m: Model) {
    // the district's open count moves by exactly the number of model-closed incidents (all picked incidents were open, unrouted, in the weekly window)
    const o = await call("collector", "get", "/api/collector/overview?period=weekly");
    const closed = [...m.open.values()].filter((v) => !v).length;
    expect(o.json?.kpi?.cur?.ongoing, "ongoing = base - closed").toBe(m.base - closed);
  }
  toString() { return "checkCount"; }
}

describe("case lifecycle against a model (server on port 3142)", () => {
  it("random sequences of approve, resolve, reopen keep the figures and statuses consistent", async () => {
    const l = await call("collector", "get", "/api/collector/list?period=weekly&sev=Low&status=open");
    const ids: string[] = (l.json?.rows ?? []).filter((x: { open: number; dept: string }) => x.open).slice(0, 4).map((x: { id: string }) => x.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    const g = await call("officerA", "get", "/api/officer/grievances?tab=new&period=quarterly&per=40");
    const officerIds: string[] = (g.json?.rows ?? g.json?.items ?? []).map((x: { id: string }) => x.id).slice(0, 3);
    expect(officerIds.length).toBeGreaterThan(0);
    const ov = await call("collector", "get", "/api/collector/overview?period=weekly");
    const base0 = ov.json.kpi.cur.ongoing as number;
    const cmds = fc.commands([fc.nat(3).map((i) => new Resolve(i)), fc.nat(3).map((i) => new Reopen(i)), fc.nat(2).map((i) => new Approve(i)), fc.constant(new CheckCount())], { maxCommands: 10 });
    await fc.assert(
      fc.asyncProperty(cmds, async (c) => {
        // each run starts from the state the previous one left: reopen everything, then take the real base
        for (const id of ids) await decide(id, "reopen");
        const base = (await call("collector", "get", "/api/collector/overview?period=weekly")).json.kpi.cur.ongoing as number;
        const model: Model = { open: new Map(ids.map((id) => [id, true])), approved: new Set(), base };
        // officer approvals persist across runs, so a case approved earlier is already approved
        for (const id of officerIds) { const d = await call("officerA", "get", `/api/officer/grievances/${id}`); if (d.json && !/new/i.test(String(d.json.stage ?? "new"))) model.approved.add(id); }
        await fc.asyncModelRun(() => ({ model, real: { ids, officerIds } }), c);
      }),
      { numRuns: 6, endOnFailure: true }
    );
    expect(base0).toBeGreaterThan(0);
  }, 900_000);
});

describe("TIMECONC-1 reopen after resolve inside two minutes", () => {
  // Reopen, resolve, reopen on one incident: the second reopen answers 201 but the incident stays Resolved (the double-click dedupe in
  // src/app/api/collector/decisions/route.ts ignores the resolve that came in between).
  it.fails("TIMECONC-1: a reopen after a resolve takes effect", async () => {
    const l = await call("collector", "get", "/api/collector/list?period=weekly&sev=Low&status=open");
    const id: string = (l.json?.rows ?? []).filter((x: { open: number }) => x.open)[8]?.id;
    for (const d of ["reopen", "resolve", "reopen"]) await decide(id, d);
    const r = await call("collector", "get", `/api/collector/incidents/${id}`);
    expect(r.json?.incident?.status).toBe("Open");
  }, 120_000);
});
