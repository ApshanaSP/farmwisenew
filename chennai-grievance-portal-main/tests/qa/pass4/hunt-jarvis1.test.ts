// QA pass 4, hunter jarvis1: Jarvis understanding, multi-turn state, tray, saving, memory (English, Tamil, Tanglish).
// Real path with no model (client-sim.ts). Each bug is it.fails so the suite stays green; the fixer changes it to it.
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/hunt-jarvis1.test.ts
import { beforeAll, describe, expect, it, vi } from "vitest";
import { clearCaches } from "@/lib/thunai/round";
import { localStageCommand } from "@/lib/thunai/stagelocal";
import { browserWorld, ClientSim, type Outcome } from "./grader/client-sim";

const FROZEN = "2026-11-06T06:30:00.000Z";
let w: Awaited<ReturnType<typeof browserWorld>>;
async function talk(...said: string[]): Promise<{ sim: ClientSim; outs: Outcome[] }> {
  vi.setSystemTime(new Date(FROZEN));
  clearCaches();
  const sim = new ClientSim(w.world, {}, w.list);
  const outs: Outcome[] = [];
  for (const s of said) outs.push(await sim.handle(s));
  return { sim, outs };
}

describe("QA pass 4 hunt jarvis1", () => {
  beforeAll(async () => { vi.useFakeTimers({ toFake: ["Date"], now: new Date(FROZEN) }); w = await browserWorld(); }, 300_000);

  it("JARVIS1-1 Tamil 'தீவிர' (severe) is not read as 'தீ' (fire): Adyar severe cases in Tamil match the English answer", async () => {
    const en = (await talk("show severe complaints in Adyar")).outs[0];
    const ta = await talk("அடையாறு தீவிர புகார்கள் காட்டு");
    expect(ta.outs[0].stage?.slots).toMatchObject({ cat: null, sev: "Severe", zones: [13] });
    expect(ta.outs[0].said).not.toMatch(/இல்லை/); // English finds 1 severe case today; Tamil says none
    expect(en.said).toMatch(/^1 severe case/);
  });

  it.fails("JARVIS1-2 'draft the second and third' drafts two cases, not one", async () => {
    const { outs } = await talk("show severe complaints", "draft the second and third");
    expect(outs[1].drafted).toHaveLength(2);
    expect(localStageCommand("draft the second and third")).not.toMatchObject({ op: "draft", n: 2, first: false });
  });

  it.fails("JARVIS1-3 'draft 1 and 3' drafts cases 1 and 3 (it drafts only case 1 and says '1 draft ready')", async () => {
    const { outs } = await talk("show severe complaints", "draft 1 and 3");
    expect(outs[1].drafted).toHaveLength(2);
  });

  it.fails("JARVIS1-4 Tanglish 'second one open pannu' opens the second case, not the first", () => {
    expect(localStageCommand("second one open pannu")).toEqual({ op: "open", n: 2 });
    expect(localStageCommand("first one open pannu")).toEqual({ op: "open", n: 1 });
  });

  it("JARVIS1-5 'remind me in 2 hours to check lakes' sets a reminder, not a lake readings screen", async () => {
    const { outs } = await talk("remind me in 2 hours to check lakes");
    expect(outs[0].stage?.recipe).not.toBe("readings");
    expect(outs[0].options.length + (outs[0].kind === "clarify" ? 1 : 0)).toBeGreaterThan(0);
  });

  it.fails("JARVIS1-6 the reminder card shows a time a person can read, not a raw UTC string", async () => {
    const { outs } = await talk("remind me at 5 pm to call the zone officer");
    expect(outs[0].said).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
  });

  it.fails("JARVIS1-7 saying 'yes' to forget in Tamil gives a whole sentence, not the fragment 'மற'", async () => {
    const { outs } = await talk("மறந்துவிடு", "ஆம்");
    expect(outs[1].said.length).toBeGreaterThan(6);
  });

  it.fails("JARVIS1-8 'close all severe complaints' says it cannot close, instead of quietly filtering and saying 'Severe'", async () => {
    const { outs } = await talk("close all severe complaints");
    expect(outs[0].said.trim()).not.toBe("Severe");
    expect(outs[0].kind === "refuse" || /clos/i.test(outs[0].said)).toBe(true);
  });

  it("JARVIS1-9 'remember I watch Adyar' in Tamil and Tanglish asks to remember, it does not switch the console to Adyar", async () => {
    for (const s of ["நினைவில் வை நான் அடையாறு பார்ப்பேன்", "ennai nyabagam vechuko adyar thaan en zone"]) {
      const { sim, outs } = await talk(s);
      expect(sim.zone, s).toBeNull();
      expect(outs[0].steps.some((x) => x.a === "view"), s).toBe(false);
    }
  });

  it.fails("JARVIS1-10 'open the 20th one' with 8 cases says there is no such case, instead of opening the last", async () => {
    const { sim, outs } = await talk("show severe complaints", "open the 20th one");
    expect(sim.list.length).toBeLessThan(20);
    expect(sim.incident).toBeNull();
    expect(outs[1].said).toMatch(/no such|only|8/i);
  });

  it.fails("JARVIS1-11 'top zones by open complaints' (no model) does not open a single incident", async () => {
    const { sim } = await talk("top zones by open complaints");
    expect(sim.incident).toBeNull();
  });
  it.fails("JARVIS1-12 'save this screen as morning check' saves it as 'morning check' (the rules name it 'screen as morning check'; plain 'save this screen' is named 'screen')", async () => {
    const a = await talk("save this screen as morning check");
    const b = await talk("save this screen");
    const name = (x: { sim: ClientSim }) => (x.sim.pendingB?.steps.find((t) => t.a === "workspace") as { name?: string } | undefined)?.name ?? "";
    expect(name(a)).toBe("morning check");
    expect(name(b)).not.toBe("screen");
  });
});
