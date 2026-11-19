/**
 * v7 review (privacy): /news { id } reads a stored document for Jarvis's news reader, and v7 sends its stored body to the writer model
 * (aide7/news.ts newsAide). Only a news outlet's report may be read (lib/collector/newsmedia.ts isNewsMedia: newspapers, TV news, agencies,
 * government sources); any other row of `documents` (a social post, an aggregator's copy, a complaint) is answered as a missing document,
 * and its body reaches no model.
 */
import { describe, expect, it, vi } from "vitest";
import type { NewsAide } from "../aide7/news";
import { newsEvents, type NewsEvent, type StoredDoc } from "./serve";

const BODY = "Residents of Kotturpuram said the canal overflowed on Monday night after heavy rain, and that the water stood in the streets till morning. ".repeat(3);
const collect = async (g: AsyncGenerator<NewsEvent>) => { const out: NewsEvent[] = []; for await (const e of g) out.push(e); return out; };
const aideOf = () => {
  const seen: string[] = [];
  const aide = (async function* (a: { text: string; fallback: string }) { seen.push(a.text); yield [a.fallback]; }) as unknown as NewsAide;
  return { aide: vi.fn(aide), seen };
};

describe("v7 review: the news reader reads only a news outlet's report", () => {
  const asked = { q: "tell me about this news", lang: "en" as const };
  it.each([
    ["a social post", { publisher: "Chennai Rains (X)", publisher_domain: "x.com", publisher_tier: "social" }],
    ["an aggregator's copy", { publisher: "The Hindu", publisher_domain: "news.google.com", publisher_tier: "aggregator" }],
    ["an unknown site", { publisher: "Ward 13 residents' blog", publisher_domain: "ward13.example.org", publisher_tier: null }],
    ["a row with no source at all", { publisher: null, publisher_domain: null, publisher_tier: null }]
  ])("%s: answered as a missing document; its body reaches no model", async (_what, src) => {
    const doc: StoredDoc = { id: "d9", url: null, title: "Water in the streets", body: BODY, t: "2026-11-17 09:10:00", ...src };
    const { aide, seen } = aideOf();
    const loadDoc = vi.fn(async () => doc);
    const ev = await collect(newsEvents({ id: "d9", ask: asked }, { loadDoc, related: false, aide }));
    expect(loadDoc).toHaveBeenCalledWith("d9");
    expect(ev).toEqual([{ type: "error", why: "not_found" }]);
    expect(aide).not.toHaveBeenCalled();
    expect(seen).toHaveLength(0);
  });
  it("a news outlet's report is read as before (its body goes to the aide)", async () => {
    const doc: StoredDoc = { id: "d1", url: null, title: "Kotturpuram streets waterlogged as canal overflows", publisher: "The Hindu", publisher_domain: "thehindu.com", body: BODY, t: "2026-11-17 09:10:00" };
    const { aide, seen } = aideOf();
    const ev = await collect(newsEvents({ id: "d1", ask: asked }, { loadDoc: async () => doc, related: false, aide }));
    expect(ev[0]).toMatchObject({ type: "first" });
    expect(ev.some((e) => e.type === "brief")).toBe(true);
    expect(seen).toHaveLength(1);
  });
});
