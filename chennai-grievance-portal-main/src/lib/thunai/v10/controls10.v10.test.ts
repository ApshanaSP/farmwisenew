/**
 * v10: the whole dashboard by voice (docs/jarvis/JARVIS_V10.md 4.7.3: "a test that fails when a control has no voice path"). Every control of the
 * inventory (controls10.ids.json, from docs/jarvis/v10-research/60-controls-inventory.json) has a registry entry with names in English, Tamil and
 * Tanglish and a level, or an explicit skip with its reason; every entry's first name in each language, said in a plain command frame, comes back
 * to that entry (or to a question back that names it); and the matcher's rules (5.1): act at 0.8 with a 0.1 margin, ask back by region, never a
 * silent pick, a "never" control refused, a question about the data left to the other lanes.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import type { ScreenState } from "../types";
import { ACTION_LEVEL } from "../reach";
import { WORLD } from "../fixture";
import { controlCommand10, coverage10, decide10, stepsLevel, studioLetsThrough, words10, type Control10, type ControlCtx10 } from "./controls10";
import { CONTROLS10, REGIONS10, SKIP10 } from "./controls10.data";
import { v10Front, type BrowserCtx10 } from "./browser10";

const IDS = JSON.parse(readFileSync(path.join(__dirname, "controls10.ids.json"), "utf8")) as { screens: string[]; controls: [string, number, string, string, string][] };
const ids = IDS.controls.map((r) => r[0]);
const riskOf = new Map(IDS.controls.map((r) => [r[0], r[2]]));
const base: ScreenState = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null,
  incident: null, list: [], lastFilter: null, lastPlace: null, numbers: false, now: 0 };
const ctx = (o: Partial<ScreenState> = {}, x: Partial<ControlCtx10> = {}): ControlCtx10 => ({ state: { ...base, ...o }, lang: "en", ...x });
/** the state an entry lives in: its page, its window, the Stage */
const home = (e: Control10): ControlCtx10 => {
  const w = e.when ?? {};
  const page = Array.isArray(w.page) ? w.page[0] : w.page;
  const panel = Array.isArray(w.panel) ? w.panel[0] : w.panel;
  return ctx({ ...(page ? { page } : {}), ...(panel ? { panel } : {}) }, w.stage ? { stage: true } : {});
};
const isMap = (e: Control10) => "map" in e.act;
const isPress = (e: Control10) => "press" in e.act;

describe("v10 coverage: every control of the console has a voice path, or a reason it has none", () => {
  it("every inventory id has a registry entry or an explicit skip with a reason", () => {
    const cov = coverage10(ids);
    // read out for the report: a dedicated step, a press, the map lane's, refused (never), skipped with a reason
    console.log(`[controls10] ${cov.total} controls: ${cov.steps} by steps, ${cov.press} by a press, ${cov.map} the map lane's, ${cov.never} never (the Collector's tap), ${cov.skipped} skipped with a reason, ${cov.missing.length} missing`);
    expect(cov.missing, `controls with no voice path: add them to controls10.data.ts with en/ta/tl names and a level, or to SKIP10 with the reason`).toEqual([]);
  });
  it("no id is both an entry and a skip, and every skip and entry is an inventory id (or a named variant of one, id:variant)", () => {
    const known = new Set(ids);
    for (const e of CONTROLS10) expect(known.has(e.id.split(":")[0]), e.id).toBe(true);
    for (const id of Object.keys(SKIP10)) {
      expect(known.has(id), id).toBe(true);
      expect(CONTROLS10.some((e) => e.id === id), `${id} is both an entry and a skip`).toBe(false);
      expect(SKIP10[id].length, id).toBeGreaterThan(10);
    }
    expect(new Set(CONTROLS10.map((e) => e.id)).size).toBe(CONTROLS10.length);
  });
  it("every entry has a name in each of en, ta (Tamil script) and tl (Latin), a region and a level", () => {
    for (const e of CONTROLS10) {
      expect(e.en.length && e.ta.length && e.tl.length, e.id).toBeTruthy();
      expect(e.ta.some((n) => /[஀-௿]/u.test(n)), `${e.id}: a Tamil name in Tamil script`).toBe(true);
      expect(e.tl.every((n) => !/[஀-௿]/u.test(n)), `${e.id}: Tanglish is in Latin letters`).toBe(true);
      expect(REGIONS10[e.region], `${e.id}: region ${e.region}`).toBeTruthy();
      expect(["A", "B", "C", "never"]).toContain(e.level);
    }
  });
  it("an entry's level is the level risk.ts runs its steps at (reach.ts ACTION_LEVEL agrees)", () => {
    for (const e of CONTROLS10) {
      if (!("steps" in e.act)) continue;
      expect(e.level, e.id).toBe(stepsLevel(e.act.steps));
      for (const s of e.act.steps) expect(["A", "read"].includes(ACTION_LEVEL[s.a]) ? "A" : ACTION_LEVEL[s.a], `${e.id} ${s.a}`).toBe(stepsLevel([s]));
    }
  });
  it("a control that writes is never level A by a press: never, B (a spoken yes first) or the map lane's (typing into its box writes nothing)", () => {
    // a family the inventory lists as one control: the part that writes is its own entry, at B
    const READS = { "card.interjection": "Tell me only reads it out; 'Not about this' (a preference kept) is card.interjection:notabout, at B",
      "card.interjection:later": "a snooze: Jarvis brings it up later; nothing is kept that the Collector would undo" } as Record<string, string>;
    for (const e of CONTROLS10) {
      const risk = riskOf.get(e.id.split(":")[0]);
      if (risk !== "write" || !isPress(e) || ("press" in e.act && e.act.input === "text") || READS[e.id]) continue;
      expect(["B", "never"], `${e.id} writes`).toContain(e.level);
    }
  });
  it("sends, approvals, deletes, sign-outs and pipeline runs are never", () => {
    for (const id of ["account.signOut", "sec.signOutOthers", "sources.run", "sources.pauseResume", "ta.approve", "tray.approve", "tray.discard", "task.verify",
      "workspace.delete.confirm", "ds.delete.yes", "conn.run", "askmap.sendDialog.approve", "plan.approveAll"]) {
      expect(CONTROLS10.find((e) => e.id === id)?.level, id).toBe("never");
    }
  });
});

