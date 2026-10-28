import { describe, expect, it } from "vitest";
import { deptFromWords } from "@/lib/assistant/deptwords";
import type { RefNames } from "@/lib/assistant/scope";
import { applyChip, planChips } from "./chips";
import { fixtureResolver } from "./fixture";
import type { Plan, Step } from "./plan";
import { makeResolver } from "./resolve";
import { distanceOf, editPlan, mapLang, periodOf, rulesRoute, type RouteEnv } from "./route";

const resolve = makeResolver(fixtureResolver());
const names: RefNames = {
  zones: new Map(), cats: new Map(), taluks: new Map(),
  depts: new Map(["GCC-SWD", "GCC-SWM", "POL-GCP", "CMWSSB", "PWD-WRD", "PWD-BLD", "TANGEDCO", "TNPCB"].map((c) => [c, { name: c, head: null, actionOwner: true }]))
};
const env: RouteEnv = { resolve, dept: (t) => deptFromWords(t, names)?.code ?? null };

/** A plan as one line: "inc:CAT:status:days[:flags] | layer | within:300 | in:zone13 | ..." */
function sig(p: Plan): string {
  return p.steps.map((s: Step) => {
    switch (s.op) {
      case "take": {
        if (s.layer !== "incidents") return s.where?.government ? `${s.layer}(gov)` : s.where?.kinds?.includes("clinic") && s.where.kinds.length === 1 ? "clinics" : s.layer;
        const f = s.filter!;
        const what = f.category?.join("+") ?? (f.family ? `F:${f.family.join("+")}` : "-");
        const per = f.period ? (f.period.kind === "last_days" ? String(f.period.days) : f.period.kind) : "all";
        const flags = [f.citizen ? "cit" : "", f.severity?.join("+") ?? "", f.overdue ? "overdue" : "", f.dept?.join("+") ?? ""].filter(Boolean);
        return ["inc", what, f.status, per, ...flags].join(":");
      }
      case "within": return `within:${s.meters}`;
      case "inside": return s.area.kind === "point" ? `in:pt:${s.area.ref}:${s.area.radius_m}` : s.area.kind === "taluk" ? `in:taluk:${s.area.code}` : `in:${s.area.kind}${"id" in s.area ? s.area.id : ""}`;
      case "along": return `along:${s.line}:${s.meters}`;
      case "nearest": return `nearest:${s.k}${s.from.startsWith("place:") ? `@${s.from.slice(6)}` : ""}`;
      case "farthest": return `far:${s.areas}:${s.beyond_m ?? "-"}`;
      case "count_by": return `by:${s.by}`;
      case "hotspot": return "hot";
      case "compare": {
        const a = (x: typeof s.a) => (x.kind === "taluk" ? `taluk:${x.code}` : x.kind === "point" ? `pt:${x.ref}` : `${x.kind}${"id" in x ? x.id : ""}`);
        return `cmp:${a(s.a)}:${a(s.b)}`;
      }
      case "change": return `chg:${s.now.kind === "last_days" ? s.now.days : s.now.kind}`;
    }
  }).join(" | ");
}
const route = (q: string) => {
  const r = rulesRoute(q, null, env);
  if (!r) return null;
  if (r.kind === "plan") return sig(r.plan);
  if (r.kind === "brief") return `BRIEF:${r.area.kind === "point" ? r.area.ref : r.area.kind === "taluk" ? r.area.code : `${r.area.kind}${"id" in r.area ? r.area.id : ""}`}`;
  if (r.kind === "say") return `SAY`;
  return `UI:${r.ui}`;
};

