/**
 * Live Connectors (masterclass U5, 9.5): a week of daily runs simulated with a fake clock against the fixture server's
 * live site, which publishes a new file each "day" and can be told to skip a day, fail, rename a column or send few rows.
 */
import fs from "fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.STUDIO_DIR = `${process.env.TEMP || process.env.TMPDIR || "/tmp"}/studio-connectors-${process.pid}`;
  process.env.STUDIO_FIXTURES = "1";
  process.env.STUDIO_HOST_GAP_MS = "0";
  process.env.STUDIO_BROWSER = "0";
});

import { approveProposal, createConnector, getConnector, getTable, isDue, judgeQuarantine, nextSlot, patternMatcher, readSource, runConnector, setPaused, type Connector, type Deps } from "@/lib/studio/connectors";
import { parseFileAsync, type Table } from "@/lib/studio/parse";
import { fetchOnce } from "@/lib/studio/fetchurl";

const BASE = "http://127.0.0.1:4599";
let stop: (() => Promise<void>) | null = null;
beforeAll(async () => {
  fs.mkdirSync(process.env.STUDIO_DIR!, { recursive: true });
  const mod = await import("../../../scripts/studio-fixtures/server.mjs");
  stop = await mod.start().catch((e: NodeJS.ErrnoException) => { if (e.code === "EADDRINUSE") return null; throw e; });
}, 30_000);
afterAll(async () => { await setLive({ day: 1, missing: "", renameFrom: 0, dropOn: 0, failing: 0 }); await stop?.(); });

const setLive = (s: Record<string, string | number>) => fetch(`${BASE}/live/_state?${new URLSearchParams(Object.entries(s).map(([k, v]) => [k, String(v)]))}`).then((r) => r.json());
/** 2026-10-<d> at hh:mm IST, as a time */
const at = (d: number, hh = 7, mm = 30) => Date.UTC(2026, 9, d, hh, mm) - 5.5 * 3600_000;

let clock = at(1);
const rebuilt: { note: string; rows: number }[] = [];
const deps = (watches?: Deps["watches"]): Deps => ({
  now: () => clock,
  read: (c) => readSource(c, { mode: "none" }, { now: clock }),
  rebuild: async (_c, t, note) => { rebuilt.push({ note, rows: t.rows.length }); },
  watches
});
const fileTable = async (d: number): Promise<Table> => { const f = await fetchOnce(`${BASE}/live/files/Reservoir_Levels_${String(d).padStart(2, "0")}-10-2026.xlsx`); return parseFileAsync(f.buf, f.name, f.contentType, f.url); };
const key = (t: Table) => t.rows.map((r) => `${r[0]}|${r[t.headers.indexOf("Date")]}`);

