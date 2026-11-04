/**
 * Ask the Map's follow-ups on the frozen store (npm run eval:golden): every question offered under an answer is asked
 * the way the panel asks it (as the next turn of the conversation), and must come back as an answer with rows, an area
 * brief, or Send to department; never "I could not read that". Also: they are made from the answer (a named place or
 * department), and an officer is never offered Send to department. No AI (AI_PROVIDER=none): the rules answer.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { haveStore, loadFrozen } from "@/lib/assistant/__tests__/golden/harness";
import type { AskResponse } from "./ask";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/ai/gateway", async (orig) => {
  const m = await orig<typeof import("@/lib/ai/gateway")>();
  return { ...m, aiStatus: () => ({ available: false, problem: null, providers: [], stt: "" }), generateJson: async () => { throw new m.AiUnavailableError(); } };
});

const COLLECTOR = { email: "golden@test", role: "collector" as const, lockDept: null };
const OFFICER = { email: "officer@test", role: "department_officer" as const, lockDept: "GCC-SWD" };
const CTX = { zone: null, taluk: null, incidentId: null, drawn: null, ward: null };
let askMap: typeof import("./ask").askMap;

beforeAll(async () => {
  if (!haveStore()) return;
  const f = await loadFrozen();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(f.frozenAt);
  askMap = (await import("./ask")).askMap;
}, 300_000);

const QUESTIONS = [
  "open flooding within 500 m of hospitals", "severe cases this week", "where are garbage complaints clustering", "streetlight complaints by ward",
  "road accidents within 1 km of schools", "what is happening in Teynampet", "compare Adyar and Velachery flooding", "garbage complaints this month",
  "அடையாறு அருகே திறந்த புகார்கள்", "schools in Valasaravakkam"
];

const ok = (r: AskResponse) => (r.kind === "answer" && (r.total > 0 || r.context.points.length > 0 || !!r.extra.areas?.length)) || r.kind === "brief" || (r.kind === "ui" && r.ui === "send");

describe.skipIf(!haveStore())("Ask the Map follow-ups", () => {
  for (const q of QUESTIONS) {
    it(`every follow-up of "${q}" gets an answer`, async () => {
      const a = await askMap({ text: q, plan: null, prev: null, context: CTX, user: COLLECTOR });
      expect(a.kind === "answer" || a.kind === "brief").toBe(true);
      expect(a.followups.length).toBeGreaterThan(0);
      expect(a.followups.length).toBeLessThanOrEqual(4);
      for (const f of a.followups) {
        const b = await askMap({ text: f, plan: null, prev: a.plan, context: CTX, user: COLLECTOR });
        expect(ok(b), `"${f}" after "${q}" came back as ${b.kind}${b.say ? `: ${b.say.en}` : ""}`).toBe(true);
      }
    });
  }

  it("names what the answer is about, not only generic edits", async () => {
    const a = await askMap({ text: "open flooding within 500 m of hospitals", plan: null, prev: null, context: CTX, user: COLLECTOR });
    expect(a.followups.some((f) => /^(What is happening|Send these to|Compare with)/.test(f))).toBe(true);
  });

  it("an officer is never offered Send to department", async () => {
    const a = await askMap({ text: "open flooding this month", plan: null, prev: null, context: CTX, user: OFFICER });
    expect(a.followups.some((f) => /^Send these/.test(f))).toBe(false);
  });
});
