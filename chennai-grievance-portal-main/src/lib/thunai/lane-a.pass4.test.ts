/**
 * QA pass 4, lane a: class guards for the understanding code (outside place or body, everyday words, word edges, periods, ...).
 * Each describe is one root cause from docs/qa/pass4/ROOT_CAUSES.md; the guard crosses a list with every language and every lane,
 * so the next sentence of the same kind fails here, not in front of the Collector. Fast, no snapshot, no model.
 */
import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { referenceWorld } from "./world";
import { ZONE_TA_NAME } from "./lexicon";
import { briefTurn, foreignIn } from "./entities";
import { quickScreen } from "./quick";
import { resolveFrame } from "./frame";
import { understand } from "./understand";

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const START = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false, list: [], lastFilter: null, now: Date.parse("2026-11-06T06:30:00Z") };
const rules = (t: string) => understand(t, START as never, world as never) as { kind: string; steps?: { a: string; view?: { dept?: string; zone?: number | null; cat?: string | null } }[] };

// towns and countries that are in no word list of the code: the guard must hold for names it has never been told
// ("Thenmalai" was here once and is a real Chennai locality, Thenmalai Nagar in Pallikaranai, so it is now one of ours: see the guard below)
const NEVER_LISTED = ["Zorbatown", "Vellapatti", "Kumarapuram", "Thenpatti", "Karungulam", "Pazhaveri", "Sundarapandi", "Nallur", "Kottaiyur", "Mannargudi", "Loyola", "Quorvex", "Brightwell"];
const TA_TOWNS = ["கும்பகோணம்", "நாகர்கோவில்", "பொள்ளாச்சி", "காரைக்குடி", "துபாய்", "கொழும்பு"];
const EN_HEADS = ["police", "corporation", "municipality", "water board", "health department", "council", "college", "association"];

