/**
 * Finding 51 (v4 brief, defect 1): "every number from code" had a hole. The browser's allowed set took every figure in a screen's own
 * spoken line, and the screens copied the model's free-text slots (q, name, id) into that line and the titles ("Cases: flood deaths 300"),
 * so a figure a model wrote could be shown and said as Jarvis's. These tests generate 1,000 model screens with figures (digits, Indian
 * grouping, lakh/crore, %, English, Tamil and Tanglish words, Tamil and other-script numerals) in every free-text slot, run them through
 * the real checker (agent.ts checkScreen) and the real screen builders with fake hands, and gate every spoken chunk and every title,
 * takeaway and note against speakableFigures: no figure a model wrote is said or shown as Jarvis's.
 */
import { describe, expect, it } from "vitest";
import { checkScreen } from "./agent";
import { chunks } from "./chunker";
import { WORLD } from "./fixture";
import { ZONE_TA_NAME } from "./lexicon";
import { figuresIn, forGate, gateChunk, stripFigures, zoneLabelsOut } from "./numbergate";
import { buildScreen } from "./screens";
import { modelFigures, speakableFigures } from "./speakable";
import { RECIPES, type StageDocT } from "./stage";
import { fakeHands } from "./stagefake";
import type { Lang } from "./types";
import { referenceWorld } from "./world";

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const ZONES = world.zones.map((z) => z.n);
const BASE = { period: "daily" as const, zone: null, dept: null, cat: null, taluk: null, sev: null };

/** a small seeded generator, so a failure names a run that can be replayed */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** figures as a model may write them; values chosen so none is a figure of the fake data (a leak cannot hide behind a real count) */
const FIGURES = [
  "347", "4,73,219", "12.75", "7,351", "86%", "3.75 crore", "6.5 lakh", "73k", "613 deaths", "-418", "+291", "41 percent",
  "three hundred and forty-seven", "seventy-three", "eight hundred", "a dozen", "nine thousand", "twice", "eleven", "half", "one death", "a single death",
  "முந்நூற்று", "எண்ணூறு", "இருபத்தேழு", "பதினொன்று", "லட்சம்", "நாற்பத்தொன்று", "எழுபத்து மூன்று", "ஒரே ஒரு",
  "munnooru", "ettunooru", "irubathu", "pathinonnu", "ore oru", "oru maranam",
  "௩௪௭", "௭௩", "௲", "३४७", "３４７", "٣٤٧", "முப்பது சதவீதம்",
  // glued to a word: the gate's reader masks a letter-led code and skips a digit run after a letter (review, Numbers 1)
  "deaths-347", "x613", "Velachery-347", "deaths-٣٤٧", "flood7351", "Adyar-௭௩", "km-418"
];
/** an incident's id: the one code a model's words may keep digits in */
const INC_ID = /(?<![\p{L}\p{M}\d])INC(?:-[A-Za-z0-9_]+)+/gu;
/** the digit runs the gate's reader leaves out, glued to a word, outside an incident's id and a real zone's label */
const gluedRuns = (s: string): string[] => [...zoneLabelsOut(forGate(s).replace(INC_ID, " "), ZONES).matchAll(/(?<=[\p{L}\p{M}]|[\p{L}\p{M}\d]-)\d+(?:[.,]\d+)*/gu)].map((m) => m[0]);
const notAllowed = (s: string, allowed: Set<string>) => gluedRuns(s).filter((r) => !allowed.has(String(Number(r.replace(/,/g, "")))));
const WORDS = ["flood", "deaths", "Velachery", "schools within", "km of flooding in", "Adyar", "cases", "drain", "tomato", "Chembarambakkam", "வெள்ளம்", "மரணம்",
  "kuppai", "near", "Zone 13", "Ambattur", "dengue", "pending", "garbage", "சம்பவங்கள்"];
const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];

/** a free-text slot: a few words with figures dropped among them; `clean` is the same words with none */
function slotText(r: () => number): { dirty: string; clean: string } {
  const words = Array.from({ length: 2 + Math.floor(r() * 3) }, () => pick(r, WORDS));
  const dirty = [...words];
  for (let k = 0; k < 1 + Math.floor(r() * 3); k++) dirty.splice(Math.floor(r() * (dirty.length + 1)), 0, pick(r, FIGURES));
  return { dirty: dirty.join(" "), clean: words.join(" ") };
}

/** the slots each recipe needs to build a real screen (the fake hands answer every tool) */
const NEEDS: Partial<Record<(typeof RECIPES)[number], Record<string, unknown>>> = {
  compare: { zones: [13, 14] }, readings: { metric: "lakes" }, ranking: { measure: "zone_severe" }, performance: { by: "dept" }, map: { what: "severe" },
  case: { zones: [13] }, brief: { dept: "POL-GCP" }
};
const IDS = ["INC-THREE-HUNDRED", "INC-NINE-LAKH", "INC-A2", "INC-2026-004", "INC-ELEVEN"];

