/**
 * v14 (21 Nov), Thunai.tsx's side of the adversarial review of v13 (lens "turns" findings 2, 6 and 7; lens "scenarios" finding 2), read from
 * the source as the v12 and v13 reading tests do (the loop needs a browser and a console to run; the rules are tested in turn.v14.test.ts,
 * conductor.v14.test.ts and wake.v14.test.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mapCommand10, type MapCtx10 } from "@/lib/thunai/v10/map10";
import { plainYes } from "./aide";
import { startsNoTurn } from "./conductor";

const src = fs.readFileSync(path.join(__dirname, "Thunai.tsx"), "utf8").replace(/\r\n/g, "\n");
const between = (a: string, b: string) => { const i = src.indexOf(a); expect(i, a).toBeGreaterThan(-1); const j = src.indexOf(b, i + a.length); return src.slice(i, j < 0 ? undefined : j); };
const handle = between("const handle = async (", "const handleRef = useRef(handle)");
const bump = handle.indexOf("const gen = ++turnGen.current;");

describe("v14 turns 2: the district tour's 'Shall I go on?' takes a plain yes", () => {
  it("the yes words it waits for are startsNoTurn lines, and the map lane reads them as 'next' at the check-in", () => {
    const ctx = { lang: "en", open: true, hasAnswer: true, kind: "answer", total: 5, question: "take me round the district", shots: 0, shot: 0, chips: [], chipOpts: [], suggest: [],
      rainOpen: false, tour: true, tourCheck: true, lastCity: null } as unknown as MapCtx10;
    for (const s of ["Yes.", "Okay.", "Sure.", "Yeah.", "சரி", "seri"]) {
      expect(startsNoTurn(s), s).toBe(true);
      expect(plainYes(s), s).toBe(true);
      expect(mapCommand10(s, ctx), s).toMatchObject({ op: "tour", tour: "next" });
    }
  });
  it("handle(): the check-in is read before the early drops, and neither the in-flight drop nor the no-turn drop takes its yes", () => {
    const t = handle.indexOf("const tourAsks = spokenLine && !original && !!mapSnap10(hostRef.current.c.mapAsk).tourCheck;");
    expect(t).toBeGreaterThan(-1);
    expect(t).toBeLessThan(handle.indexOf("if (inFlight &&"));
    expect(handle).toContain("if (inFlight && !((askOnce || pendingB || confirmRef.current || offerLive() || tourAsks) && plainYes(said))) {");
    expect(handle).toMatch(/startsNoTurn\(said\) && !askOnce && !pendingB && !confirmRef\.current && !offerLive\(\) && !newsOffer\.current && !tourAsks\) \{/);
  });
  it("a yes said over the tour's voice is its answer, not a backchannel (the conductor's wantsYes)", () => {
    expect(src).toContain("wantsYes: () => !!pendingBRef.current || !!confirmRef.current || !!mapSnap10(hostRef.current.c.mapAsk).tourCheck,");
  });
});

describe("v14 turns 6: 'Sorry?' after an answer says it again", () => {
  it("inside the no-turn drop, before the turn starts: the last answer through its own number gate, only within 15 s of the voice ending", () => {
    const i = handle.indexOf("startsNoTurn(said)");
    const j = handle.indexOf("noteDropped({ why: \"no-turn\"", i);
    const block = handle.slice(i, j);
    expect(j).toBeLessThan(bump);
    expect(block).toContain("const again = lastSpoken.current;");
    expect(block).toContain("if (asksAgain(said) && again?.text && Date.now() - voiceEndAt.current <= 15_000) {");
    expect(block).toContain("out(again.text, again.lang, \"ready\", again.allowed);");
    // the same as the repeat step
    expect(src).toContain("case \"repeat\": { const l = lastSpoken.current; if (l) out(l.text, l.lang, \"ready\", l.allowed); return null; }");
    expect(block).not.toContain("turnCtl.current?.abort()");
  });
  it("while a question is in flight 'Sorry?' is still the room's noise (v13 review 1-2): the in-flight drop comes first", () => {
    expect(handle.indexOf("if (inFlight &&")).toBeLessThan(handle.indexOf("asksAgain(said)"));
  });
});

describe("v14 turns 7: the agent path's busy label belongs to its turn", () => {
  it("set with the turn's generation, and cleared on a newer turn only while it is still this turn's", () => {
    expect(handle).toContain("if (stageRef.current) { setStageBusy(doingLine); stageBusyGen.current = gen; }");
    const a = handle.indexOf("const ag = await callAgent(said, st, undefined, ctl.signal, heardInfo)");
    const after = handle.slice(a, a + 700);
    expect(after).toContain("if (!alive()) { if (stageBusyGen.current === gen) setStageBusy((b) => (b === doingLine ? null : b)); return; }");
    expect(after).not.toMatch(/\n\s*if \(!alive\(\)\) return;\n\s*setStageBusy\(null\);/);
  });
});

describe("v14 scenarios 2: the closed device wake with no recogniser leaves the reply to the quiet", () => {
  const a = src.indexOf("  // \"Hi Jarvis\": closed, the browser");
  const block = src.slice(a, src.indexOf("}, [mode]);", a));
  it("wakeWait's 'listen' opens at once, and the reply waits on the conductor (replyWhenQuiet), or is said at once when it cannot", () => {
    expect(block).toContain("const woke = (rest: string, later = false) => {");
    expect(block).toContain("if (!rest) { if (!later || !conductor.current?.replyWhenQuiet()) sayWake(listenLangRef.current); } else earcon(\"open\");");
    expect(block).toContain("if (next !== \"wait\") { woke(\"\", next === \"listen\"); return; }");
    // the recogniser's own wake (its name alone waits in wake.ts) still replies at once
    expect(block).toContain("onWake: (rest) => { stop = null; woke(rest); },");
  });
});
