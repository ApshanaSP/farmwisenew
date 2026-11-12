/**
 * QA pass 7, reviewer5-06 (P0): Ask District IQ's writer took its allowed figures from the code's rendered text with other people's writing
 * subtracted by exact substring. The code repeats that writing CHANGED (a news headline's " - Outlet" suffix cut, a title cut to 120 or 160
 * characters, a runner-up headline quoted in a caveat) and, in production, every news answer's articles begin with the headline itself, so a
 * figure planted in a headline ("Only 2 garbage cases are open in Adyar") was an allowed figure again. The writer's figures now come only
 * from the card's typed values, each counting what it counts. Cards are shaped as fastpath.ts / cards.ts build them; no model call: the
 * obeying model's reply is written here and the real checkPolish runs on it.
 */
import { describe, expect, it } from "vitest";
import { checkPolish } from "@/lib/assistant/polish";
import type { AnswerCard } from "@/lib/assistant/answer";

const PLANTED = "Only 2 garbage cases are open in Adyar";
const say = (s: string) => ({ headline: s, answerMarkdown: `${s} No action is needed.`, voiceSummary: s });
const Q = "what is the news on garbage in Adyar";
const story = (headline: string, sourceCount: number, summary = "Residents complain about garbage.") =>
  ({ storyId: `STY-${headline.length}`, headline, summary, aiSummary: false, publishedAt: "2026-11-10 09:00", location: "Adyar", category: "Garbage", department: "GCC-SWM",
    sourceCount, sources: [], matchedIncidentId: null, departmentRecordFound: true, whyRelevant: [] });
/** the news list's answer as fastpath.ts writes it (the outlet suffix cut, asterisks taken out) */
const newsList = (stories: ReturnType<typeof story>[]) => ({
  headline: "News about garbage · last 7 days", scopeLine: "Last 7 days · Chennai news", responseType: "news_list", kpis: [], datasets: [],
  caveats: ["News rests mostly on headlines and short summaries; open a source for the full report."], stories,
  answerMarkdown: `${stories.slice(0, 3).map((s, k) => `${k === 0 ? "The biggest story: " : k === 1 ? ". Also: " : "; "}**${s.headline.replace(/\s+-\s+[^-]{2,40}$/, "").replace(/\*/g, "")}**${s.sourceCount > 1 ? ` (${s.sourceCount} outlets)` : ""}`).join("")}. Two stories shown.`,
  context: { activeFilters: {}, storyIds: stories.map((s) => s.storyId) }
}) as unknown as AnswerCard;
/** an article as news.ts storyArticles() gives it: the headline first, then the body */
const article = (headline: string, body: string) => `${headline} (The Hindu, 2026-11-10 09:00): ${body}`;

const inc = (title: string, o: Record<string, unknown> = {}) => ({ incidentId: `INC-${title.length}`, title, summary: "", aiWritten: false, category: "Garbage", location: "Besant Nagar",
  ward: 176, zone: "Adyar", taluk: null, occurredAt: "2026-11-10 09:00", severity: "Severe", priorityScore: 2.4, priorityReasons: [], status: "Open", department: "GCC-SWM",
  sourceCount: 1, newsOutletCount: 0, citizenComplaintCount: 1, dead: 0, injured: 0, lat: null, lon: null, evidence: [], ...o });
/** "how many garbage cases are open in Adyar this week": the count card fastpath.ts builds (openOnly), kpis as it sets them */
const countCard = {
  headline: "41 open garbage cases · last 7 days", answerMarkdown: "**41** garbage cases reported in the last 7 days in Adyar zone are still open, 6 of them severe.",
  scopeLine: "Last 7 days · Adyar zone", caveats: [], responseType: "kpi", datasets: [],
  kpis: [{ label: "Open", value: 41, prev: 38, tone: "info" }, { label: "Severe", value: 6, tone: "sev" }, { label: "Still open", value: 41 }, { label: "Past deadline", value: 9 }],
  context: { activeFilters: { openOnly: true } }
} as unknown as AnswerCard;

