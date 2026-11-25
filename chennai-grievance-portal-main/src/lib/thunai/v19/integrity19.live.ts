/**
 * v19 (25 Nov, the owner: "the data should be integrated throughout the dashboard; there shouldn't be any misnumbering anywhere"): the analyst's
 * figures against the dashboard's own tiles, its zone table, its departments, its severity list and the traffic view, for the same windows and
 * filters, on a dry-run copy of the store. Also against themselves: every split adds up to its total, and every list holds what its number says.
 *   npx vitest run --config vitest.live.config.ts src/lib/thunai/v19/integrity19.live.ts
 */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-v18/durable.sqlite";
process.env.JARVIS_KEEPWARM = "0";
process.env.DISTRICT_IQ_JOBS = "off";
import { expect, it } from "vitest";
import { runTool } from "@/lib/assistant/tools";
import { asOf, overview } from "@/lib/collector/intel";
import { trafficNow } from "@/lib/city/traffic";
import { jamsRanked } from "@/lib/city/pick";
import { serverWorld } from "../world";
import { runQuery } from "./run";
import type { Query } from "./shape";

const Q = (x: Partial<Query> = {}): Query => ({ of: "incidents", zones: [], place: null, ward: null, taluk: null, depts: [], not: [], group: null, cats: [], sev: [], status: null, from: null, harm: null, words: [], item: null, time: null, clock_from: null, clock_to: null, older_days: null, level: null, measure: "count", by: null, per: null,
  order: "most", rank: null, take: null, list: false, sort: "priority", before: false, ...x });

