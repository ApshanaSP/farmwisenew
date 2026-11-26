// v4, the browser's turn loop (Thunai.tsx) is wired as the brief says: these read the code itself, as guards.pass4.test.ts does,
// because the loop needs a browser and a console to run. Each failed on the code before v4 (38d96d2f).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// THUNAI_UNDER_TEST points the same checks at another copy (how the failing-first run of the integration checks was made)
const src = fs.readFileSync(process.env.THUNAI_UNDER_TEST ?? path.join(__dirname, "Thunai.tsx"), "utf8").replace(/\r\n/g, "\n");
const between = (from: string, to: string) => { const a = src.indexOf(from); expect(a, from).toBeGreaterThan(-1); const b = src.indexOf(to, a + from.length); return src.slice(a, b < 0 ? undefined : b); };

describe("the streamed turn (Pillar 2)", () => {
  const call = between("const callAgent = async", "const stopNarration");
  it("asks for the stream and reads it event by event, with the JSON reply as the fallback", () => {
    expect(call).toMatch(/stream:\s*!direct/);
    expect(call).toContain("readRound(");
    expect(call).not.toMatch(/await post\(url/);
  });
  it("drops what belongs to an older turn (the generation) and runs a round's console steps once", () => {
    expect(call).toMatch(/turnGen\.current/);
    expect(call).toContain("stepsSent");
  });
  it("the round's whole answer does not show or say again what streamed", () => {
    expect(src).toContain("settleStream(");
  });
});

describe("observations carry the screen's digest (defect 4)", () => {
  it("the round's observations go back with the digest of what is on screen after its steps", () => {
    const call = between("const callAgent = async", "const stopNarration");
    expect(call).toContain("withDigest(");
    expect(call).toMatch(/consoleDigest\(/);
  });
});

describe("memory turns (defect 5)", () => {
  it("a turn keeps the recipe, the slots and a one-line result, and all four go to the round", () => {
    expect(between("const remember = ", "\n")).toContain("memTurn(");
    // (v11: six turns, four before)
    expect(src).toMatch(/turns:\s*turns\.current\.slice\(-6\)/);
  });
});

describe("the ears' confidence and language (defect 6)", () => {
  const onSentence = between("const onSentence = ", "const onSentenceRef");
  it("the sentence's own confidence reaches handle(), not a fixed 0.95", () => {
    expect(onSentence).not.toMatch(/handleRef\.current\(h\.text,\s*0\.95/);
    expect(onSentence).toMatch(/h\.conf/);
    expect(onSentence).toMatch(/lang:\s*h\.lang/);
  });
  it("the round is told how the sentence was heard", () => {
    expect(src).toContain("heardOf(");
    expect(between("const callAgent = async", "const stopNarration")).toMatch(/heard:/);
  });
  it("an unsure sentence prefers the rules' question", () => expect(src).toContain("asksFirst(rules.confidence"));
});

describe("captions only while hearing (defect 10)", () => {
  it("opening the microphone no longer starts the browser's recogniser for the whole session", () => {
    const open = between("const openMic = () => {", "const setModeRef");
    // the recogniser is only made by HearingCaptions, when speech starts; nothing here starts it
    expect(open).not.toMatch(/captions\.current = new Captions\(/);
    expect(open).toContain("new HearingCaptions(");
    expect(open).not.toMatch(/\.start\(\)/);
  });
  it("speech start (engaged) starts it, speech end stops it, and its partials reach the conductor", () => {
    expect(src).toMatch(/onSpeechStart:/);
    expect(src).toMatch(/onSpeechEnd:/);
    expect(src).toMatch(/\.partial\(/);
  });
  // v6 (JARVIS_V6.md section 7, "Instant wake reply" and "On-device keyword spotting"): the closed listener keeps the browser's recogniser for
  // "Hi Jarvis" exactly as before and adds the on-device wake word beside it and the spoken wake reply; the pin moves to the v6 block, and
  // what the owner sees is pinned by behaviour below (docs/qa/pass7/V6_EXPECTED_CHANGES.md)
  it("the \"Hi Jarvis\" wake listener is exactly as v6 left it", () => {
    const a = src.indexOf("  // \"Hi Jarvis\": closed, the browser");
    const b = src.indexOf("}, [mode]);", a) + "}, [mode]);".length;
    expect(a).toBeGreaterThan(-1);
    // (v10 review 2, round 2: the pin moves once more, for one change only: the same-breath rest is handed over as spoken, { source: "captions" },
    // so a cut-off rest waits as any spoken line does; it was taken for typed text; merge 2026-11-20: and the owner's wake mic hand-over, parkWake;
    // v11, 20 Nov: the status says "Go ahead" while the parked microphone is handed over, hud wakeOpening;
    // v14, 21 Nov, review scenarios 2: with no recogniser running, the device's wake opens at once and its reply waits for the quiet on Jarvis's
    // ears, wakeWait "listen" and conductor replyWhenQuiet; the recogniser's own name-alone wait is in wake.ts)
    expect(crypto.createHash("sha256").update(src.slice(a, b)).digest("hex")).toBe("cc391ada9bd6da08713d5312ad5d6743b2267510b4928a303b7e560b52762d1d");
    const block = src.slice(a, b);
    expect(block).toContain("handleRef.current(rest, 0.95, undefined, { source: \"captions\" })");
    // still: only while closed, after the first-use notice, with the microphone already allowed, never while the tab is hidden; the browser's
    // own recogniser still listens for the name
    expect(block).toContain('if (mode !== "off" || !canWake() || store.get("jarvis-mode-seen") !== "1") return;');
    expect(block).toContain("startWake({");
    expect(block).toContain('st.state === "granted"');
    expect(block).toContain("document.hidden");
    // v6 (the independent check, 17 Nov): the device's wake word waits for a pause after the name, or leaves a sentence to the recogniser
    expect(block).toContain("wakeWait({");
  });
});

describe("Finding 51: what a screen may say comes from the speakable set", () => {
  it("screenFigures (every number in doc.say) is gone; speakableFigures is used", () => {
    expect(src).not.toMatch(/screenFigures/);
    expect(src).toContain("speakableFigures(");
  });
});

describe("the honest ack, the warm-up, the two speeds", () => {
  it("an earcon at the end of speech; the spoken ack only by the 1.2 s rule", () => {
    expect(between("mark: (name, t) => {", "\n      }")).toContain("earconEnd()");
    expect(src).toContain("ackDue(");
    expect(src).toContain("speakAck(");
  });
  // v12 (21 Nov, first-question-latency): mode-on warms the voice only; the planner's prompt cache is the server keep-warm's job
  // (lib/thunai/keepwarm.ts): the browser's POST to /api/jarvis/warm at the opening moment timed out behind the opening's work every time
  it("mode-on warms the voice, once; the planner is warmed by the server, not by a POST from here", () => {
    expect(src).toContain("warmVoice(");
    expect(src).not.toMatch(/fetch\(\s*["'`]\/api\/jarvis\/warm/);
  });
  it("a turn past 10 s shows its steps and a Stop", () => {
    expect(src).toContain("longTurn(");
    expect(src).toMatch(/data-testid="long-turn"/);
  });
  it("the keyboard comment names the real keys", () => {
    expect(src).not.toMatch(/Alt\+T/);
  });
});

// ---- the client's integration of the v4 lanes (each check failed on 26a68ab6, before this wiring)
describe("L4 ears: the conductor's hooks, the echo strip, the mapped confidence", () => {
  it("the open Stage's names, a yes awaited, a calm not-heard line", () => {
    expect(src).toMatch(/vocab: \(\) => vocabOf\(stageRef\.current\)/);
    expect(src).toMatch(/wantsYes: \(\) => !!pendingBRef\.current/);
    expect(src).toMatch(/onMissed: \(\) =>/);
    expect(src).toContain("NOT_CAUGHT[lang]");
  });
  it("the echo cancellation the microphone got goes on the strip", () => expect(src).toMatch(/echo: c\.echoCancel/));
  it("understand() reads the mapped confidence; the round keeps the raw one", () => {
    expect(src).toMatch(/understand\(said, st, worldRef\.current, \{ speechConf: rulesConf\(conf\) \}\)/);
    expect(src).not.toMatch(/understand\(said, st, worldRef\.current, \{ speechConf: conf \}\)/);
  });
});

describe("M2 missions: the runner replaces the two hard-coded missions", () => {
  it("mission(name) is gone; startMission posts the sentence and runs the plan through the hooks and the control", () => {
    expect(src).not.toMatch(/const mission = async \(name/);
    const m = between("const startMission = async", "// --------------------------------------------------------------- the brief");
    expect(m).toContain("/api/collector/thunai/mission");
    expect(m).toContain("missionControl()");
    expect(m).toContain("runMission(");
    for (const k of ["showScreen:", "runStep:", "focusMap:", "draft:", "say:", "progress:", "card:", "plan:", "now:"]) expect(m, k).toContain(k);
    expect(m).toContain("redirect: true");
    expect(m).toContain("hudMissionOf(c, lang)");
    // Level C only into the tray
    expect(between("draft: async (ids, sig)", "say:")).toContain("addToTray(ds)");
  });
  it("a sentence that names a mission reaches it before the planner; the old step names map to the brief and monsoon readiness", () => {
    expect(between("const handle = async", "const st = buildState();")).toMatch(/missionIntent\(said, worldRef\.current\)/);
    expect(src).toMatch(/case "mission": if \(step\.name === "brief"\) await briefMe\(lang, true\); else await startMission\(lang === "ta" \? "[^"]+" : "monsoon readiness", lang\)/);
  });
  it("stop, skip that and instead X reach the controller during a run, before a new turn starts; the HUD's buttons are wired", () => {
    const top = between("const handle = async", "const gen = ++turnGen.current;");
    expect(top).toContain("missionCommand(said)");
    for (const k of ["ms.ctl.start()", "ms.ctl.skip()", "ms.ctl.instead(cmd.text)", "stopMission({ say: true, drop: false })", "ms.ctl.edit(ids)"]) expect(top, k).toContain(k);
    for (const k of ["onMissionStart:", "onMissionEdit:", "onMissionStop:"]) expect(src, k).toContain(k);
    expect(between("const interrupt = ", "\n")).toContain("stopMission(");
  });
});

describe("P2 proactive: the brief, the watch, interjections, Level-B memory, follows, the decision record", () => {
  it("the brief from GET /brief, said in order, once a session after the power-on", () => {
    expect(src).toContain('fetch("/api/collector/thunai/brief")');
    expect(src).toContain("briefCard(");
    expect(src).toMatch(/sessionStorage\.getItem\("jarvis-briefed"\)/);
    expect(between("hud.strip({ detector: c.detector", "\n      });")).toContain("powerOnBrief()");
  });
  it("the watch every two minutes sets the badge; an interjection only when interjectNow says so, then POST spoken", () => {
    expect(src).toMatch(/\/api\/collector\/thunai\/watch\?quiet=/);
    expect(src).toMatch(/setInterval\(\(\) => void tick\(\), 120_000\)/);
    const i = between("const interject = ", "const interjectRef");
    // Phase 7 review (F1): with the one ledger of everything said unprompted, both channels together
    expect(i).toContain("interjectNow(sig, liveNow(), Date.now(), unpromptedTimes()).ok");
    expect(i).toMatch(/op: "spoken"/);
    expect(src).toMatch(/watchPref\("later", id\)/);
    expect(src).toMatch(/watchPref\("mute", s\.topic\)/);
    expect(src).toContain("chime: () => earcon(\"need\")");
  });
  it("remember is the Level-B op with the yes, not op note; forget is forgetLast or reset; the list and today's record are read", () => {
    expect(src).not.toMatch(/op: "note"/);
    expect(src).toMatch(/op: "remember", text: step\.text, said: heardText\.slice\(0, 600\), yes: true/);
    expect(src).toMatch(/op: "forgetLast", yes: true/);
    expect(src).toMatch(/op: "reset", yes: true/);
    expect(src).not.toMatch(/op: "forget", all: true/);
    expect(src).toContain("/api/collector/thunai/memory?view=list");
    expect(src).toContain("/api/collector/thunai/audit?today=1");
    expect(src).toContain("/api/collector/thunai/follow");
  });
  it("D2's intentMarker routes the memory flows and the brief before the planner, with the address gate's Level B rule", () => {
    const flows = between("const im = brainFirst ? null : intentMarker(said);", "const st = buildState();");
    expect(flows).toMatch(/intent === "remember" && im\.rest\) \{ if \(needsName\("B", lg\)\) return;/);
    expect(flows).toMatch(/intent === "forget"\) \{ if \(needsName\("B", lg\)\) return;/);
    expect(flows).toMatch(/if \(fa\) \{ if \(needsName\("B", lg\)\) return;/);
  });
  it("rules-lane answers and tray approvals are posted as decisions", () => {
    expect(src).toMatch(/decision: \{ kind: d\.kind/);
    expect(between("const sendTray = async", "// --------------------------------------------------------------- one step")).toMatch(/decide\(\{ kind: "approval"/);
    expect(between("const run = async", "const missed = ")).toMatch(/if \(by === "rules"[^\n]*decide\(\{ kind: "answer"/);
  });
});

describe("H2 HUD: captions, evidence, acting, mode-off reset, the listen key, badges on change", () => {
  it("speak() and both narrations feed the caption piece by piece, word by word, and clear it", () => {
    expect(between("const speak = (", "\n};")).toMatch(/onPiece: \(t\) => hud\.caption\(t, l\), onWord: \(_, ch\) => hud\.captionWord\(ch\)/);
    expect((between("const narrate = (", "const ensureGeo").match(/onPiece: \(t\) => hud\.caption\(t, lang\)/g) ?? []).length).toBe(2);
    expect(between("const stopNarration = ", "\n")).toContain("hud.caption(null)");
    expect(between("const interrupt = ", "\n")).toContain("hud.caption(null)");
  });
  it("the evidence chip from evidenceOf, and its tap", () => {
    // Phase 7 review (F1, UI 2): only a time measured for this turn, never the strip's last one (another turn's)
    expect(src).toMatch(/evidence: evidenceOf\(brain, stage, turnMs\(measured\.current, turnGen\.current\)\)/);
    expect(src).toContain("onEvidence: () =>");
  });
  it("the acting flag, and everything v4 shows goes with mode off", () => {
    expect(src).toMatch(/acting: phase === "acting"/);
    expect(src).toMatch(/acting: false, caption: null, evidence: null, mission: null, interjection: null/);
  });
  it("Ctrl+Shift+Space listens (isListenKey); Alt+Space is no longer the key", () => {
    expect(src).toContain("isListenKey(e)");
    expect(src).not.toMatch(/e\.altKey && e\.code === "Space"/);
    expect(src).not.toMatch(/Alt\+Space turns it on/);
  });
  it("the numbered badges follow the page's changes (followLayout, samePlaces), not a 1.2 s timer", () => {
    expect(src).not.toMatch(/clickables\(\) \} : n\)\), 1200\)/);
    expect(src).toContain("followLayout(");
    expect(src).toContain("samePlaces(n.items, items)");
  });
});

describe("D2 dialogue, A2 explain, L1 zone labels, persona, performance", () => {
  it("each round carries the screen's provenance and per-block labels; a said screen offers nextQuestion as a tap-able direct step", () => {
    const call = between("const callAgent = async", "const stopNarration");
    expect(call).toMatch(/provenance: doc \? provenanceOf\(doc, \{ by: /);
    expect(call).toContain("withLabels(stageContext(doc, stageFocus.current), doc)");
    expect(between("const showStage = ", "const closeStage")).toContain("nextQuestion(doc)");
    expect(between("const takeOffer = ", "const closeStage")).toMatch(/directStage\(o\.step\.recipe/);
    expect(src).toMatch(/data-testid="next-step"/);
  });
  it("explain on an open Stage builds the explain recipe for its target (the register's id first); again only when there is none", () => {
    const e = between("const explainOnStage = async", "const applyStageOp");
    expect(e).toContain("explainTargetOf(doc, n)");
    expect(e).toMatch(/directStage\("explain", \{ \.\.\.explainSlots\(t\)/);
    expect(between("const applyStageOp = async", "const askSave")).toMatch(/op\.op === "explain" && \(await explainOnStage\(op\.n \?\? null, lang, op\.id \?\? null\)\)/);
  });
  it("every chunk gated with the speakable set first reads a real zone's label as its name (zoneSafe, numbergate.ts zoneLabelsOut)", () => {
    expect((src.match(/zoneSafe\(/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(between("const narrate = (", "const ensureGeo")).not.toMatch(/allowed: speakableFigures\(doc, lang\),/);
  });
  it("two misunderstandings in a row offer the screen and the keyboard and open the typing box", () => {
    expect(between("const missed = ", "const offerKeys")).toContain("hud.set({ typing: true })");
    expect(src).toContain("OFFER_KEYS[");
    expect((src.match(/NO_FIGURES, true\)|undefined, true\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
  it("the viewport blur goes on four cores or fewer, or reduced motion: a class on the root, set once", () => {
    expect(src).toMatch(/classList\.toggle\("jv-lowfx", lowFx\(navigator\.hardwareConcurrency/);
    expect(fs.readFileSync(path.join(__dirname, "stage.css"), "utf8")).toMatch(/\.jv-lowfx \.st-frame \{ backdrop-filter: none;/);
  });
});
