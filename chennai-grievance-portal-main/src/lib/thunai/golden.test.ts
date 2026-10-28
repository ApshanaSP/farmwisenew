/**
 * Thunai's golden set: spoken commands in English, Tamil and Tanglish, each with a start state and the one correct
 * result. The rules alone must reach the pass marks (95% English, 90% Tamil, 90% Tanglish); the failures are printed,
 * never hidden. A Tamil speaker should review the Tamil lines before the demo.
 */
import { describe, expect, it } from "vitest";
import { NOW, START, WORLD, withState } from "./fixture";
import type { ScreenState, Step, Understood } from "./types";
import { understand } from "./understand";

type Expect = Step[] | "ask" | "refuse" | "unknown";
type Case = [string, Expect, Partial<ScreenState>?];

const inc = { incident: "INC-1", panel: "incident" };
const recentSev = { lastFilter: { slot: "sev" as const, at: NOW - 5_000 } };
const recentZone = { lastFilter: { slot: "zone" as const, at: NOW - 5_000 } };

const EN: Case[] = [
  ["Open Trends", [{ a: "page", page: "trends" }]],
  ["Zone 7", [{ a: "view", view: { zone: 7 } }]],
  ["Show me Anna Nagar", [{ a: "view", view: { zone: 8 } }]],
  ["Switch to weekly", [{ a: "period", period: "weekly" }]],
  ["Change the filter to 7", [{ a: "view", view: { zone: 7 } }], recentZone],
  ["Change the filter to 7", [{ a: "view", view: { zone: 7 } }], recentSev],
  ["Take me to the worst zone", [{ a: "view", view: { zone: 13 } }]],
  ["Go back", [{ a: "undo", n: 1 }]],
  ["Go back three steps", [{ a: "undo", n: 3 }]],
  ["Same for last month", [{ a: "period", period: "monthly" }]],
  ["Critical only", [{ a: "view", view: { sev: "Severe" } }]],
  ["Only Metro Water, waterlogging", [{ a: "view", view: { dept: "CMWSSB", cat: "FLOOD_WATERLOGGING" } }]],
  ["Show Adyar, no, Perungudi", [{ a: "view", view: { zone: 14 } }]],
  ["Open the top incident", [{ a: "item", which: 1 }]],
  ["Next one", [{ a: "item", which: "next" }], inc],
  ["Draft an instruction for this", [{ a: "draft" }], inc],
  ["Send it", [{ a: "send" }]],
  ["Confirm", [{ a: "confirm", n: null }]],
  ["Confirm three", [{ a: "confirm", n: 3 }]],
  ["What's the Chembarambakkam level?", [{ a: "read", what: "reservoir", name: "Chembarambakkam" }]],
  ["Delete all the incidents", "refuse"],
  ["Adyar, weekly, critical only", [{ a: "view", view: { zone: 13, sev: "Severe" } }, { a: "period", period: "weekly" }]],
  ["Show taluks", [{ a: "mapMode", mode: "taluks" }]],
  ["Show Mylapore taluk", [{ a: "view", view: { taluk: "TLK-MYL" } }]],
  ["Turn on the stations layer", [{ a: "layer", layer: "stations", on: true }]],
  ["Hide the complaints layer", [{ a: "layer", layer: "complaint", on: false }]],
  ["Open the latest news", [{ a: "panel", panel: "news" }]],
  ["Where do the outlets disagree?", [{ a: "panel", panel: "conflicts" }]],
  ["What's in the news but not in our records?", [{ a: "panel", panel: "gaps" }]],
  ["Show the neighbouring districts", [{ a: "panel", panel: "nextdoor" }]],
  ["Tomato price", [{ a: "panel", panel: "markets" }]],
  ["How much rain in the last 24 hours?", [{ a: "read", what: "rain", name: null }]],
  ["Air quality in Manali", [{ a: "read", what: "air", name: "Manali" }]],
  ["Schools within 1 km of flooding", [{ a: "map", q: "Schools within 1 km of flooding" }]],
  ["Nearest hospital to this incident", [{ a: "map", q: "Nearest hospital to this incident" }], inc],
  ["Show hotspots this week", [{ a: "map", q: "Show hotspots this week" }]],
  ["Ward 175", [{ a: "map", q: "Ward 175" }]],
  ["How many pothole complaints are pending in Teynampet?", [{ a: "ask", q: "How many pothole complaints are pending in Teynampet?" }]],
  ["Ask District IQ which zone has the most pending complaints", [{ a: "ask", q: "which zone has the most pending complaints" }]],
  ["Dark mode", [{ a: "theme", theme: "dark" }]],
  ["Speak Tamil", [{ a: "lang", lang: "ta" }]],
  ["Mute", [{ a: "mode", mode: "visual" }]],
  ["Slower", [{ a: "speed", faster: false }]],
  ["Save this as Monday review", [{ a: "workspace", op: "save", name: "Monday review" }]],
  ["Open workspace Monday review", [{ a: "workspace", op: "open", name: "monday review" }]],
  ["Show numbers", [{ a: "numbers", show: true, names: false }]],
  ["Click 12", [{ a: "click", n: 12, name: null }]],
  ["Click Export", [{ a: "click", n: null, name: "Export" }]],
  ["Scroll down", [{ a: "scroll", dir: "down" }]],
  ["Type flooding near Velachery", [{ a: "type", text: "flooding near Velachery" }]],
  ["Remember that Zone 13 is my priority this monsoon", [{ a: "remember", text: "Zone 13 is my priority this monsoon" }]],
  ["What do you remember?", [{ a: "recall" }]],
  ["Forget that", [{ a: "forget", all: false }]],
  ["Stop", [{ a: "stop" }]],
  ["Thunai off", [{ a: "off" }]],
  ["What am I looking at?", [{ a: "whereAmI" }]],
  ["Explain this chart", [{ a: "explain" }]],
  ["Brief me", [{ a: "mission", name: "brief" }]],
  ["Prepare for tomorrow's heavy rain", [{ a: "mission", name: "rain" }]],
  ["Clear all filters", [{ a: "view", view: { zone: null, dept: null, cat: null, taluk: null, sev: null } }]],
  ["Only PWD", [{ a: "view", view: { dept: "PWD-WRD" } }]],
  ["Show garbage complaints in Kodambakkam this month", [{ a: "view", view: { zone: 10, cat: "SOLID_WASTE" } }, { a: "period", period: "monthly" }]],
  ["Go to briefing", [{ a: "page", page: "briefing" }]],
  ["Water", "ask"],
  ["Close", [{ a: "close", all: false }]],
  ["Close all", [{ a: "close", all: true }]],
  ["What did you just do?", [{ a: "whatDid" }]],
  ["Draft action", "ask"],
  ["Show the worst flooding", [{ a: "view", view: { cat: "FLOOD_WATERLOGGING" } }, { a: "item", which: 1 }]],
  ["Hands free", [{ a: "handsfree", on: true }]]
];