describe("v10 round trip: an entry's first name in each language, in a plain command frame, comes back to that entry", () => {
  // a move by name (a page, the period, a panel, the theme) is said "open the X"; any other control is pressed ("click X", "X அழுத்துங்க")
  const NAV = ["page", "period", "theme", "mapMode", "panel"];
  const frames = (e: Control10) => {
    const press = !("steps" in e.act && e.act.steps.every((s) => NAV.includes(s.a)));
    return {
      en: press ? `click ${e.en[0]}` : `open the ${e.en[0]}`,
      ta: press ? `${e.ta[0]} அழுத்துங்க` : `${e.ta[0]} திறங்க`,
      tl: press ? `${e.tl[0]} click pannunga` : `${e.tl[0]} kaattunga`
    };
  };
  const misses: string[] = [];
  for (const e of CONTROLS10) {
    for (const [lang, said] of Object.entries(frames(e))) {
      const d = decide10(said, home(e), true);
      const ok = !!d && (d.which ? d.which.some((m) => m.id === e.id) : d.top.id === e.id || JSON.stringify(d.top.e.act) === JSON.stringify(e.act));
      if (!ok) misses.push(`${e.id} [${lang}] "${said}" -> ${d ? (d.which ? `which ${d.which.map((m) => m.id).join(",")}` : d.top.id) : "nothing"}`);
    }
  }
  it("every entry is reached in English, Tamil and Tanglish", () => {
    expect(misses).toEqual([]);
  });
});

