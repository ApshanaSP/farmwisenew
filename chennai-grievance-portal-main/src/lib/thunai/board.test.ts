/**
 * 28 Nov: code's reading of a dashboard request (board.ts) and of the form an answer should take, on the owner's own sentences from the logs of
 * 27 Nov (hosted copy, 23:20 to 23:51 IST, and this PC, 23:46 to 23:59 IST) and the compare family asked for. No model (EVAL_NO_AI needs none).
 */
import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { answerForm, boardAsk, boardSlots, deptsIn, partsIn } from "./board";
import { checkScreen } from "./agent";

describe("a comparison of places is a comparison dashboard", () => {
  it("reads the logged Tamil comparison of Anna Nagar and Adyar (27 Nov, 23:22 IST)", () => {
    const a = boardAsk("Anna Nagar-யும். அடையாரையும் compare பண்ணு.", WORLD);
    expect(a).toMatchObject({ recipe: "compare", zones: [8, 13], sev: null, parts: [] });
  });
  it("reads English, Tanglish and the console's window", () => {
    expect(boardAsk("Compare Adyar and Ambattur this week", WORLD)).toMatchObject({ recipe: "compare", zones: [13, 7], period: "weekly", parts: [] });
    expect(boardAsk("Adyar vs Alandur", WORLD)).toMatchObject({ recipe: "compare", zones: [13, 12] });
    expect(boardAsk("Anna Nagar versus Perungudi versus Adyar last 30 days", WORLD)).toMatchObject({ recipe: "compare", zones: [8, 14, 13], period: "monthly" });
    expect(boardAsk("adyar and alandur compare pannu", WORLD)).toMatchObject({ recipe: "compare", zones: [13, 12] });
  });
  it("keeps only the subject asked: severe incidents, a group of kinds, one kind", () => {
    const sev = boardAsk("Create a comparative dashboard of Anna Nagar and Adyar for severe incidents", WORLD)!;
    expect(sev).toMatchObject({ recipe: "compare", zones: [8, 13], sev: "Severe", parts: ["incidents"] });
    expect(boardAsk("Compare Adyar and Alandur crime over a week", WORLD)).toMatchObject({ family: "CRIME", parts: ["incidents"] });
    expect(boardAsk("Compare Adyar and Alandur theft cases", WORLD)).toMatchObject({ cat: "CRIME_PROPERTY", family: null });
    expect(boardAsk("compare the news of Adyar and Anna Nagar", WORLD)).toMatchObject({ parts: ["news"], sev: null });
  });
  it("holds every part asked, and the overall set when nothing narrows it", () => {
    expect(boardAsk("Create a dashboard comparing Adyar and Anna Nagar with incidents, news and complaints", WORLD)).toMatchObject({ recipe: "compare", parts: ["incidents", "news", "complaints"] });
    expect(boardAsk("compare the overall picture of Adyar and Royapuram", WORLD)).toMatchObject({ parts: [] });
  });
  it("compares departments side by side", () => {
    expect(boardAsk("compare the police and storm water drains", WORLD)).toMatchObject({ recipe: "compare", zones: [], depts: ["POL-GCP", "GCC-SWD"] });
  });
  it("leaves a comparison of one place, or of times or prices, to the lanes that answer it", () => {
    expect(boardAsk("Compare tomato price over one week.", WORLD)).toBeNull();
    expect(boardAsk("compare them", WORLD)).toBeNull();
    expect(boardAsk("Compare vegetable prices over markets today.", WORLD)).toBeNull();
  });
});

describe("a dashboard or a summary of one subject", () => {
  it("is the summary dashboard of the place, with every part when the overall summary is asked", () => {
    expect(boardAsk("Give me a summary of Royapuram today.", WORLD)).toMatchObject({ recipe: "summary", zones: [5], parts: [] });
    expect(boardAsk("Create a dashboard of Adyar", WORLD)).toMatchObject({ recipe: "summary", zones: [13], parts: [] });
    expect(boardAsk("overall summary of Anna Nagar with news, grievances, reports, vegetable prices and AQI", WORLD)).toMatchObject({ recipe: "summary", zones: [8], parts: [] });
    expect(boardAsk("Make a dashboard for a PWD department for the last thirty days.", WORLD)).toMatchObject({ recipe: "summary", depts: ["PWD-WRD"] });
    expect(boardAsk("What are all the crime incidents in the past thirty days? Make a dashboard out of it.", WORLD)).toMatchObject({ recipe: "summary", family: "CRIME" });
  });
  it("reads a period's report of a place (27 Nov 23:29: it only set the console to weekly)", () => {
    expect(boardAsk("Anna Nagar-க்கு weekly report எடு.", WORLD)).toMatchObject({ recipe: "summary", zones: [8], period: "weekly" });
  });
  it("reads what happened in one place over a window as its summary, but not a severe list", () => {
    expect(boardAsk("Anna Nagar-ல 3 நாள்-ல என்ன நடந்துச்சு?", WORLD)).toMatchObject({ recipe: "summary", zones: [8] });
    expect(boardAsk("ராயபுரத்துல என்ன severe-ஆன நடந்திருக்கு?", WORLD)).toBeNull();
  });
  it("is never a question about the console, a figure, or the day's brief", () => {
    expect(boardAsk("Customize this dashboard into only overview and. Overview and Data Studio page.", WORLD)).toBeNull();
    expect(boardAsk("But it's showing one in the dashboard.", WORLD)).toBeNull();
    expect(boardAsk("Anna Nagar-ல இன்னைக்கு எத்தனை complaints?", WORLD)).toBeNull();
    expect(boardAsk("how many severe incidents this week", WORLD)).toBeNull();
    expect(boardAsk("Give me a summary of today", WORLD)).toBeNull();
    // several kinds at once is a report of parts, each counted (the brain's), not one kind's dashboard
    expect(boardAsk("Give me the weekly summary of road accidents, flooding and public infrastructure incidents.", WORLD)).toBeNull();
    expect(boardAsk("Give me a summary of Thiruvottiyur, crime news and incidents.", WORLD)).toMatchObject({ recipe: "summary", zones: [1], family: "CRIME", parts: ["incidents", "news"] });
    expect(boardAsk("Which needs my attention now?", WORLD)).toBeNull();
    // the console's Overview page, and the Data Studio's own dashboards
    expect(boardAsk("Show Adyar on the overview map", WORLD)).toBeNull();
    expect(boardAsk("Add the Adyar chart to the dashboard", WORLD)).toBeNull();
    expect(boardAsk("Give me an overview of Adyar", WORLD)).toMatchObject({ recipe: "summary", zones: [13] });
    expect(boardAsk("Give me a full overview dashboard for PWD department.", WORLD)).toMatchObject({ recipe: "summary", depts: ["PWD-WRD"] });
  });
});

