// The brain's own rules, without a model or a store: what SQL may read, what a window means, what arithmetic may be, and what may be said.
import { describe, expect, it } from "vitest";
import { sqlProblem } from "./sql";
import { fitInput, whenFit } from "./fit";
import { TOOLS } from "./tools";
import { periodFor, winOf } from "./when";
import { calc } from "./tools/meta";
import { checkAnswer, keepSound, knownOf, sentences, strayFigures } from "./ground";
import { owedLang, partialSay, validShow } from "./loop";
import { heardAs, soundKey } from "./names";
import { label } from "./tools/incidents";
import { studioAsked } from "./index";
import { justBefore } from "./loop";
import { defaultShow, trendFirst } from "./render";
import { outText, partText } from "./format";
import type { World } from "@/lib/thunai/types";
import type { Evidence, FinalAnswer, Part } from "./types";

const NOW = "2026-11-26 10:15:00";
const W = { zones: [{ n: 13, name: "Adyar" }, { n: 9, name: "Teynampet" }], taluks: [{ code: "T1", name: "Velachery" }], depts: [{ code: "POLICE", name: "Greater Chennai Police" }] } as unknown as World;
const ev = (parts: Part[], about = "x", input: Record<string, unknown> = {}): Evidence => ({ id: "r1", tool: "incidents", input, ms: 1, out: { about, parts, sources: ["s"] } });
const ans = (say: string, o: Partial<FinalAnswer> = {}): FinalAnswer => ({ kind: "answer", say, points: [], title: "", show: [], options: [], used: [], lang: "en", ...o }) as FinalAnswer;
const part = (key: string, rows: Record<string, string | number>[], o: Partial<Part> = {}): Part => ({ key, title: key, cols: Object.keys(rows[0] ?? {}).map((k) => ({ key: k, label: k })), rows, ...o });

describe("what sql may read", () => {
  it("a SELECT over the register, the news, the readings", () => {
    for (const q of ["SELECT COUNT(*) FROM cases WHERE is_open = 1", "WITH t AS (SELECT zone, COUNT(*) AS n FROM cases GROUP BY zone) SELECT * FROM t ORDER BY n DESC", "SELECT title FROM documents ORDER BY published_at DESC LIMIT 5"]) expect(sqlProblem(q), q).toBeNull();
  });
  it("never anything that writes, attaches or calls out of the store", () => {
    for (const q of ["DELETE FROM incidents", "UPDATE incidents SET status = 'Resolved'", "INSERT INTO incidents VALUES (1)", "DROP TABLE incidents", "ATTACH 'x.db' AS y", "PRAGMA table_info(incidents)", "SELECT 1; DELETE FROM incidents", "SELECT load_extension('x')", "SELECT readfile('.env')"]) expect(sqlProblem(q), q).not.toBeNull();
  });
  it("never passwords, sign-in records or a citizen's private fields", () => {
    for (const q of ["SELECT * FROM users", "SELECT password_hash FROM users", "SELECT email FROM complaints", "SELECT mobile_number FROM complaints", "SELECT name, address FROM petitions", "SELECT otp_hash FROM password_resets", "SELECT secret_enc FROM sources", "SELECT reading FROM petitions"]) expect(sqlProblem(q), q).not.toBeNull();
  });
  it("a forbidden name inside quotes or a comment is still looked at as text, not as a way round", () => {
    expect(sqlProblem("SELECT 'users' AS word FROM cases")).toBeNull();
    expect(sqlProblem("SELECT * FROM cases UNION SELECT * FROM users")).not.toBeNull();
    expect(sqlProblem("SELECT * FROM/**/users")).not.toBeNull();
  });
});

describe("what a window means", () => {
  it("today runs from 12 AM", () => {
    const w = winOf({ named: "today" }, NOW);
    expect(w.from.slice(0, 16)).toBe("2026-11-26 00:00");
    expect(w.to.slice(0, 16)).toBe("2026-11-26 10:15");
    expect(periodFor(w)).toBe("daily");
  });
  it("last month is the calendar month; the last 30 days are not", () => {
    const m = winOf({ named: "last_month" }, NOW), d = winOf({ named: "last_30_days" }, NOW);
    expect(m.from.slice(0, 10)).toBe("2026-10-01");
    expect(m.to.slice(0, 10)).toBe("2026-10-31");
    expect(d.from.slice(0, 10)).toBe("2026-10-27");
    expect(periodFor(d)).toBe("monthly");
  });
  it("a range of dates, and a count of days", () => {
    const r = winOf({ from: "2026-11-10", to: "2026-11-12" }, NOW);
    expect([r.from.slice(0, 10), r.to.slice(0, 10)]).toEqual(["2026-11-10", "2026-11-12"]);
    expect(winOf({ last_days: 3 }, NOW).days).toBe(3);
  });
  it("a window before it, of the same length", () => {
    const w = winOf({ named: "last_7_days" }, NOW);
    expect(w.prev).toBeTruthy();
    expect(new Date(w.prev!.to).getTime()).toBeLessThanOrEqual(new Date(w.from).getTime());
  });
});

