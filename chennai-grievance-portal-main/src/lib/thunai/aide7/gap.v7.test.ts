import { describe, expect, it } from "vitest";
import type { AgentResult } from "../agent";
import { WORLD } from "../fixture";
import type { Rung } from "../llm";
import type { StageDocT } from "../stage";
import { gapPhrase, gapWords, matches, nothingLine } from "./gap";
import { aideAnswer } from "./index";
import type { OpenRung, RungCall } from "./stream";

const Q = "CM Vijay is visiting Adyar, what should I know";
const DOC: StageDocT = {
  v: 1, id: "st-x", recipe: "situation", title: "The situation · Adyar · the last 24 hours", takeaway: null, say: { en: "In Adyar, 12 incidents came in over the last 24 hours against 15 the 24 hours before.", ta: "x" },
  blocks: [{ kind: "Kpis", id: "kpis", title: "The situation", items: [{ key: "now", label: "Reported in Adyar, the last 24 hours", value: 12, unit: null, prev: 15, delta: -3, tone: "good", spark: [] }] }],
  scope: { period: "daily", zone: 13, dept: null, cat: null, taluk: null, sev: null }, slots: {}, sources: [], asOf: null, notes: [], lang: "en"
};
const R = { kind: "do", lang: "en", reply: null, steps: [], stage: DOC, stageOp: null, say: DOC.say.en, options: [], rounds: 0, calls: [], model: null, ms: 0, note: "asks7:outside" } as AgentResult & { stage: StageDocT };
const RUNGS: Rung[] = [{ provider: "groq", model: "qwen/qwen3.8-27b" }];
/** first call: the dashboard part, no gap named; second call (the gap's reports): one sentence citing the report */
const writer = (calls: RungCall[]): OpenRung => async (rung, c, onText) => {
  calls.push(c);
  if (/only this part/.test(c.prompt)) onText("GAP: none\nS: The Hindu reports that CM Vijay is to visit the Adyar flood areas on Friday. [F1]\n");
  else { const id = c.prompt.match(/^(F\d+) .*Reported in Adyar/m)?.[1]; onText(`GAP: none\nS: Adyar had 12 incidents in the last 24 hours, down from 15. [${id}]\n`); }
  return { provider: rung.provider, model: rung.model, tokens: 30, firstMs: 1, ms: 2, stop: null };
};
const NOW = Date.parse("2026-11-17T10:00:00+05:30");

