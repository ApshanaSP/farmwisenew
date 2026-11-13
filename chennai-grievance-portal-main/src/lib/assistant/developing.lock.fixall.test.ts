import { describe, expect, it, vi } from "vitest";

// reviewerF-06 (reviewer2-02, the officer lock): an officer's "developing stories" question runs threads({dept}), which keeps a thread
// when any of its reports is the department's, and returned that thread's linked incident ids (every member's), the severity and open
// state of the LAST linked incident, and its zone, whichever department holds it. The news is public; another department's record is not.
// A: the officer's own record (GCC-ELE, zone 10, High, closed), day 1. B: an article with no record, day 2 (an arrest). C: another
// department's record (GCC-ENG, zone 9, Severe, open), day 2, the last linked.
const DOCS = [
  { id: 1, story: "S-A", inc: "INC-OWN", publisher: "The Hindu", title: "Compound wall collapse kills two workers in Chetpet", title_en: null, url: "https://n.example/a", lang: "en",
    cat: "BUILDING_COLLAPSE", ddept: null, place: null, geo_level: null, lat: null, lon: null, izone: 10, italuk: null, idept: "GCC-ELE", sev: "High", open: 0, t: "2026-11-10 08:00:00" },
  { id: 2, story: "S-B", inc: null, publisher: "DT Next", title: "Contractor arrested after compound wall collapse kills two workers in Chetpet", title_en: null, url: "https://n.example/b", lang: "en",
    cat: "BUILDING_COLLAPSE", ddept: "GCC-ELE", place: null, geo_level: null, lat: null, lon: null, izone: null, italuk: null, idept: null, sev: null, open: null, t: "2026-11-11 09:00:00" },
  { id: 3, story: "S-C", inc: "INC-OTHER", publisher: "News Today", title: "Compound wall collapse in Chetpet: contractor arrested, two workers killed", title_en: null, url: "https://n.example/c", lang: "en",
    cat: "BUILDING_COLLAPSE", ddept: null, place: null, geo_level: null, lat: null, lon: null, izone: 9, italuk: null, idept: "GCC-ENG", sev: "Severe", open: 1, t: "2026-11-11 12:00:00" }
];
vi.mock("@/lib/collector/db", () => ({
  default: {
    query: async (sql: string) => [/FROM documents d/.test(sql) ? DOCS.map((d) => ({ ...d })) : /_export_meta/.test(sql) ? [{ v: "build-rf06" }]
      : /SELECT code, name, head, action_owner FROM ref_departments/.test(sql) ? [{ code: "GCC-ENG", name: "Roads and Buildings" }, { code: "GCC-ELE", name: "Street Lighting" }]
      : /SELECT DISTINCT zone_no, zone_name FROM ref_wards/.test(sql) ? [{ zone_no: 9, zone_name: "Teynampet" }, { zone_no: 10, zone_name: "Kodambakkam" }] : []]
  },
  ops: (t: string) => t, TITLE: "i.title"
}));

const { lockTools } = await import("@/lib/assistant/pipeline");
const { runTool } = await import("@/lib/assistant/tools");
const SCOPE = { period: "monthly", zone: null, dept: null, cat: null, taluk: null } as never;
const story = async (tools: { name: string; args: Record<string, unknown> }[]) => {
  const r = await runTool(tools[0].name, tools[0].args);
  const rows = (r.data as { rows: { title: string; incidents: string[]; sev: string | null; open: boolean | null; zones: number[] }[] }).rows;
  return { r, row: rows.find((x) => /wall collapse/i.test(x.title))! };
};

describe("reviewerF-06 (reviewer2-02): an officer's developing stories carry no other department's incident record", () => {
  it("under the lock: the story is shown, with only the officer's own record, its severity and open state, and no other zone", async () => {
    const notes: string[] = [];
    const tools = lockTools([{ name: "developing_stories", args: { scope: SCOPE, place: null } }], "GCC-ELE", SCOPE, notes);
    expect(tools[0].args.lockDept).toBe("GCC-ELE");
    const { r, row } = await story(tools);
    expect(row, "the story about the department is still shown").toBeTruthy();
    expect([row.incidents, row.sev, row.open, row.zones]).toEqual([["INC-OWN"], "High", false, [10]]);
    expect(r.incidentIds).toEqual(["INC-OWN"]);
    expect(JSON.stringify(r)).not.toContain("INC-OTHER");
  });
  it("a zone question under the lock does not find the story by another department's record's zone", async () => {
    const z9 = { ...(SCOPE as object), zone: 9 } as never;
    const tools = lockTools([{ name: "developing_stories", args: { scope: z9, place: null } }], "GCC-ELE", z9, []);
    const r = await runTool(tools[0].name, tools[0].args);
    expect((r.data as { rows: unknown[] }).rows).toEqual([]);
  });
  it("the Collector (no lock) sees every linked record as before", async () => {
    const { row } = await story([{ name: "developing_stories", args: { scope: SCOPE, place: null } }]);
    expect([row.incidents, row.sev, row.open, [...row.zones].sort()]).toEqual([["INC-OWN", "INC-OTHER"], "Severe", true, [10, 9]]);
  });
});