describe("what the model wrote, made to fit the tool", () => {
  const tool = (n: string) => TOOLS.find((t) => t.name === n)!;
  it("a window in any of the ways it gets written is the same window", () => {
    for (const v of [{ named: "last_90_days" }, { last_90_days: true }, "last_90_days", "last 90 days", "quarterly", { period: "quarterly" }, { named: "quarter" }]) expect(whenFit(v), JSON.stringify(v)).toEqual({ named: "last_90_days" });
    expect(whenFit({ days: 3 })).toEqual({ last_days: 3 });
    expect(whenFit("last 6 hours")).toEqual({ last_hours: 6 });
    expect(whenFit("2026-11-10 to 2026-11-12")).toEqual({ from: "2026-11-10", to: "2026-11-12" });
    expect(whenFit({ date: "2026-11-10" })).toEqual({ from: "2026-11-10", to: "2026-11-10" });
    expect(whenFit(null)).toBeNull();
  });
  it("a window that cannot be read is refused, never counted as today", () => {
    for (const v of ["some time ago", { since_monday: true }, { named: "fortnight" }, { last_days: -2 }]) expect(() => whenFit(v), JSON.stringify(v)).toThrow();
  });
  it("one word or a list, quoted words, other names for a field", () => {
    expect(fitInput(tool("incidents"), { when: { last_90_days: true }, group_by: "taluk", rank_by: '"reported"', zone: "Adyar", severity: "severe" })).toMatchObject({ when: { named: "last_90_days" }, group_by: ["taluk"], rank_by: "reported", zones: ["Adyar"] });
    expect(fitInput(tool("dashboard"), { panel: "followups", period: "monthly", department: "PWD" })).toEqual({ panel: "followups", when: { named: "last_30_days" }, dept: "PWD" });
    expect(fitInput(tool("search"), { query: "Kolathur" })).toEqual({ text: "Kolathur" });
  });
  it("a field the tool does not have, a panel that does not exist, or a missing field is said", () => {
    expect(() => fitInput(tool("incidents"), { shoe_size: 9 })).toThrow(/no field shoe_size/);
    expect(() => fitInput(tool("dashboard"), { panel: "weather_tile" })).toThrow(/not one of/);
    expect(() => fitInput(tool("dashboard"), {})).toThrow(/needs panel/);
  });
});

describe("arithmetic", () => {
  it("is arithmetic", () => {
    expect(calc("(46 - 31) / 31 * 100")).toBeCloseTo(48.387, 2);
    expect(calc("1,200 + 5")).toBe(1205);
    expect(calc("round(2/3*100, 1)")).toBeCloseTo(66.7, 5);
  });
  it("and nothing else", () => {
    for (const x of ["process.exit()", "1 +", "fetch(1)", "constructor", "1/0", ""]) expect(() => calc(x), x).toThrow();
  });
});

