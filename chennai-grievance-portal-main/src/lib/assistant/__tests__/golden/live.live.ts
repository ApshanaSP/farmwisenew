/**
 * Live run: question chains through the whole pipeline with the real language models (router, composer, verifier) on the
 * frozen store, the clock pinned to the moment it was frozen. Meaning search is off (the frozen store has no index), so
 * searches use keywords. Writes every answer with its route, models, timings and checks to LIVE_OUT.
 */
import { afterAll, beforeAll, it, vi } from "vitest";
import { forward, haveStore, loadFrozen } from "./harness";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("./harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("./harness")).forward }));
vi.mock("@/lib/assistant/lance", () => ({ hybridSearch: async () => null, holdSync: () => () => undefined, lanceWarm: () => undefined,
  currentIncidentIds: async () => [], lanceReady: async () => false, lanceStatus: async () => ({}) }));
vi.mock("@/lib/assistant/embed", () => ({ ModelNotReady: class extends Error {}, warmUp: () => undefined, embed: async () => { throw new Error("no model"); },
  semanticSearch: async () => [], embedStatus: () => ({ ready: false }) }));

import fs from "fs";
import { holder } from "./harness";

const CHAINS: string[][] = JSON.parse(fs.readFileSync(process.env.LIVE_FILE ?? "eval/live-questions.json", "utf8"));
const GAP = Number(process.env.LIVE_GAP_MS ?? 9000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  if (!haveStore()) return;
  const f = await loadFrozen();
  // the clock starts at the freeze and keeps ticking: the gateway times rate-limit rests and per-minute token use with it,
  // and a stopped clock left the first rate-limited model resting for the whole run
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(f.frozenAt);
});
afterAll(() => vi.useRealTimers());

it("live", async () => {
  if (!haveStore()) return;
  void forward;
  const { ask } = await import("@/lib/assistant/pipeline");
  const id = (holder.db!.prepare("SELECT incident_id AS id FROM incidents WHERE severity_level = 'Severe' AND is_open = 1 ORDER BY priority_score DESC LIMIT 1").get() as { id: string }).id;
  const outFile = process.env.LIVE_OUT ?? "tmp/live-answers.txt";
  fs.writeFileSync(outFile, "");
  let k = 0;
  for (const chain of CHAINS) {
    let sessionId: string | null = null;
    for (const raw of chain) {
      const q = raw.replace("__ID__", id);
      if (k++) await sleep(GAP);
      const t0 = performance.now();
      let text: string;
      try {
        const r = await ask({ user: "live@test", sessionId, message: q, inputMode: "text", language: "auto",
          scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null }, replyTo: null, stage: () => undefined });
        sessionId = r.sessionId;
        const c = r.card;
        const v = c.sources.verifier as { checked?: number; unmatched?: unknown[]; template?: boolean } | null;
        text = `=== [${k}] ${q.slice(0, 160)}  (${Math.round(performance.now() - t0)} ms)
kind=${c.kind} intent=${c.intent ?? ""} display=${c.display} lang=${c.language} chart=${c.chart?.type ?? "-"} offline=${!!c.offline}
scope: ${c.scopeLine}
models: ${c.sources.models.map((m) => `${m.step}:${m.provider}/${m.model}(${m.ms}ms)`).join(", ") || "none"}
tools: ${c.sources.tools.map((t) => t.name).join(",")}  verifier: ${v ? `checked=${v.checked} unmatched=${JSON.stringify(v.unmatched ?? []).slice(0, 200)} template=${!!v.template}` : "-"}
H: ${c.headline}
${c.answerMarkdown.slice(0, 1400)}
${c.chips?.length ? `chips: ${JSON.stringify(c.chips)}\n` : ""}caveats: ${JSON.stringify(c.caveats).slice(0, 300)}
assumptions: ${JSON.stringify(c.sources.assumptions).slice(0, 400)}
limits: ${JSON.stringify(c.sources.limits).slice(0, 300)}
`;
      } catch (e) {
        text = `=== [${k}] ${q.slice(0, 160)}\nTHREW ${(e as Error).stack?.slice(0, 700)}\n`;
      }
      fs.appendFileSync(outFile, text + "\n");
    }
  }
});
