/**
 * v12 (21 Nov), the turn machine after the 06:30-06:45 report (stale-and-double RC1 and RC3). Invented sentences only.
 *  - Speech while Jarvis thinks is provisional: nothing is cancelled for it, however long it is held. Its words decide: the conductor drops a
 *    line that is no request (it reaches the machine as ""), and the question goes on; a request is handed on, and the page replaces the
 *    question with it. Stop words still stop at once.
 *  - An answer's voice that begins while the Collector is talking is ducked under them; their words decide, and speech held TUNING.bargeMs
 *    (800 ms) cuts it. An acknowledgement cut that way leaves the question in flight.
 *  - A new request handed on while a voice plays, or was asked for and has not started (ttsWant), cuts that older voice first.
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
const SENT: TurnEvent[] = [{ type: "open" }, { type: "vadStart", at: 0 }, { type: "vadEnd", at: 900, ms: 700, short: false }];
/** a question handed on and in flight (the page is working on it) */
const asked = () => play([...SENT, { type: "text", text: "where are the flooded roads", gen: 1 }]).m;
/** the Collector says something while it is in flight: a sentence of `ms` that ends */
const over = (m: TurnModel, ms = 700, held = ms) =>
  play([{ type: "vadStart", at: 5000 }, { type: "tick", at: 5000 + held, heldMs: held }, { type: "vadEnd", at: 5000 + ms + 300, ms, short: false }], m);
const acts = (r: { acts: TurnAction[][] }) => r.acts.flat().map((a) => a.a);

describe("v12 RC1: speech while Jarvis thinks is provisional", () => {
  it("TUNING.bargeMs is 800 ms (was 200)", () => expect(TUNING.bargeMs).toBe(800));
  it("a sentence said while a question is in flight cancels nothing; it is read, and the question stays in flight", () => {
    const m = asked();
    for (const ms of [300, 900, 2500]) {
      const r = over(m, ms);
      expect(acts(r)).not.toContain("cancelTurn");
      expect(acts(r)).not.toContain("cancelVoice");
      expect(r.acts.at(-1)).toEqual([{ a: "transcribe", gen: m.gen + 1 }]);
      expect(r.m.state).toBe("thinking");
      expect(r.m.handling).toBe(true);
      expect(r.m.provisional).toBe(true);
    }
  });
  it("its line dropped by the conductor (a filler, a thanks, side talk: \"\" here): the question goes on, still in flight", () => {
    const r = over(asked());
    const t = turn(r.m, { type: "text", text: "", gen: r.m.gen });
    expect(t.act).toEqual([]);
    expect(t.m.state).toBe("thinking");
    expect(t.m.handling).toBe(true);
    expect(t.m.provisional).toBe(false);
    // and its answer still lands: answered goes back to listening
    expect(turn(t.m, { type: "answered" }).m.state).toBe("listening");
  });
  it("the name alone said over it cancels nothing either", () => {
    const r = over(asked());
    const n = turn(r.m, { type: "nameOnly", gen: r.m.gen });
    expect(n.act).toEqual([]);
    expect(n.m.handling).toBe(true);
  });
  it("a real request is handed on (the page's handle() replaces the question with it); the machine sends no cancel of its own", () => {
    const r = over(asked());
    const t = turn(r.m, { type: "text", text: "show me the traffic in Adyar", gen: r.m.gen });
    expect(t.act).toEqual([{ a: "handle", text: "show me the traffic in Adyar", gen: r.m.gen }]);
    expect(t.m.state).toBe("thinking");
  });
  it("a stop word still stops the question at once", () => {
    const r = over(asked());
    expect(turn(r.m, { type: "text", text: "stop", gen: r.m.gen }).act).toContainEqual({ a: "cancelTurn" });
  });
  // v13 (21 Nov, review 1-1): they stay provisional (this pinned false): said during the turn, a line that is no request ("Okay.") is still
  // dropped by the conductor when it lands after the answer, instead of being handed on and stopping the answer's voice. The machine itself
  // still hands on whatever words reach it
  it("the question answered while the words are still at the transcriber: Jarvis stays thinking for them, and they stay provisional", () => {
    const r = over(asked());
    const a = turn(r.m, { type: "answered" });
    expect(a.m.state).toBe("thinking");
    expect(a.m.provisional).toBe(true);
    expect(turn(a.m, { type: "text", text: "thank you", gen: a.m.gen }).act).toEqual([{ a: "handle", text: "thank you", gen: a.m.gen }]);
  });
  it("speech while only a transcript is awaited (no question in flight) is not provisional: the two parts are one sentence (the conductor's carry)", () => {
    const m = play(SENT).m;
    const r = over(m);
    expect(r.m.provisional).toBe(false);
    expect(r.m.handling).toBe(false);
  });
});

