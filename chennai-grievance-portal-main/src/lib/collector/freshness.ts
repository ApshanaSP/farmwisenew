/**
 * Is a feed behind? A feed is stale when its last successful collection (source_health.last_success_at) is more than
 * twice its expected refresh interval (source_health.freshness_target_min) before now. Only recorded times are used:
 * a feed with no interval is never called stale, and one never collected says so rather than inventing a time.
 *
 * "Now" is the wall clock in IST ("YYYY-MM-DD HH:MM:SS"), as everywhere on the console; this module never changes
 * what "today" is. Pure (no database), so the rule is unit-tested; sources.ts reads the rows.
 */

export interface FeedHealthRow { source: string; okAt: string | null; targetMin: number | null }
export interface StaleFeed { source: string; name: string; minutes: number | null; targetMin: number }

/** The feeds' names as the Collector reads them (also used by the sources dialog). */
export const FEED_LABEL: Record<string, string> = {
  grievance: "Grievance portal", police: "Police reports", pwd: "PWD records", hospital: "Hospitals",
  news: "News", imd: "IMD weather", cpcb: "Air quality (CPCB)", cfm: "Flood monitoring", cmwssb: "Chennai Metro Water reservoirs"
};
export const feedLabel = (s: string) => FEED_LABEL[s] ?? s;

/** Minutes from IST wall-clock string `a` to `b`; null when either is not a date. */
export function minutesBetween(a: string, b: string): number | null {
  const t = (s: string) => new Date(s.slice(0, 19).replace(" ", "T") + "Z").getTime();
  const x = t(a), y = t(b);
  return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / 60_000) : null;
}

/** The IST wall clock now, "YYYY-MM-DD HH:MM:SS". */
export function istNow(ms = Date.now()): string {
  return new Date(ms + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");
}

/** Feeds more than twice their refresh interval behind `now` (or never collected), most behind first. */
export function staleFeeds(rows: FeedHealthRow[], now: string): StaleFeed[] {
  const out: StaleFeed[] = [];
  for (const r of rows) {
    const target = Number(r.targetMin);
    if (!Number.isFinite(target) || target <= 0) continue;
    const minutes = r.okAt ? minutesBetween(r.okAt, now) : null;
    if (r.okAt && (minutes == null || minutes <= 2 * target)) continue;
    out.push({ source: r.source, name: feedLabel(r.source), minutes, targetMin: target });
  }
  return out.sort((a, b) => (b.minutes ?? Infinity) - (a.minutes ?? Infinity));
}

/** "6 hours ago", "45 minutes ago", "3 days ago". */
export function ago(minutes: number): string {
  const u = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"} ago`;
  if (minutes < 90) return u(Math.max(1, Math.round(minutes)), "minute");
  if (minutes < 48 * 60) return u(Math.round(minutes / 60), "hour");
  return u(Math.round(minutes / 1440), "day");
}

/** One feed's warning: "News last collected 6 hours ago; today's view may be incomplete." */
export function freshnessLine(f: StaleFeed, what = "today's view"): string {
  return f.minutes == null
    ? `${f.name} has not been collected yet; ${what} may be incomplete.`
    : `${f.name} last collected ${ago(f.minutes)}; ${what} may be incomplete.`;
}

/** Feeds the console's pages draw on: the incident feeds for the overview, briefing and trends; the environment feeds there. */
const INCIDENT_FEEDS = ["grievance", "police", "pwd", "hospital", "news"];
export const PAGE_FEEDS: Record<string, string[]> = {
  overview: INCIDENT_FEEDS, briefing: INCIDENT_FEEDS, trends: INCIDENT_FEEDS,
  environment: ["imd", "cpcb", "cfm", "cmwssb", "hospital"], studio: []
};

/**
 * The feeds behind an assistant answer, from the tools it ran (and the tables an ad-hoc query read): news tools read
 * the news feed, environment metrics their own feed (`envSource` maps a metric to it), prices and contacts no feed,
 * and everything about incidents the incident feeds.
 */
export function feedsForAnswer(tools: { tool: string; args?: Record<string, unknown> }[], tables: string[] = [],
  envSource: (metric: string) => string | null = () => null): string[] {
  const out = new Set<string>();
  for (const t of tools) {
    if (["mandi_prices", "contacts", "map_geo", "resolve_place", "source_health"].includes(t.tool)) continue;
    if (t.tool === "environment") {
      const s = envSource(String(t.args?.metric ?? ""));
      if (s) out.add(s);
      continue;
    }
    if (["news_gaps", "developing_stories"].includes(t.tool)) { out.add("news"); continue; }
    for (const f of INCIDENT_FEEDS) out.add(f);
  }
  for (const name of tables) {
    const n = name.replace(/^.*\./, "");
    if (n === "documents") out.add("news");
    else if (n === "incidents" || n === "events") for (const f of INCIDENT_FEEDS) out.add(f);
  }
  return [...out];
}
