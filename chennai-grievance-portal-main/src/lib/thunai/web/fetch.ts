/**
 * Jarvis v6, Phase 4: the one way the web reader fetches anything. Server only.
 *
 * Every request, and every redirect hop, passes all of these, in this order:
 *   1. http(s) only, no user:password in the link;
 *   2. the host is on the owner's allow-list and not on its deny-list (domains.ts); an unknown host is refused before any DNS
 *      lookup, so a hostile page cannot even make the server resolve a name of its choosing;
 *   3. robots.txt allows the crawler token fulltext.ts announces (ChennaiDistrictNewsDataset), read with fulltext.ts's own parser
 *      (RFC 9309: a 4xx robots.txt allows all; a 5xx, a timeout or an unreachable one disallows all); an API path the owner
 *      exempted (domains.ts robotsExempt) is the only exception;
 *   4. lib/netsafe.ts: every DNS answer must be public (private, loopback, link-local, CGNAT, multicast, reserved, IPv4 inside IPv6);
 *   5. the connection goes to an address that was checked: lib/studio/fetchurl.ts pinnedFetchWith, whose lookup here refuses any
 *      private answer outright (no second, unchecked lookup: no DNS rebinding; STUDIO_ALLOW_HOSTS opens nothing here);
 *   6. caps: at most 5 redirects, 2 MB of (decoded) body, 4 s to the response headers, 6 s in all (CAPS).
 * Redirects are followed by hand (netsafe safeFetch), each hop through all six checks. Links inside a page are never fetched:
 * nothing here reads a page for links.
 *
 * Page content is never written to disk or logged: only the in-memory caches below hold it (10 minutes, a few MB), and telemetry
 * gets counts, ms, a status code and the host name only.
 */
import dns from "dns/promises";
import { performance } from "perf_hooks";
import { allowed as robotsAllowed, AGENT, robotsRules, UA, type Rule } from "@/lib/collector/pageread";
import { UnsafeUrlError, assertPublicUrl, isPrivateIp, safeFetch } from "@/lib/netsafe";
import { telemetry } from "@/lib/thunai/telemetry";
import { type DomainList, hostVerdict, loadDomains, robotsExempt } from "./domains";

/** The caps the brief sets (v6 Phase 4): 2 MB, 6 s in all, 4 s to the first byte, 5 redirects; a feed gets 2.5 s. */
export const CAPS = { maxBytes: 2 * 1024 * 1024, totalMs: 6_000, firstByteMs: 4_000, maxHops: 5, feedMs: 2_500 } as const;
export type Caps = { maxBytes: number; totalMs: number; firstByteMs: number; maxHops: number; feedMs: number };
/** How long a read page, a feed or a robots.txt is kept in memory. */
export const CACHE_MS = 10 * 60_000;
export const CACHE_BYTES = 4 * 1024 * 1024;
const ROBOTS_MS = 60 * 60_000;

export type Lookup = (host: string) => Promise<string[]>;
export type Transport = (url: string, init: RequestInit) => Promise<Response>;
type Scalar = string | number | boolean | null | undefined;

/** What every exported function of the web reader takes; each default is the safe one. */
export interface WebDeps {
  /** the HTTP transport (tests pass a fake); default: a connection pinned to the checked address (pinnedFetchWith) */
  fetch?: Transport;
  /** DNS (tests pass a fake); default: the system resolver */
  lookup?: Lookup;
  /** the clock for caches and relative times; default Date.now */
  now?: () => number;
  /** the allow/deny list; default: config/jarvis-web-domains.json, else the defaults in code */
  domains?: DomainList;
  /** the caller gave up (the Collector spoke again) */
  signal?: AbortSignal;
  /** tighter caps (tests); never looser than CAPS in the app */
  caps?: Partial<Caps>;
  /** where counts go; default lib/thunai/telemetry (codes only) */
  telemetry?: (event: string, data: Record<string, Scalar>) => void;
}

export type WebStatus = "ok" | "invalid" | "scheme" | "denied" | "unknown_host" | "private" | "dns" | "redirects" | "robots" | "timeout"
  | "too_large" | "http" | "network" | "aborted" | "not_text" | "no_text";

export interface Got {
  status: WebStatus;
  url: string;
  finalUrl: string;
  host: string;
  httpStatus: number | null;
  contentType: string;
  body: string;
  bytes: number;
  /** redirects followed */
  hops: number;
  ms: number;
}

