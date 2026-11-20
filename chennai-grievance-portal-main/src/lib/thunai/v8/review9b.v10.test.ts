/**
 * v10, phase 1: the second independent review of v9's diff (7fa525fb..0a4b0245), carried over from v9 (docs/jarvis/JARVIS_V10.md Part 8). Five
 * read-only finders by area, then a verifier per area that reproduced each finding with a probe on an exact copy of v9's commit (and on v8's
 * checkout for a claimed regression). Every confirmed finding below is its verifier's own probe, a failing test first; the fixes follow.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expect, it } from "vitest";
import { WORLD } from "../fixture";
import { referenceWorld } from "../world";
import * as B from "./browser";
import { browserLaneV8, refLane8, browserLaneV7, type BrowserLane, type LastFound } from "./browser";
import { newsRequest, outletIn, rankStories, type StoryItem } from "./news8";
import { findNews, foundStory, placesOf } from "./newsfind";
import fs, { readFileSync } from "node:fs";
import path from "node:path";
import { transformSync } from "esbuild";
import { newsScreen, type NewsOnScreen } from "../newsask";
import { placeWord } from "./lang8";
import { asksPrivate } from "../privacy";
import { routeByRules } from "../router";
import { NewsBody, newsEvents, type StoredDoc } from "../web/serve";
import { newsAide } from "../aide7/news";
import { type Rung } from "../llm";
import { type OpenRung, type RungCall } from "../aide7/stream";

// SHARED SETUP (every outlet finding below uses it)
const world = { ...WORLD, ...referenceWorld() };
// the ref store (eval/v8/ref, 19 Nov): each outlet's report a stored document of its cluster; the news panel shows a cluster per row, by its first document, with every outlet that ran it (Thunai.tsx newsOnScreen)
const HEROIN = "DRI Officials Seize 70 Kg Heroin Worth Rs 140 Crore In Chennai; Two Arrested";
const CLUSTERS: { title: string; outlets: string[]; t: string }[] = [
  { title: HEROIN, outlets: ["Maalaimalar", "ETV Bharat", "Polimer News", "Thanthi TV", "The Indian Express", "Dinakaran", "Daily Thanthi", "DT Next", "Dinamalar", "The Times of India"], t: "2026-11-19 13:10" },
  { title: "TN Governor Rajendra Arlekar admitted to private hospital in Chennai", outlets: ["DT Next"], t: "2026-11-19 11:57" },
  { title: "Will a new bus stand be built opposite Pondhathalli metro station..? – Public expectation", outlets: ["Dinamani"], t: "2026-11-19 11:47" },
  { title: "Cyclone Akvan to cross Odisha coast tomorrow; rain likely in Chennai on November 23, 24", outlets: ["DT Next", "Dinamani", "The Hindu", "Daily Thanthi", "Hindu Tamil Thisai", "Maalaimalar"], t: "2026-11-19 10:00" },
  { title: "Three fugitives arrested in Chennai", outlets: ["Hindu Tamil Thisai"], t: "2026-11-19 07:59" },
  { title: "Destruction of banned tobacco products worth Rs 1.25 crore in Chennai", outlets: ["Maalaimalar"], t: "2026-11-19 07:08" },
  { title: "Electricity theft in 24 locations in Chennai: Rs 52.77 lakh compensation collected", outlets: ["Dinamani"], t: "2026-11-19 00:49" },
  { title: "Health Department and Rotary Club of Madras partner to take forward HPV vaccination", outlets: ["The Hindu"], t: "2026-11-18 20:29" },
  { title: "Construction Ban In Chennai's Pallikaranai: HC Gives Liberty To Petitioners To Approach SC", outlets: ["ETV Bharat", "Hindu Tamil Thisai"], t: "2026-11-18 20:14" },
  { title: "GCC issues 124 de-occupation notices for coastal buildings", outlets: ["The Hindu"], t: "2026-11-18 19:36" },
  { title: "2 new service vehicles for livelihood enhancement of persons with disabilities: Chennai Collector flags off", outlets: ["Daily Thanthi"], t: "2026-11-18 20:36" },
  { title: "Young woman commits suicide by jumping from 9th floor in Sholinganallur", outlets: ["Daily Thanthi"], t: "2026-11-18 07:52" },
  { title: "Chennai Corporation opens free public toilets at 853 locations", outlets: ["Daily Thanthi", "The Hindu"], t: "2026-11-17 14:04" },
  { title: "Train service changes at Tiruchendur, Chennai", outlets: ["Dinamalar"], t: "2026-11-15 18:50" },
  { title: "At Chennai Kannadhasan Nagar bus stand, conductor stabbed with a sword in front of passengers!!", outlets: ["Dinakaran"], t: "2026-11-15 14:53" },
  { title: "Chennai Corporation clears 78 metric tonnes of waste from TNUHDB tenements", outlets: ["DT Next", "Daily Thanthi"], t: "2026-11-14 22:00" },
  { title: "Gang drags young man and hacks him indiscriminately in Pattinapakkam, Chennai", outlets: ["Maalaimalar"], t: "2026-11-16 14:54" },
  { title: "Chola-era lakes supplying drinking water to Chennai", outlets: ["Hindu Tamil Thisai", "Dinakaran", "Maalaimalar", "Daily Thanthi"], t: "2026-11-17 14:48" }
];
const STORE: StoryItem[] = CLUSTERS.flatMap((c, i) => c.outlets.map((o, k) => ({ id: `w${i}o${k}`, title: c.title, outlets: [o], story: `st${i}`, t: c.t })));
const PANEL = CLUSTERS.slice(0, 12).map((c, i) => ({ id: `w${i}o0`, title: c.title, source: c.outlets.join(" · ") }));
const state = (o: Record<string, unknown> = {}) => ({ page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false, ...o }) as never;
const CASE_LIST = { recipe: "cases", blocks: [{ kind: "CaseList", rows: [{ id: "c1", title: "Garbage", place: "Adyar", zoneName: "Adyar" }, { id: "c2", title: "Streetlight", place: "Adyar", zoneName: "Adyar" }] }], scope: { zone: null } };
type Ctx = "panel" | "cases" | "none";
const CTXS: Ctx[] = ["panel", "cases", "none"];
/** the browser's lane: the console's news panel open; a case list on the Stage (no panel); nothing on screen */
const laneOf = (t: string, ctx: Ctx) => {
  const lg = /[஀-௿]/u.test(t) ? "ta" : "en";
  const c = ctx === "panel" ? { stage: null, news: { items: PANEL }, state: state({ panel: "news" }) }
    : ctx === "cases" ? { stage: CASE_LIST, news: { items: [] }, state: state({ listLength: 2 }) } : { stage: null, news: { items: [] }, state: state() };
  return browserLaneV8(t, { ...c, world, listenLang: lg, heardLang: lg, v7: true } as never);
};
/** the story the news route reads for it (the panel open, or nothing on screen) */
const readFor = async (t: string, ctx: "panel" | "none" = "panel") => {
  const r = await findNews({ q: t, lang: /[஀-௿]/u.test(t) ? "ta" : "en", screen: ctx === "panel" ? PANEL : [] }, { world, stories: async () => STORE });
  return r?.picked.pick?.title ?? null;
};
const observe = async (t: string) => ({ outlet: outletIn(t), newsLaneOn: CTXS.filter((c) => laneOf(t, c).lane === "news"), read: await readFor(t) });
const NOT_NEWS = { outlet: null, newsLaneOn: [], read: null };

describe("review9b: last-one-period (high)", () => {

const world = { ...WORLD, ...referenceWorld() };
const ST = (o: Record<string, unknown> = {}) =>
  ({ page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false, ...o }) as never;
const ta = (t: string) => /[஀-௿]/u.test(t);
const storiesOf = (n: number, extra: { id: string; title: string; source: string }[] = []) =>
  [...extra, ...Array.from({ length: n - extra.length }, (_, i) => ({ id: `n${extra.length + i + 1}`, title: `Corporation story number ${extra.length + i + 1}`, source: "The Hindu" }))];
const PANEL25 = storiesOf(25);
const PANEL27 = storiesOf(27);
/** no Stage open, the console's news panel open (Thunai.tsx newsOnScreen: the panel's stories) */
const onPanel = (t: string, items = PANEL25) =>
  browserLaneV8(t, { stage: null, news: { items }, state: ST({ panel: "news" }), world, listenLang: "en", heardLang: ta(t) ? "ta" : "en", v7: true });
/** Jarvis's own news list on the Stage (a NewsReader; newsOnScreen: its items) */
const NEWS_STAGE = { recipe: "news", blocks: [{ kind: "NewsReader", rows: [] }], scope: { zone: null } };
const onNewsList = (t: string, items = PANEL25) =>
  browserLaneV8(t, { stage: NEWS_STAGE as never, news: { items }, state: ST(), world, listenLang: "en", heardLang: ta(t) ? "ta" : "en", v7: true });
/** a Stage showing a list of 25 cases (newsOnScreen: no stories) */
const ROWS25 = Array.from({ length: 25 }, (_, i) => ({ id: `c${i + 1}`, title: "Garbage not cleared", place: "Adyar", zoneName: "Adyar", deptName: "Solid Waste Management" }));
const CASE_STAGE = { recipe: "cases", blocks: [{ kind: "CaseList", rows: ROWS25 }], scope: { zone: null } };
const onCases = (t: string) =>
  browserLaneV8(t, { stage: CASE_STAGE as never, news: { items: [] }, state: ST(), world, listenLang: "en", heardLang: ta(t) ? "ta" : "en", v7: true });
const what = (t: string, bl: BrowserLane): string => {
  if (bl.lane === "news") {
    const na = bl.na;
    if (na.kind === "read") return "id" in na.body ? `read ${na.body.id}` : "read incident";
    if (na.kind === "find") {
      const soft = (na as { soft?: boolean }).soft ? ` (soft, else ${(bl as { soft?: BrowserLane }).soft?.lane})` : "";
      return `find [${(newsRequest(t, { onScreen: true })?.words ?? []).join(",")}]${soft}`;
    }
    return na.kind;
  }
  if (bl.lane === "stage") return `stage ${bl.cmd.op}${"n" in bl.cmd ? ` ${(bl.cmd as { n: number }).n}` : ""}`;
  if (bl.lane === "rules") return `rules ${JSON.stringify(bl.steps).slice(0, 160)}`;
  return bl.lane;
};
const run = (ctx: string, f: (t: string) => BrowserLane, ts: string[]) => ts.map((t) => ({ ctx, t, got: what(t, f(t)) }));
const show = (id: string, rows: { ctx: string; t: string; got: string }[]) => console.log(`[${id}]\n${rows.map((r) => `  ${r.ctx} | ${r.t} => ${r.got}`).join("\n")}`);

describe("v10 review: ordinals and references", () => {
  it("last-one-period: 'the last one hour / the last one week' is a period, never the panel's last story", () => {
    const rows = run("panel25", onPanel, ["What is the rainfall in the last one hour?", "Show me the rainfall in the last one hour", "Show me the news from the last one week"]);
    show("last-one-period", rows);
    expect(rows.filter((r) => r.got.startsWith("read "))).toEqual([]);
  });
});

});

describe("review9b: panel-dates (high)", () => {

const world = { ...WORLD, ...referenceWorld() };
const ST = (o: Record<string, unknown> = {}) =>
  ({ page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false, ...o }) as never;
const ta = (t: string) => /[஀-௿]/u.test(t);
const storiesOf = (n: number, extra: { id: string; title: string; source: string }[] = []) =>
  [...extra, ...Array.from({ length: n - extra.length }, (_, i) => ({ id: `n${extra.length + i + 1}`, title: `Corporation story number ${extra.length + i + 1}`, source: "The Hindu" }))];
const PANEL25 = storiesOf(25);
const onPanel = (t: string, items = PANEL25) =>
  browserLaneV8(t, { stage: null, news: { items }, state: ST({ panel: "news" }), world, listenLang: "en", heardLang: ta(t) ? "ta" : "en", v7: true });
const what = (t: string, bl: BrowserLane): string => {
  if (bl.lane === "news") {
    const na = bl.na;
    if (na.kind === "read") return "id" in na.body ? `read ${na.body.id}` : "read incident";
    if (na.kind === "find") return `find [${(newsRequest(t, { onScreen: true })?.words ?? []).join(",")}]`;
    return na.kind;
  }
  if (bl.lane === "stage") return `stage ${bl.cmd.op}${"n" in bl.cmd ? ` ${(bl.cmd as { n: number }).n}` : ""}`;
  if (bl.lane === "rules") return `rules ${JSON.stringify(bl.steps).slice(0, 160)}`;
  return bl.lane;
};
const run = (ctx: string, f: (t: string) => BrowserLane, ts: string[]) => ts.map((t) => ({ ctx, t, got: what(t, f(t)) }));
const show = (id: string, rows: { ctx: string; t: string; got: string }[]) => console.log(`[${id}]\n${rows.map((r) => `  ${r.ctx} | ${r.t} => ${r.got}`).join("\n")}`);

describe("v10 review: ordinals and references", () => {
  it("panel-dates: a date at the end ('on the 3rd', 'for the 21st', 'from the 15th') is no panel position", () => {
    const rows = run("panel25", onPanel, ["Show me the rainfall on the 3rd", "What is the weather forecast for the 21st", "Read the news from the 15th", "Tell me about the meeting on the 25th"]);
    show("panel-dates", rows);
    expect(rows.filter((r) => r.got.startsWith("read "))).toEqual([]);
  });
});

});

