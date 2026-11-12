/**
 * QA pass 7, studio-parse: the patterns that held the server's thread on a crafted feed or page.
 *  - reviewer5-09: the news-feed test (parse.ts) backtracked exponentially on a run of XML comments; feedRoot() scans the prolog by hand.
 *  - the page helpers discover.ts ran on the server's thread (htmlTables, headlinesIn, feedLinkIn, the links) took 15-20 s on a 200 KB page
 *    of "<!--": discover() now reads the page in the file reader (readPage), under its time limit. jsShell (connect/index.ts calls it on
 *    the server's thread) and linksIn's comment strip (explore.ts, connectors.ts) are linear scans, checked against the patterns they replace.
 *   npx vitest run --config vitest.p7.config.ts tests/qa/pass7/studio-parse/pages.test.ts
 */
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { feedLinkIn, feedRoot, headlinesIn, htmlTables, parseAll, shape, type Cell } from "@/lib/studio/parse";
import { ParseLimitError, readPage, stopReaders } from "@/lib/studio/parse-pool";
import { discover, dropComments, fileLinksIn, jsShell, newChecked, nextPageLink, scriptJsonUrls, visibleText } from "@/lib/studio/connect/discover";
import { FEED, PAGE, commentsXml } from "./files";

const OLD_FEED = /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<(rss|feed|rdf:RDF)\b/i;
const timed = <T>(f: () => T) => { const t0 = performance.now(); const value = f(); return { value, ms: performance.now() - t0 }; };

afterEach(() => { vi.unstubAllEnvs(); stopReaders(); });

describe("reviewer5-09: the feed test is linear", () => {
  it("24, 30 and 20 000 comments before a root that is not a feed: decided in milliseconds (the old pattern: 8 s for 24)", () => {
    for (const n of [24, 30, 20_000]) {
      const t = commentsXml(n).toString();
      const r = timed(() => feedRoot(t));
      console.log(`${n} comments: ${r.ms.toFixed(1)} ms`);
      expect(r.value).toBe(false);
      expect(r.ms).toBeLessThan(100);
    }
  });
  it("the reviewer's file is read as an XML of records, in well under a second", () => {
    const r = timed(() => parseAll(commentsXml(24), "list.xml"));
    expect(r.value[0].format).toBe("xml");
    expect(r.value[0].rows).toHaveLength(4);
    expect(r.ms).toBeLessThan(1000);
  });
  it("still finds every feed the old pattern found, and a few it missed (more processing instructions, a DOCTYPE)", () => {
    const feeds = ['<rss version="2.0">', '<?xml version="1.0"?><rss>', '<?xml version="1.0"?>\n<!-- a -->\n<!-- b -->\n<feed xmlns="http://www.w3.org/2005/Atom">',
      "<rdf:RDF xmlns:rdf=\"x\">", "<RSS>", "<?xml version='1.0'?><!----><rss>"];
    for (const f of feeds) { expect(OLD_FEED.test(f), f).toBe(true); expect(feedRoot(f), f).toBe(true); }
    for (const f of ['<?xml version="1.0"?>\n<?xml-stylesheet type="text/xsl" href="/f.xsl"?>\n<rss>', '<!DOCTYPE rss PUBLIC "-//Netscape//DTD RSS 0.91//EN" "x.dtd">\n<rss version="0.91">',
      '<?xml version="1.0"?><!DOCTYPE feed [ <!ENTITY a "b"> ]><feed>']) expect(feedRoot(f), f).toBe(true);
    for (const f of ["<rsss>", "<data><rss>", "<!-- never closed <rss>", "<?xml never closed <rss>", '<?xml version="1.0"?><html>', "<feedback>", "", "rss"]) expect(feedRoot(f), f).toBe(false);
    expect(parseAll(FEED, "news.xml")[0].format).toBe("feed");
  });
  it("agrees with the old pattern on prologs of declarations, comments and white space (random, small enough for the old pattern)", () => {
    const part = fc.constantFrom('<?xml version="1.0"?>', "<!-- a -->", "<!---->", "<!-- -- -->", " ", "\n", "\t");
    const root = fc.constantFrom("<rss>", "<feed>", "<rdf:RDF>", "<data>", "<rssx>", "<html>", "x");
    fc.assert(fc.property(fc.option(fc.constant('<?xml version="1.0"?>')), fc.array(part.filter((p) => !p.startsWith("<?")), { maxLength: 8 }), root, (decl, parts, r) => {
      const t = ((decl ?? "") + parts.join("") + r).trimStart();
      expect(feedRoot(t)).toBe(OLD_FEED.test(t));
    }), { numRuns: 400 });
  });
});

