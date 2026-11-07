// QA pass 4, hunt-console: reproductions on a live test server (node tests/qa/pass4/server.mjs start --port 3174 --frozen --ticking --instance console).
// Run: npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/hunt-console.test.ts
import { describe, it, expect } from "vitest";
import { login } from "./lib/access-lib.mjs";

const base = "http://127.0.0.1:3174";
const up = await fetch(`${base}/login`).then((r) => r.status < 500).catch(() => false);
const jfetch = async (cookie: string, method: string, p: string, body?: unknown) => {
  const r = await fetch(base + p, { method, headers: { cookie, origin: base, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
};

describe.skipIf(!up)("collector console and officer portal", () => {
  it.fails("hunt-console-1: a workspace saved as 'alpha' is separate from 'Alpha', and deleting one does not delete the other", async () => {
    const { cookie } = await login(base, "collector");
    const w = (name: string) => ({ name, filters: { period: "daily" }, layout: {} });
    try {
      await jfetch(cookie, "POST", "/api/collector/workspaces", w("Alpha"));
      await jfetch(cookie, "POST", "/api/collector/workspaces", w("alpha"));
      const del = await jfetch(cookie, "DELETE", "/api/collector/workspaces?name=ALPHA");
      // ALPHA was never saved: it must be "not found", and both saved workspaces must still be there
      expect(del.status).toBe(404);
      const list = await jfetch(cookie, "GET", "/api/collector/workspaces");
      expect(list.json.workspaces.length).toBe(2);
    } finally {
      for (const n of ["Alpha", "alpha", "ALPHA"]) await jfetch(cookie, "DELETE", `/api/collector/workspaces?name=${n}`);
    }
  });

  it.fails("hunt-console-2: the severity card counts the same open incidents as the Ongoing tile", async () => {
    const { cookie } = await login(base, "collector");
    const d = (await jfetch(cookie, "GET", "/api/collector/overview")).json;
    const card = Object.values(d.severity.counts as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(card).toBe(d.kpi.cur.ongoing); // card 226, tile 236 in the pinned build
  });

  it.fails("hunt-console-3: a zone that does not exist is refused, not shown as the whole city", async () => {
    const { cookie } = await login(base, "collector");
    const r = await jfetch(cookie, "GET", "/api/collector/overview?zone=99");
    expect(r.status).toBe(400);
  });

  it.fails("hunt-console-4: an officer grievance tab that does not exist is refused, not shown as the New tab", async () => {
    const { cookie } = await login(base, "officerA");
    const r = await jfetch(cookie, "GET", "/api/officer/grievances?tab=returned");
    expect(r.status).toBe(400);
  });
});
