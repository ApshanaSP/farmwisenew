import { describe, expect, it } from "vitest";
import { encodeEvent, NDJSON, type RoundOutWire, type TurnEvent } from "@/lib/thunai/events";
import { readRound } from "./turnstream";

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
