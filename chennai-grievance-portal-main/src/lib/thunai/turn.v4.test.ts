import { describe, expect, it } from "vitest";
import { turn, turnStart, type TurnAction, type TurnEvent, type TurnModel } from "./turn";
import { TUNING } from "./vad";

/** Run events through turn(), collecting each step's actions. */
function play(events: TurnEvent[], m0: TurnModel = turnStart()) {
  let m = m0;
  const acts: TurnAction[][] = [];
  for (const e of events) { const r = turn(m, e); m = r.m; acts.push(r.act); }
  return { m, acts };
}
const SPEAKING: TurnEvent[] = [{ type: "open" }, { type: "vadStart", at: 0 }, { type: "vadEnd", at: 900, ms: 700, short: false }, { type: "text", text: "news" }, { type: "ttsStart" }];
const speaking = () => play(SPEAKING).m;
/** a short sentence said over the voice (under 600 ms, no captions): it is read while the voice stays ducked */
const shortOver = (m = speaking(), ms = 400) => play([{ type: "vadStart", at: 5000 }, { type: "tick", at: 5300, heldMs: 300 }, { type: "vadEnd", at: 5000 + ms + 300, ms, short: false }], m);
const all = (acts: TurnAction[][]) => acts.flat().map((x) => x.a);

