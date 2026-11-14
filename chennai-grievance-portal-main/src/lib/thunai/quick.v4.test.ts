import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { START, WORLD } from "./fixture";
import { intentMarker, leavesFastLane, quickScreen, unsureWhy } from "./quick";
import { understand } from "./understand";
import { addressed } from "./addressed";
import { districtNounIn } from "./quick";

const state = { ...START, now: Date.parse("2026-11-14T10:00:00+05:30") };
const intent = (s: string) => intentMarker(s)?.intent ?? null;

describe("markers for the new intents (EN, Tamil, Tanglish): the flow asked for, nothing acted on", () => {
  const CASES: [string, string, string | null][] = [
    ["explain this one", "explain", "this one"], ["explain that one", "explain", "that one"], ["please explain the second one", "explain", "the second one"], ["what's going on with that one", "explain", "that one"],
    ["idha vilakkunga", "explain", null], ["rendavadhu konjam explain pannunga", "explain", null], ["இதை விளக்குங்க", "explain", null], ["அந்த கேஸை விளக்கமா சொல்லுங்க", "explain", null],
    ["what changed since yesterday", "changed", "since yesterday"], ["what has changed this week", "changed", "this week"], ["anything new since this morning", "changed", "since this morning"], ["what's new in Adyar", "changed", "in adyar"],
    ["nethu lerndhu enna maarichu", "changed", null], ["indha vaaram enna change", "changed", null], ["இந்த வாரம் என்ன மாறியிருக்கு", "changed", null], ["நேத்துலேர்ந்து என்ன மாற்றம்", "changed", null],
    ["how do you know", "howknow", null], ["where's that from?", "howknow", null], ["epdi theriyum", "howknow", null], ["ஆதாரம் என்ன", "howknow", null],
    ["brief me", "brief", null], ["catch me up", "brief", null], ["what do I need to know today", "brief", null], ["brief sollunga", "brief", null], ["இன்றைய சுருக்கம் சொல்லுங்க", "brief", null],
    ["remember Adyar is my priority this monsoon", "remember", "Adyar is my priority this monsoon"], ["Jarvis, note that the SWD engineer is on leave", "remember", "the SWD engineer is on leave"],
    ["Adyar en priority nu nyabagam vechukko", "remember", "adyar en priority"], ["அடையாறு முக்கியம்னு ஞாபகம் வச்சுக்கோ", "remember", "அடையாறு முக்கியம்"],
    ["what do you remember about me", "recall", null], ["show my memory", "recall", null], ["enna nyabagam vechirukka", "recall", null], ["என்னைப் பத்தி என்ன ஞாபகம் இருக்கு", "recall", null],
    ["forget that", "forget", null], ["forget everything", "forget", "all"], ["adha marandhudu", "forget", null], ["அதை மறந்துடு", "forget", null],
    ["build me a water-crisis board for Velachery", "mission", "water crisis for velachery"], ["set up a war room for the floods", "mission", "the floods"], ["Velachery ku oru water crisis board ready pannu", "mission", "water crisis for velachery"],
    ["வேளச்சேரிக்கு ஒரு வெள்ள போர்டு தயார் பண்ணு", "mission", null],
    ["stop", "stop", null], ["cancel the plan", "stop", null], ["niruthu", "stop", null], ["நிறுத்து", "stop", null],
    ["skip that", "skip", null], ["skip this step", "skip", null], ["adha vidu", "skip", null], ["அதை விடு", "skip", null],
    ["instead do Adyar", "instead", "adyar"], ["actually show the news instead", "instead", "show the news"], ["adhukku badhila Perungudi kaattu", "instead", "perungudi kaattu"], ["அதுக்கு பதிலா பெருங்குடி காட்டு", "instead", "பெருங்குடி காட்டு"]
  ];
  it.each(CASES)("%s -> %s", (s, want, rest) => {
    const m = intentMarker(s);
    expect(m?.intent).toBe(want);
    if (rest !== null) expect(m?.rest?.toLowerCase()).toBe(rest.toLowerCase());
  });
  it.each([
    "show the severe cases in Adyar", "explain the flooding complaint in Velachery", "why are there so many cases in Adyar", "make a flooding dashboard for Adyar", "remind me at 6 to call the SWD engineer",
    "the stop near the bus depot is flooded", "he will explain it after lunch", "I can't remember his name", "what moved this week", "skip the line at the canteen", "how do you know Ravi", "build the wall higher"
  ])("%s -> no marker", (s) => expect(intentMarker(s)).toBeNull());
});