describe("review9b: tamil-aam-dates-open-case (high)", () => {

const world = { ...WORLD, ...referenceWorld() };
const ST = (o: Record<string, unknown> = {}) =>
  ({ page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false, ...o }) as never;
const ta = (t: string) => /[஀-௿]/u.test(t);
/** a Stage showing a list of 25 cases (Thunai.tsx newsOnScreen: no stories) */
const ROWS25 = Array.from({ length: 25 }, (_, i) => ({ id: `c${i + 1}`, title: "Garbage not cleared", place: "Adyar", zoneName: "Adyar", deptName: "Solid Waste Management" }));
const CASE_STAGE = { recipe: "cases", blocks: [{ kind: "CaseList", rows: ROWS25 }], scope: { zone: null } };
const onCases = (t: string) =>
  browserLaneV8(t, { stage: CASE_STAGE as never, news: { items: [] }, state: ST(), world, listenLang: "en", heardLang: ta(t) ? "ta" : "en", v7: true });
const what = (t: string, bl: BrowserLane): string => {
  if (bl.lane === "news") {
    const na = bl.na;
    if (na.kind === "read") return "id" in na.body ? `read ${na.body.id}` : "read incident";
    if (na.kind === "find") return `find [${(newsRequest(t, { onScreen: true })?.words ?? []).join(",")}]`;
    return na.kind;
  }
  if (bl.lane === "stage") return `stage ${bl.cmd.op}${"n" in bl.cmd ? ` ${(bl.cmd as { n: number }).n}` : ""}`;
  if (bl.lane === "rules") return `rules ${JSON.stringify(bl.steps).slice(0, 160)}`;
  return bl.lane;
};
const run = (ctx: string, f: (t: string) => BrowserLane, ts: string[]) => ts.map((t) => ({ ctx, t, got: what(t, f(t)) }));
const show = (id: string, rows: { ctx: string; t: string; got: string }[]) => console.log(`[${id}]\n${rows.map((r) => `  ${r.ctx} | ${r.t} => ${r.got}`).join("\n")}`);

describe("v10 review: ordinals and references", () => {
  it("tamil-aam-dates-open-case: over a case list, -ஆம் dates and phases, a Tamil street, '21st November' and 'for the 21st' open no case by position", () => {
    const ts = ["ஏழாம் தேதி வந்த புகார்களைக் காட்டுங்க", "நவம்பர் பத்தாம் தேதி சம்பவங்களைக் காட்டுங்க", "இரண்டாம் கட்ட மெட்ரோ பணி புகார்களைக் காட்டுங்க", "ஏழாவது தெரு புகார்களைக் காட்டுங்க",
      "Open the 21st November complaints", "Show me the hearings scheduled for the 21st"];
    const rows = run("cases25", onCases, ts);
    show("tamil-aam-dates-open-case", rows.concat(ts.map((t) => ({ ctx: "refLane8", t, got: JSON.stringify(refLane8(t, CASE_STAGE as never)) }))));
    expect(rows.filter((r) => /^stage open [1-9]/.test(r.got))).toEqual([]);
  });
});

});

describe("review9b: final-is-last (high)", () => {

const world = { ...WORLD, ...referenceWorld() };
const ST = (o: Record<string, unknown> = {}) =>
  ({ page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false, ...o }) as never;
const ta = (t: string) => /[஀-௿]/u.test(t);
const storiesOf = (n: number, extra: { id: string; title: string; source: string }[] = []) =>
  [...extra, ...Array.from({ length: n - extra.length }, (_, i) => ({ id: `n${extra.length + i + 1}`, title: `Corporation story number ${extra.length + i + 1}`, source: "The Hindu" }))];
const PANEL27 = storiesOf(27);
const onPanel = (t: string, items = PANEL27) =>
  browserLaneV8(t, { stage: null, news: { items }, state: ST({ panel: "news" }), world, listenLang: "en", heardLang: ta(t) ? "ta" : "en", v7: true });
const NEWS_STAGE = { recipe: "news", blocks: [{ kind: "NewsReader", rows: [] }], scope: { zone: null } };
const onNewsList = (t: string, items = PANEL27) =>
  browserLaneV8(t, { stage: NEWS_STAGE as never, news: { items }, state: ST(), world, listenLang: "en", heardLang: ta(t) ? "ta" : "en", v7: true });
const what = (t: string, bl: BrowserLane): string => {
  if (bl.lane === "news") {
    const na = bl.na;
    if (na.kind === "read") return "id" in na.body ? `read ${na.body.id}` : "read incident";
    if (na.kind === "find") return `find [${(newsRequest(t, { onScreen: true })?.words ?? []).join(",")}]`;
    return na.kind;
  }
  if (bl.lane === "stage") return `stage ${bl.cmd.op}${"n" in bl.cmd ? ` ${(bl.cmd as { n: number }).n}` : ""}`;
  if (bl.lane === "rules") return `rules ${JSON.stringify(bl.steps).slice(0, 160)}`;
  return bl.lane;
};
const run = (ctx: string, f: (t: string) => BrowserLane, ts: string[]) => ts.map((t) => ({ ctx, t, got: what(t, f(t)) }));
const show = (id: string, rows: { ctx: string; t: string; got: string }[]) => console.log(`[${id}]\n${rows.map((r) => `  ${r.ctx} | ${r.t} => ${r.got}`).join("\n")}`);

describe("v10 review: ordinals and references", () => {
  it("final-is-last: 'the final report on X' is a story about X, not the last story on screen", () => {
    const ts = ["Read the final report on the Ennore oil spill", "Tell me about the expert committee's final report", "Ennore oil spill final report news padinga"];
    const rows = [...run("panel27", (t) => onPanel(t, PANEL27), ts), ...run("newslist27", (t) => onNewsList(t, PANEL27), ts)];
    show("final-is-last", rows);
    expect(rows.filter((r) => r.got === "read n27")).toEqual([]);
  });
});

});

describe("review9b: first-candidate-only (medium)", () => {

const world = { ...WORLD, ...referenceWorld() };
const ST = (o: Record<string, unknown> = {}) =>
  ({ page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false, ...o }) as never;
const ta = (t: string) => /[஀-௿]/u.test(t);
const storiesOf = (n: number, extra: { id: string; title: string; source: string }[] = []) =>
  [...extra, ...Array.from({ length: n - extra.length }, (_, i) => ({ id: `n${extra.length + i + 1}`, title: `Corporation story number ${extra.length + i + 1}`, source: "The Hindu" }))];
const PANEL25 = storiesOf(25);
const onPanel = (t: string, items = PANEL25) =>
  browserLaneV8(t, { stage: null, news: { items }, state: ST({ panel: "news" }), world, listenLang: "en", heardLang: ta(t) ? "ta" : "en", v7: true });
const NEWS_STAGE = { recipe: "news", blocks: [{ kind: "NewsReader", rows: [] }], scope: { zone: null } };
const onNewsList = (t: string, items = PANEL25) =>
  browserLaneV8(t, { stage: NEWS_STAGE as never, news: { items }, state: ST(), world, listenLang: "en", heardLang: ta(t) ? "ta" : "en", v7: true });
const what = (t: string, bl: BrowserLane): string => {
  if (bl.lane === "news") {
    const na = bl.na;
    if (na.kind === "read") return "id" in na.body ? `read ${na.body.id}` : "read incident";
    if (na.kind === "find") return `find [${(newsRequest(t, { onScreen: true })?.words ?? []).join(",")}]`;
    return na.kind;
  }
  if (bl.lane === "stage") return `stage ${bl.cmd.op}${"n" in bl.cmd ? ` ${(bl.cmd as { n: number }).n}` : ""}`;
  if (bl.lane === "rules") return `rules ${JSON.stringify(bl.steps).slice(0, 160)}`;
  return bl.lane;
};
const run = (ctx: string, f: (t: string) => BrowserLane, ts: string[]) => ts.map((t) => ({ ctx, t, got: what(t, f(t)) }));
const show = (id: string, rows: { ctx: string; t: string; got: string }[]) => console.log(`[${id}]\n${rows.map((r) => `  ${r.ctx} | ${r.t} => ${r.got}`).join("\n")}`);

describe("v10 review: ordinals and references", () => {
  it("first-candidate-only: an earlier 'a second' / 'First,' / 'OK first' does not hide the real position later in the sentence", () => {
    const want: [string, string][] = [["Wait a second, read the third news", "read n3"], ["First, read the second news", "read n2"], ["One second, open the last story", "read n25"],
      ["OK first read the fifth article", "read n5"]];
    const rows = [...run("panel25", onPanel, want.map(([t]) => t)), ...run("newslist25", onNewsList, want.map(([t]) => t))];
    show("first-candidate-only", rows);
    expect(rows.map((r) => [r.ctx, r.t, r.got])).toEqual(rows.map((r) => [r.ctx, r.t, want.find(([t]) => t === r.t)![1]]));
  });
});

});

describe("review9b: number-before-news-word (medium)", () => {

const world = { ...WORLD, ...referenceWorld() };
const ST = (o: Record<string, unknown> = {}) =>
  ({ page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false, ...o }) as never;
const ta = (t: string) => /[஀-௿]/u.test(t);
const storiesOf = (n: number, extra: { id: string; title: string; source: string }[] = []) =>
  [...extra, ...Array.from({ length: n - extra.length }, (_, i) => ({ id: `n${extra.length + i + 1}`, title: `Corporation story number ${extra.length + i + 1}`, source: "The Hindu" }))];
const PANEL25 = storiesOf(25);
const onPanel = (t: string, items = PANEL25) =>
  browserLaneV8(t, { stage: null, news: { items }, state: ST({ panel: "news" }), world, listenLang: "en", heardLang: ta(t) ? "ta" : "en", v7: true });
const NEWS_STAGE = { recipe: "news", blocks: [{ kind: "NewsReader", rows: [] }], scope: { zone: null } };
const onNewsList = (t: string, items = PANEL25) =>
  browserLaneV8(t, { stage: NEWS_STAGE as never, news: { items }, state: ST(), world, listenLang: "en", heardLang: ta(t) ? "ta" : "en", v7: true });
const what = (t: string, bl: BrowserLane): string => {
  if (bl.lane === "news") {
    const na = bl.na;
    if (na.kind === "read") return "id" in na.body ? `read ${na.body.id}` : "read incident";
    if (na.kind === "find") return `find [${(newsRequest(t, { onScreen: true })?.words ?? []).join(",")}]`;
    return na.kind;
  }
  if (bl.lane === "stage") return `stage ${bl.cmd.op}${"n" in bl.cmd ? ` ${(bl.cmd as { n: number }).n}` : ""}`;
  if (bl.lane === "rules") return `rules ${JSON.stringify(bl.steps).slice(0, 160)}`;
  return bl.lane;
};
const run = (ctx: string, f: (t: string) => BrowserLane, ts: string[]) => ts.map((t) => ({ ctx, t, got: what(t, f(t)) }));
const show = (id: string, rows: { ctx: string; t: string; got: string }[]) => console.log(`[${id}]\n${rows.map((r) => `  ${r.ctx} | ${r.t} => ${r.got}`).join("\n")}`);

describe("v10 review: ordinals and references", () => {
  it("number-before-news-word: 'ward number 5 news' / 'வார்டு எண் 5 செய்திகள்' is news about the ward, not story 5", () => {
    const ts = ["Show me ward number 5 news", "வார்டு எண் 5 செய்திகளைப் படிங்க", "வார்டு நம்பர் 5 நியூஸ் காட்டுங்க", "zone number 3 news padinga"];
    const rows = [...run("panel25", onPanel, ts), ...run("newslist25", onNewsList, ts)];
    show("number-before-news-word", rows);
    expect(rows.filter((r) => r.got.startsWith("read "))).toEqual([]);
  });
});

});

