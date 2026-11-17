/**
 * v6 Phase 4: the news routes. The dev twin answers only this PC (devguard localOnly) and is 404 in production unless the spec
 * flag is set; the collector route needs the Collector's session. Both stream NDJSON with the first line ("Reading The Hindu's
 * report...") sent before the article has been read.
 */
import type { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ release: null as null | (() => void), session: true }));
vi.mock("@/lib/collector/intel", () => ({
  newsDoc: async (id: string) => (id === "doc-1" ? { id, url: "https://www.thehindu.com/news/a", title: "Wall collapse in Velachery", publisher: "The Hindu", publisher_domain: "thehindu.com", body: null, t: "2026-11-17 08:00:00", place: "Velachery", cat: null } : null)
}));
vi.mock("@/lib/thunai/web/read", () => ({
  readArticle: async (url: string) => {
    await new Promise<void>((r) => { h.release = r; });
    return { status: "ok", outlet: "The Hindu", outletTa: "தி இந்து", outletId: "thehindu", url, host: "www.thehindu.com", publishedAt: "2026-11-17T02:30:00Z", title: "Wall collapse in Velachery",
      text: "Three people were injured when a compound wall collapsed in Velachery on Sunday night, police said.", words: 16, ms: 1, cached: false };
  }
}));
vi.mock("@/lib/thunai/web/related", async (orig) => ({
  ...(await orig<typeof import("@/lib/thunai/web/related")>()),
  relatedCoverage: async () => ({ items: [], self: null, feeds: { tried: 7, ok: 7, cached: 0, failed: 0, ms: 1 }, ms: 1 })
}));
vi.mock("@/lib/collector/guard", async () => {
  const { NextResponse } = await import("next/server");
  return { collectorSession: async () => (h.session ? { userId: 7, email: "c@x", role: "collector" } : NextResponse.json({ error: "Not authenticated" }, { status: 401 })), failed: () => new Response(null, { status: 500 }) };
});
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));

const req = (body: unknown, headers: Record<string, string> = { host: "localhost:3093" }) =>
  ({ headers: { get: (n: string) => headers[n.toLowerCase()] ?? null }, json: async () => body, signal: new AbortController().signal }) as unknown as NextRequest;

async function lines(res: Response, onFirst?: () => void): Promise<Record<string, unknown>[]> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "", first = true;
  const out: Record<string, unknown>[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let k: number;
    while ((k = buf.indexOf("\n")) >= 0) {
      out.push(JSON.parse(buf.slice(0, k)));
      buf = buf.slice(k + 1);
      if (first) { first = false; onFirst?.(); }
    }
  }
  return out;
}

afterEach(() => { vi.unstubAllEnvs(); h.session = true; h.release = null; });
/** lets the article read finish (once it has started): the stream cannot have sent anything after "first" before this */
const releaseSoon = () => { const go = () => (h.release ? h.release() : setTimeout(go, 5)); setTimeout(go, 5); };

describe("POST /api/dev/thunai/news", () => {
  it("is 404 in production without the spec flag, and to anyone not on this PC", async () => {
    const { POST } = await import("./route");
    vi.stubEnv("NODE_ENV", "production");
    expect((await POST(req({ id: "doc-1" }))).status).toBe(404);
    vi.unstubAllEnvs();
    expect((await POST(req({ id: "doc-1" }, { host: "district-iq.trycloudflare.com" }))).status).toBe(404);
    expect((await POST(req({ id: "doc-1" }, { host: "localhost:3093", "x-forwarded-for": "203.0.113.9" }))).status).toBe(404);
  });

  it("refuses a body that is not { id } or { question }", async () => {
    const { POST } = await import("./route");
    for (const b of [null, {}, { id: "../../etc" }, { id: "doc-1", question: "x" }, { url: "https://www.thehindu.com/a" }]) expect((await POST(req(b))).status, JSON.stringify(b)).toBe(400);
  });

  it("streams the first line before the article is read, then the brief, related coverage and done", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({ id: "doc-1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/x-ndjson/);
    // the article read can finish only after the first line has arrived: a route that buffered its events would never answer
    const all = await lines(res, releaseSoon);
    expect(all[0]).toEqual({ type: "first", en: "Reading The Hindu's report...", ta: "தி இந்து செய்தியைப் படிக்கிறேன்..." });
    expect(all.map((e) => e.type)).toEqual(["first", "brief", "related", "done"]);
    expect(JSON.stringify(all[1])).toContain("The Hindu reported");
  });

  it("an unknown id ends with an error event", async () => {
    const { POST } = await import("./route");
    expect(await lines(await POST(req({ id: "nope" })))).toEqual([{ type: "error", why: "not_found" }]);
  });
});

describe("POST /api/collector/thunai/news", () => {
  it("needs the Collector's session", async () => {
    h.session = false;
    const { POST } = await import("../../../collector/thunai/news/route");
    expect((await POST(req({ id: "doc-1" }))).status).toBe(401);
  });

  it("streams NDJSON for a signed-in Collector", async () => {
    const { POST } = await import("../../../collector/thunai/news/route");
    const res = await POST(req({ id: "doc-1" }));
    const all = await lines(res, releaseSoon);
    expect(all.map((e) => e.type)).toEqual(["first", "brief", "related", "done"]);
  });
});
