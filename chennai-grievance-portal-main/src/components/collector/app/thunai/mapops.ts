/**
 * v10: Ask the Map's operations, run by Jarvis in the page (docs/jarvis/v10-research/50-askmap-anatomy.md 4: Jarvis already holds the Console's
 * `mapAsk`, the useMapAsk instance, and the client-safe helpers beside it). One map operation (lib/thunai/v10/map10.ts MapCmd) in, what to say
 * out, written here from the answer's own numbers (never a model's), or null when there is nothing to say.
 *
 *   - questions, follow-ups, circles and chips go through `mapAsk.ask` / `mapAsk.run` with the chip edited by `applyChip`, as the panel does;
 *   - the camera's shots through `mapAsk.replay` (and the hotspot's cases spotted, as the panel's tour buttons do);
 *   - the layers, the heat view, the base map, the Export sheet, the Send dialog's drafts, the suggestions tray and Rain's tabs through the
 *     window event `diq:map-cmd` (askmap/bridge.ts), where that state lives inside a component;
 *   - export: `downloadAnswer` (the server still asks for the password); save: `saveView`, only after the Collector's yes or tap (level B);
 *     send: the drafts open, nothing more (Approve and the password stay the Collector's); the visit order: `visitOrder` on the map, its Google
 *     Maps link left to the Collector's click; the AI analyst: POST /api/map/insight, its sentences kept only when their numbers are the answer's;
 *   - the narrated district tour (lib/thunai/v10/tour10.ts): one hotspot question, then stop by stop on the camera's shots.
 *
 * Jarvis never sends, approves or deletes here.
 */
import type { MapCmd, MapCtx10 } from "@/lib/thunai/v10/map10";
import type { Lang } from "@/lib/thunai/types";
import type { AskResponse } from "@/lib/map/ask";
import { applyChip } from "@/lib/map/chips";
import { fmtDistance } from "@/lib/map/geom";
import { allowedSet, figuresIn, gateChunk } from "@/lib/thunai/numbergate";
import { deptFromWords } from "@/lib/assistant/deptwords";
import type { RefNames } from "@/lib/assistant/scope";
import { firstMove, startTour, TOUR_Q, tourStep, type TourState, type TourStop } from "@/lib/thunai/v10/tour10";
import { clusterLine, inZone, nearOf, NO_JAM, NO_REPEAT, noJamIn, noRepeatIn, spotLine, spotNear, topRepeat, TRAFFIC_OFF, worstJam } from "@/lib/city/pick";
import type { CityLast, CityLastIn } from "@/lib/city/intent";
import { ZONE_NAMES } from "@/lib/thunai/lexicon";
import { VIEW_CLOSED } from "./cityopen";
import type { TrafficNow } from "@/lib/city/traffic";
import { downloadAnswer, planVisits, saveView } from "../askmap/actions";
import { mapCmd as bridgeCmd, type BridgeOp, type BridgeReply } from "../askmap/bridge";
import { answerGist, type MapAsk } from "../askmap/useMapAsk";
import type { Console } from "../CollectorApp";

/** what Jarvis says: English and Tamil, and the figures the voice may say (the line's own, written here from the answer) */
// v14 (21 Nov review 13, scenarios 7): `shown`, what a city op opened (the jam it picked, with where it is), for the next "show me in the map"
export interface MapLine { en: string; ta: string; allowed?: Set<string>; shown?: CityLast | null }

export interface MapOpsDeps {
  lang: Lang;
  /** the console's Ask the Map entry v9 used (the dev harness has only this): the question asked, nothing awaited */
  askOnMap?: (q: string) => void;
  /** the console's Ask the Map, read fresh each time (the host is a new object on every render) */
  map?: () => MapAsk | null | undefined;
  /** the map grown on the Overview, the console's panels and Jarvis's Stage out of the way (CollectorApp's askOnMap without a question) */
  openMap?: () => void;
  /** resolves when the console has finished what the last step asked (host.settled) */
  settled?: () => Promise<void>;
  /** Rain & flooding: open it, whether it is open, close it, back one level (false: nothing to go back from) */
  rain?: { open?: () => void; isOpen?: () => boolean; close?: () => void; back?: () => boolean };
  /** the console's departments, for "send these to Metro Water" */
  depts?: () => { code: string; name: string }[];
  /** Jarvis's own card (hud.panel) */
  show?: (card: { id: string; title: string; takeaway: string | null; figures: { label: string; value: number; unit: string | null }[]; source: string | null }) => void;
  /** the reticle on a place (the HUD's focus); null takes it away */
  point?: (p: { label: string; lat: number; lon: number } | null) => void;
  /** a level-B yes: the question shown and said; `act` runs on the Collector's spoken yes or tap, and what it returns is said */
  askYes?: (q: { en: string; ta: string }, act: () => Promise<MapLine | null>) => void;
  /** the window events (tests pass their own) */
  bridge?: (op: BridgeOp, args?: Record<string, unknown>) => BridgeReply | null;
  /** opens Rain & flooding on a rain or a tab ("diq:rehearsal", which the console's RainBand listens for) */
  rehearsal?: (detail: { replay: string | null; manual: boolean; stop?: "check" | null; lens?: "traffic" | "power" | "metro" }) => void;
  /** v12 (21 Nov): the Live traffic view on the Overview's map, opened on a spot, a trouble spot or the "Keeps coming" tab (Jarvis's Stage out
   * of the way, so the map shows); `lat`/`lon`: where the spot was, for the view to find it again in fresher data */
  // (v14, 21 Nov review 13 routing 0 and 10: on a zone's filter; and closed by voice)
  traffic?: { open: (o: { spot?: string | null; cluster?: string | null; tab?: "repeat" | null; lat?: number | null; lon?: number | null; zone?: number | null }) => void;
    /** v13 (21 Nov review, finding 1 7): what the Live traffic view is open on now (null: closed), so asking for the same spot again does not remount it */
    current?: () => { spot: string | null; cluster: string | null; tab: "repeat" | null; zone?: number | null } | null;
    close?: () => void };
  /** v13 (finding 1 6): Jarvis's Stage out of the way, so the map under it shows (every view that opens on the map calls it first) */
  clearStage?: () => void;
  /** v12: the Overview's map camera: in, out (its own + and − buttons), or to a point (the console's focus: it flies there and rings it) */
  camera?: { zoom: (dir: "in" | "out") => boolean; flyTo: (p: { label: string; lat: number; lon: number }) => boolean };
  /** v12: a zone or taluk the console can place itself, by its name (the map's own geography) */
  place?: (name: string) => { lat: number; lon: number } | null;
  /** v12: the Overview page in front, Jarvis's Stage and the console's panels out of the way, the map as it is (not grown: that closes the views) */
  toOverview?: () => void;
  /** v12: the past rains' record Rain & flooding reads (the dev preview has its own) */
  rainsApi?: () => string;
  /**
   * v12 (21 Nov, stale-and-double RC5): the turn's own stop. Jarvis passes its turn's signal, so a newer sentence stops the map question in
   * flight (useMapAsk) and the city reads; an operation whose turn has ended does nothing more after its next wait
   */
  signal?: AbortSignal;
  /** v12 (understanding RC13): resolves once the Overview's map is drawn, or after a short wait (whenMapReady below) */
  mapReady?: () => Promise<void>;
  fetch?: typeof fetch;
  download?: typeof downloadAnswer;
  save?: typeof saveView;
}

// ------------------------------------------------------------------ state kept between turns --

/** the tour running, and the answer it is on */
let tour: { s: TourState; resp: AskResponse } | null = null;
/** the suggested questions Jarvis read out last, and the answer on the map then ("ask the second one" means these while it is still there) */
let readOut: { list: string[]; resp: AskResponse | null } | null = null;
/** a tour the Collector left by shrinking the map: ended there, but its spotted cases and the HUD's reticle still on its last stop until the next
 * map operation clears them; "stop the tour" then says it ended (v10 review 2, round 2: they stayed, and "stop" said no tour was running) */
let left: TourState | null = null;
export const tourNow = (): TourState | null => (tour?.s.phase === "running" ? tour.s : null);
/** for tests */
export function resetMapOps() { tour = null; readOut = null; left = null; }

