import { describe, expect, it } from "vitest";
import { FakeCtx, FakeGain } from "./fakeaudio.testkit";
import { joinSamples, l16ToFloat, pieceStarts, Player } from "./pcmplay";

const ctxOf = () => new FakeCtx() as unknown as AudioContext;

describe("16-bit PCM", () => {
  it("reads little-endian signed samples and carries an odd byte into the next piece", () => {
    // 0x0000 = 0, 0x7fff = 32767, 0x8000 = -32768, split after the third byte
    const a = l16ToFloat(new Uint8Array([0x00, 0x00, 0xff]), null);
    expect(Array.from(a.samples)).toEqual([0]);
    expect(a.carry).toBe(0xff);
    const b = l16ToFloat(new Uint8Array([0x7f, 0x00, 0x80]), a.carry);
    expect(b.samples[0]).toBeCloseTo(32767 / 32768, 6);
    expect(b.samples[1]).toBe(-1);
    expect(b.carry).toBeNull();
  });
  it("joins a stream's pieces into one buffer at their rate", () => {
    const c = ctxOf();
    const buf = joinSamples(c, [new Float32Array(12_000), new Float32Array(12_000)], 24_000);
    expect(buf.duration).toBe(1);
  });
});

describe("the player", () => {
  it("schedules pieces end to end, tracks the place on the audio clock, and resolves when the last has played", async () => {
    const f = new FakeCtx(), c = f as unknown as AudioContext;
    const p = new Player(c, new FakeGain() as unknown as AudioNode, 0.02);
    p.push(joinSamples(c, [new Float32Array(24_000)], 24_000));
    p.push(joinSamples(c, [new Float32Array(12_000)], 24_000));
    expect(f.sources.map((s) => s.started)).toEqual([[0.02, 0], [1.02, 0]]);
    f.currentTime = 1.27;
    expect(p.position()).toBeCloseTo(1.25, 6);
    let done: boolean | null = null;
    void p.done().then((v) => { done = v; });
    p.end();
    f.sources[0].end();
    await Promise.resolve();
    expect(done).toBeNull();
    f.sources[1].end();
    await Promise.resolve(); await Promise.resolve();
    expect(done).toBe(true);
  });
  it("plays a kept buffer from an offset (\"continue\"), and a stop resolves it as cut and stops every source", async () => {
    const f = new FakeCtx(), c = f as unknown as AudioContext;
    const p = new Player(c, new FakeGain() as unknown as AudioNode);
    p.push(joinSamples(c, [new Float32Array(48_000)], 24_000), 0.5);
    expect(f.sources[0].started?.[1]).toBe(0.5);
    expect(p.scheduled).toBeCloseTo(1.5, 6);
    const d = p.done();
    p.stop(0.3);
    expect(await d).toBe(false);
    expect(f.sources[0].stopped).toBe(0.3);
  });
  it("places each piece by its share of the characters", () => {
    expect(pieceStarts([10, 30, 60], 10)).toEqual([0, 1, 4]);
  });
});
