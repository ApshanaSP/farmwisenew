// QA pass 7, collector-ops: calling the Collector's decisions route in-process as the Collector, with the confirm step granted.
// The route's own code runs (validation, double-click rule, insert, audit, syncComplaints); only the session and the password step are stubbed.
import { vi } from "vitest";

export const COLLECTOR = { userId: 990001, email: "qa-p7-collector@example.test", role: "collector", tv: 0 };

vi.mock("@/lib/collector/guard", async (orig) => ({ ...(await orig<object>()), collectorSession: async () => COLLECTOR }));
vi.mock("@/lib/security/stepup", async (orig) => ({ ...(await orig<object>()), requireConfirm: async () => ({ ok: true, grant: null }) }));

export async function decide(incidentIds: string[], decision: string, note?: string) {
  const { POST } = await import("@/app/api/collector/decisions/route");
  const req = new Request("http://127.0.0.1/api/collector/decisions", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ incidentIds, decision, note }) });
  const res = await POST(req as never);
  return { status: res.status, body: await res.json().catch(() => null) as Record<string, unknown> | null };
}