describe("v4 barge-in: duck first, stop only for a real bid for the turn", () => {
  it("an onset while Jarvis speaks ducks the voice, from the energy gate or from Silero; it never pauses it", () => {
    const q = turn(speaking(), { type: "quickOnset", at: 5000 });
    expect(q.m.state).toBe("paused");
    expect(q.act).toEqual([{ a: "duckVoice" }, { a: "capture" }]);
    const v = turn(speaking(), { type: "vadStart", at: 5000 });
    expect(v.m.state).toBe("paused");
    expect(v.act).toEqual([{ a: "duckVoice" }, { a: "capture" }]);
  });
  it("speech held under 600 ms stays ducked; held 600 ms it stops the voice and the turn", () => {
    const d = turn(speaking(), { type: "vadStart", at: 5000 }).m;
    expect(turn(d, { type: "tick", at: 5400, heldMs: 400 }).act).toEqual([]);
    expect(turn(d, { type: "tick", at: 5590, heldMs: TUNING.bargeHoldMs - 10 }).act).toEqual([]);
    const c = turn(d, { type: "tick", at: 5600, heldMs: TUNING.bargeHoldMs });
    expect(c.m.state).toBe("interrupted");
    expect(c.act).toEqual([{ a: "cancelVoice" }, { a: "cancelTurn" }]);
    expect(TUNING.bargeHoldMs).toBe(600);
  });
  it("live words: two that are not backchannels stop the voice; mm-hmm, okay, சரி, seri and one word do not", () => {
    const d = play([{ type: "quickOnset", at: 5000 }, { type: "vadStart", at: 5040 }], speaking()).m;
    for (const w of ["mm-hmm", "okay okay", "சரி", "ஆமா ஓகே", "seri aama", "hmm right", "show"]) expect(turn(d, { type: "words", text: w }).act, w).toEqual([]);
    const c = turn(d, { type: "words", text: "okay show trends" });
    expect(c.m.state).toBe("interrupted");
    expect(c.act).toEqual([{ a: "cancelVoice" }, { a: "cancelTurn" }]);
    expect(turn(d, { type: "words", text: "அடையாறு காட்டு" }).m.state).toBe("interrupted");
  });
  it("a cough, or an energy onset Silero never confirms, brings the voice back up where it was", () => {
    const cough = play([{ type: "vadStart", at: 3000 }, { type: "vadEnd", at: 3400, ms: 120, short: true }], speaking());
    expect(cough.m.state).toBe("speaking");
    expect(cough.acts[1]).toEqual([{ a: "dropCapture" }, { a: "unduckVoice" }]);
    const gate = play([{ type: "quickOnset", at: 3000 }, { type: "quickEnd", at: 3300 }], speaking());
    expect(gate.m.state).toBe("speaking");
    expect(gate.acts[1]).toEqual([{ a: "dropCapture" }, { a: "unduckVoice" }]);
  });
  it("a short mm-hmm said over the voice: it stays ducked while Whisper reads it, then comes back up; nothing is handled", () => {
    const s = speaking();
    const r = shortOver(s);
    expect(r.acts[r.acts.length - 1]).toEqual([{ a: "transcribe", gen: s.gen + 1 }]);
    expect(r.m.state).toBe("paused");
    expect(all(r.acts)).not.toContain("cancelVoice");
    expect(all(r.acts)).not.toContain("cancelTurn");
    for (const w of ["mm-hmm", "okay", "சரி", "seri", "aama", "Mm hmm.", "", "continue"]) {
      const t = turn(r.m, { type: "text", text: w, gen: r.m.gen });
      expect(t.act, w).toEqual([{ a: "dropCapture" }, { a: "unduckVoice" }]);
      expect(t.m.state).toBe("speaking");
      expect(t.m.awaiting).toBe(false);
    }
  });
  it("a yes when a card is waiting for one is an answer, not a backchannel", () => {
    const r = shortOver();
    const t = turn(r.m, { type: "text", text: "yes", gen: r.m.gen, yesWanted: true });
    expect(t.act).toEqual([{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "dropCapture" }, { a: "handle", text: "yes", gen: r.m.gen }]);
    expect(t.m.state).toBe("thinking");
  });
  it("a short command said over the voice stops it and is handled; a stale reading is dropped", () => {
    const r = shortOver();
    const t = turn(r.m, { type: "text", text: "show trends", gen: r.m.gen });
    expect(t.act).toEqual([{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "dropCapture" }, { a: "handle", text: "show trends", gen: r.m.gen }]);
    expect(t.m.state).toBe("thinking");
    expect(turn(r.m, { type: "text", text: "show trends", gen: r.m.gen - 1 }).act).toEqual([]);
  });
  it("hold words keep working: a short wait or stop over the voice goes silent and holds, and continue brings the answer back", () => {
    for (const w of ["wait", "stop", "இரு", "நிறுத்து", "one second"]) {
      const r = shortOver();
      const h = turn(r.m, { type: "text", text: w, gen: r.m.gen });
      expect(h.m.state, w).toBe("holding");
      expect(h.act).toEqual([{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "hold", ms: TUNING.holdExtendMs }]);
      const c = play([{ type: "vadStart", at: 9000 }, { type: "vadEnd", at: 9600, ms: 400, short: false }], h.m);
      expect(turn(c.m, { type: "text", text: "continue", gen: c.m.gen }).act).toEqual([{ a: "resumeAnswer" }]);
    }
  });
  it('"wait, show Anna Nagar" said over the voice is the command', () => {
    const r = shortOver(speaking(), 550);
    const t = turn(r.m, { type: "text", text: "wait, show Anna Nagar", gen: r.m.gen });
    expect(t.act).toContainEqual({ a: "handle", text: "show Anna Nagar", gen: r.m.gen });
    expect(t.act).toContainEqual({ a: "cancelVoice" });
  });
  it("the name alone over the voice stops it and listens; elsewhere it changes nothing", () => {
    const r = shortOver();
    const n = turn(r.m, { type: "nameOnly", gen: r.m.gen });
    expect(n.m.state).toBe("holding");
    expect(n.act).toEqual([{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "hold", ms: TUNING.holdExtendMs }]);
    const l = play([{ type: "open" }, { type: "vadStart", at: 0 }, { type: "vadEnd", at: 900, ms: 500, short: false }]);
    const x = turn(l.m, { type: "nameOnly", gen: l.m.gen });
    expect(x.act).toEqual([]);
    expect(x.m.state).toBe("listening");
  });
  it("a sentence over the voice that lasted 600 ms or more is a barge-in even when no tick said so", () => {
    const s = speaking();
    const r = play([{ type: "vadStart", at: 5000 }, { type: "vadEnd", at: 6200, ms: 900, short: false }], s);
    expect(r.acts[1]).toEqual([{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "transcribe", gen: s.gen + 1 }]);
    expect(r.m.state).toBe("thinking");
  });
  it("an earcon's onset never ducks or stops the voice", () => {
    const s = speaking();
    expect(turn(s, { type: "quickOnset", at: 5000, earcon: true })).toEqual({ m: s, act: [] });
    expect(turn(s, { type: "vadStart", at: 5000, earcon: true })).toEqual({ m: s, act: [] });
  });
  it("the voice ended while ducked: nothing said comes back to listening, never a silent speaking", () => {
    const a = play([{ type: "vadStart", at: 5000 }, { type: "ttsEnd" }, { type: "vadEnd", at: 5300, ms: 100, short: true }], speaking());
    expect(a.m.state).toBe("listening");
    const r = shortOver();
    const b = play([{ type: "ttsEnd" }, { type: "text", text: "okay", gen: r.m.gen }], r.m);
    expect(b.m.state).toBe("listening");
  });
  it("a cough while the short sentence is read keeps the voice ducked until the words come back", () => {
    const r = shortOver();
    const c = play([{ type: "vadStart", at: 7000 }, { type: "vadEnd", at: 7300, ms: 100, short: true }], r.m);
    expect(c.acts[0]).toEqual([{ a: "capture" }]);
    expect(c.acts[1]).toEqual([{ a: "dropCapture" }]);
    expect(c.m.state).toBe("paused");
    expect(turn(c.m, { type: "text", text: "mm-hmm", gen: r.m.gen }).act).toEqual([{ a: "dropCapture" }, { a: "unduckVoice" }]);
  });
  it("more speech while the short sentence is read is captured and read again with it; the older reading is dropped", () => {
    const r = shortOver();
    const more = play([{ type: "vadStart", at: 7000 }, { type: "vadEnd", at: 7500, ms: 400, short: false }], r.m);
    expect(more.acts[1]).toEqual([{ a: "transcribe", gen: r.m.gen + 1 }]);
    expect(turn(more.m, { type: "text", text: "mm-hmm", gen: r.m.gen }).act).toEqual([]);
    expect(turn(more.m, { type: "text", text: "show trends", gen: more.m.gen }).act).toContainEqual({ a: "handle", text: "show trends", gen: more.m.gen });
  });
  it("live words while the short sentence is read change nothing: Whisper's words decide", () => {
    const r = shortOver();
    expect(turn(r.m, { type: "words", text: "show the trends" }).act).toEqual([]);
  });
});