describe("RC-01: an outside place or body is never answered with ours, in any lane", () => {
  const sentences: string[] = [];
  for (const t of NEVER_LISTED) for (const h of EN_HEADS) sentences.push(`${t} ${h} report`, `${t} ${h} status kudu`, `filter ${t} ${h}`, `${t}-la ${h} filter pannu`);
  for (const t of TA_TOWNS) for (const h of ["போலீஸ் அறிக்கை", "காவல்துறை நிலவரம்", "மாநகராட்சி அறிக்கை", "போலீஸ் பில்டர் போடு"]) sentences.push(`${t} ${h}`);
  for (const s of ["Anna Nagar, Madurai side. Flood complaints there?", "Colombo-la vellam ennanga", "ஆவடில குப்பை கதை என்ன?", "not this Manali, the Himachal one", "Old Madras Road in Bengaluru has potholes", "Bar Council meeting-la enna mudivu"]) sentences.push(s);
  it("one question for every lane: said as unknown by the brief turn, left alone by the fast lane and the frame, no filter from the rules", () => {
    const bad: string[] = [];
    for (const s of sentences) {
      const turn = briefTurn(s, world as never);
      if (!(turn?.kind === "reply" && turn.via === "unknown")) bad.push(`briefTurn: ${s}`);
      if (quickScreen(s, world as never)) bad.push(`quickScreen: ${s}`);
      if (quickScreen(s, world as never, { noBail: true })) bad.push(`quickScreen noBail: ${s}`);
      if (resolveFrame({ text: s, stage: null, turns: [{ heard: "police report", did: "brief" }], lastPlace: null, lastText: "Adyar flooding cases", world: world as never }).kind !== "none") bad.push(`frame: ${s}`);
      const u = rules(s);
      if (u.kind === "do" && (u.steps ?? []).some((x) => x.a === "view")) bad.push(`rules: ${s}`);
    }
    expect(bad).toEqual([]);
  });
  it("our own bodies and places are not taken for foreign ones", () => {
    const ours = ["Adyar police report", "chennai city police report", "police brief for Velachery", "corporation health department status", "Metrowater report", "greater chennai corporation report", "storm water drain department update",
      "PWD water resources report", "Chennai's police report", "our police status", "indha police report", "namma corporation report", "அடையாறு போலீஸ் அறிக்கை", "சென்னை மாநகராட்சி அறிக்கை", "weekly police report", "traffic police report", "show me the severe cases in Adyar"];
    for (const s of ours) expect(foreignIn(s, world as never), s).toBeNull();
  });
  // review point 1 and 2: the class is "a word that is not a body or a place of ours, in front of an agency word". Plain English words (times, topics, adjectives)
  // and every Chennai locality are crossed with every agency head, in the lowercase the Collector types and speaks.
  const PLAIN_BEFORE_HEAD = ["today's", "todays", "tomorrow", "cyber crime", "senior citizen", "damaged road", "daily", "monthly", "yearly", "annual", "recent", "pending", "special", "emergency", "joint", "night", "morning", "crime", "women", "child", "district level", "ward level", "citizen", "rescue", "flood relief"];
  it("a plain English word in front of an agency word is not another town: the whole class, not a list of phrases", () => {
    const bad: string[] = [];
    for (const w of PLAIN_BEFORE_HEAD) for (const h of ["police", "corporation", "health department", "water board", "road department", "collectorate"]) {
      for (const s of [`${w} ${h} report`, `${w} ${h} status`, `show ${w} ${h}`]) if (foreignIn(s, world as never)) bad.push(s);
    }
    expect(bad).toEqual([]);
  });
  it("every Chennai locality of the Corporation's own list in front of an agency word is ours", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const j = JSON.parse(fs.readFileSync("data/gcc-reference/areas-localities.json", "utf8")) as { localities: { name: string }[] };
    const names = [...new Set(j.localities.map((l) => String(l.name).toLowerCase().split(/[^a-z]+/).find((w) => w.length >= 4) ?? ""))].filter(Boolean);
    const bad: string[] = [];
    for (const n of names) for (const h of ["police", "corporation health department"]) if (foreignIn(`${n} ${h} report`, world as never)) bad.push(`${n} ${h}`);
    // a locality whose first word is also a town outside Greater Chennai, or says another jurisdiction, is another body's and rightly said as unknown; these are listed here by name, so a new one
    // that falls out of the data shows up as a failure and is never passed silently
    const HOMONYMS = new Set(["railway", "central", "state", "union", "university", "customs", "ramanathapuram", "bhavani", "srinagar", "thiruvallur", "siruvallur", "madhurai", "madhura", "madurai", "chidambaram", "mettur", "ariyalur", "palani", "avadi", "medavakkam", "sivakami", "bharani"]);
    expect([...new Set(bad.map((x) => x.split(" ")[0]))].filter((x) => !HOMONYMS.has(x))).toEqual([]);
  });
  it("general knowledge about a far place stays the general lane's", () => {
    expect(foreignIn("what is the capital of Delhi", world as never)).toBeNull();
    expect(foreignIn("Delhi police report", world as never)).not.toBeNull();
  });
});

describe("RC-01 class guard: no lane answers before it asks the one outside question", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const read = (f: string) => fs.readFileSync(`src/lib/thunai/${f}`, "utf8");
  it.each(["quick.ts", "frame.ts", "understand.ts", "entities.ts"])("(a convenience read of the source; the behaviour test above is the guard) %s calls foreignIn", (f) => expect(read(f)).toMatch(/foreignIn\(/));
  it("the fast lane asks it before any screen is built, and the rules before any view step", () => {
    const q = read("quick.ts"), u = read("understand.ts");
    expect(q.indexOf("foreignIn(text, w)")).toBeGreaterThan(0);
    expect(q.indexOf("foreignIn(text, w)")).toBeLessThan(q.indexOf("// follow-ups and edits of an open screen"));
    expect(u.indexOf("foreignIn(input, world)")).toBeLessThan(u.indexOf("// ---------------------------------------------------- questions and readings"));
  });
  it("an ordinary word in front of an agency word is not a place (adverbs, commands, Tanglish verbs)", () => {
    for (const s of ["kindly tell me which department has the most open complaints", "export police report", "City Health Officer kitta irukura department nelavaram kudu", "please show the police report"]) expect(foreignIn(s, world as never), s).toBeNull();
  });
  it("another jurisdiction's word in front of an agency word is another body", () => {
    for (const s of ["state police report", "central police report", "district police status", "airport police report"]) expect(foreignIn(s, world as never), s).not.toBeNull();
  });
});

