/**
 * "On the ground now": the live feeds that bear on an answer, read where the answer is. Flooding and drainage get the
 * district's IMD warning, the rain at the nearest weather station, the lakes near full and the PWD works under way
 * (and late) in the area; health gets the nearby government hospitals' beds; pollution and fire get the air quality.
 * Every figure is a stored reading with its place and time; nothing is estimated. At most four, the most urgent first.
 * Pure.
 */
import { haversineM, fmtDistance, type Bbox, type LatLon } from "./geom";
import type { CondPlace, World } from "./types";

export interface Condition {
  id: string;
  kind: "weather" | "rain" | "lakes" | "works" | "hospital" | "air";
  tone: "alert" | "warn" | "info" | "good";
  en: string;
  ta: string;
  /** the places behind it, for markers on the map */
  pts: { lat: number; lon: number; label: string; value: string; kind: Condition["kind"] }[];
  /** the newest reading it uses, IST wall clock */
  at: string;
}

const WATER = new Set(["FLOOD", "DRAINAGE"]);
/** PWD works that change how water drains (not buildings): the ones a flooding answer is about */
const WATER_WORKS = new Set(["desilting", "canal_lining", "flood_mitigation", "bund_strengthening", "sluice_repair", "encroachment_removal"]);
const WARN_WORD = [["green", "பச்சை"], ["yellow", "மஞ்சள்"], ["orange", "ஆரஞ்சு"], ["red", "சிவப்பு"]] as const;
const n1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString("en-IN");
const day = (t: string) => (t ? new Date(t.replace(" ", "T") + "Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }) : "");
const ageDays = (t: string, now: string) => (Date.parse(now.replace(" ", "T") + "Z") - Date.parse(t.replace(" ", "T") + "Z")) / 86_400_000;
const grow = (b: Bbox, m: number): Bbox => { const dLat = m / 111_000, dLon = m / 108_000; return { s: b.s - dLat, n: b.n + dLat, w: b.w - dLon, e: b.e + dLon }; };
const inBox = (p: LatLon, b: Bbox) => p.lat >= b.s && p.lat <= b.n && p.lon >= b.w && p.lon <= b.e;

/**
 * The conditions for an answer about `fams` (incident families; empty = any) whose places lie in `box` around
 * `center`. `wide` = the answer covers most of the district, so "nearby" means the district.
 */
export function conditionsNear(w: World, opts: { fams: Set<string>; center: LatLon; box: Bbox; wide: boolean }): Condition[] {
  const c = w.conds;
  if (!c) return [];
  const { fams, center, box, wide } = opts;
  const any = fams.size === 0;
  const water = any || [...fams].some((f) => WATER.has(f));
  const out: (Condition & { score: number })[] = [];
  const of = (k: CondPlace["kind"]) => c.places.filter((p) => p.kind === k);
  const nearest = (ps: CondPlace[]) => ps.map((p) => ({ p, m: haversineM(center, p) })).sort((a, b) => a.m - b.m)[0] ?? null;

  // the district's IMD warning
  const wx = of("weather")[0]?.m.imd_warning_level;
  const wxAt = of("weather")[0]?.at ?? "";
  if (wx && wx.v >= (water ? 1 : 2) && ageDays(wxAt, w.now) <= 2) {
    const lv = Math.max(0, Math.min(3, Math.round(wx.v)));
    const what = wx.detail ? `: ${wx.detail.replace(/\s+/g, " ").slice(0, 90)}` : "";
    out.push({ id: "weather", kind: "weather", tone: lv >= 2 ? "alert" : "warn", score: 90 + lv,
      en: `IMD has a ${WARN_WORD[lv][0]} warning for the district${what}.`, ta: `மாவட்டத்துக்கு IMD ${WARN_WORD[lv][1]} எச்சரிக்கை${what}.`, pts: [], at: wxAt });
  }
  // rain at the nearest weather station
  if (water) {
    const st = nearest(of("rain").filter((p) => p.m.rainfall_24h_mm));
    if (st) {
      const mm = st.p.m.rainfall_24h_mm.v;
      const old = ageDays(st.p.at, w.now) > 3;
      const word = mm >= 115.6 ? ["very heavy", "மிகக் கனமழை"] : mm >= 64.5 ? ["heavy", "கனமழை"] : mm >= 15.6 ? ["moderate", "மிதமான மழை"] : mm > 0 ? ["light", "லேசான மழை"] : null;
      const away = st.m > 1500 ? ` (${fmtDistance(st.m)} away)` : "";
      out.push({ id: "rain", kind: "rain", tone: mm >= 115.6 ? "alert" : mm >= 64.5 ? "warn" : "info", score: mm >= 64.5 ? 80 : 40,
        en: mm > 0 ? `${n1(mm)} mm of rain in 24 h at ${st.p.name}${away}: ${word![0]}${old ? ` (reading of ${day(st.p.at)})` : ""}.`
          : `No rain in the last 24 h at ${st.p.name}${away}${old ? ` (reading of ${day(st.p.at)})` : ""}${fams.has("FLOOD") ? ": standing water now points to drains or pipes, not fresh rain" : ""}.`,
        ta: `${st.p.name}: 24 மணி நேரத்தில் ${n1(mm)} மிமீ மழை${word ? ` (${word[1]})` : ""}${old ? ` (${day(st.p.at)} அளவு)` : ""}.`,
        pts: [{ lat: st.p.lat, lon: st.p.lon, label: st.p.name, value: `${n1(mm)} mm`, kind: "rain" }], at: st.p.at });
    }
    // lakes near full: in the area (or anywhere, for a district-wide answer)
    const area = grow(box, 3000);
    const lakes = of("lake").filter((p) => p.m.lake_pct_full && p.m.lake_pct_full.v >= 85 && (wide || inBox(p, area)))
      .sort((a, b) => b.m.lake_pct_full.v - a.m.lake_pct_full.v);
    if (lakes.length) {
      const top = lakes.slice(0, 3).map((p) => `${p.name.replace(/\s+Lake$/i, "")} ${n1(p.m.lake_pct_full.v)} %${p.m.lake_pct_full.full != null && p.m.lake_pct_full.full <= 7 ? ` (full in ${Math.max(0, Math.round(p.m.lake_pct_full.full))} d)` : ""}`);
      const brim = lakes.filter((p) => p.m.lake_pct_full.v >= 95).length;
      out.push({ id: "lakes", kind: "lakes", tone: brim ? "warn" : "info", score: 60 + brim * 3,
        en: `${lakes.length} ${lakes.length === 1 ? "lake" : "lakes"} ${wide ? "in the district" : "nearby"} ${lakes.length === 1 ? "is" : "are"} over 85 % full: ${top.join(", ")}${lakes.length > 3 ? " …" : ""}.`,
        ta: `${wide ? "மாவட்டத்தில்" : "அருகில்"} ${lakes.length} ஏரிகள் 85% க்கு மேல் நிரம்பியுள்ளன: ${top.join(", ")}.`,
        pts: lakes.slice(0, 8).map((p) => ({ lat: p.lat, lon: p.lon, label: p.name, value: `${n1(p.m.lake_pct_full.v)} %`, kind: "lakes" as const })),
        at: lakes.map((p) => p.at).sort().at(-1) ?? "" });
    }
    // PWD works under way in the area, and how many are late
    const wbox = grow(box, 1000);
    // a flooding answer counts the water works; "what is happening here" (any) counts them all
    const works = c.works.filter((x) => x.status !== "completed" && (any || WATER_WORKS.has(x.type)) && (wide || inBox(x, wbox)));
    if (works.length) {
      const late = works.filter((x) => (x.gap ?? 0) < -10).sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0));
      const eg = late[0] ?? works[0];
      const egText = `"${eg.title.length > 60 ? eg.title.slice(0, 58) + "…" : eg.title}"${eg.progress != null ? `, ${Math.round(eg.progress)} % done` : ""}`;
      out.push({ id: "works", kind: "works", tone: late.length ? "warn" : "info", score: 50 + Math.min(20, late.length),
        en: `${works.length} PWD ${any ? "" : "water "}${works.length === 1 ? "work" : "works"} under way ${wide ? "in the district" : "here"}${late.length ? `; ${late.length} behind schedule, e.g. ${egText}` : `, e.g. ${egText}`}.`,
        ta: `${wide ? "மாவட்டத்தில்" : "இங்கே"} ${works.length} பொதுப்பணித் துறை பணிகள் நடைபெறுகின்றன${late.length ? `; ${late.length} தாமதம்` : ""}.`,
        pts: (late.length ? late : works).slice(0, 12).map((x) => ({ lat: x.lat, lon: x.lon, label: x.title, value: x.progress != null ? `${Math.round(x.progress)} %` : x.status, kind: "works" as const })),
        at: "" });
    }
  }
  // health: the nearby government hospitals' beds and emergencies
  if (fams.has("HEALTH")) {
    const hs = of("hospital").filter((p) => p.m.bed_occupancy_pct).map((p) => ({ p, m: haversineM(center, p) })).sort((a, b) => a.m - b.m).slice(0, 3);
    if (hs.length) {
      const full = hs.filter((h) => h.p.m.bed_occupancy_pct.v >= 90);
      const h0 = full[0] ?? hs[0];
      const em = h0.p.m.emergency_cases;
      out.push({ id: "hospital", kind: "hospital", tone: full.length ? "warn" : "info", score: 55 + full.length * 5,
        en: `${h0.p.name}: beds ${n1(h0.p.m.bed_occupancy_pct.v)} % occupied${em ? `, ${Math.round(em.v)} emergency cases${em.anomaly || (em.z ?? 0) >= 2 ? " (unusually high)" : ""}` : ""}${hs.length > 1 ? `; ${hs.length - 1} more government ${hs.length === 2 ? "hospital" : "hospitals"} nearby on the map` : ""}.`,
        ta: `${h0.p.name}: படுக்கைகள் ${n1(h0.p.m.bed_occupancy_pct.v)}% நிரம்பியுள்ளன.`,
        pts: hs.map((h) => ({ lat: h.p.lat, lon: h.p.lon, label: h.p.name, value: `${n1(h.p.m.bed_occupancy_pct.v)} % beds`, kind: "hospital" as const })), at: h0.p.at });
    }
  }
  // air: the nearest air-quality station
  if (fams.has("ENVIRONMENT") || fams.has("PUBLIC_SAFETY")) {
    const st = nearest(of("air").filter((p) => p.m.aqi));
    if (st) {
      const v = st.p.m.aqi.v;
      const band = v > 300 ? ["very poor", "மிக மோசம்"] : v > 200 ? ["poor", "மோசம்"] : v > 100 ? ["moderate", "மிதம்"] : v > 50 ? ["satisfactory", "திருப்திகரம்"] : ["good", "நல்லது"];
      out.push({ id: "air", kind: "air", tone: v > 200 ? "alert" : v > 100 ? "warn" : "good", score: v > 100 ? 70 : 30,
        en: `Air quality at ${st.p.name.replace(/,?\s*Chennai\s*-\s*\w+$/i, "")}: AQI ${Math.round(v)}, ${band[0]}${st.m > 1500 ? ` (${fmtDistance(st.m)} away)` : ""}.`,
        ta: `${st.p.name}: காற்றுத் தரக் குறியீடு ${Math.round(v)} (${band[1]}).`,
        pts: [{ lat: st.p.lat, lon: st.p.lon, label: st.p.name, value: `AQI ${Math.round(v)}`, kind: "air" }], at: st.p.at });
    }
  }
  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 4).map(({ score: _s, ...x }) => x);
}

