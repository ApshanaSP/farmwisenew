/**
 * Live lane, news: the Chennai feeds of the news pipeline's English outlets (chennai_news_pipeline/config.yaml
 * rss_feeds) read every 10 minutes by the website's own source reader (lib/collector/sources.ts: runDueSources ->
 * classify, place, store in source_items), so a report appears on the Overview map and in "From your sources" within
 * about 10 minutes. These items get keyword labels only (classify.ts); the hourly build still reads the same outlets
 * with its AI labels, story grouping and incident linking.
 *
 * Each feed is an ordinary added source the Collector can see, pause or remove in Sources. They are set up once per
 * store: a feed already set up (audit_log "live-lane:setup") is never added again, so one the Collector removed stays
 * removed, and a refresh time the Collector changed stays changed.
 */
import { RowDataPacket } from "mysql2";
import intelPool, { ops } from "@/lib/collector/db";
import { audit } from "@/lib/collector/sources";
import { bumpDataEpoch } from "@/lib/collector/epoch";
import { live, istNow, markLive } from "@/lib/live/state";

export const LIVE_MINUTES = 10;
export const LIVE_NOTE = "Live lane: read every 10 minutes";
export const LIVE_FEEDS = [
  { name: "The Hindu - Chennai (RSS)", url: "https://www.thehindu.com/news/cities/chennai/feeder/default.rss" },
  { name: "Times of India - Chennai (live)", url: "https://timesofindia.indiatimes.com/rssfeeds/2950623.cms" },
  { name: "DT Next - Chennai (live)", url: "https://www.dtnext.in/api/v1/collections/newschennai-news.rss" },
  { name: "The New Indian Express - Chennai (live)", url: "https://www.newindianexpress.com/cities/chennai/rssfeed/?id=182&getXmlFeed=true" }
] as const;

type Row = Record<string, any>;
async function q(sql: string, params: unknown[] = []): Promise<Row[]> {
  const [r] = await intelPool.query<RowDataPacket[]>(sql, params);
  return r as Row[];
}

declare global {
  // eslint-disable-next-line no-var
  var __liveNewsSetup: Promise<void> | undefined;
}

/** Adds the live feeds as sources (once per store), or moves an existing one to every 10 minutes (once). */
export function ensureLiveNews(): Promise<void> {
  if (process.env.LIVE_LANE === "off") return Promise.resolve();
  global.__liveNewsSetup ??= (async () => {
    const done = new Set((await q(`SELECT record_id FROM ${ops("audit_log")} WHERE action = 'live-lane:setup'`)).map((r) => String(r.record_id)));
    for (const f of LIVE_FEEDS) {
      const [s] = await q(`SELECT source_id, refresh_minutes, description FROM ${ops("sources")} WHERE url = ? ORDER BY source_id LIMIT 1`, [f.url]);
      if (s && done.has(String(s.source_id))) continue;
      if (!s) {
        // a feed set up before and removed by the Collector since: its audit row names the link
        const gone = await q(`SELECT 1 FROM ${ops("audit_log")} WHERE action = 'live-lane:setup' AND after_value LIKE ? LIMIT 1`, [`%${f.url.replace(/[%_]/g, "\\$&")}%`]);
        if (gone.length) continue;
        const [res] = await intelPool.query(
          `INSERT INTO ${ops("sources")} (name, url, kind, description, auth, refresh_minutes, created_by, status)
           VALUES (?, ?, 'rss', ?, 'none', ?, 'live-lane', 'new')`, [f.name, f.url, LIVE_NOTE, LIVE_MINUTES]);
        const id = (res as { insertId: number }).insertId;
        await audit("live-lane", "live-lane:setup", "sources", id, null, { url: f.url, refresh_minutes: LIVE_MINUTES, added: true });
      } else {
        await intelPool.query(`UPDATE ${ops("sources")} SET refresh_minutes = ?, description = COALESCE(description, ?) WHERE source_id = ?`,
          [LIVE_MINUTES, LIVE_NOTE, s.source_id]);
        await audit("live-lane", "live-lane:setup", "sources", s.source_id, { refresh_minutes: s.refresh_minutes }, { url: f.url, refresh_minutes: LIVE_MINUTES });
      }
    }
  })().catch((e) => {
    console.warn(`[live] news feeds not set up: ${(e as Error).message}`);
    global.__liveNewsSetup = undefined; // tried again at the next sweep
  });
  return global.__liveNewsSetup;
}

/** The newest item id before a sweep, so newsAfterSweep can tell what the sweep added. */
export async function newsMark(): Promise<number> {
  const [r] = await q(`SELECT COALESCE(MAX(item_id), 0) AS id FROM ${ops("source_items")}`).catch(() => [{ id: 0 }]);
  return Number(r?.id ?? 0);
}

/**
 * After a sweep of the added sources: new items reach the console. Civic-issue reports (a flooded road, a fire) are
 * announced with a toast; general news is shown at the next refresh without one.
 */
export async function newsAfterSweep(before: number): Promise<void> {
  const [r] = await q(`SELECT COUNT(*) AS n, COALESCE(SUM(is_incident), 0) AS civic FROM ${ops("source_items")} WHERE item_id > ?`, [before]);
  const n = Number(r?.n ?? 0), civic = Number(r?.civic ?? 0);
  const s = live();
  s.news.checkedAt = istNow();
  if (!n) return;
  s.news.added += n;
  console.log(`[live] news: ${n} new item${n === 1 ? "" : "s"} from the added sources, ${civic} about civic issues`);
  if (civic) markLive("news", `${civic} new news report${civic === 1 ? "" : "s"} about civic issues`);
  else bumpDataEpoch();
}
