/**
 * Ask the Map v2 on the frozen store (npm run eval:golden): the ward scorecard, Play the period and the printable brief, each checked
 * against counts written here from the raw incident rows (plain loops; no code shared with the executor or the brief).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { haveStore, holder, loadFrozen } from "@/lib/assistant/__tests__/golden/harness";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/ai/gateway", async (orig) => {
  const m = await orig<typeof import("@/lib/ai/gateway")>();
  return { ...m, aiStatus: () => ({ available: false, problem: null, providers: [], stt: "" }), generateJson: async () => { throw new m.AiUnavailableError(); } };
});

const COLLECTOR = { email: "golden@test", role: "collector" as const, lockDept: null };
const CTX = { zone: null, taluk: null, incidentId: null, drawn: null, ward: null };
let askMap: typeof import("./ask").askMap;
let rows: Record<string, any>[] = [];
const run = (sql: string) => holder.pool.query(sql).then(([r]: [Record<string, any>[]]) => r);

beforeAll(async () => {
  if (!haveStore()) return;
  const f = await loadFrozen();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(f.frozenAt);
  askMap = (await import("./ask")).askMap;
  const { ops } = await import("@/lib/collector/db");
  rows = await run(`SELECT incident_id, ward_no, is_open, DATE_FORMAT(first_reported_at, '%Y-%m-%d %H:%i:%s') AS first FROM incidents`);
  const dec = await run(`SELECT incident_id, decision FROM ${ops("collector_decisions")} WHERE decision <> 'note' ORDER BY decision_id`).catch(() => []);
  const last = new Map<string, string>(dec.map((d: any) => [String(d.incident_id), String(d.decision)]));
  for (const r of rows) { const d = last.get(String(r.incident_id)); r.eff_open = d === "resolve" || d === "reject" ? 0 : d === "reopen" ? 1 : Number(r.is_open); }
}, 300_000);

const ask = (text: string) => askMap({ text, plan: null, prev: null, context: CTX, user: COLLECTOR, reword: false });

describe.skipIf(!haveStore())("Ask the Map v2 on the frozen store", () => {
  it("ward scorecard: open issues and the rank among wards equal a count from the raw rows", async () => {
    // the world keeps only incidents it can use; count over the same ids the map holds, then by ward from the raw rows
    const { world } = await import("./world");
    const { world: w } = await world();
    const held = new Set(w.incidents.map((i) => i.id));
    const openBy = new Map<number, number>();
    for (const wd of w.wards) openBy.set(wd.ward, 0);
    for (const r of rows) if (held.has(String(r.incident_id)) && r.ward_no != null && r.eff_open) openBy.set(Number(r.ward_no), (openBy.get(Number(r.ward_no)) ?? 0) + 1);
    for (const ward of [178, 9, 120]) {
      const res = await ask(`ward ${ward} scorecard`);
      expect(res.kind).toBe("brief");
      const sc = res.scorecard!;
      expect(sc.ward).toBe(ward);
      expect(sc.open).toBe(openBy.get(ward));
      expect(sc.open).toBe(res.brief!.open.n);
      const more = [...openBy.values()].filter((n) => n > openBy.get(ward)!).length;
      expect(sc.rank).toEqual({ k: more + 1, of: openBy.size });
      expect(sc.overdue).toBeLessThanOrEqual(sc.open);
    }
    // in Tamil, and a ward that does not exist
    expect((await ask("வார்டு 178 மதிப்பெண் அட்டை")).scorecard?.ward).toBe(178);
    const no = await ask("ward 250 scorecard");
    expect(no.kind).toBe("say");
    expect(no.say?.en).toContain("There is no Ward 250");
  });

  it("Play the period: every day of the window, and the days add up to the answer with the same ids", async () => {
    const res = await ask("garbage complaints this month");
    expect(res.kind).toBe("answer");
    const tl = res.extra.timeline!;
    expect(tl).toBeTruthy();
    expect(tl.days.reduce((a, d) => a + d.n, 0)).toBe(res.answer!.count);
    expect(tl.total).toBe(res.answer!.count);
    const all = tl.days.flatMap((d) => d.ids).sort();
    expect(new Set(all).size).toBe(all.length);
    // each id is on the day its raw row was first reported
    const firstOf = new Map(rows.map((r) => [String(r.incident_id), String(r.first).slice(0, 10)]));
    for (const d of tl.days) for (const id of d.ids) expect(firstOf.get(id)).toBe(d.day);
    // consecutive days, none missing
    for (let k = 1; k < tl.days.length; k++) expect(Date.parse(tl.days[k].day) - Date.parse(tl.days[k - 1].day)).toBe(86_400_000);
  });

  it("the printable brief carries the answer's own headline and count, and no personal details", async () => {
    const { briefHtml } = await import("./v2");
    const { world } = await import("./world");
    const { world: w } = await world();
    const res = await ask("open complaints near Adyar");
    const html = briefHtml(w, { question: "open complaints near Adyar", headline: res.answer!.headline, meaning: res.answer!.meaning, facts: [], tiles: [],
      rows: res.rows.map((x) => ({ title: x.title, cat: x.catLabel, status: x.status, sev: x.sev, place: x.place ?? "", first: x.first, dept: x.deptName })),
      total: res.total, pts: res.features.map((f) => ({ lat: f.lat, lon: f.lon })), asOf: res.asOf.data, sources: [] });
    expect(html).toContain(res.answer!.headline.replace(/&/g, "&amp;").slice(0, 30));
    expect(html).toContain(`of ${res.total.toLocaleString("en-IN")}`);
    expect(html).not.toMatch(/mobile|phone_number|@example/i);
  });
});
