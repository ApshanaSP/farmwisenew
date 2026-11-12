/**
 * QA pass 6, P6-027 (hunt2-desk-05): an online complaint that carries a whole Aadhaar number (ASCII or Tamil digits, with spaces or dashes)
 * put it as it stood into its case's title, text and place, which the Collector and the department read on their consoles; the Manu Desk
 * masks the same text. onlineCase() builds the case both when the complaint is filed (addCaseLive) and in every new build (websiteCases).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[], []] }, ops: (t: string) => t, TITLE: "i.title" }));
const { onlineCase } = await import("@/lib/manu/cases");

const row = (o: Record<string, unknown>) => ({ complaint_code: "2026-467UPC", created_at: "2026-11-12 16:00:00", title: "Garbage", description: "Garbage not cleared",
  ward_number: 170, specific_location: null, street_address: "1 Test Street", mobile_number: "9000000001", user_id: 5, ...o });
const AADHAAR_RUN = /(?:\d[\s-]?){12}|(?:[௦-௯][\s-]?){12}/;

describe("QA pass 6, P6-027: an online complaint's case never carries a whole Aadhaar number", () => {
  it("in the title (ASCII digits with spaces)", () => {
    const c = onlineCase(row({ title: "Garbage not cleared, my Aadhaar 2345 6789 1234" }), "Solid Waste Management Department");
    expect(c.title).not.toMatch(AADHAAR_RUN);
    expect(c.title).toContain("XXXX XXXX 1234");
  });
  it("in the text (Tamil digits) and the place (dashes)", () => {
    const c = onlineCase(row({ description: "ஆதார் ௨௩௪௫ ௬௭௮௯ ௧௨௩௪ குப்பை", specific_location: "Near 2345-6789-1234 bus stop" }), null);
    expect(c.text).not.toMatch(AADHAAR_RUN);
    expect(c.place).not.toMatch(AADHAAR_RUN);
  });
  it("an ordinary title is unchanged", () => {
    expect(onlineCase(row({ title: "Street light not working near the school" }), null).title).toBe("Street light not working near the school");
  });
});
