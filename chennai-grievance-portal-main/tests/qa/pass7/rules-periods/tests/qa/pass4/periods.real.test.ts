// QA pass 7 (rules-periods): every period meaning, in both rules lanes, down the real path on the pinned snapshot (no model key, frozen clock).
// Jarvis: ClientSim (planRound with serverHands, as the browser drives it). Ask District IQ: ask() from the pipeline. One question, one span, one number.
//   QA_PIN_PORT=3196 timeout 600 npx vitest run --config vitest.qa4.config.ts --dir tests/qa/pass7/rules-periods periods.real
// Under any other config (the pass 7 unit config has no pinned API) the whole file is skipped.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { asOf } from "@/lib/collector/intel";
import { ask } from "@/lib/assistant/pipeline";
import { clearCaches } from "@/lib/thunai/round";
import { browserWorld, ClientSim, type Outcome } from "../../../../../pass4/grader/client-sim";

const PINNED = process.env.QA_GROQ_ONLY === "1" && process.env.AWS_STORE_DRY_RUN === "1" && /^http:\/\/127\.0\.0\.1:/.test(process.env.AWS_API_URL ?? "");
const FROZEN = "2026-11-06T06:30:00.000Z"; // the store's as-of is 6 Nov 2026, 6:08 PM IST
const USER = "qa.p7.periods@example.test";
type Card = Awaited<ReturnType<typeof ask>>["card"];
const askChat = async (message: string, period = "weekly"): Promise<Card> => (await ask({ user: USER, sessionId: null, message, inputMode: "text", language: "auto",
  scope: { period, zone: null, dept: null, cat: null, taluk: null } as never, replyTo: null, pinId: null, insightKey: null, lockDept: null, stage: () => undefined } as never)).card;
const kpi = (c: Card, label: RegExp) => (c.kpis ?? []).find((k: { label: string }) => label.test(k.label))?.value as number | undefined;
const caseTotal = (o: Outcome) => { const b = o.stage?.blocks.find((x) => x.kind === "CaseList"); return b && b.kind === "CaseList" ? b.total : undefined; };
const tile = (o: Outcome, key: string) => { const b = o.stage?.blocks.find((x) => x.kind === "Kpis"); return b && b.kind === "Kpis" ? b.items.find((i) => i.key === key)?.value : undefined; };

