/**
 * v10: the narrated district tour (docs/jarvis/JARVIS_V10.md 4.9 feature 2; the design: v10-research/40-voice-ui-map-reading.md 5.3).
 * "Jarvis, take me round the district": Ask the Map is asked one hotspot question (today's open incidents, the incidents in the news, the
 * flooding); its clusters are the stops, the biggest first. Each stop has one line written here from its own numbers (at most 20 words: the
 * place first, then the count, then what stands out), and the camera's shot that flies to it (lib/map/camera.ts: the hotspot answer's tour
 * shots, 1 to 3; the stops after them are flown to by their first case). "Next", "back", "stop", "repeat" and "go deeper here" steer it; after
 * the third stop it asks before going on (the rule of three). Pure: the console's runner (components/collector/app/thunai/mapops.ts) flies the
 * camera and asks the map.
 */
import type { AskResponse } from "@/lib/map/ask";

export type TourSource = "hotspots" | "news" | "flood";
export type TourEvent = "next" | "back" | "repeat" | "stop" | "deeper";

export interface TourStop {
  id: string;
  /** where it is, as said: "near Kasimedu, Ward 4" */
  place: { en: string; ta: string };
  /** the place's own name, for "go deeper here" (null: none known) */
  name: string | null;
  lat: number;
  lon: number;
  /** the stop's cases (the cluster's), for the map's spot */
  ids: string[];
  /** the stop's own numbers */
  n: number;
  open: number;
  severe: number;
  /** the answer's camera shot that flies here (camera.ts hotspot: 1 + its place in the tour); null past the shots */
  shot: number | null;
  line: { en: string; ta: string };
}

export interface TourState {
  source: TourSource;
  /** the question the stops came from (the tour's answer on the map) */
  question: string;
  /** "today", "this week": the window the stops are from */
  window: { en: string; ta: string };
  stops: TourStop[];
  /** the stop showing */
  i: number;
  /** "shall I go on?" was just asked (after the third stop): a plain yes goes on, a no ends the tour */
  check: boolean;
  /** it was asked once already (it is not asked again on "back" and "next") */
  checked: boolean;
  /** "go deeper here" asked the map about the stop: the tour's answer is shown again before it moves on */
  deeper: boolean;
  phase: "running" | "done" | "stopped";
}

/** the questions a tour asks the map, the first that has two or more clusters wins (each read by the map's rules, no AI: tour10.v10.test.ts) */
export const TOUR_Q: Record<TourSource, { q: string; window: { en: string; ta: string } }[]> = {
  hotspots: [{ q: "hotspots of open incidents today", window: { en: "today", ta: "இன்று" } }, { q: "hotspots of open incidents this week", window: { en: "this week", ta: "இந்த வாரம்" } }],
  news: [{ q: "hotspots of incidents in the news this week", window: { en: "this week", ta: "இந்த வாரம்" } }, { q: "hotspots of incidents in the news in the last 30 days", window: { en: "in the last 30 days", ta: "கடந்த 30 நாட்களில்" } }],
  flood: [{ q: "hotspots of open flooding this week", window: { en: "this week", ta: "இந்த வாரம்" } }, { q: "hotspots of flooding in the last 30 days", window: { en: "in the last 30 days", ta: "கடந்த 30 நாட்களில்" } }]
};
export const TOUR_MAX = 5;
export const TOUR_FULL = 9;
/** the check-in comes after this many stops (the rule of three) */
const CHECK_AFTER = 3;

const what = (s: TourSource, n: number) => s === "news" ? { en: `${n} ${n === 1 ? "report" : "reports"} in the news`, ta: `${n} செய்தி அறிக்கைகள்` }
  : s === "flood" ? { en: `${n} flooding ${n === 1 ? "report" : "reports"}`, ta: `${n} வெள்ள அறிக்கைகள்` } : { en: `${n} ${n === 1 ? "report" : "reports"}`, ta: `${n} அறிக்கைகள்` };

