/**
 * v12 (21 Nov, map-traffic-flood-routing RC3-RC5): what a city screen of Jarvis's opens on the Overview's map behind it (Thunai.tsx putStage
 * dispatches it as "diq:open-city"; CollectorApp's openCity takes it). The Live traffic view on the spot the screen is about (its "spot" map
 * point: the most congested stretch, or the trouble spot that keeps coming back, on the "Keeps coming" tab), with where it was so the view
 * finds it again in fresher data; Rain & flooding on its tab and on the past rain asked for ("latest": the last heavy rain with reports).
 * Before, every city screen opened the view on nothing in particular: "the most congested road" showed the whole district and "the last
 * rain" every rain. Pure; the point's label goes to the HUD's reticle.
 */
import type { CityOpen } from "../CollectorApp";
import { ZONE_NAMES } from "@/lib/thunai/lexicon";
import { CATEGORY_LABELS } from "@/lib/thunai/narrate";

interface CityDoc {
  recipe?: string | null;
  slots?: Record<string, unknown> | null;
  /** a screen's blocks (stage.ts): only the MapView "spot" one is read, its first point */
  blocks: readonly { kind: string; id?: string; points?: readonly unknown[] }[];
}
type Point = { id: string; lat: number; lon: number; label: string };
const isPoint = (x: unknown): x is Point => {
  const p = x as Partial<Point> | null;
  return !!p && typeof p.id === "string" && Number.isFinite(p.lat) && Number.isFinite(p.lon) && typeof p.label === "string";
};

/** The view a city screen opens, and the place to ring on the map (null: none); null for any other screen. */
export function cityOpenOf(doc: CityDoc): { detail: CityOpen; focus: { label: string; lat: number; lon: number } | null } | null {
  if (doc.recipe !== "city") return null;
  const sl = doc.slots ?? {};
  const q = String(sl.q ?? "all");
  const b = doc.blocks.find((x) => x.kind === "MapView" && x.id === "spot");
  const p0 = b?.points?.[0];
  const p = isPoint(p0) ? p0 : null;
  const repeat = sl.focus === "repeat";
  if (q === "traffic" || q === "all") {
    // v14 (21 Nov review 13, routing 5): a zone's live traffic opens the view on that zone ("Show live traffic in Adyar" showed the district)
    const zs = q === "traffic" && Array.isArray(sl.zones) ? sl.zones.filter((z): z is number => Number.isInteger(z) && z >= 1 && z <= 15) : [];
    const detail: CityOpen = { kind: "traffic",
      ...(p ? (repeat ? { cluster: p.id, tab: "repeat" as const } : { spot: p.id }) : repeat ? { tab: "repeat" as const } : {}),
      ...(p ? { lat: p.lat, lon: p.lon } : {}), ...(zs.length === 1 ? { zone: zs[0] } : {}) };
    return { detail, focus: p ? { label: p.label, lat: p.lat, lon: p.lon } : null };
  }
  const rain = typeof sl.rain === "string" && /^(?:latest|rain-\d{4}-\d{2}-\d{2})$/.test(sl.rain) ? sl.rain : null;
  return { detail: { kind: "rain", lens: q === "power" || q === "metro" ? q : "flood", ...(rain ? { replay: rain } : {}) }, focus: null };
}

/** what the console has open now, as putStage reads it (CollectorApp's TrafficStart and RainStart, and the page) */
export interface CityViewsNow { page: string | null; traffic: { spot?: string | null; cluster?: string | null; tab?: "repeat" | null; zone?: number | null } | null; rain: { rain?: string | null; lens?: string | null } | null }
/**
 * v14 (21 Nov review 13, scenarios 8): how a city screen's view goes up when something is open already. "same": Live traffic is open on that
 * very spot, trouble spot, tab and zone, so nothing is opened again (a new seq remounted it: it read /api/traffic again, reset its camera and
 * dropped the card the Collector had open). "bridge": Rain & flooding is open, so it moves to the tab and rain in place (cityBridgeArgs). "open":
 * open it afresh, as before.
 */
