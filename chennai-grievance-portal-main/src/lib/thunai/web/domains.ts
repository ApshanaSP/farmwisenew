/**
 * Jarvis v6, Phase 4: which hosts the web reader may fetch. Server only.
 *
 * The list is the owner-editable config/jarvis-web-domains.json (JARVIS_WEB_DOMAINS names another file), re-read at most once a
 * minute; when it is missing or invalid the same defaults in code are used. Rules: a host entry "example.com" covers example.com
 * and www.example.com; "*.example.com" covers example.com and every name under it. Deny wins over allow, and a host on neither
 * list is refused (the OWASP SSRF sheet prefers an allow-list: docs/jarvis/v6-research/40-news-web.md section 3).
 */
import fs from "fs";
import path from "path";
import { z } from "zod";

export interface Outlet { id: string; name: string; nameTa: string; lang: "en" | "ta"; domains: string[]; feeds: string[] }
export interface Source { name: string; nameTa: string; url: string }
export interface DomainList {
  allow: string[];
  deny: string[];
  outlets: Outlet[];
  sources: { sachet: Source; wikipedia: Source };
  /** documented public API paths read although robots.txt keeps crawlers out of them (owner decision), by exact host */
  robotsExempt: Record<string, string[]>;
  contact: string;
}

const OutletZ = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,32}$/), name: z.string().min(1).max(60), nameTa: z.string().min(1).max(80), lang: z.enum(["en", "ta"]),
  domains: z.array(z.string().min(3).max(100)).min(1).max(8), feeds: z.array(z.string().url().max(300)).max(6)
});
const SourceZ = z.object({ name: z.string().min(1).max(80), nameTa: z.string().min(1).max(120), url: z.string().url().max(300) });
const ListZ = z.object({
  allow: z.array(z.string().min(1).max(100)).max(200),
  deny: z.array(z.string().min(1).max(100)).max(200),
  outlets: z.array(OutletZ).max(40),
  sources: z.object({ sachet: SourceZ, wikipedia: SourceZ }),
  robotsExempt: z.record(z.array(z.string().startsWith("/").max(200)).max(10)).default({}),
  contact: z.string().max(200).default("")
});

/** The defaults, the same as the committed config/jarvis-web-domains.json (the outlets and feeds the v6 research probed on 17 Nov 2026). */
export const DEFAULT_DOMAINS: DomainList = {
  allow: ["thehindu.com", "timesofindia.indiatimes.com", "dtnext.in", "newindianexpress.com", "dinamani.com", "dinamalar.com", "dailythanthi.com",
    "sachet.ndma.gov.in", "mausam.imd.gov.in", "*.wikipedia.org"],
  deny: ["news.google.com", "api.gdeltproject.org", "localhost", "*.local", "*.internal"],
  outlets: [
    { id: "thehindu", name: "The Hindu", nameTa: "தி இந்து", lang: "en", domains: ["thehindu.com"], feeds: ["https://www.thehindu.com/news/cities/chennai/feeder/default.rss"] },
    { id: "toi", name: "The Times of India", nameTa: "டைம்ஸ் ஆஃப் இந்தியா", lang: "en", domains: ["timesofindia.indiatimes.com"], feeds: ["https://timesofindia.indiatimes.com/rssfeeds/2950623.cms"] },
    { id: "dtnext", name: "DT Next", nameTa: "டிடி நெக்ஸ்ட்", lang: "en", domains: ["dtnext.in"], feeds: ["https://www.dtnext.in/api/v1/collections/newschennai-news.rss"] },
    { id: "nie", name: "The New Indian Express", nameTa: "நியூ இந்தியன் எக்ஸ்பிரஸ்", lang: "en", domains: ["newindianexpress.com"], feeds: ["https://www.newindianexpress.com/api/v1/collections/chennai-cities.rss"] },
    { id: "dinamani", name: "Dinamani", nameTa: "தினமணி", lang: "ta", domains: ["dinamani.com"], feeds: ["https://www.dinamani.com/stories.rss"] },
    { id: "dinamalar", name: "Dinamalar", nameTa: "தினமலர்", lang: "ta", domains: ["dinamalar.com"], feeds: ["https://www.dinamalar.com/sitemap_latest.xml"] },
    { id: "dailythanthi", name: "Daily Thanthi", nameTa: "தினத்தந்தி", lang: "ta", domains: ["dailythanthi.com"], feeds: ["https://www.dailythanthi.com/api/v1/collections/tamilnadu-news.rss"] }
  ],
  sources: {
    sachet: { name: "the NDMA alert feed", nameTa: "தேசிய பேரிடர் மேலாண்மை ஆணையத்தின் எச்சரிக்கை தளம்", url: "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml" },
    wikipedia: { name: "Wikipedia", nameTa: "விக்கிப்பீடியா", url: "https://en.wikipedia.org" }
  },
  robotsExempt: { "en.wikipedia.org": ["/api/rest_v1/page/summary/", "/w/rest.php/v1/search/page"] },
  contact: ""
};

