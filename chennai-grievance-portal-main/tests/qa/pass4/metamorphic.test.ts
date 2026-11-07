// QA pass 4: metamorphic tests. 30 base requests, 4 rewrites of each, down the real path (client-sim.ts: planRound with the real store on the pinned snapshot, no model).
// The rewrites keep the meaning: another language, filler and polite words, another word order, plural or singular, Tamil case endings, numbers in words.
// The facts must stay the same: the lane, the kind of answer, the screen (recipe), the zone, department and category it narrowed to, and every figure on it.
// The base requests were written for this file and are not taken from docs/qa/pass4/testsets.
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/metamorphic.test.ts
// A rewrite that changes a fact is a bug. Bugs are listed in KNOWN with their id, and run with it.fails so the suite stays green and the bug stays visible.
// A written copy of every answer goes to docs/qa/pass4/evidence/metamorphic-results.json (QA_P4_META_DUMP=1 to write it).
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { clearCaches } from "@/lib/thunai/round";
import type { StageDocT } from "@/lib/thunai/stage";
import { browserWorld, ClientSim, type Outcome } from "./grader/client-sim";

const FROZEN = "2026-11-06T06:30:00.000Z";
type Kind = "ta" | "tanglish" | "polite" | "order" | "plural" | "number" | "case";
interface Case { id: string; base: string; v: [Kind, string][] }