const TA: Case[] = [
  ["ஏழாவது மண்டலம் காட்டு", [{ a: "view", view: { zone: 7 } }]],
  ["அடையாறு காட்டு", [{ a: "view", view: { zone: 13 } }]],
  ["இந்த வாரத்துக்கு மாத்து", [{ a: "period", period: "weekly" }]],
  ["ஃபில்டரை பதினஞ்சுக்கு மாத்து", [{ a: "view", view: { zone: 15 } }], recentZone],
  ["ஐந்தாவது மண்டலம்", [{ a: "view", view: { zone: 5 } }]],
  ["அவசரமானவை மட்டும் காட்டு", [{ a: "view", view: { sev: "Severe" } }]],
  ["எந்த மண்டலம் ரொம்ப மோசம்?", [{ a: "read", what: "worstZone", name: null }]],
  ["அங்கே பெரிதாக்கு", [{ a: "zoom", target: "Adyar" }], { lastPlace: "Adyar" }],
  ["பழையபடி மாத்து", [{ a: "undo", n: 1 }]],
  ["போன மாசம் அதே மாதிரி காட்டு", [{ a: "period", period: "monthly" }]],
  ["குடிநீர் வாரியம் மட்டும் காட்டு", [{ a: "view", view: { dept: "CMWSSB" } }]],
  ["செம்பரம்பாக்கம் நீர்மட்டம் என்ன?", [{ a: "read", what: "reservoir", name: "Chembarambakkam" }]],
  ["இதற்கு மாநகராட்சிக்கு உத்தரவு தயார் செய்", [{ a: "draft" }], inc],
  ["அனுப்பு", [{ a: "send" }]],
  ["உறுதி ஒன்று", [{ a: "confirm", n: 1 }]],
  ["அடையாறு வேண்டாம், பெருங்குடி காட்டு", [{ a: "view", view: { zone: 14 } }]],
  ["நாளைக்கு கனமழை வருது, எல்லாம் தயார் பண்ணு", [{ a: "mission", name: "rain" }]],
  ["ட்ரெண்ட்ஸ் பக்கத்தைத் திற", [{ a: "page", page: "trends" }]],
  ["வாராந்திரத்துக்கு மாத்து", [{ a: "period", period: "weekly" }]],
  ["அம்பத்தூரைக் காட்டு", [{ a: "view", view: { zone: 7 } }]],
  ["மழைநீர் தேக்கம் மட்டும்", [{ a: "view", view: { cat: "FLOOD_WATERLOGGING" } }]],
  ["மயிலாப்பூர் வட்டத்தைக் காட்டு", [{ a: "view", view: { taluk: "TLK-MYL" } }]],
  ["முதல் நிகழ்வைத் திற", [{ a: "item", which: 1 }]],
  ["இன்றைய சுருக்கம் சொல்லு", [{ a: "mission", name: "brief" }]],
  ["எல்லாச் செய்திகளையும் காட்டு", [{ a: "panel", panel: "news" }]],
  ["பக்கத்து மாவட்டங்கள் எப்படி இருக்கு?", [{ a: "panel", panel: "nextdoor" }]],
  ["தக்காளி விலை என்ன?", [{ a: "panel", panel: "markets" }]],
  ["எல்லா வடிகட்டிகளையும் நீக்கு", [{ a: "view", view: { zone: null, dept: null, cat: null, taluk: null, sev: null } }]],
  ["எண்களைக் காட்டு", [{ a: "numbers", show: true, names: false }]],
  ["நிறுத்து", [{ a: "stop" }]],
  ["தமிழில் பேசு", [{ a: "lang", lang: "ta" }]],
  ["இதை 'திங்கள் ஆய்வு' என்று சேமி", [{ a: "workspace", op: "save", name: "திங்கள் ஆய்வு" }]],
  ["கடந்த 24 மணி நேரத்தில் எவ்வளவு மழை?", [{ a: "read", what: "rain", name: null }]],
  ["மணலியில் காற்றின் தரம் எப்படி?", [{ a: "read", what: "air", name: "Manali" }]],
  ["இந்த நிகழ்வுக்கு அருகிலுள்ள மருத்துவமனை எது?", [{ a: "map", q: "இந்த நிகழ்வுக்கு அருகிலுள்ள மருத்துவமனை எது?" }], inc],
  ["இரண்டு கிலோமீட்டருக்குள் நிவாரண முகாம்கள் காட்டு", [{ a: "map", q: "இரண்டு கிலோமீட்டருக்குள் நிவாரண முகாம்கள் காட்டு" }]],
  ["தேனாம்பேட்டை குப்பை புகார்கள் இந்த மாதம்", [{ a: "view", view: { zone: 9, cat: "SOLID_WASTE" } }, { a: "period", period: "monthly" }]],
  ["பதினைந்தாவது மண்டலம்", [{ a: "view", view: { zone: 15 } }]],
  ["மண்டலம் 3", [{ a: "view", view: { zone: 3 } }]],
  ["கோடம்பாக்கம் மட்டும்", [{ a: "view", view: { zone: 10 } }]],
  ["அடுத்தது", [{ a: "item", which: "next" }], inc],
  ["மூடு", [{ a: "close", all: false }]],
  ["சத்தம் வேண்டாம்", [{ a: "mode", mode: "visual" }]],
  ["உதவி", [{ a: "help" }]],
  ["உனக்கு என்ன நினைவிருக்கு?", [{ a: "recall" }]],
  ["டெங்கு புகார்கள் காட்டு", [{ a: "view", view: { cat: "VECTOR_DISEASE" } }]],
  ["காவல்துறை மட்டும்", [{ a: "view", view: { dept: "POL-GCP" } }]],
  ["வேளச்சேரி காட்டு", [{ a: "view", view: { taluk: "TLK-VLC" } }]],
  ["சோழிங்கநல்லூர் இந்த வாரம்", [{ a: "view", view: { zone: 15 } }, { a: "period", period: "weekly" }]],
  ["என்ன செஞ்ச?", [{ a: "whatDid" }]],
  ["எல்லா ஏரிகளின் நீர்மட்டம்", [{ a: "read", what: "reservoir", name: null }]]
];