export type Kind = "page" | "feed" | "robots" | "api";
export interface GetHow {
  kind: Kind;
  /** check robots.txt (default true; robots.txt itself is fetched without) */
  robots?: boolean;
  userAgent: string;
  accept?: string;
  /** absolute performance.now() deadline shared by a whole read; default: now + caps.totalMs */
  deadlineAt?: number;
  /** robots.txt: read the first bytes and stop instead of refusing a long file */
  truncateOk?: number;
}

// ------------------------------------------------------------------ caches --

interface Entry<V> { at: number; v: V; bytes: number }
/** A small time-limited, size-limited map (oldest first out). In memory only. */
export class TtlCache<V> {
  private map = new Map<string, Entry<V>>();
  private size = 0;
  constructor(private ttl: number, private maxBytes: number) {}
  get(k: string, now: number): V | null {
    const e = this.map.get(k);
    if (!e) return null;
    if (now - e.at >= this.ttl || now < e.at) { this.drop(k); return null; }
    return e.v;
  }
  set(k: string, v: V, bytes: number, now: number, ttl?: number) {
    if (bytes > this.maxBytes) return;
    this.drop(k);
    // a shorter life for an entry (a failure): stored as if older
    this.map.set(k, { at: ttl != null ? now - (this.ttl - ttl) : now, v, bytes });
    this.size += bytes;
    for (const key of this.map.keys()) { if (this.size <= this.maxBytes) break; this.drop(key); }
  }
  get bytes() { return this.size; }
  get count() { return this.map.size; }
  clear() { this.map.clear(); this.size = 0; }
  private drop(k: string) { const e = this.map.get(k); if (e) { this.size -= e.bytes; this.map.delete(k); } }
}

type RobotsVerdict = Rule[] | "all" | "none";
interface Caches { pages: TtlCache<unknown>; feeds: TtlCache<unknown>; robots: TtlCache<RobotsVerdict>; busy: Map<string, Promise<RobotsVerdict>> }
declare global {
  // eslint-disable-next-line no-var
  var __thunaiWeb: Caches | undefined;
}
/** One set of caches per server process (kept across Next's dev reloads). */
export const caches: Caches = (globalThis.__thunaiWeb ??= {
  pages: new TtlCache(CACHE_MS, CACHE_BYTES), feeds: new TtlCache(CACHE_MS, CACHE_BYTES), robots: new TtlCache(ROBOTS_MS, 1024 * 1024), busy: new Map()
});
/** Tests: forget every cached page, feed and robots.txt. */
export function clearWebCache() { caches.pages.clear(); caches.feeds.clear(); caches.robots.clear(); caches.busy.clear(); }

// ---------------------------------------------------------------- helpers --

const sysLookup: Lookup = (host) => dns.lookup(host, { all: true, verbatim: true }).then((l) => l.map((a) => a.address));
export const clockOf = (o: WebDeps) => o.now ?? Date.now;
export const listOf = (o: WebDeps) => o.domains ?? loadDomains(clockOf(o)());
export const capsOf = (o: WebDeps): Caps => ({ ...CAPS, ...(o.caps ?? {}) });
export function tele(o: WebDeps, event: string, data: Record<string, Scalar>) {
  try { (o.telemetry ?? telemetry)(event, data); } catch { /* telemetry never reaches a read */ }
}

/** A refusal by the web reader's own rules (not the network's). */
class Refused extends Error { constructor(public status: WebStatus) { super(status); } }
/** netsafe's refusal as a status */
function unsafeStatus(e: unknown): WebStatus {
  if (e instanceof Refused) return e.status;
  if (!(e instanceof UnsafeUrlError)) return "network";
  return e.code === "private" ? "private" : e.code === "dns" ? "dns" : e.code === "redirects" ? "redirects" : /^Only http/.test(e.message) ? "scheme" : "invalid";
}

/** Checks 1 and 2: scheme, sign-in in the link, the allow/deny list. A status, or null when the URL may go on. */
export function gateUrl(u: URL, list: DomainList): WebStatus | null {
  if (u.protocol !== "http:" && u.protocol !== "https:") return "scheme";
  if (u.username || u.password) return "invalid";
  const v = hostVerdict(u.hostname, list);
  return v === "deny" ? "denied" : v === "unknown" ? "unknown_host" : null;
}

