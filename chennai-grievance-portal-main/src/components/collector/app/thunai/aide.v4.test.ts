// v4, the client's integration of the lanes: the pure parts Thunai.tsx decides with (aide.ts, turnstate.ts rulesConf).
import { describe, expect, it } from "vitest";
import { WORLD } from "@/lib/thunai/fixture";
import type { MissionCard } from "@/lib/thunai/missions.run";
import { allowedSet, gateChunk, zoneLabelsOut } from "@/lib/thunai/numbergate";
import type { WatchSignal } from "@/lib/thunai/signals";
import type { StageDocT } from "@/lib/thunai/stage";
import type { ScreenState } from "@/lib/thunai/types";
import { understand } from "@/lib/thunai/understand";
import { asksWhatToday, briefCard, editIds, followAsk, heldBack, hudMissionOf, interjectNow, lowFx, missStep, NOT_CAUGHT, OFFER_KEYS, plainYes, signalLine, signalScreen, vocabOf, withLabels, zoneSafe, type Live } from "./aide";
import { missionPhase } from "./hudview";
import { asksFirst, rulesConf } from "./turnstate";

const state = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, list: [], lastFilter: null, lastPlace: null, numbers: false, now: Date.parse("2026-11-06T06:30:00Z") } as unknown as ScreenState;
const conf = (t: string, c: number) => { const r = understand(t, state, WORLD, { speechConf: c }); return r.kind === "do" ? r.confidence : null; };
const SAID = ["go to trends", "open the map", "show only Adyar", "switch to weekly", "open the news", "show me the severe cases in Adyar", "go to the environment page", "zoom into ambattur"];

