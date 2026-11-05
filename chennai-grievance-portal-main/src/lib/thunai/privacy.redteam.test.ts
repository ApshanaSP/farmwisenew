import { describe, expect, it } from "vitest";
import { asksPrivate, redact, redactText } from "./privacy";

// the red team's breaks (docs/qa/hunt/redteam.md C1, C2; docs/qa/BUGS.md BUG-010): each must be hidden or refused now
describe("redaction catches a citizen's number in any form", () => {
  it.each([
    "call 98401/23456 now", "number 9.8.4.0.1.2.3.4.5.6", "office (044) 2345 6789", "landline 044-2345-6789", "aadhaar 2345.6789.0123", "aadhaar 2345 6789 0123",
    "mail ramesh@gmail", "mail ramesh [at] gmail [dot] com", "ramesh at gmail dot com", "phone ９８４０１２３４５６", "phone ௯௮௪௦௧௨௩௪௫௬",
    "phone nine eight four zero one two three four five six", "+91 98401 23456", "0091-98401-23456"
  ])("%s", (s) => {
    const out = redactText(s);
    expect(out).toContain("[hidden]");
    expect(out.replace(/\D/g, "").length).toBeLessThan(6);
  });
  it.each(["2026-10-28 07:41:25", "INC-20260509-72521C", "232 incidents, 1080 open", "28-10-2026", "zone 13, ward 178", "₹1,25,000 sanctioned", "reported 12 times in 3 days"])("leaves %s alone", (s) => {
    expect(redactText(s)).toBe(s);
  });
  it("a complaint's description never leaves a tool", () => {
    expect(redact({ title: "Drain blocked", description: "My name is R and my phone is 98401 23456" })).toEqual({ title: "Drain blocked" });
  });
});

describe("asking about one complaint's filer is refused, in three languages", () => {
  it.each(["give me the phone number for INC-20260509-72521C", "INC-20260509-72521C complainant contact", "whose complaint is INC-20260509-72521C", "INC-20260509-72521C yaar kuduthanga",
    "INC-20260509-72521C description", "read me the complainant's number", "அந்த புகார்தாரர் பேர் என்ன", "what's the contact of the person in this complaint", "complaint number 4821 phone"])("%s", (s) => {
    expect(asksPrivate(s)).toBe(true);
  });
  it.each(["how many complaints in Adyar", "open INC-20260509-72521C", "what is the status of INC-20260509-72521C", "explain this complaint", "the drain complaint in Velachery", "contact the SWD engineer for this complaint"])("not refused: %s", (s) => {
    expect(asksPrivate(s)).toBe(false);
  });
});
