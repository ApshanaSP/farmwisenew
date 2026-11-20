import { describe, expect, it } from "vitest";
import { kindOfBody, kindOfUrl } from "./sources";

describe("what an added link is", () => {
  it("reads a feed, JSON or a page from the response", () => {
    expect(kindOfBody("application/xml", '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>')).toBe("rss");
    expect(kindOfBody("text/xml", '<?xml version="1.0"?>\n<!-- made by x -->\n<feed xmlns="http://www.w3.org/2005/Atom">')).toBe("rss");
    expect(kindOfBody("application/rss+xml", "")).toBe("rss");
    expect(kindOfBody("application/json; charset=utf-8", '{"items":[]}')).toBe("json");
    expect(kindOfBody("text/plain", "[1,2]")).toBe("json");
    expect(kindOfBody("text/html; charset=utf-8", "<!doctype html><html>")).toBe("html");
    expect(kindOfBody("application/octet-stream", "PK\u0003\u0004")).toBeNull();
  });
  it("knows a feed by its address when it cannot look", () => {
    expect(kindOfUrl("https://www.thehindu.com/news/national/tamil-nadu/feeder/default.rss")).toBe("rss");
    expect(kindOfUrl("https://timesofindia.indiatimes.com/rssfeeds/2950623.cms")).toBe("rss");
    expect(kindOfUrl("https://www.newindianexpress.com/cities/chennai/rssfeed/?id=182&getXmlFeed=true")).toBe("rss");
    expect(kindOfUrl("https://example.gov.in/blog/feed/")).toBe("rss");
    expect(kindOfUrl("https://data.example.in/api/wards.json")).toBe("json");
    expect(kindOfUrl("https://chennai.nic.in/about-district/administrative-setup/revenue-administration/")).toBeNull();
  });
});
