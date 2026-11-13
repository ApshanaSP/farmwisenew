import { describe, expect, it, vi } from "vitest";

// reviewer2-02 (P6-006, the officer lock): an officer's news answers carried other departments' incident records: the linked incident's id
// (then the follow-up's selected incident), its severity, deaths, open state and complaints in "why it matters", its place and its AI
// summary. The news itself is public; another department's record is not. Stories still rank as before.
const DOCS = [
  { doc_id: 1, story_id: "S-A", title: "Wall collapse kills two in Chetpet", summary: "A compound wall fell after rain.", url: "https://n.example/a", publisher: "The Hindu", lang: "en", report_type: null,
    is_incident: 1, category_code: "BUILDING_COLLAPSE", place_text: "Chennai", linked_incident_id: "INC-OTHER", t: "2026-11-12 08:00:00", age_min: 120 },
  { doc_id: 2, story_id: "S-B", title: "Street lights out on Anna Salai", summary: "Residents complain of dark stretches.", url: "https://n.example/b", publisher: "DT Next", lang: "en", report_type: null,
    is_incident: 1, category_code: "STREETLIGHT", place_text: "Chennai", linked_incident_id: "INC-OWN", t: "2026-11-12 09:00:00", age_min: 60 }
];
const INCS = [
  { id: "INC-OTHER", sev: "Severe", priority: 90, open: 1, media_only: 0, complaints: 4, dead: 2, cat: "BUILDING_COLLAPSE", label: "Building collapse", zone: 9, zone_name: "Teynampet",
    loc: "12 Secret Lane, Chetpet", dept: "GCC-ENG", dept_name: "Roads and Buildings", status: "In progress", ai_summary: "Internal note: the contractor has not reported." },
  { id: "INC-OWN", sev: "High", priority: 60, open: 1, media_only: 0, complaints: 3, dead: 0, cat: "STREETLIGHT", label: "Street light", zone: 9, zone_name: "Teynampet",
    loc: "Anna Salai near Gemini", dept: "GCC-ELE", dept_name: "Street Lighting", status: "Open", ai_summary: "Twelve poles dark since Monday." }
];
vi.mock("@/lib/collector/db", () => ({
  default: { query: async (sql: string) => [/FROM documents d/.test(sql) ? DOCS.map((d) => ({ ...d })) : /FROM incidents i/.test(sql) ? INCS.map((r) => ({ ...r }))
    : /FROM ref_departments$/.test(sql.trim()) || /SELECT code, name FROM ref_departments/.test(sql) ? [{ code: "GCC-ENG", name: "Roads and Buildings" }, { code: "GCC-ELE", name: "Street Lighting" }] : []] },
  ops: (t: string) => t
}));
vi.mock("@/lib/assistant/embed", () => ({ embed: async () => { throw new Error("no model in tests"); } }));

const { topStories } = await import("@/lib/assistant/news");

describe("reviewer2-02: an officer's news carries no other department's incident record", () => {
  it("the story linked to another department's incident: no id, severity, deaths, open state, complaints, place or summary of it", async () => {
    const r = await topStories({ hours: 168, lockDept: "GCC-ELE" }, "2026-11-12 10:00:00", 6);
    const other = r.stories.find((s) => s.headline.startsWith("Wall collapse"))!;
    const own = r.stories.find((s) => s.headline.startsWith("Street lights"))!;
    expect(other.matchedIncidentId).toBeNull();
    expect(other.whyRelevant.join(" ")).not.toMatch(/severity|death|Still open|complaints/i);
    expect(other.location).not.toMatch(/Secret Lane/);
    expect(other.summary).not.toMatch(/contractor/);
    expect(JSON.stringify(other)).not.toContain("INC-OTHER");
    // the officer's own department's story keeps its record
    expect(own.matchedIncidentId).toBe("INC-OWN");
    expect(own.whyRelevant.join(" ")).toMatch(/high-severity/);
  });
  it("the Collector (no lock) sees every linked record as before", async () => {
    const r = await topStories({ hours: 168 }, "2026-11-12 10:00:00", 6);
    const other = r.stories.find((s) => s.headline.startsWith("Wall collapse"))!;
    expect(other.matchedIncidentId).toBe("INC-OTHER");
    expect(other.whyRelevant.join(" ")).toMatch(/2 deaths/);
  });
});