describe("review9b: street-x-one-dropped (medium)", () => {

const world = { ...WORLD, ...referenceWorld() };
const ST = (o: Record<string, unknown> = {}) =>
  ({ page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false, ...o }) as never;
const ta = (t: string) => /[஀-௿]/u.test(t);
const storiesOf = (n: number, extra: { id: string; title: string; source: string }[] = []) =>
  [...extra, ...Array.from({ length: n - extra.length }, (_, i) => ({ id: `n${extra.length + i + 1}`, title: `Corporation story number ${extra.length + i + 1}`, source: "The Hindu" }))];
const PANEL25 = storiesOf(25);
const onPanel = (t: string, items = PANEL25) =>
  browserLaneV8(t, { stage: null, news: { items }, state: ST({ panel: "news" }), world, listenLang: "en", heardLang: ta(t) ? "ta" : "en", v7: true });
const what = (t: string, bl: BrowserLane): string => {
  if (bl.lane === "news") {
    const na = bl.na;
    if (na.kind === "read") return "id" in na.body ? `read ${na.body.id}` : "read incident";
    if (na.kind === "find") return `find [${(newsRequest(t, { onScreen: true })?.words ?? []).join(",")}]`;
    return na.kind;
  }
  if (bl.lane === "stage") return `stage ${bl.cmd.op}${"n" in bl.cmd ? ` ${(bl.cmd as { n: number }).n}` : ""}`;
  if (bl.lane === "rules") return `rules ${JSON.stringify(bl.steps).slice(0, 160)}`;
  return bl.lane;
};
const run = (ctx: string, f: (t: string) => BrowserLane, ts: string[]) => ts.map((t) => ({ ctx, t, got: what(t, f(t)) }));
const show = (id: string, rows: { ctx: string; t: string; got: string }[]) => console.log(`[${id}]\n${rows.map((r) => `  ${r.ctx} | ${r.t} => ${r.got}`).join("\n")}`);

describe("v10 review: ordinals and references", () => {
  it("street-x-one-dropped: 'Open the Second Line Beach one' with news on screen is a story request (a find), as in v8", () => {
    const items = storiesOf(25, [{ id: "s1", title: "Second Line Beach road to be relaid after complaints", source: "DT Next" },
      { id: "s2", title: "First Main Road in Gandhi Nagar waterlogged after rain", source: "The Hindu" },
      { id: "s3", title: "Besant Nagar Second Avenue gets new footpaths", source: "The New Indian Express" }]);
    const rows = run("panel25", (t) => onPanel(t, items), ["Open the Second Line Beach one", "Read the First Main Road one", "Open the Besant Nagar Second Avenue one"]);
    show("street-x-one-dropped", rows);
    expect(rows.filter((r) => !r.got.startsWith("find "))).toEqual([]);
  });
});

});

describe("review9b: digit-aam-and-spoken-12 (medium)", () => {

const world = { ...WORLD, ...referenceWorld() };
const ST = (o: Record<string, unknown> = {}) =>
  ({ page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false, ...o }) as never;
const ta = (t: string) => /[஀-௿]/u.test(t);
const storiesOf = (n: number, extra: { id: string; title: string; source: string }[] = []) =>
  [...extra, ...Array.from({ length: n - extra.length }, (_, i) => ({ id: `n${extra.length + i + 1}`, title: `Corporation story number ${extra.length + i + 1}`, source: "The Hindu" }))];
const PANEL25 = storiesOf(25);
const onPanel = (t: string, items = PANEL25) =>
  browserLaneV8(t, { stage: null, news: { items }, state: ST({ panel: "news" }), world, listenLang: "en", heardLang: ta(t) ? "ta" : "en", v7: true });
const what = (t: string, bl: BrowserLane): string => {
  if (bl.lane === "news") {
    const na = bl.na;
    if (na.kind === "read") return "id" in na.body ? `read ${na.body.id}` : "read incident";
    if (na.kind === "find") return `find [${(newsRequest(t, { onScreen: true })?.words ?? []).join(",")}]`;
    return na.kind;
  }
  if (bl.lane === "stage") return `stage ${bl.cmd.op}${"n" in bl.cmd ? ` ${(bl.cmd as { n: number }).n}` : ""}`;
  if (bl.lane === "rules") return `rules ${JSON.stringify(bl.steps).slice(0, 160)}`;
  return bl.lane;
};
const run = (ctx: string, f: (t: string) => BrowserLane, ts: string[]) => ts.map((t) => ({ ctx, t, got: what(t, f(t)) }));
const show = (id: string, rows: { ctx: string; t: string; got: string }[]) => console.log(`[${id}]\n${rows.map((r) => `  ${r.ctx} | ${r.t} => ${r.got}`).join("\n")}`);

describe("v10 review: ordinals and references", () => {
  it("digit-aam-and-spoken-12: '7ஆம் செய்தி' is story 7; the spoken பன்னெண்டாவது is the 12th and பதினொன்னாவது the 11th", () => {
    const want: [string, string][] = [["7ஆம் செய்தியைப் படிங்க", "read n7"], ["7-ஆம் செய்தியைப் படிங்க", "read n7"], ["பன்னெண்டாவது செய்தியைப் படிங்க", "read n12"],
      ["பதினொன்னாவது செய்தியைப் படிங்க", "read n11"]];
    const rows = run("panel25", onPanel, want.map(([t]) => t));
    show("digit-aam-and-spoken-12", rows);
    expect(rows.map((r) => [r.t, r.got])).toEqual(want);
  });
});

});

describe("review9b: codemix-positions-lost (low)", () => {

const world = { ...WORLD, ...referenceWorld() };
const ST = (o: Record<string, unknown> = {}) =>
  ({ page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false, ...o }) as never;
const ta = (t: string) => /[஀-௿]/u.test(t);
const storiesOf = (n: number, extra: { id: string; title: string; source: string }[] = []) =>
  [...extra, ...Array.from({ length: n - extra.length }, (_, i) => ({ id: `n${extra.length + i + 1}`, title: `Corporation story number ${extra.length + i + 1}`, source: "The Hindu" }))];
const PANEL25 = storiesOf(25);
const onPanel = (t: string, items = PANEL25) =>
  browserLaneV8(t, { stage: null, news: { items }, state: ST({ panel: "news" }), world, listenLang: "en", heardLang: ta(t) ? "ta" : "en", v7: true });
const what = (t: string, bl: BrowserLane): string => {
  if (bl.lane === "news") {
    const na = bl.na;
    if (na.kind === "read") return "id" in na.body ? `read ${na.body.id}` : "read incident";
    if (na.kind === "find") return `find [${(newsRequest(t, { onScreen: true })?.words ?? []).join(",")}]`;
    return na.kind;
  }
  if (bl.lane === "stage") return `stage ${bl.cmd.op}${"n" in bl.cmd ? ` ${(bl.cmd as { n: number }).n}` : ""}`;
  if (bl.lane === "rules") return `rules ${JSON.stringify(bl.steps).slice(0, 160)}`;
  return bl.lane;
};
const run = (ctx: string, f: (t: string) => BrowserLane, ts: string[]) => ts.map((t) => ({ ctx, t, got: what(t, f(t)) }));
const show = (id: string, rows: { ctx: string; t: string; got: string }[]) => console.log(`[${id}]\n${rows.map((r) => `  ${r.ctx} | ${r.t} => ${r.got}`).join("\n")}`);

describe("v10 review: ordinals and references", () => {
  it("codemix-positions-lost: 'last onnu padinga', 'second onnu open pannunga', '7th onnu kaattunga', 'Show me number 7' are the panel's stories", () => {
    const want: [string, string][] = [["last onnu padinga", "read n25"], ["second onnu open pannunga", "read n2"], ["7th onnu kaattunga", "read n7"], ["Show me number 7", "read n7"],
      ["read me number 7", "read n7"]];
    const rows = run("panel25", onPanel, want.map(([t]) => t));
    show("codemix-positions-lost", rows);
    expect(rows.map((r) => [r.t, r.got])).toEqual(want);
  });
});

});

describe("review9b: dtnext-to-do-next (high)", () => {


it("dtnext-to-do-next: 'to next' / 'do next' are not DT Next", async () => {
  const inputs = ["What should I do next?", "what do we do next", "show me what to do next", "go to next page", "Jarvis, go to next"];
  const got: Record<string, unknown> = {};
  for (const t of inputs) got[t] = await observe(t);
  expect(got).toEqual(Object.fromEntries(inputs.map((t) => [t, NOT_NEWS])));
});

});

describe("review9b: maalaimalar-rainfall (high)", () => {
// imports + SHARED SETUP: as in dtnext-to-do-next's probeCode (world, HEROIN, CLUSTERS, STORE, PANEL, state, CASE_LIST, laneOf, readFor, observe, NOT_NEWS)
it("maalaimalar-rainfall: மழை அளவு / mazhai alavu / மழைக்கால and Malai/Maraimalai places are not Maalaimalar", async () => {
  // rainfall questions and console commands: never the news lane (v8: server, or rules [map])
  const notNews = ["இன்னைக்கு மழை அளவு எவ்வளவு", "நுங்கம்பாக்கம் மழை அளவு இப்போ", "Mazhai alavu eppadi maariyirukku", "Adyar la mazhai alavu enna?",
    "show Anna Malai Nagar on the map", "Maraimalai Adigal bridge traffic eppadi irukku"];
  // rainfall news requests: no outlet, and never the heroin seizure because Maalaimalar ran it
  const rainNews = ["மழை அளவு செய்தி", "mazhai alavu news padinga", "மழைக்கால செய்தி"];
  const got: Record<string, unknown> = {};
  for (const t of notNews) got[t] = await observe(t);
  for (const t of rainNews) got[t] = { outlet: outletIn(t), readsHeroin: (await readFor(t)) === HEROIN || (await readFor(t, "none")) === HEROIN };
  expect(got).toEqual({ ...Object.fromEntries(notNews.map((t) => [t, NOT_NEWS])), ...Object.fromEntries(rainNews.map((t) => [t, { outlet: null, readsHeroin: false }])) });
});

});

describe("review9b: dinamani-dinasari (high)", () => {
// imports + SHARED SETUP: as in dtnext-to-do-next's probeCode
it("dinamani-dinasari: தினசரி / dhinasari (daily) is not Dinamani", async () => {
  const inputs = ["தினசரி அறிக்கை காட்டு", "தினசரி டாஷ்போர்டு காட்டு", "தினசரி நிலவரம் சொல்லுங்க", "dhinasari dashboard kaattu"];
  const got: Record<string, unknown> = {};
  for (const t of inputs) got[t] = await observe(t);
  // the daily dashboard is the console's instant control (v8: rules [page overview, period daily])
  got["தினசரி டாஷ்போர்டு காட்டு: lane"] = laneOf("தினசரி டாஷ்போர்டு காட்டு", "none").lane;
  expect(got).toEqual({ ...Object.fromEntries(inputs.map((t) => [t, NOT_NEWS])), "தினசரி டாஷ்போர்டு காட்டு: lane": "rules" });
});

});

describe("review9b: thanthi-tanti-everyday-words (high)", () => {
// imports + SHARED SETUP: as in dtnext-to-do-next's probeCode
it("thanthi-tanti-everyday-words: தாண்டி / thaandi, தனித்து, தந்த, TANSI, Thanthai are not Daily Thanthi", async () => {
  const inputs = ["தனித்து நிற்பது என்ன", "காலக்கெடு தாண்டி நிலுவையில் உள்ளவை காட்டு", "SLA தாண்டி போனது எத்தனை", "deadline thaandi pochu",
    "show me TANSI Nagar on the map", "open Thanthai Periyar Nagar on the map", "நான் நேற்று தந்த உத்தரவு என்ன ஆச்சு"];
  const got: Record<string, unknown> = {};
  for (const t of inputs) got[t] = await observe(t);
  expect(got).toEqual(Object.fromEntries(inputs.map((t) => [t, NOT_NEWS])));
});

});

describe("review9b: htt-it-to-tamil (high)", () => {
// imports + SHARED SETUP: as in dtnext-to-do-next's probeCode
it("htt-it-to-tamil: '<verb> it to Tamil' is the language switch, not Hindu Tamil Thisai", async () => {
  const inputs = ["switch it to Tamil", "change it to Tamil please"];
  const got: Record<string, unknown> = {};
  for (const t of inputs) got[t] = await observe(t);
  expect(got).toEqual(Object.fromEntries(inputs.map((t) => [t, NOT_NEWS])));
});

});