const TANGLISH: Case[] = [
  ["Adyar-a kaatu", [{ a: "view", view: { zone: 13 } }]],
  ["Weekly-ku maathu", [{ a: "period", period: "weekly" }]],
  ["Idha zoom pannu", [{ a: "zoom", target: null }], inc],
  ["Worst zone edhu?", [{ a: "read", what: "worstZone", name: null }]],
  ["Last month-oda compare pannu", [{ a: "period", period: "monthly" }]],
  ["Critical mattum kaatu", [{ a: "view", view: { sev: "Severe" } }]],
  ["Metro Water mattum, waterlogging", [{ a: "view", view: { dept: "CMWSSB", cat: "FLOOD_WATERLOGGING" } }]],
  ["Go back pannu", [{ a: "undo", n: 1 }]],
  ["Idhukku Corporation-ku instruction draft pannu", [{ a: "draft" }], inc],
  ["Send pannunga", [{ a: "send" }]],
  ["Confirm pannunga", [{ a: "confirm", n: null }]],
  ["Anna Nagar illa, Teynampet kaatu", [{ a: "view", view: { zone: 9 } }]],
  ["Naalaikku heavy rain, ready pannu", [{ a: "mission", name: "rain" }]],
  ["Velachery-la incident romba perusa aaguthu, paaru", [{ a: "view", view: { taluk: "TLK-VLC" } }]],
  ["Ambattur-a kaatu", [{ a: "view", view: { zone: 7 } }]],
  ["Filter-a 7-ku maathu", [{ a: "view", view: { zone: 7 } }]],
  ["Zone ezhu", [{ a: "view", view: { zone: 7 } }]],
  ["Padhinanju zone", [{ a: "view", view: { zone: 15 } }]],
  ["Trends page-a open pannu", [{ a: "page", page: "trends" }]],
  ["Innaiku brief sollu", [{ a: "mission", name: "brief" }]],
  ["News ellaam kaatu", [{ a: "panel", panel: "news" }]],
  ["Thakkali vilai evlo?", [{ a: "panel", panel: "markets" }]],
  ["Filters ellaam clear pannu", [{ a: "view", view: { zone: null, dept: null, cat: null, taluk: null, sev: null } }]],
  ["Top incident-a open pannu", [{ a: "item", which: 1 }]],
  ["Rain layer on pannu", [{ a: "layer", layer: "stations", on: true }]],
  ["Dark mode on pannu", [{ a: "theme", theme: "dark" }]],
  ["Tamil-la pesu", [{ a: "lang", lang: "ta" }]],
  ["Numbers kaatu", [{ a: "numbers", show: true, names: false }]],
  ["Podhum", [{ a: "stop" }]],
  ["Chembarambakkam level evlo?", [{ a: "read", what: "reservoir", name: "Chembarambakkam" }]],
  ["Manali-la air quality epdi?", [{ a: "read", what: "air", name: "Manali" }]],
  ["Idhukku nearest hospital edhu?", [{ a: "map", q: "Idhukku nearest hospital edhu?" }], inc],
  ["2 km-kulla relief camps kaatu", [{ a: "map", q: "2 km-kulla relief camps kaatu" }]],
  ["Kodambakkam garbage this week", [{ a: "view", view: { zone: 10, cat: "SOLID_WASTE" } }, { a: "period", period: "weekly" }]],
  ["Police mattum", [{ a: "view", view: { dept: "POL-GCP" } }]],
  ["Perungudi-la flooding", [{ a: "view", view: { zone: 14, cat: "FLOOD_WATERLOGGING" } }]],
  ["Mylapore taluk-a kaatu", [{ a: "view", view: { taluk: "TLK-MYL" } }]],
  ["Adhey last month-ku kaatu", [{ a: "period", period: "monthly" }]],
  ["Zone 13 en priority nu nyabagam vechuko", [{ a: "remember", text: "Zone 13 en priority" }]],
  ["Delete pannu ellaam", "refuse"],
  ["District IQ-kitta kelu, edhu zone la pending complaints adhigam?", [{ a: "ask", q: "edhu zone la pending complaints adhigam?" }]]
];