/**
 * Ask the Map's state for Jarvis's lanes (map10.ts MapCtx10 without the language), from the console's useMapAsk instance.
 * v12 (21 Nov): `lastCity`, the part of the city the last answer showed (Thunai passes it: the open city screen's, else the last city turn's);
 * without it, the Live traffic view or Rain & flooding open, else Ask the Map's own city answer, says it.
 */
export function mapSnap10(m: Partial<MapAsk> | null | undefined, o: { rainOpen?: boolean; trafficOpen?: boolean; lastCity?: CityLastIn; world?: MapCtx10["world"]; subject?: MapCtx10["subject"] } = {}): Omit<MapCtx10, "lang"> {
  const r = m?.resp ?? null;
  // the tour lives on the grown map: the map found shrunk (the Collector moved on without saying stop) ends it, so its "go back", "again" and
  // "show me more" are the console's again, and it does not come back when the map is grown for another question (v10 review 2, finding 14)
  if (tour && !m?.grown) { left = tour.s; tour = null; }
  const t = tourNow();
  const cur = r ? (m?.turns ?? []).find((x) => x.resp === r) ?? null : null;
  return {
    open: !!m?.grown,
    hasAnswer: !!r && r.kind === "answer" && !!r.plan,
    kind: r?.kind ?? null,
    total: r?.total ?? 0,
    question: cur?.q ?? null,
    shots: r?.shots?.length ?? 0,
    shot: m?.cue?.index ?? 0,
    chips: (r?.chips ?? []).map((c) => c.en),
    chipOpts: (r?.chips ?? []).map((c) => ({ id: c.id, en: c.en, ta: c.ta, removable: c.removable, options: c.options.map((x) => ({ key: x.key, en: x.en, ta: x.ta, on: x.on })) })),
    suggest: (readOut && readOut.resp === r ? readOut.list : null) ?? r?.followups ?? [],
    rainOpen: !!o.rainOpen,
    tour: !!t,
    tourCheck: !!t?.check,
    // v13 (21 Nov review, finding 0 4): Thunai's explicit null means the last answer was not the city's (a list of cases after the traffic):
    // "show them on the map" is then that answer's, never the Live traffic view still open; only a caller that passes nothing gets the fallbacks
    lastCity: o.lastCity !== undefined ? o.lastCity : (o.trafficOpen ? "traffic" : o.rainOpen ? "flood" : r?.city?.topic ?? null),
    // v14 (21 Nov review 13): the Live traffic view open (routing 10), the console's places (routing 0), the open screen's subject (scenarios 4)
    ...(o.trafficOpen ? { trafficOpen: true } : {}), ...(o.world ? { world: o.world } : {}), ...(o.subject ? { subject: o.subject } : {})
  };
}

/** v13 (21 Nov review, finding 1 7): what a city op the map lane ran showed, as the last city answer (its topic, focus, rain and spot) */
export function cityShownBy(cmd: Pick<MapCmd, "op" | "topic" | "focus" | "rain" | "spot" | "zone" | "act">): CityLast | null {
  if (cmd.op !== "city" || !cmd.topic || cmd.act === "close") return null;
  return { topic: cmd.topic, focus: cmd.focus ?? null, rain: cmd.rain ?? null, spot: cmd.spot?.id ?? null, lat: cmd.spot?.lat ?? null, lon: cmd.spot?.lon ?? null, ...(cmd.zone ? { zone: cmd.zone } : {}) };
}

/**
 * v14 (21 Nov review 13, routing 8, scenarios 0 and 7): the last city answer after a map op. A city op: what it opened (the jam it picked, with
 * where it is: the next "show me in the map" finds that jam again, not a fresher read's worst); a Rain op: its tab's part of the city; a
 * camera move keeps the one before (`prev`: "zoom in a bit", then "show me in the map"); any other op (an Ask the Map answer, a layer, a
 * close) replaces it with nothing, so "show them on the map" is never an older question's view.
 */
export function cityAfterMap(cmd: MapCmd, line: MapLine | null | undefined, prev: CityLast | null): CityLast | null {
  if (cmd.op === "zoom") return prev;
  if (cmd.op === "city") return cmd.act === "close" ? null : line?.shown ?? cityShownBy(cmd);
  if (cmd.op === "rain" && cmd.act !== "close" && cmd.act !== "back") {
    const tab = cmd.tab ?? "flooding";
    return tab === "flooding" ? { topic: "flood", focus: null, rain: cmd.rain ?? null } : tab === "power" || tab === "metro" ? { topic: tab, focus: null, rain: null } : null;
  }
  return null;
}

/** How sure Jarvis must be that it was spoken to (Thunai.tsx needsName): saving and exporting keep something (B), the drafts are C. */
export function mapRisk(cmd: MapCmd): "A" | "B" | "C" {
  return cmd.op === "send" ? "C" : cmd.op === "save" || cmd.op === "export" ? "B" : "A";
}

/**
 * v12 (21 Nov, understanding RC13): resolves when the Overview's map is drawn (Leaflet's container inside the map card), at once when it
 * already is, else after `ms` at most (or when `signal` stops the turn). A step that moves the camera or opens a view on a spot waits for it,
 * so it never acts on a map that has not mounted yet: a page step and a map step in one plan ran in the same instant.
 */
export function whenMapReady(ms = 1500, signal?: AbortSignal | null): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const ready = () => !!document.querySelector(".a-map .leaflet-container");
  if (ready()) return Promise.resolve();
  const t0 = Date.now();
  return new Promise<void>((res) => {
    const tick = () => { if (ready() || signal?.aborted || Date.now() - t0 >= ms) res(); else setTimeout(tick, 50); };
    setTimeout(tick, 50);
  });
}

/** The console's own pieces as the executor's (Thunai.tsx passes its host and its HUD, and its turn's signal). */
export function consoleMapDeps(host: () => { c: Console; settled?: () => Promise<void> }, ui: Pick<MapOpsDeps, "lang" | "show" | "point" | "askYes" | "signal"> & { clearStage?: () => void }): MapOpsDeps {
  const c = () => host().c;
  return {
    ...ui,
    mapReady: () => whenMapReady(1500, ui.signal),
    askOnMap: (q) => c().askOnMap?.(q),
    // the dev harness's console has a stand-in with only setGrown: no Ask the Map to drive there
    map: () => { const m = c().mapAsk; return m && typeof m.ask === "function" ? m : null; },
    openMap: () => { const x = c(); ui.clearStage?.(); x.closeAll?.(); x.setAsk?.(false); x.setPage?.("overview"); x.mapAsk?.setGrown?.(true); },
    settled: () => host().settled?.() ?? Promise.resolve(),
    rain: { open: () => { ui.clearStage?.(); c().openRain?.(); }, isOpen: () => !!c().rainView?.open, close: () => c().rainView?.close(), back: () => c().rainView?.esc.current?.() ?? false },
    depts: () => c().depts.map((d) => ({ code: d.code, name: d.name })),
    rehearsal: (detail) => { ui.clearStage?.(); window.dispatchEvent(new CustomEvent("diq:rehearsal", { detail })); },
    // v12 (21 Nov): the Live traffic view on a spot, the map's camera, the console's own places
    traffic: { open: (o) => { ui.clearStage?.(); const x = c(); x.closeAll?.(); x.setAsk?.(false); x.openCity?.({ kind: "traffic", spot: o.spot ?? null, cluster: o.cluster ?? null, tab: o.tab ?? null, lat: o.lat ?? null, lon: o.lon ?? null, ...(o.zone ? { zone: o.zone } : {}) }); },
      // v13 (finding 1 7): what the view was opened on (CollectorApp's TrafficStart), read fresh (v14: with its zone; on the Overview only, where it shows)
      current: () => { const x = c(), v = x.trafficView?.open; return v && (!x.page || x.page === "overview") ? { spot: v.spot ?? null, cluster: v.cluster ?? null, tab: v.tab ?? null, ...(v.zone ? { zone: v.zone } : {}) } : null; },
      // v14 (routing 10): put away by voice
      close: () => { ui.clearStage?.(); c().trafficView?.close(); } },
    camera: {
      // the Overview map's own + and − (SatMap's tools): the same zoom a tap gives
      zoom: (dir) => {
        if (typeof document === "undefined") return false;
        const b = document.querySelector<HTMLButtonElement>(`.a-map .map-tools button[aria-label="${dir === "in" ? "Zoom in" : "Zoom out"}"]`);
        if (!b) return false;
        b.click();
        return true;
      },
      // the console's focus: the map flies there and rings it, with its "Back to previous view"
      flyTo: (p) => { const x = c(); if (typeof x.highlight !== "function") return false; x.highlight({ id: `place:${p.label}`, lat: p.lat, lon: p.lon }); return true; }
    },
    place: (name) => {
      const g = c().geo, n = name.trim().toLowerCase();
      const z = g?.zones.find((x) => x.name.toLowerCase() === n) ?? g?.taluks.find((x) => x.name.toLowerCase() === n);
      return z ? { lat: z.lat, lon: z.lon } : null;
    },
    toOverview: () => { ui.clearStage?.(); const x = c(); x.closeAll?.(); x.setAsk?.(false); x.setPage?.("overview"); },
    rainsApi: () => c().rainView?.api.rains ?? "/api/rehearsal/rains"
  };
}

