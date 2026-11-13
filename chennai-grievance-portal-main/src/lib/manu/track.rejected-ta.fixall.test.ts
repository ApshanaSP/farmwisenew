// Fix-all round 2, reviewerC-08: /track's note for a rejected case says in English "The Collector's office can tell you why." The Tamil said
// "காரணத்தை ஆட்சியர் அலுவலகம் உங்களுக்குத் தெரிவிக்கும்" ("the office will inform you of the reason"), a promise of a contact that never comes:
// the closing SMS says only that it could not be taken up. The Tamil must say the person can ask there, as the English does.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: { query: async () => [[]] } }));
vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[]] }, ops: (t: string) => t }));
const { translate } = await import("@/components/i18n/Translator");
const { PUBLIC_NOTE } = await import("./track");

describe("reviewerC-08: the Tamil note for a rejected case says the office CAN tell why, not that it WILL", () => {
  const ta = () => String(translate(PUBLIC_NOTE.Rejected) ?? "");
  it("the English is still 'can tell you why'", () => expect(PUBLIC_NOTE.Rejected).toBe("It could not be taken up. The Collector's office can tell you why."));
  it("the Tamil promises no message from the office", () => {
    expect(ta()).toMatch(/[஀-௿]/);
    expect(ta()).not.toMatch(/தெரிவிக்கும்|அறிவிக்கும்|சொல்லும்/);
  });
  it("the Tamil says the reason can be asked at the Collector's office", () => {
    expect(ta()).toContain("ஆட்சியர் அலுவலகத்தில் கேட்டு");
    expect(ta()).toMatch(/லாம்\.$/);
  });
});