const C = (id: string, base: string, v: [Kind, string][]): Case => ({ id, base, v });
const CASES: Case[] = [
  C("m01", "how many severe complaints are open in Adyar zone", [["ta", "அடையாறு மண்டலத்தில் எத்தனை தீவிர புகார்கள் திறந்துள்ளன"], ["tanglish", "Adyar zone la evlo severe complaints open irukku"], ["polite", "could you please tell me how many severe complaints are open in the Adyar zone"], ["order", "in Adyar zone, open severe complaints, how many"]]),
  C("m02", "how many open complaints in Ambattur", [["ta", "அம்பத்தூரில் எத்தனை புகார்கள் திறந்துள்ளன"], ["tanglish", "Ambattur la evlo complaints open irukku"], ["polite", "please can you tell me how many open complaints there are in Ambattur"], ["order", "Ambattur, open complaints, how many"]]),
  C("m03", "which zone has the most severe complaints", [["ta", "எந்த மண்டலத்தில் அதிக தீவிர புகார்கள் உள்ளன"], ["tanglish", "entha zone la adhigama severe complaints irukku"], ["polite", "kindly tell me which zone has the most severe complaints"], ["order", "most severe complaints, which zone has them"]]),
  C("m04", "garbage complaints in Anna Nagar", [["ta", "அண்ணா நகரில் குப்பை புகார்கள்"], ["tanglish", "Anna Nagar la kuppai complaints"], ["polite", "please show me the garbage complaints in Anna Nagar"], ["plural", "garbage complaint in Anna Nagar"]]),
  C("m05", "how many overdue complaints in Manali", [["ta", "மணலியில் எத்தனை புகார்கள் காலக்கெடு தாண்டியுள்ளன"], ["tanglish", "Manali la evlo complaints overdue"], ["polite", "could you tell me the number of overdue complaints in Manali please"], ["order", "in Manali, overdue complaints, how many"]]),
  C("m06", "street light complaints in Perungudi", [["ta", "பெருங்குடியில் தெருவிளக்கு புகார்கள்"], ["tanglish", "Perungudi la street light complaints"], ["polite", "please show the street light complaints in Perungudi"], ["plural", "street lights complaint in Perungudi"]]),
  C("m07", "top three zones by open complaints", [["ta", "திறந்த புகார்கள் அதிகம் உள்ள முதல் மூன்று மண்டலங்கள்"], ["number", "top 3 zones by open complaints"], ["polite", "please show me the top three zones by open complaints"], ["order", "by open complaints, the top three zones"]]),
  C("m08", "top five wards by severe complaints", [["ta", "தீவிர புகார்கள் அதிகம் உள்ள முதல் ஐந்து வார்டுகள்"], ["number", "top 5 wards by severe complaints"], ["polite", "please give me the top five wards by severe complaints"], ["order", "by severe complaints, the top five wards"]]),
  C("m09", "drainage complaints in Royapuram", [["ta", "ராயபுரத்தில் வடிகால் புகார்கள்"], ["tanglish", "Royapuram la drainage complaints"], ["polite", "please show me drainage complaints in Royapuram"], ["plural", "drainage complaint in Royapuram"]]),
  C("m10", "flooding complaints in Thiruvottiyur", [["ta", "திருவொற்றியூரில் வெள்ளம் புகார்கள்"], ["tanglish", "Thiruvottiyur la flooding complaints"], ["polite", "kindly show flooding complaints in Thiruvottiyur"], ["order", "in Thiruvottiyur, flooding complaints"]]),
  C("m11", "how many complaints are open today", [["ta", "இன்று எத்தனை புகார்கள் திறந்துள்ளன"], ["tanglish", "inniki evlo complaints open irukku"], ["polite", "could you please tell me how many complaints are open today"], ["order", "today, open complaints, how many"]]),
  C("m12", "severe complaints this week", [["ta", "இந்த வாரம் தீவிர புகார்கள்"], ["tanglish", "indha vaaram severe complaints"], ["polite", "please show me the severe complaints this week"], ["order", "this week, severe complaints"]]),
  C("m13", "how much rain in the last 24 hours", [["ta", "கடந்த 24 மணி நேரத்தில் எவ்வளவு மழை"], ["tanglish", "last 24 hours la evlo mazhai"], ["polite", "could you please tell me how much rain fell in the last 24 hours"], ["order", "in the last 24 hours, how much rain"]]),
  C("m14", "which department has the most open complaints", [["ta", "எந்த துறையில் அதிக திறந்த புகார்கள் உள்ளன"], ["tanglish", "entha department la adhigama open complaints irukku"], ["polite", "kindly tell me which department has the most open complaints"], ["order", "most open complaints, which department"]]),
  C("m15", "water supply complaints in Alandur", [["ta", "ஆலந்தூரில் குடிநீர் புகார்கள்"], ["tanglish", "Alandur la water supply complaints"], ["polite", "please show the water supply complaints in Alandur"], ["plural", "water supply complaint in Alandur"]]),
  C("m16", "show me a summary of Kodambakkam zone", [["ta", "கோடம்பாக்கம் மண்டலத்தின் சுருக்கத்தைக் காட்டு"], ["tanglish", "Kodambakkam zone summary kaattu"], ["polite", "could you please show me a summary of the Kodambakkam zone"], ["order", "Kodambakkam zone, a summary, show me"]]),
  C("m17", "vector borne disease complaints in Tondiarpet", [["ta", "தண்டையார்பேட்டையில் நோய் பரப்பும் கொசு புகார்கள்"], ["tanglish", "Tondiarpet la mosquito dengue complaints"], ["polite", "please show vector borne disease complaints in Tondiarpet"], ["plural", "vector borne diseases complaint in Tondiarpet"]]),
  C("m18", "stray animal complaints in Valasaravakkam", [["ta", "வளசரவாக்கத்தில் தெருநாய் புகார்கள்"], ["tanglish", "Valasaravakkam la stray dog complaints"], ["polite", "please show the stray animal complaints in Valasaravakkam"], ["plural", "stray animals complaint in Valasaravakkam"]]),
  C("m19", "pothole complaints in Sholinganallur", [["ta", "சோழிங்கநல்லூரில் பள்ளம் புகார்கள்"], ["tanglish", "Sholinganallur la pothole complaints"], ["polite", "please show me pothole complaints in Sholinganallur"], ["plural", "potholes complaint in Sholinganallur"]]),
  C("m20", "what is the air quality now", [["ta", "இப்போது காற்றின் தரம் என்ன"], ["tanglish", "ippo air quality enna"], ["polite", "could you please tell me what the air quality is right now"], ["order", "now, the air quality, what is it"]]),
  C("m21", "what is the level of the lakes", [["ta", "ஏரிகளின் நீர் மட்டம் என்ன"], ["tanglish", "lakes la water level enna"], ["polite", "could you please tell me the level of the lakes"], ["plural", "what is the level of the lake"]]),
  C("m22", "compare Adyar and Anna Nagar zones", [["ta", "அடையாறு மற்றும் அண்ணா நகர் மண்டலங்களை ஒப்பிடு"], ["tanglish", "Adyar and Anna Nagar zones compare pannunga"], ["polite", "could you please compare the Adyar and Anna Nagar zones"], ["order", "Anna Nagar and Adyar zones, compare"]]),
  C("m23", "fire complaints in Madhavaram", [["ta", "மாதவரத்தில் தீ புகார்கள்"], ["tanglish", "Madhavaram la fire complaints"], ["polite", "please show the fire complaints in Madhavaram"], ["plural", "fires complaint in Madhavaram"]]),
  C("m24", "tree fall complaints in Teynampet", [["ta", "தேனாம்பேட்டையில் மரம் விழுந்த புகார்கள்"], ["tanglish", "Teynampet la tree fall complaints"], ["polite", "please show me the tree fall complaints in Teynampet"], ["plural", "fallen trees complaint in Teynampet"]]),
  C("m25", "drain complaints in Ambattur", [["ta", "அம்பத்தூரில் வடிகால் புகார்கள்"], ["tanglish", "Ambattur la drain complaints"], ["polite", "please show me the drain complaints in Ambattur"], ["plural", "drains complaint in Ambattur"]]),
  C("m26", "how many street complaints in Adyar", [["ta", "அடையாறில் தெரு புகார்கள் எத்தனை"], ["tanglish", "Adyar la street complaints evlo"], ["polite", "could you tell me how many street complaints there are in Adyar"], ["order", "in Adyar, street complaints, how many"]]),
  C("m27", "road complaints in Thiru-Vi-Ka-Nagar", [["ta", "திரு.வி.க. நகரில் சாலை புகார்கள்"], ["tanglish", "Thiru-Vi-Ka-Nagar la road complaints"], ["polite", "please show me the road complaints in Thiru-Vi-Ka-Nagar"], ["plural", "roads complaint in Thiru-Vi-Ka-Nagar"]]),
  C("m28", "severe complaints in ward 172", [["ta", "வார்டு 172 இல் தீவிர புகார்கள்"], ["tanglish", "ward 172 la severe complaints"], ["polite", "please show me the severe complaints in ward 172"], ["order", "in ward 172, severe complaints"]]),
  C("m29", "how many complaints breached their deadline in Adyar", [["ta", "அடையாறில் எத்தனை புகார்கள் காலக்கெடுவை மீறியுள்ளன"], ["tanglish", "Adyar la evlo complaints deadline miss aachu"], ["polite", "could you please tell me how many complaints breached their deadline in Adyar"], ["order", "in Adyar, complaints that breached their deadline, how many"]]),
  C("m30", "how many complaints were closed this week in Manali", [["ta", "இந்த வாரம் மணலியில் எத்தனை புகார்கள் முடிக்கப்பட்டன"], ["tanglish", "indha vaaram Manali la evlo complaints close aachu"], ["polite", "could you please tell me how many complaints were closed this week in Manali"], ["order", "in Manali this week, closed complaints, how many"]])
];

