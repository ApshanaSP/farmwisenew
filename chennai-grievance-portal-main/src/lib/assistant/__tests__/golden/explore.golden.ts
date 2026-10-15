import { afterAll, beforeAll, it, vi } from "vitest";
import { forward, haveStore, loadFrozen } from "./harness";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("./harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("./harness")).forward }));
vi.mock("@/lib/ai/gateway", async (orig) => {
  const m = await orig<typeof import("@/lib/ai/gateway")>();
  return { ...m, aiStatus: () => ({ available: false, problem: null, providers: [], stt: "" }),
    generateJson: async () => { throw new m.AiUnavailableError(); } };
});
vi.mock("@/lib/assistant/lance", () => ({ hybridSearch: async () => null, holdSync: () => () => undefined, lanceWarm: () => undefined,
  currentIncidentIds: async () => [], lanceReady: async () => false, lanceStatus: async () => ({}) }));
vi.mock("@/lib/assistant/embed", () => ({ warmUp: () => undefined, embed: async () => { throw new Error("no model"); },
  semanticSearch: async () => [], embedStatus: () => ({ ready: false }) }));

import fs from "fs";
import { holder } from "./harness";

const CHAINS: string[][] = process.env.GOLDEN_FILE ? JSON.parse(fs.readFileSync(process.env.GOLDEN_FILE, "utf8"))
  : [["how many open grievances in Adyar"], ["road deaths today"]];

beforeAll(async () => {
  if (!haveStore()) return;
  const f = await loadFrozen();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(f.frozenAt);
});
afterAll(() => vi.useRealTimers());

it("explore", async () => {
  if (!haveStore()) return;
  void forward;
  const { ask } = await import("@/lib/assistant/pipeline");
  const id = (holder.db!.prepare("SELECT incident_id AS id FROM incidents WHERE severity_level = 'Severe' AND is_open = 1 ORDER BY priority_score DESC LIMIT 1").get() as { id: string }).id;
  const out: string[] = [];
  for (const chain of CHAINS) {
    let sessionId: string | null = null;
    for (const raw of chain) {
      const q = raw.replace("__ID__", id).replace("__LONG__", "Please tell me about flooding in Adyar. ".repeat(130));
      const t0 = performance.now();
      try {
        const r = await ask({ user: "golden@test", sessionId, message: q, inputMode: "text", language: "auto",
          scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null }, replyTo: null, stage: () => undefined });
        sessionId = r.sessionId;
        const c = r.card;
        out.push(`=== ${q.slice(0, 120)}  (${Math.round(performance.now() - t0)} ms)
kind=${c.kind} intent=${c.intent} display=${c.display} lang=${c.language} rt=${c.responseType}
scope: ${c.scopeLine}
H: ${c.headline}
${c.answerMarkdown.slice(0, 900)}
tools=${c.sources.tools.map((t) => t.name).join(",")} chips=${JSON.stringify(c.chips)}
caveats=${JSON.stringify(c.caveats).slice(0, 400)}
assumptions=${JSON.stringify(c.sources.assumptions).slice(0, 400)}
`);
      } catch (e) {
        out.push(`=== ${q.slice(0, 120)}
THREW ${(e as Error).stack?.slice(0, 600)}
`);
      }
    }
  }
  fs.writeFileSync(process.env.GOLDEN_OUT ?? "golden-explore.txt", out.join(String.fromCharCode(10)));
});
