/**
 * v12 (21 Nov): which live jam the Collector means by "the most congested road", "the worst jam", "zoom to the jam", and which trouble spot by
 * "the traffic that keeps coming back", with the line Jarvis says about it, written here by code from the spot's own fields, in English and
 * Tamil. Pure and safe in the browser (only types come from ./traffic), so the console (mapops.ts, the Traffic view) and the server
 * (now.ts, the city screen) pick the same spot from the same /api/traffic data and say the same words.
 *
 * Congestion is the jam levels only: very congested, then congested, then slow; then the longer delay, then the longer stretch. Water on a
 * road, an accident, a closure or road works is not congestion: trafficSay ranks water and accidents first as "the worst now", and spots[]
 * is sorted by a score where water (90) and an accident (85) sit above very congested (80), so neither was the most congested road (the
 * owner's session, 21 Nov 06:39: "the most congested road" got the city overview).
 */
import type { TrafficCluster, TrafficLevel, TrafficNow, TrafficSpot } from "./traffic";

/** what each level is called, in both languages (v12: moved here from traffic.ts, which re-exports it, so the browser can say them) */
export const LEVEL_WORD: Record<TrafficLevel, { en: string; ta: string }> = {
  very: { en: "Very congested", ta: "கடும் நெரிசல்" },
  congested: { en: "Congested", ta: "நெரிசல்" },
  slow: { en: "Slow traffic", ta: "மெதுவான போக்குவரத்து" },
  flood: { en: "Water on the road", ta: "சாலையில் தண்ணீர்" },
  accident: { en: "Accident or breakdown", ta: "விபத்து / வாகனப் பழுது" },
  closed: { en: "Road closed", ta: "சாலை மூடல்" },
  works: { en: "Road works", ta: "சாலைப் பணி" }
};

/** the jam levels, worst first; every other level is not congestion */
const JAM_RANK: Partial<Record<TrafficLevel, number>> = { very: 2, congested: 1, slow: 0 };
const rankOf = (s: Pick<TrafficSpot, "level">): number => JAM_RANK[s.level] ?? -1;

/** worst first: very > congested > slow, then the longer delay, then the longer stretch (the same order everywhere: worstJam, jamsRanked) */
export const jamCompare = (a: TrafficSpot, b: TrafficSpot): number =>
  rankOf(b) - rankOf(a) || (b.delayMin ?? 0) - (a.delayMin ?? 0) || (b.lengthM ?? 0) - (a.lengthM ?? 0) || a.name.localeCompare(b.name);

/** The most congested stretch now: very > congested > slow, then the delay, then the length; null when no road is jammed (or TomTom is off). */
export function worstJam(t: Pick<TrafficNow, "spots"> | null | undefined): TrafficSpot | null {
  return jamsRanked(t)[0] ?? null;
}

/** 23 Nov: every jam now, worst first (or calmest first), so "the top three" and "the least congested" read the same order as worstJam */
export function jamsRanked(t: Pick<TrafficNow, "spots"> | null | undefined, order: "most" | "least" = "most"): TrafficSpot[] {
  const jams = (t?.spots ?? []).filter((s) => rankOf(s) >= 0).sort(jamCompare);
  return order === "least" ? jams.reverse() : jams;
}

/** The trouble spot that keeps coming back most: trafficNow's clusters are already sorted that way (a live jam first, then the most reports). */
export function topRepeat(t: Pick<TrafficNow, "clusters"> | null | undefined): TrafficCluster | null {
  return t?.clusters?.[0] ?? null;
}

/**
 * v14 (21 Nov review 13, routing 0): live traffic in one zone only, its jams and its trouble spots, so "the worst jam in Adyar" is Adyar's
 * worst (worstJam and topRepeat read the whole district, and named Teynampet's jam for Adyar); the district's when no zone is given.
 */
export function inZone<T extends Pick<TrafficNow, "spots" | "clusters">>(t: T, zone: number | null | undefined): T {
  if (zone == null) return t;
  return { ...t, spots: (t.spots ?? []).filter((s) => s.zone === zone), clusters: (t.clusters ?? []).filter((c) => c.zone === zone) };
}

/** metres between two points, near enough for a few kilometres (an equirectangular projection) */
const metres = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number => {
  const k = Math.PI / 180, x = (b.lon - a.lon) * k * Math.cos(((a.lat + b.lat) / 2) * k), y = (b.lat - a.lat) * k;
  return Math.sqrt(x * x + y * y) * 6_371_000;
};

/**
 * The spot a Jarvis answer pointed at, in fresher data: the same id, else the jam nearest to where it was (TomTom gives a stretch a new id
 * when it is read again), within 1.5 km; null when there is none.
 */
export function spotNear(t: Pick<TrafficNow, "spots"> | null | undefined, id: string | null, at: { lat: number; lon: number } | null, maxM = 1500): TrafficSpot | null {
  return nearOf(t?.spots ?? [], id, at, maxM);
}
/** the same for anything with an id and a place (a trouble spot: the Traffic view's start) */
export function nearOf<T extends { id: string; lat: number; lon: number }>(xs: readonly T[], id: string | null, at: { lat: number; lon: number } | null, maxM = 1500): T | null {
  const same = id ? xs.find((s) => s.id === id) ?? null : null;
  if (same || !at) return same;
  let best: { s: T; m: number } | null = null;
  for (const s of xs) { const m = metres(at, s); if (m <= maxM && (!best || m < best.m)) best = { s, m }; }
  return best?.s ?? null;
}

