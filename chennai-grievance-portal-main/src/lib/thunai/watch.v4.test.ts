import { describe, expect, it } from "vitest";
import { INTERJECT, band, canSpeak, emptyWatch, mayInterject, planWatch, toSignal, withPref, withSeen, withSpoken, type InterjectState, type WatchState } from "./watch";
import type { WatchSignal } from "./signals";

// noon in Chennai, 15 Nov 2026 (06:30 UTC)
const NOON = Date.UTC(2026, 10, 15, 6, 30);
const sig = (over: Partial<WatchSignal> = {}): WatchSignal => ({ key: "rise:zonecat:5::DRAINAGE_SEWAGE", kind: "rise", topic: "rise:zonecat:5::DRAINAGE_SEWAGE", place: null, metric: "reports",
  value: 22, expected: 5, n: 12, method: "m", caveat: { en: "c", ta: "c" }, sources: [], severity: "high", level: 2, lifeSafety: false, text: { en: "x", ta: "x" }, values: {}, weight: 1, ...over });
const state = (over: Partial<InterjectState> = {}): InterjectState => ({ now: NOON, signal: sig(), collectorSpeaking: false, turnInFlight: false, jarvisSpeaking: false, lastUserSpeech: null,
  quiet: false, watch: emptyWatch(), ...over });

describe("interjections: rarely, and never over the Collector", () => {
  it("a high signal at noon with nothing else going on may interject, after a chime", () => {
    expect(mayInterject(state())).toEqual({ ok: true, why: "chime, then one line" });
  });
  it("never while the Collector speaks, never while a turn runs, never while Jarvis speaks: across 2,000 random states, even for life safety", () => {
    let seed = 11;
    const r = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
    for (let k = 0; k < 2000; k++) {
      const which = Math.floor(r() * 3);
      const s = state({ now: NOON + Math.floor(r() * 86_400_000), collectorSpeaking: which === 0, turnInFlight: which === 1, jarvisSpeaking: which === 2,
        quiet: r() < 0.3, lastUserSpeech: r() < 0.5 ? null : NOON - r() * 600_000,
        signal: sig({ severity: r() < 0.7 ? "high" : "medium", lifeSafety: r() < 0.3, level: Math.floor(r() * 4) }) });
      expect(mayInterject(s).ok).toBe(false);
    }
  });
  it("medium waits in the queue unless the Collector said 'tell me' about it", () => {
    expect(mayInterject(state({ signal: sig({ severity: "medium" }) }))).toEqual({ ok: false, why: "not urgent: queued" });
    const told = withPref(emptyWatch(), "tell", sig().topic, NOON);
    expect(mayInterject(state({ signal: sig({ severity: "medium" }), watch: told })).ok).toBe(true);
  });
  it("'not about this' and 'later' are honoured; 'later' runs out", () => {
    const muted = withPref(emptyWatch(), "mute", sig().topic, NOON);
    expect(mayInterject(state({ watch: muted })).why).toMatch(/not about this/);
    const later = withPref(emptyWatch(), "later", sig().key, NOON, 30);
    expect(mayInterject(state({ watch: later })).why).toMatch(/later/);
    expect(mayInterject(state({ watch: later, now: NOON + 31 * 60_000 })).ok).toBe(true);
    expect(mayInterject(state({ watch: withPref(muted, "unmute", sig().topic, NOON) })).ok).toBe(true);
  });
  it("at most three an hour, ten minutes apart, and not the same thing twice unless it is worse", () => {
    let w: WatchState = emptyWatch();
    w = withSpoken(w, "a", 1, NOON - 50 * 60_000);
    expect(mayInterject(state({ watch: w })).ok).toBe(true);
    w = withSpoken(w, "b", 1, NOON - 30 * 60_000);
    w = withSpoken(w, "c", 1, NOON - 15 * 60_000);
    expect(mayInterject(state({ watch: w })).why).toBe("hourly budget spent");
    const soon = withSpoken(emptyWatch(), "a", 1, NOON - 5 * 60_000);
    expect(mayInterject(state({ watch: soon })).why).toBe("too soon after the last one");
    const told = withSpoken(emptyWatch(), sig().key, 2, NOON - 3 * 3_600_000);
    expect(mayInterject(state({ watch: told })).why).toBe("already told");
    expect(mayInterject(state({ watch: told, signal: sig({ level: 3 }) })).ok).toBe(true);
    expect(INTERJECT.perHour).toBe(3);
  });
  it("quiet mode, a moment after the Collector spoke, and quiet hours hold it back; life safety is let through those", () => {
    expect(mayInterject(state({ quiet: true })).why).toBe("quiet mode");
    expect(mayInterject(state({ lastUserSpeech: NOON - 10_000 })).why).toBe("the Collector spoke a moment ago");
    const night = Date.UTC(2026, 10, 15, 17, 30); // 23:00 in Chennai
    expect(mayInterject(state({ now: night })).why).toBe("quiet hours");
    expect(mayInterject(state({ now: night, quiet: true, signal: sig({ lifeSafety: true }) })).ok).toBe(true);
  });
  it("the plan: at most one interjection, the rest queued for the badge; muted and snoozed ones are out of both", () => {
    const a = sig({ key: "a", topic: "ta" }), b = sig({ key: "b", topic: "tb", severity: "medium" }), c = sig({ key: "c", topic: "tc" }), d = sig({ key: "d", topic: "td" });
    const w = withPref(withPref(emptyWatch(), "mute", "tc", NOON), "later", "d", NOON);
    const p = planWatch([a, b, c, d], { now: NOON, collectorSpeaking: false, turnInFlight: false, lastUserSpeech: null, quiet: false, watch: w });
    expect(p.interject?.key).toBe("a");
    expect(p.queue.map((x) => x.key)).toEqual(["b"]);
    expect(p.badge).toBe(1);
    const busy = planWatch([a, b], { now: NOON, collectorSpeaking: true, turnInFlight: false, lastUserSpeech: null, quiet: false, watch: emptyWatch() });
    expect(busy.interject).toBeNull();
    expect(busy.why).toBe("the Collector is speaking");
    expect(busy.badge).toBe(2);
  });
  it("seen and told state stays small and drops what is old", () => {
    let w = withSeen(emptyWatch(), [{ key: "a", level: 1 }], NOON - 3 * 86_400_000, true);
    w = withSeen(w, [{ key: "b", level: 1 }], NOON);
    expect(Object.keys(w.seen)).toEqual(["b"]);
    expect(Object.keys(w.told)).toEqual([]);
  });
  it("a server signal scores in the older Watch: high speaks, medium is a chip", () => {
    expect(band(toSignal(sig()))).toBe("speak");
    expect(band(toSignal(sig({ severity: "medium" })))).toBe("chip");
    expect(canSpeak(toSignal(sig()), { spoken: [], last: {} }, NOON, { quiet: false, lastUserSpeech: null })).toBe(true);
  });
});
