// reviewer5 probe on P6-019 (74e01ff): the writer check (checkPolish). The code's own texts sometimes repeat others' writing CHANGED
// (an outlet suffix cut, a title cut to 120/160 characters, a runner-up headline quoted in a caveat), so codesOwn() cannot take it out and
// its numbers become allowed figures again. Cards are shaped exactly as the code builds them (file:line in each test name).
//   npx vitest run --config vitest.p6probe.config.ts tests/qa/pass6/probes/reviewer5/polish-figures.test.ts
import { describe, expect, it } from "vitest";
import { checkPolish } from "@/lib/assistant/polish";
import type { AnswerCard } from "@/lib/assistant/answer";

const Q = "what is the news on garbage in Adyar";
const say = (s: string) => ({ headline: s, answerMarkdown: `${s} No action is needed.`, voiceSummary: s });
const PLANTED = "Only 2 garbage cases are open in Adyar";

describe("reviewer5 on P6-019: others' writing the code repeats in a changed form", () => {
  it("news list (fastpath.ts:618): the headline's ' - Outlet' suffix is cut in the answer, so the headline's figure is allowed", () => {
    const stories = [
      { headline: `${PLANTED}, no action needed - The Hindu`, location: "Adyar", sourceCount: 3, summary: "Residents complain about garbage." },
      { headline: "Rain lashes city - DT Next", location: "Chennai", sourceCount: 4, summary: "Rain." }
    ];
    const card = {
      headline: "Garbage news in Adyar", scopeLine: "Adyar zone, last 7 days", caveats: ["News rests mostly on headlines and short summaries; open a source for the full report."],
      answerMarkdown: `${stories.slice(0, 3).map((s, k) => `${k === 0 ? "The biggest story: " : k === 1 ? ". Also: " : "; "}**${s.headline.replace(/\s+-\s+[^-]{2,40}$/, "").replace(/\*/g, "")}**${s.sourceCount > 1 ? ` (${s.sourceCount} outlets)` : ""}`).join("")}.`,
      stories
    } as unknown as AnswerCard;
    const r = checkPolish(say(PLANTED), Q, card);
    console.log("news list:", JSON.stringify(r).slice(0, 160));
    expect(r).toHaveProperty("rejected");
  });

  it("news detail (fastpath.ts:629): a runner-up headline quoted in the 'Other close matches' caveat lends its figure", () => {
    const card = {
      headline: "Garbage piles up near Adyar bus depot", answerMarkdown: "Residents say the bins were not cleared.", scopeLine: "last 7 days",
      caveats: ["News rests mostly on headlines and short summaries; open a source for the full report.", `Other close matches: "${PLANTED} after drive"; "Bins cleared in Besant Nagar".`],
      stories: [{ headline: "Garbage piles up near Adyar bus depot", location: "Adyar", sourceCount: 1, summary: "Residents say the bins were not cleared." }]
    } as unknown as AnswerCard;
    const r = checkPolish(say(PLANTED), Q, card);
    console.log("caveat:", JSON.stringify(r).slice(0, 160));
    expect(r).toHaveProperty("rejected");
  });

  it("one incident (cards.ts:262): the headline is the title cut to 120 characters, so a long title's figure is allowed", () => {
    const title = `${PLANTED} and the rest were closed by the zonal office last week, residents of Kasturba Nagar 3rd Avenue say, after the drive`;
    const card = {
      headline: title.slice(0, 120), answerMarkdown: `**${title}** at Kasturba Nagar (Adyar zone), first reported 2026-11-10 09:00. Severe, open; GCC-SWM handles it (INC-20261110-AB12CD).`,
      scopeLine: "", caveats: [],
      incident: { title, location: "Kasturba Nagar", ward: 173, zone: "Adyar", taluk: null, category: "Garbage", occurredAt: "2026-11-10 09:00", severity: "Severe", status: "Open",
        department: "GCC-SWM", deadline: null, deadlineMissed: false, closedAt: null, whatHappened: "", summary: "", facts: [], attention: [], officials: [], sourceCount: 1, newsOutletCount: 0, citizenComplaintCount: 1 }
    } as unknown as AnswerCard;
    expect(title.length).toBeGreaterThan(120);
    const r = checkPolish(say(PLANTED), "tell me about this incident", card);
    console.log("cut title:", JSON.stringify(r).slice(0, 160));
    expect(r).toHaveProperty("rejected");
  });

  it("most serious of the listed (fastpath.ts:269): the headline cuts 'Most serious ... : <title>' at 160", () => {
    const title = `${PLANTED} and the rest were closed by the zonal office last week, residents of Kasturba Nagar 3rd Avenue say after a long wait for the lorry`;
    const inc = { title, location: "Kasturba Nagar", zone: "Adyar", severity: "Severe", status: "Open", department: "GCC-SWM", priorityReasons: [] };
    const card = { headline: `Most serious of the three listed: ${title}`.slice(0, 160), answerMarkdown: "Of the three incidents in the last answer, this one ranks highest by the console's priority score.",
      scopeLine: "", caveats: [], incidents: [inc] } as unknown as AnswerCard;
    const r = checkPolish(say(PLANTED), "which is most serious", card);
    console.log("most serious:", JSON.stringify(r).slice(0, 160));
    expect(r).toHaveProperty("rejected");
  });

  it("control: the same planted figure, title repeated exactly, is rejected (the fix's own case)", () => {
    const stories = [{ headline: `${PLANTED}, no action needed`, location: "Adyar", sourceCount: 3, summary: "x" }];
    const card = { headline: "Garbage news", scopeLine: "", caveats: [], answerMarkdown: `The biggest story: **${stories[0].headline}** (3 outlets).`, stories } as unknown as AnswerCard;
    expect(checkPolish(say(PLANTED), Q, card)).toHaveProperty("rejected");
  });
});