// ------------------------------------------------------------------ the words --

/** a line written here: its figures are its own (the gate lets through exactly what code put in it) */
const L = (en: string, ta: string): MapLine => ({ en, ta, allowed: allowedSet([...figuresIn(en), ...figuresIn(ta)].map((f) => f.value)) });
const NO_ANSWER = (): MapLine => L("There's no answer on the map yet. Ask it a question first.", "வரைபடத்தில் இன்னும் பதில் இல்லை. முதலில் ஒரு கேள்வி கேளுங்கள்.");
const NO_MAP = (): MapLine => L("The map isn't on screen. Open the Overview first.", "வரைபடம் திரையில் இல்லை. முதலில் மேலோட்டத்தைத் திறக்கவும்.");
const km = (m: number, ta = false) => fmtDistance(m, ta ? "ta" : "en");
const clampM = (m: number) => Math.max(50, Math.min(5000, Math.round(m)));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** an area brief in one line: its open issues, the commonest kind, the past-deadline ones */
function briefLine(r: AskResponse, label: { en: string; ta: string } = r.brief!.label): MapLine {
  const b = r.brief!;
  const top = b.byType[0];
  const overdue = b.depts.reduce((a, x) => a + x.overdue, 0);
  return L(`${label.en}: ${b.open.n} open ${b.open.n === 1 ? "issue" : "issues"}${top ? `, most of them ${top.en.toLowerCase()} (${top.n})` : ""}${overdue ? `; ${overdue} past deadline` : ""}.`,
    `${label.ta}: ${b.open.n} திறந்த பிரச்சனைகள்${top ? `, அதிகம் ${top.ta} (${top.n})` : ""}${overdue ? `; ${overdue} காலக்கெடு தாண்டியவை` : ""}.`);
}
/** what the map answered, in a line: its headline's gist, an area brief, or its own sentence */
function answered(r: AskResponse | null, d: MapOpsDeps, lead: MapLine | null = null): MapLine | null {
  const join = (x: MapLine) => (lead ? L(`${lead.en} ${x.en}`, `${lead.ta} ${x.ta}`) : x);
  if (!r) {
    const m = d.map?.();
    if (d.rain?.isOpen?.()) return join(L("That opened Rain and flooding.", "அது மழை & வெள்ளத்தைத் திறந்தது."));
    if (m?.error) return join(L(`The map couldn't answer: ${m.error}`, "வரைபடத்தால் இப்போது பதில் சொல்ல முடியவில்லை."));
    return lead;
  }
  if (r.kind === "brief" && r.brief) return join(briefLine(r));
  if (r.kind === "say" && r.say) return join(L(r.say.en, r.say.ta));
  if (r.kind === "ui") return join(L("Done on the map's panel.", "வரைபடப் பலகையில் செய்யப்பட்டது."));
  const en = answerGist(r, "en").replace(/ · /g, ", "), ta = answerGist(r, "ta").replace(/ · /g, ", ");
  return join(L(`${cap(en)}.`, `${ta}.`));
}

/** the map grown and settled, and its state now */
async function grow(d: MapOpsDeps): Promise<MapAsk | null> {
  d.openMap?.();
  await d.settled?.().catch(() => undefined);
  return d.map?.() ?? null;
}
const answerOf = (d: MapOpsDeps): AskResponse | null => { const r = d.map?.()?.resp ?? null; return r && r.kind === "answer" && r.plan ? r : null; };
/** v12 (RC5): a map question asked with the turn's stop when there is one (the dev harness and the tests pass none: asked as before) */
const askQ = (m: MapAsk, q: string, d: MapOpsDeps) => (d.signal ? m.ask(q, { signal: d.signal }) : m.ask(q));
const bridge = (d: MapOpsDeps, op: BridgeOp, args: Record<string, unknown> = {}) => (d.bridge ?? bridgeCmd)(op, args);
/** the shown turn's question (not the history's last: anatomy 4.4 bug 8) */
const questionOf = (m: MapAsk | null, r: AskResponse) => m?.turns?.find((t) => t.resp === r)?.q ?? null;

const LAYER_NAME: Record<string, [string, string]> = {
  schools: ["Schools", "பள்ளிகள்"], colleges: ["Colleges", "கல்லூரிகள்"], hospitals: ["Hospitals", "மருத்துவமனைகள்"], fire_stations: ["Fire stations", "தீயணைப்பு நிலையங்கள்"],
  police: ["Police stations", "காவல் நிலையங்கள்"], rail_metro: ["Rail and metro", "ரயில், மெட்ரோ"], water_bodies: ["Lakes and ponds", "ஏரிகள், குளங்கள்"], waterways: ["Rivers and canals", "ஆறுகள், கால்வாய்கள்"],
  news: ["News reports", "செய்தி அறிக்கைகள்"], live_rain: ["Rain in the last 24 hours", "கடந்த 24 மணி நேர மழை"], live_lakes: ["Lake levels", "ஏரி நீர்மட்டம்"], live_works: ["PWD works", "பொதுப்பணித் துறை வேலைகள்"],
  live_hospitals: ["Government hospital beds", "அரசு மருத்துவமனைப் படுக்கைகள்"], live_air: ["Air quality", "காற்றின் தரம்"]
};
const TAB_NAME: Record<string, [string, string]> = { flooding: ["Flooding", "வெள்ளம்"], traffic: ["Traffic", "போக்குவரத்து"], power: ["Power", "மின்சாரம்"], metro: ["Metro", "மெட்ரோ"] };
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const rainDay = (id: string) => { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(id); return m ? `${Number(m[3])} ${MONTH[Number(m[2]) - 1]} ${m[1]}` : id; };

/** the department said, as the console's code: its name or short name ("Metro Water", "SWD", "Storm Water Drains"), Tamil names too */
const TA_DEPT: [RegExp, string][] = [[/மெட்ரோ ?வாட்டர்|குடிநீர்/u, "metro water"], [/ஸ்டார்ம் ?வாட்டர்|மழைநீர் வடிகால்|வடிகால்/u, "storm water drain department"],
  [/மின்சார வாரிய|மின் வாரிய|டான்ஜெட்கோ/u, "tangedco"], [/காவல்|போலீஸ்/u, "police"], [/திடக்கழிவு|குப்பை/u, "solid waste management"], [/பொதுப்பணி/u, "pwd"], [/மாசு கட்டுப்பாடு/u, "pollution control board"]];
