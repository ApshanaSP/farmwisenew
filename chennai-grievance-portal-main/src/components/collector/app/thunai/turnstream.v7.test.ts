import { describe, expect, it } from "vitest";
import { encodeEvent, NDJSON, type RoundOutWire, type TurnEvent } from "@/lib/thunai/events";
import { answersV7, readRound, SayQueue } from "./turnstream";

const T = "t-v7";
const out: RoundOutWire = { done: true, result: null, steps: [], trace: [], tokens: 10, calls: 1, hops: [], lane: "quick", cached: false };
const ev = (e: Record<string, unknown>): TurnEvent => ({ turnId: T, round: 0, ...e }) as unknown as TurnEvent;
const body = (events: TurnEvent[]) => new Response(events.map(encodeEvent).join(""), { headers: { "Content-Type": `${NDJSON}; charset=utf-8` } });

describe("v7: each aide sentence's server-checked figures reach the browser's gate", () => {
  it("the figures go with their sentence; a sentence without them has none; junk is dropped", async () => {
    const got: { t: string; f?: number[] }[] = [];
    await readRound(body([
      ev({ type: "TEXT_MESSAGE_CONTENT", messageId: "m", delta: "The Hindu reports 3 deaths in the collapse.", lang: "en", figures: [3] }),
      ev({ type: "TEXT_MESSAGE_CONTENT", messageId: "m", delta: "Nothing else is known.", lang: "en" }),
      ev({ type: "TEXT_MESSAGE_CONTENT", messageId: "m", delta: "Odd figures.", lang: "en", figures: ["x", 4, null, Infinity] }),
      ev({ type: "RUN_FINISHED", out })
    ]), { turnId: T, live: () => true, hooks: { sentence: (t, _l, f) => got.push({ t, f }) } });
    expect(got).toEqual([{ t: "The Hindu reports 3 deaths in the collapse.", f: [3] }, { t: "Nothing else is known.", f: undefined }, { t: "Odd figures.", f: [4] }]);
  });
});

describe("v7 review 3A: sentences queued while one plays are said together, with every one's own figures", () => {
  it("the joined utterance carries the union of its sentences' figures (it is no single sentence's text, so a lookup by text missed it)", () => {
    const said: { text: string; figures?: number[] }[] = [];
    let end: (() => void) | null = null;
    const q = new SayQueue((text, onEnd, figures) => { said.push({ text, figures }); end = onEnd; return true; }, () => true);
    q.push("Adyar has 38 open cases.", [38]);
    // these two arrive while the first plays: they are said together when it ends
    q.push("The Hindu reports 3 injured.", [3]);
    q.push("Want the details?");
    q.push("It is 2.4 times last week's.", [2.4, 38]);
    expect(said).toEqual([{ text: "Adyar has 38 open cases.", figures: [38] }]);
    end!();
    expect(said[1].text).toBe("The Hindu reports 3 injured. Want the details? It is 2.4 times last week's.");
    expect([...(said[1].figures ?? [])].sort((a, b) => a - b)).toEqual([2.4, 3, 38]);
  });
  it("a run of sentences with no figures of their own is said with none (the screen's figures gate it, as before)", () => {
    const said: { text: string; figures?: number[] }[] = [];
    let end: (() => void) | null = null;
    const q = new SayQueue((text, onEnd, figures) => { said.push({ text, figures }); end = onEnd; return true; }, () => true);
    q.push("First.");
    q.push("Second.");
    end!();
    expect(said.map((s) => s.figures?.length ?? 0)).toEqual([0, 0]);
  });
});

describe("v7 review 3C: the browser's v7 lanes follow the answer style", () => {
  it("NEXT_PUBLIC_JARVIS_ANSWER=v6 (with the server's JARVIS_ANSWER=v6) turns them off; unset or anything else keeps v7's", () => {
    expect(answersV7("v6")).toBe(false);
    expect(answersV7(" V6 ")).toBe(false);
    expect(answersV7(undefined)).toBe(true);
    expect(answersV7("")).toBe(true);
    expect(answersV7("v7")).toBe(true);
  });
});
