import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { awsPool } from "@/lib/aws/store";
import type { JsonCall, JsonResult } from "@/lib/ai/gateway";
import { serverHands } from "@/lib/thunai/data";
import { Ledger, MemoryStore } from "@/lib/thunai/ledger";
import { isNavCommand, isPlainMove, isReflex } from "@/lib/thunai/plan";
import { planRisk } from "@/lib/thunai/risk";
import { clearCaches, planRound, RoundBody, type RoundOut } from "@/lib/thunai/round";
import { idsOf, type StageContext, type StageDocT } from "@/lib/thunai/stage";
import { localStageCommand, pushScreen, stageEmpty, stageReducer, type LocalCmd } from "@/lib/thunai/stagelocal";
import { understand } from "@/lib/thunai/understand";
import type { World } from "@/lib/thunai/types";
import { referenceWorld, serverWorld } from "@/lib/thunai/world";

/**
 * QA pass 4, audit of fixed bugs (understanding). Each earlier "fixed" row is driven again on the real round (planRound, the route's
 * only call) over the pinned snapshot, with no model key, so that only the code lanes answer. it(...) is what still holds. it.fails(...)
 * is a finding in docs/qa/pass4/findings/audit-understanding.json, named by its id: the fixer changes it to it(...).
 *   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/audit-understanding.test.ts
 * The same sentences were driven over HTTP (audit-understanding.drive.mjs) and, where a screen state matters, in a browser (audit-understanding.browser.mjs).
 * The browser runs the rules before any round, and a round-level "holds" says nothing about a sentence the rules take alone: actsAlone below is that check.
 */
const START = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
const FROZEN = new Date("2026-11-06T06:30:00.000Z");
let world: World;
let hands: ReturnType<typeof serverHands>;
let n = 0;

beforeAll(async () => {
  vi.useFakeTimers({ now: FROZEN, toFake: ["Date"] });
  world = await serverWorld();
  hands = serverHands({ email: "qa.collector@example.test", role: "collector", lockDept: null } as never);
}, 300_000);
afterAll(() => { vi.useRealTimers(); clearCaches(); });

interface Opts { state?: Record<string, unknown>; stage?: StageContext | null; turns?: { heard: string; did: string }[]; direct?: { recipe: string; slots: Record<string, unknown>; lang: string } | null }
const round = (text: string, o: Opts = {}): Promise<RoundOut> => planRound(RoundBody.parse({ turnId: `au-${n++}`, round: 0, text, state: { ...START, ...(o.state ?? {}) }, turns: o.turns ?? [], lastText: null, stage: o.stage ?? null, stageDigest: null, direct: o.direct ?? null }), world, hands, "audit", { notes: [], habits: {} });
const stageOf = (r: RoundOut) => r.result?.stage as StageDocT | null | undefined;
const slotsOf = (r: RoundOut) => (stageOf(r)?.slots ?? {}) as Record<string, unknown>;
const zonesOf = (r: RoundOut) => (slotsOf(r).zones ?? []) as number[];
const listOf = (r: RoundOut) => stageOf(r)?.blocks.find((b) => b.kind === "CaseList") as Extract<StageDocT["blocks"][number], { kind: "CaseList" }> | undefined;
const caseOf = (r: RoundOut) => stageOf(r)?.blocks.find((b) => b.kind === "CaseDetail") as Extract<StageDocT["blocks"][number], { kind: "CaseDetail" }> | undefined;
const kpi = (r: RoundOut, key: string) => (stageOf(r)?.blocks.find((b) => b.kind === "Kpis") as { items: { key: string; value: number }[] } | undefined)?.items.find((x) => x.key === key)?.value;
const isPoliceBrief = (r: RoundOut) => stageOf(r)?.recipe === "brief" && slotsOf(r).dept === "POL-GCP";
const rules = (text: string) => understand(text, { ...START, list: [], lastFilter: null, now: Date.now() } as never, world) as { kind: string; confidence?: number; steps?: { a: string; view?: { dept?: string } }[] };
/** the police filter would go on at once, with no model and nothing said: what the console does with the rules' answer */
const policeFilterOn = (text: string) => {
  const u = rules(text);
  return u.kind === "do" && (u.confidence ?? 0) >= 0.9 && isNavCommand(text, (u.steps ?? []) as never) && (u.steps ?? []).some((s) => s.a === "view" && s.view?.dept === "POL-GCP");
};

/** the browser takes the sentence itself, with no round and nothing said: the same conditions as Thunai.tsx:1177-1183 */
const actsAlone = (text: string) => {
  const st = { ...START, list: [], lastFilter: null, now: Date.now() } as never;
  const u = understand(text, st, world, { speechConf: 0.95 }) as { kind: string; confidence?: number; steps?: never[] };
  const steps = (u.steps ?? []) as never[];
  return u.kind === "do" && (isReflex(steps, st) || ((u.confidence ?? 0) >= 0.9 && planRisk(steps) === "A" && (isPlainMove(steps) || isNavCommand(text, steps))));
};

// --------------------------------------------------------------------------------------------- what still holds

describe("BUG-001 holds on the round: a report on a named body is a brief, not a list (for the browser, see audit-understanding-23)", () => {
  for (const s of ["chennai city police report", "Chennai City Police report please", "சென்னை காவல்துறை அறிக்கை", "சென்னை போலீஸ் ரிப்போர்ட் கொடு", "chennai police report kudu", "GCP status", "போலீஸ் நிலவரம் சொல்லு", "police nilavaram sollu"])
    it(s, async () => { const r = await round(s); expect(r.lane).toBe("resolve"); expect(isPoliceBrief(r)).toBe(true); expect(listOf(r)).toBeUndefined(); });
  it("the corporation and Metrowater too", async () => {
    expect(slotsOf(await round("give me the corporation update")).org).toBe("GCC");
    expect(slotsOf(await round("Metrowater report")).dept).toBe("CMWSSB");
  });
});