describe("v7: the part the dashboard does not hold", () => {
  it("reads the gap's words from the question, and matches a report only on them and the event", () => {
    expect(gapWords("CM Vijay's visit to Adyar", Q, WORLD)).toEqual(["cm", "vijay"]);
    expect(gapPhrase("cm vijay visiting", Q)).toBe("CM Vijay visiting");
    expect(matches("CM Vijay to visit Adyar flood areas on Friday", ["cm", "vijay"], Q)).toBe(true);
    expect(matches("CM Vijay reviews the budget", ["cm", "vijay"], Q)).toBe(false);
  });
  it("found in an outlet's feed: one more checked sentence naming the outlet, and the report as a link", async () => {
    const calls: RungCall[] = [];
    const a = await aideAnswer(R, { question: Q, world: WORLD, user: "t", now: () => NOW, gapHint: ["cm", "vijay", "visiting"], write: { open: writer(calls), rungs: () => RUNGS },
      dashboardNews: async () => [], feeds: async () => [{ outlet: "The Hindu", outletTa: "தி இந்து", title: "CM Vijay to visit Adyar flood areas on Friday", url: "https://www.thehindu.com/x", at: NOW - 2 * 3600_000, from: "web" }] });
    expect(a.written.sentences[0]).toMatch(/^Adyar had 12 incidents/);
    expect(a.gap?.status).toBe("ok");
    expect(a.result.say).toMatch(/The Hindu reports that CM Vijay is to visit/);
    expect(a.result.stage?.blocks.some((b) => b.kind === "NewsReader" && b.id === "aide-gap")).toBe(true);
    expect(calls).toHaveLength(2);
  });
  it("found nowhere: said plainly, in the Collector's own words, and nothing invented", async () => {
    const a = await aideAnswer(R, { question: Q, world: WORLD, user: "t", now: () => NOW, gapHint: ["cm", "vijay", "visiting"], write: { open: writer([]), rungs: () => RUNGS },
      dashboardNews: async () => [], feeds: async () => [{ outlet: "DT Next", outletTa: null, title: "Metro work on OMR delayed", url: "https://dtnext.in/y", at: NOW, from: "web" }] });
    expect(a.gap?.status).toBe("nothing");
    expect(a.result.say).toContain("Nothing in the dashboard or the latest news mentions CM Vijay visiting.");
    expect(a.result.say).not.toMatch(/Friday|Metro/);
  });
  it("the dashboard's own news first: the web is not read when it has the report", async () => {
    let fed = false;
    const a = await aideAnswer(R, { question: Q, world: WORLD, user: "t", now: () => NOW, gapHint: ["cm", "vijay", "visiting"], write: { open: writer([]), rungs: () => RUNGS },
      dashboardNews: async () => [{ outlet: "The Hindu", outletTa: null, title: "CM Vijay to visit Adyar flood areas on Friday", url: null, at: NOW - 3600_000, from: "dashboard" }],
      feeds: async () => { fed = true; return []; } });
    expect(a.gap?.hits[0].from).toBe("dashboard");
    expect(fed).toBe(false);
  });
  it("a cause or a why is no gap to look up (the record answers it: it shows what moved, not why)", async () => {
    const calls: RungCall[] = [];
    const why = (c: RungCall[]): OpenRung => async (rung, c2, onText) => { c.push(c2); onText("GAP: the cause of the rise; the facts only show what moved, not why\nS: Adyar had 12 incidents in the last 24 hours, down from 15. [F2]\n"); return { provider: rung.provider, model: rung.model, tokens: 30, firstMs: 1, ms: 2, stop: null }; };
    let searched = false;
    const a = await aideAnswer({ ...R, note: null }, { question: "why are complaints rising in Adyar", world: WORLD, user: "t", now: () => NOW, write: { open: why(calls), rungs: () => RUNGS },
      dashboardNews: async () => { searched = true; return []; }, feeds: async () => { searched = true; return []; } });
    expect(searched).toBe(false);
    expect(a.gap).toBeNull();
    expect(a.result.say).not.toMatch(/nothing on/i);
  });
  it("a place name alone is no search: the gap's words must name something besides the place", () => {
    expect(gapWords("Adyar", "tell me about the Adyar issue", WORLD)).toEqual([]);
    expect(gapWords("CM Vijay's visit to Adyar", Q, WORLD)).toEqual(["cm", "vijay"]);
  });
  it("the writer's gap in its own words ('the Chief Minister's visit'): the question's own words are looked for", async () => {
    let seen: string[] = [];
    const own: OpenRung = async (rung, c2, onText) => { onText(/only this part/.test(c2.prompt) ? "GAP: none\nS: The Hindu reports that CM Vijay is to visit the Adyar flood areas on Friday. [F1]\n" : "GAP: the Chief Minister's visit itself\nS: Adyar had 12 incidents in the last 24 hours, down from 15. [F2]\n"); return { provider: rung.provider, model: rung.model, tokens: 30, firstMs: 1, ms: 2, stop: null }; };
    const a = await aideAnswer(R, { question: Q, world: WORLD, user: "t", now: () => NOW, gapHint: ["cm", "vijay", "visiting"], write: { open: own, rungs: () => RUNGS },
      dashboardNews: async (w) => { seen = w; return []; }, feeds: async () => [{ outlet: "The Hindu", outletTa: null, title: "CM Vijay to visit Adyar flood areas on Friday", url: "https://www.thehindu.com/x", at: NOW - 3600_000, from: "web" }] });
    expect(seen).toEqual(["cm", "vijay"]);
    expect(a.gap?.status).toBe("ok");
    expect(a.result.say).toMatch(/CM Vijay is to visit/);
  });
  it("the nothing line says only what was searched", () => {
    expect(nothingLine("முதல்வர் வருகை", "ta", "news")).toBe("முதல்வர் வருகை பற்றி டாஷ்போர்டிலும் சமீபத்திய செய்திகளிலும் எதுவும் இல்லை.");
    expect(nothingLine("CM Vijay visiting", "en", "dashboard")).toBe("The dashboard has nothing on CM Vijay visiting.");
    expect(nothingLine("CM Vijay visiting", "en", "unavailable")).toBe("The dashboard has nothing on CM Vijay visiting, and the news feeds could not be read just now.");
  });
  it("no web search (switched off): the line claims only the dashboard", async () => {
    const prev = process.env.JARVIS_AIDE_WEB;
    process.env.JARVIS_AIDE_WEB = "0";
    try {
      const a = await aideAnswer(R, { question: Q, world: WORLD, user: "t", now: () => NOW, gapHint: ["cm", "vijay", "visiting"], write: { open: writer([]), rungs: () => RUNGS } });
      expect(a.result.say).toContain("The dashboard has nothing on CM Vijay visiting.");
      expect(a.result.say).not.toMatch(/news mentions/);
    } finally { if (prev == null) delete process.env.JARVIS_AIDE_WEB; else process.env.JARVIS_AIDE_WEB = prev; }
  });
  it("the feeds could not be read: said so, never 'nothing in the news'", async () => {
    const a = await aideAnswer(R, { question: Q, world: WORLD, user: "t", now: () => NOW, gapHint: ["cm", "vijay", "visiting"], write: { open: writer([]), rungs: () => RUNGS },
      dashboardNews: async () => [], feeds: async () => { throw new Error("feeds unavailable"); } });
    expect(a.gap?.status).toBe("unavailable");
    expect(a.result.say).toContain("could not be read just now");
  });
});
