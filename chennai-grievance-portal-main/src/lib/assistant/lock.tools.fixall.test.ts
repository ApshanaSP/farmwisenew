import { beforeEach, describe, expect, it, vi } from "vitest";

// reviewerF-06's check of every tool in lockTools (the officer lock): besides developing_stories, three tools read records the
// department filter does not reach. search_records' news rows carried each report's linked incident id whatever department holds it;
// incident_story's "other close matches" were searched over every department; hotspots count every department's incidents and their
// open state. (The agent's "show" path is in lock.show.fixall.test.ts.)
const INCS = [
  { id: "INC-OWN", dept: "GCC-ELE", title: "Street lights out on Anna Salai", type: "Street light", zone_name: "Teynampet", place: "Anna Salai", sev: "High", status: "Open" },
  { id: "INC-OTHER", dept: "GCC-ENG", title: "Wall collapse in Chetpet", type: "Building collapse", zone_name: "Teynampet", place: "12 Secret Lane, Chetpet", sev: "Severe", status: "Open" },
  { id: "INC-OWN-2", dept: "GCC-ELE", title: "Street lights out near Gemini", type: "Street light", zone_name: "Teynampet", place: "Gemini flyover", sev: "Moderate", status: "Open" }
];
const hits = vi.hoisted(() => ({ incidents: [] as unknown[], news: [] as unknown[] }));
vi.mock("@/lib/collector/db", () => ({
  default: {
    query: async (sql: string, params: unknown[] = []) => {
      if (/incident_id IN \(\?\) AND i\.lead_dept = \?/.test(sql)) return [INCS.filter((r) => (params[0] as string[]).includes(r.id) && r.dept === params[1]).map((r) => ({ id: r.id }))];
      // the story's other close matches (queries.ts incidentsByIds: one "?" per id)
      if (/FROM incidents i WHERE i\.incident_id IN \(\?/.test(sql)) return [INCS.filter((r) => params.includes(r.id)).map((r) => ({ ...r, t: "2026-11-12 08:00" }))];
      if (/SELECT code, name, head, action_owner FROM ref_departments/.test(sql)) return [[{ code: "GCC-ENG", name: "Roads and Buildings" }, { code: "GCC-ELE", name: "Street Lighting" }]];
      return [[]];
    }
  },
  ops: (t: string) => t, TITLE: "i.title"
}));
vi.mock("@/lib/assistant/lance", () => ({ hybridSearch: async (kind: "incidents" | "news") => hits[kind], currentIncidentIds: async () => [] }));
vi.mock("@/lib/assistant/rerank", () => ({ pickIncident: async () => undefined }));
vi.mock("@/lib/assistant/embed", async (orig) => ({ ...(await orig<typeof import("@/lib/assistant/embed")>()), warmUp: () => undefined, semanticSearch: async () => null }));
vi.mock("@/lib/collector/intel", async (orig) => ({
  ...(await orig<typeof import("@/lib/collector/intel")>()),
  incident: async (id: string) => ({ incident: { ...INCS.find((r) => r.id === id), t: "2026-11-12 08:00:00", hours_open: 5, complaints: 1 }, reports: [], contacts: [], assigned: null, decisions: [] })
}));
vi.mock("@/lib/collector/nlp", async (orig) => ({ ...(await orig<typeof import("@/lib/collector/nlp")>()), resolvePlace: async () => null }));

const { lockTools } = await import("@/lib/assistant/pipeline");
const { runTool } = await import("@/lib/assistant/tools");
const SCOPE = { period: "monthly", zone: null, dept: null, cat: null, taluk: null } as never;
const hit = (id: string, rec: Record<string, unknown>) => ({ id, sim: 0.9, score: 0.03, rec: { t: 1_762_900_000, ...rec } });
const locked = (name: string, args: Record<string, unknown>, notes: string[] = []) => lockTools([{ name, args: { scope: SCOPE, ...args } }], "GCC-ELE", SCOPE, notes);

describe("reviewerF-06: the other tools under the officer lock", () => {
  beforeEach(() => { hits.incidents = []; hits.news = []; });

  it("lockTools: the tools that read across departments get the lock; hotspots become the department's own places", () => {
    for (const n of ["developing_stories", "search_records", "incident_story"]) expect(locked(n, { text: "x" })[0].args.lockDept, n).toBe("GCC-ELE");
    const notes: string[] = [];
    const t = locked("hotspots", {}, notes);
    expect(t.map((x) => [x.name, (x.args.scope as { dept: string }).dept])).toEqual([["place_breakdown", "GCC-ELE"]]);
    expect(notes.join(" ")).toMatch(/every department's incidents/);
  });

  it("search_records: a news report's link to another department's incident is left out; the officer's own link stays", async () => {
    hits.news = [hit("D1", { title: "Wall collapse in Chetpet", source: "The Hindu", place: "Chetpet", url: "https://n.example/1", incident: "INC-OTHER", dead: 2 }),
      hit("D2", { title: "Street lights out on Anna Salai", source: "DT Next", place: "Anna Salai", url: "https://n.example/2", incident: "INC-OWN", dead: 0 })];
    const [t] = locked("search_records", { text: "chetpet lights", kinds: ["news"] });
    const r = await runTool(t.name, t.args);
    const news = (r.data as { news: { id: string; incident: string | null }[] }).news;
    expect(news.map((x) => [x.id, x.incident])).toEqual([["D1", null], ["D2", "INC-OWN"]]);
    expect(JSON.stringify(r)).not.toContain("INC-OTHER");
    // the Collector (no lock) sees both links
    const all = await runTool("search_records", { text: "chetpet lights", kinds: ["news"], scope: SCOPE });
    expect((all.data as { news: { incident: string | null }[] }).news.map((x) => x.incident)).toEqual(["INC-OTHER", "INC-OWN"]);
  });

  it("incident_story: the other close matches are only the officer's department's", async () => {
    hits.incidents = INCS.map((r) => hit(r.id, { title: r.title, place: r.place, cat_label: r.type, sev: "High" })); // the officer's own incident is the best match
    const [t] = locked("incident_story", { text: "street lights out" });
    const r = await runTool(t.name, t.args);
    const d = r.data as { incident: { id: string }; others: { id: string }[] };
    expect(d.others.map((o) => o.id)).toEqual(["INC-OWN-2"]);
    expect(r.incidentIds).not.toContain("INC-OTHER");
    const all = await runTool("incident_story", { text: "street lights out", scope: SCOPE });
    expect((all.data as { others: { id: string }[] }).others.map((o) => o.id)).toEqual(["INC-OTHER", "INC-OWN-2"]);
  });
});
