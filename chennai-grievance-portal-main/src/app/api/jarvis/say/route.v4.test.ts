import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ rows: [] as [string, Record<string, unknown>][], records: [] as string[], cools: [] as string[] }));
vi.mock("@/lib/collector/guard", () => ({ collectorSession: async () => ({ email: "c@x", userId: 1, role: "collector" }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/thunai/ledger", () => ({ ledger: () => ({ room: () => ({ ok: true }), record: (_o: string, m: string) => { h.records.push(m); }, cool: (_o: string, m: string) => { h.cools.push(m); } }) }));
vi.mock("@/lib/thunai/telemetry", () => ({ telemetry: (e: string, d: Record<string, unknown>) => { h.rows.push([e, d]); } }));

const PCM = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]);
const unary = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: PCM.toString("base64"), mimeType: "audio/L16;codec=pcm;rate=24000" } }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
const sse = (chunks: number[][]) => new Response(chunks.map((c) => `event: step.delta\ndata: ${JSON.stringify({ event_type: "step.delta", delta: { type: "audio", data: Buffer.from(c).toString("base64") } })}\n\n`).join("") + `data: ${JSON.stringify({ event_type: "interaction.completed" })}\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } });

// a whole answer, longer than the old per-chunk limit of 700 characters
const ANSWER = "The drains near the bridge are blocked and the main roads are under water. ".repeat(20).trim();
const post = (body: unknown) => new NextRequest("http://localhost/api/jarvis/say", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
let fetchMock: ReturnType<typeof vi.fn>;
// ROUTE_UNDER_TEST points the same tests at another copy of the route (how the failing-first run was made)
const load = async () => { vi.resetModules(); return (await import(/* @vite-ignore */ process.env.ROUTE_UNDER_TEST ?? "./route")) as typeof import("./route"); };
const upstream = () => fetchMock.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  h.rows = []; h.records = []; h.cools = [];
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("AZURE_SPEECH_KEY", "");
  vi.stubEnv("JARVIS_TTS_STREAM", "");
  fetchMock = vi.fn(async () => unary());
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("api/jarvis/say: one request per answer", () => {
  it("takes a whole answer (over 700 characters) in one request and asks the model once", async () => {
    expect(ANSWER.length).toBeGreaterThan(700);
    const { POST } = await load();
    const r = await POST(post({ text: ANSWER, lang: "en", stream: true }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("audio/wav");
    expect(upstream()).toHaveLength(1);
    expect(upstream()[0]).toMatch(/:generateContent$/);
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).contents[0].parts[0].text).toBe(ANSWER);
    const wav = Buffer.from(await r.arrayBuffer());
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(44).equals(PCM)).toBe(true);
  });

  it("the same answer again is kept: no second model request", async () => {
    const { POST } = await load();
    await POST(post({ text: ANSWER, lang: "en" }));
    const r = await POST(post({ text: ANSWER, lang: "en" }));
    expect(r.status).toBe(200);
    expect(upstream()).toHaveLength(1);
    expect(h.rows.map(([, d]) => d.path)).toEqual(["unary", "cache"]);
  });

  it("a 429 rests that model and the next one speaks", async () => {
    fetchMock.mockImplementationOnce(async () => new Response('{"error":{"details":[{"retryDelay":"30s"}]}}', { status: 429 }));
    const { POST } = await load();
    const r = await POST(post({ text: "One sentence to say.", lang: "ta" }));
    expect(r.status).toBe(200);
    expect(h.cools).toHaveLength(1);
    expect(upstream()).toHaveLength(2);
    expect(h.rows.filter(([e]) => e === "fallback_429").map(([, d]) => d)).toEqual([{ provider: "gemini", model: "gemini-3.8-flash-lite-tts", status: 429, fallback: "gemini/gemini-3.8-flash-tts" }]);
  });

  it("a 429 on the last model falls back to the browser's voice (503 to the client)", async () => {
    vi.stubEnv("JARVIS_TTS_MODELS", "gemini-3.8-flash-tts");
    fetchMock.mockImplementationOnce(async () => new Response("{}", { status: 429 }));
    const { POST } = await load();
    const r = await POST(post({ text: "One sentence to say.", lang: "en" }));
    expect(r.status).toBe(503);
    expect(h.rows.find(([e]) => e === "fallback_429")?.[1]).toEqual({ provider: "gemini", model: "gemini-3.8-flash-tts", status: 429, fallback: "browser" });
  });

  it("telemetry carries counts and codes, never the text", async () => {
    const { POST } = await load();
    await POST(post({ text: ANSWER, lang: "en" }));
    expect(h.rows[0][0]).toBe("tts");
    expect(h.rows[0][1]).toMatchObject({ provider: "gemini", model: "gemini-3.8-flash-lite-tts", ok: true, path: "unary", chars: ANSWER.length, lang: "en" });
    expect(typeof h.rows[0][1].ms).toBe("number");
    for (const [, d] of h.rows) for (const v of Object.values(d)) expect(String(v)).not.toContain("drains");
  });
});

describe("the streamed path (UNVERIFIED wire format, off unless JARVIS_TTS_STREAM=1)", () => {
  it("off by default: stream:true still gets one WAV from generateContent", async () => {
    const { POST } = await load();
    const r = await POST(post({ text: ANSWER, lang: "en", stream: true }));
    expect(r.headers.get("content-type")).toBe("audio/wav");
    expect(upstream()[0]).toMatch(/:generateContent$/);
  });

  it("on: the audio deltas come back as raw 16-bit PCM as they arrive, and the whole is kept as a WAV", async () => {
    vi.stubEnv("JARVIS_TTS_STREAM", "1");
    fetchMock.mockImplementationOnce(async () => sse([[1, 0, 2], [0, 3, 0]]));
    const { POST } = await load();
    const r = await POST(post({ text: ANSWER, lang: "en", stream: true }));
    expect(r.headers.get("content-type")).toBe("audio/l16; rate=24000");
    expect(upstream()[0]).toMatch(/\/interactions\?alt=sse$/);
    expect(Array.from(new Uint8Array(await r.arrayBuffer()))).toEqual([1, 0, 2, 0, 3, 0]);
    // kept: the repeat is the cached WAV, with no request
    const again = await POST(post({ text: ANSWER, lang: "en", stream: true }));
    expect(again.headers.get("content-type")).toBe("audio/wav");
    expect(upstream()).toHaveLength(1);
  });

  it("on, but the model refuses the streamed request before any audio: the one-request WAV path answers", async () => {
    vi.stubEnv("JARVIS_TTS_STREAM", "1");
    vi.stubEnv("JARVIS_TTS_MODELS", "gemini-3.8-flash-tts");
    fetchMock.mockImplementationOnce(async () => new Response("bad request", { status: 400 }));
    const { POST } = await load();
    const r = await POST(post({ text: ANSWER, lang: "en", stream: true }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("audio/wav");
    expect(upstream().map((u) => u.replace(/^.*\/v1beta\//, ""))).toEqual(["interactions?alt=sse", "models/gemini-3.8-flash-tts:generateContent"]);
  });
});