describe("9.5 a daily site, a week of runs", () => {
  const id = "ds_connsim0001";
  it("days 1-7: seven runs append the new day's rows, with no duplicates", async () => {
    await setLive({ day: 1, missing: "", renameFrom: 0, dropOn: 0, failing: 0 });
    clock = at(1);
    createConnector({ id, name: "Reservoirs", url: `${BASE}/live/reservoirs`, locate: "newest-file-matching", pattern: "Reservoir_Levels_{DD-MM-YYYY}.xlsx", table: await fileTable(1), seen: ["2026-10-01"] }, clock);
    for (let d = 2; d <= 7; d++) {
      await setLive({ day: d });
      clock = at(d);
      expect(isDue(getConnector(id)!, clock)).toBe(true);
      const run = await runConnector(id, deps());
      expect(run.kind).toBe("new");
    }
    const t = getTable(id)!;
    expect(t.rows.length).toBe(42);
    expect(new Set(key(t)).size).toBe(42);
    // the same day again: nothing new, nothing duplicated
    clock = at(7, 9);
    expect((await runConnector(id, deps())).kind).toBe("same");
    expect(getTable(id)!.rows.length).toBe(42);
    expect(getConnector(id)!.status).toBe("healthy");
  }, 60_000);

  it("a missing day is Late, then Healthy when the file appears", async () => {
    await setLive({ day: 8, missing: "8" });
    clock = at(8, 10, 0); // a day and two and a half hours after day 7's data (grace: 2 hours)
    const late = await runConnector(id, deps());
    expect(late.kind).toBe("late");
    expect(getConnector(id)!.status).toBe("late");
    // looked at again within the hour, not only tomorrow
    expect(Date.parse(getConnector(id)!.nextAt) - clock).toBeLessThanOrEqual(3600_000);
    await setLive({ missing: "" });
    clock = at(8, 11, 0);
    expect((await runConnector(id, deps())).kind).toBe("new");
    expect(getConnector(id)!.status).toBe("healthy");
    expect(getTable(id)!.rows.length).toBe(48);
  }, 60_000);

  it("a site that fails is Failing, retried after 15 min, 1 h, then 3 h, and recovers", async () => {
    await setLive({ failing: 1, day: 9 });
    clock = at(9);
    const gaps: number[] = [];
    for (let k = 0; k < 4; k++) {
      const r = await runConnector(id, deps());
      expect(r.kind).toBe("error");
      const c = getConnector(id)!;
      expect(c.status).toBe("failing");
      gaps.push(Math.round((Date.parse(c.retryAt!) - clock) / 60_000));
      expect(isDue(c, clock + 60_000)).toBe(false);
      clock = Date.parse(c.retryAt!);
    }
    expect(gaps).toEqual([15, 60, 180, 180]);
    expect(getTable(id)!.rows.length).toBe(48); // a failed run never wipes data
    await setLive({ failing: 0 });
    expect((await runConnector(id, deps())).kind).toBe("new");
    expect(getConnector(id)!.status).toBe("healthy");
  }, 60_000);

  it("a renamed column pauses it with a self-heal proposal; approval maps it and resumes", async () => {
    await setLive({ day: 10, renameFrom: 10 });
    clock = at(10);
    const r = await runConnector(id, deps());
    expect(r.kind).toBe("drift");
    const c = getConnector(id)!;
    expect(c.status).toBe("review");
    expect(c.proposal!.mapping["Water level (ft)"]).toBe("Level (ft)");
    expect(isDue(c, clock + 864e5)).toBe(false);
    const before = getTable(id)!.rows.length;
    const ok = await approveProposal(id, deps());
    expect(ok.kind).toBe("new");
    const t = getTable(id)!;
    expect(t.headers).toContain("Level (ft)");
    expect(t.headers).not.toContain("Water level (ft)");
    expect(t.rows.length).toBe(before + 6);
    expect(getConnector(id)!.status).toBe("healthy");
  }, 60_000);

  it("rows falling by 80% are held in quarantine: the last good data stays live", async () => {
    await setLive({ day: 11, dropOn: 11 });
    clock = at(11);
    const before = getTable(id)!.rows.length;
    const r = await runConnector(id, deps());
    expect(r.kind).toBe("quarantine");
    expect(getConnector(id)!.quarantine!.why).toMatch(/fell from 6 to 1/);
    expect(getTable(id)!.rows.length).toBe(before);
    await judgeQuarantine(id, deps(), false);
    expect(getConnector(id)!.status).toBe("healthy");
    expect(getTable(id)!.rows.length).toBe(before);
  }, 60_000);

  it("a watch that is crossed after a run is recorded for the console", async () => {
    await setLive({ day: 12, dropOn: 0 });
    clock = at(12);
    const watch: Deps["watches"] = async (c) => {
      const t = getTable(c.id)!;
      const s = t.headers.indexOf("Storage (mcft)");
      const top = Math.max(...t.rows.map((x) => Number(x[s])));
      return top > 3000 ? [`Watch: storage passed 3,000 mcft (now ${top.toLocaleString("en-IN")})`] : [];
    };
    await runConnector(id, deps(watch));
    expect(getConnector(id)!.history.some((h) => h.kind === "watch" && /storage passed/.test(h.note))).toBe(true);
  }, 60_000);
});