describe("RC-01: the reply language follows the Collector's words, not one marker word", async () => {
  const { detectLang } = await import("./normalise");
  it("Tanglish is Tamil, a long English sentence with one stray word is English, a zone named Thiru is English", () => {
    for (const s of ["Colombo-la vellam ennanga, romba mosama?", "Pondy Anna Salai la accident nadandhucha, theriyuma", "Mangalore pakkam Adyar nu oru ooru iruke, anga vellam eppadi"]) expect(detectLang(s), s).toBe("ta");
    for (const s of ["Anything from Coimbatore actually dengue er indha maasam?", "Thiru Vi Ka Nagar police report", "show flooding cases in Adyar"]) expect(detectLang(s), s).toBe("en");
    expect(detectLang("மழை எப்படி")).toBe("ta");
  });
});

// RC-04: one intent gate in front of every lane. The same sentence goes to every lane and must get the same class.
import { isNavCommand } from "./plan";
import { CHANGE_RECORD, KEEPING } from "./lexicon";
describe("RC-04: a keeping note, an order to change a record and a data question are never a brief, a screen or a console move", () => {
  const BODIES = ["police", "corporation", "Metrowater", "PWD"];
  const keep = (b: string) => [`remind me to check the ${b} report`, `don't let me forget the ${b} report`, `keep the ${b} report for later`, `make a note of the ${b} status`, `${b} report ah nyabagam vechukko`,
    `${b} அறிக்கை பார்க்க நினைவூட்டு`, `${b} அறிக்கையை ஞாபகம் வச்சுக்கோ`, `${b} ரிப்போர்ட் சேவ் பண்ணு`, `${b} ரிப்போர்ட் டைப் பண்ணு`];
  const change = (b: string) => [`change the ${b} case status to closed`, `${b} records-la andha FIR status-a closed nu maathidu`, `${b} பதிவு நிலையை மாற்று`, `mark the ${b} complaint as resolved`];
  it("keeping and changing: no brief, no fast-lane screen, no filter from the rules", () => {
    const bad: string[] = [];
    for (const b of BODIES) for (const s of [...keep(b), ...change(b)]) {
      if (!(KEEPING.test(s) || CHANGE_RECORD.test(s))) bad.push(`class: ${s}`);
      if (briefTurn(s, world as never)?.kind === "screen") bad.push(`brief: ${s}`);
      if (quickScreen(s, world as never)) bad.push(`quick: ${s}`);
      const u = rules(s);
      if (u.kind === "do" && (u.steps ?? []).some((x) => x.a === "view" || x.a === "page")) bad.push(`rules: ${s}`);
    }
    expect(bad).toEqual([]);
  });
  it("a data question never moves the console, in English, Tamil and Tanglish", () => {
    const steps = [{ a: "view", view: { zone: 13 } }] as never;
    for (const s of ["Severe flood cases still open Adyar, just list them", "Adyar flooding open, give me just the number", "Zone 5, total open", "இந்த வாரம் severe மட்டும் எடுத்து போடு", "அடையாறு வெள்ள பட்டியல் குடு", "indha vaaram severe-a ellam list podu", "எந்த டிபார்ட்மெண்ட் ரொம்ப மெதுவா வேலை பாக்குது?"]) expect(isNavCommand(s, steps), s).toBe(false);
    for (const s of ["only Adyar", "show only Adyar", "அடையாறுக்கு மாற்று", "Adyar-ku maathu", "filter pannu Adyar"]) expect(isNavCommand(s, steps), s).toBe(true);
  });
  it("a Tamil verb inside a longer word is not the verb (போ in போராட்டம், போனவங்க)", () => {
    const steps = [{ a: "view", view: { zone: 2 } }] as never;
    for (const s of ["மணலில போராட்டம் கேஸ்", "காணாம போனவங்க கேஸ்"]) expect(isNavCommand(s, steps), s).toBe(false);
  });
  it("how fast Jarvis talks is a short order or about the voice, never a question about the data", () => {
    expect(rules("எந்த டிபார்ட்மெண்ட் ரொம்ப மெதுவா வேலை பாக்குது?").steps?.[0]?.a ?? "").not.toBe("speed");
    expect(rules("which department is slowest to close cases").steps?.[0]?.a ?? "").not.toBe("speed");
    for (const s of ["slower", "slow down", "speak slowly", "மெதுவா பேசு", "faster please"]) expect(rules(s).steps?.[0]?.a, s).toBe("speed");
  });
  it("a workspace is opened by name in Tamil and Tanglish as in English", () => {
    for (const s of ["open workspace morning round", "morning round ஒர்க்ஸ்பேஸ் திற", "morning round workspace open pannu", "morning round workspace-a thira"]) {
      const st = rules(s).steps?.[0] as { a: string; op?: string; name?: string } | undefined;
      expect([st?.a, st?.op, (st?.name ?? "").toLowerCase()], s).toEqual(["workspace", "open", "morning round"]);
    }
  });
  it("click and press name a control, not a request for a screen", () => {
    expect(quickScreen("click trends", world as never)).toBeNull();
    expect(quickScreen("Jarvis, press trends", world as never)).toBeNull();
    expect((rules("Jarvis, click Trends").steps?.[0] as { name?: string } | undefined)?.name).toBe("Trends");
  });
});