function run(c: Case): { ok: boolean; got: Understood } {
  const [text, expect, state] = c;
  const got = understand(text, withState(state ?? {}), WORLD);
  if (typeof expect === "string") return { ok: got.kind === expect, got };
  return { ok: got.kind === "do" && JSON.stringify(got.steps) === JSON.stringify(expect), got };
}

function score(cases: Case[]) {
  const fails = cases.map((c) => ({ c, ...run(c) })).filter((r) => !r.ok);
  return { pct: Math.round(((cases.length - fails.length) / cases.length) * 1000) / 10, fails };
}

describe("Thunai golden set (rules only)", () => {
  for (const [name, cases, mark] of [["English", EN, 95], ["Tamil", TA, 90], ["Tanglish", TANGLISH, 90]] as const) {
    it(`${name}: ${cases.length} commands, pass mark ${mark}%`, () => {
      const { pct, fails } = score(cases as Case[]);
      if (fails.length) console.log(`${name} ${pct}%: failures\n` + fails.map((f) => `  ${f.c[0]} → ${JSON.stringify(f.got.kind === "do" ? f.got.steps : f.got.kind)}`).join("\n"));
      expect(pct).toBeGreaterThanOrEqual(mark);
    });
  }
  it("has at least 150 commands", () => expect(EN.length + TA.length + TANGLISH.length).toBeGreaterThanOrEqual(150));
});

