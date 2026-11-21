/**
 * v14 (21 Nov), the turn machine after the adversarial review of v13 (lens "turns", findings 0 and 1). Invented sentences only.
 *  - A sentence begun while Jarvis thinks and still being said when the answer lands stays provisional: its words decide, and the answer's voice
 *    is never cancelled for it at its end ("Okay." begun while thinking used to cut the answer, and handle() then said nothing).
 *  - An answer's voice that begins under the speech that cut the acknowledgement (v13 keeps its question in flight) is ducked under it, held,
 *    and read as said over the voice: a line that is no request brings it back up, a request stops it.
 *  - A noise is no sentence: the provisional mark kept for speech in progress does not outlive it.
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
const flat = (r: { acts: TurnAction[][] }) => r.acts.flat().map((a) => a.a);
const SENT: TurnEvent[] = [{ type: "open" }, { type: "vadStart", at: 0 }, { type: "vadEnd", at: 900, ms: 700, short: false }];
/** a question handed on and in flight */
const asked = () => play([...SENT, { type: "text", text: "show me the flooded roads", gen: 1 }]).m;

describe("v14 turns 0: speech still going when the answer lands stays provisional", () => {
  it("begun while thinking, the answer lands mid-word (its voice asked for): provisional after its end, and the voice is not cancelled", () => {
    const m = play([{ type: "vadStart", at: 5000 }, { type: "ttsWant" }, { type: "answered" }], asked()).m;
    expect(m.state).toBe("hearing");
    expect(m.handling).toBe(false);
    expect(m.provisional).toBe(true);
    const e = turn(m, { type: "vadEnd", at: 5700, ms: 400, short: false });
    expect(e.act).toEqual([{ a: "transcribe", gen: m.gen + 1 }]);
    expect(e.m.provisional).toBe(true);
    // the question is no longer in flight: only the mark stays
    expect(e.m.handling).toBe(false);
    // the conductor drops "Okay." (an empty sentence here): nothing is cancelled, and the voice on its way still plays when it starts
    const t = turn(e.m, { type: "text", text: "", gen: e.m.gen });
    expect(t.act).toEqual([]);
    expect(t.m.provisional).toBe(false);
    expect(turn(t.m, { type: "ttsStart" }).m.state).toBe("speaking");
  });
  it("the voice starts while the sentence is at the transcriber: it plays on, and the dropped line leaves it speaking", () => {
    const m = play([{ type: "vadStart", at: 5000 }, { type: "ttsWant" }, { type: "answered" }, { type: "vadEnd", at: 5700, ms: 400, short: false }, { type: "ttsStart" }], asked()).m;
    expect(m.state).toBe("speaking");
    const t = turn(m, { type: "text", text: "", gen: m.gen });
    expect(t.act).toEqual([]);
    expect(t.m.state).toBe("speaking");
  });
  it("a noise is no sentence: the mark goes with it, so the next sentence after it is a fresh one", () => {
    const m = play([{ type: "vadStart", at: 5000 }, { type: "answered" }], asked()).m;
    expect(m.provisional).toBe(true);
    const n = turn(m, { type: "vadEnd", at: 5100, ms: 80, short: true });
    expect(n.m.state).toBe("listening");
    expect(n.m.provisional).toBe(false);
    const next = play([{ type: "vadStart", at: 7000 }, { type: "vadEnd", at: 7800, ms: 600, short: false }], n.m).m;
    expect(next.provisional).toBe(false);
  });
  it("speech begun with nothing in flight is not marked by an answer (the v12 and v13 behaviour stands)", () => {
    const m = play([...SENT]).m;
    const a = turn({ ...m, state: "hearing", awaiting: false }, { type: "answered" });
    expect(a.m.provisional).toBe(false);
  });
});

describe("v14 turns 1: an answer that begins under the speech that cut the acknowledgement", () => {
  /** the ack plays over the question in flight, the Collector holds on over it (a barge-in: the voice stops, the question goes on) */
  const barged = () => {
    const m = play([{ type: "ttsStart", ack: true }, { type: "quickOnset", at: 5000 }, { type: "vadStart", at: 5040 }], asked()).m;
    const b = play([{ type: "tick", at: 5040 + TUNING.bargeHoldMs, heldMs: TUNING.bargeHoldMs }, { type: "ttsEnd", ack: true }], m);
    expect(b.m.state).toBe("interrupted");
    expect(b.m.handling).toBe(true);
    return b.m;
  };
  it("its voice is ducked and held at once, never full over the Collector", () => {
    const m = play([{ type: "ttsWant" }, { type: "answered" }], barged()).m;
    expect(m.provisional).toBe(true);
    const s = turn(m, { type: "ttsStart" });
    expect(s.act).toEqual([{ a: "duckVoice" }]);
    expect(s.m.state).toBe("interrupted");
    expect(s.m.voice).toBe(true);
    expect(s.m.held).toBe(true);
  });
  it("at the speech's end the words decide: read as said over the voice (no cancelVoice), provisional", () => {
    const m = play([{ type: "ttsWant" }, { type: "answered" }, { type: "ttsStart" }], barged()).m;
    const e = turn(m, { type: "vadEnd", at: 6600, ms: 1300, short: false, strong: 1300 });
    expect(e.act).toEqual([{ a: "transcribe", gen: m.gen + 1 }]);
    expect(e.m.state).toBe("paused");
    expect(e.m.overVoice).toBe(true);
    expect(e.m.provisional).toBe(true);
    // "okay thank you Jarvis" is dropped by the conductor (empty here): the answer comes back up and plays on
    const t = turn(e.m, { type: "text", text: "", gen: e.m.gen });
    expect(flat({ acts: [t.act] })).toEqual(["dropCapture", "unduckVoice"]);
    expect(t.m.state).toBe("speaking");
    // a backchannel the same
    expect(turn(e.m, { type: "text", text: "Okay.", gen: e.m.gen }).m.state).toBe("speaking");
  });
  it("a request stops that voice and is handed on; a stop word holds", () => {
    const m = play([{ type: "ttsWant" }, { type: "answered" }, { type: "ttsStart" }, { type: "vadEnd", at: 6600, ms: 1300, short: false, strong: 1300 }], barged()).m;
    const r = turn(m, { type: "text", text: "show trends", gen: m.gen });
    expect(flat({ acts: [r.act] })).toEqual(["cancelVoice", "cancelTurn", "dropCapture", "handle"]);
    const h = turn(m, { type: "text", text: "stop", gen: m.gen });
    expect(h.m.state).toBe("holding");
    expect(flat({ acts: [h.act] })).toContain("cancelVoice");
  });
  it("a noise at its end brings the ducked voice back up", () => {
    const m = play([{ type: "ttsWant" }, { type: "answered" }, { type: "ttsStart" }], barged()).m;
    const n = turn(m, { type: "vadEnd", at: 6000, ms: 90, short: true });
    expect(flat({ acts: [n.act] })).toEqual(["dropCapture", "unduckVoice"]);
    expect(n.m.state).toBe("speaking");
  });
});