describe("a board's slots pass the screen checker as they are", () => {
  it("keeps the places, the departments and the parts", () => {
    const a = boardAsk("Create a dashboard comparing Adyar and Anna Nagar with incidents, news and complaints", WORLD)!;
    const sc = checkScreen({ recipe: a.recipe, ...boardSlots(a) }, WORLD, null);
    expect(sc?.slots).toMatchObject({ zones: [13, 8], parts: ["incidents", "news", "complaints"], fresh: true });
    const p = checkScreen({ recipe: "compare", places: ["T. Nagar", "Marina"], parts: ["news", "nonsense"] }, WORLD, null);
    expect(p?.slots).toMatchObject({ places: ["T. Nagar", "Marina"], parts: ["news"] });
    const d = boardAsk("compare the police and storm water drains", WORLD)!;
    expect(checkScreen({ recipe: d.recipe, ...boardSlots(d) }, WORLD, null)?.slots.depts).toEqual(["POL-GCP", "GCC-SWD"]);
  });
  it("reads the parts and the departments on their own", () => {
    expect(partsIn(" news and air quality ")).toEqual(["news", "air"]);
    expect(partsIn(" everything ")).toEqual([]);
    expect(deptsIn(" pwd buildings and police ", WORLD)).toEqual(["PWD-BLD", "POL-GCP"]);
  });
});

/**
 * The golden list: every question asked of Jarvis on the evening of 27 Nov (both copies) with the form its answer should take. "board": a
 * dashboard; "count": a sentence with the number; "list": the list; "where": the place on the map; null: any form fits (small talk, a
 * fragment, a move answered by the console). The comparison of 23:22 was answered as text; the weekly report of 23:29 only moved the console.
 */
const GOLDEN: [string, ReturnType<typeof answerForm>][] = [
  ["Go to briefing page.", "action"],
  ["Go to overview page.", "action"],
  ["Anna Nagar-ல இன்னைக்கு எத்தனை complaints?", "count"],
  ["Anna Nagar-யும். அடையாரையும் compare பண்ணு.", "board"],
  ["என்ன கேட்குது?", null],
  ["இன்னைக்கு severe-ஆன news என்ன?", null],
  ["ராயபுரத்துல என்ன severe-ஆன நடந்திருக்கு?", null],
  ["Department Head-க்கு mail அனுப்பிடு.", "action"],
  ["Draft open பண்ணு.", "action"],
  ["Anna Nagar-ல 3 நாள்-ல என்ன நடந்துச்சு?", "board"],
  ["எத்தனை death report ஆயிருக்கு அந்த இதுல 3 நாள்ல?", "count"],
  ["Anna Nagar-க்கு weekly report எடு.", "board"],
  ["Javed. Show wine shop near college.", "list"],
  ["is there any complaint near iit chennai?", "yesno"],
  ["Which college has the highest complaints?", "where"],
  ["I asked for only colleges, not coaching centers.", null],
  ["What is the top college opponents? Name and tell me what are the issues around it.", "list"],
  ["Tell me about that file. Tell me about that five open citizen complaints.", "list"],
  ["Which needs my attention now?", null],
  ["Tell me. Colleges near wine shop.", "list"],
  ["Tell me colleges that are near wine shop.", "list"],
  ["how many severe incidents this week", "count"],
  ["what is the tomato price at Pallavaram", null],
  ["Give me a summary of Royapuram today. Royapuram today.", "board"],
  ["Compare Adyar and Alandur violent crime cases over a week.", "board"]
];

describe("the answer's form follows the question (the logged questions of 27 Nov)", () => {
  for (const [q, f] of GOLDEN) it(`${q} -> ${f ?? "any"}`, () => expect(answerForm(q, WORLD)).toBe(f));
});
