import fs from "fs";
import path from "path";
import React, { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import Hud from "./Hud";
import JarvisFab from "./JarvisFab";
import { frameDelay, glowAt, smoothLevel, visualOf, visualStateOf, type VisualState } from "./hudcore";
import { hud, type HudEvidence, type HudMission, type HudState } from "./hudstore";
import { announcement, captionParts, captionView, evidenceOf, evidenceParts, fmtMs, isListenKey, missionMs, missionPhase, progressItems, wordIndexAt } from "./hudview";
import { followLayout, samePlaces } from "./layoutwatch";
import { followMap, setConsoleMap } from "./mapbridge";
import type { StageDocT } from "@/lib/thunai/stage";

// this vitest config compiles .tsx with the classic JSX runtime
(globalThis as { React?: unknown }).React = React;
const render = (stageOpen = false, lang: "en" | "ta" = "en") => renderToStaticMarkup(createElement(Hud, { lang, coreRef: createRef<HTMLSpanElement>() as never, stageOpen, onSend: () => undefined, onStop: () => undefined, onDismissFirstUse: () => undefined }));
const css = fs.readFileSync(path.join(__dirname, "hud.css"), "utf8");
const reset = (): Partial<HudState> => ({ mode: "off", turn: "off", core: "off", firstUse: false, focus: null, steps: [], answer: "", asked: "", panels: [], ribbon: "", acting: false, caption: null, evidence: null, mission: null, interjection: null, queue: 0, actions: {} });
afterEach(() => { setConsoleMap(null); hud.set(reset()); });

const ALL: VisualState[] = ["off", "idle", "listening", "hearing", "thinking", "acting", "speaking", "holding", "interrupted", "offline"];
const run = { hidden: false, reduced: false, sinceMs: 0 };

describe("one state machine drives every visual (Pillar 6)", () => {
  it("gives every state a speed, an intensity, a glow and a frame rate", () => {
    for (const s of ALL) {
      const v = visualOf(s, 0.5);
      expect(v.state).toBe(s);
      for (const k of ["speed", "intensity", "glow", "level"] as const) { expect(v[k], `${s}.${k}`).toBeGreaterThanOrEqual(0); expect(v[k], `${s}.${k}`).toBeLessThanOrEqual(1.5); }
    }
  });
  it("follows the level only where it means something: the mic while listening or hearing, the voice while speaking", () => {
    expect(visualOf("thinking", 0.9).level).toBe(0);
    expect(visualOf("holding", 0.9).level).toBe(0);
    expect(visualOf("hearing", 0.9).level).toBeCloseTo(0.9);
    expect(visualOf("speaking", 0.9).glow).toBeGreaterThan(visualOf("speaking", 0).glow);
  });
  it("clamps a bad level instead of drawing NaN", () => {
    expect(visualOf("speaking", Number.NaN).level).toBe(0);
    expect(visualOf("speaking", 7).level).toBe(1);
  });
  it("is still where nothing moves: off, holding, offline", () => {
    for (const s of ["off", "holding", "offline"] as const) { expect(visualOf(s, 1).speed).toBe(0); expect(visualOf(s, 1).fps).toBe(0); }
  });
  it("reads acting from the store: a plan step runs while the core says thinking; a muted mic is still", () => {
    expect(visualStateOf({ mode: "on", core: "thinking", acting: true })).toBe("acting");
    expect(visualStateOf({ mode: "on", core: "thinking", acting: false })).toBe("thinking");
    expect(visualStateOf({ mode: "muted", core: "idle" })).toBe("off");
    expect(visualStateOf({ mode: "on", core: "speaking", acting: true })).toBe("speaking");
  });
  it("smooths the level: rises fast, falls slowly, stays in 0..1", () => {
    const up = smoothLevel(0, 1, 40), down = 1 - smoothLevel(1, 0, 40);
    expect(up).toBeGreaterThan(down);
    expect(smoothLevel(0.5, Number.NaN, 16)).toBeLessThanOrEqual(1);
    expect(smoothLevel(0, 1, 10_000)).toBeLessThanOrEqual(1);
  });
  it("swells the glow only while it really works", () => {
    const t = visualOf("thinking", 0);
    expect(glowAt(t, 0.5)).not.toBe(glowAt(t, 1.5));
    const l = visualOf("listening", 0.2);
    expect(glowAt(l, 0.5)).toBe(glowAt(l, 1.5));
  });
});

describe("the core's frame rate (Hud.tsx ran 60 fps in every state)", () => {
  it("rests at about 15 fps when idle, and when listening to a quiet room", () => {
    for (const v of [visualOf("idle", 0), visualOf("listening", 0)]) {
      const d = frameDelay(v, run)!;
      expect(1000 / d).toBeGreaterThanOrEqual(14);
      expect(1000 / d).toBeLessThanOrEqual(16);
    }
  });
  it("speaks at 55 fps or more", () => {
    expect(1000 / frameDelay(visualOf("speaking", 0.5), run)!).toBeGreaterThanOrEqual(55);
  });
  it("stops the loop when nothing changes: holding, offline, off, a finished interruption", () => {
    for (const s of ["holding", "offline", "off"] as const) expect(frameDelay(visualOf(s, 0.4), run)).toBeNull();
    expect(frameDelay(visualOf("interrupted", 0), { ...run, sinceMs: 40 })).not.toBeNull();
    expect(frameDelay(visualOf("interrupted", 0), { ...run, sinceMs: 400 })).toBeNull();
  });
  it("stops in a hidden tab and under reduced motion, in every state", () => {
    for (const s of ALL) {
      expect(frameDelay(visualOf(s, 0.5), { ...run, hidden: true })).toBeNull();
      expect(frameDelay(visualOf(s, 0.5), { ...run, reduced: true })).toBeNull();
    }
  });
  it("the core's loop is scheduled by frameDelay, not by an unconditional requestAnimationFrame", () => {
    const src = fs.readFileSync(path.join(__dirname, "Hud.tsx"), "utf8");
    expect(src).toMatch(/frameDelay\(/);
    expect(src).toMatch(/if \(d == null\)/);
  });
});

describe("captions: the word under the voice, as whole words", () => {
  it("marks the word the index is on", () => {
    expect(captionParts("Ten cases are overdue", 4)).toEqual({ done: "Ten ", word: "cases", rest: " are overdue" });
    expect(wordIndexAt("Ten cases are overdue", 4)).toBe(1);
    expect(wordIndexAt("Ten cases are overdue", 0)).toBe(0);
  });
  it("snaps an index inside a word back to its start: a Tamil letter is never split", () => {
    const t = "அடையாறில் பத்து புகார்கள் உள்ளன";
    const inside = t.indexOf("புகார்கள்") + 3;
    const p = captionParts(t, inside);
    expect(p.word).toBe("புகார்கள்");
    expect(p.done + p.word + p.rest).toBe(t);
    expect(wordIndexAt(t, inside)).toBe(2);
  });
  it("marks nothing without an index, and copes with an index past the end", () => {
    expect(captionParts("Ten cases", null)).toEqual({ done: "", word: "", rest: "Ten cases" });
    expect(captionParts("Ten cases", 99).word).toBe("cases");
    expect(wordIndexAt("Ten cases", null)).toBeNull();
  });
  it("shows a long piece a page at a time, the page that holds the word", () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const at = words.indexOf("word50");
    const v = captionView(words, at, 80);
    expect(v.word).toBe("word50");
    expect(v.before).toBe(true);
    expect(v.done.length + v.word.length + v.rest.length).toBeLessThanOrEqual(80);
    expect(captionView("short line", null).page).toBe(0);
  });
});

describe("the progress line and the evidence chip: values from code", () => {
  it("formats times", () => {
    expect(fmtMs(320)).toBe("320 ms");
    expect(fmtMs(1234)).toBe("1.2 s");
    expect(fmtMs(1234, true)).toBe("1.2 வி");
  });
  it("shows the last steps and counts the earlier ones", () => {
    const steps = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, label: `Step ${i}`, state: "done" as const, ms: 100 * i, at: 0 }));
    const p = progressItems(steps);
    expect(p.shown.map((x) => x.id)).toEqual(["s2", "s3", "s4", "s5"]);
    expect(p.earlier).toBe(2);
  });
  const doc = {
    v: 1, id: "d1", recipe: "cases", title: "Severe cases", takeaway: null, say: { en: "", ta: "" }, slots: {}, notes: [], asOf: "2026-11-14 09:00",
    scope: { period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null },
    sources: ["GCC 1913", "change_drivers", "GCC 1913"],
    blocks: [{ kind: "CaseList", id: "b1", title: "Cases", source: "list", sev: null, total: 47, rows: [] }, { kind: "Ranking", id: "b2", title: "Zones", unit: null, method: "count of open cases", order: "top", items: [] }]
  } as unknown as StageDocT;
  it("builds the evidence from the turn and the screen, never from a model's words", () => {
    const e = evidenceOf({ by: "ai", model: "anthropic/claude-opus-5-5#2", ms: 2412.6 }, doc)!;
    expect(e).toEqual({ by: "ai", model: "claude-opus-5-5", ms: 2413, method: "count of open cases", n: 47, period: "weekly", sources: ["GCC 1913", "change_drivers"], asOf: "2026-11-14 09:00" });
    expect(evidenceParts(e)).toEqual(["AI", "claude-opus-5-5", "2.4 s", "count of open cases", "n = 47", "This week", "GCC 1913 +1"]);
  });
  it("a rules answer has no model, and its time is the one measured", () => {
    const e = evidenceOf({ by: "rules", model: "groq/llama", ms: 0 }, null, 640)!;
    expect(e.model).toBeNull();
    expect(e.ms).toBe(640);
    expect(evidenceParts(e, true)).toEqual(["விதிகள்", "640 மி.வி"]);
    expect(evidenceOf(null, null)).toBeNull();
  });
});