/** The facts of one answer: what must stay put when only the wording changes. */
function facts(o: Outcome, sim: ClientSim) {
  const d: StageDocT | null = o.stage;
  const figs: number[] = [];
  for (const b of d?.blocks ?? []) {
    if (b.kind === "Kpis") for (const i of b.items) figs.push(i.value);
    if (b.kind === "CaseList") figs.push(b.total);
    if (b.kind === "Ranking") for (const i of b.items) figs.push(i.value);
    if (b.kind === "Answer") for (const f of b.facts) figs.push(f.value);
  }
  return {
    lane: o.lane, kind: o.kind, recipe: d?.recipe ?? null, zone: sim.zone, dept: sim.dept, cat: sim.cat, taluk: sim.taluk, sev: sim.sevTab, period: sim.period,
    slots: d ? JSON.stringify(d.slots) : null, figures: figs.sort((a, b) => a - b).join(",")
  };
}
type Facts = ReturnType<typeof facts>;
const COMPARED: (keyof Facts)[] = ["lane", "kind", "recipe", "zone", "dept", "cat", "taluk", "sev", "period", "figures"];

const results: Record<string, { text: string; kind: string; facts: Facts; said: string }> = {};
let world: Awaited<ReturnType<typeof browserWorld>>;

async function ask(text: string) {
  vi.setSystemTime(new Date(FROZEN));
  clearCaches();
  const sim = new ClientSim(world.world, {}, world.list);
  const o = await sim.handle(text);
  return { o, f: facts(o, sim) };
}