describe("v12 RC1: an answer's voice that begins while the Collector talks", () => {
  /** asked, the Collector starts talking, then the answer's voice (or the ack) begins under them */
  const under = (ack = false) => play([{ type: "vadStart", at: 5000 }, { type: "ttsStart", ack }], asked());
  it("is ducked at once, and comes back up when the speech was a cough", () => {
    const u = under();
    expect(u.acts[1]).toEqual([{ a: "duckVoice" }]);
    const c = turn(u.m, { type: "vadEnd", at: 5300, ms: 100, short: true });
    expect(c.act).toEqual([{ a: "dropCapture" }, { a: "unduckVoice" }]);
    expect(c.m.state).toBe("speaking");
  });
  it("a sentence under it is read with the voice ducked: a backchannel brings it back up, a request stops it and is handed on", () => {
    const u = under();
    const s = turn(u.m, { type: "vadEnd", at: 5800, ms: 500, short: false });
    expect(s.act).toEqual([{ a: "transcribe", gen: u.m.gen + 1 }]);
    expect(s.m.state).toBe("paused");
    expect(s.m.overVoice).toBe(true);
    expect(turn(s.m, { type: "text", text: "okay", gen: s.m.gen }).act).toEqual([{ a: "dropCapture" }, { a: "unduckVoice" }]);
    expect(turn(s.m, { type: "text", text: "show trends", gen: s.m.gen }).act).toEqual([{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "dropCapture" }, { a: "handle", text: "show trends", gen: s.m.gen }]);
  });
  // v13 (21 Nov, review 1-10): the voice only (this pinned [cancelVoice, cancelTurn]): the turn has answered, and cancelling it took the answer
  // off the bar; the cut is kept for "continue" and the words decide (turn.v13.test.ts)
  it("speech held TUNING.bargeMs under the answer's voice cuts that voice, not the turn; under 800 ms nothing", () => {
    const u = under();
    expect(turn(u.m, { type: "tick", at: 5000 + TUNING.bargeMs - 10, heldMs: TUNING.bargeMs - 10 }).act).toEqual([]);
    expect(turn(u.m, { type: "tick", at: 5000 + TUNING.bargeMs, heldMs: TUNING.bargeMs }).act).toEqual([{ a: "cancelVoice" }]);
  });
  it("an acknowledgement under the speech is cut alone: the question goes on", () => {
    const u = under(true);
    const t = turn(u.m, { type: "tick", at: 5000 + TUNING.bargeMs, heldMs: TUNING.bargeMs });
    expect(t.act).toEqual([{ a: "cancelVoice" }]);
    expect(t.m.handling).toBe(true);
    expect(t.m.gen).toBe(u.m.gen);
  });
  it("a request said over a ducked acknowledgement stops the voice only: the page replaces the question", () => {
    const u = under(true);
    const s = turn(u.m, { type: "vadEnd", at: 5800, ms: 500, short: false });
    const t = turn(s.m, { type: "text", text: "show trends", gen: s.m.gen });
    expect(t.act).toEqual([{ a: "cancelVoice" }, { a: "dropCapture" }, { a: "handle", text: "show trends", gen: s.m.gen }]);
  });
});

describe("v12 RC3: an older voice never plays over the new question", () => {
  it("a voice asked for and not yet started (ttsWant) is cut as a new request is handed on", () => {
    // the last answer went to the server's voice; Jarvis was answered (listening) before any sound; the next sentence comes
    const m = play([...SENT, { type: "text", text: "rain", gen: 1 }, { type: "ttsWant" }, { type: "answered" }, ...SENT.slice(1)]).m;
    expect(m.voiceWanted).toBe(true);
    const t = turn(m, { type: "text", text: "show me the traffic", gen: m.gen });
    expect(t.act).toEqual([{ a: "cancelVoice" }, { a: "handle", text: "show me the traffic", gen: m.gen }]);
    expect(t.m.voiceWanted).toBe(false);
  });
  it("the voice that started while the next words were at the transcriber is cut as they are handed on", () => {
    const m = play([...SENT, { type: "text", text: "rain", gen: 1 }, { type: "answered" }, ...SENT.slice(1), { type: "ttsStart" }]).m;
    expect(m.state).toBe("speaking");
    expect(turn(m, { type: "text", text: "show me the traffic", gen: m.gen }).act[0]).toEqual({ a: "cancelVoice" });
  });
  it("with no voice at all nothing is cut (a hand-on is just the hand-on)", () => {
    const m = play(SENT).m;
    expect(turn(m, { type: "text", text: "show me the traffic", gen: m.gen }).act).toEqual([{ a: "handle", text: "show me the traffic", gen: m.gen }]);
  });
  it("the voice starting or ending clears the request", () => {
    const w = play([...SENT, { type: "ttsWant" }]).m;
    expect(turn(w, { type: "ttsStart" }).m.voiceWanted).toBe(false);
    expect(turn(w, { type: "ttsEnd" }).m.voiceWanted).toBe(false);
  });
});