/** The URL a cache keys on: no fragment, no tracking parameters, no www, no trailing slash, the AMP copy as the page. */
export function normUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|amp$|from$|ito$)/i.test(k)) u.searchParams.delete(k);
    const path = u.pathname.replace(/\/amp(\/|$)/, "/").replace(/\.amp$/, "").replace(/\/+$/, "") || "/";
    return `${u.protocol}//${u.hostname.replace(/^www\./, "").toLowerCase()}${path}${u.searchParams.toString() ? `?${u.searchParams}` : ""}`;
  } catch { return raw; }
}

function decode(buf: Buffer, contentType: string): string {
  const cs = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase();
  if (cs && cs !== "utf-8" && cs !== "utf8") { try { return new TextDecoder(cs).decode(buf); } catch { /* an unknown label: UTF-8 */ } }
  return buf.toString("utf8");
}

// ----------------------------------------------------------------- robots --

/** Check 3: may the crawler read this URL? Cached per origin for an hour (a failure for two minutes). */
export async function robotsOk(u: URL, o: WebDeps, deadlineAt: number): Promise<boolean> {
  const list = listOf(o);
  if (robotsExempt(u, list)) return true;
  const origin = u.origin, now = clockOf(o)();
  let verdict = caches.robots.get(origin, now);
  if (!verdict) {
    let p = caches.busy.get(origin);
    if (!p) {
      p = (async (): Promise<RobotsVerdict> => {
        const got = await webGet(`${origin}/robots.txt`, o, { kind: "robots", robots: false, userAgent: UA,
          accept: "text/plain,*/*;q=0.5", deadlineAt: Math.min(deadlineAt, performance.now() + 2_500), truncateOk: 512 * 1024 });
        // RFC 9309: 2xx follow the rules; 4xx "unavailable" = may access; 5xx or no answer "unreachable" = complete disallow
        const v: RobotsVerdict = got.status === "ok" ? robotsRules(got.body).rules
          : got.status === "http" && got.httpStatus != null && got.httpStatus >= 400 && got.httpStatus < 500 ? "all" : "none";
        // our own budget running out says nothing about the site: not remembered
        if (got.status !== "timeout" && got.status !== "aborted") {
          caches.robots.set(origin, v, got.status === "ok" ? Math.min(got.body.length, 512 * 1024) : 16, clockOf(o)(), v === "none" ? 2 * 60_000 : undefined);
        }
        return v;
      })().finally(() => caches.busy.delete(origin));
      caches.busy.set(origin, p);
    }
    verdict = await p;
  }
  return verdict === "all" ? true : verdict === "none" ? false : robotsAllowed(verdict, u.toString());
}
/** The crawler token robots.txt is read for. */
export const ROBOTS_TOKEN = AGENT;

// ------------------------------------------------------------------- get --

/** Checks 4 and 5: the default transport, a connection pinned to an address checked public (pinnedFetchWith). */
function pinnedTransport(look: Lookup, onPrivate: () => void): Transport {
  // the pinned connection's own lookup refuses a private answer whatever STUDIO_ALLOW_HOSTS says (a name that turned private
  // between the first check and the connection: DNS rebinding)
  const strict: Lookup = async (h) => {
    const a = await look(h);
    if (!a.length || a.some(isPrivateIp)) { onPrivate(); throw new Error("private address"); }
    return a;
  };
  return async (url, init) => (await import("@/lib/studio/fetchurl")).pinnedFetchWith(strict, url, init);
}

/**
 * One GET through every check above. Never throws: the status says what happened. `body` is the decoded text (only for "ok"),
 * kept in memory by the caller at most.
 */
