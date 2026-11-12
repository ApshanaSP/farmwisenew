// QA pass 4, SKEPTIC 1 (language): breaks in the understanding, figure and time fixes of lane f and of fixers G1, G2, U1 and U2.
// Every test here is written with it.fails: it describes what should happen, and it FAILS today, so the suite stays green and the break stays visible.
// A fixer turns the it.fails into it. Each name starts with the break id (SKG1-nn); the report is docs/qa/pass4/reviews/g-skeptic-lang.md.
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/skeptic-g1.test.ts
// The sentences are the skeptic's own; none is in the open or the sealed set. The real path is the pinned snapshot, a frozen clock (2026-11-06 12:00 IST) and
// no model key: the real ask() for Ask District IQ, grader/client-sim.ts (the browser's own order of lanes, the real planRound) for Jarvis and the Stage.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { asOf } from "@/lib/collector/intel";
import { ask } from "@/lib/assistant/pipeline";
import { clearCaches } from "@/lib/thunai/round";
import { allowedSet, gateChunk } from "@/lib/thunai/numbergate";
import { parseWhen as parseRemind } from "@/lib/thunai/understand";
import { parseWhen as parseSourceDate } from "@/lib/collector/sourcemap";
import { browserWorld, ClientSim } from "./grader/client-sim";

const NOW = new Date("2026-11-06T06:30:00.000Z");
const USER = "qa.skg1@example.test";
type Card = Awaited<ReturnType<typeof ask>>["card"];
const askChat = async (message: string, period = "weekly"): Promise<Card> => (await ask({ user: USER, sessionId: null, message, inputMode: "text", language: "auto",
  scope: { period, zone: null, dept: null, cat: null, taluk: null } as never, replyTo: null, pinId: null, insightKey: null, lockDept: null, stage: () => undefined } as never)).card;
const kpi = (c: Card) => String((c.kpis ?? [])[0]?.value ?? "");
/** the count the card leads with, and the window it says it used */
const figure = (c: Card) => `${c.kind} | ${c.headline} | ${c.scopeLine ?? ""} | ${kpi(c)}`;
/** a refusal or a question back: words only, no figure, no list */
const refusesToCount = (c: Card) => {
  expect(c.kind, figure(c)).toMatch(/clarify|refusal/);
  expect(c.kpis ?? [], figure(c)).toEqual([]);
  expect(c.incidents ?? [], figure(c)).toEqual([]);
};

let w: Awaited<ReturnType<typeof browserWorld>>;
beforeAll(async () => { vi.useFakeTimers({ toFake: ["Date"], now: NOW }); clearCaches(); await asOf(); w = await browserWorld(); }, 300_000);
afterAll(() => { vi.useRealTimers(); });

async function talk(...said: string[]) {
  vi.setSystemTime(NOW);
  clearCaches();
  const sim = new ClientSim(w.world, {}, w.list);
  const outs = [];
  for (const s of said) outs.push(await sim.handle(s));
  return { sim, outs };
}
const rows = (sim: ClientSim) => (sim.doc?.blocks ?? []).flatMap((b) => (b.kind === "CaseList" ? b.rows : []));
/** "show severe complaints", then the phrase: the 1-based positions in the list that were put in the approval tray */
async function drafted(phrase: string) {
  const { sim, outs } = await talk("show severe complaints");
  const ids = rows(sim).map((r) => r.id);
  expect(ids.length, "the list has rows").toBeGreaterThan(5);
  const o = await sim.handle(phrase);
  return { at: o.drafted.map((d) => ids.indexOf(d) + 1), n: ids.length, said: o.said, o, outs };
}
const periodOf = (sim: ClientSim, o: { stage: { slots?: Record<string, unknown> } | null }) => String(o.stage?.slots?.period ?? sim.period);