/** Known bugs, by id of the case and the rewrite (m07:number). Filled from a run; each is a real difference in facts. */
const KNOWN: Record<string, string> = JSON.parse(fs.existsSync(path.join(__dirname, "metamorphic.known.json")) ? fs.readFileSync(path.join(__dirname, "metamorphic.known.json"), "utf8") : "{}");

describe("QA pass 4: metamorphic (same facts when only the wording changes)", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(FROZEN) });
    world = await browserWorld();
  }, 300_000);
  afterAll(() => {
    vi.useRealTimers();
    if (process.env.QA_P4_META_DUMP) {
      const dir = path.resolve(__dirname, "..", "..", "..", "..", "docs", "qa", "pass4", "evidence");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "metamorphic-results.json"), JSON.stringify(results, null, 1));
    }
  });

  it("has 30 base requests with 4 rewrites each", () => {
    expect(CASES).toHaveLength(30);
    for (const c of CASES) expect(c.v, c.id).toHaveLength(4);
  });

  for (const c of CASES) {
    for (const [kind, text] of c.v) {
      const key = `${c.id}:${kind}`;
      const run = KNOWN[key] ? it.fails : it;
      run(`${KNOWN[key] ? `${KNOWN[key]} ` : ""}${key}: "${c.base}" and "${text}" give the same facts`, async () => {
        const a = await ask(c.base);
        const b = await ask(text);
        results[`${c.id}:base`] = { text: c.base, kind: "base", facts: a.f, said: a.o.said.slice(0, 300) };
        results[key] = { text, kind, facts: b.f, said: b.o.said.slice(0, 300) };
        for (const k of COMPARED) expect(b.f[k], `${k} differs. base said: ${a.o.said.slice(0, 120)} | rewrite said: ${b.o.said.slice(0, 120)}`).toEqual(a.f[k]);
      });
    }
  }
});

// Word tests with a plain expectation: a word that narrows the question must change the answer, and the answer must be about the thing asked.
// Each is written as it.fails while the bug is open; the name starts with the finding id.
const figs = (f: Facts) => f.figures;
describe("QA pass 4: words that must narrow the answer", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(FROZEN) });
    world = world ?? (await browserWorld());
  }, 300_000);
  it("meta-words-4: 'breached their deadline in Adyar' is narrower than 'complaints in Adyar' (the deadline word is dropped, the zone total is given)", async () => {
    const all = await ask("complaints in Adyar");
    const late = await ask("how many complaints breached their deadline in Adyar");
    expect(figs(late.f)).not.toEqual(figs(all.f));
  });
  it("meta-words-5: 'severe complaints in ward 172' is narrower than 'severe complaints' (the ward is dropped, the district list is given)", async () => {
    const all = await ask("severe complaints");
    const ward = await ask("severe complaints in ward 172");
    expect(ward.o.said).not.toEqual(all.o.said);
  });
  it("meta-words-6: 'drain complaints in Ambattur' is narrower than 'complaints in Ambattur' (the drain word is dropped)", async () => {
    const all = await ask("complaints in Ambattur");
    const drain = await ask("drain complaints in Ambattur");
    expect(figs(drain.f)).not.toEqual(figs(all.f));
  });
  it("meta-words-7: 'stray animal complaints in Valasaravakkam' is about stray animals in zone 11, not 66 drainage cases", async () => {
    const a = await ask("stray animal complaints in Valasaravakkam");
    expect(a.o.said).toMatch(/stray/i);
    expect(a.o.said).not.toMatch(/drainage/i);
  });
  it("meta-words-8: 'lakes la water level enna' reads the lakes (the broad word water beats lakes and gives water supply cases)", async () => {
    const a = await ask("lakes la water level enna");
    expect(a.f.recipe).toBe("readings");
  });
  it("meta-words-9: an English request is answered in English (road complaints in Thiru-Vi-Ka-Nagar comes back in Tamil)", async () => {
    const a = await ask("road complaints in Thiru-Vi-Ka-Nagar");
    expect(a.o.said).not.toMatch(/[஀-௿]/);
  });
  it.fails("meta-words-10: 'விளக்கு புகார்கள்' (lamp complaints) is not read as the word for 'explanation'", async () => {
    const a = await ask("மின்விளக்கு எரியவில்லை");
    expect(a.o.said).not.toBe("விளக்கம்");
  });
});