describe.skipIf(!PINNED)("one period, one meaning, in both rules lanes", () => {
  let world: Awaited<ReturnType<typeof browserWorld>>;
  const jarvis = async (q: string) => { vi.setSystemTime(new Date(FROZEN)); clearCaches(); return new ClientSim(world.world, {}, world.list).handle(q); };
  const ai = async (q: string) => { vi.setSystemTime(new Date(FROZEN)); clearCaches(); return askChat(q); };
  beforeAll(async () => { vi.useFakeTimers({ toFake: ["Date"], now: new Date(FROZEN) }); clearCaches(); await asOf(); world = await browserWorld(); }, 300_000);

  it("P6-022: 'today' is the calendar day since midnight in both lanes, with the same count, and a count is never widened to the week", async () => {
    const a = await ai("How many incidents were reported today?");
    expect(a.scopeLine).toMatch(/^Today \(6 Nov, since midnight\)/);
    const day = kpi(a, /^Reported$/);
    const rolling = kpi(await ai("How many incidents were reported in the last 24 hours?"), /^Reported$/);
    expect(day).toBeGreaterThan(0);
    expect(day).toBeLessThan(rolling!); // since midnight is part of the last 24 hours, not all of it
    const j = await jarvis("How many new complaints came in today?");
    expect(j.lane).toBe("quick");
    expect(j.stage?.title).toMatch(/today \(6 Nov, since midnight\)/);
    expect(j.said).not.toMatch(/this week|last 7 days|None today/);
    expect(caseTotal(j)).toBe(day);
  }, 120_000);

  it("P6-023: 'right now' is what is open now, whatever day it was reported (no reporting window), the same number in both lanes", async () => {
    const a = await ai("How many severe incidents are open right now?");
    expect(a.scopeLine).toMatch(/^Open now/);
    expect(a.headline).toMatch(/open now/);
    expect(a.headline).not.toMatch(/24 hours/);
    const now = Number(String(a.headline).match(/^([\d,]+)/)?.[1].replace(/,/g, ""));
    const lastDay = kpi(await ai("How many severe incidents were reported in the last 24 hours?"), /^Reported$/)!;
    expect(now).toBeGreaterThan(lastDay);
    const j = await jarvis("show the severe cases right now");
    expect(j.stage?.title).toMatch(/open now/);
    expect(caseTotal(j)).toBe(now);
    const ta = await ai("இப்போது எத்தனை கடுமையான சம்பவங்கள் திறந்துள்ளன");
    const tg = await ai("ippo evlo severe incidents open-la irukku");
    for (const c of [ta, tg]) expect(c.scopeLine, c.headline).toMatch(/^Open now/);
    expect(String(tg.headline)).toMatch(new RegExp(`^${now.toLocaleString("en-IN")}\\b`));
  }, 120_000);

  it("pass4-open-16: 'last month' is the calendar month before this one (October), in both lanes and three languages", async () => {
    const a = await ai("how many incidents in Tondiarpet zone last month");
    expect(a.scopeLine).toMatch(/^Last month \(October\)/);
    const oct = kpi(a, /^Reported$/);
    const b = await jarvis("Tondiarpet report, last month");
    expect(b.stage?.recipe).toBe("brief");
    expect(b.stage?.title).toMatch(/last month \(October\)/);
    expect(tile(b, "reported")).toBe(oct);
    const totals: (number | undefined)[] = [];
    for (const q of ["show severe cases last month", "போன மாசம் கடுமையான புகார்கள் காட்டு", "kadantha maasam severe cases kaattu"]) {
      const o = await jarvis(q);
      expect(o.stage?.title, q).toMatch(/October|அக்டோபர்/);
      totals.push(caseTotal(o));
    }
    expect(new Set(totals).size, JSON.stringify(totals)).toBe(1);
    expect(totals[0]).toBe(kpi(await ai("how many severe incidents last month"), /^Reported$/));
  }, 180_000);

  it("pass4-open-17: 'up or down from last month' compares the last 30 days with the 30 before, the same figures in both lanes and languages", async () => {
    const j = await jarvis("garbage complaints, up or down compared with last month?");
    expect(j.stage?.recipe).toBe("trend");
    const cur = tile(j, "cur"), prev = tile(j, "prev");
    expect(cur).toBeGreaterThan(0);
    expect(j.said).toMatch(cur! > prev! ? /\bup\b/ : cur! < prev! ? /\bdown\b/ : /\blevel\b/);
    const a = await ai("garbage incidents, up or down compared with last month?");
    expect(a.scopeLine).toMatch(/^Last 30 days/);
    expect(kpi(a, /^Reported$/)).toBe(cur);
    expect(String(a.answerMarkdown)).toContain(`from ${prev!.toLocaleString("en-IN")} in the period before`);
    for (const q of ["kuppai complaints pona maasatha vida kooduchaa korainjaa", "குப்பை புகார்கள் கடந்த மாதத்தை விட கூடியதா குறைந்ததா"]) {
      const o = await jarvis(q);
      expect([tile(o, "cur"), tile(o, "prev")], q).toEqual([cur, prev]);
    }
  }, 180_000);

  it("pass4-open-14: last week's overdue complaints is the calendar week with the overdue filter, the same in three languages", async () => {
    const got: (number | undefined)[] = [];
    for (const q of ["show overdue cases last week", "கடந்த வாரம் காலக்கெடு தாண்டிய புகார்கள்", "pona vaaram deadline thaandiya cases kaattu"]) {
      const o = await jarvis(q);
      expect(o.lane, q).toBe("quick");
      expect(o.stage?.title, q).toMatch(/26 Oct to 1 Nov|26 அக்டோபர் முதல் 1 நவம்பர்/);
      got.push(caseTotal(o));
    }
    expect(new Set(got).size, JSON.stringify(got)).toBe(1);
    const all = await jarvis("show cases last week");
    expect(caseTotal(all)).toBeGreaterThan(got[0]!);
  }, 180_000);

  it("p7-merge-04: a day and a range of days are read by both lanes over those calendar days, with the same count (Jarvis once had no reading of them)", async () => {
    for (const [ask, show, label] of [["how many incidents on 15 Oct", "show the cases on 15 Oct", "15 Oct"], ["how many incidents between 1 Oct and 15 Oct", "show the cases between 1 Oct and 15 Oct", "1 Oct to 15 Oct"],
      ["அக்டோபர் 15 அன்று எத்தனை சம்பவங்கள்", "show the cases on Oct 15", "15 Oct"]] as const) {
      const a = await ai(ask);
      expect(a.scopeLine, ask).toMatch(new RegExp(`^${label}`));
      const j = await jarvis(show);
      expect(j.lane, show).toBe("quick");
      expect(j.stage?.title, show).toContain(label);
      expect(caseTotal(j), show).toBe(kpi(a, /^Reported$/));
    }
  }, 180_000);

  it("'this week' and 'last 30 days' stay the console's windows, as said", async () => {
    expect((await ai("how many severe incidents this week")).scopeLine).toMatch(/^Last 7 days/);
    expect((await ai("how many severe incidents in the last 30 days")).scopeLine).toMatch(/^Last 30 days/);
    const j = await jarvis("severe cases this week");
    expect(j.stage?.scope.period).toBe("weekly");
    expect((j.stage?.slots as { span?: unknown }).span).toBeUndefined();
  }, 120_000);
});