describe("what may be said", () => {
  const e = ev([part("by", [{ zone: "Adyar", count: 46 }, { zone: "Teynampet", count: 31 }], { of: "rank", total: 15 })], "77 incidents in two zones");
  const k = knownOf([e], ["which zones lead"]);
  it("a figure a result holds, in digits or words", () => {
    expect(strayFigures("Adyar has 46 and Teynampet 31.", k)).toEqual([]);
    expect(strayFigures("Adyar has forty-six.", k)).toEqual([]);
    expect(strayFigures("In the last 7 days, 77 were reported.", k)).toEqual([]);
  });
  it("a figure no result holds is caught, and the sentence is what is dropped", () => {
    expect(strayFigures("Adyar has 52 incidents.", k)).toEqual(["52"]);
    const v = checkAnswer(ans("Adyar leads with 46 incidents. Teynampet has 99."), k, W, { toolsRun: 1 });
    expect(v.ok).toBe(false);
    expect(keepSound(ans("Adyar leads with 46 incidents. Teynampet has 99."), k, W).say).toBe("Adyar leads with 46 incidents.");
  });
  it("a zone or newspaper in no result is caught; a department's plain name is not a claim", () => {
    expect(checkAnswer(ans("Velachery has 46."), k, W, { toolsRun: 1 }).ok).toBe(false);
    expect(checkAnswer(ans("The Hindu says 46."), k, W, { toolsRun: 1 }).ok).toBe(false);
    expect(checkAnswer(ans("Ask the Greater Chennai Police about the 46 in Adyar."), k, W, { toolsRun: 1 }).ok).toBe(true);
  });
  it("never 'not held' without having looked", () => {
    expect(checkAnswer(ans("The records do not hold that.", { kind: "chat" }), knownOf([], ["beds"]), W, { toolsRun: 0 }).ok).toBe(false);
    expect(checkAnswer(ans("The records do not hold that."), k, W, { toolsRun: 2 }).ok).toBe(true);
  });
  it("the language of the question, no result keys, no ids aloud", () => {
    expect(checkAnswer(ans("Adyar leads with 46."), k, W, { toolsRun: 1, wantLang: "ta" }).ok).toBe(false);
    expect(checkAnswer(ans("அடையாறில் 46."), k, W, { toolsRun: 1, wantLang: "ta" }).ok).toBe(true);
    expect(checkAnswer(ans("As r1 says, 46."), k, W, { toolsRun: 1 }).ok).toBe(false);
    expect(checkAnswer(ans("INC-20261126-ABC is open."), knownOf([e], ["INC-20261126-ABC"]), W, { toolsRun: 1 }).ok).toBe(false);
  });
  it("a scale word is the record's own unit", () => {
    const L = knownOf([ev([part("works", [{ work: "Royapettah wing", spent_lakh: 178.85, sanctioned_lakh: 324 }])])], []);
    expect(strayFigures("178.85 lakh of 324 lakh is spent, against 5 crore.", L)).toEqual(["5 crore"]);
    expect(strayFigures("The figures run to crores of rupees.", L)).toEqual([]);
  });
  it("a sentence that corrects itself half way is not said", () => {
    expect(checkAnswer(ans("Adyar has 46, with 31... no, 46 open."), k, W, { toolsRun: 1 }).ok).toBe(false);
    expect(checkAnswer(ans("Adyar has 46; no severe case."), k, W, { toolsRun: 1 }).ok).toBe(true);
  });
  it("a filler is no answer", () => {
    for (const s of ["placeholder", "Placeholder.", "...", "TBD"]) expect(checkAnswer(ans(s), k, W, { toolsRun: 1 }).ok, s).toBe(false);
  });
  it("a question back needs its choices", () => {
    expect(checkAnswer(ans("By what?", { kind: "clarify" }), k, W, { toolsRun: 0 }).ok).toBe(false);
    expect(checkAnswer(ans("By what?", { kind: "clarify", options: [{ label: "a", request: "a" }, { label: "b", request: "b" }] as FinalAnswer["options"] }), k, W, { toolsRun: 0 }).ok).toBe(true);
  });
});

describe("names", () => {
  const L = { ...W, places: [{ name: "Kolathur", zone: 6, aliases: [] }, { name: "Royapuram", zone: 5, aliases: [] }, { name: "Pallikaranai", zone: 14, aliases: [] }] } as unknown as World;
  it("a ranking by zone names the zones, whatever form the key takes", () => {
    expect(label("zone", "Adyar", { world: W })).toBe("Adyar");
    expect(label("zone", 13, { world: W })).toBe("Adyar");
    expect(label("zone", "13", { world: W })).toBe("Adyar");
    expect(label("zone", null, { world: W })).toBe("No zone on record");
  });
  it("a place written as it sounded is the place", () => {
    expect(soundKey("Coletour")).toBe(soundKey("Kolathur"));
    expect(soundKey("Raya Buram")).toBe(soundKey("Royapuram"));
    expect(heardAs("Tell me about the Coletour news", L)).toEqual({ heard: "Coletour", name: "Kolathur" });
    expect(heardAs("construction ban in Pallikarnai", L)?.name).toBe("Pallikaranai");
    expect(heardAs("what did the newspapers report about Kolathur", L)).toBeNull();
    expect(heardAs("police report of the school accident", L)).toBeNull();
  });
});

describe("what stands beside the question", () => {
  const files = "Chennai Metro Daily Station Ridership by Ticket Type; Chennai Relief Shelter Locations (District Disaster Management)";
  it("the uploaded files only when the talk is of them", () => {
    for (const q of ["How many relief shelters are there?", "metro ridership on 14 November", "what datasets have I added", "summarise my data"]) expect(studioAsked(files, q), q).toBe(true);
    for (const q of ["Their main problems?", "Who can confirm it?", "Which police station has the most cases?", "open complaints in Adyar"]) expect(studioAsked(files, q), q).toBe(false);
    expect(studioAsked(null, "my data")).toBe(false);
  });
  it("the thread of the conversation", () => {
    expect(justBefore([])).toContain("Nothing has been said");
    const t = justBefore([{ user: "Which zone had the most cases?", assistant: "Teynampet, 158." }, { user: "And the least?", assistant: "Manali, 24." }]);
    expect(t).toContain("And the least?");
    expect(t).toContain("Manali, 24.");
  });
});

