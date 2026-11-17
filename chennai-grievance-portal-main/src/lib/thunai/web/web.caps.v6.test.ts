/**
 * v6 Phase 4, the web reader's caps and rules: body size, time to first byte, total time, robots.txt, the 10-minute memory cache
 * (nothing on disk, nothing logged), and the owner's allow/deny list (deny wins; an unknown host is refused). Fake transport only.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DOMAINS, covers, hostVerdict, loadDomains, parseDomains, resetDomains, type DomainList } from "./domains";
import { articleHtml, fakeWeb } from "./fake";
import { CACHE_MS, CAPS, TtlCache, caches, clearWebCache } from "./fetch";
import { readArticle } from "./read";

const quiet = { telemetry: () => {} };
const SENTENCE = "The Greater Chennai Corporation pumped water out of 40 subways in Velachery and Adyar after 12 cm of rain on Monday night.";
const PAGE = articleHtml({ title: "Rain lashes Chennai", published: "2026-11-17T03:30:00Z", paragraphs: [SENTENCE, "Officials said 3 relief camps were opened in Perungudi. ".repeat(3), "Traffic was diverted on the Old Mahabalipuram Road for six hours. ".repeat(3)] });
const URL1 = "https://www.thehindu.com/news/cities/chennai/rain-lashes/article1.ece";

beforeEach(() => { clearWebCache(); resetDomains(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); resetDomains(); });

describe("caps", () => {
  it("are the brief's: 2 MB, 6 s in all, 4 s to the first byte, 5 redirects, 2.5 s a feed; memory cache 10 minutes", () => {
    expect(CAPS).toEqual({ maxBytes: 2 * 1024 * 1024, totalMs: 6000, firstByteMs: 4000, maxHops: 5, feedMs: 2500 });
    expect(CACHE_MS).toBe(600_000);
  });

  it("a body over 2 MB is refused, whether announced (Content-Length) or streamed", async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 10).fill(65);
    for (const headers of [{ "content-length": String(big.length) }, {}] as Record<string, string>[]) {
      clearWebCache();
      const web = fakeWeb({ [URL1]: { body: big, headers } });
      const r = await readArticle(URL1, { fetch: web.fetch, lookup: web.lookup, ...quiet });
      expect(r.status).toBe("too_large");
      expect(r.text).toBe("");
    }
  });

  it("no first byte within the cap: timeout, at the cap", async () => {
    const web = fakeWeb({ [URL1]: { hang: true } });
    const t = Date.now();
    const r = await readArticle(URL1, { fetch: web.fetch, lookup: web.lookup, caps: { firstByteMs: 150, totalMs: 2000 }, ...quiet });
    const ms = Date.now() - t;
    expect(r.status).toBe("timeout");
    expect(ms).toBeGreaterThanOrEqual(120);
    expect(ms).toBeLessThan(1500);
  });

  it("headers in time but a body that never ends: timeout at the total cap", async () => {
    const web = fakeWeb({ [URL1]: { stall: true } });
    const t = Date.now();
    const r = await readArticle(URL1, { fetch: web.fetch, lookup: web.lookup, caps: { firstByteMs: 200, totalMs: 400 }, ...quiet });
    const ms = Date.now() - t;
    expect(r.status).toBe("timeout");
    expect(ms).toBeGreaterThanOrEqual(350);
    expect(ms).toBeLessThan(2000);
  });

  it("a test can only tighten the total cap, never loosen it", async () => {
    const web = fakeWeb({ [URL1]: { body: PAGE } });
    const r = await readArticle(URL1, { fetch: web.fetch, lookup: web.lookup, caps: { totalMs: 60_000 }, ...quiet });
    expect(r.status).toBe("ok");
  });

  it("the caller giving up stops the read", async () => {
    const web = fakeWeb({ [URL1]: { hang: true } });
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 50);
    const r = await readArticle(URL1, { fetch: web.fetch, lookup: web.lookup, signal: ac.signal, ...quiet });
    expect(r.status).toBe("aborted");
  });
});

describe("robots.txt (the crawler token fulltext.ts uses: ChennaiDistrictNewsDataset)", () => {
  it("a Disallow for everyone is honoured: the page is never requested", async () => {
    const web = fakeWeb({ "https://www.thehindu.com/robots.txt": { body: "User-agent: *\nDisallow: /news/\n", headers: { "content-type": "text/plain" } }, [URL1]: { body: PAGE } });
    const r = await readArticle(URL1, { fetch: web.fetch, lookup: web.lookup, ...quiet });
    expect(r.status).toBe("robots");
    expect(web.calls.map((c) => c.url)).toEqual(["https://www.thehindu.com/robots.txt"]);
  });

  it("our own group wins over *, and its Disallow is honoured", async () => {
    const web = fakeWeb({ "https://www.thehindu.com/robots.txt": { body: "User-agent: *\nAllow: /\n\nUser-agent: ChennaiDistrictNewsDataset\nDisallow: /\n" }, [URL1]: { body: PAGE } });
    expect((await readArticle(URL1, { fetch: web.fetch, lookup: web.lookup, ...quiet })).status).toBe("robots");
  });

  it("RFC 9309: a missing robots.txt (4xx) allows; a failing one (5xx) disallows", async () => {
    let web = fakeWeb({ "https://www.thehindu.com/robots.txt": { status: 404 }, [URL1]: { body: PAGE } });
    expect((await readArticle(URL1, { fetch: web.fetch, lookup: web.lookup, ...quiet })).status).toBe("ok");
    clearWebCache();
    web = fakeWeb({ "https://www.thehindu.com/robots.txt": { status: 503 }, [URL1]: { body: PAGE } });
    expect((await readArticle(URL1, { fetch: web.fetch, lookup: web.lookup, ...quiet })).status).toBe("robots");
    expect(web.calls.some((c) => c.url === URL1)).toBe(false);
  });

  it("a redirect into a path the target's robots.txt disallows is refused", async () => {
    const web = fakeWeb({
      [URL1]: { location: "https://www.dinamani.com/story/x" },
      "https://www.dinamani.com/robots.txt": { body: "User-agent: *\nDisallow: /story/\n" },
      "https://www.dinamani.com/story/x": { body: PAGE }
    });
    const r = await readArticle(URL1, { fetch: web.fetch, lookup: web.lookup, ...quiet });
    expect(r.status).toBe("robots");
    expect(web.calls.some((c) => c.url === "https://www.dinamani.com/story/x")).toBe(false);
  });

  it("robots.txt is read once per site and kept", async () => {
    const web = fakeWeb({ [URL1]: { body: PAGE }, "https://www.thehindu.com/news/two": { body: PAGE } });
    await readArticle(URL1, { fetch: web.fetch, lookup: web.lookup, ...quiet });
    await readArticle("https://www.thehindu.com/news/two", { fetch: web.fetch, lookup: web.lookup, ...quiet });
    expect(web.calls.filter((c) => c.url.endsWith("/robots.txt")).length).toBe(1);
  });
});

describe("the memory cache: 10 minutes, then read again; nothing on disk, nothing logged", () => {
  it("a page read is kept 10 minutes and read again after", async () => {
    let now = Date.parse("2026-11-17T10:00:00+05:30");
    const web = fakeWeb({ [URL1]: { body: PAGE } });
    const o = { fetch: web.fetch, lookup: web.lookup, now: () => now, ...quiet };
    const pages = () => web.calls.filter((c) => c.url === URL1).length;
    const a = await readArticle(URL1, o);
    expect(a.status).toBe("ok");
    expect(a.cached).toBe(false);
    now += 9 * 60_000;
    const b = await readArticle(URL1, o);
    expect(b.cached).toBe(true);
    expect(b.text).toBe(a.text);
    expect(pages()).toBe(1);
    now += 60_001;
    const c = await readArticle(URL1, o);
    expect(c.cached).toBe(false);
    expect(pages()).toBe(2);
  });

  it("the cache is bounded in bytes (oldest out) and an entry expires at its time", () => {
    const c = new TtlCache<string>(1_000, 100);
    for (let k = 0; k < 5; k++) c.set(`k${k}`, "v", 40, 0);
    expect(c.bytes).toBeLessThanOrEqual(100);
    expect(c.get("k0", 1)).toBeNull();
    expect(c.get("k4", 1)).toBe("v");
    expect(c.get("k4", 1_000)).toBeNull();
    c.set("big", "v", 101, 0);
    expect(c.get("big", 1)).toBeNull();
    expect(caches.pages.bytes).toBe(0);
  });

  it("no page content is written to disk or to the console; telemetry gets codes only", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jv6-web-"));
    vi.stubEnv("THUNAI_DIR", dir);
    const writes: string[] = [];
    // every write is recorded, then made (Node's appendFileSync itself goes through writeFileSync)
    const realWrite = fs.writeFileSync, realAppend = fs.appendFileSync;
    vi.spyOn(fs, "writeFileSync").mockImplementation(((f: fs.PathOrFileDescriptor, d: string, o?: fs.WriteFileOptions) => { writes.push(String(d)); realWrite(f, d, o); }) as never);
    vi.spyOn(fs, "appendFileSync").mockImplementation(((f: fs.PathOrFileDescriptor, d: string) => { writes.push(String(d)); realAppend(f, d); }) as never);
    vi.spyOn(fs, "createWriteStream").mockImplementation((() => { throw new Error("no streams to disk"); }) as never);
    vi.spyOn(fs.promises, "writeFile").mockImplementation((async (_f: unknown, d: unknown) => { writes.push(String(d)); }) as never);
    const logs: string[] = [];
    for (const k of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(" ")); });
    const web = fakeWeb({ [URL1]: { body: PAGE } });
    // the real telemetry (to the temp dir): codes only
    const r = await readArticle(URL1, { fetch: web.fetch, lookup: web.lookup });
    expect(r.status).toBe("ok");
    expect(r.text).toContain("pumped water out of 40 subways");
    const all = [...writes, ...logs].join("\n");
    expect(all).not.toContain("subways");
    expect(all).not.toContain("Rain lashes");
    expect(all).not.toContain("/news/cities");
    const lines = fs.readFileSync(path.join(dir, "telemetry.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      for (const [k, v] of Object.entries(l)) expect(["at", "event", "kind", "why", "ms", "bytes", "hop", "host", "status", "cached", "count"]).toContain(k), expect(String(v)).not.toMatch(/\s/);
    }
    expect(lines.some((l) => l.host === "www.thehindu.com")).toBe(true);
  });
});

describe("the owner's allow/deny list", () => {
  it("deny wins over allow; a host on neither list is refused; an entry covers its www. only, '*.' its subdomains", () => {
    const list = parseDomains({ ...DEFAULT_DOMAINS, allow: ["*.example.org", "news.example.net"], deny: ["bad.example.org"] })!;
    expect(hostVerdict("bad.example.org", list)).toBe("deny");
    expect(hostVerdict("good.example.org", list)).toBe("allow");
    expect(hostVerdict("example.org", list)).toBe("allow");
    expect(hostVerdict("www.news.example.net", list)).toBe("allow");
    expect(hostVerdict("evil.news.example.net", list)).toBe("unknown");
    expect(hostVerdict("evil.com", list)).toBe("unknown");
    expect(covers("thehindu.com", "evilthehindu.com")).toBe(false);
    expect(covers("thehindu.com", "thehindu.com.evil.net")).toBe(false);
    expect(covers("*.wikipedia.org", "en.wikipedia.org")).toBe(true);
    expect(covers("*.wikipedia.org", "wikipedia.org.evil.net")).toBe(false);
  });

  it("a denied host and an unknown host are never fetched nor looked up", async () => {
    const list: DomainList = { ...DEFAULT_DOMAINS, allow: ["*.thehindu.com", "thehindu.com"], deny: ["*.thehindu.com"] };
    for (const [url, status, domains] of [["https://www.thehindu.com/a", "denied", list], ["https://evil.example.com/a", "unknown_host", DEFAULT_DOMAINS], ["https://news.google.com/rss/articles/CBMi", "denied", DEFAULT_DOMAINS]] as const) {
      const web = fakeWeb({ [url]: { body: PAGE } });
      const r = await readArticle(url, { fetch: web.fetch, lookup: web.lookup, domains, ...quiet });
      expect(r.status).toBe(status);
      expect(web.calls).toEqual([]);
      expect(web.lookups).toEqual([]);
    }
  });

  it("the committed config file parses and matches the defaults in code", () => {
    const file = JSON.parse(fs.readFileSync(path.join(process.cwd(), "config", "jarvis-web-domains.json"), "utf8"));
    const parsed = parseDomains(file);
    expect(parsed).not.toBeNull();
    const { allow, deny, outlets, sources, robotsExempt, contact } = parsed!;
    expect({ allow, deny, outlets, sources, robotsExempt, contact }).toEqual(DEFAULT_DOMAINS);
  });

  it("a missing or invalid file falls back to the defaults; a valid one is used", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jv6-dom-"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("JARVIS_WEB_DOMAINS", path.join(dir, "missing.json"));
    expect(loadDomains(1)).toEqual(DEFAULT_DOMAINS);
    resetDomains();
    fs.writeFileSync(path.join(dir, "bad.json"), "{ not json");
    vi.stubEnv("JARVIS_WEB_DOMAINS", path.join(dir, "bad.json"));
    expect(loadDomains(1)).toEqual(DEFAULT_DOMAINS);
    resetDomains();
    fs.writeFileSync(path.join(dir, "wrong.json"), JSON.stringify({ allow: "everything" }));
    vi.stubEnv("JARVIS_WEB_DOMAINS", path.join(dir, "wrong.json"));
    expect(loadDomains(1)).toEqual(DEFAULT_DOMAINS);
    resetDomains();
    fs.writeFileSync(path.join(dir, "ok.json"), JSON.stringify({ ...DEFAULT_DOMAINS, allow: ["dtnext.in"] }));
    vi.stubEnv("JARVIS_WEB_DOMAINS", path.join(dir, "ok.json"));
    expect(loadDomains(1).allow).toEqual(["dtnext.in"]);
  });
});
