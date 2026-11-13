// QA4 gate fix: redteam-final-10. A citizen's name, phone and address that an officer writes in a completion report
// must not reach the Collector's page, the analysis prompt or the instruction email.
import { describe, expect, it } from "vitest";
import { scrubCitizenDetails } from "./scrub";

describe("scrubCitizenDetails", () => {
  it("redteam-final-10: the red team's remark loses the phone, the name and the house address and keeps the work", () => {
    const out = scrubCitizenDetails("Work done and site cleared. Called the complainant Ravi Kumar on 98400 12345, house 12 Gandhi Street, Tondiarpet.");
    expect(out).toContain("Work done and site cleared");
    expect(out).not.toMatch(/98400|12345|Ravi|Kumar|Gandhi/);
    expect(out).toContain("Tondiarpet");
  });
  it.each([
    ["Spoke to Mr. S. Murugan at No. 4/2, Anna Salai about the drain", /Murugan|Anna Salai/],
    ["Smt Lakshmi Devi (door no 9, Periyar Nagar) confirmed the light works", /Lakshmi|Devi|Periyar/],
    ["Thiru Kannan called 044 2345 6789 and said thanks", /Kannan|2345/],
    ["Resident mail ravi.k@example.com asked for a call", /ravi\.k@/],
    ["புகார்தாரர் முருகன் வீடு எண் 5 காந்தி தெரு", /முருகன்/]
  ])("hides a detail in %j", (text, bad) => {
    expect(scrubCitizenDetails(text)).not.toMatch(bad);
  });
  it.each([
    "Drain desilted near Ward 12 pumping station, 3 labourers and 2 tippers used, work closed at 4 pm.",
    "Street light replaced on Gandhi Street pole 14; the Resident Welfare Association was informed.",
    "Garbage cleared at Tondiarpet main road, 2 loads to the depot, complaint INC-20261104-81243B closed."
  ])("leaves ordinary work remarks alone: %j", (text) => {
    expect(scrubCitizenDetails(text)).toBe(text);
  });
  it("is safe on empty and non-text values", () => {
    expect(scrubCitizenDetails("")).toBe("");
    expect(scrubCitizenDetails(null as unknown as string)).toBe("");
  });
});
