import { beforeEach, describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { referenceWorld } from "./world";
import { ZONE_TA_NAME } from "./lexicon";
import { clearCaches, planRound, RoundBody } from "./round";
import { fakeHands } from "./stagefake";

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
// no model can answer: whatever happens here happens in code
const noModel = { generate: async () => { throw new Error("no model in this test"); } } as never;
const turn = async (text: string) => {
  const body = RoundBody.parse({ turnId: `t-${Math.random()}`, round: 0, text, turns: [], lastText: null, stage: null, direct: null,
    state: { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 3, lastPlace: null, numbers: false } });
  return (await planRound(body, world, fakeHands(), "test", { notes: [], habits: {} }, undefined, { llm: noModel })).result!;
};

const POLICE = ["chennai city police report", "greater chennai police report", "GCP report", "city police report", "madras police report", "police commissioner report",
  "what does the chennai police report say", "give me a brief on city police", "grater chennai police report", "chennai city polis report", "chennai police report enna",
  "city police report sollu", "சென்னை போலீஸ் ரிப்போர்ட்", "சென்னை காவல்துறை அறிக்கை", "கிரேட்டர் சென்னை போலீஸ் ரிப்போர்ட்"];

describe("a brief on a named body, decided in code", () => {
  beforeEach(() => clearCaches());
  it.each(POLICE)("%s -> a Greater Chennai Police brief, honest about its records", async (s) => {
    const r = await turn(s);
    expect(r.kind).toBe("do");
    expect(r.stage?.recipe).toBe("brief");
    expect(r.stage?.slots.dept).toBe("POL-GCP");
    const say = r.stage!.say.en;
    expect(say).toMatch(/Greater Chennai Police/);
    expect(say).toMatch(/not an official police report/);
    // a brief, not a list of records: no ids, no field names
    expect(say).not.toMatch(/INC-|dept_id|created_at|POL-GCP/);
  });
  it("the same answer, whichever way the police were named", async () => {
    const figures = new Set<string>();
    for (const s of POLICE) { const r = await turn(s); figures.add(JSON.stringify(r.stage?.blocks.find((b) => b.kind === "Kpis"))); }
    expect(figures.size).toBe(1);
  });
  it("says what it took the words to mean when they were not the name", async () => {
    expect((await turn("madras police report")).stage!.say.en).toMatch(/^Taking that as Greater Chennai Police\./);
    expect((await turn("greater chennai police report")).stage!.say.en).not.toMatch(/Taking that as/);
  });
  it.each(["Coimbatore city police report", "Tambaram police report", "Avadi police report", "Mumbai police report", "Zorblax agency report"])("%s -> an honest 'no data', no screen", async (s) => {
    const r = await turn(s);
    expect(r.stage).toBeNull();
    expect(r.note).toBe("unknown-entity");
    expect(r.reply).toMatch(/^I have no data on /);
  });
  it("the corporation is briefed across its own departments", async () => {
    const r = await turn("chennai corporation report");
    expect(r.stage?.recipe).toBe("brief");
    expect(r.stage?.slots.org).toBe("GCC");
    expect(r.stage?.slots.dept ?? null).toBeNull();
  });
  it("a traffic report is not a police brief", async () => {
    const r = await turn("chennai city traffic report");
    expect(r.stage?.slots.dept ?? null).not.toBe("POL-GCP");
  });
});
