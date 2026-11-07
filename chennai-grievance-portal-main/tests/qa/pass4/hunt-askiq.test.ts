import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureServer } from "./lib/own-server";
import { accounts } from "../seed-local-users.mjs";

/**
 * QA pass 4, hunter askiq: Ask District IQ. Uses the server on ASKIQ_BASE (port 3173), or starts its own there and stops it (node tests/qa/pass4/server.mjs start --port 3173 --frozen --ticking --instance askiq)
 *   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/hunt-askiq.test.ts
 * Chat is rate limited per minute, so the chat questions are asked one at a time with a wait if a 429 comes back.
 */
const BASE = process.env.ASKIQ_BASE || "http://127.0.0.1:3173";
let cookie = "";
let stopServer = () => {};
afterAll(() => stopServer());
beforeAll(async () => {
  stopServer = await ensureServer(Number(new URL(BASE).port), "askiq"); // no server on the port: this file starts its own
  const a = (accounts() as { key: string; email: string; password: string }[]).find((x) => x.key === "collector")!;
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: a.email, password: a.password }) });
  cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
});
async function chat(message: string): Promise<{ headline: string; md: string; scopeLine: string }> {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`${BASE}/api/collector/assistant/chat`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ message }) });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 61000)); continue; }
    const t = await r.text();
    const m = t.match(/event: answer\ndata: (.*)/);
    const a = m ? JSON.parse(m[1]) : {};
    return { headline: a.headline ?? "", md: a.answerMarkdown ?? "", scopeLine: a.scopeLine ?? "" };
  }
  throw new Error("rate limited");
}
const TIMEOUT = 180000;
describe("hunt-askiq", () => {
  it.fails("askiq-1 a zone that does not exist is not answered with the whole district", async () => {
    const a = await chat("zone 99 complaints");
    expect(a.md + a.scopeLine).not.toMatch(/15,115 incidents/);
  }, TIMEOUT);
  it.fails("askiq-1b a place that does not exist is not answered with the whole district", async () => {
    const a = await chat("complaints in Atlantis");
    expect(a.md + a.scopeLine).not.toMatch(/15,115 incidents/);
  }, TIMEOUT);
  it.fails("askiq-2 a date in 2030 is not silently answered as the last 90 days", async () => {
    const a = await chat("complaints from 2030");
    expect(a.md + a.headline).not.toMatch(/last 90 days/);
  }, TIMEOUT);
  it.fails("askiq-2b 'last 0 days' is not silently answered as 90 days", async () => {
    const a = await chat("how many complaints in Adyar in the last 0 days");
    expect(a.headline).not.toMatch(/last 90 days/);
  }, TIMEOUT);
  it.fails("askiq-3 'how many severe' headline is about severe, not 'Low leads'", async () => {
    const a = await chat("how many severe");
    expect(a.headline).not.toMatch(/^Low leads/);
  }, TIMEOUT);
  it.fails("askiq-4 'percentage of resolved complaints' gives a percentage", async () => {
    const a = await chat("percentage of resolved complaints");
    expect(a.md).toMatch(/%/);
  }, TIMEOUT);
  it("askiq-5 a NUL character in the search box does not give a server error", async () => {
    const r = await fetch(`${BASE}/api/collector/search?q=a%00b`, { headers: { cookie } });
    expect(r.status).toBe(200);
  });
});
