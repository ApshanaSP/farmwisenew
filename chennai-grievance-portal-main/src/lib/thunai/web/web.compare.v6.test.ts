/**
 * v6 Phase 4, by code: sentences and figures, facts with their outlet, agreement / difference / newest across outlets, the spoken
 * brief (2-4 sentences, English and Tamil, each fact named with its outlet, relative times, no URL read out), feed parsing, local
 * matching of other outlets' reports with duplicates dropped, and how a public question is routed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { briefFromCoverage, firstLine, relativeTime } from "./brief";
import { clip, compareCoverage, factsOf, measuresIn, sentences } from "./compare";
import { blockText, tidyText } from "./read";
import { DEFAULT_DOMAINS } from "./domains";
import { fakeWeb, rssFeed } from "./fake";
import { clearWebCache, normUrl } from "./fetch";
import { webLookup } from "./lookup";
import { matchScore, parseFeed, relatedCoverage, sameHeadline, toMs } from "./related";
import { placesIn, termsOf } from "./terms";

const quiet = { telemetry: () => {} };
const NOW = Date.parse("2026-11-17T11:00:00+05:30");
const ist = (s: string) => new Date(Date.parse(`${s}+05:30`)).toISOString();

beforeEach(() => clearWebCache());

describe("sentences and figures", () => {
  it("splits sentences without breaking at abbreviations or times, and every slice is verbatim", () => {
    const text = "Mr. K. Raman, Deputy Commissioner, said the wall fell at 10.30 p.m. on Sunday. Three people were injured.\nRs. 5 lakh was announced as relief. இந்த விபத்தில் 3 பேர் காயமடைந்தனர். மீட்புப் பணிகள் நடந்தன.";
    const s = sentences(text);
    expect(s.map((x) => x.s)).toEqual([
      "Mr. K. Raman, Deputy Commissioner, said the wall fell at 10.30 p.m. on Sunday.", "Three people were injured.", "Rs. 5 lakh was announced as relief.",
      "இந்த விபத்தில் 3 பேர் காயமடைந்தனர்.", "மீட்புப் பணிகள் நடந்தன."
    ]);
    for (const x of s) expect(text.slice(x.start, x.start + x.s.length)).toBe(x.s);
  });

  it("reads figures by kind, in English and Tamil, and not ages", () => {
    expect(measuresIn("Three people were killed and 12 others were injured in the crash.")).toEqual([{ key: "dead", value: 3 }, { key: "injured", value: 12 }]);
    expect(measuresIn("The death toll rose to 4 on Monday.")).toEqual([{ key: "dead", value: 4 }]);
    expect(measuresIn("Nungambakkam recorded 12 cm of rain till 8.30 a.m.")).toEqual([{ key: "rain_mm", value: 120 }]);
    expect(measuresIn("Meenambakkam recorded 45.6 mm.")).toEqual([{ key: "rain_mm", value: 45.6 }]);
    expect(measuresIn("Police arrested 2 youths on Tuesday; 150 people were evacuated to 6 relief camps.")).toEqual([{ key: "arrested", value: 2 }, { key: "rescued", value: 150 }, { key: "camps", value: 6 }]);
    expect(measuresIn("A 45-year-old man died on the spot.")).toEqual([]);
    expect(measuresIn("It was raised in any of the three meetings held in 2025.")).toEqual([]);
    expect(measuresIn("Two men were held for questioning.")).toEqual([{ key: "arrested", value: 2 }]);
    expect(measuresIn("இந்த விபத்தில் 3 பேர் உயிரிழந்தனர்; 5 பேர் காயமடைந்தனர்.")).toEqual([{ key: "dead", value: 3 }, { key: "injured", value: 5 }]);
  });

  it("unglues paragraphs a site ran together, and never takes a dateline or a mid-clause cut for a fact", async () => {
    expect(tidyText("have also been named.According to the FIR, the inquiry found it.\nADDED : Nov 17, 2026")).toBe("have also been named.\nAccording to the FIR, the inquiry found it.");
    expect(tidyText("visit thehindu.com for more. Rs.10 lakh")).toBe("visit thehindu.com for more. Rs.10 lakh");
    expect(await blockText("<div><p>First para.</p><p>Second para</p><ul><li>a</li><li>b</li></ul></div>")).toMatch(/First para\.\n+Second para\n+a\n+b/);
    const { facts } = factsOf({ outlet: "The Hindu", url: "u", publishedAt: null, text: [
      "Published - November 17, 2026 10:24 am IST.", "17 Nov 2026, 1:51 am.", "Updated on: 17 November 2026, 10:24 a.m. IST",
      "Purchase orders were issued for 1,857 books, of which 1,779 titles supplied by one publisher were forwarded for payment processing and the committee included titles that had not been recommended by the selection panel in any of the three meetings held in 2025.",
      "Police said 2 officials were arrested on Monday."].join("\n") });
    expect(facts.map((f) => f.quote)).toEqual(["Police said 2 officials were arrested on Monday."]);
  });

  it("clips a long sentence at a comma, keeping a verbatim start", () => {
    const s = "Three people were injured when a compound wall collapsed on Taramani Link Road in Velachery late on Sunday night, according to the police, who added that the owner of the building had been asked to appear before the inspector on Monday morning for an inquiry into the incident.";
    const c = clip(s);
    expect(s.startsWith(c)).toBe(true);
    expect(c).toBe("Three people were injured when a compound wall collapsed on Taramani Link Road in Velachery late on Sunday night, according to the police");
  });
});

describe("compareCoverage and the brief", () => {
  const hindu = { outlet: "The Hindu", outletTa: "தி இந்து", url: "https://www.thehindu.com/a", publishedAt: ist("2026-11-17T08:10:00"),
    text: "Three people were injured when a compound wall collapsed in Velachery on Sunday night, police said.\nThe Corporation has ordered an inspection of 40 old walls in the area, the Commissioner said." };
  const dt = { outlet: "DT Next", outletTa: "டிடி நெக்ஸ்ட்", url: "https://www.dtnext.in/b", publishedAt: ist("2026-11-17T10:20:00"),
    text: "Four people were injured in the wall collapse at Velachery, the police said on Monday.\nFire and Rescue Services personnel rescued 2 workers trapped under the debris on Monday morning." };
  const dinamani = { outlet: "Dinamani", outletTa: "தினமணி", url: "https://www.dinamani.com/c", publishedAt: ist("2026-11-17T09:00:00"),
    text: "வேளச்சேரியில் சுவர் இடிந்து விழுந்த விபத்தில் 3 பேர் காயமடைந்தனர் என்று காவல்துறையினர் தெரிவித்தனர்.\nமாநகராட்சி ஆணையர் ஆய்வுக்கு உத்தரவிட்டார்." };

  it("names each fact's outlet, finds what differs and what agrees, and the newest report's own facts", async () => {
    const c = await compareCoverage([hindu, dt, dinamani]);
    expect(c.outlets).toEqual(["The Hindu", "DT Next", "Dinamani"]);
    for (const f of c.facts) expect([hindu, dt, dinamani].find((s) => s.outlet === f.outlet)!.text).toContain(f.quote);
    expect(c.differ).toEqual([{ key: "injured", values: [
      { outlet: "The Hindu", outletTa: "தி இந்து", value: 3, quote: expect.any(String) }, { outlet: "DT Next", outletTa: "டிடி நெக்ஸ்ட்", value: 4, quote: expect.any(String) },
      { outlet: "Dinamani", outletTa: "தினமணி", value: 3, quote: expect.any(String) }] }]);
    expect(c.newest.map((f) => f.outlet)).toEqual(["DT Next"]);
    const agree = await compareCoverage([hindu, dinamani]);
    expect(agree.agree).toEqual([{ key: "injured", value: 3, outlets: ["The Hindu", "Dinamani"] }]);
    expect(agree.differ).toEqual([]);
  });

  it("the brief: 2-4 sentences in each language, every one naming an outlet, relative times, no URL, links for the screen", async () => {
    const c = await compareCoverage([hindu, dt, dinamani]);
    const b = briefFromCoverage({ primary: { outlet: "The Hindu", outletTa: "தி இந்து", url: hindu.url, title: "Wall collapse in Velachery", publishedAt: hindu.publishedAt, status: "ok" },
      related: [dt, dinamani].map((x) => ({ ...x, title: "t" })), comparison: c }, { now: () => NOW });
    expect(b.first).toEqual({ en: "Reading The Hindu's report...", ta: "தி இந்து செய்தியைப் படிக்கிறேன்..." });
    expect(b.en.length).toBeGreaterThanOrEqual(2);
    expect(b.en.length).toBeLessThanOrEqual(4);
    expect(b.ta.length).toBe(b.en.length);
    expect(b.en[0]).toBe("The Hindu reported this morning: Three people were injured when a compound wall collapsed in Velachery on Sunday night, police said.");
    expect(b.en[1]).toBe("On the number injured, The Hindu says 3, DT Next says 4 and Dinamani says 3.");
    for (const line of b.en) expect(/The Hindu|DT Next|Dinamani/.test(line), line).toBe(true);
    for (const line of b.ta) expect(/தி இந்து|டிடி நெக்ஸ்ட்|தினமணி/.test(line), line).toBe(true);
    expect(b.ta[0]).toMatch(/^தி இந்து இன்று காலை வெளியிட்ட செய்தி: /);
    expect([...b.en, ...b.ta].join(" ")).not.toMatch(/https?:|www\.|\.com/);
    expect(b.links.map((l) => l.url)).toEqual([hindu.url, dt.url, dinamani.url]);
    expect(b.fromWeb).toBe(true);
  });

  it("a report that could not be read is told by its headline, said so", () => {
    const b = briefFromCoverage({ primary: { outlet: "Dinamani", outletTa: "தினமணி", url: "https://www.dinamani.com/story/x", title: "வேளச்சேரியில் சுவர் இடிந்து 3 பேர் காயம்", publishedAt: ist("2026-11-16T21:30:00"), status: "robots" } }, { now: () => NOW });
    expect(b.en).toEqual(["Dinamani's headline, last night: வேளச்சேரியில் சுவர் இடிந்து 3 பேர் காயம்.", "I could not open the full report, so that is the headline only."]);
    expect(b.ta[0]).toMatch(/^தினமணி தலைப்புச் செய்தி, நேற்று இரவு: /);
  });

  it("relative times in Chennai's time zone", () => {
    const at = (s: string) => relativeTime(ist(s), NOW);
    expect(at("2026-11-17T10:58:00")).toBe("just now");
    expect(at("2026-11-17T10:20:00")).toBe("40 minutes ago");
    expect(at("2026-11-17T03:00:00")).toBe("early this morning");
    expect(at("2026-11-17T08:00:00")).toBe("this morning");
    expect(at("2026-11-16T14:00:00")).toBe("yesterday afternoon");
    expect(at("2026-11-16T22:00:00")).toBe("last night");
    expect(at("2026-11-13T10:00:00")).toBe("on Friday");
    expect(at("2026-11-01T10:00:00")).toBe("on 1 November");
    expect(relativeTime(ist("2026-11-17T08:00:00"), NOW, "ta")).toBe("இன்று காலை");
    expect(relativeTime(null, NOW)).toBeNull();
    expect(firstLine(null)).toEqual({ en: "Reading the report...", ta: "செய்தியைப் படிக்கிறேன்..." });
  });
});

describe("feeds and local matching", () => {
  it("parses RSS, Atom and a news sitemap; drops non-http links", () => {
    const rss = rssFeed([{ title: "A &amp; B", link: "https://www.dtnext.in/a", pubDate: "Mon, 17 Nov 2026 03:00:00 GMT", description: "<p>Para &#8216;one&#8217;</p>" }, { title: "bad", link: "javascript:alert(1)" }]);
    expect(parseFeed(rss, "dtnext")).toEqual([{ outletId: "dtnext", title: "A & B", url: "https://www.dtnext.in/a", publishedAt: Date.parse("2026-11-17T03:00:00Z"), snippet: "Para ‘one’" }]);
    const atom = `<feed><entry><title>T</title><link href="https://www.thehindu.com/x"/><updated>2026-11-17T03:00:00Z</updated><summary>S</summary></entry></feed>`;
    expect(parseFeed(atom, "thehindu")[0]).toMatchObject({ title: "T", url: "https://www.thehindu.com/x", snippet: "S" });
    const sitemap = `<urlset><url><loc>https://www.dinamalar.com/news/velachery-wall-collapse-3-injured-12345</loc><lastmod>2026-11-17T09:00:00+05:30</lastmod></url></urlset>`;
    expect(parseFeed(sitemap, "dinamalar")[0]).toMatchObject({ title: "velachery wall collapse 3 injured", url: "https://www.dinamalar.com/news/velachery-wall-collapse-3-injured-12345" });
  });

  it("finds places in English and Tamil from the console's lists", () => {
    expect(placesIn("Waterlogging in Velachery and Anna Nagar; Chennai").places).toEqual(["Velachery", "Anna Nagar"]);
    expect(placesIn("Waterlogging in Velachery and Anna Nagar; Chennai").region).toEqual(["Chennai"]);
    expect(placesIn("வேளச்சேரியில் சுவர் இடிந்து விழுந்தது; அடையாறில் மழை").places).toEqual(["Velachery", "Adyar"]);
    expect(placesIn("Heavy rain at isolated places over Cpattu and Kanche districts").region).toEqual(["Chengalpattu", "Kancheepuram"]);
    expect(termsOf("what is the forecast for tomorrow").day).toBe(1);
  });

  it("matches the same event in other outlets' feeds, drops duplicates, one per outlet, never the item's own outlet, at most 3", async () => {
    const at = (h: number) => new Date(NOW - h * 3600_000).toUTCString();
    const feeds: Record<string, string> = {
      thehindu: rssFeed([{ title: "Wall collapses in Velachery; three injured", link: "https://www.thehindu.com/news/cities/chennai/a.ece", pubDate: at(3) }]),
      dtnext: rssFeed([
        { title: "Velachery wall collapse: three injured", link: "https://www.dtnext.in/news/chennai/velachery-wall-collapse?utm_source=rss", pubDate: at(2), description: "A compound wall collapsed in Velachery." },
        { title: "Velachery wall collapse: three injured", link: "https://www.dtnext.in/amp/news/chennai/velachery-wall-collapse", pubDate: at(2) },
        { title: "Metro rail work: traffic diversion in Guindy", link: "https://www.dtnext.in/news/chennai/metro", pubDate: at(1) }
      ]),
      nie: rssFeed([{ title: "Velachery wall collapse: three injured", link: "https://www.newindianexpress.com/cities/chennai/2026/Nov/17/x", pubDate: at(2) },
        { title: "Wall collapse in Velachery leaves three hurt, owner booked", link: "https://www.newindianexpress.com/cities/chennai/2026/Nov/17/y", pubDate: at(1) }]),
      dinamani: rssFeed([{ title: "வேளச்சேரியில் சுவர் இடிந்து 3 பேர் காயம்", link: "https://www.dinamani.com/chennai/2026/nov/17/z", pubDate: at(4) }]),
      toi: rssFeed([{ title: "Velachery wall collapse: three injured in old case", link: "https://timesofindia.indiatimes.com/city/chennai/old.cms", pubDate: new Date(NOW - 6 * 864e5).toUTCString() },
        { title: "Velachery wall collapse leaves three injured", link: "https://evil.example/x", pubDate: at(1) }]),
      dailythanthi: rssFeed([{ title: "வேளச்சேரியில் சுவர் இடிந்து விபத்து", link: "https://www.dailythanthi.com/news/chennai/q", pubDate: at(1) }]),
      dinamalar: "<urlset></urlset>"
    };
    const routes = Object.fromEntries(DEFAULT_DOMAINS.outlets.map((o) => [o.feeds[0], { body: feeds[o.id] }]));
    const web = fakeWeb(routes);
    const item = { title: "Compound wall collapses in Velachery; three injured", url: "https://www.thehindu.com/news/cities/chennai/a.ece", outlet: "The Hindu", publishedAt: "2026-11-17 08:00:00", place: "Velachery", category: "building_collapse" };
    const r = await relatedCoverage(item, { fetch: web.fetch, lookup: web.lookup, now: () => NOW, read: false, ...quiet });
    expect(r.items.length).toBe(3);
    const outlets = r.items.map((i) => i.outlet);
    expect(new Set(outlets).size).toBe(3);
    expect(outlets).not.toContain("The Hindu");
    expect(outlets).not.toContain("The Times of India");
    // the syndicated copy (the same headline in DT Next and NIE) is one report; NIE's own report stays
    const titles = r.items.map((i) => i.title);
    expect(titles.filter((t) => t === "Velachery wall collapse: three injured").length).toBe(1);
    expect(r.items.every((i) => i.source === "feed" && i.status === "not_read")).toBe(true);
    expect(r.feeds).toMatchObject({ tried: 7, ok: 7, failed: 0 });
    expect(r.self).toBeNull();
  });

  it("normalises URLs (tracking, www, AMP, trailing slash) and spots near-identical headlines", () => {
    expect(normUrl("https://www.dtnext.in/amp/news/x/?utm_source=rss#top")).toBe(normUrl("https://dtnext.in/news/x"));
    expect(sameHeadline("Velachery wall collapse: three injured - DT Next", "Velachery wall collapse, three injured")).toBe(true);
    expect(sameHeadline("Velachery wall collapse: three injured", "Adyar flooding: roads closed")).toBe(false);
    expect(toMs("2026-11-17 08:00:00")).toBe(Date.parse("2026-11-17T08:00:00+05:30"));
  });

  it("an unrelated story does not match", () => {
    const sig = { places: new Set(["Velachery"]), types: new Set(["collapse"]), words: new Set(["wall", "collapse", "velachery", "injur"]), title: "", at: NOW };
    expect(matchScore(sig, { outletId: "dtnext", title: "Metro rail work: traffic diversion in Guindy", url: "https://www.dtnext.in/m", publishedAt: NOW, snippet: "" })).toBe(0);
    expect(matchScore(sig, { outletId: "dtnext", title: "Fire in Velachery shop", url: "https://www.dtnext.in/f", publishedAt: NOW, snippet: "" })).toBe(0);
    expect(matchScore(sig, { outletId: "dtnext", title: "Wall collapse in Velachery", url: "https://www.dtnext.in/w", publishedAt: NOW, snippet: "" })).toBeGreaterThan(0);
  });

  it("with reading on, a matched report that robots.txt keeps out is told from its feed headline and summary", async () => {
    const at = (h: number) => new Date(NOW - h * 3600_000).toUTCString();
    const routes: Record<string, { body: string }> = Object.fromEntries(DEFAULT_DOMAINS.outlets.map((o) => [o.feeds[0], { body: rssFeed([]) }]));
    routes[DEFAULT_DOMAINS.outlets.find((o) => o.id === "dinamani")!.feeds[0]] = { body: rssFeed([{ title: "வேளச்சேரியில் சுவர் இடிந்து 3 பேர் காயம்", link: "https://www.dinamani.com/story/chennai/z", pubDate: at(2), description: "வேளச்சேரியில் சுவர் இடிந்து விழுந்ததில் 3 பேர் காயமடைந்தனர்." }]) };
    routes["https://www.dinamani.com/robots.txt"] = { body: "User-agent: *\nDisallow: /story/\n" };
    const web = fakeWeb(routes);
    const r = await relatedCoverage({ title: "Wall collapse in Velachery; three injured", outlet: "The Hindu", publishedAt: "2026-11-17 08:00:00", place: "Velachery" }, { fetch: web.fetch, lookup: web.lookup, now: () => NOW, ...quiet });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ outlet: "Dinamani", source: "feed", status: "robots" });
    expect(r.items[0].text).toContain("3 பேர் காயமடைந்தனர்");
    expect(web.calls.some((c) => c.url === "https://www.dinamani.com/story/chennai/z")).toBe(false);
  });
});

describe("webLookup routes a public question to one fixed source", () => {
  it("the Met department -> SACHET (Chennai only, the day asked); a background question -> Wikipedia; news -> feeds; nothing public -> refused", async () => {
    const sachet = DEFAULT_DOMAINS.sources.sachet.url;
    const feed = rssFeed([
      { title: "Thunderstorm warning", link: "https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=a", author: "controlroom@ndma.gov.in (IMD Chennai)", pubDate: new Date(NOW - 2 * 3600_000).toUTCString(),
        description: "Thunderstorm with lightning and moderate rain very likely at isolated places over Chennai, Cpattu and Tiruvallur districts." },
      // the same warning re-issued minutes earlier: said once
      { title: "Thunderstorm warning", link: "https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=a0", author: "controlroom@ndma.gov.in (IMD Chennai)", pubDate: new Date(NOW - 2 * 3600_000 - 180_000).toUTCString(),
        description: "Thunderstorm with lightning and moderate rain very likely at isolated places over Chennai, Cpattu and Tiruvallur districts." },
      { title: "Heavy rain", link: "https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=b", author: "IMD Kolkata", pubDate: new Date(NOW - 3600_000).toUTCString(), description: "Heavy rain over Kolkata." },
      { title: "Old warning", link: "https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=c", author: "IMD Chennai", pubDate: new Date(NOW - 5 * 864e5).toUTCString(), description: "Rain over Chennai." }
    ]);
    const web = fakeWeb({ [sachet]: { body: feed } });
    const a = await webLookup("What did the Met department say about tonight's rain?", { fetch: web.fetch, lookup: web.lookup, now: () => NOW, ...quiet });
    expect(a).toMatchObject({ status: "ok", source: "sachet", fromWeb: true });
    expect(a.en).toEqual(["From the web: IMD Chennai's latest alert on the NDMA alert feed, this morning, says: Thunderstorm with lightning and moderate rain very likely at isolated places over Chennai, Cpattu and Tiruvallur districts."]);
    expect(a.sources).toHaveLength(1);
    expect(a.ta[0]).toMatch(/^இணையத்திலிருந்து: /);
    const none = await webLookup("Who won the cricket match?", { fetch: web.fetch, lookup: web.lookup, now: () => NOW, ...quiet });
    expect(none.status).toBe("no_public_terms");
  });
});
