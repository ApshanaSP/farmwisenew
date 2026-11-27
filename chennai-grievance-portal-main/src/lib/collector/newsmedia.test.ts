/**
 * Which outlets are news media (27 Nov 2026, the owner): a listed site's subdomains count as that site ("tamil.timesnownews.com" is Times
 * Now's), and eight established Tamil outlets are news media, by web address and by name. A bare ending or a look-alike address never is.
 */
import { describe, expect, it } from "vitest";
import { isNewsMedia, mediaKind } from "./newsmedia";

describe("newsmedia: subdomains of listed sites", () => {
  it("a subdomain is its site's kind", () => {
    expect(mediaKind("Times Now Tamil", "tamil.timesnownews.com", "regional")).toBe("tv");
    expect(mediaKind("Dinamalar", "chennai.dinamalar.com", "established")).toBe("newspaper");
    expect(mediaKind("BBC", "news.bbc.co.uk", "established")).toBe("tv");
  });
  it("a listed paper's sport, cinema or temple section is not news media", () => {
    expect(mediaKind("Dinamalar", "cinema.dinamalar.com", "established")).toBeNull();
    expect(mediaKind("Dinamalar", "temple.dinamalar.com", "established")).toBeNull();
    expect(mediaKind("The Hindu", "https://www.sportstar.thehindu.com/news/x", "established")).toBeNull();
    expect(mediaKind("NDTV", "food.ndtv.com", "established")).toBeNull();
  });
  it("a bare ending, a look-alike or an unlisted site is not", () => {
    expect(mediaKind("X", "com", "regional")).toBeNull();
    expect(mediaKind("X", "example.gov.in", "regional")).toBeNull();
    expect(mediaKind("X", "fakethehindu.com", "regional")).toBeNull();
    expect(mediaKind("X", "thehindu.com.example.org", "regional")).toBeNull();
    expect(mediaKind("Asianet Newsable", "newsable.asianetnews.com", "regional")).toBeNull();
    expect(mediaKind("Oneindia", "oneindia.com", "regional")).toBeNull();
  });
  it("social posts and aggregators stay out, whatever their address", () => {
    expect(isNewsMedia("Times Now Tamil", "tamil.timesnownews.com", "social")).toBe(false);
    expect(isNewsMedia("Vikatan", "vikatan.com", "aggregator")).toBe(false);
  });
});

describe("newsmedia: established Tamil outlets", () => {
  const list: [string, string, "newspaper" | "tv"][] = [
    ["Vikatan", "vikatan.com", "newspaper"], ["Samayam Tamil", "tamil.samayam.com", "newspaper"], ["Oneindia Tamil", "tamil.oneindia.com", "newspaper"],
    ["ABP Nadu", "tamil.abplive.com", "tv"], ["Times Now Tamil", "tamil.timesnownews.com", "tv"], ["Asianet News Tamil", "tamil.asianetnews.com", "tv"],
    ["Minnambalam", "minnambalam.com", "newspaper"], ["Nakkheeran", "nakkheeran.in", "newspaper"]
  ];
  it.each(list)("%s (%s) is news media", (name, domain, kind) => {
    expect(mediaKind(name, domain, "regional")).toBe(kind);
    expect(mediaKind(name, `https://www.${domain}/chennai/story-1`, "established")).toBe(kind);
    // by name, when the report carries no web address
    expect(mediaKind(name, null, "regional")).toBe(kind);
  });
  it("Vikatan's news sections count as Vikatan, its cinema section does not", () => {
    expect(mediaKind("Vikatan", "chennai.vikatan.com", "established")).toBe("newspaper");
    expect(mediaKind("Vikatan", "cinema.vikatan.com", "established")).toBeNull();
  });
});
