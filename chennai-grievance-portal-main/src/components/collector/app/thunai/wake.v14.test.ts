/**
 * v14 (21 Nov), the closed wake after the adversarial review of v13 (lens "scenarios", finding 2: the owner's "it replies while I am still
 * saying Jarvis"). The browser's recogniser is a stand-in; the timers are fake. Invented sentences only.
 *  - The name alone in an interim result no longer wakes at once: it waits for the wake's quiet (400 ms) with no newer words, or for the
 *    final result; words after the name make it the same-breath request, as before.
 *  - The device's wake word with no recogniser running opens at once but leaves the reply to the quiet (wakeWait "listen").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wakeQuietMs, wakeWait } from "./kws";
import { startWake } from "./wake";

interface Rec { onresult: ((e: unknown) => void) | null; onend: (() => void) | null; aborted: boolean }
let recs: Rec[] = [];
class FakeRec {
  lang = ""; interimResults = false; continuous = false; maxAlternatives = 1; aborted = false;
  onresult: ((e: unknown) => void) | null = null; onend: (() => void) | null = null; onerror: ((e: { error: string }) => void) | null = null;
  constructor() { recs.push(this as unknown as Rec); }
  start() { /* listening */ }
  stop() { /* */ }
  abort() { this.aborted = true; }
}
/** one result list: each entry a result (its alternatives, and whether it is final) */
const ev = (results: { alts: string[]; isFinal: boolean }[], resultIndex = 0) =>
  ({ resultIndex, results: results.map((r) => Object.assign(r.alts.map((transcript) => ({ transcript })), { isFinal: r.isFinal })) });

beforeEach(() => {
  recs = [];
  vi.useFakeTimers();
  vi.stubGlobal("window", { webkitSpeechRecognition: FakeRec });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function listen() {
  const woke: string[] = [];
  const stop = startWake({ onWake: (rest) => woke.push(rest) });
  return { woke, stop, r: recs[0] };
}

describe("v14 scenarios 2: the closed recogniser's name alone waits for the quiet", () => {
  it("an interim 'hi Jarvis' does not wake at once; it wakes after the wake's quiet with no newer words", () => {
    const { woke, stop, r } = listen();
    r.onresult?.(ev([{ alts: ["hi"], isFinal: false }]));
    r.onresult?.(ev([{ alts: ["hi Jarvis"], isFinal: false }]));
    expect(woke).toEqual([]);
    expect(r.aborted).toBe(false);
    // the same reading again is no newer words: the wait is not pushed back
    vi.advanceTimersByTime(wakeQuietMs() - 100);
    r.onresult?.(ev([{ alts: ["Hi Jarvis."], isFinal: false }]));
    expect(woke).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(woke).toEqual([""]);
    expect(r.aborted).toBe(true);
    stop();
  });
  it("the request said straight on is handed over whole: 'hi Jarvis' then 'hi Jarvis what are the flooded streets'", () => {
    const { woke, stop, r } = listen();
    r.onresult?.(ev([{ alts: ["hi Jarvis"], isFinal: false }]));
    vi.advanceTimersByTime(200);
    r.onresult?.(ev([{ alts: ["hi Jarvis what are the flooded"], isFinal: false }]));
    vi.advanceTimersByTime(wakeQuietMs());
    // no name-alone wake meanwhile: the sentence is waited for
    expect(woke).toEqual([]);
    r.onresult?.(ev([{ alts: ["hi Jarvis what are the flooded streets"], isFinal: true }]));
    expect(woke).toEqual(["what are the flooded streets"]);
    vi.advanceTimersByTime(5000);
    expect(woke).toHaveLength(1);
    stop();
  });
  it("a final 'hi Jarvis' wakes at once (the recogniser heard its end)", () => {
    const { woke, stop, r } = listen();
    r.onresult?.(ev([{ alts: ["hi Jarvis"], isFinal: true }]));
    expect(woke).toEqual([""]);
    stop();
  });
  it("a newer reading that drops the name (it was 'hi Travis') does not wake", () => {
    const { woke, stop, r } = listen();
    r.onresult?.(ev([{ alts: ["hi Jarvis"], isFinal: false }]));
    r.onresult?.(ev([{ alts: ["hi Travis", "hi travis road"], isFinal: false }]));
    vi.advanceTimersByTime(wakeQuietMs() + 50);
    expect(woke).toEqual([]);
    stop();
  });
  it("the recogniser ending while the name alone waits wakes then: the name is never lost to its restart", () => {
    const { woke, stop, r } = listen();
    r.onresult?.(ev([{ alts: ["hey Jarvis"], isFinal: false }]));
    r.onend?.();
    expect(woke).toEqual([""]);
    vi.advanceTimersByTime(1000);
    expect(woke).toHaveLength(1);
    stop();
  });
  it("stopped while it waits: no wake", () => {
    const { woke, stop, r } = listen();
    r.onresult?.(ev([{ alts: ["hi Jarvis"], isFinal: false }]));
    stop();
    vi.advanceTimersByTime(wakeQuietMs() + 50);
    expect(woke).toEqual([]);
  });
});

describe("v14 scenarios 2: the device's wake word with no recogniser", () => {
  it("opens at once, the reply left to the quiet ('listen'); with the quiet already there it opens with the reply", () => {
    const q = wakeQuietMs();
    expect(wakeWait({ sinceKws: 0, quietMs: 40, recogniser: false, quietNeeded: q })).toBe("listen");
    expect(wakeWait({ sinceKws: 0, quietMs: q, recogniser: false, quietNeeded: q })).toBe("open");
    // with a recogniser, as v12 left it
    expect(wakeWait({ sinceKws: 30, quietMs: 0, recogniser: true, quietNeeded: q })).toBe("wait");
  });
});
