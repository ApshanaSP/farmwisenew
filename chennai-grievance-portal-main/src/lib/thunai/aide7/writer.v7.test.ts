import { describe, expect, it } from "vitest";
import { WORLD } from "../fixture";
import type { Rung } from "../llm";
import { gazetteer } from "./gazetteer";
import type { Sheet7 } from "./ground";
import { WRITER_SYSTEM, userMessage } from "./prompt";
import type { OpenRung, RungCall } from "./stream";
import { fallbackLines, writeAnswer } from "./writer";

const gaz = gazetteer(WORLD);
const sheet: Sheet7 = {
  lang: "en", gaz, shown: ["Low lying area Pillaiyar Koil St, Guindy Industrial Estate inundated"],
  facts: [
    { id: "F1", src: "dashboard", text: "The incident: a low-lying street inundated at Guindy Industrial Estate, Adyar zone; rated severe" },
    { id: "F2", src: "dashboard", text: "Open since yesterday afternoon", times: ["since yesterday afternoon"] },
    { id: "F3", src: "dashboard", text: "Held by PWD Water Resources; no officer is named on it" },
    { id: "F4", src: "dashboard", text: "Its deadline passed yesterday" }
  ]
};
const input = { question: "tell me about the Adyar issue", lang: "en" as const, sheet, note: "The screen shows the incident's card.", fallback: "Standing water at Guindy since yesterday afternoon. It's one of the serious ones. The PWD has it." };
const RUNGS: Rung[] = [{ provider: "groq", model: "qwen/qwen3.8-27b" }, { provider: "groq", model: "openai/gpt-oss-120b" }];

/** a model that sends `text` in pieces, `gap` ms apart, after `delay` ms; it stops when aborted */
function fake(script: Record<string, { text?: string; delay?: number; gap?: number; fail?: boolean }[]>, calls: RungCall[] = []): OpenRung {
  const n: Record<string, number> = {};
  return async (rung, c, onText) => {
    calls.push(c);
    const k = rung.model;
    const s = script[k]?.[n[k] = (n[k] ?? -1) + 1] ?? script[k]?.[script[k].length - 1] ?? { fail: true };
    const wait = (ms: number) => new Promise<void>((res, rej) => { const t = setTimeout(res, ms); c.signal.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("aborted", "AbortError")); }, { once: true }); });
    await wait(s.delay ?? 5);
    if (s.fail) throw new Error("boom");
    for (const piece of (s.text ?? "").match(/[\s\S]{1,12}/g) ?? []) { await wait(s.gap ?? 2); onText(piece); }
    return { provider: rung.provider, model: rung.model, tokens: 100, firstMs: s.delay ?? 5, ms: 50, stop: null };
  };
}
const opts = (open: OpenRung, extra: Partial<Parameters<typeof writeAnswer>[1]> = {}) => ({ user: "t", until: Date.now() + 5000, firstBy: Date.now() + 3000, open, rungs: () => RUNGS, ...extra });

const GOOD = "GAP: none\nS: Standing water at Guindy Industrial Estate in Adyar since yesterday afternoon, rated severe. [F1,F2]\nS: PWD Water Resources has it, but no officer is named and the deadline passed yesterday. [F3,F4]\nS: Worth asking PWD Water Resources for an officer today. [F3]";

