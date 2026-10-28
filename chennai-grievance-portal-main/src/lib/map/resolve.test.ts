import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { enRe, taRe } from "@/lib/collector/nlp";
import { fixtureResolver } from "./fixture";
import { areaFor, makeResolver, type Entry } from "./resolve";

const ref = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "gcc-reference", "intel-reference.json"), "utf8"));
type Place = { name: string; kind: string; lat: number; lon: number; zone: number | null; aliases_en: string[]; aliases_ta: string[] };
const places: Place[] = ref.places;

/** the gazetteer's own places as resolver entries, as world.ts builds them from nlp.ts */
const gazetteer: Entry[] = places.map((p) => ({
  kind: p.kind === "zone" ? "zone" : p.kind === "taluk" ? "taluk" : "locality", ref: p.kind === "zone" ? `zone:${p.zone}` : `${p.kind}:${p.name}`, name_en: p.name,
  name_ta: p.aliases_ta[0] ?? null, lat: p.lat, lon: p.lon, res: [...p.aliases_en.map(enRe), ...p.aliases_ta.map(taRe)]
}));
const resolveGaz = makeResolver({ entries: gazetteer, streets: new Map() });
const resolve = makeResolver(fixtureResolver());
const pick = (q: string, verb: "along" | "in" | "near" | null = null) => resolve(q, verb)[0]?.pick.entry.ref ?? null;

describe("every gazetteer alias resolves to its own place", () => {
  const cases = places.flatMap((p) => [...p.aliases_en.map((a) => [p.name, a] as const), ...p.aliases_ta.map((a) => [p.name, a] as const)]);
  it(`${cases.length} aliases`, () => {
    const wrong: string[] = [];
    for (const [name, alias] of cases) {
      const f = resolveGaz(`open complaints near ${alias}`, "near");
      const names = f.flatMap((x) => [x.pick.entry.name_en, ...x.alternatives.map((a) => a.entry.name_en)]);
      if (!names.includes(name)) wrong.push(`${alias} -> ${names.join("/") || "nothing"}`);
    }
    expect(wrong).toEqual([]);
  });
  it.each(["அருகே", "இல்", "க்கு", "யில்"])("Tamil endings: அடையாறு + %s", (end) => {
    expect(pick(`அடையாறு${end === "அருகே" ? " " : ""}${end} வெள்ளம்`, "near")).toBe("loc:Adyar");
  });
});

describe("numbers: wards and zones in English and Tamil", () => {
  it.each([
    ["ward 178", "ward:178"], ["Ward No. 178", "ward:178"], ["ward number 9", "ward:9"], ["W-178", "ward:178"], ["w178", "ward:178"], ["178th ward", "ward:178"],
    ["வார்டு 178", "ward:178"], ["178வது வார்டு", "ward:178"], ["178 வது வார்டு", "ward:178"], ["வார்டு எண் 12", "ward:12"],
    ["zone 13", "zone:13"], ["Zone-13", "zone:13"], ["zone no 9", "zone:9"], ["13th zone", "zone:13"], ["மண்டலம் 13", "zone:13"], ["13வது மண்டலம்", "zone:13"],
    ["மண்டலம் எண் 5", "zone:5"], ["zone 10 la", "zone:10"], ["ward 1", "ward:1"], ["ward 200", "ward:200"]
  ])("%s", (q, want) => expect(pick(`flooding in ${q}`, "in")).toBe(want));
  it("out-of-range numbers are not places", () => {
    expect(pick("ward 201", "in")).toBeNull();
    expect(pick("zone 16", "in")).toBeNull();
  });
});

describe("roads and waterways", () => {
  it.each([
    ["Anna Salai", "road:anna-salai"], ["Mount Road", "road:anna-salai"], ["அண்ணா சாலையில்", "road:anna-salai"], ["OMR", "road:rajiv-gandhi-salai"],
    ["Rajiv Gandhi Salai", "road:rajiv-gandhi-salai"], ["Old Mahabalipuram Road", "road:rajiv-gandhi-salai"], ["GST Road", "road:gst-road"], ["ECR", "road:ecr"],
    ["Poonamallee High Road", "road:poonamallee-high-road"], ["Buckingham Canal", "water:buckingham-canal"]
  ])("%s", (q, want) => expect(pick(`thefts along ${q}`, "along")).toBe(want));
  it("a GCC street with no line is a text-only match", () => {
    const f = resolve("garbage on Lake View Road", "along");
    expect(f[0].pick.entry).toMatchObject({ kind: "street_name_only", ref: "gcc:Lake View Road" });
  });
});

describe("spelling slips", () => {
  it.each([["velacheri", "loc:Velachery"], ["Velachry", "loc:Velachery"], ["saidapett", "loc:Saidapet"], ["koyambedoo", "loc:Koyambedu"], ["Testpett", "loc:Testpet"],
    ["Saidapeth", "loc:Saidapet"], ["Velacherry", "loc:Velachery"], ["koyambed", "loc:Koyambedu"], ["Kodambakam", "zone:10"], ["mylapur", "taluk:TLK-MYL"]])("%s", (q, want) => {
    expect(pick(`garbage near ${q}`, "near")).toBe(want);
  });
  it("common words are never read as places", () => expect(resolve("garbage complaints near schools this week", "near")).toEqual([]));
});

describe("one name, several kinds: the verb picks, the rest are chips", () => {
  const alts = (q: string, verb: "along" | "in" | "near") => resolve(q, verb)[0].alternatives.map((a) => a.entry.ref).sort();
  it("near Adyar: the locality, with the zone as a chip", () => {
    expect(pick("complaints near Adyar", "near")).toBe("loc:Adyar");
    expect(alts("complaints near Adyar", "near")).toEqual(["zone:13"]);
  });
  it("in Adyar: the zone", () => expect(pick("flooding in Adyar", "in")).toBe("zone:13"));
  it("Adyar River: the river (the longer name wins)", () => expect(pick("flooding near Adyar River", "near")).toBe("water:adyar-river"));
  it("Velachery: locality near, taluk in, taluk when the word says so", () => {
    expect(pick("garbage near Velachery", "near")).toBe("loc:Velachery");
    expect(pick("garbage in Velachery", "in")).toBe("taluk:TLK-VLC");
    expect(pick("Velachery taluk garbage", null)).toBe("taluk:TLK-VLC");
  });
  it("Adyar zone said in words", () => expect(pick("Adyar zone flooding", null)).toBe("zone:13"));
  it("a point gets its radius: a locality 1 km, a facility 500 m", () => {
    const e = resolve("near Stanley Hospital", "near")[0].pick.entry;
    expect(areaFor(e)).toEqual({ kind: "point", ref: "osm:n77", radius_m: 500 });
    expect(areaFor(resolve("near Saidapet", "near")[0].pick.entry)).toEqual({ kind: "point", ref: "loc:Saidapet", radius_m: 1000 });
  });
});
