import { describe, expect, it } from "vitest";
import { bumpDataEpoch } from "@/lib/collector/epoch";
import { cachedInput, type WatchInput } from "./signals";

// RC-35 (QA pass 4): a decision reaches every cached reader at once. The watch's store input (v4, kept a minute for every Collector) holds the
// past-deadline stock with the Collector's decisions on top, so a decision empties it, as it empties Jarvis's tool results (round.ts toolCache).
describe("the watch's cached store input follows the data epoch (RC-35)", () => {
  it("is shared within the minute, and read again after a decision", async () => {
    let loads = 0;
    const load = async () => ({ n: ++loads }) as unknown as WatchInput;
    const follows = [{ kind: "zone", ref: "13-epoch-test" }] as never;
    const a = await cachedInput(follows, load);
    const b = await cachedInput(follows, load);
    expect(loads).toBe(1);
    expect(b).toBe(a);
    bumpDataEpoch();
    await cachedInput(follows, load);
    expect(loads).toBe(2);
  });
});
