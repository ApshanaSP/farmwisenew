/**
 * v15 (22 Nov): the owner's page commands ("trends page", "go to trends page", "go to overview page") must be instant: the rules read them as
 * a plain page move, sure enough (0.9) for Thunai.tsx to do them with no model. Spoken forms included ("Superview page-க்கு போ" was the
 * overview, heard wrong on 20 Nov and sent to the planner: 2.1 s).
 */
import { describe, expect, it } from "vitest";
import { WORLD } from "../fixture";
import { referenceWorld } from "../world";
import { ZONE_TA_NAME } from "../lexicon";
import { understand } from "../understand";
import { isNavCommand, isPlainMove } from "../plan";
import type { ScreenState } from "../types";

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const STATE = { page: "trends", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, list: [], lastPlace: null, numbers: false } as unknown as ScreenState;

const PAGES: [string, string][] = [
  ["Go to the trends page", "trends"], ["go to trends page", "trends"], ["Trends page", "trends"], ["Open trends", "trends"], ["Show me the trends page.", "trends"],
  ["Go to the overview page", "overview"], ["go to overview page", "overview"], ["Overview page", "overview"], ["Go back to overview", "overview"],
  ["Superview page-க்கு போ.", "overview"], ["Overview page-க்கு போ", "overview"], ["டிரெண்ட்ஸ் பேஜுக்கு போ.", "trends"], ["ட்ரெண்ட்ஸ் பேஜ்க்கு போ", "trends"],
  ["Go to the briefing page", "briefing"], ["Briefing page-க்கு போ.", "briefing"], ["go to environment page", "environment"], ["Go to Data Studio page.", "studio"],
  ["over view page", "overview"], ["go to the over view", "overview"]
];

describe("v15: page commands are instant", () => {
  for (const [said, page] of PAGES) {
    it(said, () => {
      const r = understand(said, { ...STATE, page: page === "overview" ? "trends" : "overview" } as ScreenState, world, { speechConf: 0.95 });
      expect(r.kind).toBe("do");
      if (r.kind !== "do") return;
      expect(r.steps.some((s) => s.a === "page" && (s as { page?: string }).page === page)).toBe(true);
      expect(r.confidence).toBeGreaterThanOrEqual(0.9);
      expect(isPlainMove(r.steps) || isNavCommand(said, r.steps)).toBe(true);
    });
  }
});

describe("v15: today's notes is the day's brief, at once", async () => {
  const { intentMarker } = await import("../quick");
  for (const said of ["Get me today's notes.", "get me today's note", "Give me today's summary", "Today's brief", "Show me today's briefing notes", "Read me the day's notes"]) {
    it(said, () => expect(intentMarker(said)).toMatchObject({ intent: "brief", rest: null }));
  }
  it("my own notes stay the memory's", () => expect(intentMarker("what notes did I ask you to remember?")?.intent).not.toBe("brief"));
});

describe("v15: small talk the owner said, answered at once", async () => {
  const { smallTalk } = await import("../v11/smalltalk");
  it("how do you speak", () => { expect(smallTalk("எப்படி பேசுற?")).toBe("howYouSpeak"); expect(smallTalk("Jarvis, do you speak Tamil?")).toBe("howYouSpeak"); });
  it("how are you", () => { expect(smallTalk("எப்படி இருக்க?")).toBe("howAreYou"); expect(smallTalk("How are you Jarvis?")).toBe("howAreYou"); });
  it("a district question is never small talk", () => expect(smallTalk("எப்படி இருக்கு traffic?")).toBeNull());
});

describe("v15: the focus questions are never a console move the browser does on its own", async () => {
  const { isReflex } = await import("../plan").catch(() => ({ isReflex: null as unknown as (s: unknown[], st: unknown) => boolean }));
  const { quickScreen } = await import("../quick");
  const asks = ["Which areas should I concentrate on the most?", "Which areas are improving?", "எந்த area வந்து improve ஆகிட்டே வருது?",
    "எந்த area-ல நிறைய cases இருக்கு, நிறைய worst ஆகிட்டே வருது?", "எந்த ஏரியாலலாம் இப்போ நான் நிறையா கான்சென்ட்ரேட் பண்ணணும்", "Where do problems keep coming back?"];
  for (const said of asks) {
    it(said, () => {
      const r = understand(said, STATE, world, { speechConf: 0.95 });
      const instant = r.kind === "do" && r.confidence >= 0.9 && (isPlainMove(r.steps) || isNavCommand(said, r.steps) || (isReflex ? isReflex(r.steps, STATE) : false));
      expect(instant).toBe(false);
      // and the server's fast lane leaves them to the focus route, which runs before it
      expect(quickScreen(said, world)?.recipe ?? null).not.toBe("city");
    });
  }
});