describe("the rules leave these flows alone, and never act on them", () => {
  it("the fast lane hands them on: no screen read from one of their words", () => {
    for (const s of ["what changed this week", "what's new in Adyar", "build me a flood board for Adyar", "how do you know?", "skip that"]) {
      expect(leavesFastLane(s), s).toBe(true);
      expect(quickScreen(s, WORLD), s).toBeNull();
    }
    // the ones the fast lane already answers keep their screens
    expect(quickScreen("brief me", WORLD)).toMatchObject({ recipe: "brief" });
    expect(quickScreen("make a flooding dashboard for Adyar", WORLD)).toMatchObject({ recipe: "dashboard" });
  });
  it("understand: what changed since yesterday is not a question about a window; a board is not a taluk filter; how do you know is not Ask District IQ", () => {
    expect(understand("what changed since yesterday", state, WORLD).kind).toBe("unknown");
    expect(understand("what changed this week", state, WORLD).kind).toBe("unknown");
    expect(understand("build me a water-crisis board for Velachery", state, WORLD).kind).toBe("unknown");
    expect(understand("what is this based on", state, WORLD).kind).toBe("unknown");
    // the commands the rules already did stay as they were (golden.test.ts)
    expect(understand("Brief me", state, WORLD)).toMatchObject({ kind: "do", steps: [{ a: "mission", name: "brief" }] });
    expect(understand("Forget that", state, WORLD)).toMatchObject({ kind: "do", steps: [{ a: "forget", all: false }] });
    expect(understand("source", state, WORLD)).toMatchObject({ kind: "do", steps: [{ a: "panel", panel: "sources" }] });
  });
  it("side talk with these words still does not act: no marker makes the rules 'sure' for the address gate", () => {
    const sure = (text: string) => { const q = quickScreen(text, WORLD), u = understand(text, state, WORLD); return !!q || (u.kind === "do" && u.confidence >= 0.85); };
    const gate = (text: string) => addressed({ text, lastTurnAt: null, now: 0, rulesSure: sure(text), districtNoun: districtNounIn(text, WORLD) });
    // understand read "build me a ... board for Velachery" as a taluk filter, sure enough to count for the gate; now no rule is sure of it
    for (const s of ["what changed since yesterday in Adyar", "build me a water-crisis board for Velachery", "how do you know?", "what's new in Adyar", "what is this based on"]) expect(sure(s), s).toBe(false);
    // unnamed and not engaged, these are not acted on (an imperative with a district noun, "build ... for Velachery", is the gate's own rule: addressed.ts)
    for (const s of ["what changed since yesterday in Adyar", "how do you know?", "what's new in Adyar", "what is this based on"]) expect(gate(s).act, s).toBe(false);
  });
  it("the held-out ambient set: no sentence that the rules left alone before is now 'sure' because of a marker", () => {
    const file = path.join(process.cwd(), "eval", "holdout2", "ambient.jsonl");
    if (!fs.existsSync(file)) return;
    const rows = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).map((l) => JSON.parse(l) as { text: string });
    for (const r of rows) if (intentMarker(r.text)) {
      expect(quickScreen(r.text, WORLD), r.text).toBeNull();
    }
  });
});

describe("the never rule reads a question about how fast things are closed as a question (privacy.ts asksForbiddenOrder)", () => {
  const t = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  it("which department is slowest to close drainage complaints: asked, not refused", () => {
    const s = "which department is slowest to close drainage complaints";
    expect(understand(s, state, WORLD).kind).not.toBe("refuse");
    expect(unsureWhy(s, t(s), WORLD, [], "DRAINAGE_SEWAGE")).not.toBe("forbidden-order");
  });
  it("how long to close cases, then delete them all: still refused", () => {
    const s = "how long to close cases, then delete them all";
    expect(understand(s, state, WORLD).kind).toBe("refuse");
    expect(unsureWhy(s, t(s), WORLD, [], null)).toBe("forbidden-order");
    expect(quickScreen(s, WORLD)).toBeNull();
  });
});