describe("Thunai understanding: the rules that must always hold", () => {
  it("never applies a zone the Collector took back", () => {
    const r = understand("Show Adyar, no, Perungudi", START, WORLD);
    expect(r.kind === "do" && JSON.stringify(r.steps)).not.toContain("13");
  });
  it("reads 15 as 15, not 5, and 5 as 5", () => {
    const a = understand("பதினைந்தாவது மண்டலம்", START, WORLD);
    const b = understand("ஐந்தாவது மண்டலம்", START, WORLD);
    expect(a.kind === "do" && a.steps[0]).toEqual({ a: "view", view: { zone: 15 } });
    expect(b.kind === "do" && b.steps[0]).toEqual({ a: "view", view: { zone: 5 } });
  });
  it("does not read வாரியம் (board) as வாரம் (week)", () => {
    const r = understand("குடிநீர் வாரியம் மட்டும் காட்டு", START, WORLD);
    expect(r.kind === "do" && r.steps.some((s) => s.a === "period")).toBe(false);
  });
  it("explains why 7 became a zone when severity was touched last", () => {
    const r = understand("Change the filter to 7", withState(recentSev), WORLD);
    expect(r.kind === "do" && r.note?.en).toMatch(/not a severity option/);
  });
  it("sends a ward number beyond 15 to the map", () => {
    const r = understand("filter 30", START, WORLD);
    expect(r.kind === "do" && r.steps[0]).toEqual({ a: "map", q: "ward 30" });
  });
  it("refuses destructive requests without changing anything", () => {
    for (const t of ["Delete all the incidents", "remove every complaint", "Delete pannu ellaam"]) expect(understand(t, START, WORLD).kind).toBe("refuse");
  });
  it("one sentence with three filters is one transaction", () => {
    const r = understand("Adyar, weekly, critical only", START, WORLD);
    expect(r.kind === "do" && r.steps.filter((s) => s.a === "view").length).toBe(1);
  });
  it("a bare number clicks only while numbers are shown", () => {
    expect(understand("12", withState({ numbers: true }), WORLD)).toMatchObject({ kind: "do", steps: [{ a: "click", n: 12 }] });
    expect(understand("12", START, WORLD)).not.toMatchObject({ steps: [{ a: "click" }] });
  });
  it("sets a reminder for tomorrow 10 am", () => {
    const r = understand("Remind me tomorrow at 10 to check the Velachery drain", START, WORLD);
    expect(r.kind).toBe("do");
    const s = r.kind === "do" ? r.steps[0] : null;
    expect(s && s.a === "remind" && s.text).toBe("check the Velachery drain");
    const at = new Date(s && s.a === "remind" ? s.at : 0);
    expect([at.getDate(), at.getHours()]).toEqual([new Date(NOW + 86_400_000).getDate(), 10]);
  });
  it("replies in the language the Collector used", () => {
    expect(understand("Zone 7", START, WORLD).lang).toBe("en");
    expect(understand("Adyar-a kaatu", START, WORLD).lang).toBe("ta");
    expect(understand("அடையாறு காட்டு", START, WORLD).lang).toBe("ta");
  });
  it("uses a learned alias", () => {
    const r = understand("marina side", START, { ...WORLD, aliases: { "marina side": "zone 9" } });
    expect(r.kind === "do" && r.steps[0]).toEqual({ a: "view", view: { zone: 9 } });
  });
  it("is fast: parse and resolve under 50 ms at p90", () => {
    const all = [...EN, ...TA, ...TANGLISH];
    const ms: number[] = [];
    for (let k = 0; k < 3; k++) for (const c of all) { const t = performance.now(); understand(c[0], withState(c[2] ?? {}), WORLD); ms.push(performance.now() - t); }
    ms.sort((a, b) => a - b);
    const p50 = ms[Math.floor(ms.length * 0.5)], p90 = ms[Math.floor(ms.length * 0.9)];
    console.log(`Thunai rules latency: p50 ${p50.toFixed(2)} ms, p90 ${p90.toFixed(2)} ms over ${ms.length} runs`);
    expect(p90).toBeLessThan(50);
  });
});
