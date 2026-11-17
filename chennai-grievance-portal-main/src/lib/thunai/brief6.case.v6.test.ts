/**
 * v6 Phase 3, the incident briefing on the real case screen (screens.ts caseDetail, fake store). From the independent check, 17 Nov:
 *  - the store's tool hands report times as readable text ("17 Nov 2026, 12:20 AM", tools.ts readableTime): the briefing must read them,
 *    or the outlet's "when" and "nothing new since" are never said (0 of 34 in the briefing set);
 *  - "who is on it" is the record's own assignment (`assigned.designation`), never the department's directory of contacts (`officials`).
 */
import { describe, expect, it } from "vitest";
import { timeOf } from "./brief6";
import { WORLD } from "./fixture";
import { ZONE_TA_NAME } from "./lexicon";
import { buildScreen, emptySlots } from "./screens";
import { fakeHands } from "./stagefake";
import { referenceWorld } from "./world";

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** a time as tools.ts readableTime writes it (IST) */
const readable = (ms: number) => { const d = new Date(ms + 5.5 * 3_600_000); const h = d.getUTCHours(); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const ist = (ms: number) => new Date(ms + 5.5 * 3_600_000).toISOString().slice(0, 19).replace("T", " ");
const SCOPE = { period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null } as const;

async function briefed(o: { reportAt: number; assigned: { designation: string } | null; since: number }) {
  const hands = fakeHands({
    incident_detail: (a) => ({ ok: true, data: {
      incident: { id: a.id, title: "Waterlogging on Velachery Main Road", sev: "Severe", status: "Open", open: 1, zone: 13, zone_name: "Adyar", dept: "GCC-SWD", dept_name: "Storm Water Drains",
        cat: "FLOOD_WATERLOGGING", place: "Velachery", t: ist(o.since), sla_due: ist(o.since + 6 * 3_600_000), open_for: "16 hours", why: { what: [], why: [], next: null } },
      reports: [{ t: readable(o.reportAt), source: "news", what: "News report", title: "Velachery under water", publisher: "The Hindu" }],
      officials: [{ name: "A. Directory", designation: "Superintending Engineer" }],
      assigned: o.assigned
    }, facts: [], sources: [] })
  });
  const b = await buildScreen("case", { ...emptySlots(), id: "INC-W1" }, SCOPE, world, hands, "explain this");
  return b.doc.say.en;
}

describe("the case screen's briefing reads the record as the store's tools hand it", () => {
  it("timeOf reads tools.ts's readable times as IST", () => {
    expect(timeOf("17 Nov 2026, 12:20 AM")).toBe(Date.UTC(2026, 10, 16, 18, 50));
    expect(timeOf("2 Oct 2026, 7:40 PM")).toBe(Date.UTC(2026, 9, 2, 14, 10));
    expect(timeOf("17 Nov 2026, 12:05 PM")).toBe(Date.UTC(2026, 10, 17, 6, 35));
    expect(timeOf("17 Nov 2026")).toBe(Date.UTC(2026, 10, 16, 18, 30));
  });
  it("the outlet's report is said with when it came out; nothing new for days is said", async () => {
    const now = Date.now();
    const say = await briefed({ reportAt: now - 3 * 86_400_000, assigned: null, since: now - 4 * 86_400_000 });
    expect(say).toMatch(/The Hindu reported it (on [A-Z][a-z]+day|about|a couple)/);
    expect(say).toMatch(/Nothing new has come in/);
  });
  it("an officer is said only from the record's assignment, never from the directory of contacts", async () => {
    const now = Date.now();
    expect(await briefed({ reportAt: now - 3_600_000, assigned: null, since: now - 20 * 3_600_000 })).toMatch(/no officer is named/);
    expect(await briefed({ reportAt: now - 3_600_000, assigned: null, since: now - 20 * 3_600_000 })).not.toMatch(/superintending/i);
    expect(await briefed({ reportAt: now - 3_600_000, assigned: { designation: "Assistant Engineer" }, since: now - 20 * 3_600_000 })).toMatch(/with the assistant engineer on it/);
  });
});