// RC-05: the same question has the same topic, filter and deadline in every language, and a lane never drops a filter it read.
import { CAT_ALIASES } from "./lexicon";
import { catIn, deptWordIn, statusIn } from "./quick";
describe("RC-05: topic, status and filters are read the same in every language and lane", () => {
  it("no spoken name belongs to two categories (a name that does would make one question two topics)", () => {
    const seen = new Map<string, string>(), clash: string[] = [];
    for (const [code, words] of Object.entries(CAT_ALIASES)) for (const w of words) { const k = w.trim().toLowerCase(); const o = seen.get(k); if (o && o !== code) clash.push(`${k}: ${o} and ${code}`); seen.set(k, code); }
    expect(clash).toEqual([]);
  });
  const triples: [string, string, string][] = [
    ["drain complaints in Ambattur", "Ambattur la drain complaints", "அம்பத்தூரில் வடிகால் புகார்கள்"],
    ["stray animal complaints in Valasaravakkam", "Valasaravakkam la stray dog complaints", "வளசரவாக்கத்தில் தெருநாய் புகார்கள்"],
    ["garbage complaints in Anna Nagar", "Anna Nagar la kuppai complaints", "அண்ணா நகரில் குப்பை புகார்கள்"],
    ["fire complaints in Madhavaram", "Madhavaram la fire complaints", "மாதவரத்தில் தீ புகார்கள்"],
  ];
  it("the topic and the place of one question are the same in English, Tanglish and Tamil", () => {
    for (const [en, tg, ta] of triples) {
      const a = quickScreen(en, world as never), b = quickScreen(tg, world as never), c = quickScreen(ta, world as never);
      const topic = (q: ReturnType<typeof quickScreen>) => (q?.slots as { cat?: string } | undefined)?.cat ?? null;
      const where = (q: ReturnType<typeof quickScreen>) => JSON.stringify((q?.slots as { zones?: number[] } | undefined)?.zones ?? null);
      expect([topic(b), topic(c)], en).toEqual([topic(a), topic(a)]);
      expect(topic(a), en).not.toBeNull();
      expect(where(b), en).toBe(where(a)); // the zone of the Tamil spelling is the data's (ta names come from the live world), checked on the real path
    }
  });
  it("past the deadline, said any way in three languages, is overdue; still open is open", () => {
    for (const s of ["past the deadline", "beyond the deadline", "after the deadline", "breached their deadline", "deadline missed", "delayed severe cases", "not resolved in time", "deadline thaandi pochu", "deadline mudinjiduchu", "deadline miss aachu", "தாமதமான புகார்கள்", "கெடு தாண்டிய புகார்கள்"]) expect(statusIn(` ${s} `), s).toBe("overdue");
    for (const s of ["still open", "unresolved ones", "pending cases", "not yet resolved", "innum mudiyaadha cases", "தீர்க்கப்படாத புகார்கள்"]) expect(statusIn(` ${s} `), s).toBe("open");
    expect(statusIn(" garbage complaints ")).toBeNull();
  });
  it("a broad word (water) never beats the specific one (lakes), in any language", () => {
    for (const s of ["lakes la water level enna", "what is the water level of the lakes", "ஏரிகளின் நீர் மட்டம் என்ன"]) expect(quickScreen(s, world as never)?.recipe, s).toBe("readings");
    expect(catIn(" water supply complaints ")).toBe("WATER_SUPPLY");
  });
  it("a filter the lane has no slot for is never dropped: a ward, or a department with no topic, goes to the agent", () => {
    for (const s of ["severe complaints in ward 172", "top five wards by severe complaints", "வார்டு 172 புகார்கள்"]) expect(quickScreen(s, world as never), s).toBeNull();
    expect(deptWordIn(" tax department unresolved ones ")).not.toBeNull();
    expect(quickScreen("Tax department, unresolved ones", world as never)).toBeNull();
  });
  it("a second topic word is not answered as the first (flood relief is not standing water)", () => {
    for (const s of ["explain the flood relief need in Adyar", "அடையாறு வெள்ள நிவாரணம் விளக்குங்க"]) expect(quickScreen(s, world as never), s).toBeNull();
    expect(quickScreen("explain the flooding complaint in Adyar", world as never)?.recipe).toBe("case");
  });
});

