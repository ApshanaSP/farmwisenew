/**
 * v10: the names research's test list (docs/jarvis/v10-research/20-names-by-ear.md 7.4): 37 names that must be found as said by ear, in
 * English, Tamil letters and Tanglish, and 32 that must not be taken for a name that sounds near them. The lexicon is built as the console
 * builds it: the week's storms from the store's headlines (Tamil spellings only from the same story), the district's places, the outlets.
 */
import { describe, expect, it } from "vitest";
import { WORLD } from "../fixture";
import { referenceWorld } from "../world";
import { fold, looseKey } from "../v8/match";
import { outletIn } from "../v8/news8";
import { buildLexicon, type Entity10 } from "./lexicon10";
import { findMentions } from "./entity10";

const world = { ...WORLD, ...referenceWorld() };
const STORMS = ["Akvan", "Murasu", "Asuran", "Michaung", "Fengal", "Nivar", "Mandous", "Vardah", "Mocha", "Fani"];
const stories = [
  ...STORMS.map((s, i) => ({ id: `s${i}`, title: `Cyclone ${s} to cross the coast; heavy rain likely`, t: "2026-11-18 09:00" })),
  { id: "ta1", title: "அக்வான் புயல் நாளை கரையைக் கடக்கும்", titleEn: "Cyclone Akvan to cross the coast tomorrow", t: "2026-11-19 09:00" },
  { id: "ta2", title: "முரசு புயல்: சென்னையில் கனமழை", titleEn: "Cyclone Murasu: heavy rain in Chennai", t: "2026-11-19 08:00" }
];
const OUTLETS = ["Deccan Chronicle", "Deccan Herald", "Polimer News", "Thanthi TV", "Daily Thanthi", "Puthiya Thalaimurai", "Dinamalar", "Dinamani", "Dinakaran",
  "Maalaimalar", "The Hindu", "Hindu Tamil Thisai", "Times Now", "The Times of India"];
const lex = buildLexicon(stories, world as never, { outlets: OUTLETS });
const names = (e: Entity10) => [e.name, e.core, ...e.spellings].map((s) => fold(s).replace(/\s+/g, ""));
const is = (e: Entity10, want: string) => names(e).some((n) => n.includes(fold(want).replace(/\s+/g, "")));
const top = (said: string) => findMentions(said, lex)[0] ?? null;

// (rows the research marked FAIL on v10 as measured, and the fix each needs, are listed with it.todo until fixed)
const MUST: [string, string][] = [
  ["Cyclone Aquan latest", "Akvan"], ["any update on Akwan cyclone", "Akvan"], ["Murasar Saikilon news", "Murasu"], ["அக்வான் புயல் எங்கே", "Akvan"],
  ["சைக்கிளோன் முரசு", "Murasu"], ["முரசு புயல்", "Murasu"], ["Michong cyclone damage", "Michaung"], ["Fenjal puyal", "Fengal"], ["Niwar puyal", "Nivar"],
  ["Mandus cyclone", "Mandous"], ["Vardha cyclone", "Vardah"],
  ["Pallikaranaila thanni", "Pallikaranai"], ["பள்ளிக்கரணையில் தண்ணீர்", "Pallikaranai"], ["Kodungayur fire", "Kodungaiyur"], ["கொடுங்கையூரில் தீ", "Kodungaiyur"],
  ["Kasi medu harbour", "Kasimedu"], ["காசிமேட்டில் மீன் விலை", "Kasimedu"], ["Velacheri traffic", "Velachery"], ["Vela cherry lake", "Velachery"],
  ["Thiruvotriyur sea erosion", "ottiyur"], ["Mylapur temple", "Mylapore"], ["அடையாற்றில் வெள்ளம்", "Adyar"], ["Tondiarpettai fish market", "Tondiarpet"],
  ["Perungudila garbage", "Perungudi"], ["Solinganallur IT corridor", "Sholinganallur"],
  ["Deccan Chronical report", "Deccan Chronicle"], ["Dina Thanthi story", "Thanthi"], ["Dhandhi TV", "Thanthi"], ["Puthiyathalaimurai news", "Puthiya Thalaimurai"]
];
const MUST_NOT: [string, string][] = [
  ["Akvan cyclone", "Asuran"], ["Cyclone Murasu", "Mocha"], ["Fengal cyclone", "Fani"], ["Michaung cyclone", "Mandous"], ["Pallavaram flooding", "Pallikaranai"],
  ["பல்லாவரம் வெள்ளம்", "Pallikaranai"], ["Kodambakkam fire", "Kodungaiyur"], ["கோடம்பாக்கம்", "Kodungaiyur"], ["Nungambakkam", "Kodambakkam"],
  ["Dinamalar report", "Dinamani"], ["Dinakaran report", "Dinamani"], ["தினகரன் செய்தி", "Dinamani"], ["Malai Malar report", "Dinamalar"],
  ["Deccan Herald report", "Deccan Chronicle"], ["The Hindu report", "Hindu Tamil Thisai"], ["Times Now report", "Times of India"], ["Thanthi TV", "Daily Thanthi"],
  ["Perungudi garbage", "Perungalathur"], ["Thiruvanmiyur beach", "ottiyur"], ["Adyar river", "Avadi"], ["Royapuram harbour", "Royapettah"],
  ["Saidapet market", "Sowcarpet"], ["Anna Nagar tower", "Anna Salai"], ["Ashok Nagar", "Anna Nagar"], ["Egmore station", "Ennore"], ["Velachery lake", "Villivakkam"],
  ["Madhavaram hospital", "Madipakkam"], ["Teynampet hospital", "Tondiarpet"], ["Washermanpet hospital", "Vyasarpadi"], ["Kilpauk hospital", "Kolapakkam"]
];
const NO_ENTITY = ["a cycle rally", "மழை வந்திருக்கு", "what is the weather today", "open the first news", "read the fast news"];

