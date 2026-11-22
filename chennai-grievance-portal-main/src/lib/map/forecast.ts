/**
 * v3: the rain forecast by zone, for "will it rain tomorrow", "where will it rain most", "rain forecast". Open-Meteo's
 * hourly precipitation forecast (free, no key, CC BY 4.0; https://open-meteo.com) at each zone's centre, summed over the
 * next 24 hours, with the hour of the heaviest rain. One request for all 15 zones; kept 30 minutes; a 6 s limit.
 * Every figure is the forecast's own; the map adds only the open flooding and drain cases it already counts.
 */
export interface ZoneRain { zone: number; mm: number; maxHr: number; peakAt: string | null }
export interface RainForecast { at: string; hours: number; rows: ZoneRain[]; source: string }

declare global {
  // eslint-disable-next-line no-var
  var __diqRainForecast: { at: number; key: string; v: RainForecast } | undefined;
}

const URL = "https://api.open-meteo.com/v1/forecast";

/** The next `hours` of rain at each zone centre; null when the forecast cannot be read just now. */
export async function rainForecast(zones: { zone: number; lat: number; lon: number }[], hours = 24, now = new Date()): Promise<RainForecast | null> {
  const list = zones.filter((z) => z.lat && z.lon);
  if (!list.length) return null;
  const key = `${hours}|${list.map((z) => z.zone).join(",")}`;
  const hit = global.__diqRainForecast;
  if (hit && hit.key === key && Date.now() - hit.at < 30 * 60_000) return hit.v;
  const q = new URLSearchParams({
    latitude: list.map((z) => z.lat.toFixed(4)).join(","), longitude: list.map((z) => z.lon.toFixed(4)).join(","),
    hourly: "precipitation", forecast_days: "3", timezone: "Asia/Kolkata"
  });
  try {
    const r = await fetch(`${URL}?${q}`, { signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as unknown;
    const arr = (Array.isArray(j) ? j : [j]) as { hourly?: { time: string[]; precipitation: (number | null)[] } }[];
    // the hours from now (IST wall clock, as the forecast's times are)
    const ist = new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 13);
    const rows: ZoneRain[] = list.map((z, i) => {
      const h = arr[i]?.hourly;
      if (!h) return { zone: z.zone, mm: 0, maxHr: 0, peakAt: null };
      const from = Math.max(0, h.time.findIndex((t) => t.slice(0, 13) >= ist));
      let mm = 0, maxHr = 0, peakAt: string | null = null;
      for (let k = from; k < Math.min(h.time.length, from + hours); k++) {
        const v = h.precipitation[k] ?? 0;
        mm += v;
        if (v > maxHr) { maxHr = v; peakAt = h.time[k]; }
      }
      return { zone: z.zone, mm: Math.round(mm * 10) / 10, maxHr: Math.round(maxHr * 10) / 10, peakAt };
    });
    const v: RainForecast = { at: now.toISOString(), hours, rows, source: "Open-Meteo forecast (CC BY 4.0)" };
    global.__diqRainForecast = { at: Date.now(), key, v };
    return v;
  } catch {
    return null;
  }
}

/** "3 pm Sat" from the forecast's IST wall-clock hour ("2026-11-22T15:00") */
export function peakWords(t: string | null, ta = false): string {
  if (!t) return "";
  const d = new Date(`${t}:00Z`);
  const h = d.getUTCHours();
  const hr = `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;
  const day = d.toLocaleDateString(ta ? "ta-IN" : "en-IN", { weekday: "short", timeZone: "UTC" });
  return `${hr} ${day}`;
}
