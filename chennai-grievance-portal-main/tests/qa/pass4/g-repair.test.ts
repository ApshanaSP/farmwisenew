// QA pass 4, g-repair: tests for what the reviewer (g-review.md) and the skeptics found after the G1, G2, U1 and U2 fixes, on the real path:
// the pinned snapshot, a frozen clock (2026-11-06 12:00 IST), no model key. Jarvis through grader/client-sim.ts (the browser's own order of lanes, the real planRound).
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/g-repair.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { asOf } from "@/lib/collector/intel";
import { clearCaches } from "@/lib/thunai/round";
import { ask } from "@/lib/assistant/pipeline";
import { browserWorld, ClientSim } from "./grader/client-sim";

const NOW = new Date("2026-11-06T06:30:00.000Z");
let w: Awaited<ReturnType<typeof browserWorld>>;
beforeAll(async () => { vi.useFakeTimers({ toFake: ["Date"], now: NOW }); clearCaches(); await asOf(); w = await browserWorld(); }, 300_000);
afterAll(() => { vi.useRealTimers(); });

async function talk(...said: string[]) {
  vi.setSystemTime(NOW);
  clearCaches();
  const sim = new ClientSim(w.world, {}, w.list);
  const outs = [];
  for (const s of said) outs.push(await sim.handle(s));
  return { sim, outs };
}

const askChat = async (message: string) => (await ask({ user: "qa.grepair@example.test", sessionId: null, message, inputMode: "text", language: "auto",
  scope: { period: "weekly", zone: null, dept: null, cat: null, taluk: null } as never, replyTo: null, pinId: null, insightKey: null, lockDept: null, stage: () => undefined } as never)).card;

describe("a month said after 'by' in the past is not a forecast", () => {
  it("'how many complaints were filed by October' is counted, while 'by december how many complaints will there be' is refused", async () => {
    const past = await askChat("how many complaints were filed by october");
    expect(past.kind, past.headline).toBe("answer");
    expect((await askChat("by december how many complaints will there be")).kind).toBe("refusal");
  });
});

describe("g-review 5: a share counts incidents and says incidents", () => {
  it("'what percentage of complaints are resolved' is a share of incidents, in the headline and the answer", async () => {
    const c = await askChat("what percentage of complaints are resolved");
    expect(c.kind).toBe("answer");
    expect(c.headline).toMatch(/^\d[\d.,]*% of incidents are resolved/);
    expect(c.headline).not.toMatch(/complaint/i);
    expect(c.answerMarkdown).toMatch(/of the incidents reported/);
  });
  it("a share of a topic keeps the topic and says incidents ('what share of road complaints are overdue')", async () => {
    const c = await askChat("what share of road complaints are overdue");
    expect(c.headline).not.toMatch(/complaint/i);
    expect(c.headline).toMatch(/incident/);
  });
});

describe("g-review 4: a status said in the sentence is applied by the lane that reads it", () => {
  it("'open' as a status ('open cases in Adyar', 'cases open now') is not the verb of a follow-up, so the fast lane answers with the status in the slots", async () => {
    for (const p of ["show open cases in Adyar", "Drainage cases open in Kodambakkam", "complaints that are open in Adyar"]) {
      const { outs } = await talk(p);
      expect(String(outs[0].stage?.slots?.status ?? ""), `${p}: ${outs[0].said}`).toBe("open");
    }
  });
  it("'open the first case' and 'open 3' are still the verb (a follow-up on the open screen, not a status)", async () => {
    for (const p of ["open the first case", "open 3"]) {
      const { outs } = await talk(p);
      expect(String(outs[0].stage?.slots?.status ?? ""), `${p}: ${outs[0].said}`).not.toBe("open");
    }
  });
});

describe("the fast lane answers a sentence in the three languages alike once 'open' is a status (metamorphic parity)", () => {
  it("a ranking of open cases is by open cases, and a count said in words is the count: top three is 3 rows, top 3 is 3 rows", async () => {
    const rows = async (p: string) => { const { outs } = await talk(p); return { measure: String((outs[0].stage?.slots as { measure?: string } | undefined)?.measure ?? ""), n: Number((outs[0].stage?.slots as { n?: number } | undefined)?.n ?? 0), blocks: outs[0].stage?.blocks.find((b) => b.kind === "Ranking") as { items: unknown[] } | undefined }; };
    for (const p of ["top three zones by open complaints", "top 3 zones by open complaints", "திறந்த புகார்கள் அதிகம் உள்ள முதல் மூன்று மண்டலங்கள்"]) {
      const r = await rows(p);
      expect(r.measure, p).toBe("zone_open");
      expect(r.n, p).toBe(3);
      expect(r.blocks?.items.length, p).toBe(3);
    }
    expect((await rows("Top five zones by open cases")).n).toBe(5);
  });
  it("Tanglish 'complaints open irukku' is the status open, as 'open complaints' is", async () => {
    for (const p of ["Ambattur la evlo complaints open irukku", "Adyar zone la evlo severe complaints open irukku", "inniki evlo complaints open irukku"]) {
      const { outs } = await talk(p);
      expect(String(outs[0].stage?.slots?.status ?? ""), `${p}: ${outs[0].said}`).toBe("open");
    }
  });
  it("yesterday with two kinds of complaint of equal weight is asked about, and the question says the kind was not read", async () => {
    const { outs } = await talk("nethu Adyar la fire accident enna aachu");
    expect(outs[0].kind).toBe("clarify");
    expect(outs[0].steps).toEqual([]);
    expect(outs[0].said).toMatch(/yesterday|நேற்று/i);
    expect(outs[0].said).toMatch(/kind of complaint|வகைப் புகார்/);
  });
});

describe("g-review 3: a status or a window that is read is applied, or the sentence is handed on, never dropped", () => {
  // The rules lane has a view step and a period step and no status step, so a sentence with a status and a window is not answered by either alone.
  it("a status beside a window ('last month resolved cases', 'pona vaaram overdue cases', Tamil too) is not turned into the window alone", async () => {
    for (const p of ["last month resolved cases", "pona maasam resolved cases", "pona vaaram overdue cases", "கடந்த வாரம் தாமதமான புகார்கள்", "கடந்த மாதம் தீர்க்கப்பட்ட புகார்கள்", "last week overdue cases"]) {
      const { outs } = await talk(p);
      const o = outs[0];
      expect(o.steps.filter((s) => s.a === "period" || s.a === "view"), `${p}: ${JSON.stringify(o.steps)} said ${o.said}`).toEqual([]);
    }
  });
  it("a count of days the console does not hold ('last 3 days', 'last 14 days') is not answered as today", async () => {
    for (const p of ["severe cases in the last 3 days", "severe cases in the last 14 days", "overdue cases in the last 2 days"]) {
      const { outs } = await talk(p);
      const o = outs[0];
      expect(o.kind, `${p}: ${o.said}`).not.toBe("do");
      expect(o.said, p).not.toMatch(/\btoday\b/i);
    }
  });
  it("a window the console holds still sets it, with the status kept in the slots", async () => {
    const { outs } = await talk("show overdue cases in the last 7 days");
    const o = outs[0];
    expect(String(o.stage?.slots?.period ?? ""), o.said).toBe("weekly");
    expect(String(o.stage?.slots?.status ?? ""), o.said).toBe("overdue");
  });
});