// ---------------------------------------------------------------------------------------------------------- RC-42: the ordinal reader on the Stage --
describe("SKG1 RC-42: the Stage's ordinal reader names the cases that were meant (the list has 8 cases)", () => {
  it("SKG1-01 'draft the last two' drafts the last two cases (7 and 8), not the last and the second", async () => {
    for (const p of ["draft the last two", "draft last 2", "draft the last 2 cases"]) { const r = await drafted(p); expect(r.at.slice().sort(), p).toEqual([7, 8]); }
  });
  it("SKG1-02 'draft first and third' drafts cases 1 and 3, not the first three", async () => {
    for (const p of ["draft first and third", "draft the first and the third"]) { const r = await drafted(p); expect(r.at.slice().sort(), p).toEqual([1, 3]); }
  });
  it("SKG1-03 'draft the second last' is the one before the last (7), or a question back, never case 2 and the last", async () => {
    for (const p of ["draft the second last", "draft 2nd last"]) { const r = await drafted(p); expect(r.at.includes(2), `${p} -> ${r.at}`).toBe(false); }
  });
  it("SKG1-04 Tamil and Tanglish 'first three' (முதல் மூன்று, mudhal moonu) draft cases 1, 2 and 3, as English 'first three' does", async () => {
    for (const p of ["முதல் மூன்று வரைவு செய்", "முதல் 3 வரைவு செய்", "mudhal moonu draft pannu", "mudhal 3 draft pannu"]) { const r = await drafted(p); expect(r.at.slice().sort(), p).toEqual([1, 2, 3]); }
  });
  it("SKG1-05 Tamil and Tanglish 'last two' (கடைசி இரண்டு, kadaisi rendu) draft cases 7 and 8", async () => {
    for (const p of ["கடைசி இரண்டு வரைவு செய்", "கடைசி 2 வரைவு செய்", "kadaisi rendu draft pannu", "kadaisi 2 draft pannu"]) { const r = await drafted(p); expect(r.at.slice().sort(), p).toEqual([7, 8]); }
  });
  it("SKG1-06 '3 முதல் 5' (from 3 to 5) never drafts case 1 (முதல் read as 'first')", async () => {
    for (const p of ["3 முதல் 5 வரைவு செய்", "draft pannu 3 mudhal 5"]) { const r = await drafted(p); expect(r.at.includes(1), `${p} -> ${r.at}`).toBe(false); }
  });
  it("SKG1-07 a decimal is not two positions: 'draft 3.5' and 'draft 2.5' draft nothing and ask", async () => {
    for (const p of ["draft 3.5", "draft 2.5"]) { const r = await drafted(p); expect(r.at, p).toEqual([]); }
  });
});

// ------------------------------------------------------------------------------------------------------------ RC-13: the number gate --
describe("SKG1 RC-13: a figure spelled out in a model-written line is refused (nothing is allowed, so every figure is a break)", () => {
  const refused = (t: string) => gateChunk(t, allowedSet([])).ok === false;
  const passes = (list: string[]) => list.filter((t) => !refused(t));
  it("SKG1-08 Tamil words for people (இருவர், மூவர், நால்வர், ஐவர், அறுவர், எழுவர்) are counts", () => {
    expect(passes(["இருவர் உயிரிழந்தனர்", "மூவர் உயிரிழந்தனர்", "நால்வர் காயம்", "ஐவர் பாதிப்பு", "அறுவர் மீட்கப்பட்டனர்", "எழுவர் மீட்கப்பட்டனர்"])).toEqual([]);
  });
  it("SKG1-09 Tamil number words with the joining -ப் or glued to a noun (எட்டுப் புகார்கள், ஆறுபேர் காயம், இரு புகார்கள்) are counts", () => {
    expect(passes(["எட்டுப் புகார்கள் உள்ளன", "ஆறுப் புகார்கள்", "ஏழுப் புகார்கள்", "ஆறுபேர் காயம்", "ஏழுபேர் பாதிப்பு", "எட்டுபேர் காயம்", "இரு புகார்கள் தாமதம்", "ஈராயிரம்"])).toEqual([]);
  });
  it("SKG1-10 the Tamil number signs ௰ ௱ ௲ (10, 100, 1000) and the fractions of an hour (ஒன்றரை, அரை, கால்) are figures", () => {
    expect(passes(["௱ புகார்கள்", "௰ புகார்கள்", "௲ புகார்கள்", "ஒன்றரை மணி நேரம்", "அரை மணி நேரம்", "கால் மணி நேரம்", "arai manineram"])).toEqual([]);
  });
  it("SKG1-11 Tanglish numbers in the -thu spelling (irupathu, muppathu, ambathu, arubathu, ezhubathu, enbathu) are figures, as the -dhu spelling is", () => {
    expect(passes(["irupathu pugar", "muppathu pugar", "ambathu pugar", "arubathu pugar", "ezhubathu pugar", "enbathu pugar", "thombadhu pugar"])).toEqual([]);
  });
  it("SKG1-12 Tanglish hundreds and thousands (moonooru, naanooru, ainooru, irandaayiram, moonaayiram) and the spellings randu, anchu, aindhu, moonru, munru are figures", () => {
    expect(passes(["moonooru pugar", "naanooru pugar", "ainooru pugar", "irandaayiram pugar", "moonaayiram pugar", "randu pugar", "anchu pugar", "aindhu pugar", "moonru pugar", "munru pugar"])).toEqual([]);
  });
  it("SKG1-13 English multiples (threefold, tenfold, trebled, quadrupled) are figures, as 'double', 'triple' and 'twice' already are", () => {
    expect(passes(["complaints rose threefold", "a tenfold rise", "cases trebled", "cases quadrupled"])).toEqual([]);
  });
});

