/**
 * v6 Phase 4, the web reader's SSRF guard: nothing it fetches may reach this machine, the office network or cloud metadata, by any
 * scheme, address form, DNS answer or redirect. Every case is checked twice where it matters: with the default allow-list (the
 * host is refused before any DNS lookup) and with a list that ALLOWS the hostile host, so the address checks themselves are
 * shown to hold (defence in depth). No socket is opened: a fake transport records every request.
 */
import https from "node:https";
import http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DOMAINS, type DomainList } from "./domains";
import { articleHtml, fakeWeb } from "./fake";
import { clearWebCache, webGet } from "./fetch";
import { readArticle } from "./read";

const quiet = { telemetry: () => {} };
const PAGE = articleHtml({ title: "Rain lashes Chennai", paragraphs: ["Heavy rain lashed Chennai on Monday, and the Corporation pumped water out of 40 subways in Velachery and Adyar. ".repeat(4)] });

beforeEach(() => clearWebCache());
afterEach(() => vi.restoreAllMocks());

const HOSTILE = [
  "file:///etc/passwd", "file://C:/Windows/win.ini", "ftp://ftp.thehindu.com/a.txt", "data:text/html,<p>hi</p>", "gopher://www.thehindu.com/", "javascript:alert(1)",
  "http://127.0.0.1/", "http://127.0.0.1:3011/api/dev/thunai/brief", "http://localhost/", "http://localhost:3012/", "http://10.0.0.5/", "http://172.16.0.9/",
  "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://[fc00::1]/", "http://[fd12:3456::1]/", "http://[fe80::1]/",
  "http://[::ffff:127.0.0.1]/", "http://[::ffff:a9fe:a9fe]/", "http://0.0.0.0/", "http://2130706433/", "http://0x7f000001/", "http://100.64.0.1/",
  "http://metadata.google.internal/", "http://user:pass@www.thehindu.com/news/"
];

describe("web reader SSRF: the default allow-list refuses before any request or DNS lookup", () => {
  it.each(HOSTILE)("%s is refused, nothing is sent and no name is looked up", async (url) => {
    const web = fakeWeb({});
    const r = await readArticle(url, { fetch: web.fetch, lookup: web.lookup, ...quiet });
    expect(r.status).not.toBe("ok");
    expect(["scheme", "invalid", "unknown_host", "denied"]).toContain(r.status);
    expect(r.text).toBe("");
    expect(web.calls).toEqual([]);
    expect(web.lookups).toEqual([]);
  });
});

