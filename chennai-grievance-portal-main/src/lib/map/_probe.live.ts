import { it, vi } from "vitest";
import { haveStore, loadFrozen } from "@/lib/assistant/__tests__/golden/harness";
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
it.runIf(haveStore())("probe", async () => {
  await loadFrozen();
  const { askMap } = await import("./ask");
  for (const q of (process.env.PROBE ?? "").split("|")) {
    const r = await askMap({ text: q, plan: null, prev: null, context: { zone: null, taluk: null, incidentId: null, drawn: null, ward: null }, user: { email: "probe@map", role: "collector", lockDept: null }, reword: false });
    console.log("PROBE", q, "=>", r.kind, r.ai_used, (r.answer?.headline ?? r.say?.en ?? "").slice(0, 100));
  }
}, 600000);
