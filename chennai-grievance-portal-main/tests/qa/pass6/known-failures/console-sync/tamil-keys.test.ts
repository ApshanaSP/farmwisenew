// QA pass 6, console-sync: the hand-checked Tamil words whose English key carries a literal number never match, because the
// Translator looks a text up by its template with every number turned into "#" (components/i18n/Translator.tsx keyOf).
import { describe, expect, it } from "vitest";
import { TA } from "@/lib/i18n/ta";
import { translate } from "@/components/i18n/Translator";

const withDigits = Object.keys(TA).filter((k) => /\d/.test(k));

describe("Tamil dictionary keys with digits", () => {
  it("lists them", () => {
    console.log("keys with digits:", JSON.stringify(withDigits));
    expect(withDigits.length).toBeGreaterThan(0);
  });
  it("the snapshot tile 'Past deadline, still open · 24 h' gets its hand-checked Tamil", () => {
    expect(translate("Past deadline, still open · 24 h")).toBe(TA["Past deadline, still open · 24 h"]);
  });
  it("every key with a digit is reachable", () => {
    const unreachable = withDigits.filter((k) => translate(k) == null);
    console.log("unreachable:", JSON.stringify(unreachable));
    expect(unreachable).toEqual([]);
  });
  it("a count and its label keep the same number in Tamil (# open)", () => {
    const out = translate("1,166 open");
    console.log("1,166 open ->", out);
    expect(out ?? "").toContain("1,166");
  });
});