export function deptCode(said: string, depts: { code: string; name: string }[]): { code: string; name: string } | null {
  let s = said.trim();
  for (const [re, en] of TA_DEPT) if (re.test(s)) { s = en; break; }
  const n = { depts: new Map(depts.map((x) => [x.code, { name: x.name, head: null, actionOwner: true }])) } as unknown as RefNames;
  const hit = deptFromWords(`${s} department`, n) ?? deptFromWords(s, n);
  const byCode = (code: string) => depts.find((x) => x.code === code) ?? null;
  if (hit) return byCode(hit.code);
  const flat = (x: string) => x.toLowerCase().replace(/\(gcc\)|&/g, " ").replace(/\b(?:the|department|dept|wing|team|office|of|and)\b/g, " ").replace(/s\b/g, "").replace(/\s+/g, " ").trim();
  const want = flat(s);
  if (!want) return null;
  const code = depts.filter((x) => x.code.toLowerCase() === s.toLowerCase() || x.code.toLowerCase().endsWith(`-${s.toLowerCase()}`));
  if (code.length === 1) return code[0];
  const named = depts.filter((x) => { const f = flat(x.name); return f.includes(want) || want.split(" ").every((w) => f.split(" ").includes(w)); });
  return named.length === 1 ? named[0] : null;
}

/** the figures of an answer: what the analyst's sentences may say (the server's fact pack's numbers, read from the answer the browser holds) */
function answerFigures(r: AskResponse): Set<string> {
  const a = r.answer;
  const nums: number[] = [r.total, r.unplaced.length, ...(a?.depts ?? []).map((x) => x.n), ...(a?.facts ?? []).map((f) => f.value)];
  const g = r.glance;
  if (g) nums.push(g.open.n, g.overdue.n, g.severe.n, g.where?.n ?? 0, g.who?.n ?? 0);
  const text = [a?.headline ?? "", a?.meaning ?? "", ...r.trace.map((t) => t.note_en), ...r.rows.slice(0, 5).map((x) => `ward ${x.ward ?? ""}`)].join(" ");
  return allowedSet([...nums, ...figuresIn(text).map((f) => f.value)]);
}
const sentences = (t: string | null | undefined) => (t ?? "").split(/(?<=[.!?।])\s+/).map((x) => x.trim()).filter(Boolean);

// ------------------------------------------------------------------ the operations --

export async function runMapCmd(cmd: MapCmd, d: MapOpsDeps): Promise<MapLine | null> {
  // a tour left by shrinking the map: what it showed goes first (its spotted cases, the reticle), and a stop says it ended
  if (left) {
    const was = left;
    left = null;
    d.map?.()?.setSpot(null);
    d.point?.(null);
    if (cmd.op === "tour" && cmd.tour === "stop") { const mv = tourStep(was, "stop"); return L(mv.say.en, mv.say.ta); }
  }
  // v12: the city views and the camera need no Ask the Map (they are the console's own views and the map's own buttons)
  if (cmd.op === "city") return cityOp(cmd, d);
  if (cmd.op === "zoom" && cmd.zoom) return zoomOp(cmd, d);
  // the dev harness and an old console (no Ask the Map to drive): v9's way, a question asked and nothing said
  if (!d.map?.()) {
    if ((cmd.op === "ask" || cmd.op === "followup" || cmd.op === "circle") && cmd.question && d.askOnMap) { d.askOnMap(cmd.question); return null; }
    return L("I can't do that on the map here.", "இங்கே வரைபடத்தில் அதைச் செய்ய முடியாது.");
  }
  switch (cmd.op) {
    case "ask": return ask(cmd.question ?? null, d);
    case "followup": {
      if (!answerOf(d)) return NO_ANSWER();
      return ask(cmd.question ?? null, d);
    }
    case "circle": return circle(cmd, d);
    case "chip": return chip(cmd, d);
    case "layer": return layer(cmd, d);
    case "shot": return shot(cmd, d);
    case "export": return exportIt(cmd, d);
    case "save": return save(cmd, d);
    case "visit": return visit(cmd, d);
    case "insight": return insight(d);
    case "send": return send(cmd, d);
    case "suggest": return suggest(cmd, d);
    case "rain": return rain(cmd, d);
    case "tour": return tourOp(cmd, d);
    // (a city op is run above, before the Ask the Map check; a zoom to a place may ask the map)
    case "zoom": return zoomOp(cmd, d);
  }
  return null;
}

// ------------------------------------------------------------------ v12: the city and the camera --

const MONTH_TA = ["ஜனவரி", "பிப்ரவரி", "மார்ச்", "ஏப்ரல்", "மே", "ஜூன்", "ஜூலை", "ஆகஸ்ட்", "செப்டம்பர்", "அக்டோபர்", "நவம்பர்", "டிசம்பர்"];
const rainDayTa = (id: string) => { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(id); return m ? `${Number(m[3])} ${MONTH_TA[Number(m[2]) - 1]} ${m[1]}` : id; };

/**
 * v12 (21 Nov): the city on the ground, opened on the map. Live traffic: the view on the most congested stretch (lib/city/pick.ts worstJam:
 * a jam's level, then its delay, then its length; never an accident or water first) or on the trouble spot that keeps coming back, the HUD's
 * reticle on it, and code's own line for it. The flooded streets: Rain & flooding on the rain asked for (the last heavy rain with reports, as
 * the view opens it, or a day), said with that rain's date and its reports. Power and trains: their Rain tabs.
 */
async function cityOp(cmd: MapCmd, d: MapOpsDeps): Promise<MapLine | null> {
  const topic = cmd.topic ?? "all";
  if (topic === "flood" || topic === "rain") return cmd.rain ? cityRain(cmd.rain, d) : rain({ op: "rain", act: "open", tab: "flooding" }, d);
  if (topic === "power" || topic === "metro") return rain({ op: "rain", act: "open", tab: topic }, d);
  // v14 (21 Nov review 13, routing 10): "hide the live traffic": the view put away, and said so
  if (cmd.act === "close") {
    const was = !!d.traffic?.current?.();
    d.traffic?.close?.();
    return was ? L(VIEW_CLOSED.traffic.en, VIEW_CLOSED.traffic.ta) : L("Live traffic isn't open.", "நேரடி போக்குவரத்து திறந்திருக்கவில்லை.");
  }
  return cityTraffic(cmd, d);
}