describe("v10 matching: names, frames, the margin and the question back", () => {
  it("normalises Tamil-letter loanwords, Tanglish clitics and case endings alike on both sides", () => {
    expect(words10("டார்க் மோட் போடு")).toEqual(["dark", "mode", "போடு"]);
    expect(words10("மேப்பில் லேயர்களை")).toEqual(["map", "layer"]);
    expect(controlCommand10("trends page-ku po", ctx())?.steps).toEqual([{ a: "page", page: "trends" }]);
    expect(controlCommand10("போக்குகள் பக்கத்துக்குப் போங்க", ctx())?.steps).toEqual([{ a: "page", page: "trends" }]);
    expect(controlCommand10("dark mode podunga", ctx())?.steps).toEqual([{ a: "theme", theme: "dark" }]);
  });
  it("a page, the period, a panel and the theme by their names, as the rules do them", () => {
    expect(controlCommand10("go to the trends page", ctx())?.steps).toEqual([{ a: "page", page: "trends" }]);
    expect(controlCommand10("make it weekly", ctx())?.steps).toEqual([{ a: "period", period: "weekly" }]);
    expect(controlCommand10("open the workspaces", ctx())?.steps).toEqual([{ a: "panel", panel: "workspace" }]);
    expect(controlCommand10("switch to taluks", ctx())?.steps).toEqual([{ a: "mapMode", mode: "taluks" }]);
  });
  it("a press control by its name, in its own window", () => {
    expect(controlCommand10("sort by severity", ctx({ panel: "list" }))?.press).toMatch(/th\.sortable/);
    expect(controlCommand10("next page", ctx({ panel: "list" }))?.press).toMatch(/\.pgr/);
    expect(controlCommand10("click Data Detective", ctx({ page: "studio" }))?.press).toMatch(/ds-tabs/);
    expect(controlCommand10("zoom in", ctx())?.press).toMatch(/map-tools/);
  });
  it("in the window open, its own control wins by the margin (the export window's Weekly, not the dashboard's)", () => {
    expect(controlCommand10("weekly", ctx({ panel: "export" }))?.press).toMatch(/\.seg/);
    expect(controlCommand10("weekly", ctx())?.steps).toEqual([{ a: "period", period: "weekly" }]);
  });
  it("two controls with one name ask back by region, never a silent pick by the shortest name", () => {
    const h = controlCommand10("click Alerts", ctx({ page: "studio" }));
    expect(h?.which?.ids).toEqual(expect.arrayContaining(["topbar.bell.toggle", "ds.tab.alerts"]));
    expect(h?.which?.en).toMatch(/^Which one: .+ or .+\?$/);
    expect(h?.which?.ta).toMatch(/^எது: /);
    expect(h?.steps ?? h?.press ?? null).toBeNull();
  });
  it("a region said picks one ('the bell's Alerts')", () => {
    expect(controlCommand10("click the alerts bell", ctx({ page: "studio" }))?.id).toBe("topbar.bell.toggle");
  });
  it("a 'never' control comes back as never: the Collector's to tap", () => {
    expect(controlCommand10("sign out", ctx())).toMatchObject({ id: "account.signOut", level: "never" });
    expect(controlCommand10("approve and send", ctx({ panel: "incident" }))?.level).toBe("never");
    expect(controlCommand10("கணக்கிலிருந்து வெளியேறு", ctx())?.level).toBe("never");
  });
  it("a select is set to the option said; the console's own filters with a value stay the rules'", () => {
    expect(controlCommand10("set the rain station to Nungambakkam", ctx({ page: "environment" }))).toMatchObject({ id: "env.rain.station", value: "nungambakkam" });
    expect(controlCommand10("set the severity to high", ctx({ panel: "list" }))).toMatchObject({ id: "list.severity", value: "high" });
    expect(controlCommand10("severity கடுமை", ctx({ panel: "list" }))).toMatchObject({ id: "list.severity", value: "severe" });
    expect(controlCommand10("set the zone to Adyar", ctx())).toBeNull();
  });
  it("a checkbox is ticked, unticked or flipped by name", () => {
    expect(controlCommand10("untick My tasks", ctx({ panel: "customize" }))).toMatchObject({ id: "customize.panel.tasks", tick: false });
    expect(controlCommand10("tick the satellite map", ctx({ panel: "customize" }))).toMatchObject({ id: "customize.panel.map", tick: true });
    expect(controlCommand10("civic issues only", ctx({ panel: "added" }))).toMatchObject({ id: "added.civicOnly", tick: null });
    expect(controlCommand10("hide the severe pins", ctx())?.steps).toEqual([{ a: "layer", layer: "severe", on: false }]);
  });
  it("a text box takes the words after its name", () => {
    expect(controlCommand10("search the list for Adyar", ctx({ panel: "list" }))).toMatchObject({ id: "list.filter", value: "adyar" });
  });
  it("Jarvis's own harmless controls have a voice path; the tray's Discard is the Collector's", () => {
    expect(controlCommand10("tell me", ctx())).toMatchObject({ id: "card.interjection", own: true, level: "A" });
    expect(controlCommand10("later", ctx())).toBeNull(); // one everyday word, no "press" word: not taken
    expect(controlCommand10("tell me later", ctx())).toMatchObject({ id: "card.interjection:later", own: true });
    expect(controlCommand10("not about this", ctx())).toMatchObject({ id: "card.interjection:notabout", level: "B" });
    expect(controlCommand10("fold the brief", ctx())).toMatchObject({ id: "card.brief", own: true });
    expect(controlCommand10("close the brief", ctx())).toMatchObject({ id: "card.brief:close", own: true });
    expect(controlCommand10("discard the drafts", ctx())?.level).toBe("never");
  });
  it.each([
    "show the severe cases in Adyar", "how many open complaints does Metro Water have", "why are dengue cases rising in Teynampet?",
    "tell me about Cyclone Akvan", "any news on the cyclone", "what's the latest on the cyclone", "news", "show the news", "read the first story",
    "open the third one", "zone 7", "compare Adyar and Ambattur this week", "Kodambakkam la bus stop-a udaichaangale, adha kaattu",
    "அடையாறு புகார்கள் காட்டு", "later", "rows", "clear", "save", "save this workspace as Collector's Daily Briefing", "remember that the Adyar bridge is closed",
    "show severe", "show open complaints", "stop", "undo", "show numbers", "click 3", "what can you do"
  ])("'%s' is not a control's: the other lanes take it", (said) => {
    expect(controlCommand10(said, ctx())).toBeNull();
  });
  it("with Jarvis's Stage open, its own commands stay the Stage's", () => {
    expect(controlCommand10("next", ctx({ panel: "list" }, { stage: true }))).toBeNull();
    expect(controlCommand10("close", ctx({ panel: "list" }, { stage: true }))).toBeNull();
  });
  it("a control the console says is not on screen is not taken", () => {
    expect(controlCommand10("click data detective", ctx({ page: "studio" }, { visible: [] }))).toBeNull();
    expect(controlCommand10("click data detective", ctx({ page: "studio" }, { visible: ["ds.tab.detective"] }))?.id).toBe("ds.tab.detective");
  });
});

