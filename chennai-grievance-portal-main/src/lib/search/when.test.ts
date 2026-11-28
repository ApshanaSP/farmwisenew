/**
 * The search box's dates and kinds (28 Nov 2026, the owner: "if I search for some news that was reported 52 days ago, I couldn't find it").
 * A search names its dates in English, Tamil or Tanglish; they are taken out of the words, and the words say which readings are asked for.
 * Pure: the store's clock is passed in.
 */
import { describe, expect, it } from "vitest";
import { readSearch } from "./when";
import { commoditiesIn, readIntent } from "./intent";
import { kindsForModules, readQuery } from "./query";

// Saturday 28 Nov 2026, 10 AM IST
const NOW = "2026-11-28 10:00:00";
const read = (q: string) => readSearch(q, NOW);

describe("readSearch: the dates a search names, and the words left to look for", () => {
  it.each([
    ["news 52 days ago", "2026-10-07 00:00:00", "2026-10-08 00:00:00", "2026-10-07", "news"],
    ["52 நாட்களுக்கு முன் செய்தி", "2026-10-07 00:00:00", "2026-10-08 00:00:00", "2026-10-07", "செய்தி"],
    ["52 naal munnadi flood", "2026-10-07 00:00:00", "2026-10-08 00:00:00", "2026-10-07", "flood"],
    ["AQI Alandur 3 October", "2026-10-03 00:00:00", "2026-10-04 00:00:00", "2026-10-03", "AQI Alandur"],
    ["flood Oct 3", "2026-10-03 00:00:00", "2026-10-04 00:00:00", "2026-10-03", "flood"],
    ["garbage on 3/10/2026", "2026-10-03 00:00:00", "2026-10-04 00:00:00", "2026-10-03", "garbage"],
    ["tomato price 10 Nov", "2026-11-10 00:00:00", "2026-11-11 00:00:00", "2026-11-10", "tomato price"],
    ["அக்டோபர் 3 மழை", "2026-10-03 00:00:00", "2026-10-04 00:00:00", "2026-10-03", "மழை"],
    ["rain Nungambakkam yesterday", "2026-11-27 00:00:00", "2026-11-28 00:00:00", "2026-11-27", "rain Nungambakkam"],
    ["3 October 2025 flood", "2025-10-03 00:00:00", "2025-10-04 00:00:00", "2025-10-03", "flood"]
  ])("%s: one day", (q, from, to, day, topic) => {
    const r = read(q);
    expect(r.when).toMatchObject({ from, to, day, partial: false });
    expect(r.topic).toBe(topic);
    expect(r.unread).toBe(false);
  });

  it("52 days ago says its date and how long ago", () => {
    expect(read("news 52 days ago").when!.label).toBe("7 Oct 2026 (52 days ago)");
  });

  it.each([
    // the week three weeks back, Monday to Sunday (7 Nov was a Saturday)
    ["flood 3 weeks ago", "2026-11-02 00:00:00", "2026-11-09 00:00:00", "flood"],
    ["2 months ago", "2026-09-01 00:00:00", "2026-10-01 00:00:00", ""],
    ["metro rail october", "2026-10-01 00:00:00", "2026-11-01 00:00:00", "metro rail"],
    ["worst AQI last month", "2026-10-01 00:00:00", "2026-11-01 00:00:00", "worst AQI"],
    ["accident last week", "2026-11-16 00:00:00", "2026-11-23 00:00:00", "accident"],
    ["between 1 Oct and 15 Oct garbage", "2026-10-01 00:00:00", "2026-10-16 00:00:00", "garbage"],
    // a December not yet come this year is last year's
    ["cyclone December", "2025-12-01 00:00:00", "2026-01-01 00:00:00", "cyclone"]
  ])("%s: a span", (q, from, to, topic) => {
    const r = read(q);
    expect(r.when).toMatchObject({ from, to, day: null });
    expect(r.topic).toBe(topic);
  });

  it("this month runs to now", () => {
    const r = read("flood this month");
    expect(r.when!.to > NOW).toBe(true);
    expect(r.when!.partial).toBe(true);
    expect(r.topic).toBe("flood");
  });

  it("no date: every date, the words as typed", () => {
    expect(read("velachery flooding")).toEqual({ when: null, topic: "velachery flooding", unread: false });
    expect(read("protest march")).toEqual({ when: null, topic: "protest march", unread: false });
  });

  it("a time it cannot place is said, and every date is searched", () => {
    const r = read("floods next week");
    expect(r.when).toBeNull();
    expect(r.unread).toBe(true);
    expect(r.topic).toBe("floods");
  });

  it("'now' is no subject", () => {
    expect(read("flooding now")).toMatchObject({ when: null, topic: "flooding" });
  });
});

