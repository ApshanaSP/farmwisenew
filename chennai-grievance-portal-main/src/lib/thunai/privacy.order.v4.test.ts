import { describe, expect, it } from "vitest";
import { asksForbiddenOrder } from "./privacy";

describe("v4 review: an order inside a 'how fast ... close' question is still refused in code", () => {
  it.each([
    "how fast can you delete the old complaints and close the rest",
    "how soon can you approve the drafts and close them",
    "how quickly can you send these and close them",
    "how long does it take to close a case, then delete them all",
    // an order with a time word, or a request put as a question (v4 review, numbers finding 4)
    "time to close all these cases",
    "later close all the open cases",
    "it's time to close all the open complaints",
    "how soon can you close all the Adyar cases"
  ])("refused: %s", (t) => expect(asksForbiddenOrder(t)).toBe(true));
  it.each([
    "which department is slowest to close drainage complaints",
    "how long does it take to close a case",
    "the closing rate of complaints in Adyar",
    "how many cases did the fire department close yesterday", "did the corporation close any complaint today", "How many cases has the police close to the deadline"
  ])("a question about the data, not refused: %s", (t) => expect(asksForbiddenOrder(t)).toBe(false));
});