describe("v10 review 2: the controls' findings, each a failing test first", () => {
  /** the lane v10Front gives a sentence, as the console runs it */
  const lane = (said: string, o: Partial<ScreenState>, visible: string[] | null, x: Partial<BrowserCtx10> = {}) =>
    v10Front(said, { stage: null, news: {}, state: { ...base, ...o }, world: WORLD, listenLang: "en", visible, ...x }).lane;

  // v10 review 2, finding 28: with Take action open, a sentence with "message" or "subject" in it cleared that box and typed the rest into it
  const TA = ["ta.subject", "ta.message", "ta.redraft", "ta.copy", "ta.cancel", "ta.back"];
  it.each(["read the message", "what does the message say", "approve and send the message", "செய்தியை அனுப்பு", "message anuppu", "what is the subject"])(
    "'%s' does not clear and retype the Take action draft", (said) => {
      const l = lane(said, { panel: "incident", incident: "INC-1" }, TA);
      expect(l && l.lane === "control" && l.press && l.value ? `${l.id} <- "${l.value}"` : null).toBeNull();
    });
  it("a text box takes the words a typing frame gives it, the frame's verb not typed", () => {
    expect(controlCommand10("type drain overflow in the subject", ctx({ panel: "incident" }, { visible: TA }))).toMatchObject({ id: "ta.subject", value: "drain overflow" });
    expect(controlCommand10("subject la drain overflow type pannunga", ctx({ panel: "incident" }, { visible: TA }))).toMatchObject({ id: "ta.subject", value: "drain overflow" });
    expect(controlCommand10("click the message", ctx({ panel: "incident" }, { visible: TA }))).toMatchObject({ id: "ta.message", value: null });
  });

  // v10 review 2, finding 29: in the incident list, a question naming a column was set as that column's filter ("That option isn't in that list.")
  const LIST = ["list.filter", "list.department", "list.severity", "list.status", "list.timeRange", "list.page.next", "list.page.prev"];
  it.each(["what is the status of the second one", "what's the severity of the first one", "which department is the third one", "why is the status open"])(
    "'%s' in the incident list is a question, not a column's filter", (said) => {
      const l = lane(said, { panel: "list" }, LIST);
      expect(l?.lane === "control" ? `${l.id} value="${l.value}"` : null).toBeNull();
    });
  it("a column's filter is still set to the option said", () => {
    expect(controlCommand10("set the status to resolved", ctx({ panel: "list" }, { visible: LIST }))).toMatchObject({ id: "list.status", value: "resolved" });
    expect(controlCommand10("status resolved", ctx({ panel: "list" }, { visible: LIST }))).toMatchObject({ id: "list.status", value: "resolved" });
  });

  // v10 review 2, finding 30: with a dataset open on the Data Studio, the console's clear-filters and period ran before the dataset's intercept
  it.each(["clear the filters", "remove all filters", "this month", "show it per day"])("'%s' with a dataset open on the Studio is the dataset's", (said) => {
    const l = lane(said, { page: "studio" }, [], { studio: true });
    const steps = l?.lane === "control" ? l.steps ?? [] : [];
    expect(steps.length === 0 || studioLetsThrough(said, steps, 1)).toBe(true);
  });
  it("a plain console command still reaches the console with a dataset open, and the period with none open", () => {
    expect(lane("go to the trends page", { page: "studio" }, [], { studio: true })).toMatchObject({ lane: "control", steps: [{ a: "page", page: "trends" }] });
    expect(lane("this month", { page: "studio" }, [])).toMatchObject({ lane: "control", steps: [{ a: "period", period: "monthly" }] });
  });

  // v10 review 2, finding 31 is the console's (src/components/collector/app/thunai/controls.v10.test.ts)

  // v10 review 2, finding 32: with Customize open, "go to trends" flipped the window's Trends tick instead of going to Trends
  it.each(["go to trends", "open the briefing", "go to the data studio", "போக்குகள் பக்கத்துக்குப் போங்க"])("'%s' with Customize open goes to the page", (said) => {
    const l = lane(said, { panel: "customize" }, ["customize.page.briefing", "customize.page.trends", "customize.page.environment", "customize.page.studio"]);
    expect(l?.lane === "control" ? l.steps ?? l.id : null).toEqual([{ a: "page", page: said.includes("brief") ? "briefing" : said.includes("studio") ? "studio" : "trends" }]);
  });
  it("Customize's ticks are still ticked by name there", () => {
    expect(controlCommand10("untick trends", ctx({ panel: "customize" }))).toMatchObject({ id: "customize.page.trends", tick: false });
    expect(controlCommand10("click Trends", ctx({ panel: "customize" }))).toMatchObject({ id: "customize.page.trends" });
  });

  // v10 review 2, finding 33: Take action's Redraft (the inventory's "draft") was level A: pressed from the open mic, the Collector's edits lost
  it("every draft-risk press is C (the name first) or never", () => {
    const bad = CONTROLS10.filter((e) => riskOf.get(e.id.split(":")[0]) === "draft" && "press" in e.act && e.act.input !== "text" && !["C", "never"].includes(e.level))
      .map((e) => `${e.id}=${e.level}`);
    expect(bad).toEqual([]);
  });

  // v10 review 2, finding 34: a Tamil word that only begins like a loanword was read as that word (சர்ச்சை, controversy, as "search")
  it("a Tamil word that only begins like a loanword stays itself; a loanword's case endings still fold", () => {
    expect(words10("சர்ச்சையைக் காட்டு")).toEqual(["சர்ச்சையைக்", "காட்டு"]);
    expect(words10("சாட்சி மோட்டார்")).toEqual(["சாட்சி", "மோட்டார்"]);
    expect(words10("சாட்டிலைட்")).toEqual(["satellite"]);
    expect(words10("மேப்பில் லேயர்களை மெனுவைத் டேட்டாவுல ரிப்போர்ட்டை பிரீஃபிங்குக்கு")).toEqual(["map", "layer", "menu", "data", "report", "briefing"]);
    const l = lane("சர்ச்சையைக் காட்டு", {}, []);
    expect(l?.lane === "control" ? l.id : null).toBeNull();
  });
});

