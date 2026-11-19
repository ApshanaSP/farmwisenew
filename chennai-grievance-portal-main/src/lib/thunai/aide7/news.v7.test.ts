import { describe, expect, it } from "vitest";
import { WORLD } from "../fixture";
import type { Rung } from "../llm";
import { newsEvents, type NewsEvent, type StoredDoc } from "../web/serve";
import { coverageLine, newsAide } from "./news";
import type { OpenRung, RungCall } from "./stream";

const BODY = "Residents of Kotturpuram said water had stood on three streets for two days after the canal overflowed. The corporation said pumps were sent on Monday night. Officials said desilting of the canal would begin this week.";
const DOC: StoredDoc = { id: "d1", url: "https://www.thehindu.com/news/cities/chennai/x.ece", title: "Kotturpuram streets waterlogged as canal overflows", publisher: "The Hindu", publisher_domain: "thehindu.com", body: BODY, t: "2026-11-17 09:10:00" };
const RUNGS: Rung[] = [{ provider: "groq", model: "qwen/qwen3.8-27b" }];
/** a writer that cites the article's facts by what it finds in the prompt */
const writer = (calls: RungCall[]): OpenRung => async (rung, c, onText) => {
  calls.push(c);
  const f = (re: RegExp) => [...c.prompt.matchAll(/^(F\d+) \[[^\]]+\] (.*)$/gm)].find((m) => re.test(m[2]))?.[1];
  onText("GAP: none\n");
  onText(`S: The Hindu reports that three streets in Kotturpuram have been under water for two days after the canal overflowed. [${f(/three streets/)}]\n`);
  onText(`S: The corporation says it sent pumps, and desilting of the canal is to begin this week. [${f(/pumps/)},${f(/desilting/)}]\n`);
  return { provider: rung.provider, model: rung.model, tokens: 40, firstMs: 1, ms: 2, stop: null };
};
async function collect(it: AsyncGenerator<NewsEvent>): Promise<NewsEvent[]> { const out: NewsEvent[] = []; for await (const e of it) out.push(e); return out; }

describe("v7: the news route's brief is written by the aide from the article", () => {
  it("streams the checked sentences in the asked language, one more each brief event", async () => {
    const calls: RungCall[] = [];
    const ev = await collect(newsEvents({ id: "d1", ask: { q: "tell me about this news", lang: "en" } }, { loadDoc: async () => DOC, related: false, aide: newsAide(WORLD, { user: "t", write: { open: writer(calls), rungs: () => RUNGS } }) }));
    const briefs = ev.filter((e): e is Extract<NewsEvent, { type: "brief" }> => e.type === "brief");
    expect(briefs.map((b) => b.brief.en.length)).toEqual([1, 2]);
    expect(briefs[1].brief.en[0]).toMatch(/^The Hindu reports that three streets/);
    expect(calls[0].prompt).toContain("QUESTION: tell me about this news");
    expect(calls[0].prompt).toMatch(/\[The Hindu\] The Hindu wrote: Residents of Kotturpuram/);
    expect(ev[0]).toMatchObject({ type: "first" });
  });
  it("without the asked sentence, the code brief is said as in v6", async () => {
    const ev = await collect(newsEvents({ id: "d1" }, { loadDoc: async () => DOC, related: false, aide: newsAide(WORLD, { user: "t", write: { open: writer([]), rungs: () => RUNGS } }) }));
    const briefs = ev.filter((e): e is Extract<NewsEvent, { type: "brief" }> => e.type === "brief");
    expect(briefs).toHaveLength(1);
    expect(briefs[0].brief.en.join(" ")).not.toMatch(/^The Hindu reports that three streets/);
  });
  it("names the other outlets in one line", () => {
    expect(coverageLine([{ outlet: "DT Next" }, { outlet: "The Times of India" }, { outlet: "DT Next" }], "en")).toBe("DT Next and The Times of India covered it too; their links are on the screen.");
    expect(coverageLine([], "en")).toBeNull();
  });
});