/** one stop's line: the place first, then its count, then what stands out (at most 20 words) */
export function stopLine(st: Omit<TourStop, "line">, k: number, source: TourSource): { en: string; ta: string } {
  const w = what(source, st.n);
  const openEn = st.open === st.n ? (st.n === 1 ? "still open" : "all still open") : `${st.open} still open`;
  const openTa = st.open === st.n ? "அனைத்தும் திறந்தவை" : `${st.open} திறந்தவை`;
  const sevEn = st.severe ? `, ${st.severe} severe` : "";
  const sevTa = st.severe ? `, ${st.severe} கடுமையானவை` : "";
  const top = k === 1 ? "; the biggest cluster" : "";
  const topTa = k === 1 ? "; மிகப் பெரிய கொத்து" : "";
  return { en: `${k}. ${cap(st.place.en)}: ${w.en}, ${openEn}${sevEn}${top}.`, ta: `${k}. ${st.place.ta}: ${w.ta}, ${openTa}${sevTa}${topTa}.` };
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The stops of a hotspot answer: its clusters, biggest first, each with its own numbers from the answer's own cases. */
export function tourStops(r: AskResponse, source: TourSource, max = TOUR_MAX): TourStop[] {
  const clusters = r.extra?.clusters ?? [];
  const cam = r.camera?.tour ?? [];
  const feat = new Map(r.features.map((f) => [f.id, f]));
  const rowWard = new Map(r.rows.map((x) => [x.id, x.ward]));
  return clusters.slice(0, max).map((c, i) => {
    const fs = c.ids.map((id) => feat.get(id)).filter((f): f is NonNullable<typeof f> => !!f);
    // the ward: the camera tour's caption ("1. 12 reports near Kasimedu, Ward 4, 5"), else the cases' commonest
    const capWard = /Ward (\d+)/.exec(cam.find((t) => t.id === c.id)?.caption_en ?? "")?.[1];
    const wards = c.ids.map((id) => rowWard.get(id)).filter((w): w is number => w != null);
    const ward = capWard ? Number(capWard) : mode(wards);
    const name = c.place ?? null;
    const place = name ? { en: `near ${name}${ward ? `, Ward ${ward}` : ""}`, ta: `${name} அருகே${ward ? `, வார்டு ${ward}` : ""}` }
      : ward ? { en: `Ward ${ward}`, ta: `வார்டு ${ward}` } : { en: `stop ${i + 1}`, ta: `இடம் ${i + 1}` };
    const shots = r.shots?.length ?? 0;
    const st = { id: c.id, place, name: name ?? (ward ? `Ward ${ward}` : null), lat: c.lat, lon: c.lon, ids: c.ids, n: c.n,
      open: fs.length ? fs.filter((f) => f.open).length : c.n, severe: fs.filter((f) => f.sev === "Severe").length, shot: i + 1 < shots && i < 3 ? i + 1 : null };
    return { ...st, line: stopLine(st, i + 1, source) };
  });
}
function mode(xs: number[]): number | null {
  if (!xs.length) return null;
  const n = new Map<number, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

/** A tour on a hotspot answer, or null when it has no stops. */
export function startTour(r: AskResponse, source: TourSource, question: string, window: { en: string; ta: string }, full = false): TourState | null {
  const stops = tourStops(r, source, full ? TOUR_FULL : TOUR_MAX);
  if (!stops.length) return null;
  return { source, question, window, stops, i: 0, check: false, checked: false, deeper: false, phase: "running" };
}

const names = (xs: TourStop[], lang: "en" | "ta") => {
  const ns = xs.map((x) => (x.name ?? (lang === "ta" ? x.place.ta : x.place.en)));
  return ns.length <= 1 ? ns.join("") : lang === "ta" ? `${ns.slice(0, -1).join(", ")}, ${ns[ns.length - 1]}` : `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`;
};
const TITLE: Record<TourSource, { en: string; ta: string }> = {
  hotspots: { en: "Hotspots", ta: "அதிகம் குவிந்த இடங்கள்" }, news: { en: "The places in the news", ta: "செய்திகளில் வந்த இடங்கள்" }, flood: { en: "Flooding", ta: "வெள்ளம்" }
};
/** Before stop 1: how many stops, which, and how to steer. */
export function introLine(s: TourState): { en: string; ta: string } {
  const n = s.stops.length;
  const t = TITLE[s.source];
  return {
    en: `${t.en} ${s.window.en}: ${n} ${n === 1 ? "stop" : "stops"}, ${names(s.stops.slice(0, 3), "en")}${n > 3 ? " and more" : ""}. Say next, back, stop or go deeper.`,
    ta: `${t.ta}, ${s.window.ta}: ${n} இடங்கள், ${names(s.stops.slice(0, 3), "ta")}${n > 3 ? " மற்றும் பல" : ""}. அடுத்து, முந்தைய, நிறுத்து அல்லது ஆழமாக என்று சொல்லுங்கள்.`
  };
}
/** After the third stop: ask before going on, naming what is left. */
export function checkLine(s: TourState): { en: string; ta: string } {
  const left = s.stops.slice(s.i + 1);
  return { en: `Shall I go on? ${left.length} more: ${names(left.slice(0, 3), "en")}.`, ta: `தொடரவா? இன்னும் ${left.length}: ${names(left.slice(0, 3), "ta")}.` };
}
const LAST = { en: "That was the last stop. Say go deeper, or stop.", ta: "இது கடைசி இடம். ஆழமாக அல்லது நிறுத்து என்று சொல்லுங்கள்." };

export interface TourMove {
  s: TourState;
  /** the stop to fly to and show (null: nothing moves) */
  stop: TourStop | null;
  /** what to say, written here */
  say: { en: string; ta: string };
  /** the tour has ended (stopped, or past its last stop) */
  end?: boolean;
}

/** One step of the tour. */
export function tourStep(s: TourState, ev: TourEvent): TourMove {
  const at = (i: number, extra: { en: string; ta: string } | null = null): TourMove => {
    const stop = s.stops[i];
    const check = i === CHECK_AFTER - 1 && s.stops.length > CHECK_AFTER && !s.checked;
    const s2: TourState = { ...s, i, deeper: false, check, checked: s.checked || check };
    const tail = check ? checkLine(s2) : i === s.stops.length - 1 ? LAST : null;
    const say = [extra, stop.line, tail].filter((x): x is { en: string; ta: string } => !!x);
    return { s: s2, stop, say: { en: say.map((x) => x.en).join(" "), ta: say.map((x) => x.ta).join(" ") } };
  };
  if (s.phase !== "running") return { s, stop: null, say: { en: "No tour is running.", ta: "சுற்றுலா எதுவும் நடக்கவில்லை." }, end: true };
  switch (ev) {
    case "stop": return { s: { ...s, phase: "stopped" }, stop: null, say: { en: "Tour ended. The map stays where it is.", ta: "சுற்றுலா முடிந்தது. வரைபடம் அப்படியே இருக்கும்." }, end: true };
    case "deeper": return { s: { ...s, deeper: true, check: false }, stop: s.stops[s.i], say: { en: "", ta: "" } };
    case "repeat": return at(s.i);
    case "back": return s.i === 0 ? at(0, { en: "This is the first stop.", ta: "இதுவே முதல் இடம்." }) : at(s.i - 1);
    case "next": {
      if (s.i + 1 >= s.stops.length) return { s: { ...s, phase: "done" }, stop: null, say: { en: `That was the last of ${s.stops.length} stops. The tour is over.`, ta: `${s.stops.length} இடங்களில் கடைசியைப் பார்த்தோம். சுற்றுலா முடிந்தது.` }, end: true };
      return at(s.i + 1);
    }
  }
}

/** The first stop, said after the intro. */
export function firstMove(s: TourState): TourMove {
  const m = tourStep({ ...s, i: 0 }, "repeat");
  const intro = introLine(s);
  return { ...m, say: { en: `${intro.en} ${m.say.en}`, ta: `${intro.ta} ${m.say.ta}` } };
}
