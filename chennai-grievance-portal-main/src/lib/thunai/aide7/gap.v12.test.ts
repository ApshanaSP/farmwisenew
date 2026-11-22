/**
 * v12 (21 Nov): a cancelled turn's aide stops. At 06:42 the first flooded-roads turn was cancelled in the browser at about 06:42:13; the server
 * still fetched 7 outlets' feeds from 06:42:13.4 and recorded "answered" at 06:42:15 (the report, stale-and-double RC7). findGap now takes the
 * turn's signal and starts no look-up once it has aborted; the aide passes the abort on instead of saying a "nothing found" line. Invented text.
 */
import { describe, expect, it } from "vitest";
import type { AgentResult } from "../agent";
import { WORLD } from "../fixture";
import type { Rung } from "../llm";
import type { StageDocT } from "../stage";
import { findGap } from "./gap";
import { aideAnswer } from "./index";
import type { OpenRung } from "./stream";

const Q = "CM Vijay is visiting Adyar, what should I know";
const NOW = Date.parse("2026-11-17T10:00:00+05:30");
const DOC: StageDocT = {
  v: 1, id: "st-x", recipe: "situation", title: "The situation · Adyar · the last 24 hours", takeaway: null, say: { en: "In Adyar, 12 incidents came in over the last 24 hours against 15 the 24 hours before.", ta: "x" },
  blocks: [{ kind: "Kpis", id: "kpis", title: "The situation", items: [{ key: "now", label: "Reported in Adyar, the last 24 hours", value: 12, unit: null, prev: 15, delta: -3, tone: "good", spark: [] }] }],
  scope: { period: "daily", zone: 13, dept: null, cat: null, taluk: null, sev: null }, slots: {}, sources: [], asOf: null, notes: [], lang: "en"
};
const R = { kind: "do", lang: "en", reply: null, steps: [], stage: DOC, stageOp: null, say: DOC.say.en, options: [], rounds: 0, calls: [], model: null, ms: 0, note: "asks7:outside" } as AgentResult & { stage: StageDocT };
const RUNGS: Rung[] = [{ provider: "groq", model: "qwen/qwen3.8-27b" }];

describe("v12: a cancelled turn starts no look-up", () => {
  it("findGap with a cancelled turn: an AbortError, and no outlet's feed is read", async () => {
    const ac = new AbortController();
    ac.abort();
    let feeds = 0;
    const e = await findGap("CM Vijay's visit to Adyar", Q, { world: WORLD, signal: ac.signal, now: () => NOW, feeds: async () => { feeds++; return []; } }).catch((x: unknown) => x);
    expect((e as DOMException).name).toBe("AbortError");
    expect(feeds).toBe(0);
  });

  it("cancelled while the dashboard's own news was searched: the feeds are not read", async () => {
    const ac = new AbortController();
    let feeds = 0;
    const e = await findGap("CM Vijay's visit to Adyar", Q, { world: WORLD, signal: ac.signal, now: () => NOW,
      dashboardNews: async () => { ac.abort(); return []; }, feeds: async () => { feeds++; return []; } }).catch((x: unknown) => x);
    expect((e as DOMException).name).toBe("AbortError");
    expect(feeds).toBe(0);
  });

  it("a live turn still reads the feeds (the signal changes nothing until it aborts)", async () => {
    const ac = new AbortController();
    const f = await findGap("CM Vijay's visit to Adyar", Q, { world: WORLD, signal: ac.signal, now: () => NOW, dashboardNews: async () => [],
      feeds: async () => [{ outlet: "The Hindu", outletTa: null, title: "CM Vijay to visit Adyar flood areas on Friday", url: null, at: NOW - 3600_000, from: "web" }] });
    expect(f.status).toBe("ok");
  });

  it("the aide: a turn cancelled while its answer was written says no 'nothing found' line and ends as an abort", async () => {
    const ac = new AbortController();
    const said: string[] = [];
    // the writer names a gap, and the Collector speaks again while it writes
    const open: OpenRung = async (rung, _c, onText) => { onText("GAP: CM Vijay's visit\nS: Adyar had 12 incidents in the last 24 hours.\n"); ac.abort(); return { provider: rung.provider, model: rung.model, tokens: 10, firstMs: 1, ms: 2, stop: null }; };
    let feeds = 0;
    const e = await aideAnswer(R, { question: Q, world: WORLD, user: "t", now: () => NOW, signal: ac.signal, write: { open, rungs: () => RUNGS }, emit: (s) => said.push(s),
      dashboardNews: async () => [], feeds: async () => { feeds++; return []; } }).catch((x: unknown) => x);
    expect((e as Error)?.name).toBe("AbortError");
    expect(feeds).toBe(0);
    expect(said.some((s) => /^Nothing in the dashboard/.test(s))).toBe(false);
  });
});
