// QA pass 4, fixer G2: Ask District IQ's rules lane on the real snapshot, no model key in the process (the real ask(), the real store, a frozen clock).
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/g2-ask.test.ts
// RC-43: an input the app reads but cannot apply (zone 99, a place the district does not have, "last 0 days", "31 February", a year to come) is said so, in the
//        language of the question; it is not answered with the whole district or the last 90 days.
// RC-44: what chat does not do (save a workspace, list every source, forecast, draft a letter) is said so with where to do it, never the default KPIs or
//        incident list; a share is answered as a share; a ranking of taluks lists the taluks; "how many severe" leads with severe.
// None of these sentences is in the open or the sealed set.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { asOf } from "@/lib/collector/intel";
import { ask } from "@/lib/assistant/pipeline";
import { clearCaches } from "@/lib/thunai/round";

const USER = "qa.g2.ask@example.test";
type Card = Awaited<ReturnType<typeof ask>>["card"];
const askChat = async (message: string, period = "weekly"): Promise<Card> => (await ask({ user: USER, sessionId: null, message, inputMode: "text", language: "auto",
  scope: { period, zone: null, dept: null, cat: null, taluk: null } as never, replyTo: null, pinId: null, insightKey: null, lockDept: null, stage: () => undefined } as never)).card;