async function cityTraffic(cmd: MapCmd, d: MapOpsDeps): Promise<MapLine | null> {
  const focus = cmd.focus ?? null;
  // v14 (21 Nov review 13, routing 0): the zone asked about: its own jams and trouble spots, the view on its filter (Adyar's question named
  // Teynampet's jam: worstJam read the whole district)
  const zone = cmd.zone ?? null;
  const shown = (s: Partial<CityLast> = {}): CityLast => ({ topic: "traffic", focus, rain: null, spot: null, lat: null, lon: null, ...(zone ? { zone } : {}), ...s });
  const said = (en: string, ta: string, s: Partial<CityLast> = {}): MapLine => ({ ...L(en, ta), shown: shown(s) });
  let t: TrafficNow | null = null;
  try {
    const res = await (d.fetch ?? fetch)("/api/traffic", { cache: "no-store", signal: d.signal });
    const j = res.ok ? await res.json() : null;
    t = j && Array.isArray(j.spots) ? (j as TrafficNow) : null;
  } catch { t = null; }
  // v12: a newer sentence came while live traffic was read: nothing opens, nothing is said for this one
  if (d.signal?.aborted) return null;
  // v13 (21 Nov review, finding 1 7): the view already open on what is asked (the same spot, the same trouble spot, or the plain view) is not
  // opened afresh (a new seq remounted it, losing its spot and tab): Jarvis's Stage goes out of the way and the spot's line is said again
  const open = (o: Parameters<NonNullable<MapOpsDeps["traffic"]>["open"]>[0]) => {
    const cur = d.traffic?.current?.() ?? null;
    const same = !!cur && (cur.spot ?? null) === (o.spot ?? null) && (cur.cluster ?? null) === (o.cluster ?? null) && (cur.tab ?? null) === (o.tab ?? null)
      && (cur.zone ?? null) === (zone ?? null);
    if (same) d.clearStage?.(); else d.traffic?.open({ ...o, ...(zone ? { zone } : {}) });
  };
  // the reticle goes on the spot once the map under it is drawn (the view opens the Overview; its map may still be mounting)
  const pointAt = async (p: { label: string; lat: number; lon: number }) => { await d.mapReady?.(); if (!d.signal?.aborted) d.point?.(p); };
  if (!t || !t.enabled) {
    // the view says itself why it has nothing (TomTom's key, or the read failed); Jarvis says so too
    open({ tab: focus === "repeat" ? "repeat" : null });
    return t ? said(TRAFFIC_OFF.en, TRAFFIC_OFF.ta) : said("Live traffic is open on the map, but its data could not be read just now.", "நேரடி போக்குவரத்து வரைபடத்தில் திறந்தது; ஆனால் அதன் தரவை இப்போது படிக்க முடியவில்லை.");
  }
  // (v14, routing 0: the zone's name as the data or the console writes it)
  const zn = zone != null ? t.zones?.find((z) => z.zone === zone)?.name ?? ZONE_NAMES[zone - 1] ?? `Zone ${zone}` : null;
  const tz = inZone(t, zone);
  // v13 (finding 1 7): the spot the last answer was on ("show me in the map" after it), found again in this read; else the pick as before
  const was = cmd.spot ?? null;
  if (focus === "repeat") {
    const c = (was ? nearOf(tz.clusters ?? [], was.id, was) : null) ?? topRepeat(tz);
    open({ cluster: c?.id ?? null, tab: "repeat", lat: c?.lat ?? null, lon: c?.lon ?? null });
    if (!c) { const n = zn ? noRepeatIn(zn) : NO_REPEAT; return said(n.en, n.ta); }
    await pointAt({ label: c.name, lat: c.lat, lon: c.lon });
    if (d.signal?.aborted) return null;
    return said(clusterLine(c, "en"), clusterLine(c, "ta"), { spot: c.id, lat: c.lat, lon: c.lon });
  }
  if (focus === "worst-jam") {
    const s = (was ? spotNear(tz, was.id, was) : null) ?? worstJam(tz);
    open({ spot: s?.id ?? null, lat: s?.lat ?? null, lon: s?.lon ?? null });
    if (!s) { const n = zn ? noJamIn(zn) : NO_JAM; return said(n.en, n.ta); }
    await pointAt({ label: s.name, lat: s.lat, lon: s.lon });
    if (d.signal?.aborted) return null;
    // (v14, scenarios 7: the jam picked is what the next "show me in the map" finds again)
    return said(spotLine(s, "en"), spotLine(s, "ta"), { spot: s.id, lat: s.lat, lon: s.lon });
  }
  open({});
  if (zn) {
    // v14 (routing 0 and 5): one zone's live traffic, counted from its own stretches
    const very = tz.spots.filter((s) => s.level === "very").length, cong = tz.spots.filter((s) => s.level === "congested").length;
    const wet = tz.spots.filter((s) => s.level === "flood").length;
    return said(`Live traffic in ${zn} is on the map: ${very} very congested, ${cong} congested${wet ? `, ${wet} with water on the road` : ""}. Say zoom to the worst jam.`,
      `${zn} நேரடி போக்குவரத்து வரைபடத்தில்: ${very} இடங்களில் கடும் நெரிசல், ${cong} இடங்களில் நெரிசல்${wet ? `, ${wet} சாலைகளில் தண்ணீர்` : ""}.`);
  }
  const c = t.counts;
  return said(`Live traffic is on the map: ${c.very} very congested, ${c.congested} congested${c.flooded ? `, ${c.flooded} with water on the road` : ""}${c.clusters ? `; ${c.clusters} trouble ${c.clusters === 1 ? "spot keeps" : "spots keep"} coming back` : ""}. Say zoom to the worst jam.`,
    `நேரடி போக்குவரத்து வரைபடத்தில்: ${c.very} இடங்களில் கடும் நெரிசல், ${c.congested} இடங்களில் நெரிசல்${c.flooded ? `, ${c.flooded} சாலைகளில் தண்ணீர்` : ""}.`);
}

/** Rain & flooding on one past rain (the existing rain() path), said with that rain's date and its flooding reports from the record the view reads */
async function cityRain(want: string, d: MapOpsDeps): Promise<MapLine | null> {
  const opened = await rain({ op: "rain", act: "open", tab: "flooding", rain: want }, d);
  if (opened && /no heavy rain on that day/.test(opened.en)) return opened;
  try {
    const res = await (d.fetch ?? fetch)(d.rainsApi?.() ?? "/api/rehearsal/rains", { cache: "no-store", signal: d.signal });
    const j = res.ok ? await res.json() : null;
    if (d.signal?.aborted) return null;
    const rains = (Array.isArray(j?.rains) ? j.rains : []) as { id: string; start: string; reports?: { street?: string | null }[] }[];
    const newest = [...rains].filter((r) => typeof r?.start === "string").sort((a, b) => b.start.localeCompare(a.start));
    const r = want === "latest" ? newest.find((x) => (x.reports?.length ?? 0) > 0) : newest.find((x) => x.id === want);
    if (!r) return opened;
    const n = r.reports?.length ?? 0;
    const streets = new Set((r.reports ?? []).map((x) => x.street).filter(Boolean)).size;
    const day = rainDay(r.start.slice(0, 10)), dayTa = rainDayTa(r.start.slice(0, 10));
    return L(`${want === "latest" ? "The last heavy rain" : "The heavy rain"}, ${day}, is on the map: ${n} flooding ${n === 1 ? "report" : "reports"}${streets ? ` on ${streets} ${streets === 1 ? "street" : "streets"}` : ""}.`,
      `${want === "latest" ? "கடந்த கனமழை" : "அந்தக் கனமழை"}, ${dayTa}, வரைபடத்தில்: ${n} வெள்ளப் புகார்கள்${streets ? `, ${streets} தெருக்களில்` : ""}.`);
  } catch { return d.signal?.aborted ? null : opened; }
}

/** v12: the map's camera: in or out (its own buttons), or to a zone or taluk the console places; anything else is asked of the map */
async function zoomOp(cmd: MapCmd, d: MapOpsDeps): Promise<MapLine | null> {
  d.toOverview?.();
  await d.settled?.().catch(() => undefined);
  // v12 (understanding RC13): the camera moves once the map is drawn (the Overview may only just have opened); a newer sentence ends it here
  await d.mapReady?.();
  if (d.signal?.aborted) return null;
  if (cmd.zoom) {
    if (!d.camera?.zoom(cmd.zoom)) return NO_MAP();
    return cmd.zoom === "in" ? L("Zoomed in.", "பெரிதாக்கினேன்.") : L("Zoomed out.", "சிறிதாக்கினேன்.");
  }
  const name = cmd.place ?? "";
  if (!name) return null;
  const p = d.place?.(name) ?? null;
  if (p && d.camera?.flyTo({ label: name, ...p })) return L(`${name} on the map.`, `${name} வரைபடத்தில்.`);
  return ask(`what is happening in ${name}`, d);
}

async function ask(q: string | null, d: MapOpsDeps, lead: MapLine | null = null): Promise<MapLine | null> {
  const m = await grow(d);
  if (!m) return NO_MAP();
  if (!q) return L("Ask the Map is open. What would you like to know?", "வரைபடம் திறந்துள்ளது. என்ன தெரிய வேண்டும்?");
  // v12 (RC5): asked with the turn's stop; a question a newer sentence stopped says nothing
  const r = await askQ(m, q, d);
  if (d.signal?.aborted) return null;
  return answered(r, d, lead);
}

async function circle(cmd: MapCmd, d: MapOpsDeps): Promise<MapLine | null> {
  const said = Math.round((cmd.km ?? 1) * 1000);
  const m = clampM(said);
  let q = cmd.question ?? `what is happening within ${km(m)} of ${cmd.place ?? ""}`;
  // the map's circles go from 50 m to 5 km: a distance past them is said back as the map's own
  if (m !== said) q = q.replace(/\d+(?:\.\d+)?\s*(?:km|m)\b|\d+(?:\.\d+)?\s*(?=கி|மீ)/u, km(m));
  const place = cmd.place ?? "";
  // the radius said back when it was chosen here ("near": by what the place is, research 5.2) or cut to the map's 5 km; a distance said is in
  // the answer's own headline
  const lead = cmd.near ? L(`Within ${km(m)} of ${place}, the usual reach for a place like it. Say wider or closer.`, `${place} இலிருந்து ${km(m, true)} க்குள். பெரிதாக்கு அல்லது சிறிதாக்கு என்று சொல்லுங்கள்.`)
    : m !== said ? L(`The map's circles go up to 5 km, so within ${km(m)} of ${place}.`, `வரைபட வட்டம் 5 கி.மீ வரை மட்டுமே: ${place} இலிருந்து ${km(m, true)} க்குள்.`) : null;
  return ask(q, d, lead);
}

