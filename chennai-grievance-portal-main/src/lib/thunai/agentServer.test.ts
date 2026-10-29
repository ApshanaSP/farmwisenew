/** The agent route's body check accepts what the console sends: the open Stage as stageContext() builds it. */
import { describe, expect, it } from "vitest";
import { AgentBody } from "./agentServer";
import { buildScreen, emptySlots } from "./screens";
import { stageContext } from "./stage";
import { WORLD } from "./fixture";
import { fakeHands } from "./stagefake";

describe("AgentBody", () => {
  it("accepts every Stage the builders make, even with a long list open", async () => {
    const S = { period: "daily" as const, zone: null, dept: null, cat: null, taluk: null, sev: null };
    const hands = fakeHands({ incidents: () => ({ tool: "incidents", args: {}, scope: null, asOf: "", facts: [], sources: [], incidentIds: [], testData: false, caveats: [],
      data: { rows: Array.from({ length: 30 }, (_, i) => ({ id: `INC-L${i}`, title: `Case ${i}`, sev: "High", t: "2026-10-29 01:00:00" })), total: 30 } }) });
    for (const [recipe, slots] of [["cases", { status: "open", n: 30 }], ["nearby", { q: "schools near flooding" }], ["performance", { by: "zone" }], ["compare", { zones: [13, 7, 14, 8] }]] as const) {
      const { doc } = await buildScreen(recipe, { ...emptySlots(), ...slots } as never, S, WORLD, hands, recipe);
      const body = { text: "next", state: { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 6 },
        stage: stageContext(doc, null) };
      const r = AgentBody.safeParse(body);
      expect(r.success, `${recipe}: ${r.success ? "" : JSON.stringify(r.error.issues[0])}`).toBe(true);
    }
  });
});
