// Lane D skeptic review (docs/qa/pass4/reviews/d-skeptic.md). it.fails: each is a break that is still open.
import { describe, expect, it } from "vitest";
import { isStopWord } from "@/lib/thunai/addressed";
import { turn, turnStart, type TurnEvent } from "@/lib/thunai/turn";
import { keepsSomething } from "@/components/collector/app/thunai/guards";

const SPEAKING: TurnEvent[] = [{ type: "open" }, { type: "vadStart", at: 0 }, { type: "vadEnd", at: 900, ms: 700, short: false }, { type: "ttsStart" }];
function say(word: string) {
  let m = turnStart();
  for (const e of [...SPEAKING, { type: "vadStart", at: 5000 } as TurnEvent, { type: "tick", at: 5220, heldMs: 220 } as TurnEvent, { type: "vadEnd", at: 5600, ms: 500, short: false } as TurnEvent]) m = turn(m, e).m;
  return turn(m, { type: "text", text: word, gen: m.gen });
}
describe("DSK-1 a stop word the gate knows is not a stop in the voice machine", () => {
  for (const w of ["stop it", "enough", "நிறுத்துங்க", "நிறுத்துங்கள்", "nirutha"]) {
    it(`isStopWord says "${w}" is a stop (control)`, () => expect(isStopWord(w)).toBe(true));
    it.fails(`DSK-1 "${w}" spoken while Jarvis talks cancels the turn and is not handled as a sentence`, () => {
      const r = say(w);
      expect(r.act.some((x) => x.a === "cancelTurn")).toBe(true);
      expect(r.act.some((x) => x.a === "handle")).toBe(false);
    });
  }
});
describe("DSK-2 other common stops are not stops", () => {
  for (const w of ["நிறுத்தவும்", "stop pannunga", "nirutthunga", "stop jarvis please", "போதும் நிறுத்து"]) {
    it.fails(`DSK-2 "${w}" is a stop`, () => expect(isStopWord(w)).toBe(true));
  }
});
describe("DSK-3 keep-button guard misses a bare yes with a mark on it", () => {
  for (const w of ["Yes ✓", "Yes.", "Yes!", "ஆம்!", "ஆமாம் ✓"]) it.fails(`DSK-3 "${w}" keeps something`, () => expect(keepsSomething(w, w)).toBe(true));
});

// ---- DSK-4: RC-34 says past deadline is one rule (the flag or the due time gone). Surfaces that read the raw flag still disagree. ----
import { afterAll, beforeAll, vi } from "vitest";
import "@/lib/collector/derive";
import { awsPool } from "@/lib/aws/store";
import { asOf, list } from "@/lib/collector/intel";
import { insights } from "@/lib/collector/insights";
import { incidentDetail } from "@/lib/assistant/incidents";

describe("DSK-4 one rule for past deadline", () => {
  let now = "";
  let late: { id: string; due: string }[] = [];
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-06T06:30:00.000Z") });
    awsPool();
    now = await asOf();
    for (let page = 0; page < 6; page++) {
      const l: any = await list({ period: "daily", zone: null, dept: null, sev: null, cat: null, taluk: null, place: null, status: "overdue", q: null, sort: "t", dir: -1, page, scope: "period" } as any);
      for (const r of l.rows) if (!Number(r.breached) && r.sla_due && String(r.sla_due) < now) late.push({ id: r.id, due: r.sla_due });
    }
  });
  afterAll(() => { vi.useRealTimers(); });

  it("control: the list has open incidents past their due time whose raw flag is 0", () => expect(late.length).toBeGreaterThan(0));
  it.fails("DSK-4a the briefing's follow-ups and attention items say past deadline for every incident the list calls overdue", async () => {
    const ins: any = await insights("daily", null, null, {}, null);
    const items: any[] = [...(ins.attention ?? []), ...(ins.deptActions ?? []).flatMap((d: any) => d.followUps ?? [])];
    const ids = new Set(late.map((x) => x.id));
    const wrong = items.filter((i) => ids.has(i.id) && !i.overdue);
    expect(wrong.map((i) => i.id)).toEqual([]);
  });
  it.fails("DSK-4b Ask District IQ's incident detail says the deadline was missed for an incident the list calls overdue", async () => {
    const missed: string[] = [];
    for (const x of late.slice(0, 5)) {
      const d: any = await incidentDetail(x.id);
      if (d && !d.deadlineMissed) missed.push(x.id);
    }
    expect(missed).toEqual([]);
  });
});

// ---- DSK-5: RC-32's own class guard says காலை (morning) alone is wrong for "AM" at 2 AM, but the AM phrase still uses it and the guard never checks AM. ----
import * as taDict from "@/lib/i18n/ta";
describe("DSK-5 Tamil AM", () => {
  const dict = (Object.values(taDict).find((v) => v && typeof v === "object" && "Collected today, #:# AM" in (v as object)) ?? {}) as Record<string, string>;
  it("control: the dictionary is found", () => expect(dict["Collected today, #:# AM"]).toBeTruthy());
  it.fails("DSK-5 an AM time is not called morning alone", () => {
    for (const [en, tamil] of Object.entries(dict)) if (/#:# AM\b/.test(en)) expect(tamil).not.toMatch(/காலை/);
  });
});

// ---- DSK-6: the yes to a one-tap card (Thunai.tsx, a literal inside the component, read from the source here) misses everyday yes forms. ----
import fs from "node:fs";
import path from "node:path";
describe("DSK-6 yes to a one-tap card", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../../src/components/collector/app/thunai/Thunai.tsx"), "utf8");
  const lit = /const yes = (\/\^\(yes\|ok.*?\/i)\.test\(said\)/.exec(src)?.[1];
  const yes = lit ? (0, eval)(lit) as RegExp : /$^/;
  it("control: the literal is found and takes the forms the fix names", () => {
    expect(lit).toBeTruthy();
    for (const w of ["yes", "Yes please.", "ஆமாம்", "aamam sir"]) expect(yes.test(w)).toBe(true);
  });
  for (const w of ["Yes, please.", "ஆமாங்க", "சரிங்க", "seringa", "yes do it", "ஆமாம் சார்", "ஆம் தயவுசெய்து"]) {
    it.fails(`DSK-6 "${w}" is a yes`, () => expect(yes.test(w)).toBe(true));
  }
});
