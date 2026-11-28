/**
 * The rain action tracker on the frozen store (npm run eval:golden, or this file alone): every street an early rain flooded is
 * assigned in one go, marked done three days after that rain (written straight into the frozen copy, as if the officers had),
 * and the later rains' own records decide each outcome. Checked against a plain loop over the reports, here, not the tracker's
 * code; the numbers are printed. Writes go to the in-memory copy only (golden config: no saving).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { haveStore, loadFrozen } from "@/lib/assistant/__tests__/golden/harness";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/ai/gateway", async (orig) => {
  const m = await orig<typeof import("@/lib/ai/gateway")>();
  return { ...m, aiStatus: () => ({ available: false, problem: null, providers: [], stt: "" }), generateJson: async () => { throw new m.AiUnavailableError(); } };
});

const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
let ready = false;
beforeAll(async () => {
  if (!haveStore()) return;
  const f = await loadFrozen();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(f.frozenAt);
  ready = true;
}, 300_000);

describe("the tracker on real rains", () => {
  it("assigns every street an early rain flooded, and the later rains' reports decide each outcome", async () => {
    if (!ready) return;
    const { pastRains } = await import("./engine");
    const { withRainData } = await import("./satflood");
    const { assignFixes, readTasks } = await import("./tasks");
    const { prepareAssign, trackerState } = await import("./trackview");
    const intel = (await import("@/lib/collector/db")).default;
    const { ops } = await import("@/lib/collector/db");
    const rains = withRainData(await pastRains()).rains.sort((a, b) => a.start.localeCompare(b.start));
    // the earliest rain with at least 5 flood streets, and at least two rains after it
    const k = rains.findIndex((r, i) => i < rains.length - 2 && new Set(r.reports.map((x) => x.street).filter(Boolean)).size >= 5);
    expect(k).toBeGreaterThanOrEqual(0);
    const cause = rains[k];
    const keys = [...new Set([...cause.reports.map((x) => x.street).filter((x): x is string => !!x), ...(cause.streets ?? []).map((s) => s.key)])].sort();
    const note = "Clear and desilt the storm-water drains along this street before the next heavy rain";
    const p = await prepareAssign("flood", cause.id, keys.map((place) => ({ place, dept: "GCC-SWD", note })));
    expect(p.skipped).toEqual([]);
    expect(p.ok.length).toBe(keys.length);
    const before = (await readTasks({ fixes: true })).length;
    const made = await assignFixes(cause.id, "flood", addDays(cause.end, 10), "golden@test", p.ok);
    expect(made.length).toBe(keys.length);
    // a second assignment of the same streets is refused: each has an unfinished action
    const again = await prepareAssign("flood", cause.id, keys.slice(0, 3).map((place) => ({ place, dept: "GCC-SWD", note })));
    expect(again.ok).toEqual([]);
    expect(again.skipped.every((s) => s.why === "unfinished")).toBe(true);

    // the officers mark them done three days after the rain
    const doneAt = `${addDays(cause.end, 3)} 17:00:00`;
    for (const m of made) {
      await intel.query(`UPDATE ${ops("followups")} SET status = 'done', last_checked_at = ? WHERE followup_id = ?`, [doneAt, m.id]);
      await intel.query(`INSERT INTO ${ops("audit_log")} (actor, action, table_name, record_id, before_value, after_value) VALUES ('golden-officer@test', 'rehearsal:done', 'followups', ?, NULL, ?)`,
        [String(m.id), JSON.stringify({ t: doneAt, stage: "done", status: "done", remarks: "Drains desilted" })]);
    }
    const s = await trackerState();
    const mine = s.fixes.filter((f) => made.some((m) => m.id === f.id));
    expect(mine.length).toBe(made.length);
    expect((await readTasks({ fixes: true })).length).toBe(before + made.length);

    // the oracle: a later rain (after the done day) with a report on the street, or within 100 m of its point
    const KX = 111320 * Math.cos((13.05 * Math.PI) / 180), KY = 110574;
    const later = rains.filter((r) => r.start > doneAt.slice(0, 10) && r.start <= s.asOf.slice(0, 10));
    let nAgain = 0, nHeld = 0, nPending = 0;
    for (const f of mine) {
      expect(f.stage).toBe("done");
      const wet = later.filter((r) => r.reports.some((x) => x.street === f.place || Math.hypot((x.lon - f.lon) * KX, (x.lat - f.lat) * KY) <= 100) || (r.streets ?? []).some((x) => x.key === f.place));
      if (f.outcome.kind === "again") { nAgain++; expect(wet.map((r) => r.id)).toContain(f.outcome.rain); }
      else if (f.outcome.kind === "held") {
        nHeld++;
        const t = f.outcome.tests.find((x) => x.rain === f.outcome.rain)!;
        expect(t.result).toBe("held");
        expect(wet.map((r) => r.id)).not.toContain(f.outcome.rain);
        if (t.causeMm != null) expect(t.laterMm!).toBeGreaterThanOrEqual(0.7 * t.causeMm - 0.05);
      } else nPending++;
      // the latest test decides: no rain after the deciding one tested it
      const lastTest = [...f.outcome.tests].reverse().find((x) => x.result === "again" || x.result === "held");
      expect(lastTest?.rain ?? null).toBe(f.outcome.rain);
    }
    expect(nAgain + nHeld + nPending).toBe(mine.length);
    console.log(`[tracker] ${cause.id} (${cause.rain?.mean ?? "-"} mm district average): ${mine.length} streets acted on, done ${doneAt}; console now ${s.asOf}; later rains ${later.map((r) => `${r.id.slice(5)}:${r.rain?.mean ?? "-"}mm`).join(" ")}`);
    console.log(`[tracker] outcome: ${nHeld} resolved, ${nAgain} flooded again, ${nPending} not tested (${mine.filter((f) => f.outcome.kind === "pending").map((f) => f.outcome.why).join(",") || "-"})`);
    console.log(`[tracker] bases: ${[...new Set(mine.flatMap((f) => f.outcome.tests.map((t) => t.basis)))].join(", ")}`);
  }, 300_000);

  it("Power: a ward that lost power in that rain is tracked against the tab's own record of the later rains", async () => {
    if (!ready) return;
    const { impacts } = await import("./impacts");
    const { assignFixes } = await import("./tasks");
    const { prepareAssign, trackerState } = await import("./trackview");
    const power = await impacts("power");
    const rains = [...power.rains].sort((a, b) => a.start.localeCompare(b.start));
    const cause = rains.find((r, i) => i < rains.length - 2 && r.hit > 0)!;
    const ward = power.items.find((x) => x.byRain[cause.id])!;
    const p = await prepareAssign("power", cause.id, [{ place: ward.key, dept: "TANGEDCO", note: "Check transformers and feeder pillars on low ground in the ward" }]);
    expect(p.ok).toHaveLength(1);
    expect(p.ok[0]).toMatchObject({ place: ward.key, label: ward.label, ward: ward.ward });
    const [m] = await assignFixes(cause.id, "power", addDays(cause.end, 10), "golden@test", p.ok);
    const st = await trackerState();
    const f = st.fixes.find((x) => x.id === m.id)!;
    expect(f).toMatchObject({ lens: "power", stage: "assigned", deptName: expect.any(String) });
    // not done yet: no later rain tests it, only notes it; a rain after the console's now (a day the record already names) is not a test
    expect(f.outcome.kind).toBe("pending");
    expect(f.outcome.why).toBe("not-done");
    const hitLater = rains.filter((r) => r.start > cause.end && r.start <= st.asOf.slice(0, 10) && ward.byRain[r.id]).map((r) => r.id);
    expect(f.outcome.tests.filter((t) => t.result === "before").map((t) => t.rain)).toEqual(hitLater);
    console.log(`[tracker] power ${ward.label} after ${cause.id}: hit again before the work in ${hitLater.length} later rains`);
  }, 300_000);
});
