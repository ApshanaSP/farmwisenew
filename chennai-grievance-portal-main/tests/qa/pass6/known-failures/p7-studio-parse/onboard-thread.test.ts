/**
 * Reviewer 2 probe (QA pass 7, studio-parse): the Collector's source onboarding (collector/onboard.ts, POST /api/collector/sources/onboard)
 * still runs on the server's thread the <title> pattern that 2fef0dd9 moved out of connect/index.ts and explore.ts because it backtracks
 * (onboard.ts:264), and sourcemap.ts feedLink / rssRecords. The fetch is faked (no network).
 *   OPEN (row p7-studio-parse-12): fails until onboarding reads pages off the server thread. HEAVY (one case used 280 s of CPU): run alone,
 *   timeout 600 npx vitest run --config vitest.p6probe.config.ts tests/qa/pass6/known-failures/p7-studio-parse/onboard-thread.test.ts < /dev/null
 */
import { expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ body: "", ct: "text/html" }));
vi.mock("@/lib/netsafe", () => {
  class UnsafeUrlError extends Error {}
  return {
    UnsafeUrlError,
    assertPublicUrl: async () => {},
    safeFetch: async (url: string) => /robots\.txt$/.test(url)
      ? { res: new Response(null, { status: 404 }), url, buf: Buffer.alloc(0) }
      : { res: new Response(null, { status: 200, headers: { "content-type": h.ct } }), url, buf: Buffer.from(h.body) }
  };
});
vi.mock("@/lib/collector/db", () => ({ default: {}, ops: {} }));
vi.mock("@/lib/collector/sources", () => ({ auditIn: () => {}, inTransaction: () => {}, runSource: () => {} }));
vi.mock("@/lib/collector/nlp", () => ({ classify: () => null, resolvePlace: async () => null }));
vi.mock("@/lib/crypto", () => ({ encryptSecret: (s: string) => s }));
vi.mock("@/lib/ai/gateway", () => {
  class E extends Error {}
  return { AiBudgetError: E, AiBusyError: E, AiUnavailableError: E, generateJson: async () => { throw new E("off"); } };
});

import { onboard } from "@/lib/collector/onboard";
import { feedLink, extractRecords } from "@/lib/collector/sourcemap";

async function held(f: () => Promise<unknown>) {
  let last = performance.now(), gap = 0;
  const iv = setInterval(() => { const x = performance.now(); gap = Math.max(gap, x - last); last = x; }, 10);
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, 30));
  await f();
  await new Promise((r) => setTimeout(r, 30));
  clearInterval(iv);
  return { ms: Math.round(performance.now() - t0), gapMs: Math.round(gap) };
}

it("onboard() on small pages of unclosed <title> tags: the detect step's time grows far faster than the page (htmlRecords on the server's thread)", async () => {
  h.ct = "text/html";
  const out: Record<string, unknown>[] = [];
  for (const kb of [2, 4, 8]) {
    h.body = "<title>".repeat(Math.floor(kb * 1024 / 7));
    const steps: string[] = [];
    const r = await held(() => onboard("https://example.org/news", null, "probe", (e) => { if (e.state !== "run") steps.push(`${e.id}:${e.state}:${e.ms ?? ""}`); }));
    const t0 = performance.now(); extractRecords("html", h.body, "https://example.org/", null); const recMs = Math.round(performance.now() - t0);
    out.push({ kb, ...r, extractRecordsHtmlMs: recMs, steps: steps.join(" ") });
    if (r.ms > 20_000) break;
  }
  console.log("onboard <title> pages:", out);
  expect(Math.max(...out.map((o) => o.gapMs as number))).toBeLessThan(1000);
}, 200_000);

it("sourcemap feedLink on 200 KB of '<link ' (onboard calls it on every html page)", async () => {
  const r = await held(async () => feedLink("<link ".repeat(Math.floor(200 * 1024 / 6)), "https://example.org/"));
  console.log("feedLink:", r);
  expect(r.gapMs).toBeLessThan(1000);
}, 200_000);

it("sourcemap rssRecords on 150 KB of '<item>' served as application/rss+xml (onboard's extractRecords)", async () => {
  const r = await held(async () => extractRecords("rss", "<item>".repeat(Math.floor(150 * 1024 / 6)), "https://example.org/", null));
  console.log("rssRecords:", r);
  expect(r.gapMs).toBeLessThan(1000);
}, 200_000);

it("onboard.ts:264's <title> pattern, verbatim, on 300 KB of unclosed <title> tags (onboard reads up to 6 MB)", async () => {
  const text = "<title>".repeat(Math.floor(300 * 1024 / 7));
  const r = await held(async () => text.match(/<title[^>]*>([\s\S]*?)<\/title>/i));
  console.log("onboard title pattern 300 KB:", r);
  expect(r.gapMs).toBeLessThan(1000);
}, 200_000);