describe("web reader SSRF: with the hostile host ALLOWED, the address checks still refuse it", () => {
  const ADDR = HOSTILE.filter((u) => /^http:\/\/(?!user:)/.test(u));
  const open = (urls: string[]): DomainList => ({ ...DEFAULT_DOMAINS, deny: [], allow: [...DEFAULT_DOMAINS.allow, ...urls.map((u) => new URL(u).hostname.replace(/^\[|\]$/g, ""))] });
  it.each(ADDR)("%s is refused as private (no request is made)", async (url) => {
    const web = fakeWeb({});
    const r = await readArticle(url, { fetch: web.fetch, lookup: web.lookup, domains: open([url]), ...quiet });
    expect(r.status).toBe("private");
    expect(web.calls).toEqual([]);
  });

  it("a public, allowed host name that RESOLVES to a private address is refused (every answer is checked)", async () => {
    for (const answer of [["10.1.2.3"], ["127.0.0.1"], ["169.254.169.254"], ["93.184.216.34", "192.168.0.10"], ["::1"], ["fd00::5"], ["::ffff:10.0.0.1"]]) {
      clearWebCache();
      const web = fakeWeb({ "https://www.thehindu.com/news/a": { body: PAGE } }, { "www.thehindu.com": answer });
      const r = await readArticle("https://www.thehindu.com/news/a", { fetch: web.fetch, lookup: web.lookup, ...quiet });
      expect(r.status, answer.join(",")).toBe("private");
      expect(web.calls).toEqual([]);
    }
  });

  it("a redirect to a private address, to localhost, to another scheme or to an unknown host is refused at that hop", async () => {
    const cases: [string, string][] = [["http://169.254.169.254/latest/meta-data/", "private"], ["http://127.0.0.1:3011/", "private"], ["http://localhost:8080/", "private"],
      ["http://[::1]/", "private"], ["file:///etc/passwd", "scheme"], ["https://internal.example/x", "unknown_host"], ["https://news.google.com/rss/articles/x", "denied"]];
    for (const [target, status] of cases) {
      clearWebCache();
      const web = fakeWeb({ "https://www.thehindu.com/news/a": { location: target } });
      const list: DomainList = { ...DEFAULT_DOMAINS, allow: [...DEFAULT_DOMAINS.allow, "127.0.0.1", "localhost", "169.254.169.254", "::1"], deny: ["news.google.com"] };
      const r = await readArticle("https://www.thehindu.com/news/a", { fetch: web.fetch, lookup: web.lookup, domains: list, ...quiet });
      expect(r.status, target).toBe(status);
      // only robots.txt and the first page were requested: never the redirect's target
      expect(web.calls.map((c) => c.url), target).toEqual(["https://www.thehindu.com/robots.txt", "https://www.thehindu.com/news/a"]);
      // an unknown host is not even looked up
      expect(web.lookups.some((h) => /internal\.example|google/.test(h))).toBe(false);
    }
  });

  it("a redirect to an allowed host that resolves to a private address is refused", async () => {
    const web = fakeWeb({ "https://www.thehindu.com/news/a": { location: "https://www.dtnext.in/x" }, "https://www.dtnext.in/x": { body: PAGE } }, { "www.dtnext.in": ["10.9.9.9"] });
    const r = await readArticle("https://www.thehindu.com/news/a", { fetch: web.fetch, lookup: web.lookup, ...quiet });
    expect(r.status).toBe("private");
    expect(web.calls.some((c) => c.url.includes("dtnext"))).toBe(false);
  });

  it("more than 5 redirects is refused; 5 are followed", async () => {
    const chain = (n: number) => Object.fromEntries(Array.from({ length: n + 1 }, (_, k) => [`https://www.thehindu.com/r${k}`, k < n ? { location: `https://www.thehindu.com/r${k + 1}` } : { body: PAGE }]));
    let web = fakeWeb(chain(6));
    let r = await readArticle("https://www.thehindu.com/r0", { fetch: web.fetch, lookup: web.lookup, ...quiet });
    expect(r.status).toBe("redirects");
    expect(web.calls.filter((c) => !c.url.endsWith("robots.txt")).length).toBe(6);
    clearWebCache();
    web = fakeWeb(chain(5));
    r = await readArticle("https://www.thehindu.com/r0", { fetch: web.fetch, lookup: web.lookup, ...quiet });
    expect(r.status).toBe("ok");
    expect(r.url).toBe("https://www.thehindu.com/r5");
  });

  it("DNS rebinding: with the default (pinned) transport, a name that answers public to the check and private to the connection reaches nothing", async () => {
    const httpsReq = vi.spyOn(https, "request"), httpReq = vi.spyOn(http, "request");
    let n = 0;
    // public for the reader's own checks, private from the third lookup on: the one the pinned connection itself makes
    const lookup = async () => (++n <= 2 ? ["93.184.216.34"] : ["127.0.0.1"]);
    const domains: DomainList = { ...DEFAULT_DOMAINS, robotsExempt: { "www.thehindu.com": ["/"] } };
    const g = await webGet("https://www.thehindu.com/news/a", { lookup, domains, ...quiet }, { kind: "page", userAgent: "test" });
    expect(g.status).toBe("private");
    expect(n).toBe(3);
    expect(httpsReq).not.toHaveBeenCalled();
    expect(httpReq).not.toHaveBeenCalled();
  });

  it("STUDIO_ALLOW_HOSTS (the Data Studio's private-host allowance) opens nothing to the web reader", async () => {
    vi.stubEnv("STUDIO_ALLOW_HOSTS", "www.thehindu.com,127.0.0.1");
    try {
      const web = fakeWeb({ "https://www.thehindu.com/news/a": { body: PAGE } }, { "www.thehindu.com": ["127.0.0.1"] });
      const r = await readArticle("https://www.thehindu.com/news/a", { fetch: web.fetch, lookup: web.lookup, ...quiet });
      expect(r.status).toBe("private");
      expect(web.calls).toEqual([]);
    } finally { vi.unstubAllEnvs(); }
  });
});