// RC-02: everyday words and foreign names never become a zone, a body, a reservoir or a case by sound or by a near spelling.
import { resolveEntity } from "./entities";
import { taMatch } from "./normalise";
describe("RC-02: no entity from an everyday sentence", () => {
  // sentences with no place or body in them, in the three languages; the data's names must not be heard in them
  const EVERYDAY = ["this week's status", "give me the quarterly summary", "what is there to see", "do it now", "close it", "tell me about the state", "was there any news today", "how are we doing this month",
    "indha vaaram nilavaram enna", "quarterly summary sollu", "adha close pannidu", "angu enna nadakkudhu", "inge vandhu paaru", "oru nimidam wait pannu", "maanila arasu pathi sollu", "ennaku konjam help pannu",
    "இந்த வாரம் நிலவரம்", "காலாண்டு சுருக்கம்", "ஆட்சியர் அறிக்கை", "மாநில நிலவரம்", "அங்க என்ன நடக்குது", "கொடு", "கொடுத்து விடு", "என்னிடம் சொல்லு", "இதை நிறுத்து"];
  it("resolves to no body and no zone", () => {
    const bad: string[] = [];
    for (const s of EVERYDAY) { const r = resolveEntity(s, world as never); if (r.kind === "entity" || r.kind === "ambiguous") bad.push(`${s} -> ${r.kind === "entity" ? r.entity.id : "ambiguous"}`); }
    expect(bad).toEqual([]);
  });
  it("a place named only by its first word is ambiguous, so it is no place (Anna Salai, Anna University)", () => {
    for (const s of ["Anna Salai status", "Anna flyover report", "அண்ணா சாலை அறிக்கை"]) { const r = resolveEntity(s, world as never); expect(r.kind === "entity" && r.entity.id === "ZONE-8", s).toBe(false); }
    const full = resolveEntity("Anna Nagar zone report", world as never);
    expect(full.kind === "entity" && full.entity.id).toBe("ZONE-8");
  });
  it("a Tamil name that ends in -u needs the whole name before it takes a case ending (கொசு is not கொடு)", () => {
    expect(taMatch("கொடு", "கொசு")).toBe(false);
    expect(taMatch("கொடைக்கானல்", "கொசு")).toBe(false);
    expect(taMatch("கொசுவை", "கொசு")).toBe(false);
    expect(taMatch("அடையாற்றில்", "அடையாறு")).toBe(true);
  });
  it("a misheard name keeps its first letter; a number before the word zones is a count", () => {
    expect(resolveEntity("Adayar report", world as never).kind === "entity").toBe(true);
    expect(rules("top five zones by open cases").steps?.some((x) => x.a === "view" && (x.view as { zone?: number | null } | undefined)?.zone === 5)).toBeFalsy();
  });
});