const FW = "inc:FLOOD_WATERLOGGING", FL = "inc:F:FLOOD", SW = "inc:SOLID_WASTE", RA = "inc:ROAD_ACCIDENT", TH = "inc:CRIME_PROPERTY";
const EN: [string, string][] = [
  ["waterlogging within 300 m of schools", `${FW}:open:30 | schools | within:300`],
  ["garbage near hospitals", `${SW}:open:30 | hospitals | within:500`],
  ["open complaints near Adyar", "inc:-:open:30:cit | in:pt:loc:Adyar:1000"],
  ["accidents near Koyambedu bus stand", `${RA}:open:30 | in:pt:osm:n78:500`],
  ["flooding in Zone 13 this week", `${FL}:open:7 | in:zone13`],
  ["streetlight problems in ward 178", "inc:STREETLIGHT_ELECTRICAL:open:30 | in:ward178"],
  ["Velachery taluk severe incidents", "inc:-:open:30:Severe | in:taluk:TLK-VLC"],
  ["thefts along Anna Salai this month", `${TH}:open:30 | along:road:anna-salai:75`],
  ["thefts along Mount Road", `${TH}:open:30 | along:road:anna-salai:75`],
  ["potholes on OMR", "inc:ROAD_DAMAGE:open:30 | along:road:rajiv-gandhi-salai:75"],
  ["accidents on GST Road", `${RA}:open:30 | along:road:gst-road:75`],
  ["incidents within 200 m of Buckingham Canal", "inc:-:open:30 | along:water:buckingham-canal:200"],
  ["waterlogging near lakes", `${FW}:open:30 | water_bodies | within:500`],
  ["nearest hospital to each open severe flooding case", `${FL}:open:30:Severe | hospitals | nearest:1`],
  ["5 nearest police stations to Marina", "police | nearest:5@loc:Marina"],
  ["which ward is farthest from a hospital", "hospitals | far:ward:-"],
  ["areas with no fire station within 3 km", "fire_stations | far:ward:3000"],
  ["garbage complaints by ward", `${SW}:open:30:cit | by:ward`],
  ["flooding zone wise this month", `${FL}:open:30 | by:zone`],
  ["where are garbage complaints clustering", `${SW}:any:90:cit | hot`],
  ["hotspots of road accidents", `${RA}:any:90 | hot`],
  ["compare Adyar and Velachery flooding", `${FL}:open:30 | cmp:zone13:taluk:TLK-VLC`],
  ["Zone 10 vs Zone 13 open cases", "inc:-:open:30 | cmp:zone10:zone13"],
  ["flooding this week vs last week in Zone 13", `${FL}:any:7 | in:zone13 | chg:7`],
  ["did accidents on Anna Salai go down this month?", `${RA}:any:30 | along:road:anna-salai:75 | chg:30`],
  ["past-deadline cases near hospitals", "inc:-:open:30:overdue | hospitals | within:500"],
  ["SWD's open cases near schools", "inc:-:open:30:GCC-SWD | schools | within:500"],
  ["open flooding within 500 m of hospitals", `${FL}:open:30 | hospitals | within:500`],
  ["severe incidents within 1 km of Stanley Hospital", "inc:-:open:30:Severe | in:pt:osm:n77:1000"],
  ["garbage within 2 km of T. Nagar", `${SW}:open:30 | in:pt:loc:T. Nagar:2000`],
  ["drainage complaints in Saidapet last 7 days", "inc:DRAINAGE_SEWAGE:open:7:cit | in:pt:loc:Saidapet:1000"],
  ["dengue cases near schools", "inc:VECTOR_DISEASE:open:30 | schools | within:500"],
  ["accidents near metro stations", `${RA}:open:30 | rail_metro | within:500`],
  ["garbage near schools and colleges", `${SW}:open:30 | schools | colleges | within:500`],
  ["waterlogging within half a km of government hospitals", `${FW}:open:30 | hospitals(gov) | within:500`],
  ["all incidents in Mylapore taluk today", "inc:-:any:1 | in:taluk:TLK-MYL"],
  ["closed garbage complaints in zone 1", `${SW}:closed:30:cit | in:zone1`],
  ["road accidents by zone", `${RA}:open:30 | by:zone`],
  ["theft hotspots", `${TH}:any:90 | hot`],
  ["flooding near Adyar River", `${FL}:open:30 | along:water:adyar-river:200`]
];
const TA: [string, string][] = [
  ["பள்ளிகள் அருகே மழைநீர் தேக்கம்", `${FW}:open:30 | schools | within:500`],
  ["அடையாறு அருகே திறந்த புகார்கள்", "inc:-:open:30:cit | in:pt:loc:Adyar:1000"],
  ["மண்டலம் 13 இல் இந்த வாரம் வெள்ளம்", `${FL}:open:7 | in:zone13`],
  ["வார்டு 178 இல் தெருவிளக்கு புகார்கள்", "inc:STREETLIGHT_ELECTRICAL:open:30:cit | in:ward178"],
  ["அண்ணா சாலையில் திருட்டு", `${TH}:open:30 | along:road:anna-salai:75`],
  ["மருத்துவமனைகள் அருகே குப்பை", `${SW}:open:30 | hospitals | within:500`],
  ["300 மீட்டர் க்குள் பள்ளிகள் அருகே வெள்ளம்", `${FL}:open:30 | schools | within:300`],
  ["வார்டு வாரியாக குப்பை புகார்கள்", `${SW}:open:30:cit | by:ward`],
  ["மண்டல வாரியாக சாலை விபத்துகள்", `${RA}:open:30 | by:zone`],
  ["வேளச்சேரி அருகே வெள்ளம்", `${FL}:open:30 | in:pt:loc:Velachery:1000`],
  ["சைதாப்பேட்டையில் என்ன நடக்கிறது", "BRIEF:loc:Saidapet"],
  ["ஏரிகள் அருகே நீர் தேக்கம்", `${FW}:open:30 | water_bodies | within:500`],
  ["கடுமையான வெள்ளம் மண்டலம் 13", `${FL}:open:30:Severe | in:zone13`],
  ["இந்த மாதம் திருட்டு கொத்து", `${TH}:any:30 | hot`],
  ["தீயணைப்பு நிலையங்கள் அருகே தீ விபத்து", "inc:FIRE_EXPLOSION:open:30 | fire_stations | within:500"],
  ["காவல் நிலையங்கள் அருகே திருட்டு", `${TH}:open:30 | police | within:500`],
  ["இன்று வெள்ளம் அடையாறு மண்டலம்", `${FL}:open:1 | in:zone13`],
  ["கடந்த 7 நாட்களில் குப்பை புகார்கள் வார்டு 170", `${SW}:open:7:cit | in:ward170`],
  ["டெங்கு பள்ளிகள் அருகே", "inc:VECTOR_DISEASE:open:30 | schools | within:500"],
  ["கழிவுநீர் புகார்கள் மருத்துவமனைகள் அருகே", "inc:DRAINAGE_SEWAGE:open:30:cit | hospitals | within:500"],
  ["பக்கிங்ஹாம் கால்வாய் அருகே சம்பவங்கள்", "inc:-:open:30 | along:water:buckingham-canal:200"],
  ["அடையாறு ஆறு அருகே வெள்ளம்", `${FL}:open:30 | along:water:adyar-river:200`],
  ["தி.நகர் அருகே குப்பை", `${SW}:open:30 | in:pt:loc:T. Nagar:1000`],
  ["அடையாறு மற்றும் வேளச்சேரி வெள்ளம் ஒப்பிடு", `${FL}:open:30 | cmp:zone13:taluk:TLK-VLC`],
  ["மண்டலம் 10 மற்றும் மண்டலம் 13 ஒப்பீடு திறந்த புகார்கள்", "inc:-:open:30:cit | cmp:zone10:zone13"],
  ["கடந்த வாரத்தை விட இந்த வாரம் வெள்ளம் குறைந்ததா மண்டலம் 13", `${FL}:any:7 | in:zone13 | chg:7`],
  ["மெரினா மிக அருகில் உள்ள மருத்துவமனை", "hospitals | nearest:1@loc:Marina"],
  ["தீயணைப்பு நிலையத்திலிருந்து தொலைவில் உள்ள வார்டு", "fire_stations | far:ward:-"],
  ["குப்பை எங்கே அதிகம் குவிந்த", `${SW}:any:90 | hot`],
  ["சாலை விபத்துகள் கொத்து", `${RA}:any:90 | hot`],
  ["மயிலாப்பூர் வட்டத்தில் கடுமையான சம்பவங்கள்", "inc:-:open:30:Severe | in:taluk:TLK-MYL"],
  ["இன்று திறந்த சம்பவங்கள் மண்டலம் 1", "inc:-:open:1 | in:zone1"],
  ["ரயில் நிலையங்கள் அருகே விபத்து", `${RA}:open:30 | rail_metro | within:500`],
  ["1 கி.மீ க்குள் பள்ளிகள் அருகே குப்பை", `${SW}:open:30 | schools | within:1000`],
  ["அரசு மருத்துவமனைகள் அருகே வெள்ளம்", `${FL}:open:30 | hospitals(gov) | within:500`],
  ["கல்லூரிகள் அருகே திருட்டு", `${TH}:open:30 | colleges | within:500`],
  ["காலக்கெடு தாண்டிய புகார்கள் பள்ளிகள் அருகே", "inc:-:open:30:cit:overdue | schools | within:500"],
  ["வார்டு 178 சுருக்கம்", "BRIEF:ward178"],
  ["கோயம்பேடு அருகே விபத்துகள்", `${RA}:open:30 | in:pt:loc:Koyambedu:1000`],
  ["அனைத்து சம்பவங்கள் மண்டலம் 13 இந்த வாரம்", "inc:-:any:7 | in:zone13"]
];
const TG: [string, string][] = [
  ["school pakkathula water stagnation", `${FW}:open:30 | schools | within:500`],
  ["adyar pakkathula open complaints", "inc:-:open:30:cit | in:pt:loc:Adyar:1000"],
  ["hospital kitta kuppai", `${SW}:open:30 | hospitals | within:500`],
  ["zone 13 la indha vaaram vellam", `${FL}:open:7 | in:zone13`],
  ["ward 178 la street light complaints", "inc:STREETLIGHT_ELECTRICAL:open:30:cit | in:ward178"],
  ["anna salai la thiruttu", `${TH}:open:30 | along:road:anna-salai:75`],
  ["OMR la accidents evlo", `${RA}:open:30 | along:road:rajiv-gandhi-salai:75`],
  ["velachery kitta vellam", `${FL}:open:30 | in:pt:loc:Velachery:1000`],
  ["ward wise kuppai complaints", `${SW}:open:30:cit | by:ward`],
  ["zone wise vibathu", `${RA}:open:30 | by:zone`],
  ["kuppai complaints enga adhigama irukku", `${SW}:any:90:cit | hot`],
  ["lake pakkathula water stagnation", `${FW}:open:30 | water_bodies | within:500`],
  ["300 m kulla school pakkathula vellam", `${FL}:open:30 | schools | within:300`],
  ["1 km kulla hospital pakkathula kuppai", `${SW}:open:30 | hospitals | within:1000`],
  ["marina pakkathula irukura 5 police station", "police | nearest:5@loc:Marina"],
  ["saidapet la enna nadakkudhu", "BRIEF:loc:Saidapet"],
  ["ward 170 la enna nadakuthu", "BRIEF:ward170"],
  ["adyar vs velachery vellam", `${FL}:open:30 | cmp:zone13:taluk:TLK-VLC`],
  ["zone 10 vs zone 13 open complaints", "inc:-:open:30:cit | cmp:zone10:zone13"],
  ["indha week vs last week vellam zone 13", `${FL}:any:7 | in:zone13 | chg:7`],
  ["severe vellam zone 13 la", `${FL}:open:30:Severe | in:zone13`],
  ["buckingham canal pakkathula incidents", "inc:-:open:30 | along:water:buckingham-canal:200"],
  ["t nagar pakkathula kuppai", `${SW}:open:30 | in:pt:loc:T. Nagar:1000`],
  ["koyambedu bus stand kitta accidents", `${RA}:open:30 | in:pt:osm:n78:500`],
  ["dengue school kitta", "inc:VECTOR_DISEASE:open:30 | schools | within:500"],
  ["fire station pakkathula fire accident", "inc:FIRE_EXPLOSION:open:30 | fire_stations | within:500"],
  ["police station kitta thiruttu", `${TH}:open:30 | police | within:500`],
  ["innaiki vellam adyar zone", `${FL}:open:1 | in:zone13`],
  ["mylapore taluk la severe incidents", "inc:-:open:30:Severe | in:taluk:TLK-MYL"],
  ["metro station pakkathula vibathu", `${RA}:open:30 | rail_metro | within:500`],
  ["closed kuppai complaints zone 1 la", `${SW}:closed:30:cit | in:zone1`],
  ["evlo open complaints ward 178 la", "inc:-:open:30:cit | in:ward178"],
  ["college pakkathula thiruttu", `${TH}:open:30 | colleges | within:500`],
  ["govt hospital kitta vellam", `${FL}:open:30 | hospitals(gov) | within:500`],
  ["adyar river pakkathula vellam", `${FL}:open:30 | along:water:adyar-river:200`],
  ["half km kulla school pakkathula kuppai", `${SW}:open:30 | schools | within:500`],
  ["theft hotspot evlo", `${TH}:any:90 | hot`],
  ["SWD open cases school pakkathula", "inc:-:open:30:GCC-SWD | schools | within:500"],
  ["past deadline complaints hospital kitta", "inc:-:open:30:cit:overdue | hospitals | within:500"],
  ["gst road la vibathu", `${RA}:open:30 | along:road:gst-road:75`]
];

