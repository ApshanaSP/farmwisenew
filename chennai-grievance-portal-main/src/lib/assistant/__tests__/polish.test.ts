import { describe, expect, it } from "vitest";
import type { AnswerCard } from "@/lib/assistant/answer";
import { checkPolish, polishPrompt, recordsOf } from "@/lib/assistant/polish";
import { withoutEchoedNumbers } from "@/lib/assistant/verify";

const card = {
  headline: "79 road accidents · last 7 days",
  answerMarkdown: "79 road accidents were reported in the last 7 days (81 in the period before): 6 severe, 75 still open, 7 deaths.",
  scopeLine: "Last 7 days · District-wide · all departments", caveats: [], kpis: [], datasets: [],
  incidents: [{ incidentId: "INC-1", title: "Heavy vehicle crash reported in Jafferkhanpet", summary: "", aiWritten: false, category: "Road accident",
    location: "Jafferkhanpet", ward: 140, zone: "Adyar", taluk: null, occurredAt: null, severity: "Severe", priorityScore: 92, priorityReasons: ["1 death"],
    status: "In progress", department: "Greater Chennai Police", sourceCount: 2, newsOutletCount: 1, citizenComplaintCount: 0 }]
} as unknown as AnswerCard;
const q = "how many road accidents this week";

describe("the AI writes the store's answer", () => {
  it("accepts a draft that uses only the numbers already there", () => {
    const ok = checkPolish({ headline: "79 road accidents this week, 7 deaths", answerMarkdown: "There were **79** road accidents in the last 7 days, down from 81; 7 people died and 75 are still open. The most serious is the heavy vehicle crash in Jafferkhanpet (Adyar).",
      voiceSummary: "79 road accidents this week." }, q, card);
    expect("checked" in ok && ok.checked).toBeGreaterThan(4);
  });

  it("rejects a draft with a number of its own (a computed change)", () => {
    expect(checkPolish({ headline: "79 road accidents, down 2.5%", answerMarkdown: "Accidents fell 2.5% to 79.", voiceSummary: "79." }, q, card)).toHaveProperty("rejected");
    expect(checkPolish({ headline: "80 road accidents", answerMarkdown: "80 accidents.", voiceSummary: "80." }, q, card)).toHaveProperty("rejected");
  });

  it("rejects an empty or self-correcting draft", () => {
    expect(checkPolish({ headline: "", answerMarkdown: "79 accidents.", voiceSummary: "" }, q, card)).toHaveProperty("rejected");
    expect(checkPolish({ headline: "79 accidents", answerMarkdown: "81 accidents, sorry, 79 accidents.", voiceSummary: "" }, q, card)).toHaveProperty("rejected");
  });

  it("shows the model the records, marked as untrusted material", () => {
    expect(recordsOf(card)[0]).toContain("Heavy vehicle crash reported in Jafferkhanpet | Jafferkhanpet, Adyar | Severe");
    expect(polishPrompt(q, card)).toMatch(/RECORDS:\n<untrusted_data>/);
  });

  it("says why a draft was rejected", () => {
    expect(checkPolish({ headline: "80 road accidents", answerMarkdown: "80 accidents.", voiceSummary: "" }, q, card)).toEqual({ rejected: "numbers not in the answer: 80" });
  });

  it("gives one incident line by line, so a long summary cannot cut off its date", () => {
    const one = { ...card, incidents: [], incident: { ...card.incidents![0], summary: "x".repeat(400), whatHappened: "y".repeat(400), occurredAt: "11 Oct 2026, 11:15 AM",
      ward: 103, zone: "Anna Nagar", taluk: "Purasawalkam", facts: ["1 dead"], attention: [], timeline: [], deadline: null, deadlineMissed: false, closedAt: null,
      officials: [], focus: "where" } } as unknown as AnswerCard;
    const recs = recordsOf(one);
    expect(recs).toContain("Reported: 11 Oct 2026, 11:15 AM");
    expect(recs).toContain("Place: Jafferkhanpet, Ward 103, Anna Nagar zone, Purasawalkam taluk");
  });

  it("writes a news answer from what the articles say, and may quote their figures", () => {
    const news = { ...card, incidents: [], responseType: "news_detail", headline: "Protest against SIR in Chennai", answerMarkdown: "'ஜந்தர் மந்தர் 2.0'...",
      stories: [{ storyId: "STY-1", headline: "Protest against SIR in Chennai", location: "Egmore", sourceCount: 5, summary: "'ஜந்தர் மந்தர் 2.0'..." }] } as unknown as AnswerCard;
    const articles = [["Chennai protesters detained (The Hindu, 2026-10-22 23:32): Police detained 40 protesters four hours into a 24-hour sit-in demanding the CEC's resignation over SIR."]];
    expect(polishPrompt("what is the protest about", news, articles)).toMatch(/ARTICLES:\n<untrusted_data>\nStory 1:\n- Chennai protesters detained/);
    const ok = checkPolish({ headline: "Students detained over SIR protest", answerMarkdown: "Police detained 40 protesters four hours into a 24-hour sit-in demanding the CEC's resignation over SIR.",
      voiceSummary: "Police detained 40 protesters." }, "what is the protest about", news, articles);
    expect("text" in ok).toBe(true);
    // a figure no article states is still refused
    expect(checkPolish({ headline: "300 detained", answerMarkdown: "Police detained 300 protesters.", voiceSummary: "" }, "what is the protest about", news, articles)).toHaveProperty("rejected");
  });

  it("drops a count echoed as a bare digit (\"One person was injured 1 and ...\")", () => {
    expect(withoutEchoedNumbers("One person was reported injured 1 and the case is open.")).toBe("One person was reported injured and the case is open.");
    expect(withoutEchoedNumbers("Two wards had 3 and more.")).toBe("Two wards had 3 and more.");
  });
});
