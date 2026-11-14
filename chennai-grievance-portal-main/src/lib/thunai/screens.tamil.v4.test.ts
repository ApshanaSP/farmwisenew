/**
 * v4 brief, defect 9: a Tamil screen carried English block titles and notes ("Key numbers", "Where", "Stations", "The brief", "Median resolution
 * time is not kept per zone ..."), and the screen's title and notes were one language only (stage.ts title/notes). Every recipe is built here
 * for a Tamil turn and its own words are swept: the title, every block's title, every note and every Note block hold no English word except a
 * name (a zone, a body, a station, a market, a place, a code from the world or the data). The English turn keeps its English. A note with
 * nothing in it in the screen's language is left out, not shown blank.
 */
import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { ZONE_TA_NAME } from "./lexicon";
import { buildScreen, emptySlots, type Slots } from "./screens";
import { RECIPES, StageDoc, type StageDocT } from "./stage";
import { fakeHands, SEVERE } from "./stagefake";
import { referenceWorld } from "./world";

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const BASE = { period: "daily" as const, zone: null, dept: null, cat: null, taluk: null, sev: null };
const TA = "அடையாறு நிலவரம் காட்டு";
const AS_OF = "2026-11-14 09:00:00";

/** names the data and the world carry: a Tamil screen may show these in Latin letters */
const NAMES = [
  ...world.zones.map((z) => z.name), ...world.depts.flatMap((d) => [d.name, d.code]), ...world.taluks.map((t) => t.name), ...world.places.flatMap((p) => [p.name, ...p.aliases]),
  ...SEVERE.flatMap((r) => [String(r.loc ?? ""), String(r.zone_name ?? ""), String(r.dept_name ?? "")]),
  "Chembarambakkam", "Puzhal (Red Hills)", "Veeranam", "Chennai-Nungambakkam", "Chennai-Meenambakkam", "Chennai-Ennore", "Chennai-Madhavaram", "Koyambedu", "Tomato",
  "Periamet", "Aminjikarai", "Tharamani", "Akshaya School", "Velachery Govt School", "Far School", "Stanley Hospital", "Velachery",
  // codes and acronyms said as they are in Tamil too
  "AQI", "AGMARKNET", "DBSCAN", "District IQ", "INC"
];
const ALLOWED = new Set(NAMES.flatMap((n) => n.toLowerCase().split(/[^a-z]+/)).filter(Boolean));
/** the Latin words in a line that are not names: English left on a Tamil screen */
const english = (s: string) => (s.match(/[A-Za-z]{2,}/g) ?? []).filter((w) => !ALLOWED.has(w.toLowerCase()));

const res = (data: unknown) => ({ tool: "", args: {}, scope: null, asOf: AS_OF, data, facts: [], sources: [], incidentIds: [], testData: true, caveats: [] });
const words = (en: string, ta: string) => ({ en, ta, tg: "" });
const span = (label: ReturnType<typeof words>, note: string | null) => ({ key: "daily" as const, range: { from: "2026-11-13 00:00:00", to: "2026-11-14 00:00:00" }, hours: null, label, partial: false, now: false, note });
/** fake hands that also count a span of their own and a window against the one before (the console's data.ts does both) */
const hands = (note: string | null = "The records go back about 180 days, so the start of this period is not covered.") => ({
  ...fakeHands(),
  span: async () => ({ span: span(words("yesterday (13 Nov)", "நேற்று (13 நவ.)"), note), rows: SEVERE.slice(0, 3), total: 3, severe: 2, open: 2, late: 1, dead: 0,
    prev: { n: 5, label: words("the day before", "அதற்கு முந்தைய நாள்") }, asOf: AS_OF }),
  compare: async () => ({ cmp: { key: "monthly" as const, cur: span(words("last 30 days", "கடந்த 30 நாட்கள்"), null), prev: span(words("the 30 days before", "அதற்கு முந்தைய 30 நாட்கள்"), null),
    label: words("the last 30 days against the 30 before", "கடந்த 30 நாட்கள், அதற்கு முந்தைய 30 நாட்களுடன்") }, n: 12, prev: 9, severe: 2, open: 4, asOf: AS_OF })
});