function modelScreen(r: () => number, recipe: (typeof RECIPES)[number]) {
  const q = slotText(r), name = slotText(r);
  const id = recipe === "case" && r() < 0.5 ? pick(r, IDS) : null;
  const common = { period: null, zones: [], dept: null, depts: [], cat: null, taluk: null, sev: null, status: null, metric: null, measure: null, by: null, order: null, n: null, item: null, what: null, sort: null };
  const extra = { ...(NEEDS[recipe] ?? {}), ...(recipe === "cases" && r() < 0.3 ? { sev: "Severe" } : {}), ...(recipe === "cases" && r() < 0.3 ? { status: "overdue" } : {}) };
  return {
    dirty: { ...common, ...extra, recipe, q: q.dirty, name: name.dirty, id },
    clean: { ...common, ...extra, recipe, q: q.clean, name: name.clean, id: id && !figuresIn(id).length ? id : null }
  };
}

/** everything a screen shows as its own words, besides the blocks' data */
function shownLines(doc: StageDocT, lang: Lang): string[] {
  const blockTitles = doc.blocks.flatMap((b) => [("title" in b ? (b as { title: string }).title : ""), b.kind === "Note" ? b.text : ""]);
  return [doc.title, doc.takeaway?.[lang] ?? "", ...doc.notes, ...blockTitles].filter(Boolean);
}

/**
 * The lines whose figures are not Jarvis's: [where, line, the figures the gate refused]. The spoken line is checked in both languages; what the
 * screen shows, in the language it was built in (its title, blocks and notes are in that one language).
 */
function leaks(doc: StageDocT, lang: Lang): [string, string, string[]][] {
  const allowed = speakableFigures(doc, lang);
  const out: [string, string, string[]][] = [];
  const bad = (s: string) => [...gateChunk(zoneLabelsOut(s, ZONES), allowed).bad, ...notAllowed(s, allowed)];
  for (const c of chunks(doc.say[lang])) { const b = bad(c); if (b.length) out.push(["say", c, b]); }
  if ((doc.lang ?? "en") === lang) for (const s of shownLines(doc, lang)) { const b = bad(s); if (b.length) out.push(["shown", s, b]); }
  return out;
}

const RUNS = 1000;
const BUILT = RECIPES.filter((x) => x !== "answer");

