// RC-42 on the real snapshot, through the browser's real path (grader/client-sim.ts), no model: the Stage's own commands in
// English, Tamil script and Tanglish open the case that was meant, draft every case named, and say plainly when there is no such case.
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/rc42-stage-lane.test.ts
import { beforeAll, describe, expect, it, vi } from "vitest";
import { clearCaches } from "@/lib/thunai/round";
import { browserWorld, ClientSim } from "./grader/client-sim";

let w: Awaited<ReturnType<typeof browserWorld>>;
async function talk(...said: string[]) {
  vi.setSystemTime(new Date("2026-11-06T06:30:00.000Z"));
  clearCaches();
  const sim = new ClientSim(w.world, {}, w.list);
  const outs = [];
  for (const s of said) outs.push(await sim.handle(s));
  return { sim, outs };
}
const rows = (sim: ClientSim) => (sim.doc?.blocks ?? []).flatMap((b) => (b.kind === "CaseList" ? b.rows : []));

describe("RC-42 on the real snapshot", () => {
  beforeAll(async () => { vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-06T06:30:00.000Z") }); w = await browserWorld(); }, 300_000);

  const OPEN2 = { en: "open the second one", ta: "இரண்டாவது கேஸைத் திற", tg: "second one open pannu" };
  for (const [lang, phrase] of Object.entries(OPEN2)) {
    it(`${lang}: "${phrase}" opens the second case of the list, through the stage lane`, async () => {
      const first = await talk("show severe complaints");
      const want = rows(first.sim)[1].id;
      const { sim, outs } = await talk("show severe complaints", phrase);
      expect(outs[1].path).toContain("stage-local");
      expect(sim.doc?.recipe).toBe("case");
      expect(JSON.stringify(sim.doc?.blocks)).toContain(want);
    });
  }
  const DRAFT13 = { en: "draft 1 and 3", ta: "1 மற்றும் 3 வரைவு செய்", tg: "1 and 3 draft pannu" };
  for (const [lang, phrase] of Object.entries(DRAFT13)) {
    it(`${lang}: "${phrase}" drafts cases 1 and 3`, async () => {
      const { outs } = await talk("show severe complaints", phrase);
      expect(outs[1].path).toContain("stage-local");
      expect(outs[1].drafted).toHaveLength(2);
    });
  }
  const FAR = { en: "open the 20th one", ta: "இருபதாவது திற", tg: "20 open pannu" };
  for (const [lang, phrase] of Object.entries(FAR)) {
    it(`${lang}: "${phrase}" never opens a case that is not there`, async () => {
      const { sim, outs } = await talk("show severe complaints", phrase);
      expect(sim.doc?.recipe).not.toBe("case");
      expect(sim.incident).toBeNull();
      expect(outs[1].kind === "clarify" || /only|இல்லை|மட்டுமே|no such/i.test(outs[1].said) || outs[1].path.includes("agent")).toBe(true);
    });
  }
});