describe("v10: the names research's must-match list (20-names-by-ear.md 7.4)", () => {
  it.each(MUST)("'%s' finds %s", (said, want) => {
    const m = findMentions(said, lex);
    expect(m.some((x) => is(x.entity, want)), `${said}: ${m.map((x) => `${x.entity.name} ${x.score.toFixed(3)} ${x.band}`).join(", ") || "none"}`).toBe(true);
  });
});

describe("v10: the names research's must-not list", () => {
  it.each(MUST_NOT)("'%s' is never %s", (said, wrong) => {
    const m = findMentions(said, lex);
    expect(m.filter((x) => is(x.entity, wrong) && !names(x.entity).some((n) => n.includes(fold(said.split(" ")[0]).replace(/\s+/g, "")))).map((x) => x.entity.name)).toEqual([]);
  });
  it.each(NO_ENTITY)("'%s' names no storm or name", (said) => {
    expect(findMentions(said, lex, { kinds: ["storm", "name"] }).map((x) => x.entity.name)).toEqual([]);
  });
  it("the top mention of a storm said by ear is the storm", () => {
    expect(top("Cyclone Aquan latest")?.entity.kind).toBe("storm");
  });
});

describe("v10: the research's outlet rows, through the news lane's own outlet reader (news8 outletIn)", () => {
  it.each([
    ["டெக்கான் க்ரோனிக்கிள் செய்தி", "Deccan Chronicle"], ["Polymer news", "Polimer News"], ["போலிமர் நியூஸ்", "Polimer News"], ["தந்தி டிவி செய்தி", "Thanthi TV"],
    ["Dhandhi TV news", "Thanthi TV"], ["Deccan Chronical report", "Deccan Chronicle"]
  ])("'%s' is %s", (said, want) => { expect(outletIn(said)).toBe(want); });
  it.each([["Deccan Herald report", "Deccan Chronicle"], ["Times Now report", "The Times of India"], ["the polymer factory fire news", "Polimer News"]])("'%s' is never %s", (said, wrong) => {
    expect(outletIn(said)).not.toBe(wrong);
  });
  it("'chr' is heard as 'kr' (Chronicle, Chromepet): the same key both ways", () => {
    expect(looseKey("chronicle")).toBe(looseKey("kronicle"));
    expect(looseKey("church")).not.toBe(looseKey("kurk"));
  });
});
