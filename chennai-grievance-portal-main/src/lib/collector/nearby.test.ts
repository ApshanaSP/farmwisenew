import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/collector/db", () => ({ default: { query: vi.fn() }, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/ai/gateway", () => ({ generateJson: vi.fn() }));

import { districtOf, draftEvents, levelOf, parseFeed, topicOf } from "./nearby";

const raw = (title: string, t = "2026-10-12 08:00:00", publisher = "DT Next", lang: "en" | "ta" = "en", q = "Tiruvallur when:7d") =>
  ({ title, publisher, url: "https://news.google.com/x", t, lang, q });

describe("placing a headline", () => {
  it("finds the district from its towns, in English and inflected Tamil", () => {
    expect(districtOf("Officials review dengue prevention measures in Avadi")?.name).toBe("Tiruvallur");
    expect(districtOf("திருவள்ளூரில் நடைபெற்ற பெரியார் நடை-ஓட்டம்")?.name).toBe("Tiruvallur");
    expect(districtOf("காஞ்சிபுரத்தில் கனமழை")?.name).toBe("Kancheepuram");
    expect(districtOf("செங்கல்பட்டில் குவிக்கப்பட்ட போலீஸ்")?.name).toBe("Chengalpattu");
    expect(districtOf("Car driven by drunk driver runs over cop in Chengalpattu")?.name).toBe("Chengalpattu");
    expect(districtOf("T.N. recording around 200 dengue cases a day")).toBeNull();
  });
});

describe("topics and levels", () => {
  it("sorts headlines into risk topics", () => {
    expect(topicOf("Officials review dengue prevention measures in Avadi")).toBe("health");
    expect(topicOf("Surplus water released from Poondi reservoir")).toBe("water");
    expect(topicOf("Ammonia gas leak at Ennore factory")).toBe("hazard");
    expect(topicOf("Railways invites bids for Guduvanchery-Chengalpattu line")).toBe("other");
  });
  it("asks to prepare for outbreaks and water let out upstream", () => {
    expect(levelOf("health", "Fever cases surge in Tiruvallur villages", 1)).toBe("prepare");
    expect(levelOf("water", "1,000 cusecs released from Chembarambakkam", 1)).toBe("prepare");
    expect(levelOf("transport", "Two youths killed as bike crashes into lorry", 1)).toBe("watch");
  });
});

describe("events from the feeds", () => {
  it("drops noise, Chennai's own news and unplaced headlines, and folds repeats", () => {
    const ev = draftEvents([
      raw("Hero Super Splendor Price in Chengalpattu"),
      raw("Chengalpattu District Election Officer inspects a polling booth"),
      raw("Chennai Metro: PM inaugurates Poonamallee-Vadapalani stretch"),
      raw("Already on Chennai pages: fire at Tambaram"),
      raw("Dengue cases rise in Ponneri, health officials step up drive"),
      raw("Dengue cases rise in Ponneri; health officials step up drive", "2026-10-12 09:00:00", "The Hindu"),
      raw("Dengue cases rise across the State")
    ], new Set(["already on chennai pages fire at tambaram"]), "2026-10-13 10:00:00");
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ district: "Tiruvallur", topic: "health" });
    expect(ev[0].reports.map((r) => r.publisher)).toEqual(["DT Next", "The Hindu"]);
  });
  it("keeps only the three districts: state-wide news that names none of them is left out", () => {
    const ev = draftEvents([
      raw("T.N. recording around 200 dengue cases a day", "2026-10-12 08:00:00", "The Hindu"),
      raw("தமிழகத்தில் 21,655 பேருக்கு டெங்கு பாதிப்பு", "2026-10-12 10:00:00", "Dinamani", "ta"),
      raw("Fever cases rise in Ponneri", "2026-10-12 10:00:00", "DT Next")
    ], new Set(), "2026-10-13 10:00:00");
    expect(ev.map((e) => e.district)).toEqual(["Tiruvallur"]);
  });
});

describe("the feed", () => {
  it("reads items, the outlet and the time in IST", () => {
    const xml = `<rss><channel><item><title>Fever camp at Avadi &amp; Pattabiram - DT Next</title><link>https://news.google.com/rss/articles/x</link>
      <pubDate>Mon, 12 Oct 2026 02:30:00 GMT</pubDate><source url="https://www.dtnext.in">DT Next</source></item></channel></rss>`;
    expect(parseFeed(xml, "en", "q")).toEqual([{ title: "Fever camp at Avadi & Pattabiram", publisher: "DT Next", url: "https://news.google.com/rss/articles/x",
      t: "2026-10-12 08:00:00", lang: "en", q: "q" }]);
  });
});