/** The families an answer is about: its filter's categories and families, else (for "all incidents") none. */
export function familiesOf(cats: string[] | null | undefined, families: string[] | null | undefined, w: World): Set<string> {
  const out = new Set<string>(families ?? []);
  for (const c of cats ?? []) { const f = w.cats.get(c)?.family; if (f) out.add(f); }
  return out;
}

/** The middle and the box of an answer's places (the middle 90 %, so a stray far case does not stretch it). */
export function spreadOf(pts: LatLon[], district: Bbox): { center: LatLon; box: Bbox; wide: boolean } {
  if (!pts.length) return { center: { lat: (district.s + district.n) / 2, lon: (district.w + district.e) / 2 }, box: district, wide: true };
  const lat = pts.map((p) => p.lat).sort((a, b) => a - b), lon = pts.map((p) => p.lon).sort((a, b) => a - b);
  const q = (a: number[], f: number) => a[Math.min(a.length - 1, Math.max(0, Math.floor(f * (a.length - 1))))];
  const box = { s: q(lat, 0.05), n: q(lat, 0.95), w: q(lon, 0.05), e: q(lon, 0.95) };
  const span = haversineM({ lat: box.s, lon: box.w }, { lat: box.n, lon: box.e });
  return { center: { lat: q(lat, 0.5), lon: q(lon, 0.5) }, box, wide: span > 18_000 };
}