describe("the mission and what the screen reader hears", () => {
  const m = (states: HudMission["steps"][number]["state"][], running = false): HudMission => ({ id: "m", title: "Water board", running, steps: states.map((s, i) => ({ label: `Step ${i}`, state: s, ms: s === "done" ? 1000 : null })) });
  it("knows a plan from a run from a finished mission", () => {
    expect(missionPhase(m(["pending", "pending"]))).toBe("plan");
    expect(missionPhase(m(["done", "running"], true))).toBe("running");
    expect(missionPhase(m(["done", "skipped", "failed"]))).toBe("done");
    expect(missionMs(m(["done", "done", "skipped"]))).toBe(2000);
    expect(missionMs(m(["pending"]))).toBeNull();
  });
  it("announces what settled: something noticed, then an answer, then a new state word; nothing twice", () => {
    expect(announcement({ word: "Listening", answer: "" }, { word: "Answering", answer: "Ten cases." })).toBe("Ten cases.");
    expect(announcement({ word: "Answering", answer: "Ten cases." }, { word: "Listening", answer: "Ten cases." })).toBe("Listening");
    expect(announcement({ word: "Listening", answer: "x" }, { word: "Listening", answer: "x" })).toBeNull();
    expect(announcement({ word: "Listening", answer: "x" }, { word: "Listening", answer: "x", alert: "Rain over 50 mm in Adyar" })).toBe("Rain over 50 mm in Adyar");
  });
});