describe("v10 review 2, round 2: the verifier's problems with the round-1 fixes", () => {
  const lane = (said: string, o: Partial<ScreenState>, visible: string[] | null, x: Partial<BrowserCtx10> = {}) =>
    v10Front(said, { stage: null, news: {}, state: { ...base, ...o }, world: WORLD, listenLang: "en", visible, ...x }).lane;
  const TA = ["ta.subject", "ta.message", "ta.redraft", "ta.copy", "ta.cancel", "ta.back"];
  const typed = (said: string, o: Partial<ScreenState>, visible: string[]) => {
    const l = lane(said, o, visible);
    return l && l.lane === "control" && l.press && l.value ? `${l.id} <- "${l.value}"` : null;
  };

  // v10 review 2, round 2: finding 30's drop also dropped Jarvis's own controls (stop, off, forget) with a dataset open: they went to askDataset
  it.each(["stop speaking", "பேச்சை நிறுத்து", "pesradha niruthu", "Stop the long answer", "long answer stop pannu", "ஜார்விஸை அணை", "close Jarvis and go back",
    "Close Jarvis", "forget all my notes", "எல்லாம் மற"])("'%s' with a dataset open still stops, switches Jarvis off or forgets", (said) => {
    const off = lane(said, { page: "studio" }, []);
    const on = lane(said, { page: "studio" }, [], { studio: true });
    expect(off?.lane === "control" ? off.steps : null).toBeTruthy();
    expect(on?.lane === "control" ? on.steps : null).toEqual(off?.lane === "control" ? off.steps : null);
  });

  // v10 review 2, round 2: finding 28 one word away: a sentence about the draft with a typing word in it still typed its left-over words
  it.each(["write the message in Tamil", "செய்தியைத் தமிழில் எழுது", "message-a tamil la ezhudhu", "change the message to a formal tone",
    "find the message from the zonal officer", "set the subject in Tamil", "write the subject in Tamil", "தலைப்பைத் தமிழில் எழுது",
    "make the message shorter", "rewrite the subject in English", "subject-a english la maathu",
    // the same frames one word away: someone the draft is for, a thing to write about, a question about what to write
    "write a message to the zonal officer", "add a line to the message", "write the address in the subject", "address-a message la podu", "முகவரியைச் செய்தியில் சேர்",
    "what should I write in the message", "why did you type drain overflow in the subject", "செய்தியைச் சுருக்கமாக மாற்று"])("'%s' does not type into the Take action draft", (said) => {
    expect(typed(said, { panel: "incident", incident: "INC-1" }, TA)).toBeNull();
  });

  // v10 review 2, round 2: finding 28's typing words left out the Tanglish and Tamil "put" (podu, போடு)
  it.each([
    ["subject la drain overflow podu", "ta.subject", "drain overflow"],
    // the quotative nu ("as") is the frame, never typed
    ["subject la drain overflow nu podunga", "ta.subject", "drain overflow"],
    ["தலைப்பில் வடிகால் அடைப்பு போடு", "ta.subject", "வடிகால் அடைப்பு"],
    ["தலைப்பில் வடிகால் அடைப்பு என்று போடுங்க", "ta.subject", "வடிகால் அடைப்பு"],
    ["workspace name box la adyar floods podu", "workspace.name", "adyar floods"],
    ["put drain overflow in the subject", "ta.subject", "drain overflow"],
    ["add inspect by Friday to the message", "ta.message", "inspect by friday"],
    ["set the subject to drain overflow at Adyar", "ta.subject", "drain overflow at adyar"],
    ["set the subject as drain overflow", "ta.subject", "drain overflow"],
    ["change the message to say inspect today", "ta.message", "inspect today"],
    ["type the drain is blocked in the subject", "ta.subject", "drain is blocked"],
    ["subject-a drain overflow nu maathu", "ta.subject", "drain overflow"],
    ["தலைப்பை வடிகால் அடைப்பு என்று மாற்று", "ta.subject", "வடிகால் அடைப்பு"],
    ["list la adyar thedu", "list.filter", "adyar"],
    ["பட்டியலில் அடையாறு தேடு", "list.filter", "அடையாறு"]
  ])("'%s' types into the box", (said, id, want) => {
    const ws = id.startsWith("workspace"), list = id.startsWith("list");
    const r = controlCommand10(said, ctx({ panel: ws ? "workspace" : list ? "list" : "incident" }, { visible: ws ? ["workspace.name"] : list ? ["list.filter"] : TA }));
    expect(r).toMatchObject({ id, value: want });
  });

  // v10 review 2, round 2: finding 32's move words left out "switch to", "change to", maathu, மாத்து: the Customize tick was flipped
  const CUST = ["customize.page.briefing", "customize.page.trends", "customize.page.environment", "customize.page.studio"];
  it.each(["switch to trends", "change to trends", "move to the briefing", "trends ku maathu", "போக்குகளுக்கு மாத்து", "trends", "the briefing please"])(
    "'%s' with Customize open goes to the page", (said) => {
      const l = lane(said, { panel: "customize" }, CUST);
      expect(l?.lane === "control" ? l.steps ?? l.id : null).toEqual([{ a: "page", page: said.includes("brief") ? "briefing" : "trends" }]);
    });
  it("Customize's ticks are still ticked with a tick or press word", () => {
    expect(controlCommand10("tick trends", ctx({ panel: "customize" }, { visible: CUST }))).toMatchObject({ id: "customize.page.trends", tick: true });
    expect(controlCommand10("hide the briefing", ctx({ panel: "customize" }, { visible: CUST }))).toMatchObject({ id: "customize.page.briefing", tick: false });
    expect(controlCommand10("trends tick pannu", ctx({ panel: "customize" }, { visible: CUST }))).toMatchObject({ id: "customize.page.trends" });
  });

  // v10 review 2, round 2: finding 29's guard looked for question words in the value; "the status of the second one" still set the filter, and
  // "search the list for complaints about garbage" (typed before the fix) was dropped
  const LIST = ["list.filter", "list.department", "list.severity", "list.status", "list.timeRange", "list.page.next", "list.page.prev"];
  it.each(["show me the status of the second one", "status of the second one", "second one oda status sollu", "the severity of the first one",
    "department of the third one please", "the second one's status", "இரண்டாவதின் நிலை"])("'%s' in the incident list is not a column filter set to it", (said) => {
    const l = lane(said, { panel: "list" }, LIST);
    expect(l?.lane === "control" && l.value ? `${l.id} value="${l.value}"` : null).toBeNull();
  });
  it.each([["search the list for complaints about garbage", "complaints about garbage"], ["filter the list for latest updates", "latest updates"],
    ["search the list for how to apply", "how to apply"]])("'%s' still types into the list's search", (said, want) => {
    expect(controlCommand10(said, ctx({ panel: "list" }, { visible: LIST }))).toMatchObject({ id: "list.filter", value: want });
  });
  it("a question about what was searched is still not typed", () => {
    expect(controlCommand10("what did I search the list for", ctx({ panel: "list" }, { visible: LIST }))).toBeNull();
  });

  // v10 review 2, round 2: finding 34's closed ending list stopped folding a loanword's plural and its glide after -i
  it("a loanword's plural, its case endings with a clitic and the ய glide after -i still fold", () => {
    expect(["ஃபில்டர்ஸ்", "லேயர்களையும்", "சிஎஸ்வியா", "சிஎஸ்வியில்", "ஃபில்டர்ஸை", "மெனுவையும்", "டேட்டாவிலும்"].map((w) => words10(w).join(" ")))
      .toEqual(["filter", "layer", "csv", "csv", "filter", "menu", "data"]);
    expect(controlCommand10("ஃபில்டர்ஸ் எல்லாம் எடு", ctx({}, { lang: "ta" }))?.id).toBe("account.clearFilters");
    expect(controlCommand10("சிஎஸ்வியா பதிவிறக்கு", ctx({ page: "studio" }, { lang: "ta", visible: ["ds.download.csv", "ds.download.xlsx"] }))?.id).toBe("ds.download.csv");
  });
  // v10 review 2, round 2: finding 34 one word away: சர்ச்சை (controversy) is spelled as சர்ச் + its accusative, and சாட்டை (a whip) as சாட் + its own
  it("a Tamil word spelled like a loanword's case form stays itself", () => {
    expect(["சர்ச்சை", "சர்ச்சையும்", "சர்ச்சைக்குரிய", "சாட்டை", "சாட்டையால்"].map((w) => words10(w).join(" "))).toEqual(["சர்ச்சை", "சர்ச்சையும்", "சர்ச்சைக்குரிய", "சாட்டை", "சாட்டையால்"]);
    const l = lane("இந்த சர்ச்சை", {}, [], { listenLang: "ta" });
    expect(l?.lane === "control" ? l.id : null).toBeNull();
  });

  // v10 review 2, round 2: a value said in a "set … to" frame replaces the box's words (the console's side is in controls.v10.test.ts)
  it("'set the message to …' asks for the draft to be replaced; 'add … to the message' to be added to", () => {
    expect(controlCommand10("set the message to inspect tomorrow", ctx({ panel: "incident" }, { visible: TA }))).toMatchObject({ id: "ta.message", value: "inspect tomorrow", replace: true });
    expect(controlCommand10("add inspect by Friday to the message", ctx({ panel: "incident" }, { visible: TA }))?.replace).toBeFalsy();
  });
});

