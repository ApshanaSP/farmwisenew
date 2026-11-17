/**
 * Tests only: a fake web for lib/thunai/web. Every request the reader makes is recorded (URL, method, headers, body), so a test can
 * check what would have left the server; DNS answers come from a table. No socket is ever opened.
 */
import type { Lookup, Transport } from "./fetch";

export interface FakeRoute {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  /** a redirect: sets status 302 (unless given) and Location */
  location?: string;
  /** never answer (headers never arrive) until the request is aborted */
  hang?: boolean;
  /** send the headers and a first chunk, then never finish the body until aborted */
  stall?: boolean;
  /** answer after this many ms */
  delayMs?: number;
}
export interface FakeCall { url: string; method: string; headers: Record<string, string>; body: string }

const abortError = () => Object.assign(new Error("The operation was aborted."), { name: "AbortError" });

export function fakeWeb(routes: Record<string, FakeRoute | ((url: string) => FakeRoute)>, dns: Record<string, string[]> = {}) {
  const calls: FakeCall[] = [];
  const lookups: string[] = [];
  const fetch: Transport = async (url, init) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => { headers[k] = v; });
    calls.push({ url, method: String(init.method ?? "GET"), headers, body: init.body == null ? "" : String(init.body) });
    const hit = routes[url] ?? (url.endsWith("/robots.txt") ? { status: 404, body: "" } : { status: 404, body: "not here" });
    const r = typeof hit === "function" ? hit(url) : hit;
    const signal = init.signal;
    if (signal?.aborted) throw abortError();
    if (r.hang) return new Promise<Response>((_res, rej) => signal?.addEventListener("abort", () => rej(abortError()), { once: true }));
    if (r.delayMs) await new Promise<void>((res, rej) => { const t = setTimeout(res, r.delayMs); signal?.addEventListener("abort", () => { clearTimeout(t); rej(abortError()); }, { once: true }); });
    const h = new Headers(r.headers ?? {});
    if (r.location) h.set("location", r.location);
    if (!h.has("content-type")) h.set("content-type", url.endsWith(".txt") ? "text/plain" : "text/html; charset=utf-8");
    const status = r.status ?? (r.location ? 302 : 200);
    if (r.stall) {
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode("<html><body><p>"));
          signal?.addEventListener("abort", () => { try { c.error(abortError()); } catch { /* closed */ } }, { once: true });
        }
      });
      return new Response(stream, { status, headers: h });
    }
    const body = r.body == null ? "" : r.body;
    return new Response(status === 204 || status === 304 || (status >= 300 && status < 400) ? null : typeof body === "string" ? body : new Uint8Array(body), { status, headers: h });
  };
  const lookup: Lookup = async (host) => {
    lookups.push(host);
    // a public documentation-free address by default (93.184.216.34 is public)
    return dns[host] ?? ["93.184.216.34"];
  };
  return { fetch, lookup, calls, lookups };
}

/** A news page Readability reads: a title, a publication time and paragraphs inside <article>, plus anything extra. */
export function articleHtml(o: { title: string; published?: string; paragraphs: string[]; extra?: string; head?: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${o.title}</title>
${o.published ? `<meta property="article:published_time" content="${o.published}">` : ""}${o.head ?? ""}</head>
<body><header><nav><a href="/">Home</a> <a href="/news">News</a></nav></header>
<main><article><h1>${o.title}</h1>
${o.paragraphs.map((p) => `<p>${p}</p>`).join("\n")}
${o.extra ?? ""}
</article></main><footer>Copyright the outlet</footer></body></html>`;
}

/** An RSS 2.0 feed of the given items. */
export function rssFeed(items: { title: string; link: string; pubDate?: string; description?: string; author?: string }[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Feed</title>
${items.map((i) => `<item><title><![CDATA[${i.title}]]></title><link>${i.link}</link>${i.pubDate ? `<pubDate>${i.pubDate}</pubDate>` : ""}${i.author ? `<author>${i.author}</author>` : ""}<description><![CDATA[${i.description ?? ""}]]></description></item>`).join("\n")}
</channel></rss>`;
}