const results: { q: string; ok: boolean }[] = [];
describe.each([["English", EN], ["Tamil", TA], ["Tanglish", TG]] as const)("rules router: %s", (_lang, cases) => {
  it.each(cases)("%s", (q, want) => {
    const got = route(q);
    results.push({ q, ok: got === want });
    expect(got).toBe(want);
  });
});

describe("coverage", () => {
  it("at least 80 % of the 120 questions are answered by the rules, with no AI", () => {
    const all = [...EN, ...TA, ...TG];
    expect(all).toHaveLength(120);
    const ok = all.filter(([q, want]) => route(q) === want).length;
    // the measured share is printed for the phase report
    console.log(`rule-only coverage: ${ok}/${all.length} = ${Math.round((100 * ok) / all.length)} %`);
    expect(ok / all.length).toBeGreaterThanOrEqual(0.8);
  });
});

describe("languages, distances and periods", () => {
  it.each([["thefts along Anna Salai", "en"], ["school pakkathula water stagnation", "tanglish"], ["பள்ளிகள் அருகே வெள்ளம்", "ta"], ["garbage near schools", "en"]])("%s -> %s", (q, l) => {
    expect(mapLang(q, resolve(q, null))).toBe(l);
  });
  it.each([["300 m", 300], ["300 meters", 300], ["1.5 km", 1500], ["half a km", 500], ["300 மீட்டர்", 300], ["2 கி.மீ", 2000], ["அரை கிலோமீட்டர்", 500], ["within 75m", 75]])("%s", (t, m) => {
    expect(distanceOf(t)).toBe(m);
  });
  it("periods", () => {
    expect(periodOf("this week")).toEqual({ kind: "last_days", days: 7, offset: 0 });
    expect(periodOf("last 10 days")).toEqual({ kind: "last_days", days: 10, offset: 0 });
    expect(periodOf("இந்த மாதம்")).toEqual({ kind: "last_days", days: 30, offset: 0 });
    expect(periodOf("all time")).toBe("all");
    expect(periodOf("garbage")).toBeNull();
  });
  it("out of scope is said plainly", () => {
    expect(route("how long to drive from Adyar to Saidapet")).toBe("SAY");
    expect(route("will it flood tomorrow in zone 13")).toBe("SAY");
    expect(route("what is the complainant's phone number")).toBe("SAY");
    expect(route("5 nearest hospitals to Xyzpuram")).toBe("SAY");
  });
});