describe("the language owed", () => {
  it("English, Tamil script, and Tamil in Latin letters", () => {
    expect(owedLang("how many incidents are open in Adyar", null)).toBe("en");
    expect(owedLang("அடையாறில் எத்தனை சம்பவங்கள்", null)).toBe("ta");
    expect(owedLang("adyar la evlo incidents irukku", null)).toBe("ta");
    expect(owedLang("innaikku enna news vandhuchu", null)).toBe("ta");
    expect(owedLang("Yen Royapuram la ivlo case?", null)).toBe("ta");
  });
  it("a request for a language is the model's to follow; a short yes keeps the last one", () => {
    expect(owedLang("say it in tamil", "en")).toBeNull();
    expect(owedLang("ok", "ta")).toBe("ta");
  });
});

describe("the sentence while it is still being written", () => {
  it("reads what has come of say, with its escapes", () => {
    expect(partialSay('{"kind":"answer","say":"Adyar leads with 46. Tey')).toBe("Adyar leads with 46. Tey");
    expect(partialSay('{"kind":"answer","say":"He said \\"no\\". Next')).toBe('He said "no". Next');
    expect(partialSay('{"kind":"answer"')).toBeNull();
  });
  it("sentences keep initials, decimals and Rs. together", () => {
    expect(sentences("M.K.B. Nagar has 3. Rainfall is 6.5 mm. Onions cost Rs. 40 a kilo.")).toEqual(["M.K.B. Nagar has 3.", "Rainfall is 6.5 mm.", "Onions cost Rs. 40 a kilo."]);
  });
});

describe("what is drawn", () => {
  const months = part("trend", [{ month: "2026-09", kind: "Flooding", count: 4 }, { month: "2026-10", kind: "Flooding", count: 9 }], { of: "series" });
  const series: Evidence = { ...ev([{ ...months, key: "r1.trend" }]) };
  it("only what was read, and a trend as a trend", () => {
    expect(validShow([{ as: "table", from: "r1.trend" }, { as: "bars", from: "r9.none" }] as never, [series])).toEqual([{ as: "line", from: "r1.trend" }]);
  });
  it("a whole briefing shows every section that has something", () => {
    const b: Evidence = { ...ev([{ ...part("figures", [{ figure: "Reported", value: 5 }], { of: "kpis" }), key: "r1.figures" }, { ...part("serious", [{ id: "INC-1", title: "Fire" }], { of: "cases" }), key: "r1.serious" }, { ...part("news", [{ headline: "Rain" }], { of: "news" }), key: "r1.news" }, { ...part("beds", [{ hospital: "GH", beds: 4 }]), key: "r1.beds" }]), tool: "briefing" };
    const out = validShow([{ as: "cases", from: "r1.serious" }] as never, [b]).map((x) => x.from);
    expect(out[0]).toBe("r1.serious");
    expect(out).toEqual(expect.arrayContaining(["r1.figures", "r1.news", "r1.beds"]));
  });
  it("a trend asked for is drawn as a line, first", () => {
    const ps = new Map([["r1.trend", { p: { ...months, key: "r1.trend" }, e: series }], ["r1.by", { p: part("r1.by", [{ kind: "Flooding", count: 13 }], { of: "rank" }), e: series }]]);
    expect(trendFirst([{ as: "bars", from: "r1.by" }] as never, ps, "Create a quarterly trend of incident categories")[0]).toEqual({ as: "line", from: "r1.trend" });
    expect(trendFirst([{ as: "bars", from: "r1.by" }] as never, ps, "Which kind is most common?")).toEqual([{ as: "bars", from: "r1.by" }]);
  });
  it("nothing named: the last list read is drawn", () => {
    expect(defaultShow([series], "voice").length).toBeGreaterThanOrEqual(0);
  });
  it("a split by month and kind is put to the model whole, one row a kind", () => {
    const rows = ["2026-08", "2026-09", "2026-10", "2026-11"].flatMap((m, j) => ["Flooding", "Garbage", "Theft", "Roads", "Fire"].map((k, i) => ({ month: m, kind: k, reported: (i + 1) * 10 + j })));
    const t = partText({ ...part("r1.trend", rows, { of: "series" }), key: "r1.trend" });
    expect(t).toContain("kind | 2026-08 | 2026-09 | 2026-10 | 2026-11 | all");
    expect(t).toContain("Fire | 50 | 51 | 52 | 53 | 206");
    expect(t.split("\n").length).toBe(7);
  });
  it("a result is put to the model with its keys and its window", () => {
    const t = outText("r1", { about: "46 incidents", when: "today", parts: [part("by", [{ zone: "Adyar", count: 46 }])], sources: ["police records"] });
    expect(t).toContain("Adyar");
    expect(t).toContain("today");
    expect(t).toContain("police records");
  });
});