describe("readQuery: ids are searched as written", () => {
  it.each(["2611-4F9K2Q", "INC-2026-0412"])("%s", (id) => {
    const q = readQuery(id, NOW);
    expect(q.when).toBeNull();
    expect(q.topic).toBe(id);
    expect(q.intent.kinds).toEqual([]);
  });
});

describe("readIntent: which readings a search asks for", () => {
  it.each([
    ["AQI Alandur", ["aqi"], ["alandur"]],
    ["air quality Manali", ["aqi"], ["manali"]],
    ["காற்று தரம் மணலி", ["aqi"], ["மணலி"]],
    ["tomato price", ["price"], ["tomato"]],
    ["தக்காளி விலை", ["price"], ["தக்காளி"]],
    ["Chembarambakkam level", ["lake"], ["chembarambakkam"]],
    ["Basin Bridge river level", ["gauge"], ["basin", "bridge"]],
    ["rain Nungambakkam", ["rain"], ["nungambakkam"]],
    ["velachery flooding", [], ["velachery", "flooding"]],
    // "rate" alone is no price ("crime rate")
    ["crime rate", [], ["crime", "rate"]]
  ])("%s", (t, kinds, words) => {
    const it0 = readIntent(t);
    expect(it0.kinds).toEqual(kinds);
    expect(it0.words).toEqual(words);
  });

  it("worst and cheapest set the order; news alone leaves incidents out", () => {
    expect(readIntent("worst AQI").order).toBe("desc");
    expect(readIntent("cheapest onion").order).toBe("asc");
    expect(readIntent("worst AQI").text).toBe("AQI");
    expect(readIntent("news")).toMatchObject({ newsOnly: true, text: "" });
    expect(readIntent("flood news")).toMatchObject({ newsOnly: true, text: "flood" });
  });

  it("commodities by their English, Tamil and Tanglish names; small onion is not onion", () => {
    const known = ["Tomato", "Onion", "Small Onion", "Potato", "Bhindi(Ladies Finger)"];
    expect(commoditiesIn("tomato price", known)).toEqual(["Tomato"]);
    expect(commoditiesIn("தக்காளி விலை", known)).toEqual(["Tomato"]);
    expect(commoditiesIn("thakkali vilai", known)).toEqual(["Tomato"]);
    expect(commoditiesIn("small onion price", known)).toEqual(["Small Onion"]);
    expect(commoditiesIn("ladies finger rate", known)).toEqual(["Bhindi(Ladies Finger)"]);
  });
});

describe("the officer's readings: only those its console uses", () => {
  it("modules to kinds", () => {
    expect(kindsForModules(["weather"])).toEqual(["rain", "gauge"]);
    expect(kindsForModules(["lakes", "weather", "pwdworks"])).toEqual(["lake", "rain", "gauge"]);
    expect(kindsForModules(["air"])).toEqual(["aqi"]);
    expect(kindsForModules(["markets"])).toEqual(["price"]);
    expect(kindsForModules(["police"])).toEqual([]);
  });
});
