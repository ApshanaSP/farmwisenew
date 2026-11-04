import { describe, expect, it } from "vitest";
import { afterHold, isContinue, isGoodbye, isHoldOnly, turn, turnStart, type TurnAction, type TurnEvent, type TurnModel } from "./turn";

/** Run events through turn(), collecting each step's actions. */
function play(events: TurnEvent[], m0: TurnModel = turnStart()) {
  let m = m0;
  const acts: TurnAction[][] = [];
  for (const e of events) { const r = turn(m, e); m = r.m; acts.push(r.act); }
  return { m, acts };
}
const OPEN: TurnEvent[] = [{ type: "open" }];
const SENT: TurnEvent[] = [...OPEN, { type: "vadStart", at: 0 }, { type: "vadEnd", at: 900, ms: 700, short: false }];
const SPEAKING: TurnEvent[] = [...SENT, { type: "text", text: "news" }, { type: "ttsStart" }];

describe("turn-taking", () => {
  it("listens, captures, transcribes, answers and listens again", () => {
    const { m, acts } = play([...SENT, { type: "text", text: "show me the severe cases" }, { type: "ttsStart" }, { type: "ttsEnd" }]);
    expect(acts[1]).toEqual([{ a: "capture" }]);
    expect(acts[2]).toEqual([{ a: "transcribe", gen: 1 }]);
    expect(acts[3]).toEqual([{ a: "handle", text: "show me the severe cases", gen: 1 }]);
    expect(m.state).toBe("listening");
  });
  it("a short noise while listening is dropped, not sent to speech-to-text", () => {
    const { m, acts } = play([...OPEN, { type: "vadStart", at: 0 }, { type: "vadEnd", at: 800, ms: 100, short: true }]);
    expect(m.state).toBe("listening");
    expect(acts[2]).toEqual([{ a: "dropCapture" }]);
  });
  it("closing while speaking cancels the voice and the question", () => {
    const { acts, m } = play([...SPEAKING, { type: "close" }]);
    expect(acts[acts.length - 1][0]).toEqual({ a: "cancelVoice" });
    expect(acts[acts.length - 1]).toContainEqual({ a: "cancelTurn" });
    expect(m.state).toBe("off");
  });
});

