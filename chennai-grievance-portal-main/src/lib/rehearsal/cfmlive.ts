/**
 * Live rain from the Chennai Flood Monitor's automatic weather stations (TNDRRA): rain in the last hour and since 08:30
 * at each station in Chennai and the districts upstream of its lakes, read straight from the endpoint the Flood
 * Monitor's own home page uses (GetRainfallDatafordashboard, which answers a plain request). Read at most every 10
 * minutes and kept in memory; a station whose newest reading is older than 3 hours is shown as not reporting, never as
 * dry. Endpoints the site's firewall refuses to programs (bulletins, station forecasts) are not called from here: the
 * bulletin list comes from the CFM collector's hourly files (source.ts).
 */
export const CFM_BASE = "https://chennaifloodmonitor.tn.gov.in";
const DISTRICTS = ["Chennai", "Tiruvallur", "Kancheepuram", "Chengalpattu"];
const EVERY_MS = 10 * 60_000;
export const STALE_H = 3;
/** rain in one hour, and since 08:30, that counts as heavy (IMD: heavy rain is 64.5 mm or more in a day) */
export const HEAVY_HOUR_MM = 15;
export const HEAVY_DAY_MM = 64.5;

export interface LiveRain {
  id: string;
  name: string;
  district: string;
  /** IST "YYYY-MM-DD HH:MM:SS" of the reading */
  at: string | null;
  /** the hour it covers, as the site writes it ("16:30 to 17:30") */
  hour: string | null;
  hourMm: number | null;
  /** since 08:30 today, and the day before (to 08:30) */
  todayMm: number | null;
  yesterdayMm: number | null;
  stale: boolean;
}
export interface LiveRainState { fetchedAt: string | null; stations: LiveRain[]; error: string | null; source: string }

declare global {
  // eslint-disable-next-line no-var
  var __cfmLiveRain: { at: number; p: Promise<LiveRainState> } | undefined;
}

const ist = (ms = Date.now()) => new Date(ms + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");
const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

async function readDistrict(d: string, now: string): Promise<LiveRain[]> {
  const url = `${CFM_BASE}/Master/GetRainfallDatafordashboard?district=${encodeURIComponent(d)}&datetime=${encodeURIComponent(now)}`;
  const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  let j: unknown = await r.json();
  while (typeof j === "string") j = JSON.parse(j);
  if (!Array.isArray(j)) return [];
  const nowMs = Date.parse(now.replace(" ", "T") + "Z");
  return j.map((x: Record<string, unknown>) => {
    const at = x.date_time ? String(x.date_time).slice(0, 19).replace("T", " ") : null;
    const stale = !at || nowMs - Date.parse(at.replace(" ", "T") + "Z") > STALE_H * 3_600_000;
    return {
      id: String(x.aws_id ?? x.stationname), name: String(x.stationname ?? x.aws_id).replace(/\s*AWS$/i, "").trim(), district: d, at, hour: x.timestring ? String(x.timestring) : null,
      hourMm: num(x.hour_rain), todayMm: num(x.progressive_rain), yesterdayMm: num(x.predate_rain), stale
    };
  });
}

/** The newest live rain (cached for 10 minutes; a failed read keeps the last good one and says so). */
export function liveRain(): Promise<LiveRainState> {
  const g = global.__cfmLiveRain;
  if (g && Date.now() - g.at < EVERY_MS) return g.p;
  const prev = g?.p;
  const p = (async (): Promise<LiveRainState> => {
    const now = ist();
    const out: LiveRain[] = [];
    const errs: string[] = [];
    for (const d of DISTRICTS) {
      try { out.push(...await readDistrict(d, now)); } catch (e) { errs.push(`${d}: ${(e as Error).message}`); }
    }
    if (!out.length && prev) {
      const old = await prev.catch(() => null);
      if (old?.stations.length) return { ...old, error: `Could not reach the Chennai Flood Monitor (${errs.join("; ")}); showing the reading of ${old.fetchedAt}.` };
    }
    // one row per station (a station can be listed under two districts)
    const seen = new Set<string>();
    const stations = out.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
    return { fetchedAt: now, stations, error: errs.length ? `Not read: ${errs.join("; ")}` : null, source: "Chennai Flood Monitor (TNDRRA automatic weather stations)" };
  })();
  global.__cfmLiveRain = { at: Date.now(), p };
  return p;
}

/** a heavy-rain-now reason for the trigger: the wettest reporting station */
export function heavyNow(s: LiveRain[]): { level: "act" | "watch" | null; station: LiveRain | null } {
  const live = s.filter((x) => !x.stale);
  const top = live.reduce<LiveRain | null>((m, x) => ((x.todayMm ?? 0) > (m?.todayMm ?? -1) ? x : m), null);
  const burst = live.find((x) => (x.hourMm ?? 0) >= HEAVY_HOUR_MM) ?? null;
  if (burst || (top?.todayMm ?? 0) >= HEAVY_DAY_MM) return { level: "act", station: burst ?? top };
  if ((top?.todayMm ?? 0) >= 30) return { level: "watch", station: top };
  return { level: null, station: null };
}