describe("review9b: court-gloss-bare-court (medium)", () => {
const world = { ...WORLD, ...referenceWorld() };

it("court-gloss-bare-court: உயர்நீதிமன்ற / உச்சநீதிமன்ற (High / Supreme Court) are not any 'court' headline, and the Pallikaranai HC story is still found", async () => {
  let n = 0;
  const story = (title: string, o: Partial<StoryItem> = {}): StoryItem => ({ id: o.id ?? `x${++n}`, title, outlets: ["DT Next"], t: "2026-11-15 10:00", ...o });
  // news9r.v8.test.ts's 40 filler stories (a store's word weights), and this week's court stories (eval/v8/ref, 19 Nov)
  const FILLER: StoryItem[] = ["Metro rail work: traffic diversions on Poonamallee High Road from Monday", "Chennai Corporation to install 500 new streetlights",
    "Gold rate today in Chennai", "School students visit the planetarium", "New ration shops open in north Chennai", "Book fair to begin at YMCA grounds",
    "Corporation council meeting approves budget", "Free eye camp held for senior citizens", "Marathon to be held on Sunday", "Lake restoration work begins",
    "Vegetable prices fall at Koyambedu market", "IT firms hire more freshers this year", "Health camp for sanitary workers", "New bus routes announced",
    "Chennai airport handles record passengers", "Library gets a digital makeover", "Heritage walk planned for the weekend", "Power utility upgrades substations",
    "Cricket academy opens new nets", "Film festival line-up announced", "Startups pitch at an innovation summit", "Museum extends its hours",
    "Traffic police launch helmet awareness drive", "Swimming pool reopens after repairs", "College fest draws large crowds", "Art exhibition opens at Lalit Kala",
    "Housing board allots flats", "Water body survey completed", "Sapling distribution in parks", "Senior citizens' helpline launched",
    "Port trust records higher cargo", "Science expo for students", "Music season to begin next month", "Ration card camp held", "Park gets a new play area",
    "Bus depot gets solar panels", "Fishing ban period ends", "Yoga camp at the beach", "Road safety week observed", "Toll plaza fee revised"].map((t, i) => story(t, { id: `f${i}`, t: `2026-11-1${i % 9} 08:00` }));
  const pc = story("Construction Ban In Chennai's Pallikaranai: HC Gives Liberty To Petitioners To Approach SC", { id: "pc", outlets: ["ETV Bharat"], t: "2026-11-18 20:14" });
  const items = [pc, story("Wall in the path of receding floodwater: New danger in South Pallikaranai", { id: "pw", outlets: ["Hindu Tamil Thisai"], t: "2026-11-14 12:31" }),
    story("Call to make toilet near court in Saidapet disabled-friendly", { id: "toilet", outlets: ["The New Indian Express"], t: "2026-11-15 06:56" }),
    story("Madras HC orders mandatory licensing and tagging of cattle in urban areas across Tamil Nadu to prevent motor accidents", { id: "cattle", outlets: ["The Hindu"], t: "2026-11-18 00:58" }),
    story("Child rape case: Veeramani’s daughter moves HC alleging harassment by SIT", { id: "vm", outlets: ["The Times of India"], t: "2026-11-17 23:56" }),
    story("Senthil Balaji petition to delay trial; judge expresses displeasure in money laundering case", { id: "sb", outlets: ["Dinamalar"], t: "2026-11-17 20:55" }), ...FILLER];
  const pickOf = async (q: string, pcOnScreen: boolean) => {
    const r = await findNews({ q, lang: "ta", screen: pcOnScreen ? [{ id: "pc", title: pc.title, source: "ETV Bharat" }] : [] }, { world, stories: async () => items });
    return r?.picked.pick?.id ?? null;
  };
  const got = {
    "உயர்நீதிமன்ற செய்தி: reads the Saidapet toilet story": (await pickOf("உயர்நீதிமன்ற செய்தி", false)) === "toilet",
    "உச்சநீதிமன்ற செய்தியைப் படிங்க: reads the Saidapet toilet story": (await pickOf("உச்சநீதிமன்ற செய்தியைப் படிங்க", false)) === "toilet",
    "பள்ளிக்கரணை உச்சநீதிமன்ற தடை செய்தி (on the panel)": await pickOf("பள்ளிக்கரணை உச்சநீதிமன்ற தடை செய்தி", true),
    "பள்ளிக்கரணை உயர்நீதிமன்ற செய்தி (from the store)": await pickOf("பள்ளிக்கரணை உயர்நீதிமன்ற செய்தி", false)
  };
  expect(got).toEqual({
    "உயர்நீதிமன்ற செய்தி: reads the Saidapet toilet story": false,
    "உச்சநீதிமன்ற செய்தியைப் படிங்க: reads the Saidapet toilet story": false,
    "பள்ளிக்கரணை உச்சநீதிமன்ற தடை செய்தி (on the panel)": "pc",
    "பள்ளிக்கரணை உயர்நீதிமன்ற செய்தி (from the store)": "pc"
  });
});

});

describe("review9b: names-key-like-outlets (medium)", () => {
// imports + SHARED SETUP: as in dtnext-to-do-next's probeCode
it("names-key-like-outlets: 'Jai Hind Nagar' is a place, not The Hindu", async () => {
  const t = "show me Jai Hind Nagar on the map";
  // ("Dhinakaran news padinga" is left out: தினகரன் is the paper's name and the politician's alike, and v8 already read the Tamil one as the paper)
  expect({ ...(await observe(t)), lane: laneOf(t, "none").lane }).toEqual({ ...NOT_NEWS, lane: "rules" });
});

});

describe("review9b: outlet-read-cold-cost (low)", () => {

it("outlet-read-cold-cost: three reads of NEW sentences stay under the #22 bound (15 ms), not only memo hits", () => {
  const base = "please open the latest report on the Kodungaiyur protest and the water supply in the northern zones ";
  for (let i = 0; i < 30; i++) { outletIn(`${base.repeat(4)}`.slice(0, 380) + ` warm ${i}`); newsRequest(`warm up sentence ${i} about Adyar`, {}); }
  const N = 20;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    const long = `${base.repeat(4)}`.slice(0, 380) + ` open the Deccan Chronical story ${i}`;
    outletIn(`Show me the severe cases in Adyar zone ${i}.`); outletIn(long); newsRequest(long, {});
  }
  const per = (performance.now() - t0) / N;
  const t1 = performance.now();
  for (let i = 0; i < 200; i++) outletIn(`show me the pending cases in Teynampet ward ${i}`);
  const shortPer = (performance.now() - t1) / 200;
  expect({ threeNewReadsUnder15ms: per < 15, newShortSentenceUnder1ms: shortPer < 1 }).toEqual({ threeNewReadsUnder15ms: true, newShortSentenceUnder1ms: true });
}, 60_000);

});

describe("review9b: read-screen-this-story-reads-panel-first (high)", () => {

const world = { ...WORLD, ...referenceWorld() } as never;
const STATE = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null,
  list: [] as string[], listLength: 0, lastPlace: null, numbers: false, now: Date.parse("2026-11-19T10:00:00+05:30") };
const state = (o: Record<string, unknown> = {}) => ({ ...STATE, ...o }) as never;
const ta = (t: string) => /[஀-௿]/u.test(t);
const log = (...a: unknown[]) => console.log("PROBE", ...a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))));
// Thunai.tsx newsOnScreen lives inside the component (not exported): its own source is read, types stripped, and run with the refs it reads
// (run vitest from chennai-grievance-portal-main)
function realArrow<T>(file: string, name: string, params: string[], env: unknown[]): T {
  const src = readFileSync(path.join(process.cwd(), file), "utf8");
  const start = src.indexOf(`const ${name} = (`);
  if (start < 0) throw new Error(`${name} not in ${file}`);
  const open = src.indexOf("=> {", start) + 3;
  let depth = 0, i = open;
  for (; i < src.length; i++) { const ch = src[i]; if (ch === "{") depth++; else if (ch === "}" && --depth === 0) break; }
  const js = transformSync(`${src.slice(start, i + 1)};`, { loader: "ts" }).code;
  return new Function(...params, `${js}\nreturn ${name};`)(...env) as T;
}
type NOS = (doc: unknown, cs: unknown) => { items: { id: string; source: string | null; title?: string }[]; incident: string | null; reading: string | null };
const consoleNews = (allNews: unknown[]): NOS =>
  realArrow<NOS>("src/components/collector/app/thunai/Thunai.tsx", "newsOnScreen", ["hostRef", "narration", "narrIndex"], [{ current: { ov: { allNews } } }, { current: [] }, { current: 0 }]);
const laneOf = (t: string, o: { st?: Record<string, unknown>; stage?: unknown; news?: unknown; incident?: string | null; lastFound?: unknown } = {}) =>
  B.browserLaneV8(t, { stage: (o.stage ?? null) as never, news: (o.news ?? { items: [] }) as never, state: state(o.st), world, listenLang: "en", heardLang: ta(t) ? "ta" : "en",
    incident: o.incident ?? null, v7: true, lastLang: null, lastFound: (o.lastFound ?? null) as never });
type BL = ReturnType<typeof B.browserLaneV8>;
const brief = (bl: BL): unknown => (bl.lane === "news"
  ? { lane: "news", kind: bl.na.kind, soft: bl.na.kind === "find" ? !!(bl.na as { soft?: boolean }).soft : undefined, body: bl.na.kind === "read" ? bl.na.body : undefined,
    why: bl.na.kind === "which" ? bl.na.why : undefined, behind: (bl as { soft?: BL }).soft ? brief((bl as { soft: BL }).soft) : undefined }
  : bl.lane === "rules" ? { lane: "rules", steps: bl.steps } : { lane: bl.lane });

it("read-screen-this-story-reads-panel-first", () => {
  const allNews = Array.from({ length: 12 }, (_, i) => ({ id: `p${i + 1}`, docIds: [`n${i + 1}`], outletNames: ["The Hindu"], title: `Panel story ${i + 1} on ward works ${i + 1}` }));
  const nos = consoleNews(allNews);
  const cs = state({ panel: "news" });
  // turn 1: no Stage, the console's news panel open (v9 reads n7)
  log("F1 turn 1 'read the seventh one'", brief(laneOf("read the seventh one", { st: { panel: "news" }, news: nos(null, cs) })));
  // Jarvis's read screen for the story just read (newsask.ts newsScreen, as Thunai newsTurn draws it) over the open panel
  const read = newsScreen({ lang: "en", kind: "read", outlet: "The Hindu", en: ["Reading The Hindu's report.", "Panel story 7 says the works are delayed."], ta: ["தி இந்து செய்தியைப் படிக்கிறேன்."],
    links: [{ outlet: "The Hindu", title: "Panel story 7", url: "https://www.thehindu.com/news/cities/chennai/story7", publishedAt: null }] });
  expect(read).not.toBeNull();
  const after = (t: string, lastFound: unknown, justRead: string) => {
    const bl = laneOf(t, { st: { panel: "news" }, stage: read, news: nos(read, cs), lastFound });
    const id = bl.lane === "news" && bl.na.kind === "read" && "id" in bl.na.body ? bl.na.body.id : null;
    log(`F1 after reading ${justRead}: '${t}'`, brief(bl));
    // the story just read, or no read (v8: the planner with the read screen as context, or "which report?"); never another story
    expect.soft([null, justRead], `'${t}' after reading ${justRead}: read ${id}`).toContain(id);
  };
  for (const t of ["tell me more about this story", "what is this story about?", "summarise this article", "read the full article", "what does the article say?",
    "இந்தச் செய்தியைப் பற்றி சொல்லுங்க", "andha news pathi sollunga"]) after(t, null, "n7");
  // after a find that read a story from the week's store (not on the panel): Thunai keeps it as lastFound
  after("summarise this article", { id: "s6", title: "Kodungaiyur residents stage empty pot protest over drinking water", q: "open the Kodungaiyur empty pot protest", other: null }, "s6");
});

});

describe("review9b: soft-place-alone-tamil-tanglish-stt (high)", () => {

const world = { ...WORLD, ...referenceWorld() } as never;
const STATE = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null,
  list: [] as string[], listLength: 0, lastPlace: null, numbers: false, now: Date.parse("2026-11-19T10:00:00+05:30") };
const state = (o: Record<string, unknown> = {}) => ({ ...STATE, ...o }) as never;
const ta = (t: string) => /[஀-௿]/u.test(t);
const log = (...a: unknown[]) => console.log("PROBE", ...a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))));
let n = 0;
const story = (title: string, o: Partial<StoryItem> = {}): StoryItem => ({ id: o.id ?? `x${++n}`, title, outlets: ["DT Next"], t: "2026-11-15 10:00", ...o });
/** 40 stories about nothing asked here (news9r.v8.test.ts's FILLER), so the word weights are a store's */
const FILLER: StoryItem[] = ["Metro rail work: traffic diversions on Poonamallee High Road from Monday", "Chennai Corporation to install 500 new streetlights",
  "Gold rate today in Chennai", "School students visit the planetarium", "New ration shops open in north Chennai", "Book fair to begin at YMCA grounds",
  "Corporation council meeting approves budget", "Free eye camp held for senior citizens", "Marathon to be held on Sunday", "Lake restoration work begins",
  "Vegetable prices fall at Koyambedu market", "IT firms hire more freshers this year", "Health camp for sanitary workers", "New bus routes announced",
  "Chennai airport handles record passengers", "Library gets a digital makeover", "Heritage walk planned for the weekend", "Power utility upgrades substations",
  "Cricket academy opens new nets", "Film festival line-up announced", "Startups pitch at an innovation summit", "Museum extends its hours",
  "Traffic police launch helmet awareness drive", "Swimming pool reopens after repairs", "College fest draws large crowds", "Art exhibition opens at Lalit Kala",
  "Housing board allots flats", "Water body survey completed", "Sapling distribution in parks", "Senior citizens' helpline launched",
  "Port trust records higher cargo", "Science expo for students", "Music season to begin next month", "Ration card camp held", "Park gets a new play area",
  "Bus depot gets solar panels", "Fishing ban period ends", "Yoga camp at the beach", "Road safety week observed", "Toll plaza fee revised"].map((t, i) => story(t, { id: `f${i}`, t: `2026-11-1${i % 9} 08:00` }));
