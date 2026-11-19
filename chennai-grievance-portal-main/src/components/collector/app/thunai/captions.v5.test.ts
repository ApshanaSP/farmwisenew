/**
 * C3 (v5 build): the browser's caption recogniser runs only while Jarvis is woken or engaged: within ENGAGED_MS of the wake or of
 * Jarvis's last turn, or while it speaks (the conductor's inWindow). Outside that window no room audio goes to the browser's speech
 * service. The recogniser here is a stand-in on window: nothing is sent anywhere, and no sentence is used.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Captions } from "./captions";
import { HearingCaptions } from "./turnstate";

class Rec {
  static made: Rec[] = [];
  lang = ""; interimResults = false; continuous = false; maxAlternatives = 1;
  onresult: unknown = null; onend: (() => void) | null = null; onerror: unknown = null;
  start = vi.fn(); stop = vi.fn(); abort = vi.fn();
  constructor() { Rec.made.push(this); }
}
const started = () => Rec.made.filter((r) => r.start.mock.calls.length > 0).length;
const noop = () => undefined;

beforeEach(() => { Rec.made = []; vi.stubGlobal("window", { SpeechRecognition: Rec }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("the caption recogniser asks the window before it starts", () => {
  it("idle and unengaged: start() starts no recogniser at all", () => {
    const c = new Captions("en-IN", noop, () => false);
    expect(c.start()).toBe(false);
    expect(Rec.made.length).toBe(0);
    expect(started()).toBe(0);
  });
  it("on a wake, and inside the window, it starts once", () => {
    const c = new Captions("en-IN", noop, () => true);
    expect(c.start()).toBe(true);
    expect(started()).toBe(1);
    expect(Rec.made[0].start).toHaveBeenCalledTimes(1);
    c.stop();
  });
  it("the browser ends it after the window has closed: it is not started again", () => {
    vi.useFakeTimers();
    let open = true;
    const c = new Captions("en-IN", noop, () => open);
    c.start();
    expect(started()).toBe(1);
    open = false;
    Rec.made[0].onend?.();
    vi.advanceTimersByTime(10_000);
    expect(started()).toBe(1);
    c.stop();
  });
  it("a language change outside the window starts nothing", () => {
    const c = new Captions("en-IN", noop, () => false);
    c.setLang("ta-IN");
    expect(started()).toBe(0);
  });
});

describe("as the console runs it: speech start, with a spoken yes awaited", () => {
  it("a yes awaited outside the window starts no recogniser; inside it, one", () => {
    let open = false;
    const hc = new HearingCaptions(() => new Captions("en-IN", noop, () => open));
    hc.speechStart({ on: true, engaged: false, awaitingYes: true });
    expect(started()).toBe(0);
    hc.speechEnd();
    open = true;
    hc.speechStart({ on: true, engaged: true, awaitingYes: false });
    expect(started()).toBe(1);
    hc.speechEnd();
  });
});

describe("Thunai.tsx makes the captions only inside the conductor's window", () => {
  const src = fs.readFileSync(path.join(__dirname, "Thunai.tsx"), "utf8");
  const between = (a: string, b: string) => { const i = src.indexOf(a); const j = src.indexOf(b, i + a.length); return i >= 0 && j > i ? src.slice(i, j) : ""; };
  it("the maker and the recogniser's own gate both ask conductor.inWindow()", () => {
    const open = between("const openMic = () => {", "const setModeRef");
    expect(open).toContain("new HearingCaptions(");
    expect(open.match(/inWindow\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(open).toMatch(/new Captions\([^]*?,\s*may\)/);
  });
  it("the engaged window is ENGAGED_MS, one constant (no 20_000 of its own)", () => {
    // (the watch's first tick at 20 s and its 120 s interval are not the window)
    expect(src).not.toMatch(/(?:<=|\+)\s*20_000\b/);
    expect(between("const engagedNow = ", "\n")).toContain("ENGAGED_MS");
  });
});