async function chip(cmd: MapCmd, d: MapOpsDeps): Promise<MapLine | null> {
  const m = await grow(d);
  const r = answerOf(d);
  if (!m || !r?.plan) return NO_ANSWER();
  const c = r.chips.find((x) => x.id === cmd.chip);
  if (!c) return L("That part isn't in this answer.", "அந்தப் பகுதி இந்தப் பதிலில் இல்லை.");
  let option = cmd.option ?? null;
  if (cmd.scale) {
    const cur = Number(c.options.find((o) => o.on)?.key ?? NaN);
    if (!Number.isFinite(cur)) return L("This answer has no distance to change.", "இந்தப் பதிலில் மாற்றத் தூரம் இல்லை.");
    const next = clampM(cur * cmd.scale);
    if (next === cur) return cmd.scale > 1 ? L("That's already as wide as the map goes: 5 km.", "இதுவே வரைபடத்தின் அதிகபட்சம்: 5 கி.மீ.") : L("That's already as close as the map goes.", "இதுவே மிக அருகிலானது.");
    option = String(next);
  }
  const p = applyChip(r.plan, c.id, option);
  if (!p) return L("That change doesn't fit this question.", "அந்த மாற்றம் இந்தக் கேள்விக்குப் பொருந்தவில்லை.");
  const o = c.options.find((x) => x.key === option);
  const label = option == null ? `Remove: ${c.en}` : o?.en ?? (cmd.scale ? km(Number(option)) : option);
  const lead = cmd.scale ? L(`Within ${km(Number(option))} now.`, `இப்போது ${km(Number(option), true)} க்குள்.`) : option == null ? L(`Removed ${c.en.replace(/^of /, "")}.`, `${c.ta} நீக்கப்பட்டது.`) : null;
  const r2 = await (d.signal ? m.run(p, label, { signal: d.signal }) : m.run(p, label));
  if (d.signal?.aborted) return null;
  return answered(r2, d, lead);
}

async function layer(cmd: MapCmd, d: MapOpsDeps): Promise<MapLine | null> {
  const m = await grow(d);
  if (!m) return NO_MAP();
  const id = cmd.layer ?? "";
  const on = cmd.on !== false;
  if (id === "satellite" || id === "streets") {
    const rep = bridge(d, "base", { base: id === "streets" ? "streets" : "sat" });
    if (!rep) return NO_MAP();
    return id === "streets" ? L("Streets map.", "தெரு வரைபடம்.") : L("Satellite view.", "செயற்கைக்கோள் படம்.");
  }
  if (id === "heat") {
    const rep = bridge(d, "heat", { on });
    if (!rep) return NO_MAP();
    if (!rep.ok) return L("The heat view needs an answer on the map. Ask a question first.", "வெப்பப் பார்வைக்கு வரைபடத்தில் பதில் தேவை. முதலில் கேள்வி கேளுங்கள்.");
    return on ? L("Heat view on: where the answer is dense.", "வெப்பப் பார்வை: பதில் அடர்த்தியாக உள்ள இடங்கள்.") : L("Heat view off.", "வெப்பப் பார்வை நீக்கப்பட்டது.");
  }
  const rep = bridge(d, "layer", { id, on });
  if (!rep) return NO_MAP();
  if (!rep.ok) return L("The map has no layer by that name.", "அந்தப் பெயரில் அடுக்கு இல்லை.");
  const [en, ta] = LAYER_NAME[id] ?? [id, id];
  return on ? L(`${en} on the map.`, `${ta} வரைபடத்தில்.`) : L(`${en} off the map.`, `${ta} வரைபடத்திலிருந்து நீக்கப்பட்டது.`);
}

async function shot(cmd: MapCmd, d: MapOpsDeps): Promise<MapLine | null> {
  const m = await grow(d);
  const r = m?.resp ?? null;
  if (!m || !r || !r.shots?.length || r.kind === "say" || r.kind === "ui") return NO_ANSWER();
  const n = r.shots.length, i = Math.min(m.cue?.index ?? 0, n - 1);
  if (cmd.shot === "next" && i + 1 >= n) return L(n === 1 ? "This answer has one view; say replay to see it again." : "That's the last view of this answer.", "இதுவே இந்தப் பதிலின் கடைசிக் காட்சி.");
  if (cmd.shot === "previous" && i === 0) return L("This is the first view.", "இதுவே முதல் காட்சி.");
  const j = cmd.shot === "next" ? i + 1 : cmd.shot === "previous" ? i - 1 : 0;
  m.setFocus(null);
  m.replay(j);
  // a hotspot's tour: its cases spotted, as the panel's tour buttons do
  const cl = r.camera?.shape === "hotspot" && j >= 1 ? r.extra?.clusters?.[j - 1] : null;
  const cap1 = r.shots[j]?.caption_en || r.camera?.tour?.[j - 1]?.caption_en || "", capTa = r.shots[j]?.caption_ta || r.camera?.tour?.[j - 1]?.caption_ta || cap1;
  m.setSpot(cl ? { ids: cl.ids, label: cap1 } : null);
  if (cap1) return L(`${cap1}.`.replace(/\.\.$/, "."), `${capTa}.`.replace(/\.\.$/, "."));
  return j === 0 ? L("Back to the answer's view.", "பதிலின் காட்சிக்குத் திரும்பியது.") : L(`View ${j + 1} of ${n}.`, `காட்சி ${j + 1} / ${n}.`);
}

async function exportIt(cmd: MapCmd, d: MapOpsDeps): Promise<MapLine | null> {
  const m = await grow(d);
  const r = answerOf(d);
  if (!r) return NO_ANSWER();
  if (!r.total) return L("This answer has no rows to export.", "இந்தப் பதிலில் பதிவிறக்க வரிசைகள் இல்லை.");
  if (!cmd.format) {
    const rep = bridge(d, "exportSheet");
    if (rep?.ok) return L("The Export sheet is open: CSV for a spreadsheet, or GeoJSON for GIS. It asks for your password before the file is made.",
      "பதிவிறக்கத் தாள் திறந்துள்ளது: CSV அல்லது GeoJSON. கோப்பு உருவாகும் முன் உங்கள் கடவுச்சொல் கேட்கப்படும்.");
    return L("Say CSV or GeoJSON.", "CSV அல்லது GeoJSON என்று சொல்லுங்கள்.");
  }
  try {
    // the server asks "Confirm it's you" (the password or an emailed code) before it makes the file: that is the Collector's own yes
    const msg = await (d.download ?? downloadAnswer)(r, cmd.format, questionOf(m, r));
    const rows = /: ([\d,]+) rows/.exec(msg)?.[1] ?? null;
    const f = cmd.format === "csv" ? "CSV" : "GeoJSON";
    return rows ? L(`Exported ${rows} rows as ${f}.`, `${rows} வரிசைகள் ${f} ஆகப் பதிவிறக்கப்பட்டன.`) : L(`Exported as ${f}.`, `${f} ஆகப் பதிவிறக்கப்பட்டது.`);
  } catch (e) {
    return L(`Not exported: ${(e as Error).message}`, "பதிவிறக்க முடியவில்லை.");
  }
}