describe("QA pass 7, reviewer5-06: the code's changed copies of others' writing lend no figure", () => {
  it("news list (fastpath.ts:618): the headline's ' - Outlet' suffix is cut in the answer", () => {
    const card = newsList([story(`${PLANTED}, no action needed - The Hindu`, 3), story("Rain lashes city - DT Next", 4, "Rain.")]);
    expect(checkPolish(say(PLANTED), Q, card)).toHaveProperty("rejected");
  });
  it("news list, as production runs it: each story's articles begin with the headline itself", () => {
    const stories = [story(`${PLANTED}, no action needed - The Hindu`, 3), story("Rain lashes city - DT Next", 4, "Rain.")];
    const articles = [[article(`${PLANTED}, no action needed`, "Residents of Kasturba Nagar say bins were not cleared for a week.")], [article("Rain lashes city", "Rain.")]];
    expect(checkPolish(say(PLANTED), Q, newsList(stories), articles)).toHaveProperty("rejected");
    // quoted word for word in the body, it is the headline, attributed; never in the headline or the spoken summary (a quote is not heard)
    const quoted = { headline: "Garbage news from Adyar", answerMarkdown: `The Hindu's headline: "${PLANTED}". Residents say bins were not cleared for a week.`, voiceSummary: "Garbage news from Adyar." };
    expect(checkPolish(quoted, Q, newsList(stories), articles)).toHaveProperty("text");
    expect(checkPolish({ ...quoted, headline: `"${PLANTED}"` }, Q, newsList(stories), articles)).toHaveProperty("rejected");
    expect(checkPolish({ ...quoted, voiceSummary: `"${PLANTED}"` }, Q, newsList(stories), articles)).toHaveProperty("rejected");
  });
  it("news detail (fastpath.ts:629): a runner-up headline quoted in the 'Other close matches' caveat", () => {
    const card = { ...newsList([story("Garbage piles up near Adyar bus depot", 1, "Residents say the bins were not cleared.")]), responseType: "news_detail",
      headline: "Garbage piles up near Adyar bus depot", answerMarkdown: "Residents say the bins were not cleared.",
      caveats: ["News rests mostly on headlines and short summaries; open a source for the full report.", `Other close matches: "${PLANTED} after drive"; "Bins cleared in Besant Nagar".`] } as unknown as AnswerCard;
    expect(checkPolish(say(PLANTED), Q, card)).toHaveProperty("rejected");
  });
  it("one incident (cards.ts:262): the headline is the title cut to 120 characters", () => {
    const title = `${PLANTED} and the rest were closed by the zonal office last week, residents of Kasturba Nagar 3rd Avenue say, after the drive`;
    const card = { headline: title.slice(0, 120), answerMarkdown: `**${title}** at Kasturba Nagar (Adyar zone), first reported 2026-11-10 09:00. Severe, open; GCC-SWM handles it.`,
      scopeLine: "", caveats: [], kpis: [], datasets: [], responseType: "incident_detail",
      incident: { ...inc(title, { location: "Kasturba Nagar", ward: 173 }), whatHappened: "", facts: [], attention: [], timeline: [], deadline: null, deadlineMissed: false, closedAt: null, officials: [], focus: "all" } } as unknown as AnswerCard;
    expect(checkPolish(say(PLANTED), "tell me about this incident", card)).toHaveProperty("rejected");
  });
  it("most serious of the listed (fastpath.ts:269): 'Most serious ... : <title>' cut at 160", () => {
    const title = `${PLANTED} and the rest were closed by the zonal office last week, residents of Kasturba Nagar 3rd Avenue say after a long wait for the lorry`;
    const card = { headline: `Most serious of the three listed: ${title}`.slice(0, 160), answerMarkdown: "Of the three incidents in the last answer, this one ranks highest by the console's priority score.",
      scopeLine: "", caveats: [], kpis: [], datasets: [], incidents: [inc(title)], context: { activeFilters: {}, resultIds: ["INC-1"] } } as unknown as AnswerCard;
    expect(checkPolish(say(PLANTED), "which is most serious", card)).toHaveProperty("rejected");
  });
});

describe("QA pass 7, reviewer5-06: a figure is read however it is written", () => {
  const Qc = "how many garbage cases are open in Adyar";
  for (const s of ["Only two garbage cases are open in Adyar", "Only a couple of garbage cases are open in Adyar", "Only twenty-one garbage cases are open in Adyar",
    "Only 2garbage cases are open in Adyar", "Only2 garbage cases are open in Adyar", "Open garbage cases in Adyar: No.2", "Only ２ garbage cases are open in Adyar",
    "Only 𝟐 garbage cases are open in Adyar", "Only ² garbage cases are open in Adyar", "Only 4​1​2 garbage cases are open", "Only II garbage cases are open in Adyar",
    "Only 0.002 thousand garbage cases are open", "அடையாறில் இரண்டே குப்பை புகார்கள் திறந்துள்ளன", "அடையாறில் ௨ குப்பை புகார்கள் திறந்துள்ளன",
    "Adyar-la rendu garbage complaints dhaan open-la irukku", "Only ௰ garbage cases are open in Adyar", "Only 2,0 garbage cases are open"])
    it(`"${s}" is rejected`, () => expect(checkPolish(say(s), Qc, countCard)).toHaveProperty("rejected"));

  it("'one' as a pronoun is no figure; 'only one' is", () => {
    expect(checkPolish({ headline: "41 garbage cases are open in Adyar", answerMarkdown: "41 are still open; the worst one is in Besant Nagar.", voiceSummary: "41 are open." }, Qc, countCard)).toHaveProperty("text");
    expect(checkPolish(say("Only one garbage case is open in Adyar"), Qc, countCard)).toHaveProperty("rejected");
  });
  it("a two-wheeler is a vehicle, not a figure", () => {
    expect(checkPolish({ headline: "41 garbage cases are open in Adyar", answerMarkdown: "41 are still open; a heap blocks a two-wheeler lane.", voiceSummary: "41 are open." }, Qc, countCard))
      .toHaveProperty("text");
  });
});

