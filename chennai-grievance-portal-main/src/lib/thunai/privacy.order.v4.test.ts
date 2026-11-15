import { describe, expect, it } from "vitest";
import { asksForbiddenOrder } from "./privacy";

describe("v4 review: an order inside a 'how fast ... close' question is still refused in code", () => {
  it.each([
    "how fast can you delete the old complaints and close the rest",
    "how soon can you approve the drafts and close them",
    "how quickly can you send these and close them",
    "how long does it take to close a case, then delete them all"
  ])("refused: %s", (t) => expect(asksForbiddenOrder(t)).toBe(true));
  it.each([
    "which department is slowest to close drainage complaints",
    "how long does it take to close a case",
    "the closing rate of complaints in Adyar"
  ])("a question about the data, not refused: %s", (t) => expect(asksForbiddenOrder(t)).toBe(false));
});
