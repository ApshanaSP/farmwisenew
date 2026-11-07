// QA pass 4, lane a skeptic: breaks of the lane a fixes, on the real path (planRound with the real store, no model). Each is it.fails until fixed.
import { describe, expect, it, vi } from "vitest";
import { clearCaches } from "@/lib/thunai/round";
import { browserWorld, ClientSim, runConversation } from "./grader/client-sim";

const FROZEN = "2026-11-06T06:30:00.000Z";
async function ask(text: string) {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(FROZEN) });
  try {
    const env = await browserWorld();
    clearCaches();
    const o = (await runConversation(new ClientSim(env.world, {}, env.list), [], text)).last;
    return { lane: o.lane, said: String(o.said), recipe: (o.stage as any)?.recipe as string | undefined, slots: ((o.stage as any)?.slots ?? {}) as Record<string, unknown> };
  } finally { vi.useRealTimers(); }
}

describe("lane a skeptic", () => {
  it.fails("SK-1 overdue cases in one zone: the overdue filter is read from one page, so a zone with 3 overdue severe cases says none", async () => {
    const sev = await ask("overdue severe cases in Tondiarpet");
    expect(sev.said).toMatch(/3 are past their deadline/);
    const all = await ask("overdue cases in Tondiarpet");
    expect(all.said).not.toMatch(/no cases/i);
  }, 120_000);
  it.fails("SK-2 'overdue cases this week' with no zone says there are none while Manali alone has 4", async () => {
    expect((await ask("overdue cases this week")).said).not.toMatch(/no cases/i);
  }, 120_000);
  it.fails("SK-3 'resolved cases' / 'closed cases' is answered with all cases, the status word is dropped", async () => {
    for (const t of ["resolved cases this week", "closed cases in Adyar"]) {
      const r = await ask(t);
      expect(r.lane === "quick" && r.recipe === "cases" && !r.slots.status, t).toBe(false);
    }
  }, 120_000);
  it.fails("SK-4 Tamil 'unresolved complaints' drops the status and says nothing is missing from the rows (recipe complete)", async () => {
    for (const t of ["தீர்க்கப்படாத புகார்கள்", "தீர்க்கப்படாத புகார்கள் அடையாறில்"]) {
      const r = await ask(t);
      expect(r.recipe === "complete" && !r.slots.status, t).toBe(false);
    }
  }, 120_000);
  it.fails("SK-5 windows not held are shown as the last 7 days: 'cases next week', 'two weeks ago' in Tamil, and 'a month ago' as the last 30 days", async () => {
    expect((await ask("cases next week")).said).not.toMatch(/last 7 days/i);
    expect((await ask("இரண்டு வாரம் முன்பு புகார்கள்")).said).not.toMatch(/கடந்த 7/);
    const m = await ask("cases a month ago");
    expect(m.lane === "quick" && m.slots.period === "monthly").toBe(false);
  }, 120_000);
  it.fails("SK-6 'open cases in Adyar' goes to the zone page and the open filter is dropped without a word", async () => {
    const r = await ask("open cases in Adyar");
    expect(r.lane).not.toBe("rules-instant");
  }, 120_000);
});