describe("v10 review 2, round 3: the verifier's problems with the round-2 controls fixes", () => {
  const lane = (said: string, o: Partial<ScreenState>, visible: string[] | null, x: Partial<BrowserCtx10> = {}) =>
    v10Front(said, { stage: null, news: {}, state: { ...base, ...o }, world: WORLD, listenLang: "en", visible, ...x }).lane;
  const TA = ["ta.subject", "ta.message", "ta.redraft", "ta.copy", "ta.cancel", "ta.back"];
  const LIST = ["list.filter", "list.department", "list.severity", "list.status", "list.timeRange", "list.page.next", "list.page.prev"];
  const INC: Partial<ScreenState> = { panel: "incident", incident: "INC-1" };
  const typed = (said: string, o: Partial<ScreenState>, visible: string[], listenLang: "en" | "ta" = "en") => {
    const l = lane(said, o, visible, { listenLang });
    return l && l.lane === "control" && l.press && l.value ? `${l.id} <- "${l.value}"` : null;
  };

  // v10 review 2, round 3: the set frame's replace wiped the draft for a redraft request one word away from the manner guard (the console's side,
  // the draft itself, is in controls.v10.test.ts)
  it.each(["change the message to be more polite", "replace the message with a new draft", "change the message to a more polite one"])(
    "'%s' never asks for the draft to be replaced", (said) => {
      const l = lane(said, INC, TA);
      expect(l?.lane === "control" ? !!l.replace : false).toBe(false);
    });
  it("'set the message to …' still replaces the draft, and the subject is still set to words with a manner word among them", () => {
    expect(controlCommand10("set the message to inspect tomorrow", ctx(INC, { visible: TA }))).toMatchObject({ id: "ta.message", value: "inspect tomorrow", replace: true });
    expect(controlCommand10("set the subject to water shortage in Adyar", ctx(INC, { visible: TA }))).toMatchObject({ id: "ta.subject", value: "water shortage in adyar" });
  });

  // v10 review 2, round 3: a question, or a thing to write about, was typed into the draft word for word (round 2 excused a typed box's question words)
  it.each(["write what happened at Adyar in the message", "add what happened at Adyar to the message", "write why the drain is blocked in the message",
    "add his phone number to the message", "add something about the inspection to the message"])("'%s' does not type into the Take action draft", (said) => {
    expect(typed(said, INC, TA)).toBeNull();
  });
  it("a question about the list is not typed into its search; a title's 'how to' still is", () => {
    expect(typed("search the list for which ones are overdue", { panel: "list" }, LIST)).toBeNull();
    expect(controlCommand10("search the list for how to apply", ctx({ panel: "list" }, { visible: LIST }))).toMatchObject({ id: "list.filter", value: "how to apply" });
  });

  // v10 review 2, round 3: Tamil dictation whose last word ends in ஐ (மழை, குப்பை, சாலை, பிரச்சினை) was read as an object's case and dropped
  it.each([["தலைப்பில் வடிகால் பிரச்சினை எழுது", "வடிகால் பிரச்சினை"], ["தலைப்பில் மழை பிரச்சினை என்று எழுது", "மழை பிரச்சினை"],
    ["தலைப்பில் அண்ணா சாலை போடு", "அண்ணா சாலை"], ["தலைப்பில் மழை போடு", "மழை"], ["தலைப்பில் குப்பை போடு", "குப்பை"]])("'%s' types into the subject", (said, want) => {
    expect(typed(said, INC, TA, "ta")).toBe(`ta.subject <- "${want}"`);
  });

  // v10 review 2, round 3: the verb said after the locative, and "set" with no "to", typed in round 1 and were dropped in round 2
  it.each([["in the subject type drain overflow", "ta.subject", "drain overflow"], ["in the subject put drain overflow", "ta.subject", "drain overflow"],
    ["set the subject: drain overflow", "ta.subject", "drain overflow"], ["set subject drain overflow", "ta.subject", "drain overflow"],
    ["in the message write please inspect by Friday", "ta.message", "inspect by friday"]])("'%s' types into the box", (said, id, want) => {
    expect(typed(said, INC, TA)).toBe(`${id} <- "${want}"`);
  });

  // v10 review 2, round 3: சர்ச்சை (controversy) kept as itself also kept the loanword's own accusative: "சர்ச்சைத் திற" (open the search)
  it("'சர்ச்சைத் திற' opens the search; the controversy stays itself", () => {
    const l = lane("சர்ச்சைத் திற", {}, [], { listenLang: "ta" });
    expect(l?.lane === "control" ? l.id : null).toBe("topbar.search.open");
    expect(words10("சர்ச்சைத்")).toEqual(["search"]);
    expect(words10("இந்த சர்ச்சை")).toEqual(["இந்த", "சர்ச்சை"]);
  });
});

