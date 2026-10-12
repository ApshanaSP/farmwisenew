/**
 * Every outbound fetch of an address a person typed or a feed supplied goes through here, so the server can never be
 * pointed at its own network (cloud metadata at 169.254.169.254, localhost services, the office LAN):
 *
 *   - only http(s), no user:password in the link
 *   - the host's every address must be public: private, loopback, link-local, carrier-grade NAT, multicast and
 *     reserved ranges are refused, including IPv4 written inside IPv6 (::ffff:169.254.169.254, ::ffff:a9fe:a9fe,
 *     ::a9fe:a9fe and the NAT64 prefix 64:ff9b::)
 *   - redirects are followed by hand and every hop is checked the same way; a sign-in (Authorization, Cookie) is
 *     never carried to another origin
 *   - time and size are capped
 *
 * A caller may allow named hosts (Data Studio's STUDIO_ALLOW_HOSTS, a demo department app on this PC). The check runs
 * on the addresses DNS returns just before each request; a name that changes its answer between the check and the
 * connection (DNS rebinding) is not covered, which would need the connection itself to be pinned.
 */
import dns from "dns/promises";
import net from "net";

export type UnsafeCode = "invalid" | "private" | "dns" | "redirects";
export class UnsafeUrlError extends Error {
  constructor(message: string, public code: UnsafeCode) { super(message); }
}

// ------------------------------------------------------------- addresses --

function v4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

