// v5 F1, defence in depth: the server's voice refuses any text that still holds a digit (the mouth puts every number in words first).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ rows: [] as [string, Record<string, unknown>][] }));
vi.mock("@/lib/collector/guard", () => ({ collectorSession: async () => ({ email: "c@x", userId: 1, role: "collector" }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/thunai/ledger", () => ({ ledger: () => ({ room: () => ({ ok: true }), record: () => undefined, cool: () => undefined }) }));
vi.mock("@/lib/thunai/telemetry", () => ({ telemetry: (e: string, d: Record<string, unknown>) => { h.rows.push([e, d]); } }));

const PCM = Buffer.from([1, 0, 2, 0]);
const unary = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: PCM.toString("base64"), mimeType: "audio/L16;codec=pcm;rate=24000" } }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
const post = (body: unknown) => new NextRequest("http://localhost/api/jarvis/say", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
let fetchMock: ReturnType<typeof vi.fn>;
const load = async () => { vi.resetModules(); return (await import(/* @vite-ignore */ process.env.ROUTE_UNDER_TEST ?? "./route")) as typeof import("./route"); };

beforeEach(() => {
  h.rows = [];
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("AZURE_SPEECH_KEY", "");
  vi.stubEnv("JARVIS_TTS_STREAM", "");
  fetchMock = vi.fn(async () => unary());
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("api/jarvis/say refuses a digit (F1, defence in depth)", () => {
  it("ASCII digits, Tamil digits and the Tamil sign for ten are refused before any model is asked; a count is logged, never the text", async () => {
    const { POST } = await load();
    for (const [text, lang] of [["There are 47 severe cases.", "en"], ["இன்று ௪௭ புகார்கள் வந்தன.", "ta"], ["௰ மண்டலங்களில் மழை.", "ta"]] as const) {
      const r = await POST(post({ text, lang }));
      expect(r.status, text).toBe(400);
      expect(await r.json()).toEqual({ error: "digit" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    const refusals = h.rows.filter(([e, d]) => e === "tts" && d.why === "digit");
    expect(refusals).toHaveLength(3);
    for (const [, d] of h.rows) for (const v of Object.values(d)) expect(String(v)).not.toMatch(/severe|புகார்|மழை/u);
  });

  it("the same line with its numbers in words is said", async () => {
    const { POST } = await load();
    const r = await POST(post({ text: "There are forty-seven severe cases.", lang: "en" }));
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