/** the same length as the figure a screen tile shows, so the spoken figure is the tile's (km with one decimal, else metres) */
export function lengthTile(m: number | null | undefined): { value: number; unit: "km" | "m" } | null {
  if (m == null || !(m > 0)) return null;
  return m >= 1000 ? { value: Math.round(m / 100) / 10, unit: "km" } : { value: Math.round(m), unit: "m" };
}
/**
 * a length as said: "1.2 km", "300 m" (Tamil: "1.2 கி.மீ", "300 மீ").
 * v13 (21 Nov review, finding 0 12): from the tile's own rounding (lengthTile), so 1150 m is said "1.2 km" as its tile shows (toFixed said 1.1)
 */
export function lengthWords(m: number | null | undefined, lang: "en" | "ta" = "en"): string | null {
  const t = lengthTile(m);
  if (!t) return null;
  return t.unit === "km" ? `${t.value.toFixed(1)} ${lang === "ta" ? "கி.மீ" : "km"}` : `${t.value} ${lang === "ta" ? "மீ" : "m"}`;
}

const n0 = (n: number) => n.toLocaleString("en-IN");

/**
 * What Jarvis says about the most congested stretch: its name and zone, its level, the delay and length TomTom gives, the district's own
 * reports near it, and who answers for it. Every figure is the spot's own; nothing is estimated.
 */
export function spotLine(s: TrafficSpot, lang: "en" | "ta" = "en"): string {
  const reports = s.repeat?.n ?? 0, open = s.repeat?.open ?? 0;
  if (lang === "ta") {
    const len = lengthWords(s.lengthM, "ta");
    return `${s.name}${s.zoneName ? ` (${s.zoneName})` : ""} இப்போது அதிக நெரிசலான சாலை: ${LEVEL_WORD[s.level].ta}${s.delayMin ? `, சுமார் ${s.delayMin} நிமிட தாமதம்` : ""}${len ? `, ${len} தூரத்துக்கு` : ""}.`
      + `${reports >= 2 ? ` கடந்த ஒரு மாதத்தில் அருகில் ${n0(reports)} புகார்கள்${open ? `, ${n0(open)} இன்னும் திறந்தவை` : ""}.` : ""}`
      + ` ${s.owner.ta} இதற்குப் பொறுப்பு; அதன் அட்டையில் அனுப்பும் பொத்தான் உள்ளது.`;
  }
  const len = lengthWords(s.lengthM, "en");
  return `${s.name}${s.zoneName ? ` (${s.zoneName})` : ""} is the most congested now: ${LEVEL_WORD[s.level].en.toLowerCase()}${s.delayMin ? `, about ${s.delayMin} min delay` : ""}${len ? ` over ${len}` : ""}.`
    + `${reports >= 2 ? ` ${n0(reports)} reports near it in the last month${open ? `, ${n0(open)} still open` : ""}.` : ""}`
    + ` ${s.owner.name} answers for it; its card has Send.`;
}

/** What Jarvis says about the trouble spot that keeps coming back: its reports, how many are open, how it is now, and who answers for it. */
export function clusterLine(c: TrafficCluster, lang: "en" | "ta" = "en"): string {
  const n = c.reports.length;
  if (lang === "ta") {
    return `${c.name}${c.zoneName ? ` (${c.zoneName})` : ""}: மீண்டும் மீண்டும் சிக்கல், கடந்த ஒரு மாதத்தில் ${n0(n)} புகார்கள்${c.open ? `, ${n0(c.open)} இன்னும் திறந்தவை` : ""}; இப்போதும் ${LEVEL_WORD[c.level].ta}${c.delayMin ? `, சுமார் ${c.delayMin} நிமிட தாமதம்` : ""}.`
      + ` ${c.owner.ta} இதற்குப் பொறுப்பு; அதன் அட்டையிலிருந்து ஒரே புகாராக அனுப்பலாம்.`;
  }
  return `${c.name}${c.zoneName ? ` (${c.zoneName})` : ""} keeps coming back: ${n0(n)} ${n === 1 ? "report" : "reports"} near it in the last month${c.open ? `, ${n0(c.open)} still open` : ""}; ${LEVEL_WORD[c.level].en.toLowerCase()} again now${c.delayMin ? `, about ${c.delayMin} min delay` : ""}.`
    + ` ${c.owner.name} answers for it; its card sends it as one case.`;
}

/** said when no road is jammed, or no jam keeps coming back (TomTom on); with TomTom off the view says so itself */
export const NO_JAM = { en: "No road is congested right now.", ta: "இப்போது எந்தச் சாலையிலும் நெரிசல் இல்லை." };
export const NO_REPEAT = { en: "No live jam stands where reports keep coming back right now.", ta: "இப்போது மீண்டும் மீண்டும் புகார் வரும் இடத்தில் நெரிசல் இல்லை." };
export const TRAFFIC_OFF = { en: "Live traffic is not switched on: it needs the TomTom key on the server.", ta: "நேரடி போக்குவரத்துத் தகவல் இயக்கப்படவில்லை: சர்வரில் TomTom சாவி தேவை." };
/** v14 (routing 0): the same, for one zone ("no road in Adyar is congested", never another zone's jam) */
export const noJamIn = (zone: string): { en: string; ta: string } => ({ en: `No road in ${zone} is congested right now.`, ta: `இப்போது ${zone} பகுதியில் எந்தச் சாலையிலும் நெரிசல் இல்லை.` });
export const noRepeatIn = (zone: string): { en: string; ta: string } => ({ en: `No live jam in ${zone} stands where reports keep coming back right now.`, ta: `இப்போது ${zone} பகுதியில் மீண்டும் மீண்டும் புகார் வரும் இடத்தில் நெரிசல் இல்லை.` });