describe("the ears' confidence, on the scale understand() was tuned on (L4)", () => {
  it("is monotone and keeps both ends: clean decodes read 0.95, unsure ones stay as they are", () => {
    let prev = -1;
    for (let c = 0; c <= 1.0001; c += 0.01) { const v = rulesConf(c); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
    for (const c of [0.73, 0.8, 0.89, 0.95]) expect(rulesConf(c)).toBe(0.95);
    for (const c of [0.45, 0.47, 0.5]) expect(rulesConf(c)).toBe(c);
    expect(rulesConf(1)).toBe(1);
    expect(rulesConf(Number.NaN)).toBe(0.95);
    expect(rulesConf(null)).toBe(0.95);
  });
  it("a clean decode (0.73-0.89) is read exactly as the old fixed 0.95 was, sentence by sentence", () => {
    for (const t of SAID) for (const c of [0.73, 0.81, 0.89]) expect(conf(t, rulesConf(c)), `${t} @${c}`).toBe(conf(t, 0.95));
  });
  it("the raw value took a sure command under the 0.9 bar of a plain move; the mapped one does not (failed before the map)", () => {
    const under = SAID.filter((t) => { const raw = conf(t, 0.73), ok = conf(t, 0.95); return raw != null && ok != null && raw < 0.9 && ok >= 0.9; });
    expect(under.length).toBeGreaterThan(0);
    for (const t of under) expect(conf(t, rulesConf(0.73))!).toBeGreaterThanOrEqual(0.9);
  });
  it("a poor decode (the third racer, 0.47) still puts the rules' reading as a question first", () => {
    for (const t of SAID) { const c = conf(t, rulesConf(0.47)); if (c != null) expect(asksFirst(c, 0.47), t).toBe(true); }
  });
});

const card = (phase: MissionCard["phase"], states: MissionCard["steps"][number]["state"][]): MissionCard => ({
  id: "m1", title: { en: "Water-crisis board for Velachery", ta: "வேளச்சேரி நீர் நெருக்கடிப் பலகை" }, lang: "en", phase, risk: "C",
  steps: states.map((state, i) => ({ id: `s${i}`, kind: "screen", label: { en: `Step ${"abc"[i] ?? "d"}`, ta: `படி ${"abc"[i] ?? "d"}` }, risk: "A", state, ms: state === "done" ? 1200 + i : null }))
});

describe("M2's plan card as H2's mission card", () => {
  it("a plan waiting for Start shows Start (all pending, not running), in the turn's language", () => {
    const m = hudMissionOf(card("card", ["pending", "pending", "pending"]), "ta")!;
    expect(m.title).toBe("வேளச்சேரி நீர் நெருக்கடிப் பலகை");
    expect(m.running).toBe(false);
    expect(missionPhase(m)).toBe("plan");
    expect(m.steps.map((s) => s.label)).toEqual(["படி a", "படி b", "படி c"]);
  });
  it("running ticks with the times code measured", () => {
    const m = hudMissionOf(card("running", ["done", "running", "pending"]), "en")!;
    expect(missionPhase(m)).toBe("running");
    expect(m.steps.map((s) => [s.state, s.ms])).toEqual([["done", 1200], ["running", null], ["pending", null]]);
  });
  it("a stopped mission never shows Start again: the steps never run read skipped, a stopped one too", () => {
    const m = hudMissionOf(card("stopped", ["done", "stopped", "pending"]), "en")!;
    expect(m.steps.map((s) => s.state)).toEqual(["done", "skipped", "skipped"]);
    expect(missionPhase(m)).toBe("done");
  });
  it("a card dropped before Start is no card", () => {
    expect(hudMissionOf(card("cancelled", ["pending", "pending", "pending"]), "en")).toBeNull();
    expect(hudMissionOf(null, "en")).toBeNull();
  });
  it("the card's Edit, said or typed: the plan's own steps less those named", () => {
    const steps = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(editIds(steps, "without 3")).toEqual(["a", "b", "d"]);
    expect(editIds(steps, "leave out steps 2 and 4.")).toEqual(["a", "c"]);
    expect(editIds(steps, "3 venaam")).toEqual(["a", "b", "d"]);
    expect(editIds(steps, "௩ வேண்டாம்")).toEqual(["a", "b", "d"]);
    expect(editIds(steps, "show me Adyar")).toBeNull();
    expect(editIds(steps, "without 1, 2, 3 and 4")).toBeNull();
  });
});

const HIGH: WatchSignal = {
  key: "rise:zone:13::", kind: "rise", topic: "rise:zone:13::", place: { en: "Adyar", ta: "அடையாறு" }, metric: "reports", value: 31, expected: 8, n: 31, method: "m",
  caveat: { en: "", ta: "" }, sources: [], severity: "high", level: 3, lifeSafety: false,
  text: { en: "More reports than usual in Adyar: 31 in the last 24 hours, against about 8.", ta: "அடையாறு பகுதியில புகார்கள் வழக்கத்தை விட அதிகம்: 31, வழக்கமா 8." },
  values: { value: 31, expected: 8, hours: 24 }, weight: 1
};
const quiet: Live = { mode: "on", collectorSpeaking: false, busy: false, speaking: false, briefing: false, waiting: false, lastUserSpeech: null, quiet: false };
// 11:00 in Chennai: outside quiet hours
const DAY = Date.UTC(2026, 10, 16, 5, 30);

describe("speaking unprompted (P2: interjections timed to attention)", () => {
  it("a high-severity candidate in a quiet moment may be said", () => expect(interjectNow(HIGH, quiet, DAY)).toEqual({ ok: true, why: "chime, then one line" }));
  it.each<[string, Partial<Live>]>([
    ["the Collector speaking", { collectorSpeaking: true }], ["a turn in flight", { busy: true }], ["Jarvis speaking", { speaking: true }],
    ["the brief", { briefing: true }], ["a card to answer", { waiting: true }], ["muted", { mode: "muted" }], ["quiet mode", { quiet: true }],
    ["speech a moment ago", { lastUserSpeech: DAY - 5_000 }]
  ])("never over %s", (_w, p) => expect(interjectNow(HIGH, { ...quiet, ...p }, DAY).ok).toBe(false));
  it("never at night, never below high severity, never with no candidate", () => {
    expect(interjectNow(HIGH, quiet, Date.UTC(2026, 10, 16, 18, 0)).ok).toBe(false);
    expect(interjectNow({ ...HIGH, severity: "medium" }, quiet, DAY).ok).toBe(false);
    expect(interjectNow(null, quiet, DAY).ok).toBe(false);
    expect(heldBack(quiet)).toBeNull();
  });
  it("its line carries only its own figures, and a line with another figure is not said", () => {
    const l = signalLine(HIGH, "en", WORLD)!;
    expect(l.text).toContain("31");
    expect(gateChunk(l.text, l.allowed).ok).toBe(true);
    expect(signalLine({ ...HIGH, text: { en: "300 deaths in Adyar.", ta: "x" } }, "en", WORLD)).toBeNull();
    expect(signalLine(HIGH, "ta", WORLD)!.text).toMatch(/அடையாறு/);
  });
  it("Tell me opens the item the signal is about, built by code", () => {
    expect(signalScreen(HIGH)).toMatchObject({ recipe: "cases", slots: { zones: [13], period: "daily" } });
    expect(signalScreen({ kind: "followed", key: "followed:incident:INC-2026-004:overdue", topic: "followed:f1" })).toMatchObject({ recipe: "case", slots: { id: "INC-2026-004" } });
    expect(signalScreen({ kind: "reservoir", key: "reservoir:puzhal", topic: "reservoir:district" })).toMatchObject({ recipe: "readings", slots: { metric: "lakes" } });
    expect(signalScreen({ kind: "studio", key: "studio:x:3", topic: "studio:x" })).toBeNull();
  });
});

describe("the brief as a card and its lines (P2)", () => {
  const brief = {
    bottomLine: { en: "Two things need you today.", ta: "இன்னைக்கு ரெண்டு விஷயம் இருக்கு." },
    items: [
      { id: "a", kind: "rise", severity: "high", text: { en: "Drain reports in Adyar: 31 today.", ta: "அடையாறு: 31." }, source: { id: "incidents", name: { en: "incident records", ta: "சம்பவப் பதிவுகள்" }, asOf: null, fresh: { en: "today", ta: "இன்னைக்கு" } }, values: { n: 31 } },
      { id: "b", kind: "rain", severity: "medium", text: { en: "A model said 999 people.", ta: "999" }, source: { id: "rain", name: { en: "IMD rain gauges", ta: "IMD" }, asOf: null, fresh: { en: "today", ta: "இன்னைக்கு" } }, values: {} }
    ],
    end: { en: "That's everything for now.", ta: "இப்போதைக்கு இவ்வளவுதான்." },
    spoken: { en: ["That's everything for now.", "Two things need you today.", "Drain reports in Adyar: 31 today.", "And 999 more."], ta: ["இன்னைக்கு ரெண்டு விஷயம் இருக்கு.", "இப்போதைக்கு இவ்வளவுதான்."] },
    values: { n: 31, two: 2 }
  } as never;
  it("says the lines in order, drops a line with a figure it does not hold, and ends on the end line, last", () => {
    const c = briefCard(brief, "en", WORLD)!;
    expect(c.lines).toEqual(["Two things need you today.", "Drain reports in Adyar: 31 today.", "That's everything for now."]);
    expect(c.items.map((x) => x.id)).toEqual(["a"]);
    expect(c.items[0]).toMatchObject({ source: "incident records", fresh: "today", severity: "high" });
    for (const l of c.lines) expect(gateChunk(l, c.allowed).ok).toBe(true);
  });
  it("in Tamil too, and nothing without a brief", () => {
    expect(briefCard(brief, "ta", WORLD)!.lines).toEqual(["இன்னைக்கு ரெண்டு விஷயம் இருக்கு.", "இப்போதைக்கு இவ்வளவுதான்."]);
    expect(briefCard(null, "en")).toBeNull();
    expect(briefCard({} as never, "en")).toBeNull();
  });
});

describe("after two misunderstandings, the screen and the keyboard (PERSONA.md rule 8)", () => {
  const run = (o: ("miss" | "ok")[]) => { let n = 0; const offers: boolean[] = []; for (const x of o) { const r = missStep(n, x); n = r.n; offers.push(r.offer); } return offers; };
  it("offers on the second miss in a row, and only in a row", () => {
    expect(run(["miss", "miss"])).toEqual([false, true]);
    expect(run(["miss", "ok", "miss"])).toEqual([false, false, false]);
    expect(run(["miss", "miss", "miss", "miss"])).toEqual([false, true, false, true]);
  });
  it("in one numberless line, English and Tamil; the not-heard line too", () => {
    expect(OFFER_KEYS.en).toBe("I'm not getting this one. The options are on the screen, or you can type it.");
    for (const l of [OFFER_KEYS.en, OFFER_KEYS.ta, NOT_CAUGHT.en, NOT_CAUGHT.ta]) expect(gateChunk(l, new Set()).ok).toBe(true);
    expect(OFFER_KEYS.ta).toMatch(/[஀-௿]/);
  });
});

describe("a zone's label in speech is its name, not a figure (L1 zoneLabelsOut before the voice's gate)", () => {
  const zones = WORLD.zones.map((z) => z.n);
  it("a line naming Zone 13 is said, with 13 allowed for it alone", () => {
    const allowed = allowedSet([40]);
    expect(gateChunk("Zone 13 Adyar has 40 open cases.", allowed).ok).toBe(false);
    const z = zoneSafe(["Zone 13 Adyar has 40 open cases."], allowed, zones);
    expect(z.lines).toEqual(["Zone 13 Adyar has 40 open cases."]);
    expect(z.allowed.has("13")).toBe(true);
  });
  it("the label's number never lets the same number through bare, in the same speech", () => {
    const z = zoneSafe(["Zone 13 Adyar has 40 open cases. There were 13 deaths."], allowedSet([40]), zones);
    expect(z.lines[0]).toBe("Zone 13 Adyar has 40 open cases.");
    for (const l of z.lines) for (const c of l.split(/(?<=\.)\s/)) expect(gateChunk(zoneLabelsOut(c, zones), allowedSet([40])).ok).toBe(true);
  });
  it("lines with no zone label come back as they were, and line numbers never shift", () => {
    const lines = ["No label here, 7 cases.", "Zone 13 has 99."];
    expect(zoneSafe(["Seven cases."], new Set(), zones).lines).toEqual(["Seven cases."]);
    const z = zoneSafe(lines, allowedSet([7]), zones);
    expect(z.lines).toEqual(["No label here, 7 cases.", ""]);
    expect(zoneSafe(["Zone 99 is no zone, 99."], new Set(), zones).lines).toEqual(["Zone 99 is no zone, 99."]);
  });
});

const doc = {
  v: 1, id: "d", recipe: "cases", title: "t", sources: [], asOf: null, scope: { period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null }, slots: {},
  blocks: [
    { kind: "CaseList", id: "list", title: "x", total: 2, rows: [
      { id: "INC-1", title: "my neighbour Ravi 98400 12345 shouted", place: "Velachery", zoneName: "Adyar", deptName: "Storm Water Drains", cat: "Flooding" },
      { id: "INC-2", title: "x", place: "Velachery", zoneName: "Adyar", deptName: "Storm Water Drains", cat: "Flooding" }] },
    { kind: "Readings", id: "r", title: "x", items: [{ name: "Puzhal" }] }
  ]
} as unknown as StageDocT;

describe("the open Stage for the ears and the round", () => {
  it("vocab: its names, at most 30, never a case title", () => {
    const v = vocabOf(doc);
    expect(v).toEqual(["Velachery", "Adyar", "Storm Water Drains", "Puzhal"]);
    expect(v.join(" ")).not.toMatch(/Ravi|98400/);
    expect(vocabOf(null)).toEqual([]);
  });
  it("labels per id, same order, from the screen's fields only", () => {
    const ctx = withLabels({ recipe: "cases", title: "t", slots: {}, focus: null, blocks: [{ kind: "CaseList", ids: ["INC-1", "INC-2"] }, { kind: "Readings", ids: ["Puzhal"] }] }, doc);
    expect(ctx.blocks[0].labels).toEqual(["Flooding, Velachery", "Flooding, Velachery"]);
    expect(JSON.stringify(ctx)).not.toMatch(/Ravi|98400/);
  });
});

describe("words for the v4 flows", () => {
  const ctx = { incident: "INC-2026-004", zone: 13, world: WORLD };
  it("follow and unfollow: the case on screen, the zone on screen, a zone named; anything else is not a follow", () => {
    expect(followAsk("follow this case", ctx)).toMatchObject({ op: "follow", kind: "incident", ref: "INC-2026-004" });
    expect(followAsk("keep an eye on Adyar", ctx)).toMatchObject({ op: "follow", kind: "zone", ref: 13 });
    expect(followAsk("follow zone 13", ctx)).toMatchObject({ op: "follow", kind: "zone", ref: 13 });
    expect(followAsk("this zone follow pannu", ctx)).toMatchObject({ op: "follow", kind: "zone", ref: 13 });
    expect(followAsk("Adyar follow pannu", ctx)).toMatchObject({ op: "follow", kind: "zone", ref: 13 });
    expect(followAsk("இந்த கேஸை கவனிச்சுக்கோ", ctx)).toMatchObject({ op: "follow", kind: "incident" });
    expect(followAsk("stop following this case", ctx)).toMatchObject({ op: "unfollow", kind: "incident" });
    expect(followAsk("track the rain", ctx)).toBeNull();
    expect(followAsk("follow this case", { ...ctx, incident: null })).toBeNull();
  });
  it("what did you do today, a plain yes, and the machine that gets no blur", () => {
    for (const t of ["What did you do today?", "what have you done today", "innaiku enna senja", "இன்னைக்கு என்ன செஞ்ச"]) expect(asksWhatToday(t), t).toBe(true);
    expect(asksWhatToday("what did you just do")).toBe(false);
    for (const t of ["yes", "Sure.", "ok jarvis", "show me", "சரி", "aama"]) expect(plainYes(t), t).toBe(true);
    for (const t of ["yes, but show Adyar", "no", "show me Adyar"]) expect(plainYes(t), t).toBe(false);
    expect([lowFx(4, false), lowFx(2, false), lowFx(8, false), lowFx(8, true), lowFx(undefined, false)]).toEqual([true, true, false, true, false]);
  });
});
