// QA pass 4, fixer 1. RC-11: a sentence with two intents reaches the tool of the subject asked about, whatever the order of the keyword routes.
// Real rules lane on the pinned snapshot, no model key in the process.
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/e-routes.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { asOf } from "@/lib/collector/intel";
import { ask } from "@/lib/assistant/pipeline";
import { clearCaches } from "@/lib/thunai/round";

const USER = "qa.e.routes@example.test";
const askChat = (message: string) => ask({ user: USER, sessionId: null, message, inputMode: "text", language: "auto", scope: { period: "weekly", zone: null, dept: null, cat: null, taluk: null }, replyTo: null, pinId: null, insightKey: null, lockDept: null, signal: new AbortController().signal, stage: () => undefined } as never) as Promise<{ kind: string; card: { headline: string; answerMarkdown: string; datasets?: { id: string }[]; intent?: string } }>;
beforeAll(async () => { vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-06T06:30:00.000Z") }); clearCaches(); await asOf(); });
afterAll(() => { vi.useRealTimers(); });

const feeds = (a: Awaited<ReturnType<typeof askChat>>) => a.card?.datasets?.[0]?.id;
// a question about the data itself reaches the feeds, in English, Tamil and Tanglish, whatever subject word is in it (PB-014, PB-171)
describe("RC-11: a question about the data goes to the feeds, not to the subject's figures", () => {
  it.each(["Are all the data feeds live?", "How many feeds are live?", "Which data sources are healthy?", "தரவு ஊட்டங்கள் நேரலையில் உள்ளனவா?", "data feeds ellam live-a irukka?"])("%s", async (q) => {
    expect(feeds(await askChat(q))).toBe("feeds");
  });
  it.each(["Is the hospital data real?", "hospital data fake-a?", "காவல் துறை தரவு உண்மையானதா அல்லது சோதனை தரவா?"])("%s: not bed occupancy, not the top incidents", async (q) => {
    const a = await askChat(q);
    // review point 3: the old checks only said what the answer was not, and let "Hospital reports: 1,620 (rows after cleaning)" through.
    // A positive check: the feeds card, or the help text on the data sources; never an upload's row count.
    expect(feeds(a) === "feeds" || /^Data sources|^தரவு/.test(String(a.card.headline)), String(a.card.headline)).toBe(true);
    expect(String(a.card.headline)).not.toMatch(/rows after cleaning/);
    expect(String(a.card.answerMarkdown)).not.toMatch(/bed occupancy|சம்பவங்கள் \(மொத்தம்/);
    expect(a.card.headline).not.toMatch(/severe events|முக்கியமான/);
  });
});
// a sentence with a department word AND a measure word reaches the measure (PB-145)
describe("RC-11: 'past deadline by department' is the past-deadline count of each department", () => {
  it.each(["past deadline by department this week", "overdue cases department-wise this week", "இந்த வாரம் துறை வாரியாக கெடு தாண்டிய புகார்கள்", "indha week department wise deadline thaandiya cases"])("%s", async (q) => {
    const a = await askChat(q);
    expect(a.card.headline).not.toMatch(/^No incidents|^0 matching/);
    expect(a.card.datasets?.[0]?.id).toBe("followups");
  });
});
