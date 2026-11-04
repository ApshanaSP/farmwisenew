import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { referenceWorld } from "./world";
import { ZONE_TA_NAME } from "./lexicon";
import { asksBrief, resolveEntity } from "./entities";

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const who = (s: string) => { const r = resolveEntity(s, world); return r.kind === "entity" ? r.entity.id : r.kind; };

// the dev set (section 6 of the QA brief): never the frozen held-out sentences
const POLICE = ["chennai city police report", "greater chennai police report", "GCP report", "city police report", "madras police report", "police commissioner report",
  "what does the chennai police report say", "give me a brief on city police", "grater chennai police report", "chennai city polis report", "chennai police report enna",
  "city police report sollu", "சென்னை போலீஸ் ரிப்போர்ட்", "சென்னை காவல்துறை அறிக்கை", "கிரேட்டர் சென்னை போலீஸ் ரிப்போர்ட்"];
const NOT_POLICE = ["Coimbatore city police report", "Tambaram police report", "Avadi police report", "chennai corporation report", "chennai city traffic report", "Mumbai police report"];

describe("the entity resolver", () => {
  it.each(POLICE)("%s -> Greater Chennai Police, asked as a brief", (s) => {
    expect(who(s)).toBe("POL-GCP");
    expect(asksBrief(s)).toBe(true);
  });
  it.each(NOT_POLICE)("%s is never Greater Chennai Police", (s) => {
    expect(who(s)).not.toBe("POL-GCP");
  });
  it("other cities' and commissionerates' police are unknown, said as such", () => {
    for (const s of ["Coimbatore city police report", "Tambaram police report", "Avadi police report", "Mumbai police report"]) expect(resolveEntity(s, world).kind).toBe("unknown");
  });
  it("the corporation is the corporation", () => expect(who("chennai corporation report")).toBe("GCC"));
  it("a made-up agency is unknown, not forced", () => {
    expect(resolveEntity("Zorblax agency report", world).kind).toBe("unknown");
    expect(resolveEntity("what's the status of the Vellore water authority", world).kind).toBe("unknown");
  });
  it("a place of ours in front of the police is police in that place, not another body", () => expect(who("Adyar police report")).toBe("POL-GCP"));
  it("plain questions with no body in them resolve to nothing", () => {
    expect(resolveEntity("show me the severe cases", world).kind).toBe("none");
    expect(asksBrief("show me the severe cases")).toBe(false);
  });
  it("a request word alone is a brief, a topic list is not", () => {
    for (const s of ["metrowater status", "how is PWD doing", "what's happening with the corporation", "update on storm water drain"]) expect(asksBrief(s)).toBe(true);
    expect(asksBrief("garbage complaints in Adyar")).toBe(false);
  });
  it("runs in process inside 20 ms at p95", () => {
    const ms: number[] = [];
    for (let i = 0; i < 200; i++) { const s = [...POLICE, ...NOT_POLICE][i % 21]; const t = performance.now(); resolveEntity(s, world); ms.push(performance.now() - t); }
    ms.sort((a, b) => a - b);
    expect(ms[Math.floor(ms.length * 0.95)]).toBeLessThan(20);
  });
});

describe("the console's instant rules never filter to our police for someone else's", () => {
  it.each(["filter Mumbai police", "show only Tambaram police", "filter Coimbatore police complaints"])("%s", async (s) => {
    const { understand } = await import("./understand");
    const { START } = await import("./fixture");
    const r = understand(s, START, world, { speechConf: 0.95 });
    const depts = r.kind === "do" ? r.steps.filter((x) => x.a === "view").map((x) => (x as { view: { dept?: string | null } }).view.dept).filter(Boolean) : [];
    expect(depts).not.toContain("POL-GCP");
  });
  it("our own police still filter", async () => {
    const { understand } = await import("./understand");
    const { START } = await import("./fixture");
    const r = understand("filter police complaints", START, world, { speechConf: 0.95 });
    expect(r.kind === "do" && r.steps.some((x) => x.a === "view" && (x as { view: { dept?: string | null } }).view.dept === "POL-GCP")).toBe(true);
  });
});