async function save(cmd: MapCmd, d: MapOpsDeps): Promise<MapLine | null> {
  const m = await grow(d);
  const r = answerOf(d);
  if (!r) return NO_ANSWER();
  const name = cmd.name ?? questionOf(m, r);
  const act = async (): Promise<MapLine | null> => {
    try {
      const msg = await (d.save ?? saveView)(r, "collector", name);
      return L(msg, "workspace ஆகச் சேமிக்கப்பட்டது. திறக்கும்போது புதிய தரவில் மீண்டும் இயங்கும்.");
    } catch (e) { return L(`Not saved: ${(e as Error).message}`, "சேமிக்க முடியவில்லை."); }
  };
  // saving keeps something: the Collector's spoken yes or tap first (level B), as Jarvis's other saves
  const q = { en: `Save this map view as a workspace${cmd.name ? ` called ${cmd.name}` : ""}? It re-runs on fresh data when opened.`, ta: "இந்த வரைபடப் பார்வையை workspace ஆகச் சேமிக்கவா?" };
  if (!d.askYes) return L("Saving needs your yes: tap Save view on the answer.", "சேமிக்க உங்கள் ஒப்புதல் தேவை: பதிலின் கீழ் உள்ள Save view ஐத் தட்டுங்கள்.");
  d.askYes(q, act);
  return null;
}

async function visit(cmd: MapCmd, d: MapOpsDeps): Promise<MapLine | null> {
  const m = await grow(d);
  if (!m) return NO_MAP();
  const r = cmd.question ? await askQ(m, cmd.question, d) : answerOf(d);
  if (d.signal?.aborted) return null;
  if (!r) return cmd.question ? answered(null, d) ?? NO_ANSWER() : NO_ANSWER();
  if (r.kind !== "answer") return answered(r, d);
  const live = d.map?.() ?? m;
  const route = planVisits(r, live.setRoute);
  const when = cmd.when ?? null;
  if (!route) return L(`No open case in this answer has an exact place to visit${cmd.question ? ` (${answerGist(r, "en").replace(/ · /g, ", ")})` : ""}.`, "இந்தப் பதிலில் துல்லிய இடமுள்ள திறந்த சம்பவம் இல்லை.");
  const first = r.rows.find((x) => x.id === route.stops[0].id);
  const where = first?.place ?? (first?.ward != null ? `Ward ${first.ward}` : null);
  const k = route.stops.length;
  return L(`Visit order${when ? ` for ${when.en}` : ""}: ${k} ${k === 1 ? "stop" : "stops"}, ${km(route.total_m)} in straight lines${where ? `, starting near ${where}` : ""}. Open in Google Maps is on the card; I won't send it anywhere without your yes.`,
    `${when ? `${when.ta} ` : ""}வருகை வரிசை: ${k} இடங்கள், நேர்கோட்டில் ${km(route.total_m, true)}${where ? `, ${where} அருகே தொடங்கி` : ""}. Google Maps இணைப்பு அட்டையில் உள்ளது; உங்கள் ஒப்புதல் இன்றி எங்கும் அனுப்ப மாட்டேன்.`);
}

async function insight(d: MapOpsDeps): Promise<MapLine | null> {
  const r = answerOf(d);
  if (!r) return NO_ANSWER();
  if (!r.total) return L("Nothing to analyse: this answer is empty.", "ஆய்வு செய்ய எதுவும் இல்லை: பதில் காலியாக உள்ளது.");
  let j: { summary?: string; actions?: { text: string; dept: string | null }[]; watch?: string | null; none?: boolean; reason?: string; error?: string } | null = null;
  try {
    const res = await (d.fetch ?? fetch)("/api/map/insight", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: r.plan }), signal: d.signal });
    j = await res.json().catch(() => null);
    if (d.signal?.aborted) return null;
    if (!res.ok) return L(`The analyst couldn't look: ${j?.error ?? "the server said no"}.`, "ஆய்வாளரால் இப்போது பார்க்க முடியவில்லை.");
  } catch { return d.signal?.aborted ? null : L("The analyst couldn't be reached.", "ஆய்வாளரை அணுக முடியவில்லை."); }
  if (!j || j.none) return j?.reason === "ai" ? L("The AI analyst isn't answering right now.", "AI ஆய்வாளர் இப்போது பதில் தரவில்லை.") : L("Nothing stands out beyond the answer itself.", "பதிலைத் தாண்டி தனித்து எதுவும் இல்லை.");
  // its own words, kept only where every number is the answer's (the server checked them against its facts; this checks them again here)
  const allowed = answerFigures(r);
  const ok = (s: string) => gateChunk(s, allowed).ok;
  const summary = sentences(j.summary).filter(ok);
  const acts = (j.actions ?? []).map((a) => a.text).filter((t) => t && ok(t));
  const watch = sentences(j.watch).filter(ok);
  if (!summary.length && !acts.length) return L("Nothing stands out beyond the answer itself.", "பதிலைத் தாண்டி தனித்து எதுவும் இல்லை.");
  const g = r.glance;
  d.show?.({ id: "map-insight", title: "What stands out", takeaway: [...summary, ...acts.map((a) => `• ${a}`), ...watch.map((w) => `Watch: ${w}`)].join("\n"),
    figures: [{ label: "Cases", value: r.total, unit: null }, ...(g ? [{ label: "Still open", value: g.open.n, unit: null }, { label: "Past deadline", value: g.overdue.n, unit: null }] : [])], source: "Ask the Map · AI analyst" });
  const en = [...summary, ...(acts[0] ? [`First: ${acts[0]}`] : [])].join(" ");
  return { en, ta: `AI ஆய்வாளர்: ${en}`, allowed };
}

async function send(cmd: MapCmd, d: MapOpsDeps): Promise<MapLine | null> {
  const m = await grow(d);
  const r = answerOf(d);
  if (!m || !r) return NO_ANSWER();
  const dept = cmd.dept ? deptCode(cmd.dept, d.depts?.() ?? []) : null;
  if (cmd.dept && !dept) {
    const some = (d.depts?.() ?? []).slice(0, 3).map((x) => x.name).join(", ");
    return L(`I don't know a department called ${cmd.dept}.${some ? ` For example: ${some}.` : ""}`, `${cmd.dept} என்ற துறை தெரியவில்லை.`);
  }
  // drafts only: the dialog opens with one email per department; Approve, and the password after it, are the Collector's own
  const rep = bridge(d, "send", { dept: dept?.code ?? null });
  if (!rep) return NO_MAP();
  if (!rep.ok) {
    if (rep.why === "role") return L("Only the Collector's console sends to departments.", "ஆட்சியரின் கன்சோல் மட்டுமே துறைகளுக்கு அனுப்பும்.");
    if (rep.why === "empty") return L("This answer has no cases to send.", "இந்தப் பதிலில் அனுப்பச் சம்பவங்கள் இல்லை.");
    return NO_ANSWER();
  }
  const open = r.glance?.open.n ?? r.total;
  return L(`Drafts are open${dept ? ` for ${dept.name}` : ", one per department"}, from the ${open} open ${open === 1 ? "case" : "cases"} in this answer. Nothing is sent until you press Approve and confirm it's you.`,
    `${dept ? `${dept.name} க்கான ` : ""}வரைவுகள் திறந்துள்ளன, இந்தப் பதிலின் ${open} திறந்த சம்பவங்களிலிருந்து. நீங்கள் Approve அழுத்தி உறுதிசெய்யும் வரை எதுவும் அனுப்பப்படாது.`);
}

async function suggest(cmd: MapCmd, d: MapOpsDeps): Promise<MapLine | null> {
  if (cmd.n) {
    const q = cmd.question ?? readOut?.list[cmd.n - 1] ?? null;
    if (!q) return L("I haven't read any questions out yet. Say: what can I ask the map?", "இன்னும் கேள்விகளைப் படிக்கவில்லை.");
    return ask(q, d);
  }
  const m = await grow(d);
  if (!m) return NO_MAP();
  let list = m.resp?.followups?.length ? m.resp.followups : [];
  if (!list.length) {
    try {
      const res = await (d.fetch ?? fetch)("/api/map/suggest", { signal: d.signal });
      const j = res.ok ? await res.json() : null;
      list = Array.isArray(j?.items) ? j.items : [];
    } catch { list = []; }
    if (d.signal?.aborted) return null;
  }
  if (!list.length) return L("Ask about any place, distance, road or area, for example: garbage near schools.", "எந்த இடம், தூரம், சாலை அல்லது பகுதி பற்றியும் கேளுங்கள்.");
  const four = list.slice(0, 4);
  readOut = { list: four, resp: d.map?.()?.resp ?? null };
  bridge(d, "tray", { open: true });
  d.show?.({ id: "map-suggest", title: "You could ask the map", takeaway: four.map((q, i) => `${i + 1}. ${q}`).join("\n"), figures: [], source: "Ask the Map" });
  const three = four.slice(0, 3);
  return L(`You could ask: ${three.map((q, i) => `${i + 1}, ${q}`).join("; ")}. Say ask the second one.`, `இவற்றைக் கேட்கலாம்: ${three.map((q, i) => `${i + 1}, ${q}`).join("; ")}. இரண்டாவதைக் கேள் என்று சொல்லுங்கள்.`);
}

