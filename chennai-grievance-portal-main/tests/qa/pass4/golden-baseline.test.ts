import { execFileSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ModelNotReady } from "@/lib/assistant/embed";
import { hybridSearch } from "@/lib/assistant/lance";
import { APP_ROOT } from "./lib/env.mjs";
import { accounts } from "../seed-local-users.mjs";

/**
 * QA pass 4: what the golden-master baseline found (docs/qa/pass4/findings/golden-baseline.json). it.fails(...) is a finding that is still open, named by its id:
 * the fixer changes it to it(...). it(...) beside it shows the same route working, so a failure here is about that one case.
 *   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/golden-baseline.test.ts
 * It starts its own production server (--frozen, no model keys), on port 3119 or QA_GOLDEN_TEST_PORT.
 */
const PORT = Number(process.env.QA_GOLDEN_TEST_PORT || 3119);
const BASE = `http://127.0.0.1:${PORT}`;
const SERVER = path.join(APP_ROOT, "tests", "qa", "pass4", "server.mjs");
const launcher = (...args: string[]) => execFileSync(process.execPath, [SERVER, ...args, "--port", String(PORT)], { cwd: APP_ROOT, encoding: "utf8" });

let cookie = "";
const get = (url: string) => fetch(BASE + url, { headers: { cookie } });

// a search index exists, and what the model does is set by each test
const model = vi.hoisted(() => ({ embed: (): never => { throw new Error("not set"); } }));
vi.mock("@lancedb/lancedb", () => ({ connect: async () => ({ tableNames: async () => ["incidents"], openTable: async () => ({}) }) }));
vi.mock("@/lib/assistant/embed", async (real) => ({ ...(await real<typeof import("@/lib/assistant/embed")>()), embed: async () => model.embed() }));

describe("golden-master baseline findings, on a real server", () => {
  beforeAll(async () => {
    launcher("stop");
    launcher("start", "--frozen");
    const collector = accounts().find((a: { key: string }) => a.key === "collector");
    const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: collector.email, password: collector.password }) });
    expect(r.status).toBe(200);
    cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  }, 300_000);
  afterAll(() => { launcher("stop"); });

  it("the console's search box answers an English word", async () => {
    expect((await get("/api/collector/search?q=garbage")).status).toBe(200);
  });
  it("the console's search box answers a Tamil word whose split leaves a piece", async () => {
    expect((await get(`/api/collector/search?q=${encodeURIComponent("மழை")}`)).status).toBe(200);
  });
  // these leave no piece at all: every one answers 500
  it.fails.each(["குப்பை", "சாலை", "புகார்", "குடிநீர்", "தீ", "நோய்", "கொசு", "பேருந்து"])("GB-1: the console's search box answers the Tamil word %s", async (word) => {
    expect((await get(`/api/collector/search?q=${encodeURIComponent(word)}`)).status).toBe(200);
  });

  it("a rain that is in the record replays", async () => {
    const rains = (await (await get("/api/rehearsal/rains")).json()) as { rains: { id: string }[] };
    expect((await get(`/api/rehearsal/state?replay=${rains.rains[0].id}`)).status).toBe(200);
  });
  it.fails("GB-2: a rain that is not in the record is 'not found', not 'service unavailable'", async () => {
    expect((await get("/api/rehearsal/state?replay=rain-1999-01-01")).status).toBe(404);
  });

  it.fails("GB-3: a workspace saved on this server can be opened by the id the save gave it", async () => {
    const saved = await fetch(`${BASE}/api/collector/workspaces`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ name: "GB-3 test", filters: { period: "weekly" }, layout: { panels: {} } }) });
    expect(saved.status).toBeLessThan(300);
    const list = (await (await get("/api/collector/workspaces")).json()) as { workspaces: { name: string; versions: { id: number }[] }[] };
    const id = list.workspaces.find((w) => w.name === "GB-3 test")!.versions[0].id;
    expect((await get(`/api/collector/workspaces/${id}`)).status).toBe(200);
  });
});

describe("the search index when the model is not there", () => {
  it("while the model is loading, search falls back to keywords (null)", async () => {
    model.embed = () => { throw new ModelNotReady(); };
    await expect(hybridSearch("incidents", "flooding")).resolves.toBeNull();
  });
  it("GB-4: when the model cannot load at all, search also falls back to keywords (null), and does not throw", async () => {
    model.embed = () => { throw new Error("the model file is damaged"); };
    await expect(hybridSearch("incidents", "flooding")).resolves.toBeNull();
  });
});