// ------------------------------------------------------------------------------------------------------------------------ RC-16: time --
describe("SKG1 RC-16: a time is read as Chennai time on a server in any zone", () => {
  const saved = process.env.TZ;
  const restore = () => { if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved; };
  it("SKG1-14 'remind me tomorrow at 5 pm' (understand.ts parseWhen, run by the server's plan.ts) is 17:00 IST on a UTC server and on a Los Angeles server", () => {
    const now = Date.parse("2026-11-06T06:30:00Z");
    try {
      for (const tz of ["UTC", "America/Los_Angeles"]) {
        process.env.TZ = tz;
        for (const t of ["remind me tomorrow at 5 pm", "நாளை 5 மணிக்கு", "naalaikku 5 pm"]) expect(parseRemind(t, now)?.toISOString(), `${t} in ${tz}`).toBe("2026-11-07T11:30:00.000Z");
      }
    } finally { restore(); }
  });
  it("SKG1-15 through the browser's real path on a UTC server, the reminder card says 5:00 pm for 'tomorrow at 5 pm', not 10:30 pm", async () => {
    try {
      process.env.TZ = "UTC";
      const { outs } = await talk("remind me tomorrow at 5 pm to call the zonal officer");
      expect(outs[0].said).toMatch(/5:00 pm/i);
    } finally { restore(); }
  });
  it("SKG1-16 a source date '02-Oct-2026' is Chennai midnight on every server zone (it is 2 Oct 00:00 UTC on a UTC server)", () => {
    try {
      for (const tz of ["Asia/Kolkata", "UTC", "America/Los_Angeles"]) { process.env.TZ = tz; expect(parseSourceDate("02-Oct-2026", "auto")?.toISOString(), tz).toBe("2026-10-01T18:30:00.000Z"); }
    } finally { restore(); }
  });
  it("SKG1-17 a source date that names IST keeps its clock: '02 Oct 2026 23:30 IST' is 18:00 UTC, and 'Oct 2, 2026 11:30 PM IST' and '2026-10-02T23:30:00 IST' are not unread", () => {
    expect(parseSourceDate("02 Oct 2026 23:30 IST", "auto")?.toISOString()).toBe("2026-10-02T18:00:00.000Z");
    expect(parseSourceDate("Oct 2, 2026 11:30 PM IST", "auto")?.toISOString()).toBe("2026-10-02T18:00:00.000Z");
    expect(parseSourceDate("2026-10-02T23:30:00 IST", "auto")?.toISOString()).toBe("2026-10-02T18:00:00.000Z");
  });
  it("SKG1-18 a day that is not on the calendar is not a date: '31/02/2026', '2026-02-31' and '29/02/2027' are null, not 2 March or 1 March", () => {
    for (const t of ["31/02/2026", "2026-02-31", "29/02/2027", "31 Feb 2026"]) expect(parseSourceDate(t, "auto"), t).toBeNull();
  });
  it("SKG1-19 a date with no year ('12 Oct', 'Oct 12') is not the year 2001", () => {
    for (const t of ["12 Oct", "Oct 12"]) { const d = parseSourceDate(t, "auto"); expect(d == null || d.getUTCFullYear() >= 2025, `${t} -> ${d?.toISOString()}`).toBe(true); }
  });
});