// RC-03 (and RC-14, normalise.ts): a short word is a word, not the start or the middle of another; a user's word is never a property of Object.
import { TA_SHORT, tamilAt } from "./quick";
import { normalise } from "./normalise";
import { DEPT_TA, SEV_WORDS, ZONES } from "./lexicon";
describe("RC-03: word edges, in every script", () => {
  const ta = (s: string) => /[஀-௿]/.test(s);
  const shortAliases = [...new Set([...Object.values(CAT_ALIASES).flat(), ...SEV_WORDS.map(([w]) => w)].map((x) => x.trim()).filter((x) => ta(x) && [...x].length <= TA_SHORT))];
  const tamilWords = [...new Set([...Object.values(ZONES).flatMap((z) => z.ta), ...Object.values(DEPT_TA), ...Object.values(CAT_ALIASES).flat(), ...SEV_WORDS.map(([w]) => w)].flatMap((x) => x.trim().split(" ")).filter(ta))];
  it("a short Tamil word is found only as a word (with a case ending), never inside a longer word of the lexicon or the data", () => {
    const bad: string[] = [];
    for (const a of shortAliases) for (const w of tamilWords) {
      if (w === a || !w.includes(a)) continue;
      const i = tamilAt(` ${w} `, a);
      // allowed: the word with a case ending; refused: anything else inside it
      const rest = w.slice(w.indexOf(a) + a.length);
      const ending = /^(ல்|ில்|யில்|ல|க்கு|ுக்கு|யை|ை|யால்|ால்|ின்|யின்|ும்|ம்|கள்|களை|களில்|ங்கள்|யும்|உம்|ே)/.test(rest);
      if (i >= 0 && !(w.startsWith(a) && ending)) bad.push(`${a} in ${w}`);
    }
    expect(bad).toEqual([]);
  });
  it("the Tamil word for severe is not the word for fire; a street lamp is not a request to explain", () => {
    expect(catIn(" தீவிர புகார்கள் ")).toBeNull();
    expect(catIn(" தீ விபத்து ")).toBe("FIRE_EXPLOSION");
    expect(catIn(" தீயில் ")).toBe("FIRE_EXPLOSION");
    for (const s of ["அடையாறு தெரு விளக்கு புகார்கள்", "Adyar la theru vilakku complaints kaattu"]) expect(rules(s).steps?.[0]?.a ?? "", s).not.toBe("explain");
    expect(rules("இதை விளக்குங்க").steps?.[0]?.a).toBe("explain");
  });
  it("high, low and medium are a severity only beside a word that says so", () => {
    for (const s of ["High Court report", "high court cases", "high school complaints", "high tide warning", "high rise building complaints", "low lying areas in Adyar", "medium sized zones"]) expect(quickScreen(s, world as never)?.slots?.sev ?? null, s).toBeNull();
    for (const s of ["high priority cases in Adyar this week", "low priority cases today", "low severity cases in Adyar", "medium level complaints"]) expect((quickScreen(s, world as never)?.slots as { sev?: string } | undefined)?.sev, s).toBeTruthy();
  });
  it("a word that is a property of every object is just a word (constructor, __proto__, toString, hasOwnProperty)", () => {
    for (const p of Object.getOwnPropertyNames(Object.prototype)) {
      const n = normalise(`show the ${p}`);
      expect(n.tokens.every((t) => typeof t === "string" && !t.includes("[native code]")), p).toBe(true);
      expect(() => rules(`show the ${p} cases`), p).not.toThrow();
    }
  });
  it("a Tamil verb inside a longer word is not a command (plan.ts), and the explain verb is whole (understand.ts)", () => {
    expect(isNavCommand("காணாம போனவங்க கேஸ்", [{ a: "view", view: { zone: 2 } }] as never)).toBe(false);
  });
});

