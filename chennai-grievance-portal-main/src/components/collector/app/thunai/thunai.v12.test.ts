/**
 * v12 (21 Nov), Thunai.tsx's side of the 06:30-06:45 report (stale-and-double RC1-RC11 with the critic's corrections), read from the source as
 * the v4, v5, v9 and v10 reading tests do (the loop needs a browser and a console to run; the rules themselves are tested in turn.v12.test.ts
 * and conductor.v12.test.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = fs.readFileSync(path.join(__dirname, "Thunai.tsx"), "utf8").replace(/\r\n/g, "\n");
const between = (a: string, b: string) => { const i = src.indexOf(a); expect(i, a).toBeGreaterThan(-1); const j = src.indexOf(b, i + a.length); return src.slice(i, j < 0 ? undefined : j); };
const handle = between("const handle = async (", "const handleRef = useRef(handle)");
const bump = handle.indexOf("const gen = ++turnGen.current;");

describe("RC1: a spoken line while a question is in flight is provisional", () => {
  it("before the turn starts (no ++turnGen, no abort), a line that only waits for its rest or replaces nothing returns with the question still in flight", () => {
    const check = handle.slice(handle.indexOf("const inFlight = "), bump);
    expect(check).toMatch(/spokenLine && !original && !!turnCtl\.current && !turnCtl\.current\.signal\.aborted/);
    expect(check).toMatch(/phaseRef\.current === "thinking" \|\| phaseRef\.current === "acting"/);
    expect(check).toContain("front10(said).lane");
    expect(check).toContain("noRequest(said)");
    expect(check).toMatch(/return;\n/);
    expect(check).not.toContain("turnCtl.current?.abort()");
    // a yes a card waits for is its answer, never dropped there
    expect(check).toMatch(/plainYes\(said\)/);
    expect(handle.indexOf("const inFlight = ")).toBeLessThan(bump);
  });
});

describe("RC2: no re-ask", () => {
  it("a spoken sentence is handled with no `original`: every lane runs for it", () => {
    const on = between("const onSentence = ", "const onSentenceRef");
    expect(on).toMatch(/handleRef\.current\(h\.text, Number\.isFinite\(h\.conf\) \? h\.conf : 0\.95, undefined,/);
    expect(on).not.toMatch(/h\.again/);
  });
  it("typed or tapped, nothing said before is joined to what comes next", () => {
    expect(handle).toMatch(/if \(!spokenLine\) conductor\.current\?\.forgetTurn\(\);/);
  });
});

describe("RC3 and RC4: a new turn owns the voice and the screen", () => {
  const after = handle.slice(bump, handle.indexOf("gateRef.current = opts.gate"));
  it("right after ++turnGen the older voice stops, the reply's card forgets the older screen, and an unfinished streamed screen is closed", () => {
    expect(after).toContain("stopNarration();");
    expect(after).toContain("pendingScreen.current = null;");
    expect(after).toContain("dropUnfinishedScreen();");
  });
  it("cancelTurn stops the voice too", () => expect(between("const cancelTurn = () => {", "\n  };")).toContain("stopSpeaking();"));
  it("a streamed screen belongs to its turn until showStage confirms it; closeStage and directStage clear or close it", () => {
    expect(between("const streamScreen = ", "const unfinishedScreen")).toContain("unfinishedScreen.current = gen;");
    expect(between("const showStage = ", "const plan = settleStream(")).toContain("unfinishedScreen.current = null;");
    expect(between("const closeStage = ", "\n")).toContain("unfinishedScreen.current = null;");
    const drop = between("const dropUnfinishedScreen = () => {", "\n  };");
    expect(drop).toMatch(/if \(g != null && g !== turnGen\.current && stageRef\.current\) closeStage\(\);/);
    expect(between("const directStage = async", "const t0 = performance.now();")).toContain("dropUnfinishedScreen();");
  });
});

describe("RC6: each agent round has its own deadline", () => {
  const call = between("const callAgent = async", "const stopNarration");
  it("a per-round AbortController chained to the turn's, the round's fetch on it, the turn's own controller never aborted here", () => {
    expect(call).toContain("const rc = new AbortController();");
    expect(call).toMatch(/signal\?\.addEventListener\("abort", fromTurn, \{ once: true \}\)/);
    expect(call).toContain("signal: rc.signal");
    expect(call).not.toMatch(/turnCtl\.current\?\.abort\(\)/);
    expect(call).toMatch(/t0 \+ budget \+ ROUND_GRACE_MS - performance\.now\(\)/);
    expect(call).toMatch(/heard: \(h\) => \{ budget = budgetOf\(h\.budgetMs\); arm\(\);/);
    expect(call).toMatch(/finally \{ if \(timer\) clearTimeout\(timer\); signal\?\.removeEventListener\("abort", fromTurn\); \}/);
  });
  it("at the deadline the round is 'the agent gave none' (CLIENT_TIMEOUT), and handle() says a short honest line, never silence", () => {
    expect(call).toContain("note: CLIENT_TIMEOUT");
    expect(src).toMatch(/const ROUND_GRACE_MS = 2000;/);
    expect(handle).toMatch(/if \(ag\?\.note === CLIENT_TIMEOUT\) \{[^\n]*out\(SLOW_LINE\[rules\.lang\]/);
  });
});

describe("RC8: a cut turn is not remembered as done", () => {
  it("run() checks alive() before remember, decide and the done audit, and audits a cut plan as cancelled", () => {
    const run = between("const run = async", "const missed = ");
    const cut = run.indexOf("if (!alive() && !turnsOff)");
    expect(cut).toBeGreaterThan(-1);
    expect(run.slice(cut, cut + 160)).toContain("cancelled after");
    expect(cut).toBeLessThan(run.indexOf("audit(heardText, steps, `done by"));
    expect(cut).toBeLessThan(run.indexOf("decide({ kind: \"answer\""));
    expect(cut).toBeLessThan(run.indexOf("remember(heardText"));
  });
  it("the map lane remembers only after the map ran and the turn is alive; the news lane checks for aborted", () => {
    const map = handle.slice(handle.indexOf('if (f10.lane?.lane === "map") {'), handle.indexOf('if (f10.lane?.lane === "control") {'));
    expect(map.indexOf("remember(said, `Ask the Map: ${op}`")).toBeGreaterThan(map.indexOf("if (!alive()) return;"));
    // (v12 wiring: the map's run is raced against MAP_LANE_MS, so the wait is `await Promise.race([mapRun`, the run itself started just before)
    expect(map.indexOf("const mapRun = runMapCmd(")).toBeGreaterThan(-1);
    expect(map.indexOf("remember(")).toBeGreaterThan(map.indexOf("await Promise.race([mapRun"));
    const news = handle.slice(handle.indexOf("const na = intentMarker(said)"), handle.indexOf("// the open Stage: its own commands"));
    expect(news).toMatch(/if \(await newsTurn\(na, said, lg, alive, ctl\.signal\) === "aborted"\) return;/);
  });
});

describe("RC9 and RC11", () => {
  it("joinCut only for a spoken line", () => {
    expect(handle).toMatch(/const spokenLine = opts\.source === "whisper" \|\| opts\.source === "captions";/);
    expect(handle).toMatch(/!spokenLine \? text\.trim\(\) : joinCut\(cutBefore, text, Date\.now\(\)\)/);
  });
  it("the next step on offer is taken only while fresh (15 s after its answer's voice ended) and only from a line to Jarvis", () => {
    expect(src).toMatch(/const OFFER_MS = 15_000;/);
    expect(src).toMatch(/const offerLive = \(\) => !!offerRef\.current && \(speaking\(\) \|\| Date\.now\(\) - Math\.max\(offerAt\.current, voiceEndAt\.current\) <= OFFER_MS\);/);
    expect(handle).toMatch(/if \(offerLive\(\) && toMe && plainYes\(said\)\) \{ takeOffer\(\); return; \}/);
    expect(handle).toMatch(/const toMe = !gateRef\.current \|\| gateRef\.current\.tier === 1 \|\| gateRef\.current\.tier === 2;/);
    expect(src).toMatch(/offerPending: \(\) => offerLive\(\)/);
    expect(src).toMatch(/if \(e === "end"\) voiceEndAt\.current = Date\.now\(\);/);
  });
});

describe("the wake reply, silent drops, the warm POST", () => {
  it("a request after a short pause gets the earcon only", () => {
    expect(src).toMatch(/onWakeReply: \(o\) => \{ if \(o\?\.tone\) \{ earcon\("open"\);/);
  });
  it("every line let go is posted words-free; an engaged unclear line gets a soft cue", () => {
    const n = between("const noteDropped = ", "\n  };");
    expect(n).toContain('fetch("/api/jarvis/ignored"');
    expect(n).toMatch(/body: JSON\.stringify\(\{ why: d\.why\.slice\(0, 40\), lang: d\.lang, conf:/);
    expect(n).not.toMatch(/text|said/);
    // (v13, review 1-9: and never while a question is in flight or Jarvis talks, d.busy or the page still thinking: thunai.v13.test.ts)
    expect(src).toMatch(/onDropped: \(d\) => \{ noteDropped\(d\); if \(d\.why === "unclear" && d\.engaged && !d\.busy && [^\n]*\) unclearCue\(d\.lang, d\.called\); \}/);
  });
  it("mode-on posts no /api/jarvis/warm", () => {
    expect(between("const warmUp = ", "\n  };")).not.toContain("fetch(");
  });
});

describe("the Tanglish greeting picks Tamil (verification, 21 Nov)", () => {
  it("the greeting's word edges are \\b, not backspace bytes, and the pattern takes \"vanakkam\"", () => {
    expect(src).toContain("/\\b(vanakkam|vannakam|epdi|eppadi)\\b/i.test(said)");
    expect(/[\u0008]/.test(src)).toBe(false);
    expect(/\b(vanakkam|vannakam|epdi|eppadi)\b/i.test("vanakkam Jarvis")).toBe(true);
  });
});