// --------------------------------------------------------------------------------- RC-06 / RC-43: window words in Ask District IQ --
describe("SKG1 RC-06, RC-43: Ask District IQ reads the window that was asked, in three languages, or says it cannot (the default is 90 days)", () => {
  it("SKG1-20 Tamil units with a case ending (கடந்த 10 நாட்களில், கடந்த 24 மணி நேரத்தில்) are read as English 'last 10 days', 'last 24 hours' are", async () => {
    const ten = kpi(await askChat("how many complaints in the last 10 days")), day = kpi(await askChat("how many complaints in the last 24 hours"));
    expect(ten).not.toBe(kpi(await askChat("how many complaints in the last 90 days")));
    expect(kpi(await askChat("கடந்த 10 நாட்களில் எத்தனை புகார்கள்"))).toBe(ten);
    expect(kpi(await askChat("கடந்த 24 மணி நேரத்தில் எத்தனை புகார்கள்"))).toBe(day);
    expect(kpi(await askChat("pona 24 manineram evlo complaints"))).toBe(day);
  });
  it("SKG1-21 Tanglish 'pona 2 vaaram' is two weeks (14 days), not one; 'pona 3 maasam' and 'pona moonu maasam' are three months, not one", async () => {
    const fourteen = kpi(await askChat("how many complaints in the last 14 days")), ninety = kpi(await askChat("how many complaints in the last 90 days"));
    const two = await askChat("pona 2 vaaram evlo complaints");
    expect(kpi(two) === fourteen || /clarify|refusal/.test(two.kind), figure(two)).toBe(true);
    for (const p of ["pona 3 maasam evlo complaints", "pona moonu maasam evlo complaints"]) { const c = await askChat(p); expect(kpi(c) === ninety || /clarify|refusal/.test(c.kind), figure(c)).toBe(true); }
  });
  it("SKG1-22 English number words and short forms ('last ten days', 'last seven days', 'last 7d', 'last 30d', 'last 1 day') are read, not turned into the 90-day default", async () => {
    const out: string[] = [];
    for (const p of ["how many complaints in the last ten days", "how many complaints in the last seven days", "how many complaints in the last 7d", "how many complaints in the last 30d", "how many complaints for the last 1 day"]) {
      const c = await askChat(p); if (/last 90 days/i.test(c.scopeLine ?? c.headline ?? "")) out.push(p);
    }
    expect(out).toEqual([]);
  });
  it("SKG1-23 a number of days that is negative, fractional, or beyond the records ('last -5 days', 'last 3.5 days', 'last 1000 days', 'pona 0 naal', 'கடந்த 0 நாட்களில்') is said so, as 'last 0 days' is", async () => {
    for (const p of ["how many complaints in the last -5 days", "how many complaints in the last 3.5 days", "how many complaints in the last 1000 days", "pona 0 naal evlo complaints", "கடந்த 0 நாட்களில் எத்தனை புகார்கள்", "கடந்த 500 நாட்களில் எத்தனை புகார்கள்"])
      refusesToCount(await askChat(p));
  });
  it("SKG1-24 a window the console does not hold ('since monday', 'this year', 'last year', 'from last monday', 'this fortnight') is not answered as 'last 90 days'", async () => {
    for (const p of ["how many complaints since monday", "how many complaints this year", "how many complaints last year", "how many complaints from last monday", "how many complaints this fortnight"]) {
      const c = await askChat(p); expect(/last 90 days/i.test(`${c.scopeLine ?? ""} ${c.headline ?? ""}`) && c.kind === "answer", `${p}: ${figure(c)}`).toBe(false);
    }
  });
  it("SKG1-25 a date or a range inside a month ('on 15 Oct', 'between 1 Oct and 15 Oct') is not answered with the whole of October (3,249)", async () => {
    const october = kpi(await askChat("how many complaints in october"));
    for (const p of ["how many complaints on 15 Oct", "how many complaints between 1 Oct and 15 Oct"]) { const c = await askChat(p); expect(kpi(c) === october && c.kind === "answer", `${p}: ${figure(c)}`).toBe(false); }
  });
  it("SKG1-26 a month named in Tamil (அக்டோபர் மாதம்) is that month, as 'october' is; a day named in Tamil or Tanglish ('அக்டோபர் 15 அன்று', '15 october anru') is not the 90-day default or the whole month", async () => {
    const october = kpi(await askChat("how many complaints in october"));
    expect(kpi(await askChat("அக்டோபர் மாதம் எத்தனை புகார்கள்"))).toBe(october);
    for (const p of ["அக்டோபர் 15 அன்று எத்தனை புகார்கள்", "15 october anru evlo complaints"]) { const c = await askChat(p); expect(kpi(c) === october || !/last 90 days|கடந்த 90/i.test(`${c.scopeLine ?? ""}`), `${p}: ${figure(c)}`).toBe(true); }
  });
  it("SKG1-27 'innaiku' and 'ippo' in Tanglish are today, as Tamil 'இன்று' is (147 in the last 24 hours), not the 90-day default", async () => {
    const today = kpi(await askChat("இன்று எத்தனை புகார்கள்"));
    expect(kpi(await askChat("innaiku evlo complaints"))).toBe(today);
  });
});

