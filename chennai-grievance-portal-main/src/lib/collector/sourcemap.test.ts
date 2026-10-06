import { describe, expect, it } from "vitest";
import { applyMapping, extractRecords, feedLink, fieldsOf, guessMapping, loginForm, parseWhen, readStored } from "./sourcemap";

const RSS = `<?xml version="1.0"?><rss><channel><title>GCC</title>
<item><title><![CDATA[Waterlogging at Velachery]]></title><link>https://x.in/a</link><description>Rain &amp; flooding</description>
<pubDate>Mon, 05 Oct 2026 08:00:00 +0530</pubDate><category>Rain</category><category>Floods</category><georss:point>12.98 80.22</georss:point></item>
<item><title>Garbage pile on Anna Salai</title><link>https://x.in/b</link><pubDate>Mon, 05 Oct 2026 09:00:00 +0530</pubDate></item>
</channel></rss>`;

describe("records", () => {
  it("reads RSS items, joins categories and splits coordinate pairs", () => {
    const { records } = extractRecords("rss", RSS, "https://x.in/feed", null);
    expect(records).toHaveLength(2);
    expect(records[0].title).toBe("Waterlogging at Velachery");
    expect(records[0].category).toBe("Rain, Floods");
    expect(records[0]["georss:point[0]"]).toBe("12.98");
    const m = guessMapping(fieldsOf(records));
    expect(m).toMatchObject({ title: "title", url: "link", published: "pubdate", category: "category" });
    expect(m.lat).toBe("georss:point[0]");
    const it0 = applyMapping(records[0], m)!;
    expect(it0.lat).toBeCloseTo(12.98);
    expect(it0.published).toBe("2026-10-05T02:30:00.000Z");
  });

  it("finds the list in a GeoJSON API and keeps its path for scheduled runs", () => {
    const geo = JSON.stringify({ type: "FeatureCollection", features: [1, 2, 3].map((k) => ({
      type: "Feature", properties: { id: k, event: `Tree fall ${k}`, ward: `Ward ${k}`, reported: "05/10/2026 14:30" },
      geometry: { type: "Point", coordinates: [80.25, 13.05] } })) });
    const { records, path } = extractRecords("json", geo, "https://x.in", null);
    expect(path).toBe("features");
    expect(records[0]["geometry.coordinates[0]"]).toBe("80.25");
    const again = extractRecords("json", geo, "https://x.in", path);
    expect(again.records).toHaveLength(3);
    const it0 = applyMapping(records[0], { title: "properties.event", body: [], url: null, published: "properties.reported", dateFormat: "dmy",
      place: ["properties.ward"], lat: "geometry.coordinates[0]", lon: "geometry.coordinates[1]", category: null, id: "properties.id" })!;
    expect(it0).toMatchObject({ title: "Tree fall 1", place: "Ward 1", lat: 13.05, lon: 80.25, extId: "1" }); // [lon, lat] swapped back
    expect(it0.published).toBe("2026-10-05T09:00:00.000Z");
  });

  it("finds the repeated cards on a page, skipping the menu", () => {
    const card = (k: number) => `<div class="card news"><h3><a href="/n/${k}">Press release ${k}: storm water drain work in Zone ${k}</a></h3><span class="date">0${k} Oct 2026</span></div>`;
    const html = `<html><body><nav class="menu"><a href="/1">Home page of the corporation</a><a href="/2">About the corporation office</a><a href="/3">Contact the corporation office</a></nav>
      <main id="list">${[1, 2, 3, 4].map(card).join("")}</main></body></html>`;
    const { records, path } = extractRecords("html", html, "https://gcc.in/news", null);
    expect(path).toBe("#list > div.card.news");
    expect(records).toHaveLength(4);
    expect(records[0]).toMatchObject({ link: "https://gcc.in/n/1", ".date": "01 Oct 2026" });
    expect(parseWhen(records[1][".date"])?.toISOString()).toBe("2026-10-01T18:30:00.000Z");
  });

  it("reads table rows by their header names", () => {
    const html = `<table><tr><th>Date</th><th>Area</th><th>Issue</th></tr>${[1, 2, 3].map((k) => `<tr><td>0${k}-10-2026</td><td>Adyar</td><td><a href="/i/${k}">Power cut reported in sector ${k}</a></td></tr>`).join("")}</table>`;
    const { records } = extractRecords("html", html, "https://t.in/", null);
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ Date: "01-10-2026", Area: "Adyar", "Issue link": "https://t.in/i/1" });
  });

  it("spots sign-in forms and announced feeds", () => {
    const html = `<head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head><form action="/auth/login" method="post"><input name="email" type="email"><input name="pwd" type="password"></form>`;
    expect(loginForm(html, "https://p.in/x")).toEqual({ loginUrl: "https://p.in/auth/login", userField: "email", passField: "pwd" });
    expect(feedLink(html, "https://p.in/x")).toBe("https://p.in/feed.xml");
  });
});

describe("dates and stored mappings", () => {
  it("reads Indian day-first dates and unix times", () => {
    expect(parseWhen("05/10/2026", "dmy")?.toISOString()).toBe("2026-10-04T18:30:00.000Z");
    expect(parseWhen("10/05/2026", "mdy")?.toISOString()).toBe("2026-10-04T18:30:00.000Z");
    expect(parseWhen("1791200000")?.getTime()).toBe(1791200000 * 1000);
    expect(parseWhen("not a date")).toBeNull();
  });

  it("rejects a malformed stored mapping", () => {
    expect(readStored(null)).toBeNull();
    expect(readStored("{bad")).toBeNull();
    expect(readStored(JSON.stringify({ v: 1, detected: "rss", recordPath: null, map: { title: "title", body: ["x", 3], dateFormat: "weird" } }))?.map)
      .toMatchObject({ title: "title", body: ["x"], dateFormat: "auto", place: [] });
  });
});

describe("pages that redeploy", () => {
  const page = (hash: string, wrap: string) => `<main id="news"><div class="${wrap}">${[1, 2, 3].map((k) =>
    `<div class="story-card_wrapper__${hash}"><a href="/s/${k}"><h3 class="story-card_title__${hash}">Rain water stagnation reported in street number ${k}</h3></a><time datetime="2026-10-0${k}T08:00:00+05:30">Oct ${k}</time></div>`).join("")}</div></main>`;
  it("keeps build hashes out of selectors and field names, and finds the list again after a layout change", () => {
    const first = extractRecords("html", page("1e8p0", "grid"), "https://n.in/", null);
    expect(first.path).not.toMatch(/1e8p0/);
    expect(first.records[0][".story-card_title"]).toContain("street number 1");
    const later = extractRecords("html", page("9zz7q", "grid-v2 layout"), "https://n.in/", "#news > div.nothing-here > div");
    expect(later.records).toHaveLength(3);
    expect(later.records[0][".story-card_title"]).toContain("street number 1");
    expect(later.records[0].time).toBe("2026-10-01T08:00:00+05:30");
  });
});