describe("two-stage barge-in", () => {
  it("the energy gate pauses at once; only Silero-confirmed speech held 200 ms cancels the turn", () => {
    const r = play(SPEAKING);
    const p = turn(r.m, { type: "quickOnset", at: 5000 });
    expect(p.m.state).toBe("paused");
    expect(p.act).toEqual([{ a: "pauseVoice" }, { a: "capture" }]);
    // energy alone never cancels, however long
    expect(turn(p.m, { type: "tick", at: 5400, heldMs: 400 }).act).toEqual([]);
    const conf = turn(p.m, { type: "vadStart", at: 5040 });
    expect(conf.m.confirmed).toBe(true);
    const early = turn(conf.m, { type: "tick", at: 5100, heldMs: 100 });
    expect(early.act).toEqual([]);
    const c = turn(early.m, { type: "tick", at: 5220, heldMs: 220 });
    expect(c.m.state).toBe("interrupted");
    expect(c.act).toEqual([{ a: "cancelVoice" }, { a: "cancelTurn" }]);
    expect(c.m.bargeIns).toBe(1);
  });
  it("a cough at the VAD end event resumes from where it stopped (noise-resume)", () => {
    const { m, acts } = play([...SPEAKING, { type: "vadStart", at: 3000 }, { type: "tick", at: 3080, heldMs: 80 }, { type: "vadEnd", at: 3400, ms: 120, short: true }]);
    expect(m.state).toBe("speaking");
    expect(acts[acts.length - 1]).toEqual([{ a: "dropCapture" }, { a: "resumeVoice" }]);
  });
  it("speech under 250 ms at the end event resumes even if the flag says otherwise", () => {
    const { m } = play([...SPEAKING, { type: "vadStart", at: 3000 }, { type: "vadEnd", at: 3400, ms: 240, short: false }]);
    expect(m.state).toBe("speaking");
  });
  it("an energy onset Silero never confirms resumes at the gate's end", () => {
    const { m, acts } = play([...SPEAKING, { type: "quickOnset", at: 3000 }, { type: "quickEnd", at: 3300 }]);
    expect(m.state).toBe("speaking");
    expect(acts[acts.length - 1]).toEqual([{ a: "dropCapture" }, { a: "resumeVoice" }]);
  });
  it("a sentence said over Jarvis cancels and is transcribed; the generation moves on", () => {
    const { m, acts } = play([...SPEAKING, { type: "vadStart", at: 5000 }, { type: "tick", at: 5220, heldMs: 220 }, { type: "vadEnd", at: 6200, ms: 1200, short: false }]);
    expect(m.state).toBe("thinking");
    expect(acts[acts.length - 1].some((x) => x.a === "transcribe")).toBe(true);
    expect(m.gen).toBeGreaterThan(1);
  });
  it("speech while Jarvis thinks is captured; the question is cancelled only once held long enough", () => {
    const base = play([...SENT, { type: "text", text: "rain" }, { type: "vadStart", at: 1500 }]);
    expect(base.m.state).toBe("hearing");
    expect(base.acts[base.acts.length - 1]).toEqual([{ a: "capture" }]);
    const noise = turn(base.m, { type: "vadEnd", at: 1800, ms: 100, short: true });
    expect(noise.m.state).toBe("thinking");
    expect(noise.act).toEqual([{ a: "dropCapture" }]);
    const held = turn(base.m, { type: "tick", at: 1720, heldMs: 220 });
    expect(held.act).toEqual([{ a: "cancelTurn" }]);
    expect(held.m.gen).toBeGreaterThan(base.m.gen);
  });
  it("Esc stops everything at once and the answer can be continued", () => {
    const { m, acts } = play([...SPEAKING, { type: "stop" }]);
    expect(m.state).toBe("listening");
    expect(acts[acts.length - 1]).toEqual([{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "dropCapture" }]);
    expect(m.canContinue).toBe(true);
  });
});

describe("late transcripts and old answers", () => {
  it("a late transcript while the Collector is already saying the next sentence is dropped", () => {
    const { m } = play([...SENT, { type: "vadStart", at: 1200 }]);
    expect(m.state).toBe("hearing");
    const late = turn(m, { type: "text", text: "show me the severe cases" });
    expect(late.act).toEqual([]);
    expect(late.m.state).toBe("hearing");
    expect(turn(late.m, { type: "vadEnd", at: 2500, ms: 1200, short: false }).act).toContainEqual({ a: "transcribe", gen: 2 });
  });
  it("a transcript from an older generation is dropped even when one is awaited", () => {
    const { m } = play([...SENT, { type: "vadStart", at: 1200 }, { type: "tick", at: 1420, heldMs: 220 }, { type: "vadEnd", at: 2500, ms: 1200, short: false }]);
    expect(m.awaiting).toBe(true);
    expect(turn(m, { type: "text", text: "old sentence", gen: 1 }).act).toEqual([]);
    expect(turn(m, { type: "text", text: "new sentence", gen: m.gen }).act[0]).toMatchObject({ a: "handle", text: "new sentence" });
  });
  it("the words still count when the acknowledgement started playing before Whisper answered (the 'On it.' bug)", () => {
    const { m } = play([...SENT, { type: "ttsStart" }]);
    expect(m.state).toBe("speaking");
    const r = turn(m, { type: "text", text: "show me the severe cases" });
    expect(r.act).toEqual([{ a: "handle", text: "show me the severe cases", gen: 1 }]);
    expect(r.m.state).toBe("thinking");
    // and a second, stray transcript later is not taken
    expect(turn(r.m, { type: "text", text: "again" }).act).toEqual([]);
  });
  it("the words still count when a noise had paused the acknowledgement", () => {
    const { m } = play([...SENT, { type: "ttsStart" }, { type: "vadStart", at: 1000 }]);
    expect(m.state).toBe("paused");
    const r = turn(m, { type: "text", text: "flooding in Adyar" });
    expect(r.act).toEqual([{ a: "cancelVoice" }, { a: "dropCapture" }, { a: "handle", text: "flooding in Adyar", gen: 1 }]);
    expect(r.m.state).toBe("thinking");
  });
});