describe("jsShell and linksIn's comment strip: linear, and the same answers as the patterns they replace", () => {
  const OLD_TEXT = (html: string) => html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const OLD_SHELL = (html: string) => OLD_TEXT(html).length < 1500 && (/<script\b/i.test(html) || /id=["'](root|app|__next)["']/i.test(html));
  const bits = fc.constantFrom("<", ">", "<>", "<b>", "</b>", "<script>", "</script>", "<SCRIPT src=x>", "</Script>", "<scripts>", "<style>", "</style>", "<svg", "</svg>",
    "<noscript>", "</noscript>", "<template>", "</template>", "<!--", "-->", "text", " ", "\n", "id='root'", "<div id=\"app\">", "a<b", "&amp;", "</scriptx>");
  it("visibleText and jsShell agree with the old patterns on random pages", () => {
    fc.assert(fc.property(fc.array(bits, { maxLength: 40 }), (xs) => {
      const html = xs.join("");
      expect(visibleText(html)).toBe(OLD_TEXT(html));
      expect(jsShell(html)).toBe(OLD_SHELL(html));
    }), { numRuns: 3000 });
  });
  it("dropComments agrees with /<!--[\\s\\S]*?-->/g on random pages", () => {
    fc.assert(fc.property(fc.array(fc.constantFrom("<!--", "-->", "<!-->", "--", "<", "!", "a", "<a href='x'>", "</a>"), { maxLength: 40 }), (xs) => {
      const html = xs.join("");
      expect(dropComments(html)).toBe(html.replace(/<!--[\s\S]*?-->/g, ""));
    }), { numRuns: 3000 });
  });
  it("on crafted 1 MB pages (runs of <!--, <script, <link, <) both take milliseconds (the old patterns: seconds to minutes)", () => {
    const pages = { comments: "<html>" + "<!--".repeat(250_000), scripts: "<html>" + "<script>".repeat(125_000), links: "<html>" + "<link rel=alternate ".repeat(50_000), lt: "<".repeat(1_000_000) + "<script>" };
    for (const [k, html] of Object.entries(pages)) {
      const a = timed(() => jsShell(html)), b = timed(() => dropComments(html));
      console.log(`${k}: jsShell ${a.ms.toFixed(0)} ms, dropComments ${b.ms.toFixed(0)} ms`);
      expect(a.ms).toBeLessThan(500);
      expect(b.ms).toBeLessThan(500);
    }
  });
});

describe("discover reads a page in the file reader", () => {
  it("readPage gives what the page helpers give on this thread", async () => {
    const html = PAGE.toString(), url = "https://example.in/wards";
    const p = await readPage(html, url);
    const tables = htmlTables(html).map((g) => { try { return { ...shape(g as Cell[][]), sheet: null, sheets: [], format: "html", caption: null }; } catch { return null; } });
    expect(p.tables).toEqual(tables);
    expect(p.tables[0]?.rows).toHaveLength(8);
    expect(p.feed).toBe(feedLinkIn(html, url));
    expect(p.feed).toBe("https://example.in/rss.xml");
    expect(p.headlines).toEqual(headlinesIn(html, url));
    expect(p.files).toEqual(fileLinksIn(html, url));
    expect(p.files.map((f) => f.url)).toEqual(["https://example.in/data/wards.csv"]);
    expect(p.scripts).toEqual(scriptJsonUrls(html, url));
    expect(p.next).toBe(nextPageLink(html, url));
    expect(p.next).toBe("https://example.in/wards?page=2");
  }, 30_000);
  it("a crafted 200 KB page of <!-- (15-20 s in each helper on the server's thread before): the reader is stopped at its limit, the link says why, the server's thread ticks", async () => {
    vi.stubEnv("STUDIO_PARSE_SECONDS", "3");
    const html = "<html>" + "<!--".repeat(50_000);
    const checked = newChecked();
    let last = performance.now(), gap = 0;
    const iv = setInterval(() => { const n = performance.now(); gap = Math.max(gap, n - last); last = n; }, 10);
    const t0 = performance.now();
    const found = await discover({ buf: Buffer.from(html), name: "page.html", contentType: "text/html", url: "https://example.in/x", html, json: [], title: "A page" }, () => {}, undefined, checked, { paginate: false, sniff: false });
    clearInterval(iv);
    gap = Math.max(gap, performance.now() - last); // a thread held the whole time never ticks
    const ms = performance.now() - t0;
    console.log("crafted page:", { ms: Math.round(ms), gap: Math.round(gap), failed: checked.failed });
    expect(found).toEqual([]);
    expect(checked.failed[0]).toEqual({ label: "A page", why: expect.stringMatching(/^This page took longer than 3 seconds to read/) });
    expect(ms).toBeLessThan(8000);
    expect(gap).toBeLessThan(500);
  }, 30_000);
  it("readPage under a limit throws the limit's error (discover catches it)", async () => {
    vi.stubEnv("STUDIO_PARSE_SECONDS", "2");
    await expect(readPage("<html>" + "<!--".repeat(50_000), "https://example.in/")).rejects.toBeInstanceOf(ParseLimitError);
  }, 30_000);
});
