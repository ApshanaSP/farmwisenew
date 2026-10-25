/**
 * Writes real answer cards (frozen store, no AI) for the development preview of the chat panel (/dev/assistant).
 * Run: FIXTURE=1 npx vitest run --config vitest.golden.config.ts fixture
 */
import fs from "fs";
import path from "path";
import { it, vi } from "vitest";
import { haveStore, loadFrozen } from "./harness";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("./harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("./harness")).forward }));
vi.mock("@/lib/ai/gateway", async (orig) => {
  const m = await orig<typeof import("@/lib/ai/gateway")>();
  return { ...m, aiStatus: () => ({ available: false, problem: null, providers: [], stt: "" }), generateJson: async () => { throw new m.AiUnavailableError(); } };
});
vi.mock("@/lib/assistant/lance", () => ({ hybridSearch: async () => null, holdSync: () => () => undefined, lanceWarm: () => undefined,
  currentIncidentIds: async () => [], lanceReady: async () => false, lanceStatus: async () => ({}) }));
vi.mock("@/lib/assistant/embed", () => ({ ModelNotReady: class extends Error {}, warmUp: () => undefined, embed: async () => { throw new Error("no model"); },
  semanticSearch: async () => [], embedStatus: () => ({ ready: false }) }));

it.skipIf(!haveStore() || !process.env.FIXTURE)("fixture", async () => {
  const f = await loadFrozen();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(f.frozenAt);
  const { ask } = await import("@/lib/assistant/pipeline");
  const qs = ["why is Teynampet high?", "top 5 open incidents", "tell me about the second one", "department ranking by open complaints", "how many road accidents this week",
    "latest news about flooding", "which hospitals are overloaded?", "இந்த வாரம் சாலை விபத்துகள் எத்தனை?"];
  const messages: unknown[] = [];
  let sessionId: string | null = null;
  for (const q of qs) {
    const r = await ask({ user: "fixture@test", sessionId, message: q, inputMode: "text", language: "auto",
      scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null }, replyTo: null, stage: () => undefined });
    sessionId = r.sessionId;
    messages.push({ id: `u-${messages.length}`, role: "user", text: q, card: null }, { id: r.card.id, role: "assistant", text: r.card.headline, card: r.card });
  }
  fs.writeFileSync(path.join(process.cwd(), "src", "app", "dev", "assistant", "fixtures.json"), JSON.stringify({ messages }));
  vi.useRealTimers();
}, 300_000);
