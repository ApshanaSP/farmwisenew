/**
 * v13 (21 Nov), the turn machine after the adversarial review of v12 (review 1, findings 0, 1, 2, 3 and 10). Invented sentences only.
 *  - Speech over the spoken acknowledgement is provisional: its question is still in flight (`handling`), so a barge-in, a cut, a hold or the
 *    name alone over it stop the voice only; a stop word still ends the question.
 *  - A short sentence said over the acknowledgement is provisional, so the conductor can join a continuation to its question.
 *  - An answer's voice that began under the Collector is cut without cancelling the turn: the cut is kept, a backchannel brings it back.
 *  - A sentence said during the turn and still at the transcriber stays provisional after the answer lands.
 *  - "Sorry, one second." is a hold; thanks are no bid for the turn in the live words; "Okay." alone is no greeting.
 */
import { describe, expect, it } from "vitest";
import { bargesIn, isBackchannel } from "./backchannel";
import { isGreeting } from "./greet";
import { afterHold, isHoldOnly, turn, turnStart, type TurnAction, type TurnEvent, type TurnModel } from "./turn";
import { TUNING } from "./vad";

function play(events: TurnEvent[], m0: TurnModel = turnStart()) {
  let m = m0;
  const acts: TurnAction[][] = [];
  for (const e of events) { const r = turn(m, e); m = r.m; acts.push(r.act); }
  return { m, acts };
}
const flat = (r: { acts: TurnAction[][] }) => r.acts.flat().map((a) => a.a);
const SENT: TurnEvent[] = [{ type: "open" }, { type: "vadStart", at: 0 }, { type: "vadEnd", at: 900, ms: 700, short: false }];
/** a question handed on and in flight */
const asked = () => play([...SENT, { type: "text", text: "show me the flooded roads", gen: 1 }]).m;
/** the question in flight, and its acknowledgement ("On it.") playing */
const acking = () => play([{ type: "ttsStart", ack: true }], asked()).m;
/** the Collector starts talking over the acknowledgement (the energy gate's onset, then Silero's) */
const overAck = () => play([{ type: "quickOnset", at: 5000 }, { type: "vadStart", at: 5040 }], acking()).m;

