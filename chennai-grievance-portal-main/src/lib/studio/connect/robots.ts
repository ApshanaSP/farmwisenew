/**
 * robots.txt: a site's own rules for automated readers. The Studio reads them before it reads a web page by itself
 * (a page, a browser visit, a scheduled refresh) and keeps out of what they disallow. A file the Collector links
 * directly (a CSV, an API answer) is a download they asked for, not a crawl, and is not checked.
 *
 * Rules: the group for "DistrictIQ" if there is one, else "*"; the longest matching Allow / Disallow wins (RFC 9309),
 * with * and $ in paths. An unreachable or missing robots.txt allows everything; one that answers 401/403 is read as
 * "keep out" (RFC 9309, 2.3.1.3).
 */
import { UA, UA_TOKEN } from "@/lib/studio/fetchurl";

interface Group { agents: string[]; rules: { allow: boolean; path: string }[] }
const cache = new Map<string, { at: number; groups: Group[] | "all" | "none" }>();

export function parseRobots(text: string): Group[] {
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase());
      lastWasAgent = true;
    } else if ((k === "allow" || k === "disallow") && cur) {
      lastWasAgent = false;
      if (v || k === "allow") cur.rules.push({ allow: k === "allow", path: v });
    } else lastWasAgent = false;
  }
  return groups;
}

function matches(pattern: string, path: string): boolean {
  if (!pattern) return false;
  const re = new RegExp("^" + pattern.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$|\$$/, "$"));
  return re.test(path);
}

export function allowedBy(groups: Group[], path: string, agent = UA_TOKEN): boolean {
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.toLowerCase().includes(a)));
  const use = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  let best: { allow: boolean; len: number } | null = null;
  for (const g of use) for (const r of g.rules) {
    if (!matches(r.path, path)) continue;
    const len = r.path.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
  }
  return best ? best.allow : true;
}

/** Whether the site's robots.txt lets the Studio read this address (cached for an hour per site). */
export async function robotsAllow(raw: string): Promise<boolean> {
  const u = new URL(raw);
  const key = u.origin;
  let c = cache.get(key);
  if (!c || Date.now() - c.at > 3600_000) {
    let groups: Group[] | "all" | "none" = "all";
    try {
      const r = await fetch(`${u.origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000), redirect: "follow" });
      if (r.status === 401 || r.status === 403) groups = "none";
      else if (r.ok && /text|octet/i.test(r.headers.get("content-type") ?? "text/plain")) groups = parseRobots((await r.text()).slice(0, 500_000));
    } catch { /* unreachable: allowed */ }
    c = { at: Date.now(), groups };
    cache.set(key, c);
  }
  if (c.groups === "all") return true;
  if (c.groups === "none") return false;
  return allowedBy(c.groups, u.pathname + u.search);
}