describe("v10 review 2, round 4: the verifier's regressions after the round-3 controls fixes", () => {
  const lane = (said: string, o: Partial<ScreenState>, visible: string[] | null, x: Partial<BrowserCtx10> = {}) =>
    v10Front(said, { stage: null, news: {}, state: { ...base, ...o }, world: WORLD, listenLang: "en", visible, ...x }).lane;
  const TA = ["ta.subject", "ta.message", "ta.redraft", "ta.copy", "ta.cancel", "ta.back"];
  const INC: Partial<ScreenState> = { panel: "incident", incident: "INC-1" };
  const typed = (said: string, listenLang: "en" | "ta" = "en") => {
    const l = lane(said, INC, TA, { listenLang });
    return l && l.lane === "control" && l.press && l.value ? `${l.id} <- "${l.value}"${l.replace ? " (replace)" : ""}` : null;
  };

  // v10 review 2, round 4: round 3's narrower Tamil object case (a bare ை is a noun's own: மழை, சாலை) let the plain accusative of a thing to write
  // about through: "put his name in the subject" wiped the subject and typed "அவர் பெயரை"
  it.each(["அவர் பெயரை தலைப்பில் போடு", "புகார் எண்ணை செய்தியில் சேர்", "விவரங்களை செய்தியில் சேர்", "தொலைபேசி எண்ணை செய்தியில் சேர்",
    "இடத்தின் பெயரை தலைப்பில் போடு", "புகாரை செய்தியில் சேர்", "தலைப்பில் அவர் பெயரை போடு", "செய்தியில் புகார் எண்ணை சேர்"])(
    "'%s' does not type its words into the Take action draft", (said) => {
      expect(typed(said, "ta")).toBeNull();
    });

  // v10 review 2, round 4: round 3's replace guard (an article before the words, a manner word among them) kept an ordinary "set the message to …"
  // from replacing the draft: the words were added to it
  it.each([["replace the message with the drain was cleared today", "drain was cleared today"],
    ["set the message to the zonal officer will inspect tomorrow", "zonal officer will inspect tomorrow"],
    ["set the message to please send more workers to Adyar", "send more workers to adyar"],
    ["set the message to the drain is clear now", "drain is clear"]])("'%s' replaces the draft", (said, want) => {
    expect(typed(said)).toBe(`ta.message <- "${want}" (replace)`);
  });

  // v10 review 2, round 4: round 3's "set, the box, its words" typed "line to drain overflow" into the subject
  it("'set the subject line to drain overflow' sets the subject to the words", () => {
    expect(typed("set the subject line to drain overflow")).toBe(`ta.subject <- "drain overflow" (replace)`);
  });
});

