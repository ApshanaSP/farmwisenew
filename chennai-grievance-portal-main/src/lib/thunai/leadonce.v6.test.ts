/**
 * v6, "lead-twice": a brief's spoken line ends with its lead, and the brief's first point (read aloud after it, one by one) is the same
 * lead, so the real-path runs said "5 points in the brief. In Royapuram, 284 incidents are open right now ..." and then the same sentence
 * again (8 of 15 place answers). What is spoken is worked out here as the console does it (Thunai.tsx narrate: the say, then the items of
 * stagelocal.ts narrationOf), and the lead is said once. The screen itself still shows every point. Figures are the fake store's.
 */
import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { referenceWorld } from "./world";
import { ZONE_TA_NAME } from "./lexicon";
import { buildScreen, emptySlots, type Slots } from "./screens";
import { fakeHands, SEVERE } from "./stagefake";
import { narrationOf } from "./stagelocal";
import { spokenPart } from "./chunker";
import type { StageDocT } from "./stage";
import type { Lang } from "./types";

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const SCOPE = { period: "daily" as const, zone: null, dept: null, cat: null, taluk: null, sev: null };
const AS_OF = "2026-11-14 09:00:00";
const words = (en: string, ta: string) => ({ en, ta, tg: "" });
/** fake hands that also count "right now" (the console's data.ts does: open now, whatever the day reported) */
const nowHands = () => ({
  ...fakeHands(),
  span: async () => ({ span: { key: "daily" as const, range: null, hours: null, label: words("right now", "இப்போது"), partial: false, now: true, note: null },
    rows: SEVERE.slice(0, 3), total: 284, severe: 12, open: 284, late: 40, dead: 0, prev: null, asOf: AS_OF })
});

/** what the voice says for a screen, as Thunai.tsx narrate says it: the spoken PART of its line (chunker.ts spokenPart: two sentences,
 *  about 240 characters), then the items it reads one by one */
const spokenOf = (doc: StageDocT, lang: Lang) => [spokenPart(doc.say[lang]), ...narrationOf(doc, lang).map((x) => x.text)].join(" ");
const times = (all: string, part: string) => all.split(part).length - 1;
const briefPoints = (doc: StageDocT) => {
  const b = doc.blocks.find((x) => x.kind === "Brief");
  if (!b || b.kind !== "Brief") throw new Error("no brief block");
  return b.points;
};
const build = (slots: Partial<Slots>, heard: string, hands = fakeHands(), lang?: Lang) =>
  buildScreen("brief", { ...emptySlots(), ...slots }, SCOPE, world, hands as never, heard, "t", lang).then((x) => x.doc);

describe("a brief's lead is said once", () => {
  it("a place right now (What's happening in Royapuram right now?): the lead after the count, not again as the first point", async () => {
    const doc = await build({ zones: [5], span: { kind: "now" } }, "What's happening in Royapuram right now?", nowHands());
    const lead = briefPoints(doc)[0].text;
    expect(lead).toMatch(/^In Royapuram, 284 incidents are open right now/);
    expect(doc.say.en).toContain(lead);
    expect(times(spokenOf(doc, "en"), lead)).toBe(1);
  });
  it("the same in Tamil", async () => {
    const doc = await build({ zones: [5], span: { kind: "now" } }, "ராயபுரத்துல இப்போ என்ன நடக்குது?", nowHands(), "ta");
    const lead = briefPoints(doc)[0].ta!;
    expect(lead.length).toBeGreaterThan(20);
    expect(times(spokenOf(doc, "ta"), lead)).toBe(1);
  });
  it("the district's brief: the briefing tool's first sentence is said once", async () => {
    const doc = await build({}, "give me the brief");
    const lead = briefPoints(doc)[0].text;
    expect(lead).toMatch(/^158 incidents were reported/);
    expect(times(spokenOf(doc, "en"), lead)).toBe(1);
    // in Tamil the spoken line's lead holds the first point's Tamil line: that is said once too
    const ta = briefPoints(doc)[0].ta!;
    expect(times(spokenOf(doc, "ta"), ta)).toBe(1);
  });
  it("no point is lost: a point the line holds only after its spoken part is still read (the skeptic's case, 17 Nov)", () => {
    const pts = [{ text: "First thing to see." }, { text: "Second thing to see." }, { text: "Third thing to see." }];
    const doc = { v: 1, id: "x", recipe: "advise", title: "t", takeaway: null, say: { en: "3 things need you. First thing to see. Second thing to see. Third thing to see.", ta: "x" },
      blocks: [{ kind: "Brief", id: "advise", title: "t", points: pts }], scope: SCOPE, slots: {}, sources: [], asOf: null, notes: [] } as unknown as StageDocT;
    const all = spokenOf(doc, "en");
    for (const p of pts) expect(times(all, p.text), p.text).toBeGreaterThanOrEqual(1);
    // the one the spoken part already said is not said again
    expect(times(all, "First thing to see.")).toBe(1);
  });
  it("the points after the lead are still read, and the screen still shows every point", async () => {
    const doc = await build({ zones: [5], span: { kind: "now" } }, "What's happening in Royapuram right now?", nowHands());
    const pts = briefPoints(doc);
    expect(pts).toHaveLength(4);
    const read = narrationOf(doc, "en");
    expect(read.map((x) => x.text)).toEqual(pts.slice(1).map((p) => p.text));
    // the highlight still follows the point being read: its key is the point's own place on the screen
    expect(read.map((x) => x.key)).toEqual(["brief-1", "brief-2", "brief-3"]);
  });
});