// ------------------------------------------------------------------------------------------------------------------ RC-44: what is not done --
describe("SKG1 RC-44: what Ask District IQ does not do is said, in three languages", () => {
  it("SKG1-28 a forecast in Tamil words (எதிர்காலத்தில், கணிப்பு, முன்கணிப்பு, முன்னறிவிப்பு, அடுத்த காலாண்டு, அடுத்த வருடம்) is not answered with a count of the past", async () => {
    for (const p of ["எதிர்காலத்தில் புகார்கள் எப்படி இருக்கும்", "புகார்கள் முன்கணிப்பு சொல்", "கணிப்பு சொல் புகார்கள்", "புகார் முன்னறிவிப்பு", "அடுத்த காலாண்டு புகார்கள்", "அடுத்த வருடம் புகார்கள் எத்தனை இருக்கும்"]) {
      const c = await askChat(p); expect(c.kind, `${p}: ${figure(c)}`).toBe("refusal");
    }
  });
  it("SKG1-29 an English forecast without 'will be' ('by december how many complaints will there be', 'in the coming days how many complaints', 'upcoming week complaints estimate', 'what is the outlook for complaints') is not answered with a past count", async () => {
    for (const p of ["by december how many complaints will there be", "in the coming days how many complaints", "upcoming week complaints estimate", "what is the outlook for complaints"]) {
      const c = await askChat(p); expect(c.kind, `${p}: ${figure(c)}`).toBe("refusal");
    }
  });
  it("SKG1-30 an order Ask never carries out ('close all overdue cases', 'reopen yesterday's complaints', 'export all complaints to excel', the same in Tanglish and Tamil) is said not to be done, not answered with a list of incidents", async () => {
    for (const p of ["close all overdue cases", "reopen yesterday's complaints", "export all complaints to excel", "ellam complaints-um excel-la export pannu", "எல்லா புகார்களையும் எக்செல்லில் ஏற்றுமதி செய்"]) {
      const c = await askChat(p); expect(c.kind, `${p}: ${figure(c)}`).toMatch(/refusal|clarify/);
    }
  });
});