describe("v7 answer writer", () => {
  it("speaks each checked sentence as it comes, before the model has finished", async () => {
    const heard: { s: string; at: number }[] = [];
    const t0 = Date.now();
    const w = await writeAnswer(input, opts(fake({ "qwen/qwen3.8-27b": [{ text: GOOD, gap: 15 }] }), { onSentence: (s) => heard.push({ s, at: Date.now() - t0 }) }));
    expect(w.by).toBe("model");
    expect(w.sentences).toHaveLength(3);
    expect(heard[0].s).toMatch(/^Standing water at Guindy/);
    expect(heard[0].at).toBeLessThan(heard[2].at);
    expect(w.sentences.join(" ")).not.toMatch(/\[F\d/);
    expect(w.gap).toBeNull();
  });
  it("tells the same model what was wrong when the first sentence fails, once", async () => {
    const calls: RungCall[] = [];
    const bad = "GAP: none\nS: Standing water at Guindy since Monday morning. [F1,F2]";
    const w = await writeAnswer(input, opts(fake({ "qwen/qwen3.8-27b": [{ text: bad }, { text: GOOD }] }, calls)));
    expect(w.by).toBe("model");
    expect(calls).toHaveLength(2);
    expect(calls[1].prompt).toContain("YOUR LAST ANSWER WAS NOT USED");
    expect(calls[1].prompt).toMatch(/monday|morning/i);
    expect(w.rejected[0].problems.map((p) => p.kind)).toContain("time");
  });
  it("drops a later sentence that fails, and says nothing after it", async () => {
    const mixed = "GAP: none\nS: Standing water at Guindy Industrial Estate in Adyar since yesterday afternoon. [F1,F2]\nS: The Minister visited it this morning. [F1]\nS: PWD Water Resources has it. [F3]";
    const w = await writeAnswer(input, opts(fake({ "qwen/qwen3.8-27b": [{ text: mixed }] })));
    expect(w.sentences).toEqual(["Standing water at Guindy Industrial Estate in Adyar since yesterday afternoon."]);
    expect(w.rejected).toHaveLength(1);
  });
  it("moves to the next rung when one sends nothing in its first-text time", async () => {
    const w = await writeAnswer(input, opts(fake({ "qwen/qwen3.8-27b": [{ text: GOOD, delay: 4000 }], "openai/gpt-oss-120b": [{ text: GOOD }] }), { firstBy: Date.now() + 6000, until: Date.now() + 8000 }));
    expect(w.by).toBe("model");
    expect(w.hops[0]).toMatch(/qwen.*no-text/);
    expect(w.model).toBe("openai/gpt-oss-120b");
  }, 10_000);
  it("falls back to the recipe's own line when nothing checked comes, and never announces a reading", async () => {
    const heard: string[] = [];
    const w = await writeAnswer({ ...input, fallback: "12 headlines. Reading them now." }, opts(fake({ "qwen/qwen3.8-27b": [{ fail: true }], "openai/gpt-oss-120b": [{ fail: true }] }), { onSentence: (s) => heard.push(s) }));
    expect(w.by).toBe("fallback");
    expect(w.sentences).toEqual(["12 headlines."]);
    expect(heard).toEqual(["12 headlines."]);
  });
  it("reads the gap the model names", async () => {
    const w = await writeAnswer(input, opts(fake({ "qwen/qwen3.8-27b": [{ text: "GAP: the CM's visit\nS: Standing water at Guindy Industrial Estate in Adyar since yesterday afternoon. [F1,F2]" }] })));
    expect(w.gap).toBe("the CM's visit");
    expect(w.sentences).toHaveLength(1);
  });
  it("a reply that names only a gap is the answer: no second model is asked (the gap search takes over)", async () => {
    const calls: RungCall[] = [];
    const w = await writeAnswer(input, { ...opts(fake({ "qwen/qwen3.8-27b": [{ text: "GAP: the CM's visit" }], "openai/gpt-oss-120b": [{ text: GOOD }] }, calls)), noFallbackOnGap: true });
    expect(calls).toHaveLength(1);
    expect(w.gap).toBe("the CM's visit");
    expect(w.sentences).toEqual([]);
  });
  it("a preamble or an echo of the facts is never spoken", async () => {
    const heard: string[] = [];
    const w = await writeAnswer(input, opts(fake({ "qwen/qwen3.8-27b": [{ text: `Here is the spoken answer:
FACTS:
F1 [dashboard] x
${GOOD}` }] }), { onSentence: (s) => heard.push(s) }));
    expect(heard[0]).toMatch(/^Standing water at Guindy/);
    expect(heard.join(" ")).not.toMatch(/Here is|FACTS|F1 \[/);
    expect(w.sentences).toHaveLength(3);
  });
  it("keeps the instructions byte-identical across turns (the cached prefix) and over 512 tokens", async () => {
    const calls: RungCall[] = [];
    await writeAnswer(input, opts(fake({ "qwen/qwen3.8-27b": [{ text: GOOD }] }, calls)));
    await writeAnswer({ ...input, question: "what's the status of the flooding", lang: "en" }, opts(fake({ "qwen/qwen3.8-27b": [{ text: GOOD }] }, calls)));
    expect(calls[0].system).toBe(calls[1].system);
    expect(calls[0].system).toBe(WRITER_SYSTEM);
    expect(WRITER_SYSTEM.length / 4).toBeGreaterThan(512);
    expect(WRITER_SYSTEM).not.toMatch(/\d{4}-\d{2}-\d{2}|Adyar/);
  });
  it("builds the per-turn message with the question, language, screen and facts", () => {
    const m = userMessage({ question: "adyar issue pathi sollu", lang: "ta", note: "The screen shows a card.", facts: [{ id: "F1", src: "dashboard", text: "x", times: ["since yesterday", "நேற்றிலிருந்து"] }] });
    expect(m).toContain("ANSWER IN: Tamil");
    expect(m).toContain("F1 [dashboard] x (Tamil: நேற்றிலிருந்து)");
  });
  it("keeps the fallback to four sentences and drops an announced reading", () => {
    expect(fallbackLines("One. Two! Three? Four. Five.")).toEqual(["One.", "Two!", "Three?", "Four."]);
    expect(fallbackLines("12 headlines. Reading them now.")).toEqual(["12 headlines."]);
  });
});