describe("v13 review 1-0: speech over the acknowledgement never cancels its question", () => {
  it("held TUNING.bargeHoldMs (a barge-in): the voice stops, nothing else; the speech is provisional and the question still in flight", () => {
    const m = overAck();
    expect(m.state).toBe("paused");
    const b = turn(m, { type: "tick", at: 5040 + TUNING.bargeHoldMs, heldMs: TUNING.bargeHoldMs });
    expect(b.act).toEqual([{ a: "cancelVoice" }]);
    expect(b.m.handling).toBe(true);
    expect(b.m.provisional).toBe(true);
    // its sentence is read as provisional; dropped by the conductor ("" here), the question goes on and its answer still lets the machine go
    const e = turn(b.m, { type: "vadEnd", at: 6000, ms: 900, short: false });
    expect(e.act).toEqual([{ a: "transcribe", gen: b.m.gen + 1 }]);
    expect(e.m.provisional).toBe(true);
    expect(e.m.handling).toBe(true);
    const t = turn(e.m, { type: "text", text: "", gen: e.m.gen });
    expect(t.act).toEqual([]);
    expect(t.m.state).toBe("thinking");
    expect(t.m.handling).toBe(true);
    expect(turn(t.m, { type: "answered" }).m.state).toBe("listening");
  });
  it("two live words over it (\"show me the\") stop the voice only; \"okay thank you Jarvis\" is no bid at all", () => {
    const m = overAck();
    const w = turn(m, { type: "words", text: "show me the" });
    expect(w.act).toEqual([{ a: "cancelVoice" }]);
    expect(w.m.handling).toBe(true);
    expect(turn(m, { type: "words", text: "okay thank you Jarvis" }).act).toEqual([]);
  });
  it("a sentence held long at its end (the cut) stops the voice and is read, provisional; no cancelTurn", () => {
    const m = play([{ type: "quickOnset", at: 5000 }, { type: "vadStart", at: 5040 }], acking()).m;
    const c = turn(m, { type: "vadEnd", at: 6200, ms: 1000, short: false, strong: 1000 });
    expect(c.act).toEqual([{ a: "cancelVoice" }, { a: "transcribe", gen: m.gen + 1 }]);
    expect(c.m.provisional).toBe(true);
    expect(c.m.handling).toBe(true);
  });
  it("a request read over it stops the voice and is handed on; the page decides (no cancel of the machine's own)", () => {
    const s = turn(overAck(), { type: "vadEnd", at: 5500, ms: 400, short: false, strong: 400 });
    const t = turn(s.m, { type: "text", text: "show trends", gen: s.m.gen });
    expect(t.act).toEqual([{ a: "cancelVoice" }, { a: "dropCapture" }, { a: "handle", text: "show trends", gen: s.m.gen }]);
  });
  it("\"Wait.\" over it holds with the question still in flight; what is said next is provisional; the answer still plays", () => {
    const s = turn(overAck(), { type: "vadEnd", at: 5500, ms: 400, short: false, strong: 400 });
    const h = turn(s.m, { type: "text", text: "Wait.", gen: s.m.gen });
    expect(h.m.state).toBe("holding");
    expect(h.act).toEqual([{ a: "cancelVoice" }, { a: "hold", ms: TUNING.holdExtendMs }]);
    expect(h.m.handling).toBe(true);
    const next = play([{ type: "vadStart", at: 7000 }, { type: "vadEnd", at: 7800, ms: 600, short: false }], h.m);
    expect(next.m.provisional).toBe(true);
    expect(flat(next)).not.toContain("cancelTurn");
    expect(turn(h.m, { type: "ttsStart" }).m.state).toBe("speaking");
  });
  it("\"Stop.\" over it still ends the question", () => {
    const s = turn(overAck(), { type: "vadEnd", at: 5500, ms: 400, short: false, strong: 400 });
    const h = turn(s.m, { type: "text", text: "Stop.", gen: s.m.gen });
    expect(h.m.state).toBe("holding");
    expect(h.act).toContainEqual({ a: "cancelTurn" });
    expect(h.m.handling).toBe(false);
  });
  it("the name alone over it stops the voice and listens; the question goes on, and its answer still plays", () => {
    const s = turn(overAck(), { type: "vadEnd", at: 5500, ms: 400, short: false, strong: 400 });
    const n = turn(s.m, { type: "nameOnly", gen: s.m.gen });
    expect(n.m.state).toBe("holding");
    expect(n.act).toEqual([{ a: "cancelVoice" }, { a: "hold", ms: TUNING.holdExtendMs }]);
    expect(n.m.handling).toBe(true);
    expect(turn(n.m, { type: "ttsStart" }).m.state).toBe("speaking");
  });
  it("over an answer's own voice (not the acknowledgement) a barge-in still cancels the turn, as before", () => {
    const m = play([{ type: "ttsStart" }, { type: "quickOnset", at: 5000 }, { type: "vadStart", at: 5040 }], asked()).m;
    expect(turn(m, { type: "tick", at: 5640, heldMs: 600 }).act).toEqual([{ a: "cancelVoice" }, { a: "cancelTurn" }]);
  });
});

describe("v13 review 1-3: a short sentence over the acknowledgement is provisional (the conductor joins a continuation)", () => {
  it("said over it (ducked)", () => {
    const s = turn(overAck(), { type: "vadEnd", at: 5500, ms: 400, short: false, strong: 400 });
    expect(s.m.overVoice).toBe(true);
    expect(s.m.provisional).toBe(true);
  });
  it("begun before it started (the acknowledgement ducked under the speech)", () => {
    const u = play([{ type: "vadStart", at: 5000 }, { type: "ttsStart", ack: true }], asked());
    const s = turn(u.m, { type: "vadEnd", at: 5600, ms: 500, short: false });
    expect(s.m.overVoice).toBe(true);
    expect(s.m.provisional).toBe(true);
  });
  it("over an answer's voice it is not (nothing is in flight)", () => {
    const m = play([{ type: "ttsStart" }, { type: "quickOnset", at: 5000 }, { type: "vadStart", at: 5040 }], asked()).m;
    expect(turn(m, { type: "vadEnd", at: 5500, ms: 400, short: false, strong: 400 }).m.provisional).toBe(false);
  });
});