describe("holding", () => {
  const hold = (word: string) => {
    const r = play([...SPEAKING, { type: "vadStart", at: 5000 }, { type: "tick", at: 5220, heldMs: 220 }, { type: "vadEnd", at: 5600, ms: 500, short: false }]);
    return turn(r.m, { type: "text", text: word, gen: r.m.gen });
  };
  for (const w of ["wait", "Stop.", "one second", "hold on", "இரு", "நில்லு", "ஒரு நிமிஷம்"]) {
    it(`"${w}" goes silent, changes nothing, listens up to 4 s longer and does not answer the word`, () => {
      const h = hold(w);
      expect(h.m.state).toBe("holding");
      expect(h.act).toEqual([{ a: "cancelVoice" }, { a: "hold", ms: 4000 }]);
      expect(h.act.some((x) => x.a === "handle")).toBe(false);
    });
  }
  it('"wait, show Anna Nagar" is hold plus command, handled as a command', () => {
    expect(afterHold("Wait, show Anna Nagar")).toBe("show Anna Nagar");
    const r = hold("wait, show Anna Nagar");
    expect(r.act).toEqual([{ a: "handle", text: "show Anna Nagar", gen: r.m.gen }]);
    expect(r.m.state).toBe("thinking");
  });
  it('"continue" and தொடரு resume the interrupted answer from its chunk', () => {
    for (const c of ["continue", "தொடரு", "Jarvis, go on"]) {
      const h = hold("wait");
      const after = play([{ type: "vadStart", at: 7000 }, { type: "vadEnd", at: 7500, ms: 400, short: false }], h.m);
      const r = turn(after.m, { type: "text", text: c, gen: after.m.gen });
      expect(r.act).toEqual([{ a: "resumeAnswer" }]);
      expect(r.m.state).toBe("speaking");
    }
  });
  it('"continue" with nothing to continue just listens', () => {
    const { m } = play(SENT);
    const r = turn(m, { type: "text", text: "continue", gen: m.gen });
    expect(r.act).toEqual([]);
    expect(r.m.state).toBe("listening");
  });
  it("the hold runs out back to listening; speech during it is a new sentence", () => {
    const h = hold("wait");
    expect(turn(h.m, { type: "holdOver" }).m.state).toBe("listening");
    expect(turn(h.m, { type: "vadStart", at: 7000 }).act).toEqual([{ a: "capture" }]);
  });
  it("whole sentences only: 'stop all water supply complaints' is a request", () => {
    expect(isHoldOnly("hold on")).toBe(true);
    expect(isHoldOnly("நிறுத்து")).toBe(true);
    expect(isHoldOnly("stop all water supply complaints")).toBe(false);
    expect(isContinue("continue")).toBe(true);
    expect(isContinue("continue the flood drafts")).toBe(false);
    expect(isGoodbye("pothum")).toBe(true);
    expect(isGoodbye("Jarvis, go to sleep")).toBe(true);
    expect(isGoodbye("is that all the cases")).toBe(false);
    const { m } = play(SENT);
    expect(turn(m, { type: "text", text: "stop the flooding drafts in Adyar", gen: m.gen }).act[0]).toMatchObject({ a: "handle" });
  });
  it('"go to sleep" ends the session', () => {
    const { m } = play(SENT);
    const r = turn(m, { type: "text", text: "Jarvis, go to sleep.", gen: m.gen });
    expect(r.m.state).toBe("off");
    expect(r.act).toContainEqual({ a: "endSession" });
  });
});
