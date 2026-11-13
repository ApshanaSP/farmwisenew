import { describe, expect, it, vi } from "vitest";

// fixall-lock-01 (found checking the tools in lockTools for reviewerF-06): every path that runs tools for a department officer drops an
// incident_detail or incident_story result about another department's incident (otherDeptsIncident, P6-006), except the agent's "show":
// planFromDecision sends "show INC-..." (incident_explain) to incident_story, and its runs went straight to the answer, so an officer was
// told another department's incident in full (summary, severity, status, deaths, place, reports, officials).
const story = (id: string, dept: string) => ({ tool: "incident_story", args: {}, scope: null, asOf: "2026-11-12 10:00:00", data: { found: true, incident: { id, dept, title: "Wall collapse" } },
  facts: [], sources: [], incidentIds: [id], testData: false, caveats: [] });
vi.mock("@/lib/assistant/tools", async (orig) => ({
  ...(await orig<typeof import("@/lib/assistant/tools")>()),
  runTool: async (_name: string, args: { text: string }) => (args.text === "INC-OTHER" ? story("INC-OTHER", "GCC-ENG") : story("INC-OWN", "GCC-ELE"))
}));

const { runShown } = await import("@/lib/assistant/pipeline");
const SCOPE = { period: "weekly", zone: null, dept: null, cat: null, taluk: null } as never;

describe("fixall-lock-01: the agent's \"show\" of an incident keeps the department lock", () => {
  it("an officer's show of another department's incident is not run into the answer; their own is", async () => {
    const notes: string[] = [];
    const other = await runShown([{ name: "incident_story", args: { text: "INC-OTHER", scope: SCOPE } }], "GCC-ELE", SCOPE, notes);
    expect(other).toEqual([]);
    expect(notes.join(" ")).toMatch(/another department/);
    const own = await runShown([{ name: "incident_story", args: { text: "INC-OWN", scope: SCOPE } }], "GCC-ELE", SCOPE, []);
    expect(own.map((r) => r.result.incidentIds)).toEqual([["INC-OWN"]]);
  });
  it("the Collector (no lock) is shown any department's incident", async () => {
    const r = await runShown([{ name: "incident_story", args: { text: "INC-OTHER", scope: SCOPE } }], null, SCOPE, []);
    expect(r.map((x) => x.result.incidentIds)).toEqual([["INC-OTHER"]]);
  });
});