describe("v13 review 1-10: an answer's voice that began under the Collector", () => {
  const under = () => play([{ type: "vadStart", at: 5000 }, { type: "ttsStart" }], asked()).m;
  it("held TUNING.bargeMs: that voice is cut (kept for continue), never the turn", () => {
    const t = turn(under(), { type: "tick", at: 5000 + TUNING.bargeMs, heldMs: TUNING.bargeMs });
    expect(t.act).toEqual([{ a: "cancelVoice" }]);
    expect(t.m.state).toBe("interrupted");
    expect(t.m.cut).toBe(true);
    expect(t.m.canContinue).toBe(true);
  });
  it("the speech's words decide: a backchannel says the answer again from its chunk; a request is handed on with no cancel", () => {
    const t = turn(under(), { type: "tick", at: 5000 + TUNING.bargeMs, heldMs: TUNING.bargeMs });
    const e = turn(t.m, { type: "vadEnd", at: 6400, ms: 1200, short: false });
    expect(e.act).toEqual([{ a: "transcribe", gen: t.m.gen + 1 }]);
    expect(e.m.cut).toBe(true);
    expect(turn(e.m, { type: "text", text: "okay", gen: e.m.gen }).act).toEqual([{ a: "resumeAnswer" }]);
    expect(turn(e.m, { type: "text", text: "show trends", gen: e.m.gen }).act).toEqual([{ a: "handle", text: "show trends", gen: e.m.gen }]);
  });
});

describe("v13 review 1-1: a sentence said during the turn stays provisional after the answer lands", () => {
  it("while its words are still at the transcriber; not once they are in", () => {
    const m = play([{ type: "vadStart", at: 5000 }, { type: "vadEnd", at: 5600, ms: 500, short: false }], asked()).m;
    expect(m.provisional).toBe(true);
    const a = turn(m, { type: "answered" });
    expect(a.m.provisional).toBe(true);
    expect(a.m.handling).toBe(false);
    // the answer's voice starts, then the words: still provisional, so the conductor can drop an "Okay." without stopping that voice
    const v = turn(a.m, { type: "ttsStart" });
    expect(v.m.provisional).toBe(true);
    // with nothing at the transcriber, answered clears it
    expect(turn({ ...m, awaiting: false }, { type: "answered" }).m.provisional).toBe(false);
  });
});

describe("v13 review 1-2: \"Sorry, one second.\" is a hold", () => {
  it("an apology in front of the hold words", () => {
    for (const t of ["Sorry, one second.", "sorry wait", "Excuse me, hold on", "Oh sorry, one minute"]) expect(isHoldOnly(t), t).toBe(true);
    for (const t of ["Sorry.", "sorry, show the traffic", "Excuse me."]) expect(isHoldOnly(t), t).toBe(false);
    expect(afterHold("Sorry, wait, show Anna Nagar")).toBe("show Anna Nagar");
  });
  it("said while Jarvis thinks it holds, and the question goes on", () => {
    const r = play([{ type: "vadStart", at: 5000 }, { type: "vadEnd", at: 5600, ms: 500, short: false }], asked());
    const h = turn(r.m, { type: "text", text: "Sorry, one second.", gen: r.m.gen });
    expect(h.m.state).toBe("holding");
    expect(h.act.map((a) => a.a)).not.toContain("cancelTurn");
    expect(h.act.map((a) => a.a)).not.toContain("handle");
  });
});

describe("v13: the live words and the greeting", () => {
  it("thanks are no bid for the turn (review 1-0); a request in them still is", () => {
    for (const t of ["thank you", "okay thank you Jarvis", "thanks", "great, thank you"]) expect(bargesIn(t), t).toBe(false);
    for (const t of ["thank you, now show trends", "show me the traffic", "can you open the map"]) expect(bargesIn(t), t).toBe(true);
    // a thanks is still no backchannel: the conductor reads it as a sentence (noRequest)
    expect(isBackchannel("thank you")).toBe(false);
  });
  it("\"Okay.\" alone is no greeting (review 1-1); with the name, or with a greeting word, it is", () => {
    for (const t of ["Okay.", "ok", "Okay, okay.", "OK!"]) expect(isGreeting(t), t).toBe(false);
    for (const t of ["Okay Jarvis", "ok jarvis, are you there?", "okay hi", "Hi Jarvis", "jarvis"]) expect(isGreeting(t), t).toBe(true);
  });
});
