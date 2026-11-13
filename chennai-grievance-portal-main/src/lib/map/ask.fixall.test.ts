/**
 * reviewer3-11: an officer's Ask the Map answer carried the district-wide incident count (every department) in its "as of" layer
 * line, because the incidents layer has no w.meta entry and its fallback counted w.incidents, not the officer's locked set.
 */
import { describe, expect, it, vi } from "vitest";
import { INCIDENTS, fixtureResolver, fixtureWorld } from "./fixture";
import type { Plan } from "./plan";

vi.mock("./world", () => ({ world: async () => ({ world: fixtureWorld(), resolver: fixtureResolver() }) }));
vi.mock("@/lib/assistant/scope", () => ({ refNames: async () => { throw new Error("no store in this test"); } }));
vi.mock("fs", async (orig) => {
  const real = await orig<typeof import("fs")>();
  const appendFile = () => undefined; // the question log: nothing written from a test
  return { ...real, appendFile, default: { ...real, appendFile } };
});

import { askMap } from "./ask";

const plan = { language: "en", show: "a", steps: [{ op: "take", as: "a", layer: "incidents", where: null,
  filter: { category: null, family: null, severity: null, status: "any", dept: null, overdue: null, citizen: null, period: { kind: "last_days", days: 365, offset: 0 }, text: null } }] } as unknown as Plan;
const ask = (role: "collector" | "department_officer", lockDept: string | null) => askMap({ text: null, plan, prev: null,
  context: { zone: null, taluk: null, incidentId: null, drawn: null, ward: null }, user: { email: `${role}@example.invalid`, role, lockDept } });
const incidentLayer = (r: Awaited<ReturnType<typeof askMap>>) => r.asOf?.layers.find((l) => l.id === "incidents");

describe("reviewer3-11: the 'as of' incidents count follows the officer's lock", () => {
  it("an officer's layer line counts only the department's incidents", async () => {
    const own = INCIDENTS.filter((i) => i.dept === "GCC-SWM").length;
    expect(own).toBeGreaterThan(0);
    expect(own).toBeLessThan(INCIDENTS.length);
    const r = await ask("department_officer", "GCC-SWM");
    expect(r.answer?.count).toBeLessThanOrEqual(own);
    expect(incidentLayer(r)?.count).toBe(own);
  });

  it("the Collector (no lock) still sees the whole district's count", async () => {
    const r = await ask("collector", null);
    expect(incidentLayer(r)?.count).toBe(INCIDENTS.length);
  });

  it("a department with no incidents shows 0, not the district", async () => {
    const r = await ask("department_officer", "GCC-NONE");
    expect(incidentLayer(r)?.count).toBe(0);
  });
});
