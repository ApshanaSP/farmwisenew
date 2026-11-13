/**
 * Reviewer probes, QA pass 7 (askiq-writer-lock), mechanism 1, secondary: honest drafts a real card produces that the writer check refuses
 * (then the code's own wording stands; not a leak, a cost). Each `it` asserts the draft passes, so a failure is a wrongly refused honest draft.
 * After the fixes (askiq-writer-lock): the cases still refused are known costs of "figures only from typed values" and are `it.fails`
 * (a figure the code writes but the card does not type: the share card's severe/overdue, a list's total; a cardinal road name), so the
 * suite says so if one starts passing. The count fixture carries the period fastpath.ts sets (activeFilters.period), as cards.ts does.
 */
import { describe, expect, it } from "vitest";
import { checkPolish } from "@/lib/assistant/polish";
import type { AnswerCard } from "@/lib/assistant/answer";
import { detailCard, inc, priorityCard, shareCard } from "./cards";

const passes = (card: AnswerCard, d: { headline: string; answerMarkdown: string; voiceSummary: string }, q: string) => {
  const r = checkPolish(d, q, card);
  expect.soft(r, `${d.answerMarkdown} => ${"rejected" in r ? r.rejected : "ok"}`).toHaveProperty("text");
};
const count = { headline: "41 open garbage incidents still open · last 7 days", answerMarkdown: "**41** garbage incidents reported in the last 7 days in Adyar zone are still open, 4 of them severe.",
  scopeLine: "Last 7 days · Adyar zone", caveats: [], responseType: "kpi", datasets: [],
  kpis: [{ label: "Open", value: 41, prev: 38, tone: "info" }, { label: "Severe", value: 4, tone: "sev" }, { label: "Still open", value: 41 }],
  context: { activeFilters: { openOnly: true, period: "weekly" } } } as unknown as AnswerCard;
const Q = "how many garbage cases are open in Adyar";

describe("honest drafts wrongly refused", () => {
  it.fails("the share card's own bullet: '6 severe, 9 open past their deadline' (fastpath.ts writes them, kpis do not carry them)", () =>
    passes(shareCard, { headline: "23.4% of garbage cases are resolved", answerMarkdown: "23.4% of the 51 garbage cases are resolved (12); 39 are still open, 6 severe and 9 past their deadline.",
      voiceSummary: "23.4% of garbage cases are resolved." }, "what share of garbage complaints is resolved"));
  it("Tamil: 'கூவம் ஆறு' (the Cooum river) read as 6; 'நாற்பத்தி ஒன்று' (41) read as 40 and 1", () => {
    passes(count, { headline: "அடையாறில் 41 குப்பை வழக்குகள் நிலுவையில் உள்ளன", answerMarkdown: "அடையாறில் 41 குப்பை வழக்குகள் நிலுவையில் உள்ளன; ஒரு குவியல் கூவம் ஆறு அருகே உள்ளது.",
      voiceSummary: "அடையாறில் 41 குப்பை வழக்குகள் நிலுவையில் உள்ளன." }, Q);
    passes(count, { headline: "அடையாறில் 41 குப்பை வழக்குகள் நிலுவையில் உள்ளன", answerMarkdown: "அடையாறில் நாற்பத்தி ஒன்று குப்பை வழக்குகள் நிலுவையில் உள்ளன.",
      voiceSummary: "அடையாறில் 41 குப்பை வழக்குகள் நிலுவையில் உள்ளன." }, Q);
  });
  it("'half a dozen' is read as 12 (it is 6)", () => {
    const six = { ...count, kpis: [...(count.kpis ?? []), { label: "Past deadline", value: 6 }] } as unknown as AnswerCard;
    passes(six, { headline: "41 garbage cases are open in Adyar", answerMarkdown: "41 garbage cases are open in Adyar; half a dozen are past their deadline.", voiceSummary: "41 garbage cases are open in Adyar." }, Q);
  });
  it("a time written without a colon ('at 9 am'), a '7-day' window", () => {
    passes(detailCard("Garbage pile at the market gate"), { headline: "Garbage pile at the market gate", answerMarkdown: "It was first reported at 9 am on 10 Nov and is past its 12 Nov deadline.",
      voiceSummary: "A garbage pile at the market gate is past its deadline." }, "tell me about it");
    passes(count, { headline: "41 garbage cases are open in Adyar", answerMarkdown: "In the 7-day window, 41 garbage cases in Adyar are still open.", voiceSummary: "41 garbage cases are open in Adyar." }, Q);
  });
  const items = [inc("Garbage heap on the service lane", { location: "100 Feet Road, Vadapalani" }), inc("Bin overflow near Adyar's bus stop 12")];
  const twoCard = { ...priorityCard, incidents: items, context: { activeFilters: {}, resultIds: items.map((x) => x.incidentId), n: 2 } } as unknown as AnswerCard;
  it.fails("a numbered road the list names ('100 Feet Road') said unquoted", () => {
    passes(twoCard, { headline: "The two highest-priority garbage incidents", answerMarkdown: "The two highest-priority garbage incidents: a heap on 100 Feet Road, Vadapalani.",
      voiceSummary: "The two highest-priority garbage incidents." }, "top garbage issues");
  });
  it("a word-for-word quote of a title with an apostrophe", () => {
    passes(twoCard, { headline: "The two highest-priority garbage incidents", answerMarkdown: "The two highest-priority garbage incidents: a heap on a service lane, and \"Bin overflow near Adyar's bus stop 12\".",
      voiceSummary: "The two highest-priority garbage incidents." }, "top garbage issues");
  });
  it.fails("a list's total, which the code's own answer states ('41 open garbage incidents ...; the eight newest are listed'), is not typed (known cost)", () => {
    const items = Array.from({ length: 8 }, (_, k) => inc(`Garbage heap ${k}`));
    const card = { headline: "Open garbage incidents · last 7 days", answerMarkdown: "41 open garbage incidents in the last 7 days in Adyar zone; the eight newest are listed.", scopeLine: "", caveats: [], kpis: [], datasets: [],
      incidents: items, context: { activeFilters: { openOnly: true }, resultIds: items.map((x) => x.incidentId), n: 8 } } as unknown as AnswerCard;
    passes(card, { headline: "41 open garbage incidents in Adyar", answerMarkdown: "41 garbage incidents in Adyar zone are open; the eight newest are listed below.", voiceSummary: "41 open garbage incidents in Adyar." },
      "open garbage incidents in Adyar");
  });
});