it("the analyst's figures are the dashboard's", async () => {
  const world = await serverWorld();
  const now = await asOf();
  const diffs: string[] = [];
  let checks = 0;
  const same = (what: string, a: number | null | undefined, b: number | null | undefined) => { checks++; if (Number(a) !== Number(b)) diffs.push(`${what}: analyst ${a} vs dashboard ${b}`); };
  const ask = (q: Partial<Query>, key: "daily" | "weekly" | "monthly" | "quarterly" = "daily") => runQuery(Q(q), { world, key, now });
  for (const c of [{ period: "daily", zone: null, dept: null }, { period: "weekly", zone: null, dept: null }, { period: "monthly", zone: 8, dept: null }, { period: "weekly", zone: null, dept: "POL-GCP" }, { period: "daily", zone: 13, dept: "POL-GCP" }, { period: "quarterly", zone: 5, dept: null }] as const) {
    const f: Partial<Query> = { zones: c.zone ? [c.zone] : [], depts: c.dept ? [c.dept] : [] };
    const name = `${c.period} zone=${c.zone ?? "-"} dept=${c.dept ?? "-"}`;
    const [tiles, zonesT] = await Promise.all([runTool("overview_kpis", { scope: { period: c.period, zone: c.zone, dept: c.dept } }), runTool("zones", { scope: { period: c.period, dept: c.dept } })]);
    const cur = (tiles.data as { cur: Record<string, number> }).cur, prev = (tiles.data as { prev?: Record<string, number> }).prev ?? {};
    const n = await ask(f, c.period), sv = await ask({ ...f, sev: ["Severe"], list: true }, c.period), op = await ask({ ...f, status: "open" }, c.period), cm = await ask({ ...f, measure: "complaints" }, c.period), rs = await ask({ ...f, status: "resolved", measure: "resolved" }, c.period);
    same(`${name} reported`, n.total, cur.reported);
    same(`${name} reported before`, n.prev?.total, prev.reported);
    same(`${name} severe`, sv.total, cur.severe);
    same(`${name} severe before`, sv.prev?.total, prev.severe);
    same(`${name} ongoing`, op.total, cur.ongoing);
    same(`${name} open citizen complaints`, cm.total, cur.complaints);
    same(`${name} resolved`, rs.total, cur.resolved);
    // a list holds what its number says
    same(`${name} severe list`, sv.rowsTotal, sv.total);
    same(`${name} resolved list`, rs.rowsTotal, rs.total);
    // the zone table, area by area
    if (!c.zone) {
      const bz = await ask({ ...f, by: "zone" }, c.period), bs = await ask({ ...f, by: "zone", measure: "severe" }, c.period);
      for (const r of (zonesT.data as { rows: Record<string, number>[] }).rows ?? []) {
        same(`${name} zone ${r.zone} incidents`, bz.groups.find((g) => Number(g.key) === Number(r.zone))?.value, r.n ?? r.incidents);
        same(`${name} zone ${r.zone} severe`, bs.groups.find((g) => Number(g.key) === Number(r.zone))?.value, r.severe);
      }
    }
    // every split adds up
    for (const by of ["kind", "dept", "severity", "day", "hour", "weekday"] as const) {
      const g = await ask({ ...f, by }, c.period);
      const sum = g.groups.reduce((a, x) => a + x.value, 0);
      if (by !== "dept") same(`${name} split by ${by}`, sum, by === "day" || by === "hour" || by === "weekday" ? g.total : n.total);
      // the top one's own list is its number
      const top = [...g.groups].sort((a, b) => b.value - a.value)[0];
      if (by !== "day" && top?.inside) same(`${name} ${by} ${top.key} opened`, (await runQuery(top.inside, { world, key: c.period, now })).total, top.value);
    }
  }
  // every row opened holds exactly what it counts: a locality or a road of an area, an area of a road named, a day (today's since midnight)
  for (const [q, key] of [[{ by: "place", zones: [4] }, "monthly"], [{ by: "place", zones: [9] }, "monthly"], [{ by: "road", zones: [13] }, "quarterly"], [{ by: "road", place: "Velachery" }, "quarterly"], [{ by: "zone", place: "Anna Salai" }, "monthly"], [{ by: "ward", zones: [10] }, "monthly"],
    [{ by: "day", depts: ["POL-GCP"] }, "weekly"], [{ by: "zone", measure: "overdue" }, "quarterly"], [{ by: "zone", per: "dept" }, "monthly"], [{ by: "dept", zones: [8], status: "resolved", measure: "resolved" }, "weekly"], [{ by: "kind", from: "citizens" }, "monthly"], [{ by: "zone", words: ["murder"], cats: ["CRIME_VIOLENT"] }, "quarterly"]] as [Partial<Query>, "weekly"][]) {
    const g = await ask(q, key);
    for (const x of [...g.groups].sort((a, b) => b.value - a.value).slice(0, 4).concat(g.groups.slice(-1))) {
      if (!x.inside) continue;
      const o = await runQuery(x.inside, { world, key, now });
      same(`${JSON.stringify(q)} ${x.label} opened`, o.rowsTotal, x.value);
    }
  }
  // what is left out is the rest, and a share of a place is of the whole district
  for (const k of ["daily", "monthly"] as const) {
    const all = (await ask({}, k)).total!, pol = (await ask({ depts: ["POL-GCP"] }, k)).total!, ad = (await ask({ zones: [13] }, k)).total!;
    const noDept = (await ask({ by: "dept" }, k)).groups.reduce((x, g) => x + g.value, 0);
    same(`${k} all but the police`, (await ask({ not: ["POL-GCP"] }, k)).total, all - pol);
    same(`${k} all but Adyar`, (await ask({ not: ["13"] }, k)).total, all - ad);
    const d = await ask({ by: "dept", not: ["POL-GCP"] }, k);
    same(`${k} departments but the police`, d.groups.reduce((x, g) => x + g.value, 0), noDept - pol);
    same(`${k} share of Adyar`, (await ask({ zones: [13], measure: "share" }, k)).total, Math.round((ad / all) * 1000) / 10);
  }
  // the same from a backlog ranking on the dashboard's 24 hours: its rows open over the 90 days it was counted over
  for (const q of [{ by: "dept", status: "open" }, { by: "zone", status: "overdue" }, { by: "kind", measure: "overdue" }, { by: "month" }] as Partial<Query>[]) {
    const g = await ask(q, "daily");
    for (const x of [...g.groups].sort((a, b) => b.value - a.value).slice(0, 3)) if (x.inside) same(`${JSON.stringify(q)} ${x.label} opened from 24 hours`, (await runQuery(x.inside, { world, key: "daily", now })).rowsTotal, x.value);
  }
  // last night is 6 PM to 6 AM, whatever hour it is asked
  for (const at of ["22:02:00", "09:00:00"]) {
    const d = now.slice(0, 10), y = new Date(Date.parse(`${d}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
    const t = { said: "last night", from: null, to: null, hours: null };
    const a = await runQuery(Q({ time: t }), { world, key: "daily", now: `${d} ${at}` });
    checks++; if (a.win?.from !== `${y} 18:00:00` || a.win?.to !== `${d} 06:00:00`) diffs.push(`last night at ${at}: ${a.win?.from} to ${a.win?.to}`);
    same(`last night at ${at}, its list`, a.rowsTotal, a.total);
  }
  // the overview's own severity panel ("the dashboard showed 7 severe cases")
  const ov = await overview("daily", null, null, {});
  same("overview severity panel, Severe", (await ask({ sev: ["Severe"], list: true })).total, (ov.severity.counts as Record<string, number>).Severe ?? 0);
  // "today" is the dashboard's 24 hours
  same("severe today", (await ask({ sev: ["Severe"], time: { said: "today", from: null, to: null, hours: 24 } }, "weekly")).total, (await ask({ sev: ["Severe"] }, "daily")).total);
  same("severe today, in Tamil", (await ask({ sev: ["Severe"], time: { said: "இன்னைக்கு", from: null, to: null, hours: null } }, "weekly")).total, (await ask({ sev: ["Severe"] }, "daily")).total);
  // live traffic as the Traffic view has it
  const t = await trafficNow({});
  if (t.enabled && t.spots.length) {
    const z = await ask({ of: "traffic", by: "zone", measure: "jams" });
    for (const x of t.zones) same(`traffic zone ${x.zone} jams`, z.groups.find((g) => Number(g.key) === x.zone)?.value, t.spots.filter((s) => s.zone === x.zone && ["very", "congested", "slow"].includes(s.level)).length);
    same("traffic worst road", (await ask({ of: "traffic", by: "road", measure: "delay", take: 1 })).shown[0]?.value, jamsRanked(t, "most")[0]?.delayMin ?? 0);
  }
  console.log(diffs.length ? `DIFFERENCES (${diffs.length} of ${checks}):\n${diffs.join("\n")}` : `all ${checks} equal`);
  expect(diffs).toEqual([]);
}, 600_000);