const pickOf = async (q: string, items: StoryItem[]) => {
  const r = await findNews({ q, lang: ta(q) ? "ta" : "en" }, { world, stories: async () => items });
  return { soft: r?.req.soft ?? null, which: r?.req.which ?? null, event: r?.req.event ?? null, pick: r?.picked.pick?.id ?? null, score: r ? Number(r.picked.score.toFixed(3)) : null };
};
const laneOf = (t: string, o: { st?: Record<string, unknown>; stage?: unknown; news?: unknown; incident?: string | null; lastFound?: unknown } = {}) =>
  B.browserLaneV8(t, { stage: (o.stage ?? null) as never, news: (o.news ?? { items: [] }) as never, state: state(o.st), world, listenLang: "en", heardLang: ta(t) ? "ta" : "en",
    incident: o.incident ?? null, v7: true, lastLang: null, lastFound: (o.lastFound ?? null) as never });
type BL = ReturnType<typeof B.browserLaneV8>;
const newsFind = (bl: BL) => bl.lane === "news" && bl.na.kind === "find";
const brief = (bl: BL): unknown => (bl.lane === "news"
  ? { lane: "news", kind: bl.na.kind, soft: bl.na.kind === "find" ? !!(bl.na as { soft?: boolean }).soft : undefined, body: bl.na.kind === "read" ? bl.na.body : undefined,
    why: bl.na.kind === "which" ? bl.na.why : undefined, behind: (bl as { soft?: BL }).soft ? brief((bl as { soft: BL }).soft) : undefined }
  : bl.lane === "rules" ? { lane: "rules", steps: bl.steps } : { lane: bl.lane });

it("soft-place-alone-tamil-tanglish-stt", async () => {
  const items = [story("அடையாறில் கிடங்கில் தீ விபத்து", { id: "adta", titleEn: "Fire breaks out in Adyar godown", outlets: ["Dinamalar"], t: "2026-11-18 10:00" }),
    story("Fire breaks out in Adyar godown", { id: "aden", outlets: ["The Hindu"], t: "2026-11-18 09:00" }),
    story("Velachery residents stage protest against garbage dumping", { id: "vlc", t: "2026-11-17 10:00" }), ...FILLER];
  // the English forms (a count; a place alone): the console's
  for (const t of ["tell me how many fire accidents happened in Adyar", "open the Velachery protest", "tell me about the Adyar fire", "Adyar la fire pathi sollunga"])
    log(`F2 control '${t}'`, await pickOf(t, items), brief(laneOf(t)));
  for (const t of ["அடையாறில் எத்தனை தீ விபத்துகள் நடந்தது சொல்லுங்க", "அடையாறு தீ விபத்து பத்தி சொல்லுங்க", "அடையாறில் இந்த வாரம் தீ விபத்து பத்தி சொல்லுங்க",
    "Adyarla fire pathi sollunga", "open the Velacheri protest"]) {
    const bl = laneOf(t), r = await pickOf(t, items);
    log(`F2 '${t}'`, r, brief(bl));
    // a place alone (Tamil letters, a case ending joined on, a spelling by ear) names no event: no story is read; the console's lanes take it
    expect.soft(newsFind(bl) && r.pick != null, `'${t}': lane ${JSON.stringify(brief(bl))}; soft=${r.soft} which=${JSON.stringify(r.which)}; picked ${r.pick} at ${r.score}`).toBe(false);
  }
  // (the count question against a store whose Adyar headline says the plural: logged only)
  const plural = [story("அடையாறில் அடுத்தடுத்து தீ விபத்துகள்: மக்கள் அச்சம்", { id: "adpl", titleEn: "Successive fire accidents in Adyar worry residents", t: "2026-11-18 11:00" }), ...FILLER];
  log("F2 extra (plural headline)", await pickOf("அடையாறில் எத்தனை தீ விபத்துகள் நடந்தது சொல்லுங்க", plural));
});

});

describe("review9b: soft-kind-of-thing-category-views (medium)", () => {

const world = { ...WORLD, ...referenceWorld() } as never;
const STATE = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null,
  list: [] as string[], listLength: 0, lastPlace: null, numbers: false, now: Date.parse("2026-11-19T10:00:00+05:30") };
const state = (o: Record<string, unknown> = {}) => ({ ...STATE, ...o }) as never;
const ta = (t: string) => /[஀-௿]/u.test(t);
const log = (...a: unknown[]) => console.log("PROBE", ...a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))));
let n = 0;
const story = (title: string, o: Partial<StoryItem> = {}): StoryItem => ({ id: o.id ?? `x${++n}`, title, outlets: ["DT Next"], t: "2026-11-15 10:00", ...o });
/** 40 stories about nothing asked here (news9r.v8.test.ts's FILLER) */
const FILLER: StoryItem[] = ["Metro rail work: traffic diversions on Poonamallee High Road from Monday", "Chennai Corporation to install 500 new streetlights",
  "Gold rate today in Chennai", "School students visit the planetarium", "New ration shops open in north Chennai", "Book fair to begin at YMCA grounds",
  "Corporation council meeting approves budget", "Free eye camp held for senior citizens", "Marathon to be held on Sunday", "Lake restoration work begins",
  "Vegetable prices fall at Koyambedu market", "IT firms hire more freshers this year", "Health camp for sanitary workers", "New bus routes announced",
  "Chennai airport handles record passengers", "Library gets a digital makeover", "Heritage walk planned for the weekend", "Power utility upgrades substations",
  "Cricket academy opens new nets", "Film festival line-up announced", "Startups pitch at an innovation summit", "Museum extends its hours",
  "Traffic police launch helmet awareness drive", "Swimming pool reopens after repairs", "College fest draws large crowds", "Art exhibition opens at Lalit Kala",
  "Housing board allots flats", "Water body survey completed", "Sapling distribution in parks", "Senior citizens' helpline launched",
  "Port trust records higher cargo", "Science expo for students", "Music season to begin next month", "Ration card camp held", "Park gets a new play area",
  "Bus depot gets solar panels", "Fishing ban period ends", "Yoga camp at the beach", "Road safety week observed", "Toll plaza fee revised"].map((t, i) => story(t, { id: `f${i}`, t: `2026-11-1${i % 9} 08:00` }));
const pickOf = async (q: string, items: StoryItem[]) => {
  const r = await findNews({ q, lang: ta(q) ? "ta" : "en" }, { world, stories: async () => items });
  return { soft: r?.req.soft ?? null, which: r?.req.which ?? null, event: r?.req.event ?? null, pick: r?.picked.pick?.id ?? null, score: r ? Number(r.picked.score.toFixed(3)) : null };
};
const laneOf = (t: string, o: { st?: Record<string, unknown>; stage?: unknown; news?: unknown; incident?: string | null; lastFound?: unknown } = {}) =>
  B.browserLaneV8(t, { stage: (o.stage ?? null) as never, news: (o.news ?? { items: [] }) as never, state: state(o.st), world, listenLang: "en", heardLang: ta(t) ? "ta" : "en",
    incident: o.incident ?? null, v7: true, lastLang: null, lastFound: (o.lastFound ?? null) as never });
type BL = ReturnType<typeof B.browserLaneV8>;
const newsFind = (bl: BL) => bl.lane === "news" && bl.na.kind === "find";
const brief = (bl: BL): unknown => (bl.lane === "news"
  ? { lane: "news", kind: bl.na.kind, soft: bl.na.kind === "find" ? !!(bl.na as { soft?: boolean }).soft : undefined, body: bl.na.kind === "read" ? bl.na.body : undefined,
    why: bl.na.kind === "which" ? bl.na.why : undefined, behind: (bl as { soft?: BL }).soft ? brief((bl as { soft: BL }).soft) : undefined }
  : bl.lane === "rules" ? { lane: "rules", steps: bl.steps } : { lane: bl.lane });

it("soft-kind-of-thing-category-views", async () => {
  const items = [story("Stray dog attacks 5-year-old child in Anna Nagar", { id: "dog" }), story("Wall collapse in Royapuram injures two workers", { id: "wall" }),
    story("Chain snatching in Anna Nagar: woman loses 5 sovereigns", { id: "chain" }), story("Bus accident in Ambattur: 12 passengers injured", { id: "bus" }), ...FILLER];
  for (const t of ["Open the dog attacks in Anna Nagar", "open the bike theft in Velachery"]) log(`F3 control '${t}'`, await pickOf(t, items), brief(laneOf(t)));
  for (const t of ["open the stray dog attack in Anna Nagar", "open the wall collapse in Royapuram", "open the chain snatching in Anna Nagar", "open the bus accident in Ambattur"]) {
    const bl = laneOf(t), r = await pickOf(t, items);
    log(`F3 '${t}'`, r, brief(bl));
    // a kind of thing (one of the console's own categories) names no particular event: the console's view, no story read
    expect.soft(newsFind(bl) && r.pick != null, `'${t}': lane ${JSON.stringify(brief(bl))}; soft=${r.soft} which=${JSON.stringify(r.which)}; picked ${r.pick} at ${r.score}`).toBe(false);
  }
});

});

describe("review9b: soft-reminder-and-one-english-only (medium)", () => {

const world = { ...WORLD, ...referenceWorld() } as never;
// (`now`, as Thunai buildState sets it: understand() reads it for a reminder's time)
const STATE = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null,
  list: [] as string[], listLength: 0, lastPlace: null, numbers: false, now: Date.parse("2026-11-19T10:00:00+05:30") };
const state = (o: Record<string, unknown> = {}) => ({ ...STATE, ...o }) as never;
const ta = (t: string) => /[஀-௿]/u.test(t);
const log = (...a: unknown[]) => console.log("PROBE", ...a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))));
let n = 0;
const story = (title: string, o: Partial<StoryItem> = {}): StoryItem => ({ id: o.id ?? `x${++n}`, title, outlets: ["DT Next"], t: "2026-11-15 10:00", ...o });
/** 40 stories about nothing asked here (news9r.v8.test.ts's FILLER) */
const FILLER: StoryItem[] = ["Metro rail work: traffic diversions on Poonamallee High Road from Monday", "Chennai Corporation to install 500 new streetlights",
  "Gold rate today in Chennai", "School students visit the planetarium", "New ration shops open in north Chennai", "Book fair to begin at YMCA grounds",
  "Corporation council meeting approves budget", "Free eye camp held for senior citizens", "Marathon to be held on Sunday", "Lake restoration work begins",
  "Vegetable prices fall at Koyambedu market", "IT firms hire more freshers this year", "Health camp for sanitary workers", "New bus routes announced",
  "Chennai airport handles record passengers", "Library gets a digital makeover", "Heritage walk planned for the weekend", "Power utility upgrades substations",
  "Cricket academy opens new nets", "Film festival line-up announced", "Startups pitch at an innovation summit", "Museum extends its hours",
  "Traffic police launch helmet awareness drive", "Swimming pool reopens after repairs", "College fest draws large crowds", "Art exhibition opens at Lalit Kala",
  "Housing board allots flats", "Water body survey completed", "Sapling distribution in parks", "Senior citizens' helpline launched",
  "Port trust records higher cargo", "Science expo for students", "Music season to begin next month", "Ration card camp held", "Park gets a new play area",
  "Bus depot gets solar panels", "Fishing ban period ends", "Yoga camp at the beach", "Road safety week observed", "Toll plaza fee revised"].map((t, i) => story(t, { id: `f${i}`, t: `2026-11-1${i % 9} 08:00` }));
