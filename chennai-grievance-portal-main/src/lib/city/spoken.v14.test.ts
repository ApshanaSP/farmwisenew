/**
 * v14 (21 Nov live check): the city lines as the Collector hears them: street names in capitals read as names, " · " as a pause, a dry
 * day said as one, named streets before "A lane off ...".
 */
import { describe, expect, it } from "vitest";
import { spoken } from "./now";

describe("v14: spoken()", () => {
  it("names in capitals become title case; short acronyms and road codes stay", () => {
    expect(spoken("the worst is BALAMURUGAN ST (10 of 11 rains)")).toBe("the worst is Balamurugan St (10 of 11 rains)");
    expect(spoken("A lane off MOHAMADHIYAR ST and more")).toBe("A lane off Mohamadhiyar St and more");
    expect(spoken("a rain watch (IMD Yellow for Chennai)")).toBe("a rain watch (IMD Yellow for Chennai)");
    expect(spoken("Ask TANGEDCO to check")).toBe("Ask TANGEDCO to check");
    expect(spoken("SH49A: Anna Nedun Salai")).toBe("SH49A: Anna Nedun Salai");
    expect(spoken("PWD WRD holds it")).toBe("PWD WRD holds it");
  });
  it("' · ' joins read as a comma", () => {
    expect(spoken("the most Ward 127 · Koyambedu, Natesan Nagar (9 of 11)")).toBe("the most Ward 127, Koyambedu, Natesan Nagar (9 of 11)");
  });
  it("Tamil text is untouched", () => {
    expect(spoken("மின்சாரம்: கடந்த கனமழைகளில் 163 வார்டுகளில் மின்தடை")).toBe("மின்சாரம்: கடந்த கனமழைகளில் 163 வார்டுகளில் மின்தடை");
  });
});
