/**
 * v10, phase 1: the second independent review of v9's diff (7fa525fb..0a4b0245), carried over from v9 (docs/jarvis/JARVIS_V10.md Part 8). Five
 * read-only finders by area, then a verifier per area that reproduced each finding with a probe on an exact copy of v9's commit (and on v8's
 * checkout for a claimed regression). Every confirmed finding below is its verifier's own probe, a failing test first; the fixes follow.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { WORLD } from "../fixture";
import { referenceWorld } from "../world";
import { newsRequest, pickStory, rankStories, type StoryItem } from "./news8";
import { findNews, placesOf } from "./newsfind";



// v9's 40 filler stories (news9r.v8.test.ts), which the matcher's probes stand among
let fillerN = 0;
const fstory = (title: string, o: Partial<StoryItem> = {}): StoryItem => ({ id: o.id ?? `fx${++fillerN}`, title, outlets: ["DT Next"], t: "2026-11-15 10:00", ...o });
const FILLER: StoryItem[] = ["Metro rail work: traffic diversions on Poonamallee High Road from Monday", "Chennai Corporation to install 500 new streetlights",
  "Gold rate today in Chennai", "School students visit the planetarium", "New ration shops open in north Chennai", "Book fair to begin at YMCA grounds",
  "Corporation council meeting approves budget", "Free eye camp held for senior citizens", "Marathon to be held on Sunday", "Lake restoration work begins",
  "Vegetable prices fall at Koyambedu market", "IT firms hire more freshers this year", "Health camp for sanitary workers", "New bus routes announced",
  "Chennai airport handles record passengers", "Library gets a digital makeover", "Heritage walk planned for the weekend", "Power utility upgrades substations",
  "Cricket academy opens new nets", "Film festival line-up announced", "Startups pitch at an innovation summit", "Museum extends its hours",
  "Traffic police launch helmet awareness drive", "Swimming pool reopens after repairs", "College fest draws large crowds", "Art exhibition opens at Lalit Kala",
  "Housing board allots flats", "Water body survey completed", "Sapling distribution in parks", "Senior citizens' helpline launched",
  "Port trust records higher cargo", "Science expo for students", "Music season to begin next month", "Ration card camp held", "Park gets a new play area",
  "Bus depot gets solar panels", "Fishing ban period ends", "Yoga camp at the beach", "Road safety week observed", "Toll plaza fee revised"].map((t, i) => fstory(t, { id: `f${i}`, t: `2026-11-1${i % 9} 08:00` }));


describe("review9m: spelled-acronym-loose-key-collision (high)", () => {

const world = { ...WORLD, ...referenceWorld() };
const PLACES = placesOf(world);
// the real 19 Nov panel and week (the probe read the local store snapshot, eval/v8/ref/news.json, now the committed fixture news19nov.json)
const REF = JSON.parse(readFileSync("src/lib/thunai/v8/__fixtures__/news19nov.json", "utf8")) as {
  daily: { title: string; outlets: string[] }[]; weekly: { title: string; outlets: string[]; place: string | null; t: string }[] };
const WEEK: StoryItem[] = REF.weekly.map((s, i) => ({ id: `w${i}`, title: s.title, outlets: s.outlets, place: s.place, t: s.t }));
const SCREEN = REF.daily.map((s, i) => ({ id: `d${i}`, title: s.title, source: s.outlets.join(" · ") }));
const pick = (text: string, items: StoryItem[], onScreen = false) => {
  const req = newsRequest(text, { onScreen });
  if (!req) return { req: null, pick: null, other: null, stories: [] as StoryItem[], score: 0 };
  return { req, ...pickStory(rankStories(req, items, { places: PLACES }), null) };
};

it("spelled-acronym-loose-key-collision", async () => {
  const bad: string[] = [];
  const isGcc = (t: string | null | undefined) => t == null || /\bGCC\b|Corporation/i.test(t);
  for (const q of ["G C C news padinga", "open the G C C news"]) {
    const f = await findNews({ q, lang: "en", screen: SCREEN }, { world, stories: async () => WEEK });
    if (!isGcc(f?.picked.pick?.title)) bad.push(`screen "${q}" -> ${f?.picked.pick?.title}`);
    const r = pick(q, WEEK);
    if (!isGcc(r.pick?.title)) bad.push(`store "${q}" -> ${r.pick?.title}`);
  }
  const rss = pick("R S S news", WEEK);
  if (rss.pick && !/\bRSS\b/.test(rss.pick.title)) bad.push(`"R S S news" -> ${rss.pick.title}`);
  const iit = pick("I I T news", WEEK);
  if (iit.pick && !/\bIIT\b/.test(iit.pick.title)) bad.push(`"I I T news" -> ${iit.pick.title}`);
  const cm = pick("C M news padinga", WEEK);
  if (cm.pick && !/Chief Minister|\bCM\b/.test(cm.pick.title)) bad.push(`"C M news padinga" -> ${cm.pick.title}`);
  if (cm.other && !/Chief Minister|\bCM\b/.test(cm.other.title)) bad.push(`"C M news padinga" other -> ${cm.other.title}`);
  const dri = pick("D R I news", WEEK);
  if (dri.pick && !/\bDRI\b/.test(dri.pick.title)) bad.push(`"D R I news" -> ${dri.pick.title}`);
  if (dri.other && !/\bDRI\b/.test(dri.other.title)) bad.push(`"D R I news" other -> ${dri.other.title}`);
  expect(bad).toEqual([]);
});

});

describe("review9m: gloss-vettu-vedi-single-sense (high)", () => {

const world = { ...WORLD, ...referenceWorld() };
const PLACES = placesOf(world);
const REF = JSON.parse(readFileSync("src/lib/thunai/v8/__fixtures__/news19nov.json", "utf8"));
const WEEK: StoryItem[] = REF.weekly.map((s: any, i: number) => ({ id: `w${i}`, title: s.title, outlets: s.outlets, place: s.place, t: s.t }));
const pick = (text: string, items: StoryItem[], onScreen = false) => {
  const req = newsRequest(text, { onScreen });
  if (!req) return { req: null, pick: null, other: null, stories: [] as StoryItem[], score: 0 };
  return { req, ...pickStory(rankStories(req, items, { places: PLACES }), null) };
};
let n = 0;
const story = (title: string, o: Partial<StoryItem> = {}): StoryItem => ({ id: o.id ?? `x${++n}`, title, outlets: ["DT Next"], t: "2026-11-15 10:00", ...o });
// FILLER: the 40-story FILLER array copied verbatim from news9r.v8.test.ts (ids f0..f39)

it("gloss-vettu-vedi-single-sense", () => {
  const bad: string[] = [];
  const road = story("Velachery road dug up for pipeline, left unrepaired for weeks", { id: "rd" });
  const hack = story("Youth hacked by gang in Velachery; three held", { id: "hk" });
  const a = pick("Velachery la road vettu news padinga", [hack, road, ...FILLER]);
  if (a.pick?.id !== "rd") bad.push(`road vettu -> ${a.pick?.id ?? null} (other ${a.other?.id ?? null}) ${a.score.toFixed(3)}`);
  const out = story("அடையாறு பகுதியில் வியாழக்கிழமை மின்தடை", { id: "po", titleEn: "Power outage in Adyar area on Thursday" });
  const mur = story("Man hacked to death in Adyar over property dispute", { id: "mh" });
  const b = pick("அடையாறுல மின் வெட்டு செய்தி இருக்கா?", [mur, out, ...FILLER]);
  if (b.pick?.id === "mh" || b.stories.some((s) => s.id === "mh")) bad.push(`adyar min vettu -> ${b.pick?.id ?? null} ${b.score.toFixed(3)}`);
  for (const q of ["மின் வெட்டு செய்தி இருக்கா?", "Chennai la current vettu news irukka?"]) {
    const r = pick(q, WEEK);
    const ids = [r.pick?.id, ...r.stories.map((s) => s.id)];
    if (ids.includes("w63") || ids.includes("w83")) bad.push(`week "${q}" -> ${r.pick?.title ?? null}`);
  }
  const fc = story("Deepavali: police issue guidelines for firecracker shops", { id: "fc" });
  const bomb = story("Bomb threat to Chennai school turns out to be a hoax", { id: "bm" });
  const c = pick("vedi kadai news", [bomb, fc, ...FILLER]);
  if (c.pick?.id === "bm") bad.push(`vedi kadai -> bm ${c.score.toFixed(3)}`);
  const d = pick("Deepavali vedi news padinga", [bomb, fc, ...FILLER]);
  if (d.pick?.id !== "fc") bad.push(`deepavali vedi -> ${d.pick?.id ?? null} ${d.score.toFixed(3)}`);
  expect(bad).toEqual([]);
});

});

describe("review9m: english-headline-gating-drops-variants (high)", () => {

const world = { ...WORLD, ...referenceWorld() };
const PLACES = placesOf(world);
const REF = JSON.parse(readFileSync("src/lib/thunai/v8/__fixtures__/news19nov.json", "utf8"));
const WEEK: StoryItem[] = REF.weekly.map((s: any, i: number) => ({ id: `w${i}`, title: s.title, outlets: s.outlets, place: s.place, t: s.t }));
const withTitle = (i: number, title: string): StoryItem[] => WEEK.map((s, j) => (j === i ? { ...s, title } : s));
const pick = (text: string, items: StoryItem[], onScreen = false) => {
  const req = newsRequest(text, { onScreen });
  if (!req) return { req: null, pick: null, other: null, stories: [] as StoryItem[], score: 0 };
  return { req, ...pickStory(rankStories(req, items, { places: PLACES }), null) };
};
const story = (title: string, o: Partial<StoryItem> = {}): StoryItem => ({ id: o.id ?? "x", title, outlets: ["DT Next"], t: "2026-11-15 10:00", ...o });

it("english-headline-gating-drops-variants", () => {
  const bad: string[] = [];
  const gov = withTitle(2, "TN Governor Rajendra Arlekar hospitalised in Chennai");
  for (const q of ["Governor hospital news", "Arlekar hospital news"]) {
    const r = pick(q, gov);
    if (r.pick?.id !== "w2") bad.push(`"${q}" -> ${r.pick?.id ?? null} ${r.score.toFixed(3)}`);
  }
  const e = pick("Ambattur encroachments news", withTitle(88, "Broken pavements, encroached footpaths force Ambattur pedestrians onto busy roads"));
  if (e.pick?.id !== "w88") bad.push(`encroachments -> ${e.pick?.id ?? null} ${e.score.toFixed(3)}`);
  const dr = pick("Madipakkam drain news", [...WEEK, story("Madipakkam drainage project stuck", { id: "md", t: "2026-11-18 09:00" })]);
  if (dr.pick?.id !== "md") bad.push(`drain -> ${dr.pick?.id ?? null} ${dr.score.toFixed(3)}`);
  const wl = pick("Adyar water logging news", [...WEEK, story("Adyar roads waterlogged after heavy rain", { id: "aw", t: "2026-11-18 09:00" })]);
  if (wl.pick?.id !== "aw") bad.push(`waterlogged -> ${wl.pick?.id ?? null} ${wl.score.toFixed(3)}`);
  expect(bad).toEqual([]);
});

});

describe("review9m: join-check-uses-ungated-cut (medium)", () => {

const world = { ...WORLD, ...referenceWorld() };
const PLACES = placesOf(world);
const pick = (text: string, items: StoryItem[], onScreen = false) => {
  const req = newsRequest(text, { onScreen });
  if (!req) return { req: null, pick: null, other: null, stories: [] as StoryItem[], score: 0 };
  return { req, ...pickStory(rankStories(req, items, { places: PLACES }), null) };
};
let n = 0;
const story = (title: string, o: Partial<StoryItem> = {}): StoryItem => ({ id: o.id ?? `x${++n}`, title, outlets: ["DT Next"], t: "2026-11-15 10:00", ...o });
// FILLER: the 40-story FILLER array copied verbatim from news9r.v8.test.ts (it includes "Chennai Corporation to install 500 new streetlights" and "Lake restoration work begins")

it("join-check-uses-ungated-cut", () => {
  const sl = story("Ambattur streetlights not working for weeks", { id: "sl" });
  const items = [sl, story("Fire breaks out at a unit in Ambattur industrial estate", { id: "af" }), story("Ambattur lake restoration work begins", { id: "al" }), ...FILLER];
  const r = pick("Ambattur street light news", items);
  expect({ pick: r.pick?.id ?? null, score: Number(r.score.toFixed(3)) }).toMatchObject({ pick: "sl" });
});

});

describe("review9m: spelled-acronym-possessive (medium)", () => {

const world = { ...WORLD, ...referenceWorld() };
const PLACES = placesOf(world);
const REF = JSON.parse(readFileSync("src/lib/thunai/v8/__fixtures__/news19nov.json", "utf8"));
const WEEK: StoryItem[] = REF.weekly.map((s: any, i: number) => ({ id: `w${i}`, title: s.title, outlets: s.outlets, place: s.place, t: s.t }));
const pick = (text: string, items: StoryItem[], onScreen = false) => {
  const req = newsRequest(text, { onScreen });
  if (!req) return { req: null, pick: null, other: null, stories: [] as StoryItem[], score: 0 };
  return { req, ...pickStory(rankStories(req, items, { places: PLACES }), null) };
};

it("spelled-acronym-possessive", () => {
  // w70 = "I took money on the instructions of DMK's Arasakumar: ..."; w85 = "DMK rule will dawn soon; Says Stalin"
  const r = pick("D M K Arasakumar news padinga", WEEK);
  expect({ pick: r.pick?.id ?? null, score: Number(r.score.toFixed(3)) }).toMatchObject({ pick: "w70" });
});

});
