import { describe, expect, it } from "vitest";
import { echoApplied, echoAudio, sileroRunner } from "./ears";

describe("the echo canceller: all of the system's playout where the browser has it", () => {
  it('asks for echoCancellation "all" when the browser knows the constraint, and nothing it cannot honour otherwise', () => {
    expect(echoAudio({ echoCancellation: true }, "all")).toMatchObject({ echoCancellation: "all", noiseSuppression: true, autoGainControl: true, channelCount: 1 });
    expect(echoAudio({ echoCancellation: true }, true)).toMatchObject({ echoCancellation: true });
    expect(echoAudio({}, "all")).not.toHaveProperty("echoCancellation");
    expect(echoAudio(undefined, "all")).not.toHaveProperty("echoCancellation");
  });
  it("records what the track says it got: all (Chromium and Edge 141+), the classic canceller, or none", () => {
    expect(echoApplied({ echoCancellation: "all" })).toBe("all");
    expect(echoApplied({ echoCancellation: "remote-only" })).toBe("remote-only");
    expect(echoApplied({ echoCancellation: true })).toBe("on");
    expect(echoApplied({ echoCancellation: false })).toBe("off");
    expect(echoApplied({})).toBe("unknown");
    expect(echoApplied(undefined)).toBe("unknown");
  });
});

describe("Silero's state is reset for each session", () => {
  it("the recurrent state carries from frame to frame, and reset() puts it back to zeros", async () => {
    const seen: number[] = [];
    class Tensor { constructor(public type: string, public data: Float32Array | BigInt64Array, public dims: number[]) {} }
    const sess = { run: async (feeds: Record<string, Tensor>) => { const s = feeds.state.data as Float32Array; seen.push(s[0]); const next = new Float32Array(256).fill(s[0] + 1); return { output: { data: new Float32Array([0.9]) }, stateN: new Tensor("float32", next, [2, 1, 128]) }; } };
    const s = sileroRunner({ Tensor } as never, sess as never);
    expect(await s.run(new Float32Array(512))).toBeCloseTo(0.9);
    await s.run(new Float32Array(512));
    await s.run(new Float32Array(512));
    expect(seen).toEqual([0, 1, 2]);
    s.reset();
    await s.run(new Float32Array(512));
    expect(seen).toEqual([0, 1, 2, 0]);
  });
});
