/**
 * v5 D3, re-speak after a false interruption (docs/jarvis/JARVIS_V5_BUILD_2.md, Phase 5), on the turn machine. Invented sentences only.
 * Speech held over Jarvis's voice cuts it (barge-in, 600 ms or two live words). When what was said turns out to hold no words that
 * bid for the turn (only a backchannel: "mm-hmm", "okay", சரி, "seri"), the answer is said again from the start of the sentence it
 * was cut on (resumeAnswer: mouth.ts continueAnswer, a cancel and a fresh utterance, never pause/resume). An empty transcript after a
 * cut is the conductor's (conductor.ts backOn, v4): the machine itself does nothing there, so the answer is never re-spoken twice.
 */
import { describe, expect, it } from "vitest";
import { turn, turnStart, type TurnAction, type TurnEvent, type TurnModel } from "./turn";
import { TUNING } from "./vad";

function play(events: TurnEvent[], m0: TurnModel = turnStart()) {
  let m = m0;
  const acts: TurnAction[][] = [];
  for (const e of events) { const r = turn(m, e); m = r.m; acts.push(r.act); }
  return { m, acts };
}
const SPEAKING: TurnEvent[] = [{ type: "open" }, { type: "vadStart", at: 0 }, { type: "vadEnd", at: 900, ms: 700, short: false }, { type: "text", text: "news" }, { type: "ttsStart" }];
const speaking = () => play(SPEAKING).m;
/** speech over the voice held 600 ms: a barge-in cut; then it ends and is sent to be read */
const cutByHold = () => play([{ type: "vadStart", at: 5000 }, { type: "tick", at: 5000 + TUNING.bargeHoldMs, heldMs: TUNING.bargeHoldMs }, { type: "vadEnd", at: 5900, ms: 800, short: false }], speaking());
/** speech over the voice that ends past 600 ms with no tick: cut at the end event */
const cutAtEnd = () => play([{ type: "vadStart", at: 5000 }, { type: "vadEnd", at: 5900, ms: 800, short: false }], speaking());
const last = (r: { acts: TurnAction[][] }) => r.acts[r.acts.length - 1];

describe("D3: a cut whose words hold no bid for the turn re-speaks the answer from the cut sentence", () => {
  it("the cut happened and the sentence is with the transcriber", () => {
    for (const c of [cutByHold(), cutAtEnd()]) {
      expect(c.acts.flat()).toContainEqual({ a: "cancelVoice" });
      expect(last(c)).toContainEqual({ a: "transcribe", gen: c.m.gen });
      expect(c.m.state).toBe("thinking");
    }
  });
  it.each(["mm-hmm", "okay", "Okay.", "சரி", "seri", "aama", "hmm right"])("only a backchannel came back (%s): resumeAnswer, nothing handled", (w) => {
    for (const c of [cutByHold(), cutAtEnd()]) {
      const r = turn(c.m, { type: "text", text: w, gen: c.m.gen });
      expect(r.act).toEqual([{ a: "resumeAnswer" }]);
      expect(r.m.state).toBe("speaking");
      expect(r.m.handling).toBe(false);
    }
  });
  it("a real request after the cut is handled as before", () => {
    const c = cutByHold();
    const r = turn(c.m, { type: "text", text: "show the trends page", gen: c.m.gen });
    expect(r.act).toEqual([{ a: "handle", text: "show the trends page", gen: c.m.gen }]);
  });
  it("a yes said while an ask card waits for one is an answer, not a backchannel", () => {
    const c = cutByHold();
    const r = turn(c.m, { type: "text", text: "yes", gen: c.m.gen, yesWanted: true });
    expect(r.act).toEqual([{ a: "handle", text: "yes", gen: c.m.gen }]);
  });
  it("an empty transcript after the cut: the machine does nothing itself (conductor.ts backOn re-speaks, v4)", () => {
    const c = cutByHold();
    const r = turn(c.m, { type: "text", text: "", gen: c.m.gen });
    expect(r.act).toEqual([]);
  });
  it("no cut: a backchannel heard as its own sentence is handled as before (after Esc, too)", () => {
    const listening = play([{ type: "open" }, { type: "vadStart", at: 0 }, { type: "vadEnd", at: 900, ms: 700, short: false }]);
    expect(turn(listening.m, { type: "text", text: "okay", gen: listening.m.gen }).act).toEqual([{ a: "handle", text: "okay", gen: listening.m.gen }]);
    const esc = play([{ type: "stop" }, { type: "vadStart", at: 7000 }, { type: "vadEnd", at: 7800, ms: 700, short: false }], speaking());
    expect(esc.m.canContinue).toBe(true);
    expect(turn(esc.m, { type: "text", text: "okay", gen: esc.m.gen }).act).toEqual([{ a: "handle", text: "okay", gen: esc.m.gen }]);
  });
  it("after the re-speak, the cut is over: a later backchannel sentence is handled as its own", () => {
    const c = cutByHold();
    const r = turn(c.m, { type: "text", text: "okay", gen: c.m.gen });
    const after = play([{ type: "ttsEnd" }, { type: "vadStart", at: 9000 }, { type: "vadEnd", at: 9800, ms: 700, short: false }], r.m);
    expect(turn(after.m, { type: "text", text: "okay", gen: after.m.gen }).act).toEqual([{ a: "handle", text: "okay", gen: after.m.gen }]);
  });
});
