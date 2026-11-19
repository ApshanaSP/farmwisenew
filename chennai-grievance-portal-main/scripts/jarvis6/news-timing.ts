/**
 * Jarvis v6 Phase 4: how long reading the news takes, against the real outlets (harmless GETs through the reader's own safe path:
 * allow-list, robots.txt, SSRF checks, pinned connections, caps). Nothing is written but the timings file; no page text is kept.
 *
 *   npx vite-node --config vitest.config.ts scripts/jarvis6/news-timing.ts [articles=3]
 *
 * It takes the newest article of The Hindu, DT Next and The New Indian Express from their own feeds, then for each one runs the whole
 * news turn (lib/thunai/web/serve.ts newsEvents) twice: COLD (every cache empty: robots.txt, the 7 feeds, the article) and WARM-FEEDS
 * (the feeds and robots.txt kept, as within the 10-minute cache; the articles read again). Per run: time to the first line, to the
 * article's brief (target p90 4 s) and to the coverage brief (target p90 8 s); per request (from the reader's telemetry): robots.txt,
 * feed and page fetch ms; extraction ms = the read's ms less its page fetch's. Results: eval/v6/news-timing.json (URLs and numbers).
 */
import fs from "fs";
import path from "path";
import { performance } from "perf_hooks";
import { loadDomains } from "@/lib/thunai/web/domains";
import { caches, clearWebCache } from "@/lib/thunai/web/fetch";
import { readFeed } from "@/lib/thunai/web/related";
import { newsEvents, type StoredDoc } from "@/lib/thunai/web/serve";

type Ev = { event: string; kind?: string; why?: string; ms?: number; host?: string };
const pct = (xs: number[], p: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
const stat = (xs: number[]) => ({ n: xs.length, p50: pct(xs, 50), p90: pct(xs, 90), min: xs.length ? Math.min(...xs) : null, max: xs.length ? Math.max(...xs) : null });

async function main() {
  const want = Number(process.argv[2] ?? 3);
  const list = loadDomains();
  const picks: StoredDoc[] = [];
  for (const id of ["thehindu", "dtnext", "nie"].slice(0, want)) {
    const out = list.outlets.find((o) => o.id === id)!;
    const f = await readFeed(out, out.feeds[0], { telemetry: () => {} });
    const e = f.entries.find((x) => /^https:\/\//.test(x.url));
    console.log(`${out.name}: feed ${f.status}, ${f.entries.length} entries${e ? "" : " (no article link)"}`);
    if (e) picks.push({ id: `${id}-1`, url: e.url, title: e.title, publisher: out.name, publisher_domain: out.domains[0], body: null, t: e.publishedAt ? new Date(e.publishedAt).toISOString() : null, place: null, cat: null });
  }
  const runs: Record<string, unknown>[] = [];
  const reqs: Ev[] = [];
  for (const mode of ["cold", "warm-feeds"] as const) {
    for (const doc of picks) {
      if (mode === "cold") clearWebCache(); else caches.pages.clear();
      const evs: Ev[] = [];
      const t0 = performance.now();
      const at: Record<string, number> = {};
      let status = "", related = 0, sentences = 0, relatedOutlets: string[] = [];
      const said: string[] = [];
      for await (const e of newsEvents({ id: doc.id }, { loadDoc: async () => doc, telemetry: (event, d) => evs.push({ event, ...(d as object) } as Ev) })) {
        const ms = Math.round(performance.now() - t0);
        if (e.type === "first") at.first = ms;
        if (e.type === "brief" && e.stage === "article") { at.article = ms; status = e.status; sentences = e.brief.en.length; }
        if (e.type === "related") { at.relatedAt = ms; related = e.items.length; relatedOutlets = e.items.map((x) => `${x.outlet} (${x.source})`); }
        if (e.type === "brief" && e.stage === "coverage") at.coverage = ms;
        if (e.type === "brief") said.push(...e.brief.en.map((l) => `  [${e.stage}] ${l}`));
        if (e.type === "done") at.done = ms;
      }
      const page = evs.find((x) => x.event === "web_get" && x.kind === "page" && x.host && doc.url && doc.url.includes(x.host));
      const read = evs.find((x) => x.event === "web_read" && x.host && doc.url && doc.url.includes(x.host));
      const robots = evs.filter((x) => x.event === "web_get" && x.kind === "robots");
      const extract = read?.ms != null && page?.ms != null && read.why === "ok" ? read.ms - page.ms : null;
      const rel = evs.find((x) => x.event === "web_related");
      runs.push({ mode, outlet: doc.publisher, url: doc.url, status, sentences, related, relatedOutlets, ...at, pageFetchMs: page?.ms ?? null, extractMs: extract, relatedMs: rel?.ms ?? null, robotsFetched: robots.length });
      reqs.push(...evs.filter((x) => x.event === "web_get").map((x) => ({ ...x, mode } as Ev & { mode: string })));
      console.log(`${mode} ${doc.publisher}: status ${status}, first ${at.first} ms, article brief ${at.article} ms, related ${related} at ${at.relatedAt} ms, coverage brief ${at.coverage ?? "-"} ms, done ${at.done} ms`);
      // what was said, to this console only (never to the results file)
      if (process.env.SHOW_SAID === "1") console.log(said.join("\n"));
      await new Promise((r) => setTimeout(r, 1500)); // polite: a pause between turns
    }
  }
  const col = (k: string, mode?: string) => runs.filter((r) => (!mode || r.mode === mode) && typeof r[k] === "number").map((r) => r[k] as number);
  const summary = {
    note: "Measured on this PC against the live outlets; ms from the start of the news turn (server side, no network to the browser).",
    at: new Date().toISOString(),
    articles: picks.map((p) => ({ outlet: p.publisher, url: p.url })),
    turn: {
      cold: { first: stat(col("first", "cold")), articleBrief: stat(col("article", "cold")), coverageBrief: stat(col("coverage", "cold")), done: stat(col("done", "cold")) },
      warmFeeds: { first: stat(col("first", "warm-feeds")), articleBrief: stat(col("article", "warm-feeds")), coverageBrief: stat(col("coverage", "warm-feeds")), done: stat(col("done", "warm-feeds")) }
    },
    stages: {
      pageFetch: stat(col("pageFetchMs")),
      extract: stat(col("extractMs")),
      robotsFetch: stat(reqs.filter((x) => x.kind === "robots" && x.why !== "timeout").map((x) => x.ms!).filter((x) => x != null)),
      feedFetch: stat(reqs.filter((x) => x.kind === "feed").map((x) => x.ms!).filter((x) => x != null)),
      relatedCoverageCold: stat(col("relatedMs", "cold")),
      relatedCoverageWarmFeeds: stat(col("relatedMs", "warm-feeds"))
    },
    statuses: Object.fromEntries([...new Set(reqs.map((x) => `${x.kind}:${x.why}`))].map((k) => [k, reqs.filter((x) => `${x.kind}:${x.why}` === k).length])),
    runs
  };
  const out = path.join(process.cwd(), "eval", "v6", "news-timing.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ turn: summary.turn, stages: summary.stages, statuses: summary.statuses }, null, 2));
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
