// Phase 7 review, lane F1: the wiring in the browser's turn loop (Thunai.tsx), the bar (Hud.tsx), the Stage and their styles, read from
// the code itself as thunai.v4.test.ts does (the loop needs a browser and a console to run). The decisions are pure helpers tested in
// aide.f1.v4.test.ts; these check each is used where the review found the defect. Each failed on the code before the fix
// (F1_UNDER_TEST points the same checks at a folder holding the old copies).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dir = process.env.F1_UNDER_TEST ?? __dirname;
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8").replace(/\r\n/g, "\n");
const src = read("Thunai.tsx"), hudSrc = read("Hud.tsx"), stageSrc = read("Stage.tsx"), hudCss = read("hud.css"), thCss = read("thunai.css");
const between = (s: string, from: string, to: string) => { const a = s.indexOf(from); expect(a, from).toBeGreaterThan(-1); const b = s.indexOf(to, a + from.length); return s.slice(a, b < 0 ? undefined : b); };

describe("UI 1: the progress line shows only this turn's steps", () => {
  it("a turn's start and the end of a sentence to Jarvis move the turn's start; the bar and the long-turn card read only steps since", () => {
    expect(between(src, "const handle = async", "const handleRef")).toMatch(/hud\.set\(\{[^}]*turnAt: performance\.now\(\)/);
    expect(between(src, "mark: (name, t) =>", "onEarcon =")).toMatch(/turnAt: t/);
    expect(hudSrc).toMatch(/currentSteps\(s\.steps, s\.turnAt\)/);
    expect(hudSrc).not.toMatch(/<ProgressLine steps=\{s\.steps\}/);
    expect(between(src, "const progress: ProgressRow[]", "const long =")).toContain("currentSteps(");
  });
});

describe("UI 2: the evidence chip's time is this turn's", () => {
  it("never the strip's last measurement, which may be another turn's", () => {
    const eff = between(src, "// the evidence chip under the answer", "// ----");
    expect(eff).not.toMatch(/findingMs \?\? s\.lastMs/);
    expect(eff).toContain("turnMs(measured.current, turnGen.current)");
    expect(between(src, "const handle = async", "const handleRef")).toMatch(/measured\.current = \{ gen,/);
  });
});

describe("UI 3: live regions are not re-read every second or every sentence", () => {
  it("the long-turn card announces only its words; the seconds are hidden from screen readers and the steps sit outside the region", () => {
    const card = between(src, "const longCard =", ") : null;");
    expect(card).not.toMatch(/<div className="th-card" role="status"/);
    expect(card).toMatch(/<p role="status" aria-live="polite">/);
    expect(card).toMatch(/<span aria-hidden="true">\{ta \? ` · \$\{long\.seconds\}/);
  });
  it("the Stage's region reads the answer once it has settled, never while it streams", () => {
    expect(stageSrc).not.toMatch(/aria-live="polite">\{p\.busy \?\? p\.caption\.reply\}/);
    expect(stageSrc).toContain("SETTLE_MS");
    expect(stageSrc).toMatch(/p\.caption\.streaming \? null : p\.caption\.reply/);
    expect(src).toMatch(/interim: !!interim, streaming,/);
  });
});

describe("UI 4: stacked cards never push the mission card off a 1366x768 screen", () => {
  it("the cards scroll within the screen's height and take their own taps", () => {
    const rule = hudCss.match(/\.hud-cards \{[^}]*\}/)?.[0] ?? "";
    expect(rule).toMatch(/max-height: calc\(100dvh - 160px\)/);
    expect(rule).toMatch(/overflow-y: auto/);
    expect(rule).toMatch(/pointer-events: auto/);
  });
  it("the brief's card folds once it has been said", () => {
    expect(between(src, "const briefMe = async", "const briefRef")).toMatch(/onEnd: \(\) => \{[^}]*setBriefFolded\(true\)/);
    expect(src).toMatch(/th-card\$\{briefFolded \? " folded" : ""\}/);
  });
});

describe("UI 5: Tamil at 16 px, never letter-spaced, in the cards and the memory panel", () => {
  it("no inline 13 px on the brief's items or the long turn's rows", () => {
    expect(src).not.toMatch(/fontSize: 13/);
  });
  it("the cards' Tamil is 16 px with line-height 1.6", () => {
    expect(hudCss).toMatch(/\.hud \.hud-cards \.th-card\[lang="ta"\] :is\(p, li, small, b\)[^{]*\{ font-size: 16px; line-height: 1\.6; \}/);
    expect(thCss).toMatch(/\.thunai \.th-card\[lang="ta"\] p,[^{]*\{ font-size: 16px; line-height: 1\.6; \}/);
  });
  it("the panel says its language, and its Tamil headings are neither letter-spaced nor upper-cased", () => {
    expect(src).toMatch(/<aside className="th-panel" aria-label=\{panel\} lang=\{listenLang\}>/);
    expect(thCss).toMatch(/\.th-panel\[lang="ta"\] h4 \{[^}]*letter-spacing: normal; text-transform: none;/);
    expect(src).toMatch(/role="dialog" aria-label=\{askOnce\.question\} lang=\{askOnce\.lang\}/);
    expect(src).toMatch(/role="dialog" aria-label=\{pendingB\.text\} lang=\{pendingB\.lang\}/);
  });
});

describe("Planner 3: on the server's voice a streamed answer is asked for once", () => {
  it("sentences queue only on the browser's own voice, decided once a turn; RUN_FINISHED then says the whole answer", () => {
    const say = between(src, "const streamSay = ", "/** Ask the agent");
    expect(say).toMatch(/queuesSentences\(pathFor\(/);
    expect(say).toMatch(/if \(!sx\.speaks\) return;/);
    expect(between(src, "const showStage = ", "/** The offered next step")).toMatch(/said: sx\?\.speaks \? sx\.said : \[\]/);
  });
});

describe("Numbers 2 and 3: what reaches the planner, the confirm and the repeat", () => {
  it("a screen opened from a control is remembered by its code label, never by its title", () => {
    const show = between(src, "const showStage = ", "/** The offered next step");
    expect(show).not.toMatch(/remember\(opts\.heard \?\? doc\.title/);
    expect(show).toContain("remember(opts.heard ?? screenLabel(doc)");
  });
  it("the Level-B question says and shows only the Collector's own figures", () => {
    const g = between(src, "const gateB = ", "// ----");
    // the one builder writes it (rc15.pass4: no second copy to drift), and its line is gated
    expect(g).toContain("confirmAsk(confirmLine(");
    expect(g).toMatch(/out\(q\.text, lang, "asking", q\.allowed\)/);
  });
  it("\"repeat\" says the last line again through the gate it was first said with", () => {
    expect(src).toMatch(/case "repeat": \{ const l = lastSpoken\.current; if \(l\) out\(l\.text, l\.lang, "ready", l\.allowed\)/);
  });
});

describe("Proactive 1-3 and the one unprompted budget", () => {
  it("the brief is re-checked after its fetch", () => {
    const b = between(src, "const briefMe = async", "const briefRef");
    const fetchAt = b.indexOf("await fetch(\"/api/collector/thunai/brief\")"), checkAt = b.indexOf("briefStale(");
    expect(fetchAt).toBeGreaterThan(-1);
    expect(checkAt).toBeGreaterThan(fetchAt);
  });
  it("the power-on brief tries again while Jarvis is only speaking, and replaces the morning greeting", () => {
    expect(between(src, "const powerOnBrief = ", "/** \"What do you remember")).toMatch(/briefGo\(liveNow\(\)\)[\s\S]*"retry"/);
    expect(between(src, "// --------------------------------------------------------------- Watch --", "// the server's watch")).toContain("greetingOk(");
  });
  it("every onset the ears saw is the Collector speaking, for the interjections and the old watch alike", () => {
    expect(between(src, "const liveNow = ", "};")).toContain("lastUserSpeech: userSpokeAt()");
    expect(src).toMatch(/conductor\.current\?\.lastSpeechAt/);
    expect(between(src, "// --------------------------------------------------------------- Watch --", "// the server's watch")).toContain("lastUserSpeech: userSpokeAt()");
  });
  it("the old watch's lines go through the interjection gate, count in one ledger, and are told to the server", () => {
    const w = between(src, "// --------------------------------------------------------------- Watch --", "// the server's watch");
    expect(w).toMatch(/interjectNow\(clientSignal\(s\), liveNow\(\), now, unpromptedTimes\(\)\)\.ok/);
    expect(w).toContain("noteUnprompted(now)");
    expect(w).toMatch(/op: "spoken", key: s\.key/);
    expect(between(src, "const interject = ", "const interjectRef")).toContain("interjectNow(sig, liveNow(), Date.now(), unpromptedTimes())");
  });
});

describe("Voice 5: one recogniser at a time", () => {
  it("while Whisper is out the conductor's recogniser hears the speech, and the live captions stand aside", () => {
    // (v15: the live captions, kept ready since the wake, are stopped there: one recogniser at a time)
    expect(between(src, "onSpeechStart: (o:", "onSpeechEnd:")).toMatch(/if \(o\.fallback\) \{ captions\.current\?\.stop\(\); return; \}/);
  });
});
