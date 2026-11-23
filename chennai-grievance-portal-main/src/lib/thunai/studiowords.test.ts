/**
 * v17 (22 Nov): on the Data Studio page, the browser answers a sentence from the open dataset only when it is about that dataset; a question
 * about the district, or one naming another dataset, goes to Jarvis's server round (which knows the open one too).
 */
import { describe, expect, it } from "vitest";
import { OWN_DATA, aboutOpenDataset, districtWordsIn, followUp, keyWords } from "./studiowords";

const SHELTERS = { name: "Chennai Relief Shelter Locations", questions: ["How many relief shelters are listed?", "What is the average number of families per shelter?"] };

describe("aboutOpenDataset", () => {
  it("about the open dataset: its name, its questions' words, 'this data', a bare question, a follow-up on its answer", () => {
    expect(aboutOpenDataset("which zone has the most relief shelters?", SHELTERS)).toBe(true);
    expect(aboutOpenDataset("how many families in total?", SHELTERS)).toBe(true);
    expect(aboutOpenDataset("what does this data say?", SHELTERS)).toBe(true);
    expect(aboutOpenDataset("what is the average?", SHELTERS)).toBe(true);
    expect(aboutOpenDataset("and in Adyar?", SHELTERS, { afterStudioAnswer: true })).toBe(true);
  });
  it("a district question, or one naming another dataset, goes through", () => {
    expect(aboutOpenDataset("how many severe complaints in Adyar today?", SHELTERS)).toBe(false);
    expect(aboutOpenDataset("any dengue deaths this week", SHELTERS)).toBe(false);
    expect(aboutOpenDataset("what does my desilting register say?", SHELTERS)).toBe(false);
    expect(aboutOpenDataset("and in Adyar?", SHELTERS)).toBe(false);
  });
  it("'dataset' or 'my file' alone does not keep a sentence that names another dataset on the open one", () => {
    expect(aboutOpenDataset("what does the desilting dataset say?", SHELTERS)).toBe(false);
    expect(aboutOpenDataset("summarise my ration shops spreadsheet", SHELTERS)).toBe(false);
    // asking words name nothing: still the open dataset's
    expect(aboutOpenDataset("summarise this file", SHELTERS)).toBe(true);
    expect(aboutOpenDataset("what does this spreadsheet say?", SHELTERS)).toBe(true);
    expect(aboutOpenDataset("key insights from the dataset", SHELTERS)).toBe(true);
    expect(aboutOpenDataset("what does the shelters dataset say?", SHELTERS)).toBe(true);
  });
});

describe("the words", () => {
  it("'my ... data' with the dataset's own words between is the Collector's own data; a district question is not", () => {
    expect(OWN_DATA.test("what does my flood inundation spots data say?")).toBe(true);
    expect(OWN_DATA.test("summarise our relief shelters file")).toBe(true);
    expect(OWN_DATA.test("my data")).toBe(true);
    expect(OWN_DATA.test("which streets flood the most")).toBe(false);
    expect(OWN_DATA.test("show my tasks for today")).toBe(false);
  });
  it("times and question words name no dataset; the console's words are found stemmed", () => {
    expect(keyWords("how many relief shelters this week")).toEqual(["relief", "shelter"]);
    expect(districtWordsIn("Severe complaints and flooding")).toEqual(["severe", "complaint", "flooding"]);
    expect(followUp("only the pending ones")).toBe(true);
    expect(followUp("by zone?")).toBe(true);
    expect(followUp("how many of them are open?")).toBe(true);
    expect(followUp("how many relief shelters are listed in the whole district register")).toBe(false);
  });
});
