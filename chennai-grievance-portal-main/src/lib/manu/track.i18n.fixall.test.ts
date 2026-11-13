// Fix-all run after QA pass 6, hunt2-desk-15: /track, where a Tamil petitioner's SMS sends them, was English but for its heading (labels,
// statuses, every note), had no Tamil switch, and kept "Expected by" after the case was closed. The page's words go through the site's
// Translator, so each must have hand-checked Tamil (lib/i18n/ta.ts): with no model key nothing else translates them.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: { query: async () => [[]] } }));
vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[]] }, ops: (t: string) => t }));
const { translate } = await import("@/components/i18n/Translator");
const { PUBLIC_NOTE, ONLINE_FILED } = await import("./track");
const { shownStatus } = await import("./track-words");
const { MANU_DEPTS } = await import("./constants");
const { STATUS_CHAIN } = await import("@/components/StatusTracker");

const TAMIL = /[஀-௿]/;
const tamil = (s: string) => {
  const t = translate(s);
  return t != null && TAMIL.test(t) ? t : null;
};
const PAGE = fs.readFileSync(path.join(process.cwd(), "src", "app", "track", "page.tsx"), "utf8");
const JSX = PAGE.slice(PAGE.lastIndexOf("  return ("));
const ROUTE = fs.readFileSync(path.join(process.cwd(), "src", "app", "api", "track", "route.ts"), "utf8");

describe("hunt2-desk-15: every word /track shows has Tamil without a model", () => {
  it("the page's own labels and buttons", () => {
    // JSX text between tags, and the string literals shown in it ("Checking…" : "Check status")
    const texts = [...JSX.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map((m) => m[1].trim()).filter(Boolean);
    const literals = [...JSX.matchAll(/\? "([^"]+)" : "([^"]+)"/g)].flatMap((m) => [m[1], m[2]]);
    const words = [...new Set([...texts, ...literals, "With:", "Received:", "Expected by:"])];
    expect(words).toEqual(expect.arrayContaining(["Number on your slip", "Last 4 digits of your mobile", "Check status", "Checking…", "Check another number", "Track your petition or complaint"]));
    expect(words.filter((w) => !tamil(w))).toEqual([]);
  });
  it("every status, as the page shows it", () => {
    const statuses = [...STATUS_CHAIN, "Resolved by Department", "Rejected"].map(shownStatus);
    expect(statuses.filter((s) => !tamil(s))).toEqual([]);
  });
  it("every public note, the online one too", () => {
    expect([...Object.values(PUBLIC_NOTE), ONLINE_FILED].filter((s) => !tamil(s))).toEqual([]);
  });
  it("the API's answers the page shows as errors", () => {
    const errors = [...ROUTE.matchAll(/(?:NOT_FOUND = |error: )"([^"]+)"/g)].map((m) => m[1]);
    expect(errors.length).toBeGreaterThanOrEqual(3);
    expect(errors.filter((s) => !tamil(s))).toEqual([]);
    expect(tamil("Tracking is not available just now.")).not.toBeNull();
  });
  it("every desk department's name", () => {
    for (const d of MANU_DEPTS) expect(tamil(d.label), d.code).toBe(d.ta);
  });
  it("numbers stay as they are", () => {
    expect(tamil("Last 4 digits of your mobile")).toBe("உங்கள் கைபேசி எண்ணின் கடைசி 4 இலக்கங்கள்");
  });
  it("the page has a language switch, and opens a Tamil petition in Tamil for this visit only", () => {
    expect(PAGE).toMatch(/<LangToggle \/>/);
    expect(PAGE).toMatch(/j\.lang === "ta" && getLang\(\) !== "ta" && !hasLangChoice\(\)\) setLang\("ta", false\)/);
  });
});
