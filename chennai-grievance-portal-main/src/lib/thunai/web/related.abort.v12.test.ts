/**
 * v12 (21 Nov, stale-and-double RC7): a feed read the turn stopped is not remembered as a failed feed, so the aide's gap look-up can now pass
 * the turn's signal into its feed reads: a cancelled turn stops the reads already out (the 06:42 flooded-roads turn still fetched 7 outlets'
 * feeds after it was cancelled), and the next question (usually the same one) reads them afresh instead of being told no feed could be read.
 * A slow feed's own timeout is still kept a minute. Fake transport only.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findGap } from "../aide7/gap";
import { DEFAULT_DOMAINS, resetDomains } from "./domains";
import { fakeWeb, rssFeed } from "./fake";
import { clearWebCache } from "./fetch";
import { readFeed } from "./related";

const quiet = { telemetry: () => {} };
const hindu = DEFAULT_DOMAINS.outlets.find((o) => o.id === "thehindu")!;
const FEED = hindu.feeds[0];
const NOW = Date.parse("2026-11-21T06:42:00Z");

beforeEach(() => { clearWebCache(); resetDomains(); });
afterEach(() => { clearWebCache(); resetDomains(); });

describe("readFeed", () => {
  it("an aborted read is not kept: the next read fetches the feed", async () => {
    const web = fakeWeb({ [FEED]: { body: rssFeed([{ title: "Rain in Chennai", link: "https://www.thehindu.com/news/a.ece", pubDate: new Date(NOW).toUTCString() }]), headers: { "content-type": "application/rss+xml" } } });
    const ac = new AbortController();
    ac.abort();
    const a = await readFeed(hindu, FEED, { fetch: web.fetch, lookup: web.lookup, signal: ac.signal, now: () => NOW, ...quiet });
    expect(a.status).toBe("aborted");
    const b = await readFeed(hindu, FEED, { fetch: web.fetch, lookup: web.lookup, now: () => NOW, ...quiet });
    expect(b).toMatchObject({ status: "ok", cached: false });
    expect(b.entries.length).toBe(1);
  });

  it("a feed's own timeout is still kept for a minute (the next question does not wait on it again)", async () => {
    const web = fakeWeb({ [FEED]: { hang: true } });
    const a = await readFeed(hindu, FEED, { fetch: web.fetch, lookup: web.lookup, caps: { feedMs: 150, firstByteMs: 150 }, now: () => NOW, ...quiet });
    expect(a.status).toBe("timeout");
    const b = await readFeed(hindu, FEED, { fetch: web.fetch, lookup: web.lookup, now: () => NOW + 1000, ...quiet });
    expect(b).toMatchObject({ status: "timeout", cached: true });
  });
});

describe("findGap: the turn's signal reaches the feed reads", () => {
  it("a turn cancelled while every outlet's feed hangs ends at once as an abort, not after the feeds' 2.5 s", async () => {
    const web = fakeWeb(Object.fromEntries(DEFAULT_DOMAINS.outlets.flatMap((o) => o.feeds.map((f) => [f, { hang: true }]))));
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 80);
    const t0 = Date.now();
    const e = await findGap("CM Vijay's visit to Adyar", "Is CM Vijay's visit to Adyar in the news?", { signal: ac.signal, now: () => NOW, dashboardNews: async () => [],
      web: { fetch: web.fetch, lookup: web.lookup, now: () => NOW, ...quiet } }).catch((x: unknown) => x);
    expect((e as Error)?.name).toBe("AbortError");
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(web.calls.filter((c) => !c.url.endsWith("/robots.txt")).length).toBeGreaterThan(0);
  });
});