const pickOf = async (q: string, items: StoryItem[]) => {
  const r = await findNews({ q, lang: ta(q) ? "ta" : "en" }, { world, stories: async () => items });
  return { soft: r?.req.soft ?? null, which: r?.req.which ?? null, event: r?.req.event ?? null, pick: r?.picked.pick?.id ?? null, score: r ? Number(r.picked.score.toFixed(3)) : null };
};
const laneOf = (t: string, o: { st?: Record<string, unknown>; stage?: unknown; news?: unknown; incident?: string | null; lastFound?: unknown } = {}) =>
  B.browserLaneV8(t, { stage: (o.stage ?? null) as never, news: (o.news ?? { items: [] }) as never, state: state(o.st), world, listenLang: "en", heardLang: ta(t) ? "ta" : "en",
    incident: o.incident ?? null, v7: true, lastLang: null, lastFound: (o.lastFound ?? null) as never });
type BL = ReturnType<typeof B.browserLaneV8>;
const newsFind = (bl: BL) => bl.lane === "news" && bl.na.kind === "find";
const brief = (bl: BL): unknown => (bl.lane === "news"
  ? { lane: "news", kind: bl.na.kind, soft: bl.na.kind === "find" ? !!(bl.na as { soft?: boolean }).soft : undefined, body: bl.na.kind === "read" ? bl.na.body : undefined,
    why: bl.na.kind === "which" ? bl.na.why : undefined, behind: (bl as { soft?: BL }).soft ? brief((bl as { soft: BL }).soft) : undefined }
  : bl.lane === "rules" ? { lane: "rules", steps: bl.steps } : { lane: bl.lane });

it("soft-reminder-and-one-english-only", async () => {
  const items = [story("Kodungaiyur residents stage empty pot protest over drinking water", { id: "s6", place: "Kodungaiyur", t: "2026-11-16 12:00" }),
    story("AIADMK cadres stage protest against property tax hike in Tambaram", { id: "s17" }),
    story("Tamil Nadu: Fire at IOCL plant in Chennai; worker killed in explosion", { id: "iocl", outlets: ["The Economic Times"], t: "2026-11-18 13:00" }), ...FILLER];
  // a reminder: as the pinned English ("Remind me to open the Royapuram protest at 5 pm"), never a soft find
  log("F4 control", await pickOf("Remind me to read the Kodungaiyur empty pot protest", items), brief(laneOf("Remind me to read the Kodungaiyur empty pot protest")));
  for (const t of ["Kodungaiyur empty pot protest padikka nyabagapaduthunga"]) {
    const bl = laneOf(t), r = await pickOf(t, items);
    log(`F4 '${t}'`, r, brief(bl));
    expect.soft(newsFind(bl) && r.pick != null, `'${t}': lane ${JSON.stringify(brief(bl))}; soft=${r.soft} which=${JSON.stringify(r.which)}; picked ${r.pick} at ${r.score}`).toBe(false);
  }
  // "the X one" over the console's own list (buildState's list: the priority list's rows): a case, never a soft find
  const list = { list: ["INC-1", "INC-2", "INC-3"], listLength: 3 };
  log("F4 control 'open the IOCL fire one' (list showing)", brief(laneOf("open the IOCL fire one", { st: list })));
  for (const t of ["IOCL fire onnu open pannunga", "andha IOCL fire onna open pannunga", "அந்த IOCL தீ விபத்து ஒண்ணைத் திறங்க"]) {
    const bl = laneOf(t, { st: list }), r = await pickOf(t, items);
    log(`F4 list '${t}'`, brief(bl), r);
    expect.soft(newsFind(bl) && r.pick != null, `'${t}' over the console's list: lane ${JSON.stringify(brief(bl))}; the server picks ${r.pick} at ${r.score}`).toBe(false);
  }
});

});

describe("review9b: case-in-focus-runner-vs-console (low)", () => {

const world = { ...WORLD, ...referenceWorld() } as never;
const STATE = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null,
  list: [] as string[], listLength: 0, lastPlace: null, numbers: false, now: Date.parse("2026-11-19T10:00:00+05:30") };
const state = (o: Record<string, unknown> = {}) => ({ ...STATE, ...o }) as never;
const log = (...a: unknown[]) => console.log("PROBE", ...a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))));
// Thunai.tsx newsOnScreen (inside the component) and eval8.live.ts newsOn are not exported: their own source is read, types stripped, and run
// (run vitest from chennai-grievance-portal-main)
function realArrow<T>(file: string, name: string, params: string[], env: unknown[]): T {
  const src = readFileSync(path.join(process.cwd(), file), "utf8");
  const start = src.indexOf(`const ${name} = (`);
  if (start < 0) throw new Error(`${name} not in ${file}`);
  const open = src.indexOf("=> {", start) + 3;
  let depth = 0, i = open;
  for (; i < src.length; i++) { const ch = src[i]; if (ch === "{") depth++; else if (ch === "}" && --depth === 0) break; }
  const js = transformSync(`${src.slice(start, i + 1)};`, { loader: "ts" }).code;
  return new Function(...params, `${js}\nreturn ${name};`)(...env) as T;
}
type NOS = (doc: unknown, cs: unknown) => { items: { id: string; source: string | null; title?: string }[]; incident: string | null; reading: string | null };
const consoleNews = (allNews: unknown[]): NOS =>
  realArrow<NOS>("src/components/collector/app/thunai/Thunai.tsx", "newsOnScreen", ["hostRef", "narration", "narrIndex"], [{ current: { ov: { allNews } } }, { current: [] }, { current: 0 }]);
type BL = ReturnType<typeof B.browserLaneV8>;
const newsFind = (bl: BL) => bl.lane === "news" && bl.na.kind === "find";

it("case-in-focus-runner-vs-console", () => {
  const Bx = B as unknown as Record<string, unknown>;
  if (typeof Bx.caseInFocus !== "function") { log("F5: this build has no caseInFocus (no soft find): not run"); return; }
  const caseInFocus = Bx.caseInFocus as (s: unknown, st: unknown, inc: unknown, said: string) => boolean;
  const onNewsPanel = Bx.onNewsPanel as (s: unknown, st: unknown) => boolean;
  const nos = consoleNews([]);
  const newsOn = realArrow<(c: unknown, s: unknown) => unknown>("src/lib/thunai/v8/eval8.live.ts", "newsOn", [], []);
  for (const [said, panel] of [["Jarvis, open the Kodungaiyur empty pot protest", null], ["open the IOCL plant fire", null], ["open the IOCL plant fire", "incident"]] as const) {
    // the console: no Stage; the map's focus left from an Attention click (buildState: incident = h.inc ?? c.focus?.id), the drawer closed or open
    const cs = state({ panel, incident: "INC-7" });
    // Thunai.tsx handle() (v9 1724-1726): newsOnScreen's incident into caseInFocus
    const on = nos(null, cs);
    const n8 = B.newsLane8(said, { news: on as never, world, lang: "en", lastFound: null, panel: onNewsPanel(null, cs), cases: caseInFocus(null, cs, on.incident, said) } as never);
    const consoleSoft = !!n8 && n8.kind === "find" && !!(n8 as { soft?: boolean }).soft;
    // the runner (eval8.live.ts turn): its newsOn, its incident (a CaseDetail's only), browserLaneV8
    const bl = B.browserLaneV8(said, { stage: null, news: newsOn({ panel: [] }, { stage: null, state: cs }) as never, state: cs, world, listenLang: "en", heardLang: "en", incident: null, v7: true, lastLang: null, lastFound: null });
    const runnerSoft = newsFind(bl) && !!(bl as { na: { soft?: boolean } }).na.soft;
    log(`F5 '${said}' panel=${panel}`, { consoleNewsIncident: on.incident, consoleSoft, runnerSoft });
    expect.soft(runnerSoft, `'${said}' (panel ${panel}, map focus INC-7): the runner ${runnerSoft ? "makes" : "does not make"} the soft find, the console ${consoleSoft ? "makes" : "does not make"} it`).toBe(consoleSoft);
  }
});

});

describe("review9b: panel-after-read-reads-first-story (high)", () => {

const world = { ...WORLD, ...referenceWorld() };
let n = 0;
const story = (title: string, o: Partial<StoryItem> = {}): StoryItem => ({ id: o.id ?? `x${++n}`, title, outlets: ["DT Next"], t: "2026-11-15 10:00", ...o });
/** the console's state as Thunai.tsx buildState gives it: `list` is the current severity tab's incidents */
const consoleState = (o: Record<string, unknown> = {}) => ({ page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones",
  panel: null, incident: null, list: ["INC-101", "INC-102", "INC-103"], lastFilter: null, lastPlace: null, numbers: false, now: Date.now(), ...o }) as never;
const isTa = (t: string) => /[஀-௿]/u.test(t);
const what = (bl: BrowserLane): string => {
  if (bl.lane === "news") {
    const na = bl.na;
    const soft = (bl as { soft?: BrowserLane }).soft;
    if (na.kind === "read") return `news read ${"id" in na.body ? na.body.id : `incident ${na.body.incident}`}`;
    if (na.kind === "find") return `news find${(na as { soft?: boolean }).soft ? " soft" : ""} q="${na.body.find.q}"${na.body.find.exclude?.length ? ` exclude=${na.body.find.exclude.join(",")}` : ""}${soft ? ` (way back: ${what(soft)})` : ""}`;
    if (na.kind === "which") return `news which ${na.why}`;
    return `news ${na.kind}`;
  }
  if (bl.lane === "rules") return `rules ${bl.steps.map((s) => s.a).join("+")}`;
  if (bl.lane === "stage") return `stage ${bl.cmd.op}`;
  return bl.lane;
};
const readId = (bl: BrowserLane): string | null => (bl.lane === "news" && bl.na.kind === "read" && "id" in bl.na.body ? bl.na.body.id : null);

// Thunai.tsx newsOnScreen lives inside the React component, so it is mirrored here, by the panel clause THIS checkout's Thunai.tsx has
const THUNAI = fs.readFileSync(path.join(process.cwd(), "src/components/collector/app/thunai/Thunai.tsx"), "utf8");
const V9_PANEL = 'if ((!doc || doc.slots?.web) && cs.panel === "news") {';
const V8_PANEL = 'if (!doc && cs.panel === "news") {';
const PANEL_UNDER_READ = THUNAI.includes(V9_PANEL);
type Doc = NonNullable<ReturnType<typeof newsScreen>>;
type Row = { id: string; source: string | null; title: string };
const newsOnScreenMirror = (doc: Doc | null, cs: { panel: string | null; incident: string | null }, panel: Row[]): NewsOnScreen => {
  const web = !!(doc?.slots as { web?: unknown } | undefined)?.web;
  // (v10's fix, mirrored as Thunai.tsx newsOnScreen now has it: under a read screen, the story read is `reading` (its slot) and `afterRead` is set,
  // so "this story" is the one read and never the panel's first)
  if ((!doc || (PANEL_UNDER_READ && web)) && cs.panel === "news") return { items: panel.map((x) => ({ id: x.id, source: x.source, title: x.title })), incident: null,
    reading: web ? ((doc?.slots as { read?: string } | undefined)?.read ?? null) : null, afterRead: web };
  const nr = doc?.blocks.find((b) => b.kind === "NewsReader");
  const cd = doc?.blocks.find((b) => b.kind === "CaseDetail");
  // (Thunai's `reading` here is the Stage's narration key: only read when items is non-empty, and items is [] under a read screen)
  return { items: nr?.kind === "NewsReader" && !web ? nr.items.map((x) => ({ id: x.id, source: x.source, title: x.title })) : [], incident: cd?.kind === "CaseDetail" ? cd.incident.id : doc ? null : cs.incident, reading: null };
};
/** the console's news panel (news9.v8.test.ts PANEL: the dry-run store's headlines), as newsOnScreen lists it */
const PANEL: Row[] = ([
  ["p1", "Aquaan storm caused sea turbulence at Chennai Kasimedu fishing harbor", "Dinamalar"], ["p2", "GCC issues 124 de-occupation notices for coastal buildings", "The Hindu"],
  ["p3", "Rise in balloon prices; Plan to hold hunger strike in Chennai: Decorators interview", "The Indian Express"],
  ["p4", "Bid to smuggle drugs into Puzhal jail, two held", "The New Indian Express · The Times of India"],
  ["p5", "Unauthorised Buildings Major Enforcement Challenge in Chennai", "Deccan Chronicle"],
  ["p6", "Construction Ban In Chennai's Pallikaranai: HC Gives Liberty To Petitioners To Approach SC", "ETV Bharat · Hindu Tamil Thisai"],
  ["p7", "Seizure of drugs worth Rs. 140 crore near Madhavaram – 2 people arrested", "Maalaimalar"],
  ["p8", "Tamil Nadu: Fire at IOCL plant in Chennai; worker killed in explosion", "The Economic Times"],
  ["p9", "Health Department and Rotary Club of Madras partner to take forward HPV vaccination", "The Hindu"],
  ["p10", "Chennai Corporation opens free public toilets at 853 locations", "Daily Thanthi"],
  ["p11", "Pharmacy owner, two chefs arrested for supplying narcotic drugs in Chennai", "The Times of India"]
] as const).map(([id, title, source]) => ({ id, title, source }));

it("panel-after-read-reads-first-story", async () => {
  console.log(`[p1] Thunai.tsx keeps the panel under Jarvis's read screen: ${PANEL_UNDER_READ}; v8 clause present: ${THUNAI.includes(V8_PANEL)}`);
  expect(PANEL_UNDER_READ !== THUNAI.includes(V8_PANEL), "exactly one of the two panel clauses is in Thunai.tsx").toBe(true);
  const csPlain = { panel: "news", incident: null };
  // the read screen newsTurn's draw() puts up for a story (newsScreen: slots.web, its sources list "web-1", "web-2")
  const readScreen = (p: Row) => newsScreen({ lang: "en", kind: "read", outlet: (p.source ?? "").split(" · ")[0], en: [`${p.source} reports on it.`], ta: ["செய்தி."],
    links: [{ outlet: (p.source ?? "").split(" · ")[0], title: p.title, url: `https://example.invalid/${p.id}`, publishedAt: null },
      { outlet: "The Hindu", title: "Another outlet's report", url: "https://example.invalid/related", publishedAt: null }] })!;
  // the premises: on the open panel with no Stage, "read the fifth one" reads p5, and "open the IOCL fire news" finds p8
  const base = { world, listenLang: "en" as const, heardLang: "en" as const, incident: null, v7: true, lastLang: null, lastFound: null };
  const premise5 = browserLaneV8("read the fifth one", { ...base, stage: null, news: newsOnScreenMirror(null, csPlain, PANEL), state: consoleState({ panel: "news" }) });
  const premiseFind = browserLaneV8("open the IOCL fire news", { ...base, stage: null, news: newsOnScreenMirror(null, csPlain, PANEL), state: consoleState({ panel: "news" }) });
  const found = premiseFind.lane === "news" && premiseFind.na.kind === "find"
    ? await foundStory(premiseFind.na.body.find, { world, stories: async () => PANEL.map((p) => story(p.title, { id: p.id, outlets: (p.source ?? "").split(" · ") })) }) : null;
  console.log(`[p1] premise "read the fifth one": ${what(premise5)}; premise "open the IOCL fire news": ${what(premiseFind)} -> server pick ${found?.pick?.id ?? "none"}`);
  const SAID = ["what are the other papers saying?", "read the full article", "what does the article say?", "read the report", "tell me about this news", "explain this news",
    "மற்ற பத்திரிகைகள் என்ன சொல்றாங்க?", "matha papers enna solraanga?", "andha news ah padinga", "இந்தச் செய்தியைப் பற்றி சொல்லுங்க"];
  // A: p5 read by its position (newsTurn leaves lastFound null after a read); B: p8 found by "open the IOCL fire news" (lastFound set by the "found" event)
  const scenes: { name: string; just: Row; lastFound: LastFound | null }[] = [
    { name: "after reading p5 by its position", just: PANEL[4], lastFound: null },
    { name: "after the find 'open the IOCL fire news' (p8)", just: PANEL[7], lastFound: { id: PANEL[7].id, title: PANEL[7].title, q: "open the IOCL fire news", other: null } }
  ];
  const rows: { scene: string; said: string; path: string; did: string; wrong: boolean }[] = [];
  for (const sc of scenes) {
    const doc = readScreen(sc.just);
    expect((doc.slots as { web?: unknown }).web).toBe(true);
    const news = newsOnScreenMirror(doc, csPlain, PANEL);
    for (const said of SAID) {
      const ctx = { stage: doc as never, news, state: consoleState({ panel: "news" }), world, listenLang: "en" as const, heardLang: isTa(said) ? ("ta" as const) : ("en" as const), incident: null, v7: true };
      // Thunai.tsx handle(): newsLane8, refLane8, then the v6 newsAsk lane, all on newsOnScreen (browserLaneV8 is that order)
      const v8 = browserLaneV8(said, { ...ctx, lastLang: null, lastFound: sc.lastFound });
      const id8 = readId(v8);
      rows.push({ scene: sc.name, said, path: "lanes", did: what(v8), wrong: id8 !== null && id8 !== sc.just.id });
      // the rollback switch (NEXT_PUBLIC_JARVIS_UNDERSTAND=v7): Thunai.tsx's v6 newsAsk lane is given the same newsOnScreen
      const v7 = browserLaneV7(said, ctx);
      const id7 = readId(v7);
      rows.push({ scene: sc.name, said, path: "rollback v7", did: what(v7), wrong: id7 !== null && id7 !== sc.just.id });
    }
  }
  for (const r of rows) console.log(`[p1] ${r.wrong ? "WRONG" : "ok   "} ${r.scene} | ${r.path} | "${r.said}" -> ${r.did}`);
  // right: a follow-up about "the article", "this news" or "the other papers" is about the story just read, or asks which (v8): never another story
  expect(rows.filter((r) => r.wrong).map((r) => `${r.scene} | ${r.path} | "${r.said}" -> ${r.did}`)).toEqual([]);
});


});

