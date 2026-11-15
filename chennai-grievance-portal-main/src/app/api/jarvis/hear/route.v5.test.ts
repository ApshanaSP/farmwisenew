/**
 * /api/jarvis/hear, v5 (C4): with NEXT_PUBLIC_JARVIS_STRICT_AUDIO_GATE=1 the route refuses audio that does not carry the engaged
 * mark (?engaged=1, which the console sets only when Jarvis is woken or engaged), before the body is read. Default off: unchanged.
 * The session, the rate limit and the transcriber are stand-ins: no model, no network, no audio kept.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ read: 0, heard: 0 }));
vi.mock("@/lib/collector/guard", () => ({ collectorSession: async () => ({ email: "lane2@example.invalid" }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/thunai/stt", () => ({
  MAX_AUDIO_BYTES: 1_000_000,
  sttAvailable: () => true,
  readHear: async (req: Request) => { m.read++; return { buf: await req.arrayBuffer(), vocab: [], lastLang: null }; },
  hearUtterance: async () => { m.heard++; return { text: "", lang: "en", conf: { speech: 0.9, logprob: -0.2 }, timing: { sttSent: 3, sttBack: 250 } }; }
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

const req = (q: string) => new NextRequest(`http://localhost/api/jarvis/hear?${q}`, { method: "POST", body: new Uint8Array(2000), headers: { "Content-Type": "audio/wav" } });

beforeEach(() => { m.read = 0; m.heard = 0; });
afterEach(() => { vi.unstubAllEnvs(); });

describe("C4: the route's half of the strict audio gate", () => {
  it("on: audio without the engaged mark is refused, and never read", async () => {
    vi.stubEnv("NEXT_PUBLIC_JARVIS_STRICT_AUDIO_GATE", "1");
    for (const q of ["lane=ambient&lang=en", "lane=engaged&lang=en", "lang=en", "lane=engaged&lang=en&engaged=0"]) {
      const r = await POST(req(q));
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({ error: "not-engaged" });
    }
    expect(m.read).toBe(0);
    expect(m.heard).toBe(0);
  });
  it("on: audio with the mark is heard, and the transcriber's JSON (its timing too) goes back unchanged", async () => {
    vi.stubEnv("NEXT_PUBLIC_JARVIS_STRICT_AUDIO_GATE", "1");
    const r = await POST(req("lane=engaged&lang=en&engaged=1"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ text: "", lang: "en", conf: { speech: 0.9, logprob: -0.2 }, timing: { sttSent: 3, sttBack: 250 } });
    expect(m.heard).toBe(1);
  });
  it("off (the default): the ambient lane with no mark is heard as before", async () => {
    const r = await POST(req("lane=ambient&lang=en"));
    expect(r.status).toBe(200);
    expect(m.heard).toBe(1);
  });
});