describe("9.5 schedules, backfill, snapshots and API periods", () => {
  it("after a restart, missed runs are caught up once, not every missed slot", () => {
    const s = { every: "daily" as const, at: "07:30", tolerance: 120 };
    const c = { nextAt: new Date(at(3)).toISOString(), paused: false, proposal: null, quarantine: null, retryAt: null } as unknown as Connector;
    // the server was off from day 3 to day 6: one run is due
    expect(isDue(c, at(6, 9))).toBe(true);
    // after it, the next slot counts from now (day 7), not from the missed day 4
    expect(new Date(nextSlot(s, at(6, 9))).toISOString()).toBe(new Date(at(7)).toISOString());
    expect(new Date(nextSlot({ ...s, every: "hourly", at: "00:15" }, at(6, 9, 20))).toISOString()).toBe(new Date(at(6, 10, 15)).toISOString());
  });

  it("a backfill of 10 days reads at most those files, at the polite rate", async () => {
    await setLive({ day: 20, missing: "", renameFrom: 0, dropOn: 0, failing: 0 });
    clock = at(20);
    const id = "ds_connsim0002";
    const c = createConnector({ id, name: "Backfill", url: `${BASE}/live/reservoirs`, locate: "newest-file-matching", pattern: "Reservoir_Levels_{DD-MM-YYYY}.xlsx", table: await fileTable(20), seen: ["2026-10-20"] }, clock);
    process.env.STUDIO_HOST_GAP_MS = "40";
    const t0 = Date.now();
    const got = await readSource(c, { mode: "none" }, { now: clock, backfillDays: 10 });
    process.env.STUDIO_HOST_GAP_MS = "0";
    expect(got.map((g) => g.period)).toEqual(["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(10 * 40);
  }, 60_000);

  it("snapshots mode keeps each run with its date: a trend after 3 runs", async () => {
    const id = "ds_connsim0003";
    clock = at(1);
    const f = await fetchOnce(`${BASE}/d/with_totals.csv`);
    const first = await parseFileAsync(f.buf, f.name, f.contentType, f.url);
    createConnector({ id, name: "Snapshots", url: `${BASE}/d/with_totals.csv`, locate: "fixed-url", pattern: null, table: first, mode: "snapshots" }, clock);
    for (const d of [2, 3]) { clock = at(d); expect((await runConnector(id, deps())).kind).toBe("new"); }
    const t = getTable(id)!;
    const si = t.headers.indexOf("Snapshot date");
    expect(new Set(t.rows.map((r) => r[si])).size).toBe(3);
  }, 60_000);

  it("an API with a date parameter is asked for the new periods only", async () => {
    await setLive({ day: 7 });
    const id = "ds_connsim0004";
    clock = at(5);
    const f = await fetchOnce(`${BASE}/live/api/levels?date=2026-10-05`);
    createConnector({ id, name: "API", url: `${BASE}/live/api/levels`, locate: "api-date-param", pattern: `${BASE}/live/api/levels?date={YYYY-MM-DD}`, table: await parseFileAsync(f.buf, "x.json", f.contentType, f.url), seen: ["2026-10-05"] }, clock);
    clock = at(7, 9);
    const got = await readSource(getConnector(id)!, { mode: "none" }, { now: clock });
    expect(got.map((g) => g.period)).toEqual(["2026-10-06", "2026-10-07"]);
    expect((await runConnector(id, deps())).kind).toBe("new");
    expect(getTable(id)!.rows.length).toBe(12);
  }, 60_000);

  it("pause and resume, and the file-name pattern reads its dates", () => {
    const m = patternMatcher("Reservoir_Levels_{DD-MM-YYYY}.xlsx");
    expect(m("Reservoir_Levels_27-10-2026.xlsx")).toBe("2026-10-27");
    expect(m("Rainfall_27-10-2026.xlsx")).toBeNull();
    setPaused("ds_connsim0001", true, at(13));
    expect(getConnector("ds_connsim0001")!.status).toBe("paused");
    expect(isDue(getConnector("ds_connsim0001")!, at(20))).toBe(false);
    setPaused("ds_connsim0001", false, at(13));
    expect(isDue(getConnector("ds_connsim0001")!, at(13))).toBe(true);
  });
});
