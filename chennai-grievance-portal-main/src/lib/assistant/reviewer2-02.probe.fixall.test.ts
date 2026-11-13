// reviewerF-07 (on reviewer2-02, 05dd0f42): under the lock topStories keeps the other department's record (`rec` null) out of the id,
// severity, deaths, open state, complaints, place and AI summary, but `where` and `location` still fall back to `li?.zone_name` (news.ts:186,
// :189): when the articles name no place more exact than "Chennai" and carry no summary, the story says the other department's record's zone,
// in its location and in its summary ("One outlet reported this in Teynampet"). The fixall test sets place_text "Chennai" and a summary, so
// the fallback never runs there.
// The zone now comes only from the officer's own department's record (or the articles), and a zone question matches an officer's story
// by their own department's records only.
import { describe, expect, it, vi } from "vitest";

const DOCS = [
  { doc_id: 1, story_id: "S-A", title: "Wall collapse kills two", summary: null, url: "https://n.example/a", publisher: "The Hindu", lang: "en", report_type: null,
    is_incident: 1, category_code: "BUILDING_COLLAPSE", place_text: null, linked_incident_id: "INC-OTHER", t: "2026-11-12 08:00:00", age_min: 120 }
];
const INCS = [
  { id: "INC-OTHER", sev: "Severe", priority: 90, open: 1, media_only: 0, complaints: 4, dead: 2, cat: "BUILDING_COLLAPSE", label: "Building collapse", zone: 9, zone_name: "Teynampet",
    loc: "12 Secret Lane, Chetpet", dept: "GCC-ENG", dept_name: "Roads and Buildings", status: "In progress", ai_summary: null }
];
vi.mock("@/lib/collector/db", () => ({
  default: { query: async (sql: string) => [/FROM documents d/.test(sql) ? DOCS.map((d) => ({ ...d })) : /FROM incidents i/.test(sql) ? INCS.map((r) => ({ ...r }))
    : /SELECT code, name FROM ref_departments/.test(sql) ? [{ code: "GCC-ENG", name: "Roads and Buildings" }, { code: "GCC-ELE", name: "Street Lighting" }] : []] },
  ops: (t: string) => t
}));
vi.mock("@/lib/assistant/embed", () => ({ embed: async () => { throw new Error("no model in tests"); } }));
// the articles name no place: the gazetteer finds none in them
vi.mock("@/lib/collector/nlp", async (orig) => ({ ...(await orig<typeof import("@/lib/collector/nlp")>()), resolvePlace: async () => null }));

const { topStories } = await import("@/lib/assistant/news");

describe("reviewerF-07 (reviewer2-02): an officer's story does not say where another department's record is", () => {
  it("a story whose only place is the linked record's zone: no zone of it in the location or the summary", async () => {
    const r = await topStories({ hours: 168, lockDept: "GCC-ELE" }, "2026-11-12 10:00:00", 6);
    const s = r.stories.find((x) => x.headline.startsWith("Wall collapse"))!;
    expect(s.matchedIncidentId).toBeNull(); // the fix's part holds
    expect(s.location ?? "").not.toMatch(/Teynampet/);
    expect(s.summary).not.toMatch(/Teynampet/);
  });
  it("a zone question does not find the story by another department's record's zone; the Collector's does", async () => {
    const officer = await topStories({ hours: 168, lockDept: "GCC-ELE", zone: 9 }, "2026-11-12 10:00:00", 6);
    expect(officer.stories.map((x) => x.headline)).toEqual([]);
    const collector = await topStories({ hours: 168, zone: 9 }, "2026-11-12 10:00:00", 6);
    expect(collector.stories.map((x) => [x.headline, x.location])).toEqual([["Wall collapse kills two", "12 Secret Lane, Chetpet"]]);
  });
});
