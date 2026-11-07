// QA pass 4, lane b skeptic: breaks of the RC-08 fix (ef189f1), on the real snapshot and the real round, no model key.
// Each test states what must hold; it.fails keeps the suite green while the break is open. The fixer changes it.fails to it.
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/skeptic-b.test.ts
import { describe, expect, it } from "vitest";
import { serverHands } from "@/lib/thunai/data";
import { serverWorld } from "@/lib/thunai/world";
import { planRound, RoundBody } from "@/lib/thunai/round";

const USER = "qa.skeptic.b@example.test";
const state = () => ({ page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 3, lastPlace: null, numbers: false });
let turn = 0;
const noModel = { generate: async () => { throw new Error("no model"); } } as never;
async function direct(recipe: string, slots: Record<string, unknown>) {
  const body = RoundBody.parse({ turnId: `skb-${++turn}`, round: 0, text: "show", turns: [], lastText: null, stage: null, direct: { recipe, slots, lang: "en" }, state: state() });
  const r = await planRound(body, await serverWorld(), serverHands({ email: USER, role: "collector", lockDept: null }), USER, { notes: [], habits: {} }, undefined, { llm: noModel });
  return (r.result as any).stage;
}

describe("skeptic b: RC-08 mixes groups and incidents", () => {
  // log: "14 severe cases the last 30 days; ... 15 are past their deadline" (q tree, Severe, monthly); also flood 33/35, water 36/38.
  // The headline counts the list's rows (groups of one problem), the past-deadline figure counts incidents, so the part is larger than the whole.
  it.fails("an open list never says more cases are past their deadline than it has cases", async () => {
    const st = await direct("cases", { status: "open", sev: "Severe", q: "tree", period: "monthly" });
    const total = st.blocks.find((b: any) => b.kind === "CaseList").total as number;
    const late = st.blocks.find((b: any) => b.kind === "Kpis").items.find((i: any) => i.key === "late").value as number;
    expect(late, st.say.en).toBeLessThanOrEqual(total);
  });
  // log: cases overdue weekly says "325 are past their deadline"; advise, same scope, says "283 open cases are past their deadline" (283 is the group count, 325 the incidents)
  it.fails("advise and the overdue list give the same past-deadline figure for the same scope", async () => {
    const cases = await direct("cases", { status: "overdue", period: "weekly" });
    const advise = await direct("advise", { period: "weekly" });
    const listed = cases.blocks.find((b: any) => b.kind === "CaseList").total as number;
    const m = /(\d+) open cases are past their deadline/.exec(JSON.stringify(advise.say.en));
    expect(m, advise.say.en).toBeTruthy();
    expect(Number(m![1])).toBe(listed);
  });
});
