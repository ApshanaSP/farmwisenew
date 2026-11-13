/**
 * Reviewer probe (QA pass 7, studio-parse): a fetched page still reaches backtracking patterns on the SERVER's thread after the reader moved
 * page parsing out. The link's fetch and robots.txt are mocked (no network); the page is read by the real reader; resolveLink then runs
 * resolve.ts's captchaPage() and articleLike() (and connect/index.ts's <title> pattern) on this thread.
 *   timeout 300 npx vitest run --config vitest.p7.config.ts --maxWorkers=2 tests/qa/pass7/studio-parse/reviewer/inthread.test.ts < /dev/null
 */
import { afterEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ url: "https://example.org/ward-data", body: Buffer.alloc(0), fetched: [] as string[] }));
vi.mock("@/lib/studio/fetchurl", async (orig) => {
  const m = await orig<typeof import("@/lib/studio/fetchurl")>();
  return { ...m, fetchOnce: vi.fn(async (u: string) => {
    h.fetched.push(u);
    if (u === h.url) return { buf: h.body, name: "ward-data.html", contentType: "text/html; charset=utf-8", url: h.url, status: 200 };
    throw new m.LinkError("The link answered 404.", "http", 404);
  }) };
});
vi.mock("@/lib/studio/connect/robots", () => ({ robotsAllow: async () => true }));

import { resolveLink } from "@/lib/studio/connect/resolve";
import { stopReaders } from "@/lib/studio/parse-pool";

async function loopGap<T>(f: () => Promise<T>): Promise<{ value: T; gap: number; ms: number }> {
  let last = performance.now(), gap = 0;
  const iv = setInterval(() => { const n = performance.now(); gap = Math.max(gap, n - last); last = n; }, 10);
  const t0 = performance.now();
  try { const value = await f(); gap = Math.max(gap, performance.now() - last); return { value, gap: Math.round(gap), ms: Math.round(performance.now() - t0) }; }
  finally { clearInterval(iv); }
}
afterEach(() => { vi.unstubAllEnvs(); stopReaders(); });

for (const [what, unit, kb] of [["<meta ", "meta", 150], ["<!--", "comment", 150], ["<title>", "title", 200]] as const) {
  it(`a ${kb} KB page of "${what}" (no data): the server's thread is never held more than 1 s`, async () => {
    vi.stubEnv("STUDIO_BROWSER", "0");
    h.body = Buffer.from(`<!doctype html><html><head>${unit === "title" ? "" : "<title>Ward data</title>"}</head><body><p>Ward data</p>${what.repeat(Math.floor((kb * 1024) / what.length))}`);
    const r = await loopGap(() => resolveLink(h.url, { mode: "none" } as never, { log: () => {}, explore: false }));
    console.log(unit, { kb, ms: r.ms, gap: r.gap, outcome: r.value.outcome.kind, reason: r.value.outcome.reason });
    expect(r.gap).toBeLessThan(1000);
  }, 120_000);
}