describe("review9b: soft-naming-word-is-a-place (medium)", () => {

const world = { ...WORLD, ...referenceWorld() };
const PLACES = placesOf(world);
let n = 0;
const story = (title: string, o: Partial<StoryItem> = {}): StoryItem => ({ id: o.id ?? `x${++n}`, title, outlets: ["DT Next"], t: "2026-11-15 10:00", ...o });
/** news9r.v8.test.ts's 40 stories about nothing asked here, so the word weights are a store's */
const FILLER: StoryItem[] = ["Metro rail work: traffic diversions on Poonamallee High Road from Monday", "Chennai Corporation to install 500 new streetlights",
  "Gold rate today in Chennai", "School students visit the planetarium", "New ration shops open in north Chennai", "Book fair to begin at YMCA grounds",
  "Corporation council meeting approves budget", "Free eye camp held for senior citizens", "Marathon to be held on Sunday", "Lake restoration work begins",
  "Vegetable prices fall at Koyambedu market", "IT firms hire more freshers this year", "Health camp for sanitary workers", "New bus routes announced",
  "Chennai airport handles record passengers", "Library gets a digital makeover", "Heritage walk planned for the weekend", "Power utility upgrades substations",
  "Cricket academy opens new nets", "Film festival line-up announced", "Startups pitch at an innovation summit", "Museum extends its hours",
  "Traffic police launch helmet awareness drive", "Swimming pool reopens after repairs", "College fest draws large crowds", "Art exhibition opens at Lalit Kala",
  "Housing board allots flats", "Water body survey completed", "Sapling distribution in parks", "Senior citizens' helpline launched",
  "Port trust records higher cargo", "Science expo for students", "Music season to begin next month", "Ration card camp held", "Park gets a new play area",
  "Bus depot gets solar panels", "Fishing ban period ends", "Yoga camp at the beach", "Road safety week observed", "Toll plaza fee revised"].map((t, i) => story(t, { id: `f${i}`, t: `2026-11-1${i % 9} 08:00` }));
const consoleState = (o: Record<string, unknown> = {}) => ({ page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones",
  panel: null, incident: null, list: ["INC-101", "INC-102", "INC-103"], lastFilter: null, lastPlace: null, numbers: false, now: Date.now(), ...o }) as never;
const isTa = (t: string) => /[஀-௿]/u.test(t);
const what = (bl: BrowserLane): string => {
  if (bl.lane === "news") {
    const na = bl.na;
    const soft = (bl as { soft?: BrowserLane }).soft;
    if (na.kind === "read") return `news read ${"id" in na.body ? na.body.id : `incident ${na.body.incident}`}`;
    if (na.kind === "find") return `news find${(na as { soft?: boolean }).soft ? " soft" : ""} q="${na.body.find.q}"${na.body.find.exclude?.length ? ` exclude=${na.body.find.exclude.join(",")}` : ""}${soft ? ` (way back: ${what(soft)})` : ""}`;
    if (na.kind === "which") return `news which ${na.why}`;
    return `news ${na.kind}`;
  }
  if (bl.lane === "rules") return `rules ${bl.steps.map((s) => s.a).join("+")}`;
  if (bl.lane === "stage") return `stage ${bl.cmd.op}`;
  return bl.lane;
};

it("soft-naming-word-is-a-place", async () => {
  console.log(`[p2] placesOf(world) has: ${PLACES.filter((p) => /^pattinap|^kodung|^adyar$/i.test(p)).join(", ") || "(none of them)"}`);
  console.log(`[p2] placeWord: ${["pattinapakkam", "pattinapakam", "pattinappakkam", "kodungaiyur", "kodungayur", "adyar"].map((w) => `${w}=${placeWord(w)}`).join(" ")}`);
  const hut = story("Fire breaks out in hut at Pattinapakkam; no casualties", { id: "hut", t: "2026-11-18 10:00" });
  const kod = story("Kodungaiyur residents stage protest over garbage dump", { id: "kod", t: "2026-11-18 10:00" });
  // the dry-run store's own Kodungaiyur story (news9.v8.test.ts STORE s6)
  const kodReal = story("Kodungaiyur residents stage empty pot protest over drinking water", { id: "s6", place: "Kodungaiyur", t: "2026-11-16 12:00" });
  const ady = story("Fire breaks out at Adyar godown; no casualties", { id: "ady", t: "2026-11-17 10:00" });
  const MORE = [ady, story("Bus conductor assaulted in Tambaram, two held", { id: "b1" }), story("Kilambakkam bus terminus gets new platforms", { id: "b2" }),
    story("MTC bus overturns near Koyambedu, 12 hurt", { id: "b3" })];
  const CASES: { q: string; why: string; items: StoryItem[] }[] = [
    { q: "open the Pattinapakkam bus fire", why: "(a) the week's only Pattinapakkam fire is a hut fire: no 'bus', the naming word", items: [hut, ...FILLER] },
    { q: "open the Pattinapakkam bus fire", why: "(a2) the same in a bigger week: an Adyar fire and three more bus headlines", items: [hut, ...MORE, ...FILLER] },
    { q: "open the Pattinapakkam fire", why: "(b) a place and an event, as 'open the Adyar fire'", items: [hut, ...FILLER] },
    { q: "பட்டினப்பாக்கம் தீ விபத்தைத் திறங்க", why: "(b-ta) the same in Tamil", items: [hut, ...FILLER] },
    { q: "open the Kodungayur protest", why: "(c) Whisper's Kodungaiyur and an event, as 'open the Kodungaiyur protest'", items: [kod, ...FILLER] },
    { q: "open the Kodungayur protest", why: "(c2) the same against the dry-run store's own Kodungaiyur story", items: [kodReal, ...FILLER] },
    { q: "open the Adyar fire", why: "control: a place placeWord knows, and an event", items: [ady, ...FILLER] },
    { q: "open the Kodungaiyur protest", why: "control: the place as the console spells it", items: [kod, ...FILLER] }
  ];
  const rows: { q: string; why: string; pick: string | null; score: number | null; which: string[] | null }[] = [];
  for (const c of CASES) {
    const req = newsRequest(c.q, {});
    // no Stage, no panel, no case in focus: Thunai.tsx handle()'s lanes
    const bl = browserLaneV8(c.q, { stage: null, news: { items: [], incident: null, reading: null }, state: consoleState(), world, listenLang: "en", heardLang: isTa(c.q) ? "ta" : "en", incident: null, v7: true, lastLang: null, lastFound: null });
    // what the server does with the body the browser sends (only the news lane sends one; a soft find with a pick is read aloud)
    const r = bl.lane === "news" && bl.na.kind === "find" ? await findNews(bl.na.body.find, { world, stories: async () => c.items }) : null;
    const top = req ? rankStories(req, c.items, { places: PLACES }).slice(0, 2).map((x) => `${x.item.id}:${x.score.toFixed(3)}`).join(" ") : "";
    rows.push({ q: c.q, why: c.why, pick: r?.picked.pick?.id ?? null, score: r?.picked.pick ? r.picked.score : null, which: req?.which ?? null });
    console.log(`[p2] "${c.q}" ${c.why} | soft=${req?.soft ?? false} event=${JSON.stringify(req?.event ?? null)} which=${JSON.stringify(req?.which ?? null)} ranked: ${top} | browser: ${what(bl)} | server pick: ${r?.picked.pick ? `${r.picked.pick.id} (${r.picked.score.toFixed(3)}) "${r.picked.pick.title}"` : "none"}`);
  }
  // right: none of these reads a story (a place is no naming word; the hut fire has no "bus"); the console's lanes take them, as in v8
  expect(rows.filter((r) => r.pick).map((r) => `${r.why.split(" ")[0]} "${r.q}" -> ${r.pick} (${r.score?.toFixed(3)}) which=${JSON.stringify(r.which)}`)).toEqual([]);
});


});