const CONFIG = () => process.env.JARVIS_WEB_DOMAINS || path.join(process.cwd(), "config", "jarvis-web-domains.json");
let loaded: { at: number; list: DomainList; from: "file" | "default" } | null = null;

const normHost = (h: string) => h.trim().toLowerCase().replace(/\.$/, "");

/** Parses a list (an owner's file): the list, or null when it is not one. */
export function parseDomains(raw: unknown): DomainList | null {
  const r = ListZ.safeParse(raw);
  if (!r.success) return null;
  return { ...r.data, allow: r.data.allow.map(normHost), deny: r.data.deny.map(normHost), outlets: r.data.outlets.map((o) => ({ ...o, domains: o.domains.map(normHost) })) };
}

/** The list in force: the owner's file (re-read at most once a minute), else the defaults. */
export function loadDomains(now = Date.now()): DomainList {
  if (loaded && now - loaded.at >= 0 && now - loaded.at < 60_000) return loaded.list;
  let list: DomainList | null = null;
  try { list = parseDomains(JSON.parse(fs.readFileSync(CONFIG(), "utf8"))); } catch { list = null; }
  if (!list && loaded?.from !== "default") console.warn("[jarvis web] the web domain list is missing or invalid: the defaults in code are used");
  loaded = { at: now, list: list ?? DEFAULT_DOMAINS, from: list ? "file" : "default" };
  return loaded.list;
}

/** Does a list entry cover this host? */
export function covers(entry: string, host: string): boolean {
  const h = normHost(host);
  if (entry.startsWith("*.")) { const base = entry.slice(2); return h === base || h.endsWith(`.${base}`); }
  return h === entry || h === `www.${entry}`;
}

export type HostVerdict = "allow" | "deny" | "unknown";
/** allow, deny or unknown for a host name: deny wins over allow; anything not allowed is refused by the caller. */
export function hostVerdict(host: string, list: DomainList): HostVerdict {
  const h = normHost(host.replace(/^\[|\]$/g, ""));
  if (!h) return "unknown";
  if (list.deny.some((d) => covers(d, h))) return "deny";
  return list.allow.some((a) => covers(a, h)) ? "allow" : "unknown";
}

/** The outlet a host belongs to (by its domains), or null. */
export function outletOfHost(host: string, list: DomainList): Outlet | null {
  const h = normHost(host);
  return list.outlets.find((o) => o.domains.some((d) => h === d || h.endsWith(`.${d}`))) ?? null;
}
export function outletOfUrl(url: string, list: DomainList): Outlet | null {
  try { return outletOfHost(new URL(url).hostname, list); } catch { return null; }
}
/** The outlet a stored publisher name or domain names ("The Hindu", "thehindu.com"), or null. */
export function outletByName(name: string | null | undefined, domain: string | null | undefined, list: DomainList): Outlet | null {
  if (domain) { const o = outletOfHost(String(domain).replace(/^https?:\/\//, "").replace(/\/.*$/, ""), list); if (o) return o; }
  const n = String(name ?? "").toLowerCase().replace(/^the\s+/, "").replace(/\s+-\s*$/, "").trim();
  if (!n) return null;
  return list.outlets.find((o) => o.name.toLowerCase().replace(/^the\s+/, "") === n || o.nameTa === name) ?? null;
}

/** Is this URL's path a documented API path the owner exempted from robots.txt (exact host, path prefix)? */
export function robotsExempt(u: URL, list: DomainList): boolean {
  return (list.robotsExempt[u.hostname.toLowerCase()] ?? []).some((p) => u.pathname.startsWith(p));
}

/** Tests: forget the loaded file. */
export function resetDomains() { loaded = null; }