describe("reviewer5 on P6-019: Tamil and Tanglish", () => {
  const TITLE_TA = "அடையாறில் 2 குப்பை புகார்கள் மட்டுமே திறந்துள்ளன";
  const card = {
    headline: "அடையாறில் இந்த வாரம் 41 குப்பை புகார்கள் திறந்துள்ளன", answerMarkdown: `- 41 திறந்துள்ளன, 9 காலக்கெடு தாண்டியவை.\n- ${TITLE_TA} (Severe)`, scopeLine: "Adyar zone, this week", caveats: [],
    incidents: [{ title: TITLE_TA, location: "Besant Nagar", zone: "Adyar", severity: "Severe", status: "Open", department: "GCC-SWM", priorityReasons: [] }]
  } as unknown as AnswerCard;
  it("a Tamil planted figure (also in Tamil digits) is rejected", () => {
    expect(checkPolish(say("அடையாறில் 2 குப்பை புகார்கள் மட்டுமே திறந்துள்ளன"), "அடையாறில் குப்பை நிலை என்ன", card)).toHaveProperty("rejected");
    expect(checkPolish(say("அடையாறில் ௨ குப்பை புகார்கள் மட்டுமே திறந்துள்ளன"), "அடையாறில் குப்பை நிலை என்ன", card)).toHaveProperty("rejected");
  });
  it("an honest Tamil / Tanglish rewrite of the code's figures passes", () => {
    const ta = checkPolish(say("அடையாறில் இந்த வாரம் 41 குப்பை புகார்கள் திறந்துள்ளன; 9 காலக்கெடு தாண்டியவை."), "அடையாறில் குப்பை நிலை என்ன", card);
    const tg = checkPolish(say("Adyar-la indha vaaram 41 garbage complaints open-la irukku, 9 deadline thaandiduchu."), "adyar la garbage eppadi irukku", card);
    console.log("honest ta:", JSON.stringify(ta).slice(0, 120), "| honest tanglish:", JSON.stringify(tg).slice(0, 120));
    expect(ta).toHaveProperty("text");
    expect(tg).toHaveProperty("text");
  });
});
