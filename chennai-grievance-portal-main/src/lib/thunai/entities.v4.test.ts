import fs from "fs";
import path from "path";
import zlib from "zlib";
import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { referenceWorld } from "./world";
import { ZONE_TA_NAME } from "./lexicon";
import { briefTurn, clarifySlot, deptChoices, resolveEntity } from "./entities";
import { figuresIn } from "./numbergate";

// the world as the server builds it: the console's departments plus every body in the cached reference table (serverWorld's bodyList)
const refDepts = (() => {
  const dir = path.join(process.cwd(), "data", "aws-cache");
  const f = fs.existsSync(dir) ? fs.readdirSync(dir).find((x) => x.startsWith("ref_departments-")) : null;
  if (!f) return [];
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString("utf8")) as { rows: unknown[][] };
  return j.rows.map((r) => ({ code: String(r[0]), name: String(r[1]) }));
})();
const base = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const world = { ...base, bodies: refDepts };

describe("the electricity board's spoken names reach TANGEDCO (a body in the reference table with no records here)", () => {
  const SAID = ["TNEB report", "EB department status", "EB office la current illa, report sollunga", "current office status", "karent office update", "minsara vaariyam report", "minsaara variyam status",
    "மின்சார வாரியம் பற்றிய அறிக்கை", "மின்சார வாரியத்தின் நிலவரம்", "மின்வாரியம் அறிக்கை", "electricity board status", "Tamil Nadu electricity board report"];
  it.each(SAID)("%s", (s) => {
    const r = resolveEntity(s, world);
    expect(r.kind === "entity" ? r.entity.id : r.kind).toBe("TANGEDCO");
    const t = briefTurn(s, world);
    // it holds no records here: said plainly, never another department's brief
    expect(t).toMatchObject({ kind: "reply", via: "no-records", entity: "TANGEDCO" });
  });
  it.each(SAID)("%s, in a world not given the reference table, still says it holds nothing from the board", (s) => {
    expect(briefTurn(s, base)).toMatchObject({ kind: "reply", entity: "TANGEDCO" });
  });
  it("the Corporation's street lighting keeps its own words", () => {
    expect((resolveEntity("electrical department status", world) as { entity?: { id: string } }).entity?.id).toBe("GCC-ELE");
    // "current" alone is not the board: "the current status of the police"
    expect((resolveEntity("current status of the police", world) as { entity?: { id: string } }).entity?.id).toBe("POL-GCP");
  });
  it("another place's electricity board is still not ours", () => {
    expect(resolveEntity("Coimbatore electricity board report", world).kind).toBe("unknown");
    expect(briefTurn("Madurai EB report", world)?.kind).not.toBe("screen");
  });
});

describe("a name whose qualifier makes it a name", () => {
  it("metro water status is Metrowater's brief (it was nobody's)", () => {
    expect(briefTurn("metro water status", world)).toMatchObject({ kind: "screen", slots: { dept: "CMWSSB" } });
  });
});

describe("clarifying one slot: three tap-able choices, each a full request", () => {
  it("the departments a loose name may mean, best first, by the registry's ladder", () => {
    expect(deptChoices("water department", world).map((e) => e.id)).toEqual(["CMWSSB", "GCC-SWD", "PWD-WRD"]);
    expect(deptChoices("drainage department", world)[0].id).toBe("GCC-SWD");
    expect(deptChoices("show me the cases", world)).toEqual([]);
  });
  it("a brief on a loose department asks which, with three choices that brief", () => {
    const t = briefTurn("water department status", world);
    expect(t).toMatchObject({ kind: "clarify", via: "loose" });
    if (t?.kind !== "clarify") throw new Error("no clarify");
    expect(t.options).toHaveLength(3);
    expect(t.options.map((o) => o.request)).toEqual(t.options.map((o) => `brief me on ${o.label}`));
    expect(t.text.en).toMatch(/^Which one: .+, .+ or .+\?$/);
    expect(figuresIn(t.text.en + t.text.ta)).toEqual([]);
    // one likely body: asked as one
    expect(briefTurn("hospital department report", world)).toMatchObject({ kind: "clarify", options: [{ request: "brief me on Directorate of Medical Services" }] });
    // a body nobody here holds stays an honest "no data"
    expect(briefTurn("Zorblax agency report", world)?.kind).toBe("reply");
  });
  it("a request with a loose department: the department only, keeping the place and the time", () => {
    const c = clarifySlot("water department complaints in Adyar this week", world);
    expect(c).toMatchObject({ kind: "clarify", slot: "dept" });
    expect(c?.options.map((o) => o.request)).toEqual(["show Metro Water (CMWSSB) complaints in Adyar this week", "show Storm Water Drains complaints in Adyar this week", "show PWD Water Resources complaints in Adyar this week"]);
  });
  it("a request with a loose time: today, this week or this month, the rest kept as said", () => {
    const c = clarifySlot("flooding complaints in Adyar lately", world);
    expect(c).toMatchObject({ kind: "clarify", slot: "period" });
    expect(c?.options.map((o) => o.request)).toEqual(["flooding complaints in Adyar today", "flooding complaints in Adyar this week", "flooding complaints in Adyar this month"]);
    const ta = clarifySlot("சமீபத்தில் அடையாறு வெள்ள புகார்கள்", world);
    expect(ta?.options.map((o) => o.label)).toEqual(["இன்று", "இந்த வாரம்", "இந்த மாதம்"]);
    expect(ta?.options[1].request).toBe("இந்த வாரம் அடையாறு வெள்ள புகார்கள்");
    expect(clarifySlot("garbage complaints samibathula", world)?.slot).toBe("period");
  });
  it("nothing unclear, two slots unclear, or a time already said: no question", () => {
    expect(clarifySlot("police complaints this week", world)).toBeNull();
    expect(clarifySlot("flooding complaints in Adyar this week", world)).toBeNull();
    expect(clarifySlot("water department complaints lately", world)).toBeNull();
    expect(clarifySlot("show the severe cases in Adyar", world)).toBeNull();
    expect(clarifySlot("lately I have been tired", world)).toBeNull();
    expect(clarifySlot("Coimbatore water department status", world)).toBeNull();
  });
});
