// QA pass 6, hunter pass4-open: pass 4's RC-35 (PB-157, PB-179), re-checked on this tree. A Collector decision made through the real decisions route must reach
// every cached reader at once: Ask District IQ's tool (tools.ts, 60 s), Jarvis's tool cache (round.ts, 30 s), Ask District IQ's answer card, the console's overview.
// Real store on the pinned snapshot (this process's own durable file), real route with the session stubbed and step-up off (NODE_ENV=test), frozen clock, no model key.
//   QA_PIN_PORT=3197 timeout 600 npx vitest run --config vitest.qa4.config.ts --dir tests/qa/pass6/probes/pass4-open p6-cache
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  // only under vitest.qa4.config.ts (dry-run store reading the pinned snapshot on 127.0.0.1): this file writes a decision into the process's own durable file
  if (!(process.env.QA_GROQ_ONLY === "1" && process.env.AWS_STORE_DRY_RUN === "1" && /^http:\/\/127\.0\.0\.1:/.test(process.env.AWS_API_URL ?? ""))) throw new Error("pass4-open probe: run with vitest.qa4.config.ts only");
  process.env.STEP_UP = "off";
  (process.env as Record<string, string>).NODE_ENV = "test";
  return { who: {} as Record<string, unknown> };
});
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()),
  getActivePortalSession: async (p: string) => h.who[p] ?? null,
  getSessionFromCookies: async () => null,
  getActiveSession: async () => null }));

const COLLECTOR = { userId: 1000000001, email: "qa.collector@example.test", role: "collector", tv: 0 };
const FROZEN = "2026-11-06T06:30:00.000Z";
const EVID = path.resolve(process.cwd(), "..", "docs", "qa", "pass6", "evidence", "pass4-open");
const seen: Record<string, unknown> = {};

let intel: typeof import("@/lib/collector/intel");
let tools: typeof import("@/lib/assistant/tools");
let round: typeof import("@/lib/thunai/round");
let data: typeof import("@/lib/thunai/data");
let pipeline: typeof import("@/lib/assistant/pipeline");
let decisionsRoute: typeof import("@/app/api/collector/decisions/route");

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(FROZEN));
  await import("@/lib/collector/derive");
  // as decision-matrix.test.ts does: lance.ts takes its folder from the working folder when it first loads; load it in a scratch folder so nothing can write an index into data/lancedb
  const LANCE_ROOT = path.resolve(process.env.THUNAI_DIR!, "..", "lance-root");
  fs.mkdirSync(path.join(LANCE_ROOT, "data", "embeddings"), { recursive: true });
  await import("@/lib/collector/db");
  const cwd = process.cwd.bind(process);
  process.cwd = () => LANCE_ROOT;
  try { await import("@/lib/assistant/lance"); } finally { process.cwd = cwd; }
  intel = await import("@/lib/collector/intel");
  tools = await import("@/lib/assistant/tools");
  round = await import("@/lib/thunai/round");
  data = await import("@/lib/thunai/data");
  pipeline = await import("@/lib/assistant/pipeline");
  decisionsRoute = await import("@/app/api/collector/decisions/route");
  await intel.asOf();
}, 300_000);
afterAll(() => { vi.useRealTimers(); fs.mkdirSync(EVID, { recursive: true }); fs.writeFileSync(path.join(EVID, "p6-cache.json"), JSON.stringify(seen, null, 1)); });

const W = "weekly";
const askCard = async (message: string) => (await pipeline.ask({ user: "qa.p6.cache@example.test", sessionId: null, message, inputMode: "text", language: "en",
  scope: { period: W, zone: null, dept: null, cat: null, taluk: null } as never, replyTo: null, pinId: null, insightKey: null, lockDept: null, stage: () => undefined } as never)).card;
const firstNumber = (s: string) => { const m = /(\d[\d,]*)/.exec(s); return m ? Number(m[1].replace(/,/g, "")) : NaN; };
const decide = async (ids: string[], decision: string) => {
  h.who = { collector: COLLECTOR };
  const r = await decisionsRoute.POST(new NextRequest("http://127.0.0.1/api/collector/decisions", { method: "POST", body: JSON.stringify({ incidentIds: ids, decision, note: null }), headers: { "content-type": "application/json" } }));
  return r.status;
};

describe("RC-35: a decision reaches every cached reader at once (no time passes between the write and the read)", () => {
  it("open count: assistant tool, Jarvis tool cache, Ask District IQ card and console overview all move by the number of cases resolved", async () => {
    const hands = round.safeHands(data.serverHands({ email: "qa.p6@example.test", id: 900_002 } as never));
    const kpiTool = async () => Number(((await tools.runTool("overview_kpis", { scope: { period: W } })).data as any).cur.ongoing);
    const kpiJarvis = async () => { const r: any = await hands.tool("overview_kpis", { scope: { period: W } } as never); return Number((r?.data ?? r).cur.ongoing); };
    const kpiConsole = async () => Number((await intel.overview(W as never, null)).kpi.cur.ongoing);
    const q = "how many incidents are still open this week?";
    // warm every cache first, as a Collector's console does
    const before = { tool: await kpiTool(), jarvis: await kpiJarvis(), console: await kpiConsole(), card: await askCard(q) };
    // pick open incidents of the window from the console's own open list
    const open = (await intel.list({ period: W as never, zone: null, dept: null, sev: null, status: "open", q: "", sort: "t", dir: -1, page: 0, scope: "period" } as never)) as any;
    const ids: string[] = (open.rows ?? []).filter((r: any) => !r.group_size || Number(r.group_size) <= 1).slice(0, 3).map((r: any) => String(r.id));
    expect(ids.length, JSON.stringify(Object.keys(open))).toBe(3);
    const status = await decide(ids, "resolve");
    expect(status).toBe(201);
    const after = { tool: await kpiTool(), jarvis: await kpiJarvis(), console: await kpiConsole(), card: await askCard(q) };
    seen.rc35 = { ids, status, before: { ...before, card: before.card.headline }, after: { ...after, card: after.card.headline } };
    expect({ tool: after.tool, jarvis: after.jarvis, console: after.console }).toEqual({ tool: before.tool - 3, jarvis: before.jarvis - 3, console: before.console - 3 });
    // the card's headline figure moved with them (the card is cached too)
    const b = firstNumber(before.card.headline), a = firstNumber(after.card.headline);
    seen.rc35_card = { b, a };
    if (!Number.isNaN(b)) expect(a, `${before.card.headline} -> ${after.card.headline}`).not.toBe(b);
  });
});