describe("review9b: soft-find-skips-privacy-refusal (medium)", () => {

const world = { ...WORLD, ...referenceWorld() };
let n = 0;
const story = (title: string, o: Partial<StoryItem> = {}): StoryItem => ({ id: o.id ?? `x${++n}`, title, outlets: ["DT Next"], t: "2026-11-15 10:00", ...o });
const FILLER: StoryItem[] = ["Metro rail work: traffic diversions on Poonamallee High Road from Monday", "Chennai Corporation to install 500 new streetlights",
  "Gold rate today in Chennai", "School students visit the planetarium", "New ration shops open in north Chennai", "Book fair to begin at YMCA grounds",
  "Corporation council meeting approves budget", "Free eye camp held for senior citizens", "Marathon to be held on Sunday", "Lake restoration work begins",
  "Vegetable prices fall at Koyambedu market", "IT firms hire more freshers this year", "Health camp for sanitary workers", "New bus routes announced",
  "Chennai airport handles record passengers", "Library gets a digital makeover", "Heritage walk planned for the weekend", "Power utility upgrades substations",
  "Cricket academy opens new nets", "Film festival line-up announced", "Startups pitch at an innovation summit", "Museum extends its hours",
  "Traffic police launch helmet awareness drive", "Swimming pool reopens after repairs", "College fest draws large crowds", "Art exhibition opens at Lalit Kala",
  "Housing board allots flats", "Water body survey completed", "Sapling distribution in parks", "Senior citizens' helpline launched",
  "Port trust records higher cargo", "Science expo for students", "Music season to begin next month", "Ration card camp held", "Park gets a new play area",
  "Bus depot gets solar panels", "Fishing ban period ends", "Yoga camp at the beach", "Road safety week observed", "Toll plaza fee revised"].map((t, i) => story(t, { id: `f${i}`, t: `2026-11-1${i % 9} 08:00` }));
const consoleState = (o: Record<string, unknown> = {}) => ({ page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones",
  panel: null, incident: null, list: ["INC-101", "INC-102", "INC-103"], lastFilter: null, lastPlace: null, numbers: false, now: Date.now(), ...o }) as never;
const what = (bl: BrowserLane): string => {
  if (bl.lane === "news") {
    const na = bl.na;
    const soft = (bl as { soft?: BrowserLane }).soft;
    if (na.kind === "read") return `news read ${"id" in na.body ? na.body.id : `incident ${na.body.incident}`}`;
    if (na.kind === "find") return `news find${(na as { soft?: boolean }).soft ? " soft" : ""} q="${na.body.find.q}"${na.body.find.exclude?.length ? ` exclude=${na.body.find.exclude.join(",")}` : ""}${soft ? ` (way back: ${what(soft)})` : ""}`;
    if (na.kind === "which") return `news which ${na.why}`;
    return `news ${na.kind}`;
  }
  if (bl.lane === "rules") return `rules ${bl.steps.map((s) => s.a).join("+")}`;
  if (bl.lane === "stage") return `stage ${bl.cmd.op}`;
  return bl.lane;
};

it("soft-find-skips-privacy-refusal", async () => {
  const enn = story("Ennore murder: victim identified as fisherman, three held", { id: "enn", t: "2026-11-18 10:00" });
  const kds = story("Kodungaiyur suicide: victim's family alleges harassment by loan app agents", { id: "kds", t: "2026-11-18 09:00" });
  const ITEMS = [enn, kds, ...FILLER];
  const body = (t: string) => `${t}. Police said the victim, whose name, age and home address the report prints in full, was found on Tuesday night near the fishing harbour. ` +
    "Three men were held on Wednesday and produced before a magistrate. Neighbours told the paper the family had complained of threats a week earlier.";
  const DOCS: Record<string, StoredDoc> = Object.fromEntries([enn, kds].map((s) => [s.id, { id: s.id, url: `https://www.dtnext.in/news/chennai/${s.id}`, title: s.title, publisher: "DT Next", publisher_domain: "dtnext.in", body: body(s.title), t: "2026-11-18 10:00" }]));
  const RUNGS: Rung[] = [{ provider: "groq", model: "stub-model" } as Rung];
  // the aide's model, stubbed: it records the call it would have made (no network)
  const writer = (calls: RungCall[]): OpenRung => async (rung, c, onText) => {
    calls.push(c);
    onText(["GAP: none", "DT Next reports the victim's details. [F1]", ""].join(String.fromCharCode(10)));
    return { provider: rung.provider, model: rung.model, tokens: 10, firstMs: 1, ms: 2, stop: null };
  };
  const rows: { q: string; priv: boolean; round: string; lane: string; events: string[]; modelCalls: number; question: boolean; article: boolean }[] = [];
  for (const q of ["tell me about the Ennore murder victim's name", "Jarvis, tell me about the Ennore murder victim's address", "read the Kodungaiyur suicide victim's details"]) {
    const bl = browserLaneV8(q, { stage: null, news: { items: [], incident: null, reading: null }, state: consoleState(), world, listenLang: "en", heardLang: "en", incident: null, v7: true, lastLang: null, lastFound: null });
    // where the sentence goes otherwise: the server round's rules (round.ts: routeByRules, before any model)
    const rt = routeByRules(q, world as never, false) as { lane: string; why?: string };
    const row = { q, priv: asksPrivate(q), round: `${rt.lane}${rt.why ? `/${rt.why}` : ""}`, lane: what(bl), events: [] as string[], modelCalls: 0, question: false, article: false };
    if (bl.lane === "news" && (bl.na.kind === "find" || bl.na.kind === "read")) {
      // what Thunai.tsx newsTurn POSTs, parsed as the route parses it, through newsEvents with the route's finder and the real news aide (its model stubbed)
      const calls: RungCall[] = [];
      const asked = NewsBody.parse(bl.na.kind === "read" ? { ...bl.na.body, ask: { q, lang: "en" } } : bl.na.body);
      for await (const e of newsEvents(asked, { find: (f: Parameters<typeof foundStory>[0]) => foundStory(f, { world, stories: async () => ITEMS }), loadDoc: async (id: string) => DOCS[id] ?? null, related: false,
        telemetry: () => undefined, aide: newsAide(world, { user: "probe", write: { open: writer(calls), rungs: () => RUNGS } }) } as never)) row.events.push(e.type === "found" ? `found:${(e as { id: string }).id}` : e.type);
      row.modelCalls = calls.length;
      row.question = calls.some((c) => c.prompt.includes(q.replace(/^Jarvis, /, "")));
      row.article = calls.some((c) => /whose name, age and home address/.test(c.prompt));
    }
    rows.push(row);
    console.log(`[p3] "${q}" asksPrivate=${row.priv}; the round's rules: ${row.round} | browser: ${row.lane} | /news events: ${row.events.join(", ") || "(nothing sent)"}; model calls: ${row.modelCalls}; the sentence in the prompt: ${row.question}; the article in the prompt: ${row.article}`);
  }
  // right: what the console refuses in code for privacy (asksPrivate, before any model) is not found, read or handed to a model by the news lane
  expect(rows.filter((r) => r.priv && (r.events.some((e) => e.startsWith("found")) || r.modelCalls > 0)).map((r) => `"${r.q}" -> ${r.events.join(",")}; model calls ${r.modelCalls}`)).toEqual([]);
});


});

describe("review9b: runner-misses-console-focus (low)", () => {

const world = { ...WORLD, ...referenceWorld() };
let n = 0;
const story = (title: string, o: Partial<StoryItem> = {}): StoryItem => ({ id: o.id ?? `x${++n}`, title, outlets: ["DT Next"], t: "2026-11-15 10:00", ...o });
const FILLER: StoryItem[] = ["Metro rail work: traffic diversions on Poonamallee High Road from Monday", "Chennai Corporation to install 500 new streetlights",
  "Gold rate today in Chennai", "School students visit the planetarium", "New ration shops open in north Chennai", "Book fair to begin at YMCA grounds",
  "Corporation council meeting approves budget", "Free eye camp held for senior citizens", "Marathon to be held on Sunday", "Lake restoration work begins",
  "Vegetable prices fall at Koyambedu market", "IT firms hire more freshers this year", "Health camp for sanitary workers", "New bus routes announced",
  "Chennai airport handles record passengers", "Library gets a digital makeover", "Heritage walk planned for the weekend", "Power utility upgrades substations",
  "Cricket academy opens new nets", "Film festival line-up announced", "Startups pitch at an innovation summit", "Museum extends its hours",
  "Traffic police launch helmet awareness drive", "Swimming pool reopens after repairs", "College fest draws large crowds", "Art exhibition opens at Lalit Kala",
  "Housing board allots flats", "Water body survey completed", "Sapling distribution in parks", "Senior citizens' helpline launched",
  "Port trust records higher cargo", "Science expo for students", "Music season to begin next month", "Ration card camp held", "Park gets a new play area",
  "Bus depot gets solar panels", "Fishing ban period ends", "Yoga camp at the beach", "Road safety week observed", "Toll plaza fee revised"].map((t, i) => story(t, { id: `f${i}`, t: `2026-11-1${i % 9} 08:00` }));
const what = (bl: BrowserLane): string => {
  if (bl.lane === "news") {
    const na = bl.na;
    const soft = (bl as { soft?: BrowserLane }).soft;
    if (na.kind === "read") return `news read ${"id" in na.body ? na.body.id : `incident ${na.body.incident}`}`;
    if (na.kind === "find") return `news find${(na as { soft?: boolean }).soft ? " soft" : ""} q="${na.body.find.q}"${na.body.find.exclude?.length ? ` exclude=${na.body.find.exclude.join(",")}` : ""}${soft ? ` (way back: ${what(soft)})` : ""}`;
    if (na.kind === "which") return `news which ${na.why}`;
    return `news ${na.kind}`;
  }
  if (bl.lane === "rules") return `rules ${bl.steps.map((s) => s.a).join("+")}`;
  if (bl.lane === "stage") return `stage ${bl.cmd.op}`;
  return bl.lane;
};

it("runner-misses-console-focus", async () => {
  // the runner's fixed screen state, read from its own source (eval8.live.ts sets up its models on import, so it is not imported)
  const RUNNER = fs.readFileSync(path.join(process.cwd(), "src/lib/thunai/v8/eval8.live.ts"), "utf8");
  const m = /const STATE: ScreenState = ([{][^;]*?[}]) as unknown as ScreenState;/.exec(RUNNER);
  expect(m, "the runner's STATE literal").toBeTruthy();
  const RUNNER_STATE = new Function(`return (${m![1]});`)() as Record<string, unknown>;
  // the console's buildState on the same overview: no listLength, its `list` the severity tab's incidents; no incident open or focused
  const { listLength: _drop, ...rest } = RUNNER_STATE;
  const CONSOLE_STATE = { ...rest, list: ["INC-101", "INC-102", "INC-103"], lastFilter: null, now: Date.now() };
  const iocl = story("Tamil Nadu: Fire at IOCL plant in Chennai; worker killed in explosion", { id: "iocl", outlets: ["The Economic Times"], place: "Manali", t: "2026-11-18 13:00" });
  const STORE = [iocl, ...FILLER];
  // no Stage, no panel: the runner's newsOn and Thunai.tsx newsOnScreen both give no items and no incident
  const off = { items: [], incident: null, reading: null };
  const finalLane = async (q: string, state: unknown) => {
    let bl = browserLaneV8(q, { stage: null, news: off, state: state as never, world, listenLang: "en", heardLang: "en", incident: null, v7: true, lastLang: null, lastFound: null });
    // the soft find's way back, as eval8.live.ts turn() and Thunai.tsx handle() take it (a pick is read; nothing close, the lane behind)
    const soft = (bl as { soft?: BrowserLane }).soft;
    if (bl.lane === "news" && soft && bl.na.kind === "find") {
      const f = await foundStory(bl.na.body.find, { world, stories: async () => STORE }).catch(() => null);
      if (f?.pick) return `news soft read ${f.pick.id}`;
      bl = soft;
    }
    return what(bl);
  };
  console.log(`[p4] runner STATE: ${JSON.stringify(RUNNER_STATE)}`);
  const rows: { q: string; runner: string; console: string }[] = [];
  for (const q of ["Jarvis, open the IOCL fire one", "open the IOCL fire one", "read the I O C L fire, that one at Manali", "open the IOCL fire"]) {
    rows.push({ q, runner: await finalLane(q, RUNNER_STATE), console: await finalLane(q, CONSOLE_STATE) });
  }
  for (const r of rows) console.log(`[p4] "${r.q}" | runner: ${r.runner} | console: ${r.console}`);
  // right: the runner does what the console does
  expect(rows.filter((r) => r.runner !== r.console).map((r) => `"${r.q}": runner ${r.runner} | console ${r.console}`)).toEqual([]);
});


});
