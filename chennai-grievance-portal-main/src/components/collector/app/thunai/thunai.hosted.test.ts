/**
 * 27 Nov, the hosted copy in Chrome (the investigation hosted-jarvis): what the page does about it, read from Thunai.tsx's own source where
 * it lives inside the component, and run where it is a pure function (statusOf, the bar, the chip, next.config.js's headers).
 *  - B4: an open by the Collector's own hand (no `why`: a click, a shortcut, Unmute) is a call; the name's open ("wake") engages on its own and
 *    a tab coming back ("hidden") is none.
 *  - B1: any click or key resumes every Jarvis audio context, open or closed, and unlocks the voice; B8: a refused voice asks for a click.
 *  - B3/B10: a stalled start and a signed-out session are said as what they are; the stall goes to telemetry as one code.
 *  - B5: the bar never says "Opening the microphone" for ever, and says when the browser's own question is up.
 *  - B6: Jarvis's files in public/thunai are cached; B7: the chip on Jarvis's button; B9: one tab listens at a time.
 */
import fs from "fs";
import path from "path";
import React, { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import Hud from "./Hud";
import { hud, MIC_SLOW_MS, statusOf } from "./hudstore";
import WakeChip, { wakeChipText } from "./WakeChip";

(globalThis as { React?: unknown }).React = React;
// (the working copy's line endings are CRLF on this machine: the checks below are written with "\n")
const src = fs.readFileSync(path.join(__dirname, "Thunai.tsx"), "utf8").replace(/\r\n/g, "\n");
const between = (a: string, b: string) => { const i = src.indexOf(a); const j = src.indexOf(b, i + a.length); return i >= 0 && j > i ? src.slice(i, j) : ""; };
afterEach(() => hud.set({ mode: "off", turn: "off", core: "off", firstUse: false, needsResume: false, micSince: 0, micWait: null, wakeNeeds: null, engagedUntil: 0 }));

describe("B4: an open by the Collector's hand is a call", () => {
  const setMode = between("const setMode = useCallback(", "}, []); // eslint-disable-line react-hooks/exhaustive-deps");
  it("no `why` (the button, a shortcut, Unmute): engaged and called right after the microphone is asked for", () => {
    expect(setMode).toContain("engageOnOpen.current = !why;");
    const open = setMode.indexOf("openMic();");
    expect(open).toBeGreaterThan(-1);
    expect(setMode.slice(open, open + 120)).toContain("if (!why) { engagedNow(); conductor.current?.called(); }");
  });
  it("once the microphone is live, the window without the name runs from then (the browser's question may have taken a while)", () => {
    const open = between("const openMic = () => {", "const setModeRef");
    // (review, 27 Nov) and the call is made again with it, or the first sentence stops being the call's own (conductor.ts calledNow); only the
    // latest opening's end uses or clears the flag
    expect(open).toContain("if (my === micOpenSeq.current && engageOnOpen.current && modeRef.current === \"on\" && c.micLive) { engagedNow(); c.called(); }");
    expect(open).toContain("if (my === micOpenSeq.current) engageOnOpen.current = false;");
  });
  it("the first-use notice's \"Understood, open it\" is the same call", () => {
    expect(src).toMatch(/onDismissFirstUse=\{\(\) => \{[^\n]*openMic\(\); if \(engageOnOpen\.current\) \{ engagedNow\(\); conductor\.current\?\.called\(\); \}/);
  });
  it("the name's open and a tab coming back pass a `why` (they are not this call)", () => {
    expect(src).toContain("setModeRef.current(\"on\", \"wake\");");
    expect(src).toContain("setModeRef.current(\"on\", \"hidden\");");
  });
});

describe("B1/B8: a click or a key wakes Jarvis's audio, open or closed", () => {
  const eff = between("const wakeAudio = () => {", "  }, []);");
  it("resumes the ears' contexts (the closed listener's too) and the voice's, unlocks the voice, on every pointerdown and keydown", () => {
    expect(eff).toContain("unlockSpeech();");
    expect(eff).toContain("resumeEars()");
    expect(eff).toContain("resumeMouth()");
    expect(eff).toContain("const click = (e: Event) => {\n      wakeAudio();");
    expect(eff).toContain('window.addEventListener("pointerdown", click, { capture: true });');
    expect(eff).toContain('window.addEventListener("keydown", click, { capture: true });');
  });
  it("a voice the browser refused asks for a click (needsResume)", () => {
    expect(eff).toContain("setAudioBlocked(() => { if (modeRef.current !== \"off\") hud.set({ needsResume: true }); });");
  });
  it("the conductor's \"gesture\" asks for a click only while Jarvis is on", () => {
    expect(src).toContain("if (why === \"gesture\") { if (modeRef.current === \"on\") hud.set({ needsResume: true }); return; }");
  });
});

describe("B3/B10: a stalled start and a signed-out session are said", () => {
  it("\"stalled\": muted, with a notice saying it did not start and how to try again; the report goes to telemetry as one code", () => {
    expect(src).toContain("The microphone did not start. Press Unmute to try again, or type your question.");
    expect(src).toContain("onStall: (s) => noteDropped({ why: stallCode(s), lang: listenLangRef.current, conf: 0, engaged: false }),");
  });
  it("signed out: muted, and the bar says to sign in again (never \"I didn't catch that\")", () => {
    const h = between("onSignedOut: () => {", "\n      },");
    expect(h).toContain("setMode(\"muted\")");
    expect(h).toContain("You are signed out. Sign in again to use Jarvis.");
  });
});

describe("B5: the bar while the microphone opens", () => {
  const base = { mode: "on" as const, core: "idle" as const, firstUse: false, doing: "", engagedUntil: 0 };
  it("the browser's question is up: it says to allow the microphone", () => {
    expect(statusOf({ ...base, micWait: "permission", micSince: 1000 }, false, 2000).word).toBe("Allow the microphone");
    expect(statusOf({ ...base, micWait: "permission", micSince: 1000 }, true, 2000).word).toBe("மைக்கை அனுமதியுங்கள்");
  });
  it("past MIC_SLOW_MS it says it is slow, never \"Opening the microphone\" for ever, and \"Go ahead\" stops being said", () => {
    expect(statusOf({ ...base, micSince: 1000 }, false, 1000 + MIC_SLOW_MS - 1).word).toBe("Opening the microphone");
    expect(statusOf({ ...base, micSince: 1000 }, false, 1000 + MIC_SLOW_MS).word).toBe("Still opening the microphone");
    expect(statusOf({ ...base, wakeOpening: true, micSince: 1000 }, false, 2000)).toEqual({ word: "Listening", hint: "Go ahead." });
    expect(statusOf({ ...base, wakeOpening: true, micSince: 1000 }, false, 1000 + MIC_SLOW_MS).word).toBe("Still opening the microphone");
  });
  it("the microphone open but the browser waiting for a click: it says to click", () => {
    expect(statusOf({ ...base, core: "listening", needsResume: true }, false, 0).word).toBe("Click to start");
    expect(statusOf({ ...base, core: "listening", needsResume: false }, false, 0).word).toBe("Listening");
  });
  it("openMic starts and ends the opening state, for this opening only", () => {
    const open = between("const openMic = () => {", "const setModeRef");
    expect(open).toContain("hud.set({ micSince: Date.now(), micWait: null });");
    expect(open).toContain("void askedForMic(my);");
    expect(open).toContain("if (my === micOpenSeq.current) hud.set({ micSince: 0, micWait: null });");
  });
  it("the bar's notice asks for the click in words (B1, B8)", () => {
    hud.set({ mode: "on", turn: "listening", core: "listening", needsResume: true });
    const html = renderToStaticMarkup(createElement(Hud, { lang: "en", coreRef: createRef<HTMLSpanElement>() as never, stageOpen: false, onSend: () => undefined, onStop: () => undefined, onDismissFirstUse: () => undefined }));
    expect(html).toContain("Click anywhere on the page so I can hear you and speak");
    expect(html).toContain("Click to start");
  });
});

describe("B7: the chip on Jarvis's button", () => {
  it("plain words in both languages", () => {
    expect(wakeChipText(false)).toBe("Click once to turn on \"Hey Jarvis\"");
    expect(wakeChipText(true)).toMatch(/ஜார்விஸ்/);
  });
  it("nothing is drawn where the button's box is not on the page", () => {
    hud.set({ mode: "off", wakeNeeds: "click" });
    expect(renderToStaticMarkup(createElement(WakeChip, { lang: "en" }))).toBe("");
  });
  it("Thunai draws it only while Jarvis is closed", () => {
    expect(src).toContain("{mode === \"off\" && <WakeChip lang={listenLang} />}");
  });
});

describe("B9: one tab listens at a time", () => {
  it("a tab whose microphone opens says so; a tab that was listening goes to muted and says why", () => {
    expect(between("const openMic = () => {", "const setModeRef")).toContain("tabChannel.current?.postMessage({ type: \"mic-open\", tab: tabId.current })");
    const eff = between("new BroadcastChannel(\"jarvis\")", "  }, []);");
    expect(eff).toContain("m.tab === tabId.current || modeRef.current !== \"on\") return;");
    expect(eff).toContain("setModeRef.current(\"muted\");");
    expect(eff).toContain("Jarvis is listening in another tab. Press Unmute to use it here.");
  });
});

describe("B6: Jarvis's files in public/thunai are cached (next.config.js headers)", () => {
  const root = path.resolve(__dirname, "../../../../..");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cfg = require(path.join(root, "next.config.js")) as { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getPathMatch } = require(path.join(root, "node_modules/next/dist/shared/lib/router/utils/path-match.js")) as { getPathMatch: (s: string, o: object) => (p: string) => unknown };
  const cache = async (p: string) => (await cfg.headers()).filter((h) => getPathMatch(h.source, { removeUnnamedParams: true, strict: true })(p)).flatMap((h) => h.headers.filter((x) => x.key === "Cache-Control").map((x) => x.value));
  it("the models a week, immutable; the worker, the worklet and the wake replies a day; the security headers still on every path", async () => {
    expect(await cache("/thunai/hey_jarvis.onnx")).toEqual(["public, max-age=604800, immutable"]);
    expect(await cache("/thunai/silero_vad_v5.onnx")).toEqual(["public, max-age=604800, immutable"]);
    expect(await cache("/thunai/kws.worker.js")).toEqual(["public, max-age=86400"]);
    expect(await cache("/thunai/ears.worklet.js")).toEqual(["public, max-age=86400"]);
    expect(await cache("/thunai/wake/manifest.json")).toEqual(["public, max-age=86400"]);
    expect(await cache("/collector")).toEqual([]);
    expect(await cache("/thunai/README.md")).toEqual([]);
    const all = await cfg.headers();
    expect(all[0].source).toBe("/:path*");
    expect(all[0].headers.some((h) => h.key === "Content-Security-Policy")).toBe(true);
  });
});