/** every recipe, and the ways a recipe can go (each measure of a ranking, a span, a comparison of windows, a body's brief, nothing found) */
const CASES: [string, (typeof RECIPES)[number], Partial<Slots>, ReturnType<typeof hands>?][] = [
  ...RECIPES.filter((r) => r !== "answer").map((r): [string, (typeof RECIPES)[number], Partial<Slots>] => [r, r, ({
    case: { id: "INC-A3" }, compare: { zones: [13, 14] }, readings: { metric: "lakes", name: "Chembarambakkam" }, ranking: { measure: "zone_severe" }, performance: { by: "dept" },
    nearby: { q: "schools near flooding in Adyar" }, map: { what: "severe" }, prices: { q: "tomato" }, news: { q: "flooding" }
  } as Partial<Record<string, Partial<Slots>>>)[r] ?? {}]),
  ...(["rain", "aqi", "zone_open", "zone_attention", "taluk_open", "hotspots", "dept_open", "dept_backlog", "dept_resolution", "dept_overdue"] as const).map((m): [string, "ranking", Partial<Slots>] => [`ranking ${m}`, "ranking", { measure: m }]),
  ["zone performance", "performance", { by: "zone" }], ["departments compared", "compare", { depts: ["POL-GCP", "GCC-SWD"] }], ["map hotspots", "map", { what: "hotspots" }],
  ["a body's brief", "brief", { dept: "POL-GCP" }], ["a corporation's brief", "brief", { org: "GCC" }], ["a zone's brief", "brief", { zones: [13] }],
  ["news from a zone", "news", { zones: [13] }], ["a case by its kind", "case", { zones: [13] }], ["cases searched", "cases", { q: "drain" }], ["overdue cases", "cases", { status: "overdue" }],
  ["a span of cases", "cases", { span: { kind: "day", back: 1 } }, hands()], ["a span's brief", "brief", { zones: [13], span: { kind: "day", back: 1 } }, hands()],
  ["a span with no hands for it", "cases", { span: { kind: "day", back: 1 } }], ["a window against the one before", "trend", { cat: "FLOOD_WATERLOGGING", span: { kind: "compare", key: "monthly" } }, hands()],
  ["readings of a zone with no gauge", "readings", { metric: "rain", zones: [7] }], ["nothing to complete", "complete", { ids: ["INC-A1"] }]
];

async function build(recipe: (typeof RECIPES)[number], slots: Partial<Slots>, heard: string, h = hands()): Promise<StageDocT> {
  return (await buildScreen(recipe, { ...emptySlots(), ...slots } as Slots, BASE, world, h, heard, "st-v4")).doc;
}
/** a screen's own words: its title, its blocks' titles, its notes and its Note blocks */
const ownWords = (d: StageDocT) => [["title", d.title], ...d.blocks.map((b) => [`${b.kind} title`, "title" in b ? String((b as { title: string }).title) : ""]),
  ...d.blocks.filter((b) => b.kind === "Note").map((b) => ["Note", (b as { text: string }).text]), ...d.notes.map((n) => ["note", n])].filter(([, s]) => s) as [string, string][];

describe("defect 9: a Tamil screen's title, block titles and notes are in Tamil", () => {
  for (const [name, recipe, slots, h] of CASES) {
    it(name, async () => {
      const d = await build(recipe, slots, TA, h);
      expect(StageDoc.safeParse(d).success).toBe(true);
      expect(d.lang).toBe("ta");
      const left = ownWords(d).flatMap(([where, s]) => (english(s).length ? [`${where}: "${s}" (${english(s).join(", ")})`] : []));
      expect(left).toEqual([]);
      // the title in both languages, the one shown being the Tamil one
      expect(d.titles?.ta).toBe(d.title);
      expect(d.titles?.en).toBeTruthy();
      // no blank note, and the notes in both languages line up
      expect(d.notes.every((n) => n.trim().length > 0)).toBe(true);
      expect(d.notesBi?.map((n) => n.ta)).toEqual(d.notes);
    });
  }
});

describe("defect 9: the English turn keeps its English, with the Tamil beside it", () => {
  it("every recipe in English has an English title and a Tamil one", async () => {
    for (const [name, recipe, slots, h] of CASES) {
      const d = await build(recipe, slots, "show me", h);
      expect(d.lang, name).toBe("en");
      expect(d.titles?.en, name).toBe(d.title);
      expect(/[஀-௿]/.test(d.title), `${name}: ${d.title}`).toBe(false);
    }
  });
  it("a Tanglish turn is a Tamil screen (the turn's language, normalise.ts detectLang)", async () => {
    const d = await build("cases", { sev: "Severe" }, "Adyar-la severe cases kaattu");
    expect(d.lang).toBe("ta");
    expect(english(d.blocks.map((b) => ("title" in b ? String((b as { title: string }).title) : "")).join(" "))).toEqual([]);
  });
  it("the turn's language given by the caller wins over the words heard", async () => {
    const d = (await buildScreen("cases", { ...emptySlots(), sev: "Severe" } as Slots, BASE, world, hands(), "show me the severe cases", "st-v4", "ta")).doc;
    expect(d.lang).toBe("ta");
    expect(english(d.title)).toEqual([]);
  });
});

describe("defect 9: a note with nothing to say in the screen's language is left out", () => {
  it("a reader's note with no Tamil line is not shown blank on a Tamil screen, and is kept on the English one", async () => {
    const odd = "An odd note the period reader wrote in English only.";
    const ta = await build("brief", { zones: [13], span: { kind: "day", back: 1 } }, TA, hands(odd));
    expect(ta.notes).not.toContain("");
    expect(ta.notes.join(" ")).not.toContain(odd);
    const en = await build("brief", { zones: [13], span: { kind: "day", back: 1 } }, "show me", hands(odd));
    expect(en.notes).toContain(odd);
  });
});