export async function webGet(raw: string, o: WebDeps, how: GetHow): Promise<Got> {
  const t0 = performance.now();
  const caps = capsOf(o);
  const list = listOf(o);
  // set from inside the hops and timers
  const st = { hops: -1, host: "", refusal: null as WebStatus | null, timedOut: false };
  const done = (status: WebStatus, extra: Partial<Got> = {}): Got => {
    const g: Got = { status, url: raw, finalUrl: extra.finalUrl ?? raw, host: st.host, httpStatus: null, contentType: "", body: "", bytes: 0, hops: Math.max(0, st.hops),
      ms: Math.round(performance.now() - t0), ...extra };
    tele(o, "web_get", { kind: how.kind, why: status, ms: g.ms, bytes: g.bytes, hop: g.hops, host: g.host || undefined, status: g.httpStatus ?? undefined });
    return g;
  };
  let u: URL;
  try { u = new URL(raw); } catch { return done("invalid"); }
  st.host = u.hostname;
  const first = gateUrl(u, list);
  if (first) return done(first);
  const deadlineAt = how.deadlineAt ?? t0 + caps.totalMs;
  if (o.signal?.aborted) return done("aborted");
  if (deadlineAt - performance.now() <= 0) return done("timeout");
  const look = o.lookup ?? sysLookup;
  // netsafe's DNS check (check 4) asks the allow-list first, so a redirect to an unknown name is never even looked up
  const guarded: Lookup = async (h) => {
    const v = hostVerdict(h, list);
    if (v !== "allow") { const why: WebStatus = v === "deny" ? "denied" : "unknown_host"; st.refusal = why; throw new Refused(why); }
    return look(h);
  };
  // check 4 before robots.txt, so a private address is refused as such and nothing at all is sent to it
  try { await assertPublicUrl(u, { lookup: guarded }); } catch (e) { return done(st.refusal ?? unsafeStatus(e)); }
  if (how.robots !== false && !(await robotsOk(u, o, deadlineAt))) return done(performance.now() >= deadlineAt ? "timeout" : "robots");
  const left = deadlineAt - performance.now();
  if (left <= 0) return done("timeout");

  const deadline = new AbortController();
  const dT = setTimeout(() => { st.timedOut = true; deadline.abort(new Refused("timeout")); }, left);
  const transport = o.fetch ?? pinnedTransport(look, () => { st.refusal = "private"; });
  // checks 1-3 again on every hop (a redirect's target), then the transport with the first-byte timer
  const hop: Transport = async (input, init) => {
    st.hops++;
    const target = new URL(String(input));
    st.host = target.hostname;
    const g = gateUrl(target, list);
    if (g) { st.refusal = g; throw new Refused(g); }
    if (st.hops > 0 && how.robots !== false && !(await robotsOk(target, o, deadlineAt))) { st.refusal = "robots"; throw new Refused("robots"); }
    const fb = new AbortController();
    const fbT = setTimeout(() => { st.timedOut = true; fb.abort(new Refused("timeout")); }, Math.max(1, Math.min(caps.firstByteMs, deadlineAt - performance.now())));
    const signals = [init.signal, deadline.signal, fb.signal, o.signal].filter((s): s is AbortSignal => !!s);
    try { return await transport(target.toString(), { ...init, signal: AbortSignal.any(signals) }); }
    finally { clearTimeout(fbT); }
  };
  try {
    const r = await safeFetch(u, {
      fetchImpl: hop as unknown as typeof fetch,
      lookup: guarded,
      maxHops: caps.maxHops, timeout: Math.ceil(left) + 1_000, maxBytes: how.truncateOk ?? caps.maxBytes,
      onTooLarge: how.truncateOk ? undefined : () => new Refused("too_large"),
      headers: { "User-Agent": how.userAgent, Accept: how.accept ?? "*/*", "Accept-Language": "en-IN,en;q=0.9,ta;q=0.8" }
    });
    const ct = r.res.headers.get("content-type") ?? "";
    const finalUrl = r.url;
    st.host = new URL(finalUrl).hostname;
    if (!r.res.ok) { try { await r.res.body?.cancel(); } catch { /* drained */ } return done("http", { httpStatus: r.res.status, finalUrl, contentType: ct }); }
    return done("ok", { httpStatus: r.res.status, finalUrl, contentType: ct, body: decode(r.buf, ct), bytes: r.buf.length });
  } catch (e) {
    if (st.refusal) return done(st.refusal);
    if (e instanceof Refused) return done(e.status);
    if (o.signal?.aborted) return done("aborted");
    if (st.timedOut || (e as Error)?.name === "TimeoutError") return done("timeout");
    if ((e as Error)?.name === "AbortError") return done("aborted");
    if (e instanceof UnsafeUrlError) return done(unsafeStatus(e));
    if ((e as { code?: string })?.code === "private") return done("private");
    return done("network");
  } finally {
    clearTimeout(dT);
  }
}