// ------------------------------------------------------------------------------ RC-06 / RC-05 / RC-43 / RC-15: Jarvis on the real path --
describe("SKG1 Jarvis (client-sim): the window, the zone and the language of the line", () => {
  it("SKG1-31 Tamil 'கடந்த 2 வாரங்களில்' and Tanglish 'pona 2 vaaram', 'pona rendu vaaram' are not set to the last 7 days", async () => {
    for (const p of ["கடந்த 2 வாரங்களில் புகார்களைக் காட்டு", "கடந்த இரண்டு வாரம் புகார்களைக் காட்டு", "pona 2 vaaram complaints kaattu", "pona rendu vaaram complaints kaattu"]) {
      const { sim, outs } = await talk(p); expect(periodOf(sim, outs[0]), p).not.toBe("weekly");
    }
  });
  it("SKG1-32 Tamil 'கடந்த 3 மாதங்களில்' and Tanglish 'pona 3 maasam', 'pona moonu maasam' are the last 90 days, as English 'last 3 months' is, not 30", async () => {
    for (const p of ["கடந்த 3 மாதங்களில் புகார்களைக் காட்டு", "pona 3 maasam complaints kaattu", "pona moonu maasam complaints kaattu"]) {
      const { sim, outs } = await talk(p); expect(periodOf(sim, outs[0]), p).not.toBe("monthly");
    }
  });
  const ROYAPURAM = /Royapuram|ராயபுரம்|zone":5|zones":\[5\]|Zone 5|மண்டலம் 5/;
  it.fails("SKG1-33 a zone said as a Tanglish number ('zone anju', 'zone aindhu') or in digits of another script ('zone ٥', 'zone ５') is that zone, not the district brief", async () => {
    for (const p of ["zone anju brief sollu", "zone aindhu brief sollu", "zone ٥ brief", "zone ５ brief"]) {
      const { outs } = await talk(p); expect(JSON.stringify([outs[0].steps, outs[0].stage?.slots, outs[0].said]), p).toMatch(ROYAPURAM);
    }
  });
  it.fails("SKG1-34 a zone that does not exist ('zone 99 brief', 'zone 0 brief', 'zone fifty brief') is named as not there, not answered with the district brief", async () => {
    for (const p of ["zone 99 brief", "zone 0 brief", "zone fifty brief"]) {
      const { outs } = await talk(p); expect(outs[0].said, p).toMatch(/\b(99|0|50|fifty)\b[^.]*\b(not|no|only|1 to 15)\b|\b(not|no)\b[^.]*\b(99|0|50|fifty)\b|1 to 15/i);
    }
  });
  it.fails("SKG1-35 two zones named ('zone 5 and 6 brief', 'zone five and six brief', 'zones 5 to 7 brief') are not answered for the first zone alone without a word about the others", async () => {
    for (const p of ["zone 5 and 6 brief", "zone five and six brief", "zones 5 to 7 brief"]) {
      const { outs } = await talk(p); expect(outs[0].said, p).toMatch(/zone 6|zone 7|zones 5|Thiru|Ambattur|one zone|only one|one at a time|both|ஒரு மண்டல/i);
    }
  });
  it.fails("SKG1-36 a zone brief in Tamil names the body in Tamil: no Latin body name ('PWD Water Resources', 'Greater Chennai Police') in a Tamil brief point", async () => {
    for (const p of ["ராயபுரம் மண்டலத்தின் சுருக்கம் சொல்", "தண்டையார்பேட்டை பற்றிய சுருக்கம் கொடு"]) {
      const { outs } = await talk(p); const all = [outs[0].said, ...outs[0].items].join(" ");
      expect(all, p).not.toMatch(/PWD Water Resources|Greater Chennai Police|Street Lighting|Storm Water Drain/);
    }
  });
  it.fails("SKG1-37 a rain line in Tamil has no English month, clock or unit ('6 Nov, 8:30 AM', 'mm'), and a taluk line has no Latin name", async () => {
    const r = await talk("மழை நிலை என்ன"); expect(r.outs[0].said).not.toMatch(/\bNov\b|\bAM\b|\bPM\b|\bmm\b/);
    const t = await talk("கொளத்தூர் நிலை என்ன"); expect(t.outs[0].said).not.toMatch(/[A-Za-z]{4,}/);
  });
});
