// fixall-lock-06 (left open in reviewerF-06's note): the pipeline's check before an incident is shown to a department officer
// (otherDeptsIncident, on incident_detail and incident_story under the lock) held back another department's incident, but let one with no
// lead department through, in full: it is not the officer's department's either. (The fast path's check, idsOfDept, matches
// i.lead_dept = the officer's department, so it already held such an incident back.)
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[]] }, ops: (t: string) => t, TITLE: "i.title" }));
const { otherDeptsIncident } = await import("@/lib/assistant/pipeline");

const result = (tool: string, dept: string | null | undefined) => ({ tool, data: { incident: { id: "INC-X", dept } } }) as never;

describe("fixall-lock-06: an incident with no lead department is not an officer's", () => {
  it.each(["incident_detail", "incident_story"])("%s: the officer's own passes; another department's and one with none are held back", (tool) => {
    expect(otherDeptsIncident(result(tool, "GCC-SWM"), "GCC-SWM")).toBe(false);
    expect(otherDeptsIncident(result(tool, "GCC-HLT"), "GCC-SWM")).toBe(true);
    expect(otherDeptsIncident(result(tool, null), "GCC-SWM")).toBe(true);
    expect(otherDeptsIncident(result(tool, ""), "GCC-SWM")).toBe(true);
    expect(otherDeptsIncident(result(tool, undefined), "GCC-SWM")).toBe(true);
  });

  it("nothing found is nothing to hold back (the tool says it is not in the store); other tools are not incidents", () => {
    expect(otherDeptsIncident({ tool: "incident_detail", data: null } as never, "GCC-SWM")).toBe(false);
    expect(otherDeptsIncident({ tool: "incident_story", data: { found: false } } as never, "GCC-SWM")).toBe(false);
    expect(otherDeptsIncident(result("incidents", null), "GCC-SWM")).toBe(false);
  });
});