describe("v10 dev2: the controls' misses on the second development set, each a failing test first", () => {
  const STAGE = ctx({}, { stage: true });
  /** the lane v10Front gives a sentence, as the console runs it (a Stage of cases open, or none) */
  const stageDoc = { recipe: "cases", blocks: [{ kind: "CaseList", rows: [] }], scope: { zone: 5 }, slots: null };
  const lane = (said: string, o: Partial<ScreenState> = {}, stage: unknown = null) =>
    v10Front(said, { stage: stage as never, news: {}, state: { ...base, ...o }, world: WORLD, listenLang: "en", visible: null } as BrowserCtx10).lane;

  it("v10 dev2: dB-control-8: with Jarvis's screen open, going back to the dashboard in loose words presses its Back to dashboard", () => {
    const back = { id: "stage.backToDashboard", own: true, level: "A" };
    for (const s of ["podhum indha screen, dashboard-ku thirumbi polaam", "dashboard-ku thirumbi po", "dashboardku thirumba polaam", "back to the dashboard",
      "take me back to the dashboard", "enough of this screen, back to the dashboard", "ok done, return to the dashboard", "டாஷ்போர்டுக்குத் திரும்பு",
      "இந்த ஸ்கிரீன் போதும், டாஷ்போர்டுக்கு திரும்பிப் போகலாம்", "இந்தத் திரை போதும், டாஷ்போர்டுக்குத் திரும்புங்க"]) expect(controlCommand10(s, STAGE), s).toMatchObject(back);
    expect(lane("podhum indha screen, dashboard-ku thirumbi polaam", {}, stageDoc)).toMatchObject({ lane: "control", id: "stage.backToDashboard" });
    // with no screen of Jarvis's open, the dashboard is the Overview page, as the rules have it
    expect(controlCommand10("back to the dashboard", ctx())?.id ?? null).not.toBe("stage.backToDashboard");
    expect(controlCommand10("dashboard-ku thirumbi polaam", ctx())?.id ?? null).not.toBe("stage.backToDashboard");
    // the Stage's own words stay the Stage's; "enough" alone is the Stage's stop
    for (const s of ["close", "go back", "back", "podhum", "போதும்"]) expect(controlCommand10(s, STAGE), s).toBeNull();
    // a question about the dashboard is not the button
    expect(controlCommand10("why did the dashboard go back to daily", STAGE)).toBeNull();
  });

  it("v10 dev2: dB-control-11: the prices card's order said as 'on top' or 'first', the card named by its vegetables, in three languages", () => {
    const env = ctx({ page: "environment" });
    for (const [s, id] of [["vegetable prices-la rising first mela varattum", "markets.sort.rising"], ["vegetable prices la rising mela varattum", "markets.sort.rising"],
      ["show the vegetable prices with rising first", "markets.sort.rising"], ["put the rising prices on top", "markets.sort.rising"],
      ["காய்கறி விலையில் ஏறுபவை முதல்ல வரட்டும்", "markets.sort.rising"], ["காய்கறி விலை ஏறுபவை மேலே வரட்டும்", "markets.sort.rising"],
      ["falling prices on top", "markets.sort.falling"], ["vilai irangum first mela podunga", "markets.sort.falling"], ["vegetable prices falling first", "markets.sort.falling"]] as const) {
      expect(controlCommand10(s, env), s).toMatchObject({ id });
    }
    expect(lane("vegetable prices-la rising first mela varattum", { page: "environment" })).toMatchObject({ lane: "control", id: "markets.sort.rising" });
    // a question about the prices, or prices rising said with no order, is not the button
    for (const s of ["which vegetable prices are rising", "are tomato prices rising", "vegetable prices rising-a", "mela varattum", "show the vegetable prices"]) {
      const r = controlCommand10(s, env);
      expect(r?.id ?? "none", s).not.toMatch(/^markets\.sort\./);
    }
  });
});