describe("the listen key (Alt+Space is the window menu on Windows)", () => {
  const k = (p: Partial<KeyboardEvent>) => ({ ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, code: "Space", ...p });
  it("is Ctrl+Shift+Space, and Alt+Space is not it", () => {
    expect(isListenKey(k({ ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(isListenKey(k({ altKey: true }))).toBe(false);
    expect(isListenKey(k({ ctrlKey: true }))).toBe(false);
    expect(isListenKey(k({ ctrlKey: true, shiftKey: true, code: "KeyJ" }))).toBe(false);
  });
});

describe("the reticle follows the map's events, not a timer (it re-rendered every 600 ms)", () => {
  const fakeMap = () => {
    const on = new Map<string, () => void>();
    return {
      on: (t: string, f: () => void) => { on.set(t, f); }, off: vi.fn((t: string) => { on.delete(t); }), fire: () => [...on.values()].forEach((f) => f()), bound: () => on.size,
      latLngToContainerPoint: () => ({ x: 10, y: 10 }), getContainer: () => ({ isConnected: true, offsetWidth: 100, getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100 }) }) as unknown as HTMLElement
    };
  };
  it("calls back once a frame when the map moves, rebinds when the map is swapped, and lets go when stopped", () => {
    const every = vi.spyOn(globalThis, "setInterval");
    const frames: (() => void)[] = [];
    const a = fakeMap(), b = fakeMap();
    setConsoleMap(a);
    let moved = 0;
    const stop = followMap(() => { moved++; }, { win: null, frame: (f) => frames.push(f) });
    a.fire(); a.fire();
    expect(frames.length).toBe(1);
    frames.shift()!();
    expect(moved).toBe(1);
    setConsoleMap(b);
    frames.shift()!();
    expect(moved).toBe(2);
    expect(a.bound()).toBe(0);
    b.fire(); frames.shift()!();
    expect(moved).toBe(3);
    stop();
    expect(b.bound()).toBe(0);
    b.fire();
    expect(frames.length).toBe(0);
    expect(every).not.toHaveBeenCalled();
    every.mockRestore();
  });
  it("mapbridge has no interval left", () => {
    expect(fs.readFileSync(path.join(__dirname, "mapbridge.tsx"), "utf8")).not.toMatch(/setInterval/);
  });
});

describe("the numbered badges follow the page's changes, not a 1.2 s timer (for Thunai.tsx)", () => {
  it("wakes once a frame for a change outside Jarvis's layer, never for its own, and lets go when stopped", () => {
    let cb: MutationCallback | null = null;
    const disconnect = vi.fn();
    class FakeMO { constructor(f: MutationCallback) { cb = f; } observe() { /* watching */ } disconnect() { disconnect(); } }
    const el = (inJarvis: boolean) => ({ target: { nodeType: 1, closest: (sel: string) => (inJarvis && sel === "[data-thunai-ui]" ? {} : null) } }) as unknown as MutationRecord;
    const frames: (() => void)[] = [];
    let n = 0;
    const stop = followLayout(() => { n++; }, { root: {} as Node, ignore: "[data-thunai-ui]", win: null, frame: (f) => frames.push(f), Observer: FakeMO as never });
    cb!([el(true)], null as never);
    expect(frames.length).toBe(0);
    cb!([el(false), el(false)], null as never);
    cb!([el(false)], null as never);
    expect(frames.length).toBe(1);
    frames.shift()!();
    expect(n).toBe(1);
    stop();
    expect(disconnect).toHaveBeenCalled();
  });
  it("knows the same places to the pixel", () => {
    const a = [{ n: 1, x: 10.2, y: 20, name: "Map" }];
    expect(samePlaces(a, [{ n: 1, x: 10.4, y: 20, name: "Map" }])).toBe(true);
    expect(samePlaces(a, [{ n: 1, x: 14, y: 20, name: "Map" }])).toBe(false);
    expect(samePlaces(a, [])).toBe(false);
  });
});

describe("the bar (rendered)", () => {
  it("docks the core in the bar, before the words, with a border glow and no dial of ticks", () => {
    hud.set({ mode: "on", turn: "listening", core: "listening" });
    const html = render();
    const bar = html.slice(html.indexOf('class="hud-bar"'));
    expect(bar.indexOf("hud-core")).toBeGreaterThan(-1);
    expect(bar.indexOf("hud-core")).toBeLessThan(bar.indexOf("hud-read"));
    expect(bar).toContain('class="hud-glow"');
    expect(html).not.toContain("hud-ticks");
    expect(html).toContain('data-mic="hot"');
  });
  it("shows the turn's real steps and their times as one line under the state word while it works", () => {
    hud.set({ mode: "on", turn: "thinking", core: "thinking", steps: [{ id: "a", label: "Understanding", state: "done", ms: 1240, at: 0 }, { id: "b", label: "Finding the cases", state: "running", ms: null, at: 0 }] });
    const html = render();
    expect(html).toContain('data-testid="progress"');
    expect(html).toContain("Understanding");
    expect(html).toContain("1.2 s");
    expect(html.indexOf('data-testid="state"')).toBeLessThan(html.indexOf('data-testid="progress"'));
    hud.set({ turn: "listening", core: "listening" });
    expect(render()).not.toContain('data-testid="progress"');
  });
  it("un-hides the plan's chips as one compact line, and keeps one line, not two", () => {
    expect(css).not.toMatch(/\.th-chips\s*\{\s*display:\s*none/);
    expect(css).toMatch(/\.hud-dock:has\(\.hud-cards \.th-chips\) \.hud-progress\s*\{\s*display:\s*none/);
  });
  it("captions what is said with the word marked, also with a screen open", () => {
    hud.set({ mode: "on", turn: "speaking", core: "speaking", caption: { text: "Ten cases are overdue", char: 4, lang: "en" } });
    for (const open of [false, true]) {
      const html = render(open);
      expect(html).toContain('data-testid="caption"');
      expect(html).toContain("<mark>cases</mark>");
    }
  });
  it("marks a whole Tamil word, never part of one", () => {
    const t = "அடையாறில் பத்து புகார்கள் உள்ளன";
    hud.set({ mode: "on", turn: "speaking", core: "speaking", caption: { text: t, char: t.indexOf("புகார்கள்") + 2, lang: "ta" } });
    expect(render(false, "ta")).toContain("<mark>புகார்கள்</mark>");
  });
  it("puts the evidence chip under an answer, a button when it can open the rows", () => {
    const e: HudEvidence = { by: "ai", model: "claude-opus-5-5", ms: 2400, method: null, n: 47, period: "weekly", sources: [], asOf: null };
    hud.set({ mode: "on", turn: "listening", core: "listening", answer: "Forty-seven cases this week.", evidence: e });
    expect(render()).toMatch(/<p class="hud-ev"[^>]*>.*claude-opus-5-5.*n = 47.*This week/);
    hud.actions({ onEvidence: () => undefined });
    expect(render()).toMatch(/<button type="button" class="hud-ev"/);
    hud.set({ core: "thinking", turn: "thinking" });
    expect(render()).not.toContain('data-testid="evidence"');
  });
  it("shows a mission's plan with Start and Edit, then its steps ticking with real times and Stop", () => {
    hud.set({ mode: "on", turn: "listening", core: "listening", mission: { id: "m1", title: "Water board for Velachery", running: false, steps: [{ label: "Open the cases", state: "pending", ms: null }, { label: "Focus the map", state: "pending", ms: null }] } });
    let html = render();
    expect(html).toContain('data-testid="mission"');
    expect(html).toMatch(/Start/);
    expect(html).toMatch(/Edit/);
    expect(html).not.toMatch(/>Stop</);
    hud.set({ mission: { id: "m1", title: "Water board for Velachery", running: true, steps: [{ label: "Open the cases", state: "done", ms: 820 }, { label: "Focus the map", state: "running", ms: null }] } });
    html = render();
    expect(html).toContain("820 ms");
    expect(html).toContain('aria-current="step"');
    expect(html).toMatch(/Stop/);
    expect(html).not.toMatch(/>Start</);
  });
  it("brings up an interjection with Tell me and Later, and a badge for what waits", () => {
    hud.set({ mode: "on", turn: "listening", core: "listening", interjection: { id: "i1", text: "Rain in Adyar passed the alert line", severity: "high" }, queue: 3 });
    const html = render();
    expect(html).toContain('data-testid="interjection"');
    expect(html).toContain("sev-high");
    expect(html).toContain("Tell me");
    expect(html).toContain("Later");
    expect(html).not.toContain("Not about this");
    expect(html).toMatch(/data-testid="queue"[^]*<em>3<\/em>/);
  });
});

describe("one way to the earlier questions, a smaller corner card that folds", () => {
  const answer = () => hud.set({ mode: "on", turn: "listening", core: "listening", answer: "Ten cases.", asked: "How many severe cases?", panels: [{ id: "p", title: "Severe cases", takeaway: null, figures: [], source: null, recipe: "cases", at: 0, slots: { a: 1 } }] });
  it("the bar has the one Questions button; the answer's card has none", () => {
    answer();
    const html = render();
    expect(html.match(/data-jq-toggle/g)?.length).toBe(1);
    expect(html).not.toContain("Earlier questions</button>");
    expect(html).toContain('data-testid="answer"');
  });
  it("Jarvis's own button shows the clock only while Jarvis is closed", () => {
    const fab = () => renderToStaticMarkup(createElement(JarvisFab));
    hud.set({ mode: "off" });
    expect(fab()).toContain("jvf-q");
    hud.set({ mode: "on" });
    expect(fab()).not.toContain("jvf-q");
  });
  it("the corner card has a fold button and is narrower than before (370 px)", () => {
    answer();
    expect(render()).toMatch(/aria-label="Fold this answer away"/);
    const w = Number(css.match(/\.hud-ans \{[^}]*width: min\((\d+)px/)?.[1]);
    expect(w).toBeLessThan(370);
    expect(css).toMatch(/\.hud-pill \{/);
  });
});

describe("the light page and motion", () => {
  it("has no navy disc behind the core", () => {
    expect(css).not.toMatch(/#0b2a3f/i);
  });
  it("animates only transform and opacity in its transitions", () => {
    // the commas between transitions, not those inside cubic-bezier(...)
    const parts = (v: string) => v.split(/,(?![^(]*\))/).map((p) => p.trim());
    const sw = fs.readFileSync(path.join(__dirname, "jarvisswitch.css"), "utf8");
    for (const file of [css, sw]) {
      for (const m of file.matchAll(/transition:\s*([^;}]+)/g)) for (const part of parts(m[1])) expect(part, m[0]).toMatch(/^(transform|opacity|none)\b/);
    }
  });
  it("never letter-spaces Tamil, and keeps its line-height at 1.5 or more", () => {
    expect(css).toMatch(/\.hud \[lang="ta"\], \.hud\[lang="ta"\] \{[^}]*letter-spacing: normal; line-height: 1\.6/);
    expect(css).not.toMatch(/letter-spacing:\s*(?!normal)[\d.]/);
  });
});