describe("BUG-002 holds for the named cities: no Chennai filter or brief", () => {
  for (const s of ["Mumbai police", "filter Coimbatore police", "மும்பை போலீஸ்", "கோயம்புத்தூர் காவல்துறை", "கோவை போலீஸ் பில்டர் பண்ணு", "Coimbatore police filter pannu", "Mumbai police cases kaattu", "show Delhi police cases", "filter by Bangalore police", "மதுரை போலீஸ் கேஸ் காட்டு"])
    it(s, async () => { const r = await round(s); expect(isPoliceBrief(r)).toBe(false); expect(policeFilterOn(s)).toBe(false); });
  it("Mumbai police report says it has no data", async () => {
    const r = await round("Mumbai police report");
    expect(r.result?.reply).toMatch(/^I have no data on Mumbai Police\./);
  });
});

describe("BUG-003 holds where the period is read: the brief says its own period", () => {
  for (const [s, title] of [["district brief this week", "this week"], ["give me the brief for this month", "the last 30 days"], ["brief me on the last quarter", "the last 90 days"], ["indha maasam brief sollu", "the last 30 days"], ["indha vaaram brief sollu", "this week"], ["இந்த மாதம் சுருக்கம்", "the last 30 days"], ["police report this week", "this week"], ["போலீஸ் அறிக்கை இந்த மாதம்", "the last 30 days"], ["today's brief", "today"]] as const)
    it(s, async () => {
      const d = stageOf(await round(s))!;
      expect(d.title).toContain(title);
      if (title !== "today") expect(d.say.en).not.toMatch(/\btoday's brief\b|in the brief for today|came in today/);
    });
});

describe("BUG-005 holds: the skeptic's own breaks", () => {
  for (const s of ["full police report", "Jarvis police report"]) it(`${s} is our police`, async () => expect(isPoliceBrief(await round(s))).toBe(true));
  it("export police report is not called a body", async () => expect((await round("export police report")).result?.reply ?? "").not.toMatch(/Export Police/));
  for (const s of ["Mylapur police report", "Chetpet police report", "Anna Salai police report", "தி நகர் போலீஸ் அறிக்கை"]) it(`${s} is not called foreign`, async () => { const r = await round(s); expect(r.result?.note).not.toBe("unknown-entity"); expect(isPoliceBrief(r)).toBe(true); });
  for (const [s, heard] of [["Madurai police report", "Madurai Police"], ["Chengai police report", "Chengai Police"], ["Coimbatore city traffic police report", "Coimbatore Police"]] as const) it(`${s} has no data`, async () => expect((await round(s)).result?.reply).toContain(`I have no data on ${heard}`));
  it("police in Mumbai is not a brief", async () => expect(isPoliceBrief(await round("police in Mumbai"))).toBe(false));
  for (const [s, recipe] of [["Poondi reservoir level", "readings"], ["police news", "news"], ["reservoir report", "readings"], ["air quality report", "readings"], ["மழை அறிக்கை", "readings"], ["ஏரி அறிக்கை", "readings"]] as const) it(`${s} keeps its own screen`, async () => expect(stageOf(await round(s))?.recipe).toBe(recipe));
  for (const s of ["compare police and corporation", "show incident INC-1234", "draft a note to the police", "where is the nearest police station", "போலீஸ் மற்றும் மாநகராட்சி ஒப்பிடு", "report a pothole in Adyar"]) it(`${s} is not a brief`, async () => expect(isPoliceBrief(await round(s))).toBe(false));
  it("a two-word zone does not beat the body", async () => { const r = await round("Anna Nagar police report"); expect(isPoliceBrief(r)).toBe(true); expect(zonesOf(r)).toEqual([8]); });
  it("a locality in the reference is said, not dropped", async () => {
    for (const s of ["Velachery police report", "மயிலாப்பூர் போலீஸ் ரிப்போர்ட்", "Velachery la police report kudu"]) expect(stageOf(await round(s))?.say.en).toMatch(/I can't narrow these records to/);
  });
});

describe("BUG-020 holds for the original words", () => {
  let stage: StageContext;
  beforeAll(async () => {
    const d = stageOf(await round("chennai city police report"))!;
    stage = { recipe: d.recipe, title: d.title, focus: null, slots: d.slots, blocks: d.blocks.map((b) => ({ kind: b.kind, ids: idsOf(b).slice(0, 30) })) } as StageContext;
  });
  const turns = [{ heard: "chennai city police report", did: "brief" }];
  for (const s of ["explain the flooding complaint in Adyar", "tell me about the flooding complaint in Adyar", "அடையாறு வெள்ள புகார் விளக்கமா சொல்லுங்க", "அடையாறு வெள்ளம் பற்றி விளக்குங்க", "Adyar flooding complaint pathi explain pannu", "Adyar flooding complaint ah simple ah sollu"])
    it(s, async () => { const r = await round(s, { stage, turns }); expect(stageOf(r)?.recipe).toBe("case"); expect(caseOf(r)?.incident.zoneName).toBe("Adyar"); expect(String(caseOf(r)?.incident.cat)).toMatch(/Flooding/); });
  for (const s of ["and in Adyar", "what about Adyar", "same for Adyar", "அடையாறு மட்டும்"])
    it(`a real follow-up still re-scopes: ${s}`, async () => { const r = await round(s, { stage, turns }); expect(isPoliceBrief(r)).toBe(true); expect(zonesOf(r)).toEqual([13]); });

  // audit-understanding-7: the same request in other everyday words
  for (const s of ["describe the flooding complaint in Adyar", "summarize the flooding complaint in Adyar", "what's the flooding complaint in Adyar", "அடையாறு வெள்ள புகார் பத்தி சொல்லு", "அடையாறு வெள்ளம் பத்தி சொல்லுங்க", "அடையாறுல வெள்ளம் புகார் என்ன ஆச்சு", "Adyar flooding complaint pathi sollu", "Adyar flooding complaint enna aachu"])
    it(`audit-understanding-7 police brief open, ${s}: not the police brief re-scoped`, async () => expect(isPoliceBrief(await round(s, { stage, turns }))).toBe(false));
});

describe("audit-understanding-7, other screens open", () => {
  it("the original words hold with a corporation brief open", async () => {
    const d = stageOf(await round("give me the corporation update"))!;
    const stage = { recipe: d.recipe, title: d.title, focus: null, slots: d.slots, blocks: d.blocks.map((b) => ({ kind: b.kind, ids: idsOf(b).slice(0, 30) })) } as StageContext;
    expect(stageOf(await round("explain the flooding complaint in Adyar", { stage, turns: [{ heard: "give me the corporation update", did: "brief" }] }))?.recipe).toBe("case");
  });
  for (const [open, s] of [["give me the corporation update", "describe the flooding complaint in Adyar"], ["give me the corporation update", "அடையாறு வெள்ள புகார் பத்தி சொல்லு"], ["Metrowater report", "Adyar flooding complaint pathi sollu"], ["சென்னை காவல்துறை அறிக்கை", "describe the flooding complaint in Adyar"]] as const)
    it(`audit-understanding-7 ${open} open, ${s}: not that body's brief re-scoped`, async () => {
      const d = stageOf(await round(open))!;
      const stage = { recipe: d.recipe, title: d.title, focus: null, slots: d.slots, blocks: d.blocks.map((b) => ({ kind: b.kind, ids: idsOf(b).slice(0, 30) })) } as StageContext;
      expect(stageOf(await round(s, { stage, turns: [{ heard: open, did: "brief" }] }))?.recipe).not.toBe("brief");
    });
});

describe("BUG-022 holds on the round for the original English words (for the browser, see audit-understanding-23)", () => {
  for (const s of ["remember to check the police report", "remember to check the police report tomorrow", "remind me at 5 pm to read the police report", "save this view as police report", "type police report in the search box", "pin the corporation status", "make a note to read the police report", "police report paakanum nu remind pannu", "police report save pannu", "police report ah type pannu"])
    it(s, async () => expect(stageOf(await round(s))?.recipe).not.toBe("brief"));
  it("the rules still read the note", () => expect(rules("remember to check the police report").steps?.[0]?.a).toBe("remember"));
});

describe("BUG-023 holds for naming by category, on real records", () => {
  for (const s of ["explain the road accident in Adyar", "அடையாறு விபத்து புகார் விளக்குங்க", "Adyar road accident enna aachu", "Adyar la accident pathi simple ah sollu"])
    it(s, async () => expect(stageOf(await round(s))?.say.en).toMatch(/^There('s| was) a road accident/));
});

describe("BUG-024 holds for the original words: only the overdue ones", () => {
  for (const s of ["severe cases past the deadline", "Severe cases past the deadline", "which severe cases are overdue", "overdue high priority cases in Adyar", "severe cases past their deadline in Adyar", "severe cases deadline crossed", "overdue severe cases kaattu"])
    it(s, async () => {
      const r = await round(s);
      expect(slotsOf(r).status).toBe("overdue");
      expect(listOf(r)!.rows.length).toBeGreaterThan(0);
      expect(listOf(r)!.rows.every((x) => x.overdue)).toBe(true);
    });
  it("severe cases alone are not narrowed", async () => expect(slotsOf(await round("show me the severe cases")).status ?? null).toBeNull());
});

describe("BUG-030 holds for the bodies and places on its list", () => {
  for (const [s, en] of [["திருச்சி காவல்துறை அறிக்கை", "Trichy Police"], ["திருச்சி போலீஸ் ரிப்போர்ட்", "Trichy Police"], ["திருச்சியில் போலீஸ் நிலவரம்", "Trichy Police"], ["போலீஸ் அறிக்கை திருச்சி", "Trichy Police"], ["Trichy police report kudu", "Trichy Police"], ["railway police report", "Railway Police"], ["ரயில்வே போலீஸ் அறிக்கை", "Railway Police"], ["railway police nilavaram sollu", "Railway Police"], ["income tax department report", "Income Tax Department"], ["வருமான வரித் துறை அறிக்கை", "Income Tax Department"]] as const)
    it(s, async () => { const r = await round(s); expect(r.result?.note).toBe("unknown-entity"); expect(r.result?.reply).toContain(en); });
});

describe("BUG-032 holds for the original words", () => {
  for (const s of ["திருவொற்றியூர்ல தெருவிளக்கு புகார்கள் காட்டுங்க", "அடையாறு தெருவிளக்கு புகார்கள் காட்டு", "அடையார் தெரு விளக்கு புகார்கள் காட்டு", "அடையாறு தெரு விளக்கு புகார் காட்டு", "Adyar la street light complaints kaattu"])
    it(`${s} is a street-light list`, async () => { const r = await round(s); expect(stageOf(r)?.recipe).toBe("cases"); expect(listOf(r)!.rows.every((x) => /Street lights/.test(String(x.cat)))).toBe(true); });
  for (const s of ["tell me about the severe cases in Adyar", "explain the severe cases in Adyar", "அடையாறு கடுமையான புகார்கள் விளக்குங்க", "Adyar la severe cases explain pannu"])
    it(`${s} is the severe list`, async () => { const r = await round(s); expect(stageOf(r)?.recipe).toBe("cases"); expect(slotsOf(r).sev).toBe("Severe"); });
  for (const s of ["explain the rise in dengue", "explain the rise in dengue cases in Adyar", "explain the dengue spike", "explain why dengue went up", "explain the jump in flooding in Adyar", "டெங்கு அதிகரிப்பு விளக்குங்க", "டெங்கு ஏன் அதிகமாச்சு விளக்குங்க"])
    it(`${s} is not one case`, async () => expect(stageOf(await round(s))?.recipe).not.toBe("case"));
  for (const s of ["அடையாறு வெள்ள புகார் விளக்கமா சொல்லுங்க", "அடையாறு வெள்ள புகார் விளக்கமாக சொல்லுங்கள்", "அடையாறு வெள்ள புகார் விளக்கி சொல்லு", "Adyar flooding complaint vilakkama sollu"])
    it(`${s} is the flooding case in Adyar`, async () => { const c = caseOf(await round(s)); expect(c?.incident.zoneName).toBe("Adyar"); expect(String(c?.incident.cat)).toMatch(/Flooding/); });
  for (const s of ["explain the power cut complaint in Ambattur", "tell me about the power cut complaint in Ambattur", "அம்பத்தூர் மின்வெட்டு புகார் விளக்கமா சொல்லுங்க", "அம்பத்தூர் பவர் கட் புகார் என்ன ஆச்சு", "Ambattur power cut complaint ah simple ah sollu", "explain the tanker complaint in Adyar"])
    it(`${s} is not the zone's top case`, async () => expect(stageOf(await round(s))?.recipe).not.toBe("case"));
});

describe("BUG-033 holds: every category keeps its own name, on real records", () => {
  // written from each category's own label, not copied from narrate.ts
  const NAME: Record<string, RegExp> = { FLOOD_WATERLOGGING: /standing water/, FLOOD_RELIEF: /flood relief/, WATERBODY_INFRA: /lake or bund/, FLOOD_RISK_SIGNAL: /weather or flood warning/, DRAINAGE_SEWAGE: /drainage or sewage/, DRAIN_WORKS_SAFETY: /drain worksite/, ROAD_DAMAGE: /damaged road/, ROAD_ACCIDENT: /road accident/, TRAFFIC_OBSTRUCTION: /traffic blockage/, ENCROACHMENT: /encroachment/, BUILDING_SAFETY: /unsafe building or wall/, SOLID_WASTE: /garbage/, SANITATION_TOILETS: /public toilet/, STREETLIGHT_ELECTRICAL: /street light or electrical/, DARK_SPOT_SAFETY: /dark spot/, VECTOR_DISEASE: /mosquito or water-borne/, FOOD_SAFETY: /food safety/, STRAY_ANIMALS: /stray animal/, HEALTH_SERVICES: /hospital or health/, AIR_POLLUTION: /bad air/, TREES_PARKS: /tree or park/, CRIME_PROPERTY: /crime report/, CRIME_VIOLENT: /crime report/, CRIMES_AGAINST_WOMEN: /crime report/, SUICIDE_SELF_HARM: /self-harm/, FIRE_EXPLOSION: /a fire/, MISSING_PERSON: /missing person/, DRUGS_LIQUOR: /drugs or illicit liquor/, PUBLIC_ORDER: /protest or public nuisance/, POLICE_OTHER: /police matter/, PUBLIC_WORKS: /public works or worksite/, WATER_SUPPLY: /drinking-water/, CIVIC_FACILITIES: /civic building/, ADMIN_SERVICES: /tax, certificate or election/, OTHER: /an issue/ };
  it("three records of each of the 35 categories", async () => {
    const cats = referenceWorld().cats;
    expect(cats.length).toBe(35);
    for (const c of cats) {
      const l = await round("audit", { direct: { recipe: "cases", slots: { cat: c.code, zones: [], period: "quarterly", n: 30, fresh: true }, lang: "en" } });
      for (const row of listOf(l)!.rows.slice(0, 3)) {
        const d = stageOf(await round("audit", { direct: { recipe: "case", slots: { id: row.id }, lang: "en" } }))!;
        expect(d.say.en, `${c.code} ${row.id}`).toMatch(NAME[c.code]);
        expect(d.say.en, `${c.code} ${row.id}`).not.toMatch(/sewage overflow|structure that has given way|fallen tree/i);
        expect(d.say.ta, `${c.code} ${row.id}`).toMatch(/[஀-௿]/);
      }
    }
  }, 180_000);
});

// ---------------------------------------------------------------------------------------- the findings, still open

describe("audit-understanding-1 P0: overdue cases are said not to exist", () => {
  for (const s of ["overdue cases this week", "overdue cases today", "overdue cases in Adyar", "cases past the deadline this week", "overdue complaints this month", "overdue garbage complaints this week", "overdue cases in Adyar kaattu", "இந்த வாரம் கெடு தாண்டிய புகார்கள் காட்டு", "அடையாறு கெடு தாண்டிய புகார்கள் காட்டு", "high priority cases past the deadline this week"])
    it(`audit-understanding-1 ${s}: the list is not empty`, async () => expect(listOf(await round(s))?.rows.length ?? 0).toBeGreaterThan(0));
  it("the severe list of the same week has overdue cases, so the empty answers are false", async () => {
    expect(listOf(await round("severe cases past deadline this week"))!.total).toBeGreaterThan(0);
    expect(listOf(await round("overdue high priority cases in Adyar"))!.total).toBeGreaterThan(0);
  });
});

describe("audit-understanding-2 P0: past-deadline figures are counted from one page", () => {
  it("audit-understanding-2 severe cases past deadline this week: every case on an overdue list is overdue, so the two figures agree", async () => {
    const r = await round("severe cases past deadline this week");
    expect(kpi(r, "late")).toBe(listOf(r)!.total);
  });
  it("audit-understanding-2 the line does not say fewer are late than the list counts", async () => {
    const r = await round("severe cases past deadline this week");
    const total = listOf(r)!.total;
    expect(stageOf(r)!.say.en).toContain(`${total} are past their deadline`);
  });
  it("audit-understanding-2 severe cases this week: the figure counts more than the page", async () => {
    const r = await round("severe cases this week");
    const overdue = listOf(await round("severe cases past deadline this week"))!.total;
    expect(kpi(r, "late")).toBe(overdue);
  });
});

describe("audit-understanding-3 P0: another town's police puts our police filter on (BUG-002)", () => {
  for (const s of ["filter Kumbakonam police", "கும்பகோணம் போலீஸ் பில்டர் போடு", "Nagercoil police filter pannu", "filter Pollachi police", "filter Karaikudi police"])
    it(`audit-understanding-3 ${s}: no filter`, () => expect(policeFilterOn(s)).toBe(false));
});

describe("audit-understanding-4 P0: another place's or kind of body gets a Chennai brief (BUG-030)", () => {
  for (const s of ["Kumbakonam police report", "கும்பகோணம் போலீஸ் அறிக்கை", "Nagercoil police report", "நாகர்கோவில் காவல்துறை அறிக்கை", "பொள்ளாச்சி போலீஸ் ரிப்போர்ட்", "காரைக்குடி மாநகராட்சி அறிக்கை", "Thirupathi police report", "airport police report", "central police report", "Sivakasi police report", "Rameswaram police report", "Kodaikanal police report", "கொடைக்கானல் போலீஸ் அறிக்கை", "Tiruchendur police report", "London police report", "Dubai police report", "Singapore police report", "துபாய் போலீஸ் அறிக்கை", "Pondy police report", "TN police report", "state police report", "Kumbakonam corporation report"])
    it(`audit-understanding-4 ${s}: no Chennai brief`, async () => expect(stageOf(await round(s))?.recipe).not.toBe("brief"));
});

describe("audit-understanding-5 P0: an ordinary Tamil word is heard as a zone by sound (BUG-005)", () => {
  for (const [s, zone] of [["இந்த வாரம் நிலவரம்", 3], ["இந்த வாரம் சுருக்கம் சொல்லு", 3], ["இந்த வாரம் அறிக்கை", 3], ["காலாண்டு சுருக்கம்", 12], ["காலாண்டு அறிக்கை", 12], ["ஆட்சியர் சுருக்கம்", 13], ["ஆட்சியர் நிலவரம்", 13], ["மாநில நிலவரம்", 2], ["மாநில காவல்துறை அறிக்கை", 2], ["maanila report", 2], ["Manila report", 2], ["ஆட்சியர் அறிக்கை", 13], ["மாவட்ட ஆட்சியர் சுருக்கம்", 13]] as const)
    it(`audit-understanding-5 ${s}: not zone ${zone}`, async () => expect(zonesOf(await round(s))).not.toContain(zone));
});

describe("audit-understanding-6 P0: any 'Anna' is Anna Nagar (BUG-005)", () => {
  for (const s of ["Anna Salai police report", "அண்ணா சாலை போலீஸ் அறிக்கை", "Anna Salai la police report", "Anna Salai status", "Anna University status", "Anna University police report", "Anna Arivalayam status", "Anna flyover report"])
    it(`audit-understanding-6 ${s}: not Anna Nagar's figures`, async () => expect(zonesOf(await round(s))).not.toContain(8));
});

describe("audit-understanding-8 P0: a place with no zone is dropped from 'explain', and another place's case is told (BUG-032)", () => {
  for (const [s, place] of [["explain the garbage complaint in Mylapore", /mylapore/i], ["மயிலாப்பூர் குப்பை புகார் விளக்குங்க", /mylapore/i], ["explain the flooding complaint in Velachery", /velachery/i], ["வேளச்சேரி வெள்ள புகார் விளக்கமா சொல்லுங்க", /velachery/i], ["Velachery flooding complaint pathi simple ah explain pannu", /velachery/i]] as const)
    it.fails(`audit-understanding-8 ${s}: the case told is in that place`, async () => expect(String(caseOf(await round(s))?.incident.place ?? "(no case)")).toMatch(place));
  it.fails("audit-understanding-8 explain the accident on OMR: the case told is on OMR", async () => expect(String(caseOf(await round("explain the accident on OMR"))?.incident.place ?? "(no case)")).toMatch(/\bOMR\b|Rajiv Gandhi|Old Mahabalipuram/i));
  for (const s of ["explain the flooding complaint in Madurai", "explain the flooding complaint in Anna Salai"])
    it(`audit-understanding-8 ${s}: no case from somewhere else`, async () => expect(stageOf(await round(s))?.recipe).not.toBe("case"));
});

describe("audit-understanding-9 P1: keeping or typing a report in Tamil or other words is lost to a brief (BUG-022)", () => {
  for (const s of ["போலீஸ் ரிப்போர்ட் பார்க்க நினைவூட்டு", "போலீஸ் அறிக்கையை பார்க்க நினைவில் வை", "போலீஸ் அறிக்கையை ஞாபகம் வச்சுக்கோ", "நாளைக்கு போலீஸ் அறிக்கை பார்க்கணும்னு ஞாபகப்படுத்து", "போலீஸ் ரிப்போர்ட் சேவ் பண்ணு", "போலீஸ் ரிப்போர்ட் டைப் பண்ணு", "police report ah nyabagam vechukko", "nalaikku police report paakanum nu nyabagapaduthu", "don't let me forget the police report", "keep the police report for later"])
    it(`audit-understanding-9 ${s}: not a brief`, async () => expect(stageOf(await round(s))?.recipe).not.toBe("brief"));
  it("audit-understanding-9 the rules read the Tamil reminder, and the brief still takes it", async () => {
    expect(rules("போலீஸ் ரிப்போர்ட் பார்க்க நினைவூட்டு").steps?.[0]?.a).toBe("remind");
    expect(stageOf(await round("போலீஸ் ரிப்போர்ட் பார்க்க நினைவூட்டு"))?.recipe).not.toBe("brief");
  });
  it("sending a report in Tamil is refused in code, not briefed", async () => expect((await round("போலீஸ் அறிக்கையை மெயில் அனுப்பு")).result?.kind).toBe("refuse"));
  for (const s of ["போலீஸ் அறிக்கை டவுன்லோட் பண்ணு", "போலீஸ் அறிக்கை ஒப்பிடு", "போலீஸ் ஸ்டேஷன் அறிக்கை"])
    it(`audit-understanding-9 other lanes in Tamil, ${s}: not a brief`, async () => expect(stageOf(await round(s))?.recipe).not.toBe("brief"));
});

describe("audit-understanding-10 P1: a locality the reference does not spell is silently dropped (BUG-005)", () => {
  for (const s of ["Mylapur police report", "Chetpet police report", "தி நகர் போலீஸ் அறிக்கை", "Mylapur la police report kudu"])
    it(`audit-understanding-10 ${s}: says the figures are the whole district's`, async () => expect(stageOf(await round(s))?.say.en).toMatch(/can't narrow|whole district/));
});

describe("audit-understanding-11 P1: the asked period is ignored, and 'today' is given (BUG-003)", () => {
  for (const [s, want] of [["quarterly brief", "the last 90 days"], ["police report last quarter", "the last 90 days"], ["police report for the last 90 days", "the last 90 days"], ["police report quarterly", "the last 90 days"], ["இந்த வார நிலவரம்", "this week"], ["இந்த மாத சுருக்கம்", "the last 30 days"], ["வாராந்திர சுருக்கம்", "this week"], ["இந்த வார போலீஸ் அறிக்கை", "this week"], ["இந்த மாத காவல்துறை அறிக்கை", "the last 30 days"], ["last week's brief", "this week"], ["police report for the last 7 days", "this week"], ["இந்த வாரத்தின் சுருக்கம்", "this week"], ["இந்த மாதத்தின் சுருக்கம்", "the last 30 days"], ["மாதாந்திர சுருக்கம்", "the last 30 days"], ["மாதாந்திர போலீஸ் அறிக்கை", "the last 30 days"]] as const)
    it(`audit-understanding-11 ${s}: ${want}`, async () => expect(stageOf(await round(s))?.title).toContain(want));
  for (const s of ["yesterday's brief", "நேற்றைய சுருக்கம்", "netru brief sollu", "police report yesterday", "நேற்று நிலவரம்"])
    it(`audit-understanding-11 ${s}: does not hand over today's as if it were asked for`, async () => expect(stageOf(await round(s))?.title ?? "").not.toMatch(/\btoday\b/));
});

describe("audit-understanding-11, another week asked for: this week is given as if it were the one", () => {
  for (const s of ["கடந்த வாரம் நிலவரம்", "அடுத்த வாரம் நிலவரம்", "pona vaaram brief sollu"])
    it(`audit-understanding-11 ${s}: not this week's brief with no word about it`, async () => expect(stageOf(await round(s))?.title ?? "").not.toMatch(/this week/));
});

describe("audit-understanding-12 P1: a question about relief or warnings is answered with standing water (BUG-023)", () => {
  for (const s of ["explain the flood relief need in Adyar", "explain the flood relief complaint in Adyar", "அடையாறு வெள்ள நிவாரணம் விளக்குங்க", "Adyar flood relief pathi simple ah sollu", "அடையாறு வெள்ள எச்சரிக்கை விளக்குங்க", "explain the flood relief need in Ambattur", "explain the flood alert in Ambattur"])
    it(`audit-understanding-12 ${s}: not standing water`, async () => expect(stageOf(await round(s))?.say.en ?? "").not.toMatch(/standing water/));
});

describe("audit-understanding-13 P1: other deadline words list every severe case (BUG-024)", () => {
  for (const s of ["severe cases beyond the deadline", "severe cases after the deadline", "delayed severe cases", "தாமதமான கடுமையான புகார்கள்", "severe cases deadline thaandi pochu", "deadline mudinja severe cases kaattu", "severe cases not resolved in time", "severe cases deadline mudinjiduchu"])
    it(`audit-understanding-13 ${s}: only the overdue ones`, async () => expect(listOf(await round(s))!.rows.every((x) => x.overdue)).toBe(true));
});

describe("audit-understanding-14 P1: other words for a rise still give one case (BUG-032)", () => {
  for (const s of ["explain the surge in dengue", "explain the growth in dengue", "explain how dengue went up in Adyar", "டெங்கு உயர்வு விளக்குங்க", "dengue athigam aana reason vilakkam sollu"])
    it(`audit-understanding-14 ${s}: not one case`, async () => expect(stageOf(await round(s))?.recipe).not.toBe("case"));
});

describe("audit-understanding-15 P1: a body's brief for one zone does not say which zone", () => {
  for (const [s, zone] of [["Anna Nagar police report", /Anna Nagar/], ["Adyar police report", /Adyar/], ["Adyar corporation update", /Adyar/]] as const) {
    it(`audit-understanding-15 ${s}: the spoken line names it`, async () => expect(stageOf(await round(s))?.say.en).toMatch(zone));
    it(`audit-understanding-15 ${s}: the title names it`, async () => expect(stageOf(await round(s))?.title).toMatch(zone));
  }
});

describe("audit-understanding-16 P2: a topic the rules cannot read is dropped from a list", () => {
  it("audit-understanding-16 the power cut complaint in Ambattur: not every case in the zone", async () => {
    const r = await round("the power cut complaint in Ambattur");
    expect(stageOf(r)?.recipe === "cases" && !slotsOf(r).cat).toBe(false);
  });
  for (const s of ["அடையாறு மின் விளக்கு புகார்கள்", "Adyar la therukku vilakku complaints kaattu", "theru vilakku complaints Adyar la kaattu", "மின்விளக்கு புகார் அடையாறு"])
    it(`audit-understanding-16 ${s}: the street-light cases, not all of them`, async () => expect(slotsOf(await round(s)).cat).toBe("STREETLIGHT_ELECTRICAL"));
});

describe("audit-understanding-17 P2: a Tamil answer carries an English sentence", () => {
  for (const s of ["இந்த மாதம் சுருக்கம்", "சுருக்கம் சொல்லு"])
    it(`audit-understanding-17 ${s}: the Tamil line has no English sentence`, async () => expect(stageOf(await round(s))?.say.ta).not.toMatch(/incidents were reported/));
  it("audit-understanding-17 a body it does not know is not said back in made-up spelling", async () => expect((await round("தீயணைப்பு துறை அறிக்கை")).result?.reply).not.toMatch(/Tiyanaippu/));
});

describe("with a fake model at the boundary (no live model in this phase)", () => {
  const generate = (object: unknown) => async <U,>(c: JsonCall<U>): Promise<JsonResult<U>> => ({ object: object as U, info: { step: c.name, provider: "groq", model: "fake", ms: 1, inputTokens: 1, outputTokens: 1 } } as never);
  const withModel = (text: string, object: unknown) => planRound(RoundBody.parse({ turnId: `au-${n++}`, round: 0, text, state: START, turns: [], lastText: null, stage: null, stageDigest: null, direct: null }), world, hands, "audit", { notes: [], habits: {} }, undefined, { llm: { generate: generate(object) as never, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false } });
  for (const s of ["filter Coimbatore police", "Mumbai police", "மும்பை போலீஸ்"])
    it(`audit-understanding-18 ${s}: code does not let a model put our police filter on for another city's police`, async () => {
      const r = await withModel(s, { kind: "do", lang: "en", reply: null, steps: [{ a: "view", zone: null, dept: "POL-GCP", cat: null, taluk: null, sev: null }], options: [], screen: null, stage: null, lane: "district" });
      expect(JSON.stringify(r.result?.steps ?? [])).not.toContain("POL-GCP");
    });
});

describe("audit-understanding-19 P2: the next step is still read from loose words in the title (the kind of bug BUG-033 fixed for names)", () => {
  for (const [id, code] of [["INC-20261031-345A17", "a drinking-water problem"], ["INC-20261030-AE844C", "a lake or bund problem"]] as const)
    it(`audit-understanding-19 ${id}, ${code}: not "ask the conservancy team to clear it"`, async () => {
      const d = stageOf(await round("audit", { direct: { recipe: "case", slots: { id }, lang: "en" } }))!;
      expect(d.say.en).toContain(code);
      expect(d.say.en).not.toMatch(/conservancy team to clear it/);
    });
});

describe("audit-understanding-20 P3: lines that do not read as English", () => {
  it("audit-understanding-20 one incident: not \"1 incident were reported\"", async () => expect(stageOf(await round("Manali status"))!.say.en).not.toMatch(/\b1 incident were\b/));
  it("audit-understanding-20 relief: not \"There's people\"", async () => {
    const l = await round("audit", { direct: { recipe: "cases", slots: { cat: "FLOOD_RELIEF", zones: [], period: "quarterly", n: 30, fresh: true }, lang: "en" } });
    const open = listOf(l)!.rows.find((x) => !/Resolved|Rejected|Lapsed/.test(String(x.status)))!;
    expect(stageOf(await round("audit", { direct: { recipe: "case", slots: { id: open.id }, lang: "en" } }))!.say.en).not.toMatch(/^There's people/);
  });
  it("audit-understanding-20 a list over a period: not \"59 severe cases the last 30 days\"", async () => expect(stageOf(await round("severe cases past the deadline this month"))!.say.en).not.toMatch(/cases the last 30 days/));
});

describe("audit-understanding-19, how far it reaches: every incident in the pinned build, as the case screen labels it", () => {
  // screens.ts actionForOne is not exported: its patterns are copied here for counting only, and two rows are read over the real round above
  const step = (label: string) => {
    const l = label.toLowerCase();
    if (/accident|relief|risk|signal|warning|alert/.test(l)) return null;
    if (/flood|waterlog|inundat|stagnat/.test(l)) return "pump";
    if (/garbage|waste|sanitat|debris/.test(l)) return "conservancy";
    if (/vector|dengue|mosquito|malaria|fever/.test(l)) return "fogging";
    if (/water supply|sewage|sewer|drinking|pipe/.test(l)) return "metrowater";
    if (/pothole|road damage|damaged road/.test(l)) return "repair date";
    return null;
  };
  // the steps a category can honestly carry, written from its own label
  const FITS: Record<string, string[]> = { FLOOD_WATERLOGGING: ["pump"], SOLID_WASTE: ["conservancy"], SANITATION_TOILETS: ["conservancy"], VECTOR_DISEASE: ["fogging"], WATER_SUPPLY: ["metrowater"], DRAINAGE_SEWAGE: ["metrowater"], ROAD_DAMAGE: ["repair date"] };
  it("records the count, ids and categories only", async () => {
    const [rows] = await (awsPool() as never as { query: (q: string) => Promise<[Record<string, unknown>[]]> }).query("SELECT incident_id AS id, category_code AS code, category_label AS label, COALESCE(headline, title) AS t, is_open AS open FROM incidents");
    const byStep: Record<string, number> = {};
    const open: { id: string; code: string; step: string }[] = [];
    for (const r of rows) {
      const code = String(r.code ?? "");
      const s = step(`${r.label ?? ""} ${r.t ?? ""}`);
      if (!s || (FITS[code] ?? []).includes(s)) continue;
      byStep[`${code} -> ${s}`] = (byStep[`${code} -> ${s}`] ?? 0) + 1;
      if (Number(r.open) === 1) open.push({ id: String(r.id), code, step: s });
    }
    const wrong = Object.values(byStep).reduce((a, b) => a + b, 0);
    fs.writeFileSync(path.resolve(__dirname, "..", "..", "..", "..", "docs", "qa", "pass4", "evidence", "bug-audit", "understanding-next-step-sweep.json"), JSON.stringify({ incidents: rows.length, step_does_not_fit: wrong, of_them_open: open.length, by_category_and_step: Object.fromEntries(Object.entries(byStep).sort((a, b) => b[1] - a[1])), open: open.slice(0, 200) }, null, 1));
    expect(rows.length).toBeGreaterThan(20_000);
  });
});

describe("what the browser does before any round (Thunai.tsx: the rules act alone when sure)", () => {
  // the same three conditions as Thunai.tsx:1177-1183, over every sentence the HTTP run drove, so the two paths can be read side by side
  it("records the sentences no round ever sees", () => {
    const driven = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "..", "docs", "qa", "pass4", "evidence", "bug-audit", "understanding-driven.json"), "utf8")) as { bug: string; said: string; lane: string; recipe: string | null; kind: string | null }[];
    const seen = new Set<string>();
    const alone: unknown[] = [];
    for (const r of driven) {
      if (seen.has(r.said)) continue;
      seen.add(r.said);
      const st = { ...START, list: [], lastFilter: null, now: Date.now() } as never;
      const u = understand(r.said, st, world, { speechConf: 0.95 }) as { kind: string; confidence?: number; steps?: never[] };
      const steps = (u.steps ?? []) as never[];
      if (u.kind === "do" && (isReflex(steps, st) || ((u.confidence ?? 0) >= 0.9 && planRisk(steps) === "A" && (isPlainMove(steps) || isNavCommand(r.said, steps)))))
        alone.push({ bug: r.bug, said: r.said, steps, round_would_have_given: r.recipe ?? r.kind });
    }
    fs.writeFileSync(path.resolve(__dirname, "..", "..", "..", "..", "docs", "qa", "pass4", "evidence", "bug-audit", "understanding-rules-first.json"), JSON.stringify({ tried: seen.size, acted_with_no_round: alone.length, rows: alone }, null, 1));
    expect(seen.size).toBeGreaterThan(300);
  });
});

describe("audit-understanding-21 P0: an ordinary phrase with high or low is read as a severity (the kind of bug BUG-032 fixed for explain)", () => {
  for (const t of ["High Court report", "high court cases", "high school complaints", "high tide in Royapuram", "high tide warning", "high rise building complaints", "high mast light complaints in Adyar", "low lying areas in Adyar", "low lying area flooding", "low lying areas la flooding complaints kaattu", "low voltage complaints in Ambattur", "low pressure area report"])
    it(`audit-understanding-21 ${t}: no severity list`, async () => expect(slotsOf(await round(t)).sev ?? null).toBeNull());
  // the Tamil word for severe is also the everyday word for harsh ("harsh sun"): beside a word of the weather it is the weather's adjective (lexicon.ts HARSH_BESIDE, RC-03)
  it("audit-understanding-21 கடுமையான வெயில்: no severity list", async () => expect(slotsOf(await round("கடுமையான வெயில்")).sev ?? null).toBeNull());
  for (const t of ["high priority cases in Adyar this week", "low priority cases today", "low severity cases in Adyar"])
    it(`a real severity still reads as one: ${t}`, async () => expect(slotsOf(await round(t)).sev).toBeTruthy());
});

describe("audit-understanding-22 P1: a reminder or note about anything but a named body's report is lost to the fast lane (BUG-022)", () => {
  for (const t of ["remind me to check the severe cases", "remind me at 5 pm to check the severe cases", "remind me to check the garbage complaints in Adyar", "note: check the severe cases tomorrow", "remind me to read the news", "remind me to check Poondi reservoir level", "remind me to see the air quality report", "remind me to read today's brief", "remind me at 5 pm about the brief", "remind me to check the corporation update", "make a note to check the corporation update", "கடுமையான புகார்கள் பார்க்க நினைவூட்டு", "நாளை கடுமையான புகார்கள் பார்க்க ஞாபகப்படுத்து", "அடையாறு வெள்ள புகார்கள் பார்க்க நினைவூட்டு"])
    it(`audit-understanding-22 ${t}: the round leaves it to the rules' reminder`, async () => expect(stageOf(await round(t))).toBeFalsy());
  it("the rules did read it as a reminder", () => expect(rules("remind me at 5 pm to check the severe cases").steps?.[0]?.a).toBe("remind"));
});

describe("audit-understanding-23 P0: in the browser, a sentence with போலீஸ் or pannu never reaches the round: a filter goes on and nothing is said (BUG-001, BUG-022, BUG-030)", () => {
  for (const t of ["சென்னை போலீஸ் ரிப்போர்ட்", "சென்னை போலீஸ் ரிப்போர்ட் கொடு", "போலீஸ் அறிக்கை", "போலீஸ் நிலவரம் சொல்லு", "போலீஸ் அறிக்கை இந்த மாதம்", "மயிலாப்பூர் போலீஸ் ரிப்போர்ட்", "போலீஸ் செய்தி", "போலீஸுக்கு கடிதம் எழுது", "போலீஸ் அறிக்கையை மெயில் அனுப்பு", "போலீஸ் ரிப்போர்ட் சேவ் பண்ணு", "நாளைக்கு போலீஸ் அறிக்கை பார்க்கணும்னு ஞாபகப்படுத்து", "கும்பகோணம் போலீஸ் அறிக்கை", "துபாய் போலீஸ் அறிக்கை", "police report save pannu", "police report ah type pannu", "police report ah note pannu", "police report paakanum nu remind pannu", "severe cases paaka remind pannu", "Adyar flooding complaints paaka remind pannu"])
    it(`audit-understanding-23 ${t}: the rules do not take it alone`, () => expect(actsAlone(t)).toBe(false));
  for (const t of ["சென்னை காவல்துறை அறிக்கை", "chennai police report kudu", "police nilavaram sollu", "திருச்சி போலீஸ் ரிப்போர்ட்", "ரயில்வே போலீஸ் அறிக்கை"])
    it(`the same request by another word does reach the round: ${t}`, () => expect(actsAlone(t)).toBe(false));
  for (const t of ["go to trends", "அடையாறுக்கு மாற்று", "filter Adyar"])
    it(`a real command to move still acts at once: ${t}`, () => expect(actsAlone(t)).toBe(true));
});

describe("audit-understanding-24 P1: the rules hear words starting with கொ as கொசு, mosquito", () => {
  for (const t of ["சென்னை போலீஸ் ரிப்போர்ட் கொடு", "கொடைக்கானல் போலீஸ் அறிக்கை"])
    it(`audit-understanding-24 ${t}: no Vector disease filter`, () => expect(JSON.stringify(rules(t).steps ?? [])).not.toContain("VECTOR_DISEASE"));
});

describe("audit-understanding-25 P1: with a brief open, the Stage's own filter answers a follow-up about a place (BUG-020's control)", () => {
  for (const t of ["only Adyar", "அடையாறு மட்டும்", "Adyar mattum"])
    it(`audit-understanding-25 police brief open, ${t}: not "None of these mention"`, async () => {
      const m = pushScreen(stageEmpty, stageOf(await round("chennai city police report"))!);
      const cmd = localStageCommand(t) as LocalCmd;
      expect(JSON.stringify(cmd ? stageReducer(m, cmd).fx : [])).not.toMatch(/None of these mention/);
    });
});