beforeAll(async () => { vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-06T06:30:00.000Z") }); clearCaches(); await asOf(); });
afterAll(() => { vi.useRealTimers(); });

/** A refusal or a question back: words only, no figure block, no list, no scope line of a district answer. */
const saysNothingCounted = (c: Card) => {
  expect(c.kind, c.headline).toMatch(/clarify|refusal/);
  expect(c.kpis ?? [], c.headline).toEqual([]);
  expect(c.incidents ?? [], c.headline).toEqual([]);
  expect(`${c.headline}\n${c.answerMarkdown}`).not.toMatch(/\d{1,3},\d{3} (incidents|citizen)|last 90 days|District-wide/);
};
const TAMIL = /[஀-௿]/;
const hasLatinSentence = (s: string) => /\b[A-Za-z]{4,}\s+[A-Za-z]{3,}\s+[A-Za-z]{3,}\b/.test(s);

describe("RC-43: an input that cannot be applied is named, in English, Tamil letters and Tanglish", () => {
  it.each([
    ["en zone", "zone 99 complaints", /zone 99/i, /1 to 15/],
    ["en zone 0", "show incidents in zone 0", /zone 0/i, /1 to 15/],
    ["en zone high", "how many open complaints in zone 16", /zone 16/i, /1 to 15/],
    ["ta zone", "மண்டலம் 99 புகார்கள்", /99/, /1 முதல் 15/],
    ["tanglish zone", "zone 99 complaints kaattu", /Zone 99/i, /1 mudhal 15/],
    ["en ward", "ward 999 complaints", /ward 999/i, /1 to 200/],
    ["ta ward", "வார்டு 999 புகார்கள்", /999/, /1 முதல் 200/],
    ["tanglish ward", "ward 999 complaints evlo", /Ward 999/i, /1 mudhal 200/],
    ["en place", "complaints in Atlantis", /Atlantis/, /not counted anything|have not counted/],
    ["en place two words", "garbage complaints near Narnia Heights", /Narnia/, /have not counted/],
    ["tanglish place", "Atlantis la complaints evlo", /Atlantis/, /edhuvum ennala/],
    ["en last 0", "how many complaints in Adyar in the last 0 days", /last 0 days/, /not a period/],
    ["ta last 0", "கடந்த 0 நாட்கள் புகார்கள்", /0 நாட்கள்/, /காலம் அல்ல/],
    ["tanglish last 0", "last 0 naal complaints kaattu", /last 0 naal/, /period illa/],
    ["en 31 february", "incidents on 31 February", /31 February/, /February has 28 days/],
    ["en feb 30", "complaints on Feb 30", /30 February/, /days/],
    ["en year to come", "complaints from 2030", /2030/, /has not happened yet/],
    ["ta year", "2030 ஆம் ஆண்டு புகார்கள்", /2030/, /இன்னும் வரவில்லை/],
    ["tanglish year", "2030 la complaints evlo", /2030/, /innum varala/],
    ["en past year", "complaints in 2019", /2019/, /about 180 days/],
    ["en this year", "how many complaints in 2026", /2026/, /about 180 days/]
  ])("%s: %s", async (_n, text, named, why) => {
    const c = await askChat(text as string);
    saysNothingCounted(c);
    expect(c.headline).toMatch(named as RegExp);
    expect(c.headline).toMatch(why as RegExp);
    // the language of the question is the language of the line
    if (/^(ta )/.test(_n as string)) { expect(c.headline).toMatch(TAMIL); expect(hasLatinSentence(c.headline.replace(/"[^"]*"/g, ""))).toBe(false); }
  });
  // what is valid is still answered, with the place and period it names
  it.each([
    ["zone", "complaints in zone 5 this week", /Zone 5/],
    ["place", "garbage complaints in Kodambakkam", /Kodambakkam/],
    ["ward", "complaints in ward 106", /Ward 106|ward 106/i],
    ["district name", "complaints in Chennai today", /last 24 hours/i],
    ["month with year", "complaints in October 2026", /October 2026/],
    ["last 10 days", "complaints in Adyar in the last 10 days", /last 10 days/i],
    ["a real date", "incidents on 28 October", /./],
    ["a pasted id with a year in it", "tell me about INC-2026-1234", /./]
  ])("still answered: %s", async (_n, text, scopeHas) => {
    const c = await askChat(text as string);
    expect(c.kind, c.headline).not.toBe("clarify");
    expect(`${c.scopeLine} ${c.headline}`).toMatch(scopeHas as RegExp);
  });
});

describe("RC-44: what chat does not do is said, with where to do it, and carries no unrelated figures", () => {
  it.each([
    ["en workspace", "Save this workspace as Collector's Daily Briefing and reopen last week's version", /Workspaces/],
    ["en workspace 2", "please save this view as my monday layout", /Workspaces/],
    ["ta workspace", "இந்தப் பணியிடத்தை காலை அறிக்கை என்று சேமி", /Workspaces/],
    ["tanglish workspace", "indha workspace-a morning briefing nu save pannu", /Workspaces/],
    ["en sources", "Show every source and application record used to create this briefing", /Sources section/],
    ["ta sources", "இந்த அறிக்கைக்குப் பயன்படுத்திய எல்லா ஆதாரப் பதிவுகளையும் காட்டு", /Sources/],
    ["tanglish sources", "indha briefing-ku use pannina ella sources records-aiyum kaattu", /Sources/],
    ["en forecast", "predict how many complaints Adyar will get next week", /cannot say what will happen/],
    ["en forecast 2", "how many complaints will be resolved by Friday", /cannot say what will happen/],
    ["ta forecast", "அடுத்த வாரம் புகார்கள் எத்தனை வரும் என்று கணித்துச் சொல்", /எதிர்காலத்தை/],
    ["tanglish forecast", "adutha vaaram complaints evlo varum nu predict pannu", /future-a estimate/],
    ["en letter", "draft a polite letter to the Commissioner about flooding in Adyar", /cannot draft letters/],
    ["ta letter", "ஆணையருக்கு வெள்ளம் பற்றி ஒரு கடிதம் எழுது", /கடிதம்/],
    ["tanglish letter", "Commissioner-ku flooding pathi oru letter ezhudhu", /letter illa email/],
    ["en complaints by department", "complaints by department this week", /not citizens. complaints/],
    ["ta complaints by department", "துறை வாரியாக புகார்கள் காட்டு", /சம்பவங்களை எண்ணுகிறது/],
    ["tanglish complaints by department", "department wise complaints kaattu", /department-wise pirichu/]
  ])("%s: %s", async (_n, text, says) => {
    const c = await askChat(text as string);
    saysNothingCounted(c);
    expect(`${c.headline}\n${c.answerMarkdown}`).toMatch(says as RegExp);
    if (/^ta /.test(_n as string)) expect(c.headline).toMatch(TAMIL);
  });
  // the guard in the other direction: a question that merely sits near those words is still answered
  it.each([
    "will it rain tomorrow",
    "how many complaints were resolved yesterday",
    "complaints this week compared with last week in Adyar",
    "what is the weather forecast for next week",
    "the briefing for today",
    "hospital beds above 90 percent"
  ])("still answered: %s", async (text) => {
    const c = await askChat(text);
    expect(c.kind, c.headline).toBe("answer");
  });

  it.each([
    ["en resolved", "percentage of resolved complaints", /^\d[\d.,]*% of .* are resolved/, /\d[\d,]* of \d[\d,]*/],
    ["en open in a zone", "what percentage of complaints in Adyar are still open this week", /% of .* are still open/, /Adyar/],
    ["en severe", "what share of incidents is severe in the last 30 days", /% of .* are severe/, /./],
    ["ta resolved", "தீர்க்கப்பட்ட புகார்களின் சதவீதம் என்ன", /% .*தீர்க்கப்பட்டவை/, /./],
    ["tanglish resolved", "resolved complaints sathaveedham evlo", /% .*resolve aanavai/, /./]
  ])("a share is a share: %s", async (_n, text, head, body) => {
    const c = await askChat(text as string);
    expect(c.kind).toBe("answer");
    expect(c.headline).toMatch(head as RegExp);
    expect(`${c.answerMarkdown}`).toMatch(body as RegExp);
    expect(c.incidents ?? []).toEqual([]);
    // the percentage is the two figures it is made of
    const m = /\*\*([\d.,]+)%\*\* .*?([\d,]+)(?: \/ | of )([\d,]+)/.exec(c.answerMarkdown);
    expect(m, c.answerMarkdown).not.toBeNull();
    const [p, a, b] = [Number(m![1].replace(/,/g, "")), Number(m![2].replace(/,/g, "")), Number(m![3].replace(/,/g, ""))];
    expect(Math.abs(p - (a / b) * 100)).toBeLessThan(0.06);
  });

  it("a ranking asked as an order lists the taluks", async () => {
    const c = await askChat("List the taluks with the highest number of unresolved incidents last month");
    expect(c.answerMarkdown).toMatch(/Tondiarpet|Mambalam|Mylapore/);
    expect(c.answerMarkdown.match(/\(\d+\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
  it.each(["how many severe", "how many high"])("a severity question leads with the severity asked: %s", async (text) => {
    const c = await askChat(text);
    const word = /high/.test(text) ? /^High/ : /^Severe/;
    expect(c.headline).toMatch(word);
    expect(c.headline).not.toMatch(/^Low leads/);
  });
});

// RC-05, RC-07 (PB-288, PB-289, PB-298): a zone said by number is that zone in Ask District IQ's lanes too, not only in Jarvis
describe("a zone said by a number word or in Tamil letters is the zone, in chat", () => {
  it.each([
    ["en word", "how many open complaints in zone five", /Royapuram/],
    ["en digits", "how many open complaints in zone 5", /Royapuram/],
    ["ta word", "மண்டலம் ஐந்து பத்தி சொல்லு, எத்தனை புகார்", /ராயபுரம்|Royapuram/],
    ["tanglish word", "zone anju la evlo complaints", /Royapuram|ராயபுரம்/]
  ])("%s", async (_n, q, re) => {
    const c = await askChat(q);
    expect(`${c.headline}\n${c.answerMarkdown}\n${JSON.stringify(c.scope ?? "")}`, c.headline).toMatch(re);
  });
});