describe("follow-ups edit exactly one part of the plan", () => {
  const first = rulesRoute("waterlogging within 300 m of schools", null, env);
  if (first?.kind !== "plan") throw new Error("first plan");
  const base = first.plan;
  const diff = (a: Plan, b: Plan) => {
    const out: string[] = [];
    const walk = (x: unknown, y: unknown, p: string) => {
      if (JSON.stringify(x) === JSON.stringify(y)) return;
      if (x && y && typeof x === "object" && typeof y === "object" && Array.isArray(x) === Array.isArray(y) && (!Array.isArray(x) || (x as unknown[]).length === (y as unknown[]).length)) {
        for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk((x as never)[k], (y as never)[k], `${p}.${k}`);
        return;
      }
      out.push(p);
    };
    walk(a, b, "");
    return out;
  };
  const edit = (t: string) => { const r = editPlan(t, base, env); if (r?.kind !== "plan") throw new Error(`no edit for ${t}`); return r; };
  it("only severe", () => expect(diff(base, edit("only severe").plan)).toEqual([".steps.0.filter.severity"]));
  it("make it 500 m", () => expect(diff(base, edit("make it 500 m").plan)).toEqual([".steps.2.meters"]));
  it("last 7 days", () => expect(diff(base, edit("last 7 days").plan)).toEqual([".steps.0.filter.period.days"]));
  it("add hospitals", () => {
    const p = edit("add hospitals").plan;
    expect(p.steps.map((s) => s.op)).toEqual(["take", "take", "take", "within"]);
    expect((p.steps[3] as Extract<Step, { op: "within" }>).near).toHaveLength(2);
  });
  it("compare with Adyar", () => {
    const p = edit("compare with Adyar").plan;
    const c = p.steps.at(-1) as Extract<Step, { op: "compare" }>;
    expect(c.op).toBe("compare");
    expect(c.b).toEqual({ kind: "zone", id: 13 });
    expect(p.show).toBe(c.as);
  });
  it("show by ward", () => {
    const p = edit("show by ward").plan;
    expect(p.steps.at(-1)).toMatchObject({ op: "count_by", by: "ward", of: "near" });
  });
  it("why these? opens the trace; send these to SWD; start over", () => {
    expect(editPlan("why these?", base, env)).toMatchObject({ kind: "ui", ui: "open_trace" });
    expect(editPlan("send these to SWD", base, env)).toMatchObject({ kind: "ui", ui: "send", dept: "GCC-SWD" });
    expect(editPlan("start over", base, env)).toMatchObject({ kind: "ui", ui: "clear" });
  });
  it("a new topic is not an edit", () => expect(editPlan("garbage near hospitals", base, env)).toBeNull());
  it("chips: edit 300 m to 500 m, remove severity, every chip names its part", () => {
    const chips = planChips(base, { cat: (c) => c, dept: (d) => d, area: () => ({ en: "", ta: "" }), line: () => ({ en: "", ta: "" }) }, first.defaults);
    expect(chips.map((c) => c.part)).toEqual(["category", "status", "period", "severity", "distance", "facility"]);
    expect(chips.find((c) => c.part === "status")!.isDefault).toBe(true);
    const p500 = applyChip(base, "d:near", "500")!;
    expect(diff(base, p500)).toEqual([".steps.2.meters"]);
    expect(applyChip(base, "d:near", "9000")).toBeNull();
    const sev = applyChip(base, "severity", "severe")!;
    expect(diff(base, sev)).toEqual([".steps.0.filter.severity"]);
  });
});