/** The eight 16-bit groups of an IPv6 address (a trailing dotted IPv4 becomes the last two), or null. */
function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/%.*$/, "");
  const dotted = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (!net.isIPv4(dotted[1])) return null;
    const [a, b, c, d] = dotted[1].split(".").map(Number);
    s = s.slice(0, -dotted[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const part = (x: string) => (x ? x.split(":") : []);
  const head = part(halves[0]), tail = halves.length === 2 ? part(halves[1]) : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const all = [...head, ...Array(fill).fill("0"), ...tail];
  if (all.length !== 8 || all.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}

/** True for any address the server must not be sent to. Unparseable input counts as private. */
export function isPrivateIp(ip: string): boolean {
  const raw = ip.trim().replace(/^\[|\]$/g, "");
  if (net.isIPv4(raw)) return v4Private(raw);
  const g = v6Groups(raw);
  if (!g) return true;
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  const zero = (n: number) => g.slice(0, n).every((x) => x === 0);
  // IPv4 inside IPv6: mapped ::ffff:a.b.c.d, the old "compatible" ::a.b.c.d, and NAT64 64:ff9b::a.b.c.d
  if (zero(5) && g[5] === 0xffff) return v4Private(v4(g[6], g[7]));
  if (zero(6) && (g[6] !== 0 || g[7] > 1)) return v4Private(v4(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return v4Private(v4(g[6], g[7]));
  if (zero(8)) return true; // ::
  if (zero(7) && g[7] === 1) return true; // ::1
  const top = g[0];
  return (top & 0xfe00) === 0xfc00 // unique local fc00::/7
    || (top & 0xffc0) === 0xfe80 // link-local fe80::/10
    || (top & 0xffc0) === 0xfec0 // site-local fec0::/10
    || (top & 0xff00) === 0xff00 // multicast
    || (top === 0x2001 && g[1] === 0x0db8); // documentation
}

// ------------------------------------------------------------------ hosts --

export interface SafeOptions {
  /** hosts let through even if private (host or host:port), e.g. STUDIO_ALLOW_HOSTS */
  allow?: (u: URL) => boolean;
  /** DNS lookup (tests replace it); all addresses of the name */
  lookup?: (host: string) => Promise<string[]>;
}

const sysLookup = (host: string) => dns.lookup(host, { all: true, verbatim: true }).then((l) => l.map((a) => a.address));

/** Throws UnsafeUrlError unless `u` is a public http(s) address (or an allowed host). */
export async function assertPublicUrl(u: URL, o: SafeOptions = {}): Promise<void> {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new UnsafeUrlError("Only http and https links can be read.", "invalid");
  if (u.username || u.password) throw new UnsafeUrlError("Put the user name and password in the sign-in fields, not in the link.", "invalid");
  if (o.allow?.(u)) return;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host || /^localhost$|\.localhost$|\.local$|\.internal$/i.test(host)) {
    throw new UnsafeUrlError("That link points to this computer or a private network; only public sites can be read.", "private");
  }
  let addrs: string[];
  if (net.isIP(host)) addrs = [host];
  else {
    try { addrs = await (o.lookup ?? sysLookup)(host); } catch { throw new UnsafeUrlError(`The site ${host} could not be found (DNS).`, "dns"); }
  }
  if (!addrs.length) throw new UnsafeUrlError(`The site ${host} could not be found (DNS).`, "dns");
  if (addrs.some(isPrivateIp)) throw new UnsafeUrlError("That link points to a private network address; only public sites can be read.", "private");
}

// ------------------------------------------------------------------ fetch --

export interface SafeFetchOptions extends SafeOptions {
  method?: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
  /** per-hop changes: a sign-in for its own host only (headers, query) */
  prepare?: (u: URL) => { url?: URL; headers?: Record<string, string> } | void;
  timeout?: number;
  maxHops?: number;
  /** stop reading after this many bytes; `truncated` says so (or `onTooLarge` throws) */
  maxBytes?: number;
  onTooLarge?: () => Error;
  /** return the first redirect instead of following it (a login POST: the caller reads its cookie) */
  stopAtRedirect?: boolean;
  /** fetch (tests replace it) */
  fetchImpl?: typeof fetch;
}

export interface SafeFetched { res: Response; url: string; buf: Buffer; truncated: boolean }

const SECRET_HEADERS = /^(authorization|cookie|proxy-authorization)$/i;

/** fetch() for untrusted addresses: every hop checked, credentials kept to their origin, size and time capped. */
export async function safeFetch(url: string | URL, o: SafeFetchOptions = {}): Promise<SafeFetched> {
  let cur: URL;
  try { cur = new URL(String(url)); } catch { throw new UnsafeUrlError("That is not a valid link.", "invalid"); }
  const origin = cur.origin;
  const doFetch = o.fetchImpl ?? fetch;
  let method = o.method ?? "GET", body = o.body ?? null;
  for (let hop = 0; hop <= (o.maxHops ?? 6); hop++) {
    await assertPublicUrl(cur, o);
    const extra = o.prepare?.(cur) || {};
    const target = extra.url ?? cur;
    // a sign-in given for the first address is not sent to another site a redirect leads to
    const base = Object.fromEntries(Object.entries(o.headers ?? {}).filter(([k]) => cur.origin === origin || !SECRET_HEADERS.test(k)));
    const res = await doFetch(target, { method, body, redirect: "manual", signal: AbortSignal.timeout(o.timeout ?? 20_000),
      headers: { ...base, ...(extra.headers ?? {}) }, cache: "no-store" });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      const next = new URL(loc, cur);
      if (o.stopAtRedirect) return { res, url: next.toString(), buf: Buffer.alloc(0), truncated: false };
      try { await res.body?.cancel(); } catch { /* nothing to drain */ }
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) { method = "GET"; body = null; }
      cur = next;
      continue;
    }
    const max = o.maxBytes ?? 6_000_000;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > max && o.onTooLarge) { try { await res.body?.cancel(); } catch { /* ignore */ } throw o.onTooLarge(); }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0, truncated = false;
    if (reader) for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        if (o.onTooLarge) throw o.onTooLarge();
        truncated = true;
        break;
      }
      chunks.push(value);
    }
    return { res, url: cur.toString(), buf: Buffer.concat(chunks), truncated };
  }
  throw new UnsafeUrlError("The link redirects too many times.", "redirects");
}