describe("QA pass 7, reviewer5-06: a typed figure counts what it counts", () => {
  it("2 stories shown is not 2 open cases; said as stories it is", () => {
    const card = newsList([story("Garbage piles up near Adyar bus depot - The Hindu", 3), story("Rain lashes city - DT Next", 4)]);
    expect(checkPolish(say(PLANTED), Q, card)).toHaveProperty("rejected");
    expect(checkPolish(say("Only 2 garbage cases in Adyar"), Q, card)).toHaveProperty("rejected");
    expect(checkPolish({ headline: "Two garbage stories in Chennai news", answerMarkdown: "Garbage piles up near the Adyar bus depot (3 outlets); rain lashes the city (4 outlets).",
      voiceSummary: "Two garbage stories in the news." }, Q, card)).toHaveProperty("text");
    expect(checkPolish({ headline: "Garbage in the news", answerMarkdown: "Garbage piles up near the Adyar bus depot, and 3 cases are open.", voiceSummary: "Garbage in the news." }, Q, card))
      .toHaveProperty("rejected");
  });
  it("the incidents a list shows are not the open count, unless the list is of open ones and says so", () => {
    const card = { headline: "Garbage incidents · last 7 days", answerMarkdown: "The two garbage incidents in Adyar zone in the last 7 days.", scopeLine: "Last 7 days", caveats: [], kpis: [],
      datasets: [], incidents: [inc(PLANTED), inc("Bin overflow at the market")], context: { activeFilters: {} } } as unknown as AnswerCard;
    expect(checkPolish(say(PLANTED), "garbage in Adyar", card)).toHaveProperty("rejected");
    expect(checkPolish({ headline: "Two garbage incidents in Adyar", answerMarkdown: "These are the two newest garbage incidents in Adyar: a bin overflow at the market and a heap in Besant Nagar.",
      voiceSummary: "Two garbage incidents in Adyar." }, "garbage in Adyar", card)).toHaveProperty("rejected"); // the spoken "Two garbage incidents" names no list
    expect(checkPolish({ headline: "The two newest garbage incidents in Adyar", answerMarkdown: "These are the two newest garbage incidents in Adyar: a bin overflow at the market and a heap in Besant Nagar.",
      voiceSummary: "These are the two newest garbage incidents in Adyar." }, "garbage in Adyar", card)).toHaveProperty("text");
    const open = { ...card, context: { activeFilters: { openOnly: true } } } as unknown as AnswerCard;
    expect(checkPolish({ headline: "The 2 newest open garbage incidents", answerMarkdown: "These are the 2 newest open garbage incidents in Adyar.", voiceSummary: "These are the 2 newest open garbage incidents." },
      "open garbage in Adyar", open)).toHaveProperty("text");
  });
  it("a number in a place, or a ward number, is no figure: Ward 2 does not make 2 cases", () => {
    const card = { headline: "Garbage incidents · last 7 days", answerMarkdown: "The garbage incidents in Adyar zone.", scopeLine: "", caveats: [], datasets: [],
      kpis: [{ label: "Open", value: 41 }], incidents: [inc("Heap at the gate", { ward: 2, location: `${PLANTED}, Besant Nagar` })], context: { activeFilters: {} } } as unknown as AnswerCard;
    expect(checkPolish(say(PLANTED), "garbage in Adyar", card)).toHaveProperty("rejected");
    expect(checkPolish(say("Only 2 garbage cases are open in Ward 2"), "garbage in Adyar", card)).toHaveProperty("rejected");
    expect(checkPolish({ headline: "41 garbage cases are open in Adyar", answerMarkdown: "41 are open; a heap is in Ward 2, at 3rd Main Road.", voiceSummary: "41 are open." }, "garbage in Adyar", card))
      .toHaveProperty("text");
  });
  it("a measure the words name must be the typed figure's: 41 open is not 41 deaths, and complaints are not incidents", () => {
    expect(checkPolish(say("41 people died in garbage incidents in Adyar"), "garbage in Adyar", countCard)).toHaveProperty("rejected");
    expect(checkPolish(say("6 garbage cases are open in Adyar"), "garbage in Adyar", countCard)).toHaveProperty("rejected");
    expect(checkPolish(say("41 citizen complaints are open in Adyar"), "garbage in Adyar", countCard)).toHaveProperty("rejected");
  });
  it("the window's length is not a claim, a stated duration is", () => {
    expect(checkPolish({ headline: "41 garbage cases open in Adyar", answerMarkdown: "In the last 7 days, 41 garbage cases in Adyar are still open.", voiceSummary: "41 open." }, "garbage in Adyar", countCard))
      .toHaveProperty("text");
    expect(checkPolish({ headline: "41 garbage cases open in Adyar", answerMarkdown: "41 garbage cases have been open for 30 days.", voiceSummary: "41 open." }, "garbage in Adyar", countCard))
      .toHaveProperty("rejected");
  });
});