async function rain(cmd: MapCmd, d: MapOpsDeps): Promise<MapLine | null> {
  const r = d.rain ?? {};
  if (cmd.act === "close") { r.close?.(); return L("Closed Rain and flooding.", "மழை & வெள்ளம் மூடப்பட்டது."); }
  if (cmd.act === "back") { if (r.back?.()) return L("Back.", "பின்னால்."); r.close?.(); return L("Closed Rain and flooding.", "மழை & வெள்ளம் மூடப்பட்டது."); }
  const tab = cmd.tab ?? null;
  const [tEn, tTa] = TAB_NAME[tab ?? "flooding"];
  if (r.isOpen?.()) {
    // v13 (21 Nov review, finding 1 6): Rain & flooding already open moves to its tab or rain with Jarvis's Stage out of the way, as every
    // other open does (it said "The flooding tab." with the Stage still over the map)
    d.clearStage?.();
    const rep = bridge(d, "rain", { ...(tab ? { tab } : {}), ...(cmd.rain ? { rain: cmd.rain } : {}) });
    if (rep && !rep.ok && rep.why === "no-such-rain") {
      const days = ((rep.state?.rains as string[] | undefined) ?? []).slice(0, 3).map((x) => rainDay(`rain-${x}`)).join(", ");
      return L(`There's no heavy rain on that day in the record.${days ? ` The last ones: ${days}.` : ""}`, "அந்த நாளில் கனமழை பதிவில் இல்லை.");
    }
    if (rep?.ok && cmd.rain) return L(`Showing the rain of ${rainDay(String(rep.state?.rain ?? cmd.rain))}.`, `${rainDay(String(rep.state?.rain ?? cmd.rain))} மழை காட்டப்படுகிறது.`);
    if (rep?.ok) return L(`The ${tEn} tab.`, `${tTa} பகுதி.`);
  }
  if (cmd.rain || (tab && tab !== "flooding")) {
    d.rehearsal?.({ replay: cmd.rain && cmd.rain !== "latest" ? cmd.rain : null, manual: false, ...(cmd.rain === "latest" ? { stop: "check" as const } : {}), ...(tab && tab !== "flooding" ? { lens: tab } : {}) });
  } else r.open?.();
  if (cmd.rain) return L(cmd.rain === "latest" ? "Rain and flooding is open on the last rain." : `Rain and flooding is open on the rain of ${rainDay(cmd.rain)}.`, "மழை & வெள்ளம் திறந்தது.");
  return L(`Rain and flooding is open on the ${tEn} tab.`, `மழை & வெள்ளம் ${tTa} பகுதியில் திறந்தது.`);
}

// ------------------------------------------------------------------ the tour --

/** the camera to a stop: its shot (the hotspot answer's tour, 1 to 3), else its first case at street level; its cases spotted; the reticle on it */
function fly(stop: TourStop, d: MapOpsDeps) {
  const m = d.map?.();
  if (!m) return;
  m.setFocus(null);
  if (stop.shot != null) m.replay(stop.shot);
  else if (stop.ids[0]) m.setFocus(stop.ids[0]);
  m.setSpot({ ids: stop.ids, label: stop.place.en });
  d.point?.({ label: stop.name ?? stop.place.en, lat: stop.lat, lon: stop.lon });
}
/** the tour's answer back on the map (after "go deeper here" asked about a stop) */
async function backToTour(d: MapOpsDeps) {
  const m = d.map?.();
  if (!m || !tour || m.resp === tour.resp) return;
  const t = m.turns?.find((x) => x.resp === tour!.resp);
  if (t) { m.restore(t.id); return; }
  if (tour.resp.plan) { const r = await m.run(tour.resp.plan, tour.s.question); if (r && tour) tour = { ...tour, resp: r }; }
}
function endTour(d: MapOpsDeps) {
  tour = null;
  d.map?.()?.setSpot(null);
  d.point?.(null);
}

async function tourOp(cmd: MapCmd, d: MapOpsDeps): Promise<MapLine | null> {
  const ev = cmd.tour ?? "start";
  if (ev === "start") {
    const m = await grow(d);
    if (!m) return NO_MAP();
    endTour(d);
    const source = cmd.source ?? "hotspots";
    let got: { r: AskResponse; q: string; window: { en: string; ta: string } } | null = null;
    for (const t of TOUR_Q[source]) {
      const r = await askQ(m, t.q, d);
      // v12 (RC5): a newer sentence ends the tour before it starts
      if (d.signal?.aborted) return null;
      if (r?.kind === "answer" && (r.extra?.clusters?.length ?? 0) >= 1) got = { r, q: t.q, window: t.window };
      if ((r?.extra?.clusters?.length ?? 0) >= 2) break;
    }
    const s = got ? startTour(got.r, source, got.q, got.window, !!cmd.full) : null;
    if (!got || !s) return L("Nothing clusters enough for a tour today or this week.", "இன்றோ இந்த வாரமோ சுற்றிப் பார்க்கும் அளவு குவிந்த இடங்கள் இல்லை.");
    const mv = firstMove(s);
    tour = { s: mv.s, resp: got.r };
    fly(mv.stop!, d);
    d.show?.({ id: "map-tour", title: s.source === "news" ? "Tour: the places in the news" : s.source === "flood" ? "Tour: flooding" : "Tour: today's hotspots",
      takeaway: s.stops.map((x, i) => `${i + 1}. ${cap(x.place.en)}: ${x.n}`).join("\n"), figures: [{ label: "Stops", value: s.stops.length, unit: null }], source: "Ask the Map" });
    return L(mv.say.en, mv.say.ta);
  }
  if (!tour || tour.s.phase !== "running") {
    return ev === "stop" ? L("No tour is running.", "சுற்றுலா எதுவும் நடக்கவில்லை.")
      : L("No tour is running. Say: take me round the district.", "சுற்றுலா எதுவும் நடக்கவில்லை. மாவட்டத்தைச் சுற்றிக் காட்டு என்று சொல்லுங்கள்.");
  }
  // stop ends the tour wherever the console is, without growing the map again (v10 review 2, finding 14)
  if (ev === "stop") {
    const mv = tourStep(tour.s, "stop");
    endTour(d);
    return L(mv.say.en, mv.say.ta);
  }
  if (ev === "deeper") {
    const mv = tourStep(tour.s, "deeper");
    tour = { ...tour, s: mv.s };
    const st = mv.stop!;
    const m = await grow(d);
    if (!m) return NO_MAP();
    // Ask the Map scoped to the stop: what is happening within 500 m of it (the circle's area brief)
    const r = await (d.signal ? m.draw({ lat: st.lat, lon: st.lon, r: 500 }, { signal: d.signal }) : m.draw({ lat: st.lat, lon: st.lon, r: 500 }));
    if (d.signal?.aborted) return null;
    const line = r?.kind === "brief" && r.brief ? briefLine(r, { en: `${cap(st.place.en)}, within 500 m`, ta: `${st.place.ta}, 500 மீ க்குள்` }) : answered(r, d);
    const more = L("Say next to go on with the tour.", "சுற்றுலாவைத் தொடர அடுத்து என்று சொல்லுங்கள்.");
    return line ? L(`${line.en} ${more.en}`, `${line.ta} ${more.ta}`) : more;
  }
  await grow(d);
  await backToTour(d);
  const mv = tourStep(tour.s, ev);
  if (mv.end) { endTour(d); return L(mv.say.en, mv.say.ta); }
  tour = { ...tour, s: mv.s };
  if (mv.stop) fly(mv.stop, d);
  return L(mv.say.en, mv.say.ta);
}
