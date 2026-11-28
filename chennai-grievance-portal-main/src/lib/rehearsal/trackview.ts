/**
 * The Rain view's action tracker on the server: every fix after a rain (tasks.ts) with its stage, who has it, its steps and its
 * outcome at the rains since (tracker.ts outcomeOf), from the same records the Rain view shows: the past rains with their
 * flooding reports, CFM-DSS gauge rain per ward and satellite streets (satflood.ts withRainData), and the Traffic, Power and
 * Metro tabs (impacts.ts). Assigning checks each place against the rain's own data, never the browser's list.
 */
import { asOf as consoleNow } from "@/lib/collector/intel";
import { world } from "@/lib/map/world";
import { impactInputs, pastRains } from "./engine";
import { impacts, type ImpactData, type Lens } from "./impacts";
import { withRainData, type RainWithData } from "./satflood";
import { readTasks, type FixItem } from "./tasks";
import { canAssign, COMPARABLE_SHARE, doneAt, FIX_DEPTS, floodHit, NEAR_M, outcomeOf, type FixLens, type OutcomeView, type RainFact, type Stage, type TrailEvent } from "./tracker";

export interface FixView {
  id: number;
  lens: FixLens;
  place: string;
  label: string;
  /** the rain that led to the action */
  rain: string;
  dept: string;
  deptName: string;
  note: string;
  /** IST "YYYY-MM-DD HH:MM:SS" */
  due: string | null;
  stage: Stage;
  late: boolean;
  createdAt: string;
  trail: TrailEvent[];
  outcome: OutcomeView;
  lat: number;
  lon: number;
  ward: number | null;
}

export interface TrackPayload {
  asOf: string;
  /** a later rain is comparable at this share of the rain that led to the action */
  share: number;
  nearM: number;
  depts: { code: string; name: string }[];
  fixes: FixView[];
}

/** what the outcome check reads of each rain */
export function rainFacts(rains: RainWithData[]): RainFact[] {
  return rains.map((r) => ({
    id: r.id, start: r.start, end: r.end, districtMm: r.rain?.mean ?? null, maxMm: r.maxMm ?? null,
    complete: !!r.rain && r.rain.window.daysRead === r.rain.window.daysWanted,
    wardMm: r.rain?.wards?.length ? Object.fromEntries(r.rain.wards.map((w) => [String(w.ward), w.mm])) : null
  }));
}

const deptNames = async () => {
  const { world: w } = await world();
  return (code: string) => w.depts.get(code)?.name ?? code;
};

/** each Traffic / Power / Metro tab that a fix needs, read once (a tab that cannot be read leaves its fixes untested) */
async function tabsFor(lenses: Set<FixLens>): Promise<Partial<Record<Lens, ImpactData>>> {
  const out: Partial<Record<Lens, ImpactData>> = {};
  for (const l of ["traffic", "power", "metro"] as Lens[]) {
    if (!lenses.has(l)) continue;
    try { out[l] = await impacts(l); } catch (e) { console.warn(`rain tracker: the ${l} tab could not be read: ${(e as Error).message}`); }
  }
  return out;
}

/** The tracker: every fix, newest first. */
export async function trackerState(): Promise<TrackPayload> {
  const [now, all, past, name] = await Promise.all([consoleNow(), readTasks({ fixes: true }), pastRains(), deptNames()]);
  const rains = withRainData(past).rains;
  const facts = rainFacts(rains);
  const byId = new Map(rains.map((r) => [r.id, r]));
  const tabs = await tabsFor(new Set(all.map((t) => t.fix!.lens)));
  const fixes: FixView[] = all.map((t) => {
    const f = t.fix!;
    const item = f.lens === "flood" ? null : tabs[f.lens]?.items.find((x) => x.key === f.place) ?? null;
    const known = f.lens === "flood" || !!tabs[f.lens];
    const hit = (id: string) => (f.lens === "flood" ? !!byId.get(id) && floodHit(byId.get(id)!, f.place, { lat: t.lat, lon: t.lon }) : !!item?.byRain[id]);
    const outcome: OutcomeView = known ? outcomeOf({ rain: t.rehearsal, doneAt: doneAt(f.trail), ward: t.ward }, facts, hit, now)
      : { kind: "pending", rain: null, why: "no-cause", tests: [], againIn: [] };
    return { id: t.id, lens: f.lens, place: f.place, label: f.label, rain: t.rehearsal, dept: t.dept, deptName: name(t.dept), note: f.note, due: t.due, stage: f.stage, late: f.late,
      createdAt: t.createdAt, trail: f.trail, outcome, lat: t.lat, lon: t.lon, ward: t.ward };
  }).sort((a, b) => b.id - a.id);
  return { asOf: now, share: COMPARABLE_SHARE, nearM: NEAR_M, depts: FIX_DEPTS.map((code) => ({ code, name: name(code) })), fixes };
}