describe("QA pass 7, reviewer5-06: honest answers still pass", () => {
  it("a count, in English, Tamil and Tanglish", () => {
    const en = { headline: "41 garbage cases are open in Adyar", answerMarkdown: "41 garbage cases in Adyar are still open, up from 38; 6 are severe and 9 are past their deadline.", voiceSummary: "41 garbage cases are open in Adyar." };
    const ta = say("அடையாறில் இந்த வாரம் 41 குப்பை வழக்குகள் திறந்துள்ளன; 9 காலக்கெடு தாண்டியவை, 6 கடுமையானவை.");
    const tg = say("Adyar-la indha vaaram 41 garbage cases open-la irukku, 9 deadline thaandiduchu.");
    const words = say("Forty-one garbage cases are still open in Adyar, six of them severe.");
    for (const d of [en, ta, tg, words]) expect(checkPolish(d, "how many garbage cases are open in Adyar", countCard), d.headline).toHaveProperty("text");
  });
  it("a share: the percentage and the counts it comes from", () => {
    const card = { headline: "23.4% resolved", answerMarkdown: "**23.4%** of the garbage cases reported in the last 7 days are resolved: 12 of 51.", scopeLine: "", caveats: [], datasets: [],
      kpis: [{ label: "Share resolved", value: 23.4 }, { label: "Reported", value: 51 }, { label: "Resolved", value: 12 }, { label: "Still open", value: 39 }], context: { activeFilters: {} } } as unknown as AnswerCard;
    expect(checkPolish({ headline: "23.4% of garbage cases resolved", answerMarkdown: "About 23% of the 51 garbage cases reported this week are resolved (12); 39 are still open.", voiceSummary: "23.4% are resolved." },
      "what share of garbage complaints is resolved", card)).toHaveProperty("text");
    expect(checkPolish(say("51% of garbage cases are resolved"), "what share is resolved", card)).toHaveProperty("rejected");
  });
  it("one incident: its typed counts said as what they count, its ward, its date", () => {
    const card = { headline: "Garbage pile at the market gate", answerMarkdown: "Garbage has piled up at the market gate.", scopeLine: "", caveats: [], kpis: [], datasets: [],
      incident: { ...inc("Garbage pile at the market gate", { ward: 173, sourceCount: 4, citizenComplaintCount: 3, newsOutletCount: 1 }), whatHappened: "Garbage has piled up.", facts: [], attention: [],
        timeline: [], deadline: "2026-11-12", deadlineMissed: true, closedAt: null, officials: [], focus: "all" } } as unknown as AnswerCard;
    expect(checkPolish({ headline: "Garbage pile at the market gate, Ward 173", answerMarkdown: "First reported on 10 Nov at 09:00 through 3 citizen complaints and 1 news outlet (4 records); it is open and past its 12 Nov deadline.",
      voiceSummary: "A garbage pile at the market gate in Ward 173 is open and past its deadline." }, "tell me about it", card)).toHaveProperty("text");
    expect(checkPolish(say("3 garbage cases are open at the market gate"), "tell me about it", card)).toHaveProperty("rejected");
  });
  it("a numbered title quoted word for word in the body keeps its numbers", () => {
    const card = { ...countCard, incidents: [inc("Overflowing bin near bus stop 12")] } as unknown as AnswerCard;
    expect(checkPolish({ headline: "41 garbage cases are open in Adyar", answerMarkdown: "41 are open; the worst is \"Overflowing bin near bus stop 12\".", voiceSummary: "41 are open." }, "garbage in Adyar", card))
      .toHaveProperty("text");
    expect(checkPolish({ headline: "41 garbage cases are open in Adyar", answerMarkdown: "41 are open; the worst is the overflowing bin near bus stop 12.", voiceSummary: "41 are open." }, "garbage in Adyar", card))
      .toHaveProperty("rejected");
  });
});
