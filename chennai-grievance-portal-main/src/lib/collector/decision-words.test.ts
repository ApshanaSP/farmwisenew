// QA pass 7, hunt2-ops-02: the confirm box for a Collector "reject" said "Return to the department 1 case", but a reject closes the case
// as Rejected for good. The confirm words now come from one table next to the effect table (effective.ts), and the route uses it.
import { describe, expect, it, vi } from "vitest";
import { DECISION_EFFECT, DECISION_WORDS } from "./effective";

vi.mock("@/lib/collector/guard", async (orig) => ({ ...(await orig<object>()),
  collectorSession: async () => ({ userId: 990001, email: "qa-p7@example.test", role: "collector", tv: 0 }) }));

describe("hunt2-ops-02: a decision is confirmed in the words of what it does", () => {
  it("every decision that closes says it closes; none of them says it returns or sends back", () => {
    for (const [k, e] of Object.entries(DECISION_EFFECT)) {
      const w = DECISION_WORDS[k as keyof typeof DECISION_WORDS];
      if (e.open === 0) {
        expect(w, k).toMatch(/close/i);
        expect(w, k).not.toMatch(/return|send back|sent back/i);
      } else expect(w, k).toMatch(/send back/i);
    }
  });
  it("the route asks to confirm a reject as a reject that closes", async () => {
    const { POST } = await import("@/app/api/collector/decisions/route");
    const res = await POST(new Request("http://127.0.0.1/api/collector/decisions", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ incidentIds: ["INC-20261030-158A1B"], decision: "reject", note: "Not a real grievance." }) }) as never);
    expect(res.status).toBe(428);
    const body = await res.json() as { confirm?: { summary?: string } };
    expect(body.confirm?.summary).toBe("Reject and close (the department can no longer act on it) 1 case");
    expect(body.confirm?.summary).not.toMatch(/return/i);
  });
  it("hunt2-ops-01: a send-back (reopen) is confirmed too, in its own words", async () => {
    const { POST } = await import("@/app/api/collector/decisions/route");
    const send = (decision: string, note?: string) => POST(new Request("http://127.0.0.1/api/collector/decisions", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ incidentIds: ["INC-20261019-41B602"], decision, note }) }) as never);
    const r = await send("reopen");
    expect(r.status).toBe(428);
    expect(((await r.json()) as { confirm?: { summary?: string } }).confirm?.summary).toBe("Send back to the department 1 case");
  });
});
