/**
 * QA pass 7, studio-parse, row p7-studio-parse-12: the Collector's source onboarding (collector/onboard.ts, POST
 * /api/collector/sources/onboard) read the fetched page on the server's thread: its <title> pattern, sourcemap.ts feedLink, the
 * password-field check (looksLikeLogin), the sign-in form and extractRecords all search to the end of the page from every unclosed tag.
 * The page is now read in the Studio's file reader (parse-pool.ts readCollector), under its time limit. Fetch, database, AI and
 * places are mocked (no network). Crafted inputs are kept small (a few seconds on the server's thread before the fix).
 *   timeout 300 npx vitest run --config vitest.p7.config.ts --maxWorkers=1 tests/qa/pass7/studio-parse/collector-onboard.test.ts < /dev/null
 */
import { afterEach, expect, it, vi } from "vitest";

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
vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[], []] }, ops: (t: string) => t }));
vi.mock("@/lib/collector/sources", () => ({ auditIn: () => {}, inTransaction: () => {}, runSource: () => {} }));
vi.mock("@/lib/collector/nlp", () => ({ classify: () => null, resolvePlace: async () => null }));
vi.mock("@/lib/crypto", () => ({ encryptSecret: (s: string) => s }));
vi.mock("@/lib/ai/gateway", () => {
  class E extends Error {}
  return { AiBudgetError: E, AiBusyError: E, AiUnavailableError: E, generateJson: async () => { throw new E("off"); } };
});

import { onboard } from "@/lib/collector/onboard";
import { stopReaders } from "@/lib/studio/parse-pool";

async function held<T>(f: () => Promise<T>): Promise<{ value: T | Error; gap: number; ms: number }> {
  let last = performance.now(), gap = 0;
  const iv = setInterval(() => { const n = performance.now(); gap = Math.max(gap, n - last); last = n; }, 10);
  const t0 = performance.now();
  let value: T | Error;
  try { value = await f(); } catch (e) { value = e as Error; }
  gap = Math.max(gap, performance.now() - last);
  clearInterval(iv);
  return { value, gap: Math.round(gap), ms: Math.round(performance.now() - t0) };
}
const steps: { id: string; state: string; label: string; detail?: string }[] = [];
const run = () => onboard("https://example.org/ward-news", null, "qa.collector@example.test", (e) => { steps.push(e as never); });
afterEach(() => { vi.unstubAllEnvs(); stopReaders(); steps.length = 0; });

for (const [what, page] of [
  ["160 KB of unclosed <link (feedLink)", "<html><head>" + "<link ".repeat(26_000)],
  ["60 KB of unclosed <input (the password-field check reads 60 KB)", "<html><body>" + "<input ".repeat(8_500)],
  ["20 KB of unclosed <title (the title pattern, then the records: 60 KB held the thread 70 s)", "<html><head>" + "<title>".repeat(2_850)]
] as const) {
  it(`onboarding a page of ${what}: the server's thread is never held`, async () => {
    vi.stubEnv("STUDIO_PARSE_SECONDS", "3");
    h.body = page; h.ct = "text/html";
    const r = await held(run);
    const last = steps.filter((s) => s.state === "fail" || s.state === "ok").pop();
    console.log(what, { ms: r.ms, gap: r.gap, last: last && `${last.id} ${last.state}: ${last.label} ${last.detail?.slice(0, 60) ?? ""}` });
    expect(r.value).not.toBeInstanceOf(Error);
    expect(steps.some((s) => s.id === "detect")).toBe(true);
    expect(r.gap).toBeLessThan(250);
  }, 120_000);
}

it("an ordinary news page with a feed link and a sign-in box still onboards as before (title, records)", async () => {
  h.ct = "text/html";
  h.body = `<!doctype html><html><head><title>Ward news | GCC</title></head><body><ul>${Array.from({ length: 6 }, (_, i) =>
    `<li class="story"><a href="/n/${i}">Water supply restored in ward ${i} after the main was repaired</a><time>2026-11-0${i + 1}</time></li>`).join("")}</ul></body></html>`;
  const d = await run() as { title: string | null; detected: string; total: number } | null;
  console.log("ordinary page:", d && { title: d.title, detected: d.detected, total: d.total }, steps.map((s) => `${s.id}:${s.state}`).join(" "));
  expect(d?.title).toBe("Ward news | GCC");
  expect(d?.detected).toBe("page");
  expect(d?.total).toBe(6);
}, 60_000);
