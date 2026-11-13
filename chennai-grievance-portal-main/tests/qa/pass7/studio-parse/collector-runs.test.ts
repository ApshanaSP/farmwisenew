/**
 * QA pass 7, studio-parse, row p7-studio-parse-12: a Collector source's scheduled run (sources.ts fetchAndIngest -> itemsFrom) read the
 * fetched page with patterns that search to the end of the page from every unclosed tag, on the server's thread, on every schedule. The
 * page is now read in the Studio's file reader (parse-pool.ts readCollector), under its time limit. The fetch is not needed: itemsFrom
 * is the step after it. Crafted inputs are kept small (a few seconds on the server's thread before the fix).
 *   timeout 300 npx vitest run --config vitest.p7.config.ts --maxWorkers=1 tests/qa/pass7/studio-parse/collector-runs.test.ts < /dev/null
 */
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/collector/db", () => ({ default: {}, ops: (t: string) => t }));
vi.mock("@/lib/collector/nlp", () => ({ classify: () => null, resolvePlace: async () => null }));

import { itemsFrom } from "@/lib/collector/sources";
import { stopReaders } from "@/lib/studio/parse-pool";

/** The longest gap between 10 ms ticks of this (the server's) thread while `f` runs, the last interval included. */
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
const MAP = { title: "title", body: [], url: "link", published: null, dateFormat: "auto", place: [], lat: null, lon: null, category: null, id: null };
afterEach(() => { vi.unstubAllEnvs(); stopReaders(); });

const cases: [string, Record<string, unknown>, string][] = [
  ["an approved RSS source (stored mapping), 300 KB of unclosed <item>", { kind: "rss", url: "https://example.org/feed", mapping: { v: 1, detected: "rss", recordPath: null, map: MAP } }, "<rss><channel>" + "<item>".repeat(50_000)],
  ["an older RSS source (no mapping), 300 KB of unclosed <item>", { kind: "rss", url: "https://example.org/feed", mapping: null }, "<rss><channel>" + "<item>".repeat(50_000)],
  ["an older web-page source (no mapping), 12 KB of unclosed <a href> (cubic: 60 KB ran past 300 s)", { kind: "html", url: "https://example.org/news", mapping: null }, "<html><body>" + "<a href='x' ".repeat(1_000)]
];
for (const [what, source, page] of cases) {
  it(`${what}: the scheduled run never holds the server's thread`, async () => {
    vi.stubEnv("STUDIO_PARSE_SECONDS", "3");
    const r = await held(() => itemsFrom(source, page));
    console.log(what, { ms: r.ms, gap: r.gap, value: r.value instanceof Error ? r.value.message.slice(0, 70) : `${(r.value as unknown[]).length} items` });
    expect(r.gap).toBeLessThan(500);
  }, 60_000);
}

it("an ordinary RSS feed through a stored mapping gives its items, as before", async () => {
  const xml = `<?xml version="1.0"?><rss><channel><title>GCC</title>${["Rain in Adyar", "Water cut in Zone 9", "Road work in Teynampet"].map((t, i) => `<item><title>${t}</title><link>https://example.org/${i}</link></item>`).join("")}</channel></rss>`;
  const items = await itemsFrom({ kind: "rss", url: "https://example.org/feed", mapping: { v: 1, detected: "rss", recordPath: null, map: MAP } }, xml);
  expect(items.map((i) => [i.title, i.url])).toEqual([["Rain in Adyar", "https://example.org/0"], ["Water cut in Zone 9", "https://example.org/1"], ["Road work in Teynampet", "https://example.org/2"]]);
  const legacy = await itemsFrom({ kind: "rss", url: "https://example.org/feed", mapping: null }, xml);
  expect(legacy.map((i) => i.title)).toEqual(["Rain in Adyar", "Water cut in Zone 9", "Road work in Teynampet"]);
}, 60_000);