// RC-06: one period table; a window the console does not hold is never answered with the current one.
import { calendarWindowIn, periodIn } from "./quick";
describe("RC-06: periods", () => {
  const WINDOWS: [string, string][] = [["today", "daily"], ["this week", "weekly"], ["weekly brief", "weekly"], ["this month", "monthly"], ["monthly", "monthly"], ["quarterly brief", "quarterly"], ["last 90 days", "quarterly"], ["this quarter", "quarterly"],
    ["இன்று", "daily"], ["இந்த வாரம்", "weekly"], ["இந்த வார", "weekly"], ["வாராந்திர", "weekly"], ["இந்த மாத", "monthly"], ["காலாண்டு", "quarterly"], ["innaiku", "daily"], ["vaaram", "weekly"], ["maasam", "monthly"]];
  it("each word of the table is the same window in the fast lane and in a brief on a body or a zone", () => {
    for (const [w, p] of WINDOWS) {
      expect(periodIn(` ${w} `), w).toBe(p);
      const turn = briefTurn(`Adyar police report ${w}`, world as never);
      if (turn?.kind === "screen") expect((turn.slots as { period?: string }).period, `brief ${w}`).toBe(p);
    }
  });
  it("yesterday, last week, last month, last quarter and the Tamil and Tanglish words for them are windows the console does not hold", () => {
    for (const s of ["yesterday", "yesterdays brief", "next week", "the day before yesterday", "நேற்றைய சுருக்கம்", "போன மாசம்", "கடந்த வாரம்", "அடுத்த வாரம்", "nethu severe cases", "pona vaaram"]) expect(calendarWindowIn(` ${s} `), s).toBe(true);
    for (const s of ["last 24 hours", "last 7 days", "last 30 days", "this week", "இந்த வாரம்"]) expect(calendarWindowIn(` ${s} `), s).toBe(false);
  });
  it("no lane answers such a window with the current one", () => {
    for (const s of ["severe cases yesterday", "yesterdays brief", "நேற்று கடுமையான சம்பவங்கள்", "கடந்த வாரம் நிலவரம்", "pona vaaram brief sollu", "next weeks brief"]) {
      expect(quickScreen(s, world as never), `quick: ${s}`).toBeNull();
      expect(briefTurn(s, world as never)?.kind === "screen", `brief: ${s}`).toBe(false);
    }
    const u = rules("severe cases yesterday");
    expect(u.kind === "refuse" || !(u.steps ?? []).some((x) => x.a === "view")).toBe(true);
  });
  it("a ranking of zones on one topic is the planner's, not a list of cases or a ranking of all kinds", () => {
    expect(quickScreen("kuppai complaints edha zone-la romba adhigam", world as never)).toBeNull();
    expect(quickScreen("top 5 zones by garbage complaints", world as never)).toBeNull();
    expect(quickScreen("top 5 zones by complaints", world as never)?.recipe).toBe("ranking");
  });
});

