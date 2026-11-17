/**
 * v6 Phase 4: "read the article" over a case. The browser sends { incident }; the server reads that incident's own newest news
 * report (its stored id, never a URL from the browser) or says it has none. Fake transport, no network.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_DOMAINS } from "./domains";
import { articleHtml, fakeWeb, rssFeed } from "./fake";
import { clearWebCache } from "./fetch";
import { NewsBody, type NewsEvent, newsEvents } from "./serve";

const quiet = { telemetry: () => {} };
const NOW = Date.parse("2026-11-17T11:00:00+05:30");
const URL1 = "https://www.thehindu.com/news/cities/chennai/wall-collapse-velachery/article70.ece";
const PAGE = articleHtml({ title: "Wall collapse in Velachery: three injured", published: "2026-11-17T02:30:00Z",
  paragraphs: ["Three people were injured when a compound wall collapsed on Taramani Link Road in Velachery around 10.30 p.m. on Sunday, the police said."] });
const doc = { id: "doc-1", url: URL1, title: "Wall collapse in Velachery: three injured", publisher: "The Hindu", publisher_domain: "thehindu.com", body: null, t: "2026-11-17 08:00:00", place: "Velachery", cat: "building_collapse" };
const feeds = () => Object.fromEntries(DEFAULT_DOMAINS.outlets.flatMap((o) => o.feeds).map((f) => [f, { body: rssFeed([]), headers: { "content-type": "application/rss+xml" } }]));

beforeEach(() => clearWebCache());

describe("an incident's report", () => {
  it("the body takes an incident id of the stored kind only", () => {
    expect(NewsBody.safeParse({ incident: "INC-2026-0042" }).success).toBe(true);
    for (const b of [{ incident: "../x" }, { incident: "" }, { incident: "INC-1", id: "doc-1" }, { incident: "INC-1", url: URL1 }]) expect(NewsBody.safeParse(b).success, JSON.stringify(b)).toBe(false);
  });
  it("its newest news report is read, as an { id } is", async () => {
    const web = fakeWeb({ ...feeds(), [URL1]: { body: PAGE } });
    const asked: string[] = [];
    const events: NewsEvent[] = [];
    for await (const e of newsEvents({ incident: "INC-7" }, { fetch: web.fetch, lookup: web.lookup, now: () => NOW, ...quiet,
      incidentDoc: async (id) => { asked.push(`inc:${id}`); return "doc-1"; }, loadDoc: async (id) => { asked.push(`doc:${id}`); return id === "doc-1" ? doc : null; } })) events.push(e);
    expect(asked).toEqual(["inc:INC-7", "doc:doc-1"]);
    expect(events.map((e) => e.type)).toEqual(["first", "brief", "related", "done"]);
    expect(events[0]).toMatchObject({ type: "first", en: expect.stringMatching(/The Hindu/) });
  });
  it("an incident with no news report says so, and nothing is fetched", async () => {
    const web = fakeWeb({});
    const events: NewsEvent[] = [];
    for await (const e of newsEvents({ incident: "INC-8" }, { fetch: web.fetch, lookup: web.lookup, now: () => NOW, ...quiet, incidentDoc: async () => null, loadDoc: async () => doc })) events.push(e);
    expect(events).toEqual([{ type: "error", why: "no_news" }]);
    expect(web.calls).toEqual([]);
  });
  it("a store failure is an error event, never a throw", async () => {
    const events: NewsEvent[] = [];
    for await (const e of newsEvents({ incident: "INC-9" }, { ...quiet, incidentDoc: async () => { throw new Error("db down"); }, loadDoc: async () => doc })) events.push(e);
    expect(events).toEqual([{ type: "error", why: "failed" }]);
  });
});