export function cityViewMove(detail: CityOpen, now: CityViewsNow): "same" | "bridge" | "open" {
  if (now.page !== "overview") return "open";
  if (detail.kind === "traffic") {
    const t = now.traffic;
    const same = !!t && (t.spot ?? null) === (detail.spot ?? null) && (t.cluster ?? null) === (detail.cluster ?? null)
      && (t.tab ?? null) === (detail.tab ?? null) && (t.zone ?? null) === (detail.zone ?? null);
    return same ? "same" : "open";
  }
  return now.rain ? "bridge" : "open";
}
/** v14 (scenarios 8): the Rain view's move in place (askmap/bridge.ts "rain"): its tab, and the rain asked for or all of them ("all") */
export const cityBridgeArgs = (detail: Extract<CityOpen, { kind: "rain" }>): Record<string, unknown> => ({ tab: detail.lens === "flood" ? "flooding" : detail.lens, rain: detail.replay ?? "all" });

/**
 * v14 (21 Nov review 13, routing 1): a command said about the in-place city screen, whose Stage is not mounted (Thunai.tsx stageInPlace), so
 * the Stage's own close, back, full screen and table did nothing anyone could see. "close": its view (Live traffic, or Rain & flooding) and
 * the corner card close; "back": the view goes back one level, else closes; "details" (also "full screen", "expand it", "show details", "open
 * the details"): the Stage opens on it; "view": the Stage opens on it, then shows it as a table or chart. Null: not one of these.
 */
const DETAILS = /^(?:(?:ok|okay|now|so|then|please|jarvis|just|can you|could you)\s+)*(?:show|open|see|give|expand|view)(?: me)?(?: (?:the|its|it'?s|all the|more))?\s*details?(?: (?:please|of it|of this|of that))?$|^(?:the )?details?(?: please)?$|^(?:open|expand|show) (?:it|this|that)(?: (?:up|full|in full|full screen|fully))?$|^(?:more|full) details?$|^விவரங்கள்(?: காட்டு)?$/iu;
export function inPlaceCommand(said: string, lc: { op: string; view?: string } | null): "close" | "back" | "details" | "view" | null {
  const t = String(said ?? "").normalize("NFC").replace(/[.!?,]+/g, " ").replace(/\s+/g, " ").trim();
  if (DETAILS.test(t)) return "details";
  if (!lc) return null;
  if (lc.op === "close") return "close";
  if (lc.op === "back") return "back";
  if (lc.op === "full") return "details";
  if (lc.op === "view" && lc.view !== "map") return "view";
  return null;
}
/** v14 (routing 1 and 10): the line said when a city view is closed by voice */
export const VIEW_CLOSED: Record<"traffic" | "rain", { en: string; ta: string }> = {
  traffic: { en: "Live traffic is closed.", ta: "நேரடி போக்குவரத்து மூடப்பட்டது." },
  rain: { en: "Rain and flooding is closed.", ta: "மழை & வெள்ளம் மூடப்பட்டது." }
};

/**
 * v14 (21 Nov review 13, scenarios 0, routing 8): does the last city answer outlive this turn? Only a city screen (or a command on one), a pure
 * camera move ("zoom in a bit", "Ask the Map: zoom"), small talk ("thanks"), a map op still at work (its own end writes it) and a turn that
 * answered nothing keep it. Any other answer replaces it: words, the news, an Ask the Map answer, a Rain op, console steps. Before, only
 * putStage and the map lane's city op wrote it, so "show it on the map" after a words answer about power reopened Live traffic.
 */
export function keepsLastCity(heard: string, did: string, doc: { recipe?: string | null } | null | undefined, isSmallTalk: (s: string) => boolean): boolean {
  if (doc?.recipe === "city") return true;
  if (/^Ask the Map: zoom\b|\(still working\)$/.test(did) || /^Zoom in(?:; Zoom in)*$/.test(did)) return true;
  if (/^took too long: nothing was answered$/.test(did)) return true;
  return did === "answered in words" && isSmallTalk(heard);
}

/**
 * v14 (21 Nov review 13, scenarios 4): what the open screen is about, for "show its complaints on the map": its zone and its kind of complaint
 * as Ask the Map reads them ("complaints in Adyar", "Flooding & waterlogging complaints"); null when it is about the whole district.
 */
export function screenSubject(doc: { scope?: { zone?: number | null; cat?: string | null } | null } | null | undefined): { place: string | null; what: string | null } | null {
  const z = doc?.scope?.zone ?? null;
  const place = z != null && Number.isInteger(z) && z >= 1 && z <= ZONE_NAMES.length ? ZONE_NAMES[z - 1] : null;
  const cat = doc?.scope?.cat ?? null;
  const what = cat ? CATEGORY_LABELS.find((c) => c.code === cat)?.label ?? null : null;
  return place || what ? { place, what } : null;
}