// RC-07: a follow-up has a positive sign; a new request with a place in it is never folded into the open screen; the Stage's own filter never says "none mention" about a place.
import { localStageCommand, pushScreen, stageEmpty, stageReducer } from "./stagelocal";
describe("RC-07: follow-ups and the Stage's filter", () => {
  const briefStage = { recipe: "brief", title: "Greater Chennai Police · brief, today", focus: null, slots: { dept: "POL-GCP", zones: [], period: "daily" }, blocks: [] };
  const frame = (text: string) => resolveFrame({ text, stage: briefStage as never, turns: [{ heard: "police report", did: "brief" }], lastPlace: null, lastText: "police report", world: world as never }).kind;
  it("a request of five or six words with a place and a topic is a new request, in three languages", () => {
    for (const s of ["describe the flooding complaint in Adyar", "summarize the garbage complaints in Ambattur", "Adyar flooding complaint pathi sollu", "அடையாறு வெள்ள புகார் பத்தி சொல்லு", "அடையாறு வெள்ளம் பத்தி சொல்லுங்க"]) expect(frame(s), s).toBe("none");
  });
  it("a follow-up that points back, or is a word or two, is still one", () => {
    for (const s of ["and in Adyar?", "same for Ambattur", "only Adyar", "Adyar", "what about Ambattur"]) expect(frame(s), s).not.toBe("none");
  });
  it("only a place, on a screen whose rows do not name it, rebuilds the screen for the place, and never says none mention it", () => {
    const m = pushScreen(stageEmpty, { ...briefStage, id: "s1", say: { en: "", ta: "" }, scope: {} } as never);
    for (const t of ["only Adyar", "Adyar mattum", "அடையாறு மட்டும்"]) {
      const cmd = localStageCommand(t) as never;
      const fx = JSON.stringify(cmd ? stageReducer(m, cmd).fx : []);
      expect(fx, t).not.toMatch(/None of these mention/);
    }
  });
});

// found by the golden diff: numbers and ranks are not names, and a short Tamil word that starts a compound (மழைநீர், rain water) still counts as that word.
describe("golden-diff regressions (lane a)", () => {
  it("top five departments, first three zones: a number word in front of an agency word names no body", () => {
    for (const s of ["List the top five departments by pending cases", "show the first three zones", "the last ten police reports"]) expect(foreignIn(s, world as never), s).toBeNull();
  });
  it("a Tamil word of three letters or more at the start of a compound is the word (மழை in மழைநீர்)", () => {
    expect(tamilAt(" மழைநீர் வடிகால் ", "மழை")).toBeGreaterThanOrEqual(0);
    expect(tamilAt(" தீவிர ", "தீ")).toBe(-1);
  });
  it("the Tamil word for electricity before the word for department is not a place", () => {
    expect(foreignIn("மின்சாரத் துறையின் நிலுவை வழக்குகள் எத்தனை?", world as never)).toBeNull();
  });
});

describe("RC-05 (skeptic SK-3, SK-4, SK-6): a status word is read, never dropped", () => {
  it("resolved and closed are a status in three languages, and the fast lane passes it on", () => {
    for (const s of ["resolved cases this week", "closed cases in Adyar", "solved complaints this week", "தீர்க்கப்பட்ட புகார்கள் அடையாறில்", "mudinja complaints this week"]) {
      const q = quickScreen(s, world as never);
      expect((q?.slots as { status?: string } | undefined)?.status, s).toBe("resolved");
    }
  });
  it("the Tamil word for unresolved is a status, not the data-completion recipe", () => {
    for (const s of ["இந்த வாரம் தீர்க்கப்படாத புகார்கள்", "தீர்க்கப்படாத புகார்கள் அடையாறில்"]) {
      const q = quickScreen(s, world as never);
      expect(q?.recipe, s).not.toBe("complete");
      expect((q?.slots as { status?: string } | undefined)?.status, s).toBe("open");
    }
  });
  it("open cases in a zone is a filter, while \"open the map\" stays a command", () => {
    const q = quickScreen("open cases in Adyar", world as never);
    expect(q?.recipe).toBe("cases");
    expect((q?.slots as { status?: string } | undefined)?.status).toBe("open");
    expect(quickScreen("open the map", world as never)).toBeNull();
  });
});