describe("Finding 51: a figure a model wrote in a free-text slot is never said or shown as Jarvis's", () => {
  it(`${RUNS} generated model screens, every free-text slot holding figures, in English and Tamil`, async () => {
    const r = rng(51);
    const bad: string[] = [];
    let built = 0;
    for (let i = 0; i < RUNS; i++) {
      const recipe = BUILT[i % BUILT.length];
      const { dirty, clean } = modelScreen(r, recipe);
      const heard = i % 2 ? "அடையாறு நிலவரம் காட்டு" : "show me what you have";
      const sc = checkScreen(dirty, world, null);
      if (!sc) continue;
      const doc = (await buildScreen(sc.recipe, sc.slots, BASE, world, fakeHands(), heard, `st-${i}`)).doc;
      built++;
      for (const lang of ["en", "ta"] as const) {
        for (const [where, line, figs] of leaks(doc, lang)) bad.push(`#${i} ${recipe}/${lang} ${where}: ${figs.join(",")} in "${line.slice(0, 140)}" (q "${dirty.q}", name "${dirty.name}")`);
        // the model's figures add nothing to what Jarvis may say: the same screen asked for with the same words and no figures allows as much
        const cs = checkScreen(clean, world, null);
        if (cs) {
          const control = (await buildScreen(cs.recipe, cs.slots, BASE, world, fakeHands(), heard, `st-${i}`)).doc;
          const ours = speakableFigures(doc, lang), theirs = speakableFigures(control, lang);
          const extra = [...ours].filter((v) => !theirs.has(v));
          if (extra.length) bad.push(`#${i} ${recipe}/${lang} allowed ${extra.slice(0, 6).join(",")} that the same screen without figures does not (q "${dirty.q}" -> "${sc.slots.q}", clean "${cs.slots.q}"; title "${doc.title}" / "${control.title}")`);
        }
      }
    }
    expect(built).toBeGreaterThan(RUNS * 0.9);
    expect(bad.slice(0, 25), `${bad.length} leaks`).toEqual([]);
  }, 120_000);

  it("the spoken line of a screen is not a source of its own figures", () => {
    const doc = { v: 1, id: "x", recipe: "cases", title: "Cases", takeaway: null, say: { en: "Flood deaths 300 today.", ta: "வெள்ள மரணம் 300." },
      blocks: [{ kind: "Kpis", id: "k", title: "Key numbers", items: [{ key: "a", label: "Cases", value: 7, unit: null, prev: null, delta: null, tone: "neutral", spark: [] }] }],
      scope: BASE, slots: {}, sources: [], asOf: null, notes: [] } as unknown as StageDocT;
    const allowed = speakableFigures(doc, "en");
    expect(allowed.has("7")).toBe(true);
    expect(allowed.has("300")).toBe(false);
    expect(gateChunk("Flood deaths 300 today.", allowed).ok).toBe(false);
  });

  it("a figure in the model's slot does not become Jarvis's through a title, a note or the takeaway", () => {
    const doc = { v: 1, id: "x", recipe: "cases", title: "Cases: flood deaths 300", takeaway: { en: "300 deaths", ta: "300" }, say: { en: "", ta: "" },
      blocks: [{ kind: "Note", id: "n", text: "No match for flood deaths 300" }], scope: BASE, slots: { q: "flood deaths 300" }, sources: [], asOf: null, notes: ["about 300"] } as unknown as StageDocT;
    expect(modelFigures(doc).has("300")).toBe(true);
    expect(speakableFigures(doc, "en").has("300")).toBe(false);
  });

  it("an answer screen's sentence (the model's) lends no figure; its facts do", () => {
    const doc = { v: 1, id: "x", recipe: "answer", title: "q", takeaway: null, say: { en: "Tomato is 42 and 99.", ta: "" },
      blocks: [{ kind: "Answer", id: "answer", title: "What the data says", text: "Tomato is 42 and 99.", facts: [{ label: "Tomato, Koyambedu, Rs/kg", value: 42, unit: "Rs/kg" }] }],
      scope: BASE, slots: {}, sources: [], asOf: null, notes: [] } as unknown as StageDocT;
    const allowed = speakableFigures(doc, "en");
    expect(allowed.has("42")).toBe(true);
    expect(allowed.has("99")).toBe(false);
  });

  it("a point's coordinates are not figures Jarvis may say", () => {
    const doc = { v: 1, id: "x", recipe: "map", title: "Where", takeaway: null, say: { en: "", ta: "" },
      blocks: [{ kind: "MapView", id: "m", title: "Where", rule: null, shade: null, outline: [], points: [{ n: 1, id: "INC-1", lat: 13.0796, lon: 80.2612, label: "x", sev: null, value: null, hot: true }] }],
      scope: BASE, slots: {}, sources: [], asOf: null, notes: [] } as unknown as StageDocT;
    const allowed = speakableFigures(doc, "en");
    expect(allowed.has("80")).toBe(false);
    expect(allowed.has("13")).toBe(false);
  });
});

describe("stripFigures: a model's words without its figures", () => {
  it("takes out every kind of figure, keeps the words, a real zone's label and a code", () => {
    expect(stripFigures("flood deaths 300", ZONES)).toBe("flood deaths");
    expect(stripFigures("flooding in Zone 13 with 4,73,219 people", ZONES)).toBe("flooding in Zone 13 with people");
    expect(stripFigures("INC-2026-004 needs 3.5 lakh", ZONES)).toBe("INC-2026-004 needs");
    expect(stripFigures("86% of drains", ZONES)).toBe("of drains");
    expect(stripFigures("three hundred and forty-seven deaths", ZONES)).toBe("and deaths");
    expect(stripFigures("வெள்ளம் முந்நூறு மரணம்", ZONES)).toBe("வெள்ளம் மரணம்");
    expect(stripFigures("vellam munnooru per", ZONES)).toBe("vellam per");
    expect(stripFigures("௩௦௦ மரணம்", ZONES)).toBe("மரணம்");
    expect(stripFigures("முப்பது சதவீதம் குப்பை", ZONES)).toBe("குப்பை");
    expect(stripFigures("Velachery", ZONES)).toBe("Velachery");
  });
  it("whatever the input, what is left holds no figure", () => {
    const r = rng(7);
    for (let i = 0; i < 2000; i++) {
      const t = slotText(r).dirty;
      const s = stripFigures(t, ZONES);
      if (s != null) expect(figuresIn(zoneLabelsOut(s, ZONES)), `${t} -> ${s}`).toEqual([]);
      if (s != null) expect(gluedRuns(s), `${t} -> ${s}`).toEqual([]);
    }
  });
  it("a figure glued to a word goes too; an incident's id and a real zone's label stay", () => {
    expect(stripFigures("flood deaths-300", ZONES)).toBe("flood deaths");
    expect(stripFigures("x300 cases in Velachery-300", ZONES)).toBe("x cases in Velachery");
    expect(stripFigures("deaths-٣٠٠ near INC-2026-004 in Zone 13", ZONES)).toBe("deaths near INC-2026-004 in Zone 13");
  });
});
