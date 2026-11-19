/**
 * /api/jarvis/hear, v10: the day's keyterms (the store's news names) go to Sarvam only when JARVIS_SARVAM_DAY_KEYTERMS=1. The bench of 19 Nov
 * (71 synthetic clips, the same clips with and without them) measured Sarvam's word error 0.127 with v9's fixed list against 0.156 with the
 * day's: 9 clips worse, 1 better, and one storm name written into an unrelated question ("Teynampet இந்த week" heard as "அக்வான் இந்த week").
 * The session, the rate limit, the transcriber and the lexicon are stand-ins: no model, no network, no audio kept.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ opts: null as null | Record<string, unknown> }));
vi.mock("@/lib/collector/guard", () => ({ collectorSession: async () => ({ email: "lane2@example.invalid" }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/thunai/stt", () => ({
  MAX_AUDIO_BYTES: 1_000_000,
  sttAvailable: () => true,
  readHear: async (req: Request) => ({ buf: await req.arrayBuffer(), vocab: [], lastLang: null, clarify: false, speechMs: null }),
  hearUtterance: async (_b: unknown, o: Record<string, unknown>) => { m.opts = o; return { text: "", lang: "en", conf: { speech: 0.9, logprob: -0.2 }, timing: { sttSent: 3, sttBack: 250 } }; }
}));
vi.mock("@/lib/thunai/sarvam", async (orig) => ({ ...(await orig<typeof import("@/lib/thunai/sarvam")>()), sarvamKeyed: () => true, sarvamMode: () => "tamil" }));
vi.mock("@/lib/thunai/v10/lexserver", () => ({ dayKeytermsNow: () => ["Akvan", "Murasu"] }));
vi.mock("@/lib/thunai/world", async (orig) => ({ ...(await orig<typeof import("@/lib/thunai/world")>()), serverWorld: async () => ({ zones: [], places: [], taluks: [], depts: [] }) }));

import { NextRequest } from "next/server";
import { POST } from "./route";

const req = () => new NextRequest("http://localhost/api/jarvis/hear?lane=engaged&lang=en", { method: "POST", body: new Uint8Array(2000), headers: { "Content-Type": "audio/wav" } });

beforeEach(() => { m.opts = null; });
afterEach(() => { vi.unstubAllEnvs(); });

describe("v10: the day's keyterms for Sarvam, opt-in", () => {
  it("off by default: Sarvam gets v9's fixed list (no keyterms passed)", async () => {
    const r = await POST(req());
    expect(r.status).toBe(200);
    expect(m.opts?.keyterms ?? null).toBeNull();
  });
  it("JARVIS_SARVAM_DAY_KEYTERMS=1: the day's names go with the audio", async () => {
    vi.stubEnv("JARVIS_SARVAM_DAY_KEYTERMS", "1");
    await POST(req());
    expect(m.opts?.keyterms).toEqual(["Akvan", "Murasu"]);
  });
});