/** a flood street's name: the flood memory's label, else the satellite street's, else the report's place */
function satLabel(s: { name: string | null; near: string | null; ward: number }): string {
  return s.name ?? (s.near ? `A lane off ${s.near}` : `A road in ward ${s.ward}`);
}

export type Skip = { place: string; why: "not-hit" | "unfinished" | "same-rain" | "repeat" };

/**
 * The places of an assignment as the server knows them: hit in that rain (Flooding: a report on the street or satellite water
 * on it; the other tabs: the place is in that rain's record), and with no unfinished fix. Each comes back with its name, point
 * and ward from the server's own data; the rest are skipped with the reason.
 */
export async function prepareAssign(lens: FixLens, rainId: string, items: { place: string; dept: string; note: string }[]): Promise<{ rain: RainWithData | null; ok: FixItem[]; skipped: Skip[] }> {
  const rains = withRainData(await pastRains()).rains;
  const rain = rains.find((r) => r.id === rainId) ?? null;
  if (!rain) return { rain: null, ok: [], skipped: items.map((x) => ({ place: x.place, why: "not-hit" })) };
  const existing = (await readTasks({ fixes: true })).filter((t) => t.fix!.lens === lens);
  const seen = new Set<string>();
  const ok: FixItem[] = [], skipped: Skip[] = [];
  let streets: Awaited<ReturnType<typeof impactInputs>>["streets"] | null = null;
  const tab = lens === "flood" ? null : await impacts(lens);
  for (const x of items) {
    if (seen.has(x.place)) { skipped.push({ place: x.place, why: "repeat" }); continue; }
    seen.add(x.place);
    const can = canAssign(existing.filter((t) => t.fix!.place === x.place).map((t) => ({ rain: t.rehearsal, stage: t.fix!.stage })), rainId);
    if (!can.ok) { skipped.push({ place: x.place, why: can.why }); continue; }
    let at: Omit<FixItem, "place" | "dept" | "note"> | null = null;
    if (lens === "flood") {
      if (!floodHit(rain, x.place, null)) { skipped.push({ place: x.place, why: "not-hit" }); continue; }
      streets ??= (await impactInputs()).streets;
      const s = streets.find((y) => y.key === x.place);
      const sat = rain.streets?.find((y) => y.key === x.place)?.sat ?? null;
      const rep = rain.reports.find((r) => r.street === x.place);
      at = s ? { label: s.label, lat: s.lat, lon: s.lon, ward: s.ward ?? null }
        : sat ? { label: satLabel(sat), lat: sat.lat, lon: sat.lon, ward: sat.ward ?? null }
          : rep ? { label: rep.place ?? "A flooded street", lat: rep.lat, lon: rep.lon, ward: rep.ward } : null;
    } else {
      const it = tab!.items.find((y) => y.key === x.place);
      if (it?.byRain[rainId]) at = { label: it.label, lat: it.lat, lon: it.lon, ward: it.ward };
    }
    if (!at) { skipped.push({ place: x.place, why: "not-hit" }); continue; }
    ok.push({ place: x.place, dept: x.dept, note: x.note, ...at });
  }
  return { rain, ok, skipped };
}
